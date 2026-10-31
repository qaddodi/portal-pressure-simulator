// What the vessel renderer (veins-gl.js) reads from the page, as values (worker plan, step 2). The renderer must load and run in a
// worker, which has no document: the page's colour tokens and its `?` switches reach it through here. On the page the values are
// read from the document at the time they are asked for, as before; a worker is given them once with setFigureSettings.
//
// This module touches no browser global at load, so a worker can import it.

// A colour token as [r, g, b] in 0–255 (tokens are #rgb, #rrggbb, rgb() or rgba(); the alpha is dropped).
export function parseRGB(c) {
  c = (c || '').trim();
  if (c[0] === '#') { const x = c.length < 6 ? [...c.slice(1, 4)].map((d) => d + d).join('') : c.slice(1, 7); return [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16)); }
  const n = c.match(/[\d.]+/g) || [];
  return [+n[0] || 0, +n[1] || 0, +n[2] || 0];
}

let given = null;   // { tokens: { '--name': '#rrggbb' }, search: '?…' } once a worker has been given them

/** A worker's copy of what the page holds: the colour tokens the renderer reads and the page's query string. Sent whole, never as a diff. */
export function setFigureSettings(s) { given = s ? { tokens: { ...s.tokens }, search: String(s.search || '') } : null; }

/** The colour tokens the renderer reads, for the page to send. */
export const FIGURE_TOKENS = ['--bleed-spray', '--bleed-fresh', '--bleed-deep'];

/** A colour token as [r, g, b], from the page's styles, or from the settings a worker was given. */
export function figureRGB(name) {
  if (given) return parseRGB(given.tokens[name]);
  return parseRGB(getComputedStyle(document.documentElement).getPropertyValue(name));
}

/** The page's query string (location.search on the page, the one it sent in a worker). */
export const figureSearch = () => (given ? given.search : typeof location !== 'undefined' ? location.search : '');
