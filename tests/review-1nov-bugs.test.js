import { stageSource } from './stage-src.js';
// The outside review of 1 Nov (the non-science findings): a device without WebGL2 (A1), text at 200 % clipping a data card (V1), the
// first-use hint and the feedback ask over the wrong surfaces (V2), the 9 px preview badge (V3), the catheter monitor's readings for a
// screen reader (A2) and a slide announced before it is shown (A3). Read from the code; the moves themselves are in the browser checks
// (tests/e2e/smoke.mjs: "no WebGL2", "200 % text", "slide announced").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badgeHtml, BADGE_H } from '../scripts/preview-badge.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const STAGE = stageSource(), PZ = read('src/ui/presenter.js'), MAIN = read('src/ui/main.js'), PROC = read('src/ui/hvpg-proc.js');
const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); let d = 0, k = src.indexOf('{', i); for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); } return src.slice(i); };

// ── A1: no WebGL2 ──
test('A1: the colour parser needs no canvas at all, so a device without WebGL2 (or a 2D context) still reads every colour', () => {
  assert.doesNotMatch(STAGE, /colorParser|colorCtx/, 'no 2D canvas parser (1 Nov: nothing off the GPU)');
  const to = body(STAGE, 'function toRGB(c, cs)');
  assert.match(to, /out = cssColor8\(v \|\| 'black'\)\.slice\(0, 3\);/);
});

test('A1: a colour is read the same as the canvas gave it back (8-bit steps; black for what it cannot read)', async () => {
  const { cssColor8 } = await import('../src/ui/css-color.js');
  assert.deepEqual(cssColor8('#ff8000').slice(0, 3).map((v) => Math.round(v * 255)), [255, 128, 0]);
  assert.deepEqual(cssColor8('rgba(10, 20, 30, 0.5)').slice(0, 3).map((v) => Math.round(v * 255)), [10, 20, 30]);
  assert.deepEqual(cssColor8('nonsense').slice(0, 3), [0, 0, 0]);
});

test('A1: a slide\'s glows and outlines are the figure\'s decoration: one that cannot be drawn leaves the slide, never half-changed', () => {
  const o = body(PZ, 'function paintOverlays(s, to, st, hooks = true)');
  assert.match(o, /try \{ stage\.setGlow\(tg\.glow\); stage\.pinOrgans\(tg\.organs\.map\(/);
  assert.match(o, /catch \(e\) \{ console\.warn\(`presenter: slide \$\{to \+ 1\}'s glows and outlines could not be drawn`, e\); \}/);
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
  for (const word of ['Free hepatic venous pressure (FHVP)', 'Wedged hepatic venous pressure (WHVP)', 'HVPG ${mm(v.hvpg)}: WHVP', 'minus FHVP', 'mmHg', 'HVPG is not measurable', 'sevWord(v.hvpg)']) assert.ok(say.includes(word), word);
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
