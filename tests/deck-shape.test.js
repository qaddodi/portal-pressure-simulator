// The shape every built-in talk keeps (deck rebuild, 25-26 Oct): few lenses, steady data cards inside a section, short lines,
// no source line under the words. A slide that needs otherwise goes in an allowlist below, with its reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, withOverview } from '../src/ui/decks.js';

const words = (t) => (t || '').split(/\s+/).filter(Boolean).length;

test('a talk uses at most two lenses (the lens buttons on a slide are not counted)', () => {
  const over = DECKS.map((d) => [d.id, [...new Set(d.slides.map((s) => s.lens).filter(Boolean))]]).filter(([, l]) => l.length > 2);
  assert.deepEqual(over, []);
});

// Next to each other in a section, two slides with the same instrument keep the same tiles, so the data card holds still.
// These pairs change them on purpose: an instrument that carries its own reading (the Doppler monitor, FibroScan), a patient
// switch, or a tile that appears when the slide is about it.
const TILES_CHANGE = new Set([
  'ascites/tense>lvp', 'ascites/lvp>back',                      // the albumin tile appears for the paracentesis and leaves with it
  'stiffness/measure>fibrosis',                                 // FibroScan reads in its own picture; the tiles arrive with the lesson
  'doppler/hepatic>meal', 'doppler/slow>normal',                // each Doppler slide shows the reading it is about
  'tips-doppler/narrow>warn', 'tips-doppler/backup>fix',
  'outflow/normal>tr', 'outflow/tr>pulse', 'outflow/pulse>constrict',
  'cause-treated/high>high2',                                   // a second patient with her own pair of tiles
  'gastric-varices/tips>brto',                                  // the gastric varix tile replaces the liver tile
  'hyperdynamic/resist>volume',                                 // the vitals monitor, then the volume tiles
  'ten-years/d365>carv', 'ten-years/rebleed>tips', 'ten-years/tips>he', // one patient over ten years: the tiles follow the event
]);

test('inside a section, consecutive slides with the same instrument keep the same tiles', () => {
  const found = new Set(), bad = [];
  for (const d of DECKS) {
    const s = withOverview(d).slides;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      if (!(a.sec && b.sec && a.sec[0] === b.sec[0] && a.tool?.kind && a.tool.kind === b.tool?.kind)) continue;
      if (JSON.stringify(a.tiles || null) === JSON.stringify(b.tiles || null)) continue;
      const k = `${d.id}/${a.id}>${b.id}`;
      found.add(k);
      if (!TILES_CHANGE.has(k)) bad.push(k);
    }
  }
  assert.deepEqual(bad, []);
  assert.deepEqual([...TILES_CHANGE].filter((k) => !found.has(k)), [], 'an allowlisted pair no longer changes its tiles: remove it');
});

// More than two tiles on a slide: three readings that belong together (a gradient with the two pressures it comes from, a
// patient's three markers) or a slide whose point is the third one.
const THREE_TILES = new Set([
  'sites/healthy', 'ascites/lvp', 'treatment/terli', 'circuit/resist', 'circuit/tips', 'shunts/dsrs', 'ncph/patient',
  'pregnancy/before', 'pregnancy/weeks', 'pregnancy/after', 'cause-treated/before', 'cause-treated/year1', 'cause-treated/year2',
  'gastric-varices/tips', 'gastric-varices/brto', 'gastric-varices/svt',
]);

test('no slide has more than two tiles except the listed ones', () => {
  const found = new Set(), bad = [];
  for (const d of DECKS) for (const s of d.slides) {
    if ((s.tiles || []).length <= 2) continue;
    const k = `${d.id}/${s.id}`;
    found.add(k);
    if (!THREE_TILES.has(k)) bad.push(k);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual([...THREE_TILES].filter((k) => !found.has(k)), [], 'an allowlisted slide now has two tiles or fewer: remove it');
});

test('no built-in slide has a cite, and only the TIPS Doppler jet slide has a caveat', () => {
  const cites = [], caveats = [];
  for (const d of DECKS) for (const s of d.slides) {
    if (s.cite) cites.push(`${d.id}/${s.id}`);
    if (s.caveat) caveats.push(`${d.id}/${s.id}`);
  }
  assert.deepEqual(cites, []);
  assert.deepEqual(caveats, ['tips-doppler/jet']);
});

test('every slide line is 30 words or fewer', () => {
  const long = [];
  for (const d of DECKS) for (const s of d.slides) if (words(s.line) > 30) long.push(`${d.id}/${s.id}: ${words(s.line)}`);
  assert.deepEqual(long, []);
});
