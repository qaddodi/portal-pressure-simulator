// The Doppler probe on the figure (19 Oct, Mohammad's pick "B1 + white" from /mnt/project-files/review/doppler-probe-ideas/;
// its marks drawn as a scanner shows them, from his textbook reference of 20 Oct, "The Doppler angle and sample volume"): a small
// curved probe off the vessel, its line of sight running straight through the vessel, the sample volume's two short bars across
// the line inside the lumen, and the flow axis through the gate with the Doppler angle θ between it and the line, at the vessel's
// middle (a stent: the third the Doppler samples). The line meets the flow at the monitor's θ 50°, from the side the flow comes
// toward (the trace above the baseline), or away from for the hepatic veins and the IVC, as doppler.js draws them. Pure geometry
// and markup here; stage.js places it (dprobePaint).

// The vessels whose forward flow runs away from the probe (doppler.js PROBES, away: true; a test keeps the two in step).
export const AWAY = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA']);
export const awayFromProbe = (id) => AWAY.has(id);

// The probe's shape, in CSS px along its axis from its face: the body reaches 48 px back and its cable stub on to 62; 11 px
// either side (13 with the outline). GAP: from the vessel's wall to the probe's face.
// BEAM_DEG: the faded ultrasound beam's half-angle (the first probe's narrow beam, which Mohammad missed, 20 Oct).
// ANGLE: the Doppler angle θ, the monitor's too (dopplerColor.js THETA reads it). Under 60° as the papers ask (McNaughton and
// Abu-Yousef, RadioGraphics 2011, Fig 2; Ferraioli's EFSUMB slides; Lechowicz and Elwertowski, J Ultrason 2015, p. 214): 60° was the limit itself.
export const PROBE = { ANGLE: 50, GAP: 74, LEN: 62, HALF: 13, EDGE: 8, BEAM_DEG: 7 };

/** The sample volume for a lumen of radius r (px on screen): two bars across the line of sight, each `at` px from the gate along
 *  it: the gate is half the vessel's width long, in its middle, as the Polish Ultrasound Society's standard sets it (Lechowicz and
 *  Elwertowski, J Ultrason 2015, p. 214), and the monitor's SV names it (doppler.js svMm); `half` px either side of it. */
export const gateDims = (r) => ({ at: Math.max(4, 0.5 * Math.max(0, r)), half: Math.min(10, Math.max(5, 0.5 * r)) });

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

/** Nearer distances (gate wall to face, px) the probe may come in to when neither side is clear at PROBE.GAP. */
const REACH = [52, 34];

/** Boxes along the probe's line of sight (stage px), from its face D px out along ang back through the gate g and past the
 *  vessel's far wall (as probeShapes draws it), each pad px either side of the line: what labels keep off, and what the probe
 *  weighs against the labels and callouts when it picks a side. */
export function beamBoxes(g, ang, D, r = 0, pad = 4) {
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), far = gateDims(r).at, out = [], n = Math.max(1, Math.ceil((D - far) / 8));
  for (let i = 0; i <= n; i++) {
    const u = far + ((D - far) * i) / n, x = g[0] + u * c, y = g[1] + u * s;
    out.push({ x0: x - pad, y0: y - pad, x1: x + pad, y1: y + pad });
  }
  return out;
}

/** Boxes along the flow axis through the gate (stage px), as probeShapes draws it, 4 px either side: the axis runs `phi` degrees from
 *  the line of sight at ang and reaches a little past the gate bars. Labels (the narrowing's "60 %" too) keep off it, and the probe
 *  weighs it with the line of sight when it picks a side. */
export function gateBoxes(g, ang, phi, r = 0, pad = 4) {
  const L = Math.min(36, Math.max(16, 1.7 * r)), a = rad(ang + phi), c = Math.cos(a), s = Math.sin(a), out = [];
  for (let u = -L; u <= L + 0.01; u += 8) out.push({ x0: g[0] + u * c - pad, y0: g[1] + u * s - pad, x1: g[0] + u * c + pad, y1: g[1] + u * s + pad });
  return out;
}

/**
 * Where the probe stands. g: the gate (stage px); t: the vessel's direction there, as its blood normally runs (any length);
 * r: the lumen's radius (px); away: the flow runs away from the probe; w, h: the stage; cards: boxes the probe keeps off;
 * keep: the side it stood on (1 or −1; 0: none), kept unless only the other side is clear; side: a side to use outright.
 * avoid: the labels' and callouts' boxes: between two sides clear of the cards, the one whose body and line of sight cross
 * fewer of them (a kept side moves only when it crosses one and the other side crosses none: Mohammad, 20 Oct, the probe's
 * line had crossed "TIPS 110 cm/s" and a callout).
 * Returns { side, ang (degrees, from the gate toward the probe), phi (the flow axis's θ ray, from the line of sight toward
 * the probe, degrees), D (gate to face, px), box (the body), clear }.
 */
