import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, stentCourse } from '../src/engine/topology.js';

const edge = (id) => EDGES.find((e) => e.id === id);

test('a stent names its course from where the model connects it', () => {
  assert.equal(stentCourse(edge('TIPS')), 'RPV → RHV');
  assert.equal(stentCourse(edge('DIPS')), 'PV → IVC');
  const drawn = EDGES.find((e) => e.shunt === 'custom');
  assert.match(stentCourse(drawn), /^\S+ → \S+$/);
});

test('the Doppler shows the TIPS course in its vessel list and monitor label', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.match(src, /probeName\(p\)\)\)/);               // the vessel picker
  assert.match(src, /probe \? probeName\(meta\(\)\)/);   // the monitor's label strip
});
