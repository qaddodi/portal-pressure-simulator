// The one-pass zoom drawing (?zoompass=one, off by default): while the view zooms or turns, the vessel layer cannot be
// moved as a pan moves it (every pixel shows a new spot of the figure, and its edges are smoothed over a new width), so each
// such frame draws the layer whole and then composites it whole, two passes, the layer's four targets written (21 bytes a
// pixel) and read back. The composite reads only its own pixel of them, so the two can run as one shader over the vessel
// cells: the vessel shader's results, held as the layer's formats would hold them, handed straight to the composite's.
// Built here from the two shaders' own text (veins-gl.js vesselFS and COMP_FS), so their maths are not copied and cannot
// drift apart. Kept apart from the renderer so it runs (and is tested) without a page.
//
// What the layer's formats do to the values, done here in the shader: the colour target is 8-bit (rounded to the nearest
// level, ties to even, then read back as level / 255, the exact float the GPU gives: U8), the lumen targets are 16-bit
// integers (masked to 16 bits; the vessel shader keeps them in range already). A pixel the vessel pass leaves empty
// (discard, after the whole draw's clear) is handed on as zero, as the cleared layer holds it.

// level / 255 for every 8-bit level, as floats (Math.fround): the value a texelFetch of an RGBA8 texel returns.
export const U8 = Array.from({ length: 256 }, (_, i) => Math.fround(i / 255));
const f32 = (v) => { const s = String(v); return /[.e]/.test(s) ? s : `${s}.0`; };

// The vertex shader: the vessel cells' (VS, unchanged), with the composite's per-vertex zoom numbers (ZOOM_VS) added.
export function fusedVS(VS, ZOOM_VS) {
  const at = VS.lastIndexOf('void main() {'), end = VS.lastIndexOf('}');
  if (at < 0 || end < at) throw new Error('fusedVS: no main');
  return `${VS.slice(0, at)}${ZOOM_VS}\n${VS.slice(at, end)}  zoomOut();\n${VS.slice(end)}`;
}

const EMPTY = '{ vOut = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; /* left empty */ }';
const one = (src, from, to, what) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`fusedFS: ${what} found ${n} times`);
  return src.replace(from, to);
};

// The vessel shader's text as a function, vesselMain(), writing globals instead of the layer's targets.
export function vesselPart(V) {
  let s = V.replace(/^#version 300 es\n/, '').replace(/^precision highp float;\n/m, '').replace(/^precision highp int;\n/m, '');
  // (The whole draw's constants: no partial redraw, no colour-only redraw, so the latter's mask is never read.)
  s = one(s, /^uniform int redraw;.*$/m, 'const int redraw = 0;', 'redraw');
  s = one(s, /^uniform int tint;.*$/m, 'const int tint = 0;', 'tint');
  s = one(s, /^uniform sampler2D depL;.*$/m, '#define depL organ', 'depL');
  s = s.replace(/layout\(location=\d\) out /g, '');
  s = s.replace(/\boutColor\b/g, 'vOut');
  s = one(s, /\bvoid main\(\)/, 'void vesselMain()', 'main');
  s = s.replace(/\bdiscard;/g, EMPTY);
  return s;
}

// The composite's text as a function, compMain(), reading the vessel pass's results instead of the layer.
// `shared`: the declarations the vessel part already makes, identical in both texts, left out here.
export function compPart(C) {
  let s = C.replace(/^#version 300 es\n/, '').replace(/^precision highp float;\n/m, '').replace(/^precision highp int;\n/m, '');
  for (const re of [/^uniform sampler2D base;.*\n/m, /^uniform usampler2D gbuf;.*\n/m, /^uniform usampler2D gbuf2;.*\n/m,
    /^uniform highp sampler2D rad;.*\n/m, /^uniform highp sampler2D tube;.*\n/m, /^const float S_OFF = .*\n/m,
    /^vec4 over\(vec4 top, vec4 under\) \{ return top \+ under \* \(1\.0 - top\.a\); \}\n/m]) s = one(s, re, '', String(re));
  s = one(s, /^uniform int bloodOnly;.*$/m, 'const int bloodOnly = 0;', 'bloodOnly');
  s = s.replace(/texelFetch\(gbuf, ip, 0\)/g, 'fG').replace(/texelFetch\(gbuf2, ip, 0\)/g, 'fG2').replace(/texelFetch\(base, ip, 0\)/g, 'fV');
  s = one(s, /\bvoid main\(\)/, 'void compMain()', 'main');
  return s;
}

// The fragment shader: vessel part, then composite part, then a main that runs one into the other.
// V: vesselFS(simple); C: COMP_FS(plain, fast); `simple`: V is the one-vessel build (no second lumen: zero, as its layer holds).
export function fusedFS(V, C, simple) {
  return `#version 300 es
precision highp float;
precision highp int;
${vesselPart(V)}
// ── The vessel pass's results, as the layer would hold them ──
uvec4 fG, fG2;
vec4 fV;
const float U8[256] = float[256](${U8.map(f32).join(', ')});
vec4 unorm8(vec4 c) {
  ivec4 i = ivec4(roundEven(clamp(c, 0.0, 1.0) * 255.0));
  return vec4(U8[i.x], U8[i.y], U8[i.z], U8[i.w]);
}
${compPart(C)}
void main() {
  vesselMain();
  fV = unorm8(vOut);
  fG = outFlow & uvec4(0xffffu);
  fG2 = ${simple ? 'uvec4(0u)' : 'outFlow2 & uvec4(0xffffu)'};
  compMain();
}`;
}

// The names a shader text declares at its top level (outside every function body), for the checks: uniforms, ins, outs,
// constants, globals, functions and macros. Comments and the bodies' braces are skipped.
export function topNames(src) {
  const s = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [];
  let depth = 0, stmt = '';
  for (const line of s.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#')) { const m = t.match(/^#define (\w+)/); if (m && depth === 0) names.push(m[1]); continue; }
    for (const ch of line) {
      if (ch === '{') { if (depth === 0) { const m = stmt.match(/(\w+)\s*\([^()]*\)\s*$/); if (m) names.push(m[1]); stmt = ''; } depth++; continue; }
      if (ch === '}') { depth--; continue; }
      if (depth > 0) continue;
      if (ch === ';') {
        const d = stmt.replace(/\s+/g, ' ').trim();
        stmt = '';
        if (!d || /^precision /.test(d)) continue;
        // (A declaration list: `vec4 a, b;`, `const int x = 0, y = 1;`, `uniform vec4 c[24];`.)
        const body = d.replace(/^(layout\([^)]*\) )?((flat|uniform|in|out|const|highp|mediump|lowp) )*/, '').replace(/^\w+(\[\d+\])? /, '');
        let lv = 0, cur = '';
        const parts = [];
        for (const c of body) { if (c === '(') lv++; else if (c === ')') lv--; if (c === ',' && lv === 0) { parts.push(cur); cur = ''; } else cur += c; }
        parts.push(cur);
        for (const part of parts) { const m = part.trim().match(/^(\w+)/); if (m) names.push(m[1]); }
        continue;
      }
      stmt += ch;
    }
  }
  return names;
}
