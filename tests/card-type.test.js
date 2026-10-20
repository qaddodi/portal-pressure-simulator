import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPACT, AB_COMPACT, AB_FLOOR, WIDE } from '../src/ui/card-type.js';
import { rolePx, TEXT_STEPS } from '../src/ui/type-scale.js';

// The teaching card's text in two fixed sizes, Regular and Compact (Mohammad, 19 Oct: "Two fixed sizes"). At either size, on every
// layout and text size: the title reads larger than the words, the buttons and the corner tab never larger than the words, and
// nothing under 12 px. (Slide 38 of the test-all deck on an iPhone had its tab, title, words and buttons all at 12 to 14 px, the
// buttons the largest: the title had stepped down alone and the buttons had kept their size.)
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

// The rules these sizes are read from, so the sums below stay the stylesheet's.
test('the stylesheet sets the card sizes the sums below use', () => {
  assert.match(css, /\.pz\.stack \.pz-text, \.pz\.stack \.pz-panel \{ --pk: 1\.45; \}/);
  assert.match(css, /\.pz\.stack\.tab \.pz-text, \.pz\.stack\.tab \.pz-panel \{ --pk: 1\.39; \}/);
  assert.match(css, /\.pz\.low \.pz-text \{ --pk: 1\.4;/);
  assert.match(css, /\.pz\.stack \.pz-h \{ font-size: var\(--s-val\); \}/);
  assert.match(css, /\.pz\.stack \.pz-line \{ font-size: var\(--s-lab\); \}/);
  assert.match(css, /\.pz\.low \.pz-text \.pz-h \{ font-size: var\(--s-val\); \}/);
  assert.match(css, /\.pz\.stack \.pz-abb \{ font-size: min\(var\(--s-body\), max\(var\(--s-lab\), var\(--t-body\)\)\);/);
  assert.match(css, /\.pz\.low \.pz-abb \{ font-size: max\(var\(--s-lab\), var\(--t-body\)\);/);
  assert.match(css, /--pz-tabf: calc\(12px \* var\(--ts, 1\)\);/);
  // (The buttons' zoom: Regular 1, Compact 13/14, never under 12/14.)
  for (const sel of ['\\.pz\\.stack \\.pz-text > \\.pz-ab', '\\.pz\\.low \\.pz-text > \\.pz-ab']) {
    assert.match(css, new RegExp(`${sel} \\{ zoom: min\\(1, max\\(calc\\(var\\(--pz-fit, 1\\) \\* 13 / 14 / \\.8\\), calc\\(12 / 14\\)\\)\\); \\}`));
  }
  assert.equal(AB_COMPACT, 13 / 14); assert.equal(AB_FLOOR, 12 / 14); assert.equal(COMPACT, 0.8);
  // (A laptop's card: title and words each one step, the buttons with the words.)
  assert.match(css, /\.pz\.pz-card:not\(\.stack\):not\(\.low\) \.pz-text \{ --s-title: calc\(clamp\(32px, calc\(5\.546 \* var\(--pzh\) \/ var\(--vz\)\), 67px\) \* var\(--ts, 1\) \* var\(--pk, 1\) \* var\(--pz-tk, 1\)\);/);
  assert.match(css, /--s-body: calc\(clamp\(17px, calc\(2\.311 \* var\(--pzh\) \/ var\(--vz\)\), 28px\) \* var\(--ts, 1\) \* var\(--pk, 1\) \* var\(--pz-bk, 1\)\); --s-lab: calc\(clamp\(14px, calc\(2\.022 \* var\(--pzh\) \/ var\(--vz\)\), 24\.5px\) \* var\(--ts, 1\) \* var\(--pk, 1\) \* var\(--pz-bk, 1\)\);/);
  assert.match(css, /\.pz-abb \{[^}]*font: 600 var\(--s-lab\)\/1\.1 var\(--font-ui\);/);
});

test('the fit has two sizes: Regular, else Compact for the whole card; the title never steps down alone', () => {
  assert.match(js, /if \(small && fits\(\)\) \{ k = over = Math\.max\(COMPACT, floor\); el\.style\.setProperty\('--pz-fit', String\(k\)\); \}/);
  assert.match(js, /const title = \(\) => put\(1, 1\) \|\| put\(WIDE\.title, WIDE\.words\);/);
  assert.match(js, /below = put\(WIDE\.title, WIDE\.words\); \}/);
  assert.doesNotMatch(js, /--pz-ptk|\bTK\b/);
  // (A phone's cap gives the words their room at Compact, from the figure's share when they need it.)
  assert.match(js, /compact = at\(Math\.max\(COMPACT, floor\)\);/);
  assert.match(js, /: reg \? regular : Math\.min\(room - dtop - data, Math\.max\(Math\.min\(mine, both - data\), compact\)\)\) \/ k;/);
  // (Regular borrows from the figure's share, down to FIG_REG, before the words drop a whole step to Compact.)
  assert.match(js, /const FIG_REG = \(H\) => Math\.round\(Math\.max\(170, 0\.25 \* H\)\);/);
  assert.match(js, /const reg = lend > 0 && lend <= FIG_MIN\(H\) - FIG_REG\(H\) && regular <= mine && regular <= room - dtop - data;/);
  assert.match(js, /Math\.max\(0, phoneFig \/ k - lip - 2\)/);
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ok = (name, s) => {
  assert.ok(s.title > s.words * 1.15, `${name}: title ${s.title.toFixed(1)} px not well above the words ${s.words.toFixed(1)} px`);
  assert.ok(s.buttons <= s.words + 0.01, `${name}: buttons ${s.buttons.toFixed(1)} px larger than the words ${s.words.toFixed(1)} px`);
  assert.ok(s.tab <= s.words + 0.01, `${name}: tab ${s.tab.toFixed(1)} px larger than the words ${s.words.toFixed(1)} px`);
  for (const k of ['words', 'buttons', 'tab']) assert.ok(s[k] >= 11.99, `${name}: ${k} ${s[k].toFixed(1)} px under 12 px`);
};

test('phones and an upright iPad: title above the words, buttons and tab no larger, nothing under 12 px, at Regular and Compact', () => {
  const screens = [
    ['phone', 1.45, [[320, 568], [375, 667], [390, 844], [430, 932], [440, 956]]],
    ['upright iPad', 1.39, [[744, 1133], [820, 1180], [1024, 1366]]],
    ['phone on its side', 1.4, [[568, 320], [844, 390], [932, 430]]],
  ];
  for (const [kind, pk, sizes] of screens) for (const [w, hgt] of sizes) for (const ts of TEXT_STEPS) for (const fit of [1, COMPACT]) {
    const r = (role) => rolePx(role, w, hgt), side = kind === 'phone on its side';
    const zoom = Math.min(1, Math.max(fit * AB_COMPACT / COMPACT, AB_FLOOR));
    const buttons = side ? Math.max(r('lab') * ts, r('body')) * zoom
      : w < 360 ? r('lab') * ts * Math.max(fit, 1 / ts)   // (styles/app.css @media (max-width: 359px))
        : Math.min(r('body') * ts, Math.max(r('lab') * ts, r('body'))) * zoom;
    ok(`${kind} ${w}x${hgt} at ${ts * 100} %, ${fit === 1 ? 'Regular' : 'Compact'}`,
      { title: r('val') * ts * pk * fit, words: r('lab') * ts * pk * fit, buttons, tab: 12 * ts });
  }
});

test('a laptop or a sideways iPad: the same order at Regular and Compact', () => {
  for (const vh of [5, 6.5, 8, 9, 10, 12, 15]) for (const ts of TEXT_STEPS) for (const [tk, bk] of [[1, 1], [WIDE.title, WIDE.words]]) {
    const B = clamp(2.311 * vh, 17, 28) * ts, cp = clamp(1.4 * B, 18, 40);
    ok(`1vh ${vh} px at ${ts * 100} %, ${tk === 1 ? 'Regular' : 'Compact'}`,
      { title: clamp(5.546 * vh, 32, 67) * ts * tk, words: B * bk, buttons: clamp(2.022 * vh, 14, 24.5) * ts * bk, tab: Math.max(12, cp * 0.72 * 0.56) });
  }
});

test('Compact is one fixed step below Regular, the same on every slide', () => {
  assert.ok(COMPACT < 1 && COMPACT >= 0.75);
  assert.ok(WIDE.title < 1 && WIDE.words < 1 && WIDE.words >= WIDE.title);
});
