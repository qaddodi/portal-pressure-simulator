// The lobule dive's field: few, large lobules (a field of hundreds slowed the zoom), and the ones away from the
// landing lobule fade into the page as the zoom goes on, ending on the lobule view's own surround.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');

// Their count no longer costs anything: the field is one pattern (one shader pass on the GPU, field-gl.js), whatever the size of
// its lobules. They start about true to scale (Mohammad, 24 Oct: the lobule looked too large; zoom further to reach it).
test('the field starts with lobules about true to scale, so the dive zooms over a hundredfold to the lobule', () => {
  const rh = Number(stage.match(/const RH = (\d+)/)[1]);
  assert.ok(rh >= 4 && rh <= 8, `field lobules start at ${rh}px radius at the anatomy's ×5`);
  // The whole zoom: the anatomy's ×5, then the field from RH to the landing lobule's radius (phone and Mac framings).
  const lc = Math.log(5);
  assert.ok(lc.toFixed(4) === Math.log(Number(stage.match(/const LC = Math\.log\((\d+)\)/)[1])).toFixed(4));
  for (const land of [164, 272]) assert.ok(Math.exp(lc + Math.log(Math.max(rh * 2, land) / rh)) >= 120, `only ×${Math.exp(lc + Math.log(land / rh)).toFixed(0)} for a ${land} px lobule`);
  assert.match(stage, /const lt = LC \+ Math\.log\(Math\.max\(RH \* 2, diveLand\.r\) \/ RH\);/);
  // Longer for the deeper zoom, the way out quicker; the field's sizes blended so their detail comes in gradually.
  assert.match(stage, /const DIVE_MS = 2200, RISE_MS = 1300;/);
  assert.match(lz, /fieldBlend\(rd \* 0\.55\)/);
});

test('the dive fades the lobules away from the landing one, in and out, rising to full focus', () => {
  assert.match(stage, /focus: smoothT\(0\.\d+, 0\.8, t\)/, 'focus follows the dive clock, so the rise out reverses it');
  assert.match(lz, /const f = clamp\(d\.focus \?\? d\.quiet, 0, 1\)/);
  // At focus 1 the clear circle is the lobule view's resting surround (rd × 1.1), so the landing has no jump.
  assert.match(lz, /Math\.log\(Math\.min\(Math\.hypot\(W, H\) \* dpr \* 0\.45, rd \* 1\.1\)\), f\)\)/);
  assert.match(lz, /fieldFade\(c, shadeOf\(rgb01\(bg\), dark\), ox, oy, rdv, 1,/, 'the resting view keeps the faded surround');
  assert.match(lz, /ox = ocx \* dpr, oy = ocy \* dpr, rdv = R \* V\.k \* dpr/, 'centred on the lobule, at its radius on screen');
});

