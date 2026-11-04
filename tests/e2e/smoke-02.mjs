// Browser checks 2 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "leaving the lobule frames the next view, not the dive" to "a vessel\".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ DEVICES, check, device, gotoSlide, instantMotionOn, open, pickView, quiet, server, shot, tapTool, turnCircuit }) {
  await check(device, 'leaving the lobule frames the next view, not the dive', async (page) => {
    await open(page, '?preset=cirr-decomp');
    const T = () => page.evaluate(() => (document.querySelector('#world').getAttribute('transform') || '').replace(/-?\d+\.\d+/g, (n) => (+n).toFixed(1)));
    // A software renderer draws a frame a second or two apart: wait until the transform holds for a while.
    const steady = async () => { let a = await T(), same = 0; for (let i = 0; i < 80 && same < 5; i++) { await page.waitForTimeout(300); const c = await T(); same = c === a ? same + 1 : 0; a = c; } return a; };
    // The opening framing is set before the vitals dock reaches its full height (its caption line
    // arrives later); the anatomy's own framing is what Fit gives once the page has settled.
    await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const home = await steady();
    await pickView(page, 'lobule');
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await pickView(page, 'circuit');
    const inCircuit = await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const f1 = await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const f2 = await steady();
    if (inCircuit !== f1 && inCircuit !== f2) throw new Error(`circuit opened at ${inCircuit}, not at a fit framing (${f1} / ${f2})`);
    await pickView(page, 'anatomic');
    const back = await steady();
    if (back !== home) throw new Error(`the anatomy came back at ${back}, not at its framing ${home}`);
  });

  // Zooming out never leaves the figure small: the first pinch out after the page opens (on a large Mac window a refit glide
  // used to be cut off as the figure appeared, stay 'gliding' for good and stop the spring back, so the figure stayed small and
  // off to one side), a mouse wheel, and the − button all end on the whole figure, the same framing Fit gives.
  if (device === 'desktop') await check(device, 'zooming out ends on the whole figure: pinch, wheel and the − button, from a fresh page', async (page) => {
    await page.setViewportSize({ width: 1908, height: 1175 });
    await open(page);
    const key = () => page.evaluate(() => window.pps.stage.cameraKey());
    const steady = async () => { let a = await key(), same = 0; for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await key(); same = c === a ? same + 1 : 0; a = c; } return a; };
    await page.waitForFunction(() => window.ppsFigureReady, null, { timeout: 45000 });
    const restore = await instantMotionOn(page);
    await steady();
    const out = (n, ctrl) => page.evaluate(([n, ctrl]) => new Promise((done) => {
      const x = innerWidth / 2, y = innerHeight / 2, el = document.elementFromPoint(x, y);
      let i = 0; const tick = () => { el.dispatchEvent(new WheelEvent('wheel', { deltaY: ctrl ? 6 : 100, ctrlKey: ctrl, clientX: x, clientY: y, bubbles: true, cancelable: true })); if (++i < n) setTimeout(tick, 16); else done(); };
      tick();
    }), [n, ctrl]);
    // (the first thing done on the page: a pinch out, no Fit before it)
    await out(60, true);
    const pinched = await steady();
    await page.click('#zoomFit');
    const whole = await steady();
    if (pinched !== whole) throw new Error(`a pinch out on a fresh page stayed at ${pinched}, not the whole figure ${whole}`);
    await page.mouse.move(954, 587);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 200);
    let k = await steady();
    if (k !== whole) throw new Error(`a mouse wheel out stayed at ${k}, not the whole figure ${whole}`);
    for (let i = 0; i < 4; i++) await page.click('#zoomOut');
    k = await steady();
    if (k !== whole) throw new Error(`the − button stayed at ${k}, not the whole figure ${whole}`);
    await restore();
  });

  // Fit always brings the figure back to its framing, whatever the hand did just before it: a Mac trackpad's scroll still coming in
  // (its momentum runs on for a second after the fingers lift, and used to cancel the lobule's Fit and carry the anatomy off it again),
  // a mouse flick still gliding, a pinch or the − button past the framing, or a resize. In the anatomy, the circuit and the lobule.
  if (device === 'desktop') await check(device, 'Fit always re-frames the figure after a zoom, pan, flick, scroll or resize', async (page) => {
    await open(page, '?preset=cirr-decomp');
    const key = () => page.evaluate(() => (window.pps.store.get().lobule ? 'lobule ' + window.pps.stage.lobuleViewKey() : window.pps.stage.cameraKey()));
    // (a software renderer can take a second a frame: settled means the camera holds over several readings)
    const steady = async () => { let a = await key(), same = 0; for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await key(); same = c === a ? same + 1 : 0; a = c; } return a; };
    const fitKey = async () => { await page.click('#zoomFit'); return steady(); };
    // A trackpad scroll (or, with ctrl, a pinch) at the middle of the figure: one event every 16 ms for `ms`, Fit pressed `fitAt` ms in.
    // (It stops early if the page stalls between two events for longer than a real scroll ever pauses: that would be a new scroll.)
    const scrollThenFit = (dx, dy, ms, fitAt, ctrl = false) => page.evaluate(([dx, dy, ms, fitAt, ctrl]) => new Promise((done) => {
      const x = innerWidth * 0.55, y = innerHeight * 0.5, el = document.elementFromPoint(x, y), t0 = performance.now();
      let last = t0, pressed = false;
      const tick = () => {
        const now = performance.now();
        if (now - last > 200) { if (!pressed) document.querySelector('#zoomFit').click(); done(); return; }
        last = now;
        el.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, deltaMode: 0, ctrlKey: ctrl, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        if (!pressed && now - t0 >= fitAt) { pressed = true; document.querySelector('#zoomFit').click(); }
        if (now - t0 < ms) setTimeout(tick, 16); else done();
      };
      tick();
    }), [dx, dy, ms, fitAt, ctrl]);
    // A quick mouse drag let go while still moving (a flick), then Fit at once.
    const flickThenFit = () => page.evaluate(() => {
      const x = innerWidth * 0.55, y = innerHeight * 0.5, el = document.elementFromPoint(x, y);
      const ev = (type, i) => el.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x + i * 40, clientY: y + i * 12, bubbles: true, cancelable: true }));
      const until = (t) => { while (performance.now() < t) { /* the moves come 12 ms apart */ } };
      ev('pointerdown', 0);
      for (let i = 1; i <= 6; i++) { until(performance.now() + 12); ev('pointermove', i); }
      ev('pointerup', 6);
      document.querySelector('#zoomFit').click();
    });
    const expect = async (what, ref) => { const k = await steady(); if (process.env.SMOKE_FIT_LOG) console.log(what, k); if (k !== ref) throw new Error(`${what}: Fit left the view at ${k}, not at its framing ${ref}`); };
    // (zoomed in for certain before the next step: on a slow renderer a reading taken before the zoom's glide began looked settled)
    const zoomIn = async (n = 2) => { const k0 = await key(); for (let i = 0; i < n; i++) await page.click('#zoomIn'); for (let i = 0; i < 100 && (await key()) === k0; i++) await page.waitForTimeout(100); await steady(); };
    // (the figure's WebGL canvases are not shown: a software renderer then draws several frames a second instead of one)
    const restore = await instantMotionOn(page);
    await steady();
    for (const view of ['anatomic', 'circuit', 'lobule']) {
      await pickView(page, view);
      if (view === 'lobule') await page.waitForFunction(() => window.pps.stage.lobuleSettled() && window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
      await steady();
      const ref = await fitKey();
      await zoomIn(); await scrollThenFit(14, 10, 1400, 250); await expect(`${view}, zoomed in, a trackpad scroll still running`, ref);
      if (view !== 'circuit') { await zoomIn(); await scrollThenFit(0, 20, 700, 350, true); await expect(`${view}, a pinch out still running`, ref); }
      if (view !== 'lobule') { await zoomIn(); await flickThenFit(); await expect(`${view}, zoomed in, a flick still gliding`, ref); }
      if (view !== 'anatomic') continue;
      await scrollThenFit(14, 10, 1400, 250); await expect(`${view}, at its framing, a trackpad scroll still running`, ref);
      for (let i = 0; i < 3; i++) await page.click('#zoomOut');
      await page.click('#zoomFit'); await page.click('#zoomFit'); await expect(`${view}, after the − button and Fit twice`, ref);
      await zoomIn(1); await page.setViewportSize({ width: 1100, height: 720 }); await steady();
      const small = await fitKey(); await page.click('#zoomIn'); await page.click('#zoomFit');
      await expect(`${view}, after a resize`, small);
      await page.setViewportSize(DEVICES.desktop.viewport);
    }
    await restore();
  });

  // The corner credit holds its spot while it stays good (review, 15 Oct): on Circuit 7 a station's live number changing width
  // beside it had it hop between two spots every few seconds. And on a lobule slide it keeps off the lobule (it had sat on the
  // hepatocytes: its art test looked at the anatomy hidden under the lobule).
  if (device === 'phone') await check(device, 'The credit holds its spot while numbers tick, and keeps off the lobule', async (page) => {
    // (on an upright iPad: an iPhone carries the credit in the teaching card's foot, so the figure's credit is a tablet's and a laptop's)
    const restore = await instantMotionOn(page);
    const shown = () => page.waitForFunction(() => { const c = document.querySelector('.stage-credit'); return c.matches('.placed:not(.moving), .covered') && !document.querySelector('#app.pz-moving'); }, null, { timeout: 60000 });
    await gotoSlide(page, server.url, 'circuit', 6);   // (reached at the phone's size, then turned into an iPad: a slide reached at 3x iPad size outran the wait)
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.waitForTimeout(1000); await quiet(page); await shown();
    await page.evaluate(() => { const c = document.querySelector('.stage-credit'); window.__moves = []; let last = ''; const tick = () => { const k = (c.matches('.moving, .covered') ? 'hidden ' : '') + c.style.getPropertyValue('--cx') + ',' + c.style.getPropertyValue('--cy'); if (k !== last) { if (last) window.__moves.push(k); last = k; } window.__mt = requestAnimationFrame(tick); }; tick(); });
    await page.waitForTimeout(12000);
    const moves = await page.evaluate(() => { cancelAnimationFrame(window.__mt); return window.__moves; });
    if (moves.length) { await page.setViewportSize({ width: 390, height: 844 }); await restore(); throw new Error(`Circuit 7: the credit moved ${moves.length} times in 12 s with nothing but the numbers changing (${moves.slice(0, 4).join(' | ')})`); }
    await gotoSlide(page, server.url, 'lobule', 1);
    await page.waitForFunction(() => window.pps.stage.lobuleSettled() && window.pps.stage.lobuleRing(), null, { timeout: 60000 });
    await quiet(page); await shown();
    const on = await page.evaluate(() => {
      if (document.querySelector('.stage-credit.covered')) return null;   // (hidden: nowhere bare)
      const ring = window.pps.stage.lobuleRing(), r = document.querySelector('.stage-credit').getBoundingClientRect();
      const inside = ([x, y]) => { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o; } return o; };
      const pts = []; for (let u = 0; u <= 1; u += 0.25) for (const v of [0, 0.5, 1]) pts.push([r.left + u * r.width, r.top + v * r.height]);
      return pts.some(inside) ? `${Math.round(r.left)},${Math.round(r.top)}` : null;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await restore();
    if (on) throw new Error(`Lobule 2: the credit sits on the lobule at ${on}`);
  });

  // The credit at 12 px (15 Oct). An iPhone carries it as one line at the teaching card's foot, whole and clear of the words, the key
  // and the pill (on the figure it had been scaled to about 9 px and, on Treatment 2, sat across a vessel). A tablet keeps it on the
  // figure, only on bare figure (or hidden where nothing is bare).
  if (device === 'phone') await check(device, 'The credit is 12 px: in the iPhone card foot, on bare figure on an iPad (Treatment 2)', async (page) => {
    const restore = await instantMotionOn(page);
    await gotoSlide(page, server.url, 'treatment', 1);
    await quiet(page);
    const phone = await page.evaluate(() => {
      const out = [], c = document.querySelector('.pz-shade .pz-cred'), st = document.querySelector('.stage-credit');
      if (getComputedStyle(st).display !== 'none') out.push('the figure credit still shows on an iPhone slide');
      if (!c || !c.offsetWidth) return [...out, 'no credit at the card foot'];
      const cs = getComputedStyle(c), r = c.getBoundingClientRect(), sh = document.querySelector('.pz-shade').getBoundingClientRect();
      if (parseFloat(cs.fontSize) < 12) out.push(`text ${cs.fontSize}`);
      if (c.scrollWidth > c.clientWidth + 1 || r.left < sh.left || r.right > sh.right || r.bottom > sh.bottom) out.push('cut off or outside the card');
      for (const s of ['.pz-text', '.pz-bar', '.pz-fk:not([hidden])']) for (const e of document.querySelectorAll(s)) {
        const q = e.getBoundingClientRect(), w = Math.min(q.right, r.left + c.scrollWidth) - Math.max(q.left, r.left), h = Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top);
        if (q.width && w > 0 && h > 0) out.push(`overlaps ${s}`);
      }
      return out;
    });
    if (phone.length) { await restore(); throw new Error(`Treatment 2 on an iPhone: ${phone.join('; ')}`); }
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.waitForTimeout(1500); await quiet(page);
    await page.waitForFunction(() => document.querySelector('.stage-credit').matches('.placed:not(.moving), .covered'), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const pad = await page.evaluate(() => {
      const cr = document.querySelector('.stage-credit'), cs = getComputedStyle(cr), out = [];
      const px = parseFloat(cs.fontSize) * (cs.scale === 'none' ? 1 : parseFloat(cs.scale));
      if (px < 12) out.push(`text ${px.toFixed(1)} px`);
      if (cr.classList.contains('covered')) return out;   // (hidden where nothing is bare: allowed)
      // (the figure's vessels and organs under its drawn box, sampled every 3 px; a vessel is the stage's own pick, there is no element for it)
      const b = cr.getBoundingClientRect(), on = new Set();
      for (let x = b.left; x <= b.right; x += 3) for (let y = b.top; y <= b.bottom; y += 3) {
        if (window.pps.stage.vesselUnder(x, y, 0)) on.add('a vessel');
        for (const e of document.elementsFromPoint(x, y)) if (e.matches('g.organ *, #labels .lb *')) on.add(e.matches('#labels .lb *') ? 'a label' : 'an organ');
      }
      if (on.size) out.push(`sits on ${[...on].join(' and ')} at ${b.left | 0},${b.top | 0}`);
      return out;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await restore();
    if (pad.length) throw new Error(`Treatment 2 on an upright iPad: the credit ${pad.join('; ')}`);
  });

  // Turning an iPad mid-slide (review #52): the data card never shows over the words' card on the way, and turned upright it
  // leaves the stacked place under the words (it had stayed there for good, hidden behind them, when its fade-out ran slow).
  if (device === 'phone') await check(device, 'Turning an iPad mid-slide keeps the data card off the words', async (page) => {
    // (reached with motion instant, as the layout checks do, and an iPad held sideways; the turns then run with the page's own fades and glides)
    const restore = await instantMotionOn(page);
    await gotoSlide(page, server.url, 'hvpg', 5);
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.waitForTimeout(1000); await quiet(page);
    await restore();
    await page.evaluate(() => {
      window.__ov = [];
      const vis = (el) => el && !el.hidden && +getComputedStyle(el).opacity > 0.05 && el.getBoundingClientRect().width > 0;
      const tick = () => {
        const t = document.querySelector('.pz-text'), d = document.querySelector('.pz-data');
        if (vis(t) && vis(d)) { const a = t.getBoundingClientRect(), b = d.getBoundingClientRect(); const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left), oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ow > 4 && oh > 4) window.__ov.push(`${Math.round(ow)}x${Math.round(oh)} at ${innerWidth}x${innerHeight}`); }
        window.__ovT = requestAnimationFrame(tick);
      };
      tick();
    });
    for (const [w, h] of [[1024, 1366], [1366, 1024], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(3000); await quiet(page);
    }
    const r = await page.evaluate(() => { cancelAnimationFrame(window.__ovT); const d = document.querySelector('.pz-data'); return { ov: window.__ov, col: d.classList.contains('col'), top: Math.round(d.getBoundingClientRect().top) }; });
    if (r.ov.length) throw new Error(`the data card covered the words' card while turning (${r.ov.slice(0, 3).join(', ')})`);
    if (r.col) throw new Error(`turned upright, the data card stayed stacked under the words (top ${r.top})`);
  });

  // Turning the device while paused re-frames the figure for the new shape, with the Tests sheet open (review #19): the
  // refit used to run only on the model's frames, and a turned phone or iPad kept the old framing (the figure off screen
  // behind the sheet, or under the top bar). Judged against Fit's own framing for the new shape.
  if (device === 'phone') await check(device, 'A turn while paused re-frames the figure for the new shape', async (page) => {
    await open(page);
    const key = () => page.evaluate(() => window.pps.stage.cameraKey());
    const steady = async () => { let a = await key(), same = 0; for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await key(); same = c === a ? same + 1 : 0; a = c; } return a; };
    await page.waitForFunction(() => window.ppsFigureReady, null, { timeout: 45000 });
    await tapTool(page, '#tabInstruments');
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => !window.pps.store.get().running);
    await steady();
    for (const [w, h] of [[844, 390], [390, 844], [1366, 1024], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: h });
      const got = await steady();
      await page.evaluate(() => window.pps.stage.refit());
      const want = await steady();
      if (got !== want) throw new Error(`turned to ${w}x${h} while paused, the camera stayed at ${got}, not the new shape's framing ${want}`);
    }
  });

  // Every way into or out of the lobule is one continuous zoom (to the lobule's normal framing; the sinusoid and a station are a second zoom from there): the camera's magnification (the plate's zoom plus the dive's)
  // moves steadily from the first frame to the last, in one direction, with no stop at an intermediate framing (the liver, the fit).
  // The presenter's slides are walked with the arrow keys, from the slide before a crossing to the one after it, and back.
  const CROSSINGS = [   // [deck, slide to start on (0-based), key, whether the key goes into the lobule, whether it is the sinusoid view that is gone to or left]
    ['circulation', 3, 'ArrowRight', true], ['circulation', 4, 'ArrowLeft', false], ['circulation', 5, 'ArrowRight', false],   // ladder → lobule and back; the sinusoid wall → the next view
    ['lobule', 0, 'ArrowRight', true],   // the outline's fit → the whole lobule
    ['ncph', 1, 'ArrowRight', true], ['ncph', 4, 'ArrowRight', true], ['ncph', 5, 'ArrowRight', false, false, true],   // a fit, then a liver close-up, before it (the last one leaves the lobule for the summary table)
    ['sites', 7, 'ArrowLeft', true],   // backwards into it
    ['ascites', 0, 'ArrowRight', true, true], ['ascites', 4, 'ArrowRight', true, true],   // anatomy straight to the sinusoid view, through the lobule without stopping in it
    ['ascites', 5, 'ArrowRight', false, true, true],   // and the sinusoid view straight back out to the anatomy (a new patient: the words, and so the space the camera frames into, are settled after the rise)
    ['hvpg', 5, 'ArrowRight', false, false, true], ['outflow', 4, 'ArrowRight', true],   // out to a region, with a new patient (schisto to chronic PVT: the words settle after the rise); in from a region
    // In Explore (the view buttons), with no slide: anatomy to the lobule, to a station in it as a slide asks for one, and straight to
    // the sinusoid view and back out.
    ['explore', 'lobule', null, true], ['explore', 'triad', null, true], ['explore', 'sinusoid', null, true, true], ['explore', 'out', null, false, true],
  ];
  for (const [deck, from, key, into, sin, newPatient] of CROSSINGS) {
    const explore = deck === 'explore';
    await check(device, `lobule zoom is continuous: ${explore ? 'Explore' : `${deck} slide ${from + 1}`} ${key === 'ArrowLeft' ? 'back ' : ''}${into ? 'into' : 'out of'} the ${sin ? 'sinusoid view' : 'lobule'}${from === 'triad' ? ', at its portal tract' : ''}`, async (page) => {
      await open(page, '?preset=healthy');
      const n = explore ? from : from + 1, way = (into ? 'into' : 'out of') + (sin ? ' the sinusoid view' : ' the lobule');
      if (!explore) {
        await page.evaluate(([d, i]) => window.pps.presenter.start(d, i), [deck, from]);
        await page.waitForFunction((n) => (document.querySelector('.pzb-n, .pz-count')?.textContent || '').trim().startsWith(n + ' /') && !document.querySelector('.pz-cover'), n, { timeout: 60000 });
      } else if (from === 'out') {
        await page.evaluate(() => window.pps.stage.diveToSinusoid());
        await page.waitForFunction(() => window.pps.stage.sinusoidOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
      }
      const viewKey = () => page.evaluate(() => `${window.pps.stage.lobuleOpen()}|${window.pps.stage.lobuleSettled()}|${window.pps.stage.cameraKey()}|${document.querySelector('.pz-load.on') ? 'load' : ''}`);
      const quiet = async (open, from) => {   // the figure holds still (a software renderer draws a frame a second or two apart)
        // (After a key, first the move has to begin: the old slide's words leave before it, which on a loaded software
        // renderer can hold the view as it was for longer than the stillness looked for below.)
        if (from) for (let t0 = Date.now(); (await viewKey()) === from && Date.now() - t0 < 60000;) await page.waitForTimeout(400);
        // (A case card holds the slide's own zoom until it is tapped away, as a person does (3c79c6f): tapped once it shows, and the
        // slide waited for as gotoSlide does.)
        if (from && !explore) await page.waitForFunction(() => { document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy(); }, null, { timeout: 120000, polling: 100 });
        let last = '', same = 0;
        for (let i = 0; i < 120 && same < 6; i++) {
          await page.waitForTimeout(400);
          const k = await viewKey();
          same = k === last ? same + 1 : 0; last = k;
        }
        if (open !== undefined && (await page.evaluate(() => window.pps.stage.lobuleOpen())) !== open) throw new Error(`${deck} slide ${n}: the lobule is ${open ? 'not open' : 'still open'} once the view settled`);
      };
      await quiet();
      if (sin && !into && !(await page.evaluate(() => window.pps.store.get().sinusoid))) throw new Error(`${deck} slide ${n}: expected to start in the sinusoid view`);
      if ((await page.evaluate(() => window.pps.stage.lobuleOpen())) === into) throw new Error(`${deck} slide ${n}: expected to start ${into ? 'outside' : 'inside'} the lobule`);
      await page.evaluate(() => {
        const rec = window.__zoomTrace = { go: true, s: [] };
        const tick = () => { if (!rec.go) return; const z = window.pps.stage.cameraZoom(); if (z !== null) rec.s.push([performance.now(), z]); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await page.evaluate(() => window.pps.stage.cameraMoves(true));
      const before = await viewKey();
      if (explore) {
        // (A station is aimed at as the presenter aims at a slide's, before the dive.)
        await page.evaluate((m) => { if (m === 'triad') window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); if (m === 'sinusoid') window.pps.stage.diveToSinusoid(); else if (m === 'out') window.pps.stage.exitSinusoid(); else window.pps.store.set({ lobule: true }); }, from);
      } else {
        const label = await page.evaluate(() => document.querySelector('.pzb-n, .pz-count')?.textContent.trim());
        await page.keyboard.press(key);
        await page.waitForFunction((l) => (document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '') !== l, label);
      }
      await quiet(into, before);
      const s = await page.evaluate(() => { window.__zoomTrace.go = false; return window.__zoomTrace.s; });
      // One move: the dive (or rise) itself, with no glide of the camera before or after it beyond a small settling (a new patient changes the space the words leave, after the rise has begun).
      const moves = await page.evaluate(() => window.pps.stage.cameraMoves());
      const big = moves.filter((m) => m.kind === 'glide' && (m.zoom > 0.2 || m.pan > 100));
      // The sinusoid view and a station in the lobule are gone to in two steps (the lobule's normal framing first, then the target; out, the same in reverse), so a glide beside the dive or rise is expected there.
      const twoStep = sin || big.length > 0;
      if (big.length && !newPatient && !twoStep) throw new Error(`${deck} slide ${n} ${way}: the camera also glided ${big.map((m) => `${m.zoom.toFixed(2)} in zoom, ${Math.round(m.pan)} across`).join('; ')} (${moves.map((m) => m.kind + (m.zoom !== undefined ? ` ${m.zoom.toFixed(2)}/${Math.round(m.pan)}@${Math.round(m.t - moves[0].t)}` : '')).join(', ')})`);
      if (moves.some((m) => m.kind === 'chain-in' || m.kind === 'chain-out')) throw new Error(`${deck} slide ${n} ${way}: a zoom straight through the lobule, without stopping at its normal framing (${moves.map((m) => m.kind).join(', ')})`);
      if (sin && into && !(await page.evaluate(() => window.pps.store.get().sinusoid && window.pps.stage.sinusoidOpen()))) throw new Error(`${deck} slide ${n}: the sinusoid view is not open at the end`);
      if (moves.filter((m) => m.kind === 'dive' || m.kind === 'rise').length !== 1) throw new Error(`${deck} slide ${n} ${way}: ${moves.filter((m) => m.kind === 'dive' || m.kind === 'rise').length} dives or rises, not one`);
      // The zoom's own span: from its first move to its last (the words fade before it starts and the labels after it ends).
      if (process.env.ZOOM_TRACE) console.log(`${deck} ${n} ${key}`, s.map(([t, z]) => `${Math.round(t - s[0][0])}:${z.toFixed(3)}`).join(' '));
      const z0 = s[0]?.[1], zEnd = s[s.length - 1]?.[1];
      // (A loaded software renderer may draw too few frames to follow the zoom: the check of the moves above is then the one that counts.)
      if (twoStep || s.length < 10 || Math.abs(zEnd - z0) < 0.3) return;
      const dir = Math.sign(zEnd - z0), eps = 0.02;   // (a step under 2% of the scale over 150 ms or more is a stop)
      let a = 0, b = s.length - 1;
      while (a < b && Math.abs(s[a + 1][1] - s[0][1]) < 0.02 * Math.abs(zEnd - z0)) a++;
      // (The last few percent may settle slowly, as the framing takes the slide's words into account; a stop before that is a stop.)
      while (b > a && Math.abs(s[b - 1][1] - zEnd) < 0.05 * Math.abs(zEnd - z0)) b--;
      for (let i = a + 1; i <= b; i++) {
        const dz = (s[i][1] - s[i - 1][1]) * dir, dt = s[i][0] - s[i - 1][0];
        if (dz < -0.004) throw new Error(`${deck} slide ${n} ${way}: the zoom turned back (${(-dz).toFixed(3)} log units at ${Math.round(s[i][0] - s[a][0])} ms)`);
        if (dz < eps && dt > 150) throw new Error(`${deck} slide ${n} ${way}: the zoom stopped part way for ${Math.round(dt)} ms, at ${Math.round(100 * (s[i][1] - z0) / (zEnd - z0))}% of its way`);
      }
    });
  }

  await check(device, 'circuit turns upright and back', async (page) => {
    await open(page, '?preset=csph');
    // (Out of the circuit it is folded away in the zoom pill, no size and hidden, as it folds and opens (61f5c59), not taken out of the layout.)
    if (await page.$eval('#rotateCircuit', (b) => { const s = getComputedStyle(b); return s.display !== 'none' && s.visibility !== 'hidden' && b.getBoundingClientRect().width > 0; })) throw new Error('turn button shows in the anatomy');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    // Animations step with the frames: wait for where they end, not a fixed time (CI has no GPU).
    const ratio = () => { const s = document.querySelector('#stage'); return s.viewBox.baseVal.height / s.viewBox.baseVal.width; };
    const until = (fn, msg) => page.waitForFunction(fn, null, { timeout: 30000 }).catch((e) => { throw new Error(msg, { cause: e }); });
    // A phone held upright opens the circuit upright; turn it wide first.
    if (device === 'phone') { await until(`(${ratio})() > 1`, 'circuit did not open upright on a phone'); await turnCircuit(page); }
    await until(`(${ratio})() < 1`, 'circuit did not open wide');
    await turnCircuit(page);
    await until(`(${ratio})() > 1`, 'circuit did not turn tall');
    // Zoomed in, turning back keeps the zoom.
    // The zoom glides: read it once it holds still (a software renderer draws a frame a second or two apart).
    const steady = () => page.evaluate(() => new Promise((res) => { let a = window.pps.stage.zoomLevel(); const t = setInterval(() => { const b = window.pps.stage.zoomLevel(); if (Math.abs(b - a) < 1e-4) { clearInterval(t); res(b); } a = b; }, 700); }));
    const k0 = await steady();
    await page.evaluate(() => { window.pps.stage.zoomIn(); window.pps.stage.zoomIn(); });
    await page.waitForFunction((k0) => window.pps.stage.zoomLevel() > k0 * 1.5, k0, { timeout: 60000 });
    const kIn = await steady();
    await turnCircuit(page);
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
    let kAfter = await steady();
    for (let i = 0; i < 8 && Math.abs(kAfter - kIn) / kIn > 0.05; i++) kAfter = await steady();   // a loaded runner can read mid-glide; a real reset stays reset
    if (Math.abs(kAfter - kIn) / kIn > 0.05) throw new Error(`turning reset the zoom (${kIn.toFixed(2)} → ${kAfter.toFixed(2)})`);
    await page.evaluate(() => window.pps.stage.fit()); await turnCircuit(page);
    await until(`(${ratio})() > 1`, 'circuit did not turn tall again');
    if ((await page.$eval('#rotateCircuit', (b) => b.getAttribute('aria-pressed'))) !== 'true') throw new Error('turn button is not pressed');
    await shot(page, `${device}-circuit-upright`);
    // A vessel can still be picked, and the flow marks keep running, in the turned map.
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.evaluate(() => { window.pps.store.set({ selection: null }); document.querySelector('#rotateCircuit').click(); });
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
  });
  // Scope's Wall mechanics tab (15 Oct): every tile's name on one line and never cut, values and units inside their tiles, the values
  // of each row of tiles on one line, the name and value of the stress tile apart, and every tile inside the card (no scrolling) at
  // Half and Full on phones down to an iPhone SE with Safari's toolbar, and at desktop and upright and sideways iPad sizes,
  // with long and extreme readings.
  await check(device, 'Wall mechanics tiles fit at every card size', async (page) => {
    const sizes = device === 'phone' ? [[390, 844], [375, 667], [390, 664], [430, 932], [320, 568], [320, 480]] : [[1440, 900], [820, 1180], [1180, 820]];   // (320 wide: the compact Half card)
    const fit = () => page.evaluate(() => {
      const v = document.querySelector('.wall-view'), pane = v.closest('.dock-pane'), pr = pane.getBoundingClientRect(), bad = [];
      const tiles = [...v.querySelectorAll('.endo-read > div')].filter((d) => d.offsetWidth);
      if (tiles.length !== 5) bad.push(`${tiles.length} tiles shown`);
      for (const d of tiles) {
        const dt = d.querySelector('dt'), q = d.getBoundingClientRect(), name = dt.textContent;
        if (dt.scrollWidth > dt.clientWidth + 1) bad.push(`name cut: ${name}`);
        if (dt.getBoundingClientRect().height > parseFloat(getComputedStyle(dt).lineHeight) * 1.5) bad.push(`name wraps: ${name}`);
        for (const c of d.querySelectorAll('dd, .wall-big')) {
          if (!c.offsetWidth) continue;
          const r = c.getBoundingClientRect();
          if (c.scrollWidth > c.clientWidth + 1 || r.right > q.right - 2 || r.bottom > q.bottom) bad.push(`value cut: ${name}`);
        }
        if (q.bottom > pr.bottom + 1) bad.push(`tile below the card: ${name}`);
      }
      if (pane.scrollHeight > pane.clientHeight + 4) bad.push(`card scrolls ${pane.scrollHeight - pane.clientHeight}px`);
      const st = v.querySelector('.endo-stress'), g = document.createRange();
      g.selectNodeContents(st.querySelector('dt'));
      const sv = st.querySelector('.wall-big').getBoundingClientRect(), sn = g.getBoundingClientRect();
      if (sn.bottom > sv.top + 1 && sn.right > sv.left - 4) bad.push('stress name meets its value');
      const nums = tiles.filter((d) => d.classList.contains('endo-tile')).map((d) => d.querySelector('.endo-num > span').getBoundingClientRect());
      const rows = [];
      for (const n of nums) { const r = rows.find((x) => Math.abs(x[0].top - n.top) < 30); if (r) r.push(n); else rows.push([n]); }
      for (const r of rows) { const b = r.map((n) => n.bottom); if (Math.max(...b) - Math.min(...b) > 0.5) bad.push(`values not level: ${b.map((x) => x.toFixed(1)).join('/')}`); }
      // The picture's names, measured by their ink as drawn: T clear of the wall's outline and inside the canvas, r inside the
      // varix and clear of its dashes, lumen and muscle inside their rings and lumen clear of the w label and the arrows.
      const cv = v.querySelector('.endo-stage canvas'), gaps = cv?.offsetWidth ? cv.wallGaps : null;
      if (gaps) {
        if (!gaps.T || !gaps.w) bad.push('T or w missing from the picture');
        const least = { T: { ring: 2, top: 1 }, r: { fill: 1, dash: 2 }, lumen: { edge: 1, w: 2, arrows: 2 }, muscle: { outer: 1, band: 1 } };
        for (const [k, lim] of Object.entries(least)) for (const [q, m] of Object.entries(lim)) if (gaps[k] && !(gaps[k][q] >= m - 0.01)) bad.push(`picture: ${k} ${q} ${gaps[k][q]?.toFixed(2)} px (needs ${m})`);
      }
      return bad;
    });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await open(page, '?preset=budd-chiari');
      await page.evaluate(() => window.pps.dock.show('varixwall', { reveal: true }));
      await page.waitForTimeout(900);
      for (const extreme of [false, true]) {
        if (extreme) {
          await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
          await page.waitForTimeout(300);
          await page.evaluate(() => { const v = document.querySelector('.wall-view'); ['188.8', '12.5', '10.4', '9999'].forEach((t, i) => { v.querySelectorAll('.endo-num > span')[i].textContent = t; }); v.querySelector('.wall-big > span').textContent = '1999'; });
        }
        for (const s of device === 'phone' ? ['half', 'full'] : ['card']) {
          if (s !== 'card') { await page.evaluate((half) => { const d = document.getElementById('dock'); for (let i = 0; i < 3 && d.classList.contains('sheet-half') !== half; i++) d.querySelector('.sheet-grab').click(); }, s === 'half'); await page.waitForTimeout(700); }
          const bad = await fit();
          if (bad.length) throw new Error(`${width}x${height} ${s}${extreme ? ' (extreme readings)' : ''}: ${bad.join('; ')}`);
        }
      }
    }
  });

  if (device === 'phone') await check(device, 'action card is a compact sheet that keeps the vessel in view', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(800);
    const read = () => page.evaluate(() => {
      const c = document.querySelector('.action-card'), r = c.getBoundingClientRect(), sv = document.querySelector('#stageView').getBoundingClientRect(), sc = c.querySelector('.ac-scroll');
      const link = c.querySelector('.ac-foot.in-head .link');
      // The figure fills the screen; the sheet rises from the bottom edge, over the vitals dock.
      // (Over the thumb dock it sits 8 px above the tab row instead, with the play bar stepped aside: a571c9c, 15 Oct.)
      const nb = document.querySelector('#app.thumb #thumbBar')?.getBoundingClientRect();
      return { covers: nb ? Math.abs(nb.top - r.bottom - 8) <= 1 : r.bottom <= sv.bottom && r.bottom >= sv.bottom - 40 && r.top < document.querySelector('#vdock').getBoundingClientRect().top, peek: c.classList.contains('peek'), docked: c.classList.contains('docked'), top: r.top - sv.top, h: r.height, stageH: sv.height, scrolls: sc.scrollHeight - sc.clientHeight, links: !!link && link.getBoundingClientRect().height > 0, foot: getComputedStyle(c.querySelector('.ac-foot.at-foot')).display !== 'none' };
    });
    const swipe = async (dy) => {
      const box = await (await page.$('.ac-top')).boundingBox();
      await page.mouse.move(box.x + 100, box.y + 14); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 14 + dy, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(400);
    };
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.waitForTimeout(900);
    let s = await read();
    for (let i = 0; i < 20 && !s.covers; i++) { await page.waitForTimeout(250); s = await read(); }   // the sheet's rise can lag on a slow runner
    if (!s.docked || s.peek) throw new Error('the card should open as a docked sheet, not as the strip');
    if (s.h > s.stageH * 0.36) throw new Error(`the sheet covers ${Math.round((100 * s.h) / s.stageH)} % of the figure`);
    if (!s.covers) throw new Error('the sheet should rise from the bottom of the screen, over the vitals dock');
    if (s.scrolls > 2) throw new Error(`the portal vein card scrolls by ${s.scrolls} px: everything should show at once`);
    if (!s.links || s.foot) throw new Error('Why? and Details should be in the header, with no row of their own at the foot');
    const anchorY = await page.evaluate(() => { const a = window.pps.stage.anchorFor({ type: 'edge', id: 'PV_TRUNK' }); return a && a.y; });
    if (anchorY == null || anchorY > s.top) throw new Error(`the vessel (y ${Math.round(anchorY)}) is under the sheet (top ${Math.round(s.top)})`);
    const zoom = await page.$eval('#zoomPill', (el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { bottom: r.bottom, visible: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 };
    });
    const cardTop = await page.$eval('.action-card', (el) => el.getBoundingClientRect().top);
    // (An upright phone keeps Fit in the Layers tab's menu: nothing floats over the figure.)
    const thumb = await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'));
    if (thumb ? zoom.visible : !zoom.visible || zoom.bottom > cardTop) throw new Error(thumb ? 'the zoom buttons float over the figure on an upright phone' : 'zoom and Fit should remain visible above the card');
    if (await page.$('.ac-grab')) throw new Error('the compact card should have no handle or intermediate heights');
    await swipe(70);
    if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('one swipe down should close the card');
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.waitForTimeout(300);
    // (A phone card has no X: a pull closes it, as above. a571c9c)
    if (thumb) { if (await page.locator('.ac-close').isVisible()) throw new Error('the phone card still shows an X'); } else {
      await page.click('.ac-close');
      await page.waitForTimeout(300);
      if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('close should dismiss the card');
    }

  });
  await check(device, 'a vessel\'s card never covers that vessel (every vessel, each window size)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(800);
    const sizes = device === 'phone' ? [[390, 844]] : [[1440, 900], [1024, 1366]];
    const bad = [];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.pps.stage.fit());
      await page.waitForTimeout(700);
      const ids = await page.evaluate(() => window.pps.stage.shownVessels().filter((id) => window.pps.stage.anchorFor({ type: 'edge', id })));
      if (ids.length < 10) throw new Error(`only ${ids.length} vessels to check`);
      for (const id of ids) {
        await page.evaluate((id) => window.pps.store.set({ selection: { type: 'edge', id } }), id);
        await page.waitForTimeout(device === 'phone' ? 450 : 120);
        const r = await page.evaluate((id) => {
          const c = document.querySelector('.action-card'), a = window.pps.stage.anchorFor({ type: 'edge', id });
          if (c.hidden || !a) return null;
          const view = document.querySelector('#stageView').getBoundingClientRect(), cr = c.getBoundingClientRect();
          // Where the card is going (its left/top glide), relative to the figure.
          const x = c.classList.contains('docked') ? cr.left - view.left : parseFloat(c.style.left), y = c.classList.contains('docked') ? cr.top - view.top : parseFloat(c.style.top);
          const under = a.path.filter(([px, py]) => px > x - a.r && px < x + c.offsetWidth + a.r && py > y - a.r && py < y + c.offsetHeight + a.r).length;
          return { under, docked: c.classList.contains('docked'), mid: a.y > y - a.r && a.x > x - a.r && a.x < x + c.offsetWidth + a.r && a.y < y + c.offsetHeight + a.r };
        }, id);
        // A phone's sheet spans the width: a long vessel may run under it, but the part tapped stays in view.
        if (r && (r.docked ? r.mid : r.under)) bad.push(`${id}@${w}x${h}`);
      }
      await page.evaluate(() => window.pps.store.set({ selection: null }));
    }
    if (bad.length) throw new Error(`card over its vessel: ${bad.join(', ')}`);
  });
}
