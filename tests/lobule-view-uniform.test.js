// The lobule's captions and leaders follow the camera as a view the GPU draws with (3 Nov 2026), not as a CSS transform on their layers:
// view(k, e, f) draws a point p at k p + (e, f) (a pan is k = 1; the dive is a scale about a point). A glide's leaders ride by moving the held geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const lz = read('lobule-zoom.js'), cap = read('label-captions.js'), svg = read('svg-gl.js');

test('captions and the leaders both take a view, and draw their whole picture inside it', () => {
  assert.match(cap, /view\(k, e, f\) \{ if \(vk === k && ve === e && vf === f\) return; vk = k; ve = e; vf = f; api\.paint\(\); \}/);
  assert.match(svg, /g\.view = \(k, e, f\) => \{ if \(g\.vk === k && g\.ve === e && g\.vf === f\) return;/);
  assert.match(svg, /ctx\.translate\(g\.ve \+ BLEED \* \(1 - g\.vk\), g\.vf \+ BLEED \* \(1 - g\.vk\)\); ctx\.scale\(g\.vk, g\.vk\);/);
});

test('a hand pan and the dive hand the camera to both, and put no transform on the labels or the leaders box', () => {
  // (R08: the pan and the dive are two records composed by composeView, and both views take the composed one.)
  assert.match(lz, /panDX = dx; panDY = dy; panOn = true;\s*applyView\(\);/);
  assert.match(lz, /if \(k >= 0\.9999\) setDive\(1, 0, 0\); else setDive\(k, tx - k \* x, ty - k \* y\);/);
  assert.match(lz, /cap\.view\(VIEW\[0\], VIEW\[1\], VIEW\[2\]\); leadGL\.view\(VIEW\[0\], VIEW\[1\], VIEW\[2\]\);/);
  assert.match(lz, /const unpan = \(\) => \{ if \(!panOn\) return; panOn = false; applyView\(\); \};/);
  assert.doesNotMatch(lz, /labels\.style\.transform/);
  assert.doesNotMatch(lz, /leadersBox\.style\.transform/);
});

test('a glide or a hand zoom moves the leaders\' held geometry with the labels', () => {
  assert.match(lz, /const RIDE_ATT = \['x1', 'x2', 'cx', 'y1', 'y2', 'cy'\];/);
  assert.match(lz, /setGeo\(e, RIDE_ATT\[k\], b \+ \(k < 3 \? d0 : d1\)\)/);
  assert.match(lz, /leadGL\.paint\(\)/);
});

test('a gesture taking over a half-finished label glide carries its visible position', () => {
  const take = (name) => {
    const start = lz.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, name);
    return lz.slice(start, lz.indexOf('\n  }', start) + 4);
  };
  const el = {}, spot = new WeakMap([[el, [100, 120]]]);
  const labs = { triad: { el, gl: { x0: 20, y0: 40, x1: 100, y1: 120, t0: 0 } } };
  const seen = new Map(), cancelled = [];
  const freeze = new Function('LAB_KEYS', 'labs', 'spot', 'ZERO2', 'tlNow', 'easeLab', 'glOf', 'put', 'cancelled',
    `let glideRaf = 7, glideUntil = 480; const cancelFrame = (id) => cancelled.push(id);\n${take('seenAt')}\n${take('freezeLabelGlides')}\nreturn freezeLabelGlides;`)(
    ['triad'], labs, spot, [0, 0], () => 100, () => 0.5, () => { throw new Error('existing glide lost'); },
    (e, x, y) => { spot.set(e, [x, y]); seen.set(e, [x, y]); }, cancelled);
  freeze();
  assert.deepEqual(seen.get(el), [60, 80], 'starts at the drawn halfway point, not the old layout target');
  assert.equal(labs.triad.gl, null, 'capSync cannot override the camera ride with the previous glide');
  freeze();
  assert.deepEqual(spot.get(el), [60, 80], 'a second step keeps the same basis');
  assert.deepEqual(cancelled, [7], 'the old leader glide cannot overwrite the ride geometry in a later callback');
  assert.match(lz, /classSoon\(labels, 'lz-ease', false\);\s*freezeLabelGlides\(\);\s*rides = rideList/);
  assert.match(lz, /if \(!panOn\) freezeLabelGlides\(\);/);
});
