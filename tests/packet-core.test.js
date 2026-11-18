// The bug packet's core (src/ui/packet/): the state link, the packet text and its reading back, the diff, the replay verdicts and the test made from a packet.
// Pure JSON in, JSON out: no page. The replay is driven by a fake env, as the Node and headless envs are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureState, stateLink, readStateLink, cleanExtras, diffParams, changedFrom, applyExtras } from '../src/ui/packet/state.js';
import { buildPacket, packetText, parsePacket, findingKey, splitFindings, thinHistory, BEGIN, END, MAX_JSON } from '../src/ui/packet/packet.js';
import { diffScreens, compareFindings } from '../src/ui/packet/diff.js';
import { replayPacket, comparePackets, resultLines } from '../src/ui/packet/replay.js';
import { makeFixture, runFixture, getPath } from '../src/ui/packet/test-from-packet.js';

const BASE = 'https://qaddodi.github.io/portal-pressure-simulator/preview/';
const fakePps = (over = {}) => ({
  store: { get: () => ({ presetId: 'cirr-decomp', view: 'anatomic', params: { cirrhosis: 0.7, portal: { stenosis: 0.4 }, drugs: { nsbb: 0 } }, presetParams: { id: 'cirr-decomp', params: { cirrhosis: 0.7, portal: { stenosis: 0 }, drugs: { nsbb: 0 } } },
    selection: { type: 'edge', id: 'SV' }, lobule: false, sinusoid: false, colorMode: 'flow', labelLevel: 'all', layers: { chips: true, labels: true }, lobuleLayers: {}, running: false, speed: 1, mode: 'explore', ...over }) },
  stage: { cameraState: () => ({ k: 1.5, x: 10, y: -4 }) },
  presenter: { position: () => (over.deck ? { id: 'hvpg', at: 4 } : null) },
  dock: { isOpen: (id) => id === 'doppler' },
});
const fakeDoc = { documentElement: { getAttribute: (a) => (a === 'data-theme' ? 'dark' : a === 'data-palette' ? 'navy' : null) }, querySelectorAll: () => [{ getAttribute: () => 'doppler' }, { getAttribute: () => 'hvpg' }] };
const win = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 };

const FINDING = { rule: 'label-under-card', what: 'Label "Splenic vein"', where: 'under the Doppler card, 40% covered', why: 'Labels stay clear of cards', owner: 'src/ui/label-gl.js' };
const REPORT = { page: { view: 'anatomic', commit: 'aaa' }, labels: [{ id: 'sv', text: 'Splenic vein', alpha: 0.4 }, { id: 'pv', text: 'Portal vein', alpha: 1 }], health: { errors: 0 } };

test('state: the share link carries only what was changed from the patient, and the extras are read back checked', () => {
  const s = captureState(fakePps(), { doc: fakeDoc, win });
  assert.deepEqual(s.share.params, { portal: { stenosis: 0.4 } }, 'a change from the patient, not the whole tree');
  assert.deepEqual(s.share.cam, { k: 1.5, x: 10, y: -4 });
  assert.equal(s.x.look, 'navy'); assert.equal(s.x.lens, 'flow'); assert.deepEqual(s.x.dock, ['doppler']); assert.equal(s.x.vw, 390); assert.equal(s.x.running, false);
  const link = stateLink(s, `${BASE}?gallery=1&sweep=all`);
  assert.ok(link.startsWith(BASE) && !/gallery|sweep/.test(link.split('#')[0]), 'a link the packet makes never carries the gallery page along');
  assert.match(link, /[?&]back=1/);
  const back = readStateLink(link, ['cirr-decomp', 'healthy']);
  assert.equal(back.share.preset, 'cirr-decomp'); assert.deepEqual(back.share.params, s.share.params); assert.deepEqual(back.x, s.x); assert.equal(back.script, undefined);
});

test('state: a talk and its slide ride the app\'s own deep link', () => {
  const s = captureState(fakePps({ deck: true }), { doc: fakeDoc, win });
  assert.equal(s.script, 'hvpg'); assert.equal(s.slide, 5, 'position.at is 0-based, the address 1-based');
  const link = stateLink(s, BASE);
  assert.equal(new URL(link).searchParams.get('script'), 'hvpg'); assert.equal(new URL(link).searchParams.get('slide'), '5');
  const back = readStateLink(link);
  assert.equal(back.script, 'hvpg'); assert.equal(back.slide, 5);
});

