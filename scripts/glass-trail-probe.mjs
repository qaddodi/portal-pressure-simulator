// Does the GPU glass of a card stand where its card is presented? (3 Nov 2026, "cards trail behind")
//
// The compositor draws a card moved by a CSS or script animation a display frame after the page's time at the frame start, so a glass drawn
// from the page's own time trails it by that frame (glass-motion.js leadFor). Playwright's stepped clock cannot show this (it does not move
// the document timeline and the compositor is not stepped), so this probe runs in real time with every WebGL draw skipped, which makes
// the frames milliseconds long on software GL, and compares two things the page itself can tell:
//   - each glass pane the page DRAWS in frame N (the pane program's uBox and fade, noted by a hook on the context; nothing is drawn), and
//   - where every card and callout glass host IS at the START of frame N+1 (a first requestAnimationFrame callback reads their boxes):
//     a card moved by an animation is presented in the box its animation has at the next frame's time, and one moved by an inline value
//     written in frame N is presented as written, so both are what the next frame's start reads.
// The offset (px) is the distance from each drawn pane to the nearest card box of its size. After the fix it is within a pixel through
// the move; before it, the distance a card moves in a frame (a trail).
//
//   node scripts/glass-trail-probe.mjs [--device mac|iphone|iphone-landscape|ipad] [--script hvpg] [--slide 4] [--key ArrowRight] [--ms 1600] [--dir .] [--out file.json]

import { writeFileSync } from 'node:fs';
import { openApp } from './shoot.mjs';

