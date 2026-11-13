// The flow arrowheads, traced by numbers (13 Nov 2026, "chevrons fade out and a fresh set loads in"). Boots the real stage in node (as
// scripts/stage-trace.mjs: jsdom, the do-nothing WebGL, the real core on a fake clock), keeps a shadow copy of the textures the heads read
// (flow, tube, rad, axis) and of the uniforms, and after every frame places every head on the CPU exactly as blood-heads.js headVS does.
// A head is followed from frame to frame by its identity (vessel row, run, its index along the stream), and every change in its strength
// is put down to the factor that made it:
//   link   the own run against a chained root's run (a link forming or letting go): heads fade out and others fade in at new places
//   level  the spacing level (zoom, caliber): every other head fades
//   key    Key chevrons only;  strength: the row's blood strength;  speed: the slow-flow fade;  size: too narrow a lumen on screen
//   end    a head running into or out of a vessel's end (it moves there: not a pop)
// and a head that jumps along its vessel (a stream re-anchored, a link's A or B eased) is counted as a jump. A "pop" is a head that loses
// or gains more than POP of its strength in one frame for any reason but its own travel (end), or jumps more than JUMP_PX on screen.
// Density: the heads' summed strength per 1000 CSS px of drawn vessel, per vessel, at each step.
//
//   node scripts/chevron-trace.mjs            the session below; prints per step: pops, jumps, fade budget by cause, density spread
//   CHEV_TRACE_JSON=file                      also writes the per-step numbers
import { writeFileSync } from 'node:fs';

let T = 1000;
const timers = new Map(); let tid = 1, order = 0;
Object.defineProperty(performance, 'now', { value: () => T, configurable: true });
Date.now = () => 1.7e12 + T;
let seed = 12345;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const addTimer = (fn, ms, every, args) => { const id = tid++; timers.set(id, { fn, at: T + Math.max(0, ms || 0), every, args, o: order++ }); return id; };
globalThis.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, 0, a);
globalThis.setInterval = (fn, ms, ...a) => addTimer(fn, ms, Math.max(1, ms || 1), a);
globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
globalThis.queueMicrotask ??= (f) => Promise.resolve().then(f);
let ask = [];
globalThis.requestAnimationFrame = (cb) => { ask.push(cb); return ask.length; };
globalThis.cancelAnimationFrame = () => {};
const runTimers = (until) => {
  for (;;) {
    let best = null;
    for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best[1].at || (t.at === best[1].at && t.o < best[1].o))) best = [id, t];
    if (!best) return;
    const [id, t] = best; T = Math.max(T, t.at);
    if (t.every) { t.at += t.every; t.o = order++; } else timers.delete(id);
    t.fn(...t.args);
  }
};
const pump = (ms) => { const end = T + ms; runTimers(end); T = end; const run = ask; ask = []; for (const cb of run) cb(T); runTimers(T); };

// ---- shadow GL: the textures and uniforms the heads read ----
const NAME = new Map();
const progs = new Set();
let lastU = null;   // (the uniforms of the last program that drew with the blood's rows: the composite or the heads' quads)
async function install() {
  const glMod = await import('./warm/gl-stub.mjs');
  const domMod = await import('./warm/dom.mjs');
  const proto = Object.getPrototypeOf(glMod.makeGL({ width: 4, height: 4 }));
  for (const k of Object.getOwnPropertyNames(proto)) if (typeof proto[k] === 'number' && proto[k] >= 0x20000) NAME.set(proto[k], k);
  const page = domMod.installPage();
  const g = globalThis, w0 = page.dom.window;
  for (const k of ['dispatchEvent', 'addEventListener', 'removeEventListener']) if (!g[k]) g[k] = w0[k].bind(w0);
  const win = page.dom.window, cproto = win.HTMLCanvasElement.prototype;
  const ctx2d = (canvas) => new Proxy({ canvas, measureText: (s) => ({ width: String(s).length * 7, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) },
    { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : (...a) => (k.startsWith('create') ? { addColorStop() {} } : undefined)), set: (o, k, v) => { o[k] = v; return true; } });
  cproto.getContext = function (type) {
    if (type === '2d') return (this.__2d ??= ctx2d(this));
    if (type !== 'webgl2') return null;
    if (this.__gl) return this.__gl;
    const gl = glMod.makeGL(this);
    let unit = 0, cur = null;
    const bound = [];
    const wrap = (k, f) => { const o = gl[k]; gl[k] = function (...a) { const r = o.apply(this, a); f(a, r); return r; }; };
    wrap('activeTexture', ([u]) => { unit = u - 0x84C0; });
    wrap('bindTexture', ([, t]) => { bound[unit] = t; });
    wrap('texImage2D', (a) => {
      const t = bound[unit]; if (!t || a.length < 9) return;
      // (Channels by the internal format: the do-nothing GL names no two-letter constant, gl.RG among them.)
      const f = NAME.get(a[2]) || '', ch = /^RGBA/.test(f) ? 4 : /^RG/.test(f) ? 2 : /^R/.test(f) ? 1 : 4, w = a[3], h = a[4];
      t.sh = { fmt: NAME.get(a[2]), w, h, ch, d: new Float32Array(w * h * ch) };
      if (a[8] && a[8].length) t.sh.d.set(a[8].subarray ? a[8].subarray(0, w * h * ch) : a[8]);
    });
    wrap('texSubImage2D', (a) => {
      const t = bound[unit]; if (!t?.sh || a.length < 9) return;
      const [, , x, y, w, h, , , data, off = 0] = a, S = t.sh, ch = S.ch;
      if (!data || !data.length) return;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) for (let k = 0; k < ch; k++) {
        const src = off + (r * w + c) * ch + k, dst = ((y + r) * S.w + x + c) * S.ch + k;
        if (src < data.length && dst < S.d.length) S.d[dst] = data[src];
      }
    });
    wrap('getUniformLocation', ([p, n], loc) => { if (loc) { loc.n = n; loc.p = p; } });
    wrap('useProgram', ([p]) => { cur = p && typeof p === 'object' ? p : null; if (cur) { cur.u ??= {}; progs.add(cur); } });
    for (const k of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f']) wrap(k, ([loc, ...v]) => { if (loc?.n && cur) cur.u[loc.n] = v.length === 1 ? v[0] : v; });
    for (const k of ['uniformMatrix3fv']) wrap(k, ([loc, , v]) => { if (loc?.n && cur) cur.u[loc.n] = Array.from(v); });
    for (const k of ['uniform3fv', 'uniform4fv', 'uniform2fv']) wrap(k, ([loc, v]) => { if (loc?.n && cur) cur.u[loc.n] = Array.from(v); });
    // (A unit's sampler: which texture the program reads as 'flow', 'rad', 'tube', 'axis'.)
    wrap('uniform1i', ([loc, v]) => { if (loc?.n && cur && ['flow', 'rad', 'tube', 'axis'].includes(loc.n)) (cur.tex ??= {})[loc.n] = bound[v]; });
    for (const k of ['drawArrays', 'drawArraysInstanced']) wrap(k, () => { if (cur?.tex?.flow && cur.u.pxW != null && cur.u.bT != null) lastU = cur; });
    this.__gl = gl; return gl;
  };
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' || (this.tagName?.toLowerCase() === 'svg' && this.parentElement?.closest?.('#stageView')) ? BOX : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  for (const [k, v] of [['clientWidth', 1200], ['clientHeight', 800], ['offsetWidth', 1200], ['offsetHeight', 800]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  return page;
}

