// The measurement card (tool-reading.js) on the one pressure monitor (monitor.js; Mohammad, 13 Nov 2026: "this specifically", "standardize", "those
// have to be PERFECT"), checked by numbers for every measurement: the monitor waits until the tip is in, then reads the first pressure, the second and
// the gradient in that order, each on its own Next; a level changes in the vein only as the balloon fills or the catheter is drawn back, never in a
// step; the wedge keeps its beat and breath; the waves are a pure function of the procedure's clock (drawn the same every time, never reshuffled), so
// Back runs the trace back exactly; and the talk's patients give the ladder the numbers its slides teach.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { scriptOf, scriptById, SCRIPT_IDS, phaseOf, takenOf, readingWords } = await import('../src/ui/tool-reading.js');
const { specOf, markAt } = await import('../src/ui/proc-anim.js');
const { WAVE_GAIN, WEDGE_DAMP } = await import('../src/ui/hvpg-clock.js');
const { keepData, dataPlan } = await import('../src/ui/card-keep.js');
const { GRADIENTS } = await import('../src/ui/decks/gradients.js');
const { deckStates } = await import('./deck-states.js');
const { hvpgSev, ppgSev } = await import('../src/engine/pressure-cuts.js');

const V = { hvpg: { a: 5.3, b: 16.9, g: 11.6 }, eus: { a: 15.1, b: 2.6, g: 12.5 }, ppg: { a: 4.4, b: 17.9, g: 13.5 }, tips: { a: 14.2, b: 5.0, g: 9.2 } };
const stops = (kind) => specOf(kind).stops;

test('each measuring procedure is drawn on the one monitor, the chained PPG by IR one of them', () => {
  assert.equal(scriptOf('hvpgcath'), scriptById('hvpg'));
  assert.equal(scriptOf('eus'), scriptById('eus'));
  assert.equal(scriptOf({ kind: 'irivc', then: 'irpv' }), scriptById('ppg'));
  assert.equal(scriptOf('tipsgrad'), scriptById('tips'));
  assert.equal(scriptOf('scope'), null);
  assert.deepEqual(scriptById('ppg').kinds, ['irivc', 'irpv']);
  assert.equal(scriptById('tips').target, 12);
  assert.equal(scriptById('hvpg').sev, hvpgSev);
  assert.equal(scriptById('eus').sev, hvpgSev);
  assert.equal(scriptById('ppg').sev, ppgSev);
  assert.equal(scriptById('tips').sev, ppgSev);
});

test('the monitor waits for the tip: nothing is drawn or read before the procedure starts, or while the tip is on its way', () => {
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id), k = S.kinds[0];
    assert.equal(phaseOf(S, {}), 'idle', `${id}: before Next`);
    assert.notEqual(phaseOf(S, { [k]: 0 }), 'run', `${id}: the catheter or scope only starting in`);
    assert.ok(!Number.isFinite(S.at(-1, V[id], null)), `${id}: no trace before the tip is in`);
    assert.deepEqual(takenOf(S, {}), [false, false, false]);
  }
});

