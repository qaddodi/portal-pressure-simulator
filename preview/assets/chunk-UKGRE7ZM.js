import{hb as V}from"./chunk-VI7OAN5C.js";import{h as r}from"./chunk-RJOTJ3RL.js";import{f as Dt,h as Bt,m as Ht,s as $t,t as St}from"./chunk-ZVT6VNWV.js";import{a as Q}from"./chunk-QV6U4PNV.js";var u0=Math.PI*2,h0=1.55,z0=t=>1/(Math.max(t,.01)*h0);function At(){let t=7,e=()=>(t=t*1664525+1013904223>>>0,t/4294967296),n=[],a=[];for(let i=0;i<4;i++){let o=i/4*u0+.5+(e()-.5)*.5,c=e()*6.28,d=e()*6.28,v=e()*6.28,s=1.15+e()*.5,p=2.6+e()*.8,h=(e()-.5)*.015;n.push(o,c,d,v),a.push(s,p,h,0)}return{c0:n,c1:a}}var It=At();function b0(t,e,n,a=0){let i=It.c0,o=It.c1,c=t*4,d=(.025+.3*n)*(1-.55*a),v=d*.45;return i[c]+d*Math.sin(o[c]*e+i[c+1])+v*Math.sin(o[c+1]*e+i[c+2])}var d0="attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }",C=t=>V(t).map(e=>e.toFixed(1)).join(", "),tt=t=>V(t).map(e=>(e/255).toFixed(4)).join(", "),m0=()=>`
precision highp float;
uniform float uSize, uGrow, uVis, uRed;
uniform vec4 uC0[4];
uniform vec4 uC1[4];
uniform float uDef[4];
uniform float uKn[16];
const float TAU = 6.2831853;
const float PI = 3.1415927;
const float T = 1.55;

float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(float x, float y, float P) {
  float ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy;
  float ux = fx * fx * (3.0 - 2.0 * fx), uy = fy * fy * (3.0 - 2.0 * fy);
  float x0 = mod(ix, P), x1 = mod(x0 + 1.0, P);
  float a = hsh(vec2(x0, iy)), b = hsh(vec2(x1, iy)), c = hsh(vec2(x0, iy + 1.0)), d = hsh(vec2(x1, iy + 1.0));
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
float sst(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float wrapPi(float a) { return mod(a + PI, TAU) - PI; }

float centreOf(int c, float z) {
  vec4 k0 = uC0[0], k1 = uC1[0]; float df = uDef[0];
  for (int i = 0; i < 4; i++) if (i == c) { k0 = uC0[i]; k1 = uC1[i]; df = uDef[i]; }
  float A1 = (0.025 + 0.3 * uGrow) * (1.0 - 0.55 * df), A2 = A1 * 0.45;
  return k0.x + A1 * sin(k1.x * z + k0.y) + A2 * sin(k1.y * z + k0.z);
}

// Height of the wall bulging into the lumen. Outputs: vein weight, signed distance across the
// column in widths, column index, nearest knuckle footprint q (ellipse metric), its strength.
float field(float th, float z, out float vein, out float uu, out float cc, out float qm, out float kns) {
  float hh = 0.017 * sin(th * 9.0 + 2.2 * nz(th / TAU * 6.0, z * 0.3, 6.0)) * sst(0.5, 1.2, z);
  float near = sst(0.42, 0.95, z);
  vein = 0.0; uu = 0.0; cc = -1.0; qm = 9.0; kns = 0.0;
  float beaded = sst(0.45, 0.6, uGrow);
  float ampK = 0.03 + 0.28 * uGrow;
  for (int c = 0; c < 4; c++) {
    vec4 k0 = uC0[c], k1 = uC1[c];
    float df = uDef[c];
    float w0full = 0.055 + 0.27 * uGrow + k1.z;
    float w0 = w0full * (1.0 - 0.2 * df);
    float amp = ampK * uVis * uVis * (1.0 - 0.72 * df);
    float ce = centreOf(c, z);
    float d = wrapPi(th - ce);
    float bead = 1.0 + beaded * 0.3 * sin(2.3 * z + k0.w);
    float w = w0 * bead, u = d / w, au = abs(u);
    if (au < 2.6) {
      float p = exp(-pow(au, 2.6));
      hh += amp * bead * near * p;
      float vw = p * (1.0 - 0.55 * df);
      if (vw > vein) { vein = vw; uu = u; cc = float(c); }
    }
    for (int k = 0; k < 4; k++) {
      float kn = uKn[c * 4 + k];
      if (kn > 0.001) {
        float zb = 2.8 * pow(1.4, float(k));
        float wp = w0full * 0.8 * 1.5 + 0.06, lp = wp * zb * 0.95;
        float dd = wrapPi(th - centreOf(c, zb));
        float dz = z - zb;
        float q = (dd / wp) * (dd / wp) + (dz / lp) * (dz / lp);
        if (q < 4.0) {
          if (q < 1.0) hh += (ampK * 0.9 + 0.07) * pow(1.0 - q, 0.6) * kn * kn * (3.0 - 2.0 * kn);
          if (q < qm) { qm = q; kns = kn; }
        }
      }
    }
  }
  return hh;
}

void main() {
  vec2 xy = (gl_FragCoord.xy - 0.5 * uSize) / (0.5 * uSize);
  xy.y = -xy.y;
  float rho = length(xy);
  if (rho > 1.02) { gl_FragColor = vec4(0.0); return; }
  float th = atan(xy.y, xy.x), z = 1.0 / (max(rho, 0.01) * T);
  float ez = 0.012 * (1.0 + z * 0.7), eth = 0.008;
  float vein, uu, cc, qm, kns, a1, a2, a3, a4, a5, b1, b2, b3, b4;
  float H = field(th, z, vein, uu, cc, qm, kns);
  float Ht = field(th + eth, z, a1, a2, a3, a4, a5);
  float Hz = field(th, z + ez, b1, b2, b3, b4, a5);
  float hth = (Ht - H) / eth, hz = (Hz - H) / ez;
  float rw = 1.0 - H;
  float nr = 1.0, nt = hth / rw, nzc = hz, nl = sqrt(nr * nr + nt * nt + nzc * nzc);
  float d2 = rw * rw + z * z, dd = sqrt(d2);
  float NL = max(0.0, (rw * nr + nzc * z) / (nl * dd));
  float atten = 1.7 / (1.0 + d2 * 0.12);
  float ct = cos(th), st = sin(th);
  float Nx = -(nr * ct - nt * st) / nl, Ny = -(nr * st + nt * ct) / nl, Nz = -nzc / nl;
  float Lx = -(rw * ct) / dd, Ly = -(rw * st) / dd, Lz = -z / dd;
  vec3 hv = normalize(vec3(Lx - 0.35, Ly - 0.55, Lz + 0.75));
  float NH = max(0.0, Nx * hv.x + Ny * hv.y + Nz * hv.z);

  // Squamous mucosa: pale pink-salmon close to the lens, warmer and redder with depth. Past the
  // serrated Z-line (the squamocolumnar junction) the gastric cardia shows as deeper salmon-red.
  vec3 ALB = vec3(${C("--endo-mucosa")}), DEEP = vec3(${C("--endo-mucosa-deep")});
  float tint = sst(1.2, 7.0, z);
  vec3 col = mix(ALB, DEEP, tint * vec3(0.7, 0.8, 0.65));
  float zl = 5.2 + 0.9 * (nz(th / TAU * 11.0, 0.5, 11.0) - 0.5) + 0.35 * (nz(th / TAU * 31.0, 2.5, 31.0) - 0.5);
  float zline = sst(zl - 0.25, zl + 0.25, z);
  col = mix(col, vec3(${C("--endo-zline")}), zline * 0.85);
  float mott = nz(th / TAU * 14.0, z * 0.9, 14.0) * 0.6 + nz(th / TAU * 40.0, z * 2.5, 40.0) * 0.4;
  float grain = nz(th / TAU * 160.0, z * 11.0, 160.0);
  float mm = 0.93 + 0.12 * mott + 0.06 * (grain - 0.5) + 0.04 * (hsh(gl_FragCoord.xy) - 0.5);
  col *= vec3(mm, mm * (0.97 + 0.05 * mott), mm);
  // Fine submucosal vessels: a branching red-violet net, long and thin along the wall (palisade
  // vessels near the junction), sharp close to the lens and lost with depth.
  float n1 = nz(th / TAU * 36.0 + 0.6 * nz(th / TAU * 9.0, z * 1.1, 9.0), z * 1.6, 36.0);
  float n2 = nz(th / TAU * 90.0, z * 4.2 + 3.0 * n1, 90.0);
  float r1 = 1.0 - abs(n1 * 2.0 - 1.0), r2 = 1.0 - abs(n2 * 2.0 - 1.0);
  float vs = (sst(0.93, 0.995, r1) * 0.16 + sst(0.95, 0.995, r2) * 0.1) * (1.0 - sst(2.2, 5.0, z)) * sst(0.5, 0.75, z);
  col = mix(col, vec3(${C("--endo-vessels")}), vs);

  float dfc = 0.0;
  if (cc >= 0.0) for (int i = 0; i < 4; i++) if (float(i) == cc) dfc = uDef[i];
  float vn = 0.0;
  if (uVis > 0.05 && vein > 0.02) {
    vn = min(1.0, uVis * vein * (0.45 + 0.7 * uGrow));
    // A small varix shows white under thick mucosa; a large, thin-walled one shows blue.
    float crest = exp(-pow(abs(uu) / 0.55, 2.0));
    vec3 V = mix(vec3(${C("--endo-varix-small")}), vec3(${C("--endo-varix")}), sst(0.1, 0.5, uGrow));
    col = mix(col, V + vec3(${C("--endo-crest")}) * crest * sst(0.2, 0.6, uGrow), vn * 0.74);
    if (uRed > 0.01) {
      float rs = uRed * (1.0 - dfc) * (1.0 - zline);
      // Red wale marks: thin, broken red whip-marks running along the crest.
      float off = 0.32 * (nz(cc * 7.0, z * 0.8, 4096.0) - 0.5);
      float streak = exp(-pow((uu - off) / 0.08, 2.0)) * sst(0.66, 0.86, nz(cc * 13.0 + 5.0, z * 2.6, 4096.0));
      float streak2 = exp(-pow((uu + 0.35 + off) / 0.07, 2.0)) * sst(0.66, 0.84, nz(cc * 17.0 + 9.0, z * 3.4, 4096.0));
      float wm = max(streak, streak2 * 0.8) * sst(0.0, 0.5, rs);
      // Cherry-red spots: small round dots on the varix, more of them as the wall nears its limit.
      float spot = sst(0.95 - 0.05 * rs, 0.98 - 0.03 * rs, nz(th / TAU * 220.0, z * 11.0, 220.0)) * vn * sst(0.2, 0.7, rs);
      col = mix(col, vec3(${C("--red-wale")}), max(wm * 0.6 * vn, spot * 0.75) * sst(0.1, 0.3, uGrow));
    }
  }
  float ao = 1.0;
  if (uVis > 0.05 && vein > 0.003 && vein < 0.35) ao = 1.0 - 0.16 * uVis * uVis * sst(0.003, 0.12, vein) * (1.0 - sst(0.12, 0.35, vein));

  float gloss = 1.0;
  if (qm < 4.0) {
    float kk = kns, q = qm;
    if (q >= 1.0) {
      float halo = (1.0 - sst(1.0, 3.0, q)) * 0.3 * kk;
      col = mix(col, vec3(${C("--endo-band-halo")}), halo);
    }
    if (q < 1.12) {
      float g = max(0.0, 1.0 - q);
      float knuckle = sst(0.0, 0.12, g) * kk;
      float mt = nz(th / TAU * 60.0 + 3.0, z * 7.0, 60.0);
      float tip = sst(0.55, 0.95, g);
      vec3 pc = vec3(mix(mix(84.0, 128.0, g), 196.0, tip * 0.6) + 22.0 * mt,
                     mix(mix(34.0, 62.0, g), 150.0, tip * 0.6) + 14.0 * mt,
                     mix(mix(76.0, 112.0, g), 172.0, tip * 0.6) + 18.0 * mt);
      col = mix(col, pc, knuckle);
      gloss = mix(1.0, 0.9, knuckle);
    }
    // The band: a ring that cinches in from a wide loop to the base of the knuckle.
    float rr0 = 1.0 + (1.0 - kk) * 0.5;
    float ring = exp(-pow((sqrt(q) - rr0) / 0.05, 2.0)) * sst(0.0, 0.25, kk);
    col = mix(col, vec3(${C("--endo-band")}), ring * 0.8);
  }

  // Light from the scope tip: steep falloff with distance, and what light comes back from deep in
  // the lumen is reddened by the tissue.
  float diff = min(1.1, NL * 0.72 + 0.3) * atten;
  vec3 lc = mix(vec3(${tt("--endo-light-near")}), vec3(${tt("--endo-light-far")}), sst(1.5, 8.0, z));
  // Wet mucus film: patchy, so the highlights break up as they do on real tissue.
  float wet = sst(0.35, 0.75, nz(th / TAU * 20.0, z * 1.4, 20.0)) * 0.8 + 0.2;
  float spec = min(0.5, pow(NH, 200.0) * 0.35 + pow(NL, 90.0) * 0.32 * wet + pow(NL, 18.0) * 0.03) * gloss * atten * wet;
  float glint = sst(0.93, 0.98, nz(th / TAU * 80.0, z * 7.0, 80.0)) * 0.18 * atten * pow(NL, 4.0);
  float sheen = 0.08 + 0.1 * nz(th / TAU * 9.0, z * 0.7, 9.0);
  vec3 rgb = (col / 255.0) * diff * ao * lc + vec3(spec * 0.95 + glint * 0.85) * vec3(${tt("--endo-glint")}) + vec3(sheen * 0.04, sheen * 0.025, sheen * 0.025);
  float lum = sst(5.5, 18.0, z);
  rgb = mix(rgb, vec3(${tt("--endo-lumen")}), lum);
  rgb *= 1.0 - 0.58 * sst(0.64, 1.0, rho);
  rgb = vec3(pow(min(1.2, rgb.r), 0.82), pow(min(1.2, rgb.g), 0.92), pow(min(1.2, rgb.b), 0.9));
  gl_FragColor = vec4(min(rgb, 1.0), 1.0);
}
`,S=new WeakMap;function p0(t,e){let n=S.get(t);if(n&&n.gen===e)return n;let a=n?n.holders:new Set;n&&n.stopPoll?.(),n={gl:t,gen:e,started:null,pend:[null],stopPoll:null,u:null,pr:null,failed:!1,buf:null,vao:null,holders:a};let{c0:i,c1:o}=At();n.c0=new Float32Array(i),n.c1=new Float32Array(o);try{n.started=Dt(t,d0,m0(),[["p",0]]),n.pend[0]=n.started,n.buf=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,n.buf),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),n.vao=t.createVertexArray(),t.bindVertexArray(n.vao),t.bindBuffer(t.ARRAY_BUFFER,n.buf),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),n.stopPoll=St(t,[n.started],()=>qt(n))}catch(c){n.failed=!0,Q("endo-gl:build",c)}return S.set(t,n),n}function qt(t){let e=t.gl;if(!(t.u||t.failed||e.isContextLost()||S.get(e)!==t))try{let n=Bt(e,t.started);e.useProgram(n);let a=o=>e.getUniformLocation(n,o),i={size:a("uSize"),grow:a("uGrow"),vis:a("uVis"),red:a("uRed"),c0:a("uC0"),c1:a("uC1"),def:a("uDef"),kn:a("uKn")};e.uniform4fv(i.c0,t.c0),e.uniform4fv(i.c1,t.c1),Ht(e,()=>{e.bindVertexArray(t.vao),e.uniform1f(i.size,1),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null)}),e.useProgram(null),t.pr=n,t.u=i;for(let o of t.holders)if(o.need){o.need=!1;try{o.onBack?.()}catch(c){Q("endo-gl:221",c)}}}catch{t.u=null,e.isContextLost()||(t.failed=!0)}}function q0({onBack:t=null,pen:e=null}={}){if(!e||typeof e.glNow!="function"||typeof e.shade!="function")return null;let n={onBack:t,need:!1},a=null,i=!1,o=()=>{let s=i?null:e.glNow();return s?((!a||a.gl!==s||a.gen!==e.gen)&&(a?.holders.delete(n),a=p0(s,e.gen),a.holders.add(n)),a):(a&&(a.holders.delete(n),a=null),null)},c=new Float32Array(4),d=new Float32Array(16),v={st:null,draw(s,p){let h=a;if(!h||!h.u)return!1;let l=h.u,z=this.st;s.useProgram(h.pr),s.bindVertexArray(h.vao),s.uniform1f(l.size,p),s.uniform1f(l.grow,z.grow),s.uniform1f(l.vis,z.vis),s.uniform1f(l.red,+z.red||0);let q=z.def.length,y=z.kn.length;for(let m=0;m<4;m++)c[m]=m<q?z.def[m]:0;for(let m=0;m<16;m++)d[m]=m<y?z.kn[m]:0;return s.uniform1fv(l.def,c),s.uniform1fv(l.kn,d),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),!0}};return{ready(){let s=o();return s?s.u||this.pending?!0:(qt(s),!!s.u):!1},get pending(){let s=o();return!s||s.u||s.failed||!s.started||!$t(s.gl,s.pend)?!1:(n.need=!0,s.stopPoll?.want?.(),!0)},get lost(){return o()?!1:(n.need=!0,!0)},dispose(){if(i=!0,a?.holders.delete(n),a&&!a.holders.size&&S.get(a.gl)===a){let s=a.gl;a.stopPoll?.();try{s.isContextLost()||(s.deleteProgram(a.pr),s.deleteBuffer(a.buf),s.deleteVertexArray(a.vao))}catch(p){Q("endo-gl:dispose",p)}S.delete(s)}a=null},shade(s,p,h,l){return!o()||!a.u&&(this.pending||(qt(a),!a.u))?!1:(v.st=l,e.shade(s,p,h,v))}}}var w=Math.PI*2,x0=1.55,H=4;function I(t,e){let n=Math.imul(t,374761393)+Math.imul(e,668265263)|0;return n=Math.imul(n^n>>>13,1274126177),((n^n>>>16)>>>0)/4294967296}function b(t,e,n){let a=Math.floor(t),i=Math.floor(e),o=t-a,c=e-i,d=o*o*(3-2*o),v=c*c*(3-2*c),s=(a%n+n)%n,p=(s+1)%n,h=I(s,i),l=I(p,i),z=I(s,i+1),q=I(p,i+1);return h+(l-h)*d+(z-h)*v+(h-l-z+q)*d*v}var u=(t,e,n)=>{let a=Math.min(1,Math.max(0,(n-t)/(e-t)));return a*a*(3-2*a)},Kt=t=>(t%=w,t>Math.PI?t-w:t<-Math.PI?t+w:t),nt=7;function E(){return nt=nt*1664525+1013904223>>>0,nt/4294967296}var Ct=[];for(let t=0;t<H;t++)Ct.push({a0:0,ph:0,ph2:0,ph3:0,A1:0,A2:0,f1:0,f2:0,w0:0,amp:0,zb:[],ampK:0,vk:0});function w0(t,e){nt=7;let n=.025+.3*t;for(let a=0;a<H;a++){let i=Math.floor(e/H)+(a<e%H?1:0),o=Ct[a];o.a0=a/H*w+.5+(E()-.5)*.5,o.ph=E()*6.28,o.ph2=E()*6.28,o.ph3=E()*6.28,o.A1=n,o.A2=n*.45,o.f1=1.15+E()*.5,o.f2=2.6+E()*.8,o.w0=.055+.27*t+(E()-.5)*.015,o.amp=.03+.28*t,o.zb.length=0;for(let c=0;c<Math.min(i,4);c++)o.zb.push(2.8*Math.pow(1.4,c));o.ampK=o.amp,o.vk=0,i>0&&(o.amp*=.3,o.w0*=.8,o.vk=.45)}return Ct}function Ot(t,e){return t.a0+t.A1*Math.sin(t.f1*e+t.ph)+t.A2*Math.sin(t.f2*e+t.ph2)}function Lt(t,e,n,a,i,o){let c=0;c+=.017*Math.sin(t*9+2.2*b(t/w*6,e*.3,6))*u(.5,1.2,e);let d=u(.42,.95,e);o&&(o.vein=0,o.u=0,o.c=-1,o.dom=0,o.q=9,o.qc=-1,o.halo=0);for(let v=0;v<H;v++){let s=n[v],p=Kt(t-Ot(s,e)),h=i?1+.3*Math.sin(2.3*e+s.ph3):1,l=s.w0*h,z=p/l,q=Math.abs(z);if(q<2.6){let y=Math.exp(-Math.pow(q,2.6));c+=s.amp*h*d*y,o&&y>o.vein&&(o.vein=y,o.u=z,o.c=v)}for(let y of s.zb){let m=e-y,G=s.w0*1.5+.06,L=G*y*.95,P=Kt(t-Ot(s,y)),U=P/G*(P/G)+m/L*(m/L);U<4&&(U<1&&(c+=(s.ampK*.9+.07)*Math.pow(1-U,.6)),o&&U<o.q&&(o.q=U,o.qc=v,o.dd=P,o.dz=m))}}return c}var v0={vein:0,u:0,c:-1,dom:0,q:9,qc:-1,halo:0,dd:0,dz:0};function T0(t,e){let n=Math.min(1,Math.max(0,e.grow)),a=Math.max(0,Math.round(e.bands||0)),i=e.present!==!1,o=w0(i?n:0,a),c=n>.5,d=Math.min(1,Math.max(0,e.vis??(i?1:0)));for(let L of o)L.amp*=d;let v=Math.min(1,Math.max(0,+e.red||0)),s=new ImageData(t,t),p=s.data,h=t/2,l=v0,z=V("--endo-mucosa"),q=V("--endo-mucosa-deep"),y=V("--endo-zline"),m=V("--red-wale"),G=.008;for(let L=0;L<t;L++)for(let P=0;P<t;P++){let U=(P+.5-h)/h,Pt=(L+.5-h)/h,ot=Math.hypot(U,Pt),$=(L*t+P)*4;if(ot>1.02){p[$+3]=0;continue}let x=Math.atan2(Pt,U),f=1/(Math.max(ot,.01)*x0),Tt=.012*(1+f*.7),et=Lt(x,f,o,n,c,l),_t=Lt(x+G,f,o,n,c,null),jt=Lt(x,f+Tt,o,n,c,null),Wt=(_t-et)/G,Yt=(jt-et)/Tt,D=1-et,K=1,at=Wt/D,st=Yt,O=Math.hypot(K,at,st),Nt=D*D+f*f,_=Math.sqrt(Nt),j=Math.max(0,(D*K+st*f)/(O*_)),rt=1.7/(1+Nt*.12),lt=Math.cos(x),it=Math.sin(x),Zt=-(K*lt-at*it)/O,Xt=-(K*it+at*lt)/O,Jt=-st/O,Qt=-(D*lt)/_,t0=-(D*it)/_,n0=-f/_,ct=Qt-.35,ft=t0-.55,ut=n0+.75,ht=Math.hypot(ct,ft,ut);ct/=ht,ft/=ht,ut/=ht;let o0=Math.max(0,Zt*ct+Xt*ft+Jt*ut),dt=u(1.2,7,f),k=r(z[0],q[0],dt*.7),g=r(z[1],q[1],dt*.8),M=r(z[2],q[2],dt*.65),Ut=5.2+.9*(b(x/w*11,.5,11)-.5)+.35*(b(x/w*31,2.5,31)-.5),W=u(Ut-.25,Ut+.25,f);k=r(k,y[0],W*.75),g=r(g,y[1],W*.75),M=r(M,y[2],W*.75);let Ft=b(x/w*14,f*.9,14)*.6+b(x/w*40,f*2.5,40)*.4,mt=.93+.12*Ft+.06*(b(x/w*160,f*11,160)-.5)+.04*(I(P,L)-.5);k*=mt,g*=mt*(.97+.05*Ft),M*=mt;let Vt=b(x/w*36+.6*b(x/w*9,f*1.1,9),f*1.6,36),e0=b(x/w*90,f*4.2+3*Vt,90),a0=1-Math.abs(Vt*2-1),s0=1-Math.abs(e0*2-1),pt=(u(.93,.995,a0)*.16+u(.95,.995,s0)*.1)*(1-u(2.2,5,f))*u(.5,.75,f);if(k=r(k,184,pt),g=r(g,84,pt),M=r(M,92,pt),d>.02&&l.vein>.02){let T=Math.min(1,d*l.vein*(.45+.7*n)*(l.c>=0&&o[l.c].vk?o[l.c].vk:1)),F=Math.exp(-Math.pow(Math.abs(l.u)/.55,2))*u(.2,.6,n),A=u(.1,.5,n),R=T*.74;k=r(k,r(214,80,A)+30*F,R),g=r(g,r(178,90,A)+26*F,R),M=r(M,r(176,172,A)+18*F,R);let N=v*(l.c>=0&&o[l.c].vk?0:1)*(1-W);if(N>.01&&l.c>=0){let B=.32*(b(l.c*7,f*.8,4096)-.5),kt=Math.exp(-Math.pow((l.u-B)/.08,2))*u(.66,.86,b(l.c*13+5,f*2.6,4096)),gt=Math.exp(-Math.pow((l.u+.35+B)/.07,2))*u(.66,.84,b(l.c*17+9,f*3.4,4096)),Mt=Math.max(kt,gt*.8)*u(0,.5,N),f0=u(.95-.05*N,.98-.03*N,b(x/w*220,f*11,220))*T*u(.2,.7,N),yt=Math.max(Mt*.6*T,f0*.75)*u(.1,.3,n);k=r(k,m[0],yt),g=r(g,m[1],yt),M=r(M,m[2],yt)}}let Y=1;d>.02&&l.vein>.003&&l.vein<.35&&(Y=1-.16*d*d*u(.003,.12,l.vein)*(1-u(.12,.35,l.vein)));let Rt=1;if(l.q<4){let T=l.q;if(T>=1){let A=(1-u(1,3,T))*.3;k=r(k,200,A),g=r(g,78,A),M=r(M,96,A)}if(T<1.12){let A=Math.max(0,1-T),R=u(0,.12,A),N=b(x/w*60+3,f*7,60),B=u(.55,.95,A),kt=r(r(84,128,A),196,B*.6)+22*N,gt=r(r(34,62,A),150,B*.6)+14*N,Mt=r(r(76,112,A),172,B*.6)+18*N;k=r(k,kt,R),g=r(g,gt,R),M=r(M,Mt,R),Rt=.9}let F=Math.exp(-Math.pow((Math.sqrt(T)-1)/.05,2));F>.01&&(k=r(k,26,F*.8),g=r(g,16,F*.8),M=r(M,20,F*.8))}let xt=Math.min(1.1,j*.72+.3)*rt,Et=u(1.5,8,f),r0=r(.97,.7,Et),l0=r(.93,.6,Et),Gt=u(.35,.75,b(x/w*20,f*1.4,20))*.8+.2,i0=Math.min(.5,Math.pow(o0,200)*.35+Math.pow(j,90)*.32*Gt+Math.pow(j,18)*.03)*Rt*rt*Gt,c0=u(.93,.98,b(x/w*80,f*7,80))*.18*rt*Math.pow(j,4),wt=.08+.1*b(x/w*9,f*.7,9),vt=i0*.95+c0*.85,Z=k/255*xt*Y+vt+wt*.04,X=g/255*xt*Y*r0+vt*.98+wt*.025,J=M/255*xt*Y*l0+vt*.95+wt*.025,zt=u(5.5,18,f);Z=r(Z,.045,zt),X=r(X,.01,zt),J=r(J,.012,zt);let bt=1-.58*u(.64,1,ot);Z*=bt,X*=bt,J*=bt,p[$]=Math.min(255,255*Math.pow(Math.min(1.2,Z),.82)),p[$+1]=Math.min(255,255*Math.pow(Math.min(1.2,X),.92)),p[$+2]=Math.min(255,255*Math.pow(Math.min(1.2,J),.9)),p[$+3]=255}return s}export{z0 as a,b0 as b,q0 as c,T0 as d};
