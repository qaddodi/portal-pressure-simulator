import{i as qt,j as ot,m as at,n as nt,x as Jt}from"./chunk-PZUQBGPC.js";import{f as Ut,g as Gt,h as Ht}from"./chunk-ZVT6VNWV.js";import{e as Z,f as jt,j as zt}from"./chunk-CLXSGRVO.js";var E=64,K=E-1,Kt=2,Xt=8,rt=6,Le=.3,Vt=.9,Yt=1e-9,Pe={BODY:0,CAP:1,DISC:2,TRAP:3},Yo=Xt+3,Qo=E*2,Zo=Qo,ea=Zo+2*Yo,ta=ea+(E-2)*rt,_n=ta+4*K,En=1/Math.cos(Math.PI/rt);var Tn=new Float32Array([-1,-1,1,-1,-1,1,1,1]);function Qt(e){if(!(e>-.5))return null;let a=Math.floor(e+.5);return{row:a,mark:e-a}}var st=e=>Number.isInteger(e)?e.toFixed(1):String(e),ue=`
const int N_SAMPLES = ${E};
const int N_QUADS = ${K};
const float MITRE_LIMIT = ${st(Kt)};
const int CAP_SEGS = ${Xt};
const int DISC_SEGS = ${rt};
const float MIN_RADIUS = ${st(Le)};
const float TILT_MAX = ${st(Vt)};
const float SEG_EPS = ${Yt.toExponential()};
const int K_BODY = ${Pe.BODY};
const int K_CAP = ${Pe.CAP};
const int K_DISC = ${Pe.DISC};
const int K_TRAP = ${Pe.TRAP};
const float M_PI = 3.14159265358979;
#define ENT_W ${2048}
uniform sampler2D ent;                 // the entry texture (veins-gl): the frame's points from posBase
uniform sampler2D rad;                 // per vessel row (y), per sample (x): the radius in .r
uniform int posBase;
vec2 PT(int id, int i) { int t = posBase + id * ${E/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }
float mRW(int id, int i, float pad) { return max(texelFetch(rad, ivec2(i, id), 0).r, MIN_RADIUS) + pad; }
vec3 mDir(int id, int j) { vec2 d = PT(id, j + 1) - PT(id, j); return vec3(d, length(d)); }
struct MSeg { vec2 t; float L; float tilt; float c; };
MSeg mSeg(int id, int j, float pad) {
  vec3 d = mDir(id, j);
  float L = d.z;
  if (!(L > SEG_EPS)) {
    d = vec3(0.0);
    if (j > 0) d = mDir(id, j - 1);
    if (!(d.z > SEG_EPS) && j < N_QUADS - 1) d = mDir(id, j + 1);
    if (!(d.z > SEG_EPS)) d = vec3(1.0, 0.0, 1.0);
  }
  float tilt = L > SEG_EPS ? clamp((mRW(id, j, pad) - mRW(id, j + 1, pad)) / L, -TILT_MAX, TILT_MAX) : 0.0;
  return MSeg(d.xy / d.z, L, tilt, sqrt(1.0 - tilt * tilt));
}
vec2 mNrm(MSeg g, float s) { return vec2(s * g.c * -g.t.y + g.tilt * g.t.x, s * g.c * g.t.x + g.tilt * g.t.y); }
bool mMitreAB(MSeg a, MSeg b, float rw, float s, out vec2 M) {
  vec2 na = mNrm(a, s), nb = mNrm(b, s), sm = na + nb;
  float m2 = dot(sm, sm);
  M = vec2(0.0);
  if (m2 < 1e-12) return false;
  vec2 dr = sm / sqrt(m2);
  float cosH = dot(dr, na);
  if (cosH < 1.0 / MITRE_LIMIT) return false;
  vec2 mv = dr / cosH;
  if (abs(rw * dot(mv, a.t)) > 0.5 * a.L || abs(rw * dot(mv, b.t)) > 0.5 * b.L) return false;
  M = mv;
  return true;
}
bool mEndPinched(int id, int i, float pad) {
  MSeg g = mSeg(id, i == 0 ? 0 : N_QUADS - 1, pad);
  return abs(mRW(id, i, pad) * g.tilt) > 0.5 * g.L;
}
bool mBevelled(int id, int i, float pad) {
  if (i == 0 || i == N_SAMPLES - 1) return mEndPinched(id, i, pad);
  MSeg a = mSeg(id, i - 1, pad), b = mSeg(id, i, pad);
  float rw = mRW(id, i, pad);
  vec2 m;
  return !mMitreAB(a, b, rw, 1.0, m) || !mMitreAB(a, b, rw, -1.0, m);
}
bool mDiscOn(int id, int i, float pad) { return mBevelled(id, i - 1, pad) || mBevelled(id, i, pad) || mBevelled(id, i + 1, pad); }
vec2 meshWorld(int id, vec4 a, float pad) {
  int kind = int(a.x + 0.5), i = int(a.y + 0.5), u = int(a.w + 0.5);
  float s = a.z;
  vec2 p = PT(id, i);
  float rw = mRW(id, i, pad);
  if (kind == K_BODY) {
    if (i == 0 || i == N_SAMPLES - 1) return mEndPinched(id, i, pad) ? p : p + rw * mNrm(mSeg(id, i == 0 ? 0 : N_QUADS - 1, pad), s);
    MSeg sa = mSeg(id, i - 1, pad), sb = mSeg(id, i, pad);
    vec2 mp, mm;
    if (!mMitreAB(sa, sb, rw, 1.0, mp) || !mMitreAB(sa, sb, rw, -1.0, mm)) return p;
    return p + rw * (s > 0.0 ? mp : mm);
  }
  if (kind == K_CAP) {
    bool first = i == 0;
    MSeg g = mSeg(id, first ? 0 : N_QUADS - 1, pad);
    vec2 o = first ? -g.t : g.t, n = vec2(-g.t.y, g.t.x);
    float skew = (first ? -1.0 : 1.0) * asin(g.tilt);
    float step = (M_PI - 2.0 * skew) / float(CAP_SEGS);
    if (u == 0) return p + rw * sin(skew) * o;
    int m = u - 1;
    float th, rd = rw;
    if (m == 0) th = skew;
    else if (m == CAP_SEGS + 1) th = skew + float(CAP_SEGS) * step;
    else { th = skew + (float(m) - 0.5) * step; rd = rw / cos(step * 0.5); }
    return p + rd * (cos(th) * n + sin(th) * o);
  }
  if (kind == K_DISC) {
    if (!mDiscOn(id, i, pad)) return p;
    float th = 2.0 * M_PI * float(u) / float(DISC_SEGS);
    return p + rw * (1.0 / cos(M_PI / float(DISC_SEGS))) * vec2(cos(th), sin(th));
  }
  // K_TRAP: segment i, side s, end u
  vec2 q = PT(id, i + u);
  if (!(mBevelled(id, i, pad) || mBevelled(id, i + 1, pad))) return q;
  return q + mRW(id, i + u, pad) * mNrm(mSeg(id, i, pad), s);
}
`;var R=20,oa=4,$=52,Zt=7,aa=8,na=10,sa=43,ra=47,ia=48,la=5,it=E/2,lt=(e,a)=>{let o=Math.floor(e[a+aa]+.5);return o<0?0:o>=R?R-1:o};function Sn(e,a,o,t,n){let s=Math.max(1,Math.ceil(t*it/2048)),r=s*2048*4;(!n.pts||n.pts.length<r)&&(n.pts=new Float32Array(r)),(!n.on||n.on.length<t)&&(n.on=new Uint8Array(t)),(!n.cnt||n.cnt.length<t)&&(n.cnt=new Uint8Array(t)),(!n.seen||n.seen.length<t*K)&&(n.seen=new Uint8Array(t*K));let{pts:i,on:c,cnt:l,seen:f}=n;i.fill(0,0,r),c.fill(0,0,t),l.fill(0,0,t),f.fill(0,0,t*K);for(let m=0;m<o;m++){let u=a[m*6+2],p=u+a[m*6+3];for(let x=u;x<p;x++){let _=x*8,w=e[_+5],h=e[_+4];if(!(w>=0)||w>=K||!(h>=0)||h>=t)continue;let v=h*K+w;f[v]===0&&(f[v]=1,l[h]++);let b=(h*it+(w>>1))*4+(w&1)*2,A=(h*it+(w+1>>1))*4+(w+1&1)*2;i[b]=e[_],i[b+1]=e[_+1],i[A]=e[_+2],i[A+1]=e[_+3]}}let d=0;for(let m=0;m<t;m++)l[m]>0&&(c[m]=1,l[m]<K&&d++);return n.rows=s,n.missing=d,n}function Rn(e,a,o){let t=0;for(let r=0;r<a;r++)t+=e[r*6+5];(!o.list||o.list.length<t)&&(o.list=new Int32Array(t),o.view=null);let n=o.list,s=0;for(let r=0;r<a;r++){let i=e[r*6+4],c=e[r*6+5];for(let l=0;l<c;l++)n[s++]=i+l}return(!o.view||o.view.length!==t)&&(o.view=n.subarray(0,t)),o.n=t,o.view}function In(e,a,o,t){(!t.rows||t.rows.length<o)&&(t.rows=new Float32Array(o)),t.start||(t.start=new Int32Array(R),t.count=new Int32Array(R),t.cur=new Int32Array(R),t.lit=new Uint8Array(R),t.litUp=new Uint8Array(R),t.sel=new Uint8Array(R),t.shadow=new Uint8Array(R));let{rows:n,start:s,count:r,cur:i,lit:c,litUp:l,sel:f,shadow:d}=t;r.fill(0),c.fill(0),l.fill(0),f.fill(0),d.fill(0);for(let u=0;u<o;u++){let p=u*$;if(!a[u]||!(e[p+Zt]>0))continue;let x=lt(e,p);r[x]++,e[p+sa]>0&&(e[p+ra]>la?l[x]=1:c[x]=1),e[p+ia]>0&&(f[x]=1),(Math.floor(e[p+na]+.5)&oa)!==0&&(d[x]=1)}let m=0;for(let u=0;u<R;u++)s[u]=m,i[u]=m,m+=r[u];for(let u=0;u<o;u++){let p=u*$;!a[u]||!(e[p+Zt]>0)||(n[i[lt(e,p)]++]=u)}return t.n=m,t}function eo(e,a,o,t,n=8,s=4){let r=0;for(let i=4;i<4+s;i++){let c=e[a*n+i];if(!(c>-.5))continue;let l=Math.floor(c+.5);l<0||l>=t||(r|=1<<lt(o,l*$))}return r}function On(e,a,o,t,n=8,s=4){let r=Math.floor(o.length/$);t.start||(t.start=new Int32Array(R),t.count=new Int32Array(R),t.cur=new Int32Array(R));let{start:i,count:c,cur:l}=t;c.fill(0);for(let m=0;m<a;m++){let u=eo(e,m,o,r,n,s);for(let p=0;p<R;p++)u&1<<p&&c[p]++}let f=0;for(let m=0;m<R;m++)i[m]=f,l[m]=f,f+=c[m];(!t.data||t.data.length<f*n)&&(t.data=new Float32Array(f*n));let d=t.data;for(let m=0;m<a;m++){let u=eo(e,m,o,r,n,s);for(let p=0;p<R;p++){if(!(u&1<<p))continue;let x=l[p]++*n,_=m*n;for(let w=0;w<n;w++)d[x+w]=e[_+w]}}return t.n=f,t}var to=8,me=6,oo=16;function Dn(e,a,o,t=-1){let n=h=>t>=0?e[(t+e[h])*4]:e[h],s=h=>t>=0?e[(t+e[h])*4+1]:e[h+1],r=h=>{let v="";for(let b=0;b<8;b++)v+=e[h*8+b]+",";return v},i=new Set,c=[];for(let h of a){if(!(e[h*8+2]>0))continue;let v=!1;for(let A=0;A<4;A++)e[h*8+4+A]>-.5&&(v=!0);if(!v)continue;let b=r(h);i.has(b)||(i.add(b),c.push(h))}let l=c.length,f=new Int32Array(l),d=[],m=new Int32Array(l);for(let h=0;h<l;h++){f[h]=h,m[h]=1;let v=new Set;for(let b=0;b<4;b++){let A=e[c[h]*8+4+b];A>-.5&&v.add(Math.floor(A+.5))}d.push(v)}let u=h=>{for(;f[h]!==h;)h=f[h]=f[f[h]];return h},p=[];for(let h=0;h<l;h++)for(let v=h+1;v<l;v++){let b=c[h]*8,A=c[v]*8,y=Math.hypot(n(b)-n(A),s(b)-s(A));if(y>=e[b+2]+e[A+2])continue;let S=!1;for(let k of d[h])d[v].has(k)&&(S=!0);S&&p.push([y,h,v])}p.sort((h,v)=>h[0]-v[0]);for(let[,h,v]of p){let b=u(h),A=u(v);if(b===A||m[b]+m[A]>me)continue;let y=new Set([...d[b],...d[A]]);y.size>to||(f[A]=b,d[b]=y,m[b]+=m[A])}let x=new Map;for(let h=0;h<l;h++){let v=u(h);x.has(v)||x.set(v,[]),x.get(v).push(h)}o.j=new Float32Array(l*8),o.data=new Float32Array(x.size*oo);let _=0,w=0;for(let[h,v]of x){let b=1/0,A=1/0,y=-1/0,S=-1/0,k=w*oo;o.data[k+12]=_,o.data[k+13]=v.length;for(let C of v){let I=c[C]*8;for(let W=0;W<8;W++)o.j[_*8+W]=e[I+W];_++,b=Math.min(b,n(I)-e[I+2]),y=Math.max(y,n(I)+e[I+2]),A=Math.min(A,s(I)-e[I+2]),S=Math.max(S,s(I)+e[I+2])}o.data[k]=(b+y)/2,o.data[k+1]=(A+S)/2,o.data[k+2]=Math.max(y-b,S-A)/2;let D=0;for(let C of d[h])o.data[k+4+D++]=C;for(;D<to;D++)o.data[k+4+D]=-1;w++}return o.count=w,o}var Me=512,pe=({F_DIFFUSE:e,F_EDGE:a,F_SHADOW:o,F_SPEC:t,F_VEIL:n,F_WHOLE:s,LIFT_EASE_MAX:r,LIFT_EASE_SHARE:i,LUMEN2:c,ROW2_BITS:l,VEIL_K:f})=>`
// One segment's nearest point, folded into the vessel's nearest so far (the vessel shader's search, per segment): bd, bs the wall's and
// the shadow's distance, br the radius, bu the along, bx the across, bg the direction from the centreline; aM, aW, aU the soft along.
void segNear(int id, float i, vec4 A, vec2 p, vec2 ps, vec4 clip, bool dotted, inout float bd, inout float bs, inout float br, inout float bu,
             inout float bx, inout vec2 bg, inout float aM, inout float aW, inout float aU) {
  // The part of this segment inside the drawn stretch (a vessel drawing on is cut short).
  float u0 = i / LAST, u1 = (i + 1.0) / LAST;
  if (u1 < clip.x || u0 > clip.y) return;
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

// A vessel's attributes at p (texels 0\u201312): its tier, z, flags, wall, how far the organs fade it, its lumen colour along it (and a recoloured
// stretch), hover, how far it stands out of the dimmed network, its own casing colour, and its alpha (fades, veil). uAt, vAt: along, soft along.
void vesAttrs(int id, float uAt, float vAt, vec2 p, float occl, out float tier, out float z, out float flag, out float wall, out float of,
              out vec3 col, out float hov, out float sel, out vec3 edge, out float alpha) {
  vec4 t0 = T(id, 0), t1 = T(id, 1), t2 = T(id, 2), t3 = T(id, 3), t4 = T(id, 4);
  tier = t2.x; z = t2.y; flag = t2.z; wall = t0.w;
  of = (int(t2.z + 0.5) & ${s}) != 0 ? 0.0 : 1.0;   // (how far the organs fade this vessel: 1 as they cover it, 0 for a vessel shown whole)
  col = mix(t0.rgb, t1.rgb, alongAt(id, clamp(uAt, 0.0, 1.0)));
  vec4 tc = T(id, 8);
  hov = T(id, 9).w;
  // The selected vessel stands out of the dimmed network, easing back into it along its course toward each end that
  // meets an unselected vessel, so it never stops in a hard, round end where the dimmed vessel carries on (a slide's
  // spotlit vessel toward its free ends too: highlight-math.js liftEnd).
  vec4 t12 = T(id, 12);
  sel = t12.x;
  if (t12.x > 0.0) {
    float Ls = max(T(id, 5).z, 1.0), fs = min(${i} * Ls, ${r}.0);
    sel *= (t12.y > 0.5 ? smoothstep(0.0, fs, vAt * Ls) : 1.0) * (t12.z > 0.5 ? smoothstep(0.0, fs, (1.0 - vAt) * Ls) : 1.0);
  }
  if (tc.w > 0.0) {
    vec4 tr = T(id, 9);
    float Lv = max(T(id, 5).z, 1.0), uu = uAt * Lv;
    float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
    col = mix(col, tc.rgb, k * min(tc.w, 1.0));   // (tc.w 2: an opaque cast, the EUS glue; the blood stops inside it, castAt)
  }
  edge = (int(t2.z + 0.5) & ${a}) != 0 ? T(id, 6).rgb : vec3(0.0);
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
  if ((int(t2.z + 0.5) & ${n}) != 0 && useOrgan == 1) {
    float v = 1.0 - ${f} * organK;
    a *= tierGroup[int(t2.x + 0.5)] == 0 ? min(1.0, v / max(1.0 - occl, 1e-3)) : v;
  }
  alpha = a;
}

// A lit vessel's glow band at a pixel d from its lumen (before the cut at other lit lumens): gc, ge its texels 10 and 11 (0 when unlit).
float glowAmt(int id, float d, float wall, float vAt, float aIn, out vec4 gc, out vec4 ge) {
  gc = T(id, 10);
  ge = T(id, 11);
  if (gc.a <= 0.0) return 0.0;
  float e = d - wall, Lh = max(T(id, 5).z, 1.0);
  float ends = (ge.x > 0.0 ? smoothstep(0.0, ge.x, vAt * Lh) : 1.0) * (ge.y > 0.0 ? smoothstep(0.0, ge.y, (1.0 - vAt) * Lh) : 1.0);
  // A stretch (a stent's third): its two ends come as \u2212(1 + u) along the vessel; the glow fades in and out over a few units there.
  if (ge.x < 0.0) {
    float x = vAt * Lh, a = (-ge.x - 1.0) * Lh, b = (-ge.y - 1.0) * Lh, w = min(14.0, 0.2 * Lh);
    ends = (a > 0.5 ? smoothstep(a - w, a + w, x) : 1.0) * (b < Lh - 0.5 ? 1.0 - smoothstep(b - w, b + w, x) : 1.0);
  }
  bool up = ge.w > 5.0;
  float fall = 1.0 - smoothstep(0.0, 12.0 * clamp(up ? ge.w - 10.0 : ge.w, 0.5, 1.3), e);
  return min(0.9, 0.6 * gc.a) * aIn * smoothstep(-0.6, 0.6, e) * fall * ends;
}

// The contact shadow under the tier's shape (premultiplied; 0 without fx or F_SHADOW). Ds: the shadow's signed distance.
vec4 shadowOf(float Ds, float wall, int flags, bool sel, float aa) {
  vec4 c = vec4(0.0);
  if (fx == 1 && (flags & ${o}) != 0) {
    float blur = sel ? 2.4 : 1.3;
    // A faint contact shadow only, so a vessel passing over another still reads as on top.
    float as = 0.55 * shadow.a * (1.0 - smoothstep(-blur * 1.4, blur * 1.4 + aa, Ds - wall));
    c = vec4(shadow.rgb * as, as);
  }
  return c;
}

// A disc cut across (F_RING): 1 where a vessel joins it in the direction g (the unit direction across, toward the wall), 0 round the rest of its rim.
// m: the row's mouth mask (tube texel 3, xyz): 72 bins of 5 degrees from -180 (atan(g.y, g.x)), bin b is bit b % 24 of word b / 24 (24 bits a float
// holds exactly); lobule-zoom.js sets them from the joins. Eased across a bin's width, so a mouth's edge is soft. No data (zeros): 0, a closed rim.
float ringOpen(vec3 m, vec2 g) {
  if (dot(g, g) < 1e-8) return 0.0;
  float a = (atan(g.y, g.x) * 0.15915494 + 0.5) * 72.0 - 0.5;
  float fl = floor(a), w = a - fl;
  int b0 = int(fl) + 72;
  b0 -= 72 * (b0 / 72);
  int b1 = b0 == 71 ? 0 : b0 + 1;
  int w0 = b0 / 24, w1 = b1 / 24;
  float v0 = float((int((w0 == 0 ? m.x : w0 == 1 ? m.y : m.z) + 0.5) >> (b0 - 24 * w0)) & 1);
  float v1 = float((int((w1 == 0 ? m.x : w1 == 1 ? m.y : m.z) + 0.5) >> (b1 - 24 * w1)) & 1);
  return mix(v0, v1, w * w * (3.0 - 2.0 * w));
}

// The tier's shape drawn at a pixel: contact shadow, selection ring, casing, the flat lumen with its light and dark lines, rounding,
// pale wall band, dark lumen's rim, lift, hover and the knock-out ring, premultiplied, before the tier's alpha. D, Ds: the lumen's and the
// shadow's signed distance; R, wall, col, g: the blended radius, casing width, colour and direction; aL: the lumen's coverage.
vec4 tubeShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov,
               vec3 edge, float kn, float kcas, float aa, float aL) {
  float aC = clamp(0.5 - (D - wall) / aa, 0.0, 1.0);
  vec4 c = shadowOf(Ds, wall, flags, sel, aa);
  if (sel) { float ar = ring.a * clamp(0.5 - (D - wall - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
  // (A veiled vessel keeps half its casing: behind an organ the wall's line is the first thing to go.)
  if ((flags & ${n}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  c = (flags & ${a}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC), c) : over(vec4(casing.rgb, 1.0) * (casing.a * cA * aC), c);
  vec3 lum = col;
  float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
  if (fx == 1 && (flags & ${e}) != 0 && aL > 0.0) {
    // A textbook plate, not a rendered tube: a flat lumen with one thin light line along the
    // side toward the light and one thin dark line along the other. The across-tube
    // coordinate (\u22121 \u2026 1, positive on the lit side) places them at a fixed depth in the tube, so
    // they run on through the joins and never slide to the rim as a vessel turns; where the light
    // runs along a vessel they fade out smoothly, and on hairline vessels they are left out.
    float k = dot(g, light);
    float side = rho * sign(k);
    float soft = 0.06 + aa / max(R, 1e-3);
    float thin = smoothstep(1.2, 2.6, R / aa) * smoothstep(0.25, 0.7, abs(k));
    // Both lines by the lumen's own lightness (looks review, the lumen's light lines): on the palest lumens (2 mmHg, nearly white) the light line
    // has no room and read as a white wire, so it falls to half; on the darkest (wine, the dark theme) the dark line went
    // below the ground, so it eases off there too. A mid lumen keeps both at full.
    float aDark = (1.0 - smoothstep(0.1, 0.1 + soft, abs(side + 0.62))) * thin * (0.45 + 0.55 * smoothstep(0.1, 0.32, lumY));
    lum = mix(lum, shadeInk.rgb, clamp(shadeInk.a * 1.3 * aDark, 0.0, 0.5));
    if ((flags & ${t}) != 0) {
      float aLight = (1.0 - smoothstep(0.07, 0.07 + soft, abs(side - 0.5))) * thin * (1.0 - 0.5 * smoothstep(0.72, 0.9, lumY));
      lum = mix(lum, sheenInk.rgb, clamp(sheenInk.a * 0.75 * aLight, 0.0, 0.5));
    }
    // Depth: the tube rounds off toward its wall (cubed, so the middle is untouched), deeper on the side away from the
    // light; then a pale band of wall about a device pixel and a half wide just inside the casing. Both left out on hairlines.
    float body = smoothstep(1.5, 3.5, R / aa);
    float rim = rho * rho * rho;
    lum = lum * (1.0 - body * rim * (0.09 - 0.05 * clamp(k, -1.0, 1.0)));
    float wallW = clamp(0.1 * R, 1.2 * aa, 2.4 * aa);
    float band = smoothstep(-wallW - aa, -wallW, D) * body;
    lum = mix(lum, mix(lum, sheenInk.rgb, 0.45), 0.32 * band * (1.0 - 0.6 * smoothstep(0.72, 0.9, lumY)));
  }
  // A disc cut across (F_RING): the same pale band, the same width and strength, all round just inside the wall; the tube's other shading is left out.
  if (fx == 1 && (flags & ${Me}) != 0 && aL > 0.0) {
    float ringW = clamp(0.1 * R, 1.2 * aa, 2.4 * aa);
    float ringBand = smoothstep(-ringW - aa, -ringW, D) * smoothstep(1.5, 3.5, R / aa) * (1.0 - ringOpen(T(id, 3).xyz, g));   // (none where a vessel joins: it flows in)
    lum = mix(lum, mix(lum, sheenInk.rgb, 0.45), 0.32 * ringBand * (1.0 - 0.6 * smoothstep(0.72, 0.9, lumY)));
  }
  // A dark lumen (the sickest vessels, on the dark looks, where the casing is no darker than the ground) gets a light edge 1 device px wide just
  // inside its wall, by its own lightness, the way the label halo follows its ink (rimInk.a is 0 on the light looks; hairlines are left out).
  lum = mix(lum, rimInk.rgb, rimInk.a * (1.0 - smoothstep(0.2, 0.4, lumY)) * smoothstep(-px - aa, -px, D) * smoothstep(1.5, 3.5, R / aa));
  if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
  if (hov > 0.0) {
    // The hovered vessel, a little brighter in its own hue, easing out toward each end that meets a vessel not lit with it
    // (over a third of its length, at most 60), so the brighter lumen never stops in a hard line at the join.
    vec4 he = T(id, 11);
    float Lh = max(T(id, 5).z, 1.0), fl = min(0.35 * Lh, 60.0);
    float hs = (he.x > 0.0 ? smoothstep(0.0, max(he.x, fl), vAt * Lh) : 1.0) * (he.y > 0.0 ? smoothstep(0.0, max(he.y, fl), (1.0 - vAt) * Lh) : 1.0);
    lum = mix(lum, min(lum * 1.18 + 0.04, vec3(1.0)), hov * hs);
  }
  lum = mix(mix(lum, paperInk.rgb, kn), casing.rgb, casing.a * kcas * kn);
  c = over(vec4(lum, 1.0) * aL, c);
  return c;
}

// The layer's colour, dithered by up to a level (triangular noise, fixed per pixel) before the 8-bit target: the colour and alpha of a soft
// gradient (the glow's falloff) would round at different places and draw thin stripes. q: the pixel in the figure's whole device pixels.
vec4 ditherOut(vec4 o, vec2 q) {
  uvec2 fc = uvec2(ivec2(floor(q)));   // (fixed to the figure, not the screen: it moves with a pan)
  uint hd = fc.x * 0x8da6b343u ^ fc.y * 0xd8163841u;
  hd ^= hd >> 15; hd *= 0x2c1b3c6du; hd ^= hd >> 12; hd *= 0x297a2d39u; hd ^= hd >> 15;
  float dn = (float(hd & 0xffffu) + float(hd >> 16)) / 65535.0 - 1.0;
  o.a = clamp(o.a + dn / 255.0, 0.0, 1.0);
  o.rgb = min(max(o.rgb + dn / 255.0, 0.0), vec3(o.a));
  return o;
}
// The front lumen, as the lumen target holds it. (The row's top bit, LUMEN2: a second lumen is written beside it, so the composite reads
// that target only where one is. Rows stay far below 32768.)
uvec4 packFlow(uint gId, uint gId2, float gS, float gY, float gW, float gB) {
  return uvec4(gId | (gId2 > 0u ? ${c}u : 0u), uint(clamp((gS + S_OFF) * 16.0, 0.0, 65535.0)), uint(clamp((gY + 1.0) * 32767.5, 0.0, 65535.0)),
    (uint(round(clamp(gW, 0.0, 1.0) * 255.0)) << 8u) | (gId2 > 0u ? uint(round(clamp(gB, 0.0, 1.0) * 255.0)) : 0u));
}
// The second lumen near a join, packed (ROW2_BITS): row + 1 | across's top bits, 4 \xD7 (arc + S_OFF) | across's low two bits.
uvec4 packFlow2(uint gId2, float gS2, float gY2) {
  uint gQ2 = uint(clamp((gY2 + 1.0) * 64.0, 0.0, 127.0));   // (the second lumen's across, 0\u2013127: ROW2_BITS)
  return uvec4(gId2 | ((gQ2 >> 2u) << ${l}u), (uint(clamp((gS2 + S_OFF) * 4.0, 0.0, 16383.0)) << 2u) | (gQ2 & 3u), 0u, 0u);
}
`,U={GLOW_K:0,GLOW:1,UP_K:2,UP:3,SHADOW_K:4,SHADOW:5,SHAPE_K:6,SHAPE:7,LIFT:8,RING:9,MARK:10},ft=2,ca=2e-5,fa={CASE1:.2,LUMEN0:.3,LUMEN_H:.5},ct=e=>Number.isInteger(e)?e.toFixed(1):String(e),Cn=({EDGE:e,F_DOTTED:a,F_NOCASE:o,F_SEL:t,F_VEIL:n,VEIL_K:s,tube:r=0})=>{let i=fa,l=`${Object.entries(U).map(([m,u])=>`#define MP_${m} ${u}`).join(`
`)}
#define MESH_WIN ${ft}
uniform int mPass;                     // the pass (MP_*)
uniform int tierNow;                   // the tier it draws
uniform float keyBase;                 // this pass's keys: keyBase + [0, 1) * keyH
uniform float keyH;
uniform float keyShape;                // (the ring) the shape pass's keyBase
const float KEY_BIAS = ${ca};${r?`
uniform int tubeKey;                   // (the Tube) 1 in a glow's depth prepass: a lit vessel's own wall keeps its depth there, so no other glow shows inside it
#if MESH == 2
uniform int tubePart;                  // (the Tube's patch) which part this draw is: 0 the outline's pixels (no lumen), 1 the lumen's, at two depths
uniform highp float zK;                // (the Tube's patch) the lumen level's weight on the z of the patch's vessels: 0 the anatomy, 1 the lobule (tube-geo.js, the strip's uniform of the same name)
uniform highp float hK;                // and on the height: 1 the anatomy, 0.008 the lobule
#endif`:""}`,f=`
  // \u2500\u2500 The mesh pass: this fragment's key (lower wins) as its depth: the prepass keeps the lowest (depth LESS), and the pass draws only the
  // fragment whose key is the kept one (depth EQUAL: the same program on the same inputs makes the same key) \u2500\u2500
  float aaK = px * ${e};
  float occK = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${s} * organK : 0.0;
  float kf = 1.0;
  int kind = mPass >= MP_SHAPE_K ? 2 : mPass >= MP_SHADOW_K ? 1 : 0;   // 0 the glows, 1 the shadow, 2 the shape (and its lift and ring)
#if MESH == 1
  if (mPass == MP_RING) {
    // Where this vessel crosses over another of its tier, the ring of the figure's ground outside its casing, cut into the lumen under it,
    // with its casing across the cut: only where the shape pass left a lumen (the stencil the mark pass set) of a lower z than this one (a
    // lumen's key is its z, f = 0.5 (1 - z): its key over this depth, the depth test LESS).
    int id = sid[0];
    int fl = int(T(id, 2).z + 0.5);
    float wl = T(id, 0).w, reachK = wl + 2.5 * px;
    if (fx != 1 || paperInk.a <= 0.0 || (fl & (${o} | ${a})) != 0 || sd[0] < 0.0 || sd[0] > reachK + aaK) discard;
${r?"":`    gl_FragDepth = keyShape + 0.5 * (1.0 - T(id, 2).y + 1e-4) * keyH;
`}    float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
    vec3 aCol, aEdge;
    vesAttrs(id, su[0], sv[0], p, occK, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
    float fa = clamp(aA, 0.0, 1.0) * ((fl & ${n}) != 0 ? 0.5 : 1.0);
    float kn = fa * paperInk.a * clamp(0.5 - (sd[0] - reachK) / aaK, 0.0, 1.0), kc = fa * clamp(0.5 - (sd[0] - wl) / aaK, 0.0, 1.0);
    if (kn < 0.02) discard;
    vec4 rc = over(vec4(casing.rgb, 1.0) * (casing.a * kc * kn), vec4(paperInk.rgb, 1.0) * kn) * tierAlpha[tierNow] * (tierGroup[tierNow] == 0 ? 1.0 - occK * aOf : 1.0);
    outColor = ditherOut(rc, q); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0);
    return;
  }
  {
    int id = sid[0];
    vec4 t2 = T(id, 2);
    int fl = int(t2.z + 0.5);
    float wl = T(id, 0).w;
    if (kind == 2) kf = sd[0] < 0.0 ? 0.5 * (1.0 - t2.y) : 0.5 + min(sd[0], 255.0) / 512.0;
    else if (kind == 1) {
      float as = shadowOf(sh[0], wl, fl, (fl & ${t}) != 0, aaK).a;
      if (as <= 0.0) discard;
      kf = 1.0 - as / max(0.55 * shadow.a, 1e-4);
    } else {
      float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
      vec3 aCol, aEdge;
      vesAttrs(id, su[0], sv[0], p, occK, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
      vec4 gc, ge;
      float gv = glowAmt(id, sd[0], wl, sv[0], aA, gc, ge);
      if (gc.a <= 0.0 || (ge.w > 5.0) != (mPass >= MP_UP_K)) discard;
      // (Inside its own wall a lit vessel keeps the pixel and draws no glow there: no other lit vessel's band shows in its lumen.)
      if (sd[0] - wl < 0.0) kf = 0.0;
      else if (gv <= 0.0) discard;
      else kf = 1.0 - gv / 0.9;
    }
  }
#else
  {
    // A patch: the tier's shape over the join's members as the tier loop makes it (the tier's own members, and the lower ones it copies
    // near the join), its wall's distance with the fillet; its key a little under its members' strips, so the join is the patch's.
    int mt = 0, ok = -1;
    float zmx = 0.0;
    for (int s = 0; s < MAXS; s++) if (s < n && int(T(sid[s], 2).x + 0.5) == tierNow) { mt |= 1 << s; zmx = max(zmx, T(sid[s], 2).y); }
    if (mt == 0 || jn == 0 || kind == 0) discard;   // (no member of this tier, no join here; the glows are the strips')
    int mm = mt;
    if (tierGroup[tierNow] != 2) for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || (jm[j] & mt) == 0 || jf[j] <= 0.0) continue;
      for (int s = 0; s < MAXS; s++) {
        if (s >= n || (jm[j] & (1 << s)) == 0) continue;
        int lt = int(T(sid[s], 2).x + 0.5);
        if (lt < tierNow && tierGroup[lt] != 2) mm |= 1 << s;
      }
    }
    float Dk = 1e9, Dsk = 1e9;
    for (int s = 0; s < MAXS; s++) if ((mm & (1 << s)) != 0) {
      Dk = min(Dk, sd[s]); Dsk = min(Dsk, sh[s]);
      if ((mt & (1 << s)) != 0 && (ok < 0 || sd[s] < sd[ok])) ok = s;
    }
    for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || jk[j] <= 0.0) continue;
      int jj = jm[j] & mm;
      for (int a = 0; a < MAXS; a++) {
        if ((jj & (1 << a)) == 0) continue;
        for (int b = a + 1; b < MAXS; b++) {
          if ((jj & (1 << b)) == 0) continue;
          int ro = (jt[j] & (1 << a)) != 0 ? 1 : (jt[j] & (1 << b)) != 0 ? 2 : 0;
          bool fa = ro == 1 && (jtf[j] & (1 << a)) != 0, fb = ro == 2 && (jtf[j] & (1 << b)) != 0;
          int ta = fa ? tn[a] : a, tb = fb ? tn[b] : b;
          float kw = fa || fb ? jk[j] * js[j] : 0.0;
          float kk = jk[j] * js[j] * corner(p, sg[ta], sd[ta], sr[ta], sg[tb], sd[tb], sr[tb], ro, kw);
          Dk = min(Dk, smin(sd[a], sd[b], kk));
          Dsk = min(Dsk, smin(sh[a], sh[b], kk));
        }
      }
    }
    if (kind == 2) kf = (Dk < 0.0 ? 0.5 * (1.0 - zmx) : 0.5 + min(Dk, 255.0) / 512.0) - KEY_BIAS;
    else {
      int fl = int(T(sid[ok], 2).z + 0.5);
      float as = shadowOf(Dsk, T(sid[ok], 0).w, fl, (fl & ${t}) != 0, aaK).a;
      if (as <= 0.0) discard;
      kf = 1.0 - as / max(0.55 * shadow.a, 1e-4) - KEY_BIAS;
    }
