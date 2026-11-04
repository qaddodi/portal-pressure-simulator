// A CSS colour, as the browser's own parser reads it, worked out in script: [r, g, b, a] in 0–1, unpremultiplied, in sRGB, the same
// values a 2D canvas gave back for it (its fillStyle read back, or a pixel filled with it and read, lobule-zoom.js rgb01 and rgbaOf).
// No canvas is made and nothing is drawn or read back from one (the owner, 1 Nov 2026: nothing off the GPU).
//
// What the tokens are written in (styles/*.css): #hex, rgb()/rgba(), color-mix(in srgb | oklab, …), lab(), and var() already
// substituted by getPropertyValue. Also read: hsl and hsla, hwb(), color(srgb | srgb-linear | display-p3 …), lch(), oklab(), oklch(),
// the named colours, transparent. Anything else reads as opaque black, as an invalid colour left a canvas's fillStyle black.


// (Every CSS named colour, as name and hex.)
const NAMED_HEX = 'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32'.split(' ');

// The names, sorted, with their colour as 0xRRGGBB (transparent: -1), so a name is found by a binary search over the text in place.
const NAME_KEYS = [], NAME_RGB = [];
{
  const pairs = [['transparent', -1]];
  for (let i = 0; i < NAMED_HEX.length; i += 2) pairs.push([NAMED_HEX[i], parseInt(NAMED_HEX[i + 1], 16)]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (let i = 0; i < pairs.length; i++) { NAME_KEYS.push(pairs[i][0]); NAME_RGB.push(pairs[i][1]); }
}

// Reading a colour allocates nothing: the text is read in place (charCodeAt over a range), numbers are worked out by hand, and every
// intermediate lives in the kept buffers below. A frame reaches this (a colour token first seen while painting), and a frame allocates nothing.
const R = new Float64Array(4);      // the colour just read: r, g, b, a
const V = new Float64Array(3);      // a colour in the middle of a conversion (in place)
const CA = new Float64Array(3), CB = new Float64Array(3), CO = new Float64Array(3);   // color-mix: the two colours and the mix
const TS = [0, 0, 0, 0, 0, 0, 0, 0], TE = [0, 0, 0, 0, 0, 0, 0, 0];   // the pieces of a function's arguments: start and end in the text
let TN = 0, chN = 0, alI = -1;      // how many pieces, how many are channels, which one is the alpha (-1: none)
let dMant = 0, dFrac = 0, dDigits = 0;   // scanDec's digits as a whole number, how many were after the point, how many in all
let partHas = false, partVal = 0;   // color-mix: the percentage written beside a colour
let headSpace = 0, headMode = 0;    // color-mix: the space and hue mode of "in <space> [<mode> hue]"

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const TAU = Math.PI * 2;

// ── Colour spaces (CSS Color 4's sample code), each converting the three numbers of V (or the array handed in) in place ──
const lin = (c) => { const a = Math.abs(c); return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4; };
const gam = (c) => { const a = Math.abs(c); return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c; };
const LIN_XYZ = [0.41239079926595934, 0.357584339383878, 0.1804807884018343, 0.21263900587151027, 0.715168678767756, 0.07219231536073371, 0.01933081871559182, 0.11919477979462598, 0.9505321522496607];
const XYZ_LIN = [3.2409699419045226, -1.537383177570094, -0.4986107602930034, -0.9692436362808796, 1.8759675015077202, 0.04155505740717559, 0.05563007969699366, -0.20397695888897652, 1.0569715142428786];
const D65_D50 = [1.0479298208405488, 0.022946793341019088, -0.05019222954313557, 0.029627815688159344, 0.990434484573249, -0.01707382502938514, -0.009243058152591178, 0.015055144896577895, 0.7518742899580008];
const D50_D65 = [0.9554734527042182, -0.023098536874261423, 0.0632593086610217, -0.028369706963208136, 1.0099954580058226, 0.021041398966943008, 0.012314001688319899, -0.020507696433477912, 1.3303659366080753];
const P3_XYZ = [0.4865709486482162, 0.26566769316909306, 0.1982172852343625, 0.2289745640697488, 0.6917385218365064, 0.079286914093745, 0, 0.04511338185890264, 1.043944368900976];
const XYZ_LMS = [0.8190224379967030, 0.3619062600528904, -0.1288737815209879, 0.0329836539323885, 0.9292868615863434, 0.0361446663506424, 0.0481771893596242, 0.2642395317527308, 0.6335478284694309];
const LMS_XYZ = [1.2268798758459243, -0.5578149944602171, 0.2813910456659647, -0.0405757452148008, 1.1122868032803170, -0.0717110580655164, -0.0763729366746601, -0.4214933324022432, 1.5869240198367816];
const LMS_OK = [0.2104542683093140, 0.7936177747023054, -0.0040720430116193, 1.9779985324311684, -2.4285922420485799, 0.4505937096174110, 0.0259040424655478, 0.7827717124575296, -0.8086757660832010];
const OK_LMS = [1.0000000000000000, 0.3963377773761749, 0.2158037573099136, 1.0000000000000000, -0.1055613458156586, -0.0638541728258133, 1.0000000000000000, -0.0894841775298119, -1.2914855480194092];
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const E = 216 / 24389, K = 24389 / 27;
function mulIn(M, v) {
  const x = v[0], y = v[1], z = v[2];
  v[0] = M[0] * x + M[1] * y + M[2] * z; v[1] = M[3] * x + M[4] * y + M[5] * z; v[2] = M[6] * x + M[7] * y + M[8] * z;
}
function lin3(v) { v[0] = lin(v[0]); v[1] = lin(v[1]); v[2] = lin(v[2]); }
function gam3(v) { v[0] = gam(v[0]); v[1] = gam(v[1]); v[2] = gam(v[2]); }
function xyzToLab(v) {
  const t0 = v[0] / D50[0], t1 = v[1] / D50[1], t2 = v[2] / D50[2];
  const f0 = t0 > E ? Math.cbrt(t0) : (K * t0 + 16) / 116, f1 = t1 > E ? Math.cbrt(t1) : (K * t1 + 16) / 116, f2 = t2 > E ? Math.cbrt(t2) : (K * t2 + 16) / 116;
  v[0] = 116 * f1 - 16; v[1] = 500 * (f0 - f1); v[2] = 200 * (f1 - f2);
}
function labToXyz(v) {
  const L = v[0], a = v[1], b = v[2];
  const f1 = (L + 16) / 116, f0 = a / 500 + f1, f2 = f1 - b / 200;
  const x = f0 ** 3 > E ? f0 ** 3 : (116 * f0 - 16) / K, y = L > K * E ? ((L + 16) / 116) ** 3 : L / K, z = f2 ** 3 > E ? f2 ** 3 : (116 * f2 - 16) / K;
  v[0] = x * D50[0]; v[1] = y * D50[1]; v[2] = z * D50[2];
}
function hslRgb(h, s, l, v) {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  let k = (0 + h / 30) % 12; v[0] = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  k = (8 + h / 30) % 12; v[1] = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  k = (4 + h / 30) % 12; v[2] = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
}
function hwbRgb(h, w, b, v) {
  if (w + b >= 1) { const g = w / (w + b); v[0] = g; v[1] = g; v[2] = g; return; }
  hslRgb(h, 1, 0.5, v);
  v[0] = v[0] * (1 - w - b) + w; v[1] = v[1] * (1 - w - b) + w; v[2] = v[2] * (1 - w - b) + w;
}
function hslTo(v) {
  const r = v[0], g = v[1], b = v[2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-9) { v[0] = NaN; v[1] = 0; v[2] = l * 100; return; }
  const s = l === 0 || l === 1 ? 0 : (mx - l) / Math.min(l, 1 - l);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  v[0] = h * 60; v[1] = s * 100; v[2] = l * 100;
}
function polarTo(v) {   // (lab / oklab → lch / oklch)
  const a = v[1], b = v[2], C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 360) / TAU; if (h < 0) h += 360;
  v[1] = C; v[2] = C < 1e-9 ? NaN : h;
}
// The spaces, by id (a mix or a colour function names one): sRGB (gamma) <-> each.
const SP_SRGB = 0, SP_SRGBL = 1, SP_P3 = 2, SP_XYZ = 3, SP_XYZ50 = 4, SP_LAB = 5, SP_OKLAB = 6, SP_LCH = 7, SP_OKLCH = 8, SP_HSL = 9, SP_HWB = 10;
const SPACE_NAMES = ['srgb', 'srgb-linear', 'display-p3', 'xyz', 'xyz-d65', 'xyz-d50', 'lab', 'oklab', 'lch', 'oklch', 'hsl', 'hwb'];
const SPACE_ID = [SP_SRGB, SP_SRGBL, SP_P3, SP_XYZ, SP_XYZ, SP_XYZ50, SP_LAB, SP_OKLAB, SP_LCH, SP_OKLCH, SP_HSL, SP_HWB];
function toSpace(id, v) {
  switch (id) {
    case SP_SRGBL: lin3(v); return;
    case SP_P3: lin3(v); mulIn(P3_XYZ, v); mulIn(XYZ_LIN, v); gam3(v); return;
    case SP_XYZ: lin3(v); mulIn(LIN_XYZ, v); return;
    case SP_XYZ50: lin3(v); mulIn(LIN_XYZ, v); mulIn(D65_D50, v); return;
    case SP_LAB: lin3(v); mulIn(LIN_XYZ, v); mulIn(D65_D50, v); xyzToLab(v); return;
    case SP_OKLAB: lin3(v); mulIn(LIN_XYZ, v); mulIn(XYZ_LMS, v); v[0] = Math.cbrt(v[0]); v[1] = Math.cbrt(v[1]); v[2] = Math.cbrt(v[2]); mulIn(LMS_OK, v); return;
    case SP_LCH: toSpace(SP_LAB, v); polarTo(v); return;
    case SP_OKLCH: toSpace(SP_OKLAB, v); polarTo(v); return;
    case SP_HSL: hslTo(v); return;
    case SP_HWB: { const r = v[0], g = v[1], b = v[2]; hslTo(v); v[1] = Math.min(r, g, b) * 100; v[2] = (1 - Math.max(r, g, b)) * 100; return; }
    default:   // (srgb: as it is)
  }
}
function fromSpace(id, v) {
  switch (id) {
    case SP_SRGBL: gam3(v); return;
    case SP_XYZ: mulIn(XYZ_LIN, v); gam3(v); return;
    case SP_XYZ50: mulIn(D50_D65, v); mulIn(XYZ_LIN, v); gam3(v); return;
    case SP_LAB: labToXyz(v); mulIn(D50_D65, v); mulIn(XYZ_LIN, v); gam3(v); return;
    case SP_OKLAB: mulIn(OK_LMS, v); v[0] = v[0] ** 3; v[1] = v[1] ** 3; v[2] = v[2] ** 3; mulIn(LMS_XYZ, v); mulIn(XYZ_LIN, v); gam3(v); return;
    case SP_LCH: case SP_OKLCH: {
      const C = v[1], r = ((Number.isNaN(v[2]) ? 0 : v[2]) * TAU) / 360;
      v[1] = C * Math.cos(r); v[2] = C * Math.sin(r);
      fromSpace(id === SP_LCH ? SP_LAB : SP_OKLAB, v); return;
    }
    case SP_HSL: hslRgb(Number.isNaN(v[0]) ? 0 : v[0], v[1] / 100, v[2] / 100, v); return;
    case SP_HWB: hwbRgb(Number.isNaN(v[0]) ? 0 : v[0], v[1] / 100, v[2] / 100, v); return;
    default:   // (srgb: as it is; display-p3 has no way back)
  }
}
const hueOf = (id) => (id === SP_LCH || id === SP_OKLCH ? 2 : id === SP_HSL || id === SP_HWB ? 0 : -1);   // (-1: no hue channel)

