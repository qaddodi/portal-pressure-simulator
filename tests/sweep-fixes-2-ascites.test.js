// Sweep 2 review, Tests > Ascites (items 3, 4, 18, 19, 20): on a 320 px phone the belly's words sit centred inside the
// ring with the daily balance whole and 4 px or more off it, the lab tiles keep their 9 px gutter on a folded sheet and
// read "Fluid protein" / "Fluid albumin" whole (no ellipsis anywhere in the pane), a phone on its side shows the whole
// card with no scrolling, and the IAP dial's words keep 4 px off the arc at 12 px.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), instr = read('../src/ui/instruments.js');
// The body of the first @container block whose prelude matches, with its nested braces.
const containerBlock = (prelude) => {
  const i = css.indexOf(prelude);
  assert.ok(i >= 0, `no ${prelude}`);
  let d = 0, j = css.indexOf('{', i);
  const s = j;
  for (; j < css.length; j++) { if (css[j] === '{') d++; else if (css[j] === '}' && --d === 0) break; }
  return css.slice(s + 1, j);
};

test('item 3: a small belly lets the balance take two lines that hug the words, centred, its arrow readable', () => {
  const b = containerBlock('@container (max-width: 124px)');
  assert.match(b, /\.dock-pane > \.instrument-view\.ab \.ab-belly > \.ab-big > \.ab-rate\[data-dir\] \{ display: block; width: min-content; max-width: 100%; white-space: normal; text-align: center;/);
  assert.match(b, /\.ab-rate\[data-dir\] > \.ab-rate-a \{ margin-right: \.3em; color: inherit; \}/);
  // (A steady line holds the second line's room, so the litres and grade never jump when the balance appears.)
  assert.match(b, /\.ab-rate\[data-dir="steady"\] \{ margin-bottom: 1\.1em; \}/);
  // (Only in the Tests card; a slide's belly keeps its one-line balance.)
  assert.doesNotMatch(b, /(^|\n)\s*\.ab \.ab-belly/);
  // The litres' unit is 12 px at least on the small belly (it was half the 20 px number: 10 px).
  assert.match(css, /\.dock-pane > \.instrument-view\.ab \.ab-belly > \.ab-big > b small \{ font-size: max\(12px, \.5em\) !important; \}/);
  // The text between the rate's number and its unit is a plain space, the one place the line may break.
  assert.match(instr, /`\$\{fmt\(b, 0\)\} mL\/day`/);
});

test('item 4: on a 320 px phone the albumin switch stays as low as the one-line one, so the tiles keep their gutter', () => {
  const b = containerBlock('@container (max-width: 300px) {   /* (a 320 px phone');
  assert.match(b, /\.ab-dp-alb \{[^}]*row-gap: 0;[^}]*min-height: 32px; padding: 1px 4px 1px 6px; \}/);
});

test('item 18: the lab tiles read their whole names at every size; nothing in the pane is cut with an ellipsis', () => {
  assert.match(instr, /lab\('SAAG'\), \[tpEl, tpV\] = lab\('Fluid protein'\), \[albEl, albV\] = lab\('Fluid albumin'\)/);
  assert.match(css, /\.ab-tile dt \{ font-size: var\(--fs-12\); font-weight: 500; color: var\(--text-3\); white-space: nowrap; \}/);
  for (const m of css.matchAll(/([^{}\n]*\.ab-[^{}]*)\{([^}]*)\}/g)) assert.doesNotMatch(m[2], /text-overflow:\s*ellipsis/, m[1].trim());
  // (At 320 px the tiles take the width their names need: SAAG is short, so the two fluid tiles get the room.)
  const b = css.slice(css.indexOf('read whole at 12 px, as on every other size'));
  assert.match(b, /@container \(max-width: 300px\) \{\s*\.dock-pane > \.instrument-view\.ab \.ab-tiles \{ grid-template-columns: repeat\(3, auto\); gap: 6px; \}/);
});

