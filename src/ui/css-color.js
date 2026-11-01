// A CSS colour, as the browser's own parser reads it, worked out in script: [r, g, b, a] in 0–1, unpremultiplied, in sRGB, the same
// values a 2D canvas gave back for it (its fillStyle read back, or a pixel filled with it and read, lobule-zoom.js rgb01 and rgbaOf).
// No canvas is made and nothing is drawn or read back from one (the owner, 1 Nov 2026: nothing off the GPU).
//
// What the tokens are written in (styles/*.css): #hex, rgb()/rgba(), color-mix(in srgb | oklab, …), lab(), and var() already
// substituted by getPropertyValue. Also read: hsl and hsla, hwb(), color(srgb | srgb-linear | display-p3 …), lch(), oklab(), oklch(),
// the named colours, transparent. Anything else reads as opaque black, as an invalid colour left a canvas's fillStyle black.

// (Every CSS named colour, as name and hex.)
const NAMED_HEX = 'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32'.split(' ');
const NAMED = { transparent: [0, 0, 0, 0] };
for (let i = 0; i < NAMED_HEX.length; i += 2) { const h = NAMED_HEX[i + 1]; NAMED[NAMED_HEX[i]] = [0, 2, 4].map((j) => parseInt(h.slice(j, j + 2), 16)); }

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const TAU = Math.PI * 2;

// ── Colour spaces (CSS Color 4's sample code) ──
const lin = (c) => { const a = Math.abs(c); return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4; };
const gam = (c) => { const a = Math.abs(c); return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c; };
const mul = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
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
const xyzToLab = (x) => {
  const f = x.map((v, i) => { const t = v / D50[i]; return t > E ? Math.cbrt(t) : (K * t + 16) / 116; });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
};
const labToXyz = ([L, a, b]) => {
  const f1 = (L + 16) / 116, f0 = a / 500 + f1, f2 = f1 - b / 200;
  const x = f0 ** 3 > E ? f0 ** 3 : (116 * f0 - 16) / K, y = L > K * E ? ((L + 16) / 116) ** 3 : L / K, z = f2 ** 3 > E ? f2 ** 3 : (116 * f2 - 16) / K;
  return [x * D50[0], y * D50[1], z * D50[2]];
};
// sRGB (gamma) <-> each space the mix or a colour function is written in.
const SPACES = {
  srgb: { to: (c) => c, from: (c) => c },
  'srgb-linear': { to: (c) => c.map(lin), from: (c) => c.map(gam) },
  'display-p3': { to: (c) => mul(XYZ_LIN, mul(P3_XYZ, c.map(lin))).map(gam), from: null },
  xyz: { to: (c) => mul(LIN_XYZ, c.map(lin)), from: (c) => mul(XYZ_LIN, c).map(gam) },
  'xyz-d65': { to: (c) => mul(LIN_XYZ, c.map(lin)), from: (c) => mul(XYZ_LIN, c).map(gam) },
  'xyz-d50': { to: (c) => mul(D65_D50, mul(LIN_XYZ, c.map(lin))), from: (c) => mul(XYZ_LIN, mul(D50_D65, c)).map(gam) },
  lab: { to: (c) => xyzToLab(mul(D65_D50, mul(LIN_XYZ, c.map(lin)))), from: (c) => mul(XYZ_LIN, mul(D50_D65, labToXyz(c))).map(gam) },
  oklab: { to: (c) => mul(LMS_OK, mul(XYZ_LMS, mul(LIN_XYZ, c.map(lin))).map(Math.cbrt)), from: (c) => mul(XYZ_LIN, mul(LMS_XYZ, mul(OK_LMS, c).map((v) => v ** 3))).map(gam) },
};
const polar = (base, hueAt = 2) => ({
  to: (c) => { const [L, a, b] = SPACES[base].to(c), C = Math.hypot(a, b); let h = (Math.atan2(b, a) * 360) / TAU; if (h < 0) h += 360; return [L, C, C < 1e-9 ? NaN : h]; },
  from: ([L, C, h]) => { const r = ((Number.isNaN(h) ? 0 : h) * TAU) / 360; return SPACES[base].from([L, C * Math.cos(r), C * Math.sin(r)]); },
  hue: hueAt,
});
SPACES.lch = polar('lab');
SPACES.oklch = polar('oklab');
SPACES.hsl = {
  to: ([r, g, b]) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 1e-9) return [NaN, 0, l * 100];
    const s = l === 0 || l === 1 ? 0 : (mx - l) / Math.min(l, 1 - l);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
  },
  from: ([h, s, l]) => hslRgb(Number.isNaN(h) ? 0 : h, s / 100, l / 100),
  hue: 0,
};
SPACES.hwb = {
  to: (c) => { const [h] = SPACES.hsl.to(c); return [h, Math.min(...c) * 100, (1 - Math.max(...c)) * 100]; },
  from: ([h, w, b]) => hwbRgb(Number.isNaN(h) ? 0 : h, w / 100, b / 100),
  hue: 0,
};
function hslRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
function hwbRgb(h, w, b) {
  if (w + b >= 1) { const g = w / (w + b); return [g, g, g]; }
  return hslRgb(h, 1, 0.5).map((v) => v * (1 - w - b) + w);
}

