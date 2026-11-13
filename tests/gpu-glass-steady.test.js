import { stageSource } from './stage-src.js';
// The frosted glass drawn in the figure's canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"): the causes of the iPhone's
// sheet, card, callout and (since gone) lobule pill flicker found by watching the glass frame by frame in a browser, each pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheetPanes } from '../src/ui/sheet-glass.js';
import { parseColour } from '../src/ui/glass-gl.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const GLASS = read('../src/ui/glass-gl.js'), LABELS = read('../src/ui/label-gl.js'), STAGE = stageSource(), CSS = read('../styles/app.css');
const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });

test('a colour mixed by color-mix() (the cards\' tint), as the canvas gives it back, is read as that colour, not as none', () => {
  assert.deepEqual(parseColour('color(srgb 1 0.5 0.25 / 0.58)'), [1, 0.5, 0.25, 0.58]);
  assert.deepEqual(parseColour('color(srgb 0.1 0.2 0.3)'), [0.1, 0.2, 0.3, 1]);
  assert.deepEqual(parseColour('color(srgb 0.1 0.2 0.3 / 50%)'), [0.1, 0.2, 0.3, 0.5]);
  assert.deepEqual(parseColour('rgba(255, 0, 0, 0.5)'), [1, 0, 0, 0.5]);
  assert.deepEqual(parseColour('#00ff00'), [0, 1, 0, 1]);
  assert.deepEqual(parseColour('color(display-p3 1 0 0)'), [0, 0, 0, 0]);
});

test('the sheet\'s tint comes from its CSS custom property, which the GPU\'s mark ([data-gl]) leaves alone', () => {
  // (Their computed background is none while the GPU draws their glass: read from there, the next look found no tint and gave the glass
  // back to the browser's, then found it again, every other frame.)
  const pe = (o) => ({ content: '""', display: 'block', visibility: 'visible', opacity: '1', left: '0px', top: '0px', right: '0px', bottom: '0px', borderTopLeftRadius: '18px', borderTopRightRadius: '18px', borderBottomRightRadius: '18px', borderBottomLeftRadius: '18px', backgroundColor: 'rgba(0, 0, 0, 0)', getPropertyValue: (k) => (k === '--gl-tint' ? 'rgba(250, 250, 250, 0.58)' : ''), ...o });
  const el = { classList: { contains: (c) => c === 'pz-sheet' }, closest: () => ({}), getBoundingClientRect: () => box(10, 100, 300, 200), ps: { '::before': pe({ bottom: '40px' }), '::after': pe({ top: '120px' }) } };
  const gcs = (e, p) => (p ? e.ps[p] : { borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', getPropertyValue: () => '0' });
  for (const pane of sheetPanes(el, gcs)) assert.equal(pane.tint, 'rgba(250, 250, 250, 0.58)');
  assert.match(CSS, /pz-sheet::after \{ content: ''; --gl-tint: var\(--glass-tint\);/);
  assert.match(CSS, /:root, \.stage-wrap\.cmap \{ --glass-tint: color-mix\(in srgb, var\(--surface\) var\(--pz-frost, 66%\), transparent\); \}/, 'the one glass tint: the surface at --pz-frost');
});

test('only the part of a glass on the screen counts against the canvas\'s edge; every glass decides alone, at rest', () => {
  assert.match(GLASS, /const inside = \(p, cr, vw, vh\) => \{\n\s+const l = Math\.max\(p\.r\.left, 0\), t = Math\.max\(p\.r\.top, 0\), r = Math\.min\(p\.r\.right, vw\), b = Math\.min\(p\.r\.bottom, vh\);/);
  assert.doesNotMatch(GLASS, /dropHost\(true\); return undefined; \}\n\s+else if \(crosses\(panes, host\.over\?\.\(\)\)\)/);
  assert.match(GLASS, /else if \(nowT - s\.moved < 250\) s\.since = 0;/);
  assert.match(GLASS, /else if \(nowT - s\.since >= 400\) \{ s\.out = want; s\.since = 0; \}/);
});

test('the stage labels are a pass of the figure\'s present under every glass: no hole is cut, none is told to them', () => {
  assert.match(GLASS, /hf = hfSet;\n\s+hf\.panes = panes; hf\.cr = cr; hf\.base = [^\n]+\n\s+tellHoles\(panes\);/);   // (the lobule's layers still take the list)
  assert.doesNotMatch(LABELS, /cutHoles|setHoles|holeMask/);
  assert.match(STAGE, /onHoles: frostHoles\('callouts'\)/);
  assert.match(STAGE, /onHoles: frostHoles\(key\)/);
  assert.doesNotMatch(STAGE, /labelHoles|(?:live\.)?labelGL\.holes/);
  assert.match(STAGE, /const LABELS_ORDER = -6;/);
  assert.match(STAGE, /(?:live\.)?veins\.top\.add\(\{ order: LABELS_ORDER, prep: \(\) => \{ if \(!gpuProbe\.skipLabels\) (?:live\.)?labelGL\?\.drawInto\(\); \}, draw: \(\) => \{\} \}\)/, 'laid before any glass takes its blur');
  assert.match(STAGE, /function hostFrost\(g, o\) \{ if \(!g \|\| !(?:live\.)?veins\?\.top\) return;/);
});
