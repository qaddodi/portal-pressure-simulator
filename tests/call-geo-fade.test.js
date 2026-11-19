// The call-out pill's leader line and ring fade with the pill when a layout moves it (16 Nov 2026): out where they stood, in at the new place, never a jump.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallGeoFade } from '../src/ui/call-geo-fade.js';

function rig() {
  const R = { geo: [100, 100, 10, 110, 100, 200, 100], on: true, pill: true, timers: [], log: [] };
  R.io = {
    read(g) { for (let i = 0; i < 7; i++) g[i] = R.geo[i]; },
    write(g) { R.geo = g.slice(); R.log.push(['write', g.slice()]); },
    isOn: () => R.on, pillOn: () => R.pill,
    setOn(v) { R.on = v; R.log.push(['on', v]); },
    schedule(fn, ms) { R.timers.push({ fn, ms }); return R.timers.length; }, cancel(t) { R.timers[t - 1].dead = true; }, ms: 240,
  };
  R.f = createCallGeoFade(R.io);
  // (a layout: the pointer as it stood is snapped, the layout writes its new geometry, then settles)
  R.layout = (next, still = true) => { const was = R.f.snap(); R.geo = next.slice(); R.f.settle(was, still); };
  R.fire = () => { for (const t of R.timers) if (!t.dead && !t.done) { t.done = true; t.fn(); } };
  return R;
}
const A = [100, 100, 10, 110, 100, 200, 100], B = [100, 260, 10, 110, 258, 200, 250];

test('a moved pointer: the old leader and ring stay drawn and fade out, the new ones are written once that is over and fade in', () => {
  const R = rig();
  R.layout(B);
  assert.deepEqual(R.geo, A, 'held where it stood while it fades out');
  assert.equal(R.on, false, 'its `on` class goes: the stylesheet fades it out');
  assert.equal(R.timers.length, 1);
  assert.equal(R.timers[0].ms, 240, 'one fade long');
  R.fire();
  assert.deepEqual(R.geo, B, 'then the new place');
  assert.equal(R.on, true, 'and `on` again: it fades in');
});

test('a move of 3 px or less, or a pointer that is not showing, is left alone', () => {
  const R = rig();
  R.layout([101, 102, 10, 110, 101, 200, 101]);
  assert.equal(R.timers.length, 0); assert.equal(R.on, true);
  const Q = rig(); Q.on = false;
  Q.layout(B);
  assert.deepEqual(Q.geo, B, 'it appears at the new place: its own class fades it in'); assert.equal(Q.timers.length, 0);
});

test('a pointer the camera carries (a hand, a camera glide, the dive) is never held back', () => {
  const R = rig();
  R.layout(B, false);
  assert.deepEqual(R.geo, B); assert.equal(R.on, true); assert.equal(R.timers.length, 0);
});

test('moved again while fading out (a quick second toggle): the old drawing stays until the fade ends and the newest place is the one written, never a jump', () => {
  const R = rig();
  R.layout(B);
  const C = [100, 330, 10, 110, 328, 200, 320];
  R.layout(C);   // (the layout's elements now hold the old geometry A with `on` off: it snaps the elements as the layout wrote them)
  assert.deepEqual(R.geo, A, 'still the first drawing, fading out');
  assert.equal(R.timers.length, 1, 'one fade, not a second timer');
  R.fire();
  assert.deepEqual(R.geo, C, 'the newest place');
});

test('moved back while fading out: nothing jumps, the pointer fades in again where it is', () => {
  const R = rig();
  R.layout(B);
  R.layout(A);
  assert.equal(R.on, true, 'on again at once');
  assert.deepEqual(R.geo, A);
  R.fire();
  assert.deepEqual(R.geo, A, 'the cancelled fade writes nothing');
});

test('the pill gone before the fade ends: nothing is written or switched on', () => {
  const R = rig();
  R.layout(B);
  R.pill = false;
  R.fire();
  assert.deepEqual(R.geo, A); assert.equal(R.on, false);
});
