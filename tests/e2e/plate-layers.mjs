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
// limits), and on average everywhere within SCREEN.mean. Healthy, and with cirrhosis and ascites, the bowel floated up (its own
// picture, moved on the GPU while the fluid eases, under the rest of the gut: the gut's opacity and mask laid over both).
// 22 Oct: inside max 6 (healthy) and 7.1 (one pixel, a dot of the spleen's texture smaller than a pixel), inside mean .75 and
// .48, edges max 62 and 74, mean everywhere .22 (the bowel and the rest of the gut sampled apart, then laid together).
//
//   node tests/e2e/plate-layers.mjs [dir]

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from '../../scripts/serve.mjs';

const ROUND = 2, FEW = 400, MAX = 12, MEAN = 0.05, SCREEN = { inside: 8, insideMean: 1, edge: 96, mean: 0.3 };
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
  // (A canvas held still: the same picture twice, 1.5 s apart, once `ready` holds.)
  const still = async (ready, arg) => {
    let a = null;
    for (let t0 = Date.now(); Date.now() - t0 < 60000;) {
      await page.waitForTimeout(1500);
      const ok = await page.evaluate(ready, arg);
      const b = ok && (await page.evaluate(() => document.querySelector('canvas#veins').toDataURL()));
      if (b && b === a) return b;
      a = b;
    }
    return null;
  };
  // Two screens compared: inside max and mean, edges max, mean everywhere, the worst inside pixel, and a picture of the
  // differences (each pixel's worst channel ×8, red inside the shapes, blue on edges) as a PNG data URL.
  const measure = (on, off) => page.evaluate(async ([a, b]) => {
    const img0 = {}; const px = async (u) => { const img = new Image(); img.src = u; await img.decode(); img0.w = img.width; const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, cv.width, cv.height).data; };
    const p = await px(a), q = await px(b), W = img0.w;
    // (Premultiplied: a PNG keeps colour unpremultiplied, and at the faint edge of the glow, alpha 1 to 4, its colour is noise.)
    const pm = (d) => { const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = (i & 3) === 3 ? d[i] : d[i] * d[i | 3] / 255; return o; };
    const P = pm(p), Q = pm(q), H = Q.length / 4 / W;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), dimg = g.createImageData(W, H), D = dimg.data;
    let inside = 0, edge = 0, sum = 0, inSum = 0, inN = 0, worst = null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let e = 0; for (let n = 0; n < 4; n++) e = Math.max(e, Math.abs(P[i + n] - Q[i + n]));
      sum += e;
      // (Inside: the switch-off screen's 3 × 3 neighbourhood within 6 levels of this pixel, and painted.)
      let flat = Q[i + 3] > 0 && x > 0 && y > 0 && x < W - 1 && y < H - 1;
      for (let dy = -1; dy <= 1 && flat; dy++) for (let dx = -1; dx <= 1 && flat; dx++) { const j = i + (dy * W + dx) * 4; for (let n = 0; n < 4; n++) if (Math.abs(Q[j + n] - Q[i + n]) > 6) flat = false; }
      if (flat) { if (e > inside) worst = { x, y, on: [...p.slice(i, i + 4)], off: [...q.slice(i, i + 4)] }; inside = Math.max(inside, e); inSum += e; inN++; } else edge = Math.max(edge, e);
      const v = Math.min(255, e * 8);
      D[i] = flat ? v : 0; D[i + 1] = 0; D[i + 2] = flat ? 0 : v; D[i + 3] = 255;
    }
    g.putImageData(dimg, 0, 0);
    return { inside, insideMean: inN ? inSum / inN : 0, edge, mean: sum / (W * H), worst, diff: cv.toDataURL() };
  }, [on, off]);
  // (On a failure the pictures are kept for the run's artifact, gpu-organs-shots: the screens on and off and their differences.)
  const SHOTS = 'gpu-organs-shots';
  const keep = (name, url) => { mkdirSync(SHOTS, { recursive: true }); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(url.split(',')[1], 'base64')); };
  const screenCompare = async (what) => {
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    const shot = async (on) => {
      await page.evaluate((v) => window.pps.stage.gpuOrgans(v), on);
      return still((v) => window.pps.stage.organsSettled() && window.pps.stage.organLayersShown() === v, !!on);
    };
    const on = await shot('force'), off = await shot(false);
    if (!on || !off) fail('the screen never held still with the switch on and off');
    else {
      const d = await measure(on, off);
      const line = `screen, ${what}, switch on against off: inside max ${d.inside.toFixed(1)} mean ${d.insideMean.toFixed(2)}, edges max ${d.edge.toFixed(1)}, mean ${d.mean.toFixed(4)}`;
      if (d.inside > SCREEN.inside || d.insideMean > SCREEN.insideMean || d.edge > SCREEN.edge || d.mean > SCREEN.mean) {
        fail(`${line}: the organs look different drawn as layers (worst inside at x ${d.worst?.x}, y ${d.worst?.y}: on ${d.worst?.on} against off ${d.worst?.off})`);
        const tag = what.replace(/\W+/g, '-');
        keep(`${tag}-on`, on); keep(`${tag}-off`, off); keep(`${tag}-diff`, d.diff);
        // Which layer it comes from: each layer painted on the GPU alone (the others pictures of the SVG copy, as before 4f2fd81b),
        // then none, each against the same screen with the switch off. (Only told, never counted: the check above has failed.)
        await page.evaluate(() => window.pps.stage.gpuOrgans('force'));
        await still(() => window.pps.stage.organsSettled() && window.pps.stage.organLayersShown());
        const paths = await page.evaluate(() => window.pps.stage.organPaths());
        console.log(`  layers: ${paths.layers.map(([L, w]) => `${L} ${w}`).join(', ')}; live: ${paths.live}`);
        const gpu = paths.layers.filter(([, w]) => w === 'GPU').map(([L]) => L);
        for (const only of [...gpu.map((L) => [L]), []]) {
          const c0 = await page.evaluate((off) => { const st = window.pps.stage; const c = st.organPaths().commits; st.bakeOff(off); return c; }, gpu.filter((L) => !only.includes(L)));
          const s = await still((c) => window.pps.stage.organPaths().commits > c && window.pps.stage.organsSettled() && window.pps.stage.organLayersShown(), c0);
          if (!s) { console.log(`  ${only[0] || 'no layer'} on the GPU: the screen never held still`); continue; }
          const e = await measure(s, off);
          console.log(`  ${only.length ? `only ${only[0]}` : 'no layer'} painted on the GPU: inside max ${e.inside.toFixed(1)} mean ${e.insideMean.toFixed(2)} (worst at x ${e.worst?.x}, y ${e.worst?.y}), edges max ${e.edge.toFixed(1)}, mean ${e.mean.toFixed(4)}`);
          if (only.length) keep(`${tag}-only-${only[0]}-diff`, e.diff);
        }
        await page.evaluate(() => window.pps.stage.bakeOff([]));
      } else console.log(`ok ${line}`);
    }
    await page.evaluate(() => window.pps.stage.gpuOrgans('force'));
  };
  await screenCompare('healthy');
  // Healthy to cirrhosis with the switch on: the liver, spleen and fluid ease while the organs stay on the GPU, never dropped
  // to the live SVG for a frame (the drop and its SVG repaint were the slow frames).
  await page.evaluate(() => window.pps.stage.gpuOrgans('force'));
  for (let t0 = Date.now(); Date.now() - t0 < 60000 && !(await page.evaluate(() => window.pps.stage.organLayersShown()));) await page.waitForTimeout(500);
  const ease = await page.evaluate(async () => {
    const st = window.pps.stage;
    window.pps.host.send({ type: 'run', running: true });
    const runs0 = st.layerStarts();
    await window.pps.loadPreset('cirr-decomp');
    let frames = 0, dropped = 0, eased = 0;
    for (const t0 = performance.now(); performance.now() - t0 < 6000;) { await new Promise((r) => requestAnimationFrame(r)); frames++; if (!st.organLayersShown()) dropped++; if (st.fluidEasing()) eased++; }
    return { frames, dropped, eased, runs: st.layerStarts()[1] - runs0[1] };
  });
  const eline = `healthy to cirrhosis, switch on: ${ease.dropped} of ${ease.frames} frames without the GPU organs`;
  if (!ease.frames || ease.dropped) fail(`${eline}: the organs dropped to the SVG during the change`); else console.log(`ok ${eline}`);
  // Nor is any organ picture begun while the fluid eases: the bowel's float is a shift on the GPU (it was a whole new set of
  // pictures every half step of the bulge, the bowel standing still until each landed).
  const rline = `healthy to cirrhosis, switch on: ${ease.runs} organ pictures begun in ${ease.eased} frames of the fluid easing`;
  if (!ease.eased) fail(`${rline}: the fluid never eased`); else if (ease.runs) fail(`${rline}: the pictures are made again while the fluid eases`); else console.log(`ok ${rline}`);
  // Cirrhosis, the bowel floated up on the ascites: its picture at rest, moved on the GPU under the rest of the gut.
  for (let t0 = Date.now(); Date.now() - t0 < 60000 && (await page.evaluate(() => window.pps.stage.fluidEasing()));) await page.waitForTimeout(500);
  await screenCompare('cirrhosis with ascites');
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
