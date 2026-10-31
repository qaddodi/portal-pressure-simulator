// One light (31 Oct, the combined plan's step 11): the figure's light direction is written once, in light.js, and the vessels
// (stage.js), the catheter and balloon (veins-gl.js) and the lobule's vessels (lobule-zoom.js) all take it from there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LIGHT } from '../src/ui/light.js';

const dir = new URL('../src/ui/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');

test('the light is a unit vector from the top, slightly to the left (screen space: x right, y down)', () => {
  assert.equal(LIGHT.length, 2);
  assert.ok(Math.abs(Math.hypot(...LIGHT) - 1) < 1e-12);
  assert.ok(LIGHT[0] < 0 && LIGHT[1] < 0 && Math.abs(LIGHT[1]) > Math.abs(LIGHT[0]));
  // (The numbers the figure has always been lit with.)
  assert.ok(Math.abs(LIGHT[0] + 0.4191) < 1e-4 && Math.abs(LIGHT[1] + 0.9080) < 1e-4);
  assert.ok(Object.isFrozen(LIGHT), 'nobody turns the light for everyone else');
});

test('every renderer that lights a vessel takes the one light, and none writes a direction of its own', () => {
  for (const f of ['stage.js', 'veins-gl.js', 'lobule-zoom.js']) {
    assert.match(read(f), /import \{ LIGHT \} from '\.\/light\.js\?v=[0-9a-f]+';/, `${f} imports the light`);
  }
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'light.js' && !/-data\.js$/.test(n))) {
    assert.doesNotMatch(read(f), /-0\.42\b[^\n]{0,12}-0\.91\b|Math\.hypot\(-0\.42/, `${f} writes a light of its own`);
  }
});
