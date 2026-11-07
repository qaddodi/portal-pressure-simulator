import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The organs reach the GPU from a canvas of their own. Handed to the GPU as a canvas, Safari stalled up to 750 ms on each
// patient change (HVPG slides 8 and 9, 17 Oct): the pixels are read from a canvas kept in memory and sent a strip per frame
// (plate-upload.js), into a texture shown only once full. Every raster draws into a canvas of its own, so a quick second
// raster (a view switch, a slide, a resize, a theme change) never has its drawing wiped by an earlier one.
const stage = stageSource();


test('the ascites cavity reaches the GPU as row half-widths, never as a canvas', () => {
  // (Copying a fresh canvas of its outline into a texture took Safari about 220 ms on each step of a fluid ease.)
  assert.match(stage, /veins\.setFluidSpans\(cavityHalfWidths\(bulge, /);
  assert.doesNotMatch(stage, /setFluidMask/);
});

test('the GPU fills a plate texture of its own and swaps it in whole', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /plateJob\(W, H\) \{\n\s+const tex = dataTex\(gl, gl\.LINEAR\);\n\s+gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA8, W, H, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, null\);/);
  assert.match(gl, /gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, y, job\.W, rows, gl\.RGBA, gl\.UNSIGNED_BYTE, pixels\);/);
  assert.match(gl, /setPlate\(slot, job, rect\) \{\n\s+if \(plates\[slot\]\) gl\.deleteTexture\(plates\[slot\]\.tex\);\n\s+plates\[slot\] = \{ tex: job\.tex, rect \};/);
  assert.doesNotMatch(gl, /UNPACK_PREMULTIPLY_ALPHA_WEBGL, true/, 'the strips come premultiplied');
});

test('an ease that outgrows the plate shows on the live drawing, and the plate is drawn again once it settles', () => {
  // (Held, the organs inside the plate stood still while their outlines moved through a fill played over days, then jumped.)
  const poke = stage.slice(stage.indexOf('function platePoke'), stage.indexOf('const key = plateStateKey();', stage.indexOf('function platePoke')));
  assert.match(poke, /if \(!liveNow && \((?:live\.)?(?:live\.)?lvMoving \|\| (?:live\.)?(?:live\.)?fluidEasing\(\)\)\) \{ if \((?:live\.)?(?:live\.)?plateKey && (?:live\.)?(?:live\.)?veins\.hasPlate\(0\) && plateStateKey\(\) !== (?:live\.)?(?:live\.)?plateKey\) hidePlate\(\); return; \}/);
  // (Unless the changing organs are painted live: then nothing is dropped, and the pictures under them hold none of them.)
  assert.match(poke, /const liveNow = liveOn\(\);/);
  // (The bowel's float only once the fluid settles: its picture is moved on the GPU while it eases.)
  assert.match(stage, /if \(liveOn\(\)\) return \['live', bowelHeld, themeKey\(\), cs\.getPropertyValue\('--stage-bg'\)/);
});

test('highlighting an organ never draws the organ picture again (its look is the same, and the redraw lagged)', () => {
  const key = stage.slice(stage.indexOf('function plateStateKey'), stage.indexOf('const figureHidden'));
  assert.doesNotMatch(key, /selOKey/);
  // (Safe only while the selected organ's class styles nothing: its outline and dim are drawn outside the picture.)
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.org-sel(?![-\w])/);
});



