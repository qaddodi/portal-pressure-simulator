// The bug packet replayed in Node (scripts/packet-node.mjs): a state put on the page's own DOM, the screen report and its rules, a verdict, and a fixture made from the packet.
// No browser. Layout is not computed in jsdom, so what is judged here is the state, the words and the numbers (the headless layout run and the device judge the rest).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../scripts/packet-node.mjs';
import { registerRule } from '../src/ui/selfcheck/rules.js';
import { buildPacket, parsePacket, packetText } from '../src/ui/packet/packet.js';
import { replayPacket, comparePackets } from '../src/ui/packet/replay.js';
import { diffScreens } from '../src/ui/packet/diff.js';
import { makeFixture, runFixture } from '../src/ui/packet/test-from-packet.js';
import { stateLink, readStateLink } from '../src/ui/packet/state.js';

const STATE = { v: 1, share: { v: 1, preset: 'cirr-decomp', view: 'circuit', sel: { type: 'edge', id: 'SV' }, params: { portal: { stenosis: 0.3 } } }, x: { lens: 'flow', look: 'navy', vw: 390, vh: 844 } };
const link = stateLink(STATE, 'https://example.org/preview/');
let env, broken = true;
before(async () => {
  env = await makeEnv({ packet: { state: STATE } });
  // A rule of this test's own, about the patient: it must be there for the replay to find, and gone for the fixed case.
  registerRule({ id: 'test-packet-patient', owner: 'tests/packet-node.test.js', why: 'a rule for the packet test', kind: 'state', check: (r) => (broken && r.page?.patient === 'cirr-decomp' && r.page.view === 'circuit' ? [{ what: 'Patient cirr-decomp', where: 'in the circuit view' }] : []) });
}, { timeout: 120000 });

const made = async () => {
  await env.apply(STATE); await env.settle();
  const full = await env.screen();
  const { findings, ...screen } = full;
  return buildPacket({ state: STATE, link, screen, screenText: 'x', findings, device: {}, build: { commit: 'abc1234' } }, { now: () => new Date('2026-11-18T22:00:00Z') });
};

test('the state link rebuilds the state a replay uses', () => {
  assert.deepEqual(readStateLink(link, ['cirr-decomp']).share.params, { portal: { stenosis: 0.3 } });
  assert.equal(readStateLink(link, ['cirr-decomp']).x.look, 'navy');
});

test('node replay: the state is on the page, the report says so, and the rule names the bug', { timeout: 120000 }, async () => {
  const p = await made();
  assert.equal(p.screen.json.page.patient, 'cirr-decomp'); assert.equal(p.screen.json.page.view, 'circuit'); assert.equal(p.screen.json.page.look, 'navy'); assert.equal(p.screen.json.page.vw, 390);
  assert.deepEqual(p.findings.map((f) => f.rule), ['test-packet-patient']);
  const r = await replayPacket(p, env);
  assert.equal(r.verdict, 'reproduced');
  assert.deepEqual(r.screenDiff, [], 'one state, two builds of its report: the same');
  assert.equal(r.env, 'node');
});

test('node replay: two replays of one state give one report (what proves a fix by diff)', { timeout: 120000 }, async () => {
  const p = await made();
  const a = await replayPacket(p, env), b = await replayPacket(p, env);
  assert.deepEqual(diffScreens(a.screen, b.screen), []);
  assert.equal(comparePackets(a, b).verdict, 'not-fixed');
});

test('node replay: with the bug fixed the same packet says gone, and the fixture it makes holds it', { timeout: 120000 }, async () => {
  const p = await made();
  const fx = makeFixture(p);
  assert.equal((await runFixture(fx, env)).ok, false, 'fails while the bug is there');
  broken = false;   // (the fix)
  try {
    const r = await replayPacket(p, env);
    assert.equal(r.verdict, 'gone'); assert.equal(r.compare.fixed.length, 1);
    assert.deepEqual((await runFixture(fx, env)).failures, []);
    const text = packetText(p);
    assert.equal(parsePacket(text).ok, true);
  } finally { broken = true; }
});

test('node replay: a state the build cannot hold is said, not skipped silently', { timeout: 120000 }, async () => {
  const r = await env.apply({ ...STATE, script: 'no-such-talk' });
  assert.match(r.skipped.join(' '), /"no-such-talk" is not in this build/);
  assert.match((await env.apply({ ...STATE, share: { ...STATE.share, cam: { k: 2, x: 0, y: 0 } } })).skipped.join(' '), /camera/);
});
