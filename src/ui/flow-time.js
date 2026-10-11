// Portal pressure and portal flow around a meal, on one chart (the presenter's flow-time tool). Flow sits in the upper
// band on its own tight scale (L/min, right) so its rise reads clearly; pressure sits in the lower band on a scale from
// zero (mmHg, left), so its small rise reads as small. The two never cross.
// Time is a teaching scale in minutes: a fasting baseline before the meal (a dashed line at 0), the slide's time-lapse
// spread over the rise, then the state it reaches held to the end. The values are the model's own: the off-screen chain
// keeps the portal pressure and flow on each day of the time-lapse (worker-core's trail), read here once a minute
// (straight between days). The lines draw from left to right as the time-lapse plays, easing after its clock.

// (No imports: the series and scales load in Node for the unit tests. Every value here is positive.)
const fmt = (v, d) => v.toFixed(d), clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Minutes on the teaching clock: fasting from `from` to 0, the rise over `rise`, the state reached held to `end`.
export const MINUTES = { from: -10, rise: 30, end: 40 };
const NICE = [1, 2, 2.5, 5, 10];
const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))); return NICE.find((s) => s * p >= raw - 1e-9) * p; };
const ticksOf = (lo, hi, step) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => +(lo + k * step).toPrecision(6));
// Flow: a tight scale around its values (about four steps), so the rise fills most of its band.
function flowScale(v) {
  const a = Math.min(...v), b = Math.max(...v), step = niceStep(Math.max(1e-6, (b - a) / 4));
  const lo = Math.max(0, Math.floor(a / step + 1e-9) * step), hi = Math.ceil(b / step - 1e-9) * step;
  const ticks = ticksOf(lo, hi, step);
  return { min: ticks[0], max: ticks.at(-1), ticks };
}
// Pressure: from zero, so its rise keeps its true size.
function pressureScale(v) {
  const top = Math.max(...v), step = niceStep(top / 2), ticks = ticksOf(0, Math.ceil(top / step - 1e-9) * step, step);
  return { min: 0, max: ticks.at(-1), ticks };
}

/** trail: [[day, pv, pvFlow], ...] → { min (minutes), pv, flow, one value a minute from MINUTES.from to .end, and each
 *  one's scale }. The trail's first day is the meal (0 min), its last the end of the rise. */
export function flowTimeSeries(trail) {
  const pts = (trail || []).filter((r) => r && Number.isFinite(r[1]) && Number.isFinite(r[2]));
  if (pts.length < 2) return null;
  const d0 = pts[0][0], span = Math.max(1e-6, pts.at(-1)[0] - d0);
  const at = (j, m) => {
    const d = d0 + span * clamp(m / MINUTES.rise, 0, 1), k = clamp(pts.findIndex((r) => r[0] >= d), 1, pts.length - 1);
    const f = clamp((d - pts[k - 1][0]) / Math.max(1e-9, pts[k][0] - pts[k - 1][0]), 0, 1);
    return pts[k - 1][j] + (pts[k][j] - pts[k - 1][j]) * f;
  };
  const min = Array.from({ length: MINUTES.end - MINUTES.from + 1 }, (_, k) => MINUTES.from + k);
  const pv = min.map((m) => at(1, m)), flow = min.map((m) => at(2, m));
  return { min, pv, flow, pScale: pressureScale(pv), fScale: flowScale(flow) };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
// The plot: flow's band at the top, pressure's below it, the minutes under both.
const W = 420, L = 40, R = W - 52, T = 80, B = 276, H = 306, FB = [T, 176], PB = [204, B];
const LINES = [['pv', 'pScale', PB, '--tr-pv', 'Portal pressure', 'mmHg', 1], ['flow', 'fScale', FB, '--tr-hv', 'Portal flow', 'L/min', 2]];
const dec = (sc) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);

