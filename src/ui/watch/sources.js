// What the ?watch recorder reads from the page: the numbers the app already keeps, never a layout box in a frame (AGENTS.md).
//   camera   stage.cameraState()                       the view as the camera has it (zoom, x, y)
//   labels   stage.labelDrawnBy()                      each GPU label's last picture (key, x, y, w, h, alpha), client px; stageBox() is the kept snapshot
//            stage.labelNodeOf(id)                     the station's own point: the anchor of an 'n:<id>' label (the kept snapshot, no read)
//   cards    a glass region's drawn()                  what the glass drew last frame: each card's box and alpha (the glass's own clock: glass-clock.js)
//   traces   stage.cameraTraces()                      the slide camera's runs, frame by frame (slide-cam.js)
// Numbers: a MutationObserver notes the leaves of the cards whose text changed; their widths are read once, at rest (a rest pass), where the app
// reads layout (rest-pass.js, layout-snap.js).
import { readBox } from '../layout-snap.js';

const NUM_ROOTS = '.pz-text, .pz-data, .pz-panel, .pz-case.on, #readouts, .readouts, .tile, .pz-tile';

/** The name a glass pane goes by in the history: its first pz-/card class (or its tag), numbered when two share it. */
export function paneName(el, seen) {
  const cls = el && el.classList ? [...el.classList].find((c) => /^(pz-|card|sheet|menu|toast|pop)/.test(c)) : null;
  const base = cls || (el && el.dataset && el.dataset.ghost) || (el && el.tagName ? el.tagName.toLowerCase() : 'pane');
  const n = (seen.get(base) || 0) + 1; seen.set(base, n);
  return n > 1 ? `${base}#${n}` : base;
}

/** The sources the recorder reads, from the app's window.pps (stage) and the stage's glass. */
export function pageSources(pps, doc = document) {
  const stage = pps && pps.stage;
  const bad = new Set();   // (station ids with no point: asked no more)
  let region = null;
  try { region = stage && stage.glass ? stage.glass.add(() => [], {}) : null; } catch { region = null; }
  const anchorOf = (key) => {
    if (!key.startsWith('n:')) return null;
    const id = key.slice(2);
    if (bad.has(id)) return null;
    try { const a = stage.labelNodeOf(id); if (a && Number.isFinite(a.x)) return a; } catch { /* no point for it */ }
    bad.add(id); return null;
  };
  return {
    cam: () => { const c = stage && stage.cameraState && stage.cameraState(); return c ? [c.k, c.x, c.y] : null; },
    labels: () => {
      const d = stage && stage.labelDrawnBy && stage.labelDrawnBy();
      if (!d) return null;
      return d.map((l) => { const a = anchorOf(l.key); return a ? [l.key, l.x, l.y, l.w, l.h, l.a, a.x, a.y] : [l.key, l.x, l.y, l.w, l.h, l.a]; });
    },
    cards: () => {
      const d = region && region.drawn && region.drawn();
      if (!d) return null;
      const seen = new Map();
      return d.panes.map((p) => [paneName(p.el, seen), p.x, p.y, p.w, p.h, p.a]);
    },
    traces: () => (stage && stage.cameraTraces ? stage.cameraTraces() : null),
    vb: () => { const t = stage && stage.cameraTraces ? stage.cameraTraces() : null; return t && t.length ? t[t.length - 1].vb || null : null; },
    release: () => { try { region && region.remove && region.remove(); } catch { /* gone already */ } },
  };
}

/**
 * Events: a view change (pps:view), a hand on the screen (a pointer, wheel or touch: it ends the camera judgement of a move it began in),
 * and a number in a card that changed (its width before and after). Returns the stop.
 */
export function watchEvents(rec, { win = window, doc = document, rest, viewName = () => '' } = {}) {
  const off = [];
  const on = (t, n, f, o) => { t.addEventListener(n, f, o); off.push(() => t.removeEventListener(n, f, o)); };
  on(win, 'pps:view', () => rec.event('view', { to: viewName() }));
  for (const n of ['pointerdown', 'wheel', 'touchstart']) on(doc, n, () => rec.event('hand'), { capture: true, passive: true });
  // numbers
  const last = new WeakMap(), ids = new WeakMap();
  let n = 0, pending = new Set(), asked = false, mo = null;
  const idOf = (e) => { let v = ids.get(e); if (!v) { v = `#${++n}`; ids.set(e, v); } return v; };
  const leaf = (e) => { const t = e && e.nodeType === 3 ? e.parentElement : e; return t && t.nodeType === 1 && !t.childElementCount && t.closest && t.closest(NUM_ROOTS) ? t : null; };
  const measure = () => {
    asked = false;
    const list = [...pending]; pending = new Set();
    for (const e of list) {
      if (!e.isConnected) continue;
      const text = e.textContent.trim();
      if (!text || text.length > 24 || !/\d/.test(text)) { last.delete(e); continue; }
      const root = e.closest(NUM_ROOTS), b = readBox(e), rb = root ? readBox(root) : null;
      if (!b || !(b.width >= 1)) continue;
      const cur = { text, w: Math.round(b.width * 100) / 100, cw: rb ? Math.round(rb.width * 10) / 10 : 0 };
      const p = last.get(e);
      last.set(e, cur);
      if (p && p.text !== text) rec.event('num', { id: idOf(e), text, w: cur.w, cw: cur.cw, pt: p.text, pw: p.w, pcw: p.cw });
    }
  };
  const ask = (e) => { if (!e) return; pending.add(e); if (!asked) { asked = true; rest(measure); } };
  try {
    mo = new MutationObserver((recs) => { for (const r of recs) ask(leaf(r.target)); });
    mo.observe(doc.body || doc.documentElement, { subtree: true, characterData: true, childList: true });
    // (the numbers as they stand now: what a later change is compared with)
    rest(() => { for (const e of doc.querySelectorAll(NUM_ROOTS)) for (const l of e.querySelectorAll('*')) if (!l.childElementCount) pending.add(l); measureSeed(); });
  } catch { /* no observer: no number events */ }
  function measureSeed() {
    const list = [...pending]; pending = new Set();
    for (const e of list) {
      const text = e.textContent.trim();
      if (!text || text.length > 24 || !/\d/.test(text) || !e.isConnected) continue;
      const root = e.closest(NUM_ROOTS), b = readBox(e), rb = root ? readBox(root) : null;
      if (b && b.width >= 1) last.set(e, { text, w: Math.round(b.width * 100) / 100, cw: rb ? Math.round(rb.width * 10) / 10 : 0 });
    }
  }
  return () => { for (const f of off) f(); if (mo) mo.disconnect(); };
}
