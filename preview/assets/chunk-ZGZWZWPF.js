import{a as $l,b as Gl,c as Vl,f as Yl}from"./chunk-HOSQIGVN.js";import{a as jo,b as Jl}from"./chunk-DJXKFBQL.js";import{a as El,b as _l,c as Ol,g as zl}from"./chunk-SXVPS7HJ.js";import{c as Hl}from"./chunk-CGYWWP7J.js";import{c as ql,d as Wl}from"./chunk-WW52VSOD.js";import{a as Bl}from"./chunk-VNKPNX5F.js";import{i as Xl,j as jl}from"./chunk-KWSM6KEJ.js";import{c as qo}from"./chunk-DA3J6WCS.js";import{a as Kl}from"./chunk-6O5XHGEV.js";import{a as zo,b as Xo,c as Il}from"./chunk-QRLQ27LZ.js";import{l as Ul}from"./chunk-YKCUVDNG.js";import{e as Bo}from"./chunk-ZWNGB6CL.js";import{d as Nl,ga as Ho,xa as qe}from"./chunk-VEJA2JHM.js";import{c as Xt,e as Wo,g as kl}from"./chunk-QPBQLYHL.js";import{b as pn,e as ye}from"./chunk-NMAMVWQ4.js";import{c as Dl,e as Ko}from"./chunk-KL6L7RD3.js";import{Ba as Gn,Ca as bl,Ea as kt,Ia as Uo,Ka as yl,Pa as wl,ha as hn,sa as xl,wa as vl,ya as gl}from"./chunk-BK4HIZNF.js";import{a as Al,b as Ml,f as Tl,g as Vn,i as Ll,n as Fl,p as Pl,t as Sl,u as Cl}from"./chunk-LU655YPY.js";import{m as pl,n as ml}from"./chunk-HAEIXMCE.js";import{a as $n}from"./chunk-X3WL6NOF.js";import{j as Rl}from"./chunk-JEHXKNI2.js";import{a as Yn,g as z,i as Ze}from"./chunk-2QFF4T7Q.js";var $o=(l,m)=>l===1?m:(l**m-1)/(l-1);function Ai(l,m,y,x,o,b){let h=$o(x,o);return b.rot=y*o,b.Z=x**o,b.ox=l[0],b.oy=l[1],b.tx=h*(m[0]-l[0]),b.ty=h*(m[1]-l[1]),b}var Ql=(l,m,y)=>{let x=z((y-l)/(m-l),0,1);return x*x*(3-2*x)},Ce={por:0,col:0,bm:0,mv:0,act:0,lum:0,pinch:0,v:0,filt:0,prot:0};function Zl(l){let m=l.sigma??.15,y=z(1-(m-.15)/.45,0,1),x=z(Math.max(l.fibSin,1-y),0,1),o=(l.lymph??.6)/(l.lymph0||.6);return Ce.por=y,Ce.col=l.fibSin,Ce.bm=Ql(.12,.7,x),Ce.mv=1-.75*Ql(.1,.85,x),Ce.act=l.act,Ce.lum=l.zone.sin**-.12*(1+.5*l.congU),Ce.pinch=.22*l.act,Ce.v=(l.rev?.sin?-1:1)*z(Math.abs(l.flow)/Math.max(.35,l.zone.sin**-.24),.08,3),Ce.filt=z(o,0,6),Ce.prot=z((l.lyProt-.42)/.42,0,1),Ce}function na(l,m,y,x){let o=l.uLum+.15+.8+3.4*(1+.25*l.uCol)+.2+4+1,b=0,h=[0,0,0,0],p=[0,0,0,0];ea(l,l.uXs-42,l.uXs+42,-o,0,h),ea(l,l.uXk-9,l.uXk+9,l.uKy-7,l.uKy+1,p);for(let S of[h,p])S[0]-=2,S[1]-=2,S[2]+=2,S[3]+=2;let g=ta(h,m,y),q=ta(p,m,y);if(g&&q&&h[0]<p[2]&&p[0]<h[2]&&h[1]<p[3]&&p[1]<h[3]){let S=[Math.min(h[0],p[0]),Math.min(h[1],p[1]),Math.max(h[2],p[2]),Math.max(h[3],p[3])];return Go(S,m,y,x,0)}return g&&(b=Go(h,m,y,x,b)),q&&(b=Go(p,m,y,x,b)),b}function ea(l,m,y,x,o,b){let h=1/0,p=1/0,g=-1/0,q=-1/0;for(let S=0;S<4;S++){let se=S&1?y:m,be=S&2?o:x,ue=l.uF0[0]*se+l.uF0[1]*be+l.uF0[2],re=l.uF1[0]*se+l.uF1[1]*be+l.uF1[2];ue<h&&(h=ue),ue>g&&(g=ue),re<p&&(p=re),re>q&&(q=re)}b[0]=h,b[1]=p,b[2]=g,b[3]=q}function ta(l,m,y){return l[2]>0&&l[3]>0&&l[0]<m&&l[1]<y&&Number.isFinite(l[0]+l[1]+l[2]+l[3])}function Go(l,m,y,x,o){let b=Math.max(0,Math.floor(l[0])),h=Math.min(m,Math.ceil(l[2])),p=Math.max(0,Math.floor(l[1])),g=Math.min(y,Math.ceil(l[3]));return h<=b||g<=p?o:(x[o*4]=b,x[o*4+1]=y-g,x[o*4+2]=h-b,x[o*4+3]=g-p,o+1)}var oa=l=>(l>>>=0,l=(l^l>>>16)>>>0,l=Math.imul(l,2146121005)>>>0,l=(l^l>>>15)>>>0,l=Math.imul(l,2221713035)>>>0,(l^l>>>16)>>>0),We=(l,m)=>(oa((Math.imul(l+1048576>>>0,2654435761)^oa(m))>>>0)>>>8)/16777216,jt=1,At=24,sa=.6;function la(l,m){let y=Math.floor(l/10),x=l-10*y;return We(y,m)>=.8||x<3||x>7?null:{x:jt*l+.5,w:sa,th:.12+.28*Math.abs(x-5)+.18*We(y,m+4)}}var Jn=(l,m)=>{let y=Math.min(1,Math.max(0,(m-l+.06)/.12));return y*y*(3-2*y)},ft=(l,m)=>At*l+7*(We(l,m)-.5);function Vo(l,m){let y=ie.hep*(.3+.4*We(l,m+9)),x=4*(We(l,m+10)-.5);return ft(l,m)+x*(Math.abs(ie.hep*.5-y)/(.5*ie.hep)-.5)}function aa(l,m,y){let x=Math.floor(l/At);return l<ft(x,m)?x--:l>=ft(x+1,m)&&x++,y.j=x,y.x0=ft(x,m),y.x1=ft(x+1,m),y.nu=.3+.4*We(x,m+1),y.nv=.4+.2*We(x,m+2),y.nr=2.6+.5*We(x,m+3),y.bi=We(x,m+4)<.12,y}var hi=(l,m)=>38*l+8+22*We(l,m),pi=4.4;function Yo(l,m){let y=Math.floor(l/38);for(let x=-1;x<=1;x++)if(Math.abs(l-hi(y+x,m))<pi)return!0;return!1}function ia(l,m,y,x,o){for(let b=0;b<2;b++){let h=b?-1/0:y,p=b?1/0:x,g=null,q=1/0;for(let S of l){let se=Math.abs(S.x-m);if(se>20||S.x<h||S.x>p||Yo(S.x,o))continue;let be=S.th+.02*se;be<q&&(q=be,g=S)}if(g)return g.x}return m}var he={poreUp:3,poreDn:5,nucUp:41,nucDn:42,plateUp:29,plateDn:71},ie={lum:5,endo:.8,disse:3.4,hep:20},mn=new Int32Array(8),mi=`#version 300 es
layout(location=0) in vec2 corner;
uniform vec2 size;
out vec2 vP;
void main() { vP = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5) * size; gl_Position = vec4(corner, 0.0, 1.0); }`,ra=`
uniform vec3 uI0, uI1;          // device px \u2192 local \xB5m
uniform vec2 size;
uniform float uPx;              // \xB5m per device px
uniform vec4 uRev;              // shown: alpha, from x (\xB5m, toward the portal side), to x, half-height |y|
uniform float uAll;             // shown everywhere
uniform float uFocus;           // how far the tissue beyond its own plates fades into the page (eased in as the zoom lands)
uniform vec2 uDet;              // detail: amount, half-length (\xB5m) of the stretch that has it
float sat(float x) { return clamp(x, 0.0, 1.0); }
float revealA(vec2 l) {
  // Soft edges (\xB5m): long at the ends of the run, so the vessel fades into the lobule's own; short across it.
  float ex = max(8.0, 14.0 * uPx), ey = max(2.0, 5.0 * uPx);
  float inX = smoothstep(uRev.y - ex, uRev.y + ex, l.x) * (1.0 - smoothstep(uRev.z - ex, uRev.z + ex, l.x));
  float inY = 1.0 - smoothstep(uRev.w - ey, uRev.w + ey, abs(l.y));
  return max(uRev.x * inX * inY, uAll);
}
float detailAt(float x) { return uDet.x * (1.0 - smoothstep(uDet.y, uDet.y + 30.0, abs(x))); }`,xi=`#version 300 es
precision highp float;
precision highp int;
in vec2 vP;
out vec4 o;
${ra}
uniform int uPass;              // 0: the tissue; 1: the cells that lie over the moving particles (stellate, Kupffer)
uniform float uLum, uPinch, uXs, uXk, uKy, uHscA, uCol, uBm, uMv, uAct, uPor, uFlow, uLym, uLyF, uDir, uDark, uShim, uStreak;
uniform vec3 cBg, cShade, cLumen, cLymph, cCell, cUnder, cNuc, cCol, cBm, cBile, cEndo, cEndoS, cEndoE, cEndoN, cHscQ, cHscA, cHscN, cKup, cKupN, cKupE, cRbc, cEndF, cEndE;
uniform float aBm;
uniform vec4 uEnd;               // the end arrows: portal x, central x (\xB5m), size (\xB5m), alpha
uniform vec2 uEndA;              // how much each end's name shows (0 to 1): its arrow fades with it
uniform vec4 uWedge;              // the wedged column's wash (sinusoid-wash.js): alpha (0: none, as on every slide but one), how far it has come from the central end (0 to 1)
uniform vec3 cWedge;             // its colour: the wedge's amber

const float ENDO = ${ie.endo.toFixed(2)}, DISSE = ${ie.disse.toFixed(2)}, HEP = ${ie.hep.toFixed(1)}, LUM0 = ${ie.lum.toFixed(1)};
const float SLOT = ${jt.toFixed(2)}, CELL = ${At.toFixed(1)};

uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h1(int i, int s) { return float(hsh((uint(i + 1048576) * 0x9e3779b1u) ^ hsh(uint(s))) >> 8) / 16777216.0; }
float cov(float d) { return 1.0 - smoothstep(-0.7 * uPx, 0.7 * uPx, d); }
float line(float d, float w) { return cov(abs(d) - max(0.5 * w, 0.55 * uPx)); }   // a line at least about a pixel wide
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdE(vec2 p, vec2 ab) { float k0 = length(p / ab), k1 = length(p / (ab * ab)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdTaper(vec2 p, vec2 a, vec2 b, float ra, float rb) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * sat(dot(v0, e0) / dot(e0, e0)), q1 = v1 - e1 * sat(dot(v1, e1) / dot(e1, e1)), q2 = v2 - e2 * sat(dot(v2, e2) / dot(e2, e2));
  float sg = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), sg * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), sg * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), sg * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float dot2(vec2 v) { return dot(v, v); }
// The distance to a quadratic B\xE9zier (A, control B, C) and where along it (t), for smooth tapered processes.
vec2 sdBez(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A, b = A - 2.0 * B + C, c = a * 2.0, d = A - pos;
  float kk = 1.0 / max(dot(b, b), 1e-6), kx = kk * dot(a, b), ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0, kz = kk * dot(d, a);
  float p = ky - kx * kx, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz, h = q * q + 4.0 * p * p * p;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0, uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = sat(uv.x + uv.y - kx);
    return vec2(length(d + (c + b * t) * t), t);
  }
  float z = sqrt(-p), v = acos(clamp(q / (p * z * 2.0), -1.0, 1.0)) / 3.0, m = cos(v), n = sin(v) * 1.732050808;
  vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
  float d1 = dot2(d + (c + b * t.x) * t.x), d2 = dot2(d + (c + b * t.y) * t.y);
  return d1 < d2 ? vec2(sqrt(d1), t.x) : vec2(sqrt(d2), t.y);
}
// A smooth process: a B\xE9zier stroke tapering from radius ra to rb.
float sdProc(vec2 p, vec2 A, vec2 B, vec2 C, float ra, float rb) { vec2 r = sdBez(p, A, B, C); return r.x - mix(ra, rb, r.y); }
// Flat fill, no outline, as the lobule draws its cells: a shape reads by its colour against what is under it.
vec3 paint(vec3 under, vec3 fill, float d) { return mix(under, fill, cov(d)); }

float halfW(float x) { return uLum * (1.0 - uPinch * exp(-pow((x - uXs) / 11.0, 2.0))) + 0.15 * sin(x * 0.11 + 1.3); }
float disseW(float x) { return DISSE * (1.0 + 0.25 * uCol) + 0.2 * sin(x * 0.07); }

// \u2500\u2500 Fenestrae (as poreAt) and the endothelium \u2500\u2500
float poreOpen(int j, int sd, out float px) {
  int G = int(floor(float(j) / 10.0)), k = j - 10 * G;
  px = 0.0;
  if (h1(G, sd) >= 0.8 || k < 3 || k > 7) return 0.0;
  px = SLOT * float(j) + 0.5;
  float th = 0.12 + 0.28 * abs(float(k) - 5.0) + 0.18 * h1(G, sd + 4);
  return ${sa.toFixed(2)} * smoothstep(th - 0.06, th + 0.06, uPor);
}
// The endothelium of a lining at |y| = a (lumen face at hw): one thin, solid sheet in section, cut through by real gaps
// where its fenestrae are open (the plasma runs through them; they close, one by one, as it defenestrates), each cell
// swelling over its flat nucleus, which bulges into the lumen, with a fine junction midway to the next cell; a little
// thicker as it capillarizes. With little detail (as the lobule draws it) a hairline casing.
// dN is the nucleus, dJ the junctions between cells.
float endoTh(float det) { return mix(0.1, 0.19, det) * (1.0 + mix(0.45, 0.63, det) * (1.0 - uPor)); }   // half its thickness
float nucAt(int n, int nsd) { return 38.0 * float(n) + 8.0 + 22.0 * h1(n, nsd); }
float sdEndo(float x, float a, float hw, int sd, int nsd, bool skipK, float det, out float dN, out float dJ) {
  float th = endoTh(det);
  float ay = a - (hw + ENDO * 0.5), d = abs(ay) - th;
  dN = 1e3; dJ = 1e3;
  if (det < 0.02) return d;
  int j = int(floor(x / SLOT));
  for (int k = -1; k <= 1; k++) {
    float px;
    float w = poreOpen(j + k, sd, px) * det;
    if (w > 0.02) d = smax(d, -(abs(x - px) - 0.5 * w), th);   // a gap with rounded lips
  }
  if (nsd > 0) {
    int n = int(floor(x / 38.0));
    for (int k = -1; k <= 1; k++) {
      float c = nucAt(n + k, nsd);
      float m = 0.5 * (c + nucAt(n + k + 1, nsd));
      dJ = min(dJ, sdTaper(vec2(x - m, ay), vec2(-0.5, -th), vec2(0.5, th), 0.0, 0.0));
      if (skipK && abs(c - uXk) < 12.0) continue;
      vec2 q = vec2(x - c, ay + 0.38 * det);   // the body and nucleus sit toward the lumen
      d = smin(d, sdE(q, vec2(3.3, th + 0.55 * det)), 0.9);
      dN = min(dN, sdE(q, vec2(2.3, 0.42 * det + 0.01)));
    }
  }
  return d;
}
// The endothelial cells: one solid sheet with a thin dark border round the whole cell (both faces, the lips of every
// open pore and the swell over the nucleus), the nucleus a deeper lens with its own rim, the junctions in the border ink.
// The border and the sheet's own colour come in with the detail; without it the casing is drawn as before.
vec3 endoInk(vec3 under, float d, float dN, float dJ, float det) {
  vec3 c = mix(under, cEndoE, cov(d - max(0.1, 2.4 * uPx) * det) * det);
  c = mix(c, mix(cEndo, cEndoS, det), cov(d) * mix(0.95, 1.0, det));
  c = mix(c, cEndoN, cov(dN));
  c = mix(c, mix(cEndoN, cEndoE, 0.6), line(dN, 0.05) * det);
  return mix(c, cEndoE, line(dJ, 0.09) * cov(d) * det);
}

// The wedged column's wash: 1 from the central vein's end of the sinusoid as far as the wash has come toward the portal venule's, soft at its front; 0 when off.
float wedgeA(float x) {
  float span = uEnd.x - uEnd.y;
  if (uWedge.x <= 0.0 || abs(span) < 1.0) return 0.0;
  float t = (x - uEnd.y) / span;
  float f = uWedge.y * 1.08;
  return uWedge.x * (1.0 - smoothstep(f - 0.08, f, t));
}

// \u2500\u2500 The lumen, flat as the lobule's: pressure colour, a thin light line and a thin dark one, the streaks \u2500\u2500
vec3 lumen(float x, float y, float hw, int lane0) {
  float wz = wedgeA(x);
  float live = 1.0 - 0.9 * wz;   // (the column is still: the flow's light and streaks die away in it)
  vec3 c = mix(cLumen, cWedge, 0.85 * wz);
  // The flow's light (the shimmer, the sheen, the glints): white on a dark lumen, a deep shade of the lumen on a pale one, where white is
  // 1.2 to 1.9:1; eased by the lumen's lightness (the pressure colour moves), as the vessels' own light was (visual-style B5).
  float fPale = smoothstep(0.58, 0.66, dot(cLumen, vec3(0.299, 0.587, 0.114)));
  vec3 fInk = mix(vec3(1.0), mix(cLumen, vec3(0.07, 0.075, 0.13), 0.7), fPale);
  c = mix(c, vec3(1.0), 0.28 * line(y + hw - 0.5, 0.16));
  c = mix(c, vec3(0.0), 0.1 * line(y - hw + 0.5, 0.16));
  // Streaks in lanes, each at its lane's speed (the parabolic profile: fastest in the middle).
  const float NL = 9.0;
  float r = clamp(y / hw, -1.0, 1.0), u = (r * 0.5 + 0.5) * NL, li = min(floor(u), NL - 1.0), lc = (li + 0.5) / NL * 2.0 - 1.0;
  int id = int(li) + lane0;
  float prof = 1.8 * (1.0 - lc * lc) + 0.05, P = 15.0 + 7.0 * h1(id, 7);
  float sx = x - uFlow * prof + h1(id, 8) * P, k = floor(sx / P), xx = sx - k * P;
  int ki = int(k);
  float hk = h1(ki * 31 + id, 9), Ls = 4.0 + 6.0 * hk, x0 = (P - Ls) * h1(ki + id * 977, 10);
  float e = (xx - x0) / Ls;
  float yc = (lc + (h1(ki, id + 11) - 0.5) * 0.6 / NL) * hw;
  float rr = 1.0 - r * r;
  c = mix(c, fInk, 0.07 * rr * rr * uShim / 0.5 * live);
  float wy = min(max(0.35, 2.8 * uPx), 0.3 * hw / NL);
  // Light on a flowing liquid: a slow sheen drifts with the blood (two broad, warped waves), and each streak is a soft
  // glint, bright at its head and trailing off, that swells and fades as the sheen passes over it, so none blinks.
  float sx2 = x - uFlow * (0.55 + 0.45 * rr);
  float sh = 0.5 + 0.5 * sin(sx2 * 0.075 + 1.6 * sin(sx2 * 0.031 + y * 0.35) + y * 0.22);
  sh = sh * sh * (3.0 - 2.0 * sh);
  c = mix(c, fInk, 0.11 * sh * rr * uShim / 0.5 * live);
  float ed = uDir < 0.0 ? 1.0 - e : e;   // the head leads the flow
  float along = smoothstep(0.0, 0.85, ed) * (1.0 - smoothstep(0.86, 1.0, ed));
  float acr = exp(-pow((y - yc) / (wy * (0.6 + 0.6 * ed)), 2.0));
  c = mix(c, fInk, along * acr * smoothstep(0.15, 0.35, hk) * uShim * 0.6 * (0.45 + 0.75 * sh) * live);
  return c;
}

// \u2500\u2500 The space of Disse: lymph running back to the portal triad; collagen and microvilli as the detail comes in \u2500\u2500
vec3 disse(float x, float a, float wi, float hi, int side, bool main, float det) {
  vec3 c = cLymph;
  // The lymph: soft dashes running back toward the portal triad, tapered at both ends (never a hard line). How many
  // show follows the lymph flow (uLyF, the share of slots lit: sparse when it is low, crowded when it is high),
  // and each fades in or out as that eases, so none pops; the speed is the flow's too (lymX in sinusoid-view.js).
  float lx = x - uLym + (main ? 0.0 : 3.0) + (side < 0 ? 0.0 : 7.0);
  for (int j = 0; j < 4; j++) {
    float fj = float(j), P = 8.0 + 1.7 * fj, sx = lx * (0.92 + 0.08 * fj) + 4.1 * fj, k = floor(sx / P), xx = sx - k * P;
    float L = 2.4 + 1.8 * h1(int(k) * 7 + j, 21 + side), x0 = (P - L) * h1(int(k) + j * 131, 23 + side), e = (xx - x0) / L;
    float on = smoothstep(h1(int(k) * 13 + j, 27 + side) - 0.12, h1(int(k) * 13 + j, 27 + side), uLyF - 0.25 * fj);
    if (on < 0.01 || e < 0.0 || e > 1.0) continue;
    float al = smoothstep(0.0, 0.3, e) * (1.0 - smoothstep(0.6, 1.0, e)) * on;
    float yc = mix(wi, hi, 0.24 + 0.17 * fj + 0.06 * (h1(int(k), 29 + j) - 0.5)), wy = max(0.07 * (hi - wi), 1.1 * uPx);
    c = mix(c, vec3(1.0), al * exp(-pow((a - yc) / wy, 2.0)) * uStreak * clamp(0.75 + 0.3 * uLyF, 0.75, 1.1));
  }
  // Collagen: a pale fill as it takes the space the lymph had, then banded fibre bundles laid down by the
  // stellate cell: they start at it and spread along Disse, each thickening at its own stage.
  if (uCol > 0.02) {
    c = mix(c, cCol, (0.36 - 0.08 * uDark) * smoothstep(0.1, 0.9, uCol));
    float near = side < 0 ? exp(-pow((x - uXs) / 26.0, 2.0)) * uAct * 0.08 : 0.0;
    float reach = 14.0 + 320.0 * smoothstep(0.0, 0.8, uCol) * (side < 0 ? 1.0 : 0.8);
    float spread = main ? 1.0 - smoothstep(reach - 30.0, reach, abs(x - uXs - (side < 0 ? 0.0 : 18.0))) : 1.0;   // the neighbouring sinusoids' Disse fills evenly
    float fd = main ? det : 1.0;
    float bd = smoothstep(0.3, 0.1, uPx) * fd;                   // the cross-banding, only once it is resolved
    vec3 fib = cCol * 0.9, fibE = cCol * 0.72;
    for (int i = 0; i < 7; i++) {
      float al = smoothstep(float(i) / 7.0 * 0.8, float(i) / 7.0 * 0.8 + 0.22, uCol) * fd * spread;
      if (al < 0.01) continue;
      int sd = (side < 0 ? 91 : 92) + (main ? 0 : 40);
      float v = 0.15 + 0.7 * h1(i, sd), f = 0.12 + 0.12 * h1(i, sd + 7), ph = 6.2831853 * h1(i, sd + 9);
      float tc = clamp(v + 0.12 * sin(x * f + ph) + 0.05 * sin(x * f * 2.7 + ph * 1.7) + near, 0.08, 0.92);
      float w = (0.2 + (0.5 + 0.3 * h1(i, sd + 3)) * al * uCol) * (hi - wi) * 0.22;
      float d = abs(a - mix(wi, hi, tc)) - 0.5 * w;
      if (d > 0.4) continue;
      // Striated like collagen under the microscope: light and dark bands across the bundle, and a fibril seam along it.
      float band = 0.5 + 0.5 * sin(6.2831853 * x / 1.1 + ph);
      vec3 fc = mix(fib, fibE, (0.05 + 0.15 * band) * bd);
      fc = mix(fc, fibE, line(a - mix(wi, hi, tc) - 0.18 * w * sin(x * 0.9 + ph), 0.06) * 0.15 * bd);
      c = mix(c, fc, cov(d) * al * 0.5);           // translucent, like the lobule's fibrous bands
      c = mix(c, fibE, line(d, 0.06) * al * 0.18);
    }
  }
  if (!main) return c;
  // Microvilli: fine strokes from the hepatocytes' face, flattened as the space fills with collagen.
  if (uMv * det > 0.02) {
    float pi = floor(x / 0.8), hx = (pi + 0.5) * 0.8 + 0.22 * (h1(int(pi), 61 + side) - 0.5);
    float len = (hi - wi) * 0.5 * uMv * det * (0.55 + 0.45 * h1(int(pi), 63 + side));
    float d = sdTaper(vec2(x, a), vec2(hx, hi + 0.2), vec2(hx + 0.1 * sin(pi), hi - len), 0.075, 0.06);
    c = mix(c, mix(cCell, cUnder, 0.25), cov(d));
  }
  // The basement membrane, as the sinusoid becomes a capillary.
  if (uBm > 0.02) c = mix(c, cBm, line(a - wi - 0.3, 0.3 + 0.2 * uBm) * uBm * aBm * det);
  return c;
}

// \u2500\u2500 A hepatocyte plate: v from its face on Disse (0) to its far side (HEP) \u2500\u2500
// Tidy polygonal cells, as a textbook draws them: each border a straight line with one gentle bend (so neighbours
// fit like tiles), rounded corners, a flat fill a shade lighter inside, a fine membrane, and a round nucleus.
float cellEdge(int j, int sd) { return CELL * float(j) + 7.0 * (h1(j, sd) - 0.5); }
float edgeAt(int j, int sd, float v) {
  float vm = HEP * (0.3 + 0.4 * h1(j, sd + 9)), bend = 4.0 * (h1(j, sd + 10) - 0.5), tilt = 2.6 * (h1(j, sd + 11) - 0.5);
  return cellEdge(j, sd) + bend * (abs(v - vm) / (0.5 * HEP) - 0.5) + tilt * (v / HEP - 0.5);
}
vec3 plate(float x, float v, int sd, float det) {
  int j = int(floor(x / CELL));
  if (x < edgeAt(j, sd, v)) j--; else if (x >= edgeAt(j + 1, sd, v)) j++;
  float x0 = cellEdge(j, sd), x1 = cellEdge(j + 1, sd);
  float inner = smin(smin(x - edgeAt(j, sd, v), edgeAt(j + 1, sd, v) - x, 2.4), smin(v, HEP - v, 2.4), 2.4);
  float d = 0.5 - inner;
  vec3 c = cCell * (0.975 + 0.04 * h1(j, sd + 5));
  c = mix(c, vec3(1.0), (0.05 - 0.03 * uDark) * smoothstep(-1.5, -6.0, d));     // a shade lighter inside
  c = mix(c, cUnder, 0.16 * smoothstep(-1.2, 0.0, d));                          // and deeper at the membrane
  c = mix(c, mix(cUnder, cNuc, 0.3), line(d + 0.2, 0.1) * 0.3 * det);          // the membrane, fine
  bool bi = h1(j, sd + 4) < 0.12;
  float nu = 0.3 + 0.4 * h1(j, sd + 1), nv = 0.4 + 0.2 * h1(j, sd + 2), nr = 2.6 + 0.5 * h1(j, sd + 3);
  for (int k = 0; k < 2; k++) {
    if (k == 1 && !bi) break;
    float uu = bi ? nu + (k == 0 ? -0.15 : 0.15) : nu, vv = nv + (k == 1 ? 0.04 : 0.0), rr = bi ? nr * 0.82 : nr;
    vec2 nq = vec2(x, v) - vec2(mix(x0 + 2.0, x1 - 2.0, uu), mix(2.0, HEP - 2.0, vv));
    // The nucleus: a flat, deeper disc with a fine envelope and a nucleolus.
    float dn = length(nq) - rr;
    c = mix(c, mix(c, cNuc, 0.24), cov(dn));
    c = mix(c, mix(c, cNuc, 0.45), line(dn + 0.08, 0.14) * det);
    c = mix(c, mix(c, cNuc, 0.6), cov(length(nq - vec2(0.3, -0.25) * rr) - 0.16 * rr) * det);
  }
  vec3 outC = mix(cUnder, c, cov(d) * 0.96);
  // Bile canaliculi between neighbouring cells, mid-plate, each cut across as a journal figure draws it: a small lumen of pale bile in a
  // groove of both cells, its own membrane, and the tight junctions (a short dark bar across the border either side) that seal it off from
  // the blood's side. Still: canalicular bile moves by diffusion, not as a stream (Vartak, Hepatology 2021). canaliculusAt() is its centre.
  for (int k = 0; k < 2; k++) {
    vec2 q = vec2(x - edgeAt(j + k, sd, v), v - 0.5 * HEP);
    // (The tight junctions either side of it: each a short dark bar across the border.)
    for (int s = -1; s <= 1; s += 2) outC = mix(outC, mix(cBile, cNuc, 0.35), cov(sdE(q - vec2(0.0, float(s) * 0.98), vec2(0.62, 0.11))) * 0.85 * det);
    float dl = sdE(q, vec2(0.68, 0.56));
    outC = mix(outC, mix(cBile, vec3(1.0), 0.5 - 0.3 * uDark), cov(dl) * det);
    outC = mix(outC, mix(cBile, cNuc, 0.2), line(dl, 0.17) * det);
  }
  return outC;
}

// \u2500\u2500 The stellate (Ito) cell, in the upper Disse; p = (x, depth from the axis) \u2500\u2500
// Drawn as a textbook figure: one smooth, continuous membrane around a body lying along the sinusoid and its tapered
// processes, which curve down onto the endothelium and run along it; inside, only its nucleus (as NEJM draws it).
// Quiescent it is plump and pale; activated (a myofibroblast) it lengthens and darkens, and its processes grow long,
// with finer branches reaching up between the hepatocytes.
float hscL() { return 4.4 + 2.4 * uAct; }
float hscW() { return 1.4 - 0.2 * uAct; }
float hscWall(float x) { return halfW(x) + ENDO + 0.42; }
float sdHsc(vec2 p) {
  float L = hscL(), Wd = hscW();
  vec2 b = p - vec2(uXs, uHscA);
  float d = sdE(b, vec2(L, Wd));
  for (int i = 0; i < 2; i++) {
    float sg = i == 0 ? -1.0 : 1.0;
    // Down from the body's flank onto the wall, then along it (two B\xE9zier strokes that meet at the same width).
    float xA = uXs + sg * 0.62 * L, xB = uXs + sg * (L + 0.6), xC = uXs + sg * (L + 4.2);
    float len = 5.0 + 11.0 * uAct, xE = xC + sg * len, xD = 0.5 * (xC + xE);
    vec2 A = vec2(xA, uHscA - 0.1 * Wd), B = vec2(xB, hscWall(xB) + 0.15), C = vec2(xC, hscWall(xC)), E = vec2(xE, hscWall(xE));
    float rA = 0.62 + 0.1 * uAct, rC = 0.28 + 0.08 * uAct;
    d = smin(d, sdProc(p, A, B, C, rA, rC), 1.0);
    d = smin(d, sdProc(p, C, vec2(xD, hscWall(xD)), E, rC, 0.06), 0.25);
    // Activated: a finer branch curving up between the hepatocytes (it grows out of the process, never pops in).
    if (uAct > 0.02) {
      float xF = xC + sg * 1.2, wF = hscWall(xF);
      d = smin(d, sdProc(p, vec2(xF, wF), vec2(xF + sg * 2.6, wF + 0.4), vec2(xF + sg * 3.4, wF + disseW(xF) * 0.85), 0.2, 0.05) + 0.8 * (1.0 - uAct), 0.3);
    }
  }
  return d;
}
vec4 hsc(vec2 p) {
  float d = sdHsc(p);
  if (d > 0.3) return vec4(0.0);
  float L = hscL(), Wd = hscW();
  vec3 c = mix(cHscQ, cHscA, uAct);
  c = mix(c, mix(c, vec3(1.0), 0.18 - 0.08 * uDark), smoothstep(-0.2, -1.2, d));   // a shade lighter inside
  // Activated: faint stress fibres along the body.
  if (uAct > 0.05) {
    float fb = 0.0;
    for (int i = -1; i <= 1; i++) fb = max(fb, line(p.y - uHscA - float(i) * 0.38 * Wd - 0.1 * sin((p.x - uXs) * 0.5 + float(i) * 2.0), 0.06));
    c = mix(c, cHscN, fb * 0.28 * uAct * cov(d + 0.35));
  }
  // The nucleus: a smooth oval, a fine envelope and a nucleolus.
  vec2 nc = vec2(uXs, uHscA);
  float dn = sdE(p - nc, vec2(1.15 + 0.9 * uAct, 0.5 + 0.05 * uAct));
  c = mix(c, mix(c, cHscN, 0.7), cov(dn));
  c = mix(c, cHscN, line(dn, 0.06) * 0.5);
  c = mix(c, cHscN * 0.8, cov(length(p - nc - vec2(0.3, 0.0)) - 0.18) * 0.6);
  // One continuous membrane around body and processes alike.
  float mem = line(d, 0.08);
  c = mix(c, cHscN, mem * 0.55);
  // Slightly translucent, as a journal figure's cells: what passes beneath shows faintly through.
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)) * max(0.84, mem));
}

// \u2500\u2500 The Kupffer cell: a macrophage anchored on the lower lining, reaching into the stream \u2500\u2500
// A smooth, rounded body on a foot spread over the endothelium, two short blunt pseudopods, a kidney-shaped nucleus,
// a phagosome holding a red cell it has taken up, a few lysosomes; flat, slightly translucent, a fine membrane line.
float sdKup0(vec2 q) {
  float d = sdE(q - vec2(0.0, -2.5), vec2(2.9, 2.2));                                   // the body, a smooth dome
  d = smin(d, sdE(q - vec2(0.0, -0.4), vec2(3.4, 0.45)), 1.4);                          // its foot, a gentle skirt on the lining
  // A few slender pseudopods, tapering out of the body: two along the lining, two reaching into the stream.
  d = smin(d, sdTaper(q, vec2(-2.4, -0.7), vec2(-6.6, -0.35), 0.62, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(2.4, -0.7), vec2(6.4, -0.3), 0.6, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(-1.7, -3.9), vec2(-4.1, -6.1), 0.55, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(1.8, -4.0), vec2(3.4, -6.3), 0.5, 0.1), 0.9);
  return d;
}
float kupK() { return clamp(uKy / 5.2, 0.6, 1.0); }
vec4 kupffer(vec2 p) {
  float k = kupK();
  vec2 q = (p - vec2(uXk, uKy)) / k;
  float d = sdKup0(q) * k;
  if (d > 0.3) return vec4(0.0);
  // Faded and translucent, as the stellate cell: a pale body, a shade lighter inside, its nucleus low in it (clear of its name).
  vec3 c = mix(cKup, vec3(1.0), 0.18 - 0.08 * uDark);
  c = mix(c, mix(cKup, vec3(1.0), 0.32 - 0.12 * uDark), smoothstep(-0.2, -1.4, d));
  float dn = sdE(q - vec2(0.9, -1.5), vec2(1.25, 0.7)) * k;
  c = mix(c, cKupN, cov(dn) * 0.55);
  c = mix(c, cKupE, line(dn, 0.06) * 0.35);
  float mem = line(d, 0.08);
  c = mix(c, cKupE, mem * 0.5);
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)) * max(0.74, mem * 0.85));
}

void main() {
  vec3 dv = vec3(vP, 1.0);
  float x = dot(uI0, dv), y = dot(uI1, dv), a = abs(y);
  int side = y < 0.0 ? -1 : 1;
  float hw = halfW(x), wi = hw + ENDO, dw = disseW(x), hi = wi + dw;
  float det = detailAt(x), show = revealA(vec2(x, y));
  if (uPass == 1) {
    // The stellate and Kupffer cells, over the particles.
    vec4 cl = vec4(0.0);
    if (side < 0 && abs(x - uXs) < 42.0 && a > hw && a < hi + 4.0) cl = hsc(vec2(x, a));
    if (abs(x - uXk) < 9.0 && y > uKy - 7.0 && y < uKy + 1.0) cl = kupffer(vec2(x, y));
    float al = cl.a * det * show;
    o = vec4(cl.rgb * al, al);
    return;
  }
  vec3 c = cBg;
  if (a < hw) {
    c = lumen(x, y, hw, 0);
    // The arrows at the ends, beside their labels: the blood coming in from the portal venule and going out to the central vein.
    for (int i = 0; i < 2; i++) {
      float s = uEnd.z;
      // Each points toward its vessel, off the view: the portal venule's back upstream, the central vein's on downstream.
      vec2 q = vec2((x - (i == 0 ? uEnd.x : uEnd.y)) * uDir * (i == 0 ? -1.0 : 1.0), y);
      // A thick, laid-down arrow: a short
      // broad shaft and a wide head, softly rounded, in the labels' ink faded into the blood, as a journal figure marks flow.
      float dA = min(sdRB(q - vec2(-0.3 * s, 0.0), vec2(0.28 * s, 0.17 * s), 0.05 * s),
                     sdTri(q, vec2(0.52 * s, 0.0), vec2(0.0, 0.46 * s), vec2(0.0, -0.46 * s)) - 0.03 * s);
      c = mix(c, cEndE, cov(dA - 0.08 * s) * 0.3 * uEnd.w * (i == 0 ? uEndA.x : uEndA.y));
      c = mix(c, cEndF, cov(dA) * 0.5 * uEnd.w * (i == 0 ? uEndA.x : uEndA.y));
    }
  }
  // Under the lining: as the detail comes in, the blood up to the sheet's outer face (what an open pore shows), the lymph beyond.
  else if (a < wi) c = mix(mix(mix(cLumen, vec3(1.0), 0.3), cLymph, (a - hw) / ENDO), mix(cLymph, cLumen, cov(a - (hw + ENDO * 0.5 + endoTh(det)))), det);
  else if (a < hi) c = disse(x, a, wi, hi, side, true, det);
  else {
    float v = a - hi;
    int sd = side < 0 ? ${he.plateUp} : ${he.plateDn};
    // The plate, then the next sinusoid beyond it (its Disse, lining and lumen), then the next plate.
    const float D = DISSE, E = ENDO, L = LUM0;
    if (v < HEP) c = plate(x, v, sd, det);
    else {
      // (Repeating outward, so the tissue fills any screen, also while the zoom from the lobule still shows it small.)
      float b = mod(v - HEP, 2.0 * D + 2.0 * E + 2.0 * L + HEP);
      if (b < D) c = disse(x, D - b + E, E, D + E, side, false, 0.0);
      else if (b < D + 2.0 * E + 2.0 * L) {
        float yl = b - (D + E + L), al = abs(yl);
        c = al < L ? lumen(x, yl, L, 40) : mix(mix(cLumen, vec3(1.0), 0.3), cLymph, (al - L) / E);
        float dN, dJ, de = sdEndo(x, al, L, side < 0 ? 7 : 9, 0, false, 0.0, dN, dJ);
        c = endoInk(c, de, dN, dJ, 0.0);
      }
      else if (b < 2.0 * D + 2.0 * E + 2.0 * L) c = disse(x, b - (D + 2.0 * E + 2.0 * L) + E, E, D + E, side, false, 0.0);
      else c = plate(x, b - (2.0 * D + 2.0 * E + 2.0 * L), sd + 13, 0.0);
    }
  }
  // The main lining over all that.
  if (a < wi + 0.6 && a > hw - 1.4) {
    float dN, dJ, de = sdEndo(x, a, hw, side < 0 ? ${he.poreUp} : ${he.poreDn}, side < 0 ? ${he.nucUp} : ${he.nucDn}, side > 0, det, dN, dJ);
    c = endoInk(c, de, dN, dJ, det);
  }
  // Focus: beyond this sinusoid's own plates the tissue fades to dark (the page in dark mode, a deep shade in light).
  float f0 = uLum + ENDO + disseW(0.0) + HEP * 0.85;
  c = mix(c, cShade, smoothstep(f0, f0 + 18.0, a) * (0.72 + 0.06 * uDark) * uFocus);
  o = vec4(c * show, show);
}`,vi=`#version 300 es
layout(location=0) in vec4 aP;   // x, y (\xB5m), radius (\xB5m), alpha
layout(location=1) in float aK;  // kind
${ra}
uniform vec3 uF0, uF1;          // local \xB5m \u2192 device px
uniform float uK;               // device px per \xB5m
uniform float uKs;              // device px per \xB5m for the particles' size (capped on a large screen, so they stay specks)
out float vA; out float vK; out float vR;
void main() {
  vec2 d = vec2(dot(uF0, vec3(aP.xy, 1.0)), dot(uF1, vec3(aP.xy, 1.0)));
  vR = max(aP.z * uKs, 1.2); vK = aK;
  vA = aP.w * revealA(aP.xy) * detailAt(aP.x);
  gl_PointSize = 2.0 * vR + 3.0;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`,gi=`#version 300 es
precision highp float;
in float vA; in float vK; in float vR;
uniform vec3 cAlb, cAlbE;
out vec4 o;
void main() {
  float r = length((gl_PointCoord * 2.0 - 1.0) * (vR + 1.5)), a;
  vec3 c;
  if (vK > 1.5) { a = (1.0 - smoothstep(0.25 * vR, vR + 1.0, r)) * 0.5; c = mix(vec3(1.0), cAlb, 0.3); }   // a soft glow where it meets the wall
  else {
    a = 1.0 - smoothstep(vR - 0.7, vR + 0.7, r);
    c = mix(cAlb, cAlbE, smoothstep(vR - 1.7, vR - 0.6, r) * 0.6);
  }
  a *= vA;
  o = vec4(c * a, a);
}`,bi=`#version 300 es
layout(location=0) in vec2 corner;
out vec2 vT;
void main() { vT = corner * 0.5 + 0.5; gl_Position = vec4(corner, 0.0, 1.0); }`,yi=`#version 300 es
precision mediump float;
uniform sampler2D uOld;
in vec2 vT;
out vec4 o;
void main() { o = texture(uOld, vT); }`;function ca(l,{warm:m=!1,onReady:y=null,host:x=null}={}){let o=null;if(!x||(o=x.gl,!o))return null;let b=x.canvas,h=null,p=()=>x.screen?x.screen():null;function g(){let v=Math.max(1,l.width),E=Math.max(1,l.height);h||(h={tex:o.createTexture(),fbo:o.createFramebuffer(),w:0,h:0}),(h.w!==v||h.h!==E)&&(o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,h.tex),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,v,E,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.bindFramebuffer(o.FRAMEBUFFER,h.fbo),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,h.tex,0),h.w=v,h.h=E),o.bindFramebuffer(o.FRAMEBUFFER,h.fbo),o.disable(o.SCISSOR_TEST),o.disable(o.STENCIL_TEST),o.disable(o.DEPTH_TEST),o.disable(o.CULL_FACE)}let q=()=>{o.disable(o.BLEND),o.bindVertexArray(null),o.bindFramebuffer(o.FRAMEBUFFER,p())},S=v=>{try{Ll(o,v)}catch(Q){if(!o.isContextLost())return console.error("sinusoid program:",Q.message),null}let E=v.p,M={},$=o.getProgramParameter(E,o.ACTIVE_UNIFORMS);for(let Q=0;Q<$;Q++){let ht=o.getActiveUniform(E,Q).name;M[ht]=o.getUniformLocation(E,ht)}return{p:E,U:M}},se=null,be=()=>(se||(se=[Vn(o,mi,xi),Vn(o,vi,gi)]),se),ue,re,ee,we,Ne,le=null,te=null,me=null;function ze(){let[v,E]=be();if(ue=S(v),re=S(E),se=null,!ue||!re)return!1;ee=o.createVertexArray(),o.bindVertexArray(ee);let M=o.createBuffer();return o.bindBuffer(o.ARRAY_BUFFER,M),o.bufferData(o.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),o.STATIC_DRAW),o.enableVertexAttribArray(0),o.vertexAttribPointer(0,2,o.FLOAT,!1,0,0),we=o.createVertexArray(),o.bindVertexArray(we),Ne=o.createBuffer(),o.bindBuffer(o.ARRAY_BUFFER,Ne),o.enableVertexAttribArray(0),o.vertexAttribPointer(0,4,o.FLOAT,!1,20,0),o.enableVertexAttribArray(1),o.vertexAttribPointer(1,1,o.FLOAT,!1,20,16),o.bindVertexArray(null),Fl(o,()=>{o.useProgram(ue.p),o.bindVertexArray(ee),o.drawArrays(o.TRIANGLE_STRIP,0,4),o.useProgram(re.p),o.bindVertexArray(we),o.bindBuffer(o.ARRAY_BUFFER,Ne),o.bufferData(o.ARRAY_BUFFER,new Float32Array(5),o.DYNAMIC_DRAW),o.drawArrays(o.POINTS,0,1),o.bindVertexArray(null)}),!0}let ne=null,Te=!1,Le=null,Lt=!1,ut=()=>{if(ne===null&&(ne=ze(),ne&&Te)){Te=!1;try{y?.()}catch(v){console.warn("sinusoid redraw:",v)}}return ne},De=()=>{ne===null&&!Le&&(Le=Cl(o,be(),ut))},$t=()=>{if(ne!==null)return ne;if(Pl&&!o.isContextLost()){if(!se)return De(),Te=!0,Le?.want?.(),!1;if(Sl(o,se))return Te=!0,Le?.want?.(),!1}return ut()};m?De():Tl(()=>{window.requestIdleCallback?requestIdleCallback(De,{timeout:8e3}):setTimeout(De,3e3)}),!m&&Al()&&Ml(new Promise(v=>setTimeout(()=>{try{ut()}finally{v()}},0)));let dt=()=>{h=null,ne=!1,se=null,Le?.(),Le=null};b.addEventListener("webglcontextlost",dt);let Gt=0,Vt=()=>{Lt||(Gt++,h=null,Xe.clear(),ne=null,Te=!0,De())};b.addEventListener("webglcontextrestored",Vt);let Xe=new Map,et=[0,0];function vn(v,E){if(typeof v=="number")return v===E;if(E==null||typeof E=="number"||v.length!==E.length)return!1;for(let M=0;M<v.length;M++)if(v[M]!==E[M])return!1;return!0}function ce(v,E){if(typeof E=="number"){Xe.set(v,E);return}let M=Xe.get(v);(typeof M=="number"||M===void 0||M.length!==E.length)&&(M=new Array(E.length),Xe.set(v,M));for(let $=0;$<E.length;$++)M[$]=E[$]}let tt=(v,E,M)=>{let $=v[E];$!=null&&(Xe.has($)&&vn(M,Xe.get($))||(ce($,M),E==="uPass"?o.uniform1i($,M):typeof M=="number"?o.uniform1f($,M):M.length===2?o.uniform2fv($,M):M.length===3?o.uniform3fv($,M):o.uniform4fv($,M)))},Ft=(v,E)=>{if(o.useProgram(ue.p),E===0){et[0]=l.width,et[1]=l.height,tt(ue.U,"size",et);for(let M in v)tt(ue.U,M,v[M])}tt(ue.U,"uPass",E),o.bindVertexArray(ee),o.drawArrays(o.TRIANGLE_STRIP,0,4)},Re=()=>{if(me!==null)return me;try{le=S(Vn(o,bi,yi))}catch{le=null}return me=!!le,le&&(o.useProgram(le.p),o.uniform1i(le.U.uOld,0)),me},gn=()=>{le=null,te=null,me=null};b.addEventListener("webglcontextlost",gn);let X=[],Pt=new Set,_e=30,pe=(v,E)=>{if(v.fails=(v.fails||0)+1,v.fails===1&&console.warn("sinusoid: what is drawn over it failed.",E),v.fails>=_e){let M=X.indexOf(v);M>=0&&X.splice(M,1),console.warn(`sinusoid: what is drawn over it failed. It failed ${_e} pictures in a row and is taken out.`)}},A=0,nt=0,ot=!1,Yt=null,St=null,J=0,bn=()=>{if(X.length){for(let v=0;v<X.length;v++){let E=X[v];try{E.prep?.(),E.fails=0}catch(M){pe(E,M)}X[v]!==E&&v--}for(let v=0;v<X.length;v++){let E=X[v];try{E.draw(),E.fails=0}catch(M){pe(E,M)}X[v]!==E&&v--}o.bindFramebuffer(o.FRAMEBUFFER,null)}},no={gl:o,canvas:l,add(v){return X.push(v),X.sort((E,M)=>(E.order||0)-(M.order||0)),()=>{let E=X.indexOf(v);E>=0&&X.splice(E,1)}},warmIn(v){if(!v)return;let E=()=>{if(!o.isContextLost()){if(v.done&&!v.done()){setTimeout(E,50);return}try{v.run()}catch(M){$n("sinusoid-gl:654",M)}}};setTimeout(E,0)},get presents(){return A}};function oo(v,E,M){if(g(),o.viewport(0,0,l.width,l.height),o.clearColor(0,0,0,0),o.clear(o.COLOR_BUFFER_BIT),o.disable(o.BLEND),Ft(v,0),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),M>0){o.useProgram(re.p),et[0]=l.width,et[1]=l.height,tt(re.U,"size",et);for(let Q in v)tt(re.U,Q,v[Q]);o.bindVertexArray(we),o.bindBuffer(o.ARRAY_BUFFER,Ne),o.bufferData(o.ARRAY_BUFFER,E.subarray(0,M*5),o.STREAM_DRAW),o.drawArrays(o.POINTS,0,M)}let $=v.uF0&&v.uF1?na(v,l.width,l.height,mn):-1;if($<0)Ft(v,1);else if($>0){o.enable(o.SCISSOR_TEST);for(let Q=0;Q<$;Q++)o.scissor(mn[Q*4],mn[Q*4+1],mn[Q*4+2],mn[Q*4+3]),Ft(v,1);o.disable(o.SCISSOR_TEST)}o.bindVertexArray(null),q(),A++}return{top:no,present(){o.isContextLost()||x.present?.()},get target(){return h&&h.w>1?h:null},free(){te&&!o.isContextLost()&&o.deleteTexture(te),te=null,h&&!o.isContextLost()&&(o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,h.tex),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,1,1,0,o.RGBA,o.UNSIGNED_BYTE,null),h.w=1,h.h=1)},get gl(){return o},get drawSeq(){return nt},onPicture(v){return Pt.add(v),()=>Pt.delete(v)},get ok(){return $t()},keep(){return!ne||o.isContextLost()||!l.width||!l.height||!Re()?!1:(pl(o),te||=o.createTexture(),g(),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,te),o.copyTexImage2D(o.TEXTURE_2D,0,o.RGBA,0,0,l.width,l.height,0),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),q(),ml(o))},mix(v){if(!te||!le||o.isContextLost()||!(v>0)){o.isContextLost()||x.present?.();return}g(),o.viewport(0,0,l.width,l.height),o.useProgram(le.p),o.bindVertexArray(ee),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,te),o.enable(o.BLEND),o.blendColor(0,0,0,Math.min(1,v)),o.blendFunc(o.CONSTANT_ALPHA,o.ONE_MINUS_CONSTANT_ALPHA),o.drawArrays(o.TRIANGLE_STRIP,0,4),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.bindVertexArray(null),q(),x.present?.()},dispose(){Lt=!0,ne=!1,se=null,Le?.(),Le=null,X.length=0,Pt.clear(),b.removeEventListener("webglcontextlost",dt),b.removeEventListener("webglcontextrestored",Vt),b.removeEventListener("webglcontextlost",gn)},drop(){te&&!o.isContextLost()&&o.deleteTexture(te),te=null},get lost(){return ne===!1||o.isContextLost()},get epoch(){return Gt},draw(v,E,M){if($t()){ot=!0,Yt=v,St=E,J=M,oo(v,E,M),nt++;for(let $ of Pt)$();te||x.present?.()}}}}var xe=[0,0,0,0],xn={s:0,c:0,right:!1},to=!1,Ke={ok:!1,t:0,xp:0,xc:0,xq:0},He={ok:!1,t:0,xp:0,xc:0,xq:null},Qn={xp:0,xc:0,xq:null},fa=[0,-.5,.5,-1,1];function Zn(l,m,y,x,o){let b=x+(o?40:-40),h=Math.min(m-y,Math.max(l+y,b)),p=Math.abs(h-b)+(o?0:6);(!to||p<xn.s)&&(to=!0,xn.s=p,xn.c=h,xn.right=h>=x)}function wi(l,m,y,x,o){for(let p=1;p<y;p++){let g=xe[2*p],q=xe[2*p+1],S=p-1;for(;S>=0&&xe[2*S]-g>0;)xe[2*S+2]=xe[2*S],xe[2*S+3]=xe[2*S+1],S--;xe[2*S+2]=g,xe[2*S+3]=q}to=!1;let b=2*x,h=l;for(let p=0;p<y;p++){let g=Math.min(xe[2*p],m);g-h>=b&&(Zn(h,g,x,o,!0),Zn(h,g,x,o,!1)),h=Math.max(h,xe[2*p+1])}return m-h>=b&&(Zn(h,m,x,o,!0),Zn(h,m,x,o,!1)),to?xn:null}function eo(l,m,y,x,o,b,h,p,g,q,S){let se=h[0]-l,be=h[1]+l,ue=(h[0]+h[1])/2;Ke.ok=!1,He.ok=!1;for(let re=0;re<y.length;re++){let ee=y[re];if(!(ee.x<o||ee.x>b||m&&!(ee.th<.3&&Jn(ee.th,.15)>.3)||Yo(ee.x,x)))for(let we=0;we<fa.length;we++){let Ne=fa[we],le=ee.x+Ne*Math.max(0,p-.5*q),te=le-p,me=le+p;if(te<o||me>b||me>se&&te<be)continue;let ze=3*ee.th+.02*Math.abs(ee.x-(ee.x<ue?se:be))+.05*Math.abs(Ne);xe[0]=te-q,xe[1]=me+q,xe[2]=h[0]-q,xe[3]=h[1]+q;let ne=wi(o,b,2,g,S),Te=ze+(ne&&!ne.right?.1:0);ne&&(!Ke.ok||Te<Ke.t)&&(Ke.ok=!0,Ke.t=Te,Ke.xp=ee.x,Ke.xc=le,Ke.xq=ne.c),(!He.ok||ze<He.t)&&(He.ok=!0,He.t=ze,He.xp=ee.x,He.xc=le,He.xq=null)}}return Ke.ok?Ke:He.ok?He:null}function ua({pores:l,nsd:m,lo:y,hi:x,hs:o,fh:b,dh:h,fp:p,xs:g,far:q=2*p}){let S=eo(Math.max(q,2*p),!0,l,m,y,x,o,b,h,p,g)||eo(2*p,!0,l,m,y,x,o,b,h,p,g)||eo(Math.max(q,2*p),!1,l,m,y,x,o,b,h,p,g)||eo(2*p,!1,l,m,y,x,o,b,h,p,g);return S?(Qn.xp=S.xp,Qn.xc=S.xc,Qn.xq=S.xq,Qn):null}function da(l,m=!1){if(m)return 1;let y=Math.min(1,Math.max(0,(l-700)/3400));return y*y*(3-2*y)}var ha={j:0,x0:0,x1:0,nu:0,nv:0,nr:0,bi:!1},Mt=xl("sinusoid-view"),Tt=(l,m,y)=>{let x=z((y-l)/(m-l),0,1);return x*x*(3-2*x)};function pa(l){let m=l>>>0;return()=>(m=m*1664525+1013904223>>>0,m/4294967296)}function br({host:l,before:m=null,share:y=null}){let x=Rl,o=matchMedia("(max-width: 720px)"),b=qe("canvas",{class:"sv-canvas",role:"img","aria-label":"A sinusoid, cut along its length"}),h=qe("div",{class:"lz-labels"}),p={},g=Yl(h,{deferred:!0}),q=!1,S=null,se=[0,0],be=[],ue=e=>e?g.measure(e.key,e.lines||be):se,re=null,ee={fen:"pores: plasma passes to the space of Disse",disse:"perisinusoidal space between the endothelium and the hepatocytes",lymph:"drains filtered fluid and protein",hep:"hepatocytes: uptake and metabolism of plasma solutes",hsc:"stores vitamin A; deposits collagen when activated",kup:"resident macrophage of the sinusoid",sin:"blood from the portal tract and the hepatic artery mixes here",in:"blood arrives from the portal venule",out:"blood leaves to the central vein",bc:"sealed channel between hepatocytes: bile drains to the portal tract, against the blood"},we={bc:"canaliculus",fen:"fenestrae",hsc:"stellate",kup:"kupffer",hep:"hepatocyte",sin:"lumen",in:"in",out:"out"},Ne=[],le=new Map,te=0,me=null,ze=()=>{te||(te=Xt(ne))};function ne(){te=0;for(let t of Ne.splice(0)){let n=document.createElement("div");n.setAttribute("class",t.cls),n.setAttribute("data-target",`sinusoid:${we[t.key]||t.key}`),t.el=n,h.append(n)}for(let[t,[n,s]]of le)t.el?.replaceChildren(qe("span",{},n),...s.map(i=>{let[a,c]=i.split("~");return qe("span",{class:"v"},qe("b",{},a),c?` ${c}`:"")}));let e=le.size>0;if(le.clear(),me!=null){let t=p.fen?.el?.querySelector(".v b");t&&t.textContent!==me&&(t.textContent=me),me=null}e&&$t()}let Te=(e,t)=>[...e.split(`
`).map(n=>[[n,"name"]]),...t.map(n=>{let[s,i]=n.split("~");return[[s,"fig"],[i?` ${i}`:"","unit"]]})];function Le(e,t,n,s){let i=p[e];i||(i=p[e]={key:e,cls:t||`sv-region sv-region-${e}`,el:null,n:0,name:null,value:null,text:null,off:null},Ne.push(i),ze());let a=re===e&&ee[e]||"";if(i.name!==n||i.value!==s||(i.ex??"")!==a){let c=i.text&&i.name===n&&i.n===1+(s?s.split(" \xB7 ").length:0);i.name=n,i.value=s,i.text=n+"|"+s,i.ex=a;let d=s?s.split(" \xB7 "):[];if(i.lines=Te(n,e==="fen"&&c?[Cn()]:d),a&&(i.lines=[...i.lines,[[a,"unit"]]]),c&&e==="fen")return i;le.set(i,[n,d]),i.n=1+d.length,ze()}return i}let Lt=0,ut=!0,De=()=>{ut=!0,Lt||(Lt=Xt($t))};function $t(){Lt=0;let e=!1;for(let t of Object.values(p)){let n=t.el;if(!n?.isConnected||!n.firstElementChild)continue;let s=n.querySelector(".v"),i=s?.querySelector("b"),a=Gl(ye(n),{name:ye(n.firstElementChild),fig:i&&ye(i),unit:s&&ye(s)}),c=JSON.stringify(a);c!==t.lookSig&&(t.lookSig=c,g.look(t.key,a),e=!0)}if(Re.isConnected){let t=ye(Re),n=Re.querySelector("i"),s=n&&ye(n),i=Re.querySelector("span"),a=i&&ye(i),c=F=>parseFloat(F)||0,d={size:c(t.fontSize)||12,weight:parseFloat(t.fontWeight)||500,ink:t.color,lh:c(t.lineHeight)||1.3*(c(t.fontSize)||12),px:c(t.paddingLeft),py:c(t.paddingTop),bg:t.backgroundColor,gap:c(a?.columnGap)||5,dot:s?{d:c(s.width)||8,fill:s.backgroundColor,ring:Vl(s.boxShadow)}:null,sh:$l(t.boxShadow)},u=JSON.stringify(d);u!==dt.sig&&(Object.assign(dt,d,{sig:u}),e=!0,g.look("legend",{lh:d.lh/d.size,gap:0,halo:0,haloC:"",runs:{name:{size:d.size,weight:d.weight,ls:0,fill:Ko(d.ink),op:1,upper:!1,mr:0}}}))}e&&(q=!0,S?.())}let dt={sig:""},Gt=null,Vt=0,Xe="";function et(e){return(e.weight!==Gt||e.size!==Vt)&&(Gt=e.weight,Vt=e.size,Xe=`${e.weight} ${e.size}px Inter`),Xe}let vn={along:!1,side:0,slide:!1};function ce(e,t,n,s,i,a=vn){let c=a.along,d=a.side,u=Le(e,null,t,n),F=u.at||(u.at=[0,0]);F[0]=s,F[1]=i;let P=ue(u),f=P[0],w=P[1],_=c&&!N.vert?N.ang:0,B=c?w:Math.abs(f*Math.sin(N.ang))+Math.abs(w*Math.cos(N.ang)),k=i+d*(B/2)/r.k,I=on(s,k),T=I[0],D=I[1],O=T;if(c||(T=z(T,f/2+4,N.W-f/2-4)),!N.vert){for(let R of _n)R&&D+w/2>R.y0-4&&D-w/2<R.y1+4&&(T=R.u?Math.min(T,R.x0-14-f/2):Math.max(T,R.x1+14+f/2));T=z(T,Math.min(r.fe.l+f/2+4,N.W/2),Math.max(r.fe.r-f/2-4,N.W/2))}{let R=Math.abs(Math.cos(_)),Y=Math.abs(Math.sin(_)),V=(f*R+w*Y)/2,oe=(f*Y+w*R)/2,ae=u.box||(u.box={l:0,r:0,t:0,b:0});ae.l=T-V,ae.r=T+V,ae.t=D-oe,ae.b=D+oe}u.cx=T,u.cy=D,u.end=!1;let L=tt[Ft=Ft+1&15];return L.cx=T,L.cy=D,L.w=f,L.hh=w,L.x=s+(N.vert?0:(T-O)/r.k),L.half=(c?f:Math.abs(f*Math.cos(N.ang))+Math.abs(w*Math.sin(N.ang)))/2/r.k,L}let tt=[];for(let e=0;e<16;e++)tt.push({cx:0,cy:0,w:0,hh:0,x:0,half:0});let Ft=0,Re=qe("div",{class:"sv-legend","aria-hidden":"true"},qe("span",{},qe("i",{class:"alb"}),"Protein"));{let e=document.querySelector(".app")||document.getElementById("app");e&&typeof MutationObserver=="function"&&new MutationObserver(()=>De()).observe(e,{attributes:!0,attributeFilter:["data-lit","class"]})}let gn=e=>{let t=Ut.get(e);return t==null&&(Ut.set(e,null),Bt=!0,t=""),t},X={},Pt={x0:0,y0:0,x1:0,y1:0};function _e(e,t,n,s){let i=X[e]||={key:e},a=on(n,s),c=a[0],d=a[1],u=Math.abs(c-t.cx)<t.w/2-2&&Math.abs(d-t.cy)>t.hh/2+6,F=u?c:t.cx+Math.sign(c-t.cx)*(t.w/2+3),P=u?t.cy+Math.sign(d-t.cy)*(t.hh/2+3):z(d,t.cy-t.hh/2+4,t.cy+t.hh/2-4),f=Pt;f.x0=t.cx-t.w/2,f.x1=t.cx+t.w/2,f.y0=t.cy-t.hh/2,f.y1=t.cy+t.hh/2;let w=Xl(!1,jl(f,c,d),i.show)&&(u||Math.sign(c-t.cx)===Math.sign(c-F));i.x1=F,i.y1=P,i.x2=c,i.y2=d,i.show=w?1:0,i.follow=!1,i.sg=Math.sign(c-t.cx),i.w=t.w}let pe=qe("div",{class:"sv","aria-hidden":"true"},b,h,Re);g.onPresented=()=>pe.classList.add("cap-gl-on"),g.onLost=()=>pe.classList.remove("cap-gl-on"),l.insertBefore(pe,m);let A=null,nt=null,ot=!1;function Yt(){if(A||St)return;let e=y?.top?.()||null;if(y&&!e)return;St=!0,A=ca(b,{warm:!0,onReady:()=>{ct="",Be()},host:e}),A&&e&&(J=e,bn=e.add({order:y.order,solo:!0,on:()=>de>0&&!!A&&!A.lost,opaque:oo,draw:$})),A&&e?g.attach({top:e,order:y.capOrder??y.order+1,near:pe,active:()=>J===e&&!!A&&!A.lost,scale:()=>Dt?e.canvas.width/Dt[0]:0}):g.attach(null),Jl(!!A);let t=A?A.gl:null;ot=!!(t&&ql(t)),nt=ot?Wl(!0,t):null}let St=!1,J=null,bn=null;function no(){bn?.(),bn=null,J=null,g.detach();try{A?.dispose?.()}catch(e){$n("sinusoid-view:rehost",e)}A=null,St=!1,nt=null,ot=!1,je=null,ct="",qn="",v=0,E=0,M=!1,(de>0||G)&&(Yt(),Be())}function oo(){if(!J||!A||A.lost||!st||!(de>=1)||Z||je||pt||Q!==1||ht||yn)return!1;let e=A.target;return!!e&&e.w>0&&e.h>0&&e.w===v&&e.h===E&&M}let v=0,E=0,M=!1;function $(){if(!J||!(de>0)||!A||A.lost)return;let e=A.target;if(e)if(Q!==1||ht||yn){let t=Jo||(J.canvas.width||1)/(Dt&&Dt[0]||J.canvas.clientWidth||J.canvas.width||1);J.lay(e.tex,Q,0,0,Q,ht*t,yn*t,Math.min(1,de))}else J.lay(e.tex,1,0,0,1,0,0,Math.min(1,de))}let Q=1,ht=0,yn=0,Jo=0,so=1;Kl("sinusoid",()=>st?A&&!A.lost?{on:ot?"fallback":"gpu",via:ot?"WebGL2 on the CPU":"WebGL2",why:ot?"software renderer":""}:{on:"fallback",via:"nothing drawn",why:A?"context lost (drawn again when it is given back)":"no WebGL2"}:null),pe.addEventListener("wheel",e=>e.preventDefault(),{passive:!1}),h.addEventListener("animationend",e=>{if(e.animationName==="sv-fade-in")for(let t of e.target.getAnimations())t.animationName==="sv-fade-in"&&t.cancel()});let Oe=1,G=null,de=0,st=!1,Ee=0,Jt=0,Z=null,pt=!1,ma=.72,wn=!1,Ct=Gn(),Nt=kt("cap"),mt=null,Qo=(e,t)=>zl(Math.min(gl()?1:2,devicePixelRatio||1),Ct,e,t,Nt);bl(()=>{let e=Gn();if(!(de>0)){Ct=e,Nt=kt("cap"),mt=null;return}mt=e===Ct&&kt("cap")===Nt?null:e,mt!=null&&Be()});let je=null;function xa(){let e=mt;mt=null,!(e===Ct&&kt("cap")===Nt)&&(ct="",Wn(0,!1),A.keep?.()?je={t0:performance.now()}:lo(),Ct=e,Nt=kt("cap"))}function va(){let e=(performance.now()-je.t0)/_l;if(e>=1||Z){lo();return}A.mix(Ol(e))}function lo(){je&&(je=null,A.drop?.())}let C={},N=null,ao=0,Zo=-1,es=-1,ts=!1,Qt=!1,Zt=!1,ga=document.getElementById("app")?.style,ve=e=>parseFloat(ga?.getPropertyValue(e))||0,ns=12;function En(){let e=document.getElementById("app");e&&(ns=parseFloat(ye(e).getPropertyValue("--gap"))||12)}let Dt=null,io=()=>{let e=pn(l);Dt=[Math.max(1,Math.round(e.width)),Math.max(1,Math.round(e.height))]};io(),En();let ro=()=>Dt;typeof ResizeObserver=="function"&&new ResizeObserver(()=>{io(),En(),de>0&&!Ee&&G&&(Ee=Mt(Et))}).observe(l),addEventListener("resize",()=>{io(),En(),De()});let kn=!0,co=!1,os=()=>{kn=!0,co=!0,Mo(),De()};if(Ho.addEventListener?.("change",os),typeof MutationObserver=="function"){let e=new MutationObserver(t=>{t.some(n=>n.attributeName!=="style")&&os()});for(let t of[document.documentElement,document.body,document.getElementById("app"),l])t&&e.observe(t,{attributes:!0})}function ba(e,t){let n=ve("--top-safe")+ve("--cmp-h")+ve("--pz-t")+8+(ve("--pz-t")?0:40),s=document.getElementById("app"),a=!s||s.classList.contains("presenting")?0:(ve("--bot-occ")||ns+8+42)+8,c=t-ve("--pz-b")-Math.max(34,a),d=12+ve("--pz-l"),u=e-12-ve("--pz-r");return en.l=Math.round(d),en.t=Math.round(n),en.r=Math.round(Math.max(d+80,u)),en.b=Math.round(Math.max(n+80,c)),en}let en={l:0,t:0,r:0,b:0},xt=[0,0,0],tn=[0,0];function ss(e,t){let n=!!document.getElementById("app")?.classList.contains("presenting");if(e!==Zo||t!==es||n!==ts){Zo=e,es=t,ts=n,ao++;let u=e<t*.95,F=u,P=u?Math.PI/2:0,f=Math.hypot(e,t)/6+30,w=[he.poreUp,he.poreDn].map(B=>{let k=[];for(let I=Math.floor(-f/jt)-1;I*jt<f+jt;I++){let T=la(I,B);T&&k.push(T)}return k}),_=ft(0,he.plateUp);for(let B=-3;B<=2;B++){let k=ft(B,he.plateUp);Math.abs(k+10)<Math.abs(_+10)&&(_=k)}N={W:e,H:t,ang:P,vert:u,tall:F,x0:-f,x1:f,xs:_,xk:u?12:22,pores:w}}let s=ba(e,t),i=s.r-s.l,a=s.b-s.t,c=N.vert?i:a,d=Ze(40,54,Tt(380,720,c));return r.f=s,r.tk=z(c/d,3,14),xt[0]=ve("--top-safe")+ve("--cmp-h")+ve("--pz-t"),xt[1]=ve("--top-safe")+ve("--pz-t")+2,xt[2]=t-ve("--pz-b")-2,r.insT=xt,tn[0]=(s.l+s.r)/2,tn[1]=(s.t+s.b)/2,r.tC=tn,(!r.k||!r.fe)&&(r.k=r.tk,r.C=[tn[0],tn[1]],r.fe={l:s.l,t:s.t,r:s.r,b:s.b},r.ins=[xt[0],xt[1],xt[2]],r.vel=null),N}let fo=()=>(parseFloat(document.documentElement.style.getPropertyValue("--label-k"))||1)*.9,ls=()=>{let e=String(fo());pe.style.getPropertyValue("--label-k")!==e&&pe.style.setProperty("--label-k",e)};ls(),addEventListener("pps:labelscale",()=>{ls(),De()});let r={k:0,C:[0,0],tk:0,tC:[0,0],f:null,fe:null,insT:null,ins:null,vel:null,vis:[0,0],fr:[0,0]},Rt={C:[0,0],k:1,ang:0,ca:1,sa:0},ke=new Float64Array(4);function _t(e,t,n,s,i,a,c){return((e-n)*i+(t-s)*a)/c}let nn=10,$e=new Float64Array(nn),Ge=new Float64Array(nn),as=new Float64Array(nn),ya=()=>{$e[0]=r.tk,$e[1]=r.tC[0],$e[2]=r.tC[1],$e[3]=r.f.l,$e[4]=r.f.t,$e[5]=r.f.r,$e[6]=r.f.b;for(let e=0;e<3;e++)$e[7+e]=r.insT[e];return $e},wa=()=>{Ge[0]=r.k,Ge[1]=r.C[0],Ge[2]=r.C[1],Ge[3]=r.fe.l,Ge[4]=r.fe.t,Ge[5]=r.fe.r,Ge[6]=r.fe.b;for(let e=0;e<3;e++)Ge[7+e]=r.ins[e];return Ge},uo=e=>{r.k=e[0],r.C[0]=e[1],r.C[1]=e[2],r.fe.l=e[3],r.fe.t=e[4],r.fe.r=e[5],r.fe.b=e[6];for(let t=0;t<r.ins.length;t++)r.ins[t]=e[7+t]},is=(e,t)=>{let n=0;for(let s=0;s<nn;s++)n+=Math.abs(e[s]-t[s])*(s===0?40:1);return n},ho=e=>{for(let t=0;t<nn;t++)if(Math.abs(e[t])*(t===0?40:1)>=.5)return!1;return!0},po=10;function Ea(e){let t=ya(),n=wa();r.vel||(r.vel=as,as.fill(0));let s=r.vel,i=is(n,t),a=ho(s),c=!1;if(Z||i<.05&&a)uo(t),s.fill(0);else{c=!0;let L=Math.min(Math.max(e,0),40/1e3),R=Math.exp(-po*L);for(let V=0;V<n.length;V++){let oe=n[V]-t[V],ae=s[V]+po*oe;n[V]=t[V]+(oe+ae*L)*R,s[V]=(s[V]-po*ae*L)*R}is(n,t)<.05&&ho(s)?(uo(t),s.fill(0)):uo(n)}let d=Rt.C,u=r.k,F=N.ang;if(d[0]=r.C[0],d[1]=r.C[1],Z){let{g:L,p:R,c:Y,rot:V,Z:oe}=Z,ae=oe**L,Se=$o(oe,L);d[0]=R[0]+Se*(Y[0]-R[0]),d[1]=R[1]+Se*(Y[1]-R[1]),u=Z.k*ae/oe,F=Z.ang+V*(L-1)}Rt.k=u,Rt.ang=F,Rt.ca=Math.cos(F),Rt.sa=Math.sin(F);let P=N,f=Math.cos(P.ang),w=Math.sin(P.ang),_=r.C[0],B=r.C[1],k=r.k;ke[0]=_t(0,0,_,B,f,w,k),ke[1]=_t(P.W,0,_,B,f,w,k),ke[2]=_t(0,P.H,_,B,f,w,k),ke[3]=_t(P.W,P.H,_,B,f,w,k);let I=Math.min(ke[0],ke[1],ke[2],ke[3]),T=Math.max(ke[0],ke[1],ke[2],ke[3]);r.vis[0]=Math.max(P.x0,I-8),r.vis[1]=Math.min(P.x1,T+8);let D=_t(r.fe.l,r.fe.t,_,B,f,w,k),O=_t(r.fe.r,r.fe.b,_,B,f,w,k);return r.fr[0]=Math.min(D,O),r.fr[1]=Math.max(D,O),c}let mo=[0,0],on=(e,t)=>{let n=Math.cos(N.ang),s=Math.sin(N.ang);return mo[0]=r.C[0]+r.k*(e*n-t*s),mo[1]=r.C[1]+r.k*(e*s+t*n),mo},Ae=e=>ie.lum*C.lum*(1-C.pinch*Math.exp(-(((e-N.xs)/11)**2)))+.15*Math.sin(e*.11+1.3),sn=e=>ie.disse*(1+.25*C.col)+.2*Math.sin(e*.07),Ot=e=>Ae(e)+ie.endo,Ve=e=>Ot(e)+sn(e);function rs(e){if(!G)return!1;let t=Zl(G),n=!1,s=e>0?1-Math.exp(-e/.32):1;for(let i in t){if(C[i]==null){C[i]=t[i];continue}let a=t[i]-C[i];Math.abs(a)>1e-4?(C[i]+=a*s,n=!0):C[i]=t[i]}return n}let An=new Map;function H(e){let t=An.get(e);return t||(t=Dl(e||"black").slice(0,3),An.size>256&&An.clear(),An.set(e,t),t)}function lt(e,t,n,s){for(let i=0;i<3;i++)e[i]=Ze(t[i],n[i],s);return e}function It(e,t){return e[0]=t[0],e[1]=t[1],e[2]=t[2],e}let Ut=new Map,Bt=!1;function ka(){let e=ye(l);for(let t of Ut.keys())Ut.set(t,e.getPropertyValue(t).trim());kn=!1,xo++}let xo=0,Ie=()=>[0,0,0],Aa={cBg:Ie(),cShade:Ie(),cLumen:Ie(),cLymph:Ie(),cCell:Ie(),cUnder:Ie(),cNuc:null,cCol:null,cBm:null,aBm:0,cBile:null,cEndo:null,cEndoS:null,cEndoE:null,cEndoN:null,cHscQ:null,cHscA:null,cHscN:null,cKup:null,cKupN:null,cKupE:null,cRbc:null,cEndF:null,cEndE:null,cAlb:null,cAlbE:null,uShim:0,uStreak:0,uDark:0,uI0:Ie(),uI1:Ie(),uF0:Ie(),uF1:Ie(),uEnd:[0,0,0,0],uWedge:[0,0,0,0],cWedge:null,uRev:[0,0,0,0],uDet:[0,0],uEndA:null},Ye={lo:null,mid:null,hi:null,bg:null},cs=null,vo=-1;function W(e,t){let n=Ut.get(e);return n==null&&(Ut.set(e,null),Bt=!0,n=""),n||t}function Ma(e){let t=G,n=Aa;if(cs!==e||vo!==xo){cs=e,vo=xo;let i=H(W("--stage-bg",W("--bg")));Ye.bg=i,Ye.lo=H(W("--sv-gl-lymph-lo")),Ye.mid=H(W("--sv-gl-lymph-mid")),Ye.hi=H(W("--sv-gl-lymph-hi"));let a=H(W("--og-liver-2")),c=It(Ta,H(W("--og-liver-1")));e&&lt(c,a,c,.5);let d=lt(La,i,a,e?.55:.5);It(n.cBg,i),e?It(n.cShade,i):lt(n.cShade,i,H(W("--sv-gl-shade")),.9),lt(n.cCell,d,c,e?.85:.94),e?It(n.cUnder,d):lt(n.cUnder,i,a,.8),n.cNuc=H(W("--sv-gl-nucleus")),n.cCol=H(W("--collagen")),n.cBm=H(W("--sv-gl-basement")),n.aBm=e?.6:.8,n.cBile=H(W("--sv-gl-bile")),n.cEndo=H(W("--sv-gl-endothelium")),n.cEndoS=H(W("--sv-gl-endo-sheet")),n.cEndoE=H(W("--sv-gl-endo-edge")),n.cEndoN=H(W("--sv-gl-endo-nucleus")),n.cHscQ=H(W("--sv-gl-hsc-quiet")),n.cHscA=H(W("--sv-gl-hsc-active")),n.cHscN=H(W("--sv-gl-hsc-nucleus")),n.cKup=H(W("--sv-gl-kupffer")),n.cKupN=H(W("--sv-gl-kupffer-nucleus")),n.cKupE=H(W("--sv-gl-kupffer-edge")),n.cRbc=H(W("--sv-gl-rbc")),n.cEndF=H(W("--text")),n.cEndE=H(W("--label-halo")),n.cWedge=H(W("--tr-wedge")),n.cAlb=H(W("--sv-gl-albumin")),n.cAlbE=H(W("--sv-gl-albumin-edge")),n.uShim=e?.3:.5,n.uStreak=e?.3:.85,n.uDark=e?1:0,Bt&&(vo=-1)}It(n.cLumen,H(t.hide?W("--sv-lumen-hidden"):Ul(t.P2)));let s=C.prot??1;return s<.45?lt(Mn,Ye.lo,Ye.mid,s/.45):lt(Mn,Ye.mid,Ye.hi,(s-.45)/.55),e?lt(n.cLymph,Ye.bg,Mn,.34):It(n.cLymph,Mn),n}let Mn=[0,0,0],Ta=[0,0,0],La=[0,0,0],Tn=0,fs=0,Ln=0,ln=0,Fn=[],Je=[],vt=pa(17);{let e=pa(23);for(let t=0;t<150;t++)Fn.push({u:e(),y:e()*1.9-.95,ph:e()*Math.PI*2})}let Fa=e=>e.w*Jn(e.th,C.por),Pa=[];function Sa(e,t){let n=N.pores[e<0?0:1],s=0,i=Pa;for(let c=0;c<n.length;c++){let d=n[c],u=d.x>r.vis[0]&&d.x<r.vis[1]?Fa(d):0,F=t?u>.22?u*u:0:u>.02?u+.06:0;i[c]=F,s+=F}if(s<=0)return null;let a=vt()*s;for(let c=0;c<n.length;c++)if(a-=i[c],a<=0&&i[c]>0)return n[c];return null}function us(e){let t=r.vis[1]-r.vis[0],n=C.v*24,s=-(1.5+4.5*Math.min(C.filt,4));Tn+=n*e,fs+=s*e;let i=.07*t*Math.sqrt(C.filt),a=.5*z((G.lyProt-.3)/.62,0,1)**2;for(Ln+=i*e;Ln>=1;){if(Ln-=1,Je.length>900||vt()>=a)continue;let d=vt()<.5?-1:1,u=Sa(d,!0);if(!u){ln+=1;continue}hs("a",d,u.x,.15+.7*vt(),vt()*Math.PI*2)}for(ln+=.1*t*(1-C.por)*e;ln>=1;)ln-=1,!(Je.length>900)&&hs("b",vt()<.5?-1:1,Ze(r.vis[0]+4,r.vis[1]-4,vt()),0,0);let c=0;for(let d=0;d<Je.length;d++){let u=Je[d];u.t+=e;let F;u.kind==="b"?(u.x+=n*.6*e,F=u.t>Pn):(u.t<.5?u.x+=n*.25*e:u.x+=s*(.85+.3*Math.sin(u.ph))*e,F=u.x<r.vis[0]-4||u.x>r.vis[1]+4),F?ds.push(u):Je[c++]=u}Je.length=c}let ds=[];function hs(e,t,n,s,i){let a=ds.pop()||{kind:"a",side:1,x:0,t:0,y:0,ph:0};a.kind=e,a.side=t,a.x=n,a.t=0,a.y=s,a.ph=i,Je.push(a)}let qt=new Float32Array(1400*5),Pn=1.6,Wt=-1,ps=0,an=0;function Sn(e,t,n,s,i){if(an>=1400||s<=.01)return;let a=an*5;qt[a]=e,qt[a+1]=t,qt[a+2]=n,qt[a+3]=s,qt[a+4]=i,an++}function Ca(){an=0;let[e,t]=r.vis,n=t-e+8,s=Fn.length*z(n/300,.15,1);Wt=Wt<0?s:Wt+(s-Wt)*Math.min(1,ps/.8);let i=Math.min(Fn.length,Math.ceil(Wt));for(let a=0;a<i;a++){let c=Fn[a],d=1.5*(1-c.y*c.y)+.08,u=e-4+((c.u*n+Tn*d)%n+n)%n,F=z(c.y+.05*Math.sin(Tn*.05+c.ph),-.96,.96)*(Ae(u)-.5);Sn(u,F,.36,z(Wt-a,0,1),0)}for(let a of Je){if(a.kind==="b"){let P=Math.sin(Math.PI*z(a.t/Pn,0,1)),f=a.side*Ze(Ae(a.x)-2.6,Ae(a.x)-.45,P),w=Tt(0,.45,a.t)*Tt(Pn,Pn-.45,a.t);P>.8&&Sn(a.x,f,1.1,(P-.8)*5*w,2),Sn(a.x,f,.38,w,0);continue}let c=z(a.t/.5,0,1),d=c*c*(3-2*c),u=a.side*Ze(Ae(a.x)-1.6,Ze(Ot(a.x),Ve(a.x),a.y),d)+a.side*.15*Math.sin(a.t*2+a.ph),F=Tt(-.15,.45,a.t)*z((a.x-e)/6,0,1);Sn(a.x,u,.38,F,0)}return an}let ms=-1,xs="",vs="",gs=()=>{let e=Math.round(C.por*100);return e!==ms&&(ms=e,xs=`${e}%`,vs=`${e}%~open`),xs},Cn=()=>(gs(),vs);function Na(){let e=p.fen;if(!e)return;let t=gs();t!==bs&&(bs=t,me=t,ze(),e.lines=Te(e.text.split("|")[0],[Cn()]),e.cx!=null&&g.hasLook("fen")&&(g.measure("fen",e.lines),g.paint()))}let bs="",go=e=>ia(N.pores[0],e,r.fr[0]+3,r.fr[1]-3,he.nucUp),ys=new Float64Array(8).fill(NaN),ws=new Float64Array(8).fill(NaN),Nn=[];function Es(e,t,n,s){return G.hide?"?":((ys[e]!==t||ws[e]!==n||Nn[e*2+1]!==s)&&(ys[e]=t,ws[e]=n,Nn[e*2+1]=s,Nn[e*2]=`${Yn(t,n)}~${s}`),Nn[e*2])}let ks=new Float64Array(4).fill(NaN),As=new Float64Array(4).fill(NaN),Ms=[];function Ts(e,t){let n=G;return n.hide?"?":((ks[e]!==n.lymph||As[e]!==n.lyProt)&&(ks[e]=n.lymph,As[e]=n.lyProt,Ms[e]=`${Xo(n.lymph)}~${Il}${t?" ":"\xA0"}\xB7 Protein ${Math.round(n.lyProt*100)}%`),Ms[e])}let Ls=new Float64Array(2).fill(NaN),Fs=[];function Da(e,t){return G.hide?"?":(Ls[e]!==t&&(Ls[e]=t,Fs[e]=Yn(t,1)),Fs[e])}let Ra={along:!0,side:0,slide:!1},_a={along:!1,side:-1,slide:!0},Oa={along:!0,side:0,slide:!0},Ia={along:!1,side:1,slide:!1},Ua={along:!0,side:-1,slide:!1},Ba=[{along:!1,side:-1,slide:!1},{along:!0,side:-1,slide:!1}],gt=e=>Ze(r.fr[0]+8,r.fr[1]-8,e),Ps=(e,t,n)=>Math.abs(e-t)<n?t+(e<t?-n:n):e,Dn=(e,t)=>ce("fen","Fenestrae",Cn(),e+t,-(Ve(e)+1),_a),Rn=e=>ce("disse","Space of Disse","",e,(N.vert?1:-1)*(Ot(e)+sn(e)*.5),Oa),Ss=e=>ce("lymph","Lymph",Ts(0,!1),e,Ve(e)+1.2,Ia),Cs=e=>ce("hep","Hepatocyte","",e,Ve(e)+ie.hep*(ha.nv<.5?.78:.22),vn),Me={pores:null,nsd:0,lo:0,hi:0,hs:[0,0],fh:0,dh:0,fp:0,xs:0,far:0},rn=0;function qa(){let e=N,t=G,n=e.vert;if(rn=0,e.tall){Ka();return}for(let L in X)L!=="lymph"&&L!=="fen"&&(X[L].show=0);let s=Ps(gt(.5),e.xk,30);ce("sin","Sinusoid",Es(0,t.P2,1,""),s,0,Ra),za();let i=ce("hsc",C.act>.5?"Activated stellate cell":"Stellate cell","",e.xs,-(Ve(e.xs)+1),Ba[n?1:0]),a=16/r.k,c=r.tk,d=i.w/2/c,u=i.x,F=i.half;Me.pores=e.pores[0],Me.nsd=he.nucUp,Me.lo=(r.f.l-r.tC[0]+6)/c,Me.hi=(r.f.r-r.tC[0]-6)/c,Me.hs[0]=e.xs-d,Me.hs[1]=e.xs+d,Me.fh=Dn(0,0).w/2/c,Me.dh=Rn(0).w/2/c,Me.fp=16/c,Me.xs=e.xs,Me.far=120/c;let P=ua(Me),f,w,_=P?P.xq:null;if(P?(f=P.xp,w=Dn(f,P.xc-f)):(f=go(gt(.6)),w=Dn(f,0),Math.abs(w.x-u)-w.half-F<a*2&&(f=go(u+F+w.half+a*2),w=Dn(f,0))),_e("fen",w,f,-(Ae(f)+ie.endo*.5)),_!=null)Rn(_);else{_=n?gt(.24):Ps(gt(.86),e.xs,40);let L=Rn(_);!n&&_-L.half<w.x+w.half+a&&_+L.half>f-a&&(_=w.x+w.half+L.half+a,_+L.half>r.fr[1]&&(_=f-a-L.half),Rn(_))}let B=gt(n?.55:.2),k=Ss(B),I=gt(n?.88:.6),T=aa(I,he.plateDn,ha),D=16/r.k,O=Cs((T.x0+T.x1)/2);if(Math.abs(O.x-k.x)-O.half-k.half<D){let L=O.x<k.x?-1:1;O=Cs(z(k.x+L*(k.half+O.half+D),T.x0+O.half,T.x1-O.half)),Math.abs(O.x-k.x)-O.half-k.half<D&&(k=Ss(O.x-L*(O.half+k.half+D)))}_e("lymph",k,k.x,Ot(k.x)+sn(k.x)*.5),Ns(gt(n?.3:.8),1,he.plateDn)}let Wa=[{along:!1,side:-1,slide:!1},{along:!1,side:1,slide:!1}];function Ns(e,t,n,s,i=0){let a=Vo(Math.round(e/At),n),c=t*(Ve(a)+ie.hep*.5);rn=1;let d=s==null?ce("bc","Bile canaliculus","",a,c+t*3,Wa[t>0?1:0]):ce("bc",`Bile
canaliculus`,"",a+i,s);_e("bc",d,a,c+t*1.4)}let bo=0,yo=0,at=e=>Ze(bo,yo,e),it=e=>Ve(e)+Math.min(ie.hep*.5,(N.W/2/r.k-Ve(e))*.5),wo=e=>Ot(e)+sn(e)*.5;function Ka(){let e=N,t=G,n=r.k;bo=Math.max(r.fr[0],(bt[0]-r.C[1])/n),yo=Math.min(r.fr[1],(bt[1]-r.C[1])/n),ce("sin","Sinusoid",Es(1,t.P2,1,""),at(.42),0);let s=at(.08),i=go(s);_e("fen",ce("fen","Fenestrae",Cn(),s,-it(s)),i,-(Ae(i)+ie.endo*.5)),s=z(e.xs,at(.3),at(.62)),_e("hsc",ce("hsc",C.act>.5?`Activated
stellate cell`:`Stellate
cell`,"",s,-it(s)),e.xs,-(wo(e.xs)+.6)),ce("hep","Hepatocyte","",at(.92),-it(at(.92))),s=at(.08),_e("disse",ce("disse",`Space of
Disse`,"",s,it(s)),s,wo(s)),s=at(.46),_e("lymph",ce("lymph","Lymph",Ts(1,!0),s,it(s)),s+2,wo(s+2));{let a=N.xk,c=Ae(a)-2.5*z(Ae(a)/5.2,.6,1);ce("kup",`Kupffer
cell`,"",a,it(a));let d=p.kup.cell||(p.kup.cell=[0,0]);d[0]=a,d[1]=c}if(ti().has("sinusoid:canaliculus")){let a=p.bc?.hh||40,c=null,d=-1/0;for(let u of[-1,1]){let F=u<0?he.plateUp:he.plateDn,P=u<0?[p.fen,p.hsc,p.hep]:[p.disse,p.lymph,p.kup];for(let f=Math.floor(bo/At)-1;f<=Math.ceil(yo/At)+1;f++){let w=Vo(f,F);for(let _ of[-3.4,3.4]){let B=on(w+_,u*it(w))[1];if(B-a/2<bt[0]||B+a/2>bt[1])continue;let k=1/0;for(let I of P)I?.cy!=null&&(k=Math.min(k,Math.abs(B-I.cy)-(a+(I.hh||0))/2));k>d&&(d=k,c={xe:w,sg:u,sd:F,al:_})}}}c&&Ns(c.xe,c.sg,c.sd,c.sg*it(c.xe),c.al)}}let Ha=()=>Ae(N.xk)-6.6*z(Ae(N.xk)/5.2,.6,1),za=()=>{let e=ce("kup","Kupffer cell","",N.xk,Ha()-.8,Ua);return p.kup.cell=null,e},bt=[0,0],Ds=e=>{let t=p[e]?.el;return document.getElementById("app")?.classList.contains("presenting")?!t||t.hidden||!t.firstElementChild?0:(Eo[e]??0)*(g.on?g.at(e,hn())?.a??0:1):1},Eo={},Rs=-1e9,_s=0,Os=()=>{_s=performance.now()+800};h.addEventListener("transitionrun",Os),h.addEventListener("animationstart",Os);function Xa(){let e=performance.now();if(!ut&&e>=_s&&e-Rs<250)return!1;ut=!1,Rs=e;let t=!1;for(let n of["in","out"]){let s=p[n]?.el,i=!s||s.hidden||!s.firstElementChild?0:Math.min(1,(g.on?1:+ye(s).opacity||0)*(+ye(s.firstElementChild).opacity||0)*(+ye(h).opacity||0));Math.abs((Eo[n]??-1)-i)>.004&&(Eo[n]=i,t=!0)}return t}let cn=[0,0,1],_n=[null,null],K={x:0,y:0,w:0,h:0},Is=-1e9,ko="",Us=[];function ja(){Is=performance.now();let e=pn(l),t=[],n="";for(let s of Hl(pn))n+=`${s.left|0},${s.top|0},${s.right|0},${s.bottom|0};`,t.push({l:s.left-e.left,r:s.right-e.left,t:s.top-e.top,b:s.bottom-e.top});return Us=t,n===ko?!1:(ko=n,!0)}let $a=()=>Us,Bs=()=>ko,Ao=0;function Ga(){if(Ao=0,co&&(co=!1,En()),de<=0)return;let e=!1;(kn||Bt)&&(ka(),Bt=!1,e=!0,q=!0),document.getElementById("app")?.classList.contains("presenting")&&Xa()&&(e=!0),performance.now()-Is>=250&&ja()&&(e=!0),e&&(ct="",Be())}function Mo(){Ao||(Ao=Xt(Ga))}let fe=new Float64Array(256),Kt=0,U=new Float64Array(4),Ue=new Float64Array(2),Ht=new Float64Array(3),rt=new Float64Array(4),fn=0,yt=0,To=0,Lo=0,Fo=0;function Po(e,t,n,s){if(Kt*4+4>fe.length){let a=new Float64Array(fe.length*2);a.set(fe),fe=a}let i=Kt++*4;fe[i]=e,fe[i+1]=t,fe[i+2]=n,fe[i+3]=s}function So(e,t,n,s,i,a,c){U[0]=e+i-n/2*c,U[1]=e+i+n/2*c,U[2]=t+a-s/2*c,U[3]=t+a+s/2*c}function qs(){if(!(U[0]>=2&&U[1]<=To-2&&U[2]>=Lo&&U[3]<=Fo))return!1;for(let e=0;e<Kt;e++){let t=e*4;if(U[0]<fe[t+1]+fn&&fe[t]<U[1]+fn&&U[2]<fe[t+3]+yt&&fe[t+2]<U[3]+yt)return!1}return!0}function Va(){let e=0;for(let t=0;t<Kt;t++){let n=t*4;e+=Math.max(0,Math.min(U[1],fe[n+1]+fn)-Math.max(U[0],fe[n]-fn))*Math.max(0,Math.min(U[3],fe[n+3]+yt)-Math.max(U[2],fe[n+2]-yt))}return e+(U[0]<2||U[1]>To-2||U[2]<Lo||U[3]>Fo?1e7:0)}function Ya(e,t,n,s,i){if(e===0)return Ue[0]=0,Ue[1]=0,!0;if(e--,e<12)return Ue[0]=0,Ue[1]=(e&1?-1:1)*((e>>1)+1)*(s*t/3+3),!0;if(e-=12,e<4)return Ue[0]=(e<2?1:-1)*(e&1?n*t+8:n*t/2+8),Ue[1]=0,!0;e-=4;let a=e>>1;if(a>=Kt)return!1;let c=a*4;return Ue[0]=0,Ue[1]=e&1?fe[c+2]-yt-1-(i+s/2*t):fe[c+3]+yt+1-(i-s/2*t),!0}let Ws=["in","out","sin","fen","lymph","disse","hsc","hep","kup","bc"];function Ja(){let e=N.W,t=fo(),n=t/.9,s=z(n,.8,1.5),i=6*n+2*s,a=3*n+2*s;fn=Math.max(6+2*t,2*i+3),yt=Math.max(2+2*t,2*a+3),To=e,Lo=r.ins[1],Fo=r.ins[2],Kt=0,K.w&&Po(K.x,K.x+K.w,K.y,K.y+K.h);let c=$a();for(let d=0;d<c.length;d++)Po(c[d].l,c[d].r,c[d].t,c[d].b);for(let d=0;d<Ws.length;d++){let u=Ws[d],F=p[u];if(!F?.box||!g.hasLook(u))continue;let P=F.box,f=P.r-P.l,w=P.b-P.t,_=(P.l+P.r)/2,B=(P.t+P.b)/2,k=F.off||(F.off=[0,0,1]);if(k[0]=0,k[1]=0,k[2]=1,So(_,B,f,w,0,0,1),u!=="in"&&u!=="out"&&u!=="sin"&&!qs()){let D=!1,O=!1;for(let L=0;L<3&&!D;L++){let R=L===0?1:L===1?.85:.72;for(let Y=0;Ya(Y,R,f,w,B);Y++){let V=Ue[0],oe=Ue[1];if(Math.abs(oe)>2.2*w)continue;if(So(_,B,f,w,V,oe,R),qs()){Ht[0]=V,Ht[1]=oe,Ht[2]=R,D=!0;break}let ae=Va()+Math.abs(oe)*.01;(!O||ae<rt[0])&&(O=!0,rt[0]=ae,rt[1]=V,rt[2]=oe,rt[3]=R)}}D?(k[0]=Ht[0],k[1]=Ht[1],k[2]=Ht[2]):O&&(k[0]=rt[1],k[1]=rt[2],k[2]=rt[3])}So(_,B,f,w,k[0],k[1],k[2]);let I=!1;for(let D=0;D<c.length&&!I;D++){let O=c[D];U[0]<O.r&&O.l<U[1]&&U[2]<O.b&&O.t<U[3]&&(I=!0)}if(F.covered=I,X[u]&&(X[u].hide=I),Po(U[0],U[1],U[2],U[3]),u==="kup"){let D=F.cell||F.at,O=on(D[0],D[1]),L=O[0],R=O[1];if(L<U[0]-6||L>U[1]+6||R<U[2]-6||R>U[3]+6){let Y=X.kup||={key:"kup"};Y.x1=z(L,U[0],U[1]),Y.y1=z(R,U[2],U[3]),Y.x2=L,Y.y2=R,Y.show=1,Y.follow=!1,Y.hide=F.covered}else X.kup&&(X.kup.show=0);continue}let T=X[u];T&&(T.follow=!0,T.sg=Math.sign(T.x2-_))}}let On="",Ks=-1,Qa=["Portal venule","Central vein"];function Za(){let e=N,t=r.fe,n=t.l+2,s=r.ins[0]+12,i=e.vert?on(0,Ve(0))[0]-8:N.W-12,a=Math.max(90,i-n);a!==Ks&&(Ks=a,On=`${a}px`);let c=dt;c.sig?(K.w=2*c.px+(c.dot?c.dot.d+c.gap:0)+Nl("Protein",et(c)),K.h=2*c.py+c.lh):K.w=K.h=0,K.x=n,K.y=s;let d=G;for(let u=0;u<2;u++){let F=u?"out":"in",P=Qa[u],f=Da(u,u?d.P3:d.P1),w=Le(F,"sv-region sv-region-sin sv-end",P,f),_=ue(w),B=_[0],k=_[1],I,T,D=48;e.vert?(I=r.C[0]-B/2,T=u?t.b-k-D:t.t+D):(I=u?t.r-B-8-D:t.l+8+D,T=r.C[1]-k/2),e.vert&&!u&&K.w&&K.x+K.w>I-6&&(T=Math.max(T,K.y+K.h+D)),w.cx=I+B/2,w.cy=T+k/2,w.end=!0;let O=w.at0||(w.at0=[0,0]);O[0]=I,O[1]=T;let L=w.box||(w.box={l:0,r:0,t:0,b:0});if(L.l=I,L.r=I+B,L.t=T,L.b=T+k,e.vert)_n[u]=null;else{let ae=_n[u]||(_n[u]={u,x0:0,x1:0,y0:0,y1:0});ae.u=u,ae.x0=u?I:I-D,ae.x1=u?I+B+D:I+B,ae.y0=T,ae.y1=T+k}e.vert&&(bt[u]=u?T-6:T+k+6);let R=e.vert?r.C[0]:u?I+B+D/2:I-D/2,Y=e.vert?u?T+k+D/2:T-D/2:r.C[1],V=Math.cos(e.ang),oe=Math.sin(e.ang);cn[u]=((R-r.C[0])*V+(Y-r.C[1])*oe)/r.k}cn[2]=Math.min(22/r.k,ie.lum*C.lum*.95),e.vert&&(bt[0]=Math.max(bt[0],r.ins[0]+12+K.h+8))}let Hs=new Map,Co=e=>{let t=gn(e),n=Hs.get(e);return(!n||n.t!==t)&&(n={t,v:Ko(t)},Hs.set(e,n)),n.v},ge={x:0,y:0,off:null,show:1,now:0,fade:!1},No=[0,0,1],ei=[[["Protein","name"]]],zs=null,Xs=null,Fe={x1:0,y1:0,x2:0,y2:0,show:1,cut:!1,of:null,follow:!1,sg:0,colour:null},wt={line:"",lw:1,r:2.4,fill:"",ring:"",rw:1.3,halo:"",haloR:5},In=null,Un=new Set;function ti(){let e=document.getElementById("app"),t=e?.classList.contains("presenting")&&e.dataset.lit||"";return t!==In&&(In=t,Un=new Set(t?t.split(" "):[])),Un}let js=e=>{let t=document.getElementById("app"),n=t?.dataset.lit||"";return n!==In&&(In=n,Un=new Set(n?n.split(" "):[])),!n||!t.classList.contains("presenting")||!/(^| )(lobule|sinusoid):/.test(n)||Un.has(`sinusoid:${we[e.key]||e.key}`)?1:.65};function ni(){let e=hn();wt.line=Co("--leader"),wt.fill=Co("--stage-bg"),wt.halo=wt.fill,wt.ring=Co("--text-2"),g.leadLook(wt),ge.fade=!Z&&(!r.vel||ho(r.vel));for(let n in p){let s=p[n];s.cx==null||!g.hasLook(s.key)||(g.measure(s.key,s.lines),ge.x=s.cx,ge.y=s.cy,ge.off=s.off||No,ge.show=wn||s.covered||s.key==="bc"&&!rn?0:js(s),ge.now=e,g.put(s.key,ge))}for(let n in X){let s=X[n];s.x1!=null&&(Fe.x1=s.x1,Fe.y1=s.y1,Fe.x2=s.x2,Fe.y2=s.y2,Fe.show=wn||s.hide||s.key==="bc"&&!rn?0:s.show*(p[s.key]?js(p[s.key]):1),Fe.cut=!!s.hide,Fe.of=p[s.key]?s.key:null,Fe.follow=!!s.follow,Fe.sg=s.sg||0,Fe.colour=wt.line,g.lead(s.key,Fe))}let t=dt;if(t.sig&&K.w&&g.hasLook("legend")){let n=g.measure("legend",ei),s=n[0],i=t.dot?t.dot.d+t.gap:0,a=K.x+t.px;if(ge.x=a+i+s/2,ge.y=K.y+K.h/2,ge.off=No,ge.show=1,ge.now=e,ge.fade=!1,g.put("legend",ge),t.dot&&t.dot!==zs){zs=t.dot;let c=t.dot.d/2,d=-i+c,u=n[1]/2,F=[],P=20;for(let f=0;f<P;f++)F.push(d+c*Math.cos(f/P*2*Math.PI),u+c*Math.sin(f/P*2*Math.PI));Xs=[{pts:F,fill:t.dot.fill,stroke:t.dot.ring?.colour,sw:t.dot.ring?.w}]}g.decor("legend",t.dot?Xs:null)}else g.put("legend",{x:0,y:0,off:No,show:0,now:e})}let Do=0,$s="",Gs=()=>{Do||(Do=Xt(oi))};g.onRest=Gs;function oi(){if(Do=0,Zt||g.moving())return;let e="";for(let t of Object.values(p))e+=`${t.key}:${t.cx?.toFixed(1)},${t.cy?.toFixed(1)},${t.off||""},${!!t.covered}|`;if(e+=`${K.x.toFixed(1)},${K.y.toFixed(1)},${On}`,e!==$s){$s=e;for(let t of Object.values(p)){let n=t.el;if(!n||t.cx==null)continue;n.style.transform=t.end?`translate(${t.at0[0].toFixed(1)}px, ${t.at0[1].toFixed(1)}px)`:`translate(${t.cx.toFixed(1)}px, ${t.cy.toFixed(1)}px) translate(-50%, -50%)`;let s=t.off||[0,0,1];n.style.translate=s[0]||s[1]?`${s[0].toFixed(1)}px ${s[1].toFixed(1)}px`:"",n.style.scale=s[2]!==1?String(s[2]):"",t.covered?n.dataset.covered="":delete n.dataset.covered}Re.style.transform=`translate(${K.x.toFixed(1)}px, ${K.y.toFixed(1)}px)`,Re.style.maxWidth!==On&&(Re.style.maxWidth=On)}}let j=new Float64Array(32),Vs=new Float64Array(32),Ys=null,Js=null,Qs=!1;function si(){let e=G,t=0;j[t++]=Math.round(r.k*1e3),j[t++]=Math.round(r.C[0]),j[t++]=Math.round(r.C[1]),j[t++]=Math.round(r.f.l),j[t++]=Math.round(r.f.t),j[t++]=Math.round(r.f.r),j[t++]=Math.round(r.f.b),j[t++]=Math.round(r.fe.l),j[t++]=Math.round(r.fe.t),j[t++]=Math.round(r.fe.r),j[t++]=Math.round(r.fe.b);for(let s=0;s<r.ins.length;s++)j[t++]=Math.round(r.ins[s]);j[t++]=Math.round(C.lum*1e3),j[t++]=C.act>.5?1:0,j[t++]=Math.round(C.por*20),j[t++]=e.hide?1:0,j[t++]=Math.round(e.P2*10),j[t++]=zo(e.lymph),j[t++]=Math.round(e.lyProt*100),j[t++]=Math.round(e.P1*10),j[t++]=Math.round(e.P3*10),j[t++]=o.matches?1:0,j[t++]=Math.round(fo()*1e3);let n=Qs&&Ys===ao&&Js===Bs();for(let s=0;n&&s<t;s++)j[s]!==Vs[s]&&(n=!1);if(n)return!1;for(let s=0;s<t;s++)Vs[s]=j[s];return Qs=!0,Ys=ao,Js=Bs(),!0}let Zs=!1,Qe=new Float64Array(8),el=new Float64Array(8);function li(){let e=G;Qe[0]=Math.round(C.por*4),Qe[1]=C.col>.15?1:0,Qe[2]=C.act>.4?1:0,Qe[3]=e.hide?1:0,Qe[4]=Math.round(e.P2),Qe[5]=zo(e.lymph),Qe[6]=Math.round(e.lyProt*100);let t=Zs;for(let n=0;t&&n<7;n++)Qe[n]!==el[n]&&(t=!1);if(t)return!1;for(let n=0;n<7;n++)el[n]=Qe[n];return Zs=!0,!0}let Bn=0,tl=!1,qn="",ct="",un=!1;function Wn(e,t=!0,n=!0,s=e){un=!1;let[i,a]=ro();ss(i,a),(s>0||C.lum==null)&&rs(s);let c=Ea(s);if(Oe+=((qo()?0:1)-Oe)*(s>0?1-Math.exp(-s/.25):0),Oe<.002&&(Oe=0),t&&e>0&&Oe>0&&us(e*Oe),!n)return;mt!=null&&A&&st&&!Z&&xa();let d=Qo(i,a)*so;(b.width!==Math.round(i*d)||b.height!==Math.round(a*d))&&(b.width=Math.round(i*d),b.height=Math.round(a*d));let u=document.documentElement.dataset.theme==="dark"||!document.documentElement.dataset.theme&&Ho.matches,F=!!Z&&Z.g<ma;F!==wn&&(wn=F,Qt=!0);let P=si();if(Mo(),(P||qn===""||Qt||q)&&(qn="laid",Qt=!1,q=!1,Za(),qa(),Ja(),ni()),Na(),A){let f=Ma(u);if(Bt||kn){Mo(),un=!1;return}let w=ri;w[0]=Ds("in"),w[1]=Ds("out");let _=Math.round(w[0]*100),B=Math.round(w[1]*100),k=g.on?Math.round((g.at("in",hn())?.a??0)*100):-1,I=g.on?Math.round((g.at("out",hn())?.a??0)*100):-1;(fl!==_||ul!==B||dl!==k||hl!==I)&&(fl=_,ul=B,dl=k,hl=I,Ro=fi(w),Kn=g.on?ci(k,I):"",nl());let{C:T,k:D,ca:O,sa:L}=Rt,R=D*d;zn(f.uI0,O/R,L/R,-(T[0]*O+T[1]*L)/D),zn(f.uI1,-L/R,O/R,(T[0]*L-T[1]*O)/D),zn(f.uF0,R*O,-R*L,d*T[0]),zn(f.uF1,R*L,R*O,d*T[1]),f.uPx=1/R,f.uK=R,f.uKs=Math.min(R,12*d),f.uLum=ie.lum*C.lum,f.uPinch=C.pinch,f.uXs=N.xs,f.uXk=N.xk,f.uKy=Ae(N.xk),f.uHscA=Ot(N.xs)+sn(N.xs)*.5+.8,f.uCol=C.col,f.uBm=C.bm,f.uMv=C.mv,f.uAct=C.act,f.uPor=C.por,f.uFlow=Tn,f.uLym=fs,f.uLyF=z(.32*C.filt**1.5,.06,1.75),f.uDir=Math.sign(C.v||1),Xn(f.uEnd,cn[0],cn[1],cn[2],.95),f.uEndA=w;let Y=de>0&&!Z&&!!Bo.get().sinusoidWash&&!G.hide;Y?Bn||(Bn=performance.now()):Bn=0;let V=Y?da(performance.now()-Bn,x.matches):0;if(Xn(f.uWedge,V>0?1:0,V,0,0),tl=Y&&V<1,Z){let Se=Z.g;Xn(f.uRev,0,0,0,0),f.uAll=Tt(.5,.88,Se),f.uDet[0]=Tt(.72,1,Se),f.uDet[1]=1e5,f.uFocus=Tt(.82,1,Se)}else Xn(f.uRev,1,-1e5,1e5,1e5),f.uAll=1,f.uDet[0]=1,f.uDet[1]=1e5,f.uFocus=1;ps=Math.max(0,e)*Oe;let oe=Ca();if(Oe===0&&!Z&&!je&&!tl&&ii(f,oe))un=!0;else{A.draw(f,qt,oe),vl("sinusoid-view"),nt?.drew(performance.now());let Se=A.target;v=Se?Se.w:0,E=Se?Se.h:0,M=f.uAll===1&&f.uFocus===1}ct=Oe===0&&!Z&&!je,je&&va()}(c||Qt)&&(un=!1),Zt=c||Qt,!Zt&&!g.moving()&&Gs(),li()&&(Hn=ui(),nl())}let Ro="",Kn="",Hn="",_o=0,nl=()=>{_o||(_o=Xt(ai))};function ai(){_o=0,b.dataset.endArrows!==Ro&&(b.dataset.endArrows=Ro),Kn&&b.dataset.endNames!==Kn&&(b.dataset.endNames=Kn),Hn&&b.getAttribute("aria-label")!==Hn&&b.setAttribute("aria-label",Hn)}let Pe=new Float64Array(256),dn=new Float64Array(256),ol=0,sl=!1,ll=0,al=0,il=-1,rl=-1;function ii(e,t){let n=0;for(let a in e){let c=e[a];if(typeof c=="number")n>=Pe.length&&cl(),Pe[n++]=c;else for(let d=0;d<c.length;d++)n>=Pe.length&&cl(),Pe[n++]=c[d]}let s=ct&&sl&&ll===b.width&&al===b.height&&il===A.epoch&&rl===t&&ol===n;for(let a=0;s&&a<n;a++)Pe[a]!==dn[a]&&(s=!1);if(s)return!0;let i=dn;return dn=Pe,Pe=i,ol=n,sl=!0,ll=b.width,al=b.height,il=A.epoch,rl=t,!1}function cl(){let e=new Float64Array(Pe.length*2),t=new Float64Array(Pe.length*2);e.set(Pe),t.set(dn),Pe=e,dn=t}let ri=[0,0],fl=-1,ul=-1,dl=-2,hl=-2;function ci(e,t){return(e/100).toFixed(2)+" "+(t/100).toFixed(2)}function fi(e){return e[0].toFixed(2)+" "+e[1].toFixed(2)}function zn(e,t,n,s){e[0]=t,e[1]=n,e[2]=s}function Xn(e,t,n,s,i){e[0]=t,e[1]=n,e[2]=s,e[3]=i}function ui(){let e=G,t=[`A sinusoid, cut along its length${e.hide?"":`, at ${Yn(e.P2,1)} millimeters of mercury`}.`];return t.push(C.por>.75?"Its lining is fenestrated: plasma and its proteins pass through the open pores into the space of Disse.":C.por>.25?"Many of its fenestrae have closed: less protein crosses into the space of Disse.":"Its fenestrae have closed (capillarization): protein no longer crosses the wall."),e.hide||t.push(`Hepatic lymph ${Xo(e.lymph)} milliliters a day, flowing back along the space of Disse toward the portal triad, with ${Math.round(e.lyProt*100)} percent of plasma protein.`),C.col>.15&&t.push("Collagen fills the space of Disse and the hepatocytes have lost their microvilli."),t.push(C.act>.4?"The stellate cell is activated: no vitamin A droplets, contracted, depositing collagen.":"The stellate cell is quiescent, full of vitamin A droplets."),t.join(" ")}let Oo=0,jn=0,zt={x:0,y:0,ang:0,k:0,lumen:0},Be=()=>{de>0&&!Ee&&G&&(Ee=Mt(Et))};S=Be,Bo.on("*",Be),addEventListener("pps:occ",Be);let di=600,Io=0;function Et(e){if(Ee=0,de<=0||!G)return;if(El()){Jt=0,clearTimeout(jn),jn=setTimeout(Be,250);return}(Z||pt||Zt||!Oo)&&(Io=e);let t=e-Io>di?Math.max(Uo(),yl("flow"),wl(e,Io)):Uo();if(!Z&&!pt&&e-Oo<t){Ee=Mt(Et);return}if(nt&&!Z&&!pt&&!nt.ready(e)){Ee=Mt(Et);return}Oo=e;let n=(e-(Jt||e))/1e3;if(Jt=e,Wn(Math.min(.1,n),!x.matches,!pt,n),pt=!1,un&&Oe===0&&qo()){Jt=0,clearTimeout(jn),jn=setTimeout(Be,250);return}Ee=Mt(Et)}return{el:pe,captions:()=>g.snapshot(),explainHit(e,t){let n=g.snapshot(),s=pn(h);for(let a of n.items)a.x+=s.left,a.y+=s.top;let i=Bl(n.items,e,t,8,a=>!!ee[a]&&!!p[a]&&(a!=="bc"||!!rn));return i?{key:i.key,target:`sinusoid:${we[i.key]||i.key}`}:null},setExplain(e){re=e},camera(e,t,n,s=0){return!J||!A||A.lost?!1:(Q=e,ht=t,yn=n,s>0&&(Jo=s),g.view(e,t,n),J.present(),!0)},sharpen(e){let t=Qo(...ro()||[1,1]),n=e?Math.max(1,Math.min(Q,3/(t||1))):1;n!==so&&(so=n,ct="",Be())},get cameraReady(){return!!J&&!!A&&!A.lost},setHoles:e=>g.holes(e),glassSeq:()=>J&&A&&!A.lost&&de>0?A.drawSeq:-1,glassHost(){if(!A||A.lost||!st||de<1||Z||!b.width||!b.height)return null;if(J){let e=J;return{gl:e.gl,canvas:e.canvas,add:e.add,warmIn:e.warmIn,now:()=>{e.present()},seq:()=>A.drawSeq,onPicture:t=>A.onPicture(t)}}return{gl:A.top.gl,canvas:b,add:A.top.add,warmIn:A.top.warmIn,now:()=>{A.present()},seq:()=>A.drawSeq,onPicture:e=>A.onPicture(e)}},setModel(e){Yt(),G=e,de>0&&!Ee&&(Ee=Mt(Et))},place({opacity:e,dive:t=null,isOpen:n=!1}){e>0&&Yt();let s=de;if(de=e,Z=t,pe.style.opacity=e,pe.style.visibility=e>0?"visible":"hidden",Wo(pe,"sv-live",e>0),st=n,Wo(pe,"on",n),kl(pe,"aria-hidden",n?"false":"true"),e<=0&&s>0&&g.hideAll(),e<=0&&s>0?(lo(),b.width=0,b.height=0,ct="",J&&(A?.free?.(),J.present())):J&&e>0&&!G&&J.present(),e>0&&s<=0&&(Ct=Gn(),Nt=kt("cap"),mt=null,Jt=0,qn="",r.k=0,Je.length=0,Ln=0,ln=0,G)){for(let i in C)delete C[i];Wn(0,!1),ne();for(let i=0;i<40;i++)us(.1)}e>0&&G&&(Wn(0,!1),pt=!0),e>0&&!Ee&&G&&(Ee=Mt(Et))},frame(){let[e,t]=ro();return ss(e,t),G&&C.lum==null&&rs(0),zt.x=r.tC[0],zt.y=r.tC[1],zt.ang=N.ang,zt.k=r.tk,zt.lumen=2*ie.lum*(C.lum??1)*r.tk,zt},isOpen:()=>st,xform(e){if(!st||!N)return!1;let t=Math.cos(N.ang),n=Math.sin(N.ang);return e.a=r.k*t,e.b=r.k*n,e.c=-r.k*n,e.d=r.k*t,e.e=r.C[0],e.f=r.C[1],!0},captionAt(e){if(e==="legend")return[K.x,K.y];let t=g.at(e);return t?[t.x,t.y]:null},labelsMoving:()=>st&&Zt,get available(){return St?!!A:jo()},rehost:no}}export{Ai as a,da as b,br as c};
