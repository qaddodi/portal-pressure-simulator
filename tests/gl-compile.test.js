import test from 'node:test';
import assert from 'node:assert/strict';
import { startProgram, compileDone, checkProgram, exerciseDraw, publishWhenDone, PUBLISH_QUIET_MS } from '../src/ui/gl-compile.js';

// A GL stand-in that logs its calls; `done` is what COMPLETION_STATUS_KHR answers, `ext` whether the extension exists.
function fakeGL({ ext = true, done = false, ok = true } = {}) {
  const log = [];
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, TEXTURE_2D: 5, FRAMEBUFFER: 6, COLOR_ATTACHMENT0: 7, RGBA: 8, UNSIGNED_BYTE: 9,
    log, done, ok,
    getExtension: (n) => (ext && n === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: 0x91b1 } : null),
    createShader: () => ({}), shaderSource: () => log.push('source'), compileShader: () => log.push('compile'),
    createProgram: () => ({}), attachShader: () => log.push('attach'), bindAttribLocation: (p, l, n) => log.push(`bind ${n}`), linkProgram: () => log.push('link'),
    getProgramParameter: (p, k) => { log.push(`param ${k}`); return k === 0x91b1 ? gl.done : gl.ok; },
    getShaderParameter: () => { log.push('shaderparam'); return gl.ok; },
    getShaderInfoLog: () => 'bad', getProgramInfoLog: () => 'worse',
    createFramebuffer: () => ({}), createTexture: () => ({}), bindTexture: () => {}, texImage2D: () => {}, bindFramebuffer: (t, f) => log.push(f ? 'fbo' : 'screen'),
    framebufferTexture2D: () => {}, viewport: () => {}, deleteFramebuffer: () => {}, deleteTexture: () => {}, isContextLost: () => false, getParameter: () => null, activeTexture: () => {},
  };
  return gl;
}

test('starting a program compiles and links without reading any status', () => {
  const gl = fakeGL();
  startProgram(gl, 'v', 'f', [['p', 0]]);
  assert.deepEqual(gl.log, ['source', 'compile', 'source', 'compile', 'attach', 'attach', 'bind p', 'link']);
});

test('a shared shader object is attached, not compiled again', () => {
  const gl = fakeGL();
  const a = startProgram(gl, 'v', 'f');
  gl.log.length = 0;
  startProgram(gl, 'v2', a.sh[1]);
  assert.equal(gl.log.filter((l) => l === 'compile').length, 1);
});

test('completion follows the extension, and is taken as done where there is none', () => {
  const h = startProgram(fakeGL(), 'v', 'f');
  assert.equal(compileDone(fakeGL({ done: false }), h), false);
  assert.equal(compileDone(fakeGL({ done: true }), h), true);
  assert.equal(compileDone(fakeGL({ ext: false }), h), true);
});

test('a failed shader or link throws its log', () => {
  const gl = fakeGL({ ok: false });
  assert.throws(() => checkProgram(gl, startProgram(gl, 'v', 'f')), /bad/);
});

test('the exercise draw runs in a throwaway framebuffer and gives the screen back', () => {
  const gl = fakeGL();
  let ran = 0;
  exerciseDraw(gl, () => { ran++; });
  assert.equal(ran, 1);
  assert.deepEqual(gl.log.filter((l) => l === 'fbo' || l === 'screen'), ['fbo', 'screen']);
});

test('publishing waits for completion, polling later ticks, and happens once', async () => {
  const gl = fakeGL({ done: false });
  const h = startProgram(gl, 'v', 'f');
  let n = 0;
  publishWhenDone(gl, [h], () => { n++; }, 50);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(n, 0, 'not while the driver is still compiling');
  gl.done = true;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(n, 1);
});

test('a cancelled publish never runs', async () => {
  const gl = fakeGL({ done: true });
  let n = 0;
  publishWhenDone(gl, [startProgram(gl, 'v', 'f')], () => { n++; })();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(n, 0);
});

test('a program that finishes mid gesture is published after it, once the page has been left alone, and the poll is not spent waiting', async () => {
  const gl = fakeGL({ done: true });
  const h = startProgram(gl, 'v', 'f');
  let n = 0, calm = false;
  const asked = [];
  publishWhenDone(gl, [h], () => { n++; }, 1, (ms) => { asked.push(ms); return calm; });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(n, 0, 'not while a hand is on the figure');
  assert.ok(asked.length > 1 && asked.every((ms) => ms === PUBLISH_QUIET_MS), 'asked again each idle moment, for the same quiet');
  calm = true;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(n, 1, 'published once it was left alone, though only one poll for completion was allowed');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(n, 1);
});

