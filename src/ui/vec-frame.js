// The vector renderer's change table (docs/recommendations/vector-renderer-plan.md section 7; workstream E): which passes a frame needs,
// over which boxes, and when the kept base is written. Pure JS, no GL: vec-renderer.js asks plan() once a frame and draws what it says.
//
//   Change                          Work (this file's plan)
//   ------------------------------  ------------------------------------------------------------------------------------------
//   nothing                         nothing drawn
//   blood advances (rest)           BLOOD: lumen strips and lumen regions, over the kept base (the base written first if it is stale)
//   camera moves, morph, deform     FULL, whole picture, every frame; the kept base is NOT written (it is stale until the view rests)
//   colour, selection, radius,      FULL in the boxes of the rows' cells (picture) and BASE in the same boxes (kept base), only if the
//   organ, overlay change           base is current; then BLOOD where the blood moved. Most of the picture: one whole FULL.
//
// The picture is never read while it is drawn (the BLOOD pass reads the kept base, a different texture), and a pass that writes every
// pixel (a whole FULL, a whole BASE) tells the driver so (vec-targets.js invalidates its colour), so a tiled GPU loads nothing.
//
// Everything here writes into kept buffers: plan() returns the same record every time, filled in place.
import { V_FULL, V_BASE, V_BLOOD } from './vec-contract.js';

/** The most boxes a pass is scissored to; past it the boxes are merged. */
export const MAX_BOXES = 16;
/** A box set covering more of the picture than this is drawn as one whole pass. */
export const WHOLE_SHARE = 0.6;

/** What changed since the last frame (bits), as the renderer's setters note it. */
export const D = Object.freeze({
  GEOM: 1,      // setGeometry / patchGeometry past a row's compiled reach / a new compile: everything is drawn again
  TUBES: 2,     // setTubes: rows' attributes (colour, selection, fades): their cells
  RADII: 4,     // setRadii: rows' widths, inside their compiled reach: their cells
  FLOW: 8,      // setFlow: the blood's rows (blood pass only)
  DYE: 16,      // setDye (blood pass only)
  MORPH: 32,    // a morph frame is on, or its set changed: whole FULL
  ORGANS: 64,   // an organ's shape changed (a box, or the whole picture): FULL and BASE in the box
  UNDER: 128,   // an overlay under the vessels changed (glows, the map): FULL and BASE in its box
  OVER: 256,    // an overlay over the vessels changed (ascites, outlines, the catheter): FULL in its box, the base is untouched
  SIZE: 512,    // the picture's size or texture changed
  LOST: 1024,   // the context was lost and came back
  LOOK: 2048,   // a look number outside the tracked ones (a theme switch, a plate fade) changed: whole FULL
  BEND: 4096,   // setBend (arrowheads: blood pass only)
});
const WHOLE_BITS = D.GEOM | D.MORPH | D.SIZE | D.LOST | D.LOOK;

/** Why a partial redraw (drawRows) was refused: the strings veins-gl's ROWS_REFUSED has, so the ?perf counters agree. */
export const REFUSED = Object.freeze({ NO_KEPT: 'no kept layer', LOST: 'context lost', SIZE: 'size changed', MOVED: 'moved', RADII: 'radii not listed', MOST: 'most cells' });

// The look numbers whose change redraws the whole picture (the list veins-gl's lookNow reads), written into a kept array. (Module-level
// helpers and a module counter: closures made per call would be garbage every frame.)
let nOut = 0;
const num = (out, v) => { out[nOut++] = typeof v === 'number' ? v : v ? 1 : 0; };
const list = (out, a) => { if (a) for (let i = 0; i < a.length; i++) num(out, a[i]); out[nOut++] = -7.25; };
function lookNumbers(k, out) {
  nOut = 0;
  num(out, k.reach); list(out, k.shOff); list(out, k.casing); list(out, k.shadow); list(out, k.sheen); list(out, k.shade); list(out, k.rim); list(out, k.paper); list(out, k.ring); list(out, k.light);
  num(out, k.netAlpha); num(out, k.fx); list(out, k.tierAlpha); list(out, k.tierGroup); num(out, k.organs);
  return nOut;
}

