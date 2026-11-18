// A card's words wait for its GPU widgets as well as its frost (18 Nov 2026, Mohammad, the iPhone: "the card's content is showing before it's styled or loaded: default colors, default sliders, layout").
// A widget's own page look is its fallback and gives way when the GPU's picture is up (.wgl-on); the words came in over it. The glass's clock (glass-clock.js) does not start a card's fade while a
// widget of the card is still to come up (widget-ready.js), for HOLD_MAX_MS at the most; a screen whose widgets never come up is found out after two waits and waits no more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevealClock, HOLD_MAX_MS } from '../src/ui/glass-clock.js';
import { widgetState, widgetsPending } from '../src/ui/widget-ready.js';

// An animation with the browser's rules, enough for the clock: pause, play, finish, currentTime, playState.
class Anim {
  constructor(dur) { this.currentTime = 0; this.playState = 'running'; this.playbackRate = 1; this.dur = dur; this.effect = { getTiming: () => ({ duration: dur, iterations: 1, delay: 0, endDelay: 0 }) }; }
  pause() { this.playState = 'paused'; } play() { this.playState = 'running'; } finish() { this.currentTime = this.dur; this.playState = 'finished'; }
}
const card = (...live) => ({ querySelector: () => null, querySelectorAll: () => live.map((on) => ({ parentElement: { classList: { contains: (c) => c === 'wgl-on' && on } } })) });

test('a card with a widget not yet up is pending; one whose widgets are all up, or with none, is not', () => {
  widgetState.live = 1; widgetState.misses = 0;
  assert.equal(widgetsPending(card(false)), true);
  assert.equal(widgetsPending(card(true, false)), true);
  assert.equal(widgetsPending(card(true, true)), false);
  assert.equal(widgetsPending(card()), false);
  assert.equal(widgetsPending(null), false);
});

test("the clock does not start a held card's fade, then starts it the frame its widgets are up", () => {
  let t = 0, pending = true;
  const clock = createRevealClock({ now: () => t, hold: () => pending });
  const a = new Anim(200);
  assert.equal(clock.take(a), true);
  for (let i = 0; i < 10; i++) { t += 16; clock.drive(); }
  assert.equal(a.currentTime, 0, 'held at its start: the words are not shown');
  assert.equal(a.playState, 'paused');
  pending = false;
  t += 16; clock.drive();   // started now
  t += 16; clock.drive();
  assert.ok(a.currentTime > 0 && a.currentTime <= 32, `it runs from the frame the widgets came up: ${a.currentTime}`);
});

test('a hold is never longer than HOLD_MAX_MS, and a wait that ends unmet is told', () => {
  let t = 0, told = 0;
  const clock = createRevealClock({ now: () => t, hold: () => true, expired: () => { told++; } });
  const a = new Anim(200);
  clock.take(a);
  while (t < HOLD_MAX_MS - 20) { t += 16; clock.drive(); }
  assert.equal(a.currentTime, 0);
  while (t < HOLD_MAX_MS + 100) { t += 16; clock.drive(); }
  assert.ok(a.currentTime > 0, 'the fade goes on after the cap: the page\'s own look rather than nothing');
  assert.equal(told, 1, 'told once');
});

test('a screen on which no widget has ever come up stops waiting after two waits', () => {
  widgetState.live = 0; widgetState.misses = 0;
  assert.equal(widgetsPending(card(false)), true, 'the first card waits');
  widgetState.misses = 2;
  assert.equal(widgetsPending(card(false)), false, 'after two that waited for nothing, none does');
  widgetState.live = 1;
  assert.equal(widgetsPending(card(false)), true, 'and a widget that has come up anywhere makes the screen one that has them');
});
