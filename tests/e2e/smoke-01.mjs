// Browser checks 1 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "patient loads and the model runs" to "presenter in the liver: a slide change shows only the old and new slides\".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ DEVICES, TEXT_MAX, TEXT_MIN, check, device, open, shot }) {
  await check(device, 'patient loads and the model runs', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForFunction(() => document.querySelector('#scenarioName').textContent.includes('Decompensated'));
    const t1 = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(800);
    const t2 = await page.evaluate(() => window.pps.store.get().frame.t);
    if (!(t2 > t1)) throw new Error('model clock did not advance');
    const hvpg = await page.evaluate(() => window.pps.store.get().frame.metrics.hvpg);
    if (!(hvpg > 12)) throw new Error(`HVPG ${hvpg} is not portal hypertensive`);
    await page.waitForTimeout(600);
    await shot(page, `${device}-anatomy`);
  });

  // A pan or a pinch moves every mark on the figure with it. The vessel marks (bands, the TIPS stent, clamps, clots, plugs,
  // balloons) are drawn by the GPU with the vessels, never by an SVG layer that a browser may composite a frame apart
  // from them; and after every step of a drag and of a pinch the GPU's picture, the bands and the labels' anchor dots
  // all sit where the figure's own transform puts them. At phone, iPad and desktop sizes.
  await check(device, 'pan and pinch: marks and labels stay locked to the figure', async (page) => {
    const sizes = device === 'phone' ? [[390, 844]] : [[1024, 1366], [1440, 900]];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, '?preset=cirr-decomp');
      await page.evaluate(() => { window.pps.host.send({ type: 'action', action: { kind: 'band' } }); window.pps.host.send({ type: 'action', action: { kind: 'band' } }); });
      await page.waitForFunction(() => document.querySelectorAll('.band-ring[data-gl]').length >= 2, null, { timeout: 30000 });
      await page.evaluate(() => window.pps.updateParams({ tips: { on: true, d: 8 } }));
      await page.waitForFunction(() => document.querySelectorAll('.stent-rail[data-gl]').length > 0, null, { timeout: 30000 });
      await page.waitForTimeout(900);
      const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { const f = () => (n-- ? requestAnimationFrame(f) : r()); f(); }), n);
      await frames(3);
      // Where each mark and anchor is now, and the figure's transform (world → stage px) against the GPU's.
      const state = () => page.evaluate(() => {
        const st = window.pps.stage, wr = document.querySelector('.stage-view').getBoundingClientRect();
        const [ox, oy] = st.worldToLocal(0, 0), [ax, ay] = st.worldToLocal(1, 0), [bx, by] = st.worldToLocal(0, 1);
        const M = [ax - ox, ay - oy, bx - ox, by - oy, ox, oy];
        const c = (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2 - wr.left, r.top + r.height / 2 - wr.top]; };
        const svgMarks = [...document.querySelectorAll('#overlays > g:not(.res-zz) :is(path, circle, ellipse, rect)')].filter((e) => !e.closest('[class*="cath"]') && !e.hasAttribute('data-gl') && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('class') || e.tagName);
        return { M, gl: st.glMatrix(), bands: [...document.querySelectorAll('.band-ring, .stent-mark')].map(c), dots: [...document.querySelectorAll('#labels .leader-dot:not(.scan, .ld-gone)')].map(c), svgMarks };
      });
      const fail = [];
      const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
      const apply = (A, B, p) => {   // B · A⁻¹ · p: where the figure's motion from A to B takes the stage point p
        const det = A[0] * A[3] - A[1] * A[2], x = p[0] - A[4], y = p[1] - A[5];
        const u = (A[3] * x - A[2] * y) / det, v = (-A[1] * x + A[0] * y) / det;
        return [B[0] * u + B[2] * v + B[4], B[1] * u + B[3] * v + B[5]];
      };
      const compare = (a, b, what) => {
        if (b.svgMarks.length) fail.push(`${what}: drawn by SVG, not with the vessels: ${b.svgMarks.join(', ')}`);
        if (!b.gl) fail.push(`${what}: the figure is not drawn on the GPU`);
        else if (b.gl.some((v, i) => Math.abs(v - b.M[i]) > (i > 3 ? 0.6 : 0.002 * Math.abs(b.M[0])))) fail.push(`${what}: vessels drawn at [${b.gl.map((v) => v.toFixed(2))}], figure at [${b.M.map((v) => v.toFixed(2))}]`);
        b.bands.forEach((p, i) => { const q = apply(a.M, b.M, a.bands[i]); if (!near(p, q, 0.8)) fail.push(`${what}: mark ${i} (band or stent end) at ${p.map((v) => v.toFixed(1))}, its vessel at ${q.map((v) => v.toFixed(1))}`); });
        // A label may be placed or dropped as the view changes; every anchor dot that stays must ride with the figure.
        const moved = a.dots.map((p) => apply(a.M, b.M, p));
        const kept = b.dots.filter((p) => moved.some((q) => near(p, q, 0.8))).length;
        if (Math.min(a.dots.length, b.dots.length) >= 4 && kept < Math.min(a.dots.length, b.dots.length) * 0.6) fail.push(`${what}: only ${kept} of ${b.dots.length} label anchor dots moved with the figure`);
      };
      const box = await page.locator('.stage-view').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height * 0.45;
      // A pinch in (short of the liver's dive into the lobule), then a drag.
      if (device === 'phone') {
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
        let a = await state();
        await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
        for (let i = 1; i <= 6; i++) {
          await touch('touchMove', [[cx - 40 - i * 8, cy - i * 2], [cx + 40 + i * 8, cy + i * 2]]);
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pinch step ${i}`); a = b;
        }
        await touch('touchEnd', []);
        await frames(3);
        a = await state();
        await touch('touchStart', [[cx, cy]]);
        for (let i = 1; i <= 8; i++) {
          await touch('touchMove', [[cx - i * 14, cy - i * 9]]);
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pan step ${i}`); a = b;
        }
        await touch('touchEnd', []);
      } else {
        await page.mouse.move(cx, cy);
        let a = await state();
        for (let i = 1; i <= 4; i++) {
          await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pinch step ${i}`); a = b;
        }
        await frames(3);
        a = await state();
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
          await page.mouse.move(cx - i * 14, cy - i * 9);
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pan step ${i}`); a = b;
        }
        await page.mouse.up();
      }
      if (fail.length) throw new Error(fail.slice(0, 4).join(' | '));
    }
  });

  // The first fit sets the view, the home framing and the glide's target outright; one object for the three meant the first zoom changed them
  // all, so the home look took the zoomed view for home and glided it back to the fit when a card moved (a pinch in the first seconds undone).
  if (device === 'desktop') await check(device, 'a pinch soon after the page opens stays when a card moves', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForFunction(() => window.ppsFigureReady, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const box = await page.locator('.stage-view').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
    const scale = () => page.evaluate(() => { const st = window.pps.stage, a = st.worldToLocal(0, 0), b = st.worldToLocal(1, 0); return b[0] - a[0]; });
    const rest = await scale();
    await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
    await page.waitForTimeout(800);
    const zoomed = await scale();
    if (zoomed < rest * 1.2) throw new Error(`the pinch did not stay: the figure's scale went ${rest.toFixed(3)} to ${zoomed.toFixed(3)} and was back at the fit within 0.8 s`);
    await page.evaluate(() => dispatchEvent(new Event('pps:occ')));   // (a card or sheet announcing a new place)
    await page.waitForTimeout(1500);
    const after = await scale();
    if (Math.abs(after - zoomed) > 0.005) throw new Error(`a card moving glided the pinched view back: scale ${zoomed.toFixed(3)} to ${after.toFixed(3)} (the fit is ${rest.toFixed(3)})`);
  });

  await check(device, 'sinusoid view: a rebuilt caption does not fade in again (no flashing at rest)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
    await page.waitForFunction(() => document.querySelector('.sv.on') && document.querySelectorAll('.sv-region').length > 3, null, { timeout: 45000 });
    // Once the captions' own entrance has run, no caption may start another fade, however often its text is rebuilt.
    const fading = () => page.evaluate(() => [...document.querySelectorAll('.sv-region')].flatMap((r) => r.getAnimations({ subtree: true })).filter((a) => a.animationName === 'sv-fade-in' && a.playState === 'running').length);
    for (let i = 0; i < 80 && (await fading()); i++) await page.waitForTimeout(300);
    const restarted = await page.evaluate(() => new Promise((res) => {
      let bad = 0; const regions = [...document.querySelectorAll('.sv-region')];
      const mo = new MutationObserver(() => { queueMicrotask(() => { bad += regions.flatMap((r) => r.getAnimations({ subtree: true })).filter((a) => a.animationName === 'sv-fade-in' && a.playState === 'running').length; }); });
      regions.forEach((r) => mo.observe(r, { childList: true }));
      setTimeout(() => { mo.disconnect(); res(bad); }, 4000);
    }));
    if (restarted) throw new Error(`a rebuilt sinusoid caption faded in again (${restarted}): the captions flash`);
  });

  await check(device, 'sinusoid view: the zoom pill stays at the bottom right, with its plus resting and its minus and fit stepping back out to the lobule', async (page) => {
    await open(page, '?preset=healthy');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    const pillBox = () => page.evaluate(() => { const r = document.querySelector('#zoomPill').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, vw: innerWidth, vh: innerHeight }; });
    const lob = await pillBox();
    await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('sin-focus') && document.querySelector('.sv.on'), null, { timeout: 45000 });
    const sin = await pillBox();
    const shown = await page.evaluate(() => ['#zoomIn', '#zoomOut', '#zoomFit'].map((s) => !document.querySelector(s).disabled));
    if (!(sin.w > 0)) throw new Error('the zoom pill is gone in the sinusoid view');
    if (shown.join() !== 'false,true,true') throw new Error(`in the sinusoid the plus should rest and the minus and fit stay active, got ${shown}`);
    if (!(await page.evaluate(() => ['#zoomIn', '#zoomOut', '#zoomFit'].every((q) => document.querySelector(q).offsetParent)))) throw new Error('the sinusoid view does not show all three zoom buttons (+, − and Fit)');
    if (sin.r > sin.vw || sin.b > sin.vh || sin.r < sin.vw - 40 || sin.b < sin.vh - 140) throw new Error(`the zoom pill is not at the bottom right in the sinusoid: ${JSON.stringify(sin)} (lobule: ${JSON.stringify(lob)})`);
    await page.evaluate(() => [...document.querySelectorAll('#zoomOut, #zoomFit')].find((b) => b.offsetParent && !b.disabled).click());
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('sin-focus') && window.pps.store.get().lobule && !window.pps.store.get().sinusoid, null, { timeout: 30000 });
  });

  if (device === 'desktop') await check(device, 'playing, the model frames read the stage styles from a kept copy (no live style reads each frame)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(4000);
    // Each live read of the stage's computed style made the browser bring its styles up to date mid-frame (colours, the plate's
    // theme, whether the figure shows): now read once and kept until a class, style, theme or size change.
    const n = await page.evaluate(async () => {
      const wrap = window.pps.stage.wrap || document.querySelector('.stage-view'), g = window.getComputedStyle;
      let k = 0; window.getComputedStyle = function (el, ...a) { if (el === wrap) k++; return g.call(this, el, ...a); };
      const f0 = window.pps.store.get().frame; await new Promise((r) => setTimeout(r, 3000));
      window.getComputedStyle = g;
      return { k, moved: window.pps.store.get().frame !== f0 };
    });
    if (!n.moved) throw new Error('the model did not run');
    if (n.k > 4) throw new Error(`the stage's computed style was read ${n.k} times in 3 s of playing (kept, it is read again only after a change)`);
  });

  await check(device, 'lobule: a Sinusoid tap during the dive goes on into the sinusoid, and Colored by crossfades', async (page) => {
    await open(page, '?preset=healthy');
    // Tapped while the dive is still on its way (the lobule not yet shown): it used to be dropped.
    await page.evaluate(() => { window.pps.store.set({ lobule: true }); document.querySelector('#viewSeg [data-view="sinusoid"]').click(); });
    await page.waitForFunction(() => window.pps.stage.sinusoidOpen(), null, { timeout: 60000 }).catch(() => { throw new Error('a Sinusoid tap during the dive into the lobule was ignored'); });
    await page.evaluate(() => window.pps.store.set({ sinusoid: false }));
    await page.waitForFunction(() => !window.pps.stage.sinBusy() && !window.pps.stage.sinusoidOpen() && window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    // "Colored by" fades over 300 ms in the lobule, as in the anatomy (it switched at once).
    const fade = await page.evaluate(() => { const s = window.pps.store; s.set({ colorMode: s.get().colorMode === 'flow' ? 'pressure' : 'flow' }); return window.pps.stage.lobuleLensFade(); });
    if (fade === null) throw new Error('changing Colored by in the lobule switched the colours at once instead of crossfading');
    await page.waitForFunction(() => window.pps.stage.lobuleLensFade() === null, null, { timeout: 15000 });
  });

  // The dive into the lobule and the rise out of it, a frame at a time on a held clock. The lobules around the landing one fade in and
  // out as one field and never blink: no frame differs from both the frames beside it by more than those two differ from each other.
  // And the tissue shown scaled down mid-zoom has nothing past the lobule's rim (its corners are clear): it no longer leans on a CSS
  // mask, which Safari dropped for a frame now and then, flashing a pale card of the lobules around the one being landed on.
  await check(device, 'lobule dive and rise: the lobules around the landing one never blink, and the scaled tissue is clear past its rim', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const real = performance.now.bind(performance), st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
      let T = real(), q = [], timers = [], id = 1e9;
      performance.now = () => T;
      window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
      window.setTimeout = (cb, ms = 0, ...a) => { if (typeof cb !== 'function') return st(cb, ms, ...a); timers.push([id, T + (+ms || 0), cb, a]); return id++; };
      window.clearTimeout = (i) => { if (i >= 1e9) timers = timers.filter(([j]) => j !== i); else ct(i); };
      const due = () => { for (;;) { timers.sort((a, b) => a[1] - b[1]); const t = timers[0]; if (!t || t[1] > T) return; timers.shift(); t[2](...t[3]); } };
      window.__step = (dt) => { T += dt; due(); const run = q; q = []; for (const cb of run) cb(T); due(); };
      // Every canvas of the lobule view shown scaled down whose corners are not clear (the WebGL canvases, the vessels' and the tissue's,
      // are not read: the tissue's is hidden through the dive and the rise, which show the 2D canvas's copy).
      window.__opaqueCorners = () => [...document.querySelectorAll('.lz canvas:not(.lz-gl):not(.lz-tissue-gl)')].filter((c) => {
        const cs = getComputedStyle(c);
        if (cs.visibility === 'hidden' || !c.width || !/matrix/.test(cs.transform) || new DOMMatrix(cs.transform).a > 0.999) return false;
        const x = c.getContext('2d'), px = (u, v) => x.getImageData(u, v, 1, 1).data[3];
        return px(0, 0) || px(c.width - 1, 0) || px(0, c.height - 1) || px(c.width - 1, c.height - 1);
      }).map((c) => c.className);
    });
    const shots = [], opaque = new Set();
    for (const [on, ms] of [[true, 2500], [false, 1600]]) {   // (the dive 2.2 s, the rise 1.3 s, and a little after each)
      await page.evaluate((v) => window.pps.store.set({ lobule: v }), on);
      for (let t = 0; t <= ms; t += 50) {
        await page.evaluate(() => window.__step(50));
        for (const c of await page.evaluate(() => window.__opaqueCorners())) opaque.add(c);
        shots.push((await page.screenshot({ type: 'jpeg', quality: 90, scale: 'css' })).toString('base64'));
      }
      for (let i = 0; i < 30; i++) await page.evaluate(() => window.__step(50));
      shots.push(null);   // (the dive and the rise are judged apart)
    }
    if (opaque.size) throw new Error(`mid-zoom, a scaled-down lobule canvas shows past the lobule's rim (${[...opaque].join(', ')}): it would show as a card of lobules if its mask were dropped`);
    const blinks = await page.evaluate(async (shots) => {
      const lum = async (b) => {
        if (!b) return null;
        const img = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b}`)).blob());
        const c = new OffscreenCanvas(Math.round(img.width / 4), Math.round(img.height / 4)), x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        const d = x.getImageData(0, 0, c.width, c.height).data, out = new Float32Array(d.length / 4);
        for (let i = 0; i < out.length; i++) out[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
        return out;
      };
      const L = []; for (const b of shots) L.push(await lum(b));
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
      const out = [];
      for (let i = 1; i + 1 < L.length; i++) {
        if (!L[i - 1] || !L[i] || !L[i + 1]) continue;
        const a = diff(L[i - 1], L[i]), b = diff(L[i], L[i + 1]), c = diff(L[i - 1], L[i + 1]);
        if (Math.min(a, b) > 1.5 && (a + b) / (c + 0.5) > 2.5) out.push(`frame ${i}: ${a.toFixed(1)} and ${b.toFixed(1)} from its neighbours, which differ by ${c.toFixed(1)}`);
      }
      return out;
    }, shots);
    if (blinks.length) throw new Error(`the dive or rise blinked: ${blinks.join('; ')}`);
  });

  if (device === 'desktop') await check(device, 'lobule: a Fit glide redraws its bitmap once, leaving after a close zoom gives back its large bitmaps, and a drain rasterizes the organs once', async (page) => {
    await open(page, '?preset=healthy');
    await page.evaluate(() => window.pps.store.set({ lobule: true }));
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
    const landed = await page.evaluate(() => window.pps.stage.lobuleMem(true));
    for (let i = 0; i < 5; i++) { await page.evaluate(() => document.querySelector('#zoomIn').click()); await page.waitForTimeout(700); }
    await page.waitForFunction((t) => window.pps.stage.lobuleMem(true).tiles > t, landed.tiles, { timeout: 30000 }).catch(() => {});
    const zoomed = await page.evaluate(() => window.pps.stage.lobuleMem(true));
    // A glide (here Fit, from about 2.5×) keeps the lobule's bitmap at the scale it had and redraws it once, as it lands: redrawn at each
    // √2 step on the way (up to 3600 px square, tens of ms each), the glide stuttered.
    const d0 = await page.evaluate(() => window.pps.stage.lobuleMem(true).worldDraws);
    await page.evaluate(() => document.querySelector('#zoomFit').click());
    await page.waitForTimeout(3000);
    const glideDraws = (await page.evaluate(() => window.pps.stage.lobuleMem(true).worldDraws)) - d0;
    if (glideDraws > 1) throw new Error(`the lobule's bitmap was redrawn ${glideDraws} times during one Fit glide (once, when it lands, is enough)`);
    for (let i = 0; i < 5; i++) { await page.evaluate(() => document.querySelector('#zoomIn').click()); await page.waitForTimeout(700); }
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.pps.store.set({ lobule: false }));
    await page.waitForFunction(() => window.pps.stage.lobuleSettled() && !window.pps.stage.lobuleOpen(), null, { timeout: 60000 });
    await page.waitForTimeout(1500);   // (the next dive's idle preparation redraws the world bitmap and a canvas 0.4 to 0.9 s after the lobule is left: read after it)
    const left = await page.evaluate(() => window.pps.stage.lobuleMem(true));
    const MB = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / 1e6).toFixed(1)])));
    if (left.canvases > 0 || left.tiles > Math.max(landed.tiles, 1) * 1.05 || left.world > Math.max(landed.world, 1) * 1.05) throw new Error(`after a close zoom the anatomy still holds the lobule's bitmaps: landed ${MB(landed)}, zoomed ${MB(zoomed)}, after leaving ${MB(left)} (MB)`);
    // Ascites drained: the fluid eases down over a second or two; the organs' raster waits for it to settle (it was redone at every step).
    await page.evaluate(() => window.pps.loadPreset('cirr-decomp'));
    await page.waitForFunction(() => (window.pps.store.get().frame?.slow?.ascites || 0) > 800, null, { timeout: 60000 });
    await page.evaluate(() => window.pps.store.set({ running: false }));
    await page.waitForTimeout(4000);
    const rasters0 = await page.evaluate(() => window.pps.stage.plateRasters());
    await page.evaluate(() => window.pps.host.send({ type: 'action', action: { kind: 'paracentesis', mL: 6000, albumin: true } }));
    await page.evaluate(() => window.pps.store.set({ running: true })); await page.waitForTimeout(1500); await page.evaluate(() => window.pps.store.set({ running: false }));
    await page.waitForTimeout(9000);
    // (Counted as passes over the plate, not as pictures: a pass is a picture a strip at a time, and with the organs drawn on the GPU a
    // picture per organ layer too, so 14 pictures were two passes there, and 4 to 10 on the single picture.)
    const n = (await page.evaluate(() => window.pps.stage.plateRasters())) - rasters0;
    if (n > 2) throw new Error(`draining the ascites rasterized the organ plate ${n} times while the fluid eased (once, plus the view's sharper copy, is enough)`);
  });

  await check(device, 'lobule: the flow chevrons show when Chevrons is on (and go when it is off)', async (page) => {
    await open(page, '?preset=healthy');
    await page.evaluate(() => { const s = window.pps.store; s.set({ blood: { ...s.get().blood, chevrons: true } }); window.pps.host.send({ type: 'run', running: false }); });
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    // The vessels' layer, read back after a frame; with the clock paused only the chevrons differ between on and off.
    const grab = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
      window.pps.stage.lobuleCapture?.();   // (no picture kept between frames: laid first)
      const g = document.querySelector('.lz-gl'), c = document.createElement('canvas'); c.width = g.width; c.height = g.height;
      const x = c.getContext('2d'); x.drawImage(g, 0, 0); res(Array.from(x.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 4 === 0)));
    })));
    const setChev = (on) => page.evaluate((on) => { const s = window.pps.store; s.set({ blood: { ...s.get().blood, chevrons: on } }); }, on);
    let n = 0;
    for (let zoom = 0; zoom < 3 && !n; zoom++) {   // (closer in where the sinusoids are too fine for a head at the fit)
      if (zoom) { await page.evaluate(() => window.pps.stage.zoomIn()); await page.waitForTimeout(1200); }
      await setChev(true); await page.waitForTimeout(1500);
      const on = await grab();
      await setChev(false); await page.waitForTimeout(1500);
      const off = await grab();
      n = on.reduce((k, v, i) => k + (Math.abs(v - off[i]) > 25 ? 1 : 0), 0);
    }
    if (n < 20) throw new Error(`no chevrons drawn in the lobule with Chevrons on (${n} px differ from off)`);
  });

  await check(device, 'presenter lobule: a label and its pill fade out as one when the set leaves (on into the sinusoid)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.evaluate(() => { const a = document.querySelector('#app'); a.classList.add('presenting'); a.dataset.lit = 'lobule:sinusoid'; });
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-lab')].some((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent), null, { timeout: 30000 });
    // Time is stepped by hand (a software renderer would otherwise sample too few frames): at each step the pill is exactly as faded as its text.
    const rows = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('.lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent);
      const read = () => ({ pill: +getComputedStyle(lab, '::before').opacity, text: +getComputedStyle(lab.firstElementChild).opacity });
      document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* (already done) */ } });
      const start = read();
      document.querySelector('#app').dataset.lit = '';
      document.querySelector('.lz').classList.add('lz-sin');
      getComputedStyle(lab).opacity; getComputedStyle(lab, '::before').opacity;
      const anims = document.getAnimations().filter((a) => ['--pill-o', '--lab-o', '--lit-o'].includes(a.transitionProperty));
      anims.forEach((a) => a.pause());
      const out = [start];
      for (const t of [20, 60, 100, 150]) { anims.forEach((a) => { a.currentTime = t; }); out.push(read()); }
      return out;
    });
    if (rows[0].pill < 0.99 || rows[0].text < 0.99) throw new Error(`the lit label is not pilled at rest (${JSON.stringify(rows[0])})`);
    for (const r of rows) if (Math.abs(r.pill - r.text) > 0.02) throw new Error(`the pill and its text fade apart (${JSON.stringify(rows)})`);
    if (!(rows[rows.length - 1].text < 0.5)) throw new Error('the label did not fade with the set');
  });

  await check(device, 'presenter lobule: a label and its pill fade as one when the slide changes (out and in)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.evaluate(() => { const a = document.querySelector('#app'); a.classList.add('presenting'); a.dataset.lit = 'lobule:sinusoid'; });
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-lab')].some((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent), null, { timeout: 30000 });
    // Time is stepped by hand (a software renderer would otherwise sample too few frames).
    const rows = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('.lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent);
      const read = () => ({ pill: +getComputedStyle(lab, '::before').opacity, text: +getComputedStyle(lab.firstElementChild).opacity });
      const done = () => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* (already done) */ } });
      const stepped = (change) => {
        done();
        const out = [read()];
        change();
        getComputedStyle(lab).opacity; getComputedStyle(lab, '::before').opacity;
        const anims = document.getAnimations().filter((a) => ['--pill-o', '--lab-o', '--lit-o'].includes(a.transitionProperty) || a.animationName === 'pill-in');
        anims.forEach((a) => a.pause());
        for (const t of [30, 90, 150, 220, 300, 400]) { anims.forEach((a) => { a.currentTime = t; }); out.push(read()); }
        return out;
      };
      const app = document.querySelector('#app');
      const away = stepped(() => { app.dataset.lit = 'lobule:central'; });   // the next slide is about something else
      const back = stepped(() => { app.dataset.lit = 'lobule:sinusoid'; });  // and the slide before it comes back
      return { away, back };
    });
    for (const [name, r] of Object.entries(rows)) for (const x of r) if (Math.abs(x.pill - x.text) > 0.02) throw new Error(`the pill and its text fade apart going ${name} (${JSON.stringify(r)})`);
    if (!(rows.away[rows.away.length - 1].text < 0.05)) throw new Error('the label did not fade away with the slide');
    if (!(rows.back[rows.back.length - 1].pill > 0.95)) throw new Error('the pill did not come back with its label');
  });

  await check(device, 'lobule and sinusoid pills: the reading is never smaller than its name or unit, all text 11 px or more, the lesion pill on screen (smallest and largest label sizes)', async (page) => {
    // Every shown pill on the lobule or the sinusoid: any text under 11 px, or a part set larger than the pill's reading (its <b>).
    const pills0 = (where) => page.evaluate((where) => {
      const bad = [], W = innerWidth, H = innerHeight;
      const shown = (e) => { const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || !e.getBoundingClientRect().width) return false; for (let p = e; p && p.nodeType === 1; p = p.parentElement) if (+getComputedStyle(p).opacity < 0.05) return false; return true; };
      let n = 0;
      for (const p of document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')) {
        if (p.hidden || p.classList.contains('lz-off') || !shown(p)) continue;
        const parts = [], w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode());) if (t.textContent.trim() && shown(t.parentElement)) parts.push([t.parentElement, t.textContent.trim(), parseFloat(getComputedStyle(t.parentElement).fontSize)]);
        if (!parts.length) continue; n++;
        const say = parts.map(([, t, f]) => `${t} ${f.toFixed(1)}`).join(' | ');
        if (parts.some(([, , f]) => f < 10.95)) bad.push(`${where}: text under 11 px in "${say}"`);
        const v = parts.find(([e]) => e.tagName === 'B');
        if (v && parts.some(([e, , f]) => e !== v[0] && f > v[2] + 0.1)) bad.push(`${where}: a part larger than the reading in "${say}"`);
      }
      const c = document.querySelector('.lz-call.on');
      if (c && shown(c)) { const r = c.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) bad.push(`${where}: lesion pill off screen (${Math.round(r.left)}..${Math.round(r.right)} of ${W})`); }
      return n ? bad : null;
    }, where);
    // (Polled: a slide's pills fade in after its camera settles.)
    const pills = async (where) => { for (let i = 0; i < 40; i++) { const r = await pills0(where); if (r) return r; await page.waitForTimeout(250); } return [`${where}: no pill shown`]; };
    const bad = [];
    for (const k of [String(TEXT_MIN), String(TEXT_MAX)]) {
      await open(page, '?preset=cirr-decomp');
      await page.evaluate((k) => { localStorage.setItem('pps.labelScale', k); localStorage.setItem('pps.labelScaleV', '2'); }, k);
      await open(page, '?preset=cirr-decomp');
      // Explore: the lobule, then the sinusoid (at the smallest size; the largest only for the lesion pill below).
      if (k === String(TEXT_MIN)) {
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
      await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 45000 });
      await page.waitForTimeout(1200);
      bad.push(...await pills(`explore lobule, size ${k}`));
      await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
      await page.waitForFunction(() => document.querySelector('.sv.on') && document.querySelectorAll('.sv-region').length > 3, null, { timeout: 45000 });
      await page.waitForTimeout(1500);
      bad.push(...await pills(`explore sinusoid, size ${k}`));
      await page.evaluate(() => window.pps.store.set({ sinusoid: false }));
      }
      // Presenter: the HVPG deck's presinusoidal slide (its lesion pill), then the lobule deck's sinusoid slide.
      for (const [deck, i, sin] of [['hvpg', 5, false], ...(k === String(TEXT_MIN) ? [['lobule', 3, true]] : [])]) {
        await page.evaluate(([deck, i]) => window.pps.presenter.start(deck, i), [deck, i]);
        // (Each stage waits on its own: the start's cover alone can take 15 s here, and a CI runner's shared GPU is far slower.)
        for (const ready of [() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'),
          () => !document.querySelector('#app').className.includes('pz-hush'),
          (sin) => sin || (window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled()),
          (sin) => (sin ? !!document.querySelector('.sv.on') : !!document.querySelector('.lz-call.on'))]) await page.waitForFunction(ready, sin, { timeout: 60000 });
        await page.waitForFunction((sin) => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover') && !document.querySelector('#app').className.includes('pz-hush')
          && (sin ? !!document.querySelector('.sv.on') : window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled() && !!document.querySelector('.lz-call.on')), sin, { timeout: 60000 });
        await page.waitForTimeout(1500);
        bad.push(...await pills(`presenter ${deck} slide ${i + 1}, size ${k}`));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'), null, { timeout: 30000 });
      }
    }
    if (bad.length) throw new Error(bad.join('; '));
  });

  await check(device, 'presenter in the liver: a slide change shows only the old and new slides\' labels, pills with their text', async (page) => {
    // The portal circulation deck (after its outline), one patient: the whole lobule, the portal tract, the sinusoid wall, the central vein.
    // (Labels fade, not pixels: drawn at one device pixel per pixel, since a software renderer draws the lobule at a phone's three-fold
    // scale about nine times slower, a frame every few seconds, and the slide changes then took longer than the check waits.)
    if (device === 'phone') await (await page.context().newCDPSession(page)).send('Emulation.setDeviceMetricsOverride', { ...DEVICES.phone.viewport, deviceScaleFactor: 1, mobile: true });
    await open(page, '?preset=healthy');
    await page.evaluate(() => window.pps.presenter.start('circulation', 4));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled() && !document.querySelector('.pz-cover'), null, { timeout: 60000 });   // (the start's cover gone)
    const settle = async () => {
      await page.waitForFunction(() => { const a = document.querySelector('#app'); return !a.classList.contains('pz-hush') && !a.classList.contains('pz-hush-in') && (window.pps.stage.lobuleOpen() || window.pps.store.get().sinusoid); }, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
    };
    await settle();
    // Every frame (and between frames): each label's text and pill, and each leader, as seen (times every ancestor's opacity).
    const watch = () => page.evaluate(() => {
      const app = document.querySelector('#app'), seen = window.__labSeen = [], t0 = performance.now();
      // (Each label's own text-to-pill ratio at rest: some captions are drawn a little lighter than their pill.)
      const ids = window.__labIds ||= new WeakMap();
      const id = (e) => { if (!ids.has(e)) ids.set(e, ids.size || Math.random()); return ids.get(e); };
      window.__labRatio = () => Object.fromEntries([...document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')]
        .filter((l) => !l.hidden && l.firstElementChild && +getComputedStyle(l, '::before').opacity > 0.5)
        .map((l) => [id(l), +getComputedStyle(l.firstElementChild).opacity / +getComputedStyle(l, '::before').opacity]));
      window.__labBefore = window.__labRatio();
      // (A pass reads each ancestor's style once, however many labels share it: the labels of a slide share most of theirs, and
      // sampling every frame and every 30 ms with a style read per label per ancestor slowed the page being watched.)
      let own = new Map();
      const anc = (e) => { let o = 1; for (let x = e; x && x !== app; x = x.parentElement) { let v = own.get(x); if (v === undefined) { const cs = getComputedStyle(x); v = cs.visibility === 'hidden' || cs.display === 'none' ? 0 : +cs.opacity; own.set(x, v); } if (!v) return 0; o *= v; } return o; };
      const sample = () => {
        own = new Map();
        const lit = app.dataset.lit || '';
        for (const lab of document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')) {
          if (lab.hidden || !lab.firstElementChild) continue;
          const a = anc(lab), text = a * +getComputedStyle(lab.firstElementChild).opacity, pill = a * +getComputedStyle(lab, '::before').opacity;
          if (text > 0.01 || pill > 0.01) seen.push({ kind: 'label', id: id(lab), t: lab.dataset.target || '', text, pill, lit, ms: Math.round(performance.now() - t0) });
        }
        for (const ld of document.querySelectorAll(':is(.lz-leaders, .sv-leaders) [data-target]')) {
          const o = anc(ld);
          if (o > 0.01) seen.push({ kind: 'leader', t: ld.dataset.target, text: o, lit });
        }
      };
      const tick = () => { sample(); if (window.__labSeen === seen) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const iv = setInterval(() => (window.__labSeen === seen ? sample() : clearInterval(iv)), 30);
    });
    const step = async (what) => {
      const before = await page.evaluate(() => document.querySelector('#app').dataset.lit || '');
      await watch();
      const n = await page.evaluate(() => document.querySelector('.pzb-n, .pz-count')?.textContent);
      await page.keyboard.press('ArrowRight');
      // (The counter moves in the same task that starts the slide change, so from here on the change is under way.)
      await page.waitForFunction((n) => document.querySelector('.pzb-n, .pz-count')?.textContent !== n, n);
      await settle();
      const { seen, after, ratio } = await page.evaluate(() => { const seen = window.__labSeen; window.__labSeen = null; return { seen, after: document.querySelector('#app').dataset.lit || '', ratio: { ...window.__labBefore, ...window.__labRatio() } }; });
      if (!before || !after) throw new Error(`${what}: a slide lights nothing in the liver (before "${before}", after "${after}"), so this check cannot tell`);
      const ok = new Set([...before.split(' '), ...after.split(' ')]);
      // (The sinusoid view keeps every name and arrow, lit or not, so a change into or out of it shows them all; the lobule's names stay strict.)
      const sinKept = [...ok].some((t) => t.startsWith('sinusoid:'));
      const stray = seen.filter((x) => !ok.has(x.t) && !(sinKept && x.t.startsWith('sinusoid:')));
      if (stray.length) {
        const worst = stray.reduce((m, x) => (x.text > m.text ? x : m));
        throw new Error(`${what}: ${new Set(stray.map((x) => x.t || '(no target)')).size} label(s) from neither slide showed, up to ${worst.text.toFixed(2)} (${worst.kind} ${worst.t || '(no target)'}, lit "${worst.lit}")`);
      }
      const apart = seen.filter((x) => x.kind === 'label' && (x.lit.split(' ').includes(x.t) || x.pill > 0.01) && Math.abs(x.pill * (ratio[x.id] ?? 1) - x.text) > 0.03);
      if (apart.length) throw new Error(`${what}: a pill and its text faded apart (${apart[0].t}: pill ${apart[0].pill.toFixed(2)}, text ${apart[0].text.toFixed(2)}, ${apart[0].ms} ms in)`);
      const shownNow = await page.waitForFunction(() => [...document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')].some((l) => (document.querySelector('#app').dataset.lit || '').split(' ').includes(l.dataset.target) && !l.hidden && +getComputedStyle(l.firstElementChild).opacity > 0.7), null, { timeout: 15000 }).then(() => true, () => false);
      if (!shownNow) throw new Error(`${what}: the new slide's labels did not come back (${await page.evaluate(() => { const a = document.querySelector('#app'); return `${a.className.match(/pz-hush\S*/g)} sin ${window.pps.store.get().sinusoid} sv ${document.querySelector('.sv')?.className} lz ${document.querySelector('.lz')?.className}: ` + [...document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')].filter((l) => (a.dataset.lit || '').split(' ').includes(l.dataset.target)).map((l) => { const c = getComputedStyle(l.firstElementChild); return `${l.dataset.target}${l.hidden ? ' hidden' : ''} ${(+c.opacity).toFixed(2)} lab ${c.getPropertyValue('--lab-o')} lit ${c.getPropertyValue('--lit-o')} in ${c.getPropertyValue('--sv-in')} anims ${document.getAnimations().filter((x) => x.effect?.target === l || x.effect?.target === l.firstElementChild).map((x) => `${x.animationName || x.transitionProperty}:${x.playState}:${Math.round(x.currentTime)}`).join('/')}`; }).join(', '); })})`);
    };
    await step('lobule to the portal tract');
    await step('portal tract to the sinusoid');
    await step('sinusoid to the central vein');
  });
}
