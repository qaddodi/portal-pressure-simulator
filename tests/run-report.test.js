// One Finding and one Run report (DBG-3, bible review 19 Nov 2026): every runner's results pass one schema, a paste from any tool reads back, and two pastes from different tools compare.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finding, normalize, sevOf, fromProblem, fromWalkFlag, fromGroup, fromGlitch, fromFrameStep, fromDeckLine, fromRegistry } from '../src/ui/report/finding.js';
import { buildRun, validateRun, renderRun, runBlock, parseReport, compareRuns, fromPacket, fromReplay, MAX_FINDINGS, BEGIN } from '../src/ui/report/run.js';
import { checkRun, sweepRun, walkRun, deckRun } from '../src/ui/report/emit.js';
import { buildReport } from '../src/ui/gallery/sweep.js';
import { buildWalkReport, flagsFor } from '../src/ui/gallery/walk.js';
import { numberedReport } from '../src/ui/gallery/fit-check.js';
import { slideProblems, summarize } from '../scripts/deck-sweep-lib.mjs';
import { buildPacket, packetText } from '../src/ui/packet/packet.js';

test('severity has one scale: the old words map onto fail, warn, note', () => {
  assert.deepEqual(['bad', 'warn', 'note', 'error', 'info', undefined].map(sevOf), ['fail', 'warn', 'note', 'fail', 'note', 'fail']);
});

test('each tool\'s own finding shape becomes one Finding', () => {
  assert.deepEqual(fromProblem({ kind: 'small', text: 'span "x" 10 px', where: 'card' }, { look: 'dark' }), { rule: 'small', sev: 'fail', what: 'span "x" 10 px', where: 'card', scope: { look: 'dark' } });
  assert.deepEqual(fromWalkFlag({ kind: 'near', sev: 'warn', text: '290 MB is 90%' }, { step: 'a > b' }), { rule: 'walk-near', sev: 'warn', what: '290 MB is 90%', where: '', scope: { step: 'a > b' } });
  assert.equal(fromWalkFlag({ kind: 'over', sev: 'bad', text: 'x' }).sev, 'fail');
  assert.match(fromGroup({ kind: 'fit small', text: 't', n: 3, first: 'step 4', owner: 'o' }).where, /3 stops, first at step 4/);
  assert.equal(fromGlitch({ rule: 'pop', from: 100, to: 120, detail: 'a card popped' }).at, '100-120 ms');
  assert.equal(fromFrameStep({ rule: 'card-pop', from: 4, to: 6, n: 3, detail: 'x' }).where, '3 frames');
  const d = fromDeckLine('[case card up] edge-cutoff: the card runs off', { deck: 'hvpg', slide: 3 });
  assert.deepEqual([d.rule, d.what, d.where, d.scope.slide], ['edge-cutoff', 'the card runs off', 'case card up', '3']);
  assert.equal(fromDeckLine('plain words').rule, 'deck-sweep');
  const r = fromRegistry({ rule: 'x', what: 'w', where: 'p', why: 'y', owner: 'src/a.js', at: '1 s', sev: 'warn' }, { device: 'iphone' });
  assert.deepEqual([r.sev, r.owner, r.at, r.scope.device], ['warn', 'src/a.js', '1 s', 'iphone']);
  for (const raw of [{ rule: 'a', what: 'b' }, { kind: 'k', text: 't' }, { kind: 'k', sev: 'bad', text: 't' }, { rule: 'r', from: 1, to: 2, detail: 'd' }, 'k: w']) assert.ok(['fail', 'warn', 'note'].includes(normalize(raw).sev));
});

