import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCALE, TILE, RATE, bandsOf, rateOf, dirAbs } from '../src/ui/table-marks.js';

// Each data card tile's scale bar (layout A): its bands take the tile's own rating, so the bar and the status word agree.
const bandRates = (k) => bandsOf(k).map((z) => rateOf(k, { asc: 1e4, [k]: z.m })[0] || 'info');

test('every rated tile has a scale, with its cut-offs in order inside it', () => {
  for (const k of Object.keys(RATE)) assert.ok(SCALE[k], `${k} has no scale`);
  for (const [k, [a, b, cuts]] of Object.entries(SCALE)) {
    assert.ok(TILE[k], `${k} is a tile`);
    assert.ok(a < b, k);
    cuts.forEach((c, i) => assert.ok(c > a && c < b && (i === 0 || c > cuts[i - 1]), `${k} cut-off ${c}`));
  }
});

test('the bands follow the ratings (Baveno VIII stiffness, platelets lower is worse)', () => {
  assert.deepEqual(bandRates('hvpg'), ['ok', 'mid', 'hi']);
  assert.deepEqual(bandRates('ppg'), ['ok', 'mid', 'hi']);
  assert.deepEqual(bandRates('lsm'), ['ok', 'mid', 'mid', 'hi']);
  assert.deepEqual(bandRates('plt'), ['hi', 'mid', 'ok']);
  assert.deepEqual(bandRates('asc'), ['ok', 'mid', 'hi', 'hi']);   // (litres shown, millilitres rated)
  assert.deepEqual(bandRates('hr'), ['info', 'ok', 'hi']);          // (slow is gray: a beta-blocked rate is the goal)
  assert.deepEqual(bandRates('shunt'), ['ok', 'mid', 'hi']);       // (percent shown, a fraction rated)
});

test('WHVP and FHVP have bars like HVPG\'s (22 Oct): the portal pressure\'s bands and the IVC\'s, as their table arrows read them', () => {
  assert.deepEqual(bandRates('whvp'), ['ok', 'mid', 'hi']);
  assert.deepEqual(bandRates('fhvp'), ['ok', 'hi']);
  assert.deepEqual(SCALE.whvp, SCALE.pv, 'the wedged pressure is judged as the portal vein\'s');
  assert.deepEqual(SCALE.fhvp, SCALE.ivc, 'the free pressure is judged as the IVC\'s (AASLD 2024, Box 2: almost identical)');
  const word = { ok: 'Normal', mid: 'High', hi: 'Severe' };
  for (let v = 0; v <= 35; v++) {
    const [c, w] = rateOf('whvp', { whvp: v });
    assert.equal(w, word[c], `WHVP ${v}`);
    assert.equal({ ok: 0, mid: 1, hi: 2 }[c], dirAbs('whvp', { whvp: v }), `WHVP ${v}: the tile and the table arrow agree`);
    assert.deepEqual(rateOf('fhvp', { fhvp: v }), rateOf('ivc', { ivc: v }), `FHVP ${v} reads as the IVC does`);
    assert.equal(dirAbs('fhvp', { fhvp: v }) > 0, rateOf('fhvp', { fhvp: v })[0] === 'hi', `FHVP ${v}: red where the arrow points up`);
  }
  // (Healthy 6.5 and 4.1, right heart failure 20 and 19.4, compensated cirrhosis 10.5 and 4.1.)
  assert.deepEqual(rateOf('whvp', { whvp: 6.5 }), ['ok', 'Normal']);
  assert.deepEqual(rateOf('fhvp', { fhvp: 19.4 }), ['hi', 'High']);
  assert.deepEqual(rateOf('whvp', { whvp: 10.5 }), ['mid', 'High']);
});

test('the Tests › HVPG readings carry their tile\'s colour too, and ease into it', () => {
  const js = readFileSync(new URL('../src/ui/hvpg-proc.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(js, /for \(const k of \['fhvp', 'whvp'\]\) \{\s*const sk = shown\[k\] \? sevOfRead\(k, v\[k\]\) : '';/);
  assert.match(css, /\.hvpg-kv dd \{[^}]*transition: color \.4s var\(--ease\)/, 'the colour never snaps');
});

test('the bar takes the change line\'s place, so a tile never grows for it', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-tile:has\(\.pzb-was:not\(\[hidden\]\)\) \.pzt-d \{ display: none; \}/);
  assert.match(css, /\.pz-tile \.pzt-bar \{[^}]*height: calc\(/, 'the bar has a fixed height');
  assert.match(css, /\.pzt-bar\.empty \{ visibility: hidden; \}/, 'a tile with no scale keeps the room, so a row stays one height');
});

test('the now dot and the start ring stay whole inside the track, even past either end of the scale (sweep, 16 Oct)', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const size = (cls) => +css.match(new RegExp(`\\.${cls} \\{[^}]*width: ([\\d.]+)px`))[1];
  // (Platelets of 380 on a bar that stops at 300 put the dot half off the end, its halo on the card's border.)
  const r = size('pzb-now') / 2, r0 = size('pzb-was') / 2;
  assert.ok(js.includes(`p.now.style.left = \`clamp(${r}px, \${w}%, calc(100% - ${r}px))\``), 'the dot rests against the end, whole');
  assert.ok(js.includes(`p.was.style.left = \`clamp(${r0}px, \${w0}%, calc(100% - ${r0}px))\``), 'the ring rests against the end, whole');
});

test('a tile\'s number and unit always fit inside it, shrinking together, the unit never below 12 px (pregnancy deck, 17 Oct)', () => {
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const body = js.slice(js.indexOf('function bigTiles()'), js.indexOf('// The six levels along the route'));
  const fit = body.slice(body.indexOf('function fit()'), body.indexOf('function build('));
  assert.ok(fit.length > 0, 'bigTiles has a fit');
  assert.match(fit, /12 \/ uf/, 'the unit stops at 12 px');
  assert.match(fit, /Math\.max\(12,/, 'the number never goes below 12 px');
  assert.match(fit, /lineHeight = vs\.lineHeight/, 'the line keeps its height, so the card never changes size');
  assert.match(fit, /p\.fin/, 'measured with the number it counts to as well');
  assert.match(body, /new ResizeObserver\(fitSoon\)\.observe\(el\)/, 'again when the row changes size');
  assert.match(body, /p\.fin = tileVal\(p\.k, to\[p\.k\]\);\s*draw\(to, ms\);\s*fitSoon\(\);/, 'every set fits');
});
