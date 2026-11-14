import{a as O}from"./chunk-OQLN5YOD.js";import{f as G,g as J,h as N}from"./chunk-ZVT6VNWV.js";import{j as K}from"./chunk-CLXSGRVO.js";var Ae=!0,E=8,Z=`#version 300 es
in vec4 a; in vec2 b;
uniform vec4 uView;     // k, x, y, dpr: device = (world \xB7 k + (x, y)) \xB7 dpr
uniform vec2 uSize;     // the canvas (device px)
uniform float uAdd;     // added to every radius (world): the eraser's wall grows with 0.6 / k
uniform float uRing;    // half the ring's width (world): a ring round each disc, not the disc (0: filled)
flat out vec4 vA; flat out vec2 vB;
void main() {
  int i = gl_VertexID;
  vec2 c = vec2(float(i & 1), float((i >> 1) & 1));
  float r = b.x + uAdd + uRing + 2.0 / (uView.x * uView.w);
  vec2 lo = min(a.xy, a.zw) - r, hi = max(a.xy, a.zw) + r;
  vec2 w = mix(lo, hi, c), d = (w * uView.x + uView.yz) * uView.w;
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, 1.0 - d.y / uSize.y * 2.0, 0.0, 1.0);
  vA = a; vB = vec2(b.x + uAdd, b.y);
}`,H=`#version 300 es
precision highp float;
uniform vec4 uView; uniform vec2 uSize; uniform float uRing;
flat in vec4 vA; flat in vec2 vB;
out vec4 o;
void main() {
  vec2 p = (vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uView.w - uView.yz) / uView.x;
  vec2 ab = vA.zw - vA.xy, ap = p - vA.xy;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  float d = length(ap - ab * t), s = uView.x * uView.w;
  float e = uRing > 0.0 ? abs(d - vB.x) - uRing : d - vB.x;
  float cov = clamp(0.5 - e * s, 0.0, 1.0);
  if (cov <= 0.0) discard;
  o = vec4(cov);
}`,W=`#version 300 es
uniform vec4 uBox; uniform vec2 uSize;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 d = mix(uBox.xy, uBox.zw, c);
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, 1.0 - d.y / uSize.y * 2.0, 0.0, 1.0);
}`,ee=`#version 300 es
precision highp float;
uniform sampler2D uCov, uLin;          // drops, rings, beads, eraser; the lining (r)
uniform int uLy, uLine;                 // the lymph's layers drawn (1 / 0); the lining
uniform vec4 uCLy, uCRing, uCBead, uCLine;   // their colours (rgba, not premultiplied)
out vec4 o;
vec4 over(vec4 c, vec4 col, float a) { a *= col.a; return vec4(col.rgb * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
void main() {
  vec4 c = vec4(0.0);
  if (uLy > 0) {
    vec4 k = texelFetch(uCov, ivec2(gl_FragCoord.xy), 0);
    c = over(c, uCLy, k.r);
    c = over(c, uCRing, k.g);
    c = over(c, uCBead, k.b);
    c *= 1.0 - k.a;
  }
  if (uLine > 0) c = over(c, uCLine, texelFetch(uLin, ivec2(gl_FragCoord.xy), 0).r);
  if (c.a <= 0.0) discard;
  o = c;
}`,re=`#version 300 es
uniform vec4 uView;     // k, x, y, dpr: device = (world \xB7 k + (x, y)) \xB7 dpr
uniform vec2 uSize;     // the canvas (device px)
uniform float uEdge;    // the cells' edge width (world)
uniform vec4 uD0[${E}], uD1[${E}];
flat out vec4 vA; flat out vec4 vB;
void main() {
  vec4 A = uD0[gl_InstanceID];
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  float r = A.w + uEdge * 0.5 + 2.0 / (uView.x * uView.w);
  vec2 d = ((A.xy + (c * 2.0 - 1.0) * r) * uView.x + uView.yz) * uView.w;
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, 1.0 - d.y / uSize.y * 2.0, 0.0, 1.0);
  vA = A; vB = uD1[gl_InstanceID];
}`,te=`#version 300 es
precision highp float;
uniform vec4 uView; uniform vec2 uSize;
uniform vec4 uCLum, uCCell, uCEdge, uCNuc;
uniform float uEdge, uAlpha;            // the cells' edge width (world); the ductules' opacity (0.72)
flat in vec4 vA; flat in vec4 vB;
out vec4 o;
const float TAU = 6.283185307179586, NC = 16.0;
vec4 over(vec4 c, vec4 col, float a) { a *= col.a; return vec4(col.rgb * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
void main() {
  vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 p = (fc / uView.w - uView.yz) / uView.x;
  float s = uView.x * uView.w, hl = uEdge * 0.5;
  vec4 A = vA, B = vB;
  vec2 q = p - A.xy;
  float d = length(q);
  if ((d - A.w - hl) * s > 2.0) discard;
  float lum = clamp(0.5 - (d - A.z) * s, 0.0, 1.0);
  float cell = clamp(0.5 - (A.z - d) * s, 0.0, 1.0) * clamp(0.5 - (d - A.w) * s, 0.0, 1.0);
  // The cells' edges: the radial lines between them (each stroked by both its cells) and their inner and outer arcs.
  float ang = atan(q.y, q.x) - B.z, u = ang * NC / TAU, f = fract(u + 0.5) - 0.5;
  float rad = d < A.z ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.z)
            : d > A.w ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.w)
            : abs(d * sin(f * TAU / NC));
  float eR = clamp(0.5 - (rad - hl) * s, 0.0, 1.0);
  float eA = max(clamp(0.5 - (abs(d - A.z) - hl) * s, 0.0, 1.0), clamp(0.5 - (abs(d - A.w) - hl) * s, 0.0, 1.0));
  // The nucleus of the cell the pixel is in: at the middle of its arc, on radius rm.
  float ac = (floor(u) + 0.5) * TAU / NC + B.z;
  float nuc = clamp(0.5 - (length(q - vec2(cos(ac), sin(ac)) * B.x) - B.y) * s, 0.0, 1.0);
  vec4 c = vec4(0.0);
  c = over(c, uCLum, lum * uAlpha);
  c = over(c, uCCell, cell * uAlpha);
  c = over(c, uCEdge, eA * uAlpha);
  c = over(c, uCEdge, eR * uAlpha);
  c = over(c, uCEdge, eR * uAlpha);
  c = over(c, uCNuc, nuc * uAlpha);
  o = c;
}`,ue=`#version 300 es
uniform vec4 uView; uniform vec2 uSize; uniform vec4 uP;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  float r = uP.z + 3.0 / (uView.x * uView.w);
  vec2 d = ((uP.xy + (c * 2.0 - 1.0) * r) * uView.x + uView.yz) * uView.w;
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, 1.0 - d.y / uSize.y * 2.0, 0.0, 1.0);
}`,$=`
const float PTAU = 6.283185307179586;
float phash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec4 plugAt(vec2 p, float s, vec4 uP, vec4 uCol, float uG) {
  vec2 q = p - uP.xy;
  float d = length(q), a = atan(q.y, q.x);
  float wall = uP.z - 2.5 / s;
  float th = max(uP.z - uP.w, 1e-3);
  float ro = uP.w * (1.0 + 0.07 * sin(3.0 * a + 0.8) + 0.05 * sin(7.0 * a + 2.1) + 0.03 * sin(13.0 * a + 0.3));
  float cov = clamp(0.5 - (d - wall) * s, 0.0, 1.0) * clamp(0.5 + (d - ro) * s * 0.7, 0.0, 1.0);
  if (cov <= 0.0) return vec4(0.0);
  // Wavy bundles running round the vein, in bands of their own strength.
  float sp = th * 0.16;
  float f = (d + th * 0.07 * sin(a * 5.0 + d / th * 6.0) + th * 0.05 * sin(a * 11.0 + 1.3)) / sp;
  float band = floor(f);
  float x = abs(fract(f) - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.18, 0.18 + max(0.3, 2.0 / (sp * s)), x);
  float str = 0.45 + 0.55 * phash(band + floor(a * 1.4) * 7.0);
  vec3 pale = mix(uCol.rgb, vec3(1.0), 0.38), dark = uCol.rgb * 0.72;
  vec3 c = mix(uCol.rgb, mix(dark, pale, step(0.5, phash(band * 3.1))), line * str);
  // Fibroblast nuclei: a few small dark spindles lying along the bundles.
  float nu = 0.0;
  for (int i = 0; i < 8; i++) {
    float k = float(i), aa = phash(k + 2.0) * PTAU, rr = mix(ro, uP.z, 0.2 + 0.6 * phash(k + 17.0));
    vec2 e = q - rr * vec2(cos(aa), sin(aa)), t = vec2(-sin(aa), cos(aa)), n = vec2(cos(aa), sin(aa));
    float ln = max(th * 0.22, 1.5 / s);
    nu = max(nu, 1.0 - smoothstep(0.6, 1.0, length(vec2(dot(e, t) / ln, dot(e, n) / (ln * 0.3)))));
  }
  c = mix(c, uCol.rgb * 0.45, nu * 0.55);
  float al = cov * uCol.a * clamp(uG * 2.5, 0.0, 1.0);
  return vec4(c * al, al);
}`,ae=`#version 300 es
precision highp float;
uniform vec4 uView; uniform vec2 uSize; uniform vec4 uP, uCol;
uniform float uG;
out vec4 o;
${$}
void main() {
  vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec4 c = plugAt((fc / uView.w - uView.yz) / uView.x, uView.x * uView.w, uP, uCol, uG);
  if (c.a <= 0.0) discard;
  o = c;
}`,q=(a,l,y,e=[])=>G(a,l,y,e.map((u,m)=>[u,m])),Q=[!0,!1,!1,!1],oe=[!1,!0,!1,!1],le=[!1,!1,!0,!1],ie=[!1,!1,!1,!0];function he(a,{host:l=null}={}){let y=()=>l&&l.screen?l.screen():null,e=null,u=null,m=new Float32Array(E*4),z=new Float32Array(E*4);if(!l||(e=l.gl,!e))return null;a=l.canvas;let X=!1,F=!1,s=null,C={},v=null,g=null,k=new Float64Array(6),w=new Float64Array(4),I=null,h=null;function c(){let t=q(e,Z,H,["a","b"]),o=q(e,W,ee),r=q(e,re,te),d=q(e,ue,ae),T=N(e,t),i=N(e,o),b=N(e,r),U=N(e,d);for(let _ of[...t.sh,...o.sh,...r.sh,...d.sh])e.deleteShader(_);let S=(_,n)=>Object.fromEntries(n.map(A=>[A,e.getUniformLocation(_,A)]));s={cap:T,comp:i,duct:b,plug:U,PU:S(U,["uView","uSize","uP","uCol","uG"]),CU:S(T,["uView","uSize","uAdd","uRing"]),KU:S(i,["uBox","uSize","uCov","uLin","uLy","uLine","uCLy","uCRing","uCBead","uCLine"]),DU:S(b,["uView","uSize","uD0","uD1","uCLum","uCCell","uCEdge","uCNuc","uEdge","uAlpha"])};for(let _ of["erase","line","drops","beads"]){let n=e.createVertexArray(),A=e.createBuffer();e.bindVertexArray(n),e.bindBuffer(e.ARRAY_BUFFER,A),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,24,0),e.vertexAttribDivisor(0,1),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,24,16),e.vertexAttribDivisor(1,1),C[_]={vao:n,buf:A,n:0,data:null,cap:0}}e.bindVertexArray(null)}try{c()}catch(t){return console.warn("The lobule overlay falls back to the 2D canvas.",t),null}function M(t,o,r){if(t&&t.w===o&&t.h===r)return t;t&&(e.deleteFramebuffer(t.fbo),e.deleteTexture(t.tex));let d=e.createTexture(),T=e.createFramebuffer();e.bindTexture(e.TEXTURE_2D,d),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,o,r,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,T),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,d,0);let i=K(e,e.FRAMEBUFFER,"rgba8",o,r);return e.bindFramebuffer(e.FRAMEBUFFER,y()),i?{tex:d,fbo:T,w:o,h:r}:(e.deleteFramebuffer(T),e.deleteTexture(d),null)}function R(t,o){let r=C[t];return r.arr===o||(e.bindBuffer(e.ARRAY_BUFFER,r.buf),o.byteLength<=r.cap||(r.cap=Math.max(o.byteLength*2,1536),e.bufferData(e.ARRAY_BUFFER,r.cap,e.DYNAMIC_DRAW)),e.bufferSubData(e.ARRAY_BUFFER,0,o),r.arr=o,r.n=o.length/6),r.n}function P(t,o,r,d,T){let i=R(t,o);i&&(e.colorMask(r[0],r[1],r[2],r[3]),u.f1(s.CU.uAdd,d),u.f1(s.CU.uRing,T),e.bindVertexArray(C[t].vao),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,i))}return{get lost(){return X||F||!s||e.isContextLost()},release(){v&&(e.deleteFramebuffer(v.fbo),e.deleteTexture(v.tex),v=null),g&&(e.deleteFramebuffer(g.fbo),e.deleteTexture(g.tex),g=null,I=null)},draw({W:t,H:o,view:r,ducts:d,duct:T,lymph:i,plug:b}){if(this.lost||(u||(u=O(e)),t=a.width,o=a.height,!t||!o))return!1;(a.width!==t||a.height!==o)&&(a.width=t,a.height=o),e.disable(e.DEPTH_TEST),e.disable(e.SCISSOR_TEST);let U=!!i&&i.drops.length>0;if(i){if(U){if(v=M(v,t,o),!v)return!1}else v&&(e.deleteFramebuffer(v.fbo),e.deleteTexture(v.tex),v=null);if(e.useProgram(s.cap),u.f4(s.CU.uView,r[0],r[1],r[2],r[3]),u.f2(s.CU.uSize,t,o),e.enable(e.BLEND),e.blendEquation(e.MAX),e.blendFunc(e.ONE,e.ONE),U&&(e.bindFramebuffer(e.FRAMEBUFFER,v.fbo),e.viewport(0,0,t,o),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),P("drops",i.drops,Q,0,0),P("beads",i.beadRings,oe,0,i.ringHalf),P("beads",i.beadRings,le,0,0),P("erase",i.erase,ie,i.eraseAdd,0)),i.line){let n=i.line.length/6;if(h!==i.line){let L=1/0,x=1/0,p=-1/0,j=-1/0;for(let Y=0,D=i.line;Y<n;Y++){let V=Y*6,B=D[V+4];L=Math.min(L,D[V]-B,D[V+2]-B),p=Math.max(p,D[V]+B,D[V+2]+B),x=Math.min(x,D[V+1]-B,D[V+3]-B),j=Math.max(j,D[V+1]+B,D[V+3]+B)}w[0]=L,w[1]=x,w[2]=p,w[3]=j,h=i.line}let A=!g||g.w!==t||g.h!==o;if(g=M(g,t,o),!g)return e.disable(e.BLEND),e.colorMask(!0,!0,!0,!0),e.bindFramebuffer(e.FRAMEBUFFER,y()),!1;let f=k;(A||I!==i.line||f[0]!==t||f[1]!==o||f[2]!==r[0]||f[3]!==r[1]||f[4]!==r[2]||f[5]!==r[3])&&(e.bindFramebuffer(e.FRAMEBUFFER,g.fbo),e.viewport(0,0,t,o),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),P("line",i.line,Q,0,0),I=i.line,f[0]=t,f[1]=o,f[2]=r[0],f[3]=r[1],f[4]=r[2],f[5]=r[3])}e.bindVertexArray(null),e.disable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.colorMask(!0,!0,!0,!0)}e.bindFramebuffer(e.FRAMEBUFFER,y()),e.viewport(0,0,t,o),e.enable(e.BLEND),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA);let S=d?Math.min(E,d.length/8):0;if(S){e.useProgram(s.duct);let n=s.DU;u.f4(n.uView,r[0],r[1],r[2],r[3]),u.f2(n.uSize,t,o),m.fill(0),z.fill(0);for(let A=0;A<S;A++)for(let f=0;f<4;f++)m[A*4+f]=d[A*8+f],z[A*4+f]=d[A*8+4+f];u.fv4(n.uD0,m),u.fv4(n.uD1,z),u.fv4(n.uCLum,T.lum),u.fv4(n.uCCell,T.cell),u.fv4(n.uCEdge,T.edge),u.fv4(n.uCNuc,T.nuc),u.f1(n.uEdge,T.width),u.f1(n.uAlpha,T.alpha),e.drawArraysInstanced(e.TRIANGLE_STRIP,0,4,S)}if(b&&b.on){e.useProgram(s.plug);let n=s.PU;u.f4(n.uView,r[0],r[1],r[2],r[3]),u.f2(n.uSize,t,o),u.f4(n.uP,b.x,b.y,b.wall,b.open),u.fv4(n.uCol,b.col),u.f1(n.uG,b.grow),e.drawArrays(e.TRIANGLE_STRIP,0,4)}let _=!!i?.line&&!!g&&i.line.length>0;if(U||_){let n=0,A=0,f=t,L=o;if(!U){let x=r[0],p=r[3];n=Math.max(0,Math.floor((w[0]*x+r[1])*p)-2),A=Math.max(0,Math.floor((w[1]*x+r[2])*p)-2),f=Math.min(t,Math.ceil((w[2]*x+r[1])*p)+2),L=Math.min(o,Math.ceil((w[3]*x+r[2])*p)+2)}if(f>n&&L>A){e.useProgram(s.comp);let x=s.KU;u.f4(x.uBox,n,A,f,L),u.f2(x.uSize,t,o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,U&&v?v.tex:null),u.i1(x.uCov,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,_?g.tex:null),u.i1(x.uLin,1),e.activeTexture(e.TEXTURE0),u.i1(x.uLy,U?1:0),u.i1(x.uLine,_?1:0);let p=i.colours;u.fv4(x.uCLy,p.ly),u.fv4(x.uCRing,p.ring),u.fv4(x.uCBead,p.bead),u.fv4(x.uCLine,p.line),e.drawArrays(e.TRIANGLE_STRIP,0,4)}}return e.disable(e.BLEND),e.useProgram(null),e.bindVertexArray(null),e.bindBuffer(e.ARRAY_BUFFER,null),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,null),!0}}}var ne=`#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;
uniform mat3 world;
uniform vec2 size;
uniform float cell;
void main() {
  vec3 d = world * vec3(org + corner * cell, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`,ce=`
  for (int j = 0; j < ${E}; j++) {
    if (j >= uND) break;
    vec4 A = uD0[j], B = uD1[j];
    vec2 q = p - A.xy;
    float d = length(q);
    if ((d - A.w - hl) * s > 2.0) continue;
    float lum = clamp(0.5 - (d - A.z) * s, 0.0, 1.0);
    float cell = clamp(0.5 - (A.z - d) * s, 0.0, 1.0) * clamp(0.5 - (d - A.w) * s, 0.0, 1.0);
    float ang = atan(q.y, q.x) - B.z, u = ang * NC / TAU, f = fract(u + 0.5) - 0.5;
    float rad = d < A.z ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.z)
              : d > A.w ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.w)
              : abs(d * sin(f * TAU / NC));
    float eR = clamp(0.5 - (rad - hl) * s, 0.0, 1.0);
    float eA = max(clamp(0.5 - (abs(d - A.z) - hl) * s, 0.0, 1.0), clamp(0.5 - (abs(d - A.w) - hl) * s, 0.0, 1.0));
    float ac = (floor(u) + 0.5) * TAU / NC + B.z;
    float nuc = clamp(0.5 - (length(q - vec2(cos(ac), sin(ac)) * B.x) - B.y) * s, 0.0, 1.0);
    c = over(c, uCLum, lum * uAlpha);
    c = over(c, uCCell, cell * uAlpha);
    c = over(c, uCEdge, eA * uAlpha);
    c = over(c, uCEdge, eR * uAlpha);
    c = over(c, uCEdge, eR * uAlpha);
    c = over(c, uCNuc, nuc * uAlpha);
  }`,fe=()=>`#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uOwn, uTis;          // the vessel layer with its blood (premultiplied); the tissue under it (opaque)
uniform vec4 uView; uniform vec2 uSize;   // the overlay's view (k, x, y, dpr) and the canvas, as fx-gl.js takes them
uniform int uND;                       // ductules
uniform vec4 uD0[${E}], uD1[${E}];
uniform vec4 uCLum, uCCell, uCEdge, uCNuc;
uniform float uEdge, uAlpha;
uniform int uPOn;                      // SOS: the scar inside the central vein (fx-gl.js plugAt), laid over everything
uniform vec4 uP, uPCol; uniform float uPG;
out vec4 o;
const float TAU = 6.283185307179586, NC = 16.0;
vec4 over(vec4 c, vec4 col, float a) { a *= col.a; return vec4(col.rgb * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
${$}
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 v = texelFetch(uOwn, ip, 0);
  vec4 r = v + texelFetch(uTis, ip, 0) * (1.0 - v.a);   // (the vessel layer laid over the tissue, premultiplied)
  if (uND > 0) {
    vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 p = (fc / uView.w - uView.yz) / uView.x;
    float s = uView.x * uView.w, hl = uEdge * 0.5;
    vec4 c = vec4(0.0);${ce}
    r = c + r * (1.0 - c.a);   // (the ductules laid over that, premultiplied)
  }
  if (uPOn > 0) {   // (then the scar over the vein, as fx-gl.js lays it after the ductules)
    vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec4 pl = plugAt((fc / uView.w - uView.yz) / uView.x, uView.x * uView.w, uP, uPCol, uPG);
    r = pl + r * (1.0 - pl.a);
  }
  o = r;
}`,se=["world","size","cell","uOwn","uTis","uView","uSize","uND","uD0","uD1","uCLum","uCCell","uCEdge","uCNuc","uEdge","uAlpha","uPOn","uP","uPCol","uPG"];function Ee(a){let l=O(a),y=new Float32Array(E*4),e=new Float32Array(E*4),u=null,m=null,z=!1,X=()=>{if(u){for(let F of u.sh)a.deleteShader(F);u=null}};return{start(){if(!(u||m||z))try{u=G(a,ne,fe())}catch{z=!0,u=null}},ready(){if(m)return!0;if(z||!u)return!1;let F;try{F=J(a,u)}catch{F=!0}if(!F)return!1;try{let s=N(a,u),C={};for(let v of se)C[v]=a.getUniformLocation(s,v);m={p:s,U:C}}catch(s){z=!0,console.warn("The lobule's kept picture falls back to laying the frame whole.",s),a.deleteProgram(u.p)}return X(),!!m},draw(F,s,C,v,g,k,w,I,h){let c=m.U;a.useProgram(m.p),l.m3(c.world,F),l.f2(c.size,s,C),l.f1(c.cell,v),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,w),l.i1(c.uOwn,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,I),l.i1(c.uTis,1);let M=h.ducts?Math.min(E,h.ducts.length/8):0;if(l.i1(c.uND,M),M){let t=h.view,o=h.ducts;l.f4(c.uView,t[0],t[1],t[2],t[3]),l.f2(c.uSize,s,C),y.fill(0),e.fill(0);for(let r=0;r<M;r++)for(let d=0;d<4;d++)y[r*4+d]=o[r*8+d],e[r*4+d]=o[r*8+4+d];l.fv4(c.uD0,y),l.fv4(c.uD1,e),l.fv4(c.uCLum,h.lum),l.fv4(c.uCCell,h.cell),l.fv4(c.uCEdge,h.edge),l.fv4(c.uCNuc,h.nuc),l.f1(c.uEdge,h.width),l.f1(c.uAlpha,h.alpha)}let R=h.plug,P=!!(R&&R.on&&h.view);if(l.i1(c.uPOn,P?1:0),P){let t=h.view;l.f4(c.uView,t[0],t[1],t[2],t[3]),l.f2(c.uSize,s,C),l.f4(c.uP,R.x,R.y,R.wall,R.open),l.fv4(c.uPCol,R.col),l.f1(c.uPG,R.grow)}a.bindVertexArray(g),a.drawArraysInstanced(a.TRIANGLE_STRIP,0,4,k),a.bindVertexArray(null),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,null),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,null)},release(){X(),m&&!a.isContextLost()&&a.deleteProgram(m.p),m=null}}}export{Ae as a,he as b,ne as c,ce as d,fe as e,Ee as f};
