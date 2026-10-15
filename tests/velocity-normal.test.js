// Colored by velocity, each vessel is set against its own normal range (velNormal.js): sand below it, teal within it,
// violet above it. Run through the TIPS Doppler talk, the bands match what the slides say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';
import { velNormal, dopplerVel, velPos } from '../src/ui/velNormal.js';
import { TIPS_DOPPLER } from '../src/ui/decks/tips-doppler.js';

const frame = (e) => ({ Q: e.Q, D: e.edges.map((x) => e.diameter(x.id)) });
const band = (e, id, healthy) => {
  const f = frame(e), k = e.ei[id], n = velNormal(k, f, healthy);
  if (!n) return 'none';
  const u = velPos(dopplerVel(f, k), n);
  return u < 0.33 ? 'slow' : u <= 0.67 ? 'normal' : 'fast';
};
function run(upTo) {
  const e = new Engine();
  for (const s of TIPS_DOPPLER.slides) {
    if (s.preset) e.loadPreset(s.preset);
    if (s.params) { e.setParams(deepMerge(e.params, s.params)); e.settle(); }
    if (s.days) { e.advanceDays(s.days, { noRupture: true, silent: true }); e.settle(); }
    if (s.id === upTo) return e;
  }
  throw new Error(`no slide ${upTo}`);
}
const H = new Engine(), healthy = frame(H);

test('in health every vein the figure colours reads normal, and collaterals have no normal', () => {
  for (const [k, x] of H.edges.entries()) {
    if (x.kind !== 'vein') continue;
    const n = velNormal(k, healthy, healthy);
    if (!n) continue;
    assert.equal(band(H, x.id, healthy), 'normal', x.id);
  }
  assert.equal(velNormal(H.ei.C1b, healthy, healthy), null);
});

test('the TIPS talk: slow portal vein before, a normal stent, then a slow stent and portal vein once it narrows', () => {
  assert.equal(band(run('before'), 'PV_TRUNK', healthy), 'slow');
  const ok = run('jet');
  assert.equal(band(ok, 'TIPS', healthy), 'normal');
  assert.equal(band(ok, 'PV_TRUNK', healthy), 'normal');
  const narrow = run('narrow');
  assert.equal(band(narrow, 'TIPS', healthy), 'slow');
  assert.equal(band(narrow, 'PV_TRUNK', healthy), 'slow', 'with a stent the main portal vein is slow under 30 cm/s');
});

test('the velocity keys name only the two ends, Slow and Fast, so they fit a phone', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
  const legend = read('main.js').split('\n').find((l) => l.includes("scale(velocityCss('to right')"));
  assert.match(legend, /\[\[0, 'Slow'\], \[100, 'Fast'\]\]/);
  assert.doesNotMatch(legend, /Normal/);
  const key = read('presenter.js').split('\n').find((l) => l.trim().startsWith("velocity: ['velocity'"));
  assert.match(key, /'Slow'/); assert.match(key, /'Fast'/); assert.doesNotMatch(key, /Normal/);
});
