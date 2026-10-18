import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIVE_RIM, rimKeep, diveRimMix } from '../src/ui/lobule-render-cache.js';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
// A over B for premultiplied pixels.
const over = (a, b) => a.map((x, i) => x + (1 - a[3]) * b[i]);

test('a fibrotic portal tract reaches into the dive rim, where the surround is faded', () => {
  // As paintLobule draws it at full portal fibrosis: tract radius G.rt (0.1 R) × (0.8 + 0.9), cuff out to 1.08 of it with its
  // 3.5 % + 2.5 % waviness, centred on a corner one radius from the centre.
  assert.match(lz, /const rt = R \* 0\.1;/);
  assert.match(lz, /rt = G\.rt \* \(0\.8 \+ 0\.9 \* gp\)/);
  assert.match(lz, /fibrousCuff\(c, x, y, rt \* 0\.62, rt \* 1\.08, PRE, gp\)/);
  const reach = 1 + 0.1 * (0.8 + 0.9) * 1.08 * 1.06;
  assert.ok(reach > DIVE_RIM.solid && rimKeep(reach) < 0.1, `tract out to ${reach.toFixed(3)} R`);
  assert.equal(rimKeep(1), 1);
  assert.equal(rimKeep(DIVE_RIM.clear + 0.01), 0);
});

test("the dive's copy fades the surround but never the lobule's own drawing", () => {
  const surround = [0.6, 0.55, 0.5, 1], tract = [0.3, 0.2, 0.1, 0.45];
  const tissue = over(tract, surround);
  for (const rho of [1, 1.05, 1.1, 1.15, 1.19, 1.25]) {
    const k = rimKeep(rho), got = diveRimMix(tissue, tract, k), want = over(tract, surround.map((x) => x * k));
    got.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 1e-12, `rho ${rho}: ${got} vs ${want}`));
    assert.ok(got[3] >= tract[3] - 1e-12, 'the tract keeps its full opacity');
  }
  // Past the rim only the tract is left, so the field below shows through it as the lobule view's surround does at rest.
  assert.deepEqual(diveRimMix(tissue, tract, 0), tract);
});

test('diveCopy builds that mix, and nothing of the lobule is masked with the rim', () => {
  const s = lz.indexOf('function diveCopy('), e = lz.indexOf('function paintLobule(');
  const body = lz.slice(s, e);
  assert.match(body, /destination-in/);
  assert.match(body, /drawImage\(w\.cv, w\.x, w\.y, w\.side, w\.side\)/);
  assert.match(body, /paintFlatVessels\(q, flatAt\.cs\)/);
  assert.match(body, /destination-out/);
  assert.match(body, /'lighter'/);
  // The vessels' canvas (only the lobule's own vessels) and the copy carry no CSS mask that would fade the triads past the corners.
  assert.doesNotMatch(lz, /maskImage/);
  // Every way the world bitmap is laid on the tissue records where, for the copy.
  assert.equal((lz.match(/worldAt = \{ cv: (xfCv|worldCv), x: sx \* dpr, y: sy \* dpr, side \}/g) || []).length, 2);
});
