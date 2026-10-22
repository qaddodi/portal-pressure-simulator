// The organs as layers (organs-gl.js, the ?perf switch "GPU organs") make the same picture as the one flattened plate. For a
// healthy liver, a cirrhotic one with a large spleen and ascites, and the dark theme: the plate's SVG drawn whole at its scale,
// and each layer's SVG drawn over its cropped rect on the same pixel grid, then laid over each other back to front with plain
// "over" in premultiplied 8-bit, as the GPU lays them. Each layer is rounded to 8 bits on its own, so a pixel under several
// translucent layers can differ by a level or two: no more than ROUND anywhere but on a few edge pixels (at most FEW of the
// plate's channel values, about 50 pixels, where the diaphragm meets the heart's edge: the browser draws an edge there a few
// levels apart when the heart is drawn on its own), and none of those more than MAX; MEAN on average (22 Oct: max 9, mean
// 0.03, 28 to 90 values past ROUND). Then the app is run with the switch on (forced on the software renderer): it must show the
// organs from the layers, and the figure on screen, paused, must be the one it shows with the switch off, within SCREEN levels
// inside the shapes (pixels whose 3 × 3 neighbourhood the switch-off screen paints alike), and within SCREEN.edge on edges: the
// liver, spleen, diaphragm and falciform are painted live by the GPU (organ-paint.js), whose edges are the true coverage and the
// browser's its own approximation (Mohammad's OK for edges a few levels off, 22 Oct 00:34Z; organ-paint.mjs holds the same
// limits). 22 Oct: inside max 6, mean .54; edges max 62; mean everywhere .17.
//
//   node tests/e2e/plate-layers.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const ROUND = 2, FEW = 400, MAX = 12, MEAN = 0.05, SCREEN = { inside: 6, edge: 96, mean: 0.2 };
const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

async function compare(what) {
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async (ROUND) => {
    const c = window.pps.stage.plateLayersCheck();
    const load = async (svg) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try { const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; }); return img; } finally { URL.revokeObjectURL(url); }
    };
    const pixels = async (svg, w, h) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(await load(svg), 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      // Premultiplied, rounded to 8 bits, as the layer textures hold it (stage.js premultiply).
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; d[i] = Math.round(d[i] * a); d[i + 1] = Math.round(d[i + 1] * a); d[i + 2] = Math.round(d[i + 2] * a); }
      return d;
    };
    const plate = await pixels(c.plate, c.W, c.H);
    const stack = new Float32Array(c.W * c.H * 4);
    for (const L of c.layers) {
      const p = await pixels(L.svg, L.w, L.h);
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const i = (y * L.w + x) * 4, j = ((L.y + y) * c.W + L.x + x) * 4, k = 1 - p[i + 3] / 255;
        for (let q = 0; q < 4; q++) stack[j + q] = Math.round(p[i + q] + stack[j + q] * k);
      }
    }
    let max = 0, sum = 0, ink = 0, at = null, past = 0;
    for (let i = 0; i < plate.length; i++) {
      const e = Math.abs(plate[i] - stack[i]);
      sum += e; ink += plate[i];
      if (e > ROUND) past++;
      if (e > max) { max = e; at = [(i >> 2) % c.W, Math.floor((i >> 2) / c.W), i & 3, plate[i], stack[i]]; }
    }
    return { layers: c.layers.map((L) => `${L.name} ${L.w}x${L.h}`), max, mean: sum / plate.length, ink, at, past };
  }, ROUND);
  const line = `${what.padEnd(28)} max ${r.max}, mean ${r.mean.toFixed(4)}, ${r.past} values past ${ROUND} (layers: ${r.layers.join(', ')})`;
  if (!r.ink) fail(`${line}: the plate is empty`);
  else if (r.layers.length < 6) fail(`${line}: layers missing`);
  else if (r.max > MAX || r.mean > MEAN || r.past > FEW) fail(`${line}: the layers differ from the plate (worst at x ${r.at[0]}, y ${r.at[1]}, channel ${r.at[2]}: ${r.at[3]} against ${r.at[4]})`);
  else console.log(`ok ${line}`);
}

