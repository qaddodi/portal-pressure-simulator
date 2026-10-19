// The Doppler probe on the figure (19 Oct, Mohammad's pick "B1 + white" from /mnt/project-files/review/doppler-probe-ideas/):
// a small curved probe off the vessel that looks at it along a narrow beam, and the sample gate, two short bars across the
// beam, centred in the lumen at the vessel's middle (a stent: the third the Doppler samples). The beam meets the vessel at the
// monitor's θ 60°, from the side its flow comes toward (the trace above the baseline), or away from for the hepatic veins and
// the IVC, as doppler.js draws them. Pure geometry and markup here; stage.js places it (dprobePaint).

// The vessels whose forward flow runs away from the probe (doppler.js PROBES, away: true; a test keeps the two in step).
export const AWAY = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA']);
export const awayFromProbe = (id) => AWAY.has(id);

// The probe's shape, in CSS px along its axis from its face: the body reaches 48 px back and its cable stub on to 62; 11 px
// either side (13 with the outline). GAP: from the vessel's wall to the probe's face.
export const PROBE = { ANGLE: 60, GAP: 74, LEN: 62, HALF: 13, EDGE: 8, BEAM_DEG: 7 };

/** The gate's size for a lumen of radius r (px on screen): bars 0.72 r either side of the beam, 0.75 r apart (within limits). */
export const gateDims = (r) => ({ half: Math.min(12, Math.max(6, 0.72 * r)), gap: Math.min(10, Math.max(5, 0.75 * r)) });

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
 * Returns { side, ang (degrees, from the gate toward the probe), D (gate to face, px), box (the body), clear }.
 */
export function probePose({ g, t, r = 0, away = false, w, h, cards = [], keep = 0, side = 0 }) {
  const base = Math.atan2(t[1], t[0]) * 180 / Math.PI, turn = away ? 180 - PROBE.ANGLE : PROBE.ANGLE;
  const D = PROBE.GAP + Math.max(0, r);
  const pose = (s) => {
    const ang = base + s * turn, box = bodyBox(g, ang, D), e = PROBE.EDGE;
    // How much of the body lies off the stage or under a card (px²): 0 is clear.
    const off = (box.x1 - box.x0) * (box.y1 - box.y0) - overlap(box, { x0: e, y0: e, x1: w - e, y1: h - e });
    const hidden = cards.reduce((n, c) => n + overlap(box, c), 0);
    return { side: s, ang, D, box, cost: off + hidden, clear: off + hidden === 0 };
  };
  if (side) return pose(side);
  const a = pose(1), b = pose(-1);
  if (keep) { const k = keep === 1 ? a : b, o = keep === 1 ? b : a; return k.clear || !o.clear ? k : o; }
  // (First showing: the clear side, else the less covered one; a tie stands above the vessel, where the camera leaves more room.)
  if (a.clear !== b.clear) return a.clear ? a : b;
  if (a.cost !== b.cost) return a.cost < b.cost ? a : b;
  return (a.box.y0 + a.box.y1) <= (b.box.y0 + b.box.y1) ? a : b;
}

/** The beam (a narrow wedge from the probe's face to past the far wall), the gate and the probe's head, in the probe's own
 *  frame: x runs from the gate (0) toward the probe, whose face is at D. */
export function probeShapes(D, r) {
  const { half, gap } = gateDims(r), far = -(Math.max(0, r) + 10), L = D - far, k = Math.tan(rad(PROBE.BEAM_DEG)) * L;
  const f = (v) => +v.toFixed(1);
  return {
    beam: `M${f(D)} 0 L${f(far)} ${f(-k)} L${f(far)} ${f(k)} Z`,
    gate: `M${f(-gap / 2)} ${f(-half)} L${f(-gap / 2)} ${f(half)} M${f(gap / 2)} ${f(-half)} L${f(gap / 2)} ${f(half)}`,
    head: `translate(${f(D)} 0)`,
  };
}

// The probe's head: a convex face, a neck and a handle with a light in the glow's colour, white-lined on a black rim (the gate's rule).
const BODY = 'M2 -11 Q-3 0 2 11 L10 11 L18 6 L42 6 Q48 6 48 0 Q48 -6 42 -6 L18 -6 L10 -11 Z';
export const PROBE_SVG = '<svg class="dpr-svg" width="1" height="1" aria-hidden="true"><defs><linearGradient id="dpr-beam" x1="1" y1="0" x2="0" y2="0">'
  + '<stop offset="0" stop-color="var(--dop-glow)" stop-opacity=".46"/><stop offset=".8" stop-color="var(--dop-glow)" stop-opacity=".22"/>'
  + '<stop offset="1" stop-color="var(--dop-glow)" stop-opacity="0"/></linearGradient></defs><g class="dpr-rot">'
  + '<path class="dpr-beam"/><path class="dpr-gate-rim"/><path class="dpr-gate"/><g class="dpr-head">'
  + `<path class="dpr-cable" d="M47 0 L62 0"/><path class="dpr-rim" d="${BODY}"/><path class="dpr-body" d="${BODY}"/>`
  + '<path class="dpr-face" d="M2 -11 Q-3 0 2 11"/><circle class="dpr-light" cx="33" cy="0" r="3"/></g></g></svg>';
