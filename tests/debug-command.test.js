// One command for every debug tool (bible review 19 Nov 2026, 7.5): `npm run debug -- <verb>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { plan } from '../scripts/debug.mjs';

const run = (...a) => spawnSync('node', ['scripts/debug.mjs', ...a], { encoding: 'utf8' });

test('each verb runs the script that does the work, and `sweep --layout-only` is the deck sweep\'s fast mode', () => {
  assert.deepEqual(plan('packet', ['show', 'p.txt']), [{ file: 'packet.mjs', args: ['show', 'p.txt'] }]);
  assert.deepEqual(plan('report', ['compare', 'a', 'b']), [{ file: 'report.mjs', args: ['compare', 'a', 'b'] }]);
  assert.deepEqual(plan('sweep', ['decks', '--layout-only', '--decks', 'hvpg']), [{ file: 'deck-sweep.mjs', args: ['--fast', '--decks', 'hvpg'] }]);
  assert.equal(plan('sweep', ['specimens', '--layout-only'])[0].file, 'gallery-sweep.mjs');
  assert.deepEqual(plan('sweep', ['specimens', '--layout-only'])[0].args, []);
  assert.equal(plan('sweep', ['turns'])[0].file, 'rotate-sweep.mjs');
  assert.equal(plan('sweep', ['nothing']), null);
  assert.equal(plan('scan', []).length, 3);
  assert.equal(plan('model', ['--list'])[0].file, 'model-cli.mjs');
  assert.equal(plan('nope', []), null);
});

test('every script a verb names exists', () => {
  for (const v of ['packet', 'report', 'model', 'affected', 'scan']) for (const s of plan(v, [])) assert.ok(readFileSync(new URL(`../scripts/${s.file}`, import.meta.url), 'utf8').length > 0, s.file);
  for (const k of ['decks', 'specimens', 'turns']) assert.ok(readFileSync(new URL(`../scripts/${plan('sweep', [k])[0].file}`, import.meta.url), 'utf8').length > 0);
});

test('rules lists every rule with its owner and why, by family; flags lists every flag with its gate', () => {
  const all = run('rules');
  assert.equal(all.status, 0); assert.match(all.stdout, /^\d+ rules/); assert.match(all.stdout, /fit-small\s+state\s+src\/ui\/card-type\.js: /);
  const edge = run('rules', '--family', 'edge');
  assert.match(edge.stdout, /^5 rules in family edge/); assert.ok(!/fit-small/.test(edge.stdout));
  const js = JSON.parse(run('rules', '--json').stdout);
  assert.ok(js.every((r) => r.id && r.owner && r.why && r.family));
  const fl = run('flags');
  assert.equal(fl.status, 0); assert.match(fl.stdout, /\?perf\s+live/); assert.match(fl.stdout, /\?watch\s+(preview|local)/);
});

test('help lists the verbs (exit 0); an unknown verb says so and exits 2; --print runs nothing', () => {
  const h = run(); assert.equal(h.status, 0); for (const v of ['packet', 'report', 'model', 'sweep', 'rules', 'flags', 'scan']) assert.match(h.stdout, new RegExp(`debug -- ${v}`));
  const bad = run('nope'); assert.equal(bad.status, 2); assert.match(bad.stderr, /no verb "nope"/);
  const p = run('sweep', 'decks', '--print', '--layout-only'); assert.equal(p.status, 0); assert.equal(p.stdout.trim(), 'node scripts/deck-sweep.mjs --fast');
});

test('the old script names point to the new command, and say nothing when the new command ran them', () => {
  const old = spawnSync('node', ['scripts/packet.mjs'], { encoding: 'utf8' });
  assert.match(old.stderr, /npm run debug -- packet/);
  const viaDebug = spawnSync('node', ['scripts/debug.mjs', 'packet'], { encoding: 'utf8' });
  assert.ok(!/tip: this is/.test(viaDebug.stderr));
});
