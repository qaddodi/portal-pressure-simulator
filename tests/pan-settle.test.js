// L2 (heat-speed-label-lock.md, 12 Nov 2026): after a pure pan (same zoom, no turn) the labels keep every offset; only one the pan carried past
// the stage's edge or onto a card is placed again, by itself. No fresh solve of all of them, so nothing moves on its own once the figure stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const W = 1440, H = 900, CARD = 790;   // (the card's left edge: a card down the right side)
test('Circuit, a little zoomed in: a trackpad pan toward a card keeps every slot, and a reading the pan carried onto the card is placed again clear of it', async () => {
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.els = []; } observe(el) { this.els.push(el); this.t ||= setTimeout(() => this.cb(this.els.map((e) => ({ target: e, boundingClientRect: e.getBoundingClientRect() }))), 0); } disconnect() {} unobserve() {} takeRecords() { return []; } };
  const { st, page } = await bootGL({ w: W, h: H, dpr: 1 });
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  for (let i = 0; i < 60; i++) await step();
  const d = page.document.createElement('section');
  Object.assign(d, { className: 'dock stage-blocker', id: 'dock', textContent: 'Tests' }); d.dataset.safe = 'right';
  d.getBoundingClientRect = () => ({ left: CARD, top: 60, right: W - 12, bottom: H - 12, width: W - 12 - CARD, height: H - 72, x: CARD, y: 60 });
  (page.document.querySelector('.app') || page.document.body).appendChild(d);
  dispatchEvent(new Event('resize'));
  st.setView('circuit');
  for (let i = 0; i < 260; i++) await step();
  st.setCamera({ ...st.cameraState(), k: st.cameraState().k * 1.12 }, 10);
  for (let i = 0; i < 200; i++) await step();
  const slots0 = st.labelSlots(), laid0 = st.labelLaid().items, solves = st.labelStats().solves;
  const svg = page.document.querySelector('#stage'), Win = page.dom.window;
  for (let i = 0; i < 12; i++) {
    svg.dispatchEvent(new Win.WheelEvent('wheel', { deltaX: -20, deltaY: 0, deltaMode: 0, clientX: 700, clientY: 450, bubbles: true, cancelable: true }));
    await step();
  }
  for (let i = 0; i < 80; i++) await step();
  const slots1 = st.labelSlots(), laid1 = new Map(st.labelLaid().items.map((i) => [i.key, i.box]));
  assert.equal(st.labelStats().solves, solves, 'no fresh solve after a pure pan');
  // (Where each reading the pan carried would stand: 240 px to the right. One that stays inside the stage and off the card keeps its slot; one it
  // carried onto the card or past the edge may take another, and then shows clear of the card.)
  const carried = new Map(laid0.map((i) => [i.key, [i.box[0] + 240, i.box[1], i.box[2] + 240, i.box[3]]]));
  const changed = Object.keys(slots0).filter((k) => slots1[k] !== slots0[k]);
  for (const k of changed) {
    const b = carried.get(k);
    assert.ok(b && (b[2] > CARD || b[0] < 6 || b[2] > W - 6), `${k} kept its slot unless the pan put it on the card or past the edge (${slots0[k]} to ${slots1[k]}, carried ${b?.map(Math.round)})`);
    const now = laid1.get(k);
    if (now) assert.ok(now[2] <= CARD - 9.5, `${k}, placed again, stands clear of the card: ${now.map(Math.round)}`);
  }
  assert.ok(changed.some((k) => laid1.has(k)), `a reading the pan carried onto the card shows again beside it (${changed.join(' ') || 'none placed again'})`);
});
