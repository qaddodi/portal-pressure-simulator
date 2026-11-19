import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, stentCourse } from '../src/engine/portal/topology.js';

const edge = (id) => EDGES.find((e) => e.id === id);

test('a stent names its course from where the model connects it', () => {
  assert.equal(stentCourse(edge('TIPS')), 'RPV → RHV');
  assert.equal(stentCourse(edge('DIPS')), 'PV → IVC');
  const drawn = EDGES.find((e) => e.shunt === 'custom');
  assert.match(stentCourse(drawn), /^\S+ → \S+$/);
});

