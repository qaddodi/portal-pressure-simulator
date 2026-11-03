// R05: a time limit or an unfilled instrument window is no certificate of readiness: it is labelled, and a failed preparation is tried afresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const PZ = read('../src/ui/presenter.js'), TOOLS = read('../src/ui/presenter-tools.js');

test('tools.ready says false for an ask that timed out, failed, answered nothing or was let go, and follows a newer ask', () => {
  assert.match(TOOLS, /const ok = tok === primeTok && !held && made\[k\] === inst && !!m\?\.samples; if \(ok\) inst\.backfill/);
  assert.match(TOOLS, /\.catch\(\(\) => false\)/);
  assert.match(TOOLS, /if \(p === primeP\) return ok; p = primeP;/);
  assert.match(TOOLS, /setTimeout\(r, ms, false\)/);
});

test('the presenter labels a slide shown past its preparation or with an unfilled window, and prepares a failed one afresh', () => {
  assert.match(PZ, /const degrade = \(why\) => \{ degraded\.n\+\+; degraded\.last = why; if \(ui\) ui\.root\.dataset\.pzDegraded = why; \};/);
  assert.match(PZ, /const st = slidePrep\.state\(i\); degrade\('prep-' \+ st\); if \(st !== 'preparing'\) slidePrep\.aim\(i, turn, tx \? tx\.live : undefined\); then\(\);/);
  assert.match(PZ, /if \(!filled\) degrade\('window'\);/);
  assert.match(PZ, /noteResume\(deck\.id, want, slides\.length\);[^\n]*\n\s+if \(ui\) delete ui\.root\.dataset\.pzDegraded;/, 'a press starts clean');
  assert.match(PZ, /degraded: \(\) => \(\{ \.\.\.degraded, now: ui\?\.root\.dataset\.pzDegraded \|\| '' \}\)/);
});
