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

// The probe's shape, in CSS px along its axis from its face: drawn at SCALE (1.35: a bit bigger, Mohammad, 20 Oct), the body
// reaches 48 × 1.35 ≈ 65 px back and its cable stub on to 62 × 1.35 ≈ 84; 11 × 1.35 ≈ 15 px either side (17.5 with the outline).
// GAP: from the vessel's wall to the probe's face.
// BEAM_DEG: the faded ultrasound beam's half-angle (the first probe's narrow beam, which Mohammad missed, 20 Oct).
// ANGLE: the Doppler angle θ, the monitor's too (dopplerColor.js THETA reads it). Under 60° as the papers ask (McNaughton and
// Abu-Yousef, RadioGraphics 2011, Fig 2; Ferraioli's EFSUMB slides; Lechowicz and Elwertowski, J Ultrason 2015, p. 214): 60° was the limit itself.
export const PROBE = { ANGLE: 50, GAP: 80, SCALE: 1.35, LEN: 84, HALF: 17.5, EDGE: 8, BEAM_DEG: 7 };

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
const REACH = [58, 38, 28];

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

/** Boxes over the gate bars and along the flow axis through the gate (stage px), as probeShapes draws it, 4 px either side: the axis runs `phi` degrees from
 *  the line of sight at ang and reaches a little past the gate bars. Labels (the narrowing's "60 %" too) keep off it, and the probe
 *  weighs it with the line of sight when it picks a side. */
export function gateBoxes(g, ang, phi, r = 0, pad = 4) {
  const L = Math.min(36, Math.max(16, 1.7 * r)), a = rad(ang + phi), c = Math.cos(a), s = Math.sin(a), { at, half } = gateDims(r), q = Math.hypot(at, half) + pad;
  const out = [{ x0: g[0] - q, y0: g[1] - q, x1: g[0] + q, y1: g[1] + q }];   // (the two bars)
  for (let u = -L; u <= L + 0.01; u += 8) out.push({ x0: g[0] + u * c - pad, y0: g[1] + u * s - pad, x1: g[0] + u * c + pad, y1: g[1] + u * s + pad });
  return out;
}

/** How busy the figure is under a pose (Mohammad, 20 Oct: "in an area that's less busy, where not a lot of drawings"): busy holds
 *  points along the vessels drawn, [x, y, radius] in stage px; each one under the probe's body counts 1, under its line of sight ½. */
export function busyAt(g, ang, D, r, busy) {
  if (!busy?.length) return 0;
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), far = gateDims(r).at;
  let n = 0;
  for (const [x, y, q = 0] of busy) {
    const dx = x - g[0], dy = y - g[1], u = dx * c + dy * s, v = Math.abs(-dx * s + dy * c);
    if (u >= D - 3 - q && u <= D + PROBE.LEN + q && v <= PROBE.HALF + q + 3) n += 1;
    else if (u > far + Math.max(0, r) + q && u < D && v <= 4 + q) n += 0.5;
  }
  return n;
}

/**
 * Where the probe stands. g: the gate (stage px); t: the vessel's direction there, as its blood normally runs (any length);
 * r: the lumen's radius (px); away: the flow runs away from the probe; w, h: the stage; cards: boxes the probe keeps off;
 * keep: the side it stood on (1 or −1; 0: none), with keepReach and keepRev, kept unless a better place is clearly better;
 * side (with rev): a place to use outright. avoid: the labels' and callouts' boxes: of the places clear of the cards, the one whose body and
 * line of sight cross fewer of them (a kept place moves when it crosses one and another crosses none: Mohammad, 20 Oct, the
 * probe's line had crossed "TIPS 110 cm/s" and a callout). busy: points along the vessels drawn (busyAt): then the quieter place.
 * Four places hold θ to the flow: either side of the vessel, and either way along it (rev: the probe looks at the flow from its
 * other end, the monitor's convention's mirror), the usual end first; rev only for a clearly quieter spot (Mohammad, 20 Oct:
 * "have the US probe rotate and be in an area that's less busy").
 * Returns { side, rev, reach, ang (degrees, from the gate toward the probe), phi (the flow axis's θ ray, from the line of sight
 * toward the probe, degrees), D (gate to face, px), box (the body), lab, busy, clear }.
 */
