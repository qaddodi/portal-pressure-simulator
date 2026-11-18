// R13 (external production review, 15 Nov 2026): tests ran green on Node 22 and failed on 24 (the allocation test of the shims), so the toolchain is pinned:
// package.json engines, .nvmrc and every workflow's node-version name the same major, and the typecheck is a CI step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = (p) => new URL(`../${p}`, import.meta.url);
const major = Number(readFileSync(root('.nvmrc'), 'utf8').trim());

test('.nvmrc, engines and the running Node agree on one major', () => {
  const pkg = JSON.parse(readFileSync(root('package.json'), 'utf8'));
  assert.equal(pkg.engines.node, `>=${major} <${major + 1}`);
  assert.equal(Number(process.versions.node.split('.')[0]), major, `the tests are written for Node ${major}; this is ${process.version}`);
});

test('every workflow sets up that Node major', () => {
  for (const f of readdirSync(root('.github/workflows'))) {
    const s = readFileSync(root(`.github/workflows/${f}`), 'utf8');
    for (const m of s.matchAll(/node-version:\s*['"]?(\d+)/g)) assert.equal(Number(m[1]), major, `${f}: node-version ${m[1]}`);
  }
});

test('the typecheck runs in CI, with TypeScript pinned to one version', () => {
  assert.match(readFileSync(root('.github/workflows/ci.yml'), 'utf8'), /npm run typecheck/);
  assert.match(JSON.parse(readFileSync(root('package.json'), 'utf8')).scripts.typecheck, /typescript@5\.6\.3/);
});
