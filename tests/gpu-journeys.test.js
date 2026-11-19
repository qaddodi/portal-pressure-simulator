// The page walked along the paths a learner takes, on a phone, with the GPU budget's own accounting (tests/gpu-journey.js): the most the registry read on the way, what it read at rest,
// what nothing could give back, the contexts alive. Written after the iPhone's tab was killed on the HVPG deck's slide 5 to 6 and on the Tests card's IR pane to Doppler (19 Nov 2026):
// the first bug packet from the phone read the figure holding 235 MB of the 320 MB envelope at rest, and nothing in node had looked at the level a step starts from, only at what a step left behind.
//
// The limits are shares of the phone's envelope, with the rest of the page (the JS heap, the compositor, a driver's own padding) left to the other 1 - share:
//   - at rest in the Anatomy, whatever the Tests card shows: 60%, so a card, a pane or a view that asks for a few tens of MB never takes a phone to its edge;
//   - zoomed on the catheter's tip, with the sharp picture: 75%;
//   - at the peak of any path, the dive into the lobule included: 92%, and never a byte that no holder could give back;
//   - the contexts: the figure's own and the charts' two shared pools, no more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journeyRig } from './gpu-journey.js';

const TAB = ['profile', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'trials', 'readouts', 'scope', 'hvpg', 'doppler'];
let rig, env;
const share = (mb) => mb / env;
const said = (r) => `${JSON.stringify(r)}`;

test('boot', { timeout: 280000 }, async () => {
  rig = await journeyRig(); env = rig.envelopeMB;
  await rig.run(150, 'boot');
  const r = rig.report();
  assert.ok(r.nowMB > 20, `the registry sees the page (${r.nowMB} MB)`);
  assert.ok(share(r.nowMB) <= 0.6, `at rest the figure holds ${r.nowMB} MB, ${Math.round(100 * share(r.nowMB))}% of a phone's ${env} MB: ${r.owners.join(', ')}`);
  assert.ok(r.ownContexts <= 1 && r.chartContexts <= 2, `contexts: ${said(r)}`);
});

test('the Tests card, pane to pane in the Anatomy (IR to Doppler and the rest), holds the level it started at', { timeout: 280000 }, async () => {
  await rig.run(60, 'rest'); rig.start();
  const before = rig.report().nowMB;
  for (const p of TAB) await rig.pane(p, 60);
  const r = rig.report();
  assert.ok(share(r.peakMB) <= 0.6, `a pane took the page to ${r.peakMB} MB at ${r.peakAt}`);
  assert.ok(r.nowMB <= before * 1.02 + 1, `the page held ${before} MB before the panes and ${r.nowMB} MB after them (it may let go of warm views meanwhile, never hold more)`);
  assert.equal(r.unmetMB, 0, `pressure no holder could meet: ${said(r)}`);
});

test('zoomed on the catheter\'s tip with the sharp picture, a pane of the Tests card on top, the page keeps its room', { timeout: 280000 }, async () => {
  rig.start();
  rig.st.setCamera({ k: 4, x: -1500, y: -330 }, 300); await rig.run(300, 'tip close');
  for (const p of ['doppler', 'hvpg', 'doppler']) await rig.pane(p, 60);
  const r = rig.report();
  assert.ok(share(r.nowMB) <= 0.75, `at the tip with a pane open the page holds ${r.nowMB} MB (${Math.round(100 * share(r.nowMB))}%): ${r.owners.join(', ')}`);
  assert.equal(r.unmetMB, 0, said(r));
});

test('the views, the dive into the lobule and the way out: the peak stays under 92% and every byte over could be given back', { timeout: 280000 }, async () => {
  rig.st.setCamera({ k: 1, x: 0, y: 0 }, 300); await rig.run(250, 'fit');
  rig.start(); rig.began = rig.report().nowMB;
  for (const v of ['lobule', 'anatomy', 'circuit', 'anatomy', 'lobule', 'anatomy']) await rig.view(v);
  const r = rig.report();
  assert.ok(share(r.peakMB) <= 0.92, `the peak was ${r.peakMB} MB (${Math.round(100 * share(r.peakMB))}%) at ${r.peakAt}`);
  assert.equal(r.unmetMB, 0, said(r));
  // (Kept after closing: the phone check on the iPhone read the page 97 to 121 MB above where a path began once everything was put away, 19 Nov 2026. A minute of rest later
  // the page holds what it began with, give or take the warm views' share.)
  const began = rig.began;
  await rig.run(1500, 'a minute at rest');
  const end = rig.report().nowMB;
  assert.ok(end <= began * 1.1 + 5, `the path began at ${began} MB and, a minute after it, the page holds ${end} MB: ${rig.report().owners.join(', ')}`);
});

test('the HVPG deck from slide 4 to slide 6: the tip, the lobule and its wash, the sinusoid, the way out to the tip', { timeout: 280000 }, async () => {
  rig.st.setCamera({ k: 1, x: 0, y: 0 }, 300); await rig.run(250, 'fit');
  for (let round = 0; round < 3; round++) {
    rig.start();
    rig.st.setCamera({ k: 4, x: -1500, y: -330 }, 300); await rig.run(300, `round ${round} slide 4 tip`);
    rig.setViewKey('lobule'); await rig.run(250, `round ${round} slide 5 lobule`);
    rig.store.set1('sinusoidWash', true); await rig.run(250, `round ${round} wash`);
    rig.st.diveToSinusoid(); await rig.run(250, `round ${round} sinusoid`);
    rig.st.prepRise(); await rig.run(150, `round ${round} prepRise`);
    rig.store.set1('sinusoidWash', false); rig.st.lobuleHold?.(true); rig.st.exitSinusoid('anatomy'); await rig.run(300, `round ${round} exit`);
    rig.st.setCamera({ k: 4.2, x: -1507, y: -330 }, 1500); await rig.run(400, `round ${round} slide 6 tip`);
    const r = rig.report();
    assert.ok(share(r.peakMB) <= 0.92, `round ${round}: the peak was ${r.peakMB} MB (${Math.round(100 * share(r.peakMB))}%) at ${r.peakAt}`);
    assert.equal(r.unmetMB, 0, `round ${round}: ${said(r)}`);
    assert.ok(share(r.nowMB) <= 0.75, `round ${round}: back at the tip the page holds ${r.nowMB} MB: ${r.owners.join(', ')}`);
    assert.ok(r.ownContexts <= 1 && r.chartContexts <= 2, `contexts: ${said(r)}`);
    rig.st.setCamera({ k: 1, x: 0, y: 0 }, 300); await rig.run(250, `round ${round} fit`);
  }
});
