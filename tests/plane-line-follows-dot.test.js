// The walk line ends where the dot is drawn (3 Nov 2026). The dot is drawn by the shared GPU picture (svg-gl.js moveNow: its glide
// starts when the picture first sees the new place, on the frame's clock). The line used to work out the same glide for itself from
// performance.now() and the moment the plot was drawn, a second record on a second clock: stepped one frame at a time off one paused
// clock, the line's end was up to 13 px from the dot in the first frames of a glide (0 px now). The line asks the picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/visual-plane.js', import.meta.url), 'utf8');
const svg = readFileSync(new URL('../src/ui/svg-gl.js', import.meta.url), 'utf8');

test('the walk line reads the dot from the picture\'s own move record', () => {
  assert.match(svg, /export function moveAt\(el, now = easeNow\(\)\)/);
  assert.match(src, /import \{[^}]*\bmoveAt\b[^}]*\} from '\.\/svg-gl\.js'/);
  const dotNow = src.slice(src.indexOf('const dotNow = () => {'), src.indexOf('const dotNow = () => {') + 400);
  assert.match(dotNow, /moveAt\(ringG\)/);
});

test('the plot\'s own glide fallback runs on the frames\' clock, not performance.now()', () => {
  const at = src.indexOf('const dotEased = ');
  assert.ok(at > 0);
  assert.doesNotMatch(src.slice(at, at + 200), /performance\.now/);
  assert.doesNotMatch(src.slice(src.indexOf('dotGo = { fx:'), src.indexOf('dotGo = { fx:') + 120), /performance\.now/);
});
