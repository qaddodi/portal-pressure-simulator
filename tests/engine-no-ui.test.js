// The simulation worker and the engine import nothing from ui/ (bible ENG-12, 19 Nov 2026: worker-core.js took easeMove from ui/ease.js, which would
// drag the page's motion code into the worker the day that file imported anything). A shared helper lives under src/engine/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const files = ['src/worker-core.js', 'src/worker.js', ...readdirSync(new URL('src/engine/', root)).filter((f) => f.endsWith('.js')).map((f) => `src/engine/${f}`)];

test('no worker or engine file imports from ui/', () => {
  const bad = [];
  for (const f of files) for (const m of readFileSync(new URL(f, root), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*from\s+'([^']+)'/g)) if (/(^|\/)ui\//.test(m[1])) bad.push(`${f} → ${m[1]}`);
  assert.deepEqual(bad, []);
});

test('the events\' words carry the cut-offs from the cuts modules, not typed copies', async () => {
  const src = readFileSync(new URL('src/engine/events.js', root), 'utf8');
  assert.ok(!/below 9 cm\/s|HVPG ≥10 mmHg|HVPG ≥12 mmHg/.test(src), 'a cut-off typed in an event\'s words');
  const { FLOW_CUTS } = await import('../src/engine/flow-cuts.js');
  assert.equal(FLOW_CUTS.stasis, 9);
});

test('the Shunted and Liver flow tiles\' bands and their events are the same numbers (FLOW_CUTS), as the bible\'s ENG-6 asked', async () => {
  const { FLOW_CUTS } = await import('../src/engine/flow-cuts.js');
  const { detectEvents } = await import('../src/engine/events.js');
  const ev = readFileSync(new URL('src/engine/events.js', root), 'utf8'), tm = readFileSync(new URL('src/ui/table-marks.js', root), 'utf8');
  for (const k of ['shuntLarge', 'liverSevere']) assert.ok(ev.includes(`FLOW_CUTS.${k}`) && tm.includes(`FLOW_CUTS.${k}`), `${k} in both`);
  assert.ok(!/shuntFraction > 0\.5|liverPerfPct < 60/.test(ev), 'no typed copy in the events');
  assert.ok(typeof detectEvents === 'function' && FLOW_CUTS.shuntLarge === 0.3 && FLOW_CUTS.liverSevere === 55);
});
