// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js?v=4044766e96';
import { pressureColor } from './colormap.js?v=ec83805fb9';
import { verbEnabled } from './actions.js?v=f84a878db7';
import { h, fmt, fitCanvas, cssVar, cssAlpha, clamp, icon } from './util.js?v=e387ad7347';
import { simTime, isPaused } from './clock.js?v=af6de95a7c';
import { createEndoGL } from './endo-gl.js?v=9c6f94577c';
import { renderEndo } from './endo-render.js?v=00dd0c3285';
import { FONT } from './charts.js?v=65a7c122ce';
import { store, updateParams, varicesPresent } from './store.js?v=3b659e1968';
import { balanceHold } from './balance-hold.js?v=ea4d9121d2';
import { frameFor, cancelFrame } from './frame.js?v=5efaa2bcc9';
const nextFrame = frameFor('instruments');

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── Endoscopy ───────────────────────────────────────
// The Tests card's grade tile has room for one short word under the code.
const GRADE_SHORT = { 'Large, coil-shaped': 'Coil-shaped' };
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
  box.append(cv);
  const view = 'eso'; // the esophageal variceal view only
  // The position is a caption under the view, never over it.
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, 'Distal esophagus · 36 cm'));
  const bandBtn = h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band a column (EVL)');
  // The readings: the bands placed lead, then the grade, size and wall side by side,
  // and the stigmata as a chip. Built once; each frame only changes text, widths and states.
  const dd = (cls) => h('dd', { class: cls });
  const gradeCode = h('b'), gradeLabel = h('span');
  const grade = h('dd', { class: 'endo-grade' }, gradeCode, gradeLabel);
  const diam = dd('endo-num'), wall = dd('endo-num'), red = dd('endo-chip-v'), bands = dd('endo-chip-v');
  const redWord = h('span'), redMore = h('span', { class: 'endo-more' });   // (the sign, then its detail: a slide's compact row shows the sign alone)
  red.append(redWord, redMore);
  const item = (cls, ...kids) => h('div', { class: cls }, ...kids);
  const stats = h('dl', { class: 'endo-read' },
    item('endo-chip', h('dt', {}, 'Bands', h('span', { class: 'endo-dt-x' }, ' placed')), bands),
    h('div', { class: 'endo-g', title: 'F1 small and straight, F2 enlarged and tortuous, F3 large and beaded.' }, h('dt', {}, 'Grade'), grade),
    item('endo-tile', h('dt', {}, 'Diameter'), diam),
    item('endo-tile', h('dt', {}, 'Wall', h('span', { class: 'endo-dt-x' }, ' thickness')), wall),
    item('endo-chip endo-red', h('dt', {}, 'Stigmata'), red));
  const side = h('div', { class: 'chart-side' }, stats, bandBtn);
  el.append(stage, side);
  const set = (node, v) => { if (node.textContent !== v) node.textContent = v; };
  function update(f) {
    const m = f.metrics;
    const vx = view === 'eso' ? m.varix : m.gastricVarix;
    const noVx = !varicesPresent(f, view === 'eso' ? 'VAR' : 'GV');
    bandBtn.disabled = noVx; bandBtn.title = noVx ? 'No varices to band' : '';
    set(gradeCode, vx.grade.code === '—' ? '' : vx.grade.code); set(gradeLabel, vx.grade.label); gradeLabel.dataset.short = GRADE_SHORT[vx.grade.label] || vx.grade.label;   // no varices: the label alone
    grade.dataset.sev = vx.grade.code === 'F1' ? 'caution' : vx.grade.code === '—' ? 'ok' : 'danger';
    set(diam, `${fmt(vx.d, 1)} mm`); set(wall, `${fmt(vx.w, 1)} mm`);
    const redV = vx.d < 2.5 ? 'None' : vx.redWale ? 'Red wale, cherry spots' : 'None';
    set(redWord, redV === 'None' ? redV : 'Red wale'); set(redMore, redV === 'None' ? '' : ', cherry spots'); if (redV === 'None') delete red.dataset.long; else red.dataset.long = ''; red.parentNode.dataset.on = String(redV !== 'None');
    const nb = String(Math.round(f.bands || 0));
    set(bands, nb); bands.parentNode.dataset.on = String(nb !== '0');
    draw(f, vx);
  }
  // Rendered endoscopic view (see endo-render.js): a per-pixel 3D shading of the lumen with raised,
  // winding varices, drawn once per state into a cached bitmap, so it is perfectly steady. Balloon,
  // bleeding and the scope mask are drawn on top.
  const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const gl = createEndoGL(), glOut = document.createElement('canvas');
  let peak = 0, peakRed = 0, an = null, lastT = 0, last = null, raf = 0, bleedT = 0, cache = { key: '', img: null }, glKey = '', painted = '', mv = null, held = null;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  // An eased tween toward a target value: cur follows from -> to over dur ms after a delay.
  const tw = (v) => ({ v, from: v, to: v, t0: 0, dur: 1, delay: 0, cur: v });
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function tween(t, target, now, dur, delay) {
    if (target !== t.to) { t.from = t.cur; t.to = target; t.t0 = now; t.dur = dur; t.delay = delay; }
    if (t.dur <= 1) { t.cur = t.v = t.to; return false; } // snap
    const k = Math.min(1, Math.max(0, (now - t.t0 - t.delay) / t.dur));
    t.cur = t.from + (t.to - t.from) * ease(k); t.v = t.cur;
    return k < 1 && t.cur !== t.to;
  }
  const offRun = store.on('running', () => { if (last && !isPaused()) draw(last.f, last.vx); });
  function draw(f, vx) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 32 || hh < 32) return; // hidden/reflowing canvas: wait for its measured size
    // The field fills the box.
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 4;
    const bands = Math.round(f.bands || 0);
    // Banding deflates the banded columns only. The model's single varix size falls as bands go on,
    // so unbanded columns keep the size seen before the first band.
    last = { f, vx };
    const now = simTime() * 1000, dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now; // sim clock: frozen while paused
    // The field shows the varix over the beat, not each beat's swell: the model's size and wall stress rise and fall with every
    // heartbeat, and following them redrew the whole shaded field many times a second (a browser without a GPU spent a second on
    // each redraw and its page stopped answering), while the comment above promises a steady view. Averaged over about a second.
    const kb = 1 - Math.exp(-dt / 1.2);
    if (!mv) mv = { d: vx.d, ratio: vx.ratio };
    else { mv.d += (vx.d - mv.d) * kb; mv.ratio += (vx.ratio - mv.ratio) * kb; }
    const gNow = clamp((mv.d - 2) / 10, 0, 1);
    peak = bands > 0 ? Math.max(peak, gNow) : gNow;
    const tg = peak, tv = bands > 0 ? 1 : clamp((mv.d - 2.5) / 1.0, 0, 1);
    // Stigmata follow the modeled wall stress: they start below the red-wale threshold (70 % of the
    // tear point) and are full near it. Unbanded columns keep what they showed before the first band.
    const rNow = clamp((mv.ratio - 0.55) / 0.35, 0, 1);
    peakRed = bands > 0 ? Math.max(peakRed, rNow) : rNow;
    const tr = peakRed;
    // Targets: each column is deflated and knuckled once banded (the 4 bands fill columns in turn).
    const defT = [0, 0, 0, 0], knT = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
      const nb = Math.floor(bands / 4) + (c < bands % 4 ? 1 : 0);
      defT[c] = nb > 0 ? 1 : 0;
      for (let k = 0; k < Math.min(nb, 4); k++) knT[c * 4 + k] = 1;
    }
    if (!an) {
      an = { g: tg, v: tv, r: tr, def: defT.map((x) => tw(x)), kn: knT.map((x) => tw(x)) };
      an.def.forEach((t, i) => { t.v = defT[i]; }); an.kn.forEach((t, i) => { t.v = knT[i]; });
    }
    // Size and presence follow the model continuously (critically damped, ~0.2 s); banding plays a
    // slower eased tween: the vein deflates first, the knuckle and band follow.
    const kf = 1 - Math.exp(-dt / 0.2);
    an.g += (tg - an.g) * kf; an.v += (tv - an.v) * kf; an.r += (tr - an.r) * kf;
    if (Math.abs(tg - an.g) < 0.0008) an.g = tg;
    if (Math.abs(tv - an.v) < 0.0008) an.v = tv;
    if (Math.abs(tr - an.r) < 0.0008) an.r = tr;
    let busy = an.g !== tg || an.v !== tv || an.r !== tr;
    // The band snaps on and the banded vein starts deflating at once, in about half a second.
    for (let c = 0; c < 4; c++) busy = tween(an.def[c], defT[c], now, 500, 0) || busy;
    for (let i = 0; i < 16; i++) busy = tween(an.kn[i], knT[i], now, 1, 0) || busy;
    if (busy && !raf && !isPaused()) raf = nextFrame(() => { raf = 0; if (last) draw(last.f, last.vx); });
    const res = clamp(Math.round(2 * R * (window.devicePixelRatio || 1)), 160, 480);
    let img;
    if (gl) {
      // Drawn once per state and kept as a 2D bitmap: a steady field costs no shader pass or GPU readback.
      // (Size, presence and stigmata redraw once they have moved a step and a half of 32 from the field shown, so a slow drift
      // or the last of the beat's swell does not redraw it to and fro across one step; banding redraws at every step.)
      held = [an.g, an.v, an.r].map((x, i) => (held && Math.abs(x * 32 - held[i]) < 1.5 ? held[i] : Math.round(x * 32)));
      const gk = [res, ...held, ...[...an.def.map((t) => t.cur), ...an.kn.map((t) => t.cur)].map((x) => Math.round(x * 32))].join('|');
      if (gk !== glKey) {
        glKey = gk;
        gl.render(res, { grow: an.g, vis: an.v, red: an.r, def: an.def.map((t) => t.cur), kn: an.kn.map((t) => t.cur) });
        if (glOut.width !== res) glOut.width = glOut.height = res;
        glOut.getContext('2d').drawImage(gl.canvas, 0, 0);
        cv.dataset.renders = String(+(cv.dataset.renders || 0) + 1);   // (read by the browser checks: a steady field is not redrawn)
      }
      img = glOut;
    } else {
      // No WebGL: the CPU renderer draws the target state without transitions.
      const r2 = Math.min(res, 300), gq = Math.round(tg * 14) / 14;
      const key = [r2, gq, bands, Math.round(tv * 10), Math.round(tr * 8)].join('|');
      if (cache.key !== key) cache = { key, img: renderEndo(r2, { grow: gq, bands, vis: tv, red: Math.round(tr * 8) / 8 }) };
      img = cache.img;
    }
    // Nothing on the field changed since the last paint (the same bitmap, size, balloon and theme, no bleeding): it is left
    // as it is. It is asked for on every frame of the model, and a full repaint each time (a scaled bitmap and the rim) held
    // a phone's or a browser without a GPU's main thread for most of every frame.
    const bleeding = !!(f.bleed?.active && f.bleed.site === 'VAR'), root = document.documentElement;
    const sig = [cv.width, cv.height, w, hh, gl ? glKey : cache.key, !!f.params?.balloonEso, root.getAttribute('data-theme'), root.className, dark.matches].join('|');
    if (!bleeding && sig === painted) return;
    painted = bleeding ? '' : sig;
    ctx.clearRect(0, 0, w, hh);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - R, cy - R, 2 * R, 2 * R);
    if (f.params?.balloonEso) {
      const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R * 0.85);
      g.addColorStop(0, cssVar('--scope-balloon-hi')); g.addColorStop(1, cssVar('--scope-balloon-lo'));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cssAlpha('--white', 0.5); ctx.lineWidth = 2; ctx.stroke();
    }
    if (f.bleed?.active && f.bleed.site === 'VAR') {
      // Active bleeding: a jet from the ruptured column and blood pooling dependently.
      bleedT = (bleedT + 1) % 1000;
      const jx = cx + R * 0.28, jy = cy + R * 0.05;
      const pool = ctx.createRadialGradient(cx, cy + R * 0.8, R * 0.1, cx, cy + R * 0.8, R * 0.75);
      pool.addColorStop(0, cssVar('--scope-blood-pool')); pool.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0));
      ctx.fillStyle = pool; ctx.fillRect(cx - R, cy, 2 * R, R);
      const jr = rnd(77), sway = 0.1 * Math.sin(bleedT * 0.02);
      ctx.fillStyle = cssVar('--scope-blood-jet');
      for (let i = 0; i < 70; i++) { const u = jr(), a = -1.9 + sway + (jr() - 0.5) * 0.5; ctx.beginPath(); ctx.arc(jx + Math.cos(a) * u * R * 0.5, jy + Math.sin(a) * u * R * 0.5 + u * u * R * 0.4, 1.2 + 2.2 * (1 - u), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = cssVar('--scope-rim'); ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update, setView() {}, dispose() { offRun(); cancelFrame(raf); raf = 0; gl?.dispose(); last = null; } };
}

