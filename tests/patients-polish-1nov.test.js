// Patients mode polish, 1 Nov: what moves must keep easing, and a round dot stays round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), util = read('src/ui/util.js'), menu = read('src/ui/menu.js'), compare = read('src/ui/compare.js');

test('the preview card\'s profile is drawn by the GPU, its dots true circles at the card\'s own width (no SVG stretched with the curve)', () => {
  assert.doesNotMatch(menu, /sv\('circle'|createElementNS/);
  assert.match(menu, /import \{ createTraceGL, fitPen \} from '\.\/trace-gl\.js';/);
  assert.match(menu, /const p = fitPen\(pr\.cv, pr\.gpu\);/);
  assert.match(menu, /ctx\.arc\(profX\(i, W, n\), profY\(p, H\), 3\.1, 0, Math\.PI \* 2\)/, 'a surface ring under each dot');
  assert.match(menu, /ctx\.arc\(profX\(i, W, n\), profY\(p, H\), 2\.1, 0, Math\.PI \* 2\)/);
  assert.match(css, /\.hp-prof > canvas \{ position: absolute; inset: 0;/);
});

test('the comparison table is written in place and its change column takes its colour at once', () => {
  assert.match(compare, /if \(tableEl\._key !== key\)/);
  assert.match(compare, /if \(c\.b\.textContent !== b\) c\.b\.textContent = b;/);
  assert.match(css, /\.cmp-table td\.d \{ transition: none; \}/, '(1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
});

test('a History row whose details change stays where it stands, and fades with its class', () => {
  const rec = util.slice(util.indexOf('export function reconcile'), util.indexOf('export function swapText'));
  assert.doesNotMatch(rec, /o\.replaceWith\(r\)/);
  assert.match(rec, /morphRow\(o, r,/);
  assert.match(css, /\.tl-pop-row \{ transition: opacity var\(--d-small\) var\(--ease\); \}/);
});
