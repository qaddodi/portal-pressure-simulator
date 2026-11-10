// The lumen layer at a share of the vessel layer's size (brief PL item 1, 10 Nov 2026): the share per instance, the target's size, the view and the pieces in the target's pixels, and
// the mask the compositor lays over the filtered small layer. Node only; nothing here reads the text of src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lumenScale, lumenSize, lumenView, lumenPiece, lumenOff } from '../src/ui/tube-stage2.js';
import { tubeLumenMaskJS, tubeLumenMixJS } from '../src/ui/comp-glsl.js';

test('the share: the lobule 0.5, the figure 1 (0.67 on a phone); ?lumenscale= between 0.25 and 1 overrides every instance', () => {
  assert.equal(lumenScale('lobule', false, ''), 0.5);
  assert.equal(lumenScale('lobule', true, '?perf'), 0.5);
  assert.equal(lumenScale('stage', false, ''), 1);
  assert.equal(lumenScale('stage', true, ''), 0.67);
  assert.equal(lumenScale('stage', false, '?lumenscale=0.5'), 0.5);
  assert.equal(lumenScale('lobule', false, '?a=1&lumenscale=0.25&b'), 0.25);
  assert.equal(lumenScale('lobule', true, '?lumenscale=1'), 1);
  for (const bad of ['?lumenscale=0.1', '?lumenscale=2', '?lumenscale=', '?lumenscale=abc', '?xlumenscale=0.5']) assert.equal(lumenScale('lobule', false, bad), 0.5, bad);
});

test('?lumen=off is read from the query only as that word', () => {
  assert.equal(lumenOff('?lumen=off'), true);
  assert.equal(lumenOff('?perf&lumen=off&x'), true);
  assert.equal(lumenOff('?lumen=offish'), false);
  assert.equal(lumenOff('?lumen=on'), false);
  assert.equal(lumenOff(''), false);
});

test('the target\'s size is the layer\'s times the share, rounded up, never below one; the full size at a share of 1', () => {
  const out = [0, 0];
  assert.deepEqual([...lumenSize(2560, 1620, 0.5, out)], [1280, 810]);
  assert.deepEqual([...lumenSize(2561, 1621, 0.5, out)], [1281, 811]);
  assert.deepEqual([...lumenSize(1170, 2532, 0.67, out)], [Math.ceil(1170 * 0.67), Math.ceil(2532 * 0.67)]);
  assert.deepEqual([...lumenSize(100, 80, 1, out)], [100, 80]);
  assert.deepEqual([...lumenSize(1, 1, 0.25, out)], [1, 1]);
  const mp = (w, h, s) => { lumenSize(w, h, s, out); return out[0] * out[1] / 1e6; };
  assert.ok(Math.abs(mp(2560, 1620, 0.5) - 4.15 / 4) < 0.01, 'a 4.15 MP layer at 0.5 is about 1.04 MP');
});

test('the view in the target\'s pixels puts every world point at the layer\'s pixel times the share', () => {
  const m = [3, 0.4, -0.2, -2.5, 120.5, 77.25], W = 1001, H = 733, Wt = Math.ceil(W * 0.5), Ht = Math.ceil(H * 0.5), sx = Wt / W, sy = Ht / H;
  const ms = lumenView(m, sx, sy, new Float64Array(6));
  for (const [x, y] of [[0, 0], [10, -4], [-33.5, 120], [200, 300]]) {
    const lx = m[0] * x + m[2] * y + m[4], ly = m[1] * x + m[3] * y + m[5];
    assert.ok(Math.abs(ms[0] * x + ms[2] * y + ms[4] - lx * sx) < 1e-9);
    assert.ok(Math.abs(ms[1] * x + ms[3] * y + ms[5] - ly * sy) < 1e-9);
  }
});

test('the pieces of a wrapped axis tile the target, and a target pixel is drawn through the piece that holds its centre', () => {
  for (const [W, wo] of [[1000, 0], [1001, 1], [1001, 500], [733, 732], [640, 317]]) {
    const Wt = Math.ceil(W * 0.5), s = Wt / W, a = [0, 0], b = [0, 0];
    // (the layer's whole window in two pieces, as axisPieces splits it: [wo, W) and [0, wo))
    lumenPiece(wo, W - wo, s, a); lumenPiece(0, wo, s, b);
    assert.equal(a[0] + a[1], Wt, `${W}/${wo}: the first piece ends at the target's edge`);
    assert.equal(b[0], 0);
    assert.equal(b[0] + b[1], a[0], `${W}/${wo}: the second ends where the first starts`);
    for (let k = 0; k < Wt; k++) {
      const centre = (k + 0.5) / s, inFirst = k >= a[0];
      if (Math.abs(centre - wo) < 1e-9) continue;   // (a centre exactly on the seam: either piece holds it)
      assert.equal(inFirst, centre > wo, `${W}/${wo}: target pixel ${k}, centre at layer ${centre.toFixed(2)}`);
    }
  }
});

test('the mask: no blood where the vessel layer has no lumen, the layer\'s own opacity at its edge, the small layer\'s colour inside', () => {
  const red = [0.4, 0, 0, 0.5];   // premultiplied: colour (0.8, 0, 0) at 0.5
  assert.deepEqual(tubeLumenMaskJS(red, 0, 200), [0, 0, 0, 0], 'no row in front at full size: nothing, though the small layer has blood here');
  const edge = tubeLumenMaskJS(red, 7, 51);   // the layer's lumen is 51/255 = 0.2 opaque at this pixel
  assert.ok(Math.abs(edge[3] - 0.2) < 1e-12);
  assert.ok(Math.abs(edge[0] / edge[3] - 0.8) < 1e-12 && edge[1] === 0 && edge[2] === 0, 'the colour is the small layer\'s unpremultiplied colour');
  assert.deepEqual(tubeLumenMaskJS([0, 0, 0, 0.001], 7, 255), [0, 0, 0, 0], 'the small layer has too little here to give a colour');
  const full = tubeLumenMaskJS(red, 3, 255);
  assert.ok(Math.abs(full[3] - 1) < 1e-12);
  // The compositor then mixes the colour in at the layer's own share of its alpha: a layer pixel (v) that is half lumen takes the blood at 0.5, whatever the small layer's alpha was.
  const v = [0.5, 0.5, 0.5, 0.8], L = tubeLumenMaskJS([0.1, 0, 0, 0.1], 5, 102);   // the layer's lumen alpha 0.4 of v.a 0.8
  const out = tubeLumenMixJS(v, L);
  assert.equal(out[3], 0.8);
  const col = 0.5 / 0.8, F = Math.min(0.1 / 0.1, 1);
  assert.ok(Math.abs(out[0] - (col + (F - col) * 0.5) * 0.8) < 1e-9, 'half toward the lumen colour');
});
