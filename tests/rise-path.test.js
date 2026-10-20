// Out of a zoomed-in lobule (Circulation 9 to 10): the camera pulls straight out toward the next view, with no sideways pan across
// the lobule before it zooms out (Mohammad, 20 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { riseAnchor, riseCentre } from '../src/ui/rise-path.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('the lobule leaves its place and lands on the dive point, scaled about one fixed point', () => {
  const a = [720, 410], b = [430, 0], lt = Math.log(5) + Math.log(300 / 24), q1 = Math.exp(-lt);
  const [x0, y0] = riseCentre(a, b, q1, 1), [x1, y1] = riseCentre(a, b, q1, q1);
  assert.ok(close(x0, a[0]) && close(y0, a[1]), 'starts where the lobule is');
  assert.ok(close(x1, b[0]) && close(y1, b[1]), 'ends on the liver in the next view');
  // Every step of the zoom, the lobule's centre moves exactly as a point scaled about the anchor would: radially, never sideways.
  const p = riseAnchor(a, b, q1);
  for (let i = 0; i <= 40; i++) {
    const z = lt * (1 - i / 40), q = Math.exp(z - lt), [x, y] = riseCentre(a, b, q1, q);
    assert.ok(close(x - p[0], (a[0] - p[0]) * q, 1e-9) && close(y - p[1], (a[1] - p[1]) * q, 1e-9), `on the line at step ${i}`);
  }
});

test('no pan before the zoom: the share of the way travelled never runs ahead of the share of the scale lost', () => {
  const a = [720, 410], b = [430, 0], lt = Math.log(5) + Math.log(300 / 24), q1 = Math.exp(-lt);
  for (let i = 1; i < 40; i++) {
    const q = Math.exp(lt * (1 - i / 40) - lt), [x, y] = riseCentre(a, b, q1, q);
    const moved = Math.hypot(x - a[0], y - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]), shrunk = (1 - q) / (1 - q1);
    assert.ok(close(moved, shrunk, 1e-9), `step ${i}: moved ${moved.toFixed(3)} vs zoomed ${shrunk.toFixed(3)}`);
  }
  // Already there: no motion at all.
  assert.deepEqual(riseCentre([5, 5], [5, 5], q1, 0.5), [5, 5]);
});

test('the stage uses the straight path for every way out of a landed lobule, the dive in keeps its drift', () => {
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(st, /const \[px, py\] = riseLine \? riseCentre\(\[diveLand\.x, diveLand\.y\], \[ox, oy\], Math\.exp\(-lt\), Math\.exp\(z - lt\)\) : \[lerp\(ox, diveLand\.x, g\), lerp\(oy, diveLand\.y, g\)\];/);
  assert.match(st, /riseFast = false; riseLine = false;/, 'a fresh dive in drops it');
  assert.match(st, /\} else if \(!on && diveT >= 1\) \{\n\s+riseLine = true;/, 'set as any way out of the landed lobule begins');
  assert.equal((st.match(/riseLine = (?:true|false);/g) || []).length, 2, 'only there: a reversal keeps the path it was on');
});
