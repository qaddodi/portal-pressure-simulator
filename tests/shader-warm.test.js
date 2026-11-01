import test from 'node:test';
import assert from 'node:assert/strict';
import { prestart, prestarted, linkProgram, checkProgram, startProgram } from '../src/ui/gl-compile.js';
import { fadeReady, warmFade } from '../src/ui/res-fade-gl.js';
import { readFileSync } from 'node:fs';

// A GL stand-in counting compiles; `done` answers COMPLETION_STATUS_KHR, `ok` every status.
function fakeGL({ done = false, ok = true } = {}) {
  const log = [], progs = new Set();
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    log, done, ok,
    getExtension: (n) => (n === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: 0x91b1 } : null),
    createShader: () => ({}), shaderSource: () => {}, compileShader: () => log.push('compile'), deleteShader: () => log.push('delshader'),
    createProgram: () => { const p = {}; progs.add(p); return p; }, deleteProgram: (p) => progs.delete(p), isProgram: (p) => progs.has(p),
    attachShader: () => {}, bindAttribLocation: () => {}, linkProgram: () => log.push('link'),
    getProgramParameter: (p, k) => { log.push(`param ${k}`); return k === 0x91b1 ? gl.done : gl.ok; },
    getShaderParameter: () => { log.push('shaderparam'); return gl.ok; },
    getShaderInfoLog: () => 'bad shader', getProgramInfoLog: () => 'bad link',
    getUniformLocation: () => ({}), isContextLost: () => false,
    lose() { progs.clear(); },
  };
  return gl;
}

test('a prestarted program is taken up by linkProgram, compiled once', () => {
  const gl = fakeGL();
  const h = prestart(gl, 'vs', 'fs');
  assert.ok(h);
  assert.equal(prestarted(gl, 'vs', 'fs'), h);
  const before = gl.log.filter((l) => l === 'compile').length;
  assert.equal(linkProgram(gl, 'vs', 'fs'), h.p);
  assert.equal(gl.log.filter((l) => l === 'compile').length, before, 'no second compile');
  assert.equal(prestarted(gl, 'vs', 'fs'), null, 'taken');
});

test('only the link status is read when the link went', () => {
  const gl = fakeGL();
  checkProgram(gl, startProgram(gl, 'v', 'f'));
  assert.equal(gl.log.filter((l) => l === 'shaderparam').length, 0);
});

test('a failed link still throws the shader log', () => {
  const gl = fakeGL({ ok: false });
  assert.throws(() => linkProgram(gl, 'v', 'f'), /bad shader/);
});

test('a program from before a lost context is started again', () => {
  const gl = fakeGL();
  const a = prestart(gl, 'v', 'f');
  gl.lose();
  const b = prestart(gl, 'v', 'f');
  assert.notEqual(a, b);
  assert.equal(prestarted(gl, 'v', 'f'), b);
});

test('the resolution fade is not ready while its started program compiles, and then is', () => {
  const gl = fakeGL({ done: false });
  const t = warmFade(gl);
  assert.ok(t);
  assert.equal(fadeReady(gl), false);
  assert.equal(t.done(), false);
  gl.done = true;
  assert.equal(fadeReady(gl), true);
  assert.equal(t.done(), true);
});

test('the figure starts every helper program at setup, and its present variants never compile in a frame', () => {
  const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(src, /prestartOrganStack\(gl\)/);
  assert.match(src, /auxStart\('lay'\)/);
  assert.match(src, /warmFade\(gl\)/);
  // (upscale and pinch reuse fall back to the plain copy / shading while compiling)
  assert.match(src, /auxTake\('up', false\)/);
  assert.match(src, /auxTake\('reuse', false\)/);
  const glass = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.match(glass, /h\.warmIn\?\.\(warmTask\(h\.gl\)\)/);
  const field = readFileSync(new URL('../src/ui/field-gl.js', import.meta.url), 'utf8');
  assert.match(field, /compileDone\(gl, \[started\]\)/);
});
