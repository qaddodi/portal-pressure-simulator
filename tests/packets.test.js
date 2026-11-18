// Every fixture in tests/packets/ (made from a bug packet by `node scripts/packet.mjs test`) replayed in Node: its state put back, the screen report taken, the rules run.
// The test fails when a finding the packet named is back, or a value the fixture expects is not on the screen. Guide: docs/bug-packet.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runFixture, FIXTURE_V } from '../src/ui/packet/test-from-packet.js';

const DIR = fileURLToPath(new URL('./packets/', import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

test('fixtures are well formed: a name that is the file\'s, a state, and something to hold', () => {
  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    assert.equal(fx.kind, 'pps-packet-test', f); assert.equal(fx.v, FIXTURE_V, f); assert.equal(`${fx.name}.json`, f, `${f}: the name inside is the file's`);
    assert.ok(fx.state?.share, `${f}: a state to rebuild`); assert.ok(fx.hold?.length || fx.expect?.length, `${f}: something to hold`);
  }
});

if (files.length) {
  let env;
  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    test(`packet ${fx.name} stays fixed`, { timeout: 300000 }, async () => {
      env ??= await (await import('../scripts/packet-node.mjs')).makeEnv({ packet: fx });
      const r = await runFixture(fx, env);
      assert.deepEqual(r.failures, [], `the bug of packet ${fx.from || fx.name} is back (${fx.note || 'no note'}):\n${r.failures.join('\n')}`);
    });
  }
}
