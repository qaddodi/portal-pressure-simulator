// The organs' dim and grey (a lens other than pressure, or a selected vessel) on the live SVG, as the GPU applies it to its
// copy of them (veins-gl.js: the plate's grey is a mix toward its luma, .299/.587/.114, by `sat`, then its alpha times `dim`).
// The SVG draws it with an feColorMatrix in sRGB: WebKit draws no CSS filter functions (saturate(), opacity()) on SVG
// elements, so in Safari the live organs, shown while the GPU copy is rebuilt (a patient change), flashed back to full colour.

export const LUMA = [0.299, 0.587, 0.114];

// (Kept between calls: the 20 numbers are written in place and the text is rebuilt only when the dim or the saturation changed.)
const dimCells = new Array(20).fill(0);
let dimKeyDim = NaN, dimKeySat = NaN, dimText = '';
const dimRound = (v) => +v.toFixed(5);   // alloc-rare: the SVG-filter fallback only (stage.js greyFilter), taken when an organ colour cannot be parsed; the grey is otherwise set paint by paint (organ-grey.js)
/** The feColorMatrix `values` for a dim (alpha factor) and a saturation (1: the organ's own colours, 0: grey). */
export function organDimMatrix(dim, sat) {
  if (dim === dimKeyDim && sat === dimKeySat) return dimText;
  const a = 1 - sat;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dimCells[i * 5 + j] = dimRound(a * LUMA[j] + (i === j ? sat : 0));
  dimCells[18] = dimRound(dim);
  dimKeyDim = dim; dimKeySat = sat;
  return (dimText = dimCells.join(' '));   // alloc-rare: the SVG-filter fallback only (stage.js greyFilter), taken when an organ colour cannot be parsed; the grey is otherwise set paint by paint (organ-grey.js)
}

/** What a lens other than Pressure does to the anatomy's organs: their saturation and opacity there (stage.js plateTargets, which
 *  holds the same two numbers; tests/lobule-surround-grey.test.js keeps them equal). The lobule view's surround takes the same. */
export const LENS_GREY = { sat: 0.12, dim: 0.72 };
/** Whether a lens (the mode a vessel's colour encodes) greys the organs: every one but Pressure, and the imaging view's neutral. */
export const isGreyLens = (mode) => mode !== 'pressure' && mode !== 'neutral';
