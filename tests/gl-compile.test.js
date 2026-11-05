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
    framebufferTexture2D: () => {}, viewport: () => {}, deleteFramebuffer: () => {}, deleteTexture: () => {}, isContextLost: () => false, getParameter: () => null, activeTexture: () => {}, texParameteri: () => {},
    TEXTURE_MIN_FILTER: 10, NEAREST: 11,
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

// A GL stand-in that keeps what is bound on each unit and what the framebuffer draws to, to tell a feedback loop from a clean draw.
function bindingGL() {
  const gl = {
    TEXTURE0: 0x84C0, ACTIVE_TEXTURE: 'active', TEXTURE_BINDING_2D: 'binding', TEXTURE_2D: 5, FRAMEBUFFER: 6, COLOR_ATTACHMENT0: 7, RGBA: 8, UNSIGNED_BYTE: 9, TEXTURE_MIN_FILTER: 10, NEAREST: 11,
    unit: 0, bound: Array(16).fill(null), fb: null, attach: new Map(), deleted: [],
    createFramebuffer: () => ({ fbo: true }), createTexture: () => ({ tex: gl.deleted.length + Math.random() }),
    getParameter(k) { return k === 'active' ? gl.TEXTURE0 + gl.unit : k === 'binding' ? gl.bound[gl.unit] : null; },   // (other names: nothing bound)
    activeTexture(u) { gl.unit = u - gl.TEXTURE0; },
    bindTexture(t, x) { gl.bound[gl.unit] = x; },
    bindFramebuffer(t, f) { gl.fb = f; },
    framebufferTexture2D(t, a, tt, x) { gl.attach.set(gl.fb, x); },
    texImage2D() {}, texParameteri() {}, viewport() {}, deleteFramebuffer() {}, deleteTexture(x) { gl.deleted.push(x); },
  };
  return gl;
}

test('the exercise draw never reads the texture it draws to, and every unit\'s own binding comes back', () => {
  const gl = bindingGL();
  const mine = [{ own: 0 }, { own: 1 }, null, { own: 3 }];
  mine.forEach((t, u) => { gl.bound[u] = t; });
  gl.unit = 2;
  let seen = null;
  exerciseDraw(gl, () => {
    const target = gl.attach.get(gl.fb);
    seen = { target, sampled: gl.bound.filter((x) => x === target).length, units: gl.bound.filter((x) => x).length };
  });
  assert.ok(seen.target, 'it drew to a texture');
  assert.equal(seen.sampled, 0, 'which no unit holds: a sampler could not read what the draw writes');
  assert.equal(seen.units, 16, 'every unit has the blank texture, not nothing, so no sampler warns of an empty unit');
  mine.forEach((t, u) => assert.equal(gl.bound[u], t, `unit ${u} is as it was`));
  assert.equal(gl.bound.slice(4).every((x) => x === null), true, 'the rest are empty again');
  assert.equal(gl.unit, 2, 'and so is the active unit');
  assert.equal(gl.fb, null, 'the screen is the target again');
  assert.equal(gl.deleted.length, 2, 'the target and the blank are deleted');
});

test('the exercise draw leaves things as they were when the draw throws', () => {
  const gl = bindingGL();
  gl.bound[0] = { own: 0 };
  const before = gl.bound[0];
  exerciseDraw(gl, () => { throw new Error('driver'); });
  assert.equal(gl.bound[0], before);
  assert.equal(gl.fb, null);
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
    assert.match(s, /publishWhenDone\(gl, \[(r\.)?started(, started2)?\], /, f);
    assert.match(s, /exerciseDraw\(gl, /, f);
    assert.doesNotMatch(s, /gl\.linkProgram/, `${f} links through gl-compile.js`);
  }
  const sin = src('src/ui/sinusoid-gl.js');
  assert.match(sin, /stopPoll = publishWhenDone\(gl, begin\(\), publish\)/);
  assert.doesNotMatch(sin, /gl\.compileShader/);
});

test('a draw that comes before its program is published publishes it first', () => {
  // (The lobule's tissue and field publish it in a draw only once the driver says it is compiled: never a wait in a frame; still compiling,
  // they hold their frame or the 2D canvas draws it. shader-warm.test.js.)
  assert.match(src('src/ui/tissue-gl.js'), /if \(!ready\) return hold && pictured && tgt\.width === W && tgt\.height === H \? 'held' : false;\n\s+\}\n\s+publish\(\);\n\s+if \(this\.lost\) return false;/);
  assert.match(src('src/ui/field-gl.js'), /if \(ready\) publish\(\);\n\s+else return hold && pictured && canvas\.width === W && canvas\.height === H \? 'held' : false;\n\s+\}\n\s+if \(this\.lost \|\| !prog\) return false;/);
  // (Review pass 2: the Doppler monitor and the endoscopy field publish in a draw only once the driver says it is compiled, too.)
  assert.match(src('src/ui/doppler-gl.js'), /if \(!prog && started && stillCompiling\(gl, startedL\)\) \{ stopPoll\?\.want\?\.\(\); waitingDraw = true; return false; \}\n\s+publish\(\);\n\s+if \(lost \|\| failed/);
  assert.match(src('src/ui/endo-gl.js'), /shade\(key, ver, res, st\) \{\n\s+if \(!sync\(\)\) return false;\n\s+if \(!r\.u\) \{ if \(this\.pending\) return false; publish\(r\); if \(!r\.u\) return false; \}/);
  // (Recs B8: a lost context is not ready, so the scope draws on the CPU, as with no WebGL.)
  assert.match(src('src/ui/endo-gl.js'), /get lost\(\) \{ const e = sync\(\); if \(!e\) \{ holder\.need = true; return true; \} return false; \},/);
  assert.match(src('src/ui/endo-gl.js'), /ready\(\) \{ const e = sync\(\); if \(!e\) return false; if \(e\.u\) return true; if \(this\.pending\) return true; publish\(e\); return !!e\.u; \},/);
  // (A shader that failed is let go for the CPU renderer; a lost context is kept, for the GPU to take over again once it is built afresh.)
  assert.match(src('src/ui/instruments.js'), /if \(gl && !gl\.ready\(\) && !gl\.lost\) \{ gl\.dispose\(\); gl = null; glId = 0; noGl = true; \}/);
  assert.match(src('src/ui/fibroscan-gl.js'), /publishWhenDone\(gl, \[started, started2\], \(\) => \{\n\s+if \(G !== g \|\| gl\.isContextLost\(\)\) return;/);
});

test('a failed shader hands the picture to the 2D path rather than leaving a blank', () => {
  assert.match(src('src/ui/tissue-gl.js'), /get lost\(\) \{ return lost \|\| failed/);
  assert.match(src('src/ui/field-gl.js'), /get lost\(\) \{ return lost \|\| failed/);
  assert.match(src('src/ui/doppler-gl.js'), /get lost\(\) \{ return lost \|\| failed \|\| !gl; \},/);
  assert.match(src('src/ui/instruments.js'), /if \(gl && !gl\.ready\(\) && !gl\.lost\) \{ gl\.dispose\(\); gl = null; glId = 0; noGl = true; \}/);
});

test('the label layer starts all four programs before reading any', () => {
  const s = src('src/ui/label-gl.js');
  assert.match(s, /const hp = startProgram\(gl, VS, FS\), hm = startProgram\(gl, MVS, MFS\), hr = startProgram\(gl, RVS, RFS\), ha = startProgram\(gl, AVS, AFS, \[\['aR', 0\], \['aT', 1\], \['aI0', 2\], \['aI1', 3\], \['aI2', 4\]\]\);/);
});
