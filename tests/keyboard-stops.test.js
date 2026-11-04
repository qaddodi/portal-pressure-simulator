import { stageSource } from './stage-src.js';
// Production pass, batch D (31 Oct): a talk's figure is out of the Tab order, a hidden label is neither a stop nor read aloud,
// the debug overlay shows only under ?debug, Windows high contrast keeps the on and selected states, and a preset that fails to
// load does not leave the figure waiting. The wiring is read from source, as the repo's other review tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the figure (one stop for its vessels and organs) and its labels are Tab stops only while keyStops is on', () => {
  const s = stageSource();
  assert.match(s, /let keyStops = true;/);
  assert.match(s, /svg\.setAttribute\('tabindex', '0'\);/, 'the figure is one stop');
  assert.doesNotMatch(s, /class: 'v-hit'|class: 'org-key'/, 'no element per vessel or organ');
  assert.match(s, /g\.setAttribute\('tabindex', keyStops \? '0' : '-1'\)/);
  const set = s.slice(s.indexOf('setKeyStops: (on) =>'), s.indexOf('/** Where a station\'s callout attaches'));
  assert.match(set, /svg\.setAttribute\('tabindex', keyStops \? '0' : '-1'\);/, 'the figure\'s stop is switched');
  assert.match(set, /if \(!keyStops\) figShow\(null, false\);/, 'and the keyboard\'s glow put away');
  assert.match(set, /pool\.values\(\)/, 'and every label already drawn');
  assert.match(set, /keyStops && !b\.hid \? '0' : '-1'/, 'a hidden label stays out when the talk ends');
});

test('a hidden label leaves the Tab order and the screen reader, and one with focus keeps its place', () => {
  const s = stageSource();
  const fn = s.slice(s.indexOf('function labelStop(b, hid)'), s.indexOf('function blockEl('));
  assert.match(fn, /aria-hidden', 'true'/);
  assert.match(fn, /removeAttribute\('aria-hidden'\)/);
  assert.match(fn, /document\.activeElement === b\.g/, 'focus is never pulled out from under a person');
  assert.match(fn, /hid \|\| !(?:live\.)?(?:live\.)?keyStops \? '-1' : '0'/);
  // Every place a label is hidden goes through it: the per-frame draw and the fade-out.
  assert.match(s, /b\.g\.classList\.toggle\('lb-off', !!it\.hide\);\s*labelStop\(b, !!it\.hide\);/);
  assert.match(s, /b\.g\.classList\.add\('lb-off'\); labelStop\(b, true\);/);
});

test('a talk turns the figure\'s stops off before it takes the stage and back on as it ends', () => {
  const p = read('src/ui/presenter.js');
  const on = p.indexOf('stage.setKeyStops?.(false)'), pres = p.indexOf('store.set({ presenting: true', on);
  assert.ok(on > 0 && pres > on && pres - on < 400, 'off first, then presenting');
  const back = p.indexOf('stage.setKeyStops?.(true)');
  assert.ok(back > 0 && p.indexOf("app.classList.remove('presenting', 'pz-hi')") < back, 'on again once the talk\'s classes are gone');
});

test('the debug overlay starts off on every load: no stored choice is read back', () => {
  const d = read('src/ui/debug.js');
  assert.match(d, /\nlet st = \{\};\n/);
  assert.doesNotMatch(d, /localStorage\.getItem|location\.search/);
});

test('Windows high contrast keeps the on and selected states and the switches visible', () => {
  const css = read('styles/app.css');
  const at = css.indexOf('@media (forced-colors: active)');
  assert.ok(at > 0);
  const blk = css.slice(at);
  for (const want of ['aria-pressed="true"', 'aria-selected="true"', 'Highlight', 'HighlightText', '.switch input:checked + span', ':focus-visible { outline: 2px solid Highlight; }'])
    assert.ok(blk.includes(want), want);
  // Only system colours inside it: no hex or rgb.
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(blk), 'system colours only');
});

test('a preset that cannot be loaded clears the figure\'s wait', () => {
  const m = read('src/ui/main.js');
  const fn = m.slice(m.indexOf('async function loadPreset(id, opts = {})'), m.indexOf('function encodeShare('));
  assert.match(fn, /catch \{ if \(gen === presetGen\) store\.set\(\{ presetLoading: false \}\); return false; \}/);
  assert.ok(fn.indexOf('presetLoading: true') < fn.indexOf('presetLoading: false'));
});
