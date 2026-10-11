// Portal pressure and portal flow over a time-lapse, on one chart (the presenter's flow-time tool): pressure on the
// left scale (mmHg), flow on the right (L/min), the time-lapse's start and end words under it ('Fasting', 'After a meal').
// The series are the model's own: the off-screen chain keeps the portal pressure and flow on each day of the slide's
// time-lapse (worker-core's trail). The lines draw from left to right as the time-lapse plays, easing after its clock.

// (No imports: the series and scales load in Node for the unit tests. Every value here is positive.)
const fmt = (v, d) => v.toFixed(d), clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// A nice scale for a series: four steps, its first value about halfway up (so a rise reads against where it started)
// and its highest value well under the top.
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function scale(vals) {
  const top = Math.max(2 * vals[0], 1.15 * Math.max(...vals), 1e-6) / 4, p = Math.pow(10, Math.floor(Math.log10(top)));
  const step = STEPS.find((s) => s * p >= top - 1e-9) * p;
  const ticks = [0, 1, 2, 3, 4].map((k) => +(k * step).toPrecision(6));
  return { max: ticks[4], ticks };
}

/** trail: [[day, pv, pvFlow], ...] → { t (0 to 1 along the time-lapse), pv, flow, and each one's scale }. */
export function flowTimeSeries(trail) {
  const pts = (trail || []).filter((r) => r && Number.isFinite(r[1]) && Number.isFinite(r[2]));
  if (pts.length < 2) return null;
  const d0 = pts[0][0], span = Math.max(1e-6, pts.at(-1)[0] - d0);
  const pv = pts.map((r) => r[1]), flow = pts.map((r) => r[2]);
  return { t: pts.map((r) => (r[0] - d0) / span), pv, flow, pScale: scale(pv), fScale: scale(flow) };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
const W = 420, L = 44, R = W - 48, T = 54, B = 236, H = 274;
const LINES = [['pv', 'pScale', '--tr-pv', 'Portal pressure', 'mmHg', 1], ['flow', 'fScale', '--tr-hv', 'Portal flow', 'L/min', 2]];

export function createFlowTime() {
  const el = document.createElement('div');
  el.className = 'pz-flowtime';
  let ser = null, parts = null, shown = 0, goal = 0, raf = 0, sig = '';
  const X = (t) => L + (R - L) * t;
  // The series' value at k along the time-lapse (linear between days).
  const at = (arr, k) => {
    const t = ser.t, j = clamp(t.findIndex((x) => x >= k), 1, t.length - 1);
    const f = clamp((k - t[j - 1]) / Math.max(1e-9, t[j] - t[j - 1]), 0, 1);
    return arr[j - 1] + (arr[j] - arr[j - 1]) * f;
  };
  function build(ends) {
    const Y = (v, sc) => B - (B - T) * clamp(v / sc.max, 0, 1);
    const grid = ser.pScale.ticks.map((v, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: L, x2: R, y1: Y(v, ser.pScale), y2: Y(v, ser.pScale) }),
      sv('text', { x: L - 8, y: Y(v, ser.pScale) + 5, 'text-anchor': 'end', style: 'fill: var(--tr-pv)' }, fmt(v, v % 1 ? 1 : 0)),
      sv('text', { x: R + 8, y: Y(v, ser.pScale) + 5, style: 'fill: var(--tr-hv)' }, fmt(ser.fScale.ticks[k], ser.fScale.ticks[k] % 1 ? 1 : 0))));
    // The legend over the chart: each line's name, its swatch and its unit (left scale, right scale).
    const legend = LINES.map(([, , c, name, unit], k) => sv('g', { class: 'pft-key', transform: `translate(${k ? R : L} 0)` },
      sv('line', { x1: k ? -24 : 0, x2: k ? 0 : 24, y1: 16, y2: 16, style: `stroke: var(${c})` }),
      sv('text', { x: k ? -32 : 32, y: 21, 'text-anchor': k ? 'end' : 'start', style: `fill: var(${c})` }, name),
      sv('text', { class: 'ptk-ax', x: k ? -32 : 32, y: 40, 'text-anchor': k ? 'end' : 'start' }, `${unit}, ${k ? 'right' : 'left'}`)));
    const lines = LINES.map(([k, s, c]) => {
      const sc = ser[s];
      return {
        k, sc, Y: (v) => Y(v, sc),
        start: sv('circle', { class: 'pft-start', cx: X(0), cy: Y(ser[k][0], sc), r: 4.5, style: `stroke: var(${c})` }),
        path: sv('path', { class: 'ptk-line', style: `stroke: var(${c})` }),
        dot: sv('circle', { class: 'pft-dot', r: 6.5, style: `fill: var(${c})` }),
        val: sv('text', { class: 'pft-v', style: `fill: var(${c})` }),
      };
    });
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' },
      grid, legend,
      sv('line', { class: 'pft-x', x1: L, x2: R, y1: B, y2: B }),
      sv('text', { class: 'pft-t', x: L, y: B + 26 }, ends[0]), sv('text', { class: 'pft-t', x: R, y: B + 26, 'text-anchor': 'end' }, ends[1]),
      sv('text', { class: 'ptk-ax', x: (L + R) / 2, y: B + 26, 'text-anchor': 'middle' }, 'Time'),
      lines.map((l) => [l.path, l.start, l.dot, l.val]));
    return { svg, lines };
  }
  // Draw the lines up to k (0 to 1) of the time-lapse, with each line's value at its head.
  function paint(k) {
    if (!parts) return;
    const n = ser.t.filter((t) => t < k).length;
    const pts = (l, arr) => [...ser.t.slice(0, n).map((t, j) => [X(t), l.Y(arr[j])]), [X(k), l.Y(at(arr, k))]];
    const heads = parts.lines.map((l) => {
      const p = pts(l, ser[l.k]), [hx, hy] = p.at(-1);
      l.path.setAttribute('d', p.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''));
      l.dot.setAttribute('cx', hx.toFixed(1)); l.dot.setAttribute('cy', hy.toFixed(1));
      return { l, hx, hy, v: at(ser[l.k], k) };
    });
    // The values beside the heads, kept at least 22 apart so they never overlap; flipped left near the right edge.
    const [a, b] = [...heads].sort((p, q) => p.hy - q.hy);
    let ya = a.hy - 12, yb = b.hy - 12;
    if (yb - ya < 22) { const m = (ya + yb) / 2; ya = m - 11; yb = m + 11; }
    for (const [hd, y] of [[a, ya], [b, yb]]) {
      const left = hd.hx > R - 90, line = LINES.find((x) => x[0] === hd.l.k);
      hd.l.val.setAttribute('x', (hd.hx + (left ? -12 : 12)).toFixed(1)); hd.l.val.setAttribute('y', y.toFixed(1));
      hd.l.val.setAttribute('text-anchor', left ? 'end' : 'start');
      hd.l.val.textContent = `${fmt(hd.v, hd.l.k === 'flow' ? 2 : 1)} ${line[4]}`;
    }
    parts.svg.setAttribute('aria-label', `Portal pressure and portal flow over time: pressure ${fmt(ser.pv[0], 1)} to ${fmt(heads[0].v, 1)} mmHg, flow ${fmt(ser.flow[0], 2)} to ${fmt(heads[1].v, 2)} L/min`);
  }
  // The heads glide after the goal (never a jump), about a third of the way each frame.
  function tick() {
    raf = 0;
    shown += (goal - shown) * (matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.18);
    if (Math.abs(goal - shown) < 0.002) shown = goal;
    paint(shown);
    if (shown !== goal) raf = requestAnimationFrame(tick);
  }
  return {
    el,
    /** trail: the time-lapse's [[day, pv, pvFlow]] (null: not computed yet; undefined: keep the one drawn); k: how far along it to draw (0 to 1);
     *  ends: the words under its start and end. A new trail fades in over the old chart. */
    set(trail, k = 1, ends = ['Start', 'End']) {
      const s2 = trail === undefined ? sig : trail ? JSON.stringify([trail.at(-1), ends]) : '';
      if (s2 !== sig) {
        sig = s2; ser = flowTimeSeries(trail);
        const old = [...el.children];
        parts = ser ? build(ends) : null;
        if (parts) {
          parts.svg.classList.add('in'); el.append(parts.svg);
          requestAnimationFrame(() => requestAnimationFrame(() => parts?.svg.classList.remove('in')));
        }
        setTimeout(() => old.forEach((o) => o.remove()), 480);
        shown = goal = clamp(k, 0, 1); paint(shown);
        return;
      }
      goal = clamp(k, 0, 1);
      if (!raf) raf = requestAnimationFrame(tick);
    },
    update() {}, clear() {},
  };
}
