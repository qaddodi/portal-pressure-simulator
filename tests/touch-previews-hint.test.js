// Patient previews open from an ⓘ on touch, as deck previews do (review item 6); the first-run hint shows once,
// in the message card under the top bars, and goes on the first pick (review item 5); HVPG 12 is rising risk (item 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('patient rows get the ⓘ that opens their preview under the row', () => {
  const menu = read('src/ui/menu.js');
  const row = menu.slice(menu.indexOf('function patientRow'), menu.indexOf('const deckPreview'));
  assert.match(row, /class: 'um-info'/);
  assert.match(row, /toggleInline\(li, \(\) => patientPreview\(p\), info\)/);
  assert.match(read('styles/app.css'), /\(pointer: coarse\) \{\s*\.um-row \{[^}]*\}\s*\.um-info \{ display: inline-flex; \}/);
});

test('the first-run hint shows once, as a sticky message card, until the first pick', () => {
  const main = read('src/ui/main.js');
  const fn = main.slice(main.indexOf('function showFirstHint'));
  assert.match(main, /const HINT_KEY = 'pps\.hint'/);
  assert.match(fn, /a vessel or the liver to change it\./);
  assert.match(fn, /sticky: true, onClose: done/);
  assert.match(fn, /store\.on\('selection', \(sel\) => \{ if \(sel\) close\(\); \}\)/);
  assert.match(fn, /localStorage\.setItem\(HINT_KEY, '1'\)/);
  assert.match(fn, /if \(navigator\.webdriver\) return;/, 'never in the browser checks or visual references');
});

test('no slide says varices bleed from a set HVPG of 12', () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const s = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(s, /can bleed once the HVPG|From what HVPG can varices bleed|from 12 (mmHg )?varices can bleed|(At|Above) 12 (or more|mmHg),? varices can bleed|12 or more: varices can bleed/i, f);
  }
  assert.match(read('src/ui/decks/varices.js'), /title: 'Bleeding risk rises steeply from an HVPG of about 12'/);
});
