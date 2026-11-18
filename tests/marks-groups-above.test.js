// The vessel marks painter (stage-marks.js marksBuild) takes each shape's opacity and whether it is shown from the shape and the groups above it, up to the overlays' root. The groups'
// part is worked out once for each group in a build (the deck start's 'outlines: marks' ran 25 to 29 ms with a style read of every group for every mark, 18 Nov 2026): the same
// marks as before, a group hidden, clipped or masked taking its marks away and the opacities multiplying.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';

test('a mark carries the opacity of the groups above it; a group not displayed, clipped or masked draws none', async () => {
  await bootGL({ w: 400, h: 300, labels: 'none' });
  const host = document.createElement('div');
  host.innerHTML = '<svg id="mgRoot" xmlns="http://www.w3.org/2000/svg"><g id="mgOver">' +
    '<g id="a" style="opacity:0.5"><g id="b" style="opacity:0.5"><rect id="r1" x="0" y="0" width="10" height="10" style="fill:rgb(255,0,0);stroke:none"/></g></g>' +
    '<g id="hid" style="display:none"><rect id="r2" x="0" y="0" width="10" height="10" style="fill:rgb(0,255,0);stroke:none"/></g>' +
    '<g id="clip" clip-path="url(#c)"><rect id="r3" x="0" y="0" width="10" height="10" style="fill:rgb(0,0,255);stroke:none"/></g>' +
    '<g id="plain"><rect id="r4" x="0" y="0" width="10" height="10" style="fill:rgb(255,255,0);stroke:none;opacity:0.8"/></g>' +
    '</g></svg>';
  document.body.appendChild(host);
  const { createMarks } = await import('../src/ui/stage-marks.js');
  const over = document.getElementById('mgOver'), root = document.getElementById('mgRoot');
  const marks = createMarks({ gOver: over, glLines: true, ov: { k: over }, svg: root, themeKey: () => 't', toRGB: () => [0, 0, 0], wrapCls: () => '' });
  marks.marksSync();
  const draws = marks.mk.draws;
  // each draw: { col [r g b], alpha, ... }: found by colour
  const byColour = (r, g, b) => draws.filter((d) => Math.round(d.col[0] * 255) === r && Math.round(d.col[1] * 255) === g && Math.round(d.col[2] * 255) === b);
  assert.ok(draws.length > 0, 'marks were drawn');
  const a1 = byColour(255, 0, 0)[0], a4 = byColour(255, 255, 0)[0];
  assert.ok(a1 && Math.abs(a1.alpha - 0.25) < 1e-6, `two groups of 0.5 make a quarter (${a1 && a1.alpha})`);
  assert.ok(a4 && Math.abs(a4.alpha - 0.8) < 1e-6, `its own opacity alone (${a4 && a4.alpha})`);
  assert.equal(byColour(0, 255, 0).length, 0, 'a hidden group draws none');
  assert.equal(byColour(0, 0, 255).length, 0, 'a clipped group draws none');
  assert.ok(document.getElementById('r1').hasAttribute('data-gl') && !document.getElementById('r2').hasAttribute('data-gl'));
});

test('markMatrix with the build\'s memo gives the product the plain walk gives, for nested groups with transforms', async () => {
  // (the page of the test above: one boot a process)
  const host = document.createElement('div');
  host.innerHTML = '<svg id="mmRoot" xmlns="http://www.w3.org/2000/svg"><g id="mmOver"><g transform="translate(10 20)"><g transform="scale(2)"><rect id="m1" width="4" height="4"/></g><g><rect id="m2" width="4" height="4" transform="rotate(30)"/></g></g><rect id="m3" width="4" height="4"/></g></svg>';
  document.body.appendChild(host);
  const { markMatrix } = await import('../src/ui/stage-marks.js');
  const over = document.getElementById('mmOver'), memo = new Map();
  for (const id of ['m1', 'm2', 'm3', 'm1']) {
    const el = document.getElementById(id), a = markMatrix(el, over, getComputedStyle(el)), b = markMatrix(el, over, getComputedStyle(el), memo);
    assert.deepEqual(b, a, id);
  }
  assert.ok(memo.size >= 3, 'the groups above are kept');
});
