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

// Where along its drawn course the gate stands on a vessel whose middle is a poor place to sample (a stent has its thirds instead:
// stage-doppler.js). The hepatic artery's middle is where the paraumbilical vein crosses it (Mohammad, 7 Nov 2026: "the ultrasound of
// the hepatic artery is happening at the point where the paraumbilical vein crosses it, so it's confusing; move it closer to the
// bifurcation"), so its gate stands four fifths along, the way the blood runs, short of the fork into the right and left branches.
// (A_HEP's path runs from the celiac end to the hilum in the anatomy and the circuit alike; the crossing is at 0.475.)
export const GATE_FRAC = { A_HEP: 0.8 };
/** How far along the vessel's drawn course the gate stands (0 … 1), or null for the middle (the default). */
export const gateFrac = (id) => GATE_FRAC[id] ?? null;

// The probe's shape, in CSS px along its axis from its face: drawn at SCALE (1.35: a bit bigger, Mohammad, 20 Oct), the body
// reaches 48 × 1.35 ≈ 65 px back (no cable: Mohammad, 22 Oct, "remove the wire sticking out"; the room kept for it, 62 × 1.35 ≈ 84, stays, so the probe stands where it did); 11 × 1.35 ≈ 15 px either side (17.5 with the outline).
// GAP: from the vessel's wall to the probe's face.
// BEAM_DEG: the faded ultrasound beam's half-angle (the first probe's narrow beam, which Mohammad missed, 20 Oct).
// ANGLE: the Doppler angle θ, the monitor's too (dopplerColor.js THETA reads it). Under 60° as the papers ask (McNaughton and
// Abu-Yousef, RadioGraphics 2011, Fig 2; Ferraioli's EFSUMB slides; Lechowicz and Elwertowski, J Ultrason 2015, p. 214): 60° was the limit itself.
// The line of sight always leaves the probe's face square, the body in line with it (Mohammad, 20 Oct: "The axis line of the Doppler
// should always be perpendicular to the probe"): the probe turns by swinging round the gate (stage.js eases it there).
export const PROBE = { ANGLE: 50, GAP: 80, SCALE: 1.35, LEN: 84, HALF: 17.5, EDGE: 8, BEAM_DEG: 7, SWING: 60, OUT_MS: 420 };   // (SWING: how far, degrees, the probe turns round the gate to clear the view, and back; OUT_MS: that move)

// ── Nothing is made while the probe is placed (2 Nov 2026, scripts/off-gpu-scan.mjs alloc: the search made some forty poses, each with
// arrays of boxes, closures and spreads, every time a frame reached it). The search below writes into poses, lists and boxes made
// once, here; the functions the stage and the tests call by their old names give what they always gave (a new pose, a new box), made by
// the *Into forms they wrap. ──

const gateAt = (r) => Math.max(4, 0.5 * Math.max(0, r));
const gateHalf = (r) => Math.min(10, Math.max(5, 0.5 * r));
/** The sample volume for a lumen of radius r (px on screen): two bars across the line of sight, each `at` px from the gate along
 *  it: the gate is half the vessel's width long, in its middle, as the Polish Ultrasound Society's standard sets it (Lechowicz and
 *  Elwertowski, J Ultrason 2015, p. 214), and the monitor's SV names it (doppler.js svMm); `half` px either side of it. */
export const gateDims = (r) => ({ at: gateAt(r), half: gateHalf(r) });

const rad = (d) => (d * Math.PI) / 180;
const NO_LIST = [];   // (what an option left out stands for: read, never written)
/** The overlap (px²) of box a and box b, each as its four sides. */
const overlapN = (ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) => Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)) * Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
/** overlapN, but a box that reaches over an edge by no more than `give` px (its thinner side) does not count as over it. */
function overlapGiveN(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, give) {
  const w = Math.min(ax1, bx1) - Math.max(ax0, bx0), h = Math.min(ay1, by1) - Math.max(ay0, by0);
  return w > 0 && h > 0 && Math.min(w, h) > give ? w * h : 0;
}
const overlap = (a, b) => overlapN(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1);

/** Box lists as four columns of numbers and a count, written in place (the columns grow by being written past their end). */
const makeList = () => ({ x0: [], y0: [], x1: [], y1: [], n: 0 });
const LINES = makeList();   // (the line of sight's and the bars' boxes of the pose being worked out)
function addBox(L, x0, y0, x1, y1) { const i = L.n++; L.x0[i] = x0; L.y0[i] = y0; L.x1[i] = x1; L.y1[i] = y1; }

