// Moving names fade (shared caption layer).
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


// A name a new layout puts in another place fades out where it stood and in at its new place (Mohammad, 8 Nov 2026: "item 10: yes, fade";
// 16 Nov: Lobule and Sinusoid use it as the Anatomy does; Reduce Motion too): the shared layer's moveFade, asked for with `fade`.
test('a moved name (fade asked for) is two pictures for D_SMALL: the old place fading out, the new fading in; never a slide, never a swap', async () => {
  const R = rig();
  await tick();
  R.cap.look('a', LOOK);
  R.cap.measure('a', [[['Portal venule', 'name']]]);
  R.cap.put('a', { x: 200, y: 100, show: 1 });
  for (let i = 0; i < 14; i++) await R.frame(40);   // (whole at its first place)
  R.alphas.length = 0; R.lists.length = 0;
  R.cap.put('a', { x: 200, y: 160, show: 1, fade: true });   // (60 px down, as the Lobule's Portal venule on a layer switch)
  await R.frame(0);
  const first = R.last.map((e) => e.alpha), xy = R.last.map((e) => [e.x, e.y]);
  assert.equal(R.last.length, 2, 'the old and the new picture are both drawn');
  assert.ok(first.every((v) => v > 0 && v < 1) || first.some((v) => v < 1), `neither is a whole swap (${first})`);
  assert.notDeepEqual(xy[0], xy[1], 'at two places: nothing slides between them');
  for (let i = 0; i < 12; i++) await R.frame(40);
  assert.equal(R.last.length, 1, 'the old picture is gone once it has faded');
  assert.equal(R.last[0].alpha, 1, 'the new one stands whole');
});

test('a move of 3 px or less, or one the owner does not ask to fade (it travels with the camera), is not faded', async () => {
  const R = rig();
  await tick();
  R.cap.look('a', LOOK);
  R.cap.measure('a', [[['Sinusoids', 'name']]]);
  R.cap.put('a', { x: 200, y: 100, show: 1 });
  for (let i = 0; i < 14; i++) await R.frame(40);
  R.cap.put('a', { x: 202, y: 102, show: 1, fade: true });
  await R.frame(0);
  assert.equal(R.last.length, 1, '2 px is the same place');
  R.cap.put('a', { x: 400, y: 300, show: 1 });   // (a name carried by a pan: no fade asked for)
  await R.frame(0);
  assert.equal(R.last.length, 1, 'one picture, at once');
  assert.equal(R.last[0].alpha, 1);
});
