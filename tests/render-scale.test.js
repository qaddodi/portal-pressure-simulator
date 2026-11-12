import { stageSource } from './stage-src.js';
// Figure resolution (29 Oct, an experiment): one Settings row, shown in the app and in a talk, that draws the figure's canvases
// at a share of their pixels. Words are not on those canvases, so they stay sharp. Full (1) changes nothing.
// 30 Oct: Auto, While moving, Glows, Size cap and Adapt, all off until chosen; every change eases (res-fade.js), nothing snaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const main = src('main.js');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

// (31 Oct, premium-feel R14: the Figure resolution row and its four further rows are no longer in Settings; the machinery below stays, at its defaults.
// tests/settings-product.test.js pins that they are gone and that what a build stored for them is cleared at start.)
test('no Figure resolution row in Settings: the resolution stays at Full', () => {
  assert.equal(settings.split("'Figure resolution'").length - 1, 0);
  assert.doesNotMatch(settings, /figSeg|RENDER_SCALES|renderSetting|setRenderScale/);
});

test('the scales, the stored value and the listeners', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=${Date.now()}`);
  assert.deepEqual(f.RENDER_SCALES, ['auto', 1, 0.75, 0.5, 0.25]);
  assert.equal(f.renderScale(), 1, 'Full by default');
  const seen = [];
  f.onRenderScale((k) => seen.push(k));
  f.setRenderScale(0.5);
  assert.equal(f.renderScale(), 0.5);
  assert.equal(store.get('pps.renderScale'), '0.5');
  f.setRenderScale(0.3);   // (not a choice: ignored)
  f.setRenderScale(0.5);   // (no change: no call)
  f.setRenderScale('auto');
  assert.equal(f.renderSetting(), 'auto');
  assert.equal(f.renderScale(), 1, 'Auto leaves the lobule and the sinusoid at Full');
  assert.equal(store.get('pps.renderScale'), 'auto');
  f.setRenderScale(1);
  assert.equal(store.has('pps.renderScale'), false, 'Full stores nothing');
  assert.deepEqual(seen, [0.5, 'auto', 1]);
  delete globalThis.localStorage;
});

test('the anatomy canvas, the lobule and the sinusoid read it; the instruments and labels do not', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  assert.match(stage, /(?:live\.)?vdpr = base \* figShare\(r\.width, r\.height, base\);/);
  assert.match(stage, /let k = \(renderSetting\(\) === 'auto' \? (?:live\.)?(?:live\.)?autoK : renderScale\(\)\) \* \((?:live\.)?(?:live\.)?moveLow \? figOpt\('move'\) : 1\) \* (?:live\.)?(?:live\.)?adaptK;/);
  assert.match(stage, /onRenderScale\(\(\) => \{ (?:live\.)?autoK = autoNow\(\); (?:live\.)?moveLow = false; (?:live\.)?adaptK = 1; moveGaps\.length = 0; easeRes\(\); (?:live\.)?veinsDirty = true; (?:live\.)?forceDraw = true; (?:live\.)?stageWake\(\); settleRes\(\); \}\)/);
  assert.equal(src('lobule-zoom.js').split('* lzScale()').length - 1, 6);   // (a sixth reader joined the five below; draw; paintAhead reads draw's own; spareMake; rimOnGPU, the dive's rim drawn on the GPU; buildWideGL, the wide copy on the GPU. The 2D ones went 1 Nov)
  assert.equal(src('sinusoid-view.js').split('* svScale()').length - 1, 2);
  for (const f of ['util.js', 'label-gl.js', 'glass-gl.js', 'instruments.js']) assert.ok(!src(f).includes('renderScale'), f);
});

test('the lobule and the sinusoid take a change up while hidden and as they open, and ease one made while they show', () => {
  const lz = src('lobule-zoom.js'), sv = src('sinusoid-view.js');
  assert.match(lz, /const lzScale = \(\) => lzK;/);
  assert.match(lz, /if \(fade <= 0\) \{ lzK = k; lzWant = null; return; \}/, 'a change made while hidden is taken up at once');
  assert.match(lz, /lzWant = k === lzK \? null : k;/, 'one made while it shows waits for resSwap (none when the share is the same)');
  assert.match(lz, /if \(fade > 0 && was === 0\) \{ lzK = renderScale\(\); lzWant = null; \}/, 'and as it opens: never a share from before');
  assert.match(sv, /const svScale = \(\) => svK;/);
  assert.match(sv, /if \(!\(shown > 0\)\) \{ svK = k; svWant = null; return; \}/);
  assert.match(sv, /svWant = k === svK \? null : k;/);
  assert.match(sv, /if \(opacity > 0 && was <= 0\) \{\n\s*svK = renderScale\(\); svWant = null;/);
});

test('Auto: 1/zoom past the home framing, in steps down to 10%, changed only once the view settles', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const steps = stage.match(/const AUTO_STEPS = (\[[^\]]+\])/)[1];
  const body = stage.match(/const autoScale = (\(zoom\) => \{[^\n]+\});/)[1];
  const autoScale = new Function('AUTO_STEPS', `return ${body}`)(JSON.parse(steps));
  assert.equal(autoScale(0.6), 1, 'zoomed out: Full');
  assert.equal(autoScale(1), 1);
  assert.equal(autoScale(1.3), 1, 'never below 1/zoom');
  assert.equal(autoScale(2), 0.5);
  assert.equal(autoScale(3), 0.35);
  assert.equal(autoScale(4), 0.25);
  assert.equal(autoScale(10), 0.1);
  assert.equal(autoScale(40), 0.1, 'never under 10%');
  const fn = stage.slice(stage.indexOf('function settleRes('), stage.indexOf('// Every change of the share eases'));
  assert.match(fn, /leftAlone\(280\)/, 'not while a finger or a glide is moving the view');
  assert.match(fn, /(?:live\.)?vtGliding/);
  assert.match(fn, /if \(k === (?:live\.)?autoK && !(?:live\.)?moveLow && a === (?:live\.)?adaptK\) return;/, 'no reallocation unless the share changes');
  assert.match(fn, /(?:live\.)?autoK = k; (?:live\.)?moveLow = false; easeRes\(\);/, 'and that change eases');
  assert.match(stage, /settleRes\(\); {3}\/\/ \(the view moved/);
});

test('every resize for a share goes through easeRes; the copy is laid over first, then the canvas is resized', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const fn = stage.slice(stage.indexOf('function easeRes('), stage.indexOf('// (The canvas\'s share of its pixels:'));
  const at = fn.indexOf('fadeOver(vCanvas, resFollow, veinsPresent, veins && !veins.lost ? veins.top : null, fadeBox)');
  assert.ok(at >= 0 && at < fn.indexOf('resizeCanvas()'), 'copied before the resize clears it, the kept picture put on the canvas for each read');
  assert.ok(!/moveLow = true; resizeCanvas\(\)/.test(stage) && !/autoK = k; moveLow = false; resizeCanvas\(\)/.test(stage), 'no share change resizes without the fade');
  assert.match(src('../../styles/app.css'), /\.stage-view\.in-lobule \.res-fade/);
});

test('resFollow: the old picture moves from the transform it was drawn in to the one drawn now', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const body = stage.slice(stage.indexOf('function resFollow('), stage.indexOf('function easeRes('));
  const follow = (m0, m1) => new Function('fadeM0', 'glM', 'resFollowOut', `${body}; return resFollow();`)(m0, m1, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(follow([2, 0, 0, 2, 10, 20], [2, 0, 0, 2, 10, 20]), [1, 0, 0, 1, 0, 0]);
  // (zoomed in twice and panned: a world point drawn at p then is at 2p + t now)
  assert.deepEqual(follow([1, 0, 0, 1, 5, 5], [2, 0, 0, 2, 3, -4]), [2, 0, 0, 2, -7, -14]);
  assert.equal(follow(null, [1, 0, 0, 1, 0, 0]), null);
});

test('res-fade: the opacity eases 1 → 0 with no step at either end', async () => {
  const { fadeAlpha, FADE_MS } = await import('../src/ui/res-fade.js');
  assert.equal(fadeAlpha(0), 1); assert.equal(fadeAlpha(1), 0); assert.equal(fadeAlpha(-1), 1); assert.equal(fadeAlpha(2), 0);
  assert.ok(Math.abs(fadeAlpha(0.5) - 0.5) < 1e-9);
  assert.ok(fadeAlpha(0.01) > 0.999 && fadeAlpha(0.99) < 0.001, 'flat at both ends');
  assert.ok(FADE_MS >= 250 && FADE_MS <= 500);
  const rf = src('res-fade.js');
  assert.match(rf, /if \(was\) was\.gpu\.release\(\);/, 'a second change starts from the mix as it shows (captured with the mix still in it)');
  assert.ok(!/style\.opacity/.test(rf), 'the canvas is never hidden: the mix is made in its own presents');
});

test('the further options: all off by default but the per-device megapixel budget (1.5, or 0.5 on a phone), stored, and each one heard', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=opts${Date.now()}`);
  assert.deepEqual(f.FIG_OPTS, { move: [1, 0.75, 0.5, 0.25], glow: [1, 0.5, 0.25], cap: [8, 0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6], adapt: [false, true], floor: [0.1, 0.25, 0.5] });
  for (const [k, v] of Object.entries({ move: 1, glow: 1, cap: 1.5, adapt: false, floor: 0.1 })) assert.equal(f.figOpt(k), v, `${k} at its default (a Mac or an iPad: 1.5 MP)`);
  assert.equal(f.figDefault('cap'), 1.5); assert.equal(f.figDefault('move'), 1);
  let heard = 0;
  f.onRenderScale(() => heard++);
  f.setFigOpt('move', 0.5); f.setFigOpt('glow', 0.25); f.setFigOpt('cap', 4); f.setFigOpt('adapt', true);
  f.setFigOpt('move', 0.3); f.setFigOpt('nope', 1); f.setFigOpt('cap', 4);   // (not choices, or no change: not heard)
  assert.equal(heard, 4);
  assert.deepEqual(['move', 'glow', 'cap', 'adapt'].map((k) => store.get(`pps.fig.${k}`)), ['0.5', '0.25', '4', 'true']);
  f.setFigOpt('adapt', false); f.setFigOpt('cap', 1.5);
  assert.ok(!store.has('pps.fig.adapt') && !store.has('pps.fig.cap'), 'the default stores nothing');
  f.setFigOpt('cap', 8);
  assert.equal(store.get('pps.fig.cap'), '8', 'the old default, 8, is now a choice, stored');
  f.setFigOpt('cap', 2);
  f.setFigOpt('cap', 0);
  assert.equal(store.get('pps.fig.cap'), '0', 'no budget at all is a choice, stored');
  delete globalThis.localStorage;
});

