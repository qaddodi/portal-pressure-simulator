// A shortcut is named with the device's own modifier: ⌘ on a Mac, Ctrl elsewhere (play-test, Mac, 16 Nov 2026: the Search button said "Ctrl K").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApple, keyLabel, modKey } from '../src/ui/platform-keys.js';

const mac = { platform: 'MacIntel' }, win = { platform: 'Win32' }, linux = { platform: 'Linux x86_64' }, ipad = { platform: 'iPad' }, uaMac = { userAgentData: { platform: 'macOS' }, platform: '' };

test('a Mac, an iPad and an iPhone read ⌘; Windows and Linux read Ctrl', () => {
  for (const n of [mac, ipad, { platform: 'iPhone' }, uaMac]) assert.equal(modKey(n), '⌘', JSON.stringify(n));
  for (const n of [win, linux, {}]) assert.equal(modKey(n), 'Ctrl', JSON.stringify(n));
  assert.equal(isApple(null), false);
});

test('every Ctrl/⌘ label is written for the device, and others are left alone', () => {
  assert.equal(keyLabel('Ctrl/⌘ K', mac), '⌘ K');
  assert.equal(keyLabel('Ctrl/⌘ K', win), 'Ctrl K');
  assert.equal(keyLabel('Ctrl/⌘ + / − / 0', mac), '⌘ + / − / 0');
  assert.equal(keyLabel('Shift ← →', mac), 'Shift ← →');
});
