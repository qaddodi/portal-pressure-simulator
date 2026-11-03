// Colour luminance helpers for the vessels' ink (moved out of stage.js unchanged).

// Relative luminance of an 'rgb(r,g,b)' string (non-rgb strings count as dark).
function lumaLin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
export function luminance(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  if (!m) return 0;
  const r = lumaLin(m[1]), g = lumaLin(m[2]), b = lumaLin(m[3]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}


// The luminance of the colour a vessel last had, kept on the vessel: read again (a pattern match and three numbers) only when the colour changed.
export function lumOf(x, c) {
  if (x.lumS !== c) { x.lumS = c; x.lumV = luminance(c); }
  return x.lumV;
}
