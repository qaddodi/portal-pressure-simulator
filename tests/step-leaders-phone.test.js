// A slide's step numbers on a phone held upright (395 × 859 CSS px, 3 device px each, a coarse pointer, the card docked under the figure)
// keep their leaders and dots, drawn by the GPU, in every frame, whichever renderer draws the number (5 Nov 2026, Mohammad on an iPhone, "Gut blood crosses two
// capillary beds in series": "1, 2, 3, 4, 5 with no leaders or dots, and they flicker"). label-gl hid a pinned label's leader and dot in the
// SVG as soon as it knew the label's point, and drew them itself only for a label whose picture it drew: a number the SVG drew (a look the
// layer cannot draw, its glyphs not in yet, a hold's first frame, its atlas place given back) stood with neither, and one that passed between
// the two blinked its marks. The marks of a label the GPU has no picture of are its own, drawn from their layout's geometry, never the SVG's
// (Mohammad's rule: fixes and fallbacks stay on the GPU). Here the numbers' words are in a face the layer cannot draw, so the SVG keeps them while the layer runs.
// The real stage in node (tests/stage-gl-boot.js); what shows each frame read from label-gl's snapshot and from the SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now } from './stage-gl-boot.js';
import { stepFrames } from './step-phone-frames.js';

const { st, page, frame } = await bootGL({ w: 395, h: 859, dpr: 3, coarse: true });

test('on a phone, a step number the SVG draws while the GPU draws the rest keeps its leader and dot, drawn by the GPU, in every frame from its moment on', async () => {
  const css = page.document.createElement('style');
  css.textContent = '#labels .lb.fx-step text { font-family: Georgia; }';   // (a face the layer has no outlines for: the SVG draws these labels)
  page.document.head.append(css);
  const seen = await stepFrames({ st, page, frame, now, gpu: true });
  assert.ok(seen.svgDrawn > 0, 'the numbers were drawn by the SVG in this case');
});
