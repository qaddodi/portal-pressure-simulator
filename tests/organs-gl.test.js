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


// The bowel floats up on the ascites. Painted live, its picture is moved on the GPU while the fluid eases (and made again once it
// settles), under the rest of the gut, the gut's opacity and mask laid over the two as one group (as the SVG lays it): nothing is drawn again while the
// fluid eases (it was every half step of the bulge, the bowel standing still until each new picture landed).
test('the bowel is a picture at rest gathered under the gut, moved by its float on the GPU', () => {
  const stage = stageSource();
  // (Handed to the stack when the float moved, or when a setLive made new cuts: handed on every draw it marked the textures new, so no rest frame
  // was the blood's alone; 13 Nov 2026, tests/heat-rest-picture.test.js.)
  assert.equal((stage.match(/organs\.setLive(?:All)?\([^)]*\); live\.liveSet = (?:true|false); live\.bowelAt = NaN;/g) || []).length, 4, 'every setLive hands the float again');
  // The picture: the bowel alone, painted where the bowel is (at), its float held in the pictures' state while the fluid eases and
  // taken once it settles.
  // On the GPU: moved by whole device pixels, drawn under the gut's picture, laid with the gut's opacity.
});

// A live organ's ease changes its own box, not the screen: the stack is drawn again only there (the boxes of the ops whose outline,
// frame or paint changed, old and new), and the composite draws the cells over that box, as the ascites pool's. A view change or a
// new layer set still draws the whole. (Performance review after the GPU organs, 22 Oct, item 1.)

// On by default (Mohammad, 22 Oct 00:17Z: "Do the GPU draw for everything"), no off switch (switches deleted, 2 Nov 2026); never on
// a software renderer unless forced (the browser checks run there, and keep the one picture).
test('the GPU organs are on by default, with no switch to turn them off', async () => {
  const { gpuProbe } = await import('../src/ui/gpu-probe.js');
  assert.equal(gpuProbe.gpuOrgans, true);
});


// A new clip's coverage was cleared over the whole canvas before it was drawn, for every clipped group on every frame; a later op
// with the same clip is cut to the clip's box, so clearing the clip's box (with the op's own) is the same. (Review item 5.)

// What eases (outlines, frames, the parts' own opacities) the painter reads from the page at each paint, so the live specs are
// read again only when what is in them changes (a part hidden or shown, the liver's mask, the ghost line, a lens, the theme);
// they were read again, about fifty computed styles, on every frame of an ease. (Review item 3.)

// Review item 3: with live organs the stack no longer describes every op as strings on every blood frame. It watches exactly the
// elements the painter reads from (each op's element, its chain, its clip's, the group's root and mask, and each entry's own frame
// element) and renders again only after a write that left one different, taken synchronously so the same task's composite sees it.
test('the live organs are described again only after a write to what the painter reads', () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  const stage = stageSource();
  const els = gl.slice(gl.indexOf('const elsOf = '), gl.indexOf('function watchLive()'));
  for (const k of ['out.add(spec.root)', 'out.add(op.el)', 'out.add(op.geom?.el)', 'for (const e of op.chain || []) out.add(e)', 'out.add(op.clip.geom?.el)', 'for (const e of op.clip.chain || []) out.add(e)', 'elsOf(spec.mask, out)']) assert.ok(els.includes(k), k);
  // The cuts' frames are read from their group (the gut, the stomach), not the mask: that element is watched too.
  assert.equal((stage.match(/\{ spec, el: g, get m\(\) \{ return matOfEl\(g\); \}/g) || []).length, 2);
});

// The organs' pictures painted on the GPU from their shapes (Mohammad, 25 Oct: no SVG → image → canvas → read back → upload on the
// way): each layer the painter can read is painted into a texture of its own that stays on the GPU; only an unreadable one is rasterized.
test('the organ layers are painted on the GPU from their shapes, with no SVG picture, canvas, read back or upload', () => {
  const stage = stageSource();
  // Read with their nested masks and see-through groups; the gut's and the stomach's own masks are left to the cuts.
  // Never an SVG copy: a layer that cannot be read leaves the organs on the page's SVG; the picture given up when the state moves on,
  // a few ms painted a frame.
  for (const gone of ['async function rasterPlate', 'function plateMarkup', 'function plateBuild', 'async function svgPicture', 'async function makeGutPic', 'XMLSerializer', "'image/svg+xml'"]) assert.ok(!stage.includes(gone), gone);
  // (Not a fixed 6 ms a frame of its own any more: a step is what is left of the allowance every refinement shares, in a frame outside a gesture: refine.js.)
  // Nested groups laid in layers of their own, with their opacity and mask, as the browser lays them.
  // (Last in, first painted: the nested group's shapes into its layer, its mask into the mask layer, then the layer laid over.)
  // A group painted straight onto the picture only when that is the same picture (no opacity or mask of its own); otherwise in
  // its own layer, laid once whole; either way a few ops a step.
  // Shapes keep their arrays on the GPU while kept, given back when let go.
});

// The painting time limit holds inside nested groups too (review, 25 Oct): a nested group, or a picture's group with a mask or an
// opacity of its own, was painted whole within one op, so a picture of the gut could still make one long frame.
test("a picture's painting stops at its time limit at any depth of nested groups, and resumes where it stopped", () => {
  const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const run = paint.slice(paint.indexOf('function runJob('), paint.indexOf('function paintOps('));
  // The time is checked before every op of every frame, whatever its depth, after at least one op (so each step moves on).
  // (A nested layer's composite is a unit of its own, checked the same way: Holding 120 Hz recs §15.)
  assert.doesNotMatch(run, /paintOps\(|paintGroup\(/, 'no nested group painted whole inside a step');
  // The nested layers hold a half-painted group between steps: one picture's job at a time, and a job whose layers were made
  // again meanwhile (the canvas grew) starts its picture over rather than lay a wiped layer.
  // The live painting never uses those layers (it reads no nested groups): the picture's start at depth 1.
});



// Zoom (2 Nov 2026, Mohammad: "when I zoom in the fps goes to shit"): while only the camera moves, the stack is not painted again from
// its shapes. The last exact picture is moved on the GPU by the camera alone (one pass), a wider, softer picture painted once covers a
// zoom out or a pan past it, a zoom in past 1.42 paints exactly again, and the camera holding still paints exactly.
test('a camera-only frame moves the last exact picture on the GPU instead of painting the organs again', async () => {
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  // Only the camera: the content key leaves the view out, and the base must be of the same content.
  // The moved frame paints no shape: one draw of the move program.
  const mf = gl.slice(gl.indexOf('function moveFrame('), gl.indexOf('    stage(slot, name, tex, rect'));
  assert.ok(mf.length > 200);
  assert.doesNotMatch(mf.replace(/paintStack\(p, null, mvM\.fb, cw, ch, null, null\);/, ''), /paintStack|paintGroup|layMasked/);
  // The stage draws on until the exact paint; the overlays' stack (a shared painter) never moves.
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

// A camera move that lands back on the view it set off from is painted exactly, like any landing (13 Nov 2026): putting back the copy taken as
// the move began left pieces of the bowel and the stomach in the wrong places after Anatomy -> Circuit -> Anatomy on Mohammad's iPhone.
const ogl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
const lobRender = ogl.slice(ogl.indexOf('    render(m, cw, ch) {'), ogl.indexOf('// (Only the camera moved: the last pictures moved on the GPU'));

test('a move landing on its base view is painted again, never the base copy put back', () => {
  assert.doesNotMatch(lobRender, /blitFramebuffer/, 'no copy laid in place of the stack at a landing');
});


