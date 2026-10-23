import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dashRings, normalShown } from '../src/ui/highlight-math.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const fn = (name) => {
  const at = stage.indexOf(`  function ${name}(`);
  assert.ok(at >= 0, name);
  return stage.slice(at, stage.indexOf('\n  }\n', at) + 5);
};
const line = (name) => stage.split('\n').find((s) => s.trimStart().startsWith(`const ${name} =`));
const guard = '    if (!olDirty && !mk.dirty && !clampMoved && !olList.some((o) => o.a !== (o.on ? 1 : 0))) return false;';

// Execute the production outline step and its invalidators with page/GL stand-ins. The reference restores the old
// nonempty-list condition: it builds draw specs on every outlined blood frame, giving a frame-by-frame comparison.
function harness(reference = false) {
  const step = reference ? fn('olStep').replace(guard, '    if (!olDirty && !olList.length && !mk.dirty && !clampMoved) return false;') : fn('olStep');
  assert.ok(fn('olStep').includes(guard));
  return new Function('dashRings', 'normalShown', `
    let clock = 0, olList = [], olDirty = false, olLast = 0, olVerts = null, clampLast = 0;
    const performance = { now: () => clock }, glLines = true, OL_FADE = 160, CLAMP_FADE = 250;
    const calls = { specs: [], marks: 0, shades: 0, wakes: 0 };
    const veins = { setLines: (spec) => calls.specs.push(structuredClone(spec)) };
    const mk = { key: '', ver: 0, verts: new Float32Array(0), draws: [], all: null, dirty: false };
    const document = { documentElement: { dataset: { theme: 'light' } } }, darkMQ = { matches: false };
    const wrap = { className: 'stage-view gl-on' }, gestureFree = (s) => s;
    const gpuProbe = { time: (gl, name, run) => run() };
    const marksBuild = () => { calls.marks++; mk.key = marksKey(); mk.dirty = true; };
    const clampA = new Map(), clampShade = () => calls.shades++;
    const ov = { clampsOut: { querySelectorAll: () => [] } };
    const clampEase = (id) => clampA.get(id)?.a ?? 1;
    const stageWake = () => calls.wakes++;
    const OL_LOOK = { sel: [2.6, 0.7], hov: [2, 0.45], pin: [2.6, 0.6], spot: [2.6, 0.6], normal: [1.4, 0.5] };
    const SEL_GLOW = { reach: 12, alpha: 0.22 }, HEART_GLOW = { reach: 10, alpha: 0.3 };
    const WARM = { reach: 10, alpha: 0.46, taper: 20 }, GLOW_SPAN = 4, RECTUM_FADE = false;
    const olCol = [0.2, 0.45, 0.9], orgTone = () => document.documentElement.dataset.theme === 'dark' ? [0.4, 0.2, 0.1] : olCol;
    const attrs = new Map();
    const element = (id) => ({ getAttribute: (k) => attrs.get(id + ':' + k) ?? (k === 'd' ? '1' : '') });
    const organEls = Object.fromEntries(['liver', 'spleen', 'heart', 'bowel', 'colon'].map((id) => [id, element(id)]));
    const organG = organEls, svg = {}, caud = { show() {} }, getComputedStyle = () => ({}), toRGB = () => [0.3, 0.4, 0.5];
    const olRings = (id, bare) => { const x = Number(organEls[id].getAttribute('d')) + (bare ? 0 : Number(organG[id].getAttribute('transform'))); return [[[x, 0], [x + 20, 0], [x + 20, 20], [x, 0]]]; };
    const warmRings = olRings, warmSw = () => 5, warmDs = () => ['M0 0L20 20'];
    const gMatrix = () => null, warmR = () => 5, warmVis = () => [], colonGrid = () => null;
    const easeInOut = (t) => t * t * (3 - 2 * t);
    const normal = { want: false, shown: false, sc: 1 }, NORMAL_DASH = [7, 5];
    let morph = 0, pinList = [];
    const params = { splenicRx: 0 }, store = { get: () => ({ params }) };
    ${line('PIN_ID')}
    ${line('olKey')}
    ${line('warmKey')}
    ${line('olRingsOf')}
    ${line('marksKey')}
    ${fn('marksSync')}
    ${fn('olSet')}
    ${fn('pinOrgans')}
    ${fn('spotOrgans')}
    ${fn('normalSync')}
    ${fn('olGeom')}
    ${step}
    return {
      calls, clampA, mk, normal, params, wrap, darkMQ,
      step(now) { clock = now; return olStep(now); },
      set(kind, id) { olSet(kind, id); }, pin: pinOrgans, spot: spotOrgans,
      geom(id, key, value) { attrs.set(id + ':' + key, value); olGeom(); },
      theme(value) { document.documentElement.dataset.theme = value; },
      normalAt(sc, m = morph) { morph = m; normalSync(sc); },
      get outlines() { return olList; }, get last() { return olLast; },
    };
  `)(dashRings, normalShown);
}

