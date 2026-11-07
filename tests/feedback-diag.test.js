// Laptop-heat quick item Q3: Send feedback adds the page's frame rate and the browser's backdrop blurs on screen to the email draft the person
// reads and sends themselves, so a heat report arrives with the two numbers that say where it comes from (feedback-diag.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { framesLine, feedbackDiagnostics } from '../src/ui/feedback-diag.js';
import { blurText } from '../src/ui/blur-gauge.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the frames line says the page\'s frame rate and its busiest surfaces', () => {
  assert.equal(framesLine({ fps: 60, surfaces: { stage: 60, shown: 4, dock: 2, idle: 0, labels: 10 } }), 'Frames: 60 a second (stage 60, labels 10, shown 4, dock 2 callbacks a second)');
  assert.equal(framesLine({ fps: 0, surfaces: {} }), 'Frames: 0 a second');
  assert.equal(framesLine(null), 'Frames: not measured');
  assert.equal(framesLine({ surfaces: {} }), 'Frames: not measured');
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, 12 - i]));
  assert.equal(framesLine({ fps: 59, surfaces: many }).split(',').length, 6, 'six surfaces at most');
});

test('the blur text lists at most `limit` blurs and says how many more', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ name: `div.c${i}`, area: 1, share: 0.01, why: null, kept: '' }));
  const t = blurText(rows, 3, 8);
  assert.equal(t.split('\n').length, 1 + 8 + 1);
  assert.match(t, /and 4 smaller/);
  assert.equal(blurText(rows, 3).split('\n').length, 1 + 12, 'twenty by default');
});

// A page of stubs, as blur-gauge.test.js has.
const el = (cls, own = {}, box = { left: 0, top: 0, width: 100, height: 50 }) => {
  const e = { tagName: 'DIV', id: '', className: cls, nodeType: 1, parentElement: null, getBoundingClientRect: () => box, getClientRects: () => [1] };
  e.style = { backdropFilter: 'none', visibility: 'visible', display: 'block', opacity: '1', content: 'none', ...own };
  return e;
};
const page = (els, hosted = 0) => ({
  root: { querySelectorAll: (sel) => (sel === '*' ? els : new Array(hosted)) },
  win: { innerWidth: 1000, innerHeight: 800, getComputedStyle: (e, ps) => (ps ? { backdropFilter: 'none', content: 'none' } : e.style) },
});

test('the draft gets the frames line and the blurs the browser draws now, each with its glass\'s reason', () => {
  const card = el('pz-data', { backdropFilter: 'blur(16px)' }, { left: 0, top: 0, width: 400, height: 300 });
  const { root, win } = page([card], 5);
  const lines = feedbackDiagnostics({ perf: () => ({ fps: 60, surfaces: { stage: 60 } }), blurWhy: () => 'crosses a label, a leader or a callout', root, win });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Frames: 60 a second \(stage 60/);
  assert.match(lines[1], /Backdrop blurs the browser draws now \(CSS backdrop-filter, shown, 1, together 15\.0 % of the window\); glasses drawn in the figure's canvas instead: 5/);
  assert.match(lines[1], /div\.pz-data 15\.0 %: crosses a label, a leader or a callout/);
});

test('a failure in either reading leaves the draft as it was', () => {
  const { root, win } = page([]);
  assert.deepEqual(feedbackDiagnostics({ perf: () => { throw new Error('no'); }, blurWhy: null, root: { querySelectorAll: () => { throw new Error('no'); } }, win }), []);
  const lines = feedbackDiagnostics({ perf: () => { throw new Error('no'); }, blurWhy: null, root, win });
  assert.equal(lines.length, 1, 'the blurs are still read');
  assert.match(lines[0], /none\)/);
  assert.deepEqual(feedbackDiagnostics({ root: undefined, win: undefined }), ['Frames: not measured'], 'no page and no perf: nothing thrown');
});

test('Send feedback puts them in the draft, and the privacy page says so', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /import \{ feedbackDiagnostics \} from '\.\/feedback-diag\.js/);
  assert.match(main, /\.\.\.feedbackDiagnostics\(\{ perf: framePerf, blurWhy: \(el\) => stage\.blurWhy\?\.\(el\) \?\? null \}\), \.\.\.reportLines\(\)\]\.join\('\\n'\);/);
  assert.match(main, /opens a draft in your own email app with your device, screen size, how fast the page is running, which blurs the browser is drawing, a short list of recent errors and page reloads, and a link to the view you were on\. Nothing is sent unless you send that email yourself\./);
});
