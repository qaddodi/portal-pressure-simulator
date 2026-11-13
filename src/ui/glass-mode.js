// Settings › Blur effect (Mohammad, 12 Nov 2026, after trying Off, Blur, M1 and F4 on every glass: "No more real blur or mesh. Field or Off.
// default to field. Call it “Blur” still. And make it on off toggle default to on."): one switch for every glass the GPU draws (cards, sheets,
// bars, pills, menus, callouts, the liver's pane, toasts).
//   on   the field (his F4): a cubic B-spline over the figure averaged in 72 px cells (glass-gl.js SMOOTH), under the one glass's tint;
//   off  the solid look (html[data-noglass], app.css): no glass drawn at all.
// On by default on every device, phones too (the phone's Off default of earlier on 12 Nov is gone). A choice made is kept: stored as
// pps.glassMode, with the old switch's pps.noGlass ('1' off, '0' on) kept in step, so the blur guard (blur-guard.js) reads it as before.

export const GLASS_MODES = ['off', 'field'];

/** The choice stored (get: a guarded storage read, main.js readLS), or null when none was made: pps.glassMode (a mode of the four-way switch it
 *  replaced, Blur or Mesh, is on), else the old Blur effect switch's pps.noGlass. */
export function storedGlassMode(get) {
  const m = get('pps.glassMode');
  if (m === 'off') return 'off';
  if (m === 'field' || m === 'blur' || m === 'mesh') return 'field';
  const n = get('pps.noGlass');
  return n === '1' ? 'off' : n === '0' ? 'field' : null;
}

/** Sets the page's glass to `m` ('off', or on: 'field'): html[data-noglass] for Off. Returns whether Off came or went (the labels drawn on the
 *  GPU take the glass's look then: label-theme.js). */
export function setGlassMode(root, m) {
  const was = root.hasAttribute('data-noglass'), off = m === 'off';
  if (off) root.setAttribute('data-noglass', ''); else root.removeAttribute('data-noglass');
  return was !== off;
}

/** The glass at load, before the first card or glass is drawn: the stored choice, or on when none was made, on every device. A person's
 *  choice, never marked data-noglass-auto. Only ever sets: an html[data-noglass] already there (index.html's ?noglass=1) is kept. Returns the mode. */
export function glassAtLoad(root, { stored }) {
  const m = stored === 'off' ? 'off' : 'field';
  if (m === 'off') root.setAttribute('data-noglass', '');
  return m;
}

/** A turn of the switch, stored (set: a storage write, inside the caller's try): pps.glassMode, and pps.noGlass kept in step for the blur guard. */
export function storeGlassMode(set, m) {
  set('pps.glassMode', m === 'off' ? 'off' : 'field');
  set('pps.noGlass', m === 'off' ? '1' : '0');
}
