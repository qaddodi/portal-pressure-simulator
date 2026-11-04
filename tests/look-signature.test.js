import { stageSource } from './stage-src.js';
// The vessel look's signature (look-sig.js) sees every number the old JSON text of the look did: the vessel layer is drawn again whenever
// any of them changes, and only then. The test takes the look as stage.js builds it (its literal, read from the source), walks every
// number in it and changes each in turn: one the signature does not read fails here, so a field added to the look cannot change
// without the vessels redrawing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookChanged, newLookSig } from '../src/ui/look-sig.js';

const STAGE = stageSource();
const literal = (re) => { const m = re.exec(STAGE); assert.ok(m, String(re)); return m[1]; };

// The look and the pieces it holds, from stage.js's own text.
function realLook() {
  const MAP = new Function(`return ${literal(/const MAP = (\{[^\n]*\});/)}`)();
  const vlook = literal(/const VLOOK = (\{[^\n]*?\}); {3}\/\/ alloc-rare/);
  const make = new Function('LIGHT', 'TIER_ALPHA', 'TIER_GROUP', 'MAP', `return ${vlook}`);
  const v = make([-0.42, -0.91], Array.from({ length: 12 }, (_, i) => 0.1 * i), Array.from({ length: 12 }, (_, i) => i % 3), MAP);
  v.plate = { alpha: 0.5, sat: 1, stack: false };
  v.fluid = { s: [1, 2, 3, 4], ink: [1, 2, 3, 4], ripple: false };
  return v;
}
// Every number (and boolean) leaf of the look but the fluid's, as a path.
function leaves(o, path = [], out = []) {
  for (const k of Object.keys(o)) {
    if (path.length === 0 && k === 'fluid') continue;
    const v = o[k];
    if (v && typeof v === 'object') leaves(v, [...path, k], out);
    else if (typeof v === 'number' || typeof v === 'boolean') out.push([...path, k]);
  }
  return out;
}
const at = (o, p) => p.slice(0, -1).reduce((a, k) => a[k], o);

test('the look is drawn again for a change of any one number in it, and not for none', () => {
  const v = realLook(), sig = newLookSig();
  assert.equal(lookChanged(v, true, sig), true, 'the first sync is a change');
  assert.equal(lookChanged(v, true, sig), false, 'the same look again is none');
  const paths = leaves(v);
  assert.ok(paths.length > 80, `the walk reaches the whole look (${paths.length} numbers)`);
  for (const p of paths) {
    const holder = at(v, p), k = p.at(-1), was = holder[k];
    holder[k] = typeof was === 'boolean' ? !was : was + 0.37;
    assert.equal(lookChanged(v, true, sig), true, `${p.join('.')} changed and the signature did not see it`);
    assert.equal(lookChanged(v, true, sig), false, `${p.join('.')} held at its new value is no change`);
    holder[k] = was;
    assert.equal(lookChanged(v, true, sig), true, `${p.join('.')} put back is a change`);
    assert.equal(lookChanged(v, true, sig), false);
  }
});

test('the plate going on or off, a plate that comes and goes, and a number gone to NaN are seen; the fluid is not part of it', () => {
  const v = realLook(), sig = newLookSig();
  lookChanged(v, true, sig);
  assert.equal(lookChanged(v, false, sig), true, 'the plate class went');
  assert.equal(lookChanged(v, false, sig), false);
  v.plate = null;
  assert.equal(lookChanged(v, false, sig), true, 'no plate look');
  assert.equal(lookChanged(v, false, sig), false);
  v.reach = NaN;
  assert.equal(lookChanged(v, false, sig), true, 'a number gone to NaN');
  assert.equal(lookChanged(v, false, sig), false, 'NaN held is no change, as null held was none in the text');
  v.fluid.s[0] = 99; v.fluid.ripple = true;
  assert.equal(lookChanged(v, false, sig), false, 'the fluid look has its own redraw path and was never in the signature');
});

test('stage.js reads the signature through look-sig.js and builds the look in one kept object', () => {
  assert.match(STAGE, /import \{ lookChanged, newLookSig \} from '\.\/look-sig\.js';/);
  assert.match(STAGE, /const lookDiffers = lookChanged\(vl, plateOn\(\), LOOK_SIG\);/);
  assert.doesNotMatch(STAGE, /JSON\.stringify\(vLook/);
});
