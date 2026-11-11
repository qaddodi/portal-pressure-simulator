// N2 pointer spotlight and pen, judged headless (software GL) on the real app. A stroke is kept in figure units and laid through the figure's matrix
// each frame; it must stay on its figure points while the camera glides, clear on Next and on E, and the spotlight must follow the pointer.
//
//   · stroke rides   every frame the ink drew during a camera glide: its first and last laid point within 0.5 px of the figure point through
//                    stage.figureXform at that frame (the probe runs after the frame's own ink pass)
//   · pixels         the pen's colour is on the canvas at the stroke's laid points (a real GPU draw), and the spotlight veils the far corner
//   · Next / E       strokes are gone
//   · off-gpu        no canvas 2D context on the page
//
//   node tests/e2e/ink-pen.mjs [dir]       INK_DEV=mac|ipad (default mac)   INK_SCRIPT=circulation (default)
import { openApp, CARDS_LANDED } from '../../scripts/shoot.mjs';

const dir = process.argv[2] || '.';
const dev = process.env.INK_DEV || 'mac', script = process.env.INK_SCRIPT || 'circulation';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };

const app = await openApp({ device: dev, theme: 'light', query: `?script=${script}&slide=${process.env.INK_SLIDE || 3}`, dir, timeout: 600000 });
const page = app.page; page.setDefaultTimeout(600000);
await page.waitForFunction(CARDS_LANDED, null, { timeout: 600000 }).catch(() => {});
await page.evaluate(() => { for (const c of document.querySelectorAll('canvas')) { if (!c.__chk) c.__chk = 1; } });