// ── Varix wall cross-section (L3) ───────────────────
// Scope's Wall mechanics tab: a cross-section of the esophagus with the varix in its wall, and Laplace's
// law as readings in the same tiles and meter as the scope view.
const WALL_SEV = { ok: 'Low', caution: 'High', danger: 'Near tear', critical: 'Past tear' };
export function createVarixWall() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'varixwall' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Varix cross-section: transmural pressure stretches the varix wall' });
  box.append(cv);
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, h('span', { class: 'wall-cap' }, 'Laplace’s law: '), 'T = ΔP · r / w'));
  const dd = (cls) => h('dd', { class: cls });
  const item = (cls, ...kids) => h('div', { class: cls }, ...kids);
  const stressTxt = dd('endo-stress-v'), stressFill = h('i'), stressBar = h('span', { class: 'endo-bar', 'aria-hidden': 'true' }, stressFill);
  // Each number with its unit in smaller type, so a long reading still fits a narrow tile. (Every reading has a unit line, an
  // empty one for the index, so a narrow Tests card can set each unit under its value and the values still share a line.)
  const num = (unit) => { const v = h('span'); const d = h('dd', { class: 'endo-num' }, v, h('small', {}, unit ? ' ' + unit : '')); d.v = v; return d; };
  // A narrow tile in the Tests card shows a name's short form ("ΔP", "Index"), so a name never breaks inside a word (a slide keeps the long one).
  const name = (long, short) => h('dt', {}, h('span', { class: 'wall-long' }, long), h('span', { class: 'wall-short' }, short));
  const ptm = num('mmHg'), rad = num('mm'), wal = num('mm'), idx = num('');
  // A slide's screen reads the stress as one number top left and its state top right (the pane keeps its sentence).
  const wPct = h('span'), wBig = h('b', { class: 'wall-big' }, wPct, h('small', {}, '%', h('span', { class: 'wall-of' }, ' of tear point'))), wSev = h('span', { class: 'wall-sev' });
  const stats = h('dl', { class: 'endo-read' },
    item('endo-g wall-law', h('dt', {}, 'Laplace’s law'), h('dd', { class: 'wall-formula' }, 'T = ΔP · r / w')),
    item('endo-stress', name('Wall stress (model)', 'Wall stress'), stressTxt, wBig, wSev, stressBar),
    item('endo-tile', name('Transmural ΔP', 'ΔP'), ptm),
    item('endo-tile', h('dt', {}, 'Radius r'), rad),
    item('endo-tile', h('dt', {}, 'Wall w'), wal),
    item('endo-tile', name('Stress index', 'Index'), idx));
  const side = h('div', { class: 'chart-side' }, stats,
    h('div', { class: 'ctl-sub' }, 'A wider varix, higher transmural pressure and a thinner wall all raise the stress. Remodeling enlarges the varix and thins its wall over months; a balloon raises the pressure outside it.'));
  el.append(stage, side);
  const set = (node, v) => { if (node.textContent !== v) node.textContent = v; };
  let wMean = null, wT = 0, wN = 0, wPin = NaN, wPinT = 0;
  // (A what-if or a time-lapse pins a new state every few frames: each eases into the last, so the figure does not flicker.)
  function pin(fp) {
    const x = fp?.wall, now = performance.now();
    wPin = !Number.isFinite(x) ? NaN : Number.isFinite(wPin) && now - wPinT < 1000 ? wPin + (x - wPin) * 0.35 : x;
    wPinT = now;
  }
  function update(f) {
    const v = f.metrics.varix;
    set(ptm.v, fmt(v.ptm, 1)); set(rad.v, fmt(v.r, 1)); set(wal.v, fmt(v.w, 1)); set(idx.v, fmt(v.T, 0));
    set(stressTxt, v.ratio >= 1 ? 'past the tear point' : `${Math.round(v.ratio * 100)} % of the tear point`);
    const sev = v.ratio > 1 ? 'critical' : v.ratio > 0.7 ? 'danger' : v.ratio > 0.4 ? 'caution' : 'ok';
    if (stressBar.dataset.sev !== sev) stressBar.dataset.sev = sev;
    // (The stress swings with each beat and each breath: the number is its mean over the last several breaths, a plain
    // average while that many have not passed yet, so it reads steady and the same on every screen, folded or open.)
    const now = performance.now();
    if (wMean == null || now - wT > 3000) { wMean = v.ratio; wN = 1; } else { wN++; wMean += (v.ratio - wMean) * Math.max(1 / wN, 1 - Math.exp(-(now - wT) / 6000)); }
    wT = now;
    // (On a slide the figure is the slide's own, the state its tiles show (pin), so every screen reads the same number.)
    if (Number.isFinite(wPin)) wMean = wPin;
    const ms = wMean > 1 ? 'critical' : wMean > 0.7 ? 'danger' : wMean > 0.4 ? 'caution' : 'ok';
    set(wPct, String(Math.round(wMean * 100))); set(wSev, WALL_SEV[ms]);
    if (wSev.dataset.sev !== ms) wSev.dataset.sev = wBig.dataset.sev = ms;
    const wPctW = `${Math.round(clamp(v.ratio, 0, 1) * 1000) / 10}%`;
    if (stressFill.style.width !== wPctW) stressFill.style.width = wPctW;
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 32 || hh < 32) return;
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 6, Rl = R * 0.52;
    // The wall: muscle outside, mucosa inside, the lumen in the middle.
    ctx.fillStyle = cssVar('--organ-stomach'); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--hairline'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(cx, cy, Rl, 0, 7); ctx.fill();
    // The varix in the submucosa at the top, bulging into the lumen; its size follows the model's radius.
    const rr = clamp(v.r * R * 0.05, 4, R * 0.3);
    const vy = cy - Rl - rr * 0.25;
    const rim = v.ratio > 0.7 ? cssVar('--danger') : cssVar('--text-2');
    // Transmural pressure pushes outward on the varix wall: longer arrows for a higher ΔP.
    const len = clamp(v.ptm, 0, 30) / 30 * rr * 0.9 + 4;
    ctx.strokeStyle = cssVar('--text-2'); ctx.fillStyle = cssVar('--text-2'); ctx.lineWidth = Math.max(1.25, R / 140);
    for (let a = -Math.PI; a < Math.PI - 0.01; a += Math.PI / 4) {
      const x0 = cx + Math.cos(a) * (rr + 3), y0 = vy + Math.sin(a) * (rr + 3), x1 = cx + Math.cos(a) * (rr + 3 + len), y1 = vy + Math.sin(a) * (rr + 3 + len);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const hd = 4 + R / 60;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.45) * hd, y1 - Math.sin(a - 0.45) * hd); ctx.lineTo(x1 - Math.cos(a + 0.45) * hd, y1 - Math.sin(a + 0.45) * hd); ctx.fill();
    }
    ctx.fillStyle = pressureColor(f.P[NI.VAR]); ctx.beginPath(); ctx.arc(cx, vy, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = clamp(v.w * R / 20, 1, 10); ctx.stroke();
    // The radius, drawn across the varix.
    ctx.strokeStyle = cssAlpha('--white', 0.85); ctx.lineWidth = 1.25; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, vy); ctx.lineTo(cx + rr, vy); ctx.stroke(); ctx.setLineDash([]);
    // (On a slide the labels take the card's small size, so they never fall under 12 px.)
    const fs = cv.closest('.pz-tool') ? parseFloat(getComputedStyle(cv).fontSize) || 12 : clamp(R / 11, 10, 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (rr > 14) { ctx.fillStyle = cssVar('--white'); ctx.font = FONT(600, fs); ctx.fillText('r', cx + rr / 2, vy + fs * 0.7); }
    // Laplace's other two terms on the picture: the tension T along the wall (two arrows pulling apart round the top,
    // heavier as the stress rises) and the wall thickness w across the rim (a bracket, in the faded label ink).
    const lw = clamp(v.w * R / 20, 1, 10), ro = rr + lw / 2 + Math.max(5, R / 30), ink = cssVar('--text-3');
    ctx.strokeStyle = rim; ctx.fillStyle = rim; ctx.lineWidth = clamp(1.25 + 2.5 * clamp(v.ratio, 0, 1.2), 1.25, 4);
    for (const s of [-1, 1]) {
      const a0 = -Math.PI / 2 + s * 0.22, a1 = -Math.PI / 2 + s * 1.05;
      ctx.beginPath(); ctx.arc(cx, vy, ro, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      const ex = cx + Math.cos(a1) * ro, ey = vy + Math.sin(a1) * ro, tx = -Math.sin(a1) * s, ty = Math.cos(a1) * s, hd = 5 + R / 50;
      ctx.beginPath(); ctx.moveTo(ex + tx * hd * 0.2, ey + ty * hd * 0.2);
      ctx.lineTo(ex - tx * hd + ty * hd * 0.55, ey - ty * hd - tx * hd * 0.55); ctx.lineTo(ex - tx * hd - ty * hd * 0.55, ey - ty * hd + tx * hd * 0.55); ctx.fill();
    }
    ctx.font = FONT(600, fs); ctx.fillStyle = rim; ctx.fillText('T', cx, vy - ro - fs * 0.75);
    const aw = Math.PI * 0.62, bx = Math.cos(aw), by = Math.sin(aw);
    const i0 = rr - lw / 2, o0 = rr + lw / 2 + 3;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + bx * i0, vy + by * i0); ctx.lineTo(cx + bx * (o0 + 6), vy + by * (o0 + 6)); ctx.stroke();
    for (const d of [i0, rr + lw / 2]) { ctx.beginPath(); ctx.moveTo(cx + bx * d - by * 3, vy + by * d + bx * 3); ctx.lineTo(cx + bx * d + by * 3, vy + by * d - bx * 3); ctx.stroke(); }
    const wy = vy + by * (o0 + 6 + fs * 0.6);
    ctx.fillStyle = ink; ctx.font = FONT(600, fs); ctx.fillText('w', cx + bx * (o0 + 6 + fs * 0.6), wy);
    ctx.fillStyle = cssVar('--text-3'); ctx.font = FONT(500, fs);
    // (A small picture: "lumen" moves down clear of the w label, and is left out when the lumen has no room for both.)
    const ly = Math.max(cy + Rl * 0.35, wy + fs * 1.3);
    if (ly <= cy + Rl - fs * 0.6) ctx.fillText('lumen', cx, ly);
    ctx.fillText('muscle', cx, cy + R * 0.87);
  }
  return { id: 'varixwall', label: 'Varix wall', el, update, pin };
}

