// Browser checks 5 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "presenter: at 200% text the stacked data card holds what it shows and the words above it keep their 12 px, on a Mac and an iPad on its side" to "a presenter dive lands on its station in one move, with no other station labelled".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ CHART_SLIDES, PHONES, STRIP_SLIDES, TYPE_SCALE_SIZES, browser, chartTypeSlides, check, checkChartText, checkPhoneFit, checkStripGaps, checkStripSlides, checkTypeScale, device, fastContext, fitIssues, gotoSlide, open, quiet, server, shot, stripSlides, tapTool }) {
  // A large text size on a Mac or an iPad on its side: the data card holds everything it shows (the Gut to heart chart's axis names, a readings'
  // sheet's instrument too), because the words' card above it gives way, down to the size where its smallest lettering is still 12 px.
  // (The external review of 1 Nov: HVPG slide 7 at 200 % had the chart's axis names cut off by the card.)
  if (device === 'desktop') await check(device, 'presenter: at 200% text the stacked data card holds what it shows and the words above it keep their 12 px, on a Mac and an iPad on its side', async () => {
    const bad = [];
    const probe = () => {
      const out = [], dd = document.querySelector('.pz-data'), tx = document.querySelector('.pz-text');
      const visible = (e, root) => { for (let a = e; a && a !== root; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
      if (!dd || dd.hidden) return ['no data card'];
      const r = dd.getBoundingClientRect(), tucked = dd.classList.contains('pz-sheet') && !dd.classList.contains('tool-open');
      const w = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const el = n.parentElement;
        if (!n.textContent.trim() || el.closest('.sr-only, [aria-hidden="true"]') || (tucked && el.closest('.pz-tiles')) || !visible(el, dd)) continue;
        const g = document.createRange(); g.selectNodeContents(n);
        const q = [...g.getClientRects()].find((x) => x.width && x.height);
        if (q && (q.left < r.left - 2 || q.right > r.right + 2 || q.top < r.top - 2 || q.bottom > r.bottom + 2)) { out.push(`data card: "${n.textContent.trim().slice(0, 20)}" outside it (${Math.round(q.bottom)} vs ${Math.round(r.bottom)})`); break; }
      }
      // (the words' smallest lettering as it reaches the screen: its size times every zoom on its way)
      if (tx && !tx.hidden) {
        const t = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
        for (let n; (n = t.nextNode());) {
          const el = n.parentElement;
          if (!n.textContent.trim() || !el.getClientRects().length || el.closest('.sr-only, [aria-hidden="true"]') || !visible(el, tx)) continue;
          let k = parseFloat(getComputedStyle(el).fontSize) || 0;
          for (let a = el; a; a = a.parentElement) k *= parseFloat(getComputedStyle(a).zoom) || 1;
          if (k && k < 11.4) { out.push(`words: "${n.textContent.trim().slice(0, 20)}" drawn at ${k.toFixed(1)} px`); break; }
        }
      }
      return out;
    };
    for (const [w, h] of [[1440, 900], [1180, 820]]) {
      const ctx = await fastContext(browser, { viewport: { width: w, height: h } });
      await ctx.addInitScript(() => { try { localStorage.setItem('pps.labelScale', '2'); localStorage.setItem('pps.labelScaleV', '2'); } catch { /* private mode */ } });
      const page = await ctx.newPage();
      for (const [deck, slide] of [['hvpg', 7], ['hvpg', 6], ['circulation', 4], ['two-inflows', 2], ['two-inflows', 5], ['ascites', 4], ['varices', 6]]) {
        await gotoSlide(page, server.url, deck, slide - 1); await quiet(page);
        for (const c of await page.evaluate(probe)) bad.push(`${deck} slide ${slide} at ${w}x${h}, 200% text: ${c}`);
      }
      await ctx.close();
    }
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // The phone pressure strip on every slide that has it: all its text at least 11 px as drawn, labels centred in their brackets, clear of every line.
  // (One check per deck: the whole sweep is 64 page loads and took 45 minutes in one piece, longer than a runner's limit.)
  if (device === 'desktop') for (const deck of new Set((await stripSlides()).map((s) => s.deck))) {
    const name = `presenter: ${deck}'s pressure strip keeps 11 px text and clear labels on every slide, at both phones`;
    STRIP_SLIDES.set(name, (await stripSlides(deck)).length);
    await check(device, name, async () => {
      const bad = await checkStripSlides(browser, server.url, () => {}, deck);
      if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
    });
  }

  // The strip's bar stops the same distance from every reading, one digit or two (within 1 px), at phones, an upright iPad and a desktop.
  if (device === 'desktop') await check(device, 'presenter: the pressure strip leaves equal gaps beside one- and two-digit readings, at every size', async () => {
    const bad = await checkStripGaps(browser, server.url, () => {});
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // Every slide of every deck at three phone widths, upright and sideways: the words clear of the controls pill, and every
  // reading in the numbers card (a folded instrument opened) inside the card. One check per deck, weighed by its slides.
  if (device === 'desktop') {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    for (const d of DECKS) {
      // (One check per deck upright and one sideways: in one piece a deck took up to 14 minutes on a runner.)
      for (const [way, sizes] of [['upright', PHONES.filter((s) => s.height > s.width)], ['sideways', PHONES.filter((s) => s.width > s.height)]]) {
        const name = `presenter: ${d.id}'s slides keep their words off the controls pill and readings inside their card, at phones ${way}`;
        STRIP_SLIDES.set(name, withOverview(d).slides.length * 0.15);
        await check(device, name, async () => {
          const bad = await checkPhoneFit(browser, server.url, d.id, withOverview(d).slides.length, () => {}, sizes);
          if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
        });
      }
    }
  }

  // A larger text size reads larger on a phone: Circulation 3 at 150 % keeps its words bigger on the screen than at 100 %, its
  // four colour buttons at a role size and no smaller on the screen, 8 px or more above the colour key, and the organ names the figure shows at 100 % (KIDNEY
  // had gone when the buttons grew and the card with them).
  if (device === 'desktop') await check(device, 'presenter: Circulation 3 at 150 % text keeps larger words, the colour key clear and the organ names, on a phone', async () => {
    const look = async (step) => {
      const ctx = await fastContext(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await ctx.addInitScript((s) => { try { localStorage.setItem('pps.labelScale', String(s)); localStorage.setItem('pps.labelScaleV', '2'); } catch { /* */ } }, step);
      const page = await ctx.newPage();
      await gotoSlide(page, server.url, 'encephalopathy', 5); await quiet(page); await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const t = document.querySelector('.pz-text'), a = t.querySelector('.pz-ab').getBoundingClientRect(), k = document.querySelector('.pz-fk').getBoundingClientRect();
        const names = [...document.querySelectorAll('#stageView g.lb text')].filter((x) => { const g = x.closest('g.lb'); return getComputedStyle(g).display !== 'none' && +getComputedStyle(g).opacity > 0.1; }).map((x) => x.textContent.trim()).filter((s) => /^[A-Z]+$/.test(s));
        const ab = t.querySelector('.pz-ab');
        return { words: parseFloat(getComputedStyle(t.querySelector('.pz-line')).fontSize) * (parseFloat(t.style.getPropertyValue('--pz-fit')) || 1), buttons: parseFloat(getComputedStyle(ab.firstElementChild).fontSize) * (parseFloat(getComputedStyle(ab).zoom) || 1), gap: k.top - a.bottom, names };
      });
      await ctx.close();
      return r;
    };
    const one = await look(1), big = await look(1.5), bad = [];
    if (!(big.words > one.words * 1.05)) bad.push(`words ${big.words.toFixed(1)} px at 150 %, ${one.words.toFixed(1)} px at 100 %`);
    for (const [s, r] of [['100', one], ['150', big]]) if (r.gap < 7.5) bad.push(`colour buttons ${r.gap.toFixed(1)} px above the key at ${s} %`);
    if (big.buttons < one.buttons - 0.3) bad.push(`colour buttons ${big.buttons.toFixed(1)} px at 150 %, ${one.buttons.toFixed(1)} px at 100 %`);
    if (!big.names.includes('KIDNEY')) bad.push(`KIDNEY gone at 150 % (shown: ${big.names.join(', ')})`);
    if (bad.length) throw new Error(bad.join('; '));
  });

  // Every choice in a slide's row of treatment buttons stays in view, whole, with no sideways scrolling, at 11 px or more
  // (a phone once cut Terlipressin off the right edge), at three phone widths, a phone on its side and an upright iPad.
  if (device === 'desktop') await check(device, 'presenter: every choice button on every slide fits on screen, at phones, sideways and iPad', async (page) => {
    const bad = [];
    // The slides with a row of choices are read from the decks, not probed for on screen: a probe with a time limit
    // read a slow runner's late-arriving words as "no row", and a sweep of every slide costs minutes besides.
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const found = ['circulation', 'circuit', 'recompensation', 'treatment', 'two-inflows'].flatMap((deck) =>
      withOverview(DECKS.find((d) => d.id === deck)).slides.flatMap((x, i) => (x.compare?.length ? [[deck, i + 1]] : [])));
    if (!found.length) throw new Error('no slide has a row of choices');
    for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(size);
      for (const [deck, n] of found) {
        // (the page is loaded once per size and the presenter moved on to each slide, not reloaded: 55 loads outran a CI runner)
        if (deck === found[0][0] && n === found[0][1]) await open(page, `?script=${deck}&slide=${n}`);
        else await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, n - 1]);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && document.querySelector('.pz-abb') && !document.querySelector('.pz-cover'), n, { timeout: 30000 });
        await page.waitForTimeout(900);
        const out = await page.evaluate(() => [...document.querySelectorAll('.pz-abb')].map((b) => {
          const r = b.getBoundingClientRect(), row = b.parentElement.getBoundingClientRect(), fs = parseFloat(getComputedStyle(b).fontSize);
          if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.left < row.left - 0.5 || r.right > row.right + 0.5) return `"${b.textContent}" is clipped`;
          if (b.scrollWidth > b.clientWidth + 1) return `"${b.textContent}" overflows its button`;
          if (fs < 11) return `"${b.textContent}" is ${fs}px`;
          return null;
        }).filter(Boolean).concat(document.querySelector('.pz-ab').scrollWidth > document.querySelector('.pz-ab').clientWidth + 1 ? ['the row scrolls sideways'] : [],
          new Set([...document.querySelectorAll('.pz-abb')].map((b) => Math.round(b.getBoundingClientRect().top))).size > 1 ? ['the buttons wrap to two rows'] : []));
        for (const o of out) bad.push(`${deck} ${n} at ${size.width}x${size.height}: ${o}`);
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join(' | '));
  });

  // A laptop, a sideways and an upright iPad show the phone's pill at the lower right (Mohammad): back, count, next, settings,
  // exit, always shown; no separate count, Quiz or ask-the-room button; clear of the words, the data card, a full card and the credit.
  if (device === 'desktop') await check(device, 'presenter: the controls are a lower-right pill on wide screens', async (page) => {
    const bad = [];
    for (const size of [{ width: 1440, height: 900 }, { width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(size);
      for (const [deck, n] of [['circulation', 3], ['hvpg', 10], ['circulation', 12]]) {
        if (size.width === 1440 && n === 3) await open(page, `?script=${deck}&slide=${n}`);
        else await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, n - 1]);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !document.querySelector('.pz-cover, .pz-load.on'), n, { timeout: 60000 });
        await page.waitForTimeout(3500);   // (longer than the old bar's idle fade)
        // (An upright iPad has used the phone's layout since 1f25c95: the teaching card at the bottom holds the phone's pill (count,
        // settings, exit) at its lower right, and the words keep clear of it as on a phone: phone-fit.mjs judges them.)
        const upright = size.height > size.width;
        const out = await page.evaluate((upright) => {
          const o = [], bar = document.querySelector('.pz-bar'), b = bar.getBoundingClientRect();
          const vis = (el) => { if (!el || el.hidden || el.classList.contains('pz-hide')) return null; const st = getComputedStyle(el); if (st.display === 'none' || +st.opacity < 0.5) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
          if (+getComputedStyle(bar).opacity < 0.9) o.push('the pill hides');
          const kids = [...bar.children].map((c) => c.getAttribute('aria-label') || c.textContent.trim());
          if (document.querySelector('.pz-count')) o.push('a second count shows');
          if (upright) {
            const sh = document.querySelector('.pz.stack') && vis(document.querySelector('.pz-shade'));
            // (A slide with no words, a summary table, has no teaching card: the pill then keeps to the lower right of the column.)
            if (!sh) { if (b.left < innerWidth / 2 || innerHeight - b.bottom > 60) o.push(`the pill is not at the lower right (${Math.round(b.left)},${Math.round(b.top)})`); }
            else if (sh.right - b.right < 0 || sh.right - b.right > 30 || sh.bottom - b.bottom < 0 || sh.bottom - b.bottom > 30 || b.left < (sh.left + sh.right) / 2) o.push(`the pill is not at the teaching card's lower right (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)}; card ${sh ? [sh.left, sh.top, sh.right, sh.bottom].map(Math.round).join(',') : 'none'})`);
            if (kids.length !== 3 || !/^Slide \d+ of/.test(kids[0]) || kids[1] !== 'Settings') o.push(`the pill holds ${kids.join(', ')}`);
            return o;
          }
          // (One margin from the right and the bottom, the cards' own margin (--pz-cm, since a77f314: 37 px at 1440 wide), not a fixed 20 px.)
          const pr = document.createElement('div'); pr.style.cssText = 'position:absolute;visibility:hidden;width:var(--pz-cm)'; bar.parentElement.append(pr);
          const cm = pr.getBoundingClientRect().width; pr.remove();
          if (Math.abs(innerWidth - b.right - cm) > 2 || Math.abs(innerHeight - b.bottom - cm) > 2 || b.left < innerWidth / 2) o.push(`the pill is not at the lower right, one margin (${Math.round(cm)} px) in (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)})`);
          if (kids.length !== 5 || !/^Slide \d+ of/.test(kids[1]) || kids[3] !== 'Settings') o.push(`the pill holds ${kids.join(', ')}`);
          if (!['none', 'normal'].includes(getComputedStyle(bar, '::before').content) || [...bar.children][0].getBoundingClientRect().left - b.left > 4) o.push('a mark shows before the back button');   // (the app's status-pill dot once did)
          for (const s of ['.pz-text', '.pz-data', '.pz-panel', '.stage-credit']) { const q = vis(document.querySelector(s)), g = s === '.stage-credit' ? 4 : 0;
            if (q && Math.min(q.right, b.right) - Math.max(q.left, b.left) > -g && Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top) > -g) o.push(`the pill touches ${s}`); }
          return o;
        }, upright);
        if (upright) out.push(...await page.evaluate(fitIssues));
        for (const x of out) bad.push(`${deck} ${n} at ${size.width}x${size.height}: ${x}`);
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join(' | '));
  });

  // Figure labels and slide cards keep to the six-role type scale at every text size step, never under 11 px, units never
  // above their readings, on a phone, an upright iPad and a desktop (tests/e2e/type-scale.mjs). Run once, from the desktop run.
  // (One check per size: in one piece it took 22 minutes on a desktop runner.)
  if (device === 'desktop') for (const size of TYPE_SCALE_SIZES) await check(device, `type scale: figure and slide text on the six roles at every text size, ${size}`, async () => {
    const bad = await checkTypeScale(browser, server.url, () => {}, size);
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // Drawn slide charts letter from the same scale as drawn: never under 12 px, growing with the text size, no word over
  // another or out of its card, on every chart slide at three phones, an iPad and a desktop (tests/e2e/chart-type.mjs).
  // (One check for each deck and text size: the whole sweep is 35 slides at five sizes and two text sizes, some 78 minutes in one piece.)
  if (device === 'desktop') {
    const perDeck = new Map();
    for (const s of await chartTypeSlides()) perDeck.set(s.deck, (perDeck.get(s.deck) || 0) + 1);
    for (const [deck, count] of perDeck) for (const step of [1, 1.5, 2]) {
      const name = `chart type: ${deck}'s drawn slide charts on the type scale at ${step * 100} %`;
      CHART_SLIDES.set(name, count);
      await check(device, name, async () => {
        const bad = await checkChartText(browser, server.url, () => {}, { deck, step });
        if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
      });
    }
  }

  await check(device, 'presenter: summary table cells stay under their headings', async (page) => {
    // Each cell's contents sit inside its column heading's width, and no two cells overlap, at each size (the desktop run
    // also tries an upright iPad and an iPad on its side, small and large), and the table never scrolls sideways: a card
    // never scrolls (Mohammad, 25 Oct: the nine-column tables scrolled on an iPad on its side).
    // (A phone's control padding once pushed the names into the HVPG column.)
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }, { width: 1024, height: 768 }, { width: 1194, height: 834 }, { width: 1366, height: 1024 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const deck of ['circuit', 'hvpg', 'sites']) {   // (sites: the most columns)
        const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
        const at = withOverview(DECKS.find((d) => d.id === deck)).slides.findIndex((x) => x.visual === 'table') + 1;
        await open(page, `?script=${deck}&slide=${at}`);   // (the summary: the slide before the closing quick check)
        await page.waitForFunction(() => { const t = document.querySelector('.pz-table'); return t && t.querySelector('tbody tr') && !t.querySelector('td.pend'); });
        await page.waitForTimeout(600);
        const bad = await page.evaluate(() => {
          const t = document.querySelector('.pz-table'), out = [];
          // What a cell shows: its text and icons, not the words kept for screen readers.
          const box = (el) => {
            const rs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n; (n = w.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('.sr-only')) { const g = document.createRange(); g.selectNodeContents(n); rs.push(...g.getClientRects()); }
            for (const e of el.querySelectorAll('svg, i')) if (!e.closest('.sr-only')) rs.push(e.getBoundingClientRect());
            const v = rs.filter((r) => r.width && r.height);
            return v.length ? { left: Math.min(...v.map((r) => r.left)), right: Math.max(...v.map((r) => r.right)), top: Math.min(...v.map((r) => r.top)), bottom: Math.max(...v.map((r) => r.bottom)) } : null;
          };
          const heads = [...t.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect());
          // The column heads: inside their own column, and never smaller than 8 px (a phone's once were 7.5).
          for (const th of t.querySelectorAll('thead th')) {
            if (getComputedStyle(th).display === 'none') continue;
            const hb = th.getBoundingClientRect(), g = document.createRange(), fs = parseFloat(getComputedStyle(th).fontSize);
            g.selectNodeContents(th);
            if ([...g.getClientRects()].some((q) => q.width && (q.left < hb.left - 1 || q.right > hb.right + 1))) out.push(`head "${th.textContent.trim()}" runs outside its column`);
            if (fs < 8) out.push(`head "${th.textContent.trim()}" is ${fs}px`);
          }
          for (const tr of t.querySelectorAll('tbody tr')) {
            let k = 0; const seen = [];
            for (const c of tr.children) {
              const span = +(c.getAttribute('colspan') || 1), hs = heads.slice(k, k + span).filter((h) => h.width);
              k += span;
              if (c.matches('td.note') || !hs.length) continue;
              const b = box(c); if (!b) continue;
              const l = Math.min(...hs.map((h) => h.left)), r = Math.max(...hs.map((h) => h.right)), name = c.textContent.trim().slice(0, 20);
              if (b.left < l - 1 || b.right > r + 1) out.push(`"${name}" runs outside its column (${Math.round(b.left)}-${Math.round(b.right)} in ${Math.round(l)}-${Math.round(r)})`);
              for (const o of seen) if (b.left < o.b.right - 1 && o.b.left < b.right - 1 && b.top < o.b.bottom - 1 && o.b.top < b.bottom - 1) out.push(`"${name}" overlaps "${o.name}"`);
              seen.push({ b, name });
            }
          }
          if (!document.querySelector('.pz.stack') && t.scrollWidth > t.clientWidth + 1) out.push(`the table scrolls sideways (${t.scrollWidth} px of content in ${t.clientWidth})`);
          return out;
        });
        if (bad.length) throw new Error(`${deck}${size ? ` at ${size.width}x${size.height}` : ''}: ${bad.slice(0, 4).join('; ')}`);
      }
    }
  });

  await check(device, 'lobule: the sinusoid reading and its lesion pointer point at the middle of a sinusoid', async (page) => {
    // Each of the presenter's lobule framings (the whole lobule, a portal tract, the sinusoids, the central vein; every
    // lobule slide uses one of these) and Explore's lobule: where the sinusoid's reading or the "Block: sinusoids" pointer
    // is shown, the spot they name lies half way between the portal tract and the central vein (not at either end), and
    // the reading, the pointer and the corner credit keep clear of each other.
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const slides = [['lobule', 'lobule:fit'], ['sites', 'lobule:triad'], ['sites', 'lobule:sinusoid'], ['sites', 'lobule:central']]
      .map(([deck, cam]) => [deck, withOverview(DECKS.find((d) => d.id === deck)).slides.findIndex((x) => x.cam === cam)]);
    if (slides.some(([, i]) => i < 0)) throw new Error('a lobule framing is missing from its deck');
    const bad = [];
    const look = async (where) => {
      // Settled: the labels hold still across two looks a moment apart.
      const pos = () => page.evaluate(() => [...document.querySelectorAll('.lz-lab, .lz-call')].map((e) => e.style.left + e.style.top + e.style.transform).join());
      for (let prev = '', i = 0; i < 8; i++) { await page.waitForTimeout(400); const now = await pos(); if (now === prev) break; prev = now; }
      bad.push(...await page.evaluate((where) => {
        const out = [], a = window.pps.stage.lobuleSinAnchor();
        const shown = (e) => !!e && !e.hidden && !!e.offsetParent && +getComputedStyle(e).opacity > 0.5;
        const lab = [...document.querySelectorAll('.lz.on .lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid');
        const call = document.querySelector('.lz.on .lz-call.on'), sinCall = shown(call) && /sinusoid/i.test(call.textContent);
        if (!a || !(shown(lab) || sinCall)) return out;
        if (a.f < 0.3 || a.f > 0.7) out.push(`${where}: the sinusoid ${sinCall ? 'pointer' : 'reading'} names a spot ${Math.round(a.f * 100)}% of the way out from the central vein (want 30 to 70%)`);
        const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const hit = (p, q) => Math.min(p.r, q.r) - Math.max(p.l, q.l) > 1 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 1;
        const credit = document.querySelector('.stage-credit'), parts = [];
        if (shown(lab)) parts.push(['reading', box(lab)]);
        if (shown(call)) parts.push(['pointer', box(call)]);
        if (credit && +getComputedStyle(credit).opacity > 0.5) parts.push(['credit', box(credit)]);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hit(parts[i][1], parts[j][1])) out.push(`${where}: the sinusoid ${parts[i][0]} overlaps the ${parts[j][0]}`);
        return out;
      }, where));
    };
    await open(page);
    for (const [deck, i] of slides) {
      await page.evaluate(([deck, i]) => window.pps.presenter.start(deck, i), [deck, i]);
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover') && !document.querySelector('#app').className.includes('pz-hush')
        && window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
      await look(`${deck} slide ${i + 1}`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'), null, { timeout: 30000 });
    }
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 45000 });
    await look('explore lobule');
    if (bad.length) throw new Error(bad.slice(0, 6).join(' | '));
  });

  await check(device, 'presenter: lobule labels never touch, leaders never cross', async (page) => {
    // The slides that name several lobule structures at once, at each size: no two labels, pills included, come within
    // a few pixels of each other; no leader runs under another label or crosses another leader. The desktop run also
    // tries an iPad's portrait screen.
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const [deck, n] of [['circulation', 5], ['circulation', 6], ['two-inflows', 3], ['lobule', 5]]) {
        await open(page, `?script=${deck}&slide=${n}`);
        await page.waitForFunction(() => [...document.querySelectorAll('.lz.on:not(.lz-cam):not(.lz-sin) .lz-lab, .sv-region')].filter((e) => !e.hidden && e.offsetParent).length >= 2);
        // Settled: the labels hold still across two looks a moment apart.
        const where = () => page.evaluate(() => [...document.querySelectorAll('.lz-lab, .sv-region')].map((e) => e.style.left + e.style.top + e.style.transform).join());
        for (let prev = '', i = 0; i < 6; i++) { await page.waitForTimeout(400); const now = await where(); if (now === prev) break; prev = now; }
        const bad = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('.lz.on:not(.lz-cam):not(.lz-sin) :is(.lz-lab, .lz-zone, .lz-call.on), .sv-region')) {
            if (el.hidden || !el.offsetParent) continue;
            // (A name that is not lit on a presenter slide is drawn at no opacity: it cannot be seen to touch anything.)
            const lit = (document.querySelector('#app').dataset.lit || '').split(' ');
            if (el.matches('.lz-lab, .lz-zone') && lit.some((x) => x.startsWith('lobule:')) && !lit.includes(el.dataset.target)) continue;
            const b = el.getBoundingClientRect(), pill = getComputedStyle(el, '::before'), px = Math.max(0, -parseFloat(pill.left) || 0), py = Math.max(0, -parseFloat(pill.top) || 0);
            out.push({ n: el.textContent.trim().slice(0, 20), l: b.left - px, r: b.right + px, t: b.top - py, b: b.bottom + py });
          }
          const hits = [];
          for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
            const a = out[i], c = out[j], gap = Math.max(Math.max(a.l, c.l) - Math.min(a.r, c.r), Math.max(a.t, c.t) - Math.min(a.b, c.b));
            if (gap < 3) hits.push(`"${a.n}" and "${c.n}" (gap ${gap.toFixed(1)} px)`);
          }
          // Leaders on screen: each runs from the spot it names to the middle of its own label.
          const segs = [...document.querySelectorAll('.lz.on:not(.lz-cam) .lz-leaders line.leader')].filter((l) => l.style.display !== 'none' && !l.classList.contains('ld-gone')).map((l) => {
            const m = l.getScreenCTM(), at = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
            return { n: l.dataset.target, p: at(+l.getAttribute('x1'), +l.getAttribute('y1')), q: at(+l.getAttribute('x2'), +l.getAttribute('y2')) };
          });
          const inside = ([x, y], b) => x >= b.l - 1 && x <= b.r + 1 && y >= b.t - 1 && y <= b.b + 1;
          const under = (p, q, b) => {
            let t0 = 0, t1 = 1;
            for (const [d, lo, hi, o] of [[q[0] - p[0], b.l, b.r, p[0]], [q[1] - p[1], b.t, b.b, p[1]]]) {
              if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
              let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
              t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
            }
            return t1 - t0 > 0.02;
          };
          const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
          for (const s of segs) for (const b of out) if (!inside(s.p, b) && !inside(s.q, b) && under(s.p, s.q, b)) hits.push(`the ${s.n} leader runs under "${b.n}"`);
          for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
            const a = segs[i], c = segs[j];
            if (side(a.p, a.q, c.p) * side(a.p, a.q, c.q) < 0 && side(c.p, c.q, a.p) * side(c.p, c.q, a.q) < 0) hits.push(`the ${a.n} and ${c.n} leaders cross`);
          }
          return hits;
        });
        if (bad.length) throw new Error(`${deck} slide ${n} at ${page.viewportSize().width}px: ${bad.join('; ')}`);
      }
    }
  });

  await check(device, 'presenter lobule: the zone names and the lesion pill hold steady while the values ease', async (page) => {
    // Congestion slide: the central vein's value eases in, so the labels are laid out again and again. The zone names
    // used to be re-made on each pass (their lit pill flashed); the pill and its leader used to be free to change side.
    // (Slide 5 since the deck's slides are counted from its opening slide, 1: slide 7 is now the summary table, with no lobule.)
    await open(page, '?script=lobule&slide=5');
    await page.waitForFunction(() => document.querySelector('.lz-call.on') && document.querySelector('.lz-zone.z3'), null, { timeout: 60000 });
    const rows = await page.evaluate(async () => {
      for (const z of document.querySelectorAll('.lz-zone')) z.dataset.mark = '1';
      const op = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
      const out = [], t0 = performance.now();
      await new Promise((done) => {
        const f = () => {
          const call = document.querySelector('.lz-call'), line = document.querySelector('.lz-call-l'), z3 = document.querySelector('.lz-zone.z3'), b = call.getBoundingClientRect();
          out.push({ t: performance.now() - t0, fresh: [...document.querySelectorAll('.lz-zone')].filter((z) => !z.dataset.mark).length, zones: document.querySelectorAll('.lz-zone').length,
            call: [b.left, b.top], callO: op(call), line: [line.getAttribute('x2'), line.getAttribute('y2')].join(), lineO: op(line), pill: z3 ? op(z3) * +getComputedStyle(z3, '::before').opacity : 0 });
          if (performance.now() - t0 < 6000) requestAnimationFrame(f); else done();
        };
        f();
      });
      return out;
    });
    if (rows.some((r) => r.fresh || r.zones !== 3)) throw new Error('the zone names were re-made while the slide was open');
    const rest = rows.filter((r) => r.t > 3500);
    for (const k of ['callO', 'lineO', 'pill']) if (rest.some((r) => r[k] < 0.9)) throw new Error(`${k} dipped to ${Math.min(...rest.map((r) => r[k])).toFixed(2)} after it had come in`);
    const still = (f) => rest.every((r) => Math.hypot(f(r)[0] - f(rest[0])[0], f(r)[1] - f(rest[0])[1]) < 1.5);
    if (!still((r) => r.call)) throw new Error('the lesion pill moved after it had settled');
    if (!still((r) => r.line.split(',').map(Number))) throw new Error('the lesion leader moved after it had settled');
  });

  await check(device, 'presenter lobule: the lesion leader stops at the ring\'s edge and no label sits on the ring', async (page) => {
    for (const slide of [5, 4]) {   // (congestion and cirrhosis: the deck's two slides with a lesion pointer)
      await open(page, `?script=lobule&slide=${slide}`);
      await page.waitForFunction(() => document.querySelector('.lz-call.on') && window.pps.stage.lobuleSettled(), null, { timeout: 60000 }).catch(() => null);
      const r = await page.evaluate(() => {
        const call = document.querySelector('.lz-call.on'), ring = document.querySelector('.lz-call-r.on'), line = document.querySelector('.lz-call-l.on');
        if (!call || !ring || !line) return null;
        const cx = +ring.getAttribute('cx'), cy = +ring.getAttribute('cy'), rr = +ring.getAttribute('r'), host = ring.ownerSVGElement.getBoundingClientRect();
        const start = Math.hypot(+line.getAttribute('x1') - cx, +line.getAttribute('y1') - cy);
        const near = (b) => Math.hypot(Math.max(b.left - host.left - cx, 0, cx - (b.right - host.left)), Math.max(b.top - host.top - cy, 0, cy - (b.bottom - host.top)));
        const boxes = [...document.querySelectorAll('.lz-lab, .lz-call, .lz-zone')].filter((e) => e.offsetWidth && !e.hidden && !e.classList.contains('lz-off') && +getComputedStyle(e).opacity > 0.5);
        return { rr, start, closest: Math.min(...boxes.map((e) => near(e.getBoundingClientRect()))) };
      });
      if (!r) continue;
      if (Math.abs(r.start - r.rr) > 1) throw new Error(`slide ${slide}: the leader starts ${r.start.toFixed(1)}px from the ring's centre, ring radius ${r.rr.toFixed(1)}px`);
      if (r.closest < r.rr + 2) throw new Error(`slide ${slide}: a label reaches within ${r.closest.toFixed(1)}px of the ring's centre (radius ${r.rr.toFixed(1)}px)`);
    }
  });

  await check(device, 'moving blood on the GPU: menu, origin, dye, reversal', async (page) => {
    await open(page, '?preset=cirr-hepatofugal');
    const kind = await page.evaluate(() => document.querySelector('#stageView').dataset.veins);
    if (kind !== 'webgl2') throw new Error(`expected the GPU figure, got ${kind}`);
    await page.waitForFunction(() => window.pps.stage.flowDir('PV_TRUNK')?.vd != null);
    // Hepatofugal: the portal vein's stream runs backward (to → from), with the model's flow.
    // (The display eases into a reversal over a couple of seconds.)
    await page.waitForFunction(() => { const r = window.pps.stage.flowDir('PV_TRUNK'); return r.q < 0 && r.vd < 0; }, null, { timeout: 60000 })
      .catch(async () => { throw new Error(`portal stream not reversed: ${JSON.stringify(await page.evaluate(() => window.pps.stage.flowDir('PV_TRUNK')))}`); });
    // Pause holds the stream still.
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => window.pps.store.get().running === false);
    await page.waitForTimeout(150);
    const d0 = await page.evaluate(() => window.pps.stage.flowDir('PV_TRUNK').D);
    await page.waitForTimeout(400);
    if (await page.evaluate(() => window.pps.stage.flowDir('PV_TRUNK').D) !== d0) throw new Error('paused blood kept moving');
    // The Blood menu (streaks, chevrons; what the figure shows), the Blood origin lens, dye.
    const fits = await page.evaluate(() => { const el = document.querySelector('#app.thumb #thumbBar [data-tab="layers"]') || document.querySelector('#btnBlood'), r = el.getBoundingClientRect(); return r.width >= 30 && r.left >= 0 && r.right <= innerWidth; });
    if (!fits) throw new Error('Blood button is clipped');
    await tapTool(page, '#btnBlood');
    const opts = await page.$$eval('.blood-pop .lens-opt .lens-t', (els) => els.map((e) => e.textContent));
    if (opts.join('|') !== 'Streaks|Chevrons|Key chevrons only|Pressure values|Potential collaterals|Organ names') throw new Error(`the Blood menu offers ${opts.join(', ')}`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.pps.store.set({ colorMode: 'origin', blood: { look: 'shimmer', chevrons: true } }));
    await page.waitForFunction(() => /Splenic vein|SV/.test(document.querySelector('#legend').textContent));
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await page.keyboard.press('j');
    if (!(await page.evaluate(() => window.pps.stage.dyeActive()))) throw new Error('J did not inject dye');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(900);
    if (!(await page.evaluate(() => document.querySelector('#stageView').classList.contains('gl-on')))) throw new Error('the circuit is not drawn on the GPU');
    await shot(page, `${device}-blood-circuit`);
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic', colorMode: 'pressure', blood: { look: 'shimmer', chevrons: false } }));
    await page.waitForTimeout(900);
    await shot(page, `${device}-blood`);
  });

  await check(device, 'vessels and plate on the GPU', async (page) => {
    await open(page, '?preset=cirr-decomp');
    const kind = await page.evaluate(() => document.querySelector('#stageView').dataset.veins);
    if (kind !== 'webgl2') throw new Error(`expected the WebGL2 veins, got ${kind}`);
    const on = (cls) => page.waitForFunction((c) => document.querySelector('#stageView').classList.contains(c), cls);
    await on('gl-on');
    await on('gl-plate');   // the organs, rasterized for the GPU
    if (await page.evaluate(() => window.pps.stage.organAt(560, 350)) !== 'liver') throw new Error('organs cannot be picked under the GPU plate');
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' }, colorMode: 'heat' }));
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(700);
    if (!(await page.evaluate(() => document.querySelector('#stageView').classList.contains('gl-on')))) throw new Error('the circuit left the GPU');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic', selection: null, colorMode: 'pressure' }));
    await on('gl-on');
    await shot(page, `${device}-veins-gl`);
  });

  await check(device, 'a presenter dive lands on its station in one move, with no other station labelled', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // Every frame the lobule's labels show, note the framing: they may show only at the slide's final framing.
    const watch = () => page.evaluate(() => {
      window.__lzSeen = []; window.__lzWatch = true;
      const tick = () => {
        const lz = document.querySelector('.lz'), lab = lz?.querySelector('.lz-labels');
        if (lz?.classList.contains('on') && !lz.classList.contains('lz-cam') && lab && +getComputedStyle(lab).opacity > 0.05) window.__lzSeen.push(window.pps.stage.lobuleViewKey());
        if (window.__lzWatch) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const settle = async () => { await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 }); await page.waitForTimeout(2200); };
    const verify = async (what) => {
      const { seen, end } = await page.evaluate(() => { window.__lzWatch = false; return { seen: window.__lzSeen, end: window.pps.stage.lobuleViewKey() }; });
      const other = [...new Set(seen)].filter((k) => k !== end);
      if (other.length) throw new Error(`${what}: labels showed at ${other.length} other framing(s) before the station (${other[0]} vs ${end})`);
    };
    // Straight from the anatomy to a portal tract.
    await watch();
    await page.evaluate(() => { window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); window.pps.store.set({ lobule: true }); });
    // As the presenter does once the dive lands: the slide's focus, which should have nothing left to do.
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 });
    await page.evaluate(() => window.pps.stage.lobuleFocus('triad', { zoom: 2.3, ms: 900 }));
    await settle();
    await verify('dive to the portal tract');
    // Out, then in again with a newer slide (the central vein) arriving mid-dive.
    await page.evaluate(() => window.pps.store.set({ lobule: false }));
    await page.waitForFunction(() => !window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 });
    await watch();
    await page.evaluate(() => { window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); window.pps.store.set({ lobule: true }); });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.pps.stage.lobuleAim('central', { zoom: 2.3 }));
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 });
    await page.evaluate(() => window.pps.stage.lobuleFocus('central', { zoom: 2.3, ms: 900 }));
    await settle();
    await verify('a newer station mid-dive');
  });
}
