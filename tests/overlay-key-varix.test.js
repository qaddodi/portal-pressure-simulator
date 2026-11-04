import { stageSource } from './stage-src.js';
// 31 Oct 2026 (Explore smoothness and heat): the overlays (clamps, clots, plugs, bands, balloons) are rebuilt when overlayInputs' key
// changes, and every rebuild bumps the vessel marks' version (a style read of every overlay shape and a triangulation of them all).
// The key held the varix's diameter, radius and wall-stress ratio, and the fundal varix's diameter, in steps narrower than the beat's
// swing of them (0.8 mm against a 0.5 mm step), so in any patient with a varix the overlays and marks were rebuilt five to ten times a
// second while nothing on screen changed. The overlays no longer draw the varices (the plexus of channels does, varix-look.js), so
// those four numbers are not what they are built from. This test keeps it so: a reader of a varix number in the overlay code has to
// put it in the key on purpose, and hold it against the beat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const between = (from, to) => { const a = stage.indexOf(from), b = stage.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} ... ${to}`); return stage.slice(a, b); };

test('the overlays\' rebuild key holds no varix number (they pulse with the beat and nothing the overlays draw follows them)', () => {
  const inputs = between('function overlayInputs(f, p, t) {', 'function updateOverlays(');
  assert.doesNotMatch(inputs.replace(/\/\/[^\n]*/g, ''), /varix|Varix|metrics|hold\('v[drt]'|hold\('gd'/, 'overlayInputs reads no varix metric');
  assert.match(inputs.replace(/\/\/[^\n]*/g, ''), /Math\.round\(f\.bands \|\| 0\), hold\('c3', recruitFrac\('C3', f\), 0\.1\),\s*p\.splenicRx === 1 \? hold\('sp', f\.slow\.spleen \/ 11, 0\.02\) : 0, (?:live\.)?lastMorph\);/, 'the key still ends in the bands, the C3 recruitment, the spleen\'s size (patches only) and the morph');
});

test('what the overlays rebuild draws from reads no varix number either', () => {
  const body = between('function updateOverlays(f, p, gain, t) {', 'return { clampFontAt');
  assert.doesNotMatch(body.replace(/\/\/[^\n]*/g, ''), /metrics\??\.(varix|gastricVarix)|varixGrowth|varicesPresent/, 'updateOverlays draws no varix from its metrics');
});
