// Work made for the rest after a card waits until the card has landed (17 Nov 2026, the tester: TIPS card open and close, frames 112 to 139 ms apart; stepped, the labels of the other
// view solved ahead ("label presolve") put one slice of 98 to 110 ms into the card's entrance frames). Whoever starts a card's entrance or exit says how long it runs; the work asks.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 1000;
performance.now = () => T;
const { cardMoveFor, cardMoveLeft } = await import('../src/ui/card-motion.js');

test('no card moves until one is said to', () => {
  assert.equal(cardMoveLeft(), 0);
});

test('a card that moves for 300 ms leaves what is left, counting down to nothing', () => {
  cardMoveFor(300);
  assert.equal(cardMoveLeft(), 300);
  T += 120;
  assert.equal(cardMoveLeft(), 180);
  T += 200;
  assert.equal(cardMoveLeft(), 0, 'landed');
});

test('a second card that moves keeps the latest end, and a shorter ask never cuts a longer one short', () => {
  cardMoveFor(400);
  T += 100;
  cardMoveFor(100);
  assert.equal(cardMoveLeft(), 300, 'the 400 ms move still has 300 to go');
  cardMoveFor(500);
  assert.equal(cardMoveLeft(), 500);
});