// ── Reading ──
/** Splits a function's argument text at top-level commas (or, with ws, spaces and '/'), keeping nested functions whole. */
function split(s, ws) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (ch === ',' || (ws && (ch === ' ' || ch === '/')))) {
      if (cur.trim()) out.push(cur.trim());
      if (ch === '/' && ws) out.push('/');
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** A number, a percentage of full (full: what 100% stands for), an angle (deg, rad, grad, turn) or 'none' (NaN). */
function num(t, full = 1) {
  if (t == null) return NaN;
  if (t === 'none') return NaN;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i.exec(t);
  if (!m) return NaN;
  const v = +m[1], u = (m[2] || '').toLowerCase();
  if (u === '%') return (v / 100) * full;
  if (u === 'rad') return (v * 360) / TAU;
  if (u === 'grad') return v * 0.9;
  if (u === 'turn') return v * 360;
  return v;
}
const zero = (v) => (Number.isNaN(v) ? 0 : v);
/** The arguments of a colour function, comma or space separated, with the alpha after '/' (or as a fourth comma argument). */
function args(body) {
  let p = split(body, false);
  if (p.length === 1) p = split(body, true);
  const slash = p.indexOf('/');
  const ch = slash >= 0 ? p.slice(0, slash) : p.slice(0, 3);
  const al = slash >= 0 ? p[slash + 1] : p[3];
  return { ch, al };
}
const alphaOf = (t) => (t == null ? 1 : clamp01(zero(num(t, 1))));

/** [r, g, b, a] (0–1) for a CSS colour string, null when it is not one this reads. */
export function parseCssColor(input) {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s[0] === '#') {
    const x = s.slice(1);
    if (!/^[0-9a-f]+$/.test(x) || ![3, 4, 6, 8].includes(x.length)) return null;
    const full = x.length < 5 ? [...x].map((d) => d + d).join('') : x;
    const v = [0, 2, 4, 6].map((k) => (k < full.length ? parseInt(full.slice(k, k + 2), 16) / 255 : 1));
    return v;
  }
  if (NAMED[s]) { const n = NAMED[s]; return n.length === 4 ? n.slice() : [n[0] / 255, n[1] / 255, n[2] / 255, 1]; }
  const m = /^([a-z-]+)\(([\s\S]*)\)$/.exec(s);
  if (!m) return null;
  const fn = m[1], body = m[2].trim();
  if (fn === 'rgb' || fn === 'rgba') {
    const { ch, al } = args(body);
    if (ch.length < 3) return null;
    return [...ch.map((t) => clamp01(zero(num(t, 255)) / 255)), alphaOf(al)];
  }
  if (fn === 'hsl' || fn === 'hsla' || fn === 'hwb') {
    const { ch, al } = args(body);
    if (ch.length < 3) return null;
    const h = zero(num(ch[0])), a2 = zero(num(ch[1], 100)) / 100, a3 = zero(num(ch[2], 100)) / 100;
    const rgb = fn === 'hwb' ? hwbRgb(h, a2, a3) : hslRgb(h, clamp01(a2), clamp01(a3));
    return [...rgb.map(clamp01), alphaOf(al)];
  }
  if (fn === 'lab' || fn === 'oklab' || fn === 'lch' || fn === 'oklch') {
    const { ch, al } = args(body);
    if (ch.length < 3) return null;
    const okL = fn[0] === 'o';
    const L = zero(num(ch[0], okL ? 1 : 100));
    const c2 = zero(num(ch[1], fn === 'lab' ? 125 : fn === 'oklab' ? 0.4 : fn === 'lch' ? 150 : 0.4));
    const c3 = fn === 'lab' || fn === 'oklab' ? zero(num(ch[2], fn === 'lab' ? 125 : 0.4)) : num(ch[2]);
    return [...SPACES[fn].from([L, c2, c3]).map(clamp01), alphaOf(al)];
  }
  if (fn === 'color') {
    const p = split(body, true), sp = p[0], slash = p.indexOf('/');
    const ch = (slash >= 0 ? p.slice(1, slash) : p.slice(1, 4)).map((t) => zero(num(t, 1)));
    const S = SPACES[sp];
    if (!S || ch.length < 3) return null;
    return [...S.to === undefined ? ch : (sp === 'display-p3' ? S.to(ch) : sp.startsWith('xyz') ? S.from(ch) : sp === 'srgb' ? ch : S.from(ch)).map(clamp01), alphaOf(slash >= 0 ? p[slash + 1] : null)];
  }
  if (fn === 'color-mix') return mix(body);
  return null;
}

