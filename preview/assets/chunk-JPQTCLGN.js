import{xb as R}from"./chunk-VEJA2JHM.js";import{g as Dt,i as Bt,n as St,t as Ht,u as _t}from"./chunk-LU655YPY.js";import{a as Q}from"./chunk-X3WL6NOF.js";import{i as r}from"./chunk-2QFF4T7Q.js";function u0(t,n,e,a){return n===t?"same":!t||n==="none"||t==="none"||a?"now":e?"wait":"fade"}var h0=800;function k0(t,n,e,a,c,o){let i=u0(t,n,e,a);return i==="wait"&&c>=h0&&o===n?"fade":i}var d0=Math.PI*2,m0=1.55,M0=t=>1/(Math.max(t,.01)*m0);function At(){let t=7,n=()=>(t=t*1664525+1013904223>>>0,t/4294967296),e=[],a=[];for(let c=0;c<4;c++){let o=c/4*d0+.5+(n()-.5)*.5,i=n()*6.28,d=n()*6.28,v=n()*6.28,s=1.15+n()*.5,p=2.6+n()*.8,h=(n()-.5)*.015;e.push(o,i,d,v),a.push(s,p,h,0)}return{c0:e,c1:a}}var $t=At();function y0(t,n,e,a=0){let c=$t.c0,o=$t.c1,i=t*4,d=(.025+.3*e)*(1-.55*a),v=d*.45;return c[i]+d*Math.sin(o[i]*n+c[i+1])+v*Math.sin(o[i+1]*n+c[i+2])}var p0="attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }",C=t=>R(t).map(n=>n.toFixed(1)).join(", "),tt=t=>R(t).map(n=>(n/255).toFixed(4)).join(", "),x0=()=>`
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
`,_=new WeakMap;function w0(t,n){let e=_.get(t);if(e&&e.gen===n)return e;let a=e?e.holders:new Set;e&&e.stopPoll?.(),e={gl:t,gen:n,started:null,pend:[null],stopPoll:null,u:null,pr:null,failed:!1,buf:null,vao:null,holders:a};let{c0:c,c1:o}=At();e.c0=new Float32Array(c),e.c1=new Float32Array(o);try{e.started=Dt(t,p0,x0(),[["p",0]]),e.pend[0]=e.started,e.buf=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,e.buf),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),e.vao=t.createVertexArray(),t.bindVertexArray(e.vao),t.bindBuffer(t.ARRAY_BUFFER,e.buf),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),e.stopPoll=_t(t,[e.started],()=>qt(e))}catch(i){e.failed=!0,Q("endo-gl:build",i)}return _.set(t,e),e}function qt(t){let n=t.gl;if(!(t.u||t.failed||n.isContextLost()||_.get(n)!==t))try{let e=Bt(n,t.started);n.useProgram(e);let a=o=>n.getUniformLocation(e,o),c={size:a("uSize"),grow:a("uGrow"),vis:a("uVis"),red:a("uRed"),c0:a("uC0"),c1:a("uC1"),def:a("uDef"),kn:a("uKn")};n.uniform4fv(c.c0,t.c0),n.uniform4fv(c.c1,t.c1),St(n,()=>{n.bindVertexArray(t.vao),n.uniform1f(c.size,1),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)}),n.useProgram(null),t.pr=e,t.u=c;for(let o of t.holders)if(o.need){o.need=!1;try{o.onBack?.()}catch(i){Q("endo-gl:221",i)}}}catch{t.u=null,n.isContextLost()||(t.failed=!0)}}function P0({onBack:t=null,pen:n=null}={}){if(!n||typeof n.glNow!="function"||typeof n.shade!="function")return null;let e={onBack:t,need:!1},a=null,c=!1,o=()=>{let s=c?null:n.glNow();return s?((!a||a.gl!==s||a.gen!==n.gen)&&(a?.holders.delete(e),a=w0(s,n.gen),a.holders.add(e)),a):(a&&(a.holders.delete(e),a=null),null)},i=new Float32Array(4),d=new Float32Array(16),v={st:null,draw(s,p){let h=a;if(!h||!h.u)return!1;let l=h.u,z=this.st;s.useProgram(h.pr),s.bindVertexArray(h.vao),s.uniform1f(l.size,p),s.uniform1f(l.grow,z.grow),s.uniform1f(l.vis,z.vis),s.uniform1f(l.red,+z.red||0);let q=z.def.length,y=z.kn.length;for(let m=0;m<4;m++)i[m]=m<q?z.def[m]:0;for(let m=0;m<16;m++)d[m]=m<y?z.kn[m]:0;return s.uniform1fv(l.def,i),s.uniform1fv(l.kn,d),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),!0}};return{ready(){let s=o();return s?s.u||this.pending?!0:(qt(s),!!s.u):!1},get pending(){let s=o();return!s||s.u||s.failed||!s.started||!Ht(s.gl,s.pend)?!1:(e.need=!0,s.stopPoll?.want?.(),!0)},get lost(){return o()?!1:(e.need=!0,!0)},dispose(){if(c=!0,a?.holders.delete(e),a&&!a.holders.size&&_.get(a.gl)===a){let s=a.gl;a.stopPoll?.();try{s.isContextLost()||(s.deleteProgram(a.pr),s.deleteBuffer(a.buf),s.deleteVertexArray(a.vao))}catch(p){Q("endo-gl:dispose",p)}_.delete(s)}a=null},shade(s,p,h,l){return!o()||!a.u&&(this.pending||(qt(a),!a.u))?!1:(v.st=l,n.shade(s,p,h,v))}}}var w=Math.PI*2,v0=1.55,S=4;function $(t,n){let e=Math.imul(t,374761393)+Math.imul(n,668265263)|0;return e=Math.imul(e^e>>>13,1274126177),((e^e>>>16)>>>0)/4294967296}function b(t,n,e){let a=Math.floor(t),c=Math.floor(n),o=t-a,i=n-c,d=o*o*(3-2*o),v=i*i*(3-2*i),s=(a%e+e)%e,p=(s+1)%e,h=$(s,c),l=$(p,c),z=$(s,c+1),q=$(p,c+1);return h+(l-h)*d+(z-h)*v+(h-l-z+q)*d*v}var u=(t,n,e)=>{let a=Math.min(1,Math.max(0,(e-t)/(n-t)));return a*a*(3-2*a)},It=t=>(t%=w,t>Math.PI?t-w:t<-Math.PI?t+w:t),nt=7;function E(){return nt=nt*1664525+1013904223>>>0,nt/4294967296}var Ct=[];for(let t=0;t<S;t++)Ct.push({a0:0,ph:0,ph2:0,ph3:0,A1:0,A2:0,f1:0,f2:0,w0:0,amp:0,zb:[],ampK:0,vk:0});function z0(t,n){nt=7;let e=.025+.3*t;for(let a=0;a<S;a++){let c=Math.floor(n/S)+(a<n%S?1:0),o=Ct[a];o.a0=a/S*w+.5+(E()-.5)*.5,o.ph=E()*6.28,o.ph2=E()*6.28,o.ph3=E()*6.28,o.A1=e,o.A2=e*.45,o.f1=1.15+E()*.5,o.f2=2.6+E()*.8,o.w0=.055+.27*t+(E()-.5)*.015,o.amp=.03+.28*t,o.zb.length=0;for(let i=0;i<Math.min(c,4);i++)o.zb.push(2.8*Math.pow(1.4,i));o.ampK=o.amp,o.vk=0,c>0&&(o.amp*=.3,o.w0*=.8,o.vk=.45)}return Ct}function Kt(t,n){return t.a0+t.A1*Math.sin(t.f1*n+t.ph)+t.A2*Math.sin(t.f2*n+t.ph2)}function Lt(t,n,e,a,c,o){let i=0;i+=.017*Math.sin(t*9+2.2*b(t/w*6,n*.3,6))*u(.5,1.2,n);let d=u(.42,.95,n);o&&(o.vein=0,o.u=0,o.c=-1,o.dom=0,o.q=9,o.qc=-1,o.halo=0);for(let v=0;v<S;v++){let s=e[v],p=It(t-Kt(s,n)),h=c?1+.3*Math.sin(2.3*n+s.ph3):1,l=s.w0*h,z=p/l,q=Math.abs(z);if(q<2.6){let y=Math.exp(-Math.pow(q,2.6));i+=s.amp*h*d*y,o&&y>o.vein&&(o.vein=y,o.u=z,o.c=v)}for(let y of s.zb){let m=n-y,G=s.w0*1.5+.06,L=G*y*.95,N=It(t-Kt(s,y)),F=N/G*(N/G)+m/L*(m/L);F<4&&(F<1&&(i+=(s.ampK*.9+.07)*Math.pow(1-F,.6)),o&&F<o.q&&(o.q=F,o.qc=v,o.dd=N,o.dz=m))}}return i}var b0={vein:0,u:0,c:-1,dom:0,q:9,qc:-1,halo:0,dd:0,dz:0};function R0(t,n){let e=Math.min(1,Math.max(0,n.grow)),a=Math.max(0,Math.round(n.bands||0)),c=n.present!==!1,o=z0(c?e:0,a),i=e>.5,d=Math.min(1,Math.max(0,n.vis??(c?1:0)));for(let L of o)L.amp*=d;let v=Math.min(1,Math.max(0,+n.red||0)),s=new ImageData(t,t),p=s.data,h=t/2,l=b0,z=R("--endo-mucosa"),q=R("--endo-mucosa-deep"),y=R("--endo-zline"),m=R("--red-wale"),G=.008;for(let L=0;L<t;L++)for(let N=0;N<t;N++){let F=(N+.5-h)/h,Nt=(L+.5-h)/h,et=Math.hypot(F,Nt),H=(L*t+N)*4;if(et>1.02){p[H+3]=0;continue}let x=Math.atan2(Nt,F),f=1/(Math.max(et,.01)*v0),Pt=.012*(1+f*.7),ot=Lt(x,f,o,e,i,l),Ot=Lt(x+G,f,o,e,i,null),jt=Lt(x,f+Pt,o,e,i,null),Wt=(Ot-ot)/G,Yt=(jt-ot)/Pt,D=1-ot,I=1,at=Wt/D,st=Yt,K=Math.hypot(I,at,st),Tt=D*D+f*f,O=Math.sqrt(Tt),j=Math.max(0,(D*I+st*f)/(K*O)),rt=1.7/(1+Tt*.12),lt=Math.cos(x),it=Math.sin(x),Zt=-(I*lt-at*it)/K,Xt=-(I*it+at*lt)/K,Jt=-st/K,Qt=-(D*lt)/O,t0=-(D*it)/O,n0=-f/O,ct=Qt-.35,ft=t0-.55,ut=n0+.75,ht=Math.hypot(ct,ft,ut);ct/=ht,ft/=ht,ut/=ht;let e0=Math.max(0,Zt*ct+Xt*ft+Jt*ut),dt=u(1.2,7,f),k=r(z[0],q[0],dt*.7),g=r(z[1],q[1],dt*.8),M=r(z[2],q[2],dt*.65),Ft=5.2+.9*(b(x/w*11,.5,11)-.5)+.35*(b(x/w*31,2.5,31)-.5),W=u(Ft-.25,Ft+.25,f);k=r(k,y[0],W*.75),g=r(g,y[1],W*.75),M=r(M,y[2],W*.75);let Ut=b(x/w*14,f*.9,14)*.6+b(x/w*40,f*2.5,40)*.4,mt=.93+.12*Ut+.06*(b(x/w*160,f*11,160)-.5)+.04*($(N,L)-.5);k*=mt,g*=mt*(.97+.05*Ut),M*=mt;let Rt=b(x/w*36+.6*b(x/w*9,f*1.1,9),f*1.6,36),o0=b(x/w*90,f*4.2+3*Rt,90),a0=1-Math.abs(Rt*2-1),s0=1-Math.abs(o0*2-1),pt=(u(.93,.995,a0)*.16+u(.95,.995,s0)*.1)*(1-u(2.2,5,f))*u(.5,.75,f);if(k=r(k,184,pt),g=r(g,84,pt),M=r(M,92,pt),d>.02&&l.vein>.02){let P=Math.min(1,d*l.vein*(.45+.7*e)*(l.c>=0&&o[l.c].vk?o[l.c].vk:1)),U=Math.exp(-Math.pow(Math.abs(l.u)/.55,2))*u(.2,.6,e),A=u(.1,.5,e),V=P*.74;k=r(k,r(214,80,A)+30*U,V),g=r(g,r(178,90,A)+26*U,V),M=r(M,r(176,172,A)+18*U,V);let T=v*(l.c>=0&&o[l.c].vk?0:1)*(1-W);if(T>.01&&l.c>=0){let B=.32*(b(l.c*7,f*.8,4096)-.5),kt=Math.exp(-Math.pow((l.u-B)/.08,2))*u(.66,.86,b(l.c*13+5,f*2.6,4096)),gt=Math.exp(-Math.pow((l.u+.35+B)/.07,2))*u(.66,.84,b(l.c*17+9,f*3.4,4096)),Mt=Math.max(kt,gt*.8)*u(0,.5,T),f0=u(.95-.05*T,.98-.03*T,b(x/w*220,f*11,220))*P*u(.2,.7,T),yt=Math.max(Mt*.6*P,f0*.75)*u(.1,.3,e);k=r(k,m[0],yt),g=r(g,m[1],yt),M=r(M,m[2],yt)}}let Y=1;d>.02&&l.vein>.003&&l.vein<.35&&(Y=1-.16*d*d*u(.003,.12,l.vein)*(1-u(.12,.35,l.vein)));let Vt=1;if(l.q<4){let P=l.q;if(P>=1){let A=(1-u(1,3,P))*.3;k=r(k,200,A),g=r(g,78,A),M=r(M,96,A)}if(P<1.12){let A=Math.max(0,1-P),V=u(0,.12,A),T=b(x/w*60+3,f*7,60),B=u(.55,.95,A),kt=r(r(84,128,A),196,B*.6)+22*T,gt=r(r(34,62,A),150,B*.6)+14*T,Mt=r(r(76,112,A),172,B*.6)+18*T;k=r(k,kt,V),g=r(g,gt,V),M=r(M,Mt,V),Vt=.9}let U=Math.exp(-Math.pow((Math.sqrt(P)-1)/.05,2));U>.01&&(k=r(k,26,U*.8),g=r(g,16,U*.8),M=r(M,20,U*.8))}let xt=Math.min(1.1,j*.72+.3)*rt,Et=u(1.5,8,f),r0=r(.97,.7,Et),l0=r(.93,.6,Et),Gt=u(.35,.75,b(x/w*20,f*1.4,20))*.8+.2,i0=Math.min(.5,Math.pow(e0,200)*.35+Math.pow(j,90)*.32*Gt+Math.pow(j,18)*.03)*Vt*rt*Gt,c0=u(.93,.98,b(x/w*80,f*7,80))*.18*rt*Math.pow(j,4),wt=.08+.1*b(x/w*9,f*.7,9),vt=i0*.95+c0*.85,Z=k/255*xt*Y+vt+wt*.04,X=g/255*xt*Y*r0+vt*.98+wt*.025,J=M/255*xt*Y*l0+vt*.95+wt*.025,zt=u(5.5,18,f);Z=r(Z,.045,zt),X=r(X,.01,zt),J=r(J,.012,zt);let bt=1-.58*u(.64,1,et);Z*=bt,X*=bt,J*=bt,p[H]=Math.min(255,255*Math.pow(Math.min(1.2,Z),.82)),p[H+1]=Math.min(255,255*Math.pow(Math.min(1.2,X),.92)),p[H+2]=Math.min(255,255*Math.pow(Math.min(1.2,J),.9)),p[H+3]=255}return s}export{h0 as a,k0 as b,M0 as c,y0 as d,P0 as e,R0 as f};
