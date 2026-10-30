// A vein a slide shows stented (slide field `stented`): the cross-section's ring follows it, and every built-in slide whose
// mark says "Stent" on a vein the model has no device for lists that vein, so the label never points at nothing (30 Oct:
// the right hepatic vein's "Stent" had no mesh on the figure and no ring in the cross-section).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { EDGES, isStent } from '../src/engine/topology.js';
import { hasStent } from '../src/ui/tool-lumen.js';

const marksOf = (s) => s.marks || (s.mark ? [s.mark] : []);

test('the cross-section draws a ring for the TIPS and DIPS, and for a vein the slide stents', () => {
  assert.equal(hasStent('TIPS', []), true);
  assert.equal(hasStent('DIPS', undefined), true);
  assert.equal(hasStent('RHV_IVC', ['RHV_IVC']), true);
  assert.equal(hasStent('RHV_IVC', []), false, 'a vein nobody stented has none');
  assert.equal(hasStent('RHV_IVC', undefined), false);
  assert.equal(hasStent('MHV_IVC', ['RHV_IVC']), false, 'only the veins listed');
});

test('a mark that says "Stent" on a vein the model has no device for is backed by the slide\'s stented', () => {
  const edge = new Map(EDGES.map((e) => [e.id, e]));
  let seen = 0;
  for (const d of DECKS) for (const s of d.slides) for (const m of marksOf(s)) {
    if (!/stent/i.test(String(m.label || ''))) continue;
    for (const id of m.edges || []) {
      const e = edge.get(id);
      if (!e || isStent(e)) continue;   // (the TIPS, the DIPS and drawn shunts draw their own mesh)
      seen++;
      assert.ok((s.stented || []).includes(id), `${d.id}/${s.id}: the mark "${m.label}" is on ${id}, which draws no stent without stented: ['${id}']`);
    }
  }
  assert.ok(seen >= 1, 'the Budd–Chiari slide is one');
});

test('every vein a slide stents is a vein of the model, and the slide shows it (a mark or a cross-section tool on it)', () => {
  const edge = new Map(EDGES.map((e) => [e.id, e]));
  let seen = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (s.stented === undefined) continue;
    seen++;
    assert.ok(Array.isArray(s.stented) && s.stented.length, `${d.id}/${s.id}: stented is a list of edge ids`);
    assert.ok(!s.visual, `${d.id}/${s.id}: a visual slide has no figure to draw it on`);
    for (const id of s.stented) {
      assert.equal(typeof id, 'string');
      if (id.startsWith('@')) continue;   // (a named set: slide-ext.js)
      assert.equal(edge.get(id)?.kind, 'vein', `${d.id}/${s.id}: ${id} is not a vein`);
      assert.ok(!isStent(edge.get(id)), `${d.id}/${s.id}: ${id} draws its own mesh`);
    }
  }
  assert.ok(seen >= 1);
});

test('the Budd–Chiari "One open hepatic vein" slide stents the right hepatic vein, and its cross-section is the same vein', () => {
  const s = DECKS.find((d) => d.id === 'outflow').slides.find((x) => x.id === 'open');
  assert.deepEqual(s.stented, ['RHV_IVC']);
  assert.equal(s.tool.kind, 'lumen');
  assert.equal(s.tool.vessel, 'RHV_IVC');
});

test('the figure unrolls and rolls back a stented vein on its own clock, and the presenter hands each slide its veins', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(stage, /function meshPaths\(id, p, d0, d1, k = 1\)/, 'one mesh for the TIPS and the veins');
  assert.match(stage, /ov\.stents\.append\(\.\.\.meshPaths\(id, p, 2, geo\[id\]\.len - 2\)\)/, 'the TIPS mesh is the whole drawn shunt, as before');
  assert.match(stage, /venousSync\(p, t < 0\.5, key !== overlayKey\)/, 'followed on every overlay update');
  assert.match(stage, /easeInOut\(v\.k\)/, 'it eases, never snaps');
  assert.match(stage, /reduceMotion\.matches \? 1 : dt/, 'reduced motion takes it in one step');
  assert.match(pres, /stented: stentedOf\(s\)/, 'a landing slide sets its veins');
  assert.match(pres, /stented: stentedKept\(s\)/, 'leaving a slide keeps only the veins the next one stents too');
  assert.match(pres, /stented: \[\]/, 'ending the presentation clears them');
});
