// Browser checks 9 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "one type and icon scale in every menu and card" to "leaders reach their labels in every frame: lobule dive, glide and rise, anatomy zoom".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ check, device, leaderFrames, open, pickView, shot, stationRoom, tapTool }) {
  // One type scale and one icon scale (styles/tokens.css): every menu, card and sheet the owner can
  // open uses only the five interface sizes and three weights, icons come in 16, 20 and 24 (12 for a
  // check mark in a dot), and every button has a name. Figure artwork (the anatomy's labels, the
  // lobule's labels, the bedside monitor, charts drawn in SVG or on a canvas) has its own sizes.
  await check(device, 'one type and icon scale in every menu and card', async (page) => {
    const surfaces = [
      ['explore', null], ['menu', '#btnMenu'], ['blood', '#btnBlood'], ['colors', '#btnLayers'],
      ['treat', '#btnTreat'], ['measure', '#tabInstruments'], ['search', '#btnPalette'],
      ['vessel card', { type: 'edge', id: 'PV_TRUNK' }], ['liver card', { type: 'organ', id: 'liver' }],
      ['help', '?'], ['menu from a link', 'home'],
    ];
    const bad = new Set();
    await open(page, '?preset=cirr-decomp');
    for (const [name, how] of surfaces) {
      // one load for all of them: close whatever the last one opened
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await page.evaluate(() => { window.pps.store.set({ selection: null }); if (document.querySelector('#app').classList.contains('panel-open')) document.querySelector('#panelClose').click(); });
      if (how === 'home') await open(page, '?home=explore');
      if (typeof how === 'string' && how.startsWith('#')) await page.evaluate((s) => document.querySelector(s)?.click(), how);
      else if (how === '?') await page.keyboard.press('?');
      else if (how && typeof how === 'object') await page.evaluate((sel) => window.pps.store.set({ selection: sel }), how);
      await page.waitForTimeout(500);
      const found = await page.evaluate(() => {
        const ART = '#stage, #labels, .lz-lab, .lz-zone, .mon, .legend, svg';
        const DISPLAY = '.presenter-title, .big-overlay';
        const SIZES = [12, 14, 16, 20, 28], WEIGHTS = [400, 500, 600], ICONS = [16, 20, 24];
        const shown = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden'; };
        const who = (el) => { const c = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') : ''; return `${c(el.parentElement)} > ${c(el)}`; };
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (!shown(el) || el.closest('.lz:not(.on)')) continue;
          if (!el.closest(ART) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
            const st = getComputedStyle(el), fs = parseFloat(st.fontSize), fw = +st.fontWeight;
            if (!SIZES.includes(fs) && !el.closest(DISPLAY)) out.push(`${who(el)}: ${fs}px`);
            if (!WEIGHTS.includes(fw)) out.push(`${who(el)}: weight ${fw}`);
          }
          if (el.matches('svg') && el.querySelector(':scope > use[href^="#i-"]') && !el.closest('#stage, #labels')) {
            const w = Math.round(el.getBoundingClientRect().width), mark = el.querySelector('use').getAttribute('href') === '#i-check' && w === 12;
            if (!ICONS.includes(w) && !mark) out.push(`${who(el)} icon ${el.querySelector('use').getAttribute('href')}: ${w}px`);
          }
          if (el.matches('button, [role="button"]') && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby'))) out.push(`${who(el)}: button without a name`);
        }
        return out;
      });
      for (const f of found) bad.add(`${name}: ${f}`);
    }
    if (bad.size) throw new Error(`${bad.size} off-scale: ${[...bad].slice(0, 40).join(' | ')}`);
  });
  await check(device, 'tests card: every Ascites, HVPG and FibroScan row reaches the card\'s inner right edge', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 45000 });
    await tapTool(page, '#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    for (const id of ['abdomen', 'hvpg', 'fibroscan']) {
      await page.click(`.instr-tab[data-instrument="${id}"]`);
      // (A slow page draws few frames: wait for the transition to finish, not a fixed time.)
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !document.querySelector('#dock').getAnimations({ subtree: true }).length, null, { timeout: 20000 });   // (the Tests card; 26b17c4b had copied the quick check's .pz-check here, absent outside Present)
      const off = await page.evaluate((id) => {
        const pane = document.querySelector(`#pane-${id}`), view = pane.firstElementChild, R = (e) => e.getBoundingClientRect();
        const inner = R(pane).right - parseFloat(getComputedStyle(pane).paddingRight) - (pane.offsetWidth - pane.clientWidth);
        const vis = (e) => R(e).width > 0 && R(e).height > 0;
        let rows;
        if (id === 'abdomen') {
          // one column: every row reaches the edge; beside each other: the controls do, and the readings share their column's edge
          const two = getComputedStyle(view.querySelector('.ab-main')).gridTemplateColumns.split(' ').length > 1;
          const read = view.querySelector('.ab-read');
          const ref = two ? R(read).right - parseFloat(getComputedStyle(read).paddingRight) : inner;
          // (the drain sits in the belly's row, which is centred and reaches the edge as one block)
          rows = [...['.ab-ctl > .ab-row'].flatMap((q) => [...view.querySelectorAll(q)].map((e) => [e, inner])),
            ...['.ab-vol', '.ab-iap', '.ab-tiles'].flatMap((q) => [...view.querySelectorAll(q)].map((e) => [e, ref]))];
        } else {
          // a picture's box and the notes beside or under it; side by side, the right-most reaches the edge
          const kids = [...view.children].filter(vis);
          const two = Math.max(...kids.map((e) => R(e).left)) - Math.min(...kids.map((e) => R(e).left)) > 60;
          // (a box set to bleed into the card's padding, as a phone's HVPG monitor does by 10 px since da7516d, reaches exactly that far)
          const edge = (e) => inner - Math.min(0, parseFloat(getComputedStyle(e).marginRight) || 0);
          rows = two ? [kids.reduce((a, b) => (R(b).right > R(a).right ? b : a))].map((e) => [e, edge(e)]) : kids.map((e) => [e, edge(e)]);
        }
        return rows.filter(([e]) => vis(e)).map(([e, ref]) => [String(e.className).split(' ')[0], +(R(e).right - ref).toFixed(1)]).filter(([, d]) => Math.abs(d) > 1);
      }, id);
      if (off.length) throw new Error(`${id}: rows stop short of (or run past) the card's inner right edge: ${JSON.stringify(off)}`);
    }
  });
  await check(device, 'dark theme', async (page) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '?preset=budd-chiari');
    await page.waitForTimeout(800);
    await shot(page, `${device}-dark`);
  });
  await check(device, 'responsive instrument workspace', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // Let the first frames (shader compiles on a software GPU) finish before the first tap.
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 45000 });
    await tapTool(page, '#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    await page.waitForTimeout(400);
    // The card slides in: measure where it settles, not where it is on the way.
    const settled = () => page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.id === 'dock'), null, { timeout: 60000 });
    await settled();
    const geometry = () => page.evaluate(() => {
      const dock = document.querySelector('#dock').getBoundingClientRect();
      const stage = document.querySelector('#stageView').getBoundingClientRect();
      const panel = document.querySelector('#panel');
      // The workspace floats over the bottom of the full-screen figure: between it and the top bar
      // the anatomy must still have room.
      const top = document.querySelector('#topbar').getBoundingClientRect().bottom;
      // On a wide landscape screen the card is on the right (the figure keeps the width to its left);
      // otherwise it is a sheet (the figure keeps the height above it).
      const side = document.querySelector('#dock').classList.contains('side');
      return { stageH: stage.height, free: side ? dock.left : dock.top - top, side, dockTop: dock.top,
        dockRight: dock.right, width: innerWidth,
        scrim: getComputedStyle(document.querySelector('#panelScrim')).visibility,
        panel: getComputedStyle(panel).visibility };
    });
    let g = await geometry();
    if (g.stageH < 50 || g.free < (g.side ? 300 : 120)) throw new Error(`workspace leaves the anatomy ${Math.round(g.free)} px`);
    if (device === 'desktop' && !g.side) throw new Error('on a laptop the instruments should be a card on the right');
    if (g.dockRight > g.width + 1) throw new Error('workspace extends off screen');
    if (device === 'phone' && (g.scrim === 'visible' || g.panel === 'visible')) throw new Error('opening instruments also opens a patient overlay');
    const before = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(500);
    if (!((await page.evaluate(() => window.pps.store.get().frame.t)) > before)) throw new Error('opening instruments paused simulation');
    // A tablet's sheet resizes with its divider; a phone's sheet uses its handle instead. The card on the right (a Mac, an iPad held
    // sideways) has one fixed width and no divider (6 Nov 2026).
    if (device !== 'phone' && !g.side) { await page.click('.workspace-divider'); await page.keyboard.press('ArrowUp'); }
    if (g.side && await page.locator('.workspace-divider:visible').count()) throw new Error('the card on the right has a fixed width: its divider must be hidden');
    await page.evaluate(() => window.pps.timeline.togglePin());
    await page.waitForFunction(() => !!window.pps.store.get().compareSnap);
    await page.waitForSelector('.workspace-comparison:not([hidden])');
    // One tap on a tab chooses an instrument; each tab carries its live reading.
    if (await page.locator('.instr-tab').count() !== 7) throw new Error('the tabs must offer seven distinct instruments (Pressure holds both pressure views; Readouts lists every readout)');
    const choose = async (id) => {
      await page.click(`.instr-tab[data-instrument="${id}"]`);
      await page.waitForFunction((id) => document.querySelector(`.instr-tab[data-instrument="${id}"]`).getAttribute('aria-selected') === 'true', id);
      await page.waitForTimeout(250);
    };
    for (const id of ['scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'profile']) {
      if (id === 'scope') { await choose('profile'); if (!await page.locator('#pane-scope.active').count()) { await page.click('#pane-profile .ps-btn[data-view="scope"]'); await page.waitForTimeout(250); } }
      else await choose(id);
      const overflow = await page.$eval(`#pane-${id}`, (el) => el.scrollWidth - el.clientWidth);
      if (overflow > 2) throw new Error(`${id} has horizontal overflow (${overflow}px)`);
      const sized = await page.$eval(`#pane-${id}`, (el) => [...el.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().height > 0).every((c) => c.width > 1 && c.height > 1));
      if (!sized) throw new Error(`${id} has an unsized visible canvas`);
    }
    await page.evaluate(() => window.pps.dock.show('varixwall', { reveal: true }));
    if ((await page.$eval('#pane-endoscopy', (d) => d.dataset.sub)) !== 'wall') throw new Error('legacy varixwall route does not open Wall mechanics');
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => !window.pps.store.get().running);
    await page.waitForTimeout(250);
    await settled();
    for (const v of ['wall', 'scope']) {
      await page.click(`#pane-endoscopy .ps-btn[data-view="${v}"]`);
      const sq = await page.$$eval('#pane-endoscopy .chart-box.square', (els) => els.map((el) => el.getBoundingClientRect()).filter((r) => r.width).map((r) => [r.width, r.height]));
      if (sq.length !== 1 || Math.abs(sq[0][0] - sq[0][1]) > 2 || sq[0][0] < 100) throw new Error(`endoscopy ${v} view is not one visible square: ${JSON.stringify(sq)}`);
    }
    await page.$eval('#pane-endoscopy', (el) => { el.scrollTop = 0; });
    await shot(page, `${device}-workspace-endoscopy`);
    if (device === 'phone') {
      // A phone's instruments are a bottom sheet: no minimise; a drag down on the handle closes them.
      await page.evaluate(() => window.pps.dock.setState('open'));
      await page.waitForTimeout(300);
      const g = await page.$eval('#dock .sheet-grab', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.mouse.move(g[0], (page.viewportSize().height - 4), { steps: 8 }); await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('dock-open')).catch(async () => { throw new Error('drag down did not close: ' + JSON.stringify(await page.evaluate(() => [document.querySelector('#app').className, document.querySelector('#dock').dataset.state, document.elementFromPoint(195, document.querySelector('#dock .sheet-grab').getBoundingClientRect().y + 9)?.className, document.querySelector('#dock').getBoundingClientRect().height])) + JSON.stringify(g)); });
      await page.evaluate(() => window.pps.dock.show('endoscopy', { reveal: true }));
    }
    if (device === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 });
      // As on a tablet: the relayout follows the resize event, so wait for it (up to 10 s).
      await page.waitForFunction(() => {
        const dock = document.querySelector('#dock').getBoundingClientRect(), stage = document.querySelector('#stageView').getBoundingClientRect();
        return dock.right <= innerWidth + 1 && stage.height >= 20;
      }, null, { timeout: 10000 }).catch((e) => { throw new Error('rotation makes workspace unusable', { cause: e }); });
      await shot(page, 'phone-workspace-landscape');
      await page.setViewportSize({ width: 390, height: 844 });
    } else {
      // The patient chart starts closed, so the workspace has the full width for two instruments.
      if (await page.evaluate(() => document.querySelector('#app').classList.contains('panel-open'))) throw new Error('the patient chart should start closed');
      await page.evaluate(() => window.pps.dock.show('doppler', { alongside: true }));
      await page.waitForSelector('#dockBody.split');
      await shot(page, 'desktop-workspace-two-instruments');
      await page.setViewportSize({ width: 768, height: 1024 });
      // The dock relayouts on the resize event, which a busy machine may deliver late: wait for it.
      await page.waitForFunction(() => !document.querySelector('#dockBody').classList.contains('split'), null, { timeout: 10000 }).catch((e) => { throw new Error('two cramped columns remain on tablet', { cause: e }); });
      await shot(page, 'tablet-workspace');
    }
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await page.waitForFunction(() => window.pps.store.get().running);
  });

  await check(device, 'HVPG procedure: the button holds still and every tap starts it', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => { window.pps.dock.show('hvpg'); window.pps.dock.setState('open'); });
    const sel = '[data-pane="hvpg"] .hvpg-bar .btn';
    await page.waitForSelector(sel, { state: 'visible' });
    // The card repaints on every model frame; the button must not change under a finger (Safari then drops the tap).
    const changes = await page.$eval(sel, (b) => new Promise((res) => {
      let n = 0; const mo = new MutationObserver((m) => { n += m.length; });
      mo.observe(b, { subtree: true, childList: true, characterData: true, attributes: true });
      setTimeout(() => { mo.disconnect(); res(n); }, 1500);
    }));
    if (changes) throw new Error(`the Measure HVPG button changed ${changes} times while idle`);
    // The sheet slides up: tap where the button settles, not where it is on the way.
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.id === 'dock'), null, { timeout: 60000 });
    if (device === 'phone') { const b = await page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.touchscreen.tap(b[0], b[1]); }
    else await page.click(sel);
    await page.waitForFunction((q) => document.querySelector(q).textContent.includes('Measuring'), sel, { timeout: 10000 }).catch((e) => { throw new Error('a tap on Measure HVPG did not start it', { cause: e }); });
  });

  // The HVPG deck's result slide: the summary (WHVP and FHVP bracketed to the HVPG) sits in the free figure, never
  // under the data card, the words or the slide controls (on a Mac it once went half under the pressure card).
  if (device === 'desktop') await check(device, 'presenter: the HVPG summary callout is never under a card, at every size', async (page) => {
    const out = [];
    for (const [width, height] of [[1440, 900], [1280, 800], [1920, 1080], [1180, 820], [820, 1180]]) {
      await page.setViewportSize({ width, height });
      await open(page, '?script=hvpg&slide=5');
      await page.waitForFunction(() => { const b = document.querySelector('.cath-sum-box .calc'); return b && +getComputedStyle(b).opacity > 0.9; }, null, { timeout: 60000 })
        .catch((e) => { throw new Error(`${width}x${height}: the HVPG summary never showed`, { cause: e }); });
      await page.waitForTimeout(2500);   // (the camera and the cards settle)
      out.push(...await page.evaluate((sz) => {
        const b = document.querySelector('.cath-sum-box').getBoundingClientRect(), bad = [];
        for (const el of document.querySelectorAll('.stage-blocker:not([hidden])')) {
          if (getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity < 0.5) continue;
          const q = el.getBoundingClientRect();
          if (q.width && Math.min(b.right, q.right) - Math.max(b.left, q.left) > 1 && Math.min(b.bottom, q.bottom) - Math.max(b.top, q.top) > 1) bad.push(`${sz}: the HVPG summary is under ${el.className.split(' ')[0]}`);
        }
        if (b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight) bad.push(`${sz}: the HVPG summary runs off screen`);
        return bad;
      }, `${width}x${height}`));
    }
    if (out.length) throw new Error(out.join('; '));
  });

  await check(device, 'HVPG procedure: each reading\'s shadow fades with its body, and no reading outlives its step', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => { window.pps.dock.show('hvpg'); window.pps.dock.setState('open'); });
    const sel = '[data-pane="hvpg"] .hvpg-bar .btn';
    await page.waitForSelector(sel, { state: 'visible' });
    await page.$eval(sel, (b) => b.click());
    // Every frame of the run: a label's shadow alpha (0.22 at full) tracks its children's opacity; once the
    // summary has gone (the camera heading home), no reading stays on screen.
    const bad = await page.evaluate(() => new Promise((res) => {
      const out = [], t0 = performance.now(); let sumSeen = 0, sumGone = 0;
      const tick = () => {
        const now = performance.now() - t0;
        const sum = document.querySelector('.cath-sum');
        if (sum) sumSeen = now; else if (sumSeen && !sumGone) sumGone = now;
        for (const l of document.querySelectorAll('.cath-label:not(.ghost):not(.res)')) {
          const sh = getComputedStyle(l).boxShadow; if (sh === 'none') continue;
          const m = sh.match(/rgba?\(([^)]+)\)/); const a = m ? +(m[1].split(',')[3] ?? 1) / 0.22 : 1;
          const o = +getComputedStyle(l.firstElementChild).opacity;
          if (Math.abs(a - o) > 0.2 && out.length < 5) out.push(`${l.className} shadow ${a.toFixed(2)} vs body ${o.toFixed(2)} at ${now | 0} ms`);
        }
        if (sumGone && now > sumGone + 100 && document.querySelector('.cath-labels .cath-label')) { out.push(`a reading is still on screen ${(now - sumGone) | 0} ms after the summary went`); return res(out); }
        if (now > 26000) { if (!sumSeen) out.push('the HVPG summary never appeared'); return res(out); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    if (bad.length) throw new Error(bad.join('; '));
  });

  await check(device, 'pressure over time and Doppler', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // The heartbeat always runs, so the trace is beat to beat before any instrument opens, and it
    // never touches the patient's parameters.
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 45000 });
    // Pulsatile is on by default, so compare with its value before the instrument opens, not with false.
    const pulsatileBefore = await page.evaluate(() => window.pps.store.get().params.pulsatile);
    await tapTool(page, '#tabInstruments');
    // The HVPG always shows now; set the store flag off to check the unmeasured state.
    await page.evaluate(() => window.pps.store.set({ showHvpg: false }));
    await page.evaluate(() => window.pps.dock.show('scope'));
    if (await page.evaluate(() => window.pps.store.get().params.pulsatile) !== pulsatileBefore) throw new Error('opening an instrument changed the patient parameters');
    await page.waitForTimeout(2500);
    // In Explore the HVPG stays hidden until the HVPG procedure measures it.
    const before = await page.$eval('#pane-scope .pt-num', (el) => el.textContent.trim());
    if (before !== '—') throw new Error(`pressure over time shows HVPG ${before} before it is measured`);
    await page.evaluate(() => window.pps.store.set({ hvpgMeasured: true }));
    await page.waitForTimeout(600);
    const hero = await page.$eval('#pane-scope .pt-num', (el) => parseFloat(el.textContent));
    if (!(hero > 12)) throw new Error(`pressure over time shows HVPG ${hero}`);
    const drawn = await page.$eval('#pane-scope canvas', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i]) n++; return n; });
    if (drawn < 200) throw new Error('pressure over time draws nothing');
    await page.evaluate(() => window.pps.updateParams((p) => { p.drugs.carvedilol = true; return p; }, { label: 'Carvedilol' }));
    await page.waitForTimeout(1500);
    await page.click('#pane-scope [data-range="minutes"]');
    await page.click('#pane-scope .pt-chip[data-trace="RA"]');
    const box = await page.$eval('#pane-scope canvas', (c) => { const r = c.getBoundingClientRect(); return [r.x + r.width * 0.7, r.y + r.height * 0.4]; });
    await page.mouse.move(box[0], box[1]);
    await shot(page, `${device}-pressure-over-time`);
    await page.click('#pane-scope [data-range="days"]');
    // A jump stops early if a varix ruptures on the way, so only require that the clock moved.
    await page.evaluate(() => window.pps.timeline.jump(30, '1 month'));
    await page.waitForFunction(() => window.pps.store.get().frame.day > 0, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    await shot(page, `${device}-pressure-over-time-days`);
    await page.evaluate(() => window.pps.dock.show('doppler'));
    await page.waitForTimeout(1500);
    const dir = await page.$eval('#pane-doppler .dop-dir', (el) => el.textContent);
    if (!/Hepatopetal|Hepatofugal|To-and-fro|Stasis|No flow/.test(dir)) throw new Error(`Doppler reports "${dir}" for the portal vein`);
    await page.selectOption('#pane-doppler .dop-vessel', 'RHV_IVC');
    await page.waitForFunction(() => window.pps.store.get().frame.probe === 'RHV_IVC');
    await page.waitForTimeout(2500);
    const pattern = await page.$eval('#pane-doppler .dop-pattern', (el) => el.textContent);
    if (!/phasic/i.test(pattern)) throw new Error(`hepatic vein pattern is "${pattern}"`);
    await shot(page, `${device}-doppler`);
    await page.evaluate(() => window.pps.dock.close());
    await page.waitForTimeout(800);
    if (!(await page.evaluate(() => window.pps.store.get().frame.pulsing))) throw new Error('the heartbeat stopped when the instruments closed');
  });

  // A leader reaches its label in every frame, and never runs in under it or across another label: the dive into the lobule,
  // a text-size change gliding the lobule's labels, the rise back out, and zooming in on the anatomy. (The lobule's leaders
  // once ran to each label's middle, through its letters, and the anatomy's stopped 9 px short of theirs.)
  // The station check above proves its own case: it fails on a Lymph label hidden where a clear spot exists and on a
  // leader stretched to 150 px, and passes on the lobule of every kind of patient (the Lymph label left out only where no
  // clear spot lies near its node: a phone's decompensated cirrhosis).
  await check(device, 'lobule stations: the Lymph label is left out only where no clear spot lies near its node, no leader over 140 px', async (page) => {
    const into = async (q) => {
      await open(page, q);
      await pickView(page, 'lobule');
      await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled() && !!document.querySelector('.lz.on .lz-labels')?.dataset.room, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
    };
    const bad = [];
    for (const q of ['?preset=healthy', '?preset=rhf', '?preset=cirr-comp', '?preset=cirr-decomp', '?preset=budd-chiari', '?preset=csph', '?preset=schisto']) {
      await into(q);
      for (const b of await stationRoom(page)) bad.push(`${q}: ${b}`);
    }
    if (bad.length) throw new Error(bad.join('; '));
    // (The faults: on a lobule whose Lymph label shows.)
    await into('?preset=healthy');
    if (await page.evaluate(() => document.querySelector('.lz.on .lz-lab[data-target="lobule:lymph"]').hidden)) throw new Error('the healthy lobule shows no Lymph label to test with');
    const dropped = await stationRoom(page, 'drop');
    if (!dropped.some((b) => /left out though a clear spot/.test(b))) throw new Error(`a Lymph label hidden beside a clear spot was not caught (${dropped.join('; ') || 'no problem found'})`);
    await into('?preset=healthy');
    const long = await stationRoom(page, 'long');
    if (!long.some((b) => /leader is 150 px/.test(b))) throw new Error(`a 150 px leader was not caught (${long.join('; ') || 'no problem found'})`);
  });

  await check(device, 'leaders reach their labels in every frame: lobule dive, glide and rise, anatomy zoom', async (page) => {
    const bad = [];
    const look = async (what, ms, act) => { const run = leaderFrames(page, ms); await act?.(); for (const b of await run) bad.push(`${what}: ${b}`); };
    await open(page, '?preset=rhf');
    await page.waitForFunction(() => document.querySelectorAll('#labels path.leader, #labels g.lb').length > 0);
    await page.waitForTimeout(1500);
    await look('diving into the lobule', 2600, () => page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click()));
    await page.waitForFunction(() => [...document.querySelectorAll('.lz.on .lz-lab')].some((e) => !e.hidden));
    await look('rising out of the lobule', 2400, () => page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click()));
    await page.waitForTimeout(800);
    await look('zooming in on the anatomy', 2400, async () => { for (let i = 0; i < 4; i++) { await page.evaluate(() => document.getElementById('zoomIn').click()); await page.waitForTimeout(250); } });
    await look('zoomed in', 600);
    // A label the slide's words light: its leader stops on the pill's rounded outline.
    await open(page, '?script=hvpg&slide=6');
    await page.waitForFunction(() => window.pps.stage.lobuleSettled?.() && [...document.querySelectorAll('.lz.on .lz-lab')].some((e) => !e.hidden) && +getComputedStyle(document.querySelector('.lz-call.on') || document.body).opacity > 0.9 && !!document.querySelector('.lz-call.on'), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    if (!(await page.evaluate(() => (document.getElementById('app').dataset.lit || '').includes('lobule:')))) throw new Error('HVPG slide 6 lights no lobule label');
    await look('a lit label (HVPG slide 6)', 800);
    // At rest no leader is hidden for a label passing over it: a label's own pill once hid its leader (it counted
    // the pill's square corner as another label).
    await page.waitForTimeout(800);
    const hid = await page.evaluate(() => [...document.querySelectorAll('.lz-leaders line.leader.lz-hid')].filter((l) => l.style.display !== 'none' && !l.classList.contains('ld-gone')).map((l) => l.dataset.target));
    if (hid.length) bad.push(`at rest: the ${hid.join(', ')} leader is hidden`);
    if (bad.length) throw new Error(bad.slice(0, 8).join('; '));
  });
}
