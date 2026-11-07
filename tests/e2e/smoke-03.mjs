// Browser checks 3 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "circuit view, selection card, lenses" to "presenter: ${deck}".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ DECK_IDS, barFit, barSettle, cardGap, check, device, dir, open, shot, svCovered }) {
  await check(device, 'circuit view, selection card, lenses', async (page) => {
    await open(page, '?preset=csph');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(1200);
    await shot(page, `${device}-circuit`);
    // The liver's title opens the liver's card (there is no organ to click in the circuit).
    await page.locator('#labels .lb.zonecap.link', { hasText: 'LIVER' }).click();
    await page.waitForFunction(() => { const s = window.pps.store.get().selection; return s?.type === 'organ' && s.id === 'liver'; }, null, { timeout: 5000 })
      .catch((e) => { throw new Error('the LIVER title did not open the liver card', { cause: e }); });
    await page.waitForSelector('.action-card:not([hidden])');
    await page.evaluate(() => window.pps.store.set({ selection: null }));
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    for (const m of ['delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'pressure']) {
      await page.evaluate((m) => window.pps.store.set({ colorMode: m }), m);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await shot(page, `${device}-card`);
    // Doppler from the card opens the instrument and puts the card away
    await page.click('.action-card button:has-text("Doppler")');
    await page.waitForSelector('#pane-doppler', { state: 'visible' });
    await page.waitForFunction(() => !window.pps.store.get().selection);
    await page.locator('.action-card').waitFor({ state: 'hidden' });
  });

  // A damaged saved setting (half-written JSON, the wrong type, an unknown name) is ignored: the app still starts, the menu
  // lists the presentations and no error is thrown. (chart.js used to throw on a bad pps.chartOpen3 before anything drew.)
  if (device === 'desktop') await check(device, 'damaged saved settings do not stop the app from starting', async (page) => {
    await page.addInitScript(() => {
      const bad = { 'pps.chartOpen3': '{', 'pps.scripts': '{"id":1}', 'pps.instruments': '[', 'pps.blood2': '"x"', 'pps.theme': 'nope', 'pps.labelScale': 'big', 'pps.quality': 'x', 'pps.labels': '7' };
      try { for (const [k, v] of Object.entries(bad)) localStorage.setItem(k, v); } catch { /* no storage on this frame */ }
    });
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:hvpg"]');
    const t1 = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(600);
    if (!(await page.evaluate((t) => window.pps.store.get().frame.t > t, t1))) throw new Error('the model clock did not advance');
    if (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) throw new Error('an unknown saved theme was applied');
  });

  // The Interface zoom setting is gone: a value saved by it is dropped, and the page keeps its default size.
  if (device === 'desktop') await check(device, 'a saved interface zoom no longer applies', async (page) => {
    await page.addInitScript(() => { try { localStorage.setItem('pps.uiZoom', '1.4'); } catch { /* no storage on this frame */ } });
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:hvpg"]');
    const st = await page.evaluate(() => ({ zoom: document.documentElement.style.zoom, prop: document.documentElement.style.getPropertyValue('--ui-zoom'), saved: localStorage.getItem('pps.uiZoom') }));
    if (st.zoom || st.prop) throw new Error(`the saved interface zoom was applied: ${JSON.stringify(st)}`);
    if (st.saved !== null) throw new Error(`the saved interface zoom was kept: ${st.saved}`);
  });

  // A page left open across an update: its presentation engine's files no longer load (here the worker never answers and
  // its main-thread fallback fails). The show ends with a word, not a cover held up for ever. (The source site only: the
  // build bundles the engine under hashed names.)
  if (device === 'desktop' && dir === '.') await check(device, 'a presentation whose engine cannot load ends with a word instead of hanging', async (page) => {
    await open(page);
    await page.route(/\/worker\.js\?/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/\/worker-core\.js\?/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("gone");' }));
    await page.evaluate(() => window.pps.presenter.start('circulation', 0));
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting') && /could not be prepared/.test(document.getElementById('toasts').textContent), null, { timeout: 45000 });
  });

  // A slow first load: the engine worker's files arrive late (here 6 s), and the engine still runs in the worker, not on the
  // main thread for the whole session.
  // (worker.js?v=… on the source site, assets/worker-<hash>.js in the build)
  if (device === 'desktop') await check(device, 'a slow first load still runs the engine in its worker', async (page) => {
    await page.route(/\/worker(-\w+)?\.js(\?|$)/, async (r) => { await new Promise((res) => setTimeout(res, 6000)); await r.continue(); });
    await open(page);
    const kind = await page.evaluate(() => document.querySelector('#app').dataset.engine);
    if (kind !== 'worker') throw new Error(`the engine runs in ${kind}, not its worker`);
  });

  await check(device, 'menu, palette, presenter, instruments', async (page) => {
    // ?home=present opens the one menu: both columns side by side, or a bottom sheet on a phone.
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:hvpg"]');
    const sheet = await page.evaluate(() => document.querySelector('.umenu').classList.contains('sheet'));
    if (sheet !== (device === 'phone')) throw new Error(`the menu is ${sheet ? 'a sheet' : 'a popover'} on ${device}`);
    // Two tabs, Present first: only its list shows.
    const shown = await page.evaluate(() => [...document.querySelectorAll('.um-col')].filter((c) => c.offsetParent).map((c) => c.dataset.col).join());
    if (shown !== 'present') throw new Error(`the menu opened showing ${shown || 'nothing'}, not the Present tab`);
    await shot(page, `${device}-menu`);
    // Typing "hvpg" leaves one presentation; Enter presents it.
    await page.fill('.um-q', 'hvpg');
    const left = await page.evaluate(() => [...document.querySelectorAll('.um-col[data-col="present"] li:not([hidden]) > .um-row')].filter((r) => r.offsetParent).length);
    if (left !== 1) throw new Error(`"hvpg" left ${left} presentations`);
    // "budd" has no presentation: the note offers the matching patient in the other tab.
    await page.fill('.um-q', 'budd');
    await page.waitForSelector('.um-other:not([hidden])');
    await page.fill('.um-q', 'hvpg');
    await page.press('.um-q', 'Enter');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
    // A patient row loads that patient and marks it current.
    await page.click('#btnMenu');
    await page.click('#umtab-patients');
    await page.click('.um-row[data-k="p:schisto"]');
    await page.waitForFunction(() => window.pps.store.get().presetId === 'schisto' && !window.pps.menu.isOpen());
    await page.click('#btnMenu');
    await page.waitForSelector('.um-row[data-k="p:schisto"][aria-current="true"]', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.umenu'));
    await page.evaluate(() => window.pps.palette.open());
    await page.waitForSelector('.pal-back:not([hidden])');
    // (Search: an arrow key or a pointer over another row moves the highlight and aria-selected on two rows; the rows stay the same nodes.)
    await page.keyboard.type('portal');
    await page.waitForFunction(() => document.querySelectorAll('.pal-item').length > 2);
    const glide = await page.evaluate(() => {
      const list = document.getElementById('pal-list'), kept = [...list.children], input = document.querySelector('.pal-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const rows = [...list.querySelectorAll('.pal-item')];
      return { same: kept.length === list.children.length && kept.every((n, i) => n === list.children[i]), active: input.getAttribute('aria-activedescendant'), selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.id), hl: !!list.querySelector('.pal-glide') };
    });
    if (!glide.same || glide.active !== 'pal-opt-1' || glide.selected.join() !== 'pal-opt-1' || !glide.hl) throw new Error(`search: an arrow key rebuilt the list or left the highlight behind (${JSON.stringify(glide)})`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.pps.dock.show('profile', { reveal: true }));
    await page.waitForTimeout(500);
    await shot(page, `${device}-instruments`);
  });

  if (device === 'desktop') await check(device, 'presenter on an upright iPad: type at landscape scale, words clear of the data card', async (page) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('circulation', 1));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const fs = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      const t = r('.pz-text'), d = r('.pz-data');
      const wide = [...document.querySelectorAll('.pz-text *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length;
      return { h: fs('.pz-h'), line: fs('.pz-line'), wide, overlap: !!(t && d && d.width && t.right > d.left && t.left < d.right && t.bottom > d.top && t.top < d.bottom) };
    });
    // (Sized by the height, an upright iPad's 1180 px set the title at 57 px in a 300 px column. Since 1f25c95 an upright iPad
    // takes the phone's layout and its 1.7x slide words (a77f314): its body is 23.3 px there, the bound 24.)
    if (m.h > 40 || m.line > 24) throw new Error(`upright iPad presenter type too large: title ${m.h}px, body ${m.line}px`);
    if (m.overlap) throw new Error('upright iPad presenter: the words overlap the data card');
    if (m.wide) throw new Error(`upright iPad presenter: ${m.wide} element(s) of the words overflow sideways`);
  });

  // Text that runs into other text, in what the selector names (each text box once, boxes of one element never compared).
  const textClash = (page, sel) => page.evaluate((sel) => {
    const root = document.querySelector(sel); if (!root || !root.getClientRects().length) return ['none shown: ' + sel];
    const tr = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), out = [];
    for (let x; (x = w.nextNode());) { if (!x.textContent.trim() || x.parentElement.closest('.sr-only, [hidden]')) continue; const g = document.createRange(); g.selectNodeContents(x); for (const q of g.getClientRects()) if (q.width) tr.push([q, x.textContent.trim().slice(0, 16), x.parentElement]); }
    for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) { const [a, ta, ea] = tr[i], [c, tc, ec] = tr[j]; if (ea !== ec && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 3) out.push(`"${ta}" runs into "${tc}"`); }
    return out;
  }, sel);
  // The Doppler data card's report is two narrow columns on an upright iPad: its 32 px direction word once ran into the readings beside it.
  if (device === 'desktop') await check(device, 'presenter on an upright iPad: the Doppler data card\'s words never run into each other', async (page) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    for (const n of [2, 10]) {   // (toward the liver; no signal)
      await open(page, `?script=doppler&slide=${n}`);
      await page.waitForFunction(() => document.querySelector('.pz-data .dop-report')?.getClientRects().length && document.querySelector('.pz-data .dop-vel b')?.textContent.trim(), null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const bad = await textClash(page, '.pz-data .dop-report');
      if (bad.length) throw new Error(`Doppler slide ${n}: ${bad.slice(0, 3).join('; ')}`);
    }
  });
  // The Doppler monitor's top strip beside a tile (TIPS Doppler's narrowed stent, Mac and iPad sizes): every word whole inside the monitor,
  // the pattern ("High velocity") never dropped or cut to an ellipsis, the type never under 0.8 of its size. (It was hidden on a
  // 1440 x 900 Mac, and printed cut at "Low velocity, je…".)
  if (device === 'desktop') await check(device, 'presenter: the Doppler strip beside a tile keeps every word whole inside the monitor', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const deck = withOverview(DECKS.find((d) => d.id === 'tips-doppler'));
    for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const id of ['narrow', 'fix']) {
        await open(page, `?script=tips-doppler&slide=${deck.slides.findIndex((s) => s.id === id) + 1}`);
        await page.waitForFunction(() => document.querySelector('.pz-data:not(.pz-hide) .dop-pattern')?.textContent.trim() && document.querySelector('.pz-data:not(.pz-hide) .dop-pattern').closest('.dop-report').style.getPropertyValue('--dop-k'), null, { timeout: 60000 });
        // (a short window folds the instrument behind Show: opened, as a presenter would)
        if (await page.evaluate(() => { const f = document.querySelector('.pz-data:not(.pz-hide) .pz-fold'); if (f?.getClientRects().length && f.getAttribute('aria-expanded') === 'false') { f.click(); return true; } return false; })) await page.waitForTimeout(1500);
        await page.waitForTimeout(800);
        const bad = await page.evaluate(() => {
          const rep = document.querySelector('.pz-data:not(.pz-hide) .dop-report'), mon = rep.closest('.dop-main').querySelector('.dop-box').getBoundingClientRect(), out = [];
          const k = +rep.style.getPropertyValue('--dop-k');
          if (k < 0.8) out.push(`type at ${k}`);
          // (the reading and the direction share the strip's first line; only the pattern may take a line of its own)
          const v = rep.querySelector('.dop-vel').getBoundingClientRect(), d = rep.querySelector('.dop-dir').getBoundingClientRect();
          if (d.top >= v.bottom - 2) out.push(`"${rep.querySelector('.dop-dir').textContent}" dropped under the reading`);
          for (const e of rep.querySelectorAll('.dop-vel, .dop-dir, .dop-pattern')) {
            if (e.hidden || !e.getClientRects().length) { out.push(`"${e.textContent}" hidden`); continue; }
            const g = document.createRange(); g.selectNodeContents(e); const q = g.getBoundingClientRect();
            if (q.right > mon.right - 3 || q.left < mon.left) out.push(`"${e.textContent}" runs ${Math.round(q.right - mon.right + 3)} px past the monitor`);
            if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') out.push(`"${e.textContent}" cut to an ellipsis`);
          }
          return out;
        });
        if (bad.length) throw new Error(`${w} x ${h}, TIPS Doppler ${id}: ${bad.join('; ')}`);
      }
    }
  });
  // A phone held sideways: Tests > Doppler on a TIPS keeps its range bar and tiles under the monitor, never over it (the monitor's
  // size-contained box gave the grid only its 100 px floor, and they were laid over its lower half), and its words inside it.
  if (device === 'phone') await check(device, 'phone sideways: Tests > Doppler shows the monitor, range bar and tiles side by side, none over another', async (page) => {
    for (const [w, h] of [[568, 320], [667, 375], [844, 390], [932, 430]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, '?preset=cirr-decomp');
      await page.evaluate(() => window.pps.updateParams({ tips: { on: true, d: 9 } }));
      await page.evaluate(() => window.pps.dock.show('doppler'));
      await page.waitForTimeout(800);
      await page.evaluate(() => { const s = document.querySelector('#pane-doppler .dop-vessel'); s.value = 'TIPS'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      for (const seg of ['Proximal', 'Mid', 'Distal']) {
        await page.evaluate((k) => [...document.querySelectorAll('#pane-doppler .dop-seg')].find((b) => b.textContent === k)?.click(), seg);
        await page.waitForFunction(() => /\d/.test(document.querySelector('#pane-doppler .dop-vel b')?.textContent || ''), null, { timeout: 30000 });
        await page.waitForTimeout(600);
        const bad = await page.evaluate(() => {
          const q = (s) => document.querySelector('#pane-doppler ' + s), cv = q('.dop-box canvas').getBoundingClientRect(), out = [];
          for (const s of ['.dop-range', '.dop-stats', '.dop-note']) { const e = q(s); if (!e || !e.getClientRects().length || getComputedStyle(e).display === 'none') continue; const r = e.getBoundingClientRect(); if (r.height && r.top < cv.bottom - 1 && r.bottom > cv.top + 1 && r.left < cv.right - 1 && r.right > cv.left + 1) out.push(`${s} over the monitor by ${Math.round(Math.min(cv.bottom - r.top, cv.right - r.left))} px`); }
          for (const s of ['.dop-vel', '.dop-dir', '.dop-pattern']) { const e = q(s); if (!e.textContent || e.hidden) continue; const g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(); if (r.width && (r.right > cv.right - 3 || r.bottom > cv.bottom)) out.push(`"${e.textContent}" outside the monitor`); if (parseFloat(getComputedStyle(e).fontSize) < 12) out.push(`"${e.textContent}" under 12 px`); }
          // (everything on screen at once: the monitor, the range bar and the tiles inside the card's visible height)
          const pane = document.querySelector('#pane-doppler').getBoundingClientRect();
          for (const s of ['.dop-box canvas', '.dop-stats']) { const r = q(s).getBoundingClientRect(); if (r.bottom > Math.min(pane.bottom, innerHeight) + 1) out.push(`${s} runs ${Math.round(r.bottom - Math.min(pane.bottom, innerHeight))} px below the card`); }
          return out;
        });
        if (bad.length) throw new Error(`${w} x ${h}, ${seg}: ${bad.join('; ')}`);
      }
    }
  });
  // A phone's top bar keeps the lens scale 40 px wide: its numbers never run into each other (0, 10, 20 and 30 once did).
  if (device === 'phone') await check(device, 'phone top bar: the lens scale numbers never run into each other', async (page) => {
    for (const width of [390, 375]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, '?preset=cirr-decomp');
      await page.waitForTimeout(800);
      const bad = await textClash(page, '.lg-scale');
      if (bad.length) throw new Error(`${width} px: ${bad.slice(0, 3).join('; ')}`);
    }
  });

  // Circulation slide 10 ("After a meal"): the coronary and splenic veins, their glow and the figure's labels sit in the band the data card
  // (top) and the words (bottom sheet) leave, and clear of the controls' pill (read from the pill itself).
  if (device === 'phone') await check(device, 'presenter on a phone: Circulation slide 10 frames the coronary and splenic veins clear of the data card, the words and the pill', async (page) => {
    const GLOW = 8;   // px of glow around a vein
    for (const [w, h] of [[390, 844], [375, 667]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.evaluate(() => window.pps.presenter.start('circulation', 9));
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
      let r = null, prev = null, still = 0;
      for (let t = 0; t < 50 && !(r?.ok && still >= 4); t++) {
        await page.waitForTimeout(300);
        r = await page.evaluate((glow) => {
          const st = window.pps.stage, svg = document.querySelector('#stage'), cam = st.cameraState(), m = svg.getScreenCTM();
          const rect = (e) => e.getBoundingClientRect(), data = document.querySelector('.pz-data'), sheet = document.querySelector('.pz-safe');
          if (!data || !sheet || data.hidden || !rect(data).height) return { ok: false, why: 'the slide is not in yet', key: '' };
          const top = rect(data).bottom, bottom = rect(sheet).top, W = innerWidth, pill = rect(document.querySelector('.pz-bar'));
          const px = (x, y) => { const p = svg.createSVGPoint(); p.x = cam.k * x + cam.x; p.y = cam.k * y + cam.y; const q = p.matrixTransform(m); return [q.x, q.y]; };
          const veins = { 'coronary vein': ['LGV_CONF', 'V_STO'], 'splenic vein': ['SV_CONF', 'V_SPL'] };
          const bad = [], boxes = [];
          for (const [name, ids] of Object.entries(veins)) {
            const b = st.focusBox({ edges: ids });
            if (!b) { bad.push(`${name} is not drawn`); continue; }
            const [x0, y0] = px(b[0], b[1]), [x1, y1] = px(b[2], b[3]);
            boxes.push([name, x0 - glow, y0 - glow, x1 + glow, y1 + glow]);
          }
          for (const l of document.querySelectorAll('.lb-blocks g.lb')) {
            const q = rect(l);
            if (q.width && q.height && +getComputedStyle(l).opacity > 0.05) boxes.push([`the "${l.textContent.trim().slice(0, 18)}" label`, q.left, q.top, q.right, q.bottom]);
          }
          for (const [name, x0, y0, x1, y1] of boxes) {
            if (y0 < top - 0.5) bad.push(`${name} reaches ${Math.round(top - y0)} px under the data card`);
            if (y1 > bottom + 0.5) bad.push(`${name} reaches ${Math.round(y1 - bottom)} px under the words`);
            if (x0 < -0.5 || x1 > W + 0.5) bad.push(`${name} runs off the side of the screen`);
            if (x0 < pill.right && x1 > pill.left && y0 < pill.bottom && y1 > pill.top) bad.push(`${name} sits under the controls' pill`);
          }
          return { ok: !bad.length, why: bad.join('; '), key: st.cameraKey() + '|' + Math.round(top) + '|' + Math.round(bottom) };
        }, GLOW);
        still = r.key && r.key === prev ? still + 1 : 0; prev = r.key;
      }
      if (!r?.ok) throw new Error(`Circulation slide 9 at ${w}x${h}: ${r?.why || 'never settled'}`);
    }
  });

  // Each slide of two decks, at each size (the desktop run also tries an upright iPad). The bar's size and the spacing of its
  // controls are the same on every slide (Next turning into Finish moved them once). A bar centred at the bottom keeps one
  // spot, and so does a phone's pill; every frame in which it shows is at that spot, never elsewhere.
  // Once each slide is in, the controls' icons and count may not cover any of the card's words or its table, and a phone's
  // pill keeps clear of them (see barFit). (A phone's bar once stayed where the slide before had it, over the summary card's table.)
  // Three decks are walked from the start (endoscopy: its data card sits at the top); one more only over its last slides, the summary card among them.
  // (One check per deck and size: in one piece it took 26 minutes on a desktop runner, longer than a share should hold.)
  for (const size of device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null]) for (const [deck, from] of [['circulation', 0], ['lobule', 0], ['endoscopy', 0], ['hvpg', -2]]) await check(device, `presenter: the controls never glide between slides, and keep their size and spacing, first and last included: ${deck}${size ? ' on an upright iPad' : ''}`, async (page) => {
    {
      if (size) await page.setViewportSize(size);
      await open(page);
      await page.evaluate(([id, at]) => window.pps.presenter.start(id, at), [deck, from]);
      if (from < 0) {   // (the deck's length is known once it runs: go to its last slides)
        await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('.pzb-n')?.textContent || ''), null, { timeout: 60000 });
        const n = await page.evaluate(() => +document.querySelector('.pzb-n').textContent.split('/')[1]);
        await page.evaluate(([id, at]) => window.pps.presenter.start(id, at), [deck, n + from]);
      }
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
      const where = `${deck} at ${size ? 'upright iPad' : device}`;
      const read = () => page.evaluate(() => {
        const bar = document.querySelector('.pz-bar'), b = bar.getBoundingClientRect(), q = (el) => { const r = el.getBoundingClientRect(); return [r.left - b.left, r.top - b.top, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
        const m = new DOMMatrix(getComputedStyle(bar).transform);   // (an idle bar fades and sinks 8 px by design: its spot is where it rests, without that nudge)
        return { n: document.querySelector('.pzb-n')?.textContent.trim(), at: [b.left - m.m41, b.top - m.m42], boxes: [[0, 0, b.width, b.height], ...[...bar.children].filter((c) => !c.classList.contains('pzb-q')).map(q)] };
      });
      const fits = async (n) => { if ((await barSettle(page)) !== 'ok') throw new Error(`${where}, slide ${n}: ${await barFit(page) || 'the slide never settled'}`); };
      let ref = null, slides = 0;
      await page.waitForTimeout(1000);
      for (let guard = 0; guard < 80; guard++) {
        await fits((await read()).n);
        const cur = await read();
        if (!ref) ref = cur;
        else {
          if (cur.boxes.length !== ref.boxes.length || cur.boxes.some((b, i) => b.some((v, j) => Math.abs(v - ref.boxes[i][j]) > 1))) throw new Error(`${where}: the controls' size or spacing changed on slide ${cur.n} (${JSON.stringify(cur.boxes)} vs ${JSON.stringify(ref.boxes)})`);
          if (Math.abs(cur.at[0] - ref.at[0]) > 1 || Math.abs(cur.at[1] - ref.at[1]) > 1) throw new Error(`${where}: the bar moved on slide ${cur.n} (${cur.at} vs ${ref.at})`);
        }
        slides++;
        const [a, b] = cur.n.split('/').map((x) => +x);
        if (a === b) break;
        // Press Next while watching every frame of the bar until the next slide has settled.
        await page.evaluate(() => { const bar = document.querySelector('.pz-bar'); window.__bs = []; const f = () => { const r = bar.getBoundingClientRect(); window.__bs.push([r.left, r.top, +getComputedStyle(bar).opacity]); window.__braf = requestAnimationFrame(f); }; f(); });
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(1050);
        const seen = await page.evaluate(() => { cancelAnimationFrame(window.__braf); return window.__bs; });
        const to = seen[seen.length - 1], from = seen[0], near = (p, q) => Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1;
        const glide = seen.find((p) => p[2] > 0.05 && !near(p, from) && !near(p, to));
        if (glide) throw new Error(`${where}: the bar glided on the way to slide ${a + 1}: it showed at ${Math.round(glide[0])},${Math.round(glide[1])} between ${from.slice(0, 2).map(Math.round)} and ${to.slice(0, 2).map(Math.round)}`);
      }
      if (slides < (from < 0 ? -from : 5)) throw new Error(`${where}: only ${slides} slide(s) walked`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
    }
  });

  // Every slide of every deck on a phone (390x844 and 375x667): the controls' pill sits fixed at the lower right, over none of
  // the words, no other card and no label, and each card starts with its title (see barFit).
  // (Every deck at both sizes: CI splits the phone checks over sixteen runners so each stays well under its limit.)
  // (Slides with a live data card at the top once kept them at the slide before's spot, over the figure or the card.)
  if (device === 'phone') for (const deck of DECK_IDS) for (const size of [null, { width: 375, height: 667 }]) await check(device, `presenter: on every slide of ${deck}${size ? ' at 375x667' : ''} the controls' pill stays at the lower right, clear of the words`, async (page) => {
    if (size) await page.setViewportSize(size);
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    for (let guard = 0; guard < 80; guard++) {
      const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim());
      if ((await barSettle(page)) !== 'ok') throw new Error(`${deck}, slide ${n}: ${await barFit(page) || 'the slide never settled'}`);
      const gap = await cardGap(page);
      if (gap) throw new Error(`${deck}, slide ${n}: ${gap}`);
      const sv = await svCovered(page);
      if (sv) throw new Error(`${deck}, slide ${n}: ${sv}`);
      const dl = badDelta(await cardTiles(page));
      if (dl) throw new Error(`${deck}, slide ${n}: ${dl}`);
      // (A folding tool: Show then Hide must leave the card hugging its contents, as on arrival.)
      const fold = page.locator('.pz-data:not(.pz-hide):not([hidden]) .pz-fold');
      if (await fold.isVisible().catch(() => false)) {
        for (const want of ['true', 'false']) {
          await page.evaluate(() => document.querySelector('.pz-data:not(.pz-hide):not([hidden]) .pz-fold').click());
          await page.waitForFunction((w) => document.querySelector('.pz-data .pz-fold')?.getAttribute('aria-expanded') === w, want);
          // (The fold eases, then the card is fitted again: give it until it settles, up to 3 s.)
          let g = null;
          for (let w = 0; w < 10; w++) { await page.waitForTimeout(300); g = await cardGap(page); if (!g) break; }
          if (g && want === 'false') throw new Error(`${deck}, slide ${n}, after Show then Hide: ${g}`);
          // (Opened, no two stacked sections of the card touch: the readout, a bar, the lab tiles and the card's own tiles keep a gap.)
          const tight = want === 'true' && await page.evaluate(() => {
            const card = document.querySelector('.pz-data:not(.pz-hide):not([hidden])');
            const shown = (e) => { const st = getComputedStyle(e), r = e.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && !/absolute|fixed/.test(st.position) && !e.matches('.pz-grip') && r.height > 1 && r.width > 1; };
            for (const box of [card, ...card.querySelectorAll('.pz-tool .ab-read, .pz-tool .pz-inst, .pz-tool .dop-main, .pz-tool .hv-main')]) {
              const kids = [...box.children].filter(shown).map((e) => [e, e.getBoundingClientRect()]);
              for (const [a, ra] of kids) for (const [b, rb] of kids) {
                if (a === b || rb.top < ra.bottom - 1 || ra.right <= rb.left || rb.right <= ra.left) continue;
                if (kids.some(([c, rc]) => c !== a && c !== b && rc.top >= ra.bottom - 1 && rc.bottom <= rb.top + 1)) continue;   // (not neighbours)
                if (rb.top - ra.bottom < 4) return `${a.className.split(' ')[0]} sits ${Math.round(rb.top - ra.bottom)} px from ${b.className.split(' ')[0]}`;
              }
            }
            return null;
          });
          if (tight) throw new Error(`${deck}, slide ${n}, opened card: ${tight}`);
        }
      }
      const [a, b] = n.split('/').map((x) => +x);
      if (a === b) break;
      // (On a time-lapse, Next first runs it to its end: press again until the slide changes.)
      for (let k = 0; k < 4; k++) {
        await page.keyboard.press('ArrowRight');
        if (await page.waitForFunction((was) => document.querySelector('.pzb-n')?.textContent.trim() !== was, n, { timeout: 15000 }).then(() => true, () => false)) break;
      }
      await page.waitForTimeout(300);
    }
  });

  // The data card's tiles as shown: each value, and its change line read back as numbers (value, sign × change, from).
  // (In the page, so a recorder can sample them without a round trip.)
  const TILES_JS = `() => {
    const num = (t) => parseFloat(String(t).replace('−', '-').replace(/[^0-9.+-]/g, ''));
    return [...document.querySelectorAll('.pz-data:not(.pz-hide):not([hidden]) .pz-tile')].map((t) => {
      const v = t.querySelector('.pzt-v')?.textContent.trim(), d = t.querySelector('.pzt-d')?.textContent.trim() || '';
      const m = d.match(/^([▲▼])\\s*(?:Up |Down )?([0-9.]+).*from ([−0-9.-]+)/);
      return { k: t.querySelector('.pzt-k')?.textContent.trim(), v, d, val: num(v), dd: m ? (m[1] === '▼' ? -1 : 1) * num(m[2]) : d.startsWith('No change') ? 0 : null, from: m ? num(m[3]) : null };
    });
  }`;
  const cardTiles = (page) => page.evaluate(`(${TILES_JS})()`);
  // "▲ X from Y" must add up: the value shown is Y plus the change, to the last digit shown.
  const badDelta = (tiles) => tiles.filter((t) => t.dd != null && t.from != null && Math.abs(t.val - t.from - t.dd) > 1e-6).map((t) => `${t.k} ${t.v} reads "${t.d}"`).join('; ');

  // The slide a presentation starts on never waits on its case card, even on a machine slow enough that the start's cover
  // gives up (12 s) before the slide arrives: it once waited there for a tap, and every check that started a deck on the slide
  // before a time-lapse (Varices 2, a case) timed out. Here the cover gives up at once.
  if (device === 'desktop') await check(device, 'presenter: a start on a case slide lands on it, with no case card, however slow the start', async (page) => {
    await open(page);
    await page.evaluate(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 12000 ? 0 : ms, ...a); });
    await page.evaluate(() => window.pps.presenter.start('varices', 0));
    await page.waitForFunction(() => window.pps.presenter.probe()?.i === 0, null, { timeout: 60000 });
    await page.evaluate(() => window.pps.presenter.start('varices', 1));
    const came = await page.waitForFunction(() => window.pps.presenter.probe()?.i === 1, null, { timeout: 60000, polling: 250 }).then(() => true, () => false);
    if (!came) throw new Error(`Varices slide 2 never arrived (a case card up: ${await page.evaluate(() => !!document.querySelector('.pz-case.on'))})`);
    if (await page.evaluate(() => !!document.querySelector('.pz-case.on'))) throw new Error('Varices slide 2 landed under its case card');
  });

  // A time-lapse slide's card shows the state the time-lapse plays from on its first frames (not its end, nor the slide before),
  // climbs from there with no snap back, ends on the slide's state, and every change line adds up.
  // (A numbers-only card is held back until the days have run (cbb1919: the cards come in after the change settles), so it
  // first shows after the end, never while held, and is not judged on its first frames.)
  if (device === 'desktop') for (const deck of DECK_IDS) await check(device, `presenter: ${deck}'s time-lapse cards start from the model's start state and climb without a snap`, async (page) => {
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    const laps = (await page.evaluate(() => window.pps.presenter.probe())).lapses;
    for (const at of laps) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, at - 1]);
      // (The slide before may be a time-lapse too: it plays to its end first.)
      await page.waitForFunction((i) => window.pps.presenter.probe()?.i === i && !window.pps.presenter.probe().playing, at - 1, { timeout: 240000, polling: 500 });
      await page.waitForTimeout(1500);
      // A recorder in the page: every 50 ms, once the slide's number is up, the card's tiles and the slide shown.
      await page.evaluate(([at, js]) => {
        const read = (0, eval)(js), rec = window.__lapRec = [];
        window.__lapT = setInterval(() => {
          if (!document.querySelector('.pzb-n')?.textContent.trim().startsWith(`${at + 1} `)) return;
          const p = window.pps.presenter.probe();
          rec.push({ t: Math.round(performance.now()), i: p.i, playing: p.playing, start: p.start, end: p.end, n: p.keys.length, tiles: read(), done: !!document.querySelector('.pz-lapse.done'), held: 'hold' in (document.querySelector('.pz-data')?.dataset || {}) });
        }, 50);
      }, [at, TILES_JS]);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((at) => window.__lapRec.some((r) => r.i === at && r.done && !r.playing), at, { timeout: 240000, polling: 500 })
        .catch(async () => { throw new Error(`${deck} slide ${at + 1}: the time-lapse never ended (last: ${JSON.stringify(await page.evaluate(() => [window.__lapRec.length, window.__lapRec.at(-1), document.querySelector('.pzb-n')?.textContent]))})`); });
      await page.waitForTimeout(1500);
      // (A held card comes in once the end's ease and the cards' fit have run: up to 15 s on a slow machine.)
      if (await page.evaluate(() => window.__lapRec.some((r) => r.held))) await page.waitForFunction(() => { const p = window.__lapRec.findLast((r) => r.start && r.end); return p && window.__lapRec.some((r) => !r.held && r.tiles.length === p.n); }, null, { timeout: 15000, polling: 250 }).catch(() => {});
      const rec = await page.evaluate(() => { clearInterval(window.__lapT); return window.__lapRec; });
      const p = rec.findLast((r) => r.start && r.end), at1 = `${deck} slide ${at + 1}`;
      if (!p) throw new Error(`${at1}: the slide never counted as shown (${rec.length} samples, ${JSON.stringify(rec.slice(-2))})`);
      // Every sample with the full card: the values as the model has them at the start, then a climb with no jump.
      const full = rec.filter((r) => r.tiles.length === p.n);
      if (!full.length) throw new Error(`${at1}: the card never showed`);
      for (const r of full) { const bad = badDelta(r.tiles); if (bad) throw new Error(`${at1}: ${bad}`); }
      const held = rec.some((r) => r.held), first = full[0].tiles, off = held ? [] : first.filter((x, j) => x.v !== p.start[j]);
      if (held && (full[0].held || full[0].playing)) throw new Error(`${at1}: the held card showed before the days had run`);
      if (off.length) throw new Error(`${at1} opens on ${off.map((x) => `${x.k} ${x.v}`).join(', ')}, but the model starts at ${p.start.join(', ')}`);
      // No snap or reset: sample to sample, no tile moves back away from where the time-lapse ends by more than a small wobble
      // (two last digits and 15% of its whole change). (Not a speed limit: a slow machine samples sparsely.)
      const num = (v) => parseFloat(v.replace('−', '-')), s0 = p.start.map(num), s1 = p.end.map(num);
      for (let n = 1; n < full.length; n++) full[n].tiles.forEach((x, j) => {
        const unit = 2 * 10 ** -((p.end[j].split('.')[1] || '').length) + 0.15 * Math.abs(s1[j] - s0[j] || 0), was = full[n - 1].tiles[j];
        if (Math.abs(x.val - s1[j]) > Math.abs(was.val - s1[j]) + unit) throw new Error(`${at1}: ${x.k} goes back from ${was.v} to ${x.v} (start ${p.start[j]}, end ${p.end[j]})`);
      });
      // (Once the numbers have eased onto the slide's state, up to 15 s on a slow machine.)
      await page.waitForFunction(([js, end]) => (0, eval)(js)().every((x, j) => x.v === end[j]), [TILES_JS, p.end], { timeout: 15000, polling: 500 }).catch(() => {});
      const last = await cardTiles(page), endOff = last.filter((x, j) => x.v !== p.end[j]);
      if (endOff.length) throw new Error(`${at1} ends on ${endOff.map((x) => `${x.k} ${x.v}`).join(', ')}, model ${p.end.join(', ')}`);
    }
  });

  // A time-lapse's chart in the card (flow-time.js: the meal, ascites building, varices growing) gains its points live as the
  // slide plays, one after another, never going back, and ends with every point; on a phone, an upright iPad and a desktop.
  for (const size of device === 'phone' ? [null] : [{ width: 820, height: 1180 }, null]) for (const deck of ['circulation', 'ascites', 'varices']) await check(device, `presenter: ${deck}'s time-lapse chart gains its points as the slide plays${size ? ` at ${size.width}x${size.height}` : ''}`, async (page) => {
    if (size) await page.setViewportSize(size);
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    const charts = (await page.evaluate(() => window.pps.presenter.probe())).charts;
    if (!charts.length) throw new Error(`${deck}: no time-lapse chart`);
    for (const at of charts) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, at - 1]);
      await page.waitForFunction((i) => window.pps.presenter.probe()?.i === i && !window.pps.presenter.probe().playing, at - 1, { timeout: 240000, polling: 500 });
      await page.waitForTimeout(800);
      // A recorder in the page: every count of points the chart draws on this slide (each paint, not a sampled few).
      await page.evaluate((at) => {
        const rec = window.__ptRec = [];
        window.__ptT = new MutationObserver(() => {
          const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child'), p = window.pps.presenter.probe();
          if (p.i === at && svg?.dataset.points && +svg.dataset.points !== rec.at(-1)?.n) rec.push({ n: +svg.dataset.points, playing: p.playing });
        });
        window.__ptT.observe(document.querySelector('.pz-data'), { subtree: true, attributes: true, attributeFilter: ['data-points'] });
      }, at);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((at) => window.pps.presenter.probe().playing || window.__ptRec.length > 2, at, { timeout: 240000, polling: 200 });
      await page.waitForFunction((at) => window.pps.presenter.probe().i === at && !window.pps.presenter.probe().playing, at, { timeout: 240000, polling: 500 });
      // (Then the heads ease onto the last point, up to 60 s on a slow machine.)
      await page.waitForFunction(() => { const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child'); return svg.dataset.points === svg.dataset.of; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
      const rec = await page.evaluate(() => { window.__ptT.disconnect(); return window.__ptRec.map((r) => r.n); });
      // (Points between the first and the last: a slow machine samples sparsely, so a few are enough; the talk trace had none.)
      const steps = new Set(rec.filter((n) => n > rec[0])).size, back = rec.findIndex((n, j) => j && n < rec[j - 1]), full = await page.evaluate(() => {
        const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child');
        return [+svg.dataset.points, svg.querySelectorAll('.ptk-line')[0]._pts.n, +svg.dataset.of];
      });
      const at1 = `${deck} slide ${at + 1}${size ? ` at ${size.width}x${size.height}` : ''}`;
      if (back > 0) throw new Error(`${at1}: the chart lost points (${rec[back - 1]} to ${rec[back]})`);
      if (steps < 5) throw new Error(`${at1}: the chart grew in only ${steps} step(s) while the slide played (${rec.slice(0, 40).join(',')})`);
      if (full[0] !== full[2] || full[1] < 30) throw new Error(`${at1}: the chart ends with ${full[0]} of its ${full[2]} points (${full[1]} on its line)`);
      // Its words are 12 px or more on the screen, the card's own zoom included (they were 9.6 px on a Mac, 8 px on an iPad held sideways).
      const small = await page.evaluate(() => { const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child'), k = svg.getScreenCTM().a;
        return [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => [t.textContent.trim(), parseFloat(getComputedStyle(t).fontSize) * k]).filter(([, px]) => px < 11.95).map(([s, px]) => `"${s}" ${px.toFixed(1)} px`); });
      if (small.length) throw new Error(`${at1}: the chart's words under 12 px: ${small.slice(0, 4).join(', ')}`);
    }
  });
}
