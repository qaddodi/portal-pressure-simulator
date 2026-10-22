import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The marks on the vessels (stents, band rings, clamps, clots, plugs, balloons) are drawn on the GPU, and their SVG copies are hidden
// (data-gl) once they are read. A rebuilt mark is a new SVG shape without data-gl, shown until it is read; the frame loop reads it, but
// does not come round in every frame (paced or yielding frames), so a pan or pinch painted the new stent and band rings as SVG, a frame
// apart from the vessels, for up to a quarter of a second after the model changed them. The update that rebuilds them reads them in the
// same task. (The browser check "pan and pinch: marks and labels stay locked to the figure" watches for it.)
const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const body = (re) => { const m = re.exec(src); assert.ok(m, `${re} is in stage.js`); let depth = 0, i = src.indexOf('{', m.index); const from = i; for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; } return src.slice(from, i + 1); };

test('marksSync reads the marks for the GPU only when their key moved, and only with the GPU lines', () => {
  const b = body(/function marksSync\(\)/);
  assert.match(b, /glLines && marksKey\(\) !== mk\.key/);
  assert.match(b, /marksBuild/);
});

test('the overlay update that rebuilds the marks reads them in the same task, after its last change to them', () => {
  const b = body(/function updateOverlays\(/);
  const bump = b.lastIndexOf('mk.ver++');
  assert.ok(bump > 0, 'the update marks the marks as changed');
  assert.ok(b.indexOf('marksSync()', bump) > bump, 'and reads them right after');
  // Nothing is added to an overlay group after that read.
  const after = b.slice(b.indexOf('marksSync()', bump));
  assert.doesNotMatch(after, /ov\.[a-zA-Z]+\.(append|innerHTML)/);
});

test('the frame loop still reads them too (a look or a theme that changes them, a clamp that has faded out)', () => {
  const b = body(/function olStep\(now\)/);
  assert.match(b, /marksSync\(\)/);
  assert.doesNotMatch(b, /marksBuild\)/, 'one way in');
});
