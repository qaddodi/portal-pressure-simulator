import { stageSource } from './stage-src.js';
// What lies between the figure and a glass (stage.js frostOverRead) is kept part by part (2 Nov 2026, merged GPU plan; motion
// budget: the circuit slide change read every part again on every frame of the camera's glide, about 2,400 style and box reads).
// The overlays' boxes follow the camera by arithmetic; only a part that changed is read again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();
const read = st.slice(st.indexOf('  function frostOverRead(level) {'), st.indexOf('  hostFrost(paneGL, { order: 0'));
const carrySrc = st.slice(st.indexOf('  const CARRY_M = '), st.indexOf('  function frostOverRead(level) {'));

test('each part between is read through its own count; the camera moving the overlays reads none of them', () => {
  for (const p of ['over', 'pane', 'labels', 'shade', 'marks']) assert.match(read, new RegExp(`frostPartRead\\('${p}', `), p);
  assert.match(read, /frostCarry\(frostPartRead\('over', frostReadOver\), out\)/, 'the overlays carried by the figure\'s transform');
  assert.match(st, /if \(m\.target === (?:live\.)?(?:live\.)?worldOver && m\.type === 'attributes' && m\.attributeName === 'transform'\) continue;/);
  assert.match(st, /if \(k && k\.n === n && k\.pres === pres && k\.lost === lost && k\.tr === tr && k\.boxes === boxes\) return k;/, 'a part kept is used again');
  assert.doesNotMatch(st, /FROST_KEEP|glassreads=/);
  assert.match(st, /const frostTouch = \(e\) => \{ frostDirty\+\+; const p = frostPartOf\(e\?\.target\); if \(p\) frostPart\[p\]\+\+; else frostAll\(\); \};/);
});

test('boxes read at one view are carried to another by the change of transform', () => {
  // (Run the stage's own frostCarry on two views: a box read at the first lands where the second puts it.)
  const make = new Function('CTM0', 'refreshCTM', `const live = { CTM: CTM0 };\n${carrySrc}\nreturn { frostCarry, set: (c) => { live.CTM = c; } };`);
  const at = (k, x, y) => ({ a: k, b: 0, c: 0, d: k, e: x, f: y });
  const v1 = at(2, 10, 20), v2 = at(3, -5, 4);
  const f = make(v1, () => {});
  // A world box (1..4, 2..6) read at v1: client (12..18, 24..32).
  const v = { ctm: v1, out: [{ left: 12, top: 24, right: 18, bottom: 32 }] };
  assert.deepEqual(f.frostCarry(v, []), v.out, 'the same view: the same boxes');
  f.set(v2);
  assert.deepEqual(f.frostCarry(v, []), [{ left: -2, top: 10, right: 7, bottom: 22 }]);
  // A turn: the box that holds the turned corners.
  const th = Math.PI / 2, r = { a: Math.cos(th), b: Math.sin(th), c: -Math.sin(th), d: Math.cos(th), e: 0, f: 0 };
  const g = make(at(1, 0, 0), () => {}); g.set(r);
  const [b] = g.frostCarry({ ctm: at(1, 0, 0), out: [{ left: 1, top: 2, right: 3, bottom: 5 }] }, []);
  assert.ok(Math.abs(b.left + 5) < 1e-9 && Math.abs(b.right + 2) < 1e-9 && Math.abs(b.top - 1) < 1e-9 && Math.abs(b.bottom - 3) < 1e-9);
});