test('the extension is asked for once per context where it exists', () => {
  const gl = fakeGL();
  let asks = 0;
  const get = gl.getExtension;
  gl.getExtension = (n) => { asks++; return get(n); };
  const h = startProgram(gl, 'v', 'f');
  compileDone(gl, h); compileDone(gl, h); startProgram(gl, 'v', 'f');
  assert.equal(asks, 1);
  const none = fakeGL({ ext: false });
  let nAsks = 0;
  const g2 = none.getExtension;
  none.getExtension = (n) => { nAsks++; return g2(n); };
  compileDone(none, h); compileDone(none, h);
  assert.equal(nAsks, 2, 'a missing one is asked again (a context that came back from a loss may have it)');
});

// Where each module starts its programs and where it publishes them (source patterns: no GL in node).
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the lobule tissue, lobule field, sinusoid and the instruments start their programs and publish them later', () => {
  for (const f of ['tissue-gl', 'field-gl', 'doppler-gl', 'fibroscan-gl', 'endo-gl']) {
    const s = src(`src/ui/${f}.js`);
    assert.match(s, /startProgram\(gl, /, f);
    assert.match(s, /publishWhenDone\(gl, \[started\], /, f);
    assert.match(s, /exerciseDraw\(gl, /, f);
    assert.doesNotMatch(s, /gl\.linkProgram/, `${f} links through gl-compile.js`);
  }
  const sin = src('src/ui/sinusoid-gl.js');
  assert.match(sin, /publishWhenDone\(gl, begin\(\), ready\)/);
  assert.doesNotMatch(sin, /gl\.compileShader/);
});

test('a draw that comes before its program is published publishes it first', () => {
  assert.match(src('src/ui/tissue-gl.js'), /draw\(\{[^\n]*\}\) \{\n\s+publish\(\);\n\s+if \(this\.lost\) return false;/);
  assert.match(src('src/ui/field-gl.js'), /draw\(\{[^\n]*\}\) \{\n\s+publish\(\);\n\s+if \(this\.lost\) return false;/);
  assert.match(src('src/ui/doppler-gl.js'), /render\(\{[^\n]*\}\) \{\n\s+publish\(\);\n\s+if \(lost \|\| failed/);
  assert.match(src('src/ui/endo-gl.js'), /render\(res, st\) \{\n\s+if \(lost\) return cv;\n\s+publish\(\);/);
  // (Recs B8: a lost context is not ready, so the scope draws on the CPU, as with no WebGL.)
  assert.match(src('src/ui/endo-gl.js'), /cv\.addEventListener\('webglcontextlost', \(e\) => \{ e\.preventDefault\(\); lost = true; \}\);/);
  assert.match(src('src/ui/endo-gl.js'), /ready\(\) \{ if \(lost\) return false; publish\(\); return !!u; \},/);
  assert.match(src('src/ui/instruments.js'), /if \(gl && !gl\.ready\(\)\) \{ gl\.dispose\(\); gl = null; glKey = ''; \}/);
  assert.match(src('src/ui/fibroscan-gl.js'), /st\.publish\(\);\n\s+if \(st\.lost\) return null;/);
});

test('a failed shader hands the picture to the 2D path rather than leaving a blank', () => {
  assert.match(src('src/ui/tissue-gl.js'), /get lost\(\) \{ return lost \|\| failed/);
  assert.match(src('src/ui/field-gl.js'), /get lost\(\) \{ return lost \|\| failed/);
  assert.match(src('src/ui/doppler-gl.js'), /get lost\(\) \{ return lost \|\| failed; \}/);
  assert.match(src('src/ui/instruments.js'), /if \(gl && !gl\.ready\(\)\) \{ gl\.dispose\(\); gl = null; glKey = ''; \}/);
});

test('the label layer starts all four programs before reading any', () => {
  const s = src('src/ui/label-gl.js');
  assert.match(s, /const hp = startProgram\(gl, VS, FS\), hm = startProgram\(gl, MVS, MFS\), hr = startProgram\(gl, RVS, RFS\), ha = startProgram\(gl, AVS, AFS, \[\['aR', 0\], \['aT', 1\]\]\);/);
});