// ── Reading: the text is never copied; a piece of it is a start and an end ──
/** CSS (JS) white space: what String.trim() takes off. */
function isWs(c) { return c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff; }
/** A character code in lower case (ASCII, and the Kelvin sign, the one other character that lower-cases to an ASCII letter). */
function lower(c) { return c >= 65 && c <= 90 ? c + 32 : c === 0x212a ? 107 : c; }
const isDigit = (c) => c >= 48 && c <= 57;
/** s[a, b) is the lower-case word w. */
function eqWord(s, a, b, w) {
  if (b - a !== w.length) return false;
  for (let i = 0; i < w.length; i++) if (lower(s.charCodeAt(a + i)) !== w.charCodeAt(i)) return false;
  return true;
}
/** Skips white space from i (not past b): the index of the next character that is not. */
function skipWs(s, i, b) { while (i < b && isWs(s.charCodeAt(i))) i++; return i; }
function pushTok(s, a, b) {
  a = skipWs(s, a, b);
  while (b > a && isWs(s.charCodeAt(b - 1))) b--;
  if (a < b) { TS[TN] = a; TE[TN] = b; TN++; }
}
const isSlash = (s, k) => TE[k] - TS[k] === 1 && s.charCodeAt(TS[k]) === 47;
/** Splits s[lo, hi) at top-level commas (or, with ws, spaces and '/'), keeping nested functions whole: the pieces are TS/TE[0 .. TN). */
function split(s, lo, hi, ws) {
  TN = 0;
  let depth = 0, cs = lo;
  for (let i = lo; i < hi; i++) {
    const c = s.charCodeAt(i);
    if (c === 40) depth++;
    if (c === 41) depth--;
    if (depth === 0 && (c === 44 || (ws && (c === 32 || c === 47)))) {
      pushTok(s, cs, i);
      if (c === 47 && ws) { TS[TN] = i; TE[TN] = i + 1; TN++; }
      cs = i + 1;
    }
  }
  pushTok(s, cs, hi);
}
const P10 = [1];
for (let i = 1; i <= 22; i++) P10.push(P10[i - 1] * 10);   // (every power of ten up to 1e22 is exact in a double)
/** The number m x 10^e10, signed. Exact (as Number() reads it) while m is under 2^53 and the power is 22 or less, which a colour's numbers are. */
function compose(neg, m, e10) {
  let v;
  if (m === 0) v = 0;
  else if (e10 >= 0) v = e10 <= 22 ? m * P10[e10] : m * 10 ** e10;
  else v = -e10 <= 22 ? m / P10[-e10] : m / 10 ** -e10;
  return neg ? -v : v;
}
/** Reads digits with one point from s[i, b): sets dMant, dFrac, dDigits; returns the index after them. */
function scanDec(s, i, b) {
  dMant = 0; dFrac = 0; dDigits = 0;
  let dot = false;
  for (; i < b; i++) {
    const c = s.charCodeAt(i);
    if (isDigit(c)) { dMant = dMant * 10 + (c - 48); dDigits++; if (dot) dFrac++; } else if (c === 46 && !dot) dot = true; else break;
  }
  return i;
}
/** [+-]?[\d.]+ as Number() reads it (NaN when it is not a number: two points, or none of the digits). */
function decNum(s, a, b) {
  let neg = false;
  const c = s.charCodeAt(a);
  if (c === 43 || c === 45) { neg = c === 45; a++; }
  const e = scanDec(s, a, b);
  return e === b && dDigits > 0 ? compose(neg, dMant, -dFrac) : NaN;
}
/** A number, a percentage of full (full: what 100% stands for), an angle (deg, rad, grad, turn) or 'none' (NaN); s[a, b) is one piece, a < 0 none. */
function num(s, a, b, full) {
  if (a < 0) return NaN;
  if (eqWord(s, a, b, 'none')) return NaN;
  let i = a, neg = false;
  const c0 = s.charCodeAt(i);
  if (c0 === 43 || c0 === 45) { neg = c0 === 45; i++; }
  i = scanDec(s, i, b);
  if (dDigits === 0) return NaN;
  const m = dMant, k = dFrac;
  let ex = 0;
  if (i < b && lower(s.charCodeAt(i)) === 101) {   // (an exponent: e, a sign, digits)
    let j = i + 1, en = false;
    const cs = j < b ? s.charCodeAt(j) : 0;
    if (cs === 43 || cs === 45) { en = cs === 45; j++; }
    const js = j;
    for (; j < b && isDigit(s.charCodeAt(j)); j++) { ex = ex * 10 + (s.charCodeAt(j) - 48); if (ex > 100000) ex = 100000; }
    if (j === js) return NaN;
    if (en) ex = -ex;
    i = j;
  }
  const v = compose(neg, m, ex - k);
  if (i === b) return v;
  if (i + 1 === b && s.charCodeAt(i) === 37) return (v / 100) * full;
  if (eqWord(s, i, b, 'deg')) return v;
  if (eqWord(s, i, b, 'rad')) return (v * 360) / TAU;
  if (eqWord(s, i, b, 'grad')) return v * 0.9;
  if (eqWord(s, i, b, 'turn')) return v * 360;
  return NaN;
}
const zero = (v) => (Number.isNaN(v) ? 0 : v);
/** The arguments of a colour function, comma or space separated, with the alpha after '/' (or as a fourth comma argument):
 *  the pieces TS/TE[0 .. chN) are the channels (up to the '/', else the first three), alI the alpha's (-1: none). */
