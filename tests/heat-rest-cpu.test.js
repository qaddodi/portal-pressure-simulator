// Mac heat at rest, round 3 (13 Nov 2026): two pieces of main-thread work that changed nothing on screen. The labels' pins asked for the
// middle of the same unchanged vessel course on every present (stage-paths.js arcMid), the largest single cost of a rest frame; it is now
// kept per course and walked again only when a point moved. (The varices' --vx: tests/varices-vx-quiet.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { createPaths } = await import('../src/ui/stage-paths.js');

// (The walk itself, as arcMid did it before it kept its answers: the reference the kept answers must equal, number for number.)
function walk(pts, at = 0.5) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + seg >= total * at && seg > 0) { const u = (total * at - run) / seg, dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; return [pts[i - 1][0] + dx * u, pts[i - 1][1] + dy * u, dx / seg, dy / seg]; }
    run += seg;
  }
  return [pts[0][0], pts[0][1], 1, 0];
}

test('arcMid gives the same numbers as the walk, kept or not, and walks again when a point moves in place or the share asked changes', () => {
  const { arcMid } = createPaths({ N_SAMPLES: 32, scratchG: null });
  const course = Array.from({ length: 32 }, (_, i) => [100 + i * 7.3 + Math.sin(i) * 3.1, 220 - i * 2.9 + Math.cos(i * 0.7) * 5.3]);
  for (let k = 0; k < 3; k++) assert.deepEqual([...arcMid(course)], walk(course), `asked ${k + 1} times`);
  assert.deepEqual([...arcMid(course, 0.32)], walk(course, 0.32), 'another share of the same course');
  assert.deepEqual([...arcMid(course)], walk(course), 'and the middle again');
  course[3][1] += 40; course[20][0] -= 12.5;   // (moved in place: the same array)
  assert.deepEqual([...arcMid(course)], walk(course), 'a point moved in place: walked again');
  course.push([400, 150]);
  assert.deepEqual([...arcMid(course)], walk(course), 'a point added');
  const flat = [[5, 5], [5, 5]];
  assert.deepEqual([...arcMid(flat)], walk(flat), 'a course of no length');
  const odd = [[0, 0], [NaN, 4], [3, 4]];
  assert.deepEqual([...arcMid(odd)], walk(odd), 'a course with a hole in it');
  assert.deepEqual([...arcMid(odd)], walk(odd), 'and again (a NaN never matches the kept copy)');
});
