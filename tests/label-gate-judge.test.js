import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorError, dotError, foreignFrames, restDrift, judgedFrames, pointTravel } from './e2e/label-gate-judge.mjs';

const SIZE = [390, 844];
// A label 60x16 offset (-5, -5) from its point; the point moves (dx, dy) a frame; `lag` px of extra drift per frame on the label.
const rows = (n, dx, dy, lag = 0) => Array.from({ length: n }, (_, i) => ({ g: 1, view: 'anatomic', L: { 'n:A': { x: 150 + i * (dx + lag) - 5, y: 300 + i * dy - 5, w: 60, h: 16, a: 1, ax: 150 + i * dx, ay: 300 + i * dy, dx: 150 + i * dx, dy: 300 + i * dy } } }));

test('a label that rides with its point passes at 0.5 device px; a quarter-pixel lag per frame at dpr 3 fails', () => {
  assert.equal(anchorError(rows(8, 6, -5), SIZE, 3).worst, 0);
  assert.ok(anchorError(rows(8, 6, -5, 0.2), SIZE, 3).worst > 0.5, '0.2 css px × 3 = 0.6 device px');
  assert.ok(anchorError(rows(8, 6, -5, 0.2), SIZE, 1).worst < 0.5, 'the same lag is under the limit at dpr 1: the limit is device px');
});

test('a frozen label fails; a gliding, fading or edge-held one is not judged', () => {
  const frozen = rows(8, 6, -5); frozen.forEach((r, i) => { r.L['n:A'].x = 145; r.L['n:A'].y = 295; });
  assert.ok(anchorError(frozen, SIZE, 1).worst > 5);
  const g = rows(8, 6, -5, 3); g.forEach((r) => { r.L['n:A'].glide = true; });
  assert.equal(anchorError(g, SIZE, 1).frames, 0);
  const f = rows(8, 6, -5, 3); f.forEach((r) => { r.L['n:A'].a = 0.5; });
  assert.equal(anchorError(f, SIZE, 1).frames, 0);
  const e = rows(8, 6, -5, 3); e.forEach((r) => { r.L['n:A'].x = 2; });
  assert.equal(anchorError(e, SIZE, 1).frames, 0);
});

test('frames outside the judged motion are not counted', () => {
  const r = rows(8, 6, -5, 3); r.forEach((x, i) => { if (i % 2) x.g = 0; });
  assert.equal(judgedFrames(r), 0);
  assert.equal(anchorError(r, SIZE, 1).frames, 0);
});

test('a dot off its point fails, in device px', () => {
  const r = rows(3, 0, 0); r[1].L['n:A'].dx += 0.4;
  assert.ok(dotError(r, 2).worst > 0.5);
  assert.ok(dotError(r, 1).worst < 0.5);
});

test('a label of another view in any frame is reported', () => {
  const r = rows(3, 0, 0); r[1].L['n:A'].foreign = true; r[2].L['n:A'].foreign = true; r[2].L['n:A'].a = 0;
  assert.deepEqual(foreignFrames(r).length, 1);
});

test('drift at rest is seen', () => {
  const r = rows(3, 0, 0); r[2].L['n:A'].x += 0.3;
  assert.ok(restDrift(r, 3).worst > 0.5);
});

test('a motion that moved no point is seen, so a still view cannot pass for tracking', () => {
  assert.equal(pointTravel(rows(5, 0, 0)), 0);
  assert.ok(pointTravel(rows(5, 3, 4)) >= 20);
});