test('buildRun drops duplicates, keeps the worst when over the cap, and says so', () => {
  const dup = buildRun({ tool: 't', findings: [{ rule: 'a', what: 'b' }, { rule: 'a', what: 'b' }] });
  assert.equal(dup.findings.length, 1);
  const many = Array.from({ length: MAX_FINDINGS + 50 }, (_, i) => ({ rule: 'r', what: `w${i}`, sev: i === MAX_FINDINGS + 40 ? 'bad' : 'warn' }));
  const r = buildRun({ tool: 't', findings: many });
  assert.equal(r.findings.length, MAX_FINDINGS); assert.equal(r.total, MAX_FINDINGS + 50);
  assert.equal(r.findings[0].sev, 'fail', 'the worst first');
  assert.ok(r.missing.some((m) => /50 more findings/.test(m)));
  assert.ok(validateRun(r).ok);
});

test('validateRun refuses what is not a run report', () => {
  assert.equal(validateRun(null).ok, false);
  const r = buildRun({ tool: 't', findings: [{ rule: 'a', what: 'b' }] });
  assert.equal(validateRun({ ...r, v: 9 }).ok, false);
  assert.equal(validateRun({ ...r, findings: [{ rule: 'a', sev: 'severe', what: 'b' }] }).ok, false);
  assert.equal(validateRun({ ...r, tool: '' }).ok, false);
});

// ── the contract: every runner's report passes the one schema and reads back ──
const walkRows = () => {
  const row = (i, mb, extra = {}) => ({ journey: 'j', i, label: `s${i}`, ok: true, settled: true, mb, peak: mb, own: 2, charts: 0, live: 2, lost: 0, errors: 0, grew: [], big: [], owners: [], flags: [], problems: [], findings: [], ms: 5, judgeMs: 1, ...extra });
  const a = row(0, 100), b = row(1, 300, { problems: [{ kind: 'small', text: 'span x 10 px' }] });
  b.flags = flagsFor(b, a, { envelopeMb: 320 });
  return [a, b];
};
const contract = {
  check: () => numberedReport([{ kind: 'small', text: 'span "x" 10 px', where: 'slide' }, { kind: 'edge-cutoff', text: 'cut', where: 'edges' }], { title: 't', look: 'dark', size: '390 x 844' }),
  sweep: () => buildReport({ spec: { looks: ['dark'] }, jobs: [1, 2, 3], size: '390x844', results: [
    { id: 'a', look: 'dark', ok: true, settled: true, problems: [{ kind: 'small', text: 'tiny', where: 'card' }], errors: 0, ms: 900 },
    { id: 'b', look: 'dark', ok: false, error: 'no such specimen', problems: [], errors: 0, ms: 0 },
    { id: 'c', look: 'dark', ok: true, settled: false, problems: [], errors: 2, ms: 9000 }] }).text,
  walk: () => buildWalkReport({ journeys: [{ id: 'j', title: 'J', steps: [1, 2] }], rows: walkRows(), jStart: { j: { mb: 90, owners: [] } }, envelopeMb: 320, info: { device: 'phone' } }).text,
  deck: () => { const report = { at: '2026-11-19T10:00:00.000Z', devices: ['iphone'], decks: ['d'], seconds: 5, results: { k: { deck: 'd', slide: 2, device: 'iphone', ok: true, problems: slideProblems({ main: { check: { problems: [{ kind: 'edge-cutoff', text: 'card cut' }] } } }) }, k2: { deck: 'd', slide: 3, device: 'iphone', ok: false, error: 'did not settle', problems: [] } } }; return `${summarize(report)}\n\n${runBlock(deckRun(report))}`; },
};
for (const [tool, make] of Object.entries(contract)) {
  test(`contract: the ${tool} report ends with one run block that validates, reads back and names its findings`, () => {
    const text = make();
    assert.ok(text.includes(BEGIN), 'the block is in the copy');
    const p = parseReport(text);
    assert.ok(p.ok, p.why); assert.equal(p.from, 'run');
    assert.deepEqual(validateRun(p.run), { ok: true, errors: [] });
    assert.ok(p.run.findings.length > 0, 'a finding was raised');
    assert.ok(renderRun(p.run).includes('FINDINGS ('));
  });
}

