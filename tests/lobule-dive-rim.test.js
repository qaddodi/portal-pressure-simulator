import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIVE_RIM } from '../src/ui/lobule-render-cache.js';

   // (the tissue's painting)
// A over B for premultiplied pixels.
const over = (a, b) => a.map((x, i) => x + (1 - a[3]) * b[i]);
// The rim's maths as diveCopy's composite does it (the app draws it with canvas operations; these are its model):
// how much of the tissue (surround and all) the dive keeps at rho lobule radii from the lobule's centre,
const rimKeep = (rho) => Math.min(1, Math.max(0, (DIVE_RIM.clear - rho) / (DIVE_RIM.clear - DIVE_RIM.solid)));
// and one premultiplied [r, g, b, a] pixel of the dive's copy: the tissue (the lobule's own drawing over the surround) × keep, plus the
// lobule's own drawing × (1 − keep). That is the lobule's drawing over the surround faded by keep: the drawing itself is never faded.
const diveRimMix = (tissue, own, keep) => tissue.map((t, i) => keep * t + (1 - keep) * own[i]);

test('a fibrotic portal tract reaches into the dive rim, where the surround is faded', () => {
  // As paintLobule draws it at full portal fibrosis: tract radius G.rt (0.1 R) × (0.8 + 0.9), cuff out to 1.08 of it with its
  // 3.5 % + 2.5 % waviness, centred on a corner one radius from the centre.
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
