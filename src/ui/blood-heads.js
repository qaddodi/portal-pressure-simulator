// The flow arrowheads as instanced quads (5 Nov 2026, blood-render-recs part 2 rec 11, with parts 4 and 5).
//
// Until now every lumen pixel of every blood frame asked "is there a head here?" (veins-gl.js chevAt → chevOne): the spacing level,
// two mods, radius and flow reads, a second pass for a chained vessel's root stream, and near a head a loop over up to 12 no-arrowhead
// boxes and 16 holes. Most pixels have no head. Now the composite leaves the heads out (chevQuad) and one quad per head is drawn
// over it, after it, in the same target: the vertex shader places the head where chevOne would (the same spacing, the same stream,
// the same run on through a chained join, so a head runs from a trunk into each branch it chains to and splits at a fork), points it
// along the axis there, and works out its size, fade and colours once; only the pixels inside head quads run the head's shape.
//
// The quad's fragment shader lays the head onto the picture the composite just wrote, as the composite would have laid it:
//   • only on a lumen pixel whose front lumen is the head's vessel (or the vessel it joins, by the join's share), by its visibility;
//   • only on pixels this frame's composite drew again (a still lumen the composite leaves alone keeps the head it already has);
//   • under the ascites and the organ outlines' layer, which lie over the vessels: a premultiplied head h over the lumen colour,
//     then fluid F and outlines L over that, is the picture plus α(F + (1 − Fa)(L-free head) …), so the head is sent through F and L
//     before it is blended (exact over an opaque lumen; on a ghosted lumen the head takes the lumen's opacity);
//   • cut by the same no-arrowhead boxes and holes, per pixel (they are only tested inside a head's quad now).
// A frame with a bleed keeps the old per-pixel heads (its jets lie over the vessels), and so does a renderer that was given no axes
// (the lobule): veins-gl decides per frame.
//
// The vertex shader reads each vessel's axis from a small texture (veins-gl setBend: the binned points, N_SAMPLES a row, equal arc
// apart) and the rows it already has (flow, rad, tube). The instance list (createHeadList) is (row, k, run) per possible head, sized
// from each vessel's length on the CPU and made again only when a size changes.

import { CHEV_PITCH, CHEV_PITCH_GLSL, headInksGLSL } from './chevron-glsl.js';

/** The closest two heads of one run ever stand along their stream (chevLevel: the level is at least -1, so 14 world units). */
export const P_MIN = 14;

/** The spacing rule of chevron-glsl.js, in JS (for the node trace, scripts/chevron-trace.mjs, and the tests): chevLevel and chevKeep. */
export function headLevel(pxW, cssPx, B, stillLv = -1) {
  const Pt = CHEV_PITCH * cssPx * pxW;
  return { lv: Math.max(Math.max(-1, Math.log2(Pt * Math.abs(B) / 28)), stillLv), Pt };
}
export function headKeep(j, n0, lv) {
  let m = 0, q = Math.abs(j);
  for (let i = 0; i < 10; i++) { if (q < 0.5 || q % 2 > 0.5) break; q *= 0.5; m += 1; }
  if (q < 0.5) m = 10;
  return Math.min(1, Math.max(0, 2 ** (1 - (lv - n0 - m)) - 1));
}

/**
 * The quads' vertex shader. zoom: ZOOM_VS (pxW and the composite's zoom outputs, which the composite build declares as inputs);
 * along: ALONG_GLSL; rows: ROWS_GLSL (radAt, flowD, rootDD); orange: CHEV_ORANGE_GLSL; nSamples: N_SAMPLES; pitch: the text of
 * chevron-glsl.js chevLevel and chevKeep (CHEV_PITCH_GLSL).
 */