test('Next by Next: the first reading on its step, then the second, then the gradient, never one before its step', () => {
  // HVPG: catheter in | FHVP | WHVP | HVPG
  const H = scriptById('hvpg'), hs = stops('hvpgcath');
  const at = (t) => takenOf(H, { hvpgcath: t });
  assert.deepEqual(at(hs[0]), [false, false, false], 'catheter in: nothing read');
  assert.deepEqual(at(hs[1]), [true, false, false], 'FHVP');
  assert.deepEqual(at(hs[2]), [true, true, false], 'then WHVP');
  assert.deepEqual(at(hs[3]), [true, true, true], 'then HVPG');
  // EUS-PPG: scope in | PV | HV | EUS-PPG
  const E = scriptById('eus'), es = stops('eus');
  assert.deepEqual(takenOf(E, { eus: es[0] }), [false, false, false]);
  assert.deepEqual(takenOf(E, { eus: es[1] }), [true, false, false]);
  assert.deepEqual(takenOf(E, { eus: es[2] }), [true, true, false]);
  assert.deepEqual(takenOf(E, { eus: es[3] }), [true, true, true]);
  // PPG by IR: catheter in | IVC, then (the chained reading) needle in | PV and PPG
  const P = scriptById('ppg'), is = stops('irivc'), ps = stops('irpv');
  assert.deepEqual(takenOf(P, { irivc: is[0] }), [false, false, false]);
  assert.deepEqual(takenOf(P, { irivc: is[1] }), [true, false, false]);
  assert.deepEqual(takenOf(P, { irivc: is[1], irpv: ps[0] }), [true, false, false]);
  assert.deepEqual(takenOf(P, { irivc: is[1], irpv: ps[1] }), [true, true, false]);
  assert.deepEqual(takenOf(P, { irivc: is[1], irpv: ps[2] }), [true, true, true]);
  // TIPS: one step, the gradient after both readings
  const G = scriptById('tips'), gs = stops('tipsgrad');
  assert.deepEqual(takenOf(G, { tipsgrad: gs[0] }), [true, true, true]);
  for (const id of SCRIPT_IDS) { const m = scriptById(id).marks; assert.ok(m[0] < m[1] && m[1] < m[2], `${id}: in order`); }
});

test('the HVPG: the trace holds at the free pressure until the balloon starts to fill, rises with it, and keeps its beat and breath once wedged', () => {
  const S = scriptById('hvpg'), v = V.hvpg, T = specOf('hvpgcath').T, s = (x) => S.clock.now({ hvpgcath: x });
  const i0 = s(T.inflate0), i1 = s(T.inflate1);
  for (let t = 0; t < i0; t += 25) assert.equal(S.lv(t, v), v.a, `free at ${t}`);
  let last = v.a;
  for (let t = i0; t <= i1; t += 25) { const p = S.lv(t, v); assert.ok(p >= last - 1e-9, `the rise never falls back at ${t}`); last = p; }
  assert.ok(Math.abs(S.lv(i1, v) - v.b) < 1e-9, 'wedged once the balloon is up');
  assert.ok(S.lv(i0 + (i1 - i0) / 2, v) > v.a + 1 && S.lv(i0 + (i1 - i0) / 2, v) < v.b - 1, 'half way up half way through the balloon');
  // (The wedge carries a softened beat and breath, not a ruler-flat line: at least 0.05 mmHg of swing, and no more than the free trace's.)
  const swing = (a, b) => { let lo = Infinity, hi = -Infinity; for (let t = a; t < b; t += 10) { const p = S.at(t, v, null); lo = Math.min(lo, p); hi = Math.max(hi, p); } return hi - lo; };
  const free = swing(0, Math.min(i0, 3600)), wedge = swing(i1 + 100, i1 + 3700);
  assert.ok(wedge > 0.05, `the wedge has its beat and breath: ${wedge.toFixed(2)} mmHg`);
  assert.ok(wedge < free, `softer than the free trace: ${wedge.toFixed(2)} against ${free.toFixed(2)}`);
  assert.ok(WEDGE_DAMP < 0.6 && WAVE_GAIN > 0);
});

test('no trace ever steps: a level changes only by riding the balloon or the catheter drawn back, and a gap is left blank', () => {
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id), v = V[id];
    let prev = NaN, steps = 0;
    for (let t = 0; t <= S.win[1]; t += 30) {
      const p = S.at(t, v, null);
      if (Number.isFinite(p) && Number.isFinite(prev)) assert.ok(Math.abs(p - prev) < 1, `${id} at ${t}: ${prev.toFixed(2)} to ${p.toFixed(2)}`);
      if (Number.isFinite(p) !== Number.isFinite(prev)) steps++;
      prev = p;
    }
    // (A trace starts once and, where the tip leaves one vein for another (the EUS needle, the second way in for the PPG), stops and starts once more;
    // the EUS needle comes out of the hepatic vein before the gradient.)
    assert.ok(steps <= ({ eus: 4, ppg: 3 }[id] ?? 1), `${id}: ${steps} starts and stops`);
  }
});

