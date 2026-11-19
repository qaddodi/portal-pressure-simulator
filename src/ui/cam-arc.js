// The camera's one path between two framings: straight. The zoom runs evenly on a log scale with the pan tied to the zoom, so every point of the figure
// travels a straight line on the screen and the zoom goes one way only, from any view to any view (Mohammad, 18 Nov 2026: "camera must zoom straight
// from any view to any view (no fit waypoint)"). Until 19 Nov 2026 a long move (two close-ups that share nothing) pulled back over the figure on a
// van Wijk-Nuij arc and a refit blended it with a second path; both are gone (bible review STG-4).
//
// A view (vt) maps a world point p to p·k + (x, y) in viewBox units. Its geometry here: the world point at the middle of the
// viewBox (cx, cy) and the world width it shows (w). `vb` names the viewBox units the stage really shows: { w, h, cx, cy }.

// The working code (lerpInto, geomInto, viewInto) allocates nothing while it runs: results are written into an object the caller passes (`out`).
// The names without the suffix (lerpVT, viewGeom, geomView) keep the old contract, a fresh result per call.


/** The even glide: zoom on a log scale, the pan in step with the zoom (a pure pan follows u itself), written into `out`. */
export function lerpInto(from, to, u, out) {
  const k = from.k * Math.pow(to.k / from.k, u), a = to.k === from.k ? u : (k - from.k) / (to.k - from.k);
  const x = from.x + (to.x - from.x) * a, y = from.y + (to.y - from.y) * a;
  out.k = k; out.x = x; out.y = y;
  return out;
}
/** The even glide as a fresh view. */
export function lerpVT(from, to, u) { return lerpInto(from, to, u, { k: 0, x: 0, y: 0 }); }

export function geomInto(v, vb, out) { out.cx = (vb.cx - v.x) / v.k; out.cy = (vb.cy - v.y) / v.k; out.w = vb.w / v.k; return out; }
export function viewInto(g, vb, out) { const k = vb.w / g.w, x = vb.cx - g.cx * k, y = vb.cy - g.cy * k; out.k = k; out.x = x; out.y = y; return out; }
export const viewGeom = (v, vb) => geomInto(v, vb, { cx: 0, cy: 0, w: 0 });
export const geomView = (g, vb) => viewInto(g, vb, { k: 0, x: 0, y: 0 });

/**
 * The viewBox units the stage really shows, written into `out`: { w, h, cx, cy }, the `vb` every path here is worked out in.
 * `sw`, `sh`: the svg's box in px; `box`: the view box as it stands ({ x, y, width, height }: the anatomy's, the circuit's, or between them
 * mid-change); the svg meets it, so the spare room on one axis shows more. `free` ({ l, t, r, b } in the svg's px, or null): the rectangle
 * the framing was fitted into (between the cards); its middle is the point the path travels, so the middle of one framing goes to the
 * middle of the next in a straight line, as the framing itself centres its box there.
 * (Until 15 Nov 2026 the arcs, the vessel-following glides and their times read a fixed 1400 x 1000 plate that no stage shows any more, so
 * every width, overlap test and pull-back was out by the plate's ratio, differently on each device: the figure bowed off its line on a
 * Mac and streamed past on a phone.)
 */
export function camWindow(sw, sh, box, free = null, out = { w: 0, h: 0, cx: 0, cy: 0 }) {
  const s0 = Math.min(sw / box.width, sh / box.height);
  out.w = sw / s0; out.h = sh / s0;
  out.cx = box.x + box.width / 2; out.cy = box.y + box.height / 2;
  if (free && Number.isFinite(free.l + free.r + free.t + free.b)) { out.cx += ((free.l + free.r) / 2 - sw / 2) / s0; out.cy += ((free.t + free.b) / 2 - sh / 2) / s0; }
  return out;
}

/** A slow push's progress (a time-lapse's drift, lapse.cam): it gathers speed over the first fifth, moves evenly, and settles over
 *  the last fifth, so a push of several seconds neither crawls at its ends nor rushes in its middle as an ease-in-out would. */
export function driftEase(u, ramp = 0.2) {
  u = Math.min(1, Math.max(0, u));
  const v = 1 / (1 - ramp);   // (the even speed: the ramps give up half their width each)
  if (u < ramp) return (v * u * u) / (2 * ramp);
  if (u > 1 - ramp) return 1 - (v * (1 - u) ** 2) / (2 * ramp);
  return v * (u - ramp / 2);
}
