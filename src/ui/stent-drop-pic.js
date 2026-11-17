// Where the pressure goes, as a staircase along the stent (17 Nov 2026; replaces the stacked bar: "I don't understand that chart", Mohammad). The picture hangs under the
// stent's side view and shares its x: the portal vein's stub at the left, the stent between its two ends (dotted guides), the hepatic vein's stub at the right. The line is the
// pressure still left above the IVC (the energy head, so it only falls): it starts at the PPG and comes down to 0, and where it falls it is drawn thick in the colour of what takes
// the pressure there: the veins outside the stent (grey, along both stubs), the stent's way in and out (a step at each end, orange), the friction along the lumen (a ramp, blue) and the
// jet where the narrowing opens again (a step or a cone, violet). Under it a key of five columns, one colour each, with the mmHg of each part and, below, the stent's own drop.
// The places come from the engine's trace (stent-trace.js, each part's cumulative share by place: a schematic of where); the numbers, the PPG and the 0 at the IVC are the engine's own.
// "In and out" is the stent's entrance and exit loss; "Tract" its fixed series term (the way through the liver), which the trace also takes at the two ends.
// Never an HVPG: the portal-to-IVC drop is the PPG, the stent's own is "Across the stent".
// Nothing is made per frame: fixed pieces, 161-point paths (a stroke lifts the pen where its part takes nothing), words written on pieces. Sized by the words' size so a phone
// never clips it: its height is fixed for words up to 14 units (the card caps them there), its key re-flows with the words' size (fit).
// createDropPic(sv) → { svg, words, fit(fs), paint(g) }; g is the record paint reads (see DROP_IN).
import { setGeo, setPts, setWords } from './svg-gl.js';
import { clamp } from './util.js';
import { smooth01 } from './num.js';
import { TRACE_N } from '../engine/stent-trace.js';

const N = TRACE_N;
export const DROP = { w: 320, yT: 32, yB: 82, baseY: 95, nameY: 116, valY: 132, totY: 152, h: 164, gutter: 6, dotR: 3.5 };
export const COLS = ['out', 'tract', 'ends', 'wall', 'jet'];
export const DROP_NAMES = { out: 'Outside', tract: 'Tract', ends: 'In and out', wall: 'Friction', jet: 'Jet' };
const CUM = ['cOut', 'cTract', 'cEnds', 'cWall', 'cJet'];   // (the trace's cumulative share of each part, by place)
/** The key's columns for the words' size fs (units): each is as wide as its longest word and its dot, the room left shared out evenly. Writes the lefts into out (6 numbers: the
 *  last is the right edge) and returns the size the key's words are drawn at (fs, or smaller when five columns of words do not fit the picture's width). */
export function keyCols(fs, out) {
  const room = DROP.w - 2 * DROP.gutter, need = (f, c) => Math.max(DROP_NAMES[c].length, 4) * 0.6 * f + 3 * DROP.dotR + 3;
  let kf = fs;
  while (COLS.reduce((a, c) => a + need(kf, c), 0) > room && kf > 6) kf *= 0.96;
  const extra = (room - COLS.reduce((a, c) => a + need(kf, c), 0)) / COLS.length;
  let x = DROP.gutter;
  for (let c = 0; c < COLS.length; c++) { out[c] = x; x += need(kf, COLS[c]) + extra; }
  out[COLS.length] = x;
  return kf;
}

