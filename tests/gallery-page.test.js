// The gallery page's pure helpers (src/ui/gallery/page.js): what an address names, the address that opens a specimen, a shot's file name.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAddress, linkFor, shotName, deviceOf } from '../src/ui/gallery/page.js';
import { byId } from '../src/ui/gallery/catalog.js';

test('an address names a specimen and a look, and nothing it does not know', () => {
  assert.deepEqual(readAddress('?gallery&look=navy', '#doppler/pv-color'), { look: 'navy', id: 'doppler/pv-color' });
  assert.deepEqual(readAddress('?gallery&look=neon', '#nope/none'), { look: null, id: null });
  assert.deepEqual(readAddress('?gallery', ''), { look: null, id: null });
  assert.equal(readAddress('', '#doppler%2Fpv-color?look=dark').id, 'doppler/pv-color');
});

test('the link for a specimen keeps the gallery switch and drops a deck link', () => {
  const loc = { pathname: '/preview/', search: '?gallery&script=hvpg&slide=3' };
  assert.equal(linkFor(loc, 'doppler/pv-color', 'dark'), '/preview/?gallery&look=dark#doppler/pv-color');
  assert.equal(linkFor({ pathname: '/preview/', search: '?gallery&look=navy' }, null, null), '/preview/?gallery');
  const back = readAddress(linkFor(loc, 'criteria/live', 'black').split('#')[0].replace('/preview/', ''), '#criteria/live');
  assert.deepEqual(back, { look: 'black', id: 'criteria/live' });
});

test('a shot is named for its section, specimen, state, look and device', () => {
  assert.equal(shotName(byId['doppler/pv-color'], 'navy', 'iphone'), 'teaching-cards/doppler/pv-color/default__navy__iphone');
  assert.equal(shotName({ ...byId['doppler/pv-color'], state: 'late' }, 'light', 'mac'), 'teaching-cards/doppler/pv-color/late__light__mac');
});

test('the device is the nearest size the plan shoots at', () => {
  assert.equal(deviceOf(1440, 900), 'mac');
  assert.equal(deviceOf(390, 844), 'iphone');
  assert.equal(deviceOf(844, 390), 'iphone-landscape');
  assert.equal(deviceOf(1180, 820), 'ipad');
  assert.equal(deviceOf(820, 1180), 'ipad-portrait');
});
