// The pressure profile on a slide (deck visuals V1, package B): tool { kind: 'profile' } draws the slide's pressure from gut
// to heart through the Patients chart's eight stations (anatomy.js PROFILE_PATHS), the healthy line dashed beneath it, the
// liver's stations on a soft band and the HVPG and PPG as brackets under the names. Where the line drops steeply is where
// the resistance is, so presinusoidal, sinusoidal and postsinusoidal resistance look different on one chart.
// tool: { kind: 'profile', from: true } adds the state before this slide's as a faint dotted line ('slide id' for another).
// Its numbers are the slide's own (its fingerprint, as the tiles read it: the same on every screen), easing to each new
// state; a what-if slider or compare button moves it with the tiles. The Patients chart (charts.js) is not changed.

import { PROFILE_PATHS } from './anatomy.js?v=8374d8e213';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { RATE } from './table-marks.js?v=810c0a1575';
import { monotoneSegs } from './curve-near.js?v=9ff15157e9';
import { pressureColor } from './colormap.js?v=b2067d6101';

const PATH = PROFILE_PATHS[0];
export const STATIONS = PATH.nodes;
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
// Phone names: the clinical short forms, never an ellipsis.
export const SHORT_NAMES = { INT: 'Gut', CONF: 'PV', RPV: 'Venule', SIN_R: 'Sinusoid', CV_R: 'CV', RHV: 'HV', IVCS: 'IVC', RA: 'RA' };
// A station's reading where the tiles have one (so its number is the tile's), else the node's own pressure.
const AT_FP = { INT: 'int', CONF: 'pv', SIN_R: 'sin', CV_R: 'cv', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
export const SPANS = [['hvpg', 'HVPG', 'SIN_R', 'RHV'], ['ppg', 'PPG', 'CONF', 'IVCS']];

/** A fingerprint's profile: the eight stations' pressures (mmHg) in order, and its HVPG and PPG as the tiles give them;
 *  null without a fingerprint. */
export function profileOf(fp) {
  if (!fp) return null;
  const P = fp.at?.P;
  const v = STATIONS.map((n) => { const k = AT_FP[n], x = k && Number.isFinite(fp[k]) ? fp[k] : P ? P[NI[n]] : NaN; return Number.isFinite(x) ? +x : NaN; });
  if (v.some((x) => !Number.isFinite(x))) return null;
  return { v, hvpg: fp.hvpg, ppg: fp.ppg };
}

/** The axis's top: the highest point of the lines drawn, up to the next 5 (10 over 40), at least 15. */
export const axisTop = (...lines) => {
  const top = Math.max(15, ...lines.filter(Boolean).flatMap((l) => l.v));
  const step = top > 40 ? 10 : 5;
  return Math.ceil(top / step - 1e-9) * step;
};

/** How the station names fit slots px apart: full names on one row, else on two staggered rows, else the short names
 *  the same way. tw: a text's width in px. → { names, rows } */
export function nameFit(slot, tw) {
  const full = STATIONS.map((n) => PATH.names[n]), short = STATIONS.map((n) => SHORT_NAMES[n]);
  const widest = (ns) => Math.max(...ns.map(tw)) + 8;
  for (const [names, rows] of [[full, 1], [full, 2], [short, 1], [short, 2]]) if (widest(names) <= rows * slot) return { names, rows };
  return { names: short, rows: 2 };
}

/** The chart's layout for w × h px in type f px: margins, the plot, the name rows and the two bracket rows. */
export function profileGeo(w, h, f, tw) {
  const L = Math.ceil(tw('30') + 12), R = w - 10, slot = (R - L) / STATIONS.length, fit = nameFit(slot, tw);
  const keyH = 1.6 * f, T = keyH + 1.5 * f, nameH = fit.rows * 1.25 * f + 0.4 * f, brH = 1.55 * f;
  const B = Math.max(T + 3 * f, h - nameH - 2 * brH - 0.5 * f);
  const x = (i) => L + slot * (i + 0.5);
  return { w, h, f, L, R, T, B, slot, x, fit, keyH, nameY: (i) => B + 1.05 * f + (fit.rows > 1 && i % 2 ? 1.25 * f : 0), brY: (k) => B + nameH + brH * (k + 0.55) };
}

/** Where each station's value goes: above its dot, or under it where the line or a value already there is in the way
 *  (the lines as straight runs between their stations: the monotone curve keeps within them). pts: [[x, y]] of the line,
 *  others: other lines' points, tw: width; returns -1 (above) or 1 (under) per station. */
export function valueSides(pts, others, labels, f, tw, top) {
  const boxes = [], sides = [];
  const segs = [pts, ...others].flatMap((l) => l.slice(1).map((p, i) => [l[i], p]));
  const hits = (b) => segs.some(([[x0, y0], [x1, y1]]) => {
    if (x1 < b[0] || x0 > b[1]) return false;
    for (let s = 0; s <= 8; s++) { const x = b[0] + (b[1] - b[0]) * s / 8; if (x < x0 || x > x1) continue; const y = y0 + (y1 - y0) * (x - x0) / Math.max(1e-6, x1 - x0); if (y > b[2] - 2 && y < b[3] + 2) return true; }
    return false;
  });
  const near = (b) => boxes.some((o) => b[0] < o[1] + 2 && o[0] < b[1] + 2 && b[2] < o[3] + 2 && o[2] < b[3] + 2);
  pts.forEach(([x, y], i) => {
    const wd = tw(labels[i]) / 2, box = (s) => (s < 0 ? [x - wd, x + wd, y - 1.55 * f, y - 0.6 * f] : [x - wd, x + wd, y + 0.6 * f, y + 1.55 * f]);
    const fits = (s) => !hits(box(s)) && !near(box(s)) && (s > 0 || box(s)[2] >= top);
    const s = fits(-1) ? -1 : fits(1) ? 1 : -1;
    sides.push(s); boxes.push(box(s));
  });
  return sides;
}

/** The SVG path of the smooth line through pts (monotone: never overshoots a station). */
export function smoothD(pts) {
  const segs = monotoneSegs(pts), p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  if (!segs) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${p(x, y)}`).join('');
  return `M${p(pts[0][0], pts[0][1])}` + segs.map(([, , ax, ay, bx, by, x1, y1]) => `C${p(ax, ay)} ${p(bx, by)} ${p(x1, y1)}`).join('');
}

/** A bracket's label and where it goes: inside its span with a gap in the bar, else just past its right end, else before
 *  its left end. → { x, anchor, gap: [x0, x1] | null } */
export function bracketLabel(x0, x1, wd, R, L) {
  if (x1 - x0 - wd >= 20) { const m = (x0 + x1) / 2; return { x: m, anchor: 'middle', gap: [m - wd / 2 - 5, m + wd / 2 + 5] }; }
  if (x1 + 6 + wd <= R + 6) return { x: x1 + 6, anchor: 'start', gap: null };
  return { x: Math.max(L - 6, x0 - 6), anchor: 'end', gap: null };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
const lerp = (a, b, k) => a + (b - a) * k;
let mctx = null;
const textW = (t, f, wt = 600) => {
  if (mctx === null) mctx = (typeof document !== 'undefined' && document.createElement?.('canvas')?.getContext?.('2d')) || false;
  if (!mctx?.measureText) return t.length * f * 0.58;
  mctx.font = `${wt} ${f}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  return mctx.measureText(t).width;
};

export function createProfileTool() {
  const el = document.createElement('div');
  el.className = 'pz-prof';
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let goal = null, shown = null, ref = null, cfg = { from: null }, ctx0 = null, raf = 0, sides = null, size = '';
  // (The numbers drawn: the goal's, eased; the healthy and earlier lines as they are.)
  const healthy = () => profileOf(ctx0?.healthy?.());
  function before() {
    if (!cfg.from || !ctx0) return null;
    const slides = ctx0.deck?.slides || [];
    if (typeof cfg.from === 'string') return profileOf(ctx0.fpOf?.(cfg.from));
    for (let j = (ctx0.index ?? 0) - 1; j >= 0; j--) {
      const fp = slides[j]?.id ? ctx0.fpOf?.(slides[j].id) : null;
      if (fp && fp !== ctx0.fp) return profileOf(fp);
    }
    return null;
  }
  const size0 = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    // (The card zooms its contents on a Mac and an iPad: the type is set larger by as much, never under 12 px on the screen.)
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? 12 / z : 0);
    return [Math.max(200, w || 420), Math.max(10 * f, el.clientHeight || 240), f];
  };
  function draw() {
    if (!shown) { el.replaceChildren(); return; }
    const [w, hh, f] = size0(), tw = (t, wt) => textW(t, f, wt);
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const G = profileGeo(w, hh, f, tw), hl = healthy(), bf = ref;
    const top = shown.top, y = (v) => G.B - (G.B - G.T) * Math.max(0, Math.min(v, top)) / top;
    const pts = (p) => p.v.map((v, i) => [G.x(i), y(v)]);
    const now = pts(shown), labels = shown.v.map(one);
    // (Each value's side is settled once per state, from where the lines will end up, so it never flips while they glide.)
    const yg = (v) => G.B - (G.B - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
    if (!sides) sides = valueSides(ptsG(goal), [hl, bf].filter(Boolean).map(ptsG), goal.v.map(one), f, (t) => tw(t), G.T);
    const step = top > 40 ? 10 : 5, every = (G.B - G.T) / (top / step) < 1.3 * f ? 2 * step : step;
    const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
    const col = (v) => pressureColor(v);
    const gid = `pzpg-${Math.random().toString(36).slice(2, 8)}`;
    const key = [['Now', 'now'], ['Healthy', 'hl'], ...(bf ? [['Before', 'bf']] : [])];
    let kx = G.R;
    const keyEls = key.slice().reverse().map(([t, c]) => { const tx = kx; kx -= tw(t, 500) + 30; return sv('g', { class: `ppf-key ${c}` },
      sv('line', { x1: tx - tw(t, 500) - 24, x2: tx - tw(t, 500) - 6, y1: 0.75 * f, y2: 0.75 * f }), sv('text', { x: tx, y: 0.75 * f + 0.36 * f, 'text-anchor': 'end' }, t)); });
    const svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `Pressure from gut to heart: ${STATIONS.map((n, i) => `${PATH.names[n]} ${labels[i]}`).join(', ')} mmHg. HVPG ${one(shown.hvpg)}, PPG ${one(shown.ppg)}.` },
      sv('defs', {}, sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: G.x(0), x2: G.x(STATIONS.length - 1), y1: 0, y2: 0 },
        shown.v.map((v, i) => sv('stop', { offset: (i / (STATIONS.length - 1)).toFixed(3), 'stop-color': col(v) })))),
      // The liver's stations on a soft band, named over the plot.
      i0 >= 0 ? sv('g', { class: 'ppf-liver' }, sv('rect', { x: G.x(i0) - G.slot / 2, width: G.slot * (i1 - i0 + 1), y: G.T - 1.3 * f, height: G.B - G.T + 1.3 * f }),
        sv('text', { x: (G.x(i0) + G.x(i1)) / 2, y: G.T - 0.35 * f, 'text-anchor': 'middle' }, 'LIVER')) : null,
      Array.from({ length: Math.floor(top / every) + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: G.L, x2: G.R, y1: y(k * every), y2: y(k * every) }),
        sv('text', { x: G.L - 6, y: y(k * every) + 0.35 * f, 'text-anchor': 'end' }, String(k * every)))),
      sv('text', { class: 'ptk-unit', x: 0, y: 0.75 * f + 0.36 * f }, 'mmHg'),   // (the unit at the top left, on the key's row)
      keyEls,
      hl ? sv('path', { class: 'ppf-hl', d: smoothD(pts(hl)) }) : null,
      bf ? sv('path', { class: 'ppf-bf', d: smoothD(pts(bf)) }) : null,
      sv('path', { class: 'ppf-fill', d: `${smoothD(now)}L${G.x(STATIONS.length - 1).toFixed(1)} ${G.B}L${G.x(0).toFixed(1)} ${G.B}Z`, style: `fill: url(#${gid})` }),
      sv('path', { class: 'ppf-line', d: smoothD(now), style: `stroke: url(#${gid})` }),
      now.map(([cx, cy], i) => sv('circle', { class: 'ppf-dot', cx, cy, r: Math.max(4, 0.36 * f), style: `fill: ${col(shown.v[i])}` })),
      now.map(([cx, cy], i) => sv('text', { class: 'ppf-v', x: cx, y: sides[i] < 0 ? cy - 0.75 * f : cy + 1.45 * f, 'text-anchor': 'middle' }, labels[i])),
      sv('line', { class: 'ppf-axis', x1: G.L, x2: G.R, y1: G.B, y2: G.B }),
      STATIONS.map((n, i) => sv('text', { class: 'ppf-name', x: G.x(i), y: G.nameY(i), 'text-anchor': 'middle' }, G.fit.names[i])),
      // The HVPG (wedged − free hepatic vein) and PPG (portal vein − IVC) as brackets, in their cut-off colours.
      SPANS.map(([k, name, a, b], r) => {
        const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), yy = G.brY(r), v = shown[k], txt = `${name} ${one(v)}`;
        const lb = bracketLabel(x0, x1, tw(txt, 700), G.R, G.L), bar = lb.gap ? `M${x0} ${yy}H${lb.gap[0]}M${lb.gap[1]} ${yy}H${x1}` : `M${x0} ${yy}H${x1}`;
        return sv('g', { class: 'ppf-br', 'data-rate': RATE[k](v)[0], 'data-k': k },
          sv('path', { d: `M${x0} ${yy - 0.3 * f}V${yy + 0.3 * f}M${x1} ${yy - 0.3 * f}V${yy + 0.3 * f}${bar}` }),
          sv('text', { x: lb.x, y: yy + 0.36 * f, 'text-anchor': lb.anchor }, sv('tspan', { class: 'k' }, `${name} `), one(v)));
      }));
    el.replaceChildren(svg);
  }
  function tick() {
    raf = 0;
    if (!goal) return;
    const k = reduceMQ.matches || !shown ? 1 : 0.2;
    const mix = (a, b) => lerp(a, b, k);
    shown = shown ? { v: shown.v.map((x, i) => mix(x, goal.v[i])), hvpg: mix(shown.hvpg, goal.hvpg), ppg: mix(shown.ppg, goal.ppg), top: mix(shown.top, goal.top) } : { ...goal };
    const done = shown.v.every((x, i) => Math.abs(x - goal.v[i]) < 0.02) && Math.abs(shown.top - goal.top) < 0.05;
    if (done) shown = { ...goal, v: goal.v.slice() };
    if (el.isConnected || !done) draw();
    if (!done) raf = requestAnimationFrame(tick);
  }
  function aim(fp) {
    const p = profileOf(fp);
    if (!p) return;
    ref = before();
    goal = { ...p, top: axisTop(p, healthy(), ref) };
    sides = null;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { sides = null; draw(); } }).observe(el);
  return {
    el,
    /** The slide's options and context (presenter-tools.js show), before its numbers. */
    configure(t, ctx) { cfg = { from: t?.from ?? null }; ctx0 = ctx || null; if (ctx?.fp) aim(ctx.fp); },
    /** The numbers the slide's tiles show: the slide's state, or a what-if slider's or a compare button's. */
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    clear() {},
    dispose() { if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
