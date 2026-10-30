import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The credit's look over the art after the camera rests took 73 to 95 ms on a Mac (?perf readout, 21 Oct), most of it reading
// the organs' 1 MB of outlines into Path2D again on every look. A path's Path2D is kept while its outline is the same.
const src = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');

test("a path's outline is read once and kept until it changes", () => {
  const fn = src.slice(src.indexOf('function shapePath('), src.indexOf('let organMemo'));
  assert.match(fn, /const d = el\.getAttribute\('d'\) \|\| '', m = pathMemo\.get\(el\);\n\s+if \(m && m\.d === d\) return m\.p;/);
  assert.match(src, /const pathMemo = new WeakMap\(\);/, 'kept per element, let go with it');
  assert.match(src, /const art = gpuProbe\.time\(null, 'credit: art grid', \(\) => organTest\(wr, ring, soon\)\), artWait = art === PENDING;/, 'timed by name in the ?perf readout');
});