test('settled outlines keep their specs across hundreds of full-rate blood frames', (t) => {
  const h = harness(), reference = harness(true);
  for (const x of [h, reference]) {
    x.set('sel', 'liver'); x.pin([{ id: 'heart', glow: true }, { id: 'bowel', warm: true }]);
    for (let now = 0; now <= 200; now += 10) x.step(now);
  }
  assert.ok(h.outlines.every((o) => o.a === 1));
  const built = h.calls.specs.length, referenceBuilt = reference.calls.specs.length, marks = h.calls.marks;
  for (let now = 201; now <= 1200; now++) { h.step(now); reference.step(now); }
  assert.equal(h.calls.specs.length, built, 'no draw-spec allocations, ring passes or setLines/signature work during settled blood frames');
  assert.equal(h.calls.marks, marks);
  assert.equal(reference.calls.specs.length - referenceBuilt, 1000);
  assert.deepEqual(h.calls.specs.at(-1), reference.calls.specs.at(-1));
  assert.equal(h.last, 1200, 'fade clock follows every offered frame');
  t.diagnostic('1,000 settled blood frames: 0 spec rebuilds; previous condition: 1,000.');
});

test('real geometry, appearance, pins, marks, clamps and normal thresholds refresh the specs', () => {
  const h = harness();
  h.set('sel', 'liver'); h.pin([{ id: 'bowel', warm: true }]); h.step(200);
  let t = 200;
  const refresh = (change, why) => {
    const n = h.calls.specs.length;
    change(); h.step(t += 200);
    assert.equal(h.calls.specs.length, n + 1, why);
  };
  refresh(() => h.geom('liver', 'd', '3'), 'reshaped liver');
  refresh(() => h.geom('liver', 'transform', '2'), 'organ ease changes world transform');
  refresh(() => h.geom('colon', 'transform', '2'), 'warm bowel cut follows colon movement');
  refresh(() => h.theme('dark'), 'theme changes mark key before idle check');
  refresh(() => { h.darkMQ.matches = true; }, 'system color scheme');
  refresh(() => { h.wrap.className += ' data-layer'; }, 'stage appearance class');
  refresh(() => h.pin([{ id: 'heart', glow: true, tone: 'accent' }]), 'pin color and glow');
  refresh(() => h.spot([{ id: 'spleen' }]), 'spotlight');
  refresh(() => h.mk.ver++, 'vessel mark geometry');
  refresh(() => { h.normal.want = true; h.normalAt(1.5); }, 'normal spleen threshold enters');
  refresh(() => h.normalAt(1), 'normal spleen threshold leaves');
  refresh(() => { h.clampA.set('PV', { a: 0, on: true }); h.mk.draws = [{ first: 0, count: 3, col: [0, 0, 0], alpha: 1, fade: 'PV' }]; }, 'clamp fades in');
  refresh(() => { h.clampA.get('PV').on = false; }, 'clamp fades out and removes marks');
  assert.ok(h.calls.shades >= 2);
});

test('every fade frame and invalidation produces exactly the always-built draw specs', (t) => {
  const idle = harness(), reference = harness(true);
  const both = (run) => { run(idle); run(reference); };
  both((h) => { h.set('sel', 'liver'); h.pin([{ id: 'bowel', warm: true, fade: 600 }]); });
  for (let now = 0; now <= 2400; now += 8) {
    if (now === 800) both((h) => h.set('sel', null));
    if (now === 1000) both((h) => h.set('hov', 'spleen'));
    if (now === 1200) both((h) => h.geom('spleen', 'transform', '2'));
    if (now === 1400) both((h) => h.theme('dark'));
    if (now === 1600) both((h) => h.pin([]));
    if (now === 1800) both((h) => h.set('hov', null));
    idle.step(now); reference.step(now);
    const current = idle.calls.specs.at(-1);
    assert.deepEqual(current, reference.calls.specs.at(-1), 'same retained picture at ' + now);
    assert.deepEqual(idle.outlines, reference.outlines, 'same fade state at ' + now);
  }
  assert.ok(idle.calls.specs.length < reference.calls.specs.length, 'idle frames skip the costly spec path');
  t.diagnostic('Mixed fade/geometry/theme sequence: ' + idle.calls.specs.length + ' rebuilds; previous condition: ' + reference.calls.specs.length + '; identical specs and alpha states on all 301 frames.');
});

test('organ easing and camera rendering retain the existing invalidation and transform paths', () => {
  assert.match(fn('updateOrgans'), /putA\(organG\.liver, 'transform', liverT\)/);
  assert.match(fn('updateOrgans'), /putA\(organG\.spleen, 'transform',[\s\S]*syncSelLine\(\)/);
  assert.match(fn('stepOrgans'), /updateOrgans\(f, f\.viewParams \|\| store\.get\(\)\.params, t\)/);
  assert.match(fn('syncSelLine'), /if \(glLines\) olGeom\(\)/);
  assert.match(fn('marksBuild'), /mk\.verts = new Float32Array\(V\); mk\.draws = draws; mk\.dirty = true/);
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /const m = baseM, mk = m\.join\(','\)/);
  assert.match(gl, /const at = `\|\$\{mk\}\|\$\{canvas.width\}x\$\{canvas.height\}`, vk = lineVers\[0\] \+ at/);
});
