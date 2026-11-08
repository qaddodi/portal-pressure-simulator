import { stageSource } from './stage-src.js';
// Things that used to appear, vanish or jump in one frame now fade or glide (motion and heat review, 17 Oct, Mohammad: "Fix all").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';

const read = (p) => unsnap(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const css = read('styles/app.css'), tokens = read('styles/tokens.css'), util = read('src/ui/util.js');
const card = read('src/ui/card.js'), dock = read('src/ui/dock.js'), stageSrc = stageSource();

test('there is one exit curve, gentle at its start', () => {
  assert.match(tokens, /--ease-in: cubic-bezier\(\.4, 0, 1, 1\);/);
});

test('the History card plays its way out like Treat', () => {
  assert.match(css, /#treatCard\.card-leaving, #historyCard\.card-leaving, #dock\.card-leaving \{/);
});

test('the zoom pill glides aside with a side card, by a transform (round 2 review, RF2)', () => {
  const at = css.indexOf('.zoom-pill { position: absolute;'), rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /transform: translateX\(calc\(-1 \* var\(--right-occ, 0px\)\)\)/);
  assert.match(rule, /transition: [^;]*transform var\(--d-small\) var\(--ease\)/);
  assert.doesNotMatch(rule, /right \.3s|var\(--right-occ, 0px\)\); bottom/);
  assert.match(css, /\.app\.figure-focus \.zoom-pill \{ transition: [^;]*transform var\(--d-small\) var\(--ease\)/);
  // (The phone's pill never stood aside for a card.)
  assert.match(css, /\.zoom-pill \{ flex-direction: row; right: calc\(env\(safe-area-inset-right\) \+ 8px\); transform: none; \}/);
  // Fits read where the pill is going, not where it is mid-glide.
  assert.match(stageSrc, /zoom: pillRead\(document\.getElementById\('zoomPill'\), true\)/);
  assert.match(stageSrc, /const box = settle \? settledBox\(el\) : el\.getBoundingClientRect\(\);/, 'where it will rest, in the cards\' snapshot');
  assert.match(stageSrc, /const p = zp\.box, wr = stageBox\(\);/);
});

test('a Tests pane swiped into place does not play its entrance again', () => {
  assert.match(dock, /if \(go\) s\.nb\?\.classList\.add\('landed'\);\n\s*clearSwipe\(s\.cur, s\.nb\);/);
  assert.match(css, /\.instrument-workspace \.dock-pane\.active\.landed \{ animation: none; \}/);
  assert.match(dock, /querySelectorAll\('\.dock-pane\.landed:not\(\.active\)'\)/);
});

const main = read('src/ui/main.js'), timeline = read('src/ui/timeline.js'), presenter = read('src/ui/presenter.js');

test('swapFade fades the old content out, fills, and fades the new in; a hidden or unchanged one fills at once', () => {
  const f = util.slice(util.indexOf('export function swapFade'), util.indexOf('export const popoverOpen'));
  assert.match(f, /if \(job\) \{ job\.fill = fill; return; \}/);
  assert.match(f, /if \(instant \|\| !el\.animate \|\| !el\.isConnected \|\| !el\.firstChild \|\| !hasBox\(el\)\) \{ fill\(\); return; \}/);
  // A hidden one (out of the page, or under a hidden piece) fills at once, told with no layout read (1 Nov: none inside a frame).
  assert.match(util, /export const hasBox = \(el\) => el\.isConnected && !el\.closest\?\.\('\[hidden\]'\) && isDrawn\(el\);/);
  assert.match(f, /easing: EASE_IN, fill: 'forwards'/);
  assert.match(f, /a\.finished\.then\(done, done\);/);
});

test('a new lens crossfades the key and the lens name; nothing else writes the name', () => {
  assert.match(main, /morphKey\(el, legendKids, same \? INSTANT : NOT_INSTANT\);/);
  const legend = main.slice(main.indexOf('function renderLegend()'), main.indexOf('const st = () => store.get();'));
  assert.doesNotMatch(legend, /^\s+el\.replaceChildren\(/m);
  assert.match(legend, /crossfadeText\(lab, name, lab\.textContent === name \? INSTANT : NOT_INSTANT\);/);
  assert.equal(main.match(/#colorModeLabel'\)\.textContent =/g), null);
});

test('entering or leaving the lobule crossfades the bar\'s readings', () => {
  assert.match(dock, /const same = classHas\(strip, 'lob'\) === !!store\.get\(\)\.lobule/);
  assert.match(dock, /const lobuleSwap = \(\) => \{ applyLobule\(\); resizeSoon\(\); \};[\s\S]*?LOBULE_SWAP\.instant = same;\s+swapFade\(strip, lobuleSwap, LOBULE_SWAP\);/);
  // RF4: the play, clock and Compare glide to where each resize puts them, every step of it.
  assert.match(dock, /if \(!same && tl\) \{ GLIDE_ALSO\.also\[1\] = document\.getElementById\('vdock'\); glideOnResize\(tl, ':scope > \*', GLIDE_ALSO\); \}/);
});

test('a label under the open menu fades rather than blinking', () => {
  assert.doesNotMatch(css, /under-menu \{ visibility: hidden/);
});

test('the play and pause icon grows in, only when it changes', () => {
  assert.match(timeline, /if \(ic !== lastIcon\) \{/);
  assert.match(timeline, /nu\.animate\(still \? \[\{ opacity: 0 \}, \{ opacity: 1 \}\] : \[\{ opacity: 0, transform: 'scale\(\.6\)' \}/);
  // RF7: the old icon fades out in the same grid cell, so the button is never empty for a frame.
  assert.match(timeline, /playBtn\.append\(nu\);/);
  assert.match(css, /\.ib\.play > :is\(svg, \.ic\) \{ grid-area: 1 \/ 1; \}/);
});

test('ending a talk fades its cards out, then the app\'s bars in; a new talk ends the old one at once', () => {
  const stop = presenter.slice(presenter.indexOf('  function stop(restore = true) {'), presenter.indexOf('  function stopNow('));
  assert.match(stop, /if \(!els\.length\) \{ stopNow\(restore\); chromeIn\(\); return; \}/);
  // (Reduce Motion keeps these fades: they move nothing.)
  const chromeIn = presenter.slice(presenter.indexOf('  function chromeIn() {'), presenter.indexOf('  function stopNow('));
  assert.doesNotMatch(stop + chromeIn, /reduce\.matches/);
  assert.match(stop, /glideOpacity\(el, 1, 0, D_SMALL, easeIn\)/, 'the fade is written by the frames (script-glide.js), in the frame the glass reads it in');
  assert.match(stop, /if \(leaving !== me\) return; stopNow\(restore\); chromeIn\(\);/);
  assert.match(presenter, /if \(deck\) stopNow\(false\);/);
  assert.match(presenter, /function stopNow\(restore = true\) \{\n\s*leaving = null;/);
  assert.match(presenter, /function go\(i\) \{\n\s*if \(!deck \|\| leaving\) return;/);
});

test('a talk started while one is ending, or while the app returns to healthy, takes over cleanly', () => {
  const start = presenter.slice(presenter.indexOf('  async function start('), presenter.indexOf('const up = Promise.all([coverUp()'));
  // Before its first await: the old talk's fade can no longer run its restore under the new talk.
  assert.match(start, /leaving = null; healthyGen\+\+;/);
  assert.doesNotMatch(start, /await/);
  const put = presenter.slice(presenter.indexOf('  async function putHealthy(b) {'), presenter.indexOf('// ── Library'));
  // Each step's wait is followed by the check (dim, sinusoid, lobule, view, preset), and a stopped return lets the figure ease
  // back to full (its transition kept).
  assert.equal((put.match(/if \(gone\(\)\) return;/g) || []).length, 5);
  assert.match(put, /await loadPreset\?\.\('healthy'\);\n\s*if \(gone\(\)\) return;/);
  assert.match(put, /gone = \(\) => me !== healthyGen && \(view\.style\.opacity = '', true\)/);
  assert.match(put, /if \(me === healthyGen\) view\.style\.transition = '';/);
});

test('a theme chosen in the app crossfades the page; loading applies it at once', () => {
  assert.match(main, /crossfade\(async \(\) => \{\n\s+const pumpOff = pumpLease\.take\(\);[^\n]*\n\s+try \{\n\s+applyTheme\(t, clear\);[\s\S]*?await themeSettled\(\); await stage\?\.lookWhole\?\.\(700\); await settledSurfaces\(\);[\s\S]*?\} finally \{ pumpOff\(\); \}/);   // (the frames pumped, the figure and the surfaces whole before the new page is taken)
  assert.match(main, /const vt = pageFade = document\.startViewTransition\(fn\);/);
  assert.match(main, /switchTheme\(v === 'system' \? null : v, v === 'system'\)/);
  assert.match(main, /applyTheme\(knownLook\(savedTheme\)\)/);
  assert.match(css, /::view-transition-old\(root\), ::view-transition-new\(root\) \{ animation-duration: var\(--d-surface\);/);
});

test('a tap during the page crossfade ends it and reaches what is under it, never closing Settings', () => {
  // Added at startup (top level of main.js), so it runs before any popover's outside-tap listener at window capture.
  assert.match(main, /^addEventListener\('pointerdown', \(e\) => \{\n {2}const vt = pageFade;/m);
  const h = main.slice(main.indexOf("addEventListener('pointerdown', (e) => {\n  const vt = pageFade;"));
  assert.match(h, /e\.stopImmediatePropagation\(\); e\.preventDefault\(\);/);
  assert.match(h, /vt\.skipTransition\(\);\n {2}vt\.finished\.catch\(\(\) => \{\}\)\.finally\(\(\) => document\.elementFromPoint\(x, y\)\?\.dispatchEvent\(new MouseEvent\('click'/);
  assert.equal((main.match(/document\.startViewTransition\(/g) || []).length, 1, 'theme and projector both go through crossfade()');
});
