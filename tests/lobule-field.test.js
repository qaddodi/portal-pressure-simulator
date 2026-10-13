// The lobule dive's field: few, large lobules (a field of hundreds slowed the zoom), and the ones away from the
// landing lobule fade into the page as the zoom goes on, ending on the lobule view's own surround.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');

test('the field starts with lobules large enough to keep their count low', () => {
  const rh = Number(stage.match(/const RH = (\d+)/)[1]);
  assert.ok(rh >= 20, `field lobules start at ${rh}px; at 11px the screen held hundreds`);
});

test('the dive fades the lobules away from the landing one, in and out, rising to full focus', () => {
  assert.match(stage, /focus: smoothT\(0\.\d+, 0\.8, t\)/, 'focus follows the dive clock, so the rise out reverses it');
  assert.match(lz, /const f = clamp\(d\.focus \?\? d\.quiet, 0, 1\)/);
  // At focus 1 the clear circle is the lobule view's resting surround (rd × 1.1), so the landing has no jump.
  assert.match(lz, /Math\.log\(Math\.min\(diag \* 0\.45, rd \* 1\.1\)\), f\)/);
  assert.match(lz, /fieldFade\(c, shadeOf\(rgb01\(bg\), dark\), sx \* dpr, sy \* dpr, R \* V\.k \* dpr, 1,/, 'the resting view keeps the faded surround');
});
