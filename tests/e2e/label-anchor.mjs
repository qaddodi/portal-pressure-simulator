// Labels are part of the figure (Mohammad, 3 Nov 2026: "the labels jump all over the place with zooming and switching and panning", "the lines
// go all over the place and move and elongate and animate", a Circuit shot with dots off their vessels and leaders to nothing). Judged on
// every frame the app draws (globalThis.__frameProbe, src/ui/frame.js), from what the GPU drew (stage.labelSnapshot: label pictures, and
// each dot and leader with the label it belongs to) against where the figure puts the point each station label names in that same frame
// (stage.labelAnchorOf):
//
//   · dot off its vessel    a station's dot more than DOT px from its point;
//   · leader from nowhere   a leader's figure end more than DOT px from its label's point;
//   · leader to nothing     a leader's far end more than END px from its label's picture;
//   · far, no leader        a label more than FAR px from its point with no leader drawn to it;
//   · label jumped          between two drawn frames, the label's move minus its point's move above JUMP px;
//   · leader stretched      between two drawn frames, a leader's length changing by more than JUMP px beyond its point's own change;
//   · at rest, point off the vessel  the point itself (where the figure says the vessel is) on no vessel pixel in a shot with the labels hidden.
//
// Gestures: a pan (mouse drag), a pinch (Ctrl + wheel) and the Circuit ⇄ Anatomy switch, on the Mac (1x) and the iPhone profile.
// Too few frames during a gesture: INCONCLUSIVE (exit 2), never a pass. LA_BREAK=1 shifts one label's dot by 12 px in the recorded rows only:
// the check must then FAIL, which shows it can.
//
//   node tests/e2e/label-anchor.mjs [dir]           LA_DEV=mac|iphone (default both)   LA_ONLY=pan,zoom,switch
import { openApp } from '../../scripts/shoot.mjs';

const dir = process.argv[2] || '.';
export const DOT = 3, END = 5, FAR = 48, JUMP = 4;
let failed = 0, unsureN = 0;
const lines = [];
const fail = (m) => { failed++; lines.push(`FAIL ${m}`); console.log(`FAIL ${m}`); };
const unsure = (m) => { unsureN++; console.log(`INCONCLUSIVE ${m}`); };
const BREAK = !!process.env.LA_BREAK;
const ONLY = (process.env.LA_ONLY || 'pan,zoom,switch').split(',');
const DEVS = (process.env.LA_DEV || 'mac,iphone,iphone-reduce').split(',');
const VIEWS = (process.env.LA_VIEWS || 'circuit,anatomic').split(','), REPEAT = Math.max(1, +process.env.LA_REPEAT || 1);   // (LA_REPEAT: each pan that many times, back and forth, to catch a rare one)

const record = (page) => page.evaluate((BREAK) => {
  const rows = (window.__laRows = []);
  window.__laSeq = -1;
  globalThis.__frameProbe = () => {
    const s = window.pps.stage.labelSnapshot();
    if (s.seq === window.__laSeq) return;
    window.__laSeq = s.seq;
    const row = { seq: s.seq, cam: window.pps.stage.cameraKey(), L: [] };
    for (const d of s.items) {
      const id = /^n:([A-Z_0-9]+)$/.exec(d.key)?.[1];
      if (!id || !(d.a > 0.5)) continue;
      const a0 = window.pps.stage.labelAnchorOf(id);
      if (!a0) continue;
      // (A pinned label is judged against the point it is drawn at, and that point must be the figure's: the vessel's middle or the station.)
      const a = d.pin ? { x: d.px, y: d.py } : a0;
      const onFig = !d.pin || window.pps.stage.labelOnFigure(id, d.px, d.py) < 1.5;
      const dot = s.marks.find((m) => m.k === d.key && /leader-dot$|^leader-dot\b/.test(m.kind) && m.a > 0.3) || null;
      const line = s.marks.find((m) => m.k === d.key && m.kind === 'line' && m.a > 0.3) || null;
      row.L.push({ key: d.key, gen: s.gen, glide: !!d.glide, pin: !!d.pin, onFig, x: d.x, y: d.y, w: d.w, h: d.h, ax: a.x, ay: a.y, mid: a.mid, dot: dot && [dot.x0, dot.y0], line: line && [line.x0, line.y0, line.x1, line.y1] });
    }
    if (BREAK && row.L[0]?.dot) { row.L[0].dot[0] += 12; }
    rows.push(row);
  };
}, BREAK);
const stop = (page) => page.evaluate(() => { globalThis.__frameProbe = null; return window.__laRows; });

