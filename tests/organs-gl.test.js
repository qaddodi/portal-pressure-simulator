import { stageSource } from './stage-src.js';
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
  const stage = stageSource();
  assert.match(stage, /const ORGAN_LAYERS = \['back', 'behind', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'\];/);
  // (An organ the list does not name goes with the layer before it: the SVG's order is always kept.)
  assert.match(stage, /for \(const k of gOrgans\.children\) \{ last = by\.get\(k\) \|\| last; out\.set\(k, last\); \}/);
  assert.match(stage, /if \(!\(await bakeLayer\(slot, L, baked\.get\(L\), r, scale\)\) \|\| v !== (?:live\.)?veins \|\| !v\.organs\) return false;/, 'a layer given up gives up the set');
  // (With the changing organs painted live, their layers are not made, and the gut and the stomach are made without their masks.)
  assert.match(stage, /if \(LIVE_LAYERS\.has\(L\)\) continue;/);
  assert.match(stage, /const LIVE_LAYERS = new Set\(\['back', 'spleen', 'liver', 'front'\]\);/);
  assert.match(stage, /const MASK_OF = \{ gut: '#gutHide', stomach: '#frontM' \};/);
  assert.match(stage, /v\.organs\.commit\(slot, names\);/);
  assert.match(stage, /const gpuOrgansOn = \(\) => !!\(gpuProbe\.gpuOrgans && (?:live\.)?veins\?\.organs\);/, 'on every renderer');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/, 'plain "over", premultiplied');
});

