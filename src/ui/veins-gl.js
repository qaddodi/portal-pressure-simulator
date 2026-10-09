// Veins on the GPU (WebGL2): the anatomy's vessels drawn from signed distances instead of SVG
// tubes, so vessels that meet merge into one smooth, filleted shape.
//
// Each vessel (vein, artery, cavernoma strand, tributary) is its sampled centerline as a chain of
// round-capped segments (capsules) whose radius follows its drawn caliber (junction easing,
// stenosis waist). The world is cut into square cells, and each cell lists the segments (grouped
// by vessel) and junctions that can reach it; one instanced quad per non-empty cell runs the
// fragment shader, which loops over only that cell's list: per vessel the exact distance to its
// nearest segment, then a smooth minimum between vessels that share a junction (a fillet), a
// plain minimum otherwise.
//
// The picture is composited in depth tiers, back to front, each tier as one shape: a soft
// contact shadow, the casing band just outside the lumen, the pressure-colored lumen and the
// flat, textbook shading: a thin light line and a thin dark line, placed by the across-tube
// coordinate. Vessels in different tiers pass over or under each other with their own casings; where a
// vessel ends on one in a lower tier, the lower one is copied into the upper tier near the
// junction and fades out with distance, so that join is filleted too. Tiers behind the organs
// are faded where an organ covers them (the organ covers are a texture), as the SVG's ghost did.
//
// Geometry (the entries) is uploaded when the layout changes; radii when a vessel's width
// changes; colors, tiers and flags on every model frame (a few kilobytes).
//
// The moving blood (see blood.js) is drawn by the composite pass further down, from a lumen buffer
// this shader writes beside the color.
//
// createVeinsGL(canvas) returns null only when WebGL2 is unavailable altogether.

import { SLOT, DYE_BINS } from './blood.js?v=6c39f43ddf';

export const N_SAMPLES = 64;
export const FLOW_TEXELS = 3;          // per-vessel blood: see stage.js (syncBlood)
const SLOT_W = SLOT;
export const TUBE_TEXELS = 10;         // texels of per-vessel attributes (see the layout below)
export const MAX_TIERS = 20;
const S_OFF = 96;                      // arc length is stored offset by this, so it can run on past a vessel's start
export const ORIGIN_GREY = 0.62;       // the lumen's color while the blood is colored by origin
const CELL = 16;                       // cell size, world units
const ENT_W = 2048;                    // texels per row of the entry texture
const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

// Flags (tube texel 2, z).
// Stream flags (tube texel 5, w): the stream runs on at the upstream / downstream end; reversed flow.
export const F_UP = 1, F_DN = 2, F_REV = 4;
export const F_SEL = 1, F_DIFFUSE = 2, F_SHADOW = 4, F_DOTTED = 8, F_NOCASE = 16, F_SPEC = 32, F_EDGE = 64, F_VEIL = 128;   // F_EDGE: the casing takes its own color (texel 6) and is opaque; F_VEIL: faded along its whole course as if behind an organ

const VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;        // cell origin (world)
layout(location=2) in vec4 range;      // first segment entry, count, first junction entry, count
uniform mat3 world;                    // world → device pixels
uniform vec2 size;
uniform float cell;
out vec2 vW;
flat out ivec4 vR;
void main() {
  vec2 w = org + corner * cell;
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vW = w; vR = ivec4(range + 0.5);
}`;

// Tube attributes, TUBE_TEXELS texels per vessel (row = vessel):
//   0: color at the start (rgb), casing width (world)
//   1: color at the end (rgb), alpha
//   2: tier, z (draw order within a tier), flags, congestion glow alpha
//   3: fade: linear from (x, y) to (x, y), or radial: center (x, y), radius
//   4: fade: offset, alpha at the start, alpha at the end (radial: at 45 %), mode (0 none, 1 linear, 2 radial)
//   5: drawn part along the vessel (0–1): from, to; arc length (world); stream flags (F_UP, F_DN, F_REV)
//   6: congestion glow color (rgb), streak course length (world)
//   7: flow streaks: phase at the upstream end, spacing (world), direction (±1, from → to), strength (0 off)
//   8: a stretch recolored (the HVPG's wedged vein): color (rgb), amount (0 none)
//   9: that stretch along the vessel (0–1): from, to; its soft edge (world)
const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vW;
flat in ivec4 vR;
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform float reachU;                  // how far from a lumen anything is drawn (world)
uniform vec2 shOff;                    // contact shadow offset (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform int heat;                      // 1: congestion glow
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 × (arc length + S_OFF), across (0–65535), visibility
layout(location=2) out uvec4 outFlow2; // near a join, the lumen it joins: row + 1, 16 × (arc + S_OFF), across, its share (0–65535)

#define MAXS 8
#define MAXJ 6
#define ENT_W ${ENT_W}
const float LAST = ${N_SAMPLES - 1}.0;
const float S_OFF = ${S_OFF}.0;

vec4 E(int e, int k) { int t = e * 2 + k; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

void main() {
  vec2 p = vW, ps = vW - shOff;
  float reach = reachU + 2.0 * px;

  // ── Nearest point of each vessel in this cell ──
  int n = 0;
  int sid[MAXS];
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS], sx[MAXS];
  vec2 sg[MAXS];
  int cur = -1;
  // bx: signed distance across the nearest segment's line (the lumen's across coordinate, also
  // past the vessel's ends); bu: how far along (0–1), running on past either end.
  float bd = 1e9, bs = 1e9, br = 0.0, bu = 0.0, bx = 0.0;
  vec2 bg = vec2(0.0);
  vec4 clip = vec4(0.0, 1.0, 1.0, 0.0);
  bool dotted = false;
  int cnt = min(vR.y, 2048);
  for (int k = 0; k <= cnt; k++) {
    int id = -2;
    vec4 A = vec4(0.0), B = vec4(0.0);
    if (k < cnt) { A = E(vR.x + k, 0); B = E(vR.x + k, 1); id = int(B.x + 0.5); }
    if (id != cur) {
      if (cur >= 0 && min(bd, bs) < reach) {
        int slot = n;
        if (n == MAXS) {
          slot = 0;
          for (int s = 1; s < MAXS; s++) if (sd[s] > sd[slot]) slot = s;
          if (bd >= sd[slot]) slot = -1;
        } else n++;
        if (slot >= 0) { sid[slot] = cur; sd[slot] = bd; sh[slot] = bs; sr[slot] = br; su[slot] = bu; sg[slot] = bg; sx[slot] = bx; }
      }
      cur = id; bd = 1e9; bs = 1e9;
      if (id >= 0) { clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${F_DOTTED}) != 0; }
    }
    if (k == cnt) break;
    // The part of this segment inside the drawn stretch (a vessel drawing on is cut short).
    float i = B.y, u0 = i / LAST, u1 = (i + 1.0) / LAST;
    if (u1 < clip.x || u0 > clip.y) continue;
    float t0 = clamp((clip.x - u0) * LAST, 0.0, 1.0), t1 = clamp((clip.y - u0) * LAST, 0.0, 1.0);
    vec2 a = mix(A.xy, A.zw, t0), b = mix(A.xy, A.zw, t1), ba = b - a;
    float L2 = max(dot(ba, ba), 1e-8);
    vec2 rr = texelFetch(rad, ivec2(int(i + 0.5), id), 0).rg;
    float hr = dot(p - a, ba) / L2, h = clamp(hr, 0.0, 1.0);
    float hh = mix(t0, t1, h);
    vec2 q = p - a - ba * h;
    float dist = length(q), r = mix(rr.x, rr.y, hh);
    // Along the course, carried on straight past the drawn ends (the blood runs on into a join).
    float he = (u0 <= clip.x && hr < 0.0) || (u1 >= clip.y && hr > 1.0) ? hr : h;
    float d = dist - r;
    if (dotted) {
      // A closed potential collateral: round dots 1.5 long every 6 units, as the SVG dashes.
      float m = mod((i + hh) / LAST * clip.z, 6.0);
      float along = m < 3.75 ? max(0.0, m - 1.5) : 6.0 - m;
      d = length(vec2(dist, along)) - r;
    }
    if (d < bd) { bd = d; bg = dist > 1e-5 ? q / dist : vec2(0.0); br = r; bu = (i + mix(t0, t1, he)) / LAST; bx = (ba.x * (p - a).y - ba.y * (p - a).x) * inversesqrt(L2); }
    float hs = clamp(dot(ps - a, ba) / L2, 0.0, 1.0);
    bs = min(bs, length(ps - a - ba * hs) - mix(rr.x, rr.y, mix(t0, t1, hs)));
  }
  if (n == 0) discard;

  // ── Junctions: which of these vessels are joined here, and how widely ──
  int jn = 0;
  int jm[MAXJ];
  float jk[MAXJ], jf[MAXJ], js[MAXJ];
  for (int k = 0; k < min(vR.w, 64); k++) {
    if (jn == MAXJ) break;
    vec4 A = E(vR.z + k, 0), B = E(vR.z + k, 1);
    float dc = length(p - A.xy);
    if (dc > A.z) continue;
    int mask = 0, c = 0;
    for (int m = 0; m < 4; m++) {
      if (B[m] < -0.5) continue;
      int id = int(B[m] + 0.5);
      for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == id && (mask & (1 << s)) == 0) { mask |= 1 << s; c++; }
    }
    if (c < 2) continue;
    jm[jn] = mask; js[jn] = fract(A.w) / 0.99; jk[jn] = floor(A.w) * 0.01 * (1.0 - smoothstep(0.55 * A.z, A.z, dc)); jf[jn] = 1.0 - smoothstep(0.3 * A.z, 0.85 * A.z, dc); jn++;
  }

  // ── Per-vessel attributes ──
  float stier[MAXS], sz[MAXS], sflag[MAXS], sa[MAXS], swall[MAXS], sheat[MAXS];
  vec3 scol[MAXS], shcol[MAXS], sedge[MAXS];
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * 0.5 * organK : 0.0;
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    vec4 t0 = T(sid[s], 0), t1 = T(sid[s], 1), t2 = T(sid[s], 2), t3 = T(sid[s], 3), t4 = T(sid[s], 4);
    stier[s] = t2.x; sz[s] = t2.y; sflag[s] = t2.z; swall[s] = t0.w; sheat[s] = t2.w;
    scol[s] = mix(t0.rgb, t1.rgb, clamp(su[s], 0.0, 1.0));
    vec4 tc = T(sid[s], 8);
    if (tc.w > 0.0) {
      vec4 tr = T(sid[s], 9);
      float Lv = max(T(sid[s], 5).z, 1.0), uu = su[s] * Lv;
      float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
      scol[s] = mix(scol[s], tc.rgb, k * tc.w);
    }
    shcol[s] = t2.w > 0.0 ? T(sid[s], 6).rgb : vec3(0.0);
    sedge[s] = (int(t2.z + 0.5) & ${F_EDGE}) != 0 ? T(sid[s], 6).rgb : vec3(0.0);
    float a = t1.w;
    if (t4.w > 1.5) {
      float v = length(p - t3.xy) / max(t3.z, 1e-3);
      a *= v < 0.45 ? mix(t4.y, t4.z, v / 0.45) : mix(t4.z, 0.0, clamp((v - 0.45) / 0.55, 0.0, 1.0));
    } else if (t4.w > 0.5) {
      vec2 dd = t3.zw - t3.xy;
      float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
      a *= mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
    }
    // A veiled vessel is faded all along its course, as much as an organ covering it would (behind
    // an organ, by no more than that). In its alpha, so the fade blends across its joins.
    if ((int(t2.z + 0.5) & ${F_VEIL}) != 0 && useOrgan == 1) {
      float v = 1.0 - 0.5 * organK;
      a *= tierGroup[int(t2.x + 0.5)] == 0 ? min(1.0, v / max(1.0 - occl, 1e-3)) : v;
    }
    sa[s] = a;
  }

  // ── Congestion glow: a soft halo under the network, strongest where pressure has backed up ──
  vec4 glow = vec4(0.0);
  if (heat == 1) for (int s = 0; s < MAXS; s++) {
    if (s >= n || sheat[s] <= 0.0) continue;
    float x = sd[s] + sr[s], hw = sr[s] + 11.0;
    float gv = 0.87 * (1.0 - smoothstep(hw - 18.0, hw + 18.0, x)) * sheat[s] * sa[s];
    if (gv > glow.a) glow = vec4(shcol[s] * gv, gv);
  }

  // ── Tiers, back to front ──
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  float last = -1.0;
  // The frontmost lumen (for the blood drawn in it later) and how much of it shows.
  uint gId = 0u, gId2 = 0u;
  float gS = 0.0, gY = 0.0, gW = 0.0, gS2 = 0.0, gY2 = 0.0, gB = 0.0;
  for (int it = 0; it < MAXS; it++) {
    float tt = 1e9;
    for (int s = 0; s < MAXS; s++) if (s < n && stier[s] > last && stier[s] < tt) tt = stier[s];
    if (tt > 1e8) break;
    last = tt;
    int ti = int(tt + 0.5);
    int grp = tierGroup[ti];
    // Members: this tier's vessels, and (except in the lifted tier) vessels of lower tiers that
    // share a junction with one of them, faded out with distance from that junction.
    float pres[MAXS];
    int mem = 0;
    for (int s = 0; s < MAXS; s++) { pres[s] = 0.0; if (s < n && stier[s] == tt) { mem |= 1 << s; pres[s] = 1.0; } }
    // A copy is drawn as translucent as the vessel it copies (relative to this tier), and no
    // more solid than this tier's own vessels are at the junction (one that fades into it).
    if (grp != 2) for (int j = 0; j < MAXJ; j++) {
      int own = jm[j] & mem;
      if (j >= jn || own == 0 || jf[j] <= 0.0) continue;
      float up = 0.0;
      for (int s = 0; s < MAXS; s++) if ((own & (1 << s)) != 0) up = max(up, sa[s]);
      for (int s = 0; s < MAXS; s++) {
        if (s >= n || (jm[j] & (1 << s)) == 0 || stier[s] >= tt) continue;
        int lt = int(stier[s] + 0.5);
        if (tierGroup[lt] == 2) continue;
        mem |= 1 << s;
        pres[s] = max(pres[s], jf[j] * up * min(1.0, tierAlpha[lt] / max(tierAlpha[ti], 1e-3)));
      }
    }
    // The tier's shape: plain union, filleted between vessels that share a junction.
    float D = 1e9, Ds = 1e9;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0) { D = min(D, sd[s]); Ds = min(Ds, sh[s]); }
    for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || jk[j] <= 0.0) continue;
      int jj = jm[j] & mem;
      for (int a = 0; a < MAXS; a++) {
        if ((jj & (1 << a)) == 0) continue;
        for (int b = a + 1; b < MAXS; b++) {
          if ((jj & (1 << b)) == 0) continue;
          D = min(D, smin(sd[a], sd[b], jk[j] * js[j]));
          Ds = min(Ds, smin(sh[a], sh[b], jk[j] * js[j]));
        }
      }
    }
    if (D > 8.0 + 2.0 * px && Ds > 6.0 + 2.0 * px) continue;
    // Which vessel owns this pixel: the nearest, unless it lies inside the lumen of an unjoined
    // vessel drawn above it in the tier (a crossing).
    int ow = -1;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0 && (ow < 0 || sd[s] < sd[ow])) ow = s;
    int conn = 0;
    float kc = 0.0;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || sd[s] >= 0.0 || (conn & (1 << s)) != 0 || sz[s] <= sz[ow]) continue;
      ow = s; conn = 0; kc = 0.0;
      for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    }
    conn = (conn | (1 << ow)) & mem;
    // Attributes blended across the join by the same distances (soft weights), so color,
    // caliber and shading run on through the fillet.
    float m = 1e9;
    for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0) m = min(m, sd[s]);
    float tau = 0.3 * kc + 1e-3, W = 0.0, R = 0.0, wall = 0.0, alpha = 0.0;
    vec3 col = vec3(0.0);
    vec2 g = vec2(0.0);
    for (int s = 0; s < MAXS; s++) {
      if ((conn & (1 << s)) == 0) continue;
      float w = s == ow && kc <= 0.0 ? 1.0 : exp(-(sd[s] - m) / tau);
      W += w; R += w * sr[s]; wall += w * swall[s]; alpha += w * sa[s] * pres[s]; col += w * scol[s]; g += w * sg[s];
    }
    R /= W; wall /= W; alpha /= W; col /= W;
    g = length(g) > 1e-5 ? normalize(g) : vec2(0.0);
    int flags = int(sflag[ow] + 0.5);
    bool sel = (flags & ${F_SEL}) != 0;
    float cA = (flags & ${F_NOCASE}) != 0 ? 0.0 : (flags & ${F_DOTTED}) != 0 ? 0.35 : 1.0;

    float aa = px;
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    float aC = clamp(0.5 - (D - wall) / aa, 0.0, 1.0);
    vec4 c = vec4(0.0);
    if (fx == 1 && (flags & ${F_SHADOW}) != 0) {
      float blur = sel ? 2.4 : 1.3;
      // A faint contact shadow only, so a vessel passing over another still reads as on top.
      float as = 0.4 * shadow.a * (1.0 - smoothstep(-blur, blur + aa, Ds - wall));
      c = vec4(shadow.rgb * as, as);
    }
    if (sel) { float ar = ring.a * clamp(0.5 - (D - wall - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
    c = (flags & ${F_EDGE}) != 0 ? over(vec4(sedge[ow], 1.0) * (0.92 * aC), c) : over(vec4(casing.rgb, 1.0) * (casing.a * cA * aC), c);
    vec3 lum = col;
    float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
    if (fx == 1 && (flags & ${F_DIFFUSE}) != 0 && aL > 0.0) {
      // A textbook plate, not a rendered tube: a flat lumen with one thin light line along the
      // side toward the light and one thin dark line along the other. The across-tube
      // coordinate toward the light (−1 … 1) places them, so they run on through the joins;
      // where the light runs along a vessel they fade, and on hairline vessels they are left out.
      float side = rho * dot(g, light);
      float soft = 0.06 + aa / max(R, 1e-3);
      float thin = smoothstep(1.2, 2.6, R / aa);
      float aDark = (1.0 - smoothstep(0.1, 0.1 + soft, abs(side + 0.62))) * thin;
      lum = mix(lum, shadeInk.rgb, clamp(shadeInk.a * 1.3 * aDark, 0.0, 0.5));
      if ((flags & ${F_SPEC}) != 0) {
        float aLight = (1.0 - smoothstep(0.07, 0.07 + soft, abs(side - 0.5))) * thin;
        lum = mix(lum, sheenInk.rgb, clamp(sheenInk.a * 0.75 * aLight, 0.0, 0.5));
      }
    }
    if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
    c = over(vec4(lum, 1.0) * aL, c);
    c *= alpha * tierAlpha[ti];
    float gf = grp == 0 ? 1.0 - occl : grp == 1 ? netAlpha : 1.0;
    float lumA = aL * alpha * tierAlpha[ti] * gf;
    if (lumA > 0.02 && (flags & ${F_DOTTED}) == 0) {
      // The stream shown here: the two joined lumens with the largest share, by nearness and by how
      // far past its own end each one runs (a vessel's streaks fade out beyond its end, so at a fork
      // the trunk's hand over to each branch along its own course instead of running on straight
      // across it). Equal where two lumens meet, fading over about a radius, so the stream and the
      // dye pass from one vessel into the next instead of stopping at a seam.
      float tb = max(0.7 * sr[ow], 1.5), w1 = 0.0, w2 = 0.0;
      int o1 = -1, o2 = -1;
      for (int s = 0; s < MAXS; s++) {
        if ((conn & (1 << s)) == 0 || (int(sflag[s] + 0.5) & ${F_DOTTED}) != 0) continue;
        float L2 = max(T(sid[s], 5).z, 1.0), ext = max(0.0, max(-su[s], su[s] - 1.0)) * L2;
        float wv = exp(-max(sd[s] - sd[ow], 0.0) / tb) * (s == ow ? 1.0 : pres[s]) * (1.0 - smoothstep(0.0, 1.1 * sr[s] + 1.5, ext)) + 1e-4;
        if (wv > w1) { w2 = w1; o2 = o1; w1 = wv; o1 = s; }
        else if (wv > w2) { w2 = wv; o2 = s; }
      }
      if (o1 < 0) { o1 = ow; o2 = -1; }
      int id = sid[o1];
      gId = uint(id + 1); gS = su[o1] * T(id, 5).z; gY = clamp(sx[o1] / max(sr[o1], 1e-3), -1.0, 1.0); gW = lumA;
      gId2 = 0u; gB = 0.0;
      if (o2 >= 0 && w2 > 0.01 * w1) {
        gId2 = uint(sid[o2] + 1); gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gB = w2 / (w1 + w2);
      }
    } else gW *= 1.0 - c.a * gf;
    if (grp == 0) { c *= 1.0 - occl; accB = over(c, accB); }
    else if (grp == 1) accN = over(c, accN);
    else accT = over(c, accT);
  }
  vec4 o = over(accT, over(accN * netAlpha, over(glow, accB)));
  if (o.a < 0.002) discard;
  outColor = o;
  bool fl = gId > 0u && gW > 0.01;
  outFlow = fl
    ? uvec4(gId, uint(clamp((gS + S_OFF) * 16.0, 0.0, 65535.0)), uint(clamp((gY + 1.0) * 32767.5, 0.0, 65535.0)), uint(clamp(gW, 0.0, 1.0) * 65535.0))
    : uvec4(0u);
  outFlow2 = fl && gId2 > 0u
    ? uvec4(gId2, uint(clamp((gS2 + S_OFF) * 16.0, 0.0, 65535.0)), uint(clamp((gY2 + 1.0) * 32767.5, 0.0, 65535.0)), uint(clamp(gB, 0.0, 1.0) * 65535.0))
    : uvec4(0u);
}`;

