// The bug packet with the recorder's last seconds (src/ui/watch/): a recorded flash is named in the packet, judged again by a replay with no browser, and held by a fixture.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportHistory } from '../src/ui/watch/history.js';
import { replayHistory } from '../src/ui/watch/replay.js';
import { buildPacket, packetText, parsePacket } from '../src/ui/packet/packet.js';
import { replayPacket, comparePackets } from '../src/ui/packet/replay.js';
import { makeFixture, runFixture } from '../src/ui/packet/test-from-packet.js';

const DT = 16;
const run = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i * DT, c: null, L: null, K: null, ...fn(i) }));
const lab = (key, a) => [key, 100, 100, 40, 12, a];
const history = (alphas) => exportHistory({ samples: run(alphas.length, (i) => ({ L: [lab('n:portal-vein', alphas[i])] })) });
const FLASH = history([1, 1, 1, 0.05, 0.05, 0.05, 1, 1, 1]), CLEAN = history([1, 1, 1, 1, 1, 1, 1, 1, 1]);
const STATE = { v: 1, share: { v: 1, preset: 'healthy', view: 'anatomic' }, x: {} };

const packetOf = (h, extra = {}) => buildPacket({ state: STATE, link: 'https://example.org/preview/#s=x', screen: { v: 1, page: { view: 'anatomy' } }, screenText: 'x', history: h, findings: [], watchFindings: replayHistory(h), device: {}, build: { commit: 'abc1234' }, ...extra }, { now: () => new Date('2026-11-18T22:00:00Z') });
const env = (over = {}) => ({ name: 'fake', async apply() { return { skipped: [] }; }, async settle() {}, screen: () => ({ v: 1, page: { view: 'anatomy' }, findings: [] }), judgeHistory: async (h) => replayHistory(h), ...over });

test('a recorded flash is a motion finding in the packet, with its time, and the packet carries the history', () => {
  const p = packetOf(FLASH);
  assert.deepEqual(p.findings.map((f) => f.rule), ['flash']);
  assert.ok(p.findings[0].at, 'a motion finding says when');
  const t = packetText(p);
  assert.match(t, /MOTION: last 10 s, \d+ samples, 0 events, 0 camera runs\./);
  const back = parsePacket(t);
  assert.equal(back.ok, true); assert.deepEqual(replayHistory(back.packet.history).map((f) => f.rule), ['flash'], 'a pasted history judges the same on the other side');
});

test('a state replay cannot repeat motion: the verdict says so and the recorded motion is judged again by today\'s rules', async () => {
  const r = await replayPacket(packetOf(FLASH), env());
  assert.equal(r.verdict, 'motion-only'); assert.equal(r.motion.still.length, 1); assert.equal(r.motion.fixed.length, 0);
});

test('a fixture from a motion packet holds the rule\'s catch, and fails when the rule stops naming the recorded bug', async () => {
  const p = packetOf(FLASH);
  const fx = makeFixture(p);
  assert.deepEqual(fx.fires.map((f) => f.rule), ['flash']); assert.ok(fx.history && fx.hold.length === 0);
  assert.deepEqual(await runFixture(fx, env()), { ok: true, failures: [], findings: [] });
  const blind = await runFixture(fx, env({ judgeHistory: async () => [] }));
  assert.equal(blind.ok, false); assert.match(blind.failures[0], /flash: .*no longer name the bug recorded/);
  assert.throws(() => makeFixture({ ...p, history: null }), /need the recorded history|no findings/);
});

test('compare: two packets of one move, before and after a fix, say fixed (the proof for a bug a replay cannot repeat)', () => {
  const c = comparePackets(packetOf(FLASH), packetOf(CLEAN));
  assert.equal(c.verdict, 'fixed');
  assert.equal(comparePackets(packetOf(FLASH), packetOf(FLASH)).verdict, 'not-fixed');
});
