// Polish sliders and toggles (1 Nov): a slider whose value is set from outside (Reset, a double click, a patient, an undo) glides its
// dot and fill together instead of jumping (util.js paintRange → glideFill), and the Pressure / Scope tab's
// two-way switch joins the gliding selection piece (seg-glide.js). Source checks: the page itself is not run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const util = read('src/ui/util.js'), css = read('styles/app.css'), seg = read('src/ui/seg-glide.js');
const fn = (name) => { const at = util.indexOf(`function ${name}(`); assert.ok(at >= 0, name); return util.slice(at, util.indexOf('\n}\n', at)); };

test('only a big jump from outside the pointer\'s hand travels; a drag, a held finger, Reduce Motion and a hidden slider are taken at once', () => {
  const g = fn('glideFill');
  assert.match(util, /export const GLIDE_MIN = 0\.04;/);
  assert.match(g, /Math\.abs\(f - prev\) >= GLIDE_MIN/);
  assert.match(g, /classList\.contains\('held'\) \|\| input\.matches\(':active'\)/);
  for (const must of ['reduceMotionMQ.matches', '!input.isConnected', '!hasBox(input)']) assert.ok(g.includes(must), must);
});

test('the dot (the input\'s value) and the fill (--p) move on one clock, the paced eases\' one, on the scale\'s D_SURFACE and easeMove', () => {
  const g = fn('glideFill');
  assert.match(g, /easeNow\(\)/);
  assert.match(g, /D_SURFACE/);
  assert.match(g, /easeMove\(u\)/);
  assert.match(g, /input\.value = run\.cur = /);
  assert.match(g, /setProperty\('--p'/);
  assert.match(g, /v = Math\.round\(\(v - min\) \/ step\) \* step \+ min/, 'the dot sits on a step and the fill follows it');
  assert.match(g, /v = u >= 1 \? to : /, 'it ends on the exact value');
});

test('a model sync that asks again for the glide\'s own target does not restart it', () => {
  assert.match(fn('glideFill'), /Math\.abs\(g\.f - f\) < 1e-9\) \{ input\.value = g\.cur; return; \}/);
});

test('every slider paints through paintRange, and the first paint (no --p yet) is taken at once', () => {
  const p = fn('paintRange');
  assert.match(p, /Number\.isFinite\(prev\)\) glideFill/);
  assert.match(p, /else wrap\.style\.setProperty\('--p'/);
});

test('the Pressure / Scope switch is a gliding control with the look its chosen button had, and its own fill is off only while the piece is on', () => {
  assert.match(seg, /const SEL = '\.seg, \.instr-tabs, \.um-tabs, \.pressure-switch';/);
  assert.match(css, /\.pressure-switch\.seg-glide::before \{ border-radius: 7px; box-shadow: 0 1px 2px rgb\(var\(--night-rgb\) \/ \.12\), 0 0 0 \.5px var\(--hairline\); \}/);
  assert.match(css, /@media \(forced-colors: none\) \{ \.pressure-switch\.seg-glide \.ps-btn\[aria-pressed="true"\] \{ background: transparent; box-shadow: none; \} \}/);
});

test('the abdomen\'s steppers (serum albumin, litres to drain) roll their number instead of jumping, and ?stepnum=0 writes it at once', () => {
  const ins = read('src/ui/instruments.js');
  assert.match(ins, /const stepNumOff = typeof location !== 'undefined' && \/\[\?&\]stepnum=0\\b\/\.test\(location\.search \|\| ''\);/);
  assert.match(ins, /if \(stepNumOff\) putText\(n, v\.toFixed\(dp\)\); else countTo\(n, v, dp\);/);
  assert.match(ins, /paintStep\(out, v, dp, unit\); propSoon\(minus, 'disabled'/);
  assert.match(ins, /paintStep\(volOut, L, 1, 'L'\);/);
  assert.ok(!/replaceChildren\(L\.toFixed/.test(ins) && !/replaceChildren\(v\.toFixed/.test(ins), 'no stepper writes its number whole any more');
});
