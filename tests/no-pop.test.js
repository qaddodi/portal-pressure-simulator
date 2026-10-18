// Things that used to appear, vanish or jump in one frame now fade or glide (motion and heat review, 17 Oct, Mohammad: "Fix all").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), tokens = read('styles/tokens.css'), util = read('src/ui/util.js');
const card = read('src/ui/card.js'), dock = read('src/ui/dock.js');

test('there is one exit curve, gentle at its start', () => {
  assert.match(tokens, /--ease-in: cubic-bezier\(\.4, 0, 1, 1\); --t-out: \.2s;/);
});

test('a dialog fades out as it faded in, with exit keyframes of its own', () => {
  assert.match(css, /\.modal-back\.leaving \{ display: grid; pointer-events: none; animation: fadeOut var\(--t-out\) var\(--ease-in\) forwards; \}/);
  assert.match(css, /\.modal-back\.leaving \.modal \{ animation: popOut var\(--t-out\) var\(--ease-in\) forwards; \}/);
  assert.match(css, /@keyframes fadeOut \{ to \{ opacity: 0; \} \}/);
  const close = util.slice(util.indexOf('export function closeModal'), util.indexOf('export const isModalOpen'));
  assert.match(close, /classList\.remove\('show'\); back\.classList\.add\('leaving'\);/);
  assert.match(close, /setTimeout\(\(\) => back\.classList\.remove\('leaving'\), 220\)/);
  // Opened again while it fades: it comes straight back.
  assert.match(util.slice(util.indexOf('export function openModal'), util.indexOf('export function closeModal')), /back\.classList\.remove\('leaving'\);/);
});

test('the History card plays its way out like Treat', () => {
  assert.match(css, /#treatCard\.card-leaving, #historyCard\.card-leaving, #dock\.card-leaving \{/);
});

test('the desktop vessel card fades in and out, and a new vessel fades its contents in', () => {
  assert.match(css, /animation: acIn \.24s var\(--ease\)/);
  assert.match(css, /\.action-card\.ac-leaving:not\(\.docked\) \{ pointer-events: none; animation: acOut var\(--t-out\) var\(--ease-in\) forwards; \}/);
  assert.doesNotMatch(card, /if \(isDocked\(\) && !matchMedia/);   // (an undocked card leaves too, not only the phone's sheet)
  assert.match(card, /const swap = !el\.hidden && !same;/);
  assert.match(card, /if \(swap\) for \(const c of el\.children\) c\.animate\?\.\(/);
});

test('the zoom pill glides aside with a side card', () => {
  const at = css.indexOf('.zoom-pill { position: absolute;');
  assert.match(css.slice(at, css.indexOf('}', at)), /transition: [^;]*right \.3s var\(--ease\)/);
  assert.match(css, /\.app\.figure-focus \.zoom-pill \{ transition: [^;]*right \.3s var\(--ease\)/);
});

test('a Tests pane swiped into place does not play its entrance again', () => {
  assert.match(dock, /if \(go\) s\.nb\?\.classList\.add\('landed'\);\n\s*clearSwipe\(\[s\.cur, s\.nb\]\);/);
  assert.match(css, /\.instrument-workspace \.dock-pane\.active\.landed \{ animation: none; \}/);
  assert.match(dock, /querySelectorAll\('\.dock-pane\.landed:not\(\.active\)'\)/);
});

const main = read('src/ui/main.js'), timeline = read('src/ui/timeline.js'), presenter = read('src/ui/presenter.js');

test('swapFade fades the old content out, fills, and fades the new in; a hidden or unchanged one fills at once', () => {
  const f = util.slice(util.indexOf('export function swapFade'), util.indexOf('export const popoverOpen'));
  assert.match(f, /if \(job\) \{ job\.fill = fill; return; \}/);
  assert.match(f, /if \(instant \|\| !el\.animate \|\| !el\.isConnected \|\| !el\.firstChild \|\| !el\.getClientRects\(\)\.length\) \{ fill\(\); return; \}/);
  assert.match(f, /easing: 'cubic-bezier\(\.4, 0, 1, 1\)', fill: 'forwards'/);
  assert.match(f, /a\.finished\.then\(done, done\);/);
});

test('a new lens crossfades the key and the lens name; nothing else writes the name', () => {
  assert.match(main, /const put = \(\.\.\.kids\) => swapFade\(el, \(\) => el\.replaceChildren\(\.\.\.kids\), \{ instant: same \}\);/);
  const legend = main.slice(main.indexOf('function renderLegend()'), main.indexOf('const st = () => store.get();'));
  assert.doesNotMatch(legend, /^\s+el\.replaceChildren\(/m);
  assert.match(legend, /swapFade\(lab, \(\) => \{ lab\.textContent = name; \}, \{ instant: lab\.textContent === name \}\);/);
  assert.equal(main.match(/#colorModeLabel'\)\.textContent =/g), null);
});

test('entering or leaving the lobule crossfades the bar\'s readings', () => {
  assert.match(dock, /const syncLobule = \(\) => swapFade\(strip, \(\) => \{ applyLobule\(\); resizeSoon\(\); \}, \{ instant: strip\.classList\.contains\('lob'\) === !!store\.get\(\)\.lobule \}\);/);
});

test('a label under the open menu fades rather than blinking', () => {
  assert.match(css, /#labels \.lb\.under-menu \{ opacity: 0; pointer-events: none; transition-duration: \.16s; \}/);
  assert.doesNotMatch(css, /under-menu \{ visibility: hidden/);
});

test('the play and pause icon grows in, only when it changes', () => {
  assert.match(timeline, /if \(ic !== lastIcon\) \{/);
  assert.match(timeline, /nu\.animate\?\.\(/);
});

test('ending a talk fades its cards out, then the app\'s bars in; a new talk ends the old one at once', () => {
  const stop = presenter.slice(presenter.indexOf('  function stop(restore = true) {'), presenter.indexOf('  function stopNow('));
  assert.match(stop, /if \(reduce\.matches \|\| !els\.length\) \{ stopNow\(restore\); chromeIn\(\); return; \}/);
  assert.match(stop, /el\.animate\(\[\{ opacity: 0 \}\], \{ duration: 200, easing: 'cubic-bezier\(\.4, 0, 1, 1\)', fill: 'forwards' \}\)/);
  assert.match(stop, /if \(leaving !== me\) return; stopNow\(restore\); chromeIn\(\);/);
  assert.match(presenter, /if \(deck\) stopNow\(false\);/);
  assert.match(presenter, /function stopNow\(restore = true\) \{\n\s*leaving = null;/);
  assert.match(presenter, /function go\(i\) \{\n\s*if \(!deck \|\| leaving\) return;/);
});

test('a theme chosen in the app crossfades the page; loading applies it at once', () => {
  assert.match(main, /document\.startViewTransition\(\(\) => applyTheme\(t, clear\)\);/);
  assert.match(main, /switchTheme\(v === 'system' \? null : v, v === 'system'\)/);
  assert.match(main, /applyTheme\(\['dark', 'light', 'soft'\]\.includes\(savedTheme\)/);
  assert.match(css, /::view-transition-old\(root\), ::view-transition-new\(root\) \{ animation-duration: \.45s;/);
});
