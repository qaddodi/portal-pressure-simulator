// The BRTO play takes a target (proc-anim.js PLUGS, procKindOf): { kind: 'brto', target: 'C6' } plays the same route into the spontaneous
// splenorenal shunt and closes it (Baveno VIII 6.12, embolization of a large shunt for persistent encephalopathy), while 'brto' alone is still
// the gastrorenal shunt, C5. And an occluded coronary vein, C1a, takes the esophageal varix's feeder (engine varixTarget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROCS, PROC_KINDS, PLUGS, specOf, procKindOf, procBlocked, procOffered, procFrame, stepMark, STEP_NUM } from '../src/ui/proc-anim.js';
import { LABEL_VESSEL } from '../src/ui/anatomy.js';
import { defaultParams } from '../src/engine/scenario.js';
import { runSteps } from './deck-states.js';
await import('./dom-shim.js');   // (the graph draws on the GPU, svg-gl.js, which loads only with a page)
const { eventLines, eventGraphOf, EVENT_WORD } = await import('../src/ui/event-graph.js');

const srs = () => ({ ...defaultParams(), spontaneous: { ...defaultParams().spontaneous, C6: true } });

test('a slide names the target; no target is the gastrorenal BRTO, and a target the kind does not take names no spec', () => {
  assert.equal(procKindOf('brto'), 'brto');
  assert.equal(procKindOf({ kind: 'brto', auto: true }), 'brto');
  assert.equal(procKindOf({ kind: 'brto', target: 'C5' }), 'brto');
  assert.equal(procKindOf({ kind: 'brto', target: 'C6' }), 'brtoC6');
  assert.equal(procKindOf('tips'), 'tips');
  assert.equal(procKindOf(undefined), null);
  assert.equal(specOf(procKindOf({ kind: 'tips', target: 'C6' })), null, 'an unknown target is caught by the deck test');
  assert.equal(specOf(procKindOf({ kind: 'brto', target: 'C9' })), null);
});

test('the target play stays off the HVPG card, and the default BRTO is unchanged', () => {
  assert.ok(!PROC_KINDS.includes('brtoC6') && PLUGS.brtoC6 && !PROCS.brtoC6);
  const p = { ...defaultParams(), spontaneous: { C5: true, C6: true } };
  const done = PROCS.brto.apply(structuredClone(p));
  assert.ok(done.occluded.C5 && !done.occluded.C6, 'BRTO closes C5 only');
  assert.deepEqual(PROCS.brto.before, { occluded: { C5: false } });
  assert.equal(PROCS.brto.steps[0][5], 'C5');
});

test('it needs a splenorenal shunt, says so when there is none or it is closed, and closes C6 and nothing else', () => {
  const P = specOf('brtoC6');
  assert.match(procBlocked('brtoC6', defaultParams()), /no splenorenal shunt/);
  assert.equal(procBlocked('brtoC6', srs()), '');
  const done = P.apply(structuredClone(srs()));
  assert.ok(P.had(done) && done.occluded.C6 && !done.occluded.C5);
  assert.match(procBlocked('brtoC6', done), /already closed/);
  assert.ok(!P.had(P.undo(structuredClone(done))));
  assert.ok(P.had(P.apply({})) && !P.had(structuredClone(P.before)), 'before undoes it');
  assert.ok(procOffered('brtoC6', srs()) && !procOffered('brtoC6', defaultParams()), 'offered only to a patient with the shunt');
  assert.ok(procOffered('brtoC6', done), 'and to one who has had it, so it can be watched again');
});

test('it plays like BRTO: four steps on the same timing, its callouts on C6 and the route\'s stations, and it eases in and out', () => {
  const P = specOf('brtoC6'), B = PROCS.brto;
  // (The same table of gaps as BRTO's, a leg of the route's own length: the splenorenal route is a little longer, hvpg-clock.js ROUTE_LEN.)
  assert.equal(P.stops.length, B.stops.length); assert.ok(P.T.travel1 > B.T.travel1 && P.T.end - P.T.back === B.T.end - B.T.back);
  assert.deepEqual(P.steps.map((s) => s[4]), ['way', 'tip', 'fill', 'work']);
  P.steps.forEach((s, i) => {
    assert.equal(s[5], 'C6'); assert.ok(s[7] > 0 && s[7] < 1);
    for (const n of s[6]) assert.ok(LABEL_VESSEL[n], `${n} is a station label`);
    assert.ok(s[3].length <= 8);
    assert.deepEqual(stepMark('brtoC6', i), { edges: ['C6'], label: `${STEP_NUM[i]} ${s[1]}`, num: STEP_NUM[i], word: s[1], kind: 'treat', f: s[7], pin: true, ghost: true });
  });
  assert.equal(procFrame('brtoC6', 0).u, 0);
  assert.equal(procFrame('brtoC6', P.T.fill1).column, 1);
  const end = procFrame('brtoC6', P.T.end);
  assert.equal(end.opacity, 0); assert.equal(end.step, -1);
});

test('the slide\'s graph names the closing, as BRTO\'s does', () => {
  assert.equal(EVENT_WORD.brtoC6, 'Shunt occluded');
  const s = { procedure: { kind: 'brto', target: 'C6' }, tiles: ['ppg', 'liver'] };
  assert.deepEqual(eventLines(s), ['ppg', 'liver']);
  assert.equal(eventGraphOf(s).kind, 'brtoC6');
  assert.equal(eventLines({ procedure: { kind: 'brto' }, tiles: ['ppg', 'liver'] }) !== null, true, 'the default still draws its graph');
});

test('in the model the play closes the shunt: the PPG and the liver\'s flow return, the encephalopathy index falls, and the esophageal varix grows back', async () => {
  const open = { preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30 };
  const [a, b] = await runSteps([open, { params: specOf('brtoC6').apply({ occluded: {} }), days: 60 }]);
  assert.ok(b.ppg > a.ppg + 5, `PPG ${a.ppg} to ${b.ppg}`);
  assert.ok(b.liver > a.liver + 15, `liver ${a.liver} to ${b.liver}`);
  assert.ok(b.he < a.he - 0.15, `index ${a.he} to ${b.he}`);
  assert.ok(b.varix > a.varix + 2, `varix ${a.varix} to ${b.varix}`);
});

test('an occluded coronary vein (C1a) takes the esophageal varix\'s feeder: it is a resting vein, not 7.3 mm, whatever the gradient', async () => {
  const [open, coiled, coiledLater] = await runSteps([{ preset: 'cirr-decomp' }, { preset: 'cirr-decomp', params: { occluded: { C1a: true } } }, { preset: 'cirr-decomp', params: { occluded: { C1a: true } }, days: 60 }]);
  assert.ok(open.varix > 6, `open ${open.varix}`);
  assert.ok(coiled.varix < 2.6 && coiledLater.varix < 2.6, `coiled ${coiled.varix}, ${coiledLater.varix}`);
  assert.ok(coiled.ppg > open.ppg - 0.5, `the portal pressure does not fall: ${open.ppg} to ${coiled.ppg}`);
});
