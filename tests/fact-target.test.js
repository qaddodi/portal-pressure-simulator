// U14: every "About this patient" fact a built-in patient comes with either opens a real vessel or organ, or is one of the
// few that live elsewhere (drugs and diuretics in Treat, tones in Advanced physiology). Pregnancy opens the heart card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { EDGES } from '../src/engine/topology.js';
import { factTarget } from '../src/ui/fact-target.js';
import { PRESETS } from '../src/engine/scenario.js';

const ORGANS = new Set(['liver', 'spleen', 'varices', 'gastric', 'heart']);
const ELSEWHERE = /^(drug:|albumin$|diuretics$|anticoag$|splTone$|sysTone$|habr$|apShunt$)/;
// activeInterventions lives in inspector.js (needs a DOM to import): its keys are read from the source.
const src = readFileSync(new URL('../src/ui/inspector.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function activeInterventions'), src.indexOf('\n}\n', src.indexOf('export function activeInterventions')));
const keys = [...body.matchAll(/add\('([\w:]+)'/g)].map((m) => m[1]);

test('each fact key opens a vessel or organ that exists, or is known to live elsewhere', () => {
  assert.ok(keys.length >= 25, `found ${keys.length} keys`);
  const ids = new Set(EDGES.map((e) => e.id));
  for (const k of [...keys, 'fib:R:pre', 'sten:PV_TRUNK', 'thr:PV_TRUNK', 'occ:C5']) {
    const t = factTarget(k.endsWith(':') ? k + 'PV_TRUNK' : k);
    if (!t) { assert.match(k, ELSEWHERE, `${k} has no target`); continue; }
    assert.ok(t.type === 'organ' ? ORGANS.has(t.id) : ids.has(t.id), `${k} → ${t.type} ${t.id}`);
  }
});

test('built-in patients: clots, narrowings and occlusions open their own vessel', () => {
  const e = new Engine();
  const ids = new Set(EDGES.map((x) => x.id));
  let seen = 0;
  for (const { id } of PRESETS) {
    e.loadPreset(id);
    for (const [kind, map] of [['thr', e.params.thrombus], ['sten', e.params.stenosis], ['occ', e.params.occluded]]) {
      for (const vid of Object.keys(map || {})) { const t = factTarget(`${kind}:${vid}`); assert.deepEqual(t, { type: 'edge', id: vid }); assert.ok(ids.has(vid)); seen++; }
    }
  }
  assert.ok(seen >= 2, `only ${seen} vessel facts across the patients`);
});

test('the row is a button that puts Treat away and opens the card', () => {
  const chart = readFileSync(new URL('../src/ui/chart.js', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(chart, /const go = !undo && factTarget\(a\.key\);/);
  assert.match(chart, /class: 'chg-go'/); assert.match(chart, /onclick: \(\) => reveal\(go\) \}/);
  assert.match(main, /reveal: \(sel\) => \{ closeTreat\(\); select\(sel\); \},/);
});
