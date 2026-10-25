import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Opening or closing the phone's data card (a tap on its handle, a pull, a push) re-frames the slide in the room the cards leave: the
// camera counts the card where its glide ends, not where it stands 60 ms in, so the focus sits in the middle of the room between the
// cards every time (Mohammad, 21 Oct: "On phone the view doesn't always center when opening closing data cards", Ascites 8).
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.DOMRect ??= class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }); } };
const { parseTranslate, translateRest } = await import('../src/ui/util.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const presenter = read('src/ui/presenter.js'), stage = read('src/ui/stage.js');

test('a translate value reads as x and y px', () => {
  assert.deepEqual(parseTranslate('none'), [0, 0]);
  assert.deepEqual(parseTranslate(''), [0, 0]);
  assert.deepEqual(parseTranslate('12px'), [12, 0]);
  assert.deepEqual(parseTranslate('0px -296.5px'), [0, -296.5]);
  assert.deepEqual(parseTranslate('0 0'), [0, 0]);
});

// A card 300 px tall at the top, its glide part way (the translate it has this frame) and its end (data-rest-translate).
const card = (now, rest, z = 1) => {
  globalThis.getComputedStyle = () => ({ translate: now });
  return { offsetHeight: 300, dataset: rest == null ? {} : { restTranslate: rest }, getBoundingClientRect: () => new DOMRect(0, 20 + parseTranslate(now)[1] * z, 390 * z, 300 * z) };
};

test('a card opening counts where it ends: fully out, not part way', () => {
  const el = card('0px -210px', '0.0 0.0'), q = translateRest(el);
  assert.equal(q.y, 20);
  assert.equal(q.y + q.height, 320, 'its foot where it comes to rest, so the room between the cards is measured right');
});

test('a card closing counts where it ends: at its edge, not still half open', () => {
  const el = card('0px -90px', '0.0 -310.0'), q = translateRest(el);
  assert.equal(q.y + q.height, 10, 'only the closed card\'s edge stays at the top');
});

test('the end shift is scaled with the card, and a card at rest or unmarked is left as it is', () => {
  assert.equal(translateRest(card('0px -100px', '0 0', 2)).y, 20);
  const still = card('0px -310px', '0 -310'), q0 = still.getBoundingClientRect();
  assert.equal(translateRest(still, q0), q0);
  const plain = card('0px -50px', null), q1 = plain.getBoundingClientRect();
  assert.equal(translateRest(plain, q1), q1);
});

test('the camera\'s room uses the card\'s and its sheet edge\'s resting place, on every device that docks the card', () => {
  assert.match(stage, /if \('safeRest' in el\.dataset\) q = translateRest\(el, restBox\(el, q\)\);/);
  // (Set on every paint of the dock, from where it is going, dock.to; the sheet's edge follows the card.)
  assert.match(presenter, /ui\.data\.dataset\.restTranslate = `\$\{\(x \* dock\.to\)\.toFixed\(1\)\} \$\{\(y \* dock\.to\)\.toFixed\(1\)\}`;/);
  assert.match(presenter, /l\.style\.translate = d\.style\.translate; l\.dataset\.restTranslate = d\.dataset\.restTranslate \?\? '0 0';/);
  // (The sheet's edge counts as part of the card, with the card's edge, top on a phone or upright iPad.)
  assert.match(presenter, /class: 'pz-lip stage-blocker', type: 'button', hidden: true, 'data-safe-rest': ''/);
  assert.match(presenter, /if \(dd\.dataset\.safe\) ui\.lip\.dataset\.safe = dd\.dataset\.safe; else delete ui\.lip\.dataset\.safe;/);
  // (And the camera frames once the card is on its way: dockTo lays out and re-frames.)
  assert.match(presenter, /layout\(\); {3}\/\/ \(the figure frames itself for where the card is going\)\n\s*clearTimeout\(dock\.fit\); dock\.fit = setTimeout\(\(\) => ui && onResize\(\), 60\);/);
});
