// The lobule dive's field: few, large lobules (a field of hundreds slowed the zoom), and the ones away from the
// landing lobule fade into the page as the zoom goes on, ending on the lobule view's own surround.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');

test('the field starts with lobules large enough to keep their count low', () => {
  const rh = Number(stage.match(/const RH = (\d+)/)[1]);
  assert.ok(rh >= 20, `field lobules start at ${rh}px; at 11px the screen held hundreds`);
});

test('the dive fades the lobules away from the landing one, in and out, rising to full focus', () => {
  assert.match(stage, /focus: smoothT\(0\.\d+, 0\.8, t\)/, 'focus follows the dive clock, so the rise out reverses it');
  assert.match(lz, /const f = clamp\(d\.focus \?\? d\.quiet, 0, 1\)/);
  // At focus 1 the clear circle is the lobule view's resting surround (rd × 1.1), so the landing has no jump.
  assert.match(lz, /Math\.log\(Math\.min\(diag \* 0\.45, rd \* 1\.1\)\), f\)/);
  assert.match(lz, /fieldFade\(c, shadeOf\(rgb01\(bg\), dark\), sx \* dpr, sy \* dpr, R \* V\.k \* dpr, 1,/, 'the resting view keeps the faded surround');
});

test('the dive does no full-size redraws or hidden compositing mid-zoom', () => {
  // The lobule's flow marks start faded each time it fades in, so the scaled lobule is drawn once, not every frame.
  assert.match(lz, /if \(fade > 0 && was === 0\) \{ flowA = 0; flowT = 0;/);
  // The field reads the styles once per dive, not live each frame after the stage's writes.
  assert.match(lz, /cs: styleSnap\(cs\)/);
  // The magnified anatomy is hidden while the whole field covers it (z ≥ LC + 0.3, where the field is opaque), and shown again on every end.
  assert.match(stage, /if \(!landed\) setDiveHidden\(t > 0 && t < 1 && z >= LC \+ 0\.3,/);
  assert.match(stage, /if \(k <= 1\.0001\) \{\n\s+if \(!keep\) setDiveHidden\(false, false\);/);
  assert.match(stage, /a: smoothT\(LC \* 0\.45, LC \+ 0\.3, z\)/, 'the field is whole exactly where the anatomy is hidden');
});

test('in dark mode the field lobules\' capillarized sinusoids are dark (they recede), pale in light and Soft', () => {
  const tokens = read('../styles/tokens.css');
  assert.match(lz, /c\.strokeStyle = fs\.sin > 0\.2 \? tk\('--lz-field-sin-pale'\) : gap;/);
  assert.match(tokens, /--collagen: rgb\(237, 222, 186\); --lz-field-sin-pale: var\(--collagen\);/);
  assert.equal((tokens.match(/--collagen: rgb\(199, 186, 153\); --lz-field-sin-pale: #2E1A26;/g) || []).length, 2, 'both dark blocks (system and chosen)');
});

test('every zoom into the lobule draws it first, for where it lands, then zooms; the anatomy returns after landing', () => {
  assert.match(lz, /function stage\(\) \{\n\s+while \(warm\(\)\);[^\n]*\n\s+if \(fade > 0 \|\| !F\) return;\n\s+flowA = 0; flowT = 0; resetView\(\); staging = true;/);
  assert.match(lz, /idleDrawn = ''; draw\(0\); diveDrawn = true; staged = api\.viewKey\(\); relLater = true;/);
  assert.match(lz, /if \(fade <= 0 && !staging\) return;/, 'update fills in the model while staging');
  // Both ways in (a tap or slide, and a pinch) draw it before their zoom's clock starts.
  assert.match(stage, /lz\.prewarm\(diveLand\.r\);\n\s+lz\.stage\(\); {3}\/\/ the lobule is drawn now/);
  assert.match(stage, /lz\.prewarm\(diveLand\.r\);\n\s+lz\.stage\(\);\n\s+cancelFrame\(vtAnim\);/);
  assert.ok(stage.indexOf('lz.stage();   //') < stage.indexOf('const t0 = !on && riseAt'), 'drawn before the zoom is timed');
  // The frame it starts to fade in draws nothing new when the framing still matches.
  assert.match(lz, /if \(staged && staged === api\.viewKey\(\) && model\) \{ if \(!raf\) raf = nextFrame\(loop\); \} else \{ diveDrawn = false; if \(F\) update\(F\); \}/);
  // Its memory is given back when the zoom returns to the anatomy (never mid-zoom); the idle preparation keeps nothing.
  assert.match(lz, /if \(was > 0\) \{ if \(diveScaled\) relLater = true; else release\(\); \}/);
  assert.match(lz, /if \(!diveScaled && fade <= 0\) \{ staged = ''; if \(relLater\) \{ relLater = false; release\(\); \} \}/);
  assert.match(lz, /draw\(0\); release\(\); prepKey = key;/);
  // Landed, the anatomy stays hidden under the lobule until it has settled; every other end shows it at once.
  assert.match(stage, /const landed = t >= 1 && !diveOut;\n\s+setDiveScale\(t >= 1 \? 1 : Math\.exp\(Math\.min\(z, LC \+ 0\.4\)\), landed\);/);
  assert.match(stage, /if \(diveT >= 1 && lobuleOn\) setDiveHidden\(false, false\); \}, 500\)/);
});

test('nothing is built during the zoom: the field\'s tiles and their quieted copies are ready before it starts', () => {
  assert.equal((lz.match(/const t = fieldTile\(cs, dark, r\); liverTile\(t, cs, dark, bg\); quietTile\(t, shadeOf\(bg, dark\)\);/g) || []).length, 2, 'idle preparation and prewarm both build the quieted copy');
  assert.match(lz, /function stage\(\) \{\n\s+while \(warm\(\)\);/, 'whatever prewarm queued is done before the zoom starts');
});
