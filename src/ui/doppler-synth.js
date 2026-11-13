// The Doppler spectrum's lines worked out on the GPU, the one place the spectrum is made (there is no CPU copy of this formula). The CPU
// gives each new spectral line only its few numbers (its top, its low edge, its soft ends, its gain, its variance: doppler.js lineParams,
// a handful of operations a column), and this shader writes the line's pixels into the ring texture (the band's power, the wall filter,
// the log compression, the colour modes), one fragment per pixel of the new columns. On the CPU the per-pixel log and pow of every column
// took most of the main thread's time (a retina phone: a line is about 900 pixels, 200 lines a second, and a whole redraw after a scale
// change a million).
//
// Every vessel's band is the main portal vein's (the owner's standing rule): filled from the baseline, brightest just under the outline and
// dimmer toward the baseline. The arteries, the TIPS and the DIPS differ only in their velocities and waveform (lineParams), not in the shape.
//
// The speckle is a weighted sum of the independent draws of the lines before it, with weights (1 - m) m^j (the first-order recursion along
// the lines it once was, which cannot be run in parallel), so each pixel takes the last SPK_J of them from a hash of (line number, bin) and
// normalises: the same grain, the same width of a bright spot across lines and bins, nothing kept between frames.

export const SPK_J = 6;

// A spectral line's band, the numbers the shader's power() takes (cm/s along the flow), the same for every vessel: its top P is the peak
// (dopplerK × the mean, nudged by the line's own jitter, so the outline is jagged), its low edge L is 5 % of the mean (filled from the baseline,
// as the main portal vein is), and the soft ends' widths above P and below L. It takes no vessel kind: an artery, a TIPS and a vein at the same
// mean and peak-to-mean factor get the same band. Written into `out` (doppler.js lineParams keeps one), nothing made.
export const BAND_LOW = 0.05;
export function lineBand(av, k, jit, out) {
  const P = av * k * (1 + 0.035 * jit);
  out.P = P; out.L = av * BAND_LOW; out.sigHi = 0.02 * P + 0.4; out.sigLo = 0.08 * P + 1.2;
  return out;
}

export const SYNTH_VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

export const SYNTH_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D colA, colB;   // a line's numbers by ring column: A (P, L, sigHi, sigLo), B (gain, variance, flags, line number)
uniform float rBase, rPxPerV, fade, wfV, spkPx, spkMix, span, uK;
uniform int mode;               // 0 grey spectrum, 1 colour velocity, 2 colour variance
uniform uint seed;
uniform vec3 cToward, cAway, cVarT0, cVarT1, cVarA0, cVarA1, cWhite;   // the colour maps' colours, 0 to 255
out vec4 o;
const float A_SIG = 630.957344480193;       // 10 ** 2.8
const float FLOOR_DB = 4.5, RANGE_DB = 30.0, GAIN = 1.1;
const float LN10_10 = 4.342944819032518;
uint hh(uint a, uint b) {
  uint h = a * 747796405u + b * 2891336453u + seed;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return h;
}
float expo(uint c, uint b) { return -log(1.0 - float(hh(c & 1048575u, b) >> 8) * (1.0 / 16777216.0) * 0.999999); }
float speckle(uint c, uint bin) {
  float s = 0.0, w = 1.0 - spkMix, tot = 0.0;
  for (int j = 0; j < ${SPK_J}; j++) { s += w * expo(c - uint(j), bin); tot += w; w *= spkMix; }
  return s / tot;
}
float power(float u, float P, float L, float sigHi, float sigLo) {
  if (u > P) { float z = (u - P) / sigHi; return 0.03 * exp(-z * z); }
  if (u >= L) {
    float f = (u - L) / max(1e-6, P - L), q = (0.88 - f) / 0.16;
    float S = min(1.0, 0.05 + 0.1 * f + 0.9 * exp(-(q * q)));   // brightest just under the outline, a dimmer fill down to the baseline
    if (u > P - fade) { float z = (u - P + fade) / fade; return S * (1.0 - 0.985 * sqrt(z)); }
    return S;
  }
  if (u > 0.0) { float z = (L - u) / sigLo; return 0.16 * exp(-z * z); }
  return 0.0;
}
vec3 shade(vec3 c, float t, float cover) {
  float l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  float b = (0.3 + 0.7 * t) * cover, hl = 0.2 * t * t * sqrt(t) * cover;
  return min(vec3(255.0), (c * (1.0 - 0.28) + l * 0.28) * b + cWhite * hl);
}
void main() {
  int x = int(gl_FragCoord.x), ry = int(gl_FragCoord.y);   // (the ring's own column and row, the first row the top)
  vec4 A = texelFetch(colA, ivec2(x, 0), 0), B = texelFetch(colB, ivec2(x, 0), 0);
  int fl = int(B.z + 0.5);
  if (fl == 0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float s = (fl & 4) != 0 ? -1.0 : 1.0;
  bool wraps = (fl & 2) != 0;
  float P = A.x, L = A.y, sigHi = A.z, sigLo = A.w, gain = B.x, lineS = B.y;
  uint cn = uint(B.w + 0.5);
  float vel = (rBase - float(ry)) / rPxPerV;
  float S = power(vel * s, P, L, sigHi, sigLo);
  if (wraps) S += power((vel + span) * s, P, L, sigHi, sigLo) + power((vel - span) * s, P, L, sigHi, sigLo);
  float a = abs(vel) / wfV;
  float W = a >= 1.0 ? 1.0 : a * a * a;
  float fb = float(ry) / spkPx, b0f = floor(fb), f0 = fb - b0f, f = f0 * f0 * (3.0 - 2.0 * f0);
  uint b0 = uint(b0f);
  float X0 = speckle(cn, b0), X1 = speckle(cn, b0 + 1u);
  float X = X0 + (X1 - X0) * f;
  float pw = (1.0 + A_SIG * S * gain * X) * W;
  float I = pw > 0.0 ? (log(pw) * LN10_10 - FLOOR_DB) / RANGE_DB : 0.0;
  I = I <= 0.0 ? 0.0 : (I >= 1.0 ? 1.0 : pow(I, 1.2));
  vec3 rgb = vec3(236.0, 240.0, 250.0) * GAIN * I;
  if (mode != 0 && I > 0.0) {
    float ff = P > L ? clamp((vel * s - L) / (P - L), 0.0, 1.0) : 1.0;
    float u = clamp(vel * uK, -1.0, 1.0), sv = clamp(lineS + 0.45 * (1.0 - ff) * (1.0 - ff), 0.0, 1.0);
    bool toward = u >= 0.0;
    vec3 c = mode == 1 ? (toward ? cToward : cAway) : mix(toward ? cVarT0 : cVarA0, toward ? cVarT1 : cVarA1, sv);
    float al = smoothstep(0.03, 0.12, abs(u));
    float t = min(1.0, I * GAIN), cover = al * clamp((I - 0.02) / 0.2, 0.0, 1.0);
    rgb = shade(c, t, cover);
  }
  o = vec4(clamp(rgb / 255.0, 0.0, 1.0), 1.0);
}`;

export const SYNTH_UNIS = ['colA', 'colB', 'rBase', 'rPxPerV', 'fade', 'wfV', 'spkPx', 'spkMix', 'span', 'uK', 'mode', 'seed',
  'cToward', 'cAway', 'cVarT0', 'cVarT1', 'cVarA0', 'cVarA1', 'cWhite'];