/** The probe's body box with its face D px from the gate g, along the direction ang (degrees), at size k, written into `out`. */
function bodyBoxInto(out, g, ang, D, k) {
  const cb = Math.cos(rad(ang)), sb = Math.sin(rad(ang)), fx = g[0] + D * cb, fy = g[1] + D * sb;
  const L = PROBE.LEN * k, H = PROBE.HALF * k;
  // (The corners (u, v): (-3, -H), (-3, H), (L, -H), (L, H).)
  const x0 = fx + -3 * cb - -H * sb, y0 = fy + -3 * sb + -H * cb, x1 = fx + -3 * cb - H * sb, y1 = fy + -3 * sb + H * cb;
  const x2 = fx + L * cb - -H * sb, y2 = fy + L * sb + -H * cb, x3 = fx + L * cb - H * sb, y3 = fy + L * sb + H * cb;
  out.x0 = Math.min(x0, x1, x2, x3); out.y0 = Math.min(y0, y1, y2, y3); out.x1 = Math.max(x0, x1, x2, x3); out.y1 = Math.max(y0, y1, y2, y3);
  return out;
}
/** The probe's body box (stage px) with its face D px from the gate g, along the direction ang (degrees), at size k. */
export function bodyBox(g, ang, D, k = 1) {
  return bodyBoxInto({ x0: 0, y0: 0, x1: 0, y1: 0 }, g, ang, D, k);
}

/** Nearer distances (gate wall to face, px) the probe may come in to when neither side is clear at PROBE.GAP. */
const REACH = [58, 38, 28];
/** Farther ones, for a crowded figure (a phone's whole-body view): out past the drawings to the empty space beside them, as the
 *  FibroScan probe stands on the skin at the organ's edge. Each step out weighs as one step in (reach −1, −2). */
const FAR = [125, 170];

/** Appends to L the boxes along the probe's line of sight (stage px), from its face D px out along ang back through the gate g and past
 *  the vessel's far wall (as probeShapes draws it), each pad px either side of the line. */
function beamInto(L, g, ang, D, r, pad) {
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), far = gateAt(r), n = Math.max(1, Math.ceil((D - far) / 8));
  for (let i = 0; i <= n; i++) {
    const u = far + ((D - far) * i) / n, x = g[0] + u * c, y = g[1] + u * s;
    addBox(L, x - pad, y - pad, x + pad, y + pad);
  }
}
/** Appends to L the boxes over the faded ultrasound wedge (stage px), as probeShapes draws it. */
function wedgeInto(L, g, ang, D, r, pad) {
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), far = -(Math.max(0, r) + 10), tn = Math.tan(rad(PROBE.BEAM_DEG)), u0 = far + 0.1 * (D - far);
  const n = Math.max(1, Math.ceil((D - u0) / 8));
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((D - u0) * i) / n, x = g[0] + u * c, y = g[1] + u * s, h = tn * (D - u) + pad + (D - u0) / n / 2;   // (half a step more, so the boxes meet along the axis)
    addBox(L, x - h, y - h, x + h, y + h);
  }
}
/** Appends to L the boxes over the gate bars and along the flow axis through the gate (stage px), as probeShapes draws it. */
function gateInto(L, g, ang, phi, r, pad) {
  const Ln = Math.min(36, Math.max(16, 1.7 * r)), a = rad(ang + phi), c = Math.cos(a), s = Math.sin(a), at = gateAt(r), half = gateHalf(r), q = Math.hypot(at, half) + pad;
  addBox(L, g[0] - q, g[1] - q, g[0] + q, g[1] + q);   // (the two bars)
  for (let u = -Ln; u <= Ln + 0.01; u += 8) addBox(L, g[0] + u * c - pad, g[1] + u * s - pad, g[0] + u * c + pad, g[1] + u * s + pad);
}

