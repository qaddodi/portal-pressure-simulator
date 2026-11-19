// What covers the figure is one list and one set of rules (bible review 19 Nov 2026, STG-2): the stage's labels, the lobule's, the
// sinusoid's and the probe's read src/ui/blockers.js, so a label never tucks under the teaching card's glass in the lobule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import './dom-shim.js';
import { restRect, BLOCKER_SEL } from '../src/ui/blockers.js';

const SRC = new URL('../src/ui/', import.meta.url).pathname;
const src = (f) => readFileSync(SRC + f, 'utf8');

test('only blockers.js holds the list of what covers the figure', () => {
  for (const f of readdirSync(SRC).filter((n) => n.endsWith('.js') && n !== 'blockers.js')) {
    const t = src(f);
    assert.ok(!/querySelectorAll\(\s*['"`]\.stage-blocker:not\(\[hidden\]\)['"`]\s*\)/.test(t), `${f} keeps its own copy of the blocker list: import blockers.js`);
    assert.ok(!/BLOCKER_SEL\s*=/.test(t), `${f} defines its own BLOCKER_SEL`);
  }
});

test('the list names the cards, the teaching glass, the view switcher and the clock', () => {
  for (const part of ['.stage-blocker:not([hidden])', '.pz-shade', '#nbViews', '.stage-clock']) assert.ok(BLOCKER_SEL.includes(part), part);
});

test('the stage, the lobule, the sinusoid and the probe read it', () => {
  for (const f of ['stage-label-items.js', 'lobule-zoom.js', 'sinusoid-view.js', 'stage-doppler.js']) assert.match(src(f), /from '\.\/blockers\.js'/, f);
});

test('the catheter room counts a card at its rest box, not mid-entry', () => {
  assert.match(src('stage-fit.js'), /function cardSpaceFrom[\s\S]{0,400}rest: q/);
});

test('a card with data-safe-rest counts where it rests; one without counts where it is', () => {
  const q = { left: 10, top: 300, right: 110, bottom: 400, width: 100, height: 100 };
  const plain = { dataset: {} };
  assert.equal(restRect(plain, q), q);
  // (a card that eases in by its own translate: data-restTranslate names the end; no transform here, so the box stands.)
  const card = { dataset: { safeRest: '', restTranslate: '0 0' }, offsetHeight: 100 };
  globalThis.getComputedStyle = () => ({ transform: 'none', translate: 'none' });
  assert.equal(restRect(card, q).top, 300);
  delete globalThis.getComputedStyle;
});