export function probePose({ g, t, r = 0, away = false, w, h, cards = [], keep = 0, side = 0, avoid = [], keepReach = 0, keepRev = false, busy = [], rev = false }) {
  const base = Math.atan2(t[1], t[0]) * 180 / Math.PI;
  const D0 = PROBE.GAP + Math.max(0, r);
  const pose = (s, D = D0, reach = 0, rev = false) => {
    const aw = away !== rev, ang = base + s * (aw ? 180 - PROBE.ANGLE : PROBE.ANGLE), box = bodyBox(g, ang, D), e = PROBE.EDGE;
    // How much of the body lies off the stage or under a card (px²): 0 is clear.
    const off = (box.x1 - box.x0) * (box.y1 - box.y0) - overlap(box, { x0: e, y0: e, x1: w - e, y1: h - e });
    const hidden = cards.reduce((n, c) => n + overlap(box, c), 0);
    // (The flow runs at −s·θ from the line toward the probe (toward), or at 180° − s·(180° − θ) (away), whose reverse is s·θ.)
    const phi = (aw ? s : -s) * PROBE.ANGLE, marks = [box, ...beamBoxes(g, ang, D, r), ...gateBoxes(g, ang, phi, r)], lab = avoid.reduce((n, o) => n + marks.reduce((m, b) => m + overlap(b, o), 0), 0);
    return { side: s, rev, reach, ang, lab, busy: busyAt(g, ang, D, r, busy), phi, D, box, cost: off + hidden, clear: off + hidden === 0 };
  };
  if (side) return pose(side, D0, 0, rev);
  const at = (D, reach) => [1, -1].flatMap((s) => [pose(s, D, reach), pose(s, D, reach, true)]);
  // Every place clear of the slide's free space and the cards, at its usual distance or closer in (Mohammad, 20 Oct: visible
  // wherever there is room); none fits and it hides. Closer in counts too where the usual distance is busy: on a phone the only
  // places clear of the card at the usual distance can be the busiest (Sinusoidal 5/13: it stood on two vessels with an empty
  // spot beside the vessel just closer in, 20 Oct).
  const pool = [...at(D0, 0), ...REACH.flatMap((n, i) => at(n + Math.max(0, r), i + 1))].filter((p) => p.clear);
  if (!pool.length) { const a = pose(1), b = pose(-1); return { ...(a.cost <= b.cost ? a : b), none: true }; }
  // (Fewer labels crossed first; then the quieter figure, the usual end and distance weighing a little (score); a tie stands
  // above the vessel, where the camera leaves more room.) quieter: clearly so, crossing no more labels, so a kept place never
  // flips over a point or two.
  const score = (p) => p.busy + (p.rev ? 3 : 0) + 2 * p.reach;
  const better = (p, m) => (p.lab !== m.lab ? p.lab < m.lab : score(p) !== score(m) ? score(p) < score(m) : p.reach !== m.reach ? p.reach < m.reach : p.box.y0 + p.box.y1 < m.box.y0 + m.box.y1);
  const quieter = (p, m) => p.lab <= m.lab && score(p) < 0.6 * score(m) - 2;
  const best = pool.reduce((m, p) => (better(p, m) ? p : m));
  const k = keep && pool.find((p) => p.side === keep && p.reach === keepReach && p.rev === !!keepRev);
  if (!k) return best;
  return (k.lab > 0 && best.lab === 0) || quieter(best, k) ? best : k;
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
    head: `translate(${f(D)} 0) scale(${PROBE.SCALE})`,
  };
}

// (The gate bars are drawn last, on top of the line of sight and the flow axis: Mohammad, 20 Oct.)
// The probe's head: a convex face, a neck and a handle with a light in the glow's colour. Every mark is white-lined on a black
// rim, so it reads on every vessel colour and theme.
const BODY = 'M2 -11 Q-3 0 2 11 L10 11 L18 6 L42 6 Q48 6 48 0 Q48 -6 42 -6 L18 -6 L10 -11 Z';
export const PROBE_SVG = '<svg class="dpr-svg" width="1" height="1" aria-hidden="true"><defs><linearGradient id="dpr-wedge" x1="1" y1="0" x2="0" y2="0">'
  + '<stop offset="0" stop-color="var(--dop-glow)" stop-opacity=".46"/><stop offset=".8" stop-color="var(--dop-glow)" stop-opacity=".22"/>'
  + '<stop offset="1" stop-color="var(--dop-glow)" stop-opacity="0"/></linearGradient></defs><g class="dpr-rot"><path class="dpr-wedge"/>'
  + '<path class="dpr-rim-l dpr-beam"/><path class="dpr-line dpr-beam"/><path class="dpr-rim-l dpr-axis"/><path class="dpr-line dpr-axis"/>'
  + '<path class="dpr-gate-rim dpr-bars"/><path class="dpr-gate dpr-bars"/>'
  + `<g class="dpr-head"><path class="dpr-cable" d="M47 0 L62 0"/><path class="dpr-rim" d="${BODY}"/><path class="dpr-body" d="${BODY}"/>`
  + '<path class="dpr-face" d="M2 -11 Q-3 0 2 11"/><circle class="dpr-light" cx="33" cy="0" r="3"/></g></g></svg>';