export function createDropPic(sv) {
  const area = sv('path', { 'data-look': 'stent.drop.area' }), areaBuf = new Float64Array(2 * (N + 3));
  const line = sv('path', { 'data-look': 'stent.drop.line' }), lineBuf = new Float64Array(2 * (N + 1));
  const strokes = COLS.map((k) => ({ k, el: sv('path', { 'data-look': `stent.drop.s.${k}` }), buf: new Float64Array(2 * (N + 1)), on: new Uint8Array(N + 2) }));
  const plateau = sv('path', { 'data-look': 'stent.drop.guide' }), plateauBuf = new Float64Array(4);
  const base = sv('path', { 'data-look': 'stent.drop.base' }), baseBuf = new Float64Array(4);
  const guides = [0, 1].map(() => sv('path', { 'data-look': 'stent.drop.guide' })), guideBuf = [new Float64Array(4), new Float64Array(4)];
  const dots = COLS.map((k) => sv('circle', { 'data-look': `stent.key.dot.${k}`, r: DROP.dotR, cx: 0, cy: DROP.nameY }));
  const names = COLS.map((k) => { const e = sv('text', { 'data-look': 'stent.key.text', x: 0, y: DROP.nameY, 'text-anchor': 'start' }); setWords(e, DROP_NAMES[k]); return e; });
  const vals = COLS.map(() => sv('text', { 'data-look': 'stent.lab', x: 0, y: DROP.valY, 'text-anchor': 'start' }));
  const wPpg = sv('text', { 'data-look': 'stent.mark.text', x: 4, 'text-anchor': 'start' });
  const wBase = ['Portal vein', 'Stent', 'IVC'].map((t, i) => { const e = sv('text', { 'data-look': 'stent.cap', y: DROP.baseY, 'text-anchor': i === 0 ? 'start' : i === 1 ? 'middle' : 'end' }); setWords(e, t); return e; });
  setGeo(wBase[0], 'x', 4); setGeo(wBase[2], 'x', DROP.w - 4);
  const wTot = sv('text', { 'data-look': 'stent.mark.text', x: DROP.gutter, y: DROP.totY, 'text-anchor': 'start' });
  const kids = [area, plateau, base, ...guides, line, ...strokes.map((s) => s.el), wPpg, ...wBase, ...dots, ...names, ...vals, wTot];
  const svg = sv('svg', { class: 'gl-pic', viewBox: `0 0 ${DROP.w} ${DROP.h}`, role: 'img' }, ...kids);
  const words = [wPpg, ...wBase, ...names, ...vals, wTot];
  const lefts = new Float64Array(COLS.length + 1);
  let kfs = 12;

  /** Sizes the words: fs everywhere, the key's by what five columns allow, the total line by what its width allows. Lays the key out. */
  function fit(fs) {
    for (const e of words) e.setAttribute('font-size', fs);
    kfs = keyCols(fs, lefts);
    for (let c = 0; c < COLS.length; c++) {
      names[c].setAttribute('font-size', kfs); vals[c].setAttribute('font-size', kfs);
      setGeo(dots[c], 'cx', lefts[c] + DROP.dotR); setGeo(names[c], 'x', lefts[c] + 2 * DROP.dotR + 3); setGeo(vals[c], 'x', lefts[c] + 2 * DROP.dotR + 3);
    }
    wTot.setAttribute('font-size', Math.min(fs, (DROP.w - 2 * DROP.gutter) / (30 * 0.6)));
    wPpg.setAttribute('font-size', fs);
    return kfs;
  }

  /**
   * Draws the staircase. g: { o: the trace (cOut, cTract, cEnds, cWall, cJet, loss, x), len (cm), px0, px1 (the stent's ends in the side view's x), ppg, pHi (mmHg at the plot's top),
   * ex (strength), on (0 to 1: the part outside the stent is shown), vals: [out, tract, ends, wall, jet] (mmHg, the printed tenths), words: the key's numbers (5), ppgWord, totWord }.
   */
  function paint(g) {
    const { o, len, px0, px1, ppg, pHi, ex, on } = g;
    const xa = o.x[0], xb = o.x[N], ky = (DROP.yB - DROP.yT) / Math.max(1e-6, pHi), Y = (v) => clamp(DROP.yB - v * ky, DROP.yT, DROP.yB);
    const X = (x) => (x <= 0 ? (px0 * (x - xa)) / Math.max(1e-9, -xa) : x >= len ? px1 + ((DROP.w - px1) * (x - len)) / Math.max(1e-9, xb - len) : px0 + (px1 - px0) * (x / Math.max(1e-9, len)));
    for (let i = 0; i <= N; i++) {
      const x = X(o.x[i]), y = Y(ppg - o.loss[i]);
      lineBuf[2 * i] = x; lineBuf[2 * i + 1] = y; areaBuf[2 * i] = x; areaBuf[2 * i + 1] = y;
    }
    areaBuf[2 * (N + 1)] = X(xb); areaBuf[2 * (N + 1) + 1] = DROP.yB; areaBuf[2 * (N + 2)] = X(xa); areaBuf[2 * (N + 2) + 1] = DROP.yB;
    setPts(area, areaBuf, N + 3, true); setPts(line, lineBuf, N + 1, false);
    // each part's stroke: the stretch of the line where its cumulative share rises, the pen lifted elsewhere (a step is the one segment between two samples)
    for (let c = 0; c < COLS.length; c++) {
      const s = strokes[c], cum = o[CUM[c]], on_ = s.on;
      for (let i = 1; i <= N; i++) on_[i] = cum[i] - cum[i - 1] > 1e-7 ? 1 : 0;
      on_[0] = 0; on_[N + 1] = 0;
      for (let i = 0; i <= N; i++) {
        if (on_[i] || on_[i + 1]) { s.buf[2 * i] = lineBuf[2 * i]; s.buf[2 * i + 1] = lineBuf[2 * i + 1]; } else { s.buf[2 * i] = NaN; s.buf[2 * i + 1] = 0; }
      }
      setPts(s.el, s.buf, N + 1, false);
      // (a part that is almost nothing fades with its size: no speck where a step has no height)
      setGeo(s.el, 'opacity', ex * (c === 0 ? on : 1) * smooth01((g.vals[c] - 0.03) / 0.17));
    }
    plateauBuf[0] = 0; plateauBuf[1] = Y(ppg); plateauBuf[2] = DROP.w; plateauBuf[3] = Y(ppg); setPts(plateau, plateauBuf, 2, false);
    baseBuf[0] = 0; baseBuf[1] = DROP.yB; baseBuf[2] = DROP.w; baseBuf[3] = DROP.yB; setPts(base, baseBuf, 2, false);
    for (let q = 0; q < 2; q++) { const x = q ? px1 : px0, b = guideBuf[q]; b[0] = x; b[1] = DROP.yT - 6; b[2] = x; b[3] = DROP.yB; setPts(guides[q], b, 2, false); setGeo(guides[q], 'opacity', ex); }
    setGeo(wBase[1], 'x', (px0 + px1) / 2);
    setGeo(wPpg, 'y', Y(ppg) - 0.8 * (Number(wPpg.getAttribute('font-size')) || 12));
    setWords(wPpg, g.ppgWord); setWords(wTot, g.totWord);
    for (let c = 0; c < COLS.length; c++) {
      setWords(vals[c], g.words[c]);
      // (the key's item is dimmed when its part is nothing, never taken away; the outside item follows the card's `to`)
      const dim = (g.vals[c] < 0.05 ? 0.4 : 1) * (c === 0 ? 0.4 + 0.6 * on : 1);
      setGeo(dots[c], 'opacity', ex * dim); setGeo(names[c], 'opacity', ex * dim); setGeo(vals[c], 'opacity', ex * dim);
    }
    for (const e of [area, plateau, base, line, wTot, ...wBase]) setGeo(e, 'opacity', ex);
    setGeo(plateau, 'opacity', ex * 0.7);
    setGeo(wPpg, 'opacity', ex * on);
  }
  return { svg, words, fit, paint };
}
