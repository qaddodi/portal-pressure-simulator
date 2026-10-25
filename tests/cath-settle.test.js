// A catheter slide with a new patient (HVPG deck slide 9, Budd–Chiari; the lobule deck's wedge) changes the patient before its
// camera moves, and the catheter then drives the camera. While the liver and the fluid ease the organs are the live SVG drawing,
// which every camera frame paints again whole: the route's glide ran at about 1 fps. The catheter now sets off once the organs
// are back on the GPU copy (stage.organsSettled), as every other slide's camera moves over it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HVPG } from '../src/ui/decks/hvpg.js';

const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the HVPG deck has a catheter slide that brings a new patient', () => {
  const i = HVPG.slides.findIndex((s) => s.id === 'bc');
  assert.ok(i > 0 && HVPG.slides[i].cath && HVPG.slides[i].preset && HVPG.slides[i - 1].preset !== HVPG.slides[i].preset);
});

test('a catheter slide with a new patient waits for the organs to settle before the catheter moves the camera', () => {
  const run = pres.slice(pres.indexOf('async function transitionRun('));
  const wait = run.indexOf('if (ct && swap && glide) { await until(() => cut() || stage.organsSettled(), CATH_SETTLE_MS); if (cut()) return; }');
  const go = run.indexOf('if (ct) await cathTo(ct, st.fp, cut);');
  assert.ok(wait > 0 && go > wait, 'the wait comes right before the catheter starts');
  // The patient has already changed by then: for a catheter slide the morph runs before the cards (later is false).
  assert.match(run, /later = glide && !ct && !!ui/);
  assert.ok(run.indexOf('if (!later) { if (!await morphTo(st, cut)) return;') < wait);
  // Never held for long: a model still drifting lets the catheter go after a few seconds.
  const ms = Number(pres.match(/const CATH_SETTLE_MS = (\d+);/)?.[1]);
  assert.ok(ms > 0 && ms <= 5000, `CATH_SETTLE_MS ${ms}`);
});

test('the organs count as settled once the GPU copy shows them, or when there is no GPU', () => {
  assert.match(stage, /organsSettled: \(\) => plateOn\(\) \|\| !glWanted\(\),/);
  // The copy comes off for a patient change and goes back on only once the liver and the fluid have stopped easing.
  assert.match(stage, /function hidePlate\(\) \{[^}]*wrap\.classList\.remove\('gl-plate'\)/);
  assert.match(stage, /if \(!live && \(lvMoving \|\| fluidEasing\(\)\)\) \{ if \(plateKey && veins\.hasPlate\(0\) && plateStateKey\(\) !== plateKey\) hidePlate\(\); return; \}/);
});
