// The figure's two GPU classes always match the GPU's state (3 Nov 2026: `gl-on` is set when the GPU is made or its context comes back and
// taken off when it is lost; `gl-plate` is set when the GPU says it holds the whole plate, with its draw, and taken off when it says it does
// not): sampled every frame in a real browser on the GPU path (software WebGL named as a GPU, scripts/shoot.mjs), through
//   - the first load,
//   - slide changes (a deck opened, then forward and back),
//   - a resize (the phone's size, then the laptop's),
//   - a lost WebGL context, then its restore.
// `gl-on` equals "the GPU holds its context" in every frame. `gl-plate` equals "the GPU holds the whole plate" at rest, and never differs
// from it for more than a moment (the class is set with the draw that shows the plate, the next frame after the plate lands).
//
//   node tests/e2e/gl-classes.mjs
import { openApp } from '../../scripts/shoot.mjs';

const fails = [];
const fail = (m) => { fails.push(m); console.log(`FAIL ${m}`); };
const LAG_MS = 4000;   // (software GL draws a few frames a second: the plate's class follows its landing within a frame or two of that)
const app = await openApp({ device: process.env.DEV || 'mac', theme: 'light', query: '?script=hvpg&slide=3', dir: process.env.DIR || '.' });
const page = app.page;
try {
  await page.evaluate((lag) => {
    window.__gc = { onBad: 0, onFirst: null, plateSince: 0, plateWorst: 0, frames: 0, heldSeen: false, plateSeen: false };
    const f = () => {
      const g = window.__gc, s = window.pps.stage.glClasses(), now = performance.now();
      g.frames++; g.heldSeen ||= s.held; g.plateSeen ||= s.plate;
      if (s.on !== s.gpu) { g.onBad++; g.onFirst ||= JSON.stringify(s); }
      if (s.plate !== s.held) { g.plateSince ||= now; g.plateWorst = Math.max(g.plateWorst, now - g.plateSince); } else g.plateSince = 0;
      window.__gcRaf = requestAnimationFrame(f);
    };
    f();
  }, LAG_MS);
  const read = () => page.evaluate(() => ({ ...window.__gc, s: window.pps.stage.glClasses() }));
  const settleEq = async (what, ms = 40000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await page.evaluate(() => window.pps.stage.glClasses());
      if (s.plate === s.held && s.on === s.gpu) return s;
      if (Date.now() - t0 > ms) { fail(`${what}: the classes never matched the GPU's state (${JSON.stringify(s)})`); return s; }
      await page.waitForTimeout(250);
    }
  };

  await page.waitForTimeout(12000);
  let s = await settleEq('first load');
  if (!s.on) fail(`first load: gl-on is not set with the GPU drawing (${JSON.stringify(s)})`);
  // slide changes
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) { await page.keyboard.press(k); await page.waitForTimeout(6000); await settleEq(`slide change ${k}`); }
  // a resize
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(6000); await settleEq('phone size');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(6000); await settleEq('laptop size');
  // a lost context, then its restore
  await page.evaluate(() => { window.__lose = document.getElementById('veins').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForTimeout(2000);
  s = await page.evaluate(() => window.pps.stage.glClasses());
  if (s.on || s.plate || s.gpu) fail(`context lost: the classes must be off with the GPU gone (${JSON.stringify(s)})`);
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForTimeout(8000);
  s = await settleEq('context restored', 60000);
  if (!s.on) fail(`context restored: gl-on did not come back (${JSON.stringify(s)})`);
  const g = await read();
  if (g.onBad) fail(`gl-on differed from the GPU's state in ${g.onBad} frame(s), the first ${g.onFirst}`);
  if (g.plateWorst > LAG_MS) fail(`gl-plate differed from what the GPU holds for ${Math.round(g.plateWorst)} ms at one time`);
  if (!g.heldSeen || !g.plateSeen) fail(`the plate never came up in the run (held ${g.heldSeen}, class ${g.plateSeen}): nothing was checked of it`);
  console.log(`frames sampled ${g.frames}, gl-on mismatches ${g.onBad}, longest gl-plate lag ${Math.round(g.plateWorst)} ms`);
  if (app.errors.length) fail(`page errors: ${app.errors.slice(0, 3).join(' | ')}`);
} catch (e) { fail(`threw: ${e.message}`); }
await app.close();
console.log(fails.length ? `${fails.length} failure(s)` : 'ok: gl-on and gl-plate match the GPU through load, slide changes, resizes and a lost context');
process.exit(fails.length ? 1 : 0);
