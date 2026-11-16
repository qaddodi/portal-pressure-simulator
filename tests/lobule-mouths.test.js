import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOUTH_BINS, FLARE, FLARE_LEN, flareAt, mouthSite, mouthWords, rimSample, binOpen, sinK } from '../src/ui/lobule-mouths.js';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { captureLobule } from '../scripts/lobule-joins.mjs';
import { webInstances } from '../src/ui/tube-data.js';
import { scene, straight } from './tube-web-helpers.js';

// The rim of a disc seen end-on (central vein, portal venule) opens where a vessel joins it (lobule-mouths.js). 15 Nov 2026, Mohammad: "the central vein boundaries look not good":
// the mask came from the healthy radii, 2 degrees over, so a stub of ink stood beside every mouth; the vessels met the vein square (no flare); the collagen line ended short of the
// wall in a round cap. Each of those is held here.

const line = (x0, y0, x1, y1) => Array.from({ length: N_SAMPLES }, (_, i) => [x0 + ((x1 - x0) * i) / (N_SAMPLES - 1), y0 + ((y1 - y0) * i) / (N_SAMPLES - 1)]);
const open = (w) => Array.from({ length: MOUTH_BINS }, (_, b) => binOpen(w, b));

test('mouthWords: the mouth is the arc the joining vessel\'s lumen takes across the rim, asin(r / rD) either side of its direction, no margin', () => {
  const disc = { id: 0, pts: line(-0.3, 0, 0.3, 0) }, br = { id: 1, pts: line(100, 0, 10, 0) };
  const site = mouthSite(disc, [disc, br], [{ members: [0, 1] }], 20);
  const w = [0, 0, 0], mean = mouthWords(site, 20, [disc, br], () => new Float64Array(N_SAMPLES).fill(4), w);
  assert.equal(mean, 4);
  // bin b is centred (b + 0.5) * 5 - 180 degrees: a vessel along +x (0 degrees) takes the bins at +-2.5 and +-7.5 (asin(0.2) = 11.5 degrees), not +-12.5
  assert.equal(open(w).filter(Boolean).length, 4);
  for (const b of [34, 35, 36, 37]) assert.equal(binOpen(w, b), 1, `bin ${b}`);
  mouthWords(site, 20, [disc, br], () => new Float64Array(N_SAMPLES).fill(8), w);
  assert.equal(open(w).filter(Boolean).length, 10, 'twice the radius: asin(0.4) = 23.6 degrees');
  // (A disc and its joiners both scaling, as congestion does: the same arc.)
  mouthWords(site, 40, [disc, br], () => new Float64Array(N_SAMPLES).fill(8), w);
  assert.equal(open(w).filter(Boolean).length, 4, 'the same ratio, the same mouth');
});

test('mouthWords: a vessel wider than the disc cannot open more than asin 0.94; no joiners: a site of null, a closed rim', () => {
  const disc = { id: 0, pts: line(-0.3, 0, 0.3, 0) }, br = { id: 1, pts: line(100, 0, 10, 0) };
  assert.equal(mouthSite(disc, [disc, br], [{ members: [0] }], 20), null);
  const w = [0, 0, 0];
  mouthWords(mouthSite(disc, [disc, br], [{ members: [0, 1] }], 20), 5, [disc, br], () => new Float64Array(N_SAMPLES).fill(50), w);
  assert.ok(open(w).filter(Boolean).length <= 70, 'a sliver of wall is always left');
});

test('rimSample: the sample of a joining vessel at the disc\'s wall as it is now', () => {
  const pts = line(100, 0, 10, 0);
  const i = rimSample(pts, 0, 0, 30);
  assert.ok(Math.abs(Math.hypot(pts[i][0], pts[i][1]) - 30) <= 100 / N_SAMPLES);
});

test('flareAt: 1 + FLARE at the wall and inside it, 1 FLARE_LEN radii out, eased (no kink at either end), never narrowing as it nears the wall', () => {
  assert.equal(flareAt(-5, 2), 1 + FLARE);
  assert.equal(flareAt(0, 2), 1 + FLARE);
  assert.equal(flareAt(FLARE_LEN * 2, 2), 1);
  assert.equal(flareAt(1e3, 2), 1);
  let prev = 1 + FLARE;
  for (let d = 0; d <= FLARE_LEN * 2; d += 0.25) { const f = flareAt(d, 2); assert.ok(f <= prev + 1e-12, `d ${d}`); prev = f; }
  assert.ok(flareAt(1e-3, 2) > 1 + FLARE - 1e-5, 'flat at the wall');
  assert.ok(flareAt(FLARE_LEN * 2 - 1e-3, 2) < 1 + 1e-5, 'flat where it ends');
});

