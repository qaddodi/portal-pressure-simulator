import{b as eo}from"./chunk-FSLBNSHA.js";import{b as Qf,c as Zf,d as rs}from"./chunk-JSNUHTLE.js";import{f as Jf}from"./chunk-I3BKVYXF.js";import{a as $f}from"./chunk-ERHMDOCS.js";import{a as Ic}from"./chunk-QRWWXZF7.js";import{a as Bc}from"./chunk-LUDPAG2G.js";import{a as jt,b as oa}from"./chunk-ZS2GLIXX.js";import{g as Oc,h as Uc,i as Lc}from"./chunk-MKYN4O4B.js";import{a as Gf,c as kc}from"./chunk-WW52VSOD.js";import{$ as fs,A as An,B as hc,C as uc,D as dc,E as pc,F as mc,G as wc,H as bc,I as vc,J as xc,K as gc,L as is,N as Ac,Q as Ec,R as Tc,S as ss,U as yc,V as Rc,W as Fc,X as _c,Y as Sc,Z as Mc,_ as ls,a as tc,b as rc,ca as cs,da as hs,f as to,fa as us,g as nc,ga as Dc,i as ac,j as ia,k as as,l as oc,m as ic,n as sc,o as lc,q as fc,v as G,x as os,y as ro,z as cc}from"./chunk-2HY5LLUZ.js";import{b as Yf,c as Kf,d as qf,h as ec,j as ns}from"./chunk-PGEND5DB.js";import{b as zf}from"./chunk-A5M7URE5.js";import{j as es,k as ts}from"./chunk-FIQBRMX5.js";import{xb as Qa}from"./chunk-VEJA2JHM.js";import{a as aa,j as Nf,o as Pf,q as Cf,s as jf}from"./chunk-MYWMKIN7.js";import{a as If}from"./chunk-KVXA74NE.js";import{c as Xf}from"./chunk-G5KFKELK.js";import{K as Mf,L as Df,N as xn,d as he,j as m,n as Rf,q as Ff,r as ke,ra as Ja,sa as Bf,u as _f,v as Sf}from"./chunk-BK4HIZNF.js";import{d as Of,f as Uf,j as gn,n as Lf,o as kf}from"./chunk-LU655YPY.js";import{f as Zi,l as yf}from"./chunk-HAEIXMCE.js";import{a as dr}from"./chunk-X3WL6NOF.js";import{a as Vf,b as Wf,c as Za,d as Hf,w as Ct}from"./chunk-NMLIWKCJ.js";import{h as Tf}from"./chunk-MH6GHJSR.js";function wu(s,p,R,A){let B=0;for(let O=0;O<p.length;O++)p[O]&&!R[O]&&(s.fill(0,O*A,(O+1)*A),B++);return p.set(R),R.fill(0),B}function no(s,p,R,A,B=null){let O=A*R,z=0;for(;z<O&&s[z]===p[z];)z++;if(z===O)return null;let D=O-1;for(;D>z&&s[D]===p[D];)D--;let F=Math.floor(z/R),ae=Math.floor(D/R);for(let Be=F*R,Fe=(ae+1)*R;Be<Fe;Be++)p[Be]=s[Be];return B?(B[0]=F,B[1]=ae,B):[F,ae]}function bu(s,p,R,A,B=qh,O=.01,z=.001){let D=A*R;if(!p||p.length<D)return!1;for(let F=0;F<D;F++){let ae=s[F],Be=p[F];if(ae===Be)continue;let Fe=Math.abs(ae-Be);if(!(Fe<=z)&&(B[F%R]||Fe>z+O*Math.abs(Be)))return!1}return!0}var qh=(()=>{let s=new Uint8Array(64);for(let p of[0,14,17,18,20,21,24,25])s[p]=1;return s})();function Nc(s){return s>4*1e6?Math.max(.5,Math.sqrt(3*1e6/s)):0}function Pc(s,p,R,A){return A[0]=Math.min(s,Math.max(1,Math.ceil(s*R))),A[1]=Math.min(p,Math.max(1,Math.ceil(p*R))),A}var me=(s,p,R,A,B)=>m.part?m.part(s,p,R,A,B):p(R,A,B),ds=me,Qh={tri:null,seg:null,nTri:0,nSeg:0};var Xt=8,ao=13,lo=21,Tn=32768,fo=11,so=(1<<fo)-1,Zh=new Float32Array([0,0,1,0,0,1,1,1]),pr=`#version 300 es
layout(location = 0) in vec2 aQ;
void main() { gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0); }`,ps=`#version 300 es
precision mediump float;
uniform sampler2D uT;
out vec4 o;
void main() { o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0); }`,eu=`#version 300 es
precision highp float;
uniform sampler2D uT;
uniform highp vec2 uDst;
uniform highp vec3 uCam;
uniform float uA;
out vec4 o;
void main() {
  highp vec2 q = (gl_FragCoord.xy - uCam.yz) / uCam.x;
  highp vec2 uv = q / uDst;
  o = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uT, uv) * uA;
}`,Cc=`#version 300 es
precision highp float;
uniform sampler2D uT;
uniform highp vec2 uDst;
uniform highp vec4 uM;
uniform highp vec2 uTr;
uniform float uA;
out vec4 o;
void main() {
  highp vec2 dd = vec2(gl_FragCoord.x, uDst.y - gl_FragCoord.y) - uTr;
  highp vec2 s = vec2(uM.x * dd.x + uM.y * dd.y, uM.z * dd.x + uM.w * dd.y);
  highp vec2 uv = vec2(s.x / uDst.x, 1.0 - s.y / uDst.y);
  o = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uT, uv) * uA;
}`,jc=`#version 300 es
precision mediump float;
uniform sampler2D uT;
uniform highp vec2 uSrc, uDst, uOff;
uniform float uCR;
out vec4 o;
void main() {
  highp vec2 p = gl_FragCoord.xy * uSrc / uDst + vec2(-uOff.x, uOff.y), tc = p - 0.5, b = floor(tc) + 0.5;
  vec4 col;
  if (uCR > 0.5) {
    vec2 f = fract(tc);
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2;
    highp vec2 t0 = (b - 1.0) / uSrc, t3 = (b + 2.0) / uSrc, t12 = (b + w2 / w12) / uSrc;
    float a = w12.x * w0.y, bb = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
    col = texture(uT, vec2(t12.x, t0.y)) * a + texture(uT, vec2(t0.x, t12.y)) * bb + texture(uT, t12) * c
        + texture(uT, vec2(t3.x, t12.y)) * d + texture(uT, vec2(t12.x, t3.y)) * e;
    col /= a + bb + c + d + e;
  } else {
    col = texture(uT, p / uSrc);
  }
  ivec2 q = ivec2(floor(tc)), mx = ivec2(uSrc) - 1;
  vec4 n0 = texelFetch(uT, clamp(q, ivec2(0), mx), 0), n1 = texelFetch(uT, clamp(q + ivec2(1, 0), ivec2(0), mx), 0);
  vec4 n2 = texelFetch(uT, clamp(q + ivec2(0, 1), ivec2(0), mx), 0), n3 = texelFetch(uT, clamp(q + ivec2(1, 1), ivec2(0), mx), 0);
  vec4 hi = max(max(n0, n1), max(n2, n3)), lo = min(min(n0, n1), min(n2, n3));
  col = clamp(col, lo, hi);
  float am = max(hi.a, 1e-4), k = clamp(uDst.x / uSrc.x, 1.0, 8.0);
  float edge = smoothstep(0.35, 0.75, (hi.a - lo.a) / am);
  float a2 = am * clamp((min(col.a / am, 1.0) - 0.5) * k + 0.5, 0.0, 1.0);
  a2 = mix(col.a, a2, edge);
  if (col.a > 1e-4) col.rgb *= a2 / col.a;
  col.a = a2;
  highp float nz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float dn = (nz - 0.5) / 255.0;
  if (col.a > 0.002) { col.rgb += dn; if (col.a < 0.998) col.a += dn; }
  o = vec4(clamp(col.rgb, vec3(0.0), vec3(col.a)), col.a);
}`,Xc=new WeakMap,ms=s=>{let p=Xc.get(s);return p||Xc.set(s,p=new Float32Array(s.flat())),p},tt={world:new Float32Array(9),inv:new Float32Array(9),be:new Float32Array(96),bb:new Float32Array(96),ncv:new Float32Array(48),hb:new Float32Array(64),hr:new Float32Array(16)},ws=[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]],sa=[],Gc={},Vc=[0],En=[0,0,1,1],oo=[0,0,0,0],Wc=[1,0],Hc=[.08,.08,.1],zc=[1,.93,.86],bs=[.8,.95,.2],vs=[1,.55,.16],xs=[1,1,1],gs=[.1,.1,.16],Xr=(s,p,R,A,B,O,z)=>(s[0]=p,s[1]=R,s[2]=0,s[3]=A,s[4]=B,s[5]=0,s[6]=O,s[7]=z,s[8]=1,s);var la=1,As=2,Es=4,pt=8,fa=16,Jc=32,Ts=64,yn=128,Qc=256,ld=1024,ca=.6,tu=ac({F_DIFFUSE:As,F_EDGE:Ts,F_SHADOW:Es,F_SPEC:Jc,F_VEIL:yn,F_WHOLE:Qc,LIFT_EASE_MAX:ts,LIFT_EASE_SHARE:es,LUMEN2:Tn,ROW2_BITS:fo,VEIL_K:ca}),ys=as({EDGE:aa,F_DOTTED:pt,F_NOCASE:fa,F_SEL:la,F_VEIL:yn,VEIL_K:ca}),ru=ys.decl,nu=ys.key,au=ys.out,Rs=as({EDGE:aa,F_DOTTED:pt,F_NOCASE:fa,F_SEL:la,F_VEIL:yn,VEIL_K:ca,tube:1}),ou=Rs.key,iu=Rs.decl,su=Rs.out,lu=fc({F_DIFFUSE:As,F_EDGE:Ts,F_VEIL:yn}),$c=(s,p=0,R=0)=>`#version 300 es
precision highp float;
precision highp int;
#define SIMPLE ${s?1:0}
#define MESH ${p}
#if MESH == 0
in vec2 vW;
flat in ivec4 vR;
#else
#if MESH == 1
in float vI;                           // (mesh strip) the sample index along the vessel, interpolated across the strip
flat in int vRow;                      // (mesh strip) its vessel row
#else
flat in vec4 vM0;                      // (mesh patch) its vessels, rows (-1 none): the first four
flat in vec4 vM1;                      // (mesh patch) and the next four
flat in ivec4 vWa;                     // (mesh patch) each vessel's first segment near the patch's joins (vessels 0-3)
flat in ivec4 vWb;                     // (mesh patch) and its last
flat in ivec4 vWa2;                    // (mesh patch) the same, vessels 4-7
flat in ivec4 vWb2;
flat in ivec4 vR;                      // (mesh patch) its joins: z the first in pjTex, w their count (read by E() below)
flat in int vNJ;                       // (mesh patch) its joins' count, for the test below
uniform highp sampler2D pjTex;         // (mesh patch) the patches' join entries, one a texel row (A, B), as the binned entries hold them
#endif
#endif
#if MESH
${R?iu:ru}
#endif
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D rmax;           // per vessel: its largest lumen radius now
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform vec4 invA;                     // device pixels \u2192 world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen (see the vertex shader)
uniform vec2 sizeF;                    // the layer, device pixels
uniform float reachU;                  // how far from a lumen anything is drawn (world)
uniform vec2 shOff;                    // contact shadow offset (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 rimInk;                   // a dark lumen's light rim: rgb, alpha (0 on the light looks)
uniform vec4 paperInk;                 // the figure's ground: rgb, alpha (the knock-out ring where vessels of one tier cross)
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform float tierAlpha[${lo}];
uniform int tierGroup[${lo}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture (drawRows), not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw (tintPass): only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int morphOn;                   // 1: a binning made for a stretch of the change between the views (veins-sweep.js): the points and joins from the frame's rows; 2: the same, its heads and runs with circles about the frame's points (tight)
uniform int posBase;                   // (morphOn) the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
uniform int joinBase;                  // (morphOn) the texel of the frame's joins: one a join (centre, reach, blend width and fillet)
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 \xD7 (arc length + S_OFF), across (0\u201365535), visibility (high byte) | the second lumen's share (low byte)
${R?"layout(location=2) out uvec4 outFlow2; // (the Tube) the second lumen's target, declared in the strip build too: the strip and the patch write the same four targets, so the draw buffers never change between them (a strip has no second lumen: it writes zero)":`#if SIMPLE == 0
layout(location=2) out uvec4 outFlow2; // near a join, the lumen it joins, packed (ROW2_BITS): row + 1 | across's top bits, 4 \xD7 (arc + S_OFF) | across's low bits
#else
uvec4 outFlow2;                        // (one vessel and no join: never a second lumen, always zero; the one-vessel build's draws leave that target as it stands, zero: see vesselDraw)
#endif`}
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

#define MAXS ${s?1:8}
#define MAXJ ${s?1:6}
#define ENT_W ${2048}
const float LAST = ${G-1}.0;
const float S_OFF = ${os}.0;

#if MESH == 2
vec4 E(int e, int k) { return texelFetch(pjTex, ivec2(k, e), 0); }   // (a patch: its joins' entries)
#else
vec4 E(int e, int k) { int t = e * 2 + k; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
#endif
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${G/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }
vec4 JT(int j) { int t = joinBase + j; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
${ro}
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
// How far two joined vessels make a corner at p (0 \u2026 1): whether each one's centreline lies off the other's toward p.
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

${tu}${R?`
${lu}`:""}
void main() {
#if MESH
  // (The ring's mark: the tier's lumens, by their keys: this depth over a lumen's, the depth test GREATER, sets the stencil.)
${R?p===2?"  gl_FragDepth = gl_FragCoord.z;   // (the Tube's patch: written on every path, then by the key block; strips write none)":"":"  if (mPass == MP_MARK) { gl_FragDepth = keyShape + 0.5 * keyH; return; }"}
#endif
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself (not interpolated across the cell): a pixel showing
  // the same spot of the figure after a pan by whole pixels gets exactly the same position, so the layer shifted by
  // those pixels is exactly the layer drawn there (see draw).
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y), ps = p - shOff;
  float reach = reachU + 2.0 * px;

  // \u2500\u2500 Nearest point of each vessel in this cell \u2500\u2500
  int n = 0;
  int sid[MAXS];
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS], sx[MAXS], sv[MAXS], sk[MAXS];
  vec2 sg[MAXS];
  int cur = -1;
  // bx: signed distance across the nearest segment's line (the lumen's across coordinate, also
  // past the vessel's ends); bu: how far along (0\u20131), running on past either end.
  float bd = 1e9, bs = 1e9, br = 0.0, bu = 0.0, bx = 0.0;
  // aU / aW: how far along, smooth off the wall: each nearby segment's course carried on straight past its ends,
  // weighted softly by how near it is. (The nearest segment's own is constant across the fan off a bend's
  // outside, and the glow's fade along the vessel, read from it, drew stripes there.)
  float aM = 1e9, aW = 0.0, aU = 0.0;
  vec2 bg = vec2(0.0);
  vec4 clip = vec4(0.0, 1.0, 1.0, 0.0);
  bool dotted = false;
  float rmx = 0.0;
#if MESH == 0
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
      if (id >= 0) { clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${pt}) != 0; rmx = texelFetch(rmax, ivec2(0, id), 0).r; }
    }
    if (k == cnt) break;
    // The head of this vessel's stretch of the list (segment index -1: a circle holding every point of the stretch, and
    // its length; see veins-bin). When every point lies out of reach, by the wall and by the shadow, the vessel would not
    // be kept here whatever its segments, so they are passed over.
    if (B.y < -0.5) {
      // (Between the views, tight: also the circle about the head's middle point as it is in this frame (veins-sweep.js fitSwept). Each
      // circle holds every point of the head's segments in this frame, so a pixel out of reach of either is out of reach of them all.)
      float hd = min(length(p - A.xy), length(ps - A.xy)) - A.z;
      if (morphOn == 2) { vec2 hc = PT(id, int(B.z + 0.5)); hd = max(hd, min(length(p - hc), length(ps - hc)) - A.w); }
      if (hd - rmx > reach + 0.01) k += int(B.w + 0.5);
      continue;
    }
    // A run of this vessel's segments (B.w of them, every point within B.z of this one's start: see veins-bin) that lies
    // wholly past what could change anything here is passed over: each of its segments would be farther than this
    // vessel's nearest so far by more than the 12 the along-course blend reads, and its shadow farther than the nearest
    // shadow, so it would change nothing. (Never the vessel's first run: the nearest so far starts unset.)
    if (B.w > 1.5) {
      float lo = length(p - A.xy) - B.z - rmx, los = length(ps - A.xy) - B.z - rmx;
      if (morphOn == 2) { vec2 rc = PT(id, int(A.w + 0.5)); lo = max(lo, length(p - rc) - A.z - rmx); los = max(los, length(ps - rc) - A.z - rmx); }
      if (lo > aM + 12.01 && los > bs + 0.01) { k += int(B.w + 0.5) - 1; continue; }
    }
    // (Between the views, the segment as it is in this frame: the entry holds a sample's, for the passes above.)
    if (morphOn >= 1) { int si = int(B.y + 0.5); A = vec4(PT(id, si), PT(id, si + 1)); }
    segNear(id, B.y, A, p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
  }
#else
#if MESH == 1
  // (A strip: its own vessel alone, the segments about the strip's sample: the nearest point of the vessel lies on one of them, since the
  // strip's triangles about each segment are what cover the pixels nearest it; the prepass keeps the nearest of the overlapping ones.)
  {
    int id = vRow;
    clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${pt}) != 0;
    int ic = clamp(int(vI), 0, ${G-2});
    for (int j = max(0, ic - MESH_WIN); j <= min(${G-2}, ic + MESH_WIN); j++)
      segNear(id, float(j), vec4(PT(id, j), PT(id, j + 1)), p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
    if (min(bd, bs) < reach) { sk[0] = bd; sid[0] = id; sd[0] = bd; sh[0] = bs; sr[0] = br; su[0] = bu; sg[0] = bg; sx[0] = bx; sv[0] = aW > 0.0 ? aU / aW : bu; n = 1; }
  }
#else
  // (A patch: a pixel outside every one of its joins' reach is drawn by the strips alone: there no join changes the shape (the join
  // loop below skips a join farther than its reach), and the strips' keys stand. Only the pixels inside one are worked out here.)
  {
    bool inJ = false;
    for (int k = 0; k < 6; k++) {
      if (k >= vNJ) break;
      vec4 A = E(vR.z + k, 0);
      if (morphOn >= 1) A = JT(int(A.x + 0.5));
      if (length(p - A.xy) <= A.z) inJ = true;
    }
    if (!inJ) discard;
  }
  // (A patch: its joins' vessels, each over its segments near them (the vertex shader found them).)
  for (int m = 0; m < 8; m++) {
    int mi = m < 4 ? m : m - 4;
    float mv = m < 4 ? vM0[mi] : vM1[mi];
    if (mv < -0.5) continue;
    int id = int(mv + 0.5), wa = m < 4 ? vWa[mi] : vWa2[mi], wb = m < 4 ? vWb[mi] : vWb2[mi];
    bool dup = false;
    for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == id) dup = true;
    if (dup) continue;
    bd = 1e9; bs = 1e9; br = 0.0; bu = 0.0; bx = 0.0; aM = 1e9; aW = 0.0; aU = 0.0; bg = vec2(0.0);
    clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${pt}) != 0;
    for (int j = wa; j <= wb; j++) segNear(id, float(j), vec4(PT(id, j), PT(id, j + 1)), p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
    if (min(bd, bs) < reach) { int s = n; sk[s] = bd; sid[s] = id; sd[s] = bd; sh[s] = bs; sr[s] = br; su[s] = bu; sg[s] = bg; sx[s] = bx; sv[s] = aW > 0.0 ? aU / aW : bu; n++; }
  }
#endif
#endif
  if (n == 0) { if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; } discard; }

  // \u2500\u2500 Junctions: which of these vessels are joined here, and how widely \u2500\u2500
  int jn = 0;
  int jm[MAXJ], jt[MAXJ], jtf[MAXJ];  // (jt: the members that are the trunk the others end on; jtf: those of them at a fork)
  float jk[MAXJ], jf[MAXJ], js[MAXJ];
#if SIMPLE == 0
  for (int k = 0; k < min(vR.w, 64); k++) {
    if (jn == MAXJ) break;
    vec4 A = E(vR.z + k, 0), B = E(vR.z + k, 1);
    if (morphOn >= 1) A = JT(int(A.x + 0.5));
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
#if MESH
${R?ou:nu}
#endif

  // \u2500\u2500 Nothing to draw here: settled now, without the tiers below \u2500\u2500
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

  // \u2500\u2500 Per-vessel attributes \u2500\u2500
  float stier[MAXS], sz[MAXS], sflag[MAXS], sa[MAXS], swall[MAXS], shov[MAXS], ssel[MAXS], sof[MAXS];
  vec3 scol[MAXS], sedge[MAXS];
  // (A vessel behind an organ fades to about 0.4 of full where the organ covers it, an atlas's structure seen through another;
  // the hepatic veins and sinusoids lie inside the liver, in their own tiers, and are not faded by it.)
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${ca} * organK : 0.0;
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
    vec3 aCol, aEdge;
    vesAttrs(sid[s], su[s], sv[s], p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
    stier[s] = aTier; sz[s] = aZ; sflag[s] = aFlag; swall[s] = aWall; sof[s] = aOf; scol[s] = aCol; shov[s] = aHov; ssel[s] = aSel; sedge[s] = aEdge;
    sa[s] = aA;
  }

  // Whether a lumen colour (scol) reaches this pixel: through a lumen drawn here (aL > 0) or a glow in its vessel's
  // own colour. Where neither does, the colour comes from the casings, shadows, rings and inks alone.
  bool dep = false;
  // (A lit vessel's glow, the thin soft band hugging its wall, is laid down with its own tier below.)

  // \u2500\u2500 Hand-off at a join across tiers \u2500\u2500
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
        float shown = tierAlpha[lt] * (tierGroup[lt] == 0 ? 1.0 - occl * sof[s] : 1.0);
        float aC = sa[s] * jf[j] * min(tierAlpha[ti], shown), aO = sa[s] * shown;
        if (aO > 1e-4) keep[s] = min(keep[s], clamp((1.0 - aC / aO) / max(1.0 - aC, 1e-4), 0.0, 1.0));
      }
    }
  }

  // \u2500\u2500 Tiers, back to front \u2500\u2500
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  // (A glow asked to lie on top (the Doppler's, wide + 10): over every vessel of its group it crosses, the ones above its own too.)
  vec4 topC = vec4(0.0);
  int topGrp = 1;
  float last = -1.0;
  // The frontmost lumen (for the blood drawn in it later) and how much of it shows.
  uint gId = 0u, gId2 = 0u;
  float gS = 0.0, gY = 0.0, gW = 0.0, gS2 = 0.0, gY2 = 0.0, gB = 0.0;
#if MESH
  // (What this pass's tier draws: its glows, its shadow, its shape, the selected vessel's lift, and whether a lumen of it shows here.)
  vec4 mLg = vec4(0.0), mLgU = vec4(0.0), mSh = vec4(0.0), mC = vec4(0.0);
  float mWs = 0.0;
  bool mLum = false;${R?`
  float mD = 1e9;                      // (the Tube) the tier's shape distance at this pixel: a patch that leaves the pixel clear inside its shape still claims it (tubeKey 2)`:""}
#endif
  for (int it = 0; it < MAXS; it++) {
    float tt = 1e9;
    for (int s = 0; s < MAXS; s++) if (s < n && stier[s] > last && stier[s] < tt) tt = stier[s];
    if (tt > 1e8) break;
    last = tt;
    int ti = int(tt + 0.5);
    int grp = tierGroup[ti];
#if MESH
    if (ti > tierNow) break;   // (the mesh draws one tier a pass; a patch runs the tiers below it only for the stream it hands on)
    if (ti < tierNow && mPass < MP_SHAPE_K) continue;   // (a glow or shadow pass: no stream, so not those)
#endif
    // \u2500\u2500 Glow: one thin soft band hugging a lit vessel's wall on both sides, fading to nothing at a free end.
    // Every highlight (hover, a slide's or step's vessels, the Doppler's) is this band, in its colour. It goes
    // down with the lit vessel's own tier: over every vessel in the tiers beneath, under the lit vessel itself,
    // so where it crosses another vessel its glow is not cut by that vessel's body.
    vec4 lg = vec4(0.0), lgU = vec4(0.0);
    for (int s = 0; s < MAXS; s++) {
      if (s >= n || stier[s] != tt) continue;
      vec4 gc, ge;
      float gv = glowAmt(sid[s], sd[s], swall[s], sv[s], sa[s], gc, ge);
      if (gc.a <= 0.0) continue;
      bool up = ge.w > 5.0;
      // None inside another lit vessel's lumen (the cava's two lengths, lit together): each band ends at the
      // other's wall, so a lit vessel's round end does not show as a disc in the next one's lumen.
      for (int u = 0; u < MAXS; u++) if (u != s && u < n && T(sid[u], 10).a > 0.0) gv *= smoothstep(-0.6, 0.6, sd[u] - swall[u]);
      if (gv > 0.0 && ge.z > 0.5) dep = true;
      if (up) { if (gv > lgU.a) lgU = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv); }
      else if (gv > lg.a) lg = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv);
    }
#if MESH
    if (ti == tierNow) { mLg = lg; mLgU = lgU; }
