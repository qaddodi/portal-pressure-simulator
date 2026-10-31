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

// ── Third pass: lifecycle and input audits (31 Oct) ──
test('a slider or switch left focused keeps only its own keys; text fields keep all of theirs; composing text is left alone; held keys act once', () => {
  const m = read('src/ui/main.js');
  assert.match(m, /const NON_TEXT_INPUT = new Set\(\['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'file'\]\);/);
  assert.match(m, /if \(e\.isComposing \|\| e\.keyCode === 229\) return;/);
  assert.match(m, /tag === 'select' \|\| tag === 'textarea' \|\| e\.target\.isContentEditable \|\| \(tag === 'input' && !NON_TEXT_INPUT\.has\(inputType\)\)/);
  assert.match(m, /inputType === 'range' \? \/\^\(Arrow\(Left\|Right\|Up\|Down\)\|Home\|End\|Page\(Up\|Down\)\)\$\/ : \/\^\(Arrow\(Left\|Right\|Up\|Down\)\| \|Enter\)\$\//);
  assert.match(m, /if \(e\.repeat && !\(e\.ctrlKey \|\| e\.metaKey\) && letterOf\(e\) !== 'j'\) return;/);
  assert.match(m, /\(e\.altKey && e\.key !== '\[' && e\.key !== '\]'\)\) return;/);
  // The letter rule, run: Latin letters by character, other layouts by the key's place.
  const letterOf = new Function('return ' + m.slice(m.indexOf('const letterOf = ') + 'const letterOf = '.length, m.indexOf(';', m.indexOf('const letterOf = ')))) ();
  assert.equal(letterOf({ key: 'A', code: 'KeyA' }), 'a');
  assert.equal(letterOf({ key: 'ф', code: 'KeyA' }), 'a', 'a Russian layout\'s key in the A place');
  assert.equal(letterOf({ key: 'ش', code: 'KeyA' }), 'a', 'an Arabic layout\'s');
  assert.equal(letterOf({ key: '[', code: 'BracketLeft' }), '[');
  assert.equal(letterOf({ key: 'Enter', code: 'Enter' }), 'enter');
  // The same imported module as the talk's, or the two would each keep their own "keyboard or mouse" state.
  const stamp = (f) => f.match(/key-owner\.js\?v=\w+/)[0];
  assert.equal(stamp(m), stamp(read('src/ui/presenter.js')));
  for (const f of ['src/ui/palette.js', 'src/ui/menu.js']) assert.match(read(f), /if \(e\.isComposing \|\| e\.keyCode === 229\) return;/, f);
});

test('the phone menu sheet is lifted above the on-screen keyboard and put back when it goes; unset, it is as it was', () => {
  const mn = read('src/ui/menu.js');
  assert.match(mn, /const kb = Math\.round\(innerHeight - vv\.offsetTop - vv\.height\);/);
  assert.match(mn, /if \(kb > 80\) \{ const room = Math\.round\(vv\.height - 16\); el\.style\.setProperty\('--menu-kb', `\$\{kb\}px`\); el\.style\.setProperty\('--menu-h', `\$\{room\}px`\);/);
  assert.match(mn, /const room = Math\.round\(vv\.height - 16\);/, 'no floor under the room: a floor above it put a sideways phone\'s search row off the screen');
  assert.match(mn, /else \{ el\.style\.removeProperty\('--menu-kb'\); el\.style\.removeProperty\('--menu-h'\); el\.classList\.remove\('kb-tight'\); \}/);
  assert.match(mn, /vv\?\.addEventListener\('resize', fitSheet\); vv\?\.addEventListener\('scroll', fitSheet\);/);
  assert.match(mn, /vv\?\.removeEventListener\('resize', fitSheet\); vv\?\.removeEventListener\('scroll', fitSheet\);/);
  assert.match(mn, /for \(const v of \['--menu-kb', '--menu-h'\]\)/, 'a rebuilt sheet keeps them');
  const css = read('styles/app.css');
  assert.match(css, /\.umenu\.sheet \{[^}]*bottom: var\(--menu-kb, 0px\); width: auto; height: var\(--menu-h, 88dvh\);/);
});

test('a bedside time-lapse waits while the model is stopped, and a new update offers one reload', () => {
  const w = read('src/worker-core.js');
  assert.match(w, /if \(stoppedAt != null && lapse\?\.bedside\) lapse\.bedside\.t0 \+= performance\.now\(\) - stoppedAt;/);
  assert.match(w, /if \(timer\) \{ clearInterval\(timer\); if \(lapse\?\.bedside && stoppedAt == null\) stoppedAt = performance\.now\(\); \}/);
  assert.match(w, /morph = null; stoppedAt = null;/, 'a new lapse starts clean');
  const m = read('src/ui/main.js');
  assert.match(m, /if \(navigator\.serviceWorker\.controller\) \{\s*let offered = false;\s*navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(m, /if \(presenter\.active\(\)\) \{ setTimeout\(offer, 30000\); return; \}/, 'never in a talk');
});

import { createCore } from '../src/worker-core.js';
test('a bedside time-lapse does not run on while the page is hidden: it carries on from where it was', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let k = 0; k < ms; k += 33) { now += 33; t.mock.timers.tick(33); } };
  core.handle({ type: 'init', params: { respiration: false } });
  advance(1000);
  core.handle({ type: 'lapse', days: 8, speed: 8 / 6, ramp: { meal: [0, 1] }, bedside: true });   // six seconds
  advance(2000);
  const before = msgs.filter((m) => m.type === 'frame' && m.lapseDay != null).at(-1);
  assert.ok(before.lapseDay > 2 && before.lapseDay < 3.5, `a third through (${before.lapseDay} of 8 days)`);
  core.handle({ type: 'visibility', visible: false });
  now += 30000;                                    // the page is away for half a minute
  core.handle({ type: 'visibility', visible: true });
  advance(500);
  const after = msgs.filter((m) => m.type === 'frame').at(-1);
  assert.notEqual(after.lapseDay, undefined, 'the lapse is still playing, not jumped to its end');
  assert.ok(after.lapseDay > before.lapseDay && after.lapseDay < 4.5, `it went on from ${before.lapseDay.toFixed(2)} to ${after.lapseDay.toFixed(2)}, not to the end`);
});

test('a change of the device\'s light or dark setting repaints the instruments too, and the FibroScan reads Reduce Motion live', () => {
  const m = read('src/ui/main.js');
  const at = m.indexOf("matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {");
  assert.ok(at > 0);
  assert.match(m.slice(at, at + 400), /if \(f\) \{ stage\?\.update\(viewFrame\(f\)\); dock\?\.update\(f\); \}/);
  const f = read('src/ui/fibroscan.js');
  assert.match(f, /const REDUCED_MQ = typeof matchMedia === 'function' \? matchMedia\('\(prefers-reduced-motion: reduce\)'\) : \{ matches: false \};/);
  assert.ok(!/\bREDUCED\b/.test(f), 'no constant read once at load is left');
  assert.equal((f.match(/REDUCED_MQ\.matches/g) || []).length, 3);
});
