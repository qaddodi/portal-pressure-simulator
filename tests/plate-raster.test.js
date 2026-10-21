import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The organs reach the GPU from a canvas of their own. Handed to the GPU as a canvas, Safari stalled up to 750 ms on each
// patient change (HVPG slides 8 and 9, 17 Oct): the pixels are read from a canvas kept in memory and sent a strip per frame
// (plate-upload.js), into a texture shown only once full. Every raster draws into a canvas of its own, so a quick second
// raster (a view switch, a slide, a resize, a theme change) never has its drawing wiped by an earlier one.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a plate raster draws into a canvas of its own and sends it as pixel strips, one per frame', () => {
  const body = stage.slice(stage.indexOf('async function rasterPlate'), stage.indexOf('function plateStateKey'));
  // Every piece is drawn into a small canvas of its own and read back from it: read back from one canvas the size of the whole
  // picture, each strip took Safari longer than the one above (25 ms to over 200 ms; Mohammad's ?perf readout, Mac, 21 Oct).
  assert.match(body, /const drawn = \(w, h, paint\) => \{\n\s+const pc = document\.createElement\('canvas'\);\n\s+pc\.width = w; pc\.height = h;\n\s+const pg = pc\.getContext\('2d', \{ willReadFrequently: true \}\), p = \{ pc, pg, w, h \};\n\s+pend\.push\(p\);\n\s+gpuProbe\.time\(null, 'organ picture: draw', \(\) => paint\(pg\)\);/);
  assert.match(body, /const readBack = \(p\) => \{\n\s+try \{ return gpuProbe\.time\(null, 'organ picture: read', \(\) => premultiply\(p\.pg\.getImageData\(0, 0, p\.w, p\.h\)\.data\)\); \} finally \{ p\.pc\.width = p\.pc\.height = 0; pend\.splice\(pend\.indexOf\(p\), 1\); \}/);
  assert.doesNotMatch(body, /getImageData\(0, y,/, 'never read from a canvas the size of the whole picture');
  // Each strip is drawn in its own frame too: the whole picture drawn at once was one long frame after every zoomed pan or
  // pinch (21 Oct). The view's picture is a picture per strip, of only the shapes that meet it, so its markup, its parse and
  // its drawing are a strip's too. Same scale, cut at whole rows: the same pixels. A strip is read back a frame after it is
  // drawn (Safari paints a canvas's drawing on its own: read at once, the read waited out the painting, 70–130 ms a strip in
  // his ?perf readout, 21 Oct), and the next strip follows in that frame, never two strips' reads in one.
  assert.match(body, /const gone = \(\) => seq !== plateSeq \|\| drops !== plateDrops \|\| v !== veins \|\| v\.lost \|\| vseq !== \(banded \? viewSeq : 0\) \|\| drawnAs !== plateStateKey\(\);/);
  assert.match(body, /for \(const \[y, rows\] of plateStrips\(W, H\)\) \{\n\s+if \(y && !waited\) await new Promise\(\(res\) => nextFrame\(res\)\);\n\s+waited = false;\n\s+if \(gone\(\)\) return false;\n\s+if \(banded\) \{/, 'a raster overtaken on its way in is given up (a view picture, by a newer view picture too)');
  assert.match(body, /if \(gone\(\) \|\| plateCopy\?\.key !== drawnAs\) return false;\n\s+mine\.push\(\[qx, qy, drawn\(qw, qh, \(pg\) => pg\.drawImage\(band, 0, 0, qw, qh\)\)\]\);/, 'a strip whose copy changed state is given up');
  assert.match(body, /if \(mine\.length\) \{ await new Promise\(\(res\) => nextFrame\(res\)\); waited = true; if \(gone\(\)\) return false; \}\n\s+for \(const \[qx, qy, p\] of mine\) copyPixels\(px, W, qx, qy, readBack\(p\), p\.w, 0, 0, p\.w, p\.h\);/, 'read a frame after it is drawn, and given up if overtaken meanwhile');
  assert.match(body, /v\.plateRows\(job, y, rows, px\.subarray\(y \* W \* 4, \(y \+ rows\) \* W \* 4\)\);/);
  assert.match(body, /const p = drawn\(W, rows, \(pg\) => pg\.drawImage\(whole, 0, y, W, rows, 0, 0, W, rows\)\);\n\s+await new Promise\(\(res\) => nextFrame\(res\)\); waited = true;\n\s+if \(gone\(\)\) return false;\n\s+v\.plateRows\(job, y, rows, readBack\(p\)\);/);
  assert.doesNotMatch(body, /drawImage\([a-z]+, 0, 0, W, H\)/, 'never the whole picture in one frame');
  assert.match(body, /v\.setPlate\(slot, job, rect\); job = null;/, 'shown only once every strip is in');
  assert.match(body, /finally \{ if \(job && !v\.lost\) v\.dropJob\(job\); px = null; for \(const p of pend\) p\.pc\.width = p\.pc\.height = 0; \}/, 'a canvas drawn and not yet read is let go when the picture is given up');
  // (Only the view picture that was shown is kept, for the next pan; the one before is let go, and so is the kept one when the plate drops.)
  assert.match(body, /v\.setPlate\(slot, job, rect\); job = null;\n\s+if \(banded\) \{ dropViewKeep\(\); viewKeep = \{ px, rect, W, H, scale, seq, drops, key: drawnAs \}; px = null; \}/);
  assert.match(stage, /function dropViewKeep\(\) \{ viewKeep = null; \}/);
  assert.match(stage, /plateCopy = null; dropViewKeep\(\);\n/);
  assert.doesNotMatch(stage, /veins\.setPlate\(slot, c,/);
  assert.match(stage, /function hidePlate\(\) \{\n\s+plateDrops\+\+;/, 'a dropped plate gives up the raster on its way in');
});

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
  assert.match(poke, /if \(lvMoving \|\| fluidEasing\(\)\) \{ if \(plateKey && veins\.hasPlate\(0\) && plateStateKey\(\) !== plateKey\) hidePlate\(\); return; \}/);
});

test('highlighting an organ never draws the organ picture again (its look is the same, and the redraw lagged)', () => {
  const key = stage.slice(stage.indexOf('function plateStateKey'), stage.indexOf('const figureHidden'));
  assert.doesNotMatch(key, /selOKey/);
  // (Safe only while the selected organ's class styles nothing: its outline and dim are drawn outside the picture.)
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.org-sel(?![-\w])/);
});

test("the gut's picture is drawn a strip per frame too", () => {
  const body = stage.slice(stage.indexOf('async function makeGutPic'), stage.indexOf('function clientToWorldFast'));
  assert.match(body, /for \(const \[y, rows\] of plateStrips\(W, H\)\) \{\n\s+if \(y\) await new Promise\(\(res\) => nextFrame\(res\)\);\n\s+if \(seq !== gutPicSeq\) throw new Error\('overtaken'\);\n\s+cg\.drawImage\(img, 0, y, W, rows, 0, y, W, rows\);/);
  assert.doesNotMatch(body, /drawImage\(img, 0, 0, W, H\)/);
});

test('after a pan at the same scale, of the same state, the view picture takes the pixels it shares with the last one', () => {
  // (Drawn whole after every zoomed pan, it was a strip of shapes written out, read in and drawn on each of about nine frames
  // right after the pan stopped. Mohammad, 21 Oct: "the lag after stopping panning or zooming is annoying".)
  const body = stage.slice(stage.indexOf('async function rasterPlate'), stage.indexOf('function plateStateKey'));
  assert.match(body, /const prev = banded && viewKeep && viewKeep\.seq === seq && viewKeep\.drops === drops && viewKeep\.key === drawnAs && viewKeep\.scale === scale \? viewKeep : null;/, 'only from a picture of the same state, at the same scale');
  assert.match(body, /const \{ copy, draw \} = prev \? viewReuse\(W, H, prev\.W, prev\.H, ox, oy, y, rows\) : \{ copy: null, draw: \[\[0, y, W, rows\]\] \};/);
  assert.match(body, /copyPixels\(px, W, copy\[0\], copy\[1\], prev\.px, prev\.W, copy\[0\] \+ ox, copy\[1\] \+ oy, copy\[2\], copy\[3\]\)/, 'copied pixel for pixel, never scaled');
  // The views sit whole pixels apart: each rect starts and ends on the scale's pixel grid.
  const sched = stage.slice(stage.indexOf('function schedulePlateView'), stage.indexOf('async function makeGutPic'));
  assert.match(sched, /x0 = Math\.floor\(x0 \* scale\) \/ scale; y0 = Math\.floor\(y0 \* scale\) \/ scale; x1 = Math\.ceil\(x1 \* scale\) \/ scale; y1 = Math\.ceil\(y1 \* scale\) \/ scale;/);
  assert.match(sched, /4094 \/ \(x1 - x0\), 4094 \/ \(y1 - y0\)/, 'grown by a pixel each way, a side stays within 4096');
});

test('the pictures made after a pan or pinch wait until the figure is let go', () => {
  // (Mohammad, 21 Oct: a hitch "as soon as I stop panning", finger still down; and 0.6 s after a pinch, as the menus faded in.)
  assert.match(stage, /const leftAlone = \(ms\) => !\(pressed\.size && performance\.now\(\) - inputAt < 5000\) && performance\.now\(\) - inputAt >= ms;/);
  assert.match(stage, /addEventListener\('pointerdown', \(e\) => pressed\.add\(e\.pointerId\), \{ passive: true, capture: true \}\);/);
  assert.match(stage, /for \(const ev of \['pointerup', 'pointercancel'\]\) addEventListener\(ev, \(e\) => pressed\.delete\(e\.pointerId\)/);
  const sched = stage.slice(stage.indexOf('function schedulePlateView'), stage.indexOf('async function makeGutPic'));
  assert.match(sched, /if \(!leftAlone\(280\)\) \{ plateSettle = setTimeout\(settled, 120\); return; \}/);
  assert.match(sched, /const go = \(\) => \{ if \(!leftAlone\(1000\)\) \{ gutPicTimer = setTimeout\(go, 250\); return; \} makeGutPic\(\)/);
});

test("the gut picture is made at fixed zoom steps, never stretched, so an ordinary pinch needs no new one", () => {
  const body = stage.slice(stage.indexOf('async function makeGutPic'), stage.indexOf('function clientToWorldFast'));
  assert.match(body, /const k = gutStep\(need, GUT_CAP\), look = gutLook\(\), mut = gutMut;/);
  assert.match(body, /if \(gutPics\.some\(\(p\) => p\.mut === mut && p\.look === look && p\.k === k\)\) return;/);
});

test('in the circuit, where the organs are faded out, no organ picture is made after a pan or pinch', () => {
  // (Mohammad, 21 Oct: the lag after a pan or zoom "also happens in circuit view".)
  const sched = stage.slice(stage.indexOf('function schedulePlateView'), stage.indexOf('async function makeGutPic'));
  assert.match(sched, /if \(!veins \|\| !plateOn\(\) \|\| !CTM\) return;\n(?:\s+\/\/.*\n)+\s+if \(morphTarget !== 0 \|\| morph > 0\) return;\n\s+gutPicSoon\(\);/);
});
