// Premium feel R10: the boot is the figure's first breath. The cover lifts as the figure rises into the page on the cover's own
// clock; the wait bar shows only past 1.2 s and has no gradient (the brand mark carries it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootCss = html.slice(html.indexOf('#boot { position: fixed'), html.indexOf('</style>', html.indexOf('#boot { position: fixed')));
const bootJs = html.slice(html.indexOf('<script>(function(){var MIN=600'), html.indexOf('</script>', html.indexOf('<script>(function(){var MIN=600')));

test('R10 the figure is held clear until the cover lifts, then rises on the cover\'s clock', () => {
  assert.match(html, /<script>document\.documentElement\.setAttribute\('data-boot','hold'\);try\{/, 'held from the first script, so a page without scripts never hides it');
  assert.match(bootCss, /html\[data-boot="hold"\] #stageView \{ opacity: 0; \}/);
  const cover = bootCss.match(/#boot \{[^}]*transition: ([^;]*);/)[1];
  const rise = bootCss.match(/html\[data-boot="rise"\] #stageView \{ transition: ([^;]*); \}/)[1];
  assert.equal(cover, 'opacity var(--d-surface) var(--ease), visibility var(--d-surface)');
  assert.equal(rise, 'opacity var(--d-surface) var(--ease)', 'the same duration and curve as the cover');
  assert.doesNotMatch(bootCss, /#stageView \{[^}]*transform/, 'opacity only: a scale would skew the figure\'s getBoundingClientRect reads');
});

test('R10 the hold is released on every way out: the cover lifting, and "Try anyway" / "Close"', () => {
  assert.match(bootJs, /function release\(\)\{document\.documentElement\.removeAttribute\('data-boot'\)\}/);
  assert.match(bootJs, /document\.documentElement\.setAttribute\('data-boot','rise'\);b\.classList\.add\('done'\);setTimeout\(function\(\)\{b\.remove\(\);release\(\)\},600\)/);
  assert.match(bootJs, /if\(c\)c\.onclick=function\(\)\{failed=false;release\(\);b\.remove\(\)\}/);
});

test('R10 the wait bar waits 1.2 s and has no gradient', () => {
  assert.match(bootCss, /#boot \.boot-bar \{[^}]*opacity: 0; animation: boot-bar-in var\(--d-small\) var\(--ease\) 1\.2s forwards;/);
  assert.doesNotMatch(bootCss, /(?:linear|radial|conic)-gradient\(/, 'the boot cover carries no gradient but the brand mark\'s own');
  assert.match(bootCss, /@keyframes boot-bar-in \{ to \{ opacity: 1; \} \}/);
});

test('the cover never waits on the load event or an animation: the figure being ready lifts it, and the 15 s fallback lifts it even when the figure is ready', () => {
  assert.match(bootJs, /addEventListener\('pps:figure-ready',lift\)/, 'ready lifts the cover even if the page\'s load event never comes');
  assert.match(bootJs, /setTimeout\(function\(\)\{if\(failed\|\|lifting\|\|w\.ppsRecovering\)return;if\(ready\(\)\)lift\(\);/, 'the fallback no longer returns early when the figure is ready');
  assert.doesNotMatch(html.slice(html.indexOf('<div id="boot"'), html.indexOf('</div></div>', html.indexOf('<div id="boot"'))), /pathLength|class="bv/, 'the mark is drawn whole; no main-thread stroke animation');
});

test('a CSS failsafe lifts the cover and shows the figure at 20 s even if no script runs; a card saying why the app failed stays', () => {
  assert.match(bootCss, /#boot \{[^}]*animation: boot-failsafe \.01s 20s forwards; \}/);
  assert.match(bootCss, /@keyframes boot-failsafe \{ to \{ opacity: 0; visibility: hidden; \} \}/);
  assert.match(bootCss, /html\[data-boot="hold"\] #stageView \{ animation: boot-failsafe-in \.01s 20s forwards; \}/);
  assert.match(bootCss, /#boot\.failed \{ animation: none; \}/);
  assert.match(html, /failed=true;b\.classList\.remove\('done'\);b\.classList\.add\('failed'\);/);
});

test('the cover lifts only once start-up work is done and the page is calm: held work, then 400 ms of frames under 50 ms, capped', () => {
  assert.match(bootJs, /function lift\(\)\{[^}]*setTimeout\(settle,Math\.max\(0,MIN-performance\.now\(\)\)\)\}/);
  assert.match(bootJs, /setTimeout\(go,4000\)/, 'a hard cap: the cover never waits more than 4 s past ready for calm');
  assert.match(bootJs, /if\(t-since>=400\|\|t-t0>3500\)go\(\)/);
  assert.match(bootJs, /var hs=\(w\.ppsHold\|\|\[\]\)\.splice\(0\);if\(!hs\.length\|\|!w\.Promise\|\|performance\.now\(\)-t0>2500\)return calm\(\);/);
  const quiet = readFileSync(new URL('../src/ui/quiet.js', import.meta.url), 'utf8');
  assert.match(quiet, /export function holdCover\(p\) \{\n {2}if \(booting\(\) && p && typeof p\.then === 'function'\) \(globalThis\.ppsHold \|\|= \[\]\)\.push\(p\);/);
  const sin = readFileSync(new URL('../src/ui/sinusoid-gl.js', import.meta.url), 'utf8');
  assert.match(sin, /if \(!warm && booting\(\)\) holdCover\(new Promise\(\(done\) => setTimeout\(\(\) => \{ try \{ publish\(\); \} finally \{ done\(\); \} \}, 0\)\)\);/, 'the sinusoid compile runs under the cover');
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /const warmUnder = \(\) => \{ if \(!booting\(\)\) return; while \(warmUp\.length\) holdCover\(/);
});

test('the loading screen never swaps typeface in view and its mark does not animate in', () => {
  assert.match(bootCss, /#boot \.boot-mark \{ width: 64px; height: 64px; background-color: #16181D; \}/);
  assert.match(bootCss, /#boot \.boot-name \{[^}]*opacity: 0; \}/);
  assert.match(bootCss, /#boot\.named \.boot-name \{ opacity: 1; animation: fade-rise var\(--d-surface\) var\(--ease\) both; \}/);
  assert.match(html, /document\.fonts\.load\('600 20px "Source Serif 4"'\)\.then\(n,n\)\}catch\(e\)\{n\(\)\}setTimeout\(n,900\)/);
});

test('the first screen\'s fonts are loaded under the cover (1.5 s cap) and JetBrains Mono is preloaded', () => {
  assert.match(html, /\(function\(\)\{try\{if\(!document\.fonts\|\|!document\.fonts\.load\|\|!window\.Promise\)return;/);
  assert.match(html, /document\.fonts\.load\(x,'Ag0123456789'\)/);
  assert.match(html, /\(window\.ppsHold=window\.ppsHold\|\|\[\]\)\.push\(Promise\.race\(\[load,new Promise\(function\(r\)\{setTimeout\(r,1500\)\}\)\]\)\)/);
  assert.match(html, /preload" href="fonts\/jetbrains-mono-latin\.woff2"/);
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /monoLatin \? `<link rel="preload"/);
});
