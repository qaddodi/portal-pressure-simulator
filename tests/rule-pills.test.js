// The words' pills (review #14, 15 Oct): a filled pill is the patient, so it only ever holds a live value ({hvpg},
// {lsm@spleen}); a number written into the words is a rule or a published figure and is drawn outlined. Here every
// {token} must name a reading, and every {reading@slide} a slide of the same deck, or the pill would read "…".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { TILE } from '../src/ui/table-marks.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const decks = [];
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  for (const d of Object.values(await import(new URL(f, DIR)))) if (d?.slides) decks.push(d);
}

test('every live token in the words names a reading, and every @slide a slide of its deck', () => {
  const bad = [];
  for (const d of decks) {
    const ids = new Set(d.slides.map((s) => s.id).filter(Boolean));
    d.slides.forEach((s, i) => {
      for (const [, mk] of (s.line || '').matchAll(/\{([^}]+)\}/g)) {
        if (/^\d|^[<>≥≤]/.test(mk)) continue;   // (a typed rule or cut-off)
        const [, k, at] = mk.match(/^(\w+)(?:@([\w-]+))?$/) || [];
        if (!k || !TILE[k]) bad.push(`${d.id} ${i + 1}: {${mk}} is not a reading`);
        else if (at && !ids.has(at)) bad.push(`${d.id} ${i + 1}: {${mk}} names no slide of the deck`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test('a number written into the words is drawn as an outlined rule pill, never as the patient', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /else if \(mk\) out\.push\(pill\(mk, mkStop, ' cut'\)\)/, 'a typed {6 to 8 g} is outlined');
  assert.match(src, /else if \(val\) out\.push\(pill\(val, valStop, ' cut'\)\)/, 'the automatic pill (first number with a unit) is outlined');
});
