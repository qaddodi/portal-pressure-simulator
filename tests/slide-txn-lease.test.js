// R02: a counted lease whose release works once, so a cut move cannot give back another move's hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createLease } = await import('../src/ui/slide-txn.js');

test('onFirst runs on the first take only and onLast on the last release only', () => {
  const log = [];
  const l = createLease(() => log.push('on'), () => log.push('off'));
  const a = l.take(), b = l.take();
  assert.deepEqual(log, ['on']);
  assert.equal(l.count(), 2);
  a();
  assert.deepEqual(log, ['on']);
  b();
  assert.deepEqual(log, ['on', 'off']);
  assert.equal(l.count(), 0);
});

test('a release called twice gives back once: a stale owner cannot release a newer owner\'s hold', () => {
  const log = [];
  const l = createLease(() => log.push('on'), () => log.push('off'));
  const stale = l.take();
  const fresh = l.take();
  stale(); stale(); stale();
  assert.equal(l.count(), 1, 'the newer hold stands');
  assert.deepEqual(log, ['on']);
  assert.equal(stale(), false);
  fresh();
  assert.deepEqual(log, ['on', 'off']);
});

test('a throwing callback does not unbalance the count', () => {
  const l = createLease(() => { throw new Error('x'); }, () => { throw new Error('y'); });
  const r = l.take();
  assert.equal(l.count(), 1);
  r();
  assert.equal(l.count(), 0);
  l.take()();
  assert.equal(l.count(), 0);
});

test('the hold can be taken again after it was fully released', () => {
  const log = [];
  const l = createLease(() => log.push('on'), () => log.push('off'));
  l.take()(); l.take()();
  assert.deepEqual(log, ['on', 'off', 'on', 'off']);
});
