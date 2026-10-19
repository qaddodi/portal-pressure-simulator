// A slide's colour key sits on the figure (src/ui/figure-key.js, docked by the stylesheet): on a phone at the words' bottom-left
// corner, on a wider screen on top of the nav pill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

// Mohammad, 15 Oct: "on mac, put the legend on top of the zoom pill" (the nav pill at the lower right).
test('on a wider screen the key stands right on top of the nav pill, right-aligned with it', () => {
  const pill = css.match(/\.pz-bar\.pzb-pill \{([^}]*)\}/)[1], key = css.match(/\.pz:not\(\.stack\) \.pz-fk \{([^}]*)\}/)[1];
  const right = (r) => r.match(/(?:^|;)\s*right: ([^;]+);/)[1], bottom = (r) => r.match(/(?:^|;)\s*bottom: ([^;]+);/)[1];
  assert.equal(right(key), right(pill), 'same right edge as the pill');
  assert.match(pill, /height: 44px;/);
  assert.equal(bottom(key), `calc(${bottom(pill)} + 44px + 8px)`, "just above the pill's top, an 8 px gap");
  assert.match(key, /left: auto; top: auto;/);
  assert.match(key, /translate: none;/);
  assert.match(key, /border-radius: var\(--r-sheet\);/);   // (the pill's corners)
  assert.match(pill, /border-radius: var\(--r-sheet\);/);
});

test('the figure keeps clear of the key: labels avoid it and the camera frames clear of the pill and key together', () => {
  assert.match(presenter, /h\('div', \{ class: 'pz-fk stage-blocker'/);
  assert.match(presenter, /The colour key stands on the pill: the two are one obstacle/);
});

test('Blur effect off turns the docked key solid too', () => {
  assert.match(css, /:root\[data-noglass\] :is\([^)]*\.pz \.pz-fk\.pz-fk[^)]*\) \{ background: var\(--surface\); \}/);
});

test('the key lives on the figure, not in the teaching card, and never takes a tap', () => {
  assert.ok(!/lensKey\(|querySelector\('\.pz-lens'\)/.test(presenter), 'the card no longer builds a key line');
  assert.match(presenter, /createFigureKey\(\{ el: fk/);
  assert.match(css, /\.pz-fk \{[^}]*pointer-events: none;/);
});

test("the phone's nav pill is compact", () => {
  assert.match(css, /\.pz\.stack \.pz-bar \{[^}]*height: 38px;/);
  assert.match(css, /\.pz\.stack \.pz-bar \.ib \{ width: 44px;[^}]*margin: -4px -3px;/);   // (looks small, keeps its 44 px tap box)
});

// Mohammad, 17 Oct: "Unify the style of those pills" (the colour key beside the nav pill on an iPhone).
test("the key's shell is the nav pill's: glass, outline, edge, shadow and corners, in every theme", () => {
  const key = css.match(/\n\.pz-fk \{([^}]*)\}/)[1], bar = css.match(/\n\.pz\.stack \.pz-bar \{([^}]*)\}/)[1], barBase = css.match(/\n\.pz-bar \{([^}]*)\}/)[1];
  const prop = (r, p) => r.match(new RegExp(`(?:^|;)\\s*${p}: ([^;]+);`))?.[1];
  for (const p of ['background', 'backdrop-filter', '-webkit-backdrop-filter', 'border', 'border-radius', 'box-shadow']) assert.equal(prop(key, p), prop(bar, p), p);
  for (const v of ['--pz-glass-edge', '--pz-glass-drop']) assert.equal(prop(key, v), prop(barBase, v), v);
  assert.match(css, /:root\[data-theme="dark"\] :is\(\.pz-bar, \.pz-fk\) \{ --pz-glass-edge/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\):not\(\[data-theme="soft"\]\) :is\(\.pz-bar, \.pz-fk\) \{ --pz-glass-edge/);
  assert.match(css, /\.app\.pz-hi \.pz-fk \{ background: color-mix\(in srgb, var\(--surface\) 92%, transparent\); border-color: color-mix\(in srgb, var\(--text\) 32%, transparent\); \}/);
  assert.doesNotMatch(css, /\.pz-fk[^{]*\{[^}]*border-radius: (?:calc\(var\(--r-card\)|var\(--r-pill\))/, 'one corner radius, the pill\'s');
  assert.doesNotMatch(css.match(/\n\.pz:not\(\.stack\) \.pz-fk \{([^}]*)\}/)[1], /background/, 'a wide screen keeps the same glass (and Blur off still reaches it)');
});