const cap = await captureLobule({});
const FL = 52, N = N_SAMPLES;
const T = (i) => cap.up.tube[i];
const radius = (row, i) => cap.up.rad[(row * N + i) * 4];
const F_RING = 512;
const rows = [];
for (let r = 0; r < 320; r++) if ((T(r * FL + 10) & F_RING) !== 0) rows.push({ r, mask: [T(r * FL + 12), T(r * FL + 13), T(r * FL + 14)], w: T(r * FL + 15) });
const cvRow = rows.find((k) => T(k.r * FL + 10) === 516);

test('the lobule\'s central vein: each sinusoid that joins it flares to 1 + FLARE of its own radius at the wall, and the mask opens that lumen\'s arc exactly', () => {
  const joiners = cap.joins.filter((j) => j.members.includes(cvRow.r)).map((j) => j.members.find((m) => m !== cvRow.r));
  assert.ok(joiners.length >= 8, `${joiners.length} sinusoids join it`);
  const t = cap.tubes[cvRow.r], rD = radius(cvRow.r, 0);
  const cx = (t.pts[0][0] + t.pts.at(-1)[0]) / 2, cy = (t.pts[0][1] + t.pts.at(-1)[1]) / 2, R = rD / 0.07;   // (the vein's healthy radius is 0.07 of the lobule's)
  const rhoOf = (o, i) => Math.hypot(o.pts[i][0] - cx, o.pts[i][1] - cy) / R;
  let wide = 0;
  for (const id of joiners) {
    const o = cap.tubes.find((x) => x.id === id), k = rimSample(o.pts, (t.pts[0][0] + t.pts.at(-1)[0]) / 2, (t.pts[0][1] + t.pts.at(-1)[1]) / 2, rD);
    const far = Math.min(N - 1, 0); // (the node end of the sinusoid: sample 0, 0.34 of the lobule's radius out)
    const ratio = radius(id, k) / radius(id, far) / (sinK(rhoOf(o, k)) / sinK(rhoOf(o, far)));   // (the flare alone: the sinusoid's own widening toward the vein taken out)
    if (ratio > 1 + FLARE * 0.8) wide++;
    assert.ok(ratio <= 1 + FLARE + 0.05, `row ${id} flares no more than FLARE (${ratio.toFixed(2)})`);
  }
  assert.ok(wide >= joiners.length * 0.8, `${wide} of ${joiners.length} sinusoids flare at the wall`);
  const nOpen = open(cvRow.mask).filter(Boolean).length;
  assert.ok(nOpen >= 40 && nOpen <= 60, `the mouths take most of the rim, not all of it (${nOpen} of ${MOUTH_BINS} bins)`);
});

test('every disc a vessel joins carries the joiners\' mean radius (tube texel 3, w) for its wall line; one nothing joins, 0', () => {
  for (const k of rows) {
    const joined = k.mask.some((v) => v > 0);
    if (joined) assert.ok(k.w > 0.3, `row ${k.r}: ${k.w}`);
    else assert.equal(k.w, 0, `row ${k.r}`);
  }
  const cv = cvRow.w, pv = rows.find((k) => T(k.r * FL + 10) === 580).w;
  assert.ok(cv > 1 && cv < 15 && pv > 1 && pv < 30, `cv ${cv.toFixed(2)}, pv ${pv.toFixed(2)}`);
});

test('no fillet web against a disc seen end-on: a point with a radius has no wall line to be tangent to (the speck and the tick beside every mouth, 15 Nov 2026)', () => {
  const rows = (flags) => [{ ...straight(-0.3, 0, 0.3, 0, 20), flags }, straight(0.5, 0, 0.5, 100, 2)];
  const join = [{ x: 0.5, y: 0, reach: 14, k: 0.4, fillet: 0.5, members: [0, 1], trunk: 0 }];
  const plain = scene(rows(0), join), disc = scene(rows(512), join);
  assert.ok(webInstances(plain.ent, plain.tube, plain.pts, {}).count > 0, 'the same join of two plain vessels does make webs');
  const out = webInstances(disc.ent, disc.tube, disc.pts, {});
  assert.equal(out.count, 0);
  assert.ok(out.empty > 0, 'left out, counted');
});
