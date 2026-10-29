import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPENDIX_D, APPENDIX_TIP, APPENDIX_HALF_W, CAVITY_LOW, ORGANS, pathLowest } from '../src/ui/anatomy.js';
import { fluidLevel, fluidBase, POOL_MIN, FLUID_TOP } from '../src/ui/fluid-step.js';

// The first pool lies wholly under the appendix (Mohammad, 29 Oct: "The ascites is still above the appendix!!"). The cavity's
// floor used to bottom out at y 997.5, above the appendix's drawn tip (about 999.8), so no pool could sit under it.

// The surface's highest point across the cavity at volume v: the meniscus, the ripple at its crest and half the surface line.
const LINE_HALF = 2;   // .ascites-line stroke-width 4
const topAt = (v) => {
  const { h, amp } = fluidLevel(v);
  let top = Infinity;
  for (let x = 296; x <= 1128; x += 1) top = Math.min(top, fluidBase(x, h) - amp - LINE_HALF);
  return top;
};

test('the appendix tip is read from the path the stage draws, with its widest stroke', () => {
  assert.equal(ORGANS.find((o) => o.id === 'appendix').d, APPENDIX_D);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.org-appendix\.band-ao \{ stroke-width: 11; \}/);
  assert.equal(APPENDIX_HALF_W, 11 / 2);
  assert.ok(APPENDIX_TIP > pathLowest(APPENDIX_D) && APPENDIX_TIP > 990, `${APPENDIX_TIP}`);
});

test('at the smallest visible volume, and through 1 L, the whole fluid surface is below the appendix tip', () => {
  for (let v = POOL_MIN; v <= 1000; v += 10) assert.ok(topAt(v) > APPENDIX_TIP, `${v} mL: top ${topAt(v).toFixed(1)}, tip ${APPENDIX_TIP.toFixed(1)}`);
});

test('the first pool still shows: the cavity reaches well under its surface', () => {
  const { h } = fluidLevel(POOL_MIN);
  assert.ok(CAVITY_LOW - fluidBase(712, h) > 24, `depth ${CAVITY_LOW - fluidBase(712, h)}`);
});

test('the surface rises steadily with volume and the top of the scale is unchanged', () => {
  let prev = fluidBase(712, fluidLevel(0).h);
  for (let v = 5; v <= 8500; v += 5) {
    const y = fluidBase(712, fluidLevel(v).h);
    assert.ok(y <= prev && prev - y < 2, `${v} mL: ${y} after ${prev}`);
    prev = y;
  }
  assert.equal(fluidLevel(8500).h, FLUID_TOP);
  assert.equal(fluidBase(712, FLUID_TOP), 955 - FLUID_TOP * 0.8);
});
