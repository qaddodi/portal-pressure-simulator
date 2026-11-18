// A zoom's steps (a card pick frames the vessel with one; 18 Nov 2026, the play-tester's ?perf at 390 px: stage-read:overReadEarly 25 to 60 ms on nearly every
// frame for 500 ms after a pick): the camera writes --clamp-sw, --clamp-fs and --halo-k to the clamps' and halos' groups at each step, and each write
// dropped a group's reading. Its own file: the stage boots once to a process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';

test('a zoom (a card pick frames the vessel with one) reads the overlays\' groups again in no frame of its steps', async () => {
  const { st, frame } = await bootGL({ w: 390, h: 844, dpr: 3, coarse: true });
  for (let i = 0; i < 150; i++) await frame();
  let groups = 0;
  const was = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el, p) => { groups++; return was(el, p); };
  try {
    st.zoomIn();
    for (let i = 0; i < 45; i++) await frame();
  } finally { globalThis.getComputedStyle = was; }
  assert.ok(groups <= 40, `${groups} style reads in the 45 frames of a zoom (was 106 on a bare figure: a group read again at every step)`);
});

