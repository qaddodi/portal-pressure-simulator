// The Doppler probe on the figure (19 Oct, Mohammad's pick "B1 + white" from /mnt/project-files/review/doppler-probe-ideas/;
// its marks drawn as a scanner shows them, from his textbook reference of 20 Oct, "The Doppler angle and sample volume"): a small
// curved probe off the vessel, its line of sight running straight through the vessel, the sample volume's two short bars across
// the line inside the lumen, and the flow axis through the gate with the Doppler angle θ between it and the line, at the vessel's
// middle (a stent: the third the Doppler samples). The line meets the flow at the monitor's θ 60°, from the side the flow comes
// toward (the trace above the baseline), or away from for the hepatic veins and the IVC, as doppler.js draws them. Pure geometry
// and markup here; stage.js places it (dprobePaint).

// The vessels whose forward flow runs away from the probe (doppler.js PROBES, away: true; a test keeps the two in step).
export const AWAY = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA']);
export const awayFromProbe = (id) => AWAY.has(id);

// The probe's shape, in CSS px along its axis from its face: the body reaches 48 px back and its cable stub on to 62; 11 px
// either side (13 with the outline). GAP: from the vessel's wall to the probe's face.
export const PROBE = { ANGLE: 60, GAP: 74, LEN: 62, HALF: 13, EDGE: 8 };

const SIN = Math.sin(Math.PI / 3);   // the line of sight crosses a lumen of radius r over r / sin 60° either side of its middle
/** The sample volume for a lumen of radius r (px on screen): two bars across the line of sight, each `at` px from the gate along
 *  it, halfway to the wall: the gate takes in the central half of the lumen, as the Polish Ultrasound Society's standard sets it
 *  (Lechowicz and Elwertowski, J Ultrason 2015, p. 214), `half` px either side of it. */
export const gateDims = (r) => ({ at: Math.max(4, (0.5 * Math.max(0, r)) / SIN), half: Math.min(10, Math.max(5, 0.5 * r)) });

const rad = (d) => (d * Math.PI) / 180;
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** The probe's body box (stage px) with its face D px from the gate g, along the direction ang (degrees). */
export function bodyBox(g, ang, D) {
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), xs = [], ys = [];
  for (const [u, v] of [[D - 3, -PROBE.HALF], [D - 3, PROBE.HALF], [D + PROBE.LEN, -PROBE.HALF], [D + PROBE.LEN, PROBE.HALF]]) {
    xs.push(g[0] + u * c - v * s); ys.push(g[1] + u * s + v * c);
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Where the probe stands. g: the gate (stage px); t: the vessel's direction there, as its blood normally runs (any length);
 * r: the lumen's radius (px); away: the flow runs away from the probe; w, h: the stage; cards: boxes the probe keeps off;
 * keep: the side it stood on (1 or −1; 0: none), kept unless only the other side is clear; side: a side to use outright.
 * Returns { side, ang (degrees, from the gate toward the probe), phi (the flow axis's 60° ray, from the line of sight toward
 * the probe, degrees), D (gate to face, px), box (the body), clear }.
 */
export function probePose({ g, t, r = 0, away = false, w, h, cards = [], keep = 0, side = 0 }) {
  const base = Math.atan2(t[1], t[0]) * 180 / Math.PI, turn = away ? 180 - PROBE.ANGLE : PROBE.ANGLE;
  const D = PROBE.GAP + Math.max(0, r);
  const pose = (s) => {
    const ang = base + s * turn, box = bodyBox(g, ang, D), e = PROBE.EDGE;
    // How much of the body lies off the stage or under a card (px²): 0 is clear.
    const off = (box.x1 - box.x0) * (box.y1 - box.y0) - overlap(box, { x0: e, y0: e, x1: w - e, y1: h - e });
    const hidden = cards.reduce((n, c) => n + overlap(box, c), 0);
    // (The flow runs at −s·60° from the line toward the probe (toward), or at 180° − s·120° (away), whose reverse is s·60°.)
    return { side: s, ang, phi: (away ? s : -s) * PROBE.ANGLE, D, box, cost: off + hidden, clear: off + hidden === 0 };
  };
  if (side) return pose(side);
  const a = pose(1), b = pose(-1);
  if (keep) { const k = keep === 1 ? a : b, o = keep === 1 ? b : a; return k.clear || !o.clear ? k : o; }
  // (First showing: the clear side, else the less covered one; a tie stands above the vessel, where the camera leaves more room.)
  if (a.clear !== b.clear) return a.clear ? a : b;
  if (a.cost !== b.cost) return a.cost < b.cost ? a : b;
  return (a.box.y0 + a.box.y1) <= (b.box.y0 + b.box.y1) ? a : b;
}

/** The marks in the probe's own frame, x running from the gate (0) toward the probe, whose face is at D: the line of sight from
 *  the face straight through the vessel and on past its far wall; the sample volume's two bars across it; the flow axis through
 *  the gate, at phi (±60°) from the line, with the angle's arc; theta: where the θ sits, on the angle's bisector beyond the arc. */
export function probeShapes(D, r, phi = PROBE.ANGLE) {
  const { at, half } = gateDims(r), far = -(Math.max(0, r) / SIN + 22);
  const L = Math.min(24, Math.max(8, 1.1 * r)), R = Math.min(14, Math.max(8, 0.6 * r)), p = rad(phi), c = Math.cos(p), s = Math.sin(p);
  const f = (v) => +v.toFixed(1);
  return {
    beam: `M${f(D)} 0 L${f(far)} 0`,
    gate: `M${f(-at)} ${f(-half)} L${f(-at)} ${f(half)} M${f(at)} ${f(-half)} L${f(at)} ${f(half)}`,
    axis: `M${f(-L * c)} ${f(-L * s)} L${f(L * c)} ${f(L * s)} M${f(R)} 0 A${f(R)} ${f(R)} 0 0 ${phi > 0 ? 1 : 0} ${f(R * c)} ${f(R * s)}`,
    theta: [f((R + 12) * Math.cos(p / 2)), f((R + 12) * Math.sin(p / 2))],
    head: `translate(${f(D)} 0)`,
  };
}

// The probe's head: a convex face, a neck and a handle with a light in the glow's colour. Every mark is white-lined on a black
// rim, so it reads on every vessel colour and theme; the θ stands upright (stage.js turns it back).
const BODY = 'M2 -11 Q-3 0 2 11 L10 11 L18 6 L42 6 Q48 6 48 0 Q48 -6 42 -6 L18 -6 L10 -11 Z';
export const PROBE_SVG = '<svg class="dpr-svg" width="1" height="1" aria-hidden="true"><g class="dpr-rot">'
  + '<path class="dpr-rim-l dpr-beam"/><path class="dpr-line dpr-beam"/><path class="dpr-rim-l dpr-axis"/><path class="dpr-line dpr-axis"/>'
  + '<path class="dpr-gate-rim dpr-bars"/><path class="dpr-gate dpr-bars"/><text class="dpr-theta" text-anchor="middle" dominant-baseline="central">θ</text>'
  + `<g class="dpr-head"><path class="dpr-cable" d="M47 0 L62 0"/><path class="dpr-rim" d="${BODY}"/><path class="dpr-body" d="${BODY}"/>`
  + '<path class="dpr-face" d="M2 -11 Q-3 0 2 11"/><circle class="dpr-light" cx="33" cy="0" r="3"/></g></g></svg>';