function args(s, lo, hi) {
  split(s, lo, hi, false);
  if (TN === 1) split(s, lo, hi, true);
  let slash = -1;
  for (let k = 0; k < TN; k++) if (isSlash(s, k)) { slash = k; break; }
  if (slash >= 0) { chN = slash; alI = slash + 1 < TN ? slash + 1 : -1; } else { chN = TN < 3 ? TN : 3; alI = TN > 3 ? 3 : -1; }
}
const alphaOf = (s, k) => (k < 0 ? 1 : clamp01(zero(num(s, TS[k], TE[k], 1))));
/** The index of the colour name s[a, b) (any case) in NAME_KEYS, -1 when it is none. */
function nameIndex(s, a, b) {
  let lo = 0, hi = NAME_KEYS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, key = NAME_KEYS[mid], kn = key.length, n = b - a;
    let d = 0;
    for (let i = 0; i < kn && i < n; i++) { d = lower(s.charCodeAt(a + i)) - key.charCodeAt(i); if (d !== 0) break; }
    if (d === 0) d = n - kn;
    if (d === 0) return mid;
    if (d < 0) hi = mid - 1; else lo = mid + 1;
  }
  return -1;
}
function spaceOf(s, a, b) {
  for (let i = 0; i < SPACE_NAMES.length; i++) if (eqWord(s, a, b, SPACE_NAMES[i])) return SPACE_ID[i];
  return -1;
}
function hexVal(c) { c = lower(c); return c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : -1; }
function hexRead(s, a, b) {   // (#rgb, #rgba, #rrggbb, #rrggbbaa; s[a, b) is what follows the '#')
  const n = b - a;
  if (n !== 3 && n !== 4 && n !== 6 && n !== 8) return false;
  for (let i = a; i < b; i++) if (hexVal(s.charCodeAt(i)) < 0) return false;
  for (let k = 0; k < 4; k++) {
    if (n < 5) R[k] = k < n ? (hexVal(s.charCodeAt(a + k)) * 17) / 255 : 1;
    else R[k] = k * 2 < n ? (hexVal(s.charCodeAt(a + k * 2)) * 16 + hexVal(s.charCodeAt(a + k * 2 + 1))) / 255 : 1;
  }
  return true;
}

