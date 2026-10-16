// The patient's name in the top bar is never cut with an ellipsis on a phone held sideways ("Decompensated ..."): it is
// whole while the bar has room, and as short words on up to two 12 px lines when the bar compacts to keep one row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
// (the sideways phone's block that sets the name: there are several blocks with this query)
const HEAD = '@media (max-width: 1023px) and (max-height: 500px) and (orientation: landscape) {';
const block = css.split(HEAD).slice(1).map((b) => b.slice(0, b.indexOf('\n}\n'))).find((b) => b.includes('scenario-v')) ?? '';

test('a sideways phone never caps the patient name to a cut width', () => {
  assert.ok(block, 'the sideways phone block is missing');
  assert.match(block, /\.topbar\[data-fit\] \.tb-id \.menu-btn \.scenario-v \{ max-width: none; overflow: visible; text-overflow: clip; \}/);
  assert.doesNotMatch(css, /\(orientation: landscape\) \{[^}]*scenario-v \{ max-width: (84|130)px; \}/, 'the old 84 / 130 px caps cut the name');
});

test('compacted to one row, the sideways name wraps to two lines of at least 12 px, short form', () => {
  const rule = block.match(/\.topbar:not\(\.two-rows\):not\(\[data-fit="0"\]\) \.tb-id \.menu-btn \.scenario-v \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /white-space: normal/);
  const fs = parseFloat(rule.match(/font-size: ([\d.]+)px/)?.[1]);
  assert.ok(fs >= 12, `name at ${fs} px`);
  assert.match(block, /:not\(\[data-fit="0"\]\) \.scenario-v \.sn-s \{ display: inline; \}/);
});

// Off a phone (iPad, Mac) the name had fixed caps (300, 240, 200, 160 px) with an ellipsis: "Budd–Chiari (hepatic…".
test('off a phone the patient name has no fixed width cap; compacting wraps it at 12 px instead', () => {
  assert.doesNotMatch(css, /\.menu-btn \.scenario-v \{ max-width: (300|240|200|160)px; \}/, 'a fixed cap cuts the name');
  assert.match(css, /\n\.menu-btn \.scenario-v \{ max-width: none; overflow: visible; text-overflow: clip; \}/);
  const rule = css.match(/\.topbar:not\(\.two-rows\)\[data-fit="1"\] \.menu-btn \.scenario-v,[^{]*\{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /white-space: normal/);
  assert.ok(parseFloat(rule.match(/font-size: ([\d.]+)px/)?.[1]) >= 12);
});

// The colour key in a phone's top bar was squeezed by a long name ("Pres… mr", a 17 px scale with no numbers).
test('a phone never squeezes the top-bar colour key: it keeps a scale of 48 px or more with its numbers', () => {
  assert.match(css, /\n\.lg-scale \{ flex: none; \}/);
  assert.match(css, /\.app\.thumb \.topbar \.stage-bar\.top \{ container-type: normal; \}/, 'a size container is zero wide: the key would take no room');
  assert.match(css, /\.app\.thumb \.topbar :is\(\.stage-bar\.top, \.sb-right, \.lens-btn, \.legend\) \{ flex: 0 1 auto; min-width: min-content;/);
  assert.match(css, /\.app\.thumb \.topbar \.lg-scale \{ flex: none; width: clamp\(48px, calc\(100vw \/ var\(--vz, 1\) - 302px\), 88px\); \}/);
  assert.match(css, /#app:not\(\.thumb\) \.topbar :is\(\.sb-right, \.lens-btn, \.legend\) \{ min-width: min-content; \}/, 'sideways: the bar sees the key whole');
  assert.doesNotMatch(block, /\.topbar \.lg-title, \.topbar \.lg-num \{ display: none; \}/, 'sideways the numbers were hidden');
});

// The sinusoid view's four buttons (history, play, settings, search) were forced onto the key's row on a phone: the key pill
// overlapped the name and search hung 23 px off a 390 px screen. They take their own row again, under the key.
test('the sinusoid view keeps its buttons on a row of their own on a phone', () => {
  assert.match(css, /#app\.thumb\.sin-focus \.topbar \{ flex-wrap: wrap; \}/);
  assert.match(css, /#app\.thumb\.sin-focus \.topbar \.stage-bar\.top \{ flex: 0 1 auto; min-width: min-content; \}/, 'the key keeps its whole width');
});
