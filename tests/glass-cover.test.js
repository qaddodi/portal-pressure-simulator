// A card over a card hides it whole (Mohammad, 12 Nov 2026: "what happens when two cards are on top of each other?" ... "why can't the text be
// covered too?"): the lower card's words are the page's, above the figure's canvas where both glasses are drawn, so the lower card is cut where
// the upper lies (glass-cover.js). Fake elements: the clip each is given, checked by where it lets the card show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glassCover, coverClip } from '../src/ui/glass-cover.js';

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
  const C = glassCover();
  const panes = [{ g: low, box: true, r: rect(100, 100, 400, 300), rad: [16, 16, 16, 16] }, { g: top, box: true, r: rect(300, 200, 400, 300), rad: [16, 16, 16, 16] }];
  C.apply(panes, () => true, () => false);
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
  const C = glassCover();
  const P = [{ g: low, box: true, r: rect(0, 0, 200, 200), rad: null }, { g: top, box: true, r: rect(100, 100, 200, 200), rad: null }];
  C.apply(P, () => true, () => false);
  const w = low.writes;
  for (let i = 0; i < 5; i++) C.apply(P, () => true, () => false);
  assert.equal(low.writes, w, 'the same overlap: nothing written');
  P[1].r = rect(120, 100, 200, 200);
  C.apply(P, () => true, () => false);
  assert.equal(low.writes, w + 1, 'the top card slid: cut again');
  P[1].r = rect(300, 300, 50, 50);
  C.apply(P, () => true, () => false);
  assert.equal(low.clip(), '', 'apart: the cut taken off');
  assert.equal(C.cut, 0);
});

test('not cut: cards of another region, a card inside the other, a card with a clip of its own; clear() takes every cut off', () => {
  const inner = el('inner'), outer = el('outer', [inner]), other = el('other'), own = el('own');
  const C = glassCover();
  const R = rect(0, 0, 300, 300), S = rect(100, 100, 300, 300);
  C.apply([{ g: other, box: true, r: R }, { g: own, box: true, r: S }], () => false, () => false);
  assert.equal(other.clip(), '', 'another region\'s card: left as it is');
  C.apply([{ g: outer, box: true, r: R }, { g: inner, box: true, r: S }], () => true, () => false);
  assert.equal(outer.clip(), '', 'a card and a part of it: never cut (it would cut the part too)');
  C.apply([{ g: own, box: true, r: R }, { g: other, box: true, r: S }], () => true, (g) => g === own);
  assert.equal(own.clip(), '', 'its page cuts it: left to that');
  const a = el('a'), b = el('b');
  C.apply([{ g: a, box: true, r: R }, { g: b, box: true, r: S }], () => true, () => false);
  assert.ok(a.clip());
  C.clear();
  assert.equal(a.clip(), '');
});

test('two cards over one: overlapping cuts are one, so neither shows the card through the other', () => {
  const low = el('low'), b = el('b'), c = el('c');
  const C = glassCover();
  C.apply([{ g: low, box: true, r: rect(0, 0, 400, 400) }, { g: b, box: true, r: rect(100, 100, 150, 150) }, { g: c, box: true, r: rect(200, 200, 150, 150) }], () => true, () => false);
  const k = low.clip();
  assert.equal(shows(k, 56, 56), false, 'where both lie (225, 225): hidden');
  assert.equal(shows(k, 30, 30), false, 'under b: hidden');
  assert.equal(shows(k, 80, 80), false, 'under c: hidden');
  assert.equal(shows(k, 10, 90), true, 'clear of both: shows');
  assert.equal(coverClip(rect(0, 0, 100, 100), []).startsWith('polygon(evenodd'), true);
});
