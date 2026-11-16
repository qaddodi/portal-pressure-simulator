// A flow head shows on the vessel it sits on, in every look (16 Nov 2026, style play-test: "chevrons low contrast on the lavender vessels").
// The heads' ink flips from near-black to cream by the lumen's lightness (chevron-glsl.js headInksGLSL). It used to ease over a gamma luma band
// .38 to .46, about 4 mmHg of every look's pressure ramp, and across it the ink was a grey as light as the vessel (1.04:1 at 15 mmHg in Light
// and Soft, 1.11:1 at 18 mmHg in Dark, Navy and Black). Here: the flip is short, centred where the two inks answer equally, and every pressure
// outside it gives a head at least 3:1, on every pressure ramp the styles hold (Light, Soft and the dark looks, which Navy and Black share).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEV_FLIP, chevDarkShare, headInksGLSL } from '../src/ui/chevron-glsl.js';

// (styles/tokens.css --ramp-pressure per look: Light, Soft, and the dark looks, which Navy and Black share. scripts/rules-lint.mjs fails when
// tokens.css no longer holds each of these, so this list cannot drift from the styles.)
const ramps = [
  '#B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30',
  '#8DB8E2 0, #6A9FDE 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30',
  '#D7E7F4 0, #9DC9F7 5, #7BA1FC 10, #A074F4 12, #BD2C92 20, #B31553 30',
];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rel = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK = [0.08, 0.08, 0.1], CREAM = [1, 0.93, 0.86];   // (tokens.css --blood-chevron, --blood-chevron-light)
const stops = (r) => r.split(',').map((s) => { const [h, p] = s.trim().split(/\s+/); return [+p, hex(h)]; });
function at(st, p) {
  for (let i = 0; i < st.length - 1; i++) if (p <= st[i + 1][0]) { const u = (p - st[i][0]) / (st[i + 1][0] - st[i][0]); return st[i][1].map((v, j) => v + (st[i + 1][1][j] - v) * u); }
  return st[st.length - 1][1];
}

test('the pressure ramps are found (Light, Soft, the dark looks)', () => {
  assert.ok(ramps.length >= 3, `found ${ramps.length}`);
});

test('every pressure on every look gives a head at least 3:1 on its lumen, except a short flip band', () => {
  for (const r of ramps) {
    const st = stops(r);
    let inBand = 0, n = 0;
    for (let p = 0; p <= 30; p += 0.05, n++) {
      const c = at(st, p), d = chevDarkShare(c[0], c[1], c[2]);
      if (d > 0.02 && d < 0.98) { inBand++; continue; }
      const ink = c.map((v, i) => 0.8 * INK[i] + 0.06 * v);   // (the shader's mix(chevInk, vc * 0.3, 0.2))
      const core = d >= 0.98 ? CREAM : ink;
      assert.ok(ratio(rel(c), rel(core)) >= 3, `${r.slice(0, 24)}… at ${p.toFixed(2)} mmHg: ${ratio(rel(c), rel(core)).toFixed(2)}:1`);
    }
    assert.ok(inBand * 0.05 <= 2.0, `the flip spans ${(inBand * 0.05).toFixed(2)} mmHg on ${r.slice(0, 24)}…`);
  }
});

test('the heads\' shader flips by the same relative luminance and band the test judges', () => {
  const g = headInksGLSL('void chevInks(\n}');
  assert.ok(g.includes(`smoothstep(${CHEV_FLIP[0]}, ${CHEV_FLIP[1]}, dot(pow(max(vc, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)))`), 'the shader band');
  assert.ok(CHEV_FLIP[0] < 0.19 && 0.19 < CHEV_FLIP[1] && CHEV_FLIP[1] - CHEV_FLIP[0] <= 0.04, 'a short band around the equal-contrast lightness');
});