// The blood numbers whose change means the blood pass is due (the clock, and what fades the blood in or out).
function bloodNumbers(b, out) {
  nOut = 0;
  num(out, b.on); num(out, b.bt); num(out, b.clock); num(out, b.streakA ?? 1); num(out, b.chevA); num(out, b.originA); num(out, b.alpha); num(out, b.still); num(out, b.style);
  num(out, b.origin); num(out, b.chev); num(out, b.dye);
  return nOut;
}

/** Adds a box (x0, y0, x1, y1) to a list of n boxes in place, merged into one it touches; returns the new count. */
export function addBox(list, n, x0, y0, x1, y1) {
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (x0 <= list[o + 2] + 1 && x1 >= list[o] - 1 && y0 <= list[o + 3] + 1 && y1 >= list[o + 1] - 1) {
      list[o] = Math.min(list[o], x0); list[o + 1] = Math.min(list[o + 1], y0); list[o + 2] = Math.max(list[o + 2], x1); list[o + 3] = Math.max(list[o + 3], y1);
      return n;
    }
  }
  if (n >= MAX_BOXES) { list[0] = Math.min(list[0], x0); list[1] = Math.min(list[1], y0); list[2] = Math.max(list[2], x1); list[3] = Math.max(list[3], y1); return n; }
  const o = n * 4;
  list[o] = x0; list[o + 1] = y0; list[o + 2] = x1; list[o + 3] = y1;
  return n + 1;
}

