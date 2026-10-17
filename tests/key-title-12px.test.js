// The figure key, the top bar's lens caption and a phone's data card title: never under 12 px and never cut with an ellipsis.
// (16 Oct: the velocity key read 11 px on phone and iPad, a 320 px phone shrank a wide key further, and a 320 px phone cut the
// TIPS Doppler card's title to "DOPPLER, THE ..." inside a folded card squeezed to 27 px.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const floors = (rule) => [...rule.matchAll(/max\(([\d.]+)px/g)].map((m) => +m[1]);

test('the figure key is 12 px or more, and is wrapped, never scaled down, when wider than the card', () => {
  const base = css.match(/\n\.pz-fk \{[^}]*\}/)?.[0] ?? '';
  const grad = css.match(/\n\.pz-fk\.grad, \.pz-fk\.grad\.col \{[^}]*\}/)?.[0] ?? '';
  assert.ok(base && grad, 'the key rules are missing');
  for (const r of [base, grad]) for (const f of floors(r)) assert.ok(f >= 12, `a key floor of ${f} px`);
  assert.doesNotMatch(css, /\.pz-fk[^{]*\{[^}]*scale: var\(--pz-fk-s/, 'the key is never scaled down');
  assert.doesNotMatch(js, /--pz-fk-s/);
  assert.match(css, /\.pz\.stack\.fk-up\.fk-wrap \.pz-fk:not\(\.grad\) \{[^}]*flex-wrap: wrap/);
});

test("the top bar lens caption is 12 px", () => {
  for (const sel of ['.lg-cap {', '.lg-cap small {']) {
    const r = css.slice(css.indexOf('\n' + sel), css.indexOf('}', css.indexOf('\n' + sel)));
    assert.match(r, /font-size: var\(--fs-12\)/, sel);
  }
  assert.doesNotMatch(css, /\.lg-num \{ font-size: 11px/);
});

test("a phone's data card title wraps instead of being cut, and a card that does not fit comes in closed, never cut to its header", () => {
  const r = css.match(/\.pz\.stack \.pz-dh > span:first-child \{[^}]*\}/)?.[0] ?? '';
  assert.ok(r, 'the phone title rule is missing');
  assert.doesNotMatch(r, /ellipsis|nowrap/);
  assert.match(js, /if \(p\) autoDock\(phoneShut\); else if \(!low\) autoDock\(false\);/, 'too tall beside the words and the figure: it comes in closed');
  assert.doesNotMatch(js, /phoneFoldH|pz-ftight/, 'never folded to its header behind Show (Mohammad, 17 Oct)');
});

test('the lens legend centres every number on its tick, the end ones too, with room beside the scale', () => {
  assert.doesNotMatch(css, /\.lg-num\.(start|end) \{ transform/, 'an end number pulled in off its tick ("30" sat 7.5 px left of it)');
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /class: 'lg-scale', style: \{ marginLeft: `\$\{String\(nums\[0\]/);
  assert.match(css, /\.lg-scale \{ font: 600 var\(--fs-12\)/, 'the margin is counted in the numbers\' own digits');
});