// The boxes the stage and the labels keep off, handed out as the module's own: lists of boxes made once (BOX_CAP of each; a probe is never
// near that many, a box every 8 px of its line of sight), written over by the next call of the same function. The stage keeps what it gets
// only to its next call of the three together, which writes them all over and takes them again (dprobePaint's dpr.marks); a caller that
// keeps one longer copies it. Not for a search: probePose works in its own.
const BOX_CAP = 512;
const makeBoxes = () => { const a = []; for (let i = 0; i < BOX_CAP; i++) a.push({ x0: 0, y0: 0, x1: 0, y1: 0 }); return a; };
const BEAM_POOL = makeBoxes(), WEDGE_POOL = makeBoxes(), GATE_POOL = makeBoxes();
const BEAM_OUT = [], WEDGE_OUT = [], GATE_OUT = [], MARKS = makeList();
function handOut(L, pool, out) {
  const n = Math.min(L.n, BOX_CAP);
  for (let i = 0; i < n; i++) { const b = pool[i]; b.x0 = L.x0[i]; b.y0 = L.y0[i]; b.x1 = L.x1[i]; b.y1 = L.y1[i]; out[i] = b; }
  out.length = n;
  return out;
}
/** Boxes along the probe's line of sight (stage px), from its face D px out along ang back through the gate g and past the
 *  vessel's far wall (as probeShapes draws it), each pad px either side of the line: what labels keep off, and what the probe
 *  weighs against the labels and callouts when it picks a side. */
export function beamBoxes(g, ang, D, r = 0, pad = 4) {
  MARKS.n = 0;
  beamInto(MARKS, g, ang, D, r, pad);
  return handOut(MARKS, BEAM_POOL, BEAM_OUT);
}

/** Boxes over the faded ultrasound wedge (stage px), as probeShapes draws it: from the probe's face, widening to past the vessel's far
 *  wall, `pad` px around it. The line of sight's boxes stop at the near gate bar and are 4 px wide, so a label beside the vessel or
 *  just past it was kept off the line but not off the cone: the wedge overdrew the first letters of "Portal vein" on After the
 *  sinusoids 11. Its last tenth, where the fade has all but gone, is left out. */
export function wedgeBoxes(g, ang, D, r = 0, pad = 2) {
  MARKS.n = 0;
  wedgeInto(MARKS, g, ang, D, r, pad);
  return handOut(MARKS, WEDGE_POOL, WEDGE_OUT);
}

/** Boxes over the gate bars and along the flow axis through the gate (stage px), as probeShapes draws it, 4 px either side: the axis runs `phi` degrees from
 *  the line of sight at ang and reaches a little past the gate bars. Labels (the narrowing's "60 %" too) keep off it, and the probe
 *  weighs it with the line of sight when it picks a side. */
export function gateBoxes(g, ang, phi, r = 0, pad = 4) {
  MARKS.n = 0;
  gateInto(MARKS, g, ang, phi, r, pad);
  return handOut(MARKS, GATE_POOL, GATE_OUT);
}

/** How busy the figure is under a pose (Mohammad, 20 Oct: "in an area that's less busy, where not a lot of drawings"): busy holds
 *  points along the vessels and the organs' outlines drawn, [x, y, radius, weight (1: a vessel)] in stage px; each one under the
 *  probe's body counts its weight, under its line of sight half that (bodyOnly: the body's alone). At size `size` (bodyBox). */
export function busyAt(g, ang, D, r, busy, size = 1, bodyOnly = false) {
  if (!busy?.length) return 0;
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), far = gateAt(r), fx = g[0] + D * c, fy = g[1] + D * s;
  let n = 0;
  for (let i = 0; i < busy.length; i++) {
    const b = busy[i], x = b[0], y = b[1], q = b[2] === undefined ? 0 : b[2], k = b[3] === undefined ? 1 : b[3];
    const bx = x - fx, by = y - fy, bu = bx * c + by * s, bv = Math.abs(-bx * s + by * c);
    if (bu >= -3 - q && bu <= PROBE.LEN * size + q && bv <= PROBE.HALF * size + q + 3) { n += k; continue; }
    if (bodyOnly) continue;
    const dx = x - g[0], dy = y - g[1], u = dx * c + dy * s, v = Math.abs(-dx * s + dy * c);
    if (u > far + Math.max(0, r) + q && u < D && v <= 4 + q) n += 0.5 * k;
  }
  return n;
}

