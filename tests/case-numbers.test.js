// Case cards agree with their slide (doc deck-accuracy-and-feature-use 4.5, 8 Nov 2026). The numbers a vignette quotes (platelets "N,000/µL", a
// stiffness "N kPa", a volume of ascites in litres, or "no ascites") are compared with the same slide's state, built in node (deckStates). The 88,000 in the
// guide's own format example had been copied into six decks as if it were a value; this test fails a number the slide does not show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { deckStates } from './deck-states.js';

const dir = new URL('../src/ui/decks/', import.meta.url);
const PLT_TOL = 2, LSM_TOL = 1, ASC_TOL = 0.3;   // (thousand per µL, kPa, litres)

test('every case card quotes the slide\'s own platelets, stiffness and ascites', async () => {
  const bad = [];
  let checked = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const deck of Object.values(await import(new URL(f, dir)))) {
      if (!deck?.slides) continue;
      const fps = await deckStates(deck);
      deck.slides.forEach((s, i) => {
        const v = s.vignette, fp = fps[i];
        if (!v || !fp || s.lapse) return;   // (a time-lapse slide's state is where the lapse ends; its case describes where it starts)
        const at = `${deck.id}/${s.id}`;
        for (const m of v.matchAll(/(\d{2,3}),000\s*\/\s*µL/g)) { checked++; if (Math.abs(+m[1] - fp.plt) > PLT_TOL) bad.push(`${at}: platelets ${m[1]},000 against ${fp.plt.toFixed(0)}k`); }
        for (const m of v.matchAll(/(\d+(?:\.\d+)?)\s*kPa/g)) { checked++; if (Math.abs(+m[1] - fp.lsm) > LSM_TOL) bad.push(`${at}: stiffness ${m[1]} kPa against ${fp.lsm.toFixed(1)}`); }
        for (const m of v.matchAll(/(\d+(?:\.\d+)?)\s*(?:L|liters?|litres?)\b(?:\s+of\s+(?:ascites|fluid))?/g)) {
          if (!/ascites|fluid|paracentesis|belly|abdomen/i.test(v)) continue;
          if (/paracentesis/i.test(v.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20))) continue;   // (a tap's volume is the plan, not the state)
          checked++; if (Math.abs(+m[1] - fp.asc / 1000) > ASC_TOL) bad.push(`${at}: ${m[1]} L against ${(fp.asc / 1000).toFixed(1)} L of ascites`);
        }
        if (/\bno ascites\b/i.test(v) && fp.asc / 1000 > ASC_TOL) bad.push(`${at}: "no ascites" with ${(fp.asc / 1000).toFixed(1)} L`);
        if (/\bascites\b/i.test(v) && !/\bno ascites\b|without ascites|ascites[^.]*(?:resolved|gone)/i.test(v) && /despite|on (?:spironolactone|diuretics)|controlled on/i.test(v) && fp.asc / 1000 < 0.3) bad.push(`${at}: a case with ascites on a slide with ${(fp.asc / 1000).toFixed(1)} L`);
      });
    }
  }
  assert.ok(checked >= 20, `only ${checked} numbers checked`);
  assert.deepEqual(bad, []);
});
