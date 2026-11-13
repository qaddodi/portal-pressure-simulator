// The FibroScan probe's numbers, kept in one record by its writer (stage-scan.js) and drawn from by the labels' GPU layer (label-gl.js
// drawScan). L3 P9, 5 Nov 2026: the layer no longer watches the probe's model (a MutationObserver and its transition listeners, then a
// style read of the whole model in a task) to learn its fades, its turn and its tap. The writer, where it sets the class or the turn
// that the CSS eases (app.css .scan-probe: opacity on --d-surface, the turn on --d-surface, the head and cable on --d-small, all on
// --ease; the tip's tap on --d-surface, --ease-move per keyframe), starts the same ease here, and each frame works it out from its clock.
// A change while one runs goes as a CSS transition does: from where it stands, its time shortened when it turns back.
// Nothing here makes an object, an array or a string after the record is made.

import { D_SURFACE, EASE_MOVE, cssCurve, easeArrive, reduced } from './motion.js';
import { NOT_SHOWN } from '../engine/pressure-cuts.js';

const tapCurve = cssCurve(EASE_MOVE);   // (the tap's keyframes each run on --ease-move, as a CSS animation's timing function does)
const TAP_O = [0, 0.2, 0.45, 0.7, 1], TAP_V = [0, 2, -1.2, 0.6, 0];   // (app.css @keyframes sp-tap: translateX along the probe, px)
const track = () => ({ run: false, from: 0, to: 0, t0: 0, dur: 0, rAdj: 0, rf: 1 });

/** The probe's record: its model element, place (stage px, its box's corner), reading, and the eased numbers drawn from. */
export function createScanRec() {
  return {
    el: null, placed: false, x: 0, y: 0, txt: '', fresh: true,
    op: 0, ang: Math.PI / 4, headOp: 1, cableOp: 1, tipX: 0,
    tr: { op: track(), ang: track(), headOp: track(), cableOp: track() }, tapOn: false, tapT0: 0,
  };
}
/** Made ready for a new model element: hidden (it comes in from cath-pre), at 45°, its head shown, nothing easing, not placed. */
export function scanRecReset(rec, el) {
  rec.el = el; rec.placed = false; rec.txt = ''; rec.fresh = true;
  rec.op = 0; rec.ang = Math.PI / 4; rec.headOp = 1; rec.cableOp = 1; rec.tipX = 0; rec.tapOn = false;
  for (const k in rec.tr) rec.tr[k].run = false;
}
function stepTrack(rec, k, t, now) {
  const p = t.dur > 0 ? (now - t.t0) / t.dur : 1;
  if (p >= 1) { rec[k] = t.to; t.run = false; return false; }
  rec[k] = t.from + (t.to - t.from) * easeArrive(p > 0 ? p : 0);
  return true;
}
/** Eases `k` of the record to `to` over `dur` ms from `now`, as the CSS transition of it does. True when an ease was started. While the
 *  record is fresh (its element not yet styled once), the value is taken at once, as a first style starts no transition. */
export function scanTo(rec, k, to, now, dur) {
  const t = rec.tr[k];
  if (rec.fresh) { t.run = false; rec[k] = to; return false; }
  if (t.run && !stepTrack(rec, k, t, now)) t.run = false;
  if (t.run) {
    if (to === t.to) return false;
    const cur = rec[k];
    if (cur === to) { t.run = false; return false; }
    if (to === t.rAdj) {
      // (Turning back to where it came from: its time is cut by how far it had gone, the CSS reversing shortening factor.)
      const p = t.dur > 0 ? Math.min(1, Math.max(0, (now - t.t0) / t.dur)) : 1, f = Math.min(1, Math.max(0, Math.abs(easeArrive(p) * t.rf + 1 - t.rf)));
      t.rAdj = t.to; t.rf = f; t.dur = dur * f;
    } else { t.rAdj = cur; t.rf = 1; t.dur = dur; }
    t.from = cur; t.to = to; t.t0 = now;
    return true;
  }
  if (rec[k] === to) return false;
  if (!(dur > 0)) { rec[k] = to; return false; }
  t.run = true; t.from = rec[k]; t.to = to; t.t0 = now; t.dur = dur; t.rAdj = rec[k]; t.rf = 1;
  return true;
}
/** The tip's tap starts again from now (the tap / tap2 class turned); none with Reduce Motion, as app.css gives it none. */
export function scanTap(rec, now) {
  if (reduced()) { rec.tapOn = false; rec.tipX = 0; return false; }
  rec.tapOn = true; rec.tapT0 = now;
  return true;
}
/** The record's numbers at `now`, written in place. True while any of them still eases. */
export function scanStep(rec, now) {
  let on = false;
  const tr = rec.tr;
  if (tr.op.run && stepTrack(rec, 'op', tr.op, now)) on = true;
  if (tr.ang.run && stepTrack(rec, 'ang', tr.ang, now)) on = true;
  if (tr.headOp.run && stepTrack(rec, 'headOp', tr.headOp, now)) on = true;
  if (tr.cableOp.run && stepTrack(rec, 'cableOp', tr.cableOp, now)) on = true;
  if (rec.tapOn) {
    const p = (now - rec.tapT0) / D_SURFACE;
    if (p >= 1) { rec.tapOn = false; rec.tipX = 0; } else {
      const u = p > 0 ? p : 0;
      let i = 0;
      while (i < TAP_O.length - 2 && u >= TAP_O[i + 1]) i++;
      rec.tipX = TAP_V[i] + (TAP_V[i + 1] - TAP_V[i]) * tapCurve((u - TAP_O[i]) / (TAP_O[i + 1] - TAP_O[i]));
      on = true;
    }
  }
  return on;
}

/** The stiffness the probe reads: the slide's own settled reading when it has pinned one, else the live value (null when neither is a number). */
export const scanKpaOf = (pinned, live) => (Number.isFinite(pinned) ? pinned : Number.isFinite(live) ? live : null);
/** The words on the probe's screen: the card's own number when the card is on screen (cardTxt, as it prints it), else the probe's eased
 *  stiffness k to one decimal, else the missing-number dash (pressure-cuts.js NOT_SHOWN). Never empty, so the screen always shows something. */
export const scanReadingText = (given, onCard, k) => (given != null && given !== '' ? given : onCard != null && onCard !== '' ? onCard : Number.isFinite(k) ? k.toFixed(1) : NOT_SHOWN);
