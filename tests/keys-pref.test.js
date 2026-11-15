// Settings > Keyboard shortcuts (SHELL-8): off holds back every plain key and leaves Esc and Ctrl or Cmd with a key.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const { keysOn, setKeysOn, keyHeldBack } = await import('../src/ui/keys-pref.js');
const key = (k, o = {}) => ({ key: k, ctrlKey: false, metaKey: false, ...o });

test('on by default: nothing is held back', () => {
  assert.equal(keysOn(), true);
  for (const k of ['a', ' ', '1', '/', '?', '[']) assert.equal(keyHeldBack(key(k)), false);
});

test('off holds back plain keys, never Esc or Ctrl/Cmd with a key; the choice is remembered', () => {
  assert.equal(setKeysOn(false), false);
  assert.equal(store.get('pps.keys'), '0');
  for (const k of ['a', 'l', ' ', '1', '/', '?', '.', '[']) assert.equal(keyHeldBack(key(k)), true, k);
  assert.equal(keyHeldBack(key('Escape')), false);
  assert.equal(keyHeldBack(key('k', { ctrlKey: true })), false);
  assert.equal(keyHeldBack(key('z', { metaKey: true })), false);
  setKeysOn(true);
  assert.equal(store.get('pps.keys'), '1');
  assert.equal(keyHeldBack(key('a')), false);
});
