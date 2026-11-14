import{b as i0,c as o0,d as hl}from"./chunk-5UEPXZJE.js";import{d as Z0,e as Q0}from"./chunk-R7OI7W7B.js";import{a as J0}from"./chunk-QAE6WHC3.js";import{b as s0,e as dl}from"./chunk-XY5RA4DS.js";import{f as a0}from"./chunk-QGVQH4SV.js";import{a as e0}from"./chunk-OQFC5IMW.js";import{b as Zi}from"./chunk-OVK27PCL.js";import{a as H0}from"./chunk-V4M4ORR6.js";import{a as Mr,b as Ji}from"./chunk-57LHWF65.js";import{a as Qc,e as $0,f as Y0,g as K0}from"./chunk-MRYUEEQO.js";import{a as Yc,c as q0}from"./chunk-3G6CPZVY.js";import{$ as k0,A as W,C as bl,D as eo,E as to,F as g0,G as fn,H as E0,I as T0,J as R0,K as y0,L as F0,M as S0,N as _0,O as B0,P as D0,Q as M0,R as xl,T as O0,W as L0,X as U0,_ as I0,a as l0,aa as vl,b as pl,c as f0,ca as N0,d as c0,da as P0,ea as C0,fa as j0,ga as G0,h as Qi,ha as X0,i as u0,ia as Al,ja as gl,k as h0,l as za,m as ml,ma as El,n as d0,na as V0,o as p0,p as m0,pa as z0,q as w0,qa as W0,s as b0,w as x0,x as v0,y as A0,z as wl}from"./chunk-YFXNONCI.js";import{b as t0,c as r0,d as ul,e as n0}from"./chunk-ZHO7RKXH.js";import{a as Kc,b as qc,c as qi,d as Jc,i as Zc,x as or}from"./chunk-PZUQBGPC.js";import{j as fl,k as cl}from"./chunk-F5EEPMQ6.js";import{hb as Ki}from"./chunk-VI7OAN5C.js";import{a as Va,i as zc,n as Wc,p as Hc,r as $c}from"./chunk-RM7DNXVZ.js";import{a as Vc}from"./chunk-OQLN5YOD.js";import{F as kc,G as Nc,H as Yn,a as we,ea as Yi,fa as Pc,g as w,k as Lc,n as st,q as Uc,r as Ic}from"./chunk-FCWPSKXB.js";import{d as Cc,e as jc,i as Kn,m as Gc,n as Xc}from"./chunk-ZVT6VNWV.js";import{e as sl,j as ll}from"./chunk-CLXSGRVO.js";import{a as ir}from"./chunk-QV6U4PNV.js";function xd(f,p,T,v){let M=0;for(let O=0;O<p.length;O++)p[O]&&!T[O]&&(f.fill(0,O*v,(O+1)*v),M++);return p.set(T),T.fill(0),M}function ro(f,p,T,v,M=null){let O=v*T,G=0;for(;G<O&&f[G]===p[G];)G++;if(G===O)return null;let U=O-1;for(;U>G&&f[U]===p[U];)U--;let _=Math.floor(G/T),K=Math.floor(U/T);for(let be=_*T,xe=(K+1)*T;be<xe;be++)p[be]=f[be];return M?(M[0]=_,M[1]=K,M):[_,K]}function vd(f,p,T,v,M=Kh,O=.01,G=.001){let U=v*T;if(!p||p.length<U)return!1;for(let _=0;_<U;_++){let K=f[_],be=p[_];if(K===be)continue;let xe=Math.abs(K-be);if(!(xe<=G)&&(M[_%T]||xe>G+O*Math.abs(be)))return!1}return!0}var Kh=(()=>{let f=new Uint8Array(64);for(let p of[0,14,17,18,20,21,24,25])f[p]=1;return f})();var Jh={tri:null,seg:null,nTri:0,nSeg:0};var fr=8,Zh=Zc,no=13,oo=20,Qn=32768,so=11,io=(1<<so)-1;function cp(f,p){let T=Math.min(Math.max(1.7*f/Math.max(2.6,5*p),1),7)-1,v=Math.min(Math.floor(T),5);return eo[v]+(eo[v+1]-eo[v])*(T-v)}var Qh=new Float32Array([0,0,1,0,0,1,1,1]),sr=`#version 300 es
layout(location = 0) in vec2 aQ;
void main() { gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0); }`,eu=`#version 300 es
precision highp float;
uniform sampler2D uT;
uniform vec2 uSize;
uniform mat3 uMap;
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 q = (uMap * vec3(p, 1.0)).xy;
  o = texture(uT, vec2(q.x / uSize.x, 1.0 - q.y / uSize.y));
}`,Tl=`#version 300 es
precision mediump float;
uniform sampler2D uT;
out vec4 o;
void main() { o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0); }`,ed=`#version 300 es
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
}`,tu=`#version 300 es
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
}`,ru=`#version 300 es
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
}`;function td(f,p,T=[0,0,0,0,0,0]){let v=p[0],M=p[1],O=p[2],G=p[3],U=p[4],_=p[5],K=v*G-M*O;if(!K)return null;let be=G/K,xe=-M/K,Xe=-O/K,cr=v/K,e=(O*_-G*U)/K,Lr=(M*U-v*_)/K,ta=f[0],Ve=f[1],l=f[2],Ur=f[3],q=f[4],ra=f[5];return T[0]=ta*be+l*xe,T[1]=Ve*be+Ur*xe,T[2]=ta*Xe+l*cr,T[3]=Ve*Xe+Ur*cr,T[4]=ta*e+l*Lr+q,T[5]=Ve*e+Ur*Lr+ra,T}function rd(f,p,T){if(!f)return!1;for(let v=0;v<4;v++){let M=v&1?p:0,O=v&2?T:0,G=f[0]*M+f[2]*O+f[4],U=f[1]*M+f[3]*O+f[5];if(!(G>=-.5&&G<=p+.5&&U>=-.5&&U<=T+.5))return!1}return!0}var nu=new WeakMap,Rl=f=>{let p=nu.get(f);return p||nu.set(f,p=new Float32Array(f.flat())),p},Ge={world:new Float32Array(9),inv:new Float32Array(9),be:new Float32Array(96),bb:new Float32Array(96),ncv:new Float32Array(48),hb:new Float32Array(64),hr:new Float32Array(16)},yl=[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]],qn=[],Fl={},au=[0],iu=[0],Jn=[0,0,1,1],ao=[0,0,0,0],ou=[1,0],su=[.08,.08,.1],lu=[1,.93,.86],Sl=[.8,.95,.2],_l=[1,.55,.16],Bl=[1,1,1],Dl=[.1,.1,.16],lr=(f,p,T,v,M,O,G)=>(f[0]=p,f[1]=T,f[2]=0,f[3]=v,f[4]=M,f[5]=0,f[6]=O,f[7]=G,f[8]=1,f);var Ha=1,Ml=2,Ol=4,gt=8,$a=16,du=32,Ll=64,ea=128,pu=256,up=1024,Ya=.6,fu=`#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;        // cell origin (world)
layout(location=2) in vec4 range;      // first segment entry, count, first junction entry, count
uniform mat3 world;                    // world \u2192 device pixels
uniform vec2 size;
uniform float cell;
uniform vec2 lOff;                     // where the layer holds a screen pixel: its place in the layer minus its place on screen (device px, y down; see wrapPieces)
out vec2 vW;
flat out ivec4 vR;
void main() {
  vec2 w = org + corner * cell;
  vec3 d = world * vec3(w, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vW = w; vR = ivec4(range + 0.5);
}`,nd=h0({F_DIFFUSE:Ml,F_EDGE:Ll,F_SHADOW:Ol,F_SPEC:du,F_VEIL:ea,F_WHOLE:pu,LIFT_EASE_MAX:cl,LIFT_EASE_SHARE:fl,LUMEN2:Qn,ROW2_BITS:so,VEIL_K:Ya}),Ul=ml({EDGE:Va,F_DOTTED:gt,F_NOCASE:$a,F_SEL:Ha,F_VEIL:ea,VEIL_K:Ya}),ad=Ul.decl,id=Ul.key,od=Ul.out,Il=ml({EDGE:Va,F_DOTTED:gt,F_NOCASE:$a,F_SEL:Ha,F_VEIL:ea,VEIL_K:Ya,tube:1}),sd=Il.key,ld=Il.decl,fd=Il.out,cd=b0({F_DIFFUSE:Ml,F_EDGE:Ll,F_VEIL:ea}),Zn=(f,p=0,T=0)=>`#version 300 es
precision highp float;
precision highp int;
#define SIMPLE ${f?1:0}
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
${T?ld:ad}
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
uniform float tierAlpha[${oo}];
uniform int tierGroup[${oo}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture (drawRows), not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw (tintPass): only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int morphOn;                   // 1: a binning made for a stretch of the change between the views (veins-sweep.js): the points and joins from the frame's rows; 2: the same, its heads and runs with circles about the frame's points (tight)
uniform int posBase;                   // (morphOn) the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
uniform int joinBase;                  // (morphOn) the texel of the frame's joins: one a join (centre, reach, blend width and fillet)
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 \xD7 (arc length + S_OFF), across (0\u201365535), visibility (high byte) | the second lumen's share (low byte)
${T?"layout(location=2) out uvec4 outFlow2; // (the Tube) the second lumen's target, declared in the strip build too: the strip and the patch write the same four targets, so the draw buffers never change between them (a strip has no second lumen: it writes zero)":`#if SIMPLE == 0
layout(location=2) out uvec4 outFlow2; // near a join, the lumen it joins, packed (ROW2_BITS): row + 1 | across's top bits, 4 \xD7 (arc + S_OFF) | across's low bits
#else
uvec4 outFlow2;                        // (one vessel and no join: never a second lumen, always zero; the one-vessel build's draws leave that target as it stands, zero: see vesselDraw)
#endif`}
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

#define MAXS ${f?1:8}
#define MAXJ ${f?1:6}
#define ENT_W ${2048}
const float LAST = ${W-1}.0;
const float S_OFF = ${bl}.0;