// ---- headVS on the CPU ----
let N_SAMPLES, PERIOD, HEADS, N_LAST, LAYOUT;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gmod = (x, y) => x - y * Math.floor(x / y);
const wrapP = (d) => d - PERIOD * Math.round(d / PERIOD);

function heads(U) {
  const F = U.tex.flow?.sh, R = U.tex.rad?.sh, Tu = U.tex.tube?.sh, A = axisTex?.sh;
  if (!F || !R || !Tu || !A) return [];
  const fl = (c, id) => { const o = (id * F.w + c) * 4; return [F.d[o], F.d[o + 1], F.d[o + 2], F.d[o + 3]]; };
  const rad = (i, id) => R.d[(id * R.w + i) * 4];
  const tube = (c, id) => { const o = (id * Tu.w + c) * 4; return [Tu.d[o], Tu.d[o + 1], Tu.d[o + 2], Tu.d[o + 3]]; };
  const ax = (i, id) => { const o = (id * A.w + i) * 2; return [A.d[o], A.d[o + 1]]; };
  const radAt = (id, s, len) => { const ui = Math.min(1, Math.max(0, s / len)) * N_LAST, i0 = Math.min(Math.floor(ui), N_LAST - 1); return Math.max(rad(i0, id) + (rad(i0 + 1, id) - rad(i0, id)) * (ui - i0), 0.3); };
  const bT = U.u.bT, pxW = U.u.pxW, cssPx = U.u.cssPx || 1, still = U.u.still === 1;
  const vEff = (id) => { const a = fl(6, id), v = fl(0, id)[1]; return a[1] === 0 ? v : (v + a[2] * (bT - a[0])) * a[1]; };   // (the speed the GPU runs the stream at now)
  const flowD = (id, D, vd) => { const a = fl(6, id), t = bT - a[0]; return a[1] === 0 ? D : gmod(D + (vd + 0.5 * a[2] * t) * a[1] * t, PERIOD); };
  const rootD = (rid, chx) => { const a = fl(6, rid); if (a[1] === 0) return chx; const r0 = fl(0, rid), tr = bT - a[0]; return gmod(r0[0] + (r0[1] + 0.5 * a[2] * tr) * a[1] * tr, PERIOD); };
  const out = [];
  for (let id = 0; id < F.h; id++) {
    const f0 = fl(0, id), f1 = fl(1, id);
    if (!(f1[2] > 0)) continue;
    if (!(ax(0, id)[0] || ax(0, id)[1] || ax(N_LAST, id)[0])) continue;
    const len = Math.max(tube(5, id)[2], 1), R = Math.max(rad(N_LAST >> 1, id), 0.3);
    if (R < 1.3 * pxW) continue;
    const ch4 = fl(4, id), ch5 = fl(5, id), f3 = fl(3, id), ch8 = A.w > N_SAMPLES ? ax(N_SAMPLES, id) : [0, 0];
    const cw = still ? 0 : ch4[3];
    const binary = A.w > N_SAMPLES;   // (since 13 Nov the heads take one run, never mixed, with their own A offset and B: the axis texture's last column)
    for (const root of [false, true]) {
      const wRun = binary ? (root === cw > 0 ? 1 : 0) : root ? cw : 1 - cw;
      if (wRun <= 0) continue;
      let Dm, Rsp = R, Aa = 0, B = 1, runDir, rid = -1;
      if (root) {
        rid = Math.round(ch4[0]) - 1; Dm = rootD(rid, ch5[0]); Rsp = Math.max(rad(N_LAST >> 1, rid), 0.3);
        Aa = ch4[1] + (binary ? ch8[0] : 0); B = binary && ch8[1] !== 0 ? ch8[1] : ch4[2]; runDir = fl(0, rid)[1] * B < 0 ? -1 : 1;
      } else { Dm = flowD(id, f0[0], f0[1]); if (binary) { Aa = ch8[0]; B = ch8[1] !== 0 ? ch8[1] : 1; } runDir = f0[1] * B < 0 ? -1 : 1; }
      if (Math.abs(B) < 1e-4) continue;
      let P, Pc, n0 = 0, lvOwn = 0, lvUp = 0, eu = 0, fr = 0, Pt = 0;
      if (LAYOUT) {
        const stillLv = still ? f3[1] + 1.3219281 : -1, lw = LAYOUT.headLevel(pxW, cssPx, B, stillLv);
        const lr = A.w > N_SAMPLES + 1 ? ax(N_SAMPLES + 1, id) : [0, 0];
        lvOwn = lvUp = lr[1] > 0.5 ? Math.max(lr[0], stillLv) : lw.lv; Pt = lw.Pt;
        if (root) {
          eu = Math.min(1, Math.max(0, runDir > 0 ? ch5[2] : ch5[3]));
          const pid = Math.round(f3[3]) - 1;
          if (eu > 0 && pid >= 0) {
            const p4 = fl(4, pid), pB = binary ? ax(N_SAMPLES, pid)[1] : 0;
            const same = pid === rid || (Math.abs(p4[0] - ch4[0]) < 0.5 && p4[3] > 0);
            const Bp = same ? (pB !== 0 ? pB : pid === rid ? 1 : p4[2]) : 1;
            const pl = A.w > N_SAMPLES + 1 ? ax(N_SAMPLES + 1, pid) : [0, 0];
            lvUp = !same ? lvOwn : pl[1] > 0.5 ? Math.max(pl[0], stillLv) : LAYOUT.headLevel(pxW, cssPx, Bp, stillLv).lv;
          } else eu = 0;
        }
        n0 = Math.floor(Math.min(lvOwn, lvOwn + (lvUp - lvOwn) * eu)); P = 28 * 2 ** n0; Pc = 0.4 * Pt;
      } else {
        let lv = Math.max(0, Math.log2(Math.max(3.6 * Rsp, 60 * pxW) / 28));
        if (still) lv = Math.max(lv, f3[1]);
        Pc = 28 * 2 ** lv; lv += 1.3219281;
        const n = Math.floor(lv); fr = lv - n; P = 28 * 2 ** n;
      }
      const seLo = Math.min(Aa, Aa + B * len) - P, j0 = Math.ceil((seLo - Dm) / P);
      const hw = Math.min(0.8 * R, Math.min(Math.max(0.5 * R, 4 * cssPx * pxW), 8 * cssPx * pxW)), L = 1.6 * hw;
      const reach = 0.6 * L + 0.15 * hw + 4 * pxW;
      const kMax = Math.ceil(len * Math.max(Math.abs(B), 1) / P) + 3;
      for (let k = 0; k < kMax + 4; k++) {
        const j = j0 + k, sc = (Dm + j * P - Aa) / B;
        if (sc < -reach || sc > len + reach) continue;
        let keep;
        if (LAYOUT) {
          const lvAt = lvOwn + (lvUp + (lvOwn - lvUp) * ss(Math.min(1.2 * L, 0.45 * len) - Math.min(0.03 * Pt, 0.5 * Math.min(1.2 * L, 0.45 * len)), Math.min(1.2 * L, 0.45 * len) + Math.min(0.03 * Pt, 0.5 * Math.min(1.2 * L, 0.45 * len)), runDir > 0 ? sc : len - sc) - lvOwn) * eu;
          keep = LAYOUT.headKeep(j, n0, lvAt);
          if (keep <= 0) continue;
          if (process.env.CHEV_FAINT && keep < 0.95 && keep > 0.05) console.log('faint', id, root ? 'r' + rid : 'o', 'j', j, 'n0', n0, 'own', lvOwn.toFixed(3), 'up', lvUp.toFixed(3), 'eu', eu.toFixed(2), 'at', lvAt.toFixed(3), 'sc', sc.toFixed(1), '/', len.toFixed(1), 'lvcol', A.w > N_SAMPLES + 1 ? ax(N_SAMPLES + 1, id).map((v) => v.toFixed(3)).join(',') : '-');
        } else keep = gmod(j, 2) > 0.5 ? 1 - ss(0.15, 0.85, fr) : 1;
        const lo = 0.6 * L, ramp = Math.max(2 * L, 0.3 * Pc);
        let endF;
        if (ch5[2] <= 0 && ch5[3] <= 0) { const e = Math.min(sc, len - sc); endF = e < lo ? 0 : ss(lo, lo + ramp, e); }
        else {
          const a0 = sc < lo ? 0 : ss(lo, lo + ramp, sc), a1 = len - sc < lo ? 0 : ss(lo, lo + ramp, len - sc);
          endF = Math.min(a0 + (1 - a0) * Math.min(1, Math.max(0, ch5[2])), a1 + (1 - a1) * Math.min(1, Math.max(0, ch5[3])));
        }
        const fac = { link: wRun, level: keep, key: f3[0], strength: f1[2], speed: ss(0.5, 3, Math.abs(f0[1])), size: ss(1.3 * pxW, 2.4 * pxW, R), narrow: ss(0.85 * hw, 1.15 * hw, radAt(id, sc, len)), end: endF };
        let fade = 1; for (const k2 in fac) fade *= fac[k2];
        // (Where it stands, in device px: the axis point, then the inverse of the composite's inv.)
        const u = Math.min(1, Math.max(0, sc / len)) * N_LAST, i0 = Math.min(Math.floor(u), N_LAST - 1);
        const p0 = ax(i0, id), p1 = ax(i0 + 1, id);
        let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const ex = sc - Math.min(len, Math.max(0, sc));
        const wx = p0[0] + (p1[0] - p0[0]) * (u - i0) + tx * ex, wy = p0[1] + (p1[1] - p0[1]) * (u - i0) + ty * ex;
        // (Identity: the head's place on its stream, wrapped by the period, so a wrap of the distance keeps it.)
        // (Its offset from the stream's distance, j P, wrapped by the period: the same head keeps it through a wrap of the distance and
        // through a change of level, where the coarser heads are the finer ones' even half.)
        const se = gmod(Dm + j * P, PERIOD);
        // (Keyed by its stream, not its row: a head that runs through a chained join from the root's own vessel into the next keeps its key.)
        out.push({ key: `${root ? rid : id}:${Math.round(gmod(j * P, PERIOD))}`, id, root, rid, dir: runDir, scRaw: sc, Dm, Aa, B, n0, j, vOwn: vEff(id), vRoot: root ? vEff(rid) : vEff(id), sc: +sc.toFixed(1), len: +len.toFixed(1), se, P, wx, wy, fade, fac, hw, pxW, cssPx });
      }
    }
  }
  return out;
}
let axisTex = null;

