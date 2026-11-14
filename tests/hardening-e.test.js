import { stageSource } from './stage-src.js';
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
  assert.match(p, /attrSoon\(input, 'aria-activedescendant', items\.length \? optId\(sel\) : null\)/);
  assert.match(p, /items\.length \? optId\(sel\) : null/, 'no stale option named when nothing matches');
  assert.match(p, /const optId = \(i\) => OPT_IDS\[i\] \|\|= `pal-opt-\$\{i\}`;/);
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
  const s = stageSource();
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
  assert.match(fn, /deck = null; keep = null; routeId = ''; shown = null; entering = null; want = 0; gen\+\+;/);
});

test('the figure is measured again when the window moves to a screen of another density', () => {
  const s = stageSource();
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

// ── Third pass: lifecycle and input audits (31 Oct) ──
test('a slider or switch left focused keeps only its own keys; text fields keep all of theirs; composing text is left alone; held keys act once', () => {
  const m = read('src/ui/main.js');
  assert.match(m, /const NON_TEXT_INPUT = new Set\(\['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'file'\]\);/);
  assert.match(m, /if \(e\.isComposing \|\| e\.keyCode === 229\) return;/);
  assert.match(m, /tag === 'select' \|\| tag === 'textarea' \|\| e\.target\.isContentEditable \|\| \(tag === 'input' && !NON_TEXT_INPUT\.has\(inputType\)\)/);
  assert.match(m, /inputType === 'range' \? \/\^\(Arrow\(Left\|Right\|Up\|Down\)\|Home\|End\|Page\(Up\|Down\)\)\$\/ : \/\^\(Arrow\(Left\|Right\|Up\|Down\)\| \|Enter\)\$\//);
  assert.match(m, /if \(e\.repeat && !\(e\.ctrlKey \|\| e\.metaKey\) && letterOf\(e\) !== 'j'\) \{ if \(spaceIsOurs\) e\.preventDefault\(\); return; \}/);
  assert.match(m, /\(e\.altKey && e\.key !== '\[' && e\.key !== '\]'\)\) return;/);
  // The letter rule, run: Latin letters by character, other layouts by the key's place.
  const letterOf = new Function('return ' + m.slice(m.indexOf('const letterOf = ') + 'const letterOf = '.length, m.indexOf(';', m.indexOf('const letterOf = ')))) ();
  assert.equal(letterOf({ key: 'A', code: 'KeyA' }), 'a');
  assert.equal(letterOf({ key: 'ф', code: 'KeyA' }), 'a', 'a Russian layout\'s key in the A place');
  assert.equal(letterOf({ key: 'ش', code: 'KeyA' }), 'a', 'an Arabic layout\'s');
  assert.equal(letterOf({ key: '[', code: 'BracketLeft' }), '[');
  assert.equal(letterOf({ key: 'Enter', code: 'Enter' }), 'enter');
  // The same imported module as the talk's, or the two would each keep their own "keyboard or mouse" state.
  assert.match(m, /from '\.\/key-owner\.js'/);
  assert.match(read('src/ui/presenter.js'), /from '\.\/key-owner\.js'/);
  for (const f of ['src/ui/palette.js', 'src/ui/menu.js']) assert.match(read(f), /if \(e\.isComposing \|\| e\.keyCode === 229\) return;/, f);
});

test('the phone menu sheet is lifted above the on-screen keyboard and put back when it goes; unset, it is as it was', () => {
  const mn = read('src/ui/menu.js');
  assert.match(mn, /const \{ offsetTop: vvTop, height: vvH \} = vv, kb = Math\.round\(innerHeight - vvTop - vvH\);/);
  assert.match(mn, /if \(kb > 80\) \{\s*const room = Math\.round\(vvH - 16\);\s*if \(kb !== kbNum\) \{ kbNum = kb; kbText = `\$\{kb\}px`; \}/);
  assert.match(mn, /if \(room !== roomNum\) \{ roomNum = room; roomText = `\$\{room\}px`; \}/);
  assert.match(mn, /el\.style\.setProperty\('--menu-kb', kbText\); el\.style\.setProperty\('--menu-h', roomText\);/);
  assert.match(mn, /const room = Math\.round\(vvH - 16\);/, 'no floor under the room: a floor above it put a sideways phone\'s search row off the screen');
  assert.match(mn, /else \{ el\.style\.removeProperty\('--menu-kb'\); el\.style\.removeProperty\('--menu-h'\); classSoon\(el, 'kb-tight', false\); \}/);
  assert.match(mn, /vv\?\.addEventListener\('resize', fitSheet\); vv\?\.addEventListener\('scroll', fitSheet\);/);
  assert.match(mn, /vv\?\.removeEventListener\('resize', fitSheet\); vv\?\.removeEventListener\('scroll', fitSheet\);/);
  assert.match(mn, /for \(const v of \['--menu-kb', '--menu-h'\]\)/, 'a rebuilt sheet keeps them');
  const css = read('styles/app.css');
  assert.match(css, /\.umenu\.sheet \{[^}]*bottom: var\(--menu-kb, 0px\); width: auto; height: var\(--menu-h, 88dvh\);/);
});

test('a bedside time-lapse waits while the model is stopped, and a new update offers one reload', () => {
  const w = read('src/worker-core.js');
  assert.match(w, /if \(stoppedAt != null\) \{ const d = performance\.now\(\) - stoppedAt; if \(lapse\?\.bedside\) lapse\.bedside\.t0 \+= d; if \(morph\) morph\.t0 \+= d; \}/);
  assert.match(w, /if \(timer\) \{ clearInterval\(timer\); if \(\(lapse\?\.bedside \|\| morph\) && stoppedAt == null\) stoppedAt = performance\.now\(\); \}/);
  assert.match(w, /morph = null; stoppedAt = null;/, 'a new lapse starts clean');
  const m = read('src/ui/main.js');
  assert.match(m, /if \(navigator\.serviceWorker\.controller\) \{\s*let offered = false;/);
  assert.match(m, /navigator\.serviceWorker\.addEventListener\('controllerchange', async \(\) => \{/);
  assert.match(m, /if \(presenter\.active\(\)\) \{ setTimeout\(offer, 30000\); return; \}/, 'never in a talk');
});

test('a page opened after a deploy is not offered a reload: the new worker is asked which files it holds', () => {
  const m = read('src/ui/main.js');
  const at = m.indexOf("const holdsMine = (sw) =>");
  assert.ok(at > 0);
  const fn = m.slice(at, m.indexOf("navigator.serviceWorker.addEventListener('controllerchange'", at));
  assert.match(fn, /script\[type="module"\]\[src\], link\[rel="stylesheet"\]\[href\]/, 'the hashed files this page began with');
  assert.match(fn, /sw\.postMessage\('pps:files', \[ch\.port2\]\)/);
  assert.match(fn, /mine\.length > 0 && mine\.every\(\(u\) => e\.data\.includes\(u\)\)/, 'every one of them is in the new worker\'s list');
  assert.match(fn, /setTimeout\(\(\) => res\(false\), 2000\)/, 'a worker that does not answer means the offer stands');
  const h = m.slice(m.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"), m.indexOf('const reg = () =>'));
  assert.match(h, /if \(sw && await holdsMine\(sw\)\) return;\s*if \(offered\) return;\s*offered = true;/, 'offered is set only when it is offered');
  const b = read('scripts/build.mjs');
  assert.match(b, /if \(e\.data === 'pps:files' && e\.ports\[0\]\) e\.ports\[0\]\.postMessage\(FILES\);/);
  // The two sides together, run: the page's test against a list like the worker's.
  const holds = (mine, files) => mine.length > 0 && mine.every((u) => files.includes(u));
  assert.ok(holds(['assets/app-A.js', 'assets/app-B.css'], ['./', 'assets/app-A.js', 'assets/app-B.css', 'assets/chunk-C.js']), 'same build');
  assert.ok(!holds(['assets/app-A.js', 'assets/app-B.css'], ['./', 'assets/app-Z.js', 'assets/app-B.css']), 'an older page');
  assert.ok(!holds([], ['./']), 'a source page with no hashed files is not taken for current');
});

test('a held Space stays the figure\'s and does not scroll the page; AltGr brackets reach the speed keys; a Dvorak ; is not Z', () => {
  const m = read('src/ui/main.js');
  assert.match(m, /const spaceIsOurs = e\.key === ' ' && !e\.altKey && !controlOwnsKey\(e\.target, ' '\) && !e\.target\.closest\?\.\('\.lb'\) && !\(e\.target\.id === 'stage' && stage\?\.keyItem\?\.\(\)\);/);
  assert.match(m, /if \(e\.repeat && !\(e\.ctrlKey \|\| e\.metaKey\) && letterOf\(e\) !== 'j'\) \{ if \(spaceIsOurs\) e\.preventDefault\(\); return; \}/);
  assert.match(m, /if \(spaceIsOurs\) \{ e\.preventDefault\(\); host\.send\(\{ type: 'run', running: !store\.get\(\)\.running \}\); return; \}/);
  assert.match(m, /const altGr = !!e\.getModifierState\?\.\('AltGraph'\);\s*if \(altGr \? e\.key !== '\[' && e\.key !== '\]' : e\.ctrlKey \|\| e\.metaKey \|\| \(e\.altKey && e\.key !== '\[' && e\.key !== '\]'\)\) return;/);
  const letterOf = new Function('return ' + m.slice(m.indexOf('const letterOf = ') + 'const letterOf = '.length, m.indexOf(';\n', m.indexOf('const letterOf = ')))) ();
  assert.equal(letterOf({ key: ';', code: 'KeyZ' }), ';', 'Dvorak: the key in Z\'s place makes ;');
  assert.equal(letterOf({ key: 'Dead', code: 'KeyA' }), 'dead');
  assert.equal(letterOf({ key: 'ф', code: 'KeyA' }), 'a', 'a Russian layout still reaches A');
  assert.equal(letterOf({ key: 'z', code: 'KeyZ' }), 'z');
  // The AltGr gate, run on its own: [ and ] pass with Ctrl+Alt reported, a Polish ą (AltGr+A) does not.
  const gate = (e) => { const altGr = !!e.getModifierState?.('AltGraph'); return !(altGr ? e.key !== '[' && e.key !== ']' : e.ctrlKey || e.metaKey || (e.altKey && e.key !== '[' && e.key !== ']')); };
  const gr = { getModifierState: (k) => k === 'AltGraph' };
  assert.ok(gate({ ...gr, ctrlKey: true, altKey: true, key: '[' }), 'German Windows: AltGr+8');
  assert.ok(gate({ ...gr, ctrlKey: true, altKey: true, key: ']' }));
  assert.ok(!gate({ ...gr, ctrlKey: true, altKey: true, key: 'ą' }));
  assert.ok(!gate({ ctrlKey: true, key: 'a' }), 'Ctrl+A is the browser\'s');
  assert.ok(gate({ altKey: true, key: '[' }), 'Option+[ on a Mac');
  assert.ok(!gate({ altKey: true, key: 'a' }));
});

test('the menu sheet has no height floor over the keyboard and the tablet\'s 62 % follows it', () => {
  const m = read('src/ui/menu.js');
  assert.match(m, /const room = Math\.round\(vvH - 16\);[\s\S]*?el\.style\.setProperty\('--menu-kb', kbText\); el\.style\.setProperty\('--menu-h', roomText\);/, 'the sheet is held to the room above the keyboard');
  assert.ok(!/Math\.max\(240, Math\.round\(vv/.test(m), 'a 240 px floor pushed the top off a phone held sideways');
  const css = read('styles/app.css');
  assert.match(css, /html\.thumb-ui \.umenu\.sheet \{ left: 15% !important; right: 15%; height: min\(62dvh, var\(--menu-h, 62dvh\)\); \}/);
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

test('a bedside time-lapse begun while the page is hidden starts from its start when the page returns', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let k = 0; k < ms; k += 33) { now += 33; t.mock.timers.tick(33); } };
  core.handle({ type: 'init', params: { respiration: false } });
  advance(500);
  core.handle({ type: 'visibility', visible: false });
  core.handle({ type: 'lapse', days: 8, speed: 8 / 6, ramp: { meal: [0, 1] }, bedside: true });   // six seconds, asked of a model that is not running
  now += 30000;
  core.handle({ type: 'visibility', visible: true });
  advance(500);
  const after = msgs.filter((m) => m.type === 'frame').at(-1);
  assert.notEqual(after.lapseDay, undefined, 'not jumped to its end while nobody watched');
  assert.ok(after.lapseDay >= 0 && after.lapseDay < 2, `half a second into six seconds (${after.lapseDay} of 8 days)`);
});

test('Next during a bedside time-lapse while the page is hidden carries on forward from where it stopped, never backwards', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let k = 0; k < ms; k += 33) { now += 33; t.mock.timers.tick(33); } };
  core.handle({ type: 'init', params: { respiration: false } });
  advance(1000);
  core.handle({ type: 'lapse', days: 8, speed: 8 / 6, ramp: { meal: [0, 1] }, bedside: true });
  advance(2000);
  const before = msgs.filter((m) => m.type === 'frame' && m.lapseDay != null).at(-1);
  core.handle({ type: 'visibility', visible: false });
  now += 30000;
  core.handle({ type: 'lapseFast', ms: 1000 });
  core.handle({ type: 'visibility', visible: true });
  advance(100);
  const a = msgs.filter((m) => m.type === 'frame').at(-1);
  assert.notEqual(a.lapseDay, undefined, 'still playing');
  assert.ok(a.lapseDay >= before.lapseDay - 1e-6, `it did not run backwards (${before.lapseDay.toFixed(2)} then ${a.lapseDay.toFixed(2)})`);
  assert.ok(a.lapseDay < 8, 'and has not been thrown to the end');
  advance(2000);
  const done = msgs.filter((m) => m.type === 'frame').at(-1);
  assert.equal(done.lapseDay, undefined, 'the rest ran in the second Next asked for');
});

test('a change of the device\'s light or dark setting repaints the instruments too, and the FibroScan reads Reduce Motion live', () => {
  const m = read('src/ui/main.js');
  const at = m.indexOf("darkMQ.addEventListener('change', () => {");
  assert.ok(at > 0);
  assert.match(m.slice(at, at + 400), /if \(f\) \{ stage\?\.update\(viewFrame\(f\)\); dock\?\.update\(f\); \}/);
  const f = read('src/ui/fibroscan.js');
  assert.match(f, /const REDUCED_MQ = typeof matchMedia === 'function' \? matchMedia\('\(prefers-reduced-motion: reduce\)'\) : \{ matches: false \};/);
  assert.ok(!/\bREDUCED\b/.test(f), 'no constant read once at load is left');
  assert.equal((f.match(/REDUCED_MQ\.matches/g) || []).length, 3);
});

test('a question over the menu: its letters stay in the dialog, Tab stays in it, Esc cancels its one-line field, Cancel adds nothing', () => {
  const mn = read('src/ui/menu.js');
  assert.match(mn, /e\.target\.closest\?\.\('input, textarea, select, \[contenteditable\], #modalBack'\)\) return;/, 'typing in the dialog does not move focus to the menu\'s search');
  const u = read('src/ui/util.js');
  assert.match(u, /const behindDialog = \(on\) => \{ for \(const m of document\.querySelectorAll\('\.umenu, \.um-pv'\)\) m\.inert = on; \};/);
  assert.match(u, /appEl\.inert = true;\n {2}behindDialog\(true\);/);
  assert.match(u, /appEl\.inert = false;\n {2}behindDialog\(false\);\n {2}const back0/, 'undone before focus goes back');
  const m = read('src/ui/main.js');
  assert.match(m, /if \(tag === 'input' && isModalOpen\(\) && e\.target\.closest\?\.\('#modalBack'\)\) \{ e\.preventDefault\(\); closeModal\(\); \} else e\.target\.blur\(\);/);
  const p = read('src/ui/presenter.js');
  assert.match(p, /const named = await askText\(\{ title: 'Add this state as a slide'[^\n]*\n\s*if \(!named\) return;/);
  assert.ok(!/\)\) \|\| step\.title;/.test(p), 'a cancelled name no longer falls back to the default title and adds the slide');
});

test('a tooltip is measured by its layout size and shown only once its side is set, so it eases in from its own button', () => {
  const u = read('src/ui/util.js');
  const at = u.indexOf('export function tooltipFor');
  const body = u.slice(at, at + 4600);
  assert.match(body, /const L = layoutTip\(words, key, innerWidth\);\n\s*const tr = \{ width: L\.w, height: L\.h \};/, 'sized by its layout in script (tip-gl.js), which the hidden state\'s scale does not touch, never measured');
  assert.doesNotMatch(body, /offsetWidth|offsetHeight/, 'no page measure');
  assert.ok(body.indexOf('tip.dataset.side = at') < body.indexOf("tip.classList.add('show')"), 'side first, then .show starts the transition');
  assert.equal((body.match(/classList\.add\('show'\)/g) || []).length, 1);
});

test('the organs with a look of their own keep it over the general organ lines: the right atrium faint, the kidney heavier', () => {
  const css = read('styles/app.css');
  const general = css.indexOf('.organ .org-line { stroke-opacity: .62; stroke-width: 1.1; }');
  assert.ok(general > 0);
  for (const rule of [
    '.organ-heart-ra .org-line { stroke-opacity: .35; }',
    '.organ-heart-ra .org-rimlight { stroke-opacity: .2; }',
    '.organ-heart-ra .org-shade.s1, .organ-heart-ra .org-shade.s2, .organ-heart-ra .org-shade.s3 { stroke-opacity: .05; }',
    '.organ-kidney-l .org-line { stroke-width: 1.4; stroke-opacity: .95; }',
  ]) assert.ok(css.lastIndexOf(rule) > general, `${rule} comes after the general rule it overrides`);
});

test('the overlays are drawn again when the spleen\'s size moves (infarcted patches) or a lesioned collateral coils (its marks)', () => {
  const s = stageSource();
  const at = s.indexOf('function okLesion');   // (the inputs are written onto a kept list and compared: okLesion, then overlayInputs)
  const key = s.slice(at, at + 4800);
  assert.match(key, /p\.splenicRx === 1 \? hold\('sp', f\.slow\.spleen \/ 11, 0\.02\) : 0/, 'the patches ride the organ\'s size');
  assert.match(key, /geo\[id\]\?\.wig \? hold\(kg, geo\[id\]\.wig, 0\.5\) : 0/, 'a mark follows the path its collateral has now');
  assert.ok(!/geometryVersion/.test(key), 'not on every geometry change: that rebuilt the marks several times a second (d3828608)');
});
