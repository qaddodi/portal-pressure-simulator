// The motion budget (src/ui/motion-budget.js; merged GPU plan, item 1): its caller names, upload sizes and report line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { callerOf, bytesOf, budgetText, motionBudget } from '../src/ui/motion-budget.js';

test('a read is named by the first stack frame outside the budget itself (Chrome and Safari stacks)', () => {
  const chrome = 'Error\n    at read (http://x/src/ui/motion-budget.js?v=1:20:5)\n    at window.getComputedStyle (http://x/src/ui/motion-budget.js?v=1:40:9)\n    at frostWhy (http://x/src/ui/stage.js?v=abc:1200:14)\n    at hostDraw (http://x/src/ui/glass-gl.js?v=d:90:3)';
  assert.equal(callerOf(chrome), 'frostWhy stage.js:1200');
  const safari = 'read@http://x/src/ui/motion-budget.js:20:5\noverflowOf@http://x/src/ui/presenter.js?v=9:812:30\n@http://x/src/ui/presenter.js:900:2';
  assert.equal(callerOf(safari), 'overflowOf presenter.js:812');
  assert.equal(callerOf('Error\n    at http://x/src/ui/util.js:13:7'), '(anonymous) util.js:13');
  assert.equal(callerOf(''), '?');
});

test('upload bytes: buffer data by length or size, textures by data, image or width × height', () => {
  assert.equal(bytesOf([0x8892, new Float32Array(16), 0x88e4], false), 64);
  assert.equal(bytesOf([0x8892, 1024, 0x88e4], false), 1024);
  assert.equal(bytesOf([0xde1, 0, 0x1908, 0x1908, 0x1401, { width: 10, height: 20 }], true), 800);
  assert.equal(bytesOf([0xde1, 0, 0x1908, 8, 4, 0, 0x1908, 0x1401, null], true), 128);
  assert.equal(bytesOf([0xde1, 0, 0, 0, 4, 2, 0x1908, 0x1401, new Uint8Array(32)], true), 32);
});

test('the report line names the goal and the top readers and writes', () => {
  const t = budgetText({ reads: 12, writes: 3, made: 1, lost: 0, live: 2, upload: 4096, uploads: 2, readers: [['frostWhy stage.js:1200', 9]], written: [['svg:path d', 3]] });
  assert.match(t, /goal 0 \/ 0 \/ 0/);
  assert.match(t, /12 style\+layout reads, 3 DOM writes, 1 contexts made \(0 lost, 2 live\), 4 KB uploaded in 2 calls/);
  assert.match(t, /readers: frostWhy stage\.js:1200 9/);
  assert.match(t, /written: svg:path d 3/);
  assert.equal(budgetText(null), '');
});

test('off by default: nothing is installed in a page that did not ask, and a window still reads zeros', () => {
  assert.equal(motionBudget.on(), false);
  const w = motionBudget.start('x'), r = motionBudget.stop(w);
  assert.equal(r.reads + r.writes + r.made + r.upload, 0);
});

test('every measured motion has a ceiling, and the checks run one as a warning on a runner they already use', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const caps = JSON.parse(read('tests/motion-budget.json'));
  const runner = read('scripts/motion-budget.mjs');
  const names = [...runner.matchAll(/\{ name: '([^']+)', query:/g)].map((m) => m[1]);
  assert.ok(names.length >= 4);
  for (const n of names) {
    const c = caps.iphone[n];
    assert.ok(c, `${n}: a ceiling`);
    for (const k of ['reads', 'writes', 'made']) assert.ok(Number.isInteger(c[k]) && c[k] >= 0, `${n} ${k}`);
  }
});

test('R02: each WebGL call is decoded by its own overload', async () => {
  const { decodeCall, texelBytes } = await import('../src/ui/motion-budget.js');
  assert.deepEqual(decodeCall('bufferSubData', [0x8892, 0, new Float32Array(16)]), { kind: 'upload', bytes: 64 }, 'the data, not the byte offset');
  assert.equal(decodeCall('bufferSubData', [0x8892, 256, new Float32Array(16), 4, 8]).bytes, 32, 'srcOffset and length are elements');
  assert.equal(decodeCall('bufferData', [0x8892, new Float32Array(16), 0x88e4, 0, 4]).bytes, 16);
  assert.equal(texelBytes(0x1908, 0x140b), 8, 'RGBA half float');
  assert.equal(decodeCall('texImage2D', [0xde1, 0, 0x881a, 8, 4, 0, 0x1908, 0x140b, null]).kind, 'alloc');
  assert.deepEqual(decodeCall('renderbufferStorageMultisample', [0x8d41, 4, 0x8058, 10, 10]), { kind: 'alloc', bytes: 1600 });
  assert.equal(decodeCall('blitFramebuffer', [0, 0, 10, 10, 0, 0, 10, 20]).kind, 'copy');
});
