import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Variceal bleed 3 to 4 froze the app (25 Oct). The stacked data card measures how far its readings travel (measureUnder) and writes it as
// --pz-d on the card; the card's watcher (lipMO, on its style) measures again. The bleed clock's row is a second .pz-tiles part, and the
// sheet's rule gave every part the travel in its margin (14px - (1 - u) * d): the measured travel then held minus the last one, so each
// write gave a new value, the watcher fired again, and the loop never settled. Only the first part travels; later parts ride under it.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the bleed clock row, the second readings part that froze it, is gone (his 30 Oct)', () => {
  assert.doesNotMatch(js, /pz-clockrow/);
});

test('only the first readings part carries the travel in its margin, phone and wide sheets alike', () => {
  for (const sheet of ['.pz.stack.stack .pz-data.pz-sheet.pz-sheet.tiles-only', '.pz.pz-wide.pz-wide .pz-data.pz-sheet.pz-sheet']) {
    const esc = sheet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(css, new RegExp(`${esc} > \\.pz-tiles \\{[^}]*margin-top: calc\\(1[46]px - \\(1 - var\\(--pz-u\\)\\) \\* var\\(--pz-d, 0px\\)\\)`), `${sheet}: the first part travels`);
    assert.match(css, new RegExp(`${esc} > \\.pz-tiles ~ \\.pz-tiles \\{ margin-top: 0; \\}`), `${sheet}: a later part rides under it`);
  }
  // (No rule names a later part with the travel.)
  for (const m of css.matchAll(/([^{}]*\.pz-tiles ~ \.pz-tiles[^{]*)\{([^}]*)\}/g)) assert.doesNotMatch(m[2], /--pz-d/, m[1].trim());
});

test('the measure of the travel never reads --pz-d back: every part has its out margin while measured', () => {
  const body = js.match(/function measureUnder\(d\) \{[\s\S]*?\n {2}\}\n/)?.[0] ?? '';
  assert.ok(body, 'measureUnder found');
  const set = body.indexOf("for (const c of parts.slice(1)) c.style.marginTop = '0px';"), read = body.indexOf('const h1 = hh()');
  assert.ok(set > 0 && set < read, 'later parts set before the card is measured out');
  assert.match(body, /parts\.forEach\(\(c, i\) => \{ c\.style\.cssText = was\[i\]; \}\);/, 'and given back after');
});

// The loop itself, as numbers: the card measured out is its instrument plus each part with its margin. With every part's margin taking the
// travel, the measure keeps flipping; with only the first measured at its out margin (as measureUnder does), it holds after one write.
test('the travel settles after one write when later parts ride under the first', () => {
  const inst = 200, parts = [120, 60], gap = 6;
  const measure = (d, laterTravel) => inst + parts.reduce((a, h, i) => a + gap + h + (i === 0 ? 14 : laterTravel ? 14 - d : 0), 0) - inst;
  const run = (laterTravel) => { let d = 0, writes = 0; for (let n = 0; n < 50; n++) { const nd = measure(d, laterTravel); if (Math.abs(nd - d) <= 0.05) break; d = nd; writes++; } return writes; };
  assert.equal(run(true), 50, 'with the travel in a later part\'s margin it never settles (the freeze)');
  assert.equal(run(false), 1);
});
