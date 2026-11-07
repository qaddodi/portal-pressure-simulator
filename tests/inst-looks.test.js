// The dock's pressure dial's looks in code (chart-looks-in-code plan WP11b): the table resolves in every look and view with no missing token,
// the cascade's winners are as app.css had them, the Circuit view re-colours the dial in the dark looks, and every piece instruments.js builds
// names a look that exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { tokensOfLook } from '../src/ui/theme-tokens.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'dock' }), { theme: 'light', dark: false, palette: 'navy', view: 'anatomic', ...over });
const P = (k, st = {}, c = ctx()) => resolveProps(LOOKS[k], c, st, {});
const KEYS = Object.keys(LOOKS).filter((k) => k.startsWith('inst.'));
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('each dial entry resolves in every look, view and rating with no missing token', () => {
  assert.ok(KEYS.length >= 12);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const view of ['anatomic', 'circuit']) for (const k of KEYS) for (const sev of [undefined, 'ok', 'caution', 'danger']) {
    const p = P(k, { sev }, ctx({ theme, palette, view, dark: theme === 'dark' }));
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}/${view}`);
  }
});
test('the ratings colour the ring, the knob and the word as app.css had them', () => {
  const T = tokensOfLook('light');
  assert.equal(P('inst.dial.band', { sev: 'ok' }).stroke, T.ok);
  assert.equal(P('inst.dial.band', { sev: 'danger' }).stroke, T.danger);
  assert.equal(P('inst.dial.band', { sev: 'caution' }).opacity, 0.2);
  assert.equal(P('inst.dial.live', { sev: 'caution' }).opacity, undefined, 'the lit part is at full strength');
  assert.equal(P('inst.dial.knob.dot').stroke, T.ok, 'the knob\'s ring is green until a rating says otherwise');
  assert.equal(P('inst.dial.knob.dot', { sev: 'caution' }).stroke, T.caution);
  assert.equal(P('inst.dial.w').fill, T.ok);
  assert.equal(P('inst.dial.w', { sev: 'danger' }).fill, T.danger);
  assert.deepEqual([P('inst.dial.n').size, P('inst.dial.n').weight, P('inst.dial.n').letterSpacing], [25, 650, '-0.02em']);
  assert.equal(P('inst.dial.k').letterSpacing, '0.12em');
  for (const k of ['inst.dial.tl', 'inst.dial.k', 'inst.dial.n', 'inst.dial.u', 'inst.dial.w']) assert.equal(P(k).anchor, 'middle', k);
  for (const k of ['inst.dial.tl', 'inst.dial.k', 'inst.dial.u', 'inst.dial.w']) assert.equal(P(k).size, undefined, `${k}: its size is the font-size attribute fit() writes`);
});
test('the Circuit view re-colours the dial in the dark looks, and only there', () => {
  const pieces = [['inst.dial.knob.dot', 'fill'], ['inst.dial.n', 'fill'], ['inst.dial.tick', 'stroke'], ['inst.dial.knob.line', 'stroke'], ['inst.dial.k', 'fill']];
  let changed = 0;
  for (const palette of ['navy', 'black']) for (const [k, prop] of pieces) {
    const dk = (view) => ctx({ theme: 'dark', dark: true, palette, view });
    if (P(k, {}, dk('anatomic'))[prop] !== P(k, {}, dk('circuit'))[prop]) changed++;
  }
  assert.ok(changed > 0, 'the map\'s own tokens reach the dial');
  for (const [k, prop] of pieces) assert.equal(P(k, {}, ctx({ view: 'circuit' }))[prop], P(k)[prop], `${k}: a light look keeps its tokens in the circuit view`);
  assert.equal(makeCtx({ host: 'dock', view: 'circuit' }).view, 'circuit', 'a chart hands its view to its ctx');
  assert.notEqual(makeCtx({ host: 'dock', view: 'circuit' }).sig, makeCtx({ host: 'dock' }).sig, 'and the view is part of the memo key');
});
test('every piece instruments.js builds names a look that exists, and the sheet keeps no dial model rule', () => {
  const src = read('src/ui/instruments.js');
  const names = [...src.matchAll(/'data-look': '(inst\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 10);
  for (const n of names) assert.ok(LOOKS[n], `look ${n}`);
  assert.match(src, /createSvgGL\(el, \{ host: 'dock' \}\)/);
  assert.doesNotMatch(src, /\.style\.fontSize/, 'a model piece\'s size is an attribute');
  assert.doesNotMatch(read('styles/app.css'), /\.ab-dial(?!-box)\b|\.ab-dial-(band|live|tick|tl|knob|k|n|u|w)\b/, 'the dial\'s model rules are gone (the box that holds it stays)');
});