test('figShare: the setting, While moving, Adapt and Size cap together', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const body = stage.slice(stage.indexOf('function figShare('), stage.indexOf('function resizeCanvas('));
  const make = (o) => new Function('renderSetting', 'renderScale', 'autoK', 'moveLow', 'figOpt', 'adaptK', `${body}; return figShare;`)(
    () => o.set ?? 1, () => (o.set === 'auto' ? 1 : o.set ?? 1), o.autoK ?? 1, !!o.moving, (k) => ({ move: 1, cap: 0, ...o.opts })[k], o.adaptK ?? 1);
  assert.equal(make({})(1000, 800, 2), 1, 'everything off: Full');
  assert.equal(make({ moving: true })(1000, 800, 2), 1, 'While moving off');
  assert.equal(make({ moving: true, opts: { move: 0.5 } })(1000, 800, 2), 0.5);
  assert.equal(make({ opts: { move: 0.5 } })(1000, 800, 2), 1, 'at rest: Full');
  assert.equal(make({ set: 0.5, moving: true, opts: { move: 0.5 } })(1000, 800, 2), 0.25, 'shares multiply');
  const capped = make({ opts: { cap: 2 } })(1728, 1117, 2);
  assert.ok(Math.abs(1728 * 1117 * (2 * capped) ** 2 - 2e6) < 1, 'a big screen held to the cap');
  assert.equal(make({ opts: { cap: 8 } })(390, 844, 2), 1, 'a phone is under it');
  // (The 8-megapixel budget, the default since 1 Nov 2026: the owner's devices are all under it, a 5K screen is held to it.)
  for (const [w, h] of [[1512, 982], [1728, 1117], [1180, 820], [1366, 1024], [390, 844], [430, 932]]) assert.equal(make({ opts: { cap: 8 } })(w, h, 2), 1, `${w}x${h} under the budget`);
  const big = make({ opts: { cap: 8 } })(2560, 1440, 2);
  assert.ok(Math.abs(2560 * 1440 * (2 * big) ** 2 - 8e6) < 1 && big > 0.7, 'a 5K screen held to 8 megapixels');
  assert.equal(make({ set: 0.25, adaptK: 0.25, moving: true, opts: { move: 0.25 } })(1000, 800, 2), 0.1, 'never under a tenth');
});

