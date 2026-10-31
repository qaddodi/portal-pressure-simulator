// The lobule dive's field: few, large lobules (a field of hundreds slowed the zoom), and the ones away from the
// landing lobule fade into the page as the zoom goes on, ending on the lobule view's own surround.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');
const lp = read('../src/ui/lobule-paint.js');   // (the tissue's painting)

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
  assert.match(stage, /const lt = LC \+ Math\.log\(Math\.max\(RH \* 2, diveLand\.r\) \/ RH\);/);
  // Longer for the deeper zoom, the way out quicker; the field's sizes blended so their detail comes in gradually.
  assert.match(stage, /const DIVE_MS = 2200, RISE_MS = 1300;/);
  assert.match(lz, /fieldBlend\(rd \* 0\.55\)/);
});

test('the dive fades the lobules away from the landing one, in and out, rising to full focus', () => {
  assert.match(stage, /focus: smoothT\(FIELD_WHOLE, lt, z\)/, 'focus follows the zoom (the clock\'s own function), so the rise out reverses it, and starts only once the field is whole');
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
  // The magnified anatomy is hidden while the whole field covers it (z ≥ FIELD_WHOLE, where the field is opaque), and shown again on every end.
  assert.match(stage, /if \(!landed\) setDiveHidden\(t > 0 && t < 1 && z >= FIELD_WHOLE,/);
  assert.match(stage, /if \(k <= 1\.0001\) \{\n\s+if \(!keep\) \{ setDiveHidden\(false, false\); setDiveFade\(null\); \}/);
  assert.match(stage, /a: smoothT\(FIELD_IN, FIELD_WHOLE, z\)/, 'the field is whole exactly where the anatomy is hidden, and comes in only over its last stretch');
  // The hand-over spans about two octaves of zoom, ending before the anatomy's magnification stops (LC + 0.4), so it never pops.
  const [fin, fwh] = stage.match(/const FIELD_IN = LC - ([\d.]+), FIELD_WHOLE = LC \+ ([\d.]+);/).slice(1).map(Number);
  assert.ok(fin + fwh >= 1.4, `the field comes in over only ${(fin + fwh).toFixed(2)} of log zoom`);
  assert.ok(fwh < 0.4, 'whole before the anatomy stops growing');
});

test('the anatomy stays whole under the field until the field covers it, so the page never shows through mid-zoom', () => {
  // Opaque beneath the field as it fades in over it, hidden (visibility) only once the field is whole: two half-clear layers let the
  // page through as a dark flash zooming in (Mohammad, 24 Oct).
  assert.match(stage, /setDiveFade\(t <= 0 \? null : landed \? 0 : 1\);/);
  assert.doesNotMatch(stage, /setDiveFade\([^\n]*1 - smoothT/);
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
  assert.match(lz, /col: rgb01\(v\('--lz-septum'\)\), dis: rgb01\(v\('--collagen'\)\)/);
  assert.match(lp, /const COL = rgb\.col;/);
  assert.match(lz, /const COLa = cssRGB01\('--lz-septum'\), edges/);
  assert.match(lp, /const DIS = rgb\.dis, col = \(a\) => css\(DIS, a\);/, 'the space of Disse lining is unchanged');
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

test('the GPU field comes in soft and sharpens, and keeps far lobules a little soft, sharp again at the landing', async () => {
  const { fieldDof } = await import('../src/ui/lobule-look.js');
  assert.match(stage, /blur: 1 - smoothT\(FIELD_IN, FIELD_WHOLE \+ 0\.3, z\), dof: smoothT\(FIELD_IN \+ 0\.3, FIELD_WHOLE \+ 0\.6, z\) \* \(1 - smoothT\(lt - 0\.9, lt, z\)\),/);
  assert.match(lz, /dof: fieldDof\(d, rd, Math\.hypot\(fw, fh\)\),/);
  const fgl = read('../src/ui/field-gl.js');
  assert.match(fgl, /float bias = uDof\.x \+ uDof\.w \* smoothstep\(uDof\.y, uDof\.z, length\(p - uO\)\);/);
  assert.equal((fgl.match(/texture\(u(A|B|QA|QB), uv, bias\)/g) || []).length, 4, 'every tile read with the same softness');
  // At the landing (blur 0, dof 0) nothing is softened: the lobule view takes over without a jump.
  assert.deepEqual(fieldDof({ blur: 0, dof: 0 }, 100, 2000).filter((v, i) => i === 0 || i === 3), [0, 0]);
  const [pull, r0, r1, far] = fieldDof({ blur: 1, dof: 1 }, 20, 2000);
  assert.ok(pull > 2 && far > 1 && far < 2, 'soft, but never smeared');
  assert.ok(r0 >= 2 * 20 && r1 > r0, 'the landing lobule and its neighbours stay sharp');
});
