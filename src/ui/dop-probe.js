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
// The line of sight always leaves the probe's face square, the body in line with it (Mohammad, 20 Oct: "The axis line of the Doppler
// should always be perpendicular to the probe"): the probe turns by swinging round the gate (stage.js eases it there).
export const PROBE = { ANGLE: 50, GAP: 80, SCALE: 1.35, LEN: 84, HALF: 17.5, EDGE: 8, BEAM_DEG: 7 };

/** The sample volume for a lumen of radius r (px on screen): two bars across the line of sight, each `at` px from the gate along
 *  it: the gate is half the vessel's width long, in its middle, as the Polish Ultrasound Society's standard sets it (Lechowicz and
 *  Elwertowski, J Ultrason 2015, p. 214), and the monitor's SV names it (doppler.js svMm); `half` px either side of it. */
export const gateDims = (r) => ({ at: Math.max(4, 0.5 * Math.max(0, r)), half: Math.min(10, Math.max(5, 0.5 * r)) });

const rad = (d) => (d * Math.PI) / 180;
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** overlap, but a box that reaches over an edge by no more than `give` px (its thinner side) does not count as over it. */
const overlapGive = (give) => (a, b) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 && Math.min(w, h) > give ? w * h : 0;
};

/** The probe's body box (stage px) with its face D px from the gate g, along the direction ang (degrees), at size k. */
export function bodyBox(g, ang, D, k = 1) {
  const cb = Math.cos(rad(ang)), sb = Math.sin(rad(ang)), fx = g[0] + D * cb, fy = g[1] + D * sb, xs = [], ys = [];
  const L = PROBE.LEN * k, H = PROBE.HALF * k;
  for (const [u, v] of [[-3, -H], [-3, H], [L, -H], [L, H]]) {
    xs.push(fx + u * cb - v * sb); ys.push(fy + u * sb + v * cb);
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Nearer distances (gate wall to face, px) the probe may come in to when neither side is clear at PROBE.GAP. */
const REACH = [58, 38, 28];
/** Farther ones, for a crowded figure (a phone's whole-body view): out past the drawings to the empty space beside them, as the
 *  FibroScan probe stands on the skin at the organ's edge. Each step out weighs as one step in (reach −1, −2). */
const FAR = [125, 170];

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
 *  points along the vessels and the organs' outlines drawn, [x, y, radius, weight (1: a vessel)] in stage px; each one under the
 *  probe's body counts its weight, under its line of sight half that (bodyOnly: the body's alone). At size `size` (bodyBox). */
export function busyAt(g, ang, D, r, busy, size = 1, bodyOnly = false) {
  if (!busy?.length) return 0;
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), far = gateDims(r).at, fx = g[0] + D * c, fy = g[1] + D * s;
  let n = 0;
  for (const [x, y, q = 0, k = 1] of busy) {
    const bx = x - fx, by = y - fy, bu = bx * c + by * s, bv = Math.abs(-bx * s + by * c);
    if (bu >= -3 - q && bu <= PROBE.LEN * size + q && bv <= PROBE.HALF * size + q + 3) { n += k; continue; }
    if (bodyOnly) continue;
    const dx = x - g[0], dy = y - g[1], u = dx * c + dy * s, v = Math.abs(-dx * s + dy * c);
    if (u > far + Math.max(0, r) + q && u < D && v <= 4 + q) n += 0.5 * k;
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
 * k: the probe's size (fitPose), its body and its distances shrinking with it.
 * ban: places (placeId) the probe has left on this layout and must not go back to while another is clear (createProbeMind); lock: it
 * holds the place it stands at while that is clear of the cards, whatever the labels do; slack: px a stood place may sit over a
 * card's edge or the stage's before it counts as covered (a card's edge easing, a vessel breathing: hysteresis).
 * Returns { side, rev, reach, k, ang (degrees, from the gate toward the probe), phi (the flow axis's θ ray, from the line of sight
 * toward the probe, degrees), D (gate to face, px), box (the body), lab, busy, clear, headOff (only the marks fit: the head fades) }.
 */
export function probePose({ g, t, r = 0, away = false, w, h, cards = [], keep = 0, side = 0, avoid = [], keepReach = 0, keepRev = false, busy = [], rev = false, k = 1, ban = [], lock = false, slack = 0 }) {
  const base = Math.atan2(t[1], t[0]) * 180 / Math.PI;
  const D0 = PROBE.GAP * k + Math.max(0, r), e = PROBE.EDGE;
  // (The place it stands at is measured against cards and an edge drawn in by `slack`: it stays clear through a few px of give.)
  const held = (s, reach, rev) => slack > 0 && !!keep && s === keep && reach === keepReach && rev === !!keepRev;
  const given = overlapGive(slack);
  // The pose at one side, end and distance.
  const pose = (s, D = D0, reach = 0, rev = false) => {
    const own = held(s, reach, rev), over = own ? given : overlap, ee = own ? e - slack : e;
    const inStage = (b) => b.x0 >= ee && b.y0 >= ee && b.x1 <= w - ee && b.y1 <= h - ee;
    const under = (b) => cards.some((c) => over(b, c) > 0);
    const aw = away !== rev, ang = base + s * (aw ? 180 - PROBE.ANGLE : PROBE.ANGLE);
    // (The flow runs at −s·θ from the line toward the probe (toward), or at 180° − s·(180° − θ) (away), whose reverse is s·θ.)
    const phi = (aw ? s : -s) * PROBE.ANGLE, lines = [...beamBoxes(g, ang, D, r), ...gateBoxes(g, ang, phi, r)];
    const labOf = (bs) => avoid.reduce((n, o) => n + bs.reduce((m, b) => m + overlap(b, o), 0), 0);
    const labL = labOf(lines), seen = inStage({ x0: Math.min(...lines.map((b) => b.x0)), y0: Math.min(...lines.map((b) => b.y0)), x1: Math.max(...lines.map((b) => b.x1)), y1: Math.max(...lines.map((b) => b.y1)) }) && !lines.some(under);
    const box = bodyBox(g, ang, D, k);
    // How much of the body lies off the stage or under a card (px²): 0 is clear.
    const off = (box.x1 - box.x0) * (box.y1 - box.y0) - overlap(box, { x0: ee, y0: ee, x1: w - ee, y1: h - ee });
    const hidden = cards.reduce((n, c) => n + over(box, c), 0);
    return { side: s, rev, reach, ang, lab: labL + labOf([box]), busy: busyAt(g, ang, D, r, busy, k), body: busyAt(g, ang, D, r, busy, k, true), phi, D, box, k, cost: off + hidden, clear: off + hidden === 0, seen };
  };
  if (side) return pose(side, D0, 0, rev);
  const at = (D, reach) => [1, -1].flatMap((s) => [pose(s, D, reach), pose(s, D, reach, true)]);
  // Every place clear of the slide's free space and the cards, at its usual distance or closer in (Mohammad, 20 Oct: visible
  // wherever there is room), or farther out past a crowded figure; none fits and it hides. Closer in counts too where the usual distance is busy: on a phone the only
  // places clear of the card at the usual distance can be the busiest (Sinusoidal 5/13: it stood on two vessels with an empty
  // spot beside the vessel just closer in, 20 Oct).
  const all = [...at(D0, 0), ...REACH.flatMap((n, i) => at(n * k + Math.max(0, r), i + 1)), ...FAR.flatMap((n, i) => at(n * k + Math.max(0, r), -(i + 1)))];
  const score = (p) => p.busy + (p.rev ? 3 : 0) + 2 * Math.abs(p.reach);
  const clear = all.filter((p) => p.clear), left = new Set(ban), fresh = clear.filter((p) => !left.has(placeId(p)));
  // (A place the probe has left on this layout is not gone back to while another is clear; with every clear place left, they all count.)
  const pool = fresh.length ? fresh : clear;
  if (!pool.length) {
    // No place for the whole probe: as the FibroScan probe does under a card (stage.js scanHead), the marks stay where they are on
    // screen and clear of the cards, and the head fades (headOff), the least of it covered; only with no such place does it hide.
    const marks = all.filter((p) => p.seen);
    if (marks.length) return { ...marks.reduce((m, p) => (p.cost !== m.cost ? (p.cost < m.cost ? p : m) : score(p) < score(m) ? p : m)), headOff: true };
    const a = pose(1), b = pose(-1);
    return { ...(a.cost <= b.cost ? a : b), none: true };
  }
  // (Fewer labels crossed first; then the quieter figure, the usual end and distance weighing a little (score);
  // a tie stands above the vessel, where the camera leaves more room.) quieter: clearly so, crossing no more labels, so a kept place
  // never flips over a point or two.
  const better = (p, m) => (p.lab !== m.lab ? p.lab < m.lab : score(p) !== score(m) ? score(p) < score(m) : p.reach !== m.reach ? Math.abs(p.reach) < Math.abs(m.reach) : p.box.y0 + p.box.y1 < m.box.y0 + m.box.y1);
  const quieter = (p, m) => p.lab <= m.lab && score(p) < 0.6 * score(m) - 2;
  const best = pool.reduce((m, p) => (better(p, m) ? p : m));
  const kept = keep && pool.find((p) => p.side === keep && p.reach === keepReach && p.rev === !!keepRev);
  if (!kept) return best;
  if (lock) return kept;
  return (kept.lab > 0 && best.lab === 0) || quieter(best, kept) ? best : kept;
}

/** The sizes the probe may shrink to (its body, its distance from the vessel and its head), largest first: Mohammad's pick, 20 Oct,
 *  "Smaller there": in a crowded zoomed-out view only, it shrinks until it fits clear; everywhere it fits it stays full size. */
export const SIZES = [1, 0.85, 0.7, 0.55];
/** Fits clear: on the free space, its head showing, crossing no label, and its body over at most QUIET points of the drawings (its
 *  line of sight must cross what lies between it and the vessel at any size). */
export const QUIET = 4;
const fits = (p) => !p.none && !p.headOff && p.lab === 0 && p.body <= QUIET;

/** The figure's scale (screen px per world unit) under which a view counts as zoomed out: a phone's whole-body view is about 0.3;
 *  a phone slide on the portal vein about 0.9, and a Mac's whole figure about 0.7, keep the full-size probe. */
export const ZOOMED_OUT = 0.6;
/** probePose at the largest size that fits clear (SIZES), the place kept only at the size it stood at (keepK); with none that fits,
 *  the size whose place is quietest (full size on a tie). Only in a zoomed-out view (sc < ZOOMED_OUT); elsewhere always full size.
 *  A smaller size it stands at is kept while its place still fits, unless full size fits: the labels make way for the probe, so
 *  the size one step up could fit only while it stands smaller, and it swung between the two (iPhone, Tests › Doppler, 20 Oct).
 *  Returns the pose with k, its size. */
export function fitPose({ sc = 1, ...o }) {
  const at = (k) => probePose({ ...o, k, ...(k === (o.keepK || 1) ? {} : { keep: 0 }) });
  const full = at(1);
  if (!(sc < ZOOMED_OUT) || fits(full)) return full;
  if (o.keep && o.keepK < 1 && SIZES.includes(o.keepK)) { const p = at(o.keepK); if (fits(p) && p.side === o.keep && p.reach === o.keepReach && p.rev === !!o.keepRev) return p; }
  let best = full;
  for (const k of SIZES.slice(1)) {
    const p = at(k);
    if (fits(p)) return p;
    if (!p.none && (best.none || (!p.headOff && best.headOff) || (p.headOff === best.headOff && p.lab + p.busy < best.lab + best.busy))) best = p;
  }
  return best;
}

/** Whether moving the probe from pose a to pose b ({ ang, d }: its direction from the gate, degrees, and its face's distance from
 *  the wall, px) is too far to swing there: past JUMP_DEG round the gate or JUMP_PX nearer or farther, an ease reads as the probe
 *  flying across the figure (Outflow 3→4, a card landing after it showed sent it round to the far side, Mohammad, 20 Oct), so it
 *  fades out where it stood and in at the new place. Smaller moves (a drag, a label making way) still swing in real time. */
export const JUMP_DEG = 75, JUMP_PX = 48;
export function probeJumps(a, b) {
  if (!a || !b) return false;
  const da = Math.abs(((((b.ang - a.ang) % 360) + 540) % 360) - 180);
  return da > JUMP_DEG || Math.abs(b.d - a.d) > JUMP_PX;
}

/** A place's name (probePose's side, reach, end and size), for remembering the ones the probe has left. */
export const placeId = (p) => `${p.side}|${p.reach}|${p.rev ? 1 : 0}|${p.k ?? 1}`;

/** Why the probe flashed on and off (Right heart 6, iPhone, 21 Oct): the probe and the figure's labels each make way for the other, and
 *  here a card above and another below leave it a few px of room, so a place that fit one frame did not the next (a label settling, a
 *  vessel breathing, a card's edge). Each miss hid it or sent it to another side with a fade; the labels re-laid out around the new
 *  place; the old one fit again. Nothing in that loop ever settled, so it faded out and in for as long as the slide stood.
 *  The remedies, each a hysteresis: a place it stands at keeps its fit through SLACK px of give; "no place" for under NONE_MS never
 *  hides it; a place it has left stays left (a fade in or out at it is never repeated) until the layout (the camera, the cards, the
 *  vessel) changes; and after LEAVES such moves on one layout it holds still, whatever the labels do. */
export const SLACK = 4, NONE_MS = 450, PEND_MS = 200, LEAVES = 2;

/** What the probe remembers between frames, and what it does with each pose (probeAct); stage.js carries the pictures out. */
export function createProbeMind() {
  const left = new Set();
  let sig = null, at = '', noneAt = null, pend = '', pendAt = 0;
  return {
    /** The layout the poses are worked out for (vessel, camera, stage, gate, cards): a different one forgets the places left. */
    sync(s) { if (s !== sig) { sig = s; left.clear(); } },
    /** The places to keep off (probePose ban) and whether it holds still (lock). */
    banned: () => [...left],
    locked: () => left.size >= LEAVES,
    /** It is hidden, or on another vessel: the place it stood at is no longer one it could leave. A fresh show waits again. */
    hide() { at = ''; pend = ''; noneAt = null; },
    /**
     * pose: from fitPose; tgt: where it would stand ({ ang, d, k, ax, r }); on, cur: whether it shows and where it is drawn; sig: what a
     * fresh show waits to see hold still; now (ms); instant: no waiting (reduced motion).
     * 'hide' (no place: fade out), 'hold' (no place yet: it stays as it is), 'restart' and 'wait' (hidden: its place has not held
     * still for PEND_MS), 'jump' (fade out, and in again at the new place) or 'go' (show it, or ease it to its place).
     */
    act({ pose, tgt, on, cur, sig: seen, now, instant = false }) {
      if (pose.none) {
        if (on) { if (noneAt === null) noneAt = now; if (now - noneAt < NONE_MS) return 'hold'; }
        this.hide();
        return 'hide';
      }
      noneAt = null;
      if (!on && !instant) {
        if (seen !== pend) { pend = seen; pendAt = now; return 'restart'; }
        if (now - pendAt < PEND_MS) return 'wait';
      }
      const id = placeId(pose);
      if (on && at && at !== id) left.add(at);
      if (on && cur && probeJumps(cur, tgt)) { at = ''; pend = ''; return 'jump'; }
      at = id;
      return 'go';
    },
  };
}

/** The marks in the probe's own frame, x running from the gate (0) toward the probe, whose face is at D: the line of sight from
 *  the face straight through the vessel and on past its far wall; the sample volume's two bars across it; the flow axis through
 *  the gate, at phi (±θ) from the line. The angle itself is named only on the monitor (θ in its header): no arc and no θ on the
 *  figure (Mohammad, 20 Oct). */
export function probeShapes(D, r, phi = PROBE.ANGLE, size = 1) {
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
    head: `translate(${f(D)} 0) scale(${size === 1 ? PROBE.SCALE : +(PROBE.SCALE * size).toFixed(3)})`,
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
