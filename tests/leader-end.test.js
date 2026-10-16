// A leader reaches its label and stops on the edge of what is seen of it: never short of it (the anatomy's stopped 9 px
// short when zoomed in) and never in under its letters (the lobule's ran to each label's middle, through the text).
// Both views take the end from leader-end.js; the browser check "leaders reach their labels in every frame" follows it
// through the dive, a glide and a zoom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leaderEnd, runInside } from '../src/ui/leader-end.js';

const box = { x0: 100, y0: 50, x1: 160, y1: 70 };
const onEdge = (p, b) => {
  const inX = p.x >= b.x0 - 1e-9 && p.x <= b.x1 + 1e-9, inY = p.y >= b.y0 - 1e-9 && p.y <= b.y1 + 1e-9;
  return inX && inY && Math.min(Math.abs(p.x - b.x0), Math.abs(p.x - b.x1), Math.abs(p.y - b.y0), Math.abs(p.y - b.y1)) < 1e-9;
};

test('a leader ends on its label\'s edge from every side, aimed at the middle', () => {
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2, a = [130 + Math.cos(t) * 140, 60 + Math.sin(t) * 90];
    const e = leaderEnd(box, a[0], a[1]);
    assert.ok(e, `no end from (${a})`);
    assert.ok(onEdge(e, box), `end (${e.x}, ${e.y}) is not on the box's edge`);
    // On the line from the spot to the label's middle, and nothing of the leader inside the box.
    const cross = (e.x - a[0]) * (60 - a[1]) - (e.y - a[1]) * (130 - a[0]);
    assert.ok(Math.abs(cross) < 1e-6, 'the end is off the line to the middle');
    assert.ok(runInside(a, [e.x, e.y], box) < 1e-6, 'the leader runs into its label');
  }
});

test('a spot inside its own label has no leader', () => {
  assert.equal(leaderEnd(box, 120, 60), null);
});

test('runInside measures how far a segment runs through a box, not a graze', () => {
  assert.ok(Math.abs(runInside([0, 60], [200, 60], box) - 60) < 1e-9);
  assert.equal(runInside([0, 50], [200, 50], box), 0);   // along the top edge
  assert.equal(runInside([0, 0], [90, 90], box), 0);
  assert.ok(Math.abs(runInside([130, 0], [130, 60], box) - 10) < 1e-9);
});

test('the lobule and the anatomy both stop their leaders with leader-end.js', () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(lz, /import \{[^}]*\bleaderEnd\b[^}]*\} from '\.\/leader-end\.js/);
  assert.match(st, /import \{[^}]*\bleaderEnd as edgeOf\b[^}]*\} from '\.\/leader-end\.js/);
  // The lobule's leaders never end at the label's middle again (x2/y2 set straight from the placement's centre).
  assert.doesNotMatch(lz, /setAttribute\('x2', x\)/);
  // A gliding label takes its leader's end with it.
  assert.match(lz, /function syncLeaders\(/);
});
