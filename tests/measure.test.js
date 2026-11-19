// A hepatic vein's measurement, one policy (src/engine/portal/pressure-cuts.js hvMeasure; §6.3 of the external production review, 15 Nov 2026): can the catheter pass,
// can a reading be taken, can the gradient be read as the liver's. Until 15 Nov a second helper (src/ui/measure-model.js: thrombus 0.5 or stenosis 0.8, used by
// no screen) disagreed with hvBlocked (thrombus 0.8) at thrombus 0.6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/portal/engine.js';
import { hvMeasure, hvBlocked, HV_BLOCKED, HV_SUSPECT, HV_EDGE } from '../src/engine/portal/pressure-cuts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const params = (id) => { const e = new Engine(); e.loadPreset(id); return e.params; };
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('sinusoidal state: the right hepatic vein is open, so a wedge reading is interpretable', () => {
  assert.deepEqual(hvMeasure(params('cirr-comp'), 'R'), { passes: true, obtainable: true, interpretable: true });
  assert.equal(hvBlocked(params('cirr-comp')), false);
});

test('Budd-Chiari: the right hepatic vein is blocked, so no catheter passes and no wedge reading is taken', () => {
  assert.deepEqual(hvMeasure(params('budd-chiari'), 'R'), { passes: false, obtainable: false, interpretable: false });
  assert.equal(hvBlocked(params('budd-chiari')), true);
});

test('the three questions have three lines: pass at 0.8, interpretable under thrombus 0.5 and stenosis 0.8', () => {
  const at = (thrombus, stenosis = 0, vein = 'R') => hvMeasure({ thrombus: { [HV_EDGE[vein]]: thrombus }, stenosis: { [HV_EDGE[vein]]: stenosis } }, vein);
  assert.deepEqual([HV_BLOCKED, HV_SUSPECT.thrombus, HV_SUSPECT.stenosis], [0.8, 0.5, 0.8]);
  assert.deepEqual(at(0.49), { passes: true, obtainable: true, interpretable: true });
  assert.deepEqual(at(0.5), { passes: true, obtainable: true, interpretable: false }, 'half clotted: a reading, but not the liver\'s');
  assert.deepEqual(at(0.6), { passes: true, obtainable: true, interpretable: false }, 'the case the two helpers disagreed on: the catheter passes');
  assert.deepEqual(at(0.79), { passes: true, obtainable: true, interpretable: false });
  assert.deepEqual(at(0.8), { passes: false, obtainable: false, interpretable: false });
  assert.deepEqual(at(0, 0.79), { passes: true, obtainable: true, interpretable: true });
  assert.deepEqual(at(0, 0.8), { passes: true, obtainable: true, interpretable: false }, 'a tight stenosis passes the catheter, and reads the vein');
  assert.deepEqual(at(0.8, 0.8), { passes: false, obtainable: false, interpretable: false });
  for (const v of ['R', 'M', 'L']) assert.deepEqual(at(0.6, 0, v), { passes: true, obtainable: true, interpretable: false }, `vein ${v}`);
  assert.throws(() => hvMeasure({}, 'X'), /hvMeasure: vein X/);
  assert.deepEqual(hvMeasure(null), { passes: true, obtainable: true, interpretable: true }, 'no params: open');
});

test('hvBlocked is the right vein\'s "passes" and nothing else: a half-clotted vein is not blocked, a wholly clotted one is, whatever the other veins do', () => {
  assert.equal(hvBlocked({ thrombus: { RHV_IVC: 0.6 } }), false);
  assert.equal(hvBlocked({ thrombus: { RHV_IVC: HV_BLOCKED } }), true);
  assert.equal(hvBlocked({ thrombus: { MHV_IVC: 1, LHV_IVC: 1 } }), false, 'the HVPG is taken in the right vein');
  assert.equal(hvBlocked({ stenosis: { RHV_IVC: 0.95 } }), false);
});

test('there is one policy: no second blockage helper exists, and no file writes the vein\'s lines as numbers', () => {
  assert.equal(existsSync(join(ROOT, 'src/ui/measure-model.js')), false);
  const stray = [];
  for (const f of walk('src').filter((x) => x.endsWith('.js') && !/pressure-cuts\.js$/.test(x))) {
    readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\b(?:RHV_IVC|MHV_IVC|LHV_IVC)\b[^;\n]{0,30}\)?\s*(?:\|\|\s*0\))?\s*(?:>=?|<=?)\s*0\.\d/.test(code)) stray.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(stray, [], 'read the vein\'s lines from hvMeasure (src/engine/portal/pressure-cuts.js)');
});
