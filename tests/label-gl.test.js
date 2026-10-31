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
  assert.match(STAGE, /const labelGL = createLabelGL\(labelSvg, gLabels, \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), marks: \[gLeaders, gScan\], host: labelHost, force: !!labelHost \}\);/);
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
  assert.match(STAGE, /marks: \[gLeaders, gScan\], host: labelHost, force: !!labelHost \}\);/);
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

test('atlas packer: padded slots never overlap, freed slots are reused, pages are capped', async () => {
  const { createAtlasPacker } = await import('../src/ui/atlas-pack.js');
  const pk = createAtlasPacker({ size: 128, pad: 2, maxPages: 2 });
  const slots = [];
  for (let i = 0; i < 20; i++) { const s = pk.alloc(20 + (i % 5) * 3, 10 + (i % 3) * 4); if (s) slots.push(s); }
  assert.ok(slots.length > 4);
  for (const s of slots) {
    assert.ok(s.x >= 2 && s.y >= 2 && s.x + s.w + 2 <= 128 && s.y + s.h + 2 <= 128, 'inside its page with the gutter');
  }
  const gutter = (s) => ({ l: s.x - 2, t: s.y - 2, r: s.x + s.w + 2, b: s.y + s.h + 2, page: s.page });
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    const a = gutter(slots[i]), b = gutter(slots[j]);
    if (a.page !== b.page) continue;
    assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `padded boxes ${i} and ${j} do not touch`);
  }
  assert.equal(pk.alloc(200, 10), null, 'wider than a page');
  const big = createAtlasPacker({ size: 64, pad: 2, maxPages: 2 });
  const held = [];
  for (let s; (s = big.alloc(28, 28)); ) held.push(s);
  assert.equal(big.pages, 2, 'never more than maxPages');
  assert.equal(big.bytes, 2 * 64 * 64 * 4);
  const where = `${held[3].page}:${held[3].x}:${held[3].y}`;
  big.free(held[3]);
  const again = big.alloc(28, 28);
  assert.equal(`${again.page}:${again.x}:${again.y}`, where, 'a freed slot is found again');
  big.free(again); big.free(held[0]);
  assert.ok(big.used < held.length * 32 * 32);
  big.reset();
  assert.equal(big.pages, 0);
});

test('batches split only where the page changes, keeping painter order', async () => {
  const { batchRuns } = await import('../src/ui/atlas-pack.js');
  assert.deepEqual(batchRuns([]), []);
  assert.deepEqual(batchRuns([{ page: 0 }, { page: 0 }, { page: 1 }, { page: 0 }]), [{ page: 0, from: 0, to: 2 }, { page: 1, from: 2, to: 3 }, { page: 0, from: 3, to: 4 }]);
});

test('labels draw as one instanced batch from the atlas, texel for texel', () => {
  assert.match(LGL, /drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, run\.to - run\.from\)/);
  assert.match(LGL, /texelFetch\(uT, q, 0\) \* vT\.z/);
  assert.match(LGL, /gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, st\.slot\.x, st\.slot\.y/);
  assert.match(LGL, /for \(const run of batchRuns\(items\)\)/);
  assert.match(LGL, /maxPages: 2/);
});

test('with the overlays on the GPU the labels go into the vessel canvas, only while nothing lies between the two', () => {
  const VG = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // (At the end of each picture laid; a snapshot is the figure alone, then laid again whole as it shows.)
  assert.match(VG, /function present\(top = true\) \{/);
  assert.match(VG, /if \(top && onTop\) \{\n\s+try \{ onTop\(\); \}/);
  assert.match(VG, /snapshot\(\) \{ present\(false\); const url = canvas\.toDataURL\('image\/png'\); if \(onTop\) present\(\); return url; \}/);
  assert.match(STAGE, /const labelHost = OVER_ON && veins\?\.top && !\/\[\?&\]labelhost=0\\b\/\.test\(location\.search\) \? \{/);
  assert.match(STAGE, /if \(labelHold \|\| !veins \|\| veins\.lost \|\| !svgOver\?\.classList\.contains\(OVER_ALL\) \|\| !glass\.hidden \|\| fading\(vCanvas\)\) return false;/);
  assert.match(STAGE, /wc\.contains\('cam-move'\) \|\| wc\.contains\('pinch-hide'\) \|\| wc\.contains\('unframed'\) \|\| wc\.contains\('in-lobule'\) \|\| wc\.contains\('cath-on'\)\) return false;/);
  assert.match(STAGE, /if \(vdpr < vBase - 1e-9 \|\| vCanvas\.style\.translate \|\| !\(boxW > 0\) \|\| Math\.abs\(vCanvas\.width \/ boxW - \(devicePixelRatio \|\| 1\)\) > 0\.02\) return false;/);
  assert.match(STAGE, /\+lc\.opacity >= 0\.999 && vc\.visibility === 'visible' && \+vc\.opacity >= 0\.999;/);
  assert.match(STAGE, /veins\.top\.set\(\(\) => labelGL\.drawInto\(\)\);/);
  for (const t of ['wrap, { attributes: true, attributeFilter: \\[\'class\'\\] }', 'glass, { attributes: true, attributeFilter: \\[\'hidden\'\\] }', 'vCanvas, { attributes: true, attributeFilter: \\[\'style\', \'width\', \'height\'\\] }']) assert.match(STAGE, new RegExp(`labelMo\\.observe\\(${t}\\);`));
  // (Given back to the SVG in the same task as the picture is laid without them; none laid again while they stay there.)
  assert.match(LGL, /if \(!released\) \{ if \(!host\.active\(\)\) \{ host\.now\(\); if \(!released\) release\(\); \} return; \}/);
  assert.match(LGL, /if \(host\) \{ if \(released && !host\.active\(\)\) return; owed = true; host\.ask\(\); return; \}/);
  assert.match(LGL, /let owed = false, released = true;/);
  assert.match(LGL, /if \(!host\.active\(\)\) \{ if \(!released\) release\(\); return; \}/);
  // (The host's GL state as its own passes expect to find it.)
  assert.match(LGL, /if \(host\) \{\n\s+gl\.disable\(gl\.BLEND\); gl\.bindVertexArray\(null\); gl\.useProgram\(null\);/);
});
