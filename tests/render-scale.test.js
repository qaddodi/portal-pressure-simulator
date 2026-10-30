// Figure resolution (29 Oct, an experiment): one Settings row, shown in the app and in a talk, that draws the figure's canvases
// at a share of their pixels. Words are not on those canvases, so they stay sharp. Full (1) changes nothing.
// 30 Oct: Auto, While moving, Glows, Size cap and Adapt, all off until chosen; every change eases (res-fade.js), nothing snaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const main = src('main.js');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

test('one Figure resolution row, ahead of the block a talk leaves out', () => {
  assert.equal(settings.split("'Figure resolution'").length - 1, 1);
  assert.ok(settings.indexOf("'Figure resolution'") < settings.indexOf('...(talk ? [] : ['), 'a talk shows it too');
  assert.match(settings, /figSeg\(RENDER_SCALES, renderSetting, setRenderScale/);
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
  const stage = src('stage.js');
  assert.match(stage, /vdpr = base \* figShare\(r\.width, r\.height, base\);/);
  assert.match(stage, /let k = \(renderSetting\(\) === 'auto' \? autoK : renderScale\(\)\) \* \(moveLow \? figOpt\('move'\) : 1\) \* adaptK;/);
  assert.match(stage, /onRenderScale\(\(\) => \{ autoK = autoNow\(\); moveLow = false; adaptK = 1; moveGaps = \[\]; easeRes\(\); veinsDirty = true; forceDraw = true; stageWake\(\); settleRes\(\); \}\)/);
  assert.equal(src('lobule-zoom.js').split('* lzScale()').length - 1, 5);
  assert.equal(src('sinusoid-view.js').split('* svScale()').length - 1, 1);
  for (const f of ['util.js', 'label-gl.js', 'glass-gl.js', 'instruments.js']) assert.ok(!src(f).includes('renderScale'), f);
});

test('the lobule and the sinusoid take a change up only while hidden, so their picture never snaps on screen', () => {
  assert.match(src('lobule-zoom.js'), /const lzScale = \(\) => \(fade > 0 \? lzK : \(lzK = renderScale\(\)\)\);/);
  assert.match(src('sinusoid-view.js'), /const svScale = \(\) => \(shown > 0 \? svK : \(svK = renderScale\(\)\)\);/);
});

test('Auto: 1/zoom past the home framing, in steps down to 10%, changed only once the view settles', () => {
  const stage = src('stage.js');
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
  assert.match(fn, /vtGliding/);
  assert.match(fn, /if \(k === autoK && !moveLow && a === adaptK\) return;/, 'no reallocation unless the share changes');
  assert.match(fn, /autoK = k; moveLow = false; easeRes\(\);/, 'and that change eases');
  assert.match(stage, /settleRes\(\); {3}\/\/ \(the view moved/);
  assert.match(main, /v === 'auto' \? 'Auto'/);
});

test('every resize for a share goes through easeRes; the copy is laid over first, then the canvas is resized', () => {
  const stage = src('stage.js');
  const fn = stage.slice(stage.indexOf('function easeRes('), stage.indexOf('// (The canvas\'s share of its pixels:'));
  assert.ok(fn.indexOf('fadeOver(vCanvas, resFollow)') < fn.indexOf('resizeCanvas()'), 'copied before the resize clears it');
  assert.ok(!/moveLow = true; resizeCanvas\(\)/.test(stage) && !/autoK = k; moveLow = false; resizeCanvas\(\)/.test(stage), 'no share change resizes without the fade');
  assert.match(src('../../styles/app.css'), /\.stage-view\.in-lobule \.res-fade/);
});

test('resFollow: the old picture moves from the transform it was drawn in to the one drawn now', () => {
  const stage = src('stage.js');
  const body = stage.slice(stage.indexOf('function resFollow('), stage.indexOf('function easeRes('));
  const follow = (m0, m1) => new Function('fadeM0', 'glM', `${body}; return resFollow();`)(m0, m1);
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
  assert.match(rf, /const src = was \? was\.cv : canvas;/, 'a second change starts from the mix as it shows');
  assert.match(rf, /canvas\.style\.opacity = '0';/, 'the canvas hides under the mix, not under a copy laid over it');
});

test('the further options: all off by default, stored, and each one heard', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=opts${Date.now()}`);
  assert.deepEqual(f.FIG_OPTS, { move: [1, 0.75, 0.5, 0.25], glow: [1, 0.5, 0.25], cap: [0, 8, 4, 2], adapt: [false, true], floor: [0.1, 0.25, 0.5] });
  for (const [k, v] of Object.entries({ move: 1, glow: 1, cap: 0, adapt: false, floor: 0.1 })) assert.equal(f.figOpt(k), v, `${k} off by default`);
  let heard = 0;
  f.onRenderScale(() => heard++);
  f.setFigOpt('move', 0.5); f.setFigOpt('glow', 0.25); f.setFigOpt('cap', 4); f.setFigOpt('adapt', true);
  f.setFigOpt('move', 0.3); f.setFigOpt('nope', 1); f.setFigOpt('cap', 4);   // (not choices, or no change: not heard)
  assert.equal(heard, 4);
  assert.deepEqual(['move', 'glow', 'cap', 'adapt'].map((k) => store.get(`pps.fig.${k}`)), ['0.5', '0.25', '4', 'true']);
  f.setFigOpt('adapt', false); f.setFigOpt('cap', 0);
  assert.ok(!store.has('pps.fig.adapt') && !store.has('pps.fig.cap'), 'off stores nothing');
  delete globalThis.localStorage;
});

test('figShare: the setting, While moving, Adapt and Size cap together', () => {
  const stage = src('stage.js');
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
  assert.equal(make({ set: 0.25, adaptK: 0.25, moving: true, opts: { move: 0.25 } })(1000, 800, 2), 0.1, 'never under a tenth');
});

test('While moving drops the canvas once per move and back once it settles; the plate picture waits for rest', () => {
  const stage = src('stage.js');
  const vt = stage.slice(stage.indexOf('const applyVT = () => {'), stage.indexOf('function syncView()'));
  assert.match(vt, /if \(resizeReady && !moveLow && figOpt\('move'\) < 1\) \{ moveLow = true; easeRes\(\); settleRes\(\); \}/);
  assert.match(stage, /if \(moveLow\) \{ plateSettle = setTimeout\(settled, 120\); return; \}/);
  assert.ok(stage.indexOf('let glM = null') < stage.indexOf('const applyVT = () => {'), 'declared before applyVT can read it');
});

test('Adapt: one step a move, down when frames ran half again as long as the fastest, up when they kept pace', () => {
  const stage = src('stage.js');
  const body = stage.slice(stage.indexOf('function adaptStep('), stage.indexOf('function noteMoveFrame('));
  const run = (gaps, k0, fast = Infinity, on = true) => new Function('figOpt', 'AUTO_STEPS', 'g0', 'k0', 'f0', `let moveGaps = g0, adaptK = k0, fastGap = f0; ${body}; adaptStep(); return [adaptK, fastGap, moveGaps.length];`)(
    () => on, [1, 0.75, 0.5, 0.35, 0.25, 0.18, 0.14, 0.1], gaps, k0, fast);
  const steady = (ms, n = 40) => Array(n).fill(ms);
  assert.deepEqual(run(steady(8.3), 1), [1, 8.3, 0], 'keeping pace at Full: stays');
  assert.equal(run(steady(25), 1, 8.3)[0], 0.75, 'slow: one step down');
  assert.equal(run(steady(25), 0.25, 8.3)[0], 0.25, 'never under 25%');
  assert.equal(run(steady(8.5), 0.5, 8.3)[0], 0.75, 'kept pace: one step up');
  assert.equal(run(steady(25, 5), 1, 8.3)[0], 1, 'too few frames: no step');
  assert.equal(run(steady(25), 0.5, 8.3, false)[0], 1, 'off: Full');
});

test('Glows: the two glow layers at their own share, read filtered; the outlines and Full unchanged', () => {
  const gl = src('veins-gl.js');
  assert.match(gl, /if \(glowOn == 1\) pl = over\(pl, texelFetch\(glowL, ip, 0\)\);\n.*\n\s*else if \(glowOn == 2\)/);
  assert.match(gl, /else if \(warmOn == 2\)/);
  assert.match(gl, /gl\.uniform1i\(U\.glowOn, glow \? \(layerK < 1 \? 2 : 1\) : 0\)/);
  assert.match(gl, /const k = L\.k \? layerK : 1/);
  assert.match(gl, /for \(const L of \[glowLayer, warmLayer\]\) \{ L\.k = 1;/, 'only the glow layers, not the outlines');
  assert.match(gl, /setLayerScale\(k\) \{[^}]*glowKey = warmKey = '';/);
});

test('Settings: the four further rows, in the menu a talk shows too', () => {
  for (const t of ["'Auto’s lowest resolution'", "'Resolution while moving'", "'Glow resolution'", "'Figure size cap'", "'Adapt to frame rate'"]) {
    assert.equal(settings.split(t).length - 1, 1, t);
    assert.ok(settings.indexOf(t) < settings.indexOf('...(talk ? [] : ['), `${t}: a talk shows it too`);
  }
});

test('Auto’s lowest: Auto never goes under the chosen floor (10% unless chosen)', () => {
  const stage = src('stage.js');
  const steps = JSON.parse(stage.match(/const AUTO_STEPS = (\[[^\]]+\])/)[1]);
  const body = stage.match(/const autoScale = (\(zoom\) => \{[^\n]+\});/)[1];
  const now = stage.match(/const autoNow = (\(\) => [^\n]+\));/)[1];
  const run = (zoom, floor, set = 'auto') => new Function('AUTO_STEPS', 'renderSetting', 'figOpt', 'vt', 'homeAt', `const autoScale = ${body}; return (${now})();`)(
    steps, () => set, () => floor, { k: zoom }, { k: 1 });
  assert.equal(run(20, 0.1), 0.1);
  assert.equal(run(20, 0.25), 0.25);
  assert.equal(run(20, 0.5), 0.5);
  assert.equal(run(3, 0.5), 0.5);
  assert.equal(run(1, 0.5), 1, 'zoomed out: still Full');
  assert.equal(run(20, 0.1, 1), 1, 'not Auto: no step');
  for (const f of [0.1, 0.25, 0.5]) assert.ok(steps.includes(f), `${f} is one of Auto's steps`);
});

// (Mohammad, 30 Oct: the figure brightened mid-fade. The old copy laid over the new canvas at opacity a gave a·old + (1 − a·α)·new,
// so every translucent pixel (a glow, an organ) showed more of both; the mix now weights them a and 1 − a, adding to exactly 1.)
test('res-fade mixes old × a + new × (1 − a): a translucent pixel keeps its brightness all through the fade', async () => {
  const { mixInto, fadeAlpha } = await import('../src/ui/res-fade.js');
  // A one-pixel 2D context that composites premultiplied RGBA as a canvas does (source-over and lighter).
  const px = (r, g, b, a) => ({ width: 1, height: 1, offsetWidth: 1, offsetHeight: 1, px: [r * a, g * a, b * a, a] });
  const ctx = () => {
    const c = { buf: [0, 0, 0, 0], globalAlpha: 1, globalCompositeOperation: 'source-over' };
    c.setTransform = () => {}; c.clearRect = () => { c.buf = [0, 0, 0, 0]; };
    c.drawImage = (img) => {
      const s = img.px.map((v) => v * c.globalAlpha);
      c.buf = c.globalCompositeOperation === 'lighter' ? c.buf.map((v, i) => Math.min(1, v + s[i])) : c.buf.map((v, i) => s[i] + v * (1 - s[3]));
    };
    return c;
  };
  const glow = px(1, 0.8, 0.3, 0.4);   // (the same translucent glow before and after: nothing should change)
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const c = ctx();
    mixInto(c, { width: 1, height: 1 }, glow, glow, fadeAlpha(u), null);
    c.buf.forEach((v, i) => assert.ok(Math.abs(v - glow.px[i]) < 1e-9, `u ${u}: channel ${i} ${v} vs ${glow.px[i]}`));
  }
  // And between two pictures the result is the weighted sum, never more than either at full.
  const a = px(1, 1, 1, 0.3), b = px(1, 1, 1, 0.6), c = ctx();
  mixInto(c, { width: 1, height: 1 }, a, b, 0.5, null);
  assert.ok(Math.abs(c.buf[3] - 0.45) < 1e-9);
});
