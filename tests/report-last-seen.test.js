// After a memory kill the next page says where the last one was (report.js, 18 Nov 2026: the iPhone's tab was killed on a deck's slide change and the report only said "a reload").
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.window = globalThis;
globalThis.sessionStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

test('a page that follows a kill reports the slide and the GPU estimate the last page wrote last', async () => {
  mem.set('pps.alive', '1');
  mem.set('pps.last', JSON.stringify({ where: 'hvpg slide 5', mb: 289, peak: 301, env: '320 MB (phone)', s: 412 }));
  const { startReport, reportLines } = await import('../src/ui/report.js');
  startReport(() => 'anatomic');
  const text = reportLines().join('\n');
  assert.match(text, /last-seen hvpg slide 5, GPU estimate 289 MB \(highest 301\) of 320 MB \(phone\), 412 s after it opened/);
  assert.match(text, /\(this page followed one\)/);
});

test('a clean page has no last-seen line', async () => {
  mem.clear();
  const { startReport, reportLines } = await import('../src/ui/report.js?clean');
  startReport(() => 'anatomic');
  assert.ok(!reportLines().join('\n').includes('last-seen'));
});
