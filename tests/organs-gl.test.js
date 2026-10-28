import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cropToGrid } from '../src/ui/organs-gl.js';

// The organs as layers (organs-gl.js): each layer is cropped to its own box on the whole picture's pixel grid, so its pixels are
// the picture's own samples, and the layers are laid back to front in the SVG's order.

test("a layer's rect is its box grown out to whole pixels of the picture's grid, within the picture", () => {
  const want = [200, -200, 1020, 1320], k = 1.2;
  const r = cropToGrid(want, [500.1, 100.2, 700.7, 300.3], k);
  for (const [i, o] of [[0, 0], [1, 1]]) {
    const px = (r[i] - want[o]) * k;
    assert.ok(Math.abs(px - Math.round(px)) < 1e-9, 'starts on a whole pixel');
  }
  for (const i of [2, 3]) assert.ok(Math.abs(r[i] * k - Math.round(r[i] * k)) < 1e-9, 'a whole number of pixels');
  assert.ok(r[0] <= 500.1 && r[1] <= 100.2 && r[0] + r[2] >= 700.7 && r[1] + r[3] >= 300.3, 'covers the box');
  assert.ok(r[0] > 500.1 - 1 / k && r[0] + r[2] < 700.7 + 1 / k, 'by less than a pixel');
  // Cut to the picture, and nothing where they miss.
  assert.deepEqual(cropToGrid(want, [-Infinity, -Infinity, Infinity, Infinity], k), want);
  assert.equal(cropToGrid(want, [1300, 0, 1400, 10], k), null);
  assert.equal(cropToGrid(want, [0, 0, 0, 0], k), null);
});

test('the stage splits the organs into the layers in the SVG order, and shows a set only whole', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /const ORGAN_LAYERS = \['back', 'behind', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'\];/);
  // (An organ the list does not name goes with the layer before it: the SVG's order is always kept.)
  assert.match(stage, /for \(const k of gOrgans\.children\) \{ last = by\.get\(k\) \|\| last; out\.set\(k, last\); \}/);
  assert.match(stage, /if \(!\(await \(b \? bakeLayer\(slot, L, b, r, scale\) : rasterPlate\(slot, r, scale, L, false, live\)\)\) \|\| v !== veins \|\| !v\.organs\) return false;/, 'a layer given up gives up the set');
  // (With the changing organs painted live, their layers are not made, and the gut and the stomach are made without their masks.)
  assert.match(stage, /if \(live && LIVE_LAYERS\.has\(L\)\) continue;/);
  assert.match(stage, /const LIVE_LAYERS = new Set\(\['back', 'spleen', 'liver', 'front'\]\);/);
  assert.match(stage, /const MASK_OF = \{ gut: '#gutHide', stomach: '#frontM' \};/);
  assert.match(stage, /v\.organs\.commit\(slot, names\);/);
  assert.match(stage, /\(!SOFTWARE \|\| gpuProbe\.gpuOrgans === 'force'\)/, 'off on a software renderer unless forced');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/, 'plain "over", premultiplied');
});

