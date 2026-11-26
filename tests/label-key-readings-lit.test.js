// Site labels follow one rule for colour and for the set a view names (capture 36b7deac, 25 Nov 2026, Sites and causes):
//  - a KEY READING is never the dimmest label on the screen: Budd–Chiari's RHV 25.0, the number the slide is about, was dimmed to --label-dim next to the right atrium the line named;
//  - the lobule slides that place the resistance light the same three stations (portal venule, sinusoids, central vein), whatever words the line uses.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { slideTargets } from '../src/ui/presenter.js';
import { LOBULE_STATIONS, LOBULE_STATION_AT, TARGETS } from '../src/ui/presenter-words.js';

const slides = DECKS.flatMap((d) => d.slides.map((s, i) => ({ d, s, i, at: `${d.id}#${i + 1}` })));

test('every slide that lights terms also lights each of its key readings that stands at a station, in the station colour', () => {
  let checked = 0;
  for (const { s, at } of slides) {
    if (s.visual || !s.key) continue;
    const t = slideTargets(s);
    if (!Object.keys(t.terms).length) continue;
    for (const k of s.key) {
      const node = TARGETS[k]?.node;
      if (!node) continue;
      checked++;
      assert.ok(t.terms[node], `${at}: key reading "${k}" (${node}) stands unlit among lit stations`);
    }
  }
  assert.ok(checked > 10, `walked ${checked} key readings`);
});

test('Budd–Chiari: the right hepatic vein (the FHVP, the slide\'s key reading) is lit beside the right atrium the line names', () => {
  const post = DECKS.find((d) => d.id === 'sites').slides.find((s) => s.id === 'post');
  const t = slideTargets(post);
  assert.equal(t.terms.RHV, 'hv');
  assert.ok(t.terms.RA);
});

test('a slide with no lit terms lights nothing more (nothing is dimmed there, so nothing needs lighting)', () => {
  for (const { s, at } of slides) {
    if (s.visual) continue;
    const t = slideTargets(s);
    const base = Object.keys(t.terms).length;
    if (!base) assert.deepEqual(t.terms, {}, at);
  }
});

test('a "Resistance" callout in the lobule lights the portal venule, the sinusoids and the central vein together, on every slide that has one', () => {
  let n = 0;
  for (const { s, at } of slides) {
    if (s.visual || !/^lobule:/.test(s.cam || '') || !LOBULE_STATION_AT.has(s.callout?.at)) continue;
    n++;
    const lit = slideTargets(s).lit;
    for (const k of LOBULE_STATIONS) assert.ok(lit.includes(k), `${at} (callout at ${s.callout.at}) lights ${k}`);
  }
  assert.ok(n >= 8, `walked ${n} callout slides`);
  const sites = DECKS.find((d) => d.id === 'sites').slides.filter((s) => s.callout);
  const sets = sites.map((s) => slideTargets(s).lit.filter((k) => /^lobule:/.test(k)).sort().join());
  assert.equal(new Set(sets).size, 1, 'Sites and causes\' three lobule slides name one set');
});