test('the walker and the sweep keep their own text above the block (the report is a view, the text stays)', () => {
  assert.match(contract.sweep(), /^Gallery sweep: /);
  assert.match(contract.walk(), /^Phone check: /);
  assert.match(contract.check(), /^Card check: t\n/);
  assert.match(contract.check(), /#1 span "x" 10 px/);
});

test('a block that changed on its way is refused; wrapped lines and chat fences are tolerated', () => {
  const run = buildRun({ tool: 'check', findings: [{ rule: 'small', what: 'span' }] });
  const block = runBlock(run);
  assert.ok(parseReport(block).ok);
  const wrapped = block.replace(/(.{40})/g, '$1\n').replace('-----BEGIN REPORT JSON-----\n', '-----BEGIN REPORT JSON-----\n```json\n').replace(/\n-----END/, '\n```\n-----END');
  assert.ok(parseReport(wrapped).ok, 'wrapped and fenced');
  const bad = parseReport(block.replace('"small"', '"smell"'));
  assert.equal(bad.ok, false); assert.match(bad.why, /check sum/);
  assert.equal(parseReport('hello').ok, false);
});

test('a bug packet and a replay result read as runs, and a packet compares with a Phone check paste', () => {
  const pk = buildPacket({ link: 'x#s=1', findings: [{ rule: 'edge-cutoff', what: 'card cut', where: 'a' }], screen: null, build: { commit: 'abc' }, device: {} }, { note: 'looks wrong' });
  const viaText = parseReport(packetText(pk));
  assert.ok(viaText.ok); assert.equal(viaText.from, 'packet'); assert.equal(viaText.run.tool, 'packet');
  assert.ok(validateRun(viaText.run).ok);
  assert.ok(viaText.run.notes.some((n) => /looks wrong/.test(n)));
  const rp = parseReport(JSON.stringify({ kind: 'pps-replay', env: 'node', packet: 'p', verdict: 'reproduced', now: { state: [{ rule: 'edge-cutoff', what: 'card cut' }], motion: [] }, notes: [] }));
  assert.equal(rp.from, 'replay'); assert.ok(validateRun(rp.run).ok);
  const deck = buildRun({ tool: 'deck-sweep', findings: [{ rule: 'edge-cutoff', what: 'card cut', where: 'main' }] });
  const c = compareRuns(viaText.run, deck);
  assert.equal(c.verdict, 'not-fixed'); assert.ok(c.lines.some((l) => /two different tools/.test(l)));
  assert.equal(compareRuns(viaText.run, buildRun({ tool: 'deck-sweep' })).verdict, 'fixed');
  assert.equal(compareRuns(buildRun({ tool: 'a' }), deck).verdict, 'regressed');
  assert.equal(compareRuns(buildRun({ tool: 'a' }), buildRun({ tool: 'b' })).verdict, 'unchanged');
  const part = compareRuns(buildRun({ tool: 'a', findings: [{ rule: 'x', what: '1' }, { rule: 'y', what: '2' }] }), buildRun({ tool: 'a', findings: [{ rule: 'x', what: '1' }] }));
  assert.equal(part.verdict, 'partly');
});

test('report.mjs show and compare work on pastes (exit 1 on a failing finding, 0 when fixed)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pps-report-'));
  const a = join(dir, 'a.txt'), b = join(dir, 'b.txt');
  writeFileSync(a, contract.sweep()); writeFileSync(b, renderRun(buildRun({ tool: 'sweep' })));
  const show = spawnSync('node', ['scripts/report.mjs', 'show', a], { encoding: 'utf8' });
  assert.equal(show.status, 1); assert.match(show.stdout, /PPS RUN REPORT v1 · sweep/); assert.match(show.stdout, /\[fail\] small: tiny/);
  const cmp = spawnSync('node', ['scripts/report.mjs', 'compare', a, b], { encoding: 'utf8' });
  assert.equal(cmp.status, 0); assert.match(cmp.stdout, /^FIXED/);
  const junk = join(dir, 'c.txt'); writeFileSync(junk, 'nothing');
  assert.equal(spawnSync('node', ['scripts/report.mjs', 'show', junk], { encoding: 'utf8' }).status, 2);
});
