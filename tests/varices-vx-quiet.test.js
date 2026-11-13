// Mac heat at rest, round 3 (13 Nov 2026): the varices' --vx colour was written into two overlay groups that are always empty (the varices
// are drawn by their channels), and nothing reads it; each write still made the GPU overlays read the group again and the glass look at its
// boxes again, about 1.7 times a second at rest in a healthy patient. It is now written only while a group holds something to colour.
// The real stage in node (tests/stage-gl-boot.js), the model playing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('the varices\' groups are left alone while empty: no --vx is written at rest, and the stage still runs', async () => {
  const { page, frame } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const stageOver = page.document.getElementById('stageOver');
  assert.ok(stageOver, 'the overlays are there');
  const writes = [];
  new page.dom.window.MutationObserver((list) => { for (const r of list) if (r.attributeName === 'style' && /--vx/.test(`${r.oldValue || ''} ${r.target.getAttribute('style') || ''}`)) writes.push(r); })
    .observe(stageOver, { subtree: true, attributes: true, attributeOldValue: true });
  for (let i = 0; i < 180; i++) await frame();   // (3 s of the playing model)
  pump(16.7);
  await new Promise((r) => setImmediate(r));
  assert.equal(writes.length, 0, 'no --vx written into an empty group');
  const withVx = [...stageOver.querySelectorAll('g')].filter((g) => /--vx/.test(g.getAttribute('style') || ''));
  assert.ok(withVx.every((g) => g.firstChild), 'any group carrying --vx holds something to colour');
});
