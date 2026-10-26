// The live organs' grey without a filter: each fill, stroke and gradient stop of the organs takes its grey colour directly
// (stage.js organGrey). A filter over the organs made Safari draw every organ again on each frame of a change in any lens
// but Pressure (17 Oct). The grey mixes a colour toward its luma (organ-dim.js), a linear map of each colour that leaves its
// alpha alone, so greying every paint gives the same picture as greying their composite: over overlaps and translucency too.
import { LUMA } from './organ-dim.js?v=9e19f2fc30';

/** A computed colour ('rgb(…)', 'rgba(…)', 'color(srgb …)', 'transparent') as [r, g, b, a] in 0–1, or null. */
export function parseColor(s) {
  s = s.trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^rgba?\(\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)(?:\s*[,/]\s*([-\d.e]+)(%?))?\s*\)$/);
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : m[5] ? m[4] / 100 : +m[4]];
  m = s.match(/^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([-\d.e]+)(%?))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[5] ? m[4] / 100 : +m[4]];
  return null;
}

/** The colour mixed toward its luma by `sat` (1: as it is, 0: grey), as the filter's matrix did; alpha kept. */
export function greyOf([r, g, b, a], sat) {
  const l = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b, f = (c) => +(l + (c - l) * sat).toFixed(6);
  return `color(srgb ${f(r)} ${f(g)} ${f(b)}${a < 1 ? ` / ${+a.toFixed(6)}` : ''})`;
}

/** The ids a computed paint refers to ('url("#gLiver")' → 'gLiver'), or null. */
export function paintRef(s) {
  const m = s.match(/url\(\s*["']?#([^"')]+)["']?\s*\)/);
  return m ? m[1] : null;
}
