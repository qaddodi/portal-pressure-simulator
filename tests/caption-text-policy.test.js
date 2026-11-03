// Two text policies (R07). Constant screen size is the drawer's default: the transform places and turns words, and a caller that sizes its own
// words for the screen (svg-gl.js: font and halo times the viewBox map) is not scaled twice. Layer-scaled is asked for by caption-gl while the
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
const { createCaptionGL } = await import('../src/ui/caption-gl.js');
const tr = readFileSync(new URL('../src/ui/trace-gl.js', import.meta.url), 'utf8');
const svg = readFileSync(new URL('../src/ui/svg-gl.js', import.meta.url), 'utf8');

function rig() {
  const log = [];
  const state = { textScale: undefined };
  const ctx = new Proxy({ end() { return true; }, fillText(t) { log.push(['fill', t, state.textScale, state.scale]); }, strokeText(t) { log.push(['stroke', t, state.textScale, state.scale]); }, scale(k) { state.scale = k; }, restore() { state.scale = 1; } }, {
    get: (t, k) => (k in t ? t[k] : k === 'textScale' ? state.textScale : () => {}),
    set: (t, k, v) => { if (k === 'textScale') state.textScale = v; return true; },
  });
  const pen = { ctx, w: 200, h: 100, gpu: true };
  const box = document.createElement('div');
  document.body.append(box);
  const cap = createCaptionGL(box, { make: () => ({ lost: false, dispose() {} }), pen: () => pen });
  const run = { size: 12, weight: 400, ls: 0.5, fill: 'rgba(0,0,0,1)', op: 1, upper: false, mr: 0 };
  cap.look('a', { lh: 1, gap: 0, halo: 2, haloC: 'rgba(255,255,255,1)', runs: { name: run } });
  cap.measure('a', [[['Hepatic', 'name']]]);
  cap.put('a', { x: 50, y: 50, show: 1 });
  return { cap, log, state };
}

test('while the layer is scaled, the words are drawn layer-scaled; at rest and for a pan they are not', async () => {
  const R = rig();
  await new Promise((r) => setTimeout(r, 60));   // (the frame the setup asked for)
  R.log.length = 0;
  R.cap.view(0.5, 20, 20);
  await new Promise((r) => setTimeout(r, 60));
  const scaled = R.log.filter((l) => l[1] === 'Hepatic');
  assert.ok(scaled.length >= 2, 'halo and ink drawn');
  assert.ok(scaled.every((l) => l[2] === true && l[3] === 0.5), 'the policy is on while the 0.5 scale is');
  assert.equal(R.state.textScale, false, 'off again after the frame');
  R.log.length = 0;
  R.cap.view(1, 30, 30);   // (a pan: k is 1, nothing to scale)
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(R.log.length && R.log.every((l) => l[2] === false));
  R.log.length = 0;
  R.cap.view(1, 0, 0);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(R.log.length && R.log.every((l) => l[2] === false));
});

test('the drawer scales size, letter spacing and halo by the transform only when asked, and svg-gl is never asked', () => {
  assert.match(tr, /const k = textScaled \? sc\(\) : 1;\s*G\.text\(t, px, py, k === 1 \? st\.font : scaledFont\(st\.font, k\), colour, align\(\), st\.textBaseline, st\.globalAlpha, sw \* k, ang \? TURN : null, st\.ls \* k\);/);
  assert.match(tr, /set textScale\(v\) \{ textScaled = !!v; \}/);
  assert.doesNotMatch(svg, /textScale/, 'svg-gl sizes its own words for the screen (the viewBox map), so the drawer must not scale them again');
  assert.match(svg, /slotFor\(L, k\)/);
});