test('While moving drops the canvas once per move and back once it settles; the plate picture waits for rest', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const vt = stage.slice(stage.indexOf('const applyVT = () => {'), stage.indexOf('function syncView()'));
  assert.match(vt, /if \(resizeReady && !moveLow && figOpt\('move'\) < 1 && !\(diveT > 0\)\) \{ moveLow = true; easeRes\(\); settleRes\(\); \}/);
  assert.match(stage, /if \(moveLow\) \{ plateSettle = stageScope\.timer\(settled, 120\); return; \}/);
  assert.ok(stage.indexOf('let glM = null') < stage.indexOf('const applyVT = () => {'), 'declared before applyVT can read it');
});

test('Adapt: one step a move, down when frames ran half again as long as the fastest, up when they kept pace', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const body = stage.slice(stage.indexOf('function adaptStep('), stage.indexOf('function noteMoveFrame('));
  const run = (gaps, k0, fast = null, on = true) => new Function('figOpt', 'AUTO_STEPS', 'g0', 'k0', 'f0', `let moveGaps = g0, adaptK = k0, fastGap = Infinity, fastGaps = f0; const moveGapsSorted = [], byValue = (a, b) => a - b; ${body}; adaptStep(); return [adaptK, fastGap, moveGaps.length];`)(
    () => on, [1, 0.75, 0.5, 0.35, 0.25, 0.18, 0.14, 0.1], gaps, k0, fast == null ? [] : [fast]);
  const steady = (ms, n = 40) => Array(n).fill(ms);
  assert.deepEqual(run(steady(8.3), 1), [1, 8.3, 0], 'keeping pace at Full: stays');
  assert.equal(run(steady(25), 1, 8.3)[0], 0.75, 'slow: one step down');
  assert.equal(run(steady(25), 0.25, 8.3)[0], 0.25, 'never under 25%');
  assert.equal(run(steady(8.5), 0.5, 8.3)[0], 0.75, 'kept pace: one step up');
  assert.equal(run(steady(25, 5), 1, 8.3)[0], 1, 'too few frames: no step');
  assert.equal(run(steady(25), 0.5, 8.3, false)[0], 1, 'off: Full');
});

