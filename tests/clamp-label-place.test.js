// A narrowing's "60 %" (Mohammad, 22 Oct: "the callout for 60% narrowing does not fit well"): on the TIPS slides it stood between its
// clamp's arrow and the distal callout, its "%" hidden under "TIPS". A redraw of the marks had put it back on the vessel's own side,
// undoing the side the label layout chose (the other side from the stent's column of callouts), and its text stayed anchored from the
// old spot. One rule now places it, whoever asks, and a label that has to stand off from its arrows is joined to them by a leader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const body = (from, to) => stage.slice(stage.indexOf(from), stage.indexOf(to, stage.indexOf(from)));

test('every redraw of the marks and every change of zoom places the "60 %" by the one rule the layout also uses', () => {
  const place = body('function placeClampLabels() {', 'const applyVT');
  assert.match(place, /for \(const t of ov\.clamps\.querySelectorAll\('\.clamp-label'\)\) clampLabelAt\(t\);/);
  assert.doesNotMatch(place, /setAttribute\('x'|dataset\.at/, 'no second formula for the spot');
  assert.doesNotMatch(stage, /lab\.setAttribute\('data-at'/);
  // (updateOverlays places each new label, then every label once more after the rebuild.)
  assert.match(stage, /lab\._c = \{ id, x, y, nx, ny, off \}; clampLabelAt\(lab\); clampFontAt\(lab\);/);
  assert.match(stage, /\n {4}placeClampLabels\(\);\n {4}\/\/ Thrombus:/);
});

test('the rule keeps the layout\'s side and spot, reads outward from it, and stays level on screen', () => {
  const at = body('function clampLabelAt(el) {', '// A quantized value');
  assert.match(at, /const away = c\.id === clampFor \? clampAway : null;/);
  assert.match(at, /kept = c\.id === clampFor \? clampD\.get\(c\.id\) : null, mv = c\.id !== clampFor \? clampMv\.get\(c\.id\)\?\.cur : null/);
  // The text ends at its spot on the clamp's left on screen and starts there on its right: never back over the arrows.
  assert.match(at, /left = xs\[k\] < xs\[1 - k\] - 0\.5/);
  assert.match(at, /if \(left\) el\.setAttribute\('text-anchor', 'end'\); else el\.removeAttribute\('text-anchor'\);/);
  assert.match(at, /el\.setAttribute\('dx', \(left \? -gap : gap\)\.toFixed\(2\)\)/);
  assert.match(at, /rotate\(\$\{\(-deg\)\.toFixed\(2\)\}/);   // (level whatever the figure's turn)
});

test('a "60 %" that stands off from its arrows, on the column\'s side or moved off the probe, is joined to the nearer arrow by a leader', () => {
  const lead = body('// (A "60 %" that stands off from its clamp', 'leaders.push(...dots);');
  assert.match(lead, /own = c && c\.id === clampFor && ptSide && clampD\.get\(c\.id\)/);
  assert.match(lead, /gap\(tips\[1\]\) < gap\(tips\[0\]\) \? tips\[1\] : tips\[0\]/);
  assert.doesNotMatch(lead, /if \(solve/, 'read from the label as it stands, so a carried layout keeps the line');
  assert.match(lead, /k: 'cl:' \+ c\.id, tag: 'path', at: \{ class: 'leader'/);
});