test('item 19: a short side card closes up and sets Serum albumin beside Diuretics, so nothing needs scrolling', () => {
  assert.match(css, /\.dock-pane:has\(> \.instrument-view\.ab\) \{ container-name: ab-pane; \}/);
  const b = containerBlock('@container ab-pane (max-height: 330px)');
  // The belly leaves each side 104 px, so the litres, the albumin switch and the dial never crowd (it was held at 150 px).
  assert.match(b, /--ab-bw: clamp\(92px, min\(100cqi - 216px, 116px\), 116px\)/);
  assert.match(b, /\.ab-ctl \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(b, /\.ab-ctl > \.ab-row \{ grid-template-columns: 20px minmax\(0, 1fr\) auto; grid-template-areas: "i t v" "s s s";/);
  assert.match(b, /\.ab-ctl > \.ab-tg > \.ab-txt \{ display: contents; \}/);
  // (Only on a side card: a folded phone sheet is short too, but it scrolls by design.)
  for (const line of b.split('\n').filter((l) => l.includes('{'))) assert.match(line, /\.instrument-workspace(\.float-ui)?\.side/, line.trim());
});

// The dial's text column and its words' sizes, as fit() sets them, against the arc's inner edge (radius 56 - 3.5 around
// 64, 64). Widths and line boxes in em are Inter's, as measured in the browser at 12.2 px: "mmHg" 3.14 em, "IAP" with its
// .12 em tracking 2.0 em; the line box 0.97 em above the baseline and 0.26 em below.
const dialClearance = (k) => {
  const C = 64, TX = 42, rin = 56 - 3.5, f = Math.max(8.5, 12.2 * k);
  const box = (y, w) => [[TX - w / 2, y - 0.97 * f], [TX + w / 2, y - 0.97 * f], [TX - w / 2, y + 0.26 * f], [TX + w / 2, y + 0.26 * f]];
  const clear = (pts) => (rin - Math.max(...pts.map(([x, y]) => Math.hypot(x - C, y - C)))) / k;   // (in CSS px)
  const yu = 74 + 0.72 * f;
  return { iap: clear(box(43, 2.0 * f)), mmHg: clear(box(yu, 3.14 * f)) };
};

test('item 20: the 320 px dial is drawn large enough that IAP and mmHg keep 4 px off the arc at 12 px', () => {
  const b = containerBlock('@container (max-width: 300px) {   /* (a 320 px phone');
  assert.match(b, /\.dock-pane > \.instrument-view\.ab \.ab-dial-box \{ width: min\(76px, \(100cqi - var\(--ab-bw\) - 16px\) \/ 2 - 6px\); \}/);
  // At 320 px the row is 280 px and the belly 96 px: the side leaves 78 px, so the dial is 76 px wide (k = 1).
  const side = (280 - 96 - 16) / 2 - 6, w = Math.min(76, side), k = 76 / w;
  assert.equal(w, 76);
  const c = dialClearance(k);
  assert.ok(c.iap >= 4, `IAP ${c.iap.toFixed(2)} px off the arc`);
  assert.ok(c.mmHg >= 4, `mmHg ${c.mmHg.toFixed(2)} px off the arc`);
  // (The 57 px dial it replaces put them 1.8 and 2.9 px from the arc, as the review measured.)
  const old = dialClearance(76 / 57);
  assert.ok(old.mmHg < 4 && old.iap < 4);
  // The words stay 12 px on screen.
  assert.match(instr, /const f = \(base\) => Math\.max\(base, 12\.2 \* k\);/);
  // On a phone on its side the dial is 74 px at most, and its words keep the same room.
  assert.match(containerBlock('@container ab-pane (max-height: 330px)'), /\.ab-dial-box \{ width: min\(74px, \(100cqi - var\(--ab-bw\) - 16px\) \/ 2 - 6px\); \}/);
  const s = dialClearance(76 / 74);
  assert.ok(s.iap >= 4 && s.mmHg >= 4, JSON.stringify(s));
});