/** One instance's frame planner. nTubes: the vessel rows (their change marks). */
export function createVecFrame(nTubes) {
  const sameM = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5];
  let dirty = D.GEOM | D.SIZE;               // (nothing drawn yet: the first frame is whole)
  const rows = new Uint8Array(nTubes);       // rows whose attributes or widths changed since the last frame
  const radRows = new Uint8Array(nTubes);    // rows whose widths changed (drawRows refuses when one is not listed)
  let nRows = 0, nRad = 0;
  const lastM = new Float64Array(6), nowM = new Float64Array(6);
  let lastW = 0, lastH = 0, nowW = 0, nowH = 0, nowBleeding = false;
  let pictureOk = false, baseOk = false;     // a picture of the current view/state exists; the kept base matches it
  let LK = new Float64Array(512), LD = new Float64Array(512), nLK = 0, nLD = -1;
  const BN = new Float64Array(16), BD = new Float64Array(16);
  let nBN = 0, nBD = -1;
  let wasBleeding = false, morphing = false, deforming = false;
  // The boxes the changes name (device px, y down: x0, y0, x1, y1): organs, under overlays, over overlays, each its own list so the
  // base is written for the first two only.
  const bOrg = new Int32Array(MAX_BOXES * 4), bUnder = new Int32Array(MAX_BOXES * 4), bOver = new Int32Array(MAX_BOXES * 4);
  let nOrg = 0, nUnder = 0, nOver = 0;
  // What plan() hands back (one record, filled in place).
  const P = {
    full: 0, base: 0, blood: 0,              // per pass: 0 none, 1 the whole picture, 2 the boxes listed
    fullBoxes: new Int32Array(MAX_BOXES * 4), nFull: 0,
    baseBoxes: new Int32Array(MAX_BOXES * 4), nBase: 0,
    writesBase: false,                       // this frame's BASE pass writes the whole base because it was stale
    why: '', passes: 0,
  };
  const area = (list, n) => { let a = 0; for (let i = 0; i < n; i++) { const o = i * 4; a += Math.max(0, list[o + 2] - list[o]) * Math.max(0, list[o + 3] - list[o + 1]); } return a; };
  const copyBoxes = (from, n, to, m0 = 0) => { for (let i = 0; i < n * 4; i++) to[m0 * 4 + i] = from[i]; return m0 + n; };
  const addAll = (list, n, from, nf) => { for (let i = 0; i < nf; i++) n = addBox(list, n, from[i * 4], from[i * 4 + 1], from[i * 4 + 2], from[i * 4 + 3]); return n; };

  const api = {
    /** The renderer's setters note what changed. rows: a list of vessel rows (tubes, radii) or null. */
    note(bits, rowList = null) {
      dirty |= bits;
      if (rowList && (bits & (D.TUBES | D.RADII))) {
        for (let i = 0; i < rowList.length; i++) {
          const r = rowList[i];
          if (r >= 0 && r < nTubes) {
            if (!rows[r]) { rows[r] = 1; nRows++; }
            if ((bits & D.RADII) && !radRows[r]) { radRows[r] = 1; nRad++; }
          }
        }
      } else if (bits & (D.TUBES | D.RADII)) dirty |= D.GEOM;   // (rows not named: any could have changed, so the whole picture)
    },
    /** One row changed (no list made for it). */
    noteRow(r, bits) {
      dirty |= bits;
      if (r >= 0 && r < nTubes) {
        if (!rows[r]) { rows[r] = 1; nRows++; }
        if ((bits & D.RADII) && !radRows[r]) { radRows[r] = 1; nRad++; }
      }
    },
    /** An organ or an overlay changed inside a box (device px, y down) or everywhere (x0 omitted). */
    noteBox(bits, x0, y0, x1, y1) {
      if (x0 === undefined) { dirty |= bits | D.LOOK; return; }
      dirty |= bits;
      if (bits & D.ORGANS) nOrg = addBox(bOrg, nOrg, x0, y0, x1, y1);
      else if (bits & D.UNDER) nUnder = addBox(bUnder, nUnder, x0, y0, x1, y1);
      else if (bits & D.OVER) nOver = addBox(bOver, nOver, x0, y0, x1, y1);
    },
    /** The morph is running (a frame of it every frame, whole) or has ended. */
    setMorph(on) { if (on || morphing) dirty |= D.MORPH; morphing = !!on; },
    /** An organ is mid-deformation (its vertices move every frame). */
    setDeforming(on) { if (on || deforming) dirty |= D.ORGANS | D.LOOK; deforming = !!on; },
    /** Every kept thing is gone (a lost context, a new size): the next frame is whole. */
    lose() { pictureOk = false; baseOk = false; dirty |= D.LOST; },
    get pictureOk() { return pictureOk; },
    get baseOk() { return baseOk; },
    get dirty() { return dirty; },
    get rowsMarked() { return nRows; },
    get radiiMarked() { return nRad; },
    /** The rows named cover every row whose radii changed (veins-gl's radCovered). */
    radCovered(list) {
      if (!nRad) return true;
      let got = 0;
      if (list) for (let i = 0; i < list.length; i++) { const r = list[i]; if (r >= 0 && r < nTubes && radRows[r]) got++; }
      return got >= nRad;
    },
    /** Whether drawRows may stand in for draw(): the refusal reason, or '' when it may. */
    refusal(m, w, h, lost, list) {
      if (!pictureOk) return REFUSED.NO_KEPT;
      if (lost) return REFUSED.LOST;
      if (w !== lastW || h !== lastH) return REFUSED.SIZE;
      if (!sameM(m, lastM)) return REFUSED.MOVED;
      if (!api.radCovered(list)) return REFUSED.RADII;
      return '';
    },
    /**
     * The passes this frame needs. m: world → device; w, h: the picture; look, blood: as veins-gl's draw gets them; bloodMoves: the
     * caller's own word that the blood changed (a flow upload, a dye step) besides the numbers read here; wholeAsked: composite's `full`;
     * rowBoxes(marks, m, list): the device boxes of the cells that list the marked rows → count (the renderer's compiled grid answers),
     * or a negative number when it cannot (the whole picture is drawn). Returns the one record P, valid until the next call.
     */
    plan(m, w, h, look, blood, bloodMoves, wholeAsked, rowBoxes) {
      for (let i = 0; i < 6; i++) nowM[i] = m[i];
      if (LK.length < 512) { LK = new Float64Array(512); LD = new Float64Array(512); }
      nLK = look ? lookNumbers(look, LK) : 0;
      let lookSame = nLK === nLD;
      if (lookSame) for (let i = 0; i < nLK; i++) if (LK[i] !== LD[i]) { lookSame = false; break; }
      nBN = blood ? bloodNumbers(blood, BN) : 0;
      let bloodSame = nBN === nBD;
      if (bloodSame) for (let i = 0; i < nBN; i++) if (BN[i] !== BD[i]) { bloodSame = false; break; }
      const moved = !sameM(nowM, lastM);
      nowW = w; nowH = h;
      const sized = w !== lastW || h !== lastH;
      const bleeding = !!blood?.bleed?.length;
      nowBleeding = bleeding;
      P.full = 0; P.base = 0; P.blood = 0; P.nFull = 0; P.nBase = 0; P.writesBase = false; P.why = ''; P.passes = 0;
      let whole = wholeAsked || !pictureOk || sized || moved || !lookSame || morphing || deforming || bleeding || wasBleeding
        || (dirty & WHOLE_BITS) !== 0;
      if (whole) {
        P.why = !pictureOk ? 'no kept picture' : sized ? 'size changed' : (dirty & D.LOST) ? 'context lost' : moved ? 'view moved' : morphing ? 'morph' : deforming ? 'organ deforming'
          : bleeding || wasBleeding ? 'bleed' : !lookSame ? 'look changed' : wholeAsked ? 'asked' : 'geometry or overlay changed';
      } else {
        // Rest: the boxes the changes name.
        let nf = 0;
        const fb = P.fullBoxes, bb = P.baseBoxes;
        let nb = 0;
        if (nRows) {
          const c = rowBoxes ? rowBoxes(rows, nowM, fb, MAX_BOXES) : -1;
          if (c < 0) whole = true;
          else { nf = c; nb = copyBoxes(fb, c, bb); }
        }
        if (!whole) {
          if (nOrg) { nf = addAll(fb, nf, bOrg, nOrg); nb = addAll(bb, nb, bOrg, nOrg); }
          if (nUnder) { nf = addAll(fb, nf, bUnder, nUnder); nb = addAll(bb, nb, bUnder, nUnder); }
          if (nOver) nf = addAll(fb, nf, bOver, nOver);
          if (area(fb, nf) > w * h * WHOLE_SHARE) { whole = true; P.why = 'most of the picture'; }
          else { P.nFull = nf; P.nBase = nb; }
        } else P.why = 'rows unmapped';
      }
      if (whole) {
        P.full = 1; P.nFull = 0; P.nBase = 0;
        baseOk = false;
        if (P.why === '') P.why = 'whole';
      } else {
        if (P.nFull) P.full = 2;
        // The base follows the boxes if it is current; the blood pass needs it current whole.
        const bloodOn = !!blood?.on;
        const bloodDue = (!bloodSame || bloodMoves || (dirty & (D.FLOW | D.DYE | D.BEND)) !== 0) && (bloodOn || !bloodSame);
        if (P.nBase && baseOk) P.base = 2;
        if (bloodDue) {
          if (!baseOk) { P.base = 1; P.nBase = 0; P.writesBase = true; baseOk = true; }
          P.blood = 1;
        }
        if (!P.full && !P.base && !P.blood) P.why = 'nothing changed';
        else if (!P.why) P.why = P.full ? 'rows or boxes' : 'blood';
      }
      P.passes = (P.full ? 1 : 0) + (P.base ? 1 : 0) + (P.blood ? 1 : 0);
      return P;
    },
    /** The frame was drawn as plan() said: what it drew is kept as the state the next frame is compared with. */
    done() {
      for (let i = 0; i < 6; i++) lastM[i] = nowM[i];
      for (let i = 0; i < nLK; i++) LD[i] = LK[i];
      nLD = nLK;
      for (let i = 0; i < nBN; i++) BD[i] = BN[i];
      nBD = nBN;
      if (P.full || P.passes) pictureOk = true;
      // (A whole FULL leaves the base stale; plan() already cleared it.)
      if (nRows) { rows.fill(0); radRows.fill(0); nRows = 0; nRad = 0; }
      nOrg = 0; nUnder = 0; nOver = 0;
      wasBleeding = nowBleeding;
      lastW = nowW; lastH = nowH;
      dirty = 0;
    },
    lastMatrix: lastM,
  };
  return api;
}

export { V_FULL, V_BASE, V_BLOOD };