test('Glows: under Full the glow lines go to a smaller target and are stretched into the layer; the composite shader is untouched', () => {
  const gl = src('veins-gl.js');
  assert.ok(!/glowOn == 2|warmOn == 2|texture\(glowL|texture\(warmL/.test(gl), 'the shader reads the glow layers as it always has');
  assert.match(gl, /UC\.i1\(U\.glowOn, glow \? 1 : 0\);/);
  assert.match(gl, /UC\.i1\(U\.warmOn, warm \? 1 : 0\);/);
  assert.match(gl, /if \(layerK < 1 && L !== lineLayer\) \{ renderLayerLow\(L, m, soft, warm\); return; \}/, 'at Full the layer is drawn as before');
  assert.match(gl, /gl\.blitFramebuffer\(0, 0, w, h, 0, 0, L\.w, L\.h, gl\.COLOR_BUFFER_BIT, gl\.LINEAR\);/);
  assert.match(gl, /setLayerScale\(k\) \{[\s\S]*?glowKV = warmKV = -1;/);
  assert.ok(!/TEXTURE_MIN_FILTER, gl\.LINEAR\); gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MAG_FILTER, gl\.LINEAR\); \}/.test(gl), 'no filter change on the layers');
});

test('Settings: none of the four further rows, nor Adapt to frame rate', () => {
  for (const t of ["'Auto’s lowest resolution'", "'Resolution while moving'", "'Glow resolution'", "'Figure size cap'", "'Adapt to frame rate'"]) assert.equal(settings.split(t).length - 1, 0, t);
});

