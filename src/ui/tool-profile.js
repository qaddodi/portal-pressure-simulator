// The pressure profile on a slide (deck visuals V1, package B): tool { kind: 'profile' } draws the slide's pressure from gut
// to heart through the Patients chart's eight stations (anatomy.js PROFILE_PATHS), the healthy line dashed beneath it, the
// liver's stations on a soft band, the PPG as a bracket under the names and the HVPG where it is measured: the wedged
// hepatic vein pressure as a ring over the hepatic vein's own (free) dot, a bracket between them with its value. Where the
// line drops steeply is where the resistance is, so presinusoidal, sinusoidal and postsinusoidal resistance look different.
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

/** A fingerprint's profile: the eight stations' pressures (mmHg) in order, its HVPG and PPG as the tiles give them and the
 *  wedged hepatic vein pressure (w) the HVPG is measured from; null without a fingerprint. */
export function profileOf(fp) {
  if (!fp) return null;
  const P = fp.at?.P;
  const v = STATIONS.map((n) => { const k = AT_FP[n], x = k && Number.isFinite(fp[k]) ? fp[k] : P ? P[NI[n]] : NaN; return Number.isFinite(x) ? +x : NaN; });
  if (v.some((x) => !Number.isFinite(x))) return null;
  return { v, hvpg: fp.hvpg, ppg: fp.ppg, w: Number.isFinite(fp.whvp) ? +fp.whvp : null };
}

/** The axis's top: the highest point of the lines drawn and 2 mmHg over it (room for its value above it, as the app's
 *  charts keep), up to the next 5 (10 over 40), at least 15. */
export const axisTop = (...lines) => {
  const hi = Math.max(...lines.filter(Boolean).flatMap((l) => l.v)), top = Math.max(15, hi + 2);
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

/** The lines as fine polylines (the smooth curves drawn, not their chords), for the labels to keep clear of. */
export function curveRuns(lines) {
  return lines.map((pts) => {
    const segs = monotoneSegs(pts);
    if (!segs) return pts;
    const out = [pts[0]];
    for (const [x0, y0, ax, ay, bx, by, x1, y1] of segs) for (let k = 1; k <= 10; k++) {
      const t = k / 10, u = 1 - t;
      out.push([u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1]);
    }
    return out;
  });
}

/** A placer for labels: boxes [x0, x1, y0, y1] inside [top, bottom], [gx, gy] clear of every box placed before and clear
 *  of the given obstacles (hard), and as clear as can be of the lines (runs: polylines, each with its weight: the slide's
 *  own line counts most). free(b): nothing in the way; cost(b): the weight of the lines it touches, Infinity where it may not go. */
export function labelPlacer(runs, obstacles, top, bottom, weights = [], [gx, gy] = [9, 6]) {
  const segs = runs.flatMap((l, k) => l.slice(1).map((p, i) => [l[i], p, weights[k] ?? 1]));
  const boxes = [];
  const lineCost = (b) => {
    let c = 0;
    const hit = new Set();
    for (const [[x0, y0], [x1, y1], wt] of segs) {
      if (hit.has(wt) || Math.max(x0, x1) < b[0] - 3 || Math.min(x0, x1) > b[1] + 3) continue;
      // (The piece of the segment inside the box's x span, padded, against its y span: a steep drop counts too.)
      const xa = Math.max(Math.min(x0, x1), b[0] - 3), xb = Math.min(Math.max(x0, x1), b[1] + 3);
      const yAt = (x) => (x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0));
      const ya = x1 === x0 ? Math.min(y0, y1) : Math.min(yAt(xa), yAt(xb)), yb = x1 === x0 ? Math.max(y0, y1) : Math.max(yAt(xa), yAt(xb));
      if (yb > b[2] - 3 && ya < b[3] + 3) { hit.add(wt); c += wt; }
    }
    return c;
  };
  // (Values gx apart side by side and gy over each other, as each one's halo is drawn outside its box; the dots and marks
  // 2 px.)
  const near = (b) => boxes.some((o) => b[0] < o[1] + gx && o[0] < b[1] + gx && b[2] < o[3] + gy && o[2] < b[3] + gy)
    || obstacles.some((o) => b[0] < o[1] + 2 && o[0] < b[1] + 2 && b[2] < o[3] + 2 && o[2] < b[3] + 2);
  const cost = (b) => (b[2] < top || b[3] > bottom || near(b) ? Infinity : lineCost(b));
  // (Where no place may be had: how much it overlaps, counting the gaps, so the least crowded one can be taken.)
  const ov = (b, o, g, h) => Math.max(0, Math.min(b[1], o[1]) - Math.max(b[0], o[0]) + g) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[2], o[2]) + h);
  const crowd = (b) => (b[2] < top || b[3] > bottom ? 1e9 : 0) + boxes.reduce((a, o) => a + ov(b, o, gx, gy), 0) + obstacles.reduce((a, o) => a + ov(b, o, 2, 2), 0);
  return { boxes, cost, crowd, lineCost, free: (b) => cost(b) === 0, take(b) { boxes.push(b); } };
}

