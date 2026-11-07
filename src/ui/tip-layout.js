// The tooltip's layout in script (tip-gl.js draws it): the one the stylesheet gave it (app.css .tooltip), set from Inter's own advances, with no DOM.
// padding 6 10 7, 12 px words at weight 500 on a 1.45 line, up to 300 px (or the window less 16) wide; as wide as its words need while they fit on
// one line, the full width once they wrap; the key (<kbd>) 8 px after the words, in a box with 5 px of padding, joined to the last word.

import { measure } from './glyph-measure.js';
import { sdfAtlas } from './text-gl.js';

export const ASC = 1984 / 2048, DESC = 494 / 2048;   // Inter's ascent and descent in em
export const PX = 12, LH = PX * 1.45, PAD_X = 10, PAD_T = 6, PAD_B = 7, KEY_GAP = 8, KEY_PAD = 5, LS = PX * 0.005;
export const FONT = `500 ${PX}px Inter`;
const GLYPHS = sdfAtlas.GLYPHS[500];
export const lum = (c) => { const m = String(c).match(/[\d.]+/g) || []; return 0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]; };

/** Whether Inter's atlas holds every character of `s` (⌥ and ⇧ it does not: those words stay as the page paints them; ⌘ is in it since 4 Nov 2026). */
export const covers = (s) => { for (const ch of s) if (ch !== ' ' && !GLYPHS[ch]) return false; return true; };
const wordW = (w) => measure(w, FONT) + LS * [...w].length;

/**
 * The tooltip's layout for `text` (and `key`, a short word in a box after it) in a window `W` wide:
 * { w, h, lines[{ text, x, y }], key: { x, y, w, h, label } | null }.
 */
export function layoutTip(text, key, W) {
  const max = Math.min(300, W - 16) - 2 * PAD_X;
  const words = String(text).split(/\s+/).filter(Boolean);   // alloc-rare: a tooltip's words, split once as it is shown (an event, not a frame)
  const space = wordW(' ');
  const kw = key ? wordW(key) + 2 * KEY_PAD : 0, keyEm = key ? KEY_GAP + kw : 0;
  // (The key sticks to the last word: there is no space between them to break at.)
  const unit = (i) => (i === words.length - 1 ? wordW(words[i]) + keyEm : wordW(words[i]));
  const lines = [];   // alloc-rare: one list of lines for each tooltip shown
  let line = '', lw = 0, widest = 0;
  for (let i = 0; i < words.length; i++) {
    const uw = unit(i);
    if (line && lw + space + uw > max) { lines.push({ text: line, w: lw }); widest = Math.max(widest, lw); line = ''; lw = 0; }   // alloc-rare: a line of a tooltip
    line = line ? `${line} ${words[i]}` : words[i];
    lw = lw ? lw + space + uw : uw;
  }
  if (line) { lines.push({ text: line, w: lw }); widest = Math.max(widest, lw); }   // alloc-rare: a line of a tooltip
  const wrapped = lines.length > 1;
  const w = Math.min(max, widest) + 2 * PAD_X, W0 = wrapped ? max + 2 * PAD_X : w;
  const out = { w: W0, h: PAD_T + lines.length * LH + PAD_B, lines: [], key: null };   // alloc-rare: one layout for each tooltip shown
  for (let i = 0; i < lines.length; i++) {
    const top = PAD_T + i * LH;
    out.lines.push({ text: lines[i].text, x: PAD_X, y: top + (LH - (ASC + DESC) * PX) / 2 + ASC * PX });   // alloc-rare: a line of a tooltip
  }
  if (key) {
    const last = lines[lines.length - 1], tw = last.w - keyEm;
    out.key = { x: PAD_X + tw + KEY_GAP, y: PAD_T + (lines.length - 1) * LH + (LH - PX * 1.25) / 2, w: kw, h: PX * 1.25, label: key };   // alloc-rare: one key for a tooltip that has one
  }
  return out;
}

