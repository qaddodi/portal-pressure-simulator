// Two text policies (R07). Constant screen size is the drawer's default: the transform places and turns words, and a caller that sizes its own
// words for the screen (svg-gl.js: font and halo times the viewBox map) is not scaled twice. Layer-scaled is asked for by label-captions while the
// whole layer's view scales (the lobule's dive): ctx.textScale = true, and the drawer scales the glyphs, letter spacing and halo with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { createCaptions } = await import('../src/ui/label-captions.js');
const tr = readFileSync(new URL('../src/ui/trace-gl.js', import.meta.url), 'utf8');
const svg = readFileSync(new URL('../src/ui/svg-gl.js', import.meta.url), 'utf8');

test('the drawer scales size, letter spacing and halo by the transform only when asked, and svg-gl is never asked', () => {
  assert.match(tr, /const k = textScaled \? sc\(\) : 1;\s*G\.text\(t, px, py, k === 1 \? st\.font : scaledFont\(st\.font, k\), colour, align\(\), st\.textBaseline, st\.globalAlpha, sw \* k, ang \? TURN : null, st\.ls \* k\);/);
  assert.match(tr, /set textScale\(v\) \{ textScaled = !!v; \}/);
  assert.doesNotMatch(svg, /textScale/, 'svg-gl sizes its own words for the screen (the viewBox map), so the drawer must not scale them again');
  assert.match(svg, /slotFor\(L, k\)/);
});

// ── R17 (caption half): snapshot() reads what the last landed frame drew ──
test('snapshot: the names the last landed frame drew, view included; a failed frame changes nothing; the generation and seq count', async () => {
  const log = { ok: true };
  const box = document.createElement('div');
  document.body.append(box);
  box.getBoundingClientRect = () => ({ width: 200, height: 100, left: 0, top: 0, right: 200, bottom: 100 });
  const cap = createCaptions(box, { labelGL: () => ({ get lost() { return !log.ok; }, sync() {}, setHoles() {}, dispose() {} }) });
  const run = { size: 12, weight: 400, ls: 0, fill: 'rgba(0,0,0,1)', op: 1, upper: false, mr: 0 };
  cap.look('a', { lh: 1, gap: 0, halo: 0, haloC: '', runs: { name: run } });
  const size = cap.measure('a', [[['Hepatic', 'name']]]);
  cap.put('a', { x: 50, y: 40, show: 1, ms: 1 });
  cap.look('b', { lh: 1, gap: 0, halo: 0, haloC: '', runs: { name: run } });
  cap.measure('b', [[['Edge', 'name']]]);
  cap.put('b', { x: 2, y: 40, show: 1, ms: 1 });
  await new Promise((r) => setTimeout(r, 80));
  const s1 = cap.snapshot();
  assert.ok(s1.seq >= 1 && s1.w === 200 && s1.h === 100);
  const a = s1.items.find((i) => i.key === 'a'), b = s1.items.find((i) => i.key === 'b');
  assert.ok(Math.abs(a.x - (50 - size[0] / 2)) < 1e-6 && Math.abs(a.y - (40 - size[1] / 2)) < 1e-6 && Math.abs(a.w - size[0]) < 1e-6);
  assert.equal(a.clipped, false);
  assert.equal(b.clipped, true, 'a box reaching past the canvas is clipped');
  assert.ok(a.a > 0.99);
  // the dive's view moves and scales what is drawn
  cap.view(0.5, 20, 10);
  await new Promise((r) => setTimeout(r, 80));
  const s2 = cap.snapshot(), a2 = s2.items.find((i) => i.key === 'a');
  assert.ok(s2.seq > s1.seq);
  // (the places go through the view, the words keep their size)
  assert.ok(Math.abs(a2.x - (0.5 * 50 + 20 - size[0] / 2)) < 1e-6 && Math.abs(a2.w - size[0]) < 1e-6);
  // a frame that fails to land leaves the last snapshot as it was
  log.ok = false;
  const before = JSON.stringify(cap.snapshot());
  cap.view(1, 0, 0);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(JSON.stringify(cap.snapshot()), before);
  // content changes count a generation in the snapshot once a frame with them lands
  log.ok = true;
  const g = cap.snapshot().gen;
  cap.look('c', { lh: 1, gap: 0, halo: 0, haloC: '', runs: { name: run } });
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(cap.snapshot().gen > g);
  cap.dispose();
  assert.deepEqual(cap.snapshot().items, []);
});

test('scaled font texts are kept in a small map, cleared when the scale changes', () => {
  assert.match(tr, /const sfMap = new Map\(\);/);
  assert.match(tr, /if \(k !== sfK\) \{ sfK = k; sfMap\.clear\(\); \}/);
  assert.match(tr, /if \(sfMap\.size > 32\) sfMap\.clear\(\);/);
});