// ── A pose, and the search over places ──
/** A pose to be written over: the fields probePose gives (box: its four sides), and headOff, none (undefined unless set). */
const makePose = () => ({ side: 0, rev: false, reach: 0, ang: 0, lab: 0, busy: 0, body: 0, phi: 0, D: 0, box: { x0: 0, y0: 0, x1: 0, y1: 0 }, k: 1, cost: 0, clear: false, seen: false, headOff: undefined, none: undefined });
/** A pose to give probePoseInto / fitPoseInto to write over, made once where the figure is set up. */
export const makeProbePose = makePose;
function copyPose(d, s) {
  d.side = s.side; d.rev = s.rev; d.reach = s.reach; d.ang = s.ang; d.lab = s.lab; d.busy = s.busy; d.body = s.body; d.phi = s.phi; d.D = s.D;
  d.box.x0 = s.box.x0; d.box.y0 = s.box.y0; d.box.x1 = s.box.x1; d.box.y1 = s.box.y1;
  d.k = s.k; d.cost = s.cost; d.clear = s.clear; d.seen = s.seen; d.headOff = s.headOff; d.none = s.none;
}
const PLACES = 4 + 4 * (REACH.length + FAR.length);   // (every side, end and distance probePose looks at)
const PLACE_POSES = [], FIT_A = makePose(), FIT_B = makePose();
for (let i = 0; i < PLACES + 2; i++) PLACE_POSES.push(makePose());
const CLEAR_AT = [], FRESH_AT = [];   // (indexes into PLACE_POSES, written in place)

// What probePose's options stand for while one search runs (set by setSearch; the search is never nested).
let cG = null, cR = 0, cAway = false, cW = 0, cH = 0, cCards = NO_LIST, cAvoid = NO_LIST, cBusy = NO_LIST, cKeep = 0, cKeepReach = 0, cKeepRev = false, cSlack = 0, cK = 1, cBase = 0, cD0 = 0;
function setSearch(o, k, keep) {
  cG = o.g; cR = o.r === undefined ? 0 : o.r; cAway = o.away === undefined ? false : o.away; cW = o.w; cH = o.h;
  cCards = o.cards === undefined ? NO_LIST : o.cards; cAvoid = o.avoid === undefined ? NO_LIST : o.avoid; cBusy = o.busy === undefined ? NO_LIST : o.busy;
  cKeepReach = o.keepReach === undefined ? 0 : o.keepReach; cKeepRev = o.keepRev === undefined ? false : o.keepRev; cSlack = o.slack === undefined ? 0 : o.slack;
  cK = k; cKeep = keep; cBase = Math.atan2(o.t[1], o.t[0]) * 180 / Math.PI; cD0 = PROBE.GAP * k + Math.max(0, cR);
}
/** The pose at one side, end and distance, written into p. */
function fillPose(p, s, D, reach, rev) {
  // (The place it stands at is measured against cards and an edge drawn in by `slack`: it stays clear through a few px of give.)
  const own = cSlack > 0 && !!cKeep && s === cKeep && reach === cKeepReach && rev === !!cKeepRev, ee = own ? PROBE.EDGE - cSlack : PROBE.EDGE;
  const aw = cAway !== rev, ang = cBase + s * (aw ? 180 - PROBE.ANGLE : PROBE.ANGLE);
  // (The flow runs at −s·θ from the line toward the probe (toward), or at 180° − s·(180° − θ) (away), whose reverse is s·θ.)
  const phi = (aw ? s : -s) * PROBE.ANGLE, L = LINES;
  L.n = 0;
  beamInto(L, cG, ang, D, cR, 4);
  gateInto(L, cG, ang, phi, cR, 4);
  let labL = 0;
  for (let a = 0; a < cAvoid.length; a++) {
    const o = cAvoid[a];
    let m = 0;
    for (let i = 0; i < L.n; i++) m += overlapN(L.x0[i], L.y0[i], L.x1[i], L.y1[i], o.x0, o.y0, o.x1, o.y1);
    labL += m;
  }
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity, under = false;
  for (let i = 0; i < L.n; i++) {
    mnx = Math.min(mnx, L.x0[i]); mny = Math.min(mny, L.y0[i]); mxx = Math.max(mxx, L.x1[i]); mxy = Math.max(mxy, L.y1[i]);
    if (!under) for (let c = 0; c < cCards.length; c++) {
      const k = cCards[c];
      if ((own ? overlapGiveN(L.x0[i], L.y0[i], L.x1[i], L.y1[i], k.x0, k.y0, k.x1, k.y1, cSlack) : overlapN(L.x0[i], L.y0[i], L.x1[i], L.y1[i], k.x0, k.y0, k.x1, k.y1)) > 0) { under = true; break; }
    }
  }
  const seen = mnx >= ee && mny >= ee && mxx <= cW - ee && mxy <= cH - ee && !under;
  const box = bodyBoxInto(p.box, cG, ang, D, cK);
  // How much of the body lies off the stage or under a card (px²): 0 is clear.
  const off = (box.x1 - box.x0) * (box.y1 - box.y0) - overlapN(box.x0, box.y0, box.x1, box.y1, ee, ee, cW - ee, cH - ee);
  let hidden = 0, labB = 0;
  for (let c = 0; c < cCards.length; c++) {
    const k = cCards[c];
    hidden += own ? overlapGiveN(box.x0, box.y0, box.x1, box.y1, k.x0, k.y0, k.x1, k.y1, cSlack) : overlapN(box.x0, box.y0, box.x1, box.y1, k.x0, k.y0, k.x1, k.y1);
  }
  for (let a = 0; a < cAvoid.length; a++) labB += 0 + overlap(box, cAvoid[a]);
  p.side = s; p.rev = rev; p.reach = reach; p.ang = ang; p.lab = labL + labB;
  p.busy = busyAt(cG, ang, D, cR, cBusy, cK); p.body = busyAt(cG, ang, D, cR, cBusy, cK, true);
  p.phi = phi; p.D = D; p.k = cK; p.cost = off + hidden; p.clear = off + hidden === 0; p.seen = seen; p.headOff = undefined; p.none = undefined;
}
/** The four poses at one distance and reach (each side, each end) from PLACE_POSES[n]; the next free index. */
function fillAt(n, D, reach) {
  fillPose(PLACE_POSES[n++], 1, D, reach, false); fillPose(PLACE_POSES[n++], 1, D, reach, true);
  fillPose(PLACE_POSES[n++], -1, D, reach, false); fillPose(PLACE_POSES[n++], -1, D, reach, true);
  return n;
}
const placeScore = (p) => p.busy + (p.rev ? 3 : 0) + 2 * Math.abs(p.reach);

