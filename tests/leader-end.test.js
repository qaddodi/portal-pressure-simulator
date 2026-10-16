// A leader reaches its label and stops on the edge of what is seen of it: never short of it (the anatomy's stopped 9 px
// short when zoomed in) and never in under its letters (the lobule's ran to each label's middle, through the text).
// Both views take the end from leader-end.js; the browser check "leaders reach their labels in every frame" follows it
// through the dive, a glide and a zoom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leaderEnd, leaderEndRects, runInside } from '../src/ui/leader-end.js';

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

test('a label seen run by run: the leader stops on the first run of letters it meets, not on the box round them all', () => {
  // A short name beside a tall number: from above the name, the leader comes down to the name's own top.
  const name = { x0: 100, x1: 140, y0: 56, y1: 70 }, num = { x0: 146, x1: 180, y0: 50, y1: 70 };
  const outer = { x0: 100, x1: 180, y0: 50, y1: 70 };
  const e = leaderEndRects([name, num], outer, 110, 0);
  assert.ok(Math.abs(e.y - 56) < 1e-9, `ends at y ${e.y}, the name's top is 56`);
  assert.ok(runInside([110, 0], [e.x, e.y], name) < 1e-9 && runInside([110, 0], [e.x, e.y], num) < 1e-9);
  assert.equal(leaderEndRects([name, num], outer, 120, 60), null);
});

test('the lobule and the anatomy both stop their leaders with leader-end.js', () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(lz, /import \{[^}]*\bleaderEnd\b[^}]*\} from '\.\/leader-end\.js/);
  assert.match(st, /import \{[^}]*\bleaderEnd as edgeOf\b[^}]*\bleaderEndRects\b[^}]*\} from '\.\/leader-end\.js/);
  // The lobule's leaders never end at the label's middle again (x2/y2 set straight from the placement's centre).
  assert.doesNotMatch(lz, /setAttribute\('x2', x\)/);
  // A gliding label takes its leader's end with it.
  assert.match(lz, /function syncLeaders\(/);
});

test('an optional lobule label gives way rather than take a leader across the lobule', () => {
  // (Batch 04, a phone: the Lymph label sat at the top right, its leader 420 px long over the whole lobule.)
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const m = /const LONG_LEAD = (\d+);/.exec(lz);
  assert.ok(m && +m[1] <= 160, 'LONG_LEAD is missing or too long');
  assert.match(lz, /!CORE\.includes\(k\) && !named\(k\) && lead > LONG_LEAD \? 1e6/);
  assert.match(lz, /const drop = \(k\) => \(named\(k\) \? 2e7 : CORE\.includes\(k\) \? 1e7 : 3e4\);/);
});

test('a zone name never sits on the slide\'s lesion ring', () => {
  // (CI #32, a phone: lobule slide 7, "Zone 3 centrilobular" 7 px from the ring's centre as the view settled.)
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(lz, /placeZones\(fr0, hx, hy, callRingAt\(fr0\)\)/);
  assert.match(lz, /tries\.find\(\(p\) => !ringDepth\(lesion, boxAt\(p\)\)\)/);
});

test('a leader towards a pill\'s rounded corner stops on the curve, not the square corner short of it', () => {
  // (HVPG slide 7 at 200 % on a phone: the Sinusoids leader stopped about 5 px off its lit pill's corner.)
  const pill = { x0: 0, y0: 0, x1: 100, y1: 40, r: 12 };
  for (const [ax, ay] of [[130, -30], [120, -5], [-40, 70], [104, 46]]) {
    const e = leaderEnd(pill, ax, ay);
    const qx = Math.min(Math.max(e.x, 12), 88), qy = Math.min(Math.max(e.y, 12), 28);
    const off = Math.hypot(e.x - qx, e.y - qy) - 12;
    const onCurve = Math.abs(e.x - qx) > 1e-9 && Math.abs(e.y - qy) > 1e-9;
    assert.ok(!onCurve || Math.abs(off) < 1e-6, `end (${e.x.toFixed(2)}, ${e.y.toFixed(2)}) is ${off.toFixed(2)} px off the curve`);
  }
  // Square boxes are unchanged, and a side hit stays on the side.
  assert.deepEqual(leaderEnd({ ...pill, r: 0 }, 150, 20), { x: 100, y: 20 });
  assert.deepEqual(leaderEnd(pill, 150, 20), { x: 100, y: 20 });
});
