import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// veins-gl.js allocation-free frame path (2 Nov 2026, scripts/frame-alloc.mjs): the vessel layer's draw, the composite, the present,
// the pan and the partial redraw wrote new arrays, strings and closures on every frame (matrix copies, piece lists, strip lists, the
// look joined into a string, a cell mark made for each redraw, the tops copied twice). They write into kept buffers now. The kept forms
// are checked against the allocating ones here, and the frame functions are pinned free of the constructs that made the garbage.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { reuseMap, reuseCovers } = await import('../src/ui/veins-gl.js');
const { splitCells } = await import('../src/ui/veins-bin.js');
const { changedRows } = await import('../src/ui/flow-rows.js');

const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const body = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, `${from} … ${to}`); return src.slice(a, b); };

test('reuseMap and reuseCovers: the kept output is the allocating one', () => {
  const out = new Float64Array(6), then = [1, 0, 0, 1, 0, 0], now = [1.25, 0, 0, 1.25, -125, -100];
  assert.deepEqual(Array.from(reuseMap(then, now, out)), reuseMap(then, now));
  assert.equal(reuseMap(then, now, out), out);
  assert.ok(reuseCovers(out, 1000, 800));
  assert.ok(!reuseCovers(reuseMap(now, then, out), 1000, 800));
  assert.equal(reuseMap(then, [0, 0, 0, 0, 0, 0], out), null);
});

test('splitCells into a kept record equals the plain form, and keeps its lists between calls', () => {
  const nCells = 40, cells = new Float32Array(nCells * 6).map((_, i) => i + 1);
  const simple = new Uint8Array(nCells).map((_, c) => (c % 4 === 1 ? 1 : 0));
  const out = { gen: new Float32Array(0), one: new Float32Array(0), nGen: 0, nOne: 0 };
  for (const mark of [null, new Uint8Array(nCells).map((_, c) => (c % 3 === 0 ? 1 : 0)), new Uint8Array(nCells).fill(1), new Uint8Array(nCells)]) {
    const want = splitCells(cells, nCells, simple, mark);
    const got = splitCells(cells, nCells, simple, mark, out);
    assert.equal(got, out, 'the kept record is returned');
    assert.equal(got.nGen, want.nGen);
    assert.equal(got.nOne, want.nOne);
    assert.deepEqual(Array.from(got.gen.subarray(0, got.nGen * 6)), Array.from(want.gen));
    assert.deepEqual(Array.from(got.one.subarray(0, got.nOne * 6)), Array.from(want.one));
  }
  const gen0 = out.gen, one0 = out.one;
  splitCells(cells, nCells, simple, new Uint8Array(nCells).map((_, c) => (c % 5 === 0 ? 1 : 0)), out);
  assert.equal(out.gen, gen0, 'fewer cells: the list is kept');
  assert.equal(out.one, one0);
});

test('changedRows writes the span into a kept pair', () => {
  const data = new Float32Array(10 * 4), last = new Float32Array(10 * 4), pair = [-1, -1];
  data[9] = 1; data[22] = 2;
  const span = changedRows(data, last, 4, 10, pair);
  assert.equal(span, pair);
  assert.deepEqual(pair, [2, 5]);
  assert.deepEqual(Array.from(last), Array.from(data), 'the span is copied into last');
  assert.equal(changedRows(data, last, 4, 10, pair), null);
  data[0] = 7;
  assert.deepEqual(changedRows(data, last, 4, 10), [0, 0], 'without a pair a new one');
});

test('the vessel layer\'s frame functions make no array, string or closure of their own', () => {
  // (The calls that made them before: copies of the matrix, lists of pieces and strips, the look as a JSON string, the tops copied, the
  // rows spread, a cell mark made for each redraw, rest arguments, and the closures handed to eachPiece.)
  const frame = [
    body('  function eachPiece(', '  // The layer for the view m'),
    body('  function layoutFor(m) {', '  // Lays the layer out as layoutFor gave it'),
    body('  function shiftLayer(', '  // The binned cells on the CPU'),
    body('  function rowParts(rows) {', '  // The marked cells\' quads'),
    body('  function cellsOfRows(', '  // The vessel pass into the bound vessel framebuffer'),
    body('  function vesselPass(', '  // A one-pass build ready to draw'),
    body('  function runTops() {', '  // The under picture'),
    body('    draw(m, look, blood, rows = null) {', '    /**\n     * Redraws only the cells that list the vessel rows given'),
    body('    drawRows(m, look, blood, rows, full = false) {', '    /**\n     * Pinch frame reuse'),
    body('    composite(look, blood = NOBLOOD, full = false, part = 0) {', '    /** Whether organ outlines can be drawn here'),
  ].join('\n');
  const code = frame.replace(/\/\/.*$/gm, '');
  for (const [what, re] of [
    ['the matrix copied', /\bm\.slice\(/], ['the tops copied', /tops\.slice\(/], ['the look as text', /JSON\.stringify/],
    ['the radii rows spread', /\[\.\.\.radRows\]/], ['a cell mark made', /new Uint8Array\(nCells\)\b(?![\s\S]{0,20}patchMark)/],
    ['a window rectangle made', /windowRect\(/], ['a piece list made', /wrapPieces\(/], ['a closure for a pass', /eachPiece\([^)]*=>/],
    ['a string of the picture counts', /`\$\{pictureSeq\}/],
  ]) assert.doesNotMatch(code.replace(/gpuProbe\.(note|gauge)\([^\n]*\n/g, ''), re, what);
  // (cellsOfRows: the cell mark made again only when the cells' count outgrows it.)
  assert.match(body('  function cellsOfRows(', '  // The vessel pass into the bound vessel framebuffer'), /if \(!into\.mark \|\| into\.mark\.length < nCells\) into\.mark = new Uint8Array\(nCells\);/);
});

test('the wrapper around the renderer\'s steps takes its arguments by name, with no rest list', () => {
  const w = body('    api[k] = function (', '  return api;');
  assert.match(w, /api\[k\] = function \(a0, a1, a2, a3, a4\) \{\n\s+if \(!gpuProbe\.on\) return f\.call\(this, a0, a1, a2, a3, a4\);/);
  assert.doesNotMatch(w.split('return probed(')[0], /\.\.\.a|\.apply\(/);
});