test('state: a link anyone can edit applies nothing unknown', () => {
  const x = cleanExtras(JSON.parse('{"look":"neon","lens":"flow","labels":"x","layers":{"chips":true,"__proto__":{"a":1},"bad name":true,"n":3},"dock":["doppler","a b",5],"vw":50,"vh":900,"speed":1e9,"mode":"hack"}'));
  assert.deepEqual(x, { lens: 'flow', layers: { chips: true }, dock: ['doppler'], vh: 900 });
  assert.equal({}.a, undefined);
  assert.deepEqual(readStateLink(`${BASE}?script=../x&slide=2`).script, undefined);
});

test('state: diffParams and changedFrom name what differs', () => {
  const a = { x: 1, y: { z: 2, w: [1, 2] }, k: 5 }, b = { x: 1, y: { z: 3, w: [1, 3] }, k: 5 };
  assert.deepEqual(diffParams(a, b), { y: { z: 3, w: [1, 3] } });
  assert.equal(diffParams(a, a), null);
  assert.deepEqual(changedFrom(a, b), { 'y.z': [2, 3], 'y.w': [[1, 2], [1, 3]] });
});

test('state: applyExtras uses only what pps offers and lists what it could not do', async () => {
  const calls = [], set = [];
  const pps = { store: { get: () => ({ colorMode: 'pressure', layers: {}, running: true, lobule: false }), set: (o) => set.push(o) }, lookNow: (id) => calls.push(`look ${id}`), dock: { show: (id) => calls.push(`dock ${id}`) } };
  const skipped = await applyExtras({ look: 'dark', lens: 'flow', dock: ['doppler'], sinusoid: true }, pps);
  assert.deepEqual(calls, ['look dark', 'dock doppler']);
  assert.deepEqual(set, [{ colorMode: 'flow' }]);
  assert.equal(skipped.length, 1); assert.match(skipped[0], /sinusoid/);
});

const sources = (over = {}) => ({ state: captureState(fakePps(), { doc: fakeDoc, win }), link: stateLink(captureState(fakePps(), { doc: fakeDoc, win }), BASE), screen: REPORT, screenText: 'Labels: "Splenic vein" at 40%.', history: null, findings: [FINDING], watchFindings: [], device: { screen: '390x844', dpr: 3, look: 'navy' }, build: { badge: 'PREVIEW · abc1234', commit: 'abc1234' }, health: { errors: 0, gpuMB: 210 }, ...over });
const NOW = () => new Date('2026-11-18T22:00:00.000Z');

test('packet: text for a reader, one JSON line for a program, and it reads back whole', () => {
  const p = buildPacket(sources(), { note: 'the label is under the card', now: NOW });
  const t = packetText(p);
  assert.match(t, /^PPS BUG PACKET v1 · [0-9a-f]{8} · 2026-11-18 22:00 UTC/);
  assert.match(t, /1\. label-under-card: Label "Splenic vein", under the Doppler card, 40% covered\./);
  assert.match(t, /What I saw: the label is under the card/);
  assert.ok(t.includes(BEGIN) && t.includes(END));
  const r = parsePacket(t);
  assert.equal(r.ok, true); assert.deepEqual(r.packet, p);
  assert.match(t, /NOT IN THIS PACKET: motion history/);
});

test('packet: pasted into a chat (fenced, wrapped lines) it still reads; changed text is refused by name', () => {
  const t = packetText(buildPacket(sources(), { now: NOW }));
  const json = t.slice(t.indexOf(BEGIN) + BEGIN.length, t.indexOf(END)).trim();
  const wrapped = `${t.slice(0, t.indexOf(BEGIN))}\`\`\`\n${BEGIN}\n${json.replace(/(.{70})/g, '$1\n')}\n${END}\n\`\`\``;
  assert.equal(parsePacket(wrapped).ok, true);
  const edited = parsePacket(t.replace('"alpha":0.4', '"alpha":0.9'));
  assert.equal(edited.ok, false); assert.match(edited.why, /changed on its way/);
  assert.match(parsePacket('hello').why, /no packet found/);
  assert.match(parsePacket(`${BEGIN}\n{nope\n${END}`).why, /could not be read/);
});

