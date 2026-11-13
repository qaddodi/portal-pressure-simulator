// The circuit's resistors: the ratio each shows against the healthy liver, its reading as a figure label, and its zigzag record on the overlay painter.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, edgePresent } from '../engine/topology.js';
import { NODE_POS } from './anatomy.js';
import { dotRadius } from './circuit-nodes.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { store } from './store.js';
import { clamp, fmt } from './util.js';

export function createResistors(st, live) {
  const { EI, NI, SITE_DEF, geo, pointAt, recs, worldToLocalInto } = st;
  // A resistor's reading is a figure label (label-gl, the one style): "R liver ×2.3", at the middle of its own zigzag, world-anchored like
  // every figure label, so it moves with the figure through every pan, pinch and zoom. resMask: which readings have a value (the labels'
  // signature); RES_LABEL: its words; the key ("vs healthy liver") rides once, on the outermost reading.
  const RES_BIT = { rGut: 1, rColl: 2, rLiver: 4 }, RES_LABEL = { rLiver: 'R liver', rColl: 'R collaterals', rGut: 'R splanchnic' }, RES_FULL = { rLiver: 'Intrahepatic resistance', rColl: 'Collateral resistance', rGut: 'Splanchnic arteriolar resistance' };
  const resKeyOn = () => (live.resMask & 1 ? 'rGut' : live.resMask & 2 ? 'rColl' : live.resMask & 4 ? 'rLiver' : null);
  function resItem(k) {
    const d = SITE_DEF[k], ratio = d?.res ? resRatio(d.res) : null;
    if (ratio == null) return null;
    const v = '×' + fmt(ratio, ratio < 10 ? 1 : 0);
    const lines = [[{ t: RES_LABEL[k], size: 11.5, weight: 600, cls: 'lb-name' }, { t: v, size: 11.5, weight: 650, cls: 'lb-val', gap: 4 }]];
    if (resKeyOn() === k) lines.push([{ t: 'vs healthy liver', size: 9.5, weight: 500, cls: 'lb-name' }]);
    return { key: 'r:' + k, res: k, ratio, src: ['res', k], cls: 'node res', lines, align: 'middle', padX: 3, padY: 2, w: Math.max(...lines.map(live.lineW)), h: lines.reduce((a, l) => a + live.LINE_H(l), 0), label: `${RES_FULL[k]}: ${v} the healthy liver's resistance` };
  }
  const resPt = [0, 0], resTan = [0, 0];
  // (The distance from a box (x, y, w, h) to a segment: 0 when they cross.)
  const ptSegD = (px, py, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, t = clamp(((px - x0) * dx + (py - y0) * dy) / L, 0, 1); return Math.hypot(px - x0 - t * dx, py - y0 - t * dy); };
  const ptBoxD = (px, py, x, y, w, h) => Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h));
  function boxSegD(x, y, w, h, x0, y0, x1, y1) {
    let d = Math.min(ptBoxD(x0, y0, x, y, w, h), ptBoxD(x1, y1, x, y, w, h), ptSegD(x, y, x0, y0, x1, y1), ptSegD(x + w, y, x0, y0, x1, y1), ptSegD(x, y + h, x0, y0, x1, y1), ptSegD(x + w, y + h, x0, y0, x1, y1));
    for (let i = 0; i <= 8 && d > 0; i++) { const u = i / 8; d = Math.min(d, ptBoxD(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, x, y, w, h)); }   // (a segment crossing the box with both ends outside)
    return d;
  }
  // Where the reading's centre stands, stage-local, and the zigzag's anchor: the liver's between its two lobes' zigzags; the others beside theirs,
  // on the side away from the lane, clear of the zigzag's own amplitude and casing (as resPaint draws them).
  function resPlace(it) {
    const k = it.res;
    let ax, ay, cx, cy;
    if (k === 'rLiver') {
      const a = worldToLocalInto(resPt, 850, 345); ax = a[0]; ay = a[1]; cx = ax; cy = ay;
    } else {
      const q = k === 'rGut' ? geo.A_SMA?.cur && pointAt(geo.A_SMA.cur, 0.5) : geo.C1b?.cur && pointAt(geo.C1b.cur, 0.5);
      if (!q) return false;
      const a = worldToLocalInto(resPt, q[0], q[1]); ax = a[0]; ay = a[1];
      const b = worldToLocalInto(resTan, q[0] + q[2] * 10, q[1] + q[3] * 10), L = Math.hypot(b[0] - ax, b[1] - ay) || 1;
      const tx = (b[0] - ax) / L, ty = (b[1] - ay) / L;
      let nx = -ty, ny = tx;
      if (Math.abs(ny) >= Math.abs(nx) ? ny > 0 : nx < 0) { nx = -nx; ny = -ny; }   // (up, else to the right)
      const band = Math.max(RES_AMP * (live.CTM?.sc || 1), RES_MIN_AMP_PX) + resWidth(it.ratio ?? 1) / 2 + RES_OUTLINE;
      let off = band + 6 + Math.abs(nx) * it.w / 2 + Math.abs(ny) * it.h / 2;   // (clear of the zigzag and its outline)
      // (A slanted lane: the box's corner can still reach the zigzag's end beside it, as "R collaterals ×6.5" did on an upright phone, 13 Nov
      // 2026. It steps out along the normal until its box is the band and 4 px clear of the zigzag's whole run, 34 units each way.)
      const h = 34 * (live.CTM?.sc || 1), x0 = ax - tx * h, y0 = ay - ty * h, x1 = ax + tx * h, y1 = ay + ty * h;
      for (let i = 0; i < 40 && boxSegD(ax + nx * off - it.w / 2, ay + ny * off - it.h / 2, it.w, it.h, x0, y0, x1, y1) < band + 4; i++) off += 2;
      cx = ax + nx * off; cy = ay + ny * off;
    }
    it.ax = ax; it.ay = ay; it.x = cx - it.w / 2; it.y = cy - it.h / 2;
    return true;
  }
  // Resistance as ΔP / Q: the liver's lobes, each its venules, sinusoids and outflow in series, in parallel with each other.
  const LOBES = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];
  const rOf = (P, Q, id) => { const k = EI[id], e = EDGES[k]; return (P[NI[e.from]] - P[NI[e.to]]) / Math.max(1e-6, Math.abs(Q[k])); };
  const GUT_ART = ['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA'];
  function liverRes(P, Q) {
    let g = 0;
    for (let i = 0; i < LOBES.length; i++) { const ids = LOBES[i]; let r = 0; for (let j = 0; j < ids.length; j++) r += rOf(P, Q, ids[j]); g += 1 / Math.max(1e-6, r); }
    return 1 / g;
  }
  /** The ratio a resistor shows, or null when there is nothing to show (collaterals closed). */
  function resRatio(kind) {
    const hp = store.get().healthy, at = live.pinned()?.at, P = at?.P || live.F.Pf || live.F.P, Q = at?.Q || live.F.Qf || live.F.Q;
    if (!hp?.P || !hp?.Q) return null;
    const r0 = liverRes(hp.P, hp.Q);
    // (The live frame breathes a few percent around the settled value, so a liver within 8% of the healthy one reads exactly ×1.0, not ×0.9 and ×1.0 by turns.)
    if (kind === 'liver') { const r = liverRes(P, Q) / r0; return Math.abs(r - 1) < 0.08 ? 1 : r; }
    if (kind === 'gut') { let g = 0; for (let i = 0; i < GUT_ART.length; i++) g += 1 / Math.max(1e-6, rOf(P, Q, GUT_ART[i])); return 1 / g / r0; }
    let qc = 0;
    for (const e of EDGES) if (e.kind === 'collateral' && edgePresent(e, store.get().params)) qc += Math.max(0, Q[EI[e.id]]);
    if (qc * 0.06 < 0.05) return null;
    return (P[NI.CONF] - P[NI.IVCS]) / qc / r0;
  }
  // (3 Nov 2026, "Move figure labels and pills off the SVG model": the circuit's resistors are kept records (over-records.js), drawn by the
  // overlay painter beside the SVG overlays' groups: no element is made, and no attribute or style written, for a zigzag. recs: their layer.)
  const RES_KEYS = {};   // (each reading's key in the records, made once: res:<name>)
  for (const k of Object.keys(SITE_DEF)) RES_KEYS[k] = 'res:' + k;
  const resMade = new Map();   // k → { _segs (the zigzags' end points, what the figure's labels keep off: buildSegs), cur (the numbers the record was made from) }
  // A resistor's zigzag along a vessel: n teeth of amplitude amp (world units) from a to b, written into `out` at `at` (n + 2 points).
  const zigInto = (out, at, ax, ay, bx, by, n, amp) => {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    out[at++] = ax; out[at++] = ay;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, sgn = i % 2 ? -1 : 1; out[at++] = ax + dx * u + nx * amp * sgn; out[at++] = ay + dy * u + ny * amp * sgn; }
    out[at++] = bx; out[at++] = by;
    return at;
  };
  const r1 = (v) => Math.round(v * 10) / 10;   // (a zigzag's points to a tenth of a world unit, as its path text was written)
  // (6 Nov 2026, Mohammad, after the first pass grew the zigzag: "the resistor symbol should remain looking the same; the blood vessel under it
  // should be a bit faded; the resistor should connect exactly between the two points; should not grow in size; however, what we can do is
  // make it grow in thickness visibly; also give it a more prominent black outline; and change its color the more resistance it gives".)
  // So the zigzag keeps one shape at every resistance (6 teeth of 9 world units, at least 8 px on screen); the liver's runs on straight leads
  // from one station's dot to the next, its outline just meeting each ring. The resistance shows twice, with s = log2 R (R the ratio to the
  // healthy liver: s 0 at ×1, 1 at ×2, 2 at ×4):
  //   stroke 2.5 px at ×1, 6.9 px at ×2, 11.3 px at ×4, 13 px from ×5.3 (Mohammad, 6 Nov: "even thicker with more resistance"), scaled
  //   down in proportion where the zoom would let the teeth merge (resWidthFit);
  //   colour along --ok → --caution → --danger: green at ×1, amber at ×2, red from ×4.
  // A solid black outline (3 px each side) keeps it clear of every vessel in either theme, and the vessel under the liver's is veiled by the
  // stage's background (40%), so the symbol stands over it. A resistor the slide's words point at also takes a soft halo of the term's tone.
  const RES_AMP = 9, RES_TEETH = 6, RES_MIN_AMP_PX = 8, RES_OUTLINE = 3, RES_VEIL = 0.4;
  const resLog = (r) => Math.log2(Math.max(0.25, r || 1));
  const RES_W0 = 2.5, RES_W1 = 13, RES_WK = 4.4;
  const resWidth = (r) => Math.round(clamp(RES_W0 + RES_WK * resLog(r), RES_W0, RES_W1) * 10) / 10;
  // (Mohammad, 6 Nov: "make sure they don't merge into a band".) The widest a zigzag's line may be on screen and still read as teeth: its
  // parallel strokes (every other one, 2 tooth spacings apart) keep at least 2 px of black between their outlines, and the inside of each V
  // fills no deeper than 45% of the teeth's height (a round-joined stroke fills a V's tip to (w/2) / sin(its half angle)). len: the zigzag's
  // length, amp its amplitude (world units), scQ px per unit. Where that caps the line, the whole range is drawn in proportion below it, so
  // ×2 is still thinner than ×5 at every zoom.
  function resWidthFit(r, len, amp, scQ) {
    const sp = len / RES_TEETH, th = Math.atan2(2 * amp, sp);
    const capV = 1.8 * amp * scQ * Math.cos(th), capP = 2 * sp * Math.sin(th) * scQ - 2 * RES_OUTLINE - 2;
    const cap = clamp(Math.min(RES_W1, capV, capP), RES_W0, RES_W1), f = clamp(RES_WK * resLog(r) / (RES_W1 - RES_W0), 0, 1);
    return Math.round((RES_W0 + (cap - RES_W0) * f) * 10) / 10;
  }
  const resHeat = (r) => Math.round(clamp(resLog(r) / 2, 0, 1) * 20) / 20;
  const BLACK = [0, 0, 0], ramp = new Float64Array(9);   // (the ramp's three tokens' rgb, read in place)
  // The liver's two resistors: each from its lobe's sinusoid inlet to its central vein (the circuit's places of the two stations).
  const LIVER_ENDS = [['SIN_R', 'CV_R'], ['SIN_L', 'CV_L']].map(([a, b]) => [NODE_POS[a][1], NODE_POS[b][1], dotRadius('liver')]);
  const DOT_MIN_PX = 4, DOT_RING_OUT = 0.8;   // (as stage.js draws the stations' dots: at least 4 px, the ring half outside the radius)
  // A resistor: the veil over the vessel under it (the liver's), a halo when lit, its black outline, and its line, each along the segments.
  function resPaint(k, d, ratio) {
    let st = resMade.get(k);
    const want = live.sites.list?.includes(k) && ratio != null;
    const now = performance.now();
    if (!want) { if (st) { resMade.delete(k); live.resSegRev++; live.labelKey = null; recs.drop(RES_KEYS[k], now, reduceMotion.matches); live.recKick(); } return; }   // (faded out whole first, over D_SURFACE, then gone)
    if (!st) { st = { _segs: null, cur: null, d, ratio, lens: [] }; resMade.set(k, st); }   // alloc-rare: a resistor's record, made when it first shows
    // (Sizes kept in screen px are worked out at the scale now stepped a quarter octave, so a zoom rebuilds the record a few times, not each frame.)
    const sc = live.CTM?.sc > 0 ? live.CTM.sc : 1, scQ = 2 ** (Math.round(Math.log2(sc) * 4) / 4);
    const amp = Math.max(RES_AMP, RES_MIN_AMP_PX / scQ), w = resWidthFit(ratio, d.res === 'liver' ? live.RES_LIVER[2] - live.RES_LIVER[0] : 68, amp, scQ), heat = resHeat(ratio);
    const lens = st.lens;
    lens.length = 0;
    let n = 0, veil = 0;
    if (d.res === 'liver') {
      // Its leads: from each dot's ring (its outline just meeting it) to the zigzag's own ends, which stand where they always have.
      for (let i = 0, j = 0; i < LIVER_ENDS.length; i++, j += 4) {
        const [A, B, r0] = LIVER_ENDS[i], edge = Math.max(r0, DOT_MIN_PX / scQ) + DOT_RING_OUT + (w / 2 + RES_OUTLINE) / scQ;
        const zx0 = live.RES_LIVER[j], zy0 = live.RES_LIVER[j + 1], zx1 = live.RES_LIVER[j + 2], zy1 = live.RES_LIVER[j + 3];
        const at = n, lx0 = Math.min(A[0] + edge, zx0), lx1 = Math.max(B[0] - edge, zx1);
        if (lx0 < zx0) { live.resNow[n++] = lx0; live.resNow[n++] = A[1]; }
        n = zigInto(live.resNow, n, zx0, zy0, zx1, zy1, RES_TEETH, amp);
        if (lx1 > zx1) { live.resNow[n++] = lx1; live.resNow[n++] = B[1]; }
        lens.push(n - at);
      }
      veil = 8 * clamp(10 / (15 * sc), 1, 1.75) + 2;   // (the liver's lane in the circuit: 8 units, grown as the lanes grow when the map is small (stage-tubes), and a unit each side)
    } else {
      const q = d.res === 'gut' ? geo.A_SMA?.cur && pointAt(geo.A_SMA.cur, 0.5) : geo.C1b?.cur && pointAt(geo.C1b.cur, 0.5);
      if (q) { n = zigInto(live.resNow, n, q[0] - q[2] * 34, q[1] - q[3] * 34, q[0] + q[2] * 34, q[1] + q[3] * 34, RES_TEETH, amp); lens.push(n); }
    }
    for (let i = 0; i < n; i++) live.resNow[i] = r1(live.resNow[i]);
    veil = r1(veil);
    const lit = live.resLit.get(k);
    // Its look as numbers: lit, the stage's background (the veil), the lit tone, the width, the heat, the veil's width, and the line's
    // colour on the ramp (the rgb is the theme's tokens', read when the theme last changed).
    live.resKey[0] = lit ? 1 : 0; live.resKey[7] = w; live.resKey[8] = heat; live.resKey[9] = veil;
    live.tokenRGB('--stage-bg', live.resKey, 1);
    live.tokenRGB(lit ? live.toneToken(lit) : '--text', live.resKey, 4);
    live.tokenRGB('--ok', ramp, 0); live.tokenRGB('--caution', ramp, 3); live.tokenRGB('--danger', ramp, 6);
    const seg = heat < 0.5 ? 0 : 3, u = heat < 0.5 ? heat * 2 : (heat - 0.5) * 2;
    for (let c = 0; c < 3; c++) live.resKey[10 + c] = Math.round((ramp[seg + c] + (ramp[seg + 3 + c] - ramp[seg + c]) * u) * 1000) / 1000;
    let same = !!st.cur && st.cur.n === n;
    if (same) for (let i = 0; i < live.resKey.length; i++) if (st.cur.key[i] !== live.resKey[i]) { same = false; break; }
    if (same) for (let i = 0; i < n; i++) if (st.cur.pts[i] !== live.resNow[i]) { same = false; break; }
    st.d = d; st.ratio = ratio;
    st._bandPx = amp * sc + w / 2 + RES_OUTLINE;   // (half the drawn band in px, the teeth's reach, line and outline: what the labels keep off, buildSegs)
    if (!same) {
      // alloc-rare: a resistor's zigzag, colour or width changed (a slide's change, a theme, a resistance, a zoom's step), not a frame that kept them
      const polys = [], veils = [];
      for (let i = 0, o = 0; i < lens.length; o += lens[i], i++) {
        const p = live.resNow.slice(o, o + lens[i]);
        polys.push(p);
        veils.push(Float32Array.of(p[0], p[1], p[p.length - 2], p[p.length - 1]));
      }
      st.cur = { n, key: Array.from(live.resKey), pts: live.resNow.slice(0, n) };
      const was = st._segs ? JSON.stringify(st._segs) : '';
      st._segs = polys.map((p) => [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]]);   // (what the figure's labels keep off, buildSegs)
      // (A zigzag that comes or moves is laid out again around: the labels had been solved before it was drawn, and "Retroperitoneal" stood on it.)
      if (JSON.stringify(st._segs) !== was) { live.resSegRev++; live.labelKey = null; live.solveAsked = true; }
      const K = live.resKey, ink = [K[10], K[11], K[12]], parts = [];
      if (polys.length) {
        if (veil) parts.push({ polys: veils, kind: 'stroke', cap: 0, a: RES_VEIL, w: veil, rgb: [K[1], K[2], K[3]] });
        if (lit) parts.push({ polys, kind: 'stroke', nss: true, cap: 1, a: 0.3, w: w + 2 * RES_OUTLINE + 8, rgb: [K[4], K[5], K[6]] });
        parts.push({ polys, kind: 'stroke', nss: true, cap: 1, a: 1, w: w + 2 * RES_OUTLINE, rgb: BLACK }, { polys, kind: 'stroke', nss: true, cap: 1, a: 1, w, rgb: ink });
      }
      recs.put(RES_KEYS[k], parts, now, reduceMotion.matches);
      live.recKick();
    }
  }
  return { RES_BIT, resItem, resMade, resPaint, resPlace, resRatio };
}
