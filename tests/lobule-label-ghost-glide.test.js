// Three Lobule label faults from a play-tester's build ca029399 (16 Nov 2026), guarded at their source:
//  1. a "ghost" name: on a slide that lights other terms (Circulation 5, "Blood crosses the lobule"), the unlit Lymphatic and Bile ductule names are
//     drawn at DIM_A over the hexagon's vessels and cells and read as a faint grey ghost that never goes. An unlit name now keeps clear of the outline
//     (solve) or is left out, and the layout is made again when a slide changes which names are unlit (sameBase's dimMask).
//  2. a layer switched (Lymph off) moved the Portal venule and Arteriole names to new spots in one frame: with the camera still, a name a layout
//     moves now glides (noteAt), its leader following (capSync -> syncLeaders). After a pan or zoom the names still take their spots at once.
//  3. lit names (Portal venule, Sinusoids) were thin on the cells: the Lobule's names wear the Anatomy's heavier outline, 4 px (app-07-floating.css).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const LABELS = read('../src/ui/lobule-zoom-labels.js'), RECORDS = read('../src/ui/lobule-zoom-records.js'), ZOOM = read('../src/ui/lobule-zoom.js'), CSS = read('../styles/app-07-floating.css');

test('an unlit optional name may not overlap the hexagon on a slide that lights terms', () => {
  assert.match(RECORDS, /const unlit = !CORE\.includes\(k\) && dimmed\(LIT_OF\[k\]\);/);
  assert.match(RECORDS, /\(unlit && LC\.hex\.share\(cb\) > 0 \? 1e6 : 0\)/, 'a spot on the hexagon costs a clash, so the name goes elsewhere or is left out (dropCost)');
  assert.match(RECORDS, /LC\.hex = hex;/);
});

test("a slide that changes which names are unlit lays the labels out again", () => {
  assert.match(LABELS, /const dimMask = \(\) =>/);
  assert.match(LABELS, /f\.dm !== dimMask\(\)/, 'sameBase');
  assert.match(LABELS, /f\.dm = dimMask\(\);/, 'fillBase');
  assert.match(LABELS, /\bdm: 0,/, 'mkFollow keeps the field');
});

test('a name a layout moves while the camera holds still glides, and its leader follows', () => {
  assert.match(LABELS, /function noteAt\(L, glide\)/);
  assert.match(LABELS, /const eased = !!glide;/);
  assert.match(RECORDS, /noteAt\(L, still && !L\.peek\)/, 'only a name already showing glides');
  const still = RECORDS.match(/const still = (.*);\n/)[1];
  for (const part of ['wasFollow.k === V.k', 'wasFollow.x === V.x', 'wasFollow.y === V.y', 'wasFollow.W === g.W', '!live.layerScaled', '!handOn()', '!reduce.matches']) assert.ok(still.includes(part), part);
  assert.match(LABELS, /labGliding\(labs\[LAB_KEYS\[i\]\], now\)\) \{ live\.syncLeaders\?\.\(\); break; \}/);
  assert.match(ZOOM, /live\.syncLeaders = syncLeaders;/);
});

test('every lobule, sinusoid and zone name takes the same 4 px outline, nowhere the thinner 3 px', () => {
  const L3 = read('../styles/app-03-layouts.css');
  assert.equal((L3.match(/--hw: max\(1\.25px, calc\(2px \* var\(--label-k, 1\)\)\)/g) || []).length, 2, '.sv-region and .lz-zone');
  assert.ok(!/--hw: max\(1px, calc\(1\.5px/.test(L3 + CSS), 'no name keeps the thin outline');
});

test("the Lobule's names wear the Anatomy's heavier outline (4 px, the bare label's pen)", () => {
  assert.match(CSS, /\.lz-lab :is\(\.n, \.v, \.x\), \.lz-call \{ --hw: max\(1\.25px, calc\(2px \* var\(--label-k, 1\)\)\);/);
});