export function headVS({ zoom, along, rows, orange, nSamples, pitch = CHEV_PITCH_GLSL }) {
  // alloc-rare: assembles the shader text once when the renderer's programs are made (veins-gl.js), never per frame
  return `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 corner;     // the quad, 0 … 1
layout(location=1) in vec3 head;       // per head: its vessel's row, its place in the run (k: 0, 1, … from just before the vessel's start), the run (0 its own stream, 1 the root stream it is chained to)
uniform mat3 world;                    // world → device pixels
uniform vec2 size;
uniform highp sampler2D flow;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D axis;          // per vessel: its axis, ${nSamples} points (x, y), equal arc apart (veins-gl setBend); then its heads' run (setHeadRuns)
uniform highp float bT;
uniform int still;
uniform float cssPx;
uniform vec3 chevInk, chevLight, revCol, inkLight;
uniform vec3 blendA;                   // (the origin lens's share, in z: chevInks)
uniform int origin;
${zoom}
${along}
${rows}
${headInksGLSL(orange)}
${pitch}
flat out vec4 hC;                      // the head's centre (world) and the way it points (unit)
flat out vec4 hS;                      // its half width (world), its strength (0 … 1), its vessel's row, its reversed flag (0 … 1)
flat out vec3 hInk, hRim;              // the colours of its core and of its rim
const int N_LAST = ${nSamples - 1};
void main() {
  zoomOut();
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // (no head: outside the clip box, nothing drawn)
  hC = vec4(0.0); hS = vec4(0.0); hInk = vec3(0.0); hRim = vec3(0.0);
  int id = int(head.x + 0.5);
  bool root = head.z > 0.5;
  vec4 f0 = texelFetch(flow, ivec2(0, id), 0), f1 = texelFetch(flow, ivec2(1, id), 0);
  if (f1.z <= 0.0) return;
  // (chevAt: one size for the whole vessel, from its caliber midway; the spacing is the screen's, chevPitch.)
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  float R = max(texelFetch(rad, ivec2(N_LAST / 2, id), 0).r, 0.3);
  if (R < 1.3 * pxW) return;
  // (A stream carried on from another vessel: the root's heads while the vessel has any link (flow texel 4, w), its own otherwise; never the
  // two mixed: the streaks cross-fade through a link as it forms or lets go, the heads move onto the new stream where the old one stood
  // and ease from there (the axis texture's last column: the offset added to A, and B; stage-blood.js chainRows). Reduced motion: each its own.)
  vec4 ch4 = texelFetch(flow, ivec2(4, id), 0), ch5 = texelFetch(flow, ivec2(5, id), 0);
  vec2 ch8 = texelFetch(axis, ivec2(N_LAST + 1, id), 0).xy;
  float cw = still == 1 ? 0.0 : ch4.w;
  if (root != (cw > 0.0)) return;
  float Dm, A, B, runDir;   // (runDir: the way the run's heads travel along this vessel)
  int rid = -1;
  if (root) {
    rid = int(ch4.x + 0.5) - 1;
    Dm = rootDD(rid, ch5.xy).x;
    A = ch4.y + ch8.x; B = ch8.y != 0.0 ? ch8.y : ch4.z;
    runDir = texelFetch(flow, ivec2(0, rid), 0).y * B < 0.0 ? -1.0 : 1.0;   // (the root's speed over B: the stream carries the heads that way)
  } else {
    Dm = flowD(id, f0.x, f0.y);
    A = ch8.x; B = ch8.y != 0.0 ? ch8.y : 1.0;
    runDir = f0.y * B < 0.0 ? -1.0 : 1.0;
  }
  if (abs(B) < 1e-4) return;
  // (chevLevel: one spacing on screen for every vessel and run; reduced motion's still heads spaced by flow, 2.5 times its level's 28 units.)
  float stillLv = still == 1 ? texelFetch(flow, ivec2(3, id), 0).y + 1.3219281 : -1.0;
  vec2 lw = chevLevel(pxW, cssPx, B, stillLv);
  float lvOwn = lw.x, Pt = lw.y, lvUp = lvOwn, eu = 0.0;
  // A root run comes in through its upstream join at the level its parent draws the same stream at (the parent's own B on it, or its own
  // stream's where the parent is the root): from there it eases to its own over one spacing, so a head running into a slower or faster
  // branch keeps its strength as it crosses and thins or fills out along the way, instead of fading in a frame at the join.
  if (root) {
    eu = clamp(runDir > 0.0 ? ch5.z : ch5.w, 0.0, 1.0);
    int pid = int(texelFetch(flow, ivec2(3, id), 0).w + 0.5) - 1;
    if (eu > 0.0 && pid >= 0) {
      vec4 p4 = texelFetch(flow, ivec2(4, pid), 0);
      float pB = texelFetch(axis, ivec2(N_LAST + 1, pid), 0).y;
      float Bp = pid == rid || (abs(p4.x - ch4.x) < 0.5 && p4.w > 0.0) ? (pB != 0.0 ? pB : (pid == rid ? 1.0 : p4.z)) : 1.0;
      lvUp = chevLevel(pxW, cssPx, Bp, stillLv).x;
    } else eu = 0.0;
  }
  float n0 = floor(min(lvOwn, mix(lvOwn, lvUp, eu)));
  float P = 28.0 * exp2(n0);
  // The heads stand at stream positions se = Dm + j P; this vessel's arc s maps to se = A + B s. The run starts one spacing before the
  // vessel's start, so k = 0, 1, … covers it (the list gives each row enough: createHeadList).
  float seLo = min(A, A + B * len) - P;
  float j = ceil((seLo - Dm) / P) + head.y;
  float sc = (Dm + j * P - A) / B;   // (the head's centre, in this vessel's arc length)
  float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;
  float reach = 0.6 * L + 0.15 * hw + 4.0 * pxW;   // (how far along a head and its rim reach: chevOne's bound)
  if (sc < -reach || sc > len + reach) return;
  // (Over one spacing, or most of a short vessel, so the level is its own by the far end, where the next vessel takes it up.)
  float lvAt = mix(lvOwn, mix(lvUp, lvOwn, smoothstep(0.0, min(Pt, 0.9 * len), runDir > 0.0 ? sc : len - sc)), eu);
  float keep = chevKeep(j, n0, lvAt);
  if (keep <= 0.0) return;
  // Toward either end a head fades out (and the next vessel's fades in); through a chained end it runs on (chevOne). (The ramp: an
  // eighth of the spacing, as chevOne's 0.3 of a level below its 2.5 times.)
  float lo = 0.6 * L, ramp = max(2.0 * L, 0.12 * Pt), endF;
  vec2 ends = ch5.zw;
  if (ends.x <= 0.0 && ends.y <= 0.0) {
    float e = min(sc, len - sc);
    if (e < lo) return;
    endF = smoothstep(lo, lo + ramp, e);
  } else {
    float a0 = sc < lo ? 0.0 : smoothstep(lo, lo + ramp, sc), a1 = len - sc < lo ? 0.0 : smoothstep(lo, lo + ramp, len - sc);
    endF = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0)));
    if (endF <= 0.0) return;
  }
  float vd = f0.y, dir = runDir;   // (the heads point the way they travel: this stream's own speed, or the root's, over B)
  float fade = smoothstep(0.5, 3.0, abs(vd)) * f1.z * texelFetch(flow, ivec2(3, id), 0).x * keep * endF * smoothstep(1.3 * pxW, 2.4 * pxW, R);
  // (Where the lumen is narrower than the head, the head fades out instead of squeezing to fit.)
  fade *= smoothstep(0.85 * hw, 1.15 * hw, radAt(id, sc, len));
  if (fade <= 0.0) return;
  // The point on the axis and the way it runs there (past an end: on along the end's own direction, where a head runs through a join).
  float u = clamp(sc / len, 0.0, 1.0) * float(N_LAST);
  int i0 = min(int(u), N_LAST - 1);
  vec2 p0 = texelFetch(axis, ivec2(i0, id), 0).xy, p1 = texelFetch(axis, ivec2(i0 + 1, id), 0).xy;
  vec2 tg = p1 - p0;
  float tl = length(tg);
  if (tl < 1e-6) return;
  tg /= tl;
  vec2 c = mix(p0, p1, u - float(i0)) + tg * (sc - clamp(sc, 0.0, len));
  vec2 t = tg * dir, nn = vec2(-t.y, t.x);
  float ea = reach + 2.0 * pxW + 0.4 * L * f1.w, ec = 1.1 * hw + 3.8 * pxW;   // (the quad: the head, its rim and two pixels more)
  vec2 q = corner * 2.0 - 1.0;
  vec3 d = world * vec3(c + t * (q.x * ea) + nn * (q.y * ec), 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  // Its colours (chevron-glsl.js headInksGLSL: cream forward, orange reversed, cream on an orange vessel; the rim cream on a dark lumen and
  // sepia on a light one), from the vessel's colour at the head.
  vec3 vc = mix(texelFetch(tube, ivec2(0, id), 0).rgb, texelFetch(tube, ivec2(1, id), 0).rgb, alongAt(id, clamp(sc / len, 0.0, 1.0)));
  chevInks(vc, f1.w, hInk, hRim);
  hC = vec4(c, t);
  hS = vec4(hw, fade, float(id), f1.w);   // (w: the eased reversed flag, for the » pair behind a reversed head)
}`;
}

