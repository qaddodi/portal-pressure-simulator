// The ascites fills the abdomen, so its wall follows the gut it holds. The wall ran about 80 world units (50 px) past the colon on each side,
// so the pool read as a flat-topped bowl wider than the belly behind the figure (play-test 16 Nov 2026: constrictive pericarditis, right heart
// failure + TR, Budd-Chiari, IVC web, SOS). The cavity is one shape for the GPU rows (cavityHalfWidths), the SVG clip and the drawn flank,
// so one test on the rows holds all three (tests/cavity-spans.test.js checks the rows are the outline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANS, cavityHalfWidths, flankPath, CAVITY_LOW, APPENDIX_D } from '../src/ui/anatomy.js';

const R = [284, 430, 856, 650], N = R[3] * 2 + 1;
const rows = (b) => cavityHalfWidths(b, R[1], R[3], N, new Float32Array(N));
const hwAt = (hw, y) => { const fy = (y - R[1]) / R[3] * (N - 1), r0 = Math.min(Math.floor(fy), N - 2); return hw[r0] + (hw[r0 + 1] - hw[r0]) * (fy - r0); };
const pts = (d) => { const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number), p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; };
const gutDs = ['colon', 'bowel'].map((id) => ORGANS.find((o) => o.id === id).cover.d);

test('at rest the wall clears the colon and small bowel on both sides by a thumb\'s width, and no more', () => {
  const hw = rows(0);
  const low = pts(gutDs[0]).filter(([, y]) => y > 700 && y < 930);
  const xMin = Math.min(...low.map(([x]) => x)), xMax = Math.max(...low.map(([x]) => x));
  for (const y of [760, 820, 880]) {
    const left = 712 - hwAt(hw, y), right = 712 + hwAt(hw, y);
    assert.ok(left < xMin - 12 && left > xMin - 70, `y ${y}: left wall ${left.toFixed(0)}, colon ${xMin}`);
    assert.ok(right > xMax + 12 && right < xMax + 90, `y ${y}: right wall ${right.toFixed(0)}, colon ${xMax}`);
  }
});

test('the wall at the foot stays clear of the appendix and the pool closes in a basin under it', () => {
  for (let b = 0; b <= 34; b += 17) {
    const hw = rows(b);
    for (const [x, y] of pts(APPENDIX_D).filter((_, i) => i % 2 === 1)) assert.ok(712 - x < hwAt(hw, y) - 4, `bulge ${b}: appendix point ${x},${y} touches the wall`);
    assert.ok(CAVITY_LOW > 1000, 'the floor lies below the appendix tip');
  }
});

test('the drawn flank is the same shape: its feet sit at the colon\'s width and it still bulges outward with the ascites', () => {
  const left = (b) => Number(flankPath(b).match(/ ([\d.]+) 954 C/)[1]);
  assert.ok(left(0) > 420 && left(0) < 450, `foot ${left(0)}`);
  assert.ok(left(34) < left(0), 'the wall bulges with the fluid');
});
