// Per-frame look at a stacked card's readings coming out and tucking away: do the card, the words' card and the handle move smoothly together?
//   node scripts/tuck-probe.mjs [--device mac|iphone] [--script hvpg] [--slide 4]
import { openApp } from './shoot.mjs';
const HOOK = () => {
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) if (P[fn]) P[fn] = function () {};
  const S = (window.__t = { on: false, f: [] });
  const q = (s) => document.querySelector(s);
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => +v.toFixed(2)); };
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!S.on) return;
    const d = q('.pz-data');
    S.f.push({ t, u: d?.style.getPropertyValue('--pz-u'), data: r(d), text: r(q('.pz-text')), lip: r(q('.pz-lip')), shade: r(q('.pz-shade')), stage: r(q('.stage, #stage, .pz-stage')) });
  };
  requestAnimationFrame(tick);
};
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const app = await openApp({ device: arg('device', 'mac'), initScript: `(${HOOK})()` });
try {
  const pg = app.page;
  await pg.waitForFunction(() => window.pps?.presenter, null, { timeout: 60000 });
  await pg.evaluate(([d, n]) => window.pps.presenter.start(d, n), [arg('script', 'prehepatic'), Number(arg('slide', 1))]);
  await pg.waitForFunction(() => document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 90000 });
  await pg.waitForTimeout(4000);
  for (const [name, key] of [['untuck', 'ArrowUp'], ['tuck', 'ArrowDown']]) {
    await pg.evaluate(() => { window.__t.f.length = 0; window.__t.on = true; });
    await pg.keyboard.press(key);
    await pg.waitForTimeout(1200);
    const f = await pg.evaluate(() => { window.__t.on = false; return window.__t.f; });
    console.log(name, 'frames', f.length);
    for (const k of ['data', 'text', 'lip', 'shade']) {
      const ys = f.map((x) => x[k]?.[1]).filter((v) => v != null);
      if (!ys.length) { console.log(' ', k, 'none'); continue; }
      const d = ys.slice(1).map((v, i) => +(v - ys[i]).toFixed(1));
      console.log(' ', k, 'top y', ys[0], '->', ys.at(-1), 'steps', d.join(' '));
    }
    const dts = f.slice(1).map((x, i) => Math.round(x.t - f[i].t));
    console.log('  dt', dts.join(' '));
  }
} finally { await app.close(); }
