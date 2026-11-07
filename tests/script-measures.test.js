// The figure's boxes, the "60 %"'s box and a sheet's eased offset are worked out in script, not asked of the browser (2 Nov 2026:
// getBBox, getComputedTiming and isPointInFill each laid the page out or brought its styles up to date in a frame or a move).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { search: '' };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// (A small stand-in for an SVG element: what elBox reads, its name, attributes, inline style, children and transform.)
const el = (name, at = {}, kids = [], m = null) => ({
  localName: name, children: kids, style: at.style || {},
  hasAttribute: (k) => k in at, getAttribute: (k) => (k in at ? String(at[k]) : null),
  transform: { baseVal: { numberOfItems: m ? 1 : 0, consolidate: () => ({ matrix: m }) } },
});

test('elBox gives getBBox\'s box from the shapes\' own numbers: paths, circles, groups through their transforms, hidden left out', async () => {
  const { elBox } = await import('../src/ui/shape-gl.js');
  const b = elBox(el('path', { d: 'M0 0 A 10 10 0 0 1 20 0' }));   // (half a circle above the x axis: y to -10)
  near(b.x, 0, 1e-6, 'x'); near(b.width, 20, 1e-6, 'w'); near(b.y, -10, 0.01, 'y'); near(b.height, 10, 0.01, 'h');
  assert.deepEqual(elBox(el('circle', { cx: 5, cy: 5, r: 2 })), { x: 3, y: 3, width: 4, height: 4 });
  const g = el('g', {}, [el('rect', { x: 0, y: 0, width: 10, height: 10 }), el('rect', { x: 0, y: 0, width: 10, height: 10 }, [], { a: 1, b: 0, c: 0, d: 1, e: 20, f: 5 }),
    el('rect', { x: -100, y: -100, width: 1, height: 1, style: { display: 'none' } }), el('text', {})]);
  assert.deepEqual(elBox(g), { x: 0, y: 0, width: 30, height: 15 });
  assert.equal(elBox(el('g')), null, 'an empty group has no box');
  assert.deepEqual(elBox(el('g', {}, [el('text', {})]), () => ({ x: 1, y: 2, width: 3, height: 4 })), { x: 1, y: 2, width: 3, height: 4 }, 'text by its measure');
});

test('textBox gives Chrome\'s text box: advances for the width, Inter\'s ascent and descent rounded to whole screen pixels', async () => {
  const { textBox, loadGlyphs } = await import('../src/ui/text-gl.js');
  await loadGlyphs();
  // (Chromium's getBBox of "60%" in Inter 600, baseline at y 100, read on 2 Nov 2026: at 12 px and 1 px per unit, its ascent 12 and
  // descent 3; at 2 px per unit 11.5 and 3; at half a pixel 12 and 2; and in the app at 27.28 units (iPhone) 62.87 wide.)
  const a = textBox('60%', 100, 100, { weight: 600, size: 12 });
  near(a.y, 88, 1e-9, 'ascent at 1x'); near(a.height, 15, 1e-9, 'height at 1x'); near(a.width, 27.656, 0.02, 'width');
  const b = textBox('60%', 100, 100, { weight: 600, size: 12, k: 2 });
  near(b.y, 88.5, 1e-9, 'ascent at 2x'); near(b.height, 14.5, 1e-9, 'height at 2x');
  const c = textBox('60%', 100, 100, { weight: 600, size: 12, k: 0.5 });
  near(c.y, 88, 1e-9, 'ascent at 0.5x'); near(c.height, 14, 1e-9, 'height at 0.5x');
  near(textBox('60%', 0, 0, { weight: 600, size: 27.28 }).width, 62.87, 0.03, 'width at the iPhone\'s size');
  const e = textBox('60%', 100, 100, { weight: 600, size: 12, anchor: 'end' });
  near(e.x + e.width, 100, 1e-9, 'end anchor');
});

test('a sheet\'s offset mid-ease is worked out from its clock and curve, not read from the browser', async () => {
  const { curveOf } = await import('../src/ui/sheet-move.js');
  const { easeArrive } = await import('../src/ui/ease.js');
  near(curveOf('cubic-bezier(.2, .8, .2, 1)')(0.37), easeArrive(0.37), 1e-12, 'the arrival curve');
  near(curveOf('linear')(0.3), 0.3, 0, 'linear');
  near(curveOf('ease-in-out')(0.5), 0.5, 1e-6, 'a named curve');
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/sheet-move.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.getComputedTiming\b/);
});

