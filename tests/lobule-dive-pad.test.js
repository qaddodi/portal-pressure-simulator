// Diving into a lobule framed zoomed in (a slide aimed at a station), the lobule showed as a cropped box until it landed: its
// layers were the screen's size, scaled down for the dive (Mohammad, 20 Oct, lobule deck 5 → 6). Such a dive now shows the wide
// copy: the whole lobule flattened into tiles at the screen's own pixel ratio; on landing the layers, drawn before the zoom, show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const MB = 1024 * 1024;

test('an aimed dive shows the whole lobule, built before the zoom, the layers then drawn for the screen', () => {
  const box = lz.match(/function padBox\(W, H\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(box);
  assert.match(box, /if \(!geo \|\| atFit\) return null;/, 'the fit view (no aim) keeps the layers alone');
  assert.match(box, /return padRect\(x, y, geo\.R \* V\.k \* 1\.35, W, H\);/, 'out past the rim and the corners\' triads');
  assert.match(lz, /const \[W, H\] = hostSize\(\), box = padBox\(W, H\), wd = box \? buildWide\(W, H, box\) : null;\n\s+idleDrawn = ''; draw\(0\); diveDrawn = true; staged = api\.viewKey\(\); relLater = true;\n\s+wide = wd;/);
  // Each tile is the layers as they stack: the tissue's rimmed copy, the vessels, the ductules.
  const b = lz.match(/function buildWide\([\s\S]*?\n {2}\}/)[0];
  assert.match(b, /paintTissue\(w, hh, dpr, dark, cs, flat\);\n\s+diveRim = [^\n]*diveCopy\(cv\); free\(rimCv\); free\(tissue\);/, 'the tissue\'s rimmed copy, its sources given back at once');
  assert.match(b, /drawGL\(w, hh, dpr, dark, cs, 0\); c\.drawImage\(glCv, 0, 0, cv\.width, cv\.height\); \}/, 'then the vessels');
  assert.match(b, /paintFx\(w, hh, dpr, dark, 0, flat\); c\.drawImage\(fx, 0, 0, cv\.width, cv\.height\); free\(fx\);/, 'then the ductules');
  // Tiles overlap their right and lower neighbours by 2 device px: edge to edge, scaled, they showed a pale hairline (WebKit, 20 Oct).
  assert.match(b, /OV = 2 \/ dpr/);
  assert.match(b, /const w = t\.w \+ \(t\.x \+ t\.w < box\.w - 1e-6 \? OV : 0\), hh = t\.h \+ \(t\.y \+ t\.h < box\.h - 1e-6 \? OV : 0\);/);
  assert.match(b, /dpr = wideDpr\(dpr0, box\.w, box\.h, apple\(\)\)/);
});

test('a tile the browser refuses drops the copy, and the dive shows the layers rather than a blank lobule', () => {
  const b = lz.match(/function buildWide\([\s\S]*?\n {2}\}/)[0];
  assert.match(b, /if \(!c \|\| !c\.getImageData\(cv\.width >> 1, cv\.height >> 1, 1, 1\)\.data\[3\] && !probe\(cv\)\) \{ ok = false; free\(cv\); break; \}/);
  assert.match(b, /if \(!ok\) \{ for \(const q of tiles\) free\(q\.cv\); return null; \}/);
  assert.match(lz, /function diveCopy\(dst = diveCv\) \{/);
  assert.match(lz, /const c = dst\.getContext\('2d'\);\n\s+if \(!c\) return;/);
});

test('landed, the copy goes and the layers show as drawn (no redraw, no step); the copy goes on release too', () => {
  assert.match(lz, /if \(wide && !rim\) dropWide\(\);/);
  assert.match(lz, /diveRim = rim && !wide \?/, 'no second copy of the tissue while the wide copy shows');
  assert.match(lz, /if \(wide\) \{ for \(const e of WIDE_HIDE\) e\.style\.visibility = 'hidden'; for \(const q of wide\.tiles\) q\.cv\.style\.visibility = ''; \}/);
  assert.match(lz, /q\.cv\.style\.transformOrigin = `\$\{\(x - q\.x\)\.toFixed\(1\)\}px \$\{\(y - q\.y\)\.toFixed\(1\)\}px`;/, 'scaled about the same stage point');
  assert.match(lz, /function release\(\) \{\n\s+dropWide\(\);/);
  // The dive draws nothing until it lands, so the copy and the layers stay the picture they were built as.
  assert.match(lz, /if \(scaled && diveDrawn && flowA <= 0\) return false;/);
});

test('the padded box covers the lobule wherever it reaches past the screen, and only there', async () => {
  const { padRect } = await import('../src/ui/lobule-look.js');
  assert.equal(padRect(200, 400, 150, 402, 817), null, 'on screen: no copy');
  for (const [W, H] of [[402, 817], [390, 844], [1376, 1032], [1032, 1376], [1512, 945], [2560, 1440]]) {
    for (const [x, y, r] of [[W / 2, H / 2, W], [W * 0.3, H * 0.6, H * 0.8], [W, 0, W / 3], [W / 2, H / 2, Math.max(W, H)]]) {
      const p = padRect(x, y, r, W, H);
      assert.ok(p, `${W}×${H}: the lobule reaches past the screen`);
      assert.ok(-p.l <= Math.min(0, x - r) && -p.t <= Math.min(0, y - r), 'top left');
      assert.ok(p.w - p.l >= Math.max(W, x + r) && p.h - p.t >= Math.max(H, y + r), 'bottom right');
      assert.ok(p.w - p.l - Math.max(W, x + r) < 1 && p.h - p.t - Math.max(H, y + r) < 1 && Math.min(0, x - r) + p.l < 1, 'no more than that');
    }
  }
});

test('full detail on every phone and iPad; on any screen, never past the budget', async () => {
  const { wideDpr, WIDE_PX_TOUCH, WIDE_PX } = await import('../src/ui/lobule-look.js');
  // Measured in WebKit (20 Oct), 13" iPad landscape at 2x: deck 6/10 1.96× the screen with the slide's text, 25.3 M px without.
  assert.equal(wideDpr(2, 1766, 1574, true), 2);
  assert.equal(wideDpr(2, 2653, 2380, true), 2, 'no slide text: still full detail');
  for (const [W0, H0] of [[1376, 1032], [1032, 1376], [1180, 820], [820, 1180], [402, 874], [390, 844], [440, 956]]) {
    for (const grow of [1.2, 2, 3, 4]) {
      const W = Math.round(W0 * Math.sqrt(grow)), H = Math.round(H0 * Math.sqrt(grow));
      if (W * H * 4 <= WIDE_PX_TOUCH) assert.equal(wideDpr(2, W, H, true), 2, `${W0}×${H0}, ${grow}×`);
    }
  }
  for (const [W0, H0] of [[402, 874], [1376, 1032], [1512, 945], [1728, 1117], [2560, 1440]]) {
    for (const grow of [1.2, 2, 4, 9]) {
      for (const dpr of [1, 2]) {
        for (const touch of [true, false]) {
          const W = Math.round(W0 * Math.sqrt(grow)), H = Math.round(H0 * Math.sqrt(grow)), d = wideDpr(dpr, W, H, touch), cap = touch ? WIDE_PX_TOUCH : WIDE_PX;
          assert.ok(d <= dpr && W * H * d * d <= cap * 1.0001, `${W0}×${H0} ×${grow} at ${dpr}x`);
          if (W * H * dpr * dpr <= cap) assert.equal(d, dpr, 'full detail whenever it fits');
        }
      }
    }
  }
  // A 14" MacBook at 2x keeps full detail for a box 9× its screen.
  assert.equal(wideDpr(2, 1512 * 3, 945 * 3, false), 2);
});

test('the tiles cover the box exactly, on whole device pixels, each far under the one-canvas limit', async () => {
  const { wideTiles, WIDE_TILE } = await import('../src/ui/lobule-look.js');
  for (const [W, H] of [[1766, 1574], [2653, 2380], [790, 1700], [5000, 3000], [300, 200]]) {
    for (const dpr of [1, 1.5, 2]) {
      const t = wideTiles(W, H, dpr), DW = Math.round(W * dpr), DH = Math.round(H * dpr);
      let area = 0;
      for (const q of t) {
        for (const v of [q.x, q.y, q.w, q.h]) assert.ok(Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6, 'whole device pixels');
        const px = Math.round(q.w * dpr) * Math.round(q.h * dpr);
        assert.ok(px <= WIDE_TILE * 1.1 && px < 16777216 * 0.8, `${W}×${H} at ${dpr}: a tile of ${px}`);
        area += px;
        for (const o of t) if (o !== q) assert.ok(o.x >= q.x + q.w - 1e-9 || o.x + o.w <= q.x + 1e-9 || o.y >= q.y + q.h - 1e-9 || o.y + o.h <= q.y + 1e-9, 'no overlap');
      }
      assert.equal(area, DW * DH, 'the whole box');
    }
  }
});

// WebKit refuses 2D canvases past about 384 MB in all. The dive's peak on every iPhone and iPad, building a tile: the tiles made so
// far, and the tile with its tissue and rim layer (3 × a tile); then the copy and the layers drawn for the screen (tissue, ductules).
// With the lobule's world bitmap (3600 px square at most) and the field. The vessels' WebGL canvas (a tile, then the screen) on top.
test('the dive\'s canvases stay under 300 MB on every iPhone and iPad, at their widest box (WebGL included: under 330 MB)', async () => {
  const { wideDpr, wideTiles, WIDE_PX_TOUCH } = await import('../src/ui/lobule-look.js');
  for (const [W0, H0] of [[1376, 1032], [1032, 1376], [1180, 820], [820, 1180], [1366, 1024], [402, 874], [390, 844], [440, 956], [375, 667]]) {
    for (const grow of [1.5, 2, 2.5, 3, 4, 6, 12]) {
      const W = Math.round(W0 * Math.sqrt(grow)), H = Math.round(H0 * Math.sqrt(grow)), d = wideDpr(2, W, H, true);
      const tiles = wideTiles(W, H, d).map((q) => Math.round(q.w * d) * Math.round(q.h * d) * 4 * 1.01), copy = tiles.reduce((a, b) => a + b, 0);
      const screen = W0 * H0 * 4 * 4, world = 3600 * 3600 * 4, field = W0 * H0 * 0.64 * 4;
      let build = 0, made = 0;
      for (const t of tiles) { build = Math.max(build, made + 3 * t); made += t; }
      const peak = Math.max(build, copy + 2 * screen) + world + field, gl = Math.max(...tiles, screen);
      assert.ok(copy <= WIDE_PX_TOUCH * 4 * 1.02);
      assert.ok(peak <= 300 * MB, `${W0}×${H0}, a box ${grow}× the screen: ${(peak / MB).toFixed(0)} MB`);
      assert.ok(peak + gl <= 330 * MB, `${W0}×${H0}, ${grow}×, with WebGL: ${((peak + gl) / MB).toFixed(0)} MB`);
    }
  }
});
