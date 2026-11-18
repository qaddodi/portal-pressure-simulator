// The Doppler's vessel (16 Nov 2026, play-test T01: "Cannot read properties of undefined (reading 'label')" in a rest pass, 4 of 6 tries opening
// tips-doppler and pressing Next twice). A presentation that ended before the store had a frame put a null vessel back on the model; every later
// frame then named no vessel and the Doppler's spoken summary read EDGES[EI[null]].label. The model now keeps its vessel unless it is given an
// edge it has, and (presenter-tools.js puts back only a vessel it saved, and doppler.js ignores a frame that names none.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';

test('the model keeps its vessel when asked for none or for one it has not', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  t.after(() => core.dispose());
  core.handle({ type: 'init' });
  const probeAfter = (id) => {
    frames.length = 0;
    core.handle({ type: 'probe', id });
    for (let k = 0; k < 12 && !frames.length; k++) { now += 100; t.mock.timers.tick(100); }
    return frames.at(-1)?.probe;
  };
  assert.equal(probeAfter('TIPS'), 'TIPS', 'an edge of the model is taken');
  assert.equal(probeAfter(null), 'TIPS', 'null leaves the vessel as it was');
  assert.equal(probeAfter(undefined), 'TIPS', 'so does nothing');
  assert.equal(probeAfter('scope'), 'TIPS', 'and a name that is no edge');
  assert.equal(probeAfter('PVH_R'), 'PVH_R', 'a real one is taken again');
});
