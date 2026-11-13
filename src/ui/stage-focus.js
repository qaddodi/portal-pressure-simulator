// The selection and focus marks: which organs the selection lights, the focus sets and their marks and colour.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, STENT_SPANS, isStent, stentGate } from '../engine/topology.js';
import { D_SURFACE } from './ease.js';
import { store } from './store.js';
import { s } from './util.js';

export function createFocus(st, live) {
  const { E, EI, ascitesLine, ascitesPath, ascitesSvg, gSelO, glLines, late, olGeom, olSet, orgTone, organEls, organG, setGlowSrc } = st;
  let selOKey = '', selLine = null, selFluid = null;
  function syncSelFluid() {
    if (!selFluid) return;
    ascitesSvg();   // (R05: brought up to date first, as every reader of the surface's SVG does)
    selFluid.fill.setAttribute('d', ascitesPath.getAttribute('d') || '');
    selFluid.line.setAttribute('d', ascitesLine.getAttribute('d') || '');
    selFluid.g.style.opacity = ascitesPath.getAttribute('d') ? live.fluidFade().toFixed(3) : '';   // (fades with the pool it outlines)
  }
  function syncSelLine() {
    if (glLines) olGeom();
    if (!selLine) return;
    const d = organEls[selLine.id].getAttribute('d'), tr = organG[selLine.id].getAttribute('transform');
    if (selLine.el.getAttribute('d') !== d) selLine.el.setAttribute('d', d);
    if (tr) selLine.el.setAttribute('transform', tr); else selLine.el.removeAttribute('transform');
  }
  // (The selection's outline and the fluid's are made once, ahead, and reused: a frame that selects an organ makes nothing (2 Nov 2026).)
  const SEL_LINE = s('path', { class: 'org-sel-line' });
  const SEL_FLUID = (() => { const fill = s('path', { class: 'org-sel-fluid' }), line = s('path', { class: 'org-sel-line' }); return { g: s('g', { 'clip-path': 'url(#abdomenClip)' }, fill, line), fill, line }; })();
  const SEL_ORGAN_IDS = { liver: ['liver'], heart: ['heart'], spleen: ['spleen'] };
  function updateOrganSel(sel, t) {
    const o = sel?.type === 'organ' && t < 0.5 ? sel.id : null;
    const key = o ? o + (sel.lobe || '') : '';
    if (key === selOKey) return;
    selOKey = key;
    for (const id in organG) organG[id].classList.remove('org-sel');
    const selKids = []; late('kids', gSelO, selKids); selLine = null; selFluid = null;
    const byOrgan = o && SEL_ORGAN_IDS[o];
    if (glLines) olSet('sel', byOrgan?.[0] || null);
    if (!o) return;
    if (byOrgan) {
      for (const id of byOrgan) organG[id]?.classList.add('org-sel');
      if (glLines) return;
      // The outline follows the organ as drawn now (a cirrhotic liver's reshaped contour, an
      // enlarged spleen), not its healthy outline.
      if (organEls[byOrgan[0]]?.getAttribute('d')) { selLine = { id: byOrgan[0], el: SEL_LINE }; SEL_LINE.setAttribute('style', `stroke: rgb(${orgTone(byOrgan[0]).map((x) => Math.round(x * 255))})`); syncSelLine(); selKids.push(selLine.el); }
      return;
    }
    if (o === 'abdomen') {   // the fluid as drawn; it follows the volume (see syncSelFluid)
      selFluid = SEL_FLUID;
      selKids.push(SEL_FLUID.g); syncSelFluid();
      return;
    }
    
  }
  // Where the figure asks the viewer to look (store.focus).
  // (The marks as parts, not a string: the ids, kinds and spans of the last glow set, compared in place; and the maps, lists and spans of
  // a call kept and written over, so a call that finds nothing changed makes nothing.)
  const focusSig = [], focusNow = [], focusIds = [], focusKind = new Map(), focusLo = new Map(), focusHi = new Map();
  let focusPresenting = null;
  const FOCUS_FULL = [0, 1];
  function focusMark(m) {
    const ed = m.edges;
    if (!ed) return;
    for (let i = 0; i < ed.length; i++) {
      const id = ed[i];
      if (!focusKind.has(id)) focusKind.set(id, m.kind || '');
      const sp = m.seg && isStent(EDGES[EI[id]]) ? STENT_SPANS[stentGate(m.seg, store.get().params, id)] : FOCUS_FULL;
      if (focusLo.has(id)) { focusLo.set(id, Math.min(focusLo.get(id), sp[0])); focusHi.set(id, Math.max(focusHi.get(id), sp[1])); }
      else { focusLo.set(id, sp[0]); focusHi.set(id, sp[1]); }
    }
  }
  // The glow (setGlowSrc): the accent; on a slide a block is the danger red, a treatment the accent, and a note
  // only a pointer (its vessel glows in its station's colour, the slide's glow).
  const focusCol = (k, presenting) => (!presenting || k === 'treat' ? 'var(--accent)' : k === 'note' ? null : 'var(--danger)');
  function updateFocus() {
    const foc = store.get().focus;
    // A presenter slide can hold several marks, each of a kind (block, treat, note), each in its colour.
    // (A mark's seg on a stent lights only that third of it; several marks on one stent light the stretch that spans them.)
    focusKind.clear(); focusLo.clear(); focusHi.clear();
    if (foc) { const marks = foc.marks; if (marks) for (let i = 0; i < marks.length; i++) focusMark(marks[i]); else focusMark(foc); }
    focusIds.length = 0;
    for (const id of focusKind.keys()) if (E[id]?.vis) focusIds.push(id);
    const presenting = !!store.get().presenting;
    const now = focusNow;
    now.length = 0;
    for (let i = 0; i < focusIds.length; i++) { const id = focusIds[i]; now.push(id, focusKind.get(id), focusLo.get(id), focusHi.get(id)); }
    let same = focusPresenting === presenting && now.length === focusSig.length;
    for (let i = 0; same && i < now.length; i++) if (now[i] !== focusSig[i]) same = false;
    if (same) return;
    focusPresenting = presenting;
    focusSig.length = 0;
    for (let i = 0; i < now.length; i++) focusSig.push(now[i]);
    setGlowSrc('focus', focusIds.filter((id) => focusCol(focusKind.get(id), presenting)).map((id) => ({ id, col: focusCol(focusKind.get(id), presenting), amt: 1, wide: 0.75, dur: D_SURFACE, span: focusHi.get(id) - focusLo.get(id) < 1 ? [focusLo.get(id), focusHi.get(id)] : null })));
  }
  return { syncSelFluid, syncSelLine, updateFocus, updateOrganSel };
}
