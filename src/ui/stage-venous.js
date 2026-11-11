// The stents and venous shunt drawn as they come in: the per-vessel stent record, its ease, its mesh and the anastomosis marks.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { store } from './store.js';
import { s } from './util.js';

export function createVenous(st, live) {
  const { E, easeInOut, frameAt, geo, late, meshPaths, meshR, nextFrame, ov, putA, stentSpan, tipsBare } = st;
  // A vein a slide shows stented (store.stented: a hepatic vein or the IVC, which the model has no device for): the same mesh over
  // the stretch VST_SPAN of the vein, unrolled from its heart end (where a transjugular catheter comes from) while it fades in, and
  // rolled back the same way when the slide leaves it. It eases on its own clock, so the figure is never waiting on the model.
  const VST_SPAN = [0.25, 0.75], VST_MS = 1100;
  const vst = new Map();   // id → how much of the stent is drawn (0 to 1); on: whether it should be
  const vstRecs = new Map();   // (each vessel's record, made ahead and set afresh as its stent comes in)
  for (const id of Object.keys(E)) vstRecs.set(id, { k: 0, parts: null });
  let vstRaf = 0, vstAt = 0, vstDirty = false;
  // (The TIPS is the one stent here the model has: the covered stent, unrolled from its portal end once the shunt has drawn on, rolled back as it
  // retracts, in the circuit as well as the figure. visual-style D4.)
  const vstGoal = (id, anat) => ((id === 'TIPS' || (anat && store.get().stented?.includes(id))) && E[id]?.vis && !E[id].reveal && geo[id]?.cur ? 1 : 0);
  // The mesh is built once, whole (each rebuild of the overlays, not each frame), and unrolled on the GPU: it sits in a group (F) placed
  // at the unrolling front, turned to the way it unrolls, and clipped to the half of the plane behind that front, its pieces taken back
  // to where they stand by a group inside it (the inverse). Each frame moves only those two frames, the front's marker and the strength
  // (transforms and opacities, which the overlays' GPU painter reads as it paints: stage-over.js), so the CPU draws no path and the
  // page gets no new element while it unrolls. (The stented stretch is a quarter to three quarters of a hepatic vein or the IVC: it
  // never turns far enough that a piece still to come lies behind the front.)
  let vstN = 0;   // (each build's clip a name of its own: a clip put in under the name of one being taken out was not found by the page)
  let vstKids = [];   // (the roots last handed to the layer, in order)
  // A stent that is already standing is kept, not built again (10 Nov 2026, Mohammad: "when the TIPS stent appears it flickers"): the overlays are
  // asked to rebuild whenever anything in their key moves, and the TIPS's own width eases for a long while after the shunt opens, so a rebuild came
  // every few hundred ms through the unrolling. Each one took the old elements out of the page, and the painter, which reads a piece's frame and
  // opacity from its element as it paints, drew the removed elements as the last frame left them until the layer was read again: the front of the
  // mesh jumped back, then forward. Now a rebuild whose pieces are the same pieces (the same classes in the same order, the same clip) writes
  // the new outlines into the elements it has: the painter reads an outline's `d` as it paints (stage-over.js needsReread), so nothing is
  // read again and nothing leaves the page; and a rebuild whose mesh did not move (its signature) writes nothing at all.
  function venousDraw(p) {
    const kids = []; let fresh = false;
    for (const [id, v] of vst) {
      const old = v.parts;
      v.parts = null;
      if (!(v.k > 0.002) || !E[id]?.vis || !geo[id]?.cur) continue;
      const L = geo[id].len;
      const cid = `vstClip-${id}-${++vstN}`;
      const tips = id === 'TIPS', open = tips && v.k >= 1;   // (open: the whole stent in, so no front to clip it by: the circuit's lane turns back on itself, which a half-plane cannot follow)
      const span = tips ? stentSpan(id) : null, R = meshR(id, p), d0 = tips ? span[0] : VST_SPAN[1] * L, d1 = tips ? span[1] : VST_SPAN[0] * L, r1 = R(d1);
      const far = Math.abs(d1 - d0) + 4 * r1 + 20;   // (the clip: the half of the plane behind the front, as far as the whole mesh reaches)
      // (What the mesh is made from: its two ends and its middle on the vessel, its half-width at both ends and the middle, its bare stretch.)
      const mid = (d0 + d1) / 2;
      let sig = `${open ? 1 : 0}|${L.toFixed(1)}|${R(d0).toFixed(2)}|${R(mid).toFixed(2)}|${r1.toFixed(2)}|${tips ? tipsBare(id).toFixed(1) : 0}`;
      for (const d of [d0, mid, d1]) { const q = frameAt(id, d); sig += `|${q.x.toFixed(1)},${q.y.toFixed(1)},${q.tx.toFixed(2)},${q.ty.toFixed(2)}`; }
      if (old && old.open === open && old.far >= far && vstKids.includes(old.root)) {
        if (old.sig === sig) { v.parts = old; venousMove(id, v); kids.push(old.root); continue; }
        const next = meshPaths(id, p, d0, d1, 1, false, tips ? tipsBare(id) : 0);
        const same = next.length === old.fade.length - 1 && next.every((el, i) => el.getAttribute('class') === old.fade[i].getAttribute('class'));
        if (same) {
          next.forEach((el, i) => putA(old.fade[i], 'd', el.getAttribute('d')));
          putA(old.fade.at(-1), 'd', `M0 ${(-r1).toFixed(2)} L0 ${r1.toFixed(2)}`);
          old.R = R; old.d0 = d0; old.d1 = d1; old.r1 = r1; old.sig = sig;
          v.parts = old; venousMove(id, v); kids.push(old.root); continue;
        }
      }
      fresh = true;
      // (An outline, not a rect: the overlays' GPU painter dropped a rect clip under a turned frame, 2 Nov 2026, and the mesh with it.)
      const pieces = meshPaths(id, p, d0, d1, 1, false, tips ? tipsBare(id) : 0), markPath = s('path', { class: tips ? 'stent-mark stent-mark-tips' : 'stent-mark', d: `M0 ${(-r1).toFixed(2)} L0 ${r1.toFixed(2)}` });
      const back = s('g', {}, ...pieces);
      const front = s('g', open ? {} : { 'clip-path': `url(#${cid})` }, back);
      const mark = s('g', {}, markPath);
      const clip = s('clipPath', { id: cid, clipPathUnits: 'userSpaceOnUse' }, s('path', { d: `M${(-far).toFixed(1)} ${(-far).toFixed(1)} L0 ${(-far).toFixed(1)} L0 ${far.toFixed(1)} L${(-far).toFixed(1)} ${far.toFixed(1)} Z` }));
      const root = s('g', {}, ...(open ? [] : [s('defs', {}, clip)]), front, mark);
      v.parts = { root, front, back, mark, R, d0, d1, r1, open, far, sig, fade: [...pieces, markPath] };
      venousMove(id, v);
      kids.push(root);
    }
    // (The layer is handed the roots again only when one is new or one has gone: the same roots in the same order are what it holds.)
    if (fresh || kids.length !== vstKids.length || kids.some((k, i) => k !== vstKids[i])) { vstKids = kids; late('kids', ov.venous, kids); }
  }
  // A rolled stent's frames at its k: the front at arc length d0 + (d1 − d0)·ease(k), its marker across the mesh there.
  function venousMove(id, v) {
    const P = v.parts;
    if (!P?.root) return;
    const e = easeInOut(v.k), d = P.d0 + (P.d1 - P.d0) * e, q = frameAt(id, d), sg = P.d1 >= P.d0 ? 1 : -1;
    const ang = Math.atan2(sg * q.ty, sg * q.tx) * 180 / Math.PI, r = P.R(d);
    const at = `translate(${q.x.toFixed(2)} ${q.y.toFixed(2)}) rotate(${ang.toFixed(2)})`;
    // (The strength on each piece, not on a group round them: a see-through group is painted as a layer of its own, read once.)
    const o = Math.min(1, v.k * 3).toFixed(3);
    for (const el of P.fade) putA(el, 'opacity', el === P.fade.at(-1) && !(v.k > 0.02) ? '0' : o);
    putA(P.front, 'transform', at);
    putA(P.back, 'transform', `rotate(${(-ang).toFixed(2)}) translate(${(-q.x).toFixed(2)} ${(-q.y).toFixed(2)})`);
    // (The front's marker across the mesh there: one scale both ways, which the painter takes for its stroke too; whole at the end.)
    putA(P.mark, 'transform', `${at} scale(${(r / (P.r1 || 1)).toFixed(3)})`);
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
        // (A rolled stent only moves its frames; one that comes in or goes out is built or taken away.)
        if (v.parts && v.k > 0.002 && !(v.parts.open && v.k < 1)) venousMove(id, v); else if (v.parts || (v.k > 0.002) !== (was > 0.002)) vstDirty = true;
        if (v.k !== goal) moving = true;
      }
      if (v.k === 0 && !goal) { if (v.parts) vstDirty = true; vst.delete(id); }
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
    // (A TIPS already in when the page opens is in whole; one that comes in after it unrolls once its shunt has drawn on.)
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