#endif
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
        float shown = tierAlpha[lt] * (tierGroup[lt] == 0 ? 1.0 - occl * sof[s] : 1.0);
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
    // vessel drawn above it in the tier (a crossing). A copy from a lower tier lies under every one of this tier's
    // own vessels, whatever its z: it never crosses over one, and one of them crosses over it. (A cavernoma strand
    // copied into the portal tier at the coronary vein's join, or at the confluence where the joins outnumber MAXJ,
    // took the pixels of its lumen from the portal vein it runs under, by its higher z; as a faded strand it then
    // drew almost nothing there, so dark lines cut through the vein: Portal vein clots, slide 5, 7 Nov 2026.)
    int ow = -1;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0 && (ow < 0 || sd[s] < sd[ow])) ow = s;
    int conn = 0;
    float kc = 0.0;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || sd[s] >= 0.0 || (conn & (1 << s)) != 0) continue;
      bool sOwn = stier[s] == tt, oOwn = stier[ow] == tt;
      if (sOwn != oOwn ? !sOwn : sz[s] <= sz[ow]) continue;
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
    bool sel = (flags & ${la}) != 0;
    float cA = (flags & ${fa}) != 0 ? 0.0 : (flags & ${pt}) != 0 ? 0.35 : 1.0;

    float aa = px * ${aa};   // (the figure's one edge softness, device px: edge.js, shared with the organ painter)
    // Where vessels of one tier cross, the one drawn above is cut out of the one below by a ring of the figure's ground 2.5 device px wide, outside its
    // casing, with its casing across the cut (the atlas convention): without it the two lumens swapped colour at an edge with no line. Only inside the
    // lower lumen (the ring is a cut in it), never at a join, never for a vessel without a casing.
    float kn = 0.0, kcas = 0.0;
    if (fx == 1 && paperInk.a > 0.0) for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || (conn & (1 << s)) != 0 || stier[s] != tt || sz[s] <= sz[ow] || sd[s] < 0.0) continue;
      int fl = int(sflag[s] + 0.5);
      if ((fl & (${fa} | ${pt})) != 0) continue;
      float reachK = swall[s] + 2.5 * px, fa = clamp(sa[s] * pres[s], 0.0, 1.0) * ((fl & ${yn}) != 0 ? 0.5 : 1.0);
      kn = max(kn, fa * paperInk.a * clamp(0.5 - (sd[s] - reachK) / aa, 0.0, 1.0));
      kcas = max(kcas, fa * clamp(0.5 - (sd[s] - swall[s]) / aa, 0.0, 1.0));
    }
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    if (aL > 0.0) dep = true;
#if MESH
    int fSh = flags;
    flags &= ~${Es};   // (the mesh lays the tier's shadow in a pass of its own, under the whole tier: shadowOf below)
#endif
#if MESH
    // (A glow or shadow pass draws neither the tier's shape nor its stream: the shading is left out there.)
    vec4 c = mPass >= MP_SHAPE_K ? ${R?"celShade":"tubeShade"}(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL) : vec4(0.0);
#else
    vec4 c = ${R?"celShade":"tubeShade"}(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL);
#endif
    c *= alpha * tierAlpha[ti];
#if MESH
    flags = fSh;
#endif
    float wsel = grp == 1 ? ssel[ow] : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
    float gf = grp == 0 ? 1.0 - occl * sof[ow] : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
    float lumA = aL * (1.0 - kn) * alpha * tierAlpha[ti] * gf;
#if MESH
    if (mPass < MP_SHAPE_K) lumA = 0.0;
