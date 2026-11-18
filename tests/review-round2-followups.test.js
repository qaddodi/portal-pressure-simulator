import { stageSource } from './stage-src.js';
// Round 2 review follow-ups: (the streaks' density, BM9, went with the Streaks option, 16 Nov 2026) a narrowing's clamp and
// "60 %" fade in and out instead of popping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appCss } from './split-src.js';

globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};

test("a narrowing's clamp and label fade out from their own group, which the label layout never reads", () => {
  const stage = stageSource(), css = appCss();
  assert.match(stage, /clamps: s\('g'\), clampsOut: s\('g'\)/);
  assert.match(stage, /el\.classList\.replace\('clamp', 'clamp-out'\); el\.classList\.replace\('clamp-span', 'clamp-span-out'\); el\.classList\.replace\('clamp-label', 'clamp-label-out'\);/);
  assert.doesNotMatch(stage, /ov\.clampsOut\.querySelectorAll\('\.clamp/);
  // (The GPU draws the arrows: their fade rides on the draw's alpha, never on a baked SVG opacity.)
  assert.match(stage, /d\.fade \? olFaded\(d\) : d/);
  assert.match(stage, /const fadeEase = \(key\) => \(markA\.has\(key\) \? markA\.amount\(key\) : stentAmt\.has\(key\) \? stentAmt\.get\(key\) : clampEase\(key\)\);/);   // (a stent the figure brings in on its own clock: its amount by its key, 13 Nov 2026)
  assert.match(stage, /if \(el\._c || !glLines\) el\.style\.opacity = op;/);
  assert.match(stage, /!clampFading\(\) && !markA\.moving\(\) && !widthEasing/);
  assert.match(css, /\.clamp, \.clamp-out \{/);
  assert.match(css, /\.clamp-label, \.clamp-label-out \{ font-size/);
});