// color-mix(in <space> [<hue> hue], <colour> [<p>%], <colour> [<p>%]): premultiplied by alpha, as CSS Color 5 mixes.
function mix(body) {
  const p = split(body, false);
  if (p.length !== 3) return null;
  const head = /^in\s+([a-z0-9-]+)(?:\s+(shorter|longer|increasing|decreasing)\s+hue)?$/.exec(p[0]);
  if (!head) return null;
  const space = head[1] === 'xyz' ? 'xyz-d65' : head[1], S = SPACES[space], hueMode = head[2] || 'shorter';
  if (!S || !S.from) return null;
  const part = (t) => {
    const mm = /^(.*?)(?:\s+([+-]?[\d.]+)%)?$/.exec(t), mp = /^([+-]?[\d.]+)%\s+(.*)$/.exec(t);
    if (mp) return { c: parseCssColor(mp[2]), p: +mp[1] };
    return { c: parseCssColor(mm[1]), p: mm[2] == null ? null : +mm[2] };
  };
  const A = part(p[1]), B = part(p[2]);
  if (!A.c || !B.c) return null;
  let pa = A.p, pb = B.p;
  if (pa == null && pb == null) { pa = 50; pb = 50; } else if (pa == null) pa = 100 - pb; else if (pb == null) pb = 100 - pa;
  const sum = pa + pb;
  if (sum <= 0) return null;
  const t = pb / sum, mult = Math.min(1, sum / 100);
  const ca = S.to(A.c.slice(0, 3)), cb = S.to(B.c.slice(0, 3)), aa = A.c[3], ab = B.c[3];
  const h = S.hue;
  // (A hue left undefined (a grey) takes the other's; an undefined channel is not premultiplied.)
  for (let i = 0; i < 3; i++) { if (Number.isNaN(ca[i]) && !Number.isNaN(cb[i])) ca[i] = cb[i]; if (Number.isNaN(cb[i]) && !Number.isNaN(ca[i])) cb[i] = ca[i]; }
  if (h != null && !Number.isNaN(ca[h]) && !Number.isNaN(cb[h])) {
    const d = cb[h] - ca[h];
    if (hueMode === 'shorter') { if (d > 180) ca[h] += 360; else if (d < -180) cb[h] += 360; }
    else if (hueMode === 'longer') { if (d > 0 && d < 180) ca[h] += 360; else if (d > -180 && d <= 0) cb[h] += 360; }
    else if (hueMode === 'increasing') { if (d < 0) cb[h] += 360; }
    else if (hueMode === 'decreasing') { if (d > 0) ca[h] += 360; }
  }
  const a = aa + (ab - aa) * t;
  const out = [0, 1, 2].map((i) => {
    if (i === h) return Number.isNaN(ca[i]) ? NaN : ca[i] + (cb[i] - ca[i]) * t;
    const va = zero(ca[i]) * aa, vb = zero(cb[i]) * ab, v = va + (vb - va) * t;
    return a > 0 ? v / a : v;
  });
  if (h != null && !Number.isNaN(out[h])) out[h] = ((out[h] % 360) + 360) % 360;
  return [...S.from(out).map(clamp01), clamp01(a * mult)];
}

const seen = new Map();
/** As parseCssColor, cached by the string, with opaque black for anything it cannot read (as a canvas's fillStyle). */
export function cssColor(c) {
  let v = seen.get(c);
  if (v) return v;
  v = parseCssColor(c) || [0, 0, 0, 1];
  if (seen.size > 512) seen.clear();
  seen.set(c, v);
  return v;
}
/** In 8-bit steps, as a canvas holds a colour (its fillStyle read back, or a pixel read): what the old readers gave. */
export const cssColor8 = (c) => cssColor(c).map((v, i) => (i < 3 ? Math.round(v * 255) / 255 : Math.round(v * 255) / 255));
