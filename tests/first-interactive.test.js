// P3: nothing the first screen does not need competes with it. The service worker's install leaves the fonts' Greek and extended-Latin
// subsets for later; it registers once the page has been left alone; the sinusoid's shaders start in a quiet moment; the boot and the
// first figure frame leave performance marks. Read as text (the build and the page need a browser or a bundler to run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const build = read('scripts/build.mjs'), main = read('src/ui/main.js'), sin = read('src/ui/sinusoid-gl.js'), stage = read('src/ui/stage.js');

test('the install precaches every file but the fonts other than the Latin ones, which come when the page asks or when first drawn', () => {
  const m = build.match(/const later = cached\.filter\(\(f\) => (\/.*\/)\.test\(f\)\);/);
  assert.ok(m, 'build.mjs lists the later files');
  const re = eval(m[1]);   // (a literal pattern from our own source)
  const woff = readdirSync(new URL('../fonts/', import.meta.url)).filter((f) => f.endsWith('.woff2')).map((f) => `assets/${f.replace('.woff2', '-HASH1234.woff2')}`);
  const later = woff.filter((f) => re.test(f)), now = woff.filter((f) => !re.test(f));
  assert.deepEqual(now.sort(), ['assets/inter-latin-HASH1234.woff2', 'assets/jetbrains-mono-latin-HASH1234.woff2', 'assets/source-serif-4-latin-HASH1234.woff2']);
  assert.equal(later.length, woff.length - 3);
  assert.match(build, /const FILES = \$\{JSON\.stringify\(\['\.\/', \.\.\.install\]\)\};/);
  assert.match(build, /e\.data === 'pps:fill'/);
  assert.match(build, /if \(new URL\(req\.url\)\.pathname\.includes\('\/assets\/'\)\) \{ e\.respondWith\(caches\.match\(req\)\.then\(\(hit\) => hit \|\| fetch\(req\)\.then\(\(res\) => \{ keep\(e, req, res\)/, 'a subset (or optional chunk) fetched on first use is kept');
  assert.match(build, /const cached = files\.filter/, 'the lite art and guides stay out as before');
});

test('the page registers the worker once it has been left alone, and asks for the rest later still', () => {
  assert.match(main, /const reg = \(\) => whenQuiet\(\(\) => \(window\.requestIdleCallback/);
  assert.match(main, /whenQuiet\(\(\) => r\.active\?\.postMessage\('pps:fill'\), 2000, 1000\)/);
});

test('the sinusoid\'s shaders start in a quiet moment, and the boot and the first figure frame are marked', () => {
  assert.match(sin, /whenQuiet\(\(\) => \{ if \(window\.requestIdleCallback\) requestIdleCallback\(startLater/);
  assert.match(main, /performance\.mark\?\.\('pps:booted'\)/);
  assert.match(stage, /performance\.mark\?\.\('pps:figure-ready'\)/);
});