/**
 * Where the probe stands, written into `dst`. g: the gate (stage px); t: the vessel's direction there, as its blood normally runs (any length);
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
 */
function search(o, k, keep, dst) {
  setSearch(o, k, keep);
  const side = o.side === undefined ? 0 : o.side, rev = o.rev === undefined ? false : o.rev;
  if (side) { fillPose(dst, side, cD0, 0, rev); return; }
  // Every place clear of the slide's free space and the cards, at its usual distance or closer in (Mohammad, 20 Oct: visible
  // wherever there is room), or farther out past a crowded figure; none fits and it hides. Closer in counts too where the usual distance is busy: on a phone the only
  // places clear of the card at the usual distance can be the busiest (Sinusoidal 5/13: it stood on two vessels with an empty
  // spot beside the vessel just closer in, 20 Oct).
  let n = fillAt(0, cD0, 0);
  for (let i = 0; i < REACH.length; i++) n = fillAt(n, REACH[i] * k + Math.max(0, cR), i + 1);
  for (let i = 0; i < FAR.length; i++) n = fillAt(n, FAR[i] * k + Math.max(0, cR), -(i + 1));
  let nClear = 0, nFresh = 0;
  const ban = o.ban === undefined ? NO_LIST : o.ban;
  for (let i = 0; i < n; i++) {
    const p = PLACE_POSES[i];
    if (!p.clear) continue;
    CLEAR_AT[nClear++] = i;
    // (A place the probe has left on this layout is not gone back to while another is clear; with every clear place left, they all count.)
    const id = placeIdOf(p);
    let left = false;
    if (id !== null) for (let b = 0; b < ban.length; b++) if (ban[b] === id) { left = true; break; }
    if (!left) FRESH_AT[nFresh++] = i;
  }
  const pool = nFresh ? FRESH_AT : CLEAR_AT, nPool = nFresh || nClear;
  if (!nPool) {
    // No place for the whole probe: as the FibroScan probe does under a card (stage.js scanHead), the marks stay where they are on
    // screen and clear of the cards, and the head fades (headOff), the least of it covered; only with no such place does it hide.
    let m = -1;
    for (let i = 0; i < n; i++) {
      const p = PLACE_POSES[i];
      if (!p.seen) continue;
      if (m < 0) { m = i; continue; }
      const q = PLACE_POSES[m];
      if (p.cost !== q.cost ? p.cost < q.cost : placeScore(p) < placeScore(q)) m = i;
    }
    if (m >= 0) { copyPose(dst, PLACE_POSES[m]); dst.headOff = true; return; }
    const a = PLACE_POSES[n], b = PLACE_POSES[n + 1];
    fillPose(a, 1, cD0, 0, false); fillPose(b, -1, cD0, 0, false);
    copyPose(dst, a.cost <= b.cost ? a : b);
    dst.none = true;
    return;
  }
  // (Fewer labels crossed first; then the quieter figure, the usual end and distance weighing a little (score);
  // a tie stands above the vessel, where the camera leaves more room.) quieter: clearly so, crossing no more labels, so a kept place
  // never flips over a point or two.
  let best = PLACE_POSES[pool[0]];
  for (let i = 1; i < nPool; i++) {
    const p = PLACE_POSES[pool[i]];
    const better = p.lab !== best.lab ? p.lab < best.lab : placeScore(p) !== placeScore(best) ? placeScore(p) < placeScore(best) : p.reach !== best.reach ? Math.abs(p.reach) < Math.abs(best.reach) : p.box.y0 + p.box.y1 < best.box.y0 + best.box.y1;
    if (better) best = p;
  }
  let kept = null;
  if (keep) for (let i = 0; i < nPool; i++) { const p = PLACE_POSES[pool[i]]; if (p.side === keep && p.reach === cKeepReach && p.rev === !!cKeepRev) { kept = p; break; } }
  if (!kept) { copyPose(dst, best); return; }
  if (o.lock !== undefined && o.lock) { copyPose(dst, kept); return; }
  copyPose(dst, (kept.lab > 0 && best.lab === 0) || (best.lab <= kept.lab && placeScore(best) < 0.6 * placeScore(kept) - 2) ? best : kept);
}

