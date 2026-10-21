import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maskRegionIn, maskSlot, fillMaskHead } from '../src/ui/plate-copy.js';
import { gapLine } from '../src/ui/perf-readout.js';
import { gpuProbe } from '../src/ui/gpu-probe.js';

// Safari makes a mask's layer as big as everything it covers at the picture's scale, however little of it a strip shows: zoomed
// in, each strip of the view's sharp picture rebuilt layers of up to 16 million pixels, and its read stalled 70–130 ms
// (Mohammad's ?perf readout, Mac Safari, 21 Oct). Each strip's copy cuts every mask's region to the strip and a margin.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

test("a mask's region is cut to the strip, in the user space of each element using it", () => {
  assert.deepEqual(maskRegionIn([320, 420, 800, 660], [500, 500, 100, 50], [I]), [500, 500, 100, 50]);
  // (Never grown past its own region.)
  assert.deepEqual(maskRegionIn([320, 420, 800, 660], [300, 400, 100, 50], [I]), [320, 420, 80, 30]);
  // A user moved and scaled (the liver's shrink, the bowel on the fluid): the strip mapped into its own coordinates.
  const half = { a: 0.5, b: 0, c: 0, d: 0.5, e: -10, f: 4 };
  assert.deepEqual(maskRegionIn([0, 0, 1000, 1000], [100, 200, 40, 20], [half]), [40, 104, 20, 10]);
  // Two users: the region covers the strip for both.
  assert.deepEqual(maskRegionIn([0, 0, 1000, 1000], [100, 100, 10, 10], [I, { ...I, e: 50 }]), [100, 100, 60, 10]);
  // A strip the region misses: an empty region (nothing of the masked shapes shows there).
  assert.deepEqual(maskRegionIn([0, 0, 100, 100], [500, 500, 10, 10], [I]).slice(2), [0, 0]);
  // A user whose transform is unknown: the whole region stays, as before.
  assert.deepEqual(maskRegionIn([0, 0, 100, 100], [10, 10, 5, 5], [I, null]), [0, 0, 100, 100]);
  assert.deepEqual(maskRegionIn([0, 0, 100, 100], [10, 10, 5, 5], []), [0, 0, 100, 100]);
});

test("the strip's numbers go into the defs' placeholders", () => {
  const head = `<mask id="a" x="${maskSlot(0, 'x')}" y="${maskSlot(0, 'y')}" width="${maskSlot(0, 'w')}" height="${maskSlot(0, 'h')}"/><mask id="b" x="${maskSlot(1, 'x')}" y="${maskSlot(1, 'y')}" width="${maskSlot(1, 'w')}" height="${maskSlot(1, 'h')}"/>`;
  assert.equal(fillMaskHead(head, [[1.23456, 2, 3, 4], [5, 6, 0, 0]]), '<mask id="a" x="1.235" y="2" width="3" height="4"/><mask id="b" x="5" y="6" width="0" height="0"/>');
});

