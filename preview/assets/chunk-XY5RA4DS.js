var v=Array.from({length:256},(t,e)=>Math.fround(e/255)),g=t=>{let e=String(t);return/[.e]/.test(e)?e:`${e}.0`},b=v.map(g).join(", ");function F(t,e){let n=t.lastIndexOf("void main() {"),o=t.lastIndexOf("}");if(n<0||o<n)throw new Error("fusedVS: no main");return`${t.slice(0,n)}${e}
${t.slice(n,o)}  zoomOut();
${t.slice(o)}`}var w="{ vOut = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; /* left empty */ }",c=(t,e,n,o)=>{let i=t.split(e).length-1;if(i!==1)throw new Error(`fusedFS: ${o} found ${i} times`);return t.replace(e,n)};function x(t){let e=t.replace(/^#version 300 es\n/,"").replace(/^precision highp float;\n/m,"").replace(/^precision highp int;\n/m,"");return e=c(e,/^uniform int redraw;.*$/m,"const int redraw = 0;","redraw"),e=c(e,/^uniform int tint;.*$/m,"const int tint = 0;","tint"),e=c(e,/^uniform sampler2D depL;.*$/m,"#define depL organ","depL"),e=e.replace(/layout\(location=\d\) out /g,""),e=e.replace(/\boutColor\b/g,"vOut"),e=c(e,/\bvoid main\(\)/,"void vesselMain()","main"),e=e.replace(/\bdiscard;/g,w),e}function $(t){let e=t.replace(/^#version 300 es\n/,"").replace(/^precision highp float;\n/m,"").replace(/^precision highp int;\n/m,"");for(let n of[/^uniform sampler2D base;.*\n/m,/^uniform usampler2D gbuf;.*\n/m,/^uniform usampler2D gbuf2;.*\n/m,/^uniform highp sampler2D rad;.*\n/m,/^uniform highp sampler2D tube;.*\n/m,/^const float S_OFF = .*\n/m,/^vec4 over\(vec4 top, vec4 under\) \{ return top \+ under \* \(1\.0 - top\.a\); \}\n/m,/^float alongAt\(int id, float u\) \{\n[\s\S]*?\n\}\n/m])e=c(e,n,"",String(n));if(e=c(e,/^uniform int bloodOnly;.*$/m,"const int bloodOnly = 0;","bloodOnly"),e=e.replace(/\(inL \? texelFetch\(gbuf, lp, 0\) : uvec4\(0u\)\)/g,"fG").replace(/\(inL \? texelFetch\(gbuf2, lp, 0\) : uvec4\(0u\)\)/g,"fG2").replace(/\(inL \? texelFetch\(base, lp, 0\) : vec4\(0\.0\)\)/g,"fV").replace(/texture\(base, lowUV\)/g,"fVL"),/texelFetch\((gbuf|gbuf2|base),|texture\(base,/.test(e))throw new Error("compPart: a read of the layer left");return e=c(e,/\bvoid main\(\)/,"void compMain()","main"),e}function y(t,e,n){return`#version 300 es
precision highp float;
precision highp int;
${x(t)}
// \u2500\u2500 The vessel pass's results, as the layer would hold them \u2500\u2500
uvec4 fG, fG2;
vec4 fV;
#define fVL fV
const float U8[256] = float[256](${b});
vec4 unorm8(vec4 c) {
  ivec4 i = ivec4(roundEven(clamp(c, 0.0, 1.0) * 255.0));
  return vec4(U8[i.x], U8[i.y], U8[i.z], U8[i.w]);
}
${$(e)}
void main() {
  vesselMain();
  fV = unorm8(vOut);
  fG = outFlow & uvec4(0xffffu);
  fG2 = ${n?"uvec4(0u)":"outFlow2 & uvec4(0xffffu)"};
  compMain();
}`}function O(t){let e=t.replace(/\/\/.*$/gm,"").replace(/\/\*[\s\S]*?\*\//g,""),n=[],o=0,i="";for(let p of e.split(`
`)){let m=p.trim();if(m.startsWith("#")){let r=m.match(/^#define (\w+)/);r&&o===0&&n.push(r[1]);continue}for(let r of p){if(r==="{"){if(o===0){let s=i.match(/(\w+)\s*\([^()]*\)\s*$/);s&&n.push(s[1]),i=""}o++;continue}if(r==="}"){o--;continue}if(!(o>0)){if(r===";"){let s=i.replace(/\s+/g," ").trim();if(i="",!s||/^precision /.test(s))continue;let d=s.replace(/^(layout\([^)]*\) )?((flat|uniform|in|out|const|highp|mediump|lowp) )*/,"").replace(/^\w+(\[\d+\])? /,""),l=0,f="",a=[];for(let u of d)u==="("?l++:u===")"&&l--,u===","&&l===0?(a.push(f),f=""):f+=u;a.push(f);for(let u of a){let h=u.trim().match(/^(\w+)/);h&&n.push(h[1])}continue}i+=r}}}return n}export{v as a,F as b,x as c,$ as d,y as e,O as f};