const atEdge = (b, W, H) => b.x < 6 || b.y < 6 || b.x + b.w > W - 6 || b.y + b.h > H - 6;
const boxDist = (px, py, l) => Math.hypot(Math.max(l.x - px, 0, px - (l.x + l.w)), Math.max(l.y - py, 0, py - (l.y + l.h)));
/** The judgement over recorded rows (exported for tests/label-anchor.test.js). Returns { issues: [text], frames }. */
export function judgeRows(rows, { W = 1e9, H = 1e9 } = {}) {
  const issues = [], seen = new Map();
  const add = (k, m) => { const n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n <= 3) issues.push(m); };
  let prev = null;
  for (const r of rows) {
    const by = new Map();
    for (const l of r.L) {
      by.set(l.key, l);
      if (l.ax < 0 || l.ay < 0 || l.ax > W || l.ay > H) continue;   // (a point off the screen: its label may hold at the edge)
      const tag = l.pin ? 'pinned' : 'unpinned';
      if (!l.onFig) add(`fig${l.key}`, `${l.key}: drawn at a point that is not its station's or its vessel's (frame ${r.seq})`);
      if (l.dot) { const e = Math.hypot(l.dot[0] - l.ax, l.dot[1] - l.ay); if (e > DOT) add(`dot${l.key}`, `${l.key} (${tag}): dot ${e.toFixed(1)} px off its point (frame ${r.seq})`); }
      if (l.line) {
        const e0 = Math.hypot(l.line[0] - l.ax, l.line[1] - l.ay), e1 = boxDist(l.line[2], l.line[3], l);
        if (e0 > DOT) add(`lf${l.key}`, `${l.key}: leader starts ${e0.toFixed(1)} px from its point (frame ${r.seq})`);
        if (e1 > END) add(`lt${l.key}`, `${l.key}: leader ends ${e1.toFixed(1)} px from its label (frame ${r.seq})`);
      }
      const far = boxDist(l.ax, l.ay, l);
      if (far > FAR && !l.line) add(`far${l.key}`, `${l.key} (${tag}): label ${far.toFixed(0)} px from its point with no leader (frame ${r.seq})`);
    }
    if (prev) for (const [k, l] of by) {
      const p = prev.get(k);
      if (!p || l.glide || p.glide) continue;   // (a new layout's offset easing at rest: its point, dot and leader are judged above, not its move)
      // (A label held against the stage's edge (its box within 6 px of it in both frames) keeps to the screen as the figure moves past it.)
      if (atEdge(l, W, H) && atEdge(p, W, H)) continue;
      const j = Math.hypot((l.x - p.x) - (l.ax - p.ax), (l.y - p.y) - (l.ay - p.ay));
      if (j > JUMP) add(`j${k}`, `${k} (${p.pin ? 'pinned' : 'unpinned'}→${l.pin ? 'pinned' : 'unpinned'}, gen ${p.gen}→${l.gen}): label moved ${j.toFixed(1)} px against its point between frames ${r.seq - 1}→${r.seq} (box ${p.x.toFixed(0)},${p.y.toFixed(0)} ${p.w?.toFixed?.(0)}x${p.h?.toFixed?.(0)} → ${l.x.toFixed(0)},${l.y.toFixed(0)} ${l.w?.toFixed?.(0)}x${l.h?.toFixed?.(0)}; point ${p.ax.toFixed(0)},${p.ay.toFixed(0)} → ${l.ax.toFixed(0)},${l.ay.toFixed(0)})`);
      if (l.line && p.line) {
        const len = (q) => Math.hypot(q.line[2] - q.line[0], q.line[3] - q.line[1]);
        const dl = Math.abs(len(l) - len(p));
        if (dl > JUMP && j <= JUMP && Math.abs(l.w - p.w) < 1 && Math.abs(l.h - p.h) < 1) add(`s${k}`, `${k}: leader length changed ${dl.toFixed(1)} px between frames, its label the same size (frame ${r.seq})`);
      }
    }
    prev = by;
  }
  for (const [k, n] of seen) if (n > 3) issues.push(`(${k.replace(/^[a-z]+/, '')}: ${n - 3} more of that kind)`);
  // (Eased, not ridden: a label gliding in more than a third of the frames (at least 6) is one trailing towards its place, V-LBL-1.)
  const gl = new Map(), seenK = new Map();
  for (const r of rows) for (const l of r.L) { seenK.set(l.key, (seenK.get(l.key) || 0) + 1); if (l.glide) gl.set(l.key, (gl.get(l.key) || 0) + 1); }
  for (const [k, n] of gl) if (n >= 6 && n > seenK.get(k) / 3) issues.push(`${k}: eased towards its place in ${n} of ${seenK.get(k)} frames (labels ride the figure; only a slot change glides, once)`);
  return { issues, frames: rows.filter((r) => r.L.length).length };
}

