// The labels drawn on the GPU (label-gl.js): which labels it may draw, when a picture is drawn again, and how stage.js hands
// them over (Mohammad, 25 Oct: "move everything ... to GPU").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { svgOnly, lookKey, layBlock, blockOps, shadowsOf, ringBox, rgba } from '../src/ui/label-gl.js';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const LGL = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
// (The same copy of the GPU text module label-gl.js uses, by its stamped name, with Inter's outlines loaded as the page loads them.)
const TEXT_SPEC = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8').match(/from '\.\/(text-gl\.js\?v=[0-9a-f]+)'/)[1];
const TEXT = await import(`../src/ui/${TEXT_SPEC}`);
await TEXT.loadGlyphs();
const run = (o = {}) => ({ t: '12.0', dx: 0, font: '500 14px Inter', size: 14, wt: 500, it: false, fam: 'Inter, system-ui, sans-serif', ls: 0, tnum: true, fill: 'rgb(0, 0, 0)', stroke: 'rgba(251, 250, 247, 0.92)', sw: 3, join: 'round', strokeFirst: true, ...o });
const desc = (o = {}) => ({ opacity: 1, filter: '', parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run()] }], ...o });

test('a label the GPU cannot draw exactly stays drawn by the SVG; every other is filled from Inter\'s outlines', () => {
  assert.equal(svgOnly(desc()), '');
  assert.equal(svgOnly({ svg: 'focus' }), 'focus');
  // (A rect's drop shadows are the GPU's (shadowBox); any other filter, or one on the whole label, is the SVG's.)
  const rect = (filter) => desc({ parts: [{ k: 'rect', x: 0, y: 0, w: 10, h: 10, rx: 5, fill: 'rgb(255, 0, 0)', stroke: '', sw: 0, filter }] });
  assert.equal(svgOnly(rect('drop-shadow(rgba(0, 0, 0, 0.1) 0px 1px 1.5px)')), '');
  assert.equal(svgOnly(rect('blur(2px)')), 'filter');
  assert.equal(svgOnly(rect('drop-shadow(red 0px 0px 5px) blur(1px)')), 'filter');
  assert.equal(svgOnly(desc({ filter: 'drop-shadow(0px 0px 5px red)' })), 'filter');
  const text = (o) => desc({ parts: [{ k: 'text', x: 0, y: 0, anchor: 'start', runs: [run(o)] }] });
  assert.equal(svgOnly(text({ ls: 1.2 })), '', 'letter spacing is the GPU text\'s');
  assert.equal(svgOnly(text({ it: true })), '', 'a slant too');
  assert.equal(svgOnly(text({ fill: 'color(srgb 0.5 0.5 0.5 / 0.8)' })), '', 'a colour-mix() colour');
  assert.equal(svgOnly(text({ fam: 'Georgia, serif' })), 'font');
  assert.equal(svgOnly(text({ t: '12 ✕' })), 'glyph', 'a character whose outline is not here');
  assert.equal(svgOnly(text({ fill: 'lab(50% 20 30)' })), 'colour');
  assert.equal(svgOnly(desc(), false), 'glyphs', 'till the outlines have come');
});

test('drop shadows are read in whatever order the browser writes them', () => {
  assert.deepEqual(shadowsOf('drop-shadow(rgba(0, 0, 0, 0.1) 0px 1px 1.5px)'), [{ x: 0, y: 1, blur: 1.5, color: 'rgba(0, 0, 0, 0.1)' }]);
  assert.deepEqual(shadowsOf('drop-shadow(0px 1px 2px color(srgb 0 0 0 / 0.25))'), [{ x: 0, y: 1, blur: 2, color: 'color(srgb 0 0 0 / 0.25)' }]);
  assert.deepEqual(shadowsOf('drop-shadow(red 1px 2px) drop-shadow(blue 0px 0px 3px)'), [{ x: 1, y: 2, blur: 0, color: 'red' }, { x: 0, y: 0, blur: 3, color: 'blue' }]);
  assert.equal(shadowsOf('blur(2px)'), null);
  assert.equal(shadowsOf(''), null);
  // (Their colours as the browser computes them: rgb()/rgba(), and color(srgb …) for a color-mix().)
  assert.deepEqual(rgba('color(srgb 0 0 0 / 0.25)'), [0, 0, 0, 0.25]);
  assert.deepEqual(rgba('rgba(255, 0, 0, 0.5)'), [0.5, 0, 0, 0.5]);
});

