// E1: the engine's worker starts first and loads while the figure is built; no model frame is taken in before the healthy reference is set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const body = main.slice(main.indexOf('async function main() {'));
const at = (s) => { const i = body.indexOf(s); assert.ok(i > 0, `main() has ${s}`); return i; };

test('boot starts the worker, builds the stage while it loads, then waits for the engine and its answers', () => {
  const order = [at('const engineUp = startHost();'), at('stage = createStage({'), at('await engineUp;'), at("host.request('healthyProfile')"), at("store.set({ healthy:")];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(body.split('await startHost()').length, 1, 'main() no longer waits on the worker before the stage');
});

test('the healthy reference and the preset list are in the store before the first model frame is taken in', () => {
  assert.ok(at("store.set({ healthy:") < at("host.on('frame', onFrame)"));
  assert.ok(at("store.set({ presetList: presets })") < at("host.on('frame', onFrame)"));
  assert.ok(at('createStage({') < at("host.on('frame', onFrame)"));
});

test('the marks stay meaningful: booted is marked at the end of main(), figure-ready by the stage on its first drawn frame', () => {
  assert.ok(at("performance.mark?.('pps:booted')") > at("host.on('frame', onFrame)"));
  assert.match(readFileSync(new URL('../src/ui/stage-tubes.js', import.meta.url), 'utf8'), /performance\.mark\?\.\('pps:figure-ready'\)/);
});