test('the waves are drawn the same every time: a pure function of the procedure\'s clock, so Back runs the trace back exactly', () => {
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id), v = V[id];
    const pass = () => { const a = []; for (let t = 0; t <= S.win[1]; t += 97) a.push(S.at(t, v, null)); return a; };
    const one = pass();
    for (let t = S.win[1]; t >= 0; t -= 53) S.at(t, v, null);   // (Back: the clock running down)
    assert.deepEqual(pass(), one, `${id}: the same trace after going back`);
  }
  // (The clock itself only moves with the procedure's: forward and back along the same line.)
  const P = scriptById('ppg');
  let last = -Infinity;
  for (let t = 0; t <= specOf('irivc').T.end; t += 200) { const s = P.clock.now({ irivc: t }); if (Number.isFinite(s)) { assert.ok(s >= last); last = s; } }
  const ivcEnd = P.clock.now({ irivc: specOf('irivc').T.end });
  for (let t = 0; t <= specOf('irpv').T.travel1; t += 300) assert.ok(P.clock.now({ irivc: specOf('irivc').T.end, irpv: t }) >= ivcEnd, 'the second way in never replays the IVC');
  assert.ok(P.clock.now({ irivc: specOf('irivc').T.end, irpv: 0 }) < P.clock.now({ irivc: specOf('irivc').T.end, irpv: specOf('irpv').T.read0 }));
});

test('each measurement reads what its tip is in: the EUS needle in neither vein between its readings, the TIPS reading falling as the catheter is drawn back', () => {
  const E = scriptById('eus'), ET = specOf('eus').T, es = (x) => E.clock.now({ eus: x });
  assert.equal(E.lv(es(ET.pvRead0), V.eus), V.eus.a);
  assert.ok(!Number.isFinite(E.lv(es(ET.move0), V.eus)), 'needle out between the veins');
  assert.equal(E.lv(es(ET.hvRead0), V.eus), V.eus.b);
  const G = scriptById('tips'), GT = specOf('tipsgrad').T, gs = (x) => G.clock.now({ tipsgrad: x });
  assert.equal(G.lv(gs(GT.pvRead0), V.tips), V.tips.a);
  const mid = G.lv(gs((GT.pull0 + GT.pull1) / 2), V.tips);
  assert.ok(mid < V.tips.a && mid > V.tips.b, 'falls with the pull');
  assert.equal(G.lv(gs(GT.ivRead0), V.tips), V.tips.b);
  const P = scriptById('ppg');
  assert.equal(P.lv(P.clock.now({ irivc: specOf('irivc').T.read0 }), V.ppg), V.ppg.a);
  assert.equal(P.lv(P.clock.now({ irivc: specOf('irivc').T.end, irpv: specOf('irpv').T.read0 }), V.ppg), V.ppg.b);
});

test('the card speaks only the readings already taken', () => {
  const S = scriptById('hvpg');
  assert.equal(readingWords(S, V.hvpg, [true, false, false]), 'FHVP 5.3 mmHg, WHVP not read yet, HVPG not read yet.');
  assert.equal(readingWords(S, V.hvpg, [true, true, true]), 'FHVP 5.3 mmHg, WHVP 16.9 mmHg, HVPG 11.6 mmHg.');
});

test('the monitor stays in place from one measurement slide to the next: only the measurement changes', () => {
  const tool = { kind: 'reading' };
  const a = { title: 'A', line: 'a', procedure: 'hvpgcath', tool }, b = { title: 'B', line: 'b', procedure: 'eus', tool }, c = { title: 'C', line: 'c', procedure: { kind: 'irivc', then: 'irpv' }, tool };
  const p = dataPlan(a);
  assert.equal(dataPlan(b), p);
  assert.equal(keepData({ from: p, to: p, prev: a, next: b }), true);
  assert.equal(keepData({ from: p, to: p, prev: b, next: c }), true);
  assert.equal(keepData({ from: p, to: p, prev: c, next: { ...a, vignette: 'x' } }), false, 'a case card still owns its order of cards');
  assert.equal(keepData({ from: p, to: p, prev: a, next: { ...b, tool: { kind: 'evgraph' } } }), false);
});