${r?`    gl_FragDepth = keyBase + (1.0 - (tubePart == 0 ? ${ct(i.CASE1)} + 0.05 * (1.0 - clamp(Dk / 255.0, 0.0, 1.0)) : ${ct(i.LUMEN0)} + ${ct(i.LUMEN_H)} * clamp(zK * zmx + hK, 0.0, 1.0) + 0.02)) * keyH;   // (the Tube's patch writes its own depth: a lumen by its z (then the taller), an outline under every lumen, the nearest wall nearest: docs/recommendations/tube-renderer-lobule-plan.md "The rules")
`:""}  }
#endif
  float kd = keyBase + clamp(kf, 0.0, 1.0) * keyH;${r?"":`
  gl_FragDepth = kd;
  if (mPass == MP_GLOW_K || mPass == MP_UP_K || mPass == MP_SHADOW_K || mPass == MP_SHAPE_K) return;`}`;return{decl:l,key:f,out:`
  // \u2500\u2500 The mesh pass's part of the picture (what the classic shader lays together at the end, for the pass's tier) \u2500\u2500
  if (mPass == MP_GLOW || mPass == MP_UP) {
    vec4 lgm = mPass == MP_UP ? mLgU : mLg;
    ${r?`if (lgm.a <= 0.0 && tubeKey == 1 && sd[0] < swall[0]) { outFlow = uvec4(0u); outFlow2 = uvec4(0u); outColor = vec4(0.0); outDep = vec4(0.0); return; }   // (the depth prepass: inside the lit vessel's own wall the nearest surface, with no colour: the Mesh's key 0 there)
    `:""}if (lgm.a <= 0.0) discard;
    if (tierGroup[tierNow] == 1) lgm *= min(1.0 / max(netAlpha, 1e-3), 1.0 / lgm.a);   // (laid with the network, which is faded as a whole)
    outColor = ditherOut(lgm, q); outDep = vec4(dep ? 1.0 : 0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
    return;
  }
  if (mPass == MP_SHADOW) {
    if (mSh.a < 0.002) discard;
    outColor = ditherOut(mSh, q); outDep = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
    return;
  }
${r?`#if MESH == 2
  if (mPass >= MP_SHAPE_K && (tubePart == 0) == (mLum || mD < 0.0)) discard;   // (the Tube's patch: its outline is drawn under every lumen, its lumen, and every pixel inside its shape, over them: each pixel in one draw)
#endif
`:""}  if (mPass == MP_LIFT) {
    vec4 lc = mC * mWs;
    if (lc.a < 0.002) discard;
    outColor = ditherOut(lc, q); outDep = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
    return;
  }
  // (The shape: a pixel it leaves clear is left as it is; one it covers outside a lumen hides the stream under it.)
  ${r?`if (tubeKey == 2 && !mLum && mC.a < 0.002 && mD < 0.0) { outFlow = uvec4(0u); outFlow2 = uvec4(0u); outColor = vec4(0.0); outDep = vec4(0.0); return; }   // (a shape prepass: a patch leaves clear the pixels inside its shape where a copy of this tier's vessel is drawn by a higher tier (keep 0), yet keeps their depth: the vessel's own strips under it must not draw them whole, as the Mesh's key pass leaves them to the patch)
  `:""}if (!mLum && mC.a < 0.002) discard;
  outColor = ditherOut(mC, q);
  outDep = vec4(dep ? 1.0 : 0.0);
  bool mfl = gId > 0u && gW > 0.01;
  outFlow = mfl ? packFlow(gId, gId2, gS, gY, gW, gB) : uvec4(0u);
  outFlow2 = mfl && gId2 > 0u ? packFlow2(gId2, gS2, gY2) : uvec4(0u);
  return;`}},Pn=e=>`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(location=0) in vec2 aC;         // the quad's corner (-1 \u2026 1)
layout(location=1) in vec4 aM0;        // its vessels' rows (-1 none), the first four (per instance)
layout(location=2) in vec4 aM1;        // the next four
layout(location=3) in vec2 aG;         // its joins: the first in pjTex, their count
uniform mat3 world;
uniform vec2 size;
uniform vec2 lOff;
uniform int morphOn;
uniform int joinBase;
uniform float reachU;
uniform float zU;                      // (the Tube) the patch's depth, from its band: 2 * (base + (1 - level) * H) - 1; the Mesh never sets it (0), and writes gl_FragDepth
uniform highp sampler2D pjTex;
${e}
vec4 JT(int j) { int t = joinBase + j; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
flat out vec4 vM0;
flat out vec4 vM1;
flat out ivec4 vWa;
flat out ivec4 vWb;
flat out ivec4 vWa2;
flat out ivec4 vWb2;
flat out ivec4 vR;
flat out int vNJ;
void main() {
  int j0 = int(aG.x + 0.5), jc = min(int(aG.y + 0.5), ${me});
  vR = ivec4(0, 0, j0, jc); vNJ = jc; vM0 = aM0; vM1 = aM1;
  // (Its joins as this frame has them: between the views, the frame's (JT), as the fragment shader reads them.)
  vec3 J[${me}];
  vec2 lo = vec2(1e9), hi = vec2(-1e9);
  for (int k = 0; k < ${me}; k++) {
    J[k] = vec3(0.0, 0.0, -1.0);
    if (k >= jc) continue;
    vec4 A = texelFetch(pjTex, ivec2(0, j0 + k), 0);
    if (morphOn >= 1) A = JT(int(A.x + 0.5));
    J[k] = A.xyz;
    if (!(A.z > 0.0)) continue;
    lo = min(lo, A.xy - A.z); hi = max(hi, A.xy + A.z);
  }
  // (Each vessel's segments within any join's reach, and the reach past it anything is drawn.)
  ivec4 a = ivec4(0), b = ivec4(-1), a2 = ivec4(0), b2 = ivec4(-1);
  for (int m = 0; m < 8; m++) {
    float mv = m < 4 ? aM0[m] : aM1[m - 4];
    if (mv < -0.5) continue;
    int id = int(mv + 0.5), lw = N_SAMPLES, hw = -1;
    for (int i = 0; i < N_SAMPLES; i++) {
      vec2 q = PT(id, i);
      float d = 1e9;
      for (int k = 0; k < ${me}; k++) if (J[k].z > 0.0) d = min(d, length(q - J[k].xy) - J[k].z);
      if (d - mRW(id, i, 0.0) < reachU + 1.0) { lw = min(lw, i); hw = max(hw, i); }
    }
    if (hw < 0) continue;
    int wa = max(0, lw - 1), wb = min(N_QUADS - 1, hw);
    if (m < 4) { a[m] = wa; b[m] = wb; } else { a2[m - 4] = wa; b2[m - 4] = wb; }
  }
  vWa = a; vWb = b; vWa2 = a2; vWb2 = b2;
  if (!(hi.x > lo.x)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 d = world * vec3(mix(lo, hi, aC * 0.5 + 0.5), 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, zU, 1.0);
}`,Wn=`#version 300 es
precision mediump float;
uniform sampler2D uT;
uniform float uK;
out vec4 o;
void main() { o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0) * uK; }`;var ht=(e,a)=>e*64+a,ao=.25,no=.5,Be=(e,a)=>-(2+e*64+a);var j=e=>Number.isInteger(e)?`${e}.0`:String(e),ha=`float joinAlong(int id, float u) {
  float ui = u * 63.0;
  int i0 = min(int(ui), 62);
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`,so=e=>{if(e!==64)throw new Error("tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64");let a=e-1;return`// ---- a row's end on another row, worked out once a vertex (tube-join-glsl.js) ----
uniform int joinCut;                   // 0: no row has an end (vEnd is -1) and none of the join work runs; 1: the figure
flat out vec4 vJ0;                     // the start's end data: an open end: the trunk's chord a, b; a continuation: the end point and the plane's unit normal
flat out vec4 vJ1;                     // the end's
flat out vec4 vJK;                     // the start's (trunk radius, mode), the end's (radius, mode): mode 0 cut, 1 fade, 2 plane, -1 none
flat out vec4 vC0;                     // the other row's colour at the start's end (rgb), and a continuation's partner's tier (w; -1 otherwise)
flat out vec4 vC1;                     // and at the end's
${ha}
// The row's colour at u as vesAttrs gives it, the recoloured stretch included (texels 8 and 9: the HVPG's wedged vein, a sclerosant column, a cast, the wale). Without the
// stretch a row tinted up to its seam blended toward the partner's UNtinted colour there (13 Nov 2026, Mohammad: the WHVP colour "interrupted at the joint": a pale blue band
// across the right hepatic vein where the tinted rows meet, each row mixing in the other's plain blue over 3 radii).
vec3 joinColour(int row, float u) {
  vec3 col = mix(texelFetch(tube, ivec2(0, row), 0).rgb, texelFetch(tube, ivec2(1, row), 0).rgb, joinAlong(row, u));
  vec4 tc = texelFetch(tube, ivec2(8, row), 0);
  if (tc.w > 0.0) {
    vec4 tr = texelFetch(tube, ivec2(9, row), 0);
    float Lv = max(texelFetch(tube, ivec2(5, row), 0).z, 1.0), uu = u * Lv;
    float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
    col = mix(col, tc.rgb, k * min(tc.w, 1.0));
  }
  return col;
}
// A row's own fade at p (veins-mesh-glsl.js vesAttrs: a dip, a radial or a linear fade along it, texels 3 and 4): the alpha the partner shows at the seam, not its flat row alpha (the SVC fades to 0.3 as it enters the atrium: the cava's ramp ended on a step, 10 Nov).
float joinFade(int row, vec2 p) {
  vec4 t3 = texelFetch(tube, ivec2(3, row), 0), t4 = texelFetch(tube, ivec2(4, row), 0);
  if (t4.w > 2.5) {
    vec2 dd = t3.zw - t3.xy;
    float v = clamp(dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
    return v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));
  }
  if (t4.w > 1.5) {
    float v = length(p - t3.xy) / max(t3.z, 1e-3);
    return v < 0.45 ? mix(t4.y, t4.z, v / 0.45) : mix(t4.z, 0.0, clamp((v - 0.45) / 0.55, 0.0, 1.0));
  }
  if (t4.w > 0.5) {
    vec2 dd = t3.zw - t3.xy;
    float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
    return mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
  }
  return 1.0;
}
// The partner row's tier, veil and whole flags and alpha (with its fade at the seam point at), packed in one float (tier + 32 veil + 64 whole + 128 alpha8): what the fragment needs to find its opacity there.
float joinPack(int row, vec2 at) {
  vec4 t1 = texelFetch(tube, ivec2(1, row), 0), t2 = texelFetch(tube, ivec2(2, row), 0);
  int fl = int(t2.z + 0.5);
  return float(int(t2.x + 0.5) + ((fl & 128) != 0 ? 32 : 0) + ((fl & 256) != 0 ? 64 : 0) + 128 * int(clamp(t1.w * joinFade(row, at), 0.0, 1.0) * 255.0 + 0.5));
}
float joinPackColour(vec3 c) { return dot(floor(clamp(c, 0.0, 1.0) * 255.0 + 0.5), vec3(65536.0, 256.0, 1.0)); }
// A trunk's arm from its sample sm: len along its own samples (spacing sp) in direction dir, no further than its end unless the trunk runs on straight there (thru: then on
// along the next row's own samples, pq = that row * 2 + (1 if it meets the seam with its end) + 1; with none, on in a line). (13 Nov 2026: the straight line left the SMV where
// it bends past the seam of its two rows, 1.26 units at the arm's end, and the mesocaval and Rex mouths dropped a band outside the real wall: the SMV's outline showed as a sliver.)
vec2 joinArm(int tr, int sm, int dir, float sp, float len, bool thru, int pq) {
  int lim = dir > 0 ? ${a} - sm : sm;
  float have = float(lim) * sp;
  float t = min(len, have) / sp;
  int k = min(int(t), max(lim - 1, 0));
  vec2 q = mix(PT(tr, sm + dir * k), PT(tr, sm + dir * min(k + 1, lim)), t - float(k));
  if (thru && len > have) {
    int en = sm + dir * lim;
    vec2 e0 = PT(tr, en);
    if (pq > 0) {
      int pr = (pq - 1) / 2, ps = (pq - 1) % 2 == 0 ? 0 : ${a}, pd = ps == 0 ? 1 : -1;
      float s2 = max(length(PT(pr, ps + pd) - PT(pr, ps)), 1e-4), t2 = min((len - have) / s2, ${j(a)});
      int k2 = min(int(t2), ${a-1});
      return e0 - PT(pr, ps) + mix(PT(pr, ps + pd * k2), PT(pr, ps + pd * (k2 + 1)), t2 - float(k2));
    }
    vec2 o = e0 - PT(tr, clamp(en - dir * 2, 0, ${a}));
    float lo = length(o);
    q = e0 + (lo > 1e-6 ? o / lo : vec2(0.0)) * (len - have);
  }
  return q;
}
// Which arm of an open end the next row's samples are for (joinArm's pq): the one that runs on past the trunk's end; both: the nearer end's. -1, 1 or 0 (none).
int joinThruSide(bool tb, bool tf, int sm) { return tb && tf ? (sm >= ${64/2} ? 1 : -1) : tf ? 1 : tb ? -1 : 0; }
vec4 joinOne(int id, float e, bool atStart, int pq, out vec2 K, out vec4 C) {   // (pq: joinArm's next row, for the arm joinThruSide names)
  K = vec2(-1.0, -1.0);
  C = vec4(0.0, 0.0, 0.0, -1.0);   // (w: a continuation's partner's tier, for the opacity ramp; x the colour, packed; yz an open end's knee)
  if (e > -0.5) {
    int ei = int(e + 0.1), tr = ei / 64, sm = ei % 64;
    float fe = e - float(ei);   // (.25: the trunk runs on into another row at its start, .5: at its end, .75: both: its chord reaches on there)
    bool tb = (fe > 0.2 && fe < 0.3) || fe > 0.7, tf = fe > 0.45;
    vec2 c = PT(tr, sm);
    int s0 = max(sm - 1, 0), s1 = min(sm + 1, ${a});
    float sp = max(length(PT(tr, s1) - PT(tr, s0)) / float(max(s1 - s0, 1)), 1e-4);
    float r = max(texelFetch(rad, ivec2(sm, tr), 0).r, MIN_RADIUS);
    float hl = max(sp, ${j(2)} * r);
    // (The arms reach no further than the trunk does: past the trunk's own end nothing of it is drawn, and a branch cut there leaves a black wedge, 10 Nov, the portal fork. They follow its samples, so a trunk that bends within the reach, as the Circuit's cava does, is cut where it is, not along its tangent.)
    K = vec2(r, texelFetch(tube, ivec2(2, id), 0).x > texelFetch(tube, ivec2(2, tr), 0).x + 0.5 ? 1.0 : 0.0);
    float fk = sm == ${a} && !tf ? 2.0 : sm == 0 && !tb ? 3.0 : 1.0;
    C = vec4(joinPackColour(joinColour(tr, float(sm) / ${a}.0)), c, -(fk + 4.0 * (joinPack(tr, c) + 1.0)));   // (w: minus the flag (1: none, 2: the trunk's own end, 3: its start) plus four times (the trunk's pack + 1): the trunk's opacity, for the branch's fade into a fainter trunk)   // (w: the trunk's own end: with its cap gone the arms end flat there, so the branch is drawn beyond it)
    int ts = joinThruSide(tb, tf, sm);
    return vec4(joinArm(tr, sm, -1, sp, hl, tb, ts < 0 ? pq : 0), joinArm(tr, sm, 1, sp, hl, tf, ts > 0 ? pq : 0));
  }
  if (e < -1.5) {
    int k = int(-e + 0.5) - 2, pr = k / 64, ps = k % 64;
    vec2 E = PT(id, atStart ? 0 : ${a});
    vec2 dO = E - PT(id, atStart ? 2 : ${a-2});
    if (pr == id) {   // a trunk's own end that branches leave from, with no row carrying on: it ends flat, its round cap gone (the branches' own caps and the web make the fork)
      float l0 = length(dO);
      if (l0 > 1e-6) { K = vec2(0.0, 2.0); C = vec4(joinPackColour(joinColour(id, float(ps) / ${a}.0)), 0.0, 0.0, joinPack(id, E)); return vec4(E, dO / l0); }
      return vec4(0.0);
    }
    vec2 dP = PT(pr, ps) - PT(pr, ps == 0 ? 2 : ${a-2});
    float lo = length(dO), lp = length(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      vec2 m = dO / lo - dP / lp;
      float lm = length(m);
      if (lm > 1e-4) {
        vec2 f = -dP / lp, o = dO / lo;
        K = vec2(atan(o.x * f.y - o.y * f.x, dot(o, f)) + 0.0, 2.0);   // (K.x: the turn from this row's way out to the next row's way on, which the cel tones' light direction follows across the join)
        C = vec4(joinPackColour(joinColour(pr, float(ps) / ${a}.0)), 0.0, 0.0, joinPack(pr, E));
        return vec4(E, m / lm);
      }
    }
  }
  return vec4(0.0);
}
// thru: the instance's aRow.w: over 4.5, 5 + the start's next row (joinArm's pq) + 4096 * the end's (tube-data.js tubeBuckets); otherwise the row's kind.
void joinOut(int id, vec2 ends, float thru) {
  vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0); vC0 = vec4(0.0); vC1 = vec4(0.0);
  if (ends.x != -1.0 || ends.y != -1.0) {
    vec2 k0, k1;
    vec4 c0, c1;
    int tq = thru > 4.5 ? int(thru + 0.5) - 5 : 0;
    vJ0 = joinOne(id, ends.x, true, tq % 4096, k0, c0);
    vJ1 = joinOne(id, ends.y, false, tq / 4096, k1, c1);
    vJK = vec4(k0, k1);
    vC0 = c0; vC1 = c1;
  }
}
`},ro=`uniform int joinCut;
flat out vec4 vJ0;
flat out vec4 vJ1;
flat out vec4 vJK;
flat out vec4 vC0;
flat out vec4 vC1;`,io="vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0); vC0 = vec4(0.0); vC1 = vec4(0.0);",Se=`flat in vec2 vEnd;                     // (the row's ends, which the vertex shaders hand on; the decisions are in vJ0, vJ1, vJK)
flat in vec4 vJ0;                      // the start's end data (tube-join-glsl.js)
flat in vec4 vJ1;                      // the end's
flat in vec4 vJK;                      // the start's (trunk radius, mode) and the end's
flat in vec4 vC0;                      // the other row's colour at the start's end
flat in vec4 vC1;                      // and the end's`,Re=e=>{if(e!==64)throw new Error("tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64");let a=e-1;return`// ---- a row's end on another row (tube-join-glsl.js): the decisions, from the vertex shader's flat data; no reads ----
struct JoinEnd { bool drop; float fl; float fo; float wc; vec3 col; float pt; float rs; float rot; vec2 tg; float tw; float gp; };   // gp: a cut end's signed gap to its trunk's wall (negative inside it), 1000 for none: the outline's pixels inside the wall are the trunk's (lean shader)   // tg: the trunk's tone vector here (offset from its axis / its radius), tw its share   // wc: the share of the other row's colour col this pixel takes
vec3 joinUnpackColour(float v) {
  float r = floor(v / 65536.0), g = floor((v - r * 65536.0) / 256.0);
  return vec3(r, g, v - r * 65536.0 - g * 256.0) / 255.0;
}
float joinSeg(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  return length(p - a - ba * clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0));
}
vec2 joinNear(vec2 p, vec2 a, vec2 b, bool line) {   // (the point of the segment a b nearest p; line: of its whole line)
  vec2 ba = b - a;
  float h = dot(p - a, ba) / max(dot(ba, ba), 1e-8);
  return a + ba * (line ? h : clamp(h, 0.0, 1.0));
}
JoinEnd joinEnd(float vI, vec4 vJ0, vec4 vJ1, vec4 vJK, vec4 vC0, vec4 vC1, vec2 p, float R, float px) {
  JoinEnd j;
  j.drop = false; j.fl = 1.0; j.fo = 1.0; j.wc = 0.0; j.col = vec3(0.0); j.pt = -1.0; j.rs = 0.0; j.rot = 0.0; j.tg = vec2(0.0); j.tw = 0.0; j.gp = 1000.0;
  bool atStart = vI < 24.0;
  if (!atStart && !(vI > ${a-24}.0)) return j;
  vec4 J = atStart ? vJ0 : vJ1;
  vec2 K = atStart ? vJK.xy : vJK.zw;
  if (K.y < -0.5) return j;
  float cw = max(${j(3)} * R, ${j(8)});
  vec4 CC = atStart ? vC0 : vC1;
  j.col = joinUnpackColour(CC.x);
  if (K.y > 1.5) {
    j.pt = CC.w;
    float s = dot(p - J.xy, J.zw);
    if (s > ${j(.25)} * px) {
      // The outer corner of a bend is not the other row's: between this row's end line (across its way out) and the next row's start line (across its way on) lies a wedge
      // neither lumen covers, which the two end caps, one circle, round off. The bisector m is this row's way out turned by half the bend; undo that turn for the two ways.
      float ha = 0.5 * K.x, ch = cos(ha), sh = sin(ha);
      vec2 qe = p - J.xy, wo = vec2(ch * J.z + sh * J.w, -sh * J.z + ch * J.w), wf = vec2(ch * J.z - sh * J.w, sh * J.z + ch * J.w);
      if (!(dot(qe, wo) > 0.0 && dot(qe, wf) < 0.0)) { j.drop = true; return j; }
    }
    j.wc = 0.5 * (1.0 - smoothstep(0.0, cw, -s));
    j.rs = smoothstep(-${j(3)} * R, 0.0, s);
    j.rot = K.x * 0.5 * (1.0 - smoothstep(0.0, max(${j(4)} * R, ${j(16)}), -s));
    return j;
  }
  vec2 ba = J.zw - J.xy;
  float gap = min(joinSeg(p, J.xy, CC.yz), joinSeg(p, CC.yz, J.zw)) - K.x;   // (the trunk about the sample: its two arms from the knee)
  // (A trunk's own end, its cap gone: past it the pixel is the branch's, whatever the arms' round end says.)
  float wq = -CC.w, pk = floor(wq / 4.0) - 1.0, fw = -(wq - 4.0 * floor(wq / 4.0));   // (the flag, and the trunk's pack: see joinOne)
  bool beyond = false;
  if (fw < -1.5) {
    vec2 dn = ba / max(length(ba), 1e-6);
    beyond = fw < -2.5 ? dot(p - J.xy, dn) < 0.0 : dot(p - J.zw, dn) > 0.0;
  }
  // (K.y 1: a branch in a higher tier than its trunk is cut at the wall as any other, but its edge is one device pixel soft, and the trunk shows through that pixel: it lies in its own tier's pass.)
  bool soft = K.y > 0.5;
  j.gp = beyond ? 1000.0 : gap;   // (past a trunk's own end the pixel is the branch's, outline too)
  if (gap < (soft ? -px : -${j(4)} * px) && !beyond) { j.drop = true; return j; }
  // (A trunk much narrower than the branch \u2014 a small tributary the join happens to mark as its trunk \u2014 does not recolour or flatten the wide branch: the share rk, and the reach by the narrower of the two.)
  float rk = smoothstep(0.3, 0.9, K.x / max(R, 1e-3)), rn = min(R, K.x);
  j.wc = (1.0 - smoothstep(0.0, max(${j(3)} * rn, ${j(8/2)}), gap)) * rk;
  // (The cel tones near the mouth are the trunk's: its axis point nearest the pixel (past a trunk's flat end, on its last arm's line, so its bands run straight on), the offset over its radius;
  // its share falls from the wall, or from the end's plane, to none JOIN_MOUTH_R radii out.)
  vec2 nA = joinNear(p, J.xy, CC.yz, beyond && fw > -2.5), nB = joinNear(p, CC.yz, J.zw, beyond && fw < -2.5);
  bool onA = beyond ? fw > -2.5 : length(p - nA) < length(p - nB);
  vec2 nt = onA ? nA : nB;
  j.tg = (p - nt) / max(K.x, 1e-3);
  float tgap = beyond ? max(length(p - nt) - K.x, fw < -2.5 ? -dot(p - J.xy, normalize(ba)) : dot(p - J.zw, normalize(ba))) : gap;
  j.tw = (1.0 - smoothstep(0.0, max(${j(3)} * rn, ${j(8)}), tgap)) * rk;
  if (soft && !beyond) { j.fl = smoothstep(-px, 0.0, gap); j.fo = j.fl; }
  // (A branch on a fainter trunk eases its opacity to the trunk's over its last JOIN_FADE_N samples: joinRamp, in the lean and the lumen shaders, takes j.pt and j.rs.)
  j.pt = pk;
  j.rs = 1.0 - smoothstep(0.0, ${j(14)}, atStart ? vI : ${a}.0 - vI);
  return j;
}
// The cel tones' direction across the vessel, turned toward the next row's across a continuation and handed to the trunk's own field at a cut branch's mouth: one tone field over
// the join. rho: the pixel's depth across its own vessel (celTones's), which celTones multiplies back in, so rho * the result is mix(rho * own, the trunk's tg, tw).
vec2 joinTone(vec2 g, JoinEnd j, float rho) {
  float c = cos(j.rot), s = sin(j.rot);
  return mix(vec2(c * g.x - s * g.y, s * g.x + c * g.y), j.tg / max(rho, 1e-4), j.tw);
}
`};var $e=e=>`float joinRamp(JoinEnd j, float ownEff, float occl) {
  if (j.pt < 0.0) return 1.0;
  int n = int(j.pt + 0.5);
  int tp = n & 31;
  float pa = float(n >> 7) / 255.0;
  if (((n >> 5) & 1) != 0 && useOrgan == 1) {
    float v = 1.0 - ${j(e)} * organK;
    pa *= tierGroup[tp] == 0 ? min(1.0, v / max(1.0 - occl, 1e-3)) : v;
  }
  float pe = pa * tierAlpha[tp] * (tierGroup[tp] == 0 ? 1.0 - occl * (((n >> 6) & 1) != 0 ? 0.0 : 1.0) : 1.0);
  return mix(1.0, min(1.0, pe / max(ownEff, 1e-3)), j.rs);
}
`;var lo=(e,a,o)=>e&&a?o>=64/2?1:-1:a?1:e?-1:0,co=(e,a)=>e*2+(a===0?0:1)+1;var mt=6,da=7,ie=11,pt=mt+E+mt,Ie=6,ve={GRID:0,DOME:1,TRAP:2},ua=pt*ie,vt=1+Ie,wt=ua,xt=wt+(E-2)*vt,dt=xt+4*K,je={GLOW0:.02,GLOW_WALL:.07,GLOW1:.08,CASE0:.1,CASE1:.2,LUMEN0:.3,LUMEN_H:.5,PATCH:.95},oe=je,ut={A:.35,L0:.26,H:.035};function Hn(e){let a=new Float32Array(dt*4),o=(s,r,i,c,l)=>{a[s*4]=r,a[s*4+1]=i,a[s*4+2]=c,a[s*4+3]=l};for(let s=0;s<pt;s++)for(let r=0;r<ie;r++)o(s*ie+r,ve.GRID,s,r,0);for(let s=1;s<E-1;s++){let r=wt+(s-1)*vt;o(r,ve.DOME,s,0,0);for(let i=0;i<Ie;i++)o(r+1+i,ve.DOME,s,1,i)}for(let s=0;s<K;s++)for(let r=0;r<4;r++)o(xt+4*s+r,ve.TRAP,s,r&1,r>>1);let t=[];for(let s=0;s<pt-1;s++)for(let r=0;r<ie-1;r++){let i=s*ie+r,c=i+1,l=i+ie,f=l+1;t.push(i,l,c,c,l,f)}for(let s=1;s<E-1;s++){let r=wt+(s-1)*vt;for(let i=0;i<Ie;i++)t.push(r,r+1+i,r+1+(i+1)%Ie)}for(let s=0;s<K;s++){let r=xt+4*s,i=r+1,c=r+2,l=r+3;t.push(r,c,i,i,c,l)}if(dt>=65536)throw new Error("tube-geo: the vertex count does not fit a Uint16Array index");let n=new Float32Array(e);for(let s=0;s<e;s++)n[s]=s;return{attr:a,index:Uint16Array.from(t),nVerts:dt,nIndex:t.length,rows:n}}var Y=e=>Number.isInteger(e)?e.toFixed(1):String(e),ze=(e,a=1,o="")=>`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
invariant gl_Position;                 // (so the depth prepass and the colour pass agree exactly)
layout(location=0) in vec4 aV;         // (kind, ring or sample, across, corner): tube-geo.js tubeIndex
layout(location=1) in vec4 aRow;       // per instance: (row, endStart, endEnd, kind + 2). A one-float buffer reads (row, 0, 0, 1): w = 1 is "no ends"
layout(location=2) in vec4 aMouthA;    // per instance: the first four mouth codes (tube-data.js mouthCode: 2 + 2 * a branch row + 1 for its last sample; under 1.5 none; an unset attribute reads (0, 0, 0, 1))
layout(location=3) in vec4 aMouthB;    // and the next four
uniform mat3 world;                    // world \u2192 device pixels
uniform vec2 size;
uniform vec2 lOff;
uniform highp sampler2D tube;
uniform int mPass;
uniform float padU;                    // world units past the casing the pass can draw (a glow pass: the glow's reach)
uniform float selPad;                  // and more for a selected vessel
uniform float tubeBase;                // this pass pair's band of depth: tubeBase + [0, 1) * tubeH
uniform float tubeH;
uniform float hRef;                    // the height (world) that is the top of the lumen's levels
uniform float celK;                    // a glow's reach, as a multiple of the row's casing width
uniform float aaPad;                   // two device pixels, world; a shape's skirt is the outline plus this
uniform float zK;                      // the lumen level's weight on the row's z (0: the anatomy; 1: the lobule, ordered by z)
uniform float hK;                      // and on the height (1: the anatomy; 0.008 in the lobule)
${e}
const int T_CAP = ${mt};
const int T_ARC = ${da};
const int T_ACROSS = ${ie};
const int T_HEX = ${Ie};
const int T_DOME = ${ve.DOME};
const int T_TRAP = ${ve.TRAP};
const float L_GLOW0 = ${Y(oe.GLOW0)};
const float L_GLOW_WALL = ${Y(oe.GLOW_WALL)};
const float L_GLOW1 = ${Y(oe.GLOW1)};
const float L_CASE0 = ${Y(oe.CASE0)};
const float L_CASE1 = ${Y(oe.CASE1)};
const float L_LUMEN0 = ${Y(oe.LUMEN0)};
const float L_LUMEN_H = ${Y(oe.LUMEN_H)};
const float L_PATCH = ${Y(oe.PATCH)};
const float L_FADE_A = ${Y(ut.A)};
const float L_FADE0 = ${Y(ut.L0)};
const float L_FADE_H = ${Y(ut.H)};
${o?`${o}
`:""}out float vI;
flat out int vRow;
out float vD;                          // signed distance from the lumen's wall (negative inside, 0 on the wall, positive in the skirt), world units
out vec2 vG;                           // the offset from the centreline point to this point (not unit)
out float vRad;                        // the lumen's radius at this ring or sample
flat out vec2 vEnd;                    // the vessel this row ends on at its start (x) and end (y): row * 64 + the sample there, or -1
flat out vec4 vMouthA;                 // the branches that end on this row's side: its outline is left open across them (tube-lean-glsl.js mouthOpen)
flat out vec4 vMouthB;
${so(E)}// The across offset d and the level f of across column ac, for a ring whose half tube has radius rc.
vec2 tubeAcross(int ac, float rc, float w, float hr, bool glow, float zz) {
  if (ac == 0) return vec2(-(rc + w), glow ? L_GLOW0 : L_CASE0);
  if (ac == 1) return vec2(-rc, glow ? L_GLOW_WALL : L_CASE1);
  if (ac == T_ACROSS - 2) return vec2(rc, glow ? L_GLOW_WALL : L_CASE1);
  if (ac == T_ACROSS - 1) return vec2(rc + w, glow ? L_GLOW0 : L_CASE0);
  float th = (float(ac - 2) / float(T_ARC - 1) - 0.5) * M_PI;
  float h = rc * cos(th);
  return vec2(rc * sin(th), glow ? L_GLOW1 : L_LUMEN0 + L_LUMEN_H * clamp(zz + hK * clamp(h / hr, 0.0, 1.0), 0.0, 1.0));
}
// The skirt's width at a vertex of a ring or sample with lumen radius rw: a shape pass's is the outline (celShade's rule) plus aaPad, plus the selection's;
// a glow pass's is the row's (wr).
float tubeW(int id, int i, bool glow, float wr, float sp) {
  if (glow) return wr;
  float px = 0.5 * aaPad;
  return clamp(0.14 * mRW(id, i, 0.0), 1.5 * px, 3.0 * px) + aaPad + sp;
}
// Any vertex of the instance: (x, y) in world units, z the level; also writes vD, vG and vRad.
vec3 tubePlace(int id, vec4 a, float wr, float sp, float hr, bool glow, float zz) {
  int kind = int(a.x + 0.5), r = int(a.y + 0.5), ac = int(a.z + 0.5), cn = int(a.w + 0.5);
  if (kind == T_TRAP) {
    int e = r + cn;
    float wa = tubeW(id, r, glow, wr, sp), wb = tubeW(id, r + 1, glow, wr, sp), wd = max(wa, wb), we = cn == 0 ? wa : wb;
    float rwe = mRW(id, e, 0.0);
    vec2 q = PT(id, e);
    float lv = glow ? L_GLOW0 : L_CASE0;
    vRad = rwe;
    if (!(mBevelled(id, r, wd) || mBevelled(id, r + 1, wd))) { vG = vec2(0.0); vD = -rwe; return vec3(q, lv); }
    vec2 o = mRW(id, e, we) * mNrm(mSeg(id, r, wd), ac == 1 ? 1.0 : -1.0);
    vG = o; vD = we;
    return vec3(q + o, lv);
  }
  if (kind == T_DOME) {
    vec2 p = PT(id, r);
    float rw = mRW(id, r, 0.0), w = tubeW(id, r, glow, wr, sp);
    vRad = rw;
    if (ac == 0) { vG = vec2(0.0); vD = -rw; return vec3(p, glow ? L_GLOW1 : L_LUMEN0 + L_LUMEN_H * clamp(zz + hK * clamp(rw / hr, 0.0, 1.0), 0.0, 1.0)); }
    float lv = glow ? L_GLOW0 : L_CASE0;
    if (!mDiscOn(id, r, w)) { vG = vec2(0.0); vD = -rw; return vec3(p, lv); }
    float th = 2.0 * M_PI * float(cn) / float(T_HEX);
    float rr = (rw + w) / cos(M_PI / float(T_HEX));
    vec2 o = rr * vec2(cos(th), sin(th));
    vG = o; vD = rr - rw;
    return vec3(p + o, lv);
  }
  int c = 0, i;
  if (r < T_CAP) { c = T_CAP - r; i = 0; }
  else if (r >= T_CAP + N_SAMPLES) { c = r - (T_CAP + N_SAMPLES) + 1; i = N_SAMPLES - 1; }
  else i = r - T_CAP;
  vec2 p = PT(id, i);
  float rw = mRW(id, i, 0.0), w = tubeW(id, i, glow, wr, sp);
  vRad = rw;
  if (c > 0) {
    float ph = float(c) / float(T_CAP) * M_PI / 2.0;
    MSeg g = mSeg(id, i == 0 ? 0 : N_QUADS - 1, w);
    float rc = rw * cos(ph), e = rw * sin(ph);
    vec2 df = tubeAcross(ac, rc, w, hr, glow, zz);
    float sd = df.x < 0.0 ? -1.0 : 1.0;
    vec2 n = sd * mNrm(g, sd), o = i == 0 ? -g.t : g.t;
    vec2 og = o * e + df.x * n;
    vG = og; vD = length(og) - rw;
    return vec3(p + og, df.y);
  }
  vec2 df = tubeAcross(ac, rw, w, hr, glow, zz);
  float sd = df.x < 0.0 ? -1.0 : 1.0;   // (each side its own normal, as the Mesh strip: see place() in the JS twin)
  vec2 n;
  if (i == 0 || i == N_SAMPLES - 1) n = sd * mNrm(mSeg(id, i == 0 ? 0 : N_QUADS - 1, w), sd);
  else {
    MSeg sa = mSeg(id, i - 1, w), sb = mSeg(id, i, w);
    float W = mRW(id, i, w);
    vec2 mp, mm;
    if (mMitreAB(sa, sb, W, 1.0, mp) && mMitreAB(sa, sb, W, -1.0, mm)) n = sd > 0.0 ? mp : -mm;
    else {
      vec2 na = mNrm(sa, sd), av = 0.5 * (na + mNrm(sb, sd));
      float al = length(av);
      n = sd * (al < 1e-6 ? na : av / al);
    }
  }
  vG = df.x * n; vD = abs(df.x) - rw;
  return vec3(p + vG, df.y);
}
// The row's alpha at p, as vesAttrs reads it (its base alpha, then a dip, a radial fade or a linear one; the veil is the fragment shader's).
float tubeAlpha(int id, vec2 p) {
  vec4 t1 = texelFetch(tube, ivec2(1, id), 0), t3 = texelFetch(tube, ivec2(3, id), 0), t4 = texelFetch(tube, ivec2(4, id), 0);
  float a = t1.w;
  vec2 dd = t3.zw - t3.xy;
  if (t4.w > 2.5) {
    float v = clamp(dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
    a *= v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));
  } else if (t4.w > 1.5) {
    float v = length(p - t3.xy) / max(t3.z, 1e-3);
    a *= v < 0.45 ? mix(t4.y, t4.z, v / 0.45) : mix(t4.z, 0.0, clamp((v - 0.45) / 0.55, 0.0, 1.0));
  } else if (t4.w > 0.5) {
    float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
    a *= mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
  }
  return a;
}
// A lumen level eases into the low band as the vessel fades (see TUBE_FADE); casing and glow levels stay.
float tubeFadeLevel(float f, float a) {
  if (f < L_LUMEN0) return f;
  float k = (f - L_LUMEN0) / L_LUMEN_H, s = smoothstep(L_FADE_A, 1.0, a);
  return mix(L_FADE0 + L_FADE_H * k, f, s);
}
void main() {
  int id = int(aRow.x + 0.5);
  vRow = id;${o?`
  zoomOut();`:""}
  vEnd = aRow.w > 1.5 && joinCut == 1 ? aRow.yz : vec2(-1.0);
  joinOut(id, vEnd, aRow.w);
  vMouthA = joinCut == 1 ? aMouthA : vec4(0.0);
  vMouthB = joinCut == 1 ? aMouthB : vec4(0.0);
  int kind = int(aV.x + 0.5), ring = int(aV.y + 0.5);
  vI = kind == T_TRAP ? aV.y + aV.w : kind == T_DOME ? float(ring) : float(clamp(ring - T_CAP, 0, N_SAMPLES - 1));
  bool glow = mPass <= ${U.UP};
  bool lit = texelFetch(tube, ivec2(10, id), 0).a > 0.0, up = texelFetch(tube, ivec2(11, id), 0).w > 5.0;
  if (glow && (!lit || up != (mPass >= ${U.UP_K}))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  bool sel = (int(texelFetch(tube, ivec2(2, id), 0).z + 0.5) & ${a}) != 0;
  float sp = sel ? selPad : 0.0;
  float wr = texelFetch(tube, ivec2(0, id), 0).w * celK + sp + aaPad + padU;
  vec3 q = tubePlace(id, aV, wr, sp, hRef, glow, zK * texelFetch(tube, ivec2(2, id), 0).y);
  if (!glow && !(zK > 0.0)) q.z = tubeFadeLevel(q.z, tubeAlpha(id, q.xy));
  vec3 d = world * vec3(q.xy, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0, 1.0);
}`;var qe=6,Oe=qe+1,V={APEX:0,FILL:1,IN:2,OUT:3,STRIP_A:4,STRIP_B:5},He=4,fo=1+3*Oe+2*He,gt=1,Ue=1+Oe,Ge=1+2*Oe,ho=1+3*Oe,H=12,ma=je.LUMEN0+.01,pa=.295,yt=20,_t=6,va=.02,Et=14,Tt=170,wa=4,xa=.9,ga=32,ba=3,Aa=16,ya=.25,_a=.06,uo=8,bt=je,At=Math.PI/180;function mo(){let e=new Float32Array(fo*4),a=(t,n,s)=>{e[t*4]=n,e[t*4+1]=s};a(0,V.APEX,0);for(let t=0;t<2;t++)for(let n=0;n<He;n++)a(ho+t*He+n,t===0?V.STRIP_A:V.STRIP_B,n);for(let t=0;t<Oe;t++)a(gt+t,V.FILL,t),a(Ue+t,V.IN,t),a(Ge+t,V.OUT,t);let o=[];for(let t=0;t<qe;t++)o.push(0,gt+t,gt+t+1);for(let t=0;t<qe;t++)o.push(Ue+t,Ge+t,Ue+t+1,Ue+t+1,Ge+t,Ge+t+1);for(let t=0;t<2;t++){let n=ho+t*He;o.push(n,n+1,n+2,n,n+2,n+3)}return{attr:e,index:Uint16Array.from(o),nVerts:fo,nIndex:o.length}}function we(e,a,o){let t=e[2*a],n=e[2*a+1];for(let s=1;s<=uo;s++){let r=a+o*s;if(r<0||r>=E)break;let i=e[2*r]-t,c=e[2*r+1]-n,l=Math.hypot(i,c);if(l>1e-6)return[i/l,c/l]}return[o,0]}var G=e=>Number.isInteger(e)?e.toFixed(1):String(e),kt=(e,a=1,o="")=>`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(location=0) in vec4 aV;         // (kind, arc index, 0, 0): tube-joint.js webIndex
layout(location=1) in vec4 aLegA;      // (row, sample, dir, side) of the first leg (per instance)
layout(location=2) in vec4 aLegB;      // the second leg's
layout(location=3) in vec4 aWeb;       // (rho0, reach, owner, taper: 1 for a pair of legs under WEB_MIN_DEG apart)
uniform mat3 world;                    // world \u2192 device pixels
uniform vec2 size;
uniform vec2 lOff;
uniform highp sampler2D tube;
uniform int mPass;
uniform float padU;
uniform float selPad;
uniform float tubeBase;                // this pass pair's band of depth: tubeBase + [0, 1) * tubeH
uniform float tubeH;
uniform float hRef;
uniform float celK;
uniform float aaPad;                   // two device pixels, world
uniform float zK;
uniform float hK;
${e}
const int W_APEX = ${V.APEX};
const int W_FILL = ${V.FILL};
const int W_IN = ${V.IN};
const int W_OUT = ${V.OUT};
const int W_STRIP_B = ${V.STRIP_B};
const int W_STRIP_A = ${V.STRIP_A};
const float W_STRIP = ${G(ma)};
const float W_LUMEN_H = ${G(bt.LUMEN_H)};
const int W_ARC = ${qe};
const int W_LOOK = ${uo};
const float W_LEVEL = ${G(pa)};
const float W_CASE0 = ${G(bt.CASE0)};
const float W_CASE1 = ${G(bt.CASE1)};
const float W_MIN = ${G(_t*At)};
const float W_FULL = ${G(yt*At)};
const float W_MAX = ${G(Tt*At)};
const float W_FAR = ${G(wa)};
const float W_FAR_T = ${G(Et)};
const float W_CUT = ${G(xa)};
const int W_SPAN = ${ga};
const int W_REFIT = ${ba};
const int W_DEVN = ${Aa};
const float W_DEV = ${G(_a)};
const float W_DEV_T = ${G(va)};
const float W_OVER = ${G(ya)};
${o?`${o}
`:""}out float vI;
flat out int vRow;
out float vD;
out vec2 vG;
out float vRad;
flat out vec2 vEnd;
flat out vec4 vMouthA;                 // (a web opens no outline: both zero)
flat out vec4 vMouthB;
${ro}
invariant gl_Position;
struct WLeg { vec2 p; vec2 d; vec2 n; float r; float len; int seg; float over; };
// The direction the leg leaves in: toward the first sample past i (in s) at least 1e-6 away, else (s, 0).
vec2 wDir(int id, int i, int s) {
  vec2 p = PT(id, i);
  for (int k = 1; k <= W_LOOK; k++) {
    int j = i + s * k;
    if (j < 0 || j >= N_SAMPLES) break;
    vec2 q = PT(id, j) - p;
    float l = length(q);
    if (l > 1e-6) return q / l;
  }
  return vec2(float(s), 0.0);
}
WLeg wLeg(vec4 a) {
  int id = int(a.x + 0.5), i = int(a.y + 0.5), s = a.z > 0.0 ? 1 : -1;
  float sd = a.w > 0.0 ? 1.0 : -1.0;
  WLeg g;
  g.p = PT(id, i);
  g.d = wDir(id, i, s);
  g.r = mRW(id, i, 0.0);
  g.n = sd * vec2(-g.d.y, g.d.x);
  g.len = length(PT(id, s > 0 ? N_SAMPLES - 1 : 0) - g.p);
  g.seg = i;
  g.over = 0.0;
  return g;
}
float wCross(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
// The leg's frame at the point of its vessel nearest to c (WEB_SPAN segments from sample i0 in direction s): webFrameAt's twin.
WLeg wFrameAt(int id, WLeg g0, int i0, int s, float sd, vec2 c) {
  float bd = 1e30, bt = 0.0, bl = 1.0, bover = 0.0;
  bool have = false;
  vec2 bp = vec2(0.0), bv = vec2(1.0, 0.0);
  int ba = i0;
  for (int m = 0; m < W_SPAN; m++) {
    int a = i0 + s * m, b = a + s;
    if (b < 0 || b >= N_SAMPLES || a < 0 || a >= N_SAMPLES) break;
    vec2 pa = PT(id, a), pb = PT(id, b);
    vec2 v = pb - pa;
    float l2 = dot(v, v);
    if (!(l2 > 1e-12)) continue;
    float t = clamp(dot(c - pa, v) / l2, 0.0, 1.0);
    vec2 pp = pa + v * t, e = c - pp;
    float dd = dot(e, e);
    if (dd < bd) {
      bd = dd; have = true; ba = a; bt = t; bp = pp; bv = v; bl = sqrt(l2);
      bover = (t >= 1.0 && (b == 0 || b == N_SAMPLES - 1)) ? max(0.0, dot(c - pb, v) / bl) : 0.0;
    }
  }
  if (!have) { g0.seg = i0; g0.over = 0.0; return g0; }
  WLeg g;
  g.p = bp;
  g.d = bv / bl;
  g.n = sd * vec2(-g.d.y, g.d.x);
  float r0 = mRW(id, ba, 0.0), r1 = mRW(id, ba + s, 0.0);
  g.r = r0 + (r1 - r0) * bt;
  g.len = g0.len;
  g.seg = ba;
  g.over = bover;
  return g;
}
// How far along the frame's straight wall line the real wall stays within eps of it: webWallSpan's twin.
float wSpan(int id, WLeg f, int s, float sd, float eps) {
  vec2 w0 = f.p + f.n * f.r;
  float prevE = 0.0, prevU = 0.0;
  for (int k = 1; k <= W_DEVN; k++) {
    int j = f.seg + s * k;
    if (j < 0 || j >= N_SAMPLES) return prevU;
    int j2 = j + s;
    bool fw = j2 >= 0 && j2 < N_SAMPLES;
    vec2 pj = PT(id, j);
    vec2 dv = fw ? PT(id, j2) - pj : pj - PT(id, j - s);
    float l = length(dv);
    if (!(l > 1e-6)) continue;
    dv /= l;
    vec2 w = pj + sd * vec2(-dv.y, dv.x) * mRW(id, j, 0.0) - w0;
    float e = abs(wCross(w, f.d)), u = dot(w, f.d);
    if (e > eps) return prevU + (u - prevU) * clamp((eps - prevE) / (e - prevE), 0.0, 1.0);
    prevE = e; prevU = u;
  }
  return 1e9;
}
vec3 wMeet(WLeg A, WLeg B) {   // (1, C) when the wall lines meet, else (0, 0, 0)
  float cr = wCross(A.d, B.d);
  if (abs(cr) < 1e-12) return vec3(0.0);
  vec2 a = A.p + A.n * A.r, b = B.p + B.n * B.r;
  return vec3(1.0, a + (wCross(b - a, B.d) / cr) * A.d);
}
void main() {
  int kind = int(aV.x + 0.5), k = int(aV.y + 0.5);
  WLeg A = wLeg(aLegA), B = wLeg(aLegB);
  bool ownB = aWeb.z > 1.5 ? B.r > A.r : aWeb.z > 0.5;
  vRow = int((ownB ? aLegB.x : aLegA.x) + 0.5);${o?`
  zoomOut();`:""}
  vI = ownB ? aLegB.y : aLegA.y;
  vEnd = vec2(-1.0);
  ${io}
  vMouthA = vec4(0.0); vMouthB = vec4(0.0);
  vD = 0.0; vG = vec2(0.0);
  float Rm = max(A.r, B.r);
  vRad = 4.0 * Rm;
  bool mouth = aWeb.z < 1.5;                // (a marked trunk owns the web: its wall tone all over, as the branch's mouth carries it on)
  vec2 gOwn = ownB ? B.n : A.n;
  if (mPass < ${U.SHAPE_K}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // no glow, up-glow or shadow of a web
  int idA = int(aLegA.x + 0.5), iA = int(aLegA.y + 0.5), sA = aLegA.z > 0.0 ? 1 : -1, idB = int(aLegB.x + 0.5), iB = int(aLegB.y + 0.5), sB = aLegB.z > 0.0 ? 1 : -1;
  float dA = aLegA.w > 0.0 ? 1.0 : -1.0, dB = aLegB.w > 0.0 ? 1.0 : -1.0;
  WLeg A0 = A, B0 = B;
  bool empty = false;
  vec2 C = A.p + A.n * A.r;
  vec3 m0 = wMeet(A, B);
  if (m0.x < 0.5) empty = true; else C = m0.yz;
  for (int it = 0; it < W_REFIT; it++) {
    if (empty) break;
    WLeg A1 = wFrameAt(idA, A0, iA, sA, dA, C), B1 = wFrameAt(idB, B0, iB, sB, dB, C);
    vec3 m1 = wMeet(A1, B1);
    if (m1.x < 0.5) break;
    A = A1; B = B1; C = m1.yz;
  }
  vec2 wa = A.p + A.n * A.r;
  float cr = wCross(A.d, B.d);
  float theta = atan(abs(cr), dot(A.d, B.d));
  bool taper = aWeb.w > 0.5;
  empty = empty || theta < (taper ? W_MIN : W_FULL) || theta >= (taper ? W_FULL : W_MAX);
  vec2 O = wa, bis = vec2(0.0);
  float rho = 0.0;
  if (!empty) {
    if (max(A.over, B.over) > W_OVER * Rm) empty = true;
    if (max(distance(C, A0.p), distance(C, B0.p)) > (taper ? W_FAR_T : W_FAR) * Rm) empty = true;
    if (taper && (dot(C - A0.p, A.d) < 0.0 || dot(C - B0.p, B.d) < 0.0)) empty = true;
  }
  float th2 = 0.0;
  if (!empty) {
    th2 = tan(0.5 * theta);
    float eps = (taper ? W_DEV_T : W_DEV) * Rm;
    vec2 wA = A.p + A.n * A.r, wB = B.p + B.n * B.r;
    float tlMax = min(wSpan(idA, A, sA, dA, eps) - dot(C - wA, A.d), wSpan(idB, B, sB, dB, eps) - dot(C - wB, B.d));
    rho = min(aWeb.x, min(W_CUT * min(A0.len, B0.len) * th2, min(aWeb.y * th2, tlMax * th2)));
    if (!(rho > 1e-5)) empty = true;
  }
  vec3 q = vec3(wa, W_LEVEL);
  if (!empty) {
    float tl = rho / th2;
    bis = normalize(A.d + B.d);
    O = C + bis * rho / sin(0.5 * theta);
    vec2 va = C + A.d * tl - O, vb = C + B.d * tl - O;
    float sgn = wCross(va, vb) >= 0.0 ? 1.0 : -1.0;
    float an = sgn * (M_PI - theta) * float(k) / float(W_ARC);
    float ca = cos(an), sa = sin(an);
    vec2 pt = O + vec2(va.x * ca - va.y * sa, va.x * sa + va.y * ca);
    vec2 up = normalize(O - pt);
    float px = 0.5 * aaPad;
    float rk = mix(A0.r, B0.r, float(k) / float(W_ARC));   // (the skirt's width follows the radius along the arc: each arm's own outline at its end)
    float w = min(clamp(0.14 * rk, 1.5 * px, 3.0 * px) + aaPad, 0.98 * rho);
    if (kind == W_APEX) { q = vec3(C, W_LEVEL); vD = min(-(length(C - O) - rho), -2.0 * aaPad); vG = mouth ? gOwn : vec2(0.0); }
    else if (kind == W_FILL) { q = vec3(pt, W_LEVEL); vG = mouth ? gOwn : up; }
    else if (kind == W_IN) { q = vec3(pt, W_CASE1); vG = mouth ? gOwn : up; }
    else if (kind >= W_STRIP_A) {
      bool sb = kind == W_STRIP_B;
      vec2 sd = sb ? B.d : A.d, sn = sb ? B.n : A.n;
      vec2 sq = C + sd * (k == 1 || k == 2 ? tl : 0.0);
      if (k >= 2) sq -= sn * aaPad;
      q = vec3(sq, W_STRIP + W_LUMEN_H * clamp(zK * texelFetch(tube, ivec2(2, sb ? idB : idA), 0).y, 0.0, 1.0));
      vD = -aaPad; vG = mouth ? gOwn : sn;
    }
    else { q = vec3(pt + up * w, W_CASE0); vD = w; vG = mouth ? gOwn : up; }
  }
  vec3 d = world * vec3(q.xy, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0, 1.0);
}`;var q={K:1.6,INK:[.07,.06,.06],DIR:[-.70710678,-.70710678],SHADE_AT:-.16,LIT_AT:.24,SHADE:.17,LIT:.15,LINE_MIN:1.5,LINE_MAX:3,LINE_R:.14},ee=e=>Number.isInteger(e)?`${e}.0`:String(e),Lt=()=>`
const vec2 CEL_DIR = vec2(${q.DIR.map(ee).join(", ")});
const float CEL_SHADE_AT = ${ee(q.SHADE_AT)};
const float CEL_LIT_AT = ${ee(q.LIT_AT)};
const float CEL_SHADE = ${ee(q.SHADE)};
const float CEL_LIT = ${ee(q.LIT)};

// The flat fill's three tones: lit (a faint lift toward white on the side facing the light, the top left), base (the fill as it is), shadow (one darker step toward the
// far wall). lum the fill (the vessel's own colour, or the lumen layer's blood colour), D the distance from the wall (negative inside), R the radius,
// g the unit direction across the vessel toward the wall, aa one device pixel's edge softness. Each edge is about one pixel soft, each tone a multiple of the colour
// it is given (any lens, either theme), and left out on hairlines. Shared by celShade (the vessel layer) and the lumen layer's shader (tube-lumen-glsl.js), which paints over it.
vec3 celTones(vec3 lum, float D, float R, vec2 g, float aa) {
  float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
  float s = rho * dot(g, CEL_DIR);
  float et = 0.5 * aa / max(R, 1e-3);   // half width of an edge in s: about one device pixel across a vessel facing the light
  float hw = smoothstep(1.5, 3.5, R / aa);
  float shadow = 1.0 - smoothstep(CEL_SHADE_AT - et, CEL_SHADE_AT + et, s);
  float lit = smoothstep(CEL_LIT_AT - et, CEL_LIT_AT + et, s);
  lum *= 1.0 - hw * CEL_SHADE * shadow;
  return mix(lum, vec3(1.0), CEL_LIT * hw * lit);
}

// A vessel cut across (a disc: the lobule's portal venule, central vein, arteriole and bile ductule, flag F_RING): the long vessels' pale band, a ring just
// inside the wall (about 1.2 to 2.4 device px wide, a lift toward white by 0.144, less on a pale fill), the same width and strength as tubeShade's wall band and
// all round, so a disc has no lit side. Left out on hairlines. Shared by celShade and the lumen layer's shader, which paints over it.
vec3 celRing(vec3 lum, float D, float R, float aa) {
  float lumY = dot(lum, vec3(0.299, 0.587, 0.114));
  float ringW = clamp(0.1 * R, 1.2 * aa, 2.4 * aa);
  float ringBand = smoothstep(-ringW - aa, -ringW, D) * smoothstep(1.5, 3.5, R / aa);
  return mix(lum, vec3(1.0), 0.144 * ringBand * (1.0 - 0.6 * smoothstep(0.72, 0.9, lumY)));
}

// A disc cut across, outlined (flag F_RING; Mohammad, 10 Nov 2026: "outline it, where it's not connecting to a vessel"): inside the wall, an ink line wl wide (the
// vessel's own outline ink, ink) and, inside that, the pale band; both all round, and none where a vessel joins (open 1: ringOpen) so the vessel flows in.
// The lumen layer lays this again over the blood (it replaces this layer's fill), so both shaders call it.
vec3 celDisc(vec3 lum, vec3 ink, float D, float R, float wl, float aa, float open) {
  float closed = 1.0 - open;
  lum = mix(lum, celRing(lum, D + wl, R, aa), closed);
  return mix(lum, ink, clamp(0.5 + (D + wl) / aa, 0.0, 1.0) * closed * smoothstep(1.5, 3.5, R / aa));
}
`,po=({F_DIFFUSE:e,F_EDGE:a,F_VEIL:o})=>`
uniform float celK;                    // (declared for the host's sake; the outline's width is now in device pixels by caliber)
${Lt()}const vec3 CEL_INK = vec3(${q.INK.map(ee).join(", ")});

// The tier's shape drawn at a pixel, cel shaded: selection ring, outline, the flat lumen in three subtle tones lit from the top left, dark
// lumen's rim, lift, hover and the knock-out ring, premultiplied, before the tier's alpha. Ds is unused (a cel shaded vessel has no contact
// shadow); D, R, wall, col, g, aL as in tubeShade.
vec4 celShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov,
              vec3 edge, float kn, float kcas, float aa, float aL) {
  float wl = clamp(${ee(q.LINE_R)} * R, ${ee(q.LINE_MIN)} * px, ${ee(q.LINE_MAX)} * px);
  float aC = clamp(0.5 - (D - wl) / aa, 0.0, 1.0);
  vec4 c = vec4(0.0);
  if (sel) { float ar = ring.a * clamp(0.5 - (D - wl - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
  // (A veiled vessel keeps half its outline: behind an organ the wall's line is the first thing to go.)
  if ((flags & ${o}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 ink = casing.rgb;   // one ink for every vessel, the look's own (--casing-rgb: a warm sepia on the light looks, the ground's near-black on the dark ones; Mohammad, 13 Nov 2026, outlines A)
  c = (flags & ${a}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC), c) : over(vec4(ink, 1.0) * (cA * aC), c);
  vec3 lum = col;
  if (fx == 1 && (flags & ${e}) != 0 && aL > 0.0) lum = celTones(lum, D, R, g, aa);
  if (fx == 1 && (flags & ${Me}) != 0 && aL > 0.0) lum = celDisc(lum, T(id, 4).rgb, D, R, 0.8 * wl, aa, ringOpen(T(id, 3).xyz, g));
  // A dark lumen (the sickest vessels, on the dark looks, where the outline is no darker than the ground) gets a light edge 1 device px wide just
  // inside its wall, by its own lightness, the way the label halo follows its ink (rimInk.a is 0 on the light looks; hairlines are left out).
  lum = mix(lum, rimInk.rgb, rimInk.a * (1.0 - smoothstep(0.2, 0.4, lumY)) * smoothstep(-px - aa, -px, D) * smoothstep(1.5, 3.5, R / aa));
  if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
  if (hov > 0.0) {
    // The hovered vessel, a little brighter in its own hue, easing out toward each end that meets a vessel not lit with it
    // (over a third of its length, at most 60), so the brighter lumen never stops in a hard line at the join.
    vec4 he = T(id, 11);
    float Lh = max(T(id, 5).z, 1.0), fl = min(0.35 * Lh, 60.0);
    float hs = (he.x > 0.0 ? smoothstep(0.0, max(he.x, fl), vAt * Lh) : 1.0) * (he.y > 0.0 ? smoothstep(0.0, max(he.y, fl), (1.0 - vAt) * Lh) : 1.0);
    lum = mix(lum, min(lum * 1.18 + 0.04, vec3(1.0)), hov * hs);
  }
  lum = mix(mix(lum, paperInk.rgb, kn), casing.rgb, casing.a * kcas * kn);
  c = over(vec4(lum, 1.0) * aL, c);
  return c;
}
`;var St=`#version 300 es
precision highp float;
void main() {}
`,vo=e=>`#version 300 es
precision highp float;
precision highp int;
in float vI;
in float vRad;
${Se}
uniform float px;
uniform vec4 invA;
uniform vec2 tOff;
uniform vec2 lOff;
uniform vec2 sizeF;
${Re(e)}
void main() {
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  if (joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, vRad, px).drop) discard;
}
`,Ta=`float mouthOpen(vec2 p, float R, float px) {
  float m[8] = float[8](vMouthA.x, vMouthA.y, vMouthA.z, vMouthA.w, vMouthB.x, vMouthB.y, vMouthB.z, vMouthB.w);
  float open = 0.0;
  for (int k = 0; k < 8; k++) {
    if (m[k] < 1.5) continue;
    int ci = int(m[k] + 0.5) - 2, row = ci >> 1, s0 = (ci & 1) == 1 ? 63 : 0, s1 = (ci & 1) == 1 ? 59 : 4;
    vec2 E = PT(row, s0), d = PT(row, s1) - E;
    float dl = length(d);
    if (dl < 1e-4) continue;
    d /= dl;
    float rb = max(texelFetch(rad, ivec2(s1, row), 0).r, 0.3);
    vec2 v = p - E;
    float s = dot(v, d), perp = abs(v.x * d.y - v.y * d.x);
    float w = 1.0 - smoothstep(rb - px, rb + px, perp);
    float a = smoothstep(-0.35 * rb - px, -0.35 * rb + px, s) * (1.0 - smoothstep(R + 2.5 * rb, R + 3.5 * rb, s));
    open = max(open, w * a);
  }
  return open;
}`,wo=e=>{let{F_SEL:a,F_DOTTED:o,F_NOCASE:t,F_SHADOW:n,EDGE:s,ENT_W:r,N_SAMPLES:i,MAX_TIERS:c,S_OFF:l,ALONG_GLSL:f}=e;if(i!==64)throw new Error("tube-lean-glsl: vEnd packs the trunk row as row * 64 + sample, so N_SAMPLES must be 64");let d=i-1;return`#version 300 es
precision highp float;
precision highp int;
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the outline's skirt
in vec2 vG;                            // direction from the centreline to this point (not unit; (0, 0) on the centreline)
in float vRad;                         // the lumen's radius here, world units
${Se}
flat in vec4 vMouthA;                  // the branches that end on this row's side (tube-data.js mouthCode): its outline is left open across them
flat in vec4 vMouthB;
uniform int mPass;                     // the pass (MP_*)
uniform int tierNow;                   // the tier it draws
uniform int isWeb;                     // 0 a strip; 1 a web: drawn in the higher of its two members' tiers, carrying its owner's row (often in the lower tier)
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform vec4 invA;                     // device pixels \u2192 world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen
uniform vec2 sizeF;                    // the layer, device pixels
uniform float reachU;                  // how far from a lumen anything is drawn (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 rimInk;                   // a dark lumen's light rim: rgb, alpha (0 on the light looks)
uniform vec4 paperInk;                 // the figure's ground: rgb, alpha
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform float tierAlpha[${c}];
uniform int tierGroup[${c}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture, not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw: only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 \xD7 (arc length + S_OFF), across (0\u201365535), visibility
layout(location=2) out uvec4 outFlow2; // the second lumen (a strip has none: zero)
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

const float LAST = ${d}.0;
const float S_OFF = ${l}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${i/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${r}, t / ${r}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
${f}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

${pe(e)}
${po(e)}

${Re(i)}
${$e(e.VEIL_K)}
${Ta}
void main() {
  // (Only the shape and its lift: a glow pass stays on the stage 1 program.)
  if (mPass < ${U.SHAPE_K} || mPass > ${U.LIFT}) discard;
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself, as the vessel shader does.
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  float reach = reachU + 2.0 * px;
  int id = vRow;
  vec4 t2 = T(id, 2), t5 = T(id, 5);
  float u = vI / LAST;                 // (how far along, 0\u20131: the nearest segment's index plus the fraction, over LAST)
  float R = vRad, D = vD;
  // The row's flags, clip range and dotted rule, as segNear applies them: the distance is to the vessel's drawn stretch (a round end where the
  // clip cuts it) and, for a closed potential collateral, to its dots (1.5 long every 6 units).
  bool dotted = (int(t2.z + 0.5) & ${o}) != 0;
  if (t5.x > 0.0 || t5.y < 1.0) {
    float ext = max(t5.x - u, u - t5.y) * t5.z;
    if (ext > 0.0) D = length(vec2(D + R, ext)) - R;
  }
  if (dotted) {
    float m = mod(u * t5.z, 6.0);
    float along = m < 3.75 ? max(0.0, m - 1.5) : 6.0 - m;
    D = length(vec2(D + R, along)) - R;
  }
  // No vessel in reach of this pixel: it is left empty, written so when the cells are drawn again over the last picture.
  if (D >= reach) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  // A row's end on another row (tube-join-glsl.js): a pixel inside the trunk the row ends on, or beyond a continuation's bisector plane, is the other row's.
  JoinEnd je = joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, R, px);
  // (A cut end's outline lying inside the trunk's wall is the trunk's: dropped, so it leaves no dotted hairline in the mouth, 13 Nov 2026.)
  if (D > 0.0 && je.gp < 0.0) je.drop = true;
  if (je.drop) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  // Nothing to draw here: settled now, as the vessel shader settles it (no lit vessel's glow in reach, the outline far off).
  if (!(T(id, 10).a > 0.0 && D - T(id, 0).w < 15.7) && D > 8.01 + 2.0 * px) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  // The vessel's attributes here (its tier, flags, wall, colour along it, hover, selection, own edge colour, alpha with the fades and the veil).
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${e.VEIL_K} * organK : 0.0;
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(id, u, u, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  aCol = mix(aCol, je.col, je.wc);   // (a cut end and a continuation take on the other row's colour near the join)
  // (A web is drawn in tierNow, whichever tier its owner's row is in: its colour and the row's own opacity are the owner's, its tier alpha and group the tier it is drawn in.)
  int ti = int(aTier + 0.5);
  if (ti != tierNow && isWeb == 0) discard;
  int tt = ti;   // (a web carries its owner's tier alpha and group too, as the lumen layer's shader gives it: a web beside a faded trunk is as faded as the trunk, 61523a4)
  int grp = tierGroup[tt];
  // Whether a lumen colour reaches this pixel: through a lumen drawn here (aL > 0) or a glow in its own colour.
  bool dep = false;
  vec4 gc, ge;
  float gv = glowAmt(id, D, aWall, u, aA, gc, ge);
  if (gc.a > 0.0 && gv > 0.0 && ge.z > 0.5) dep = true;
  if (D > 8.0 + 2.0 * px) discard;
  int flags = int(aFlag + 0.5);
  bool sel = (flags & ${a}) != 0;
  float cA = (flags & ${t}) != 0 ? 0.0 : (flags & ${o}) != 0 ? 0.35 : 1.0;
  // (Where a branch joins this row's side its wall line is left open across the branch's width: the line under the branch's faded end showed through it as a seam, tube-data.js mouthCode.)
  if (D > -2.0 * px && vMouthA.x + vMouthA.y + vMouthA.z + vMouthA.w + vMouthB.x + vMouthB.y + vMouthB.z + vMouthB.w > 1.5) cA *= 1.0 - mouthOpen(p, R, px);
  vec2 g = joinTone(length(vG) > 1e-5 ? normalize(vG) : vec2(0.0), je, clamp((R + D) / max(R, 1e-3), 0.0, 1.0));   // (one tone field over a join: tube-join-glsl.js)
  float aa = px * ${s};
  float aL = clamp(0.5 - D / aa, 0.0, 1.0);
  if (aL > 0.0) dep = true;
  vec4 c = celShade(D, D, R, aWall, aCol, g, flags & ~${n}, sel, cA, grp, id, u, aHov, aEdge, 0.0, 0.0, aa, aL);
  c *= aA * tierAlpha[tt];
  float wsel = grp == 1 ? aSel : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
  float gf = grp == 0 ? 1.0 - occl * aOf : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
  float lumA = aL * aA * tierAlpha[tt] * gf;
  // (A continuation eases its opacity to its partner's tier's over the last JOIN_RAMP_R radii when the partner is the fainter, so the two tiers meet without a step.)
  float jr = (flags & ${2048}) != 0 ? 1.0 : joinRamp(je, aA * tierAlpha[tt] * gf, occl);   // (a continuation eases its opacity to its partner's: tube-join-glsl.js)
  lumA *= je.fl * jr;   // (a branch fading into its trunk: tube-join-glsl.js)
  bool lum = lumA > 0.02 && !dotted;
  // The stream shown here: this lumen, with its place along and across for the compositor's blood.
  uint gId = 0u;
  float gS = 0.0, gY = 0.0, gW = 0.0;
  // (A web carries no stream: its vertices hold one place along its owner, vI, so every pixel of it would show the owner's blood and heads at that one place, whatever its own: a head of the trunk passing a branch mouth drew its black core and light rim as slices across the corner fillet, 14 Nov 2026.)
  if (lum && isWeb == 0) {
    vec2 a = PT(id, clamp(int(vI), 0, ${i-2})), ba = PT(id, clamp(int(vI), 0, ${i-2}) + 1) - a;
    float across = (ba.x * (p - a).y - ba.y * (p - a).x) * inversesqrt(max(dot(ba, ba), 1e-8));
    gId = uint(id + 1); gS = u * t5.z; gY = clamp(across / max(R, 1e-3), -1.0, 1.0); gW = lumA * smoothstep(0.5, 0.9, je.fl);   // (a branch fading into its trunk hands its blood and heads over to the trunk's before it is half gone: no stray head on the ghost of its end)
  }
  if (grp == 0) c *= 1.0 - occl * aOf;
  c *= mix(je.fo, je.fl, aL) * jr;   // (the lumen's share fades with the branch, the outline's faster)
  // (The lift: the selected vessel's own share, laid over the network.)
  if (mPass == ${U.LIFT}) {
    vec4 lc = c * wsel;
    if (lc.a < 0.002) discard;
    outColor = ditherOut(lc, q); outDep = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
    return;
  }
  // (The shape: a pixel it leaves clear is left as it is; one it covers outside a lumen hides the stream under it.)
  if (!lum && c.a < 0.002) discard;
  outColor = ditherOut(c, q);
  outDep = vec4(dep ? 1.0 : 0.0);
  bool mfl = gId > 0u && gW > 0.01;
  outFlow = mfl ? packFlow(gId, 0u, gS, gY, gW, 0.0) : uvec4(0u);
  outFlow2 = uvec4(0u);
}
`};var ka={MIN_PX:6,FADE_BAND:.5,YMAX:.999,A:.18,L:3,F:.6,REV_GAIN:1.25,NARROW:.6,TIGHT:.4,DSTEP:2,JET_Y:.6,JET_GAIN:1.5,STEPS:3,B:.22,G:.8,EL:2,C:.5},N=e=>Number.isInteger(e)?e.toFixed(1):String(e),O=ka,xo=`
// The blood's place as trouble bends it: xy = (s, y) to draw the streaks at, z = a gain on the streaks' density (1 = none), w = how much trouble (0..1, for tests and a later tint)
vec4 troubleAt(int id, float s, float y, float R, float len, float vd, bool reversed) {
  // Under ${N(O.MIN_PX)} device pixels across, nothing (eased in over the next ${N(O.MIN_PX*O.FADE_BAND)}).
  float fade = smoothstep(${N(O.MIN_PX)}, ${N(O.MIN_PX*(1+O.FADE_BAND))}, 2.0 * R / pxW);
  if (fade <= 0.0) return vec4(s, y, 1.0, 0.0);
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float tt = still == 1 ? 0.0 : bT;
  float d = ${N(O.DSTEP)} * R;
  // The caliber upstream, at 1 \u2026 5 steps (the flow's upstream side): five reads.
  float r1 = radAt(id, s - dir * d, len), r2 = radAt(id, s - dir * 2.0 * d, len), r3 = radAt(id, s - dir * 3.0 * d, len);
  float r4 = radAt(id, s - dir * 4.0 * d, len), r5 = radAt(id, s - dir * 5.0 * d, len);
  // The narrowing at this place (the jet) and at 1, 2 and 3 steps upstream (the eddies, falling from 1 to 0).
  float n0 = R / max(r1, r2);
  float jet = smoothstep(${N(O.NARROW)}, ${N(O.TIGHT)}, n0) * fade;
  float q1 = smoothstep(${N(O.NARROW)}, ${N(O.TIGHT)}, r1 / max(r2, r3));
  float q2 = smoothstep(${N(O.NARROW)}, ${N(O.TIGHT)}, r2 / max(r3, r4)) * ${N(1-1/O.STEPS)};
  float q3 = smoothstep(${N(O.NARROW)}, ${N(O.TIGHT)}, r3 / max(r4, r5)) * ${N(1-2/O.STEPS)};
  float eddy = max(q1, max(q2, q3)) * fade;
  float rev = reversed ? fade : 0.0;
  if (rev + jet + eddy <= 0.0) return vec4(s, y, 1.0, 0.0);
  float ys = y, ss = s, gain = 1.0;
  if (rev > 0.0) {
    ys += rev * ${N(O.A)} * (1.0 - y * y) * sin(6.2831853 * (s / (${N(O.L)} * R) - dir * fract(${N(O.F)} * tt)));
    gain *= mix(1.0, ${N(O.REV_GAIN)}, rev);
  }
  if (jet > 0.0) {
    ys = mix(ys, ys * ${N(O.JET_Y)}, jet);
    gain *= mix(1.0, ${N(O.JET_GAIN)}, jet);
  }
  if (eddy > 0.0) {
    float w = sin(6.2831853 * (s / (${N(O.EL)} * R) - dir * fract(${N(O.G)} * tt)));
    ys += ${N(O.B)} * eddy * w * (y < 0.0 ? -1.0 : 1.0);
    ss -= ${N(O.C)} * eddy * R * w;
  }
  return vec4(ss, clamp(ys, -${N(O.YMAX)}, ${N(O.YMAX)}), gain, max(rev, max(jet, eddy)));
}
`;var hs=1,ds=2,go=512,ge=128,Je=8,bo=8,It=7,Ot=64,La=`#version 300 es
void main() { gl_Position = vec4(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0, 0.0, 1.0); }`,Ma=`#version 300 es
precision highp float;
precision highp int;
out vec4 o;
uint hsh(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
float vn(vec2 q, uint seed, int period) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  int x0 = int(i.x) % period; if (x0 < 0) x0 += period;
  int x1 = (x0 + 1) % period;
  uint y0 = uint(int(i.y) + 4096), y1 = y0 + 1u;
  float a = h01(seed ^ (uint(x0) * 73856093u) ^ (y0 * 19349663u)), b = h01(seed ^ (uint(x1) * 73856093u) ^ (y0 * 19349663u));
  float c = h01(seed ^ (uint(x0) * 73856093u) ^ (y1 * 19349663u)), d = h01(seed ^ (uint(x1) * 73856093u) ^ (y1 * 19349663u));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int layer = p.y / ${ge}, ly = p.y - layer * ${ge};
  float u = (float(p.x) + 0.5) / ${go}.0;
  float q = clamp((float(ly) + 0.5 - ${bo}.0) / ${It}.0 - 8.0, -8.0, 8.0);
  uint L = uint(layer);
  float c = vn(vec2(u * 50.0, q), L * 31u, 50);
  float f = vn(vec2(u * 100.0, q * 1.7 + 7.3), L * 57u + 11u, 100);
  o = vec4(c, f, 0.0, 1.0);
}`,Ao=`
const float D_CYCLE = ${Ot}.0;
vec2 tileAt(int lay, float u, float qy, vec2 gx, vec2 gy) {
  float v = (float(lay * ${ge}) + ${bo}.0 + (clamp(qy, -8.0, 8.0) + 8.0) * ${It}.0) / ${ge*Je}.0;
  return textureGrad(noiseT, vec2(u, v), gx, gy).rg;
}
float dNoise(int id, float s, float qy, float D, float ay, float cellA, float drift, float dxu, float dyv) {
  // The smooth speed across the vessel (the laminar profile, fastest on the axis; the walls keep a quarter of the axis speed).
  float g = max(2.0, 16.0 * (1.0 - 0.64 * ay * ay)) * 0.125;
  float f0 = fract(D / D_CYCLE), f1 = fract(f0 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * f0), w1 = 1.0 - abs(1.0 - 2.0 * f1);   // (w0 + w1 = 1: each read is hidden as it resets)
  float uo = fract(float(id) * 0.6180339);
  int lay = id & ${Je-1};
  vec2 gx = vec2(dxu, 0.0), gy = vec2(0.0, dyv);
  vec2 a = tileAt(lay, ((s - g * f0 * D_CYCLE) / cellA + drift) / 50.0 + uo, qy, gx, gy);
  vec2 b = tileAt(lay, ((s - g * f1 * D_CYCLE) / cellA + drift) / 50.0 + uo, qy, gx, gy);
  float na = lnWb * a.x + lnWf * a.y, nb = lnWb * b.x + lnWf * b.y;
  float nm = (w0 * (na - 0.5) + w1 * (nb - 0.5)) * inversesqrt(w0 * w0 + w1 * w1) + 0.5;   // (even contrast through the crossfade)
  return lnS == 1.0 ? nm : 0.5 + (nm - 0.5) * lnS;
}`,yo=`
float eNoise(int id, float s, float qy, float D, float ay, float cellA, float drift, float pxCell) {
  float g = max(2.0, 16.0 * (1.0 - 0.64 * ay * ay)) * 0.125;
  float f0 = fract(D / D_CYCLE), f1 = fract(f0 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * f0), w1 = 1.0 - abs(1.0 - 2.0 * f1);
  float idf = float(id) * 2.3999632, q = qy * 0.5;
  float ua = ((s - g * f0 * D_CYCLE) / cellA + drift) * 0.12566371, ub = ((s - g * f1 * D_CYCLE) / cellA + drift) * 0.12566371;
  float na = 0.5 + 0.30 * sin(7.0 * ua + 1.1 * q + idf) * sin(11.0 * ua - 0.6 * q + 2.3 * idf) + 0.16 * sin(3.0 * ua + 0.35 * q + 4.1 * idf);
  float nb = 0.5 + 0.30 * sin(7.0 * ub + 1.1 * q + idf) * sin(11.0 * ub - 0.6 * q + 2.3 * idf) + 0.16 * sin(3.0 * ub + 0.35 * q + 4.1 * idf);
  float nm = (w0 * (na - 0.5) + w1 * (nb - 0.5)) * inversesqrt(w0 * w0 + w1 * w1) + 0.5;
  nm = mix(nm, 0.5, smoothstep(0.18, 0.4, pxCell));   // (11 * 0.1257 rad a cell: its period is 4.5 cells; under 2 px a wave aliases)
  return lnS == 1.0 ? nm : 0.5 + (nm - 0.5) * lnS;
}`,_o=It/(ge*Je),xe=[3089,3042,2929,2960,2884,35977,32926],Rt=[!1,!1,!1,!1,!1,!1,!1];function us(e){if(!e||e.isContextLost?.())return null;let a=null,o=null,t=null,n=null,s=null,r=!1,i=!1;try{a=Ut(e,La,Ma)}catch{return null}let c=()=>{if(o||r)return!!o;if(!Gt(e,a))return!1;try{o=Ht(e,a)}catch(l){console.warn("Blood tile: the GPU bake could not be made; the streaks keep the lattice look.",l),r=!0,e.deleteProgram(a.p)}for(let l of a.sh)e.deleteShader(l);return o&&(t=e.createFramebuffer(),n=e.createVertexArray()),!!o};return{tex:()=>i?s:null,bake(){if(i)return!0;if(r||e.isContextLost()||!c())return!1;let l=Z(e,e.READ_FRAMEBUFFER_BINDING),f=Z(e,e.DRAW_FRAMEBUFFER_BINDING),d=Z(e,e.VIEWPORT),m=Z(e,e.CURRENT_PROGRAM),u=Z(e,e.VERTEX_ARRAY_BINDING),p=Z(e,e.COLOR_WRITEMASK),x=Z(e,e.ACTIVE_TEXTURE),_=Z(e,e.TEXTURE_BINDING_2D);for(let v=0;v<xe.length;v++)Rt[v]=jt(e,xe[v]);let w=go,h=ge*Je;try{let v=e.createTexture();if(e.bindTexture(e.TEXTURE_2D,v),e.texImage2D(e.TEXTURE_2D,0,e.RG8,w,h,0,e.RG,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.bindFramebuffer(e.FRAMEBUFFER,t),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,v,0),!zt(e,e.FRAMEBUFFER,"rg8",w,h))return r=!0,e.deleteTexture(v),!1;for(let b=0;b<xe.length;b++)Rt[b]&&e.disable(xe[b]);return e.colorMask(!0,!0,!0,!0),e.viewport(0,0,w,h),e.useProgram(o),e.bindVertexArray(n),e.drawArrays(e.TRIANGLES,0,3),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,null,0),e.bindTexture(e.TEXTURE_2D,v),e.generateMipmap(e.TEXTURE_2D),s=v,i=!0,!0}finally{e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,null,0),(l??null)===(f??null)?e.bindFramebuffer(e.FRAMEBUFFER,f??null):(e.bindFramebuffer(e.READ_FRAMEBUFFER,l??null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,f??null)),d?.length===4&&e.viewport(d[0],d[1],d[2],d[3]),e.useProgram(m&&e.isProgram(m)?m:null),e.bindVertexArray(u??null),p?.length===4&&e.colorMask(p[0],p[1],p[2],p[3]);for(let v=0;v<xe.length;v++)Rt[v]&&e.enable(xe[v]);x!=null&&e.activeTexture(x),e.bindTexture(e.TEXTURE_2D,_??null)}},dispose(){if(o)e.deleteProgram(o);else if(a&&!r){e.deleteProgram(a.p);for(let l of a.sh)e.deleteShader(l)}t&&e.deleteFramebuffer(t),n&&e.deleteVertexArray(n),s&&e.deleteTexture(s),o=t=n=s=null,r=!0,i=!1}}}var vs=3,L={CYCLE:Ot,WIDTH0:.1,WIDTH1:.1,SOFTE:.8,HL0:.15,HL1:.22,SPEED_REF:36,HL_MAX:.46,FLOOR_PX:.9,DASH:2.2,MEAN_N:8,BRIGHT0:.7,BRIGHT1:.3,HEAD0:.2,OCC:.95,SOFT:6,FRONT:{lanePx:6,sc:1,len:3,tsc:1,bright:1,seed:0},BACK:{lanePx:4,sc:.7,len:3,tsc:.72,bright:.7,seed:1540483477},NARROW_GAIN:[1.165,1.246,1.35,1.483,1.652,1.865,2.132,2.503,3.121,3.244,2.887,2.19,1.63,1.079,1],NARROW_W0:2,NARROW_STEP:.5,BACK_PX0:5,BACK_PX1:9,CELL_PX:[3,5]},M=e=>Number.isInteger(e)?`${e}.0`:String(e),ae=L.FRONT,te=L.BACK,be=e=>`${M(e.lanePx)}, ${M(e.sc)}, ${M(e.len)}, ${M(e.tsc)}`,Eo=`
const float P_CYCLE = ${M(L.CYCLE)};
const float P_NARROW[${L.NARROW_GAIN.length}] = float[${L.NARROW_GAIN.length}](${L.NARROW_GAIN.map(M).join(", ")});
float pLaneW = 1.0, pInvR = 1.0, pDens = 1.0;
uint pHash(uint a, uint b, uint c) {
  uint h = a * 0x9e3779b1u ^ b * 0x85ebca6bu ^ c * 0xc2b2ae35u;
  h ^= h >> 15; h *= 0x2c1b3c6du; h ^= h >> 12; h *= 0x297a2d39u; h ^= h >> 15;
  return h;
}
float pOn(float t, float h) { return clamp((t - h) * ${M(L.SOFT)}, 0.0, 1.0); }
float pOnMean(float t) {
  float lo = clamp(t - ${1/L.SOFT}, 0.0, 1.0), hi = clamp(t, 0.0, 1.0);
  return lo + (hi - lo) * ${M(L.SOFT)} * (t - 0.5 * (lo + hi));
}
// The lane speed, as eNoise: 2 on the axis, a quarter of it at the wall.
float pLaneG(float ay) { return max(2.0, 16.0 * (1.0 - 0.64 * ay * ay)) * 0.125; }
// The half-length the lane's speed gives (cl: the cell's length): longer with the square root of the speed, as Mesh's streaks are.
float pHalf(float vd, float g, float tsc, float cl) {
  return min(cl * (${M(L.HL0)} + ${M(L.HL1)} * sqrt(clamp(abs(vd) * g * 0.5 * tsc / ${M(L.SPEED_REF)}, 0.0, 1.7))), ${M(L.HL_MAX)} * cl);
}
// One layer at one flow-map phase (f: 0 to 1): the coverage of the streak in the pixel's cell and, where one could reach it, its neighbours'.
float pLayer(int id, float s, float qw, float f, float cell, float drift, float vd, float px, float t, float lanePx, float sc, float len, float tsc, uint seed) {
  float laneH = lanePx * px, cl = cell * sc * len;
  float lane = floor(qw / laneH), qc = (lane + 0.5) * laneH;
  float g = pLaneG(min(abs(qc) * pInvR, 1.0));
  uint ul = uint(int(lane)), ui = uint(id);
  float lo = float(pHash(ul, ui, seed) & 0xffffu) / 65536.0 * 31.0;
  float u = ((s - g * f * P_CYCLE * tsc) / cell + drift) / (sc * len) + lo;
  float i = floor(u), fr = u - i;
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float hl0 = pHalf(vd, g, tsc, cl);   // (the speed's half-length; a streak is never shorter than its radii, below)
  float rb = max(laneH * ${M(L.WIDTH0+L.WIDTH1)}, ${M(L.FLOOR_PX)} * px) * ${M(1+L.SOFTE)};
  float reach = (min(max(hl0, ${M(L.DASH)} * rb), ${M(L.HL_MAX)} * cl) + rb) / cl;   // (how far a streak reaches from its place, in cells; the longest it can be)
  float a = 0.0;
  for (int k = -1; k <= 1; k++) {
    if (k == -1 && fr >= reach - 0.28) continue;   // (a place is 0.28 to 0.72 along its cell: the neighbour on either side is drawn only where it can reach)
    if (k == 1 && fr <= 1.28 - reach) continue;
    uint h1 = pHash(uint(int(i) + k), ul, ui + seed);
    uint h2 = pHash(h1, ul, seed + 7u);
    float hx = float(h1 & 0xffffu) / 65536.0, hy = float(h1 >> 16) / 65536.0;
    float hz = float(h2 & 0x7ffu) / 2048.0, hw = float((h2 >> 11) & 0x7ffu) / 2048.0, hb = float(h2 >> 22) / 1024.0;
    float r0 = max(laneH * (${M(L.WIDTH0)} + ${M(L.WIDTH1)} * hz), ${M(L.FLOOR_PX)} * px);   // (never under 0.9 px across at the fitted view)
    float hl = min(max(hl0, ${M(L.DASH)} * r0), ${M(L.HL_MAX)} * cl);                          // (always a dash)
    float dx = (fr - float(k) - (0.28 + 0.44 * hx)) * cl;
    float dy = qw - qc - (hy - 0.5) * max(laneH - ${M(2+2*L.SOFTE)} * r0, 0.0);              // (the streak and its soft edge stay inside the lane)
    float d = length(vec2(max(abs(dx) - hl, 0.0), dy)) - r0;
    float e = max(${M(L.SOFTE)} * r0, 0.5 * px);
    float head = mix(${M(L.HEAD0)}, 1.0, smoothstep(-hl - r0, hl + r0, dx * dir));
    a = max(a, (1.0 - smoothstep(-e, e, d)) * pOn(t, hw) * (${M(L.BRIGHT0)} + ${M(L.BRIGHT1)} * hb) * head);
  }
  return a;
}
// A layer's mean coverage: the share of cells holding a streak, its mean brightness (0.8) and head ramp, times the capsule's mean area
// (pi r^2 + 4 hl r; the soft edge leaves it as it is) over the cell's. The radius and half-length are the drawn ones, floored and dashed
// as pLayer has them; the mean over the random size is taken at MEAN_N midpoints.
float pMean(float cell, float ay, float vd, float t, float lanePx, float sc, float len, float tsc, float px) {
  float laneH = lanePx * px, cl = cell * sc * len;
  float hl0 = pHalf(vd, pLaneG(ay), tsc, cl);
  float area = 0.0;
  for (int j = 0; j < ${L.MEAN_N}; j++) {
    float r = max(laneH * (${M(L.WIDTH0)} + ${M(L.WIDTH1)} * (float(j) + 0.5) / ${M(L.MEAN_N)}), ${M(L.FLOOR_PX)} * px);
    float hl = min(max(hl0, ${M(L.DASH)} * r), ${M(L.HL_MAX)} * cl);
    area += 3.14159265 * r * r + 4.0 * hl * r;
  }
  return min(pOnMean(t) * ${M(L.BRIGHT0+L.BRIGHT1*.5)} * ${M((1+L.HEAD0)/2)} * area / (${M(L.MEAN_N)} * cl * laneH), 1.0);   // (a lane under a few pixels across is full)
}
// The blood as streaks: the coverage 0 to 1 at arc length s and across qy (lanes), in eNoise's own arguments. vd: the display speed.
float pNoise(int id, float s, float qy, float D, float ay, float cell, float drift, float pxCell, float vd) {
  float qw = qy * pLaneW, px = max(pxCell * cell, 1e-6);
  float t = clamp(${M(L.OCC)} * pDens, 0.0, 1.0) * ${M(1+1/L.SOFT)};
  float f0 = fract(D / P_CYCLE), f1 = fract(f0 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * f0), w1 = 1.0 - abs(1.0 - 2.0 * f1);
  float mF = pMean(cell, ay, vd, t, ${be(ae)}, px);
  float mB = pMean(cell, ay, vd, t, ${be(te)}, px);
  // A narrow lumen (brief P5): under BACK_PX0 pixels across the back layer is not run at all (no reads, no hashes) and the front is raised
  // to the whole field's tone (NARROW_GAIN); its lanes are centred on the axis while the lumen is narrower than a lane (kW < 1: no change at all over BACK_PX1).
  float kW = smoothstep(${M(L.BACK_PX0)}, ${M(L.BACK_PX1)}, 2.0 / (max(pInvR, 1e-6) * px));
  float qwF = qw + ${M(.5*ae.lanePx)} * px * (1.0 - kW), qwB = qw + ${M(.5*te.lanePx)} * px * (1.0 - kW);
  // (The mean only where a whole cell is under a few pixels long and cannot show a streak.)
  float kF = smoothstep(${M(L.CELL_PX[0])}, ${M(L.CELL_PX[1])}, cell * ${M(ae.sc*ae.len)} / px), kB = smoothstep(${M(L.CELL_PX[0])}, ${M(L.CELL_PX[1])}, cell * ${M(te.sc*te.len)} / px);
  float F = mF, B = mB;
  if (kF > 0.0) {
    float c = 0.0;
    if (w0 > 0.0) c += w0 * pLayer(id, s, qwF, f0, cell, drift, vd, px, t, ${be(ae)}, ${ae.seed}u);
    if (w1 > 0.0) c += w1 * pLayer(id, s, qwF, f1, cell, drift, vd, px, t, ${be(ae)}, ${ae.seed}u);
    F = mix(mF, c, kF);
  }
  if (kB > 0.0 && kW > 0.0) {
    float c = 0.0;
    if (w0 > 0.0) c += w0 * pLayer(id, s, qwB, f0, cell, drift, vd, px, t, ${be(te)}, ${te.seed}u);
    if (w1 > 0.0) c += w1 * pLayer(id, s, qwB, f1, cell, drift, vd, px, t, ${be(te)}, ${te.seed}u);
    B = mix(mB, c, kB);
  }
  float full = clamp(1.0 - (1.0 - F) * (1.0 - ${M(te.bright)} * B), 0.0, 1.0);
  if (kW >= 1.0) return full;
  float gu = clamp((2.0 / (max(pInvR, 1e-6) * px) - ${M(L.NARROW_W0)}) / ${M(L.NARROW_STEP)}, 0.0, ${M(L.NARROW_GAIN.length-1)});
  int gi = min(int(gu), ${L.NARROW_GAIN.length-2});
  float gain = mix(P_NARROW[gi], P_NARROW[gi + 1], gu - float(gi));
  float alone = clamp(F * gain, 0.0, 1.0);
  return kW <= 0.0 ? alone : mix(alone, full, kW);
}`;var Q=64,Sa=.62,Ra=qt,To=96;var Ia=Array.from({length:7},(e,a)=>{let o=a+1,t=0;for(let n=0;n<o;n++){let s=o===1?0:((n+.5)/o*2-1)*.8;t+=o===1?1:Math.max(2,Math.floor(16*(1-s*s)+.5))/8}return t}),ko=`
float alongAt(int id, float u) {
  float ui = u * ${Q-1}.0;
  int i0 = min(int(ui), ${Q-2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`,Lo=`
float radAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${Q-1}.0;
  int i0 = min(int(ui), ${Q-2});
  return max(mix(texelFetch(rad, ivec2(i0, id), 0).r, texelFetch(rad, ivec2(i0 + 1, id), 0).r, ui - float(i0)), 0.3);
}
// The blood on the GPU (plan "Holding 120 Hz" \xA73.7): a stream's distance and its stagnant blood's drift as they stand at the blood
// clock bT, from where the CPU last anchored them (flow texel 6: that clock B0 and the display speed's factor). Between anchors a
// stream runs at the speed and stasis it was anchored with, so a steady flow sends nothing a frame. A factor of 0 (the lobule) is the CPU's own distance and drift, as before.
float flowD(int id, float D, float vd) {
  vec3 a = texelFetch(flow, ivec2(6, id), 0).xyz;
  // (a.z: how fast the display speed was changing at the anchor, so a beat's swing is integrated here and not re-sent every frame.)
  float t = bT - a.x;
  return a.y == 0.0 ? D : mod(D + (vd + 0.5 * a.z * t) * a.y * t, ${ot}.0);
}
float flowDrift(int id, float dr, float stasis) {
  vec2 a = texelFetch(flow, ivec2(6, id), 0).xy;
  return a.y == 0.0 ? dr : mod(dr + stasis * ${nt} * (bT - a.x), ${at}.0);
}
// A chained vessel's root stream (row rid): its distance and drift now, from its own row (ch: the CPU's copy, flow texel 5).
vec2 rootDD(int rid, vec2 ch) {
  vec3 a = texelFetch(flow, ivec2(6, rid), 0).xyz;
  if (a.y == 0.0) return ch;
  vec4 r0 = texelFetch(flow, ivec2(0, rid), 0);
  float tr = bT - a.x;
  return vec2(mod(r0.x + (r0.y + 0.5 * a.z * tr) * a.y * tr, ${ot}.0),
              mod(texelFetch(flow, ivec2(3, rid), 0).z + r0.w * ${nt} * (bT - a.x), ${at}.0));
}
`,Ae={samplers:`uniform highp sampler2D flow;          // per vessel: FLOW_TEXELS texels
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D bend;          // per vessel: the axis's signed curvature at each sample (setBend)
uniform sampler2D dye;                 // per vessel: dye concentration along the course`,pxW:"uniform float pxW;                     // world units per device pixel",speed:`uniform int lenOn;                     // 1: a streak's length follows its vessel's display speed (streak length with speed; ?streaklen=0 turns it off)
#if PLAIN == 0
uniform int origin;                    // 1: color parcels by where their blood came from
uniform int dyeOn;
#else
const int origin = 0, dyeOn = 0;
#endif`,ink:`uniform float clock;                   // seconds (wrapped), for the drift of stagnant blood
uniform highp float bT;                // the blood's own clock, from the stage's epoch (flowD: the streams advance here, not on the CPU)
uniform vec3 originCol[5];
uniform vec3 dyeCol;
uniform vec3 revCol;                   // the moving blood's color where flow runs backwards
uniform vec3 inkLight, inkDark;`,rows:"uniform float rows;",zoom:`flat in vec4 zoomA;                    // the zoom's numbers for the streaks, worked out per vertex (ZOOM_VS)
flat in vec3 zoomB;
uniform highp sampler2D noiseT;        // blood style D's baked tile (blood-tile.js)
uniform int bloodStyle;                // 2: blood style E (blood-tile.js eNoise): the same streaks from sines, no texture read. 1: blood style D (blood-tile.js): the streaks from the baked tile, which then sits on the noise unit; (style D until its tile is baked: style E)`},Mo=()=>[Ae.samplers,Ae.pxW,Ae.speed,Ae.ink,Ae.rows,Ae.zoom].join(`
`),Oa=()=>`const float SLOT = ${Ra}.0;
const float BINS = ${Jt}.0;
const float S_OFF = ${To}.0;
const float ORIGIN_GREY = ${Sa};
const int N_LAST = ${Q-1};
const float LANE_K[7] = float[7](${Ia.map(e=>e.toFixed(4)).join(", ")});`,Da=()=>`uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }`,Na=()=>`// The octaves' shares of the shimmer's noise (0.62 coarse, 0.38 fine), set per vessel by bloodAt: with the streaks' length following the
// vessel's speed (lenOn) the fine octave's share falls toward 0 for a fast vessel (its streaks run long) and rises for a slow one (short
// dashes), and lnS evens the spread (lnS 1: as always). Only the shares change, never a coordinate, so nothing in a streak moves for it.
float lnWb = 0.62, lnWf = 0.38, lnS = 1.0;
${Ao}
${yo}
${Eo}
// The caliber at arc length s, interpolated between its samples (not the nearest one), so nothing scaled by it steps along the vessel.
${ko}
${Lo}
// Lymph in its channel (a row whose f1.x is -1: lobule-zoom.js lymph rows): soft dashes run along it, each with an amber albumin core
// that is stronger the richer the protein. The row holds the dashes' phase (f0.x, world units), their pitch (f0.y, world), the protein
// (f0.z, 0 \u2026 1) and the dark theme (f0.w, 1 or 0). cover: the dash's coverage; core: the albumin core's. The dashes are drawn in
// the channel's own frame, so they follow the zoom and the pan with it and never lag the vessel they sit in.
void lymphAt(float s, float y, vec4 f0, float len, float R, out float cover, out float core) {
  float pitch = max(f0.y, 1.0);
  float x = (fract((s - f0.x) / pitch) - 0.5) * pitch;
  float hl = pitch * 0.17, r = R * 0.52, aa = max(pxW, 1e-3) * 0.75, ya = y * R;   // (thin and short: about half the channel's width, never filling it)
  cover = 1.0 - smoothstep(r - aa, r + aa, length(vec2(max(abs(x) - max(hl - r, 0.0), 0.0), ya)));
  float rc = r * 0.46;
  core = (1.0 - smoothstep(rc - aa, rc + aa, length(vec2(max(abs(x) - max(hl * 0.55 - rc, 0.0), 0.0), ya)))) * (0.2 + 0.55 * clamp(f0.z, 0.0, 1.0));
  float e = smoothstep(0.0, pitch * 1.2, min(s, len - s));
  cover *= e; core *= e;
}
// How much of a lumen is an opaque cast at arc length s (the EUS glue: its tint's w is 2, the same stretch and soft ends as the lumen colour's
// own tint in the vessel pass): the blood draws nothing inside it.
float castAt(int id, float s, float len) {
  vec4 tc = texelFetch(tube, ivec2(8, id), 0);
  if (tc.w < 1.5) return 0.0;
  vec4 tr = texelFetch(tube, ivec2(9, id), 0);
  return smoothstep(tr.x * len - tr.z, tr.x * len + tr.z, s) * (1.0 - smoothstep(tr.y * len - tr.z, tr.y * len + tr.z, s));
}
// Moving blood in one lumen at arc length s (world, may run past either end) and across y (\u22121 \u2026 1):
// the parcels' color and coverage, to be laid over the lumen color col. Read once in main for it and the arrowheads alike
// (they were read by each): the vessel's flow texels f0 and f1 (f1.z > 0: main draws neither where it is not), its length,
// the caliber R at s (radAt) and its own colour vc at s.
vec4 bloodAt(int id, float s, float y, vec3 col, vec4 f0, vec4 f1, float len, float R, vec3 vc) {
  float D = f0.x, vd = f0.y, flux = f0.z, stasis = f0.w;
  float dir = vd < 0.0 ? -1.0 : 1.0;
  // Streak length with speed: a fast vessel's streaks run long, a slow one's are short dashes, so a still frame (a paused model, a
  // screenshot, a handout) shows speed too. The factor is the square root of the display speed (the speed the streaks travel at, eased
  // like them) over the healthy portal trunk's 36, kept to 0.6 \u2026 1.6 and let go to 1 as the vessel stagnates (the smoke is as it was). It
  // moves the octaves' shares (lnWb, lnWf) from today's 0.62 / 0.38: the fine octave fades out toward 1.6 (the streaks about 1.45 times as long)
  // and grows toward 0.6 (about 0.75 times), the spread kept level (lnS) so the streaks' number and brightness hold within 7 %.
  lnWb = 0.62; lnWf = 0.38; lnS = 1.0;
  if (lenOn == 1) {
    float kk = mix(clamp(sqrt(abs(vd) / 36.0), 0.6, 1.6), 1.0, stasis);
    float lu = clamp(kk >= 1.0 ? (kk - 1.0) / 0.6 : (kk - 1.0) / 0.4, -1.0, 1.0);   // 0 at today's length, +1 longest, \u22121 shortest
    lnWf = lu >= 0.0 ? 0.38 * (1.0 - lu) : 0.38 - 0.27 * lu;
    lnWb = 1.0 - lnWf;
    lnS = sqrt(0.5288 / (lnWb * lnWb + lnWf * lnWf));
  }
  // Lanes ~5 device pixels apart (more when zoomed in), parcels at least ~8 apart along a lane.
  float Lg = zoomA.x;
  float lc = clamp(1.7 * R / Lg, 1.0, 7.0) - 1.0;   // (the continuous lane count, less one: LANE_K, laneSum)
  int lk = min(int(lc), 5);
  float sumK = mix(LANE_K[lk], LANE_K[lk + 1], lc - float(lk));
  // Light or dark ink from the vessel's own color (not the shaded pixel, whose highlights would flip a streak
  // between white and dark as it passes), eased across a range so a vessel near the cut-off never switches.
  float pale = origin == 0 ? smoothstep(0.58, 0.66, dot(vc, vec3(0.299, 0.587, 0.114))) : 0.0;   // the origin streams always take light ink
  // The streaks read as bright light on a dark lumen, deep ink on a pale one.
  vec3 core = mix(mix(col, inkLight, 0.62), mix(col, inkDark, 0.45), pale);
  vec3 halo = mix(mix(col, inkLight, 0.3), mix(col, inkDark, 0.2), pale);
  // Flow running backwards: the moving blood warms to orange (not over the origin streams, whose
  // amber it would be lost in).
  float rev = origin == 1 ? 0.0 : f1.w;
  if (rev > 0.0) { core = mix(core, mix(revCol, inkLight, 0.18), rev); halo = mix(halo, mix(col, revCol, 0.7), rev); }
  // Shimmer: long, soft streaks of light, like light on a flowing liquid, each carried at its own
  // lane's laminar speed (fastest on the axis, so the sheen visibly shears), over a faint glow
  // along the core. Brighter and denser where more blood passes; stagnant blood barely stirs.
  float ay = clamp(abs(y), 0.0, 1.0), yl = ay * 0.8;
  float k8 = max(2.0, 16.0 * (1.0 - yl * yl));
  float k0 = floor(k8), t = smoothstep(0.2, 0.8, k8 - k0);
  // Its scale follows the zoom without steps: the lane width from a continuous lane count, and the
  // cell size cross-fading between the slot scales (1, 2, 4 slots) over a band of zoom, so it never steps.
  float qy = y * R / max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
  float drift = flowDrift(id, texelFetch(flow, ivec2(3, id), 0).z, stasis);   // (anchored per stream on the CPU: blood.js drift, flowDrift)
  // Stagnant blood swirls (visual-style B6): besides sliding along, its lanes sway across the vessel on two slow eddies a quarter turn apart,
  // each standing at its own place along it, turned by the drift itself (so by the stasis: none at 0, and no pop in or out as it eases; 60
  // whole turns to the drift's 50-cell period, so the wrap is seamless, about 20 s a turn at full stasis).
  float sw = 6.2831853 * 1.2 * drift;
  qy += stasis * 0.6 * (sin(sw) * sin(s * 0.021 + float(id) * 1.7) + cos(sw) * sin(s * 0.034 + float(id) * 0.9 + 2.0));
  // A stream carried on from another vessel (flow texel 4: the root's row + 1, A, B, its weight cw; texel 5: the root's distance
  // and drift): the root's pattern at s_e = A + B s, mixed with the vessel's own by cw while a link forms or lets go.
  vec4 ch4 = texelFetch(flow, ivec2(4, id), 0);
  float cw = ch4.w;
  float sA = zoomA.y, sB = zoomA.z, lf = zoomA.w;
  float nz = 0.0;
  if (bloodStyle == 1) {
    // Style D: the baked tile read twice (dNoise), one zoom scale (mips do the rest), the pattern placed by the stream's distance as ever,
    // so a chained child carries its root's pattern on (the flow-time coordinate of the plan, through the existing chain).
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
    // (The cell size is world-fixed: two fixed scales cross-faded by lf, as the lattice does, never a size that follows the zoom, so
    // a pinch cannot slide the streaks along the vessel. "Lobule glitch", 6 Nov: round 3 review B1.)
    float cA = 5.12 * sA, cB = 5.12 * sB, dxA = pxW / (50.0 * cA), dxB = pxW / (50.0 * cB), dyv = pxW / laneW * ${_o};
    if (cw < 1.0) {
      nz = dNoise(id, s, qy, D, ay, cA, drift, dxA, dyv);
      if (lf > 0.0) nz = mix(nz, dNoise(id, s, qy, D, ay, cB, drift, dxB, dyv), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = rootDD(rid, texelFetch(flow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3);
      float nc = dNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, dxA * bs, dyv);
      if (lf > 0.0) nc = mix(nc, dNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, dxB * bs, dyv), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  } else if (bloodStyle == 2) {
    // Style E: style D's flow-map with sines (eNoise), no texture read; chained children carry the root's pattern on, as in D.
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
    float cA = 5.12 * sA, cB = 5.12 * sB;
    if (cw < 1.0) {
      nz = eNoise(id, s, qy, D, ay, cA, drift, pxW / cA);
      if (lf > 0.0) nz = mix(nz, eNoise(id, s, qy, D, ay, cB, drift, pxW / cB), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = rootDD(rid, texelFetch(flow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3);
      float nc = eNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, pxW / cA * bs);
      if (lf > 0.0) nc = mix(nc, eNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, pxW / cB * bs), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  } else if (bloodStyle == 3) {
    // Style P (blood-particles.js pNoise): particles in eNoise's own pattern coordinates, so the chained stream, stasis and reversal work
    // as in E. dens (computed below for every style, the same arithmetic again here) thins the cells through pDens; pLaneW and pInvR give the
    // lanes' width and their distance from the axis. A chained child's particles stretch by its root's speed.
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
    float cA = 5.12 * sA, cB = 5.12 * sB;
    float sxP = zoomB.z, ovP = max(flux * sxP / (max(abs(vd), 2.0) * sumK), 1.0);
    pLaneW = laneW; pInvR = 1.0 / max(R, 1e-3);
    pDens = sqrt(clamp(max(min(1.0, flux * sxP / (max(abs(vd), 2.0) * sumK)), 0.6 * stasis), 0.0, 1.0)) * (1.0 + 0.35 * clamp(2.885 * (ovP - 1.0) / (ovP + 1.0), 0.0, 1.0));
    if (cw < 1.0) {
      nz = pNoise(id, s, qy, D, ay, cA, drift, pxW / cA, vd);
      if (lf > 0.0) nz = mix(nz, pNoise(id, s, qy, D, ay, cB, drift, pxW / cB, vd), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = rootDD(rid, texelFetch(flow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3), vr = texelFetch(flow, ivec2(0, rid), 0).y;
      float nc = pNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, pxW / cA * bs, vr);
      if (lf > 0.0) nc = mix(nc, pNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, pxW / cB * bs, vr), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  }
  float sx = zoomB.z;
  float p = max(min(1.0, flux * sx / (max(abs(vd), 2.0) * sumK)), 0.6 * stasis);   // (the density floor of stagnant blood: 0.45 until visual-style B6)
  float ends = min(f1.x > 0.5 ? smoothstep(0.0, 1.5 * sx, s) : 1.0, f1.y > 0.5 ? smoothstep(0.0, 1.5 * sx, len - s) : 1.0);
  // Past a packed lane (B2): the streaks denser and brighter, up to 35 % more, by about log2 of the overflow (2.885 (x \u2212 1) / (x + 1),
  // the series of log2 near 1, within 4 % of it up to 2, with no transcendental a pixel; at most one doubling), so a TIPS carrying
  // twice a packed lane's flow reads as more blood than a portal vein just packed. Continuous in the flow: it never pops; 1 at or
  // under a packed lane.
  float ovS = max(flux * sx / (max(abs(vd), 2.0) * sumK), 1.0);
  float gS = 1.0 + 0.35 * clamp(2.885 * (ovS - 1.0) / (ovS + 1.0), 0.0, 1.0);
  float dens = sqrt(clamp(p, 0.0, 1.0)) * gS;
  // Soft-edged and subdued, so up close the sheen reads as moving light, not as stripes painted on the tube;
  // a steady glow along the axis carries most of the brightness.
  float streak = smoothstep(0.46 - 0.08 * dens, 0.9, nz);
  if (bloodStyle == 3) streak = nz;   // (style P: the particles' coverage as it is)
  float wall = 1.0 - smoothstep(0.7, 1.0, ay);
  float glowCore = 0.22 * (1.0 - ay * ay) * (1.0 - ay * ay);
  float a = clamp(streak * (0.32 + 0.26 * dens) + glowCore, 0.0, 0.75) * wall * ends * f1.z * mix(1.0, 0.76, stasis);   // (stagnant blood's alpha: 0.6 until visual-style B6)
  vec4 sOut = vec4(mix(halo, core, smoothstep(0.0, 0.7, streak)), a);
  if (bloodStyle != 1) return sOut;
  // Style D's tube light (arithmetic only): a soft highlight a third of the way across, a darker rim at the wall and a faint glow along
  // the axis, laid under the streaks, so the lumen reads as a round tube. Strength follows the streaks' own (ends, stream strength).
  float lit = f1.z * ends;
  float hl = exp(-2.4 * (y + 0.38) * (y + 0.38) * 4.0) * (1.0 - smoothstep(0.75, 1.0, ay));
  float rim = smoothstep(0.62, 1.0, ay);
  float ha = 0.12 * hl * lit, ra = 0.2 * rim * lit;
  vec4 under = over(vec4(inkDark * ra, ra), vec4(mix(col, inkLight, 0.7) * ha, ha));
  vec4 top = vec4(sOut.rgb * sOut.a, sOut.a);
  vec4 res = over(top, under);
  return res.a > 0.0 ? vec4(res.rgb / res.a, res.a) : vec4(0.0);
}
// Where a lumen's blood comes from, as streams side by side (laminar flow keeps them apart): SMV,
// IMV, splenic vein, hepatic artery, then the rest of the body, each as wide as its share of the flow.
// A vessel whose blood sloshes to and fro (flow texel 6, w: its P\xE9clet number, signed by the flow from \u2192 to; 0 for one blood all
// along) mixes from its upstream junction's blend (texel 2) into its downstream one's (texel 7) along its length, as the dye mixes:
// (e^(Pe x) \u2212 1) / (e^Pe \u2212 1) of the way, x from the upstream end (blood.js originEnds). Two reads more, only in such a vessel.
vec3 originAt(int id, float s, float y, float R) {
  vec4 f2 = texelFetch(flow, ivec2(2, id), 0);
  float pe = texelFetch(flow, ivec2(6, id), 0).w;
  if (pe != 0.0) {
    float x = clamp(s / max(texelFetch(tube, ivec2(5, id), 0).z, 1.0), 0.0, 1.0), P = abs(pe);
    if (pe < 0.0) x = 1.0 - x;
    // (Pe from 10: a shunt runs into the vein part-way, at 10 less Pe of its length from the upstream end; its blend from there on, blood.js originEnds join.)
    float g = P >= 10.0 ? smoothstep(P - 10.03, P - 9.97, x) : P < 0.05 ? x : (exp(P * x) - 1.0) / (exp(P) - 1.0);
    f2 = mix(f2, texelFetch(flow, ivec2(7, id), 0), g);
  }
  float u = clamp((y + 1.0) * 0.5, 0.0, 1.0), e = clamp(0.6 * pxW / max(R, 0.3), 0.01, 0.12);
  float c1 = f2.x, c2 = c1 + f2.y, c3 = c2 + f2.z, c4 = c3 + f2.w;
  vec3 c = originCol[0];
  c = mix(c, originCol[1], smoothstep(c1 - e, c1 + e, u));
  c = mix(c, originCol[2], smoothstep(c2 - e, c2 + e, u));
  c = mix(c, originCol[3], smoothstep(c3 - e, c3 + e, u));
  c = mix(c, originCol[4], smoothstep(c4 - e, c4 + e, u));
  return c;
}`,Fa=()=>`// The axis's signed curvature at arc length s (1 / world units; positive turning toward +y).
float bendAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${Q-1}.0;
  int i0 = min(int(ui), ${Q-2});
  return mix(texelFetch(bend, ivec2(i0, id), 0).r, texelFetch(bend, ivec2(i0 + 1, id), 0).r, ui - float(i0));
}`,Ca=()=>`// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall
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

// The bolus's leading edge (0 \u2026 1) where the dye c is: how much thinner the dye is four pixels ahead along the flow, so a band a few
// pixels wide on the front's own side, soft as the front is.
float dyeEdge(int id, float s, float y, float c) {
  float ahead = (texelFetch(flow, ivec2(0, id), 0).y < 0.0 ? -4.0 : 4.0) * pxW;
  return clamp((c - dyeAt(id, s + ahead, y)) * 3.0, 0.0, 1.0);
}`,So=()=>[Oa(),Da(),Na(),Fa(),Ca()].join(`
`),Pa=()=>`    if (chev == 1 && chevQuad == 0 && f1.z > 0.0 && !isLy) {
      vec2 c = chevAt(id1, s1, y1, f0, f1, len1, R1);
      // None where another vessel joins, except where the two draw one pattern: there the heads run on from one into the other,
      // mixed by share as the streaks are.
      if (rel > 0.0) c = mix(c, chevAt(id2, s2, y2, f0b, f1b, len2, R2), b * rel);
      c *= 1.0 - smoothstep(0.02, 0.25, b) * (1.0 - rel);
      // (The cut-outs below only ever scale a head down: where there is none, c stays zero whatever they say, so they are not
      // tested at all. Most lumen pixels have no head.)
      if (c.x + c.y > 0.0) {
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
      }
      if (c.x + c.y > 0.0) {
        // A faint rim lifts the head off the lumen. By the vessel's own colour (a lumen's lightness, an orange vessel) and the eased
        // reversed flag, not a switch, so a head follows the vessel's colour as that eases and never pops: a dark core with a light rim
        // on a pale lumen, near-white with a dark rim on a dark one, orange if reversed (chevInks).
        vec3 hCore, hRim;
        chevInks(vc1, f1.w, hCore, hRim);
        col = mix(col, hRim, c.y * 0.75 * vis * flowA * blendA.y);
        col = mix(col, hCore, c.x * vis * flowA * blendA.y);
      }
    }
`,As=()=>`uniform sampler2D lumenL;               // the Tube's lumen layer: the lumen in front, drawn by the tubes this frame (premultiplied; alpha: its coverage x the vessel's opacity)
uniform float lumSc;                   // 1 while the lumen layer is a share of the vessel layer's size (read filtered and masked by the layer's own lumen), else 0 (read texel for texel)
`,ys=()=>[ko,Lo].join(`
`),_s=({LUMEN2:e,FLOW_TEXELS:a})=>`  // The Tube: the lumen as the tubes drew it this frame, at the texel the vessel layer is read at (a tier frame's small targets: filtered, as the layer is).
  vec4 L = vec4(0.0);
  // (The lumen layer is drawn on a frame only while the blood streaks, the dye or the origin colours are on (veins-gl.js lumenFrame: the same three tests). With all three off,
  // the arrowheads alone, it is not drawn and holds an older frame's lumens, or none: it is not read, and the vessel layer's own lumen (gbuf) says where a lumen is. Read
  // anyway, a lumen the old layer left empty was left as drawn on a blood-only frame while the heads' quads went on laying a head over it, a stack of heads smeared along
  // every vessel but the widest (Mohammad's Mac at full resolution, 10 Nov 2026).)
  bool lumOn = blood == 1 || dyeOn == 1 || origin == 1;
  // (A lumen layer smaller than the vessel layer is read filtered at the layer texel's centre, and then masked below by the vessel layer's own lumen at full size; not in a tier frame's small targets.)
  bool lumM = lumOn && lumSc > 0.0 && lowSz.x == 0;
  if (inL && lumOn) L = lowSz.x > 0 ? texture(lumenL, lowUV) : lumM ? texture(lumenL, (vec2(lp) + 0.5) / vec2(lSize)) : texelFetch(lumenL, lp, 0);
  bool chevC = chev == 1 && chevQuad == 0;   // (the arrowheads drawn here, not by their quads: they are drawn on the row in front, so they read gbuf)
  // A blood-only frame leaves a pixel with no lumen as drawn (the other builds' test, made on the lumen layer's alpha: it is the layer the blood is in).
  if (bloodOnly == 1 && lumOn && L.a == 0.0 && !chevC) discard;
  uvec4 g = uvec4(0u);
  if (inL && ((bloodOnly == 1 && (stillOn == 1 || !lumOn)) || chevC || lumM)) g = texelFetch(gbuf, lp, 0);
  g.x &= ${e-1}u;
  // The share-size lumen layer, masked by the vessel layer's lumen at full size: no blood where the layer holds no lumen (so none spills over an outline or past a wall), and the lumen's
  // opacity is the layer's (g.w >> 8: the alpha the layer's lumen was drawn with), the small layer giving only the colour.
  if (lumM && inL) L = g.x == 0u || L.a < 0.003 ? vec4(0.0) : vec4(L.rgb / L.a * (float(g.w >> 8u) / 255.0), float(g.w >> 8u) / 255.0);
  if (bloodOnly == 1 && L.a == 0.0 && g.x == 0u) discard;
  // A lumen whose vessels' rows have not changed since the last picture, which had the same uniforms (stillOn), comes out as it is.
  if (bloodOnly == 1 && stillOn == 1 && g.x > 0u && texelFetch(flow, ivec2(${a}, int(g.x) - 1), 0).x == 0.0) discard;
`,Es=()=>`  if ((blood == 1 || dyeOn == 1 || origin == 1 || chevC) && v.a > 0.01) {
    vec3 col = v.rgb / v.a;
    if (blood == 1 || dyeOn == 1 || origin == 1) col = mix(col, min(L.rgb / max(L.a, 1e-4), vec3(1.0)), clamp(L.a / max(v.a, 1e-3), 0.0, 1.0));
    if (chevC && g.x > 0u) {
      // The arrowheads drawn here, on the row in front (the Tube has no second lumen: nothing is joined, so b, rel and the second row are zero).
      int id1 = int(g.x) - 1;
      float s1 = float(g.y) / 16.0 - S_OFF, y1 = float(g.z) / 32767.5 - 1.0;
      float vis = clamp(float(g.w >> 8u) / 255.0 / max(v.a, 1e-3), 0.0, 1.0);
      vec4 f0 = texelFetch(flow, ivec2(0, id1), 0), f1 = texelFetch(flow, ivec2(1, id1), 0);
      f0.x = flowD(id1, f0.x, f0.y);
      float len1 = 1.0, R1 = 0.3;
      vec3 vc1 = vec3(0.0);
      if (f1.z > 0.0) {
        len1 = max(texelFetch(tube, ivec2(5, id1), 0).z, 1.0);
        R1 = radAt(id1, s1, len1);
        vc1 = mix(texelFetch(tube, ivec2(0, id1), 0).rgb, texelFetch(tube, ivec2(1, id1), 0).rgb, alongAt(id1, clamp(s1 / len1, 0.0, 1.0)));
      }
      float rel = 0.0, b = 0.0, s2 = 0.0, y2 = 0.0, len2 = 1.0, R2 = 0.3;
      int id2 = -1;
      vec4 f0b = vec4(0.0), f1b = vec4(0.0);
      bool isLy = f1.x < -0.5;
      ${Pa()}
    }
    v = vec4(col * v.a, v.a);
  }
`;function Dt(e,a){let o=e.indexOf(a);if(o<0)throw new Error(`tube-lumen-glsl: ${a} is not in the shared shading text`);let t=e.indexOf("{",o),n=0;for(;t<e.length;t++)if(e[t]==="{")n++;else if(e[t]==="}"&&--n===0)return e.slice(o,t+1);throw new Error(`tube-lumen-glsl: ${a} has no closing brace`)}var J=e=>Number.isInteger(e)?e.toFixed(1):String(e),z={onLight:{low:[.16,.3,.24],high:[.52,.26,0]},onDark:{low:[.82,.96,.96],high:[1,.84,.32]},luma:[.45,.6],ramp:[.1,.9],occ:[.5,.75],faint:.8,gain:3.4,cap:.97,glow:.22,look:36},Wa=2,Ba=.02,Ro=e=>{let{F_DOTTED:a,EDGE:o,ENT_W:t,N_SAMPLES:n,MAX_TIERS:s}=e;if(n!==Q)throw new Error("tube-lumen-glsl: the arc length is packed over 64 samples, so N_SAMPLES must be 64");let r=n-1,i=pe(e);return`#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${e.PLAIN?1:0}
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the outline's skirt
in vec2 vG;                            // offset from the centreline point to this point (world units; (0, 0) on the centreline)
in float vRad;                         // the lumen's radius here, world units (a web: 4 x its larger member's radius)
${Se}
${Mo()}
uniform int fx;                        // 1: shading (off in the figure view): the cel tones below
uniform int blood;                     // 1: draw the blood
uniform vec3 blendA;                   // 0..1 each: the streaks, the chevrons and the origin colours fading in or out (switched on or off)
uniform float flowA;                   // 0..1: how visible the moving blood is (it fades in once the view is still)
uniform int still;                     // 1: reduced motion (blood-trouble.js freezes its swirl)
uniform highp sampler2D ent;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform vec4 invA;                     // device pixels \u2192 world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen
uniform vec2 sizeF;                    // the layer, device pixels
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform float tierAlpha[${s}];
uniform int tierGroup[${s}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
out vec4 outColor;                     // the lumen's colour \xD7 its coverage \xD7 the vessel's opacity (premultiplied)

const float LAST = ${r}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${n/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${t}, t / ${t}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
// (alongAt, radAt, the noise styles, bloodAt, castAt, lymphAt, originAt, the dye: the compositor's own text, compLumenFns.)
${So()}

${xo}

${Dt(i,"void vesAttrs(")}

${Dt(i,"vec4 ditherOut(")}

${Dt(i,"float ringOpen(")}

// A vessel seen end-on (the lobule's portal venule, arteriole and central vein: a disc) has no across to lay streams side by side over, so its blood is
// a pie: wedges in originAt's order (SMV, IMV, splenic vein, hepatic artery, the rest) from twelve o'clock, clockwise, each as wide as its share. Such a row
// says so in flow texel 7: z = -2 (no blend is ever below 0) and xy = the disc's centre (world; lobule-zoom.js putOrigin). originAt is given the angle as its
// across (u = angle / 2 pi) and a radius that makes its edge as soft as a pixel at this pixel's distance from the centre; the seam at twelve o'clock mixes
// the last wedge into the first. (Tube only: the Classic and Mesh compositors keep their text, byte for byte.)
vec3 originHere(int id, float s, float y, float R, vec2 w) {
  if (texelFetch(flow, ivec2(7, id), 0).z > -1.5) return originAt(id, s, y, R);
  vec2 d = w - texelFetch(flow, ivec2(7, id), 0).xy;
  float u = fract(atan(d.x, -d.y) * 0.15915494 + 1.0);
  float e = clamp(0.6 * pxW / (max(length(d), 3.0 * pxW) * 6.2831853), 0.01, 0.08);
  float Re = 0.6 * pxW / e;
  vec3 c = originAt(id, s, u * 2.0 - 1.0, Re);
  vec3 other = originAt(id, s, (u < 0.5 ? 0.9999 : 0.0001) * 2.0 - 1.0, Re);
  return mix(c, other, 0.5 * (1.0 - smoothstep(0.0, e, u < 0.5 ? u : 1.0 - u)));
}

${Re(n)}
${$e(e.VEIL_K)}

// (The cel tones of the vessel layer's fill, tube-cel-glsl.js: this layer's colour replaces the fill's, so the tones are laid on it, over the blood.)
${Lt()}

void main() {
  int id = vRow;
  vec4 t2 = T(id, 2), t5 = T(id, 5);
  int flags = int(t2.z + 0.5);
  // A closed potential collateral (dotted) shows no stream: the vessel shader writes none for it.
  if ((flags & ${a}) != 0) discard;
  float u = vI / LAST;                 // (how far along, 0\u20131)
  float R = vRad, D = vD;
  // The row's clip range, as segNear applies it (a vessel drawing on has a round end where the clip cuts it).
  if (t5.x > 0.0 || t5.y < 1.0) {
    float ext = max(t5.x - u, u - t5.y) * t5.z;
    if (ext > 0.0) D = length(vec2(D + R, ext)) - R;
  }
  // The lumen only, soft at its wall as the vessel layer's lumen is.
  float aa = pxW * ${o};
  float aL = clamp(0.5 - D / aa, 0.0, 1.0);
  if (aL <= 0.0) discard;
  // This pixel's world position, worked out from the pixel itself, as the vessel shader does.
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  // A row's end on another row (tube-join-glsl.js): the other row's pixels are dropped here as in tubeLeanFS, so this layer and the vessel layer agree.
  JoinEnd je = joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, R, pxW);
  if (je.drop) discard;
  // The vessel's colour and opacity here, as tubeLeanFS gets them (its tier, flags, colour along it, alpha with the fades and the veil).
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${e.VEIL_K} * organK : 0.0;
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(id, u, u, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  aCol = mix(aCol, je.col, je.wc);   // (as tubeLeanFS: the colour blends into the other row's near a join)
  int ti = int(aTier + 0.5);
  int grp = tierGroup[ti];
  float wsel = grp == 1 ? aSel : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
  float gf = grp == 0 ? 1.0 - occl * aOf : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
  float lumA = aL * aA * tierAlpha[ti] * gf;
  float jr = (flags & ${2048}) != 0 ? 1.0 : joinRamp(je, aA * tierAlpha[ti] * gf, occl);   // (a continuation eases its opacity to its partner's: tube-join-glsl.js)
  lumA *= je.fl * jr;   // (a branch fading into its trunk, as tubeLeanFS has it)
  if (lumA <= ${Ba}) discard;
  // The place in the stream, as packFlow would have stored it and the compositor unpacked it: the arc length and the across.
  int sg = clamp(int(vI), 0, ${n-2});
  vec2 sa = PT(id, sg), ba = PT(id, sg + 1) - sa;
  float across = (ba.x * vG.y - ba.y * vG.x) * inversesqrt(max(dot(ba, ba), 1e-8));
  float s1 = u * t5.z;
  float len1 = max(t5.z, 1.0);
  float R1 = radAt(id, s1, len1);
  bool web = vRad > ${Wa}.0 * R1;   // (a web: its vRad is 4 x a radius; see the header)
  float y1 = web ? 1.0 : clamp(across / R1, -1.0, 1.0);
  int id1 = id;

  // ---- the compositor's lumen section from here (COMP_FS main), for one lumen pixel with no second lumen ----
  vec3 col = aCol;
  float vis = 1.0;
  if (origin == 1) {
    // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey.
    float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / ORIGIN_GREY, 0.55, 1.45);
    // A vessel that carries no blood (origin fractions marked \u22121, e.g. a lymphatic) keeps its own color.
    vec3 oc = texelFetch(flow, ivec2(2, id1), 0).x < -0.5 ? col : min(originHere(id1, s1, y1, max(texelFetch(rad, ivec2(N_LAST / 2, id1), 0).r, 0.3), p) * shade, vec3(1.0));
    col = mix(col, oc, vis * blendA.z);
  }
  // The front lumen's flow, length, caliber here and own colour.
  vec4 f0 = vec4(0.0), f1 = vec4(0.0);
  vec3 vc1 = vec3(0.0);
  if (blood == 1) {
    f0 = texelFetch(flow, ivec2(0, id1), 0); f1 = texelFetch(flow, ivec2(1, id1), 0);
    f0.x = flowD(id1, f0.x, f0.y);   // (the distance now: flowD)
    if (f1.z > 0.0) {
      vc1 = mix(texelFetch(tube, ivec2(0, id1), 0).rgb, texelFetch(tube, ivec2(1, id1), 0).rgb, alongAt(id1, clamp(s1 / len1, 0.0, 1.0)));
    }
  }
  bool isLy = f1.x < -0.5;   // (a lymph row: dashes, never blood streaks)
  if (blood == 1 && blendA.x > 0.0 && f1.z > 0.0 && !isLy) {
    // Blood that shows trouble (V7, blood-trouble.js; style P only): a shimmer where the flow reverses, a jet and eddies at a narrowing. The place
    // the streaks are drawn at is bent, their density (the flux) scaled; untroubled blood is (s1, y1, 1) and byte for byte as before.
    vec4 tr = vec4(s1, y1, 1.0, 0.0);
    if (bloodStyle == 3) { tr = troubleAt(id1, s1, y1, R1, len1, f0.y, f1.w > 0.5); f0.z *= tr.z; }
    vec4 A = bloodAt(id1, tr.x, tr.y, col, f0, f1, len1, R1, vc1);
    float a = A.a * (1.0 - castAt(id1, s1, len1));
    if (a > 0.0) col = mix(col, A.rgb, clamp(a * vis * flowA * blendA.x, 0.0, 1.0));
  }
  if (blood == 1 && isLy && f1.z > 0.0) {
    // Lymph. The lobule's lymph rows (lobule-zoom.js) carry the dashes' phase, pitch, protein and theme in flow texel 0, as before. A row that ALSO
    // carries a stream in texel 7 (x: the distance now, y: the signed speed, blood's D and vd; y = 0: none) is drawn as streaks, the same style
    // as the blood (bloodAt, so the Tube's style P / D4 mist), coloured by the protein: a cool ink at 0 %, albumin amber at 100 % (dark on a light channel, light on a dark one) (the protein f0.z is the lobule's lyProt scaled 0.42 \u2026 0.84 to 0 \u2026 1), fainter when poorer. A row with no stream keeps the dashes.
    float prot = clamp(f0.z, 0.0, 1.0);
    vec4 sd = texelFetch(flow, ivec2(7, id1), 0);
    float aLy = clamp(f1.z * vis * flowA, 0.0, 1.0);   // (not blendA.x: the streaks' switch, which the lymph does not follow)
    if (sd.y != 0.0) {
      float cl = dot(vc1, vec3(0.299, 0.587, 0.114));
      float onLight = smoothstep(${J(z.luma[0])}, ${J(z.luma[1])}, cl);   // 1: a light channel, dark ink; 0: a dark one, light ink
      float pk = smoothstep(${J(z.ramp[0])}, ${J(z.ramp[1])}, prot);
      vec3 inkL = mix(vec3(${z.onLight.low.join(", ")}), vec3(${z.onLight.high.join(", ")}), pk);
      vec3 inkD = mix(vec3(${z.onDark.low.join(", ")}), vec3(${z.onDark.high.join(", ")}), pk);
      vec3 ink = mix(inkD, inkL, onLight);
      // (blood's density divisor, so that the streaks fill occ of a lane whatever the zoom: bloodAt's p = flux * sx / (|vd| sumK) = occ.)
      float lcn = clamp(1.7 * R1 / zoomA.x, 1.0, 7.0) - 1.0;
      int lkn = min(int(lcn), 5);
      float sumK = mix(LANE_K[lkn], LANE_K[lkn + 1], lcn - float(lkn));
      float occ = mix(${J(z.occ[0])}, ${J(z.occ[1])}, prot);
      float lyV = (sd.y < 0.0 ? -1.0 : 1.0) * max(abs(sd.y), ${J(z.look)});   // (the look at the trunk's speed; the distance sd.x still moves them at the lymph's own)
      vec4 ly0 = vec4(sd.x, lyV, occ * abs(lyV) * sumK / zoomB.z, 0.0);
      vec4 A = bloodAt(id1, s1, y1, col, ly0, vec4(1.0, 1.0, f1.z, 0.0), len1, R1, vc1);
      // bloodAt's alpha is the streaks plus a glow along the axis (glowCore, times the wall and the ends): the glow is taken out, so only a streak tints.
      float ayL = clamp(abs(y1), 0.0, 1.0);
      float glowL = ${J(z.glow)} * (1.0 - ayL * ayL) * (1.0 - ayL * ayL) * (1.0 - smoothstep(0.7, 1.0, ayL)) * min(smoothstep(0.0, 1.5 * zoomB.z, s1), smoothstep(0.0, 1.5 * zoomB.z, len1 - s1)) * f1.z;
      float a = min(max(A.a - glowL, 0.0) * ${J(z.gain)} * mix(${J(z.faint)}, 1.0, prot), ${J(z.cap)}) * (1.0 - castAt(id1, s1, len1));
      col = mix(col, ink, clamp(a * vis * flowA, 0.0, 1.0));
    } else {
      float lc, lk;
      lymphAt(s1, y1, f0, len1, R1, lc, lk);
      // The dash's ink: clearly deeper than the channel's own green (lighter in the dark theme); the core a visible but quiet albumin amber.
      vec3 ink = mix(vc1, f0.w > 0.5 ? vec3(0.78, 0.95, 0.70) : vec3(0.30, 0.56, 0.28), 0.62);
      vec3 amber = f0.w > 0.5 ? vec3(0.95, 0.71, 0.29) : vec3(0.89, 0.60, 0.12);
      col = mix(col, ink, lc * aLy);
      col = mix(col, amber, lk * aLy);
    }
  }
  if (dyeOn == 1) {
    float c = dyeAt(id1, s1, y1);
    // A rich, slightly glowing column: the dye tints the lumen and lifts it a little.
    float inLumen = 1.0 - smoothstep(0.6, 0.85, abs(y1));
    float dyeK = max(smoothstep(0.0, 0.2, vis), inLumen);
    col = mix(col, dyeCol, clamp(c, 0.0, 1.0) * 0.9 * dyeK);
    // The bolus's leading edge, a few pixels of the lumen's own deep shade where the dye thins out ahead of it.
    if (c > 0.02) {
      float de = dyeEdge(id1, s1, y1, c);
      col = mix(col, vc1 * 0.45, de * 0.55 * clamp(c, 0.0, 1.0) * dyeK);
    }
  }
  // The vessel layer's fill had the cel tones (a lift toward the top left, two darker steps away from it, a light line); this colour replaces it, so it gets them too.
  if (fx == 1 && (flags & ${e.F_DIFFUSE}) != 0) col = celTones(min(col, vec3(1.0)), D, R, joinTone(length(vG) > 1e-5 ? normalize(vG) : vec2(0.0), je, clamp((R + D) / max(R, 1e-3), 0.0, 1.0)), aa);
  // A disc cut across (the lobule's portal venule, central vein, arteriole, bile ductule): the ink line and the pale band just inside its wall, over the blood too,
  // and none where a vessel joins it (celDisc; the vessel layer's own fill, which this replaces, has them the same way).
  if (fx == 1 && (flags & ${Me}) != 0) col = celDisc(min(col, vec3(1.0)), T(id, 4).rgb, D, R, 0.8 * clamp(${J(q.LINE_R)} * R, ${J(q.LINE_MIN)} * pxW, ${J(q.LINE_MAX)} * pxW), aa, ringOpen(T(id, 3).xyz, length(vG) > 1e-5 ? normalize(vG) : vec2(0.0)));
  outColor = ditherOut(vec4(min(col, vec3(1.0)), 1.0) * lumA, q);
}
`};var Is=Q-1;var Ke=ft+1,Io=e=>{let{F_DOTTED:a,EDGE:o,ENT_W:t,N_SAMPLES:n,MAX_TIERS:s,S_OFF:r,ALONG_GLSL:i}=e,c=n-1;return`#version 300 es
precision highp float;
precision highp int;
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
uniform int mPass;                     // the pass (MP_*)
uniform int tierNow;                   // the tier it draws
uniform int tubeKey;                   // 1 in a glow's depth prepass: a lit vessel's own wall keeps its depth there, so no other glow shows inside it
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform vec4 invA;                     // device pixels \u2192 world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen
uniform vec2 sizeF;                    // the layer, device pixels
uniform float reachU;                  // how far from a lumen anything is drawn (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 rimInk;                   // a dark lumen's light rim: rgb, alpha (0 on the light looks)
uniform vec4 paperInk;                 // the figure's ground: rgb, alpha
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform float tierAlpha[${s}];
uniform int tierGroup[${s}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture, not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw: only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int posBase;                   // the texel of the frame's points in ent
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // (a glow has no lumen: zero)
layout(location=2) out uvec4 outFlow2; // (zero)
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

const float LAST = ${c}.0;
const float S_OFF = ${r}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${n/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${t}, t / ${t}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
${i}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

${pe(e)}

void main() {
  // (Only the two glow passes: the shapes and the lift are the lean shader's.)
  if (mPass != ${U.GLOW} && mPass != ${U.UP}) discard;
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself, as the vessel shader does.
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  float reach = reachU + 2.0 * px;
  int id = vRow;
  vec4 t5 = T(id, 5);
  bool dotted = (int(T(id, 2).z + 0.5) & ${a}) != 0;
  // The distance is the vessel's own, worked out here from the segments about this fragment's sample (the strip build's search, ${Ke} each side), not read from the
  // vertex shader's distance varying. That one is the distance across the primitive's own ring, exact on a straight run; across a turn the domes, the trap quads and the overlapping rings of
  // the inside each carry their own number (a dome's hexagon, a trap quad's constant skirt edge), so the glow showed as boxes and wedges cut out of the halo, with hard
  // spokes at the bend. The nearest of the segments is one smooth field whichever of those primitives the depth test keeps for the pixel, and it carries the clip range
  // and the dots as segNear applies them. The soft along (aU / aW) is segNear's too: the fade at the vessel's ends reads it, and it is smooth across a bend's fan.
  float bd = 1e9, bs = 1e9, br = 0.0, bu = 0.0, bx = 0.0, aM = 1e9, aW = 0.0, aU = 0.0;
  vec2 bg = vec2(0.0);
  int ic = clamp(int(vI), 0, ${n-2});
  vec2 pa = PT(id, max(0, ic - ${Ke}));
  for (int j = max(0, ic - ${Ke}); j <= min(${n-2}, ic + ${Ke}); j++) {
    vec2 pb = PT(id, j + 1);
    segNear(id, float(j), vec4(pa, pb), p, p, t5, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
    pa = pb;
  }
  float D = bd;
  float u = bu;                        // (the nearest point's place along, for the colour)
  float us = aW > 0.0 ? aU / aW : bu;  // (the soft along, for the ends' fade)
  // No vessel in reach of this pixel: it is left empty, written so when the cells are drawn again over the last picture.
  if (D >= reach) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${e.VEIL_K} * organK : 0.0;
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(id, u, us, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  // The glow here. No glow colour (the vessel is not lit), or the other pass's vessel (the glow asked to lie on top is drawn in the up pass only), or no amount: nothing.
  vec4 gc, ge;
  float gv = glowAmt(id, D, aWall, us, aA, gc, ge);
  if (gc.a <= 0.0 || (ge.w > 5.0) != (mPass == ${U.UP})) discard;
  bool inside = D - aWall < 0.0;   // (inside its own wall a lit vessel keeps the pixel and draws no glow there)
  if (!inside && gv <= 0.0) discard;
  // The vessel's tier draws it: another tier's glow is not this pass's.
  vec4 lgm = vec4(0.0);
  bool dep = false;
  if (int(aTier + 0.5) == tierNow && gv > 0.0) {
    lgm = vec4((ge.z > 0.5 ? aCol : gc.rgb) * gv, gv);
    if (ge.z > 0.5) dep = true;
  }
  // (A lumen drawn here has its colour reach the pixel too.)
  if (clamp(0.5 - D / (px * ${o}), 0.0, 1.0) > 0.0) dep = true;
  if (lgm.a <= 0.0 && tubeKey == 1 && inside) { outFlow = uvec4(0u); outFlow2 = uvec4(0u); outColor = vec4(0.0); outDep = vec4(0.0); return; }   // (the depth prepass: inside the lit vessel's own wall the nearest surface, with no colour)
  if (lgm.a <= 0.0) discard;
  if (tierGroup[tierNow] == 1) lgm *= min(1.0 / max(netAlpha, 1e-3), 1.0 / lgm.a);   // (laid with the network, which is faded as a whole)
  outColor = ditherOut(lgm, q); outDep = vec4(dep ? 1.0 : 0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
}
`};var F=12,Nt=8,Ee=4,$a=(e,a)=>2+2*e+(a?1:0),le=-1,ja=1024,za=8,Ye=7,Ua=8,Qe=10,Ga=43,Ha=47,qa=48,Ja=20,Ka=21,Xa=4,Va=5,Ze=E/2,_e=Math.PI/180,Oo=1e-6,Xe=12,Do=.3,ye=new Int32Array(256),De=new Int32Array(1024),Wo=new Float32Array(1),Ya=new Uint32Array(Wo.buffer),he=(e,a)=>{let o=Math.floor(e[a+Ua]+.5);return o<0?0:o>=R?R-1:o},se=(e,a,o)=>e[(a*Ze+(o>>1))*4+(o&1)*2],re=(e,a,o)=>e[(a*Ze+(o>>1))*4+(o&1)*2+1],Qa=(e,a)=>e.length>=(a*Ze+Ze)*4&&(se(e,a,0)!==0||re(e,a,0)!==0||se(e,a,E-1)!==0||re(e,a,E-1)!==0),fe=8,ce=new Int32Array(4),ne=new Int32Array(4),Ve=new Float32Array(4),Za=.05,g={row:new Int32Array(fe),sample:new Int32Array(fe),dir:new Int8Array(fe),mark:new Float32Array(fe),ang:new Float64Array(fe),order:new Int8Array(fe),n:0};function en(e,a,o,t,n=0,s=E-1){let r=n,i=1/0;for(let c=n;c<=s;c++){let l=Math.hypot(se(e,a,c)-o,re(e,a,c)-t);l<i&&(i=l,r=c)}return r}function No(e,a,o,t){let n=0,s=t>o?1:-1;for(let r=o;r!==t;r+=s)n+=Math.hypot(se(e,a,r+s)-se(e,a,r),re(e,a,r+s)-re(e,a,r));return n}function Ne(e,a,o){for(let t=0;t<E;t++)o[2*t]=se(e,a,t),o[2*t+1]=re(e,a,t);return o}var Ft=new Float64Array(E*2),Fo=new Float64Array(E*2),tn=50,on=10,an=45;function Bo(e,a,o,t){let n=e[a],s=e[a+1],r=e[a+2],i=0;for(let l=0;l<4;l++){let f=Qt(e[a+4+l]);if(!f||f.row<0||f.row>=t||!Qa(o,f.row))continue;let d=!1;for(let p=0;p<i;p++)ce[p]===f.row&&(d=!0);if(d)continue;let m=f.row,u=en(o,m,n,s);u>0&&u<=Xe&&No(o,m,0,u)<=Do*r?u=0:u<E-1&&u>=E-1-Xe&&No(o,m,E-1,u)<=Do*r&&(u=E-1),ce[i]=m,ne[i]=u,Ve[i++]=f.mark}for(let l=0;l<2;l++)for(let f=0;f<i;f++){let d=ne[f];if(d===0||d===E-1)continue;let m=d<=Xe?0:d>=E-1-Xe?E-1:-1;if(m<0)continue;let u=se(o,ce[f],m),p=re(o,ce[f],m);for(let x=0;x<i;x++)if(!(x===f||ne[x]!==0&&ne[x]!==E-1)&&Math.hypot(se(o,ce[x],ne[x])-u,re(o,ce[x],ne[x])-p)<=Za*r){ne[f]=m;break}}let c=0;for(let l=0;l<i;l++){let f=ne[l],d=ce[l];f===0||f===E-1?(g.row[c]=d,g.sample[c]=f,g.dir[c]=f===0?1:-1,g.mark[c++]=Ve[l]):(g.row[c]=d,g.sample[c]=f,g.dir[c]=1,g.mark[c++]=Ve[l],g.row[c]=d,g.sample[c]=f,g.dir[c]=-1,g.mark[c++]=Ve[l])}return g.n=c,c}function et(e,a,o,t,n=null){(!t.rows||t.rows.length<a*F)&&(t.rows=new Float32Array(a*F));let s=t.rows;for(let l=0;l<a;l++){let f=l*$,d=l*F,m=(Math.floor(e[f+Qe]+.5)&za)!==0,u=e[f+Ja]>Oo||e[f+Ka]<1-Oo;s[d]=l,s[d+1]=le,s[d+2]=le,s[d+3]=m||u?3:2;for(let p=0;p<Nt;p++)s[d+Ee+p]=0}if(n){let l=Math.floor(o.length/8),f=0,d=16;for(;d<l*2;)d*=2;De.length<d&&(De=new Int32Array(d)),De.fill(0,0,d);let m=d-1;for(let p=0;p<2;p++)for(let x=0,_=p===0?l:f;x<_;x++){let w=p===0?x:ye[x],h=w*8;if(p===0){let T=0;for(let X=0;X<8;X++)Wo[0]=o[h+X],T=Math.imul(T^Ya[0],2654435761)>>>0,T^=T>>>15;let P=T&m,B=!1;for(;;){let X=De[P];if(X===0){De[P]=w+1;break}let Fe=(X-1)*8,de=!0;for(let Ce=0;Ce<8&&de;Ce++)de=o[Fe+Ce]===o[h+Ce];if(de){B=!0;break}P=P+1&m}if(B)continue}if(!(o[h+2]>0)||Bo(o,h,n,a)<2)continue;let v=g.n,b=(T,P)=>{let B=g.row[T]*F+(g.sample[T]===0?1:2);if(s[B]===le){s[B]=P;let X=g.row[T]*F+3;return s[X]<2.5&&(s[X]=4),!0}return!1},A=T=>(g.sample[T]===0||g.sample[T]===E-1)&&!(T+1<v&&g.row[T+1]===g.row[T])&&!(T>0&&g.row[T-1]===g.row[T]),y=-1,S=-1;for(let T=0;T<v;T++)if(g.mark[T]>.1){y=T;break}for(let T=0;T+1<v;T++)if(g.row[T]===g.row[T+1]&&g.dir[T]!==g.dir[T+1]){S=T;break}let k=-1,D=-1;if(S<0){let T=-Math.cos(an*_e);for(let P=0;P<v;P++)if(A(P))for(let B=P+1;B<v;B++){if(!A(B)||g.row[B]===g.row[P])continue;let X=we(Ne(n,g.row[P],Ft),g.sample[P],g.dir[P]),Fe=we(Ne(n,g.row[B],Fo),g.sample[B],g.dir[B]),de=X[0]*Fe[0]+X[1]*Fe[1];de<=T&&(T=de,k=P,D=B)}if(k>=0){let P=g.row[k]*F+(g.sample[k]===0?1:2),B=g.row[D]*F+(g.sample[D]===0?1:2);s[P]===le&&s[B]===le?(b(k,Be(g.row[D],g.sample[D])),b(D,Be(g.row[k],g.sample[k]))):k=D=-1}}let C=y>=0?y:S>=0?S:k;if(C<0){if(p===0){if(f>=ye.length){let T=new Int32Array(ye.length*2);T.set(ye),ye=T}ye[f++]=w;continue}for(let T=0;T<v&&C<0;T++){if(!A(T))continue;let P=s[g.row[T]*F+(g.sample[T]===0?1:2)];P<=-2&&Math.floor((-P-2)/E)!==g.row[T]&&(C=T)}if(C<0)continue}let I=g.row[C],W=g.sample[C],ke=0;for(let T=0;T<v;T++)T===k||T===D||g.row[T]===I||g.mark[T]>.1||!A(T)||b(T,ht(I,W))&&ke++;ke>0&&C!==k&&C!==D&&A(C)&&b(C,Be(I,W))}let u=(p,x)=>{let _=s[p*F+x];if(_>-2)return!1;let w=-_-2,h=Math.floor(w/E),v=w%E;if(h===p)return!1;let b=we(Ne(n,p,Ft),x===1?0:E-1,x===1?1:-1),A=we(Ne(n,h,Fo),v,v===0?1:-1);return b[0]*A[0]+b[1]*A[1]<=-Math.cos(on*_e)};for(let p=0;p<a;p++)for(let x=1;x<=2;x++){let _=p*F+x,w=s[_];if(w<0)continue;let h=Math.floor(w/E),v=w%E;if(v!==0&&v!==E-1)continue;let b=s[h*F+(v===0?1:2)];if(b>-2)continue;let A=-b-2,y=Math.floor(A/E);if(y===h||y===p)continue;let S=he(e,p*$);he(e,h*$)!==S&&he(e,y*$)===S&&(s[_]=ht(y,A%E))}for(let p=0;p<a;p++)for(let x=1;x<=2;x++){let _=p*F+x,w=s[_];if(w<0)continue;let h=Math.floor(w/E);s[_]=w+(u(h,1)?ao:0)+(u(h,2)?no:0)}for(let p=0;p<a;p++)for(let x=1;x<=2;x++){let _=s[p*F+x];if(_<0)continue;let w=Math.floor(_+1e-6),h=Math.floor(w/E),v=w%E;if(h===p||h>=a||v===0||v===E-1)continue;let b=h*F+Ee;for(let A=0;A<Nt;A++)if(s[b+A]===0){s[b+A]=$a(p,x===2);break}}}let r=0,i=0,c=0;for(let l=0;l<a;l++){let f=l*F;s[f+3]>2.5&&r++,s[f+3]>3.5&&i++,(s[f+1]!==le||s[f+2]!==le)&&c++}return t.exact=r,t.joinOnly=i,t.n=a,t.ended=c,t}function $o(e,a,o,t,n){(!n.rows||n.rows.length<o*F)&&(n.rows=new Float32Array(o*F)),n.start||(n.start=new Int32Array(R),n.count=new Int32Array(R),n.plain=new Int32Array(R),n.ends=new Int32Array(R),n.curP=new Int32Array(R),n.curE=new Int32Array(R),n.curX=new Int32Array(R),n.lit=new Uint8Array(R),n.litUp=new Uint8Array(R),n.sel=new Uint8Array(R),n.shadow=new Uint8Array(R));let{rows:s,start:r,count:i,plain:c,ends:l,curP:f,curE:d,curX:m,lit:u,litUp:p,sel:x,shadow:_}=n;i.fill(0),c.fill(0),l.fill(0),u.fill(0),p.fill(0),x.fill(0),_.fill(0);for(let h=0;h<o;h++){let v=h*$;if(!a[h]||!(e[v+Ye]>0))continue;let b=he(e,v);i[b]++;let A=t[h*F+3];A>2.5?A>3.5&&l[b]++:c[b]++,e[v+Ga]>0&&(e[v+Ha]>Va?p[b]=1:u[b]=1),e[v+qa]>0&&(x[b]=1),(Math.floor(e[v+Qe]+.5)&Xa)!==0&&(_[b]=1)}let w=0;for(let h=0;h<R;h++)r[h]=w,f[h]=w,d[h]=w+c[h],m[h]=w+c[h]+l[h],w+=i[h];for(let h=0;h<o;h++){let v=h*$;if(!a[h]||!(e[v+Ye]>0))continue;let b=he(e,v),A=h*F,y=t[A+3],S=(y>3.5?d[b]++:y>2.5?m[b]++:f[b]++)*F;s[S]=t[A],s[S+1]=t[A+1],s[S+2]=t[A+2];let k=Co(t,t[A+1]),D=Co(t,t[A+2]);s[S+3]=k||D?5+k+4096*D:t[A+3];for(let C=0;C<Nt;C++)s[S+Ee+C]=t[A+Ee+C]}return n.n=w,n}function jo(e,a,o,t,n=!0){let s=Math.floor(a.length/$),r=Math.floor(e.length/8);(!t.data||t.data.length<r*8*H)&&(t.data=new Float32Array(r*8*H)),(!t.at||t.at.length<r*8*2)&&(t.at=new Float32Array(r*8*2)),t.kinds||(t.kinds=new Int32Array(fe+1)),(!t.e||t.e.length<r*8)&&(t.e=new Int32Array(r*8)),t.kinds.fill(0);let i=new Set,c=t.data,l=0,f=0,d=0;for(let m=0;m<r;m++){let u=m*8;if(!(e[u+2]>0))continue;let p=e.slice(u,u+8).join(",");if(i.has(p))continue;i.add(p);let x=Bo(e,u,o,s);if(x<2)continue;f++;let _=e[u],w=e[u+1],h=e[u+3],v=Math.floor(h)*.01,b=Math.min(1,Math.max(0,(h-Math.floor(h))/.99)),A=v*b;if(A>0){for(let y=0;y<x;y++){let S=Ne(o,g.row[y],Ft),k=we(S,g.sample[y],g.dir[y]);g.ang[y]=Math.atan2(k[1],k[0]),g.order[y]=y}for(let y=1;y<x;y++){let S=g.order[y],k=y-1;for(;k>=0&&g.ang[g.order[k]]>g.ang[S];)g.order[k+1]=g.order[k],k--;g.order[k+1]=S}for(let y=0;y<x;y++){let S=g.order[y],k=g.order[(y+1)%x];if(S===k)continue;let D=g.ang[k]-g.ang[S];if(D<0&&(D+=2*Math.PI),D<_t*_e||D>=Tt*_e){d++;continue}let C=0,I=0;for(let P=0;P<x;P++)g.row[P]===g.row[S]&&C++,g.row[P]===g.row[k]&&I++;if(C===1!=(I===1)&&D<tn*_e){d++;continue}let W=l*H;c[W]=g.row[S],c[W+1]=g.sample[S],c[W+2]=g.dir[S],c[W+3]=1,c[W+4]=g.row[k],c[W+5]=g.sample[k],c[W+6]=g.dir[k],c[W+7]=-1,c[W+8]=A,c[W+9]=e[u+2],t.at[l*2]=_,t.at[l*2+1]=w,t.e[l]=m;let ke=g.mark[S]>.1,T=g.mark[k]>.1;c[W+10]=n&&ke!==T?ke?0:1:2,c[W+11]=D<yt*_e?1:0,l++,t.kinds[x]++}}}return t.count=l,t.joins=f,t.empty=d,t}function zo(e,a,o,t,n=null,s=!1,r=null){let i=Math.floor(o.length/$);t.start||(t.start=new Int32Array(R),t.count=new Int32Array(R),t.cur=new Int32Array(R));let{start:c,count:l,cur:f}=t;l.fill(0);for(let u=0;u<a;u++){let p=r&&!r[u]?-1:Po(e,u,o,i,n,s);p>=0&&l[p]++}let d=0;for(let u=0;u<R;u++)c[u]=d,f[u]=d,d+=l[u];(!t.data||t.data.length<d*H)&&(t.data=new Float32Array(Math.max(d,1)*H));let m=t.data;for(let u=0;u<a;u++){let p=r&&!r[u]?-1:Po(e,u,o,i,n,s);if(p<0)continue;let x=f[p]++*H,_=u*H;for(let w=0;w<H;w++)m[x+w]=e[_+w]}return t.n=d,t}function Co(e,a){if(!(a>=0))return 0;let o=Math.floor(a+.1),t=a-o,n=Math.floor(o/E),s=o%E,r=lo(t>.2&&t<.3||t>.7,t>.45,s);if(!r)return 0;let i=e[n*F+(r<0?1:2)];if(!(i<=-2))return 0;let c=Math.round(-i-2);return co(Math.floor(c/E),c%E)}function Po(e,a,o,t,n,s){let r=a*H,i=Math.floor(e[r]+.5),c=Math.floor(e[r+4]+.5);if(i<0||i>=t||c<0||c>=t||n&&(!n[i]||!n[c]))return-1;let l=i*$,f=c*$;if(!(o[l+Ye]>0)||!(o[f+Ye]>0))return-1;let d=he(o,l),m=he(o,f);return s&&d!==m&&((Math.floor(o[l+Qe]+.5)|Math.floor(o[f+Qe]+.5))&ja)===0?-1:Math.max(d,m)}var tt=4,Te=E/2,Ct=(e,a,o)=>e[(a*Te+(o>>1))*4+(o&1)*2],Pt=(e,a,o)=>e[(a*Te+(o>>1))*4+(o&1)*2+1],Uo=e=>e&&e.pts?e.pts:e;function Go(e,a,o){if(e&&e.on)return e.on[o]!==0;let t=(o*Te+Te)*4;return!!a&&a.length>=t&&(Ct(a,o,0)!==0||Pt(a,o,0)!==0||Ct(a,o,E-1)!==0||Pt(a,o,E-1)!==0)}function nn(e,a,o){let t=typeof a=="number"?a:a&&a[o]||0;if(e){let n=o*E*4;if(e.length>=n+E*4)for(let s=0;s<E;s++){let r=e[n+s*4];r>t&&(t=r)}}return t>0?t:0}function sn(e,a){return(!e.boxes||e.boxes.length<a*tt)&&(e.boxes=new Float32Array(a*tt)),e.boxes}function Ho(e,a,o,t){if(!o||o.length<(t*Te+Te)*4)return!1;let n=e[a],s=e[a+1],r=e[a+2],i=e[a+3];for(let c=0;c<E;c++){let l=Ct(o,t,c),f=Pt(o,t,c);l<n&&(n=l),l>r&&(r=l),f<s&&(s=f),f>i&&(i=f)}return e[a]=n,e[a+1]=s,e[a+2]=r,e[a+3]=i,!0}function qo(e,a,o,t,n){return rn(e,null,a,o,t,n)}function rn(e,a,o,t,n,s){let r=sn(s,n),i=Uo(e),c=a?Uo(a):null,l=0;for(let f=0;f<n;f++){let d=f*tt;r[d]=1/0,r[d+1]=1/0,r[d+2]=-1/0,r[d+3]=-1/0;let m=!1;if(Go(e,i,f)&&Ho(r,d,i,f)&&(m=!0),a&&Go(a,c,f)&&Ho(r,d,c,f)&&(m=!0),!m)continue;let u=nn(o,t,f),p=Math.max(1,Math.abs(r[d]),Math.abs(r[d+1]),Math.abs(r[d+2]),Math.abs(r[d+3]))+u,x=u+p*48e-8;r[d]-=x,r[d+1]-=x,r[d+2]+=x,r[d+3]+=x,l++}return s.n=n,s.on=l,s}function Jo(e,a,o,t,n){let s=o[0]-t,r=o[1]-t,i=o[2]+t,c=o[3]+t,l=!1;for(let f=0;f<a;f++){let d=f*tt,m=e[d]<=i&&e[d+2]>=s&&e[d+1]<=c&&e[d+3]>=r?1:0;n[f]!==m&&(n[f]=m,l=!0)}return l}var Wt=["tubeLean","tubeDepth","tubeWeb","tubeWebDepth","tubeJoinDepth"],Xo=typeof location<"u"&&location.search||"",ln={stage:1,joins:"patch"},cn={stage:2,joins:"web"},fn={stage:3,joins:"web"};function Vs(e,a=!1){return e?a?fn:cn:ln}function Ys(e,a,o){return e?"":a&&a.length?`${a.join(", ")} failed`:o?"compiling":"not ready"}function hn(e,a){let o=ze(ue,e.F_SEL,a),t=kt(ue,e.F_SEL,a),n=wo(e);return{tubeLean:{vs:o,fs:n},tubeDepth:{vs:o,fs:St},tubeWeb:{vs:t,fs:n},tubeWebDepth:{vs:t,fs:St},tubeJoinDepth:{vs:o,fs:vo(e.N_SAMPLES)}}}function $t(e,a,o,t,n){let s=new Map,r={},i=(c,l)=>{if(!n)return l;let f=`${c}:${l}`;return s.has(f)||s.set(f,n(c,l)),s.get(f)};for(let c of t)r[c]=a(e,i(e.VERTEX_SHADER,o[c].vs),i(e.FRAGMENT_SHADER,o[c].fs));return r}function Qs(e,a,o,t,n){return $t(e,a,hn(o,t),Wt,n)}function Zs(e,a,o){let t=[],n=[];if(o.forEach((s,r)=>{try{t[r]=a(e,s)}catch(i){console.warn(`Veins renderer: the Tube's ${Wt[r]} shader failed; the Tube keeps stage 1.`,i),e.deleteProgram(s.p),n.push(Wt[r])}}),n.length){for(let s of t)s&&e.deleteProgram(s.p);return{P:null,failed:n}}return{P:{lean:t[0],depth:t[1],web:t[2],webDepth:t[3],joinDepth:t[4]},failed:n}}var dn=["tubeGlow"];function un(e,a){return{tubeGlow:{vs:ze(ue,e.F_SEL,a),fs:Io(e)}}}function er(e,a,o,t,n){return $t(e,a,un(o,t),dn,n)}function tr(e,a,o){try{return{P:a(e,o[0]),failed:[]}}catch(t){return console.warn("Veins renderer: the Tube glow shader failed; the glow passes keep the strip program.",t),e.deleteProgram(o[0].p),{P:null,failed:["tubeGlow"]}}}var Bt=["tubeLumen","tubeWebLumen","compTube","compTubeCell","plainTube","plainTubeCell"];function mn(e,a,o){let t=ze(ue,e.F_SEL,a),n=kt(ue,e.F_SEL,a),s=Ro(e),r=o.COMP_FS(!1,!1,!1,1),i=o.COMP_FS(!0,!1,!1,1);return{tubeLumen:{vs:t,fs:s},tubeWebLumen:{vs:n,fs:s},compTube:{vs:o.COMP_VS,fs:r},compTubeCell:{vs:o.COMP_CELL_VS,fs:r},plainTube:{vs:o.COMP_VS,fs:i},plainTubeCell:{vs:o.COMP_CELL_VS,fs:i}}}function or(e,a,o,t,n,s){return $t(e,a,mn(o,t,n),Bt,s)}function ar(e,a,o){let t=[],n=[];if(o.forEach((s,r)=>{try{t[r]=a(e,s)}catch(i){console.warn(`Veins renderer: the Tube's ${Bt[r]} shader failed; the Tube keeps stage 2.`,i),e.deleteProgram(s.p),n.push(Bt[r])}}),n.length){for(let s of t)s&&e.deleteProgram(s.p);return{P:null,failed:n}}return{P:{lumen:t[0],webLumen:t[1],comp:t[2],compCell:t[3],plain:t[4],plainCell:t[5]},failed:n}}function nr(){let e=new Float64Array(16),a=!1,o=(t,n,s,r,i,c)=>{for(let l=0;l<6;l++)e[l]=t[l];e[6]=n[0],e[7]=n[1],e[8]=s[0],e[9]=s[1],e[10]=r,e[11]=i;for(let l=0;l<4;l++)e[12+l]=c?c[l]:-1e30};return{stale(){a=!1},needs(t,n,s,r,i,c=null){if(!a)return!0;for(let l=0;l<6;l++)if(e[l]!==t[l])return a=!1,!0;if(e[6]!==n[0]||e[7]!==n[1]||e[8]!==s[0]||e[9]!==s[1]||e[10]!==r||e[11]!==i)return a=!1,!0;for(let l=0;l<4;l++)if(e[12+l]!==(c?c[l]:-1e30))return a=!1,!0;return!1},drawn(t,n,s,r,i,c=null){o(t,n,s,r,i,c),a=!0},get fresh(){return a}}}var pn=/[?&]lumenscale=([0-9.]+)(?=[&#]|$)/,vn=/[?&]lumen=off(?=[&#]|$)/,sr=(e=Xo)=>vn.test(e);function rr(e,a,o=Xo){let t=pn.exec(o),n=t?parseFloat(t[1]):NaN;return n>=.25&&n<=1?n:e==="lobule"?.5:a?.67:1}function ir(e,a,o,t){return t[0]=o>=1?e:Math.max(1,Math.ceil(e*o)),t[1]=o>=1?a:Math.max(1,Math.ceil(a*o)),t}function lr(e,a,o,t){return t[0]=e[0]*a,t[1]=e[1]*o,t[2]=e[2]*a,t[3]=e[3]*o,t[4]=e[4]*a,t[5]=e[5]*o,t}function cr(e,a,o,t){let n=Math.round(e*o);return t[0]=n,t[1]=Math.round((e+a)*o)-n,t}function wn(e,a,o,t,n){let s=1/0,r=1/0,i=-1/0,c=-1/0,l=e.boxes.boxes,f=e.mask;for(let m=0;m<a;m++){if(!f[m])continue;let u=m*4;l[u]<s&&(s=l[u]),l[u+1]<r&&(r=l[u+1]),l[u+2]>i&&(i=l[u+2]),l[u+3]>c&&(c=l[u+3])}let d=o&&o.data;for(let m=0,u=d?o.count:0;m<u;m++){let p=m*H,x=Math.floor(d[p]+.5),_=Math.floor(d[p+4]+.5);if(!(x>=0&&x<a&&_>=0&&_<a)||!(f[x]||f[_]))continue;let w=(Et+1)*Math.max(e.hr[x],e.hr[_])+d[p+9];for(let h=0;h<2;h++){let v=h?_:x,b=Math.floor(d[p+(h?5:1)]+.5),A=(v*32+(b>>1))*4+(b&1)*2,y=t[A],S=t[A+1];y-w<s&&(s=y-w),y+w>i&&(i=y+w),S-w<r&&(r=S-w),S+w>c&&(c=S+w)}}return n[0]=s,n[1]=r,n[2]=i,n[3]=c,n}function fr(e,a,o){if(!(a[0]<=a[2]&&a[1]<=a[3]))return!1;let t=1/0,n=1/0,s=-1/0,r=-1/0;for(let i=0;i<4;i++){let c=i&1?a[2]:a[0],l=i&2?a[3]:a[1],f=e[0]*c+e[2]*l+e[4],d=e[1]*c+e[3]*l+e[5];f<t&&(t=f),f>s&&(s=f),d<n&&(n=d),d>r&&(r=d)}return o[0]=Math.floor(t)-1,o[1]=Math.floor(n)-1,o[2]=Math.ceil(s)+1,o[3]=Math.ceil(r)+1,!0}function hr(e,a,o,t,n,s){let r=Math.max(e,Math.floor(t+o)),i=Math.min(e+a,Math.ceil(n+o));return s[0]=r,s[1]=i,i>r}function dr(e){let a={w:0,h:0,fbo:null,rb:null,texture:null,made:0};return a.tex=()=>a.texture,a.ensure=(o,t)=>(a.fbo&&a.w===o&&a.h===t||(a.fbo||(a.fbo=e.createFramebuffer(),a.rb=e.createRenderbuffer(),a.texture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,a.texture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)),a.w=o,a.h=t,a.made++,e.bindTexture(e.TEXTURE_2D,a.texture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,o,t,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindRenderbuffer(e.RENDERBUFFER,a.rb),e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH_COMPONENT24,o,t),e.bindFramebuffer(e.FRAMEBUFFER,a.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,a.texture,0),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.RENDERBUFFER,a.rb),e.drawBuffers(xn)),a),a.dispose=()=>{a.fbo&&(e.deleteFramebuffer(a.fbo),e.deleteRenderbuffer(a.rb),e.deleteTexture(a.texture)),a.fbo=a.rb=a.texture=null,a.w=a.h=0},a}var xn=[36064],Vo=new Float32Array(0),Ko=2.5;function gn(e,a,o,t,n){for(let s=0;s<o;s++){let r=a[s]*8,i=s*8;for(let c=0;c<8;c++)n[i+c]=e[r+c];t>=0&&(n[i]=e[(t+e[r])*4],n[i+1]=e[(t+e[r])*4+1])}return o*8}function bn(e,a,o,t){let n=e.s2||(e.s2={gen:-1,entries:Vo,R:{},W:{},joinBase:-1,n:0});if(n.gen===e.gen&&n.R.rows)return n;let s=e.jl.view,r=e.jl.n||0;!n.seen||n.seen.length<e.ent.length/8?n.seen=new Uint8Array(Math.ceil(e.ent.length/8)):n.seen.fill(0),(!n.uniq||n.uniq.length<r)&&(n.uniq=new Int32Array(r));let i=0;for(let c=0;c<r;c++){let l=s[c];n.seen[l]||(n.seen[l]=1,n.uniq[i++]=l)}n.entries=new Float32Array(i*8),n.ji=new Int32Array(i);for(let c=0;c<i;c++)n.ji[c]=t>=0?Math.round(e.ent[n.uniq[c]*8]):-1;return gn(e.ent,n.uniq,i,t,n.entries),jo(n.entries,a,e.pts.pts,n.W,!e.noEnds),et(a,o,n.entries,n.R,e.noEnds?null:e.pts.pts),n.gen=e.gen,n.joinBase=t,n.n=i,n}function ur(e,a,o,t,n,s){let r=e[0]*e[3]-e[1]*e[2],i=s.rect;if(s.ok=!1,!(Math.abs(r)>1e-12)||!(t>0&&n>0))return s;let c=1/0,l=1/0,f=-1/0,d=-1/0;for(let m=0;m<4;m++){let u=(m&1?a+t+1:a-1)-e[4],p=(m&2?o+n+1:o-1)-e[5],x=(e[3]*u-e[2]*p)/r,_=(e[0]*p-e[1]*u)/r;x<c&&(c=x),x>f&&(f=x),_<l&&(l=_),_>d&&(d=_)}return i[0]=c,i[1]=l,i[2]=f,i[3]=d,s.ok=c<=f&&l<=d,s}function An(e,a,o){let t=e.cu||(e.cu={gen:-1,n:0,key:0,total:0,boxes:{},inside:null,mask:null,hr:null}),n=o.rmax,s=e.pts.on,r=t.gen!==e.gen||t.n!==a||!t.hr;if(!r){for(let i=0;i<a;i++)if((n[i]||0)>t.hr[i]){r=!0;break}}if(r){(!t.hr||t.hr.length<a)&&(t.hr=new Float32Array(a),t.inside=new Uint8Array(a),t.mask=new Uint8Array(a));for(let i=0;i<a;i++)t.hr[i]=(n[i]||0)*1.25+Le;qo(e.pts,null,t.hr,a,t.boxes),t.inside.fill(2,0,a),t.gen=e.gen,t.n=a,t.total=t.boxes.on}if(Jo(t.boxes.boxes,a,o.rect,o.pad,t.inside)||r){for(let i=0;i<a;i++)t.mask[i]=s[i]&&t.inside[i]?1:0;t.key++}return t}function mr(e,a){let o={tb:{},wb:{},stripVAO:null,webVAO:null,rowBuf:null,webBuf:null,webIndexN:0,rowCap:0,webCap:0,binnings:0,cull:{drawn:0,total:0,off:!0},lumBox:{b:new Float64Array(4),on:!1}},t={},n=[],s=null,r=-1,i=-1,c=-2,l=null,f=-1;function d(){let _=mo();o.webIndexN=_.nIndex,o.stripVAO=e.createVertexArray(),o.webVAO=e.createVertexArray(),o.rowBuf=e.createBuffer(),o.webBuf=e.createBuffer(),n.push(e.createBuffer(),e.createBuffer()),e.bindVertexArray(o.stripVAO),e.bindBuffer(e.ARRAY_BUFFER,a.tubeVB),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,a.tubeIB),e.bindBuffer(e.ARRAY_BUFFER,o.rowBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,4,e.FLOAT,!1,F*4,0),e.vertexAttribDivisor(1,1);for(let w=2;w<=3;w++)e.enableVertexAttribArray(w),e.vertexAttribPointer(w,4,e.FLOAT,!1,F*4,(Ee+4*(w-2))*4),e.vertexAttribDivisor(w,1);e.bindVertexArray(o.webVAO),e.bindBuffer(e.ARRAY_BUFFER,n[0]),e.bufferData(e.ARRAY_BUFFER,_.attr,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,n[1]),e.bufferData(e.ELEMENT_ARRAY_BUFFER,_.index,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,o.webBuf);for(let w=1;w<=3;w++)e.enableVertexAttribArray(w),e.vertexAttribPointer(w,4,e.FLOAT,!1,H*4,(w-1)*16),e.vertexAttribDivisor(w,1);e.bindVertexArray(null)}function m(_,w,h){et(w,h,Vo,t,null);let v=t.rows,b=_.R.rows;for(let A=0;A<h;A++)if(v[A*F+3]>Ko&&!(b[A*F+3]>Ko))return!0;return!1}let u=null,p=-1;function x(_,w){let h=_.W,v=h.count||0;(!u||u.length<v)&&(u=new Uint8Array(Math.max(v,1)));for(let b=0;b<v;b++){let A=_.ji[h.e[b]];u[b]=A<0||A>=w.on.length||w.on[A]?1:0}return u}return o.frame=(_,w,h,v,b,A=null)=>{o.stripVAO||d();let y=a.B||a,S=a.tv,k=b&&b.ok&&v<0?An(y,h,b):null,D=k?k.key:-1,C=v>=0&&A?A.ver:-1;if(S!==void 0&&y===s&&y.gen===r&&S===i&&v===c&&k===l&&D===f&&C===p&&y.s2&&y.s2.gen===y.gen)return o;let I=y.s2;return!I||I.gen!==y.gen||!I.R.rows?(I=bn(y,w,h,v),o.binnings++):m(I,w,h)&&et(w,h,I.entries,I.R,y.noEnds?null:y.pts.pts),$o(w,k?k.mask:y.pts.on,h,I.R.rows,o.tb),o.cull.off=!k,o.cull.drawn=o.tb.n,o.cull.total=k?k.total:o.tb.n,o.lumBox.on=!!k,k&&wn(k,h,I.W,y.pts.pts,o.lumBox.b),zo(I.W.data,I.W.count,w,o.wb,y.pts.on,!y.noEnds,C>=0&&I.ji?x(I,A):null),e.bindBuffer(e.ARRAY_BUFFER,o.rowBuf),o.rowCap<o.tb.rows.length&&(o.rowCap=o.tb.rows.length,e.bufferData(e.ARRAY_BUFFER,o.rowCap*4,e.DYNAMIC_DRAW)),o.tb.n&&e.bufferSubData(e.ARRAY_BUFFER,0,o.tb.rows,0,o.tb.n*F),e.bindBuffer(e.ARRAY_BUFFER,o.webBuf),o.webCap<o.wb.data.length&&(o.webCap=o.wb.data.length,e.bufferData(e.ARRAY_BUFFER,o.webCap*4,e.DYNAMIC_DRAW)),o.wb.n&&e.bufferSubData(e.ARRAY_BUFFER,0,o.wb.data,0,o.wb.n*H),s=y,r=y.gen,i=S,c=v,l=k,f=D,p=C,o},o.dispose=()=>{for(let _ of[o.stripVAO,o.webVAO])_&&e.deleteVertexArray(_);for(let _ of[o.rowBuf,o.webBuf,...n])_&&e.deleteBuffer(_);o.stripVAO=o.webVAO=o.rowBuf=o.webBuf=null,n.length=0,o.rowCap=o.webCap=0},o}export{Tn as a,ue as b,Sn as c,Rn as d,In as e,On as f,to as g,oo as h,Dn as i,Me as j,pe as k,U as l,Cn as m,Pn as n,Wn as o,Hn as p,ze as q,q as r,po as s,H as t,F as u,Ee as v,hs as w,ds as x,us as y,vs as z,Q as A,Sa as B,To as C,Ia as D,ko as E,Lo as F,Ae as G,Oa as H,Da as I,Na as J,Fa as K,Ca as L,Pa as M,As as N,ys as O,_s as P,Es as Q,Wt as R,Xo as S,Vs as T,Ys as U,hn as V,Qs as W,Zs as X,dn as Y,un as Z,er as _,tr as $,Bt as aa,mn as ba,or as ca,ar as da,nr as ea,sr as fa,rr as ga,ir as ha,lr as ia,cr as ja,wn as ka,fr as la,hr as ma,dr as na,gn as oa,bn as pa,ur as qa,An as ra,mr as sa};
