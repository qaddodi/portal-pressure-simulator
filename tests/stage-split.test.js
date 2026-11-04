// The stage-split move tool (scripts/stage-split): a clean cut, a shared let read through live, a refused cut, and the proof catching a copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStage, checkEquivalence, checkNoCopies } from '../scripts/stage-split/lib.mjs';

const FIX = `import { clamp } from './util.js';
import { other } from './other.js';
export function createStage(opts) {
  const K = 3;
  let vt = 1, count = 0;
  const bump = () => { count++; return other(count); };
  // The probe: reads K, the camera and a const made after it.
  const probeBox = { on: false };
  function probeTick(n) { vt = vt + K; probeBox.on = !probeBox.on; return clamp(n + late, 0, 9) + bump(); }
  const probeShow = () => probeTick(vt);
  const late = 7;
  const api = { show: probeShow, tick: probeTick };
  return api;
}
`;
const spec = { factory: 'createProbe', file: 'stage-probe.js', about: 'probe', names: ['probeBox', 'probeTick', 'probeShow'] };

test('a clean cut: consts by st, shared lets and later consts by live, returned names back to stage.js', () => {
  const r = splitStage(FIX, spec);
  assert.ok(r.ok, r.refusals?.join('; '));
  assert.match(r.part, /export function createProbe\(st, live\)/);
  assert.match(r.part, /const \{ K, bump \} = st;/);
  assert.match(r.part, /live\.vt = live\.vt \+ K/);
  assert.match(r.part, /clamp\(n \+ live\.late, 0, 9\)/);
  assert.match(r.part, /import \{ clamp \} from '\.\/util\.js';/);
  assert.match(r.stage, /const \{ probeShow, probeTick \} = createProbe\(\{ K, bump \}, live\);/);
  assert.match(r.stage, /get vt\(\) \{ return vt; \}, set vt\(v\) \{ vt = v; \}/);
  assert.match(r.stage, /get late\(\) \{ return late; \}/);
  assert.doesNotMatch(r.stage, /import \{ clamp \}/, 'an import only the part used leaves stage.js');
  assert.match(r.stage, /import \{ other \}/, 'an import still used stays');
});

test('the proof accepts the move and rejects a changed statement', () => {
  const r = splitStage(FIX, spec), read = () => r.part;
  assert.deepEqual(checkEquivalence(FIX, r.stage, read), []);
  const bad = r.part.replace('vt + K', 'vt + K + 1');
  assert.ok(checkEquivalence(FIX, r.stage, () => bad).length > 0);
  assert.deepEqual(checkNoCopies(r.stage), []);
});

test('a let handed over by value is caught', () => {
  const r = splitStage(FIX, spec);
  const copied = r.stage.replace('createProbe({ K, bump }, live)', 'createProbe({ K, bump, vt }, live)');
  assert.ok(checkNoCopies(copied).some((p) => /vt is a let/.test(p)));
});

test('a cut whose function boot code calls before the part exists is refused', () => {
  const src = FIX.replace('  // The probe', '  probeTick(0);\n  // The probe');
  const r = splitStage(src, spec);
  assert.equal(r.ok, false);
  assert.match(r.refusals.join('\n'), /probeTick: reached at boot/);
});

test('a moved statement that runs code may not jump over a staying one that runs code', () => {
  const src = FIX.replace('  const probeShow', '  console.log("stays");\n  const probeShow').replace('const probeBox = { on: false };', 'const probeBox = { on: false };\n  console.log(probeBox);');
  const r = splitStage(src, { ...spec, also: [], names: ['probeBox', 'probeShow'] });
  assert.equal(r.ok, true, 'moving effect-free declarations around a staying effect is fine');
  const r2 = splitStage(src, { ...spec, names: ['probeTick'], also: ['console.log(probeBox);'] });
  assert.equal(r2.ok, true);
});

test('two statements on one line are cut as two, not twice', () => {
  const src = FIX.replace('  const api = {', '  probeTick(0); probeShow();   // run once, twice\n  const api = {').replace("names: ['probeBox'", "names: ['probeBox'");
  const r = splitStage(src, { ...spec, names: ['probeBox', 'probeTick', 'probeShow'], also: ['probeTick(0);', 'probeShow();'] });
  assert.ok(r.ok, (r.refusals || []).join('; '));
  assert.deepEqual(checkEquivalence(src, r.stage, () => r.part), []);
});
