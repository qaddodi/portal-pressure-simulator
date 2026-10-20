// Diving into a lobule framed zoomed in (a slide aimed at a station), the lobule showed as a cropped box until it
// landed: its layers were the screen's size, scaled down for the dive (Mohammad, 20 Oct, lobule deck 5 → 6).
// The layers are now drawn over the lobule's whole box for that dive, and go back to the screen's size once landed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('an aimed dive draws the whole lobule, not the landing screen\'s rectangle', () => {
  const box = lz.match(/function padBox\(W, H\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(box, 'the padded box is measured');
  assert.match(box, /return padRect\(x, y, geo\.R \* V\.k \* 1\.35, W, H\);/, 'it reaches past the lobule\'s rim');
  assert.match(box, /if \(!geo \|\| \(atFit && !gliding && !diveScaled\)\) return null;/, 'the fit view at rest (no aim) keeps the screen-sized layers');
  // Staged ahead of the dive, so nothing is drawn mid-zoom.
  assert.match(lz, /setPad\(padBox\([^\n]*\)\); \}\n\s+idleDrawn = ''; draw\(0\); diveDrawn = true;/);
  // Every layer the dive scales is padded, and scaled about the same landing point.
  assert.match(lz, /const PAD_LAYERS = \[tissue, diveCv, glCv, fx\];/);
  assert.match(lz, /e\.style\.transformOrigin = `\$\{\(x \+ \(po\?\.l \|\| 0\)\)\.toFixed\(1\)\}px \$\{\(y \+ \(po\?\.t \|\| 0\)\)\.toFixed\(1\)\}px`;/);
});

test('landed, the layers return to the screen\'s size and pixel ratio on the first frame, and on release', () => {
  assert.match(lz, /if \(pad && fade > 0\.98 && !diveScaled\) setPad\(null\);/);
  assert.match(lz, /const dpr = pad \? padDpr\(dpr0, W, H\) : dpr0;/);
  assert.match(lz, /function release\(\) \{\n\s+setPad\(null\);/);
});

test('the rise out of a zoomed-in lobule is drawn whole too, and the box follows the view while it shrinks', () => {
  assert.match(lz, /if \(diveScaled && !wasScaled && !pad && fade > 0\.98\) \{ const \[W, H\] = hostSize\(\), p = padBox\(W, H\); if \(p\) \{ setPad\(p\); draw\(0\); \} \}/);
  // (Not while the dive skips its redraws: a new box then would stretch the picture drawn for the old one.)
  assert.match(lz, /const viewChanged = \(\) => \{ if \(\(pad \|\| diveScaled\) && !\(diveScaled && diveDrawn && flowA <= 0\)\) \{ const \[W, H\] = hostSize\(\); setPad\(padBox\(W, H\)\); \}/);
});

test('an unchanged box keeps what is drawn (no rebuild of the dive copy mid-dive)', () => {
  assert.match(lz, /if \(p === pad \|\| \(p && pad && p\.l === pad\.l && p\.t === pad\.t && p\.w === pad\.w && p\.h === pad\.h\)\) return;/);
});

test('the padded box covers the lobule wherever it reaches past the screen, and only there', async () => {
  const { padRect } = await import('../src/ui/lobule-look.js');
  assert.equal(padRect(200, 400, 150, 402, 817), null, 'on screen: no padding');
  for (const [W, H] of [[402, 817], [390, 844], [1376, 1032], [1032, 1376], [1512, 945]]) {
    for (const [x, y, r] of [[W / 2, H / 2, W], [W * 0.3, H * 0.6, H * 0.8], [W, 0, W / 3], [W / 2, H / 2, Math.max(W, H)]]) {
      const p = padRect(x, y, r, W, H);
      assert.ok(p, `${W}×${H}: the lobule reaches past the screen`);
      // The box (−l, −t) to (w − l, h − t) holds the lobule's whole square and the whole screen.
      assert.ok(-p.l <= Math.min(0, x - r) && -p.t <= Math.min(0, y - r), 'top left');
      assert.ok(p.w - p.l >= Math.max(W, x + r) && p.h - p.t >= Math.max(H, y + r), 'bottom right');
      assert.ok(p.w - p.l - Math.max(W, x + r) < 1 && p.h - p.t - Math.max(H, y + r) < 1 && Math.min(0, x - r) + p.l < 1, 'no more than that');
    }
  }
});

test('the padded layers keep the screen\'s own pixel ratio on every phone and iPad, under the canvas limit', async () => {
  const { padDpr, PAD_PX } = await import('../src/ui/lobule-look.js');
  assert.ok(PAD_PX < 16777216, 'under the iOS limit for one canvas');
  // The widest aimed dives measured in WebKit (20 Oct): 13" iPad landscape, deck 6/10 at 1.96× and 4/10 at 2.53× the screen;
  // iPhone 6/10 at 2.14×. With room to spare: 2.6× for the iPad, 4× for the phones.
  for (const [W0, H0, grow] of [[1376, 1032, 2.6], [1032, 1376, 2.6], [1180, 820, 3], [402, 874, 4], [390, 844, 4], [440, 956, 4]]) {
    const W = Math.round(W0 * Math.sqrt(grow)), H = Math.round(H0 * Math.sqrt(grow));
    assert.equal(padDpr(2, W, H), 2, `${W0}×${H0}, a box ${grow}× the screen: full detail`);
  }
  for (const [W, H] of [[3000, 2000], [4000, 3000], [5000, 4000]]) {
    for (const dpr of [1, 2]) {
      const d = padDpr(dpr, W, H);
      assert.ok(W * H * d * d <= PAD_PX * 1.0001 && d <= dpr, `${W}×${H} at ${dpr}x stays drawable`);
      if (W * H * dpr * dpr <= PAD_PX) assert.equal(d, dpr);
    }
  }
});

test('diving in, the tissue and its rim layer are given back once the copy is made, and the tissue drawn again on landing', () => {
  assert.match(lz, /if \(rim && pad && diveCopyKey && diveDrawn && flowA <= 0 && tissue\.width\) \{ free\(tissue\); free\(rimCv\); tissueKey = ''; idleDrawn = ''; \}/);
  assert.match(lz, /if \(!diveScaled && fade > 0 && !tissue\.width && model\) draw\(0\);/);
});
