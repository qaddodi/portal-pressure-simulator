// The caudate lobe and its veins (anatomy.js CAUDATE) fit where they are drawn: each vein starts inside the lobe and
// ends on the IVC's wall, and the lobe (fully grown) stays inside the framing of every slide that shows it, so it never
// changes a slide's framing, and clear of the azygos line beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUDATE } from '../src/ui/anatomy.js';
import { REGIONS, DECKS } from '../src/ui/decks.js';

const inLobe = ([x, y]) => CAUDATE.lobe.some(([cx, cy, rx, ry, a]) => {
  const r = (-a * Math.PI) / 180, dx = x - cx, dy = y - cy, u = dx * Math.cos(r) - dy * Math.sin(r), v = dx * Math.sin(r) + dy * Math.cos(r);
  return (u / rx) ** 2 + (v / ry) ** 2 < 0.8;   // (well inside: the dome fades out toward its rim)
});

test('each caudate vein starts inside the lobe and ends on the IVC wall', () => {
  for (const [d] of CAUDATE.veins) {
    const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.ok(inLobe([n[0], n[1]]), `starts outside the lobe: ${d}`);
    assert.equal(n[4], CAUDATE.wall, `ends off the IVC wall: ${d}`);
  }
});

test('the grown caudate lobe stays inside the framing of each slide that shows it, clear of the azygos line', () => {
  const [ax, ay] = CAUDATE.anchor, [gx, gy] = CAUDATE.grow;
  const xs = [], ys = [];
  for (const [cx, cy, rx, ry] of CAUDATE.lobe) { const R = Math.max(rx, ry); for (const [x, y] of [[cx - rx, cy - R], [cx + rx, cy + R]]) { xs.push(ax + (x - ax) * (1 + gx)); ys.push(ay + (y - ay) * (1 + gy)); } }
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  assert.ok(box[0] > 566, `left edge ${box[0].toFixed(1)} reaches the azygos line (x 564)`);
  const cams = DECKS.flatMap((d) => d.slides).filter((s) => (Array.isArray(s.terms) ? s.terms : Object.values(s.terms || {})).some((k) => k === 'caudate' || k === 'caudateLobe')).map((s) => s.cam);
  assert.ok(cams.length >= 2, 'the caudate and DIPS slides show the lobe');
  for (const c of cams) { const r = REGIONS[c]; assert.ok(r && box[0] >= r[0] && box[1] >= r[1] && box[2] <= r[2] && box[3] <= r[3], `outside the ${c} framing`); }
});
