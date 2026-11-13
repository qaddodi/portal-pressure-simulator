// One colour per reading on every chart and monitor (unification audit, finding 2; 13 Nov 2026): the portal vein magenta (tr-pv), the WHVP orchid
// (tr-wedge), the FHVP blue (tr-hv), the IVC cyan (tr-ivc). The bedside monitor is dark in every look, so its colours (mon-*) are the dark looks' trace
// colours, one value each (theme-tokens.js DARK_TRACE). The sinusoidal pressure has a token of its own (tr-sin), so the WHVP's colour means the WHVP.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TOKENS } = await import('../src/ui/theme-tokens.js');
const { MON_TOKENS } = await import('../src/ui/monitor.js');
const { scriptById, SCRIPT_IDS } = await import('../src/ui/tool-reading.js');
const { TRACES } = await import('../src/ui/pressure-time.js');
const { lineMeta } = await import('../src/ui/tool-curve.js');
const { LINE } = await import('../src/ui/flow-time.js');
const { LINES: TALK } = await import('../src/ui/talk-trace.js');

const ONE = { pv: 'tr-pv', whvp: 'tr-wedge', fhvp: 'tr-hv', ivc: 'tr-ivc' };
const MON = { pv: 'mon-pv', whvp: 'mon-wedge', fhvp: 'mon-free', ivc: 'mon-ivc' };

test('the monitor wears the dark looks\' colour of each reading', () => {
  for (const k of Object.keys(ONE)) {
    assert.equal(TOKENS.light[MON[k]], TOKENS.dark[ONE[k]], `${k}: ${MON[k]} is the dark look's ${ONE[k]}`);
    for (const look of ['navy', 'black']) assert.ok(!(ONE[k] in TOKENS[look]) && !(MON[k] in TOKENS[look]), `${look} keeps Dark's ${k}`);
  }
});

test('each monitor script draws each reading in that reading\'s colour', () => {
  // (Each script's two readings, a and b: the HVPG's free then wedged, the EUS-PPG's portal then hepatic vein (a hepatic vein reads as the FHVP does), the PPG's IVC
  // then portal vein, the TIPS gradient's portal vein then IVC.)
  const READ = { hvpg: { a: 'fhvp', b: 'whvp' }, eus: { a: 'pv', b: 'fhvp' }, ppg: { a: 'ivc', b: 'pv' }, tips: { a: 'pv', b: 'ivc' } };
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id);
    for (const [, , key, ck] of S.drops) assert.equal(MON_TOKENS[ck], `--${MON[READ[id][key]]}`, `${id} marker ${key}`);
    for (const [, key, ck] of S.levels) assert.equal(MON_TOKENS[ck], `--${MON[READ[id][key]]}`, `${id} level ${key}`);
  }
});

test('the beat trace, the parameter curve and the flow-time chart draw each reading in its one token', () => {
  const lane = Object.fromEntries(TRACES.map((t) => [t.id, t.c]));
  assert.equal(lane.CONF, '--tr-pv'); assert.equal(lane.whvp, '--tr-wedge'); assert.equal(lane.RHV, '--tr-hv'); assert.equal(lane.IVCS, '--tr-ivc');
  for (const k of Object.keys(ONE)) assert.equal(lineMeta(k).c, `--${ONE[k]}`, `curve ${k}`);
  assert.equal(lineMeta('sin').c, '--tr-sin', 'the curve\'s sinusoidal pressure is not the WHVP\'s colour');
  assert.equal(LINE.pv[3], '--tr-pv');
  assert.equal(LINE.sin[3], '--tr-sin', 'the flow-time chart\'s sinusoidal pressure is not the WHVP\'s colour');
  for (const look of ['light', 'dark']) assert.ok(TOKENS[look]['tr-sin'], `${look} defines tr-sin`);
});

test('the talk trace: the portal vein in its token; the WHVP and FHVP wait on one colour change (violet and grey until then)', () => {
  // (Its WHVP line runs beside the portal vein's: pink against orchid is OKLab ΔE 9.9 on the dark looks, under the palette floor of 15, so the talk trace keeps
  // violet --s7 and a grey dashed FHVP. The standard is to change tr-wedge once, everywhere, monitor included: the owner's colour pick. When it is made, this
  // test moves to tr-wedge and tr-hv.)
  const c = Object.fromEntries(TALK.map(([k, , col]) => [k, col]));
  assert.equal(c.pv, '--tr-pv');
  assert.deepEqual({ whvp: c.whvp, fhvp: c.fhvp }, { whvp: '--s7', fhvp: '--text-3' });
});
