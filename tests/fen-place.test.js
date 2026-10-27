// The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis): the pill was set beside
// the stellate cell's name and, when the two overlapped, shoved up while its leader still ran down through the stellate name
// ("competing with the stellate cell call out"). It now sits in clear space, its leader ending at an open pore of the lining.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeFenDisse, disseSpot } from '../src/ui/fen-place.js';
import { poreAt, poreOpenness, calloutPore, underNucleus, cellEdge, SEED } from '../src/ui/sinusoid-gl.js';

const VIEW = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');

const X = 400, pores = [];
for (let j = -X; j < X; j++) { const p = poreAt(j, SEED.poreUp); if (p) pores.push(p); }
// The stellate cell's place, as ensureGeo picks it.
let xs = cellEdge(0, SEED.plateUp);
for (let j = -3; j <= 2; j++) { const b = cellEdge(j, SEED.plateUp); if (Math.abs(b + 10) < Math.abs(xs + 10)) xs = b; }

// A view: k px per µm, the free stretch fw px wide (centred on x = 0, 6 px kept at each end), and the names' widths in px.
const view = ({ k, fw, hsPx, fenPx, dPx }) => {
  const fp = 16 / k, lo = (-fw / 2 + 6) / k, hi = (fw / 2 - 6) / k;
  const hs = [xs - hsPx / 2 / k, xs + hsPx / 2 / k], fh = fenPx / 2 / k, dh = dPx / 2 / k;
  return { k, fp, lo, hi, hs, fh, dh, r: placeFenDisse({ pores, nsd: SEED.nucUp, lo, hi, hs, fh, dh, fp, xs }) };
};
const apart = (a, b, gap) => a[1] + gap <= b[0] || b[1] + gap <= a[0];

// The placement the view had before: a pore near 60 % across, the pill 0.8 fp beyond it; a pore beyond the stellate name when they overlap.
const before = ({ k, fw, hsPx, fenPx }) => {
  const fp = 16 / k, fr = [-fw / 2 / k, fw / 2 / k], half = fenPx / 2 / k, hsHalf = hsPx / 2 / k;
  const pick = (u) => fr[0] + 8 + u * (fr[1] - fr[0] - 16), fenAt = (x) => calloutPore(pores, x, fr[0] + 3, fr[1] - 3, SEED.nucUp);
  let xp = fenAt(pick(0.6)), x = xp + half + fp * 0.8;
  if (Math.abs(x - xs) - half - hsHalf < fp) { xp = fenAt(xs + hsHalf + fp * 2); x = xp + half + fp * 0.8; }
  return { xp, pill: [x - half, x + half], hs: [xs - hsHalf, xs + hsHalf] };
};

const SIZES = [
  { name: 'a big Mac with the cards at the left (the screenshot)', k: 14, fw: 1176, hsPx: 263, fenPx: 128, dPx: 190 },
  { name: 'the same with the shorter name (not activated)', k: 14, fw: 1176, hsPx: 190, fenPx: 128, dPx: 190 },
  { name: 'Explore on a wide screen', k: 14, fw: 1700, hsPx: 263, fenPx: 128, dPx: 190 },
  { name: 'a laptop', k: 12, fw: 900, hsPx: 263, fenPx: 128, dPx: 190 },
  { name: 'an iPad on its side', k: 11, fw: 740, hsPx: 250, fenPx: 120, dPx: 180 },
];

test('the old placement put the pill over the stellate cell\'s name on a big screen (the screenshot)', () => {
  const b = before(SIZES[0]);
  assert.ok(!apart(b.pill, b.hs, 0), `the pill ${b.pill.map((v) => v.toFixed(1))} overlapped the name ${b.hs.map((v) => v.toFixed(1))} (µm)`);
});

test('the pill sits clear of the stellate name, its pore an open one the nuclei leave showing, in every size and name length', () => {
  for (const s of SIZES) for (const act of [1, 0]) {
    const v = view({ ...s, hsPx: act ? s.hsPx : s.hsPx * 0.72 });
    const { r, fh, fp, lo, hi, hs } = v;
    assert.ok(r, `${s.name}: placed`);
    const pill = [r.xc - fh, r.xc + fh];
    assert.ok(pill[0] >= lo - 1e-9 && pill[1] <= hi + 1e-9, `${s.name}: the pill is inside the free stretch`);
    assert.ok(r.xp >= lo && r.xp <= hi, `${s.name}: so is its pore`);
    assert.ok(apart(pill, hs, 2 * fp - 1e-9), `${s.name}: a clear gap from the stellate name (${pill.map((x) => x.toFixed(1))} vs ${hs.map((x) => x.toFixed(1))})`);
    assert.ok(!underNucleus(r.xp, SEED.nucUp), `${s.name}: the pore is not under a nucleus's swell`);
    const p = pores.find((q) => q.x === r.xp);
    assert.ok(p, `${s.name}: a pore of the lining`);
    // (the pill's near edge keeps its distance from the pore, so the leader is drawn: leader() shows one only when the pore is 6 px past the pill)
    assert.ok(Math.abs(r.xc - r.xp) - fh > 0.5 * fp, `${s.name}: the pore is clear of the pill's edge`);
    assert.ok(!(r.xp > hs[0] - fp && r.xp < hs[1] + fp), `${s.name}: the leader's end is not under the stellate name`);
    // Open when the wall is: and still a pore that stays open in a cirrhotic one (15 % open).
    assert.ok(p.th < 0.3, `${s.name}: a plate's middle pore (th ${p.th.toFixed(2)})`);
    assert.ok(poreOpenness(p.th, 0.15) > 0.3, `${s.name}: partly open even at 15 %`);
  }
});

