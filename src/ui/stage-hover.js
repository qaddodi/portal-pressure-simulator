// Hover and pick: the interaction section (pointer reads, hover link, label explain) and the shunts card.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, SHUNT_PORTAL, SHUNT_SYSTEMIC, customShuntId } from '../engine/topology.js';
import { ABDOMEN_CLIP, BACK_EDGES, CONTEXT_EDGES, IVC_EDGES, LIVER_SPLIT_X, ORGANS } from './anatomy.js';
import { classSoon } from './class-soon.js';
import { HOVER_LINK, labelTarget, labelsOf } from './hover-link.js';
import { hitLabel } from './label-explain.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { flattenPath } from './shape-gl.js';
import { store, updateParams } from './store.js';
import { putText, s, toast } from './util.js';
import { createVesselPick } from './vessel-pick.js';

export function createHover(st, live) {
  const { E, EI, EV, GL_ROWS, MQ, SEL_FADE, TIER_ART, TIER_LIFT, TIER_LIFT_FRONT, ascitesLine, ascitesPath, ascitesSvg, clientToWorldFast, defs, easeInOut, explain, gGuides, gLeaders, gSelO, geo, glLines, labelGL, late, lateRun, levelTier, nearbyEdge, nextFrame, nodePos, olSet, onHoverInfo, onSelect, orgTone, organEls, organG, pointAt, polyD, pool, readFrame, refreshCTM, setGlowSrc, spot, spotOn, stageBox, svg, syncPlateLook, updateLabels, vh, wrap } = st;
  function edgeFromEvent(ev) {
    // A pointer is picked on the vessels' data (hitVessel), never by the browser's hit test; an event with no point (a key on the
    // figure) names the vessel the keyboard is on (figKeys).
    if (ev.clientX != null) return live.lobuleOn ? null : hitVessel(ev.clientX, ev.clientY, 0);
    return ev.target === svg && live.figKeys.cur && !live.figKeys.cur.startsWith('organ:') ? live.figKeys.cur : null;
  }
  // Vessel picking on the vessels' own data (vessel-pick.js; plan "Holding 120 Hz" §3.5, and 2 Nov 2026 "everything on GPU"): each
  // vessel's drawn course, its strands' and its drawn trunks', tested as a stroke of its hit width with round caps, in world units
  // through the camera's matrix (CTM), never through an element (no path text parsed, no style or ancestor read). The rules are the
  // ones its hit stroke had: the width x.hitW (else 8 in the context and back layers, else 20), 12 for a strand or a trunk; none for a
  // vessel not shown (x.vis) or the liver's own small vessels in the anatomy (x.noHit); a strand only while it is live, strands and
  // trunks only in the anatomy. On a stroke, the one the GPU draws on top wins (its tier, then its row); near one, the nearest within
  // slop CSS px past its edge (nearbyEdge).
  const pickTier = (x) => (x.lifted && !x.back ? (x.front ? TIER_LIFT_FRONT : TIER_LIFT) : x.isArt ? TIER_ART : levelTier(x));
  const vesselPick = createVesselPick((visit) => {
    const anat = live.morph < 0.5;
    for (const x of EV) {
      if (!x.vis || x.noHit) continue;
      const id = x.e.id, rank = pickTier(x) * GL_ROWS + x.row;
      const narrow = CONTEXT_EDGES.has(id) || BACK_EDGES.has(id);
      visit(id, rank, (x.hitW || (narrow ? 8 : 20)) / 2, geo[id]?.cur);
      if (!anat) continue;
      if (x.strands) for (const sd of x.strands) if ((sd.live ?? 1) >= 0.5) visit(id, rank, 6, sd.cur);
      if (x.feeders) for (const fd of x.feeders) if (!fd.fan) visit(id, rank, 6, fd.cur);
    }
  });
  let shapesMemo = null;
  function vesselShapes() {
    const ver = live.pickVer + '|' + live.edgeRev;
    if (shapesMemo?.ver === ver) return shapesMemo;
    const list = [], anat = live.morph < 0.5;
    const add = (id, w, P, main) => {
      if (!P?.length) return;
      const pts = new Float32Array(P.length * 2);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < P.length; i++) {
        const x = P[i][0], y = P[i][1];
        pts[2 * i] = x; pts[2 * i + 1] = y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      list.push({ id, w, main, path: { polys: [{ pts, closed: false }] }, box: [x0, y0, x1, y1] });
    };
    for (const x of EV) {
      if (!x.vis) continue;
      const id = x.e.id, narrow = CONTEXT_EDGES.has(id) || BACK_EDGES.has(id);
      add(id, x.hitW || (narrow ? 8 : 20), geo[id]?.cur, true);
      if (!anat) continue;
      if (x.strands) for (const sd of x.strands) if ((sd.live ?? 1) >= 0.5) add(id, 12, sd.cur, false);
      if (x.feeders) for (const fd of x.feeders) if (!fd.fan) add(id, 12, fd.cur, false);
    }
    return (shapesMemo = { ver, list });
  }
  function hitVessel(cx, cy, slop) {
    if (!live.CTM) refreshCTM();
    const C = live.CTM, det = C.a * C.d - C.b * C.c;
    if (!det) return null;
    // (The client point in world units: the camera's matrix, undone.)
    const qx = cx - C.e, qy = cy - C.f;
    return vesselPick.pick((C.d * qx - C.c * qy) / det, (-C.b * qx + C.a * qy) / det, Math.sqrt(Math.abs(det)), slop);
  }
  // Organs under a point (anatomy only). The varices and fundus are small sites. The abdomen is
  // only the visible fluid itself, so the bowel and its vessels never open the ascites view by accident.
  const ORGAN_OF = { liver: 'liver', heart: 'heart', 'heart-ra': 'heart', spleen: 'spleen', stomach: null, esophagus: null, bowel: null, colon: null, appendix: null, duodenum: null, 'kidney-l': null };
  // (2 Nov 2026: tested in script against the outline's own numbers (nonzero fill, or within half the stroke), not by the browser's
  // isPointInFill/isPointInStroke, which laid the page out in the pointer's move. A band's stroke width is read between frames, once.)
  const ptPolys = new Map(), ptSW = new WeakMap(), ptSWWant = new Set();
  let ptSWAsk = 0;
  function ptSWRead() { ptSWAsk = 0; for (const el of ptSWWant) ptSW.set(el, parseFloat(getComputedStyle(el).strokeWidth) || 0); ptSWWant.clear(); }
  const polysOf = (d) => {
    let p = ptPolys.get(d);
    if (!p) { p = flattenPath(d, 0.25); if (ptPolys.size > 64) ptPolys.clear(); ptPolys.set(d, p); }
    return p;
  };
  const ptIn = (el, x, y, stroke) => {
    if (!el) return false;
    const d = el.getAttribute('d');
    if (!d) return false;
    const polys = polysOf(d);
    if (stroke) {
      const sw = ptSW.get(el);
      if (sw == null) { ptSWWant.add(el); if (!ptSWAsk) ptSWAsk = restPass(ptSWRead); return false; }
      const r2 = (sw / 2) ** 2;
      for (const { pts, closed } of polys) {
        const n = pts.length / 2;
        for (let k = 0; k < (closed ? n : n - 1); k++) {
          const ax = pts[2 * k], ay = pts[2 * k + 1], j = ((k + 1) % n) * 2, bx = pts[j], by = pts[j + 1];
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
          const ex = ax + t * dx - x, ey = ay + t * dy - y;
          if (ex * ex + ey * ey <= r2) return true;
        }
      }
      return false;
    }
    let wn = 0;
    for (const { pts } of polys) {
      const n = pts.length / 2;
      for (let k = 0; k < n; k++) {
        const ax = pts[2 * k], ay = pts[2 * k + 1], j = ((k + 1) % n) * 2, bx = pts[j], by = pts[j + 1];
        const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
        if (ay <= y) { if (by > y && side > 0) wn++; } else if (by <= y && side < 0) wn--;
      }
    }
    return wn !== 0;
  };
  function organAt(wx, wy) {
    if (live.morph > 0.5) return null;
    for (const o of [...ORGANS].reverse()) {
      if (o.deco || !ORGAN_OF[o.id]) continue;
      const el = organEls[o.id];
      if (o.band ? ptIn(el, wx, wy, true) : ptIn(el, wx, wy)) return ORGAN_OF[o.id];
    }
    if (live.fluidSurf && ptIn(abdomenEl, wx, wy) && wy > live.fluidSurf(wx)) return 'abdomen';
    return null;
  }
  const abdomenEl = s('path', { d: ABDOMEN_CLIP, fill: 'none', stroke: 'none' });
  defs.append(abdomenEl);
  // The IVC is one vessel to the eye: hovering any stretch of it lights all of it.
  // (vh.also: a reading label that names more than one run of a vessel lights them together, linkApply; a vessel hovered itself never has it.)
  const vhEdges = (id) => (IVC_EDGES.has(id) ? [...IVC_EDGES] : [id, ...(id === vh.id && vh.also || [])]).filter((e) => E[e]?.vis);
  function setHover(id, also = null) {
    if (id === live.hoverId && also === vh.also) return;
    live.hoverId = id;
    classSoon(wrap, 'over-vessel', !!id && !live.lobuleOn);   // (the pointer's cursor over a vessel: there is no hit element to carry it)
    const on = id && store.get().tool === 'select' && !live.shunt ? id : null;
    if (on === vh.id && also === vh.also) return;
    vh.id = on; vh.also = also;
    setGlowSrc('hover', on ? vhEdges(on).map((id) => ({ id, col: null, amt: 1.0, wide: 0.5, dur: 280 })) : []);
    if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
    if (HOVER_LINK) linkSync();   // (its reading lifts as it lights, lets go as it dims)
  }
  // (The sets a step works in are kept and cleared, not made anew in each step; vhAdd puts in them what vhEdges would list.)
  const vhWant = new Set(), vhOut = new Set(), vhLift = new Set();
  function vhAdd(set, id) {
    if (IVC_EDGES.has(id)) { for (const e of IVC_EDGES) if (E[e]?.vis) set.add(e); return; }
    if (E[id]?.vis) set.add(id);
    const also = id === vh.id && vh.also;
    if (also) for (const e of also) if (E[e]?.vis) set.add(e);
  }
  function vhStep(now) {
    const dt = Math.min(0.1, (now - vh.t) / 1000); vh.t = now;
    const want = vhWant; want.clear();
    if (vh.id) vhAdd(want, vh.id);
    for (const id of vh.sel) want.add(id);
    if (spotOn()) for (const id of spot.ids) want.add(id);   // (a slide's spotlit vessels brighten as a selected one: V2)
    for (const id of want) if (!vh.amt.has(id)) vh.amt.set(id, 0);
    let moving = false;
    for (const [id, v] of vh.amt) {
      const to = want.has(id) ? 1 : 0, nv = to > v ? Math.min(1, v + dt / 0.28) : Math.max(0, v - dt / 0.28);
      if (nv <= 0 && !to) vh.amt.delete(id); else vh.amt.set(id, nv);
      if (nv !== to) moving = true;
    }
    // (While a shunt is being made, its source and every vessel it can join stand out of the dimmed network too: NP3.)
    let out = vh.sel;
    if (live.shunt) {
      out = vhOut; out.clear();
      for (const id of vh.sel) if (E[id]?.vis) out.add(id);
      if (E[live.shunt.src]?.vis) out.add(live.shunt.src);
      for (const id of live.shunt.targets.keys()) if (E[id]?.vis) out.add(id);
    }
    // (A slide's spotlit vessels stand out the same way: deck visuals V2.)
    let lift = out;
    if (spotOn() && spot.ids.size) { lift = vhLift; lift.clear(); for (const id of out) lift.add(id); for (const id of spot.ids) lift.add(id); }
    for (const id of lift) if (!vh.selA.has(id)) vh.selA.set(id, 0);
    for (const [id, v] of vh.selA) {
      const to = lift.has(id) ? 1 : 0, k = reduceMotion.matches ? 1 : dt / SEL_FADE, nv = to > v ? Math.min(1, v + k) : Math.max(0, v - k);
      if (nv <= 0 && !to) vh.selA.delete(id); else vh.selA.set(id, nv);
      if (nv !== to) moving = true;
    }
    live.glowSync = true; live.stageWake();
    vh.raf = moving ? nextFrame(vhStep) : 0;
  }
  // Organ and site hover: a soft version of the selection outline, never kept once the pointer is away.
  const gHovO = s('g', { id: 'organHover', 'aria-hidden': 'true' });
  gSelO.after(gHovO);
  let hovO = '';
  function setOrganHover(o, lobe) {
    const key = o ? o + (lobe || '') : '';
    if (key === hovO) return;
    hovO = key;
    const byOrgan = o && { liver: 'liver', heart: 'heart', spleen: 'spleen' }[o];
    if (glLines) olSet('hov', byOrgan || null);
    // (Built between frames too, never in the frame the pointer moved in: 2 Nov 2026, "Move everything to GPU". The newest wins.)
    hovWant = [o, byOrgan];
    if (!hovAsk) hovAsk = restPass(() => { hovAsk = 0; lateRun('hover', organHoverNodes(...hovWant)); });
  }
  let hovWant = null, hovAsk = 0;
  // (The soft outline's nodes, built here and put in the page between frames: late('hover').)
  function organHoverNodes(o, byOrgan) {
    if (!o) return [];
    if (byOrgan) {
      if (glLines) return [];
      const d = organEls[byOrgan]?.getAttribute('d');
      if (!d) return [];
      const el = s('path', { class: 'org-hov-line', d, style: `stroke: rgb(${orgTone(byOrgan).map((x) => Math.round(x * 255))})` }), tr = organG[byOrgan].getAttribute('transform');
      if (tr) el.setAttribute('transform', tr);
      return [el];
    }
    if (o === 'abdomen') {   // the fluid itself, clipped as it is drawn, so it grows with the ascites
      ascitesSvg();
      const fd = ascitesPath.getAttribute('d');
      if (!fd) return [];
      return [s('g', { 'clip-path': 'url(#abdomenClip)' }, s('path', { class: 'org-hov-fluid', d: fd }), s('path', { class: 'org-hov-line', d: ascitesLine.getAttribute('d') || '' }))];
    }
    return [];
  }
  // Nothing stays lit once the pointer is gone, cancelled or lifted (a finger has no hover).
  function clearHover() { hoverEv = null; setHover(null); setOrganHover(null); onHoverInfo(null); if (live.linkPtr) { live.linkPtr = null; linkApply(); } }
  svg.addEventListener('pointerover', (ev) => {
    if (ev.pointerType === 'touch') return;
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null) {
      setHover(id);
      // The element under a still pointer can change (the figure redraws): show the readings then too, not only on a move.
      if (live.F && !live.shunt) { const r = wrap.getBoundingClientRect(); onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top }); }
    }
  });
  svg.addEventListener('pointerleave', clearHover);
  svg.addEventListener('pointercancel', clearHover);
  svg.addEventListener('pointerup', (ev) => { if (ev.pointerType === 'touch') clearHover(); });
  svg.addEventListener('touchend', clearHover, { passive: true });
  svg.addEventListener('touchcancel', clearHover, { passive: true });
  document.documentElement.addEventListener('mouseleave', clearHover);
  window.addEventListener('blur', clearHover);
  // Hover is hit-tested once per frame (a mouse reports up to 1000 moves a second), and not at all while the figure is
  // being dragged (the view moves under the pointer and nothing is lit then).
  let hoverEv = null, hoverRaf = 0;
  svg.addEventListener('pointermove', (ev) => {
    if (live.shunt) { shuntEv = ev; shuntAsk ||= readFrame(shuntRead); }
    if (ev.pointerType === 'touch') return;   // a finger has no hover (a long press peeks instead)
    if (live.drag?.type === 'pan' && live.drag.moved && !live.drag.peeked) { if (live.hoverId) setHover(null); hoverEv = null; return; }
    hoverEv = ev;
    // (Hit-tested first in the next frame, while the layout is still the last frame's (readFrame), and lit after (nextFrame).)
    hoverRaf ||= readFrame(hoverRead);
  });
  let nearHover = null;   // (hoverAt's last ring of hit tests: when, the view, where, and what it found)
  function hoverRead() {
    hoverRaf = 0;
    const e = hoverEv; hoverEv = null;
    if (!e || linkHeld()) return;
    const look = hoverLook(e);
    nextFrame(() => hoverAt(e, look));
  }
  // The hit tests alone: the vessel under the pointer, and the one near it (at most one ring every 50 ms, see below).
  function hoverLook(ev) {
    const id = edgeFromEvent(ev);
    let near = null;
    if (!(id && EI[id] != null && live.F && !live.shunt) && !live.shunt && !live.drag && !live.lobuleOn && store.get().tool === 'select') {
      const [wx, wy] = clientToWorldFast(ev.clientX, ev.clientY);
      if (organAt(wx, wy)) {
        const now = performance.now(), nh = nearHover;
        near = nh && now - nh.t < 50 && nh.v === live.viewVersion && Math.abs(nh.x - ev.clientX) + Math.abs(nh.y - ev.clientY) < 24 ? nh.id
          : (nearHover = { t: now, v: live.viewVersion, x: ev.clientX, y: ev.clientY, id: nearbyEdge(ev) }).id;
      }
    }
    return { id, near };
  }
  function hoverAt(ev, look) {
    if (linkHeld()) return;   // (the pointer is on a reading label: that vessel stays lit, whatever frame this move was kept for)
    const id = look.id;
    if (id && EI[id] != null && live.F && !live.shunt) {
      const r = stageBox();   // (the kept box: a hover each frame no longer lays out the figure just written)
      onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top });
      setHover(id); setOrganHover(null);
      return;
    }
    if (live.hoverId) setHover(null);   // the pointer is over no vessel any more (also after a captured drag)
    if (!live.drag) onHoverInfo(null);
    if (!live.shunt && !live.drag && !live.lobuleOn && store.get().tool === 'select') {
      const [wx, wy] = clientToWorldFast(ev.clientX, ev.clientY), o = organAt(wx, wy);   // (the kept transform, as a pan's: no layout)
      const sel = store.get().selection;
      // A click here would pick this vessel, so the organ must not light. (Up to 36 hit tests, each a layout and a hit test of the
      // figure: at most one ring every 50 ms while the mouse moves, near where it was and with the view unchanged; between, the last answer.)
      const near = o ? look.near : null;
      if (near && EI[near] != null && live.F) { setHover(near); setOrganHover(null); return; }
      if (o && !(sel?.type === 'organ' && sel.id === o)) setOrganHover(o, o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : '');
      else setOrganHover(null);
    } else setOrganHover(null);
  }
  // ── A reading and its vessel light together (hover-link.js; ?hoverlink=0 turns it off) ──
  // The reading label under the pointer (or with keyboard focus) lights what it names through setHover, so the glow is the very one the vessel
  // gets when it is hovered itself, and a hovered vessel lifts its reading: .hov-link on the label and its leader (app.css) takes the name to
  // full ink and the leader a step darker. Only for a pointer that hovers and never in a talk, whose slides set the lights. Nothing is lit
  // while the figure is dragged: the press on a label hands the pointer to the figure (capture), which ends the label's hover (clearHover).
  const linkOK = () => HOVER_LINK && MQ[3].matches && !store.get().presenting && store.get().tool === 'select' && !live.shunt;
  // Whether the pointer is still on the label it entered (a label that fades out or is laid out away from a still pointer may send no leave).
  function linkHeld() {
    if (!live.linkPtr) return false;
    const g = pool.get(live.linkPtr)?.g;
    if (g && g.style.display !== 'none' && !g.classList.contains('lb-off') && g.matches(':hover')) return true;
    live.linkPtr = null; linkApply();
    return false;
  }
  function linkHover(key, leaving) { if (key == null && live.linkPtr !== leaving) return; live.linkPtr = key; if (key) hoverEv = null; linkApply(); }
  function linkFocus(key, leaving) { if (key == null && live.linkKbd !== leaving) return; live.linkKbd = key; linkApply(); }
  function linkApply() {
    const key = linkOK() ? live.linkPtr || live.linkKbd : null, t = key ? labelTarget(key) : null;
    const edge = t?.edge && E[t.edge] ? t.edge : null, also = edge && t.also.length ? t.also : null, organ = t?.organ && live.morph <= 0.5 && !live.lobuleOn ? t.organ : null;
    if (edge !== live.linkEdge) { if (edge) setHover(edge, also); else if (live.linkEdge && live.hoverId === live.linkEdge) setHover(null); live.linkEdge = edge; }
    if (organ !== live.linkOrgan) { if (organ) setOrganHover(organ); else if (live.linkOrgan && hovO === live.linkOrgan) setOrganHover(null); live.linkOrgan = organ; }
    linkSync();
  }
  // The labels (and their leaders) that name the vessels lit by the pointer, and the label the pointer is on: lifted; the rest let go.
  function linkSync() {
    const key = linkOK() ? live.linkPtr || live.linkKbd : null, want = new Set(vh.id && linkOK() ? labelsOf(pool.keys(), new Set(vhEdges(vh.id))) : []);
    if (key) want.add(key);
    const lift = (k, on) => {
      const g = pool.get(k)?.g;
      if (g && g.classList.contains('hov-link') !== on) g.classList.toggle('hov-link', on);
      if (g || !on) for (const el of gLeaders.querySelectorAll(`[data-k="${k}"]`)) if (el.classList.contains('hov-link') !== on) el.classList.toggle('hov-link', on);
    };
    for (const k of live.linkLit) if (!want.has(k)) lift(k, false);
    for (const k of want) lift(k, true);
    live.linkLit = want;
  }
  // (A talk that opens, a tool that is picked and a shunt that starts take the link back; setHover brings the vessel's own lift and let-go.)
  if (HOVER_LINK) { store.on('presenting', linkApply); store.on('tool', linkApply); MQ[3].addEventListener?.('change', linkApply); }
  // ── Tap a label to explain it (N4, V-LIT-7; label-explain.js) ──
  // A tap in a talk is judged against what the GPU last drew (the labels' snapshot), never the page's boxes. The explained label's station lights as
  // a hovered one does (setHover), its label takes a line with the name and live readings (nodeItem), and the others step back (.spot-dim).
  // A second tap on it, the next slide, or the talk's end clears it.
  let explainEdge = null;
  function explainApply() {
    const key = explain.key, t = key ? labelTarget(key) : null;
    const edge = t?.edge && E[t.edge] ? t.edge : null;
    if (edge !== explainEdge) { if (edge) setHover(edge, t.also.length ? t.also : null); else if (explainEdge && live.hoverId === explainEdge) setHover(null); explainEdge = edge; }
    for (const [k, b] of pool) {
      const sv = explain.state(k);
      b.g.classList.toggle('spot-on', sv === 'on'); b.g.classList.toggle('spot-dim', sv === 'dim');
    }
    explainLeaders();
  }
  // (The leaders and dots: the explained label's own keep their ink, every other steps back. Run again whenever the leaders are painted.)
  function explainLeaders() {
    const key = explain.key;
    for (const el of gLeaders.children) {
      const k = el.getAttribute('data-k'), on = key && k === key, dim = !!key && !on;
      if (el.classList.contains('spot-dim') !== dim) el.classList.toggle('spot-dim', dim);
      if (el.classList.contains('spot-on') !== !!on) el.classList.toggle('spot-on', !!on);
    }
  }
  function explainChanged() {
    explainApply();
    nextFrame(() => { if (live.F) updateLabels(live.F, true); });   // (the label's new line, laid out in the next frame)
  }
  store.on('presenting', () => { if (!store.get().presenting) { explain.clear(); live.lz?.explainClear?.(); } });
  /** A tap at client (x, y): explains the station label under it, or clears when it is the one explained. True when a label took the tap. */
  function explainAt(x, y) {
    if (!store.get().presenting) return false;
    if (live.lobuleOn || live.lz?.isOpen()) return !!live.lz?.explainAt?.(x, y);
    const r = stageBox(), items = labelGL?.drawnLabels?.();   // (each label's last drawn picture, whatever frame drew it: a tap lands between frames)
    if (!items) return false;
    for (const it of items) { it.x += r.left; it.y += r.top; }
    const hit = hitLabel(items, x, y, 8, (k) => k.startsWith('n:') && labelTarget(k) != null);
    if (!hit) return false;
    explain.tap(hit.key);
    return true;
  }
  // ── Shunts: from a source vessel to a drop target ──
  // Any portal vein to any systemic vein. The shunt joins each vessel at its end nearer the
  // other; when that pair is exactly a named procedure's (TIPS is right portal →
  // right hepatic vein), it is that procedure, otherwise a custom shunt between those two veins.
  const NAMED_RULES = {
    'RPV>RHV': { key: 'tips', label: 'TIPS' },
    'PVH>IVCI': { key: 'dips', label: 'DIPS' },
    'RPV>IVCS': { key: 'dips', label: 'DIPS' },
    'CONF>IVCI': { key: 'portocaval', label: 'Portocaval shunt' },
    'SV>LRV': { key: 'dsrs', label: 'Distal splenorenal shunt' },
    'SVD>LRV': { key: 'dsrs', label: 'Distal splenorenal shunt' },
    'SMV>IVCI': { key: 'mesocaval', label: 'Mesocaval shunt' },
  };
  function shuntRule(a, b, ax, ay, bx, by) {
    const t = easeInOut(live.morph);
    const ends = (id, set, x, y) => [E[id].e.from, E[id].e.to].filter((n) => set.includes(n))
      .sort((m, n) => Math.hypot(nodePos(m, t)[0] - x, nodePos(m, t)[1] - y) - Math.hypot(nodePos(n, t)[0] - x, nodePos(n, t)[1] - y))[0];
    for (const [pe, px, py, se, sx, sy] of [[a, ax, ay, b, bx, by], [b, bx, by, a, ax, ay]]) {
      // Each vessel is joined at its end nearer the other vessel.
      const pn = ends(pe, SHUNT_PORTAL, sx, sy), sn = ends(se, SHUNT_SYSTEMIC, px, py);
      if (!pn || !sn) continue;
      if (NAMED_RULES[`${pn}>${sn}`]) return NAMED_RULES[`${pn}>${sn}`];
      const id = customShuntId(pn, sn);
      if (EI[id] != null) return { key: 'custom', id, label: EDGES[EI[id]].label };
    }
    return null;
  }
  function startShunt(src, { only } = {}) {
    if (!E[src]?.vis) return false;
    cancelShunt(true);
    const [wx, wy] = pointAt(geo[src].cur, 0.5);
    const targets = new Map();
    for (const x of EV) {
      if (!x.vis || x.isArt || x.e.id === src || x.e.kind === 'shunt' || x.e.kind === 'liver') continue;
      const [tx, ty] = pointAt(geo[x.e.id].cur, 0.5);
      const r = shuntRule(src, x.e.id, wx, wy, tx, ty);
      if (r && (!only || r.key === only)) { targets.set(x.e.id, r); x.shuntTarget = true; }
    }
    if (!targets.size) { toast('No vessel on the other side of the circulation to connect this one to.'); return false; }
    live.shunt = { src, wx, wy, targets, hover: null };
    E[src].shuntSrc = true;
    wrap.classList.add('shunting');
    setHover(null);
    // On the GPU figure the targets glow and stand out of the dimmed network, as the SVG's do (the hint says "a glowing
    // vein"; they had shown nothing until hovered, and nothing on touch; round 2 review, NP3).
    shuntGlow(null);
    if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
    syncPlateLook(); live.stageWake();
    store.set({ shunting: { src, only: only || null } });
    return true;
  }
  function cancelShunt(silent) {
    if (!live.shunt) return;
    for (const id of live.shunt.targets.keys()) if (E[id]) E[id].shuntTarget = false;
    if (E[live.shunt.src]) E[live.shunt.src].shuntSrc = false;
    live.shunt = null;
    gGuides.innerHTML = '';
    wrap.classList.remove('shunting');
    setGlowSrc('shunt', []);
    if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
    syncPlateLook(); live.stageWake();
    if (!silent) store.set({ shunting: null });
  }
  // The shunt's targets in the accent, the one under the pointer stronger and wider.
  function shuntGlow(on) {
    if (!live.shunt) return;
    setGlowSrc('shunt', [...live.shunt.targets.keys()].map((id) => ({ id, col: 'var(--accent)', amt: id === on ? 1.4 : 0.9, wide: id === on ? 0.9 : 0.6, dur: 300 })));
  }
  // (A drag's target is hit-tested first in the next frame, while the layout is the last frame's, and its guide drawn after.)
  let shuntEv = null, shuntAsk = 0;
  function shuntRead() {
    shuntAsk = 0;
    const ev = shuntEv; shuntEv = null;
    if (!ev || !live.shunt) return;
    const tgt = edgeFromEvent(ev);
    nextFrame(() => { if (live.shunt) shuntMove(ev, tgt); });
  }
  function shuntMove(ev, tgt) {
    const [wx, wy] = clientToWorldFast(ev.clientX, ev.clientY);   // (the kept transform: no layout read among the guide's writes)
    const ok = tgt && live.shunt.targets.has(tgt);
    if ((ok ? tgt : null) !== live.shunt.hover) shuntGlow(ok ? tgt : null);
    live.shunt.hover = ok ? tgt : null;
    // (The guide's three pieces are kept and only their attributes move; one not in the page yet goes in between frames: late('guide').)
    live.guideLine.setAttribute('class', 'stent-guide' + (tgt && !ok && tgt !== live.shunt.src ? ' invalid' : ''));
    live.guideLine.setAttribute('d', `M${live.shunt.wx} ${live.shunt.wy} L ${wx} ${wy}`);
    const need = [live.guideLine];
    if (ok) {
      live.guideGlow.setAttribute('d', geo[tgt]?.cur ? polyD(geo[tgt].cur) : ''); live.guideGlow.setAttribute('stroke-width', E[tgt].width + 16);
      const r = live.shunt.targets.get(tgt);
      // (Placed and sized in screen pixels, as the halos: in world units it was 3 to 8 px.)
      const k = live.CTM?.sc > 0 ? 1 / live.CTM.sc : 1;
      live.guideLab.setAttribute('x', wx + 14 * k); live.guideLab.setAttribute('y', wy - 10 * k); putText(live.guideLab, r.label);
      need.push(live.guideGlow, live.guideLab);
    } else { live.guideGlow.remove(); live.guideLab.remove(); }
    if (need.some((el) => el.parentNode !== gGuides)) late('guide', need);
  }
  function shuntDrop(ev) {
    const tgt = edgeFromEvent(ev);
    if (tgt && live.shunt.targets.has(tgt)) { shuntDropOn(tgt); return; }
    if (!tgt) { cancelShunt(); toast('Shunt canceled.'); }
  }
  function shuntDropOn(tgt) {
    const r = live.shunt?.targets.get(tgt);
    if (!r) return;
    cancelShunt();
    if (r.key === 'tips') updateParams({ tips: { on: true, d: store.get().params.tips.d || 8 } }, { label: 'TIPS' });
    else if (r.key === 'dips') updateParams({ dips: { on: true, d: store.get().params.dips.d || 8 } }, { label: 'DIPS' });
    else if (r.key === 'custom') updateParams((p) => { p.customShunts = { ...(p.customShunts || {}), [r.id]: 10 }; return p; }, { label: r.label });
    else updateParams({ [r.key]: true }, { label: r.label });
    toast(`${r.label} created.`);
    onSelect({ type: 'edge', id: r.key === 'tips' ? 'TIPS' : r.key === 'dips' ? 'DIPS' : r.key === 'custom' ? r.id : { portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC' }[r.key] });
  }
  return { abdomenEl, cancelShunt, edgeFromEvent, explainAt, explainChanged, gHovO, hitVessel, linkFocus, linkHeld, linkHover, linkSync, organAt, setOrganHover, shuntDrop, shuntDropOn, startShunt, vesselShapes, vhStep };
}
