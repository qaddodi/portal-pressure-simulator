// The six-case summary (visual: 'ladders', Sites 10 and Where-resistance 8): each case's Gut to heart chart in its cell, the
// site and the cause on its first row with no HVPG pill on a wide screen (the chart's bracket shows it), and on a phone one line a case
// with the red blocks, the stations named once over the six (Mohammad, 21 Oct), the first row ending in the case's HVPG and PPG pills
// (Mohammad, 23 Oct).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import { causeFit } from '../src/ui/cause-fit.js';
import { DECKS } from '../src/ui/decks.js';
import { pillReadings } from '../src/ui/tool-profile.js';
import { WIDE } from '../src/ui/card-type.js';
import { RATE } from '../src/ui/table-marks.js';
import { deckStates } from './deck-states.js';
import { presenterSource } from './split-src.js';

const js = unsnap(presenterSource());
const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');


test('the first row names the site and the cause, the cause stepping down to fit, never under 12 px, never wrapped; the pills after it', () => {
  // (The size and the move under the site come from the measured row: the room the site and the gap leave, the cause's own width, the floor 12 px on the screen.)
  // (The room is the row less the site, the pills where they show (a wide screen hides them: no width) and a gap beside each.)
  assert.match(js, /const gap = parseFloat\(getComputedStyle\(k\)\.columnGap\) \|\| 0, room = k\.clientWidth - tag\.offsetWidth - gap - \(pills\??\.offsetWidth \? pills\.offsetWidth \+ gap : 0\) - 1;/);
  assert.match(js, /let fit = causeFit\(fs, t\.offsetWidth, room, 12 \/ z\);/);
  // (Under the site it has the whole row: as large as that holds, never under 12 px.)
  assert.match(js, /if \(fit\.under\) fit = \{ \.\.\.causeFit\(fs, t\.offsetWidth, k\.clientWidth - 1, 12 \/ z\), under: true \};/);
  assert.match(js, /if \(fit\.size !== fs\) t\.style\.fontSize = `\$\{fit\.size\.toFixed\(2\)\}px`;\n\s*k\.classList\.toggle\('under', fit\.under\);/);
});



test('a phone\'s line puts each block on its station\'s column, behind the line and the reading, which keeps an outline in the cell\'s colour', () => {
  const strip = prof.slice(prof.indexOf('export function createProfileStrip'));
  const at = (re) => { const m = strip.search(re); assert.ok(m > 0, String(re)); return m; };
  assert.ok(at(/class: 'ppf-blk'/) < at(/class: 'pps-line'/) && at(/class: 'pps-line'/) < at(/class: 'pps-v'/), 'block, line, readings: back to front');
  // (The readings' outline in the cell's colour is the table's prof.strip.v: tests/profile-looks.test.js.)
});

test('the cause is fitted again when its own width changes (its font loading late), not only the row\'s', () => {
  assert.match(js, /new ResizeObserver\(\(es\) => es\.forEach\(\(e\) => fitRow\(e\.target\.closest\('\.pz-cell-k'\)\)\)\)/);
});



test('causeFit: a cause that fits stays, one a little wide steps down in proportion, one that cannot fit at 12 px goes under the site, none grows', () => {
  assert.deepEqual(causeFit(13.85, 150, 180, 12), { size: 13.85, under: false });
  const a = causeFit(13.85, 190, 180, 12);
  assert.ok(Math.abs(a.size - 13.85 * 180 / 190) < 1e-9 && !a.under, '5% over: 5% down');
  assert.deepEqual(causeFit(14, 140, 120, 12), { size: 12, under: false }, 'it fills the room exactly at the floor');
  assert.deepEqual(causeFit(13.85, 223, 179, 12), { size: 12, under: true }, 'never under the floor: it moves under the site instead');
  assert.deepEqual(causeFit(12, 200, 150, 13.8), { size: 12, under: true }, 'a floor above its size never makes it larger');
});

