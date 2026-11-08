// The FibroScan probe's screen shows the slide's number, not "kPa" alone (Mohammad, 7 Nov 2026: "fibro probe has no number" on the fatty
// liver slides). The cause: stage-scan.js wrote the number with putText, which on a connected element makes GPU words (gl-words.js) and
// marks the element glw-on, whose CSS clears its fill (app.css .glw-on { fill: transparent !important }). label-gl.js draws each run of the
// probe's reading by the fill it reads from the page, so the number's run, now clear, was left out while its width stayed: "kPa" sat off
// centre beside a blank. The number is now plain model text (written between frames, never putText), the GPU layer gives a clear number
// run the reading's own ink, and a slide that has pinned its reading gives the probe that same number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scanKpaOf, scanReadingText } from '../src/ui/scan-ease.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the probe reads the slide\'s pinned stiffness, else the live one, else nothing', () => {
  assert.equal(scanKpaOf(14.2, 17.9), 14.2, 'the slide\'s settled number wins over the live one that swings with each beat');
  assert.equal(scanKpaOf(null, 17.9), 17.9);
  assert.equal(scanKpaOf(undefined, 17.9), 17.9);
  assert.equal(scanKpaOf(NaN, 17.9), 17.9);
  assert.equal(scanKpaOf(null, null), null);
  assert.equal(scanKpaOf(null, undefined), null);
});

test('the probe\'s screen always has a number: the card\'s, else its own eased one, else two dashes', () => {
  assert.equal(scanReadingText('13.4', '12.0', 9), '13.4', 'the card\'s frame gives its number');
  assert.equal(scanReadingText(undefined, '12.0', 9), '12.0', 'a card on screen that has not just painted');
  assert.equal(scanReadingText(undefined, null, 9.04), '9.0', 'no card: the probe\'s own reading to a decimal');
  assert.equal(scanReadingText(null, null, null), '--');
  assert.equal(scanReadingText(undefined, '', 22.26), '22.3', 'an empty card text is never put on the screen');
  assert.equal(scanReadingText('', null, 5), '5.0');
  for (const k of [null, 0, 4.96, 25, 100]) assert.ok(scanReadingText(undefined, null, k).length > 0);
});

test('the probe\'s number is plain model text, never GPU words that would clear its fill', () => {
  const src = read('src/ui/stage-scan.js');
  assert.doesNotMatch(src, /putText\(|import \{[^}]*putText/, 'putText makes glWords on a connected element, and .glw-on clears the fill');
  assert.match(read('styles/app.css'), /\.glw-on, \.glw-on \* \{ color: transparent !important;[^}]*fill: transparent !important/, 'the rule the number must stay clear of');
  assert.match(src, /sv\.textContent = scan\.domTxt/, 'written as plain text');
  assert.match(src, /restPass\(\(\) => \{\s*scan\.domAsk = 0;/, 'between frames, not in one');
  assert.match(src, /scan\.shown = null; scan\.svEl = null; scanRecReset\(scanRec, el\)/, 'a new probe element gets its number again');
  assert.match(src, /scanRec\.txt = txt;/, 'the GPU layer draws the record\'s text');
});

test('the GPU layer gives a clear number run the reading\'s own ink', () => {
  const lgl = read('src/ui/label-gl.js');
  assert.match(lgl, /const rf = scs\(read\)\.fill;/);
  assert.match(lgl, /fill: none\(r\.fill\) \? \(sp\.classList\.contains\('sp-val'\) && !none\(rf\) \? rf : ''\) : r\.fill/);
});

test('a slide\'s pinned reading reaches the probe, and goes with the card', () => {
  assert.match(read('src/ui/fibroscan.js'), /fibroReading\.pinned = pinned; fibroReading\.pinnedOrgan = organ;/);
  assert.match(read('src/ui/presenter-tools.js'), /setScanProbe\?\.\(false\); fibroReading\.pinned = null;/, 'cleared when the slide\'s tool goes');
  assert.match(read('src/ui/stage-scan.js'), /fibroReading\.pinnedOrgan === scan\.organ \? fibroReading\.pinned : null/, 'the liver slide\'s number never reads on the spleen probe');
});

test('every deck slide that shows the probe pins a stiffness the model gives', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  const seen = [];
  for (const f of fs.readdirSync(dir)) {
    const m = await import(new URL(f, dir));
    for (const d of Object.values(m)) {
      if (!d?.slides) continue;
      for (const s of d.slides) if (s.tool?.kind === 'fibroscan') seen.push(`${d.id}/${s.id}`);
    }
  }
  assert.ok(seen.length >= 12, `found the probe slides (${seen.length})`);
  for (const id of ['masld/bmi', 'masld/start', 'stiffness/measure', 'meso-rex/stiff', 'cause-treated/before']) assert.ok(seen.includes(id), id);
});
