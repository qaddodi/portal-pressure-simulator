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
  // (Reduced motion fades the dive, magnifying nothing: no copy is built then.)
  // (Drawn on the 2D canvas (keep2D): the dive's copy of the tissue is made from it, and wideChecked checks it.)
  assert.match(lz, /const \[W, H\] = hostSize\(\), box = reduce\.matches \? null : padBox\(W, H\), wd = box \? buildWide\(W, H, box\) : null;\n\s+keep2D = true;\n\s+try \{ idleDrawn = ''; draw\(0\); diveDrawn = true; staged = api\.viewKey\(\); relLater = true; wide = wideChecked\(wd\); \} finally \{ keep2D = false; \}/);
  // Each tile is the layers as they stack: the tissue's rimmed copy, the vessels, the ductules; each source given back at once.
  const b = lz.match(/function buildWide\([\s\S]*?\n {2}\}/)[0];
  assert.match(b, /paintTissue\(w, hh, dpr, dark, cs, flat\);\n\s+diveRim = [^\n]*diveCopy\(cv\);/);
  assert.match(b, /free\(rimCv\); free\(tissue\);/);
  assert.match(b, /drawGL\(TW, TH, dpr, dark, cs, 0\); c\.drawImage\(glCv, 0, 0, cv\.width, cv\.height, 0, 0, cv\.width, cv\.height\); \}/, 'the vessels, their canvas sized once');
  assert.match(b, /c\.drawImage\(fx, 0, 0, cv\.width, cv\.height\); free\(fx\);/, 'then the ductules');
  assert.match(b, /dpr = wideDpr\(dpr0, box\.w, box\.h, apple\(\)\)/);
  assert.match(b, /trimFieldStates\(\);/, 'older field states given back first');
  // The tiles sit in one box, and only the box is scaled. Each reaches 2 device px under its right and lower neighbours (edge to
  // edge, scaled, they showed a pale hairline in WebKit), keeping there only its opaque pixels: nothing translucent is laid twice.
  assert.match(b, /left: `\$\{t\.x\}px`, top: `\$\{t\.y\}px`, width: `\$\{w\}px`, height: `\$\{hh\}px`/);
  assert.match(b, /const OV = 2 \/ dpr/);
  assert.match(b, /if \(or\) opaqueOnly\(c, cv\.width - 2, 0, 2, cv\.height\);\n\s+if \(ob\) opaqueOnly\(c, 0, cv\.height - 2, cv\.width, 2\);/);
  assert.match(lz, /for \(let i = 3; i < d\.length; i \+= 4\) if \(d\[i\] < 255\) \{ d\[i - 3\] = d\[i - 2\] = d\[i - 1\] = d\[i\] = 0; \}/);
  assert.match(lz, /wide\.el\.style\.transformOrigin = `\$\{\(x \+ wide\.box\.l\)\.toFixed\(1\)\}px \$\{\(y \+ wide\.box\.t\)\.toFixed\(1\)\}px`;/);
  assert.match(lz, /trimFieldStates\(\) \{\n\s+free\(worldOld\); free\(xfCv\);[^\n]*\n\s+const keys = \[\.\.\.tileSets\.keys\(\)\];\n\s+for \(const key of keys\.slice\(0, -1\)\)/);
});

