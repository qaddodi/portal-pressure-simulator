// The ?perf readout's backdrop-blur gauge (laptop-heat recs H2, 31 Oct 2026). A CSS backdrop-filter is a CABackdropLayer in Safari:
// macOS's WindowServer redraws it on every frame the content under it changes, which over the moving figure is every frame. The figure
// draws the glass of the callouts, the liver's pane and the Present cards itself (glass-gl.js), and a glass it draws takes the mark
// data-gl, whose CSS turns the browser's blur off. What this lists is what is left: every element (and ::before / ::after) that
// shows now with a computed backdrop-filter, and, where a glass owns it, the reason that glass gave the browser's blur back.
// Loaded only with ?perf (perf-readout.js); nothing here runs otherwise. Since 1 Nov 2026 no backdrop-filter is declared anywhere (app.css),
// so the list stays empty.

const PSEUDO = ['', '::before', '::after'];

// Blurs that no glass of the figure draws, and why (the reason a glass gives is asked first). The lobule's pills are on the browser's blur
// on purpose: with their frost drawn on the GPU they flickered with the blood on his Mac (31 Oct evening, 96b9eb1e; ?lzpills=1 puts it
// back), so they are not to be moved to the GPU frost without that flicker fixed.
const KEPT = [
  ['.lz-lab, .lz-zone, .sv-region', 'a lobule pill, on the browser\'s blur on purpose (its GPU frost flickered; ?lzpills=1 restores it)'],
  ['.sv-legend', 'the sinusoid legend, in the lobule view only'],
  ['.pz-fold', 'the Show / Hide chip in a folded card\'s header, 92 % opaque; no glass of the figure draws it'],
  ['.toast', 'a toast, there for a few seconds'],
  ['.pz-shade', 'the teaching card (the GPU glass, or solid; never the browser\'s blur since 1 Nov)'],
];
/** Why a blur no glass owns stays the browser's, or '' for one with no entry here. */
export function keptReason(el) {
  for (const [sel, why] of KEPT) if (el.matches?.(sel)) return why;
  return '';
}

/** A short name for an element: tag, id and up to three classes, with its pseudo-element after. */
export function nameOf(el, pseudo = '') {
  const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3) : [];
  return `${(el.tagName || '?').toLowerCase()}${el.id ? `#${el.id}` : ''}${cls.map((c) => `.${c}`).join('')}${pseudo}`;
}

/** The part of a box (left, top, width, height) that lies inside a window of w × h, in square px. */
export function visibleArea(r, w, h) {
  const x = Math.min(r.left + r.width, w) - Math.max(r.left, 0), y = Math.min(r.top + r.height, h) - Math.max(r.top, 0);
  return x > 0 && y > 0 ? x * y : 0;
}

/** How opaque the element is on screen: its own opacity times its parents' (a fade as a whole fades what is blurred under it too). */
function shownOpacity(el, win) {
  let o = 1;
  for (let e = el; e && e.nodeType === 1 && o > 0.001; e = e.parentElement) {
    const v = parseFloat(win.getComputedStyle(e).opacity);
    if (v < 1) o *= v;
  }
  return o;
}

/**
 * Every element showing a live backdrop blur: [{ name, area, share, why }], the largest first. `why(el)` is the glass's answer for an
 * element (stage.blurWhy): null when no glass is meant to draw it, '' when its glass is drawn and its mark is about to be set, else
 * the reason the browser's blur is the one showing. An element with no size, display: none, visibility: hidden or a shown opacity
 * near 0 draws nothing and is left out. A pseudo-element is measured by its element's box (its own is not reachable from script).
 */
export function scanBlurs(root = document, why = () => null, win = window) {
  const vw = win.innerWidth, vh = win.innerHeight, rows = [];
  for (const el of root.querySelectorAll('*')) {
    for (const ps of PSEUDO) {
      const cs = win.getComputedStyle(el, ps || null);
      const f = cs.backdropFilter || cs.webkitBackdropFilter;
      if (!f || f === 'none') continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (ps && cs.content === 'none') continue;
      const r = el.getBoundingClientRect?.();
      if (!r || !r.width || !r.height || !el.getClientRects?.().length) continue;
      if (shownOpacity(el, win) < 0.01) continue;
      const area = visibleArea(r, vw, vh);
      if (!area) continue;
      const w = why(el);
      rows.push({ name: nameOf(el, ps), area, share: area / (vw * vh), why: w, kept: w == null ? keptReason(el) : '' });
    }
  }
  return rows.sort((a, b) => b.area - a.area);
}

/** The scan as the lines of the report. `hosted`: how many elements wear the mark of a glass drawn in the canvas (data-gl). `limit`: lines listed. */
export function blurText(rows, hosted = 0, limit = 20) {
  const sum = rows.reduce((a, r) => a + r.share, 0);
  const head = `Backdrop blurs the browser draws now (CSS backdrop-filter, shown, ${rows.length ? `${rows.length}, together ${(sum * 100).toFixed(1)} % of the window` : 'none'}); glasses drawn in the figure's canvas instead: ${hosted}`;
  const lines = rows.slice(0, limit).map((r) => {
    const reason = r.why == null ? r.kept || 'no glass of the figure owns it' : r.why === '' ? 'its glass is drawn; the mark is about to be set' : r.why;
    return `  ${r.name} ${(r.share * 100).toFixed(1)} %: ${reason}`;
  });
  if (rows.length > limit) lines.push(`  and ${rows.length - limit} smaller`);
  return [head, ...lines].join('\n');
}
