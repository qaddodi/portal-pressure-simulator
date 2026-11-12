// Mac with the Tests card open (screenshot check, 11 Nov 2026, 1440 x 900, Dark): the card stood over the spleen's right half, and SPLEEN was left
// off, its place under the card. An organ name now skips any spot of its organ a card covers (10 px off it, as a name under a card is hidden) and
// takes one it shows in (stage-label-solve.js, the organ names' spots, unblocked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const W = 1440, H = 900;
test('Mac, a card over half the spleen: SPLEEN stands beside it, clear of the card', async () => {
  // (The labels read the cards' boxes from an IntersectionObserver's first report: one that reports at once, as a browser does after its layout.)
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.els = []; } observe(el) { this.els.push(el); this.t ||= setTimeout(() => this.cb(this.els.map((e) => ({ target: e, boundingClientRect: e.getBoundingClientRect() }))), 0); } disconnect() {} unobserve() {} };
  const { st, page } = await bootGL({ w: W, h: H, dpr: 1 });
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  const spleen = () => { const d = st.labelSnapshot().items.find((x) => x.key === 'o:Spleen' && x.a > 0.5); return d && [d.x, d.y, d.x + d.w, d.y + d.h]; };
  for (let i = 0; i < 60; i++) await step();
  const open = spleen();
  assert.ok(open, 'SPLEEN shows with no card');
  // (The card from the middle of SPLEEN's own place to the right edge, the figure left where it is: the Mac's camera does not refit for it.)
  const left = Math.round((open[0] + open[2]) / 2);
  const d = page.document.createElement('section');
  Object.assign(d, { className: 'dock stage-blocker', id: 'dock', textContent: 'Tests' }); d.dataset.safe = 'right';
  d.getBoundingClientRect = () => ({ left, top: 60, right: W - 12, bottom: H - 12, width: W - 12 - left, height: H - 72, x: left, y: 60 });
  (page.document.querySelector('.app') || page.document.body).appendChild(d);
  dispatchEvent(new Event('resize'));
  for (let i = 0; i < 200; i++) await step();
  const now = spleen();
  assert.ok(now, `SPLEEN still shows, the card at x ${left} (${JSON.stringify(open)})`);
  assert.ok(now[2] <= left - 4, `clear of the card: ${JSON.stringify(now)}, the card from x ${left}`);
});
