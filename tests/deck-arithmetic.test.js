// A slide's words agree with their own arithmetic (play-test 16 Nov 2026, issue 6: "portal vein 7.8 and right atrium 3.0, so the PPG is only 4.3"; 7.8 - 3.0 is 4.8, the
// gradient is the portal vein minus the IVC). The gradients are differences of the pressures beside them: PPG = portal vein - IVC, HVPG = wedged - free hepatic vein.
// A text that quotes a gradient with the pressures it comes from must (1) quote the right ones, not the right atrium for the IVC, and (2) show numbers that subtract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { deckStates } from './deck-states.js';

const dir = new URL('../src/ui/decks/', import.meta.url);
const TOL = 0.16;   // (each of the three prints is rounded to a tenth)
const texts = (s) => [s.line, s.notes, s.vignette, ...(s.ask || []), ...(s.asks || []).flat()].filter((x) => typeof x === 'string');
const keys = (t) => new Set([...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const r1 = (v) => Math.round(v * 10) / 10;

test('a text that derives the PPG from the portal vein and a downstream pressure quotes the IVC, not the right atrium', async () => {
  const bad = [];
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const deck of Object.values(await import(new URL(f, dir)))) {
      if (!deck?.slides) continue;
      for (const s of deck.slides) for (const t of texts(s)) {
        const k = keys(t);
        if (k.has('ppg') && k.has('pv')) { n++; if (k.has('ra') && !k.has('ivc') && /gradient[^.]*\bis only\b|\bminus\b|\bso the (?:PPG|gradient)\b/i.test(t)) bad.push(`${deck.id}/${s.id}: quotes the portal vein, the right atrium and the PPG, but the PPG is the portal vein minus the IVC`); }
        if (k.has('hvpg') && k.has('whvp') && k.has('ra') && !k.has('fhvp')) bad.push(`${deck.id}/${s.id}: the HVPG is the wedged minus the free hepatic venous pressure, not the right atrium`);
      }
    }
  }
  assert.ok(n >= 1, 'a slide quotes both');
  assert.deepEqual(bad, []);
});

test('the gradients a slide prints subtract: PPG = portal vein - IVC, HVPG = WHVP - FHVP', async () => {
  const bad = [];
  let checked = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const deck of Object.values(await import(new URL(f, dir)))) {
      if (!deck?.slides) continue;
      const fps = await deckStates(deck);
      deck.slides.forEach((s, i) => {
        const fp = fps[i];
        if (!fp || s.lapse) return;
        for (const t of texts(s)) {
          const k = keys(t);
          if (k.has('ppg') && k.has('pv') && k.has('ivc')) { checked++; if (Math.abs(r1(fp.pv) - r1(fp.ivc) - r1(fp.ppg)) > TOL) bad.push(`${deck.id}/${s.id}: PPG ${r1(fp.ppg)} against ${r1(fp.pv)} - ${r1(fp.ivc)}`); }
          if (k.has('hvpg') && k.has('whvp') && k.has('fhvp')) { checked++; if (Math.abs(r1(fp.whvp) - r1(fp.fhvp) - r1(fp.hvpg)) > TOL) bad.push(`${deck.id}/${s.id}: HVPG ${r1(fp.hvpg)} against ${r1(fp.whvp)} - ${r1(fp.fhvp)}`); }
        }
      });
    }
  }
  assert.ok(checked >= 1, `only ${checked} checked`);
  assert.deepEqual(bad, []);
});