test('packet: no findings says the first job is the rule; missing parts are listed, never silently empty', () => {
  const p = buildPacket(sources({ findings: [], screen: null, screenText: '' }), { now: NOW });
  const t = packetText(p);
  assert.match(t, /FINDINGS \(none: no self-check named this; the first job is the rule that would have\)/);
  assert.match(t, /screen report: this build has no pps\.screen\(\)/);
  assert.equal(p.screen, null);
});

test('packet: an over-large packet loses its detail first and keeps findings, state and link', () => {
  const big = { seconds: 10, samples: Array.from({ length: 4000 }, (_, i) => ({ t: i, a: i * 1.5, b: i % 7, c: 'x'.repeat(8) })), events: [] };
  const fat = { ...REPORT, filler: 'y'.repeat(60 * 1024) };
  const p = buildPacket(sources({ history: big, screen: fat }), { now: NOW });
  assert.ok(JSON.stringify(p).length <= MAX_JSON + 400, 'inside the limit (the check sum and the notes are the margin)');
  assert.equal(p.findings.length, 1); assert.ok(p.state && p.link);
  assert.ok(p.missing.some((m) => /left out|thinned/.test(m)));
  assert.equal(parsePacket(packetText(p)).ok, true);
  assert.ok(thinHistory(big, 4000).samples.length < big.samples.length);
});

test('findings: a state finding and a motion finding are told apart, identity ignores where and when', () => {
  const m = { rule: 'flash', what: 'Label "Portal vein"', where: 'went 1.0 -> 0.1 -> 1.0', at: '12.4 s' };
  const { state, motion } = splitFindings([FINDING, m]);
  assert.deepEqual(state.map((f) => f.rule), ['label-under-card']); assert.deepEqual(motion.map((f) => f.rule), ['flash']);
  assert.equal(findingKey(FINDING), findingKey({ ...FINDING, where: '10% covered', at: '3 s' }));
  const c = compareFindings([FINDING], [{ ...FINDING, where: '10% covered' }, { rule: 'x', what: 'new' }]);
  assert.equal(c.still.length, 1); assert.deepEqual(c.still[0].changed, { was: FINDING.where }); assert.equal(c.introduced.length, 1); assert.equal(c.fixed.length, 0);
});

test('diff: lists match by id, numbers by tolerance, the volatile parts are left out', () => {
  const a = { page: { commit: 'a' }, health: { errors: 1 }, labels: [{ id: 'sv', alpha: 0.4 }, { id: 'pv', alpha: 1 }] };
  const b = { page: { commit: 'b' }, health: { errors: 9 }, labels: [{ id: 'pv', alpha: 1.0001 }, { id: 'sv', alpha: 0.65 }, { id: 'ivc', alpha: 1 }] };
  const d = diffScreens(a, b);
  assert.deepEqual(d.map((x) => x.path), ['labels[sv].alpha', 'labels[ivc]']);
  assert.deepEqual(diffScreens(a, a), []);
});

const envOf = (report, rules, extra = {}) => ({ name: 'fake', applied: [], async apply(s) { this.applied.push(s); return { skipped: [] }; }, async settle() {}, screen: () => report, rules: (r) => rules(r), ...extra });
const hasLabel = (r) => (r.labels.find((l) => l.id === 'sv')?.alpha < 0.65 ? [FINDING] : []);