export function probePose({ g, t, r = 0, away = false, w, h, cards = [], keep = 0, side = 0, avoid = [], keepReach = 0 }) {
  const base = Math.atan2(t[1], t[0]) * 180 / Math.PI, turn = away ? 180 - PROBE.ANGLE : PROBE.ANGLE;
  const D0 = PROBE.GAP + Math.max(0, r);
  const pose = (s, D = D0, reach = 0) => {
    const ang = base + s * turn, box = bodyBox(g, ang, D), e = PROBE.EDGE;
    // How much of the body lies off the stage or under a card (px²): 0 is clear.
    const off = (box.x1 - box.x0) * (box.y1 - box.y0) - overlap(box, { x0: e, y0: e, x1: w - e, y1: h - e });
    const hidden = cards.reduce((n, c) => n + overlap(box, c), 0);
    // (The flow runs at −s·θ from the line toward the probe (toward), or at 180° − s·(180° − θ) (away), whose reverse is s·θ.)
    const phi = (away ? s : -s) * PROBE.ANGLE, marks = [box, ...beamBoxes(g, ang, D, r), ...gateBoxes(g, ang, phi, r)], lab = avoid.reduce((n, o) => n + marks.reduce((m, b) => m + overlap(b, o), 0), 0);
    return { side: s, reach, ang, lab, phi, D, box, cost: off + hidden, clear: off + hidden === 0 };
  };
  if (side) return pose(side);
  const a = pose(1), b = pose(-1);
  // Neither side clear at its usual distance (off the slide's free space or under a card): the probe comes in closer to the
  // vessel, on either side, before it gives up; then none fits and it hides (Mohammad, 20 Oct: visible wherever there is room).
  if (!a.clear && !b.clear) {
    const near = REACH.map((n, i) => [pose(1, n + Math.max(0, r), i + 1), pose(-1, n + Math.max(0, r), i + 1)]).flat().filter((p) => p.clear);
    if (!near.length) return { ...(a.cost <= b.cost ? a : b), none: true };
    const k = keep && near.find((p) => p.side === keep && p.reach === keepReach);
    return k && !(k.lab > 0 && near.some((p) => p.lab === 0)) ? k : near.reduce((m, p) => (p.lab < m.lab ? p : m));
  }
  if (keep) {
    const k = keep === 1 ? a : b, o = keep === 1 ? b : a;
    if (!k.clear) return o.clear ? o : k;
    return o.clear && k.lab > 0 && o.lab === 0 ? o : k;
  }
  // (First showing: the clear side, else the less covered one; then the one crossing fewer labels; a tie stands above the
  // vessel, where the camera leaves more room.)
  if (a.clear !== b.clear) return a.clear ? a : b;
  if (a.cost !== b.cost) return a.cost < b.cost ? a : b;
  if (a.lab !== b.lab) return a.lab < b.lab ? a : b;
  return (a.box.y0 + a.box.y1) <= (b.box.y0 + b.box.y1) ? a : b;
}

/** The marks in the probe's own frame, x running from the gate (0) toward the probe, whose face is at D: the line of sight from
 *  the face straight through the vessel and on past its far wall; the sample volume's two bars across it; the flow axis through
 *  the gate, at phi (±θ) from the line. The angle itself is named only on the monitor (θ in its header): no arc and no θ on the
 *  figure (Mohammad, 20 Oct). */
export function probeShapes(D, r, phi = PROBE.ANGLE) {
  // (The line of sight ends at the near gate bar, and the flow axis reaches a little past both bars: Mohammad, 20 Oct.)
  const { at, half } = gateDims(r);
  const L = Math.min(36, Math.max(16, 1.7 * r)), p = rad(phi), c = Math.cos(p), s = Math.sin(p), f = (v) => +v.toFixed(1);
  // (The faded ultrasound beam: a narrow wedge from the probe's face, fading out past the vessel's far wall, under the line of sight.)
  const far = -(Math.max(0, r) + 10), k = Math.tan(rad(PROBE.BEAM_DEG)) * (D - far);
  return {
    wedge: `M${f(D)} 0 L${f(far)} ${f(-k)} L${f(far)} ${f(k)} Z`,
    beam: `M${f(D)} 0 L${f(at)} 0`,
    gate: `M${f(-at)} ${f(-half)} L${f(-at)} ${f(half)} M${f(at)} ${f(-half)} L${f(at)} ${f(half)}`,
    axis: `M${f(-L * c)} ${f(-L * s)} L${f(L * c)} ${f(L * s)}`,
    head: `translate(${f(D)} 0)`,
  };
}

// (The bars are drawn first and the flow axis over them, so the axis stays visible through the thicker bars.)
// The probe's head: a convex face, a neck and a handle with a light in the glow's colour. Every mark is white-lined on a black
// rim, so it reads on every vessel colour and theme.
const BODY = 'M2 -11 Q-3 0 2 11 L10 11 L18 6 L42 6 Q48 6 48 0 Q48 -6 42 -6 L18 -6 L10 -11 Z';
export const PROBE_SVG = '<svg class="dpr-svg" width="1" height="1" aria-hidden="true"><defs><linearGradient id="dpr-wedge" x1="1" y1="0" x2="0" y2="0">'
  + '<stop offset="0" stop-color="var(--dop-glow)" stop-opacity=".46"/><stop offset=".8" stop-color="var(--dop-glow)" stop-opacity=".22"/>'
  + '<stop offset="1" stop-color="var(--dop-glow)" stop-opacity="0"/></linearGradient></defs><g class="dpr-rot"><path class="dpr-wedge"/>'
  + '<path class="dpr-gate-rim dpr-bars"/><path class="dpr-gate dpr-bars"/>'
  + '<path class="dpr-rim-l dpr-beam"/><path class="dpr-line dpr-beam"/><path class="dpr-rim-l dpr-axis"/><path class="dpr-line dpr-axis"/>'
  + `<g class="dpr-head"><path class="dpr-cable" d="M47 0 L62 0"/><path class="dpr-rim" d="${BODY}"/><path class="dpr-body" d="${BODY}"/>`
  + '<path class="dpr-face" d="M2 -11 Q-3 0 2 11"/><circle class="dpr-light" cx="33" cy="0" r="3"/></g></g></svg>';
