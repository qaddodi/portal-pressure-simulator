// A card coming up from nothing is built where it cannot be seen and opened once its GPU widgets are drawn (18 Nov 2026, Mohammad, the iPhone: "the card opens half-rendered: default sliders, then it switches
// to the real look"). widget-ready.js says what is still to come up; card.js (ac-prep) waits for it, at most PREP_MAX_MS, and a screen whose widgets never come up stops waiting after two cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widgetState, widgetsPending } from '../src/ui/widget-ready.js';

const host = (on) => ({ classList: { contains: (c) => c === 'wgl-on' && on } });
const wrap = (on) => ({ ...host(on), classList: { contains: (c) => (c === 'wgl-on' ? on : c === 'range-wrap') } });
const canvas = (on) => ({ classList: { contains: (c) => c === 'wgl' }, parentElement: host(on) });
const card = (...els) => ({ querySelectorAll: () => els });

test('a card with a slider not yet made, or made and not yet drawn, is pending; one whose widgets are all drawn, or with none, is not', () => {
  widgetState.live = 1; widgetState.misses = 0;
  assert.equal(widgetsPending(card(wrap(false))), true, 'the slider box, before its picture is even made');
  assert.equal(widgetsPending(card(canvas(false))), true, 'a canvas not yet drawn');
  assert.equal(widgetsPending(card(wrap(true), canvas(true))), false);
  assert.equal(widgetsPending(card(wrap(true), canvas(false))), true);
  assert.equal(widgetsPending(card()), false);
  assert.equal(widgetsPending(null), false);
});

test('a screen on which no widget has ever come up stops waiting after two waits, and starts again when one does', () => {
  widgetState.live = 0; widgetState.misses = 0;
  assert.equal(widgetsPending(card(wrap(false))), true, 'the first card waits');
  widgetState.misses = 2;
  assert.equal(widgetsPending(card(wrap(false))), false, 'after two that waited for nothing, none does');
  widgetState.live = 1;
  assert.equal(widgetsPending(card(wrap(false))), true, 'a widget that has come up makes the screen one that has them');
});
