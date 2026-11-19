// The Diagnostics switches bench (src/ui/gallery/benches/flags.js): the pure parts, in node. withFlag keeps every other parameter, the order and
// the hash; flagState reads the forms the app reads (?perf bare, ?offgpu=1, ?fps=120, ?testclock or ?testclock=4); the reports follow what pps has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bench, { FLAGS, flagState, withFlag, otherParams, flagText, validValue, REPORTS, reportsAvailable, formatReport, caughtLines } from '../src/ui/gallery/benches/flags.js';
import { BENCHES } from '../src/ui/gallery/benches/index.js';

test('the bench is the one the list names', () => {
  const entry = BENCHES.find((b) => b.id === 'flags');
  assert.equal(bench.id, entry.id);
  assert.equal(bench.title, entry.title);
  assert.equal(typeof bench.mount, 'function');
});

test('withFlag sets a flag in the form the app reads, last when it was not there', () => {
  assert.equal(withFlag('', 'perf', true), '?perf');
  assert.equal(withFlag('?gallery', 'perf', true), '?gallery&perf');
  assert.equal(withFlag('?gallery', 'offgpu', true), '?gallery&offgpu=1');
  assert.equal(withFlag('?gallery', 'budget', true), '?gallery&budget=1');
  assert.equal(withFlag('?gallery', 'fps', true), '?gallery&fps=120');
  assert.equal(withFlag('?gallery', 'fps', 60), '?gallery&fps=60');
  assert.equal(withFlag('?gallery', 'testclock', true), '?gallery&testclock');
  assert.equal(withFlag('?gallery', 'testclock', '4'), '?gallery&testclock=4');
  assert.equal(withFlag('?gallery', 'rest', true), '?gallery&rest=off');
});

test('withFlag clears a flag and keeps every other parameter, their order and the hash', () => {
  assert.equal(withFlag('?gallery&perf&preset=cirr-decomp#s=abc', 'perf', false), '?gallery&preset=cirr-decomp#s=abc');
  assert.equal(withFlag('?perf', 'perf', false), '');
  assert.equal(withFlag('?perf#x', 'perf', false), '#x');
  assert.equal(withFlag('?a=1&offgpu=1&b&c=%20d', 'offgpu', false), '?a=1&b&c=%20d');
  assert.equal(withFlag('?a=1&perf&b=2', 'offgpu', true), '?a=1&perf&b=2&offgpu=1');
  assert.equal(withFlag('?gallery#top', 'lap', true), '?gallery&lap#top');
});

test('withFlag changes a flag in place, and a flag set twice becomes one', () => {
  assert.equal(withFlag('?fps=30&gallery', 'fps', '120'), '?fps=120&gallery');
  assert.equal(withFlag('?a&perf&b&perf', 'perf', true), '?a&perf&b');
  assert.equal(withFlag('?a&perf&b&perf', 'perf', false), '?a&b');
  assert.equal(withFlag('?testclock=2&x', 'testclock', true), '?testclock&x');
});

test('withFlag takes a search with or without its question mark, and never throws on odd text', () => {
  assert.equal(withFlag('gallery', 'perf', true), '?gallery&perf');
  assert.equal(withFlag('?&&gallery&', 'perf', true), '?gallery&perf');
  assert.equal(withFlag(undefined, 'perf', true), '?perf');
  assert.equal(withFlag('?x=%E0%A4%A', 'perf', true), '?x=%E0%A4%A&perf');
});

test('withFlag and flagState agree: every flag round-trips on and off', () => {
  for (const f of FLAGS) {
    const on = withFlag('?gallery&preset=healthy#h', f.id, true);
    assert.equal(flagState(on)[f.id].on, true, `${f.id} on`);
    assert.deepEqual(otherParams(on), ['gallery', 'preset=healthy'], f.id);
    assert.ok(on.endsWith('#h'), f.id);
    const off = withFlag(on, f.id, false);
    assert.equal(off, '?gallery&preset=healthy#h', `${f.id} off`);
    assert.equal(flagState(off)[f.id].on, false);
  }
});

test('flagState reads the forms the app reads', () => {
  const s = flagState('?perf&offgpu=1&fps=120&testclock=4&lap&rest=off#perf2');
  assert.deepEqual([s.perf.on, s.offgpu.on, s.fps.on, s.testclock.on, s.lap.on, s.rest.on], [true, true, true, true, true, true]);
  assert.equal(s.fps.value, '120');
  assert.equal(s.testclock.value, '4');
  assert.equal(s.perf.value, null);
  assert.equal(s.inputs.on, false);
  // (one spelling: a bare ?offgpu is ?offgpu=1, and =0 is off; ?fps needs digits)
  const t = flagState('?offgpu&budget=0&fps=fast&rest=on&lumenscale=big');
  assert.deepEqual([t.offgpu.on, t.budget.on, t.fps.on, t.rest.on, t.lumenscale.on], [true, false, false, false, false]);
  assert.equal(flagState('?testclock').testclock.on, true);
  assert.equal(flagState('').perf.on, false);
  assert.equal(flagState('?perf2').perf.on, false);   // (a different word is not the flag)
  assert.equal(flagState('#perf').perf.on, false);   // (the hash is not the search)
});

