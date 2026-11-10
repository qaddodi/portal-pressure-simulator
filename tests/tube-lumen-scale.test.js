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

// ---- PL item 2: the webs are drawn in the lumen pass's colour draw only when they add something ----
import { makeHarness } from './tube-pass-harness.js';
const progs = (log) => log.filter((c) => c.call === 'strips' || c.call === 'patch').map((c) => `${c.prog}:${c.n}${c.mask === false ? ' pre' : ' col'}`);

test('without the origin colours or the dye the webs stay in the depth prepass and are left out of the lumen colour draw', () => {
  const h = makeHarness({ withStage3: true });
  h.tubePass.webColour = false;
  assert.equal(h.runLumen(), true);
  const seq = progs(h.log);
  assert.ok(seq.some((x) => /^tubeWebDepth:\d+ pre$/.test(x)), 'the web depth is still drawn (the prepass)');
  assert.ok(!seq.some((x) => x.startsWith('tubeWebLumen')), 'no web in the colour draw');
  assert.ok(seq.some((x) => /^tubeLumen:3 col$/.test(x)), 'the strips still are');
  assert.equal(h.MG.lumWebs, 0);
});

test('with them on (the default) the webs are drawn as before', () => {
  const h = makeHarness({ withStage3: true });
  assert.equal(h.tubePass.webColour, true);
  h.runLumen();
  assert.ok(progs(h.log).some((x) => /^tubeWebLumen:4 col$/.test(x)));
});

import { tubeLumenJS } from '../src/ui/tube-lumen-glsl.js';
test('why the webs add nothing without origin or dye: a web pixel is placed at the wall (y = 1), where the blood\'s alpha factor (1 - smoothstep(.7, 1, |y|)) is zero', () => {
  const px = tubeLumenJS({ vI: 10, vD: -1, vG: [0, 0], vRad: 4 * 3, ba: [1, 0], len: 100, R: 3, aa: 1 });   // vRad is 4 x a radius: a web's
  assert.equal(px.web, true);
  assert.equal(px.y, 1);
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  assert.equal(1 - smooth(0.7, 1, Math.abs(px.y)), 0, 'bloodAt\'s wall factor: no streak');
  const strip = tubeLumenJS({ vI: 10, vD: -1, vG: [0, 1], vRad: 3, ba: [1, 0], len: 100, R: 3, aa: 1 });
  assert.equal(strip.web, false);
});

// ---- PL item 3: the lumen pass only where the lobule is ----
import { lumenBox, lumenRect, lumenCut, cullUpdate, createDepthStamp } from '../src/ui/tube-stage2.js';

function rows3() {   // three straight rows (N_SAMPLES points each) along x at y = 10 r, from x = 100 r to 100 r + 50
  const N = 64, pts = new Float32Array(3 * 32 * 4), on = new Uint8Array(3).fill(1);
  for (let r = 0; r < 3; r++) for (let i = 0; i < N; i++) { const o = (r * 32 + (i >> 1)) * 4 + (i & 1) * 2; pts[o] = 100 * r + (50 * i) / (N - 1); pts[o + 1] = 10 * r; }
  return { gen: 1, pts: { pts, on } };
}

test('lumenBox holds the boxes of the rows the cull keeps and nothing of the rows it leaves out', () => {
  const B = rows3(), C = cullUpdate(B, 3, { rect: [120, -5, 160, 25], pad: 0, rmax: [1, 1, 1], ok: true });
  assert.deepEqual([...C.mask.slice(0, 3)], [0, 1, 0]);
  const out = new Float64Array(4);
  lumenBox(C, 3, null, B.pts.pts, out);
  const b = C.boxes.boxes;
  assert.deepEqual([...out], [b[4], b[5], b[6], b[7]], 'row 1\'s box exactly');
  C.mask.fill(0);
  lumenBox(C, 3, null, B.pts.pts, out);
  assert.ok(out[0] > out[2], 'nothing kept: an empty box');
});

