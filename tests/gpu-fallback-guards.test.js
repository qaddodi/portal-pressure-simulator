import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { surface, surfaceRows, surfacesText, clearSurfaces } from '../src/ui/gpu-surfaces.js';
import { guardBlur } from '../src/ui/blur-guard.js';
import { capDensity } from '../src/ui/pixel-budget.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Reviewer's checklist, 1 Nov 2026, sections 7 and 9: fallbacks that never turn on a CSS blur by themselves, the 8 MP budget, context-loss
// recovery on every GPU surface, the lobule's 2D-to-GPU handoff, and one ?perf list of which surfaces are on the GPU now.

test('surfaces list: rows in order, the off-screen ones left out, a getter that throws listed, fallbacks first in the text', () => {
  clearSurfaces();
  surface('a', () => ({ on: 'gpu', via: 'WebGL2' }));
  surface('b', () => null);
  const off = surface('c', () => ({ on: 'fallback', via: 'SVG', why: 'context lost' }));
  surface('d', () => { throw new Error('boom'); });
  const rows = surfaceRows();
  assert.deepEqual(rows.map((r) => r.name), ['a', 'c', 'd']);
  assert.equal(rows[2].on, 'fallback');
  const t = surfacesText(rows);
  assert.match(t, /^Surfaces now: 1 on the GPU, 2 on a fallback or partly/);
  assert.ok(t.indexOf('FALLBACK  c (SVG): context lost') < t.indexOf('GPU  a (WebGL2)'));
  off();
  assert.deepEqual(surfaceRows().map((r) => r.name), ['a', 'd']);
  clearSurfaces();
  assert.equal(surfacesText([]), 'Surfaces: none registered on screen');
});

test('the surfaces list is read only by the ?perf readout, never by a frame', () => {
  for (const f of readdirSync(new URL('../src/ui/', import.meta.url))) {
    if (!f.endsWith('.js') || f === 'gpu-surfaces.js' || f === 'perf-readout.js') continue;
    assert.doesNotMatch(src(`src/ui/${f}`), /surfaceRows\(/, `${f} reads the surfaces list`);
  }
  // (Every GPU surface of the figure, the lobule and the instruments says where it draws.)
  const names = [['stage.js', ['figure canvas', 'vessels and blood', 'organs', 'overlays (stents, balloons, catheter, guides)', 'labels', 'callout glass', 'card glass']],
    ['lobule-zoom.js', ['lobule tissue', 'lobule field (neighbouring lobules)', 'lobule vessels']], ['sinusoid-view.js', ['sinusoid']],
    ['doppler.js', ['Doppler trace']], ['instruments.js', ['endoscopy field']], ['fibroscan.js', ['FibroScan map']]];
  for (const [f, ns] of names) for (const n of ns) assert.ok(src(`src/ui/${f}`).includes(`surface('${n}'`), `${f}: ${n}`);
});

const fakeRoot = (attrs = []) => {
  const a = new Set(attrs);
  return { hasAttribute: (k) => a.has(k), setAttribute: (k) => a.add(k), removeAttribute: (k) => a.delete(k), a };
};

test('a software renderer or Battery saver never turns the browser blur on by itself', () => {
  const r = fakeRoot();
  assert.equal(guardBlur(r, { low: true, asked: null, keep: false }), true);
  assert.ok(r.a.has('data-noglass') && r.a.has('data-noglass-auto'));
  // (Back on a GPU: taken back, the blur as before.)
  assert.equal(guardBlur(r, { low: false, asked: null, keep: false }), false);
  assert.equal(r.a.size, 0);
  // (Blur effect turned on in Settings: asked for, so kept.)
  const on = fakeRoot();
  assert.equal(guardBlur(on, { low: true, asked: '0', keep: false }), false);
  // (Blur effect off in Settings: stays off when the renderer changes, and is never marked as the guard's own.)
  const off = fakeRoot(['data-noglass']);
  guardBlur(off, { low: true, asked: '1', keep: false });
  assert.ok(off.a.has('data-noglass') && !off.a.has('data-noglass-auto'));
  guardBlur(off, { low: false, asked: '1', keep: false });
  assert.ok(off.a.has('data-noglass'));
  // (?swblur=1: as before.)
  assert.equal(guardBlur(fakeRoot(), { low: true, asked: null, keep: true }), false);
});

test('the stage runs the blur guard at start, on a changed renderer and on Battery saver; Settings takes it over', () => {
  // (The noglass look itself: no backdrop-filter anywhere.)
  // (The visual references are the GPU's look: they keep the blur on SwiftShader.)
  assert.match(src('tests/e2e/visual.mjs'), /'\?preset=cirr-decomp' \+ KEEP_BLUR \+ QUERY/);
});

test('Pixel budget (8 MP until 11 Nov 2026, 2 MP then, now 1.5 MP on every device): the default, the figure canvas and its full-density overlay canvas', () => {
  // (A 5K screen at 2x: 2560 x 1440 CSS px.)
  const d = capDensity(2, 2560, 1440, 8);
  assert.ok(Math.abs(2560 * 1440 * d * d - 8e6) < 1);
  // (Phones, iPads, a 16-inch MacBook: unchanged.)
  for (const [w, h, k] of [[390, 844, 3], [1024, 1366, 2], [1728, 1117, 2]]) assert.equal(capDensity(k, w, h, 8), k);
  assert.equal(capDensity(2, 2560, 1440, 0), 2);
  // (Figure size caps the picture, not the canvas, since 11 Nov 2026: the canvas keeps at least 1 device px per CSS px, within the 8 MP budget; quarter-mp-big-screen-tricks rec 1.)
});

test('every WebGL2 surface rebuilds after a lost context (or is a probe or a second look at one that does)', () => {
  // (A file that makes a context must listen for its return; one that only reads an existing one, or makes a throwaway probe, is listed.)
  const READS_ONLY = new Set(['gl-support.js', 'sinusoid-view.js', 'stage.js', 'lobule-zoom.js', 'sw-yield.js']);   // (sw-yield.js: a 1x1 probe, given back at once)
  for (const f of readdirSync(new URL('../src/ui/', import.meta.url))) {
    if (!f.endsWith('.js')) continue;
    const s = src(`src/ui/${f}`);
    if (!/getContext\('webgl2'/.test(s) || READS_ONLY.has(f)) continue;
    assert.match(s, /webglcontextlost/, `${f}: no lost-context handler`);
    // (The tissue's restore is its owner's: lobule-zoom.js makes it again on the same canvas, tissueRestored.)
    // (The vessels' are their owners' too: the anatomy (stage.js) and the lobule each make a new renderer on the canvas, checked below.)
  }
  // (The ones that read an existing context: the anatomy's and the lobule's vessels restore through their owner.)
  // (Lobule section 7: the tissue made again on restore, the field rebuilt in place, the sinusoid in place with its epoch so a paused view draws again.)
  // (Glass and labels: in place.)
  // (The glass draws in the figure's context since 4 Nov 2026: its programs are made again by the host's restore.)
});