test('Auto’s lowest: Auto never goes under the chosen floor (10% unless chosen)', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const steps = JSON.parse(stage.match(/const AUTO_STEPS = (\[[^\]]+\])/)[1]);
  const body = stage.match(/const autoScale = (\(zoom\) => \{[^\n]+\});/)[1];
  const now = stage.match(/const autoNow = (\(cur = 0\) => [^\n]+\));/)[1];
  const sticky = stage.slice(stage.indexOf('const AUTO_HOLD'), stage.indexOf("// (Auto's step for the view now"));
  const run = (zoom, floor, set = 'auto') => new Function('AUTO_STEPS', 'renderSetting', 'figOpt', 'vt', 'homeAt', `const autoScale = ${body}; ${sticky} return (${now})();`)(
    steps, () => set, () => floor, { k: zoom }, { k: 1 });
  assert.equal(run(20, 0.1), 0.1);
  assert.equal(run(20, 0.25), 0.25);
  assert.equal(run(20, 0.5), 0.5);
  assert.equal(run(3, 0.5), 0.5);
  assert.equal(run(1, 0.5), 1, 'zoomed out: still Full');
  assert.equal(run(20, 0.1, 1), 1, 'not Auto: no step');
  for (const f of [0.1, 0.25, 0.5]) assert.ok(steps.includes(f), `${f} is one of Auto's steps`);
});

// (Mohammad, 30 Oct: the figure brightened mid-fade. The mix weights old and new a and 1 − a, adding to exactly 1: since 1 Nov it is
// made only on the GPU, a constant-alpha blend inside the canvas's presents, the new picture whole outside the old one's rectangle.)
test('res-fade mixes old × a + new × (1 − a) on the GPU, the new picture whole outside the old one', () => {
  const gl = src('res-fade-gl.js');
  assert.match(gl, /gl\.blendColor\(0, 0, 0, a\); gl\.blendFunc\(gl\.CONSTANT_ALPHA, gl\.ONE_MINUS_CONSTANT_ALPHA\);/);
  assert.ok(!/mixInto|drawImage/.test(src('res-fade.js')), 'no 2D mix left');
});

test('Adapt learns the screen again: after a few moves at 60 a second, 60 is the pace, and the figure steps back up', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const body = stage.slice(stage.indexOf('function adaptStep('), stage.indexOf('function noteMoveFrame('));
  const sim = new Function('figOpt', 'AUTO_STEPS', `let moveGaps = [], adaptK = 1, fastGap = Infinity, fastGaps = []; const moveGapsSorted = [], byValue = (a, b) => a - b; ${body};
    const move = (ms) => { moveGaps = Array(40).fill(ms); adaptStep(); return adaptK; };
    return { move, k: () => adaptK, fast: () => fastGap };`)(() => true, [1, 0.75, 0.5, 0.35, 0.25, 0.18, 0.14, 0.1]);
  sim.move(8.3);   // (a 120 Hz screen)
  for (let i = 0; i < 6; i++) sim.move(16.7);   // (then 60 a second, steadily)
  assert.ok(Math.abs(sim.fast() - 16.7) < 1e-9, 'the pace is learned again');
  let k = sim.k(), n = 0;
  while (k < 1 && n < 8) { k = sim.move(16.7); n++; }
  assert.equal(k, 1, 'and keeping up with it, back at Full, one step a move');
  assert.ok(n <= 4);
});

