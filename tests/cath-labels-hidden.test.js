import { stageSource } from './stage-src.js';
// The HVPG catheter hides the figure's labels (cath-on) while its view follows the tip every frame. Every frame of that follow had laid the
// hidden labels out, drawn them and sent them to the GPU labels (the HVPG deck's lag, 31 Oct). Once their fade is over they are not laid
// out; as the catheter goes they are laid out at once, for the view as it is, before they fade back in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

const hidSrc = stage.match(/const cathHid = \(\) => [^\n]*\n/)?.[0];
const cathHid = (env) => new Function(...Object.keys(env), `${hidSrc}return cathHid;`)(...Object.values(env))();
const env = (over = {}) => ({ cath: { st: {} }, wrap: { classList: { contains: (c) => c === 'cath-on' } }, performance: { now: () => 1000 }, cathHidAt: 0, ...over });

test('hidden labels are skipped only under the HVPG catheter, once their fade is over', () => {
  assert.ok(hidSrc);
  assert.equal(cathHid(env()), true);
  assert.equal(cathHid(env({ cathHidAt: 800 })), false, 'still fading out: they follow the view');
  assert.equal(cathHid(env({ cath: { st: null } })), false, 'no catheter');
  assert.equal(cathHid(env({ cath: { st: { keep: true } } })), false, 'a treatment keeps the names on');
  assert.equal(cathHid(env({ wrap: { classList: { contains: () => false } } })), false);
  assert.doesNotMatch(stage, /CATH_HID|cathlabels=/);
  // (The fade the 300 ms waits for.)
  assert.match(css, /\.cath-on #labels \{ opacity: 0; visibility: hidden; transition: opacity var\(--d-small\) var\(--ease-in\), visibility 0s linear var\(--d-small\); \}/);
});

test('updateLabels returns early, the layout key cleared, right after the camera check', () => {
  const u = stage.slice(stage.indexOf('function updateLabels(f, force = false) {'), stage.indexOf('function refreshValues(f) {'));
  assert.ok(u.indexOf('if (camMove)') < u.indexOf('if (cathHid()) { labelKey = null; return; }'));
  assert.ok(u.indexOf('if (cathHid()) { labelKey = null; return; }') < u.indexOf('refreshCTM();'));
});

test('as the catheter goes (or a treatment keeps the names), the labels are laid out at once, for the view as it is', () => {
  const s = stage.slice(stage.indexOf('setCatheter(st) {'), stage.indexOf('cathPaint();\n    },'));
  assert.match(s, /cath\.st = st;\n[\s\S]*const hide = !!st && !st\.keep;\n\s*if \(hide !== wrap\.classList\.contains\('cath-on'\)\) \{\n\s*wrap\.classList\.toggle\('cath-on', hide\);\n\s*if \(hide\) cathHidAt = performance\.now\(\); else if \(F\) \{ labelKey = null; updateLabels\(F\); \}/);
});
