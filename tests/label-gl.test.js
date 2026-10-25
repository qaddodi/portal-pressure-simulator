// The labels drawn on the GPU (label-gl.js): which labels it may draw, when a picture is drawn again, and how stage.js hands
// them over (Mohammad, 25 Oct: "move everything ... to GPU").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { svgOnly, lookKey } from '../src/ui/label-gl.js';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const LGL = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const run = (o = {}) => ({ t: '12.0', dx: 0, font: '500 14px Inter', size: 14, ls: 0, tnum: true, fill: 'rgb(0, 0, 0)', stroke: 'rgba(251, 250, 247, 0.92)', sw: 3, join: 'round', strokeFirst: true, ...o });
const desc = (o = {}) => ({ opacity: 1, filter: '', parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run()] }], ...o });
const ALL = { ls: true, filter: true };

test('a label the browser\'s Canvas 2D cannot draw exactly stays drawn by the SVG', () => {
  assert.equal(svgOnly(desc(), ALL), '');
  assert.equal(svgOnly({ svg: 'focus' }, ALL), 'focus');
  assert.equal(svgOnly(desc({ filter: 'drop-shadow(0px 0px 5px red)' }), { ls: true, filter: false }), 'filter');
  assert.equal(svgOnly(desc({ parts: [{ k: 'rect', x: 0, y: 0, w: 10, h: 10, rx: 5, fill: 'red', stroke: '', sw: 0, filter: 'drop-shadow(0px 1px 1.5px black)' }] }), { ls: true, filter: false }), 'filter');
  assert.equal(svgOnly(desc({ parts: [{ k: 'text', x: 0, y: 0, anchor: 'start', runs: [run({ ls: 1.2 })] }] }), { ls: false, filter: true }), 'letter-spacing');
  assert.equal(svgOnly(desc({ filter: 'drop-shadow(0px 0px 5px red)' }), ALL), '');
});

test('a picture is drawn again when its look changes, never for its opacity alone', () => {
  const a = desc(), b = { ...desc(), opacity: 0.4 };
  assert.equal(lookKey(a, false, 2), lookKey(b, false, 2));
  assert.notEqual(lookKey(a, false, 2), lookKey(desc({ parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run({ t: '12.1' })] }] }), false, 2));
  assert.notEqual(lookKey(a, false, 2), lookKey(a, false, 3), 'a new device pixel ratio');
  assert.notEqual(lookKey(a, false, 2), lookKey(a, true, 2), 'turned');
  assert.notEqual(lookKey(a, false, 2), lookKey(desc({ parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run({ fill: 'rgb(1, 0, 0)' })] }] }), false, 2), 'a colour');
});

test('pictures are laid at whole device pixels, one texel per pixel, never scaled', () => {
  assert.match(LGL, /texelFetch\(uT, q, 0\)/);
  assert.match(LGL, /Math\.round\(s\.x \* dpr\) \+ st\.ox, y = Math\.round\(s\.y \* dpr\) \+ st\.oy/);
  assert.match(LGL, /canvas\.style\.width = `\$\{w \/ k\}px`; canvas\.style\.height = `\$\{h \/ k\}px`;/);
  assert.match(LGL, /TEXTURE_MIN_FILTER, gl\.NEAREST/);
});

test('the SVG copy is see-through only while the GPU draws that label, marked in the frame its picture is drawn', () => {
  assert.match(CSS, /#labels \.lb\[data-gl\] > \* \{ opacity: 0; \}/);
  assert.match(CSS, /\.stage-view > canvas#labelGl \{ pointer-events: none; \}/);
  assert.match(CSS, /\.stage-view\.cam-move > #labelGl/);
  assert.match(CSS, /\.stage-view\.in-lobule #labelGl/);
  assert.match(CSS, /\.cath-on :is\(#labels, #labelGl\)/);
  assert.match(LGL, /if \(st\.mode !== 'gl'\) \{ if \(g\.hasAttribute\('data-gl'\)\) g\.removeAttribute\('data-gl'\); continue; \}\n\s+if \(!g\.hasAttribute\('data-gl'\)\) g\.setAttribute\('data-gl', ''\);/);
  assert.match(LGL, /webglcontextlost[^\n]*removeAttribute\('data-gl'\)/);
});

test('stage.js hands the GPU every label it laid out, in the same frame, and the script fades', () => {
  assert.match(STAGE, /const labelGL = createLabelGL\(labelSvg, gLabels, \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\) \}\);/);
  assert.match(STAGE, /b\.pos = \{ g: b\.g, x: \+it\.x\.toFixed\(1\), y: \+\(it\.rot \? it\.y \+ it\.w : it\.y\)\.toFixed\(1\), rot: !!it\.rot \};/);
  assert.match(STAGE, /labelKey = key; stats\.layouts\+\+; stats\.ms \+= performance\.now\(\) - t0;\n\s+\}\n\s+labelGlSync\(\);/);
  for (const m of STAGE.matchAll(/b\.g\.animate\?\.\(/g)) assert.match(STAGE.slice(m.index, m.index + 260), /labelGL\?\.hold\(b\.g, /, 'a scripted fade is held');
});
