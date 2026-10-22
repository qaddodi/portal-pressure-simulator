import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 22 Oct: a deck opened with the figure beside where it belonged, then moved to the middle just after the start's cover lifted.
// The cover now lifts only on the final framing, set outright under it, and the stage's first fit leaves a slide's framing alone.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const pz = read('../src/ui/presenter.js'), st = read('../src/ui/stage.js');

test('under the start cover the camera is set outright, never a glide the reveal can catch', () => {
  assert.match(pz, /const gl = booting \? 0 : ms \|\| 300;/);
  assert.match(pz, /fitAround\(s, cam, booting \? 0 : ms\);/);
  assert.match(pz, /if \(booting\) \{ clearTimeout\(reframeT\); reframeT = 0; reframe\(0\); return; \}/);
});

test('the cover reframes for a late resize or settled cards, and once more as the entrances end, before it lifts', () => {
  const cd = pz.slice(pz.indexOf('async function coverDown('), pz.indexOf('clearTimeout(coverT); booting = false;'));
  assert.match(cd, /if \(sizeNow\(\) !== sizeSeen\) onResize\(\{ type: 'resize' \}\); else if \(cardSig\(\) !== framedSig\) reframe\(0\);/);
  assert.match(cd, /await wait\(60\); settle\(\);/);
  assert.match(cd, /if \(ui && shown && booting\) \{ settle\(\); clearTimeout\(reframeT\); reframeT = 0; reframe\(0\); \}/);
});

test('the stage\'s first fit leaves a presenting slide\'s framing alone and glides when the figure already shows', () => {
  const ff = st.slice(st.indexOf('function firstFrame()'), st.indexOf('showFigure();', st.indexOf('function firstFrame()')));
  assert.match(ff, /!userMoved && !store\.get\(\)\.presenting/);
  assert.match(ff, /if \(figureShown\) \{ homeAt = d; fitted = true; if \(!sameView\(d, vtGliding \? vtTarget : vt\)\) animateVT\(d, 450\); \}/);
});

test('under the start cover a slide with no framing of its own (the outline) takes the stage\'s fit outright', () => {
  const rf = pz.slice(pz.indexOf('function reframe(ms)'), pz.indexOf('function fitAround('));
  assert.match(rf, /if \(booting && !cam && !store\.get\(\)\.lobule\) \{ stage\.fitSlow\(0\); return; \}/);
});
