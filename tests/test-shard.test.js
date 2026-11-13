// The unit tests run in parallel shards (scripts/test-shard.mjs, unit-tests.yml): every test file must be in exactly one shard, whatever the
// weights file says, or a test would silently never run in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shardFiles, testFiles } from '../scripts/test-shard.mjs';

const N = 4;
test('every test file is in exactly one of the shards, with or without weights', () => {
  const all = testFiles();
  assert.ok(all.length > 100, 'found the tests');
  for (const weights of [undefined, {}, { [all[0]]: 500 }]) {
    const seen = new Map();
    for (let i = 1; i <= N; i++) for (const f of shardFiles(i, N, all, weights)) seen.set(f, (seen.get(f) || 0) + 1);
    assert.equal(seen.size, all.length);
    assert.ok([...seen.values()].every((c) => c === 1));
  }
});

test('the workflow runs the same number of shards as the sharder is asked for', () => {
  const y = readFileSync(new URL('../.github/workflows/unit-tests.yml', import.meta.url), 'utf8');
  assert.match(y, new RegExp(`shard: \\[${Array.from({ length: N }, (_, i) => i + 1).join(', ')}\\]`));
  assert.match(y, new RegExp(`--run \\$\\{\\{ matrix\\.shard \\}\\}/${N}`));
});

test('the shards are balanced by the weights (the lightest is at least 70% of the heaviest)', () => {
  const w = JSON.parse(readFileSync(new URL('../scripts/test-weights.json', import.meta.url), 'utf8'));
  const sums = Array.from({ length: N }, (_, k) => shardFiles(k + 1, N).reduce((s, f) => s + (w[f] ?? 2), 0));
  assert.ok(Math.min(...sums) >= 0.7 * Math.max(...sums), sums.join(' '));
});