// ---- the session ----
const page = await install();
({ N_SAMPLES } = await import('../src/ui/comp-glsl.js'));
({ PERIOD } = await import('../src/ui/blood.js'));
HEADS = await import('../src/ui/blood-heads.js');
N_LAST = N_SAMPLES - 1;
LAYOUT = HEADS.headLevel ? HEADS : null;   // (the spacing rule itself, chevLevel and chevKeep, when blood-heads.js has it: before 13 Nov the caliber's, below)
const { createCore } = await import('../src/worker-core.js');
const frames = [];
const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
const coreRun = (n) => { for (let i = 0; i < n; i++) pump(33); };
coreRun(90);
const { store } = await import('../src/ui/store.js');
store.set1('blood', { ...store.get().blood, chevrons: true });
const { createStage } = await import('../src/ui/stage.js');
const st = createStage({ wrap: page.document.getElementById('stageView'), onSelect() {}, onAction() {}, onOpenTab() {}, onHoverInfo() {}, onViewChange() {} });

const POP = 0.12, JUMP_PX = 6;
const rows = [];
let prev = null, step = null, fi = 0;
const linkW = new Map();
const newStep = (tag) => { step = { tag, links: 0, frames: 0, drawn: 0, pops: 0, popBy: {}, jumps: 0, lostBy: {}, gainBy: {}, dens: [], heads: 0, faint: 0, back: 0, backMax: 0, dis: 0, steps: 0, spd: 0, spdBy: {}, gone: 0, goneBy: {}, clk: [Infinity, 0] }; rows.push(step); };
// (The frame's wall time and blood clock when the heads last moved: a frame the stage did not draw (rest pacing) is skipped, never counted as a stop.)
let prevBT = NaN, prevWall = NaN;
const inv3 = (m) => {   // (column-major mat3 → its inverse)
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
};
const frame = (ms = 16.7) => {
  // (The core runs on beside the stage on the same fake clock: the newest model frame, once, as the app hands it over.)
  if (frames.length > fi && st.update) { fi = frames.length; st.update(frames[fi - 1]); }
  pump(ms);
  if (!lastU) return;
  for (const p of progs) if (p.tex?.axis?.sh) axisTex = p.tex.axis;
  const U = lastU;
  // (Not drawn: the blood clock the heads were last placed at stands. The picture on screen is the last one: nothing to compare.)
  if (U.u.bT === prevBT && prev) { step.frames++; return; }
  const dtWall = (T - prevWall) / 1000;
  let dtB = U.u.bT - prevBT;
  const epoch = !(dtB > 0);   // (the blood clock's epoch moved on, or it stood: the time step is not known from bT)
  if (prev && !epoch && dtWall > 0) { step.clk[0] = Math.min(step.clk[0], dtB / dtWall); step.clk[1] = Math.max(step.clk[1], dtB / dtWall); if (process.env.CHEV_CLK && Math.abs(dtB / dtWall - 1) > 0.05) console.log('CLK', step.tag, step.frames, 'bT', prevBT.toFixed(4), '->', U.u.bT.toFixed(4), 'wall', dtWall.toFixed(4)); }
  if (epoch) dtB = NaN;
  prevBT = U.u.bT; prevWall = T;
  step.drawn++;
  const hs = heads(U);
  // (The join: a chained row's heads off the junction's own lattice (the offset to its A, by whole spacings at the level it is drawn at), CSS px along
  // the vessel. Off, a head running out of the parent comes on in the branch somewhere else: it hops at the join.)
  { const F = U.tex.flow?.sh, Ax = axisTex?.sh;
    if (F && Ax && Ax.w > N_SAMPLES + 1) for (let id = 0; id < Math.min(F.h, Ax.h); id++) {
      if (!(F.d[(id * F.w + 4) * 4 + 3] > 0) || !(F.d[(id * F.w + 1) * 4 + 2] > 0)) continue;
      const o = (id * Ax.w + N_SAMPLES) * 2, off = Ax.d[o], B = Ax.d[o + 1], lv = Ax.d[o + 2];
      if (!B) continue;
      const P = 28 * 2 ** Math.floor(lv), m = Math.abs(off - P * Math.round(off / P)) / Math.abs(B) / (U.u.pxW * (U.u.cssPx || 1));
      step.joinN = (step.joinN || 0) + 1;
      if (process.env.CHEV_JOIN && step.tag.includes(process.env.CHEV_JOIN) && step.drawn % 20 === 1) console.log('JOIN', step.drawn, 'row', id, 'root', F.d[(id * F.w + 4) * 4] - 1, 'A', F.d[(id * F.w + 4) * 4 + 1].toFixed(2), 'Bj', F.d[(id * F.w + 4) * 4 + 2].toFixed(3), 'off', off.toFixed(2), 'B', B.toFixed(3), 'lv', lv.toFixed(2), 'P', P, 'px', m.toFixed(1), 'v', F.d[(id * F.w) * 4 + 1].toFixed(2));
      if (m > 2) { step.joinOff = (step.joinOff || 0) + 1; step.joinMax = Math.max(step.joinMax || 0, m); }
    } }
  if (process.env.CHEV_ROWS && step.tag.includes(process.env.CHEV_LINKS || '~')) { const F = U.tex.flow?.sh; const q = (c, r) => Array.from(F.d.subarray((r * F.w + c) * 4, (r * F.w + c) * 4 + 4)).map((v) => +v.toFixed(2)); for (const r of process.env.CHEV_ROWS.split(',').map(Number)) console.log(step.frames, 'R', r, 'f0', q(0, r), 'f1', q(1, r), 'f3', q(3, r), 'ch4', q(4, r), 'ch5', q(5, r), 'run', axisTex ? [axisTex.sh.d[(r * axisTex.sh.w + N_SAMPLES) * 2].toFixed(2), axisTex.sh.d[(r * axisTex.sh.w + N_SAMPLES) * 2 + 1].toFixed(3)] : '-', 'heads', hs.filter((h) => h.id === r).map((h) => `${h.key}${h.root ? 'r' : 'o'}@${h.sc}:${h.fade.toFixed(2)}`).join(' ')); }
  // (Links that start to form or to let go this frame: a row's chain weight leaving 0 or 1.)
  { const F = U.tex.flow?.sh; if (F) for (let id = 0; id < F.h; id++) { const w = F.d[(id * F.w + 4) * 4 + 3], s1 = F.d[(id * F.w + 1) * 4 + 2] > 0, was = linkW.get(id); if (s1 && was != null && ((was === 1 && w < 1) || (was === 0 && w > 0))) { step.links++; if (process.env.CHEV_LINKS && step.tag.includes(process.env.CHEV_LINKS)) { const q = (c, r) => Array.from(F.d.subarray((r * F.w + c) * 4, (r * F.w + c) * 4 + 4)).map((v) => +v.toFixed(3)); const par = Math.round(q(3, id)[3]) - 1; console.log(step.frames, 'row', id, was, '->', w.toFixed(3), 'ch4', q(4, id), 'vd', q(0, id)[1], 'par', par, par >= 0 ? q(0, par)[1] : '-', 'ends', q(5, id).slice(2)); } } linkW.set(id, s1 ? w : null); } }
  const Mi = U.u.inv ? inv3(U.u.inv) : null, H = U.u.H || 800;
  const scr = (x, y) => (Mi ? [Mi[0] * x + Mi[3] * y + Mi[6], Mi[1] * x + Mi[4] * y + Mi[7]] : [x, y]);
  const map = new Map();
  for (const h of hs) {
    [h.sx, h.sy] = scr(h.wx, h.wy);
    if (!(h.sx > -50 && h.sx < 1250 * (h.cssPx || 1) && h.sy > -50 && h.sy < 850 * (h.cssPx || 1))) continue;
    const o = map.get(h.key);
    if (!o || h.fade > o.fade) map.set(h.key, h);   // (a head on two rows at a join: the stronger)
  }
  step.frames++;
  let vis = 0; for (const h of map.values()) vis += h.fade;
  step.heads += vis;
  // (Density: heads' strength per 1000 CSS px of each vessel's on-screen run, vessels with at least 300 CSS px drawn.)
  const per = new Map();
  for (const h of map.values()) { const o = per.get(h.id) || { s: 0 }; o.s += h.fade; per.set(h.id, o); }
  // (Faint by the spacing level: a head the level keeps between a twentieth and nineteen twentieths, per frame.)
  for (const h of map.values()) if (h.fac.level > 0.05 && h.fac.level < 0.95) step.faint++;
  const lenPx = vesselScreenLen(U, scr);
  for (const [id, L] of lenPx) if (L > 300) step.dens.push(1000 * (per.get(id)?.s || 0) / L);
  if (prev) {
    // (A head that moved onto another stream in place, a run handed over at a junction's link: the new key nearest a key gone, within
    // a few px, is the same head.)
    const alias = new Map(), took = new Set();
    for (const [k, h] of map) {
      if (prev.has(k)) continue;
      let best = null, bd = 6 * h.cssPx;
      for (const [k2, p2] of prev) { if (map.has(k2) || took.has(k2)) continue; const d = Math.hypot(h.sx - p2.sx, h.sy - p2.sy); if (d < bd) { bd = d; best = k2; } }
      if (best) { alias.set(k, prev.get(best)); took.add(best); }
    }
    step.handovers = (step.handovers || 0) + alias.size;
    for (const [k, h] of map) {
      const p = prev.get(k) || alias.get(k);
      const was = p ? p.fade : 0;
      const d = h.fade - was;
      if (p && Math.hypot(h.sx - p.sx, h.sy - p.sy) > JUMP_PX * h.cssPx && h.fade > 0.05) step.jumps++;
      // (Backward: a head that shows, on the same vessel as last frame, whose step along its own arrow is behind by more than a third of a
      // CSS px. 13 Nov 2026: "They go the other way against their arrow direction".)
      if (p && p.id === h.id && h.dir === p.dir && h.fade > 0.05 && p.fade > 0.05) {
        const st = (h.scRaw - p.scRaw) * h.dir / (h.pxW * h.cssPx);
        step.steps++;
        // (Direction: any step against the arrow, a twentieth of a CSS px or more.)
        if (st < -0.05) { step.dis++; if (process.env.CHEV_DIS && step.tag.includes(process.env.CHEV_DIS)) console.log('DIS', step.frames, k, 'row', h.id, h.root ? 'r' + h.rid : 'o', 'px', st.toFixed(3), 'dD', wrapP(h.Dm - p.Dm).toFixed(3), 'dA', (h.Aa - p.Aa).toFixed(3), 'B', p.B.toFixed(4), '->', h.B.toFixed(4), 'v', p.vRoot.toFixed(3), '->', h.vRoot.toFixed(3), 'n0', p.n0, h.n0); }
        if (st < -0.33) { step.back++; step.backMax = Math.max(step.backMax, -st); if (process.env.CHEV_BACK && step.tag.includes(process.env.CHEV_BACK)) console.log('BACK', step.frames, k, 'row', h.id, h.root ? 'r' + h.rid : 'o', 'sc', p.scRaw.toFixed(2), '->', h.scRaw.toFixed(2), 'dir', h.dir, 'px', st.toFixed(2)); }
        // (Speed along the vessel, world units a second of the blood clock: the same at any zoom, any frame rate, for one flow. Its parts:
        // the stream's own step over B, the run's offset A over B, and what a change of B does.)
        const dAw = h.Aa - p.Aa, shift = Math.abs(dAw) > 0.5 * h.P && Math.abs(dAw / h.P - Math.round(dAw / h.P)) < 1e-3;   // (the run's A put back by whole spacings: the same heads, renamed)
        if (dtB > 0 && p.root === h.root && !shift) {
          h.v = (h.scRaw - p.scRaw) * h.dir / dtB;
          h.vD = wrapP(h.Dm - p.Dm) / h.B * h.dir / dtB; h.vA = -(h.Aa - p.Aa) / h.B * h.dir / dtB; h.vB = h.v - h.vD - h.vA;
          const flowSame = Math.abs(h.vOwn - p.vOwn) <= 0.02 * Math.abs(p.vOwn) && Math.abs(h.vRoot - p.vRoot) <= 0.02 * Math.abs(p.vRoot);
          if (p.v != null && flowSame && Math.max(Math.abs(p.v), Math.abs(h.v)) > 0.5 && Math.abs(h.v - p.v) > 0.1 * Math.abs(p.v)) {
            const parts = { D: Math.abs(h.vD - p.vD), A: Math.abs(h.vA - p.vA), B: Math.abs(h.vB - p.vB) };
            let why = Object.entries(parts).reduce((a, e) => (e[1] > a[1] ? e : a), ['-', -1])[0];
            if (why === 'D' && Math.abs(dtB - p.dtB) > 0.02 * p.dtB) why = 'D(dt)';
            if (h.n0 !== p.n0) why += '+level';
            step.spd++; step.spdBy[why] = (step.spdBy[why] || 0) + 1;
            if (process.env.CHEV_SPD && step.tag.includes(process.env.CHEV_SPD)) console.log('SPD', step.frames, k, 'row', h.id, h.root ? 'r' + h.rid : 'o', why, 'v', p.v.toFixed(2), '->', h.v.toFixed(2), 'vD', p.vD.toFixed(2), h.vD.toFixed(2), 'vA', p.vA.toFixed(2), h.vA.toFixed(2), 'vB', p.vB.toFixed(2), h.vB.toFixed(2), 'dt', p.dtB.toFixed(4), dtB.toFixed(4), 'B', p.B.toFixed(4), h.B.toFixed(4), 'stream v', p.vRoot.toFixed(3), h.vRoot.toFixed(3));
          }
          h.dtB = dtB;
        }
      }
      if (Math.abs(d) > 1e-4) {
        // (Which factor moved the most: the strength change charged to it.)
        let best = 'new', bd = 0;
        if (p) for (const f in h.fac) { const df = Math.abs(h.fac[f] - p.fac[f]); if (df > bd) { bd = df; best = f; } }
        else best = Object.entries(h.fac).reduce((a, e) => (e[1] < a[1] ? e : a), ['x', 2])[0];
        (d < 0 ? step.lostBy : step.gainBy)[best] = ((d < 0 ? step.lostBy : step.gainBy)[best] || 0) + Math.abs(d);
        if (Math.abs(d) > POP && best !== 'end' && best !== 'narrow' && process.env.CHEV_LOG && step.tag.includes(process.env.CHEV_LOG)) console.log(step.frames, best, k, `row ${h.id}${h.root ? 'r' : 'o'} ${h.sc}/${h.len} @${h.sx.toFixed(0)},${h.sy.toFixed(0)} was row ${p?.id}${p?.root ? 'r' : 'o'} ${p?.sc}`, was.toFixed(2), '->', h.fade.toFixed(2), JSON.stringify(p?.fac, (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), JSON.stringify(h.fac, (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
        if (Math.abs(d) > POP && best !== 'end' && best !== 'narrow') { step.pops++; step.popBy[best] = (step.popBy[best] || 0) + 1; }
      }
    }
    for (const [k, p] of prev) if (!map.has(k) && !took.has(k) && p.fade > 1e-4) {
      // (Gone from the list while it still showed: off the screen or off its vessel's run, or its run's identity changed.)
      const onScreen = p.sx > 10 && p.sx < 1190 * p.cssPx && p.sy > 10 && p.sy < 790 * p.cssPx;
      const why = !onScreen ? 'offscreen' : p.fac.end < 0.2 ? 'end' : p.fac.narrow < 0.2 ? 'narrow' : 'vanished';
      step.lostBy[why] = (step.lostBy[why] || 0) + p.fade;
      if (why === 'vanished' && p.fade > POP && process.env.CHEV_LOG && step.tag.includes(process.env.CHEV_LOG)) console.log(step.frames, 'VANISHED', k, `row ${p.id}${p.root ? 'r' : 'o'} ${p.sc}/${p.len} @${p.sx.toFixed(0)},${p.sy.toFixed(0)}`, p.fade.toFixed(2), JSON.stringify(p.fac, (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), [...map.keys()].filter((q) => q.startsWith(k.split(':').slice(0, 2).join(':'))).join(' '));
      if (why === 'vanished' && p.fade > POP) { step.pops++; step.popBy.vanished = (step.popBy.vanished || 0) + 1; }
    }
    // (Disappearances: a head that showed (over 0.3) and is gone or under 0.05 in the next drawn frame, while more than a head's length
    // from either end of its vessel, by what took it.)
    const aliasOf = new Map(); for (const [k2, p2] of alias) aliasOf.set(p2, k2);
    for (const [k, p] of prev) {
      if (!(p.fade > 0.3)) continue;
      let h = map.get(k) || (aliasOf.has(p) ? map.get(aliasOf.get(p)) : null);
      if (!h || h.fade < 0.05) {
        // (The same head under another name: a run handed over in place (own stream to root's or back), its key taken by another head. Any
        // head on the same row within 16 CSS px of where it stood (a step at 20 fps and more; the next head stands 65 or more away), that shows.)
        for (const q of map.values()) if (q.id === p.id && q.fade >= 0.05 && Math.hypot(q.sx - p.sx, q.sy - p.sy) < 16 * p.cssPx && (!h || q.fade > h.fade)) h = q;
      }
      if (h && h.fade >= 0.05) continue;
      const L = 1.6 * p.hw, nearEnd = p.scRaw < L || p.len - p.scRaw < L || p.fac.end < 0.9;
      const onScreen = p.sx > 10 && p.sx < 1190 * p.cssPx && p.sy > 10 && p.sy < 790 * p.cssPx;
      if (nearEnd || !onScreen) continue;
      let why;
      if (h) { let bd = 0; why = 'fade'; for (const f in h.fac) { const df = p.fac[f] - h.fac[f]; if (df > bd) { bd = df; why = f; } } }
      else {
        // (Gone from the list: the run it was on changed (own against root), its row lost its blood or its level's lattice, or it left its run.)
        const sameRow = [...map.values()].filter((q) => q.id === p.id);
        why = !sameRow.length ? 'row gone' : sameRow.some((q) => q.root !== p.root) && !sameRow.some((q) => q.root === p.root) ? 'run change' : sameRow.some((q) => q.n0 !== p.n0) ? 'level' : 'vanished';
      }
      step.gone++; step.goneBy[why] = (step.goneBy[why] || 0) + 1;
      if (process.env.CHEV_GONE && step.tag.includes(process.env.CHEV_GONE)) console.log('GONE', step.tag, step.frames, k, why, `row ${p.id}${p.root ? 'r' + p.rid : 'o'} ${p.sc}/${p.len}`, p.fade.toFixed(2), '->', h ? h.fade.toFixed(3) : 'none', JSON.stringify(p.fac, (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), h ? JSON.stringify(h.fac, (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v)) : '', 'n0', p.n0, h?.n0, 'B', p.B.toFixed(3), h?.B?.toFixed(3));
    }
  }
  prev = map;
};
function vesselScreenLen(U, scr) {
  const A = axisTex?.sh, F = U.tex.flow?.sh, out = new Map();
  if (!A || !F) return out;
  for (let id = 0; id < Math.min(A.h, F.h); id++) {
    if (!(F.d[(id * F.w + 1) * 4 + 2] > 0)) continue;
    let L = 0, pp = null;
    for (let i = 0; i < N_SAMPLES; i++) {
      const o = (id * A.w + i) * 2; const q = scr(A.d[o], A.d[o + 1]);
      const inside = q[0] > 0 && q[0] < 1200 * (U.u.cssPx || 1) && q[1] > 0 && q[1] < 800 * (U.u.cssPx || 1);
      if (pp && inside) L += Math.hypot(q[0] - pp[0], q[1] - pp[1]);
      pp = q;
    }
    out.set(id, L / (U.u.cssPx || 1));
  }
  return out;
}
// (ms: the frame interval, one number or a list cycled through: 16.7 a 60 Hz screen, 50 the talk's 20 Hz, [16.7, 50] a ragged rate.)
const run = (n, tag, ms = 16.7) => { newStep(tag); for (let i = 0; i < n; i++) frame(Array.isArray(ms) ? ms[i % ms.length] : ms); };
const call = (fn) => { try { fn(); } catch (e) { console.log('THREW', e.message.slice(0, 120)); } };

run(150, 'boot (healthy)');
run(240, 'steady (healthy)');
call(() => st.zoomIn()); run(60, 'zoom in');
call(() => st.zoomIn()); run(60, 'zoom in again');
call(() => st.zoomOut()); run(60, 'zoom out');
call(() => st.zoomOut()); run(60, 'zoom out again');
call(() => st.zoomOpen()); newStep('pinch out 1x to 2.5x'); for (let i = 0; i <= 45; i++) { call(() => st.zoomAt(1 + 1.5 * i / 45, 600, 400, 0, 0)); frame(); }
call(() => st.zoomEnd()); run(60, 'pinch end');
call(() => st.setView('circuit')); run(150, 'switch to circuit');
run(120, 'steady (circuit)');
call(() => st.setView('anatomy')); run(150, 'switch to anatomy');
call(() => store.set1('speed', 3)); run(120, 'speed x3');
call(() => store.set1('speed', 1)); run(120, 'speed x1');
run(120, 'ragged 16/50 ms');
run(80, '20 fps (50 ms)', 50);
run(60, '15 fps (62 ms)', 62);
run(120, 'ragged 16/33/50 ms', [16.7, 33.3, 50]);
for (const id of ['cirr-decomp', 'pvt-acute', 'cirr-comp', 'cirr-hepatofugal']) {
  frames.length = 0; fi = 0;
  call(() => { const g = core.handle({ type: 'preset', id }); if (g && typeof g.next === 'function') for (let r = g.next(); !r.done; r = g.next()); });
  run(300, `preset ${id}`);   // (live from the preset's first model frame: links forming, flows turning, a reversal's settle and hold)
  run(240, `steady ${id}`);
  run(80, `20 fps ${id}`, 50);
  run(120, `ragged ${id}`, [16.7, 50]);
}

const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ') || '-';
console.log('step                         drawn   steps  dis  back(max px)  speed jumps (by)                       gone, not at an end (by)              clock/wall  join off >2px (of, max px)');
for (const r of rows) {
  const by = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  console.log(`${r.tag.padEnd(28)} ${String(r.drawn).padStart(5)} ${String(r.steps).padStart(7)} ${String(r.dis).padStart(4)}  ${String(r.back).padStart(4)}(${r.backMax.toFixed(1).padStart(5)})  ${String(r.spd).padStart(5)} ${by(r.spdBy).slice(0, 32).padEnd(32)} ${String(r.gone).padStart(4)} ${by(r.goneBy).slice(0, 32).padEnd(32)} ${(r.clk[0] === Infinity ? '-' : `${r.clk[0].toFixed(2)}…${r.clk[1].toFixed(2)}`).padEnd(11)} ${r.joinOff || 0}/${r.joinN || 0} (${(r.joinMax || 0).toFixed(1)})`);
}
console.log('');
console.log('step                         links frames  heads  faint  back(max px)  pops (by)                      jumps  lost (by cause)                       density /1000 css px p10 · p50 · p90');
for (const r of rows) {
  console.log(`${r.tag.padEnd(28)} ${String(r.links).padStart(5)} ${String(r.frames).padStart(6)} ${(r.heads / Math.max(1, r.frames)).toFixed(1).padStart(6)} ${(r.faint / Math.max(1, r.frames)).toFixed(1).padStart(6)}  ${String(r.back).padStart(4)}(${r.backMax.toFixed(1).padStart(5)})  ${String(r.pops).padStart(4)} ${JSON.stringify(r.popBy).slice(0, 28).padEnd(28)} ${String(r.jumps).padStart(6)}  ${fmt(r.lostBy).padEnd(38)} ${pct(r.dens, 0.1).toFixed(2)} · ${pct(r.dens, 0.5).toFixed(2)} · ${pct(r.dens, 0.9).toFixed(2)}`);
}
if (process.env.CHEV_TRACE_JSON) writeFileSync(process.env.CHEV_TRACE_JSON, JSON.stringify(rows.map((r) => ({ ...r, dens: [pct(r.dens, 0.1), pct(r.dens, 0.5), pct(r.dens, 0.9)] })), null, 1));
process.exit(0);
