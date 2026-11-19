// The kill ledger: every tab the browser ended on this device, with the page's own memory estimate at its last moment, kept so the envelope can be calibrated (bible review 19 Nov 2026, 5.5 gap 6).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLedger, addKill, ledgerLines, KILLS_KEY, KILLS_MAX } from '../src/ui/kill-ledger.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, m }; };
const last = (o = {}) => ({ where: 'HVPG deck, slide 5', mb: 301, peak: 318, env: '320 MB (phone)', s: 142, ...o });

test('a kill is kept with where, the estimate then, its highest and how long the page had been open; the oldest go past the cap', () => {
  const st = mem();
  addKill(st, last(), { at: '2026-11-19T10:20:30.000Z', device: 'phone' });
  const l = readLedger(st);
  assert.deepEqual(l[0], { at: '2026-11-19T10:20:30.000Z', where: 'HVPG deck, slide 5', mb: 301, peak: 318, env: '320 MB (phone)', s: 142, device: 'phone' });
  for (let i = 0; i < KILLS_MAX + 5; i++) addKill(st, last({ where: `slide ${i}` }));
  const all = readLedger(st);
  assert.equal(all.length, KILLS_MAX); assert.equal(all.at(-1).where, `slide ${KILLS_MAX + 4}`);
});

test('bad input leaves the ledger alone: no last moment, a last moment without a place, blocked or garbled storage', () => {
  const st = mem();
  assert.deepEqual(addKill(st, null), []); assert.deepEqual(addKill(st, { mb: 3 }), []);
  st.setItem(KILLS_KEY, '{not json'); assert.deepEqual(readLedger(st), []);
  st.setItem(KILLS_KEY, '{"a":1}'); assert.deepEqual(readLedger(st), []);
  assert.deepEqual(readLedger(null), []);
  assert.doesNotThrow(() => addKill({ getItem: () => '[]', setItem: () => { throw new Error('full'); } }, last()));
});

test('the Phone check prints the ledger, or says none ended', () => {
  assert.match(ledgerLines([])[0], /no tab ended on this device/);
  const l = ledgerLines([{ at: '2026-11-19T10:20:30.000Z', where: 'slide 5', mb: 301, peak: 318, env: '320 MB (phone)', s: 142, device: 'phone' }, { at: '2026-11-19T11:00:00.000Z', where: 'slide 9', mb: 250, peak: 300, env: '320 MB (phone)', s: 60, device: 'phone' }]);
  assert.match(l[0], /KILL LEDGER \(2 tabs ended.*lowest 250 MB, highest 301 MB/);
  assert.match(l[1], /2026-11-19 10:20 {2}301 MB \(highest 318\) of 320 MB \(phone\), 142 s after opening, at slide 5 \[phone\]/);
});