test("only the view's strips get cut masks, with a 4 px margin; the whole plate and the gut picture keep the full ones", () => {
  assert.match(stage, /try \{ out = \(cull \? maskHead\(plateCopy, rect, W\) : plateCopy\.head\) \+ plateCopy\.parts\.map/);
  assert.match(stage, /const g = 4 \* rect\[2\] \/ W, band = \[rect\[0\] - g, rect\[1\] - g, rect\[2\] \+ 2 \* g, rect\[3\] \+ 2 \* g\];/);
  // The users' matrices are read as the copy is made, from the page in the same state; the copy's own masks only.
  const build = stage.slice(stage.indexOf('function plateBuild('), stage.indexOf('const CULL_TAGS'));
  assert.match(build, /\{ const lm = \[g, \.\.\.g\.querySelectorAll\('\[mask\]'\)\], cm = \[c, \.\.\.c\.querySelectorAll\('\[mask\]'\)\];/, 'found while the copy and the page still match');
  assert.match(build, /const refs = maskRefs\.filter\(\(\[ce\]\) => parts\.some\(\(p\) => p\.contains\(ce\)\)\);/);
  assert.match(build, /inv && k \? inv\.multiply\(k\)\.inverse\(\) : null/);
  assert.match(build, /return \{ key, seq: plateSeq, head, parts,[^\n]*maskT \};/, 'the plain head stays for the whole plate and the gut picture');
});

test('the ?perf readout splits the rest of the page into page busy and waiting, and notes the organ SVGs read', () => {
  assert.equal(gapLine({ at: 10, dt: 80, parts: { 'organ picture: read': 20 }, busy: 50, notes: { 'organ SVG read': [2, 640.4] } }),
    '  +10 ms: frame took 80 ms (organ picture: read 20, page busy 30, waiting (GPU/screen) 30); organ SVG read ×2 (640 KB)');
  // (The heartbeat can overcount by a beat: never more page work than the frame had left.)
  assert.equal(gapLine({ at: 0, dt: 40, parts: {}, busy: 55 }), '  +0 ms: frame took 40 ms (page busy 40, waiting (GPU/screen) 0)');
  try {
    gpuProbe.on = true; gpuProbe.takeNotes();
    gpuProbe.note('x', 2); gpuProbe.note('x', 3);
    assert.deepEqual(gpuProbe.takeNotes(), { x: [2, 5] });
  } finally { gpuProbe.on = false; gpuProbe.takeNotes(); }
  gpuProbe.note('y', 1);
  assert.deepEqual(gpuProbe.takeNotes(), {}, 'off: nothing kept');
  const src = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  assert.match(src, /beatT = cur \? setTimeout\(beat, 0\) : 0;/, 'the heartbeat runs only while a window is open');
  assert.doesNotMatch(src, /MessageChannel/, 'a timer, never a message loop that keeps the main thread busy');
  assert.match(stage, /gpuProbe\.note\('organ SVG read', markup\.length \/ 1024\);/);
});

test("the credit's art grid skips shapes wholly off it", () => {
  const src = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(src, /const g = 2 \* w \* Math\.max\(Math\.hypot\(m\.a, m\.b\), Math\.hypot\(m\.c, m\.d\)\) \+ CELL;\n\s+if \(r\.right \+ g < wr\.left \|\| r\.left - g > wr\.left \+ cols \* CELL \|\| r\.bottom \+ g < wr\.top \|\| r\.top - g > wr\.top \+ rows \* CELL\) continue;/);
});

test("each strip carries only the definitions the organs use, through any chain of them", async () => {
  const { refsIn } = await import('../src/ui/plate-copy.js');
  // (Serialized styles quote their urls, and the quotes come out as entities.)
  assert.deepEqual(refsIn('fill="url(&quot;#esoFadeG&quot;)" clip-path="url(#clip-liver)" href="#q" xlink:href="#r"'), ['esoFadeG', 'clip-liver', 'q', 'r']);
  const { pruneDefs } = await import('../src/ui/plate-copy.js');
  const kid = (id, html) => { const k = { id, outerHTML: html, remove() { kids.splice(kids.indexOf(k), 1); } }; return k; };
  const kids = [kid('a', '<mask id="a"><rect fill="url(#g1)"/></mask>'), kid('g1', '<linearGradient id="g1" href="#g2"/>'), kid('g2', '<linearGradient id="g2"/>'), kid('vessel', '<linearGradient id="vessel"/>'), kid('', '<style/>')];
  const keep = pruneDefs({ get children() { return kids; } }, '<g mask="url(&quot;#a&quot;)"/>');
  assert.deepEqual([...keep].sort(), ['a', 'g1', 'g2']);
  assert.deepEqual(kids.map((k) => k.id), ['a', 'g1', 'g2', ''], 'the unused one goes, the rest stay');
  assert.match(stage, /pruneDefs\(dc, parts\.map\(\(c\) => ser\.serializeToString\(c\)\)\.join\(''\)\);\n\s+const head = ser\.serializeToString\(dc\);/, 'pruned before the head is written, for every picture made from the copy');
});