#endif
    if (lumA > 0.02 && (flags & ${pt}) == 0) {
      // The stream shown here: the two joined lumens with the largest share, by nearness and by how
      // far past its own end each one runs (a vessel's streaks fade out beyond its end, so at a fork
      // the trunk's hand over to each branch along its own course instead of running on straight
      // across it). Equal where two lumens meet, fading over about a radius, so the stream and the
      // dye pass from one vessel into the next instead of stopping at a seam.
      float tb = max(0.7 * sr[ow], 1.5), w1 = 0.0, w2 = 0.0;
      int o1 = -1, o2 = -1;
      for (int s = 0; s < MAXS; s++) {
        if ((conn & (1 << s)) == 0 || (int(sflag[s] + 0.5) & ${pt}) != 0) continue;
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
    if (grp == 0) { c *= 1.0 - occl * sof[ow]; accB = over(c, accB); }
    else if (grp == 1) { accN = over(c, accN); if (wsel > 0.0) accT = over(c * wsel, accT); }
    else accT = over(c, accT);
#if MESH
    if (ti == tierNow) { mC = c;${R?" mD = D;":""} mWs = wsel; mLum = lumA > 0.02 && (flags & ${pt}) == 0; mSh = shadowOf(Ds, wall, flags, sel, aa) * alpha * tierAlpha[ti] * (grp == 0 ? gf : 1.0); break; }
#endif
  }
#if MESH
${R?su:au}
#endif
  if (topC.a > 0.0) {
    if (topGrp == 0) accB = over(topC, accB);
    else if (topGrp == 1) accN = over(topC * min(1.0 / max(netAlpha, 1e-3), 1.0 / topC.a), accN);
    else accT = over(topC, accT);
  }
  vec4 o = over(accT, over(accN * netAlpha, accB));
  if (o.a < 0.002) { if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; } discard; }
  outColor = ditherOut(o, q);
  outDep = vec4(dep ? 1.0 : 0.0);
  bool fl = gId > 0u && gW > 0.01;
  outFlow = fl ? packFlow(gId, gId2, gS, gY, gW, gB) : uvec4(0u);
  outFlow2 = fl && gId2 > 0u ? packFlow2(gId2, gS2, gY2) : uvec4(0u);
}`,fu=`#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 dir;
layout(location=2) in vec2 uv;
uniform mat3 world;
uniform vec2 size;
out vec2 vDir;
out vec2 vUV;
out vec2 vPos;   // the vertex's place in the world (the echo of a fan reads where a pixel lies)
void main() {
  vec3 d = world * vec3(pos, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vDir = dir; vUV = uv; vPos = pos;
}`,cu=`#version 300 es
precision highp float;
precision highp int;
in vec2 vDir;
in vec2 vUV;
in vec2 vPos;
uniform int mode;
uniform vec3 col;
uniform float alpha;
uniform vec2 light;
uniform vec2 fade;   // tubes: fade in over the first fade.x of the length, out over the last fade.y before len
uniform float len;
uniform int under;
uniform sampler2D base;
uniform ivec2 lA, lWrap, lSize;
uniform vec2 lowS, lowT;
uniform ivec2 lowSz;
uniform int lH;
uniform vec4 dopP0, dopP1, dopP2, dopP3, dopP4;   // the varix's lumen in the fan's frame: ten points, in units of the fan's reach
uniform vec4 dopQ;   // the fan's strength (0: no Doppler), the lumen's radius (the same unit), the path length to the first point and between points (world)
uniform vec4 dopG;   // the cast along the lumen: from, to, softness (world, from the needle's point), on
uniform vec4 dopF;   // the varix's display speed (signed along the path), the distance its blood has flowed (world)
uniform vec3 dopTow, dopAway;
uniform vec4 fanA;   // the fan an echo is lit by: its apex and axis
uniform vec2 fanB;   // its half angle and reach
uniform float echoK;   // 0: this draw is not lit by the fan
uniform vec3 taper;   // a tube: whole within x of its end, down to z beyond x + y
out vec4 o;
// The lumen's nearest point on its ten-point path from p: x the distance, y the length along the path (world, from the needle's point),
// z which side p lies on; tn the path's direction there.
vec3 dopLumen(vec2 p, out vec2 tn) {
  vec2 P[10];
  P[0] = dopP0.xy; P[1] = dopP0.zw; P[2] = dopP1.xy; P[3] = dopP1.zw; P[4] = dopP2.xy; P[5] = dopP2.zw; P[6] = dopP3.xy; P[7] = dopP3.zw; P[8] = dopP4.xy; P[9] = dopP4.zw;
  float best = 1e9, sb = 0.0, side = 0.0;
  tn = vec2(1.0, 0.0);
  for (int k = 0; k < 9; k++) {
    vec2 a = P[k], ab = P[k + 1] - a;
    float l2 = max(dot(ab, ab), 1e-9), t = clamp(dot(p - a, ab) / l2, 0.0, 1.0);
    vec2 d = p - (a + ab * t);
    float dd = length(d);
    if (dd < best) { best = dd; sb = dopQ.z + (float(k) + t) * dopQ.w; tn = ab * inversesqrt(l2); side = tn.x * d.y - tn.y * d.x; }
  }
  return vec3(best, sb, side);
}
float vesselCover() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  ivec2 rel = ivec2(ip.x, lH - 1 - ip.y) - lA;
  if (rel.x < 0 || rel.y < 0 || rel.x >= lSize.x || rel.y >= lSize.y) return 0.0;
  ivec2 lt = rel + lWrap;
  if (lt.x >= lSize.x) lt.x -= lSize.x;
  if (lt.y >= lSize.y) lt.y -= lSize.y;
  ivec2 lp = ivec2(lt.x, lSize.y - 1 - lt.y);
  if (lowSz.x > 0) return texture(base, (vec2(lp) + 0.5) * lowS / max(lowT, vec2(1.0))).a;
  return texelFetch(base, lp, 0).a;
}
void main() {
  vec3 L = normalize(vec3(light * 0.85, 0.95)), H = normalize(L + vec3(0.0, 0.0, 1.0));
  float a = alpha;
  vec3 c = col, n;
  if (mode <= 3 || mode == 7) {
    float v = clamp(vUV.x, -1.0, 1.0), e = 1.0 - abs(vUV.x);
    float aa = clamp(e / max(fwidth(vUV.x), 1e-4), 0.0, 1.0);
    a *= aa * smoothstep(0.0, max(fade.x, 1e-4), vUV.y) * clamp((len - vUV.y) / max(fade.y, 1e-4), 0.0, 1.0);
    a *= mix(taper.z, 1.0, 1.0 - smoothstep(taper.x, taper.x + max(taper.y, 1e-3), len - vUV.y));
    n = vec3(vDir * v, sqrt(max(0.0, 1.0 - v * v)));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), mode == 3 ? 60.0 : 34.0);
    if (mode == 0) { a *= pow(1.0 - v * v, 2.2); }
    else if (mode == 7) { c = col; }
    else if (mode == 1) {
      // Blood standing in the vein: deep at the walls, a soft sheen down its middle.
      c = col * (0.62 + 0.42 * dif) + vec3(0.16) * pow(max(dot(n, H), 0.0), 12.0);
      a *= smoothstep(0.0, 0.35, e);
    } else {
      // Polymer (2) or a metal band (3); the dark rim that draws its edge thins out when the tube is a
      // few pixels across, where it would turn the whole tube grey.
      float wpx = 2.0 / max(fwidth(vUV.x), 1e-4), rim = smoothstep(2.5, 9.0, wpx);
      if (mode == 2) {
        // Satin polymer: a broad soft sheen, the sides falling off gently into the hairline edge drawn under it.
        float sat = pow(max(dot(n, H), 0.0), 14.0);
        c = col * (0.66 + 0.38 * dif) + vec3(1.0) * sat * 0.28;
        c = mix(c, col * 0.62, smoothstep(0.55, 1.0, abs(v)) * 0.55 * rim);
      } else {
        // Brushed platinum: a cool grey with one narrow glint.
        c = col * (0.55 + 0.6 * dif) + vec3(1.0) * sp * 0.7;
        c = mix(c, col * 0.45, smoothstep(0.6, 1.0, abs(v)) * 0.6 * rim);
      }
    }
  } else {
    float r2 = dot(vUV, vUV), r = sqrt(r2);
    float aa = clamp((1.0 - r) / max(fwidth(r), 1e-4), 0.0, 1.0);
    vec2 w = vDir * vUV.x + vec2(-vDir.y, vDir.x) * vUV.y;
    float z = sqrt(max(0.0, 1.0 - r2));
    n = normalize(vec3(w, z + 1e-3));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), 34.0);
    if (mode == 8) { c = col; a *= aa; }
    else if (mode == 4) {
      // The rounded end shades like the shaft it closes (a cylinder across its width, not a ball), so
      // it reads as part of the tube rather than a glossy bead stuck on.
      float v = clamp(vUV.y, -1.0, 1.0);
      vec3 nc = vec3(vec2(-vDir.y, vDir.x) * v, sqrt(max(0.0, 1.0 - v * v)));
      float dc = max(dot(nc, L), 0.0), sc = pow(max(dot(nc, H), 0.0), 34.0);
      float sat = pow(max(dot(nc, H), 0.0), 14.0);
      c = col * (0.66 + 0.38 * dc) + vec3(1.0) * sat * 0.28;
      c = mix(c, col * 0.62, smoothstep(0.55, 1.0, r) * 0.55);
      a *= aa;
    } else if (mode == 5) {
      // Thin latex over contrast: clear in the middle, bright at the rim, a hard highlight up-left.
      // Clear latex over dilute contrast: see-through in the middle, denser toward its walls, a crisp thin rim, one small glint.
      float fr = pow(1.0 - z, 1.6), sp2 = pow(max(dot(n, H), 0.0), 160.0), edge = smoothstep(0.9, 0.99, r);
      c = col * (0.72 + 0.32 * dif) + vec3(1.0) * (sp * 0.12 + sp2 * 0.45);
      c = mix(c, col * vec3(0.42, 0.46, 0.52), edge * 0.85);
      float k = 0.46 + 0.36 * fr + 0.3 * sp2 + edge * 0.5;
      a *= aa * clamp(k, 0.0, 1.0);
    } else if (mode == 9) {
      // EUS-PPG's ultrasound sector (eus-scope.js): a fan from the transducer, uv its own frame (x along its middle, the arc at r 1)
      // and len its half angle; soft at its sides and its far edge, faint near the transducer, a few depth arcs across it.
      float ang = abs(atan(vUV.y, vUV.x)) / max(len, 1e-3), fw = max(fwidth(r * 6.0), 1e-4);
      float arcs = 1.0 - 0.35 * (1.0 - smoothstep(0.0, fw * 1.5, 0.5 - abs(fract(r * 6.0) - 0.5)));
      c = col;
      float shape = aa * (1.0 - smoothstep(0.8, 1.0, ang)) * smoothstep(0.0, 0.14, r);
      a *= shape * (0.45 + 0.55 * (1.0 - smoothstep(0.55, 1.0, r))) * arcs;
      if (dopQ.x > 0.001) {
        // Color Doppler where the varix's lumen lies in the fan (the glue slide): red where its blood runs toward the transducer, blue away, in
        // bands that travel with it, brighter down its middle (laminar); no flow, and the lumen stands dark in the fan, an anechoic hole. The
        // cast is bright echo, the blood stopped inside it.
        vec2 tn;
        vec3 Ld = dopLumen(vUV, tn);
        float R = dopQ.y, aaw = max(fwidth(Ld.x), 1e-5);
        float cover = (1.0 - smoothstep(R - aaw, R + aaw, Ld.x)) * shape * (1.0 - smoothstep(0.8, 1.0, r)) * dopQ.x;
        if (cover > 0.002) {
          float vd = dopF.x, sg = vd < 0.0 ? -1.0 : 1.0, kf = smoothstep(0.4, 5.0, abs(vd));
          float cs = dot(tn * sg, -vUV / max(r, 1e-4)), lat = clamp(Ld.z / max(R, 1e-5), -1.0, 1.0);
          float wave = 0.5 + 0.5 * sin(6.2832 * (Ld.y - dopF.y) / 7.0 + lat * 1.7);
          vec3 fc = mix(dopAway, dopTow, smoothstep(-0.12, 0.12, cs)) * (0.45 + 0.8 * wave * (1.0 - 0.38 * lat * lat) * (0.55 + 0.45 * abs(cs)));
          vec3 cd = mix(vec3(0.02, 0.03, 0.05), fc, kf);
          float ad = cover * mix(0.55, 0.9, kf);
          if (dopG.w > 0.5) {
            float ck = smoothstep(dopG.x - dopG.z, dopG.x + dopG.z, Ld.y) * (1.0 - smoothstep(dopG.y - dopG.z, dopG.y + dopG.z, Ld.y));
            cd = mix(cd, vec3(0.94, 0.96, 1.0) * (0.88 + 0.12 * sin(Ld.y * 1.3 + lat * 2.0)), ck);
            ad = mix(ad, cover * 0.95, ck);
          }
          float na = ad + a * (1.0 - ad);
          c = (cd * ad + col * a * (1.0 - ad)) / max(na, 1e-4);
          a = na;
        }
      }
    } else {
      float d = abs(r - 0.86), fw = max(fwidth(r), 1e-4);
      a *= clamp((0.07 - d) / fw + 0.5, 0.0, 1.0) * 0.9 + exp(-d * d * 160.0) * 0.35;
      a *= step(r, 1.0);
    }
  }
  if (echoK > 0.001) {
    // The needle and the coil are echogenic: lit white where the fan lies on them.
    vec2 q = vPos - fanA.xy;
    float rr = length(q) / max(fanB.y, 1e-3), an = abs(atan(dot(q, vec2(-fanA.w, fanA.z)), dot(q, fanA.zw))) / max(fanB.x, 1e-3);
    c = mix(c, vec3(1.0), 0.62 * echoK * (1.0 - smoothstep(0.85, 1.0, an)) * (1.0 - smoothstep(0.9, 1.0, rr)));
  }
  if (under == 1) a *= 1.0 - vesselCover();
  o = vec4(c * a, a);
}`,Zc=`
float chevOrange(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}
// A head's two inks, from the colour of the vessel it is on (vc) and that vessel's eased reversed flag (rv): the core and the light-or-dark
// rim. By the lumen's lightness, over a small band so a vessel whose colour eases never pops (visual-style B1): a dark head with a light rim
// on a pale lumen, a near-white head (chevLight) with a dark rim on a dark one (a dark head on a 30 mmHg lumen is 1.49:1, on 20 mmHg
// 2.64:1). The band sits at luma .38 to .46 (the 20 mmHg stop is .39, the arteries .33 to .40, so they flip). A reversed head stays orange (revCol) on any lumen but an orange one, where it takes the same near-white flip (chevOrange, as before). In the origin
// lens the head keeps its own ink (an orange head on the SMV's amber is 1.01:1): the \xBB pair behind it (chevHead) alone says reversed there.
void chevInks(vec3 vc, float rv, out vec3 core, out vec3 rim) {
  float rk = origin == 1 ? rv * (1.0 - blendA.y) : rv;
  float dark = 1.0 - smoothstep(0.38, 0.46, dot(vc, vec3(0.299, 0.587, 0.114)));
  float warm = rk * chevOrange(vc);
  vec3 ink = mix(chevInk, vc * 0.3, 0.2);
  core = mix(mix(mix(ink, chevLight, dark), revCol, rk), chevLight, warm);
  rim = mix(inkLight, vc * 0.45, max(dark, warm));
}
`,Yc=`#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`,Kc=`#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;
uniform mat3 world;
uniform vec2 size;
uniform float cell;
void main() {
  vec3 d = world * vec3(org + corner * cell, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`,hu=(s,p,R)=>`#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${s?1:0}
precision highp usampler2D;
uniform sampler2D base;                // the vessel layer (premultiplied)
uniform usampler2D gbuf;               // its frontmost lumen per pixel
${R?bc():`uniform usampler2D gbuf2;              // near a join, the lumen it joins and its share
`}uniform ivec2 lA, lWrap, lSize;        // the layer holds the screen pixels from lA (device px, y down) lSize on, pixel s in texel (s \u2212 lA + lWrap) wrapped at lSize
uniform vec2 lowS;                     // R10: a tier frame's layer read straight from its small targets: their share of the layer (0: the layer itself)
uniform ivec2 lowSz;                   // (the share's texels: the corner of the small targets the tier drew in)
uniform vec2 lowT;                     // (the small targets' size, texels: the colour is read filtered at uv inside them)
uniform int lH;                        // the picture's height (device px)
${An.samplers}
uniform sampler2D plate0, plate1;
uniform vec4 plateRect0, plateRect1;
uniform int plates;                    // bit 0: whole plate, bit 1: sharp view
// (The organs drawn layer by layer instead (organs-gl.js), device pixels, premultiplied, are read from plate1's unit while they are on
// (stackOn): the plate rasters are not then, so one unit holds either.)
uniform int stackOn;
uniform float plateAlpha, plateSat;
uniform highp sampler2D fluidMask;     // the peritoneal cavity: its half-width about the middle of fluidRect, row by row down it
uniform vec4 fluidRect;
uniform vec4 fluidS;                   // ascites: floor, height, ripple amplitude, ripple phase (world units, radians)
uniform vec4 fluidInk;                 // its straw color (straight) and opacity at depth; a = 0: none
uniform vec2 fluidLv;                  // the liver's scale about 560 350, and how far the fluid is kept off it (its lower edge: fluidMask row 1)
uniform mat3 inv;                      // device pixels \u2192 world
uniform float H;                       // canvas height, device pixels
${An.pxW}
// The circuit's map, under everything (2 Nov 2026, the figure's SVG model as data): the dot grid running on past the figure and fading
// out in steps, the two tinted pressure zones and a slide's lit zone (mapAt). mapA: its opacity (the morph's t; 0 draws and reads none).
uniform float mapA;
uniform vec4 mapDot, mapFx;            // straight rgb and alpha: the grid's dots, the lit zone (its fade in the alpha)
uniform vec4 mapZone[3];               // straight rgb and alpha of the three tinted zones, before the liver, the liver, after it (the chart's own zone bands)
uniform vec4 mapAlt;                   // the portal veins' and the hepatic veins' x spans (world); the liver's lies between them
uniform vec2 mapFxX;                   // the lit zone's x span
uniform vec4 mapRot;                   // cos, sin of the map's turn from the vessels' (it turns upright at once, never with the morph), its centre
uniform int blood;                     // 1: draw the blood
uniform int chev;                      // 1: flow chevrons on top (dark; orange where flow is reversed, cream on an orange vessel)
uniform int chevQuad;                  // 1: the chevrons are drawn by their own quads after this pass (blood-heads.js), not tested here on every lumen pixel
uniform int still;                     // 1: reduced motion (the chevrons stand still, spaced by flow)
uniform vec3 chevInk;
uniform vec3 chevLight;                // a reversed chevron's head on an orange vessel (near-white cream)
uniform float cssPx;                   // canvas px per CSS px (stage.js vdpr, at most 2)
uniform float flowA;                   // 0..1: how visible the moving blood and chevrons are (they fade in once the view is still)
uniform vec2 blendA;                   // 0..1 each: the chevrons and the origin colours fading in or out (switched on or off)
${An.modes}
${An.ink}
uniform vec4 bleedE[24];               // an active bleed (stage.js bleedSpray, blood.js bleedShapes): the pool: its surface's height, ripple, where the stream lands, the stream's strength; the stream: its start, where it lands, the pool's surface
uniform vec4 bleedB[24];               // alpha in z, kind in w (0 pool, 2 stream); the pool: its inset from the wall; the stream: its radius, how far it breaks into drops
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
${An.rows}
uniform sampler2D lineL;               // the organ outlines, drawn once per change (premultiplied, device pixels)
uniform int lineOn;
uniform sampler2D glowL;               // soft glows behind the plate (an organ a slide points at), same drawing
uniform int glowOn;
uniform sampler2D warmL;               // warm glows over the plate and under the vessels (the edges of a lit organ's loops), same drawing
uniform int warmOn;
uniform int bloodOnly;                // 1: a frame where only the blood moved (composite): a pixel with no lumen is left as drawn
uniform int stillOn;                   // 1: the uniforms are the last picture's; flow column FLOW_TEXELS says which rows moved since
out vec4 outColor;

${hc()}
const float STO_Y0 = ${Vf}.0, STO_DY = ${Wf}.0;
const int STO_N = ${Za};
const vec2 STO[${Za}] = vec2[${Za}](${Hf.map(([A,B])=>`vec2(${A.toFixed(2)}, ${B.toFixed(2)})`).join(", ")});

${uc()}
// The circuit's map at world point w, premultiplied (see mapA). The grid: a dot of radius 0.9 every 20 units (at 10, 10 in each square),
// its alpha by the frame it lies in (MAP_STEPS: how far outside the figure's frame, the larger of the two axes); under a pixel's size a dot
// keeps its area (wider, fainter), as the browser's antialiasing had it. Then the tinted zones and the lit zone over it, edges a pixel soft.
vec4 mapAt(vec2 w) {
  w = vec2(mapRot.x * (w.x - mapRot.z) - mapRot.y * (w.y - mapRot.w), mapRot.y * (w.x - mapRot.z) + mapRot.x * (w.y - mapRot.w)) + mapRot.zw;
  float e = max(max(30.0 - w.x, w.x - 1370.0), max(30.0 - w.y, w.y - 730.0));
  float op = e <= 0.0 ? 0.9 : e <= 200.0 ? 0.7 : e <= 450.0 ? 0.5 : e <= 750.0 ? 0.3 : e <= 1100.0 ? 0.15 : e <= 1500.0 ? 0.06 : 0.0;
  vec4 c = vec4(0.0);
  if (op > 0.0) {
    float d = length(w - (floor(w / 20.0) * 20.0 + 10.0)), rr = max(0.9, 0.7 * pxW);
    float a = mapDot.a * op * clamp((rr - d) / pxW + 0.5, 0.0, 1.0) * min(1.0, 0.81 / (rr * rr));
    c = vec4(mapDot.rgb * a, a);
  }
  float iy = clamp(min(w.y - 40.0, 730.0 - w.y) / pxW + 0.5, 0.0, 1.0);
  if (iy > 0.0) {
    float zp = clamp(min(w.x - mapAlt.x, mapAlt.y - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[0].a;
    float zl = clamp(min(w.x - mapAlt.y, mapAlt.z - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[1].a;
    float zh = clamp(min(w.x - mapAlt.z, mapAlt.w - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[2].a;
    c = over(vec4(mapZone[0].rgb * zp, zp), c);
    c = over(vec4(mapZone[1].rgb * zl, zl), c);
    c = over(vec4(mapZone[2].rgb * zh, zh), c);
    float f = clamp(min(w.x - mapFxX.x, mapFxX.y - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapFx.a;
    c = over(vec4(mapFx.rgb * f, f), c);
  }
  return c * mapA;
}
${R?vc():dc()}
${zf}
// How orange a vessel's colour is (0..1): a bright red channel well above the blue, with green between a red's and a
// yellow's, eased at each edge (the reversed orange and the heat ramp's orange 1; teal, wine, red, yellow and grey 0).
${Zc}
// Flow arrowheads along the axis, pointing and moving with the mean flow: a slim filled head with
// a notched back. Returns its coverage (x) and a soft rim just outside it (y).
${pc()}
// (f0, f1, len and Rs, the caliber at s: read once in main.)
// One vessel's heads, placed by a stream's pattern: se = A + B s its arc along that stream (B = 1, se = s for the vessel's own),
// Dm the stream's distance, Rsp the caliber its spacing is set by (the stream's own, so a chain of vessels shares one spacing).
// ends: the weights of a link at the from and to end (flow texel 5, z and w; above 0: a chained end, through which the heads
// run instead of fading out).
vec2 chevOne(int id, float s, float y, vec4 f0, vec4 f1, float len, float Rs, float R, float se, float Bm, float Dm, float Rsp, vec2 ends) {
  // (The heads point by the speed that moves them: the stream distance D integrates vd, so a head points the way it travels.)
  float vd = f0.y, dir = vd < 0.0 ? -1.0 : 1.0;
  // Spacing: a power-of-two multiple of 28 world units (it divides the stream's period: no jump on
  // wrap), at least ~60 px on screen. Zooming out, every other head fades away before the spacing
  // doubles (the coarser heads are a subset of the finer ones), so nothing jumps or pops.
  float lv = max(0.0, log2(max(3.6 * Rsp, 60.0 * pxW) / 28.0));
  // Reduced motion: the heads stand still, so their spacing carries the flow instead: closer where more blood passes
  // (flow texel 3, y: a coarser level for less flow). Never closer than the zoom allows.
  if (still == 1) lv = max(lv, texelFetch(flow, ivec2(3, id), 0).y);
  // The heads stand 2.5 times as far apart as the zoom and the flow alone set them (Mohammad, 31 Oct: "too many chevrons"), on every vessel,
  // zoom and device: a constant added to the level (log2 2.5), so the doubling and its fade of every other head ease exactly as before, only
  // 2.5 times wider. The ends' fade-in below keeps the spacing it had (Pc), so a short vessel's heads do not dim for want of room.
  float Pc = 28.0 * exp2(lv);
  lv += 1.3219281;
  float n = floor(lv), fr = lv - n;
  float P = 28.0 * exp2(n);
  float xe = mod(se - Dm + 0.5 * P, P) - 0.5 * P;
  float x = xe / Bm, u = x * dir;
  float sc = s - x;
  float odd = mod(floor((se - xe - Dm) / P + 0.5), 2.0);
  float keep = odd > 0.5 ? 1.0 - smoothstep(0.15, 0.85, fr) : 1.0;
  float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;            // half width, length: one fixed shape per vessel, never stretched
  // Past the head and its soft rim along the course (|u| > 0.55 L + 0.19 hw + 3.4 px reaches nothing): no more reads.
  if (abs(x) > (0.6 + 0.4 * f1.w) * L + 0.15 * hw + 4.0 * pxW) return vec2(0.0);   // (a reversed head's \xBB pair reaches 0.4 L further behind)
  // Across, and the lumen where the head sits (so none overhangs a narrowing vessel), between the radius samples.
  float yd = y * Rs, ay = abs(yd);
  float Rl = radAt(id, sc, len);
  // On a bend the arc length runs along the axis, so off it the same span of s is shorter on the inside and longer on
  // the outside: measured in s alone a head squashes and bends with the vessel. Its true distance along, at yd across,
  // is the span of s times (1 \u2212 \u03BA yd), so the head keeps its one straight shape wherever it sits.
  u *= clamp(1.0 - bendAt(id, sc, len) * yd, 0.25, 2.5);
  // Toward either end a head fades out (and the next vessel's fade in), never cut by a join; through a chained end it runs on.
  float lo = 0.6 * L, ramp = max(2.0 * L, 0.3 * Pc), endF;
  if (ends.x <= 0.0 && ends.y <= 0.0) {
    float e = min(sc, len - sc);
    if (e < lo) return vec2(0.0);
    endF = smoothstep(lo, lo + ramp, e);
  } else {
    float a0 = sc < lo ? 0.0 : smoothstep(lo, lo + ramp, sc), a1 = len - sc < lo ? 0.0 : smoothstep(lo, lo + ramp, len - sc);
    endF = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0)));
    if (endF <= 0.0) return vec2(0.0);
  }
  float fade = smoothstep(0.5, 3.0, abs(vd)) * f1.z * texelFetch(flow, ivec2(3, id), 0).x * keep * endF * smoothstep(1.3 * pxW, 2.4 * pxW, R);
  // Where the lumen is narrower than the head, the head fades out instead of squeezing to fit.
  fade *= smoothstep(0.85 * hw, 1.15 * hw, Rl);
  return chevHead(u, ay, hw, pxW, f1.w) * fade;
}
vec2 chevAt(int id, float s, float y, vec4 f0, vec4 f1, float len, float Rs) {
  // One size and one spacing for the whole vessel (from its caliber midway), so every head is the
  // same shape and they keep an even distance; they move at the vessel's own speed, whatever the zoom.
  float R = max(texelFetch(rad, ivec2(N_LAST / 2, id), 0).r, 0.3);
  if (R < 1.3 * pxW) return vec2(0.0);
  // A stream carried on from another vessel (createStreamChain): its heads are the root's, spaced by the root's caliber, so they
  // run from one vessel into the next; mixed with the vessel's own by the link's weight while it forms or lets go. (Reduced
  // motion: the still heads are spaced by each vessel's own flow, so each keeps its own.)
  vec4 ch4 = texelFetch(flow, ivec2(4, id), 0), ch5 = texelFetch(flow, ivec2(5, id), 0);
  float cw = still == 1 ? 0.0 : ch4.w;
  vec2 c = vec2(0.0);
  if (cw < 1.0) c = chevOne(id, s, y, f0, f1, len, Rs, R, s, 1.0, f0.x, R, ch5.zw);
  if (cw > 0.0) {
    int rid = int(ch4.x + 0.5) - 1;
    float Rr = max(texelFetch(rad, ivec2(N_LAST / 2, rid), 0).r, 0.3);
    vec2 cc = chevOne(id, s, y, f0, f1, len, Rs, R, ch4.y + ch4.z * s, ch4.z, rootDD(rid, ch5.xy).x, Rr, ch5.zw);
    c = cw >= 1.0 ? cc : mix(c, cc, cw);
  }
  return c;
}
${R?"":mc()}

// Ascites at world point w, premultiplied (its own colour whatever the lens; see main): over the plate and the vessels. Also the
// arrowheads' quads (HEADS), which lay a head under it as main does.
vec4 fluidAt(vec2 w) {
  vec4 fluidC = vec4(0.0);
  if (fluidInk.a > 0.0) {
    vec2 fu = (w - fluidRect.xy) / fluidRect.zw;
    if (all(greaterThanEqual(fu, vec2(0.0))) && all(lessThanEqual(fu, vec2(1.0)))) {
      float c = (w.x - 712.0) / 400.0;
      float s = fluidS.x - fluidS.y * (0.8 + 0.2 * c * c * clamp(fluidS.y / 485.0, 0.0, 1.0)) + (sin(w.x / 38.0 + fluidS.w) * 0.7 + sin(w.x / 23.0 - fluidS.w * 1.3) * 0.3) * fluidS.z;
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
        // Fluid, not a floor (looks review, 31 Oct): two stops of its own depth, more see-through at its upper edge than deeper down
        // (0.55 of the ink at the surface, full by about 28 units under it), and a thin pale meniscus along the surface in place of
        // the denser band that made the edge read as a rim.
        float a = fluidInk.a * (0.55 + 0.45 * smoothstep(0.0, 28.0, d));
        float men = exp(-d * d / 10.0);
        a = min(a, 1.0) * e;
        vec3 fc = mix(fluidInk.rgb, mix(fluidInk.rgb, vec3(1.0), 0.45), men);
        fluidC = vec4(fc * a, a);
      }
    }
  }
  return fluidC;
}
${p?`#if 0   // (the arrowheads' build: its own main, below)
`:""}void main() {
  vec2 FC = gl_FragCoord.xy;
  ivec2 ip = ivec2(FC);
  // (The vessel layer's texel for this pixel, lp, if the layer holds it (inL); a pixel outside it holds nothing, as the layer's own
  // cleared pixels. With lA and lWrap zero and the layer the picture's size, lp is the pixel itself.)
  ivec2 rel = ivec2(ip.x, lH - 1 - ip.y) - lA;
  bool inL = rel.x >= 0 && rel.y >= 0 && rel.x < lSize.x && rel.y < lSize.y;
  ivec2 lt = rel + lWrap;
  if (lt.x >= lSize.x) lt.x -= lSize.x;
  if (lt.y >= lSize.y) lt.y -= lSize.y;
  ivec2 lp = ivec2(lt.x, lSize.y - 1 - lt.y);
  // (R10: on a tier frame the layer is its small targets, read where the stretch would have laid each pixel: the lumens' integers
  // at the nearest texel, the colour filtered, as the blit up had done; no full-size copy of the layer is made.)
  vec2 lowUV = (vec2(lp) + 0.5) * lowS / max(lowT, vec2(1.0));
  if (lowSz.x > 0) lp = min(ivec2(vec2(lp) * lowS), lowSz - 1);
${R?xc({LUMEN2:Tn,FLOW_TEXELS:Xt}):`  uvec4 g = (inL ? texelFetch(gbuf, lp, 0) : uvec4(0u));
  // Between whole redraws a pixel with no lumen comes out as the last frame left it: everything it is made of (the plate, the
  // glows, the vessel layer, still fluid, the outlines) is unchanged, and the blood, chevrons, dye and origin colours are drawn
  // only where a lumen is (g.x > 0). So it is not drawn again: the blood squares' other pixels were most of each frame's work
  // zoomed in (Mohammad's Mac at rest, zoom 4.24, 21 Oct: 86 frames in 2 s against 121 at 3.08), for the same picture.
  if (bloodOnly == 1 && g.x == 0u) discard;
  // (The row's top bit says a second lumen is written beside it, near a join: the vessel shader's outFlow. Set only where the row
  // is, so the test above holds either way.)
  bool two = (g.x & ${Tn}u) != 0u;
  g.x &= ${Tn-1}u;
  // ...and, in the same pass, a lumen whose vessels' rows have not changed since the last picture, which had the same uniforms
  // (stillOn: composite checks them): it would come out as it is (see moved in createVeinsGL).
  if (bloodOnly == 1 && stillOn == 1 && texelFetch(flow, ivec2(${Xt}, int(g.x) - 1), 0).x == 0.0
      && (!two || texelFetch(flow, ivec2(${Xt}, int((inL ? texelFetch(gbuf2, lp, 0) : uvec4(0u)).x & ${so}u) - 1), 0).x == 0.0)) discard;
`}  vec2 w = (inv * vec3(FC.x, H - FC.y, 1.0)).xy;
  vec4 v = (inL ? texelFetch(base, lp, 0) : vec4(0.0));
  if (lowSz.x > 0 && inL) v = texture(base, lowUV);   // (R10: a tier frame's colour, filtered as the blit up filtered it)
  // Under a fully opaque vessel pixel (the inside of nearly every lumen) nothing laid below it can show: over(v, under) is
  // v + under \xD7 (1 \u2212 1), exactly v. So the plate, its grey-down, the glows, the organ layers and the pool are not read there.
  // The vessel layer's alpha is 8-bit, so 1.0 is exact; an edge, a faded tube or a ghosted tier (alpha under 1) lays them all.
  bool under = v.a < 1.0;
  vec4 pl = vec4(0.0);
  // The plate: the sharp view raster where it lies, else the whole-plate one.
  if (under) {
    if (stackOn == 1) pl = texelFetch(plate1, ip, 0);
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
    // The circuit's map lies under it all, the organs and their glows over it (as the SVG grid lay under the organs).
    if (mapA > 0.0) pl = over(pl, mapAt(w));
    if (glowOn == 1) pl = over(pl, texelFetch(glowL, ip, 0));
    // A warm glow lies on the organs, under the vessels: added after the plate's dimming, so it keeps one strength whatever the lens
    // greys the organs to, and with or without the plate (the page's own organs show under it then).
    if (warmOn == 1) pl = over(texelFetch(warmL, ip, 0), pl);
  }
  // Ascites over the plate and the vessels (they show through it), in its own color whatever the lens: a meniscus (highest at the flanks)
  // with a slow two-part ripple, deeper fluid a little denser, a soft brighter band just under the surface.
  vec4 fluidC = fluidAt(w);

${R?gc():`  float vis = g.x > 0u ? clamp(float(g.w >> 8u) / 255.0 / max(v.a, 1e-3), 0.0, 1.0) : 0.0;
  if ((blood == 1 || dyeOn == 1 || chev == 1 || origin == 1) && (vis > 0.005 || (dyeOn == 1 && g.x > 0u)) && v.a > 0.01) {
    vec3 col = v.rgb / v.a;
    // This lumen, and near a join the one it joins, cross-faded by its share.
    // (Read only where there is one: everywhere else that target is zero, as the vessel shader writes it.)
    uvec4 g2 = two ? (inL ? texelFetch(gbuf2, lp, 0) : uvec4(0u)) : uvec4(0u);
    // (The second lumen unpacked (ROW2_BITS): its row, its arc in quarters, its across at the middle of its 128th; its share beside the
    // front lumen's visibility.)
    uint r2 = g2.x & ${so}u;
    float b = r2 > 0u ? float(g.w & 255u) / 255.0 : 0.0;
    int id1 = int(g.x) - 1, id2 = int(r2) - 1;
    float s1 = float(g.y) / 16.0 - S_OFF, y1 = float(g.z) / 32767.5 - 1.0;
    float s2 = float(g2.y >> 2u) / 4.0 - S_OFF, y2 = (float(((g2.x >> ${fo}u) << 2u) | (g2.y & 3u)) + 0.5) / 64.0 - 1.0;
    if (origin == 1) {
      // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey.
      float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / ORIGIN_GREY, 0.55, 1.45);
      // A vessel that carries no blood (origin fractions marked \u22121, e.g. a lymphatic) keeps its own color.
      vec3 oc = texelFetch(flow, ivec2(2, id1), 0).x < -0.5 ? col : min(originAt(id1, s1, y1, max(texelFetch(rad, ivec2(N_LAST / 2, id1), 0).r, 0.3)) * shade, vec3(1.0));
      if (b > 0.004) oc = mix(oc, texelFetch(flow, ivec2(2, id2), 0).x < -0.5 ? col : min(originAt(id2, s2, y2, max(texelFetch(rad, ivec2(N_LAST / 2, id2), 0).r, 0.3)) * shade, vec3(1.0)), b);
      col = mix(col, oc, vis * blendA.y);
    }
    // The front lumen's flow, length, caliber here and own colour, read once for the arrowheads and the lymph and bile marks. None is drawn
    // in a vessel whose strength (f1.z) is not above zero.
    vec4 f0 = vec4(0.0), f1 = vec4(0.0);
    float len1 = 1.0, R1 = 0.3;
    vec3 vc1 = vec3(0.0);
    if (blood == 1 || chev == 1) {
      f0 = texelFetch(flow, ivec2(0, id1), 0); f1 = texelFetch(flow, ivec2(1, id1), 0);
      f0.x = flowD(id1, f0.x, f0.y);   // (the distance now: flowD)
      if (f1.z > 0.0) {
        len1 = max(texelFetch(tube, ivec2(5, id1), 0).z, 1.0);
        R1 = radAt(id1, s1, len1);
        vc1 = mix(texelFetch(tube, ivec2(0, id1), 0).rgb, texelFetch(tube, ivec2(1, id1), 0).rgb, alongAt(id1, clamp(s1 / len1, 0.0, 1.0)));
      }
    }
    // Near a join: whether the two lumens draw one pattern there (rel, 0..1: one is carried on from the other, or both from the
    // same parent; createStreamChain). 0 where nothing is chained (?bloodchain=0, the lobule).
    float rel = 0.0;
    vec4 f0b = vec4(0.0), f1b = vec4(0.0);
    float len2 = 1.0, R2 = 0.3;
    if (b > 0.004 && (blood == 1 || chev == 1)) {
      float p1 = texelFetch(flow, ivec2(3, id1), 0).w - 1.0, p2 = texelFetch(flow, ivec2(3, id2), 0).w - 1.0;
      float w1 = texelFetch(flow, ivec2(4, id1), 0).w, w2 = texelFetch(flow, ivec2(4, id2), 0).w;
      if (p1 > -0.5 && abs(p1 - float(id2)) < 0.5) rel = w1;
      else if (p2 > -0.5 && abs(p2 - float(id1)) < 0.5) rel = w2;
      else if (p1 > -0.5 && abs(p1 - p2) < 0.5) rel = min(w1, w2);
      len2 = max(texelFetch(tube, ivec2(5, id2), 0).z, 1.0);
      if (rel > 0.0) {
        f0b = texelFetch(flow, ivec2(0, id2), 0); f1b = texelFetch(flow, ivec2(1, id2), 0);
        f0b.x = flowD(id2, f0b.x, f0b.y);
        if (f1b.z > 0.0) R2 = radAt(id2, s2, len2);
        else rel = 0.0;
      }
    }
    bool isLy = f1.x < -0.5;   // (a lymph row: dashes, never arrowheads)
    if (blood == 1 && isLy && f1.z > 0.0) {
      float lc, lk;
      lymphAt(s1, y1, f0, len1, R1, lc, lk);
      // The dash's ink: clearly deeper than the channel's own green (lighter in the dark theme); the core a visible but quiet albumin amber.
      vec3 ink = mix(vc1, f0.w > 0.5 ? vec3(0.78, 0.95, 0.70) : vec3(0.30, 0.56, 0.28), 0.62);
      vec3 amber = f0.w > 0.5 ? vec3(0.95, 0.71, 0.29) : vec3(0.89, 0.60, 0.12);
      float aL = clamp(f1.z * vis * flowA, 0.0, 1.0);
      col = mix(col, ink, lc * aL);
      col = mix(col, amber, lk * aL);
    }
    if (dyeOn == 1) {
      float dc1 = dyeAt(id1, s1, y1), dc2 = b > 0.004 ? dyeAt(id2, s2, y2) : 0.0;
      float c = dc1 * (1.0 - b) + dc2 * b;
      // A rich, slightly glowing column: the dye tints the lumen and lifts it a little.
      // The wall line across a join (the end cap of the vessel) knocks vis to zero, which read as a seam; across
      // the lumen (away from the side walls) the dye fills regardless, and along the walls it follows vis.
      float inLumen = 1.0 - smoothstep(0.6, 0.85, abs(y1));
      float dyeK = max(smoothstep(0.0, 0.2, vis), inLumen);
      col = mix(col, dyeCol, clamp(c, 0.0, 1.0) * 0.9 * dyeK);
      // The bolus's leading edge, a few pixels of the lumen's own deep shade where the dye thins out ahead of it (the lime is told from a
      // pale lumen by hue alone: 1.04:1 on the lowest stop; visual-style B4). Only where there is dye, so a clear lumen costs no read.
      if (c > 0.02) {
        float de = dyeEdge(id1, s1, y1, dc1) * (1.0 - b) + (b > 0.004 ? dyeEdge(id2, s2, y2, dc2) * b : 0.0);
        col = mix(col, vc1 * 0.45, de * 0.55 * clamp(c, 0.0, 1.0) * dyeK);
      }
    }
${wc()}    v = vec4(col * v.a, v.a);
  }
`}  // An active bleed. Inside the stomach, under the vessels that cross it (so the plate's depth holds): the pool, the stomach's own
  // lumen (STO, row by row) below a flat surface that ripples where the stream lands, lighter and thinner at the surface, darker
  // with depth and toward the wall; and the stream, a thread of blood that leaves the tear, curves out and falls to the pool,
  // thinning as it goes and breaking into drops when it is slow. It flows, but never pulses: no jets or drops at the tear.
  vec3 bc = vec3(${Qa("--bleed-spray").map(A=>A.toFixed(1)).join(", ")}) / 255.0;
  vec3 bf = vec3(${Qa("--bleed-fresh").map(A=>A.toFixed(1)).join(", ")}) / 255.0;
  vec3 bd = vec3(${Qa("--bleed-deep").map(A=>A.toFixed(1)).join(", ")}) / 255.0;
  vec4 inner = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= bleedN || !under) break;
    vec4 bE = bleedE[i], bB = bleedB[i];
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
  if (lineOn == 1) o = over(texelFetch(lineL, ip, 0), o);
  outColor = o;
}${p?`
#endif
${Uc({LUMEN2:Tn,ROW2_MASK:so,FLOW_TEXELS:Xt})}`:""}`,io=(s=!1,p=!1,R=0)=>hu(s,p,R&&!p?1:0),uu=`#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 nrm;
layout(location=2) in vec2 sideW;   // side (\u22121 or 1), half width (world units); a fill's edge fringe: (0 or 1, \u22121)
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
}`,du=`#version 300 es
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
  } else a = col.a * clamp(max(vW, 0.5) + 0.5 - abs(vD), 0.0, 1.0) * fe;   // (a stroke is at least one device pixel wide, at full strength: the stent's struts and rails, a balloon's rim, visual-style D3)
  o = vec4(col.rgb * a, a);
}`;function Gr(s,p,R){let A=s.createShader(p);return s.shaderSource(A,R),s.compileShader(A),A}function de(s,p,R){let A=[typeof p=="string"?Gr(s,s.VERTEX_SHADER,p):p,typeof R=="string"?Gr(s,s.FRAGMENT_SHADER,R):R],B=s.createProgram();for(let O of A)s.attachShader(B,O);return s.linkProgram(B),{p:B,sh:A}}function pe(s,{p,sh:R}){if(!gn){for(let O of R)if(!s.getShaderParameter(O,s.COMPILE_STATUS))throw new Error(s.getShaderInfoLog(O))}if(!s.getProgramParameter(p,s.LINK_STATUS)){for(let O of R)if(!s.getShaderParameter(O,s.COMPILE_STATUS))throw new Error(s.getShaderInfoLog(O));throw new Error(s.getProgramInfoLog(p))}let A={},B=s.getProgramParameter(p,s.ACTIVE_UNIFORMS);for(let O=0;O<B;O++){let z=s.getActiveUniform(p,O).name.replace(/\[0\]$/,"");A[z]=s.getUniformLocation(p,z)}return{p,u:A}}function ne(s,p){let R=s.createTexture();return s.bindTexture(s.TEXTURE_2D,R),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,p||s.NEAREST),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,p||s.NEAREST),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),R}function e0(s,p=new Float32Array(G)){let R=Math.min(s?.length||0,G),A=(e0.scratch||=new Float32Array(G)).fill(0);for(let B=1;B<R-1;B++){let O=s[B][0]-s[B-1][0],z=s[B][1]-s[B-1][1],D=s[B+1][0]-s[B][0],F=s[B+1][1]-s[B][1],ae=.5*(Math.hypot(O,z)+Math.hypot(D,F));A[B]=ae>1e-6?Math.atan2(O*F-z*D,O*D+z*F)/ae:0}R>2&&(A[0]=A[1],A[R-1]=A[R-2]);for(let B=0;B<G;B++)p[B]=B<R?(A[Math.max(0,B-1)]+2*A[B]+A[Math.min(R-1,B+1)])/4:0;return p}function qc(s,p,R){if(!s||!(p>0))return null;let A=1/0,B=1/0,O=-1/0,z=-1/0;for(let D=0;D<p;D++){let F=s[D*6],ae=s[D*6+1];F<A&&(A=F),ae<B&&(B=ae),F>O&&(O=F),ae>z&&(z=ae)}return[A,B,O+R,z+R]}function pu(s,p,R,A,B,O,z,D,F){if(!(p[2]>p[0]&&p[3]>p[1]))return!1;let ae=O/D,Be=z/F,Fe=Math.ceil(Math.abs(R)*Math.max(ae,Be))+1,mt=R*p[0]*ae+A,Rn=R*p[2]*ae+A,e=R*(z-p[3]*Be)+B,ha=R*(z-p[1]*Be)+B;return s[0]=Math.max(0,Math.floor(Math.min(mt,Rn))-Fe),s[2]=Math.min(O,Math.ceil(Math.max(mt,Rn))+Fe),s[1]=Math.max(0,Math.floor(Math.min(e,ha))-Fe),s[3]=Math.min(z,Math.ceil(Math.max(e,ha))+Fe),s[2]>s[0]&&s[3]>s[1]}function fd(s,{tubes:p,force:R=!1,who:A="stage",onPlate:B=null,share:O=null}){let z=O?.canvas||null,D=O?{tex:null,fbo:null,w:0,h:0,gen:0}:null;function F(){if(!D)return null;let t=Math.max(1,s.width),r=Math.max(1,s.height);return D.fbo||(D.tex=e.createTexture(),D.fbo=e.createFramebuffer()),(D.w!==t||D.h!==r)&&(e.bindTexture(e.TEXTURE_2D,D.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t,r,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,D.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,D.tex,0),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),D.w=t,D.h=r,D.gen++),D.fbo}function ae(t,r){Vc[0]=r&&!D?e.COLOR:e.COLOR_ATTACHMENT0,e.invalidateFramebuffer(t,Vc)}if(p+1>so)return console.warn(`Veins renderer: ${p} vessel rows do not fit the second lumen target.`),null;let Be=()=>A==="lobule"?"lobule":m.by||"stage, outside a draw call",Fe=t=>{m.note(he.fboAlloc,t),m.note(he.fboAllocBy+Be())},mt=A==="stage"||A==="lobule",Rn=!mt,e=null;try{e=O?O.gl:s.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!mt,preserveDrawingBuffer:Rn,failIfMajorPerformanceCaveat:!R})}catch{e=null}if(e&&!O&&Rf(e),!e)return null;let ha=Bf("figure-canvas-shown"),t0=()=>{},ue=!Rn&&!O?Ic(e,s,{onEnd:Df,copied:()=>_f("screen onto the canvas"),ask:()=>{if(!Ja())try{ha(t0)}catch(t){dr("veins-gl:show",t)}}}):null,l=If(e),co=[0,0],H=null,ho=!1,Vr=0,Wr=0,mr=null,uo=1,Fs=!1,ie=[],Fn=0,_s=30,Ss=(t,r)=>{if(t.fails=(t.fails||0)+1,t.fails===1&&console.warn("Veins renderer: what is drawn over the figure failed.",r),t.fails>=_s){let n=ie.indexOf(t);n>=0&&(ie.splice(n,1),Fn++),console.warn(`Veins renderer: what is drawn over the figure failed. It failed ${_s} pictures in a row and is taken out.`)}},Ae=null,Ke=0,_n=A==="lobule"&&O?Jf(e):null,Sn=null,Ee={on:!1,pic:-1,gen:-1,v1:-1,v2:-1,v3:-1},Ge={tex:null,w:0,h:0,v1:0,v2:0,v3:0,dyn:!1,ducts:null,plug:null,view:null,lum:null,cell:null,edge:null,nuc:null,width:0,alpha:0},Oe=null,I=()=>H?H[0]:s.width,L=()=>H?H[1]:s.height,Mn=e.getExtension("KHR_parallel_shader_compile"),k,Ms=()=>{try{k.tubeStrip=de(e,lc(ns,la),$c(!0,1,1)),k.tubePatch=de(e,oc(ns),$c(!1,2,1)),k.meshLay=de(e,pr,ic)}catch(n){console.warn("Veins renderer: the tube vessel shaders could not be made.",n),delete k.tubeStrip,delete k.tubePatch,delete k.meshLay}let t={F_DIFFUSE:As,F_EDGE:Ts,F_SHADOW:Es,F_SPEC:Jc,F_VEIL:yn,F_WHOLE:Qc,F_SEL:la,F_DOTTED:pt,F_NOCASE:fa,LIFT_EASE_MAX:ts,LIFT_EASE_SHARE:es,LUMEN2:Tn,ROW2_BITS:fo,VEIL_K:ca,EDGE:aa,ENT_W:2048,N_SAMPLES:G,MAX_TIERS:lo,S_OFF:os,ALONG_GLSL:ro},r=(n,a)=>Gr(e,n,a);try{Object.assign(k,Ec(e,de,t,r))}catch(n){console.warn("Veins renderer: the Tube stage 2 shaders could not be made; the Tube keeps stage 1.",n);for(let a of is)delete k[a]}try{Object.assign(k,yc(e,de,t,{COMP_FS:io,COMP_VS:Yc,COMP_CELL_VS:Kc},r))}catch(n){console.warn("Veins renderer: the Tube stage 3 shaders could not be made; the Tube keeps stage 2.",n);for(let a of ss)delete k[a]}};try{let t=Gr(e,e.FRAGMENT_SHADER,io()),r=Gr(e,e.VERTEX_SHADER,Yc),n=Gr(e,e.VERTEX_SHADER,Kc),a=Gr(e,e.FRAGMENT_SHADER,io(!0));k={comp:de(e,r,t),compCell:de(e,n,t),heads:A==="stage"?de(e,Oc({along:ro,rows:cc,orange:Zc,nSamples:G}),io(!1,!0)):null,plain:de(e,r,a),plainCell:de(e,n,a),cath:de(e,fu,cu),line:de(e,uu,du)},A==="stage"&&Ms()}catch(t){return console.warn("Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.",t),null}if(gn)try{Qf(e)}catch(t){dr("veins-gl:1918",t)}let Hr=()=>{for(let t of new Set(Object.values(k).filter(Boolean).flatMap(r=>r.sh)))e.deleteShader(t)},se=Mn?["plain",...k.heads?["heads"]:[],...k.tubePatch?["tube"]:[],...k.tubeLean?["tube2"]:[],...k.tubeLumen?["tube3"]:[]]:[],Dn=t=>t==="tube"?[k.tubeStrip,k.tubePatch,k.meshLay]:t==="tube2"?is.map(r=>k[r]):t==="tube3"?ss.map(r=>k[r]):t==="heads"?[k.heads]:t==="plain"?[k.plain,k.plainCell]:[],po,mo;try{po=pe(e,k.comp),mo=pe(e,k.compCell)}catch(t){return console.warn("Veins renderer: composite shader failed.",t),Hr(),null}let Bn=null,wr=null,Ds=()=>{try{Bn=pe(e,k.plain),wr=pe(e,k.plainCell)}catch(t){console.warn("Veins renderer: the plain composite failed; every frame keeps the full one.",t),e.deleteProgram(k.plain.p),e.deleteProgram(k.plainCell.p),Bn=wr=null}};se.includes("plain")||Ds();let br=null,Bs=()=>{try{br=pe(e,k.heads)}catch(t){console.warn("Veins renderer: the arrowheads' quad shader failed; the composite keeps drawing them.",t),e.deleteProgram(k.heads.p),br=null}};k.heads&&!se.includes("heads")&&Bs();let On=null,Gt=null,vr=null,xr=A==="stage"?"compiling":"not made yet",ua=()=>{try{On=pe(e,k.tubeStrip),Gt=pe(e,k.tubePatch),vr=pe(e,k.meshLay),xr=""}catch(t){console.warn("Veins renderer: the tube vessel shaders failed; no vessels can be drawn on the GPU.",t);for(let r of Dn("tube"))e.deleteProgram(r.p);On=Gt=vr=null,xr="shader failed"}};k.tubePatch&&!se.includes("tube")?ua():!k.tubePatch&&A==="stage"&&(xr="shader failed");let zr=null,da=null,wo=()=>{({P:zr,failed:da}=Tc(e,pe,Dn("tube2")))};k.tubeLean&&!se.includes("tube2")?wo():!k.tubeLean&&A==="stage"&&(da=["stage 2 shaders"]);let we=null,pa=null,Os={done:()=>!0,run:()=>{we&&sf("tube3")}},bo=()=>{({P:we,failed:pa}=Rc(e,pe,Dn("tube3")))};if(k.tubeLumen&&!se.includes("tube3")?bo():!k.tubeLumen&&A==="stage"&&(pa=["stage 3 shaders"]),A!=="lobule"||k.tubeStrip||xr==="shader failed"||(Ms(),k.tubePatch?ua():xr="shader failed",k.tubeLean?wo():da=["stage 2 shaders"],k.tubeLumen?bo():pa=["stage 3 shaders"]),xr==="shader failed")return console.warn("Veins renderer: the Tube vessel shaders are not available, keeping the SVG tubes."),Hr(),null;let Us=[],oe=[null,null],Ls=!1,Un=()=>{let t=!!oe[0]||!!V?.has(0);t!==Ls&&(Ls=t,B?.(t))},V=rs(e),vo=!!V?.painter&&mt,nt={},Ve=[];we&&Ve.push(Os);let r0={lay:ps,up:jc},xo=t=>{if(!(!gn||nt[t]||N||(t==="lay"?Ue:Ze)!==null)){try{nt[t]=de(e,pr,r0[t])}catch(r){dr("veins-gl:1970",r)}!Mn&&nt[t]&&nf(t,!1)}},be=null,Ue=null,Vt=!1;if(vo&&gn)try{Zf(e)}catch(t){dr("veins-gl:1975",t)}let $r=null;try{$r=pe(e,k.cath)}catch(t){console.warn("Veins renderer: catheter shader failed.",t)}let go=e.createBuffer(),Ao=e.createVertexArray();e.bindVertexArray(Ao),e.bindBuffer(e.ARRAY_BUFFER,go);for(let t=0;t<3;t++)e.enableVertexAttribArray(t),e.vertexAttribPointer(t,2,e.FLOAT,!1,24,t*8);e.bindVertexArray(null);let J=null,ks=!1,Eo=0,ma=null,Yr=null,Kr=null;try{Kr=pe(e,k.line)}catch(t){console.warn("Veins renderer: outline shader failed.",t)}se.length||Hr();let To=e.createBuffer(),yo=e.createVertexArray();e.bindVertexArray(yo),e.bindBuffer(e.ARRAY_BUFFER,To);for(let t=0;t<3;t++)e.enableVertexAttribArray(t),e.vertexAttribPointer(t,2,e.FLOAT,!1,24,t*8);e.bindVertexArray(null);let gr=[0,0,0],Ln=[new Float64Array(64),new Float64Array(64),new Float64Array(64)],Ro=[new Float64Array(64),new Float64Array(64),new Float64Array(64)],Wt=[0,0,0],Is=[0,0,0],Ht=(t,r)=>{let n=Ln[t];if(Wt[t]>=n.length){let a=new Float64Array(n.length*2);a.set(n),Ln[t]=n=a}n[Wt[t]++]=r},Fo=!1,_e=0,_o=new Set,at=0,Le=0,So=0,zt=16,qe=new Float32Array(zt*4),Ns=new Float64Array(zt).fill(-1),wa=new Uint8Array(zt),Ar=eo(zt),Mo=eo(zt),Er=new Float64Array(6).fill(NaN),ba=!1,Ps=NaN;function n0(t,r,n,a,i,o,f=null){let h=i[0]*o,c=i[1]*o,u=i[2]*o,w=i[3]*o;for(let d=0;d<n;d++){if(f&&!f[d])continue;let v=i[0]*r[d*a]+i[2]*r[d*a+1]+i[4],b=i[1]*r[d*a]+i[3]*r[d*a+1]+i[5];t.add(Math.min(v,v+h,v+u,v+h+u)-1,Math.min(b,b+c,b+w,b+c+w)-1,Math.max(v,v+h,v+u,v+h+u)+1,Math.max(b,b+c,b+w,b+c+w)+1)}}function Do(t,r,n,a,i,o){let f=1/0,h=1/0,c=-1/0,u=-1/0;for(let w=0;w<4;w++){let d=w&1?a:r,v=w&2?i:n,b=o[0]*d+o[2]*v+o[4],g=o[1]*d+o[3]*v+o[5];b<f&&(f=b),b>c&&(c=b),g<h&&(h=g),g>u&&(u=g)}t.add(f-1,h-1,c+1,u+1)}function a0(t,r,n,a,i,o,f,h,c){let u=t&&r[0]===Er[0]&&r[1]===Er[1]&&r[2]===Er[2]&&r[3]===Er[3]&&r[4]===Er[4]&&r[5]===Er[5];for(let d=0;d<6;d++)Er[d]=r[d];if(ba=!a,n||a||!u||!I()||!L()||i&&!Xo||h&&!(He[2]>He[0]))return;let w=Mo;if(w.begin(_e,I(),L()),We){if(!kr){w.unknown(_e);return}if(Cs(kr,We,r,Yt,I(),L()),!w.addFrom(va,0)){w.unknown(_e);return}}if(i){if(!Me){w.unknown(_e);return}n0(w,Me,te,6,r,16,Xo)}o&&Do(w,Kt[0],Kt[1],Kt[2],Kt[3],r),f&&Do(w,qt[0],qt[1],qt[2],qt[3],r),h&&Do(w,He[0],He[1],He[2],He[3],r),c&&w.add(c[0],c[1],c[2],c[3])}let va=eo(1),$={cells:null,ver:-1,n:-1,size:-1,W:-1,H:-1,m:new Float64Array(6).fill(NaN),rect:new Float64Array(4)};function Cs(t,r,n,a,i,o){if($.cells===t&&$.ver===Io&&$.n===r&&$.size===a&&$.W===i&&$.H===o&&n[0]===$.m[0]&&n[1]===$.m[1]&&n[2]===$.m[2]&&n[3]===$.m[3]&&n[4]===$.m[4]&&n[5]===$.m[5]){m.on&&m.note(he.boxesKept);return}m.on&&m.note(he.boxesMade);let f=1/0,h=1/0,c=-1/0,u=-1/0,w=n[0]*a,d=n[1]*a,v=n[2]*a,b=n[3]*a;va.begin(0,i,o);for(let g=0;g<r;g++){let y=n[0]*t[g*6]+n[2]*t[g*6+1]+n[4],S=n[1]*t[g*6]+n[3]*t[g*6+1]+n[5],j=Math.min(y,y+w,y+v,y+w+v),ce=Math.max(y,y+w,y+v,y+w+v),De=Math.min(S,S+d,S+b,S+d+b),dt=Math.max(S,S+d,S+b,S+d+b);j<f&&(f=j),ce>c&&(c=ce),De<h&&(h=De),dt>u&&(u=dt),va.add(j-1,De-1,ce+1,dt+1)}$.cells=t,$.ver=Io,$.n=r,$.size=a,$.W=i,$.H=o;for(let g=0;g<6;g++)$.m[g]=n[g];$.rect[0]=f,$.rect[1]=h,$.rect[2]=c,$.rect[3]=u}function o0(t,r,n,a,i,o=null){let f=t%zt,h=f*4;if(Ns[f]=t,!r||!a||!I()||!L()){wa[f]=0,Ar.unknown(t);return}let c=I(),u=L();Cs(r,n,a,i,c,u);let w=$.rect[0],d=$.rect[1],v=$.rect[2],b=$.rect[3];if(Ar.begin(t,c,u),!Ar.addFrom(va,0)){wa[f]=0,Ar.unknown(t);return}if(o){let g=1/0,y=1/0,S=-1/0,j=-1/0;for(let ce=0;ce<4;ce++){let De=ce&1?o[2]:o[0],dt=ce&2?o[3]:o[1],Nt=a[0]*De+a[2]*dt+a[4],Pt=a[1]*De+a[3]*dt+a[5];Nt<g&&(g=Nt),Nt>S&&(S=Nt),Pt<y&&(y=Pt),Pt>j&&(j=Pt)}Ar.add(g-1,y-1,S+1,j+1),g<w&&(w=g),S>v&&(v=S),y<d&&(d=y),j>b&&(b=j)}wa[f]=1,qe[h]=Math.max(0,w-1),qe[h+1]=Math.max(0,d-1),qe[h+2]=Math.min(c,v+1),qe[h+3]=Math.min(u,b+1)}function i0(t,r,n){if(!(r>t)||r-t>zt)return!1;let a=1/0,i=1/0,o=-1/0,f=-1/0;for(let h=t+1;h<=r;h++){let c=h%zt;if(Ns[c]!==h||!wa[c])return!1;let u=c*4;qe[u+2]>qe[u]&&qe[u+3]>qe[u+1]&&(a=Math.min(a,qe[u]),i=Math.min(i,qe[u+1]),o=Math.max(o,qe[u+2]),f=Math.max(f,qe[u+3]))}return n[0]=a,n[1]=i,n[2]=o,n[3]=f,!0}let s0=t=>t(),Bo=(t=!1)=>{if(t){at++;return}_e++,Mo.unknown(_e),ba=!1,_o.forEach(s0)},Ie=null,js=!1,Xs=-1,Gs=-1,Tr=0,kn=-1,Vs=-1,In=-1,Ws=-1,Nn=-1,Hs=-1,yr=new Float64Array(6).fill(NaN),qr=[],Oo=()=>{let t=ne(e);return e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),{tex:t,fbo:e.createFramebuffer(),w:0,h:0}},Rr=Oo(),Jr=Oo(),Qr=Oo(),zs=()=>U0(ee),$s=()=>Cn(ee,!1),Ys=null,l0=()=>V.render(Ys,I(),L()),$t=[0,0,0,0,0,0],Fr=null,Uo=!1,Lo=!1,Ks=0,qs=()=>{if(Fr=null,performance.now()-Ks<400){let t=setTimeout(qs,400);Fr=()=>clearTimeout(t);return}Lo=!0,!N&&V?.has(0)&&V.prepMove($t,I(),L())};function f0(t,r){if(!r){Fr&&(Fr(),Fr=null),Uo=!1;return}if(!Uo||$t[0]!==t[0]||$t[1]!==t[1]||$t[2]!==t[2]||$t[3]!==t[3]||$t[4]!==t[4]||$t[5]!==t[5]){for(let n=0;n<6;n++)$t[n]=t[n];Uo=!0,Lo=!1,Ks=performance.now()}!Fr&&!Lo&&(Fr=Uf(qs,700))}let c0=()=>ko(Rr,ee,!1),h0=()=>ko(Jr,ee,!0),u0=()=>ko(Qr,ee,!0,!0),Pn=1,Se={tex:null,fbo:null,w:0,h:0},d0=t=>t.soft&&!t.warm,p0=t=>!t.soft&&!t.under,m0=t=>t.warm||t.under,w0=()=>!!Ie?.draws.some(d0),b0=()=>!!Ie?.draws.some(p0),v0=()=>!!Ie?.draws.some(m0);function ko(t,r,n,a=!1){if(Pn<1&&t!==Rr){x0(t,r,n,a);return}(t.w!==I()||t.h!==L())&&(t.w=I(),t.h=L(),e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t.w,t.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t.tex,0)),e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.viewport(0,0,t.w,t.h),e.clearBufferfv(e.COLOR,0,[0,0,0,0]),Cn(r,n,a),a&&Cn(r,!1,!1,!0),e.bindFramebuffer(e.FRAMEBUFFER,F())}function x0(t,r,n,a){let i=Math.max(1,Math.round(I()*Pn)),o=Math.max(1,Math.round(L()*Pn));Se.tex||(Se.tex=ne(e),Se.fbo=e.createFramebuffer()),(Se.w!==i||Se.h!==o)&&(Se.w=i,Se.h=o,e.bindTexture(e.TEXTURE_2D,Se.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,i,o,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,Se.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Se.tex,0)),(t.w!==I()||t.h!==L())&&(t.w=I(),t.h=L(),e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t.w,t.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t.tex,0)),e.bindFramebuffer(e.FRAMEBUFFER,Se.fbo),e.viewport(0,0,i,o),e.clearBufferfv(e.COLOR,0,[0,0,0,0]),Cn(r,n,a),e.bindFramebuffer(e.READ_FRAMEBUFFER,Se.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,t.fbo),e.disable(e.SCISSOR_TEST),e.blitFramebuffer(0,0,i,o,0,0,t.w,t.h,e.COLOR_BUFFER_BIT,e.LINEAR),a&&(e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.viewport(0,0,t.w,t.h),Cn(r,!1,!1,!0)),e.bindFramebuffer(e.READ_FRAMEBUFFER,F()),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,F()),e.bindFramebuffer(e.FRAMEBUFFER,F())}function Zr(t){t.w&&(t.w=t.h=0,e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null))}function Cn(t,r,n=!1,a=!1){let i=Kr.u;e.useProgram(Kr.p),l.m3(i.world,Xr(tt.world,t[0],t[1],t[2],t[3],t[4],t[5])),l.f2(i.size,I(),L()),l.f1(i.soft,r?1:0),l.f1(i.pack,n?1:0),e.enable(e.BLEND),n?(e.blendEquation(e.MAX),e.blendFunc(e.ONE,e.ONE)):e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.bindVertexArray(yo);for(let o of Ie.draws)o.alpha<=0||!!o.soft!=!!r||!!o.warm!==n||!!o.under!==a||(l.f4(i.col,o.col[0],o.col[1],o.col[2],o.alpha),l.f2(i.endFade,o.endFade?o.endFade[0]:0,o.endFade?o.endFade[1]:0),e.drawArrays(o.tri?e.TRIANGLES:e.TRIANGLE_STRIP,o.first,o.count));e.bindVertexArray(null),n&&e.blendEquation(e.FUNC_ADD),e.disable(e.BLEND)}let ot=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,ot),e.bufferData(e.ARRAY_BUFFER,Zh,e.STATIC_DRAW);let g0=t=>{let r=e.createVertexArray();return e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,t),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,24,8),e.vertexAttribDivisor(2,1),e.bindVertexArray(null),r},en=e.createVertexArray(),jn=e.createBuffer(),Js=(t,r)=>{e.bindVertexArray(t),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,r),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null)};Js(en,jn);let We=0,Yt=16,Io=0;function No(t){let r=t.bloodQ;Yt=r?16/2:16;let n=r?t.bloodQ:t.blood||t.cells;e.bindBuffer(e.ARRAY_BUFFER,jn),e.bufferData(e.ARRAY_BUFFER,n,e.STATIC_DRAW),We=r?t.nBloodQ:t.blood?t.nBlood:t.nCells,kr=n,Io++}let Po=e.createVertexArray(),Co=e.createBuffer();e.bindVertexArray(Po),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Co),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,24,8),e.vertexAttribDivisor(2,1),e.bindVertexArray(null);let jo=0,Xo=null,Go=e.createBuffer(),Vo=e.createVertexArray();e.bindVertexArray(Vo),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Go),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);let Wo=e.createBuffer(),Ho=e.createVertexArray();e.bindVertexArray(Ho),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Wo),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);let zo=e.createBuffer(),$o=e.createVertexArray();e.bindVertexArray($o),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,zo),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);let Qs=0,Kt=new Float64Array(4),qt=new Float64Array(4),He=new Float64Array(4).fill(NaN),Xn=new Map,tn={a:new Float32Array(2048),n:0,reset(){this.n=0},push(t,r){if(this.n+2>this.a.length){let n=new Float32Array(this.a.length*2);n.set(this.a),this.a=n}this.a[this.n++]=t,this.a[this.n++]=r},send(t){if(e.bindBuffer(e.ARRAY_BUFFER,t),(Xn.get(t)||0)<this.n){let r=Math.max(this.n,2*(Xn.get(t)||0),512);e.bufferData(e.ARRAY_BUFFER,r*4,e.DYNAMIC_DRAW),Xn.set(t,r)}return this.n&&e.bufferSubData(e.ARRAY_BUFFER,0,this.a,0,this.n),this.n/2}},_r={sub:0,grow:0,bytes:0};function Zs(t,r,n=r.length){e.bindBuffer(e.ARRAY_BUFFER,t);let a=n*4,i=(Xn.get(t)||0)*4;if(a>i){let o=Math.ceil(Math.max(a+(a>>1),1024)/4)*4;e.bufferData(e.ARRAY_BUFFER,o,e.DYNAMIC_DRAW),Xn.set(t,o/4),_r.grow++,_r.bytes+=o-i}else _r.sub++;a&&e.bufferSubData(e.ARRAY_BUFFER,0,r,0,n)}let el=new WeakMap;function A0(t,r,n,a,i,o,f){e.bindTexture(e.TEXTURE_2D,t);let h=el.get(t)||0;if(o>h){let c=Math.max(o+(o>>2),16);e.texImage2D(e.TEXTURE_2D,0,r,i,c,0,n,a,null),el.set(t,c),_r.grow++}else _r.sub++;e.texSubImage2D(e.TEXTURE_2D,0,0,0,i,o,n,a,f)}function E0(t,r){let n=r[0]*r[3]-r[1]*r[2]||1e-9,a=r[3]/n,i=-r[1]/n,o=-r[2]/n,f=r[0]/n,h=1/0,c=1/0,u=-1/0,w=-1/0;for(let d=0;d<4;d++){let v=d&1?t[2]:t[0],b=d&2?t[3]:t[1],g=v-r[4],y=b-r[5],S=a*g+o*y,j=i*g+f*y;h=Math.min(h,S),c=Math.min(c,j),u=Math.max(u,S),w=Math.max(w,j)}tn.reset();for(let d=Math.floor(c/16)*16;d<w;d+=16)for(let v=Math.floor(h/16)*16;v<u;v+=16)tn.push(v,d);Qs=tn.send(zo),Kt[0]=Math.floor(h/16)*16,Kt[1]=Math.floor(c/16)*16,Kt[2]=Math.ceil(u/16)*16+16,Kt[3]=Math.ceil(w/16)*16+16}let xa=ne(e),Yo=null,tl=0,rn=null,wt=0,ga=0,Ko=null,qo=0,Ne=e.createVertexArray();e.bindVertexArray(Ne),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let Jt=ne(e),T0=null,Gn=ne(e),Aa=ne(e),nn=ne(e),Vn=ne(e,e.LINEAR);e.bindTexture(e.TEXTURE_2D,Gn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,G,p,0,e.RGBA,e.FLOAT,null),e.bindTexture(e.TEXTURE_2D,Aa),e.texImage2D(e.TEXTURE_2D,0,e.R32F,1,p,0,e.RED,e.FLOAT,new Float32Array(p)),e.bindTexture(e.TEXTURE_2D,nn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,ao,p,0,e.RGBA,e.FLOAT,null),e.bindTexture(e.TEXTURE_2D,Vn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(4));let an=ne(e);e.bindTexture(e.TEXTURE_2D,an),e.texImage2D(e.TEXTURE_2D,0,e.R32F,G,p,0,e.RED,e.FLOAT,new Float32Array(G*p));let Wn=new Float32Array(G*2*p),Ea=new Uint8Array(p),Hn=new Float32Array(p*4),Ft=1/0,Sr=-1,on=null,rl=0,zn=!1;function y0(){if(!(Sr<Ft&&!zn)){if(on?e.bindTexture(e.TEXTURE_2D,on):(on=ne(e),e.texImage2D(e.TEXTURE_2D,0,e.RG32F,G+2,p,0,e.RG,e.FLOAT,null),Ft=0,Sr=p-1,zn=!0),Sr>=Ft){let t=Sr-Ft+1;m.on&&m.note("uploaded: axes",t*G*8/1024),e.texSubImage2D(e.TEXTURE_2D,0,0,Ft,G,t,e.RG,e.FLOAT,Wn,Ft*G*2)}zn&&e.texSubImage2D(e.TEXTURE_2D,0,G,0,2,p,e.RG,e.FLOAT,Hn),Ft=1/0,Sr=-1,zn=!1}}let sn=Lc(p),Jo=e.createBuffer(),Qo=e.createVertexArray();e.bindVertexArray(Qo),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Jo),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);function nl(t,r,n,a,i,o){y0();let f=br.u;e.useProgram(br.p),Ha(f,r,n,a,i),fe(f,12,on,"axis"),l.m3(f.world,Xr(tt.world,t[0],t[1],t[2],t[3],t[4],t[5])),l.f2(f.size,I(),L()),l.i1(f.stillOn,o?1:0),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.bindVertexArray(Qo),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,sn.count()),e.bindVertexArray(null),e.disable(e.BLEND),e.activeTexture(e.TEXTURE12),e.bindTexture(e.TEXTURE_2D,an),m.on&&m.gauge("arrowheads",`${sn.count()} quads`)}let $n=new Float32Array(G*4*p),al=new Float32Array(p),_t=1/0,Yn=-1;function Ta(){if(Yn<_t)return;let t=Yn-_t+1;m.on&&m.note("uploaded: setRadii",t*(G*16+4)/1024),e.bindTexture(e.TEXTURE_2D,Gn),e.texSubImage2D(e.TEXTURE_2D,0,0,_t,G,t,e.RGBA,e.FLOAT,$n,_t*G*4),e.bindTexture(e.TEXTURE_2D,Aa),e.texSubImage2D(e.TEXTURE_2D,0,0,_t,1,t,e.RED,e.FLOAT,al,_t),_t=1/0,Yn=-1}let Zo=new Float32Array(G),ol=new Uint32Array(Zo.buffer),il=new Uint32Array(G*p),ln=ne(e),Kn=ne(e,e.LINEAR),qn=null;e.bindTexture(e.TEXTURE_2D,ln),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,Xt+1,p,0,e.RGBA,e.FLOAT,null),e.bindTexture(e.TEXTURE_2D,Kn),e.texImage2D(e.TEXTURE_2D,0,e.R16F,Ct,p,0,e.RED,e.FLOAT,new Float32Array(Ct*p));let Pe=new Uint8Array(p),ei=new Float32Array(p*4).fill(-1),bt=!0,Mr=null,W=new Float64Array(384),it=0,Jn=null,C=0,ti=0,re=t=>{if(t&&typeof t=="object")for(let r=0;r<t.length&&C<W.length;r++)W[C++]=+t[r]||0;else C<W.length&&(W[C++]=+t||0)},ya=new Uint8Array(p),sl=NaN,ri=[0,0],ni=(t,r,n)=>{for(let a=0;a<p;a++)if(!Pe[a]){for(let i=a*n,o=i+n;i<o;i++)if(t[i]!==r[i]){Pe[a]=1;break}}},Dr=e.createFramebuffer(),Ce=ne(e),fn=ne(e),St=ne(e),R0=()=>[[e.RGBA8,e.RGBA,e.UNSIGNED_BYTE],[e.RGBA16UI,e.RGBA_INTEGER,e.UNSIGNED_SHORT],[e.RG16UI,e.RG_INTEGER,e.UNSIGNED_SHORT],[e.R8,e.RED,e.UNSIGNED_BYTE]],ai=ne(e);e.bindTexture(e.TEXTURE_2D,ai),e.texImage2D(e.TEXTURE_2D,0,e.R8,1,1,0,e.RED,e.UNSIGNED_BYTE,new Uint8Array(1));let M=0,U=0,ee=null,Br=!1,ll=!1,Ra=new Float64Array(6),fl="";function F0(t){let r=!ee;for(let n=0;n<6;n++)Ra[n]!==t[n]&&(Ra[n]=t[n],r=!0);ee=Ra,r&&(fl=Ra.join(","))}let Qn=0,Zn=0,Or=null,Fa=[e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1,e.COLOR_ATTACHMENT2,e.COLOR_ATTACHMENT3],oi=[e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1,e.COLOR_ATTACHMENT2,e.NONE],cl=[e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1,e.NONE,e.NONE],hl=[e.COLOR_ATTACHMENT0],K=!1,ii=!1,Qt=!1,ea=!1,cn=[0,0],hn=[null,null,null],si=[0,0],ta=null,_a=!1;function _0(t,r){M===t&&U===r&&Qn===I()&&Zn===L()||(Qn=I(),Zn=L(),K=!1,bl(),!(M===t&&U===r)&&(M=t,U=r,m.on&&Fe(M*U*(Zt?12:8)/1024),e.bindTexture(e.TEXTURE_2D,Ce),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,M,U,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindTexture(e.TEXTURE_2D,fn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA16UI,M,U,0,e.RGBA_INTEGER,e.UNSIGNED_SHORT,null),e.bindTexture(e.TEXTURE_2D,St),e.texImage2D(e.TEXTURE_2D,0,e.RG16UI,Zt?M:1,Zt?U:1,0,e.RG_INTEGER,e.UNSIGNED_SHORT,null),e.bindFramebuffer(e.FRAMEBUFFER,Dr),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Ce,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT1,e.TEXTURE_2D,fn,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT2,e.TEXTURE_2D,Zt?St:null,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT3,e.TEXTURE_2D,null,0),_a&&(e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,null),_a=!1),e.drawBuffers(Zt?oi:cl),e.bindFramebuffer(e.FRAMEBUFFER,F())))}let Zt=!1;function S0(t){t!==Zt&&(Zt=t,M&&(m.on&&Fe(M*U*(t?4:-4)/1024),e.bindTexture(e.TEXTURE_2D,St),e.texImage2D(e.TEXTURE_2D,0,e.RG16UI,t?M:1,t?U:1,0,e.RG_INTEGER,e.UNSIGNED_SHORT,null),e.bindFramebuffer(e.FRAMEBUFFER,Dr),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT2,e.TEXTURE_2D,t?St:null,0),e.drawBuffers(t?oi:cl),K=!1))}let Sa=new Float32Array(4),ul=new Uint32Array(4);function dl(){e.clearBufferfv(e.COLOR,0,Sa),e.clearBufferuiv(e.COLOR,1,ul),Zt&&e.clearBufferuiv(e.COLOR,2,ul)}let M0=[0,0,0,0],D0=[0,0,0,0],B0=[0,0,0,0];function pl(t,r){let n=J.base,a=n?n.length/6:0,i=J.verts,o=1/0,f=1/0,h=-1/0,c=-1/0;for(let w of J.draws)for(let d=w.first,v=w.first+w.count;d<v;d++){let b=d<a?n:i,g=(d<a?d:d-a)*6;if(g+1>=b.length)continue;let y=t[0]*b[g]+t[2]*b[g+1]+t[4],S=t[1]*b[g]+t[3]*b[g+1]+t[5];y<o&&(o=y),y>h&&(h=y),S<f&&(f=S),S>c&&(c=S)}if(!(h>=o&&c>=f))return null;let u=r;return u[0]=Math.max(0,Math.floor(o)-2),u[1]=Math.max(0,Math.floor(f)-2),u[2]=Math.min(I(),Math.ceil(h)+2),u[3]=Math.min(L(),Math.ceil(c)+2),u[2]>u[0]&&u[3]>u[1]?u:null}let ml=0,li=0,O0=[0,1,1];function U0(t){let r=$r.u;e.useProgram($r.p),l.m3(r.world,Xr(tt.world,t[0],t[1],t[2],t[3],t[4],t[5])),l.f2(r.size,I(),L()),l.f2a(r.light,J.light||$f);let n=null,a=null,i=1,o=1;Qt&&(hn[0]=Ce,n=hn,a=cn,i=M,o=U),l.i2(r.lA,Y[0],Y[1]),l.i2(r.lWrap,Te[0],Te[1]),l.i2(r.lSize,M,U),l.i1(r.lH,L()),l.f2(r.lowS,n?a[0]/M:0,n?a[1]/U:0),l.i2(r.lowSz,n?a[0]:0,n?a[1]:0),l.f2(r.lowT,n?i:1,n?o:1),fe(r,0,n?n[0]:Ce,"base"),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.bindVertexArray(Ao);let f=ja&&ja.clock||0,h=f-ml;ml=f,h>0&&h<.5||(h=0);for(let c of J.draws){l.i1(r.mode,c.mode),l.i1(r.under,c.under?1:0);let u=c.taper||O0;l.f3a(r.taper,u);let w=c.echo;if(l.f1(r.echoK,w?w.k:0),w&&(l.f4a(r.fanA,w.a),l.f2a(r.fanB,w.b)),c.mode===9){let d=c.dop;if(d){let v=d.flowFn?d.flowFn():0;li=(li+v*h)%700,l.f4a(r.dopP0,d.p[0]),l.f4a(r.dopP1,d.p[1]),l.f4a(r.dopP2,d.p[2]),l.f4a(r.dopP3,d.p[3]),l.f4a(r.dopP4,d.p[4]),l.f4a(r.dopQ,d.q),l.f4a(r.dopG,d.cast),l.f4(r.dopF,v,li,0,0),l.f3a(r.dopTow,d.tow),l.f3a(r.dopAway,d.away)}else l.f4(r.dopQ,0,0,0,0)}l.f3a(r.col,c.col),l.f1(r.alpha,c.alpha),l.f2a(r.fade,c.fade||[0,0]),l.f1(r.len,c.len??1e9),e.drawArrays(c.tri?e.TRIANGLES:e.TRIANGLE_STRIP,c.first,c.count)}e.bindVertexArray(null),e.disable(e.BLEND)}let te=0,N=!1,Ma=null,fi=0,L0=0,wl=new Float64Array(6),k0=new Float64Array(6),Da=new Float64Array(6),ci=(t,r)=>Number.isInteger(t[4])&&Number.isInteger(t[5])?t:(r[0]=t[0],r[1]=t[1],r[2]=t[2],r[3]=t[3],r[4]=Math.round(t[4]),r[5]=Math.round(t[5]),r),Ba=(t,r)=>t[0]===r[0]&&t[1]===r[1]&&t[2]===r[2]&&t[3]===r[3],Oa=[0,0,0,0],vt=new Float64Array(64),hi=new Float64Array(64),st=0,ui=-1,lt=t=>{let r=st;for(let n=0;n<t.length;n++)vt[r++]=t[n];vt[r++]=-7.25,st=r},I0=t=>{if(vt.length<512&&(vt=new Float64Array(512),hi=new Float64Array(512),ui=-1),st=0,vt[st++]=t.reach,lt(t.shOff),lt(t.casing),lt(t.shadow),lt(t.sheen),lt(t.shade),lt(t.rim||Oa),lt(t.paper||Oa),lt(t.ring),lt(t.light),vt[st++]=t.netAlpha,vt[st++]=t.fx?1:0,lt(t.tierAlpha),lt(t.tierGroup),vt[st++]=t.organs,st!==ui)return!1;for(let r=0;r<st;r++)if(vt[r]!==hi[r])return!1;return!0},N0=()=>{for(let t=0;t<st;t++)hi[t]=vt[t];ui=st},ra=!0,P0=t=>!!wr&&!(Br&&t.dye!==!1)&&!t.origin&&!t.bleed?.length,Te=[0,0],Y=[0,0],Mt=[!1,!1],bl=()=>{Te[0]=0,Te[1]=0},je=[0,0],Je=new Float64Array(6),ze=new Float64Array(6);function vl(t,r,n,a,i){let o=((t+n)%a+a)%a,f=o-t,h=Math.min(r,a-o);return i[0]=o,i[1]=h,i[2]=f,r>h?(i[3]=0,i[4]=r-h,i[5]=f-a,2):1}let Ur=null,Lr=null,er=0,di=!0,un=Fc(),ft=null,pi=null,Qe={all:!0,n:0,r:new Int32Array(16)},ye={all:!0,n:0,r:new Int32Array(16)},xl=new Float64Array(4),C0=(t,r,n,a)=>{if(ye.n<4){let i=ye.n++*4;ye.r[i]=t,ye.r[i+1]=r,ye.r[i+2]=n,ye.r[i+3]=a}else ye.all=!0},ve={sx:1,sy:1,w:0,h:0,m:null,ms:new Float64Array(6)},tr=[0,0],xt=[0,0],gl=!1;try{gl=typeof matchMedia=="function"&&matchMedia("(pointer: coarse)").matches&&(globalThis.devicePixelRatio||1)>=3}catch(t){dr("veins-gl:lumPhone",t)}let mi=Sc(A,gl),dn=_c(),Al=[0,0],El=()=>{if(er===5){Ot.lumen(Ur,Lr,di);return}un.stale(),er>=3&&dl(),Ot.drew=0,Ot(Ur,Lr)};function rr(t,r,n,a,i=!1){if(!(n>0&&a>0)){je[0]=0,je[1]=0;return}let o=M,f=U,h=vl(t,n,Te[0]-Y[0],o,Je),c=vl(r,a,Te[1]-Y[1],f,ze),u=ft,w=pi;if(!i&&!w&&h===1&&c===1&&!Je[0]&&!ze[0]&&Je[1]===o&&ze[1]===f){je[0]=u?Je[2]*u.sx:Je[2],je[1]=u?ze[2]*u.sy:ze[2],El(),je[0]=0,je[1]=0;return}i||e.enable(e.SCISSOR_TEST);for(let d=0;d<h;d++)for(let v=0;v<c;v++){if(u||w){let b=Je[d*3],g=b+Je[d*3+1],y=ze[v*3],S=y+ze[v*3+1];if(w){if(!cs(b,g-b,Je[d*3+2],w[0],w[2],tr)||(b=tr[0],g=tr[1],!cs(y,S-y,ze[v*3+2],w[1],w[3],xt)))continue;y=xt[0],S=xt[1]}let j=u?u.sx:1,ce=u?u.sy:1,De=u?u.h:f;fs(b,g-b,j,tr),fs(y,S-y,ce,xt),e.scissor(tr[0],De-xt[0]-xt[1],tr[1],xt[1]),w&&C0(tr[0],De-xt[0]-xt[1],tr[1],xt[1]),je[0]=Je[d*3+2]*j,je[1]=ze[v*3+2]*ce}else e.scissor(Je[d*3],f-ze[v*3]-ze[v*3+1],Je[d*3+1],ze[v*3+1]),je[0]=Je[d*3+2],je[1]=ze[v*3+2];El()}je[0]=0,je[1]=0,i||e.disable(e.SCISSOR_TEST)}let j0=[0,0,0,0,!1,!1];function X0(t){let r=j0,n=I(),a=L();if(r[0]=0,r[1]=0,r[2]=0,r[3]=0,r[4]=!1,r[5]=!1,ea||!Or)return r[0]=n,r[1]=a,r;let i=1/0,o=-1/0,f=1/0,h=-1/0;for(let c=0;c<4;c++){let u=Or[(c&1)*2],w=Or[1+(c>>1)*2],d=t[0]*u+t[2]*w+t[4],v=t[1]*u+t[3]*w+t[5];d<i&&(i=d),d>o&&(o=d),v<f&&(f=v),v>h&&(h=v)}for(let c=0;c<2;c++){let u=c?f:i,w=c?h:o,d=c?U:M,v=c?a:n,b=Math.floor(u)-1,g=Math.ceil(w)+1-b,y=Math.ceil(g/64)*64,S=d>=y&&d<v&&d<=y*2?d:Math.ceil(g*1.25/64)*64;if(!(g>0)||S>=v){r[c]=v;continue}r[c]=S,r[c+2]=b,r[c+4]=!0}return r}let G0=(t,r,n)=>t.composite(r,n,!0),nr={m:null,look:null,dx:0,dy:0},V0=()=>z0(nr.m,nr.look,nr.dx,nr.dy),W0=()=>rr(Y[0],Y[1],M,U);function H0(t){_0(t[0],t[1]),Y[0]=t[2],Y[1]=t[3],Mt[0]=t[4],Mt[1]=t[5],Te[0]=0,Te[1]=0}function z0(t,r,n,a){let i=M,o=U;Mt[0]?Y[0]+=n:Te[0]=((Te[0]-n)%i+i)%i,Mt[1]?Y[1]+=a:Te[1]=((Te[1]-a)%o+o)%o;let f=!Mt[0]&&n!==0,h=!Mt[1]&&a!==0;!f&&!h||(e.bindFramebuffer(e.FRAMEBUFFER,Dr),e.viewport(0,0,i,o),e.enable(e.SCISSOR_TEST),Ur=t,Lr=r,er=3,f&&(n>0?rr(0,Y[1],n,o,!0):rr(i+n,Y[1],-n,o,!0)),h&&(a>0?rr(Y[0],0,i,a,!0):rr(Y[0],o+a,i,-a,!0)),e.disable(e.SCISSOR_TEST))}let Me=null,ct=null,Dt=null,kr=null,ar=new Set,Bt=null,gt=0,Tl=()=>{ar.clear(),Bt=null,gt=0},wi="",or=t=>(wi=t,oa(jt.refused,t),m.on&&m.note(he.rowsRefused+t),!1),Ua=t=>{if(!ar.size)return!0;if(!t)return!1;for(let r of ar)if(!t.includes(r))return!1;return!0},ir=ao*4,At=new Float32Array(p*ir),yl=null,Rl=()=>(yl||=new Float32Array(At.length)).set(At),$0={shape:[],tint:[]},Fl={mark:null,k:0},_l={mark:null,k:0},Y0={part:Fl,tintPart:_l},bi={mark:null,k:0};function Sl(t){let{shape:r,tint:n}=qf(t,At,yl,ir,ar,$0),a=Dl(r,null,Fl);if(gt)for(let i=0;i<te;i++)Bt[i]&&!a.mark[i]&&(a.mark[i]=1,a.k++);return Dl(n,a.mark,_l),Y0}let xe=128,La=12,Q=new Int32Array(La*4),pn=new Uint8Array(0);function K0(t,r){let n=Y[0],a=Y[1],i=M,o=U,f=Math.ceil(i/xe),h=Math.ceil(o/xe);pn.length<f*h&&(pn=new Uint8Array(f*h)),pn.fill(0,0,f*h);for(let b=0;b<te;b++){if(!r[b])continue;let g=Me[b*6],y=Me[b*6+1],S=1/0,j=-1/0,ce=1/0,De=-1/0;for(let Rt=0;Rt<4;Rt++){let Xe=g+(Rt&1)*16,za=y+(Rt>>1)*16,et=t[0]*Xe+t[2]*za+t[4]-n,Pr=t[1]*Xe+t[3]*za+t[5]-a;et<S&&(S=et),et>j&&(j=et),Pr<ce&&(ce=Pr),Pr>De&&(De=Pr)}let dt=Math.max(0,Math.floor((S-2)/xe)),Nt=Math.min(f-1,Math.floor((j+2)/xe)),Pt=Math.max(0,Math.floor((ce-2)/xe)),zi=Math.min(h-1,Math.floor((De+2)/xe));for(let Rt=Pt;Rt<=zi;Rt++)for(let Xe=dt;Xe<=Nt;Xe++)pn[Rt*f+Xe]=1}let c=0,u=f,w=-1,d=h,v=-1;for(let b=0;b<h;b++)for(let g=0;g<f;g++){if(!pn[b*f+g])continue;let y=g;for(;y+1<f&&pn[b*f+y+1];)y++;g<u&&(u=g),y>w&&(w=y),b<d&&(d=b),b>v&&(v=b);let S=-1;for(let j=0;j<c;j++)Q[j*4]===g*xe&&Q[j*4+2]===(y+1-g)*xe&&Q[j*4+1]+Q[j*4+3]===b*xe&&(S=j);S>=0?Q[S*4+3]+=xe:c<La?(Q[c*4]=g*xe,Q[c*4+1]=b*xe,Q[c*4+2]=(y+1-g)*xe,Q[c*4+3]=xe,c++):c=La+1,g=y}c>La&&(Q[0]=u*xe,Q[1]=d*xe,Q[2]=(w+1-u)*xe,Q[3]=(v+1-d)*xe,c=1);for(let b=0;b<c;b++)Q[b*4+2]=Math.min(Q[b*4+2],i-Q[b*4]),Q[b*4+3]=Math.min(Q[b*4+3],o-Q[b*4+1]),Q[b*4]+=n,Q[b*4+1]+=a;return c}function Ml(t,r,n){let a=K0(t,n);if(a){e.bindFramebuffer(e.FRAMEBUFFER,Dr),e.viewport(0,0,M,U),e.enable(e.SCISSOR_TEST),Ur=t,Lr=r,er=4;for(let i=0;i<a;i++)rr(Q[i*4],Q[i*4+1],Q[i*4+2],Q[i*4+3],!0);e.disable(e.SCISSOR_TEST),e.bindFramebuffer(e.FRAMEBUFFER,F())}}let q0={gen:new Float32Array(0),one:new Float32Array(0),nGen:0,nOne:0};function J0(t){let{gen:r,nGen:n}=Kf(Me,te,null,t,q0);Zs(Co,r,n*6),jo=n,Xo=t}function Dl(t,r,n){if(!Dt){Dt=new Map;for(let o=0;o<te;o++){let f=Me[o*6+2],h=Me[o*6+3],c=-1;for(let u=f;u<f+h;u++){let w=ct[u*8+4];if(w===c)continue;c=w;let d=Dt.get(w);d||Dt.set(w,d=[]),d[d.length-1]!==o&&d.push(o)}}}(!n.mark||n.mark.length<te)&&(n.mark=new Uint8Array(te));let a=n.mark;a.fill(0,0,te);let i=0;for(let o of t){let f=Dt.get(o);if(f)for(let h=0;h<f.length;h++){let c=f[h];!a[c]&&!(r&&r[c])&&(a[c]=1,i++)}}return n.k=i,n}function Q0({p:t,u:r},n,a,i,o,f=null){let h=Xr(tt.world,n[0],n[1],n[2],n[3],n[4],n[5]),c=f?f[0]:ft?ft.w:M,u=f?f[1]:ft?ft.h:U;e.useProgram(t),l.m3(r.world,h),l.f2(r.size,c,u),l.f1(r.cell,16),l.i1(r.morphOn,yt.morph?yt.morph.tight?2:1:0),yt.morph&&(l.i1(r.posBase,yt.morph.posBase),l.i1(r.joinBase,yt.morph.joinBase)),l.f1(r.px,1/Math.max(1e-6,Math.hypot(n[0],n[1])));let w=n[0]*n[3]-n[1]*n[2]||1e-9;l.f4(r.invA,n[3]/w,-n[1]/w,-n[2]/w,n[0]/w),l.f2(r.tOff,n[4],n[5]),l.f2(r.lOff,je[0],je[1]),l.f2(r.sizeF,c,u),l.f1(r.reachU,a.reach),l.f2a(r.shOff,a.shOff),l.f4a(r.casing,a.casing),l.f4a(r.shadow,a.shadow),l.f4a(r.sheenInk,a.sheen),l.f4a(r.shadeInk,a.shade),l.f4a(r.rimInk,a.rim||Oa),l.f4a(r.paperInk,a.paper||Oa),l.f4a(r.ring,a.ring),l.f2a(r.light,a.light),l.f1(r.netAlpha,a.netAlpha),l.i1(r.fx,a.fx?1:0),l.i1(r.redraw,i?1:0),l.i1(r.tint,o?1:0),l.fv1(r.tierAlpha,a.tierAlpha),l.iv1(r.tierGroup,a.tierGroup),l.i1(r.useOrgan,a.organs>0&&Ma?1:0),l.f1(r.organK,+a.organs||0),Ma&&l.f4a(r.organRect,Ma),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,Jt),l.i1(r.ent,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,Gn),l.i1(r.rad,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,nn),l.i1(r.tube,2),e.activeTexture(e.TEXTURE3),e.bindTexture(e.TEXTURE_2D,Vn),l.i1(r.organ,3),e.activeTexture(e.TEXTURE4),e.bindTexture(e.TEXTURE_2D,Aa),l.i1(r.rmax,4),e.activeTexture(e.TEXTURE5),e.bindTexture(e.TEXTURE_2D,ai),l.i1(r.depL,5)}let E={noEnds:A==="lobule",ent:null,morph:null,B:null,tv:0,patchOk:!1,pts:{},jl:{},patch:{},tb:{},pb:{},tex:null,pj:null,texRows:0,patchVAO:null,layVAO:null,rowBuf:null,patchBuf:null,rowCap:0,patchCap:0,tubeVAO:null,tubeVB:null,tubeIB:null,tubeIndexN:0,w:0,h:0,ok:!1,scrN:null,scrT:null,sw:0,sh:0,kP:0,ref:0,passes:0,strips:0,patches:0,plain:0,webs:0,lumStrips:0,lumWebs:0,stage2:null},Z0=[null,null],eh=[e.DEPTH_STENCIL_ATTACHMENT],th=new Float32Array([1]),rh=new Float32Array(8),nh=new Int32Array([0]),Bl=[e.COLOR_ATTACHMENT0,e.NONE,e.NONE,e.NONE],ka=()=>!On||!Gt||!vr||N||!ct||!Me?!1:E.ok!==null;function vi(t){xr=t,!N&&(N=!0,console.warn(`Veins renderer: ${t}; no vessels can be drawn on the GPU.`))}function ah(){return N?!1:(se.includes("tube")&&(se.splice(se.indexOf("tube"),1),ua(),se.length||Hr(),Gt&&(K=!1)),Gt?ka():(vi("the Tube vessel shaders failed"),!1))}let xi=()=>({ent:null,morph:null,dirty:!0,gen:0,pts:{},jl:{},patch:{},pj:null,patchOk:!1,s2:null,noEnds:A==="lobule"}),Ia=xi(),Ol=null,Ul=null,Ll=!1,gi=()=>((zr!==Ol||we!==Ul)&&(Ol=zr,Ul=we,Ll=Ac(zr,!!we).joins==="web"),Ll),Ai=()=>!gi(),kl=(t,r,n,a)=>{tc(r,n,a,p,t.pts),t.ptsFor=r},Il=(t,r,n,a,i)=>{t.ptsFor!==r&&kl(t,r,n,a),t.ptsFor=null,rc(n,a,t.jl),t.ent=r,t.morph=i,t.dirty=!1,t.gen++,t.patchOk=!1,t.s2=null,i||(E.tex||(E.tex=ne(e)),e.bindTexture(e.TEXTURE_2D,E.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,2048,t.pts.rows,0,e.RGBA,e.FLOAT,t.pts.pts,0),m.on&&m.note("uploaded: mesh points",t.pts.rows*2048*16/1024))},Nl=t=>{nc(t.ent,t.jl.view,t.patch,t.morph?t.morph.joinBase:-1),t.pj||(t.pj=ne(e)),e.bindTexture(e.TEXTURE_2D,t.pj),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,2,Math.max(1,t.patch.j.length/8),0,e.RGBA,e.FLOAT,t.patch.j.length?t.patch.j:rh,0),t.patchOk=!0};function oh(){let t=Ye?Ye.derived||=xi():Ia;return E.B===t&&t.ent===ct&&!t.dirty&&(t.patchOk||!Ai())||((t.dirty||t.ent!==ct)&&Il(t,ct,Me,te,yt.morph),!t.patchOk&&Ai()&&Nl(t),E.B=t,E.ent=t.ent,E.morph=t.morph,E.pts=t.pts,E.jl=t.jl,E.patch=t.patch,E.pj=t.pj,E.patchOk=t.patchOk),E}let Na=()=>gi()?"web":"patch";function Pl(t,r){if(N||!t.entCPU||(t.prepKey=Na(),!t.prepKey))return!1;let n=t.derived||=xi();if(r===0)return n.ent!==t.entCPU&&n.ptsFor!==t.entCPU&&kl(n,t.entCPU,t.cellsCPU,t.nCells),!0;if(r===1)return n.ent!==t.entCPU&&Il(n,t.entCPU,t.cellsCPU,t.nCells,t.morph),!0;if(r===2)return Ai()&&!n.patchOk&&Nl(n),!0;if(!gi())return t.prepared=t.prepKey,!1;if(r!==3){let i=us(n,At,p,t.morph.joinBase,2,performance.now()+3);return i.gen===n.gen&&i.R.rows?(t.prepared=t.prepKey,!1):2}return us(n,At,p,t.morph.joinBase,1,performance.now()+3).midGen===n.gen?1:2}function Ei(t){for(let r=0,n;n=Pl(t,r);)n!==2&&r++}let Pa={done:()=>!0,run(){if(Ye){Ve.push(Pa);return}let t=Na();for(let r of ut)if(r.prepKey!==t){Ei(r);break}for(let r of ut)if(r.prepKey!==t){Ve.push(Pa);break}}},Cl=()=>{ut.size&&!Ve.includes(Pa)&&Ve.push(Pa)};function Ca(){if(!E.rowBuf){E.rowBuf=e.createBuffer(),E.patchVAO=e.createVertexArray(),E.patchBuf=e.createBuffer(),e.bindVertexArray(E.patchVAO);let r=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,ec,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,E.patchBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,4,e.FLOAT,!1,to*4,16),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,to*4,32),e.vertexAttribDivisor(2,1),e.enableVertexAttribArray(3),e.vertexAttribPointer(3,2,e.FLOAT,!1,to*4,48),e.vertexAttribDivisor(3,1),E.layVAO=e.createVertexArray(),e.bindVertexArray(E.layVAO),e.bindBuffer(e.ARRAY_BUFFER,ot),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),ta=e.createRenderbuffer()}if(!E.tubeVAO){let r=sc(1);E.tubeIndexN=r.nIndex,E.tubeVAO=e.createVertexArray(),e.bindVertexArray(E.tubeVAO),E.tubeVB=e.createBuffer(),E.tubeIB=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,E.tubeVB),e.bufferData(e.ARRAY_BUFFER,r.attr,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,E.tubeIB),e.bufferData(e.ELEMENT_ARRAY_BUFFER,r.index,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,E.rowBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null)}if(E.w===M&&E.h===U&&E.ok&&_a)return!0;E.w=M,E.h=U,m.on&&Fe(M*U*4/1024),e.bindRenderbuffer(e.RENDERBUFFER,ta),e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH24_STENCIL8,M,U),e.bindFramebuffer(e.FRAMEBUFFER,Dr),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,ta);let t=yf(e,e.FRAMEBUFFER,"layer+depth+stencil",M,U);return _a=t,t||e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,null),E.ok=t?!0:null,E.ok||vi("the Tube vessel renderer has no depth and stencil"),!!E.ok}function ih(t){if(E.sw!==M||E.sh!==U){E.sw=M,E.sh=U;for(let n of[E.scrN,E.scrT])n&&(e.bindTexture(e.TEXTURE_2D,n),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,M,U,0,e.RGBA,e.UNSIGNED_BYTE,null))}let r=t?E.scrT:E.scrN;return r||(r=ne(e),e.bindTexture(e.TEXTURE_2D,r),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,M,U,0,e.RGBA,e.UNSIGNED_BYTE,null),m.on&&Fe(M*U*4/1024),t?E.scrT=r:E.scrN=r),r}let sh=t=>e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0),Ti=64;function lh(){return E.kP>=Ti&&(e.depthMask(!0),e.clearBufferfv(e.DEPTH,0,th),E.kP=0),1-++E.kP/Ti}function fh(){return E.ref>=255&&(e.clearBufferiv(e.STENCIL,0,nh),E.ref=0),++E.ref}function yi(t,r,n){let a=n*1;return t<=ia.UP?12*1.3+.6+a+2*n:t<=ia.SHADOW?Math.hypot(r.shOff[0],r.shOff[1])+2.4*1.4+a+2*n:a+2.5*n+2*n}function ch(t,r){e.drawBuffers(Bl),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(vr.p),e.activeTexture(e.TEXTURE7),e.bindTexture(e.TEXTURE_2D,t),l.i1(vr.u.uT,7),l.f1(vr.u.uK,r),e.bindVertexArray(E.layVAO),e.drawArrays(e.TRIANGLE_STRIP,0,4),E.passes++}let Ot=Bc({lobule:A==="lobule",gl:e,UC:l,MG:E,MAX_TIERS:lo,ATTACH:oi,KEY_PASSES:Ti,MESH_TWO:Z0,MESH_DS:eh,MESH_COLOR_BUF:Bl,CLR_F:Sa,gpuProbe:m,nTubes:p,tubeNow:At,setG2:S0,meshPad:yi,meshKeyNext:lh,meshRefNext:fh,meshTargets:Ca,meshGeo:oh,meshTarget:sh,meshScratch:ih,meshLay:ch,vesselSet:Q0,layerView:(t,r,n)=>{ft&&(t=ft.m);let a=1/Math.max(1e-6,Math.hypot(t[0],t[1]));return n.pad=Math.max(yi(ia.UP,r,a),yi(ia.SHADOW,r,a))+12+4*a,n.rmax=Us,Dc(t,Y[0],Y[1],M,U,n)},get tubeS(){return On},get tubePt(){return Gt},get tube2(){return zr},get tube2Failed(){return da},get tube3(){return we},get tube3Failed(){return pa},lumenBind:Nh,get baseTex(){return Ce},get geo(){return yt}}),jl=()=>{let t={tex:ne(e),fbo:e.createFramebuffer(),w:0,h:0};return e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),t},x=mt?jl():null,Ut=!1,Ir=!1,Ri=!1,Xl=0,Fi=null,ja=null,Gl=-1,_i=-1,Si=-1,Mi=-1,Di=-1,Bi=-1,Oi=-1;function hh(){return x.w===I()&&x.h===L()?!1:(x.w=I(),x.h=L(),m.on&&Fe(x.w*x.h*4/1024),e.bindTexture(e.TEXTURE_2D,x.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,x.w,x.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,x.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,x.tex,0),e.bindFramebuffer(e.FRAMEBUFFER,F()),!0)}let uh=!0,Et=0,Ui=!1,Vl=-1,Wl=0,Hl=0,Li=0;function dh(){if(Vl=xn(),!Et)return;let t=Et;if(Et=0,!(!N&&Ke!==Wl&&(!ie.length||Li!==Hl))){Ui=!0;try{Xa(!0,(t&2)!==0)}finally{Ui=!1}}}let ph=Mf(dh);function sr(t=!0,r=!1){Et&&t&&(r=r||(Et&2)!==0),Xa(t,r)}function mh(){if(uh&&!Ui&&!N&&Ja()&&Vl!==xn()){Et|=3,Wl=Ke,Hl=Li;return}sr(!0,!0)}function Xa(t,r){bh(t,r),O&&t&&!N&&O.present?.()}function wh(){Bo(),x?.w&&(e.bindFramebuffer(e.FRAMEBUFFER,x.fbo),e.viewport(0,0,x.w,x.h),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT)),e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),te=We=0,ee=null,K=!1}function bh(t,r){vh(t,r)}function vh(t,r){if(Oe&&!N&&Oe.on()){Ke++,e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT);try{Oe.draw()}catch(c){console.warn("Veins renderer: what stands in for the figure failed.",c),Oe=null}e.bindFramebuffer(e.FRAMEBUFFER,F());return}if((!x?.w||x.w!==I()||x.h!==L())&&!N&&ie.some(Ni)){Ke++,e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),t&&(bn(),e.bindFramebuffer(e.FRAMEBUFFER,F()));return}if(!N&&ie.some(c=>Ni(c)&&c.opaque?.())){Ke++,Ut&&(Ut=!1,Ir=!0),e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),t&&(bn(),e.bindFramebuffer(e.FRAMEBUFFER,F()));return}if(!x?.w||N||(Ut&&ht()&&(Ut=!1,Ir=!0),x.w!==I()||x.h!==L()))return;if(!Ut&&Ir){if(Ja()&&xn()===Gl&&_i===_e&&Si===at&&!(r&&t&&ie.length))return;if(Ir=!1,Fi){Ri=!0;try{It.composite(Fi,ja,!0)}finally{Ri=!1}}return}if(Ut){Ke++,e.disable(e.SCISSOR_TEST),Pi(),ke("organ layer"),Va(!0),t&&ie.length&&(bn(),e.bindFramebuffer(e.FRAMEBUFFER,F()),ke("glasses and labels")),Ut=!1,_i=_e,Si=at;return}m.on&&m.note(he.present,x.w*x.h*4/1024),Pi(),ke("organ layer"),e.disable(e.SCISSOR_TEST),Ke++;let n=!1,a=fr[0],i=!!H&&x.w===s.width&&x.h===s.height&&!Vr&&!Wr,o=Rh(t,r)?Fh():null;if(o){a=fr[6],_h(o,t),oa(jt.present,a);return}if(ht()&&Wi(x.tex,!1))a=fr[1];else if(!H&&Ae&&Ae.on()&&Bh())n=!0,a=fr[2];else if(H&&!i&&Lh())a=fr[3];else{H&&(a=i?fr[5]:fr[4]);let c=H&&!i;e.bindFramebuffer(e.READ_FRAMEBUFFER,x.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,F()),(c||x.w===s.width&&x.h===s.height)&&ae(e.DRAW_FRAMEBUFFER,!0),e.blitFramebuffer(0,0,x.w,x.h,0,0,c?s.width:x.w,c?s.height:x.h,e.COLOR_BUFFER_BIT,c?e.LINEAR:e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,F())}oa(jt.present,a);let f=H?H[0]:0,h=H?H[1]:0;(Ci!==x.w||ji!==x.h||Xi!==s.width||Gi!==s.height||ef!==f||tf!==h||rf!==A)&&(Ci=x.w,ji=x.h,Xi=s.width,Gi=s.height,ef=f,tf=h,rf=A,jt.presentSize=`${A}: picture ${Ci}x${ji} onto the screen ${Xi}x${Gi}${H?`, upscale set at ${f}x${h}`:", no upscale set"}`),ke("present copy"),ke(Ff),Va(!0),ke("organ overlay laid"),t&&ie.length&&(bn(),e.bindFramebuffer(e.FRAMEBUFFER,F()),ke("glasses and labels")),_n&&Mh(n&&t),Yl(a===fr[0]&&!H&&!n&&t,!0)}let xh=250,gh=200,Ah=.75,zl=Tf("partial"),Eh=zl!=="off",q={ok:!1,writes:-1,pic:-1,blood:-1,tv:-1,ovr:-1,ovS:!1,w:0,h:0,ow:0,oh:0,tex:null,fullAt:-1e9,run:0,check:zl==="check",checked:0,bad:0,laid:0,share:0,why:"",who:"",refused:{}},$l=[],Th=[],$e=[0,0,0,0];if(ue){let t=globalThis.pps||={};t.partial=q}let ki=0;function Yl(t,r){q.ok=!!t&&!!ue&&!N,q.ok&&(q.writes=ue.writes,q.pic=_e,q.blood=at,q.tv=Fn,q.ovr=ki,q.ovS=Vt,q.w=s.width,q.h=s.height,q.ow=x.w,q.oh=x.h,q.tex=x.tex,r?(q.fullAt=performance.now(),q.run=0):q.run++)}function yh(){for(let t=0;t<ie.length;t++){let r=ie[t];if(r.solo&&r.on&&!r.on())continue;let n=!1;if(typeof r.steady=="function")try{n=!!r.steady()}catch{n=!1}if(!n)return q.who=`order ${r.order??0}${typeof r.steady=="function"?"":", no steady()"}`,!1}return!0}function Rh(t,r){let n=a=>(q.refused[a]=(q.refused[a]||0)+1,!1);return r?n("asked for by a pass over the figure"):t?ht()?n("under a camera"):H?n("upscaled"):Ae&&Ae.on()?n("over a picture under the figure"):!0:n("without the passes")}function Fh(){let t=q,r=c=>(t.why=c,t.refused[c]=(t.refused[c]||0)+1,null);if(!Eh||!ue||N)return r("off");if(Xf(xh))return r("a card is moving by number");if(!t.ok)return r("the last present was not a plain whole one");if(ue.writes!==t.writes)return r("something else wrote on the screen");if(t.pic!==_e)return r("a picture other than the blood's");if(t.tv!==Fn)return r("the list of passes changed");if(t.ovr!==ki||t.ovS!==Vt)return r("the overlays changed");if(t.w!==s.width||t.h!==s.height||t.ow!==x.w||t.oh!==x.h||t.tex!==x.tex||x.w!==s.width||x.h!==s.height)return r("a size or the kept picture changed");if(!(at>t.blood))return r("no blood frame since");if(performance.now()-t.fullAt>=gh)return r("whole present due (the glass blurs)");let n=Ar.rects(t.blood,at,$l,Th);if(!(n>0))return r(n<0?"the blood's tiles are not known":"the blood drew nowhere");let a=1/0,i=1/0,o=-1/0,f=-1/0;for(let c=0;c<n;c++){let u=$l[c];a=Math.min(a,u.x),i=Math.min(i,u.y),o=Math.max(o,u.x+u.w),f=Math.max(f,u.y+u.h)}$e[0]=Math.max(0,Math.floor(a)-2),$e[1]=Math.max(0,Math.floor(i)-2),$e[2]=Math.min(s.width,Math.ceil(o)+2),$e[3]=Math.min(s.height,Math.ceil(f)+2);let h=($e[2]-$e[0])*($e[3]-$e[1])/(s.width*s.height);return!(h>0)||h>Ah?r("the box is most of the canvas"):yh()?(m.on&&m.gauge("rest present box",`${$e[2]-$e[0]}x${$e[3]-$e[1]} px, ${(h*100).toFixed(0)}% of the canvas`),t.laid++,t.share=h,$e):r(`a pass over the figure is not steady (${t.who})`)}function _h(t,r){let n=s.width,a=s.height,i=t[2]-t[0],o=t[3]-t[1],f=a-t[3];e.bindFramebuffer(e.READ_FRAMEBUFFER,x.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,F()),e.blitFramebuffer(t[0],f,t[2],f+o,t[0],f,t[2],f+o,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,F()),m.on&&m.note(he.presentPart,i*o*4/1024),ke("present copy"),ue.clip(t[0],f,i,o);try{Va(!0),ke("organ overlay laid"),r&&ie.length&&(bn(),e.bindFramebuffer(e.FRAMEBUFFER,F()),ke("glasses and labels"))}finally{ue.unclip()}q.check&&Sh(t),Yl(!0,!1)}let lr=null,mn=null;function Sh(t){let r=s.width,n=s.height,a=r*n*4;(!lr||lr.length!==a)&&(lr=new Uint8Array(a),mn=new Uint8Array(a));let i=d=>{e.bindFramebuffer(e.READ_FRAMEBUFFER,F()),e.readPixels(0,0,r,n,e.RGBA,e.UNSIGNED_BYTE,d)};i(lr),Ii=!0;try{e.bindFramebuffer(e.READ_FRAMEBUFFER,x.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,F()),e.disable(e.SCISSOR_TEST),e.blitFramebuffer(0,0,r,n,0,0,r,n,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,F()),Va(!0),ie.length&&(bn(),e.bindFramebuffer(e.FRAMEBUFFER,F()))}finally{Ii=!1}i(mn);let o=0,f=r,h=n,c=-1,u=-1,w=0;for(let d=0;d<a;d+=4){let v=Math.max(Math.abs(lr[d]-mn[d]),Math.abs(lr[d+1]-mn[d+1]),Math.abs(lr[d+2]-mn[d+2]),Math.abs(lr[d+3]-mn[d+3]));if(v>2){o++;let b=d>>2,g=b%r,y=b/r|0;g<f&&(f=g),g>c&&(c=g),y<h&&(h=y),y>u&&(u=y),v>w&&(w=v)}}q.checked++,o&&(q.bad++,q.last={diff:o,worst:w,box:[f,n-1-u,c,n-1-h],laid:t.slice()},console.warn("Veins renderer: a rest present laid in part differs from the whole one.",q.last))}let Ii=!1;function Kl(){if(!Sn||N||!_n.ready())return!1;for(let t=0;t<ie.length;t++)if(!ie[t].still)return!1;return!(H||ht()||Ut||Ir||Oe&&Oe.on()||be&&Vt||!Ae||!Ae.on()||!x||x.w!==s.width||x.h!==s.height||I()!==s.width||L()!==s.height||!Sn.read(Ge)||Ge.dyn||!Ge.tex||Ge.w!==s.width||Ge.h!==s.height)}function Mh(t){Ee.on=!1,!(!t||!D||!D.fbo||!Kl())&&(Ee.on=!0,Ee.pic=_e,Ee.gen=D.gen,Ee.v1=Ge.v1,Ee.v2=Ge.v2,Ee.v3=Ge.v3)}function Dh(t){return!Ee.on||!Kl()||Ee.pic!==_e||Ee.gen!==D.gen||Ee.v1!==Ge.v1||Ee.v2!==Ge.v2||Ee.v3!==Ge.v3?!1:(Ke++,e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),We&&_n.draw(Xr(tt.world,t[0],t[1],t[2],t[3],t[4],t[5]),s.width,s.height,Yt,en,We,x.tex,Ge.tex,Ge),e.bindFramebuffer(e.FRAMEBUFFER,F()),m.on&&m.note(he.pictureKept),O&&!N&&O.present?.(),!0)}let Ni=t=>!!t.solo&&(!t.on||!!t.on()),Ga=[[],[],[],[]],wn=0;function ql(){let t=wn<=Ga.length?Ga[wn-1]:[];t.length=0;for(let r=0;r<ie.length;r++)t.push(ie[r]);return t}function bn(){wn++,Li++;try{let t=ql();for(let n=0;n<t.length;n++){let a=t[n];try{a.prep?.(),a.fails=0}catch(i){Ss(a,i)}}t=ql();let r=-1;for(let n=t.length-1;n>=0;n--){let a=t[n];if(a.opaque&&Ni(a)){let i=!1;try{i=!!a.opaque()}catch{i=!1}if(i){r=n;break}}}for(let n=0;n<t.length;n++){let a=t[n];if(!(n<r&&a.solo))try{a.draw(),a.fails=0}catch(i){Ss(a,i)}}}finally{wn--,wn<Ga.length&&(Ga[wn].length=0)}}function Bh(){if(Ue===null)try{Ue=Wa("lay",!0)||pe(e,de(e,pr,ps))}catch(t){console.warn("Veins renderer: the overlays' shader could not be made.",t),Ue=!1}if(!Ue)return!1;e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT);try{Ae.draw()}catch(t){console.warn("Veins renderer: what is drawn under the figure failed.",t),Ae=null}return e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(Ue.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,x.tex),l.i1(Ue.u.uT,0),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND),!0}let Jl=new Float64Array(6);function Ql(){let t=Fs?ci(mr,k0):mr;for(let r=0;r<6;r++)Jl[r]=t[r];return Jl}function Pi(){if(!be||!Vt||!mr)return;let t=Ql();V.painter.cssPx=uo*I()/s.width,be.stale(t,I(),L())&&(be.render(t,I(),L()),ki++)}function Va(t=!1){if(!be||!Vt||!mr)return;t||Pi();let r=be.bounds;if(ht()){if(r&&!Oh(r))return;try{if(Wi(be.texture,!0,!1,r?Zl:null))return}finally{e.disable(e.SCISSOR_TEST)}}if(r){let n=s.width/I(),a=s.height/L(),i=1+(H?Math.ceil(Math.max(Math.abs(Vr*n),Math.abs(Wr*a))):0);if(Lt[0]=Math.max(0,Math.floor(r[0]*n)-i),Lt[2]=Math.min(s.width,Math.ceil(r[2]*n)+i),Lt[1]=Math.max(0,s.height-Math.ceil(r[3]*a)-i),Lt[3]=Math.min(s.height,s.height-Math.floor(r[1]*a)+i),!(Lt[2]>Lt[0]&&Lt[3]>Lt[1]))return;Tt=Lt}try{if(H&&(I()!==s.width||L()!==s.height)&&Wi(be.texture,!0,!0))return;if(Ue===null)try{Ue=Wa("lay",!0)||pe(e,de(e,pr,ps))}catch(n){console.warn("Veins renderer: the overlays' shader could not be made.",n),Ue=!1}if(!Ue)return;e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),Tt?(e.enable(e.SCISSOR_TEST),e.scissor(Tt[0],Tt[1],Tt[2]-Tt[0],Tt[3]-Tt[1])):e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(Ue.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,be.texture),l.i1(Ue.u.uT,0),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND)}finally{e.disable(e.SCISSOR_TEST),Tt=null}}let Lt=[0,0,0,0],Zl=[0,0,0,0],fr=["copy","camera","under picture","upscale","filtered copy (upscale compiling)","copy (picture is the canvas size)","copy in part (the blood's box, at rest)"],Ci=0,ji=0,Xi=0,Gi=0,ef=0,tf=0,rf="";function Oh(t){let r=Z.k*Re.k;return pu(Zl,t,r,Re.k*Z.ex+Re.ex,s.height*(1-r)-(Re.k*Z.ey+Re.ey),s.width,s.height,I(),L())}let Tt=null,Z={k:1,ex:0,ey:0,a:1},Re={k:1,ex:0,ey:0},ht=()=>Z.k!==1||Z.a!==1||Re.k!==1,Vi=0,kt=null;function Wi(t,r,n=!1,a=null){let i=n?1:Z.a,o=n?1:Z.k*Re.k,f=n?0:Re.k*Z.ex+Re.ex,h=n?0:s.height*(1-o)-(Re.k*Z.ey+Re.ey);if(kt===null)try{kt=pe(e,de(e,pr,eu))}catch(u){console.warn("Veins renderer: the camera shader could not be made.",u),kt=!1}if(!kt)return!1;e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height);let c=a||(n?Tt:null);return c?(e.enable(e.SCISSOR_TEST),e.scissor(c[0],c[1],c[2]-c[0],c[3]-c[1])):e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),r?(e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA)):(e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT)),i>0?(e.useProgram(kt.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),l.i1(kt.u.uT,0),l.f2(kt.u.uDst,s.width,s.height),l.f3(kt.u.uCam,o,H?f+o*Vr*s.width/I():f,H?h-o*Wr*s.height/L():h),l.f1(kt.u.uA,i),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND),!0):(e.disable(e.BLEND),!0)}let Nr=null;function Uh(t,r,n,a,i,o,f,h){if(Nr===null)try{Nr=pe(e,de(e,pr,Cc))}catch(w){console.warn("Veins renderer: the lobule's laying shader could not be made.",w),Nr=!1}let c=Nr;if(!c||!(h>0))return!1;let u=r*i-n*a;return u?(e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(c.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,t),l.i1(c.u.uT,0),l.f2(c.u.uDst,s.width,s.height),l.f4(c.u.uM,i/u,-n/u,-a/u,r/u),l.f2(c.u.uTr,o,f),l.f1(c.u.uA,h),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND),!0):!1}let Ze=null;function Lh(){if(Ze===null){let t;try{t=Wa("up",!1),t===void 0&&(t=pe(e,de(e,pr,jc)))}catch(r){console.warn("Veins renderer: the upscale shader could not be made.",r),t=!1}if(t===null)return!1;Ze=t}return Ze?(e.bindFramebuffer(e.FRAMEBUFFER,F()),e.viewport(0,0,s.width,s.height),e.disable(e.BLEND),e.disable(e.STENCIL_TEST),ae(e.FRAMEBUFFER,!0),e.useProgram(Ze.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,x.tex),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),l.i1(Ze.u.uT,0),l.f2(Ze.u.uSrc,x.w,x.h),l.f2(Ze.u.uDst,s.width,s.height),l.f2(Ze.u.uOff,Vr,Wr),l.f1(Ze.u.uCR,ho?0:1),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),!0):!1}function Wa(t,r){let n=nt[t];if(n){if(!r&&Mn&&!e.getProgramParameter(n.p,Mn.COMPLETION_STATUS_KHR))return null;delete nt[t];try{return pe(e,n)}catch(a){throw e.deleteProgram(n.p),a}finally{for(let a of n.sh)e.deleteShader(a)}}}function nf(t,r=!0){let n;try{n=Wa(t,!1)}catch(a){console.warn(`Veins renderer: the ${t} shader could not be made.`,a),n=!1}n!=null&&(t==="lay"?Ue=n:Ze=n,!(!n||!r)&&Lf(e,()=>{e.useProgram(n.p),t==="lay"?(e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA)):e.disable(e.BLEND),n.u.uT&&l.i1(n.u.uT,0),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND)}))}function kh(){return!ii||!Ye||A==="lobule"||N||dn||mi<1||!ka()?0:Nc(I()*L())}function Hi(t){if(Qt===t)return;Qt=t,e.bindTexture(e.TEXTURE_2D,Ce);let r=t?e.LINEAR:e.NEAREST;e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,r)}function Ih(t,r,n){Pc(M,U,n,si);let a=si[0],i=si[1];ve.sx=a/M,ve.sy=i/U,ve.w=a,ve.h=i,ve.m=t,ft=ve,e.viewport(0,0,a,i),Ur=ls(t,ve.sx,ve.sy,ve.ms),Lr=r,er=0,rr(Y[0],Y[1],M,U),ft=null,cn[0]=a,cn[1]=i,Hi(!0),m.on&&m.gauge("view switch layer",`drawn lower: ${a} x ${i} = ${(a*i/1e6).toFixed(2)} MP at ${n.toFixed(2)} of the picture's ${M} x ${U} (${(M*U/1e6).toFixed(2)} MP)`)}function fe(t,r,n,a){e.activeTexture(e.TEXTURE0+r),e.bindTexture(e.TEXTURE_2D,n),l.i1(t[a],r)}let le=null,af=Gc,of=!1;function Nh(t){let r=t.u,n=af;e.useProgram(t.p),fe(r,6,ln,"flow"),fe(r,7,Kn,"dye"),fe(r,12,an,"bend"),l.i1(r.blood,n.on?1:0),l.f1(r.flowA,n.alpha??1),l.f2(r.blendA,n.chevA??1,n.originA??1),l.i1(r.origin,n.origin?1:0),l.i1(r.dyeOn,Br&&n.dye!==!1?1:0),l.f1(r.clock,n.clock||0),l.f1(r.bT,n.bt||0),l.f1(r.rows,p),l.fv3(r.originCol,ms(n.originCol||ws)),l.f3a(r.dyeCol,n.dyeCol||bs),l.f3a(r.revCol,n.revCol||vs),l.f3a(r.inkLight,n.inkLight||xs),l.f3a(r.inkDark,n.inkDark||gs)}let Ph=t=>{Ot.lumenCounts(t),t[5]=le?le.w*le.h/1e6:0,t[6]=le&&M?le.w/M:0};function Ch(t,r,n){if(!ds("veins: lumen targets",Ca))return!1;le||(le=hs(e));let a=Qt&&!dn&&mi>=1,i=dn?1:a?cn[0]:Mc(M,U,mi,Al)[0],o=dn?1:a?cn[1]:Al[1],f=le.made,h=a?le.ensure(M,U):le.ensure(i,o);h.made!==f&&(un.stale(),Qe.all=!0),a!==of&&(of=a,un.stale(),Qe.all=!0),m.on&&h.made!==f&&Fe(i*o*7/1024),af=n;let c=!dn&&Ot.lumenBox(t,r,xl)?xl:null;if(e.bindFramebuffer(e.FRAMEBUFFER,h.fbo),e.viewport(0,0,i,o),e.colorMask(!0,!0,!0,!0),Qe.all)e.disable(e.SCISSOR_TEST),e.clearBufferfv(e.COLOR,0,Sa);else{e.enable(e.SCISSOR_TEST);for(let w=0;w<Qe.n;w++)e.scissor(Qe.r[w*4],Qe.r[w*4+1],Qe.r[w*4+2],Qe.r[w*4+3]),e.clearBufferfv(e.COLOR,0,Sa);e.disable(e.SCISSOR_TEST)}if(ye.n=0,ye.all=!c,dn)return Qe.all=!0,m.on&&m.gauge(A==="lobule"?"lobule lumen layer":"lumen layer","off (?lumen=off): no lumen pass, no blood"),!0;let u=i!==M||o!==U;if(u&&(ve.sx=i/M,ve.sy=o/U,ve.w=i,ve.h=o,ve.m=t,ft=ve),Ot.webColour=!!(n.origin||Br&&n.dye!==!1),Ur=u?ls(t,ve.sx,ve.sy,ve.ms):t,Lr=r,er=5,pi=c,di=un.needs(t,Te,Y,i,o,c),ds("veins: lumen strips and webs",()=>rr(Y[0],Y[1],M,U)),er=0,ft=null,pi=null,di&&(un.drawn(t,Te,Y,i,o,c),m.on&&m.note("lumen depth redraws")),Qe.all=ye.all,Qe.n=ye.n,Qe.r.set(ye.r),m.on){let w=0;if(!ye.all)for(let d=0;d<ye.n;d++)w+=ye.r[d*4+2]*ye.r[d*4+3];m.gauge(A==="lobule"?"lobule lumen layer":"lumen layer",`${i} x ${o} = ${(i*o/1e6).toFixed(2)} MP at ${(i/M).toFixed(2)} of the vessel layer's ${M} x ${U} (${(M*U/1e6).toFixed(2)} MP); drawn in ${ye.all?"all of it":`${(w/1e6).toFixed(2)} MP (${Math.round(100*w/(i*o))}%)`}`)}return!0}function Ha(t,r,n,a,i){l.i2(t.lA,Y[0],Y[1]),l.i2(t.lWrap,Te[0],Te[1]),l.i2(t.lSize,M,U),l.i1(t.lH,L());let o=null,f=null,h=1,c=1;Qt&&t.lowSz&&(hn[0]=Ce,hn[1]=fn,hn[2]=St,o=hn,f=cn,h=M,c=U),l.f2(t.lowS,o?f[0]/M:0,o?f[1]/U:0),l.i2(t.lowSz,o?f[0]:0,o?f[1]:0),l.f2(t.lowT,o?h:1,o?c:1),fe(t,0,o?o[0]:Ce,"base"),fe(t,1,o?o[1]:fn,"gbuf"),fe(t,2,ln,"flow"),fe(t,3,Gn,"rad"),fe(t,4,nn,"tube"),fe(t,5,Kn,"dye"),fe(t,6,oe[0]?.tex||Ce,"plate0"),fe(t,7,i?V.texture:oe[1]?.tex||Ce,"plate1"),fe(t,8,o?o[2]:St,"gbuf2"),fe(t,9,xa,"fluidMask"),fe(t,10,Rr.tex,"lineL"),l.i1(t.lineOn,r?1:0),fe(t,11,Jr.tex,"glowL"),l.i1(t.glowOn,n?1:0),fe(t,13,Qr.tex,"warmL"),l.i1(t.warmOn,a?1:0),fe(t,12,an,"bend"),l.i1(t.stackOn,i?1:0),t.lumenL&&(fe(t,8,le?le.tex():Ce,"lumenL"),l.f1(t.lumSc,le&&le.w&&(le.w!==M||le.h!==U)?1:0))}let cr=null;function jh(){if(cr)return cr;let t=e.createFramebuffer(),r=Fa.map(()=>ne(e)),n=e.createBuffer(),a=R0();return e.bindFramebuffer(e.FRAMEBUFFER,t),r.forEach((i,o)=>{e.bindTexture(e.TEXTURE_2D,i),e.texImage2D(e.TEXTURE_2D,0,a[o][0],1,1,0,a[o][1],a[o][2],null),e.framebufferTexture2D(e.FRAMEBUFFER,Fa[o],e.TEXTURE_2D,i,0)}),e.drawBuffers(Fa),e.bindFramebuffer(e.FRAMEBUFFER,F()),e.bindBuffer(e.ARRAY_BUFFER,n),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1e6,-1e6,0,0,0,0]),e.STATIC_DRAW),cr={fb:t,tx:r,buf:n,va:g0(n)}}function sf(t){Ta();let r=jh();if(e.bindFramebuffer(e.FRAMEBUFFER,r.fb),e.viewport(0,0,1,1),e.disable(e.BLEND),t==="plain"||t==="tube3"){e.drawBuffers(hl),t==="tube3"&&(le||(le=hs(e)),le.fbo||(le.ensure(1,1),e.bindFramebuffer(e.FRAMEBUFFER,r.fb),e.drawBuffers(hl)));let n=m.on?performance.now():0,a=t==="plain"?[[Bn,Ne],[wr,r.va]]:we?[[we.plain,Ne],[we.plainCell,r.va],[we.comp,Ne],[we.compCell,r.va]]:[];for(let[i,o]of a)e.useProgram(i.p),Ha(i.u,!1,!1,!1,!1),e.bindVertexArray(o),o===Ne?e.drawArrays(e.TRIANGLE_STRIP,0,4):e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,1);e.bindVertexArray(null),e.drawBuffers(Fa),m.on&&m.gauge(t==="tube3"?"tube 3 warm-up":"plain warm-up",`${a.length} builds drawn at ${(performance.now()/1e3).toFixed(1)} s, ${(performance.now()-n).toFixed(1)} ms`)}e.bindFramebuffer(e.FRAMEBUFFER,F())}let Xh=()=>{for(let t in nt)return!0;return!1};function Gh(){if(!(N||!se.length&&!Ve.length&&!Xh())&&Of(kf)){for(let t of Object.keys(nt))me("veins: publish "+t,nf,t);for(let t of Ve.slice()){let r=!0;try{r=t.done()}catch(n){dr("veins-gl:3064",n)}if(r){Ve.splice(Ve.indexOf(t),1);try{me("veins: warm-up task",t.run.bind(t))}catch(n){console.warn("Veins renderer: a warm-up drawn over the figure failed.",n)}}}if(e.bindFramebuffer(e.FRAMEBUFFER,F()),!!se.length){for(let t of[...se])Dn(t).every(n=>e.getProgramParameter(n.p,Mn.COMPLETION_STATUS_KHR))&&(se.splice(se.indexOf(t),1),t==="heads"?me("veins: finish heads",Bs):t==="plain"?(me("veins: finish plain",Ds),wr&&me("veins: warm plain",sf,"plain")):t==="tube"?(me("veins: finish tube",ua),Gt?K=!1:vi("the Tube vessel shaders failed")):t==="tube2"?(me("veins: finish tube 2",wo),zr&&(K=!1,Cl())):t==="tube3"&&(me("veins: finish tube 3",bo),we&&(K=!1,Cl(),Ve.push(Os))));se.length||Hr()}}}if(vo&&xo("lay"),mt&&gn){let t=Gf(e);t&&Ve.push(t)}let lf=t=>{t.preventDefault(),N=!0,un.stale(),l.reset()},ff=()=>l.reset();(z||s).addEventListener("webglcontextlost",lf),(z||s).addEventListener("webglcontextrestored",ff);let Vh=kc(e);function Wh(t,r,n,a){if(!t)return"";let i=I(),o=L(),f=Math.abs(n[0])+Math.abs(n[2]),h=Math.abs(n[1])+Math.abs(n[3]),c=0,u=0;for(let w=0;w<r;w++){let d=n[0]*t[w*6]+n[2]*t[w*6+1]+n[4],v=n[1]*t[w*6]+n[3]*t[w*6+1]+n[5],b=Math.min(d,d+n[0]*a,d+n[2]*a,d+(n[0]+n[2])*a),g=Math.min(v,v+n[1]*a,v+n[3]*a,v+(n[1]+n[3])*a),y=Math.min(i,b+f*a)-Math.max(0,b),S=Math.min(o,g+h*a)-Math.max(0,g);y>0&&S>0&&(c+=y*S,u++)}return`${u} of ${r}, ${(c/1e6).toFixed(1)} MP of ${(i*o/1e6).toFixed(1)}, ${Math.round(f*a)} px each`}let yt={morph:null},cf=null,Ye=null,hf=()=>({entTex:Jt,bloodVAO:en,bloodBuf:jn,nBlood:We,bloodCell:Yt,bloodCPU:kr,cellsCPU:Me,entCPU:ct,nCells:te,cellBox:Or,rowCells:Dt,patchMark:Bt,patchK:gt,morph:yt.morph});function Hh(t){({entTex:Jt,bloodVAO:en,bloodBuf:jn,nBlood:We,bloodCell:Yt,bloodCPU:kr,cellsCPU:Me,entCPU:ct,nCells:te,cellBox:Or,rowCells:Dt,patchMark:Bt,patchK:gt}=t),yt.morph=t.morph,Le++,K=!1,bt=!0}function hr(t){(t||null)===Ye||N||(Ye?Object.assign(Ye,hf()):cf=hf(),Hh(t||cf),Ye=t||null)}let ut=new Set;function uf(t){Ye===t&&hr(null),!(!ut.delete(t)||N)&&(e.deleteTexture(t.entTex),t.derived?.pj&&e.deleteTexture(t.derived.pj),E.B===t.derived&&(E.B=null),e.deleteBuffer(t.bloodBuf),e.deleteVertexArray(t.bloodVAO))}let It={get lost(){return N},tubeStage(){return Ot.drew},software:Vh,makeMorphSet(t){if(N)return null;let r=Ye,n=Le,a=K,i=bt;hr(null);let o=e.createBuffer(),f=e.createVertexArray();Js(f,o);let h={owner:It,entTex:ne(e),bloodVAO:f,bloodBuf:o,nBlood:0,bloodCell:16,bloodCPU:null,cellsCPU:null,entCPU:null,nCells:0,cellBox:null,rowCells:null,patchMark:null,patchK:0,morph:{posBase:t.posBase,joinBase:t.joinBase,entRows:t.entRows,rows:t.rows,tight:!!t.tight,nJoins:t.nJoins|0,joins:null,rowBox:t.rowBox||null}};return ut.add(h),hr(h),e.bindTexture(e.TEXTURE_2D,Jt),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,2048,t.rows,0,e.RGBA,e.FLOAT,t.ent),m.on&&m.note("uploaded: morph set",t.ent.byteLength/1024),Me=t.cells,ct=t.ent,te=t.nCells,Or=qc(t.cells,t.nCells,16),No(t),hr(r),Le=n,K=a,bt=i,h},prepareMorphSet(t){t&&t.owner===It&&ut.has(t)&&Ei(t)},prepareMorphStep(t,r){return t&&t.owner===It&&ut.has(t)?Pl(t,r)|0:0},morphSetReady(t){return!!t&&t.owner===It&&ut.has(t)&&!!t.entCPU&&t.prepared!==void 0&&t.prepared===Na()},useMorphSet(t){t&&!(t.owner===It&&ut.has(t))||(t&&t.prepared!==Na()&&Ei(t),hr(t))},dropMorphSet(t){t&&uf(t)},setMorphFrame(t){let r=yt.morph;if(!r||N)return;let n=Ye;if(n&&n.sent&&n.sent.length===t.length){let a=!0;for(let i=0,o=t.length;i<o;i++)if(n.sent[i]!==t[i]){a=!1;break}if(a)return}if(n&&(n.sent&&n.sent.length===t.length?n.sent:n.sent=new Float32Array(t.length)).set(t),e.bindTexture(e.TEXTURE_2D,Jt),e.texSubImage2D(e.TEXTURE_2D,0,0,r.entRows,2048,r.rows-r.entRows,e.RGBA,e.FLOAT,t),r.nJoins>0){let a=r.joins||(r.joins={on:new Uint8Array(r.nJoins),ver:0}),i=(r.joinBase-r.entRows*2048)*4,o=!1;for(let f=0;f<r.nJoins;f++){let h=t[i+f*4+2]>=0?1:0;a.on[f]!==h&&(a.on[f]=h,o=!0)}o&&a.ver++}m.on&&m.note("uploaded: morph frame",t.byteLength/1024),Le++,K=!1,bt=!0},setGeometry(t){Le++,hr(null),A0(Jt,e.RGBA32F,e.RGBA,e.FLOAT,2048,t.rows||1,t.ent.length?t.ent:T0||=new Float32Array(2048*4)),Me=t.cells,ct=t.ent,te=t.nCells,Or=qc(t.cells,t.nCells,16),No(t),Me=t.cells,ct=t.ent,Dt=null,K=!1,bt=!0,Bt=null,gt=0,Ia.dirty=!0},patchGeometry(t){Le++,hr(null),e.bindTexture(e.TEXTURE_2D,Jt);for(let[r,n]of t.patch)e.texSubImage2D(e.TEXTURE_2D,0,0,r,2048,n-r+1,e.RGBA,e.FLOAT,t.ent,r*2048*4);if(Ia.dirty=!0,t.patchTubes&&t.cells===Me&&t.ent===ct){for(let r of t.patchTubes)ar.add(r),Pe[r]=1;if(t.patchCells?.length){Bt||=new Uint8Array(te);for(let r of t.patchCells)Bt[r]||(Bt[r]=1,gt++);Dt=null}if(t.patchBlood&&No(t),t.patchJoinEnts?.length){gt+=Yf(Me,te,t.patchJoinEnts,Bt||=new Uint8Array(te)).k;for(let r of t.patchRows||sa)r>=0&&r<p&&(Pe[r]=1)}}else K=!1,bt=!0},setRadii(t,r,n=null){if(Le++,!(t>=0&&t<p))return;let a=n,i=-1/0,o=t*G*4;for(let f=0;f<G;f++){let h=Math.min(G-1,f+1);$n[o+f*4]=r[f],$n[o+f*4+1]=r[h],$n[o+f*4+2]=a?a[f]:-1,$n[o+f*4+3]=a?a[h]:-1,r[f]>i&&(i=r[f])}al[t]=i,Us[t]=i,t<_t&&(_t=t),t>Yn&&(Yn=t),ar.add(t),Pe[t]=1},setBend(t,r){let n=Math.min(r?.length||0,G);if(t>=0&&t<p&&n>=2){let f=t*G*2,h=!Ea[t];for(let c=0;c<G;c++){let u=r[Math.min(c,n-1)],w=+u[0]||0,d=+u[1]||0;(Wn[f+c*2]!==w||Wn[f+c*2+1]!==d)&&(Wn[f+c*2]=w,Wn[f+c*2+1]=d,h=!0)}Ea[t]||(Ea[t]=1,rl++),h&&(t<Ft&&(Ft=t),t>Sr&&(Sr=t))}e0(r,Zo);let a=t*G,i=t>=0&&t<p,o=i;for(let f=0;o&&f<G;f++)ol[f]!==il[a+f]&&(o=!1);o||(i&&il.set(ol,a),m.on&&m.note("uploaded: setBend",G*4/1024),Le++,Pe[t]=1,e.bindTexture(e.TEXTURE_2D,an),e.texSubImage2D(e.TEXTURE_2D,0,0,t,G,1,e.RED,e.FLOAT,Zo))},setTubes(t){if(Le++,ra=!0,ni(t,At,ir),E.tv++,t.length<p*ir){At.set(t),e.bindTexture(e.TEXTURE_2D,nn),e.texSubImage2D(e.TEXTURE_2D,0,0,0,ao,p,e.RGBA,e.FLOAT,t);return}let r=no(t,At,ir,p,ri);if(!r){m.on&&m.note(he.tubesSame);return}m.on&&m.note("uploaded: setTubes rows",(r[1]-r[0]+1)*ir*4/1024),e.bindTexture(e.TEXTURE_2D,nn),e.texSubImage2D(e.TEXTURE_2D,0,0,r[0],ao,r[1]-r[0]+1,e.RGBA,e.FLOAT,t,r[0]*ir)},paintOrgans(t,r,n){let a=Math.max(1,Math.round(r[2]*n)),i=Math.max(1,Math.round(r[3]*n)),o=Zi(e,e.FRAMEBUFFER_BINDING),f=Zi(e,e.VIEWPORT),h=jf(e),c=e.createFramebuffer(),u=e.createRenderbuffer(),w=Qh;try{it++,e.bindTexture(e.TEXTURE_2D,Vn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,a,i,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindRenderbuffer(e.RENDERBUFFER,u),e.renderbufferStorage(e.RENDERBUFFER,e.STENCIL_INDEX8,a,i),e.bindFramebuffer(e.FRAMEBUFFER,c),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Vn,0),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.STENCIL_ATTACHMENT,e.RENDERBUFFER,u),e.viewport(0,0,a,i),e.disable(e.SCISSOR_TEST),e.disable(e.DEPTH_TEST),e.disable(e.CULL_FACE),e.clearBufferfv(e.COLOR,0,[0,0,0,0]),e.clearBufferfi(e.DEPTH_STENCIL,0,1,0);let d=[n,0,0,-n,-r[0]*n,i+r[1]*n],v=Math.min(.5,.2/n),b=[!0,!0,!0,!0];for(let{d:g,circle:y,w:S}of t){let j=y?Pf(y[0],y[1],y[2],y[2]):Nf(g,v);Cf(j,S?1:0,null,w),S?h.stroke(w,d,[a,i],b,S):h.fill(w,d,[a,i],b),h.release(w)}Ma=r,K=!1}finally{h.release(w),h.dispose(),e.bindFramebuffer(e.FRAMEBUFFER,o),e.viewport(f[0],f[1],f[2],f[3]),e.deleteFramebuffer(c),e.deleteRenderbuffer(u)}},plateJob(t,r){let n=ne(e,e.LINEAR);return e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t,r,0,e.RGBA,e.UNSIGNED_BYTE,null),{tex:n,W:t}},plateRows(t,r,n,a){e.bindTexture(e.TEXTURE_2D,t.tex),e.texSubImage2D(e.TEXTURE_2D,0,0,r,t.W,n,e.RGBA,e.UNSIGNED_BYTE,a)},setPlate(t,r,n){oe[t]&&e.deleteTexture(oe[t].tex),oe[t]={tex:r.tex,rect:n},it++,V?.drop(t),Un()},dropJob(t){e.deleteTexture(t.tex)},setFluidSpans(t,r){it++;let n=t.length,a=Yo?.length===n*2?Yo:Yo=new Float32Array(n*2);a.fill(-1e4),a.set(t),Ko?.length===n&&a.set(Ko,n),e.bindTexture(e.TEXTURE_2D,xa),ga===n&&tl===n?(e.texSubImage2D(e.TEXTURE_2D,0,0,0,n,2,e.RED,e.FLOAT,a),_r.sub++):(e.texImage2D(e.TEXTURE_2D,0,e.R32F,n,2,0,e.RED,e.FLOAT,a),tl=n),rn=r,ga=n},setFluidLiver(t){it++,Ko=t,ga===t.length&&(e.bindTexture(e.TEXTURE_2D,xa),e.texSubImage2D(e.TEXTURE_2D,0,0,1,ga,1,e.RED,e.FLOAT,t))},fluidPool(t){if(!rn)return!1;let[r,n,a,i]=rn;tn.reset();for(let o=Math.max(n,t)-16;o<n+i+16;o+=16)for(let f=r-16;f<r+a+16;f+=16)tn.push(f,o);return qo=tn.send(Wo),qt[0]=r-16,qt[1]=Math.max(n,t)-16,qt[2]=r+a+32,qt[3]=n+i+32,!0},keptStats:()=>({..._r}),setFluidCells(t){Le++,Zs(Go,t),wt=t.length/2;{let r=1/0,n=1/0,a=-1/0,i=-1/0;for(let o=0;o+1<t.length;o+=2){let f=t[o],h=t[o+1];f<r&&(r=f),h<n&&(n=h),f>a&&(a=f),h>i&&(i=h)}He[0]=r,He[1]=n,He[2]=a+16,He[3]=i+16}},dropPlate(t){it++,oe[t]&&(e.deleteTexture(oe[t].tex),oe[t]=null),V?.drop(t),Un()},hasPlate:t=>!!oe[t]||!!V?.has(t),organs:V&&{stage(t,r,n,a,i=0){V.stage(t,r,n.tex,a,i)},bake:(t,r,n,a,i,o=0)=>V.bake(t,r,n,a,i,o),dropKept:()=>V.dropKept(),growBytes:(t,r)=>V.painter?.growBytes?.(t,r)??0,stats:()=>V.stats(),liveLayers:()=>V.liveLayers(),commit(t,r){it++,oe[t]&&(e.deleteTexture(oe[t].tex),oe[t]=null),V.commit(t,r),Un()},dropStaged:t=>V.dropStaged(t),has:t=>V.has(t),pictured:t=>V.pictured(t),get full(){return V.full},get fading(){return V.fading},get canLive(){return V.canLive},setLive(t,r){it++;let n=V.setLive(t,r);return Un(),n},setLiveAll(t){it++;let r=V.setLiveAll(t);return Un(),r},setOrder:t=>(it++,V.setOrder(t)),shift:(t,r)=>{let n=V.shift(t,r);return n&&it++,n}},setHeadRuns(t){let r=Math.min(t.length,Hn.length);for(let n=0;n<r;n++)Hn[n]!==t[n]&&(Hn[n]=t[n],zn=!0,Pe[n>>2]=1)},setFlow(t){let r=Xt*4;for(let i=0;i<p;i++)ya[i]=t[i*r+6]>0||t[i*r+8]<0?1:0;let n=0,a=p-1;if(!qn)qn=Float32Array.from(t.subarray(0,p*r)),bt=!0;else{ni(t,qn,r);let i=no(t,qn,r,p,ri);if(!i){m.on&&m.note(he.flowSame);return}n=i[0],a=i[1]}m.on&&m.note("uploaded: setFlow",(a-n+1)*r*4/1024),e.bindTexture(e.TEXTURE_2D,ln),e.texSubImage2D(e.TEXTURE_2D,0,0,n,Xt,a-n+1,e.RGBA,e.FLOAT,t,n*r)},setDye(t){if(Le++,Br=!!t,!t)return;let r=0,n=p-1;if(Jn){ni(t,Jn,Ct);let a=no(t,Jn,Ct,p,ri);if(!a)return;r=a[0],n=a[1]}else Jn=new Float32Array(Ct*p),bt=!0;for(let a=0,i=Math.min(Ct*p,t.length);a<i;a++)Jn[a]=t[a];e.bindTexture(e.TEXTURE_2D,Kn),e.texSubImage2D(e.TEXTURE_2D,0,0,r,Ct,n-r+1,e.RED,e.FLOAT,t,r*Ct)},draw(t,r,n,a=null){if(me("veins: radii upload",Ta),jt.draw++,!ah())return;for(let v=0;v<6;v++)Da[v]=t[v];mr=Da,t=ci(t,wl),(Qn!==I()||Zn!==L())&&(K=!1);let i=kh();ea=i>0,ea!==Qt&&(K=!1,ea||Hi(!1));let o=I0(r),f=ee?t[4]-ee[4]:0,h=ee?t[5]-ee[5]:0,c=null,u=(Mt[0]||Math.abs(f)<M/2)&&(Mt[1]||Math.abs(h)<U/2);Ye&&K&&(f||h||ra||ar.size||gt||a?.length)&&(K=!1);let w=K&&Ua(a)&&o&&u&&Ba(t,ee);if(w&&(a?.length||gt)&&Ca()){let{part:v,tintPart:b}=Sl(a||sa),g=v.k;for(let y=0;y<te;y++)b.mark[y]&&!v.mark[y]&&(v.mark[y]=1,g++);g<=te*.6&&(bi.mark=v.mark,bi.k=g,c=bi)}let d=w&&(!(ra||ar.size||gt)||c);d||oa(jt.why,K?Ua(a)?o?u?Ba(t,ee)?"tubes changed":"zoom or turn":"moved too far":"look changed":"radii changed":"no kept layer"),m.on&&(d?m.note(he.pan):(m.note(he.whole),m.note(he.wholeBy+Be()),m.note(he.wholeWhy+(K?Ua(a)?o?u?Ba(t,ee)?"tubes changed":"zoom or turn":"moved too far":"look changed":"radii changed":"no kept layer")))),d?(nr.m=t,nr.look=r,nr.dx=f,nr.dy=h,me("veins: shift layer",V0),c&&(c.k&&me("veins: cells pass",Ml,t,r,c.mark),fi+=c.k)):(me("veins: lay out",H0,X0(t)),e.bindFramebuffer(e.FRAMEBUFFER,Dr),e.viewport(0,0,M,U),me("veins: clear layer",dl),ea?me("veins: lowered draw",Ih,t,r,i):(Ur=t,Lr=r,er=0,me("veins: pieces",W0))),F0(t),N0(),ra=!1,Tl(),Rl(),K=!0,e.bindFramebuffer(e.FRAMEBUFFER,F()),me("veins: composite",G0,this,r,n)},drawRows(t,r,n,a,i=!1){Ta();for(let u=0;u<6;u++)Da[u]=t[u];if(mr=Da,t=ci(t,wl),!K||!ee)return or("no kept layer");if(Ye)return or("switch piece");if(N)return or("context lost");if(Qn!==I()||Zn!==L())return or("size changed");if(!Ba(t,ee)||t[4]!==ee[4]||t[5]!==ee[5])return or("moved");if(!Ua(a))return or("radii not listed");if(!ka()||!Ca())return or("mesh renderer");let{part:o,tintPart:f}=Sl(a),h=o.mark,c=o.k;for(let u=0;u<te;u++)f.mark[u]&&!h[u]&&(h[u]=1,c++);return c>te*.6?or("most cells"):(wi="drawn",ra=!1,Tl(),m.on&&m.note(he.rows),me("veins: rows cells pass",Ml,t,r,h),fi+=c,Rl(),c&&me("veins: rows cell list",J0,h),this.composite(r,n,i,c),!0)},setRest(t,r){Vr=+t||0,Wr=+r||0},setPicture(t,r=!1){let n=!!(t&&t[0]>0&&t[1]>0&&(t[0]!==s.width||t[1]!==s.height));n===!!H&&(!n||t[0]===H[0]&&t[1]===H[1])&&!!r===ho||N||(n?(co[0]=t[0],co[1]=t[1],H=co):H=null,ho=!!r,H&&xo("up"),H||(Vr=0,Wr=0),H&&!x&&(x=jl()),!H&&x&&!mt&&(e.deleteTexture(x.tex),e.deleteFramebuffer(x.fbo),x=null),K=!1)},top:mt?{gl:e,canvas:s,screen:F,lay(t,r,n,a,i,o,f,h=1){N||Uh(t,r,n,a,i,o,f,h)},present:()=>sr(!0,!0),ask:mh,add(t){if(t.solo&&Nr===null&&!N)try{Nr=pe(e,de(e,pr,Cc))}catch{Nr=!1}return ie.push(t),ie.sort((r,n)=>(r.order||0)-(n.order||0)),Fn++,()=>{let r=ie.indexOf(t);r>=0&&(ie.splice(r,1),Fn++)}},under(t){return Ae=t,xo("lay"),()=>{Ae===t&&(Ae=null)}},keep(t){return Sn=t,Ee.on=!1,_n?.start(),()=>{Sn===t&&(Sn=null,Ee.on=!1)}},replace(t){return Oe=t,()=>{Oe===t&&(Oe=null)}},get presents(){return Ke},get clipped(){return!!ue?.clipped||Ii},get kept(){return Ee.on},warmIn(t){t&&!N&&Ve.push(t)},whole(t){t()}}:null,overlay:vo?{set(t,r){!be&&t?.size&&!N&&(be=rs(e,{painter:V.painter})),be&&(be.setOrder(r),be.setLive(t&&t.size?t:null,null),Vt=!!t?.size)},touch(){be?.touch()},set cssPx(t){uo=t},set snap(t){Fs=!!t},get stale(){return!Vt||!mr||!x?.w?!1:(V.painter.cssPx=uo*I()/s.width,be.stale(Ql(),I(),L()))},get shown(){return Vt}}:null,picSize(){return[I(),L()]},setMorphLow(t){t=!!t,t!==ii&&(ii=t,!t&&Qt&&(K=!1,Le++))},get lowKept(){return Qt},get rowsStatus(){return wi},get partCells(){return fi},get tintCells(){return L0},get layerLayout(){return{size:[M,U],at:[...Y],wrap:[...Te],follows:[...Mt]}},get nCells(){return te},composite(t,r=Gc,n=!1,a=0){if(Ta(),Fi=t,ja=r,!ee||Qn!==I()||Zn!==L())return;if(Gh(),m.on&&m.gauge("shaders still compiling",se.length?se.join(", "):"none"),m.skipGL){Fo=!0;return}Fo&&(Fo=!1,n=!0);let i=!!r.bleed?.length;(i||ll)&&(n=!0);let o=ee,f=o[0]!==yr[0]||o[1]!==yr[1]||o[2]!==yr[2]||o[3]!==yr[3]||o[4]!==yr[4]||o[5]!==yr[5];(f||I()!==Xs||L()!==Gs)&&Tr++;for(let T=0;T<6;T++)yr[T]=o[T];Xs=I(),Gs=L();let h=null;if(J&&!f&&Yr&&!J.whole){let T=pl(o,M0);if(T){let X=B0;X[0]=Math.min(T[0],Yr[0]),X[1]=Math.min(T[1],Yr[1]),X[2]=Math.max(T[2],Yr[2]),X[3]=Math.max(T[3],Yr[3]),(X[2]-X[0])*(X[3]-X[1])<=I()*L()/2&&(h=X)}}(J&&!h||ks&&!J)&&(n=!0),ks=!!J;let c=b0(),u=w0(),w=c&&(!J||!!h)&&!f;w?(gr[0]!==kn||Tr!==Vs)&&(m.time(e,"outline layer",c0),kn=gr[0],Vs=Tr,n=!0):c?f&&(kn=-1,n=!0):(Zr(Rr),kn=-1),u?(gr[1]!==In||Tr!==Ws)&&(m.time(e,"glow layer",h0),In=gr[1],Ws=Tr,n=!0):(Zr(Jr),In=-1);let d=v0();d?(gr[2]!==Nn||Tr!==Hs)&&(m.time(e,"warm layer",u0),Nn=gr[2],Hs=Tr,n=!0):(Zr(Qr),Nn=-1),js&&!Ie&&(n=!0),js=!!Ie,ll=i;let v=t.plate&&t.plate.alpha>0?t.plate:null,b=!!(v?.stack&&V?.has(0));f0(o,!v&&!!t.plate?.stack&&!!V?.has(0));let g=0;if(b&&V.stale(o,I(),L())){m.on&&m.note(he.organs),Ys=o;let T=m.time(e,"organ layers",l0);T===!0?n=!0:T&&(E0(T,o),g=Qs,m.on&&m.gauge("organ layers: box",`${T[2]-T[0]}\xD7${T[3]-T[1]} px, ${g} cells`))}x&&hh()&&(n=!0);let y=A!=="lobule"&&!Ri&&!!x&&n&&!H&&!ht()&&!(Ae&&Ae.on())&&!(Oe&&Oe.on());Xl=n?Xl+1:0,x&&Ir&&!n&&(n=!0),n&&(g=0);let S=t.fluid&&rn?t.fluid:null,j=n?0:qo;if(qo=0,!n&&!te&&!(S?.ripple&&wt)&&!j&&!g&&!J)return;m.on&&(n&&m.note("whole picture"),t.plate||m.note("organ picture down")),jt.composite++,n&&jt.whole++,m.on&&(m.note(he.picture),n&&m.note(he.pictureWhole));let ce=o[0]*o[3]-o[1]*o[2]||1e-9,De=o[3]/ce,dt=-o[1]/ce,Nt=-o[2]/ce,Pt=o[0]/ce,zi=-(De*o[4]+Nt*o[5]),Rt=-(dt*o[4]+Pt*o[5]);x&&e.bindFramebuffer(e.FRAMEBUFFER,y?null:x.fbo),Ut=y,x&&(Ir=y),y&&(Gl=xn(),_i=Si=-1),e.viewport(0,0,I(),L()),e.disable(e.BLEND);let Xe=P0(r),za=()=>e.bindFramebuffer(e.FRAMEBUFFER,x?y?null:x.fbo:F()),et=!!we&&ka()&&Ot.stage()===3,Pr=et?we.plain:Bn,pf=et?we.comp:po,$a=n?Xe?Pr:pf:Xe?et?we.plainCell:wr:et?we.compCell:mo,Cr=h?Xe?Pr:pf:null;m.on&&m.gauge("composite build",`${et?"tube ":""}${Xe?"plain":"full"}`);let na=r.bleed||sa,mf=tt.be.fill(0),wf=tt.bb.fill(0);for(let T=0;T<Math.min(24,na.length);T++)for(let X=0;X<4;X++)mf[T*4+X]=na[T][X],wf[T*4+X]=na[T][4+X];let bf=r.noChev||sa,$i=Math.min(12,bf.length),Yi=tt.ncv.fill(0);for(let T=0;T<$i;T++)Yi.set(bf[T],T*4);let vf=r.holes||sa,Ki=Math.min(16,vf.length),qi=tt.hb.fill(0),Ji=tt.hr.fill(0);for(let T=0;T<Ki;T++){let X=vf[T];for(let _=0;_<4;_++)qi[T*4+_]=X[_]??0;Ji[T]=X[4]||0}let xf=v&&!b?(oe[0]?1:0)|(oe[1]?2:0):0,ge=t.map&&t.map.a>0?t.map:null,jr=!1;br&&r.chev&&!i&&rl>0&&(sn.update(Ea,ya,At,ir,qn,Xt*4,Hn)&&(e.bindBuffer(e.ARRAY_BUFFER,Jo),e.bufferData(e.ARRAY_BUFFER,sn.data(),e.DYNAMIC_DRAW,0,sn.count()*3)),jr=sn.count()>0),qr.length=0,Cr&&Cr!==$a&&qr.push(Cr),jr&&qr.push(br),qr.push($a);for(let T=0;T<qr.length;T++){let X=qr[T];e.useProgram(X.p);let _=X.u;n||(l.m3(_.world,Xr(tt.world,o[0],o[1],o[2],o[3],o[4],o[5])),l.f2(_.size,I(),L()),l.f1(_.cell,16)),l.m3(_.inv,Xr(tt.inv,De,dt,Nt,Pt,zi,Rt)),l.f1(_.H,L()),l.f1(_.pxW,1/Math.max(1e-6,Math.hypot(o[0],o[1]))),l.i1(_.plates,xf),l.f1(_.plateAlpha,v?.alpha??0),l.f1(_.plateSat,v?.sat??1),l.f4a(_.plateRect0,oe[0]?.rect||En),l.f4a(_.plateRect1,oe[1]?.rect||En),l.f4a(_.fluidRect,rn||En),l.f4a(_.fluidS,S?.s||oo),l.f4a(_.fluidInk,S?S.ink:oo),l.f2a(_.fluidLv,S?.lv||Wc),l.i1(_.blood,r.on?1:0),l.i1(_.chev,r.chev?1:0),l.i1(_.chevQuad,jr?1:0),l.i1(_.still,r.still?1:0),l.f1(_.flowA,r.alpha??1),l.f2(_.blendA,r.chevA??1,r.originA??1),l.f3a(_.chevInk,r.chevInk||Hc),l.f3a(_.chevLight,r.chevLight||zc),l.f1(_.cssPx,r.vdpr||1),l.i1(_.origin,r.origin?1:0),l.i1(_.dyeOn,Br&&r.dye!==!1?1:0),l.f1(_.clock,r.clock||0),l.f1(_.bT,r.bt||0),l.f1(_.rows,p),l.fv3(_.originCol,ms(r.originCol||ws)),l.f3a(_.dyeCol,r.dyeCol||bs),l.f3a(_.revCol,r.revCol||vs),l.f3a(_.inkLight,r.inkLight||xs),l.f3a(_.inkDark,r.inkDark||gs),l.fv4(_.bleedE,mf),l.fv4(_.bleedB,wf),l.i1(_.bleedN,Math.min(24,na.length)),l.fv4(_.noChev,Yi),l.i1(_.noChevN,$i),l.fv4(_.chevHole,qi),l.fv1(_.chevHoleR,Ji),l.i1(_.chevHoleN,Ki),l.f1(_.mapA,ge?ge.a:0),ge&&(l.f4a(_.mapDot,ge.dot),l.fv4(_.mapZone,ge.zone),l.f4a(_.mapFx,ge.fx),l.f4a(_.mapAlt,ge.alt),l.f2a(_.mapFxX,ge.fxX),l.f4a(_.mapRot,ge.rot))}let ur=$a.u;C=0,re(o),W[C++]=+I()||0,W[C++]=+L()||0,W[C++]=+xf||0,W[C++]=+(v?.alpha??0)||0,W[C++]=+(v?.sat??1)||0,re(oe[0]?.rect||En),re(oe[1]?.rect||En),re(rn||En);let Yh=C+3;re(S?.s||oo),re(S?S.ink:oo),re(S?.lv||Wc),W[C++]=+r.on||0,W[C++]=+r.chev||0,W[C++]=+r.still||0,W[C++]=+(r.alpha??1)||0,W[C++]=+(r.chevA??1)||0,W[C++]=+(r.originA??1)||0,re(r.chevInk||Hc),re(r.chevLight||zc),W[C++]=+(r.vdpr||1)||0,W[C++]=+r.origin||0,W[C++]=+(Br&&r.dye!==!1)||0,re(ms(r.originCol||ws)),re(r.dyeCol||bs),re(r.revCol||vs),re(r.inkLight||xs),re(r.inkDark||gs),re(Yi),W[C++]=+$i||0,re(qi),re(Ji),W[C++]=+Ki||0,W[C++]=+w||0,W[C++]=+u||0,W[C++]=+d||0,W[C++]=+b||0,W[C++]=+Xe||0,W[C++]=+it||0,W[C++]=et?1:0,W[C++]=jr?1:0,W[C++]=ge?ge.a:0,ge&&(re(ge.dot),re(ge.zone),re(ge.fx),re(ge.alt),re(ge.fxX),re(ge.rot));let gf=r.bt||0;if(gf!==sl&&(r.on||r.chev||r.origin))for(let T=0;T<p;T++)ya[T]&&(Pe[T]=1);if(sl=gf,m.on){let T=0,X=0;for(let _=0;_<p;_++)ya[_]&&T++,Pe[_]&&X++;m.gauge("rows carrying blood",`${T} of ${p} carry blood, ${X} marked moved this frame`)}let vn=!!Mr&&C===ti&&C<W.length;for(let T=0;vn&&T<C;T++)W[T]!==Mr[T]&&(vn=!1);let Ya=vn;if(!vn&&S?.ripple&&wt&&Mr&&C===ti&&C<W.length){Ya=!0;for(let T=0;Ya&&T<C;T++)T!==Yh&&W[T]!==Mr[T]&&(Ya=!1)}let Ka=!n&&!bt&&!na.length&&vn;if(Ka&&!a&&!g&&!j&&!(S?.ripple&&wt)&&!J&&Le===So&&!Pe.includes(1))return x&&e.bindFramebuffer(e.FRAMEBUFFER,F()),m.on&&m.note(he.pictureSkipped),!1;let Af=Le!==So;So=Le;let Qi=!!(S?.ripple&&wt),qa=!n&&!a&&!g&&!j&&!J&&Xe&&!Af&&(Qi?Ya&&He[2]>He[0]:vn),Kh=ba;if(Bo(qa),m.on&&m.gauge("picture counted as",qa?Qi?"the blood's, with the ripple's band":"the blood's":`a new picture: ${n?"drawn whole":a?"rows drawn again":Af?"geometry or tubes changed":g||j||J?"organ box, pool or catheter":Xe?"uniforms changed":"dye, origin colours or a bleed"}`),qa)o0(at,H||ht()?null:kr,We,o,Yt,Qi?He:null),(H||ht())&&(ba=!1);else{let T=!!(Ae&&Ae.on()),X=T&&Ae.ver?Ae.ver():NaN,_=T&&X!==Ps;Ps=X,a0(Kh,o,n,H||ht()||_||!!(Oe&&Oe.on()),a,g,j,!!(S?.ripple&&wt),h)}if(Ka){let T=!1;for(let X=0;X<p;X++)ei[X*4]!==Pe[X]&&(ei[X*4]=Pe[X],T=!0);T&&(e.bindTexture(e.TEXTURE_2D,ln),e.texSubImage2D(e.TEXTURE_2D,0,Xt,0,1,p,e.RGBA,e.FLOAT,ei))}et&&(r.on||Br&&r.dye!==!1||r.origin)&&(ke("before lumen pass"),ds("veins: lumen layer",m.time.bind(m),e,"lumen layer",()=>Ch(o,t,r)),ke(A==="lobule"?"lobule lumen pass":"lumen pass"),Sf(A==="lobule",Ph),za(),e.viewport(0,0,I(),L()),e.useProgram($a.p),m.on&&m.gauge(A==="lobule"?"lobule vessel renderer":"vessel renderer",Ot.gaugeText())),n&&x&&ae(e.FRAMEBUFFER,y);let Ef=Ka&&!(jr&&(a||g||j||S?.ripple&&wt||h));l.i1(ur.stillOn,Ef?1:0),m.on&&m.gauge("still lumens left alone",Ka?`${p-Pe.reduce((T,X)=>T+X,0)} of ${p} rows`:"off"),Ha(ur,w,u,d,b),n?(l.i1(ur.bloodOnly,0),m.on&&m.gauge("blood squares on screen","whole picture"),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4)):(m.on&&m.gauge("blood squares on screen",Wh(kr,We,o,Yt)),l.i1(ur.bloodOnly,0),a&&jo&&(e.bindVertexArray(Po),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,jo)),l.i1(ur.bloodOnly,1),We&&(e.bindVertexArray(en),l.f1(ur.cell,Yt),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,We),l.f1(ur.cell,16)),l.i1(ur.bloodOnly,0),S?.ripple&&wt&&(e.bindVertexArray(Vo),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,wt)),j&&(e.bindVertexArray(Ho),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,j)),g&&(e.bindVertexArray($o),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,g))),e.bindVertexArray(null),ke(n?"whole picture":"blood pass"),jr&&(nl(o,w,u,d,b,Ef),ke("heads")),Mr||(Mr=new Float64Array(W.length));for(let T=0;T<C;T++)Mr[T]=W[T];ti=C,Pe.fill(0),bt=!1,h?(m.on&&m.gauge("catheter box",`${h[2]-h[0]}\xD7${h[3]-h[1]} px`),e.enable(e.SCISSOR_TEST),e.scissor(h[0],L()-h[3],h[2]-h[0],h[3]-h[1]),e.useProgram(Cr.p),Ha(Cr.u,!1,u,d,b),l.i1(Cr.u.stillOn,0),l.i1(Cr.u.bloodOnly,0),e.bindVertexArray(Ne),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),jr&&nl(o,!1,u,d,b,!1),m.time(e,"catheter",zs),c&&m.time(e,"outlines",$s),e.disable(e.SCISSOR_TEST)):J&&m.time(e,"catheter",zs),Yr=J?pl(o,D0):null,c&&!w&&m.time(e,"outlines",$s),x&&!(qa&&_n&&Dh(o))&&sr()},get canLines(){return!!Kr},setLines(t){let r=t&&(t.verts!==Ie?.verts||t.rev!==Ie?.rev);if(Ie=Kr&&t?.draws?.length?t:null,!!Ie){Wt[0]=Wt[1]=Wt[2]=0;for(let n of Ie.draws){let a=n.warm||n.under?2:n.soft?1:0,i=n.col;Ht(a,n.first),Ht(a,n.count),Ht(a,n.alpha),Ht(a,i.length);for(let o=0;o<i.length;o++)Ht(a,i[o]);Ht(a,n.tri?1:0),Ht(a,n.endFade?1:0),Ht(a,n.under?1:0)}for(let n=0;n<3;n++){let a=Wt[n]===Is[n];for(let i=0;a&&i<Wt[n];i++){let o=Ln[n][i],f=Ro[n][i];o!==f&&!(o!==o&&f!==f)&&(a=!1)}if(r||!a){let i=Ro[n];Ro[n]=Ln[n],Ln[n]=i,Is[n]=Wt[n],gr[n]++}}r&&(m.on&&m.note("uploaded: setLines",Ie.verts.byteLength/1024),e.bindBuffer(e.ARRAY_BUFFER,To),e.bufferData(e.ARRAY_BUFFER,Ie.verts,e.DYNAMIC_DRAW))}},setLayerScale(t){t=Math.min(1,Math.max(.1,+t||1)),t!==Pn&&(Pn=t,In=Nn=-1,t===1&&Se.tex&&!N&&(Se.w=Se.h=0,e.bindTexture(e.TEXTURE_2D,Se.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null)))},get canCath(){return!!$r},setCath(t){if(J=$r&&t?.draws?.length?t:null,!J)return;let r=J.base||null,n=r?r.byteLength:0,a=n+J.verts.byteLength;m.on&&m.note("uploaded: setCath",((r&&r!==ma?n:0)+J.verts.byteLength)/1024),e.bindBuffer(e.ARRAY_BUFFER,go),a>Eo&&(Eo=a*2,e.bufferData(e.ARRAY_BUFFER,Eo,e.DYNAMIC_DRAW),ma=null),r&&r!==ma&&e.bufferSubData(e.ARRAY_BUFFER,0,r),ma=r,J.verts.byteLength&&e.bufferSubData(e.ARRAY_BUFFER,n,J.verts)},setCamera(t,r,n,a=1){return this.setCameraRec(t,(1-t)*r,(1-t)*n,a)},setCameraRec(t,r,n,a=1){!(t>0)||!(a>=0)||(a=Math.min(1,a),t===1&&(r=n=0),!(Z.k===t&&Z.a===a&&Z.ex===r&&Z.ey===n)&&(Z.k=t,Z.a=a,Z.ex=r,Z.ey=n,Vi++,N||sr(!0,!0)))},setScene(t,r=0,n=0){t>0&&(Re.k===t&&(t===1||Re.ex===r&&Re.ey===n)||(Re.k=t,Re.ex=t===1?0:r,Re.ey=t===1?0:n,Vi++,Bo(),N||sr(!0,!0)))},get camera(){return Z},get camKey(){return ht()?-1:Vi},get target(){return D?(F(),D):null},get drawSeq(){return _e},get bloodSeq(){return at},bloodDirty:i0,bloodDirtyRects:(t,r,n,a)=>Ar.rects(t,r,n,a),pictureDirtyRects:(t,r,n,a)=>Mo.rects(t,r,n,a),get viewKey(){return ee?fl:""},onPicture(t){return _o.add(t),()=>_o.delete(t)},clear(){wh()},get screenShows(){return ue?ue.flushes:0},showNow(){ue&&!N&&ue.flush()},screenResized(){ue&&!N&&ue.resized()},snapshot(){if(O)return null;let t={...Z};Z.k=1,Z.ex=Z.ey=0,Z.a=1;try{sr(!1),ue?.flush();let r=s.toDataURL("image/png");return Object.assign(Z,t),(ie.length||ht())&&sr(),r}finally{Object.assign(Z,t)}},capture(){let t=xn();if(Et){let r=(Et&2)!==0;return Et=0,Xa(!0,r),Mi=t,Di=_e,Bi=at,Oi=Ke,ue?.flush(),s}return t===Mi&&Di===_e&&Bi===at&&Oi===Ke&&!(Oe&&Oe.on())?(ue?.flush(),s):(Xa(!0,!1),Mi=t,Di=_e,Bi=at,Oi=Ke,ue?.flush(),s)},present:sr,trim(){if(!N){for(let t of[Ce,fn,St])e.bindTexture(e.TEXTURE_2D,t),t===Ce?e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null):t===St?e.texImage2D(e.TEXTURE_2D,0,e.RG16UI,1,1,0,e.RG_INTEGER,e.UNSIGNED_SHORT,null):e.texImage2D(e.TEXTURE_2D,0,e.RGBA16UI,1,1,0,e.RGBA_INTEGER,e.UNSIGNED_SHORT,null);M=U=0,ee=null,K=!1,bl(),Hi(!1),Zr(Rr),Zr(Jr),Zr(Qr),kn=In=Nn=-1,D?.fbo&&(e.bindTexture(e.TEXTURE_2D,D.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),D.w=D.h=1,D.gen++,Ee.on=!1),V?.trim(),be?.trim(),x?.w&&(x.w=x.h=0,e.bindTexture(e.TEXTURE_2D,x.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null))}},dispose({lose:t=!1}={}){if(ph(),ue?.dispose(),Et=0,(z||s).removeEventListener("webglcontextlost",lf),(z||s).removeEventListener("webglcontextrestored",ff),!N){hr(null);for(let r of[...ut])uf(r);for(let r of[Jt,Gn,an,Aa,nn,Vn,ln,Kn,xa,Ce,fn,St,ai,Rr.tex,Jr.tex,Qr.tex,...oe.map(n=>n?.tex)])r&&e.deleteTexture(r);for(let r of[ot,jn,Co,Go,Wo,zo,go,To])e.deleteBuffer(r);for(let r of[en,Po,Vo,Ho,$o,Ne,Ao,yo,Qo])e.deleteVertexArray(r);e.deleteBuffer(Jo),on&&e.deleteTexture(on);for(let r of[po,mo,Bn,wr,br,$r,Kr,vr,On,Gt])r&&e.deleteProgram(r.p);for(let r of[E.tex,Ia.pj,E.scrN,E.scrT,...[...ut].map(n=>n.derived?.pj)])r&&e.deleteTexture(r);ta&&e.deleteRenderbuffer(ta),E.stage2?.dispose(),le?.dispose();for(let r of[E.patchVAO,E.layVAO,E.tubeVAO])r&&e.deleteVertexArray(r);for(let r of[E.rowBuf,E.patchBuf,E.tubeVB,E.tubeIB])r&&e.deleteBuffer(r);be?.dispose(),V?.dispose(),e.deleteFramebuffer(Dr),e.deleteFramebuffer(Rr.fbo),e.deleteFramebuffer(Jr.fbo),e.deleteFramebuffer(Qr.fbo),x&&(e.deleteTexture(x.tex),e.deleteFramebuffer(x.fbo));for(let r of[Ue,Ze])r&&e.deleteProgram(r.p);for(let r of Object.keys(nt)){e.deleteProgram(nt[r].p);for(let n of nt[r].sh)e.deleteShader(n);delete nt[r]}if(Ve.length=0,cr){for(let r of cr.tx)e.deleteTexture(r);e.deleteFramebuffer(cr.fb),e.deleteBuffer(cr.buf),e.deleteVertexArray(cr.va)}if(se.length){for(let r of se)for(let n of Dn(r))e.deleteProgram(n.p);se.length=0,Hr()}D?.fbo&&(e.deleteTexture(D.tex),e.deleteFramebuffer(D.fbo),D.fbo=D.tex=null,D.w=D.h=0),t&&!O&&e.getExtension("WEBGL_lose_context")?.loseContext()}oe[0]=oe[1]=null,Ie=J=null,te=We=wt=0,ee=null,M=U=0,N=!0}},zh={draw:"vessels",drawRows:"vessels",composite:"picture",setGeometry:"uploads",patchGeometry:"uploads",setRadii:"uploads",setBend:"uploads",setTubes:"uploads",paintOrgans:"picture",plateJob:"uploads",plateRows:"uploads",setPlate:"uploads",setFluidSpans:"uploads",setFluidCells:"uploads",setFlow:"uploads",setDye:"uploads"},df={setGeometry:t=>(t.ent.byteLength+t.cells.byteLength+(t.blood?.byteLength||0))/1024,setRadii:()=>G*8/1024,patchGeometry:t=>t.patch.reduce((r,[n,a])=>r+(a-n+1)*2048*16,0)/1024,setTubes:t=>t.byteLength/1024,setDye:t=>t?t.byteLength/1024:0,setFluidCells:t=>t.byteLength/1024,plateRows:(t,r,n,a)=>a.byteLength/1024};function $h(t,r,n,a,i){if(df[r]){let o=0;try{o=df[r](...i)}catch(f){dr("veins-gl:4099",f)}m.note(`uploaded: ${r}`,o)}return m.time(e,n,()=>a.apply(t,i))}for(let[t,r]of Object.entries(zh)){let n=It[t];It[t]=function(a,i,o,f,h){return m.on?$h(this,t,r,n,[a,i,o,f,h]):n.call(this,a,i,o,f,h)}}return It}export{wu as a,bu as b,Xt as c,ao as d,lo as e,la as f,As as g,Es as h,pt as i,fa as j,Jc as k,Ts as l,yn as m,Qc as n,ld as o,fd as p};