test('the dive does no full-size redraws or hidden compositing mid-zoom', () => {
  // The lobule's flow marks start faded each time it fades in, so the scaled lobule is drawn once, not every frame.
  assert.match(lz, /if \(fade > 0 && was === 0\) \{ flowA = 0; flowT = 0;/);
  // The field reads the styles once per dive, not live each frame after the stage's writes.
  assert.match(lz, /cs: styleSnap\(cs\)/);
  // The magnified anatomy is hidden while the whole field covers it (z ≥ LC + 0.3, where the field is opaque), and shown again on every end.
  assert.match(stage, /if \(!landed\) setDiveHidden\(t > 0 && t < 1 && z >= LC \+ 0\.3,/);
  assert.match(stage, /if \(k <= 1\.0001\) \{\n\s+if \(!keep\) \{ setDiveHidden\(false, false\); setDiveFade\(null\); \}/);
  assert.match(stage, /a: smoothT\(LC \* 0\.45, LC \+ 0\.3, z\)/, 'the field is whole exactly where the anatomy is hidden');
});

test('the anatomy fades with the field rather than popping, at both ends of the zoom', () => {
  // One crossfade on the same curve as the field's opacity; hidden (visibility) only once it is fully clear.
  assert.match(stage, /setDiveFade\(t <= 0 \? null : landed \? 0 : 1 - smoothT\(LC \* 0\.45, LC \+ 0\.3, z\)\)/);
  assert.match(stage, /el\.style\.transition = q === null \? '' : 'none'; el\.style\.opacity = q === null \? '' : String\(q\)/, 'driven per frame with the CSS transition held off');
  // The field's emerging mask spreads past every corner by the time it is dropped (a = 1), so nothing vanishes in the far corners.
  assert.match(lz, /rho = diag \* \(0\.2 \+ 1\.1 \* d\.a \+ 2 \* smooth\(0\.7, 1, d\.a\)\)/);
});

test('in dark mode the field lobules\' capillarized sinusoids are dark (they recede), pale in light and Soft', () => {
  const tokens = read('../styles/tokens.css');
  assert.match(lz, /c\.strokeStyle = fs\.sin > 0\.2 \? tk\('--lz-field-sin-pale'\) : gap;/);
  assert.match(tokens, /--collagen: rgb\(237, 222, 186\); --lz-field-sin-pale: var\(--collagen\);/);
  assert.equal((tokens.match(/--collagen: rgb\(199, 186, 153\); --lz-field-sin-pale: #2E1A26;/g) || []).length, 2, 'both dark blocks (system and chosen)');
});

test('every zoom into the lobule draws it first, for where it lands, then zooms; the anatomy returns after landing', () => {
  assert.match(lz, /function stage\(\) \{\n\s+while \(warm\(\)\);[^\n]*\n\s+if \(fade > 0 \|\| !F\) return;\n\s+flowA = 0; flowT = 0; resetView\(\); staging = true; snapState\(\);/);
  assert.match(lz, /idleDrawn = ''; draw\(0\); diveDrawn = true; staged = api\.viewKey\(\); relLater = true;/);
  assert.match(lz, /if \(fade <= 0 && !staging\) return;/, 'update fills in the model while staging');
  // The way in (a tap or slide; manual zoom never dives) draws it before the zoom's clock starts.
  assert.match(stage, /lz\.prewarm\(diveLand\.r\);\n\s+lz\.stage\(\); {3}\/\/ the lobule is drawn now/);
  assert.ok(stage.indexOf('lz.stage();   //') < stage.indexOf('const t0 = performance.now();\n    const step = (now) => {\n      const e0 = ms ?'), 'drawn before the zoom is timed');
  // The frame it starts to fade in draws nothing new when the framing still matches.
  assert.match(lz, /if \(staged && staged === api\.viewKey\(\) && model\) \{ if \(!raf\) raf = nextFrame\(loop\); \} else \{ diveDrawn = false; snapState\(\); if \(F\) update\(F\); \}/);
  // Its memory is given back when the zoom returns to the anatomy (never mid-zoom); the idle preparation keeps nothing.
  assert.match(lz, /if \(was > 0\) \{ if \(diveScaled\) relLater = true; else release\(\); \}/);
  assert.match(lz, /if \(!diveScaled && fade <= 0\) \{ staged = ''; if \(relLater\) \{ relLater = false; release\(\); \} \}/);
  assert.match(lz, /draw\(0\); release\(\); prepKey = key;/);
  // Landed, the anatomy stays hidden under the lobule until it has settled; every other end shows it at once.
  assert.match(stage, /const landed = t >= 1 && !diveOut;\n\s+setDiveScale\(t >= 1 \? 1 : Math\.exp\(Math\.min\(z, LC \+ 0\.4\)\), landed\);/);
  assert.match(stage, /if \(diveT >= 1 && lobuleOn\) \{ setDiveHidden\(false, false\); setDiveFade\(null\); \} \}, 500\)/);
});

test('nothing is built during the zoom: the field\'s tiles and their quieted copies are ready before it starts', () => {
  assert.equal((lz.match(/const t = fieldTile\(cs, dark, r\); liverTile\(t, cs, dark, bg\); quietTile\(t, shadeOf\(bg, dark\)\);/g) || []).length, 2, 'idle preparation and prewarm both build the quieted copy');
  assert.match(lz, /function stage\(\) \{\n\s+while \(warm\(\)\);/, 'whatever prewarm queued is done before the zoom starts');
});

test('the lobule\'s fibrous bands are a deeper tan in light and Soft, the collagen itself in dark (Mohammad, 16 Oct)', () => {
  const tokens = read('../styles/tokens.css');
  assert.match(tokens, /--lz-septum: rgb\(206, 178, 130\);/);
  assert.equal((tokens.match(/--lz-field-sin-pale: #2E1A26; --lz-septum: rgb\(199, 186, 153\);/g) || []).length, 2, 'dark unchanged, both dark blocks');
  assert.match(lz, /const COL = rgb01\(v\('--lz-septum'\)\);/);
  assert.match(lz, /const COLa = cssRGB01\('--lz-septum'\), edges/);
  assert.match(lz, /const DIS = rgb01\(v\('--collagen'\)\), col = \(a\) => css\(DIS, a\);/, 'the space of Disse lining is unchanged');
});

test('the dive\'s field fills each pixel only with the passes that change it (the same picture)', () => {
  // The fade adds nothing inside its clear circle, and at full strength lays the page's colour whole past its outer edge.
  assert.match(lz, /fieldFade\(c, shadeOf\(bg, dark\), fx0, fy0, rd, fq, field\.width, field\.height, r0, r1, \[r0 - 1, far\]\);/);
  assert.match(lz, /const fadeWhole = f > 0 && fq >= 1,/);
  assert.match(lz, /if \(fadeWhole\) \{ c\.save\(\); c\.beginPath\(\); c\.arc\(fx0, fy0, r1 \+ 2, 0, TAU\); c\.clip\(\); \}/);
  // An opaque quieted tile at full strength covers the liver-toned one.
  assert.match(lz, /if \(!\(d\.quiet >= 1\)\) fieldFill\(c, liverTile\(/);
  // The emerging mask is whole inside rho × 0.35: it is applied only past that circle.
  assert.match(lz, /c\.arc\(d\.ox \* dpr, d\.oy \* dpr, Math\.max\(0, rho \* 0\.35 - 1\), 0, TAU\); c\.clip\('evenodd'\);\n\s+c\.globalCompositeOperation = 'destination-in';/);
  assert.match(lz, /mg\.addColorStop\(0, 'rgba\(0,0,0,1\)'\); mg\.addColorStop\(1, 'rgba\(0,0,0,0\)'\);/);
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
  assert.match(lz, /const r1 = fadeOuter\(r0, Math\.max\(/);
  assert.match(lz, /const fOut = fadeOuter\(fIn, reach\)/);
  assert.match(lz, /const vg = c\.createRadialGradient\(x, y, r0, x, y, r1\)/);
  assert.match(lz, /addColorStop\(0\.5, css\(bg, FADE_MID \* q\)\)/, 'the gradient is the one fadeAt measures');
  assert.doesNotMatch(lz, /3\.2 \/ 1\.1|rdv \* 3\.2/, 'no fixed outer edge left');
});
