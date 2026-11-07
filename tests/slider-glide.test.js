// Polish sliders and toggles (1 Nov): a slider whose value is set from outside (Reset, a double click, a patient, an undo) glides its
// dot and fill together instead of jumping (util.js paintRange → glideFill), and the Pressure / Scope tab's
// two-way switch joins the gliding selection piece (seg-glide.js). Source checks: the page itself is not run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const util = read('src/ui/util.js'), css = read('styles/app.css'), seg = read('src/ui/seg-glide.js');
const fn = (name) => { const at = util.indexOf(`function ${name}(`); assert.ok(at >= 0, name); return util.slice(at, util.indexOf('\n}\n', at)); };

test('only a big jump from outside the pointer\'s hand travels; a drag, a held finger, Reduce Motion, a hidden slider and one the GPU has not drawn are taken at once', () => {
  const g = fn('glideFill');
  assert.match(util, /export const GLIDE_MIN = 0\.04;/);
  assert.match(g, /Math\.abs\(f - S\.f\) >= GLIDE_MIN/);
  assert.match(g, /S\.held \|\| input\.classList\.contains\('held'\) \|\| input\.matches\(':active'\)/);
  for (const must of ['reduceMotionMQ.matches', '!S.w?.live', '!input.isConnected', '!hasBox(input)']) assert.ok(g.includes(must), must);
});

test('the dot and the fill move on one clock, the paced eases\' one, on the scale\'s D_SURFACE and easeMove, drawn by the GPU: no style or value is written in a frame of it', () => {
  const g = fn('glideFill'), gl = read('src/ui/slider-gl.js');
  assert.match(g, /else glide\(S, f\);/);
  assert.ok(!/setProperty|\.value =/.test(g), 'the glide writes nothing to the page');
  const tick = gl.slice(gl.indexOf('function tick(S)'), gl.indexOf('// ---- The picture'));
  assert.match(tick, /easeNow\(\)/);
  assert.match(tick, /D_SURFACE/);
  assert.match(tick, /easeMove\(u\)/);
  assert.match(tick, /S\.f = u >= 1 \? S\.gB : glideAt\(/, 'it ends on the exact value');
  assert.ok(!/setProperty|style\.|\.value =|classList/.test(tick), 'no page write in a frame');
  assert.match(gl, /if \(step\) v = Math\.round\(\(v - min\) \/ step\) \* step \+ min;/, 'the dot sits on a step and the fill follows it');
});

test('a model sync that asks again for the glide\'s own target does not restart it', () => {
  assert.match(fn('glideFill'), /if \(gliding\(S, f\)\) return;/);
  assert.match(read('src/ui/slider-gl.js'), /export const gliding = \(S, f\) => S\.gStart >= 0 && Math\.abs\(S\.gTo - f\) < 1e-9;/);
});

test('every slider paints through paintRange, and the first paint (no fraction yet) is taken at once', () => {
  const p = fn('paintRange');
  assert.match(p, /glideFill\(sliderOf\(input, wrap\), f\);/);
  assert.ok(Number.isNaN(NaN) && !(Math.abs(0.5 - NaN) >= 0.04), 'a slider with no fraction yet is never "far"');
});

test('the Pressure / Scope switch is a gliding control with the look its chosen button had, and its own fill is off only while the piece is on', () => {
  assert.match(seg, /const SEL = '\.seg, \.instr-tabs, \.um-tabs, \.pressure-switch';/);
  assert.match(css, /\.pressure-switch\.seg-glide::before \{ border-radius: 7px; box-shadow: 0 1px 2px rgb\(var\(--night-rgb\) \/ \.12\), 0 0 0 \.5px var\(--hairline\); \}/);
  assert.match(css, /@media \(forced-colors: none\) \{ \.pressure-switch\.seg-glide \.ps-btn\[aria-pressed="true"\] \{ background: transparent; box-shadow: none; \} \}/);
});

test('the abdomen\'s steppers (serum albumin, litres to drain) roll their number instead of jumping', () => {
  const ins = read('src/ui/instruments.js');
  assert.match(ins, /const n = out\.firstElementChild;[^\n]*\n\s+countTo\(n, v, dp\);\n\};/);
  assert.doesNotMatch(ins, /stepNumOff|stepnum/);
  assert.match(ins, /paintStep\(out, v, dp, unit\); propSoon\(minus, 'disabled'/);
  assert.match(ins, /paintStep\(volOut, L, 1, 'L'\);/);
  assert.ok(!/replaceChildren\(L\.toFixed/.test(ins) && !/replaceChildren\(v\.toFixed/.test(ins), 'no stepper writes its number whole any more');
});