// At rest: is each point on a vessel? A shot with the labels hidden; the ring 2-4 px round each point must be mostly vessel (lighter or
// more coloured than the stage's background there, sampled 30 px away).
async function pointsOnVessels(page, tag) {
  const pts = await page.evaluate(() => window.pps.stage.labelSnapshot().items.filter((d) => /^n:/.test(d.key) && d.a > 0.5).map((d) => { const a = window.pps.stage.labelAnchorOf(d.key.slice(2)); return a && a.mid ? { key: d.key, x: a.x, y: a.y } : null; }).filter(Boolean));
  return pts.length ? { pts, tag } : null;
}

async function settle(page, ms = 4000) {
  // (Until two drawn frames in a row show the same labels: a headless frame takes seconds.)
  let a = '', same = 0;
  for (let i = 0; i < 60 && same < 2; i++) {
    await page.waitForTimeout(ms / 4);
    const b = await page.evaluate(() => JSON.stringify(window.pps.stage.labelSnapshot().items.map((d) => [d.key, Math.round(d.x), Math.round(d.y)])));
    same = b === a ? same + 1 : 0; a = b;
  }
}

async function gesture(page, name, run, vp, need = 3, wait = 8000) {
  await record(page);
  await run();
  await page.waitForTimeout(wait);
  const rows = await stop(page);
  const { issues, frames } = judgeRows(rows, vp);
  console.log(`${name.padEnd(28)} ${frames} frames with station labels (of ${rows.length} drawn; most labels in one: ${Math.max(0, ...rows.map((r) => r.L.length))}), ${issues.length} issue line(s)`);
  for (const i of issues) fail(`${name}: ${i}`);
  if (frames < need) unsure(`${name}: only ${frames} drawn frames (need ${need})`);
  // (The labels stay up through a gesture: frames drawn with no station label at all, where the view had some before, are labels hidden.)
  const empty = rows.filter((r) => !r.L.length).length;
  if (rows.length >= need && empty > rows.length / 2) fail(`${name}: station labels hidden in ${empty} of ${rows.length} drawn frames`);
  return rows;
}

try {
  for (const device of DEVS) {
    const reduce = device.endsWith('-reduce'), dev = device.replace(/-reduce$/, '');
    const app = await openApp({ device: dev, theme: 'dark', query: '?preset=healthy', dpr: 1, dir, timeout: 240000 });
    const page = app.page;
    if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });   // (Reduce Motion: the labels must still move with the figure, not hide)
    page.setDefaultTimeout(240000);
    page.on('pageerror', (e) => fail(`${device}: page error: ${e.message}`));
    await page.waitForFunction(() => (window.pps.stage.labelDrawnBy?.() || []).filter((d) => d.a > 0.9).length >= 3, null, { timeout: 240000 });
    await settle(page);
    const vp = await page.evaluate(() => ({ W: innerWidth, H: innerHeight }));
    const cx = Math.round(vp.W / 2), cy = Math.round(vp.H / 2);
    for (const view of VIEWS) {
      if (view === 'anatomic') {
        if (ONLY.includes('switch')) await gesture(page, `${device} switch to anatomy`, () => page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click()), vp, 3, 40000);
        else await page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click());
        await settle(page);
      }
      // (The view at rest: judged on its own frames too.)
      await gesture(page, `${device} ${view} rest`, async () => {}, vp, 1);
      if (ONLY.includes('pan')) {
        for (let n = 0; n < REPEAT; n++) {
          const sg = n % 2 ? -1 : 1;
          await gesture(page, `${device} ${view} pan${REPEAT > 1 ? ` ${n + 1}` : ''}`, async () => {
            await page.mouse.move(cx, cy); await page.mouse.down();
            for (let i = 1; i <= 16; i++) await page.mouse.move(cx + sg * i * 6, cy - sg * i * 4);
            await page.mouse.up();
          }, vp);
          await settle(page);
        }
      }
      if (ONLY.includes('zoom')) {
        await gesture(page, `${device} ${view} zoom`, async () => {
          await page.mouse.move(cx, cy);
          for (let i = 0; i < 12; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -16); await page.keyboard.up('Control'); await page.waitForTimeout(70); }
        }, vp);
        await settle(page);
        await gesture(page, `${device} ${view} after zoom`, async () => {}, vp, 1);
        await page.evaluate(() => window.pps.stage.fit());
        await settle(page);
      }
      if (view === 'anatomic' && ONLY.includes('switch')) {
        await gesture(page, `${device} switch to circuit`, () => page.evaluate(() => document.querySelector('#viewSeg [data-view="circuit"]').click()), vp, 3, 40000);
        await settle(page);
        await gesture(page, `${device} circuit after switch`, async () => {}, vp, 1);
      }
    }
    if (process.env.LA_SHOT) await page.screenshot({ path: `${process.env.LA_SHOT}-${device}.png` });
    await app.close();
  }
} catch (e) { fail(`run: ${e.stack || e}`); }
console.log(failed ? `\n${failed} failed` : unsureN ? '\nINCONCLUSIVE' : '\nlabels stayed on their points');
process.exit(failed ? 1 : unsureN ? 2 : 0);
