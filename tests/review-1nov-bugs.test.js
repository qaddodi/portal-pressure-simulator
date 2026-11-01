// The outside review of 1 Nov (the non-science findings): a device without WebGL2 (A1), text at 200 % clipping a data card (V1), the
// first-use hint and the feedback ask over the wrong surfaces (V2), the 9 px preview badge (V3), the catheter monitor's readings for a
// screen reader (A2) and a slide announced before it is shown (A3). Read from the code; the moves themselves are in the browser checks
// (tests/e2e/smoke.mjs: "no WebGL2", "200 % text", "slide announced").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badgeHtml, BADGE_H } from '../scripts/preview-badge.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const STAGE = read('src/ui/stage.js'), PZ = read('src/ui/presenter.js'), MAIN = read('src/ui/main.js'), PROC = read('src/ui/hvpg-proc.js');
const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); let d = 0, k = src.indexOf('{', i); for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); } return src.slice(i); };

// ── A1: no WebGL2 ──
test('A1: the colour parser is a canvas of its own, not one the GPU figure makes', () => {
  assert.doesNotMatch(STAGE, /const colorCtx = veins \?/, 'it was null with no GPU, and toRGB wrote to it');
  assert.match(STAGE, /const colorParser = \(\) => \{\s*if \(colorCtx === undefined\) \{ try \{ colorCtx = document\.createElement\('canvas'\)\.getContext\('2d'\); \} catch \{ colorCtx = null; \} \}/);
  const to = body(STAGE, 'function toRGB(c, cs)');
  assert.match(to, /const ctx = colorParser\(\);/);
  assert.match(to, /if \(!ctx\) return /, 'and a browser with no 2D context still answers (black for what it cannot read)');
  assert.doesNotMatch(to, /colorCtx\./, 'every write goes through the checked context');
});

test('A1: the colour a canvas gives back is read the same as before (#rrggbb, or the first three numbers of rgba())', () => {
  const read2 = body(STAGE, 'function readRGB(f)');
  const readRGB = new Function(`${read2}; return readRGB;`)();
  assert.deepEqual(readRGB('#ff8000').map((v) => Math.round(v * 255)), [255, 128, 0]);
  assert.deepEqual(readRGB('rgba(10, 20, 30, 0.5)').map((v) => Math.round(v * 255)), [10, 20, 30]);
  assert.equal(readRGB('nonsense'), null);
});

test('A1: a slide\'s glows and outlines are the figure\'s decoration: one that cannot be drawn leaves the slide, never half-changed', () => {
  const o = body(PZ, 'function paintOverlays(s, to, st, hooks = true)');
  assert.match(o, /try \{ stage\.setGlow\(tg\.glow\); stage\.pinOrgans\(tg\.organs\.map\(/);
  assert.match(o, /catch \(e\) \{ console\.warn\(`presenter: slide \$\{to \+ 1\}'s glows and outlines could not be drawn`, e\); \}/);
});

// ── V1: a large text size ──
test('V1: a data card the fit cannot make whole takes the room from the words, which zoom as a whole, never from the chart', () => {
  const lay = body(PZ, 'function layout(');
  const at = lay.indexOf('The words give way once more');
  assert.ok(at > lay.indexOf('fitCards(ui.data, ui.panel);'), 'after the data card has had its own fit');
  const sq = lay.slice(at, lay.indexOf('The stacked pair shorter than the screen is centred'));
  assert.match(sq, /if \(below && t && !off\(dd\) && !phone\(\) && stage\.labelScale\(\) > 1\.001\) \{/, 'only a stacked card on a wide screen, and only at a larger text size than the usual (a readings\' sheet too: its instrument is what it must hold, the readings rise from under it)');
  assert.match(sq, /const cut = overflowOf\(dd\)\.v;\s*if \(!\(cut > 1\)\) break;/, 'a card that fits is never touched');
  assert.match(sq, /const have = t\.height \/ k, z = wordsFloor\(\);\s*if \(z >= 1\) break;/, 'a text size that is not larger gives the words nothing to give');
  assert.match(sq, /const room = Math\.max\(wordsHeightAt\(z\), have - cut\);/, 'never past the words\' own floor');
  assert.match(sq, /fitDone\.delete\(ui\.data\); fitCards\(ui\.data\);/, 'and the data card is fitted again in the room it gains');
  assert.match(sq, /y = top0 \+ t\.height \+ 2 \* pad \+ gap \+ lipK;/, 'its top is the words\' foot, a gap and (a readings\' sheet) its tucked edge, as before the words gave way');
  assert.match(lay, /const lipK = below && wideSheet\(dd\) \? LIP \* k : 0;[^\n]*\n\s*let y = top0 \+ t\?\.height \+ 2 \* pad \+ gap \+ lipK;/);
  assert.match(lay, /Math\.min\(\(H - lvl - pad - \(low \? vm : sl\)\) \/ k, wordsCap\)/, 'the cap holds to the end of the layout, so the words are not fitted back up');
});

test('V1: the words\' floor keeps their smallest lettering at 12 px on the screen, and a half at the most', () => {
  const f = body(PZ, 'function wordsFloor()');
  assert.match(f, /px > 12 && isFinite\(px\) \? Math\.max\(0\.5, Math\.ceil\(12 \/ px \* 1000\) \/ 1000\) : 1/);
  assert.match(f, /ts\.removeProperty\('--pz-fit'\);\s*const px = minText\(ui\.text\);\s*if \(sv\) ts\.setProperty\('--pz-fit', sv\);/, 'measured with no fit, put back as it was');
});

// ── V2: messages over the wrong surface ──
test('V2: the first-use hint leaves when a talk begins, and is not counted as read', () => {
  const hint = body(MAIN, 'function showFirstHint()');
  assert.match(hint, /offTalk = store\.on\('presenting', \(on\) => \{ if \(on\) close\('talk'\); \}\);/);
  assert.match(hint, /const done = \(why\) => \{ off\?\.\(\); off = null; offTalk\?\.\(\); offTalk = null; if \(why === 'talk'\) return; try \{ localStorage\.setItem\(HINT_KEY, '1'\)/);
  assert.match(hint, /sticky: true, onClose: done/, 'still one sticky card until a pick, as before');
});

test('V2: the feedback ask waits for every open working surface on every screen, not only a phone', () => {
  const ask = body(MAIN, 'function armFeedbackAsk()');
  assert.doesNotMatch(ask, /isPhone\(\)/, 'no screen is let off');
  for (const open of ["app.classList.contains('dock-open')", 'panelShown()', 'treatOpen()', 'historyOpen()', 'popoverOpen()', "document.getElementById('modalBack')?.classList.contains('show')"]) assert.ok(ask.includes(open), open);
  assert.match(ask, /\|\| down \|\| presenter\.active\(\) \|\| projector \|\|/, 'a drag, a talk and projector mode, as before');
});

// ── V3: the preview badge ──
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
test('V3: the preview badge keeps the 12 px floor, with room for it, and white on its fill reads at 4.5 : 1', () => {
  const html = badgeHtml('abc12345');
  const font = /font:(\d+) (\d+)px\/(\d+)px/.exec(html);
  assert.ok(font, 'one font shorthand');
  assert.ok(+font[2] >= 12, `${font[2]} px`);
  assert.equal(+font[3], BADGE_H, 'the line is the tab\'s height');
  assert.ok(BADGE_H >= 16, 'room for 12 px words');
  const bg = /background:(#[0-9a-f]{6})/i.exec(html)[1];
  assert.ok((1.05) / (lum(bg) + 0.05) >= 4.5, `${bg} against white`);
  assert.match(html, /white-space:nowrap/, 'a long label never wraps into a taller tab');
  assert.match(html, />PREVIEW · abc12345</);
});

test('V3: the browser checks keep slide words clear of the badge as tall and wide as it is now', () => {
  const fit = read('tests/e2e/phone-fit.mjs');
  assert.match(fit, /r\.top < 16 && r\.bottom > 1 && r\.right > cx - 95 && r\.left < cx \+ 95/);
});

// ── A2: the catheter monitor in a talk ──
test('A2: the presenter\'s catheter monitor has its readings as text, written when the phase changes and once the numbers hold still', () => {
  const m = body(PROC, 'export function createHvpgMonitor()');
  assert.match(m, /role: 'group', 'aria-label': 'Catheter pressure readings'/);
  assert.match(m, /const said = h\('p', \{ class: 'sr-only' \}\);/);
  const say = body(m, 'const sayNow = () =>');
  for (const word of ['Free hepatic venous pressure (FHVP)', 'Wedged hepatic venous pressure (WHVP)', 'the wedged pressure (WHVP)', 'minus the free pressure (FHVP)', 'mmHg', 'HVPG is not measurable', 'sevWord(v.hvpg)']) assert.ok(say.includes(word), word);
  assert.match(say, /STEPS\[1\]\[2\]/, 'the same words as the procedure card gives the free step');
  assert.match(say, /STEPS\[2\]\[2\]/, 'and the wedged step (the plateau, once the pressure settles)');
  assert.match(m, /const saySoon = \(\) => \{ clearTimeout\(sayT\); sayT = setTimeout\(sayNow, 400\); \};/, 'debounced: a sweep\'s every frame is not written');
  assert.match(body(m, 'function set(m, f = null, b = bal, instant = false)'), /saySoon\(\);/);
  assert.doesNotMatch(say, /aria-live/, 'not announced out of turn: it is read as the card is read');
});

// ── A3: the slide announcement ──
test('A3: a slide is announced once it is on screen, and the cards say they are changing meanwhile', () => {
  const a = body(PZ, 'function announce(force = false)');
  assert.match(a, /\(force \|\| landedNow\(\)\) && ui\.say\.textContent !== t/);
  assert.match(a, /aria-busy/);
  assert.match(PZ, /const landedNow = \(\) => !!shown && shown\.i === want && shown\.gen === gen;/);
  const chrome = body(PZ, 'function paintChrome()');
  assert.match(chrome, /\bannounce\(\);/);
  assert.doesNotMatch(chrome, /ui\.say\.textContent = /, 'the bar\'s count may run ahead; the announcement does not');
});

test('A3: a move that ends, or fails, settles the announcement and puts the cards\' busy flag away', () => {
  const run = body(PZ, 'async function run()');
  assert.match(run, /\} finally \{ busy = false; announce\(\); \}/);
  assert.match(run, /catch \(e\) \{[^}]*console\.error\(`presenter: slide \$\{want \+ 1\} could not be shown`, e\);\s*busy = false; announce\(true\);/);
  assert.match(run, /if \(landed\) await beatMove\(want, beat\); else await transition\(want\);/, 'one loop, as before');
  assert.match(run, /busy = true; announce\(\);/, 'busy from the start of the move, so a reader waits');
});
