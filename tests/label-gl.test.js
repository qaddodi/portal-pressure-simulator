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
  assert.match(LGL, /webglcontextlost[\s\S]{0,200}for \(const s of last\) s\.g\.removeAttribute\('data-gl'\);/);
});

test('stage.js hands the GPU every label it laid out, in the same frame, and the script fades', () => {
  assert.match(STAGE, /const labelGL = createLabelGL\(labelSvg, gLabels, \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), marks: \[gLeaders, gScan\] \}\);/);
  assert.match(STAGE, /b\.pos = \{ g: b\.g, x: \+it\.x\.toFixed\(1\), y: \+\(it\.rot \? it\.y \+ it\.w : it\.y\)\.toFixed\(1\), rot: !!it\.rot \};/);
  assert.match(STAGE, /dprobePaint\(\);\n\s+labelPainted = true;\n\s+labelGlSync\(\);/, 'last, after the probe is placed');
  for (const m of STAGE.matchAll(/b\.g\.animate\?\.\(/g)) assert.match(STAGE.slice(m.index, m.index + 260), /labelGL\?\.hold\(b\.g, /, 'a scripted fade is held');
});

test('leaders and dots: straight leaders and circles are drawn on the GPU, anything else stays SVG', async () => {
  const { lineOf, describeMark, rgba } = await import('../src/ui/label-gl.js');
  assert.deepEqual(lineOf('M12.5 30.0 L80.2 -4.5'), [12.5, 30, 80.2, -4.5]);
  assert.equal(lineOf('M0 0 L1 1 L2 2'), null);
  assert.equal(lineOf('M0 0 C1 1 2 2 3 3'), null);
  assert.deepEqual(rgba('rgba(200, 212, 240, 0.5)').map((v) => +v.toFixed(3)), [0.392, 0.416, 0.471, 0.5]);
  assert.deepEqual(rgba('rgb(255, 0, 0)'), [1, 0, 0, 1]);
  const el = (tagName) => ({ tagName });
  const cs = (o) => () => ({ display: 'inline', opacity: '1', stroke: 'rgb(0, 0, 0)', strokeWidth: '1px', fill: 'none', strokeDasharray: 'none', strokeDashoffset: '0px', strokeLinecap: 'butt', ...o });
  assert.deepEqual(describeMark(el('path'), cs({ strokeDasharray: '3px, 3px' })).dash, [3, 3]);
  assert.equal(describeMark(el('path'), cs({ strokeLinecap: 'round' })), false, 'a round cap stays SVG');
  assert.equal(describeMark(el('path'), cs({ strokeDasharray: '3px, 3px, 1px' })), false);
  assert.equal(describeMark(el('rect'), cs({})), false);
  assert.equal(describeMark(el('circle'), cs({ display: 'none' })), null);
  assert.ok(describeMark(el('circle'), cs({ fill: 'rgb(10, 10, 10)' })).fill);
});

test('the leaders\' and the FibroScan callout\'s layers go to the GPU with the labels, their SVG copies hidden but still fading', () => {
  assert.match(STAGE, /marks: \[gLeaders, gScan\] \}\);/);
  assert.match(CSS, /#labels :is\(\.lb-leaders, \.lb-scan\) > \[data-gl\] \{ visibility: hidden; \}/);
  assert.match(STAGE, /el\.animate\?\.\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 350, delay: wait, easing: 'ease-out', fill: 'backwards' \}\); labelGL\?\.hold\(el, wait \+ 350\); \}/);
  assert.match(LGL, /float span\(float x, float a, float b\)/);
});

test('the Doppler probe is drawn on the GPU under the leaders, its SVG kept as the model and hidden while drawn', () => {
  assert.match(STAGE, /labelSvg\.before\(el\); dpr\.el = el; void el\.offsetWidth;\n\s+labelGL\?\.setProbe\(el\);/);
  assert.match(STAGE, /dprShape\(\); {3}\/\/ \(and the next frame, while it is still easing\)\n\s+labelGL\?\.redraw\(\);/, 'each frame of its ease drawn in that frame');
  assert.match(CSS, /\.dop-probe\[data-gl\] \.dpr-svg \{ visibility: hidden; \}/);
  assert.match(LGL, /let moving = drawProbe\(now\);\n\s+moving = drawMarks\(now\) \|\| moving;/, 'the probe under the leaders and labels, as it lay under their SVG');
  // Its marks in PROBE_SVG's order: beam, rim under line, axis, then the bars on top, then the head.
  const order = ['for (const q of beam) seg(q, L.rimL);', 'for (const q of beam) seg(q, L.line);', 'for (const q of axis) seg(q, L.rimL);', 'for (const q of axis) seg(q, L.line);', 'for (const q of bars) seg(q, L.gateRim);', 'for (const q of bars) seg(q, L.gate);', "querySelector('.dpr-head')?.getAttribute('transform')"].map((k) => LGL.indexOf(k));
  assert.ok(order.every((v, i) => v > 0 && (!i || v > order[i - 1])), order.join());
});

test('the FibroScan probe is drawn on the GPU over the labels, its SVGs kept as the model and hidden while drawn', () => {
  assert.match(STAGE, /scan\.el = el; scan\.deg = 45;\n\s+labelGL\?\.setScan\(el\);/);
  assert.match(STAGE, /labelGL\?\.redraw\(\); {3}\/\/ \(the waves moved/, 'each frame of its waves drawn in that frame');
  assert.match(STAGE, /el\.remove\(\); if \(!scan\.el\) labelGL\?\.setScan\(null\);/, 'gone from the GPU layer when its element goes');
  assert.match(CSS, /\.scan-probe\[data-gl\] > svg \{ visibility: hidden; \}/);
  assert.match(LGL, /dirty\.clear\(\);\n\s+moving = drawScan\(now\) \|\| moving;/, 'over the labels, as its layer lay');
  assert.match(LGL, /!canvasCaps\(\)\.filter\) \{ if \(scanEl\.hasAttribute\('data-gl'\)\) scanEl\.removeAttribute\('data-gl'\)/, 'no canvas filter: the SVG keeps the probe');
  // The waves' writes ask for a frame, not a new look (they are read as it draws).
  assert.match(LGL, /!r\.target\.closest\?\.\('\.sp-waves'\)/);
});

test('the scan paint uses the cached stage box, not a fresh layout', () => {
  assert.match(STAGE, /const tip = scanTipLocal\(\), wr = stageBox\(\);/);
});
