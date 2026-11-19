// The labels' pointer targets in a change between the views (18 Nov 2026, the play-tester: the DOM label groups hold their old places for the whole
// change, then jump 234 to 683 px in one frame as it lands, while the GPU's pictures ride the vessels and cross over). A click in between landed where
// no label was drawn. As for a camera ride (R09, label-gl.js displacedNow), the labels' pointer events wait while the pictures stand off their groups:
// #labels.lb-displaced is on for the length of the crossing and off once it has landed. Node, the real stage with the GPU labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';

test('the labels\' pointer targets wait for the whole of a change between the views, and are back after it', async () => {
  const { st, frame, page } = await bootGL({ w: 1200, h: 800, labels: 'all' });
  for (let i = 0; i < 150; i++) await frame();
  const el = page.document.getElementById('labels');
  assert.equal(el.classList.contains('lb-displaced'), false, 'at rest the labels take pointers');
  for (const v of ['circuit', 'anatomy']) {
    st.setView(v);
    let held = 0;
    for (let i = 0; i < 40; i++) { await frame(); if (el.classList.contains('lb-displaced')) held++; }
    assert.ok(held >= 30, `${v}: held off through the change's frames (${held} of 40)`);
    for (let i = 0; i < 80; i++) await frame();
    assert.equal(el.classList.contains('lb-displaced'), false, `${v}: taking pointers again once it has landed`);
  }
});
