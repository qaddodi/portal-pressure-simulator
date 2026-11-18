// What the page makes on the GPU does not grow when the learner goes round and round (18 Nov 2026, the iPhone's tab killed on a deck's slide change: the first thing to
// rule in or out is a leak). The real stage is booted in node on a phone-sized screen with a context that counts every texture, framebuffer, renderbuffer, buffer, vertex
// array and program made and not let go (tests/gl-live.js); the lobule, the sinusoid and the anatomy are visited in turn, the HVPG deck's wedge wash running in the lobule
// and a close camera view after it, and from the second round on the counts and bytes read the same at the same place. A resource made per visit and kept fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, diff } from './gl-live.js';
import { bootGL, pump } from './stage-gl-boot.js';

test('three rounds of lobule, wash, sinusoid and back leave the GPU holding exactly what the second round did', { timeout: 280000 }, async () => {
  const { st } = await bootGL({ w: 395, h: 859, dpr: 3, coarse: true, labels: 'all' });
  const { store, setViewKey } = await import('../src/ui/store.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  const run = async (n) => { for (let i = 0; i < n; i++) { pump(16.7); await tasks(); } };
  await run(100);
  const rounds = [];
  for (let c = 0; c < 4; c++) {
    setViewKey('lobule'); await run(250);
    store.set1('sinusoidWash', true); await run(300);
    st.diveToSinusoid(); await run(250);
    store.set1('sinusoidWash', false);
    setViewKey('anatomy'); await run(300);
    st.setCamera({ k: 4, x: -1200, y: -1000 }, 300); await run(300);   // (a close view of the catheter's tip: the sharp organ picture)
    st.setCamera({ k: 1, x: 0, y: 0 }, 300); await run(400);
    rounds.push(snapshot());
  }
  assert.ok(rounds[0].made > 1000 && rounds[0].texture > 20 && rounds[0].bytes > 50e6, 'the counting context saw the stage: a dead counter would read flat everywhere');
  // (round 0 warms everything the visit makes once; after it the same visit makes nothing new)
  for (let c = 2; c < rounds.length; c++) {
    const d = diff(rounds[c - 1], rounds[c]);
    for (const k of ['texture', 'framebuffer', 'renderbuffer', 'buffer', 'vao', 'program', 'shader', 'contexts']) assert.equal(d[k] || 0, 0, `${k} after round ${c}: ${JSON.stringify(d)}`);
    assert.ok(Math.abs(rounds[c].bytes - rounds[c - 1].bytes) < 0.02 * rounds[c - 1].bytes, `bytes after round ${c}: ${rounds[c - 1].bytes} to ${rounds[c].bytes}`);
  }
});
