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
