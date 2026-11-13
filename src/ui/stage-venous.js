// The stents and venous shunt drawn as they come in: the per-vessel stent record, its ease, its mesh and the anastomosis marks.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { store } from './store.js';
import { s } from './util.js';

export function createVenous(st, live) {
  const { E, easeInOut, frameAt, geo, late, markShade, meshPaths, meshR, nextFrame, ov, putA, stentFade, tipsBare } = st;
  // A vein a slide shows stented (store.stented: a hepatic vein or the IVC, which the model has no device for): the same mesh over
  // the stretch VST_SPAN of the vein. Every stent comes in whole, the length of it at once, its strength easing in, and goes out the
  // same way when the slide leaves it (13 Nov 2026, Mohammad: "the stent TIPS doesn't expend all at once.. it expands in two fragments...
  // WRONG": it was unrolled from one end behind a moving front, so the TIPS's open portal stretch came in before its graft and read as a
  // second piece). It eases on its own clock, so the figure is never waiting on the model.
  const VST_SPAN = [0.25, 0.75], VST_MS = 1100;
  const vst = new Map();   // id → how far the stent has come in (0 to 1); on: whether it should be
  const vstRecs = new Map();   // (each vessel's record, made ahead and set afresh as its stent comes in)
  for (const id of Object.keys(E)) vstRecs.set(id, { k: 0, parts: null });
  let vstRaf = 0, vstAt = 0, vstDirty = false;
  // (The TIPS is the one stent here the model has: the covered stent, in once the shunt has drawn on, out as it retracts, in the circuit as
  // well as the figure.)
  const vstGoal = (id, anat) => ((id === 'TIPS' || (anat && store.get().stented?.includes(id))) && E[id]?.vis && !E[id].reveal && geo[id]?.cur ? 1 : 0);
  // The mesh is built once, whole (each rebuild of the overlays, not each frame), and each frame sets only its strength: the amount on its
  // key (data-mk "vst:<id>"), which the GPU lays on the stent's draws as it lays every treatment mark's fade (stage-outlines.js fadeEase), and
  // the group's opacity for the SVG copy when the GPU does not draw the marks (markShade). Never an opacity on the pieces: the marks' build
  // reads that once, so a stent built while still at nothing stayed at nothing on the GPU (13 Nov 2026, "the mesh failed to draw").
  // The CPU draws no path and the page gets no new element while it comes in.
  let vstKids = [];   // (the roots last handed to the layer, in order)
  // A stent that is already standing is kept, not built again (10 Nov 2026, Mohammad: "when the TIPS stent appears it flickers"): the overlays are
  // asked to rebuild whenever anything in their key moves, and the TIPS's own width eases for a long while after the shunt opens, so a rebuild came
  // every few hundred ms while it came in. Each one took the old elements out of the page, and the painter, which reads a piece's opacity from its
  // element as it paints, drew the removed elements as the last frame left them until the layer was read again. Now a rebuild whose pieces are the
  // same pieces (the same classes in the same order) writes the new outlines into the elements it has: the painter reads an outline's `d` as it
  // paints (stage-over.js needsReread), so nothing is read again and nothing leaves the page; and a rebuild whose mesh did not move (its signature)
  // writes nothing at all.
  // The TIPS stent runs the whole of its tract, from the centre line of the right portal vein to the centre line of the right hepatic vein (Mohammad, 11 Nov 2026: "it has to extend all the way
  // including the stent"). Only a hair is kept back from the very ends, so its crowns do not touch the tube's own cap.
  const TIPS_ENDS = [1.5, 1.5];
  function venousDraw(p) {
    const kids = []; let fresh = false;
    for (const [id, v] of vst) {
      const old = v.parts;
      v.parts = null;
      if (!(v.k > 0.002) || !E[id]?.vis || !geo[id]?.cur) continue;
      const L = geo[id].len, tips = id === 'TIPS';
      const R = meshR(id, p), d0 = tips ? TIPS_ENDS[0] : VST_SPAN[1] * L, d1 = tips ? L - TIPS_ENDS[1] : VST_SPAN[0] * L;
      // (What the mesh is made from: its two ends and its middle on the vessel, its half-width at both ends and the middle, its bare stretch.)
      const mid = (d0 + d1) / 2;
      let sig = `${L.toFixed(1)}|${R(d0).toFixed(2)}|${R(mid).toFixed(2)}|${R(d1).toFixed(2)}|${tips ? tipsBare(id).toFixed(1) : 0}`;
      for (const d of [d0, mid, d1]) { const q = frameAt(id, d); sig += `|${q.x.toFixed(1)},${q.y.toFixed(1)},${q.tx.toFixed(2)},${q.ty.toFixed(2)}`; }
      if (old && vstKids.includes(old.root)) {
        if (old.sig === sig) { v.parts = old; venousMove(id, v); kids.push(old.root); continue; }
        const next = meshPaths(id, p, d0, d1, 1, false, tips ? tipsBare(id) : 0);
        const same = next.length === old.fade.length && next.every((el, i) => el.getAttribute('class') === old.fade[i].getAttribute('class'));
        if (same) {
          next.forEach((el, i) => putA(old.fade[i], 'd', el.getAttribute('d')));
          old.sig = sig;
          v.parts = old; venousMove(id, v); kids.push(old.root); continue;
        }
      }
      fresh = true;
      // (The whole stent, end to end: no front, no clip, no marker across it.)
      const pieces = meshPaths(id, p, d0, d1, 1, false, tips ? tipsBare(id) : 0);
      const root = s('g', { 'data-mk': `vst:${id}` }, ...pieces);
      v.parts = { root, sig, fade: pieces };
      venousMove(id, v);
      kids.push(root);
    }
    // (The layer is handed the roots again only when one is new or one has gone: the same roots in the same order are what it holds.)
    if (fresh || kids.length !== vstKids.length || kids.some((k, i) => k !== vstKids[i])) { vstKids = kids; late('kids', ov.venous, kids); }
  }
  // A stent at its k: the whole device at one strength, ease(k), so it comes in (or goes out) as one.
  function venousMove(id, v) {
    const P = v.parts;
    if (!P?.root) return;
    const a = easeInOut(v.k);
    stentFade(`vst:${id}`, a);
    markShade(P.root, a);
  }
  function venousTick(now) {
    vstRaf = 0;
    const dt = vstAt ? Math.min(100, now - vstAt) : 0; vstAt = now;
    let moving = false;
    for (const [id, v] of vst) {
      const goal = vstGoal(id, venousAnat);
      if (v.k !== goal) {
        const step = reduceMotion.matches ? 1 : dt / (goal ? VST_MS : VST_MS * 0.6);   // (out quicker than in)
        const was = v.k;
        v.k = goal ? Math.min(1, v.k + step) : Math.max(0, v.k - step);
        // (A standing stent only changes its strength; one that comes in or goes out is built or taken away.)
        if (v.parts && v.k > 0.002) venousMove(id, v); else if (v.parts || (v.k > 0.002) !== (was > 0.002)) vstDirty = true;
        if (v.k !== goal) moving = true;
      }
      if (v.k === 0 && !goal) { if (v.parts) vstDirty = true; vst.delete(id); stentFade(`vst:${id}`, null); }
    }
    // (A stent that comes in or goes out is built between frames, never in one: its mesh is new page art, 2 Nov 2026, "Move everything to GPU".)
    if (vstDirty) { vstDirty = false; if (!vstBuildAsk) vstBuildAsk = restPass(venousBuild); }
    if (moving) vstRaf = nextFrame(venousTick); else vstAt = 0;
  }
  let venousAnat = true, vstBuildAsk = 0, tipsFirst = true;
  const venousBuild = () => { vstBuildAsk = 0; venousDraw(live.F?.viewParams || store.get().params); };
  // Called from every overlay update: starts the ease when the slide's stented veins (or the view) changed, and redraws on a rebuild.
  function venousSync(p, anat, rebuilt) {
    venousAnat = anat;
    const tips = E.TIPS;
    // (A TIPS already in when the page opens is in at full strength; one that comes in after it comes in whole once its shunt has drawn on.)
    if (tips && !vst.has('TIPS') && (tips.vis || tips.reveal)) {
      const v = vstRecs.get('TIPS'), whole = tipsFirst && !tips.reveal;
      v.k = whole ? 1 : 0; v.parts = null; vst.set('TIPS', v);
      if (whole && !vstBuildAsk) vstBuildAsk = restPass(venousBuild);
    }
    tipsFirst = false;
    const stented = store.get().stented;
    if (stented) for (let i = 0; i < stented.length; i++) { const id = stented[i]; if (!vst.has(id) && E[id]) { const v = vstRecs.get(id); v.k = 0; v.parts = null; vst.set(id, v); } }
    for (const [id, v] of vst) if (v.k !== vstGoal(id, anat) && !vstRaf) { vstAt = 0; vstRaf = nextFrame(venousTick); break; }
    // (Rebuilt between frames, never in the frame whose geometry changed: 2 Nov 2026, "Move everything to GPU".)
    if (rebuilt && vst.size) { if (vstRaf) vstDirty = true; else if (!vstBuildAsk) vstBuildAsk = restPass(venousBuild); }
  }
  return { venousSync };
}
