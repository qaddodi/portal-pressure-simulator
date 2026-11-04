import { stageSource } from './stage-src.js';
// A resolution fade (res-fade.js) never changes the figure's brightness (Mohammad, 30 Oct: "it flashes whenever it switches
// resolution"). Since 1 Nov ("Move everything to GPU") the fade is made only on the GPU, inside the canvas's own presents
// (res-fade-gl.js): the canvas stays shown, its opacity is never touched, and no 2D canvas is drawn or laid over it. A canvas with
// no renderer to mix in takes its new resolution at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.requestAnimationFrame ||= () => 0;
const { fadeOver, fading, oldPlace, translateOf } = await import('../src/ui/res-fade.js');
const src = readFileSync(new URL('../src/ui/res-fade.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');

test('no 2D mix is left: nothing is drawn on a 2D canvas, the canvas opacity is never set, and no layout is read', () => {
  assert.ok(!/getContext|drawImage|createElement|globalCompositeOperation/.test(src), 'no 2D canvas');
  assert.ok(!/style\.opacity|getComputedStyle/.test(src), 'the canvas is never hidden, eased or read');
  assert.ok(!/offset(Width|Height|Left|Top)|getBoundingClientRect|client(Width|Height)/.test(src), 'its box is given by its owner');
  assert.ok(!/fadegpu|mixInto|stackInto|snapOpacity/.test(src), 'the 2D path and its switch are gone');
  assert.match(src, /const keep = keepOnGpu\(host\);/);
});

test('without a renderer to mix in, or without its box, the change is taken at once: no fade, nothing laid over the canvas', () => {
  const canvas = { width: 100, height: 80, isConnected: true, style: { opacity: '', translate: '' } };
  fadeOver(canvas, null, null, null, { w: 50, h: 40 });
  assert.equal(fading(canvas), false);
  fadeOver(canvas, null, null, { gl: {}, canvas, add() {} }, null);
  assert.equal(fading(canvas), false);
  assert.equal(canvas.style.opacity, '');
});

test('stage.js gives the fade the box it last laid the canvas out at', () => {
  const st = stageSource();
  assert.match(st, /fadeBox\.w = boxW; fadeBox\.h = boxH; fadeOver\(vCanvas, resFollow, veinsPresent, veins && !veins\.lost \? veins\.top : null, fadeBox\);/);
});

test('oldPlace: the old picture stays where it showed, through the canvas’s sub-pixel translate and a moving view', () => {
  assert.deepEqual(translateOf(''), [0, 0]);
  assert.deepEqual(translateOf('0.800px 0.500px'), [0.8, 0.5]);
  assert.deepEqual(translateOf('1.5px'), [1.5, 0]);
  // (On screen a point p of the old picture was at p + at; the view since moved by m; the mix shows moved by now.)
  const place = (m, at, now, p) => { const q = oldPlace(m, at, now); return [q[0] * p[0] + q[2] * p[1] + q[4] + now[0], q[1] * p[0] + q[3] * p[1] + q[5] + now[1]]; };
  const m = [2, 0, 0, 2, -7, -14], at = [0.8, 0.5], now = [-0.3, 1.2], p = [10, 20];
  const was = [p[0] + at[0], p[1] + at[1]], want = [m[0] * was[0] + m[2] * was[1] + m[4], m[1] * was[0] + m[3] * was[1] + m[5]];
  place(m, at, now, p).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9));
  assert.deepEqual(oldPlace(null, [0, 0], [0, 0]), [1, 0, 0, 1, 0, 0], 'Full, the view still: as it was');
});
