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
// Shape apart from colour: beside each pixel's colour the shader notes whether any lumen colour reaches it (a fourth
// target). A change of some vessels' lumen colours alone (the pulse, the lymph's tint) then draws again only the pixels
// so marked, in the cells that list those vessels, with this same shader (see tintPass): every other pixel's colour does
// not depend on them, so it is already what a whole draw would give. The picture is the one a whole draw makes, pixel
// for pixel, without drawing the shape-only pixels (casings, shadows, the space between vessels) again.
//
// The moving blood (see blood.js) is drawn by the composite pass further down, from a lumen buffer
// this shader writes beside the color.
//
// createVeinsGL(canvas) returns null only when WebGL2 is unavailable altogether.

import { CHEV_GLSL } from './chevron-glsl.js?v=96ec7c6666';
import { SLOT, DYE_BINS } from './blood.js?v=7fa561f952';
import { cssRGB } from './util.js?v=77c14494a8';
import { LUMEN, STO_Y0, STO_DY, STO_N } from './stomach-lumen.js?v=4fce52c62f';
import { CELL, ENT_W, binVeins, splitRows, simpleCells, splitCells } from './veins-bin.js?v=e0eed8226f';
import { gpuProbe, COUNTED } from './gpu-probe.js?v=caac436485';
import { changedRows } from './flow-rows.js?v=bea4089714';
import { createOrganStack } from './organs-gl.js?v=50a7580426';

export { binVeins };