test('a keyboard focus\'s ring and a rect\'s drop shadow are GPU shapes, never pixels in the picture; ?labelfx=0 hands both to the SVG', () => {
  assert.match(LGL, /if \(focused && !GPU_FOCUS\) return \{ svg: 'focus' \};/);
  assert.match(LGL, /d\.ring = \{ w, color: gs\.outlineColor, off: NUM\(gs\.outlineOffset\), box: b\.map/);
  // (A focus, or its colour easing in, sends no picture: the ring is not in the look key.)
  assert.equal(lookKey(desc(), false, 2), lookKey({ ...desc(), ring: { w: 2, color: 'blue', off: 3, box: [0, 0, 10, 10] } }, false, 2));
  const r = ringBox({ ring: { w: 2, color: 'rgb(0, 0, 255)', off: 3, box: [0, 0, 10, 10] } }, 2, [-10, -10, 30, false]);
  assert.deepEqual([r.x0, r.y0, r.x1, r.y1, r.w], [2, 2, 38, 38, 4]);
  assert.deepEqual(r.col, [0, 0, 1, 1]);
  // The shadow is handed back with the picture, in its device px, its colour taking the rect's own opacity; nothing drawn through a filter.
  const at = layBlock(desc({ parts: [{ k: 'rect', x: 0, y: 0, w: 20, h: 10, rx: 5, fill: 'rgba(255, 255, 255, 0.5)', stroke: '', sw: 0, filter: 'drop-shadow(rgba(0, 0, 0, 0.2) 0px 1px 2px)' }] }), 2);
  assert.equal(at.shadows.length, 1);
  const sh = at.shadows[0];
  assert.deepEqual([sh.cx, sh.cy, sh.hw, sh.hh, sh.r, sh.sig], [20 - at.ox, 12 - at.oy, 20, 10, 10, 4]);
  assert.ok(Math.abs(sh.col[3] - 0.1) < 1e-9);
  assert.ok(blockOps(desc({ parts: [{ k: 'rect', x: 0, y: 0, w: 20, h: 10, rx: 5, fill: 'rgba(255, 255, 255, 0.5)', stroke: '', sw: 0, filter: 'drop-shadow(rgba(0, 0, 0, 0.2) 0px 1px 2px)' }] }), at).every((op) => op.kind === 'fill'), 'the rect alone, no shadow, in the picture');
  const block = LGL.slice(LGL.indexOf('export function layBlock('), LGL.indexOf('export function ringBox('));
  assert.doesNotMatch(block, /\.filter = |shadowBlur|createElement|getContext|measureText/);
  assert.doesNotMatch(LGL, /drawShadowed/);
  assert.match(LGL, /uKind == 8/); assert.match(LGL, /uKind == 9/);
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
  assert.match(LGL, /if \(st\.mode !== 'gl'\) \{ if \(g\.hasAttribute\('data-gl'\)\) g\.removeAttribute\('data-gl'\); if \(st\.mode === 'svg'\) svgLeft\.add\(g\); continue; \}\n\s+if \(!g\.hasAttribute\('data-gl'\)\) g\.setAttribute\('data-gl', ''\);/);
  assert.match(LGL, /webglcontextlost[\s\S]{0,200}for \(const s of last\) s\.g\.removeAttribute\('data-gl'\);/);
});

test('stage.js hands the GPU every label it laid out, in the same frame, and the script fades', () => {
  assert.match(STAGE, /const labelGL = createLabelGL\(labelSvg, gLabels, \{ software: SOFTWARE, off: \/\[\?&\]gpulabels=0\\b\/\.test\(location\.search\), marks: \[gLeaders, gScan\], onBoxes: frostWake \}\);/);
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
  assert.match(STAGE, /marks: \[gLeaders, gScan\], onBoxes: frostWake \}\);/);
  assert.match(CSS, /#labels :is\(\.lb-leaders, \.lb-scan\) > \[data-gl\] \{ visibility: hidden; \}/);
  assert.match(STAGE, /el\.animate\?\.\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: D_SURFACE, delay: wait, easing: EASE_ARRIVE, fill: 'backwards' \}\); labelGL\?\.hold\(el, wait \+ D_SURFACE\); \}/);
  assert.match(LGL, /float span\(float x, float a, float b\)/);
});