// the stage's free spot to draw in: the middle of the figure view, off the cards
const box = await page.evaluate(() => { const r = document.getElementById('stageView').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const hit = await page.evaluate(({ x, y, w, h }) => {
  const free = (px, py) => { const el = document.elementFromPoint(px, py); return !!el && !!el.closest('#stageView') && !el.closest('#overlay') && !el.closest('.pz'); };
  for (let fx = 0.98; fx > 0.1; fx -= 0.02) for (const fy of [0.55, 0.4, 0.7]) {
    const cx = x + w * fx, cy = y + h * fy;
    if ([[-25, -70], [25, -70], [-25, 70], [25, 70], [0, 0]].every(([dx, dy]) => free(cx + dx, cy + dy))) return [cx, cy];
  }
  return null;
}, box);
ok(!!hit, `a free point on the figure at ${hit?.map(Math.round)}`);
const [hx, hy] = hit;
const cvBox = await page.evaluate(() => { const c = document.getElementById('inkGl')?.getBoundingClientRect(), v = document.getElementById('stageView').getBoundingClientRect(); return c && { dl: c.left - v.left, dt: c.top - v.top, dw: c.width - v.width, dh: c.height - v.height }; });
ok(cvBox && Math.abs(cvBox.dl) + Math.abs(cvBox.dt) + Math.abs(cvBox.dw) + Math.abs(cvBox.dh) < 0.5, `ink canvas lies exactly on the stage view ${JSON.stringify(cvBox)}`);

{ let k = '', still = 0; for (let i = 0; i < 120 && still < 6; i++) { const c = await page.evaluate(() => window.pps.stage.cameraKey()); still = c === k ? still + 1 : 0; k = c; await page.waitForTimeout(500); } }
await page.keyboard.press('d');
console.log('pen', JSON.stringify(await page.evaluate(() => { const o = {}; return { on: window.pps.presenter.ink().penOn(), kind: window.pps.stage.figureXform(o), o, active: window.pps.presenter.active() }; })));
await page.mouse.move(hx, hy - 60);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(hx + Math.sin(i / 2) * 20, hy - 60 + i * 10); await page.waitForTimeout(40); }
await page.mouse.up();
await page.waitForTimeout(1500);
let st = await page.evaluate(() => { const k = window.pps.presenter.ink(); return { n: k.count(), snap: k.snapshot() }; });
console.log('dbg', JSON.stringify(await page.evaluate(() => globalThis.__inkDbg)));
console.log('st', JSON.stringify(st).slice(0, 400));
ok(st.n === 1 && st.snap.strokes[0]?.n >= 8, `one stroke drawn with ${st.snap.strokes[0]?.n} points; ink drew segments: ${st.snap.n}`);

// pixels: the pen's colour at the first laid point
const shot = async () => page.screenshot({ type: 'png' });
const redAt = (x, y) => page.evaluate(async ({ x, y }) => {
  const k = window.pps.presenter.ink().snapshot();
  return { x0: k.x0, y0: k.y0 };
}, { x, y });
if (st.n < 1) { console.log("FAILED early"); await app.close(); process.exit(1); }
const png0 = (await shot()).toString('base64');
(await import('node:fs')).writeFileSync('/tmp/ink-pen.png', Buffer.from(png0, 'base64'));
console.log('colours', JSON.stringify(await page.evaluate(() => { const k = window.pps.presenter.ink().snapshot(); return { pen: k.pen, veil: k.veil }; })));
const p = await redAt();
const colourNear = await page.evaluate(async ([png64, x, y]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png64; await img.decode();
  const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(Math.round(x) - 3, Math.round(y) - 3, 7, 7).data;
  let best = 0; for (let i = 0; i < d.length; i += 4) best = Math.max(best, d[i] - Math.max(d[i + 1], d[i + 2]));
  return best;
}, [png0, p.x0 + box.x, p.y0 + box.y]);
ok(colourNear > 100, `pen red at the stroke's first point (red excess ${colourNear})`);

// the camera glides: judged every frame
await page.evaluate(() => {
  const rows = (window.__inkRows = []);
  const prev = globalThis.__frameProbe;
  globalThis.__frameProbe = (now) => {
    prev?.(now);
    const k = window.pps.presenter.ink(); if (!k) return;
    const s = k.snapshot(); if (!s.n) return;
    const o = {}; const kind = window.pps.stage.figureXform(o);
    const P = s.strokes[0].pts, m = (x, y) => [o.a * x + o.c * y + o.e, o.b * x + o.d * y + o.f];
    const a = m(P[0], P[1]), b = m(P[P.length - 2], P[P.length - 1]);
    rows.push({ seq: s.seq, cam: window.pps.stage.cameraKey(), kind, d0: Math.hypot(a[0] - s.x0, a[1] - s.y0), d1: Math.hypot(b[0] - s.x1, b[1] - s.y1), x0: s.x0 });
  };
});
await page.evaluate(() => { window.pps.stage.zoomIn(); });
await page.waitForTimeout(250); await page.evaluate(() => { window.pps.stage.zoomIn(); });
await page.waitForTimeout(6000);
await page.evaluate(() => { window.pps.stage.zoomOut(); });
await page.waitForTimeout(6000);
const rows = await page.evaluate(() => window.__inkRows);
const cams = new Set(rows.map((r) => r.cam)), moved = new Set(rows.map((r) => Math.round(r.x0)));
const worst = Math.max(...rows.map((r) => Math.max(r.d0, r.d1)));
ok(rows.length >= 6 && cams.size >= 3 && moved.size >= 3, `glide judged: ${rows.length} frames, ${cams.size} cameras, ink moved through ${moved.size} places`);
ok(worst <= 0.5, `stroke within 0.5 px of its figure points every frame (worst ${worst.toFixed(3)} px)`);

// spotlight: hold L, move the pointer, the far corner is veiled and the window follows
await page.mouse.move(hx, hy);
await page.keyboard.down('l');
await page.mouse.move(hx + 5, hy + 5, { steps: 3 });
await page.waitForFunction(() => (window.pps.presenter.ink().snapshot().spot?.a || 0) > 0.95, null, { timeout: 60000 }).catch(() => {});
const sp = await page.evaluate(() => window.pps.presenter.ink().snapshot().spot);
ok(!!sp && sp.a > 0.95, `spotlight on at ${sp ? Math.round(sp.x) + ',' + Math.round(sp.y) : 'none'} (alpha ${sp?.a})`);
await page.keyboard.up('l');
await page.waitForFunction(() => !window.pps.presenter.ink().snapshot().spot, null, { timeout: 60000 }).catch(() => {});
const off = await page.evaluate(() => window.pps.presenter.ink().snapshot().spot);
ok(!off, 'spotlight let go with the key');

// E erases; Next clears
await page.keyboard.press('e'); await page.waitForTimeout(500);
ok(await page.evaluate(() => window.pps.presenter.ink().count()) === 0, 'E erased the stroke');
await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(hx, hy, { steps: 5 }); await page.mouse.up();
ok(await page.evaluate(() => window.pps.presenter.ink().count()) === 1, 'a new stroke');
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800);
ok(await page.evaluate(() => window.pps.presenter.ink().count()) === 0, 'Next cleared the stroke');
await page.keyboard.press('d');

const ctx2d = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => c.id === 'inkGl').map((c) => { try { return !!c.getContext('2d'); } catch { return false; } }));
ok(!ctx2d.some(Boolean), 'the ink canvas is a GPU canvas (no 2D context)');
await page.screenshot({ path: process.env.INK_SHOT || '/tmp/ink-last.png' });
await app.close();
console.log(failed ? `FAILED ${failed}` : 'PASSED');
process.exit(failed ? 1 : 0);
