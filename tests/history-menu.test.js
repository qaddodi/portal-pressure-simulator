// The History menu from the timeline clock stays compact: rows only, with no Copy action or header.
// (timeline.js needs a DOM to import, so it is read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/timeline.js', import.meta.url), 'utf8');

test('the History menu has no Copy action or header', () => {
  const open = src.slice(src.indexOf('function openHistory'), src.indexOf('function openMarker'));
  assert.doesNotMatch(open, /Copy|clipboard|tl-pop-top/);
  assert.match(open, /tl-pop tl-history/);
});

test('timeline menus have no Why? button', () => {
  assert.doesNotMatch(src, /Why\?'|onWhy|EVENT_WHY/);
});

test('go-back and compare are icon-only buttons on the event row, with labels as tooltips', () => {
  const rows = src.slice(src.indexOf('function markerRows'), src.indexOf('let pulseT'));
  assert.match(rows, /tl-pop-ic', style: { gridColumn: col }, title: label, 'aria-label': label/);
  assert.doesNotMatch(rows, /btn-row|class: 'btn sm'/);
});

test('every history row reserves the icon column and uses stroke icons', () => {
  const rows = src.slice(src.indexOf('function markerRows'), src.indexOf('let pulseT'));
  assert.match(rows, /h\('span', \{ class: 'tl-pop-acts' \}, acts\)\)/);
  assert.match(rows, /svgIcon\('rewind', 'mi-ic'\)/);
  assert.doesNotMatch(rows, /icon\('undo'\)/);
});
