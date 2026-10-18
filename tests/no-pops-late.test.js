// The last of the motion review's pops (MOTION_HEAT_REVIEW P3, P13, P16–P23): what fades or glides must keep doing so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), util = read('src/ui/util.js'), dock = read('src/ui/dock.js');

test('Reduce Motion takes the movement out but keeps the fades (P3)', () => {
  assert.doesNotMatch(css, /transition-duration: \.001s !important/, 'no blanket rule that turns every transition into a pop');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ transition-property: opacity, visibility, color/);
  const tail = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {'));
  for (const k of ['cardInRight', 'cardOutRight', 'sheetUp', 'sheetDown', 'popOut', 'acSheetOut', 'thumbOut', 'toastUp']) {
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
  assert.match(dock, /countTo\(x\.val, v, t\.d, \{ eased \}\)/);
  assert.match(read('src/ui/readouts-pane.js'), /countTo\(x\.val, v, t\.d, \{ eased \}\)/);
  assert.match(css, /\.metric \.val, \.metric \.status \{ transition: color \.3s var\(--ease\); \}/);
});

test('lists update in place, toasts leave through their own exit (P18, P19)', () => {
  assert.match(read('src/ui/chart.js'), /reconcile\(list, \[/);
  assert.match(read('src/ui/main.js'), /reconcile\(cur, \[\.\.\.next\.children\]\)/);
  assert.match(util, /while \(stay\.length >= 2\) \{ const o = stay\.shift\(\); if \(o\._close\) o\._close\(\); else o\.remove\(\); \}/);
});

test('popovers and figure pieces fade out instead of vanishing (P20, P21, P23)', () => {
  assert.match(css, /\.pal-back\.leaving \{[^}]*animation: fadeOut/);
  assert.match(css, /\.why-pop\.leaving \{ display: block;[^}]*animation: popOut/);
  assert.match(css, /\.node-dot\.off \{ opacity: 0;/);
  assert.match(read('src/ui/stage.js'), /cath\.at = null; cathFadeOut\(\); return;/);
  assert.match(css, /\.mon\.bad \.mv \{ animation: monAlarm 1\.2s ease-in-out infinite; \}/);
});

test('the patient pill glides to a new name\'s width and the name crossfades (P8)', () => {
  assert.match(read('index.html'), /<div class="float-pill tb-id">\s*<span class="tb-face" aria-hidden="true"><\/span>/);
  assert.match(css, /\.topbar \.tb-id \{ position: relative; isolation: isolate; background: transparent; box-shadow: none; \}/);
  assert.match(read('src/ui/topbar-motion.js'), /if \(face\) face\.animate\(\[\{ width: `\$\{s\.w\}px` \}, \{ width: `\$\{n\.w\}px` \}\]/);
  assert.match(read('src/ui/main.js'), /swapFade\(el, \(\) => \{\s*el\.replaceChildren\(h\('span', \{ class: 'sn-l' \}, name\)/);
});
