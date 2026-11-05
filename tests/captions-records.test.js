// The captions hand label-gl records (L3 P4): a caption's fade is the record's alpha, never a write to its group, so label-gl's watch of its
// labels sees nothing in a frame of a fade and reads no look again; new words change the group's text in place, never building it anew.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'matchMedia', 'addEventListener']) globalThis[k] ??= dom.window[k]?.bind ? dom.window[k].bind(dom.window) : dom.window[k];
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.Element = dom.window.Element;
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { createCaptions } = await import('../src/ui/label-captions.js');
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const LOOK = { lh: 1.2, gap: 0, halo: 0, haloC: '', runs: { name: { size: 12, weight: 600, ls: 0.5, fill: 'rgba(0, 0, 0, 1)', op: 1, upper: true, mr: 0 } } };
function rig() {
  const R = { passes: [], alphas: [], lists: [] };
  R.top = { gl: { isContextLost: () => false }, canvas: { width: 2000, height: 1000 }, present() { for (const p of R.passes) p.draw(); }, add(t) { R.passes.push(t); return () => {}; } };
  const labelGL = (svg, blocks, opts) => ({ lost: false, sync(list) { R.lists.push(list.map((e) => e.g)); for (const e of list) R.alphas.push(e.alpha); R.last = list.slice(); opts.host?.ask(); }, setHoles() {}, drawInto() {}, dispose() {} });
  R.near = document.createElement('div');
  R.box = document.createElement('div'); R.near.append(R.box); document.body.append(R.near);
  R.box.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500 });
  R.cap = createCaptions(R.box, { labelGL, deferred: true });
  R.cap.attach({ top: R.top, order: 2, near: R.near, active: () => true, scale: () => 2 });
  R.frame = async (ms) => { await tick(ms); R.cap.drawNow(); R.top.present(); };
  return R;
}

test('a fade is carried on the record: its alpha rises to 1 and the group is not written in any frame of it', async () => {
  const R = rig();
  await tick();
  R.cap.look('a', LOOK);
  R.cap.measure('a', [[['Space of Disse', 'name']]]);
  R.cap.put('a', { x: 200, y: 100, show: 1 });
  await R.frame(0); await R.frame(40);   // (its first frame at nothing is not handed over)
  assert.ok(R.last?.length === 1, 'the caption is handed over');
  const g = R.last[0].g, recs = [];
  const mo = new MutationObserver((rs) => recs.push(...rs));
  mo.observe(g, { subtree: true, childList: true, characterData: true, attributes: true });
  for (let i = 0; i < 14; i++) await R.frame(40);
  recs.push(...mo.takeRecords()); mo.disconnect();
  assert.deepEqual(recs.map((r) => `${r.type}:${r.attributeName ?? ''}`), [], 'nothing written to the group during the fade');
  assert.equal(g.style.opacity, '', 'the group carries no opacity of its own');
  const a = R.alphas;
  assert.ok(a.length > 3 && a[0] < 1, `the fade's alphas reach the drawer (${a.map((v) => v.toFixed(2)).join(' ')})`);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1] - 1e-9, 'rising');
  assert.equal(a.at(-1), 1, 'ends whole');
  assert.ok(R.last[0].look > 0, 'the record names its look');
});

test('new words change the group in place: the same group and text elements, a new look id', async () => {
  const R = rig();
  await tick();
  R.cap.look('a', LOOK);
  R.cap.measure('a', [[['Kupffer cell', 'name']]]);
  R.cap.put('a', { x: 200, y: 100, show: 1 });
  await R.frame(0); await R.frame(40);
  const e = R.last[0], g = e.g, te = g.querySelector('text'), look0 = e.look;
  assert.equal(te.textContent, 'KUPFFER CELL');
  const recs = [];
  const mo = new MutationObserver((rs) => recs.push(...rs));
  mo.observe(g, { childList: true });
  R.cap.measure('a', [[['Stellate cell', 'name']]]);
  await R.frame(0);
  recs.push(...mo.takeRecords()); mo.disconnect();
  assert.equal(R.last[0].g, g, 'the same group');
  assert.equal(g.querySelector('text'), te, 'the same text element');
  assert.equal(te.textContent, 'STELLATE CELL');
  assert.equal(recs.length, 0, 'no child of the group made or taken away');
  assert.notEqual(R.last[0].look, look0, 'a new look id for the new words');
  // A second line adds its text; going back to one takes it away.
  R.cap.measure('a', [[['Stellate', 'name']], [['cell', 'name']]]);
  await R.frame(0);
  assert.equal(g.querySelectorAll('text').length, 2);
  assert.equal(g.querySelector('text'), te, 'the first kept');
  R.cap.measure('a', [[['Hepatocyte', 'name']]]);
  await R.frame(0);
  assert.equal(g.querySelectorAll('text').length, 1);
  assert.equal(g.querySelector('text').textContent, 'HEPATOCYTE');
});