/** Where each value goes: above its point, or under it, or a little to either side, where nothing is in the way (the lines
 *  as drawn, the dots, the other values, the axis); where no place is clear of every line, the one that touches the least
 *  of them (never the slide's own line if it can help it; the value's halo masks a reference line under it). pts: [[x, y]]
 *  of the line, others: other lines' points, extra: [[x, y]] points off the line with a value (labels follows pts then
 *  extra), dots: [x, y, r], obstacles: more boxes to keep clear of. → [{ s: -1 above | 1 under | 0 beside, dx }] */
export function valueSides(pts, others, labels, f, tw, top, { bottom = Infinity, left = -Infinity, right = Infinity, extra = [], dots = [], dotR = 0.36 * f, obstacles = [] } = {}) {
  const P = curveRuns([pts, ...others]);
  const place = labelPlacer(P, [...dots.map(([x, y, r]) => [x - r + 1.5, x + r - 1.5, y - r + 1.5, y + r - 1.5]), ...obstacles], top, bottom, [4, ...others.map(() => 1)], [0.6 * f, 0.4 * f]);   // (in type sizes: the card's zoom shrinks the chart's px)
  const all = [...pts, ...extra];
  const sides = all.map(([x, y], i) => {
    const wd = tw(labels[i]) / 2, sd = dotR + 5 + wd;
    const box = (s, dx, dy = 0) => (s < 0 ? [x + dx - wd, x + dx + wd, y + dy - 1.55 * f, y + dy - 0.6 * f] : s > 0 ? [x + dx - wd, x + dx + wd, y + dy + dotR + 2, y + dy + dotR + 2 + 0.95 * f]
      : [x + dx - wd, x + dx + wd, y + dy - 0.42 * f, y + dy + 0.42 * f]);
    // (A value reads as its own dot's: its middle nearer that dot than any other.)
    const mine = (b) => { const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2, d = Math.hypot(cx - x, cy - y);
      return all.every(([ox, oy], j) => j === i || Math.hypot(cx - ox, cy - oy) > d); };
    const fits = (b) => b[0] >= left && b[1] <= right && mine(b);
    // (s 0: beside its dot, at its height, left or right; then a little up or down beside it, past a mark beside it (the
    // HVPG's bracket), or a line further off.)
    const tries = [[-1, 0], [1, 0], ...[0.45, 0.9].flatMap((k) => [[-1, k * wd], [-1, -k * wd], [1, k * wd], [1, -k * wd]]), [0, sd], [0, -sd],
      ...[-0.7, 0.7].flatMap((k) => [[0, sd, k * f], [0, -sd, k * f]]), [0, sd + 5, -0.7 * f], [0, -sd - 5, -0.7 * f], [-1, 0, -0.8 * f], [1, 0, 0.8 * f], [-1, 0.9 * wd, -0.8 * f], [-1, -0.9 * wd, -0.8 * f], [1, 0.9 * wd, 0.8 * f], [1, -0.9 * wd, 0.8 * f]];
    let best = tries[0], bc = Infinity;
    for (const t of tries) { const c = fits(box(...t)) ? place.cost(box(...t)) : Infinity; if (c < bc) { bc = c; best = t; } if (c === 0) break; }
    // (Nowhere clear: the least crowded place, never on its own line where another place will do.)
    if (bc === Infinity) {
      const inX = (b) => b[0] >= left && b[1] <= right, ok = tries.filter((t) => inX(box(...t))), pool = ok.length ? ok : tries;
      const score = (t) => { const b = box(...t); return place.crowd(b) + (place.lineCost(b) >= 4 ? 1e8 : 0) + (mine(b) ? 0 : 1e7); };
      best = pool.reduce((a, t) => (score(t) < score(a) ? t : a), pool[0]);
    }
    const [s, dx, dy = 0] = best;
    place.take(box(s, dx, dy));
    return { s, dx, dy };
  });
  sides.place = place;   // (for more labels to keep clear of these)
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
    const now = pts(shown), labels = shown.v.map(one), dotR = Math.max(4, 0.36 * f);
    // The HVPG is measured in the hepatic vein: the wedged pressure (a ring) over the free one (the vein's own dot), the
    // gradient a bracket between the two, so its number is the difference of the two values written beside them.
    const hv = STATIONS.indexOf('RHV'), hasW = Number.isFinite(goal.w) && Number.isFinite(shown.w), hx = G.x(hv);
    // (Each value's place is settled once per state, from where the lines will end up, so it never flips while they glide.)
    const yg = (v) => G.B - (G.B - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
    if (!sides) {
      const pg = ptsG(goal);
      sides = valueSides(pg, [hl, bf].filter(Boolean).map(ptsG), [...goal.v.map(one), ...(hasW ? [one(goal.w)] : [])], f, (t) => tw(t), G.T - 0.2 * f,
        { bottom: G.B - 1, left: G.L + 2, right: G.R + 8, dotR, obstacles: hasW ? [[hx + dotR + 1, hx + dotR + 8, Math.min(yg(goal.w), pg[hv][1]) - 2, Math.max(yg(goal.w), pg[hv][1]) + 2]] : [], extra: hasW ? [[hx, yg(goal.w)]] : [], dots: [...pg.map(([x, yy]) => [x, yy, dotR + 1]), ...(hasW ? [[hx, yg(goal.w), dotR + 2.5]] : [])] });
      sides.hvpgAt = null;
      if (hasW) {
        // (The HVPG's own label: beside its bracket, right then left, at its middle or a little up or down; else in the
        // bracket row under the hepatic vein.)
        const txt = `HVPG ${one(goal.hvpg)}`, wd = tw(txt, 700), bx = hx + dotR + 6, ym = (yg(goal.w) + yg(goal.v[hv])) / 2;
        for (const dy of [0, -0.6, 0.6, -1.2, 1.2, -1.8].map((k) => k * f)) {
          const r = [bx + 5, bx + 5 + wd, ym + dy - 0.55 * f, ym + dy + 0.45 * f], l = [hx - dotR - 6 - wd, hx - dotR - 6, r[2], r[3]];
          const hit = r[1] <= G.R + 8 && sides.place.free(r) ? [r, 'start'] : l[0] >= G.L && sides.place.free(l) ? [l, 'end'] : null;
          if (hit) { sides.place.take(hit[0]); sides.hvpgAt = { dy, anchor: hit[1] }; break; }
        }
      }
    }
    const step = top > 40 ? 10 : 5, every = (G.B - G.T) / (top / step) < 1.3 * f ? 2 * step : step;
    const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
    const col = (v) => pressureColor(v);
    const gid = `pzpg-${Math.random().toString(36).slice(2, 8)}`;
    const key = [['Now', 'now'], ['Healthy', 'hl'], ...(bf ? [['Before', 'bf']] : []), ...(hasW ? [['Wedged', 'w']] : [])];
    let kx = G.R;
    const keyW = key.reduce((a, [t]) => a + tw(t, 500) + 30, 0), unitOnKey = G.R - keyW >= tw('mmHg', 500) + 6;
    const keyEls = key.slice().reverse().map(([t, c]) => { const tx = kx, gx = tx - tw(t, 500) - 6; kx -= tw(t, 500) + 30; return sv('g', { class: `ppf-key ${c}` },
      c === 'w' ? sv('circle', { cx: gx - 6, cy: 0.75 * f, r: dotR }) : sv('line', { x1: gx - 18, x2: gx, y1: 0.75 * f, y2: 0.75 * f }),
      sv('text', { x: tx, y: 0.75 * f + 0.36 * f, 'text-anchor': 'end' }, t)); });
    const valY = (cy, k) => (sides[k].dy || 0) + (sides[k].s < 0 ? cy - 0.75 * f : sides[k].s > 0 ? cy + dotR + 2 + 0.85 * f : cy + 0.36 * f);
    const yw = hasW ? y(shown.w) : 0, yf = now[hv]?.[1], bx = hx + dotR + 6, hvRate = RATE.hvpg(shown.hvpg)[0];
    const hvpgTxt = (x, yy, anchor) => sv('text', { x, y: yy, 'text-anchor': anchor }, sv('tspan', { class: 'k' }, 'HVPG '), one(shown.hvpg));
    const vert = hasW ? sv('g', { class: 'ppf-br', 'data-rate': hvRate, 'data-k': 'hvpg' },
      sv('path', { d: `M${bx - 3} ${yw}H${bx}V${yf}H${bx - 3}` }),
      sides.hvpgAt ? hvpgTxt(sides.hvpgAt.anchor === 'start' ? bx + 5 : hx - dotR - 6, (yw + yf) / 2 + sides.hvpgAt.dy + 0.36 * f, sides.hvpgAt.anchor) : null) : null;
    const svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `Pressure from gut to heart: ${STATIONS.map((n, i) => `${PATH.names[n]} ${labels[i]}`).join(', ')} mmHg.${hasW ? ` Wedged hepatic vein ${one(shown.w)}.` : ''} HVPG ${one(shown.hvpg)}, PPG ${one(shown.ppg)}.` },
      sv('defs', {}, sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: G.x(0), x2: G.x(STATIONS.length - 1), y1: 0, y2: 0 },
        shown.v.map((v, i) => sv('stop', { offset: (i / (STATIONS.length - 1)).toFixed(3), 'stop-color': col(v) })))),
      // The liver's stations on a soft band, named over the plot.
      i0 >= 0 ? sv('g', { class: 'ppf-liver' }, sv('rect', { x: G.x(i0) - G.slot / 2, width: G.slot * (i1 - i0 + 1), y: G.T - 1.3 * f, height: G.B - G.T + 1.3 * f }),
        sv('text', { x: (G.x(i0) + G.x(i1)) / 2, y: G.T - 0.35 * f, 'text-anchor': 'middle' }, 'LIVER')) : null,
      Array.from({ length: Math.floor(top / every) + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: G.L, x2: G.R, y1: y(k * every), y2: y(k * every) }),
        sv('text', { x: G.L - 6, y: y(k * every) + 0.35 * f, 'text-anchor': 'end' }, String(k * every)))),
      // (The unit at the top left, on the key's row; over the axis's numbers when the key needs the row.)
      sv('text', { class: 'ptk-unit', x: 0, y: unitOnKey ? 0.75 * f + 0.36 * f : G.T - 0.95 * f }, 'mmHg'),
      keyEls,
      hl ? sv('path', { class: 'ppf-hl', d: smoothD(pts(hl)) }) : null,
      bf ? sv('path', { class: 'ppf-bf', d: smoothD(pts(bf)) }) : null,
      sv('path', { class: 'ppf-fill', d: `${smoothD(now)}L${G.x(STATIONS.length - 1).toFixed(1)} ${G.B}L${G.x(0).toFixed(1)} ${G.B}Z`, style: `fill: url(#${gid})` }),
      sv('line', { class: 'ppf-axis', x1: G.L, x2: G.R, y1: G.B, y2: G.B }),
      sv('path', { class: 'ppf-line', d: smoothD(now), style: `stroke: url(#${gid})` }),
      vert,
      hasW ? sv('circle', { class: 'ppf-w', cx: hx, cy: yw, r: dotR + 1 }) : null,
      now.map(([cx, cy], i) => sv('circle', { class: 'ppf-dot', cx, cy, r: dotR, style: `fill: ${col(shown.v[i])}` })),
      now.map(([cx, cy], i) => sv('text', { class: 'ppf-v', x: cx + sides[i].dx, y: valY(cy, i), 'text-anchor': 'middle' }, labels[i])),
      hasW ? sv('text', { class: 'ppf-v w', x: hx + sides[now.length].dx, y: valY(yw, now.length), 'text-anchor': 'middle' }, one(shown.w)) : null,
      STATIONS.map((n, i) => sv('text', { class: 'ppf-name', x: G.x(i), y: G.nameY(i), 'text-anchor': 'middle' }, G.fit.names[i])),
      // The PPG (portal vein − IVC) as a bracket under the names, in its cut-off colours; the HVPG's too when it has no
      // wedged reading to stand on, or its label no room beside its own bracket.
      SPANS.map(([k, name, a, b], r) => {
        const v = shown[k], rate = RATE[k](v)[0];
        if (hasW) r = k === 'ppg' ? 0 : 1;   // (the PPG takes the first row when the HVPG has its own bracket)
        if (k === 'hvpg' && hasW) {
          if (sides.hvpgAt) return null;
          const yy = G.brY(r);
          return sv('g', { class: 'ppf-br', 'data-rate': rate, 'data-k': k }, hvpgTxt(hx, yy + 0.36 * f, 'middle'));
        }
        const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), yy = G.brY(r), txt = `${name} ${one(v)}`;
        const lb = bracketLabel(x0, x1, tw(txt, 700), G.R, G.L), bar = lb.gap ? `M${x0} ${yy}H${lb.gap[0]}M${lb.gap[1]} ${yy}H${x1}` : `M${x0} ${yy}H${x1}`;
        return sv('g', { class: 'ppf-br', 'data-rate': rate, 'data-k': k },
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
    shown = shown ? { v: shown.v.map((x, i) => mix(x, goal.v[i])), hvpg: mix(shown.hvpg, goal.hvpg), ppg: mix(shown.ppg, goal.ppg), top: mix(shown.top, goal.top),
      w: Number.isFinite(goal.w) ? mix(Number.isFinite(shown.w) ? shown.w : goal.w, goal.w) : null } : { ...goal };
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
