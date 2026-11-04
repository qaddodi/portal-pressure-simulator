import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('L3: an opaque solo pass skips laying the figure\'s kept picture and leaves it stale, not lost', () => {
  const i = veins.indexOf('t.solo && t.opaque?.()');
  assert.ok(i > 0, 'presentSelf asks solo passes whether they are opaque');
  const body = veins.slice(i, i + 700);
  assert.match(body, /directNow\) \{ directNow = false; ownStale = true; \}/);
  assert.match(body, /runTops\(\)/);
  assert.doesNotMatch(body, /blitFramebuffer|camDraw|underLay/);
  assert.ok(i < veins.indexOf('if (!own?.w || lost) return;'), 'checked before the kept picture is laid');
});

test('L3: the lobule\'s pass says opaque only when faded in and carried over the whole canvas', () => {
  assert.match(lz, /solo: true, opaque: shareOpaque, draw: layShared/);
  const a = lz.indexOf('function shareOpaque()');
  const body = lz.slice(a, a + 900);
  assert.match(body, /fade < 0\.999/);
  assert.match(body, /m\.b \|\| m\.c/);
  assert.match(body, /m\.a \* W \+ tx >= W - 0\.5/);
});
