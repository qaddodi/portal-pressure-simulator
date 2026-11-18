// The layout sweep's pure half (scripts/gallery-sweep-lib.mjs): what a box change says, what counts as trouble, how a baseline is merged, how a
// run is split into units and shards. The sweep itself (scripts/gallery-sweep.mjs) runs a headless browser and is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIZES, unitsFor, keyOf, splitKey, normBoxes, normWords, normProblems, describeBoxChange, diffResult, diffReports, newTrouble, summaryText, makeBaseline, pickIds } from '../scripts/gallery-sweep-lib.mjs';
import { DEVICES, CATALOG } from '../src/ui/gallery/catalog.js';

const res = (o = {}) => ({ ok: true, settled: true, problems: [], boxes: { '.pz-data': [0, 0, 300, 200] }, words: { '.pz-data': ['A', 'B'] }, ...o });

test('the sizes are the gallery catalog\'s devices, and each belongs to one run', () => {
  assert.deepEqual(Object.keys(SIZES).sort(), DEVICES.map((d) => d.id).sort());
  for (const d of DEVICES) assert.deepEqual([SIZES[d.id].w, SIZES[d.id].h], [d.w, d.h], d.id);
  const units = unitsFor(Object.keys(SIZES));
  assert.deepEqual(units.flatMap((u) => u.sizes).sort(), Object.keys(SIZES).sort());
  for (const u of units) assert.ok(u.sizes.every((s) => SIZES[s].touch === SIZES[u.sizes[0]].touch), `${u.name} mixes a mouse and touch`);
  assert.deepEqual(unitsFor(['iphone']).map((u) => u.name), ['iphone']);
  assert.deepEqual(unitsFor(['nope']), []);
});

test('keys round-trip, with a slash and an at sign in the id kept', () => {
  assert.equal(keyOf('doppler/pv-color', 'iphone'), 'doppler/pv-color@iphone');
  assert.deepEqual(splitKey('doppler/pv-color@iphone-landscape'), { id: 'doppler/pv-color', device: 'iphone-landscape' });
});

test('boxes, words and problems are read in one shape', () => {
  assert.deepEqual(normBoxes({ id: 'x', boxes: { a: [0, 0, 2, 2], bad: [1, 2], worse: 'no' } }), { a: [0, 0, 2, 2] });
  assert.deepEqual(normBoxes([{ sel: 'a', l: 0, t: 0, r: 4, b: 4 }, { sel: 'b' }]), { a: [0, 0, 4, 4] });
  assert.deepEqual(normBoxes(null), {});
  assert.deepEqual(normWords({ id: 'x', cards: { a: ['one', 2] } }), { a: ['one', '2'] });
  assert.deepEqual(normProblems({ problems: [{ kind: 'scroll', text: 'b', line: 3, el: {} }, { kind: 'clipped', text: 'a' }] }).map((p) => p.kind), ['clipped', 'scroll']);
});

test('a box change is told in words, and the 2 px rounding is not a change', () => {
  assert.equal(describeBoxChange([0, 0, 300, 200], [0, 0, 300, 238]), 'grew 38 px taller (200 to 238)');
  assert.equal(describeBoxChange([0, 0, 300, 200], [0, 0, 300, 202]), '');
  assert.equal(describeBoxChange([0, 0, 300, 200], [0, 40, 300, 240]), 'moved 40 px down');
  assert.match(describeBoxChange([0, 0, 300, 200], [20, 0, 280, 200]), /shrank 40 px wider/);
  assert.match(describeBoxChange([0, 0, 300, 200], [0, 0, 340, 200]), /grew 40 px wider/);
});

test('a result is compared with its baseline: boxes, words, problems, and a specimen that stopped opening', () => {
  const base = res();
  assert.deepEqual(diffResult(base, res()), []);
  const taller = diffResult(base, res({ boxes: { '.pz-data': [0, 0, 300, 238], '.pz-text': [0, 0, 10, 10] } }));
  assert.deepEqual(taller.map((c) => c.text), ['.pz-data grew 38 px taller (200 to 238)', '.pz-text appeared (10 x 10)']);
  assert.deepEqual(diffResult(base, res({ boxes: {} })).map((c) => c.text), ['.pz-data is gone']);
  assert.deepEqual(diffResult(base, res({ words: { '.pz-data': ['A', 'C'] } })).map((c) => c.kind), ['words']);
  assert.deepEqual(diffResult(base, res({ problems: [{ kind: 'scroll', text: 'x' }] })).map((c) => c.text), ['new problem: scroll: x']);
  assert.deepEqual(diffResult(res({ problems: [{ kind: 'scroll', text: 'x' }] }), res()).map((c) => c.kind), ['fixed']);
  assert.match(diffResult(base, res({ ok: false, error: 'boom' }))[0].text, /no longer opens: boom/);
  assert.equal(diffResult(res({ ok: false, error: 'boom' }), res())[0].kind, 'fixed-open');
});

