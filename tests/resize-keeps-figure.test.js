// GPU-5 (19 Nov 2026 review): the figure's canvas is resized in one place (stage-res.js resizeCanvas, the resize observer). Assigning its width clears the shown surface; where the figure is not
// drawn again in that task (the lobule or the sinusoid open, an update under way, a figure not yet whole) the paint before the next draw showed a cleared canvas, the lobule's one blank frame.
// The renderer's screen carries its picture into the new size (keep-screen.js, tested in keep-screen.test.js) and the resize hands it to the canvas at once: both branches are asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('a resize that does not draw the figure again in its task gives the canvas the kept picture, stretched', () => {
  const t = src('stage-res.js');
  const i = t.indexOf('vCanvas.width = bw; vCanvas.height = bh;');
  assert.ok(i > 0, 'the one place the figure canvas is resized');
  const rest = t.slice(i, i + 3200);
  assert.match(rest, /drawVeins\(false, 'resize'\); live\.veins\?\.showNow\?\.\(\); \}\s*(\/\/[^\n]*\n\s*)*else live\.veins\?\.screenResized\?\.\(\);/, 'drawn again: shown now; not drawn again: the screen carried over');
});
test('the renderer exposes it, from the kept screen', () => {
  const t = src('veins-gl.js');
  assert.match(t, /screenResized\(\) \{ if \(screenKeep && !lost\) screenKeep\.resized\(\); \}/);
});
