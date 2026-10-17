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
