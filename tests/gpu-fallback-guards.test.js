import { stageSource } from './stage-src.js';
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
  const pr = src('src/ui/perf-readout.js');
  assert.match(pr, /setInterval\(\(\) => \{ if \(!cur && !folded && !document\.hidden\) restPass\(writeSurf\); \}, 500\);/);
  assert.match(pr, /cur\.paths = surfaceRows\(\);/);
  // (Every GPU surface of the figure, the lobule and the instruments says where it draws.)
  const names = [['stage.js', ['figure canvas', 'vessels and blood', 'organs', 'overlays (stents, balloons, catheter, guides)', 'labels', 'callout glass', 'liver label pane glass', 'card glass']],
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
  const st = stageSource();
  assert.match(st, /guardBlur\(document\.documentElement, \{ low: SOFTWARE, asked: asked === '1' \? null : asked \}\)/);
  assert.match(st, /wrap\.dataset\.renderer = SOFTWARE \? 'software' : 'gpu'; wrap\.dataset\.quality = String\(quality\);\n\s*blurGuard\(\);/);
  assert.match(st, /saverOn = !!on;\n\s*blurGuard\(\);/);
  assert.match(src('src/ui/main.js'), /toggleAttribute\('data-noglass', !on\);\n\s*document\.documentElement\.removeAttribute\('data-noglass-auto'\);/);
  // (The noglass look itself: no backdrop-filter anywhere.)
  assert.match(src('styles/app.css'), /:root\[data-noglass\] \*, :root\[data-noglass\] \*::before, :root\[data-noglass\] \*::after \{ -webkit-backdrop-filter: none !important; backdrop-filter: none !important; \}/);
  // (The visual references are the GPU's look: they keep the blur on SwiftShader.)
  assert.match(src('tests/e2e/visual.mjs'), /'\?preset=cirr-decomp' \+ KEEP_BLUR \+ QUERY/);
});

test('8 MP pixel budget: the default, the figure canvas and its full-density overlay canvas', () => {
  assert.match(src('src/ui/frame.js'), /const figOpts = \{ move: 1, glow: 1, cap: 8,/);
  // (A 5K screen at 2x: 2560 x 1440 CSS px.)
  const d = capDensity(2, 2560, 1440, 8);
  assert.ok(Math.abs(2560 * 1440 * d * d - 8e6) < 1);
  // (Phones, iPads, a 16-inch MacBook: unchanged.)
  for (const [w, h, k] of [[390, 844, 3], [1024, 1366, 2], [1728, 1117, 2]]) assert.equal(capDensity(k, w, h, 8), k);
  assert.equal(capDensity(2, 2560, 1440, 0), 2);
  const st = stageSource();
  assert.match(st, /full = capDensity\(full, r\.width, r\.height, figOpt\('cap'\)\);/);
  assert.match(st, /const cap = figOpt\('cap'\) \* 1e6, px = w \* h \* \(base \* k\) \*\* 2;\n\s*if \(cap > 0 && px > cap\) k \*= Math\.sqrt\(cap \/ px\);/);
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
    const OWNER = { 'tissue-gl.js': ['lobule-zoom.js', /onFigureBack/], 'veins-gl.js': ['stage.js', /veins = createVeinsGL\(vCanvas, \{ tubes: GL_ROWS, force: true, onPlate: \(\) => \{ plateDirty = true; \} \}\);/] };
    if (OWNER[f]) assert.match(src(`src/ui/${OWNER[f][0]}`), OWNER[f][1], `${f}: no restore by its owner`);
    else assert.match(s, /webglcontextrestored/, `${f}: no restore`);
  }
  // (The ones that read an existing context: the anatomy's and the lobule's vessels restore through their owner.)
  assert.match(stageSource(), /vCanvas\.addEventListener\('webglcontextrestored'/);
  // (Lobule section 7: the tissue made again on restore, the field rebuilt in place, the sinusoid in place with its epoch so a paused view draws again.)
  const lz = src('src/ui/lobule-zoom.js');
  assert.match(src('src/ui/field-gl.js'), /addEventListener\('webglcontextrestored', \(\) => \{\n\s*if \(dead\) return;\n\s*texs\.clear\(\);\n\s*try \{ build\(\); \}/);
  assert.match(src('src/ui/sinusoid-gl.js'), /addEventListener\('webglcontextrestored', \(\) => \{ epoch\+\+; tgt = null; sent\.clear\(\); ok = null; skipped = true; startLater\(\); \}\);/);
  assert.match(src('src/ui/sinusoid-view.js'), /gpu\.epoch/);
  // (Glass and labels: in place.)
  // (The glass draws in the figure's context since 4 Nov 2026: its programs are made again by the host's restore.)
  assert.match(src('src/ui/label-gl.js'), /canvas\.addEventListener\('webglcontextrestored', \(\) => \{\n\s+if \(disposed\) return;/);
});

test('idle rest: the FibroScan probe\'s waves stop with the figure and start again on waking', () => {
  const st = stageSource();
  assert.match(st, /if \((?:live\.)?restStill\(\)\) \{ scan\.last = 0; scan\.parked = true; return; \}/);
  assert.match(st, /if \(!on && scan\.parked\) \{ scan\.parked = false; if \(scan\.on && !scan\.raf\) \{ scan\.last = 0; scan\.raf = nextFrame\(scanTick\); \} \}/);
  // (The other loops of the figure's marks stop by themselves once nothing eases: the halos, the Doppler probe's ease and its card tracking.)
  assert.match(st, /glow\.raf = moving \? nextFrame\(glowStep\) : 0;/);
  assert.match(st, /dpr\.track = dprTrackQuiet <= 6;/);
  assert.match(st, /if \(done\) \{ dpr\.eAt = 0; if \(!dpr\.on\) dpr\.leaving = false; return; \}/);   // (a probe that has drawn back to go, or settled in its place, stops its loop)
});