// The bowel floats up on the ascites. Painted live, its picture is moved on the GPU while the fluid eases (and made again once it
// settles), under the rest of the gut, the gut's opacity and mask laid over the two as one group (as the SVG lays it): nothing is drawn again while the
// fluid eases (it was every half step of the bulge, the bowel standing still until each new picture landed).
test('the bowel is a picture at rest gathered under the gut, moved by its float on the GPU', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(stage, /const LIVE_ORDER = \['back', 'behind', 'bowel', 'gut', /);
  assert.match(stage, /for \(const L of live \? LIVE_ORDER : ORGAN_LAYERS\) \{/);
  assert.match(stage, /opacity: parseFloat\(getComputedStyle\(gGut\)\.opacity\), under: \[\{ name: 'bowel', dy: bowelDy\(\) \}\]/);
  assert.match(stage, /if \(liveSet\) veins\.organs\.shift\('bowel', bowelDy\(\)\);/);
  // The picture: the bowel alone, or the rest without it; the group's opacity left to the GPU. Drawn where the bowel is in the
  // copy (at), its float held in the pictures' state while the fluid eases and taken once it settles.
  assert.match(stage, /if \(mine !== \(layer === 'bowel'\)\) drop\.push\(\[g, g\.parentNode, g\.nextSibling\]\);/);
  assert.match(stage, /v\.organs\.stage\(slot, layer, job, rect, layer === 'bowel' \? plateCopy\.bowelDy : 0\)/);
  assert.match(stage, /if \(!fluidEasing\(\)\) bowelHeld = organG\.bowel\.getAttribute\('transform'\);\n\s+if \(liveOn\(\)\) return \['live', bowelHeld, /);
  assert.match(stage, /unmasked\.push\(\[k, 'opacity', k\.getAttribute\('opacity'\)\]\); k\.removeAttribute\('opacity'\);/);
  // On the GPU: moved by whole device pixels, drawn under the gut's picture, laid with the gut's opacity.
  assert.match(gl, /const dy = Math\.round\(\(\(u\.dy \|\| 0\) - U0\.at\) \* m\[3\]\), mm = mat\.slice\(\);\n\s+mm\[7\] \+= dy;/);
  assert.match(gl, /for \(const \[U0, U1, mm\] of under\) drawLayer\(U0, U1, mm, b\); drawLayer\(L0, L1, mat, b\); \}, box, cut\.spec, mul\(m, cut\.m\), w, h, fbo, cut\.opacity \?\? 1, within\);/);
});

