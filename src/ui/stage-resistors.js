// The circuit's resistors: the ratio each shows against the healthy liver, its reading as a figure label, and its zigzag record on the overlay painter.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, edgePresent } from '../engine/topology.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { store } from './store.js';
import { clamp, fmt } from './util.js';

export function createResistors(st, live) {
  const { EI, NI, SITE_DEF, geo, pointAt, recs, worldToLocalInto } = st;
  // A resistor's reading is a figure label (label-gl, the one style): "R liver ×2.3", at the middle of its own zigzag, world-anchored like
  // every figure label, so it moves with the figure through every pan, pinch and zoom. resMask: which readings have a value (the labels'
  // signature); RES_LABEL: its words; the key ("vs healthy liver") rides once, on the outermost reading.
  const RES_BIT = { rGut: 1, rColl: 2, rLiver: 4 }, RES_LABEL = { rLiver: 'R liver', rColl: 'R collaterals', rGut: 'R gut' }, RES_FULL = { rLiver: 'Liver resistance', rColl: 'Collateral resistance', rGut: 'Gut arteriole resistance' };
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
      const sc = live.CTM?.sc || 1, r = it.ratio ?? 1;
      const off = resAmp(r) * Math.max(sc, RES_FLOOR) + resWidth(r) / 2 + 8 + Math.abs(nx) * it.w / 2 + Math.abs(ny) * it.h / 2;   // (clear of the zigzag, its casing and its glow)
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
  // (6 Nov 2026, Mohammad: "the resistor icons barely appear ... the difference between too much resistance and too little is not really
  // that different; need to be bolder".) The resistance is read by the zigzag's own shape, not by its tint alone, so it reads in every
  // pressure colour and theme: R = the ratio to the healthy liver, s = log2 R (0 at ×1, 1 at ×2, 2 at ×4).
  //   amplitude 5 world units at ×1, 10 at ×2, 15 at ×4 (a calm low ripple against tall spikes);
  //   teeth 4 at ×1, 5 at ×1.6, 6 from ×2.5 (tighter as it rises);
  //   stroke 2.5 px at ×1, 4.3 px at ×2, 6 px at ×4 and over;
  //   heat t = s / 2 (0 at ×1, 1 at ×4): the line warms toward --danger by up to 55% and a glow of its own colour grows under it.
  // Every resistor sits on a solid casing of the stage's background (its width + 5 px), so its line never melts into a vessel of the same hue.
  const resLog = (r) => Math.log2(Math.max(0.25, r || 1));
  const resAmp = (r) => clamp(5 + 5 * resLog(r), 4, 16);
  const resTeeth = (r) => (r >= 2.5 ? 6 : r >= 1.6 ? 5 : 4);
  const resWidth = (r) => Math.round(clamp(2.5 + 1.8 * resLog(r), 2.5, 6) * 10) / 10;
  const resHeat = (r) => clamp(resLog(r) / 2, 0, 1);
  // (A zigzag keeps its shape on screen at any zoom: below RES_FLOOR px a unit, its world amplitude grows so it stays at least RES_FLOOR of its
  // own amplitude in px, stepped a quarter octave so a zoom rebuilds the record a few times, not each frame.)
  const RES_FLOOR = 0.9;
  // A resistor: its glow (as the resistance rises), the casing under its line, and its line, each a zigzag along the segments.
  function resPaint(k, d, ratio) {
    let st = resMade.get(k);
    const want = live.sites.list?.includes(k) && ratio != null;
    const now = performance.now();
    if (!want) { if (st) { resMade.delete(k); recs.drop(RES_KEYS[k], now, reduceMotion.matches); live.recKick(); } return; }   // (faded out whole first, over D_SURFACE, then gone)
    if (!st) { st = { _segs: null, cur: null, d, ratio }; resMade.set(k, st); }   // alloc-rare: a resistor's record, made when it first shows
    // The zigzags' end points: the liver's two are fixed; the gut's and the collaterals' stand on their vessel, level with its course.
    let n = 0;
    const sc = live.CTM?.sc > 0 ? live.CTM.sc : 1, scQ = 2 ** (Math.round(Math.log2(sc) * 4) / 4);
    const teeth = resTeeth(ratio), amp = resAmp(ratio) * Math.max(1, RES_FLOOR / scQ), stride = (teeth + 2) * 2;
    if (d.res === 'liver') {
      for (let i = 0; i < live.RES_LIVER.length; i += 4) n = zigInto(live.resNow, n, live.RES_LIVER[i], live.RES_LIVER[i + 1], live.RES_LIVER[i + 2], live.RES_LIVER[i + 3], teeth, amp);
    } else {
      const q = d.res === 'gut' ? geo.A_SMA?.cur && pointAt(geo.A_SMA.cur, 0.5) : geo.C1b?.cur && pointAt(geo.C1b.cur, 0.5);
      if (q) n = zigInto(live.resNow, n, q[0] - q[2] * 34, q[1] - q[3] * 34, q[0] + q[2] * 34, q[1] + q[3] * 34, teeth, amp);
    }
    for (let i = 0; i < n; i++) live.resNow[i] = r1(live.resNow[i]);
    const lit = live.resLit.get(k);
    const w = resWidth(ratio), heat = Math.round(resHeat(ratio) * 20) / 20;
    // Its look as numbers: lit, the casing's rgb (the stage's background), the line's rgb, its width, the heat, the danger rgb
    // (the rgb is the theme's tokens', read when the theme last changed).
    live.resKey[0] = lit ? 1 : 0; live.resKey[7] = w; live.resKey[8] = heat;
    live.tokenRGB('--stage-bg', live.resKey, 1);
    live.tokenRGB(lit ? live.toneToken(lit) : '--text', live.resKey, 4);
    live.tokenRGB('--danger', live.resKey, 9);
    let same = !!st.cur && st.cur.n === n;
    if (same) for (let i = 0; i < live.resKey.length; i++) if (st.cur.key[i] !== live.resKey[i]) { same = false; break; }
    if (same) for (let i = 0; i < n; i++) if (st.cur.pts[i] !== live.resNow[i]) { same = false; break; }
    st.d = d; st.ratio = ratio;
    if (!same) {
      // alloc-rare: a resistor's zigzag, colour or width changed (a slide's change, a theme, a resistance), not a frame that kept them
      const polys = [];
      for (let o = 0; o + stride <= n; o += stride) polys.push(live.resNow.slice(o, o + stride));
      st.cur = { n, key: Array.from(live.resKey), pts: live.resNow.slice(0, n) };
      st._segs = polys.map((p) => [[p[0], p[1]], [p[p.length - 2], p[p.length - 1]]]);   // (what the figure's labels keep off, buildSegs)
      const K = live.resKey, mix = 0.55 * heat;
      const ink = [K[4] + (K[9] - K[4]) * mix, K[5] + (K[10] - K[5]) * mix, K[6] + (K[11] - K[6]) * mix];
      const parts = [];
      if (polys.length && heat > 0) parts.push({ polys, kind: 'stroke', nss: true, cap: 1, a: 0.12 + 0.28 * heat, w: w + 7 + 9 * heat, rgb: ink });
      if (polys.length) parts.push({ polys, kind: 'stroke', nss: true, cap: 1, a: 0.95, w: w + 5, rgb: [K[1], K[2], K[3]] }, { polys, kind: 'stroke', nss: true, cap: 1, a: 1, w: lit ? w + 0.5 : w, rgb: ink });
      recs.put(RES_KEYS[k], parts, now, reduceMotion.matches);
      live.recKick();
    }
  }
  return { RES_BIT, resItem, resMade, resPaint, resPlace, resRatio };
}