test('the summary table\'s Doppler traces are drawn on the GPU, at the SVG\'s own points', async () => {
  await import('./dom-shim.js');
  const { wavePts, wavePath } = await import('../src/ui/col-wave.js');
  const w = { t: [0, 0.5, 1], v: [10, -20, 30] };
  const pts = wavePts(w, 'PV_TRUNK', 50, 120, 36), d = wavePath(w, 'PV_TRUNK', 50).d;
  const fromD = [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [+m[1], +m[2]]);
  pts.forEach(([x, y], i) => { near(x, fromD[i][0], 0.06, 'x'); near(y, fromD[i][1], 0.06, 'y'); });
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/col-wave.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /createElementNS/, 'no SVG built');
  assert.match(src, /createTraceGL\(cv, \{ redraw: \(\) => paintWave\(c\) \}\)/);
});

test('slide charts are models drawn on the GPU (svg-gl.js): transforms and viewBoxes as SVG takes them', async () => {
  await import('./dom-shim.js');
  const { transformOf, viewMap } = await import('../src/ui/svg-gl.js');
  const r = transformOf('rotate(-45 10 20)');
  near(r[0] * 10 + r[2] * 20 + r[4], 10, 1e-9, 'the turn keeps its centre (x)'); near(r[1] * 10 + r[3] * 20 + r[5], 20, 1e-9, 'the turn keeps its centre (y)');
  assert.deepEqual(transformOf('translate(5 6) scale(2)'), [2, 0, 0, 2, 5, 6]);
  assert.deepEqual(viewMap('0 0 100 50', 'none', 200, 200), [2, 4, 0, 0]);
  assert.deepEqual(viewMap('0 0 100 50', null, 200, 200), [2, 2, 0, 50], 'meet, in the middle');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/ui/talk-trace.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /createElementNS/, 'the talk chart builds no SVG');
  assert.match(src, /const sv = svgModel;/);
});

test('a GPU chart reads every look a piece can have: strokes, their widths and strengths too (a comment once swallowed them, 2 Nov)', async () => {
  await import('./dom-shim.js');
  const { LOOK_PROPS, holesOf } = await import('../src/ui/svg-gl.js');
  for (const k of ['fill', 'stroke', 'strokeWidth', 'opacity', 'fillOpacity', 'strokeOpacity', 'strokeDasharray', 'strokeLinecap', 'fontSize', 'fontWeight', 'textAnchor', 'display', 'visibility', 'stopColor'])
    assert.ok(LOOK_PROPS.includes(k), `${k} is read`);
  // (a mask's black boxes, made into strips that never overlap, so each is cut out once)
  const strips = holesOf([[0, 0, 10, 10], [5, 5, 15, 15]]);
  const area = strips.reduce((s, [a, b, c, d]) => s + (c - a) * (d - b), 0);
  assert.equal(area, 175, 'the two boxes less their overlap');
  for (let i = 0; i < strips.length; i++) for (let j = i + 1; j < strips.length; j++) {
    const [a, b, c, d] = strips[i], [e, f, g, h] = strips[j];
    assert.ok(Math.min(c, g) <= Math.max(a, e) || Math.min(d, h) <= Math.max(b, f), 'no two strips overlap');
  }
  // (every slide chart is a model now: none builds SVG for the page to paint)
  const fs = await import('node:fs');
  for (const f of ['talk-trace', 'tool-course', 'tool-curve', 'tool-causes', 'flow-time', 'tool-lumen', 'tool-fluid', 'tool-criteria', 'visual-plane', 'tool-flows', 'tool-profile'])
    assert.doesNotMatch(fs.readFileSync(new URL(`../src/ui/${f}.js`, import.meta.url), 'utf8'), /createElementNS/, `${f}.js builds no SVG`);
});

test('a readout the page sets at its own optical size is drawn from the cut for that size (N1, glyph-data-opsz.js)', async () => {
  const { textWidth, glyphRun, loadGlyphs } = await import('../src/ui/text-gl.js');
  await loadGlyphs();
  const o = { weight: 600, size: 28, tnum: true };
  const plain = textWidth('28.4', o), cut = textWidth('28.4', { ...o, optical: true });
  assert.ok(cut < plain, `opsz 24 is tighter than opsz 14 (${cut} < ${plain})`);
  assert.equal(textWidth('28.4', { ...o, optical: false }), plain, 'the default is unchanged');
  assert.equal(textWidth('28.4', { ...o, size: 12, optical: true }), textWidth('28.4', { ...o, size: 12 }), 'small text stays at opsz 14');
  assert.equal(textWidth('28 mm', { ...o, optical: true }), textWidth('28 mm', o), 'a text with a character not cut stays whole at opsz 14');
  const a = glyphRun('28.4', 0, { ...o, optical: true }).glyphs.map((g) => g[0]).join('|'), b = glyphRun('28.4', 0, o).glyphs.map((g) => g[0]).join('|');
  assert.notEqual(a, b, 'the outlines differ too');
});