test('lumenBox adds the squares round a kept row\'s webs\' legs, as far as a web reaches; a web of rows both left out adds nothing', () => {
  const B = rows3(), C = cullUpdate(B, 3, { rect: [120, -5, 160, 25], pad: 0, rmax: [2, 2, 2], ok: true });
  const W = { count: 2, data: new Float32Array(24) };
  // web 0: legs on rows 1 (sample 63, at x 150) and 2 (sample 0, at x 200), reach 10; web 1: rows 0 and 2 (both left out)
  W.data.set([1, 63, 1, 1, 2, 0, -1, -1, 0.3, 10, 2, 0], 0);
  W.data.set([0, 0, 1, 1, 2, 0, -1, -1, 0.3, 10, 2, 0], 12);
  const out = new Float64Array(4), plain = new Float64Array(4);
  lumenBox(C, 3, null, B.pts.pts, plain);
  lumenBox(C, 3, W, B.pts.pts, out);
  const e = 5 * Math.max(C.hr[1], C.hr[2]) + 10;
  assert.ok(Math.abs(out[2] - (200 + e)) < 1e-3, 'the leg on row 2 at x 200 reaches e further');
  assert.ok(out[0] <= plain[0] && out[1] <= plain[1] && out[2] > plain[2] && out[3] >= plain[3]);
  const one = { count: 1, data: W.data.slice(12, 24) };
  lumenBox(C, 3, one, B.pts.pts, out);
  assert.deepEqual([...out], [...plain], 'a web with no kept leg adds nothing');
});

test('lumenRect: the box of device pixels a world box covers under the view, a pixel out; none for an empty box', () => {
  const o = new Float64Array(4);
  assert.equal(lumenRect([2, 0, 0, 2, 10, 20], [1, 1, 0, 3], o), false, 'min over max: empty');
  assert.equal(lumenRect([2, 0, 0, 2, 10, 20], [1, 1, 4.5, 3], o), true);
  assert.deepEqual([...o], [Math.floor(12) - 1, Math.floor(22) - 1, Math.ceil(19) + 1, Math.ceil(26) + 1]);
  lumenRect([0, 1, -1, 0, 0, 0], [0, 0, 10, 5], o);   // a quarter turn: still holds the four corners
  for (const [x, y] of [[0, 0], [10, 0], [0, 5], [10, 5]]) { const X = -y, Y = x; assert.ok(o[0] <= X && X <= o[2] && o[1] <= Y && Y <= o[3]); }
});

test('the box cut to a wrapped layer\'s pieces holds every pixel of the box that the window shows, and no more than the pieces hold', () => {
  const cut = [0, 0];
  for (const [W, wo, la] of [[1000, 0, 0], [1000, 300, 0], [733, 700, 0], [640, 5, 20]]) {
    // the window shows the screen pixels [la, la + W); the layer holds screen pixel x at layer pixel (x - la + wo) mod W: two pieces, [wo, W) shifted wo - la... (axisPieces)
    const pieces = [{ start: wo, len: W - wo, shift: wo - la - 0 }, { start: 0, len: wo, shift: wo - la - W }].filter((p) => p.len > 0);
    for (const [lo, hi] of [[la + 10, la + 50], [la + W - 30, la + W + 40], [la - 40, la + 5], [la + 300, la + 300.5], [la - 100, la + W + 100]]) {
      const got = new Set();
      for (const p of pieces) if (lumenCut(p.start, p.len, p.shift, lo, hi, cut)) for (let x = cut[0]; x < cut[1]; x++) { assert.ok(x >= p.start && x < p.start + p.len, 'inside the piece'); got.add(x - p.shift); }   // (back to a screen pixel)
      for (let x = Math.max(Math.floor(lo), la); x < Math.min(Math.ceil(hi), la + W); x++) assert.ok(got.has(x), `${W}/${wo}: screen pixel ${x} of the box [${lo}, ${hi}] is cut out`);
      for (const x of got) assert.ok(x >= Math.floor(lo) && x < Math.ceil(hi) && x >= la && x < la + W, `${W}/${wo}: screen pixel ${x} is outside the box or the window`);
    }
  }
});

test('the depth stamp takes the pass\'s box: a depth drawn in one box is stale in another, and in no box', () => {
  const d = createDepthStamp(), M = [1, 0, 0, 1, 0, 0], WO = [0, 0], LA = [0, 0], A = [10, 20, 30, 40];
  d.drawn(M, WO, LA, 64, 64, A);
  assert.equal(d.needs(M, WO, LA, 64, 64, [10, 20, 30, 40]), false, 'the same box: kept');
  d.drawn(M, WO, LA, 64, 64, A);
  assert.equal(d.needs(M, WO, LA, 64, 64, [10, 20, 31, 40]), true);
  d.drawn(M, WO, LA, 64, 64, A);
  assert.equal(d.needs(M, WO, LA, 64, 64, null), true, 'no box is the whole target');
  d.drawn(M, WO, LA, 64, 64);
  assert.equal(d.needs(M, WO, LA, 64, 64), false);
});