test('on an iPhone, "Sinusoidal obstruction syndrome" cannot share a row with POSTSINUSOIDAL at 12 px; "Sinusoidal obstr. synd." can', () => {
  // (Widths worked out from the font files, Source Serif 4 at 600 for the cause and Inter at 600 with the card's letter-spacing for the
  // site, within about 3 % of the browser's, which kerns: the card's row is the screen's width less 77 px, its site 134 px wide at
  // 13.8 px, the gap .6em. The site shares the row, so the cause has the row less the site, not the whole row.)
  const room = (screen) => screen - 77 - 134 - 8.3 - 1;
  const FULL = [223.2, 197.7], SHORT = [153.1, 135.5];   // (px at 13.85 and at 12)
  for (const screen of [375, 390, 402, 430]) {
    const r = room(screen), full = causeFit(13.85, FULL[0], r, 12), short = causeFit(13.85, SHORT[0], r, 12);
    assert.ok(screen >= 430 || full.under, `the full name does not fit on ${screen} px`);
    assert.ok(!short.under && SHORT[1] < r, `the short name fits on ${screen} px, with ${(r - SHORT[1]).toFixed(0)} px to spare at 12 px`);
  }
  assert.ok(causeFit(13.85, SHORT[0], room(320), 12).under, 'a 320 px screen puts it under the site, whole, rather than past the card edge');
});

test('Sites 10 and Where-resistance 14 name sinusoidal obstruction syndrome short on the grid; its slide and the table keep the full name', () => {
  const SHORT = 'Sinusoidal obstr. synd.';
  const deck = (id) => DECKS.find((d) => d.id === id), slide = (d, id) => d.slides.find((x) => x.id === id);
  for (const [d, row] of [['sites', 'postsin'], ['where-resistance', 'a4']]) {
    const grid = slide(deck(d), 'ladders'), table = slide(deck(d), 'summary');
    assert.equal(grid.of.find((o) => o.id === row)?.name, SHORT, `${d} grid`);
    assert.equal(table.of.find((o) => o.id === row)?.name, SHORT, `${d} table rows carry it too (its column shows the title)`);
    assert.doesNotMatch(SHORT, /…|\.\.\./);
  }
  assert.match(slide(deck('sites'), 'postsin').title, /^Sinusoidal obstruction syndrome: /, 'the slide names it in full, then its finding');
});

test('a phone\'s first row ends in the case\'s HVPG and PPG pills, tinted as the chart\'s brackets rate them; a wide screen and a sideways phone show none', async () => {
  // (Each pill: "HVPG n" / "PPG n", the whole mmHg the chart's bracket and pill read, the tone of the same cut-offs.)
  // (Where the cause cannot stay beside the site and the pills it goes under the site, the pills staying at the right of the first line.)
  const sites = DECKS.find((d) => d.id === 'sites'), fps = await deckStates(sites);
  const ids = sites.slides.find((x) => x.id === 'ladders').of.map((o) => (typeof o === 'string' ? o : o.id));
  assert.equal(ids.length, 6);
  for (const id of ids) {
    const fp = fps[sites.slides.findIndex((x) => x.id === id)], pills = pillReadings(fp);
    assert.deepEqual(pills.map((q) => [q.k, q.name]), [['hvpg', 'HVPG'], ['ppg', 'PPG']], `${id}: HVPG then PPG`);
    for (const q of pills) {
      assert.equal(q.v, String(Math.round(fp[q.k])), `${id}: ${q.name} is the case's own whole mmHg`);
      assert.equal(q.rate, RATE[q.k](fp[q.k])[0], `${id}: ${q.name} is tinted by the cut-offs of the chart's bracket`);
    }
  }
  // (Cirrhosis: HVPG and PPG both red. Portal vein thrombosis: HVPG normal, PPG red. Right heart failure: both normal, as on its chart.)
  const at = (id) => Object.fromEntries(pillReadings(fps[sites.slides.findIndex((x) => x.id === id)]).map((q) => [q.k, q.rate]));
  assert.deepEqual(at('sin'), { hvpg: 'hi', ppg: 'hi' });
  assert.deepEqual(at('pvt'), { hvpg: 'ok', ppg: 'hi' });
  assert.deepEqual(at('cardiac'), { hvpg: 'ok', ppg: 'ok' });
  assert.deepEqual(pillReadings(null), []);
});

test('a wide screen\'s six ladders: the title one step down, each case\'s foot gives back the blank under its sinusoidal brace', () => {
  assert.equal(WIDE.title, 0.8, 'the 0.8 in the rule is the app\'s own Compact title step');
  // (The picture draws its brace's name 0.9 em over its foot and its svg is not clipped, so the half em it reaches into the padding stays blank.)
});
