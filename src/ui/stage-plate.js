// The plate and the grey: the baked organ layers, live organ read, plate poke and settle, the grey list and the dim and plate ease.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { caught } from './caught.js';
import { easeMove } from './ease.js';
import { cancelFrame } from './frame.js';
import { gpuProbe } from './gpu-probe.js';
import { getLive } from './live-style.js';
import { darkMQ } from './look.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { organDimMatrix } from './organ-dim.js';
import { greyOf, paintRef, parseColor } from './organ-grey.js';
import { readFail, readGroup as readGroupNow, readGroupRefs, targetRoom } from './organ-paint.js';
import { cropToGrid } from './organs-gl.js';
import { paintBox } from './plate-copy.js';
import { leftAlone } from './quiet.js';
import { refine } from './refine.js';
import { sceneBegin, sceneStyle } from './scene-store.js';
import { chainMat, elBoxInto } from './shape-gl.js';
import { clamp } from './util.js';

import { stageScope } from './stage-scope.js';
export function createPlate(st, live) {
  const { EBOX, LAYER_SPENT, LENS_FADE, LIVE_LAYERS, LIVE_ORDER, PLATE_BASE, PLATE_RECT, bakeStep, bowelDy, defs, drawVeins, dropViewKeep, easeInOut, flag, flank, fullOk, gBackdrop, gOrgans, ghost, glWanted, gpuOrgansOn, gutKids, hidePlate, lensNow, liveOn, liverTint, lv, nextFrame, organEls, organG, plateOn, readFluidInk, readFrame, refreshCTM, setG, spleenMoving, spleenMv, spot, spotOn, stageBox, stageWrap, svg, themeKey, vCanvas, wrap, wrapCS, wrapCls } = st;
  // (An element's style from the scene store (worked out from the page's rules, scene-store.js), from the page now; the browser only where it cannot say.)
  const csNow = (el) => { sceneBegin(); return sceneStyle(el) || getComputedStyle(el); };
  // The organs' groups by the layer they are drawn in (organs-gl.js), back to front: the five pictures of the plan, with the two
  // organs that change shape, the spleen and the liver (its ghost line with it), each a layer of its own between them. An element
  // the list does not name (none today) goes with the layer before it, so the order of the SVG is always kept.
  const ORGAN_LAYERS = ['back', 'behind', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'];
  function organLayers() {
    const by = new Map([[live.gGut, 'gut'], [ghost, 'liver']]);
    for (const [id, L] of [['esophagus', 'behind'], ['heart', 'behind'], ['heart-ra', 'behind'], ['heart-grooves', 'behind'], ['appendix', 'behind'],
      ['kidney-l', 'kidney'], ['spleen', 'spleen'], ['stomach', 'stomach'], ['liver', 'liver'], ['falciform', 'front'], ['umbilicus', 'front']]) if (organG[id]) by.set(organG[id], L);
    const out = new Map();
    let last = 'behind';
    for (const k of gOrgans.children) { last = by.get(k) || last; out.set(k, last); }
    return out;
  }
  // ── Optional refinement (refine.js) ──
  // The pictures made sharper after a zoom, and the gut's, take their turns in frames where the figure is not in hand, a little of each
  // frame from one allowance shared by all of them (the 6 ms a step they each took was a frame's own time, and a strip's drawing and
  // read-back came on top of it). Work that is not wanted any more (the state moved on, a newer picture began) is dropped at its turn.
  const refineHeld = () => live.gestureOn() || !leftAlone(120);
  /** Waits for a frame in which refinement may run. Resolves with the ms the frame still has for it, or null once `gone()` says the work is not wanted. */
  const refineWaitFrame = () => new Promise(refineWaitExec), refineWaitExec = (res) => nextFrame(res);   // (kept, no closure made per turn)
  const refineTurn = (gone) => refine.turn(refineWaitFrame, refineHeld, gone);
  /** Runs fn as one step of refinement, its time charged to the frame's allowance (and the longest step noted) under `name`. */
  const refineStep = (name, fn) => { const t0 = performance.now(); try { return fn(); } finally { refine.spent(performance.now() - t0, name); } };
  // The organs as layers (gpuOrgansOn): each layer rasterized as the plate is (rasterPlate, from the same copy), cropped to its own
  // painted box on the plate's pixel grid (so its pixels are the plate's samples), and the set shown whole once every layer is in.
  // Composited back to front on the GPU, each with its group's opacity baked in, they make the plate's picture.
  const EVERYWHERE = [-Infinity, -Infinity, Infinity, Infinity];
  // (Worked out in script from the shapes' own numbers and transforms (elBox, chainMat), not getBBox and getCTM: the organs are out of
  // the page's layout while the GPU draws them, plan "Holding 120 Hz" §3.5.)
  function layerBoxes() {
    const top = gOrgans.parentNode, by = new Map([['back', EVERYWHERE]]);
    for (const [k, L] of organLayers()) {
      let b = EVERYWHERE;
      try {
        const bb = elBoxInto(k, EBOX);
        if (!bb || !(bb.width || bb.height)) continue;
        // (Its outline through every transform, the widest stroke on it (the liver's inner shade, 30 wide, clipped inside) and a margin.)
        b = paintBox(bb, chainMat(k, top), 15, 24);
      } catch (e) { caught('stage:5226', e); /* not measurable: the whole plate */ }
      const u = by.get(L);
      by.set(L, u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b);
    }
    // The bowel (its own layer when the organs are painted live: plateMarkup).
    try { const bb = elBoxInto(organG.bowel, EBOX); if (bb && (bb.width || bb.height)) by.set('bowel', paintBox(bb, chainMat(organG.bowel, top), 15, 24)); } catch { by.set('bowel', EVERYWHERE); }
    return by;
  }
  // Which way each organ layer is drawn (the ?organpaths readout, and the checks): 'GPU' (painted on the GPU from its shapes) or
  // 'picture (why)' (rasterized from the SVG copy: a group the painter cannot read, or the organs not painted live at all).
  // bakeSkip: layers kept as pictures for a check (tests/e2e/plate-layers.mjs, to find which layer a difference comes from).
  const organPaths = new Map(), bakeWhy = new Map();
  const elName = (el) => (!el ? '?' : el.id ? `#${el.id}` : `${el.localName}${el.classList?.length ? `.${[...el.classList].join('.')}` : ''}`);
  // (Why the organs are not painted live, in a few words.)
  function liveWhy() {
    if (!live.veins) return 'no WebGL2';
    if (!gpuProbe.gpuOrgans) return 'GPU organs off: the ?perf switch';
    if (!live.veins.organs) return 'no organ stack: its shader failed';
    if (!live.veins.organs.canLive) return 'the live painter failed to start';
    if (live.liveFailed) return `live painting off: ${live.liveFailWhy || 'an organ not readable'}`;
    return 'painted live';
  }
  /** The organs' drawing paths now: { mode, live, layers: [[name, path]], gpu } (window.pps, and the checks). */
  function organPathsNow() {
    const mode = !live.veins || live.veins.lost ? 'SVG (no GPU figure)' : !plateOn() ? 'SVG (live drawing, no picture shown)' : gpuOrgansOn() ? 'GPU layers' : 'one picture (GPU organs off)';
    return { mode, live: liveOn() ? 'liver, spleen, diaphragm, falciform: painted live' : liveWhy(), layers: gpuOrgansOn() ? [...organPaths] : [], gpu: live.veins?.organs?.stats?.() || null, liveLayers: live.veins?.organs?.liveLayers?.() || null, renderer: live.SOFTWARE ? 'software' : 'gpu' };
  }
  async function rasterLayers(slot, rect, scale) {
    // (Its turn first: reading every organ's box and shape is a step of its own, tens of ms on a phone, begun from a timer.)
    const seq0 = live.plateSeq, drops0 = live.plateDrops, v = live.veins;
    if (await refineTurn(() => seq0 !== live.plateSeq || drops0 !== live.plateDrops || v !== live.veins || !v || v.lost) === null) return false;
    const boxes = refineStep('organ layers: boxes', layerBoxes), names = [], liveNow = liveOn(), paths = new Map();
    live.layerStarts++; if (live.fluidEasing()) live.layerStartsEasing++;
    // Each layer's picture is painted on the GPU straight from its organs' shapes (bakeLayer). There is no other way to make one: the
    // SVG copy rasterized by the browser, a strip at a time through 2D canvases, is gone (owner, 1 Nov: nothing off the GPU). Without
    // the live painter, or with a layer it cannot read, no picture is made and the organs stay the page's own SVG.
    if (!liveNow) { organPaths.clear(); organPaths.set('all', `SVG (${liveWhy()})`); return false; }
    const baked = refineStep('organ layers: shapes read', bakeAll);
    const unread = [...baked].find(([, b]) => !b);
    if (unread) { organPaths.clear(); organPaths.set(unread[0], `SVG (${bakeWhy.get(unread[0]) || 'not readable'})`); return false; }
    try {
      for (const L of LIVE_ORDER) {
        if (LIVE_LAYERS.has(L)) continue;
        const box = boxes ? boxes.get(L) : EVERYWHERE;
        const r = box && cropToGrid(rect, box, scale);
        if (!r) continue;
        if (!(await bakeLayer(slot, L, baked.get(L), r, scale)) || v !== live.veins || !v.organs) return false;
        names.push(L);
        paths.set(L, 'GPU');
      }
      v.organs.commit(slot, names);
      if (slot === 0) { organPaths.clear(); for (const [L, p] of paths) organPaths.set(L, p); }
      live.layerCommits++;
      syncLiveOrgans(true); v.organs.setOrder(ORGAN_LAYERS);
      return true;
    } finally { if (v === live.veins && !v.lost) v.organs?.dropStaged(slot); }
  }
  // The groups each layer's picture is painted from on the GPU (organs-gl bake), read from the organs' own groups in the SVG's order
  // (readGroup with nest: the gut's see-through shades, the stomach's and duodenum's fades are groups of their own, as the browser
  // lays them): { groups: [{ spec, m }], at } per layer, or null for a layer one of whose groups cannot be read (it is rasterized). The
  // gut's own mask and opacity, and the stomach's see-through liver, are not in them: they are laid over the pictures live (the cuts).
  // (The organs' own colours: a lens's grey is taken off for the read, as for the copy, plateBuild.)
  // The organs' groups as read for painting (organ-paint readGroup), kept until something they were read from changes: a class, a
  // shape's own geometry, a paint, a mask or clip, a part shown or hidden (an attribute or an inline display, visibility, paint or
  // mask), a group added or taken away, or the stage's look (theme, lens classes, the organ colours). What eases (outlines' d, frames,
  // opacities) the painter reads from the page at each paint, so a liver, a fluid or a fade easing keeps them. Reading them walks
  // every organ element with a computed style: about 1,800 style reads in one Varices slide change, for groups that had not changed
  // (motion budget, 2 Nov).
  const READ_ATTRS = ['class', 'style', 'display', 'visibility', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-rule',
    'mask', 'clip-path', 'filter', 'href', 'offset', 'stop-color', 'stop-opacity', 'gradientTransform', 'gradientUnits', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'd'];
  const READ_STYLE = /(?:^|;)\s*(display|visibility|fill|stroke|stroke-width|stroke-dasharray|mask|clip-path|filter|stop-color|stop-opacity|mix-blend-mode|fill-rule)\s*:\s*([^;]*)/g;
  // (A paint set !important is the lens's grey (greySet), which is always taken off before a read: it changes nothing read.)
  const styleSig = (v) => [...String(v || '').matchAll(READ_STYLE)].filter((m) => !/!\s*important/i.test(m[2])).map((m) => `${m[1]}:${m[2].trim()}`).sort().join(';');
  // (Each reading is kept with what it was read from: its group, and the gradients it read. A change inside the group, or to one of
  // those gradients' stops, drops that reading alone: a congested liver easing its colour reads the liver again, not every organ.
  // Anything else in the organ defs (a mask, a clip, a pattern) or a group added or taken away under the organs drops them all.)
  let readEpoch = 0, readMo = null;
  const readKept = new Map();
  const readGrad = (t) => t.closest?.('linearGradient, radialGradient')?.id || '';
  function readDrop(t) {
    if (t === gOrgans || t === gBackdrop || (defs.contains(t) && !readGrad(t))) { readEpoch++; readKept.clear(); return; }
    const id = readGrad(t);
    for (const [el, m] of readKept) {
      if (el.contains(t) || t.contains(el) || (id && [...m.values()].some((k) => k.refs.has(id)))) readKept.delete(el);
    }
  }
  function readSeen(list) {
    for (const m of list) {
      if (m.type !== 'attributes') { readDrop(m.target); continue; }
      const now = m.target.getAttribute(m.attributeName);
      // (An inline style that only eases an opacity or a transform, and a d that only moves an outline, change nothing read.)
      if (m.attributeName === 'style') { if (styleSig(m.oldValue) !== styleSig(now)) readDrop(m.target); continue; }
      if (m.attributeName === 'd') { if (!m.oldValue !== !now) readDrop(m.target); continue; }
      if (m.oldValue !== now) readDrop(m.target);
    }
  }
  // (Of the stage's and the page's classes, only those the style sheets use in a rule over the organs count: a class that styles
  // something else (data-layer, thumb-ui) changing as a slide changes read every organ again (motion budget, 2 Nov). The sheets are
  // walked once, and again when their number changes; a sheet that cannot be read keeps every class, as before.)
  const ORGAN_SEL = /organ|tone-|lv-|og-|backdrop|flank|abdomen|cavity|gut|bowel|colon|stomach|spleen|liver|kidney|heart|eso|duoden|seam|diaphragm|plate/;
  let organCls = null, organClsN = -1;
  function organClasses() {
    const n = document.styleSheets.length;
    if (n === organClsN) return organCls;
    organClsN = n; organCls = new Set();
    const walk = (rules) => { for (const r of rules) { if (r.cssRules) walk(r.cssRules); const sel = r.selectorText; if (sel && ORGAN_SEL.test(sel)) for (const m of sel.matchAll(/\.([\w-]+)/g)) organCls.add(m[1]); } };
    try { for (const sh of document.styleSheets) walk(sh.cssRules); } catch { organCls = null; }
    return organCls;
  }
  const organKey = (el) => { const c = organClasses(); return c ? [...el.classList].filter((k) => c.has(k)).sort().join(' ') : el.className; };
  const readLook = () => { const cs = wrapCS(); return `${readEpoch}|${themeKey()}|${organKey(wrap)}|${organKey(document.documentElement)}|${cs.getPropertyValue('--stage-bg')}|${cs.getPropertyValue('--organ-liver')}|${flag.imaging}`; };
  /** organ-paint's readGroup(el, opt), or the last reading of it with the same options while nothing it was read from has changed. */
  function readGroup(el, opt) {
    // (Only what the watch below sees is kept: the organs, the backdrop and the defs. The overlays (#stageOver: the tamponade tube, the
    // stents, the clamps) are read again each time syncOver asks, which is only when its own watch saw them change; kept here, the
    // tube's first reading stood for every later frame and the GPU showed the balloon never filling, 2 Nov.)
    if (!(gOrgans.contains(el) || gBackdrop.contains(el) || defs.contains(el))) return readGroupNow(el, opt);
    if (!readMo) {
      readMo = new MutationObserver(readSeen);
      for (const root of [gOrgans, gBackdrop, defs]) readMo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: READ_ATTRS });
    }
    readSeen(readMo.takeRecords());
    const look = readLook(), ok = opt ? `${!!opt.withMask}|${!!opt.nest}|${!!opt.strict}|${!!opt.shown}` : '';
    let m = readKept.get(el);
    const k = m?.get(ok);
    if (k && k.look === look) return k.spec;
    const { spec, refs } = readGroupRefs(el, opt);
    readSeen(readMo.takeRecords());   // (a grey taken off for the read and put back is part of it, not a change after)
    if (spec) { if (!(m = readKept.get(el))) readKept.set(el, (m = new Map())); m.set(ok, { look: readLook(), spec, refs }); }
    return spec;
  }
  function bakeAll() {
    const greyed = !!greyList;
    if (greyed) { greyClear(); organDimKey = ''; }
    bakeWhy.clear();
    try {
      const out = new Map(), layerOf = organLayers(), key = plateStateKey();
      for (const L of LIVE_ORDER) {
        if (LIVE_LAYERS.has(L)) continue;
        const els = L === 'bowel' ? [organG.bowel] : L === 'gut' ? gutKids().filter((k) => k !== organG.bowel) : [...layerOf].filter(([k, l]) => l === L && k !== live.gGut).map(([k]) => k);
        const groups = [];
        let ok = true;
        for (const el of els) {
          if (!el || csNow(el).display === 'none') continue;
          const spec = el.localName === 'g' ? readGroup(el, { withMask: el !== organG.stomach, nest: true }) : null;
          if (!spec) { console.warn('Organs on the GPU: not readable for painting, this layer stays a picture:', el); bakeWhy.set(L, `${elName(el)} not readable${readFail() ? `: ${readFail()[0]} on ${elName(readFail()[1])}` : ''}`); ok = false; break; }
          groups.push({ spec, m: matOfEl(el).slice() });
        }
        out.set(L, ok ? { groups, at: L === 'bowel' ? bowelDy() : 0, key } : null);
      }
      return out;
    } finally { if (greyed) syncOrganDim(); }
  }
  // A layer's picture painted on the GPU from its groups, a few milliseconds a frame (the picture shown meanwhile stays), and staged
  // for the slot once whole; false when the state it shows moved on while it was painted (as rasterPlate gives one up).
  async function bakeLayer(slot, L, b, rect, scale) {
    const v = live.veins, seq = live.plateSeq, drops = live.plateDrops, key = b.key, vseq = slot === 1 ? ++live.viewSeq : 0;
    const gone = () => seq !== live.plateSeq || drops !== live.plateDrops || v !== live.veins || v.lost || !v.organs || (slot === 1 && vseq !== live.viewSeq) || key !== plateStateKey();
    const job = v.organs.bake(slot, L, b.groups, rect, scale, b.at);
    if (!job) return false;
    try {
      // (Painted a few ops in each frame that has some of the shared allowance left, none in a gesture's: a step paints at least one op,
      // and the longest one is noted by layer.)
      for (;;) {
        const ms = await refineTurn(gone);
        if (ms === null) return false;
        const t0 = performance.now();
        const done = gpuProbe.time(null, 'organ picture: GPU paint', bakeStep, job, t0 + ms);
        refine.spent(performance.now() - t0, LAYER_SPENT[L]);
        if (done) return true;
      }
    } finally { if (!v.lost) job.drop(); }
  }
  // The live organs' specs (organ-paint readGroup) read again whenever what they draw may have changed (liveKey), for the next
  // render of the stack. Their outlines are read from the page at the render itself.
  const matBuf = [1, 0, 0, 1, 0, 0];   // (one frame matrix kept, written over at each read; every reader multiplies it at once, none keeps it: a baked group takes a copy)
  const matOfEl = (el) => {
    const t = el?.transform?.baseVal, o = matBuf;
    if (!t || !t.numberOfItems) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 1; o[4] = 0; o[5] = 0; return o; }
    const k = t.consolidate().matrix;
    o[0] = k.a; o[1] = k.b; o[2] = k.c; o[3] = k.d; o[4] = k.e; o[5] = k.f;
    return o;
  };
  const MASK_OF = { gut: '#gutHide', stomach: '#frontM' };
  const liveKeyNow = ['', '', '', '', '', '', '', '', '', '', '', ''], liveKeyOld = ['', '', '', '', '', '', '', '', '', '', '', ''];
  let pseEl = null;   // (the embolized spleen's infarct group, found once: stage.js detailFor)
  // (What eases, the outlines, the organs' frames and the parts' own opacities, the painter reads from the page at each paint
  // (organ-paint liveOf): the specs are read again only when what is in them changes: a part hidden or shown, the liver's mask,
  // the ghost line, a lens, the theme and its colours. They were read again on every frame of an ease: about fifty computed
  // styles, with the step's writes pending.)
  const fullWanted = () => fullOk() && (live.fullSwap || !live.veins.organs.pictured(0));
  // (The key as its parts, in a kept list, not a string built: the same parts as before, compared one by one against the last.)
  function liveKey() {
    const cs = wrapCS(), k = liveKeyNow;
    k[0] = organG.liver.getAttribute('mask') ?? ''; k[1] = ghost.style.display; k[2] = lv.sep.style.visibility; k[3] = lv.nod.style.visibility; k[4] = lv.cong.style.visibility; k[5] = lv.isl.style.visibility;
    k[6] = cs.getPropertyValue('--stage-bg'); k[7] = cs.getPropertyValue('--organ-liver'); k[8] = flag.imaging; k[9] = themeKey(); k[10] = fullWanted();
    // (The embolized spleen's infarct shown or hidden: without it the live spleen kept the infarct after the treatment was taken off,
    // Mohammad 6 Nov 2026.)
    k[11] = (pseEl ??= organG.spleen.querySelector('.spleen-pse'))?.getAttribute('display') ?? '';
    return k;
  }
  function liveKeySame() { for (let i = 0; i < liveKeyNow.length; i++) if (liveKeyNow[i] !== liveKeyOld[i]) return false; return true; }
  function syncLiveOrgans(force = false) {
    const v = live.veins;
    if (!v || v.lost || !v.organs) return;
    if (!liveOn()) { if (live.liveSet) { v.organs.setLive(null, null); live.liveSet = false; live.liveKeyWas = ''; } return; }
    const key = liveKey();
    if (!force && live.liveKeyWas && liveKeySame()) return;
    // (fullWanted: the whole set, while no picture is in; its change asks for a new reading too, through the key.)
    // (The organs' own colours: a lens's grey on the live SVG (only while the plate is off) would be read as theirs. The whole set
    // takes it off for its read, liveRead.)
    if (greyList && !fullWanted()) return;
    for (let i = 0; i < key.length; i++) liveKeyOld[i] = key[i];
    live.liveKeyWas = 'kept';
    // (The specs are read first in the next frame, while the layout is still the last frame's (readFrame), and handed to the stack in
    // that frame's own phase after: never read among a frame's writes.)
    liveAsk ||= readFrame(liveRead);
  }
  let liveAsk = 0;
  // (The backdrop (the diaphragm) is out of the page's layout, display: none, while the GPU draws the plate (app.css): read as shown, or its dome was
  // left out of every reading made then, and the figure drew without it: 2 Nov 2026, e6d08386.)
  const BACKDROP_READ = { shown: true };
  const NO_MASKS = new Map();   // (never written: the whole set has no masks, liveApply)
  function liveRead() {
    liveAsk = 0;
    const v = live.veins;
    if (!v || v.lost || !v.organs || !liveOn() || (greyList && !fullWanted())) { live.liveKeyWas = ''; return; }
    const organs = new Map(), masks = new Map();
    let ok = true;
    live.liveFailWhy = '';
    const add = (L, el, opt) => {
      if (csNow(el).display === 'none' && !opt?.shown) return;
      const spec = readGroup(el, opt);
      if (!spec) { ok = false; live.liveFailWhy ||= `${elName(el)} not readable`; console.warn('Organs on the GPU: not readable for painting, the organs stay pictures:', el); return; }
      if (!organs.has(L)) organs.set(L, []);
      organs.get(L).push({ spec, get m() { return matOfEl(el); } });   // (the group's own frame, as it is at each paint)
    };
    const full = fullWanted();
    // (The whole set: every layer's groups painted live, each with its own mask, as the browser lays them; no cuts over pictures. Read
    // in the organs' own colours: a lens's grey on the SVG is taken off for the read and put back, as for the pictures, bakeAll.)
    if (full) {
      const greyed = !!greyList;
      if (greyed) { greyClear(); organDimKey = ''; }
      // (Read as the pictures' groups are, bakeAll: the gut's see-through shades and the stomach's fades are groups of their own.)
      try { add('back', gBackdrop, BACKDROP_READ); for (const [k, L] of organLayers()) if (L !== 'back') add(L, k, LIVE_LAYERS.has(L) ? undefined : { nest: true }); } finally { if (greyed) syncOrganDim(); }
      nextFrame(() => liveApply(ok, organs, NO_MASKS, true));
      return;
    }
    add('back', gBackdrop, BACKDROP_READ);
    for (const [k, L] of organLayers()) if (LIVE_LAYERS.has(L)) add(L, k);
    for (const [L, sel] of Object.entries(MASK_OF)) {
      const el = defs.querySelector(sel), g = L === 'gut' ? live.gGut : organG.stomach;
      const spec = el && readGroup(el);
      if (!spec) { ok = false; live.liveFailWhy ||= `mask ${sel} not readable`; continue; }
      // (The gut's: its group's opacity laid with it, and the bowel's picture, at rest, gathered under it with its float. el: the
      // element whose frame m reads, watched by the stack for writes with the mask's own elements: organs-gl watchLive.)
      masks.set(L, L === 'gut' ? { spec, el: g, get m() { return matOfEl(g); }, opacity: parseFloat(csNow(live.gGut).opacity), under: [{ name: 'bowel', dy: bowelDy() }] } : { spec, el: g, get m() { return matOfEl(g); } });
    }
    nextFrame(() => liveApply(ok, organs, masks));
  }
  function liveApply(ok, organs, masks, full = false) {
    const v = live.veins;
    if (!v || v.lost || !v.organs || !liveOn()) return;
    if (full) {
      // (A layer the painter cannot read: the whole set is given up for good, and the pictures are dropped the old way, the SVG
      // showing until they are made again. The changing organs stay live.)
      if (!ok || !fullWanted()) { if (!ok) live.fullFailed = true; const swap = live.fullSwap; live.fullSwap = false; live.liveKeyWas = ''; if (swap) hidePlate(); syncLiveOrgans(true); return; }
      live.fullSwap = false;
      if (v.organs.pictured(0)) v.dropPlate(0);   // (the old pictures, of the state before, go as the whole set comes in)
      v.organs.setLiveAll(organs); live.liveSet = true;
      v.organs.setOrder(ORGAN_LAYERS);
      live.veinsDirty = true; platePoke(); live.stageWake();
      return;
    }
    if (!ok) { live.liveFailed = true; v.organs.setLive(null, null); live.liveSet = false; hidePlate(); platePoke(); return; }
    // (The next composite renders the stack again for it (its version moved): the vessels themselves need no redraw.)
    v.organs.setLive(organs, masks); live.liveSet = true;
    live.veinsDirty = true; live.stageWake();   // (composited again with the new specs in the next frame, as it was in the frame they were read)
  }
  // What the plate shows, in coarse steps: re-rasterize when it changes. A selected organ is not part of it: its outline is drawn
  // outside the organs (gSelO, or on the GPU) and its dim on the GPU, and its .org-sel class styles nothing, so the picture was
  // the same; drawing it again made every highlight and unhighlight lag (Mohammad, 20 Oct: "even highlighting the liver is laggy").
  let tintQ = 0;
  let bowelHeld = null;
  function plateStateKey() {
    const cs = wrapCS();
    // The tint in coarse steps, with some hysteresis: a pressure that wavers on a step boundary
    // while the model runs must not re-rasterize the plate over and over.
    const tq = (parseFloat(liverTint.style.opacity) || 0) * 40;
    if (Math.abs(tq - tintQ) > 1.5 || (tq === 0 && tintQ !== 0)) tintQ = Math.round(tq);
    // (With the changing organs painted live, the pictures hold none of them: only the rest is the pictures' state.)
    // (The bowel's float only once the fluid has settled: while it eases, the bowel's picture is moved on the GPU, organs-gl.js shift.)
    if (!live.fluidEasing()) bowelHeld = organG.bowel.getAttribute('transform');
    if (liveOn()) return ['live', bowelHeld, themeKey(), cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), flag.imaging].join('|');
    return [live.liverKey, organG.liver.getAttribute('transform')?.replace(/(\d\.\d\d\d)\d*/g, '$1'), organG.spleen.getAttribute('transform')?.replace(/(\d\.\d\d)\d*/g, '$1'), live.diaKey,
      tintQ,
      organG.bowel.getAttribute('transform'), (flank.getAttribute('d') || '').slice(0, 24), organEls.umbilicus?.getAttribute('opacity'),
      organG.spleen.style.opacity, (pseEl ??= organG.spleen.querySelector('.spleen-pse'))?.getAttribute('display'),   // (the spleen removed, or its infarct shown)
      cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), flag.imaging].join('|');
  }
  // Hidden (the home page over the app), every organ would rasterize invisible: wait until the figure shows.
  const figureHidden = () => wrapCS().getPropertyValue('visibility') === 'hidden';
  // The circuit's own colours (.cmap) in the dark theme: it sets its own --stage-bg, which the organs' fills mix with. They come
  // on halfway through the switch, when the organs are half faded, and read as a theme change: the picture was dropped, every
  // organ drawn live for the rest of the fade (the gut's 1,201 paths), and the picture drawn again mid-switch, in the circuit's
  // colours, then once more on the way back (Mohammad, 20 Oct: "switching from anatomy to circuit lags mid switch and back").
  // While they are on the organs are fading out or gone, so the picture in the anatomy's colours stays; a change made in the
  // circuit is drawn once the anatomy's colours are back. (In the light themes the circuit keeps the stage's colour: no change.)
  let anatBg = null, cmapSeen = false;
  function circuitInk() {
    const on = stageWrap.classList.contains('cmap');
    if (on !== cmapSeen) { cmapSeen = on; live.csSnap = null; }   // (the style snapshot is dropped by an observer, a beat after the class)
    const bg = wrapCS().getPropertyValue('--stage-bg');
    if (!on) { anatBg = bg; return false; }
    return anatBg !== null && bg !== anatBg;
  }
  function platePoke() {
    // Not while diving into the lobule (the anatomy is only magnified, then covered): once landed, under the lobule. Nor through a
    // rise: the organs ease on in view (anatEasing), and a picture dropped or swapped mid-zoom flashed; it is made once it lands.
    if ((live.lobuleOn && !live.lz?.isOpen()) || (live.diveT > 0 && live.diveT < 1)) return;
    // In the background no picture is begun (below), but one in colours the page no longer has is dropped at once, for the live
    // drawing (already in the colours now, drawn in the same task): the system turns the page light for the app switcher's
    // pictures and dark again while it is hidden, and the light picture stayed on the canvas until the next one replaced it, so
    // coming back showed the organs almost white first (Mohammad, 21 Oct: "the flash when I switch to the app ... still happens").
    if (document.hidden && live.veins && !live.veins.lost && live.plateTheme !== null && live.veins.hasPlate(0) && !circuitInk()) {
      const theme = `${wrapCS().getPropertyValue('--stage-bg')}|${themeKey()}`;   // (the look as well as the ground: Light and Soft, Dark and Navy, may share one)
      if (theme !== live.plateTheme) { live.plateTheme = theme; hidePlate(); }
    }
    if (!live.veins || live.veins.lost || !glWanted(easeInOut(live.morph)) || figureHidden() || document.hidden || circuitInk()) return;
    // An ease that outgrows the plate (a fill played over days, a liver that changes in small steps) shows on the live drawing
    // as it goes, and the plate is drawn again once it settles: held, the organs inside it stood still while their outlines
    // moved, then jumped to the new shape at the end (Ascites deck slide 5, 17 Oct).
    // (With the changing organs painted live (liveOn) nothing is held or dropped: the pictures under them hold no liver, spleen or
    // diaphragm, and are made again while the fluid eases, a strip a frame, the one shown staying until the new one is in.)
    const liveNow = liveOn();
    if (!liveNow && (live.lvMoving || live.fluidEasing())) { if (live.plateKey && live.veins.hasPlate(0) && plateStateKey() !== live.plateKey) hidePlate(); return; }
    // (A growing spleen: no new size may come once it stops, so a later poke rasterizes it once it has settled.)
    if (!liveNow && spleenMoving()) { if (live.plateKey && live.veins.hasPlate(0) && plateStateKey() !== live.plateKey) hidePlate(); stageScope.clear(live.spleenTimer); live.spleenTimer = stageScope.timer(platePoke, 320); return; }
    const stale = live.plateStale; live.plateStale = false;
    const key = plateStateKey();
    if (key === live.plateKey && live.veins.hasPlate(0)) return;
    readFluidInk(wrapCS());
    // A theme switch: the old raster would keep the old background for a beat, so show the live
    // SVG plate (already in the new theme) at once and rasterize again without the throttle.
    const theme = `${wrapCS().getPropertyValue('--stage-bg')}|${themeKey()}`;   // (the look as well as the ground: Light and Soft, Dark and Navy, may share one)
    const themed = live.plateTheme !== null && theme !== live.plateTheme;
    live.plateTheme = theme;
    // Shown again after being covered while the patient changed (followHidden): the raster still holds the patient before, so
    // the live drawing, already of the patient now, shows until it is rasterized again.
    // (With the changing organs painted live on the GPU (liveOn) the pictures hold none of them, as for any other change of patient
    // below: the GPU picture stays up and is made again behind it. Dropping it showed the page's SVG organs, which Safari draws again
    // on the CPU at the screen's full pixels on every frame the camera moves: the way out of the lobule and the slide's glide after it
    // ran at a few frames a second on an iPhone (Mohammad, 1 Nov). ?stalekeep=0: dropped, as before.)
    const drop = themed || (stale && !liveNow);
    if (drop && live.veins.hasPlate(0)) {
      hidePlate();
    }
    if (live.plateBusy) { live.plateAgain = true; return; }
    // (A liver that just settled may be pausing mid time-lapse: give it a moment.)
    // A picture that came too late (the change moved on before it landed, so it was given up) waits longer the next time, 0.8 s,
    // then 1.6, then 3.2 after the liver or the fluid last moved: a time-lapse that pauses between steps began a whole organ picture in each pause
    // and threw it away, a frame of a quarter of a second each time on an iPhone (Mohammad's ?perf recording, 21 Oct). The live
    // drawing shows meanwhile, as it does now; once one lands the wait is as before.
    // (Now one step only, 0.8 s: the whole picture is made a strip per frame from the shapes that meet each strip (0e73bb6), so one
    // given up costs a strip, and the waits of up to 3.2 s kept the live organs up, every pan or zoom a repaint of all of them, for
    // seconds after a change: external review, 22 Oct.)
    const still = live.plateMiss ? 800 : 400;
    const wait = themed ? 0 : liveNow ? Math.max(0, 500 - (performance.now() - live.plateLast)) : Math.max(0, 500 - (performance.now() - live.plateLast), still - (performance.now() - live.lvStillAt), 400 - (performance.now() - spleenMv.stillAt()), still - (performance.now() - live.fluidStillAt));
    stageScope.clear(live.plateTimer);
    live.plateTimer = stageScope.timer(async () => {
      const moving = !liveOn() && (live.lvMoving || live.fluidEasing() || spleenMoving());
      if (figureHidden() || moving || (live.lobuleOn && !live.lz?.isOpen()) || (live.diveT > 0 && live.diveT < 1) || circuitInk() || document.hidden) return;   // hidden, moving or diving meanwhile: a later poke rasterizes
      const k = plateStateKey();
      if (k === live.plateKey && live.veins?.hasPlate(0)) return;   // it changed and changed back
      live.plateBusy = true; live.plateLast = performance.now();
      live.plateSeq++;
      try {
        if (gpuOrgansOn() && await rasterLayers(0, PLATE_RECT, PLATE_BASE)) {
          live.plateKey = k;
          // The sharp view raster stays until its replacement lands (dropping it first would show
          // the softer whole plate for a beat: the textures would blur, then sharpen).
          live.plateView = null; live.plateViewKey = ''; dropViewKeep();   // (a picture of the state before: nothing to take from it)
          live.veinsDirty = true; live.stageWake();
          if (!plateOn() && glWanted(easeInOut(live.morph)) && (liveOn() || (!live.lvMoving && !spleenMoving()))) {
            // The raster lands outside an animation frame (and the next frames may be paced out):
            // hide the SVG organs only together with a GPU draw that shows the plate, or a frame
            // would show neither (a flash of the dark stage through the organs).
            wrap.classList.add('gl-plate'); syncPlateLook();
            if (!drawVeins(false, 'plate landed')) { wrap.classList.remove('gl-plate'); live.plateDirty = true; syncPlateLook(); }
          } else syncPlateLook();
          live.plateMiss = plateOn() ? 0 : Math.min(3, live.plateMiss + 1);
          if (!plateOn()) live.plateKey = '';   // not shown (the liver moved meanwhile): raster again once it settles
          else if (live.risePrep) { live.risePrep = false; stageScope.clear(live.risePrepT); }   // (made for the way out: the anatomy under the lobule rests again)
          schedulePlateView();
        } else if (plateStateKey() !== k) live.plateAgain = true;   // (given up as out of date: drawn again for the state now)
        if (live.plateAgain && !plateOn()) live.plateMiss = Math.min(3, live.plateMiss + 1);   // (and the next one waits longer for the change to rest)
      } catch (e) { console.warn('Plate raster failed; the SVG plate stays.', e); }
      live.plateBusy = false;
      if (live.plateAgain) { live.plateAgain = false; platePoke(); }
    }, wait);
  }
  // In the background nothing is drawn again (the page's colours can change and change back meanwhile, as above): back in
  // view, the picture is checked against the state now, and drawn again only if that differs.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) platePoke(); });
  // The ?perf switch "GPU organs": the picture shown now is dropped (the live drawing shows for a beat) and made again the other way.
  gpuProbe.onOrgans = () => { live.plateKey = ''; live.liveFailed = false; live.liveFailWhy = ''; if (live.veins && !live.veins.lost) { hidePlate(); syncLiveOrgans(); live.veins.organs?.dropKept(); } platePoke(); };
  // After a pan or zoom settles, a raster of the view at the screen's resolution (when the
  // whole-plate raster would look soft there).
  function schedulePlateView() {
    stageScope.clear(live.plateSettle);
    live.plateSettle = stageScope.timer(settled, 280);
  }
  async function settled() {
    // (Not with a finger or button still down, nor within 0.28 s of the last input: it is begun once the figure is let go.)
    if (!leftAlone(280)) { live.plateSettle = stageScope.timer(settled, 120); return; }
    if (live.moveLow) { live.plateSettle = stageScope.timer(settled, 120); return; }   // (While moving: made for the canvas at rest)
    if (!live.veins || !plateOn() || !live.CTM) return;
    // (Not in the circuit, or on the way to it: the organs are faded out there, and their sharp picture and the gut's were
    // drawn after every pan and pinch for nothing (Mohammad, 21 Oct: the lag "also happens in circuit view"). The way back to
    // the anatomy moves the view on every frame, so the last of them, at the anatomy, schedules them again.)
    if (live.morphTarget !== 0 || live.morph > 0) return;
    const need = live.vdpr * live.CTM.sc;
    if (need <= PLATE_BASE * 1.2) { if (live.veins.hasPlate(1)) { live.veins.dropPlate(1); live.veinsDirty = true; live.stageWake(); } return; }
    // The view in world units (the anatomy is never turned), with a margin, within the plate.
    const r = stageBox(), [ax, ay] = clientToWorldFast(r.left, r.top), [bx, by] = clientToWorldFast(r.right, r.bottom);
    // (Painted on the GPU (bake) a view's picture costs little for its size, so it reaches half a view past each side, as far as
    // the texture's limits allow at the screen's resolution: most pans then stay inside it, below. As pictures of the SVG copy it
    // reaches a seventh, each pan's uncovered strip drawn from the copy.)
    const vw = (bx - ax) * need, vh = (by - ay) * need;
    const reach = liveOn() ? Math.max(0.15, Math.min(0.5, (Math.sqrt(4.2e6 / Math.max(1, vw * vh)) - 1) / 2, (4094 / Math.max(1, vw, vh) - 1) / 2)) : 0.15;
    const mx = (bx - ax) * reach, my = (by - ay) * reach;
    let x0 = Math.max(PLATE_RECT[0], ax - mx), y0 = Math.max(PLATE_RECT[1], ay - my);
    let x1 = Math.min(PLATE_RECT[0] + PLATE_RECT[2], bx + mx), y1 = Math.min(PLATE_RECT[1] + PLATE_RECT[3], by + my);
    if (x1 <= x0 || y1 <= y0) return;
    // (4094: the rect grows by up to a pixel each way below, and a texture side stays within 4096.) Painted on the GPU, the
    // picture is painted through the painter's targets, which hold its width and the canvas's height, or the other way round:
    // its sides are kept so those stay within the room the canvas gives them (organ-paint targetRoom). A view taller than the
    // screen and one wider made them 4096 square on an iPad at 2×, and Safari ended the page (Mohammad, 25 Oct).
    const roomW = live.picNow ? live.picNow[0] : vCanvas.width, roomH = live.picNow ? live.picNow[1] : vCanvas.height;   // (the picture's pixels: under Sharper upscaling the canvas is larger)
    const room = targetRoom(roomW, roomH);
    const scale = Math.min(need, 4094 / (x1 - x0), 4094 / (y1 - y0), Math.sqrt(4.2e6 / ((x1 - x0) * (y1 - y0))),
      room / (Math.max(1, roomH) * (x1 - x0)), room / (Math.max(1, roomW) * (y1 - y0)));
    // On the scale's pixel grid (grown outward to whole pixels): two views at one scale sit whole pixels apart, so the next pan
    // can take the pixels they share (rasterPlate).
    x0 = Math.floor(x0 * scale) / scale; y0 = Math.floor(y0 * scale) / scale; x1 = Math.ceil(x1 * scale) / scale; y1 = Math.ceil(y1 * scale) / scale;
    const key = `${live.plateKey}|${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}|${scale.toFixed(2)}`;
    if (key === live.plateViewKey) return;
    // The picture of the view kept while it still covers what is on screen (not the margin around it) at the resolution wanted:
    // a pan or a small zoom within it makes nothing new. (It was made again whenever the margin left it, after nearly every pan.)
    const vx0 = Math.max(PLATE_RECT[0], ax), vy0 = Math.max(PLATE_RECT[1], ay), vx1 = Math.min(PLATE_RECT[0] + PLATE_RECT[2], bx), vy1 = Math.min(PLATE_RECT[1] + PLATE_RECT[3], by);
    if (live.plateView && vx0 >= live.plateView[0] && vy0 >= live.plateView[1] && vx1 <= live.plateView[2] && vy1 <= live.plateView[3] && scale <= live.plateView[4] * 1.05) return;
    live.plateViewKey = key;
    try { if (gpuOrgansOn() && await rasterLayers(1, [x0, y0, x1 - x0, y1 - y0], scale)) { live.plateView = [x0, y0, x1, y1, scale]; live.veinsDirty = true; live.stageWake(); } else if (live.plateViewKey === key) live.plateViewKey = ''; } catch (e) { caught('stage:5661', e); /* the whole-plate raster stays */ }
  }
  const worldBuf = [0, 0];   // (the point kept and written over: every caller takes its two numbers at once)
  function clientToWorldFast(cx, cy) {
    if (!live.CTM) refreshCTM();
    const { a, b, c, d, e, f } = live.CTM, det = a * d - b * c || 1, x = cx - e, y = cy - f;
    worldBuf[0] = (d * x - c * y) / det; worldBuf[1] = (-b * x + a * y) / det;
    return worldBuf;
  }
  // With a vessel selected the organs (and the ascites over them) step back to SEL_DIM, as app.css's .has-sel filter (G20).
  const SEL_DIM = 0.6;
  const SPOT_NET = 0.16;   // the network's alpha outside a slide's spotlight (deck visuals V2)
  // The plate's dim and grey (a lens or a selection) and the network's dim ease toward their targets
  // (stepPlateEase, each frame), so a lens switch or a selection never changes the figure in one frame.
  const plateTgt = [1, 1, 1];   // (the three targets kept and written over: each caller reads them at once)
  const plateTargets = () => {
    const dataLayer = flag.dataLayer, own = flag.hasSel || wrap.classList.contains('shunting'), sel = own || spotOn();
    // (A slide's spotlight steps the rest of the network further back than a selection, SPOT_NET: its vessels are a set, and a pale
    // one, as the paraumbilical vein in Pressure colours, must still stand out of it.)
    plateTgt[0] = (sel ? SEL_DIM : 1) * (dataLayer ? 0.72 : 1); plateTgt[1] = dataLayer ? 0.12 : 1; plateTgt[2] = own ? 0.42 : sel ? SPOT_NET : 1;
    return plateTgt;
  };
  const plateLook = { alpha: 0, sat: 1, stack: false };   // (the plate's look handed to the vessels' painter: kept, written over, read at once)
  function syncPlateLook() {
    syncOrganDim();
    if (!live.vLook) return;
    if (live.plateDim == null || reduceMotion.matches) [live.plateDim, live.plateSat, live.netA] = plateTargets();
    if (plateOn()) { plateLook.alpha = (1 - easeInOut(live.morph)) * live.plateDim; plateLook.sat = live.plateSat; plateLook.stack = gpuOrgansOn(); live.vLook.plate = plateLook; } else live.vLook.plate = null;
    live.vLook.netAlpha = live.netA;
  }
  // The live SVG organs (shown while the GPU copy is off: a patient change, a theme switch, no WebGL) take the same dim and
  // grey, on the same eased values (organ-dim.js), only while they show. The grey is each fill, stroke and gradient stop's own
  // colour made grey (organ-grey.js), and the dim the groups' opacity: no filter. A filter over the organs made Safari draw
  // every organ again on each frame of a change in any lens but Pressure (a cirrhosis slider, HVPG 8 to 9, 17 Oct), and one on
  // each organ came on a frame late in Safari (the organs flashed to colour). The same picture as the filter's: the grey is
  // linear in each colour and keeps alpha, so greying each paint equals greying their composite, overlaps and translucency
  // included; opacity multiplies alpha as the matrix's alpha row did. A colour the grey cannot read keeps the filter.
  const organDimFx = defs.querySelector('#organDim feColorMatrix');
  let organDimKey = '', greyList = null, greyFilter = false;
  // (While dimmed the groups' opacity transition (app.css, .5 s) is off: it would start each dim from full strength, a flash of
  // the undimmed organs at every patient change. The dim eases on the plate's own clock, as the filter's did.)
  const organGs = [gOrgans, gBackdrop];
  function paintOrganAlpha() {
    const a = String(live.organMorphA * live.organDimA), tr = live.organDimA !== 1 ? 'none' : '';
    for (let i = 0; i < organGs.length; i++) {
      const g = organGs[i];
      if ((getLive(g, 'transition') ?? g.style.transition) !== tr) setG(g, 'style:transition', tr);
      if ((getLive(g, 'opacity') ?? g.style.opacity) !== a) setG(g, 'style:opacity', a);
    }
  }
  // Every colour the organs paint with (shapes, their gradients' stops and patterns' contents), as computed with no grey on.
  const GREY_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'text', 'tspan', 'use', 'stop']);
  function greyRead() {
    sceneBegin();
    const list = [], refs = [], seen = new Set();
    const visit = (el) => {
      if (!GREY_TAGS.has(el.localName)) return true;
      const cs = sceneStyle(el) || getComputedStyle(el);
      for (const p of el.localName === 'stop' ? ['stop-color'] : ['fill', 'stroke']) {
        const v = cs.getPropertyValue(p).trim();
        if (!v || v === 'none') continue;
        const id = paintRef(v);
        if (id) { refs.push(id); continue; }   // (a gradient or pattern: its own colours are greyed)
        const c = parseColor(v);
        if (!c) return false;
        list.push({ el, p, c, was: el.style.getPropertyValue(p), pri: el.style.getPropertyPriority(p) });
      }
      return true;
    };
    for (const el of [...gBackdrop.querySelectorAll('*'), ...gOrgans.querySelectorAll('*')]) if (!visit(el)) return null;
    while (refs.length) {
      const id = refs.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const r = svg.querySelector(`[id="${id}"]`);
      if (r) for (const el of r.querySelectorAll('*')) if (!visit(el)) return null;
    }
    return list;
  }
  function greyClear() {
    if (!greyList) return;
    for (const g of greyList) { if (g.was) g.el.style.setProperty(g.p, g.was, g.pri); else g.el.style.removeProperty(g.p); }
    greyList = null;
  }
  function greySet(sat) {
    if (greyFilter) { organDimFx.setAttribute('values', organDimMatrix(1, sat)); return; }
    const q = Math.round(sat * 256) / 256;   // (1/256 steps: under half a level of an 8-bit screen, and the strings are made once)
    for (const g of greyList) g.el.style.setProperty(g.p, greyOf(g.c, q), 'important');
  }
  // The colours are read again when what they depend on changes (the theme, the stage's classes), before the next paint.
  const greyDeps = () => { const r = document.documentElement; return `${wrapCls()}|${r.className}|${themeKey()}|${darkMQ.matches}`; };
  let greyAt = '';
  const greyStale = () => { if (greyList && greyDeps() !== greyAt) { greyClear(); organDimKey = ''; syncOrganDim(); } };
  new MutationObserver(greyStale).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(greyStale).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'class'] });   // (not its style: label sizes change there on every frame of a glide)
  darkMQ.addEventListener?.('change', greyStale);
  // (The colours are read first in the next frame, while the layout is still the last frame's (readFrame), and greyed in that frame's
  // own phase after: the grey starts a frame later, from no grey, as its ease does anyway.)
  let greyAsk = 0, greyWant = false, greySat = 1, greyNew = null;
  function greyOn(sat) {
    greyWant = true; greySat = sat;
    if (!greyFilter && !greyList) { greyAsk ||= readFrame(greyPrep); return; }
    greySet(sat);
  }
  function greyPrep() {
    greyAsk = 0;
    if (!greyWant || greyFilter || greyList) return;
    greyNew = { list: greyRead(), at: greyDeps() };
    nextFrame(greyStart);
  }
  function greyStart() {
    const n = greyNew; greyNew = null;
    if (!n || !greyWant || greyFilter || greyList) return;
    greyList = n.list; greyAt = n.at;
    if (!greyList) { greyFilter = true; for (let i = 0; i < organGs.length; i++) organGs[i].setAttribute('filter', 'url(#organDim)'); }
    greySet(greySat);
  }
  function greyOff() {
    greyWant = false; if (greyAsk) { cancelFrame(greyAsk); greyAsk = 0; } greyNew = null;
    greyClear();
    if (greyFilter) { greyFilter = false; for (let i = 0; i < organGs.length; i++) organGs[i].removeAttribute('filter'); }
  }
  // (The dim's last key as its parts, not a string built a frame: organDimKey is '' for off or reset, 'on' with these two for a dim.)
  let organDimD = 0, organDimS = 0;
  function syncOrganDim() {
    if (live.plateDim == null || reduceMotion.matches) [live.plateDim, live.plateSat, live.netA] = plateTargets();
    const on = !plateOn() && (live.plateDim < 1 || live.plateSat < 1);
    const grey = on && live.plateSat < 1;
    const sat = grey ? live.plateSat : 1;
    if (on ? organDimKey === 'on' && organDimD === live.plateDim && organDimS === sat : organDimKey === '') return;
    organDimKey = on ? 'on' : ''; organDimD = live.plateDim; organDimS = sat;
    live.organDimA = on ? live.plateDim : 1; paintOrganAlpha();
    if (grey) greyOn(live.plateSat); else greyOff();
  }
  const plateEasing = () => { if (live.plateDim == null) return false; const [d, s, n] = plateTargets(); return d !== live.plateDim || s !== live.plateSat || n !== live.netA; };
  // Timed on the clock with an ease in and out (PLATE_FADE), so the organs fade to grey and back smoothly at any frame rate.
  // One clock for organs and vessels (G18): the plate eases over the vessels' own lens crossfade, from the same moment, on the
  // same curve (easeMove, the quintic), as the SVG organs' filter does when the GPU plate is off (app.css: --d-surface, --ease-move).
  const PLATE_FADE = LENS_FADE;
  let plateFrom = null, plateTo = null, plateT0 = 0;
  const plateFromBuf = [0, 0, 0], plateToBuf = [0, 0, 0];   // (kept: plateFrom and plateTo point at these while an ease runs)
  function stepPlateEase() {
    // (Each frame of the crossfade, or of the colours' follow, syncs the vessels, paused too, so it runs to its end. Only the crossfade
    // redraws the whole vessel layer: the colours' follow changes the vessels' own colours, which the sync sends as the rows that changed,
    // drawn again as their cells alone (tint) or as the whole when most changed. It had marked the layer dirty for every frame of a follow,
    // and a running model's colours follow all the time: 17 whole vessel draws a second at 17 fps on the iPad, 4 Nov.)
    if (live.lensFrom) live.veinsDirty = true;
    if (live.lensFrom || live.colEasing) live.glowSync = true;
    if (!spot.on && !plateEasing()) spot.live = false;   // (the spotlight's dim has eased away: the ascites goes back to its own)
    if (!plateEasing()) { plateFrom = null; return; }
    const to = plateTargets(), now = lensNow();
    if (!plateFrom || to[0] !== plateTo[0] || to[1] !== plateTo[1] || to[2] !== plateTo[2]) {
      plateFromBuf[0] = live.plateDim; plateFromBuf[1] = live.plateSat; plateFromBuf[2] = live.netA; plateFrom = plateFromBuf;
      plateToBuf[0] = to[0]; plateToBuf[1] = to[1]; plateToBuf[2] = to[2]; plateTo = plateToBuf;
      plateT0 = live.lensFrom && now - live.lensT0 < 60 ? live.lensT0 : now;
    }
    const u = easeMove(clamp((now - plateT0) / PLATE_FADE, 0, 1));
    if (u >= 1) { live.plateDim = to[0]; live.plateSat = to[1]; live.netA = to[2]; }
    else { live.plateDim = plateFrom[0] + (to[0] - plateFrom[0]) * u; live.plateSat = plateFrom[1] + (to[1] - plateFrom[1]) * u; live.netA = plateFrom[2] + (to[2] - plateFrom[2]) * u; }
    if (u >= 1) plateFrom = null;
    syncPlateLook(); live.veinsDirty = true;
  }
  // A new look is still on its way to the organs: their specs wait to be read (liveAsk) or applied (fullSwap, until liveApply hands the stack
  // the whole set). lookWhole (stage.js) waits for this to be false, so a look change's crossfade takes its new picture whole.
  const lookPending = () => !!liveAsk || !!live.fullSwap;
  return { SEL_DIM, clientToWorldFast, figureHidden, lookPending, organPathsNow, paintOrganAlpha, plateEasing, platePoke, plateStateKey, readGroup, schedulePlateView, stepPlateEase, syncLiveOrgans, syncOrganDim, syncPlateLook };
}