test('flagText, validValue and otherParams', () => {
  assert.equal(flagText('perf'), 'perf');
  assert.equal(flagText('offgpu'), 'offgpu=1');
  assert.equal(flagText('lumenscale'), 'lumenscale=0.5');
  assert.equal(flagText('unknown-thing'), 'unknown-thing');
  assert.equal(validValue('fps', '120'), true);
  assert.equal(validValue('fps', '12x'), false);
  assert.equal(validValue('testclock', '2.5'), true);
  assert.equal(validValue('lumenscale', '0.25'), true);
  assert.equal(validValue('lumenscale', '2'), false);
  assert.equal(validValue('perf', '1'), false);
  assert.deepEqual(otherParams('?gallery&perf&preset=x&slide=3'), ['gallery', 'preset=x', 'slide=3']);
});

test('the flags the app reads are all listed, and each has a meaning', () => {
  const ids = FLAGS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['perf', 'fps', 'offgpu', 'budget', 'lap', 'inputs', 'testclock']) assert.ok(ids.includes(id), id);
  for (const f of FLAGS) assert.ok(f.meaning.length > 20, f.id);
  // every flag named in the app's own address reads is in the list (a new diagnostic flag must be added here)
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? (f === 'gallery' ? [] : walk(join(d, f))) : [join(d, f)]));
  const found = new Set();
  for (const f of walk(root).filter((x) => x.endsWith('.js'))) {
    const text = readFileSync(f, 'utf8');
    for (const line of text.split('\n').filter((l) => /location\.search/.test(l))) {
      for (const m of line.matchAll(/\[\?&\]\(?(?:\?:)?([a-z]+(?:\|[a-z]+)*)/g)) for (const w of m[1].split('|')) found.add(w);
    }
  }
  const NOT_DIAGNOSTIC = new Set(['presenter', 'gallery']);   // (?presenter-view: the presenter's second window; ?gallery: the page these benches live in, kept by withFlag. Neither is a diagnostic)
  for (const w of found) assert.ok(ids.includes(w) || NOT_DIAGNOSTIC.has(w), `?${w} is read by the app but not listed in flags.js`);
});

test('reportsAvailable shows only what pps has', () => {
  assert.deepEqual(reportsAvailable(null), []);
  assert.deepEqual(reportsAvailable({}), []);
  const pps = { hud: () => 'x', report: () => [], budget: () => ({}), surfaces: () => [], contexts: () => ({}), caught: () => ({}), store: {} };
  assert.deepEqual(reportsAvailable(pps), ['hud', 'report', 'budget', 'surfaces', 'contexts']);
  assert.ok(reportsAvailable({ perf: {} }).includes('perf'));
  assert.ok(reportsAvailable({ motionBudget: { totals: () => ({}) } }).includes('motion'));
  assert.ok(!reportsAvailable({ motionBudget: {} }).includes('motion'));
  assert.equal(new Set(REPORTS.map((r) => r.id)).size, REPORTS.length);
});

test('the perf report leaves out the recording and does not touch the input tracker', () => {
  let touched = 0;
  const pps = { get perf() { return { fps: 60, frames: [1, 2, 3], get inputToPaint() { touched++; return {}; } }; } };
  const r = REPORTS.find((x) => x.id === 'perf');
  assert.deepEqual(r.read(pps), { fps: 60 });
  assert.equal(touched, 0);
});

test('formatReport: strings, lines, JSON, cycles, functions and a cap', () => {
  assert.equal(formatReport('hello'), 'hello');
  assert.equal(formatReport(['a', 'b']), 'a\nb');
  assert.equal(formatReport({ a: 1 }), '{\n  "a": 1\n}');
  assert.equal(formatReport(undefined), '(nothing)');
  const c = { n: 1 }; c.self = c;
  assert.match(formatReport(c), /\[circular\]/);
  assert.match(formatReport({ f() {} }), /\[function f\]/);
  const cut = formatReport('x'.repeat(50), 10);
  assert.ok(cut.startsWith('xxxxxxxxxx\n'));
  assert.match(cut, /cut at 10 characters \(50 in all\)/);
});

test('caughtLines lists the most caught first', () => {
  assert.deepEqual(caughtLines({}), []);
  assert.deepEqual(caughtLines({ 'a:1': { n: 1, last: 'x' }, 'b:2': { n: 5, last: 'boom' } }), ['b:2  ×5  boom', 'a:1  ×1  x']);
});