export const N_SAMPLES = 64;
export const FLOW_TEXELS = 4;          // per-vessel blood: see stage.js (syncBlood)
const SLOT_W = SLOT;
export const TUBE_TEXELS = 13;         // texels of per-vessel attributes (see the layout below)
export const MAX_TIERS = 20;
const S_OFF = 96;                      // arc length is stored offset by this, so it can run on past a vessel's start
export const ORIGIN_GREY = 0.62;       // the lumen's color while the blood is colored by origin
// The streaks' density divisor: the lanes' weights summed, for each whole lane count 1 … 7 (lane i of n stands at
// yl = ((i + 0.5) / n · 2 − 1) · 0.8 and weighs max(2, round(16 (1 − yl²))) / 8). The shader and the lobule read it between
// the counts, from the same continuous count as the lane width, so the density never steps as the count moves with
// zoom, a taper or the breath (round 2 review, BM9).
export const LANE_K = Array.from({ length: 7 }, (_, j) => {
  const n = j + 1;
  let k = 0;
  for (let i = 0; i < n; i++) { const yl = n === 1 ? 0 : (((i + 0.5) / n) * 2 - 1) * 0.8; k += n === 1 ? 1 : Math.max(2, Math.floor(16 * (1 - yl * yl) + 0.5)) / 8; }
  return k;
});
// (R: the lumen's radius, pxW: world units per device pixel; as bloodAt's sumK in the shader.)
export function laneSum(R, pxW) {
  const x = Math.min(Math.max((1.7 * R) / Math.max(2.6, 5 * pxW), 1), 7) - 1, i = Math.min(Math.floor(x), 5);
  return LANE_K[i] + (LANE_K[i + 1] - LANE_K[i]) * (x - i);
}
const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
// ?veins=generic in the address: every cell drawn by the general vessel program (the one-vessel build left off), for an A/B
// on a device. The picture is the same either way.
const GENERIC = typeof location !== 'undefined' && /[?&]veins=generic\b/.test(location.search);
// ?vesselbuf=own in the address (an A/B, off by default): the canvas is made without preserveDrawingBuffer, and the picture the
// frames repaint in part is kept in a texture of the renderer's own, copied whole to the canvas each time it is drawn on (see
// present). The same pixels either way; which costs less (the browser keeping the canvas, or one copy a drawn frame) is for
// the devices to say.
const OWN_BUF = typeof location !== 'undefined' && /[?&]vesselbuf=own\b/.test(location.search);
// The composite's per-frame uniform arrays, filled in place: it ran six `new Float32Array`s a frame. (Each is uploaded at once,
// so one set serves every renderer.)
// The origin colours flattened once per palette (the palette is one object for the page's life), not every frame (P8).
const OC = new WeakMap();
const originColOf = (src) => { let a = OC.get(src); if (!a) OC.set(src, a = new Float32Array(src.flat())); return a; };
const SCR = { world: new Float32Array(9), inv: new Float32Array(9), be: new Float32Array(96), bb: new Float32Array(96), ncv: new Float32Array(48), hb: new Float32Array(64), hr: new Float32Array(16) };
const ORIGIN_WHITE = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]];
const put = (dst, src) => { dst.set(src); return dst; };

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
//   2: tier, z (draw order within a tier), flags, 0 (unused)
//   3: fade: linear from (x, y) to (x, y), or radial: center (x, y), radius
//   4: fade: offset, alpha at the start, alpha at the end (radial: at 45 %), mode (0 none, 1 linear, 2 radial, 3 linear with a dip: faintest at the offset, solid at the end)
//   5: drawn part along the vessel (0–1): from, to; arc length (world); stream flags (F_UP, F_DN, F_REV)
//   6: the casing's own color with F_EDGE (rgb), streak course length (world)
//   7: flow streaks: phase at the upstream end, spacing (world), direction (±1, from → to), strength (0 off)
//   8: a stretch recolored (the HVPG's wedged vein): color (rgb), amount (0 none)
//   9: that stretch along the vessel (0–1): from, to; its soft edge (world); hover (0–1: the lumen a little brighter)
//  10: glow (a hovered, focused or highlighted vessel): color (rgb), amount (0 none)
//  11: the glow's fade at the start, at the end (world; 0: runs on into the next glowing vessel; both −(1 + u): only the
//      stretch between the two u glows, 0–1 along the vessel); 1: its own color;
//      its width (× the usual, 0 or 1 usual; at most 1.3: 15.6 past the wall, inside the vessel's cells)
//  12: selection: how far the vessel stands out of the dimmed network (0–1), whether it eases back into it toward its
//      start, toward its end (1: over a third of its length, at most 60, as the hover's brightening; 0: it runs on at full)
// The vessel shader, in two builds from this one text: the general one (`simple` false), and one for the cells that list a
// single vessel and no join (veins-bin simpleCells), with one vessel slot and the join code left out. In such a cell the
// general build fills one slot and finds no join, so every loop over the other slots and over joins does nothing: the
// simple build is the same arithmetic on the same inputs, without the work that cannot change anything there.
export const vesselFS = (simple) => `#version 300 es
precision highp float;
precision highp int;
#define SIMPLE ${simple ? 1 : 0}
in vec2 vW;
flat in ivec4 vR;
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D rmax;           // per vessel: its largest lumen radius now
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform vec4 invA;                     // device pixels → world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 sizeF;                    // the layer, device pixels
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
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture (drawRows), not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw (tintPass): only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 × (arc length + S_OFF), across (0–65535), visibility
#if SIMPLE == 0
layout(location=2) out uvec4 outFlow2; // near a join, the lumen it joins: row + 1, 16 × (arc + S_OFF), across, its share (0–65535)
#else
uvec4 outFlow2;                        // (one vessel and no join: never a second lumen, always zero; the one-vessel build's draws leave that target as it stands, zero: see vesselDraw)
#endif
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

#define MAXS ${simple ? 1 : 8}
#define MAXJ ${simple ? 1 : 6}
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
// How far two joined vessels make a corner at p (0 … 1): whether each one's centreline lies off the other's toward p.
// On a trunk's far wall, opposite a tributary that ends inside it, the tributary's centreline ends on the trunk's own: 0
// there, so that wall is the trunk's alone (no fillet swelling it, no blend of the tributary's caliber or shading); 1 in
// the corners beside the tributary and inside it. (ga, gb: unit directions from each centreline to p; da, db: the
// distances from each wall; ra, rb: the radii.)
// Where one of the two is the trunk the other ends on (role 1: a, 2: b), only the test that matters there is made: the
// tributary's centreline lies off the trunk's toward p. The trunk's off the tributary's toward p fails in the corner itself
// when the tributary ends well inside the trunk (the hepatic veins on the IVC): the vein's round end is the nearest point
// there, so the fillet was cut off on the wall's last few units short of the vein's wall, and the wall above it, swollen
// by the fillet, ended in a spike. (role 0: two vessels meeting at a node, either may lead: both tests.)
// At a fork (kw: the fillet's width there, 0 elsewhere) the trunk is the vessel that runs on through the node, the cava
// above the heart where the azygos arch ends on it. Both tests had read the arch's own nearest segment, which turns at each
// of its short segments, so the corner switched on and off along the arch in saw-teeth; and the corner's edge, a fifth or so of the
// radius wide, left the wall a step where the fillet ended. At a fork the corner now asks only the trunk test (the nearer of
// the trunk's two stretches stands in for it: tn) and eases its edge over about the fillet's own width.
float corner(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role, float kw) {
  vec2 ca = p - ga * (da + ra), cb = p - gb * (db + rb);
  float o1 = dot(cb - ca, ga), o2 = dot(ca - cb, gb), rm = max(min(ra, rb), 0.5);
  float off = role == 1 ? o1 : role == 2 ? o2 : min(o1, o2);
  return smoothstep(0.25 * rm, 0.25 * rm + max(0.35 * rm, 0.9 * kw), off);
}

void main() {
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself (not interpolated across the cell): a pixel showing
  // the same spot of the figure after a pan by whole pixels gets exactly the same position, so the layer shifted by
  // those pixels is exactly the layer drawn there (see draw).
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y), ps = p - shOff;
  float reach = reachU + 2.0 * px;

  // ── Nearest point of each vessel in this cell ──
  int n = 0;
  int sid[MAXS];
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS], sx[MAXS], sv[MAXS], sk[MAXS];
  vec2 sg[MAXS];
  int cur = -1;
  // bx: signed distance across the nearest segment's line (the lumen's across coordinate, also
  // past the vessel's ends); bu: how far along (0–1), running on past either end.
  float bd = 1e9, bs = 1e9, br = 0.0, bu = 0.0, bx = 0.0;
  // aU / aW: how far along, smooth off the wall: each nearby segment's course carried on straight past its ends,
  // weighted softly by how near it is. (The nearest segment's own is constant across the fan off a bend's
  // outside, and the glow's fade along the vessel, read from it, drew stripes there.)
  float aM = 1e9, aW = 0.0, aU = 0.0;
  vec2 bg = vec2(0.0);
  vec4 clip = vec4(0.0, 1.0, 1.0, 0.0);
  bool dotted = false;
  float rmx = 0.0;
  int cnt = min(vR.y, 2048);
  for (int k = 0; k <= cnt; k++) {
    int id = -2;
    vec4 A = vec4(0.0), B = vec4(0.0);
    if (k < cnt) { A = E(vR.x + k, 0); B = E(vR.x + k, 1); id = int(B.x + 0.5); }
    if (id != cur) {
      if (cur >= 0 && min(bd, bs) < reach) {
        int slot = n;
        // When the slots are full, the vessel that matters least here gives way: the farthest, a glowing one
        // counting as nearer by its glow's width (or a crowded join, the hepatic veins' at the IVC, drops its glow in blocks).
        float key = bd - (T(cur, 10).a > 0.0 ? 16.0 : 0.0);
        if (n == MAXS) {
          slot = 0;
          for (int s = 1; s < MAXS; s++) if (sk[s] > sk[slot]) slot = s;
          if (key >= sk[slot]) slot = -1;
        } else n++;
        if (slot >= 0) { sk[slot] = key; sid[slot] = cur; sd[slot] = bd; sh[slot] = bs; sr[slot] = br; su[slot] = bu; sg[slot] = bg; sx[slot] = bx; sv[slot] = aW > 0.0 ? aU / aW : bu; }
      }
      cur = id; bd = 1e9; bs = 1e9; aM = 1e9; aW = 0.0; aU = 0.0;
      if (id >= 0) { clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${F_DOTTED}) != 0; rmx = texelFetch(rmax, ivec2(0, id), 0).r; }
    }
    if (k == cnt) break;
    // The head of this vessel's stretch of the list (segment index -1: a circle holding every point of the stretch, and
    // its length; see veins-bin). When every point lies out of reach, by the wall and by the shadow, the vessel would not
    // be kept here whatever its segments, so they are passed over.
    if (B.y < -0.5) {
      if (length(p - A.xy) - A.z - rmx > reach + 0.01 && length(ps - A.xy) - A.z - rmx > reach + 0.01) k += int(B.w + 0.5);
      continue;
    }
    // A run of this vessel's segments (B.w of them, every point within B.z of this one's start: see veins-bin) that lies
    // wholly past what could change anything here is passed over: each of its segments would be farther than this
    // vessel's nearest so far by more than the 12 the along-course blend reads, and its shadow farther than the nearest
    // shadow, so it would change nothing. (Never the vessel's first run: the nearest so far starts unset.)
    if (B.w > 1.5) {
      float lo = length(p - A.xy) - B.z - rmx, los = length(ps - A.xy) - B.z - rmx;
      if (lo > aM + 12.01 && los > bs + 0.01) { k += int(B.w + 0.5) - 1; continue; }
    }
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
    if (d < aM + 12.0) {
      float uv = (i + mix(t0, t1, clamp(hr, -2.0, 3.0))) / LAST;
      if (d < aM) { float k = exp((d - aM) / 1.5); aW = aW * k + 1.0; aU = aU * k + uv; aM = d; }
      else { float w = exp((aM - d) / 1.5); aW += w; aU += w * uv; }
    }
    float hs = clamp(dot(ps - a, ba) / L2, 0.0, 1.0);
    bs = min(bs, length(ps - a - ba * hs) - mix(rr.x, rr.y, mix(t0, t1, hs)));
  }
  if (n == 0) { if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; } discard; }

  // ── Junctions: which of these vessels are joined here, and how widely ──
  int jn = 0;
  int jm[MAXJ], jt[MAXJ], jtf[MAXJ];  // (jt: the members that are the trunk the others end on; jtf: those of them at a fork)
  float jk[MAXJ], jf[MAXJ], js[MAXJ];
#if SIMPLE == 0
  for (int k = 0; k < min(vR.w, 64); k++) {
    if (jn == MAXJ) break;
    vec4 A = E(vR.z + k, 0), B = E(vR.z + k, 1);
    float dc = length(p - A.xy);
    if (dc > A.z) continue;
    int mask = 0, c = 0, tm = 0, tfm = 0;
    for (int m = 0; m < 4; m++) {
      if (B[m] < -0.5) continue;
      int id = int(B[m] + 0.5);
      for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == id && (mask & (1 << s)) == 0) { mask |= 1 << s; c++; if (fract(B[m]) > 0.1) { tm |= 1 << s; if (fract(B[m]) > 0.3) tfm |= 1 << s; } }
    }
    if (c < 2) continue;
    jm[jn] = mask; jt[jn] = tm; jtf[jn] = tfm; js[jn] = fract(A.w) / 0.99; jk[jn] = floor(A.w) * 0.01 * (1.0 - smoothstep(0.55 * A.z, A.z, dc)); jf[jn] = 1.0 - smoothstep(0.3 * A.z, 0.85 * A.z, dc); jn++;
  }
#endif
  // Where a trunk runs on into the next stretch of its course at a fork (joined with no fillet), the trunk beside this pixel
  // is whichever of the two lies nearer: tn[s], for a vessel s the others end on (corner() reads its geometry).
  int tn[MAXS];
  for (int s = 0; s < MAXS; s++) tn[s] = s;
  for (int j = 0; j < MAXJ; j++) if (j < jn && js[j] < 0.01)
    for (int s = 0; s < MAXS; s++) if ((jm[j] & (1 << s)) != 0)
      for (int m = 0; m < MAXS; m++) if (m != s && (jm[j] & (1 << m)) != 0 && sd[m] < sd[tn[s]]) tn[s] = m;

  // ── Nothing to draw here: settled now, without the tiers below ──
  // Where every vessel in reach lies past what any of them draws, the tiers below would add nothing: no glow band (it ends
  // 15.6 past a wall), and every tier skipped by its own test (D past 8 + 2 px, Ds past
  // 6 + 2 px; a fillet pulls a shape in by at most a quarter of its width). The pixel is left empty, exactly as they
  // would leave it, at the cost of a few reads. (Zoomed in, most of the pixels the cells cover are like this.)
  {
    float pull = 0.0, dMin = 1e9, sMin = 1e9;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0) pull = max(pull, jk[j] * js[j] * 0.25);
    bool lit = false;
    for (int s = 0; s < MAXS; s++) {
      if (s >= n) break;
      dMin = min(dMin, sd[s]); sMin = min(sMin, sh[s]);
      if (T(sid[s], 10).a > 0.0 && sd[s] - T(sid[s], 0).w < 15.7) lit = true;
    }
    if (!lit && dMin - pull > 8.01 + 2.0 * px && sMin - pull > 6.01 + 2.0 * px) {
      if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
      discard;
    }
  }

  // ── Per-vessel attributes ──
  float stier[MAXS], sz[MAXS], sflag[MAXS], sa[MAXS], swall[MAXS], shov[MAXS], ssel[MAXS];
  vec3 scol[MAXS], sedge[MAXS];
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * 0.5 * organK : 0.0;
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    vec4 t0 = T(sid[s], 0), t1 = T(sid[s], 1), t2 = T(sid[s], 2), t3 = T(sid[s], 3), t4 = T(sid[s], 4);
    stier[s] = t2.x; sz[s] = t2.y; sflag[s] = t2.z; swall[s] = t0.w;
    scol[s] = mix(t0.rgb, t1.rgb, clamp(su[s], 0.0, 1.0));
    vec4 tc = T(sid[s], 8);
    shov[s] = T(sid[s], 9).w;
    // The selected vessel stands out of the dimmed network, easing back into it along its course toward each end that
    // meets an unselected vessel, so it never stops in a hard, round end where the dimmed vessel carries on (a slide's
    // spotlit vessel toward its free ends too: highlight-math.js liftEnd).
    vec4 t12 = T(sid[s], 12);
    ssel[s] = t12.x;
    if (t12.x > 0.0) {
      float Ls = max(T(sid[s], 5).z, 1.0), fs = min(0.35 * Ls, 60.0);
      ssel[s] *= (t12.y > 0.5 ? smoothstep(0.0, fs, sv[s] * Ls) : 1.0) * (t12.z > 0.5 ? smoothstep(0.0, fs, (1.0 - sv[s]) * Ls) : 1.0);
    }
    if (tc.w > 0.0) {
      vec4 tr = T(sid[s], 9);
      float Lv = max(T(sid[s], 5).z, 1.0), uu = su[s] * Lv;
      float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
      scol[s] = mix(scol[s], tc.rgb, k * tc.w);
    }
    sedge[s] = (int(t2.z + 0.5) & ${F_EDGE}) != 0 ? T(sid[s], 6).rgb : vec3(0.0);
    float a = t1.w;
    if (t4.w > 2.5) {
      // A dip: from its start alpha down to its faintest at the offset, and back up to solid at the end.
      vec2 dd = t3.zw - t3.xy;
      float v = clamp(dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
      a *= v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));
    } else if (t4.w > 1.5) {
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

  // Whether a lumen colour (scol) reaches this pixel: through a lumen drawn here (aL > 0) or a glow in its vessel's
  // own colour. Where neither does, the colour comes from the casings, shadows, rings and inks alone.
  bool dep = false;
  // (A lit vessel's glow, the thin soft band hugging its wall, is laid down with its own tier below.)

  // ── Hand-off at a join across tiers ──
  // A vessel that ends on one in a lower tier draws a copy of that one near the junction (see
  // below), so the join is one filleted shape. The copy is drawn as the lower vessel shows in its
  // own tier (behind the organs: as faded as they leave it), and the lower tier draws that vessel
  // only for what the copy leaves, so the merged shape is filled once: no brighter, doubled patch
  // where the two overlap (the hepatic veins on the cava).
  float keep[MAXS];
  for (int s = 0; s < MAXS; s++) keep[s] = 1.0;
  for (int j = 0; j < MAXJ; j++) {
    if (j >= jn || jf[j] <= 0.0) continue;
    for (int t = 0; t < MAXS; t++) {
      if (t >= n || (jm[j] & (1 << t)) == 0) continue;
      int ti = int(stier[t] + 0.5);
      if (tierGroup[ti] == 2) continue;
      for (int s = 0; s < MAXS; s++) {
        if (s >= n || (jm[j] & (1 << s)) == 0 || stier[s] >= stier[t]) continue;
        int lt = int(stier[s] + 0.5);
        if (tierGroup[lt] == 2) continue;
        float shown = tierAlpha[lt] * (tierGroup[lt] == 0 ? 1.0 - occl : 1.0);
        float aC = sa[s] * jf[j] * min(tierAlpha[ti], shown), aO = sa[s] * shown;
        if (aO > 1e-4) keep[s] = min(keep[s], clamp((1.0 - aC / aO) / max(1.0 - aC, 1e-4), 0.0, 1.0));
      }
    }
  }

  // ── Tiers, back to front ──
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  // (A glow asked to lie on top (the Doppler's, wide + 10): over every vessel of its group it crosses, the ones above its own too.)
  vec4 topC = vec4(0.0);
  int topGrp = 1;
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
    // ── Glow: one thin soft band hugging a lit vessel's wall on both sides, fading to nothing at a free end.
    // Every highlight (hover, a slide's or step's vessels, the Doppler's) is this band, in its colour. It goes
    // down with the lit vessel's own tier: over every vessel in the tiers beneath, under the lit vessel itself,
    // so where it crosses another vessel its glow is not cut by that vessel's body.
    vec4 lg = vec4(0.0), lgU = vec4(0.0);
    for (int s = 0; s < MAXS; s++) {
      if (s >= n || stier[s] != tt) continue;
      vec4 gc = T(sid[s], 10);
      if (gc.a <= 0.0) continue;
      vec4 ge = T(sid[s], 11);
      float e = sd[s] - swall[s], Lh = max(T(sid[s], 5).z, 1.0);
      float ends = (ge.x > 0.0 ? smoothstep(0.0, ge.x, sv[s] * Lh) : 1.0) * (ge.y > 0.0 ? smoothstep(0.0, ge.y, (1.0 - sv[s]) * Lh) : 1.0);
      // A stretch (a stent's third): its two ends come as −(1 + u) along the vessel; the glow fades in and out over a few units there.
      if (ge.x < 0.0) {
        float x = sv[s] * Lh, a = (-ge.x - 1.0) * Lh, b = (-ge.y - 1.0) * Lh, w = min(6.0, 0.08 * Lh);
        ends = (a > 0.5 ? smoothstep(a - w, a + w, x) : 1.0) * (b < Lh - 0.5 ? 1.0 - smoothstep(b - w, b + w, x) : 1.0);
      }
      bool up = ge.w > 5.0;
      float fall = 1.0 - smoothstep(0.0, 12.0 * clamp(up ? ge.w - 10.0 : ge.w, 0.5, 1.3), e);
      float gv = min(0.9, 0.6 * gc.a) * sa[s] * smoothstep(-0.6, 0.6, e) * fall * ends;
      // None inside another lit vessel's lumen (the cava's two lengths, lit together): each band ends at the
      // other's wall, so a lit vessel's round end does not show as a disc in the next one's lumen.
      for (int u = 0; u < MAXS; u++) if (u != s && u < n && T(sid[u], 10).a > 0.0) gv *= smoothstep(-0.6, 0.6, sd[u] - swall[u]);
      if (gv > 0.0 && ge.z > 0.5) dep = true;
      if (up) { if (gv > lgU.a) lgU = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv); }
      else if (gv > lg.a) lg = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv);
    }
    if (lgU.a > topC.a) { topC = lgU; topGrp = grp; }
    if (lg.a > 0.0) {
      if (grp == 0) accB = over(lg, accB);
      else if (grp == 1) accN = over(lg * min(1.0 / max(netAlpha, 1e-3), 1.0 / lg.a), accN);   // (accN is faded by netAlpha as a whole)
      else accT = over(lg, accT);
    }
    // Members: this tier's vessels, and (except in the lifted tier) vessels of lower tiers that
    // share a junction with one of them, faded out with distance from that junction.
    float pres[MAXS];
    int mem = 0;
    for (int s = 0; s < MAXS; s++) { pres[s] = 0.0; if (s < n && stier[s] == tt) { mem |= 1 << s; pres[s] = keep[s]; } }
    // A copy is drawn as translucent as the vessel it copies shows in its own tier (a back vessel's copy into the
    // network divided by the network's own dimming, which the tier applies again), never capped by the fade of the
    // vessel joining it: a fading hepatic or renal vein must not thin the cava's lumen where it joins it.
    int base = mem;
    if (grp != 2) for (int j = 0; j < MAXJ; j++) {
      int own = jm[j] & base;
      if (j >= jn || own == 0 || jf[j] <= 0.0) continue;
      for (int s = 0; s < MAXS; s++) {
        if (s >= n || (jm[j] & (1 << s)) == 0 || stier[s] >= tt) continue;
        int lt = int(stier[s] + 0.5);
        if (tierGroup[lt] == 2) continue;
        mem |= 1 << s;
        float shown = tierAlpha[lt] * (tierGroup[lt] == 0 ? 1.0 - occl : 1.0);
        pres[s] = max(pres[s], jf[j] * min(1.0, shown / max(tierAlpha[ti], 1e-3)) / (grp == 1 && tierGroup[lt] == 0 ? max(netAlpha, 1e-3) : 1.0));
      }
    }
    // The tier's shape: plain union, filleted between vessels that share a junction. The fillet fills only the corners
    // between them, where each vessel's centreline lies off the other's toward this pixel: on a trunk's far wall, opposite
    // a tributary that ends inside it, the tributary's centreline ends on the trunk's own, so no fillet swells that wall into
    // a nub (the IMV and the splenorenal shunt on the splenic vein, the shunt on the renal vein), and none swells the seam
    // where one stretch of a vessel runs on into the next.
    float D = 1e9, Ds = 1e9;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0) { D = min(D, sd[s]); Ds = min(Ds, sh[s]); }
    for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || jk[j] <= 0.0) continue;
      int jj = jm[j] & mem;
      for (int a = 0; a < MAXS; a++) {
        if ((jj & (1 << a)) == 0) continue;
        for (int b = a + 1; b < MAXS; b++) {
          if ((jj & (1 << b)) == 0) continue;
          int ro = (jt[j] & (1 << a)) != 0 ? 1 : (jt[j] & (1 << b)) != 0 ? 2 : 0;
          bool fa = ro == 1 && (jtf[j] & (1 << a)) != 0, fb = ro == 2 && (jtf[j] & (1 << b)) != 0;
          int ta = fa ? tn[a] : a, tb = fb ? tn[b] : b;
          float kw = fa || fb ? jk[j] * js[j] : 0.0;
          float kk = jk[j] * js[j] * corner(p, sg[ta], sd[ta], sr[ta], sg[tb], sd[tb], sr[tb], ro, kw);
          D = min(D, smin(sd[a], sd[b], kk));
          Ds = min(Ds, smin(sh[a], sh[b], kk));
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
    // Inside the lumen of a copied trunk (a vein behind the organs that this tier's veins end on:
    // the cava under the hepatic veins), the trunk owns the pixel: a vein's end does not show
    // through it as a second, brighter stub, so the join reads as one shape.
    float tin[MAXS];
    for (int s = 0; s < MAXS; s++) {
      tin[s] = 0.0;
      if ((mem & (1 << s)) == 0 || stier[s] == tt || grp != 1 || tierGroup[int(stier[s] + 0.5)] != 0) continue;
      tin[s] = clamp(-sd[s] / max(0.35 * sr[s], px), 0.0, 1.0) * step(1e-3, pres[s]);
      if (tin[s] > 0.5 && stier[ow] == tt) {
        ow = s; conn = 0; kc = 0.0;
        for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
      }
    }
    conn = (conn | (1 << ow)) & mem;
    // Attributes blended across the join by the same distances (soft weights), so color,
    // caliber and shading run on through the fillet.
    float m = 1e9;
    for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0) m = min(m, sd[s]);
    // (The caliber, wall and shading blend only where the two make a corner (corner()): a trunk's far wall opposite a
    // tributary's end is the trunk's own. The colour and alpha blend all through, so a lumen's colour still runs on.)
    float tau = 0.3 * kc + 1e-3, W = 0.0, Wg = 0.0, R = 0.0, wall = 0.0, alpha = 0.0;
    vec3 col = vec3(0.0);
    vec2 g = vec2(0.0);
    for (int s = 0; s < MAXS; s++) {
      if ((conn & (1 << s)) == 0) continue;
      float w = s == ow && kc <= 0.0 ? 1.0 : exp(-(sd[s] - m) / tau);
      for (int t = 0; t < MAXS; t++) if ((conn & (1 << t)) != 0 && t != s) w *= 1.0 - tin[t];
      w = max(w, tin[s]);
      // (Two stretches of one course running on into each other, joined with less than a full fillet, blend all through.)
      bool run = false;
      for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && js[j] < 0.98 && (jm[j] & (1 << s)) != 0 && (jm[j] & (1 << ow)) != 0) run = true;
      // (Deep in the lumens, away from every wall, they blend all through too, so the shading runs on into a tributary.)
      float deep = 1.0 - smoothstep(-0.6 * sr[ow], -0.25 * sr[ow], max(sd[ow], sd[s]));
      int role = 0;
      float kw = 0.0;
      bool fk = false;
      for (int j = 0; j < MAXJ; j++) if (j < jn && (jm[j] & (1 << s)) != 0 && (jm[j] & (1 << ow)) != 0) {
        role = (jt[j] & (1 << s)) != 0 ? 1 : (jt[j] & (1 << ow)) != 0 ? 2 : role;
        if ((role == 1 && (jtf[j] & (1 << s)) != 0) || (role == 2 && (jtf[j] & (1 << ow)) != 0)) { fk = true; kw = jk[j] * js[j]; }
      }
      int ts = fk && role == 1 ? tn[s] : s, to = fk && role == 2 ? tn[ow] : ow;
      float wg = s == ow || run ? w : w * max(max(corner(p, sg[ts], sd[ts], sr[ts], sg[to], sd[to], sr[to], role, kw), deep), tin[s]);
      W += w; Wg += wg; R += wg * sr[s]; wall += wg * swall[s]; alpha += w * sa[s] * pres[s]; col += w * scol[s]; g += wg * sg[s];
    }
    R /= Wg; wall /= Wg; alpha /= W; col /= W;
    g = length(g) > 1e-5 ? normalize(g) : vec2(0.0);
    int flags = int(sflag[ow] + 0.5);
    bool sel = (flags & ${F_SEL}) != 0;
    float cA = (flags & ${F_NOCASE}) != 0 ? 0.0 : (flags & ${F_DOTTED}) != 0 ? 0.35 : 1.0;

    float aa = px;
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    if (aL > 0.0) dep = true;
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
      // coordinate (−1 … 1, positive on the lit side) places them at a fixed depth in the tube, so
      // they run on through the joins and never slide to the rim as a vessel turns; where the light
      // runs along a vessel they fade out smoothly, and on hairline vessels they are left out.
      float k = dot(g, light);
      float side = rho * sign(k);
      float soft = 0.06 + aa / max(R, 1e-3);
      float thin = smoothstep(1.2, 2.6, R / aa) * smoothstep(0.25, 0.7, abs(k));
      float aDark = (1.0 - smoothstep(0.1, 0.1 + soft, abs(side + 0.62))) * thin;
      lum = mix(lum, shadeInk.rgb, clamp(shadeInk.a * 1.3 * aDark, 0.0, 0.5));
      if ((flags & ${F_SPEC}) != 0) {
        float aLight = (1.0 - smoothstep(0.07, 0.07 + soft, abs(side - 0.5))) * thin;
        lum = mix(lum, sheenInk.rgb, clamp(sheenInk.a * 0.75 * aLight, 0.0, 0.5));
      }
    }
    if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
    if (shov[ow] > 0.0) {
      // The hovered vessel, a little brighter in its own hue, easing out toward each end that meets a vessel not lit with it
      // (over a third of its length, at most 60), so the brighter lumen never stops in a hard line at the join.
      vec4 he = T(sid[ow], 11);
      float Lh = max(T(sid[ow], 5).z, 1.0), fl = min(0.35 * Lh, 60.0);
      float hs = (he.x > 0.0 ? smoothstep(0.0, max(he.x, fl), sv[ow] * Lh) : 1.0) * (he.y > 0.0 ? smoothstep(0.0, max(he.y, fl), (1.0 - sv[ow]) * Lh) : 1.0);
      lum = mix(lum, min(lum * 1.18 + 0.04, vec3(1.0)), shov[ow] * hs);
    }
    c = over(vec4(lum, 1.0) * aL, c);
    c *= alpha * tierAlpha[ti];
    float wsel = grp == 1 ? ssel[ow] : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
    float gf = grp == 0 ? 1.0 - occl : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
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
        for (int t = 0; t < MAXS; t++) if ((conn & (1 << t)) != 0 && t != s) wv *= 1.0 - tin[t];   // inside the trunk, its stream
        if (wv > w1) { w2 = w1; o2 = o1; w1 = wv; o1 = s; }
        else if (wv > w2) { w2 = wv; o2 = s; }
      }
      if (o1 < 0) { o1 = ow; o2 = -1; }
      // Where a copy of a lower tier's vessel (a trunk under the veins that end on it) leads, it adds to
      // the lumen that tier already showed and keeps its stream: the blood and chevrons run on at full
      // strength across the join instead of fading to what the copy alone covers or switching streams
      // where the copy fades out.
      bool lower = stier[o1] != tt && gId > 0u;
      if (lower) {
        bool same = false;
        for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0 && uint(sid[s] + 1) == gId) same = true;
        lower = same;
      }
      if (lower) {
        gW = min(1.0, lumA + gW * (1.0 - c.a * gf));
        // Toward a vein of this tier, its stream joins in as it does from the vein's side.
        if (o2 >= 0 && stier[o2] == tt && w2 > 0.01 * w1) {
          gId2 = uint(sid[o2] + 1); gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gB = w2 / (w1 + w2);
        }
      } else {
        int id = sid[o1];
        gId = uint(id + 1); gS = su[o1] * T(id, 5).z; gY = clamp(sx[o1] / max(sr[o1], 1e-3), -1.0, 1.0); gW = lumA;
        gId2 = 0u; gB = 0.0;
        if (o2 >= 0 && w2 > 0.01 * w1) {
          gId2 = uint(sid[o2] + 1); gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gB = w2 / (w1 + w2);
        }
      }
    } else gW *= 1.0 - c.a * gf;
    if (grp == 0) { c *= 1.0 - occl; accB = over(c, accB); }
    else if (grp == 1) { accN = over(c, accN); if (wsel > 0.0) accT = over(c * wsel, accT); }
    else accT = over(c, accT);
  }
  if (topC.a > 0.0) {
    if (topGrp == 0) accB = over(topC, accB);
    else if (topGrp == 1) accN = over(topC * min(1.0 / max(netAlpha, 1e-3), 1.0 / topC.a), accN);
    else accT = over(topC, accT);
  }
  vec4 o = over(accT, over(accN * netAlpha, accB));
  if (o.a < 0.002) { if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; } discard; }
  // Dither by up to a level (triangular noise, fixed per pixel) before the 8-bit layer: the colour and
  // alpha of a soft gradient (the glow's falloff) would round at different places and draw thin stripes.
  uvec2 fc = uvec2(ivec2(floor(q)));   // (fixed to the figure, not the screen: it moves with a pan)
  uint hd = fc.x * 0x8da6b343u ^ fc.y * 0xd8163841u;
  hd ^= hd >> 15; hd *= 0x2c1b3c6du; hd ^= hd >> 12; hd *= 0x297a2d39u; hd ^= hd >> 15;
  float dn = (float(hd & 0xffffu) + float(hd >> 16)) / 65535.0 - 1.0;
  o.a = clamp(o.a + dn / 255.0, 0.0, 1.0);
  o.rgb = min(max(o.rgb + dn / 255.0, 0.0), vec3(o.a));
  outColor = o;
  outDep = vec4(dep ? 1.0 : 0.0);
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
      // The rounded end shades like the shaft it closes (a cylinder across its width, not a ball), so
      // it reads as part of the tube rather than a glossy bead stuck on.
      float v = clamp(vUV.y, -1.0, 1.0);
      vec3 nc = vec3(vec2(-vDir.y, vDir.x) * v, sqrt(max(0.0, 1.0 - v * v)));
      float dc = max(dot(nc, L), 0.0), sc = pow(max(dot(nc, H), 0.0), 34.0);
      c = col * (0.5 + 0.56 * dc) + vec3(0.9) * sc * 0.75;
      c = mix(c, col * 0.32, smoothstep(0.78, 1.0, r) * 0.6);
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
// A function: the bleed's colour token (--bleed-spray) is written in when the shader is built. Two builds from this one text
// (addendum §9, a small fixed set rather than one per switch): the full one, and `plain`, for the frames with no dye, no
// origin colours and no bleed, where those three switches are constants 0 instead of uniforms, so the compiler drops the
// code they gate. The composite picks plain only when those are its uniforms' values (see composite): the same arithmetic,
// without the branches that do nothing in such a frame.
export const COMP_FS = (plain = false) => `#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${plain ? 1 : 0}
precision highp usampler2D;
uniform sampler2D base;                // the vessel layer (premultiplied)
uniform usampler2D gbuf;               // its frontmost lumen per pixel
uniform usampler2D gbuf2;              // near a join, the lumen it joins and its share
uniform highp sampler2D flow;          // per vessel: FLOW_TEXELS texels
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D bend;          // per vessel: the axis's signed curvature at each sample (setBend)
uniform sampler2D dye;                 // per vessel: dye concentration along the course
uniform sampler2D plate0, plate1;
uniform vec4 plateRect0, plateRect1;
uniform int plates;                    // bit 0: whole plate, bit 1: sharp view
uniform sampler2D stackL;              // the organs drawn layer by layer instead (organs-gl.js), device pixels, premultiplied
uniform int stackOn;
uniform float plateAlpha, plateSat;
uniform highp sampler2D fluidMask;     // the peritoneal cavity: its half-width about the middle of fluidRect, row by row down it
uniform vec4 fluidRect;
uniform vec4 fluidS;                   // ascites: floor, height, ripple amplitude, ripple phase (world units, radians)
uniform vec4 fluidInk;                 // its straw color (straight) and opacity at depth; a = 0: none
uniform vec2 fluidLv;                  // the liver's scale about 560 350, and how far the fluid is kept off it (its lower edge: fluidMask row 1)
uniform mat3 inv;                      // device pixels → world
uniform float H;                       // canvas height, device pixels
uniform float pxW;                     // world units per device pixel
uniform int blood;                     // 1: draw the blood
uniform int chev;                      // 1: flow chevrons on top (dark; orange where flow is reversed, cream on an orange vessel)
uniform int still;                     // 1: reduced motion (the chevrons stand still, spaced by flow)
uniform vec3 chevInk;
uniform vec3 chevLight;                // a reversed chevron's head on an orange vessel (near-white cream)
uniform float cssPx;                   // canvas px per CSS px (stage.js vdpr, at most 2)
uniform float flowA;                   // 0..1: how visible the moving blood and chevrons are (they fade in once the view is still)
uniform vec3 blendA;                   // 0..1 each: the streaks, the chevrons and the origin colours fading in or out (switched on or off)
uniform int look;                      // 0 parcels, 1 shimmer
#if PLAIN == 0
uniform int origin;                    // 1: color parcels by where their blood came from
uniform int dyeOn;
#else
const int origin = 0, dyeOn = 0;
#endif
uniform float clock;                   // seconds (wrapped), for the drift of stagnant blood
uniform vec3 originCol[5];
uniform vec3 dyeCol;
uniform vec3 revCol;                   // the moving blood's color where flow runs backwards
uniform vec3 inkLight, inkDark;
uniform vec4 bleedE[24];               // an active bleed (stage.js bleedSpray, blood.js bleedShapes): a jet's base and tip (world); the pool: its surface's height, ripple, where the stream lands, the stream's strength; the stream: its start, where it lands, the pool's surface
uniform vec4 bleedB[24];               // a jet's radius at its base and at its tip, alpha, kind (1 jet, 0 pool, 2 stream); the pool: its inset from the wall; the stream: its radius, how far it breaks into drops
#if PLAIN == 0
uniform int bleedN;
#else
const int bleedN = 0;
#endif
uniform vec4 noChev[12];               // world boxes (x0, y0, x1, y1) where no flow arrowhead is drawn: a figure reading sits there
uniform int noChevN;
uniform vec4 chevHole[16];             // world boxes the flow's arrowheads keep out of (x0, y0, x1, y1), each grown by chevHoleR;
uniform float chevHoleR[16];           // a negative radius makes it a line from (x0, y0) to (x1, y1) instead, that far round
uniform int chevHoleN;
uniform float rows;
uniform sampler2D lineL;               // the organ outlines, drawn once per change (premultiplied, device pixels)
uniform int lineOn;
uniform sampler2D glowL;               // soft glows behind the plate (an organ a slide points at), same drawing
uniform int glowOn;
uniform sampler2D warmL;               // warm glows over the plate and under the vessels (the edges of a lit organ's loops), same drawing
uniform int warmOn;
uniform int bloodOnly;                // 1: a frame where only the blood moved (composite): a pixel with no lumen is left as drawn
out vec4 outColor;