test('every canvas the copy needs is checked; a refusal drops the copy, never shows a blank lobule', () => {
  const b = lz.match(/function buildWide\([\s\S]*?\n {2}\}/)[0];
  assert.match(b, /ok = probe\(tissue\) && \(!worldAt\?\.cv\.width \|\| probe\(rimCv\)\) && probe\(cv\);/, 'tissue, rim layer and tile');
  assert.match(b, /if \(!probe\(fx\)\) \{ ok = false;/, 'the ductules\' layer');
  assert.match(b, /if \(!ok\) \{ for \(const cv of tiles\) free\(cv\); return null; \}/);
  // The layers drawn for the screen after it: refused, the copy goes and they are drawn again.
  assert.match(lz, /function wideChecked\(wd\) \{\n\s+if \(!wd \|\| \(probe\(tissue\) && probe\(fx\)\)\) return wd;/);
  assert.match(lz, /function probe\(cv\) \{[\s\S]*?c\.putImageData\(new ImageData\(new Uint8ClampedArray\(\[0, 0, 0, 255\]\), 1, 1\), 0, 0\);[\s\S]*?c\.putImageData\(d, 0, 0\);/);
  assert.match(lz, /function diveCopy\(dst = diveCv\) \{/);
  assert.match(lz, /const c = dst\.getContext\('2d'\);\n\s+if \(!c\) return;/);
});

test('landed, the copy goes and the layers show as drawn; a softer copy fades into them; the copy goes on release and on a new framing', () => {
  assert.match(lz, /if \(wide && !rim\) dropWide\(true\);/);
  assert.match(lz, /if \(ease && w\.soft && !reduce\.matches\) \{[^\n]*w\.el\.style\.transition = 'opacity 320ms var\(--ease\)'; w\.el\.style\.opacity = '0';/, 'never a snap to the sharp picture');
  assert.match(lz, /diveRim = rim && !wide \?/, 'no second copy of the tissue while the wide copy shows');
  assert.match(lz, /if \(wide\) \{ for \(const e of WIDE_HIDE\) e\.style\.visibility = 'hidden'; wide\.el\.style\.visibility = ''; \}/);
  assert.match(lz, /function release\(\) \{\n\s+dropWide\(\);/);
  assert.match(lz, /if \(fade > 0 && was === 0 && wide && !\(staged && staged === api\.viewKey\(\) && model\)\) dropWide\(\);/, 'a stale copy is not shown');
  // Nothing under the copy is redrawn while it shows.
  assert.match(lz, /if \(scaled && diveDrawn && flowA <= 0\) return false;/);
  assert.match(lz, /if \(scaled && wide\) return false;/);
});

test('the rise out of a zoomed-in lobule shrinks it whole, whichever way out', () => {
  // A presenter's next slide: the lobule glides to its whole view and the rise waits for it (the central-vein close-up included).
  const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pz, /if \(stage\.lobuleOpen\(\)\) \{ const ms = reduce\.matches \|\| booting \? 0 : RISE_FIT_MS; if \(stage\.lobuleFocus\('fit', \{ ms, ease: 'in' \}\)\) await wait\(ms\); \}\n\s+if \(next && !reduce\.matches && !booting\) stage\.riseTo\(next\.box, next\.kMax, next\.clear\);[^\n]*\n\s+store\.set\(\{ lobule: false \}\);/);
  assert.match(lz, /focusOn\(part, \{ zoom = 2, ms = 1400, ease = 'inOut' \} = \{\}\) \{[\s\S]*?const moved = [^\n]*> 0\.5;[\s\S]*?return moved;/, 'it waits whenever the view moves');
  // Every other way out (back to healthy, the view buttons, a key) from a zoomed-in view: the whole copy, before the rise's clock.
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.ok(st.indexOf('lz.stageRise();') > 0 && st.indexOf('lz.stageRise();') < st.indexOf('const t0 = performance.now();\n    const step = (now) => {\n      const e0 = ms ?'), 'built before the rise is timed');
  assert.match(st, /riseFast = true;\n\s+lz\.stageRise\(\);/);
  // The way back to the fit reaches it still moving (eased in only, Mohammad 20 Oct: Circulation 9 to 10 stopped midway), quick enough
  // to meet the rise at about its own speed, and the rise moves from its first frame.
  assert.ok(+/const RISE_FIT_MS = (\d+);/.exec(pz)[1] <= 600, 'the zoom to the fit is short');
  assert.match(lz, /e = ease === 'in' \? u \* u : /);
  assert.match(st, /const p = riseFast \? u \* u \* \(2 - u\) : /);
  const sr = lz.match(/function stageRise\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(sr, /const \[W, H\] = hostSize\(\), box = padBox\(W, H\);\n\s+if \(!box\) return;/);
  assert.match(sr, /const wd = buildWide\(W, H, box\);\n\s+keep2D = true;\n\s+try \{ idleDrawn = ''; draw\(0\); wide = wideChecked\(wd\); \} finally \{ keep2D = false; \}/);
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
        assert.ok(px <= WIDE_TILE && WIDE_TILE < 16777216 / 2, `${W}×${H} at ${dpr}: a tile of ${px}`);
        area += px;
        for (const o of t) if (o !== q) assert.ok(o.x >= q.x + q.w - 1e-9 || o.x + o.w <= q.x + 1e-9 || o.y >= q.y + q.h - 1e-9 || o.y + o.h <= q.y + 1e-9, 'no overlap');
      }
      assert.equal(area, DW * DH, 'the whole box');
    }
  }
});

// WebKit refuses 2D canvases past about 384 MB in all. The dive's peak on every iPhone and iPad, building a tile: the tiles made so
// far, and the tile with its tissue and rim layer (3 × a tile); then the copy and the layers drawn for the screen (tissue, ductules).
// With the lobule's world bitmap (3600 px square at most), the field and one state's field tiles (the others are trimmed first,
// about 47 MB a state). Then WebGL: the vessels' canvas (a tile's size, or the screen's) and its snapshot drawn into a tile.
// (On iOS a canvas's backing store is the surface the compositor draws: no second copy of each tile on the GPU.)
test('the dive\'s canvases stay under 300 MB on every iPhone and iPad, at their widest box (WebGL included: under 340 MB)', async () => {
  const { wideDpr, wideTiles, WIDE_PX_TOUCH } = await import('../src/ui/lobule-look.js');
  for (const [W0, H0] of [[1376, 1032], [1032, 1376], [1180, 820], [820, 1180], [1366, 1024], [402, 874], [390, 844], [440, 956], [375, 667]]) {
    for (const grow of [1.5, 2, 2.5, 3, 4, 6, 12]) {
      const W = Math.round(W0 * Math.sqrt(grow)), H = Math.round(H0 * Math.sqrt(grow)), d = wideDpr(2, W, H, true);
      const tiles = wideTiles(W, H, d).map((q) => Math.round(q.w * d) * Math.round(q.h * d) * 4), copy = tiles.reduce((a, b) => a + b, 0);
      const screen = W0 * H0 * 4 * 4, world = 3600 * 3600 * 4, field = W0 * H0 * 0.64 * 4, fieldTiles = 47 * MB;
      let build = 0, made = 0;
      for (const t of tiles) { build = Math.max(build, made + 3 * t); made += t; }
      const peak = Math.max(build, copy + 2 * screen) + world + field + fieldTiles, gl = 2 * Math.max(...tiles, screen);
      assert.ok(copy <= WIDE_PX_TOUCH * 4 * 1.0001);
      assert.ok(peak <= 300 * MB, `${W0}×${H0}, a box ${grow}× the screen: ${(peak / MB).toFixed(0)} MB`);
      assert.ok(peak + gl <= 340 * MB, `${W0}×${H0}, ${grow}×, with WebGL: ${((peak + gl) / MB).toFixed(0)} MB`);
    }
  }
});
