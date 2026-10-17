import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easeTo, fluidSpring, fluidSpringFor } from '../src/ui/organ-ease.js';

// A patient changed while the lobule or the sinusoid covers the anatomy: the anatomy is not drawn, but its eases (the liver's
// shape and congestion, the ascites) run on the same clock, so zooming out shows the state reached by then, not an ease that
// only starts from the patient before.

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const fnBody = (name) => {
  const i = stage.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} not found`);
  let depth = 0, j = stage.indexOf('{', i);
  for (let k = j; k < stage.length; k++) { if (stage[k] === '{') depth++; else if (stage[k] === '}' && --depth === 0) return stage.slice(j, k + 1); }
  return '';
};

test('covered by the lobule, the figure still follows the patient, and draws nothing meanwhile', () => {
  const inner = fnBody('updateInner');
  assert.match(inner, /if \(under\) \{ followHidden\(f\); return; \}/);
  const follow = fnBody('followHidden');
  assert.match(follow, /easeLiver\(f, p, dt\)/);
  assert.match(follow, /fluidTarget\(ascTarget, f\.slow\.ascites\)/);
  assert.match(follow, /fluidSpringFor\(/);
  // (no painting while hidden: no DOM writes, no drawing, no raster)
  for (const w of ['setAttribute', 'style', 'putA', 'setA', 'setT', 'draw', 'platePoke', 'hidePlate', 'morphLiver', 'classList']) assert.ok(!follow.includes(w), `followHidden writes ${w}`);
  const liver = fnBody('easeLiver');
  for (const w of ['setAttribute', 'style', 'putA', 'draw', 'morphLiver']) assert.ok(!liver.includes(w), `easeLiver writes ${w}`);
});

test('shown again, the figure takes up where its eases have got to, and its stale raster is not shown', () => {
  const inner = fnBody('updateInner');
  assert.match(inner, /if \(hid\.at\) \{ followHidden\(f\);/);
  assert.match(inner, /plateStale = true/);
  assert.match(fnBody('platePoke'), /\(themed \|\| stale\) && veins\.hasPlate\(0\)/);
  // The drawn liver reads the hidden ease's own values (one shared state, one clock).
  assert.match(fnBody('updateOrgans'), /easeLiver\(f, p, Math\.min\(0\.1, \(performance\.now\(\) - lvAt\) \/ 1000\)\)/);
});

// The model's frames while covered (at most every 80 ms when nothing else changed, main.js onFrame).
function hiddenRun(seconds, frameMs, s0) {
  let lv = s0.lv, asc = s0.asc, vel = 0;
  for (let t = 0; t < seconds * 1000; t += frameMs) {
    lv = easeTo(lv, 1, frameMs / 1000);
    ({ shown: asc, vel } = fluidSpringFor(asc, vel, 6000, frameMs / 1000));
  }
  return { lv, asc, vel };
}

test('Healthy to Decompensated cirrhosis in the lobule: after a few seconds the anatomy and its ascites have already changed', () => {
  const r = hiddenRun(4, 80, { lv: 0, asc: 0 });
  assert.equal(r.lv, 1, 'the liver has taken its cirrhotic shape');
  assert.equal(r.asc, 6000, 'the ascites has formed');
});

test('zoomed out part way through, the change is part way, never the patient before', () => {
  const r = hiddenRun(0.4, 80, { lv: 0, asc: 0 });
  assert.ok(r.lv > 0.5 && r.lv < 1, `liver ${r.lv}`);
  assert.ok(r.asc > 0 && r.asc < 6000, `ascites ${r.asc}`);
});

test('one long catch-up step lands where steady frames would have', () => {
  let lv = 0;
  for (let i = 0; i < 25; i++) lv = easeTo(lv, 1, 0.04);
  assert.ok(Math.abs(easeTo(0, 1, 1) - lv) < 0.005, `${easeTo(0, 1, 1)} vs ${lv}`);
  const a = fluidSpringFor(0, 0, 6000, 1.0);
  let b = { shown: 0, vel: 0 };
  for (let i = 0; i < 20; i++) b = fluidSpring(b.shown, b.vel, 6000, 0.05);
  assert.ok(Math.abs(a.shown - b.shown) < 1e-6, `${a.shown} vs ${b.shown}`);
  // A paused model sends no frames: minutes covered still end at rest, quickly.
  assert.deepEqual(fluidSpringFor(0, 0, 6000, 600), { shown: 6000, vel: 0 });
  assert.equal(easeTo(0.2, 0.9, 600), 0.9);
});

test('draining while covered empties the belly exactly', () => {
  assert.deepEqual(fluidSpringFor(6000, 0, 0, 30), { shown: 0, vel: 0 });
});
