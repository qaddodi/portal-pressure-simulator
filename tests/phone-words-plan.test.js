// The teaching card's words keep their Regular size on a phone, whatever stands above them (Mohammad, 17 Nov 2026, iPhone: TIPS 6 under a trial
// card, TIPS 12, MASLD 6 under Fibroscan: "Fix this issue everywhere"). The words used to take what the data card left them, 12 px to Compact, so
// every tall top card shrank them. phonePlan (card-type.js) now finds their room from the figure's share and, past that, by closing the data card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import './dom-shim.js';
import { phonePlan, figFloorOf } from '../src/ui/card-type.js';
import { wrapWords } from '../src/ui/tool-trial.js';
import { measure } from '../src/ui/glyph-measure.js';

const GRIP = 18, FOOT = 44, REACH = 60;
const figMinOf = (H) => Math.round(Math.max(170, 0.3 * H));

test('whatever the data card or the words need, the words get their Regular height whenever the screen can hold it', () => {
  for (const H of [568, 667, 736, 812, 844, 896, 932]) {
    const room = H - FOOT - REACH - 8, figMin = figMinOf(H), figFloor = figFloorOf(H), mine = 0.62 * H;
    for (let regular = 120; regular <= 420; regular += 20) for (let data = 0; data <= 700; data += 10) {
      const p = phonePlan({ room, dtop: 8, data, regular, mine, grip: GRIP, figMin, figFloor });
      const where = `H${H} regular ${regular} data ${data}`;
      assert.ok(p.fig >= figFloor && p.fig <= figMin, `${where}: the figure's share ${p.fig} stays between ${figFloor} and ${figMin}`);
      if (regular <= room - GRIP) assert.ok(p.cap >= regular - 1e-6, `${where}: cap ${p.cap} is under the words' Regular ${regular}`);
      if (!p.shut) {
        assert.ok(p.cap >= regular - 1e-6, `${where}: open, the words keep Regular`);
        assert.ok(8 + data + p.cap <= room + 1e-6, `${where}: open, the data card and the words fit the screen`);
      }
    }
  }
});

test('the figure gives way before the data card closes, and the data card closes before the words shrink', () => {
  const H = 859, room = H - FOOT - REACH - 8, figMin = figMinOf(H), figFloor = figFloorOf(H), mine = 0.62 * H;
  // A 250 px card with 270 px of words on a 395 x 859 phone: the figure gives part of its share, the card stays open, the words keep Regular.
  const mid = phonePlan({ room, dtop: 8, data: 250, regular: 270, mine, grip: GRIP, figMin, figFloor });
  assert.equal(mid.shut, false, 'a card the figure can make room for stays open');
  assert.ok(mid.fig < figMin && mid.fig >= figFloor && mid.cap >= 270);
  // MASLD 6 under Fibroscan (365 px) and TIPS 6 under its trial card (about 285 px, 320 of words) on a 390 x 844 phone: the figure would have to go under a fifth of the
  // screen (play-test 17 Nov 2026: the ascites, bowel and colon stood under the words), so the card comes in closed and the figure keeps its band.
  for (const [H2, data, regular] of [[859, 365, 270], [844, 285, 320]]) {
    const r2 = H2 - FOOT - REACH - 8, p = phonePlan({ room: r2, dtop: 8, data, regular, mine: 0.62 * H2, grip: GRIP, figMin: figMinOf(H2), figFloor: figFloorOf(H2) });
    assert.equal(p.shut, true, `H${H2}: the card closes rather than leave the figure under ${figFloorOf(H2)} px`);
    assert.ok(p.fig >= figFloorOf(H2) && p.cap >= regular, `H${H2}: the figure keeps ${p.fig} px and the words stay Regular`);
  }
  assert.ok(figFloorOf(844) >= 0.2 * 844 && figFloorOf(844) <= figMinOf(844), 'the least share is over a fifth of the screen');
  const huge = phonePlan({ room, dtop: 8, data: 560, regular: 270, mine, grip: GRIP, figMin, figFloor });
  assert.equal(huge.shut, true, 'a card too tall for even the figure to make room closes');
  assert.ok(huge.cap >= 270, 'and the words are still Regular');
  const easy = phonePlan({ room, dtop: 8, data: 150, regular: 270, mine, grip: GRIP, figMin, figFloor });
  assert.equal(easy.fig, figMin, 'room to spare: the figure keeps its usual share');
  assert.equal(phonePlan({ room, dtop: 8, data: 0, regular: 270, mine, grip: GRIP, figMin, figFloor, gone: true }).shut, false, 'no data card, nothing to close');
});

test('the phone plan has no way back to a smaller word size: no Compact or 12 px step in phoneTextCap', () => {
  const src = readFileSync(new URL('../src/ui/presenter-ladders.js', import.meta.url), 'utf8');
  const a = src.indexOf('function phoneTextCap'), b = src.indexOf('const DK = ', a);
  const body = src.slice(a, b);
  assert.ok(a > 0 && b > a);
  assert.ok(!/\bCOMPACT\b|\bcompact\b|FIG_REG|textAt\((?!1\))/.test(body), 'phoneTextCap sizes the words at Regular only');
  assert.ok(/phonePlan\(/.test(body));
});

// Every deck slide's words at Regular fit the smallest phone: if one did not, the fit would have to shrink it.
test('on a 667 px phone every deck slide\'s words at Regular fit under the figure\'s least share', async () => {
  const DIR = new URL('../src/ui/decks/', import.meta.url);
  const H = 667, room = H - FOOT - REACH - 8, width = 395 - 2 * 8 - 2 * 14;   // (a 395 px phone, the card's padding)
  const bad = [];
  let n = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    for (const s of d.slides) {
      if (!s.title && !s.line) continue;
      n++;
      const plain = (x) => String(x || '').replace(/\*\*/g, '').replace(/\{[^}]*\}/g, '12.3 mmHg');
      const tl = wrapWords(plain(s.title), width, 23.2, 600, measure, 99).length, bl = wrapWords(plain(s.line), width, 17.4, 400, measure, 99).length;
      const h = 30 + tl * 23.2 * 1.25 + 10 + bl * 17.4 * 1.5 + 90;   // (tag row, title, words, source line and the controls' row)
      if (h > room - GRIP - 8) bad.push(`${d.id || f} ${s.id}: ${Math.round(h)} px of ${room - GRIP - 8}`);
    }
  }
  assert.ok(n > 100, `${n} slides read`);
  assert.deepEqual(bad, [], 'words too long to stand at Regular on a 667 px phone');
});
