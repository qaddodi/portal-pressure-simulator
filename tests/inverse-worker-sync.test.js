// A fit cancelled in the middle of a round must not leave the worker holding patients the page never received (review E0, 15 Nov 2026): the same
// readings gave "cirrhosis 62%, 2 fit" one time and "cirrhosis 55%, 5 fit" another, both "fitted". The worker sends what it ran but has not sent
// at the start of the next request, and the page keeps any patient it is sent whichever request it answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/engine/portal/inverse-library.js';

const got = [];
globalThis.self = { postMessage: (m) => got.push(m) };
await import('../src/ui/inverse-worker.js');
const R = { whvp: 18, fhvp: 6, ra: 5, lsm: 28, plt: 95, spleen: 14, varix: 1 };
const until = (fn, ms = 120000) => new Promise((resolve, reject) => { const t0 = Date.now(), t = setInterval(() => { if (fn()) { clearInterval(t); resolve(); } else if (Date.now() - t0 > ms) { clearInterval(t); reject(new Error('timeout')); } }, 100); });

test('patients run before a cancel reach the page with the next request, so the two tables agree', { timeout: 200000 }, async () => {
  globalThis.self.onmessage({ data: { t: 'refine', seq: 1, readings: R } });
  await new Promise((r) => setTimeout(r, 60));   // (a patient or two into round 1: it has not posted yet. 400 ms was that before the grid's finer one-lesion severities (rounds are shorter now, and one had posted by then))
  globalThis.self.onmessage({ data: { t: 'cancel' } });
  assert.equal(got.filter((m) => m.t === 'points' && m.seq === 1).length, 0, 'nothing was sent before the cancel');
  globalThis.self.onmessage({ data: { t: 'refine', seq: 2, readings: R } });
  await until(() => got.some((m) => m.seq === 2 && m.done));
  const page = new Set();
  for (const m of got) if (m.t === 'points' && m.seq === 2) for (const r of m.rows) page.add(r[0] + ':' + r[1].join(',') + JSON.stringify(r[3] || {}));
  globalThis.self.onmessage({ data: { t: 'state' } });
  const st = got.find((m) => m.t === 'state');
  assert.equal(st.unsent, 0, 'nothing is left unsent');
  const first = got.find((m) => m.seq === 2 && m.round === 0);
  assert.ok(first && first.rows.length >= 1, 'the cancelled request\'s patients came first');
  assert.ok(page.size + LIBRARY.length === st.held, `the page has every patient the worker holds (${page.size} + ${LIBRARY.length} against ${st.held})`);
});