/** Reads the colour s[lo, hi) into R as [r, g, b, a] (0–1); false when it is not one this reads. */
function parseRange(s, lo, hi) {
  lo = skipWs(s, lo, hi);
  while (hi > lo && isWs(s.charCodeAt(hi - 1))) hi--;
  if (lo >= hi) return false;
  if (s.charCodeAt(lo) === 35) return hexRead(s, lo + 1, hi);
  const ni = nameIndex(s, lo, hi);
  if (ni >= 0) {
    const n = NAME_RGB[ni];
    if (n < 0) { R[0] = 0; R[1] = 0; R[2] = 0; R[3] = 0; return true; }
    R[0] = (n >> 16) / 255; R[1] = ((n >> 8) & 255) / 255; R[2] = (n & 255) / 255; R[3] = 1;
    return true;
  }
  let i = lo;   // (a function: name, '(', the arguments, ')')
  for (; i < hi; i++) { const c = lower(s.charCodeAt(i)); if (!((c >= 97 && c <= 122) || c === 45)) break; }
  if (i === lo || i >= hi - 1 || s.charCodeAt(i) !== 40 || s.charCodeAt(hi - 1) !== 41) return false;
  const bl = skipWs(s, i + 1, hi - 1);
  let bh = hi - 1;
  while (bh > bl && isWs(s.charCodeAt(bh - 1))) bh--;
  if (eqWord(s, lo, i, 'rgb') || eqWord(s, lo, i, 'rgba')) {
    args(s, bl, bh);
    if (chN < 3) return false;
    for (let k = 0; k < 3; k++) R[k] = clamp01(zero(num(s, TS[k], TE[k], 255)) / 255);
    // (a fourth channel before the '/' lands in the alpha's place, as it always has)
    R[3] = chN > 3 ? clamp01(zero(num(s, TS[3], TE[3], 255)) / 255) : alphaOf(s, alI);
    return true;
  }
  if (eqWord(s, lo, i, 'hsl') || eqWord(s, lo, i, 'hsla') || eqWord(s, lo, i, 'hwb')) {
    args(s, bl, bh);
    if (chN < 3) return false;
    const h = zero(num(s, TS[0], TE[0], 1)), a2 = zero(num(s, TS[1], TE[1], 100)) / 100, a3 = zero(num(s, TS[2], TE[2], 100)) / 100;
    const al = alphaOf(s, alI);
    if (eqWord(s, lo, i, 'hwb')) hwbRgb(h, a2, a3, V); else hslRgb(h, clamp01(a2), clamp01(a3), V);
    R[0] = clamp01(V[0]); R[1] = clamp01(V[1]); R[2] = clamp01(V[2]); R[3] = al;
    return true;
  }
  const isLab = eqWord(s, lo, i, 'lab'), isOklab = eqWord(s, lo, i, 'oklab');
  if (isLab || isOklab || eqWord(s, lo, i, 'lch') || eqWord(s, lo, i, 'oklch')) {
    args(s, bl, bh);
    if (chN < 3) return false;
    const okL = lower(s.charCodeAt(lo)) === 111;   // ('o'klab, 'o'klch)
    const L = zero(num(s, TS[0], TE[0], okL ? 1 : 100));
    const lch = eqWord(s, lo, i, 'lch');
    const c2 = zero(num(s, TS[1], TE[1], isLab ? 125 : isOklab ? 0.4 : lch ? 150 : 0.4));
    const c3 = isLab || isOklab ? zero(num(s, TS[2], TE[2], isLab ? 125 : 0.4)) : num(s, TS[2], TE[2], 1);
    V[0] = L; V[1] = c2; V[2] = c3;
    fromSpace(isLab ? SP_LAB : isOklab ? SP_OKLAB : lch ? SP_LCH : SP_OKLCH, V);
    const al = alphaOf(s, alI);
    R[0] = clamp01(V[0]); R[1] = clamp01(V[1]); R[2] = clamp01(V[2]); R[3] = al;
    return true;
  }
  if (eqWord(s, lo, i, 'color')) {
    split(s, bl, bh, true);
    if (TN === 0) return false;
    const id = spaceOf(s, TS[0], TE[0]);
    let slash = -1;
    for (let k = 0; k < TN; k++) if (isSlash(s, k)) { slash = k; break; }
    const n = slash >= 0 ? slash - 1 : Math.min(TN, 4) - 1;   // (the channels written, after the space)
    if (id < 0 || n < 3) return false;
    V[0] = zero(num(s, TS[1], TE[1], 1)); V[1] = zero(num(s, TS[2], TE[2], 1)); V[2] = zero(num(s, TS[3], TE[3], 1));
    const c4 = n > 3 ? zero(num(s, TS[4], TE[4], 1)) : 0;
    const al = slash >= 0 && slash + 1 < TN ? clamp01(zero(num(s, TS[slash + 1], TE[slash + 1], 1))) : 1;
    if (id === SP_P3) toSpace(id, V); else if (id !== SP_SRGB) fromSpace(id, V);
    R[0] = clamp01(V[0]); R[1] = clamp01(V[1]); R[2] = clamp01(V[2]);
    // (a fourth channel before the '/' lands in the alpha's place in srgb and srgb-linear, as it always has)
    R[3] = n > 3 && id === SP_SRGB ? clamp01(c4) : n > 3 && id === SP_SRGBL ? clamp01(gam(c4)) : al;
    return true;
  }
  if (eqWord(s, lo, i, 'color-mix')) return mix(s, bl, bh);
  return false;
}