const float SLOT = ${SLOT_W}.0;
const float BINS = ${DYE_BINS}.0;
const float S_OFF = ${S_OFF}.0;
const float ORIGIN_GREY = ${ORIGIN_GREY};
const int N_LAST = ${N_SAMPLES - 1};
const float LANE_K[7] = float[7](${LANE_K.map((k) => k.toFixed(4)).join(', ')});
const float STO_Y0 = ${STO_Y0}.0, STO_DY = ${STO_DY}.0;
const int STO_N = ${STO_N};
const vec2 STO[${STO_N}] = vec2[${STO_N}](${LUMEN.map(([l, r]) => `vec2(${l.toFixed(2)}, ${r.toFixed(2)})`).join(', ')});

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

// The shimmer's noise at one parcel scale sx (its slot): two lane speeds blended by t, the fine octave
// faded out where it would fall under a pixel and a half (replaced by its mean, so the level holds).
float shimN(int id, float s, float qy, float D, float k0, float t, float sx, float drift) {
  float period = 256.0 * sx, cellA = 5.12 * sx;   // 50 cells a period: the noise wraps with the stream
  int per = 50;
  vec2 qa = vec2((s - mod(D * k0 / 8.0, period)) / cellA + drift, qy);
  vec2 qb = vec2((s - mod(D * (k0 + 1.0) / 8.0, period)) / cellA + drift, qy);
  uint sd0 = uint(id) * 31u, sd1 = uint(id) * 57u + 11u;
  float fw = smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5);
  bool fine = fw > 0.0;
  float na = t < 1.0 ? 0.62 * vnoise(qa, sd0, per) + 0.38 * (fine ? mix(0.5, vnoise(qa * vec2(2.0, 1.7) + vec2(0.0, 7.3), sd1, per * 2), fw) : 0.5) : 0.0;
  float nb = t > 0.0 ? 0.62 * vnoise(qb, sd0, per) + 0.38 * (fine ? mix(0.5, vnoise(qb * vec2(2.0, 1.7) + vec2(0.0, 7.3), sd1, per * 2), fw) : 0.5) : 0.0;
  return mix(na, nb, t);
}
// Moving blood in one lumen at arc length s (world, may run past either end) and across y (−1 … 1):
// the parcels' color and coverage, to be laid over the lumen color col.
vec4 bloodAt(int id, float s, float y, vec3 col) {
  vec4 f0 = texelFetch(flow, ivec2(0, id), 0), f1 = texelFetch(flow, ivec2(1, id), 0);
  if (f1.z <= 0.0) return vec4(0.0);
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  // The caliber here, interpolated between its samples (not the nearest one), so nothing scaled by it steps along the vessel.
  float ui = clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  float R = max(mix(texelFetch(rad, ivec2(i0, id), 0).r, texelFetch(rad, ivec2(i0 + 1, id), 0).r, ui - float(i0)), 0.3);
  float D = f0.x, vd = f0.y, flux = f0.z, stasis = f0.w;
  float dir = vd < 0.0 ? -1.0 : 1.0;
  // Lanes ~5 device pixels apart (more when zoomed in), parcels at least ~8 apart along a lane.
  float Lg = max(2.6, 5.0 * pxW);
  int n = clamp(int(1.7 * R / Lg), 1, 7);
  float s0 = SLOT * (pxW * 8.0 > SLOT * 2.0 ? 4.0 : pxW * 8.0 > SLOT ? 2.0 : 1.0);
  float lc = clamp(1.7 * R / Lg, 1.0, 7.0) - 1.0;   // (the continuous lane count, less one: LANE_K, laneSum)
  int lk = min(int(lc), 5);
  float sumK = mix(LANE_K[lk], LANE_K[lk + 1], lc - float(lk));
  float p = min(1.0, flux * s0 / (max(abs(vd), 2.0) * sumK));
  p = max(p, 0.45 * stasis);
  float ends = min(f1.x > 0.5 ? smoothstep(0.0, 1.5 * s0, s) : 1.0, f1.y > 0.5 ? smoothstep(0.0, 1.5 * s0, len - s) : 1.0);
  // Light or dark ink from the vessel's own color (not the shaded pixel, whose highlights would flip a streak
  // between white and dark as it passes), eased across a range so a vessel near the cut-off never switches.
  vec3 vc = mix(texelFetch(tube, ivec2(0, id), 0).rgb, texelFetch(tube, ivec2(1, id), 0).rgb, clamp(s / len, 0.0, 1.0));
  float pale = origin == 0 ? smoothstep(0.58, 0.66, dot(vc, vec3(0.299, 0.587, 0.114))) : 0.0;   // the origin streams always take light ink
  // Parcels read as bright beads with a soft glow on a dark lumen, deep beads on a pale one.
  vec3 core = mix(mix(col, inkLight, 0.62), mix(col, inkDark, 0.45), pale);
  vec3 halo = mix(mix(col, inkLight, 0.3), mix(col, inkDark, 0.2), pale);
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
  float k0 = floor(k8), t = smoothstep(0.2, 0.8, k8 - k0);
  // Its scale follows the zoom without steps: the lane width from a continuous lane count, and the
  // cell size cross-fading between the parcel scales (1, 2, 4 slots) over a band of zoom, where the beads switch at once.
  float qy = y * R / max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
  float drift = texelFetch(flow, ivec2(3, id), 0).z;   // (added up per stream on the CPU: blood.js drift)
  float lx = clamp(log2(max(pxW, 1e-4) * 8.0 / SLOT), -1.0, 3.0);
  float li = smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx);   // 0 … 2
  float lb = min(floor(li), 1.0), lf = li - lb;
  float sA = SLOT * exp2(lb), sB = SLOT * exp2(lb + 1.0);
  float nz = shimN(id, s, qy, D, k0, t, sA, drift);
  if (lf > 0.0) nz = mix(nz, shimN(id, s, qy, D, k0, t, sB, drift), lf);
  float sx = mix(sA, sB, lf);
  p = max(min(1.0, flux * sx / (max(abs(vd), 2.0) * sumK)), 0.45 * stasis);
  ends = min(f1.x > 0.5 ? smoothstep(0.0, 1.5 * sx, s) : 1.0, f1.y > 0.5 ? smoothstep(0.0, 1.5 * sx, len - s) : 1.0);
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
${CHEV_GLSL}
// How orange a vessel's colour is (0..1): a bright red channel well above the blue, with green between a red's and a
// yellow's, eased at each edge (the reversed orange and the heat ramp's orange 1; teal, wine, red, yellow and grey 0).
float chevOrange(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}
float radAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return max(mix(texelFetch(rad, ivec2(i0, id), 0).r, texelFetch(rad, ivec2(i0 + 1, id), 0).r, ui - float(i0)), 0.3);
}
// Flow arrowheads along the axis, pointing and moving with the mean flow: a slim filled head with
// a notched back. Returns its coverage (x) and a soft rim just outside it (y).
// The axis's signed curvature at arc length s (1 / world units; positive turning toward +y).
float bendAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return mix(texelFetch(bend, ivec2(i0, id), 0).r, texelFetch(bend, ivec2(i0 + 1, id), 0).r, ui - float(i0));
}
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
  float lv = max(0.0, log2(max(3.6 * R, 60.0 * pxW) / 28.0));
  // Reduced motion: the heads stand still, so their spacing carries the flow instead: closer where more blood passes
  // (flow texel 3, y: a coarser level for less flow). Never closer than the zoom allows.
  if (still == 1) lv = max(lv, texelFetch(flow, ivec2(3, id), 0).y);
  float n = floor(lv), fr = lv - n;
  float P = 28.0 * exp2(n), Pc = 28.0 * exp2(lv);
  float x = mod(s - f0.x + 0.5 * P, P) - 0.5 * P, u = x * dir;
  float sc = s - x;
  float odd = mod(floor((sc - f0.x) / P + 0.5), 2.0);
  float keep = odd > 0.5 ? 1.0 - smoothstep(0.15, 0.85, fr) : 1.0;
  float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;            // half width, length: one fixed shape per vessel, never stretched
  // Past the head and its soft rim along the course (|u| > 0.55 L + 0.19 hw + 3.4 px reaches nothing): no more reads.
  if (abs(x) > 0.6 * L + 0.15 * hw + 4.0 * pxW) return vec2(0.0);
  // Across, and the lumen where the head sits (so none overhangs a narrowing vessel), between the radius samples.
  float yd = y * radAt(id, s, len), ay = abs(yd);
  float Rl = radAt(id, sc, len);
  // On a bend the arc length runs along the axis, so off it the same span of s is shorter on the inside and longer on
  // the outside: measured in s alone a head squashes and bends with the vessel. Its true distance along, at yd across,
  // is the span of s times (1 − κ yd), so the head keeps its one straight shape wherever it sits.
  u *= clamp(1.0 - bendAt(id, sc, len) * yd, 0.25, 2.5);
  // Toward either end a head fades out (and the next vessel's fade in), never cut by a join.
  float e = min(sc, len - sc);
  if (e < 0.6 * L) return vec2(0.0);
  float fade = smoothstep(0.5, 3.0, abs(vd)) * f1.z * texelFetch(flow, ivec2(3, id), 0).x * keep * smoothstep(0.6 * L, 0.6 * L + max(2.0 * L, 0.3 * Pc), e) * smoothstep(1.3 * pxW, 2.4 * pxW, R);
  // Where the lumen is narrower than the head, the head fades out instead of squeezing to fit.
  fade *= smoothstep(0.85 * hw, 1.15 * hw, Rl);
  return chevHead(u, ay, hw, pxW) * fade;
}
// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall
// (laminar flow).
float dyeAt(int id, float s, float y) {
  float vd = texelFetch(flow, ivec2(0, id), 0).y;
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  // (The caliber between its samples, as the chevrons take it: the nearest sample stepped the front's bullet at each one; B11.)
  float R = radAt(id, s, len);
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float sp = s - dir * (2.0 * (1.0 - y * y) - 1.0) * 1.4 * R;
  float u = clamp(sp / len, 0.0, 1.0);
  return texture(dye, vec2((u * (BINS - 1.0) + 0.5) / BINS, (float(id) + 0.5) / rows)).r;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  uvec4 g = texelFetch(gbuf, ip, 0);
  // Between whole redraws a pixel with no lumen comes out as the last frame left it: everything it is made of (the plate, the
  // glows, the vessel layer, still fluid, the outlines) is unchanged, and the blood, chevrons, dye and origin colours are drawn
  // only where a lumen is (g.x > 0). So it is not drawn again: the blood squares' other pixels were most of each frame's work
  // zoomed in (Mohammad's Mac at rest, zoom 4.24, 21 Oct: 86 frames in 2 s against 121 at 3.08), for the same picture.
  if (bloodOnly == 1 && g.x == 0u) discard;
  vec2 w = (inv * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0)).xy;
  // The plate: the sharp view raster where it lies, else the whole-plate one.
  vec4 pl = vec4(0.0);
  if (stackOn == 1) pl = texelFetch(stackL, ip, 0);
  else if ((plates & 2) != 0) {
    vec2 uv = (w - plateRect1.xy) / plateRect1.zw;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) pl = texture(plate1, uv);
    else if ((plates & 1) != 0) pl = texture(plate0, (w - plateRect0.xy) / plateRect0.zw);
  } else if ((plates & 1) != 0) {
    vec2 uv = (w - plateRect0.xy) / plateRect0.zw;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) pl = texture(plate0, uv);
  }
  if (pl.a > 0.0) { float l = dot(pl.rgb / pl.a, vec3(0.299, 0.587, 0.114)); pl = vec4(mix(vec3(l) * pl.a, pl.rgb, plateSat), pl.a) * plateAlpha; }
  // A glow lies behind the organs: the liver and the vessels pass over it.
  if (glowOn == 1) pl = over(pl, texelFetch(glowL, ip, 0));
  // A warm glow lies on the organs, under the vessels: added after the plate's dimming, so it keeps one strength whatever the lens
  // greys the organs to, and with or without the plate (the page's own organs show under it then).
  if (warmOn == 1) pl = over(texelFetch(warmL, ip, 0), pl);
  // Ascites over the plate and the vessels (they show through it), in its own color whatever the lens: a meniscus (highest at the flanks)
  // with a slow two-part ripple, deeper fluid a little denser, a soft brighter band just under the surface.
  vec4 fluidC = vec4(0.0);
  if (fluidInk.a > 0.0) {
    vec2 fu = (w - fluidRect.xy) / fluidRect.zw;
    if (all(greaterThanEqual(fu, vec2(0.0))) && all(lessThanEqual(fu, vec2(1.0)))) {
      float c = (w.x - 712.0) / 400.0;
      float s = fluidS.x - fluidS.y * (0.8 + 0.2 * c * c) + (sin(w.x / 38.0 + fluidS.w) * 0.7 + sin(w.x / 23.0 - fluidS.w * 1.3) * 0.3) * fluidS.z;
      float d = w.y - s;
      // Inside the cavity: the row's half-width (between the two nearest rows) less the distance from the mirror line, over
      // the edge's slope there to give the distance across it, smoothed over a world unit or a pixel, whichever is more
      // (the raster it replaces was a world unit to the texel).
      float nR = float(textureSize(fluidMask, 0).x), fy = fu.y * (nR - 1.0);
      int r0 = int(min(floor(fy), nR - 2.0));
      float h0 = texelFetch(fluidMask, ivec2(r0, 0), 0).r, h1 = texelFetch(fluidMask, ivec2(r0 + 1, 0), 0).r;
      float sl = (h1 - h0) * (nR - 1.0) / fluidRect.w;
      float cav = (mix(h0, h1, fy - float(r0)) - abs(w.x - fluidRect.x - 0.5 * fluidRect.z)) / sqrt(1.0 + sl * sl);
      float e = smoothstep(-pxW, pxW, d) * clamp(0.5 + cav / max(pxW, 1.0), 0.0, 1.0);
      // Off the congested liver (organ picks, 20 Oct): above its lower edge, column by column across fluidRect in the
      // liver's own frame, the fluid is cut by fluidLv.y.
      if (fluidLv.y > 0.0 && e > 0.0) {
        vec2 lu = (w - vec2(560.0, 350.0)) / fluidLv.x + vec2(560.0, 350.0);
        float lx = clamp((lu.x - fluidRect.x) / fluidRect.z, 0.0, 1.0) * (nR - 1.0);
        int l0 = int(min(floor(lx), nR - 2.0));
        float lb = mix(texelFetch(fluidMask, ivec2(l0, 1), 0).r, texelFetch(fluidMask, ivec2(l0 + 1, 1), 0).r, lx - float(l0));
        e *= 1.0 - fluidLv.y * (1.0 - smoothstep(-pxW, pxW, lu.y - lb));
      }
      if (e > 0.0) {
        float a = fluidInk.a * (0.5 + 0.5 * clamp(d / max(fluidS.y, 1.0), 0.0, 1.0)) + fluidInk.a * 0.5 * exp(-d * d / 14.0);
        a = min(a, 1.0) * e;
        fluidC = vec4(fluidInk.rgb * a, a);
      }
    }
  }

  vec4 v = texelFetch(base, ip, 0);
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
      col = mix(col, oc, vis * blendA.z);
    }
    if (blood == 1) {
      // One streak field (the dominant lumen's), eased down toward the join, so two patterns never ghost over each other.
      vec4 A = bloodAt(id1, s1, y1, col);
      float a = A.a * (1.0 - 0.6 * smoothstep(0.02, 0.5, b));
      if (a > 0.0) col = mix(col, A.rgb, clamp(a * vis * flowA * blendA.x, 0.0, 1.0));
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
      // None under a figure reading on its vessel (stage.js noChevBoxes): cut along the box's edge with a pixel of antialiasing,
      // as the stent points' holes are, instead of a hard unantialiased edge through a head (round 2 review, B8).
      for (int i = 0; i < 12; i++) {
        if (i >= noChevN) break;
        vec2 q = abs(w - (noChev[i].xy + noChev[i].zw) * 0.5) - (noChev[i].zw - noChev[i].xy) * 0.5;
        c *= smoothstep(-pxW, pxW, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
      }
      // (none under a stent point's callout or round its dot: stage.js chevHoles)
      for (int i = 0; i < 16; i++) {
        if (i >= chevHoleN) break;
        vec4 h = chevHole[i];
        float hr = chevHoleR[i], dh;
        if (hr < 0.0) { vec2 ab = h.zw - h.xy; float t = clamp(dot(w - h.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); dh = length(w - h.xy - ab * t) + hr; }
        else dh = length(max(max(h.xy - w, w - h.zw), 0.0)) - hr;
        c *= smoothstep(-pxW, pxW, dh);
      }
      if (c.x + c.y > 0.0) {
        float rv = texelFetch(flow, ivec2(1, id1), 0).w;
        // A faint light rim lifts the head off the lumen; the head itself dark, or orange if reversed.
        // The head keeps its dark core, tinted at most a fifth toward a deep shade of the vessel's own colour (more loses
        // contrast on the faded cava and dark lumens), with the light rim as before.
        float ln1 = max(texelFetch(tube, ivec2(5, id1), 0).z, 1.0);
        vec3 vc = mix(texelFetch(tube, ivec2(0, id1), 0).rgb, texelFetch(tube, ivec2(1, id1), 0).rgb, clamp(s1 / ln1, 0.0, 1.0));
        vec3 ink = mix(chevInk, vc * 0.3, 0.2);
        // An orange head is lost on an orange vessel (the Direction lens, an orange step of another lens's ramp): there a
        // reversed head turns near-white cream and its rim a deep shade of the vessel, so it stands clear. By the vessel's own
        // colour and the eased reversed flag, so it follows the vessel's colour as that eases, never popping.
        float warm = rv * chevOrange(vc);
        col = mix(col, mix(inkLight, vc * 0.45, warm), c.y * 0.75 * vis * flowA * blendA.y);
        col = mix(col, mix(mix(ink, revCol, rv), chevLight, warm), c.x * vis * flowA * blendA.y);
      }
    }
    v = vec4(col * v.a, v.a);
  }
  // An active bleed. Inside the stomach, under the vessels that cross it (so the plate's depth holds): the pool, the stomach's own
  // lumen (STO, row by row) below a flat surface that ripples where the stream lands, lighter and thinner at the surface, darker
  // with depth and toward the wall; and the stream, a thread of blood that leaves the tear, curves out and falls to the pool,
  // thinning as it goes and breaking into drops when it is slow. Over everything, at the tear: the jets and drops, tapered
  // streaks with a bright core under a darker skin.
  vec3 bc = vec3(${cssRGB('--bleed-spray').map((v) => v.toFixed(1)).join(', ')}) / 255.0;
  vec3 bf = vec3(${cssRGB('--bleed-fresh').map((v) => v.toFixed(1)).join(', ')}) / 255.0;
  vec3 bd = vec3(${cssRGB('--bleed-deep').map((v) => v.toFixed(1)).join(', ')}) / 255.0;
  vec4 inner = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= bleedN) break;
    vec4 bE = bleedE[i], bB = bleedB[i];
    if (bB.w > 0.5 && bB.w < 1.5) continue;
    float a;
    vec3 bcol;
    if (bB.w > 1.5) {
      float u = max(w.y - bE.y, 0.0), lam = 26.0;
      float fall = clamp(u / max(bE.w - bE.y, 1.0), 0.0, 1.0);
      float sw = (bE.z - bE.x) * exp(-u / lam);
      float xc = bE.z - sw + 0.7 * sin(w.y * 0.06 - clock * 2.3) * smoothstep(0.1, 0.6, fall);
      float slope = sw / lam;
      // Lower down it pinches into drops, each swelling in the middle and trailing a thin neck to the next, uneven in size and
      // spacing, sliding down as they fall.
      float brk = bB.y * smoothstep(0.25, 0.85, fall);
      float ph = (w.y * 0.31 * (1.0 + 0.22 * sin(w.y * 0.047 + 1.3)) - clock * 9.0) / 6.2831853;
      float cell = floor(ph), bead = pow(max(sin(3.14159265 * (ph - cell)), 0.0), 0.55);
      float hv = fract(sin(cell * 12.9898 + 4.1) * 43758.5453);
      float r = bB.x * mix(1.0, 0.55, smoothstep(0.0, 0.9, fall)) * mix(1.0, 0.12 + (0.9 + 0.5 * hv) * bead, brk);
      float d = abs(w.x - xc) / sqrt(1.0 + slope * slope) - r;
      float lum = mix(0.5 + 0.5 * sin(w.y * 0.42 - clock * 13.0), bead, brk);
      a = (1.0 - smoothstep(-0.75 * pxW, 0.75 * pxW, d)) * bB.z * smoothstep(0.0, 3.0, w.y - bE.y) * (1.0 - smoothstep(bE.w - 1.5, bE.w + 0.5, w.y));
      bcol = mix(bc * 0.85, bf, 0.55 * lum + 0.35 * smoothstep(0.1, 0.9, clamp(-d / max(r, 1e-3), 0.0, 1.0)));
    } else {
      float dxl = w.x - bE.z;
      float sy = bE.x + bE.y * sin(w.x * 0.16 + clock * 1.7) + bE.w * (0.9 * sin(abs(dxl) * 0.4 - clock * 6.0) * exp(-abs(dxl) / 38.0) - 1.3 * exp(-dxl * dxl / 50.0));
      float under = w.y - sy;
      float f = clamp((w.y - STO_Y0) / STO_DY, 0.0, float(STO_N - 1));
      int i0 = int(floor(f)), i1 = min(i0 + 1, STO_N - 1);
      vec2 s0 = STO[i0], s1 = STO[i1], sp = mix(s0, s1, f - float(i0)), sl = (s1 - s0) / STO_DY;
      float dIn = min((w.x - sp.x - bB.x) / sqrt(1.0 + sl.x * sl.x), (sp.y - bB.x - w.x) / sqrt(1.0 + sl.y * sl.y));
      float depth = clamp(under / 95.0, 0.0, 1.0);
      bcol = mix(bc, bd, smoothstep(0.0, 1.0, depth));
      bcol = mix(bcol, bf * 1.2, 0.5 * smoothstep(0.4, 1.4, under) * (1.0 - smoothstep(1.4, 3.6, under)));
      bcol = mix(bcol, bd * 0.7, 0.5 * (1.0 - smoothstep(0.0, 9.0, dIn)));
      a = bB.z * smoothstep(-0.75 * pxW, 0.75 * pxW, dIn) * smoothstep(-0.75 * pxW, 0.75 * pxW, under);
    }
    if (a > 0.0) inner = over(vec4(min(bcol, vec3(1.0)) * a, a), inner);
  }
  vec4 o = over(fluidC, over(v, over(inner, pl)));
  for (int i = 0; i < 24; i++) {
    if (i >= bleedN) break;
    vec4 bE = bleedE[i], bB = bleedB[i];
    if (bB.w < 0.5 || bB.w > 1.5) continue;
    vec2 pa = w - bE.xy, ba = bE.zw - bE.xy;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    float r = mix(bB.x, bB.y, h), d = length(pa - ba * h) - r;
    float a = (1.0 - smoothstep(-0.75 * pxW, 0.75 * pxW, d)) * bB.z * (1.0 - 0.35 * h);
    vec3 bcol = mix(bc * 0.8, bf, smoothstep(0.15, 0.85, clamp(-d / max(r, 1e-3), 0.0, 1.0)));
    if (a > 0.0) o = over(vec4(min(bcol, vec3(1.0)) * a, a), o);
  }
  if (lineOn == 1) o = over(texelFetch(lineL, ip, 0), o);
  outColor = o;
}`;

// Organ outlines (a selected or hovered organ): a stroke of world width, drawn with the figure so a
// pan or zoom moves it in the same frame. Widened in device pixels so a hairline still covers its
// pixels (its alpha thins instead), and antialiased across both edges.
const LINE_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 nrm;
layout(location=2) in vec2 sideW;   // side (−1 or 1), half width (world units); a fill's edge fringe: (0 or 1, −1)
uniform mat3 world;
uniform vec2 size;
uniform float pack;   // 1: a warm glow, whose half width carries its fade too (64 x the fade in 63 steps + the width), so a run's ends can fade out
out float vD;
out float vW;
out float vF;
out float vY;
void main() {
  vY = pos.y;
  vec2 n = (world * vec3(nrm, 0.0)).xy;
  float k = max(length(n), 1e-6);
  float w = sideW.y;
  vF = 1.0;
  if (pack > 0.5 && w > 0.0) { float c = floor(w / 64.0); vF = c / 63.0; w -= 64.0 * c; }
  vW = w * k;
  float e = max(vW, 0.5) + 1.0;
  if (sideW.y < 0.0) { vW = 0.5; e = 1.0; }   // fading from the fill's edge to nothing one device pixel out
  vec2 d = (world * vec3(pos, 1.0)).xy + n / k * sideW.x * e;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vD = sideW.x * e;
}`;
const LINE_FS = `#version 300 es
precision highp float;
in float vD;
in float vW;
in float vF;
in float vY;
uniform vec4 col;   // rgb, alpha
uniform vec2 endFade;   // an outline or glow fades out between these two heights (the rectum's end: (0, 0) for none)
uniform float soft;   // 1: a glow, strongest on the edge and easing out as a Gaussian over its width (vD runs 0 to the full reach)
out vec4 o;
void main() {
  float a;
  float fe = (endFade.y > endFade.x ? clamp((endFade.y - vY) / (endFade.y - endFade.x), 0.0, 1.0) : 1.0);
  if (soft > 0.5) {
    float t = clamp(abs(vD) / (vW + 1.0), 0.0, 1.0);
    a = col.a * vF * exp(-4.5 * t * t) * (1.0 - smoothstep(0.55, 1.0, t)) * fe;
    // A hair of noise, so a long faint ramp does not step in 8-bit colour.
    a = max(a + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0, 0.0) * step(0.0005, a);
  } else a = col.a * clamp(max(vW, 0.5) + 0.5 - abs(vD), 0.0, 1.0) * min(1.0, vW * 2.0) * fe;
  o = vec4(col.rgb * a, a);
}`;