test('replay: reproduced on an unfixed tree, gone on a fixed one, with what changed', async () => {
  const packet = buildPacket(sources(), { now: NOW });
  const before = await replayPacket(packet, envOf(REPORT, hasLabel));
  assert.equal(before.verdict, 'reproduced'); assert.equal(before.compare.still.length, 1); assert.deepEqual(before.screenDiff, []);
  assert.deepEqual(before.applied, { skipped: [] }); assert.match(resultLines(before)[0], /^REPRODUCED/);
  const fixed = { ...REPORT, labels: [{ id: 'sv', text: 'Splenic vein', alpha: 0.65 }, { id: 'pv', text: 'Portal vein', alpha: 1 }] };
  const after = await replayPacket(packet, envOf(fixed, hasLabel));
  assert.equal(after.verdict, 'gone'); assert.equal(after.compare.fixed.length, 1);
  assert.deepEqual(after.screenDiff.map((x) => x.path), ['labels[sv].alpha'], 'the one intended change');
  const c = comparePackets(before, after);
  assert.equal(c.verdict, 'fixed'); assert.match(c.lines[0], /^FIXED: replay in fake -> replay in fake/);
});

test('replay: no rule, motion only, no screen report and an introduced finding each have their own verdict', async () => {
  const none = buildPacket(sources({ findings: [] }), { now: NOW });
  assert.equal((await replayPacket(none, envOf(REPORT, () => []))).verdict, 'no-rule');
  const motion = { rule: 'flash', what: 'Label', where: 'x', at: '3 s' };
  const mp = buildPacket(sources({ findings: [], watchFindings: [motion], history: { seconds: 10, samples: [{ t: 0 }], events: [] } }), { now: NOW });
  const mr = await replayPacket(mp, envOf(REPORT, () => [], { judgeHistory: () => [motion] }));
  assert.equal(mr.verdict, 'motion-only'); assert.equal(mr.motion.still.length, 1);
  const p = buildPacket(sources(), { now: NOW });
  assert.equal((await replayPacket(p, envOf(null, () => []))).verdict, 'no-screen');
  const intro = await replayPacket(p, envOf(REPORT, () => [{ rule: 'other', what: 'thing' }]));
  assert.equal(intro.verdict, 'gone'); assert.equal(intro.compare.introduced.length, 1);
  assert.equal(comparePackets(p, intro).verdict, 'regressed');
  assert.equal((await replayPacket({ ...p, state: null }, envOf(REPORT, () => []))).verdict, 'unreadable');
});

test('replay: a build that does not match the packet is said, and what could not be applied is listed', async () => {
  const p = buildPacket(sources(), { now: NOW });
  const r = await replayPacket(p, envOf(REPORT, hasLabel, { commit: 'zzz9999', async apply() { return { skipped: ['look: x'] }; } }));
  assert.ok(r.notes.some((n) => /this tree is zzz9999, the packet was made on abc1234/.test(n)));
  assert.ok(r.notes.some((n) => /not applied: look: x/.test(n)));
});

test('test-from-packet: the fixture holds the bug clean and checks values; it fails when the bug is back', async () => {
  const p = buildPacket(sources(), { now: NOW });
  const fx = makeFixture(p, { expect: [{ path: 'labels[sv].alpha', near: 0.65, tol: 0.01 }] });
  assert.match(fx.name, /^label-under-card-label-splenic-vein-[0-9a-f]{6}$/);
  assert.deepEqual(fx.hold, [{ rule: 'label-under-card', what: 'Label "Splenic vein"' }]); assert.ok(!('screen' in fx) && !('history' in fx), 'small: state and rules only');
  const bad = await runFixture(fx, envOf(REPORT, hasLabel));
  assert.equal(bad.ok, false); assert.match(bad.failures[0], /label-under-card: Label "Splenic vein".*the bug of packet/); assert.match(bad.failures[1], /expected 0\.65/);
  const good = await runFixture(fx, envOf({ ...REPORT, labels: [{ id: 'sv', alpha: 0.65 }] }, hasLabel));
  assert.deepEqual(good, { ok: true, failures: [], findings: [] });
  assert.throws(() => makeFixture(buildPacket(sources({ findings: [] }), { now: NOW })), /no state findings to hold clean/);
  assert.throws(() => makeFixture(p, { rules: ['nope'] }), /none of the packet's findings match/);
  assert.equal(getPath(REPORT, 'labels[pv].alpha'), 1); assert.equal(getPath(REPORT, 'labels[2].alpha'), undefined); assert.equal(getPath(REPORT, 'a.b'), undefined);
});
