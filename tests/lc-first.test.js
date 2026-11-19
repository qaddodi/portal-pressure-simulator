// "the narrowed tIPS" (play-test 17 Nov 2026, TIPS details, Why this value?): a bare charAt(0).toLowerCase() on a name that starts with an acronym. One helper
// (engine/lc-first.js) for every sentence built from a name, and a scan for a second, unguarded copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { lcFirst } from '../src/engine/lc-first.js';

test('a name takes a small first letter, an acronym or a word with a capital inside keeps its own', () => {
  assert.equal(lcFirst('Presinusoidal fibrosis'), 'presinusoidal fibrosis');
  assert.equal(lcFirst('Right hepatic vein'), 'right hepatic vein');
  for (const s of ['TIPS', 'DIPS 8 mm', 'PSVD', 'HVPG', 'IVC', 'pH', 'mmHg', 'TIPS (covered)', 'Stenosis of TIPS'.replace('Stenosis of ', '') ]) assert.equal(lcFirst(s), s);
  assert.equal(lcFirst('Stenosis of TIPS'), 'stenosis of TIPS');
  assert.equal(lcFirst(''), '');
});

test('the explanation never prints tIPS or pSVD: every factor of every patient with a stent, a clot, a narrowing', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { explain } = await import('../src/engine/explain.js');
  const e = new Engine(); e.loadPreset('cirr-decomp-tips');
  e.setParams({ ...e.params, stenosis: { TIPS: 0.4 }, thrombus: { TIPS: 0.2 } });
  for (const id of ['ppg', 'hvpg', 'pv', 'asc']) {
    let t;
    try { t = JSON.stringify(explain(e, id)); } catch { continue; }
    assert.doesNotMatch(t, /\b[a-z][A-Z]{2,}\b/, `${id}: ${t.match(/\b[a-z][A-Z]{2,}\b/)}`);
  }
});

test('no sentence is built with a bare first-letter lower-case: use lcFirst (guarded copies listed)', () => {
  const GUARDED = new Set(['src/ui/instrument-aria.js', 'src/ui/from-readings.js', 'src/ui/glue.js', 'src/ui/trial-fit.js', 'src/engine/lc-first.js']);
  const bad = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js') && !GUARDED.has(p) && /charAt\(0\)\.toLowerCase\(\)|\[0\]\.toLowerCase\(\) \+/.test(readFileSync(p, 'utf8'))) bad.push(p); } };
  walk('src');
  assert.deepEqual(bad, [], 'a first letter lower-cased by hand: lcFirst keeps acronyms (src/engine/lc-first.js)');
});