// The bowel floats up on the ascites. Painted live, its picture is moved on the GPU while the fluid eases (and made again once it
// settles), under the rest of the gut, the gut's opacity and mask laid over the two as one group (as the SVG lays it): nothing is drawn again while the
// fluid eases (it was every half step of the bulge, the bowel standing still until each new picture landed).
test('the bowel is a picture at rest gathered under the gut, moved by its float on the GPU', () => {
  const stage = stageSource();
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(stage, /const LIVE_ORDER = \['back', 'behind', 'bowel', 'gut', /);
  assert.match(stage, /for \(const L of LIVE_ORDER\) \{/);
  assert.match(stage, /opacity: parseFloat\((?:getComputedStyle|csNow)\((?:live\.)?(?:live\.)?(?:live\.)?gGut\)\.opacity\), under: \[\{ name: 'bowel', dy: (?:live\.)?bowelDy\(\) \}\]/);
  assert.match(stage, /if \((?:live\.)?(?:live\.)?(?:live\.)?liveSet\) (?:live\.)?(?:live\.)?(?:live\.)?veins\.organs\.shift\('bowel', (?:live\.)?(?:live\.)?bowelDy\(\)\);/);
  // The picture: the bowel alone, painted where the bowel is (at), its float held in the pictures' state while the fluid eases and
  // taken once it settles.
  assert.match(stage, /out\.set\(L, ok \? \{ groups, at: L === 'bowel' \? (?:live\.)?bowelDy\(\) : 0, key \} : null\);/);
  assert.match(stage, /if \(!(?:live\.)?(?:live\.)?fluidEasing\(\)\) bowelHeld = organG\.bowel\.getAttribute\('transform'\);\n\s+if \((?:live\.)?liveOn\(\)\) return \['live', bowelHeld, /);
  // On the GPU: moved by whole device pixels, drawn under the gut's picture, laid with the gut's opacity.
  assert.match(gl, /const dy = Math\.round\(\(\(u\.dy \|\| 0\) - U0\.at\) \* m\[3\]\);\n[^\n]*\n\s+mm\.set\(mat\);\n\s+mm\[7\] \+= dy;/);
  assert.match(gl, /for \(let i = 0; i < nUnder; i\+\+\) drawLayer\(underU0\[i\], underU1\[i\], underMM\[i\], b\);\n\s+drawLayer\(cutL0, cutL1, mat, b\);/);
  assert.match(gl, /painter\.layMasked\(drawCut, (?:live\.)?box, cut\.spec, mulTo\(MM, m, cut\.m\), w, h, target, cut\.opacity \?\? 1, within\);/);
});

// A live organ's ease changes its own box, not the screen: the stack is drawn again only there (the boxes of the ops whose outline,
// frame or paint changed, old and new), and the composite draws the cells over that box, as the ascites pool's. A view change or a
// new layer set still draws the whole. (Performance review after the GPU organs, 22 Oct, item 1.)
test('a live organ that changed is drawn again within its box, and only its cells are composited', () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /setLive\(organs, masks\) \{ liveOrgans = organs \|\| EMPTY_ORGANS; cuts = masks \|\| EMPTY_ORGANS; liveVer\+\+; freeCache\(\); watchLive\(\); \}/, 'a live change moves its own version');
  assert.match(gl, /stale: \(m, cw, ch\) => !sameKey\(keyOf\(kNow, m, cw, ch\), kDrawn\) \|\| \(!watch && liveNow\(\)\) \|\| \(mvShown && performance\.now\(\) - mvAt >= MOVE_SETTLE_MS\),/);
  assert.match(gl, /const keyOf = \(k, m, cw, ch\) => \{[^\n]*\n\s+pull\(\);\n\s+setView\(k, ver, m, cw, ch\);\n\s+k\.liveVer = liveVer; k\.page = watch \? pageVer : -1; k\.f = pending\(\) \? performance\.now\(\) : -1; k\.ok = true;/);
  assert.match(gl, /const same = sameView\(kAt, ver, m, cw, ch\) && !!painter;\n\s+setView\(kAt, ver, m, cw, ch\); kAt\.ok = true;/, 'the same view and layers: only what changed');
  assert.match(gl, /if \(a\[i\]\.ops\[k\]\[0\] !== b\[i\]\.ops\[k\]\[0\]\) \{ addBox\(a\[i\]\.ops\[k\]\[1\]\); addBox\(b\[i\]\.ops\[k\]\[1\]\); \}/, "an op's old and new boxes");
  assert.match(gl, /if \(!whole && !dirtyOn\) \{ endFade\(\); painter\?\.endFrame\(\); setExact\(m, ck\); return null; \}/, 'nothing changed: nothing drawn');
  assert.match(gl, /return whole \? true : DIRTY;/);
  assert.match(gl, /painter\.paintGroup\(o\.spec, mulTo\(MM, m, o\.m\), w, h, target, within\)/);
  assert.match(gl, /cut\.opacity \?\? 1, within\);/);
  // The painter: every op's box is the one it paints within, so a signature's box covers its pixels.
  assert.match(paint, /function paintOps\(spec, m, into, within = null, d = 0\) \{\n\s+PF\.ops = spec\.ops; PF\.m = m; PF\.into = into; PF\.within = within; PF\.d = d; PF\.i = 0;\n\s+PJ\.frames\.length = 0; PJ\.frames\.push\(PF\);\n\s+runJob\(PJ\);/);
  assert.match(paint, /const at = opAt\(op, m\), \{ om, sh, cm, csh, cm2, csh2 \} = at;\n\s+const b = within \? meetTo\(PB, at\.b, within\) : at\.b;/);
  assert.match(paint, /for \(const op of spec\.ops\) \{ const s = opSig\(op, m\); put\(s, opAt\(op, m\)\.b\); \}/);
  assert.match(paint, /const b = meetTo\(LB, groupBox\(spec, m\), win\);/);
  // The composite: the box's cells, not the whole picture, unless the whole stack was drawn.
  assert.match(veins, /if \(r === true\) full = true;\n\s+else if \(r\) \{ dirtCells\(r, m\); dirt = nDirt;/);
  assert.match(veins, /if \(dirt\) \{ gl\.bindVertexArray\(dirtVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, dirt\); \}/);
});

// On by default (Mohammad, 22 Oct 00:17Z: "Do the GPU draw for everything"), no off switch (switches deleted, 2 Nov 2026); never on
// a software renderer unless forced (the browser checks run there, and keep the one picture).
test('the GPU organs are on by default, with no switch to turn them off', async () => {
  const { gpuProbe } = await import('../src/ui/gpu-probe.js');
  assert.equal(gpuProbe.gpuOrgans, true);
  const src = readFileSync(new URL('../src/ui/gpu-probe.js', import.meta.url), 'utf8');
  assert.match(src, /gpuorgans=\(force\)/);
  assert.match(src, /gpuOrgans: ORGANS_Q === 'force' \? 'force' : true,/);
  assert.doesNotMatch(src, /gpuorgans=\(0/);
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
  assert.match(paint, /let sb = newClip && devBoxTo\(SB2, csh\.box, cm, 2\) \? joinTo\(SB, b, SB2\) : b;\n\s+if \(newClip2 && devBoxTo\(SB2, csh2\.box, cm2, 2\)\) sb = joinTo\(SB, sb, SB2\);\n\s+scissor\(sb\);\n\s+gl\.clearBufferfv\(gl\.COLOR, 0, CLEAR0\);/);
  assert.doesNotMatch(paint, /if \(newClip\) gl\.disable\(gl\.SCISSOR_TEST\); else scissor\(b\);/);
});

// What eases (outlines, frames, the parts' own opacities) the painter reads from the page at each paint, so the live specs are
// read again only when what is in them changes (a part hidden or shown, the liver's mask, the ghost line, a lens, the theme);
// they were read again, about fifty computed styles, on every frame of an ease. (Review item 3.)
test('the live organs are read once per state; the painter reads the eased values from the page', () => {
  const stage = stageSource();
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(stage, /k\[0\] = organG\.liver\.getAttribute\('mask'\) \?\? ''; k\[1\] = ghost\.style\.display; k\[2\] = lv\.sep\.style\.visibility; k\[3\] = lv\.nod\.style\.visibility; k\[4\] = lv\.cong\.style\.visibility; k\[5\] = lv\.isl\.style\.visibility;\n\s+k\[6\] = cs\.getPropertyValue\('--stage-bg'\)/);
  assert.match(stage, /organs\.get\(L\)\.push\(\{ spec, get m\(\) \{ return matOfEl\(el\); \} \}\);/);
  // The painter: an op's frame, alpha and clip frame from its element chain's inline settings, else as read; at no opacity no box.
  assert.match(paint, /export function liveOf\(op\) \{/);
  assert.match(paint, /for \(let i = op\.a0 \|\| 0; i < op\.chain\.length; i\+\+\) a \*= liveO\(op\.chain\[i\], CS_O\);/);
  assert.match(paint, /let b = lv\.alpha > 0 && devBoxTo\(BX, sh\.box, om, grow\) \? BX : null, csh = null, csh2 = null;/);
  assert.match(paint, /gl\.uniform1f\(U\.alpha, at\.alpha\);/);
  assert.match(paint, /if \(!\(o > 0\) && !ownO\(el\)\) return;/, 'a part at nothing by its own setting is kept, to show as it eases');
  // The stack asks the painter only after a write to a live group's elements (or, with no MutationObserver, every frame while
  // groups are live), and draws nothing when nothing changed.
  assert.match(gl, /if \(unchanged && \(watch \|\| !liveNow\(\)\) && !settle\) return null;/);
});

// Review item 3: with live organs the stack no longer describes every op as strings on every blood frame. It watches exactly the
// elements the painter reads from (each op's element, its chain, its clip's, the group's root and mask, and each entry's own frame
// element) and renders again only after a write that left one different, taken synchronously so the same task's composite sees it.
test('the live organs are described again only after a write to what the painter reads', () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const stage = stageSource();
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
  const stage = stageSource();
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const shape = readFileSync(new URL('../src/ui/shape-gl.js', import.meta.url), 'utf8');
  // Read with their nested masks and see-through groups; the gut's and the stomach's own masks are left to the cuts.
  assert.match(stage, /const spec = el\.localName === 'g' \? readGroup\(el, \{ withMask: el !== organG\.stomach, nest: true \}\) : null;/);
  assert.match(stage, /const els = L === 'bowel' \? \[organG\.bowel\] : L === 'gut' \? gutKids\(\)\.filter\(\(k\) => k !== organG\.bowel\)/);
  // Never an SVG copy: a layer that cannot be read leaves the organs on the page's SVG; the picture given up when the state moves on,
  // a few ms painted a frame.
  assert.match(stage, /if \(unread\) \{ organPaths\.clear\(\); organPaths\.set\(unread\[0\], `SVG \(\$\{bakeWhy\.get\(unread\[0\]\) \|\| 'not readable'\}\)`\); return false; \}/);
  for (const gone of ['async function rasterPlate', 'function plateMarkup', 'function plateBuild', 'async function svgPicture', 'async function makeGutPic', 'XMLSerializer', "'image/svg+xml'"]) assert.ok(!stage.includes(gone), gone);
  assert.match(stage, /const gone = \(\) => seq !== (?:live\.)?(?:live\.)?plateSeq \|\| drops !== (?:live\.)?(?:live\.)?plateDrops \|\| v !== (?:live\.)?(?:live\.)?(?:live\.)?veins \|\| v\.lost \|\| !v\.organs \|\| \(slot === 1 && vseq !== (?:live\.)?(?:live\.)?viewSeq\) \|\| key !== plateStateKey\(\);/);
  // (Not a fixed 6 ms a frame of its own any more: a step is what is left of the allowance every refinement shares, in a frame outside a gesture: refine.js.)
  assert.match(stage, /const ms = await refineTurn\(gone\);\n\s+if \(ms === null\) return false;\n\s+const t0 = performance\.now\(\);\n\s+const done = gpuProbe\.time\(null, 'organ picture: GPU paint', bakeStep, job, t0 \+ ms\);/);   // (bakeStep: the kept (job, until) => job.step(until), no closure per frame)
  assert.doesNotMatch(stage, /job\.step\(performance\.now\(\) \+ 6\)/);
  const bake = gl.slice(gl.indexOf('    bake(slot, name, groups, rect, scale, at = 0) {'), gl.indexOf('    dropKept() {'));
  assert.doesNotMatch(bake, /texSubImage2D|readPixels|getImageData|Image\(|XMLSerializer|canvas'\)/);
  assert.match(bake, /staged\[slot\]\.set\(name, \{ tex, rect, at, flip: true \}\);/);
  assert.match(gl, /o = texture\(t1, flip\.y == 1 \? vec2\(u1\.x, 1\.0 - u1\.y\) : u1\)/, 'its rows turned back where it is laid');
  // Nested groups laid in layers of their own, with their opacity and mask, as the browser lays them.
  assert.match(paint, /const own2 = c\.nest && el !== root && el\.localName === 'g' && \(masked \|\| o < 1\);/);
  // (Last in, first painted: the nested group's shapes into its layer, its mask into the mask layer, then the layer laid over.)
  assert.match(paint, /job\.frames\.push\(\{ lay: \[g, k, b, at\.alpha, !!op\.mask, f\.into\] \}\);[^\n]*\n\s+if \(op\.mask\) job\.frames\.push\(frameOf\(op\.mask\.ops, at\.mm\.slice\(\), k\.fbo, b, f\.d \+ 1\)\);[^\n]*\n\s+job\.frames\.push\(frameOf\(op\.ops, f\.m, g\.fbo, b, f\.d \+ 1\)\);/);
  // A group painted straight onto the picture only when that is the same picture (no opacity or mask of its own); otherwise in
  // its own layer, laid once whole; either way a few ops a step.
  assert.match(paint, /if \(spec\.mask \|\| specOpacity\(spec\) < 1\) \{\n\s+const b = meet\(groupBox\(spec, m\), \[0, 0, w, h\]\);/);
  assert.match(paint, /job\.frames\.push\(\{ lay: \[g, k, b, specOpacity\(spec\), !!spec\.mask, fbo\] \}\);/);
  assert.match(paint, /\} else job = \{ frames: \[frameOf\(spec\.ops, m, fbo, \[0, 0, w, h\], 0\)\] \};/);
  // Shapes keep their arrays on the GPU while kept, given back when let go.
  assert.match(shape, /gl\.bufferData\(gl\.ARRAY_BUFFER, mesh\.tri, gl\.STATIC_DRAW, 0, mesh\.nTri \* 2\)/);
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
  // (A nested layer's composite is a unit of its own, checked the same way: Holding 120 Hz recs §15.)
  assert.match(run, /if \(n > 0 && performance\.now\(\) > until\) return false;\n\s+if \(f\.lay\) \{\n\s+job\.frames\.pop\(\); n\+\+;[\s\S]*?continue;\n\s+\}\n\s+const op = f\.ops\[f\.i\+\+\];\n\s+n\+\+;/);
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

test('a clip inside a clip is painted with both (the colon), the outer in the scratch blue', () => {
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  assert.match(paint, /if \(clip && clip\.outer\) \{ fail\(c, 'nested clip', el\); return; \}/);
  assert.match(paint, /if \(outer\) cl\.outer = outer;/);
  assert.match(paint, /float c = cv\.r \* \(useClip >= 1 \? cv\.g : 1\.0\) \* \(useClip == 2 \? cv\.b : 1\.0\);/);
  assert.match(paint, /if \(newClip2\) \{ shape\.fill\(csh2\.mesh, cm2, SZ, CH_B\); job\.ck2 = ck2; copy6\(cv2, cm2\); \}/);
  assert.match(paint, /const CH_R = \[true, false, false, false\], CH_G = \[false, true, false, false\], CH_B = \[false, false, true, false\];/);
  assert.match(paint, /job\.ck = job\.ck2 = null;/);
});


// Zoom (2 Nov 2026, Mohammad: "when I zoom in the fps goes to shit"): while only the camera moves, the stack is not painted again from
// its shapes. The last exact picture is moved on the GPU by the camera alone (one pass), a wider, softer picture painted once covers a
// zoom out or a pan past it, a zoom in past 1.42 paints exactly again, and the camera holding still paints exactly.
test('a camera-only frame moves the last exact picture on the GPU instead of painting the organs again', async () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // Only the camera: the content key leaves the view out, and the base must be of the same content.
  assert.match(gl, /const contentKey = \(cw, ch\) => \{[^\n]*\n\s+if \(ckVer !== ver \|\| ckLive !== liveVer \|\| ckPage !== pageVer \|\| ckW !== cw \|\| ckH !== ch\) \{\n\s+ckVer = ver; ckLive = liveVer; ckPage = pageVer; ckW = cw; ckH = ch;\n\s+ckStr = `\$\{ver\}\|\$\{liveVer\}\|\$\{pageVer\}\|\$\{cw\}x\$\{ch\}`;/);
  assert.match(gl, /const moveOk = \(ck, cw, ch\) => !!\(moveP && painter && watch && liveNow\(\) && !pending\(\) && w === cw && h === ch && \(base\?\.ck === ck \|\| exactAt\?\.ck === ck\)\);/);
  assert.match(gl, /if \(!unchanged && moveOk\(ck, cw, ch\)\) \{\n\s+if \(moveFrame\(m, ck, cw, ch\)\) \{ keepKey\(\); return true; \}/);
  // The moved frame paints no shape: one draw of the move program.
  const mf = gl.slice(gl.indexOf('function moveFrame('), gl.indexOf('    stage(slot, name, tex, rect'));
  assert.ok(mf.length > 200);
  assert.doesNotMatch(mf.replace(/paintStack\(p, null, mvM\.fb, cw, ch, null, null\);/, ''), /paintStack|paintGroup|layMasked/);
  assert.match(mf, /if \(s > base\.s \* MOVE_ZOOM_IN\) return false;/);
  assert.match(mf, /exactAt = null; kAt\.ok = false; mvShown = true;/, 'the next exact render draws the whole');
  // The stage draws on until the exact paint; the overlays' stack (a shared painter) never moves.
  assert.match(gl, /get fading\(\) \{ return fading\(\) \|\| \(mvShown && performance\.now\(\) - mvAt < 4 \* MOVE_SETTLE_MS \+ 500\); \}/);
  assert.match(gl, /export function createOrganStack\(gl, \{ painter: shared = null, moves = !shared \} = \{\}\) \{/);
  assert.match(veins, /get fading\(\) \{ return stack\.fading; \}/);
  // The geometry: inside within a pixel, the margin view centred and MOVE_MARGIN times wider.
  const { viewInside, marginView, MOVE_MARGIN } = await import('../src/ui/organs-gl.js');
  const m = [2, 0, 0, 2, -100, -50];
  assert.equal(viewInside(m, m, 800, 600), true);
  assert.equal(viewInside(m, [2.4, 0, 0, 2.4, -150, -80], 800, 600), true, 'a zoom in about the middle stays inside');
  assert.equal(viewInside(m, [1.8, 0, 0, 1.8, -60, -20], 800, 600), false, 'a zoom out leaves it');
  assert.equal(viewInside(m, [2, 0, 0, 2, -130, -50], 800, 600), false, 'a pan leaves it');
  const p = marginView(m, 800, 600);
  assert.equal(viewInside(p, [1.8, 0, 0, 1.8, -60, -20], 800, 600), true, 'the margin holds that zoom out');
  assert.equal(viewInside(p, [2, 0, 0, 2, -130, -50], 800, 600), true, 'and that pan');
  assert.ok(Math.abs(Math.sqrt(p[0] * p[3]) * MOVE_MARGIN - 2) < 1e-9);
  // The centre of the canvas stays where it is.
  assert.ok(Math.abs(p[0] * ((400 - m[4]) / 2) + p[4] - 400) < 1e-9 && Math.abs(p[3] * ((300 - m[5]) / 2) + p[5] - 300) < 1e-9);
});

// Next-view pre-render (view switch): a camera move that lands back on the view it set off from, its content unchanged, puts back the
// exact picture copied as the move began (mvS) instead of painting the organs from shapes again. Anatomy -> Circuit -> Anatomy at its
// home framing then lands with no organ repaint (perf-labels-zoom-review.md P4).
const ogl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
const lobRender = ogl.slice(ogl.indexOf('    render(m, cw, ch) {'), ogl.indexOf('// (Only the camera moved: the last pictures moved on the GPU'));
const lands = ogl.match(/const landsOnBase = \(m, ck, cw, ch\) => \{[\s\S]*?\n {2}\};\n/)[0];

test('a move landing on its base view puts the base copy back, on the GPU, before any paint', () => {
  assert.match(lobRender, /if \(\(settle \|\| !unchanged\) && landsOnBase\(m, ck, cw, ch\)\) \{/);
  assert.match(lobRender, /gl\.bindFramebuffer\(gl\.READ_FRAMEBUFFER, mvS\.fb\); gl\.bindFramebuffer\(gl\.DRAW_FRAMEBUFFER, fbo\);/);
  assert.match(lobRender, /gl\.blitFramebuffer\(0, 0, cw, ch, 0, 0, cw, ch, gl\.COLOR_BUFFER_BIT, gl\.NEAREST\);/, 'a 1:1 copy: the exact pixels');
  assert.match(lobRender, /setExact\(m, ck\); moveStats\.restored\+\+;\n\s+return true;/);
  assert.doesNotMatch(lobRender, /paintStack|paintGroup/, 'nothing painted from shapes on the way');
});

test('only for the same content and size, the same view to a hundredth of a pixel, and no view picture fading in', () => {
  assert.match(lands, /base\.ck !== ck/);
  assert.match(lands, /w !== cw \|\| h !== ch \|\| mvS\.w !== cw \|\| mvS\.h !== ch/);
  assert.match(lands, /Math\.abs\(b\[4\] - m\[4\]\) > 0\.01 \|\| Math\.abs\(b\[5\] - m\[5\]\) > 0\.01/);
  assert.match(lands, /for \(const L of live\[1\]\.values\(\)\) if \(L\.from != null\) return false;/);
});

test('next-view pre-render: the circuit\'s idle paints the margin the change back would paint in its tap frame', () => {
  const pm = ogl.slice(ogl.indexOf('    prepMove(m, cw, ch) {'), ogl.indexOf('    get texture() { return stackTex; },'));
  assert.match(pm, /if \(!moveOk\(ck, cw, ch\) \|\| !ensureBase\(ck, cw, ch\)\) return false;/);
  assert.match(pm, /\|\| margOk\(ck, s, m, cw, ch\)\) return false;\n\s+paintMargin\(m, s, ck, cw, ch\);/, 'only when the tap frame would paint it');
  const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(vg, /prepAhead\(m, !plate && !!look\.plate\?\.stack && !!stack\?\.has\(0\)\);/, 'while the plate is faded out whole');
  assert.match(vg, /if \(!prepOff && !prepDone\) prepOff = whenQuiet\(prepRun, 700\);/, 'once the page is left alone, never in a frame');
});
