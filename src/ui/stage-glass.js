// The glasses drawn in the figure's canvas: the frost hosts, what lies over a glass, why one stays solid, and the figure canvas's look.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { restPass } from './rest-pass.js';
import { OVER_ALL, OVER_CLASS, overUnits } from './stage-over.js';

export function createGlass(st, live) {
  const { appEl, cardGLs, cath, frostWake, gOver, glass, labelSvg, lzShares, refreshCTM, sites, svg, vCanvas, wrap } = st;
  // (2 Nov 2026, the iPhone trace: the glass asked the figure's canvas for its computed look on every frame it drew, which made the
  // browser restyle the page there and then, mid-frame. The look is read between frames instead: once at the start, after any write to
  // the canvas or what holds it, and when one of its transitions or animations ends; while one runs the canvas counts as easing, so no
  // glass is taken from it.)
  const vcLook = () => {
    const vc = getComputedStyle(vCanvas);
    return vc.display !== 'none' && vc.visibility === 'visible' ? '' : 'the figure\'s canvas is hidden';   // (its fades are alpha in the renderer's present, never CSS opacity)
  };
  let vcWhy = null, vcPass = 0, vcEasing = 0;
  // (2 Nov 2026, Mohammad's iPhone: "fix the backgrounds", the teaching card a flat solid slab at rest. vcEasing counted the canvas's
  // transitions and animations by their start and end events; one start without its end (Safari sends none for a transition replaced
  // or dropped as its element changes, an animation that loops) left it above 0 for good, and every card's glass flat until a reload.
  // Read again between frames, it is now taken from the canvas's own running animations, and a start is looked at again a little after
  // its longest ease would have ended.)
  function readVcLook() { vcPass = 0; vcWhy = vcLook(); vcEasing = vCanvas.getAnimations?.().filter((a) => a.playState === 'running').length ?? vcEasing; frostWake?.(); }
  function vcStale() { if (!vcPass) vcPass = restPass(readVcLook); }
  {
    const vcMo = new MutationObserver(vcStale);
    for (let e = vCanvas; e && e.nodeType === 1; e = e.parentElement) vcMo.observe(e, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-theme', 'data-palette'] });
    const vcIn = (ev) => { if (ev.target === vCanvas) { vcEasing++; setTimeout(vcStale, 1600); } };
    const vcOut = (ev) => { if (ev.target === vCanvas) { vcEasing = Math.max(0, vcEasing - 1); vcStale(); } };
    vCanvas.addEventListener('transitionrun', vcIn); vCanvas.addEventListener('animationstart', vcIn);
    for (const t of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) vCanvas.addEventListener(t, vcOut);
    vcWhy = vcLook();
  }
  // (frostWhy: '' while the figure's canvas takes glass, else the first thing that stops it, in words for the ?perf blur gauge.)
  // (cards: the cards' glass stays drawn through a resolution's fade, never let go: the picture kept for the fade has the
  // cards' glass in it where it stands, and the glass drawn over the fade covers it (inside its box the glass is opaque), its blur taken
  // from the new picture (each glass's blur is taken before the fade is laid over it: veins-gl tops, every prep before any draw). Before, every card went flat for the fade's 420 ms, which with Figure resolution on Auto
  // is every zoom's settle (review/ui-gpu-review-opus-2nov.md: "the card visibly switches from frosted to flat and back").)
  const frostWhy = (cards = false) => {
    if (live.frostHold && !cards) return 'a change of canvas is under way';
    if (!live.veins?.top) return 'the figure has no canvas to draw into';
    // (In the liver the glass is drawn into the lobule's or the open sinusoid's own GPU canvas (lobule-zoom.js glassHost), never let go
    // to a flat card: Mohammad, 2 Nov 2026, Circulation 6 on the iPhone, "No blur at all on top, solid card on bottom".)
    if (wrap.classList.contains('in-lobule')) {
      const src = live.lz?.glassHost?.() || null;
      if (src) {
        if (live.frostCtx !== src.gl) { rehostSoon(); return 'the glass is moving to the liver\'s canvas'; }
        return '';
      }
      if (!lzShares()) return 'the lobule is moving';   // (drawn in its own canvas, which has none to give for now; in the figure's context the glass goes on there)
    }
    if (live.frostLiver || live.frostCtx !== live.veins.top.gl) { rehostSoon(); return 'the glass is moving back to the figure\'s canvas'; }
    if (live.veins.lost) return 'the GPU context is lost';
    if (live.diveT > 0 && !lzShares()) return 'the dive is under way';   // (the lobule drawn in the figure's own context: the dive is a pass of its present, the glass stays frosted)
    const wc = wrap.classList;
    if (!wc.contains('gl-on')) return 'the GPU figure is not showing';
    if (wc.contains('unframed')) return 'the figure is unframed';
    if (vcWhy == null) { vcStale(); return 'the figure\'s canvas is being read'; }
    return vcWhy;
  };
  const frostOn = () => !frostWhy();
  const frostHost = (o, src = null) => (src
    ? { gl: src.gl, canvas: src.canvas, add: src.add, warmIn: src.warmIn, now: src.now, active: frostOn, why: frostWhy, view: () => null, ...o }
    : { gl: live.veins.top.gl, canvas: live.veins.top.canvas, add: live.veins.top.add, warmIn: live.veins.top.warmIn, now: () => { if (live.veins && !live.veins.lost) live.veins.present(true, true); }, active: frostOn, why: frostWhy, view: () => live.veins?.viewKey ?? null, ...o });
  // (Every glass moved together to the canvas the frost is taken from now: the liver's (lobule-zoom.js glassHost) while it shows, else
  // the figure's. Between frames, never inside the glass's own frame, which asked.)
  let rehostT = 0;
  function rehostSoon() {
    if (rehostT) return;
    rehostT = setTimeout(() => {
      rehostT = 0;
      if (!live.veins?.top) return;
      const src = wrap.classList.contains('in-lobule') ? live.lz?.glassHost?.() || null : null;
      if (wrap.classList.contains('in-lobule') && !src) return;
      if (src ? live.frostCtx === src.gl : live.frostCtx === live.veins.top.gl && !live.frostLiver) return;
      live.frostLiver = src;
      live.frostCtx = src ? src.gl : live.veins.top.gl;
      for (const [g, o] of frostHosts) g.setHost(frostHost(o, src));
      frostWake();
    }, 0);
  }
  // The ?perf blur gauge's question: why the browser's blur, not a glass drawn in the figure's canvas, shows on `el` (null: no glass
  // here is meant to own it, as the toast or the fold chip; '' : its glass is drawn, a mark is about to be set).
  const blurWhy = (el) => { for (const g of [live.glassGL, live.paneGL, ...cardGLs]) { const w = g?.why?.(el); if (w != null) return w; } return null; };
  // Where the glass drawn for `el` stands now ({ left, top, width, height }), for a check that compares it with the card (null: none is drawn for it).
  const glassBox = (el) => { for (const g of [live.glassGL, live.paneGL, ...cardGLs]) { const b = g?.boxOf?.(el); if (b) return b; } return null; };
  // (Each glass and what it was set with: set again on a new renderer, after a lost context is restored.)
  const frostHosts = new Map();
  // (On since 1 Nov 2026 (Mohammad: "Move to GPU"). It had been off since
  // 759be3e1: on an iPhone the glass flickered as it went between the figure's canvas and the browser's blur and back, at the screen's
  // edge as the sheet untucked and wherever a label crossed it. Now a glass is clipped by the screen, never sent back at its edge; the
  // labels leave every glass drawn here out (sendHoles), so they never send one back; and what still does (an overlay the GPU does not
  // paint, a callout under a card) changes it only after it has rested 400 ms, never while anything moves (glass-gl.js hostDraw).)
  function hostFrost(g, o) { if (!g || !live.veins?.top) return; frostHosts.set(g, o); g.setHost(frostHost(o, live.frostLiver)); if (!live.frostLiver) live.frostCtx = live.veins.top.gl; }
  // (What the page lays between the figure's canvas and a glass, as client boxes. 'pane': the overlays the GPU does not paint (#stageOver's
  // SVG). 'low' (the teaching card's shade, z-index 1, over the whole stage view): those, the liver pane when the browser blurs it, the
  // labels and marks (their GPU canvas's boxes, or the SVG's own). 'callouts' (z-index 4): those, the shade (its tabs and words), and the
  // credit when it lies under them (outside Present). 'cards' (the Present cards, over everything in the stage view): 'low', and the
  // callouts.)
  const visible = (el) => {
    if (!el?.isConnected || el.hidden) return false;
    const c = getComputedStyle(el);
    return c.display !== 'none' && c.visibility === 'visible' && +c.opacity > 0.001;
  };
  // (What lies between, kept (1 Nov 2026, "Move everything to GPU"): read again only when something there may have moved: a write in the
  // overlays, the labels, the liver pane, the catheter's or the sites' labels or the stage's own class or style, a teaching card's shade
  // written or animating, a new labels picture (labelGL.boxes), the camera (viewKey), a resize, or any CSS transition or animation on the
  // page and for 0.6 s after it. A frame that only moves the blood reads no box.)
  let frostDirty = 0, frostMo = null;
  const frostSeen = new WeakSet(), frostKept = new Map();
  // (2 Nov 2026: a transition or animation anywhere in the page no longer keeps the cache off for 0.6 s, nor is getAnimations() asked
  // on every call. Only the elements read below are listened to, with capture so their children count too; a start, end or cancel marks
  // the cache dirty, and the next frostOver call reads once and keeps the answer again.)
  // (Each part between keeps its own count, so a part that moved reads alone: the catheter's labels following a glide read
  // themselves, not the overlays, the labels picture and the shade too. The overlays' group following the camera (worldOver's
  // transform, every frame of a glide) reads nothing: their boxes, read once, are carried by the figure's transform (frostCarry).)
  const frostPart = { over: 0, pane: 0, labels: 0, shade: 0, marks: 0 };
  const frostAll = () => { for (const k in frostPart) frostPart[k]++; };
  const frostPartOf = (t) => (!t?.nodeType ? '' : live.svgOver?.contains(t) ? 'over' : glass?.contains(t) ? 'pane' : labelSvg?.contains(t) ? 'labels'
    : cath.labels?.contains(t) || sites.el?.contains(t) ? 'marks' : t.closest?.('.pz-shade, .stage-credit') ? 'shade' : '');
  const frostTouch = (e) => { frostDirty++; const p = frostPartOf(e?.target); if (p) frostPart[p]++; else frostAll(); };
  function frostRecords(list) {
    frostDirty++;
    for (const m of list) {
      if (m.target === live.worldOver && m.type === 'attributes' && m.attributeName === 'transform') continue;
      const p = frostPartOf(m.target);
      if (p) frostPart[p]++; else frostAll();
    }
  }
  const FROST_EVS = ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'];
  const frostListen = (el) => { for (const t of FROST_EVS) el.addEventListener(t, frostTouch, true); };
  const FROST_OBS_ALL = { attributes: true, childList: true, subtree: true, characterData: true }, FROST_OBS_ATTR = { attributes: true }, FROST_EL = [null, null, null, null, null];
  const frostSee = (el) => { if (el && !frostSeen.has(el)) { frostSeen.add(el); frostMo.observe(el, FROST_OBS_ATTR); frostListen(el); frostTouch(); } };
  function frostWatch() {
    if (!frostMo) {
      frostMo = new MutationObserver(frostRecords);
      FROST_EL[0] = live.svgOver; FROST_EL[1] = labelSvg; FROST_EL[2] = glass; FROST_EL[3] = cath.labels; FROST_EL[4] = sites.el;
      for (let i = 0; i < 5; i++) if (FROST_EL[i]) frostMo.observe(FROST_EL[i], FROST_OBS_ALL);
      frostMo.observe(wrap, FROST_OBS_ATTR);
      frostMo.observe(document.documentElement, FROST_OBS_ATTR);
      addEventListener('resize', frostTouch);
      for (let i = 0; i < 5; i++) if (FROST_EL[i]) frostListen(FROST_EL[i]);
      for (let i = 0; i < 5; i++) FROST_EL[i] = null;
    }
    const shades = document.getElementsByClassName('pz-shade');
    for (let i = 0; i < shades.length; i++) frostSee(shades[i]);
    frostSee(document.querySelector('.stage-credit'));
  }
  function frostOver(level) {
    frostWatch();
    // (Kept with the parts it was read for, compared one by one: no key text is built on an ask that finds the same answer.)
    const vk = live.veins?.viewKey ?? '', lost = !!live.labelGL?.lost, pres = !!appEl?.classList.contains('presenting'), boxes = live.labelGL?.boxes ?? null;
    let k = frostKept.get(level);
    if (k && k.dirty === frostDirty && k.vk === vk && k.lost === lost && k.pres === pres && k.boxes === boxes) return k.out;
    const out = frostOverRead(level);
    if (!k) frostKept.set(level, (k = { dirty: 0, vk: '', lost: false, pres: false, boxes: null, out }));
    k.dirty = frostDirty; k.vk = vk; k.lost = lost; k.pres = pres; k.boxes = boxes; k.out = out;
    return out;
  }
  // (One part's boxes, kept while its count, the mode and the labels' picture stand.)
  const frostParts = new Map();
  function frostPartRead(p, read) {   // (read(o) fills o, the part's own kept list, which only the caller's next copy reads: it is never handed on)
    const n = frostPart[p], pres = !!appEl?.classList.contains('presenting'), lost = !!live.labelGL?.lost, tr = p === 'over' ? svg.style.transform : '';
    const k = frostParts.get(p), boxes = live.labelGL?.boxes ?? null;
    if (k && k.n === n && k.pres === pres && k.lost === lost && k.tr === tr && k.boxes === boxes) return k;
    if (p === 'over' && !live.CTM) refreshCTM();
    const v = k || { n: 0, pres: false, lost: false, tr: '', boxes: null, ctm: null, out: [] };
    v.n = n; v.pres = pres; v.lost = lost; v.tr = tr; v.boxes = boxes; v.ctm = p === 'over' ? live.CTM : null; v.out.length = 0; read(v.out);
    frostParts.set(p, v);
    return v;
  }
  // (Boxes read at one view of the figure, where they are at another: each box's corners through the change of transform, and the box
  // that holds them. By arithmetic, no read.)
  // (The change of transform sits in one kept array; a box's four corners go through it one by one, and the box that holds them is the answer.)
  const CARRY_M = [1, 0, 0, 1, 0, 0];
  function carryRect(r) {
    const m = CARRY_M, l = r.left, t = r.top, rt = r.right, bt = r.bottom;
    const xa = m[0] * l + m[2] * t + m[4], xb = m[0] * rt + m[2] * t + m[4], xc = m[0] * l + m[2] * bt + m[4], xd = m[0] * rt + m[2] * bt + m[4];
    const ya = m[1] * l + m[3] * t + m[5], yb = m[1] * rt + m[3] * t + m[5], yc = m[1] * l + m[3] * bt + m[5], yd = m[1] * rt + m[3] * bt + m[5];
    return { left: Math.min(xa, xb, xc, xd), top: Math.min(ya, yb, yc, yd), right: Math.max(xa, xb, xc, xd), bottom: Math.max(ya, yb, yc, yd) };
  }
  function frostCarry(v, into) {   // (v's boxes carried to the figure's view now, pushed on `into`)
    if (!live.CTM) refreshCTM();
    const a = v.ctm, b = live.CTM;
    if (!a || !b || a === b || !v.out.length) return frostPush(into, v.out);
    const det = a.a * a.d - a.b * a.c;
    if (!det) return frostPush(into, v.out);
    const ia = a.d / det, ib = -a.b / det, ic = -a.c / det, id = a.a / det, ie = (a.c * a.f - a.d * a.e) / det, jf = (a.b * a.e - a.a * a.f) / det;
    CARRY_M[0] = b.a * ia + b.c * ib; CARRY_M[1] = b.b * ia + b.d * ib; CARRY_M[2] = b.a * ic + b.c * id; CARRY_M[3] = b.b * ic + b.d * id;
    CARRY_M[4] = b.a * ie + b.c * jf + b.e; CARRY_M[5] = b.b * ie + b.d * jf + b.f;
    for (let i = 0; i < v.out.length; i++) into.push(carryRect(v.out[i]));
    return into;
  }
  function frostPush(into, list) { for (let i = 0; i < list.length; i++) into.push(list[i]); return into; }
  function frostReadOver(o) {
    if (live.svgOver && !live.svgOver.classList.contains(OVER_ALL) && visible(live.svgOver)) {
      for (const u of overUnits(live.worldOver, gOver)) if (!u.classList.contains(OVER_CLASS) && visible(u)) o.push(u.getBoundingClientRect());
    }
  }
  function frostReadPane(o) { if (!glass.hidden && !live.paneGL?.hosted) o.push(glass.getBoundingClientRect()); }
  function frostReadLabels(o) {
    if (visible(labelSvg)) {
      if (live.labelGL && !live.labelGL.lost) {
        // (The labels the GPU draws are in the figure's canvas, under every glass: they never send a glass back to the browser's blur. Only
        // those the SVG still draws itself lie over it.)
        for (const el of live.labelGL.svgLeft()) o.push(el.getBoundingClientRect());
      } else for (const el of labelSvg.querySelectorAll('.lb, .leader, .leader-dot')) o.push(el.getBoundingClientRect());
    }
  }
  function frostReadShade(o) {
    const shades = document.getElementsByClassName('pz-shade');
    for (let i = 0; i < shades.length; i++) if (visible(shades[i])) o.push(shades[i].getBoundingClientRect());
    const cr = document.querySelector('.stage-credit');
    if (cr && !appEl?.classList.contains('presenting') && visible(cr)) o.push(cr.getBoundingClientRect());
  }
  function frostReadMarks(o) {
    for (const el of cath.labels.children) if (visible(el)) o.push(el.getBoundingClientRect());
    for (const el of sites.el.children) if (visible(el)) o.push(el.getBoundingClientRect());
  }
  function frostOverRead(level) {
    const out = [];
    frostCarry(frostPartRead('over', frostReadOver), out);
    if (level === 'pane') return out;
    frostPush(out, frostPartRead('pane', frostReadPane).out);
    frostPush(out, frostPartRead('labels', frostReadLabels).out);
    if (level === 'low') return out;
    if (level === 'callouts') return frostPush(out, frostPartRead('shade', frostReadShade).out);
    return frostPush(out, frostPartRead('marks', frostReadMarks).out);
  }
  return { blurWhy, frostHosts, frostOver, frostWhy, glassBox, hostFrost, visible };
}
