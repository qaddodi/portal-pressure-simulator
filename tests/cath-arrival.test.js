// A catheter slide arrived at by Back, a jump or a link makes one camera glide to the tip, never the journey's two legs (out along the route and back in).
// Mohammad, 16 Nov 2026, Carvedilol slide 6 back to 5: "every slide-to-slide camera move is straight". Every deck's catheter slides are checked.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { CATH_END, cathInstant, cathLegs } from '../src/ui/cath-arrival.js';

const cathSlides = () => Object.values(DECKS).flatMap((d) => (d.slides || []).filter((s) => !s.visual && s.cath).map((s) => ({ deck: d.id, id: s.id, cath: s.cath })));

test('there are catheter slides in several decks, and each step has an end state', () => {
  const all = cathSlides();
  assert.ok(all.length >= 10, `${all.length} catheter slides`);
  for (const s of all) {
    assert.ok(CATH_END[s.cath], `${s.deck} ${s.id}: cath "${s.cath}" has no end state in cath-arrival.js`);
    assert.ok(['free', 'wedge', 'bad', null].includes(CATH_END[s.cath].ring), `${s.deck} ${s.id}: ring`);
  }
});

test('arrived at any way but Next, a catheter slide has one camera leg, whatever the step', () => {
  for (const s of cathSlides()) {
    assert.equal(cathLegs(s.cath, 1, true).length, 1, `${s.deck} ${s.id} (${s.cath})`);
    if (s.cath !== 'route') assert.deepEqual(cathLegs(s.cath, 1, true), ['tip'], `${s.deck} ${s.id}`);
  }
});

test('going forward with the catheter out the journey plays: the route, then the tip; with it already in, the tip alone', () => {
  assert.deepEqual(cathLegs('result', 0, false), ['route', 'tip']);
  assert.deepEqual(cathLegs('wedge', 1, false), ['tip']);
  assert.deepEqual(cathLegs('route', 0, false), ['route']);
});

test('only Next from the slide just shown plays the journey', () => {
  assert.equal(cathInstant(5, 4), false, 'Next');
  assert.equal(cathInstant(4, 5), true, 'Back');
  assert.equal(cathInstant(8, 4), true, 'a jump forward');
  assert.equal(cathInstant(4, -1), true, 'a link or a start');
  assert.equal(cathInstant(0, -1), false, 'the deck\'s first slide opens as Next would (a catheter on slide 1 plays its journey)');
});

test('the end state of a step matches the callouts its animation leaves up', () => {
  assert.deepEqual(CATH_END.result.show, ['sum']);
  assert.deepEqual(CATH_END.wedge.show, ['f', 'w']);
  assert.equal(CATH_END.wedge.balloon, 1);
  assert.equal(CATH_END.free.balloon, 0);
});