test('a run is diffed with the baseline over what it covered only', () => {
  const baseline = { results: { 'a/x@mac': res(), 'a/x@iphone': res(), 'b/y@mac': res(), 'gone/z@mac': res() } };
  const report = { devices: ['mac'], catalogIds: ['a/x', 'b/y', 'c/new'], results: { 'a/x@mac': res({ boxes: { '.pz-data': [0, 0, 300, 260] } }), 'c/new@mac': res() } };
  const d = diffReports(baseline, report);
  assert.deepEqual(d.added, ['c/new@mac']);
  assert.deepEqual(d.removed, ['gone/z@mac']);   // (b/y was left out of this run, not removed; a/x on the iPhone is a size this run did not take)
  assert.equal(d.same, 0);
  assert.deepEqual(d.changes.map((c) => c.key), ['a/x@mac']);
});

test('trouble is what the baseline does not already hold', () => {
  const known = { kind: 'scroll', text: 'a card scrolls' };
  const baseline = { results: { 'a/x@mac': res({ problems: [known] }), 'a/z@mac': res({ ok: false, error: 'old' }) } };
  const report = { results: { 'a/x@mac': res({ problems: [known, { kind: 'off', text: 'new one' }] }), 'a/z@mac': res({ ok: false, error: 'old' }), 'a/w@mac': res({ ok: false, error: 'boom' }), 'a/v@mac': res({ errors: ['TypeError: x'] }) } };
  assert.deepEqual(newTrouble(report, baseline), ['a/v@mac: page error: TypeError: x', 'a/w@mac: does not open: boom', 'a/x@mac: off: new one']);
  assert.equal(newTrouble({ results: { 'a/x@mac': res() } }, null).length, 0);
  assert.equal(newTrouble({ results: { 'a/x@mac': res({ problems: [known] }) } }, null).length, 1, 'with no baseline every problem is new');
});

test('the summary names the counts, the trouble and each changed specimen', () => {
  const baseline = { results: { 'a/x@mac': res() } };
  const report = { commit: 'abc1234', seconds: 12, devices: ['mac'], catalogIds: ['a/x'], results: { 'a/x@mac': res({ boxes: { '.pz-data': [0, 0, 300, 238] }, problems: [{ kind: 'scroll', text: 'a card scrolls' }] }) } };
  const diff = diffReports(baseline, report), trouble = newTrouble(report, baseline);
  const text = summaryText(report, diff, trouble);
  assert.match(text, /1 opens \(1 specimens x 1 sizes\) in 12 s/);
  assert.match(text, /TROUBLE 1/);
  assert.match(text, /a\/x on mac:\n(\s+.*\n)*\s+\.pz-data grew 38 px taller/);
});

test('a baseline keeps the old results a partial run did not take, and says why it changed', () => {
  const old = { history: [{ at: 'then', commit: 'old', why: 'first' }], results: { 'a/x@mac': res(), 'b/y@mac': res() } };
  const report = { commit: 'new1234', results: { 'a/x@mac': res({ boxes: { '.c': [0, 0, 4, 4] }, ms: 99, errors: ['e'] }) } };
  const b = makeBaseline(report, old, { why: 'the card grew on purpose', at: 'now' });
  assert.deepEqual(Object.keys(b.results), ['a/x@mac', 'b/y@mac']);
  assert.deepEqual(b.results['a/x@mac'].boxes, { '.c': [0, 0, 4, 4] });
  assert.equal('ms' in b.results['a/x@mac'], false, 'timings are not kept: they differ every run');
  assert.equal(b.why, 'the card grew on purpose');
  assert.deepEqual(b.history.map((h) => h.why), ['first', 'the card grew on purpose']);
});

test('the catalog is narrowed by family, section, kind, ids and a shard that keeps a family whole', () => {
  const cat = [{ id: 'a/1', family: 'a', section: 'S', kind: 'slide' }, { id: 'a/2', family: 'a', section: 'S', kind: 'slide' }, { id: 'b/1', family: 'b', section: 'T', kind: 'pane' }, { id: 'c/1', family: 'c', section: 'T', kind: 'pane' }];
  assert.deepEqual(pickIds(cat, { family: ['a'] }), ['a/1', 'a/2']);
  assert.deepEqual(pickIds(cat, { kind: ['pane'] }), ['b/1', 'c/1']);
  assert.deepEqual(pickIds(cat, { ids: ['c/1'] }), ['c/1']);
  const shards = [1, 2].map((i) => pickIds(cat, { shard: [i, 2] }));
  assert.deepEqual(shards.flat().sort(), cat.map((e) => e.id).sort(), 'every specimen in exactly one shard');
  for (const s of shards) assert.ok(!(s.includes('a/1') !== s.includes('a/2')), 'a family is not split');
  assert.equal(pickIds(CATALOG.map(({ id, family, section, kind }) => ({ id, family, section, kind })), { shard: [1, 3] }).length > 0, true);
});

test('the sweep script stays layout-only: GL draws stubbed, no screenshot, no shoot settle', () => {
  const src = readFileSync(new URL('../scripts/gallery-sweep.mjs', import.meta.url), 'utf8');
  assert.match(src, /drawArrays/);
  assert.doesNotMatch(src.replace(/^\/\/.*$/gm, ''), /\.screenshot\(|\.settle\(|colourShare|assertGpuLive/, 'no pictures: the ban lifted for layout runs only');
});
