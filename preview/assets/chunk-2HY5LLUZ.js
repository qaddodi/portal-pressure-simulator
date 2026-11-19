import{e as k,f as K,g as Se,i as kt,j as xe,k as Mt,m as Tt,n as St}from"./chunk-PGEND5DB.js";import{b as Lt}from"./chunk-A5M7URE5.js";import{i as Ue,l as Je,m as Ge,w as Et}from"./chunk-NMLIWKCJ.js";import{g as At,i as yt,j as _t}from"./chunk-MH6GHJSR.js";var O=21,xo=4,C=52,Ot=7,go=8,bo=10,Ao=43,yo=47,_o=48,Eo=5,He=k/2,qe=(e,o)=>{let n=Math.floor(e[o+go]+.5);return n<0?0:n>=O?O-1:n};function Sn(e,o,n,t,s){let i=Math.max(1,Math.ceil(t*He/2048)),a=i*2048*4;(!s.pts||s.pts.length<a)&&(s.pts=new Float32Array(a)),(!s.on||s.on.length<t)&&(s.on=new Uint8Array(t)),(!s.cnt||s.cnt.length<t)&&(s.cnt=new Uint8Array(t)),(!s.seen||s.seen.length<t*K)&&(s.seen=new Uint8Array(t*K));let{pts:r,on:l,cnt:c,seen:f}=s;r.fill(0,0,a),l.fill(0,0,t),c.fill(0,0,t),f.fill(0,0,t*K);for(let u=0;u<n;u++){let d=o[u*6+2],g=d+o[u*6+3];for(let A=d;A<g;A++){let L=A*8,v=e[L+5],h=e[L+4];if(!(v>=0)||v>=K||!(h>=0)||h>=t)continue;let p=h*K+v;f[p]===0&&(f[p]=1,c[h]++);let x=(h*He+(v>>1))*4+(v&1)*2,b=(h*He+(v+1>>1))*4+(v+1&1)*2;r[x]=e[L],r[x+1]=e[L+1],r[b]=e[L+2],r[b+1]=e[L+3]}}let w=0;for(let u=0;u<t;u++)c[u]>0&&(l[u]=1,c[u]<K&&w++);return s.rows=i,s.missing=w,s}function In(e,o,n){let t=0;for(let a=0;a<o;a++)t+=e[a*6+5];(!n.list||n.list.length<t)&&(n.list=new Int32Array(t),n.view=null);let s=n.list,i=0;for(let a=0;a<o;a++){let r=e[a*6+4],l=e[a*6+5];for(let c=0;c<l;c++)s[i++]=r+c}return(!n.view||n.view.length!==t)&&(n.view=s.subarray(0,t)),n.n=t,n.view}function On(e,o,n,t){(!t.rows||t.rows.length<n)&&(t.rows=new Float32Array(n)),t.start||(t.start=new Int32Array(O),t.count=new Int32Array(O),t.cur=new Int32Array(O),t.lit=new Uint8Array(O),t.litUp=new Uint8Array(O),t.sel=new Uint8Array(O),t.shadow=new Uint8Array(O));let{rows:s,start:i,count:a,cur:r,lit:l,litUp:c,sel:f,shadow:w}=t;a.fill(0),l.fill(0),c.fill(0),f.fill(0),w.fill(0);for(let d=0;d<n;d++){let g=d*C;if(!o[d]||!(e[g+Ot]>0))continue;let A=qe(e,g);a[A]++,e[g+Ao]>0&&(e[g+yo]>Eo?c[A]=1:l[A]=1),e[g+_o]>0&&(f[A]=1),(Math.floor(e[g+bo]+.5)&xo)!==0&&(w[A]=1)}let u=0;for(let d=0;d<O;d++)i[d]=u,r[d]=u,u+=a[d];for(let d=0;d<n;d++){let g=d*C;!o[d]||!(e[g+Ot]>0)||(s[r[qe(e,g)]++]=d)}return t.n=u,t}function Rt(e,o,n,t,s=8,i=4){let a=0;for(let r=4;r<4+i;r++){let l=e[o*s+r];if(!(l>-.5))continue;let c=Math.floor(l+.5);c<0||c>=t||(a|=1<<qe(n,c*C))}return a}function Rn(e,o,n,t,s=8,i=4){let a=Math.floor(n.length/C);t.start||(t.start=new Int32Array(O),t.count=new Int32Array(O),t.cur=new Int32Array(O));let{start:r,count:l,cur:c}=t;l.fill(0);for(let u=0;u<o;u++){let d=Rt(e,u,n,a,s,i);for(let g=0;g<O;g++)d&1<<g&&l[g]++}let f=0;for(let u=0;u<O;u++)r[u]=f,c[u]=f,f+=l[u];(!t.data||t.data.length<f*s)&&(t.data=new Float32Array(f*s));let w=t.data;for(let u=0;u<o;u++){let d=Rt(e,u,n,a,s,i);for(let g=0;g<O;g++){if(!(d&1<<g))continue;let A=c[g]++*s,L=u*s;for(let v=0;v<s;v++)w[A+v]=e[L+v]}}return t.n=f,t}var Nt=8,ue=6,Ft=16;function Nn(e,o,n,t=-1){let s=h=>t>=0?e[(t+e[h])*4]:e[h],i=h=>t>=0?e[(t+e[h])*4+1]:e[h+1],a=h=>{let p="";for(let x=0;x<8;x++)p+=e[h*8+x]+",";return p},r=new Set,l=[];for(let h of o){if(!(e[h*8+2]>0))continue;let p=!1;for(let b=0;b<4;b++)e[h*8+4+b]>-.5&&(p=!0);if(!p)continue;let x=a(h);r.has(x)||(r.add(x),l.push(h))}let c=l.length,f=new Int32Array(c),w=[],u=new Int32Array(c);for(let h=0;h<c;h++){f[h]=h,u[h]=1;let p=new Set;for(let x=0;x<4;x++){let b=e[l[h]*8+4+x];b>-.5&&p.add(Math.floor(b+.5))}w.push(p)}let d=h=>{for(;f[h]!==h;)h=f[h]=f[f[h]];return h},g=[];for(let h=0;h<c;h++)for(let p=h+1;p<c;p++){let x=l[h]*8,b=l[p]*8,y=Math.hypot(s(x)-s(b),i(x)-i(b));if(y>=e[x+2]+e[b+2])continue;let M=!1;for(let E of w[h])w[p].has(E)&&(M=!0);M&&g.push([y,h,p])}g.sort((h,p)=>h[0]-p[0]);for(let[,h,p]of g){let x=d(h),b=d(p);if(x===b||u[x]+u[b]>ue)continue;let y=new Set([...w[x],...w[b]]);y.size>Nt||(f[b]=x,w[x]=y,u[x]+=u[b])}let A=new Map;for(let h=0;h<c;h++){let p=d(h);A.has(p)||A.set(p,[]),A.get(p).push(h)}n.j=new Float32Array(c*8),n.data=new Float32Array(A.size*Ft);let L=0,v=0;for(let[h,p]of A){let x=1/0,b=1/0,y=-1/0,M=-1/0,E=v*Ft;n.data[E+12]=L,n.data[E+13]=p.length;for(let S of p){let I=l[S]*8;for(let D=0;D<8;D++)n.j[L*8+D]=e[I+D];L++,x=Math.min(x,s(I)-e[I+2]),y=Math.max(y,s(I)+e[I+2]),b=Math.min(b,i(I)-e[I+2]),M=Math.max(M,i(I)+e[I+2])}n.data[E]=(x+y)/2,n.data[E+1]=(b+M)/2,n.data[E+2]=Math.max(y-x,M-b)/2;let T=0;for(let S of w[h])n.data[E+4+T++]=S;for(;T<Nt;T++)n.data[E+4+T]=-1;v++}return n.count=v,n}var V=512,Ie=({F_DIFFUSE:e,F_EDGE:o,F_SHADOW:n,F_SPEC:t,F_VEIL:s,F_WHOLE:i,LIFT_EASE_MAX:a,LIFT_EASE_SHARE:r,LUMEN2:l,ROW2_BITS:c,VEIL_K:f})=>`
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
  of = (int(t2.z + 0.5) & ${i}) != 0 ? 0.0 : 1.0;   // (how far the organs fade this vessel: 1 as they cover it, 0 for a vessel shown whole)
  col = mix(t0.rgb, t1.rgb, alongAt(id, clamp(uAt, 0.0, 1.0)));
  vec4 tc = T(id, 8);
  hov = T(id, 9).w;
  // The selected vessel stands out of the dimmed network, easing back into it along its course toward each end that
  // meets an unselected vessel, so it never stops in a hard, round end where the dimmed vessel carries on (a slide's
  // spotlit vessel toward its free ends too: highlight-math.js liftEnd).
  vec4 t12 = T(id, 12);
  sel = t12.x;
  if (t12.x > 0.0) {
    float Ls = max(T(id, 5).z, 1.0), fs = min(${r} * Ls, ${a}.0);
    sel *= (t12.y > 0.5 ? smoothstep(0.0, fs, vAt * Ls) : 1.0) * (t12.z > 0.5 ? smoothstep(0.0, fs, (1.0 - vAt) * Ls) : 1.0);
  }
  if (tc.w > 0.0) {
    vec4 tr = T(id, 9);
    float Lv = max(T(id, 5).z, 1.0), uu = uAt * Lv;
    float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
    col = mix(col, tc.rgb, k * min(tc.w, 1.0));   // (tc.w 2: an opaque cast, the EUS glue; the blood stops inside it, castAt)
  }
  edge = (int(t2.z + 0.5) & ${o}) != 0 ? T(id, 6).rgb : vec3(0.0);
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
  if ((int(t2.z + 0.5) & ${s}) != 0 && useOrgan == 1) {
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
  if (fx == 1 && (flags & ${n}) != 0) {
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
  if ((flags & ${s}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  c = (flags & ${o}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC), c) : over(vec4(casing.rgb, 1.0) * (casing.a * cA * aC), c);
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
  if (fx == 1 && (flags & ${V}) != 0 && aL > 0.0) {
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
  return uvec4(gId | (gId2 > 0u ? ${l}u : 0u), uint(clamp((gS + S_OFF) * 16.0, 0.0, 65535.0)), uint(clamp((gY + 1.0) * 32767.5, 0.0, 65535.0)),
    (uint(round(clamp(gW, 0.0, 1.0) * 255.0)) << 8u) | (gId2 > 0u ? uint(round(clamp(gB, 0.0, 1.0) * 255.0)) : 0u));
}
// The second lumen near a join, packed (ROW2_BITS): row + 1 | across's top bits, 4 \xD7 (arc + S_OFF) | across's low two bits.
uvec4 packFlow2(uint gId2, float gS2, float gY2) {
  uint gQ2 = uint(clamp((gY2 + 1.0) * 64.0, 0.0, 127.0));   // (the second lumen's across, 0\u2013127: ROW2_BITS)
  return uvec4(gId2 | ((gQ2 >> 2u) << ${c}u), (uint(clamp((gS2 + S_OFF) * 4.0, 0.0, 16383.0)) << 2u) | (gQ2 & 3u), 0u, 0u);
}
`,Y={GLOW_K:0,GLOW:1,UP_K:2,UP:3,SHADOW_K:4,SHADOW:5,SHAPE_K:6,SHAPE:7,LIFT:8,RING:9,MARK:10},Lo=2,ko=2e-5,Mo={CASE1:.2,LUMEN0:.3,LUMEN_H:.5},Ke=e=>Number.isInteger(e)?e.toFixed(1):String(e),Cn=({EDGE:e,F_DOTTED:o,F_NOCASE:n,F_SEL:t,F_VEIL:s,VEIL_K:i,tube:a=0})=>{let r=Mo,c=`${Object.entries(Y).map(([u,d])=>`#define MP_${u} ${d}`).join(`
`)}
#define MESH_WIN ${Lo}
uniform int mPass;                     // the pass (MP_*)
uniform int tierNow;                   // the tier it draws
uniform float keyBase;                 // this pass's keys: keyBase + [0, 1) * keyH
uniform float keyH;
uniform float keyShape;                // (the ring) the shape pass's keyBase
const float KEY_BIAS = ${ko};${a?`
uniform int tubeKey;                   // (the Tube) 1 in a glow's depth prepass: a lit vessel's own wall keeps its depth there, so no other glow shows inside it
#if MESH == 2
uniform int tubePart;                  // (the Tube's patch) which part this draw is: 0 the outline's pixels (no lumen), 1 the lumen's, at two depths
uniform highp float zK;                // (the Tube's patch) the lumen level's weight on the z of the patch's vessels: 0 the anatomy, 1 the lobule (tube-geo.js, the strip's uniform of the same name)
uniform highp float hK;                // and on the height: 1 the anatomy, 0.008 the lobule
#endif`:""}`,f=`
  // \u2500\u2500 The mesh pass: this fragment's key (lower wins) as its depth: the prepass keeps the lowest (depth LESS), and the pass draws only the
  // fragment whose key is the kept one (depth EQUAL: the same program on the same inputs makes the same key) \u2500\u2500
  float aaK = px * ${e};
  float occK = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${i} * organK : 0.0;
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
    if (fx != 1 || paperInk.a <= 0.0 || (fl & (${n} | ${o})) != 0 || sd[0] < 0.0 || sd[0] > reachK + aaK) discard;
${a?"":`    gl_FragDepth = keyShape + 0.5 * (1.0 - T(id, 2).y + 1e-4) * keyH;
`}    float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
    vec3 aCol, aEdge;
    vesAttrs(id, su[0], sv[0], p, occK, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
    float fa = clamp(aA, 0.0, 1.0) * ((fl & ${s}) != 0 ? 0.5 : 1.0);
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
${a?`    gl_FragDepth = keyBase + (1.0 - (tubePart == 0 ? ${Ke(r.CASE1)} + 0.05 * (1.0 - clamp(Dk / 255.0, 0.0, 1.0)) : ${Ke(r.LUMEN0)} + ${Ke(r.LUMEN_H)} * clamp(zK * zmx + hK, 0.0, 1.0) + 0.02)) * keyH;   // (the Tube's patch writes its own depth: a lumen by its z (then the taller), an outline under every lumen, the nearest wall nearest: docs/recommendations/tube-renderer-lobule-plan.md "The rules")
`:""}  }
#endif
  float kd = keyBase + clamp(kf, 0.0, 1.0) * keyH;${a?"":`
  gl_FragDepth = kd;
  if (mPass == MP_GLOW_K || mPass == MP_UP_K || mPass == MP_SHADOW_K || mPass == MP_SHAPE_K) return;`}`;return{decl:c,key:f,out:`
  // \u2500\u2500 The mesh pass's part of the picture (what the classic shader lays together at the end, for the pass's tier) \u2500\u2500
  if (mPass == MP_GLOW || mPass == MP_UP) {
    vec4 lgm = mPass == MP_UP ? mLgU : mLg;
    ${a?`if (lgm.a <= 0.0 && tubeKey == 1 && sd[0] < swall[0]) { outFlow = uvec4(0u); outFlow2 = uvec4(0u); outColor = vec4(0.0); outDep = vec4(0.0); return; }   // (the depth prepass: inside the lit vessel's own wall the nearest surface, with no colour: the Mesh's key 0 there)
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
${a?`#if MESH == 2
  if (mPass >= MP_SHAPE_K && (tubePart == 0) == (mLum || mD < 0.0)) discard;   // (the Tube's patch: its outline is drawn under every lumen, its lumen, and every pixel inside its shape, over them: each pixel in one draw)
#endif
`:""}  if (mPass == MP_LIFT) {
    vec4 lc = mC * mWs;
    if (lc.a < 0.002) discard;
    outColor = ditherOut(lc, q); outDep = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
    return;
  }
  // (The shape: a pixel it leaves clear is left as it is; one it covers outside a lumen hides the stream under it.)
  ${a?`if (tubeKey == 2 && !mLum && mC.a < 0.002 && mD < 0.0) { outFlow = uvec4(0u); outFlow2 = uvec4(0u); outColor = vec4(0.0); outDep = vec4(0.0); return; }   // (a shape prepass: a patch leaves clear the pixels inside its shape where a copy of this tier's vessel is drawn by a higher tier (keep 0), yet keeps their depth: the vessel's own strips under it must not draw them whole, as the Mesh's key pass leaves them to the patch)
  `:""}if (!mLum && mC.a < 0.002) discard;
  outColor = ditherOut(mC, q);
  outDep = vec4(dep ? 1.0 : 0.0);
  bool mfl = gId > 0u && gW > 0.01;
  outFlow = mfl ? packFlow(gId, gId2, gS, gY, gW, gB) : uvec4(0u);
  outFlow2 = mfl && gId2 > 0u ? packFlow2(gId2, gS2, gY2) : uvec4(0u);
  return;`}},jn=e=>`#version 300 es
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
  int j0 = int(aG.x + 0.5), jc = min(int(aG.y + 0.5), ${ue});
  vR = ivec4(0, 0, j0, jc); vNJ = jc; vM0 = aM0; vM1 = aM1;
  // (Its joins as this frame has them: between the views, the frame's (JT), as the fragment shader reads them.)
  vec3 J[${ue}];
  vec2 lo = vec2(1e9), hi = vec2(-1e9);
  for (int k = 0; k < ${ue}; k++) {
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
      for (int k = 0; k < ${ue}; k++) if (J[k].z > 0.0) d = min(d, length(q - J[k].xy) - J[k].z);
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
void main() { o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0) * uK; }`;var Ve=(e,o)=>e*64+o,Dt=.25,Ct=.5,Oe=(e,o)=>-(2+e*64+o);var $=e=>Number.isInteger(e)?`${e}.0`:String(e),To=`float joinAlong(int id, float u) {
  float ui = u * 63.0;
  int i0 = min(int(ui), 62);
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`,jt=e=>{if(e!==64)throw new Error("tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64");let o=e-1;return`// ---- a row's end on another row, worked out once a vertex (tube-join-glsl.js) ----
uniform int joinCut;                   // 0: no row has an end (vEnd is -1) and none of the join work runs; 1: the figure
flat out vec4 vJ0;                     // the start's end data: an open end: the trunk's chord a, b; a continuation: the end point and the plane's unit normal
flat out vec4 vJ1;                     // the end's
flat out vec4 vJK;                     // the start's (trunk radius, mode), the end's (radius, mode): mode 0 cut, 1 fade, 2 plane, -1 none
flat out vec4 vC0;                     // the other row's colour at the start's end (rgb), and a continuation's partner's tier (w; -1 otherwise)
flat out vec4 vC1;                     // and at the end's
${To}
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
  int lim = dir > 0 ? ${o} - sm : sm;
  float have = float(lim) * sp;
  float t = min(len, have) / sp;
  int k = min(int(t), max(lim - 1, 0));
  vec2 q = mix(PT(tr, sm + dir * k), PT(tr, sm + dir * min(k + 1, lim)), t - float(k));
  if (thru && len > have) {
    int en = sm + dir * lim;
    vec2 e0 = PT(tr, en);
    if (pq > 0) {
      int pr = (pq - 1) / 2, ps = (pq - 1) % 2 == 0 ? 0 : ${o}, pd = ps == 0 ? 1 : -1;
      float s2 = max(length(PT(pr, ps + pd) - PT(pr, ps)), 1e-4), t2 = min((len - have) / s2, ${$(o)});
      int k2 = min(int(t2), ${o-1});
      return e0 - PT(pr, ps) + mix(PT(pr, ps + pd * k2), PT(pr, ps + pd * (k2 + 1)), t2 - float(k2));
    }
    vec2 o = e0 - PT(tr, clamp(en - dir * 2, 0, ${o}));
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
    int s0 = max(sm - 1, 0), s1 = min(sm + 1, ${o});
    float sp = max(length(PT(tr, s1) - PT(tr, s0)) / float(max(s1 - s0, 1)), 1e-4);
    float r = max(texelFetch(rad, ivec2(sm, tr), 0).r, MIN_RADIUS);
    float hl = max(sp, ${$(2)} * r);
    // (The arms reach no further than the trunk does: past the trunk's own end nothing of it is drawn, and a branch cut there leaves a black wedge, 10 Nov, the portal fork. They follow its samples, so a trunk that bends within the reach, as the Circuit's cava does, is cut where it is, not along its tangent.)
    K = vec2(r, texelFetch(tube, ivec2(2, id), 0).x > texelFetch(tube, ivec2(2, tr), 0).x + 0.5 ? 1.0 : 0.0);
    float fk = sm == ${o} && !tf ? 2.0 : sm == 0 && !tb ? 3.0 : 1.0;
    C = vec4(joinPackColour(joinColour(tr, float(sm) / ${o}.0)), c, -(fk + 4.0 * (joinPack(tr, c) + 1.0)));   // (w: minus the flag (1: none, 2: the trunk's own end, 3: its start) plus four times (the trunk's pack + 1): the trunk's opacity, for the branch's fade into a fainter trunk)   // (w: the trunk's own end: with its cap gone the arms end flat there, so the branch is drawn beyond it)
    int ts = joinThruSide(tb, tf, sm);
    return vec4(joinArm(tr, sm, -1, sp, hl, tb, ts < 0 ? pq : 0), joinArm(tr, sm, 1, sp, hl, tf, ts > 0 ? pq : 0));
  }
  if (e < -1.5) {
    int k = int(-e + 0.5) - 2, pr = k / 64, ps = k % 64;
    vec2 E = PT(id, atStart ? 0 : ${o});
    vec2 dO = E - PT(id, atStart ? 2 : ${o-2});
    if (pr == id) {   // a trunk's own end that branches leave from, with no row carrying on: it ends flat, its round cap gone (the branches' own caps and the web make the fork)
      float l0 = length(dO);
      if (l0 > 1e-6) { K = vec2(0.0, 2.0); C = vec4(joinPackColour(joinColour(id, float(ps) / ${o}.0)), 0.0, 0.0, joinPack(id, E)); return vec4(E, dO / l0); }
      return vec4(0.0);
    }
    vec2 dP = PT(pr, ps) - PT(pr, ps == 0 ? 2 : ${o-2});
    float lo = length(dO), lp = length(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      vec2 m = dO / lo - dP / lp;
      float lm = length(m);
      if (lm > 1e-4) {
        vec2 f = -dP / lp, o = dO / lo;
        K = vec2(atan(o.x * f.y - o.y * f.x, dot(o, f)) + 0.0, 2.0);   // (K.x: the turn from this row's way out to the next row's way on, which the cel tones' light direction follows across the join)
        C = vec4(joinPackColour(joinColour(pr, float(ps) / ${o}.0)), 0.0, 0.0, joinPack(pr, E));
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
`},Wt=`uniform int joinCut;
flat out vec4 vJ0;
flat out vec4 vJ1;
flat out vec4 vJK;
flat out vec4 vC0;
flat out vec4 vC1;`,Pt="vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0); vC0 = vec4(0.0); vC1 = vec4(0.0);",ge=`flat in vec2 vEnd;                     // (the row's ends, which the vertex shaders hand on; the decisions are in vJ0, vJ1, vJK)
flat in vec4 vJ0;                      // the start's end data (tube-join-glsl.js)
flat in vec4 vJ1;                      // the end's
flat in vec4 vJK;                      // the start's (trunk radius, mode) and the end's
flat in vec4 vC0;                      // the other row's colour at the start's end
flat in vec4 vC1;                      // and the end's`,be=e=>{if(e!==64)throw new Error("tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64");let o=e-1;return`// ---- a row's end on another row (tube-join-glsl.js): the decisions, from the vertex shader's flat data; no reads ----
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
  if (!atStart && !(vI > ${o-24}.0)) return j;
  vec4 J = atStart ? vJ0 : vJ1;
  vec2 K = atStart ? vJK.xy : vJK.zw;
  if (K.y < -0.5) return j;
  float cw = max(${$(3)} * R, ${$(8)});
  vec4 CC = atStart ? vC0 : vC1;
  j.col = joinUnpackColour(CC.x);
  if (K.y > 1.5) {
    j.pt = CC.w;
    float s = dot(p - J.xy, J.zw);
    if (s > ${$(.25)} * px) {
      // The outer corner of a bend is not the other row's: between this row's end line (across its way out) and the next row's start line (across its way on) lies a wedge
      // neither lumen covers, which the two end caps, one circle, round off. The bisector m is this row's way out turned by half the bend; undo that turn for the two ways.
      float ha = 0.5 * K.x, ch = cos(ha), sh = sin(ha);
      vec2 qe = p - J.xy, wo = vec2(ch * J.z + sh * J.w, -sh * J.z + ch * J.w), wf = vec2(ch * J.z - sh * J.w, sh * J.z + ch * J.w);
      if (!(dot(qe, wo) > 0.0 && dot(qe, wf) < 0.0)) { j.drop = true; return j; }
    }
    j.wc = 0.5 * (1.0 - smoothstep(0.0, cw, -s));
    j.rs = smoothstep(-${$(3)} * R, 0.0, s);
    j.rot = K.x * 0.5 * (1.0 - smoothstep(0.0, max(${$(4)} * R, ${$(16)}), -s));
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
  if (gap < (soft ? -px : -${$(4)} * px) && !beyond) { j.drop = true; return j; }
  // (A trunk much narrower than the branch \u2014 a small tributary the join happens to mark as its trunk \u2014 does not recolour or flatten the wide branch: the share rk, and the reach by the narrower of the two.)
  float rk = smoothstep(0.3, 0.9, K.x / max(R, 1e-3)), rn = min(R, K.x);
  j.wc = (1.0 - smoothstep(0.0, max(${$(3)} * rn, ${$(8/2)}), gap)) * rk;
  // (The cel tones near the mouth are the trunk's: its axis point nearest the pixel (past a trunk's flat end, on its last arm's line, so its bands run straight on), the offset over its radius;
  // its share falls from the wall, or from the end's plane, to none JOIN_MOUTH_R radii out.)
  vec2 nA = joinNear(p, J.xy, CC.yz, beyond && fw > -2.5), nB = joinNear(p, CC.yz, J.zw, beyond && fw < -2.5);
  bool onA = beyond ? fw > -2.5 : length(p - nA) < length(p - nB);
  vec2 nt = onA ? nA : nB;
  j.tg = (p - nt) / max(K.x, 1e-3);
  float tgap = beyond ? max(length(p - nt) - K.x, fw < -2.5 ? -dot(p - J.xy, normalize(ba)) : dot(p - J.zw, normalize(ba))) : gap;
  j.tw = (1.0 - smoothstep(0.0, max(${$(3)} * rn, ${$(8)}), tgap)) * rk;
  if (soft && !beyond) { j.fl = smoothstep(-px, 0.0, gap); j.fo = j.fl; }
  // (A branch on a fainter trunk eases its opacity to the trunk's over its last JOIN_FADE_N samples: joinRamp, in the lean and the lumen shaders, takes j.pt and j.rs.)
  j.pt = pk;
  j.rs = 1.0 - smoothstep(0.0, ${$(14)}, atStart ? vI : ${o}.0 - vI);
  return j;
}
// The cel tones' direction across the vessel, turned toward the next row's across a continuation and handed to the trunk's own field at a cut branch's mouth: one tone field over
// the join. rho: the pixel's depth across its own vessel (celTones's), which celTones multiplies back in, so rho * the result is mix(rho * own, the trunk's tg, tw).
vec2 joinTone(vec2 g, JoinEnd j, float rho) {
  float c = cos(j.rot), s = sin(j.rot);
  return mix(vec2(c * g.x - s * g.y, s * g.x + c * g.y), j.tg / max(rho, 1e-4), j.tw);
}
`};var Re=e=>`float joinRamp(JoinEnd j, float ownEff, float occl) {
  if (j.pt < 0.0) return 1.0;
  int n = int(j.pt + 0.5);
  int tp = n & 31;
  float pa = float(n >> 7) / 255.0;
  if (((n >> 5) & 1) != 0 && useOrgan == 1) {
    float v = 1.0 - ${$(e)} * organK;
    pa *= tierGroup[tp] == 0 ? min(1.0, v / max(1.0 - occl, 1e-3)) : v;
  }
  float pe = pa * tierAlpha[tp] * (tierGroup[tp] == 0 ? 1.0 - occl * (((n >> 6) & 1) != 0 ? 0.0 : 1.0) : 1.0);
  return mix(1.0, min(1.0, pe / max(ownEff, 1e-3)), j.rs);
}
`;var Bt=(e,o,n)=>e&&o?n>=64/2?1:-1:o?1:e?-1:0,$t=(e,o)=>e*2+(o===0?0:1)+1;var Qe=6,So=7,se=11,Ze=Qe+k+Qe,Ae=6,me={GRID:0,DOME:1,TRAP:2},Io=Ze*se,et=1+Ae,tt=Io,ot=tt+(k-2)*et,Xe=ot+4*K,Ne={GLOW0:.02,GLOW_WALL:.07,GLOW1:.08,CASE0:.1,CASE1:.2,LUMEN0:.3,LUMEN_H:.5,PATCH:.95},ee=Ne,Ye={A:.35,L0:.26,H:.035};function Kn(e){let o=new Float32Array(Xe*4),n=(i,a,r,l,c)=>{o[i*4]=a,o[i*4+1]=r,o[i*4+2]=l,o[i*4+3]=c};for(let i=0;i<Ze;i++)for(let a=0;a<se;a++)n(i*se+a,me.GRID,i,a,0);for(let i=1;i<k-1;i++){let a=tt+(i-1)*et;n(a,me.DOME,i,0,0);for(let r=0;r<Ae;r++)n(a+1+r,me.DOME,i,1,r)}for(let i=0;i<K;i++)for(let a=0;a<4;a++)n(ot+4*i+a,me.TRAP,i,a&1,a>>1);let t=[];for(let i=0;i<Ze-1;i++)for(let a=0;a<se-1;a++){let r=i*se+a,l=r+1,c=r+se,f=c+1;t.push(r,c,l,l,c,f)}for(let i=1;i<k-1;i++){let a=tt+(i-1)*et;for(let r=0;r<Ae;r++)t.push(a,a+1+r,a+1+(r+1)%Ae)}for(let i=0;i<K;i++){let a=ot+4*i,r=a+1,l=a+2,c=a+3;t.push(a,l,r,r,l,c)}if(Xe>=65536)throw new Error("tube-geo: the vertex count does not fit a Uint16Array index");let s=new Float32Array(e);for(let i=0;i<e;i++)s[i]=i;return{attr:o,index:Uint16Array.from(t),nVerts:Xe,nIndex:t.length,rows:s}}var X=e=>Number.isInteger(e)?e.toFixed(1):String(e),nt=(e,o=1)=>`#version 300 es
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
const int T_CAP = ${Qe};
const int T_ARC = ${So};
const int T_ACROSS = ${se};
const int T_HEX = ${Ae};
const int T_DOME = ${me.DOME};
const int T_TRAP = ${me.TRAP};
const float L_GLOW0 = ${X(ee.GLOW0)};
const float L_GLOW_WALL = ${X(ee.GLOW_WALL)};
const float L_GLOW1 = ${X(ee.GLOW1)};
const float L_CASE0 = ${X(ee.CASE0)};
const float L_CASE1 = ${X(ee.CASE1)};
const float L_LUMEN0 = ${X(ee.LUMEN0)};
const float L_LUMEN_H = ${X(ee.LUMEN_H)};
const float L_PATCH = ${X(ee.PATCH)};
const float L_FADE_A = ${X(Ye.A)};
const float L_FADE0 = ${X(Ye.L0)};
const float L_FADE_H = ${X(Ye.H)};
out float vI;
flat out int vRow;
out float vD;                          // signed distance from the lumen's wall (negative inside, 0 on the wall, positive in the skirt), world units
out vec2 vG;                           // the offset from the centreline point to this point (not unit)
out float vRad;                        // the lumen's radius at this ring or sample
flat out vec2 vEnd;                    // the vessel this row ends on at its start (x) and end (y): row * 64 + the sample there, or -1
flat out vec4 vMouthA;                 // the branches that end on this row's side: its outline is left open across them (tube-lean-glsl.js mouthOpen)
flat out vec4 vMouthB;
${jt(k)}// The across offset d and the level f of across column ac, for a ring whose half tube has radius rc.
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
  vRow = id;
  vEnd = aRow.w > 1.5 && joinCut == 1 ? aRow.yz : vec2(-1.0);
  joinOut(id, vEnd, aRow.w);
  vMouthA = joinCut == 1 ? aMouthA : vec4(0.0);
  vMouthB = joinCut == 1 ? aMouthB : vec4(0.0);
  int kind = int(aV.x + 0.5), ring = int(aV.y + 0.5);
  vI = kind == T_TRAP ? aV.y + aV.w : kind == T_DOME ? float(ring) : float(clamp(ring - T_CAP, 0, N_SAMPLES - 1));
  bool glow = mPass <= ${Y.UP};
  bool lit = texelFetch(tube, ivec2(10, id), 0).a > 0.0, up = texelFetch(tube, ivec2(11, id), 0).w > 5.0;
  if (glow && (!lit || up != (mPass >= ${Y.UP_K}))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  bool sel = (int(texelFetch(tube, ivec2(2, id), 0).z + 0.5) & ${o}) != 0;
  float sp = sel ? selPad : 0.0;
  float wr = texelFetch(tube, ivec2(0, id), 0).w * celK + sp + aaPad + padU;
  vec3 q = tubePlace(id, aV, wr, sp, hRef, glow, zK * texelFetch(tube, ivec2(2, id), 0).y);
  if (!glow && !(zK > 0.0)) q.z = tubeFadeLevel(q.z, tubeAlpha(id, q.xy));
  vec3 d = world * vec3(q.xy, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0, 1.0);
}`;var je=6,ye=je+1,H={APEX:0,FILL:1,IN:2,OUT:3,STRIP_A:4,STRIP_B:5},Ce=4,zt=1+3*ye+2*Ce,at=1,Fe=1+ye,De=1+2*ye,Ut=1+3*ye,U=12,Oo=Ne.LUMEN0+.01,Ro=.295,it=20,lt=6,No=.02,ct=14,ht=170,Fo=4,Do=.9,Co=32,jo=3,Wo=16,Po=.25,Bo=.06,Jt=8,st=Ne,rt=Math.PI/180;function Gt(){let e=new Float32Array(zt*4),o=(t,s,i)=>{e[t*4]=s,e[t*4+1]=i};o(0,H.APEX,0);for(let t=0;t<2;t++)for(let s=0;s<Ce;s++)o(Ut+t*Ce+s,t===0?H.STRIP_A:H.STRIP_B,s);for(let t=0;t<ye;t++)o(at+t,H.FILL,t),o(Fe+t,H.IN,t),o(De+t,H.OUT,t);let n=[];for(let t=0;t<je;t++)n.push(0,at+t,at+t+1);for(let t=0;t<je;t++)n.push(Fe+t,De+t,Fe+t+1,Fe+t+1,De+t,De+t+1);for(let t=0;t<2;t++){let s=Ut+t*Ce;n.push(s,s+1,s+2,s,s+2,s+3)}return{attr:e,index:Uint16Array.from(n),nVerts:zt,nIndex:n.length}}function pe(e,o,n){let t=e[2*o],s=e[2*o+1];for(let i=1;i<=Jt;i++){let a=o+n*i;if(a<0||a>=k)break;let r=e[2*a]-t,l=e[2*a+1]-s,c=Math.hypot(r,l);if(c>1e-6)return[r/c,l/c]}return[n,0]}var z=e=>Number.isInteger(e)?e.toFixed(1):String(e),ft=(e,o=1)=>`#version 300 es
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
const int W_APEX = ${H.APEX};
const int W_FILL = ${H.FILL};
const int W_IN = ${H.IN};
const int W_OUT = ${H.OUT};
const int W_STRIP_B = ${H.STRIP_B};
const int W_STRIP_A = ${H.STRIP_A};
const float W_STRIP = ${z(Oo)};
const float W_LUMEN_H = ${z(st.LUMEN_H)};
const int W_ARC = ${je};
const int W_LOOK = ${Jt};
const float W_LEVEL = ${z(Ro)};
const float W_CASE0 = ${z(st.CASE0)};
const float W_CASE1 = ${z(st.CASE1)};
const float W_MIN = ${z(lt*rt)};
const float W_FULL = ${z(it*rt)};
const float W_MAX = ${z(ht*rt)};
const float W_FAR = ${z(Fo)};
const float W_FAR_T = ${z(ct)};
const float W_CUT = ${z(Do)};
const int W_SPAN = ${Co};
const int W_REFIT = ${jo};
const int W_DEVN = ${Wo};
const float W_DEV = ${z(Bo)};
const float W_DEV_T = ${z(No)};
const float W_OVER = ${z(Po)};
out float vI;
flat out int vRow;
out float vD;
out vec2 vG;
out float vRad;
flat out vec2 vEnd;
flat out vec4 vMouthA;                 // (a web opens no outline: both zero)
flat out vec4 vMouthB;
${Wt}
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
  vRow = int((ownB ? aLegB.x : aLegA.x) + 0.5);
  vI = ownB ? aLegB.y : aLegA.y;
  vEnd = vec2(-1.0);
  ${Pt}
  vMouthA = vec4(0.0); vMouthB = vec4(0.0);
  vD = 0.0; vG = vec2(0.0);
  float Rm = max(A.r, B.r);
  vRad = 4.0 * Rm;
  bool mouth = aWeb.z < 1.5;                // (a marked trunk owns the web: its wall tone all over, as the branch's mouth carries it on)
  vec2 gOwn = ownB ? B.n : A.n;
  if (mPass < ${Y.SHAPE_K}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // no glow, up-glow or shadow of a web
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
}`;var W={K:1.6,INK:[.07,.06,.06],DIR:[-.70710678,-.70710678],SHADE_AT:-.16,LIT_AT:.24,SHADE:.17,LIT:.15,LINE_MIN:1.5,LINE_MAX:3,LINE_R:.14},q=e=>Number.isInteger(e)?`${e}.0`:String(e),dt=()=>`
const vec2 CEL_DIR = vec2(${W.DIR.map(q).join(", ")});
const float CEL_SHADE_AT = ${q(W.SHADE_AT)};
const float CEL_LIT_AT = ${q(W.LIT_AT)};
const float CEL_SHADE = ${q(W.SHADE)};
const float CEL_LIT = ${q(W.LIT)};

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

// The wall line of a disc cut across. A disc that vessels join (rj: their mean radius, tube texel 3's w) has ONE wall line, the outline outside its fill, as wide as theirs
// (the line's rule, LINE_R of the radius held between LINE_MIN and LINE_MAX device px: discWall), left out across each mouth by the same mask as the pale band
// (celShade); so its wall and theirs are one line. 15 Nov 2026, Mohammad (the central vein's black ragged rim, iPhone): the outline outside the fill was cut by the branch
// geometry (mouthOpen, 8 at most, the unflared radius) and the ink line inside it by the mask: two lines, two shapes, nearly three times a sinusoid's wall, with chewed ends.
// A disc nothing joins (the ductule) keeps its outline and, inside it, its own line 0.8 of the outline's width (discLine).
float discWall(float rj, float wl, float px) {
  return rj > 0.0 ? clamp(${q(W.LINE_R)} * rj, ${q(W.LINE_MIN)} * px, ${q(W.LINE_MAX)} * px) : wl;
}
float discLine(float rj, float wl) {
  return rj > 0.0 ? 0.0 : 0.8 * wl;
}

// A disc cut across, outlined (flag F_RING; Mohammad, 10 Nov 2026: "outline it, where it's not connecting to a vessel"): inside the wall, an ink line wl wide (the
// vessel's own outline ink, ink) and, inside that, the pale band; both all round, and none where a vessel joins (open 1: ringOpen) so the vessel flows in.
// The lumen layer lays this again over the blood (it replaces this layer's fill), so both shaders call it.
vec3 celDisc(vec3 lum, vec3 ink, float D, float R, float wl, float aa, float open) {
  float closed = 1.0 - open;
  lum = mix(lum, celRing(lum, D + wl, R, aa), closed);
  return mix(lum, ink, clamp(0.5 + (D + wl) / aa, 0.0, 1.0) * closed * step(0.0001, wl) * smoothstep(1.5, 3.5, R / aa));
}
`,Ht=({F_DIFFUSE:e,F_EDGE:o,F_VEIL:n})=>`
uniform float celK;                    // (declared for the host's sake; the outline's width is now in device pixels by caliber)
${dt()}const vec3 CEL_INK = vec3(${W.INK.map(q).join(", ")});

// The tier's shape drawn at a pixel, cel shaded: selection ring, outline, the flat lumen in three subtle tones lit from the top left, dark
// lumen's rim, lift, hover and the knock-out ring, premultiplied, before the tier's alpha. Ds is unused (a cel shaded vessel has no contact
// shadow); D, R, wall, col, g, aL as in tubeShade.
vec4 celShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov,
              vec3 edge, float kn, float kcas, float aa, float aL) {
  float rj = (flags & ${V}) != 0 ? T(id, 3).w : 0.0;   // (a disc that vessels join: their mean radius)
  float wl = discWall(rj, clamp(${q(W.LINE_R)} * R, ${q(W.LINE_MIN)} * px, ${q(W.LINE_MAX)} * px), px);
  float dOpen = rj > 0.0 ? smoothstep(0.15, 0.85, ringOpen(T(id, 3).xyz, g)) : 0.0;   // (the mask's 5 degree bins are soft; a short stretch of wall between two mouths stays a whole line, not a fading dot)
  cA *= 1.0 - dOpen;
  float aC = clamp(0.5 - (D - wl) / aa, 0.0, 1.0);
  vec4 c = vec4(0.0);
  if (sel) { float ar = ring.a * clamp(0.5 - (D - wl - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
  // (A veiled vessel keeps half its outline: behind an organ the wall's line is the first thing to go.)
  if ((flags & ${n}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 ink = casing.rgb;   // one ink for every vessel, the look's own (--casing-rgb: a warm sepia on the light looks, the ground's near-black on the dark ones; Mohammad, 13 Nov 2026, outlines A)
  c = (flags & ${o}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC * (1.0 - dOpen)), c) : over(vec4(ink, 1.0) * (cA * aC), c);
  vec3 lum = col;
  if (fx == 1 && (flags & ${e}) != 0 && aL > 0.0) lum = celTones(lum, D, R, g, aa);
  if (fx == 1 && (flags & ${V}) != 0 && aL > 0.0) lum = celDisc(lum, T(id, 4).rgb, D, R, discLine(rj, wl), aa, dOpen);
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
`;var mt=`#version 300 es
precision highp float;
void main() {}
`,qt=e=>`#version 300 es
precision highp float;
precision highp int;
in float vI;
in float vRad;
${ge}
uniform float px;
uniform vec4 invA;
uniform vec2 tOff;
uniform vec2 lOff;
uniform vec2 sizeF;
${be(e)}
void main() {
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  if (joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, vRad, px).drop) discard;
}
`,zo=`float mouthOpen(vec2 p, float R, float px) {
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
}`,Kt=e=>{let{F_SEL:o,F_DOTTED:n,F_NOCASE:t,F_SHADOW:s,EDGE:i,ENT_W:a,N_SAMPLES:r,MAX_TIERS:l,S_OFF:c,ALONG_GLSL:f}=e;if(r!==64)throw new Error("tube-lean-glsl: vEnd packs the trunk row as row * 64 + sample, so N_SAMPLES must be 64");let w=r-1;return`#version 300 es
precision highp float;
precision highp int;
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the outline's skirt
in vec2 vG;                            // direction from the centreline to this point (not unit; (0, 0) on the centreline)
in float vRad;                         // the lumen's radius here, world units
${ge}
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
uniform float tierAlpha[${l}];
uniform int tierGroup[${l}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture, not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw: only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 \xD7 (arc length + S_OFF), across (0\u201365535), visibility
layout(location=2) out uvec4 outFlow2; // the second lumen (a strip has none: zero)
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

const float LAST = ${w}.0;
const float S_OFF = ${c}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${r/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${a}, t / ${a}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
${f}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

${Ie(e)}
${Ht(e)}

${be(r)}
${Re(e.VEIL_K)}
${zo}
void main() {
  // (Only the shape and its lift: a glow pass stays on the stage 1 program.)
  if (mPass < ${Y.SHAPE_K} || mPass > ${Y.LIFT}) discard;
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
  bool dotted = (int(t2.z + 0.5) & ${n}) != 0;
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
  bool sel = (flags & ${o}) != 0;
  float cA = (flags & ${t}) != 0 ? 0.0 : (flags & ${n}) != 0 ? 0.35 : 1.0;
  // (Where a branch joins this row's side its wall line is left open across the branch's width: the line under the branch's faded end showed through it as a seam, tube-data.js mouthCode.)
  if (D > -2.0 * px && vMouthA.x + vMouthA.y + vMouthA.z + vMouthA.w + vMouthB.x + vMouthB.y + vMouthB.z + vMouthB.w > 1.5 && (flags & ${V}) == 0) cA *= 1.0 - mouthOpen(p, R, px);   // (a disc cut across opens its outline by the mask all round: celShade)
  vec2 g = joinTone(length(vG) > 1e-5 ? normalize(vG) : vec2(0.0), je, clamp((R + D) / max(R, 1e-3), 0.0, 1.0));   // (one tone field over a join: tube-join-glsl.js)
  float aa = px * ${i};
  float aL = clamp(0.5 - D / aa, 0.0, 1.0);
  if (aL > 0.0) dep = true;
  vec4 c = celShade(D, D, R, aWall, aCol, g, flags & ~${s}, sel, cA, grp, id, u, aHov, aEdge, 0.0, 0.0, aa, aL);
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
    vec2 a = PT(id, clamp(int(vI), 0, ${r-2})), ba = PT(id, clamp(int(vI), 0, ${r-2}) + 1) - a;
    float across = (ba.x * (p - a).y - ba.y * (p - a).x) * inversesqrt(max(dot(ba, ba), 1e-8));
    gId = uint(id + 1); gS = u * t5.z; gY = clamp(across / max(R, 1e-3), -1.0, 1.0); gW = lumA * smoothstep(0.5, 0.9, je.fl);   // (a branch fading into its trunk hands its blood and heads over to the trunk's before it is half gone: no stray head on the ghost of its end)
  }
  if (grp == 0) c *= 1.0 - occl * aOf;
  c *= mix(je.fo, je.fl, aL) * jr;   // (the lumen's share fades with the branch, the outline's faster)
  // (The lift: the selected vessel's own share, laid over the network.)
  if (mPass == ${Y.LIFT}) {
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
`};var Q=64,Uo=.62,Vt=96;var Xt=`
float alongAt(int id, float u) {
  float ui = u * ${Q-1}.0;
  int i0 = min(int(ui), ${Q-2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`,Yt=`
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
  return a.y == 0.0 ? D : mod(D + (vd + 0.5 * a.z * t) * a.y * t, ${Ue}.0);
}
float flowDrift(int id, float dr, float stasis) {
  vec2 a = texelFetch(flow, ivec2(6, id), 0).xy;
  return a.y == 0.0 ? dr : mod(dr + stasis * ${Ge} * (bT - a.x), ${Je}.0);
}
// A chained vessel's root stream (row rid): its distance and drift now, from its own row (ch: the CPU's copy, flow texel 5).
vec2 rootDD(int rid, vec2 ch) {
  vec3 a = texelFetch(flow, ivec2(6, rid), 0).xyz;
  if (a.y == 0.0) return ch;
  vec4 r0 = texelFetch(flow, ivec2(0, rid), 0);
  float tr = bT - a.x;
  return vec2(mod(r0.x + (r0.y + 0.5 * a.z * tr) * a.y * tr, ${Ue}.0),
              mod(texelFetch(flow, ivec2(3, rid), 0).z + r0.w * ${Ge} * (bT - a.x), ${Je}.0));
}
`,_e={samplers:`uniform highp sampler2D flow;          // per vessel: FLOW_TEXELS texels
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D bend;          // per vessel: the axis's signed curvature at each sample (setBend)
uniform sampler2D dye;                 // per vessel: dye concentration along the course`,pxW:"uniform float pxW;                     // world units per device pixel",modes:`#if PLAIN == 0
uniform int origin;                    // 1: color parcels by where their blood came from
uniform int dyeOn;
#else
const int origin = 0, dyeOn = 0;
#endif`,ink:`uniform float clock;                   // seconds (wrapped)
uniform highp float bT;                // the blood's own clock, from the stage's epoch (flowD: the streams advance here, not on the CPU)
uniform vec3 originCol[5];
uniform vec3 dyeCol;
uniform vec3 revCol;                   // the moving blood's color where flow runs backwards
uniform vec3 inkLight, inkDark;`,rows:"uniform float rows;"},Qt=()=>[_e.samplers,_e.pxW,_e.modes,_e.ink,_e.rows].join(`
`),Jo=()=>`const float BINS = ${Et}.0;
const float S_OFF = ${Vt}.0;
const float ORIGIN_GREY = ${Uo};
const int N_LAST = ${Q-1};`,Go=()=>"vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }",Ho=()=>`// The caliber at arc length s, interpolated between its samples (not the nearest one), so nothing scaled by it steps along the vessel.
${Xt}
${Yt}
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
}`,qo=()=>`// The axis's signed curvature at arc length s (1 / world units; positive turning toward +y).
float bendAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${Q-1}.0;
  int i0 = min(int(ui), ${Q-2});
  return mix(texelFetch(bend, ivec2(i0, id), 0).r, texelFetch(bend, ivec2(i0 + 1, id), 0).r, ui - float(i0));
}`,Ko=()=>`// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall
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
}`,Zt=()=>[Jo(),Go(),Ho(),qo(),Ko()].join(`
`),Vo=()=>`    if (chev == 1 && chevQuad == 0 && f1.z > 0.0 && !isLy) {
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
        col = mix(col, hRim, c.y * 0.75 * vis * flowA * blendA.x);
        col = mix(col, hCore, c.x * vis * flowA * blendA.x);
      }
    }
`,da=()=>`uniform sampler2D lumenL;               // the Tube's lumen layer: the lumen in front, drawn by the tubes this frame (premultiplied; alpha: its coverage x the vessel's opacity)
uniform float lumSc;                   // 1 while the lumen layer is a share of the vessel layer's size (read filtered and masked by the layer's own lumen), else 0 (read texel for texel)
`,ua=()=>[Xt,Yt].join(`
`),ma=({LUMEN2:e,FLOW_TEXELS:o})=>`  // The Tube: the lumen as the tubes drew it this frame, at the texel the vessel layer is read at (a tier frame's small targets: filtered, as the layer is).
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
  if (bloodOnly == 1 && stillOn == 1 && g.x > 0u && texelFetch(flow, ivec2(${o}, int(g.x) - 1), 0).x == 0.0) discard;
`,pa=()=>`  if ((blood == 1 || dyeOn == 1 || origin == 1 || chevC) && v.a > 0.01) {
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
      ${Vo()}
    }
    v = vec4(col * v.a, v.a);
  }
`;function pt(e,o){let n=e.indexOf(o);if(n<0)throw new Error(`tube-lumen-glsl: ${o} is not in the shared shading text`);let t=e.indexOf("{",n),s=0;for(;t<e.length;t++)if(e[t]==="{")s++;else if(e[t]==="}"&&--s===0)return e.slice(n,t+1);throw new Error(`tube-lumen-glsl: ${o} has no closing brace`)}var j=e=>Number.isInteger(e)?e.toFixed(1):String(e),P={onLight:[0,.3,.38],onDark:[.82,.96,.96],luma:[.45,.6],strength:1,gapCss:110,octaves:5,size:[.55,.85,4,16],stretch:1,across:[.9,1.4]},Xo=2,Yo=.02,eo=e=>{let{F_DOTTED:o,EDGE:n,ENT_W:t,N_SAMPLES:s,MAX_TIERS:i}=e;if(s!==Q)throw new Error("tube-lumen-glsl: the arc length is packed over 64 samples, so N_SAMPLES must be 64");let a=s-1,r=Ie(e);return`#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${e.PLAIN?1:0}
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the outline's skirt
in vec2 vG;                            // offset from the centreline point to this point (world units; (0, 0) on the centreline)
in float vRad;                         // the lumen's radius here, world units (a web: 4 x its larger member's radius)
${ge}
${Qt()}
uniform int fx;                        // 1: shading (off in the figure view): the cel tones below
uniform int blood;                     // 1: draw the blood
uniform vec2 blendA;                   // 0..1 each: the chevrons and the origin colours fading in or out (switched on or off)
uniform float flowA;                   // 0..1: how visible the moving blood is (it fades in once the view is still)
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
uniform float tierAlpha[${i}];
uniform int tierGroup[${i}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
out vec4 outColor;                     // the lumen's colour \xD7 its coverage \xD7 the vessel's opacity (premultiplied)

const float LAST = ${a}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${s/2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${t}, t / ${t}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
// (alongAt, radAt, castAt, lymphAt, originAt, the dye: the compositor's own text, compLumenFns.)
${Zt()}
${Lt}


${pt(r,"void vesAttrs(")}

${pt(r,"vec4 ditherOut(")}

${pt(r,"float ringOpen(")}

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

${be(s)}
${Re(e.VEIL_K)}

// (The cel tones of the vessel layer's fill, tube-cel-glsl.js: this layer's colour replaces the fill's, so the tones are laid on it, over the blood.)
${dt()}

void main() {
  int id = vRow;
  vec4 t2 = T(id, 2), t5 = T(id, 5);
  int flags = int(t2.z + 0.5);
  // A closed potential collateral (dotted) shows no stream: the vessel shader writes none for it.
  if ((flags & ${o}) != 0) discard;
  float u = vI / LAST;                 // (how far along, 0\u20131)
  float R = vRad, D = vD;
  // The row's clip range, as segNear applies it (a vessel drawing on has a round end where the clip cuts it).
  if (t5.x > 0.0 || t5.y < 1.0) {
    float ext = max(t5.x - u, u - t5.y) * t5.z;
    if (ext > 0.0) D = length(vec2(D + R, ext)) - R;
  }
  // The lumen only, soft at its wall as the vessel layer's lumen is.
  float aa = pxW * ${n};
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
  if (lumA <= ${Yo}) discard;
  // The place in the stream, as packFlow would have stored it and the compositor unpacked it: the arc length and the across.
  int sg = clamp(int(vI), 0, ${s-2});
  vec2 sa = PT(id, sg), ba = PT(id, sg + 1) - sa;
  float across = (ba.x * vG.y - ba.y * vG.x) * inversesqrt(max(dot(ba, ba), 1e-8));
  float s1 = u * t5.z;
  float len1 = max(t5.z, 1.0);
  float R1 = radAt(id, s1, len1);
  bool web = vRad > ${Xo}.0 * R1;   // (a web: its vRad is 4 x a radius; see the header)
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
    col = mix(col, oc, vis * blendA.y);
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
  bool isLy = f1.x < -0.5;   // (a lymph row: dashes or chevrons)
  bool isBi = f1.x < -1.5;   // (a bile row, lobule-bile.js bileFlowInto: arrowheads only)
  if (blood == 1 && isBi && f1.z > 0.0) {
    // Bile (Mohammad, 16 Nov 2026: arrows "similar to the blood chevrons"; he picked the green of four inks): the blood's own head
    // (chevron-glsl.js chevHead) and its size rule (veins-gl.js chevAt: half the caliber, 4 to 8 CSS px, never wider than the duct), a
    // leaf-green core with a dark olive rim, spaced f0.y apart (world units, wider than the blood's) and moving toward the row's end, the
    // ductule (f0.x: the phase, advanced on the CPU at one speed). f0.z: world units per CSS px. None on a duct under 3 px across.
    float P = max(f0.y, 1.0), u = (fract((s1 - f0.x) / P) - 0.5) * P, ay = abs(y1) * R1, cpx = max(f0.z, 1e-4);
    float hw = min(0.8 * R1, clamp(0.5 * R1, 4.0 * cpx, 8.0 * cpx));
    vec2 h = chevHead(u, ay, hw, pxW, 0.0) * smoothstep(0.0, P * 0.5, min(s1, len1 - s1)) * smoothstep(1.2, 1.6, R1 / max(pxW, 1e-3));
    float k = vis * flowA * f1.z;
    col = mix(col, vec3(0.14, 0.18, 0.05), clamp(h.y * 0.75 * k, 0.0, 1.0));
    col = mix(col, vec3(0.64, 0.88, 0.30), clamp(h.x * k, 0.0, 1.0));
  }
  if (blood == 1 && isLy && !isBi && f1.z > 0.0) {
    // Lymph. The lobule's lymph rows (lobule-zoom.js) carry the heads' phase, pitch, protein and theme in flow texel 0, and the CSS px in world units in f1.y. A row that
    // ALSO carries a stream in texel 7 (y: the signed speed, never 0, which says the way the lymph runs; y = 0: none) is drawn as teal chevrons. A row with none keeps the dashes.
    vec4 sd = texelFetch(flow, ivec2(7, id1), 0);
    float aLy = clamp(f1.z * vis * flowA, 0.0, 1.0);
    if (sd.y != 0.0) {
      // Chevrons (Mohammad, 16 Nov 2026): the bile arrows' head and size rule, teal, moving as the lymph does. f0.x: the phase (world units, within one pitch,
      // advanced on the CPU; it grows toward the row's end), f0.y: the pitch, f1.y: world units per CSS px. sd.y (the stream's signed speed, never 0) says which
      // way the head points, whichever way the row is drawn. None on a channel under about a pixel across.
      float cl = dot(vc1, vec3(0.299, 0.587, 0.114));
      float onLight = smoothstep(${j(P.luma[0])}, ${j(P.luma[1])}, cl);   // 1: a light channel, dark head; 0: a dark one, light head
      vec3 ink = mix(vec3(${P.onDark.join(", ")}), vec3(${P.onLight.join(", ")}), onLight);
      float base = max(f0.y, 1.0), dirL = sd.y < 0.0 ? -1.0 : 1.0, cpx = max(f1.y, 1e-4);
      // The spacing: about gapCss CSS px on screen at every zoom, as the blood's heads are (chevLevel, chevKeep): the lattice of base doubles n times (n = the octave
      // the view asks for); a head of the finer lattice that is not on the coarser one fades out as the view asks for the next octave, so none pops.
      float lv = clamp(log2(max(${j(P.gapCss)} * cpx / base, 1.0)), 0.0, ${j(P.octaves)});
      float n = floor(lv), P = base * exp2(n), q = (s1 - f0.x) / P, jj = floor(q);
      float keep = mod(jj, 2.0) < 0.5 || n >= ${j(P.octaves)} ? 1.0 : 1.0 - (lv - n);
      // A Disse sleeve (sd.z: its sinusoid's row + 1, sd.w: how far along the sleeve that sinusoid starts) is drawn under the sinusoid, so only its rim shows: the head is
      // laid on the sinusoid's wall (ay measured from it, the tip against the wall, the arms out across the rim, one each side) and fitted to the rim's width, longer
      // than tall as the rim gets thin. A channel of its own (the terminal and tract lymphatics: sd.z 0) takes the whole width as before.
      int sib = int(sd.z + 0.5) - 1;
      float Ri = 0.0, rim = R1;
      if (sib >= 0) { float ls = max(T(sib, 5).z, 1.0); Ri = min(radAt(sib, clamp(s1 - sd.w, 0.0, ls), ls), R1); rim = R1 - Ri; }
      float stretch = sib >= 0 ? 1.0 + ${j(P.stretch)} * (1.0 - smoothstep(2.0, 6.0, rim / cpx)) : 1.0;
      float u = (q - jj - 0.5) * P * dirL / stretch, ay = max(abs(y1) * R1 - Ri, 0.0);
      float hw = sib >= 0 ? min(0.95 * rim, ${j(P.size[3])} * cpx)
                          : min(${j(P.size[1])} * R1, min(${j(P.size[3])} * cpx, max(${j(P.size[0])} * R1, ${j(P.size[2])} * cpx)));
      vec2 h = chevHead(u, ay, hw, pxW, 0.0) * keep * smoothstep(0.0, 0.5 * ${j(P.gapCss)} * cpx, min(s1, len1 - s1)) * smoothstep(${j(P.across[0])}, ${j(P.across[1])}, rim / max(pxW, 1e-3));
      col = mix(col, ink, clamp(h.x * ${j(P.strength)} * aLy * (1.0 - castAt(id1, s1, len1)), 0.0, 1.0));
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
  if (fx == 1 && (flags & ${V}) != 0) col = celDisc(min(col, vec3(1.0)), T(id, 4).rgb, D, R, discLine(T(id, 3).w, clamp(${j(W.LINE_R)} * R, ${j(W.LINE_MIN)} * pxW, ${j(W.LINE_MAX)} * pxW)), aa, ringOpen(T(id, 3).xyz, length(vG) > 1e-5 ? normalize(vG) : vec2(0.0)));
  outColor = ditherOut(vec4(min(col, vec3(1.0)), 1.0) * lumA, q);
}
`};var ya=Q-1;var R=12,vt=8,we=4,Qo=(e,o)=>2+2*e+(o?1:0),re=-1,Zo=1024,en=8,Be=7,tn=8,Le=10,on=43,nn=47,an=48,sn=20,rn=21,ln=4,cn=5,$e=k/2,ve=Math.PI/180,to=1e-6,We=12,oo=.3,Z=new Int32Array(256),ie=new Int32Array(1024),io=new Float32Array(1),hn=new Uint32Array(io.buffer),he=(e,o)=>{let n=Math.floor(e[o+tn]+.5);return n<0?0:n>=O?O-1:n},oe=(e,o,n)=>e[(o*$e+(n>>1))*4+(n&1)*2],ne=(e,o,n)=>e[(o*$e+(n>>1))*4+(n&1)*2+1],fn=(e,o)=>e.length>=(o*$e+$e)*4&&(oe(e,o,0)!==0||ne(e,o,0)!==0||oe(e,o,k-1)!==0||ne(e,o,k-1)!==0),ce=8,le=new Int32Array(4),te=new Int32Array(4),Pe=new Float32Array(4),dn=.05,m={row:new Int32Array(ce),sample:new Int32Array(ce),dir:new Int8Array(ce),mark:new Float32Array(ce),ang:new Float64Array(ce),order:new Int8Array(ce),n:0};function un(e,o,n,t,s=0,i=k-1){let a=s,r=1/0;for(let l=s;l<=i;l++){let c=Math.hypot(oe(e,o,l)-n,ne(e,o,l)-t);c<r&&(r=c,a=l)}return a}function no(e,o,n,t){let s=0,i=t>n?1:-1;for(let a=n;a!==t;a+=i)s+=Math.hypot(oe(e,o,a+i)-oe(e,o,a),ne(e,o,a+i)-ne(e,o,a));return s}function Ee(e,o,n){for(let t=0;t<k;t++)n[2*t]=oe(e,o,t),n[2*t+1]=ne(e,o,t);return n}var wt=new Float64Array(k*2),ao=new Float64Array(k*2),mn=50,pn=10,vn=45;function lo(e,o,n,t){let s=e[o],i=e[o+1],a=e[o+2],r=0;for(let c=0;c<4;c++){let f=kt(e[o+4+c]);if(!f||f.row<0||f.row>=t||!fn(n,f.row))continue;let w=!1;for(let g=0;g<r;g++)le[g]===f.row&&(w=!0);if(w)continue;let u=f.row,d=un(n,u,s,i);d>0&&d<=We&&no(n,u,0,d)<=oo*a?d=0:d<k-1&&d>=k-1-We&&no(n,u,k-1,d)<=oo*a&&(d=k-1),le[r]=u,te[r]=d,Pe[r++]=f.mark}for(let c=0;c<2;c++)for(let f=0;f<r;f++){let w=te[f];if(w===0||w===k-1)continue;let u=w<=We?0:w>=k-1-We?k-1:-1;if(u<0)continue;let d=oe(n,le[f],u),g=ne(n,le[f],u);for(let A=0;A<r;A++)if(!(A===f||te[A]!==0&&te[A]!==k-1)&&Math.hypot(oe(n,le[A],te[A])-d,ne(n,le[A],te[A])-g)<=dn*a){te[f]=u;break}}let l=0;for(let c=0;c<r;c++){let f=te[c],w=le[c];f===0||f===k-1?(m.row[l]=w,m.sample[l]=f,m.dir[l]=f===0?1:-1,m.mark[l++]=Pe[c]):(m.row[l]=w,m.sample[l]=f,m.dir[l]=1,m.mark[l++]=Pe[c],m.row[l]=w,m.sample[l]=f,m.dir[l]=-1,m.mark[l++]=Pe[c])}return m.n=l,l}var xt=8192;function ze(e,o,n,t,s=null,i=0,a=1/0){(!t.rows||t.rows.length<o*R)&&(t.rows=new Float32Array(o*R));let r=t.rows,l=a<1/0&&t.tr||null;if(!l)for(let u=0;u<o;u++){let d=u*C,g=u*R,A=(Math.floor(e[d+Le]+.5)&en)!==0,L=e[d+sn]>to||e[d+rn]<1-to;r[g]=u,r[g+1]=re,r[g+2]=re,r[g+3]=A||L?3:2;for(let v=0;v<vt;v++)r[g+we+v]=0}if(s){let u=Math.floor(n.length/8),d=l?l.nDefer:0,g=16;for(;g<u*2;)g*=2;ie.length<g&&(ie=new Int32Array(g)),l?(ie.set(l.seen),Z.length<l.defer.length*2&&(Z=new Int32Array(l.defer.length*2)),Z.set(l.defer)):ie.fill(0,0,g);let A=g-1,L=0;for(let h=l?l.pass:0;h<2;h++)for(let p=l&&h===l.pass?l.k:0,x=h===0?u:d;p<x;p++){if(a<1/0&&L++>0&&performance.now()>a)return t.tr={pass:h,k:p,nDefer:d,seen:ie.slice(0,g),defer:Z.slice(0,d)},!1;let b=h===0?p:Z[p],y=b*8;if(h===0){let _=0;for(let G=0;G<8;G++)io[0]=n[y+G],_=Math.imul(_^hn[0],2654435761)>>>0,_^=_>>>15;let N=_&A,B=!1;for(;;){let G=ie[N];if(G===0){ie[N]=b+1;break}let Me=(G-1)*8,de=!0;for(let Te=0;Te<8&&de;Te++)de=n[Me+Te]===n[y+Te];if(de){B=!0;break}N=N+1&A}if(B)continue}if(!(n[y+2]>0)||lo(n,y,s,o)<2)continue;let M=m.n;if(i!==0){let _=!0;for(let N=0;N<M&&_;N++)_=(Math.floor(e[m.row[N]*C+Le]+.5)&i)!==0;if(!_)continue}let E=(_,N)=>{let B=m.row[_]*R+(m.sample[_]===0?1:2);if(r[B]===re){r[B]=N;let G=m.row[_]*R+3;return r[G]<2.5&&(r[G]=4),!0}return!1},T=_=>(m.sample[_]===0||m.sample[_]===k-1)&&!(_+1<M&&m.row[_+1]===m.row[_])&&!(_>0&&m.row[_-1]===m.row[_]),S=-1,I=-1;for(let _=0;_<M;_++)if(m.mark[_]>.1){S=_;break}for(let _=0;_+1<M;_++)if(m.row[_]===m.row[_+1]&&m.dir[_]!==m.dir[_+1]){I=_;break}let D=-1,J=-1;if(I<0){let _=-Math.cos(vn*ve);for(let N=0;N<M;N++)if(T(N))for(let B=N+1;B<M;B++){if(!T(B)||m.row[B]===m.row[N])continue;let G=pe(Ee(s,m.row[N],wt),m.sample[N],m.dir[N]),Me=pe(Ee(s,m.row[B],ao),m.sample[B],m.dir[B]),de=G[0]*Me[0]+G[1]*Me[1];de<=_&&(_=de,D=N,J=B)}if(D>=0){let N=m.row[D]*R+(m.sample[D]===0?1:2),B=m.row[J]*R+(m.sample[J]===0?1:2);r[N]===re&&r[B]===re?(E(D,Oe(m.row[J],m.sample[J])),E(J,Oe(m.row[D],m.sample[D]))):D=J=-1}}let F=S>=0?S:I>=0?I:D;if(F<0){if(h===0){if(d>=Z.length){let _=new Int32Array(Z.length*2);_.set(Z),Z=_}Z[d++]=b;continue}for(let _=0;_<M&&F<0;_++){if(!T(_))continue;let N=r[m.row[_]*R+(m.sample[_]===0?1:2)];N<=-2&&Math.floor((-N-2)/k)!==m.row[_]&&(F=_)}if(F<0)continue}let fe=m.row[F],ke=m.sample[F],ae=0;for(let _=0;_<M;_++)_===D||_===J||m.row[_]===fe||m.mark[_]>.1||!T(_)||E(_,Ve(fe,ke))&&ae++;ae>0&&F!==D&&F!==J&&T(F)&&E(F,Oe(fe,ke))}let v=(h,p)=>{let x=r[h*R+p];if(x>-2)return!1;let b=-x-2,y=Math.floor(b/k),M=b%k;if(y===h)return!1;let E=pe(Ee(s,h,wt),p===1?0:k-1,p===1?1:-1),T=pe(Ee(s,y,ao),M,M===0?1:-1);return E[0]*T[0]+E[1]*T[1]<=-Math.cos(pn*ve)};for(let h=0;h<o;h++)for(let p=1;p<=2;p++){let x=h*R+p,b=r[x];if(b<0)continue;let y=Math.floor(b/k),M=b%k;if(M!==0&&M!==k-1)continue;let E=r[y*R+(M===0?1:2)];if(E>-2)continue;let T=-E-2,S=Math.floor(T/k);if(S===y||S===h)continue;let I=he(e,h*C);he(e,y*C)!==I&&he(e,S*C)===I&&(r[x]=Ve(S,T%k))}for(let h=0;h<o;h++)for(let p=1;p<=2;p++){let x=h*R+p,b=r[x];if(b<0)continue;let y=Math.floor(b/k);r[x]=b+(v(y,1)?Dt:0)+(v(y,2)?Ct:0)}for(let h=0;h<o;h++)for(let p=1;p<=2;p++){let x=r[h*R+p];if(x<0)continue;let b=Math.floor(x+1e-6),y=Math.floor(b/k),M=b%k;if(y===h||y>=o||M===0||M===k-1)continue;let E=y*R+we;for(let T=0;T<vt;T++)if(r[E+T]===0){r[E+T]=Qo(h,p===2);break}}}t.tr=null;let c=0,f=0,w=0;for(let u=0;u<o;u++){let d=u*R;r[d+3]>2.5&&c++,r[d+3]>3.5&&f++,(r[d+1]!==re||r[d+2]!==re)&&w++}return t.exact=c,t.joinOnly=f,t.n=o,t.ended=w,t}function co(e,o,n,t,s){(!s.rows||s.rows.length<n*R)&&(s.rows=new Float32Array(n*R)),s.start||(s.start=new Int32Array(O),s.count=new Int32Array(O),s.plain=new Int32Array(O),s.ends=new Int32Array(O),s.curP=new Int32Array(O),s.curE=new Int32Array(O),s.curX=new Int32Array(O),s.lit=new Uint8Array(O),s.litUp=new Uint8Array(O),s.sel=new Uint8Array(O),s.shadow=new Uint8Array(O));let{rows:i,start:a,count:r,plain:l,ends:c,curP:f,curE:w,curX:u,lit:d,litUp:g,sel:A,shadow:L}=s;r.fill(0),l.fill(0),c.fill(0),d.fill(0),g.fill(0),A.fill(0),L.fill(0);for(let h=0;h<n;h++){let p=h*C;if(!o[h]||!(e[p+Be]>0))continue;let x=he(e,p);r[x]++;let b=t[h*R+3];b>2.5?b>3.5&&c[x]++:l[x]++,e[p+on]>0&&(e[p+nn]>cn?g[x]=1:d[x]=1),e[p+an]>0&&(A[x]=1),(Math.floor(e[p+Le]+.5)&ln)!==0&&(L[x]=1)}let v=0;for(let h=0;h<O;h++)a[h]=v,f[h]=v,w[h]=v+l[h],u[h]=v+l[h]+c[h],v+=r[h];for(let h=0;h<n;h++){let p=h*C;if(!o[h]||!(e[p+Be]>0))continue;let x=he(e,p),b=h*R,y=t[b+3],M=(y>3.5?w[x]++:y>2.5?u[x]++:f[x]++)*R;i[M]=t[b],i[M+1]=t[b+1],i[M+2]=t[b+2];let E=so(t,t[b+1]),T=so(t,t[b+2]);i[M+3]=E||T?5+E+4096*T:t[b+3];for(let S=0;S<vt;S++)i[M+we+S]=t[b+we+S]}return s.n=v,s}function ho(e,o,n,t,s,i){let a=Math.floor(o.length/C),r=Math.floor(e.length/8);(!t.data||t.data.length<r*8*U)&&(t.data=new Float32Array(r*8*U)),(!t.at||t.at.length<r*8*2)&&(t.at=new Float32Array(r*8*2)),t.kinds||(t.kinds=new Int32Array(ce+1)),(!t.e||t.e.length<r*8)&&(t.e=new Int32Array(r*8));let l=t.run;l||(t.kinds.fill(0),l=t.run={e:0,count:0,joins:0,skipped:0,seen:new Set});let c=l.seen,f=t.data,w=l.count,u=l.joins,d=l.skipped;for(let g=l.e;g<r;g++){if(i<1/0&&g>l.e&&performance.now()>i)return l.e=g,l.count=w,l.joins=u,l.skipped=d,!1;let A=g*8;if(!(e[A+2]>0))continue;let L=e.slice(A,A+8).join(",");if(c.has(L))continue;c.add(L);let v=lo(e,A,n,a);if(v<2)continue;u++;let h=e[A],p=e[A+1],x=e[A+3],b=Math.floor(x)*.01,y=Math.min(1,Math.max(0,(x-Math.floor(x))/.99)),M=b*y;if(M>0){for(let E=0;E<v;E++){let T=Ee(n,m.row[E],wt),S=pe(T,m.sample[E],m.dir[E]);m.ang[E]=Math.atan2(S[1],S[0]),m.order[E]=E}for(let E=1;E<v;E++){let T=m.order[E],S=E-1;for(;S>=0&&m.ang[m.order[S]]>m.ang[T];)m.order[S+1]=m.order[S],S--;m.order[S+1]=T}for(let E=0;E<v;E++){let T=m.order[E],S=m.order[(E+1)%v];if(T===S)continue;let I=m.ang[S]-m.ang[T];if(I<0&&(I+=2*Math.PI),I<lt*ve||I>=ht*ve){d++;continue}if((o[m.row[T]*C+10]&V)!==0||(o[m.row[S]*C+10]&V)!==0){d++;continue}let D=0,J=0;for(let ae=0;ae<v;ae++)m.row[ae]===m.row[T]&&D++,m.row[ae]===m.row[S]&&J++;if(D===1!=(J===1)&&I<mn*ve){d++;continue}let F=w*U;f[F]=m.row[T],f[F+1]=m.sample[T],f[F+2]=m.dir[T],f[F+3]=1,f[F+4]=m.row[S],f[F+5]=m.sample[S],f[F+6]=m.dir[S],f[F+7]=-1,f[F+8]=M,f[F+9]=e[A+2],t.at[w*2]=h,t.at[w*2+1]=p,t.e[w]=g;let fe=m.mark[T]>.1,ke=m.mark[S]>.1;f[F+10]=s&&fe!==ke?fe?0:1:2,f[F+11]=I<it*ve?1:0,w++,t.kinds[v]++}}}return t.count=w,t.joins=u,t.empty=d,t.run=null,!0}function fo(e,o,n,t,s=null,i=!1,a=null){let r=Math.floor(n.length/C);t.start||(t.start=new Int32Array(O),t.count=new Int32Array(O),t.cur=new Int32Array(O));let{start:l,count:c,cur:f}=t;c.fill(0);for(let d=0;d<o;d++){let g=a&&!a[d]?-1:ro(e,d,n,r,s,i);g>=0&&c[g]++}let w=0;for(let d=0;d<O;d++)l[d]=w,f[d]=w,w+=c[d];(!t.data||t.data.length<w*U)&&(t.data=new Float32Array(Math.max(w,1)*U));let u=t.data;for(let d=0;d<o;d++){let g=a&&!a[d]?-1:ro(e,d,n,r,s,i);if(g<0)continue;let A=f[g]++*U,L=d*U;for(let v=0;v<U;v++)u[A+v]=e[L+v]}return t.n=w,t}function so(e,o){if(!(o>=0))return 0;let n=Math.floor(o+.1),t=o-n,s=Math.floor(n/k),i=n%k,a=Bt(t>.2&&t<.3||t>.7,t>.45,i);if(!a)return 0;let r=e[s*R+(a<0?1:2)];if(!(r<=-2))return 0;let l=Math.round(-r-2);return $t(Math.floor(l/k),l%k)}function ro(e,o,n,t,s,i){let a=o*U,r=Math.floor(e[a]+.5),l=Math.floor(e[a+4]+.5);if(r<0||r>=t||l<0||l>=t||s&&(!s[r]||!s[l]))return-1;let c=r*C,f=l*C;if(!(n[c+Be]>0)||!(n[f+Be]>0))return-1;let w=he(n,c),u=he(n,f);return i&&w!==u&&((Math.floor(n[c+Le]+.5)|Math.floor(n[f+Le]+.5))&Zo)===0?-1:Math.max(w,u)}var gt=["tubeLean","tubeDepth","tubeWeb","tubeWebDepth","tubeJoinDepth"],po=At(),wn={stage:1,joins:"patch"},xn={stage:2,joins:"web"},gn={stage:3,joins:"web"};function Wa(e,o=!1){return e?o?gn:xn:wn}function Pa(e,o,n){return e?"":o&&o.length?`${o.join(", ")} failed`:n?"compiling":"not ready"}function bn(e){let o=nt(xe,e.F_SEL),n=ft(xe,e.F_SEL),t=Kt(e);return{tubeLean:{vs:o,fs:t},tubeDepth:{vs:o,fs:mt},tubeWeb:{vs:n,fs:t},tubeWebDepth:{vs:n,fs:mt},tubeJoinDepth:{vs:o,fs:qt(e.N_SAMPLES)}}}function vo(e,o,n,t,s){let i=new Map,a={},r=(l,c)=>{if(!s)return c;let f=`${l}:${c}`;return i.has(f)||i.set(f,s(l,c)),i.get(f)};for(let l of t)a[l]=o(e,r(e.VERTEX_SHADER,n[l].vs),r(e.FRAGMENT_SHADER,n[l].fs));return a}function Ba(e,o,n,t){return vo(e,o,bn(n),gt,t)}function $a(e,o,n){let t=[],s=[];if(n.forEach((i,a)=>{try{t[a]=o(e,i)}catch(r){console.warn(`Veins renderer: the Tube's ${gt[a]} shader failed; the Tube keeps stage 1.`,r),e.deleteProgram(i.p),s.push(gt[a])}}),s.length){for(let i of t)i&&e.deleteProgram(i.p);return{P:null,failed:s}}return{P:{lean:t[0],depth:t[1],web:t[2],webDepth:t[3],joinDepth:t[4]},failed:s}}var bt=["tubeLumen","tubeWebLumen","compTube","compTubeCell","plainTube","plainTubeCell"];function An(e,o){let n=nt(xe,e.F_SEL),t=ft(xe,e.F_SEL),s=eo(e),i=o.COMP_FS(!1,!1,1),a=o.COMP_FS(!0,!1,1);return{tubeLumen:{vs:n,fs:s},tubeWebLumen:{vs:t,fs:s},compTube:{vs:o.COMP_VS,fs:i},compTubeCell:{vs:o.COMP_CELL_VS,fs:i},plainTube:{vs:o.COMP_VS,fs:a},plainTubeCell:{vs:o.COMP_CELL_VS,fs:a}}}function za(e,o,n,t,s){return vo(e,o,An(n,t),bt,s)}function Ua(e,o,n){let t=[],s=[];if(n.forEach((i,a)=>{try{t[a]=o(e,i)}catch(r){console.warn(`Veins renderer: the Tube's ${bt[a]} shader failed; the Tube keeps stage 2.`,r),e.deleteProgram(i.p),s.push(bt[a])}}),s.length){for(let i of t)i&&e.deleteProgram(i.p);return{P:null,failed:s}}return{P:{lumen:t[0],webLumen:t[1],comp:t[2],compCell:t[3],plain:t[4],plainCell:t[5]},failed:s}}function Ja(){let e=new Float64Array(16),o=!1,n=(t,s,i,a,r,l)=>{for(let c=0;c<6;c++)e[c]=t[c];e[6]=s[0],e[7]=s[1],e[8]=i[0],e[9]=i[1],e[10]=a,e[11]=r;for(let c=0;c<4;c++)e[12+c]=l?l[c]:-1e30};return{stale(){o=!1},needs(t,s,i,a,r,l=null){if(!o)return!0;for(let c=0;c<6;c++)if(e[c]!==t[c])return o=!1,!0;if(e[6]!==s[0]||e[7]!==s[1]||e[8]!==i[0]||e[9]!==i[1]||e[10]!==a||e[11]!==r)return o=!1,!0;for(let c=0;c<4;c++)if(e[12+c]!==(l?l[c]:-1e30))return o=!1,!0;return!1},drawn(t,s,i,a,r,l=null){n(t,s,i,a,r,l),o=!0},get fresh(){return o}}}var Ga=(e=po)=>yt("lumen",e);function Ha(e,o,n=po){let t=_t("lumenscale",n);return t!==null&&t>=.25&&t<=1?t:e==="lobule"?.5:o?.67:1}function qa(e,o,n,t){return t[0]=n>=1?e:Math.max(1,Math.ceil(e*n)),t[1]=n>=1?o:Math.max(1,Math.ceil(o*n)),t}function Ka(e,o,n,t){return t[0]=e[0]*o,t[1]=e[1]*n,t[2]=e[2]*o,t[3]=e[3]*n,t[4]=e[4]*o,t[5]=e[5]*n,t}function Va(e,o,n,t){let s=Math.round(e*n);return t[0]=s,t[1]=Math.round((e+o)*n)-s,t}function yn(e,o,n,t,s){let i=1/0,a=1/0,r=-1/0,l=-1/0,c=e.boxes.boxes,f=e.mask;for(let u=0;u<o;u++){if(!f[u])continue;let d=u*4;c[d]<i&&(i=c[d]),c[d+1]<a&&(a=c[d+1]),c[d+2]>r&&(r=c[d+2]),c[d+3]>l&&(l=c[d+3])}let w=n&&n.data;for(let u=0,d=w?n.count:0;u<d;u++){let g=u*U,A=Math.floor(w[g]+.5),L=Math.floor(w[g+4]+.5);if(!(A>=0&&A<o&&L>=0&&L<o)||!(f[A]||f[L]))continue;let v=(ct+1)*Math.max(e.hr[A],e.hr[L])+w[g+9];for(let h=0;h<2;h++){let p=h?L:A,x=Math.floor(w[g+(h?5:1)]+.5),b=(p*32+(x>>1))*4+(x&1)*2,y=t[b],M=t[b+1];y-v<i&&(i=y-v),y+v>r&&(r=y+v),M-v<a&&(a=M-v),M+v>l&&(l=M+v)}}return s[0]=i,s[1]=a,s[2]=r,s[3]=l,s}function Xa(e,o,n){if(!(o[0]<=o[2]&&o[1]<=o[3]))return!1;let t=1/0,s=1/0,i=-1/0,a=-1/0;for(let r=0;r<4;r++){let l=r&1?o[2]:o[0],c=r&2?o[3]:o[1],f=e[0]*l+e[2]*c+e[4],w=e[1]*l+e[3]*c+e[5];f<t&&(t=f),f>i&&(i=f),w<s&&(s=w),w>a&&(a=w)}return n[0]=Math.floor(t)-1,n[1]=Math.floor(s)-1,n[2]=Math.ceil(i)+1,n[3]=Math.ceil(a)+1,!0}function Ya(e,o,n,t,s,i){let a=Math.max(e,Math.floor(t+n)),r=Math.min(e+o,Math.ceil(s+n));return i[0]=a,i[1]=r,r>a}function Qa(e){let o={w:0,h:0,fbo:null,rb:null,texture:null,made:0};return o.tex=()=>o.texture,o.ensure=(n,t)=>(o.fbo&&o.w===n&&o.h===t||(o.fbo||(o.fbo=e.createFramebuffer(),o.rb=e.createRenderbuffer(),o.texture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,o.texture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)),o.w=n,o.h=t,o.made++,e.bindTexture(e.TEXTURE_2D,o.texture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,n,t,0,e.RGBA,e.UNSIGNED_BYTE,null),e.bindRenderbuffer(e.RENDERBUFFER,o.rb),e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH_COMPONENT24,n,t),e.bindFramebuffer(e.FRAMEBUFFER,o.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,o.texture,0),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.RENDERBUFFER,o.rb),e.drawBuffers(_n)),o),o.dispose=()=>{o.fbo&&(e.deleteFramebuffer(o.fbo),e.deleteRenderbuffer(o.rb),e.deleteTexture(o.texture)),o.fbo=o.rb=o.texture=null,o.w=o.h=0},o}var _n=[36064],wo=new Float32Array(0),uo=2.5;function En(e,o,n,t,s){for(let i=0;i<n;i++){let a=o[i]*8,r=i*8;for(let l=0;l<8;l++)s[r+l]=e[a+l];t>=0&&(s[r]=e[(t+e[a])*4],s[r+1]=e[(t+e[a])*4+1])}return n*8}function Ln(e,o,n,t,s=2,i=1/0){let a=e.s2||(e.s2={gen:-1,entries:wo,R:{},W:{},joinBase:-1,n:0,midGen:-1,midNow:null,midJoinBase:NaN,entGen:-1});if(a.gen===e.gen&&a.R.rows)return a;if(a.midGen===e.gen&&a.midNow===o&&a.midJoinBase===t)return s<2?a:mo(e,a,o,n,t,i);if(a.entGen!==e.gen||a.midNow!==o||a.midJoinBase!==t){let r=e.jl.view,l=e.jl.n||0;!a.seen||a.seen.length<e.ent.length/8?a.seen=new Uint8Array(Math.ceil(e.ent.length/8)):a.seen.fill(0),(!a.uniq||a.uniq.length<l)&&(a.uniq=new Int32Array(l));let c=0;for(let f=0;f<l;f++){let w=r[f];a.seen[w]||(a.seen[w]=1,a.uniq[c++]=w)}a.entries=new Float32Array(c*8),a.ji=new Int32Array(c);for(let f=0;f<c;f++)a.ji[f]=t>=0?Math.round(e.ent[a.uniq[f]*8]):-1;En(e.ent,a.uniq,c,t,a.entries),a.n=c,a.entGen=e.gen,a.midNow=o,a.midJoinBase=t,a.W.run=null,a.R.tr=null}return ho(a.entries,o,e.pts.pts,a.W,!e.noEnds,s<2?i:1/0)?(a.midGen=e.gen,s<2?a:mo(e,a,o,n,t,s===2?i:1/0)):a}function mo(e,o,n,t,s,i=1/0){return ze(n,t,o.entries,o.R,e.pts.pts,e.noEnds?xt:0,i)===!1||(o.gen=e.gen,o.joinBase=s),o}function Za(e,o,n,t,s,i){let a=e[0]*e[3]-e[1]*e[2],r=i.rect;if(i.ok=!1,!(Math.abs(a)>1e-12)||!(t>0&&s>0))return i;let l=1/0,c=1/0,f=-1/0,w=-1/0;for(let u=0;u<4;u++){let d=(u&1?o+t+1:o-1)-e[4],g=(u&2?n+s+1:n-1)-e[5],A=(e[3]*d-e[2]*g)/a,L=(e[0]*g-e[1]*d)/a;A<l&&(l=A),A>f&&(f=A),L<c&&(c=L),L>w&&(w=L)}return r[0]=l,r[1]=c,r[2]=f,r[3]=w,i.ok=l<=f&&c<=w,i}function kn(e,o,n){let t=e.cu||(e.cu={gen:-1,n:0,key:0,total:0,boxes:{},inside:null,mask:null,hr:null}),s=n.rmax,i=e.pts.on,a=t.gen!==e.gen||t.n!==o||!t.hr;if(!a){for(let r=0;r<o;r++)if((s[r]||0)>t.hr[r]){a=!0;break}}if(a){(!t.hr||t.hr.length<o)&&(t.hr=new Float32Array(o),t.inside=new Uint8Array(o),t.mask=new Uint8Array(o));for(let r=0;r<o;r++)t.hr[r]=(s[r]||0)*1.25+Se;e.morph&&e.morph.rowBox?Tt(e.morph.rowBox,t.hr,o,i,t.boxes):Mt(e.pts,null,t.hr,o,t.boxes),t.inside.fill(2,0,o),t.gen=e.gen,t.n=o,t.total=t.boxes.on}if(St(t.boxes.boxes,o,n.rect,n.pad,t.inside)||a){for(let r=0;r<o;r++)t.mask[r]=i[r]&&t.inside[r]?1:0;t.key++}return t}function es(e,o){let n={tb:{},wb:{},stripVAO:null,webVAO:null,rowBuf:null,webBuf:null,webIndexN:0,rowCap:0,webCap:0,binnings:0,cull:{drawn:0,total:0,off:!0},lumBox:{b:new Float64Array(4),on:!1}},t={},s=[],i=null,a=-1,r=-1,l=-2,c=null,f=-1;function w(){let L=Gt();n.webIndexN=L.nIndex,n.stripVAO=e.createVertexArray(),n.webVAO=e.createVertexArray(),n.rowBuf=e.createBuffer(),n.webBuf=e.createBuffer(),s.push(e.createBuffer(),e.createBuffer()),e.bindVertexArray(n.stripVAO),e.bindBuffer(e.ARRAY_BUFFER,o.tubeVB),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,o.tubeIB),e.bindBuffer(e.ARRAY_BUFFER,n.rowBuf),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,4,e.FLOAT,!1,R*4,0),e.vertexAttribDivisor(1,1);for(let v=2;v<=3;v++)e.enableVertexAttribArray(v),e.vertexAttribPointer(v,4,e.FLOAT,!1,R*4,(we+4*(v-2))*4),e.vertexAttribDivisor(v,1);e.bindVertexArray(n.webVAO),e.bindBuffer(e.ARRAY_BUFFER,s[0]),e.bufferData(e.ARRAY_BUFFER,L.attr,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,s[1]),e.bufferData(e.ELEMENT_ARRAY_BUFFER,L.index,e.STATIC_DRAW),e.bindBuffer(e.ARRAY_BUFFER,n.webBuf);for(let v=1;v<=3;v++)e.enableVertexAttribArray(v),e.vertexAttribPointer(v,4,e.FLOAT,!1,U*4,(v-1)*16),e.vertexAttribDivisor(v,1);e.bindVertexArray(null)}function u(L,v,h){ze(v,h,wo,t,null);let p=t.rows,x=L.R.rows;for(let b=0;b<h;b++)if(p[b*R+3]>uo&&!(x[b*R+3]>uo))return!0;return!1}let d=null,g=-1;function A(L,v){let h=L.W,p=h.count||0;(!d||d.length<p)&&(d=new Uint8Array(Math.max(p,1)));for(let x=0;x<p;x++){let b=L.ji[h.e[x]];d[x]=b<0||b>=v.on.length||v.on[b]?1:0}return d}return n.frame=(L,v,h,p,x,b=null)=>{n.stripVAO||w();let y=o.B||o,M=o.tv,E=x&&x.ok&&(p<0||y.morph&&y.morph.rowBox)?kn(y,h,x):null,T=E?E.key:-1,S=p>=0&&b?b.ver:-1;if(M!==void 0&&y===i&&y.gen===a&&M===r&&p===l&&E===c&&T===f&&S===g&&y.s2&&y.s2.gen===y.gen)return n;let I=y.s2;return!I||I.gen!==y.gen||!I.R.rows?(I=Ln(y,v,h,p),n.binnings++):u(I,v,h)&&ze(v,h,I.entries,I.R,y.pts.pts,y.noEnds?xt:0),co(v,E?E.mask:y.pts.on,h,I.R.rows,n.tb),n.cull.off=!E,n.cull.drawn=n.tb.n,n.cull.total=E?E.total:n.tb.n,n.lumBox.on=!!E&&p<0,n.lumBox.on&&yn(E,h,I.W,y.pts.pts,n.lumBox.b),fo(I.W.data,I.W.count,v,n.wb,y.pts.on,!y.noEnds,S>=0&&I.ji?A(I,b):null),e.bindBuffer(e.ARRAY_BUFFER,n.rowBuf),n.rowCap<n.tb.rows.length&&(n.rowCap=n.tb.rows.length,e.bufferData(e.ARRAY_BUFFER,n.rowCap*4,e.DYNAMIC_DRAW)),n.tb.n&&e.bufferSubData(e.ARRAY_BUFFER,0,n.tb.rows,0,n.tb.n*R),e.bindBuffer(e.ARRAY_BUFFER,n.webBuf),n.webCap<n.wb.data.length&&(n.webCap=n.wb.data.length,e.bufferData(e.ARRAY_BUFFER,n.webCap*4,e.DYNAMIC_DRAW)),n.wb.n&&e.bufferSubData(e.ARRAY_BUFFER,0,n.wb.data,0,n.wb.n*U),i=y,a=y.gen,r=M,l=p,c=E,f=T,g=S,n},n.dispose=()=>{for(let L of[n.stripVAO,n.webVAO])L&&e.deleteVertexArray(L);for(let L of[n.rowBuf,n.webBuf,...s])L&&e.deleteBuffer(L);n.stripVAO=n.webVAO=n.rowBuf=n.webBuf=null,s.length=0,n.rowCap=n.webCap=0},n}export{Sn as a,In as b,On as c,Rn as d,Nt as e,Ft as f,Nn as g,V as h,Ie as i,Y as j,Cn as k,jn as l,Wn as m,Kn as n,nt as o,W as p,Ht as q,U as r,R as s,we as t,xt as u,Q as v,Uo as w,Vt as x,Xt as y,Yt as z,_e as A,Jo as B,Go as C,Ho as D,qo as E,Ko as F,Vo as G,da as H,ua as I,ma as J,pa as K,gt as L,po as M,Wa as N,Pa as O,bn as P,Ba as Q,$a as R,bt as S,An as T,za as U,Ua as V,Ja as W,Ga as X,Ha as Y,qa as Z,Ka as _,Va as $,yn as aa,Xa as ba,Ya as ca,Qa as da,En as ea,Ln as fa,Za as ga,kn as ha,es as ia};
