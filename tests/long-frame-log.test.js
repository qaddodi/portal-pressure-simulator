import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { longFramesText, inputsText } from '../src/ui/perf-readout.js';
import { createFrameRecorder } from '../src/ui/frame-stats.js';
import { createInputLatency } from '../src/ui/input-latency.js';

// The ?perf long-frame log and the slowest inputs (recs P4, R2): "it feels laggy on slide 7" becomes a line to paste.

test('no long frame reads as none, with the threshold', () => {
  assert.equal(longFramesText([]), 'Long frames (over 50 ms): none');
});

test('the log lists the newest frames with their surfaces, phase and the time the scheduler does not account for', () => {
  const r = createFrameRecorder();
  for (let i = 0; i < 20; i++) r.add({ now: 1000 * (i + 1), gap: 60 + i, script: 30, parts: [['lobule-zoom', 'early', 20], ['glass', 'final', 10]] });
  const text = longFramesText(r.long, 4);
  const lines = text.split('\n');
  assert.equal(lines[0], 'Long frames (over 50 ms; the newest 4 of 20, seconds since the page opened):');
  assert.equal(lines.length, 5);
  assert.match(lines[4], /^ {2}20\.0 s: 79 ms between frames, script 30 ms \(early 20 \/ final 10\): lobule-zoom early 20, glass final 10; outside the scheduler 49 ms$/);
});

test('the inputs line gives the counts, the percentiles and the slowest with what was pressed', () => {
  let t = 0;
  const asks = [];
  let cb;
  const il = createInputLatency({ now: () => t, listen: (type, fn) => { if (type === 'click') cb = fn; }, watch: (c) => ({ start() { asks.mut = c; }, stop() {} }), ask: (fn) => asks.push(fn), describe: (x) => x });
  assert.match(inputsText(il.api), /none answered yet$/);
  for (const [what, ms] of [['button#a', 20], ['button#menu', 180], ['button#b', 40]]) {
    cb({ detail: 1, timeStamp: t, target: what });
    asks.mut([{ target: 'x' }]);
    t += ms; asks.splice(0).forEach((f) => f());
  }
  const lines = inputsText(il.api).split('\n');
  assert.match(lines[0], /^Inputs \(a tap, press or key to the frame the page first changed; the last 3 of 3\): p50 40, p95 180, worst 180 ms$/);
  assert.equal(lines[1], '  slowest: click button#menu 180 ms, click button#b 40 ms, click button#a 20 ms');
  assert.equal(inputsText(null), 'Inputs (a tap, press or key to the frame the page first changed): none answered yet');
});

test('the readout watches frames through the scheduler and writes its panel only outside a gesture window', () => {
  const js = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  assert.match(js, /watchFrames\(frameLog\.add\)/, 'the log is fed by the scheduler, not a loop of its own');
  assert.ok(!/requestAnimationFrame\(/.test(js.replace(/\/\/.*$/gm, '').replace(/requestAnimationFrame\(tick\)/g, '')), 'no new frame loop');
  assert.match(js, /setInterval\(\(\) => \{ if \(!cur && !document\.hidden && !folded\) restPass\(writeLog\); \}, 1000\)/, 'never written during a gesture window, nor while hidden or folded');
  assert.match(js, /logText\(\)\]\.join/, 'the Copy text carries the log and the inputs');
});
