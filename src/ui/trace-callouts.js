// Trace callouts (V-CHART-6, N6): a small marker that drops onto a trace where a reading is taken, so the room sees where the number
// came from: "Free 8.1", "Wedge 22.4", "HVPG 14.3" on the HVPG tracing, "Peak 84" and "Trough 12" on a Doppler trace with calipers.
// Pure placement and one drawer; both traces hand it the GPU's 2D context (trace-gl.js), so a marker is drawn by the GPU with the trace
// it sits on and moves with it, never as a DOM label. Nothing here allocates per frame (the words are kept per marker: a cell).

import { FONT } from './charts.js';
import { D_SMALL } from './motion.js';
import { fmt } from './util.js';

/** How long a marker takes to drop onto its point (ms) and how far above (or below) its place it starts (px). */
export const DROP_MS = D_SMALL;
export const DROP_PX = 10;
const STEM = 7, PAD = 6, PILL_H = 18;
/** The share of a marker that has dropped, `since` ms after its reading was taken (0 before it, 1 from DROP_MS on; eased out). */
export function dropK(since) {
  if (!(since > 0)) return 0;
  const u = Math.min(1, since / DROP_MS);
  return 1 - (1 - u) * (1 - u) * (1 - u);
}
/** A fade for a marker `px` from the edge it scrolls off at: 1 from `span` px in, 0 at the edge (smoothstep). */
export function edgeFade(px, span = 48) {
  const u = Math.min(1, Math.max(0, px / span));
  return u * u * (3 - 2 * u);
}

/** A line of width `w` from (x0, y0) to (x1, y1) added to the open path as small round boxes, to be filled with ctx.fill() (fillStyle set by the caller).
 *  The GPU lays boxes and fills straight onto the picture; a stroked line goes through its coverage target, and where that target gave nothing the
 *  tracing showed its axes, its numbers and its dot but no line (HVPG TRACING, 4 Nov 2026). So the monitors' lines are boxes, which draw wherever the dot does. */
export function inkSeg(ctx, x0, y0, x1, y1, w) {
  const r = w / 2, dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(0.5, w * 0.45)));
  for (let i = 0; i <= n; i++) { const u = i / n; ctx.roundRect(x0 + dx * u - r, y0 + dy * u - r, w, w, r); }
}

/** A marker's words, rebuilt only when the number differs from the one they were built from (a cell is { v, s }). */
export const calloutCell = () => ({ v: undefined, s: '' });
export function calloutText(c, name, v, digits = 1) {
  if (!Object.is(c.v, v)) { c.v = v; c.s = `${name} ${fmt(v, digits)}`; }   // alloc-rare: only when the number differs from the one its words were built from
  return c.s;
}

/** Which side of its point a marker goes: `want` (-1 above, 1 below) if the whole marker fits there between top and bot, else the other. */
export function sideFor(y, want, top, bot) {
  const need = STEM + PILL_H + 2;
  const fits = (s) => (s < 0 ? y - need >= top : y + need <= bot);
  return fits(want) ? want : fits(-want) ? -want : want;
}

/** Draw one marker on ctx. (x, y): the trace point it marks. side: -1 above it, 1 below. drop: dropK (0..1), alpha: 0..1.
 *  The marker is a ring on the point, a stem and a pill with the words, kept inside [x0, x1] × [top, bot]. Returns the pill's centre x. */
export function drawCallout(ctx, text, x, y, side, colour, bg, drop, alpha, x0, x1, top, bot, px = 12) {
  if (alpha <= 0.01 || drop <= 0) return x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = FONT(700, px); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width + 2 * PAD, half = tw / 2;
  const cx = Math.min(Math.max(x, x0 + half), Math.max(x0 + half, x1 - half));
  const lift = (1 - drop) * DROP_PX * side * -1;   // (starts a little further out and drops onto its point)
  const py = Math.min(Math.max(y + side * (STEM + PILL_H / 2) + lift, top + PILL_H / 2), bot - PILL_H / 2);
  ctx.fillStyle = colour; ctx.beginPath(); inkSeg(ctx, x, y, cx, py - side * (PILL_H / 2 - 3), 1.4); ctx.fill();
  ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bg; ctx.lineWidth = 1; ctx.stroke();
  // (The label look of the figure's labels, label-gl: coloured text on a dark outline, no box or pill.)
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(text, cx - half + PAD, py + 0.5);
  ctx.fillStyle = colour; ctx.fillText(text, cx - half + PAD, py + 0.5);
  ctx.restore();
  return cx;
}