// A program is started (its shaders compiled and linked) and finished (its status read) apart: every program of a context is
// started first, then each is finished, so with KHR_parallel_shader_compile the driver compiles them side by side instead of
// one wait each; a shader object can be shared (the composite's fragment shader serves both of its programs, compiled once).
// (The lobule's prewarm compile was a 2.4–3.6 s task; round 2 review, P10.)
function shader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}
function startProgram(gl, vs, fs) {
  const sh = [typeof vs === 'string' ? shader(gl, gl.VERTEX_SHADER, vs) : vs, typeof fs === 'string' ? shader(gl, gl.FRAGMENT_SHADER, fs) : fs];
  const p = gl.createProgram();
  for (const x of sh) gl.attachShader(p, x);
  gl.linkProgram(p);
  return { p, sh };
}
function finishProgram(gl, { p, sh }) {
  for (const x of sh) if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
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

/**
 * Signed curvature of a polyline at each of its N_SAMPLES points into out (1 / world units), positive turning toward the
 * side the shader's across coordinate calls +y (cross(along, offset) > 0); lightly smoothed, the ends copy their neighbours.
 */
export function bendCurvature(pts, out = new Float32Array(N_SAMPLES)) {
  const n = Math.min(pts?.length || 0, N_SAMPLES), k = new Float32Array(N_SAMPLES);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1], bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
    const ds = 0.5 * (Math.hypot(ax, ay) + Math.hypot(bx, by));
    k[i] = ds > 1e-6 ? Math.atan2(ax * by - ay * bx, ax * bx + ay * by) / ds : 0;
  }
  if (n > 2) { k[0] = k[1]; k[n - 1] = k[n - 2]; }
  for (let i = 0; i < N_SAMPLES; i++) out[i] = i < n ? (k[Math.max(0, i - 1)] + 2 * k[i] + k[Math.min(n - 1, i + 1)]) / 4 : 0;
  return out;
}

