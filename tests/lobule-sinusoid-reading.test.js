// A lobule slide that lights the portal venule's or the central vein's reading lights the sinusoids' reading too, so
// the sinusoidal pressure shows (pilled) between the two (Mohammad, 16 Oct: "Most patients recover" showed only the central vein).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';

const SRC = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The lobule targets a slide's line lights (presenter.js slideTargets, for { words: target } terms).
const litOf = (s) => (s.terms && !Array.isArray(s.terms) ? Object.entries(s.terms).filter(([w, k]) => /^lobule:/.test(k) && new RegExp(`\\b(?:${esc(w)})\\b`, 'i').test(s.line || '')).map(([, k]) => k) : []);

test('slideTargets lights the sinusoids whenever it lights the portal venule or the central vein', () => {
  const body = SRC.slice(SRC.indexOf('export function slideTargets'), SRC.indexOf('return { labels, terms', SRC.indexOf('export function slideTargets')));
  assert.match(body, /if \(lit\.has\('lobule:central'\) \|\| lit\.has\('lobule:triad'\)\) lit\.add\('lobule:sinusoid'\);/);
  // (after the glow field, which can light a target too)
  assert.ok(body.indexOf("lit.add('lobule:sinusoid')") > body.indexOf('(s.glow || []).forEach'));
});

test('the sinusoids label has a lit pill and is kept when lit (not faded)', () => {
  const pill = CSS.split('\n').find((l) => l.includes(')::before { --pill-o: 1;')) || '';
  assert.ok(pill.includes('.app[data-lit~="lobule:sinusoid"] [data-target="lobule:sinusoid"]'), 'a lit Sinusoids label takes the pill');
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(lz, /const LIT_OK = \[[^\]]*'sinusoid'/);
  assert.match(lz, /setLab\('sin', 'Sinusoids', 'Sinusoids', \.\.\.mv\('sin', m\.P2, m\.R\[1\]\)\)/, 'the reading is the model\'s sinusoidal pressure, one decimal');
});

test('"Most patients recover" and the other central-vein slides get the sinusoids reading', () => {
  const recover = DECKS.find((d) => d.id === 'outflow').slides.find((s) => s.id === 'recover');
  assert.ok(litOf(recover).includes('lobule:central'), 'the slide lights the central veins, so the sinusoids light with them');
  const hit = DECKS.flatMap((d) => d.slides.filter((s) => litOf(s).some((k) => k === 'lobule:central' || k === 'lobule:triad')).map((s) => `${d.id}/${s.id}`));
  for (const id of ['outflow/recover', 'outflow/sos', 'lobule/sos', 'ncph/psvd']) assert.ok(hit.includes(id), id);
});
