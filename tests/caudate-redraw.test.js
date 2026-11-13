// The caudate lobe and its short veins on the real stage (node, jsdom, the do-nothing WebGL; tests/stage-gl-boot.js), 11 Nov 2026, after the
// owner's screenshots (veins as spikes, a notched pale outline, the lobe on the plate with no slide up). By numbers, as he allowed no render:
// nothing is on until a slide pins the caudate, the lobe's outline is one smooth curve with no notch, and each vein grows from a
// narrow start inside the lobe and runs on past the IVC's wall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { CAUDATE } from '../src/ui/anatomy.js';
import { sampleD } from '../scripts/shunt-route-lib.mjs';

const nums = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);

test('the lobe outline is one closed smooth curve: it turns the same way all round, with no notch', () => {
  const P = sampleD(CAUDATE.outline, 1.5);
  let pos = 0, neg = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], c = P[(i + 2) % P.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (z > 0.2) pos++; else if (z < -0.2) neg++;   // (the left side is almost straight: its wobble is under 0.1)
  }
  assert.ok(Math.min(pos, neg) <= 2, `turns both ways (${pos} / ${neg}): a notch`);
});

test('nothing of the caudate is on with no slide, all of it is once a slide pins it, and it goes again', async () => {
  const { st, page } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const tasks = () => new Promise((r) => setImmediate(r));
  const groups = () => [...page.document.querySelectorAll('.caud')];
  assert.ok(groups().length >= 2, 'the lobe group and the growth-marks group exist');
  assert.ok(groups().every((g) => !g.classList.contains('on')), 'on at load, with no slide up');
  st.pinOrgans(['caudate']); pump(50); await tasks();
  assert.ok(groups().every((g) => g.classList.contains('on')), 'not on while a slide pins the caudate');
  st.pinOrgans(['caudate-lobe']); pump(50); await tasks();
  assert.ok(groups().every((g) => g.classList.contains('on')), 'not on while a slide pins the lobe alone');
  st.pinOrgans(null); pump(50); await tasks();
  assert.ok(groups().every((g) => !g.classList.contains('on')), 'still on after the slide');
  // The veins, as drawn: each lumen starts narrow inside the lobe and reaches past the IVC's wall.
  const lumens = [...page.document.querySelectorAll('.caud-lumen')];
  assert.equal(lumens.length, CAUDATE.veins.length);
  lumens.forEach((el, i) => {
    const v = nums(el.getAttribute('d')), P = [];
    for (let k = 0; k + 1 < v.length; k += 2) P.push([v[k], v[k + 1]]);
    const half = P.length / 2, L = P.slice(0, half), R = P.slice(half).reverse();
    const width = (k) => Math.hypot(L[k][0] - R[k][0], L[k][1] - R[k][1]);
    const [w] = CAUDATE.veins[i].slice(1);
    assert.ok(width(0) < 0.5 * w + 0.01, `vein ${i} starts wide (${width(0).toFixed(2)})`);
    assert.ok(width(half - 1) > width(0) * 1.5, `vein ${i} does not widen toward the cava`);
    assert.ok(L[half - 1][0] > CAUDATE.wall + 4, `vein ${i} stops at x ${L[half - 1][0].toFixed(1)}, short of running on into the cava (wall ${CAUDATE.wall})`);
    assert.ok(L[0][0] < CAUDATE.wall - 15, `vein ${i} starts too near the wall`);
  });
});
