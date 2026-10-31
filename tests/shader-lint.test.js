// The tissue's shaders, checked without a GPU, a browser or a compiler (tests/glsl-lint.js): the mistakes a hand-edited shader gets
// (a name that is not declared, a function used above its declaration or with the wrong number of arguments, a block left open, a
// uniform or a sampler the JavaScript never sets) are found here instead of as a compile error on somebody's device, where the
// lobule would fall back to its painted picture. A real compile also checks the types (a float where an int is wanted), which this
// does not: the checker is told so in its header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { tissueFS, tissueVS } from '../src/ui/tissue-gl.js';

const gl = readFileSync(new URL('../src/ui/tissue-gl.js', import.meta.url), 'utf8');
const V = '#version 300 es\nprecision highp float;\n';

test('the lint finds what a compile would: undeclared names, functions used before they are declared or with the wrong arguments, open blocks, redeclarations', () => {
  const ok = `${V}uniform vec2 uA;\nout vec4 o;\nfloat sq(float x) { return x * x; }\nvoid main() { float a = sq(uA.x); for (int i = 0; i < 3; i++) { a += float(i); } o = vec4(a, a, a, 1.0); }`;
  assert.deepEqual(lintGLSL(ok), [], 'a valid shader passes');
  const bad = (src, re) => { const got = lintGLSL(src); assert.ok(got.some((m) => re.test(m)), `${re}: ${JSON.stringify(got)}`); };
  bad(ok.replace('o = vec4(a, a, a', 'o = vec4(a, b, a'), /"b" is not declared in scope/);
  bad(ok.replace('sq(uA.x)', 'sqq(uA.x)'), /"sqq" is called but no function/);
  bad(ok.replace('sq(uA.x)', 'sq(uA.x, 1.0)'), /"sq" is called with 2 arguments; it is declared with 1/);
  bad(ok.replace('sq(uA.x)', 'sq()'), /"sq" is called with 0 arguments/);
});

test('the lint: a function must be declared above its use, a loop variable lives in its loop, a block must close', () => {
  const V2 = `${V}out vec4 o;\n`;
  const bad = (src, re) => { const got = lintGLSL(src); assert.ok(got.some((m) => re.test(m)), `${re}: ${JSON.stringify(got)}`); };
  bad(`${V2}void main() { o = vec4(f(1.0)); }\nfloat f(float x) { return x; }`, /"f" is called but no function/);
  bad(`${V2}float f(float x) { return f(x); }\nvoid main() { o = vec4(f(1.0)); }`, /"f" is called but no function/);   // (recursion is not allowed in GLSL)
  bad(`${V2}void main() { for (int i = 0; i < 2; i++) { } o = vec4(float(i)); }`, /"i" is not declared in scope/);
  bad(`${V2}void main() { { float t = 1.0; } o = vec4(t); }`, /"t" is not declared in scope/);
  bad(`${V2}void main() { float t = 1.0; float t = 2.0; o = vec4(t); }`, /"t" is declared twice/);
  bad(`${V2}void main() { o = vec4(1.0);`, /ends inside a block|expected "}"/);
  bad(`${V2}void main() { o = vec4(1.0) }`, /expected ";"/);
  bad(`${V2}void main() { float a = 1.0\n float b = 2.0; o = vec4(a, b, 1.0, 1.0); }`, /side by side/);
  assert.deepEqual(lintGLSL(`${V2}float f(float x) { return x; }\nvoid main() { float a = 1.0, b = f(a); o = vec4(a, b, a, 1.0).wzyx; }`), [], 'a second declarator may use the first; a swizzle is not a name');
  assert.ok(lintGLSL(`${V2}void main() { o = vec4(1.0); }`.replace('#version 300 es', '#version 100')).length > 0, 'the version line is checked');
});

test('a mutated live shader is caught: each of these edits is something a hand edit could do, and the lint says so', () => {
  const src = tissueFS(true);
  assert.deepEqual(lintGLSL(src), [], 'to start from: it passes');
  const change = (from, to, re) => {
    assert.ok(src.includes(from), `the shader still has: ${from}`);
    const got = lintGLSL(src.replace(from, to));
    assert.ok(got.some((m) => re.test(m)), `${re} after ${from} → ${to}: ${JSON.stringify(got)}`);
  };
  change('float lvThin(float wpx)', 'float lvThinn(float wpx)', /"lvThin" is called but no function/);
  change('vec3 c0 = c;', 'vec3 c1 = c;', /"c0" is not declared in scope/);
  change('uniform float uLive;', 'uniform float uLivee;', /"uLive" is not declared in scope/);
  change('lvThin(2.0 * Wb / px)', 'lvThin(2.0 * Wb, px)', /"lvThin" is called with 2 arguments/);
  change('vec2 w = (p - uRect.xy) / uRect.z;', 'vec2 w = (p - uRect.xy) / uRect.z', /side by side: an operator or a ";" is missing/);
  change('o = vec4(mix(c, uBg, a), 1.0);\n}', 'o = vec4(mix(c, uBg, a), 1.0);', /ends inside a block|expected "}"/);
});

test('the tissue\'s vertex shader and both fragment shaders (the bitmap\'s and the live lobule\'s) pass the lint', () => {
  assert.deepEqual(lintGLSL(tissueVS), []);
  assert.deepEqual(lintGLSL(tissueFS(false)), []);
  assert.deepEqual(lintGLSL(tissueFS(true)), []);
});