export function createFlowTime() {
  const el = document.createElement('div');
  el.className = 'pz-flowtime';
  let ser = null, parts = null, shown = 0, goal = 0, raf = 0, sig = '';
  const X = (m) => L + (R - L) * (m - MINUTES.from) / (MINUTES.end - MINUTES.from);
  const Yof = (band, sc) => (v) => band[1] - (band[1] - band[0]) * clamp((v - sc.min) / (sc.max - sc.min), 0, 1);
  const val = (arr, m) => { const j = clamp(Math.floor(m - MINUTES.from), 0, arr.length - 2); return arr[j] + (arr[j + 1] - arr[j]) * clamp(m - MINUTES.from - j, 0, 1); };
  function build() {
    const lines = LINES.map(([k, s, band, c, , unit, d]) => ({ k, unit, d, Y: Yof(band, ser[s]),
      path: sv('path', { class: 'ptk-line', style: `stroke: var(${c})` }),
      dot: sv('circle', { class: 'pft-dot', r: 6.5, style: `fill: var(${c})` }),
      val: sv('text', { class: 'pft-v', style: `fill: var(${c})` }) }));
    // The fasting values at the start: flow's under its line, pressure's over its line (the gap between the bands).
    const start = lines.map((l) => { const v = ser[l.k][0], y = l.Y(v);
      return [sv('circle', { class: 'pft-start', cx: X(MINUTES.from), cy: y, r: 4.5, style: `stroke: var(${LINES.find((x) => x[0] === l.k)[3]})` }),
        sv('text', { class: 'pft-v0', x: X(MINUTES.from) + 2, y: l.k === 'flow' ? y + 20 : y - 10, style: `fill: var(${LINES.find((x) => x[0] === l.k)[3]})` }, `${fmt(v, l.d)} ${l.unit}`)]; });
    const [lp, lf] = lines;
    // Each band's gridlines, its numbers on its own side in its own colour.
    // (Five or more lines: every other one numbered, so the numbers never crowd.)
    const grid = (sc, Y, x, anchor, c) => sc.ticks.map((v, j) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: Y(v), y2: Y(v) }),
      sc.ticks.length > 4 && (sc.ticks.length - 1 - j) % 2 ? null : sv('text', { x, y: Y(v) + 5, 'text-anchor': anchor, style: `fill: var(${c})` }, fmt(v, dec(sc)))));
    const legend = LINES.map(([, , , c, name, unit], k) => sv('g', { class: 'pft-key', transform: `translate(${k ? R : L} 0)` },
      sv('line', { x1: k ? -24 : 0, x2: k ? 0 : 24, y1: 16, y2: 16, style: `stroke: var(${c})` }),
      sv('text', { x: k ? -32 : 32, y: 21, 'text-anchor': k ? 'end' : 'start', style: `fill: var(${c})` }, name),
      sv('text', { class: 'ptk-ax', x: k ? -32 : 32, y: 40, 'text-anchor': k ? 'end' : 'start' }, `${unit}, ${k ? 'right' : 'left'}`)));
    const mins = [];
    for (let m = MINUTES.from; m <= MINUTES.end; m += 10) mins.push(m);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' },
      grid(ser.fScale, lf.Y, R + 8, 'start', '--tr-hv'), grid(ser.pScale, lp.Y, L - 8, 'end', '--tr-pv'), legend,
      sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      mins.map((m) => sv('text', { class: 'pft-tk', x: X(m), y: B + 22, 'text-anchor': 'middle' }, m > 0 ? `+${m}` : m < 0 ? `−${-m}` : '0')),
      sv('text', { class: 'ptk-ax', x: R + 8, y: B + 5 }, 'min'),
      // Fasting, then the meal: a dashed line at 0 min.
      sv('text', { class: 'pft-t', x: (X(MINUTES.from) + X(0)) / 2, y: T - 14, 'text-anchor': 'middle' }, 'Fasting'),
      sv('line', { class: 'pft-meal', x1: X(0), x2: X(0), y1: T - 30, y2: B }),
      sv('text', { class: 'pft-t meal', x: X(0) + 7, y: T - 14 }, 'Meal'),
      lines.map((l) => l.path), start, lines.map((l) => [l.dot, l.val]));
    return { svg, lines };
  }
  // Draw the lines up to minute m, each line's value over its head (flipped left near the right edge).
  function paint(m) {
    if (!parts) return;
    const heads = parts.lines.map((l) => {
      const arr = ser[l.k], p = ser.min.filter((x) => x < m).map((x, j) => [X(x), l.Y(arr[j])]);
      p.push([X(m), l.Y(val(arr, m))]);
      l.path.setAttribute('d', p.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''));
      const [hx, hy] = p.at(-1), v = val(arr, m), left = hx > R - 100;
      l.dot.setAttribute('cx', hx.toFixed(1)); l.dot.setAttribute('cy', hy.toFixed(1));
      l.val.setAttribute('x', (hx + (left ? -10 : 10)).toFixed(1)); l.val.setAttribute('y', (hy - 12).toFixed(1));
      l.val.setAttribute('text-anchor', left ? 'end' : 'start');
      l.val.textContent = `${fmt(v, l.d)} ${l.unit}`;
      l.val.classList.toggle('off', m < 8);   // (near the start the fasting value is already there)
      return v;
    });
    parts.svg.setAttribute('aria-label', `Portal pressure and flow around a meal: pressure ${fmt(ser.pv[0], 1)} to ${fmt(heads[0], 1)} mmHg, flow ${fmt(ser.flow[0], 2)} to ${fmt(heads[1], 2)} L/min`);
  }
  // The heads glide after the goal (never a jump).
  function tick() {
    raf = 0;
    shown += (goal - shown) * (matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.16);
    if (Math.abs(goal - shown) < 0.05) shown = goal;
    paint(shown);
    if (shown !== goal) raf = requestAnimationFrame(tick);
  }
  // k: how far along the time-lapse (0 to 1): its minutes on the rise; once it has ended, the held state to the end.
  const minuteOf = (k) => (k >= 1 ? MINUTES.end : MINUTES.rise * clamp(k, 0, 1));
  return {
    el,
    /** trail: the time-lapse's [[day, pv, pvFlow]] (null: not computed yet; undefined: keep the one drawn);
     *  k: how far along it to draw (0 to 1). A new trail fades in over the old chart. */
    set(trail, k = 1) {
      const s2 = trail === undefined ? sig : trail ? JSON.stringify([trail[0], trail.at(-1)]) : '';
      if (s2 !== sig) {
        sig = s2; ser = flowTimeSeries(trail);
        const old = [...el.children];
        parts = ser ? build() : null;
        if (parts) {
          parts.svg.classList.add('in'); el.append(parts.svg);
          requestAnimationFrame(() => requestAnimationFrame(() => parts?.svg.classList.remove('in')));
        }
        setTimeout(() => old.forEach((o) => o.remove()), 480);
        shown = goal = minuteOf(k); paint(shown);
        return;
      }
      goal = minuteOf(k);
      if (!raf) raf = requestAnimationFrame(tick);
    },
    update() {}, clear() {},
  };
}