/**
 * Where the probe stands, written into `out` (makeProbePose), which it returns. o: { g, t, r, away, w, h, cards, keep, side, rev,
 * avoid, keepReach, keepRev, busy, k, ban, lock, slack }, each as described at search; nothing is made.
 * Gives { side, rev, reach, k, ang (degrees, from the gate toward the probe), phi (the flow axis's θ ray, from the line of sight
 * toward the probe, degrees), D (gate to face, px), box (the body), lab, busy, clear, headOff (only the marks fit: the head fades) }.
 */
export function probePoseInto(out, o) {
  search(o, o.k === undefined ? 1 : o.k, o.keep === undefined ? 0 : o.keep, out);
  return out;
}
/** probePoseInto, into a new pose. */
export function probePose(o) {
  return probePoseInto(makePose(), o);
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
 *  Written into `out` (makeProbePose), which it returns, with k, its size; nothing is made. o is probePoseInto's, and sc, keepK. */
export function fitPoseInto(out, o) {
  const sc = o.sc === undefined ? 1 : o.sc, keepK = o.keepK || 1, keep = o.keep === undefined ? 0 : o.keep;
  let best = FIT_A, cur = FIT_B;
  search(o, 1, keepK === 1 ? keep : 0, best);
  if (!(sc < ZOOMED_OUT) || fits(best)) { copyPose(out, best); return out; }
  if (o.keep && o.keepK < 1 && SIZES.includes(o.keepK)) {
    search(o, o.keepK, keep, cur);
    if (fits(cur) && cur.side === o.keep && cur.reach === o.keepReach && cur.rev === !!o.keepRev) { copyPose(out, cur); return out; }
  }
  for (let i = 1; i < SIZES.length; i++) {
    const k = SIZES[i];
    search(o, k, k === keepK ? keep : 0, cur);
    if (fits(cur)) { copyPose(out, cur); return out; }
    if (!cur.none && (best.none || (!cur.headOff && best.headOff) || (cur.headOff === best.headOff && cur.lab + cur.busy < best.lab + best.busy))) { const t = best; best = cur; cur = t; }
  }
  copyPose(out, best);
  return out;
}
/** fitPoseInto, into a new pose. */
export function fitPose(o) {
  return fitPoseInto(makePose(), o);
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
// Every place probePose looks at (a side, a reach, an end and a size of SIZES) has its name made once, here, and a number for it: the
// search and the probe's memory meet places by number and by these names, never making one. A pose off these (a size outside SIZES) has
// no number and no name there: it is never banned, and the memory does not keep it.
const REACH_AT = FAR.length, REACH_N = FAR.length + 1 + REACH.length;
const PLACE_NAME = [];
for (let si = 0; si < 2; si++) for (let ri = 0; ri < REACH_N; ri++) for (let rv = 0; rv < 2; rv++) for (let ki = 0; ki < SIZES.length; ki++) PLACE_NAME.push(placeId({ side: si ? -1 : 1, reach: ri - REACH_AT, rev: !!rv, k: SIZES[ki] }));
/** The number of a place (index into the names), −1 when it is none of the ones looked at. */
function placeCode(p) {
  const si = p.side === 1 ? 0 : p.side === -1 ? 1 : -1, reach = p.reach, kk = p.k ?? 1;
  if (si < 0 || !Number.isInteger(reach) || reach < -REACH_AT || reach > REACH.length) return -1;
  let ki = -1;
  for (let j = 0; j < SIZES.length; j++) if (SIZES[j] === kk) { ki = j; break; }
  if (ki < 0) return -1;
  return ((si * REACH_N + (reach + REACH_AT)) * 2 + (p.rev ? 1 : 0)) * SIZES.length + ki;
}
/** A place's name as placeId gives it, from the names made ahead; null for a place off those. */
function placeIdOf(p) {
  const c = placeCode(p);
  return c < 0 ? null : PLACE_NAME[c];
}

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
  const left = [], leftOut = [];   // (the places left, by name, in the order left; the copy banned() hands out, written over each call)
  let sig = null, at = '', noneAt = null, pend = '', pendAt = 0;
  return {
    /** The layout the poses are worked out for (vessel, camera, stage, gate, cards): a different one forgets the places left. */
    sync(s) { if (s !== sig) { sig = s; left.length = 0; } },
    /** The places to keep off (probePose ban) and whether it holds still (lock). The list is the mind's own, written over by the next call. */
    banned() {
      leftOut.length = left.length;
      for (let i = 0; i < left.length; i++) leftOut[i] = left[i];
      return leftOut;
    },
    locked: () => left.length >= LEAVES,
    /** It is hidden, or on another vessel: the place it stood at is no longer one it could leave. A fresh show waits again. */
    hide() { at = ''; pend = ''; noneAt = null; },
    /**
     * pose: from fitPose; tgt: where it would stand ({ ang, d, k, ax, r }); on, cur: whether it shows and where it is drawn; sig: what a
     * fresh show waits to see hold still; now (ms); instant: no waiting (reduced motion); swing: the cards are moving under it (the
     * readings' card tucking or coming out, and the camera refit after), so a far place is swung to, never faded out and in at.
     * 'hide' (no place: fade out), 'hold' (no place yet: it stays as it is), 'restart' and 'wait' (hidden: its place has not held
     * still for PEND_MS), 'jump' (fade out, and in again at the new place) or 'go' (show it, or ease it to its place).
     */
    act({ pose, tgt, on, cur, sig: seen, now, instant = false, swing = false }) {
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
      const id = placeIdOf(pose) ?? '';
      if (on && at && at !== id && !left.includes(at)) left.push(at);
      if (on && cur && !swing && probeJumps(cur, tgt)) { at = ''; pend = ''; return 'jump'; }
      at = id;
      return 'go';
    },
  };
}

/** The marks' numbers in the probe's own frame, x running from the gate (0) toward the probe, whose face is at D: the line of sight from
 *  the face straight through the vessel and on past its far wall; the sample volume's two bars across it; the flow axis through
 *  the gate, at phi (±θ) from the line. The angle itself is named only on the monitor (θ in its header): no arc and no θ on the
 *  figure (Mohammad, 20 Oct). Written into `g` (makeProbeGeom), which it returns: nothing is made. The faded wedge runs from (dh, 0)
 *  to (far, ±wk), the line of sight from dh to bx1 on the axis, the bars at ±at across ±half, the flow axis through the gate to (±axx, ±axy)
 *  (the last three only while `open`), the head at dh at size hs. */
export const makeProbeGeom = () => ({ dh: 0, far: 0, wk: 0, bx1: 0, at: 0, half: 0, open: false, axx: 0, axy: 0, hs: PROBE.SCALE });
/** What the labels' GPU layer draws of the probe, kept by the stage and written in place a frame at a time: the gate's place (px), the turn
 *  (degrees), the whole probe's opacity, its head's, and the marks' numbers (makeProbeGeom). `live`: it has been placed at all. */
export const makeProbeDraw = () => ({ live: false, x: 0, y: 0, ang: 0, op: 0, headOp: 1, g: makeProbeGeom() });
export function probeGeomInto(g, D, r, phi = PROBE.ANGLE, size = 1, out = 0) {
  // (The line of sight ends at the near gate bar, and the flow axis reaches a little past both bars: Mohammad, 20 Oct.)
  // (`out`, 0 … 1: the probe is turning away from the vessel to clear the view (2 Nov 2026, Mohammad: "I want the Doppler probe to rotate";
  // "the point the Doppler targets cannot move"). The turn itself is the record's angle (probeTurn): the whole probe, face, line of sight and
  // faded beam, swings round the gate as one piece, so the target stays where it is and the face keeps its distance from it. Here only the
  // sample volume's bars and the flow axis, the target, close up about that same point as it goes, and open again as it returns. Every x
  // below is on the line of sight and every y is symmetric about it.)
  const gs = out <= 0 ? 1 : Math.max(0, 1 - out), at = gateAt(r) * gs;
  const L = Math.min(36, Math.max(16, 1.7 * r)) * gs, p = rad(phi);
  // (The faded ultrasound beam: a narrow wedge from the probe's face, fading out past the vessel's far wall, under the line of sight.)
  const far0 = -(Math.max(0, r) + 10);
  g.dh = D; g.far = far0; g.wk = Math.tan(rad(PROBE.BEAM_DEG)) * (D - far0);
  g.bx1 = at; g.at = at; g.half = gateHalf(r) * gs;
  // (A bar or the axis closed to nothing draws nothing: a round-ended line of no length is a dot.)
  g.open = gs > 0.04; g.axx = L * Math.cos(p); g.axy = L * Math.sin(p);
  g.hs = size === 1 ? PROBE.SCALE : PROBE.SCALE * size;
  return g;
}
/** The turn the probe is drawn at while it swings out of the way: its place's angle plus `sw` degrees (its swing, signed to turn away from
 *  the vessel's line) times `o`, how far it has gone (0 … 1). At 0 it is its place's angle exactly, whatever it did before. */
export const probeTurn = (ang, sw, o) => ang + sw * o;
/** Which way, and how far, the probe at this place turns to clear the view: PROBE.SWING degrees, in the sense that moves its line of sight
 *  further from the vessel's line without crossing it (a probe standing at 50° from the line turns on toward 110°, one at 130° back toward
 *  70°), so it never sweeps over the vessel. side: ±1 (the side it stands); toward: whether it stands at θ (50°) rather than 180° − θ. */
export const probeSwing = (side, toward) => side * (toward ? 1 : -1) * PROBE.SWING;

/** How much of the probe shows while it is drawn back by `oP` (0: at its place, 1: out): all of it until it has begun to leave, then
 *  fading as it goes (never in place), none once it is mostly out. The same curve out and in, so a probe reversed half way is continuous. */
export function probeFade(oP) {
  const t = Math.min(1, Math.max(0, (oP - 0.2) / 0.6));
  return 1 - t * t * (3 - 2 * t);
}

// (The gate bars are drawn last, on top of the line of sight and the flow axis: Mohammad, 20 Oct.)
// The probe's head: a convex face (a dark transducer band across the front, whatever the look, as a real probe's), a neck and a handle with a light in the glow's colour. Every mark is white-lined on a black
// rim, so it reads on every vessel colour and theme.
const BODY = 'M2 -11 Q-3 0 2 11 L10 11 L18 6 L42 6 Q48 6 48 0 Q48 -6 42 -6 L18 -6 L10 -11 Z';
// (A model only, since 1 Nov 2026: plain elements carrying the shapes' numbers and their look from app.css, drawn on the labels' GPU layer
// (label-gl.js drawProbe) and never painted by the page; no SVG. In the order the marks are drawn: wedge, line of sight, axis, bars, head.)
export const PROBE_MODEL = '<div class="dpr-svg"><i id="dpr-wedge">'
  + '<i class="dpr-stop" offset="0" style="stop-color:var(--dop-glow);stop-opacity:.46"></i><i class="dpr-stop" offset=".8" style="stop-color:var(--dop-glow);stop-opacity:.22"></i>'
  + '<i class="dpr-stop" offset="1" style="stop-color:var(--dop-glow);stop-opacity:0"></i></i><i class="dpr-rot"><i class="dpr-wedge"></i>'
  + '<i class="dpr-rim-l dpr-beam"></i><i class="dpr-line dpr-beam"></i><i class="dpr-rim-l dpr-axis"></i><i class="dpr-line dpr-axis"></i>'
  + '<i class="dpr-gate-rim dpr-bars"></i><i class="dpr-gate dpr-bars"></i>'
  + `<i class="dpr-head"><i class="dpr-rim" d="${BODY}"></i><i class="dpr-body" d="${BODY}"></i>`
  + '<i class="dpr-face" d="M2 -11 Q-3 0 2 11 L8 11 Q3 0 8 -11 Z"></i><i class="dpr-light" cx="33" cy="0" r="3"></i></i></i></div>';