// A uniform that is declared but never located is silently 0; one that is located by a name the shader does not declare is null and
// every set of it is ignored; a sampler never given a unit reads unit 0. None of those is a compile error, and all draw wrong.
const list = (name) => [...gl.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
const unitsOf = (fn, obj, consts) => {
  const body = gl.slice(gl.indexOf(`function ${fn}(`), gl.indexOf('\n  }\n', gl.indexOf(`function ${fn}(`)));
  const out = new Map();
  for (const m of body.matchAll(new RegExp(`gl\\.uniform1i\\(${obj}\\.(\\w+), ([^)]+)\\)`, 'g'))) out.set(m[1], Function(...Object.keys(consts), `return ${m[2]};`)(...Object.values(consts)));
  return out;
};

test('the uniforms the program locates are the uniforms the shader declares, in the bitmap program and the live program', () => {
  const COMMON = list('COMMON_U'), LIVE = list('LIVE_U');
  assert.equal(new Set([...COMMON, ...LIVE]).size, COMMON.length + LIVE.length, 'no name in both lists, none twice');
  const base = uniformsOf(tissueFS(false)), live = uniformsOf(tissueFS(true));
  assert.deepEqual([...base].sort(), [...COMMON].sort(), 'the bitmap program declares exactly the common uniforms');
  assert.deepEqual([...live].sort(), [...COMMON, ...LIVE].sort(), 'the live program declares exactly the common and the live uniforms');
  // Every uniform the draw sets exists: U.uX in the shared part against the common list, in the live part against the live list.
  const draw = gl.slice(gl.indexOf('    draw({'));
  const used = new Set([...draw.matchAll(/\bU\.(u\w+)/g)].map((m) => m[1]));
  for (const n of used) assert.ok(COMMON.includes(n) || LIVE.includes(n), `${n} is set but not located`);
  const liveBlock = draw.slice(draw.indexOf('if (isLive) {'), draw.indexOf('gl.uniform1f(U.uLive, live.share);') + 40);
  for (const n of new Set([...liveBlock.matchAll(/\bU\.(u\w+)/g)].map((m) => m[1]))) assert.ok(LIVE.includes(n) || COMMON.includes(n), `${n} (live part) is not located`);
  for (const n of LIVE) assert.ok(used.has(n) || /liveDyn|T\.t/.test(gl), `${n} is located but never set`);
  const setNames = new Set([...used, ...[...gl.matchAll(/\bL\.(u\w+)/g)].map((m) => m[1]), ...[...gl.matchAll(/\bU0\.(u\w+)/g)].map((m) => m[1])]);
  for (const n of [...COMMON, ...LIVE]) assert.ok(setNames.has(n), `${n} is declared and located but nothing sets it`);
});

test('every sampler has a texture unit of its own, none the scratch unit, none past the 16 a device must have, each with a texture bound', () => {
  const consts = { LIVE_UNIT: +gl.match(/LIVE_UNIT = (\d+)/)[1] }, scratch = +gl.match(/SCRATCH = (\d+)/)[1];
  const samplers = (src) => [...src.matchAll(/\buniform\s+(?:highp\s+)?sampler2D\s+([^;]+);/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
  const checks = [['publish', 'U0', tissueFS(false)], ['publishLive', 'L', tissueFS(true)]];
  for (const [fn, obj, src] of checks) {
    const units = unitsOf(fn, obj, consts), names = samplers(src);
    assert.deepEqual([...units.keys()].sort(), names.sort(), `${fn}: every sampler is given a unit, and only samplers`);
    const vals = [...units.values()];
    assert.equal(new Set(vals).size, vals.length, `${fn}: no two samplers on one unit`);
    for (const u of vals) assert.ok(Number.isInteger(u) && u >= 0 && u < 16 && u !== scratch, `${fn}: unit ${u}`);
  }
  // The units the live program reads are bound by the draw: 0 to 4 by bind(…), the lobule's five by liveFor (make(LIVE_UNIT + n)).
  for (const u of [0, 1, 2, 3, 4]) assert.match(gl, new RegExp(`bind\\(${u}, `), `unit ${u} is bound each draw`);
  for (const n of ['', ' + 1', ' + 2', ' + 3', ' + 4']) assert.ok(gl.includes(`make(LIVE_UNIT${n},`), `LIVE_UNIT${n} is made`);
});

test('the uniforms fit what every WebGL2 device has: 224 fragment vectors, 16 texture units', () => {
  const sizes = { float: 1, vec2: 1, vec3: 1, vec4: 1, int: 1 };
  const text = tissueFS(true).replace(/\/\/[^\n]*/g, '');
  let vectors = 0, samplerCount = 0;
  for (const m of text.matchAll(/\buniform\s+(?:highp\s+)?(\w+)\s+([^;]+);/g)) {
    for (const part of m[2].split(',')) {
      if (m[1] === 'sampler2D') { samplerCount++; continue; }
      const arr = part.match(/\[(\d+)\]/);
      vectors += (sizes[m[1]] || 1) * (arr ? +arr[1] : 1);
    }
  }
  assert.ok(vectors <= 224, `${vectors} uniform vectors`);
  assert.ok(samplerCount <= 16, `${samplerCount} samplers`);
});