/**
 * The quads' fragment main, appended to the composite's own text (veins-gl COMP_FS with heads: its uniforms, chevHead and fluidAt;
 * its own main left out). The quads are blended premultiplied (ONE, ONE_MINUS_SRC_ALPHA) over what the composite wrote.
 */
export function headMain({ LUMEN2, ROW2_MASK, FLOW_TEXELS }) {
  // alloc-rare: assembles the shader text once when the renderer's programs are made (veins-gl.js COMP_FS), never per frame
  return `
flat in vec4 hC;
flat in vec4 hS;
flat in vec3 hInk, hRim;
void main() {
  vec2 FC = gl_FragCoord.xy;
  ivec2 ip = ivec2(FC);
  // (The vessel layer's texel for this pixel, as the composite finds it: the layer's wrap, and a tier frame's small targets.)
  ivec2 rel = ivec2(ip.x, lH - 1 - ip.y) - lA;
  if (rel.x < 0 || rel.y < 0 || rel.x >= lSize.x || rel.y >= lSize.y) discard;
  ivec2 lt = rel + lWrap;
  if (lt.x >= lSize.x) lt.x -= lSize.x;
  if (lt.y >= lSize.y) lt.y -= lSize.y;
  ivec2 lp = ivec2(lt.x, lSize.y - 1 - lt.y);
  vec2 lowUV = (vec2(lp) + 0.5) * lowS / max(lowT, vec2(1.0));
  if (lowSz.x > 0) lp = min(ivec2(vec2(lp) * lowS), lowSz - 1);
  uvec4 g = texelFetch(gbuf, lp, 0);
  if (g.x == 0u) discard;
  bool two = (g.x & ${LUMEN2}u) != 0u;
  g.x &= ${LUMEN2 - 1}u;
  uvec4 g2 = two ? texelFetch(gbuf2, lp, 0) : uvec4(0u);
  uint r2 = g2.x & ${ROW2_MASK}u;
  int id1 = int(g.x) - 1, id2 = int(r2) - 1, hid = int(hS.z + 0.5);
  // (Only where this frame's composite drew the pixel again: a still lumen it left alone keeps the head it has. composite passes stillOn
  // 1 only on a frame whose sole drawing of lumens is the blood's own pass, so this is exactly the composite's own test.)
  if (stillOn == 1 && texelFetch(flow, ivec2(${FLOW_TEXELS}, id1), 0).x == 0.0 && (!two || texelFetch(flow, ivec2(${FLOW_TEXELS}, id2), 0).x == 0.0)) discard;
  float b = r2 > 0u ? float(g.w & 255u) / 255.0 : 0.0;
  if (hid != id1 && (hid != id2 || b <= 0.004)) discard;
  vec4 v = texelFetch(base, lp, 0);
  if (lowSz.x > 0) v = texture(base, lowUV);
  if (v.a <= 0.01) discard;
  float vis = clamp(float(g.w >> 8u) / 255.0 / max(v.a, 1e-3), 0.0, 1.0);
  if (vis <= 0.005 || texelFetch(flow, ivec2(1, id1), 0).z <= 0.0) discard;
  // Near a join, as the composite has it: where the two lumens draw one pattern (rel) the heads run from one into the other, mixed by the
  // join's share; elsewhere none where another vessel joins.
  float rl = 0.0;
  if (b > 0.004) {
    float p1 = texelFetch(flow, ivec2(3, id1), 0).w - 1.0, p2 = texelFetch(flow, ivec2(3, id2), 0).w - 1.0;
    float w1 = texelFetch(flow, ivec2(4, id1), 0).w, w2 = texelFetch(flow, ivec2(4, id2), 0).w;
    if (p1 > -0.5 && abs(p1 - float(id2)) < 0.5) rl = w1;
    else if (p2 > -0.5 && abs(p2 - float(id1)) < 0.5) rl = w2;
    else if (p1 > -0.5 && abs(p1 - p2) < 0.5) rl = min(w1, w2);
    if (texelFetch(flow, ivec2(1, id2), 0).z <= 0.0) rl = 0.0;
  }
  float wt = (hid == id1 ? 1.0 - b * rl : b * rl) * (1.0 - smoothstep(0.02, 0.25, b) * (1.0 - rl));
  if (wt <= 0.0) discard;
  vec2 w = (inv * vec3(FC.x, H - FC.y, 1.0)).xy;
  vec2 dw = w - hC.xy;
  vec2 c = chevHead(dot(dw, hC.zw), abs(dot(dw, vec2(-hC.w, hC.z))), hS.x, pxW, hS.w) * (hS.y * wt);
  if (c.x + c.y <= 0.0) discard;
  // None under a figure reading on its vessel, nor round a stent point (the composite's cut-outs, a pixel of antialiasing).
  for (int i = 0; i < 12; i++) {
    if (i >= noChevN) break;
    vec2 qb = abs(w - (noChev[i].xy + noChev[i].zw) * 0.5) - (noChev[i].zw - noChev[i].xy) * 0.5;
    c *= smoothstep(-pxW, pxW, length(max(qb, 0.0)) + min(max(qb.x, qb.y), 0.0));
  }
  for (int i = 0; i < 16; i++) {
    if (i >= chevHoleN) break;
    vec4 hh = chevHole[i];
    float hr = chevHoleR[i], dh;
    if (hr < 0.0) { vec2 ab = hh.zw - hh.xy; float t = clamp(dot(w - hh.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); dh = length(w - hh.xy - ab * t) + hr; }
    else dh = length(max(max(hh.xy - w, w - hh.zw), 0.0)) - hr;
    c *= smoothstep(-pxW, pxW, dh);
  }
  float k = vis * flowA * blendA.y;
  float ar = clamp(c.y * 0.75 * k, 0.0, 1.0), ac = clamp(c.x * k, 0.0, 1.0);
  // (The composite's two mixes, rim then core, as one premultiplied head; at the lumen's opacity.)
  vec4 hd = over(vec4(hInk * ac, ac), vec4(hRim * ar, ar)) * v.a;
  if (hd.a <= 0.0) discard;
  // Under the ascites and the outlines' layer, which lie over the vessels: sent through each so the blend lands where the composite's would.
  float al = hd.a;
  vec4 F = fluidAt(w);
  hd.rgb = hd.rgb * (1.0 - F.a) + al * F.rgb;
  if (lineOn == 1) { vec4 Ln = texelFetch(lineL, ip, 0); hd.rgb = hd.rgb * (1.0 - Ln.a) + al * Ln.rgb; }
  outColor = hd;
}`;
}

