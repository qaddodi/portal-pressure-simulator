// Labels as records (review L3): what label-gl.js draws a label's dot, leader and picture from is carried on the label's own record, not read
// back from the SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

installPage();   // (the stage's modules read the page's globals as they load)
const { createLabelLayer } = await import('../src/ui/stage-label-layer.js');

// A label layer with only what paintLeaders touches: the pool of blocks, the layout's frame, no explained label.
function layerFor(keys) {
  const pool = new Map(), live = { laidFrame: 7 };
  for (const k of keys) pool.set(k, { g: null, seen: 7, pos: { want: 0 } });
  const noop = () => {};
  const L = createLabelLayer({ explain: {}, late: noop, dprDots: noop, nextFrame: noop, pool, setA: noop, updateLabels: noop }, live);
  return { L, pool, live };
}

test('a layout\'s dots and leaders are written on each label\'s record as want bits (1 dot, 2 halo, 4 leader)', () => {
  const { L, pool } = layerFor(['n:PV', 'n:SMV', 'r:1']);
  L.paintLeaders([
    { k: 'l:n:PV', tag: 'path', at: { class: 'leader', 'data-k': 'n:PV', d: 'M0 0 L9 9' } },
    { k: 'h:n:PV', tag: 'circle', at: { class: 'leader-dot-halo', 'data-k': 'n:PV', cx: 0, cy: 0, r: '4' } },
    { k: 'd:n:PV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:PV', cx: 0, cy: 0, r: '2.4' } },
    { k: 'd:n:SMV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:SMV', cx: 0, cy: 0, r: '2.4' } },
    { k: 'al:x', tag: 'path', at: { class: 'leader', d: 'M0 0 L1 1' } },   // (a leader of no label's: no bits)
  ]);
  assert.equal(pool.get('n:PV').pos.want, 7);
  assert.equal(pool.get('n:SMV').pos.want, 1);
  assert.equal(pool.get('r:1').pos.want, 0);
});

test('the next layout\'s bits replace the last; a label it did not lay keeps its own, so its dot and leader fade with it', () => {
  const { L, pool, live } = layerFor(['n:PV', 'n:SMV']);
  L.paintLeaders([{ k: 'l:n:PV', tag: 'path', at: { class: 'leader', 'data-k': 'n:PV', d: '' } }, { k: 'd:n:SMV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:SMV' } }]);
  live.laidFrame = 8; pool.get('n:PV').seen = 8;   // (n:SMV is not in this layout: it fades out)
  L.paintLeaders([{ k: 'd:n:PV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:PV' } }]);
  assert.equal(pool.get('n:PV').pos.want, 1, 'its leader dropped, its dot given');
  assert.equal(pool.get('n:SMV').pos.want, 1, 'kept as it was');
});
