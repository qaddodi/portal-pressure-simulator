import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLobule } from '../scripts/lobule-joins.mjs';

// The real lobule's discs seen end-on carry their mouths (tube texel 3, xyz) and their ink (texel 4, xyz), which the Tube's outline breaks and draws by
// (tube-cel-glsl.js celDisc; Mohammad, 10 Nov 2026). Node only: the lobule layer booted in jsdom with the GL stub, as tube-lobule.test.js does.

const F_RING = 512, FLOATS = 52, BINS = 72;
const cap = await captureLobule({});
const rows = [];
for (let r = 0; r < 320; r++) {
  const o = r * FLOATS, fl = T(o + 10);
  if (fl & F_RING) rows.push({ r, fl, z: T(o + 9), w: [T(o + 12), T(o + 13), T(o + 14)], ink: [T(o + 16), T(o + 17), T(o + 18)], w4: T(o + 19) });
}
function T(i) { return cap.up.tube[i]; }
const open = (w) => Array.from({ length: BINS }, (_, b) => (w[Math.floor(b / 24)] >> (b % 24)) & 1);
const ranges = (bits) => {   // runs of open bins, the seam joined
  let n = 0;
  for (let b = 0; b < BINS; b++) if (bits[b] && !bits[(b + BINS - 1) % BINS]) n++;
  return bits.every(Boolean) ? 1 : n;
};

// (The captured tubes carry no kind; the flags and the z the lobule gives each kind say it: the central vein F_RING | F_SHADOW, the portal venule that with F_EDGE,
// the arteriole and the ductule F_EDGE alone, told apart by z 0.7 and 0.55.)
const kindOf = (k) => (k.fl === 516 ? 'cv' : k.fl === 580 ? 'pv' : Math.abs(k.z - 0.7) < 1e-6 ? 'ha' : Math.abs(k.z - 0.55) < 1e-6 ? 'bd' : '?');

test('six portal venules, arterioles and ductules and one central vein carry F_RING, and no other row does; the dip texel stays 0', () => {
  const count = {};
  for (const k of rows) count[kindOf(k)] = (count[kindOf(k)] || 0) + 1;
  assert.deepEqual(count, { pv: 6, ha: 6, bd: 6, cv: 1 });
  for (const k of rows) assert.equal(k.w4, 0, 'texel 4 w (the dip mode) is 0');
});

test('the central vein has a mouth for each vessel that joins it and closed arcs between; a ductule, joined by nothing, a closed rim', () => {
  const cv = rows.find((k) => kindOf(k) === 'cv'), nJoin = cap.joins.filter((j) => j.members.includes(cv.r)).length;
  const bits = open(cv.w), nOpen = bits.filter(Boolean).length;
  assert.ok(nOpen > 0 && nOpen < BINS, `some of the rim open, some closed (${nOpen} of ${BINS})`);
  assert.ok(nOpen / BINS < 0.6, `the closed arcs are the larger part of the rim (open ${nOpen} of ${BINS})`);
  assert.ok(ranges(bits) >= Math.ceil(nJoin * 0.6) && ranges(bits) <= nJoin, `about a mouth a join: ${ranges(bits)} runs for ${nJoin} joins`);
  for (const k of rows.filter((x) => kindOf(x) === 'bd')) assert.deepEqual(k.w, [0, 0, 0], 'a bile ductule: no joins, no mouth');
  for (const k of rows.filter((x) => kindOf(x) === 'pv')) assert.equal(ranges(open(k.w)), 2, 'a portal venule: its two inlets');
});

test('every disc carries an ink: a tone, none of it left at 0', () => {
  for (const k of rows) assert.ok(k.ink.some((v) => v > 0.05) && k.ink.every((v) => v >= 0 && v <= 1), `row ${k.r} ink ${k.ink}`);
});
