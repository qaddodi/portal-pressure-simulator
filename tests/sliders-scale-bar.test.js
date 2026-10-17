import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every slider is the data tiles' scale bar made draggable (Mohammad's pick B, 17 Oct).
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), util = read('src/ui/util.js');
const rule = (sel) => { const at = css.indexOf('\n' + sel); assert.ok(at >= 0, sel); return css.slice(at, css.indexOf('}', at)); };

test('the track is the tiles\' 6 px bar, drawn by the wrapper; the input\'s own track is clear', () => {
  assert.match(rule('.range-wrap::before, .range-wrap::after {'), /height: 6px; margin-top: -3px; border-radius: 3px;/);
  assert.match(rule('.range-wrap::after {'), /width: calc\(var\(--tw\) \/ 2 \+ \(100% - var\(--tw\)\) \* var\(--p\)\)/, 'the fill ends under the thumb\'s centre');
  assert.match(rule('input[type=range]::-webkit-slider-runnable-track {'), /height: 6px; background: transparent;/);
  assert.match(rule('input[type=range]::-moz-range-track {'), /background: transparent;/);
  assert.ok(!/--pct/.test(css), 'no slider reads the old --pct');
});

test('the thumb is a solid dot with a ring of the card\'s colour, centred on the 6 px track at any size', () => {
  const t = rule('input[type=range]::-webkit-slider-thumb {');
  assert.match(t, /width: var\(--tw, 18px\); height: var\(--tw, 18px\)/);
  assert.match(t, /background: var\(--accent\)/);
  assert.match(t, /margin-top: calc\(3px - var\(--tw, 18px\) \/ 2\)/);
  assert.match(t, /box-shadow: 0 0 0 3px var\(--surface\)/);
  assert.match(css, /\.range-wrap \{ --tw: 22px; \}/, 'a bigger dot on a phone');
});

test('a normal range is the tiles\' green band on the track, and that slider draws no fill', () => {
  assert.match(rule('.range-wrap .normal {'), /height: 6px;[^}]*background: color-mix\(in srgb, var\(--ok\) 60%, transparent\)/);
  assert.match(css, /\.range-wrap:has\(> \.normal\)::after \{ display: none; \}/);
  const insp = read('src/ui/inspector.js');
  assert.match(insp, /left: `calc\(var\(--tw\) \/ 2 \+ \(100% - var\(--tw\)\) \* \$\{\(normal\[0\] - min\) \/ \(max - min\)\}\)`/);
});

test('every slider paints its fill through paintRange, on its wrapper', () => {
  assert.match(util, /export function paintRange\(input, f\) \{\s*input\.parentElement\?\.style\.setProperty\('--p', String\(Math\.min\(1, Math\.max\(0, f\)\)\)\);/);
  for (const f of ['src/ui/card.js', 'src/ui/inspector.js', 'src/ui/presenter.js']) {
    const src = read(f);
    const made = (src.match(/type: 'range'/g) || []).length, painted = (src.match(/paintRange\(/g) || []).length;
    assert.ok(made > 0 && painted >= made, `${f}: ${made} sliders, ${painted} paints`);
  }
  // (The drain's wrapper exists before its first paint, so the fill is right from the start.)
  const card = read('src/ui/card.js');
  assert.ok(card.indexOf("const volWrap = h('div', { class: 'range-wrap' }, vol);") < card.indexOf('paintVol();'));
});

test('a finger on the track lands the thumb\'s centre there, whatever the thumb\'s size', () => {
  assert.match(util, /const th = parseFloat\(getComputedStyle\(input\)\.getPropertyValue\('--tw'\)\) \|\| 18;/);
  assert.ok(!/th = 22;/.test(util));
});

test('a slide\'s what-if: a ring where the slide started, no box, the track on its own line with its end words under its ends', () => {
  const p = read('src/ui/presenter.js');
  assert.match(p, /h\('div', \{ class: 'range-wrap', style: \{ '--s': String\(clamp\(frac\(v0\), 0, 1\)\) \} \}, h\('span', \{ class: 'sl-start', 'aria-hidden': 'true' \}\), input\)/);
  assert.match(rule('.range-wrap .sl-start {'), /left: calc\(var\(--tw\) \/ 2 \+ \(100% - var\(--tw\)\) \* var\(--s, 0\)\); width: 12px; height: 12px;[^}]*z-index: 1;/);
  assert.match(rule('input[type=range] {'), /z-index: 2;/, 'the dot passes over the ring');
  const wi = rule('.pz-wi {');
  assert.ok(!/background|border:|border-radius|box-shadow/.test(wi), 'no box');
  assert.match(rule('.pzi-t {'), /flex: 1 0 100%; order: 1;[^}]*display: grid;/);
  assert.match(rule('.pzi-e:last-child {'), /grid-column: 2; justify-self: end;/);
});
