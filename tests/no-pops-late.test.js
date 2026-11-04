import { stageSource } from './stage-src.js';
// The last of the motion review's pops (MOTION_HEAT_REVIEW P3, P13, P16–P23): what fades or glides must keep doing so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), util = read('src/ui/util.js'), dock = read('src/ui/dock.js');

test('Reduce Motion takes the movement out but keeps the fades (P3)', () => {
  assert.doesNotMatch(css, /transition-duration: \.001s !important/, 'no blanket rule that turns every transition into a pop');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ transition-property: opacity, visibility !important; \}/, 'only fades are left to keep (a colour change is a crossfade of layers)');
  const tail = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {'));
  for (const k of ['fade-rise', 'fade-rise-out', 'slide-from-edge', 'slide-to-edge', 'scale-settle', 'scale-settle-out', 'thumbOut']) {
    assert.match(tail, new RegExp(`@keyframes ${k} \\{ (from|to) \\{ opacity: 0; \\} \\}`), `${k} becomes a fade`);
  }
  // The exits that skipped their animation with Reduce Motion now play it (the keyframes above make it a fade).
  assert.doesNotMatch(read('src/ui/main.js'), /function leave\(el\) \{[^}]*prefers-reduced-motion/);
  assert.doesNotMatch(util, /if \(reduceMotionMQ\.matches \|\| !el\.isConnected\) el\.remove\(\);/);
});

test('a tapped Tests tab crossfades; a swiped one does not replay (P13)', () => {
  assert.match(dock, /!now\.classList\.contains\('landed'\) && was\.animate\) paneOut\(was, top\)/);
  assert.match(css, /\.instrument-workspace \.dock-pane\.pane-out:not\(\.active\) \{ display: flex;[^}]*position: absolute; inset: 0;/);
});

test('a paused edit rolls the readouts to the new number, always ending on it (P17)', () => {
  assert.match(util, /c\.shown = u >= 1 \? c\.to : c\.from \+ \(c\.to - c\.from\) \* k;/);
  assert.match(dock, /COUNT\.eased = eased; countTo\(x\.val, v, t\.d, COUNT\);/);
  assert.match(read('src/ui/readouts-pane.js'), /countTo\(x\.val, v, t\.d, \{ eased \}\)/);
  // (Its colour is taken at once: an eased colour repaints the readout every frame, 1 Nov 2026, move everything to GPU.)
  assert.match(css, /\.metric \.val, \.metric \.status \{ transition: none; \}/);
});

test('lists update in place, toasts leave through their own exit (P18, P19)', () => {
  assert.match(read('src/ui/chart.js'), /reconcile\(list, \[/);
  assert.match(read('src/ui/main.js'), /reconcile\(cur, \[\.\.\.next\.children\]\)/);
  // Row identity is data-row: data-key draws a keyboard-shortcut badge (app.css [data-key]::after), so a key there showed as text.
  assert.match(util, /c\.dataset\.row && !c\.classList\.contains\('rc-out'\)/);
  assert.doesNotMatch(util.slice(util.indexOf('export function reconcile'), util.indexOf('export function swapText')), /dataset\.key/);
  assert.match(read('src/ui/chart.js'), /el\.dataset\.row = k/);
  assert.match(read('src/ui/timeline.js'), /'data-row': `\$\{e\.t\}/);
  assert.doesNotMatch(read('src/ui/timeline.js') + read('src/ui/chart.js'), /'data-key'|dataset\.key/);
  assert.match(util, /while \(stay\.length >= 2\) \{ const o = stay\.shift\(\); if \(o\._close\) o\._close\('pushed'\); else o\.remove\(\); \}/);
});

test('popovers and figure pieces fade out instead of vanishing (P20, P21, P23)', () => {
  assert.match(css, /\.pal-back\.leaving \{[^}]*animation: crossfade-out/);
  assert.match(css, /\.why-pop\.leaving \{ display: block;[^}]*animation: scale-settle-out/);
  assert.match(stageSource(), /if \(d\.u !== to\) \{ d\.u = to > d\.u \? Math\.min\(1, d\.u \+ k\) : Math\.max\(0, d\.u - k\); nd\.dirty = true; \}/, 'a station dot eases out on the GPU (stepMap)');
  assert.match(stageSource(), /cath\.at = null; cathFadeOut\(\); return;/);
  assert.match(css, /\.mon\.bad \.mv \{ animation: monAlarm 1\.2s var\(--ease-move\) infinite; \}/);
});

test('the patient pill glides to a new name\'s width and the name crossfades (P8)', () => {
  assert.match(read('index.html'), /<div class="float-pill tb-id">\s*<span class="tb-face" aria-hidden="true"><\/span>/);
  assert.match(css, /\.topbar \.tb-id \{ position: relative; isolation: isolate; background: transparent; box-shadow: none; \}/);
  assert.match(read('src/ui/topbar-motion.js'), /if \(face\) plateGlide\(face, 0, s\.w, n\.w, \{ duration: MOVE_MS, easing: EASE \}\);/);
  assert.match(read('src/ui/main.js'), /const scFill = \(\) => \{\s*const el = \$\('#scenarioName'\);\s*el\.replaceChildren\(h\('span', SN_L, scName\)/);
  assert.match(read('src/ui/main.js'), /swapFade\(el, scFill\);/);
});

test('a tile\'s number fades between "?" and a value, its compare line fades in, and its bar fades (its colours are taken at once)', () => {
  assert.match(util, /export function fadeIn\(el\)/);
  assert.match(util, /const was = c\.shown != null; c\.shown = null; putNum\(el, '\?'\); if \(was\) fadeNum\(el\)/);
  assert.match(util, /const fresh = c\.shown == null; c\.shown = v; putNum\(el, fmt\(v, d\)\); if \(fresh\) fadeNum\(el\)/);
  for (const f of ['src/ui/dock.js', 'src/ui/readouts-pane.js']) {
    const src = read(f);
    assert.match(src, /if \(!x\.st\.hidden\) \{ x\.st\.hidden = true; fadeIn\(x\.cmp\); \}/);
    assert.match(src, /x\.st\.hidden = false; fadeIn\(x\.st\);/);
  }
  assert.match(css, /\.rb-fill \{[^}]*transition: opacity var\(--d-small\) var\(--ease\);/);
  assert.match(css, /\.metric \.cmp \{[^}]*transition: none;/);
  assert.match(css, /\.vital b \{ transition: none; \}/);
});
