import { stageSource } from './stage-src.js';
// The lobule dive's field: few, large lobules (a field of hundreds slowed the zoom), and the ones away from the
// landing lobule fade into the page as the zoom goes on, ending on the lobule view's own surround.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKENS } from '../src/ui/theme-tokens.js';
import { lobuleSource } from './split-src.js';

const stage = stageSource();
const lz = lobuleSource();

// Their count no longer costs anything: the field is one pattern (one shader pass on the GPU, field-gl.js), whatever the size of
// its lobules. They start about true to scale (Mohammad, 24 Oct: the lobule looked too large; zoom further to reach it).
test('the field starts with lobules about true to scale, deep in the liver, so the dive zooms over a hundredfold to the lobule', () => {
  const rh = Number(stage.match(/const RH = (\d+)/)[1]);
  const lc = Math.log(Number(stage.match(/const LC = Math\.log\((\d+)\)/)[1]));
  // The anatomy zooms far into the liver first (Mohammad, 24 Oct: the lobules came in while the liver still filled the screen).
  assert.ok(Math.exp(lc) >= 12, `the anatomy hands over at ×${Math.exp(lc).toFixed(0)}`);
  // About true to scale there: 6 px of radius at ×5, in proportion.
  assert.ok(Math.abs(rh / Math.exp(lc) - 6 / 5) < 0.15, `field lobules start at ${rh}px radius at the anatomy's ×${Math.exp(lc).toFixed(0)}`);
  // The whole zoom: the anatomy's share, then the field from RH to the landing lobule's radius (phone and Mac framings).
  for (const land of [164, 272]) assert.ok(Math.exp(lc + Math.log(Math.max(rh * 2, land) / rh)) >= 120, `only ×${Math.exp(lc + Math.log(land / rh)).toFixed(0)} for a ${land} px lobule`);
  // Longer for the deeper zoom, the way out quicker; the field's sizes blended so their detail comes in gradually.
});


test('the dive does no full-size redraws or hidden compositing mid-zoom', () => {
  // The lobule's flow marks start faded each time it fades in, so the scaled lobule is drawn once, not every frame.
  // The field reads the styles once per dive, not live each frame after the stage's writes.
  // The magnified anatomy is hidden while the whole field covers it (z ≥ FIELD_WHOLE, where the field is opaque), and shown again on every end.
  // The hand-over spans about two octaves of zoom, ending before the anatomy's magnification stops (LC + 0.4), so it never pops.
  const [fin, fwh] = stage.match(/const FIELD_IN = LC - ([\d.]+), FIELD_WHOLE = LC \+ ([\d.]+);/).slice(1).map(Number);
  assert.ok(fin + fwh >= 1.4, `the field comes in over only ${(fin + fwh).toFixed(2)} of log zoom`);
  assert.ok(fwh < 0.4, 'whole before the anatomy stops growing');
});


test('in dark mode the field lobules\' capillarized sinusoids are dark (they recede), pale in light and Soft', () => {
  assert.deepEqual([TOKENS.light.collagen, TOKENS.light['lz-field-sin-pale']], ['rgb(237, 222, 186)', 'var(--collagen)']);
  // (Both dark blocks, the system's and the chosen one, are printed from the one TOKENS.dark.)
  assert.deepEqual([TOKENS.dark.collagen, TOKENS.dark['lz-field-sin-pale']], ['rgb(199, 186, 153)', '#2E1A26']);
});

test('every zoom into the lobule draws it first, for where it lands, then zooms; the anatomy returns after landing', () => {
  // The way in (a tap or slide; manual zoom never dives) draws it before the zoom's clock starts.
  assert.ok(stage.indexOf('lz.stage();   //') < stage.indexOf('const t0 = easeNow();\n    live.lobOn = on;'), 'drawn before the zoom is timed');
  // The frame it starts to fade in draws nothing new when the framing still matches.
  // Its memory is given back when the zoom returns to the anatomy (never mid-zoom); the idle preparation keeps nothing.
  // Landed, the anatomy stays hidden under the lobule until it has settled; every other end shows it at once.
});

