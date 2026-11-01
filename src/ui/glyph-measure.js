// A word's width as Inter sets it, from the GPU atlas's own metrics (glyphs-inter.js, made by scripts/glyph-atlas.mjs): no canvas and no
// page needed, so layout code and the tests measure words the way the GPU sets them.
import { sdfAtlas } from './text-gl.js?v=b384a10c15';   // (the app's one door to GPU text)
const { GLYPHS, KERN } = sdfAtlas;

// The font a chart names ("650 12.5px Inter, …"): its weight, the nearest the atlas holds, and its size.
const WEIGHTS = Object.keys(GLYPHS).map(Number);
const fonts = new Map();
export function fontOf(font) {
  let f = fonts.get(font);
  if (!f) {
    const m = /(?:^|\s)(\d{3})\s/.exec(' ' + font + ' '), z = /([\d.]+)px/.exec(font);
    const want = m ? +m[1] : /bold/.test(font) ? 700 : 400;
    f = { w: WEIGHTS.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)), px: z ? +z[1] : 10 };
    fonts.set(font, f);
  }
  return f;
}
const widthsOf = new Map();
/** A word's width in CSS px in `font`, from the atlas's own advances and kerning (Inter, as the browser sets it), with no canvas. */
export function measure(str, font) {
  str = String(str);
  const key = font + '\u0001' + str;
  let w = widthsOf.get(key);
  if (w === undefined) {
    const f = fontOf(font), g = GLYPHS[f.w], kw = KERN[f.w];
    let em = 0, prev = '';
    for (const ch of str) { em += (g[ch] || g['?'])[0] + (prev ? kw[prev + ch] || 0 : 0); prev = ch; }
    w = em * f.px;
    if (widthsOf.size > 4000) widthsOf.clear();
    widthsOf.set(key, w);
  }
  return w;
}
