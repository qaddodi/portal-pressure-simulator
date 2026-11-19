// Three kinds of words that the deck sweep (19 Nov 2026, cards-only run 1) found past a card's edge, each fixed where it comes from:
//   - a title's first line "starting 4 to 5 px above the card" (132 findings): the box of an inline run is its font's box, taller than a tight line, with no ink in the extra;
//   - the rail's names in "Sites and causes 2" running 3 px out of the card's left edge (a custom property written on a container, inside that container's own query: never applied);
//   - the time-lapse label running 15 px out of an iPhone card (a nowrap box as wide as its widest words), and the belly's "▲ 1,700 mL/day" cut by the ring on a slide.
// Node only: the reader on a jsdom page whose boxes are given, and the stylesheets read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { judgeEdges, readEdges } from '../src/ui/gallery/edge-rules.js';

const css = (f) => readFileSync(new URL(`../styles/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ---- (a) words are boxed by their line, not by their font ----------------------------------------------------------------------------
function readTitle({ style = {}, rectH = 32, lineH = 24.6 } = {}) {
  const dom = new JSDOM('<!doctype html><div class="pz"><section class="pz-text" id="t"><h1 id="h"><span id="s">Heart failure</span> gives high-SAAG ascites</h1></section></div>');
  const { document } = dom.window;
  globalThis.window = dom.window; globalThis.document = document;
  try {
    // The card's top is the title's top (597); the span's own box stands 3.7 px above it (the font's ascent and descent over the line-height 1.06).
    const boxes = { t: [21, 597, 369, 781], h: [21, 597, 369, 653], s: [21, 597 - (rectH - lineH) / 2, 150, 597 - (rectH - lineH) / 2 + rectH] };
    const io = {
      box: (el) => { const [l, t, r, b] = boxes[el.id]; return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; },
      rects: (el) => { const [l, t, r, b] = boxes[el.id]; return [{ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }]; },
      style: (el) => ({ display: el.id === 's' ? 'inline' : 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible', textOverflow: 'clip', clipPath: 'none',
        lineHeight: `${lineH}px`, backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', boxShadow: 'none', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px', ...(el.id === 's' ? style : {}) }),
      metric: (el, k) => (el === dom.window ? (k === 'innerWidth' ? 390 : 844) : 0),
    };
    return readEdges(io);
  } finally { delete globalThis.window; delete globalThis.document; }
}

test('a title run set tight is taken at its line, so its font box above the card is not "words above the card"', () => {
  const r = readTitle();
  const span = r.cards[0].leaves.find((l) => l.t === 'Heart failure');
  assert.equal(span.b[1], 597, 'the top of the line, the card\'s edge');
  assert.deepEqual(judgeEdges(r), []);
});

test('a run that paints a box of its own (a pill: background, border, shadow, padding) is still its whole box', () => {
  for (const style of [{ backgroundColor: 'rgb(138, 63, 181)' }, { boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1px inset' }, { paddingTop: '2px' }, { borderTopWidth: '1px' }, { backgroundImage: 'linear-gradient(red, blue)' }]) {
    const out = judgeEdges(readTitle({ style }));
    assert.ok(out.some((l) => /^cutoff: pz-text: "Heart failure" starts \d+ px above the card/.test(l)), `a painted box above the card is real: ${JSON.stringify(style)}`);
  }
});

test('a run set looser than its font box has nothing to trim, and a block is never trimmed', () => {
  const r = readTitle({ rectH: 24, lineH: 33 });
  assert.equal(r.cards[0].leaves.find((l) => l.t === 'Heart failure').b[1], 601.5, 'its own box, as read');
  assert.equal(r.cards[0].leaves.find((l) => l.n.startsWith('h1')).b[1], 597, 'a block as read');
});

test('words really above the card are still found: the trim is only the font\'s empty space, never a line', () => {
  const dom = new JSDOM('<!doctype html><div class="pz"><section class="pz-text" id="t"><p id="p">above</p></section></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  try {
    const boxes = { t: [21, 597, 369, 781], p: [21, 585, 369, 609] };
    const io = {
      box: (el) => { const [l, t, r, b] = boxes[el.id]; return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; },
      rects: (el) => [io.box(el)], metric: (el, k) => (el === dom.window ? (k === 'innerWidth' ? 390 : 844) : 0),
      style: () => ({ display: 'inline', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible', textOverflow: 'clip', clipPath: 'none', lineHeight: '24px', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', boxShadow: 'none' }),
    };
    assert.ok(judgeEdges(readEdges(io)).some((l) => /starts 12 px above the card/.test(l)), 'a line 12 px above is cut, whatever its display');
  } finally { delete globalThis.window; delete globalThis.document; }
});

// ---- (b) the rail's columns move in, the time-lapse label wraps ----------------------------------------------------------------------
test('the rail\'s inset is written on the rail\'s children, never on the container its own query is about', () => {
  const src = css('app-04-presenter.css');
  const m = /@container \(max-width: 470px\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m, 'the rail\'s narrow query is there');
  assert.ok(!/\.pz-rail\s*\{[^}]*--pl\s*:/.test(m[1]), 'a rule inside a container query cannot style the container itself (the old `.pz:not(.low) .pz-rail { --pl }` never applied)');
  assert.match(m[1], /\.pz-rail > :is\(ol, \.pz-rail-liver\) \{ --pl:/, 'the ol and the liver bracket both get it');
  assert.match(m[1], /\.pz-rail ol \{ padding-left: var\(--pl\); \}/);
});

test('the time-lapse label may wrap beside its bar (the widest words are 352 px on one line), and the bar keeps its floor', () => {
  const src = css('app-04-presenter.css');
  assert.match(src, /\.pz-lapse \.pzl-t \{ min-width: 0; \}/);
  assert.match(src, /\.pz-lapse \.pzl-t > :is\(\.pzv-s, \.pzv-t\) \{ white-space: normal;/);
  assert.match(src, /\.pzl-bar \{[^}]*flex: 1 0 2\.5em;/);
  // (Its sizer and live words stay in one grid cell, so wrapping never changes the row's height as the words change.)
  assert.match(css('app-05-presenter-cards.css'), /\.pzv > \.pzv-s, \.pzv > \.pzv-t \{ grid-area: 1 \/ 1;/);
});

// ---- (c) the belly's balance wraps inside the ring on a slide too ----------------------------------------------------------------------------
test('a small belly takes the two-line balance on a slide\'s abdomen card as in the dock pane', () => {
  const src = css('app-09-tests.css');
  const m = /@container \(max-width: 124px\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m, 'the small belly query is there');
  const sel = ':is(.dock-pane > .instrument-view.ab, .pz-tool[data-kind="abdomen"] .ab) .ab-belly > .ab-big > .ab-rate';
  assert.ok(m[1].includes(`${sel}[data-dir] { display: block; width: min-content;`));
  assert.ok(m[1].includes(`${sel}[data-dir="steady"] { margin-bottom: 1.1em; }`));
  assert.ok(m[1].includes(`${sel}[data-dir] > .ab-rate-a {`));
  assert.ok(!/(^|\n)\s*\.dock-pane > \.instrument-view\.ab \.ab-belly > \.ab-big > \.ab-rate/.test(m[1]), 'no copy left scoped to the dock pane alone');
});

test('no stylesheet writes a custom property on a container element inside a container query that has no container above it but the element itself (the rail)', () => {
  // The pattern behind the rail's bug, for the one container that stood alone: .pz-rail has no container ancestor, so a query's rule on `.pz-rail { --x }` is never matched.
  for (const f of readdirSync(new URL('../styles/', import.meta.url)).filter((n) => n.endsWith('.css'))) {
    const src = css(f);
    for (const m of src.matchAll(/@container[^{]*\{([\s\S]*?)\n\}/g)) assert.ok(!/(^|[,}\n]\s*)[^{}]*\.pz-rail\s*\{[^}]*--[\w-]+\s*:/.test(m[1]), `${f}: a custom property on .pz-rail inside a container query`);
  }
});
