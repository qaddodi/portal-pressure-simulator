// R03: a presentation's scope owns its timers; disposing it stops them and later calls do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { createScope } = await import('../src/ui/slide-txn.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a timer runs while the scope is live; dispose clears the waiting ones and refuses new ones', async () => {
  const s = createScope(), hit = [];
  s.timer(() => hit.push('a'), 5);
  s.timer(() => hit.push('b'), 60);
  assert.equal(s.pending(), 2);
  await sleep(25);
  assert.deepEqual(hit, ['a']);
  s.dispose();
  assert.equal(s.live(), false);
  assert.equal(s.timer(() => hit.push('c'), 1), 0);
  await sleep(90);
  assert.deepEqual(hit, ['a'], 'a disposed scope\'s timer never fires');
  s.dispose();
});

test('onDispose functions run newest first, once, also when added after disposal', () => {
  const s = createScope(), log = [];
  s.onDispose(() => log.push(1)); s.onDispose(() => { throw new Error('x'); }); s.onDispose(() => log.push(3));
  s.dispose(); s.dispose();
  assert.deepEqual(log, [3, 1]);
  s.onDispose(() => log.push('late'));
  assert.deepEqual(log, [3, 1, 'late']);
});

test('presenter: its delayed work goes through the talk\'s scope, disposed by stopNow, and the loading timer is cleared in a finally', () => {
  const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  for (const t of ['colT', 'refitT', 'reframeT', 'turnT', 'glassT']) {
    assert.match(PZ, new RegExp(`\\b${t} = stimer\\(`), `${t} is a scoped timer`);
    assert.doesNotMatch(PZ, new RegExp(`\\b${t} = setTimeout\\(`), `${t} is not a bare timer`);
  }
  const stop = PZ.slice(PZ.indexOf('  function stopNow('));
  assert.match(stop.slice(0, 400), /sess\?\.dispose\(\); sess = null; colT = refitT = reframeT = turnT = glassT = 0;/);
  assert.match(PZ, /sess\?\.dispose\(\); sess = createScope\(\);\n\s+ui = build\(\);/);
  assert.match(PZ, /const stimer = \(fn, ms\) => \{ const u = ui; return sess \? sess\.timer\(\(\) => \{ if \(ui === u\) fn\(\); \}, ms\) : 0; \};/);
  assert.match(PZ, /\} finally \{ clearTimeout\(lateT\); \}/);
  assert.match(PZ, /stimer\(\(\) => \{ if \(!cut\(\)\) loading\(true\); \}, 260\)/);
});
