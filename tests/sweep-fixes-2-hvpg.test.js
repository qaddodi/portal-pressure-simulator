// Sweep 2 review, HVPG tab (items 6, 7, 14, 15): the unit sits on the name's line again, so the monitor keeps its iPad
// width and the words under it fit a phone held sideways; the monitor's note wraps inside the grid, clear of the axis
// numbers, on a solid patch so no gridline runs through it. (Pixel checks: the review shots measured by hand.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), hvpg = read('../src/ui/hvpg-proc.js');

// The pure word wrapper, lifted out of the module (it imports browser-only helpers).
const src = hvpg.match(/export function wrapWords[\s\S]*?\n}\n/)[0].replace('export ', '');
const wrapWords = new Function(`${src}; return wrapWords;`)();
const mono = (q) => q.length * 6;   // 6 px a character

test('items 6 and 7: the reading names carry their unit on one unbroken line, not a line of their own', () => {
  const rule = css.match(/\.hvpg-kv dt::after \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /display:\s*block/);
  assert.match(rule, /mmHg/);
  assert.match(css, /\.hvpg-kv dt \{[^}]*white-space: nowrap/);
});

test('item 6: the idle description is short enough for two lines in a sideways card', () => {
  const cap = hvpg.match(/const cap = ph === 'idle' \? '([^']+)'/)[1];
  assert.ok(cap.length <= 110, `${cap.length} characters`);
  assert.match(cap, /jugular/);
  assert.match(cap, /free/);
  assert.match(cap, /wedged/);
});

test('item 14: wrapWords keeps every line within the width and loses no word', () => {
  const text = 'The tracing starts once the tip is in the hepatic vein.';
  for (const maxW of [80, 150, 240, 1000]) {
    const lines = wrapWords(text, maxW, mono);
    assert.equal(lines.join(' '), text);
    for (const l of lines) assert.ok(mono(l) <= maxW || !l.includes(' '), `"${l}" over ${maxW}`);
  }
  assert.deepEqual(wrapWords('a b', 1000, mono), ['a b']);
  assert.deepEqual(wrapWords('', 100, mono), []);
});

test('items 14 and 15: the monitor note is wrapped between the axis and the edge, 8 px in, on a solid patch', () => {
  assert.match(hvpg, /monitorNote\(ctx, [^;]*L \+ 8, Math\.min\(R, x \+ W\) - 8/);
  assert.match(hvpg, /ctx\.fillStyle = C\.bg; ctx\.fillRect\(bx, by, bw, bh\)/);
  const pad = +hvpg.match(/const pad = (\d+), padY = (\d+)/)[1], padY = +hvpg.match(/padY = (\d+)/)[1];
  assert.ok(pad >= 4 && padY >= 4);
  // No "…" on the monitor.
  const draw = hvpg.slice(hvpg.indexOf('function drawTrace'));
  assert.doesNotMatch(draw, /…/);
});

test('the live readings stay as they were (another worker owns them)', () => {
  assert.match(hvpg, /shownOr\('fhvp', v\.fhvp\)/);
  assert.match(hvpg, /shownOr\('whvp', v\.whvp\)/);
  assert.match(hvpg, /if \(k === 'hvpg' && shown\.hvpg && !open\)/);
});
