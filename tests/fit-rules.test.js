// The shared fit rules (src/ui/gallery/fit-rules.js): the judges are plain functions of what a reader returns, and every reader is ONE self-contained
// function whose source text runs in a page with only an `io` (scripts/fit-io.mjs sends it into headless Chromium that way; the gallery's Check button
// calls it with layout-snap's reads). Here the readers run from their source text in a fresh vm context over a jsdom page whose layout is
// given in data attributes, so a reader that reached for anything outside its own body (a module constant, an import) fails with a ReferenceError.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  readCards, readZoom, readStructureCard, judgeCards, judgeZoom, judgeStructureCard, linesOf, reportText,
  KINDS, KIND_WORDS, NEW_KINDS, TITLE_RATIO, WORDS_MIN_PX,
} from '../src/ui/gallery/fit-rules.js';
import { inPageSource } from '../scripts/fit-io.mjs';
import * as CT from '../src/ui/card-type.js';

// A page whose boxes come from data-box="left,top,right,bottom", whose metrics come from data-<key>, and whose styles come from the inline style attribute.
function page(html, { vw = 1440, vh = 900 } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="app">${html}</div></body>`);
  const win = dom.window, doc = win.document;
  const DEFAULTS = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', fontSize: '16px', zoom: '1', maxHeight: 'none' };
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const style = (el) => {
    const o = { ...DEFAULTS };
    for (const d of (el.getAttribute('style') || '').split(';')) { const [k, v] = d.split(':'); if (k && v) o[camel(k.trim())] = v.trim(); }
    if (o.overflow !== 'visible') { if (o.overflowX === 'visible') o.overflowX = o.overflow; if (o.overflowY === 'visible') o.overflowY = o.overflow; }
    return o;
  };
  const rect = (el) => { const [l, t, r, b] = (el.dataset.box || '0,0,0,0').split(',').map(Number); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
  const io = {
    box: rect, rects: (el) => [rect(el)], style,
    metric: (el, k) => (el === win ? { innerWidth: vw, innerHeight: vh }[k] : +(el.dataset[k] ?? 0)),
    ctm: () => null,
  };
  // The reader as the page gets it: its source text, evaluated where only the page's globals exist.
  const sandbox = { window: win, document: doc, SVGElement: win.SVGElement, JSON, Math, Map, parseFloat, Number, String, Array, Object };
  const load = (fn) => vm.runInNewContext(`(${fn.toString()})`, sandbox);
  return { dom, doc, io, load, win, run: (fn, ...a) => load(fn)(io, ...a) };
}

const CLEAN = `<div class="pz">
  <div class="pz-shade"></div>
  <section class="pz-text" data-box="40,40,440,400"><h1 class="pz-h" style="font-size:28px" data-box="50,50,400,100">A title</h1><p class="pz-line" style="font-size:18px" data-box="50,110,400,160">The words under it.</p></section>
  <section class="pz-data" data-box="900,60,1400,500"><span class="x" style="font-size:14px" data-box="910,70,1000,90">Tile name</span></section>
</div><span class="pzb-n">3/9</span>`;

test('a clean slide has no problems, from the reader as the page gets it', () => {
  const r = page(CLEAN).run(readCards, { minPx: WORDS_MIN_PX });
  assert.equal(r.n, '3/9');
  assert.deepEqual(judgeCards(r), []);
  assert.equal(r.shown, 2);
  assert.equal(r.title, 28); assert.equal(r.body, 18);
});

test('every reader is one self-contained function: the source text runs with only io, and the script wrapper names the call', () => {
  for (const fn of [readCards, readZoom, readStructureCard]) {
    const src = fn.toString();
    assert.match(src, /^function /, `${fn.name} is a plain function declaration`);
    assert.ok(!/\bTITLE_RATIO\b|\bWORDS_MIN_PX\b|\bKINDS\b/.test(src), `${fn.name} names no module constant`);
  }
  const s = inPageSource(readCards, { minPx: 12 });
  assert.match(s, /^\(\(io\) => \(function readCards/);
  assert.match(s, /getBoundingClientRect/);
  assert.ok(s.endsWith(')'));
});

test('scroll, clipped, off and enlarged are read and judged as card-fit.mjs did', () => {
  const p = page(`<div class="pz">
    <section class="pz-data" data-box="900,60,1300,300"><div class="in" data-box="910,70,1290,400">Runs past the box</div><p class="clip" style="overflow:hidden" data-box="910,80,1000,100" data-scroll-width="200" data-client-width="100">Cut word here</p><p class="out" data-box="1350,80,1500,100">Off the screen</p></section>
  </div>`);
  const r = p.run(readCards, {});
  const j = judgeCards(r);
  assert.deepEqual(j.map((x) => x.kind).sort(), ['clipped', 'off', 'scroll']);
  assert.match(j.find((x) => x.kind === 'scroll').text, /content runs 100 px past its box/);
  assert.equal(j.find((x) => x.kind === 'clipped').line.startsWith('clipped: p.clip "Cut word here" sw200>cw100'), true);
  p.doc.querySelector('.pz-data').dataset.zoomed = '';
  assert.deepEqual(judgeCards(p.run(readCards, {})).filter((x) => x.kind === 'enlarged').map((x) => x.text), ['the data card is zoomed on entry']);
});

test('text under 12 px on the screen is found, with a parent zoom counted', () => {
  const p = page(`<div class="pz"><section class="pz-data" data-box="900,60,1400,500">
    <span class="tiny" style="font-size:10.3px" data-box="910,70,1000,90">Too small</span>
    <div style="zoom:0.8"><span class="zoomed" style="font-size:14px" data-box="910,100,1000,120">Zoomed down</span></div>
    <span class="ok" style="font-size:12px" data-box="910,130,1000,150">Twelve</span>
  </section></div>`);
  const small = judgeCards(p.run(readCards, { minPx: 12 })).filter((x) => x.kind === 'small');
  assert.equal(small.length, 2);
  assert.match(small[0].text, /Too small" 10\.3 px/);
  assert.match(small[1].text, /Zoomed down" 11\.2 px/);
  // (Not on a card at all: the page's own words are not judged.)
  const q = page(`<div class="pz"><span class="tiny" style="font-size:9px" data-box="10,10,50,30">Outside</span></div>`);
  assert.deepEqual(judgeCards(q.run(readCards, { minPx: 12 })), []);
  // (The old rules leave it out.)
  assert.equal(judgeCards(p.run(readCards, { minPx: 12 }), { oldRules: true }).length, 0);
});

test('the slide title must be at least 1.4 times the words', () => {
  assert.equal(TITLE_RATIO, CT.TITLE_RATIO);
  const mk = (t, b) => page(`<div class="pz"><section class="pz-text" data-box="40,40,440,400"><h1 class="pz-h" style="font-size:${t}px" data-box="50,50,400,100">T</h1><p class="pz-line" style="font-size:${b}px" data-box="50,110,400,160">B</p></section></div>`).run(readCards, {});
  assert.equal(judgeCards(mk(25.2, 18)).length, 0, '1.40 passes');
  assert.equal(judgeCards(mk(25.0, 18)).length, 0, 'a hair under (1.389) is inside the rounding tolerance');
  const bad = judgeCards(mk(22.4, 18));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].kind, 'ratio');
  assert.match(bad[0].text, /22\.4 px over words of 18 px \(1\.24x; at least 1\.4x\)/);
  assert.equal(judgeCards(mk(22.4, 18), { oldRules: true }).length, 0);
  // (A phone's slide: 23.2 over 17.4 is 1.33, which Mohammad accepted on 19 Nov; 22.4 over 18 (1.24) still fails there.)
  const ph = (t, b) => page(`<div class="pz stack"><section class="pz-text" data-box="40,40,440,400"><h1 class="pz-h" style="font-size:${t}px" data-box="50,50,400,100">T</h1><p class="pz-line" style="font-size:${b}px" data-box="50,110,400,160">B</p></section></div>`).run(readCards, {});
  assert.equal(judgeCards(ph(23.2, 17.4)).length, 0, '1.33 on a phone passes');
  assert.match(judgeCards(ph(22.4, 18))[0].text, /\(1\.24x; at least 1\.3x on a phone\)/);
  assert.equal(judgeCards(mk(23.2, 17.4)).length, 1, 'the same sizes on a wide screen still fail');
  // (No words under the title: nothing to compare.)
  assert.equal(judgeCards({ title: 30, body: 0 }).length, 0);
});

test('anything in a card that scrolls sideways is found', () => {
  const p = page(`<div class="pz"><section class="pz-panel" data-box="100,60,700,500">
    <div class="strip" style="overflow-x:auto" data-box="110,70,400,120" data-scroll-width="640" data-client-width="290">wide</div>
    <div class="fine" style="overflow-x:auto" data-box="110,130,400,160" data-scroll-width="290" data-client-width="290">fits</div>
    <div class="tall" style="overflow-y:auto" data-box="110,170,400,220" data-scroll-width="640" data-client-width="290">down only</div>
  </section></div>`);
  const j = judgeCards(p.run(readCards, {})).filter((x) => x.kind === 'sideways');
  assert.equal(j.length, 1);
  assert.match(j[0].text, /div\.strip in \.pz-panel scrolls sideways \(content 640 px, box 290 px\)/);
  assert.equal(judgeCards(p.run(readCards, {}), { oldRules: true }).length, 0);
});

test('a card shown before it was whole: laying out, words before their backing, a bare tag', () => {
  const prep = page(CLEAN.replace('class="pz"', 'class="pz pz-prep"')).run(readCards, {});
  const j = judgeCards(prep).filter((x) => x.kind === 'styled');
  assert.ok(j.length >= 2 && j.every((x) => /still being laid out \(pz-prep\)/.test(x.text)));
  // (Words fully shown over a backing that is not there yet.)
  const early = page(CLEAN.replace('class="pz-shade"', 'class="pz-shade" style="opacity:0"')).run(readCards, {});
  assert.match(judgeCards(early).find((x) => x.kind === 'styled').text, /words are 100% shown over a backing at 0%/);
  // (Both mid-fade together is the entry itself: not a finding.)
  const fade = page(CLEAN.replace('class="pz-shade"', 'class="pz-shade" style="opacity:.4"').replace('<section class="pz-text"', '<section class="pz-text" style="opacity:.5"')).run(readCards, {});
  assert.deepEqual(judgeCards(fade).filter((x) => x.kind === 'styled'), []);
  // (A card that is only its tag.)
  const bare = page('<div class="pz"><section class="pz-text" data-box="40,40,440,400"><span class="pzt-k" data-box="50,50,100,70"></span></section></div>').run(readCards, {});
  assert.match(judgeCards(bare).find((x) => x.kind === 'styled').text, /no words in it/);
  // (A card parked off the screen or faded out is not "shown".)
  const parked = page('<div class="pz pz-prep"><section class="pz-text" style="opacity:0" data-box="40,40,440,400"><h1 class="pz-h" data-box="50,50,400,100">T</h1></section></div>').run(readCards, {});
  assert.deepEqual(judgeCards(parked), []);
});

test('the enlarged card is judged by what readZoom sees', () => {
  const rest = { vw: 1440, vh: 900, boxes: { '.pz-text': [40, 40, 440, 400], '.pz-data': [900, 60, 1300, 400] }, up: false };
  const ok = { vw: 1440, vh: 900, boxes: { '.pz-data': [500, 60, 1400, 800] }, up: true };
  assert.deepEqual(judgeZoom(ok, rest, 'icon'), []);
  assert.match(judgeZoom({ ...ok, up: false }, rest, 'icon')[0].text, /did not enlarge/);
  assert.match(judgeZoom({ ...ok, boxes: { '.pz-data': [500, 60, 1500, 800] } }, rest, 'tap')[0].text, /runs off the 1440 x 900 screen/);
  assert.match(judgeZoom({ ...ok, boxes: { '.pz-data': [900, 60, 1302, 400] } }, rest, 'tap')[0].text, /did not grow/);
  assert.match(judgeZoom({ ...ok, boxes: {} }, rest, 'tap')[0].text, /not on the screen/);
  const p = page('<span class="pz-zbtn" aria-expanded="true"></span><section class="pz-text" data-box="40,40,440,400"></section><section class="pz-data" data-box="500,60,1400,800"></section>');
  assert.deepEqual(JSON.parse(JSON.stringify(p.run(readZoom))), { vw: 1440, vh: 900, boxes: { '.pz-text': [40, 40, 440, 400], '.pz-data': [500, 60, 1400, 800] }, up: true });
});

test('a structure card: blank glass, a cut line, a scroller while the words fit, and the rules from the standing list', () => {
  const html = (body, extra = '') => `<section class="action-card docked" ${extra} data-offset-height="300" style="max-height:600px">
    <div class="ac-body" data-offset-top="0" style="overflow-y:hidden">${body}</div></section>`;
  const kid = (top, h, extra = '') => `<div class="row" data-offset-top="${top}" data-offset-height="${h}" data-box="0,${top},300,${top + h}" ${extra}>words</div>`;
  const ok = page(html(kid(14, 100) + kid(120, 160))).run(readStructureCard, null, {});
  assert.deepEqual(judgeStructureCard(ok), []);
  const blank = judgeStructureCard(page(html(kid(60, 100) + kid(170, 40))).run(readStructureCard, null, {}));
  assert.deepEqual(blank.map((x) => x.kind), ['blank']);
  assert.equal(blank[0].text, '60px above, 90px below (card 300px)');
  const cut = judgeStructureCard(page(html(kid(14, 100) + kid(120, 200))).run(readStructureCard, null, {}));
  assert.deepEqual(cut.map((x) => x.text), ['a line runs 20px past the card']);
  // (At its largest height a card whose body scrolls has its lower rows to scroll to: not cut. 18 Nov sweep: the TIPS card on a phone sideways, 38 px past 280.)
  const scrolls = page(html(kid(14, 100) + kid(120, 200)).replace('max-height:600px', 'max-height:300px').replace('overflow-y:hidden', 'overflow-y:auto')).run(readStructureCard, null, {});
  assert.deepEqual(judgeStructureCard(scrolls).map((x) => x.kind), []);
  assert.deepEqual(judgeStructureCard(page(html(kid(14, 100) + kid(120, 200)).replace('max-height:600px', 'max-height:300px')).run(readStructureCard, null, {})).map((x) => x.kind), ['cut'], 'at its largest with its body not scrolling it is cut');
  const scroller = judgeStructureCard(page(html(kid(14, 100) + kid(120, 160)).replace('class="action-card docked"', 'class="action-card docked ac-scroll"')).run(readStructureCard, null, {}));
  assert.deepEqual(scroller.map((x) => x.kind), ['tall']);
  // (At its largest height a card is let to scroll.)
  assert.deepEqual(judgeStructureCard(page(html(kid(14, 100) + kid(120, 160)).replace('class="action-card docked"', 'class="action-card docked ac-scroll"').replace('max-height:600px', 'max-height:300px')).run(readStructureCard, null, {})), []);
  const small = judgeStructureCard(page(html(`<div class="row" style="font-size:10px" data-offset-top="14" data-offset-height="100" data-box="0,14,300,114">tiny</div>` + kid(120, 160))).run(readStructureCard, null, {}));
  assert.deepEqual(small.map((x) => x.kind), ['small']);
  const side = judgeStructureCard(page(html(`<div class="row" style="overflow-x:auto" data-offset-top="14" data-offset-height="100" data-scroll-width="500" data-client-width="260" data-box="0,14,300,114">wide</div>` + kid(120, 160))).run(readStructureCard, null, {}));
  assert.deepEqual(side.map((x) => x.kind), ['sideways']);
  assert.deepEqual(judgeStructureCard(page(html('')).run(readStructureCard, null, {})).map((x) => x.kind).sort(), ['blank', 'styled'], 'a card with no words in it');
  assert.equal(page('<p>none</p>').run(readStructureCard, null, {}), null);
  assert.deepEqual(judgeStructureCard(null), []);
  // (A wide screen's card is not the phone's docked sheet: it keeps overflow auto always, so a scroller there is not a finding. 18 Nov sweep: 300 false 'tall' on Mac, iPad and Details faces.)
  const wide = html(kid(14, 100) + kid(120, 160)).replace('class="action-card docked"', 'class="action-card ac-scroll"').replace('overflow-y:hidden', 'overflow-y:auto');
  assert.deepEqual(judgeStructureCard(page(wide).run(readStructureCard, null, {})), []);
  // (With the details open the scroller that counts is theirs: ac-scroll with details that fit is a finding, with details taller than their room it is right.)
  const det = (scrollH) => html(kid(14, 100) + kid(120, 160)).replace('class="action-card docked"', 'class="action-card docked ac-scroll"').replace('</section>', `<section class="ac-details"><div class="ad-scroll" data-scroll-height="${scrollH}" data-client-height="200"></div></section></section>`);
  assert.deepEqual(judgeStructureCard(page(det(380)).run(readStructureCard, null, {})), [], 'taller details scroll, rightly');
  assert.deepEqual(judgeStructureCard(page(det(200)).run(readStructureCard, null, {})).map((x) => x.kind), ['tall']);
});

test('the list of kinds, their words, and the copied report', () => {
  for (const k of KINDS) assert.ok(KIND_WORDS[k], `${k} has its words`);
  for (const k of NEW_KINDS) assert.ok(KINDS.includes(k));
  assert.equal(WORDS_MIN_PX, 12);
  assert.equal(reportText([], { title: 'Doppler, three gates', look: 'navy', size: '390 x 844' }), 'Card check: Doppler, three gates\nlook navy, screen 390 x 844\nEvery card fits: no problems found.');
  const t = reportText([{ kind: 'small', text: 'span.a "x" 10.0 px' }, { kind: 'scroll', text: '.pz-data content runs 9 px past its box' }, { kind: 'small', text: 'span.b "y" 11.0 px', where: 'card' }], {});
  assert.match(t, /^Card check\n3 problems:/);
  assert.ok(t.indexOf('scroll (') < t.indexOf('small ('), 'kinds in their fixed order');
  assert.match(t, / {2}- \[card\] span\.b "y" 11\.0 px/);
  assert.deepEqual(linesOf(judgeCards({ scroll: ['a'], off: ['b'], enlarged: [], clipped: [] })), ['scroll: a', 'off: b']);
});
