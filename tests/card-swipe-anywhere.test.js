// A swipe up or down anywhere on an upright slide works the data card as its handle does (Mohammad, 21 Oct: "Swiping down or up
// anywhere on the slide should trigger as if I'm holding the handle"), while a drag that starts on a control stays the control's.
// presenter.js needs a DOM to import, so its wiring is read as text; the rules themselves are pure (src/ui/swipe.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardSwipe, ownsTouch, swipeDir, CARD_SWIPE_MIN } from '../src/ui/swipe.js';

const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

// A tiny element: tag, classes and attributes, matched against the simple selectors swipe.js uses.
function el(tag, { cls = [], attrs = {} } = {}, parent = null) {
  const one = (sel) => {
    const m = sel.trim().match(/^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/);
    if (!m) return false;
    if (m[1] && m[1] !== tag) return false;
    for (const c of m[2].split('.').filter(Boolean)) if (!cls.includes(c)) return false;
    for (const a of m[3].match(/\[[^\]]+\]/g) || []) {
      const [, k, v] = a.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (!(k in attrs) || (v !== undefined && attrs[k] !== v)) return false;
    }
    return true;
  };
  return { nodeType: 1, parentElement: parent, matches: (sel) => sel.split(',').some(one) };
}

test('a clear move up or down counts once it passes the small threshold', () => {
  assert.equal(cardSwipe(0, CARD_SWIPE_MIN), 1);
  assert.equal(cardSwipe(2, -14), 1);
  assert.equal(cardSwipe(-5, 40), 1);
});
test('a short twitch is undecided, a sideways or diagonal move is never the card\'s', () => {
  assert.equal(cardSwipe(3, 6), 0);
  assert.equal(cardSwipe(0, CARD_SWIPE_MIN - 1), 0);
  assert.equal(cardSwipe(12, 3), -1);    // sideways first: the slide swipe's
  assert.equal(cardSwipe(-14, 16), -1);  // diagonal
  assert.equal(cardSwipe(NaN, 20), -1);
  // (and a clear vertical swipe is never a slide change)
  assert.equal(swipeDir(5, 120, 200), 0);
});

test('a touch that starts on a control stays the control\'s; the figure and the words do not', () => {
  const wrap = el('div', { cls: ['stage-view'] });
  const text = el('section', { cls: ['pz-text'] }, wrap);
  const words = el('p', {}, text);
  const fig = el('g', {}, el('svg', {}, wrap));
  assert.equal(ownsTouch(words, { stop: wrap }), false);
  assert.equal(ownsTouch(fig, { stop: wrap }), false);
  for (const ctl of [
    el('button', {}, text), el('input', { attrs: { type: 'range' } }, text), el('span', {}, el('div', { cls: ['range-wrap'] }, text)),
    el('div', { attrs: { role: 'slider' } }, text), el('div', { attrs: { role: 'tab' } }, text), el('canvas', {}, text),
    el('a', { attrs: { href: '#' } }, text), el('span', {}, el('nav', { cls: ['pz-jump'] }, wrap)), el('i', {}, el('div', { cls: ['pz-bar'] }, wrap)),
    el('p', {}, el('section', { cls: ['pz-case'] }, wrap)),
  ]) assert.equal(ownsTouch(ctl, { stop: wrap }), true);
  // (the walk stops at the slide: a control around it does not count)
  const outer = el('button');
  assert.equal(ownsTouch(el('p', {}, el('div', {}, outer)), { stop: el('x') }), true);
  const inner = el('div', {}, outer);
  assert.equal(ownsTouch(el('p', {}, inner), { stop: inner }), false);
});

test('the swipe elsewhere feeds the card\'s own handle handlers, fold first, from where the finger came down', () => {
  assert.equal((pz.match(/const hs = \{\}, on = \(type, fn, opts\) => \{ hs\[type\] = fn;/g) || []).length, 2);
  assert.equal((pz.match(/\n {4}return hs;\n {2}\}\n/g) || []).length, 2);
  assert.match(pz, /const dockHs = dockTouch\(data, lip\);\n\s*const cardTouch = \[foldHs, dockHs\];/);
  assert.match(pz, /for \(const hs of ui\.cardTouch\) \{ hs\[type\]\?\.\(e\); if \(stopped\) break; \}/);
  assert.match(pz, /far\.on = true; sw = null;[^\n]*\n\s*farFeed\('touchstart', far\.x, far\.y\);/);
});

test('it never takes a touch on the card itself, a control, the case card, or a sideways-docking layout', () => {
  const start = pz.slice(pz.indexOf('let far = null;'), pz.indexOf('// ── Hands off'));
  assert.match(start, /!\(phone\(\) \|\| wideSheet\(d\)\)/, 'an upright phone or tablet, and a wide screen\'s stacked card (Mohammad, 22 Oct)');
  assert.match(start, /d\.contains\(e\.target\) \|\| ui\.lip\.contains\(e\.target\) \|\| caseOn\(e\) \|\| ownsTouch\(e\.target, \{ stop: wrap \}\)/);
  assert.match(start, /if \(k < 0\) \{ far = null; return; \}/);
  // A second finger hands the card back to its own ease (touchcancel eases to where it was going), never leaves it mid-way.
  assert.match(start, /if \(far\) \{ farLet\('touchcancel'\); return; \}/);
  assert.match(start, /if \(e\.touches\.length !== 1 \|\| !ui\) \{ farLet\('touchcancel'\); return; \}/);
  // The page never pans under the finger once the card follows it.
  assert.match(start, /if \(farFeed\('touchmove', t\.clientX, t\.clientY\) && e\.cancelable\) e\.preventDefault\(\);/);
  assert.match(start, /\{ passive: false, capture: true \}/);
});
