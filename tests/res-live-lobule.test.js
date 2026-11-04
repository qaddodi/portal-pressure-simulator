// Figure resolution in the lobule and the sinusoid while they show (30 Oct, Mohammad: "I don't think the lobule and sinusoid are
// obeying resolutions? At least when I check manual 25% for example the lobule doesn't change"). A change made while either shows
// is taken up once it stands still, under the anatomy's FADE_MS smoothstep: the lobule's layers stacked into one opaque cover that
// fades out over them (lobule-zoom.js resSwap), the sinusoid's canvas mixed as the anatomy's is (sinusoid-view.js svSwap). These
// tests run the pixels of both through a model of the page and pin the code paths they rely on; Full (no change) runs none of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

const { viewFollow } = await import('../src/ui/res-fade.js');
const { coverFollow } = await import('../src/ui/res-cover-gl.js');

test('viewFollow carries the picture with a pan and a zoom, and is nothing while the view stands', () => {
  assert.equal(viewFollow({ k: 2, x: 10, y: 20 }, { k: 2, x: 10, y: 20 }), '');
  const v0 = { k: 2, x: 10, y: 20 }, v = { k: 3, x: -5, y: 40 };
  const m = viewFollow(v0, v).match(/matrix\((.+)\)/)[1].split(',').map(Number);
  for (const w of [[0, 0], [7, -3], [100, 50]]) {
    const s0 = [w[0] * v0.k + v0.x, w[1] * v0.k + v0.y], s = [w[0] * v.k + v.x, w[1] * v.k + v.y];
    assert.ok(Math.abs(m[0] * s0[0] + m[2] * s0[1] + m[4] - s[0]) < 1e-9 && Math.abs(m[1] * s0[0] + m[3] * s0[1] + m[5] - s[1]) < 1e-9, `world ${w}`);
  }
});

test('coverFollow is viewFollow over the box: the picture before is laid where the view has carried it', () => {
  const v0 = { k: 2, x: 10, y: 20 }, v = { k: 3, x: -5, y: 40 }, W = 400, H = 300;
  const css = viewFollow(v0, v).match(/matrix\((.+)\)/)[1].split(',').map(Number), m = coverFollow(v0, v, W, H);
  for (const p of [[0, 0], [120, 80], [400, 300]]) {
    const q = [css[0] * p[0] + css[2] * p[1] + css[4], css[1] * p[0] + css[3] * p[1] + css[5]];
    const u = [m[0] * p[0] / W + m[3] * p[1] / H + m[6], m[1] * p[0] / W + m[4] * p[1] / H + m[7]];
    assert.ok(Math.abs(u[0] * W - q[0]) < 1e-9 && Math.abs(u[1] * H - q[1]) < 1e-9, `${p}`);
  }
});

