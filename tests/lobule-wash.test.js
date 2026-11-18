// The wedged column's wash in the lobule (Mohammad, 18 Nov 2026, on 80881eb9: "no it doesn't"). HVPG and PPG slide 5 has the camera 'lobule:sinusoid', which lands in the LOBULE
// (the portal triad, the central vein, the sinusoids lit), not in the single-sinusoid view the first wash was written for. The wash now runs on the lobule's own vessels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { washSpan, washInto, WASH_SINUS } from '../src/ui/lobule-wash.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const rho = (pts, cx = 0, cy = 0, R = 100) => pts.map(([x, y]) => Math.hypot(x - cx, y - cy) / R);

test('the slide that asks for the wash lands in the lobule, not the sinusoid view', () => {
  const cams = read('../src/ui/decks/hvpg.js').match(/id: 'wedge-sinusoid'[^\n]*cam: '([^']+)'/);
  assert.equal(cams?.[1], 'lobule:sinusoid', 'a cam that starts "lobule" is the lobule; only "sinusoid…" is the single-sinusoid view');
  const z = read('../src/ui/lobule-zoom.js');
  assert.match(z, /const want = !!store\.get\(\)\.sinusoidWash && fade >= 0\.98 && !gliding && !diveScaled && !sinTo && sinU === 0/, 'it starts once the lobule has landed, never in the sinusoid view');
});

test('the front runs from the centre out along a course that starts at the centre, covering the share of it inside the front', () => {
  const pts = [[10, 0], [30, 0], [50, 0], [70, 0], [90, 0]], out = [0, 0];
  assert.equal(washSpan(pts, rho(pts), 0.05, out), false, 'not yet reached');
  assert.equal(washSpan(pts, rho(pts), 0.5, out), true);
  assert.equal(out[0], 0);
  assert.ok(Math.abs(out[1] - 0.5) < 1e-9, `half the course: ${out[1]}`);
  assert.equal(washSpan(pts, rho(pts), 1.1, out), true);
  assert.deepEqual(out, [0, 1], 'all of it');
});

test('a course drawn from the portal end (its start is the far end) is covered from its centre end', () => {
  const pts = [[90, 0], [70, 0], [50, 0], [30, 0], [10, 0]], out = [0, 0];
  assert.equal(washSpan(pts, rho(pts), 0.5, out), true);
  assert.ok(Math.abs(out[0] - 0.5) < 1e-9 && out[1] === 1, `the later half: ${out}`);
});

test('washInto fills the central vein whole and recolours only the sinusoids the front has reached; it writes nothing at progress 0 or on other vessels', () => {
  const stride = 52, R = 100, geo = { R, rcv0: 7 };
  const mk = (id, kind, pts) => ({ id, kind, pts, rho: rho(pts, 0, 0, R) });
  const tubes = [mk(0, 'cv', [[0, 0], [1, 0]]), mk(1, 's2', [[8, 0], [40, 0], [80, 0]]), mk(2, 's0', [[85, 0], [95, 0]]), mk(3, 'pv', [[100, 0], [101, 0]])];
  const a = new Float32Array(4 * stride);
  washInto(a, tubes, 0, geo, [1, 0.5, 0], stride);
  assert.ok(a.every((x) => x === 0), 'progress 0: nothing');
  washInto(a, tubes, 0.5, geo, [1, 0.5, 0], stride);
  const row = (i) => Array.from(a.slice(i * stride + 32, i * stride + 40));
  assert.ok(row(0)[3] > 0.8 && row(0)[4] === -1 && row(0)[5] === 2, 'the central vein is amber along all of it');
  assert.ok(row(1)[3] > 0.8 && row(1)[4] === -1 && row(1)[5] > 0 && row(1)[5] < 2, 'the sinusoid is amber from its centre end as far as the front');
  assert.ok(row(2).every((x) => x === 0), 'a sinusoid the front has not reached is left alone');
  assert.ok(row(3).every((x) => x === 0), 'the portal venule is not washed');
  assert.deepEqual([...WASH_SINUS].sort(), ['an', 's0', 's1', 's2']);
  const b = new Float32Array(4 * stride);
  washInto(b, tubes, 1, geo, [1, 0.5, 0], stride);
  assert.ok(b.slice(2 * stride + 32, 2 * stride + 36)[3] > 0, 'by the end the front has reached every sinusoid');
});

test('the lobule writes the wash with its attributes, again whenever it moved, and draws while it runs', () => {
  const z = read('../src/ui/lobule-zoom.js');
  assert.match(z, /if \(inkMoved \|\| !akSame \|\| washQ !== washSent\) \{/);
  assert.match(z, /washInto\(tubeData, tubeSet, washQ \/ 200, G, wedgeRGB, TUBE_TEXELS \* 4\);\s*\n\s*\}\s*\n\s*washSent = washQ;/);
  assert.match(z, /const panOnly = dt === 0 && !rzMoving && !lensFrom && washQ === washSent/, 'a wash on its way is never skipped as a pan');
  assert.match(z, /if \(washStep\(now\)\) drawVersion\+\+;/, 'the loop keeps drawing while it runs');
  const at = z.indexOf('washInto(tubeData'), fill = z.lastIndexOf('tubeData.fill(0)', at), send = z.indexOf("framePart('lz.vessels: attributes send'", at);
  assert.ok(fill > 0 && fill < at && at < send, 'written after the rows are cleared and rebuilt, before they are sent');
});