test('Below Full the canvas is moved by the part of a canvas pixel the renderer rounds off; at Full nothing is set; under a larger canvas the upscale pass takes the rest', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const body = stage.slice(stage.indexOf('function subPixel('), stage.indexOf('function easeRes('));
  const veins = { overlay: { snap: null }, rest: null, setRest(x, y) { this.rest = [x, y]; } };
  const run = (vdpr, vBase, T, picNow = null, v = veins) => { const vCanvas = { style: { translate: '' } }; new Function('vdpr', 'vBase', 'vCanvas', 'veins', 'picNow', `${body}; subPixel(T);`.replace('subPixel(T);', 'subPixel(arguments[5]);'))(vdpr, vBase, vCanvas, v, picNow, T); return vCanvas.style.translate; };
  assert.equal(run(2, 2, [1, 0, 0, 1, 10.4, 3.25]), '', 'Full: as on the live site');
  assert.equal(veins.overlay.snap, false, 'Full: the overlays at the figure\'s own transform');
  run(0.5, 2, [1, 0, 0, 1, 10.4, 3.25]);
  assert.equal(veins.overlay.snap, true, 'below Full: the overlays at whole pixels, moved with the vessels');
  assert.equal(run(0.5, 2, [1, 0, 0, 1, 10.4, 3.25]), '0.800px 0.500px', 'the rest of a canvas pixel, in CSS px');
  assert.equal(run(0.5, 2, [1, 0, 0, 1, 10, 3]), '');
  assert.deepEqual(veins.rest, [0, 0], 'the picture is the canvas: no rest for the upscale pass');
  // (A picture under the canvas's size (rec 1, 11 Nov 2026): the canvas is not moved, so the labels and glass drawn in it stay where the layout puts them; the picture is moved by the rest in the upscale pass.)
  assert.equal(run(0.5, 2, [1, 0, 0, 1, 10.25, 3.5], [100, 80]), '', 'the canvas stays');
  assert.deepEqual(veins.rest, [0.25, -0.5], 'the rest, in picture px');
  assert.equal(veins.overlay.snap, true);
  assert.equal(run(2, 2, [1, 0, 0, 1, 10.25, 3], [100, 80]), '', 'also at the picture\'s Full: the canvas is larger than it');
  assert.ok(Math.abs(veins.rest[0] - 0.25) < 1e-9);
  assert.equal(run(0.5, 2, [1, 0, 0, 1, 10.4, 3.25], [100, 80], { overlay: { snap: null } }), '0.800px 0.500px', 'a renderer with no setRest keeps the canvas move');
  assert.match(stage, /subPixel\(T\);\n/);
});

test('A dive takes the canvas over at once from a resolution fade', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const fade = stage.slice(stage.indexOf('function setDiveFade('), stage.indexOf('function setDiveFade(') + 600);
  assert.ok(fade.indexOf('fadeStop(vCanvas)') > 0 && fade.indexOf('fadeStop(vCanvas)') < fade.indexOf('const els = diveEls();'));
  assert.match(stage, /el\.style\.transformOrigin = b\[i\]\[1\]; \}\n\s*fadeStop\(vCanvas\);/);
  assert.match(src('res-fade.js'), /export function fadeStop\(canvas\) \{ const f = fades\.get\(canvas\); if \(f\) endGpu\(canvas, f\); \}/);
});

test('Auto keeps its step near an edge: no flip between 75% and 50% when the zoom is let go about 2×', () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const steps = JSON.parse(stage.match(/const AUTO_STEPS = (\[[^\]]+\])/)[1]);
  const body = stage.match(/const autoScale = (\(zoom\) => \{[^\n]+\});/)[1];
  const sticky = stage.slice(stage.indexOf('const AUTO_HOLD'), stage.indexOf("// (Auto's step for the view now"));
  const f = new Function('AUTO_STEPS', `const autoScale = ${body}; ${sticky} return { autoScale, autoSticky };`)(steps);
  assert.equal(f.autoSticky(2.02, 0.75), 0.75, 'just past 2× from 75%: stays');
  assert.equal(f.autoSticky(1.98, 0.5), 0.5, 'just under 2× from 50%: stays');
  assert.equal(f.autoSticky(2.3, 0.75), 0.5, 'clearly past: steps');
  assert.equal(f.autoSticky(1.7, 0.5), 0.75, 'clearly back: steps');
  assert.equal(f.autoSticky(1.2, 0.5), 1, 'far back: to the step the zoom asks for');
  for (const z of [0.8, 1, 1.5, 2, 3, 4, 7, 12]) assert.equal(f.autoSticky(z, 0), f.autoScale(z), `from nothing (a new setting): the table's own step at ${z}×`);
  // (The table and its edges unchanged: 75% from 1.34×.)
  assert.equal(f.autoScale(1.34), 0.75);
  assert.match(stage, /const k = autoNow\((?:live\.)?(?:live\.)?autoK\), a = (?:live\.)?(?:live\.)?adaptK;/);
});

