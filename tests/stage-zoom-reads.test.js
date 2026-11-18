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
  const zoomReads = groups;
  // A card coming up puts its classes on the page and the app: the figure's groups are read again for none of them.
  const frameMod = await import('../src/ui/frame.js'), early = () => frameMod.perf().totals.asks['stage-read:overReadEarly'] || 0, e0 = early();
  groups = 0;
  const doc = globalThis.document, app = doc.querySelector('#app, .app');
  globalThis.getComputedStyle = (el, p) => { groups++; return was(el, p); };
  try {
    doc.documentElement.classList.add('vessel-card'); app?.classList.add('dock-open', 'panel-open');
    for (let i = 0; i < 30; i++) await frame();
  } finally { globalThis.getComputedStyle = was; }
  assert.equal(early() - e0, 0, "the overlays are read again for none of a card's classes (a full read of every group before: one 46 to 63 ms frame at each pick)");
  groups = zoomReads;
  assert.ok(groups <= 40, `${groups} style reads in the 45 frames of a zoom (was 106 on a bare figure: a group read again at every step)`);
});

