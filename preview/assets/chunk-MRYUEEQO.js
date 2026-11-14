var w=`
// The heads' spacing (chevLevel, chevKeep): the same distance on screen between heads on every vessel, CHEV_PITCH CSS px, whatever its
// caliber, the zoom or the device. Until 13 Nov it was set by the caliber too (nine radii apart: a wide vein close up showed one or two
// heads) and by the screen's device pixels (half as many CSS px apart on a dense screen), and a run carried on from a root stream at B
// (blood.js createStreamChain) stood its heads P / |B| apart along the vessel, so a slow branch drawing its trunk's heads had them up to
// 4.5 times as close. Here the level is raised by log2 |B| for such a run, so it keeps the same spacing along its own vessel.
// The stream spacing is a power-of-two multiple of 14 world units (it divides the stream's period: no jump on wrap). The level is a
// continuous number: a head of index j on the lattice of level n0 belongs to the levels n0 \u2026 n0 + v2(j) (v2: how many times 2 divides j),
// and fades out as the level passes from its last to the next (chevKeep), so the coarser heads are a subset of the finer ones; nothing jumps.
// The fade is 2^(1 - x) - 1 (x the level past the head's last): the heads' summed strength per CSS px is then the same at every level,
// one head per CHEV_PITCH, where a smoothstep let it swing by a fifth. The level goes down to -1 (14 world units) for a close zoom.
// pxW: world units per device pixel; cssPx: device pixels per CSS pixel; B: the run's scale (1 for a vessel's own stream); stillLv: the
// least level reduced motion asks for (its still heads spaced by flow), or below 0. Returns the level and the spacing wanted along the
// vessel (world units).
vec2 chevLevel(float pxW, float cssPx, float B, float stillLv) {
  float Pt = 130.0 * cssPx * pxW;
  return vec2(max(max(-1.0, log2(Pt * abs(B) / 28.0)), stillLv), Pt);
}
// How much of head j of the lattice of level n0 shows at level lv (1 kept, 0 gone).
float chevKeep(float j, float n0, float lv) {
  float m = 0.0, q = abs(j);
  for (int i = 0; i < 10; i++) { if (q < 0.5 || mod(q, 2.0) > 0.5) break; q *= 0.5; m += 1.0; }
  if (q < 0.5) m = 10.0;
  return clamp(exp2(1.0 - (lv - n0 - m)) - 1.0, 0.0, 1.0);
}`,S=`
float chevD(float u, float ay, float hw) {
  float L = 1.6 * hw, tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L, k = L / hw;
  // Inside when behind both slanted sides and ahead of the notched back.
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  return max(max(side, rear), ay - hw);
}
vec2 chevHead(float u, float ay, float hw, float px, float rev) {
  float d = chevD(u, ay, hw);
  float c = 1.0 - smoothstep(-0.7 * px, 0.7 * px, d);
  float rim = 1.0 - smoothstep(0.0, 1.8 * px + 0.1 * hw, d);
  if (rev > 0.0) {
    // The smaller head behind: 0.6 of the size, its tip 0.35 L behind the head's centre (clear of the first's notched back).
    float d2 = 0.6 * chevD((u + 1.088 * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-0.7 * px, 0.7 * px, d2)));
    rim = max(rim, rev * (1.0 - smoothstep(0.0, 1.8 * px + 0.06 * hw, d2)));
  }
  return vec2(c, rim * (1.0 - c));
}`,L=[59,44,34];function u(a){let o=a.indexOf("void chevInks(");return`${o>=0?a.slice(0,o):a}
// The heads' inks (chevron-glsl.js headInksGLSL), by the lumen's lightness over the composite's band (luma .38 to .46, so a vessel whose
// colour eases never pops): a forward head near-black on a light lumen and cream on a dark one; a reversed head orange on both (cream on an
// orange lumen); the rim sepia on a light lumen and cream on a dark one (never white on a bright vessel).
void chevInks(vec3 vc, float rv, out vec3 core, out vec3 rim) {
  float rk = origin == 1 ? rv * (1.0 - blendA.z) : rv;
  float dark = 1.0 - smoothstep(0.38, 0.46, dot(vc, vec3(0.299, 0.587, 0.114)));
  float warm = rk * chevOrange(vc);
  vec3 ink = mix(chevInk, vc * 0.3, 0.2);
  core = mix(mix(mix(ink, chevLight, dark), revCol, rk), chevLight, warm);
  rim = mix(vec3(${L.map(t=>(t/255).toFixed(4)).join(", ")}), chevLight, dark);
}
`}var g=14;function A(a,o,i,t=-1){let s=130*o*a;return{lv:Math.max(Math.max(-1,Math.log2(s*Math.abs(i)/28)),t),Pt:s}}function P(a,o,i){let t=0,s=Math.abs(a);for(let h=0;h<10&&!(s<.5||s%2>.5);h++)s*=.5,t+=1;return s<.5&&(t=10),Math.min(1,Math.max(0,2**(1-(i-o-t))-1))}function H({zoom:a,along:o,rows:i,orange:t,nSamples:s,pitch:h=w}){return`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 corner;     // the quad, 0 \u2026 1
layout(location=1) in vec3 head;       // per head: its vessel's row, its place in the run (k: 0, 1, \u2026 from just before the vessel's start), the run (0 its own stream, 1 the root stream it is chained to)
uniform mat3 world;                    // world \u2192 device pixels
uniform vec2 size;
uniform highp sampler2D flow;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D axis;          // per vessel: its axis, ${s} points (x, y), equal arc apart (veins-gl setBend); then its heads' run (setHeadRuns)
uniform highp float bT;
uniform int still;
uniform float cssPx;
uniform vec3 chevInk, chevLight, revCol, inkLight;
uniform vec3 blendA;                   // (the origin lens's share, in z: chevInks)
uniform int origin;
${a}
${o}
${i}
${u(t)}
${h}
flat out vec4 hC;                      // the head's centre (world) and the way it points (unit)
flat out vec4 hS;                      // its half width (world), its strength (0 \u2026 1), its vessel's row, its reversed flag (0 \u2026 1)
flat out vec3 hInk, hRim;              // the colours of its core and of its rim
const int N_LAST = ${s-1};
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
  // (The level the stage holds for this row, a whole number at rest: stage-blood.js headRun. Without it, the zoom's own.)
  vec2 lr = texelFetch(axis, ivec2(N_LAST + 2, id), 0).xy;
  float lvOwn = lr.y > 0.5 ? max(lr.x, stillLv) : lw.x, Pt = lw.y, lvUp = lvOwn, eu = 0.0;
  // A root run comes in through its upstream join at the level its parent draws the same stream at (the parent's own B on it, or its own
  // stream's where the parent is the root): from there it eases to its own over one spacing, so a head running into a slower or faster
  // branch keeps its strength as it crosses and thins or fills out along the way, instead of fading in a frame at the join.
  if (root) {
    eu = clamp(runDir > 0.0 ? ch5.z : ch5.w, 0.0, 1.0);
    int pid = int(texelFetch(flow, ivec2(3, id), 0).w + 0.5) - 1;
    if (eu > 0.0 && pid >= 0) {
      vec4 p4 = texelFetch(flow, ivec2(4, pid), 0);
      float pB = texelFetch(axis, ivec2(N_LAST + 1, pid), 0).y;
      bool same = pid == rid || (abs(p4.x - ch4.x) < 0.5 && p4.w > 0.0);
      float Bp = same ? (pB != 0.0 ? pB : (pid == rid ? 1.0 : p4.z)) : 1.0;
      vec2 pl = texelFetch(axis, ivec2(N_LAST + 2, pid), 0).xy;
      lvUp = !same ? lvOwn : pl.y > 0.5 ? max(pl.x, stillLv) : chevLevel(pxW, cssPx, Bp, stillLv).x;
    } else eu = 0.0;
  }
  float n0 = floor(min(lvOwn, mix(lvOwn, lvUp, eu)));
  float P = 28.0 * exp2(n0);
  // The heads stand at stream positions se = Dm + j P; this vessel's arc s maps to se = A + B s. The run starts one spacing before the
  // vessel's start, so k = 0, 1, \u2026 covers it (the list gives each row enough: createHeadList).
  float seLo = min(A, A + B * len) - P;
  float j = ceil((seLo - Dm) / P) + head.y;
  float sc = (Dm + j * P - A) / B;   // (the head's centre, in this vessel's arc length)
  float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;
  float reach = 0.6 * L + 0.15 * hw + 4.0 * pxW;   // (how far along a head and its rim reach: chevOne's bound)
  if (sc < -reach || sc > len + reach) return;
  // (A head from the parent keeps the parent's level for about a head's length past the join, and takes this vessel's within a few CSS px
  // of travel there: a head that the slower branch thins out leaves at the join itself, never mid-vessel or along a faint run.)
  float cut = min(1.2 * L, 0.45 * len), cwid = min(0.03 * Pt, 0.5 * cut);
  float lvAt = mix(lvOwn, mix(lvUp, lvOwn, smoothstep(cut - cwid, cut + cwid, runDir > 0.0 ? sc : len - sc)), eu);
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
  // Its colours (chevron-glsl.js headInksGLSL: forward near-black on a light lumen and cream on a dark one, reversed orange, cream on an
  // orange vessel; the rim sepia on a light lumen and cream on a dark one), from the vessel's colour at the head.
  vec3 vc = mix(texelFetch(tube, ivec2(0, id), 0).rgb, texelFetch(tube, ivec2(1, id), 0).rgb, alongAt(id, clamp(sc / len, 0.0, 1.0)));
  chevInks(vc, f1.w, hInk, hRim);
  hC = vec4(c, t);
  hS = vec4(hw, fade, float(id), f1.w);   // (w: the eased reversed flag, for the \xBB pair behind a reversed head)
}`}function I({LUMEN2:a,ROW2_MASK:o,FLOW_TEXELS:i}){return`
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
  bool two = (g.x & ${a}u) != 0u;
  g.x &= ${a-1}u;
  uvec4 g2 = two ? texelFetch(gbuf2, lp, 0) : uvec4(0u);
  uint r2 = g2.x & ${o}u;
  int id1 = int(g.x) - 1, id2 = int(r2) - 1, hid = int(hS.z + 0.5);
  // (Only where this frame's composite drew the pixel again: a still lumen it left alone keeps the head it has. composite passes stillOn
  // 1 only on a frame whose sole drawing of lumens is the blood's own pass, so this is exactly the composite's own test.)
  if (stillOn == 1 && texelFetch(flow, ivec2(${i}, id1), 0).x == 0.0 && (!two || texelFetch(flow, ivec2(${i}, id2), 0).x == 0.0)) discard;
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
}`}function j(a){let o=new Int32Array(a),i=new Int32Array(a),t=new Float32Array(0),s=0;return{update(h,b,y,k,c,v,f){let p=!1;for(let e=0;e<a;e++){let l=0,d=0;if(h[e]&&b[e]){let m=Math.max(y[e*k+22]||0,1),x=f?Math.abs(f[e*4+1]||0):0;l=Math.ceil((Math.ceil(m*Math.max(1,x)/g)+3)/4)*4,c&&c[e*v+19]>0&&(d=Math.ceil((Math.ceil(m*Math.max(Math.abs(c[e*v+18]),x,.001)/g)+3)/4)*4)}(l!==o[e]||d!==i[e])&&(o[e]=l,i[e]=d,p=!0)}if(!p)return!1;let n=0;for(let e=0;e<a;e++)n+=o[e]+i[e];t.length<n*3&&(t=new Float32Array(Math.ceil(n*1.25)*3));let r=0;for(let e=0;e<a;e++){for(let l=0;l<o[e];l++)t[r++]=e,t[r++]=l,t[r++]=0;for(let l=0;l<i[e];l++)t[r++]=e,t[r++]=l,t[r++]=1}return s=n,!0},data:()=>t,count:()=>s}}export{S as a,g as b,A as c,P as d,H as e,I as f,j as g};
