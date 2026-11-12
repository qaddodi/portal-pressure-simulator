// Settings › Glass (Mohammad, 12 Nov 2026: "let's add M1 and F4 as options ... anywhere where we're using glass effect, make this universal
// switch change between OFF -> Blur -> M1 -> F4"): one choice for every glass the GPU draws (cards, sheets, bars, pills, menus, callouts,
// the liver's pane, toasts).
//   off    the solid look (html[data-noglass], app.css): no glass drawn at all, as the Blur effect switch's off was;
//   blur   the frost as it was;
//   mesh   M1: each glass's four corners and its centre, each the figure averaged around it, blended smoothly across the glass;
//   field  F4: a cubic B-spline over the figure averaged in 72 px cells.
// The three live ones keep one tint and one saturation (glass-gl.js CARD): only how the figure under the glass is smoothed changes.
// Stored as pps.glassMode. The old switch's pps.noGlass ('1' off, '0' on) is kept in step, so the blur guard (blur-guard.js) reads it as before.

export const GLASS_MODES = ['off', 'blur', 'mesh', 'field'];

let live = 'blur';
/** How the glass the GPU draws smooths the figure under it now: 'blur', 'mesh' or 'field' (Off draws none: html[data-noglass]). */
export const glassMode = () => live;

/** The choice stored (get: a guarded storage read, main.js readLS), or null when none was made: pps.glassMode, else the old Blur effect switch. */
export function storedGlassMode(get) {
  const m = get('pps.glassMode');
  if (GLASS_MODES.includes(m)) return m;
  const n = get('pps.noGlass');
  return n === '1' ? 'off' : n === '0' ? 'blur' : null;
}

/** Sets the page's glass to `m`: the live filter, html[data-glass] (mesh, field) and html[data-noglass] (off). Returns whether Off came or went
 *  (the labels drawn on the GPU take the glass's look then: label-theme.js). */
export function setGlassMode(root, m) {
  if (!GLASS_MODES.includes(m)) m = 'blur';
  if (m !== 'off') live = m;
  if (m === 'mesh' || m === 'field') root.setAttribute('data-glass', m); else root.removeAttribute('data-glass');
  const was = root.hasAttribute('data-noglass'), off = m === 'off';
  if (off) root.setAttribute('data-noglass', ''); else root.removeAttribute('data-noglass');
  return was !== off;
}

/** The glass at load, before the first card or glass is drawn: the stored choice; none made is Off on a phone (Mohammad, 12 Nov 2026: "default on
 *  phone blur off"), Blur elsewhere. A person's choice, never marked data-noglass-auto. Returns the mode. */
export function glassAtLoad(root, { stored, phone }) {
  const m = GLASS_MODES.includes(stored) ? stored : phone ? 'off' : 'blur';
  // (Only ever sets: an html[data-noglass] already there (index.html's ?noglass=1) is kept.)
  if (m === 'off') root.setAttribute('data-noglass', '');
  else { live = m; if (m !== 'blur') root.setAttribute('data-glass', m); }
  return m;
}

/** A pick in Settings, stored (set: a storage write, inside the caller's try): pps.glassMode, and pps.noGlass kept in step for the blur guard. */
export function storeGlassMode(set, m) {
  set('pps.glassMode', m);
  set('pps.noGlass', m === 'off' ? '1' : '0');
}
