// The caudate lobe and its veins (anatomy.js CAUDATE_LOBE, EDGE_PATH.CAUD, FEEDERS.CAUD) fit where they are drawn:
// the veins and their tributaries inside the lobe, the lobe (fully grown) inside the framing of every slide that
// outlines it, so it never changes a slide's framing, and clear of the azygos line beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUDATE_LOBE, EDGE_PATH, FEEDERS, fanFeeders } from '../src/ui/anatomy.js';
import { REGIONS, DECKS } from '../src/ui/decks.js';

// Points along an absolute M/C path (each cubic sampled).
function sample(d, n = 24) {
  const v = d.match(/-?\d+(?:\.\d+)?/g).map(Number), out = [[v[0], v[1]]];
  for (let i = 2; i + 5 < v.length; i += 6) {
    const p0 = out[out.length - 1], c1 = [v[i], v[i + 1]], c2 = [v[i + 2], v[i + 3]], p1 = [v[i + 4], v[i + 5]];
    for (let j = 1; j <= n; j++) { const t = j / n, u = 1 - t; out.push([0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p1[k])); }
  }
  return out;
}
const inside = (poly, [x, y]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const lobe = sample(CAUDATE_LOBE.d);
const grown = (() => { const [ax, ay] = CAUDATE_LOBE.anchor, [gx, gy] = CAUDATE_LOBE.grow; return lobe.map(([x, y]) => [ax + (x - ax) * (1 + gx), ay + (y - ay) * (1 + gy)]); })();

test('the caudate veins and their tributaries lie inside the caudate lobe', () => {
  const pts = [sample(EDGE_PATH.CAUD)[0], ...fanFeeders(FEEDERS.CAUD.fan).map((f) => sample(f.d.replace(/Q/g, 'C'))[0])];
  for (const p of pts) assert.ok(inside(lobe, p), `outside the lobe: ${p.map(Math.round)}`);
});

test('the grown caudate lobe stays inside the framing of each slide that outlines it, clear of the azygos line', () => {
  const xs = grown.map((p) => p[0]), ys = grown.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  assert.ok(box[0] > 567, `left edge ${box[0].toFixed(1)} reaches the azygos line (x 564)`);
  const cams = DECKS.flatMap((d) => d.slides).filter((s) => (Array.isArray(s.terms) ? s.terms : Object.values(s.terms || {})).includes('caudate')).map((s) => s.cam);
  assert.ok(cams.length >= 2, 'the caudate and DIPS slides outline the lobe');
  for (const c of cams) { const r = REGIONS[c]; assert.ok(r && box[0] >= r[0] && box[1] >= r[1] && box[2] <= r[2] && box[3] <= r[3], `outside the ${c} framing`); }
});