test('nothing is built during the zoom: the field\'s tiles and their quieted copies are ready before it starts', () => {
  assert.equal((lz.match(/fieldCopies\((?:live\.)?fieldTile\(cs, dark, r\), cs, dark, bg\);/g) || []).length, 2, 'idle preparation and prewarm both build the quieted copy');
});

test('the lobule\'s fibrous bands are a deeper tan in light and Soft, the collagen itself in dark (Mohammad, 16 Oct)', () => {
  assert.equal(TOKENS.light['lz-septum'], 'rgb(206, 178, 130)');
  assert.deepEqual([TOKENS.dark['lz-field-sin-pale'], TOKENS.dark['lz-septum']], ['#2E1A26', 'rgb(199, 186, 153)'], 'dark unchanged');
});


// Zooming in, the neighbouring lobules were cut off at the top and bottom: the fade into the page closed in to 3.2 R, inside
// the screen (Mohammad, 19 Oct). Its outer edge now never closes in past the farthest corner, so they cover the whole screen.
test('the neighbouring lobules cover the whole screen at every moment of the dive and at rest, on every screen', async () => {
  const { fadeAt, fadeOuter, EDGE_FADE, FADE_SPAN } = await import('../src/ui/lobule-look.js');
  const lerp = (a, b, u) => a + (b - a) * u;
  const screens = [[1512, 945], [1728, 1080], [1024, 1366], [1366, 1024], [820, 1180], [390, 844], [844, 390], [375, 667], [667, 375]];
  for (const [W, H] of screens) {
    const diag = Math.hypot(W, H), corners = [[0, 0], [W, 0], [0, H], [W, H]];
    // The landing lobule anywhere from the middle to well off it (a slide's camera, a card beside it), small to large.
    for (const [cx, cy] of [[W / 2, H / 2], [W * 0.3, H * 0.5], [W * 0.5, H * 0.3], [W * 0.75, H * 0.7]]) {
      const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      for (const land of [Math.min(W, H) * 0.25, Math.min(W, H) * 0.42, Math.min(W, H) * 0.6]) {
        for (let i = 0; i <= 40; i++) {
          const f = i / 40, rd = lerp(24, land, f);   // (the field's lobule grows as the focus closes in)
          const r0 = Math.exp(lerp(Math.log(diag * 0.45), Math.log(Math.min(diag * 0.45, rd * 1.1)), f));
          const r1 = fadeOuter(r0, reach);
          assert.ok(r1 >= r0 * FADE_SPAN - 1e-9, 'never closer in than the lobule view\'s own fade');
          for (const [x, y] of corners) {
            const a = fadeAt(Math.hypot(x - cx, y - cy), r0, r1);
            assert.ok(a <= EDGE_FADE + 1e-9, `${W}×${H}, focus ${f.toFixed(2)}: a corner ${(a * 100).toFixed(0)}% faded into the page`);
          }
        }
      }
    }
  }
  // Both the dive's field and the resting view take their outer edge from it, measured to the farthest corner.
  // (Both drawn on the GPU since 1 Nov, by the shader's fade, the one fadeAt measures: lobule-field-gpu.test.js.)
});

test('the GPU field comes in soft and sharpens, and keeps far lobules a little soft, sharp again at the landing', async () => {
  const { fieldDof } = await import('../src/ui/lobule-look.js');
  const { fieldFS } = await import('../src/ui/field-gl.js');
  assert.equal((fieldFS().match(/texture\(u(A|B|QA|QB), uv, bias\)/g) || []).length, 4, 'every tile read with the same softness');
  // At the landing (blur 0, dof 0) nothing is softened: the lobule view takes over without a jump.
  assert.deepEqual(fieldDof({ blur: 0, dof: 0 }, 100, 2000).filter((v, i) => i === 0 || i === 3), [0, 0]);
  const [pull, r0, r1, far] = fieldDof({ blur: 1, dof: 1 }, 20, 2000);
  assert.ok(pull > 2 && far > 1 && far < 2, 'soft, but never smeared');
  assert.ok(r0 >= 2 * 20 && r1 > r0, 'the landing lobule and its neighbours stay sharp');
});