test('res-cover-gl.js: no context, canvas or canvas copy of its own: the figure is copied inside its context and laid as a pass (L2)', () => {
  const g = src('res-cover-gl.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/getContext|drawImage|getImageData|putImageData|texImage2D|createElement/.test(g), 'no context, no 2D canvas, no canvas taken into a texture');
  assert.match(g, /gl\.blitFramebuffer\(/, 'copied inside the GPU, no read back');
  assert.match(g, /top\.lay\(/, 'laid by the figure context\'s own laying');
  assert.match(g, /top\.add\(\{ order: LZ_COVER_ORDER/, 'a pass of the figure\'s present');
});

test('lobule-zoom.js: the change waits for a still, whole lobule, and its GPU cover never touches the layers', () => {
  const lz = src('lobule-zoom.js');
  assert.match(lz, /const resSteady = \(\) => fade > 0\.98 && !diveScaled && sinU === 0 && !sinTo && !wide && !staging && !!geo && !!model;/);
  assert.match(lz, /if \(lzWant != null && resSteady\(\)\) resSwap\(\);\n\s*const drew = draw\(moving \? dt : 0\);/, 'swapped in the loop, just before the frame is drawn');
  assert.match(lz, /if \(resCover\) resCoverStep\(now\);/);
  assert.match(lz, /\(flowA === 0 \|\| flowA === 1\) && !resCover\) \{/, 'the loop sleeps only once the cover is gone');
  assert.match(lz, /if \(lzWant != null\) coverGL\(\)\?\.prepare\(\);/, 'its program compiles when the change is asked for');
  const swap = lz.slice(lz.indexOf('function resSwap()'), lz.indexOf('function resCoverStep('));
  assert.ok(!/stackInto|getContext|drawImage|hostSize\(/.test(swap), 'no 2D stack, no layout read');
  assert.ok(swap.indexOf('g?.ready && draw(0)') < swap.indexOf('g.build()'), 'copied in the frame that drew it');
  assert.ok(swap.indexOf('g.build(') < swap.indexOf('lzK = k;'), 'at the share before');
  assert.match(lz, /function freshDraw\(\) \{ tissueKey = ''; drawKey = ''; glDirty = true; idleDrawn = ''; \}/, 'every layer drawn whole');
  assert.match(swap, /freshDraw\(\);[\s\S]*?freshDraw\(\);/, 'before the copy is made and again once the new resolution stands');
  assert.match(lz, /if \(u >= 1 \|\| diveScaled \|\| wide \|\| fade <= 0\) \{ resCoverEnd\(\); return; \}/);
  assert.match(lz, /setDiveZoom\(k, x, y, tx = x, ty = y\) \{\n\s*if \(k < 0\.9999\) resCoverEnd\(\);/, 'a dive takes it away before the layers scale');
  assert.match(lz, /function release\(\) \{\n\s*dropWide\(\);\n\s*resCoverEnd\(\);/);
  assert.match(lz, /if \(fade === 0\) \{ resCoverEnd\(\);/);
});

test('sinusoid-view.js: the change waits for the open view and is mixed on the GPU in the canvas itself (keep, mix, drop), never in 2D', () => {
  const sv = src('sinusoid-view.js'), gl = src('sinusoid-gl.js');
  assert.match(sv, /if \(!paint\) return;\n\s*if \(svWant != null && gpu && open && !dive\) svSwap\(\);/);
  const swap = sv.slice(sv.indexOf('function svSwap()'), sv.indexOf('const S = {};'));
  assert.ok(swap.indexOf("gpuKey = '';") < swap.indexOf('draw(0, false);') && swap.indexOf('draw(0, false);') < swap.indexOf('gpu.keep?.()'), 'drawn again, then kept, in one frame');
  assert.ok(!/drawImage|getContext|visibility|mixInto|SV_MIX/.test(swap), 'no 2D canvas, the canvas stays shown');
  assert.ok(!/svmix|SV_MIX|mixInto/.test(sv));
  assert.match(sv, /const sameAsLast = go === 0 && !dive && !svFade && pictureSame\(u, n\);/, 'drawn every frame while the mix runs');
  assert.match(sv, /gpuKey = go === 0 && !dive && !svFade;\n\s*if \(svFade\) svFadeStep\(\);/, 'the mix remade right after the canvas is drawn');
  assert.match(sv, /if \(u >= 1 \|\| dive\) \{ svFadeEnd\(\); return; \}/);
  assert.match(sv, /gpu\.mix\(fadeAlpha\(u\)\);/);
  assert.match(sv, /if \(opacity <= 0 && was > 0\) \{ svFadeEnd\(\);/);
  assert.match(gl, /gl\.blendColor\(0, 0, 0, Math\.min\(1, a\)\); gl\.blendFunc\(gl\.CONSTANT_ALPHA, gl\.ONE_MINUS_CONSTANT_ALPHA\);/);
  assert.match(gl, /gl\.copyTexImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, 0, 0, canvas\.width, canvas\.height, 0\);/, 'copied inside the GPU, no read back');
});

test('the cover fades and follows the view in its own GPU draw: the canvas style is never written in a frame', async () => {
  const { coverFollowInto } = await import('../src/ui/res-cover-gl.js');
  const v0 = { k: 2, x: 10, y: 20 }, v = { k: 3, x: -5, y: 40 }, out = new Array(9);
  assert.equal(coverFollowInto(out, v0, v, 400, 300), out, 'written in place');
  assert.deepEqual(out, coverFollow(v0, v, 400, 300));
  const lz = src('lobule-zoom.js'), step = lz.slice(lz.indexOf('function resCoverStep('), lz.indexOf('function resCoverEnd('));
  assert.ok(!/\.style\b/.test(step), 'no style write in the cover step');
  assert.match(step, /resGL\?\.show\(a, m\)/);
  assert.match(step, /if \(same\) return;/, 'a frame that changed neither the weight nor the place draws nothing');
  const swap = lz.slice(lz.indexOf('function resSwap()'), lz.indexOf('function resCoverStep('));
  assert.ok(!/cv\.style\./.test(swap), 'the cover is shown whole by build(), with no style written');
  assert.match(src('res-cover-gl.js'), /show\(w, mm\) \{/);
});

test('res-cover-gl: a capture copies the figure inside its context, then the pass lays it at the weight and place given and it fades to nothing', async () => {
  const calls = [], lays = [], passes = [];
  const gl = new Proxy({}, { get: (_, k) => (k === 'isContextLost' ? () => false : (...a) => { calls.push(k); return {}; }) });
  const top = {
    gl, canvas: { width: 800, height: 600, addEventListener() {} }, screen: () => null,
    add: (t) => { passes.push(t); return () => {}; }, lay: (...a) => lays.push(a),
    present: () => { for (const t of passes) t.draw(); },
  };
  const { createResCover } = await import('../src/ui/res-cover-gl.js');
  assert.equal(createResCover(null), null, 'no figure context, no cover');
  const g = createResCover(top);
  assert.equal(g.ready, false); assert.equal(g.show(1, null), false, 'nothing kept yet');
  g.prepare(); assert.equal(passes.length, 1); assert.equal(g.ready, true);
  assert.equal(g.build(), true);
  assert.ok(calls.includes('blitFramebuffer') && !calls.includes('texImage2D') && !calls.includes('getContext'), 'copied by blit, no canvas taken in');
  assert.equal(lays.length, 0, 'the capture present lays nothing over the picture it copies');
  assert.equal(g.show(0.5, [2, 0, 0, 0, 2, 0, 0.1, 0.2, 1]), true);
  const l = lays.at(-1);
  assert.deepEqual([l[1], l[2], l[3], l[4], l[5], l[6], l[7]], [2, 0, 0, 2, 80, 120, 0.5], 'weight and place, in canvas px');
  g.show(0, null); const n = lays.length; g.present?.(); top.present(); assert.equal(lays.length, n, 'weight 0 lays nothing');
  g.drop(); const m = lays.length; top.present(); assert.equal(lays.length, m, 'dropped: nothing laid');
});

test("lobule-zoom.js: the overlay's GPU canvas is shown by what is drawn on it, never by a style written to hide or show it", () => {
  const lz = src('lobule-zoom.js');
  assert.ok(!/fxG\.style\.opacity/.test(lz), 'no opacity written to fxG');
  assert.ok(!/const fxG = h\('canvas'[^\n]*opacity/.test(lz), 'and none at its making');
  const show = lz.slice(lz.indexOf('function fxGLShow('), lz.indexOf('function fxGLOff('));
  assert.match(show, /if \(!on\) \{ fxGLKey = ''; fxGL\?\.release\(\); fxHostGL\?\.release\(\); if \(fxG\.width\) \{ fxG\.width = 0; fxG\.height = 0; \} \}/, 'given back blank when it goes off');
});

// The Safari hand-over (Mohammad, 1 Nov, iPhone): the GPU canvas shows a new frame a frame or more after the page's, so the 2D canvas under
// it must stay whole until HANDOFF_MS has passed, or the hepatocytes flash the page's dark colour (black in a dark look). Run the real
// showTissueGL against kept canvases and a fake clock.
function tissueHandoff(rimDrawn = false) {
  const lz = src('lobule-zoom.js');
  const body = lz.slice(lz.indexOf('function showTissueGL('), lz.indexOf('// The tissue on the GPU: the same picture as the 2D passes below'));
  const timers = [], cv = (name) => ({ name, width: 100, height: 80, style: {} });
  const env = { tissue: cv('tissue'), tissueG: cv('tissueG'), rimDrawn, HANDOFF_MS: 160, log: [] };
  const mk = new Function('env', `
    const { tissue, tissueG, HANDOFF_MS } = env;
    let tissueOnGL = false, handoffT = 0, rimDrawn = env.rimDrawn;
    const free = (c) => { if (c.width || c.height) { c.width = 0; c.height = 0; env.log.push('free ' + c.name); } };
    const setTimeout = (fn, ms) => { env.timers.push({ fn, ms }); return env.timers.length; };
    const clearTimeout = (id) => { if (id) env.timers[id - 1] = null; };
    ${body}
    return { showTissueGL, on: () => tissueOnGL };`);
  env.timers = timers;
  return { ...mk(env), env, timers };
}

test('lobule-zoom.js showTissueGL: the 2D canvas stays whole under the GPU canvas for HANDOFF_MS, and only then is given back (no black frame)', () => {
  const h = tissueHandoff(false);
  h.showTissueGL(true);
  assert.equal(h.on(), true);
  assert.equal(h.env.tissue.width, 100, 'the 2D picture is still there in the frame the GPU canvas takes over');
  assert.equal(h.env.log.length, 0, 'nothing given back yet');
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 160);
  h.timers[0].fn();
  assert.equal(h.env.tissue.width, 0, 'given back once the hand-over has passed');
  assert.deepEqual(h.env.log, ['free tissue']);
  assert.equal(h.env.tissueG.width, 100, 'the GPU canvas is never touched by the hand-over');
  assert.ok(!('opacity' in h.env.tissue.style) && !('opacity' in h.env.tissueG.style), 'no style written to either canvas');
});

test('lobule-zoom.js showTissueGL: a hand-over cancelled by going off keeps the 2D picture, and the GPU canvas is given back blank', () => {
  const h = tissueHandoff(false);
  h.showTissueGL(true);
  h.showTissueGL(false);
  assert.equal(h.timers[0], null, 'the pending give-back is cancelled');
  assert.equal(h.env.tissue.width, 100, 'the 2D picture is kept');
  assert.equal(h.env.tissueG.width, 0, 'the GPU canvas is blank');
});

test('lobule-zoom.js showTissueGL: under the dive\'s rim the 2D canvas is given back at once (it would show through)', () => {
  const h = tissueHandoff(true);
  h.showTissueGL(true);
  assert.equal(h.timers.length, 0);
  assert.equal(h.env.tissue.width, 0);
  assert.equal(h.env.tissueG.width, 100);
});

test('lobule-zoom.js: no style is written to hide or show the tissue canvases, and the hosted tissue is laid while it is on', () => {
  const lz = src('lobule-zoom.js');
  assert.ok(!/tissue\.style\.opacity|tissueG\.style\.opacity/.test(lz));
  assert.match(lz, /const tisUnder = \(\) => !!tissueGL && tissueGL\.pictured && \(wideBuild \? tisWide : tissueOnGL && tissueG\.style\.visibility !== 'hidden'\);/);
});
