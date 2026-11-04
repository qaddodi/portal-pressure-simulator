// Browser checks 4 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "presenter: tiles under a chart keep their words whole and their change lines short at ${size.width}x${size.height}" to "presenter: a ladder card too tall for its room folds whole, its readings inside it, never at 100% text, and a live text size lays out as a fresh load".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ CHART_TEXT_SIZES, LADDER_SIZES, barSettle, browser, cardGap, check, checkCharts, checkLadderBrackets, checkStrip, device, fastContext, gotoSlide, instantMotionOn, open, quiet, readFileSync, readdirSync, server, svCovered }) {
  // Tiles under a slide's chart (desktop and iPad, text at 100 %): a tile's name never breaks inside a word, no tile text sticks
  // out of its tile, a change line ("▲ 7.9 from 16.9") takes at most two lines, and the card fits the screen. Three, four
  // and two tiles under the day-by-day, Doppler and bleed charts, at three laptop sizes (a 16-inch Mac first) and an iPad both ways.
  if (device === 'desktop') for (const size of [{ width: 1728, height: 1000 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }]) await check(device, `presenter: tiles under a chart keep their words whole and their change lines short at ${size.width}x${size.height}`, async (page) => {
    await page.setViewportSize(size);
    await open(page);
    for (const [deck, at] of [['ascites', 3], ['varices', 2], ['shunts', 4], ['variceal-bleed', 2]]) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, at]);
      await page.waitForFunction((i) => window.pps.presenter.probe()?.i === i && !document.querySelector('.pz-cover') && document.querySelector('.pz-data.has-tool:not(.pz-hide) .pzt-d'), at, { timeout: 60000 });
      await page.waitForFunction(() => !window.pps.presenter.probe().playing, null, { timeout: 120000, polling: 500 });
      await page.waitForTimeout(1200);
      const bad = await page.evaluate(() => {
        const out = [], card = document.querySelector('.pz-data.has-tool:not(.pz-hide)'), c = card.getBoundingClientRect();
        const rows = (g) => new Set([...g.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top))).size;
        for (const k of card.querySelectorAll('.pzt-k')) for (const t of k.childNodes) if (t.nodeType === 3) for (const m of t.textContent.matchAll(/\S+/g)) {
          const g = document.createRange(); g.setStart(t, m.index); g.setEnd(t, m.index + m[0].length);
          if (rows(g) > 1) out.push(`"${m[0]}" breaks inside the word`);
        }
        for (const e of card.querySelectorAll('.pzt-k, .pzt-vu, .pzt-r, .pzt-d')) if (e.scrollWidth > e.clientWidth + 1) out.push(`"${e.textContent}" sticks out of its tile`);
        for (const d of card.querySelectorAll('.pzt-d')) { const g = document.createRange(); g.selectNodeContents(d); if (rows(g) > 2) out.push(`change "${d.textContent}" takes ${rows(g)} lines`); }
        if (c.top < 0 || c.bottom > innerHeight) out.push(`card runs off the screen (${Math.round(c.top)} to ${Math.round(c.bottom)} of ${innerHeight})`);
        return out;
      });
      if (bad.length) throw new Error(`${deck} slide ${at + 1} at ${size.width}x${size.height}: ${bad.join('; ')}`);
    }
  });

  // An upright iPad (820x1180): on every slide of the decks that open the sinusoid view, its names keep off the cards.
  if (device === 'desktop') for (const deck of ['ascites', 'lobule']) await check(device, `presenter: on every slide of ${deck} at 820x1180 the sinusoid's names keep off the cards`, async (page) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    for (let guard = 0; guard < 80; guard++) {
      const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim());
      await barSettle(page); await page.waitForTimeout(1200);
      const sv = await svCovered(page);
      if (sv) throw new Error(`${deck}, slide ${n}: ${sv}`);
      const [a, b] = n.split('/').map((x) => +x);
      if (a === b) break;
      for (let k = 0; k < 4; k++) {
        await page.keyboard.press('ArrowRight');
        if (await page.waitForFunction((was) => document.querySelector('.pzb-n')?.textContent.trim() !== was, n, { timeout: 15000 }).then(() => true, () => false)) break;
      }
      await page.waitForTimeout(300);
    }
  });

  // Presenter, every slide of every deck that opens the sinusoid view (phone, iPad and desktop sizes): an end arrow (toward the portal
  // venule, toward the central vein) shows only with its name and fades with it; where the name shows, so does the arrow.
  // DOM state, not pixels: the view exposes each arrow's strength (canvas data-end-arrows) and the names' own opacity is read here.
  // (Each deck's sinusoid slides, from its source: the slide's cam. A software renderer takes up to a minute to open the view.)
  const SV_DECKS = new Map(), { DECKS: ALL } = await import(new URL('../../src/ui/decks.js', import.meta.url)), CHECKS = (id) => (ALL.find((d) => d.id === id)?.checks?.length ? 1 : 0);
  for (const f of readdirSync(new URL('../../src/ui/decks/', import.meta.url))) {
    if (!f.endsWith('.js') || !/cam: ['"]sinusoid/.test(readFileSync(new URL(`../../src/ui/decks/${f}`, import.meta.url), 'utf8'))) continue;
    const mod = await import(`../../src/ui/decks/${f}`), d = Object.values(mod).find((v) => Array.isArray(v?.slides));
    if (d) SV_DECKS.set(d.id, { at: d.slides.map((x, i) => (x.cam === 'sinusoid' && !x.visual ? i : -1)).filter((i) => i >= 0), n: d.slides.length });
  }
  if (!SV_DECKS.size) throw new Error('no deck opens the sinusoid view: the end-arrow check has nothing to walk');
  // Presenter, the closing quick check of every deck: every answer starts hidden (no room reserved for it), tapping a question
  // slides only its own answer open, and a second tap closes it again.
  for (const d of ALL.filter((x) => x.checks?.length)) await check(device, `presenter: quick check of ${d.id} starts with every answer hidden; a tap opens its answer and a second tap closes it`, async (page) => {
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), d.id);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    await page.keyboard.press('End');
    await page.waitForSelector('.pz-check .pzc-q', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1500);
    const state = () => page.evaluate(() => {
      const l = document.querySelector('.pz-check');
      return { stuck: l.classList.contains('pzc-all') || l.classList.contains('pzc-still'), answers: [...l.querySelectorAll('.pzc-a')].map((a) => Math.round(a.getBoundingClientRect().height)), expanded: [...l.querySelectorAll('.pzc-q')].map((q) => q.getAttribute('aria-expanded')) };
    });
    const s0 = await state(), n = s0.answers.length;
    if (n !== d.checks.length || s0.stuck || s0.answers.some((h) => h > 0) || s0.expanded.some((e) => e !== 'false')) throw new Error(`${d.id}: the quick check does not start with every answer hidden ${JSON.stringify(s0)}`);
    for (let k = 0; k < n; k++) {
      // (It eases open and shut: tapping starts a running transition of the answer's row, not a jump. The page may draw only a few frames
      // a second here, so the transition is read straight after the tap rather than by sampling heights.)
      // (While it eases, no text on the card may change size and the easing may not be cut short (a refit mid-ease snapped it):
      // every frame records the card's zoom and the type sizes, and any cancelled transition is counted.)
      const eases = (page) => page.evaluate((k) => {
        const l = document.querySelector('.pz-check'), card = l.closest('.pz-panel, .pz-text, .pz-data');
        const a = l.querySelectorAll('.pzc-a')[k];
        const look = () => [card.style.getPropertyValue('--pz-fit') || '1', ...[...card.querySelectorAll('.pz-h, .pzc-t, .pzc-a > p')].map((e) => getComputedStyle(e).fontSize)].join();
        const w = { cut: 0, first: look(), changed: null, done: false };
        window.__pzcWatch = w;
        const cut = () => { w.cut++; };
        l.addEventListener('transitioncancel', cut);
        const tick = () => { const v = look(); if (v !== w.first && !w.changed) w.changed = v; if (l.getAnimations({ subtree: true }).length) requestAnimationFrame(tick); else { w.done = true; l.removeEventListener('transitioncancel', cut); } };
        l.querySelectorAll('.pzc-q')[k].click(); a.getBoundingClientRect();
        requestAnimationFrame(tick);
        return a.getAnimations().filter((x) => x.transitionProperty === 'grid-template-rows' && x.effect.getTiming().duration >= 200).length;
      }, k);
      const steady = async (what) => {
        await page.waitForFunction(() => window.__pzcWatch?.done, null, { timeout: 20000 });
        const w = await page.evaluate(() => window.__pzcWatch);
        if (w.cut) throw new Error(`${d.id}: question ${k + 1}'s answer was cut short while easing ${what} (${w.cut} transitions cancelled)`);
        if (w.changed) throw new Error(`${d.id}: the card's text changed size while question ${k + 1}'s answer eased ${what} (${w.first} became ${w.changed})`);
      };
      if (!await eases(page)) throw new Error(`${d.id}: question ${k + 1}'s answer does not ease open`);
      // (A slow page draws few frames: wait for the transition to finish, not a fixed time.)
      await steady('open');
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !document.querySelector('.pz-check').getAnimations({ subtree: true }).length, null, { timeout: 20000 });
      const on = await state();
      if (!(on.answers[k] > 0) || on.answers.some((h, j) => j !== k && h > 0) || on.expanded[k] !== 'true') throw new Error(`${d.id}: question ${k + 1} does not open only its own answer ${JSON.stringify(on)}`);
      if (!await eases(page)) throw new Error(`${d.id}: question ${k + 1}'s answer does not ease shut`);
      // (A slow page draws few frames: wait for the transition to finish, not a fixed time.)
      await steady('shut');
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !document.querySelector('.pz-check').getAnimations({ subtree: true }).length, null, { timeout: 20000 });
      const off = await state();
      if (off.answers.some((h) => h > 0) || off.expanded.some((e) => e !== 'false')) throw new Error(`${d.id}: question ${k + 1} does not close again ${JSON.stringify(off)}`);
    }
  });
  const endArrows = () => {
    const c = document.querySelector('.sv.on .sv-canvas');
    if (!c || !c.dataset.endArrows) return null;
    const a = c.dataset.endArrows.split(' ').map(Number), names = [...document.querySelectorAll('.sv.on .sv-end')];
    if (names.length !== 2) return `${names.length} end names`;
    // (Names drawn by the GPU, caption-gl.js: how much each shows is the GPU's, with its layer's fade and its words' own strength.)
    const gpuA = c.dataset.endNames ? c.dataset.endNames.split(' ').map(Number) : null, lab = document.querySelector('.sv.on .lz-labels');
    const bad = names.map((e, i) => {
      const k = e.firstElementChild, own = gpuA ? gpuA[i] * (+getComputedStyle(lab).opacity || 0) : +getComputedStyle(e).opacity || 0;
      const shown = e.hidden || !k ? 0 : Math.min(1, own * (+getComputedStyle(k).opacity || 0));
      return Math.abs(shown - a[i]) > 0.08 ? `${i ? 'central vein' : 'portal venule'} arrow ${a[i]} but its name shows ${shown.toFixed(2)}` : null;
    }).filter(Boolean);
    return bad.length ? bad.join('; ') : 'ok';
  };
  // (One check per deck and size: ascites at three sizes took 18 minutes in one piece.)
  for (const [deck, { at: sinAt, n: count }] of SV_DECKS) for (const size of device === 'desktop' ? [null, { width: 820, height: 1180 }, { width: 1180, height: 820 }] : [null]) await check(device, `presenter: on every sinusoid slide of ${deck}${size ? ` at ${size.width}x${size.height}` : ''} no direction arrow shows without its name`, async (page) => {
    {
      if (size) await page.setViewportSize(size);
      await open(page);
      await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
      let seen = 0;
      for (let guard = 0; guard < 80; guard++) {
        const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim());
        const [a, b] = n.split('/').map((x) => +x);
        await barSettle(page);
        // (A slide that opens the sinusoid view is waited for until it shows; any other slide is checked only if the view happens to be up.)
        const must = sinAt.some((i) => i + 1 + (b - count - CHECKS(deck)) === a);   // (the overview before, the quick check after)
        let r = null;
        for (let t = 0; t < (must ? 240 : 14); t++) {   // (the names and their arrows ease together; the view itself can be slow to open)
          r = await page.evaluate(endArrows);
          if (r === 'ok' || (r === null && !must)) break;
          await page.waitForTimeout(250);
        }
        if (r === 'ok') seen++;
        else if (must) throw new Error(`${deck}, slide ${n}${size ? ` at ${size.width}x${size.height}` : ''}: the sinusoid view never showed its end arrows (${r})`);
        else if (r) throw new Error(`${deck}, slide ${n}${size ? ` at ${size.width}x${size.height}` : ''}: ${r}`);
        if (a === b) break;
        for (let k = 0; k < 4; k++) {
          await page.keyboard.press('ArrowRight');
          if (await page.waitForFunction((was) => document.querySelector('.pzb-n')?.textContent.trim() !== was, n, { timeout: 15000 }).then(() => true, () => false)) break;
        }
      }
      if (!seen) throw new Error(`${deck}: no slide showed the sinusoid view`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
    }
  });

  // A phone's data card stays short and its tiles alike: the name on top, the value and unit below it with the rating at that
  // row's right end, then the change said short; nothing spilling out of a tile. The FibroScan slide's two tiles sit side by side.
  if (device === 'phone') await check(device, 'presenter: a phone keeps the data card short', async (page) => {
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('stiffness', 2));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && document.querySelector('.pz-data:not(.pz-hide) .pzt-d')?.textContent.includes('from'), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    // (Short means no dead room, judged from what each part holds, since the tiles carry scale bars (14 Oct): a tile no taller
    // than its name, value, rating and scale bar with its numbers, plus its padding; the card no taller than its header, tiles
    // and grip, plus its padding; 2 px of slack each. And the figure keeps at least its 276 px at 390x844.)
    const r = await page.evaluate(() => {
      const d = document.querySelector('.pz-data:not(.pz-hide)'), tiles = [...d.querySelectorAll('.pz-tile')];
      const spill = tiles.flatMap((t) => { const b = t.getBoundingClientRect(); return [...t.children].filter((c) => { const cb = c.getBoundingClientRect(); return cb.width && (cb.right > b.right + 1 || cb.bottom > b.bottom + 1); }).map((c) => c.className); });
      // (the span its shown parts cover, top to bottom, plus its padding and border; the card counts its tiles themselves, so an
      // empty row in the tile grid shows as dead room)
      const held = (el, parts) => {
        const shows = (c) => c.textContent.trim() || c.matches('canvas, svg, img, .pz-grip, .pz-fold') || c.querySelector('canvas, svg, img');
        const rs = parts.filter((c) => { const s = getComputedStyle(c); return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed' && shows(c); }).map((c) => c.getBoundingClientRect()).filter((q) => q.width && q.height);
        const s = getComputedStyle(el), z = el.getBoundingClientRect().height / el.offsetHeight || 1;
        const pad = (parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth)) * z;
        return rs.length ? Math.max(...rs.map((q) => q.bottom)) - Math.min(...rs.map((q) => q.top)) + pad : pad;
      };
      const loose = tiles.map((t) => ({ k: t.querySelector('.pzt-k')?.textContent.trim(), h: t.getBoundingClientRect().height, held: held(t, [...t.querySelectorAll(':scope > *')]) })).filter((x) => x.h > x.held + 2);
      const card = d.getBoundingClientRect(), cardHeld = held(d, [...d.children].flatMap((c) => c.matches('.pz-tiles') ? [...c.children] : [c]));
      const sh = document.querySelector('.pz-shade.stack');
      return { h: card.height, cardHeld, loose, n: tiles.length, spill, fig: sh ? sh.getBoundingClientRect().top - card.bottom : null };
    });
    const why = [];
    if (r.n !== 2) why.push(`${r.n} tiles (2)`);
    if (r.h > r.cardHeld + 2) why.push(`FibroScan card ${Math.round(r.h)}px tall for ${Math.round(r.cardHeld)}px of header, tiles and padding`);
    for (const x of r.loose) why.push(`the ${x.k} tile ${Math.round(x.h)}px tall for ${Math.round(x.held)}px of content and padding`);
    if (r.fig != null && r.fig < 276) why.push(`the figure keeps ${Math.round(r.fig)}px (at least 276)`);
    if (r.spill.length) why.push('spilling: ' + r.spill.join());
    if (why.length) throw new Error(why.join('; '));
    // The Doppler card: its report in three short rows, the direction clear of the stats.
    await page.evaluate(() => window.pps.presenter.start('doppler', 1));
    await page.waitForFunction(() => document.querySelector('.pz-data:not(.pz-hide) .pz-tool[data-kind="doppler"] .dop-dir')?.textContent.length > 2, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => {
      const R = (q) => document.querySelector('.pz-data:not(.pz-hide) ' + q).getBoundingClientRect(), a = R('.dop-dir'), b = R('.dop-stats');
      return { h: R('').height, hit: a.bottom > b.top && a.right > b.left };
    });
    if (d.h > 300 || d.hit) throw new Error(`Doppler card ${Math.round(d.h)}px tall (cap 300)${d.hit ? ', the direction runs into the stats' : ''}`);
    // The DIPS slide's ascites rating ("Grade 1") stays inside its tile, clear of the other tiles' words.
    await page.evaluate(() => window.pps.presenter.start('outflow', 4));
    await page.waitForFunction(() => /Grade/.test(document.querySelector('.pz-data:not(.pz-hide) .pz-tiles')?.textContent || ''), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const hits = await page.evaluate(() => {
      const kids = [...document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')].flatMap((t) => { const b = t.getBoundingClientRect(); return [...t.children].map((c) => ({ c, r: c.getBoundingClientRect(), b })).filter((x) => x.r.width && x.c.textContent.trim()); });
      const bad = kids.filter((x) => x.r.right > x.b.right + 1 || x.r.bottom > x.b.bottom + 1).map((x) => `"${x.c.textContent}" spills`);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const p = kids[i].r, q = kids[j].r; if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1) bad.push(`"${kids[i].c.textContent}" hits "${kids[j].c.textContent}"`); }
      return bad;
    });
    if (hits.length) throw new Error(`DIPS slide tiles: ${hits.join('; ')}`);
  });

  // Every deck's number tiles share one layout at each size: in a card, each tile's name, value and rating sit at the same place
  // within the tile (the rating's left or right edge), and every tile with a unit shows it (each deck's first card of two, three and four tiles).
  // Every slide's numbers agree once it has settled: an HVPG or PPG tile equals the difference of the WHVP and FHVP (portal
  // vein and IVC) callouts shown, and each live value in the words ({pv}, {ra}, ...) reads as its callout or tile does.
  if (device === 'desktop') await check(device, 'presenter: slide words, callouts and tiles agree', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const K = ['pv', 'ra', 'whvp', 'fhvp', 'ivc', 'hvpg', 'ppg'];
    const slides = DECKS.flatMap((d) => withOverview(d).slides.map((s, i) => [d.id, i, s]).filter(([, , s]) => K.some((k) => (s.line || '').includes(`{${k}}`)) || s.data === 'ladder' || (s.tiles || []).some((k) => k === 'hvpg' || k === 'ppg' || k === 'sin')))
      .filter(([d]) => !process.env.DECKS || process.env.DECKS.split(',').includes(d));
    await open(page);
    // (motion instant and a wait for the readings to stop changing, not a fixed 3.5 s a slide: tests/e2e/fast.mjs)
    const restore = await instantMotionOn(page);
    const bad = [];
    for (const [d, i, s] of slides) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [d, i]);
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover, .pz-load.on'), null, { timeout: 30000 }).catch(() => {});
      await quiet(page, { still: 400 });
      const keys = [...(s.line || '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).filter((k) => !/^[<>≥≤\d]/.test(k));   // (cut-offs and typed numbers are outlined rule pills, not the patient's)
      const read = () => page.evaluate((keys) => {
        const num = (t) => { const m = /(-?\d+(?:\.\d+)?)/.exec(t || ''); return m ? +m[1] : null; };
        const v = {}, out0 = [];
        for (const n of document.querySelectorAll('.lb-name')) {
          const t = n.parentElement.textContent, x = num(t.slice(n.textContent.length));
          if (x == null) continue;
          const k = /WHVP/.test(n.textContent) ? 'whvp' : /FHVP/.test(n.textContent) ? 'fhvp' : /^Portal v\./.test(n.textContent) ? 'pv' : /^IVC$/.test(n.textContent) ? 'ivc' : /^RA$/.test(n.textContent) ? 'ra' : null;
          if (k) v[k] = x;
        }
        for (const t of document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')) {
          if (!t.offsetWidth) continue;
          const k = { HVPG: 'hvpg', PPG: 'ppg', 'Sinusoidal pressure': 'sinT' }[t.querySelector('.pzt-k')?.textContent.trim()], x = num(t.querySelector('.pzt-vu')?.textContent);
          if (k && x != null) v[k] = x;
        }
        // The lobule's and the zoomed sinusoid's labels read as the Sinusoids tile.
        for (const zl of document.querySelectorAll('.lz-lab[data-target="lobule:sinusoid"], .sv-region-sin')) {
          if (!zl.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || v.sinT == null) continue;
          const x = num(zl.textContent.replace(/^\D+/, '')); if (x != null && Math.abs(x - v.sinT) > 0.05) out0.push(`Sinusoids tile ${v.sinT} but figure ${x}`);
        }
        const out = [...out0], gap = (a, b) => Math.round((a - b) * 10) / 10;
        if (v.hvpg != null && v.whvp != null && v.fhvp != null && Math.abs(gap(v.whvp, v.fhvp) - v.hvpg) > 0.05) out.push(`HVPG ${v.hvpg} but WHVP ${v.whvp} − FHVP ${v.fhvp}`);
        if (v.ppg != null && v.pv != null && v.ivc != null && Math.abs(gap(v.pv, v.ivc) - v.ppg) > 0.05) out.push(`PPG ${v.ppg} but portal vein ${v.pv} − IVC ${v.ivc}`);
        const pills = [...document.querySelectorAll('.pz-line .pz-val:not(.cut)')].map((e) => num(e.textContent));
        keys.forEach((k, j) => { if (v[k] != null && pills[j] != null && Math.abs(pills[j] - v[k]) > 0.05) out.push(`words say ${k} ${pills[j]}, figure ${v[k]}`); });
        return out;
      }, keys);
      let r = await read();
      if (r.length) { await page.waitForTimeout(2500); r = await read(); }   // (a slow machine: a long glide may still be landing)
      if (r.length) bad.push(`${d} slide ${i + 1}: ${r.join('; ')}`);
    }
    await restore();
    if (bad.length) throw new Error(bad.join('\n'));
  });

  await check(device, 'presenter: data card tiles are laid out alike', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    await open(page);
    const bad = [];
    // Five cards each of two, three and four tiles (each from a different deck where it can), a phone at its narrowest, 375 wide.
    // (Every deck's cards at 375 and 390 passed once by hand; that sweep takes about 15 minutes, too long to run on every push.)
    const firsts = DECKS.flatMap((d) => [2, 3, 4].map((n) => [d, withOverview(d).slides.map((x, i) => [x, i]).find(([x]) => x.data === 'tiles' && x.tiles?.length === n)]).filter(([, x]) => x));
    const slides = [2, 3, 4].flatMap((n) => firsts.filter(([, x]) => x[0].tiles.length === n).slice(0, 5));
    for (const W of device === 'phone' ? [375] : [0]) for (const [d, sl] of slides) {
      if (W) await page.setViewportSize({ width: W, height: 844 });
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [d.id, sl[1]]);
      const ok = await page.waitForFunction((n) => [...document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')].filter((t) => t.offsetWidth).length >= Math.min(n, 2) && !document.querySelector('.pz-cover'), sl[0].tiles.length, { timeout: 6000 }).then(() => true, () => false);
      if (!ok) continue;   // (a slide whose tiles fold away at this size, behind its tool)
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const out = [], tiles = [...document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')].filter((t) => t.offsetWidth);
        const at = (t, q) => { const e = t.querySelector(q), b = t.getBoundingClientRect(), c = e?.getBoundingClientRect(); return c?.width ? { t: c.top - b.top, l: c.left - b.left, r: b.right - c.right } : null; };
        const P = tiles.map((t) => ({ k: at(t, '.pzt-k'), v: at(t, '.pzt-v'), r: at(t, '.pzt-r'), u: t.querySelector('.pzt-vu small'), name: t.querySelector('.pzt-k')?.textContent }));
        for (const p of P) if (p.u?.hidden && !/—/.test(p.u.parentElement.textContent)) out.push(`${p.name} has no unit`);
        const same = (f, why) => { const v = P.map(f).filter((x) => x != null); if (v.length > 1 && Math.max(...v) - Math.min(...v) > 3) out.push(why + ' ' + v.map(Math.round).join('/')); };
        same((p) => p.k?.t, 'name top'); same((p) => p.k?.l, 'name left'); same((p) => p.v?.l, 'value left');
        same((p) => p.v && p.k && p.v.t - p.k.t > 0 ? 1 : 0, 'value below name');
        const rl = P.map((p) => p.r?.l), rr = P.map((p) => p.r?.r), spread = (v) => Math.max(...v) - Math.min(...v);
        if (P.every((p) => p.r) && spread(rl) > 3 && spread(rr) > 3) out.push('rating placed differently');
        // A rating never clipped, spilling from its tile or broken onto a second line (every rating is a word or two).
        for (const t of tiles) { const e = t.querySelector('.pzt-r'), c = e.getBoundingClientRect(), b = t.getBoundingClientRect(); if (!c.width) continue;
          const lh = parseFloat(getComputedStyle(e).lineHeight) || 15;
          if (c.right > b.right + 1 || c.left < b.left - 1 || e.scrollWidth > e.clientWidth + 1 || c.height > lh * 1.5) out.push(`rating "${e.textContent}" clipped or broken`); }
        return out;
      });
      if (r.length) bad.push(`${d.id} slide ${sl[1]}${W ? ' at ' + W : ''}: ${r.join('; ')}`);
    }
    if (bad.length) throw new Error(bad.join('\n'));
  });

  // A phone's data card opens and shuts by dragging its lower edge (as well as Show/Hide), its parts at full size after each.
  if (device === 'phone') await check(device, 'presenter: a phone drags the data card open and shut', async (page) => {
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('prehepatic', 1));   // (a card with a second part: stiffness 4's is its tiles alone now)
    // (A phone's card keeps its second part on a sheet under it, pulled out by the finger or a tap on its handle, no Show or Hide:
    // 802e093. Its open state is still the card's fold, aria-expanded, kept in step for readers.)
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const drag = (dy) => page.evaluate(async (dy) => {
      const d = document.querySelector('.pz-data.pz-sheet'), b = d.getBoundingClientRect();
      const x = b.left + b.width / 2, y0 = dy > 0 ? b.top + b.height / 2 : b.bottom - 20;   // (anywhere on the card)
      const fire = (type, y) => { const t = new Touch({ identifier: 1, target: d, clientX: x, clientY: y });
        d.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
      fire('touchstart', y0);
      for (let i = 1; i <= 10; i++) { fire('touchmove', y0 + dy * i / 10); await new Promise((r) => setTimeout(r, 30)); }
      await new Promise((r) => setTimeout(r, 150));   // (a slow release: decided by how far it got)
      fire('touchend', y0 + dy);
    }, dy);
    const state = () => page.evaluate(() => document.querySelector('.pz-data.pz-sheet .pz-fold')?.getAttribute('aria-expanded'));
    await drag(260); await page.waitForTimeout(900);
    if (await state() !== 'true') throw new Error('dragging the card edge down did not open it');
    let gap = await cardGap(page); if (gap) throw new Error(`after dragging open: ${gap}`);
    await drag(-400); await page.waitForTimeout(900);
    if (await state() !== 'false') throw new Error('dragging the card edge up did not shut it');
    gap = await cardGap(page); if (gap) throw new Error(`after dragging shut: ${gap}`);
  });

  // A phone's data card keeps its parts' size the whole way open and shut, pulled or tapped: it is fitted as it will rest before the
  // part moves. (Refitted as the finger pulled, the 440 px iPhone's Doppler card met the shut card's cap and shrank its tiles and
  // words mid-pull, then grew back once open.) A folded card's header and Show stay full size (a 320 px folded header had zoomed to half).
  if (device === 'phone') await check(device, 'presenter: a phone data card holds its size while it opens and shuts', async (page) => {
    const bad = [];
    const look = () => page.evaluate(() => {
      const d = document.querySelector('.pz-data'), tile = d.querySelector('.pz-tiles .pz-tile'), dh = d.querySelector('.pz-dh');
      return { fit: d.style.getPropertyValue('--pz-fit') || '1', z: d.style.getPropertyValue('--pz-z') || '1', tile: tile ? Math.round(tile.getBoundingClientRect().height) : 0,
        dh: +(parseFloat(getComputedStyle(dh).fontSize) * (parseFloat(getComputedStyle(dh).zoom) || 1)).toFixed(1), open: d.classList.contains('tool-open') };
    });
    const same = (a, b) => a.fit === b.fit && a.z === b.z && Math.abs(a.tile - b.tile) <= 1 && a.dh === b.dh;
    const show = (o) => `fit ${o.fit}, zoom ${o.z}, tile ${o.tile} px, header ${o.dh} px`;
    for (const [w, h] of [[440, 956], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.evaluate(() => window.pps.presenter.start('prehepatic', 1));
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
        && document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const shut = await look();
      // Pulled open by the finger: sampled at each step of the pull, then at rest.
      const during = await page.evaluate(async () => {
        const d = document.querySelector('.pz-data'), b = d.querySelector('.pz-tiles').getBoundingClientRect(), x = b.left + b.width / 2, y0 = b.top + b.height / 2, out = [];
        const fire = (type, y) => { const t = new Touch({ identifier: 1, target: d, clientX: x, clientY: y });
          d.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
        const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const labs = () => [...document.querySelectorAll('#labels .lb:not(.lb-off)')].filter((l) => +getComputedStyle(l).opacity > 0.5 && l.getBoundingClientRect().width).map((l) => l.textContent.trim().split(/\s/)[0]).sort().join('+');
        const snap = () => { const tile = d.querySelector('.pz-tiles .pz-tile'); out.push({ fit: d.style.getPropertyValue('--pz-fit') || '1', z: d.style.getPropertyValue('--pz-z') || '1', tile: Math.round(tile.getBoundingClientRect().height), labs: labs() }); };
        out.labs = labs();
        fire('touchstart', y0);
        for (let i = 1; i <= 16; i++) { fire('touchmove', y0 + 15 * i); await raf(); snap(); }
        await new Promise((r) => setTimeout(r, 150));
        fire('touchend', y0 + 240);
        for (let i = 0; i < 12; i++) { await raf(); snap(); }
        return { out, labs: out.labs };
      });
      // (The figure holds still under the finger: the labels showing before the pull still show a quarter of the way in. A camera
      // that glided mid-pull faded them all.)
      const quarter = during.out.slice(0, 4).find((o) => o.labs !== during.labs);
      if (quarter) bad.push(`${w}: a quarter into the pull the figure labels were ${quarter.labs || 'none'}, before it ${during.labs}`);
      await page.waitForTimeout(1200);
      const opened = await look();
      if (!opened.open) bad.push(`${w}: pulling the card down did not open it`);
      for (const o of during.out) if (!same({ ...o, dh: opened.dh }, opened) && !same({ ...o, dh: opened.dh }, { ...shut, dh: opened.dh })) { bad.push(`${w}: mid-pull ${show({ ...o, dh: opened.dh })}; shut ${show(shut)}, open ${show(opened)}`); break; }
      // Its handle tapped, tucking the sheet, then again, bringing it out (802e093: no Hide or Show): the fit is the resting one from the first frame.
      for (const want of [false, true]) {
        // (Its handle steps open, tucked, closed, partly open, open: from tucked, the next tap closes the card, and one more brings it
        // back partly open, the sheet tucked, from where the measured tap brings the sheet out.)
        if (want) for (let k = 0; k < 2; k++) { await page.evaluate(() => document.querySelector('.pz-lip').click()); await page.waitForTimeout(1200); }
        const frames = await page.evaluate(async () => {
          const d = document.querySelector('.pz-data'), out = [];
          document.querySelector('.pz-lip').click();
          for (let i = 0; i < 30; i++) { await new Promise((r) => requestAnimationFrame(r)); const tile = d.querySelector('.pz-tiles .pz-tile'); out.push({ fit: d.style.getPropertyValue('--pz-fit') || '1', z: d.style.getPropertyValue('--pz-z') || '1', tile: Math.round(tile.getBoundingClientRect().height) }); }
          return out;
        });
        await page.waitForTimeout(1200);
        const rest = await look();
        if (rest.open !== want) bad.push(`${w}: a tap on the handle (${want ? 'out' : 'tuck'}) left the card ${rest.open ? 'open' : 'shut'}`);
        const odd = frames.find((o) => !same({ ...o, dh: rest.dh }, rest));
        if (odd) bad.push(`${w}: ${want ? 'opening' : 'shutting'} by a handle tap passed through ${show({ ...odd, dh: rest.dh })}; rests at ${show(rest)}`);
      }
    }
    // A folded card (a 320 px iPhone, TIPS Doppler slide 6): its header at full size, 12 px words or more.
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('tips-doppler', 5));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const f = await look();
    if (await page.evaluate(() => document.querySelector('.pz-data').classList.contains('pz-folds')) && f.dh < 12) bad.push(`320: the folded card's header is ${f.dh} px`);
    if (bad.length) throw new Error(bad.join('\n'));
  });

  await check(device, 'presenter: summary table returns after back then forward', async (page) => {
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:lobule"]');
    await page.fill('.um-q', 'lobule');
    await page.press('.um-q', 'Enter');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting'));
    // (The summary is the slide before the closing quick check.)
    const at = (n) => page.waitForFunction((n) => { const m = (document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '').match(/^(\d+) \/ (\d+)$/); return !!m && (+m[1] === +m[2] - 1) === n; }, n);
    const table = () => page.waitForSelector('.pz-panel .pz-table', { state: 'visible' });
    await page.keyboard.press('End');
    await page.waitForFunction(() => /^(\d+) \/ \1$/.test(document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || ''));
    await page.keyboard.press('ArrowLeft');
    await at(true);
    await table();
    // Back one and forward again, several times and also before the move has finished: the table always draws again.
    for (const fast of [false, true, false]) {
      await page.keyboard.press('ArrowLeft');
      if (!fast) await page.waitForFunction(() => !document.querySelector('.pz-panel .pz-table'));
      await page.keyboard.press('ArrowRight');
      await at(true);
      await table();
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
  });

  // Every chart slide (scales, ladders, the SAAG map, the walls) at two phones, an upright iPad and a desktop: no two
  // pieces of text touch and no text crosses a rule line (tests/e2e/chart-text.mjs). Run once, from the desktop run.
  // (One check per size, and the strip's own: in one piece it took 18 minutes on a desktop runner.)
  if (device === 'desktop') for (const size of CHART_TEXT_SIZES) await check(device, `presenter: chart text never overlaps or crosses a line, ${size}`, async () => {
    const bad = await checkCharts(browser, server.url, () => {}, size);
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });
  if (device === 'desktop') await check(device, 'presenter: the pressure strip\'s text never overlaps or crosses a line, light and dark', async () => {
    const bad = await checkStrip(browser, server.url, () => {});
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // The Mac and iPad ladder card's HVPG and PPG brackets on every slide: a real line between the ticks, the label clear
  // of every drop line, reading, name and other bracket (Mac 1280x800 and upright iPad at 100% and 200% text here; run
  // checkLadderBrackets alone for every size).
  // (One check per size and text size, so the four walks of every slide share out over the runners: as one check they ran past
  // a share's time limit, and the checks after it in that share went unreported.)
  if (device === 'desktop') for (const size of [LADDER_SIZES[0], LADDER_SIZES[2]]) for (const z of [1, 2]) {
    await check(device, `presenter: ladder HVPG/PPG brackets draw a line and their labels clash with nothing (${size.name}, ${z * 100}% text)`, async () => {
      const bad = await checkLadderBrackets(browser, server.url, () => {}, [size], [z]);
      if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
    });
  }

  // A Mac or iPad ladder card too tall for its room even at its smallest steps folds its plot behind Show, its tiles keeping the
  // readings; shown, the plot takes the tiles' place. Folded or shown, every reading sits inside the card at 12 px or more, and
  // at 100% text the card never folds. (Treatment slide 2 at 200% on a 1440x900 Mac: the strip ran below the card's end.)
  if (device === 'desktop') await check(device, 'presenter: a ladder card too tall for its room folds whole, its readings inside it, never at 100% text, and a live text size lays out as a fresh load', async () => {
    const bad = [];
    const inside = () => {
      const dd = document.querySelector('.pz-data'), out = [];
      if (!dd || dd.hidden) return ['no numbers card'];
      const r = dd.getBoundingClientRect(), z = dd.offsetHeight ? r.height / dd.offsetHeight : 1;
      const shown = (e) => { for (let a = e; a && a !== dd; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
      const w = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const el = n.parentElement;
        if (!n.textContent.trim() || el.closest('.sr-only, [aria-hidden="true"]') || !shown(el)) continue;
        const g = document.createRange(); g.selectNodeContents(n);
        const q = [...g.getClientRects()].find((x) => x.width && x.height);
        if (!q) continue;
        const word = n.textContent.trim().slice(0, 20);
        if (q.left < r.left - 2 || q.right > r.right + 2 || q.top < r.top - 2 || q.bottom > r.bottom + 2) { out.push(`"${word}" outside the card (${Math.round(q.bottom)} vs ${Math.round(r.bottom)})`); break; }
        // (drawn size: the font's size times the card's own zoom, and an SVG's scale for the ladder's labels)
        const svg = el.closest('svg'), m = svg && svg.getScreenCTM && el.getScreenCTM ? el.getScreenCTM() : null;
        const px = parseFloat(getComputedStyle(el).fontSize) * (m ? Math.hypot(m.b, m.d) : z);
        // (the card's 12 px floor: its zoom stops at 11.5 px, a chart's lettering within 1% of that)
        if (px < 11.4) { out.push(`"${word}" drawn at ${px.toFixed(1)} px`); break; }
      }
      return out;
    };
    // (The cards' layout: the numbers card's classes, whether its ladder shows as the compact strip, and the boxes of both cards,
    // the words' title and the ladder.)
    const lay = () => {
      const dd = document.querySelector('.pz-data');
      // (the strip as the viewer sees it: a folded card's hidden ladder can carry either)
      const lad = dd.querySelector(':is(.pz-ladder,.pz-strip)'), seen = lad && lad.getBoundingClientRect().height > 0;
      const cls = `${[...dd.classList].filter((c) => c !== 'stage-blocker' && c !== 'strip').sort().join(' ')}${seen && (dd.querySelector('.strip') || dd.classList.contains('strip')) ? ' +strip' : ''}`;
      const box = {};
      for (const [n, q] of [['numbers card', '.pz-data'], ['words card', '.pz-text'], ['title', '.pz-text h1, .pz-text h2'], ['ladder', '.pz-data :is(.pz-ladder,.pz-strip)']]) {
        const e = document.querySelector(q), r = e?.getBoundingClientRect();
        box[n] = r && r.width ? [r.left, r.top, r.width, r.height].map(Math.round) : [0, 0, 0, 0];
      }
      return { cls, box };
    };
    // (Read once the cards have settled: the same layout twice, half a second apart, within 15 s.)
    const settled = async (pg) => { let was = ''; for (let t = 0; t < 30; t++) { const now = JSON.stringify(await pg.evaluate(lay)); if (now === was) return JSON.parse(now); was = now; await pg.waitForTimeout(500); } return JSON.parse(was); };
    const fresh = new Map(), live = new Map();
    for (const [w, h] of [[1440, 900], [1280, 800], [1180, 820]]) for (const k of [1, 2]) {
      const ctx = await fastContext(browser, { viewport: { width: w, height: h } });
      await ctx.addInitScript((k) => { localStorage.setItem('pps.labelScale', String(k)); localStorage.setItem('pps.labelScaleV', '2'); }, k);
      const page = await ctx.newPage();
      await gotoSlide(page, server.url, 'treatment', 1); await quiet(page);
      const at = `treatment slide 2 at ${w}x${h} ${k * 100}%`;
      fresh.set(`${w}x${h}:${k}`, await settled(page));
      const folds = await page.evaluate(() => document.querySelector('.pz-data')?.classList.contains('pz-folds'));
      if (k === 1 && folds) bad.push(`${at}: the card folded at 100% text`);
      for (const c of await page.evaluate(inside)) bad.push(`${at}${folds ? ', folded' : ''}: ${c}`);
      if (folds) {
        await page.click('.pz-data .pz-fold'); await quiet(page);
        fresh.set(`${w}x${h}:${k} shown`, await page.evaluate(lay));
        for (const c of await page.evaluate(inside)) bad.push(`${at}, shown: ${c}`);
        // (Text set back to 100% in Settings while the slide shows: the card lays out again and unfolds, as a fresh load does.)
        await page.evaluate(() => window.pps.stage.setLabelScale(1)); await quiet(page);
        if (await page.evaluate(() => document.querySelector('.pz-data')?.classList.contains('pz-folds'))) bad.push(`${at}: still folded after text went back to 100%`);
      }
      // (The other size set live in Settings on a newly loaded slide: compared below with a fresh load at that size.)
      await page.close();   // (one page at a time: a page left open in the background held the other's frames, and its cards never came in)
      const again = await ctx.newPage();
      await gotoSlide(again, server.url, 'treatment', 1); await quiet(again);
      await again.evaluate((k) => window.pps.stage.setLabelScale(k), 3 - k); await quiet(again);
      live.set(`${w}x${h}:${3 - k}`, await settled(again));
      if (await again.evaluate(() => document.querySelector('.pz-data')?.classList.contains('pz-folds'))) {
        await again.click('.pz-data .pz-fold'); await quiet(again);
        live.set(`${w}x${h}:${3 - k} shown`, await again.evaluate(lay));
      }
      await ctx.close();
    }
    // A live text-size change lays the cards out exactly as a fresh load at that size: the same plot or strip, fold, and boxes
    // within 2 px. (17507e3: switched from 200% to 100% the card kept the strip a fresh 100% load shows as the full plot.)
    for (const [key, got] of live) {
      const want = fresh.get(key), at = `treatment slide 2 at ${key.replace(/:(\d)/, ' $100%')} set live`;
      if (!want) { bad.push(`${at}: a fresh load did not fold`); continue; }
      if (got.cls !== want.cls) bad.push(`${at}: card "${got.cls}", a fresh load "${want.cls}"`);
      // (Opened by Show, the card eases to its height: its boxes differ by a few px from one load to the next, so only its parts are compared.)
      else if (!key.endsWith(' shown')) for (const n of Object.keys(want.box)) if (want.box[n].some((v, i) => Math.abs(v - got.box[n][i]) > 2)) bad.push(`${at}: ${n} at ${got.box[n]}, a fresh load ${want.box[n]}`);
    }
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });
}