// (Mohammad, 30 Oct: "no resolution drop unless I choose to".)
test('Full with every option off and the 8-megapixel budget chosen: the canvas at the screen’s own density (up to 2×) up to the budget', async () => {
  const stage = stageSource().replace(/\blive\./g, '');   // (the stage's shared lets read live.x in a part; judged here by their names)
  const body = stage.slice(stage.indexOf('function figShare('), stage.indexOf('function resizeCanvas('));
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=full${Date.now()}`);
  f.setFigOpt('cap', 8);   // (the device default is 2 MP since 11 Nov 2026; this test is about the 8 MP step)
  const share = new Function('renderSetting', 'renderScale', 'autoK', 'moveLow', 'figOpt', 'adaptK', `${body}; return figShare;`)(f.renderSetting, f.renderScale, 1, false, f.figOpt, 1);
  for (const [w, h, dpr] of [[1728, 1117, 2], [1512, 982, 2], [1194, 802, 2], [390, 844, 3], [1920, 1080, 1]]) {
    const base = Math.min(2, dpr);
    assert.equal(base * share(w, h, base), Math.min(2, dpr), `${w}×${h} @${dpr}×`);
  }
  // (Past the 8-megapixel budget, only a large external screen: held to it, 1 Nov 2026.)
  assert.ok(Math.abs(2560 * 1440 * (2 * share(2560, 1440, 2)) ** 2 - 8e6) < 1, '2560×1440 @2× held to 8 megapixels');
  assert.equal(f.renderScale(), 1, 'the lobule and the sinusoid at Full');
  delete globalThis.localStorage;
  // (Every stage path that lowers the canvas is gated on a choice: While moving, Auto, Adapt, the cap.)
  assert.match(stage, /if \((?:live\.)?resizeReady && !(?:live\.)?moveLow && figOpt\('move'\) < 1 && !\((?:live\.)?diveT > 0\)\)/);
  assert.match(stage, /if \(renderSetting\(\) !== 'auto' && (?:live\.)?autoK === 1 && !(?:live\.)?moveLow && !figOpt\('adapt'\) && (?:live\.)?adaptK === 1\) return;/);
});

test('the figure size default is per device: 0.5 MP on a phone, 1.5 MP on a Mac and an iPad (12 Nov 2026)', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const was = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const as = async (ua, touch, tag) => {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua, maxTouchPoints: touch }, configurable: true });
    return import(`../src/ui/frame.js?t=dev${tag}${Date.now()}`);
  };
  try {
    const phone = await as('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 5, 'p');
    assert.equal(phone.figOpt('cap'), 0.5); assert.equal(phone.figDefault('cap'), 0.5); assert.equal(phone.isPhone(), true);
    const pad = await as('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5, 'i');
    assert.equal(pad.figOpt('cap'), 1.5);
    const mac = await as('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0, 'm');
    assert.equal(mac.figOpt('cap'), 1.5); assert.equal(mac.isPhone(), false);
    // a stored choice wins on any device, and the phone's own default stores nothing
    store.set('pps.fig.cap', '4');
    assert.equal((await as('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', 5, 'c')).figOpt('cap'), 4);
    store.clear();
    phone.setFigOpt('cap', 2); assert.equal(store.get('pps.fig.cap'), '2', 'a choice other than the phone default is stored');
    phone.setFigOpt('cap', 0.5); assert.ok(!store.has('pps.fig.cap'), 'the phone default stores nothing');
  } finally {
    if (was) Object.defineProperty(globalThis, 'navigator', was); else delete globalThis.navigator;
    delete globalThis.localStorage;
  }
});

test('Blur effect at load: off when stored off, off on a phone that never chose (12 Nov 2026), on when stored on or never chosen elsewhere', async () => {
  const { blurAtLoad } = await import('../src/ui/blur-guard.js');
  const root = () => { const a = new Set(); return { a, setAttribute: (k) => a.add(k), has: () => a.has('data-noglass') }; };
  const cases = [[null, true, true], [null, false, false], ['1', false, true], ['1', true, true], ['0', true, false], ['0', false, false]];
  for (const [stored, phone, off] of cases) { const r = root(); assert.equal(blurAtLoad(r, { stored, phone }), off, `${stored} ${phone}`); assert.equal(r.has(), off); }
});