// color-mix(in <space> [<hue> hue], <colour> [<p>%], <colour> [<p>%]): premultiplied by alpha, as CSS Color 5 mixes.
/** "in <space> [shorter|longer|increasing|decreasing hue]" in s[a, b): sets headSpace and headMode. */
function mixHead(s, a, b) {
  if (b - a < 3 || lower(s.charCodeAt(a)) !== 105 || lower(s.charCodeAt(a + 1)) !== 110) return false;   // 'in'
  let i = skipWs(s, a + 2, b);
  if (i === a + 2) return false;
  const ns = i;
  for (; i < b; i++) { const c = lower(s.charCodeAt(i)); if (!((c >= 97 && c <= 122) || isDigit(c) || c === 45)) break; }
  if (i === ns) return false;
  headSpace = spaceOf(s, ns, i);
  headMode = 0;   // shorter
  if (i === b) return true;
  let j = skipWs(s, i, b);
  if (j === i) return false;
  let w = j;
  while (w < b && !isWs(s.charCodeAt(w))) w++;
  if (eqWord(s, j, w, 'shorter')) headMode = 0; else if (eqWord(s, j, w, 'longer')) headMode = 1; else if (eqWord(s, j, w, 'increasing')) headMode = 2; else if (eqWord(s, j, w, 'decreasing')) headMode = 3; else return false;
  j = skipWs(s, w, b);
  return j > w && eqWord(s, j, b, 'hue');
}
/** One colour of a mix in s[a, b), "<p>% <colour>" or "<colour> <p>%": the colour into R, the percentage into partHas / partVal. */
function mixPart(s, a, b) {
  let j = a;
  const c0 = s.charCodeAt(j);
  if (c0 === 43 || c0 === 45) j++;
  let k = j;
  while (k < b) { const c = s.charCodeAt(k); if (isDigit(c) || c === 46) k++; else break; }
  if (k > j && k + 1 < b && s.charCodeAt(k) === 37 && isWs(s.charCodeAt(k + 1))) {
    const pv = decNum(s, a, k), ok = parseRange(s, skipWs(s, k + 1, b), b);   // (reading the colour may be a mix itself: the percentage is set after)
    partHas = true; partVal = pv;
    return ok;
  }
  let has = false, pv = 0, end = b;
  if (s.charCodeAt(b - 1) === 37) {   // (a trailing "<ws><p>%": the colour is what comes before the white space)
    let q = b - 2;
    while (q >= a) { const c = s.charCodeAt(q); if (isDigit(c) || c === 46) q--; else break; }
    let ns = q + 1;
    if (ns < b - 1) {
      if (q >= a && (s.charCodeAt(q) === 43 || s.charCodeAt(q) === 45)) { ns = q; q--; }
      if (q >= a && isWs(s.charCodeAt(q))) {
        while (q >= a && isWs(s.charCodeAt(q))) q--;
        end = q + 1;
        has = true; pv = decNum(s, ns, b - 1);
      }
    }
  }
  const ok = parseRange(s, a, end);
  partHas = has; partVal = pv;
  return ok;
}
function mix(s, bl, bh) {
  split(s, bl, bh, false);
  if (TN !== 3) return false;
  const s1 = TS[1], e1 = TE[1], s2 = TS[2], e2 = TE[2];   // (kept: reading a colour below splits again)
  if (!mixHead(s, TS[0], TE[0])) return false;
  const id = headSpace, hueMode = headMode;
  if (id < 0 || id === SP_P3) return false;
  const hAt = hueOf(id);
  if (!mixPart(s, s1, e1)) return false;
  const a0 = R[0], a1 = R[1], a2 = R[2], aa = R[3], hasA = partHas, qa = partVal;
  if (!mixPart(s, s2, e2)) return false;
  const hasB = partHas, qb = partVal;
  let pa = qa, pb = qb;
  if (!hasA && !hasB) { pa = 50; pb = 50; } else if (!hasA) pa = 100 - pb; else if (!hasB) pb = 100 - pa;
  const sum = pa + pb;
  if (sum <= 0) return false;
  const t = pb / sum, mult = Math.min(1, sum / 100);
  CA[0] = a0; CA[1] = a1; CA[2] = a2; toSpace(id, CA);
  CB[0] = R[0]; CB[1] = R[1]; CB[2] = R[2]; toSpace(id, CB);
  const ab = R[3];
  // (A hue left undefined (a grey) takes the other's; an undefined channel is not premultiplied.)
  for (let i = 0; i < 3; i++) { if (Number.isNaN(CA[i]) && !Number.isNaN(CB[i])) CA[i] = CB[i]; if (Number.isNaN(CB[i]) && !Number.isNaN(CA[i])) CB[i] = CA[i]; }
  if (hAt >= 0 && !Number.isNaN(CA[hAt]) && !Number.isNaN(CB[hAt])) {
    const d = CB[hAt] - CA[hAt];
    if (hueMode === 0) { if (d > 180) CA[hAt] += 360; else if (d < -180) CB[hAt] += 360; }
    else if (hueMode === 1) { if (d > 0 && d < 180) CA[hAt] += 360; else if (d > -180 && d <= 0) CB[hAt] += 360; }
    else if (hueMode === 2) { if (d < 0) CB[hAt] += 360; }
    else if (d > 0) CA[hAt] += 360;
  }
  const a = aa + (ab - aa) * t;
  for (let i = 0; i < 3; i++) {
    if (i === hAt) { CO[i] = Number.isNaN(CA[i]) ? NaN : CA[i] + (CB[i] - CA[i]) * t; continue; }
    const va = zero(CA[i]) * aa, vb = zero(CB[i]) * ab, v = va + (vb - va) * t;
    CO[i] = a > 0 ? v / a : v;
  }
  if (hAt >= 0 && !Number.isNaN(CO[hAt])) CO[hAt] = ((CO[hAt] % 360) + 360) % 360;
  fromSpace(id, CO);
  R[0] = clamp01(CO[0]); R[1] = clamp01(CO[1]); R[2] = clamp01(CO[2]); R[3] = clamp01(a * mult);
  return true;
}

