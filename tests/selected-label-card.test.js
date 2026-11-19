// A selected label never stays on a card's glass (bible review 19 Nov 2026, STG-7 / LBL-8): with no free spot it hides and the card, which names the vessel,
// speaks for it. Before this the solve skipped the card test for a selected label (`if (it.sel) { it.hide = false; continue; }`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const W = 1440, H = 900;
test('Mac, a card laid over a selected vessel station\'s label: the label is not left on the card', async () => {
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.els = []; } observe(el) { this.els.push(el); this.t ||= setTimeout(() => this.cb(this.els.map((e) => ({ target: e, boundingClientRect: e.getBoundingClientRect() }))), 0); } disconnect() { clearTimeout(this.t); this.t = 0; } unobserve() {} };
  const { st, page } = await bootGL({ w: W, h: H, dpr: 1 });
  const { createCore } = await import('../src/worker-core.js');
  const { store } = await import('../src/ui/store.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  for (let i = 0; i < 40; i++) await step();
  store.set({ selection: { type: 'node', id: 'CONF' } });
  for (let i = 0; i < 60; i++) await step();
  const items = () => st.labelSnapshot().items.filter((x) => x.drawn > 0.5);
  const sel = items().find((x) => x.key === 'n:CONF');
  assert.ok(sel, `the selected label shows with no card`);
  // A card over the whole figure.
  const d = page.document.createElement('section');
  Object.assign(d, { className: 'dock stage-blocker', id: 'dock', textContent: 'Tests' }); d.dataset.safe = 'right';
  const L = 0, T = 0, R = W, B = H;   // (a card over the whole figure: no spot beside it exists, so the label can only hide)
  d.getBoundingClientRect = () => ({ left: L, top: T, right: R, bottom: B, width: R - L, height: B - T, x: L, y: T });
  (page.document.querySelector('.app') || page.document.body).appendChild(d);
  dispatchEvent(new Event('resize'));
  for (let i = 0; i < 120; i++) await step();
  const now = items().find((x) => x.key === sel.key);
  const onCard = now && now.x < R && now.x + now.w > L && now.y < B && now.y + now.h > T;
  assert.ok(!onCard, `the selected label is not left on the card: ${JSON.stringify(now)} against the card ${L},${T},${R},${B}`);
});