test('the Doppler probe is drawn on the GPU under the leaders, its SVG kept as the model and hidden while drawn', () => {
  assert.match(STAGE, /labelSvg\.before\(el\); dpr\.el = el;\n\s+labelGL\?\.setProbe\(el\);/);
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
  assert.match(LGL, /if \(!L \|\| !\(BEAM_GL && L\.beam\.stops\.length === 2 && beamSector\(L\.beam\)\)\) \{ if \(scanEl\.hasAttribute\('data-gl'\)\) scanEl\.removeAttribute\('data-gl'\)/, 'a beam the shader cannot draw: the SVG keeps the probe');
  // (No 2D canvas for the probes: their heads are painted on the GPU (picture), the reading from the font's outlines (text-gl.js), and
  // their looks are read after the frame, their eases followed from their own clocks.)
  assert.doesNotMatch(LGL, /headCv|beamCv|sHeadCv/);
  assert.match(LGL, /headSp = picture\(headSp, /);
  assert.match(LGL, /sHeadSp = picture\(sHeadSp, /);
  assert.match(LGL, /if \(!pLook\) return false;/);
  assert.match(LGL, /if \(!sLook\) return false;/);
  // (The beam a soft sector drawn by the shader, kind 7: no 2D picture through a CSS blur, so Safari's canvas without filter keeps it on the GPU.)
  assert.match(LGL, /if \(uKind == 7\) \{/);
  assert.match(LGL, /const bsec = BEAM_GL && L\.beam\.stops\.length === 2 \? beamSector\(L\.beam\) : null;/);
  assert.doesNotMatch(CSS, /\.sp-beam \{[^}]*filter: blur/);
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
  assert.match(LGL, /paintSlot\(st\.slot, lay, blockOps\(d, lay\)\);/, 'each picture drawn by the GPU into its atlas place');
  assert.match(LGL, /gl\.copyTexSubImage2D\(gl\.TEXTURE_2D, 0, slot\.x, slot\.y, 0, 0, lay\.w, lay\.h\);/);
  assert.doesNotMatch(LGL, /texSubImage2D\(|getContext\('2d'\)|measureText|fillText|strokeText/, 'no picture painted on a 2D canvas or uploaded');
  assert.match(LGL, /for \(const run of batchRuns\(items\)\)/);
  assert.match(LGL, /maxPages: 2/);
});

test('the labels stay on their own canvas; what they drew is told to the glass drawn under them', () => {
  const VG = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // (Round 2, 2.2: never drawn into the vessel canvas; ?labelhost is gone.)
  assert.doesNotMatch(STAGE, /labelhost|labelHost|labelsOver/);
  assert.doesNotMatch(STAGE, /createLabelGL\([^)]*host:/);
  // (At the end of each picture laid, the glasses' turns: every blur first, then every glass, lowest turn first; a snapshot is the
  // figure alone, then laid again whole as it shows.)
  assert.match(VG, /function present\(top = true\) \{/);
  assert.match(VG, /if \(top && tops\.length\) \{\n\s+for \(const t of tops\.slice\(\)\) \{ try \{ t\.prep\?\.\(\); \}[^\n]*\n\s+for \(const t of tops\.slice\(\)\) \{ try \{ t\.draw\(\); \}/);
  assert.match(VG, /add\(t\) \{ tops\.push\(t\); tops\.sort\(\(a, b\) => \(a\.order \|\| 0\) - \(b\.order \|\| 0\)\);/);
  assert.match(VG, /snapshot\(\) \{ present\(false\); const url = canvas\.toDataURL\('image\/png'\); if \(tops\.length\) present\(\); return url; \}/);
  // (Every box a picture drew: each label's, each mark's, the probes'; a change tells the stage, which wakes the glasses.)
  assert.match(LGL, /boxAt\(x, y, x \+ st\.w, y \+ st\.h\);/);
  assert.match(LGL, /boxAt\(\.\.\.box\);/);
  assert.match(LGL, /probeBox\(4 \* dpr\);/);
  assert.match(LGL, /boxAt\(\(px - 170\) \* dpr, \(py - 170\) \* dpr, \(px \+ 170\) \* dpr, \(py \+ 170\) \* dpr\);/);
  assert.match(LGL, /if \(key !== boxKey\) \{ boxKey = key; try \{ onBoxes\?\.\(\); \}/);
  assert.match(STAGE, /marks: \[gLeaders, gScan\], onBoxes: frostWake \}\);/);
});

// Laptop-heat recs H6, on the GPU: a value that ticks to another digit keeps its width (tabular figures), so its picture keeps its size and
// its place in the atlas, drawn again there; a wider value gets a bigger picture. Its words are Inter's outlines, its halo their stroke.
test('a ticking value keeps its picture\'s size and place; a wider one gets a bigger picture; words and halo are GPU shapes', () => {
  const d = desc(), first = layBlock(d, 2);
  const again = layBlock(desc({ parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run({ t: '12.1' })] }] }), 2);
  assert.deepEqual([again.w, again.h, again.ox, again.oy], [first.w, first.h, first.ox, first.oy]);
  const wide = layBlock(desc({ parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run({ t: '12.10' })] }] }), 2);
  assert.ok(wide.w > first.w);
  const turned = layBlock(desc(), 2, true);
  assert.deepEqual([turned.w, turned.h], [first.h, first.w]);
  // (The halo (stroke-first) under the words, at the SVG's width, round-joined by the shape drawer; both from the same outlines.)
  const ops = blockOps(d, first);
  assert.deepEqual(ops.map((o) => o.kind), ['stroke', 'fill']);
  assert.equal(ops[0].w, 3);
  assert.equal(ops[0].geom, ops[1].geom);
  assert.deepEqual(ops[1].paint.solid, [0, 0, 0, 1]);
  assert.ok(ops[1].geom.poly.length > 3, 'the outlines of 1, 2, . and 0');
  // (Its width is the GPU text's own (advances, tabular figures), the halo and a 2 px margin round it.)
  const tw = TEXT.textWidth('12.0', { weight: 500, size: 14, tnum: true });
  assert.equal(first.w, Math.ceil((tw + 1.5 + 2) * 2) - Math.floor(-3.5 * 2));
  // (An italic run is slanted about its baseline.)
  const it = desc({ parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run({ it: true })] }] }), li = layBlock(it, 2);
  assert.deepEqual(blockOps(it, li)[1].m, [2, 0, -0.5, 2, 0.25 * 11 * 2 - li.ox, -li.oy]);
});

// (Laptop-heat, 31 Oct: the label canvas covers the whole stage and was put together with the figure on every frame the blood moved, even
// when it held nothing. With no label, mark or probe drawn it is hidden; the first thing drawn back shows it in the same task.)
test('a label canvas that drew nothing is hidden, and shows again in the task that draws something', () => {
  assert.match(LGL, /if \(!host\) \{ const empty = boxes\.length === 0; if \(empty !== blank\) \{ blank = empty; canvas\.toggleAttribute\('data-blank', empty\); \} \}/);
  assert.match(LGL, /let boxes = \[\], boxKey = '', blank = false;/);
  assert.match(CSS, /\.stage-view > canvas#labelGl\[data-blank\] \{ visibility: hidden; \}/);
  // (Everything the canvas draws has a box: labels, marks, the probes.)
  assert.equal((LGL.match(/boxAt\(/g) || []).length >= 5, true);
  // (The toggle comes after the last draw call and the boxes' key, in the same draw.)
  const at = LGL.indexOf('canvas.toggleAttribute(\'data-blank\'');
  assert.ok(at > LGL.indexOf('drawScan(now)') && at > LGL.indexOf('boxKey = key'));
});
