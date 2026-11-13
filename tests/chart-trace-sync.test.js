// F5 (V-CHART-3, V-CHART-5): the pressure strip's scroll is never carried over by the scheduler, and the HVPG tracing is drawn in the
// frame the balloon moves in (not the next one). Source checks: these modules need a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('every scrolling trace marks itself animating while it runs, and lets go when it stops or is disposed', () => {
  for (const [file, tag] of [['doppler', 'doppler'], ['fibroscan', 'fibroscan'], ['pressure-time', 'pressure-time']]) {
    const s = read(`../src/ui/${file}.js`);
    assert.match(s, new RegExp(`frameAnimating\\('${tag}', on\\)`), `${file} registers`);
  }
  const pt = read('../src/ui/pressure-time.js');
  assert.match(pt, /anim\(true\);\s*const pace = [^\n]*\n\s*if \([^\n]*restPark\([^\n]*\) tickRaf = nextFrame\(tickLoop\);/, 'on while the loop is asked for, or waits on its rest timer (13 Nov 2026)');
  assert.match(pt, /if \(!live\(\)\) \{ ticking = false; anim\(false\); return; \}/, 'off when it stops');
  assert.match(pt, /ticking = false; frame = null; anim\(false\);/, 'off on dispose');
});

test('the HVPG balloon draws the tracing at once, in the figure\'s frame', () => {
  const s = read('../src/ui/hvpg-proc.js');
  const fn = s.slice(s.indexOf('function balloon(b)'), s.indexOf('// (A new size redraws it'));
  assert.match(fn, /step\(now\)/, 'steps now');
  assert.doesNotMatch(fn, /\bgo\(\)/, 'does not wait for the next frame');
  assert.match(fn, /if \(!raf\) last = now/, 'no stale elapsed time when the loop was idle');
});