// ── Ascites (L2c) ───────────────────────────────────
// The one home for ascites: how much there is, whether it is building up, what it does to the
// abdomen, what a diagnostic tap would show, and the two treatments (diuretics, paracentesis).
// Tapping the fluid on the figure, the Ascites readout's actions and Treat > Paracentesis all open it.
// Two blocks: what you read (plain values and flat tiles, nothing pressable), then what you change, in one
// control vocabulary: a stepper (value, then − and + side by side), the app's switch, and one button, Drain.
const SEV = ['ok', 'caution', 'danger', 'danger'];
const GRADE = ['None', 'Grade 1', 'Grade 2', 'Grade 3'];
const GRADE_TIP = ['No free fluid', 'Grade 1: seen on ultrasound only', 'Grade 2: moderate, symmetric distension', 'Grade 3: tense, marked distension'];
// Abdominal pressure as the left half of a dial beside the belly: 0 at the bottom, 30 mmHg at the top, green below
// 12 (intra-abdominal hypertension), amber to 20 (compartment syndrome), red above. The coloured arc fills up to the
// reading and a knob rides the ring; the number, its unit and a word sit inside the half circle. One drawing in a
// 76 × 128 box, so every part keeps its place at any size.
const IAP_MAX = 30, IAP_BANDS = [[0, 12, 'ok'], [12, 20, 'caution'], [20, 30, 'danger']];
const iapSev = (v) => (v >= 20 ? 'danger' : v >= 12 ? 'caution' : 'ok');
const IAP_WORD = { ok: 'Normal', caution: 'High', danger: 'Very high' };
function iapDial() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = (t, a = {}, txt) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; return e; };
  const C = 64, R = 56, TX = 42;   // pivot on the flat (belly) side, ring radius, the text column
  const pt = (v, r) => { const t = Math.PI / 2 + (v / IAP_MAX) * Math.PI; return [C + r * Math.cos(t), C + r * Math.sin(t)]; };
  const arc = (a, b, r) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const svg = s('svg', { class: 'ab-dial', viewBox: '-12 0 76 128', role: 'img' });
  const live = [];
  for (const [a, b, sev] of IAP_BANDS) {
    const a1 = a ? a + 0.3 : a, b1 = b < IAP_MAX ? b - 0.3 : b, d = arc(a1, b1, R);
    svg.append(s('path', { class: 'ab-dial-band', d, 'data-sev': sev }));
    const lp = s('path', { class: 'ab-dial-live', d, 'data-sev': sev, pathLength: '100', 'stroke-dasharray': '0 100' });
    svg.append(lp); live.push([a1, b1, lp]);
  }
  const tls = [];
  for (const v of [12, 20]) {
    const [x0, y0] = pt(v, R + 5), [x1, y1] = pt(v, R + 9);
    svg.append(s('line', { class: 'ab-dial-tick', x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2) }));
    const tl = s('text', { class: 'ab-dial-tl' }, String(v));
    svg.append(tl); tls.push([v, tl]);
  }
  // The knob: drawn pointing right (into the belly), then turned to the reading, so it eases round the ring.
  const knob = s('g', { class: 'ab-dial-knob' });
  knob.append(s('line', { x1: C + R - 12, y1: C, x2: C + R - 6, y2: C }), s('circle', { cx: C + R, cy: C, r: 4.6 }));
  const num = s('text', { class: 'ab-dial-n', x: TX, y: 70 }, '—'), word = s('text', { class: 'ab-dial-w', x: TX });
  const key = s('text', { class: 'ab-dial-k', x: TX, y: 43 }, 'IAP'), unit = s('text', { class: 'ab-dial-u', x: TX }, 'mmHg');
  svg.append(knob, key, num, unit, word);
  const el = h('div', { class: 'ab-dial-box', title: 'Intra-abdominal pressure. 12 mmHg and above: intra-abdominal hypertension. 20 mmHg and above: abdominal compartment syndrome.' }, svg);
  // The small words are 12 px on screen at least, however small the dial is drawn (sweep batch 04: the ticks at about 7 px,
  // the caption at 9.6 px on a phone): their size in the drawing grows as the dial shrinks, the lines below the number move
  // down to make room, and the word under them is left out when it no longer fits inside the half circle (the number's
  // colour and the arc still say how high it is; the dial's label reads the word).
  let fitK = 0;
  const fit = () => {
    const w = svg.getBoundingClientRect().width;
    if (!w) return;
    const k = 76 / w;
    if (Math.abs(k - fitK) < 0.005) return;
    fitK = k;
    const f = (base) => Math.max(base, 12.2 * k);
    const fk = f(8.5), fu = f(8.5), fw = f(9), ft = f(8.5);
    key.style.fontSize = `${fk.toFixed(2)}px`; unit.style.fontSize = `${fu.toFixed(2)}px`; word.style.fontSize = `${fw.toFixed(2)}px`;
    const yu = 74 + 0.72 * fu, yw = yu + 3.5 + 0.72 * fw;
    unit.setAttribute('y', yu.toFixed(2)); word.setAttribute('y', yw.toFixed(2));
    for (const [v, tl] of tls) {
      const [lx, ly] = pt(v, R + 10 + 0.65 * ft);
      tl.style.fontSize = `${ft.toFixed(2)}px`; tl.setAttribute('x', lx.toFixed(2)); tl.setAttribute('y', (ly + 0.36 * ft).toFixed(2));
    }
    fitWord();
  };
  // (The chord of the ring's inside at the word's baseline, from the text column to the flat side.)
  const fitWord = () => {
    const fw = parseFloat(word.style.fontSize) || 9, y = parseFloat(word.getAttribute('y')) || 92, top = y - 0.72 * fw;
    const dy = Math.max(Math.abs(y - C), Math.abs(top - C)), half = Math.sqrt(Math.max(0, (R - 4) ** 2 - dy * dy));
    word.style.display = '';
    const tw = word.getComputedTextLength?.() || 0;
    word.style.display = tw > 0 && (tw / 2 > C - TX + 0 || TX - tw / 2 < C - half) ? 'none' : '';
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(svg);
  let last = null;
  function set(iap) {
    const n = Math.max(0, Math.round(iap) || 0), v = Math.min(n, IAP_MAX);   // (whole mmHg, as the number reads, so the word and the arc agree with it)
    if (n === last) return;
    last = n;
    const sev = iapSev(v);
    num.textContent = String(n); word.textContent = IAP_WORD[sev];
    if (fitK) fitWord();
    svg.dataset.sev = sev;
    for (const [a, b, lp] of live) lp.setAttribute('stroke-dasharray', `${(clamp((v - a) / (b - a), 0, 1) * 100).toFixed(1)} 100`);
    knob.style.transform = `rotate(${(90 + (v / IAP_MAX) * 180).toFixed(1)}deg)`;
    svg.setAttribute('aria-label', `Intra-abdominal pressure ${n} mmHg, ${IAP_WORD[sev].toLowerCase()}`);
  }
  return { el, set };
}
export function createAbdomen({ onAction }) {
  // The stepper for serum albumin: − value +, the value between the buttons, the same control as the litres to drain.
  const stepper = (label, unit, min, max, stepBy, dp, start, onSet) => {
    let v = start;
    const out = h('output', { class: 'ab-dp-l' });
    const paint = () => { out.replaceChildren(v.toFixed(dp), h('small', {}, unit)); minus.disabled = v <= min; plus.disabled = v >= max; };
    const go = (d) => { v = +clamp(v + d, min, max).toFixed(dp); paint(); onSet(v); };
    const minus = h('button', { class: 'ab-dp-sb', 'aria-label': `${label}: less`, onclick: () => go(-stepBy) }, '−');
    const plus = h('button', { class: 'ab-dp-sb', 'aria-label': `${label}: more`, onclick: () => go(stepBy) }, '+');
    paint();
    return { out, el: h('div', { class: 'ab-dp-vol ab-sa', role: 'group', 'aria-label': label }, minus, out, plus), get: () => v, set: (x) => { if (x !== v) { v = x; paint(); } } };
  };
  // A switch row: the whole row is the tap target, the switch sits at its right edge.
  const toggle = (ic, title, sub, tip, onclick) => h('button', { class: 'ab-row ab-tg', role: 'switch', 'aria-checked': 'false', title: tip, onclick },
    ic ? icon(ic) : h('span'), h('span', { class: 'ab-txt' }, title, sub), h('span', { class: 'switch-vis', 'aria-hidden': 'true' }, h('i')));
  // Paracentesis: litres, Drain, and the albumin switch under it whose advice turns amber above 5 L without it.
  const albT = h('b'), albS = h('small');
  const alb = h('button', { class: 'ab-dp-alb', role: 'switch', 'aria-checked': 'false', onclick: () => { alb.setAttribute('aria-checked', String(!albOn())); paintVol(); } },
    h('span', { class: 'ab-dp-at' }, albT, albS), h('span', { class: 'switch-vis', 'aria-hidden': 'true' }, h('i')));
  alb.setAttribute('aria-checked', 'true');
  const albOn = () => alb.getAttribute('aria-checked') === 'true';
  let hasFluid = true;
  // The litres to drain: − value +, the value between the buttons like a dial's own reading.
  let L = 5;
  const volOut = h('output', { class: 'ab-dp-l', 'aria-live': 'polite' });
  const setL = (x) => { L = +clamp(x, 1, 10).toFixed(1); paintVol(); };
  const volMinus = h('button', { class: 'ab-dp-sb', 'aria-label': 'Litres to drain: less', onclick: () => setL(L - 0.5) }, '−');
  const volPlus = h('button', { class: 'ab-dp-sb', 'aria-label': 'Litres to drain: more', onclick: () => setL(L + 0.5) }, '+');
  const drain = h('button', { class: 'ab-drain', onclick: () => onAction({ kind: 'paracentesis', mL: L * 1000, albumin: albOn() }) });
  function paintVol() {
    const warn = L > 5 && !albOn();
    volOut.replaceChildren(L.toFixed(1), h('small', {}, 'L'));
    volMinus.disabled = L <= 1; volPlus.disabled = L >= 10;
    albT.textContent = 'Albumin';
    albS.textContent = albOn() ? `${Math.round(L * 8)} g` : warn ? 'Advised' : 'Optional';
    albS.classList.toggle('ab-warn', warn);
    alb.classList.toggle('ab-warn', warn);
    alb.title = warn ? `Above 5 L, give albumin (${Math.round(L * 8)} g, 8 g per litre drained) to protect the kidneys.` : 'Albumin 8 g per litre drained: advised above 5 L, optional below.';
    drain.textContent = hasFluid ? 'Drain' : 'No fluid';
    drain.disabled = !hasFluid;
  }
  paintVol();
  // Diuretics drives the same parameter as the Treatments chip.
  const diu = toggle('pill', h('b', {}, 'Diuretics'), h('small', {}, 'Spironolactone 100 mg + furosemide 40 mg'),
    'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites. Keep the 100 : 40 mg ratio (5 : 2).',
    () => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: 'Diuretics' }));
  // Serum albumin is a patient input that drives ascites (oncotic pull back into the vessels) and the SAAG.
  const sa = stepper('Serum albumin', 'g/dL', 1.5, 5, 0.1, 1, 4, (v) => updateParams((p) => { p.albumin = v; return p; }, { label: 'Serum albumin' }));
  // Volume, grade and daily change, with a small belly that fills with the fluid.
  const numEl = h('span', {}, '—'), gradeEl = h('span', { class: 'ab-grade' }), trendEl = h('div', { class: 'ab-trend' });
  const bigEl = h('b', {}, numEl, h('small', {}, 'L'));   // (the volume, coloured by its grade like the Ascites tile)
  const bellyFill = h('i', { class: 'ab-belly-fill' });
  // The litres sit inside the belly and the grade under it, so the reading and the picture stay one object.
  // The daily balance: always on its line, never appearing or going, through balanceHold (below). When the shown value
  // changes the line dips and comes back with the new value: amber with ▲ while fluid builds up, teal with ▼ while it goes.
  const rateArrow = h('i', { class: 'ab-rate-a', 'aria-hidden': 'true' }), rateTxt = h('span');
  const rateEl = h('span', { class: 'ab-rate', 'data-dir': 'steady' }, rateArrow, rateTxt);
  const rateHold = balanceHold();
  let rateTimer = 0;
  const rateLabel = (b) => (b === 0 ? ['steady', '', 'Steady'] : b > 0 ? ['up', '▲', `${fmt(b, 0)} mL/day`] : ['down', '▼', `${fmt(-b, 0)} mL/day`]);
  function paintRate(raw) {
    const b = rateHold.step(raw, performance.now());
    if (b == null) return;
    const [dir, arrow, txt] = rateLabel(b);
    const apply = () => { rateTimer = 0; rateEl.dataset.dir = dir; rateArrow.textContent = arrow; rateTxt.textContent = txt; rateEl.classList.remove('ab-rate-out'); };
    if (!rateTxt.textContent) { apply(); return; }   // (the first reading: no fade)
    clearTimeout(rateTimer);
    rateEl.classList.add('ab-rate-out');
    rateTimer = setTimeout(apply, 160);
  }
  const belly = h('div', { class: 'ab-belly' }, bellyFill, h('div', { class: 'ab-big' }, bigEl, gradeEl, rateEl));
  const gauge = h('div', { class: 'ab-gauge' }, belly);
  // Beside the belly in the Ascites tab: the pressure dial on its left, the drain on its right (both hidden on a slide).
  const dial = iapDial();
  gauge.append(dial.el);
  const dp = h('div', { class: 'ab-dp', role: 'group', 'aria-label': 'Paracentesis' },
    h('div', { class: 'ab-dp-k' }, 'Drain'),
    h('div', { class: 'ab-dp-vol', role: 'group', 'aria-label': 'Litres to drain' }, volMinus, volOut, volPlus),
    alb, drain);
  // Abdominal pressure as one slim bar, 0–30 mmHg, ticked at 12 (IAH) and 20 (ACS).
  const iapFill = h('i', { class: 'ab-iap-fill' }), iapNum = h('b'), iapWord = h('span', { class: 'ab-w' });
  const iapBar = h('div', { class: 'ab-iap-bar', role: 'img', title: '12 mmHg: intra-abdominal hypertension · 20 mmHg: compartment syndrome' }, iapFill,
    h('i', { class: 'ab-iap-mark', style: { left: '40%' } }), h('i', { class: 'ab-iap-mark', style: { left: '66.7%' } }));
  // The tap, g/dL: three flat tiles, SAAG first. With no result, one quiet line takes their place (same height).
  const lab = (k) => { const v = h('span', { class: 'ab-n' }, '—'); return [h('dl', { class: 'ab-tile' }, h('dt', {}, k), h('dd', {}, v, h('span', { class: 'ab-u' }, 'g/dL'))), v]; };
  const [saagEl, saagV] = lab('SAAG'), [tpEl, tpV] = lab('Fluid protein'), [albEl, albV] = lab('Fluid albumin');
  const why = h('div', { class: 'ab-why' });
  const tiles = h('div', { class: 'ab-tiles' }, saagEl, tpEl, albEl, why);
  const read = h('div', { class: 'ab-read' },
    h('div', { class: 'ab-vol' }, h('div', { class: 'ab-vol-l' }, trendEl), gauge, dp),
    h('div', { class: 'ab-iap' }, h('div', { class: 'ab-kv' }, h('span', {}, 'Abdominal pressure'), h('span', { class: 'ab-v' }, iapNum, iapWord)), iapBar),
    tiles);
  const ctl = h('div', { class: 'ab-ctl' },
    h('div', { class: 'ab-row' }, icon('drop'), h('span', { class: 'ab-txt' }, h('b', {}, 'Serum albumin')), h('span', { class: 'ab-end' }, sa.el)),
    diu);
  const el = h('div', { class: 'ab', 'data-pane': 'abdomen' }, h('div', { class: 'ab-main' }, read, ctl));
  // Every frame calls this, but a pane the learner is scrolling must not be touched when nothing changed: on a phone,
  // rewriting a text node or an attribute to the same value is enough to make the browser stop a scroll in flight.
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  const setAttr = (el, k, v) => { if (v == null) { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  const setData = (el, k, v) => { if (el.dataset[k] !== v) el.dataset[k] = v; };
  function update(f) {
    const a = f.metrics.ascites, p = store.get().params;
    setText(numEl, fmt(a.volume / 1000, 1));
    setText(gradeEl, GRADE[a.grade] || a.label); setAttr(gradeEl, 'title', GRADE_TIP[a.grade] || '');
    setData(gradeEl, 'sev', SEV[a.grade] || 'danger'); setData(bigEl, 'sev', SEV[a.grade] || 'danger');
    setAttr(diu, 'aria-checked', String(!!p.diuretics));
    diu.disabled = !(verbEnabled('drug:diuretics', 'drug:diuretics') || verbEnabled('drugs', 'drugs'));
    if (sa.get() !== p.albumin) sa.set(p.albumin);
    const r = a.ratePerDay, trend = Math.abs(r) < 20 ? 'steady' : r > 0 ? 'building up' : 'resolving';
    paintRate(r);
    setText(trendEl, `${r > 0 ? '+' : ''}${fmt(r, 0)} mL a day · ${trend}`);
    const sev = iapSev(a.iap);
    dial.set(a.iap);
    setText(iapNum, `${fmt(a.iap, 0)} mmHg`);
    setText(iapWord, `· ${a.iap >= 20 ? 'compartment syndrome' : a.iap >= 12 ? 'high' : 'normal'}`);
    setData(iapWord, 'sev', sev); setData(iapFill, 'sev', sev);
    const iw = `${Math.round(clamp(a.iap / 30, 0, 1) * 1000) / 10}%`;
    if (iapFill.style.width !== iw) iapFill.style.width = iw;
    setAttr(iapBar, 'aria-label', `Abdominal pressure ${fmt(a.iap, 0)} mmHg`);
    // SAAG from the rounded parts, so serum − ascitic always adds up on screen.
    const tapped = a.volume > 150;
    const r1 = (x) => Math.round(x * 10) / 10, saag = r1(r1(p.albumin) - r1(a.albumin));
    setText(saagV, tapped ? fmt(saag, 1) : '—'); setText(tpV, tapped ? fmt(a.totalProtein, 1) : '—'); setText(albV, tapped ? fmt(a.albumin, 1) : '—');
    setAttr(saagEl, 'title', tapped ? `SAAG ${fmt(p.albumin, 1)} − ${fmt(a.albumin, 1)} = ${fmt(saag, 1)} g/dL. ≥ 1.1 means portal hypertension.` : null);
    setText(why, a.volume < 1 ? 'No fluid to tap' : 'Too little fluid to tap');
    setAttr(tiles, 'data-empty', tapped ? null : '');
    if (hasFluid !== a.volume > 150) { hasFluid = a.volume > 150; paintVol(); }
    // Whole percents only: rewriting the height every frame would keep restarting its ease.
    const bh = `${Math.round(a.volume > 150 ? 15 + clamp(a.volume / 8000, 0, 1) * 70 : 0)}%`;
    if (bellyFill.style.height !== bh) bellyFill.style.height = bh;
  }
  return { id: 'abdomen', label: 'Ascites & paracentesis', el, update };
}
