// Browser checks 6 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "liver lobule: GPU vessels, pressure drops, caption, cards, zones" to "thumb dock: no card ever covers the tab row (open, drag, close); a pull from anywhere closes Treat".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ check, device, open, pickView, shot, stationRoom, tapTool }) {
  await check(device, 'liver lobule: GPU vessels, pressure drops, caption, cards, zones', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // The lobule is a view of its own, beside Anatomy and Circuit.
    await pickView(page, 'lobule');
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
    if (await page.getAttribute('#viewSeg [data-view="lobule"]', 'aria-pressed') !== 'true') throw new Error('the Lobule button is not shown as the current view');
    await page.waitForTimeout(900);
    const kind = await page.evaluate(() => document.querySelector('.lz').dataset.vessels);
    if (kind !== 'webgl2') throw new Error(`expected the lobule's vessels on the GPU, got ${kind}`);
    // The vessel layer actually holds a picture.
    const vesselPixels = () => {
      // (The canvas keeps no picture between frames: the kept one is laid on it first, in this task, as every outside reader does.)
      window.pps.stage.lobuleCapture?.();
      const g = document.querySelector('.lz-gl'), c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      const x = c.getContext('2d');
      x.drawImage(g, 0, 0, 160, 100);
      const d = x.getImageData(0, 0, 160, 100).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    };
    // Read the GPU canvas a few times: a copy taken between two presented frames can come back blank on a slow runner.
    let lit = 0;
    for (let i = 0; i < 12 && lit < 300; i++) { if (i) await page.waitForTimeout(500); lit = await page.evaluate(vesselPixels); }
    if (lit < 300) throw new Error(`the lobule's vessel layer is nearly empty (${lit} px)`);
    // The four stations carry cards; the arteriole and ductule labels exist but stay hidden until a slide's term names them.
    const stations = await page.evaluate(() => [...document.querySelectorAll('.lz-lab')].map((l) => `${l.dataset.target}${l.hidden || l.classList.contains('lz-off') ? ':hidden' : ''}`).sort().join());
    // (The Lymph label may be left out, never stacked, but only where no clear spot lies within a short leader of its node.)
    const full = 'lobule:arteriole:hidden,lobule:central,lobule:ductule:hidden,lobule:lymph,lobule:sinusoid,lobule:triad';
    if (stations !== full && stations !== full.replace('lobule:lymph,', 'lobule:lymph:hidden,')) throw new Error(`station cards missing (${stations})`);
    const room = await stationRoom(page);
    if (room.length) throw new Error(room.join('; '));
    // The card is gone: nothing floats beside the lobule but its labels.
    if (await page.locator('.lz-side').count()) throw new Error('the lobule still has its card');
    // The strip reads the lobule's two flows here, as the anatomy's reads HVPG and PPG (the slim bar, 88e0a8d: arterial inflow and
    // lymph are in Tests > Readouts).
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#strip .metric.primary')].filter((e) => e.offsetWidth).map((e) => e.dataset.id).join());
    if (tiles !== 'lz-sin,lz-pv') throw new Error(`the strip should show the lobule's flows, got ${tiles}`);
    // A part of the lobule opens the same action card as the anatomy, with its fibrosis slider.
    await page.locator('.lz-lab').nth(1).evaluate((el) => el.click());   // its value updates live, so it never holds still for a pointer click
    await page.waitForSelector('.action-card:not([hidden])');
    const cardText = await page.locator('.action-card').innerText();
    if (!cardText.includes('Sinusoid')) throw new Error('the sinusoid card did not open');
    if (!(await page.locator('.action-card input[aria-label^="Fibrosis"]').count())) throw new Error('no fibrosis slider on the sinusoid card');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.action-card', { state: 'hidden' });
    // Framed in the free space: the lobule's bottom corner is above the vitals dock (every readout is in Tests > Readouts).
    {
      const clear = await page.waitForFunction(() => {
        const dock = document.querySelector('#vdock').getBoundingClientRect().top, labs = [...document.querySelectorAll('.lz-lab:not([hidden], .lz-off)')];
        return labs.every((l) => l.getBoundingClientRect().bottom <= dock + 1);
      }, null, { timeout: 15000 }).then(() => true, () => false);
      if (!clear) throw new Error('a lobule label sits under the dock');
    }
    // The zoom buttons work in the lobule: in, out, and Fit back to the framing.
    if (device === 'desktop') {
      const zk = () => page.evaluate(() => window.pps.stage.lobuleViewKey?.());
      // The framing glides when the free space changes: start from where it settles.
      // Settled means three readings in a row agree (a busy machine can pause a glide between two).
      // Fit first: the vitals dock's caption line can arrive after the opening framing was set.
      await page.click('#zoomFit');
      let k0 = await zk(), same = 0;
      for (let i = 0; i < 30 && same < 2; i++) { await page.waitForTimeout(700); const k = await zk(); same = k === k0 ? same + 1 : 0; k0 = k; }
      await page.click('#zoomIn');
      await page.waitForFunction((k0) => window.pps.stage.lobuleViewKey() !== k0, k0, { timeout: 15000 }).catch((e) => { throw new Error('zoom in does nothing in the lobule', { cause: e }); });
      await page.click('#zoomFit');
      await page.waitForFunction((k0) => window.pps.stage.lobuleViewKey() === k0, k0, { timeout: 15000 }).catch((e) => { throw new Error('Fit does not return the lobule to its framing', { cause: e }); });
    }
    // Zooming in stays in the lobule.
    const box = await page.locator('.lz').boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    if (device === 'desktop') { await page.mouse.wheel(0, -400); await page.waitForTimeout(300); }
    if (!(await page.evaluate(() => window.pps.stage.lobuleOpen()))) throw new Error('zooming in left the lobule');
    // Zooming out never leaves the lobule view.
    if (device === 'desktop') { for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 600); await page.waitForTimeout(600); }
    if (!(await page.evaluate(() => window.pps.stage.lobuleOpen()))) throw new Error('zooming out left the lobule');
    // Zones and Lymph are in the toolbar's Layers menu, which is there only on the lobule.
    // Lymph starts on, so this switches it off and back on: turning it on with a settled, paused
    // model must initialize its radii; otherwise invalid reaches empty the geometry bins and erase the vessel layer.
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => !window.pps.store.get().running);
    await page.waitForTimeout(1500);
    await tapTool(page, '#btnLobuleLayers');
    await page.click('.menu .lens-opt:has-text("Zones")');
    await page.waitForFunction(() => document.querySelectorAll('.lz-zone').length === 3, null, { timeout: 5000 }).catch((e) => { throw new Error('zones did not show', { cause: e }); });
    await page.click('.menu .lens-opt:has-text("Lymph")');
    await page.click('.menu .lens-opt:has-text("Lymph")');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const lymphLit = await page.evaluate(vesselPixels);
    if (lymphLit < 300) throw new Error(`enabling lymph while paused erased the vessel layer (${lymphLit} px)`);
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await shot(page, `${device}-lobule`);
    // Leaving the lobule closes its card.
    await page.evaluate(() => document.querySelector('.lz-lab:not([hidden], .lz-off)').click());   // its value updates live, so it never holds still for a pointer click
    await page.waitForSelector('.action-card:not([hidden])');
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'))) {
      // A phone's docked card hides the view pill under it (the play bar steps aside), so its user pulls the card away first,
      // then taps the pill once it shows again.
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await page.waitForFunction(() => !document.querySelector('.action-card').getAnimations().length);
      const [x, y] = await page.evaluate(() => { const r = document.querySelector('.action-card .ac-top').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 16]; });
      await touch('touchStart', x, y);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', x, y + 160 * i / 12); await page.waitForTimeout(25); }
      await page.waitForTimeout(100);
      await touch('touchEnd');
      await page.waitForFunction(() => document.querySelector('.action-card').hidden, null, { timeout: 10000 })
        .catch((e) => { throw new Error('a pull down did not put the lobule card away', { cause: e }); });
      await page.waitForFunction(() => +getComputedStyle(document.querySelector('#nbViews')).opacity === 1, null, { timeout: 10000 })
        .catch((e) => { throw new Error('the view pill did not come back once the card was away', { cause: e }); });
      await page.click('#viewSeg [data-view="anatomic"]');   // (a real tap: it fails if anything else takes it)
    } else await pickView(page, 'anatomic');   // (a Mac or iPad: the switch stays in reach with the card open)
    await page.waitForFunction(() => !window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
    if (await page.evaluate(() => window.pps.store.get().selection?.type === 'lobule')) throw new Error('the lobule card stayed open after leaving');
  });

  await check(device, 'floating layout: figure fills the screen, Treat card, its changes, advanced physiology in Settings', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    const fill = await page.evaluate(() => { const r = document.querySelector('#stageView').getBoundingClientRect(); return (r.width * r.height) / (innerWidth * innerHeight); });
    if (fill < 0.97) throw new Error(`the figure covers only ${Math.round(fill * 100)} % of the screen`);
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('panel-open'))) throw new Error('the side panel should start closed');
    // No Patient button and no abnormal-results list: the top bar is Treat, Tests, Settings and Search.
    if (await page.$('#btnInspector, #findBadge, #panel .finding')) throw new Error('the Patient button or its abnormal results are back');
    await tapTool(page, '#btnTreat');
    await page.waitForSelector('#treatCard:not([hidden]) .order-chip');
    await page.locator('#treatCard .order-chip', { hasText: 'Carvedilol' }).click();
    await page.waitForFunction(() => window.pps.store.get().params.drugs.carvedilol);
    // The changes sit closed under the orders; opened, they list the new order with its undo.
    if (await page.$eval('#treatCard .tc-body > .section[data-id="changes"]', (d) => d.open)) throw new Error('Changes should start closed in the Treat card');
    await page.click('#treatCard .section[data-id="changes"] > summary');
    await page.waitForFunction(() => [...document.querySelectorAll('#treatCard .chg .chg-n')].some((e) => e.textContent.includes('Carvedilol')), null, { timeout: 5000 })
      .catch((e) => { throw new Error('the Treat card does not list Carvedilol under Changes', { cause: e }); });
    await shot(page, `${device}-treat`);
    // A card is put away as its user would: Escape on a Mac or iPad, a pull down on the card's head on a phone (no X there since
    // da7516d; the thumb dock's gesture).
    const thumb = await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'));
    const pullAway = async (sel) => {
      await page.waitForFunction((sel) => !document.querySelector(sel).getAnimations().length, sel);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const [x, y] = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + 16]; }, sel);
      await touch('touchStart', x, y);
      for (let i = 1; i <= 20; i++) { await touch('touchMove', x, y + 320 * i / 20); await page.waitForTimeout(25); }
      await page.waitForTimeout(150);
      await touch('touchEnd');
    };
    if (thumb) await pullAway('#treatCard'); else await page.keyboard.press('Escape');
    await page.waitForSelector('#treatCard', { state: 'hidden', timeout: 10000 });
    // Advanced physiology: in Settings; it opens in the side panel.
    await tapTool(page, '#btnSettings');
    await page.locator('.menu-item', { hasText: 'Advanced physiology' }).click();
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('panel-open') && document.querySelector('#panelTitle').textContent.includes('Advanced physiology'));
    if (!(await page.$('#panel .adv-body input[type="range"]'))) throw new Error('advanced physiology has no controls');
    if (thumb) await pullAway('#panel'); else await page.click('#panelClose');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('panel-open'), null, { timeout: 5000 })
      .catch((e) => { throw new Error('the side panel does not close', { cause: e }); });
  });
  // The slim play line (15 Oct, option 2): play, speed, clock and jump, then the two key readings as plain numbers on the
  // same row, with no bars or rating words, all inside the bar and not overlapping, on a narrow and a tall phone, a Mac and
  // an iPad held sideways, in the anatomy and the lobule (whose readings are longer).
  await check(device, 'slim play line: one row, the readings as plain numbers, nothing clipped or overlapping', async (page) => {
    for (const [w, ht] of device === 'phone' ? [[375, 667], [390, 844]] : [[1024, 768], [1280, 800], [1440, 900], [1728, 1117], [1180, 820]]) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      for (const lob of [false, true]) {
        if (lob) { await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click()); await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 }); }
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const bar = document.querySelector('#stageBottom').getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect();
          const tiles = [...document.querySelectorAll('#strip .metric')].filter((m) => m.offsetParent);
          const parts = [...document.querySelectorAll('#timeline > *, #timeline .tl-left, #strip .metric :is(.k, .val, .unit, .tr)')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden');
          const boxes = parts.map((e) => ({ q: e.className, ...e.getBoundingClientRect().toJSON() }));
          const flat = boxes.filter((b) => !/tl-left/.test(b.q)).sort((a, b) => a.left - b.left);
          const lap = flat.find((b, i) => flat.slice(0, i).some((a) => b.left < a.right - 0.5 && b.top < a.bottom - 0.5 && a.top < b.bottom - 0.5));   // (overlapping both ways: a name over its number shares its column, not its line)
          return { n: tiles.length, bars: tiles.some((m) => m.querySelector('.rb')?.offsetParent || m.querySelector('.s')?.offsetParent),
            out: boxes.filter((b) => b.left < d.left - 0.5 || b.right > d.right + 0.5 || b.right > innerWidth).map((b) => b.q),
            off: boxes.filter((b) => b.top < bar.top - 2 || b.bottom > bar.bottom + 2).map((b) => b.q), lap: lap ? lap.q : '',
            dockH: d.height, tileH: Math.max(...tiles.map((m) => m.getBoundingClientRect().height)),
            gap: Math.max(0, ...flat.map((b, i) => (i ? b.left - Math.max(...flat.slice(0, i).map((x) => x.right)) : 0))) };
        });
        const at = `${w}x${ht}${lob ? ' lobule' : ''}`;
        if (r.n < 2) throw new Error(`${at}: the play line shows ${r.n} readings, not two`);
        if (r.bars) throw new Error(`${at}: the readings still have bars or rating words`);
        if (r.out.length) throw new Error(`${at}: outside the bar or the screen: ${r.out.join(', ')}`);
        if (r.off.length) throw new Error(`${at}: not on the play line's row: ${r.off.join(', ')}`);
        if (r.lap) throw new Error(`${at}: ${r.lap} overlaps its neighbour on the play line`);
        // On a Mac or an iPad held sideways the bar is the play line alone: one row about the play button's height (not the
        // three-line label, number, bar and rating it was), with no dead space between its parts (15 Oct, Mohammad: "can definitely be slimmer").
        if (device !== 'phone') {
          if (r.dockH > 60) throw new Error(`${at}: the bar is ${Math.round(r.dockH)} px tall, more than one slim row`);
          if (r.tileH > 40) throw new Error(`${at}: a reading is ${Math.round(r.tileH)} px tall, more than one line`);
          if (r.gap > 40) throw new Error(`${at}: a ${Math.round(r.gap)} px gap inside the bar`);
        }
      }
    }
  });
  // The view switch is one tap away on every screen (15 Oct, Mohammad: "it should remain outside and accessible", then "put it
  // down below"; 16 Oct: "detached from the timeline ... slightly above it as a pill and centered"): a centred pill just above
  // the play bar (in the sinusoid view centred at the bottom); in every view, and still with Treat or Tests open on the thumb dock.
  // Each view is reached by one tap on its button's centre, which must be on screen, at least 32 px tall and not under anything.
  await check(device, 'view switch: one tap from every view on every screen, with a card open too', async (page) => {
    const sizes = device === 'phone' ? [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375]] : [[768, 1024], [820, 1180], [1024, 1366], [1180, 820], [1024, 768], [1440, 900], [1920, 1080]];
    const want = (v) => (st) => (v === 'sinusoid' ? st.lobule && st.sinusoid : v === 'lobule' ? st.lobule && !st.sinusoid : !st.lobule && st.view === v);
    const tapView = async (v, at) => {
      // (A person taps once the bar holds still: wait until its glides have ended and the button stays put for a moment.)
      await page.waitForFunction((v) => { const tb = document.querySelector('#topbar');
        if (document.getAnimations().some((a) => a.playState === 'running' && tb.contains(a.effect?.target))) { window.__vsAt = ''; return false; }
        const q = document.querySelector(`#viewSeg [data-view="${v}"]`).getBoundingClientRect(), k = `${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.width)},${Math.round(q.height)}`, w = window;
        if (w.__vsAt !== k) { w.__vsAt = k; w.__vsSince = performance.now(); } return performance.now() - w.__vsSince > 350; }, v, { timeout: 15000, polling: 50 }).catch(() => {});
      const r = await page.evaluate((v) => {
        const b = document.querySelector(`#viewSeg [data-view="${v}"]`), q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, h: q.height, why: `css ${getComputedStyle(b).height}, bar ${document.querySelector('#topbar').className} fit ${document.querySelector('#topbar').dataset.fit}, app ${document.querySelector('#app').className}`, shown: !!b.offsetParent, home: (() => { const a = document.querySelector('#app'), q = a.classList.contains('presenting') ? '#topbar' : a.classList.contains('sin-focus') ? '#sinViews' : '#nbViews'; return [q, document.querySelector(q).contains(b)]; })(), on: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight, free: !!hit && b.contains(hit), over: hit ? `${hit.tagName}#${hit.id}.${hit.getAttribute('class')}` : 'nothing' };
      }, v);
      if (!r.shown || !r.home[1]) throw new Error(`${at}: the ${v} button is not shown in ${r.home[0]}`);
      if (!r.on) throw new Error(`${at}: the ${v} button is off the screen`);
      if (r.h < 28) throw new Error(`${at}: the ${v} button is ${Math.round(r.h)} px tall (${r.why})`);
      if (!r.free) throw new Error(`${at}: the ${v} button is under ${r.over}`);
      if (device === 'phone') await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y);
      await page.waitForFunction((v) => { const st = window.pps.store.get(); return v === 'sinusoid' ? st.lobule && st.sinusoid : v === 'lobule' ? st.lobule && !st.sinusoid : !st.lobule && st.view === v; }, v, { timeout: 30000 })
        .catch(() => { throw new Error(`${at}: one tap on ${v} did not switch to it`); });
      await page.waitForTimeout(400);
    };
    for (const [w, ht] of sizes) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });   // (the start-up cover lifts)
      await page.waitForTimeout(600);
      const at = `${w}x${ht}`;
      await tapView('circuit', `${at} anatomy`);
      await tapView('anatomic', `${at} circuit`);
      await tapView('lobule', `${at} anatomy`);
      if (await page.evaluate(() => !document.querySelector('#viewSeg [data-view="sinusoid"]').hidden)) {
        await tapView('sinusoid', `${at} lobule`);
        await tapView('lobule', `${at} sinusoid`);
      }
      await tapView('anatomic', `${at} lobule`);
      if (!want('anatomic')(await page.evaluate(() => window.pps.store.get()))) throw new Error(`${at}: not back in the anatomy`);
      // On the thumb dock the switch is the dock's first line: a card open above the tab row (Treat, then Tests pulled to full)
      // covers it as it covers the play row (it fades, and takes no tap); once the card is put away it is one tap again.
      if (await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'))) {
        for (const tab of ['treat', 'tests']) {
          await page.click(`#thumbBar [data-tab="${tab}"]`);
          await page.waitForTimeout(900);
          if (tab === 'tests') await page.evaluate(() => { const d = document.querySelector('#dock'); if (d.dataset.state !== 'full') document.querySelector('#dock .sheet-grab')?.click(); });
          await page.waitForTimeout(600);
          // (a busy machine can still be fading the play bar's half out: give it up to 3 s to finish)
          await page.waitForFunction(() => +getComputedStyle(document.querySelector('#nbViews')).opacity <= 0.05, null, { timeout: 3000, polling: 50 }).catch(() => {});
          const shows = await page.evaluate(() => { const b = document.querySelector('#viewSeg [data-view="circuit"]'), q = b.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
            return +getComputedStyle(document.querySelector('#nbViews')).opacity > 0.05 || (!!hit && b.contains(hit)); });
          if (shows) throw new Error(`${at}: the view switch shows over the open ${tab} card`);
          await page.click(`#thumbBar [data-tab="${tab}"]`);
          await page.waitForTimeout(700);
          await tapView('circuit', `${at} ${tab} put away`);
          await tapView('anatomic', `${at} ${tab} put away`);
        }
      }
    }
  });
  // The view switch is its own pill, centred on the screen 8 px above the play bar on every screen, Mac and phone held sideways
  // included (16 Oct, Mohammad: "detached from the timeline button slightly above it as a pill and centered"); in the sinusoid
  // view the same pill sits centred at the bottom, level with the zoom group and clear of it; every label 12 px or more, whole.
  // The figure's readings end 8 px or more above the pill; the sinusoid view keeps the key's whole card in the top bar (it had
  // shrunk to a 4 px sliver, its scale spilling under History); on a Mac with Tests open the zoom group keeps clear of the pill.
  await check(device, 'view switch: a centred pill 8 px above the play bar; in the sinusoid view centred and clear of the zoom group', async (page) => {
    const sizes = device === 'phone' ? [[320, 568], [390, 844], [844, 390]] : [[820, 1180], [1180, 820], [1440, 900]];
    const look = (sin) => page.evaluate((sin) => {
      const out = [], r = (e) => e.getBoundingClientRect(), pill = document.querySelector(sin ? '#sinViews' : '#nbViews'), p = r(pill);
      if (!pill.contains(document.querySelector('#viewSeg'))) return ['the switch is not in its pill'];
      // (centred on the play bar, which is centred on the screen everywhere but a phone held sideways, where it starts at the left)
      const bar = r(document.querySelector('#vdock')), mid = sin ? innerWidth / 2 : (bar.left + bar.right) / 2;
      if (Math.abs((p.left + p.right) / 2 - mid) > 1.5) out.push(`the pill's centre is ${Math.round((p.left + p.right) / 2 - mid)} px off the ${sin ? 'screen' : 'play bar'}'s`);
      if (p.left < 0 || p.right > innerWidth) out.push('the pill runs off the screen');
      if (!sin) { const gap = r(document.querySelector('#vdock')).top - p.bottom; if (Math.abs(gap - 8) > 1) out.push(`the pill is ${Math.round(gap)} px above the play bar, not 8`); }
      else {
        const z = r(document.querySelector('#zoomPill'));
        if (Math.abs(z.bottom - p.bottom) > 1.5) out.push(`the pill's foot is ${Math.round(z.bottom - p.bottom)} px off the zoom group's`);
        if (p.right > z.left - 4) out.push(`the pill runs into the zoom group (${Math.round(p.right)} vs ${Math.round(z.left)})`);
      }
      // (the readings and names on the figure: none ends closer than 8 px above the pill where it would sit over it)
      for (const l of document.querySelectorAll('#labels .lb:not(.lb-off), .lz-lab, .sv-region')) {
        const q0 = r(l);
        if (!q0.width || !q0.height || +getComputedStyle(l).opacity < 0.05 || q0.bottom < 0 || q0.top > innerHeight) continue;
        // (the words' own boxes, a line's full descent included: the label's box can stop short of a "g")
        const q = { left: q0.left, right: q0.right, top: q0.top, bottom: q0.bottom };
        const walk = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.textContent.trim()) continue; const t = document.createRange(); t.selectNodeContents(n); const b = t.getBoundingClientRect(); if (b.height) q.bottom = Math.max(q.bottom, b.bottom); }
        if (q.right > p.left && q.left < p.right && q.bottom > p.top - 7.5 && q.top < p.bottom) out.push(`"${l.textContent.trim().slice(0, 24)}" ends ${Math.round(p.top - q.bottom)} px above the pill, not 8`);
      }
      if (sin && document.querySelector('#app').classList.contains('thumb')) {
        const k = r(document.querySelector('#stageTop .sb-right')), lg = r(document.querySelector('#legend')), tr = r(document.querySelector('.top-right'));
        if (k.width < 100) out.push(`the key's card is ${Math.round(k.width)} px wide`);
        if (lg.left < k.left - 0.5 || lg.right > k.right + 0.5) out.push('the key spills out of its card');
        if (k.right > tr.left && k.left < tr.right && k.bottom > tr.top && k.top < tr.bottom) out.push('the key runs under the buttons beside it');
      }
      for (const b of [...document.querySelectorAll('#viewSeg button')].filter((e) => e.offsetParent)) {
        const t = document.createRange(); t.selectNodeContents(b); const tr = t.getBoundingClientRect(), q = r(b);
        if (parseFloat(getComputedStyle(b).fontSize) < 12) out.push(`"${b.textContent.trim()}" is under 12 px`);
        if (tr.left < q.left - 0.5 || tr.right > q.right + 0.5 || q.left < p.left || q.right > p.right) out.push(`"${b.textContent.trim()}" is cut short`);
      }
      return out;
    }, sin);
    for (const [w, ht] of sizes) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });
      await page.waitForTimeout(600);
      await page.waitForTimeout(1500);   // (the framing settles)
      let bad = await look(false);
      if (bad.length) throw new Error(`${w}x${ht} anatomy: ${bad.join('; ')}`);
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="circuit"]').click());
      await page.waitForTimeout(2500);
      bad = await look(false);
      if (bad.length) throw new Error(`${w}x${ht} circuit: ${bad.join('; ')}`);
      // A Mac with Tests open: the zoom group, pushed left of the card, stays 16 px above the pill or beside it.
      if (await page.evaluate(() => !document.querySelector('#app').classList.contains('thumb') && innerWidth >= 1000)) {
        await page.evaluate(() => document.querySelector('#tabInstruments').click());
        await page.waitForTimeout(1500);
        const z = await page.evaluate(() => { const a = document.querySelector('#zoomPill').getBoundingClientRect(), p = document.querySelector('#nbViews').getBoundingClientRect();
          return { show: !!document.querySelector('#zoomPill').offsetParent, side: a.right <= p.left || a.left >= p.right, gap: p.top - a.bottom }; });
        if (z.show && !z.side && z.gap < 15.5) throw new Error(`${w}x${ht} Tests open: the zoom group ends ${Math.round(z.gap)} px above the view pill, over it`);
        await page.evaluate(() => document.querySelector('#tabInstruments').click());
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
      await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
      await page.waitForTimeout(600);
      bad = await look(false);
      if (bad.length) throw new Error(`${w}x${ht} lobule: ${bad.join('; ')}`);
      if (await page.evaluate(() => !document.querySelector('#viewSeg [data-view="sinusoid"]').hidden)) {
        await page.evaluate(() => document.querySelector('#viewSeg [data-view="sinusoid"]').click());
        await page.waitForFunction(() => document.querySelector('#app').classList.contains('sin-focus') && document.querySelector('#sinViews').contains(document.querySelector('#viewSeg')), null, { timeout: 30000 });
        await page.waitForTimeout(2500);
        // (the top bar glides its pieces to the sinusoid view's places: measure once nothing in it is moving)
        await page.waitForFunction(() => { const tb = document.querySelector('#topbar'); return !document.getAnimations().some((a) => a.playState === 'running' && tb.contains(a.effect?.target)); }, null, { timeout: 15000, polling: 100 }).catch(() => {});
        await page.waitForTimeout(300);
        bad = await look(true);
        if (bad.length) throw new Error(`${w}x${ht} sinusoid: ${bad.join('; ')}`);
      }
    }
  });
  // The thumb dock's words sit whole (15 Oct, Mohammad's iPhone: the tab labels were cut off along the bar's foot): every tab
  // label shows in full inside the dock and every view label inside the switch's pill, on every upright phone and tablet and
  // in every view; the pill sits apart from the dock, just above it (16 Oct).
  await check(device, 'thumb dock: every tab and view label sits whole, the switch a pill above the dock', async (page) => {
    const sizes = device === 'phone' ? [[320, 568], [375, 667], [390, 844], [430, 932]] : [[768, 1024], [820, 1180], [1024, 1366]];
    for (const [w, ht] of sizes) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });
      for (const v of ['anatomic', 'circuit', 'lobule']) {
        if (v !== 'anatomic') { await pickView(page, v); await page.waitForTimeout(v === 'lobule' ? 2500 : 1200); }
        const bad = await page.evaluate(() => {
          const out = [], r = (e) => e.getBoundingClientRect(), d = r(document.querySelector('#vdock')), nb = r(document.querySelector('#thumbBar'));
          if (!document.querySelector('#app').classList.contains('thumb')) return ['no thumb dock'];
          if (d.bottom > innerHeight + 0.5) out.push(`the dock runs ${Math.round(d.bottom - innerHeight)} px off the screen`);
          if (nb.bottom > d.bottom + 1) out.push(`the tab row runs ${Math.round(nb.bottom - d.bottom)} px below the dock`);
          const words = [...document.querySelectorAll('#thumbBar .nb-tab .nb-l'), ...document.querySelectorAll('#viewSeg button')].filter((e) => e.offsetParent);
          for (const e of words) {
            const q = r(e), box = e.closest('#thumbBar') ? nb : r(document.querySelector('#nbViews')), name = e.textContent.trim();
            // (the words' own box against the label's: a touch area drawn past a button's edge does not count as cut)
            const t = document.createRange(); t.selectNodeContents(e); const tr = t.getBoundingClientRect();
            if (e.scrollWidth > e.clientWidth + 1 || tr.left < q.left - 0.5 || tr.right > q.right + 0.5 || tr.top < q.top - 0.5 || tr.bottom > q.bottom + 0.5) out.push(`"${name}" is cut short (${Math.round(tr.width)}x${Math.round(tr.height)} words in ${Math.round(q.width)}x${Math.round(q.height)})`);
            if (q.top < box.top - 0.5 || q.bottom > box.bottom + 0.5 || q.left < box.left - 0.5 || q.right > box.right + 0.5) out.push(`"${name}" runs outside its bar (${Math.round(q.top)}-${Math.round(q.bottom)} in ${Math.round(box.top)}-${Math.round(box.bottom)})`);
            const hit = document.elementFromPoint(q.left + q.width / 2, q.bottom - 2);
            if (!hit || !(e.closest('button').contains(hit))) out.push(`"${name}" has ${hit ? hit.tagName + '.' + hit.getAttribute('class') : 'nothing'} over its foot`);
          }
          for (const m of [...document.querySelectorAll('#strip .metric')].filter((e) => e.offsetParent)) { const q = r(m); if (q.right > d.right + 0.5 || q.left < d.left - 0.5) out.push(`the reading "${m.textContent.trim().slice(0, 24)}" runs out of the dock`); }
          if (!document.querySelector('#nbViews').contains(document.querySelector('#viewSeg'))) out.push('the switch is not in its pill');
          else if (r(document.querySelector('#nbViews')).bottom > d.top - 4) out.push('the switch\'s pill is not apart from the dock, above it');
          return out;
        });
        if (bad.length) throw new Error(`${w}x${ht} ${v}: ${bad.join('; ')}`);
      }
    }
  });
  // An upright iPad: Treat opens lined up with the bar's edges, 8 px above the tab row, which is then a rounded piece of its own
  // (15 Oct: it had sat at the screen's right margin, overhanging the bar, and flush on a square-cornered tab row).
  if (device === 'desktop') await check(device, 'thumb dock on an upright iPad: Treat and Tests line up with the bar, 8 px above the rounded tab row, every Tests tab name whole', async (page) => {
    for (const [w, ht] of [[768, 1024], [820, 1180], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });
      await page.click('#thumbBar [data-tab="treat"]');
      await page.waitForFunction(() => { const c = document.querySelector('#treatCard'); return !c.hidden && !c.getAnimations().length; });
      await page.waitForTimeout(400);
      const v = await page.evaluate(() => { const c = document.querySelector('#treatCard').getBoundingClientRect(), t = document.querySelector('#thumbBar'), n = t.getBoundingClientRect(), cs = getComputedStyle(t);
        return { l: c.left - n.left, r: n.right - c.right, gap: n.top - c.bottom, round: parseFloat(cs.borderTopLeftRadius) > 4 && parseFloat(cs.borderTopRightRadius) > 4 }; });
      if (Math.abs(v.l) > 1 || Math.abs(v.r) > 1) throw new Error(`${w}x${ht}: Treat is ${Math.round(v.l)} px in from the bar's left and ${Math.round(v.r)} px from its right, not lined up`);
      if (Math.abs(v.gap - 8) > 1) throw new Error(`${w}x${ht}: Treat ends ${Math.round(v.gap)} px above the tab row, not 8`);
      if (!v.round) throw new Error(`${w}x${ht}: the tab row keeps square top corners under the open card`);
      // Tests too: lined up with the bar, 8 px above it, and every tab's name whole (Readouts, not "Reado…").
      await page.click('#thumbBar [data-tab="tests"]');
      await page.waitForFunction(() => { const c = document.querySelector('#dock'); return document.querySelector('#app').classList.contains('dock-open') && document.querySelector('#treatCard').hidden && !c.getAnimations().length; });
      await page.waitForTimeout(400);
      const t = await page.evaluate(() => { const c = document.querySelector('#dock').getBoundingClientRect(), n = document.querySelector('#thumbBar').getBoundingClientRect();
        const cut = [...document.querySelectorAll('#dock .ws-tabs .instr-tab')].filter((b) => b.offsetParent).map((b) => { const l = b.querySelector('.it-t b'), sp = [...l.children].find((k) => getComputedStyle(k).display !== 'none'), r = document.createRange(); r.selectNodeContents(sp);
          const q = r.getBoundingClientRect(), box = l.getBoundingClientRect(); return l.scrollWidth > l.clientWidth + 0.5 || q.right > box.right + 0.5 || q.left < box.left - 0.5 ? sp.textContent : null; }).filter(Boolean);
        return { l: c.left - n.left, r: n.right - c.right, gap: n.top - c.bottom, cut }; });
      if (Math.abs(t.l) > 1 || Math.abs(t.r) > 1) throw new Error(`${w}x${ht}: Tests is ${Math.round(t.l)} px in from the bar's left and ${Math.round(t.r)} px from its right, not lined up`);
      if (Math.abs(t.gap - 8) > 1) throw new Error(`${w}x${ht}: Tests ends ${Math.round(t.gap)} px above the tab row, not 8`);
      if (t.cut.length) throw new Error(`${w}x${ht}: Tests tab names cut short: ${t.cut.join(', ')}`);
    }
  });
  // The thumb dock (an upright phone): the top bar is two chips, the patient and the key; the view switch is the dock's first
  // line, above the play row (never between the play row and the tabs); Treat, Tests, History, Layers and Settings
  // sit in the dock's tab row, and every card or menu they open sits above the dock, so the tab row never moves or hides.
  if (device === 'phone') await check(device, 'thumb dock: two chips on top; the tab row opens every card and menu above the dock', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    if (!(await page.evaluate(() => document.querySelector('#app').classList.contains('thumb')))) throw new Error('an upright phone has no thumb dock');
    const tabs = await page.$$eval('#thumbBar .nb-tab', (els) => els.filter((e) => e.offsetParent).map((e) => e.querySelector('.nb-l').textContent));
    if (tabs.join('|') !== 'Treat|Tests|History|Layers|Settings') throw new Error(`the tab row reads ${tabs.join(', ')}`);
    const shown = await page.evaluate(() => ['.top-right', '#btnBlood', '.tl-hist', '#zoomIn'].filter((q) => document.querySelector(q)?.offsetParent));
    if (shown.length) throw new Error(`still shown outside the tab row: ${shown.join(', ')}`);
    const row = await page.evaluate(() => { const a = document.querySelector('.tb-id').getBoundingClientRect(), b = document.querySelector('#btnLayers').getBoundingClientRect(); return Math.abs(a.top - b.top) < 8 && a.right <= b.left && b.right <= innerWidth; });
    if (!row) throw new Error('the patient and the key are not one row inside the screen');
    // Nothing floats over the figure above the dock: Fit is in the Layers tab's menu; the view switch is the dock's first line, above the play row.
    if (await page.evaluate(() => ['#zoomPill', '#zoomFit'].some((q) => document.querySelector(q)?.offsetParent))) throw new Error('the zoom buttons still float over the figure');
    const first = await page.evaluate(() => { const v = document.querySelector('#viewSeg').getBoundingClientRect(), p = document.querySelector('#stageBottom').getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect(); return document.querySelector('#nbViews').contains(document.querySelector('#viewSeg')) && v.height >= 28 && v.bottom < d.top && v.bottom < p.top; });
    if (!first) throw new Error('the view switch is not a pill above the dock');
    await pickView(page, 'circuit');
    await page.waitForFunction(() => window.pps.store.get().view === 'circuit');
    await page.click('#thumbBar [data-tab="layers"]');
    if (await page.locator('.layers-pop:not(.leaving) [data-view]').count()) throw new Error('the Layers menu still holds a second view switch');
    if (!(await page.locator('.layers-pop:not(.leaving) .menu-item:has-text("Fit to screen")').count())) throw new Error('Fit is not in the Layers menu');
    if (!(await page.locator('.layers-pop:not(.leaving) .menu-item:has-text("Turn upright")').count())) throw new Error('the circuit view has no Turn upright in the Layers menu');
    if (!(await page.locator('.layers-pop:not(.leaving) .lens-opt:has-text("Streaks")').count())) throw new Error('the blood layers are not in the Layers menu');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.layers-pop', { state: 'detached' });
    await pickView(page, 'anatomic');
    await page.waitForFunction(() => window.pps.store.get().view === 'anatomic');
    const dockTop = await page.evaluate(() => document.querySelector('#thumbBar').getBoundingClientRect().top);
    const above = (sel) => page.evaluate(([sel, top]) => { const r = document.querySelector(sel).getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect(); const n = document.querySelector('#thumbBar').getBoundingClientRect(); return r.height > 40 && r.bottom > d.top && Math.abs(n.top - r.bottom - 8) <= 1 && Math.abs(document.querySelector('#thumbBar').getBoundingClientRect().top - top) < 1; }, [sel, dockTop]);
    for (const [tab, sel] of [['tests', '#dock'], ['treat', '#treatCard']]) {
      await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForTimeout(800);
      await page.waitForFunction((sel) => !document.querySelector(sel).getAnimations().length, sel);
      if (!(await above(sel))) throw new Error(`${tab} does not sit on the tab row over the play bar, or the tab row moved`);
      if (await page.getAttribute(`#thumbBar [data-tab="${tab}"]`, 'aria-pressed') !== 'true') throw new Error(`the ${tab} tab is not shown as open`);
    }
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('dock-open'))) throw new Error('Tests stayed open under Treat');
    await page.click('#thumbBar [data-tab="treat"]');
    await page.waitForSelector('#treatCard', { state: 'hidden' });
    for (const tab of ['history', 'layers', 'settings']) {
      await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForSelector('.menu.as-sheet:not(.leaving)');
      await page.waitForFunction(() => !document.querySelector('.menu.as-sheet:not(.leaving)').getAnimations().length);   // (risen in full)
      if (!(await above('.menu.as-sheet:not(.leaving)'))) throw new Error(`${tab} does not sit on the tab row over the play bar`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    // Switching straight from one tab's sheet to another's: only one sheet at a time, and it too sits above the dock.
    await page.click('#thumbBar [data-tab="history"]');
    await page.waitForSelector('.menu.as-sheet:not(.leaving)');
    await page.click('#thumbBar [data-tab="settings"]');
    if (await page.locator('.menu.as-sheet:not(.leaving)').count() !== 1) throw new Error('two sheets open at once');
    await page.waitForFunction(() => !document.querySelector('.menu.as-sheet:not(.leaving)').getAnimations().length);
    if (!(await above('.menu.as-sheet:not(.leaving)'))) throw new Error('Settings, opened from History, does not sit on the tab row');
    if (!(await page.locator('.menu.as-sheet:not(.leaving) .menu-item:has-text("Search")').count())) throw new Error('Search is not in Settings');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
  // No card is ever drawn over the tab row: sampled every frame while Treat and Tests open, are pulled down from a button
  // in their content (which closes them), and while Tests closes from its tab. A pull from a button on Treat closes it.
  if (device === 'phone') await check(device, 'thumb dock: no card ever covers the tab row (open, drag, close); a pull from anywhere closes Treat', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.__cover = [];
      const tick = () => { const b = document.querySelector('#thumbBar'), r = b.getBoundingClientRect();
        for (const f of [0.1, 0.5, 0.9]) for (const y of [r.top + 4, r.bottom + 3, innerHeight - 1]) { const e = document.elementFromPoint(r.left + r.width * f, y); const c = e?.closest('#treatCard, #dock, #panel, .menu'); if (c) window.__cover.push(c.id || c.className); }
        window.__coverRaf = requestAnimationFrame(tick); };
      tick();
    });
    for (const [tab, sel] of [['treat', '#treatCard'], ['tests', '#dock']]) {
      await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForTimeout(900);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#stageBottom')).opacity === '0', null, { timeout: 5000 })   // (its fade, on a busy browser)
        .catch(() => { throw new Error(`the play bar still shows over the ${tab} card`); });
      const pt = await page.evaluate((sel) => { const c = document.querySelector(sel), b = [...c.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.height && !x.closest('[role="tablist"], .card-head, .dock-head, .tc-head') && r.top > c.getBoundingClientRect().top + 80 && r.bottom < document.querySelector('#thumbBar').getBoundingClientRect().top; }); const r = (b || c).getBoundingClientRect(); return [r.x + r.width / 2, r.y + Math.min(r.height / 2, 20)]; }, sel);
      await page.mouse.move(pt[0], pt[1]); await page.mouse.down();
      for (let i = 1; i <= 30; i++) await page.mouse.move(pt[0], pt[1] + 6 * i);
      // (The card follows the finger from the button: the button never keeps the pull to itself.)
      if (tab === 'treat' && !(await page.evaluate(() => { const c = document.querySelector('#treatCard'); return c.classList.contains('dragging') && parseFloat(c.style.getPropertyValue('--sink')) > 100; }))) throw new Error('a pull down from a button on Treat did not move it');
      await page.mouse.up();
      // (It sinks behind the tab row and closes; a slow runner's frames can run late, so the close is waited for, not timed.)
      if (tab === 'treat' && !(await page.waitForFunction(() => document.querySelector('#treatCard').hidden, null, { timeout: 5000 }).then(() => true, () => false))) throw new Error('a pull down from a button on Treat did not close it');
      await page.waitForTimeout(700);
      if (tab === 'tests' && await page.evaluate(() => document.querySelector('#app').classList.contains('dock-open'))) await page.click('#thumbBar [data-tab="tests"]');
      await page.waitForTimeout(700);
    }
    const cover = await page.evaluate(() => { cancelAnimationFrame(window.__coverRaf); return [...new Set(window.__cover)]; });
    if (cover.length) throw new Error(`drawn over the tab row: ${cover.join(', ')}`);
  });
}
