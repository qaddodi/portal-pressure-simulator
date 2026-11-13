// The Details panel's live readings and the list of active changes make nothing per frame (a reading keeps the words of each number it
// has shown; a change is one record that stays), and they read as they always did. Each is held to the plain way of writing it here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { Engine } from '../src/engine/engine.js';
import { PRESETS, DRUGS } from '../src/engine/scenario.js';
import { EDGES } from '../src/engine/topology.js';
const { activeInterventions, readings } = await import('../src/ui/inspector.js');
// (The inspector reads util.js by its plain name, so its units are the ones of that copy of the module: this reads the same one.)
const { fmt, fmtFlow, fp, ff, units } = await import('../src/ui/util.js');
const { newCell, numText, pressText, flowText, lpmText } = readings;

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

// ── the list of changes, as it was written before the records were kept ──
function plainChanges(p) {
  const out = [];
  const add = (key, label, remove) => out.push({ key, label, remove });
  const zn = { pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' };
  if (p.cirrhosis > 0) add('cirrhosis', `Cirrhosis ${Math.round(p.cirrhosis * 100)}%`, (q) => { q.cirrhosis = 0; });
  for (const z of ['pre', 'sin', 'post']) {
    const r = p.fibrosis.R[z], l = p.fibrosis.L[z];
    if (r !== 1 && Math.abs(r - l) < 1e-9) add('fib:' + z, `${zn[z]} fibrosis ×${r.toFixed(r < 10 ? 1 : 0)}`, (q) => { q.fibrosis.R[z] = 1; q.fibrosis.L[z] = 1; });
    else for (const lobe of ['R', 'L']) if (p.fibrosis[lobe][z] !== 1) add(`fib:${lobe}:${z}`, `${zn[z]} fibrosis, ${lobe === 'R' ? 'right' : 'left'} lobe ×${p.fibrosis[lobe][z].toFixed(1)}`, (q) => { q.fibrosis[lobe][z] = 1; });
  }
  const lab = (id) => EDGES[EI[id]]?.label || id;
  for (const [id, v] of Object.entries(p.stenosis)) add('sten:' + id, `${lab(id)} narrowed ${Math.round(v * 100)}%`, (q) => { delete q.stenosis[id]; });
  for (const [id, v] of Object.entries(p.thrombus)) add('thr:' + id, `${lab(id)} thrombus ${Math.round(v * 100)}%`, (q) => { delete q.thrombus[id]; });
  for (const [k, on] of Object.entries(p.drugs)) if (on) add('drug:' + k, DRUGS[k].label, (q) => { q.drugs[k] = false; });
  if (p.splenicRx) add('splenicRx', p.splenicRx === 2 ? 'Splenectomy' : 'Partial splenic embolization', (q) => { q.splenicRx = 0; });
  if (p.tips.on) add('tips', `TIPS ${p.tips.d} mm`, (q) => { q.tips.on = false; });
  if (p.dips.on) add('dips', `DIPS ${p.dips.d} mm`, (q) => { q.dips.on = false; });
  if (p.portocaval) add('portocaval', p.portocavalSide ? 'Portocaval shunt (side-to-side)' : 'Portocaval shunt', (q) => { q.portocaval = false; q.portocavalSide = false; });
  if (p.dsrs) add('dsrs', 'Distal splenorenal shunt', (q) => { q.dsrs = false; });
  if (p.mesocaval) add('mesocaval', 'Mesocaval shunt', (q) => { q.mesocaval = false; });
  if (p.rex) add('rex', 'Meso-Rex bypass', (q) => { q.rex = false; });
  for (const [id, d] of Object.entries(p.customShunts || {})) add('cs:' + id, `${lab(id)} ${d} mm`, (q) => { const c = { ...(q.customShunts || {}) }; delete c[id]; q.customShunts = c; });
  if (p.balloonGas) add('balloonGas', 'Gastric balloon', (q) => { q.balloonGas = false; q.balloonEso = false; });
  if (p.balloonEso) add('balloonEso', 'Esophageal balloon', (q) => { q.balloonEso = false; });
  for (const id of Object.keys(p.occluded)) add('occ:' + id, `${id === 'C5' ? 'BRTO (gastrorenal shunt occluded)' : lab(id) + ' occluded'}`, (q) => { delete q.occluded[id]; });
  if (p.splanchnicTone !== 1) add('splTone', `Splanchnic tone ×${p.splanchnicTone.toFixed(2)}`, (q) => { q.splanchnicTone = 1; });
  if (p.meal > 0) add('meal', 'After a meal', (q) => { q.meal = 0; });
  if (p.systemicTone !== 1) add('sysTone', `Systemic tone ×${p.systemicTone.toFixed(2)}`, (q) => { q.systemicTone = 1; });
  if (p.contractility !== 1) add('contractility', `RV contractility ${Math.round(p.contractility * 100)}%`, (q) => { q.contractility = 1; });
  if (p.tr > 0) add('tr', `Tricuspid regurgitation ${Math.round(p.tr * 100)}%`, (q) => { q.tr = 0; });
  if (p.pericardial > 0) add('pericardial', `Pericardial constraint ${Math.round(p.pericardial * 100)}%`, (q) => { q.pericardial = 0; });
  if (p.apShunt > 0) add('apShunt', `Arterioportal shunting ${Math.round(p.apShunt * 100)}%`, (q) => { q.apShunt = 0; });
  if (p.habrStrength !== 1) add('habr', `Arterial buffer ×${p.habrStrength.toFixed(2)}`, (q) => { q.habrStrength = 1; });
  if (p.gestation > 0) add('gestation', `Pregnancy ${Math.round(p.gestation)} weeks`, (q) => { q.gestation = 0; });
  if (p.albumin !== 4) add('albumin', `Albumin ${p.albumin.toFixed(1)} g/dL`, (q) => { q.albumin = 4; });
  if (p.diuretics) add('diuretics', 'Diuretics', (q) => { q.diuretics = false; });
  if (p.anticoag) add('anticoag', 'Anticoagulation', (q) => { q.anticoag = false; });
  if (p.spontaneous.C5 === false) add('C5', 'No gastrorenal shunt (no fundal varices)', (q) => { q.spontaneous.C5 = true; });
  if (p.spontaneous.C6) add('C6', 'Splenorenal shunt', (q) => { q.spontaneous.C6 = false; });
  return out;
}

// A small deterministic walk over values, so a run gives the same patients every time.
let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function patients() {
  const list = [];
  const e = new Engine();
  for (const { id } of PRESETS) { e.loadPreset(id); list.push(structuredClone(e.params)); }
  const base = structuredClone(list[0]);
  for (let n = 0; n < 200; n++) {
    const p = structuredClone(list[n % list.length] || base);
    if (rnd() < 0.7) p.cirrhosis = rnd();
    for (const z of ['pre', 'sin', 'post']) {
      const roll = rnd();
      if (roll < 0.3) { p.fibrosis.R[z] = p.fibrosis.L[z] = 1 + rnd() * 30; }
      else if (roll < 0.5) { p.fibrosis.R[z] = 1 + rnd() * 5; p.fibrosis.L[z] = 1 + rnd() * 5; }
    }
    if (rnd() < 0.5) p.stenosis.IVCS_RA = rnd();
    if (rnd() < 0.5) p.thrombus.PV_TRUNK = rnd();
    if (rnd() < 0.3) p.thrombus.SV_CONF = rnd();
    for (const k of Object.keys(DRUGS)) p.drugs[k] = rnd() < 0.4;
    p.splenicRx = (rnd() * 3) | 0;
    p.tips.on = rnd() < 0.4; p.tips.d = 6 + ((rnd() * 12) | 0) / 2;
    p.dips.on = rnd() < 0.3; p.dips.d = 6 + ((rnd() * 12) | 0) / 2;
    p.portocaval = rnd() < 0.2; p.portocavalSide = p.portocaval && rnd() < 0.5; p.dsrs = rnd() < 0.2; p.mesocaval = rnd() < 0.2;
    p.customShunts = rnd() < 0.4 ? { C2: 4 + ((rnd() * 8) | 0), C3: 6 } : undefined;
    p.balloonGas = rnd() < 0.3; p.balloonEso = rnd() < 0.3;
    p.occluded = rnd() < 0.4 ? { C5: true, C2: true } : {};
    p.splanchnicTone = rnd() < 0.5 ? 1 : 0.4 + rnd() * 2; p.systemicTone = rnd() < 0.5 ? 1 : 0.4 + rnd() * 2;
    p.meal = rnd() < 0.3 ? 1 : 0; p.contractility = rnd() < 0.5 ? 1 : 0.15 + rnd() * 1.4;
    p.tr = rnd() < 0.5 ? 0 : rnd(); p.pericardial = rnd() < 0.5 ? 0 : rnd(); p.apShunt = rnd() < 0.5 ? 0 : rnd();
    p.habrStrength = rnd() < 0.5 ? 1 : rnd() * 2; p.gestation = rnd() < 0.5 ? 0 : (rnd() * 40) | 0;
    p.albumin = rnd() < 0.5 ? 4 : 1.5 + rnd() * 3.5; p.diuretics = rnd() < 0.4; p.anticoag = rnd() < 0.4;
    p.spontaneous.C5 = rnd() < 0.5; p.spontaneous.C6 = rnd() < 0.4;
    list.push(p);
  }
  return list;
}

test('the list of changes reads as it did, and each change still takes itself off', () => {
  let seen = 0;
  for (const p of patients()) {
    const want = plainChanges(p), got = activeInterventions(p);
    assert.deepEqual(got.map((a) => [a.key, a.label]), want.map((a) => [a.key, a.label]));
    for (let i = 0; i < want.length; i++) {
      const a = structuredClone(p), b = structuredClone(p);
      want[i].remove(a); got[i].remove(b);
      assert.deepEqual(b, a, `${want[i].key} takes itself off the same way`);
    }
    seen += want.length;
  }
  assert.ok(seen > 500, `only ${seen} changes were compared`);
});

test('the list of changes is one array and one record per change, kept from call to call', () => {
  const p = patients()[3];
  const first = activeInterventions(p), recs = first.slice();
  const again = activeInterventions(p);
  assert.equal(again, first, 'the same array');
  assert.deepEqual(again.map((a, i) => a === recs[i]), recs.map(() => true), 'the same records');
});

// ── the live readings ──
const sweep = [0, -0, 0.04, 0.049, 0.05, 0.0004, 0.0006, 0.1, 0.149, 0.95, 1, 1.5, 2.25, 4.95, 5, 9.99, 12.345, 33.3333, 80, 123.456, -0.04, -0.5, -3.27, -12.5];
for (let i = 0; i < 300; i++) sweep.push((rnd() - 0.3) * 60);

test('a pressure reads as fp prints it, in each unit, and again after the unit changes', () => {
  const c = newCell();
  try {
    for (const u of ['mmHg', 'cmH2O', 'kPa', 'mmHg']) {
      units.pressure = u;
      for (const v of sweep) {
        const want = fp(v).join(' ');
        assert.equal(pressText(c, v), want, `${v} in ${u}`);
        assert.equal(pressText(c, v), want, `${v} in ${u}, asked again`);
      }
    }
  } finally { units.pressure = 'mmHg'; }
});

test('a flow reads as ff and fmtFlow print it, in each unit', () => {
  const c = newCell(), l = newCell();
  try {
    for (const u of ['L/min', 'mL/min', 'L/min']) {
      units.flow = u;
      for (const v of sweep) {
        assert.equal(flowText(c, v), ff(v).join(' '), `${v} in ${u}`);
        assert.equal(lpmText(l, v), `${fmtFlow(v)} L/min`, `${v} as L/min`);
      }
    }
  } finally { units.flow = 'L/min'; }
});

test('a number reads as fmt prints it to its places, with its suffix; a missing one reads as a dash', () => {
  for (const d of [0, 1, 2]) {
    const c = newCell();
    for (const v of sweep) assert.equal(numText(c, v, d, ' mmHg'), `${fmt(v, d)} mmHg`, `${v} to ${d} places`);
  }
  const c = newCell();
  for (const v of [undefined, null, NaN, Infinity, 3, undefined]) assert.equal(numText(c, v, 1, ' cm'), `${fmt(v, 1)} cm`, String(v));
});

test('a reading that shows a number it has shown before builds no new words', () => {
  const c = newCell();
  const a = numText(c, 12.34, 1, ' mm');
  numText(c, 55.5, 1, ' mm');
  assert.equal(numText(c, 12.31, 1, ' mm'), a);
  assert.equal(c.t.size, 2);
  for (let i = 0; i < 2000; i++) numText(c, i / 10, 1, ' mm');
  assert.ok(c.t.size <= 513, `the words kept stay bounded (${c.t.size})`);
});
