// Lite mode (Settings › Lite mode, or on by itself without a GPU): solid cards with no frosted glass, flat colour for
// glows, and camera jumps that fade the figure in instead of zooming. Each piece is checked here so a later style or
// a new glass card cannot bring the CPU-heavy effects back to lite mode unnoticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const main = read('../src/ui/main.js');
const util = read('../src/ui/util.js');
const stage = read('../src/ui/stage.js');
const lz = read('../src/ui/lobule-zoom.js');
const presenter = read('../src/ui/presenter.js');
const build = read('../scripts/build.mjs');
const pages = read('../.github/workflows/pages.yml');

test('Settings has a Lite mode switch that is saved and read back at start', () => {
  assert.match(main, /menuToggle\(liteOn\(\), '[a-z-]+', 'Lite mode'/);
  assert.match(main, /localStorage\.setItem\('pps\.lite', on \? '1' : '0'\)/);
  assert.match(main, /readLS\('pps\.lite'\)/);
  assert.doesNotMatch(main, /removeItem\('pps\.lite'\)/, 'the saved choice must not be dropped at start');
});

test('lite mode turns every backdrop blur off', () => {
  assert.match(css, /html\[data-lite\] \*, html\[data-lite\] \*::before, html\[data-lite\] \*::after \{ -webkit-backdrop-filter: none !important; backdrop-filter: none !important; \}/);
});

test('every frosted surface gets a solid background in lite mode', () => {
  // Without the blur a translucent glass card would show the figure through it: each one is made solid.
  for (const sel of ['.lb-glass', '.sv-legend', '.pz-shade', '.pz-shade.pz-card:not(.stack)', '.pz-shade.stack', '.pz-data.pz-data', '.pz-bar', '.pz.stack .pz-bar', '.cl-glass', '.toast', ':is(.lz-lab, .lz-zone, .sv-region)::before']) {
    const lite = [...css.matchAll(/^html\[data-lite\][^{]*\{[^}]*background:[^}]*\}/gm)].map((m) => m[0]);
    assert.ok(lite.some((r) => r.includes(sel)), `${sel} has no solid lite background`);
  }
});

test('glows are flat in lite mode', () => {
  assert.match(css, /html\[data-lite\] :is\([^)]*#heatGlow[^)]*\) \{ filter: none; \}/);
  assert.match(css, /html\[data-lite\] \.vg\.is-sel \.v-shadow \{ filter: none; \}/);
  assert.match(css, /html\[data-lite\] \.vg\.shunt-target :is\(\.v-lumen, \.v-lumenP\) \{ filter: none; stroke: var\(--accent\); \}/);
});

test('lite mode jumps the camera and fades the figure in', () => {
  assert.match(util, /export const lite = \(\) => document\.documentElement\.hasAttribute\('data-lite'\)/);
  assert.match(css, /html\[data-lite\] \.lite-fade \{ animation: lite-fade [^}]+\}/);
  assert.match(css, /@keyframes lite-fade \{ from \{ opacity: 0; \} \}/);
  // The anatomy's glides and the dive into the lobule, the lobule's own camera and the sinusoid all jump.
  assert.match(stage, /if \(lite\(\) && ms > 0\) \{[^}]*liteFade\(wrap\)[^}]*ms = 0; \}/);
  assert.match(stage, /reduceMotion\.matches \|\| lite\(\) \? 0 : on \? DIVE_MS : RISE_MS/);
  assert.match(lz, /\(lite\(\) && cam\)\) \{ camAim = null; Object\.assign\(V, to\)/);
  assert.match(lz, /ms = \(lite\(\) \? 0 :/);
  // The presenter moves the camera while the old figure is dim, then fades it in; the full mode keeps its zoom.
  assert.match(presenter, /const ms = reduce\.matches \|\| booting \|\| lite\(\) \? 0 : 1500;/);
  assert.match(presenter, /const pre = lite\(\) && !booting && !ct && !!cam;/);
  assert.match(css, /html\[data-lite\] \.app\.presenting #stageView\.pz-out \{ opacity: 0; \}/);
});

test('liteFade restarts the fade and clears it once played', () => {
  // (util.js needs a browser to load, so its liteFade is run on its own.)
  const src = util.slice(util.indexOf('const liteFading'), util.indexOf('\n}\n', util.indexOf('export function liteFade')) + 2).replace('export function', 'function');
  const liteFade = new Function(`${src}; return liteFade;`)();
  const cls = new Set(), handlers = [];
  const el = { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) }, get offsetWidth() { return 0; }, addEventListener: (t, f) => handlers.push([t, f]) };
  liteFade(el); liteFade(el);
  assert.ok(cls.has('lite-fade'));
  assert.equal(handlers.length, 1, 'one listener per element, however many jumps');
  handlers[0][1]({ target: el, animationName: 'lite-fade' });
  assert.ok(!cls.has('lite-fade'));
});

test('Pages serves the bundled build, and both engine workers point at the bundled worker', () => {
  assert.match(build, /pages-build/);
  assert.match(build, /\(host\|presenter\)\\\.js\$/);
  assert.match(pages, /grep -q 'pages-build' "\$d\/scripts\/build\.mjs"/);
  assert.match(pages, /npm run build/);
  // The live site and the preview share one origin: a copy's service worker drops only its own old caches.
  assert.match(build, /k\.startsWith\(SCOPE\) \|\| !k\.startsWith\('pps@'\)/);
});
