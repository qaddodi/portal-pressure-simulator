// Share links (#s=) are hardened: no prototype keys, only a known patient, view, selection and a finite camera (review item 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShare, cleanShare } from '../src/ui/share-link.js';
import { deepMerge, sanitizeParams, defaultParams } from '../src/engine/scenario.js';

const enc = (json) => Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('a link with __proto__ or constructor keys cannot reach Object.prototype', () => {
  const s = parseShare(enc('{"v":1,"preset":"healthy","params":{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"cirrhosis":0.4,"drugs":{"__proto__":{"polluted":3}}}}'));
  assert.ok(s);
  const merged = deepMerge(defaultParams(), s.params);
  sanitizeParams(merged);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(merged.cirrhosis, 0.4);
  // deepMerge alone (a payload built in code, not read through parseShare) skips the keys too.
  const raw = JSON.parse('{"__proto__":{"polluted":4},"drugs":{"__proto__":{"polluted":5}}}');
  deepMerge(defaultParams(), raw);
  assert.equal({}.polluted, undefined);
});

test('view, selection, camera and patient are checked against what the app can show', () => {
  const ids = ['healthy', 'cirr-decomp'];
  const c = cleanShare({ preset: 'nope', view: 'sideways', sel: { type: 'evil', id: 'x' }, cam: { k: NaN, x: 0, y: 0 }, params: 'x' }, ids);
  assert.deepEqual(c, { preset: 'healthy' });
  assert.deepEqual(cleanShare({ cam: { k: 1e9, x: 0, y: 0 } }, ids), { preset: 'healthy' });
  assert.deepEqual(cleanShare({ cam: { k: 1, x: Infinity, y: 0 } }, ids), { preset: 'healthy' });
  assert.equal(parseShare('!!!'), null);
  assert.equal(parseShare(enc('[1,2]')), null);
  assert.equal(cleanShare(null), null);
});

test('a link the app wrote itself passes unchanged', () => {
  const ids = ['healthy', 'cirr-decomp'];
  const payload = { v: 1, preset: 'cirr-decomp', params: { cirrhosis: 0.7, drugs: { nsbb: true } }, view: 'circuit', sel: { type: 'edge', id: 'PV_TRUNK' }, cam: { k: 2.4, x: -310.5, y: 120 } };
  const back = cleanShare(parseShare(enc(JSON.stringify(payload))), ids);
  assert.deepEqual(back, { preset: 'cirr-decomp', params: payload.params, view: 'circuit', sel: payload.sel, cam: payload.cam });
  // A lobule selection carries no id but is kept.
  assert.deepEqual(cleanShare({ preset: 'healthy', sel: { type: 'lobule', lobe: 'R', at: [1, 2] } }, ids).sel, { type: 'lobule', lobe: 'R', at: [1, 2] });
  // Before the patient list has loaded any well-formed id is accepted (the engine knows its own presets).
  assert.equal(cleanShare({ preset: 'cirr-decomp' }).preset, 'cirr-decomp');
});
