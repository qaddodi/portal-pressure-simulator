import { stageSource } from './stage-src.js';
// Diving into a lobule framed zoomed in (a slide aimed at a station), the lobule showed as a cropped box until it landed: its
// layers were the screen's size, scaled down for the dive (Mohammad, 20 Oct, lobule deck 5 → 6). Such a dive now shows the wide
// copy: the whole lobule flattened into tiles at the screen's own pixel ratio; on landing the layers, drawn before the zoom, show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const MB = 1024 * 1024;

test('a tile the GPU cannot draw drops the copy, never shows a blank lobule', () => {
  const g = lz.match(/function buildWideGL\([\s\S]*?\n {2}\}/)[0];
  assert.match(g, /if \(!g \|\| g\.lost\) return null;/, 'no vessels on the GPU: no copy');
  assert.match(g, /if \(!wg \|\| !wg\.begin\(\)\) return null;/);
  assert.match(g, /ok = onG && wg\.tile\(/, 'the tissue on the GPU and the tile laid, or no copy');
  assert.match(g, /if \(!ok\) break;/);
  assert.match(g, /if \(!ok\) \{ wg\.release\(\); return null; \}/);
});

test('landed, the copy goes and the layers show as drawn; a softer copy fades into them; the copy goes on release and on a new framing', () => {
  assert.match(lz, /if \(wide && !rim && !out\) dropWide\(true\);/);
  assert.match(lz, /if \(ease && w\.soft && !reduce\.matches\) \{[^\n]*w\.el\.style\.transition = `opacity \$\{D_SMALL\}ms var\(--ease\)`; w\.el\.style\.opacity = '0';/, 'never a snap to the sharp picture');
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
  assert.match(pz, /if \(stage\.lobuleOpen\(\)\) \{ const ms = reduce\.matches \|\| booting \? 0 : RISE_FIT_MS; if \(stage\.lobuleFocus\('fit', \{ ms, ease: 'in' \}\)\) \{ await wait\(ms\); if \(cut\(\)\) return; \} \}\n\s+if \(next && !reduce\.matches && !booting\) stage\.riseTo\(next\.box, next\.kMax, next\.clear\);[^\n]*\n\s+store\.set\(\{ lobule: false \}\);/);
  assert.match(lz, /focusOn\(part, \{ zoom = 2, ms = 1400, ease = 'inOut' \} = \{\}\) \{[\s\S]*?const moved = [^\n]*> 0\.5;[\s\S]*?return moved;/, 'it waits whenever the view moves');
  // Every other way out (back to healthy, the view buttons, a key) from a zoomed-in view: the whole copy, before the rise's clock.
  const st = stageSource();
  assert.ok(st.indexOf('lz.stageRise();') > 0 && st.indexOf('lz.stageRise();') < st.indexOf('const t0 = PACED ? easeNow() : performance.now();\n    live.lobOn = on;'), 'built before the rise is timed');
  assert.match(st, /(?:live\.)?riseFast = true;\n\s+(?:live\.)?lz\.stageRise\(\);/);
  // The way back to the fit reaches it still moving (eased in only, Mohammad 20 Oct: Circulation 9 to 10 stopped midway), quick enough
  // to meet the rise at about its own speed, and the rise moves from its first frame.
  assert.ok(+/const RISE_FIT_MS = (\d+);/.exec(pz)[1] <= 600, 'the zoom to the fit is short');
  assert.match(lz, /e = ease === 'in' \? u \* u : /);
  assert.match(st, /const p = (?:live\.)?riseFast \? u \* u \* \(2 - u\) : /);
  const sr = lz.match(/function stageRise\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(sr, /const \[W, H\] = hostSize\(\), (?:live\.)?box = padBox\(W, H\);\n\s+if \(!(?:live\.)?box\) return;/);
  assert.match(sr, /const wd = buildWide\(W, H, (?:live\.)?box\);\n\s+idleDrawn = ''; draw\(0\); wide = wd;/);
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

// 7 Nov 2026, Mohammad (Mac, deck slide 6/16, every slide): "zooming into the lobule during slides is showing the cropped lobule": the lobule
// as the screen's rectangle, cut off at its top, bottom and right, inside the field's pale lobules. Three ways the whole copy went missing.
test('the rise keeps its copy from its first frame, which is at full size, until it ends or lands back in the lobule', () => {
  assert.match(lz, /setDiveZoom\(k, x, y, tx = x, ty = y, out = false\) \{/);
  const dv = readFileSync(new URL('../src/ui/stage-dive.js', import.meta.url), 'utf8');
  assert.match(dv, /live\.lz\.setDiveZoom\(t >= 1 \? 1 : clamp\(r \/ live\.diveLand\.r, 0\.05, 1\), live\.diveLand\.x, live\.diveLand\.y, px, py, !!live\.diveOut\);/, 'the dive frames say which way they go');
  // (The rise's end and a view switch call it at full size with no direction: the copy goes there, or with the lobule's release.)
  const st = stageSource();
  assert.match(st, /lz\.setDiveZoom\(1, 0, 0\)/);
  assert.match(lz, /function release\(\) \{\n\s+dropWide\(\);/);
});

test('a way out begun mid-glide to the whole lobule is judged by where the lobule reaches, not by the glide\'s aim', () => {
  const pb = lz.match(/function padBox\(W, H\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(pb, /if \(!geo \|\| \(atFit && !gliding\)\) return null;/);
  const sr = lz.match(/function stageRise\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.ok(sr.indexOf('padBox(W, H)') < sr.indexOf('if (gliding) { cancelFrame(glide); gliding = false;'), 'the box is asked for while the glide still counts as one');
});

test('each tile of the copy is judged by its own GL calls, not by an error another pass left with the driver', () => {
  const wg = readFileSync(new URL('../src/ui/wide-gl.js', import.meta.url), 'utf8');
  const t = wg.match(/tile\(t, pw, ph, dpr, layers\) \{[\s\S]*?if \(layers === 'host'\) return fromHost/)[0];
  assert.match(t, /glOkBefore\(gl\);\n\s+if \(layers === 'host'\) return fromHost/);
});
