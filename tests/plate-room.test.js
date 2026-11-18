// The view's sharp organ picture is sized by the memory the page has left (plate-room.js, gpu-budget.js room): 18 Nov 2026, the iPhone's tab was killed on the HVPG
// deck's slide 5 to 6 every time, where the way out of the lobule meets the camera's glide to the catheter's tip and a 3.5 MP picture and the painter's seven targets
// (about 110 MB) were made over the lobule's still-warm buffers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.screen = { width: 390, height: 844 };   // (a phone: 320 MB envelope)
let clock = 0;
globalThis.performance = { now: () => clock };
const { fitPlateView, plateBytes, PAINTER_TARGETS } = await import('../src/ui/plate-room.js');
const { hold, room, freeBytes, ENVELOPES, holdersNow } = await import('../src/ui/gpu-budget.js');
const MB = 1e6;

// A picture at margin r and k of the scale: the view is 1.5 MP, the targets grow with it (7 of them and a stencil byte).
const bytesAt = (r, k) => { const px = 1.5e6 * (1 + 2 * r) ** 2 * k * k; return plateBytes(px, px * (4 * PAINTER_TARGETS + 1)); };

test('where there is room the picture is made as wanted: the widest margin, the whole scale', () => {
  const f = fitPlateView({ need: 4, reachMax: 0.34, reachMin: 0.15, minScale: 1, bytesAt, free: () => 1e12 });
  assert.deepEqual(f, { reach: 0.34, k: 1 });
});

test('with less room the margin narrows first, then the scale, and the picture made fits', () => {
  const wide = bytesAt(0.34, 1), narrow = bytesAt(0.15, 1);
  const a = fitPlateView({ need: 4, reachMax: 0.34, reachMin: 0.15, minScale: 1, bytesAt, free: (b) => (wide - 1 >= b ? b : 0) });
  assert.ok(a && a.k === 1 && a.reach < 0.34 && a.reach >= 0.15, 'a narrower margin at the whole scale');
  const b = fitPlateView({ need: 4, reachMax: 0.34, reachMin: 0.15, minScale: 1, bytesAt, free: (x) => (narrow * 0.5 >= x ? x : 0) });
  assert.ok(b && b.reach === 0.15 && b.k < 1, 'then the whole margin gone, a smaller scale');
  for (const f of [a, b]) assert.ok(bytesAt(f.reach, f.k) <= Math.max(wide - 1, narrow * 0.5), 'what is made fits what was free');
});

test('a picture no sharper than the one already shown is not made, and none fits is none', () => {
  assert.equal(fitPlateView({ need: 1.1, reachMax: 0.3, reachMin: 0.15, minScale: 1, bytesAt, free: (b) => b * 0.7 }), null, 'only scales under the sharpness floor fit');
  assert.equal(fitPlateView({ need: 4, reachMax: 0.3, reachMin: 0.15, minScale: 1, bytesAt, free: () => 0 }), null);
});

test('letting go of what is held comes second: the first look takes nothing away, the second does', () => {
  const calls = [];
  const f = fitPlateView({ need: 4, reachMax: 0.3, reachMin: 0.15, minScale: 1, bytesAt, free: (b, evict) => { calls.push(evict); return evict ? b : 0; } });
  assert.ok(f && f.reach === 0.3 && f.k === 1, 'with the holders let go the wanted picture fits');
  assert.equal(calls[0], false);
  assert.ok(calls.includes(true));
  assert.ok(!calls.slice(0, calls.indexOf(true)).includes(true));
});

test('room(): holders are let go, warm before retained, least recently used first, until the bytes fit; one holding nothing is left', () => {
  const env = ENVELOPES.phone, limit = env.mb * MB;
  const released = [];
  const mk = (owner, kind, mb) => { clock += 10; return hold({ owner, kind, bytes: () => mb * MB, release: () => released.push(owner) }); };
  // (the registry itself reads nothing in node, so these are the holders' bytes against the ceiling)
  const a = mk('warm old', 'warm', 10), b = mk('warm new', 'warm', 10), c = mk('retained', 'retained', 10), z = mk('nothing', 'retained', 0);
  assert.equal(freeBytes(1), limit, 'the registry counts nothing here: all the envelope is free');
  assert.ok(room(1 * MB) >= 1 * MB, 'room already: nothing let go');
  assert.deepEqual(released, []);
  const got = room(limit + 1);   // more than the envelope has: every holder that holds anything goes, in the order
  assert.ok(got < limit + 1, 'it cannot fit, and says so');
  assert.deepEqual(released, ['warm old', 'warm new', 'retained'], 'warm first, the oldest first, the one holding nothing left alone');
  for (const h of [a, b, c, z]) h.drop();
  assert.equal(holdersNow().list.length, 0);
});
