// An equation's legend names its symbols; a line that only restates the equation in words is noise under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../src/ui/decks/', import.meta.url);

test('no equation carries a legend that only restates it in words', () => {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, DIR), 'utf8');
    assert.doesNotMatch(src, /Wedged minus free hepatic venous pressure/, f);
    assert.doesNotMatch(src, /Portal pressure gradient: the whole fall/, f);
  }
});

test('a catheter slide puts its live tracing right after the equation, before the words', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const eq = src.indexOf('s.eq ? equation(s.eq) : null, s.monitor ? monitorFor(s, i) : null');
  assert.ok(eq > 0, 'monitor follows the equation in the teaching card');
});
