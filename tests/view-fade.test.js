// Settle and sharpen (combined plan step 12, 31 Oct): the view's sharper organ picture fades in inside the organ stack (organs-gl),
// over 350 ms (smoothstep), from what showed there before; the blood is never mixed with a still picture of itself. A stand-in GL
// logs the uniforms each layer is drawn with.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let clock = 1000;
globalThis.performance = { now: () => clock };
const { createOrganStack, VIEW_FADE_MS } = await import('../src/ui/organs-gl.js');

function fakeGL(log) {
  let id = 0;
  const gl = new Proxy({ canvas: { width: 400, height: 300 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return (_, what) => (what === 'ACTIVE_UNIFORMS' ? 0 : true);
      if (/^create/.test(k)) return () => ({ id: ++id });
      return (...a) => { log.push([k, ...a]); };
    },
  });
  return gl;
}

function setup() {
  const log = [];
  const gl = fakeGL(log);
  const watchless = globalThis.MutationObserver;
  globalThis.MutationObserver = undefined;
  const stack = createOrganStack(gl, { painter: null });
  const tex = () => gl.createTexture();
  const deleted = () => log.filter((e) => e[0] === 'deleteTexture').map((e) => e[1]);
  // (k1 and has2 as last set: one layer, so the last draw's.)
  const last = (name) => { const e = log.filter((x) => x[0] === name).at(-1); return e && e[2]; };
  const draw = () => { log.length = 0; return stack.render([1, 0, 0, 1, 0, 0], 400, 300); };
  stack.stage(0, 'gut', tex(), [0, 0, 400, 300]); stack.commit(0, ['gut']);
  return { stack, tex, draw, last, deleted, log, done: () => { globalThis.MutationObserver = watchless; } };
}

test('the first view fades in from the whole picture, a step each frame, and ends whole', () => {
  const t = setup();
  try {
    assert.equal(t.draw(), true);
    assert.equal(t.last('uniform1f'), 1, 'no view yet: as before');
    t.stack.stage(1, 'gut', t.tex(), [100, 50, 200, 150]); t.stack.commit(1, ['gut']);
    assert.equal(t.stack.fading, true);
    assert.equal(t.stack.stale([1, 0, 0, 1, 0, 0], 400, 300), true);
    assert.equal(t.draw(), true, 'the commit draws the whole');
    assert.equal(t.last('uniform1f'), 0, 'from nothing of it');
    clock += VIEW_FADE_MS / 2;
    const r = t.draw();
    assert.deepEqual(r, [100, 50, 300, 200], 'only its box drawn again');
    assert.equal(t.last('uniform1f'), 0.5, 'half way (smoothstep)');
    assert.equal(t.last('uniform1i') !== undefined, true);
    clock += VIEW_FADE_MS;
    t.draw();
    assert.equal(t.last('uniform1f'), 1, 'whole');
    assert.equal(t.stack.fading, false);
    assert.equal(t.draw(), null, 'and then nothing more to draw');
    assert.equal(t.stack.stale([1, 0, 0, 1, 0, 0], 400, 300), false);
  } finally { t.done(); }
});

test('a new view after a pan keeps the one before under it until it is whole, then gives it up', () => {
  const t = setup();
  try {
    const a = t.tex();
    t.stack.stage(1, 'gut', a, [0, 0, 200, 150]); t.stack.commit(1, ['gut']);
    t.draw(); clock += 2 * VIEW_FADE_MS; t.draw();
    const b = t.tex();
    t.stack.stage(1, 'gut', b, [150, 100, 200, 150]); t.stack.commit(1, ['gut']);
    assert.equal(t.deleted().includes(a), false, 'the view before is kept');
    t.draw();
    const has2 = t.log.filter((e) => e[0] === 'uniform1i').map((e) => e[2]);
    assert.ok(has2.includes(1), 'drawn with the view before');
    clock += VIEW_FADE_MS / 4; assert.deepEqual(t.draw(), [0, 0, 350, 250], 'over both views\' boxes');
    clock += VIEW_FADE_MS; t.draw();
    assert.equal(t.last('uniform1f'), 1);
    assert.ok(t.deleted().includes(a), 'given up once the new one is whole');
  } finally { t.done(); }
});

test('a view inside the one before (the same view drawn again) takes its place at once, as before', () => {
  const t = setup();
  try {
    t.stack.stage(1, 'gut', t.tex(), [0, 0, 300, 300]); t.stack.commit(1, ['gut']);
    t.draw(); clock += 2 * VIEW_FADE_MS; t.draw();
    t.stack.stage(1, 'gut', t.tex(), [10, 10, 200, 200]); t.stack.commit(1, ['gut']);
    assert.equal(t.stack.fading, false);
    t.draw();
    assert.equal(t.last('uniform1f'), 1);
  } finally { t.done(); }
});

test('the shader: whole as before at k1 = 1; mixed from what showed before while it fades in; the stage draws on meanwhile', async () => {
  const { readFileSync } = await import('node:fs');
  const G = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(G, /if \(in1 && k1 >= 1\.0\) o = texture\(t1, flip\.y == 1 \? vec2\(u1\.x, 1\.0 - u1\.y\) : u1\);/);
  assert.match(G, /if \(in1\) o = mix\(was, at\(t1, r1, flip\.y\), k1\);\n\s+else if \(has2 == 1\) o = mix\(was, o, k1\);/);
  assert.match(G, /export const VIEW_FADE_MS = 350;/);
  const { FADE_MS } = await import('../src/ui/res-fade.js').catch(() => ({ FADE_MS: 350 }));
  assert.equal(VIEW_FADE_MS, FADE_MS, 'the same as a resolution change');
  const ST = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(ST, /!sprayFading\(\) && !veins\?\.organs\?\.fading && !lensFrom/);
  const VG = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(VG, /get fading\(\) \{ return stack\.fading; \}/);
});
