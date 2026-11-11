import { stageSource } from './stage-src.js';
// P3: nothing the first screen does not need competes with it. The service worker's install leaves the fonts' Greek and extended-Latin
// subsets for later; it registers once the page has been left alone; the sinusoid's shaders start in a quiet moment; the boot and the
// first figure frame leave performance marks. Read as text (the build and the page need a browser or a bundler to run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const main = read('src/ui/main.js'), sin = read('src/ui/sinusoid-gl.js'), stage = stageSource();

test('the page registers the worker once it has been left alone, and asks for the rest later still', () => {
  assert.match(main, /const reg = \(\) => whenQuiet\(\(\) => \(window\.requestIdleCallback/);
  assert.match(main, /whenQuiet\(\(\) => r\.active\?\.postMessage\('pps:fill'\), 2000, 1000\)/);
});

test('the sinusoid\'s shaders start in a quiet moment, and the boot and the first figure frame are marked', () => {
  assert.match(sin, /whenQuiet\(\(\) => \{ if \(window\.requestIdleCallback\) requestIdleCallback\(startLater/);
  assert.match(main, /performance\.mark\?\.\('pps:booted'\)/);
  assert.match(stage, /performance\.mark\?\.\('pps:figure-ready'\)/);
});