try {
  await page.goto(server.url + '?gpuorgans=force');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  await compare('healthy');
  // With the switch on, the organs on screen come from the layers.
  for (let t0 = Date.now(); Date.now() - t0 < 60000 && !(await page.evaluate(() => window.pps.stage.organsSettled() && window.pps.stage.organLayersShown()));) await page.waitForTimeout(500);
  if (!(await page.evaluate(() => window.pps.stage.organLayersShown()))) fail('with ?gpuorgans=force the organs are never shown from the layers');
  else console.log('ok the organs are shown from the layers with the switch on');
  // The screen, paused, with the switch on and then off.
  const shot = async (on) => {
    await page.evaluate((v) => window.pps.stage.gpuOrgans(v), on);
    let a = null;
    for (let t0 = Date.now(); Date.now() - t0 < 60000;) {
      await page.waitForTimeout(1500);
      const ok = await page.evaluate((v) => window.pps.stage.organsSettled() && window.pps.stage.organLayersShown() === v, !!on);
      const b = ok && (await page.evaluate(() => document.querySelector('canvas#veins').toDataURL()));
      if (b && b === a) return b;
      a = b;
    }
    return null;
  };
  await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
  const on = await shot('force'), off = await shot(false);
  if (!on || !off) fail('the screen never held still with the switch on and off');
  else {
    const d = await page.evaluate(async ([a, b]) => {
      const img0 = {}; const px = async (u) => { const img = new Image(); img.src = u; await img.decode(); img0.w = img.width; const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, cv.width, cv.height).data; };
      const p = await px(a), q = await px(b), W = img0.w;
      // (Premultiplied: a PNG keeps colour unpremultiplied, and at the faint edge of the glow, alpha 1 to 4, its colour is noise.)
      const pm = (d) => { const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = (i & 3) === 3 ? d[i] : d[i] * d[i | 3] / 255; return o; };
      const P = pm(p), Q = pm(q), H = Q.length / 4 / W;
      let inside = 0, edge = 0, sum = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let e = 0; for (let n = 0; n < 4; n++) e = Math.max(e, Math.abs(P[i + n] - Q[i + n]));
        sum += e;
        // (Inside: the switch-off screen's 3 × 3 neighbourhood within 6 levels of this pixel, and painted.)
        let flat = Q[i + 3] > 0 && x > 0 && y > 0 && x < W - 1 && y < H - 1;
        for (let dy = -1; dy <= 1 && flat; dy++) for (let dx = -1; dx <= 1 && flat; dx++) { const j = i + (dy * W + dx) * 4; for (let n = 0; n < 4; n++) if (Math.abs(Q[j + n] - Q[i + n]) > 6) flat = false; }
        if (flat) inside = Math.max(inside, e); else edge = Math.max(edge, e);
      }
      return { inside, edge, mean: sum / (W * H) };
    }, [on, off]);
    const line = `screen, switch on against off: inside max ${d.inside.toFixed(1)}, edges max ${d.edge.toFixed(1)}, mean ${d.mean.toFixed(4)}`;
    if (d.inside > SCREEN.inside || d.edge > SCREEN.edge || d.mean > SCREEN.mean) fail(`${line}: the organs look different drawn as layers`); else console.log(`ok ${line}`);
  }
  // Healthy to cirrhosis with the switch on: the liver, spleen and fluid ease while the organs stay on the GPU, never dropped
  // to the live SVG for a frame (the drop and its SVG repaint were the slow frames).
  await page.evaluate(() => window.pps.stage.gpuOrgans('force'));
  for (let t0 = Date.now(); Date.now() - t0 < 60000 && !(await page.evaluate(() => window.pps.stage.organLayersShown()));) await page.waitForTimeout(500);
  const ease = await page.evaluate(async () => {
    const st = window.pps.stage;
    window.pps.host.send({ type: 'run', running: true });
    await window.pps.loadPreset('cirr-decomp');
    let frames = 0, dropped = 0;
    for (const t0 = performance.now(); performance.now() - t0 < 6000;) { await new Promise((r) => requestAnimationFrame(r)); frames++; if (!st.organLayersShown()) dropped++; }
    return { frames, dropped };
  });
  const eline = `healthy to cirrhosis, switch on: ${ease.dropped} of ${ease.frames} frames without the GPU organs`;
  if (!ease.frames || ease.dropped) fail(`${eline}: the organs dropped to the SVG during the change`); else console.log(`ok ${eline}`);
  await page.goto(server.url + '?gpuorgans=force&preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins'), null, { timeout: 120000 });
  await page.waitForTimeout(6000);
  await compare('cirrhosis, spleen, ascites');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await compare('cirrhosis, dark theme');
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
