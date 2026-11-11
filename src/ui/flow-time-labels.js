// Where the flow-time chart's first values ("11.6 mmHg", "0.0 L") stand (the small time graph on a teaching card, the Varices and Treating-the-cause
// time-lapse charts). Pure: no imports, so the layout loads in Node and the unit test pins its numbers (tests/flow-time-layout.test.js).
// Each first value is a box (its text at the chart's type f, bold-width) and may stand over its start ring, under it, or to the right of it at a
// step or two up or down. It must be wholly inside the area it is given (the plot's panel, above the clock's band), clear of every ring, every
// line, the axis numbers and the other first value; of the places that are clear the nearest to its own ring wins. Where none is clear (a card far
// too small) the one that touches least is taken, so the labels are still placed.

/** A text's width in px at type f: near enough, the chart is laid out before it is drawn. b: bold. */
export const cw = (t, f, b) => t.length * f * (b ? 0.6 : 0.56);

const BAD = 1e4, OUT = 1e6;
const hits = (a, b, m) => a[0] < b[1] + m && b[0] < a[1] + m && a[2] < b[3] + m && b[2] < a[3] + m;
const nearCircle = (b, [cx, cy, r], m) => { const dx = Math.max(b[0] - cx, 0, cx - b[1]), dy = Math.max(b[2] - cy, 0, cy - b[3]); return dx * dx + dy * dy < (r + m) * (r + m); };
/** The points of a polyline taken every 3 px or less (a line's own corners are too far apart to tell where it runs). */
export function dense(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i + 1 < pts.length) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3); for (let k = 1; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); }
  }
  return out;
}

/** The first values' places.
 *  f: the type size; area: [x0, x1, y0, y1], the box a label stays wholly inside; texts: each label's words;
 *  own: each label's own ring [cx, cy, r]; circles: every ring and head dot to keep clear of (own included), [cx, cy, r] (r with its stroke);
 *  lines: each line's points [[x, y], ...]; rects: boxes to keep clear of (the axis numbers, "Fasting" and "Meal"), [x0, x1, y0, y1];
 *  soft: boxes a label may cross at a cost (the dashed meal line).
 *  → [{ x, y, box }] per label: x, y the text's start and baseline, box [x0, x1, y0, y1] what it covers. */
export function placeStarts({ f, area, texts, own, circles, lines, rects = [], soft = [] }) {
  const pts = lines.flatMap(dense), up = 0.78 * f, down = 0.25 * f, gap = 2, line = 2.6;
  const boxOf = (x, y, w) => [x, x + w, y - up, y + down];
  const cands = texts.map((t, i) => {
    const [cx, cy, r] = own[i], w = cw(t, f, 1), out = [];
    const add = (x, y) => {
      const box = boxOf(x, y, w);
      let cost = 0;
      if (box[0] < area[0] || box[1] > area[1] || box[2] < area[2] || box[3] > area[3]) cost += OUT;
      for (const c of circles) if (nearCircle(box, c, gap)) cost += BAD;
      for (const q of rects) if (hits(box, q, gap)) cost += BAD;
      for (const q of soft) if (hits(box, q, 0)) cost += 30;
      let n = 0; for (const p of pts) if (p[0] > box[0] - line && p[0] < box[1] + line && p[1] > box[2] - line && p[1] < box[3] + line) n++;
      if (n) cost += BAD + n;
      // (the nearest place to its own ring, and never one nearer another line's ring than its own)
      const mx = (box[0] + box[1]) / 2, my = (box[2] + box[3]) / 2;
      cost += 0.4 * Math.abs(x - cx) + Math.abs(my - cy);
      for (let j = 0; j < own.length; j++) if (j !== i && Math.hypot(mx - own[j][0], my - own[j][1]) < Math.hypot(mx - cx, my - cy)) cost += 60;
      out.push({ x, y, box, cost });
    };
    for (const dx of [-3, r + 3, 2 * f, 4 * f, 6 * f, 9 * f]) {
      for (let k = 0; k < 10; k++) { add(cx + dx, cy - r - gap - 0.5 - down - k * 0.35 * f); add(cx + dx, cy + r + gap + 0.5 + up + k * 0.35 * f); }
      for (let k = -3; k <= 3; k++) add(cx + dx, cy + 0.35 * f + k * 0.35 * f);
    }
    return out.sort((a, b) => a.cost - b.cost).slice(0, 48);
  });
  let best = null;
  const walk = (i, chosen, cost) => {
    if (best && cost >= best.cost) return;
    if (i === cands.length) { best = { cost, chosen: chosen.slice() }; return; }
    for (const c of cands[i]) {
      let extra = c.cost;
      for (const o of chosen) if (hits(c.box, o.box, gap)) extra += BAD;
      chosen.push(c); walk(i + 1, chosen, cost + extra); chosen.pop();
    }
  };
  walk(0, [], 0);
  return best.chosen.map(({ x, y, box }) => ({ x, y, box }));
}
