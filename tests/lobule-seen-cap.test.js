import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveZoomShare } from '../src/ui/lobule-live.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Mohammad, 2 Nov 2026: "Why is zooming in in lobule view laggy". Each zoom-in that landed painted the lobule's bitmap again at the
// new zoom's sharpness (up to 3600 px square, recorded on the main thread and rastered on the GPU in one go: a 0.2 to 0.5 s hitch),
// though the shader draws the whole lobule from a cell of 6 px up and mixes that bitmap out. The bitmap is now never painted sharper
// than the zooms at which it is still seen.
const capOf = (R) => 2 ** (Math.ceil(Math.log2(6 / (0.052 * R)) * 2) / 2);

test('the cap is sharp enough for every zoom at which the bitmap still shows, and no more than a step past it', () => {
  for (const R of [40, 77, 100, 133.3, 180, 260, 400]) {
    const cap = capOf(R), edge = 6 / (0.052 * R);
    assert.equal(liveZoomShare(cap, R), 1, `R ${R}: at the cap the shader has the whole picture`);
    assert.ok(cap >= edge - 1e-9 && cap <= edge * Math.SQRT2 + 1e-9, `R ${R}: cap ${cap} within a step of ${edge}`);
  }
});

test('the bitmap is capped only once the shader has fully eased in', () => {
  const lz = src('src/ui/lobule-zoom.js');
  assert.doesNotMatch(lz, /SEEN_CAP|seencap/);
  assert.match(lz, /const seenCap = \(G\) => \(liveE >= 1 && liveGoal\(\) === 1 && tissueOnGL \? 2 \*\* \(Math\.ceil\(Math\.log2\(6 \/ \(0\.052 \* G\.R\)\) \* 2\) \/ 2\) : Infinity\);/);
  // (paintTissue and the bitmap painted ahead both take it.)
  assert.match(lz, /const ws = worldStateOf\(m, G, dark, cs\);\n {4}const seen = seenCap\(G\);\n {4}if \(sc > seen\) \{ sc = seen;/);
  assert.match(lz, /\* 2, cap, seenCap\(G\)\);/);
});

test('a bitmap painted sharper before the shader took over is painted again small, between frames', () => {
  const lz = src('src/ui/lobule-zoom.js');
  assert.match(lz, /if \(worldSc > cap0 \* 2\.01 && worldCv\.width && worldGeo === G && ws === worldState && !xfT0\) \{/);
});

// Zoomed far in, whole bins of the lobule drew black: the septa's shadow took tanh of d1 / sg, which runs to the thousands once px
// (and so sg) is small, and tanh's (e^x − e^−x) / (e^x + e^−x) is inf / inf there, a NaN.
test('the live tissue shader never takes tanh of an unbounded number', () => {
  const live = src('src/ui/lobule-live.js');
  assert.match(live, /tanh\(clamp\(0\.85 \* d1 \/ sg, -10\.0, 10\.0\)\)/);
  for (const m of live.matchAll(/tanh\(([^)]*)/g)) assert.match(m[1], /^clamp\(/, `unclamped tanh(${m[1]}`);
});
