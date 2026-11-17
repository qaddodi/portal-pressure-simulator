// The varix wall picture (Scope > Wall mechanics): its names keep clear of everything at the widths a card gives it (play-test F30, iPad portrait:
// the ring small in a wide card and σ, w and the ΔP arrows in one blob at the top). The same layout the page draws from (wall-geometry.js) is asked
// here with the real glyph ink: no canvas, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkBox } from '../src/ui/glyph-measure.js';
import { createWallGeometry, WALL_LEAST } from '../src/ui/wall-geometry.js';

const FONT = (w, px) => `${w} ${px}px system-ui`;
const inkFor = (fs) => ({ T: inkBox('σ', FONT(600, fs)), R: inkBox('r', FONT(600, fs)), W: inkBox('w', FONT(600, fs)), L: inkBox('lumen', FONT(500, fs)), M: inkBox('muscle', FONT(500, fs)) });
// the varix at its smallest, typical and largest, with thin and thick walls and low and high ΔP
const STATES = [
  { r: 1.5, w: 0.2, ptm: 3, ratio: 0.1 }, { r: 3, w: 0.5, ptm: 12, ratio: 0.5 }, { r: 6, w: 0.3, ptm: 22, ratio: 0.9 },
  { r: 9, w: 0.15, ptm: 30, ratio: 1.2 }, { r: 12, w: 0.9, ptm: 40, ratio: 0.6 }, { r: 2, w: 0.9, ptm: 0, ratio: 0 },
];
const WIDTHS = [340, 560, 1024];
// a card gives the picture its width and what height is left: wide and short, wide, and square
const SHAPES = [(w) => Math.round(w / 2.2), (w) => Math.round(w / 1.5), (w) => Math.min(w, 560)];

function check(w, hh, fs, states = STATES) {
  const g = createWallGeometry();
  const ink = inkFor(fs);
  let R0 = 0;
  for (const v of states) {
    const L = g.place(w, hh, fs, ink, v), tag = `${w}×${hh} fs ${fs} r ${v.r}`;
    assert.ok(L.R > 20 && L.R <= Math.min(w, hh) / 2, `${tag}: ring ${L.R}`);
    assert.ok(L.drawn & 2 && L.drawn & 4, `${tag}: σ and w are both drawn (names ${L.drawn.toString(2)})`);
    for (const [name, least] of Object.entries(WALL_LEAST)) {
      const got = L.gaps[name];
      if (!got) continue;
      for (const [k, m] of Object.entries(least)) assert.ok(got[k] >= m - 0.01, `${tag}: ${name} ${k} ${got[k]?.toFixed?.(2)} px (needs ${m})`);
    }
    if (!R0) R0 = L.R; else assert.equal(L.R, R0, `${tag}: the ring holds still through every beat`);
    // σ stands outside the wall, upper right; w inside the lumen
    assert.ok(L.sigma.x > L.cx && L.sigma.y < L.cy - L.R * 0.5, `${tag}: σ at upper right`);
  }
  return R0;
}

test('σ and w keep clear of the ring, the arrows and the canvas at 340, 560 and 1024 px wide (cv.wallGaps all positive)', () => {
  for (const w of WIDTHS) for (const shape of SHAPES) for (const fs of [12, 14]) check(w, shape(w), fs);
});

test('a wider box gives the names room, not the ring: the ring is the same at 560 and 1024 px wide for the same height', () => {
  const hh = 300;
  const a = check(560, hh, 12), b = check(1024, hh, 12);
  assert.equal(a, b);
  assert.ok(a >= hh * 0.3, `the ring uses the height it has (${a} of ${hh})`);
});

test('the ring is no smaller in a wide box than in the square box of the same height', () => {
  for (const hh of [200, 300, 400]) assert.ok(check(Math.round(hh * 2.2), hh, 12) >= check(hh, hh, 12) - 0.01, `${hh}`);
});

test('every width from 200 to 1100 px keeps σ and w clear', () => {
  for (let w = 200; w <= 1100; w += 37) check(w, Math.max(120, Math.round(w / 1.6)), 12, [STATES[1], STATES[3]]);
});
