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
  assert.match(stage, /if \(!\(await rasterPlate\(slot, r, scale, L, false, live\)\) \|\| v !== veins \|\| !v\.organs\) return false;/, 'a layer given up gives up the set');
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
  assert.match(gl, /setLive\(organs, masks\) \{ liveOrgans = organs \|\| new Map\(\); cuts = masks \|\| new Map\(\); liveVer\+\+; \}/, 'a live change moves its own version');
  assert.match(gl, /stale: \(m, cw, ch\) => drawnKey !== `\$\{ver\}\|\$\{liveVer\}\|/);
  assert.match(gl, /const at = `\$\{ver\}\|\$\{m\.join\(','\)\}\|\$\{cw\}x\$\{ch\}`, same = at === drawnAt && !!painter;/, 'the same view and layers: only what changed');
  assert.match(gl, /if \(a\[i\]\.ops\[k\]\[0\] !== b\[i\]\.ops\[k\]\[0\]\) \{ add\(a\[i\]\.ops\[k\]\[1\]\); add\(b\[i\]\.ops\[k\]\[1\]\); \}/, "an op's old and new boxes");
  assert.match(gl, /if \(!whole && !dirty\) \{ painter\?\.endFrame\(\); return null; \}/, 'nothing changed: nothing drawn');
  assert.match(gl, /return whole \? true : dirty;/);
  assert.match(gl, /painter\.paintGroup\(o\.spec, mul\(m, o\.m\), w, h, fbo, within\)/);
  assert.match(gl, /cut\.opacity \?\? 1, within\);/);
  // The painter: every op's box is the one it paints within, so a signature's box covers its pixels.
  assert.match(paint, /function paintOps\(spec, m, into, within = null\)/);
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
  assert.match(src, /tol = Math\.min\(0\.5, 2 \*\* Math\.floor\(Math\.log2\(0\.2 \/ sc\)\)\);/);
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
  assert.match(paint, /for \(const el of op\.chain\) a \*= liveO\(el, CS_O\);/);
  assert.match(paint, /let b = lv\.alpha > 0 \? devBox\(sh\.box, om, grow\) : null, cm = null, csh = null;/);
  assert.match(paint, /gl\.uniform1f\(U\.alpha, at\.alpha\);/);
  assert.match(paint, /if \(!\(o > 0\) && !ownO\(el\)\) return;/, 'a part at nothing by its own setting is kept, to show as it eases');
  // The stack asks the painter every frame while groups are live, and draws nothing when nothing changed.
  assert.match(gl, /\|\| !!\(painter && \(liveOrgans\.size \|\| cuts\.size\)\),/);
  assert.match(gl, /if \(key === drawnKey && !\(painter && \(liveOrgans\.size \|\| cuts\.size\)\)\) return null;/);
});