/** [r, g, b, a] (0–1) for a CSS colour string, null when it is not one this reads. (A new array each call, for the callers that keep it:
 *  none is on a frame; a frame reads colours through cssColor, which keeps its answers.) */
export function parseCssColor(input) {
  const s = String(input ?? '');
  return parseRange(s, 0, s.length) ? [R[0], R[1], R[2], R[3]] : null;
}

// What cssColor / cssColor8 hand out are arrays made once, here, and written in place: a colour first seen while painting costs no allocation.
// A slot is written again after RING other colours were read, so keep an answer longer than that only as a copy.
const RING = 1024;
const SLOTS = [], SLOTS8 = [];
for (let i = 0; i < RING; i++) { SLOTS.push([0, 0, 0, 1]); SLOTS8.push([0, 0, 0, 1]); }
let slotAt = 0, slotAt8 = 0;
const seen = new Map(), seen8 = new Map();
/** As parseCssColor, cached by the string, with opaque black for anything it cannot read (as a canvas's fillStyle). The array is the cache's
 *  own: read it, do not change it. */
export function cssColor(c) {
  const hit = seen.get(c);
  if (hit) return hit;
  const v = SLOTS[slotAt];
  slotAt = (slotAt + 1) % RING;
  if (typeof c === 'string' && parseRange(c, 0, c.length)) { v[0] = R[0]; v[1] = R[1]; v[2] = R[2]; v[3] = R[3]; } else { v[0] = 0; v[1] = 0; v[2] = 0; v[3] = 1; }
  if (seen.size > 512) seen.clear();
  seen.set(c, v);
  return v;
}
/** In 8-bit steps, as a canvas holds a colour (its fillStyle read back, or a pixel read): what the old readers gave. Cached like cssColor's. */
export function cssColor8(c) {
  const hit = seen8.get(c);
  if (hit) return hit;
  const x = cssColor(c), v = SLOTS8[slotAt8];
  slotAt8 = (slotAt8 + 1) % RING;
  for (let i = 0; i < 4; i++) v[i] = Math.round(x[i] * 255) / 255;
  if (seen8.size > 512) seen8.clear();
  seen8.set(c, v);
  return v;
}

/** color-mix(in <space>, a [pctA]%, b [pctB]%) worked out here: [r, g, b, a] (0–1, unpremultiplied sRGB), null if a part is not a colour. A part is
 *  a CSS colour string or an [r, g, b, a] array; a missing percentage is the rest of 100, as CSS reads it. This is the one mixer: the parse of a
 *  computed colour (parseCssColor) and the chart look table (chart-looks/resolve.js) both go through it, so they cannot drift apart. */
export function mixColor(space, a, pctA, b, pctB) {
  const part = (c, p) => `${typeof c === 'string' ? c : `color(srgb ${c[0]} ${c[1]} ${c[2]} / ${c[3]})`}${p == null ? '' : ` ${p}%`}`;
  return parseCssColor(`color-mix(in ${space}, ${part(a, pctA)}, ${part(b, pctB)})`);
}