// ── Composite: the picture on screen, every frame ──
// One full-screen pass over the vessel layer (rendered above into a texture when something
// changes): the plate under it, the vessels, the blood moving in each lumen, the dye, and an
// active bleed. Only this pass runs per animation frame, so the cost of moving blood is a few
// texture reads per pixel, not the vessel shader.
//
// Blood, per lumen pixel (from the vessel layer's second target: which vessel, how far along it,
// where across it): the lumen is cut into laminar lanes (more when zoomed in), each running at its
// Poiseuille speed (2× the mean at the axis) in eighths of the mean, so one stream distance D per
// vessel moves every lane (D is kept modulo a period that is a multiple of all of them). Each lane
// is a row of slots; a slot holds a parcel when its hash is under the occupancy that makes the
// parcels crossing a section each second proportional to flow (see blood.js). Stagnant blood
// drifts and clumps (smoke); with `origin` each parcel is colored by where its blood came from.
// The HVPG catheter (stage.js builds it): tubes, discs and ellipsoids in world units, drawn over the
// picture with the same transform, so it moves with the anatomy on every frame of a pan or zoom.
// Per vertex: the world position, a direction (a tube's across, a disc's axis) and local coords
// (a tube: across −1..1 and the length along it; a disc: −1..1 on both axes).
const CATH_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 dir;
layout(location=2) in vec2 uv;
uniform mat3 world;
uniform vec2 size;
out vec2 vDir;
out vec2 vUV;
void main() {
  vec3 d = world * vec3(pos, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vDir = dir; vUV = uv;
}`;
// mode 0: soft shadow · 1: still blood column · 2: catheter shaft · 3: marker band · 4: rounded tip
// 5: balloon (translucent, lit at its rim) · 6: a reading ripple.
const CATH_FS = `#version 300 es
precision highp float;
in vec2 vDir;
in vec2 vUV;
uniform int mode;
uniform vec3 col;
uniform float alpha;
uniform vec2 light;
uniform vec2 fade;   // tubes: fade in over the first fade.x of the length, out over the last fade.y before len
uniform float len;
out vec4 o;
void main() {
  vec3 L = normalize(vec3(light * 0.85, 0.95)), H = normalize(L + vec3(0.0, 0.0, 1.0));
  float a = alpha;
  vec3 c = col, n;
  if (mode <= 3) {
    float v = clamp(vUV.x, -1.0, 1.0), e = 1.0 - abs(vUV.x);
    float aa = clamp(e / max(fwidth(vUV.x), 1e-4), 0.0, 1.0);
    a *= aa * smoothstep(0.0, max(fade.x, 1e-4), vUV.y) * clamp((len - vUV.y) / max(fade.y, 1e-4), 0.0, 1.0);
    n = vec3(vDir * v, sqrt(max(0.0, 1.0 - v * v)));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), mode == 3 ? 60.0 : 34.0);
    if (mode == 0) { a *= pow(1.0 - v * v, 1.6); }
    else if (mode == 1) {
      // Blood standing in the vein: deep at the walls, a soft sheen down its middle.
      c = col * (0.62 + 0.42 * dif) + vec3(0.16) * pow(max(dot(n, H), 0.0), 12.0);
      a *= smoothstep(0.0, 0.35, e);
    } else {
      // Polymer (2) or a metal band (3); the dark rim that draws its edge thins out when the tube is a
      // few pixels across, where it would turn the whole tube grey.
      float wpx = 2.0 / max(fwidth(vUV.x), 1e-4), rim = smoothstep(2.5, 9.0, wpx);
      if (mode == 2) {
        c = col * (0.5 + 0.56 * dif) + vec3(0.9) * sp * 0.75;
        c = mix(c, col * 0.32, smoothstep(0.7, 1.0, abs(v)) * 0.75 * rim);
      } else {
        c = col * (0.35 + 0.8 * dif) + vec3(1.0) * sp * 0.95;
        c = mix(c, col * 0.25, smoothstep(0.7, 1.0, abs(v)) * 0.6 * rim);
      }
    }
  } else {
    float r2 = dot(vUV, vUV), r = sqrt(r2);
    float aa = clamp((1.0 - r) / max(fwidth(r), 1e-4), 0.0, 1.0);
    vec2 w = vDir * vUV.x + vec2(-vDir.y, vDir.x) * vUV.y;
    float z = sqrt(max(0.0, 1.0 - r2));
    n = normalize(vec3(w, z + 1e-3));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), 34.0);
    if (mode == 4) {
      c = col * (0.46 + 0.6 * dif) + vec3(0.9) * sp * 0.75;
      c = mix(c, col * 0.3, smoothstep(0.7, 1.0, r) * 0.75);
      a *= aa;
    } else if (mode == 5) {
      // Thin latex over contrast: clear in the middle, bright at the rim, a hard highlight up-left.
      float fr = pow(1.0 - z, 1.8), sp2 = pow(max(dot(n, H), 0.0), 90.0), edge = smoothstep(0.88, 0.985, r);
      c = col * (0.66 + 0.42 * dif) + vec3(1.0) * (sp * 0.3 + sp2 * 0.9);
      c = mix(c, col * vec3(0.7, 0.6, 0.5), edge * 0.7);
      float k = 0.4 + 0.45 * fr + 0.5 * sp2 + edge * 0.35;
      a *= aa * clamp(k, 0.0, 1.0);
    } else {
      float d = abs(r - 0.86), fw = max(fwidth(r), 1e-4);
      a *= clamp((0.07 - d) / fw + 0.5, 0.0, 1.0) * 0.9 + exp(-d * d * 160.0) * 0.35;
      a *= step(r, 1.0);
    }
  }
  o = vec4(c * a, a);
}`;
const COMP_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
// The same pass over just the vessel cells (what moves between full redraws): the canvas keeps
// the rest of the picture (preserveDrawingBuffer), so a frame repaints only around the vessels.
const COMP_CELL_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;
uniform mat3 world;
uniform vec2 size;
uniform float cell;
void main() {
  vec3 d = world * vec3(org + corner * cell, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
const COMP_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D base;                // the vessel layer (premultiplied)
uniform usampler2D gbuf;               // its frontmost lumen per pixel
uniform usampler2D gbuf2;              // near a join, the lumen it joins and its share
uniform highp sampler2D flow;          // per vessel: FLOW_TEXELS texels
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform sampler2D dye;                 // per vessel: dye concentration along the course
uniform sampler2D plate0, plate1;
uniform vec4 plateRect0, plateRect1;
uniform int plates;                    // bit 0: whole plate, bit 1: sharp view
uniform float plateAlpha, plateSat;
uniform mat3 inv;                      // device pixels → world
uniform float H;                       // canvas height, device pixels
uniform float pxW;                     // world units per device pixel
uniform int blood;                     // 1: draw the blood
uniform int chev;                      // 1: flow chevrons on top (dark; orange where flow is reversed)
uniform vec3 chevInk;
uniform float flowA;                   // 0..1: how visible the moving blood and chevrons are (they fade in once the view is still)
uniform int look;                      // 0 parcels, 1 shimmer
uniform int origin;                    // 1: color parcels by where their blood came from
uniform int dyeOn;
uniform float clock;                   // seconds (wrapped), for the drift of stagnant blood
uniform vec3 originCol[5];
uniform vec3 dyeCol;
uniform vec3 revCol;                   // the moving blood's color where flow runs backwards
uniform vec3 inkLight, inkDark;
uniform vec4 bleedE[10];               // world ellipses: center, radii
uniform float bleedA[10];
uniform int bleedN;
uniform float rows;
out vec4 outColor;

const float SLOT = ${SLOT_W}.0;
const float BINS = ${DYE_BINS}.0;
const float S_OFF = ${S_OFF}.0;
const float ORIGIN_GREY = ${ORIGIN_GREY};
const int N_LAST = ${N_SAMPLES - 1};

uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
// Value noise along a periodic lattice (period cells), smooth across.
float vnoise(vec2 q, uint seed, int period) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  int x0 = int(i.x) % period; if (x0 < 0) x0 += period;
  int x1 = (x0 + 1) % period;
  uint y0 = uint(int(i.y) + 4096), y1 = y0 + 1u;
  float a = h01(seed ^ (uint(x0) * 73856093u) ^ (y0 * 19349663u)), b = h01(seed ^ (uint(x1) * 73856093u) ^ (y0 * 19349663u));
  float c = h01(seed ^ (uint(x0) * 73856093u) ^ (y1 * 19349663u)), d = h01(seed ^ (uint(x1) * 73856093u) ^ (y1 * 19349663u));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Moving blood in one lumen at arc length s (world, may run past either end) and across y (−1 … 1):
// the parcels' color and coverage, to be laid over the lumen color col.
vec4 bloodAt(int id, float s, float y, vec3 col) {
  vec4 f0 = texelFetch(flow, ivec2(0, id), 0), f1 = texelFetch(flow, ivec2(1, id), 0);
  if (f1.z <= 0.0) return vec4(0.0);
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  float R = max(texelFetch(rad, ivec2(clamp(int(clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0 + 0.5), 0, ${N_SAMPLES - 1}), id), 0).r, 0.3);
  float D = f0.x, vd = f0.y, flux = f0.z, stasis = f0.w;
  float dir = vd < 0.0 ? -1.0 : 1.0;
  // Lanes ~5 device pixels apart (more when zoomed in), parcels at least ~8 apart along a lane.
  float Lg = max(2.6, 5.0 * pxW);
  int n = clamp(int(1.7 * R / Lg), 1, 7);
  float s0 = SLOT * (pxW * 8.0 > SLOT * 2.0 ? 4.0 : pxW * 8.0 > SLOT ? 2.0 : 1.0);
  float sumK = 0.0;
  for (int i = 0; i < 7; i++) { if (i >= n) break; float yl = n == 1 ? 0.0 : ((float(i) + 0.5) / float(n) * 2.0 - 1.0) * 0.8; sumK += n == 1 ? 1.0 : max(2.0, floor(16.0 * (1.0 - yl * yl) + 0.5)) / 8.0; }
  float p = min(1.0, flux * s0 / (max(abs(vd), 2.0) * sumK));
  p = max(p, 0.45 * stasis);
  float ends = min(f1.x > 0.5 ? smoothstep(0.0, 1.5 * s0, s) : 1.0, f1.y > 0.5 ? smoothstep(0.0, 1.5 * s0, len - s) : 1.0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  bool pale = lum > 0.62 && origin == 0;   // the origin streams always take light ink
  // Parcels read as bright beads with a soft glow on a dark lumen, deep beads on a pale one.
  vec3 core = pale ? mix(col, inkDark, 0.62) : mix(col, inkLight, 0.86);
  vec3 halo = pale ? mix(col, inkDark, 0.3) : mix(col, inkLight, 0.45);
  // Flow running backwards: the moving blood warms to orange (not over the origin streams, whose
  // amber it would be lost in).
  float rev = origin == 1 ? 0.0 : f1.w;
  if (rev > 0.0) { core = mix(core, mix(revCol, inkLight, 0.18), rev); halo = mix(halo, mix(col, revCol, 0.7), rev); }
  float laneW = 1.6 * R / float(n);
  if (look == 0) {
    // Beads with a short tail behind them (longer where faster), scattered within their lane so
    // the stream reads as a suspension, not a string of beads.
    // The two lanes either side of this point: a bead reaches under one lane spacing from its own
    // lane (radius, jitter and drift), so no other lane can touch it.
    int l0 = n == 1 ? 0 : int(floor((y / 0.8 + 1.0) * 0.5 * float(n) - 0.5));
    float rd = max(0.26 * laneW, 1.35 * pxW) * (1.0 + 0.6 * stasis);
    rd = min(rd, 0.45 * R);
    float TL = rd * (1.6 + 4.0 * clamp(abs(vd) / 60.0, 0.0, 1.0)) * (1.0 - stasis);
    float aa = 0.75 * pxW + stasis * 0.8 * rd;
    float period = 256.0 * s0;
    float cov = 0.0, glow = 0.0;
    for (int dl = 0; dl <= 1; dl++) {
      int li = l0 + dl;
      if (li < 0 || li >= n) continue;
      float yl = n == 1 ? 0.0 : ((float(li) + 0.5) / float(n) * 2.0 - 1.0) * 0.8;
      float k = n == 1 ? 8.0 : max(2.0, floor(16.0 * (1.0 - yl * yl) + 0.5));
      uint lseed = uint(id) * 7919u + uint(li) * 131u;
      float laneD = mod(D * k / 8.0 + h01(lseed) * period, period);
      float q = (s - laneD) / s0;
      // This slot and the nearer neighbour (a bead's jitter and tail reach at most one slot over).
      for (int j = 0; j < 2; j++) {
        float slot = floor(q) + (j == 0 ? 0.0 : fract(q) < 0.5 ? -1.0 : 1.0);
        uint seed = lseed ^ (uint(int(slot) & 255) * 2654435761u);
        float hv = h01(seed);
        float pp = p;
        if (stasis > 0.0) pp *= mix(1.0, 0.25 + 1.5 * vnoise(vec2((slot * s0 + laneD) / 40.0 + clock * 0.04, float(li)), uint(id) * 977u, 1 << 20), stasis);
        float on = clamp((pp - hv) / 0.06, 0.0, 1.0);
        if (on <= 0.0) continue;
        float ja = (h01(seed + 1u) - 0.5) * 0.7 * s0 + stasis * 0.32 * s0 * sin(clock * 0.55 + hv * 40.0);
        float jy = (h01(seed + 2u) - 0.5) * 0.8 * laneW + stasis * 0.3 * laneW * cos(clock * 0.4 + hv * 23.0);
        float ax = ((q - slot - 0.5) * s0 - ja) * dir, dy = (y - yl) * R - jy;
        float d, fade = 1.0;
        if (ax >= 0.0 || TL <= 0.0) d = length(vec2(ax, dy)) - rd;
        else {
          float t = -ax / TL;
          d = t > 1.0 ? 1e3 : abs(dy) - rd * (1.0 - 0.75 * t);
          fade = (1.0 - t) * (1.0 - t);
        }
        float w = on * (0.8 + 0.2 * h01(seed + 4u));
        float c = (1.0 - smoothstep(-aa, aa, d)) * fade * w;
        // A soft glow just around the bead (none on its tail), so it stands off the lumen.
        float gl = (1.0 - smoothstep(0.0, 1.3 * rd + pxW, max(d, 0.0))) * (ax >= 0.0 ? 1.0 : fade) * w;
        if (c > cov || gl > glow) {
          if (c > cov) cov = c;
          if (gl > glow) glow = gl;
        }
      }
    }
    float strength = ends * f1.z * mix(1.0, 0.5, stasis);
    float ga = glow * 0.38 * strength, ca = cov * (origin == 1 ? 0.85 : 0.94) * strength;
    // The bead over its glow.
    vec3 rgb = mix(halo, core, ca / max(ca + ga * (1.0 - ca), 1e-4));
    return vec4(rgb, ca + ga * (1.0 - ca));
  }
  // Shimmer: long, soft streaks of light, like light on a flowing liquid, each carried at its own
  // lane's laminar speed (fastest on the axis, so the sheen visibly shears), over a faint glow
  // along the core. Brighter and denser where more blood passes; stagnant blood barely stirs.
  float ay = clamp(abs(y), 0.0, 1.0), yl = ay * 0.8;
  float k8 = max(2.0, 16.0 * (1.0 - yl * yl));
  float k0 = floor(k8), t = smoothstep(0.2, 0.8, k8 - k0), period = 256.0 * s0;
  float cellA = 5.12 * s0;                // 50 cells a period: the noise wraps with the stream
  int per = 50;
  float qy = y * R / max(0.55 * laneW, 3.2 * pxW);
  float drift = stasis * clock * 0.06;
  vec2 qa = vec2((s - mod(D * k0 / 8.0, period)) / cellA + drift, qy);
  vec2 qb = vec2((s - mod(D * (k0 + 1.0) / 8.0, period)) / cellA + drift, qy);
  uint sd0 = uint(id) * 31u, sd1 = uint(id) * 57u + 11u;
  // Between two lane speeds the two fields are blended; most pixels need only one.
  // The fine octave is left out where its features are under a pixel and a half (replaced by its mean, so the level holds).
  // It fades out over a range of zoom rather than switching off at one, so the sheen never pops.
  float fw = smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5);
  bool fine = fw > 0.0;
  float na = t < 1.0 ? 0.62 * vnoise(qa, sd0, per) + 0.38 * (fine ? mix(0.5, vnoise(qa * vec2(2.0, 1.7) + vec2(0.0, 7.3), sd1, per * 2), fw) : 0.5) : 0.0;
  float nb = t > 0.0 ? 0.62 * vnoise(qb, sd0, per) + 0.38 * (fine ? mix(0.5, vnoise(qb * vec2(2.0, 1.7) + vec2(0.0, 7.3), sd1, per * 2), fw) : 0.5) : 0.0;
  float nz = mix(na, nb, t);
  float dens = sqrt(clamp(p, 0.0, 1.0));
  // Soft-edged and subdued, so up close the sheen reads as moving light, not as stripes painted on the tube;
  // a steady glow along the axis carries most of the brightness.
  float streak = smoothstep(0.46 - 0.08 * dens, 0.9, nz);
  float wall = 1.0 - smoothstep(0.7, 1.0, ay);
  float glowCore = 0.22 * (1.0 - ay * ay) * (1.0 - ay * ay);
  float a = clamp(streak * (0.32 + 0.26 * dens) + glowCore, 0.0, 0.75) * wall * ends * f1.z * mix(1.0, 0.6, stasis);
  return vec4(mix(halo, core, smoothstep(0.0, 0.7, streak)), a);
}
// Where a lumen's blood comes from, as streams side by side (laminar flow keeps them apart): SMV,
// IMV, splenic vein, hepatic artery, then the rest of the body, each as wide as its share of the flow.
vec3 originAt(int id, float y, float R) {
  vec4 f2 = texelFetch(flow, ivec2(2, id), 0);
  float u = clamp((y + 1.0) * 0.5, 0.0, 1.0), e = clamp(0.6 * pxW / max(R, 0.3), 0.01, 0.12);
  float c1 = f2.x, c2 = c1 + f2.y, c3 = c2 + f2.z, c4 = c3 + f2.w;
  vec3 c = originCol[0];
  c = mix(c, originCol[1], smoothstep(c1 - e, c1 + e, u));
  c = mix(c, originCol[2], smoothstep(c2 - e, c2 + e, u));
  c = mix(c, originCol[3], smoothstep(c3 - e, c3 + e, u));
  c = mix(c, originCol[4], smoothstep(c4 - e, c4 + e, u));
  return c;
}
// Flow arrowheads along the axis, pointing and moving with the mean flow: a slim filled head with
// a notched back. Returns its coverage (x) and a soft rim just outside it (y).
vec2 chevAt(int id, float s, float y) {
  vec4 f0 = texelFetch(flow, ivec2(0, id), 0), f1 = texelFetch(flow, ivec2(1, id), 0);
  if (f1.z <= 0.0) return vec2(0.0);
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  // One size and one spacing for the whole vessel (from its caliber midway), so every head is the
  // same shape and they keep an even distance; they move at the vessel's own speed, whatever the zoom.
  float R = max(texelFetch(rad, ivec2(N_LAST / 2, id), 0).r, 0.3);
  if (R < 1.3 * pxW) return vec2(0.0);
  float vd = f0.y, dir = vd < 0.0 ? -1.0 : 1.0;
  // Spacing: a power-of-two multiple of 28 world units (it divides the stream's period: no jump on
  // wrap), at least ~60 px on screen. Zooming out, every other head fades away before the spacing
  // doubles (the coarser heads are a subset of the finer ones), so nothing jumps or pops.
  float lv = max(0.0, log2(max(3.6 * R, 60.0 * pxW) / 28.0)), n = floor(lv), fr = lv - n;
  float P = 28.0 * exp2(n), Pc = 28.0 * exp2(lv);
  float x = mod(s - f0.x + 0.5 * P, P) - 0.5 * P, u = x * dir;
  float Rs = max(texelFetch(rad, ivec2(clamp(int(clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0 + 0.5), 0, N_LAST), id), 0).r, 0.3);
  float ay = abs(y) * Rs;
  float sc = s - x;
  float odd = mod(floor((sc - f0.x) / P + 0.5), 2.0);
  float keep = odd > 0.5 ? 1.0 - smoothstep(0.15, 0.85, fr) : 1.0;
  // Sized to the lumen where the head sits, so none overhangs a narrowing vessel.
  float Rl = max(texelFetch(rad, ivec2(clamp(int(clamp(sc / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0 + 0.5), 0, N_LAST), id), 0).r, 0.3);
  float hw = min(0.86 * R, 0.2 * Pc), L = 1.6 * hw;            // half width, length: one fixed shape per vessel, never stretched
  float tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L;
  // Inside when behind both slanted sides and ahead of the notched back.
  float k = L / hw;
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  float d = max(max(side, rear), ay - hw);
  // Toward either end a head fades out (and the next vessel's fade in), never cut by a join.
  float e = min(sc, len - sc);
  if (e < 0.6 * L) return vec2(0.0);
  float fade = smoothstep(0.5, 3.0, abs(vd)) * f1.z * keep * smoothstep(0.6 * L, 0.6 * L + max(2.0 * L, 0.3 * Pc), e) * smoothstep(1.3 * pxW, 2.4 * pxW, R);
  // Where the lumen is narrower than the head, the head fades out instead of squeezing to fit.
  fade *= smoothstep(0.85 * hw, 1.15 * hw, Rl);
  float c = 1.0 - smoothstep(-0.7 * pxW, 0.7 * pxW, d);
  float rim = (1.0 - smoothstep(0.0, 1.8 * pxW + 0.1 * hw, d)) * (1.0 - c);
  return vec2(c, rim) * fade;
}
// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall
// (laminar flow).
float dyeAt(int id, float s, float y) {
  float vd = texelFetch(flow, ivec2(0, id), 0).y;
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  float R = max(texelFetch(rad, ivec2(clamp(int(clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0 + 0.5), 0, ${N_SAMPLES - 1}), id), 0).r, 0.3);
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float sp = s - dir * (2.0 * (1.0 - y * y) - 1.0) * 1.4 * R;
  float u = clamp(sp / len, 0.0, 1.0);
  return texture(dye, vec2((u * (BINS - 1.0) + 0.5) / BINS, (float(id) + 0.5) / rows)).r;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec2 w = (inv * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0)).xy;
  // The plate: the sharp view raster where it lies, else the whole-plate one.
  vec4 pl = vec4(0.0);
  if ((plates & 2) != 0) {
    vec2 uv = (w - plateRect1.xy) / plateRect1.zw;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) pl = texture(plate1, uv);
    else if ((plates & 1) != 0) pl = texture(plate0, (w - plateRect0.xy) / plateRect0.zw);
  } else if ((plates & 1) != 0) {
    vec2 uv = (w - plateRect0.xy) / plateRect0.zw;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) pl = texture(plate0, uv);
  }
  if (pl.a > 0.0) { float l = dot(pl.rgb / pl.a, vec3(0.299, 0.587, 0.114)); pl = vec4(mix(vec3(l) * pl.a, pl.rgb, plateSat), pl.a) * plateAlpha; }

  vec4 v = texelFetch(base, ip, 0);
  uvec4 g = texelFetch(gbuf, ip, 0);
  float vis = g.x > 0u ? clamp(float(g.w) / 65535.0 / max(v.a, 1e-3), 0.0, 1.0) : 0.0;
  if ((blood == 1 || dyeOn == 1 || chev == 1 || origin == 1) && (vis > 0.005 || (dyeOn == 1 && g.x > 0u)) && v.a > 0.01) {
    vec3 col = v.rgb / v.a;
    // This lumen, and near a join the one it joins, cross-faded by its share.
    uvec4 g2 = texelFetch(gbuf2, ip, 0);
    float b = g2.x > 0u ? float(g2.w) / 65535.0 : 0.0;
    int id1 = int(g.x) - 1, id2 = int(g2.x) - 1;
    float s1 = float(g.y) / 16.0 - S_OFF, y1 = float(g.z) / 32767.5 - 1.0;
    float s2 = float(g2.y) / 16.0 - S_OFF, y2 = float(g2.z) / 32767.5 - 1.0;
    if (origin == 1) {
      // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey.
      float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / ORIGIN_GREY, 0.55, 1.45);
      // A vessel that carries no blood (origin fractions marked −1, e.g. a lymphatic) keeps its own color.
      vec3 oc = texelFetch(flow, ivec2(2, id1), 0).x < -0.5 ? col : min(originAt(id1, y1, max(texelFetch(rad, ivec2(N_LAST / 2, id1), 0).r, 0.3)) * shade, vec3(1.0));
      if (b > 0.004) oc = mix(oc, texelFetch(flow, ivec2(2, id2), 0).x < -0.5 ? col : min(originAt(id2, y2, max(texelFetch(rad, ivec2(N_LAST / 2, id2), 0).r, 0.3)) * shade, vec3(1.0)), b);
      col = mix(col, oc, vis);
    }
    if (blood == 1) {
      // One streak field (the dominant lumen's), eased down toward the join, so two patterns never ghost over each other.
      vec4 A = bloodAt(id1, s1, y1, col);
      float a = A.a * (1.0 - 0.6 * smoothstep(0.02, 0.5, b));
      if (a > 0.0) col = mix(col, A.rgb, clamp(a * vis * flowA, 0.0, 1.0));
    }
    if (dyeOn == 1) {
      float c = dyeAt(id1, s1, y1) * (1.0 - b) + (b > 0.004 ? dyeAt(id2, s2, y2) * b : 0.0);
      // A rich, slightly glowing column: the dye tints the lumen and lifts it a little.
      // The wall line across a join (the end cap of the vessel) knocks vis to zero, which read as a seam; across
      // the lumen (away from the side walls) the dye fills regardless, and along the walls it follows vis.
      float inLumen = 1.0 - smoothstep(0.6, 0.85, abs(y1));
      col = mix(col, dyeCol, clamp(c, 0.0, 1.0) * 0.9 * max(smoothstep(0.0, 0.2, vis), inLumen));
    }
    if (chev == 1) {
      vec2 c = chevAt(id1, s1, y1);
      c *= 1.0 - smoothstep(0.02, 0.25, b);   // none where another vessel joins
      if (c.x + c.y > 0.0) {
        float rv = texelFetch(flow, ivec2(1, id1), 0).w;
        // A faint light rim lifts the head off the lumen; the head itself dark, or orange if reversed.
        col = mix(col, inkLight, c.y * 0.75 * vis * flowA);
        col = mix(col, mix(chevInk, revCol, rv), c.x * vis * flowA);
      }
    }
    v = vec4(col * v.a, v.a);
  }
  vec4 o = over(v, pl);
  for (int i = 0; i < 10; i++) {
    if (i >= bleedN) break;
    vec2 d = (w - bleedE[i].xy) / max(bleedE[i].zw, vec2(1e-3));
    float r = length(d), aa = pxW / max(min(bleedE[i].z, bleedE[i].w), 1e-3);
    float a = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, r)) * bleedA[i];
    o = over(vec4(vec3(150.0, 14.0, 34.0) / 255.0 * a, a), o);
  }
  outColor = o;
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

function dataTex(gl, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Distance from point (px, py) to segment a→b.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(ax + dx * h - px, ay + dy * h - py);
}

/**
 * Bins vessels into cells. `tubes`: [{ id (row), pts: [[x, y]] × N_SAMPLES, reach }] where reach
 * is how far from the centerline the vessel can draw (radius, casing, shadow, fillet, glow);
 * `joins`: [{ x, y, reach, k, members: [row, …] (≤ 4) }]. Returns the entry texels and the cells.
 */
export function binVeins(tubes, joins) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tubes) for (const [x, y] of t.pts) { x0 = Math.min(x0, x - t.reach); y0 = Math.min(y0, y - t.reach); x1 = Math.max(x1, x + t.reach); y1 = Math.max(y1, y + t.reach); }
  if (!tubes.length) return { ent: new Float32Array(0), rows: 1, cells: new Float32Array(0), nCells: 0, nEnt: 0 };
  x0 = Math.floor(x0 / CELL) * CELL; y0 = Math.floor(y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const HALF = CELL * Math.SQRT1_2;
  // Pass 1: (cell, tube, sample) triples in vessel-major order, so a cell's list stays grouped by vessel.
  let cap = 1 << 16, nSeg = 0, cellOf = new Int32Array(cap), tubeOf = new Int32Array(cap), segOf = new Int32Array(cap);
  const push = (c, t, i) => {
    if (nSeg === cap) {
      cap *= 2;
      const grow = (a) => { const b = new Int32Array(cap); b.set(a); return b; };
      cellOf = grow(cellOf); tubeOf = grow(tubeOf); segOf = grow(segOf);
    }
    cellOf[nSeg] = c; tubeOf[nSeg] = t; segOf[nSeg] = i; nSeg++;
  };
  for (let ti = 0; ti < tubes.length; ti++) {
    const { pts, reach } = tubes[ti];
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - y0) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        if (segDist(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, ax, ay, bx, by) > reach + HALF) continue;
        push(cy * nx + cx, ti, i);
      }
    }
  }
  const jCell = [];
  joins.forEach((j, ji) => {
    const cx0 = Math.max(0, Math.floor((j.x - j.reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((j.x + j.reach - x0) / CELL));
    const cy0 = Math.max(0, Math.floor((j.y - j.reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((j.y + j.reach - y0) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (Math.hypot(x0 + (cx + 0.5) * CELL - j.x, y0 + (cy + 0.5) * CELL - j.y) > j.reach + HALF) continue;
      jCell.push(cy * nx + cx, ji);
    }
  });
  // Pass 2: counting sort by cell (stable).
  const NC = nx * ny, segCount = new Int32Array(NC), jCount = new Int32Array(NC);
  for (let k = 0; k < nSeg; k++) segCount[cellOf[k]]++;
  for (let k = 0; k < jCell.length; k += 2) jCount[jCell[k]]++;
  const segStart = new Int32Array(NC), jStart = new Int32Array(NC);
  let o = 0, nCells = 0;
  for (let c = 0; c < NC; c++) { segStart[c] = o; o += segCount[c]; if (segCount[c]) nCells++; }
  for (let c = 0; c < NC; c++) { jStart[c] = o; o += segCount[c] ? jCount[c] : 0; }
  const nEnt = o;
  const rows = Math.max(1, Math.ceil((nEnt * 2) / ENT_W));
  const ent = new Float32Array(rows * ENT_W * 4);
  const fillS = segStart.slice(), fillJ = jStart.slice();
  for (let k = 0; k < nSeg; k++) {
    const e = fillS[cellOf[k]]++, t = tubes[tubeOf[k]], i = segOf[k], a = t.pts[i], b = t.pts[i + 1], q = e * 8;
    ent[q] = a[0]; ent[q + 1] = a[1]; ent[q + 2] = b[0]; ent[q + 3] = b[1];
    ent[q + 4] = t.id; ent[q + 5] = i;
  }
  for (let k = 0; k < jCell.length; k += 2) {
    const c = jCell[k];
    if (!segCount[c]) continue;
    const e = fillJ[c]++, j = joins[jCell[k + 1]], q = e * 8;
    ent[q] = j.x; ent[q + 1] = j.y; ent[q + 2] = j.reach; ent[q + 3] = Math.round(j.k * 100) + 0.99 * Math.min(1, Math.max(0, j.fillet ?? 1));   // the blend width, and (as the fraction) how much of it rounds the shape
    for (let m = 0; m < 4; m++) ent[q + 4 + m] = j.members[m] ?? -1;
  }
  const cells = new Float32Array(nCells * 6);
  let ci = 0;
  for (let c = 0; c < NC; c++) {
    if (!segCount[c]) continue;
    cells[ci] = x0 + (c % nx) * CELL; cells[ci + 1] = y0 + Math.floor(c / nx) * CELL;
    cells[ci + 2] = segStart[c]; cells[ci + 3] = segCount[c]; cells[ci + 4] = jStart[c]; cells[ci + 5] = jCount[c];
    ci += 6;
  }
  return { ent, rows, cells, nCells, nEnt };
}

export function createVeinsGL(canvas, { tubes: nTubes, force = false }) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: !force }); } catch { gl = null; }
  if (!gl) return null;
  let prog;
  try { prog = compile(gl, VS, FS); } catch (e) { console.warn('Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.', e); return null; }
  const { p, u } = prog;
  let comp, compCell;
  try { comp = compile(gl, COMP_VS, COMP_FS); compCell = compile(gl, COMP_CELL_VS, COMP_FS); } catch (e) { console.warn('Veins renderer: composite shader failed.', e); return null; }
  const plates = [null, null];   // [whole plate, sharp view] : { tex, rect }
  let cathP = null;
  try { cathP = compile(gl, CATH_VS, CATH_FS); } catch (e) { console.warn('Veins renderer: catheter shader failed.', e); }
  const cathBuf = gl.createBuffer(), cathVAO = gl.createVertexArray();
  gl.bindVertexArray(cathVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, cathBuf);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 2, gl.FLOAT, false, 24, i * 8); }
  gl.bindVertexArray(null);
  let cath = null, cathWas = false;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  const cellBuf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  const compVAO = gl.createVertexArray();
  gl.bindVertexArray(compVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const entTex = dataTex(gl), radTex = dataTex(gl), tubeTex = dataTex(gl), organTex = dataTex(gl, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, radTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, N_SAMPLES, nTubes, 0, gl.RG, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, tubeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TUBE_TEXELS, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, organTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  const radRow = new Float32Array(N_SAMPLES * 2);
  // Per-vessel blood (FLOW_TEXELS texels a row) and dye (DYE_BINS along the course).
  const flowTex = dataTex(gl), dyeTex = dataTex(gl, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, flowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, FLOW_TEXELS, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, dyeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, DYE_BINS, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(DYE_BINS * nTubes));
  // The vessel layer, rendered when something changes: its color, and the lumen buffer.
  const fbo = gl.createFramebuffer();
  const baseTex = dataTex(gl), gTex = dataTex(gl), gTex2 = dataTex(gl);
  let fboW = 0, fboH = 0, baseM = null, dyeAny = false, wasBleeding = false;
  function ensureFBO() {
    if (fboW === canvas.width && fboH === canvas.height) return;
    fboW = canvas.width; fboH = canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, fboW, fboH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, gTex2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, fboW, fboH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, gTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, gTex2, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function drawCath(m) {
    const U = cathP.u;
    gl.useProgram(cathP.p);
    gl.uniformMatrix3fv(U.world, false, new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]));
    gl.uniform2f(U.size, canvas.width, canvas.height);
    gl.uniform2f(U.light, ...(cath.light || [-0.42, -0.91]));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(cathVAO);
    for (const d of cath.draws) {
      gl.uniform1i(U.mode, d.mode);
      gl.uniform3f(U.col, ...d.col);
      gl.uniform1f(U.alpha, d.alpha);
      gl.uniform2f(U.fade, ...(d.fade || [0, 0]));
      gl.uniform1f(U.len, d.len ?? 1e9);
      gl.drawArrays(gl.TRIANGLE_STRIP, d.first, d.count);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  let nCells = 0, lost = false, organRect = null;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  // A software renderer (no usable GPU: the browser draws on the CPU) is told apart so the stage
  // can draw less often and at a lower resolution there.
  let software;
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    software = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  } catch { software = false; }

  return {
    get lost() { return lost; },
    /** Whether the browser renders WebGL on the CPU. */
    software,
    /** Uploads the binned geometry (from binVeins). */
    setGeometry(bins) {
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, bins.rows || 1, 0, gl.RGBA, gl.FLOAT, bins.ent.length ? bins.ent : new Float32Array(ENT_W * 4));
      gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
      gl.bufferData(gl.ARRAY_BUFFER, bins.cells, gl.STATIC_DRAW);
      nCells = bins.nCells;
    },
    /** A vessel's lumen radius at each of its N_SAMPLES samples. */
    setRadii(row, r) {
      for (let i = 0; i < N_SAMPLES; i++) { radRow[i * 2] = r[i]; radRow[i * 2 + 1] = r[Math.min(N_SAMPLES - 1, i + 1)]; }
      gl.bindTexture(gl.TEXTURE_2D, radTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, N_SAMPLES, 1, gl.RG, gl.FLOAT, radRow);
    },
    /** Every vessel's attributes: nTubes × TUBE_TEXELS × 4 floats. */
    setTubes(data) {
      gl.bindTexture(gl.TEXTURE_2D, tubeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TUBE_TEXELS, nTubes, gl.RGBA, gl.FLOAT, data);
    },
    /** The organ covers as a world-space bitmap (alpha) and the world rectangle it spans. */
    setOrgans(bitmap, rect) {
      gl.bindTexture(gl.TEXTURE_2D, organTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      organRect = rect;
    },
    /** A plate raster (0: the whole plate, 1: a sharper one of the view) and the world rectangle it spans. */
    setPlate(slot, source, rect) {
      const t = plates[slot]?.tex || dataTex(gl, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      plates[slot] = { tex: t, rect };
    },
    dropPlate(slot) { if (plates[slot]) { gl.deleteTexture(plates[slot].tex); plates[slot] = null; } },
    hasPlate: (slot) => !!plates[slot],
    /** Per-vessel blood: nTubes × FLOW_TEXELS × 4 floats (see stage.js). */
    setFlow(data) {
      gl.bindTexture(gl.TEXTURE_2D, flowTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FLOW_TEXELS, nTubes, gl.RGBA, gl.FLOAT, data);
    },
    /** Dye along each vessel: nTubes × DYE_BINS floats, or null when there is none. */
    setDye(data) {
      dyeAny = !!data;
      if (!data) return;
      gl.bindTexture(gl.TEXTURE_2D, dyeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DYE_BINS, nTubes, gl.RED, gl.FLOAT, data);
    },
    /**
     * Renders the vessel layer (offscreen) and then the picture. `m`: world → device-pixel
     * transform [a, b, c, d, e, f]; `look`: the theme's inks and the per-tier opacity and group.
     */
    draw(m, look, blood) {
      ensureFBO();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fboW, fboH);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.clearBufferuiv(gl.COLOR, 1, [0, 0, 0, 0]);
      gl.clearBufferuiv(gl.COLOR, 2, [0, 0, 0, 0]);
      gl.disable(gl.BLEND);
      baseM = m;
      if (nCells) {
        const M = new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
        gl.useProgram(p);
        gl.uniformMatrix3fv(u.world, false, M);
        gl.uniform2f(u.size, canvas.width, canvas.height);
        gl.uniform1f(u.cell, CELL);
        gl.uniform1f(u.px, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
        gl.uniform1f(u.reachU, look.reach);
        gl.uniform2f(u.shOff, ...look.shOff);
        gl.uniform4f(u.casing, ...look.casing);
        gl.uniform4f(u.shadow, ...look.shadow);
        gl.uniform4f(u.sheenInk, ...look.sheen);
        gl.uniform4f(u.shadeInk, ...look.shade);
        gl.uniform4f(u.ring, ...look.ring);
        gl.uniform2f(u.light, ...look.light);
        gl.uniform1f(u.netAlpha, look.netAlpha);
        gl.uniform1i(u.fx, look.fx ? 1 : 0);
        gl.uniform1i(u.heat, look.heat ? 1 : 0);
        gl.uniform1fv(u.tierAlpha, look.tierAlpha);
        gl.uniform1iv(u.tierGroup, look.tierGroup);
        gl.uniform1i(u.useOrgan, look.organs > 0 && organRect ? 1 : 0);
        gl.uniform1f(u.organK, +look.organs || 0);
        if (organRect) gl.uniform4f(u.organRect, ...organRect);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, entTex); gl.uniform1i(u.ent, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, radTex); gl.uniform1i(u.rad, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tubeTex); gl.uniform1i(u.tube, 2);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, organTex); gl.uniform1i(u.organ, 3);
        gl.bindVertexArray(vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nCells);
        gl.bindVertexArray(null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.composite(look, blood, true);
    },
    /**
     * The picture from the last vessel layer: plate, vessels, blood, dye, bleed. Cheap; runs
     * every animation frame. `blood`: { on, look, origin, clock, originCol, dyeCol, inkLight,
     * inkDark, bleed: [[x, y, rx, ry, alpha]] }.
     */
    composite(look, blood = {}, full = false) {
      if (!baseM || fboW !== canvas.width || fboH !== canvas.height) return;
      // A bleed sprays outside the vessels: the whole picture is repainted while it lasts, and once after.
      const bleeding = !!blood.bleed?.length;
      if (bleeding || wasBleeding) full = true;
      // So does the catheter (it reaches past the vessel cells), and once after it is gone.
      if (cath || cathWas) full = true;
      cathWas = !!cath;
      wasBleeding = bleeding;
      if (!full && !nCells) return;
      const m = baseM, det = m[0] * m[3] - m[1] * m[2] || 1e-9;
      // device → world: the inverse of [a c e; b d f].
      const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
      const ie = -(ia * m[4] + ic * m[5]), iff = -(ib * m[4] + id * m[5]);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      const prg = full ? comp : compCell;
      gl.useProgram(prg.p);
      const U = prg.u;
      if (!full) {
        gl.uniformMatrix3fv(U.world, false, new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]));
        gl.uniform2f(U.size, canvas.width, canvas.height);
        gl.uniform1f(U.cell, CELL);
      }
      gl.uniformMatrix3fv(U.inv, false, new Float32Array([ia, ib, 0, ic, id, 0, ie, iff, 1]));
      gl.uniform1f(U.H, canvas.height);
      gl.uniform1f(U.pxW, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
      const pm = (look.plate ? (plates[0] ? 1 : 0) | (plates[1] ? 2 : 0) : 0);
      gl.uniform1i(U.plates, pm);
      gl.uniform1f(U.plateAlpha, look.plate?.alpha ?? 0);
      gl.uniform1f(U.plateSat, look.plate?.sat ?? 1);
      gl.uniform4f(U.plateRect0, ...(plates[0]?.rect || [0, 0, 1, 1]));
      gl.uniform4f(U.plateRect1, ...(plates[1]?.rect || [0, 0, 1, 1]));
      gl.uniform1i(U.blood, blood.on ? 1 : 0);
      gl.uniform1i(U.chev, blood.chev ? 1 : 0);
      gl.uniform1f(U.flowA, blood.alpha ?? 1);
      gl.uniform3f(U.chevInk, ...(blood.chevInk || [0.08, 0.08, 0.1]));
      gl.uniform1i(U.look, blood.look === 'shimmer' ? 1 : 0);
      gl.uniform1i(U.origin, blood.origin ? 1 : 0);
      gl.uniform1i(U.dyeOn, dyeAny && blood.dye !== false ? 1 : 0);
      gl.uniform1f(U.clock, blood.clock || 0);
      gl.uniform1f(U.rows, nTubes);
      gl.uniform3fv(U.originCol, new Float32Array((blood.originCol || [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]).flat()));
      gl.uniform3f(U.dyeCol, ...(blood.dyeCol || [0.8, 0.95, 0.2]));
      gl.uniform3f(U.revCol, ...(blood.revCol || [1, 0.55, 0.16]));
      gl.uniform3f(U.inkLight, ...(blood.inkLight || [1, 1, 1]));
      gl.uniform3f(U.inkDark, ...(blood.inkDark || [0.1, 0.1, 0.16]));
      const bl = blood.bleed || [];
      const be = new Float32Array(40), ba = new Float32Array(10);
      bl.slice(0, 10).forEach((b, i) => { be.set(b.slice(0, 4), i * 4); ba[i] = b[4]; });
      gl.uniform4fv(U.bleedE, be);
      gl.uniform1fv(U.bleedA, ba);
      gl.uniform1i(U.bleedN, Math.min(10, bl.length));
      const bind = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U[name], unit); };
      bind(0, baseTex, 'base'); bind(1, gTex, 'gbuf'); bind(2, flowTex, 'flow'); bind(3, radTex, 'rad'); bind(4, tubeTex, 'tube');
      bind(5, dyeTex, 'dye'); bind(6, plates[0]?.tex || baseTex, 'plate0'); bind(7, plates[1]?.tex || baseTex, 'plate1'); bind(8, gTex2, 'gbuf2');
      if (full) {
        gl.bindVertexArray(compVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        gl.bindVertexArray(vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nCells);
      }
      gl.bindVertexArray(null);
      if (cath) drawCath(m);
    },
    /** Whether the catheter can be drawn here (else stage.js keeps its SVG one). */
    get canCath() { return !!cathP; },
    /**
     * The HVPG catheter, or null: { verts: Float32Array (x, y, dirX, dirY, u, v per vertex),
     * draws: [{ mode, first, count, col: [r, g, b], alpha, fade: [in, out], len }], light: [x, y] }.
     */
    setCath(spec) {
      cath = cathP && spec?.draws?.length ? spec : null;
      if (!cath) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, cathBuf);
      gl.bufferData(gl.ARRAY_BUFFER, cath.verts, gl.DYNAMIC_DRAW);
    },
    clear() { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); nCells = 0; baseM = null; },
    /** The current picture as a PNG data URL (call right after draw, in the same task). */
    snapshot() { return canvas.toDataURL('image/png'); },
  };
}
