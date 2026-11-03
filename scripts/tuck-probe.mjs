// Per-frame look at a stacked card's readings coming out and tucking away, and at a tuck that is interrupted (V-TUCK-2, V-GEST-1):
// reversed at 30 / 60 / 90 % of the way, and Next at 50 %. Each frame the card must still hold its content and be drawn: its parts present,
// the card not faded or moved off, and the readings' card inside it while it slides. The end state of a reversed tuck equals a clean one.
//   node scripts/tuck-probe.mjs [--device mac|iphone] [--script prehepatic] [--slide 1]      (exit 1 on a failed frame)
import { openApp } from './shoot.mjs';
const HOOK = () => {
  const P = WebGL2RenderingContext.prototype;
  for (const fn of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) if (P[fn]) P[fn] = function () {};
  const S = (window.__t = { on: false, f: [] });
  const q = (s) => document.querySelector(s);
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!S.on) return;
    const d = q('.pz-data');
    if (!d) { S.f.push({ t, gone: true }); return; }
    const b = d.getBoundingClientRect(), cs = getComputedStyle(d), ti = d.querySelector('.pz-tiles'), tb = ti?.getBoundingClientRect();
    S.f.push({ t, kids: d.childElementCount, tiles: ti ? ti.childElementCount : -1, o: +cs.opacity, top: Math.round(b.top), h: Math.round(b.height), th: tb ? Math.round(tb.height) : 0,
      sliding: d.classList.contains('pz-sliding'), open: d.classList.contains('tool-open'), hid: d.hidden || d.classList.contains('pz-hide'), slide: window.pps?.presenter?.index?.() });
  };
  requestAnimationFrame(tick);
};
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const device = arg('device', 'mac'), wide = device === 'mac';
const app = await openApp({ device, initScript: `(${HOOK})()` });
let bad = 0;
try {
  const pg = app.page;
  const fresh = async () => {
    await pg.evaluate(([d, n]) => window.pps.presenter.start(d, n), [arg('script', 'prehepatic'), Number(arg('slide', 1))]);
    await pg.waitForFunction(() => document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 90000 });
    await pg.waitForTimeout(4000);
  };
  const toggle = (open) => wide ? pg.keyboard.press(open ? 'ArrowUp' : 'ArrowDown') : pg.evaluate(() => document.querySelector('.pz-lip').click());
  const state = () => pg.evaluate(() => { const d = document.querySelector('.pz-data'); return d ? [d.classList.contains('tool-open') ? 'out' : 'tucked', d.hidden || d.classList.contains('pz-hide') ? 'hidden' : 'shown'].join(' ') : 'none'; });
  const run = async (name, fn, { leaves = false } = {}) => {
    await fresh();
    await pg.evaluate(() => { window.__t.f.length = 0; window.__t.on = true; });
    await fn();
    await pg.waitForTimeout(1500);
    const f = await pg.evaluate(() => { window.__t.on = false; return window.__t.f; });
    const base = f.find((x) => x.kids);   // (the card as it stands when the run begins)
    const empty = f.filter((x) => !x.gone && !x.hid && (x.kids < (base?.kids ?? 1) || (!leaves && x.o < 0.98) || x.h < 100 || (!leaves && x.sliding && x.th < 10)));
    const gone = f.filter((x) => x.gone).length;
    console.log(`${name}: ${f.length} frames, empty ${empty.length}, card missing ${gone}, end ${await state()}`);
    if (empty.length || gone) { bad++; console.log('   first bad', JSON.stringify(empty[0] || {})); }
    return await state();
  };
  const clean = [];
  clean.push(await run('clean untuck', async () => { await toggle(true); }));
  for (const frac of [0.3, 0.6, 0.9]) {
    const ms = Math.round(360 * frac);
    await run(`untuck, tuck again at ${Math.round(frac * 100)} %`, async () => { await toggle(true); await pg.waitForTimeout(ms); await toggle(false); });
    await run(`untuck, tuck, untuck at ${Math.round(frac * 100)} %`, async () => { await toggle(true); await pg.waitForTimeout(ms); await toggle(false); await pg.waitForTimeout(ms); await toggle(true); });
  }
  await run('untuck, Next at 50 %', async () => { await toggle(true); await pg.waitForTimeout(180); await pg.keyboard.press('ArrowRight'); }, { leaves: true });   // (the slide's own change fades the card out and the next one in)
} finally { await app.close(); }
if (bad) { console.log(`${bad} run(s) showed an empty or missing card`); process.exit(1); }