test('the talk: the monitor on every measurement slide, the ladder on every comparison, and the numbers each slide teaches', async () => {
  const by = Object.fromEntries(GRADIENTS.slides.map((s) => [s.id, s]));
  for (const s of GRADIENTS.slides) if (s.procedure) assert.equal(s.tool?.kind, 'reading', `${s.id}: a measurement draws its monitor`);
  for (const s of GRADIENTS.slides) if (s.tool?.kind === 'reading') assert.ok(scriptOf(s.procedure), `${s.id}: the card follows its procedure`);
  // (The comparisons draw the pressure ladder with all three gradients, the span ruler gone: Mohammad, 13 Nov 2026, "I like the ladder card ... Just add EUS PPG to it".)
  for (const id of ['where', 'agree', 'masld', 'psvd', 'bc']) { assert.equal(by[id].tool?.kind, 'profile', id); assert.deepEqual(by[id].tool.spans, id === 'where' ? [] : ['hvpg', 'eus', 'ppg'], id); }   // (the opening slide draws no bracket: the raw pressures first, Mohammad, 13 Nov 2026)
  assert.ok(!GRADIENTS.slides.some((s) => s.tool?.kind === 'spans'));
  const states = await deckStates(GRADIENTS);
  const at = (id) => states[GRADIENTS.slides.findIndex((s) => s.id === id)];
  assert.ok(at('psvd').eus - at('psvd').hvpg > 3, `PSVD: EUS-PPG ${at('psvd').eus} reads the resistance the HVPG ${at('psvd').hvpg} misses`);
  const i = GRADIENTS.slides.findIndex((s) => s.id === 'masld');
  assert.ok(states[i].hvpg < 10 && states[i].ppg >= 12, `MASLD: HVPG ${states[i].hvpg}, PPG ${states[i].ppg}`);
  const t = GRADIENTS.slides.findIndex((s) => s.id === 'tips');
  assert.ok(states[t].ppg < 12, `after the TIPS the PPG meets its target (${states[t].ppg})`);
  const p = GRADIENTS.slides.findIndex((s) => s.id === 'psvd-q');
  assert.ok(states[p].hvpg < 6, `PSVD: a normal HVPG (${states[p].hvpg})`);
  const sum = by.summary.of;
  assert.deepEqual(sum.find((r) => r.id === 'masld').missPart, ['hvpg']);
  assert.deepEqual(sum.find((r) => r.id === 'psvd').miss, ['hvpg']);
  assert.deepEqual(sum.find((r) => r.id === 'bc').blank, ['hvpg', 'eus']);
  assert.ok(markAt('hvpgcath', 3) > markAt('hvpgcath', 2));
});

test('a gradient is the difference of its two readings as printed, never a later frame\'s (unification audit, finding 5)', async () => {
  // (A slide still easing: each step's frame reads a little higher than the last.)
  const fr = (k) => ({ metrics: { fhvp: 5.26 + k, whvp: 16.94 + k, hvpg: 11.68 + k, pv: 17.94 + k, ivc: 4.43 + k, ppg: 13.51 + k } });
  const H = specOf('hvpgcath'), rh = {};
  H.capture(1, rh, fr(0)); H.capture(2, rh, fr(0.3)); H.capture(3, rh, fr(0.6));
  assert.equal(rh.hv, Math.round((rh.wh - rh.fh) * 10) / 10, `HVPG ${rh.hv} from WHVP ${rh.wh} and FHVP ${rh.fh}`);
  const P = specOf('irpv'), rp = {};
  P.capture(1, rp, fr(0)); P.capture(2, rp, fr(0.3));
  assert.equal(rp.ppg, Math.round((rp.pv - rp.iv) * 10) / 10, `PPG ${rp.ppg} from PV ${rp.pv} and IVC ${rp.iv}`);
  // (The EUS-PPG's needle reads two veins' node pressures; the TIPS gradient reads both when its result comes: each gradient the printed difference too.)
  const { NODES } = await import('../src/engine/topology.js');
  const ni = (id) => NODES.findIndex((n) => n.id === id), nodesAt = (k) => { const P2 = new Float64Array(NODES.length); P2[ni('LPV')] = 15.06 + k; P2[ni('LHV')] = 2.64 + k; return { P: P2 }; };
  const E = specOf('eus'), re = {};
  E.capture(1, re, nodesAt(0)); E.capture(2, re, nodesAt(0.37));
  assert.equal(re.ppg, Math.round((re.pv - re.hv) * 10) / 10, `EUS-PPG ${re.ppg} from PV ${re.pv} and HV ${re.hv}`);
  const E2 = {}; E.capture(1, E2, null); E.capture(2, E2, nodesAt(0));
  assert.ok(Number.isNaN(E2.ppg), 'no portal reading, no gradient');
  const G = specOf('tipsgrad'), rg = {};
  G.capture(0, rg, fr(0.45));
  assert.equal(rg.ppg, Math.round((rg.pv - rg.iv) * 10) / 10, `TIPS PPG ${rg.ppg} from PV ${rg.pv} and IVC ${rg.iv}`);
  const G2 = {}; G.capture(0, G2, null);
  assert.ok(Number.isNaN(G2.ppg), 'no frame, no gradient');
});

