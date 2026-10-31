// Production pass, batch E (31 Oct): the search card is a real combobox that keeps Tab inside it, a shared link the app cannot read says so,
// overlapping dives into and out of the sinusoid do not finish over each other, a stopped talk cuts its in-flight slide move.
// Wiring is read from source, as the repo's other review tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseShare, cleanShare } from '../src/ui/share-link.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the search field is a combobox over a listbox, naming the current option, and Tab stays inside the card', () => {
  const p = read('src/ui/palette.js');
  assert.match(p, /role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'pal-list', 'aria-expanded': 'true'/);
  assert.match(p, /id: 'pal-list', role: 'listbox'/);
  assert.match(p, /role: 'dialog', 'aria-modal': 'true'/);
  assert.match(p, /id: `pal-opt-\$\{i\}`, tabindex: '-1', role: 'option'/, 'options are reached through the field, not by Tab');
  assert.match(p, /input\.setAttribute\('aria-activedescendant', `pal-opt-\$\{sel\}`\)/);
  assert.match(p, /else input\.removeAttribute\('aria-activedescendant'\)/, 'no stale option named when nothing matches');
  assert.match(p, /else if \(e\.key === 'Tab'\) e\.preventDefault\(\)/);
});

test('a #s= link the app cannot read opens the healthy patient and says so; a readable one does not', () => {
  assert.equal(parseShare('!!!not base64!!!'), null);
  assert.equal(parseShare(btoa('plain text')), null);
  assert.equal(cleanShare(null), null);
  const m = read('src/ui/main.js');
  const at = m.indexOf('if (shared) await loadShared(shared, { quiet: back });');
  assert.ok(at > 0);
  const blk = m.slice(at, at + 700);
  assert.match(blk, /else \{\s*timeline\.reset\(\);/);
  assert.match(blk, /if \(\/#s=\/\.test\(location\.hash\) && !back\) toast\('This shared link could not be read/);
});

test('a dive into or out of the sinusoid stops when a newer one has begun', () => {
  const s = read('src/ui/stage.js');
  assert.match(s, /let sinMoveGen = 0;/);
  const dive = s.slice(s.indexOf('async diveToSinusoid()'), s.indexOf('async exitSinusoid()'));
  assert.match(dive, /const me = \+\+sinMoveGen;/);
  assert.match(dive, /if \(!lobuleOn \|\| me !== sinMoveGen\) return;/);
  const exit = s.slice(s.indexOf('async exitSinusoid()'), s.indexOf('sinusoidOpen: () =>'));
  assert.match(exit, /const me = \+\+sinMoveGen;/);
  assert.equal((exit.match(/if \(me !== sinMoveGen \|\| store\.get\(\)\.sinusoid\) return;/g) || []).length, 2, 'checked after each wait');
  assert.ok(exit.indexOf('store.set({ lobule: false })') > exit.lastIndexOf('me !== sinMoveGen'), 'the lobule is left only after the last check');
});

test('stopping a talk moves the slide generation on, so a move still in flight is cut', () => {
  const p = read('src/ui/presenter.js');
  const fn = p.slice(p.indexOf('function stopNow(restore = true)'), p.indexOf('function stopNow(restore = true)') + 900);
  assert.match(fn, /deck = null; shown = null; entering = null; want = 0; gen\+\+;/);
});

test('the figure is measured again when the window moves to a screen of another density', () => {
  const s = read('src/ui/stage.js');
  assert.match(s, /const watchDensity = \(\) => matchMedia\(`\(resolution: \$\{devicePixelRatio\}dppx\)`\)\.addEventListener\?\.\('change', \(\) => \{ resizeCanvas\(\); watchDensity\(\); \}, \{ once: true \}\);/);
  assert.ok(s.indexOf('watchDensity();') > s.indexOf('resizeCanvas(); resizeReady = true;'), 'after the first measure');
});

// ── Second review pass (31 Oct) ──
import { controlOwnsKey, setKeyboardNav, KEY_OWNERS } from '../src/ui/key-owner.js';

test('after a click the talk keeps Space even if the browser now reports the control as :focus-visible; a Tab gives it back', () => {
  const btn = { matches: (q) => q === ':focus-visible' || q === KEY_OWNERS };
  setKeyboardNav(true);
  assert.equal(controlOwnsKey(btn, ' '), true);
  setKeyboardNav(false);   // (what a pointerdown does)
  assert.equal(controlOwnsKey(btn, ' '), false, 'clicked: Space is the clicker\'s next slide');
  assert.equal(controlOwnsKey(btn, 'Enter'), false);
  setKeyboardNav(true);    // (what a Tab does)
  assert.equal(controlOwnsKey(btn, 'Enter'), true);
  const k = read('src/ui/key-owner.js');
  assert.match(k, /addEventListener\('pointerdown', \(\) => \{ keyboardNav = false; \}, true\)/);
  assert.match(k, /if \(e\.key === 'Tab'\) keyboardNav = true;/);
});

test('review fixes: a child\'s lost capture does not end a sheet drag or a dye press; hidden hit paths get no tab stop; focus returns to SVG and fixed elements; the Why card keeps focus when its answer lands and leaves Search\'s Esc to Search', () => {
  const card = read('src/ui/card.js');
  assert.match(card, /b\.addEventListener\('lostpointercapture', \(e\) => \{ if \(e\.target === b\) up\(\); \}\)/);
  const util = read('src/ui/util.js');
  const close = util.slice(util.indexOf('export function closeModal()'), util.indexOf('export const isModalOpen'));
  assert.ok(!/back0\?\.offsetParent/.test(close), 'offsetParent is absent on SVG elements and null on fixed ones');
  assert.match(close, /back0\.checkVisibility \? back0\.checkVisibility\(\{ checkVisibilityCSS: true \}\) : back0\.getClientRects\(\)\.length > 0/);
  const why = read('src/ui/why.js');
  assert.match(why, /function swap\(\.\.\.kids\) \{\s*const had = pop\.contains\(document\.activeElement\);\s*pop\.replaceChildren\(\.\.\.kids\);\s*if \(had\) pop\.querySelector\('button'\)\?\.focus\(\{ preventScroll: true \}\);/);
  const open = why.slice(why.indexOf('async function open('), why.indexOf('// It fades out as it came in'));
  assert.equal((open.match(/replaceChildren/g) || []).length, 1, 'only the waiting state is set directly; the answer and the error go through swap');
  assert.match(why, /e\.key === 'Escape' && pop\.classList\.contains\('show'\) && !e\.target\.closest\?\.\('\.pal-back'\)/);
});