export const TRAIL_HOOK = () => {
  const P = WebGL2RenderingContext.prototype;
  const locs = new WeakMap(), names = new WeakMap(), cur = new WeakMap();
  const S = (window.__trail = { on: false, draws: [], frames: [] });
  const gl0 = P.getUniformLocation;
  P.getUniformLocation = function (prog, name) {
    const l = gl0.call(this, prog, name);
    if (l) { locs.set(l, name); let s = names.get(prog); if (!s) names.set(prog, (s = new Set())); s.add(name); }
    return l;
  };
  const up = P.useProgram;
  P.useProgram = function (p) { cur.set(this, p); return up.call(this, p); };
  const box = [0, 0, 0, 0]; let fade = 1;
  const u4 = P.uniform4f;
  P.uniform4f = function (loc, a, b, c, d) { if (locs.get(loc) === 'uBox') { box[0] = a; box[1] = b; box[2] = c; box[3] = d; } return u4.call(this, loc, a, b, c, d); };
  const u1 = P.uniform1f;
  P.uniform1f = function (loc, v) { if (locs.get(loc) === 'uA') fade = v; return u1.call(this, loc, v); };
  const rects = new Map();
  for (const fn of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) {
    const f0 = P[fn];
    if (!f0) continue;
    P[fn] = function () {
      // (skipped: nothing is drawn, so a frame costs milliseconds and the page runs as it would on a GPU)
      const pr = cur.get(this);
      if (S.on && (fn === 'drawArrays' || fn === 'drawArraysInstanced') && pr && names.get(pr)?.has('uTint')) {
        let r = rects.get(this.canvas); if (!r) rects.set(this.canvas, (r = this.canvas.getBoundingClientRect()));
        const k = this.canvas.width / r.width;
        S.draws.push({ stack: S.stacks ? new Error().stack.split('\n').slice(2, 7).map((l) => l.trim().replace(/http:\/\/[^/]+\//, '')).join(' < ') : '', cv: `${this.canvas.id || this.canvas.className || this.canvas.tagName}#${this.canvas.width}`, x: r.left + box[0] / k, y: r.top + box[1] / k, w: box[2] / k, h: box[3] / k, a: fade });
      }
    };
  }
  const SEL = '.pz-shade,.pz-data,.pz-panel,.pz-case,.cl-glass,.pz-text';
  const tick = (t) => {
    requestAnimationFrame(tick);
    rects.clear();
    if (!S.on) return;
    const boxes = [];
    for (const e of document.querySelectorAll(SEL)) {
      const r = e.getBoundingClientRect(), o = +getComputedStyle(e).opacity;
      if (r.width > 20 && r.height > 12 && o > 0.02) boxes.push({ c: e.className.toString().split(' ')[0], x: r.left, y: r.top, w: r.width, h: r.height, o });
    }
    S.frames.push({ t, draws: S.draws.splice(0), boxes });
  };
  requestAnimationFrame(tick);
};

/** A frame can lay the figure's picture with its glass more than once (the figure's own render with the glass as last drawn, then the
 *  glass's final phase with the page as it now is): the canvas shows the last, so only the last run of panes counts. A pane of a size
 *  already in the run starts the next run. */
export function lastPicture(draws) {
  let run = [], seen = new Set();
  for (const d of draws) {
    const key = `${Math.round(d.w)}x${Math.round(d.h)}`;
    if (seen.has(key)) { run = []; seen = new Set(); }
    seen.add(key); run.push(d);
  }
  return run;
}

/** frames: [{ t, draws, boxes }] -> per-draw offsets from the nearest box of its size at the frame start that follows its frame. */
export function offsets(frames) {
  const out = [];
  for (let i = 1; i < frames.length; i++) {
    const F = frames[i], prev = frames[i - 1];
    for (const d of lastPicture(F.draws)) {   // (taken at tick i: so drawn in frame i-1)
      if (!(d.a > 0.02)) continue;
      const near = (boxes) => {
        let best = null;
        for (const b of boxes) {
          if (Math.abs(b.w - d.w) > 4 || Math.abs(b.h - d.h) > 4) continue;
          const dist = Math.hypot(b.x - d.x, b.y - d.y);
          if (!best || dist < best.dist) best = { dist, c: b.c };
        }
        return best;
      };
      const next = near(F.boxes), was = near(prev.boxes);
      if (next && was) out.push({ i, c: next.c, vsNext: next.dist, vsThen: was.dist, moved: Math.hypot(0, 0) });
    }
  }
  return out;
}

export const summary = (os) => {
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const moving = os.filter((o) => o.vsNext > 0.5 || o.vsThen > 0.5);
  return { draws: os.length, moving: moving.length, vsNextMax: Math.max(0, ...os.map((o) => o.vsNext)), vsNextP95: q(os.map((o) => o.vsNext), 0.95), vsThenMax: Math.max(0, ...os.map((o) => o.vsThen)), byCard: Object.fromEntries([...new Set(os.map((o) => o.c))].map((c) => [c, Math.max(...os.filter((o) => o.c === c).map((o) => o.vsNext)).toFixed(1)])) };
};

const LANDED = () => {
  const root = document.querySelector('.pz');
  if (!root || root.classList.contains('pz-prep') || 'bare' in root.dataset) return false;
  const cards = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => document.querySelector(q)).filter((e) => e && !e.hidden && e.childElementCount);
  return cards.length > 0 && cards.every((e) => +getComputedStyle(e).opacity >= 0.99 && !e.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
};

export async function probe({ device = 'mac', script = 'hvpg', slide = 4, key = 'ArrowRight', ms = 1600, dir = '.' } = {}) {
  const app = await openApp({ device, dir, query: `?script=${script}&slide=${slide}`, initScript: `(${TRAIL_HOOK})()` });
  try {
    await app.page.waitForTimeout(3000);
    for (let k = 0; k < 120 && !(await app.page.evaluate(LANDED)); k++) await app.page.waitForTimeout(500);
    await app.page.evaluate(() => { window.__trail.draws.length = 0; window.__trail.frames.length = 0; window.__trail.on = true; });
    await app.page.keyboard.press(key);
    await app.page.waitForTimeout(ms);
    const frames = await app.page.evaluate(() => { window.__trail.on = false; return window.__trail.frames; });
    return { frames, errors: app.errors };
  } finally { await app.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const r = await probe({ device: arg('device', 'mac'), script: arg('script', 'hvpg'), slide: Number(arg('slide', 4)), key: arg('key', 'ArrowRight'), ms: Number(arg('ms', 1600)), dir: arg('dir', '.') });
  const os = offsets(r.frames);
  console.log(JSON.stringify({ frames: r.frames.length, ...summary(os) }));
  if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify({ frames: r.frames, offsets: os }));
}
