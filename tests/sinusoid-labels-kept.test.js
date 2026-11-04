// The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct: "keep most of the labels especially hepatocyte, lymph,
// portal venule, central vein and the arrows"): a slide's lit names take the pill, the rest stay plain as in Explore, and only
// the lobule's own names ease out. The Fenestrae callout points at a fenestra, not at an endothelial cell body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poreAt, calloutPore, underNucleus, nucAt, NUC_COVER, SEED, SLOT } from '../src/ui/sinusoid-gl.js';

const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const GL = readFileSync(new URL('../src/ui/sinusoid-gl.js', import.meta.url), 'utf8');
const VIEW = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');

test('a lit sinusoid name still takes the pill and its colour', () => {
  const pill = CSS.split('\n').find((l) => l.includes(')::before { opacity: 1;')) || '';
  for (const k of ['fenestrae', 'disse', 'stellate', 'kupffer', 'hepatocyte', 'lymph', 'lumen']) assert.ok(pill.includes(`.app[data-lit~="sinusoid:${k}"] [data-target="sinusoid:${k}"]`), k);
  assert.match(pill, /^:is\(\.lz-lab, \.lz-zone, \.sv-region\):is\(/);
});

test('the end arrows follow their names, so the kept names keep their arrows', () => {
  assert.match(VIEW, /const endShown = \(key\) => \{/);
  assert.match(VIEW, /\(cap\.on \? 1 : \+getComputedStyle\(e\)\.opacity \|\| 0\) \* \(\+getComputedStyle\(e\.firstElementChild\)\.opacity \|\| 0\) \* \(\+getComputedStyle\(labels\)\.opacity \|\| 0\)\);/);
  // (A name drawn by the GPU fades there, caption-gl.js: its arrow takes the GPU's own strength for it.)
  assert.match(VIEW, /return \(endOp\[key\] \?\? 0\) \* \(cap\.on \? cap\.at\(key, easeNow\(\)\)\?\.a \?\? 0 : 1\);/);   // (the ends' names at full ink since 2 Nov 2026: no 0.78 to divide by)
  assert.match(VIEW, /END_NAMES = \['Portal venule', 'Central vein'\]/);
  assert.match(VIEW, /value = pressTxt\(u, u \? m\.P3 : m\.P1\)/);
  assert.match(VIEW, /region\('hep', 'Hepatocyte'/);
  assert.match(VIEW, /region\('lymph', 'Lymph'/);
});

const pores = (sd, from = -120, to = 120) => { const a = []; for (let j = from; j < to; j++) { const p = poreAt(j, sd); if (p) a.push(p); } return a; };

test('the nucleus swell\'s reach matches the shader\'s nucAt and swell', () => {
  assert.match(GL, /float nucAt\(int n, int nsd\) \{ return 38\.0 \* float\(n\) \+ 8\.0 \+ 22\.0 \* h1\(n, nsd\); \}/);
  for (const n of [-2, 0, 3]) { const c = nucAt(n, SEED.nucUp); assert.ok(c >= 38 * n + 8 && c < 38 * n + 30, `nucleus ${n} sits in its 38 µm slot (${c})`); }
  // (the swell: a 3.3 µm half length blended 0.9 into the sheet, in the shader's sdEndo)
  assert.match(GL, /sdE\(q, vec2\(3\.3, th \+ 0\.55 \* det\)\), 0\.9\)/);
  assert.ok(NUC_COVER >= 3.3 + 0.9, 'clear of the swell and its blend');
});

test('the Fenestrae callout never points at a pore under a cell body', () => {
  const upper = pores(SEED.poreUp);
  assert.ok(upper.length > 20);
  // The old pick (the pore that stays open longest within 9 µm) at the view's centre ran into the nucleus at 12.4 µm: pore 15.5, 3.1 µm from its centre.
  const old = (x) => upper.filter((p) => Math.abs(p.x - x) < 9).reduce((m, p) => (!m || p.th < m.th ? p : m), null);
  assert.ok(underNucleus(old(14).x, SEED.nucUp), 'the old pick sat under a swell');
  let moved = 0;
  for (let x = -90; x <= 90; x += 0.5) {
    const at = calloutPore(upper, x, -100, 100, SEED.nucUp);
    assert.ok(upper.some((p) => p.x === at), `x ${x}: a pore of the lining (${at})`);
    assert.ok(!underNucleus(at, SEED.nucUp), `x ${x}: pore ${at} is under a nucleus swell`);
    assert.ok(Math.abs(at - x) <= 20, `x ${x}: stays near what it was set at (${at})`);
    if (old(x) && old(x).x !== at) moved++;
  }
  assert.ok(moved > 10, 'the pick did change where it used to be covered');
});

test('the Fenestrae callout is by place only, in view where a pore is, and falls back to where it was set', () => {
  const upper = pores(SEED.poreUp);
  // Not by how open the wall is (the callout's leader does not hop as pores close): no open share goes in.
  assert.equal(calloutPore.length, 5);
  assert.doesNotMatch(VIEW.split('\n').find((l) => l.includes('const fenAt = ')), /S\.por/, 'fenAt does not read the open share');
  // In view: a pore inside the bounds is chosen over a better one outside them.
  const a = calloutPore(upper, 40, 35, 50, SEED.nucUp);
  assert.ok(a >= 35 && a <= 50, `in view (${a})`);
  // None clear at all: where it was set.
  assert.equal(calloutPore([], 12, -5, 5, SEED.nucUp), 12);
  const only = [{ x: nucAt(0, SEED.nucUp) + 0.5, w: 0.6, th: 0.2 }];
  assert.equal(calloutPore(only, nucAt(0, SEED.nucUp), -1e3, 1e3, SEED.nucUp), nucAt(0, SEED.nucUp), 'a pore under the swell is not chosen even when it is the only one');
  assert.ok(SLOT > 0);
});

test('both layouts take the pore from the one helper', () => {
  assert.match(VIEW, /const fenAt = \(x\) => calloutPore\(geo\.pores\[0\], x, VW\.fr\[0\] \+ 3, VW\.fr\[1\] - 3, SEED\.nucUp\);/);
  assert.equal(VIEW.split('fenAt(').length - 1, 3, 'three calls (across, beside the stellate cell, down)');
  assert.match(VIEW, /leader\('fen', rf, xp, -\(halfW\(xp\) \+ UM\.endo \* 0\.5\)\)/, 'the callout ends on the pore\'s gap in the lining');
  assert.match(VIEW, /leader\('fen', region\('fen', 'Fenestrae', fenTxt\(\), x, -midTall\(x\)\), xp, -\(halfW\(xp\) \+ UM\.endo \* 0\.5\)\)/);
});
