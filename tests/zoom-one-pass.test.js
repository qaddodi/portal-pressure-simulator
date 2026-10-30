// The one-pass zoom drawing (on by default, ?zoompass=two goes back; veins-fuse.js): a frame where the view zoomed or turned runs the
// vessel shader and the composite as one shader over the vessel cells. Source patterns (no GL in node), checked on the shader
// text as the GPU sees it: the one-pass text is the two shaders' own, with only their inputs and outputs rewired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { vesselFS, COMP_FS } = await import('../src/ui/veins-gl.js');
const { fusedFS, fusedVS, vesselPart, compPart, topNames, U8 } = await import('../src/ui/veins-fuse.js');
const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

// The shader's own preprocessor, as far as these shaders use it: #define NAME value, #if NAME, #if NAME == n, #else, #endif.
function resolve(text) {
  const defs = {}, out = [], stack = [];
  for (const line of text.split('\n')) {
    const t = line.trim(), live = stack.every((s) => s);
    let m;
    if ((m = t.match(/^#define (\w+) (.+)$/))) { if (live) defs[m[1]] = m[2].trim(); out.push(line); continue; }
    if ((m = t.match(/^#if (\w+)(?: == (\d+))?$/))) { const v = Number(defs[m[1]] ?? 0); stack.push(m[2] == null ? v !== 0 : v === Number(m[2])); continue; }
    if (t === '#else') { stack.push(!stack.pop()); continue; }
    if (t === '#endif') { stack.pop(); continue; }
    if (live) out.push(line);
  }
  assert.equal(stack.length, 0, 'every #if is closed');
  return out.join('\n');
}
const noComments = (s) => s.replace(/\/\/.*$/gm, '');
const body = (text, head) => {
  const i = text.indexOf(head);
  assert.ok(i >= 0, `${head} is in the shader`);
  let d = 0;
  for (let k = head.endsWith('{') ? i + head.length - 1 : text.indexOf('{', i); k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) return text.slice(i, k + 1); }
  throw new Error(`${head} never closes`);
};
const C = COMP_FS(true);
const builds = [false, true].map((simple) => ({ simple, V: vesselFS(simple), fs: fusedFS(vesselFS(simple), C, simple) }));

test('the one-pass text: one #version first, one main, brackets balanced, the two halves as functions', () => {
  for (const { simple, fs } of builds) {
    assert.ok(fs.startsWith('#version 300 es\n'), 'the version line comes first');
    assert.equal(fs.match(/#version/g).length, 1);
    const r = resolve(fs);
    assert.equal(r.match(/\bvoid main\(\)/g).length, 1, `${simple}: one main`);
    assert.equal(r.match(/\bvoid vesselMain\(\)/g).length, 1);
    assert.equal(r.match(/\bvoid compMain\(\)/g).length, 1);
    for (const [o, c] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      let d = 0;
      for (const ch of r) { if (ch === o) d++; else if (ch === c) d--; assert.ok(d >= 0); }
      assert.equal(d, 0, `${simple}: ${o}${c} balance`);
    }
    assert.match(body(r, 'void main()'), /vesselMain\(\);\s*fV = unorm8\(vOut\);\s*fG = outFlow & uvec4\(0xffffu\);\s*fG2 = [^;]+;\s*compMain\(\);/);
  }
});

test('no name is declared twice at the top level of either build (its #if blocks resolved), and no layer target or texture is left', () => {
  for (const { simple, fs } of builds) {
    const r = resolve(fs), names = topNames(r);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dup, [], `${simple}: declared twice`);
    const code = noComments(r);
    assert.doesNotMatch(code, /layout\(location/, 'the vessel targets are globals now');
    assert.equal(code.match(/^out /gm).length, 1, 'one output: the picture');
    assert.doesNotMatch(noComments(compPart(C)), /\b(gbuf|gbuf2|base)\b/, 'the layer textures are not read');
    assert.match(code, /^#define depL organ$/m, 'the colour-only redraw\'s mask, never read here, takes no texture unit');
  }
});

test('at most 16 textures (WebGL2 guarantees no more for a fragment shader)', () => {
  for (const { fs } of builds) {
    const decl = noComments(resolve(fs)).match(/^uniform (?:highp |lowp |mediump )?u?sampler2D [^;]+;/gm);
    const n = decl.reduce((k, d) => k + d.split(',').length, 0);
    assert.ok(n <= 16, `${n} samplers`);
  }
});

test('the vessel half is the vessel shader: the same text once its outputs and the whole draw\'s constants are put back', () => {
  for (const { V } of builds) {
    const back = vesselPart(V)
      .replace(/\{ vOut = vec4\(0\.0\); outFlow = uvec4\(0u\); outFlow2 = uvec4\(0u\); outDep = vec4\(0\.0\); return; \/\* left empty \*\/ \}/g, 'discard;')
      .replace(/\bvOut\b/g, 'outColor').replace('void vesselMain()', 'void main()');
    const orig = V.replace(/layout\(location=\d\) out /g, '');
    // (Only the three uniforms made constants differ.)
    const strip = (s) => s.replace(/^#version.*\n/, '').replace(/^precision high(p) (float|int);\n/gm, '').replace(/^.*\b(redraw|tint|depL);.*$/gm, '').replace(/^const int (redraw|tint) = 0;$/gm, '').replace(/^#define depL organ$/m, '');
    assert.equal(strip(back), strip(orig));
    // A pixel the vessel pass leaves empty (discard after the whole draw's clear) is handed on as zero, every target.
    assert.doesNotMatch(noComments(vesselPart(V)), /\bdiscard\b/);
    assert.match(vesselPart(V), /^const int redraw = 0;$/m);
    assert.match(vesselPart(V), /^const int tint = 0;$/m);
  }
});

test('the composite half is the plain composite: the same text once the layer reads are put back', () => {
  const back = compPart(C).replace(/\bfG2\b/g, 'texelFetch(gbuf2, ip, 0)').replace(/\bfG\b/g, 'texelFetch(gbuf, ip, 0)').replace(/\bfV\b/g, 'texelFetch(base, ip, 0)')
    .replace('void compMain()', 'void main()').replace('const int bloodOnly = 0;', '');
  const orig = C.replace(/^#version.*\n/, '').replace(/^precision highp (float|int);\n/gm, '').replace(/^uniform int bloodOnly;.*$/m, '')
    .replace(/^(uniform sampler2D base;|uniform usampler2D gbuf;|uniform usampler2D gbuf2;|uniform highp sampler2D rad;|uniform highp sampler2D tube;|const float S_OFF = |vec4 over\(vec4 top).*\n/gm, '');
  assert.equal(back, orig);
  // (What was left out is declared the same in the vessel half.)
  const V = vesselFS(false);
  for (const d of ['uniform highp sampler2D rad;', 'uniform highp sampler2D tube;', 'vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }']) assert.ok(V.includes(d), d);
  assert.equal(V.match(/const float S_OFF = (.*);/)[1], C.match(/const float S_OFF = (.*);/)[1]);
});

test('the 8-bit colour target as the shader holds it: ties to even, then level / 255 exactly as a texel read returns it', () => {
  assert.equal(U8.length, 256);
  for (let i = 0; i < 256; i++) assert.equal(U8[i], Math.fround(i / 255));
  const lits = builds[0].fs.match(/const float U8\[256\] = float\[256\]\(([^)]*)\)/)[1].split(', ');
  assert.equal(lits.length, 256);
  lits.forEach((l, i) => { assert.match(l, /[.e]/, 'a float literal'); assert.equal(Math.fround(Number(l)), U8[i]); });
  assert.match(builds[0].fs, /roundEven\(clamp\(c, 0\.0, 1\.0\) \* 255\.0\)/);
  // (The one-vessel build has no second lumen: zero, as its layer holds there.)
  assert.match(builds[1].fs, /fG2 = uvec4\(0u\);/);
  assert.match(builds[0].fs, /fG2 = outFlow2 & uvec4\(0xffffu\);/);
});

test('the one-pass vertex shader is the vessel cells\' with the composite\'s zoom numbers added', () => {
  const VS = src.match(/const VS = `([\s\S]*?)`;/)[1];
  const vs = fusedVS(VS, 'void zoomOut() {}');
  assert.ok(vs.includes(VS.slice(VS.indexOf('void main() {'), VS.lastIndexOf('}'))), 'the cell corners are worked out as the vessel pass works them out');
  assert.match(vs, /zoomOut\(\);\n\}$/);
  assert.match(src, /fusedVS\(VS, ZOOM_VS\)/);
});

test('veins-gl: on by default (?zoompass=two goes back), a zoom or turn only, plain frames only, the old two passes otherwise', () => {
  assert.match(src, /const ONE_PASS = !\(typeof location !== 'undefined' && \/\[\?&\]zoompass=two\\b\/\.test\(location\.search\)\);/);
  assert.match(src, /stencil: ONE_PASS,/, 'no stencil with ?zoompass=two');
  assert.match(src, /if \(ONE_PASS\) \{\s*try \{/, 'the one-pass builds are not made with ?zoompass=two');
  const draw = body(src, '    draw(m, look, blood, rows = null) {');
  const fuse = draw.match(/if \(!pan && baseM && m\.slice\(0, 4\)\.some\(\(v, i\) => v !== baseM\[i\]\) && fuseReady\(\) && bareOf\(blood \|\| \{\}\) && !gpuProbe\.skipGL && !lost\) \{([\s\S]*?)\n {6}\}/);
  assert.ok(fuse, 'one pass only when the scale or turn changed, the builds are ready and the frame is plain');
  assert.match(fuse[1], /fboOK = false;/, 'the layer is not current after it');
  assert.match(fuse[1], /clearLayer\(\); stale = true;/, 'the layer is cleared once, for the pixels outside the cells');
  assert.match(fuse[1], /fusing = true;\s*this\.composite\(look, blood, true\);\s*if \(reuseEvery && reuseOn\) \{ reuseKeep\(m\); reuseN = 1; \} else rz\.m = null;\s*return;/, '(Pinch frame reuse: the picture kept only while that is on and a hand zooms)');
  assert.match(draw, /fboOK = true; stale = false;/, 'a whole draw makes the layer current again');
  const comp = body(src, '    composite(look, blood = {}, full = false, part = 0) {');
  assert.match(comp, /const fused = fusing;\s*fusing = false;\s*if \(stale && !fused\) \{ this\.draw\(baseM, look, blood\); return; \}/, 'any other picture draws the layer whole first');
  assert.match(comp, /gl\.stencilFunc\(gl\.ALWAYS, 1, 0xff\); gl\.stencilOp\(gl\.KEEP, gl\.KEEP, gl\.REPLACE\);[\s\S]*fuseBind\(P, m, look, layer, glow, warm, useStack\);[\s\S]*gl\.stencilFunc\(gl\.EQUAL, 0, 0xff\);[\s\S]*gl\.drawArrays\(gl\.TRIANGLE_STRIP, 0, 4\);\s*gl\.disable\(gl\.STENCIL_TEST\);/);
  assert.match(comp, /for \(const P of \[\.\.\.fuseP, prg\]\) \{/, 'the one-pass builds get the picture\'s uniforms, the picture\'s own build last');
  assert.match(src, /const fuseReady = \(\) => !!fuseGen && !!plain && \(!nSimple \|\| !!fuseOne\)/);
  // (Torn down with the rest.)
  assert.match(src, /plain, plainCell, fuseGen, fuseOne, cathP, lineP\]\) if \(x\) gl\.deleteProgram/);
  assert.match(src, /if \(own\.rb\) gl\.deleteRenderbuffer\(own\.rb\);/);
});