test('every slide that measures a gradient on its own draws it on the one monitor, never as numbers alone', async () => {
  const { DECKS } = await import('../src/ui/decks.js');
  const MEASURES = ['hvpgcath', 'eus', 'irivc', 'irpv', 'tipsgrad'];
  const bad = [];
  for (const d of DECKS) for (const s of d.slides || []) {
    const k = typeof s.procedure === 'object' && s.procedure ? s.procedure.kind : s.procedure;
    // (A TIPS placed and then measured, `then: 'tipsgrad'`, teaches the stent: its card is the stent's graph.)
    if (MEASURES.includes(k) && s.tool?.kind !== 'reading') bad.push(`${d.id}/${s.id}`);
  }
  assert.deepEqual(bad, []);
});

test('every gradient card takes its title from one rule, and the HVPG catheter\'s words from one table (unification audit, finding 1)', async () => {
  const { monitorTitle, HVPG_TEXT } = await import('../src/ui/monitor.js');
  const { readingTitle } = await import('../src/ui/tool-reading.js');
  const { HVPG_SCRIPT } = await import('../src/ui/hvpg-proc.js');
  const { DECKS } = await import('../src/ui/decks.js');
  const teaching = (await import('../src/ui/ext-teaching.js')).default;
  // (The HVPG's card reads "HVPG, catheter tracing" wherever it is drawn: the catheter's card, tool-hvpg.js, the presenter's TITLE.hvpg, and a procedure
  // slide's card on the HVPG; every other measurement reads "Pressure tracing".)
  assert.equal(monitorTitle('hvpg'), 'HVPG, catheter tracing');
  for (const id of SCRIPT_IDS) assert.equal(monitorTitle(id), id === 'hvpg' ? 'HVPG, catheter tracing' : 'Pressure tracing', id);
  assert.equal(readingTitle('hvpgcath'), monitorTitle('hvpg'));
  assert.equal(readingTitle({ kind: 'irivc', then: 'irpv' }), monitorTitle('ppg'));
  const seen = new Set();
  for (const d of DECKS) for (const s of d.slides || []) {
    if (s.tool?.kind !== 'reading' || !scriptOf(s.procedure)) continue;
    const want = s.tool.title || monitorTitle(scriptOf(s.procedure).id);
    assert.equal(teaching.tools.reading.title(s.tool, s), want, `${d.id}/${s.id}`);
    seen.add(scriptOf(s.procedure).id);
  }
  assert.ok(seen.has('hvpg') && seen.has('eus') && seen.has('ppg'), [...seen].join(' '));
  // (Measure › HVPG and the procedure slide's HVPG card wait with the same words: the one table.)
  assert.equal(HVPG_SCRIPT.notes, HVPG_TEXT.notes);
  assert.equal(HVPG_SCRIPT.heads, HVPG_TEXT.heads);
  assert.equal(scriptById('hvpg').notes, HVPG_TEXT.notes);
  assert.equal(scriptById('hvpg').heads, HVPG_TEXT.heads);
});
