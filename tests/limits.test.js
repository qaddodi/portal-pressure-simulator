// The owner's standing numbers, named once (selfcheck/limits.js; DBG-10, bible review 19 Nov 2026): each ties to what the app uses, the Check's words are made from the same numbers,
// and the Shuffle's 10 px exception is held by the judge (and only for the instrument card, only while the cards share a place).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { LIMITS, wording, SHUFFLE_MIN_PX, PHONE_TITLE_RATIO, WORDS_MIN_PX, TITLE_RATIO, DIM_ALPHA, BLANK_MAX, SHEET_SHORT_MAX } from '../src/ui/selfcheck/limits.js';
import { readCards, judgeCards, KIND_WORDS } from '../src/ui/gallery/fit-rules.js';
import * as FR from '../src/ui/gallery/fit-rules.js';
import * as CT from '../src/ui/card-type.js';
import * as LE from '../src/ui/label-explain.js';

test('each limit is the number the app itself uses, and the judges do not keep their own copy', () => {
  assert.equal(WORDS_MIN_PX, CT.WORDS_MIN_PX); assert.equal(TITLE_RATIO, CT.TITLE_RATIO); assert.equal(DIM_ALPHA, LE.DIM_ALPHA);
  assert.equal(FR.PHONE_TITLE_RATIO, PHONE_TITLE_RATIO); assert.equal(FR.BLANK_MAX, BLANK_MAX); assert.equal(FR.SHEET_SHORT_MAX, SHEET_SHORT_MAX);
  assert.ok(SHUFFLE_MIN_PX < WORDS_MIN_PX && PHONE_TITLE_RATIO < TITLE_RATIO, 'an exception is lower than its rule');
  assert.ok(LIMITS.every((l) => l.id && Number.isFinite(l.value) && l.since && l.rule && l.exceptions), 'every limit has its date, its words and its exceptions');
  assert.deepEqual(new Set(LIMITS.map((l) => l.id)).size, LIMITS.length);
});

test('the Check\'s one-line meanings are made from the numbers, so the heading cannot contradict the judge', () => {
  assert.equal(KIND_WORDS.small, wording.small); assert.equal(KIND_WORDS.ratio, wording.ratio);
  assert.match(KIND_WORDS.ratio, new RegExp(`${TITLE_RATIO} times the words \\(${PHONE_TITLE_RATIO} on a phone\\)`));
  assert.match(KIND_WORDS.small, new RegExp(`under ${WORDS_MIN_PX} px \\(${SHUFFLE_MIN_PX} px on a tall instrument card in the Shuffle\\)`));
});

function page(html) {
  const dom = new JSDOM(`<!doctype html><body><div id="app">${html}</div></body>`);
  const win = dom.window, doc = win.document;
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const style = (el) => { const o = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', fontSize: '16px', zoom: '1', maxHeight: 'none' }; for (const d of (el.getAttribute('style') || '').split(';')) { const [k, v] = d.split(':'); if (k && v) o[camel(k.trim())] = v.trim(); } return o; };
  const rect = (el) => { const [l, t, r, b] = (el.dataset.box || '0,0,0,0').split(',').map(Number); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
  const io = { box: rect, rects: (el) => [rect(el)], style, metric: (el, k) => (el === win ? { innerWidth: 844, innerHeight: 390 }[k] : +(el.dataset[k] ?? 0)), ctm: () => null };
  const load = (fn) => vm.runInNewContext(`(${fn.toString()})`, { window: win, document: doc, SVGElement: win.SVGElement, JSON, Math, Map, parseFloat, Number, String, Array, Object });
  return { run: (fn, ...a) => load(fn)(io, ...a) };
}
const SLIDE = `<div class="pz low"><section class="pz-text" data-box="20,20,300,200"><h1 class="pz-h" style="font-size:24px" data-box="30,30,200,60">T</h1><p style="font-size:17px" data-box="30,70,200,100">Words</p></section>
  <section class="pz-data" data-box="400,20,820,370"><span class="a" style="font-size:10.4px" data-box="410,30,500,40">Tile</span></section></div><span class="pzb-n">2/9</span>`;
const small = (r) => judgeCards(r).filter((x) => x.kind === 'small');

test('the Shuffle\'s instrument card may go to 10 px; nothing else, and not when the cards do not share a place', () => {
  assert.equal(small(page(SLIDE).run(readCards, { minPx: WORDS_MIN_PX })).length, 1, 'no Shuffle: 10.4 px is under 12');
  assert.equal(small(page(SLIDE).run(readCards, { minPx: WORDS_MIN_PX, shuffleMinPx: SHUFFLE_MIN_PX })).length, 0, 'the Shuffle: 10.4 px is fine on the instrument card');
  const under = SLIDE.replace('10.4px', '9.2px');
  assert.equal(small(page(under).run(readCards, { minPx: WORDS_MIN_PX, shuffleMinPx: SHUFFLE_MIN_PX })).length, 1, 'but not under 10');
  const words = SLIDE.replace('style="font-size:17px"', 'style="font-size:10.4px"');
  assert.equal(small(page(words.replace('10.4px" data-box="410', '14px" data-box="410')).run(readCards, { minPx: WORDS_MIN_PX, shuffleMinPx: SHUFFLE_MIN_PX })).length, 1, 'the teaching card is held to 12 even in the Shuffle');
});

test('readCards names no module constant (it is one self-contained function)', () => {
  assert.ok(!/SHUFFLE_MIN_PX|WORDS_MIN_PX/.test(readCards.toString()));
});