#if MESH == 2
vec4 E(int e, int k) { return texelFetch(pjTex, ivec2(k, e), 0); }   // (a patch: its joins' entries)
#else
vec4 E(int e, int k) { int t = e * 2 + k; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
#endif
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${W/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }
vec4 JT(int j) { int t = joinBase + j; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
${to}
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

${nd}${T?`
${cd}`:""}
void main() {
#if MESH
  // (The ring's mark: the tier's lumens, by their keys: this depth over a lumen's, the depth test GREATER, sets the stencil.)
${T?p===2?"  gl_FragDepth = gl_FragCoord.z;   // (the Tube's patch: written on every path, then by the key block; strips write none)":"":"  if (mPass == MP_MARK) { gl_FragDepth = keyShape + 0.5 * keyH; return; }"}
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
      if (id >= 0) { clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${gt}) != 0; rmx = texelFetch(rmax, ivec2(0, id), 0).r; }
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
    clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${gt}) != 0;
    int ic = clamp(int(vI), 0, ${W-2});
    for (int j = max(0, ic - MESH_WIN); j <= min(${W-2}, ic + MESH_WIN); j++)
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
    clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${gt}) != 0;
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
${T?sd:id}
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
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${Ya} * organK : 0.0;
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
  bool mLum = false;${T?`
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
    bool sel = (flags & ${Ha}) != 0;
    float cA = (flags & ${$a}) != 0 ? 0.0 : (flags & ${gt}) != 0 ? 0.35 : 1.0;

    float aa = px * ${Va};   // (the figure's one edge softness, device px: edge.js, shared with the organ painter)
    // Where vessels of one tier cross, the one drawn above is cut out of the one below by a ring of the figure's ground 2.5 device px wide, outside its
    // casing, with its casing across the cut (the atlas convention): without it the two lumens swapped colour at an edge with no line. Only inside the
    // lower lumen (the ring is a cut in it), never at a join, never for a vessel without a casing.
    float kn = 0.0, kcas = 0.0;
    if (fx == 1 && paperInk.a > 0.0) for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || (conn & (1 << s)) != 0 || stier[s] != tt || sz[s] <= sz[ow] || sd[s] < 0.0) continue;
      int fl = int(sflag[s] + 0.5);
      if ((fl & (${$a} | ${gt})) != 0) continue;
      float reachK = swall[s] + 2.5 * px, fa = clamp(sa[s] * pres[s], 0.0, 1.0) * ((fl & ${ea}) != 0 ? 0.5 : 1.0);
      kn = max(kn, fa * paperInk.a * clamp(0.5 - (sd[s] - reachK) / aa, 0.0, 1.0));
      kcas = max(kcas, fa * clamp(0.5 - (sd[s] - swall[s]) / aa, 0.0, 1.0));
    }
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    if (aL > 0.0) dep = true;
#if MESH
    int fSh = flags;
    flags &= ~${Ol};   // (the mesh lays the tier's shadow in a pass of its own, under the whole tier: shadowOf below)
#endif
#if MESH
    // (A glow or shadow pass draws neither the tier's shape nor its stream: the shading is left out there.)
    vec4 c = mPass >= MP_SHAPE_K ? ${T?"celShade":"tubeShade"}(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL) : vec4(0.0);
#else
    vec4 c = ${T?"celShade":"tubeShade"}(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL);
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
    if (lumA > 0.02 && (flags & ${gt}) == 0) {
      // The stream shown here: the two joined lumens with the largest share, by nearness and by how
      // far past its own end each one runs (a vessel's streaks fade out beyond its end, so at a fork
      // the trunk's hand over to each branch along its own course instead of running on straight
      // across it). Equal where two lumens meet, fading over about a radius, so the stream and the
      // dye pass from one vessel into the next instead of stopping at a seam.
      float tb = max(0.7 * sr[ow], 1.5), w1 = 0.0, w2 = 0.0;
      int o1 = -1, o2 = -1;
      for (int s = 0; s < MAXS; s++) {
        if ((conn & (1 << s)) == 0 || (int(sflag[s] + 0.5) & ${gt}) != 0) continue;
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
    if (ti == tierNow) { mC = c;${T?" mD = D;":""} mWs = wsel; mLum = lumA > 0.02 && (flags & ${gt}) == 0; mSh = shadowOf(Ds, wall, flags, sel, aa) * alpha * tierAlpha[ti] * (grp == 0 ? gf : 1.0); break; }
#endif
  }
#if MESH
${T?fd:od}
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
}`,ud=`#version 300 es
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
}`,hd=`#version 300 es
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
}`,mu=`
float chevOrange(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}
// A head's two inks, from the colour of the vessel it is on (vc) and that vessel's eased reversed flag (rv): the core and the light-or-dark
// rim. By the lumen's lightness, over a small band so a vessel whose colour eases never pops (visual-style B1): a dark head with a light rim
// on a pale lumen, a near-white head (chevLight) with a dark rim on a dark one (a dark head on a 30 mmHg lumen is 1.49:1, on 20 mmHg
// 2.64:1). The band sits at luma .38 to .46 (the 20 mmHg stop is .39, the arteries .33 to .40, so they flip). A reversed head stays orange (revCol) on any lumen but an orange one, where it takes the same near-white flip (chevOrange, as before). In the origin
// lens the head keeps its own ink (an orange head on the SMV's amber is 1.01:1): the \xBB pair behind it (chevHead) alone says reversed there.
void chevInks(vec3 vc, float rv, out vec3 core, out vec3 rim) {
  float rk = origin == 1 ? rv * (1.0 - blendA.z) : rv;
  float dark = 1.0 - smoothstep(0.38, 0.46, dot(vc, vec3(0.299, 0.587, 0.114)));
  float warm = rk * chevOrange(vc);
  vec3 ink = mix(chevInk, vc * 0.3, 0.2);
  core = mix(mix(mix(ink, chevLight, dark), revCol, rk), chevLight, warm);
  rim = mix(inkLight, vc * 0.45, max(dark, warm));
}
`,Or=`
precision highp float;
uniform float pxW;
flat out vec4 zoomA;                   // the lane spacing Lg, the parcel scales sA and sB, the cross-fade lf between them
flat out vec3 zoomB;                   // the fine octave's fade at sA and at sB, and the scale between them (sx)
const float SLOT = ${Zh}.0;
void zoomOut() {
  float Lg = max(2.6, 5.0 * pxW);
  float lx = clamp(log2(max(pxW, 1e-4) * 8.0 / SLOT), -1.0, 3.0);
  float li = smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx);   // 0 \u2026 2
  float lb = min(floor(li), 1.0), lf = li - lb;
  float sA = SLOT * exp2(lb), sB = SLOT * exp2(lb + 1.0);
  float cellA = 5.12 * sA, cellB = 5.12 * sB;
  zoomA = vec4(Lg, sA, sB, lf);
  zoomB = vec3(smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5), smoothstep(1.2 * pxW, 2.0 * pxW, cellB * 0.5), mix(sA, sB, lf));
}`,cu=`#version 300 es
layout(location=0) in vec2 corner;
${Or}
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); zoomOut(); }`,uu=`#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;
uniform mat3 world;
uniform vec2 size;
uniform float cell;
${Or}
void main() {
  vec3 d = world * vec3(org + corner * cell, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  zoomOut();
}`,dd=(f,p,T,v)=>`#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${f?1:0}
#define STREAK ${p?1:0}   // 1: the half-size pass that works out the streaks alone (see HALF in composite)
precision highp usampler2D;
uniform sampler2D base;                // the vessel layer (premultiplied)
uniform usampler2D gbuf;               // its frontmost lumen per pixel
${v?_0():`uniform usampler2D gbuf2;              // near a join, the lumen it joins and its share
`}uniform ivec2 lA, lWrap, lSize;        // the layer holds the screen pixels from lA (device px, y down) lSize on, pixel s in texel (s \u2212 lA + lWrap) wrapped at lSize
uniform vec2 lowS;                     // R10: a tier frame's layer read straight from its small targets: their share of the layer (0: the layer itself)
uniform ivec2 lowSz;                   // (the share's texels: the corner of the small targets the tier drew in)
uniform vec2 lowT;                     // (the small targets' size, texels: the colour is read filtered at uv inside them)
uniform int lH;                        // the picture's height (device px)
${fn.samplers}
uniform sampler2D plate0, plate1;
uniform vec4 plateRect0, plateRect1;
uniform int plates;                    // bit 0: whole plate, bit 1: sharp view
// (The organs drawn layer by layer instead (organs-gl.js), device pixels, premultiplied, are read from plate1's unit while they are on
// (stackOn): the plate rasters are not then, so one unit holds either. The freed unit 14 holds the half-size streaks, halfL.)
${v?"":`uniform sampler2D halfL;               // the streaks of the wide lumens at half size, premultiplied (rgb \xD7 a, a); read where halfOn
`}uniform int halfOn;
uniform float halfR;                   // a lumen at least this many device px in radius takes its streaks from halfL
uniform int stackOn;
uniform float plateAlpha, plateSat;
uniform highp sampler2D fluidMask;     // the peritoneal cavity: its half-width about the middle of fluidRect, row by row down it
uniform vec4 fluidRect;
uniform vec4 fluidS;                   // ascites: floor, height, ripple amplitude, ripple phase (world units, radians)
uniform vec4 fluidInk;                 // its straw color (straight) and opacity at depth; a = 0: none
uniform vec2 fluidLv;                  // the liver's scale about 560 350, and how far the fluid is kept off it (its lower edge: fluidMask row 1)
uniform mat3 inv;                      // device pixels \u2192 world
uniform float H;                       // canvas height, device pixels
${fn.pxW}
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
uniform vec3 blendA;                   // 0..1 each: the streaks, the chevrons and the origin colours fading in or out (switched on or off)
${fn.speed}
${fn.ink}
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
${fn.rows}
uniform sampler2D lineL;               // the organ outlines, drawn once per change (premultiplied, device pixels)
uniform int lineOn;
uniform sampler2D glowL;               // soft glows behind the plate (an organ a slide points at), same drawing
uniform int glowOn;
uniform sampler2D warmL;               // warm glows over the plate and under the vessels (the edges of a lit organ's loops), same drawing
uniform int warmOn;
uniform int bloodOnly;                // 1: a frame where only the blood moved (composite): a pixel with no lumen is left as drawn
${fn.zoom}
uniform int stillOn;                   // 1: the uniforms are the last picture's; flow column FLOW_TEXELS says which rows moved since
out vec4 outColor;

${E0()}
const float STO_Y0 = ${Kc}.0, STO_DY = ${qc}.0;
const int STO_N = ${qi};
const vec2 STO[${qi}] = vec2[${qi}](${Jc.map(([M,O])=>`vec2(${M.toFixed(2)}, ${O.toFixed(2)})`).join(", ")});

${T0()}
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
${v?B0():R0()}
${Qc}
// How orange a vessel's colour is (0..1): a bright red channel well above the blue, with green between a red's and a
// yellow's, eased at each edge (the reversed orange and the heat ramp's orange 1; teal, wine, red, yellow and grey 0).
${mu}
// Flow arrowheads along the axis, pointing and moving with the mean flow: a slim filled head with
// a notched back. Returns its coverage (x) and a soft rim just outside it (y).
${y0()}
// (f0, f1, len and Rs, the caliber at s: read once in main, as for bloodAt.)
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
${v?"":F0()}

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
${T?`#if 0   // (the arrowheads' build: its own main, below)
`:""}void main() {
#if STREAK
  outColor = vec4(0.0);
  vec2 FC = gl_FragCoord.xy * 2.0;   // (a texel of the half-size target lies at the corner of 2 \xD7 2 pixels: their mean position)
#else
  vec2 FC = gl_FragCoord.xy;
#endif
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
${v?D0({LUMEN2:Qn,FLOW_TEXELS:fr}):`  uvec4 g = (inL ? texelFetch(gbuf, lp, 0) : uvec4(0u));
  // Between whole redraws a pixel with no lumen comes out as the last frame left it: everything it is made of (the plate, the
  // glows, the vessel layer, still fluid, the outlines) is unchanged, and the blood, chevrons, dye and origin colours are drawn
  // only where a lumen is (g.x > 0). So it is not drawn again: the blood squares' other pixels were most of each frame's work
  // zoomed in (Mohammad's Mac at rest, zoom 4.24, 21 Oct: 86 frames in 2 s against 121 at 3.08), for the same picture.
  if (bloodOnly == 1 && g.x == 0u) discard;
  // (The row's top bit says a second lumen is written beside it, near a join: the vessel shader's outFlow. Set only where the row
  // is, so the test above holds either way.)
  bool two = (g.x & ${Qn}u) != 0u;
  g.x &= ${Qn-1}u;
  // ...and, in the same pass, a lumen whose vessels' rows have not changed since the last picture, which had the same uniforms
  // (stillOn: composite checks them): it would come out as it is (see moved in createVeinsGL).
  if (bloodOnly == 1 && stillOn == 1 && texelFetch(flow, ivec2(${fr}, int(g.x) - 1), 0).x == 0.0
      && (!two || texelFetch(flow, ivec2(${fr}, int((inL ? texelFetch(gbuf2, lp, 0) : uvec4(0u)).x & ${io}u) - 1), 0).x == 0.0)) discard;
`}  vec2 w = (inv * vec3(FC.x, H - FC.y, 1.0)).xy;
  vec4 v = (inL ? texelFetch(base, lp, 0) : vec4(0.0));
  if (lowSz.x > 0 && inL) v = texture(base, lowUV);   // (R10: a tier frame's colour, filtered as the blit up filtered it)
  // Under a fully opaque vessel pixel (the inside of nearly every lumen) nothing laid below it can show: over(v, under) is
  // v + under \xD7 (1 \u2212 1), exactly v. So the plate, its grey-down, the glows, the organ layers and the pool are not read there.
  // The vessel layer's alpha is 8-bit, so 1.0 is exact; an edge, a faded tube or a ghosted tier (alpha under 1) lays them all.
#if STREAK
  bool under = false;
  vec4 pl = vec4(0.0), fluidC = vec4(0.0);
#else
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

#endif
${v?M0():`#if STREAK
  float vis = g.x > 0u ? 1.0 : 0.0;   // (the lumen's edge coverage is the full pass's: here a texel is in the lumen or not)
#else
  float vis = g.x > 0u ? clamp(float(g.w >> 8u) / 255.0 / max(v.a, 1e-3), 0.0, 1.0) : 0.0;
#endif
  if ((blood == 1 || dyeOn == 1 || chev == 1 || origin == 1) && (vis > 0.005 || (dyeOn == 1 && g.x > 0u)) && v.a > 0.01) {
    vec3 col = v.rgb / v.a;
    // This lumen, and near a join the one it joins, cross-faded by its share.
    // (Read only where there is one: everywhere else that target is zero, as the vessel shader writes it.)
    uvec4 g2 = two ? (inL ? texelFetch(gbuf2, lp, 0) : uvec4(0u)) : uvec4(0u);
    // (The second lumen unpacked (ROW2_BITS): its row, its arc in quarters, its across at the middle of its 128th; its share beside the
    // front lumen's visibility.)
    uint r2 = g2.x & ${io}u;
    float b = r2 > 0u ? float(g.w & 255u) / 255.0 : 0.0;
    int id1 = int(g.x) - 1, id2 = int(r2) - 1;
    float s1 = float(g.y) / 16.0 - S_OFF, y1 = float(g.z) / 32767.5 - 1.0;
    float s2 = float(g2.y >> 2u) / 4.0 - S_OFF, y2 = (float(((g2.x >> ${so}u) << 2u) | (g2.y & 3u)) + 0.5) / 64.0 - 1.0;
    if (origin == 1) {
      // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey.
      float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / ORIGIN_GREY, 0.55, 1.45);
      // A vessel that carries no blood (origin fractions marked \u22121, e.g. a lymphatic) keeps its own color.
      vec3 oc = texelFetch(flow, ivec2(2, id1), 0).x < -0.5 ? col : min(originAt(id1, s1, y1, max(texelFetch(rad, ivec2(N_LAST / 2, id1), 0).r, 0.3)) * shade, vec3(1.0));
      if (b > 0.004) oc = mix(oc, texelFetch(flow, ivec2(2, id2), 0).x < -0.5 ? col : min(originAt(id2, s2, y2, max(texelFetch(rad, ivec2(N_LAST / 2, id2), 0).r, 0.3)) * shade, vec3(1.0)), b);
      col = mix(col, oc, vis * blendA.z);
    }
    // The front lumen's flow, length, caliber here and own colour, read once for the streaks and the arrowheads. Neither is drawn
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
    // same parent; createStreamChain), and whether either is the minor inflow where a chained vessel takes the other's blood (mn).
    // Both 0 where nothing is chained (?bloodchain=0, the lobule).
    float rel = 0.0, mn = 0.0;
    vec4 f0b = vec4(0.0), f1b = vec4(0.0);
    float len2 = 1.0, R2 = 0.3;
    if (b > 0.004 && (blood == 1 || chev == 1)) {
      float p1 = texelFetch(flow, ivec2(3, id1), 0).w - 1.0, p2 = texelFetch(flow, ivec2(3, id2), 0).w - 1.0;
      float w1 = texelFetch(flow, ivec2(4, id1), 0).w, w2 = texelFetch(flow, ivec2(4, id2), 0).w;
      if (p1 > -0.5 && abs(p1 - float(id2)) < 0.5) rel = w1;
      else if (p2 > -0.5 && abs(p2 - float(id1)) < 0.5) rel = w2;
      else if (p1 > -0.5 && abs(p1 - p2) < 0.5) rel = min(w1, w2);
      // (Each lumen's weight at the end nearer this pixel: a vessel is the minor inflow at one end only.)
      vec2 e1 = texelFetch(flow, ivec2(5, id1), 0).zw, e2 = texelFetch(flow, ivec2(5, id2), 0).zw;
      len2 = max(texelFetch(tube, ivec2(5, id2), 0).z, 1.0);
      float lenA = max(texelFetch(tube, ivec2(5, id1), 0).z, 1.0);
      mn = max(-min(s1 < 0.5 * lenA ? e1.x : e1.y, 0.0), -min(s2 < 0.5 * len2 ? e2.x : e2.y, 0.0));
      if (rel > 0.0) {
        f0b = texelFetch(flow, ivec2(0, id2), 0); f1b = texelFetch(flow, ivec2(1, id2), 0);
        f0b.x = flowD(id2, f0b.x, f0b.y);
        if (f1b.z > 0.0) R2 = radAt(id2, s2, len2);
        else rel = 0.0;
      }
    }
    bool isLy = f1.x < -0.5;   // (a lymph row: dashes, never blood streaks or arrowheads)
    if (blood == 1 && blendA.x > 0.0 && f1.z > 0.0 && !isLy) {   // (blendA.x: the streaks' own switch; the lobule keeps blood.on for its lymph dashes with the streaks off)
      // One streak field (the dominant lumen's), eased down toward the join, so two patterns never ghost over each other. Where
      // both lumens draw one pattern, the two are mixed by share instead (the same mix from either side of the seam) and nothing
      // dims; the minor inflow into a chained vessel dims half as much.
#if STREAK
      if (R1 >= 0.9 * halfR * pxW) {
#else
      if (halfOn == 1 && R1 >= halfR * pxW) {
        // A wide lumen: its streaks from the half-size pass (the colour and share it worked out for the texel nearest here, filtered; the
        // lumen's own edge and the rest of its pixel stay full size).
        vec4 hs = texture(halfL, FC / (2.0 * vec2(textureSize(halfL, 0))));
        col = col * (1.0 - hs.a * vis) + hs.rgb * vis;
      } else {
#endif
      vec4 A = bloodAt(id1, s1, y1, col, f0, f1, len1, R1, vc1);
      if (rel > 0.0) {
        vec3 vc2 = mix(texelFetch(tube, ivec2(0, id2), 0).rgb, texelFetch(tube, ivec2(1, id2), 0).rgb, alongAt(id2, clamp(s2 / len2, 0.0, 1.0)));
        vec4 A2 = bloodAt(id2, s2, y2, col, f0b, f1b, len2, R2, vc2);
        float bb = b * rel, aa = mix(A.a, A2.a, bb);
        A = vec4((A.rgb * A.a * (1.0 - bb) + A2.rgb * A2.a * bb) / max(aa, 1e-4), aa);
      }
      float dimK = mix(mix(0.6, 0.3, mn), 0.0, rel);
      float a = A.a * (1.0 - dimK * smoothstep(0.02, 0.5, b)) * (1.0 - castAt(id1, s1, len1));
#if STREAK
      float aS = clamp(a * flowA * blendA.x, 0.0, 1.0);
      outColor = vec4(A.rgb * aS, aS);
#else
      if (a > 0.0) col = mix(col, A.rgb, clamp(a * vis * flowA * blendA.x, 0.0, 1.0));
#endif
      }
    }
#if STREAK
    return;
#endif
    if (blood == 1 && isLy && f1.z > 0.0) {
      float lc, lk;
      lymphAt(s1, y1, f0, len1, R1, lc, lk);
      // The dash's ink: clearly deeper than the channel's own green (lighter in the dark theme); the core a visible but quiet albumin amber.
      vec3 ink = mix(vc1, f0.w > 0.5 ? vec3(0.78, 0.95, 0.70) : vec3(0.30, 0.56, 0.28), 0.62);
      vec3 amber = f0.w > 0.5 ? vec3(0.95, 0.71, 0.29) : vec3(0.89, 0.60, 0.12);
      float aL = clamp(f1.z * vis * flowA, 0.0, 1.0);   // (not blendA.x: the streaks' switch, which the lymph does not follow)
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
${S0()}    v = vec4(col * v.a, v.a);
  }
`}#if STREAK
  return;
#endif
  // An active bleed. Inside the stomach, under the vessels that cross it (so the plate's depth holds): the pool, the stomach's own
  // lumen (STO, row by row) below a flat surface that ripples where the stream lands, lighter and thinner at the surface, darker
  // with depth and toward the wall; and the stream, a thread of blood that leaves the tear, curves out and falls to the pool,
  // thinning as it goes and breaking into drops when it is slow. It flows, but never pulses: no jets or drops at the tear.
  vec3 bc = vec3(${Ki("--bleed-spray").map(M=>M.toFixed(1)).join(", ")}) / 255.0;
  vec3 bf = vec3(${Ki("--bleed-fresh").map(M=>M.toFixed(1)).join(", ")}) / 255.0;
  vec3 bd = vec3(${Ki("--bleed-deep").map(M=>M.toFixed(1)).join(", ")}) / 255.0;
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
}${T?`
#endif
${Y0({LUMEN2:Qn,ROW2_MASK:io,FLOW_TEXELS:fr})}`:""}`,Wa=(f=!1,p=!1,T=!1,v=0)=>dd(f,p&&!v,T,v&&!T?1:0),pd=`#version 300 es
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
}`,md=`#version 300 es
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
}`;function Ct(f,p,T){let v=f.createShader(p);return f.shaderSource(v,T),f.compileShader(v),v}function ae(f,p,T){let v=[typeof p=="string"?Ct(f,f.VERTEX_SHADER,p):p,typeof T=="string"?Ct(f,f.FRAGMENT_SHADER,T):T],M=f.createProgram();for(let O of v)f.attachShader(M,O);return f.linkProgram(M),{p:M,sh:v}}function ie(f,{p,sh:T}){if(!Kn){for(let O of T)if(!f.getShaderParameter(O,f.COMPILE_STATUS))throw new Error(f.getShaderInfoLog(O))}if(!f.getProgramParameter(p,f.LINK_STATUS)){for(let O of T)if(!f.getShaderParameter(O,f.COMPILE_STATUS))throw new Error(f.getShaderInfoLog(O));throw new Error(f.getProgramInfoLog(p))}let v={},M=f.getProgramParameter(p,f.ACTIVE_UNIFORMS);for(let O=0;O<M;O++){let G=f.getActiveUniform(p,O).name.replace(/\[0\]$/,"");v[G]=f.getUniformLocation(p,G)}return{p,u:v}}function oe(f,p){let T=f.createTexture();return f.bindTexture(f.TEXTURE_2D,T),f.texParameteri(f.TEXTURE_2D,f.TEXTURE_MIN_FILTER,p||f.NEAREST),f.texParameteri(f.TEXTURE_2D,f.TEXTURE_MAG_FILTER,p||f.NEAREST),f.texParameteri(f.TEXTURE_2D,f.TEXTURE_WRAP_S,f.CLAMP_TO_EDGE),f.texParameteri(f.TEXTURE_2D,f.TEXTURE_WRAP_T,f.CLAMP_TO_EDGE),T}function wu(f,p=new Float32Array(W)){let T=Math.min(f?.length||0,W),v=(wu.scratch||=new Float32Array(W)).fill(0);for(let M=1;M<T-1;M++){let O=f[M][0]-f[M-1][0],G=f[M][1]-f[M-1][1],U=f[M+1][0]-f[M][0],_=f[M+1][1]-f[M][1],K=.5*(Math.hypot(O,G)+Math.hypot(U,_));v[M]=K>1e-6?Math.atan2(O*_-G*U,O*U+G*_)/K:0}T>2&&(v[0]=v[1],v[T-1]=v[T-2]);for(let M=0;M<W;M++)p[M]=M<T?(v[Math.max(0,M-1)]+2*v[M]+v[Math.min(T-1,M+1)])/4:0;return p}function hu(f,p,T){if(!f||!(p>0))return null;let v=1/0,M=1/0,O=-1/0,G=-1/0;for(let U=0;U<p;U++){let _=f[U*6],K=f[U*6+1];_<v&&(v=_),K<M&&(M=K),_>O&&(O=_),K>G&&(G=K)}return[v,M,O+T,G+T]}function wd(f,p,T,v,M,O,G,U,_){if(!(p[2]>p[0]&&p[3]>p[1]))return!1;let K=O/U,be=G/_,xe=Math.ceil(Math.abs(T)*Math.max(K,be))+1,Xe=T*p[0]*K+v,cr=T*p[2]*K+v,e=T*(G-p[3]*be)+M,Lr=T*(G-p[1]*be)+M;return f[0]=Math.max(0,Math.floor(Math.min(Xe,cr))-xe),f[2]=Math.min(O,Math.ceil(Math.max(Xe,cr))+xe),f[1]=Math.max(0,Math.floor(Math.min(e,Lr))-xe),f[3]=Math.min(G,Math.ceil(Math.max(e,Lr))+xe),f[2]>f[0]&&f[3]>f[1]}function hp(f,{tubes:p,force:T=!1,who:v="stage",onPlate:M=null,share:O=null}){let G=O?.canvas||null,U=O?{tex:null,fbo:null,w:0,h:0,gen:0}:null;function _(){if(!U)return null;let t=Math.max(1,f.width),r=Math.max(1,f.height);return U.fbo||(U.tex=e.createTexture(),U.fbo=e.createFramebuffer()),(U.w!==t||U.h!==r)&&(e.bindTexture(e.TEXTURE_2D,U.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t,r,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,U.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,U.tex,0),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),U.w=t,U.h=r,U.gen++),U.fbo}function K(t,r){iu[0]=r&&!U?e.COLOR:e.COLOR_ATTACHMENT0,e.invalidateFramebuffer(t,iu)}if(p+1>io)return console.warn(`Veins renderer: ${p} vessel rows do not fit the second lumen target.`),null;let be=()=>v==="lobule"?"lobule":w.by||"stage, outside a draw call",xe=t=>{w.note(we.fboAlloc,t),w.note(we.fboAllocBy+be())},Xe=v==="stage"||v==="lobule",cr=!Xe,e=null;try{e=O?O.gl:f.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!Xe,preserveDrawingBuffer:cr,failIfMajorPerformanceCaveat:!T})}catch{e=null}if(e&&!O&&Lc(e),!e)return null;let Lr=Pc("figure-canvas-shown"),ta=()=>{},Ve=!cr&&!O?J0(e,f,{onEnd:Nc,copied:()=>Uc("screen onto the canvas"),ask:()=>{if(!Yi())try{Lr(ta)}catch(t){ir("veins-gl:show",t)}}}):null,l=Vc(e),Ur=[0,0],q=null,ra=!1,na=0,aa=0,Ir=null,lo=1,kl=!1,Re=[],Nl=30,Pl=(t,r)=>{if(t.fails=(t.fails||0)+1,t.fails===1&&console.warn("Veins renderer: what is drawn over the figure failed.",r),t.fails>=Nl){let n=Re.indexOf(t);n>=0&&Re.splice(n,1),console.warn(`Veins renderer: what is drawn over the figure failed. It failed ${Nl} pictures in a row and is taken out.`)}},Le=null,Ze=0,ia=v==="lobule"&&O?a0(e):null,oa=null,ye={on:!1,pic:-1,gen:-1,v1:-1,v2:-1,v3:-1},ze={tex:null,w:0,h:0,v1:0,v2:0,v3:0,dyn:!1,ducts:null,plug:null,view:null,lum:null,cell:null,edge:null,nuc:null,width:0,alpha:0},Ue=null,D=()=>q?q[0]:f.width,B=()=>q?q[1]:f.height,sa=e.getExtension("KHR_parallel_shader_compile"),g,Cl=()=>{try{g.tubeStrip=ae(e,w0(pl,Ha,Or),Zn(!0,1,1)),g.tubePatch=ae(e,d0(pl),Zn(!1,2,1)),g.meshLay=ae(e,sr,p0)}catch(n){console.warn("Veins renderer: the tube vessel shaders could not be made; the classic vessel pass draws.",n),delete g.tubeStrip,delete g.tubePatch,delete g.meshLay}let t={F_DIFFUSE:Ml,F_EDGE:Ll,F_SHADOW:Ol,F_SPEC:du,F_VEIL:ea,F_WHOLE:pu,F_SEL:Ha,F_DOTTED:gt,F_NOCASE:$a,LIFT_EASE_MAX:cl,LIFT_EASE_SHARE:fl,LUMEN2:Qn,ROW2_BITS:so,VEIL_K:Ya,EDGE:Va,ENT_W:2048,N_SAMPLES:W,MAX_TIERS:oo,S_OFF:bl,ALONG_GLSL:to},r=(n,a)=>Ct(e,n,a);try{Object.assign(g,L0(e,ae,t,Or,r))}catch(n){console.warn("Veins renderer: the Tube stage 2 shaders could not be made; the Tube keeps stage 1.",n);for(let a of xl)delete g[a]}try{Object.assign(g,N0(e,ae,t,Or,{COMP_FS:Wa,COMP_VS:cu,COMP_CELL_VS:uu},r))}catch(n){console.warn("Veins renderer: the Tube stage 3 shaders could not be made; the Tube keeps stage 2.",n);for(let a of vl)delete g[a]}try{Object.assign(g,I0(e,ae,t,Or,r))}catch(n){console.warn("Veins renderer: the Tube glow shader could not be made; the glow passes keep the strip program.",n),delete g.tubeGlow}};try{let t=Ct(e,e.FRAGMENT_SHADER,Wa()),r=Ct(e,e.VERTEX_SHADER,cu),n=Ct(e,e.VERTEX_SHADER,uu),a=Wa(!0),i=Ct(e,e.FRAGMENT_SHADER,a),s=Ct(e,e.VERTEX_SHADER,fu),o=null;try{let m=a;o={vs:s0(fu,Or),gen:dl(Zn(!1),m,!1),one:dl(Zn(!0),m,!0)}}catch(m){console.warn("Veins renderer: the one-pass shader could not be made; zoom frames keep two passes.",m)}let u=o&&Ct(e,e.VERTEX_SHADER,o.vs),c=v==="stage"||v==="lobule"?Ct(e,e.FRAGMENT_SHADER,Wa(!1,!0)):null;g={fuseGen:o&&ae(e,u,o.gen),fuseOne:o?.one?ae(e,u,o.one):null,prog:ae(e,s,Zn(!1)),simple:ae(e,s,Zn(!0)),comp:ae(e,r,t),compCell:ae(e,n,t),streak:c?ae(e,r,c):null,streakCell:c?ae(e,n,c):null,heads:v==="stage"?ae(e,$0({zoom:Or,along:to,rows:g0,orange:mu,nSamples:W}),Wa(!1,!1,!0)):null,plain:ae(e,r,i),plainCell:ae(e,n,i),cath:ae(e,ud,hd),line:ae(e,pd,md)},v==="stage"&&Cl()}catch(t){return console.warn("Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.",t),null}if(Kn)try{i0(e)}catch(t){ir("veins-gl:1918",t)}let la=()=>{for(let t of new Set(Object.values(g).filter(Boolean).flatMap(r=>r.sh)))e.deleteShader(t)},pe=sa?[...g.simple?["simple"]:[],"plain",...g.streak?["streak"]:[],...g.fuseGen?["fused"]:[],...g.heads?["heads"]:[],...g.tubePatch?["tube"]:[],...g.tubeLean?["tube2"]:[],...g.tubeLumen?["tube3"]:[],...g.tubeGlow?["tubeGlow"]:[]]:[],kr=t=>t==="tube"?[g.tubeStrip,g.tubePatch,g.meshLay]:t==="tube2"?xl.map(r=>g[r]):t==="tube3"?vl.map(r=>g[r]):t==="tubeGlow"?[g.tubeGlow]:t==="heads"?[g.heads]:t==="streak"?[g.streak,g.streakCell]:t==="plain"?[g.plain,g.plainCell]:t==="fused"?[g.fuseGen,g.fuseOne].filter(Boolean):[g.simple],Ka;try{Ka=ie(e,g.prog)}catch(t){return console.warn("Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.",t),la(),null}let jt=null,jl=()=>{try{jt=ie(e,g.simple)}catch(t){console.warn("Veins renderer: the one-vessel shader failed; every cell keeps the general one.",t),e.deleteProgram(g.simple.p),jt=null}};g.simple&&!pe.includes("simple")&&jl();let fo,co;try{fo=ie(e,g.comp),co=ie(e,g.compCell)}catch(t){return console.warn("Veins renderer: composite shader failed.",t),la(),null}let cn=null,Nr=null,Gl=()=>{try{cn=ie(e,g.plain),Nr=ie(e,g.plainCell)}catch(t){console.warn("Veins renderer: the plain composite failed; every frame keeps the full one.",t),e.deleteProgram(g.plain.p),e.deleteProgram(g.plainCell.p),cn=Nr=null}};pe.includes("plain")||Gl();let ft=null,Et=null,qa=null,uo=!1,ho=32,ee={tex:null,fbo:null,w:0,h:0,ok:!1},Xl=()=>{try{ft=ie(e,g.streak)}catch(t){console.warn("Veins renderer: the half-size streak shader failed; the streaks keep full size.",t),e.deleteProgram(g.streak.p),ft=null}try{Et=ft?ie(e,g.streakCell):null}catch(t){ir("veins-gl:streakCell",t),e.deleteProgram(g.streakCell.p),Et=null}ft||e.deleteProgram(g.streakCell.p)};g.streak&&!pe.includes("streak")&&Xl();let Pr=null,Vl=()=>{try{Pr=ie(e,g.heads)}catch(t){console.warn("Veins renderer: the arrowheads' quad shader failed; the composite keeps drawing them.",t),e.deleteProgram(g.heads.p),Pr=null}};g.heads&&!pe.includes("heads")&&Vl();let fa=null,un=null,Cr=null,Tt=v==="stage"?"compiling":"not made yet",po=()=>{try{fa=ie(e,g.tubeStrip),un=ie(e,g.tubePatch),Cr=ie(e,g.meshLay),Tt=""}catch(t){console.warn("Veins renderer: the tube vessel shaders failed; the figure keeps the classic vessel pass.",t);for(let r of kr("tube"))e.deleteProgram(r.p);fa=un=Cr=null,Tt="shader failed"}};g.tubePatch&&!pe.includes("tube")?po():!g.tubePatch&&v==="stage"&&(Tt="shader failed");let hn=null,Ja=null,mo=()=>{({P:hn,failed:Ja}=U0(e,ie,kr("tube2")))};g.tubeLean&&!pe.includes("tube2")?mo():!g.tubeLean&&v==="stage"&&(Ja=["stage 2 shaders"]);let ct=null,Za=null,wo=()=>{({P:ct,failed:Za}=P0(e,ie,kr("tube3")))};g.tubeLumen&&!pe.includes("tube3")?wo():!g.tubeLumen&&v==="stage"&&(Za=["stage 3 shaders"]);let Qa=null,ei=null,bo=()=>{({P:Qa,failed:ei}=k0(e,ie,kr("tubeGlow")))};g.tubeGlow&&!pe.includes("tubeGlow")?bo():!g.tubeGlow&&v==="stage"&&(ei=["tubeGlow"]),v!=="lobule"||g.tubeStrip||Tt==="shader failed"||(Cl(),g.tubePatch?po():Tt="shader failed",g.tubeLean?mo():Ja=["stage 2 shaders"],g.tubeLumen?wo():Za=["stage 3 shaders"],g.tubeGlow?bo():ei=["tubeGlow"]);function bu(t){let r=Math.ceil(D()/2),n=Math.ceil(B()/2);return ee.tex||(ee.tex=oe(e,e.LINEAR),ee.fbo=e.createFramebuffer()),(ee.w!==r||ee.h!==n)&&(ee.w=r,ee.h=n,uo=!1,e.bindTexture(e.TEXTURE_2D,ee.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,r,n,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,ee.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,ee.tex,0),ee.ok=ll(e,e.FRAMEBUFFER,"rgba8",r,n),t()),ee.ok}let jr=[],ti=0,xo=!0,xu=()=>{if(xo){ti=0;for(let t=0;t<jr.length;t++)jr[t]>ti&&(ti=jr[t]);xo=!1}return ti},ur=null,Gr=null,zl=()=>{try{ur=ie(e,g.fuseGen),Gr=g.fuseOne?ie(e,g.fuseOne):null}catch(t){console.warn("Veins renderer: the one-pass shader failed; zoom frames keep two passes.",t);for(let r of kr("fused"))e.deleteProgram(r.p);ur=Gr=null}};g.fuseGen&&!pe.includes("fused")&&zl();let de=[null,null],Wl=!1,ca=()=>{let t=!!de[0]||!!H?.has(0);t!==Wl&&(Wl=t,M?.(t))},H=hl(e),vo=!!H?.painter&&Xe,ut={},ht=[],vu={lay:Tl,up:ru,reuse:eu},ri=t=>{if(!(!Kn||ut[t]||X||(t==="lay"?Ie:t==="up"?ot:N.P)!==null)){try{ut[t]=ae(e,sr,vu[t])}catch(r){ir("veins-gl:1970",r)}!sa&&ut[t]&&fc(t,!1)}},ve=null,Ie=null,dn=!1;if(vo&&Kn)try{o0(e)}catch(t){ir("veins-gl:1975",t)}let pn=null;try{pn=ie(e,g.cath)}catch(t){console.warn("Veins renderer: catheter shader failed.",t)}let Ao=e.createBuffer(),go=e.createVertexArray();e.bindVertexArray(go),e.bindBuffer(e.ARRAY_BUFFER,Ao);for(let t=0;t<3;t++)e.enableVertexAttribArray(t),e.vertexAttribPointer(t,2,e.FLOAT,!1,24,t*8);e.bindVertexArray(null);let Eo=!1,te=null,Hl=!1,To=0,ni=null,mn=null,wn=null;try{wn=ie(e,g.line)}catch(t){console.warn("Veins renderer: outline shader failed.",t)}pe.length||la();let Ro=e.createBuffer(),yo=e.createVertexArray();e.bindVertexArray(yo),e.bindBuffer(e.ARRAY_BUFFER,Ro);for(let t=0;t<3;t++)e.enableVertexAttribArray(t),e.vertexAttribPointer(t,2,e.FLOAT,!1,24,t*8);e.bindVertexArray(null);let Xr=[0,0,0],ua=[new Float64Array(64),new Float64Array(64),new Float64Array(64)],Fo=[new Float64Array(64),new Float64Array(64),new Float64Array(64)],hr=[0,0,0],$l=[0,0,0],dr=(t,r)=>{let n=ua[t];if(hr[t]>=n.length){let a=new Float64Array(n.length*2);a.set(n),ua[t]=n=a}n[hr[t]++]=r},So=!1,Pe=0,_o=new Set,pr=0,ke=0,Bo=0,mr=16,Qe=new Float32Array(mr*4),Yl=new Float64Array(mr).fill(-1),ai=new Uint8Array(mr),bn=Zi(mr),Do=Zi(mr),Vr=new Float64Array(6).fill(NaN),ii=!1,Kl=NaN;function Au(t,r,n,a,i,s,o=null){let u=i[0]*s,c=i[1]*s,m=i[2]*s,h=i[3]*s;for(let d=0;d<n;d++){if(o&&!o[d])continue;let x=i[0]*r[d*a]+i[2]*r[d*a+1]+i[4],A=i[1]*r[d*a]+i[3]*r[d*a+1]+i[5];t.add(Math.min(x,x+u,x+m,x+u+m)-1,Math.min(A,A+c,A+h,A+c+h)-1,Math.max(x,x+u,x+m,x+u+m)+1,Math.max(A,A+c,A+h,A+c+h)+1)}}function Mo(t,r,n,a,i,s){let o=1/0,u=1/0,c=-1/0,m=-1/0;for(let h=0;h<4;h++){let d=h&1?a:r,x=h&2?i:n,A=s[0]*d+s[2]*x+s[4],R=s[1]*d+s[3]*x+s[5];A<o&&(o=A),A>c&&(c=A),R<u&&(u=R),R>m&&(m=R)}t.add(o-1,u-1,c+1,m+1)}function gu(t,r,n,a,i,s,o,u,c){let m=t&&r[0]===Vr[0]&&r[1]===Vr[1]&&r[2]===Vr[2]&&r[3]===Vr[3]&&r[4]===Vr[4]&&r[5]===Vr[5];for(let d=0;d<6;d++)Vr[d]=r[d];if(ii=!a,n||a||!m||!D()||!B()||i&&!Xo||u&&!($e[2]>$e[0]))return;let h=Do;if(h.begin(Pe,D(),B()),He){if(!nn){h.unknown(Pe);return}if(ql(nn,He,r,br,D(),B()),!h.addFrom(oi,0)){h.unknown(Pe);return}}if(i){if(!le){h.unknown(Pe);return}Au(h,le,$,6,r,16,Xo)}s&&Mo(h,xr[0],xr[1],xr[2],xr[3],r),o&&Mo(h,vr[0],vr[1],vr[2],vr[3],r),u&&Mo(h,$e[0],$e[1],$e[2],$e[3],r),c&&h.add(c[0],c[1],c[2],c[3])}let oi=Zi(1),re={cells:null,ver:-1,n:-1,size:-1,W:-1,H:-1,m:new Float64Array(6).fill(NaN),rect:new Float64Array(4)};function ql(t,r,n,a,i,s){if(re.cells===t&&re.ver===No&&re.n===r&&re.size===a&&re.W===i&&re.H===s&&n[0]===re.m[0]&&n[1]===re.m[1]&&n[2]===re.m[2]&&n[3]===re.m[3]&&n[4]===re.m[4]&&n[5]===re.m[5]){w.on&&w.note(we.boxesKept);return}w.on&&w.note(we.boxesMade);let o=1/0,u=1/0,c=-1/0,m=-1/0,h=n[0]*a,d=n[1]*a,x=n[2]*a,A=n[3]*a;oi.begin(0,i,s);for(let R=0;R<r;R++){let F=n[0]*t[R*6]+n[2]*t[R*6+1]+n[4],k=n[1]*t[R*6]+n[3]*t[R*6+1]+n[5],P=Math.min(F,F+h,F+x,F+h+x),ue=Math.max(F,F+h,F+x,F+h+x),Ee=Math.min(k,k+d,k+A,k+d+A),At=Math.max(k,k+d,k+A,k+d+A);P<o&&(o=P),ue>c&&(c=ue),Ee<u&&(u=Ee),At>m&&(m=At),oi.add(P-1,Ee-1,ue+1,At+1)}re.cells=t,re.ver=No,re.n=r,re.size=a,re.W=i,re.H=s;for(let R=0;R<6;R++)re.m[R]=n[R];re.rect[0]=o,re.rect[1]=u,re.rect[2]=c,re.rect[3]=m}function Eu(t,r,n,a,i,s=null){let o=t%mr,u=o*4;if(Yl[o]=t,!r||!a||!D()||!B()){ai[o]=0,bn.unknown(t);return}let c=D(),m=B();ql(r,n,a,i,c,m);let h=re.rect[0],d=re.rect[1],x=re.rect[2],A=re.rect[3];if(bn.begin(t,c,m),!bn.addFrom(oi,0)){ai[o]=0,bn.unknown(t);return}if(s){let R=1/0,F=1/0,k=-1/0,P=-1/0;for(let ue=0;ue<4;ue++){let Ee=ue&1?s[2]:s[0],At=ue&2?s[3]:s[1],nr=a[0]*Ee+a[2]*At+a[4],ar=a[1]*Ee+a[3]*At+a[5];nr<R&&(R=nr),nr>k&&(k=nr),ar<F&&(F=ar),ar>P&&(P=ar)}bn.add(R-1,F-1,k+1,P+1),R<h&&(h=R),k>x&&(x=k),F<d&&(d=F),P>A&&(A=P)}ai[o]=1,Qe[u]=Math.max(0,h-1),Qe[u+1]=Math.max(0,d-1),Qe[u+2]=Math.min(c,x+1),Qe[u+3]=Math.min(m,A+1)}function Tu(t,r,n){if(!(r>t)||r-t>mr)return!1;let a=1/0,i=1/0,s=-1/0,o=-1/0;for(let u=t+1;u<=r;u++){let c=u%mr;if(Yl[c]!==u||!ai[c])return!1;let m=c*4;Qe[m+2]>Qe[m]&&Qe[m+3]>Qe[m+1]&&(a=Math.min(a,Qe[m]),i=Math.min(i,Qe[m+1]),s=Math.max(s,Qe[m+2]),o=Math.max(o,Qe[m+3]))}return n[0]=a,n[1]=i,n[2]=s,n[3]=o,!0}let Ru=t=>t(),si=(t=!1)=>{if(t){pr++;return}Pe++,Do.unknown(Pe),ii=!1,_o.forEach(Ru)},Ce=null,Jl=!1,Zl=-1,Ql=-1,zr=0,ha=-1,ef=-1,da=-1,tf=-1,pa=-1,rf=-1,Wr=new Float64Array(6).fill(NaN),Rt=[],Oo=()=>{let t=oe(e);return e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),{tex:t,fbo:e.createFramebuffer(),w:0,h:0}},Hr=Oo(),xn=Oo(),vn=Oo(),nf=()=>$u(Y),af=()=>wa(Y,!1),of=null,yu=()=>H.render(of,D(),B()),wr=[0,0,0,0,0,0],$r=null,Lo=!1,Uo=!1,sf=0,lf=()=>{if($r=null,performance.now()-sf<400){let t=setTimeout(lf,400);$r=()=>clearTimeout(t);return}Uo=!0,!X&&H?.has(0)&&H.prepMove(wr,D(),B())};function Fu(t,r){if(!r){$r&&($r(),$r=null),Lo=!1;return}if(!Lo||wr[0]!==t[0]||wr[1]!==t[1]||wr[2]!==t[2]||wr[3]!==t[3]||wr[4]!==t[4]||wr[5]!==t[5]){for(let n=0;n<6;n++)wr[n]=t[n];Lo=!0,Uo=!1,sf=performance.now()}!$r&&!Uo&&($r=jc(lf,700))}let Su=()=>Io(Hr,Y,!1),_u=()=>Io(xn,Y,!0),Bu=()=>Io(vn,Y,!0,!0),ma=1,De={tex:null,fbo:null,w:0,h:0},Du=t=>t.soft&&!t.warm,Mu=t=>!t.soft&&!t.under,Ou=t=>t.warm||t.under,Lu=()=>!!Ce?.draws.some(Du),Uu=()=>!!Ce?.draws.some(Mu),Iu=()=>!!Ce?.draws.some(Ou);function Io(t,r,n,a=!1){if(ma<1&&t!==Hr){ku(t,r,n,a);return}(t.w!==D()||t.h!==B())&&(t.w=D(),t.h=B(),e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t.w,t.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t.tex,0)),e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.viewport(0,0,t.w,t.h),e.clearBufferfv(e.COLOR,0,[0,0,0,0]),wa(r,n,a),a&&wa(r,!1,!1,!0),e.bindFramebuffer(e.FRAMEBUFFER,_())}function ku(t,r,n,a){let i=Math.max(1,Math.round(D()*ma)),s=Math.max(1,Math.round(B()*ma));De.tex||(De.tex=oe(e),De.fbo=e.createFramebuffer()),(De.w!==i||De.h!==s)&&(De.w=i,De.h=s,e.bindTexture(e.TEXTURE_2D,De.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,i,s,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,De.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,De.tex,0)),(t.w!==D()||t.h!==B())&&(t.w=D(),t.h=B(),e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t.w,t.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t.tex,0)),e.bindFramebuffer(e.FRAMEBUFFER,De.fbo),e.viewport(0,0,i,s),e.clearBufferfv(e.COLOR,0,[0,0,0,0]),wa(r,n,a),e.bindFramebuffer(e.READ_FRAMEBUFFER,De.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,t.fbo),e.disable(e.SCISSOR_TEST),e.blitFramebuffer(0,0,i,s,0,0,t.w,t.h,e.COLOR_BUFFER_BIT,e.LINEAR),a&&(e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.viewport(0,0,t.w,t.h),wa(r,!1,!1,!0)),e.bindFramebuffer(e.READ_FRAMEBUFFER,_()),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,_()),e.bindFramebuffer(e.FRAMEBUFFER,_())}function An(t){t.w&&(t.w=t.h=0,e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null))}function wa(t,r,n=!1,a=!1){let i=wn.u;e.useProgram(wn.p),l.m3(i.world,lr(Ge.world,t[0],t[1],t[2],t[3],t[4],t[5])),l.f2(i.size,D(),B()),l.f1(i.soft,r?1:0),l.f1(i.pack,n?1:0),e.enable(e.BLEND),n?(e.blendEquation(e.MAX),e.blendFunc(e.ONE,e.ONE)):e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.bindVertexArray(yo);for(let s of Ce.draws)s.alpha<=0||!!s.soft!=!!r||!!s.warm!==n||!!s.under!==a||(l.f4(i.col,s.col[0],s.col[1],s.col[2],s.alpha),l.f2(i.endFade,s.endFade?s.endFade[0]:0,s.endFade?s.endFade[1]:0),e.drawArrays(s.tri?e.TRIANGLES:e.TRIANGLE_STRIP,s.first,s.count));e.bindVertexArray(null),n&&e.blendEquation(e.FUNC_ADD),e.disable(e.BLEND)}let We=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,We),e.bufferData(e.ARRAY_BUFFER,Qh,e.STATIC_DRAW);let Yr=e.createVertexArray(),ba=e.createBuffer();e.bindVertexArray(Yr),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,ba),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,24,8),e.vertexAttribDivisor(2,1),e.bindVertexArray(null);let xa=e.createBuffer(),li=t=>{let r=e.createVertexArray();return e.bindVertexArray(r),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,t),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,24,8),e.vertexAttribDivisor(2,1),e.bindVertexArray(null),r},gn=li(xa),Gt=0,et=0,va=null;function fi(){va=jt&&le?r0(le,$,at):null;let{gen:t,one:r,nGen:n,nOne:a}=ul(le||new Float32Array(0),le?$:0,va);e.bindBuffer(e.ARRAY_BUFFER,ba),e.bufferData(e.ARRAY_BUFFER,t,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,xa),e.bufferData(e.ARRAY_BUFFER,r,e.STATIC_DRAW),Gt=n,et=a}let En=e.createVertexArray(),Aa=e.createBuffer(),ko=(t,r)=>{e.bindVertexArray(t),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,r),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null)};ko(En,Aa);let He=0,br=16,No=0;function Po(t){let r=t.bloodQ;br=r?16/2:16;let n=r?t.bloodQ:t.blood||t.cells;e.bindBuffer(e.ARRAY_BUFFER,Aa),e.bufferData(e.ARRAY_BUFFER,n,e.STATIC_DRAW),He=r?t.nBloodQ:t.blood?t.nBlood:t.nCells,nn=n,No++}let ci=e.createVertexArray(),Co=e.createBuffer();e.bindVertexArray(ci),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Co),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,24,8),e.vertexAttribDivisor(2,1),e.bindVertexArray(null);let jo=e.createBuffer(),Go=li(jo),ui=0,hi=0,Xo=null,Vo=e.createBuffer(),zo=e.createVertexArray();e.bindVertexArray(zo),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Vo),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);let Wo=e.createBuffer(),Ho=e.createVertexArray();e.bindVertexArray(Ho),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Wo),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);let $o=e.createBuffer(),Yo=e.createVertexArray();e.bindVertexArray(Yo),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,$o),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);let ff=0,xr=new Float64Array(4),vr=new Float64Array(4),$e=new Float64Array(4).fill(NaN),ga=new Map,Tn={a:new Float32Array(2048),n:0,reset(){this.n=0},push(t,r){if(this.n+2>this.a.length){let n=new Float32Array(this.a.length*2);n.set(this.a),this.a=n}this.a[this.n++]=t,this.a[this.n++]=r},send(t){if(e.bindBuffer(e.ARRAY_BUFFER,t),(ga.get(t)||0)<this.n){let r=Math.max(this.n,2*(ga.get(t)||0),512);e.bufferData(e.ARRAY_BUFFER,r*4,e.DYNAMIC_DRAW),ga.set(t,r)}return this.n&&e.bufferSubData(e.ARRAY_BUFFER,0,this.a,0,this.n),this.n/2}},Kr={sub:0,grow:0,bytes:0};function Ko(t,r,n=r.length){e.bindBuffer(e.ARRAY_BUFFER,t);let a=n*4,i=(ga.get(t)||0)*4;if(a>i){let s=Math.ceil(Math.max(a+(a>>1),1024)/4)*4;e.bufferData(e.ARRAY_BUFFER,s,e.DYNAMIC_DRAW),ga.set(t,s/4),Kr.grow++,Kr.bytes+=s-i}else Kr.sub++;a&&e.bufferSubData(e.ARRAY_BUFFER,0,r,0,n)}let cf=new WeakMap;function Nu(t,r,n,a,i,s,o){e.bindTexture(e.TEXTURE_2D,t);let u=cf.get(t)||0;if(s>u){let c=Math.max(s+(s>>2),16);e.texImage2D(e.TEXTURE_2D,0,r,i,c,0,n,a,null),cf.set(t,c),Kr.grow++}else Kr.sub++;e.texSubImage2D(e.TEXTURE_2D,0,0,0,i,s,n,a,o)}function Pu(t,r){let n=r[0]*r[3]-r[1]*r[2]||1e-9,a=r[3]/n,i=-r[1]/n,s=-r[2]/n,o=r[0]/n,u=1/0,c=1/0,m=-1/0,h=-1/0;for(let d=0;d<4;d++){let x=d&1?t[2]:t[0],A=d&2?t[3]:t[1],R=x-r[4],F=A-r[5],k=a*R+s*F,P=i*R+o*F;u=Math.min(u,k),c=Math.min(c,P),m=Math.max(m,k),h=Math.max(h,P)}Tn.reset();for(let d=Math.floor(c/16)*16;d<h;d+=16)for(let x=Math.floor(u/16)*16;x<m;x+=16)Tn.push(x,d);ff=Tn.send($o),xr[0]=Math.floor(u/16)*16,xr[1]=Math.floor(c/16)*16,xr[2]=Math.ceil(m/16)*16+16,xr[3]=Math.ceil(h/16)*16+16}let di=oe(e),qo=null,uf=0,Rn=null,yt=0,pi=0,Jo=null,Zo=0,Me=e.createVertexArray();e.bindVertexArray(Me),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null);let Xt=oe(e),Cu=null,Ea=oe(e),Ta=oe(e),yn=oe(e),Fn=oe(e,e.LINEAR);e.bindTexture(e.TEXTURE_2D,Ea),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,W,p,0,e.RGBA,e.FLOAT,null),e.bindTexture(e.TEXTURE_2D,Ta),e.texImage2D(e.TEXTURE_2D,0,e.R32F,1,p,0,e.RED,e.FLOAT,new Float32Array(p)),e.bindTexture(e.TEXTURE_2D,yn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,no,p,0,e.RGBA,e.FLOAT,null),e.bindTexture(e.TEXTURE_2D,Fn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(4));let Sn=oe(e);e.bindTexture(e.TEXTURE_2D,Sn),e.texImage2D(e.TEXTURE_2D,0,e.R32F,W,p,0,e.RED,e.FLOAT,new Float32Array(W*p));let Ra=new Float32Array(W*2*p),mi=new Uint8Array(p),ya=new Float32Array(p*4),Vt=1/0,qr=-1,_n=null,hf=0,Fa=!1;function ju(){if(!(qr<Vt&&!Fa)){if(_n?e.bindTexture(e.TEXTURE_2D,_n):(_n=oe(e),e.texImage2D(e.TEXTURE_2D,0,e.RG32F,W+2,p,0,e.RG,e.FLOAT,null),Vt=0,qr=p-1,Fa=!0),qr>=Vt){let t=qr-Vt+1;w.on&&w.note("uploaded: axes",t*W*8/1024),e.texSubImage2D(e.TEXTURE_2D,0,0,Vt,W,t,e.RG,e.FLOAT,Ra,Vt*W*2)}Fa&&e.texSubImage2D(e.TEXTURE_2D,0,W,0,2,p,e.RG,e.FLOAT,ya),Vt=1/0,qr=-1,Fa=!1}}let Bn=K0(p),Qo=e.createBuffer(),es=e.createVertexArray();e.bindVertexArray(es),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,Qo),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null);function df(t,r,n,a,i,s){ju();let o=Pr.u;e.useProgram(Pr.p),rr(o,r,n,a,i),se(o,12,_n,"axis"),l.m3(o.world,lr(Ge.world,t[0],t[1],t[2],t[3],t[4],t[5])),l.f2(o.size,D(),B()),l.i1(o.stillOn,s?1:0),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.bindVertexArray(es),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,Bn.count()),e.bindVertexArray(null),e.disable(e.BLEND),e.activeTexture(e.TEXTURE12),e.bindTexture(e.TEXTURE_2D,Sn),w.on&&w.gauge("arrowheads",`${Bn.count()} quads`)}let Sa=new Float32Array(W*4*p),pf=new Float32Array(p),zt=1/0,_a=-1;function wi(){if(_a<zt)return;let t=_a-zt+1;w.on&&w.note("uploaded: setRadii",t*(W*16+4)/1024),e.bindTexture(e.TEXTURE_2D,Ea),e.texSubImage2D(e.TEXTURE_2D,0,0,zt,W,t,e.RGBA,e.FLOAT,Sa,zt*W*4),e.bindTexture(e.TEXTURE_2D,Ta),e.texSubImage2D(e.TEXTURE_2D,0,0,zt,1,t,e.RED,e.FLOAT,pf,zt),zt=1/0,_a=-1}let ts=new Float32Array(W),mf=new Uint32Array(ts.buffer),wf=new Uint32Array(W*p),Dn=oe(e),Ba=oe(e,e.LINEAR),Da=null;e.bindTexture(e.TEXTURE_2D,Dn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,fr+1,p,0,e.RGBA,e.FLOAT,null),e.bindTexture(e.TEXTURE_2D,Ba),e.texImage2D(e.TEXTURE_2D,0,e.R16F,or,p,0,e.RED,e.FLOAT,new Float32Array(or*p));let bi=null,bf=!1,Jr=null,xf=!1,Ye=new Uint8Array(p),rs=new Float32Array(p*4).fill(-1),Ft=!0,Zr=null,V=new Float64Array(384),dt=0,Ma=null,C=0,ns=0,he=t=>{if(t&&typeof t=="object")for(let r=0;r<t.length&&C<V.length;r++)V[C++]=+t[r]||0;else C<V.length&&(V[C++]=+t||0)},as=new Uint8Array(p),vf=NaN,is=[0,0],os=(t,r,n)=>{for(let a=0;a<p;a++)if(!Ye[a]){for(let i=a*n,s=i+n;i<s;i++)if(t[i]!==r[i]){Ye[a]=1;break}}},Ar=e.createFramebuffer(),Oe=oe(e),Mn=oe(e),Qr=oe(e),On=oe(e),Af=()=>[[e.RGBA8,e.RGBA,e.UNSIGNED_BYTE],[e.RGBA16UI,e.RGBA_INTEGER,e.UNSIGNED_SHORT],[e.RG16UI,e.RG_INTEGER,e.UNSIGNED_SHORT],[e.R8,e.RED,e.UNSIGNED_BYTE]],gf=e.createFramebuffer(),ss=oe(e);e.bindTexture(e.TEXTURE_2D,ss),e.texImage2D(e.TEXTURE_2D,0,e.R8,1,1,0,e.RED,e.UNSIGNED_BYTE,new Uint8Array(1));let L=0,I=0,Y=null,en=!1,Ef=!1,xi=new Float64Array(6),Tf="";function vi(t){let r=!Y;for(let n=0;n<6;n++)xi[n]!==t[n]&&(xi[n]=t[n],r=!0);Y=xi,r&&(Tf=xi.join(","))}let Ln=0,Un=0,tn=null,tt=[e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1,e.COLOR_ATTACHMENT2,e.COLOR_ATTACHMENT3],Ai=[e.COLOR_ATTACHMENT0],Gu=[e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1,e.NONE,e.COLOR_ATTACHMENT3],Q=!1,me=null,gi=[0,0],ls=!1,gr=!1,Oa=!1,In=[0,0],kn=[null,null,null],fs=[0,0],La=null,Ei=!1;function Xu(t,r){L===t&&I===r&&Ln===D()&&Un===B()||(Ln=D(),Un=B(),Q=!1,Si(),me=null,!(L===t&&I===r)&&(L=t,I=r,w.on&&xe(L*I*17/1024),e.bindTexture(e.TEXTURE_2D,Oe),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,L,I,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindTexture(e.TEXTURE_2D,Mn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA16UI,L,I,0,e.RGBA_INTEGER,e.UNSIGNED_SHORT,null),e.bindTexture(e.TEXTURE_2D,Qr),e.texImage2D(e.TEXTURE_2D,0,e.RG16UI,L,I,0,e.RG_INTEGER,e.UNSIGNED_SHORT,null),e.bindTexture(e.TEXTURE_2D,On),e.texImage2D(e.TEXTURE_2D,0,e.R8,L,I,0,e.RED,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,Ar),me=null,e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Oe,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT1,e.TEXTURE_2D,Mn,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT2,e.TEXTURE_2D,Qr,0),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT3,e.TEXTURE_2D,On,0),Ei&&(e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,null),Ei=!1),e.drawBuffers(tt),e.bindFramebuffer(e.FRAMEBUFFER,_())))}let Ua=new Float32Array(4),Rf=new Uint32Array(4);function Ia(){e.clearBufferfv(e.COLOR,0,Ua),e.clearBufferuiv(e.COLOR,1,Rf),e.clearBufferuiv(e.COLOR,2,Rf),e.clearBufferfv(e.COLOR,3,Ua)}let Vu=[0,0,0,0],zu=[0,0,0,0],Wu=[0,0,0,0];function yf(t,r){let n=te.base,a=n?n.length/6:0,i=te.verts,s=1/0,o=1/0,u=-1/0,c=-1/0;for(let h of te.draws)for(let d=h.first,x=h.first+h.count;d<x;d++){let A=d<a?n:i,R=(d<a?d:d-a)*6;if(R+1>=A.length)continue;let F=t[0]*A[R]+t[2]*A[R+1]+t[4],k=t[1]*A[R]+t[3]*A[R+1]+t[5];F<s&&(s=F),F>u&&(u=F),k<o&&(o=k),k>c&&(c=k)}if(!(u>=s&&c>=o))return null;let m=r;return m[0]=Math.max(0,Math.floor(s)-2),m[1]=Math.max(0,Math.floor(o)-2),m[2]=Math.min(D(),Math.ceil(u)+2),m[3]=Math.min(B(),Math.ceil(c)+2),m[2]>m[0]&&m[3]>m[1]?m:null}let Ff=0,cs=0,Hu=[0,1,1];function $u(t){let r=pn.u;e.useProgram(pn.p),l.m3(r.world,lr(Ge.world,t[0],t[1],t[2],t[3],t[4],t[5])),l.f2(r.size,D(),B()),l.f2a(r.light,te.light||e0),me&&!Z.fbo&&(me=null);let n=me?Z.tex:null,a=me,i=Z.w,s=Z.h;gr&&(kn[0]=Oe,n=kn,a=In,i=L,s=I),l.i2(r.lA,J[0],J[1]),l.i2(r.lWrap,Fe[0],Fe[1]),l.i2(r.lSize,L,I),l.i1(r.lH,B()),l.f2(r.lowS,n?a[0]/L:0,n?a[1]/I:0),l.i2(r.lowSz,n?a[0]:0,n?a[1]:0),l.f2(r.lowT,n?i:1,n?s:1),se(r,0,n?n[0]:Oe,"base"),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.bindVertexArray(go);let o=Ni&&Ni.clock||0,u=o-Ff;Ff=o,u>0&&u<.5||(u=0);for(let c of te.draws){l.i1(r.mode,c.mode),l.i1(r.under,c.under?1:0);let m=c.taper||Hu;l.f3a(r.taper,m);let h=c.echo;if(l.f1(r.echoK,h?h.k:0),h&&(l.f4a(r.fanA,h.a),l.f2a(r.fanB,h.b)),c.mode===9){let d=c.dop;if(d){let x=d.flowFn?d.flowFn():0;cs=(cs+x*u)%700,l.f4a(r.dopP0,d.p[0]),l.f4a(r.dopP1,d.p[1]),l.f4a(r.dopP2,d.p[2]),l.f4a(r.dopP3,d.p[3]),l.f4a(r.dopP4,d.p[4]),l.f4a(r.dopQ,d.q),l.f4a(r.dopG,d.cast),l.f4(r.dopF,x,cs,0,0),l.f3a(r.dopTow,d.tow),l.f3a(r.dopAway,d.away)}else l.f4(r.dopQ,0,0,0,0)}l.f3a(r.col,c.col),l.f1(r.alpha,c.alpha),l.f2a(r.fade,c.fade||[0,0]),l.f1(r.len,c.len??1e9),e.drawArrays(c.tri?e.TRIANGLES:e.TRIANGLE_STRIP,c.first,c.count)}e.bindVertexArray(null),e.disable(e.BLEND)}let $=0,X=!1,Ti=null,Ri=0,Sf=0,_f=new Float64Array(6),Yu=new Float64Array(6),yi=new Float64Array(6),rn=new Float64Array(6),us=(t,r)=>Number.isInteger(t[4])&&Number.isInteger(t[5])?t:(r[0]=t[0],r[1]=t[1],r[2]=t[2],r[3]=t[3],r[4]=Math.round(t[4]),r[5]=Math.round(t[5]),r),Nn=(t,r)=>t[0]===r[0]&&t[1]===r[1]&&t[2]===r[2]&&t[3]===r[3],Fi=[0,0,0,0],St=new Float64Array(64),hs=new Float64Array(64),pt=0,ds=-1,mt=t=>{let r=pt;for(let n=0;n<t.length;n++)St[r++]=t[n];St[r++]=-7.25,pt=r},Ku=t=>{if(St.length<512&&(St=new Float64Array(512),hs=new Float64Array(512),ds=-1),pt=0,St[pt++]=t.reach,mt(t.shOff),mt(t.casing),mt(t.shadow),mt(t.sheen),mt(t.shade),mt(t.rim||Fi),mt(t.paper||Fi),mt(t.ring),mt(t.light),St[pt++]=t.netAlpha,St[pt++]=t.fx?1:0,mt(t.tierAlpha),mt(t.tierGroup),St[pt++]=t.organs,pt!==ds)return!1;for(let r=0;r<pt;r++)if(St[r]!==hs[r])return!1;return!0},ps=()=>{for(let t=0;t<pt;t++)hs[t]=St[t];ds=pt},Er=!0,Pn=!1,ms=!1,Bf=!!e.getContextAttributes()?.stencil,Df=t=>!!Nr&&!(en&&t.dye!==!1)&&!t.origin&&!t.bleed?.length,qu=()=>!!ur&&!!cn&&(!et||!!Gr)&&(b?!!b.rb&&b.w===D()&&b.h===B():Bf),Fe=[0,0],J=[0,0],Wt=[!1,!1],Si=()=>{Fe[0]=0,Fe[1]=0},je=[0,0],rt=new Float64Array(6),Ke=new Float64Array(6);function Mf(t,r,n,a,i){let s=((t+n)%a+a)%a,o=s-t,u=Math.min(r,a-s);return i[0]=s,i[1]=u,i[2]=o,r>u?(i[3]=0,i[4]=r-u,i[5]=o-a,2):1}let wt=null,bt=null,Ne=0,ws=!0,Cn=C0(),Ht=[null,0],$t=[null,0],xt=null,bs=null,nt={all:!0,n:0,r:new Int32Array(16)},Se={all:!0,n:0,r:new Int32Array(16)},Of=new Float64Array(4),Ju=(t,r,n,a)=>{if(Se.n<4){let i=Se.n++*4;Se.r[i]=t,Se.r[i+1]=r,Se.r[i+2]=n,Se.r[i+3]=a}else Se.all=!0},Ae={sx:1,sy:1,w:0,h:0,m:null,ms:new Float64Array(6)},Tr=[0,0],_t=[0,0],Lf=!1;try{Lf=typeof matchMedia=="function"&&matchMedia("(pointer: coarse)").matches&&(globalThis.devicePixelRatio||1)>=3}catch(t){ir("veins-gl:lumPhone",t)}let xs=G0(v,Lf),jn=j0(),Uf=[0,0],If=()=>{if(Ne===5){Jt.lumen(wt,bt,ws);return}Cn.stale(),Ne>=3&&Ia(),Jt.drew=0,!((Ne===0||Ne>=3)&&Dt()&&Jt(wt,bt))&&(Ne===1||Ne===2?(Ht[0]=ci,Ht[1]=ui,$t[0]=Go,$t[1]=hi,Es(wt,bt,Ht,$t,!0,Ne===2)):(Ht[0]=Yr,Ht[1]=Gt,$t[0]=gn,$t[1]=et,Es(wt,bt,Ht,$t)))};function Bt(t,r,n,a,i=!1){if(!(n>0&&a>0)){je[0]=0,je[1]=0;return}let s=L,o=I,u=Mf(t,n,Fe[0]-J[0],s,rt),c=Mf(r,a,Fe[1]-J[1],o,Ke),m=xt,h=bs;if(!i&&!h&&u===1&&c===1&&!rt[0]&&!Ke[0]&&rt[1]===s&&Ke[1]===o){je[0]=m?rt[2]*m.sx:rt[2],je[1]=m?Ke[2]*m.sy:Ke[2],If(),je[0]=0,je[1]=0;return}i||e.enable(e.SCISSOR_TEST);for(let d=0;d<u;d++)for(let x=0;x<c;x++){if(m||h){let A=rt[d*3],R=A+rt[d*3+1],F=Ke[x*3],k=F+Ke[x*3+1];if(h){if(!El(A,R-A,rt[d*3+2],h[0],h[2],Tr)||(A=Tr[0],R=Tr[1],!El(F,k-F,Ke[x*3+2],h[1],h[3],_t)))continue;F=_t[0],k=_t[1]}let P=m?m.sx:1,ue=m?m.sy:1,Ee=m?m.h:o;gl(A,R-A,P,Tr),gl(F,k-F,ue,_t),e.scissor(Tr[0],Ee-_t[0]-_t[1],Tr[1],_t[1]),h&&Ju(Tr[0],Ee-_t[0]-_t[1],Tr[1],_t[1]),je[0]=rt[d*3+2]*P,je[1]=Ke[x*3+2]*ue}else e.scissor(rt[d*3],o-Ke[x*3]-Ke[x*3+1],rt[d*3+1],Ke[x*3+1]),je[0]=rt[d*3+2],je[1]=Ke[x*3+2];If()}je[0]=0,je[1]=0,i||e.disable(e.SCISSOR_TEST)}let Zu=[0,0,0,0,!1,!1];function vs(t){let r=Zu,n=D(),a=B();if(r[0]=0,r[1]=0,r[2]=0,r[3]=0,r[4]=!1,r[5]=!1,zn||Oa||!tn)return r[0]=n,r[1]=a,r;let i=1/0,s=-1/0,o=1/0,u=-1/0;for(let c=0;c<4;c++){let m=tn[(c&1)*2],h=tn[1+(c>>1)*2],d=t[0]*m+t[2]*h+t[4],x=t[1]*m+t[3]*h+t[5];d<i&&(i=d),d>s&&(s=d),x<o&&(o=x),x>u&&(u=x)}for(let c=0;c<2;c++){let m=c?o:i,h=c?u:s,d=c?I:L,x=c?a:n,A=Math.floor(m)-1,R=Math.ceil(h)+1-A,F=Math.ceil(R/64)*64,k=d>=F&&d<x&&d<=F*2?d:Math.ceil(R*1.25/64)*64;if(!(R>0)||k>=x){r[c]=x;continue}r[c]=k,r[c+2]=A,r[c+4]=!0}return r}function As(t){Xu(t[0],t[1]),J[0]=t[2],J[1]=t[3],Wt[0]=t[4],Wt[1]=t[5],Fe[0]=0,Fe[1]=0}function Qu(t,r,n,a){let i=L,s=I;Wt[0]?J[0]+=n:Fe[0]=((Fe[0]-n)%i+i)%i,Wt[1]?J[1]+=a:Fe[1]=((Fe[1]-a)%s+s)%s;let o=!Wt[0]&&n!==0,u=!Wt[1]&&a!==0;!o&&!u||(e.bindFramebuffer(e.FRAMEBUFFER,Ar),me=null,e.viewport(0,0,i,s),e.enable(e.SCISSOR_TEST),wt=t,bt=r,Ne=3,o&&(n>0?Bt(0,J[1],n,s,!0):Bt(i+n,J[1],-n,s,!0)),u&&(a>0?Bt(J[0],0,i,a,!0):Bt(J[0],s+a,i,-a,!0)),e.disable(e.SCISSOR_TEST))}let le=null,at=null,it=null,nn=null,Rr=new Set,Yt=null,vt=0,ka=()=>{Rr.clear(),Yt=null,vt=0},_i="",Kt=t=>(_i=t,Ji(Mr.refused,t),w.on&&w.note(we.rowsRefused+t),!1),Bi=t=>{if(!Rr.size)return!0;if(!t)return!1;for(let r of Rr)if(!t.includes(r))return!1;return!0},yr=no*4,qt=new Float32Array(p*yr),kf=null,Na=()=>(kf||=new Float32Array(qt.length)).set(qt),eh={shape:[],tint:[]},Nf={mark:null,k:0},Pf={mark:null,k:0},th={part:Nf,tintPart:Pf},Di={mark:null,k:0};function Mi(t){let{shape:r,tint:n}=n0(t,qt,kf,yr,Rr,eh),a=gs(r,null,Nf);if(vt)for(let i=0;i<$;i++)Yt[i]&&!a.mark[i]&&(a.mark[i]=1,a.k++);return gs(n,a.mark,Pf),th}let ge=128,Oi=12,fe=new Int32Array(Oi*4),Gn=new Uint8Array(0);function rh(t,r){let n=J[0],a=J[1],i=L,s=I,o=Math.ceil(i/ge),u=Math.ceil(s/ge);Gn.length<o*u&&(Gn=new Uint8Array(o*u)),Gn.fill(0,0,o*u);for(let A=0;A<$;A++){if(!r[A])continue;let R=le[A*6],F=le[A*6+1],k=1/0,P=-1/0,ue=1/0,Ee=-1/0;for(let kt=0;kt<4;kt++){let Br=R+(kt&1)*16,Nt=F+(kt>>1)*16,Dr=t[0]*Br+t[2]*Nt+t[4]-n,Je=t[1]*Br+t[3]*Nt+t[5]-a;Dr<k&&(k=Dr),Dr>P&&(P=Dr),Je<ue&&(ue=Je),Je>Ee&&(Ee=Je)}let At=Math.max(0,Math.floor((k-2)/ge)),nr=Math.min(o-1,Math.floor((P+2)/ge)),ar=Math.max(0,Math.floor((ue-2)/ge)),zi=Math.min(u-1,Math.floor((Ee+2)/ge));for(let kt=ar;kt<=zi;kt++)for(let Br=At;Br<=nr;Br++)Gn[kt*o+Br]=1}let c=0,m=o,h=-1,d=u,x=-1;for(let A=0;A<u;A++)for(let R=0;R<o;R++){if(!Gn[A*o+R])continue;let F=R;for(;F+1<o&&Gn[A*o+F+1];)F++;R<m&&(m=R),F>h&&(h=F),A<d&&(d=A),A>x&&(x=A);let k=-1;for(let P=0;P<c;P++)fe[P*4]===R*ge&&fe[P*4+2]===(F+1-R)*ge&&fe[P*4+1]+fe[P*4+3]===A*ge&&(k=P);k>=0?fe[k*4+3]+=ge:c<Oi?(fe[c*4]=R*ge,fe[c*4+1]=A*ge,fe[c*4+2]=(F+1-R)*ge,fe[c*4+3]=ge,c++):c=Oi+1,R=F}c>Oi&&(fe[0]=m*ge,fe[1]=d*ge,fe[2]=(h+1-m)*ge,fe[3]=(x+1-d)*ge,c=1);for(let A=0;A<c;A++)fe[A*4+2]=Math.min(fe[A*4+2],i-fe[A*4]),fe[A*4+3]=Math.min(fe[A*4+3],s-fe[A*4+1]),fe[A*4]+=n,fe[A*4+1]+=a;return c}function Cf(t,r,n){let a=rh(t,n);if(a){e.bindFramebuffer(e.FRAMEBUFFER,Ar),me=null,e.viewport(0,0,L,I),e.enable(e.SCISSOR_TEST),wt=t,bt=r,Ne=4;for(let i=0;i<a;i++)Bt(fe[i*4],fe[i*4+1],fe[i*4+2],fe[i*4+3],!0);e.disable(e.SCISSOR_TEST),e.bindFramebuffer(e.FRAMEBUFFER,_())}}let nh={gen:new Float32Array(0),one:new Float32Array(0),nGen:0,nOne:0};function Li(t){let{gen:r,one:n,nGen:a,nOne:i}=ul(le,$,va,t,nh);Ko(Co,r,a*6),Ko(jo,n,i*6),ui=a,hi=i,Xo=t}function jf(t,r,n){n.k&&(Li(n.mark),e.bindFramebuffer(e.FRAMEBUFFER,Ar),me=null,e.viewport(0,0,L,I),wt=t,bt=r,Ne=1,Bt(J[0],J[1],L,I),e.bindFramebuffer(e.FRAMEBUFFER,_())),Ri+=n.k}function Gf(t,r,n){n.k&&(Li(n.mark),e.bindFramebuffer(e.FRAMEBUFFER,gf),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Oe,0),e.drawBuffers(Ai),e.viewport(0,0,L,I),wt=t,bt=r,Ne=2,Bt(J[0],J[1],L,I),e.bindFramebuffer(e.FRAMEBUFFER,_())),Sf+=n.k}function gs(t,r,n){if(!it){it=new Map;for(let s=0;s<$;s++){let o=le[s*6+2],u=le[s*6+3],c=-1;for(let m=o;m<o+u;m++){let h=at[m*8+4];if(h===c)continue;c=h;let d=it.get(h);d||it.set(h,d=[]),d[d.length-1]!==s&&d.push(s)}}}(!n.mark||n.mark.length<$)&&(n.mark=new Uint8Array($));let a=n.mark;a.fill(0,0,$);let i=0;for(let s of t){let o=it.get(s);if(o)for(let u=0;u<o.length;u++){let c=o[u];!a[c]&&!(r&&r[c])&&(a[c]=1,i++)}}return n.k=i,n}let ne={changed:!1,rows:[],scratch:[],rc:null,cells:null,nc:-1,n:0,data:null,part:{},buf:e.createBuffer(),va:e.createVertexArray()};ko(ne.va,ne.buf);function ah(t){if(ne.changed=!1,!le||!$||!(t>0))return 0;let r=.85*ho/t,n=ne.scratch;n.length=0;for(let u=0;u<jr.length;u++)jr[u]>=r&&n.push(u);let a=ne.rows,i=n.length===a.length&&ne.cells===le&&ne.nc===$&&ne.rc===it&&it!==null;for(let u=0;i&&u<n.length;u++)n[u]!==a[u]&&(i=!1);if(i)return ne.n;let s=gs(n,null,ne.part);(!ne.data||ne.data.length<s.k*6)&&(ne.data=new Float32Array(s.k*6+600));let o=0;for(let u=0;u<$;u++)s.mark[u]&&(ne.data[o*6]=le[u*6],ne.data[o*6+1]=le[u*6+1],o++);return e.bindBuffer(e.ARRAY_BUFFER,ne.buf),e.bufferData(e.ARRAY_BUFFER,ne.data,e.DYNAMIC_DRAW,0,o*6),ne.rows=n,ne.scratch=a,ne.cells=le,ne.nc=$,ne.rc=it,ne.n=o,ne.changed=!0,o}function Es(t,r,n,a,i=!1,s=!1,o=null){e.disable(e.BLEND),n[1]&&Ts(Ka,t,r,n[0],n[1],i,s,o),a[1]&&jt&&Ts(jt,t,r,a[0],a[1],i,s,o)}function Ts({p:t,u:r},n,a,i,s,o,u,c=null){Rs({p:t,u:r},n,a,o,u,c),e.bindVertexArray(i);let m=!u&&t!==Ka.p;m&&e.drawBuffers(Gu),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,s),m&&e.drawBuffers(tt),e.bindVertexArray(null)}function Rs({p:t,u:r},n,a,i,s,o=null){let u=lr(Ge.world,n[0],n[1],n[2],n[3],n[4],n[5]),c=o?o[0]:xt?xt.w:L,m=o?o[1]:xt?xt.h:I;e.useProgram(t),l.m3(r.world,u),l.f2(r.size,c,m),l.f1(r.cell,16),l.i1(r.morphOn,Ut.morph?Ut.morph.tight?2:1:0),Ut.morph&&(l.i1(r.posBase,Ut.morph.posBase),l.i1(r.joinBase,Ut.morph.joinBase)),l.f1(r.px,1/Math.max(1e-6,Math.hypot(n[0],n[1])));let h=n[0]*n[3]-n[1]*n[2]||1e-9;l.f4(r.invA,n[3]/h,-n[1]/h,-n[2]/h,n[0]/h),l.f2(r.tOff,n[4],n[5]),l.f2(r.lOff,je[0],je[1]),l.f2(r.sizeF,c,m),l.f1(r.reachU,a.reach),l.f2a(r.shOff,a.shOff),l.f4a(r.casing,a.casing),l.f4a(r.shadow,a.shadow),l.f4a(r.sheenInk,a.sheen),l.f4a(r.shadeInk,a.shade),l.f4a(r.rimInk,a.rim||Fi),l.f4a(r.paperInk,a.paper||Fi),l.f4a(r.ring,a.ring),l.f2a(r.light,a.light),l.f1(r.netAlpha,a.netAlpha),l.i1(r.fx,a.fx?1:0),l.i1(r.redraw,i?1:0),l.i1(r.tint,s?1:0),l.fv1(r.tierAlpha,a.tierAlpha),l.iv1(r.tierGroup,a.tierGroup),l.i1(r.useOrgan,a.organs>0&&Ti?1:0),l.f1(r.organK,+a.organs||0),Ti&&l.f4a(r.organRect,Ti),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,Xt),l.i1(r.ent,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,Ea),l.i1(r.rad,1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,yn),l.i1(r.tube,2),e.activeTexture(e.TEXTURE3),e.bindTexture(e.TEXTURE_2D,Fn),l.i1(r.organ,3),e.activeTexture(e.TEXTURE4),e.bindTexture(e.TEXTURE_2D,Ta),l.i1(r.rmax,4),e.activeTexture(e.TEXTURE5),e.bindTexture(e.TEXTURE_2D,s?On:ss),l.i1(r.depL,5)}let y={noEnds:v==="lobule",ent:null,morph:null,B:null,tv:0,patchOk:!1,pts:{},jl:{},patch:{},tb:{},pb:{},tex:null,pj:null,texRows:0,patchVAO:null,layVAO:null,rowBuf:null,patchBuf:null,rowCap:0,patchCap:0,tubeVAO:null,tubeVB:null,tubeIB:null,tubeIndexN:0,w:0,h:0,ok:!1,scrN:null,scrT:null,sw:0,sh:0,kP:0,ref:0,passes:0,strips:0,patches:0,plain:0,webs:0,lumStrips:0,lumWebs:0,stage2:null},ih=[null,null],oh=[e.DEPTH_STENCIL_ATTACHMENT],sh=new Float32Array([1]),lh=new Float32Array(8),fh=new Int32Array([0]),ch=[e.COLOR_ATTACHMENT0,e.NONE,e.NONE,e.COLOR_ATTACHMENT3],Xf=[e.COLOR_ATTACHMENT0,e.NONE,e.NONE,e.NONE],Dt=()=>!fa||!un?!1:Cr?xc?(Tt="software GL",!1):!(X||!at||!le||y.ok===null):(Tt="no lay program",!1),ys=()=>({ent:null,morph:null,dirty:!0,gen:0,pts:{},jl:{},patch:{},pj:null,patchOk:!1,s2:null,noEnds:v==="lobule"}),Ui=ys(),Vf=null,zf=null,Wf=!1,Fs=()=>((hn!==Vf||ct!==zf)&&(Vf=hn,zf=ct,Wf=O0(hn,!!ct).joins==="web"),Wf),Ss=()=>!Fs(),Hf=(t,r,n,a,i)=>{f0(r,n,a,p,t.pts),c0(n,a,t.jl),t.ent=r,t.morph=i,t.dirty=!1,t.gen++,t.patchOk=!1,t.s2=null,i||(y.tex||(y.tex=oe(e)),e.bindTexture(e.TEXTURE_2D,y.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,2048,t.pts.rows,0,e.RGBA,e.FLOAT,t.pts.pts,0),w.on&&w.note("uploaded: mesh points",t.pts.rows*2048*16/1024))},$f=t=>{u0(t.ent,t.jl.view,t.patch,t.morph?t.morph.joinBase:-1),t.pj||(t.pj=oe(e)),e.bindTexture(e.TEXTURE_2D,t.pj),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,2,Math.max(1,t.patch.j.length/8),0,e.RGBA,e.FLOAT,t.patch.j.length?t.patch.j:lh,0),t.patchOk=!0};function uh(){let t=qe?qe.derived||=ys():Ui;return y.B===t&&t.ent===at&&!t.dirty&&(t.patchOk||!Ss())||((t.dirty||t.ent!==at)&&Hf(t,at,le,$,Ut.morph),!t.patchOk&&Ss()&&$f(t),y.B=t,y.ent=t.ent,y.morph=t.morph,y.pts=t.pts,y.jl=t.jl,y.patch=t.patch,y.pj=t.pj,y.patchOk=t.patchOk),y}let Yf=()=>Fs()?"web":"patch";function _s(t){if(X||!t.entCPU||(t.prepKey=Yf(),!t.prepKey))return;let r=t.derived||=ys();r.ent!==t.entCPU&&Hf(r,t.entCPU,t.cellsCPU,t.nCells,t.morph),Ss()&&!r.patchOk&&$f(r),Fs()&&z0(r,qt,p,t.morph.joinBase)}let Ii={done:()=>!0,run(){if(qe){ht.push(Ii);return}let t=Yf();for(let r of It)if(r.prepKey!==t){_s(r);break}for(let r of It)if(r.prepKey!==t){ht.push(Ii);break}}},Kf=()=>{It.size&&!ht.includes(Ii)&&ht.push(Ii)};function ki(){if(!y.rowBuf){y.rowBuf=e.createBuffer(),y.patchVAO=e.createVertexArray(),y.patchBuf=e.createBuffer(),e.bindVertexArray(y.patchVAO);let r=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,l0,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,y.patchBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,4,e.FLOAT,!1,Qi*4,16),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,Qi*4,32),e.vertexAttribDivisor(2,1),e.enableVertexAttribArray(3),e.vertexAttribPointer(3,2,e.FLOAT,!1,Qi*4,48),e.vertexAttribDivisor(3,1),y.layVAO=e.createVertexArray(),e.bindVertexArray(y.layVAO),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),La=e.createRenderbuffer()}if(!y.tubeVAO){let r=m0(1);y.tubeIndexN=r.nIndex,y.tubeVAO=e.createVertexArray(),e.bindVertexArray(y.tubeVAO),y.tubeVB=e.createBuffer(),y.tubeIB=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,y.tubeVB),e.bufferData(e.ARRAY_BUFFER,r.attr,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,y.tubeIB),e.bufferData(e.ELEMENT_ARRAY_BUFFER,r.index,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,y.rowBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(1,1),e.bindVertexArray(null)}if(y.w===L&&y.h===I&&y.ok&&Ei)return!0;y.w=L,y.h=I,w.on&&xe(L*I*4/1024),e.bindRenderbuffer(e.RENDERBUFFER,La),e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH24_STENCIL8,L,I),e.bindFramebuffer(e.FRAMEBUFFER,Ar),me=null,e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,La);let t=ll(e,e.FRAMEBUFFER,"layer+depth+stencil",L,I);return Ei=t,t||e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,null),y.ok=t?!0:null,y.ok||(Tt="no depth and stencil",console.warn(`Veins renderer: the tube vessel renderer has ${Tt}; the classic vessel pass draws.`)),!!y.ok}function hh(t){if(y.sw!==L||y.sh!==I){y.sw=L,y.sh=I;for(let n of[y.scrN,y.scrT])n&&(e.bindTexture(e.TEXTURE_2D,n),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,L,I,0,e.RGBA,e.UNSIGNED_BYTE,null))}let r=t?y.scrT:y.scrN;return r||(r=oe(e),e.bindTexture(e.TEXTURE_2D,r),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,L,I,0,e.RGBA,e.UNSIGNED_BYTE,null),w.on&&xe(L*I*4/1024),t?y.scrT=r:y.scrN=r),r}let dh=t=>e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0),Bs=64;function ph(){return y.kP>=Bs&&(e.depthMask(!0),e.clearBufferfv(e.DEPTH,0,sh),y.kP=0),1-++y.kP/Bs}function mh(){return y.ref>=255&&(e.clearBufferiv(e.STENCIL,0,fh),y.ref=0),++y.ref}function Ds(t,r,n){let a=n*1;return t<=za.UP?12*1.3+.6+a+2*n:t<=za.SHADOW?Math.hypot(r.shOff[0],r.shOff[1])+2.4*1.4+a+2*n:a+2.5*n+2*n}function wh(t,r){e.drawBuffers(Xf),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(Cr.p),e.activeTexture(e.TEXTURE7),e.bindTexture(e.TEXTURE_2D,t),l.i1(Cr.u.uT,7),l.f1(Cr.u.uK,r),e.bindVertexArray(y.layVAO),e.drawArrays(e.TRIANGLE_STRIP,0,4),y.passes++}let Jt=H0({lobule:v==="lobule",gl:e,UC:l,MG:y,MAX_TIERS:oo,ATTACH:tt,KEY_PASSES:Bs,MESH_TWO:ih,MESH_DS:oh,MESH_GLOW_BUF:ch,MESH_COLOR_BUF:Xf,CLR_F:Ua,gpuProbe:w,nTubes:p,tubeNow:qt,meshPad:Ds,meshKeyNext:ph,meshRefNext:mh,meshTargets:ki,meshGeo:uh,meshTarget:dh,meshScratch:hh,meshLay:wh,vesselSet:Rs,layerView:(t,r,n)=>{xt&&(t=xt.m);let a=1/Math.max(1e-6,Math.hypot(t[0],t[1]));return n.pad=Math.max(Ds(za.UP,r,a),Ds(za.SHADOW,r,a))+12+4*a,n.rmax=jr,W0(t,J[0],J[1],L,I,n)},get tubeS(){return fa},get tubePt(){return un},get tube2(){return hn},get tube2Failed(){return Ja},get tube3(){return ct},get tube3Failed(){return Za},get tubeGlow(){return Qa},get tubeGlowFailed(){return ei},lumenBind:Nh,get baseTex(){return Oe},get geo(){return Ut}}),Ms=[0,0];function Os(t,r,n,a,i,s,o){Ms[0]=D(),Ms[1]=B(),Rs(t,r,n,!1,!1,Ms),rr(t.u,a,i,s,o),se(t.u,0,Xt,"ent"),se(t.u,1,Fn,"organ"),se(t.u,8,Ta,"rmax")}let qf=()=>{let t={tex:oe(e),fbo:e.createFramebuffer(),w:0,h:0};return e.bindTexture(e.TEXTURE_2D,t.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),t},b=Xe?qf():null,Zt=!1,an=!1,Ls=!1,Jf=0,Us=null,Ni=null,Zf=-1,Is=-1,ks=-1,Ns=-1,Ps=-1,Cs=-1,js=-1;function bh(){return b.w===D()&&b.h===B()?!1:(b.w=D(),b.h=B(),w.on&&xe(b.w*b.h*4/1024),e.bindTexture(e.TEXTURE_2D,b.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,b.w,b.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,b.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,b.tex,0),b.rb||=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,b.rb),e.renderbufferStorage(e.RENDERBUFFER,e.STENCIL_INDEX8,b.w,b.h),e.bindRenderbuffer(e.RENDERBUFFER,null),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.STENCIL_ATTACHMENT,e.RENDERBUFFER,b.rb),e.bindFramebuffer(e.FRAMEBUFFER,_()),!0)}let xh=!0,Mt=0,Gs=!1,Qf=-1,ec=0,tc=0,Xs=0;function vh(){if(Qf=Yn(),!Mt)return;let t=Mt;if(Mt=0,!(!X&&Ze!==ec&&(!Re.length||Xs!==tc))){Gs=!0;try{Pi(!0,(t&2)!==0)}finally{Gs=!1}}}let Ah=kc(vh);function Qt(t=!0,r=!1){Mt&&t&&(r=r||(Mt&2)!==0),Pi(t,r)}function gh(){if(xh&&!Gs&&!X&&Yi()&&Qf!==Yn()){Mt|=3,ec=Ze,tc=Xs;return}Qt(!0,!0)}function Pi(t,r){Th(t,r),O&&t&&!X&&O.present?.()}function Eh(){si(),b?.w&&(e.bindFramebuffer(e.FRAMEBUFFER,b.fbo),e.viewport(0,0,b.w,b.h),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT)),e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),$=He=Gt=et=0,Y=null,Q=!1}function Th(t,r){Rh(t,r)}function Rh(t,r){if(Ue&&!X&&Ue.on()){Ze++,e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT);try{Ue.draw()}catch(i){console.warn("Veins renderer: what stands in for the figure failed.",i),Ue=null}e.bindFramebuffer(e.FRAMEBUFFER,_());return}if((!b?.w||b.w!==D()||b.h!==B())&&!X&&Re.some(Vs)){Ze++,e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),t&&(ji(),e.bindFramebuffer(e.FRAMEBUFFER,_()));return}if(!X&&Re.some(i=>Vs(i)&&i.opaque?.())){Ze++,Zt&&(Zt=!1,an=!0),e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),t&&(ji(),e.bindFramebuffer(e.FRAMEBUFFER,_()));return}if(!b?.w||X||(Zt&&Lt()&&(Zt=!1,an=!0),b.w!==D()||b.h!==B()))return;if(!Zt&&an){if(Yi()&&Yn()===Zf&&Is===Pe&&ks===pr&&!(r&&t&&Re.length))return;if(an=!1,Us){Ls=!0;try{_r.composite(Us,Ni,!0)}finally{Ls=!1}}return}if(Zt){Ze++,e.disable(e.SCISSOR_TEST),zs(),st("organ layer"),oc(!0),t&&Re.length&&(ji(),e.bindFramebuffer(e.FRAMEBUFFER,_()),st("glasses and labels")),Zt=!1,Is=Pe,ks=pr;return}w.on&&w.note(we.present,b.w*b.h*4/1024),zs(),st("organ layer"),e.disable(e.SCISSOR_TEST),Ze++;let n=!1,a=Pa[0];Lt()&&qs(b.tex,!1)?a=Pa[1]:!q&&Le&&Le.on()&&Sh()?(n=!0,a=Pa[2]):q&&Dh()?a=Pa[3]:(q&&(a=Pa[4]),e.bindFramebuffer(e.READ_FRAMEBUFFER,b.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,_()),(q||b.w===f.width&&b.h===f.height)&&K(e.DRAW_FRAMEBUFFER,!0),e.blitFramebuffer(0,0,b.w,b.h,0,0,q?f.width:b.w,q?f.height:b.h,e.COLOR_BUFFER_BIT,q?e.LINEAR:e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,_())),Ji(Mr.present,a),(Ws!==b.w||Hs!==b.h||$s!==f.width||Ys!==f.height)&&(Ws=b.w,Hs=b.h,$s=f.width,Ys=f.height,Mr.presentSize=`picture ${Ws}x${Hs} onto the screen ${$s}x${Ys}`),st("present copy"),oc(!0),st("organ overlay laid"),t&&Re.length&&(ji(),e.bindFramebuffer(e.FRAMEBUFFER,_()),st("glasses and labels")),ia&&yh(n&&t)}function rc(){if(!oa||X||!ia.ready())return!1;for(let t=0;t<Re.length;t++)if(!Re[t].still)return!1;return!(q||Lt()||Zt||an||Ue&&Ue.on()||ve&&dn||!Le||!Le.on()||!b||b.w!==f.width||b.h!==f.height||D()!==f.width||B()!==f.height||!oa.read(ze)||ze.dyn||!ze.tex||ze.w!==f.width||ze.h!==f.height)}function yh(t){ye.on=!1,!(!t||!U||!U.fbo||!rc())&&(ye.on=!0,ye.pic=Pe,ye.gen=U.gen,ye.v1=ze.v1,ye.v2=ze.v2,ye.v3=ze.v3)}function Fh(t){return!ye.on||!rc()||ye.pic!==Pe||ye.gen!==U.gen||ye.v1!==ze.v1||ye.v2!==ze.v2||ye.v3!==ze.v3?!1:(Ze++,e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),He&&ia.draw(lr(Ge.world,t[0],t[1],t[2],t[3],t[4],t[5]),f.width,f.height,br,En,He,b.tex,ze.tex,ze),e.bindFramebuffer(e.FRAMEBUFFER,_()),w.on&&w.note(we.pictureKept),O&&!X&&O.present?.(),!0)}let Vs=t=>!!t.solo&&(!t.on||!!t.on()),Ci=[[],[],[],[]],Xn=0;function nc(){let t=Xn<=Ci.length?Ci[Xn-1]:[];t.length=0;for(let r=0;r<Re.length;r++)t.push(Re[r]);return t}function ji(){Xn++,Xs++;try{let t=nc();for(let n=0;n<t.length;n++){let a=t[n];try{a.prep?.(),a.fails=0}catch(i){Pl(a,i)}}t=nc();let r=-1;for(let n=t.length-1;n>=0;n--){let a=t[n];if(a.opaque&&Vs(a)){let i=!1;try{i=!!a.opaque()}catch{i=!1}if(i){r=n;break}}}for(let n=0;n<t.length;n++){let a=t[n];if(!(n<r&&a.solo))try{a.draw(),a.fails=0}catch(i){Pl(a,i)}}}finally{Xn--,Xn<Ci.length&&(Ci[Xn].length=0)}}function Sh(){if(Ie===null)try{Ie=Ca("lay",!0)||ie(e,ae(e,sr,Tl))}catch(t){console.warn("Veins renderer: the overlays' shader could not be made.",t),Ie=!1}if(!Ie)return!1;e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT);try{Le.draw()}catch(t){console.warn("Veins renderer: what is drawn under the figure failed.",t),Le=null}return e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(Ie.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,b.tex),l.i1(Ie.u.uT,0),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND),!0}let ac=new Float64Array(6);function ic(){let t=kl?us(Ir,Yu):Ir;for(let r=0;r<6;r++)ac[r]=t[r];return ac}function zs(){if(!ve||!dn||!Ir)return;let t=ic();H.painter.cssPx=lo*D()/f.width,ve.stale(t,D(),B())&&ve.render(t,D(),B())}function oc(t=!1){if(!ve||!dn||!Ir)return;t||zs();let r=ve.bounds;if(Lt()){if(r&&!_h(r))return;try{if(qs(ve.texture,!0,!1,r?sc:null))return}finally{e.disable(e.SCISSOR_TEST)}}if(r){let n=f.width/D(),a=f.height/B(),i=1+(q?Math.ceil(Math.max(Math.abs(na*n),Math.abs(aa*a))):0);if(er[0]=Math.max(0,Math.floor(r[0]*n)-i),er[2]=Math.min(f.width,Math.ceil(r[2]*n)+i),er[1]=Math.max(0,f.height-Math.ceil(r[3]*a)-i),er[3]=Math.min(f.height,f.height-Math.floor(r[1]*a)+i),!(er[2]>er[0]&&er[3]>er[1]))return;Ot=er}try{if(q&&(D()!==f.width||B()!==f.height)&&qs(ve.texture,!0,!0))return;if(Ie===null)try{Ie=Ca("lay",!0)||ie(e,ae(e,sr,Tl))}catch(n){console.warn("Veins renderer: the overlays' shader could not be made.",n),Ie=!1}if(!Ie)return;e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),Ot?(e.enable(e.SCISSOR_TEST),e.scissor(Ot[0],Ot[1],Ot[2]-Ot[0],Ot[3]-Ot[1])):e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(Ie.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,ve.texture),l.i1(Ie.u.uT,0),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND)}finally{e.disable(e.SCISSOR_TEST),Ot=null}}let er=[0,0,0,0],sc=[0,0,0,0],Pa=["copy","camera","under picture","upscale","filtered copy (upscale compiling)"],Ws=0,Hs=0,$s=0,Ys=0;function _h(t){let r=ce.k*_e.k;return wd(sc,t,r,_e.k*ce.ex+_e.ex,f.height*(1-r)-(_e.k*ce.ey+_e.ey),f.width,f.height,D(),B())}let Ot=null,ce={k:1,ex:0,ey:0,a:1},_e={k:1,ex:0,ey:0},Lt=()=>ce.k!==1||ce.a!==1||_e.k!==1,Ks=0,tr=null;function qs(t,r,n=!1,a=null){let i=n?1:ce.a,s=n?1:ce.k*_e.k,o=n?0:_e.k*ce.ex+_e.ex,u=n?0:f.height*(1-s)-(_e.k*ce.ey+_e.ey);if(tr===null)try{tr=ie(e,ae(e,sr,ed))}catch(m){console.warn("Veins renderer: the camera shader could not be made.",m),tr=!1}if(!tr)return!1;e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height);let c=a||(n?Ot:null);return c?(e.enable(e.SCISSOR_TEST),e.scissor(c[0],c[1],c[2]-c[0],c[3]-c[1])):e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),r?(e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA)):(e.disable(e.BLEND),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT)),i>0?(e.useProgram(tr.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),l.i1(tr.u.uT,0),l.f2(tr.u.uDst,f.width,f.height),l.f3(tr.u.uCam,s,q?o+s*na*f.width/D():o,q?u-s*aa*f.height/B():u),l.f1(tr.u.uA,i),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND),!0):(e.disable(e.BLEND),!0)}let on=null;function Bh(t,r,n,a,i,s,o,u){if(on===null)try{on=ie(e,ae(e,sr,tu))}catch(h){console.warn("Veins renderer: the lobule's laying shader could not be made.",h),on=!1}let c=on;if(!c||!(u>0))return!1;let m=r*i-n*a;return m?(e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(c.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,t),l.i1(c.u.uT,0),l.f2(c.u.uDst,f.width,f.height),l.f4(c.u.uM,i/m,-n/m,-a/m,r/m),l.f2(c.u.uTr,s,o),l.f1(c.u.uA,u),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND),!0):!1}let ot=null;function Dh(){if(ot===null){let t;try{t=Ca("up",!1),t===void 0&&(t=ie(e,ae(e,sr,ru)))}catch(r){console.warn("Veins renderer: the upscale shader could not be made.",r),t=!1}if(t===null)return!1;ot=t}return ot?(e.bindFramebuffer(e.FRAMEBUFFER,_()),e.viewport(0,0,f.width,f.height),e.disable(e.BLEND),e.disable(e.STENCIL_TEST),K(e.FRAMEBUFFER,!0),e.useProgram(ot.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,b.tex),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),l.i1(ot.u.uT,0),l.f2(ot.u.uSrc,b.w,b.h),l.f2(ot.u.uDst,f.width,f.height),l.f2(ot.u.uOff,na,aa),l.f1(ot.u.uCR,ra?0:1),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),!0):!1}let Vn=0,Gi=!1,Xi=0,Js=!1,N={tex:null,fbo:null,w:0,h:0,m:null,P:null},lc=new Float64Array(6),Mh=new Float64Array(6);function Ca(t,r){let n=ut[t];if(n){if(!r&&sa&&!e.getProgramParameter(n.p,sa.COMPLETION_STATUS_KHR))return null;delete ut[t];try{return ie(e,n)}catch(a){throw e.deleteProgram(n.p),a}finally{for(let a of n.sh)e.deleteShader(a)}}}function fc(t,r=!0){let n;try{n=Ca(t,!1)}catch(a){console.warn(`Veins renderer: the ${t} shader could not be made.`,a),n=!1}n!=null&&(t==="lay"?Ie=n:t==="up"?ot=n:N.P=n,!(!n||!r)&&Gc(e,()=>{e.useProgram(n.p),t==="lay"?(e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA)):e.disable(e.BLEND),n.u.uT&&l.i1(n.u.uT,0),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.disable(e.BLEND)}))}function Oh(t){N.tex||(N.tex=oe(e,e.LINEAR),N.fbo=e.createFramebuffer()),(N.w!==D()||N.h!==B())&&(N.w=D(),N.h=B(),e.bindTexture(e.TEXTURE_2D,N.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,N.w,N.h,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindFramebuffer(e.FRAMEBUFFER,N.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,N.tex,0)),e.disable(e.SCISSOR_TEST),e.bindFramebuffer(e.READ_FRAMEBUFFER,b?b.fbo:null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,N.fbo),(!b||b.w===N.w&&b.h===N.h)&&K(e.DRAW_FRAMEBUFFER,!1),e.blitFramebuffer(0,0,N.w,N.h,0,0,N.w,N.h,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,_());for(let r=0;r<6;r++)lc[r]=t[r];N.m=lc}function Lh(t){if(!N.m||N.w!==D()||N.h!==B())return!1;let r=td(N.m,t,Mh);if(!rd(r,N.w,N.h))return!1;if(N.P===null){let n;try{n=Ca("reuse",!1),n===void 0&&(n=ie(e,ae(e,sr,eu)))}catch(a){console.warn("Veins renderer: the pinch reuse shader could not be made; every zoom frame is shaded.",a),n=!1}if(n===null)return!1;N.P=n}return N.P?(e.bindFramebuffer(e.FRAMEBUFFER,b?b.fbo:null),e.viewport(0,0,D(),B()),e.disable(e.BLEND),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.useProgram(N.P.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,N.tex),l.i1(N.P.u.uT,0),l.f2(N.P.u.uSize,D(),B()),l.m3(N.P.u.uMap,lr(Ge.world,r[0],r[1],r[2],r[3],r[4],r[5])),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),e.bindFramebuffer(e.FRAMEBUFFER,_()),b&&Qt(),si(),!0):!1}let zn=0,cc=!1,uc=!1,Zs=!1,Wn=0,hc=0,Z={fbo:null,tex:null,w:0,h:0};function dc(t,r){Z.fbo||(Z.fbo=e.createFramebuffer(),Z.tex=tt.map(()=>oe(e))),e.bindFramebuffer(e.FRAMEBUFFER,Z.fbo);let n=Math.max(t,Math.round(D()*Wn)),a=Math.max(r,Math.round(B()*Wn));if(Z.w<n||Z.h<a){Z.w=Math.ceil(n/64)*64,Z.h=Math.ceil(a/64)*64,hc++;let i=Af();Z.tex.forEach((s,o)=>{e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,i[o][0],Z.w,Z.h,0,i[o][1],i[o][2],null),e.framebufferTexture2D(e.FRAMEBUFFER,tt[o],e.TEXTURE_2D,s,0)});{e.bindTexture(e.TEXTURE_2D,Z.tex[0]);for(let s of[e.TEXTURE_MIN_FILTER,e.TEXTURE_MAG_FILTER])e.texParameteri(e.TEXTURE_2D,s,e.LINEAR)}e.drawBuffers(tt)}}function Uh(t,r){let n=Math.max(1,Math.round(D()*zn)),a=Math.max(1,Math.round(B()*zn));dc(n,a),(Z.w>n||Z.h>a)&&(e.enable(e.SCISSOR_TEST),e.scissor(0,0,n,a),Ia());let i=n/D(),s=a/B();e.viewport(0,0,n,a);let o=Z.w>n||Z.h>a;e.disable(e.SCISSOR_TEST),o||Ia(),rn[0]=t[0]*i,rn[1]=t[1]*s,rn[2]=t[2]*i,rn[3]=t[3]*s,rn[4]=t[4]*i,rn[5]=t[5]*s,gi[0]=n,gi[1]=a,Ht[0]=Yr,Ht[1]=Gt,$t[0]=gn,$t[1]=et,Es(rn,r,Ht,$t,!1,!1,gi),me=gi,Si()}function Qs(){if(me=null,!(!Z.fbo||X)){for(let t of Z.tex)e.deleteTexture(t);e.deleteFramebuffer(Z.fbo),Z.fbo=Z.tex=null,Z.w=Z.h=0}}function Ih(){return!ls||!qe||v==="lobule"||X||jn||xs<1||!Dt()?0:Z0(D()*B())}function el(t){if(gr===t)return;gr=t,e.bindTexture(e.TEXTURE_2D,Oe);let r=t?e.LINEAR:e.NEAREST;e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,r)}function kh(t,r,n){Q0(L,I,n,fs);let a=fs[0],i=fs[1];Ae.sx=a/L,Ae.sy=i/I,Ae.w=a,Ae.h=i,Ae.m=t,xt=Ae,e.viewport(0,0,a,i),wt=Al(t,Ae.sx,Ae.sy,Ae.ms),bt=r,Ne=0,Bt(J[0],J[1],L,I),xt=null,In[0]=a,In[1]=i,el(!0),w.on&&w.gauge("view switch layer",`drawn lower: ${a} x ${i} = ${(a*i/1e6).toFixed(2)} MP at ${n.toFixed(2)} of the picture's ${L} x ${I} (${(L*I/1e6).toFixed(2)} MP)`)}function se(t,r,n,a){e.activeTexture(e.TEXTURE0+r),e.bindTexture(e.TEXTURE_2D,n),l.i1(t[a],r)}let Be=null,pc=Fl,mc=!1;function Nh(t){let r=t.u,n=pc;e.useProgram(t.p),se(r,6,Dn,"flow"),se(r,7,Ba,"dye"),se(r,12,Sn,"bend"),Jr&&se(r,15,Jr,"noiseT"),l.i1(r.bloodStyle,wl),l.i1(r.blood,n.on?1:0),l.f1(r.flowA,n.alpha??1),l.f3(r.blendA,n.streakA??1,n.chevA??1,n.originA??1),l.i1(r.lenOn,n.streakLen?1:0),l.i1(r.origin,n.origin?1:0),l.i1(r.dyeOn,en&&n.dye!==!1?1:0),l.f1(r.clock,n.clock||0),l.f1(r.bT,n.bt||0),l.f1(r.rows,p),l.fv3(r.originCol,Rl(n.originCol||yl)),l.f3a(r.dyeCol,n.dyeCol||Sl),l.f3a(r.revCol,n.revCol||_l),l.f3a(r.inkLight,n.inkLight||Bl),l.f3a(r.inkDark,n.inkDark||Dl)}let Ph=t=>{Jt.lumenCounts(t),t[5]=Be?Be.w*Be.h/1e6:0,t[6]=Be&&L?Be.w/L:0};function Ch(t,r,n){if(!ki())return!1;Be||(Be=V0(e));let a=gr&&!jn&&xs>=1,i=jn?1:a?In[0]:X0(L,I,xs,Uf)[0],s=jn?1:a?In[1]:Uf[1],o=Be.made,u=a?Be.ensure(L,I):Be.ensure(i,s);u.made!==o&&(Cn.stale(),nt.all=!0),a!==mc&&(mc=a,Cn.stale(),nt.all=!0),w.on&&u.made!==o&&xe(i*s*7/1024),pc=n;let c=!jn&&Jt.lumenBox(t,r,Of)?Of:null;if(e.bindFramebuffer(e.FRAMEBUFFER,u.fbo),e.viewport(0,0,i,s),e.colorMask(!0,!0,!0,!0),nt.all)e.disable(e.SCISSOR_TEST),e.clearBufferfv(e.COLOR,0,Ua);else{e.enable(e.SCISSOR_TEST);for(let h=0;h<nt.n;h++)e.scissor(nt.r[h*4],nt.r[h*4+1],nt.r[h*4+2],nt.r[h*4+3]),e.clearBufferfv(e.COLOR,0,Ua);e.disable(e.SCISSOR_TEST)}if(Se.n=0,Se.all=!c,jn)return nt.all=!0,w.on&&w.gauge(v==="lobule"?"lobule lumen layer":"lumen layer","off (?lumen=off): no lumen pass, no blood"),!0;let m=i!==L||s!==I;if(m&&(Ae.sx=i/L,Ae.sy=s/I,Ae.w=i,Ae.h=s,Ae.m=t,xt=Ae),Jt.webColour=!!(n.origin||en&&n.dye!==!1),wt=m?Al(t,Ae.sx,Ae.sy,Ae.ms):t,bt=r,Ne=5,bs=c,ws=Cn.needs(t,Fe,J,i,s,c),Bt(J[0],J[1],L,I),Ne=0,xt=null,bs=null,ws&&(Cn.drawn(t,Fe,J,i,s,c),w.on&&w.note("lumen depth redraws")),nt.all=Se.all,nt.n=Se.n,nt.r.set(Se.r),w.on){let h=0;if(!Se.all)for(let d=0;d<Se.n;d++)h+=Se.r[d*4+2]*Se.r[d*4+3];w.gauge(v==="lobule"?"lobule lumen layer":"lumen layer",`${i} x ${s} = ${(i*s/1e6).toFixed(2)} MP at ${(i/L).toFixed(2)} of the vessel layer's ${L} x ${I} (${(L*I/1e6).toFixed(2)} MP); drawn in ${Se.all?"all of it":`${(h/1e6).toFixed(2)} MP (${Math.round(100*h/(i*s))}%)`}`)}return!0}function rr(t,r,n,a,i){l.i2(t.lA,J[0],J[1]),l.i2(t.lWrap,Fe[0],Fe[1]),l.i2(t.lSize,L,I),l.i1(t.lH,B()),me&&!Z.fbo&&(me=null);let s=me&&t.lowSz?Z.tex:null,o=me,u=Z.w,c=Z.h;gr&&t.lowSz&&(kn[0]=Oe,kn[1]=Mn,kn[2]=Qr,s=kn,o=In,u=L,c=I),l.f2(t.lowS,s?o[0]/L:0,s?o[1]/I:0),l.i2(t.lowSz,s?o[0]:0,s?o[1]:0),l.f2(t.lowT,s?u:1,s?c:1),se(t,0,s?s[0]:Oe,"base"),se(t,1,s?s[1]:Mn,"gbuf"),se(t,2,Dn,"flow"),se(t,3,Ea,"rad"),se(t,4,yn,"tube"),se(t,5,Ba,"dye"),se(t,6,de[0]?.tex||Oe,"plate0"),se(t,7,i?H.texture:de[1]?.tex||Oe,"plate1"),se(t,8,s?s[2]:Qr,"gbuf2"),se(t,9,di,"fluidMask"),se(t,10,Hr.tex,"lineL"),l.i1(t.lineOn,r?1:0),se(t,11,xn.tex,"glowL"),l.i1(t.glowOn,n?1:0),se(t,13,vn.tex,"warmL"),l.i1(t.warmOn,a?1:0),se(t,12,Sn,"bend"),se(t,14,qa||Oe,"halfL"),l.i1(t.stackOn,i?1:0),t.lumenL&&(se(t,8,Be?Be.tex():Oe,"lumenL"),l.f1(t.lumSc,Be&&Be.w&&(Be.w!==L||Be.h!==I)?1:0)),Jr&&se(t,15,Jr,"noiseT"),l.i1(t.bloodStyle,Dt()?wl:!xf&&Jr?1:2)}let ja=null,Fr=null;function jh(){if(Fr)return Fr;let t=e.createFramebuffer(),r=tt.map(()=>oe(e)),n=e.createBuffer(),a=Af();return e.bindFramebuffer(e.FRAMEBUFFER,t),r.forEach((i,s)=>{e.bindTexture(e.TEXTURE_2D,i),e.texImage2D(e.TEXTURE_2D,0,a[s][0],1,1,0,a[s][1],a[s][2],null),e.framebufferTexture2D(e.FRAMEBUFFER,tt[s],e.TEXTURE_2D,i,0)}),e.drawBuffers(tt),e.bindFramebuffer(e.FRAMEBUFFER,_()),e.bindBuffer(e.ARRAY_BUFFER,n),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1e6,-1e6,0,0,0,0]),e.STATIC_DRAW),Fr={fb:t,tx:r,buf:n,va:li(n)}}function Vi(t){wi();let r=jh();if(e.bindFramebuffer(e.FRAMEBUFFER,r.fb),e.viewport(0,0,1,1),e.disable(e.BLEND),t==="simple"&&ja&&Y&&Ts(jt,Y,ja,r.va,1,!1,!1),t==="fused"&&ja&&Y){e.drawBuffers(Ai);for(let n of[ur,Gr])n&&(Os(n,Y,ja,!1,!1,!1,!1),e.bindVertexArray(r.va),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,1));e.bindVertexArray(null),e.drawBuffers(tt)}if(t==="streak"&&(e.drawBuffers(Ai),e.useProgram(ft.p),rr(ft.u,!1,!1,!1,!1),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),Et&&(e.useProgram(Et.p),rr(Et.u,!1,!1,!1,!1),e.bindVertexArray(r.va),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,1),e.bindVertexArray(null)),e.drawBuffers(tt)),t==="plain"){e.drawBuffers(Ai);for(let[n,a]of[[cn,Me],[Nr,r.va]])e.useProgram(n.p),rr(n.u,!1,!1,!1,!1),e.bindVertexArray(a),a===Me?e.drawArrays(e.TRIANGLE_STRIP,0,4):e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,1);e.bindVertexArray(null),e.drawBuffers(tt)}e.bindFramebuffer(e.FRAMEBUFFER,_())}let Gh=()=>{for(let t in ut)return!0;return!1};function Xh(){if(!(X||!pe.length&&!ht.length&&!Gh())&&Cc(Xc)){for(let t of Object.keys(ut))fc(t);for(let t of ht.slice()){let r=!0;try{r=t.done()}catch(n){ir("veins-gl:3064",n)}if(r){ht.splice(ht.indexOf(t),1);try{t.run()}catch(n){console.warn("Veins renderer: a warm-up drawn over the figure failed.",n)}}}if(e.bindFramebuffer(e.FRAMEBUFFER,_()),!!pe.length){for(let t of[...pe])kr(t).every(n=>e.getProgramParameter(n.p,sa.COMPLETION_STATUS_KHR))&&(pe.splice(pe.indexOf(t),1),t==="streak"?(Xl(),ft&&Vi("streak")):t==="heads"?Vl():t==="plain"?(Gl(),Nr&&Vi("plain")):t==="fused"?(zl(),ur&&Vi("fused")):t==="tube"?(po(),un&&(Q=!1)):t==="tube2"?(mo(),hn&&(Q=!1,Kf())):t==="tube3"?(wo(),ct&&(Q=!1,Kf())):t==="tubeGlow"?(bo(),Qa&&(Q=!1)):(jl(),jt&&(Vi("simple"),fi(),Q=!1)));pe.length||la()}}}if(vo&&ri("lay"),Xe&&Kn){let t=Yc(e);t&&ht.push(t)}let wc=t=>{t.preventDefault(),X=!0,Cn.stale(),l.reset()},bc=()=>l.reset();(G||f).addEventListener("webglcontextlost",wc),(G||f).addEventListener("webglcontextrestored",bc);let xc=q0(e);function Vh(t,r,n,a){if(!t)return"";let i=D(),s=B(),o=Math.abs(n[0])+Math.abs(n[2]),u=Math.abs(n[1])+Math.abs(n[3]),c=0,m=0;for(let h=0;h<r;h++){let d=n[0]*t[h*6]+n[2]*t[h*6+1]+n[4],x=n[1]*t[h*6]+n[3]*t[h*6+1]+n[5],A=Math.min(d,d+n[0]*a,d+n[2]*a,d+(n[0]+n[2])*a),R=Math.min(x,x+n[1]*a,x+n[3]*a,x+(n[1]+n[3])*a),F=Math.min(i,A+o*a)-Math.max(0,A),k=Math.min(s,R+u*a)-Math.max(0,R);F>0&&k>0&&(c+=F*k,m++)}return`${m} of ${r}, ${(c/1e6).toFixed(1)} MP of ${(i*s/1e6).toFixed(1)}, ${Math.round(o*a)} px each`}let Ut={morph:null},vc=null,qe=null,Ac=()=>({entTex:Xt,vao:Yr,cellBuf:ba,simpleBuf:xa,oneVAO:gn,bloodVAO:En,bloodBuf:Aa,nGen:Gt,nSimple:et,simpleOf:va,nBlood:He,bloodCell:br,bloodCPU:nn,cellsCPU:le,entCPU:at,nCells:$,cellBox:tn,rowCells:it,patchMark:Yt,patchK:vt,morph:Ut.morph});function zh(t){({entTex:Xt,vao:Yr,cellBuf:ba,simpleBuf:xa,oneVAO:gn,bloodVAO:En,bloodBuf:Aa,nGen:Gt,nSimple:et,simpleOf:va,nBlood:He,bloodCell:br,bloodCPU:nn,cellsCPU:le,entCPU:at,nCells:$,cellBox:tn,rowCells:it,patchMark:Yt,patchK:vt}=t),Ut.morph=t.morph,ke++,Q=!1,Ft=!0}function Sr(t){(t||null)===qe||X||(qe?Object.assign(qe,Ac()):vc=Ac(),zh(t||vc),qe=t||null)}let It=new Set;function gc(t){if(qe===t&&Sr(null),!(!It.delete(t)||X)){e.deleteTexture(t.entTex),t.derived?.pj&&e.deleteTexture(t.derived.pj),y.B===t.derived&&(y.B=null);for(let r of[t.cellBuf,t.simpleBuf,t.bloodBuf])e.deleteBuffer(r);for(let r of[t.vao,t.oneVAO,t.bloodVAO])e.deleteVertexArray(r)}}let _r={get lost(){return X},tubeStage(){return Jt.drew},software:xc,makeMorphSet(t){if(X)return null;let r=qe,n=ke,a=Q,i=Ft;Sr(null);let s=e.createVertexArray(),o=e.createBuffer();e.bindVertexArray(s),e.bindBuffer(e.ARRAY_BUFFER,We),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,o),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,24,8),e.vertexAttribDivisor(2,1),e.bindVertexArray(null);let u=e.createBuffer(),c=e.createBuffer(),m=e.createVertexArray();ko(m,c);let h={owner:_r,entTex:oe(e),vao:s,cellBuf:o,simpleBuf:u,oneVAO:li(u),bloodVAO:m,bloodBuf:c,nGen:0,nSimple:0,simpleOf:null,nBlood:0,bloodCell:16,bloodCPU:null,cellsCPU:null,entCPU:null,nCells:0,cellBox:null,rowCells:null,patchMark:null,patchK:0,morph:{posBase:t.posBase,joinBase:t.joinBase,entRows:t.entRows,rows:t.rows,tight:!!t.tight,nJoins:t.nJoins|0,joins:null}};return It.add(h),Sr(h),e.bindTexture(e.TEXTURE_2D,Xt),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,2048,t.rows,0,e.RGBA,e.FLOAT,t.ent),w.on&&w.note("uploaded: morph set",t.ent.byteLength/1024),le=t.cells,at=t.ent,$=t.nCells,tn=hu(t.cells,t.nCells,16),fi(),Po(t),Sr(r),ke=n,Q=a,Ft=i,h},prepareMorphSet(t){t&&t.owner===_r&&It.has(t)&&_s(t)},morphSetReady(t){return!!t&&t.owner===_r&&It.has(t)&&!!t.entCPU&&t.prepKey!==void 0},useMorphSet(t){t&&!(t.owner===_r&&It.has(t))||(t&&t.prepKey===void 0&&_s(t),Sr(t))},dropMorphSet(t){t&&gc(t)},setMorphFrame(t){let r=Ut.morph;if(!r||X)return;let n=qe;if(n&&n.sent&&n.sent.length===t.length){let a=!0;for(let i=0,s=t.length;i<s;i++)if(n.sent[i]!==t[i]){a=!1;break}if(a)return}if(n&&(n.sent&&n.sent.length===t.length?n.sent:n.sent=new Float32Array(t.length)).set(t),e.bindTexture(e.TEXTURE_2D,Xt),e.texSubImage2D(e.TEXTURE_2D,0,0,r.entRows,2048,r.rows-r.entRows,e.RGBA,e.FLOAT,t),r.nJoins>0){let a=r.joins||(r.joins={on:new Uint8Array(r.nJoins),ver:0}),i=(r.joinBase-r.entRows*2048)*4,s=!1;for(let o=0;o<r.nJoins;o++){let u=t[i+o*4+2]>=0?1:0;a.on[o]!==u&&(a.on[o]=u,s=!0)}s&&a.ver++}w.on&&w.note("uploaded: morph frame",t.byteLength/1024),ke++,Q=!1,Ft=!0},setGeometry(t){ke++,Sr(null),Nu(Xt,e.RGBA32F,e.RGBA,e.FLOAT,2048,t.rows||1,t.ent.length?t.ent:Cu||=new Float32Array(2048*4)),le=t.cells,at=t.ent,$=t.nCells,tn=hu(t.cells,t.nCells,16),fi(),Po(t),le=t.cells,at=t.ent,it=null,Q=!1,Ft=!0,Yt=null,vt=0,Ui.dirty=!0},patchGeometry(t){ke++,Sr(null),e.bindTexture(e.TEXTURE_2D,Xt);for(let[r,n]of t.patch)e.texSubImage2D(e.TEXTURE_2D,0,0,r,2048,n-r+1,e.RGBA,e.FLOAT,t.ent,r*2048*4);if(Ui.dirty=!0,t.patchTubes&&t.cells===le&&t.ent===at){for(let r of t.patchTubes)Rr.add(r),Ye[r]=1;if(t.patchCells?.length){Yt||=new Uint8Array($);for(let r of t.patchCells)Yt[r]||(Yt[r]=1,vt++);it=null,fi()}if(t.patchBlood&&Po(t),t.patchJoinEnts?.length){vt+=t0(le,$,t.patchJoinEnts,Yt||=new Uint8Array($)).k;for(let r of t.patchRows||qn)r>=0&&r<p&&(Ye[r]=1)}}else Q=!1,Ft=!0},setRadii(t,r,n=null){if(ke++,!(t>=0&&t<p))return;let a=n,i=-1/0,s=t*W*4;for(let o=0;o<W;o++){let u=Math.min(W-1,o+1);Sa[s+o*4]=r[o],Sa[s+o*4+1]=r[u],Sa[s+o*4+2]=a?a[o]:-1,Sa[s+o*4+3]=a?a[u]:-1,r[o]>i&&(i=r[o])}pf[t]=i,jr[t]=i,xo=!0,t<zt&&(zt=t),t>_a&&(_a=t),Rr.add(t),Ye[t]=1},setBend(t,r){let n=Math.min(r?.length||0,W);if(t>=0&&t<p&&n>=2){let o=t*W*2,u=!mi[t];for(let c=0;c<W;c++){let m=r[Math.min(c,n-1)],h=+m[0]||0,d=+m[1]||0;(Ra[o+c*2]!==h||Ra[o+c*2+1]!==d)&&(Ra[o+c*2]=h,Ra[o+c*2+1]=d,u=!0)}mi[t]||(mi[t]=1,hf++),u&&(t<Vt&&(Vt=t),t>qr&&(qr=t))}wu(r,ts);let a=t*W,i=t>=0&&t<p,s=i;for(let o=0;s&&o<W;o++)mf[o]!==wf[a+o]&&(s=!1);s||(i&&wf.set(mf,a),w.on&&w.note("uploaded: setBend",W*4/1024),ke++,Ye[t]=1,e.bindTexture(e.TEXTURE_2D,Sn),e.texSubImage2D(e.TEXTURE_2D,0,0,t,W,1,e.RED,e.FLOAT,ts))},setTubes(t){if(ke++,Er=!0,os(t,qt,yr),y.tv++,t.length<p*yr){qt.set(t),e.bindTexture(e.TEXTURE_2D,yn),e.texSubImage2D(e.TEXTURE_2D,0,0,0,no,p,e.RGBA,e.FLOAT,t);return}let r=ro(t,qt,yr,p,is);if(!r){w.on&&w.note(we.tubesSame);return}w.on&&w.note("uploaded: setTubes rows",(r[1]-r[0]+1)*yr*4/1024),e.bindTexture(e.TEXTURE_2D,yn),e.texSubImage2D(e.TEXTURE_2D,0,0,r[0],no,r[1]-r[0]+1,e.RGBA,e.FLOAT,t,r[0]*yr)},paintOrgans(t,r,n){let a=Math.max(1,Math.round(r[2]*n)),i=Math.max(1,Math.round(r[3]*n)),s=sl(e,e.FRAMEBUFFER_BINDING),o=sl(e,e.VIEWPORT),u=$c(e),c=e.createFramebuffer(),m=e.createRenderbuffer(),h=Jh;try{dt++,e.bindTexture(e.TEXTURE_2D,Fn),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,a,i,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindRenderbuffer(e.RENDERBUFFER,m),e.renderbufferStorage(e.RENDERBUFFER,e.STENCIL_INDEX8,a,i),e.bindFramebuffer(e.FRAMEBUFFER,c),me=null,e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Fn,0),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.STENCIL_ATTACHMENT,e.RENDERBUFFER,m),e.viewport(0,0,a,i),e.disable(e.SCISSOR_TEST),e.disable(e.DEPTH_TEST),e.disable(e.CULL_FACE),e.clearBufferfv(e.COLOR,0,[0,0,0,0]),e.clearBufferfi(e.DEPTH_STENCIL,0,1,0);let d=[n,0,0,-n,-r[0]*n,i+r[1]*n],x=Math.min(.5,.2/n),A=[!0,!0,!0,!0];for(let{d:R,circle:F,w:k}of t){let P=F?Wc(F[0],F[1],F[2],F[2]):zc(R,x);Hc(P,k?1:0,null,h),k?u.stroke(h,d,[a,i],A,k):u.fill(h,d,[a,i],A),u.release(h)}Ti=r,Q=!1}finally{u.release(h),u.dispose(),e.bindFramebuffer(e.FRAMEBUFFER,s),e.viewport(o[0],o[1],o[2],o[3]),e.deleteFramebuffer(c),e.deleteRenderbuffer(m)}},plateJob(t,r){let n=oe(e,e.LINEAR);return e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t,r,0,e.RGBA,e.UNSIGNED_BYTE,null),{tex:n,W:t}},plateRows(t,r,n,a){e.bindTexture(e.TEXTURE_2D,t.tex),e.texSubImage2D(e.TEXTURE_2D,0,0,r,t.W,n,e.RGBA,e.UNSIGNED_BYTE,a)},setPlate(t,r,n){de[t]&&e.deleteTexture(de[t].tex),de[t]={tex:r.tex,rect:n},dt++,H?.drop(t),ca()},dropJob(t){e.deleteTexture(t.tex)},setFluidSpans(t,r){dt++;let n=t.length,a=qo?.length===n*2?qo:qo=new Float32Array(n*2);a.fill(-1e4),a.set(t),Jo?.length===n&&a.set(Jo,n),e.bindTexture(e.TEXTURE_2D,di),pi===n&&uf===n?(e.texSubImage2D(e.TEXTURE_2D,0,0,0,n,2,e.RED,e.FLOAT,a),Kr.sub++):(e.texImage2D(e.TEXTURE_2D,0,e.R32F,n,2,0,e.RED,e.FLOAT,a),uf=n),Rn=r,pi=n},setFluidLiver(t){dt++,Jo=t,pi===t.length&&(e.bindTexture(e.TEXTURE_2D,di),e.texSubImage2D(e.TEXTURE_2D,0,0,1,pi,1,e.RED,e.FLOAT,t))},fluidPool(t){if(!Rn)return!1;let[r,n,a,i]=Rn;Tn.reset();for(let s=Math.max(n,t)-16;s<n+i+16;s+=16)for(let o=r-16;o<r+a+16;o+=16)Tn.push(o,s);return Zo=Tn.send(Wo),vr[0]=r-16,vr[1]=Math.max(n,t)-16,vr[2]=r+a+32,vr[3]=n+i+32,!0},keptStats:()=>({...Kr}),setFluidCells(t){ke++,Ko(Vo,t),yt=t.length/2;{let r=1/0,n=1/0,a=-1/0,i=-1/0;for(let s=0;s+1<t.length;s+=2){let o=t[s],u=t[s+1];o<r&&(r=o),u<n&&(n=u),o>a&&(a=o),u>i&&(i=u)}$e[0]=r,$e[1]=n,$e[2]=a+16,$e[3]=i+16}},dropPlate(t){dt++,de[t]&&(e.deleteTexture(de[t].tex),de[t]=null),H?.drop(t),ca()},hasPlate:t=>!!de[t]||!!H?.has(t),organs:H&&{stage(t,r,n,a,i=0){H.stage(t,r,n.tex,a,i)},bake:(t,r,n,a,i,s=0)=>H.bake(t,r,n,a,i,s),dropKept:()=>H.dropKept(),stats:()=>H.stats(),liveLayers:()=>H.liveLayers(),commit(t,r){dt++,de[t]&&(e.deleteTexture(de[t].tex),de[t]=null),H.commit(t,r),ca()},dropStaged:t=>H.dropStaged(t),has:t=>H.has(t),pictured:t=>H.pictured(t),get full(){return H.full},get fading(){return H.fading},get canLive(){return H.canLive},setLive(t,r){dt++;let n=H.setLive(t,r);return ca(),n},setLiveAll(t){dt++;let r=H.setLiveAll(t);return ca(),r},setOrder:t=>(dt++,H.setOrder(t)),shift:(t,r)=>{let n=H.shift(t,r);return n&&dt++,n}},setHeadRuns(t){let r=Math.min(t.length,ya.length);for(let n=0;n<r;n++)ya[n]!==t[n]&&(ya[n]=t[n],Fa=!0,Ye[n>>2]=1)},setFlow(t){let r=fr*4;for(let i=0;i<p;i++)as[i]=t[i*r+6]>0||t[i*r+8]<0?1:0;let n=0,a=p-1;if(!Da)Da=Float32Array.from(t.subarray(0,p*r)),Ft=!0;else{os(t,Da,r);let i=ro(t,Da,r,p,is);if(!i){w.on&&w.note(we.flowSame);return}n=i[0],a=i[1]}w.on&&w.note("uploaded: setFlow",(a-n+1)*r*4/1024),e.bindTexture(e.TEXTURE_2D,Dn),e.texSubImage2D(e.TEXTURE_2D,0,0,n,fr,a-n+1,e.RGBA,e.FLOAT,t,n*r)},setDye(t){if(ke++,en=!!t,!t)return;let r=0,n=p-1;if(Ma){os(t,Ma,or);let a=ro(t,Ma,or,p,is);if(!a)return;r=a[0],n=a[1]}else Ma=new Float32Array(or*p),Ft=!0;for(let a=0,i=Math.min(or*p,t.length);a<i;a++)Ma[a]=t[a];e.bindTexture(e.TEXTURE_2D,Ba),e.texSubImage2D(e.TEXTURE_2D,0,0,r,or,n-r+1,e.RED,e.FLOAT,t,r*or)},draw(t,r,n,a=null){wi(),Mr.draw++;for(let x=0;x<6;x++)yi[x]=t[x];Ir=yi,t=us(t,_f),Js=!1,Zs=!1,ja=r,(Ln!==D()||Un!==B())&&(Q=!1);let i=Ih();Oa=i>0,Oa!==gr&&(Q=!1,Oa||el(!1));let s=Ku(r),o=Y?t[4]-Y[4]:0,u=Y?t[5]-Y[5]:0,c=null,m=(Wt[0]||Math.abs(o)<L/2)&&(Wt[1]||Math.abs(u)<I/2);qe&&Q&&(o||u||Er||Rr.size||vt||a?.length)&&(Q=!1);let h=Q&&Bi(a)&&s&&m&&Nn(t,Y);if(h&&!Dt()&&(a?.length||vt))c=Mi(a||qn),c.part.k>$*.6&&(c=null);else if(h&&Dt()&&(a?.length||vt)&&ki()){let{part:x,tintPart:A}=Mi(a||qn),R=x.k;for(let F=0;F<$;F++)A.mark[F]&&!x.mark[F]&&(x.mark[F]=1,R++);R<=$*.6&&(Di.mark=x.mark,Di.k=R,c=Di)}let d=h&&(!(Er||Rr.size||vt)||c);if(zn&&cc&&!Dt()&&!Vn&&!d&&Y&&(uc||!Nn(t,Y))&&!w.skipGL&&!X){w.on&&w.note("vessels: lower"),As(vs(t)),Uh(t,r),vi(t),ps(),Er=!1,ka(),Na(),Q=!1,Pn=!1,Zs=!0,N.m=null,e.bindFramebuffer(e.FRAMEBUFFER,_()),this.composite(r,n,!0);return}if(!d&&Y&&!Nn(t,Y)&&qu()&&!Dt()&&!Eo&&Df(n||Fl)&&!w.skipGL&&!X){if(Vn&&Gi&&Pn&&Xi%Vn!==0&&Lh(t)){w.on&&w.note("vessels: reused"),Xi++,vi(t),Q=!1,Js=!0;return}w.on&&w.note("vessels: one pass"),(!L||Ln!==D()||Un!==B())&&As(vs(t)),Pn||(e.bindFramebuffer(e.FRAMEBUFFER,Ar),e.viewport(0,0,L,I),e.disable(e.SCISSOR_TEST),Ia(),Pn=!0),Si(),me=null,vi(t),ps(),Er=!1,ka(),Na(),Q=!1,e.bindFramebuffer(e.FRAMEBUFFER,_()),ms=!0,this.composite(r,n,!0),Vn&&Gi?(Oh(t),Xi=1):N.m=null;return}N.m=null,d||Ji(Mr.why,Q?Bi(a)?s?m?Nn(t,Y)?"tubes changed":"zoom or turn":"moved too far":"look changed":"radii changed":"no kept layer"),w.on&&(d?w.note(we.pan):(w.note(we.whole),w.note(we.wholeBy+be()),w.note(we.wholeWhy+(Q?Bi(a)?s?m?Nn(t,Y)?"tubes changed":"zoom or turn":"moved too far":"look changed":"radii changed":"no kept layer")))),d?(Qu(t,r,o,u),c===Di?(c.k&&Cf(t,r,c.mark),Ri+=c.k):c&&(jf(t,r,c.part),Gf(t,r,c.tintPart))):(As(vs(t)),e.bindFramebuffer(e.FRAMEBUFFER,Ar),me=null,e.viewport(0,0,L,I),Ia(),Oa?kh(t,r,i):(wt=t,bt=r,Ne=0,Bt(J[0],J[1],L,I))),vi(t),ps(),Er=!1,ka(),Na(),Q=!0,Pn=!1,w.on&&w.gauge("vessel cells, one-vessel program",jt?`${et} of ${$}`:"off"),w.on&&!Dt()&&w.gauge(v==="lobule"?"lobule vessel renderer":"vessel renderer",`classic: tube ${Tt||"not ready"}`),e.bindFramebuffer(e.FRAMEBUFFER,_()),this.composite(r,n,!0)},drawRows(t,r,n,a,i=!1){wi();for(let c=0;c<6;c++)yi[c]=t[c];if(Ir=yi,t=us(t,_f),!Q||!Y)return Kt("no kept layer");if(qe)return Kt("switch piece");if(X)return Kt("context lost");if(Ln!==D()||Un!==B())return Kt("size changed");if(!Nn(t,Y)||t[4]!==Y[4]||t[5]!==Y[5])return Kt("moved");if(!Bi(a))return Kt("radii not listed");if(Dt()){if(!ki())return Kt("mesh renderer");let{part:c,tintPart:m}=Mi(a),h=c.mark,d=c.k;for(let x=0;x<$;x++)m.mark[x]&&!h[x]&&(h[x]=1,d++);return d>$*.6?Kt("most cells"):(_i="drawn",Er=!1,ka(),w.on&&w.note(we.rows),Cf(t,r,h),Ri+=d,Na(),d&&Li(h),this.composite(r,n,i,d),!0)}let{part:s,tintPart:o}=Mi(a);if(s.k>$*.6)return Kt("most cells");_i="drawn",Er=!1,ka(),w.on&&w.note(we.rows),jf(t,r,s),Gf(t,r,o),Na();let u=s.k+o.k;if(u){let c=s.mark;for(let m=0;m<$;m++)o.mark[m]&&(c[m]=1);Li(c)}return this.composite(r,n,i,u),!0},setReuse(t,r){Gi=!!r,Gi||(N.m=null),t!==Vn&&(Vn=t,Xi=0,N.m=null,t&&ri("reuse"),!t&&N.w&&!X&&(N.w=N.h=0,e.bindTexture(e.TEXTURE_2D,N.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null)))},setRest(t,r){na=+t||0,aa=+r||0},setPicture(t,r=!1){let n=!!(t&&t[0]>0&&t[1]>0&&(t[0]!==f.width||t[1]!==f.height));n===!!q&&(!n||t[0]===q[0]&&t[1]===q[1])&&!!r===ra||X||(n?(Ur[0]=t[0],Ur[1]=t[1],q=Ur):q=null,ra=!!r,q&&ri("up"),q||(na=0,aa=0),q&&!b&&(b=qf()),!q&&b&&!Xe&&(e.deleteTexture(b.tex),e.deleteFramebuffer(b.fbo),b.rb&&e.deleteRenderbuffer(b.rb),b=null),Q=!1,N.m=null)},top:Xe?{gl:e,canvas:f,screen:_,lay(t,r,n,a,i,s,o,u=1){X||Bh(t,r,n,a,i,s,o,u)},present:()=>Qt(!0,!0),ask:gh,add(t){if(t.solo&&on===null&&!X)try{on=ie(e,ae(e,sr,tu))}catch{on=!1}return Re.push(t),Re.sort((r,n)=>(r.order||0)-(n.order||0)),()=>{let r=Re.indexOf(t);r>=0&&Re.splice(r,1)}},under(t){return Le=t,ri("lay"),()=>{Le===t&&(Le=null)}},keep(t){return oa=t,ye.on=!1,ia?.start(),()=>{oa===t&&(oa=null,ye.on=!1)}},replace(t){return Ue=t,()=>{Ue===t&&(Ue=null)}},get presents(){return Ze},get kept(){return ye.on},warmIn(t){t&&!X&&ht.push(t)},whole(t){t()}}:null,overlay:vo?{set(t,r){!ve&&t?.size&&!X&&(ve=hl(e,{painter:H.painter})),ve&&(ve.setOrder(r),ve.setLive(t&&t.size?t:null,null),dn=!!t?.size)},touch(){ve?.touch()},set cssPx(t){lo=t},set snap(t){kl=!!t},get stale(){return!dn||!Ir||!b?.w?!1:(H.painter.cssPx=lo*D()/f.width,ve.stale(ic(),D(),B()))},get shown(){return dn}}:null,picSize(){return[D(),B()]},get reused(){return Js},setLow(t,r,n=0,a=!1){cc=!!r,uc=!!a,t=t>0&&t<1?t:0,Wn=n>0&&n<1?Math.max(n,t):t,t!==zn&&(zn=t,!t&&!Wn&&Qs())},prepLow(t){X||!(t>0&&t<1)||D()<1||B()<1||(Wn=Math.max(Wn,t),dc(Math.round(D()*t),Math.round(B()*t)),e.bindFramebuffer(e.FRAMEBUFFER,_()))},get lowMade(){return hc},get soft(){return Zs},setMorphLow(t){t=!!t,t!==ls&&(ls=t,!t&&gr&&(Q=!1,ke++))},get lowKept(){return gr},get rowsStatus(){return _i},get partCells(){return Ri},get tintCells(){return Sf},get layerLayout(){return{size:[L,I],at:[...J],wrap:[...Fe],follows:[...Wt]}},get nCells(){return $},composite(t,r=Fl,n=!1,a=0){if(wi(),Us=t,Ni=r,Jr=null,xf=r.style===v0,r.style===x0&&r.on&&(r.streakA??1)>0&&(bf||(bf=!0,bi=A0(e)),bi?.bake()&&(Jr=bi.tex())),!Y||Ln!==D()||Un!==B())return;let i=ms;if(ms=!1,Pn&&!i){this.draw(Y,t,r);return}if(Xh(),w.on&&w.gauge("shaders still compiling",pe.length?pe.join(", "):"none"),w.skipGL){So=!0;return}So&&(So=!1,n=!0);let s=!!r.bleed?.length;(s||Ef)&&(n=!0);let o=Y,u=o[0]!==Wr[0]||o[1]!==Wr[1]||o[2]!==Wr[2]||o[3]!==Wr[3]||o[4]!==Wr[4]||o[5]!==Wr[5];(u||D()!==Zl||B()!==Ql)&&zr++;for(let E=0;E<6;E++)Wr[E]=o[E];Zl=D(),Ql=B();let c=null;if(te&&!u&&mn&&!te.whole){let E=yf(o,Vu);if(E){let z=Wu;z[0]=Math.min(E[0],mn[0]),z[1]=Math.min(E[1],mn[1]),z[2]=Math.max(E[2],mn[2]),z[3]=Math.max(E[3],mn[3]),(z[2]-z[0])*(z[3]-z[1])<=D()*B()/2&&(c=z)}}(te&&!c||Hl&&!te)&&(n=!0),Hl=!!te;let m=Uu(),h=Lu(),d=m&&(!te||!!c)&&!u;d?(Xr[0]!==ha||zr!==ef)&&(w.time(e,"outline layer",Su),ha=Xr[0],ef=zr,n=!0):m?u&&(ha=-1,n=!0):(An(Hr),ha=-1),h?(Xr[1]!==da||zr!==tf)&&(w.time(e,"glow layer",_u),da=Xr[1],tf=zr,n=!0):(An(xn),da=-1);let x=Iu();x?(Xr[2]!==pa||zr!==rf)&&(w.time(e,"warm layer",Bu),pa=Xr[2],rf=zr,n=!0):(An(vn),pa=-1),Jl&&!Ce&&(n=!0),Jl=!!Ce,Ef=s;let A=t.plate&&t.plate.alpha>0?t.plate:null,R=!!(A?.stack&&H?.has(0));Fu(o,!A&&!!t.plate?.stack&&!!H?.has(0));let F=0;if(R&&H.stale(o,D(),B())){w.on&&w.note(we.organs),of=o;let E=w.time(e,"organ layers",yu);E===!0?n=!0:E&&(Pu(E,o),F=ff,w.on&&w.gauge("organ layers: box",`${E[2]-E[0]}\xD7${E[3]-E[1]} px, ${F} cells`))}b&&bh()&&(n=!0);let k=v!=="lobule"&&!Ls&&!!b&&n&&!q&&!Lt()&&!(Le&&Le.on())&&!(Ue&&Ue.on())&&!(i&&!Bf);Jf=n?Jf+1:0,b&&an&&!n&&(n=!0),n&&(F=0);let P=t.fluid&&Rn?t.fluid:null,ue=n?0:Zo;if(Zo=0,!n&&!$&&!(P?.ripple&&yt)&&!ue&&!F&&!te)return;w.on&&(n&&w.note("whole picture"),t.plate||w.note("organ picture down")),Mr.composite++,n&&Mr.whole++,w.on&&(w.note(we.picture),n&&w.note(we.pictureWhole));let Ee=o[0]*o[3]-o[1]*o[2]||1e-9,At=o[3]/Ee,nr=-o[1]/Ee,ar=-o[2]/Ee,zi=o[0]/Ee,kt=-(At*o[4]+ar*o[5]),Br=-(nr*o[4]+zi*o[5]);b&&e.bindFramebuffer(e.FRAMEBUFFER,k?null:b.fbo),Zt=k,b&&(an=k),k&&(Zf=Yn(),Is=ks=-1),e.viewport(0,0,D(),B()),e.disable(e.BLEND);let Nt=Df(r),Dr=()=>e.bindFramebuffer(e.FRAMEBUFFER,b?k?null:b.fbo:_()),Je=!!ct&&Dt()&&Jt.stage()===3,Ga=!Je&&!!ft&&!!r.on&&(r.streakA??1)>0&&!i&&xu()*Math.hypot(o[0],o[1])>=.9*ho&&bu(Dr),Tc=Je?ct.plain:cn,Rc=Je?ct.comp:fo,Hn=n?Nt?Tc:Rc:Nt?Je?ct.plainCell:Nr:Je?ct.compCell:co,sn=c?Nt?Tc:Rc:null;w.on&&w.gauge("composite build",`${Je?"tube ":""}${Nt?"plain":"full"}`);let Xa=r.bleed||qn,yc=Ge.be.fill(0),Fc=Ge.bb.fill(0);for(let E=0;E<Math.min(24,Xa.length);E++)for(let z=0;z<4;z++)yc[E*4+z]=Xa[E][z],Fc[E*4+z]=Xa[E][4+z];let Sc=r.noChev||qn,tl=Math.min(12,Sc.length),rl=Ge.ncv.fill(0);for(let E=0;E<tl;E++)rl.set(Sc[E],E*4);let _c=r.holes||qn,nl=Math.min(16,_c.length),al=Ge.hb.fill(0),il=Ge.hr.fill(0);for(let E=0;E<nl;E++){let z=_c[E];for(let S=0;S<4;S++)al[E*4+S]=z[S]??0;il[E]=z[4]||0}let Bc=A&&!R?(de[0]?1:0)|(de[1]?2:0):0,Te=t.map&&t.map.a>0?t.map:null,ln=!1;Pr&&r.chev&&!s&&!i&&hf>0&&(Bn.update(mi,as,qt,yr,Da,fr*4,ya)&&(e.bindBuffer(e.ARRAY_BUFFER,Qo),e.bufferData(e.ARRAY_BUFFER,Bn.data(),e.DYNAMIC_DRAW,0,Bn.count()*3)),ln=Bn.count()>0),Rt.length=0,Ga&&(Rt.push(ft),Et&&Rt.push(Et)),i&&(Rt.push(ur),et&&Rt.push(Gr)),sn&&sn!==Hn&&Rt.push(sn),ln&&Rt.push(Pr),Rt.push(Hn);for(let E=0;E<Rt.length;E++){let z=Rt[E];e.useProgram(z.p);let S=z.u;n||(l.m3(S.world,lr(Ge.world,o[0],o[1],o[2],o[3],o[4],o[5])),l.f2(S.size,D(),B()),l.f1(S.cell,16)),l.m3(S.inv,lr(Ge.inv,At,nr,ar,zi,kt,Br)),l.f1(S.H,B()),l.f1(S.pxW,1/Math.max(1e-6,Math.hypot(o[0],o[1]))),l.i1(S.plates,Bc),l.i1(S.halfOn,Ga?1:0),l.f1(S.halfR,ho),l.f1(S.plateAlpha,A?.alpha??0),l.f1(S.plateSat,A?.sat??1),l.f4a(S.plateRect0,de[0]?.rect||Jn),l.f4a(S.plateRect1,de[1]?.rect||Jn),l.f4a(S.fluidRect,Rn||Jn),l.f4a(S.fluidS,P?.s||ao),l.f4a(S.fluidInk,P?P.ink:ao),l.f2a(S.fluidLv,P?.lv||ou),l.i1(S.blood,r.on?1:0),l.i1(S.chev,r.chev?1:0),l.i1(S.chevQuad,ln?1:0),l.i1(S.still,r.still?1:0),l.f1(S.flowA,r.alpha??1),l.f3(S.blendA,r.streakA??1,r.chevA??1,r.originA??1),l.f3a(S.chevInk,r.chevInk||su),l.f3a(S.chevLight,r.chevLight||lu),l.f1(S.cssPx,r.vdpr||1),l.i1(S.lenOn,r.streakLen?1:0),l.i1(S.origin,r.origin?1:0),l.i1(S.dyeOn,en&&r.dye!==!1?1:0),l.f1(S.clock,r.clock||0),l.f1(S.bT,r.bt||0),l.f1(S.rows,p),l.fv3(S.originCol,Rl(r.originCol||yl)),l.f3a(S.dyeCol,r.dyeCol||Sl),l.f3a(S.revCol,r.revCol||_l),l.f3a(S.inkLight,r.inkLight||Bl),l.f3a(S.inkDark,r.inkDark||Dl),l.fv4(S.bleedE,yc),l.fv4(S.bleedB,Fc),l.i1(S.bleedN,Math.min(24,Xa.length)),l.fv4(S.noChev,rl),l.i1(S.noChevN,tl),l.fv4(S.chevHole,al),l.fv1(S.chevHoleR,il),l.i1(S.chevHoleN,nl),l.f1(S.mapA,Te?Te.a:0),Te&&(l.f4a(S.mapDot,Te.dot),l.fv4(S.mapZone,Te.zone),l.f4a(S.mapFx,Te.fx),l.f4a(S.mapAlt,Te.alt),l.f2a(S.mapFxX,Te.fxX),l.f4a(S.mapRot,Te.rot))}let Pt=Hn.u;C=0,he(o),V[C++]=+D()||0,V[C++]=+B()||0,V[C++]=+Bc||0,V[C++]=+(A?.alpha??0)||0,V[C++]=+(A?.sat??1)||0,he(de[0]?.rect||Jn),he(de[1]?.rect||Jn),he(Rn||Jn);let $h=C+3;he(P?.s||ao),he(P?P.ink:ao),he(P?.lv||ou),V[C++]=+r.on||0,V[C++]=+r.chev||0,V[C++]=+r.still||0,V[C++]=+(r.alpha??1)||0,V[C++]=+(r.streakA??1)||0,V[C++]=+(r.chevA??1)||0,V[C++]=+(r.originA??1)||0,he(r.chevInk||su),he(r.chevLight||lu),V[C++]=+(r.vdpr||1)||0,V[C++]=+r.origin||0,V[C++]=+(en&&r.dye!==!1)||0,V[C++]=+r.streakLen||0,he(Rl(r.originCol||yl)),he(r.dyeCol||Sl),he(r.revCol||_l),he(r.inkLight||Bl),he(r.inkDark||Dl),he(rl),V[C++]=+tl||0,he(al),he(il),V[C++]=+nl||0,V[C++]=+d||0,V[C++]=+h||0,V[C++]=+x||0,V[C++]=+R||0,V[C++]=+Nt||0,V[C++]=+dt||0,V[C++]=Ga?1:0,V[C++]=Je?1:0,V[C++]=ln?1:0,V[C++]=Te?Te.a:0,Te&&(he(Te.dot),he(Te.zone),he(Te.fx),he(Te.alt),he(Te.fxX),he(Te.rot));let Dc=r.bt||0;if(Dc!==vf&&(r.on||r.chev||r.origin))for(let E=0;E<p;E++)as[E]&&(Ye[E]=1);vf=Dc;let $n=!!Zr&&C===ns&&C<V.length;for(let E=0;$n&&E<C;E++)V[E]!==Zr[E]&&($n=!1);let Wi=$n;if(!$n&&P?.ripple&&yt&&Zr&&C===ns&&C<V.length){Wi=!0;for(let E=0;Wi&&E<C;E++)E!==$h&&V[E]!==Zr[E]&&(Wi=!1)}let Hi=!n&&!Ft&&!Xa.length&&$n;if(Hi&&!i&&!a&&!F&&!ue&&!(P?.ripple&&yt)&&!te&&ke===Bo&&!Ye.includes(1))return b&&e.bindFramebuffer(e.FRAMEBUFFER,_()),w.on&&w.note(we.pictureSkipped),!1;let Mc=ke!==Bo;Bo=ke;let ol=!!(P?.ripple&&yt),$i=!n&&!a&&!F&&!ue&&!te&&Nt&&!Mc&&(ol?Wi&&$e[2]>$e[0]:$n),Yh=ii;if(si($i),w.on&&w.gauge("picture counted as",$i?ol?"the blood's, with the ripple's band":"the blood's":`a new picture: ${n?"drawn whole":a?"rows drawn again":Mc?"geometry or tubes changed":F||ue||te?"organ box, pool or catheter":Nt?"uniforms changed":"dye, origin colours or a bleed"}`),$i)Eu(pr,i||q||Lt()?null:nn,He,o,br,ol?$e:null),(i||q||Lt())&&(ii=!1);else{let E=!!(Le&&Le.on()),z=E&&Le.ver?Le.ver():NaN,S=E&&z!==Kl;Kl=z,gu(Yh,o,n,i||q||Lt()||S||!!(Ue&&Ue.on()),a,F,ue,!!(P?.ripple&&yt),c)}if(Hi){let E=!1;for(let z=0;z<p;z++)rs[z*4]!==Ye[z]&&(rs[z*4]=Ye[z],E=!0);E&&(e.bindTexture(e.TEXTURE_2D,Dn),e.texSubImage2D(e.TEXTURE_2D,0,fr,0,1,p,e.RGBA,e.FLOAT,rs))}if(Je&&(r.on||en&&r.dye!==!1||r.origin)&&(st("before lumen pass"),w.time(e,"lumen layer",Ch,o,t,r),st(v==="lobule"?"lobule lumen pass":"lumen pass"),Ic(v==="lobule",Ph),Dr(),e.viewport(0,0,D(),B()),e.useProgram(Hn.p),w.on&&w.gauge(v==="lobule"?"lobule vessel renderer":"vessel renderer",Jt.gaugeText())),Ga){let E=Et?ah(Math.hypot(o[0],o[1])):0;e.bindFramebuffer(e.FRAMEBUFFER,ee.fbo),e.viewport(0,0,ee.w,ee.h);let z=E>0&&!n&&uo&&!ne.changed,S=E>0?Et:ft;E>0&&!z&&(e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT)),e.useProgram(S.p),qa=null,rr(S.u,d,h,x,R),l.i1(S.u.stillOn,0),l.i1(S.u.bloodOnly,0),E>0?(l.m3(S.u.world,lr(Ge.world,o[0],o[1],o[2],o[3],o[4],o[5])),l.f2(S.u.size,D(),B()),l.f1(S.u.cell,16),e.bindVertexArray(ne.va),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,E)):(e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4)),e.bindVertexArray(null),qa=ee.tex,st("half-size streaks"),Dr(),e.viewport(0,0,D(),B()),e.useProgram(Hn.p),w.on&&w.gauge("streaks at half size",E>0?`${ee.w}\xD7${ee.h}, ${E} cells of wide rows${z?"":", cleared first"}`:`${ee.w}\xD7${ee.h}, whole`)}else qa=null;uo=Ga,n&&b&&K(e.FRAMEBUFFER,k);let Oc=Hi&&!(ln&&(a||F||ue||P?.ripple&&yt||c));l.i1(Pt.stillOn,Oc?1:0),w.on&&w.gauge("still lumens left alone",Hi?`${p-Ye.reduce((E,z)=>E+z,0)} of ${p} rows`:"off"),rr(Pt,d,h,x,R),i?(w.on&&w.gauge("blood squares on screen","whole picture, one pass"),e.enable(e.STENCIL_TEST),e.stencilMask(255),e.clearStencil(0),e.clear(e.STENCIL_BUFFER_BIT),e.stencilFunc(e.ALWAYS,1,255),e.stencilOp(e.KEEP,e.KEEP,e.REPLACE),Gt&&(Os(ur,o,t,d,h,x,R),e.bindVertexArray(Yr),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,Gt)),et&&(Os(Gr,o,t,d,h,x,R),e.bindVertexArray(gn),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,et)),e.stencilFunc(e.EQUAL,0,255),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.useProgram(Hn.p),rr(Pt,d,h,x,R),l.i1(Pt.bloodOnly,0),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.disable(e.STENCIL_TEST),au[0]=b&&!k?e.STENCIL_ATTACHMENT:e.STENCIL,e.invalidateFramebuffer(e.FRAMEBUFFER,au)):n?(l.i1(Pt.bloodOnly,0),w.on&&w.gauge("blood squares on screen","whole picture"),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4)):(w.on&&w.gauge("blood squares on screen",Vh(nn,He,o,br)),l.i1(Pt.bloodOnly,0),a&&(ui&&(e.bindVertexArray(ci),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,ui)),hi&&(e.bindVertexArray(Go),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,hi))),l.i1(Pt.bloodOnly,1),He&&(e.bindVertexArray(En),l.f1(Pt.cell,br),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,He),l.f1(Pt.cell,16)),l.i1(Pt.bloodOnly,0),P?.ripple&&yt&&(e.bindVertexArray(zo),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,yt)),ue&&(e.bindVertexArray(Ho),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,ue)),F&&(e.bindVertexArray(Yo),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,F))),e.bindVertexArray(null),st(i?"one-pass picture":n?"whole picture":"blood pass"),ln&&(df(o,d,h,x,R,Oc),st("heads")),Zr||(Zr=new Float64Array(V.length));for(let E=0;E<C;E++)Zr[E]=V[E];ns=C,Ye.fill(0),Ft=!1,c?(w.on&&w.gauge("catheter box",`${c[2]-c[0]}\xD7${c[3]-c[1]} px`),e.enable(e.SCISSOR_TEST),e.scissor(c[0],B()-c[3],c[2]-c[0],c[3]-c[1]),e.useProgram(sn.p),rr(sn.u,!1,h,x,R),l.i1(sn.u.stillOn,0),l.i1(sn.u.bloodOnly,0),e.bindVertexArray(Me),e.drawArrays(e.TRIANGLE_STRIP,0,4),e.bindVertexArray(null),ln&&df(o,!1,h,x,R,!1),w.time(e,"catheter",nf),m&&w.time(e,"outlines",af),e.disable(e.SCISSOR_TEST)):te&&w.time(e,"catheter",nf),mn=te?yf(o,zu):null,m&&!d&&w.time(e,"outlines",af),b&&!($i&&ia&&Fh(o))&&Qt()},get canLines(){return!!wn},setLines(t){let r=t&&(t.verts!==Ce?.verts||t.rev!==Ce?.rev);if(Ce=wn&&t?.draws?.length?t:null,!!Ce){hr[0]=hr[1]=hr[2]=0;for(let n of Ce.draws){let a=n.warm||n.under?2:n.soft?1:0,i=n.col;dr(a,n.first),dr(a,n.count),dr(a,n.alpha),dr(a,i.length);for(let s=0;s<i.length;s++)dr(a,i[s]);dr(a,n.tri?1:0),dr(a,n.endFade?1:0),dr(a,n.under?1:0)}for(let n=0;n<3;n++){let a=hr[n]===$l[n];for(let i=0;a&&i<hr[n];i++){let s=ua[n][i],o=Fo[n][i];s!==o&&!(s!==s&&o!==o)&&(a=!1)}if(r||!a){let i=Fo[n];Fo[n]=ua[n],ua[n]=i,$l[n]=hr[n],Xr[n]++}}r&&(w.on&&w.note("uploaded: setLines",Ce.verts.byteLength/1024),e.bindBuffer(e.ARRAY_BUFFER,Ro),e.bufferData(e.ARRAY_BUFFER,Ce.verts,e.DYNAMIC_DRAW))}},setLayerScale(t){t=Math.min(1,Math.max(.1,+t||1)),t!==ma&&(ma=t,da=pa=-1,t===1&&De.tex&&!X&&(De.w=De.h=0,e.bindTexture(e.TEXTURE_2D,De.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null)))},get canCath(){return!!pn},setCath(t){if(te=pn&&t?.draws?.length?t:null,Eo=!1,!te)return;for(let i=0;i<te.draws.length;i++)if(te.draws[i].under){Eo=!0;break}let r=te.base||null,n=r?r.byteLength:0,a=n+te.verts.byteLength;w.on&&w.note("uploaded: setCath",((r&&r!==ni?n:0)+te.verts.byteLength)/1024),e.bindBuffer(e.ARRAY_BUFFER,Ao),a>To&&(To=a*2,e.bufferData(e.ARRAY_BUFFER,To,e.DYNAMIC_DRAW),ni=null),r&&r!==ni&&e.bufferSubData(e.ARRAY_BUFFER,0,r),ni=r,te.verts.byteLength&&e.bufferSubData(e.ARRAY_BUFFER,n,te.verts)},setCamera(t,r,n,a=1){return this.setCameraRec(t,(1-t)*r,(1-t)*n,a)},setCameraRec(t,r,n,a=1){!(t>0)||!(a>=0)||(a=Math.min(1,a),t===1&&(r=n=0),!(ce.k===t&&ce.a===a&&ce.ex===r&&ce.ey===n)&&(ce.k=t,ce.a=a,ce.ex=r,ce.ey=n,Ks++,X||Qt(!0,!0)))},setScene(t,r=0,n=0){t>0&&(_e.k===t&&(t===1||_e.ex===r&&_e.ey===n)||(_e.k=t,_e.ex=t===1?0:r,_e.ey=t===1?0:n,Ks++,si(),X||Qt(!0,!0)))},get camera(){return ce},get camKey(){return Lt()?-1:Ks},get target(){return U?(_(),U):null},get drawSeq(){return Pe},get bloodSeq(){return pr},bloodDirty:Tu,bloodDirtyRects:(t,r,n,a)=>bn.rects(t,r,n,a),pictureDirtyRects:(t,r,n,a)=>Do.rects(t,r,n,a),get viewKey(){return Y?Tf:""},onPicture(t){return _o.add(t),()=>_o.delete(t)},clear(){Eh()},get screenShows(){return Ve?Ve.flushes:0},showNow(){Ve&&!X&&Ve.flush()},snapshot(){if(O)return null;let t={...ce};ce.k=1,ce.ex=ce.ey=0,ce.a=1;try{Qt(!1),Ve?.flush();let r=f.toDataURL("image/png");return Object.assign(ce,t),(Re.length||Lt())&&Qt(),r}finally{Object.assign(ce,t)}},capture(){let t=Yn();if(Mt){let r=(Mt&2)!==0;return Mt=0,Pi(!0,r),Ns=t,Ps=Pe,Cs=pr,js=Ze,Ve?.flush(),f}return t===Ns&&Ps===Pe&&Cs===pr&&js===Ze&&!(Ue&&Ue.on())?(Ve?.flush(),f):(Pi(!0,!1),Ns=t,Ps=Pe,Cs=pr,js=Ze,Ve?.flush(),f)},present:Qt,trim(){if(!X){for(let t of[Oe,Mn,Qr,On])e.bindTexture(e.TEXTURE_2D,t),t===Oe?e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null):t===On?e.texImage2D(e.TEXTURE_2D,0,e.R8,1,1,0,e.RED,e.UNSIGNED_BYTE,null):t===Qr?e.texImage2D(e.TEXTURE_2D,0,e.RG16UI,1,1,0,e.RG_INTEGER,e.UNSIGNED_SHORT,null):e.texImage2D(e.TEXTURE_2D,0,e.RGBA16UI,1,1,0,e.RGBA_INTEGER,e.UNSIGNED_SHORT,null);L=I=0,Y=null,Q=!1,Si(),me=null,el(!1),An(Hr),An(xn),An(vn),ha=da=pa=-1,Qs(),ee.tex&&(e.bindTexture(e.TEXTURE_2D,ee.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),ee.w=ee.h=0),U?.fbo&&(e.bindTexture(e.TEXTURE_2D,U.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null),U.w=U.h=1,U.gen++,ye.on=!1),H?.trim(),ve?.trim(),b?.w&&(b.w=b.h=0,e.bindTexture(e.TEXTURE_2D,b.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,1,1,0,e.RGBA,e.UNSIGNED_BYTE,null))}},dispose({lose:t=!1}={}){if(Ah(),Ve?.dispose(),Mt=0,(G||f).removeEventListener("webglcontextlost",wc),(G||f).removeEventListener("webglcontextrestored",bc),!X){Sr(null);for(let r of[...It])gc(r);for(let r of[Xt,Ea,Sn,Ta,yn,Fn,Dn,Ba,di,Oe,Mn,Qr,On,ss,Hr.tex,xn.tex,vn.tex,...de.map(n=>n?.tex)])r&&e.deleteTexture(r);for(let r of[We,ba,xa,Aa,Co,jo,Vo,Wo,$o,Ao,Ro])e.deleteBuffer(r);for(let r of[Yr,gn,En,ne.va,ci,Go,zo,Ho,Yo,Me,go,yo,es])e.deleteVertexArray(r);e.deleteBuffer(Qo),_n&&e.deleteTexture(_n);for(let r of[Ka,jt,fo,co,cn,Nr,ft,Et,Pr,ur,Gr,pn,wn,Cr,fa,un,Qa])r&&e.deleteProgram(r.p);for(let r of[y.tex,Ui.pj,y.scrN,y.scrT,...[...It].map(n=>n.derived?.pj)])r&&e.deleteTexture(r);La&&e.deleteRenderbuffer(La),y.stage2?.dispose(),Be?.dispose();for(let r of[y.patchVAO,y.layVAO,y.tubeVAO])r&&e.deleteVertexArray(r);for(let r of[y.rowBuf,y.patchBuf,y.tubeVB,y.tubeIB])r&&e.deleteBuffer(r);ee.tex&&(e.deleteTexture(ee.tex),e.deleteFramebuffer(ee.fbo)),ve?.dispose(),H?.dispose(),bi?.dispose(),e.deleteFramebuffer(Ar),e.deleteFramebuffer(gf),e.deleteFramebuffer(Hr.fbo),e.deleteFramebuffer(xn.fbo),e.deleteFramebuffer(vn.fbo),b&&(e.deleteTexture(b.tex),e.deleteFramebuffer(b.fbo),b.rb&&e.deleteRenderbuffer(b.rb)),N.tex&&(e.deleteTexture(N.tex),e.deleteFramebuffer(N.fbo)),N.P&&e.deleteProgram(N.P.p);for(let r of[Ie,ot])r&&e.deleteProgram(r.p);for(let r of Object.keys(ut)){e.deleteProgram(ut[r].p);for(let n of ut[r].sh)e.deleteShader(n);delete ut[r]}if(ht.length=0,Qs(),Fr){for(let r of Fr.tx)e.deleteTexture(r);e.deleteFramebuffer(Fr.fb),e.deleteBuffer(Fr.buf),e.deleteVertexArray(Fr.va)}if(pe.length){for(let r of pe)for(let n of kr(r))e.deleteProgram(n.p);pe.length=0,la()}U?.fbo&&(e.deleteTexture(U.tex),e.deleteFramebuffer(U.fbo),U.fbo=U.tex=null,U.w=U.h=0),t&&!O&&e.getExtension("WEBGL_lose_context")?.loseContext()}de[0]=de[1]=null,Ce=te=null,$=He=yt=Gt=et=0,Y=null,L=I=0,X=!0}},Wh={draw:"vessels",drawRows:"vessels",composite:"picture",setGeometry:"uploads",patchGeometry:"uploads",setRadii:"uploads",setBend:"uploads",setTubes:"uploads",paintOrgans:"picture",plateJob:"uploads",plateRows:"uploads",setPlate:"uploads",setFluidSpans:"uploads",setFluidCells:"uploads",setFlow:"uploads",setDye:"uploads"},Ec={setGeometry:t=>(t.ent.byteLength+t.cells.byteLength+(t.blood?.byteLength||0))/1024,setRadii:()=>W*8/1024,patchGeometry:t=>t.patch.reduce((r,[n,a])=>r+(a-n+1)*2048*16,0)/1024,setTubes:t=>t.byteLength/1024,setDye:t=>t?t.byteLength/1024:0,setFluidCells:t=>t.byteLength/1024,plateRows:(t,r,n,a)=>a.byteLength/1024};function Hh(t,r,n,a,i){if(Ec[r]){let s=0;try{s=Ec[r](...i)}catch(o){ir("veins-gl:4099",o)}w.note(`uploaded: ${r}`,s)}return w.time(e,n,()=>a.apply(t,i))}for(let[t,r]of Object.entries(Wh)){let n=_r[t];_r[t]=function(a,i,s,o,u){return w.on?Hh(this,t,r,n,[a,i,s,o,u]):n.call(this,a,i,s,o,u)}}return _r}export{xd as a,vd as b,fr as c,no as d,oo as e,cp as f,Ha as g,Ml as h,Ol as i,gt as j,$a as k,du as l,Ll as m,ea as n,pu as o,up as p,hp as q};