export function createVeinsGL(canvas, { tubes: nTubes, force = false }) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: !OWN_BUF, failIfMajorPerformanceCaveat: !force }); } catch { gl = null; }
  if (!gl) return null;
  const pcx = gl.getExtension('KHR_parallel_shader_compile');
  let started;
  try {
    const compFS = shader(gl, gl.FRAGMENT_SHADER, COMP_FS()), compVS = shader(gl, gl.VERTEX_SHADER, COMP_VS), compCellVS = shader(gl, gl.VERTEX_SHADER, COMP_CELL_VS);
    const plainFS = shader(gl, gl.FRAGMENT_SHADER, COMP_FS(true));
    // (The two vessel builds share one vertex shader object, so a cell's corners land on the same device positions whichever
    // program draws it: neighbouring cells drawn by different programs meet edge to edge, no pixel left out or drawn twice.)
    const vesVS = shader(gl, gl.VERTEX_SHADER, VS);
    started = { prog: startProgram(gl, vesVS, vesselFS(false)), simple: GENERIC ? null : startProgram(gl, vesVS, vesselFS(true)), comp: startProgram(gl, compVS, compFS), compCell: startProgram(gl, compCellVS, compFS), plain: startProgram(gl, compVS, plainFS), plainCell: startProgram(gl, compCellVS, plainFS), cath: startProgram(gl, CATH_VS, CATH_FS), line: startProgram(gl, LINE_VS, LINE_FS) };
  } catch (e) { console.warn('Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.', e); return null; }
  // (Shaders are freed with the programs that hold them, once no program is still to be finished: see prepare.)
  const freeShaders = () => { for (const x of new Set(Object.values(started).filter(Boolean).flatMap((st) => st.sh))) gl.deleteShader(x); };
  // The optional builds (the one-vessel vessel program, the plain composite) are not needed to draw: every cell and every
  // frame can be drawn by the general ones. With KHR_parallel_shader_compile they are left compiling here and published by
  // prepare() once the driver says they are done, never waited on (addendum §10.1); until then the general ones draw, the
  // same picture. Without the extension they are finished here with the rest, as before.
  const later = pcx ? [...(started.simple ? ['simple'] : []), 'plain'] : [];
  let prog;
  try { prog = finishProgram(gl, started.prog); } catch (e) { console.warn('Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.', e); freeShaders(); return null; }
  // The one-vessel build (see vesselFS): null when it is switched off or failed, and every cell keeps the general program.
  let simpleP = null;
  const finishSimple = () => {
    try { simpleP = finishProgram(gl, started.simple); } catch (e) { console.warn('Veins renderer: the one-vessel shader failed; every cell keeps the general one.', e); gl.deleteProgram(started.simple.p); simpleP = null; }
  };
  if (started.simple && !later.includes('simple')) finishSimple();
  let comp, compCell;
  try { comp = finishProgram(gl, started.comp); compCell = finishProgram(gl, started.compCell); } catch (e) { console.warn('Veins renderer: composite shader failed.', e); freeShaders(); return null; }
  // The plain composite (see COMP_FS), both passes or neither: null when it failed, and every frame keeps the full one.
  let plain = null, plainCell = null;
  const finishPlain = () => {
    try { plain = finishProgram(gl, started.plain); plainCell = finishProgram(gl, started.plainCell); } catch (e) {
      console.warn('Veins renderer: the plain composite failed; every frame keeps the full one.', e);
      gl.deleteProgram(started.plain.p); gl.deleteProgram(started.plainCell.p); plain = plainCell = null;
    }
  };
  if (!later.includes('plain')) finishPlain();
  const plates = [null, null];   // [whole plate, sharp view] : { tex, rect }
  // The organs as layers instead of one picture (the ?perf switch "GPU organs", stage.js): null where it cannot be made.
  const stack = createOrganStack(gl);
  let cathP = null;
  try { cathP = finishProgram(gl, started.cath); } catch (e) { console.warn('Veins renderer: catheter shader failed.', e); }
  const cathBuf = gl.createBuffer(), cathVAO = gl.createVertexArray();
  gl.bindVertexArray(cathVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, cathBuf);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 2, gl.FLOAT, false, 24, i * 8); }
  gl.bindVertexArray(null);
  let cath = null, cathWas = false, cathCap = 0, cathBase = null;   // cathCap: bytes the catheter's buffer holds (refilled in place while it fits); cathBase: the base it holds
  let lineP = null;
  try { lineP = finishProgram(gl, started.line); } catch (e) { console.warn('Veins renderer: outline shader failed.', e); }
  if (!later.length) freeShaders();
  const lineBuf = gl.createBuffer(), lineVAO = gl.createVertexArray();
  gl.bindVertexArray(lineVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 2, gl.FLOAT, false, 24, i * 8); }
  gl.bindVertexArray(null);
  const lineVers = [0, 0, 0], lineSigs = ['', '', ''];
  let skipped = false;
  let pictureSeq = 0;   // counts the times the canvas was drawn on (composite, clear): what the glass compares to know its copy of the figure is still current
  let lines = null, linesWas = false, lineKey = '', glowKey = '', warmKey = '', lastMk = '';
  // The outlines are drawn into a layer of their own when they change, and the composite lays it over the picture: the
  // cells-only pass then keeps them, so an open organ card no longer repaints the whole picture every frame. Glows
  // (draws marked soft) have a layer too, which the composite lays under the organs.
  const makeLayer = () => { const tex = dataTex(gl); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return { tex, fbo: gl.createFramebuffer(), w: 0, h: 0 }; };
  const lineLayer = makeLayer(), glowLayer = makeLayer(), warmLayer = makeLayer();
  const hasSoft = () => !!lines?.draws.some((d) => d.soft && !d.warm), hasHard = () => !!lines?.draws.some((d) => !d.soft), hasWarm = () => !!lines?.draws.some((d) => d.warm);
  function renderLayer(L, m, soft, warm = false) {
    if (L.w !== canvas.width || L.h !== canvas.height) {
      L.w = canvas.width; L.h = canvas.height;
      gl.bindTexture(gl.TEXTURE_2D, L.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, L.w, L.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
    gl.viewport(0, 0, L.w, L.h);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    drawLines(m, soft, warm);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function freeLayer(L) {   // back to a single texel while nothing is drawn in it
    if (!L.w) return;
    L.w = L.h = 0;
    gl.bindTexture(gl.TEXTURE_2D, L.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  function drawLines(m, soft, warm = false) {
    const U = lineP.u;
    gl.useProgram(lineP.p);
    gl.uniformMatrix3fv(U.world, false, new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]));
    gl.uniform2f(U.size, canvas.width, canvas.height);
    gl.uniform1f(U.soft, soft ? 1 : 0);
    gl.uniform1f(U.pack, warm ? 1 : 0);
    gl.enable(gl.BLEND);
    // The warm glow's strips take the strongest where they meet (one colour, so max is exact on premultiplied output): overlaps never stack.
    if (warm) { gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE); } else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(lineVAO);
    for (const d of lines.draws) {
      if (d.alpha <= 0 || !!d.soft !== !!soft || !!d.warm !== warm) continue;
      gl.uniform4f(U.col, ...d.col, d.alpha);
      gl.uniform2f(U.endFade, d.endFade ? d.endFade[0] : 0, d.endFade ? d.endFade[1] : 0);
      gl.drawArrays(d.tri ? gl.TRIANGLES : gl.TRIANGLE_STRIP, d.first, d.count);
    }
    gl.bindVertexArray(null);
    if (warm) gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
  }

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
  // The cells the one-vessel build draws (veins-bin simpleCells), out of cellBuf, which holds the rest; nGen, nSimple of each.
  const simpleBuf = gl.createBuffer();
  const cellVAO = (buf) => {
    const v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return v;
  };
  const oneVAO = cellVAO(simpleBuf);
  let nGen = 0, nSimple = 0, simpleOf = null;
  // Each cell to the program that draws it: the one-vessel build where the cell's list proves it can, else the general one.
  function uploadCells() {
    simpleOf = simpleP && cellsCPU ? simpleCells(cellsCPU, nCells, entCPU) : null;
    const { gen, one, nGen: g, nOne: o } = splitCells(cellsCPU || new Float32Array(0), cellsCPU ? nCells : 0, simpleOf);
    gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gen, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, simpleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, one, gl.STATIC_DRAW);
    nGen = g; nSimple = o;
  }
  // The cells a lumen can reach (binVeins' `blood`): a frame where only the blood moved repaints these alone (see composite).
  const bloodVAO = gl.createVertexArray(), bloodBuf = gl.createBuffer();
  gl.bindVertexArray(bloodVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bloodBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  let nBlood = 0;
  // Some of those cells, for a redraw of only the vessels that changed (see drawRows).
  const partVAO = gl.createVertexArray(), partBuf = gl.createBuffer();
  gl.bindVertexArray(partVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  // (Split as the whole layer's cells are: partBuf holds the general program's, partSBuf the one-vessel build's, partG and partS of each.)
  const partSBuf = gl.createBuffer(), partSVAO = cellVAO(partSBuf);
  let partG = 0, partS = 0;
  // The ascites surface band: cells redrawn each frame while its ripple runs.
  const fluidBuf = gl.createBuffer(), fluidVAO = gl.createVertexArray();
  gl.bindVertexArray(fluidVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, fluidBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  // The pool below a level that moved (fluidPool): its cells composited whole once, instead of the whole picture.
  const poolBuf = gl.createBuffer(), poolVAO = gl.createVertexArray();
  gl.bindVertexArray(poolVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, poolBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  // The box of the organ stack that changed (a live organ's ease, organs-gl render): its cells composited whole once, as the pool's.
  const dirtBuf = gl.createBuffer(), dirtVAO = gl.createVertexArray();
  gl.bindVertexArray(dirtVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, dirtBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  let nDirt = 0;
  // The cells (world origins on the CELL grid) that cover a device box under m, into dirtBuf.
  function dirtCells(b, m) {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9, ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
      const dx = px - m[4], dy = py - m[5], x = ia * dx + ic * dy, y = ib * dx + id * dy;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const cells = [];
    for (let y = Math.floor(y0 / CELL) * CELL; y < y1; y += CELL) for (let x = Math.floor(x0 / CELL) * CELL; x < x1; x += CELL) cells.push(x, y);
    gl.bindBuffer(gl.ARRAY_BUFFER, dirtBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cells), gl.DYNAMIC_DRAW);
    nDirt = cells.length / 2;
  }
  const fluidTex = dataTex(gl);
  let fluidRect = null, nFluid = 0, fluidN = 0, fluidLiver = null, nPool = 0;
  const compVAO = gl.createVertexArray();
  gl.bindVertexArray(compVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const entTex = dataTex(gl), radTex = dataTex(gl), rmaxTex = dataTex(gl), tubeTex = dataTex(gl), organTex = dataTex(gl, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, radTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, N_SAMPLES, nTubes, 0, gl.RG, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, rmaxTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(nTubes));
  gl.bindTexture(gl.TEXTURE_2D, tubeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TUBE_TEXELS, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, organTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  const bendTex = dataTex(gl);
  gl.bindTexture(gl.TEXTURE_2D, bendTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, N_SAMPLES, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(N_SAMPLES * nTubes));
  const radRow = new Float32Array(N_SAMPLES * 2), rmaxOne = new Float32Array(1), bendRow = new Float32Array(N_SAMPLES);
  // Per-vessel blood (FLOW_TEXELS texels a row) and dye (DYE_BINS along the course).
  const flowTex = dataTex(gl), dyeTex = dataTex(gl, gl.LINEAR);
  let flowSent = null;   // (the blood rows as last uploaded: setFlow)
  gl.bindTexture(gl.TEXTURE_2D, flowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, FLOW_TEXELS, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, dyeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, DYE_BINS, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(DYE_BINS * nTubes));
  // The vessel layer, rendered when something changes: its color, and the lumen buffer.
  let fbo = gl.createFramebuffer();
  let baseTex = dataTex(gl), gTex = dataTex(gl), gTex2 = dataTex(gl), depTex = dataTex(gl);
  // (depTex: whether a lumen colour reaches each pixel, see the shader. The vessel pass reads it only in a colour-only
  // redraw, into tintFbo, which holds the colour alone; otherwise it reads depNone, a texel no framebuffer holds.)
  const tintFbo = gl.createFramebuffer(), depNone = dataTex(gl);
  gl.bindTexture(gl.TEXTURE_2D, depNone);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
  let fboW = 0, fboH = 0, baseM = null, dyeAny = false, wasBleeding = false;
  const ATTACH = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3];
  const ATTACH_ONE = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.NONE, gl.COLOR_ATTACHMENT3];   // (the one-vessel build's: see vesselDraw)
  // fboOK: the vessel layer holds a whole draw of the current geometry, radii and organ covers, at baseM, so a redraw of
  // some of its cells (drawRows) leaves it exactly as a whole draw would. Cleared by anything else the vessel pass reads.
  let fboOK = false;
  function ensureFBO() {
    if (fboW === canvas.width && fboH === canvas.height) return;
    fboW = canvas.width; fboH = canvas.height; fboOK = false; dropSpare();
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, fboW, fboH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, gTex2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, fboW, fboH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, depTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fboW, fboH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, gTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, gTex2, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, depTex, 0);
    gl.drawBuffers(ATTACH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // Clears the bound vessel framebuffer's four targets (within the scissor, when it is on).
  function clearLayer() {
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferuiv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clearBufferuiv(gl.COLOR, 2, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 3, [0, 0, 0, 0]);
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
      gl.drawArrays(d.tri ? gl.TRIANGLES : gl.TRIANGLE_STRIP, d.first, d.count);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  let nCells = 0, lost = false, organRect = null, partCells = 0, tintCells = 0;
  // ── A pan at the same scale ──
  // The transform's translation is rounded to whole device pixels (the whole figure, plate and vessels together, moves by
  // at most half a pixel), so a pan moves the vessel layer by whole pixels. Each pixel's world position comes from the
  // pixel itself (see the shader), so the layer drawn at the new spot equals the old one moved by those pixels, exactly;
  // only the strips it uncovers have to be drawn. The moved copy goes into a second set of buffers (the two then swap),
  // kept only while panning.
  const whole = (m) => (Number.isInteger(m[4]) && Number.isInteger(m[5]) ? m : [m[0], m[1], m[2], m[3], Math.round(m[4]), Math.round(m[5])]);
  // What the vessel pass reads from the look (anything else in it only matters to the composite).
  const lookKey = (k) => JSON.stringify([k.reach, k.shOff, k.casing, k.shadow, k.sheen, k.shade, k.ring, k.light, k.netAlpha, k.fx, k.tierAlpha, k.tierGroup, k.organs]);
  let tubesNew = true, drawnLook = '';
  const spare = { fbo: gl.createFramebuffer(), base: dataTex(gl), g: dataTex(gl), g2: dataTex(gl), dep: dataTex(gl), w: 0, h: 0, timer: 0 };
  function spareSize(w, h) {
    spare.w = w; spare.h = h;
    gl.bindTexture(gl.TEXTURE_2D, spare.base);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const t of [spare.g, spare.g2]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, w, h, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null); }
    gl.bindTexture(gl.TEXTURE_2D, spare.dep);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, spare.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, spare.base, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, spare.g, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, spare.g2, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, spare.dep, 0);
    gl.drawBuffers(ATTACH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // (Given back a moment after the last pan: it is as big as the layer itself.)
  function dropSpare() { clearTimeout(spare.timer); if (spare.w && !lost) spareSize(1, 1); spare.w = spare.h = 0; }
  function shiftLayer(m, look, dx, dy) {
    if (spare.w !== fboW || spare.h !== fboH) spareSize(fboW, fboH);
    clearTimeout(spare.timer); spare.timer = setTimeout(dropSpare, 1500);
    // dx, dy: device pixels, y down; the buffers run y up.
    const W = fboW, H = fboH, ey = -dy;
    const sx0 = Math.max(0, -dx), sx1 = W - Math.max(0, dx), sy0 = Math.max(0, -ey), sy1 = H - Math.max(0, ey);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, spare.fbo);
    gl.disable(gl.SCISSOR_TEST);
    for (let i = 0; i < ATTACH.length; i++) {
      gl.readBuffer(ATTACH[i]);
      gl.drawBuffers(ATTACH.map((a, j) => (j === i ? a : gl.NONE)));
      gl.blitFramebuffer(sx0, sy0, sx1, sy1, sx0 + dx, sy0 + ey, sx1 + dx, sy1 + ey, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.drawBuffers(ATTACH);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    // The moved copy is now the layer.
    [fbo, spare.fbo] = [spare.fbo, fbo];
    [baseTex, spare.base] = [spare.base, baseTex];
    [gTex, spare.g] = [spare.g, gTex];
    [gTex2, spare.g2] = [spare.g2, gTex2];
    [depTex, spare.dep] = [spare.dep, depTex];
    // The uncovered strips: cleared, then drawn as a whole draw draws them.
    const strips = [];
    if (dx > 0) strips.push([0, 0, dx, H]); else if (dx < 0) strips.push([W + dx, 0, -dx, H]);
    if (ey > 0) strips.push([0, 0, W, ey]); else if (ey < 0) strips.push([0, H + ey, W, -ey]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.SCISSOR_TEST);
    for (const [x, y, w, h] of strips) {
      gl.scissor(x, y, w, h);
      clearLayer();
      vesselPass(m, look, [vao, nGen], [oneVAO, nSimple]);
    }
    gl.disable(gl.SCISSOR_TEST);
  }
  // The binned cells on the CPU, and (built when first asked) each vessel row's cells: a row's attributes can change
  // only the pixels of the cells that list it, since each pixel is drawn from its own cell's list alone.
  let cellsCPU = null, entCPU = null, rowCells = null, bloodCPU = null;
  // The rows whose radii changed since the layer was last drawn: a partial redraw has to include them all.
  const radRows = new Set();
  const radCovered = (rows) => !radRows.size || (!!rows && [...radRows].every((r) => rows.includes(r)));
  // Every vessel's attributes as last sent (tubeNow) and as the layer shows them (tubeDrawn: copied at each draw, whole or
  // partial, since the rows a partial draw is given hold every change): a row whose lumen colours alone changed is
  // recoloured (tintPass) rather than drawn again (see splitRows).
  const ROW_W = TUBE_TEXELS * 4, tubeNow = new Float32Array(nTubes * ROW_W);
  let tubeDrawn = null;
  const drawnNow = () => (tubeDrawn ||= new Float32Array(tubeNow.length)).set(tubeNow);
  // The changed rows' cells: drawn again whole (shape), and the others recoloured (tint), with the cells to do each in.
  function rowParts(rows) {
    const { shape, tint } = splitRows(rows, tubeNow, tubeDrawn, ROW_W, radRows);
    const part = cellsOfRows(shape);
    return { part, tintPart: cellsOfRows(tint, part.mark) };
  }
  // The marked cells' quads, for partVAO (the general program's) and partSVAO (the one-vessel build's).
  function uploadPart({ mark }) {
    const { gen, one, nGen: g, nOne: o } = splitCells(cellsCPU, nCells, simpleOf, mark);
    gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gen, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, partSBuf);
    gl.bufferData(gl.ARRAY_BUFFER, one, gl.DYNAMIC_DRAW);
    partG = g; partS = o;
  }
  // Draws the marked cells again over the layer (written whole: a pixel left empty is written empty).
  function cellsPass(m, look, part) {
    if (part.k) {
      uploadPart(part);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fboW, fboH);
      vesselPass(m, look, [partVAO, partG], [partSVAO, partS], true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    partCells += part.k;
  }
  // Recolours the marked cells: the pixels a lumen colour reaches (depTex) are drawn again by the vessel pass itself, into
  // the colour target alone (their lumen and joins, flow and the colour-reach mark depend on no colour, so they stand);
  // the rest keep their colour, which depends on no lumen colour. Only for rows whose lumen colours alone changed.
  function tintPass(m, look, part) {
    if (part.k) {
      uploadPart(part);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tintFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTex, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, fboW, fboH);
      vesselPass(m, look, [partVAO, partG], [partSVAO, partS], true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    tintCells += part.k;
  }
  // The cells that list any of `rows` (marked), but not those marked in `skip`.
  function cellsOfRows(rows, skip = null) {
    if (!rowCells) {
      rowCells = new Map();
      for (let c = 0; c < nCells; c++) {
        const s0 = cellsCPU[c * 6 + 2], n = cellsCPU[c * 6 + 3];
        let prev = -1;
        for (let e = s0; e < s0 + n; e++) {
          const row = entCPU[e * 8 + 4];
          if (row === prev) continue;   // (a cell's list is grouped by vessel)
          prev = row;
          let a = rowCells.get(row);
          if (!a) rowCells.set(row, a = []);
          if (a[a.length - 1] !== c) a.push(c);
        }
      }
    }
    const mark = new Uint8Array(nCells);
    let k = 0;
    for (const r of rows) for (const c of rowCells.get(r) || []) if (!mark[c] && !skip?.[c]) { mark[c] = 1; k++; }
    return { mark, k };
  }
  // The vessel pass into the bound vessel framebuffer (draw() clears it first): `gen`, [vertex array, count] of cells for the
  // general program, and `one`, those for the one-vessel build (simpleCells). Each cell is drawn by exactly one of them.
  function vesselPass(m, look, gen, one, redraw = false, tint = false) {
    gl.disable(gl.BLEND);
    if (gen[1]) vesselDraw(prog, m, look, gen[0], gen[1], redraw, tint);
    if (one[1] && simpleP) vesselDraw(simpleP, m, look, one[0], one[1], redraw, tint);
  }
  function vesselDraw({ p, u }, m, look, va, count, redraw, tint) {
    const M = new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
    gl.useProgram(p);
    gl.uniformMatrix3fv(u.world, false, M);
    gl.uniform2f(u.size, canvas.width, canvas.height);
    gl.uniform1f(u.cell, CELL);
    gl.uniform1f(u.px, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    gl.uniform4f(u.invA, m[3] / det, -m[1] / det, -m[2] / det, m[0] / det);
    gl.uniform2f(u.tOff, m[4], m[5]);
    gl.uniform2f(u.sizeF, canvas.width, canvas.height);
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
    gl.uniform1i(u.redraw, redraw ? 1 : 0);
    gl.uniform1i(u.tint, tint ? 1 : 0);
    gl.uniform1fv(u.tierAlpha, look.tierAlpha);
    gl.uniform1iv(u.tierGroup, look.tierGroup);
    gl.uniform1i(u.useOrgan, look.organs > 0 && organRect ? 1 : 0);
    gl.uniform1f(u.organK, +look.organs || 0);
    if (organRect) gl.uniform4f(u.organRect, ...organRect);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, entTex); gl.uniform1i(u.ent, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, radTex); gl.uniform1i(u.rad, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tubeTex); gl.uniform1i(u.tube, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, organTex); gl.uniform1i(u.organ, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, rmaxTex); gl.uniform1i(u.rmax, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tint ? depTex : depNone); gl.uniform1i(u.depL, 5);
    gl.bindVertexArray(va);
    // The one-vessel build writes no second-lumen target (8 of the layer's 21 bytes a pixel): in its cells that target is zero
    // already, as every whole draw clears it, a pan moves each pixel with the spot of the figure it shows (so within the same
    // cell), and nothing else writes there. (In a colour-only redraw only the colour target is bound anyway.)
    const skip2 = !tint && p !== prog.p;
    if (skip2) gl.drawBuffers(ATTACH_ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    if (skip2) gl.drawBuffers(ATTACH);
    gl.bindVertexArray(null);
  }
  // The picture's own copy (?vesselbuf=own): what the canvas would keep with preserveDrawingBuffer. Every composite draws
  // into it and present() copies it whole onto the canvas, so the canvas always holds a whole, current picture, whatever the
  // browser did with the last one. Null without the switch (the canvas keeps its picture itself).
  const own = OWN_BUF ? { tex: dataTex(gl), fbo: gl.createFramebuffer(), w: 0, h: 0 } : null;
  if (own) { gl.bindTexture(gl.TEXTURE_2D, own.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
  // (Sized to the canvas, cleared; true when it was just made, so the next picture is drawn whole.)
  function ownSize() {
    if (own.w === canvas.width && own.h === canvas.height) return false;
    own.w = canvas.width; own.h = canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, own.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, own.w, own.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, own.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, own.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }
  // The kept picture onto the canvas, every pixel, as it is (no scaling, no filtering).
  function present() {
    if (!own?.w || lost) return;
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, own.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, own.w, own.h, 0, 0, own.w, own.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // The composite's textures, each on its unit (U: the program's uniforms; the flags: which of the layers it lays this frame).
  function compBind(U, layer, glow, warm, useStack) {
    const bind = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U[name], unit); };
    bind(0, baseTex, 'base'); bind(1, gTex, 'gbuf'); bind(2, flowTex, 'flow'); bind(3, radTex, 'rad'); bind(4, tubeTex, 'tube');
    bind(5, dyeTex, 'dye'); bind(6, plates[0]?.tex || baseTex, 'plate0'); bind(7, plates[1]?.tex || baseTex, 'plate1'); bind(8, gTex2, 'gbuf2'); bind(9, fluidTex, 'fluidMask');
    bind(10, lineLayer.tex, 'lineL'); gl.uniform1i(U.lineOn, layer ? 1 : 0);
    bind(11, glowLayer.tex, 'glowL'); gl.uniform1i(U.glowOn, glow ? 1 : 0);
    bind(13, warmLayer.tex, 'warmL'); gl.uniform1i(U.warmOn, warm ? 1 : 0);
    bind(12, bendTex, 'bend');
    bind(14, useStack ? stack.texture : baseTex, 'stackL'); gl.uniform1i(U.stackOn, useStack ? 1 : 0);
  }

  // ── The optional builds published when the driver has them ready (addendum §10.1) ──
  // Polled at each composite, never waited on: a build whose compile and link the driver reports done (COMPLETION_STATUS_KHR)
  // is finished (its status read, which no longer waits), drawn once into a 1 × 1 target of the layer's own formats with the
  // real state (a driver can leave work for a program's first draw), and only then used. Publishing the one-vessel build
  // sorts the cells again and asks for one whole vessel draw.
  let lastLook = null, warmT = null;
  function warmTarget() {
    if (warmT) return warmT;
    const fb = gl.createFramebuffer(), tx = ATTACH.map(() => dataTex(gl)), buf = gl.createBuffer();
    const fmt = [[gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], [gl.RGBA16UI, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT], [gl.RGBA16UI, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT], [gl.R8, gl.RED, gl.UNSIGNED_BYTE]];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    tx.forEach((t, i) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, fmt[i][0], 1, 1, 0, fmt[i][1], fmt[i][2], null); gl.framebufferTexture2D(gl.FRAMEBUFFER, ATTACH[i], gl.TEXTURE_2D, t, 0); });
    gl.drawBuffers(ATTACH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // (One cell far off the figure: it lists nothing, so its pixels, none of them inside the target anyway, draw nothing.)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1e6, -1e6, 0, 0, 0, 0]), gl.STATIC_DRAW);
    return (warmT = { fb, tx, buf, va: cellVAO(buf) });
  }
  function warm(k) {
    const w = warmTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, w.fb);
    gl.viewport(0, 0, 1, 1);
    gl.disable(gl.BLEND);
    if (k === 'simple' && lastLook && baseM) vesselDraw(simpleP, baseM, lastLook, w.va, 1, false, false);
    if (k === 'plain') {
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      for (const [P, va] of [[plain, compVAO], [plainCell, w.va]]) {
        gl.useProgram(P.p);
        compBind(P.u, false, false, false, false);
        gl.bindVertexArray(va);
        if (va === compVAO) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); else gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
      }
      gl.bindVertexArray(null);
      gl.drawBuffers(ATTACH);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function prepare() {
    if (!later.length || lost) return;
    for (const k of [...later]) {
      const sts = k === 'plain' ? [started.plain, started.plainCell] : [started.simple];
      if (!sts.every((st) => gl.getProgramParameter(st.p, pcx.COMPLETION_STATUS_KHR))) continue;
      later.splice(later.indexOf(k), 1);
      if (k === 'plain') { finishPlain(); if (plainCell) warm('plain'); }
      else { finishSimple(); if (simpleP) { warm('simple'); uploadCells(); fboOK = false; } }
    }
    if (!later.length) freeShaders();
  }
  const onLost = (e) => { e.preventDefault(); lost = true; };
  canvas.addEventListener('webglcontextlost', onLost);
  // A software renderer (no usable GPU: the browser draws on the CPU) is told apart so the stage
  // can draw less often and at a lower resolution there.
  let software;
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    software = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  } catch { software = false; }

  // For the ?perf readout (gpuProbe on): how much of the canvas the squares a frame repaints cover (cells: 6 floats each, the
  // square's corner first; m: world → device pixels).
  function squaresOnScreen(cells, n, m) {
    if (!cells) return '';
    const W = canvas.width, H = canvas.height, sx = Math.abs(m[0]) + Math.abs(m[2]), sy = Math.abs(m[1]) + Math.abs(m[3]);
    let px = 0, k = 0;
    for (let c = 0; c < n; c++) {
      const x = m[0] * cells[c * 6] + m[2] * cells[c * 6 + 1] + m[4], y = m[1] * cells[c * 6] + m[3] * cells[c * 6 + 1] + m[5];
      const x0 = Math.min(x, x + m[0] * CELL, x + m[2] * CELL, x + (m[0] + m[2]) * CELL), y0 = Math.min(y, y + m[1] * CELL, y + m[3] * CELL, y + (m[1] + m[3]) * CELL);
      const w = Math.min(W, x0 + sx * CELL) - Math.max(0, x0), h = Math.min(H, y0 + sy * CELL) - Math.max(0, y0);
      if (w > 0 && h > 0) { px += w * h; k++; }
    }
    return `${k} of ${n}, ${(px / 1e6).toFixed(1)} MP of ${(W * H / 1e6).toFixed(1)}, ${Math.round(sx * CELL)} px each`;
  }
  const api = {
    get lost() { return lost; },
    /** Whether the browser renders WebGL on the CPU. */
    software,
    /** Uploads the binned geometry (from binVeins). */
    setGeometry(bins) {
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, bins.rows || 1, 0, gl.RGBA, gl.FLOAT, bins.ent.length ? bins.ent : new Float32Array(ENT_W * 4));
      cellsCPU = bins.cells; entCPU = bins.ent; nCells = bins.nCells;
      uploadCells();
      gl.bindBuffer(gl.ARRAY_BUFFER, bloodBuf);
      gl.bufferData(gl.ARRAY_BUFFER, bins.blood || bins.cells, gl.STATIC_DRAW);
      nBlood = bins.blood ? bins.nBlood : bins.nCells;
      bloodCPU = bins.blood || bins.cells;
      cellsCPU = bins.cells; entCPU = bins.ent; rowCells = null; fboOK = false;
    },
    /**
     * Uploads a binning patched in place (binVeins' `patch`: the spans of rows [r0, r1] of the entries that changed; the
     * cells did not), over the binning last uploaded, which it must be.
     */
    patchGeometry(bins) {
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      for (const [r0, r1] of bins.patch) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, ENT_W, r1 - r0 + 1, gl.RGBA, gl.FLOAT, bins.ent.subarray(r0 * ENT_W * 4, (r1 + 1) * ENT_W * 4));
      fboOK = false;
    },
    /** A vessel's lumen radius at each of its N_SAMPLES samples. */
    setRadii(row, r) {
      for (let i = 0; i < N_SAMPLES; i++) { radRow[i * 2] = r[i]; radRow[i * 2 + 1] = r[Math.min(N_SAMPLES - 1, i + 1)]; }
      gl.bindTexture(gl.TEXTURE_2D, radTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, N_SAMPLES, 1, gl.RG, gl.FLOAT, radRow);
      rmaxOne[0] = Math.max(...radRow);
      gl.bindTexture(gl.TEXTURE_2D, rmaxTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, 1, 1, gl.RED, gl.FLOAT, rmaxOne);
      // (A vessel's radii change only the pixels of the cells that list it, as its attributes do: drawRows may stand in
      // for a whole draw when it is given this row.)
      radRows.add(row);
    },
    /** A vessel's axis (N_SAMPLES points, as binned): its signed curvature at each sample, for the flow arrowheads. */
    setBend(row, pts) {
      bendCurvature(pts, bendRow);
      gl.bindTexture(gl.TEXTURE_2D, bendTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, N_SAMPLES, 1, gl.RED, gl.FLOAT, bendRow);
    },
    /** Every vessel's attributes: nTubes × TUBE_TEXELS × 4 floats. */
    setTubes(data) {
      tubesNew = true;
      tubeNow.set(data.length > tubeNow.length ? data.subarray(0, tubeNow.length) : data);
      gl.bindTexture(gl.TEXTURE_2D, tubeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TUBE_TEXELS, nTubes, gl.RGBA, gl.FLOAT, data);
    },
    /** The organ covers as a world-space bitmap (alpha) and the world rectangle it spans. */
    setOrgans(bitmap, rect) {
      gl.bindTexture(gl.TEXTURE_2D, organTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      organRect = rect; fboOK = false;
    },
    /**
     * A plate raster on its way in (plate-upload.js): a W × H texture of its own, filled by plateRows and shown by setPlate.
     * The texture shown meanwhile stays as it was.
     */
    plateJob(W, H) {
      const tex = dataTex(gl, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return { tex, W };
    },
    /** Rows y to y + rows of a plate raster on its way in: premultiplied RGBA pixels. */
    plateRows(job, y, rows, pixels) {
      gl.bindTexture(gl.TEXTURE_2D, job.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, job.W, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    },
    /** Shows a filled plate raster (0: the whole plate, 1: a sharper one of the view) over the world rectangle it spans. */
    setPlate(slot, job, rect) {
      if (plates[slot]) gl.deleteTexture(plates[slot].tex);
      plates[slot] = { tex: job.tex, rect };
      stack?.drop(slot);
    },
    /** A plate raster given up on its way in. */
    dropJob(job) { gl.deleteTexture(job.tex); },
    /**
     * The peritoneal cavity (the ascites is drawn inside it) over a world rectangle: its half-width about the rectangle's
     * middle at rows evenly from its top to its bottom (anatomy.js cavityHalfWidths).
     */
    setFluidSpans(halfWidths, rect) {
      const n = halfWidths.length, rows = new Float32Array(n * 2).fill(-1e4);
      rows.set(halfWidths);
      if (fluidLiver?.length === n) rows.set(fluidLiver, n);
      gl.bindTexture(gl.TEXTURE_2D, fluidTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, n, 2, 0, gl.RED, gl.FLOAT, rows);
      fluidRect = rect; fluidN = n;
    },
    /** The liver's lower edge (in its own frame, before its scale) at the same number of columns evenly across the cavity's rectangle. */
    setFluidLiver(bottoms) {
      fluidLiver = bottoms;
      if (fluidN !== bottoms.length) return;
      gl.bindTexture(gl.TEXTURE_2D, fluidTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 1, fluidN, 1, gl.RED, gl.FLOAT, bottoms);
    },
    /**
     * The ascites level moved (or its ink faded): the next composite draws again, whole, the cells of the cavity from world row `top`
     * down, the only pixels the fluid can change (its surface, and its depth shading below it), and no whole picture for it. False
     * without a cavity: the caller repaints the whole picture.
     */
    fluidPool(top) {
      if (!fluidRect) return false;
      const [x0, y0, w, h] = fluidRect, cells = [];
      for (let y = Math.max(y0, top) - CELL; y < y0 + h + CELL; y += CELL) for (let x = x0 - CELL; x < x0 + w + CELL; x += CELL) cells.push(x, y);
      gl.bindBuffer(gl.ARRAY_BUFFER, poolBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cells), gl.DYNAMIC_DRAW);
      nPool = cells.length / 2;
      return true;
    },
    /** World origins (x, y pairs) of the cells the ascites surface ripples through. */
    setFluidCells(cells) {
      gl.bindBuffer(gl.ARRAY_BUFFER, fluidBuf);
      gl.bufferData(gl.ARRAY_BUFFER, cells, gl.DYNAMIC_DRAW);
      nFluid = cells.length / 2;
    },
    dropPlate(slot) { if (plates[slot]) { gl.deleteTexture(plates[slot].tex); plates[slot] = null; } stack?.drop(slot); },
    hasPlate: (slot) => !!plates[slot] || !!stack?.has(slot),
    /** The organs' layers (organs-gl.js), or null: a filled raster job (plateJob) is staged for a slot and the set committed whole. */
    organs: stack && {
      stage(slot, name, job, rect, at = 0) { stack.stage(slot, name, job.tex, rect, at); },
      /** A layer's picture painted on the GPU from its organs' shapes (organs-gl bake): a job stepped a frame at a time, then staged. */
      bake: (slot, name, groups, rect, scale, at = 0) => stack.bake(slot, name, groups, rect, scale, at),
      dropKept: () => stack.dropKept(),
      stats: () => stack.stats(),
      commit(slot, names) {
        // (One kind of picture at a time: the layers replace the flattened plate of the same slot.)
        if (plates[slot]) { gl.deleteTexture(plates[slot].tex); plates[slot] = null; }
        stack.commit(slot, names);
      },
      dropStaged: (slot) => stack.dropStaged(slot),
      has: (slot) => stack.has(slot),
      /** Organs painted live in the stack, and layers' live masks (organs-gl setLive); the names it lays, in order. */
      get canLive() { return stack.canLive; },
      setLive: (organs, masks) => stack.setLive(organs, masks),
      setOrder: (names) => stack.setOrder(names),
      /** A layer gathered under a live mask now at dy world units down (the bowel's float on the ascites). */
      shift: (name, dy) => stack.shift(name, dy),
    },
    /** Per-vessel blood: nTubes × FLOW_TEXELS × 4 floats (see stage.js). */
    setFlow(data) {
      // (Only the span of rows that differ from the last upload goes up, and nothing while they all match, as when paused:
      // flow-rows.js changedRows. The first upload of this context sends every row.)
      const stride = FLOW_TEXELS * 4;
      let lo = 0, hi = nTubes - 1;
      if (!flowSent) flowSent = Float32Array.from(data.subarray(0, nTubes * stride));
      else {
        const span = changedRows(data, flowSent, stride, nTubes);
        if (!span) { if (gpuProbe.on) gpuProbe.note(COUNTED.flowSame); return; }
        [lo, hi] = span;
      }
      const sub = data.subarray(lo * stride, (hi + 1) * stride);
      if (gpuProbe.on) gpuProbe.note('uploaded: setFlow', sub.byteLength / 1024);
      gl.bindTexture(gl.TEXTURE_2D, flowTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, lo, FLOW_TEXELS, hi - lo + 1, gl.RGBA, gl.FLOAT, sub);
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
    draw(m, look, blood, rows = null) {
      m = whole(m);
      lastLook = look;
      ensureFBO();
      const lk = lookKey(look);
      const dx = baseM ? m[4] - baseM[4] : 0, dy = baseM ? m[5] - baseM[5] : 0;
      // A pan at the same scale, with nothing else changed since the layer was drawn whole: the layer is moved by those
      // whole pixels and only the strips it uncovers are drawn (see shiftLayer). Otherwise it is drawn whole. `rows`
      // (as drawRows takes them): the vessels whose attributes alone changed since the last draw, when the caller knows
      // them all; the moved layer then has their cells drawn again too (a model playing while the figure is dragged).
      let parts = null;
      const panAt = fboOK && radCovered(rows) && lk === drawnLook && (dx || dy) && Math.abs(dx) < fboW / 2 && Math.abs(dy) < fboH / 2 && m.slice(0, 4).every((v, i) => v === baseM[i]);
      if (panAt && rows?.length) { parts = rowParts(rows); if (parts.part.k > nCells * 0.6) parts = null; }
      const pan = panAt && (!(tubesNew || radRows.size) || parts);
      // (For the ?perf readout: a pan shift, or a whole draw and the first condition that made it one.)
      if (gpuProbe.on) {
        if (pan) gpuProbe.note(COUNTED.pan);
        else {
          gpuProbe.note(COUNTED.whole);
          gpuProbe.note(COUNTED.wholeWhy + (!fboOK ? 'no kept layer' : !radCovered(rows) ? 'radii changed' : lk !== drawnLook ? 'look changed' : !(dx || dy) ? 'same place'
            : !(Math.abs(dx) < fboW / 2 && Math.abs(dy) < fboH / 2) ? 'moved too far' : !m.slice(0, 4).every((v, i) => v === baseM[i]) ? 'zoom or turn' : 'tubes changed'));
        }
      }
      if (pan) { shiftLayer(m, look, dx, dy); if (parts) { cellsPass(m, look, parts.part); tintPass(m, look, parts.tintPart); } }
      else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, fboW, fboH);
        clearLayer();
        vesselPass(m, look, [vao, nGen], [oneVAO, nSimple]);
      }
      baseM = m; drawnLook = lk; tubesNew = false; radRows.clear(); drawnNow();
      fboOK = true;
      if (gpuProbe.on) gpuProbe.gauge('vessel cells, one-vessel program', simpleP ? `${nSimple} of ${nCells}` : 'off');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.composite(look, blood, true);
    },
    /**
     * Redraws only the cells that list the vessel rows given (their attributes changed: a colour, a fade), then the
     * picture as a frame of the moving blood does. The vessel layer ends exactly as draw() would leave it: a pixel is
     * drawn from its own cell's list alone, so a row can change only its own cells. Allowed only when nothing else the
     * vessel pass reads changed since the last whole draw: transform `m` and size (checked here), geometry and organ
     * covers (each clears fboOK) and `look` (the caller checks it); `rows` must include every row whose radii changed. `full`: as composite's. Returns false, drawing nothing, when it
     * cannot stand in for draw() or would cover most of the cells anyway: the caller then calls draw().
     */
    drawRows(m, look, blood, rows, full = false) {
      m = whole(m);
      if (!fboOK || lost || fboW !== canvas.width || fboH !== canvas.height || !baseM || m.some((v, i) => v !== baseM[i]) || !radCovered(rows)) return false;
      // (Rows whose lumen colours alone changed are recoloured, which draws again only the pixels those colours reach:
      // however many cells list them, that costs less than a whole draw. The rest have their cells drawn again whole.)
      const { part, tintPart } = rowParts(rows);
      if (part.k > nCells * 0.6) return false;
      tubesNew = false; radRows.clear();
      if (gpuProbe.on) gpuProbe.note(COUNTED.rows);
      cellsPass(m, look, part);
      tintPass(m, look, tintPart);
      drawnNow();
      // (Only the cells drawn again are composited whole; every other cell's pixels outside a lumen read what they read last frame, so
      // the blood's own frame does for them. It was every vessel cell whole for one changed cell. External review, 21 Oct.)
      const both = part.k + tintPart.k;
      if (both) { const mark = part.mark; for (let c = 0; c < nCells; c++) if (tintPart.mark[c]) mark[c] = 1; uploadPart({ mark, k: both }); }
      this.composite(look, blood, full, both);
      return true;
    },
    /** Cells redrawn by drawRows so far (whole, and recoloured only), and the cells of the whole layer (for the checks). */
    get partCells() { return partCells; },
    get tintCells() { return tintCells; },
    get nCells() { return nCells; },
    /**
     * The picture from the last vessel layer: plate, vessels, blood, dye, bleed. Cheap; runs
     * every animation frame. `blood`: { on, look, origin, clock, originCol, dyeCol, inkLight,
     * inkDark, bleed: [[x0, y0, x1, y1, r0, r1, alpha, kind]] (stage.js bleedSpray) }. Not `full`, it repaints only the cells a
     * lumen can reach (binVeins' `blood`): the moving blood, chevrons, dye and origin colours are drawn only in a lumen, and
     * every other pixel of a vessel cell comes out as the last frame left it. `part`: that many cells of partVAO first, whole: the
     * cells drawRows drew again (the vessel layer changed under them).
     */
    composite(look, blood = {}, full = false, part = 0) {
      if (!baseM || fboW !== canvas.width || fboH !== canvas.height) return;
      prepare();
      if (gpuProbe.on) gpuProbe.gauge('shaders still compiling', later.length ? later.join(', ') : 'none');
      // (The ?perf test switch "no GPU picture": no frame is drawn while it is on, and the first one after is whole.)
      if (gpuProbe.skipGL) { skipped = true; return; }
      if (skipped) { skipped = false; full = true; }
      // A bleed sprays outside the vessels: the whole picture is repainted while it lasts, and once after.
      const bleeding = !!blood.bleed?.length;
      if (bleeding || wasBleeding) full = true;
      // So does the catheter (it reaches past the vessel cells), and once after it is gone.
      if (cath || cathWas) full = true;
      cathWas = !!cath;
      // The organ outlines (over the vessels) are a layer redrawn when they or the view change, with one whole repaint
      // then and once after they go. Under the catheter's passes they are drawn last, as before, over it.
      const m = baseM, mk = m.join(',');
      // While the view moves (a pan, a zoom, a slide's camera glide) every frame is a whole repaint anyway, so the outlines are drawn
      // straight onto it, as under the catheter, instead of into their layer first: that was one more full-screen pass a frame. The
      // layer is made again on the first frame the view holds still, and that frame is a whole repaint too.
      const moving = mk !== lastMk;
      lastMk = mk;
      const hard = hasHard(), glow = hasSoft(), layer = hard && !cath && !moving;
      // (Each layer has its own version: an outline's change redraws the outline layer alone, a glow's the glow's. External review, 21 Oct.)
      const at = `|${mk}|${canvas.width}x${canvas.height}`, vk = lineVers[0] + at;
      if (layer) {
        if (vk !== lineKey) { gpuProbe.time(gl, 'outline layer', () => renderLayer(lineLayer, m, false)); lineKey = vk; full = true; }
      } else if (!hard) { freeLayer(lineLayer); lineKey = ''; }
      else if (moving) { lineKey = ''; full = true; }
      // (The glow lies behind the organs, so the catheter never draws over it: its layer holds whatever the catheter does.)
      if (glow) {
        if (lineVers[1] + at !== glowKey) { gpuProbe.time(gl, 'glow layer', () => renderLayer(glowLayer, m, true)); glowKey = lineVers[1] + at; full = true; }
      } else { freeLayer(glowLayer); glowKey = ''; }
      // (The warm glow lies on the organs: no catheter draws under it either.)
      const warm = hasWarm();
      if (warm) {
        if (lineVers[2] + at !== warmKey) { gpuProbe.time(gl, 'warm layer', () => renderLayer(warmLayer, m, true, true)); warmKey = lineVers[2] + at; full = true; }
      } else { freeLayer(warmLayer); warmKey = ''; }
      if (linesWas && !lines) full = true;
      linesWas = !!lines;
      wasBleeding = bleeding;
      // The organs' layers drawn into their texture when the view or the layers changed: the whole picture is drawn then.
      const useStack = !!(look.plate?.stack && stack?.has(0));
      // (Only a live organ's own box changed: the cells over it are composited again, as the pool's are; the rest of the picture is as it was.)
      let dirt = 0;
      if (useStack && stack.stale(m, canvas.width, canvas.height)) {
        if (gpuProbe.on) gpuProbe.note(COUNTED.organs);
        const r = gpuProbe.time(gl, 'organ layers', () => stack.render(m, canvas.width, canvas.height));
        if (r === true) full = true;
        else if (r) { dirtCells(r, m); dirt = nDirt; if (gpuProbe.on) gpuProbe.gauge('organ layers: box', `${r[2] - r[0]}×${r[3] - r[1]} px, ${dirt} cells`); }
      }
      // (The kept picture made again, at a new canvas size: empty, so this picture is drawn whole into it.)
      if (own && ownSize()) full = true;
      if (full) dirt = 0;
      const fl = look.fluid && fluidRect ? look.fluid : null;
      const pool = full ? 0 : nPool;
      nPool = 0;
      if (!full && !nCells && !(fl?.ripple && nFluid) && !pool && !dirt) return;
      pictureSeq++;
      if (gpuProbe.on) { if (full) gpuProbe.note('whole picture'); if (!look.plate) gpuProbe.note('organ picture down'); }
      if (gpuProbe.on) { gpuProbe.note(COUNTED.picture); if (full) gpuProbe.note(COUNTED.pictureWhole); }
      const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
      // device → world: the inverse of [a c e; b d f].
      const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
      const ie = -(ia * m[4] + ic * m[5]), iff = -(ib * m[4] + id * m[5]);
      if (own) gl.bindFramebuffer(gl.FRAMEBUFFER, own.fbo);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      // (The plain build where the frame has no dye, no origin colours and no bleed: the values its constants hold.)
      const bare = !!plainCell && !(dyeAny && blood.dye !== false) && !blood.origin && !blood.bleed?.length;
      const prg = full ? (bare ? plain : comp) : (bare ? plainCell : compCell);
      if (gpuProbe.on) gpuProbe.gauge('composite build', bare ? 'plain' : 'full');
      gl.useProgram(prg.p);
      const U = prg.u;
      if (!full) {
        gl.uniformMatrix3fv(U.world, false, put(SCR.world, [m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]));
        gl.uniform2f(U.size, canvas.width, canvas.height);
        gl.uniform1f(U.cell, CELL);
      }
      gl.uniformMatrix3fv(U.inv, false, put(SCR.inv, [ia, ib, 0, ic, id, 0, ie, iff, 1]));
      gl.uniform1f(U.H, canvas.height);
      gl.uniform1f(U.pxW, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
      const pm = (look.plate && !useStack ? (plates[0] ? 1 : 0) | (plates[1] ? 2 : 0) : 0);
      gl.uniform1i(U.plates, pm);
      gl.uniform1f(U.plateAlpha, look.plate?.alpha ?? 0);
      gl.uniform1f(U.plateSat, look.plate?.sat ?? 1);
      gl.uniform4f(U.plateRect0, ...(plates[0]?.rect || [0, 0, 1, 1]));
      gl.uniform4f(U.plateRect1, ...(plates[1]?.rect || [0, 0, 1, 1]));
      gl.uniform4f(U.fluidRect, ...(fluidRect || [0, 0, 1, 1]));
      gl.uniform4f(U.fluidS, ...(fl?.s || [0, 0, 0, 0]));
      // (The fluid is drawn here with the plate off too, the live organs showing under the canvas: one look while the plate is
      // down for a slow fill and after it lands, where the page's SVG copy had a brighter surface line; Ascites slide 5, 17 Oct.)
      gl.uniform4f(U.fluidInk, ...(fl ? fl.ink : [0, 0, 0, 0]));
      gl.uniform2f(U.fluidLv, ...(fl?.lv || [1, 0]));
      gl.uniform1i(U.blood, blood.on ? 1 : 0);
      gl.uniform1i(U.chev, blood.chev ? 1 : 0);
      gl.uniform1i(U.still, blood.still ? 1 : 0);
      gl.uniform1f(U.flowA, blood.alpha ?? 1);
      gl.uniform3f(U.blendA, blood.streakA ?? 1, blood.chevA ?? 1, blood.originA ?? 1);
      gl.uniform3f(U.chevInk, ...(blood.chevInk || [0.08, 0.08, 0.1]));
      gl.uniform3f(U.chevLight, ...(blood.chevLight || [1, 0.93, 0.86]));
      gl.uniform1f(U.cssPx, blood.vdpr || 1);
      gl.uniform1i(U.look, blood.look === 'shimmer' ? 1 : 0);
      gl.uniform1i(U.origin, blood.origin ? 1 : 0);
      gl.uniform1i(U.dyeOn, dyeAny && blood.dye !== false ? 1 : 0);
      gl.uniform1f(U.clock, blood.clock || 0);
      gl.uniform1f(U.rows, nTubes);
      gl.uniform3fv(U.originCol, originColOf(blood.originCol || ORIGIN_WHITE));
      gl.uniform3f(U.dyeCol, ...(blood.dyeCol || [0.8, 0.95, 0.2]));
      gl.uniform3f(U.revCol, ...(blood.revCol || [1, 0.55, 0.16]));
      gl.uniform3f(U.inkLight, ...(blood.inkLight || [1, 1, 1]));
      gl.uniform3f(U.inkDark, ...(blood.inkDark || [0.1, 0.1, 0.16]));
      const bl = blood.bleed || [];
      const be = SCR.be.fill(0), bb = SCR.bb.fill(0);
      for (let i = 0; i < Math.min(24, bl.length); i++) for (let j = 0; j < 4; j++) { be[i * 4 + j] = bl[i][j]; bb[i * 4 + j] = bl[i][4 + j]; }
      gl.uniform4fv(U.bleedE, be);
      gl.uniform4fv(U.bleedB, bb);
      gl.uniform1i(U.bleedN, Math.min(24, bl.length));
      const nc = (blood.noChev || []).slice(0, 12), ncv = SCR.ncv.fill(0);
      nc.forEach((b, i) => ncv.set(b, i * 4));
      gl.uniform4fv(U.noChev, ncv);
      gl.uniform1i(U.noChevN, nc.length);
      const ho = (blood.holes || []).slice(0, 16), hb = SCR.hb.fill(0), hr = SCR.hr.fill(0);
      ho.forEach((x, i) => { hb.set(x.slice(0, 4), i * 4); hr[i] = x[4] || 0; });
      gl.uniform4fv(U.chevHole, hb); gl.uniform1fv(U.chevHoleR, hr); gl.uniform1i(U.chevHoleN, ho.length);
      compBind(U, layer, glow, warm, useStack);
      if (full) {
        gl.uniform1i(U.bloodOnly, 0);
        if (gpuProbe.on) gpuProbe.gauge('blood squares on screen', 'whole picture');
        gl.bindVertexArray(compVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        if (gpuProbe.on) gpuProbe.gauge('blood squares on screen', squaresOnScreen(bloodCPU, nBlood, m));
        // (The blood's own frame skips the pixels with no lumen; the cells drawRows drew again (`part`) and the fluid's ripple, which
        // moves the whole of its cells, are drawn whole. A pixel drawn twice comes out the same: no blending, and from its own inputs.)
        gl.uniform1i(U.bloodOnly, 0);
        if (part) { if (partG) { gl.bindVertexArray(partVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, partG); } if (partS) { gl.bindVertexArray(partSVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, partS); } }
        gl.uniform1i(U.bloodOnly, 1);
        if (nBlood) { gl.bindVertexArray(bloodVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nBlood); }
        gl.uniform1i(U.bloodOnly, 0);
        if (fl?.ripple && nFluid) { gl.bindVertexArray(fluidVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nFluid); }
        if (pool) { gl.bindVertexArray(poolVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pool); }
        if (dirt) { gl.bindVertexArray(dirtVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, dirt); }
      }
      gl.bindVertexArray(null);
      if (cath) gpuProbe.time(gl, 'catheter', () => drawCath(m));
      if (hard && !layer) gpuProbe.time(gl, 'outlines', () => drawLines(m, false));
      if (own) present();
    },
    /** Whether organ outlines can be drawn here (else stage.js keeps its SVG ones). */
    get canLines() { return !!lineP; },
    /**
     * Organ outlines, or null: { verts: Float32Array (x, y, normal x, y, side, half width per vertex; world units),
     * draws: [{ first, count, col: [r, g, b], alpha, tri (a fill: triangles, half width 1e4, side 0), soft (a glow behind the organs: side 0 on the edge and ±1 at the reach, half width = the reach), warm (with soft: the same glow on the organs and under the vessels instead of behind them) }] }.
     * Alphas may change without new verts.
     */
    setLines(spec) {
      const fresh = spec && spec.verts !== lines?.verts;
      lines = lineP && spec?.draws?.length ? spec : null;
      if (!lines) return;
      // (Per layer: the outlines (0), the glow behind the organs (1) and the warm glow on them (2), as drawLines sorts the draws.)
      const sigs = [[], [], []];
      for (const d of lines.draws) sigs[d.warm ? 2 : d.soft ? 1 : 0].push(`${d.first},${d.count},${d.alpha},${d.col},${d.tri ? 1 : 0},${d.endFade ? 1 : 0}`);
      for (let i = 0; i < 3; i++) { const sig = sigs[i].join(';'); if (fresh || sig !== lineSigs[i]) { lineSigs[i] = sig; lineVers[i]++; } }
      if (!fresh) return;
      if (gpuProbe.on) gpuProbe.note('uploaded: setLines', lines.verts.byteLength / 1024);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, lines.verts, gl.DYNAMIC_DRAW);
    },
    /** Whether the catheter can be drawn here (else stage.js keeps its SVG one). */
    get canCath() { return !!cathP; },
    /**
     * The HVPG catheter, or null: { base: Float32Array | null, verts: Float32Array (x, y, dirX, dirY, u, v per vertex),
     * draws: [{ mode, first, count, col: [r, g, b], alpha, fade: [in, out], len }], light: [x, y] }. base: vertices that stay
     * frame to frame (the shaft along the whole route), first in the buffer and sent only when it is a new array; verts follow
     * it, sent every time; a draw's `first` counts from the start of base.
     */
    setCath(spec) {
      cath = cathP && spec?.draws?.length ? spec : null;
      if (!cath) return;
      const base = cath.base || null, at = base ? base.byteLength : 0, need = at + cath.verts.byteLength;
      if (gpuProbe.on) gpuProbe.note('uploaded: setCath', ((base && base !== cathBase ? at : 0) + cath.verts.byteLength) / 1024);
      gl.bindBuffer(gl.ARRAY_BUFFER, cathBuf);
      if (need > cathCap) { cathCap = need * 2; gl.bufferData(gl.ARRAY_BUFFER, cathCap, gl.DYNAMIC_DRAW); cathBase = null; }
      if (base && base !== cathBase) gl.bufferSubData(gl.ARRAY_BUFFER, 0, base);
      cathBase = base;
      if (cath.verts.byteLength) gl.bufferSubData(gl.ARRAY_BUFFER, at, cath.verts);
    },
    /** Changes whenever the canvas is drawn on again (the glass takes a new copy of the figure only then). */
    get drawSeq() { return pictureSeq; },
    clear() { pictureSeq++; if (own?.w) { gl.bindFramebuffer(gl.FRAMEBUFFER, own.fbo); gl.viewport(0, 0, own.w, own.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); nCells = nBlood = nGen = nSimple = 0; baseM = null; fboOK = false; },
    /** The current picture as a PNG data URL (call right after draw, in the same task). */
    snapshot() { present(); return canvas.toDataURL('image/png'); },
    /**
     * The canvas holding the whole current picture, for a reader that takes it in this same task (a download, a handout, the glass'
     * copy, drawImage, createImageBitmap, toDataURL): with ?vesselbuf=own the kept picture is copied onto it first, so the reader
     * never depends on the canvas having kept its own picture. Every export of the figure goes through here.
     */
    capture() { present(); return canvas; },
    /**
     * With ?vesselbuf=own: copies the kept picture onto the canvas again, so a reader of the canvas outside the frame that drew it
     * (a copy for the glass, a picture taken later) reads the whole current picture. Does nothing without the switch.
     */
    present,
    /**
     * Gives back the vessel framebuffer (21 bytes a pixel) and the outline layer while the picture is not shown;
     * everything else stays, and the next draw reallocates them.
     */
    trim() {
      if (lost) return;
      for (const t of [baseTex, gTex, gTex2, depTex]) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        if (t === baseTex) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        else if (t === depTex) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
      }
      fboW = fboH = 0; baseM = null; fboOK = false; dropSpare();
      freeLayer(lineLayer); freeLayer(glowLayer); freeLayer(warmLayer); lineKey = glowKey = warmKey = '';
      stack?.trim();
      if (own?.w) { own.w = own.h = 0; gl.bindTexture(gl.TEXTURE_2D, own.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    },
    /**
     * Frees every GPU object (textures, the vessel framebuffer, buffers, programs) and stops
     * listening to the canvas. The instance is dead afterwards; make a new one to draw again.
     * `lose: true` also gives the context back to the browser (WEBGL_lose_context): the canvas
     * then cannot draw until the browser restores it, so give the next instance a new canvas.
     */
    dispose({ lose = false } = {}) {
      canvas.removeEventListener('webglcontextlost', onLost);
      if (!lost) {
        for (const t of [entTex, radTex, bendTex, rmaxTex, tubeTex, organTex, flowTex, dyeTex, fluidTex, baseTex, gTex, gTex2, depTex, depNone, lineLayer.tex, glowLayer.tex, warmLayer.tex, ...plates.map((x) => x?.tex)]) if (t) gl.deleteTexture(t);
        for (const b of [quad, cellBuf, simpleBuf, bloodBuf, partBuf, partSBuf, fluidBuf, poolBuf, dirtBuf, cathBuf, lineBuf]) gl.deleteBuffer(b);
        for (const v of [vao, oneVAO, bloodVAO, partVAO, partSVAO, fluidVAO, poolVAO, dirtVAO, compVAO, cathVAO, lineVAO]) gl.deleteVertexArray(v);
        for (const x of [prog, simpleP, comp, compCell, plain, plainCell, cathP, lineP]) if (x) gl.deleteProgram(x.p);
        stack?.dispose();
        clearTimeout(spare.timer);
        for (const t of [spare.base, spare.g, spare.g2, spare.dep]) gl.deleteTexture(t);
        gl.deleteFramebuffer(spare.fbo);
        gl.deleteFramebuffer(fbo); gl.deleteFramebuffer(tintFbo); gl.deleteFramebuffer(lineLayer.fbo); gl.deleteFramebuffer(glowLayer.fbo); gl.deleteFramebuffer(warmLayer.fbo);
        if (own) { gl.deleteTexture(own.tex); gl.deleteFramebuffer(own.fbo); }
        if (warmT) { for (const t of warmT.tx) gl.deleteTexture(t); gl.deleteFramebuffer(warmT.fb); gl.deleteBuffer(warmT.buf); gl.deleteVertexArray(warmT.va); }
        // (Builds still compiling: given back unpublished, with every shader.)
        if (later.length) { for (const k of later) for (const st of k === 'plain' ? [started.plain, started.plainCell] : [started.simple]) gl.deleteProgram(st.p); later.length = 0; freeShaders(); }
        if (lose) gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      plates[0] = plates[1] = null; lines = cath = null; nCells = nBlood = nFluid = nGen = nSimple = 0; baseM = null; fboW = fboH = 0;
      lost = true;
    },
  };
  // (Timed for the debug overlay's GPU readout: gpu-probe.js. Off, each call costs one check.)
  const steps = { draw: 'vessels', drawRows: 'vessels', composite: 'picture', setGeometry: 'uploads', setRadii: 'uploads', setTubes: 'uploads',
    setOrgans: 'uploads', plateJob: 'uploads', plateRows: 'uploads', setPlate: 'uploads', setFluidSpans: 'uploads', setFluidCells: 'uploads', setFlow: 'uploads', setDye: 'uploads' };
  // (And, for the ?perf readout, how much each upload sent, in KB: a camera-only frame should send none of the model's.)
  const kbOf = {
    setGeometry: (b) => (b.ent.byteLength + b.cells.byteLength + (b.blood?.byteLength || 0)) / 1024, setRadii: () => N_SAMPLES * 8 / 1024,
    setTubes: (d) => d.byteLength / 1024, setDye: (d) => (d ? d.byteLength / 1024 : 0), setFluidCells: (c) => c.byteLength / 1024,
    setOrgans: (bm) => (bm.width * bm.height * 4) / 1024, plateRows: (job, y, rows, px) => px.byteLength / 1024,
  };
  for (const [k, name] of Object.entries(steps)) {
    const f = api[k];
    api[k] = function (...a) {
      if (!gpuProbe.on) return f.apply(this, a);
      if (kbOf[k]) { let kb = 0; try { kb = kbOf[k](...a); } catch { /* a count only */ } gpuProbe.note(`uploaded: ${k}`, kb); }
      return gpuProbe.time(gl, name, () => f.apply(this, a));
    };
  }
  return api;
}
