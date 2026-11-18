// A restored WebGL context is the same object (app review R1-1 and LBL-2, 15 Nov 2026). Anything a module put ON the context, or kept of
// the lost generation, must be made once per context and again after a restore, never stacked or left pointing at dead objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const files = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);

test('only two modules put their own methods on a context, and each does it once per context (a WeakMap record)', () => {
  const owners = [];
  for (const f of files('src')) {
    const s = src(f);
    if (/\b(?:gl|ctx)\.(?:bindFramebuffer|drawArrays|drawElements|clear|blitFramebuffer|invalidateFramebuffer|deleteTexture|texImage2D)\s*=[^=]/.test(s) || /\bgl\[[a-zA-Z']+\]\s*=[^=]/.test(s)) owners.push(f);
  }
  assert.deepEqual(owners.sort(), ['src/ui/gl-state.js', 'src/ui/keep-screen.js'], 'a third module wrapping a context must be once per context too: add it here, with its own restore test');
  assert.match(src('src/ui/keep-screen.js'), /const installed = new WeakMap\(\)[\s\S]*installed\.get\(gl\)[\s\S]*installed\.set\(gl, rec\)/);
  assert.match(src('src/ui/gl-state.js'), /recs\.get\(gl\)[\s\S]*wrap\(gl, r\);\s*recs\.set\(gl, r\)/);
});

test('the stage lets the lost renderer go before it makes the new one, and the renderer lets its screen go with it', () => {
  const s = src('src/ui/stage.js');
  const i = s.indexOf("vCanvas.addEventListener('webglcontextrestored'");
  const body = s.slice(i, i + 400);
  assert.ok(body.indexOf('veins?.dispose()') > 0 && body.indexOf('veins?.dispose()') < body.indexOf('createVeinsGL('));
  assert.match(src('src/ui/veins-gl.js'), /offPresFinal\(\); screenKeep\?\.dispose\(\)/);
});

test('label-gl\'s restore forgets every framebuffer it made in the lost generation (the repack\'s read framebuffer included)', () => {
  const s = src('src/ui/label-gl.js');
  const i = s.indexOf("canvas.addEventListener('webglcontextrestored'");
  const body = s.slice(i, s.indexOf('{ signal: ac.signal }', i));
  assert.match(body, /rpDrop\(\); rpFbo = null;/, 'a stale read framebuffer is an INVALID_OPERATION bind, and the attach then lands on whatever read framebuffer is bound (the screen)');
  assert.match(body, /slotTex = null/);
  assert.match(body, /picPaint = null; lostPic\(headSp\); lostPic\(sHeadSp\)/);
  // every framebuffer label-gl keeps in a closure variable is one of those the restore resets
  const kept = [...s.matchAll(/(?<![.\w])(\w+)\s*(?:\|\|)?=\s*gl\.createFramebuffer\(\)/g)].map((m) => m[1]);
  const seen = new Set(kept.map((n) => (n === 'slotFbo' ? 'slotTex' : n)));
  for (const n of seen) assert.ok(new RegExp(`\\b${n}\\s*=\\s*null`).test(body), `${n} is reset by the restore`);
});

test('the device lap has a restore drill: the figure\'s context is lost, given back, and the lap writes down whether it drew again', async () => {
  globalThis.location ??= { search: '' };
  const lap = await import('../src/ui/lap.js');
  const route = lap.buildRoute({ loadPreset: async () => {}, presenter: { start: async () => {}, go() {}, stop() {} }, stage: {} }, () => {});
  const names = route.map((r) => r.name);
  const i = names.indexOf('figure context lost and restored');
  assert.ok(i > names.indexOf('Lobule to Anatomy') && i < names.indexOf('patient change'), names.join(' | '));
  // With nothing to lose (no canvas in node) the step writes down why instead of passing.
  await assert.rejects(() => route[i].run(), /no figure canvas|no WEBGL_lose_context/);
});