/**
 * The instance list: per vessel row with an axis and blood, its own run (k = 0 … ceil(len / P_MIN) + 2) and, while it is chained to a
 * root stream, the root's run (its heads stand P / |B| apart along the vessel). update() returns true when the list changed (then
 * data() holds count() × 3 floats: row, k, run), false when every row's count is as it was.
 *   has: rows with an axis; bloodRow: rows carrying blood; tube: the rows' attributes (rowW floats a row; texel 5 z the length);
 *   flow: the flow rows as uploaded (stride floats a row; texel 4: root + 1, A, B, weight), or null; runs: the heads' runs (veins-gl
 *   setHeadRuns: 2 floats a row, the offset and B), or none.
 */
export function createHeadList(nTubes) {
  const kOwn = new Int32Array(nTubes), kRoot = new Int32Array(nTubes);   // alloc-rare: once per renderer
  let data = new Float32Array(0), n = 0;   // alloc-rare: once per renderer
  return {   // alloc-rare: once per renderer
    update(has, bloodRow, tube, rowW, flow, stride, runs) {
      let ch = false;
      for (let r = 0; r < nTubes; r++) {
        let ko = 0, kr = 0;
        if (has[r] && bloodRow[r]) {
          // (A run's heads stand P / |B| apart along the vessel, B its own (runs: while it eases after a hand-over) or 1 and the link's;
          // counted in fours, so a B easing by a little does not send a new list every frame.)
          const len = Math.max(tube[r * rowW + 22] || 0, 1), bh = runs ? Math.abs(runs[r * 2 + 1] || 0) : 0;
          ko = Math.ceil((Math.ceil(len * Math.max(1, bh) / P_MIN) + 3) / 4) * 4;
          if (flow && flow[r * stride + 19] > 0) kr = Math.ceil((Math.ceil(len * Math.max(Math.abs(flow[r * stride + 18]), bh, 1e-3) / P_MIN) + 3) / 4) * 4;
        }
        if (ko !== kOwn[r] || kr !== kRoot[r]) { kOwn[r] = ko; kRoot[r] = kr; ch = true; }
      }
      if (!ch) return false;
      let tot = 0;
      for (let r = 0; r < nTubes; r++) tot += kOwn[r] + kRoot[r];
      if (data.length < tot * 3) data = new Float32Array(Math.ceil(tot * 1.25) * 3);   // alloc-rare: only when the heads outgrow the list
      let o = 0;
      for (let r = 0; r < nTubes; r++) {
        for (let k = 0; k < kOwn[r]; k++) { data[o++] = r; data[o++] = k; data[o++] = 0; }
        for (let k = 0; k < kRoot[r]; k++) { data[o++] = r; data[o++] = k; data[o++] = 1; }
      }
      n = tot;
      return true;
    },
    data: () => data,   // alloc-rare: once per renderer
    count: () => n,   // alloc-rare: once per renderer
  };
}