test('the Space of Disse\'s name keeps clear of the pill, its leader and the stellate name, inside the stretch', () => {
  for (const s of SIZES) {
    const { r, fh, dh, fp, lo, hi, hs } = view(s);
    assert.ok(r.xq != null, `${s.name}: all three fit side by side`);
    const d = [r.xq - dh, r.xq + dh], strip = [Math.min(r.xc - fh, r.xp), Math.max(r.xc + fh, r.xp)];
    assert.ok(d[0] >= lo - 1e-9 && d[1] <= hi + 1e-9, `${s.name}: inside the free stretch (${d.map((x) => x.toFixed(1))} in ${lo.toFixed(1)}..${hi.toFixed(1)})`);
    assert.ok(apart(d, strip, fp - 1e-9), `${s.name}: clear of the pill and its leader`);
    assert.ok(apart(d, hs, fp - 1e-9), `${s.name}: clear of the stellate name`);
  }
});

test('on a grid of screens and name lengths, whenever a place is found nothing touches', () => {
  let placed = 0, withD = 0, total = 0;
  for (const k of [6, 7, 8, 9, 10, 11, 12, 13, 14]) for (let fw = 300; fw <= 1900; fw += 100) for (const hsPx of [150, 190, 263, 330]) for (const fenPx of [96, 128]) {
    total++;
    const { r, fh, dh, fp, lo, hi, hs } = view({ k, fw, hsPx, fenPx, dPx: 120 + (k % 3) * 35 });
    if (!r) continue;
    placed++;
    const pill = [r.xc - fh, r.xc + fh], tag = `k ${k}, ${fw} px, name ${hsPx} px`;
    assert.ok(pill[0] >= lo - 1e-9 && pill[1] <= hi + 1e-9 && apart(pill, hs, 2 * fp - 1e-9), `${tag}: the pill is inside and clear of the name`);
    assert.ok(!underNucleus(r.xp, SEED.nucUp), `${tag}: a pore in view`);
    if (r.xq == null) continue;
    withD++;
    const d = [r.xq - dh, r.xq + dh], strip = [Math.min(pill[0], r.xp), Math.max(pill[1], r.xp)];
    assert.ok(d[0] >= lo - 1e-9 && d[1] <= hi + 1e-9 && apart(d, strip, fp - 1e-9) && apart(d, hs, fp - 1e-9), `${tag}: the Disse name is inside and clear`);
  }
  assert.ok(placed > total * 0.6 && withD > total * 0.4, `most screens place the pill (${placed}/${total}), and many the Disse name too (${withD})`);
});

test('a view too narrow for the three still places the pill clear of the stellate name; the Disse name is left to its old step', () => {
  const v = view({ k: 7, fw: 450, hsPx: 170, fenPx: 100, dPx: 120 });
  assert.ok(v.r && v.r.xq === null, 'the pill alone');
  assert.ok(apart([v.r.xc - v.fh, v.r.xc + v.fh], v.hs, 2 * v.fp - 1e-9));
  assert.equal(placeFenDisse({ pores, nsd: SEED.nucUp, lo: -3, hi: 3, hs: [-1, 1], fh: 4, dh: 2, fp: 1, xs }), null, 'nowhere to put it: the old way');
});

test('the pick is by place only: the same whatever the wall\'s open share', () => {
  // (nothing in it reads the open share; the pill's width reserved is its own, a digit more or less never moves it)
  assert.equal(placeFenDisse.length, 1);
  const a = view(SIZES[0]).r, b = view({ ...SIZES[0], fenPx: 140 }).r;
  assert.equal(a.xp, b.xp, 'a wider reading (100 % open) keeps the same pore');
  const src = readFileSync(new URL('../src/ui/fen-place.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\bpor\b/, 'it never reads S.por');
});

test('the Disse name takes the stretch nearest its old place, 40 µm from the stellate cell on its right, within the free stretch', () => {
  assert.equal(disseSpot(-30, 30, [], 7, 1).c, 23, 'flush with the stretch\'s right end when 41 µm out does not fit');
  assert.equal(disseSpot(-80, 80, [], 7, 1).c, 41, 'on a wide screen, where it always was');
  assert.equal(disseSpot(-30, 30, [[0, 30]], 7, 1).right, false, 'the left when the right is taken');
  assert.equal(disseSpot(-30, 30, [[-30, 30]], 7, 1), null, 'none when nothing is wide enough');
});

test('the view lays the three out from its resting frame and scale, so a glide never moves a name in the figure', () => {
  assert.match(VIEW, /import \{ placeFenDisse \} from '\.\/fen-place\.js\?v=[0-9a-f]+';/);
  const i = VIEW.indexOf('const spot = placeFenDisse({');
  assert.ok(i > 0);
  const call = VIEW.slice(i, VIEW.indexOf('});', i));
  assert.match(call, /lo: \(VW\.f\.l - VW\.tC\[0\] \+ 6\) \/ tk, hi: \(VW\.f\.r - VW\.tC\[0\] - 6\) \/ tk/, 'the resting frame (tC), not the eased one');
  assert.match(call, /fp: 16 \/ tk/, 'in the resting scale');
  assert.match(VIEW, /const tk = VW\.tk, hsHalf = hs\.w \/ 2 \/ tk;/);
  // The leader still ends at the pore the callout picked (a fenestra, not a cell body), and the old step is kept for a view too narrow.
  assert.match(VIEW, /leader\('fen', rf, xp, -\(halfW\(xp\) \+ UM\.endo \* 0\.5\)\);/);
  assert.match(VIEW, /xp = fenAt\(pick\(0\.6\)\); rf = fen\(xp, 0\);/);
});
