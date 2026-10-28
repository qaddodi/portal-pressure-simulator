import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQuiet } from '../src/ui/quiet.js';

// The one clock of input the app's deferred work reads: a fake window and clock stand in for the browser.
function rig() {
  const target = new EventTarget();
  let t = 10000;
  const q = createQuiet(target, () => t);
  const fire = (type, props = {}) => target.dispatchEvent(Object.assign(new Event(type), props));
  return { q, fire, tick: (ms) => { t += ms; } };
}

test('left alone after the wait since the last input, never while a finger is down', () => {
  const { q, fire, tick } = rig();
  assert.equal(q.leftAlone(700), true, 'nothing touched yet');
  fire('pointerdown', { pointerId: 1, buttons: 1 });
  tick(100);
  assert.equal(q.leftAlone(0), false, 'a finger is down');
  tick(4000);
  assert.equal(q.leftAlone(0), false, 'held still, still down');
  fire('pointermove', { pointerId: 1, buttons: 1 });
  fire('pointerup', { pointerId: 1 });
  assert.equal(q.leftAlone(700), false, 'just lifted after a drag');
  tick(700);
  assert.equal(q.leftAlone(700), true);
});

test('a press that never saw its release stops counting after 5 s of no input', () => {
  const { q, fire, tick } = rig();
  fire('pointerdown', { pointerId: 7, buttons: 1 });
  tick(5001);
  assert.equal(q.leftAlone(1000), true);
});

test('a move with no button down is not input; a wheel and a key are', () => {
  const { q, fire, tick } = rig();
  fire('pointermove', { pointerId: 1, buttons: 0 });
  assert.equal(q.leftAlone(700), true, 'hovering is not a gesture');
  fire('wheel');
  tick(100);
  assert.equal(q.leftAlone(700), false);
  tick(700);
  fire('keydown');
  assert.equal(q.leftAlone(700), false);
});

test('a move with the button up clears a press the release of which was missed', () => {
  const { q, fire, tick } = rig();
  fire('pointerdown', { pointerId: 3, buttons: 1 });
  tick(10);
  fire('pointermove', { pointerId: 3, buttons: 0 });
  tick(800);
  assert.equal(q.leftAlone(700), true);
});

test('whenQuiet waits out a gesture, calls once, and a cancel stops it', async () => {
  const target = new EventTarget();
  const q = createQuiet(target, () => performance.now());
  let n = 0;
  target.dispatchEvent(Object.assign(new Event('wheel')));
  q.whenQuiet(() => { n++; }, 60, 20);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(n, 0, 'the wheel was a moment ago');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(n, 1);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(n, 1, 'once');
  let m = 0;
  q.whenQuiet(() => { m++; }, 0, 5)();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(m, 0, 'cancelled');
});

test('the stage, the vessel renderer, the compile helper and the warm-up all read this one clock', () => {
  const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  assert.match(src('src/ui/stage.js'), /import \{ leftAlone, sinceInput \} from '\.\/quiet\.js/);
  assert.doesNotMatch(src('src/ui/stage.js'), /let inputAt|const pressed = new Set/, 'no second set of listeners');
  assert.match(src('src/ui/veins-gl.js'), /if \(!leftAlone\(PUBLISH_QUIET_MS\)\) return;/, 'prepare() publishes the optional builds after a gesture');
  assert.match(src('src/ui/gl-compile.js'), /import \{ leftAlone \} from '\.\/quiet\.js/);
  const main = src('src/ui/main.js');
  assert.match(main, /const warmUp = \[\(\) => paletteL\.warm\(\), \(\) => presenterL\.warm\(\), \(\) => dock\.load\(\)\];/);
  assert.match(main, /whenQuiet\(\(\) => idle\(\(\) => \{ step\(\); warmNext\(\); \}\)\)/, 'one module per quiet idle moment');
});
