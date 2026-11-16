// {map} is the blood pressure as the tile prints it, "85/63 (68)": systolic/diastolic with the mean in parentheses. A slide's line must call it the blood pressure,
// never "the MAP" (B17, play-test 16 Nov 2026: "brings his MAP to 85/63 (68)", where 85/63 is the pressure and 68 the MAP).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

test('no slide line or note puts {map} after the word MAP', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) for (const k of ['line', 'notes', 'vignette']) {
    const t = s[k]; if (typeof t !== 'string') continue;
    if (t.includes('{map}')) n++;
    assert.ok(!/\bMAP\b[^.{]{0,25}\{map\}/.test(t), `${d.id}/${s.id} ${k}: ${t.match(/.{0,40}\bMAP\b[^.{]{0,25}\{map\}/)?.[0]}`);
  }
  assert.ok(n >= 10, `${n} lines use {map}`);
});
