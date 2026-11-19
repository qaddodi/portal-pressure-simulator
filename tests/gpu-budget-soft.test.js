// Idle caches (a holder made with `soft: true`) are given back above SOFT_SHARE of the envelope, the longest unused first, one at a time, and only while it is over; the others are not
// asked (19 Nov 2026, the phone check: the page stood at 99% of its envelope for a whole path with the lobule's kept bitmaps held, since nothing was given back below 100%).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.screen = { width: 390, height: 844 };   // (a phone: 320 MB envelope)
let clock = 0;
globalThis.performance = { now: () => clock };
const { hold, enforce, ENVELOPES, SOFT_SHARE, holdersNow } = await import('../src/ui/gpu-budget.js');
const MB = 1e6;
const limit = ENVELOPES.phone.mb * MB * SOFT_SHARE;
const mk = (owner, mb, released, o = {}) => { clock += 10; return hold({ owner, kind: 'retained', soft: o.soft, bytes: () => mb * MB, release: () => released.push(owner) }); };

test('over the soft ceiling the longest unused idle cache goes first, and one is enough when it brings the page under', () => {
  const released = [];
  const shown = mk('shown', 150, released), old = mk('idle old', 60, released, { soft: true }), fresh = mk('idle new', 60, released, { soft: true });
  enforce();
  assert.deepEqual(released, ['idle old'], `270 MB held against ${(limit / MB).toFixed(0)}: the oldest idle one goes and the page is under`);
  assert.ok(holdersNow().list.some((h) => h.owner === 'idle new') && holdersNow().list.some((h) => h.owner === 'shown'));
  for (const h of [shown, old, fresh]) h.drop();
});

test('still over with every idle cache gone, the shown ones are left alone (they are given back only over the whole envelope)', () => {
  const released = [];
  const shown = mk('shown big', 250, released), idle = mk('idle', 20, released, { soft: true });
  enforce();
  assert.deepEqual(released, ['idle']);
  assert.ok(holdersNow().list.some((h) => h.owner === 'shown big'), 'a shown cache is not asked below 100%');
  shown.drop(); idle.drop();
});

test('under the soft ceiling nothing is given back', () => {
  const released = [];
  const a = mk('idle a', 100, released, { soft: true }), b = mk('shown', 60, released);
  enforce();
  assert.deepEqual(released, []);
  a.drop(); b.drop();
});