// A live organ's ease changes its own box, not the screen: the stack is drawn again only there (the boxes of the ops whose outline,
// frame or paint changed, old and new), and the composite draws the cells over that box, as the ascites pool's. A view change or a
// new layer set still draws the whole. (Performance review after the GPU organs, 22 Oct, item 1.)
test('a live organ that changed is drawn again within its box, and only its cells are composited', () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /setLive\(organs, masks\) \{ liveOrgans = organs \|\| new Map\(\); cuts = masks \|\| new Map\(\); liveVer\+\+; watchLive\(\); \}/, 'a live change moves its own version');
  assert.match(gl, /stale: \(m, cw, ch\) => drawnKey !== keyOf\(m, cw, ch\) \|\| \(!watch && liveNow\(\)\),/);
  assert.match(gl, /const keyOf = \(m, cw, ch\) => \{ pull\(\); return `\$\{ver\}\|\$\{liveVer\}\|\$\{watch \? pageVer : ''\}\|/);
  assert.match(gl, /const at = `\$\{ver\}\|\$\{m\.join\(','\)\}\|\$\{cw\}x\$\{ch\}`, same = at === drawnAt && !!painter;/, 'the same view and layers: only what changed');
  assert.match(gl, /if \(a\[i\]\.ops\[k\]\[0\] !== b\[i\]\.ops\[k\]\[0\]\) \{ add\(a\[i\]\.ops\[k\]\[1\]\); add\(b\[i\]\.ops\[k\]\[1\]\); \}/, "an op's old and new boxes");
  assert.match(gl, /if \(!whole && !dirty\) \{ painter\?\.endFrame\(\); return null; \}/, 'nothing changed: nothing drawn');
  assert.match(gl, /return whole \? true : dirty;/);
  assert.match(gl, /painter\.paintGroup\(o\.spec, mul\(m, o\.m\), w, h, fbo, within\)/);
  assert.match(gl, /cut\.opacity \?\? 1, within\);/);
  // The painter: every op's box is the one it paints within, so a signature's box covers its pixels.
  assert.match(paint, /function paintOps\(spec, m, into, within = null, d = 0\) \{ runJob\(\{ frames: \[frameOf\(spec\.ops, m, into, within, d\)\] \}\); \}/);
  assert.match(paint, /const at = opAt\(op, m\), \{ om, sh, cm, csh \} = at;\n\s+let b = within \? meet\(at\.b, within\) : at\.b;/);
  assert.match(paint, /for \(const op of spec\.ops\) ops\.push\(\[opSig\(op, m\), opAt\(op, m\)\.b\]\);/);
  assert.match(paint, /const b = meet\(groupBox\(spec, m\), within \|\| \[0, 0, w, h\]\);/);
  // The composite: the box's cells, not the whole picture, unless the whole stack was drawn.
  assert.match(veins, /if \(r === true\) full = true;\n\s+else if \(r\) \{ dirtCells\(r, m\); dirt = nDirt;/);
  assert.match(veins, /if \(dirt\) \{ gl\.bindVertexArray\(dirtVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, dirt\); \}/);
});

// On by default (Mohammad, 22 Oct 00:17Z: "Do the GPU draw for everything"), off with ?gpuorgans=0 or the ?perf switch; never on
// a software renderer unless forced (the browser checks run there, and keep the one picture).
test('the GPU organs are on by default and can be turned off from the address', async () => {
  const { gpuProbe } = await import('../src/ui/gpu-probe.js');
  assert.equal(gpuProbe.gpuOrgans, true);
  const src = readFileSync(new URL('../src/ui/gpu-probe.js', import.meta.url), 'utf8');
  assert.match(src, /gpuorgans=\(0\|1\|force\)/);
  assert.match(src, /gpuOrgans: ORGANS_Q === 'force' \? 'force' : ORGANS_Q !== '0',/);
});

test('a pinch reuses the live organs\' meshes: the tolerance moves in powers of two', () => {
  const src = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  assert.match(src, /export const detailTol = \(sc\) => Math\.min\(0\.5, 2 \*\* Math\.floor\(Math\.log2\(0\.2 \/ sc\)\)\);/);
  assert.match(src, /tol = detailTol\(sc\);/);
});

// A new clip's coverage was cleared over the whole canvas before it was drawn, for every clipped group on every frame; a later op
// with the same clip is cut to the clip's box, so clearing the clip's box (with the op's own) is the same. (Review item 5.)
test("a clip's coverage is cleared over its own box, not the canvas", () => {
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  assert.match(paint, /scissor\(newClip \? join\(b, devBox\(csh\.box, cm, 2\)\) : b\);\n\s+gl\.clearBufferfv\(gl\.COLOR, 0, \[0, 0, 0, 0\]\);/);
  assert.doesNotMatch(paint, /if \(newClip\) gl\.disable\(gl\.SCISSOR_TEST\); else scissor\(b\);/);
});

// What eases (outlines, frames, the parts' own opacities) the painter reads from the page at each paint, so the live specs are
// read again only when what is in them changes (a part hidden or shown, the liver's mask, the ghost line, a lens, the theme);
// they were read again, about fifty computed styles, on every frame of an ease. (Review item 3.)
test('the live organs are read once per state; the painter reads the eased values from the page', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(stage, /return \[organG\.liver\.getAttribute\('mask'\), ghost\.style\.display, lv\.sep\.style\.visibility, lv\.nod\.style\.visibility, lv\.cong\.style\.visibility, lv\.isl\.style\.visibility,\n\s+cs\.getPropertyValue\('--stage-bg'\)/);
  assert.match(stage, /organs\.get\(L\)\.push\(\{ spec, get m\(\) \{ return matOfEl\(el\); \} \}\);/);
  // The painter: an op's frame, alpha and clip frame from its element chain's inline settings, else as read; at no opacity no box.
  assert.match(paint, /export function liveOf\(op\) \{/);
  assert.match(paint, /for \(let i = op\.a0 \|\| 0; i < op\.chain\.length; i\+\+\) a \*= liveO\(op\.chain\[i\], CS_O\);/);
  assert.match(paint, /let b = lv\.alpha > 0 \? devBox\(sh\.box, om, grow\) : null, cm = null, csh = null;/);
  assert.match(paint, /gl\.uniform1f\(U\.alpha, at\.alpha\);/);
  assert.match(paint, /if \(!\(o > 0\) && !ownO\(el\)\) return;/, 'a part at nothing by its own setting is kept, to show as it eases');
  // The stack asks the painter only after a write to a live group's elements (or, with no MutationObserver, every frame while
  // groups are live), and draws nothing when nothing changed.
  assert.match(gl, /if \(key === drawnKey && \(watch \|\| !liveNow\(\)\)\) return null;/);
});

// Review item 3: with live organs the stack no longer describes every op as strings on every blood frame. It watches exactly the
// elements the painter reads from (each op's element, its chain, its clip's, the group's root and mask, and each entry's own frame
// element) and renders again only after a write that left one different, taken synchronously so the same task's composite sees it.
test('the live organs are described again only after a write to what the painter reads', () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(gl, /const pull = \(\) => \{ if \(!watch\) return; const rs = watch\.takeRecords\(\); if \(rs\.length && netChanged\(rs\)\) pageVer\+\+; \};/);
  const els = gl.slice(gl.indexOf('const elsOf = '), gl.indexOf('function watchLive()'));
  for (const k of ['out.add(spec.root)', 'out.add(op.el)', 'out.add(op.geom?.el)', 'for (const e of op.chain || []) out.add(e)', 'out.add(op.clip.geom?.el)', 'for (const e of op.clip.chain || []) out.add(e)', 'elsOf(spec.mask, out)']) assert.ok(els.includes(k), k);
  assert.match(gl, /for \(const list of liveOrgans\.values\(\)\) for \(const o of list\) \{ elsOf\(o\.spec, els\); els\.add\(o\.el\); \}/);
  assert.match(gl, /for \(const c of cuts\.values\(\)\) \{ elsOf\(c\.spec, els\); els\.add\(c\.el\); \}/);
  assert.match(gl, /watch\.observe\(el, \{ attributes: true, attributeOldValue: true \}\)/);
  // The cuts' frames are read from their group (the gut, the stomach), not the mask: that element is watched too.
  assert.equal((stage.match(/\{ spec, el: g, get m\(\) \{ return matOfEl\(g\); \}/g) || []).length, 2);
  assert.match(stage, /organs\.get\(L\)\.push\(\{ spec, get m\(\) \{ return matOfEl\(el\); \} \}\);/, "an organ's frame element is its spec's root");
});

// The organs' pictures painted on the GPU from their shapes (Mohammad, 25 Oct: no SVG → image → canvas → read back → upload on the
// way): each layer the painter can read is painted into a texture of its own that stays on the GPU; only an unreadable one is rasterized.
test('the organ layers are painted on the GPU from their shapes, with no SVG picture, canvas, read back or upload', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const shape = readFileSync(new URL('../src/ui/shape-gl.js', import.meta.url), 'utf8');
  // Read with their nested masks and see-through groups; the gut's and the stomach's own masks are left to the cuts.
  assert.match(stage, /const spec = el\.localName === 'g' \? readGroup\(el, \{ withMask: el !== organG\.stomach, nest: true \}\) : null;/);
  assert.match(stage, /const els = L === 'bowel' \? \[organG\.bowel\] : L === 'gut' \? gutKids\(\)\.filter\(\(k\) => k !== organG\.bowel\)/);
  // The SVG copy only when a layer cannot be read; the picture given up when the state moves on, a few ms painted a frame.
  assert.match(stage, /const copyNeeded = !baked \|\| \[\.\.\.baked\.values\(\)\]\.some\(\(b\) => !b\);\n\s+if \(slot === 0 && copyNeeded\)/);
  assert.match(stage, /const gone = \(\) => seq !== plateSeq \|\| drops !== plateDrops \|\| v !== veins \|\| v\.lost \|\| !v\.organs \|\| \(slot === 1 && vseq !== viewSeq\) \|\| key !== plateStateKey\(\);/);
  // (Not a fixed 6 ms a frame of its own any more: a step is what is left of the allowance every refinement shares, in a frame outside a gesture: refine.js.)
  assert.match(stage, /const ms = await refineTurn\(gone\);\n\s+if \(ms === null\) return false;\n\s+const t0 = performance\.now\(\);\n\s+const done = gpuProbe\.time\(null, 'organ picture: GPU paint', \(\) => job\.step\(t0 \+ ms\)\);/);
  assert.doesNotMatch(stage, /job\.step\(performance\.now\(\) \+ 6\)/);
  const bake = gl.slice(gl.indexOf('    bake(slot, name, groups, rect, scale, at = 0) {'), gl.indexOf('    dropKept() {'));
  assert.doesNotMatch(bake, /texSubImage2D|readPixels|getImageData|Image\(|XMLSerializer|canvas'\)/);
  assert.match(bake, /staged\[slot\]\.set\(name, \{ tex, rect, at, flip: true \}\);/);
  assert.match(gl, /o = texture\(t1, flip\.y == 1 \? vec2\(u1\.x, 1\.0 - u1\.y\) : u1\)/, 'its rows turned back where it is laid');
  // Nested groups laid in layers of their own, with their opacity and mask, as the browser lays them.
  assert.match(paint, /const own2 = nest && el !== root && el\.localName === 'g' && \(masked \|\| o < 1\);/);
  // (Last in, first painted: the nested group's shapes into its layer, its mask into the mask layer, then the layer laid over.)
  assert.match(paint, /job\.frames\.push\(\{ lay: \[g, k, b, at\.alpha, !!op\.mask, f\.into\] \}\);\n\s+if \(op\.mask\) job\.frames\.push\(frameOf\(op\.mask\.ops, at\.mm, k\.fbo, b, f\.d \+ 1\)\);\n\s+job\.frames\.push\(frameOf\(op\.ops, f\.m, g\.fbo, b, f\.d \+ 1\)\);/);
  // A group painted straight onto the picture only when that is the same picture (no opacity or mask of its own); otherwise in
  // its own layer, laid once whole; either way a few ops a step.
  assert.match(paint, /if \(spec\.mask \|\| specOpacity\(spec\) < 1\) \{\n\s+const b = meet\(groupBox\(spec, m\), \[0, 0, w, h\]\);/);
  assert.match(paint, /job\.frames\.push\(\{ lay: \[g, k, b, specOpacity\(spec\), !!spec\.mask, fbo\] \}\);/);
  assert.match(paint, /\} else job = \{ frames: \[frameOf\(spec\.ops, m, fbo, \[0, 0, w, h\], 0\)\] \};/);
  // Shapes keep their arrays on the GPU while kept, given back when let go.
  assert.match(shape, /gl\.bufferData\(gl\.ARRAY_BUFFER, mesh\.tri, gl\.STATIC_DRAW\)/);
  assert.doesNotMatch(shape, /bufferSubData/);
  assert.match(paint, /for \(const \[k, v\] of meshesOld\) if \(!meshes\.has\(k\) && !kept\.has\(k\)\) shape\.release\(v\.mesh\);/);
});

// The painting time limit holds inside nested groups too (review, 25 Oct): a nested group, or a picture's group with a mask or an
// opacity of its own, was painted whole within one op, so a picture of the gut could still make one long frame.
test("a picture's painting stops at its time limit at any depth of nested groups, and resumes where it stopped", () => {
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const run = paint.slice(paint.indexOf('function runJob('), paint.indexOf('function paintOps('));
  // The time is checked before every op of every frame, whatever its depth, after at least one op (so each step moves on).
  assert.match(run, /if \(n > 0 && performance\.now\(\) > until\) return false;\n\s+const op = f\.ops\[f\.i\+\+\];\n\s+n\+\+;/);
  assert.doesNotMatch(run, /paintOps\(|paintGroup\(/, 'no nested group painted whole inside a step');
  // The nested layers hold a half-painted group between steps: one picture's job at a time, and a job whose layers were made
  // again meanwhile (the canvas grew) starts its picture over rather than lay a wiped layer.
  assert.match(paint, /if \(holder && holder !== me\) return 'wait';/);
  assert.match(paint, /\} else if \(ver !== allocVer\) \{ holder = null; return 'lost'; \}/);
  assert.match(paint, /if \(gw \* gh <= targetRoom\(BW, BH\)\) \{ AW = gw; AH = gh; \} else \{ AW = Math\.max\(w, BW\); AH = Math\.max\(h, BH\); \}\n\s+allocVer\+\+;/, 'only when the targets are made again, not when a deeper pair is first made');
  assert.match(paint, /drop\(\) \{ if \(holder === me\) holder = null; job = null; \},/);
  // The live painting never uses those layers (it reads no nested groups): the picture's start at depth 1.
  assert.match(paint, /const \[g, k\] = depth\(1\);/);
  const bake = gl.slice(gl.indexOf('    bake(slot, name, groups, rect, scale, at = 0) {'), gl.indexOf('    dropKept() {'));
  assert.match(bake, /cur \|\|= painter\.bakeJob\(g\.spec, mul\(T, g\.m\), W, H, fb, pic\);\n\s+const r = cur\.step\(until\);/);
  assert.match(bake, /if \(r === 'lost'\) \{/);
  assert.match(bake, /const free = \(\) => \{ cur\?\.drop\(\); cur = null;/, 'a picture given up lets go of the nested layers');
});
