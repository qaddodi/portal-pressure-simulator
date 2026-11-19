// Shared by home-fit-margins*.test.js (one stage per process: bootGL boots once).
// The anatomy's home framing keeps equal room above and below the figure's ink (Mohammad, 19 Nov 2026: "the zoom fit has a large margin on the bottom").
// The clipped gut art runs on to y ~1097 but its rectum fades out by RECTUM_FADE's end, so framing the invisible tail pushed the figure up and left the
// visible end (the colon, the appendix) far above the dock. The fit now frames the organs and the ascites in full and the gut's art only down to the
// bottom of what stands, and the figure is centred in the room the bars leave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const APPENDIX_BOTTOM = 995;   // (world y of the lowest organ: the appendix's tip)
const ESO_TOP = -40;           // (the esophagus's drawn top, where the fit stops)

export function homeFitTest(name, w, h) {
  test(`${name}: the home fit leaves the same room above the figure as below it`, async () => {
    const { st } = await bootGL({ w, h, dpr: 1 });
    for (let i = 0; i < 5; i++) pump(16);
    st.fit();
    for (let i = 0; i < 240; i++) pump(16);
    const gapTop = st.worldToLocal(600, ESO_TOP)[1], gapBottom = h - st.worldToLocal(600, APPENDIX_BOTTOM)[1];
    assert.ok(Math.abs(gapTop - gapBottom) <= 0.02 * h, `room above ${gapTop.toFixed(1)} px, below ${gapBottom.toFixed(1)} px of ${h}`);
  });
}
