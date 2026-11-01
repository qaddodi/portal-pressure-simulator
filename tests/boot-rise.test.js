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
  assert.match(bootJs, /setTimeout\(function\(\)\{if\(failed\|\|lifting\)return;if\(ready\(\)\)lift\(\);/, 'the fallback no longer returns early when the figure is ready');
  assert.doesNotMatch(html.slice(html.indexOf('<div id="boot"'), html.indexOf('</div></div>', html.indexOf('<div id="boot"'))), /pathLength|class="bv/, 'the mark is drawn whole; no main-thread stroke animation');
});

test('a CSS failsafe lifts the cover and shows the figure at 20 s even if no script runs; a card saying why the app failed stays', () => {
  assert.match(bootCss, /#boot \{[^}]*animation: boot-failsafe \.01s 20s forwards; \}/);
  assert.match(bootCss, /@keyframes boot-failsafe \{ to \{ opacity: 0; visibility: hidden; \} \}/);
  assert.match(bootCss, /html\[data-boot="hold"\] #stageView \{ animation: boot-failsafe-in \.01s 20s forwards; \}/);
  assert.match(bootCss, /#boot\.failed \{ animation: none; \}/);
  assert.match(html, /failed=true;b\.classList\.remove\('done'\);b\.classList\.add\('failed'\);/);
});
