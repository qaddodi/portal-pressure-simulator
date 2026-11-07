import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepJudge, frozenLabels, judgedFrames, labelsOverCards } from './e2e/label-judge.mjs';

const SIZE = [390, 844];
// A label at (x, y) 60x16 following its point (offset 0), `n` hand frames, the point moving (dx, dy) a frame.
const rows = (n, dx, dy, own = true, start = [150, 300]) => Array.from({ length: n }, (_, i) => ({ g: true, L: {
  'n:A': [own ? start[0] + i * dx : start[0], own ? start[1] + i * dy : start[1], start[0] + i * dx - 5, start[1] + i * dy - 5, 60, 16, 1],
} }));

test('a label that follows its point passes; one frozen while the point moves fails, on a pan and on a zoom', () => {
  assert.equal(stepJudge(rows(8, 6, -5), SIZE).worst < 1.5, true);
  const frozen = rows(8, 6, -5, false);
  assert.ok(stepJudge(frozen, SIZE).worst > 1.5, 'the strict pan rule sees it');
  assert.equal(stepJudge(frozen, SIZE, true).worst, 0, 'the loose zoom step rule alone does not (a glide is allowed)');
  assert.equal(frozenLabels(frozen, SIZE).length, 1, 'the zoom rule over the gesture does');
  assert.equal(frozenLabels(rows(8, 6, -5), SIZE).length, 0);
});

test('a label held at the stage edge while its point moves on is not frozen', () => {
  const held = Array.from({ length: 8 }, (_, i) => ({ g: true, L: { 'n:E': [4, 300, -20 - i * 8, 300, 60, 16, 1] } }));
  assert.equal(frozenLabels(held, SIZE).length, 0);
  assert.equal(stepJudge(held, SIZE).worst, 0);
});

test('frames not of the hand, or labels fading, are not judged', () => {
  const r = rows(8, 6, -5, false); r.forEach((x, i) => { if (i % 2) x.g = false; });
  assert.equal(judgedFrames(r), 0);
  assert.equal(frozenLabels(r, SIZE).length, 0);
  const fade = rows(8, 6, -5, false); fade.forEach((x) => { x.L['n:A'][6] = 0.5; });
  assert.equal(frozenLabels(fade, SIZE).length, 0);
});

test('labels over cards are judged from the displayed bounds and opacity, not the SVG', () => {
  const cards = [{ cls: 'stage-blocker', x0: 100, y0: 100, x1: 300, y1: 200 }];
  const snap = { seq: 3, gen: 1, items: [{ key: 'a', x: 120, y: 120, w: 50, h: 14, a: 1 }, { key: 'b', x: 120, y: 120, w: 50, h: 14, a: 0 }, { key: 'c', x: 20, y: 20, w: 50, h: 14, a: 1 }] };
  assert.deepEqual(labelsOverCards(snap, cards), [{ key: 'a', card: 'stage-blocker' }]);
});
