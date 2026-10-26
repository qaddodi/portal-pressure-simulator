// Mohammad, 26 Oct: "When using sliders on teaching cards on phone the text of the teaching card jitters a lot." Words that change
// while they show (a what-if slider's value, a time-lapse's day count) stand in a box as wide as the widest they will take, and a
// card is not fitted again for them; a what-if slider of either kind (the model's, or an instrument's option) holds the cards' plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';

// A small fake DOM: just what h() and the live box touch.
class Node {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.childNodes = []; this.className = ''; this.nodeType = 1; }
  get classList() { const el = this; return { contains: (c) => el.className.split(/\s+/).includes(c) }; }
  append(...k) { this.childNodes.push(...k); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.childNodes.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join(''); }
  set textContent(t) { this.childNodes = [{ nodeType: 3, data: String(t) }]; }
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (data) => ({ nodeType: 3, data: String(data) });
const { widest, liveText, wordsOf } = await import('../src/ui/live-text.js');

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the widest words are the longest, the first of equals', () => {
  assert.equal(widest(['0 mmHg', '20 mmHg', '10 mmHg']), '20 mmHg');
  assert.equal(widest([0, 40, 24]), '40');
  assert.equal(widest(['−5.0', '4.5']), '−5.0');
  assert.equal(widest([]), '');
});

test('a live box holds a hidden copy of its widest words and the live words, and sets them only when they change', () => {
  const box = liveText('output', 'pzi-v', ['0 mm', '12 mm'], '8 mm');
  assert.equal(box.el.tag, 'output');
  assert.equal(box.el.className, 'pzi-v pzv');
  const [sizer, live] = box.el.childNodes;
  assert.equal(sizer.className, 'pzv-s');
  assert.equal(sizer.attrs['aria-hidden'], 'true', 'a screen reader reads the live words, not the copy');
  assert.equal(sizer.textContent, '12 mm');
  assert.equal(live.className, 'pzv-t');
  assert.equal(live.textContent, '8 mm');
  box.set('11 mm');
  assert.equal(live.textContent, '11 mm');
  const kids = live.childNodes;
  box.set('11 mm');
  assert.equal(live.childNodes, kids, 'the same words are not written again');
});

test('a card\'s fit reads its words without the live ones: a digit never fits the card again', () => {
  const a = liveText('output', 'pzi-v', ['10 mmHg'], '9 mmHg'), b = liveText('output', 'pzi-v', ['10 mmHg'], '10 mmHg');
  const card = (live) => { const el = new Node('div'); el.append({ nodeType: 3, data: 'What if ' }, live.el, { nodeType: 3, data: ' end' }); return el; };
  assert.equal(wordsOf(card(a)), 'What if 10 mmHg end', 'the hidden copy stays: it is the box, not the number');
  assert.equal(wordsOf(card(a)), wordsOf(card(b)));
  a.set('3 mmHg');
  assert.equal(wordsOf(card(a)), wordsOf(card(b)));
  assert.match(js, /\(el\.querySelector\('\.pzv'\) \? wordsOf\(el\) : el\.textContent\)\.replace\(\/\\d\/g, '0'\)/, 'fitSig leaves the live words out');
});

test('the what-if value and the time-lapse counter are live boxes as wide as their widest words', () => {
  assert.match(js, /const out = liveText\('output', 'pzi-v', \[w\.min, \(w\.min \+ w\.max\) \/ 2, w\.max, v0\]\.map\(fmtV\)\);/);
  assert.match(js, /const paint = \(x\) => \{ paintRange\(input, frac\(x\)\); out\.set\(fmtV\(x\)\); \};/);
  assert.match(js, /w\.unit \? out\.el : null\);/);
  assert.doesNotMatch(js, /out\.textContent/, 'the value is never written to the box itself');
  assert.match(js, /liveText\('span', 'pzl-t', \[lapseText\(s, 0, s\.days, false\), lapseText\(s, s\.days, s\.days, false\), lapseText\(s, s\.days, s\.days, true\)\]/);
  assert.match(js, /el\.querySelector\('\.pzl-t > \.pzv-t'\)/);
  assert.match(js, /s\.lapse && i > 0 \? lapseRow\(s\) : null/);
});

test('the box stacks the hidden copy and the live words in one grid cell, tabular, never wrapping', () => {
  const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  assert.match(rule('.pzv'), /display: grid; font-variant-numeric: tabular-nums;/);
  assert.match(rule('.pzv > .pzv-s, .pzv > .pzv-t'), /grid-area: 1 \/ 1; white-space: nowrap;/);
  assert.match(rule('.pzv > .pzv-s'), /visibility: hidden;/);
  assert.match(rule('.pzi-v'), /text-align: right;/, 'the value stays at the right of its row');
});

test('a what-if slider of either kind holds the cards: the plan and the fit stay as the slide came in', () => {
  assert.match(js, /let handOn = false;/);
  assert.match(js, /input\.addEventListener\('input', \(\) => \{\s*handOn = true;[^\n]*\n\s*paint\(\+input\.value\);\s*if \(w\.tool\) \{ ui\?\.tools\.option/, 'set before the instrument\'s option, which leaves liveOff alone');
  assert.match(js, /const readingsOnly = \(\) => liveOff \|\| handOn \|\| lapseOn \|\|/);
  assert.match(js, /const cardsStill = \(\) => [^\n]*\(liveOff \|\| handOn \|\| !!slides\[want\]\?\.lapse\)/);
  assert.match(js, /stopLapse\(\); procStop\(\); abSlow\(\); handOn = false;/, 'cleared with the next slide');
  assert.match(js, /liveOff = false; handOn = false;/, 'and when the talk is closed');
  // (Where the cards are laid out again for a reading, the words keep the plan: the phone's cap and the wide pair's centring.)
  assert.match(js, /if \(held && \(held\.shut \|\| gone \|\| readingsOnly\(\)\)\)/);
  assert.match(js, /if \(lockKey && shiftLock\?\.key === lockKey && readingsOnly\(\)\) shift = shiftLock\.v;/);
  assert.match(js, /if \(ui && cardsStill\(\)\) \{ fitCards\(ui\.data\); return; \}/);
  assert.match(js, /if \(cardsStill\(\)\) fitCards\(ui\.data\); else layout\(\);/);
});