test('the pictures made after a pan or pinch wait until the figure is let go', () => {
  // (Mohammad, 21 Oct: a hitch "as soon as I stop panning", finger still down; and 0.6 s after a pinch, as the menus faded in.)
  // (The one clock of input is quiet.js now, read by the stage and everything else that waits for a gesture to end.)
  const quiet = readFileSync(new URL('../src/ui/quiet.js', import.meta.url), 'utf8');
  assert.match(quiet, /const leftAlone = \(ms\) => !\(pressed\.size && since\(\) < 5000\) && since\(\) >= ms;/);
  assert.match(quiet, /on\('pointerdown', \(e\) => pressed\.add\(e\.pointerId\)\);/);
  assert.match(quiet, /for \(const ev of \['pointerup', 'pointercancel'\]\) on\(ev, \(e\) => pressed\.delete\(e\.pointerId\)\);/);
  const sched = stage.slice(stage.indexOf('function schedulePlateView'), stage.indexOf('function clientToWorldFast'));
  assert.match(sched, /if \(!leftAlone\(280\)\) \{ (?:live\.)?(?:live\.)?plateSettle = stageScope\.timer\(settled, 120\); return; \}/);
});


test('in the circuit, where the organs are faded out, no organ picture is made after a pan or pinch', () => {
  // (Mohammad, 21 Oct: the lag after a pan or zoom "also happens in circuit view".)
  const sched = stage.slice(stage.indexOf('function schedulePlateView'), stage.indexOf('function clientToWorldFast'));
  assert.match(sched, /if \(!(?:live\.)?(?:live\.)?veins \|\| !(?:live\.)?(?:live\.)?plateOn\(\) \|\| !(?:live\.)?(?:live\.)?CTM\) return;\n(?:\s+\/\/.*\n)+\s+if \((?:live\.)?(?:live\.)?morphTarget !== 0 \|\| (?:live\.)?(?:live\.)?morph > 0\) return;/);
});

test("an ordinary pan makes no new picture of the view while the one shown still covers the screen", () => {
  // (Review, 25 Oct: after every settled pan a sharper view picture was made again, though the one shown still covered the
  // screen; only the margin around it had left it.)
  const sched = stage.slice(stage.indexOf('function schedulePlateView'), stage.indexOf('async function makeGutPic'));
  assert.match(sched, /const vx0 = Math\.max\(PLATE_RECT\[0\], ax\), vy0 = Math\.max\(PLATE_RECT\[1\], ay\), vx1 = Math\.min\(PLATE_RECT\[0\] \+ PLATE_RECT\[2\], bx\), vy1 = Math\.min\(PLATE_RECT\[1\] \+ PLATE_RECT\[3\], by\);/);
  assert.match(sched, /if \((?:live\.)?plateView && vx0 >= (?:live\.)?plateView\[0\] && vy0 >= (?:live\.)?plateView\[1\] && vx1 <= (?:live\.)?plateView\[2\] && vy1 <= (?:live\.)?plateView\[3\] && scale <= (?:live\.)?plateView\[4\] \* 1\.05\) return;/, 'the screen, not its margin, inside the kept picture');
  // Painted on the GPU, the picture reaches half a view past each side, never so far its resolution drops below the screen's.
  assert.match(sched, /const reach = liveOn\(\) \? Math\.max\(0\.15, Math\.min\(0\.5, \(Math\.sqrt\(4\.2e6 \/ Math\.max\(1, vw \* vh\)\) - 1\) \/ 2, \(4094 \/ Math\.max\(1, vw, vh\) - 1\) \/ 2\)\) : 0\.15;/);
  // (The bound: a view of vw × vh px at reach r spans (1 + 2r)² vw·vh px, within the 4.2e6 the scale is held to, and a side within 4094.)
  for (const [vw, vh] of [[1280, 800], [2560, 1600], [3456, 2234], [1170, 2532]]) {
    const reach = Math.max(0.15, Math.min(0.5, (Math.sqrt(4.2e6 / (vw * vh)) - 1) / 2, (4094 / Math.max(vw, vh) - 1) / 2));
    const s = 1 + 2 * reach;
    if (reach > 0.15) { assert.ok(s * s * vw * vh <= 4.2e6 + 1, `${vw}x${vh}`); assert.ok(s * Math.max(vw, vh) <= 4094 + 1e-6, `${vw}x${vh}`); }
  }
});
