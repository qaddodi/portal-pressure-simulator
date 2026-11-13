// Any glass over any glass hides it whole (Mohammad, 12 Nov 2026: "what happens when two cards are on top of each other?" ... "why can't the text
// be covered too?" ... "EVERY CARD", "should be able to cover other cards", "multiple too"): the lower card's words are the page's, above the
// figure's canvas where every glass is drawn, so the lower card is cut where any glass above it lies, whichever renderer draws either, above and
// below as the page stacks them (glass-cover.js). Fake elements: the clip each is given, checked by where it lets the card show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverBoard, coverClip, stackOf, stackCmp } from '../src/ui/glass-cover.js';

const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const el = (name, kids = []) => {
  const st = new Map();
  const e = { name, writes: 0, kids, contains: (n) => n === e || kids.includes(n),
    style: { getPropertyValue: (k) => st.get(k) || '', setProperty: (k, v) => { st.set(k, v); e.writes++; }, removeProperty: (k) => { st.delete(k); e.writes++; } } };
  e.clip = () => st.get('clip-path') || '';
  return e;
};
// (Whether a point (% of the card's box) shows under an even-odd polygon clip, as the browser fills it.)
function shows(clip, x, y) {
  const m = /^polygon\(evenodd, (.*)\)$/.exec(clip);
  if (!m) return true;
  const flat = m[1].replace(/calc\(0% - \d+px\)/g, '-1e6').replace(/calc\(100% \+ \d+px\)/g, '1e6');
  const pts = flat.split(', ').map((p) => p.split(' ').map(parseFloat));
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test('the lower card is cut where the upper one lies: its words hide under it, the rest of it shows', () => {
  const low = el('teaching'), top = el('data');
  const C = coverBoard().part();
  const panes = [{ g: low, box: true, r: rect(100, 100, 400, 300), rad: [16, 16, 16, 16] }, { g: top, box: true, r: rect(300, 200, 400, 300), rad: [16, 16, 16, 16] }];
  C.apply(panes, () => false);
  assert.equal(top.clip(), '', 'the top card is never cut');
  const c = low.clip();
  assert.match(c, /^polygon\(evenodd, /);
  // (Points of the lower card, as % of its box: 100 + 4 × x px across, 100 + 3 × y px down.)
  assert.equal(shows(c, 10, 10), true, 'outside the top card: shows');
  assert.equal(shows(c, 75, 50), false, 'under the top card (400, 250): hidden');
  assert.equal(shows(c, 99, 99), false, 'its far corner, under the top card: hidden');
  assert.equal(shows(c, 30, 50), true, 'left of the top card: shows');
  assert.equal(shows(c, -10, 50), true, 'its own shadow outside its box is not cut');
  // (The top card's rounded corner: the lower card shows in the corner's cut-off, as the top card's glass does not reach there.)
  assert.equal(shows(c, 50.4, 33.6), true, 'just outside the top card\'s rounded corner: shows');
});

test('a clip is written only when what covers the card changed, and taken off once nothing does', () => {
  const low = el('a'), top = el('b');
  const C = coverBoard().part();
  const P = [{ g: low, box: true, r: rect(0, 0, 200, 200), rad: null }, { g: top, box: true, r: rect(100, 100, 200, 200), rad: null }];
  C.apply(P, () => false);
  const w = low.writes;
  for (let i = 0; i < 5; i++) C.apply(P, () => false);
  assert.equal(low.writes, w, 'the same overlap: nothing written');
  P[1].r = rect(120, 100, 200, 200);
  C.apply(P, () => false);
  assert.equal(low.writes, w + 1, 'the top card slid: cut again');
  P[1].r = rect(300, 300, 50, 50);
  C.apply(P, () => false);
  assert.equal(low.clip(), '', 'apart: the cut taken off');
  assert.equal(C.cut, 0);
});

test('not cut: a card inside the other, a card with a clip of its own, a glass fading in under half; clear() takes every cut off', () => {
  const inner = el('inner'), outer = el('outer', [inner]), other = el('other'), own = el('own');
  const C = coverBoard().part();
  const R = rect(0, 0, 300, 300), S = rect(100, 100, 300, 300);
  C.apply([{ g: outer, box: true, r: R }, { g: inner, box: true, r: S }], () => false);
  assert.equal(outer.clip(), '', 'a card and a part of it: never cut (it would cut the part too)');
  C.apply([{ g: own, box: true, r: R }, { g: other, box: true, r: S }], (g) => g === own);
  assert.equal(own.clip(), '', 'its page cuts it: left to that');
  C.apply([{ g: other, box: true, r: R }, { g: own, box: true, r: S, a: 0.3 }], () => false);
  assert.equal(other.clip(), '', 'a glass at 30 % does not cut yet');
  C.apply([{ g: other, box: true, r: R }, { g: own, box: true, r: S, a: 0.6 }], () => false);
  assert.ok(other.clip(), 'past half: it does');
  const a = el('a'), b = el('b');
  C.apply([{ g: a, box: true, r: R }, { g: b, box: true, r: S }], () => false);
  assert.ok(a.clip());
  C.clear();
  assert.equal(a.clip(), '');
});

test('two cards over one: overlapping cuts are one, so neither shows the card through the other', () => {
  const low = el('low'), b = el('b'), c = el('c');
  const C = coverBoard().part();
  C.apply([{ g: low, box: true, r: rect(0, 0, 400, 400) }, { g: b, box: true, r: rect(100, 100, 150, 150) }, { g: c, box: true, r: rect(200, 200, 150, 150) }], () => false);
  const k = low.clip();
  assert.equal(shows(k, 56, 56), false, 'where both lie (225, 225): hidden');
  assert.equal(shows(k, 30, 30), false, 'under b: hidden');
  assert.equal(shows(k, 80, 80), false, 'under c: hidden');
  assert.equal(shows(k, 10, 90), true, 'clear of both: shows');
  assert.equal(coverClip(rect(0, 0, 100, 100), []).startsWith('polygon(evenodd'), true);
});

// (A small page: each fake element's computed style, parent and place in the document, for stackOf and stackCmp.)
function page() {
  const order = [], root = { name: 'html', parentElement: null };
  const doc = { documentElement: root };
  root.ownerDocument = doc;
  const styles = new Map();
  const mk = (name, parent, css = {}) => {
    const st = new Map();
    const e = { name, parentElement: parent, ownerDocument: doc, writes: 0,
      contains(n) { for (let x = n; x; x = x.parentElement) if (x === e) return true; return false; },
      compareDocumentPosition(o) { const a = order.indexOf(e), b = order.indexOf(o); return e.contains(o) ? 20 : o.contains(e) ? 10 : b > a ? 4 : 2; },
      style: { getPropertyValue: (k) => st.get(k) || '', setProperty: (k, v) => { st.set(k, v); e.writes++; }, removeProperty: (k) => { st.delete(k); e.writes++; } } };
    e.clip = () => st.get('clip-path') || '';
    order.push(e);
    styles.set(e, { position: 'static', zIndex: 'auto', opacity: '1', transform: 'none', filter: 'none', isolation: 'auto', ...css });
    return e;
  };
  const body = mk('body', root);
  return { body, mk, style: (e) => styles.get(e) };
}

test('the page\'s stacking says which lies above: a pill early in the page with a low z-index is under a sheet laid later with a high one', () => {
  const P = page();
  globalThis.getComputedStyle = (e) => P.style(e);
  try {
    // (The deck's colour key: inside the deck's layer (positioned, no z-index), at z-index 1. The Settings sheet: fixed, z-index 60, after it.)
    const deck = P.mk('deck', P.body, { position: 'absolute' }), key = P.mk('key', deck, { position: 'absolute', zIndex: '1' });
    const menus = P.mk('menus', P.body), sheet = P.mk('sheet', menus, { position: 'fixed', zIndex: '60' });
    const words = P.mk('words', deck);   // (in the flow of the deck's layer)
    const memo = new Map(), sk = stackOf(key, memo), ss = stackOf(sheet, memo), sw = stackOf(words, memo);
    assert.ok(stackCmp(ss, sk) > 0, 'the sheet above the key');
    assert.ok(stackCmp(sk, ss) < 0);
    assert.ok(stackCmp(sk, sw) > 0, 'the key (z 1) above a block of its own layer');
    // (Now the deck's layer is a context of its own at z-index 100: everything in it, the key too, lies above the sheet.)
    P.style(deck).zIndex = '100';
    const m2 = new Map();
    assert.ok(stackCmp(stackOf(key, m2), stackOf(sheet, m2)) > 0, 'a key in a layer at 100 lies above a sheet at 60');
    // (A fade makes a context: the deck at opacity .5 with no z-index paints at 0, under the sheet.)
    P.style(deck).zIndex = 'auto'; P.style(deck).position = 'static'; P.style(deck).opacity = '0.5';
    const m3 = new Map();
    assert.ok(stackCmp(stackOf(key, m3), stackOf(sheet, m3)) < 0);
  } finally { delete globalThis.getComputedStyle; }
});

test('every renderer\'s glass on one board: the key\'s pill is cut under the Settings sheet whichever renderer draws it, and several stacked cut each other', () => {
  const P = page();
  globalThis.getComputedStyle = (e) => P.style(e);
  try {
    const deck = P.mk('deck', P.body, { position: 'absolute' }), key = P.mk('key', deck, { position: 'absolute', zIndex: '1' });
    const sheet = P.mk('sheet', P.body, { position: 'fixed', zIndex: '60' }), toast = P.mk('toast', P.body, { position: 'fixed', zIndex: '90' });
    const memo = new Map(), st = (e) => stackOf(e, memo);
    const B = coverBoard(), cards = B.part(), sheets = B.part();
    // (The sheet's renderer was made first and lists it first: draw order alone would put the key on top.)
    sheets.apply([{ g: sheet, box: true, r: rect(0, 300, 400, 500), rad: [20, 20, 0, 0], st: st(sheet) }], () => false);
    cards.apply([{ g: key, box: true, r: rect(100, 400, 200, 40), rad: [20, 20, 20, 20], st: st(key) }], () => false);
    assert.ok(key.clip(), 'the key is cut under the sheet');
    assert.equal(sheet.clip(), '', 'the sheet, above it, is not');
    assert.equal(shows(key.clip(), 50, 50), false, 'the key\'s words under the sheet: hidden');
    // (Three deep: a toast over both. The key is cut by both, the sheet by the toast, the toast by none.)
    sheets.apply([{ g: sheet, box: true, r: rect(0, 300, 400, 500), st: st(sheet) }, { g: toast, box: true, r: rect(50, 350, 300, 80), st: st(toast) }], () => false);
    assert.ok(sheet.clip(), 'the sheet is cut under the toast');
    assert.equal(shows(sheet.clip(), 50, 10), false, 'under the toast (200, 350): hidden');
    assert.equal(shows(sheet.clip(), 50, 60), true, 'below the toast: shows');
    assert.equal(toast.clip(), '');
    assert.ok(key.clip());
    // (The key's renderer lets its glass go: its cut is taken off, the others stay.)
    cards.clear();
    assert.equal(key.clip(), '');
    assert.ok(sheet.clip());
    sheets.clear();
    assert.equal(sheet.clip(), '');
    assert.equal(B.cut, 0);
  } finally { delete globalThis.getComputedStyle; }
});

test('a glass whose words lie in another element (a sheet\'s paper, a callout\'s body) cuts that element, at its own box', () => {
  const card = el('card'), sheet = el('sheet'), paper = el('paper');
  const C = coverBoard().part();
  // (The paper is 10 px inside the sheet all round; the card lies over the sheet's top half.)
  C.apply([{ g: paper, cv: sheet, cvo: [-10, -10, 10, 10], box: true, r: rect(10, 10, 380, 380) }, { g: card, box: true, r: rect(0, 0, 400, 200) }], () => false);
  assert.equal(paper.clip(), '', 'the paper itself is left');
  const c = sheet.clip();
  assert.ok(c, 'the sheet, which holds the words, is cut');
  assert.equal(shows(c, 50, 25), false, 'under the card: hidden');
  assert.equal(shows(c, 50, 75), true, 'below it: shows');
});

test('a card the page clips itself (a dock sheet, an app menu) keeps its clip, and its parts are cut instead', () => {
  const sheet = el('sheet'), head = el('head'), body = el('body'), own = el('own'), card = el('card');
  const C = coverBoard().part();
  // (The sheet: 0..400 × 0..400, its head the top 100 px, its body the rest, a part with its own clip in the body; the card over its top half.)
  const kids = [{ el: head, o: [0, 0, 0, -300] }, { el: body, o: [0, 100, 0, 0] }, { el: own, o: [0, 100, 0, 0], own: true }];
  C.apply([{ g: sheet, box: true, r: rect(0, 0, 400, 400), kids }, { g: card, box: true, r: rect(0, 0, 400, 200) }], (g) => g === sheet);
  assert.equal(sheet.clip(), '', 'its own clip is left as it is');
  assert.ok(head.clip() && body.clip(), 'its parts are cut');
  assert.equal(own.clip(), '', 'a part with a clip of its own is left');
  assert.equal(shows(head.clip(), 50, 50), false, 'the head, all under the card: hidden');
  assert.equal(shows(body.clip(), 50, 25), false, 'the body\'s top third (y 175), under the card: hidden');
  assert.equal(shows(body.clip(), 50, 75), true, 'its foot (y 325): shows');
  C.apply([{ g: sheet, box: true, r: rect(0, 0, 400, 400), kids }], (g) => g === sheet);
  assert.equal(head.clip(), '', 'the card gone: the cuts taken off');
  assert.equal(body.clip(), '');
});

test('words that lie beside their paper (the teaching card\'s text and panel are not in its shade) are cut too, and by their own stacking', () => {
  const shade = el('shade'), text = el('text'), panel = el('panel'), own = el('own'), sheet = el('sheet');
  const C = coverBoard().part();
  // (The shade 0..400 × 0..300; its text 20..380 × 40..260 inside the same area, a panel hidden (not given), a part with a clip of its own; the Settings sheet over the lower half.)
  const also = [{ el: text, o: [20, 40, -20, -40], own: false, st: null }, { el: own, o: [20, 40, -20, -40], own: true, st: null }];
  C.apply([{ g: shade, box: true, r: rect(0, 0, 400, 300), also }, { g: sheet, box: true, r: rect(0, 150, 400, 400) }], () => false);
  assert.ok(shade.clip(), 'the paper is cut, as before');
  const c = text.clip();
  assert.ok(c, 'its words are cut under the sheet');
  // (The text's box is 360 × 220 at (20, 40): the sheet's top, y 150, is 50% down it.)
  assert.equal(shows(c, 50, 25), true, 'above the sheet: shows');
  assert.equal(shows(c, 50, 75), false, 'under the sheet: hidden');
  assert.equal(shows(c, 50, 99), false, 'its foot, under the sheet: hidden');
  assert.equal(own.clip(), '', 'a part with a clip of its own is left');
  assert.equal(panel.clip(), '', 'an element not given is left');
  C.apply([{ g: shade, box: true, r: rect(0, 0, 400, 300), also }], () => false);
  assert.equal(text.clip(), '', 'the sheet gone: the cut is taken off');
  assert.equal(shade.clip(), '');
  // (By its own stacking: a card painted under the text's place does not cut it, one above does.)
  const card = el('card');
  const S = (el_, z) => [{ el: el_, rank: z }];
  const tx = S(text, 5), sh = S(shade, 1);
  C.apply([{ g: shade, box: true, r: rect(0, 0, 400, 300), st: sh, also: [{ el: text, o: [20, 40, -20, -40], own: false, st: tx }] }, { g: card, box: true, r: rect(0, 0, 400, 300), st: S(card, 3) }], () => false);
  assert.ok(shade.clip(), 'a card above the paper cuts it');
  assert.equal(text.clip(), '', 'a card below the words does not cut them');
});

test('a solid card with no glass of its own (bare) is cut under a glass above it, and never cuts another', () => {
  const panel = el('panel'), sheet = el('sheet'), other = el('other');
  const C = coverBoard().part();
  const P = [{ g: panel, box: true, bare: true, r: rect(0, 0, 400, 400), rad: null, a: 1 }, { g: sheet, box: true, r: rect(0, 200, 400, 400) }];
  C.apply(P, () => false);
  const c = panel.clip();
  assert.ok(c, 'the panel is cut under the sheet');
  assert.equal(shows(c, 50, 25), true, 'above the sheet: shows');
  assert.equal(shows(c, 50, 75), false, 'under the sheet: hidden');
  assert.equal(sheet.clip(), '', 'the sheet is not cut by it');
  // (A bare card over a glass is no hole in it: it has no glass.)
  C.apply([{ g: other, box: true, r: rect(0, 0, 400, 400) }, { g: panel, box: true, bare: true, r: rect(0, 0, 400, 400), rad: null, a: 1 }], () => false);
  assert.equal(other.clip(), '', 'a glass under a bare card is not cut by it');
  C.apply([{ g: panel, box: true, bare: true, r: rect(0, 0, 400, 400), rad: null, a: 1 }], () => false);
  assert.equal(panel.clip(), '', 'no glass above: the cut is taken off');
});
