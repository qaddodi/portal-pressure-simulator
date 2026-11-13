// The measurement tracing card (tool-reading.js; the gradients talk, Option A, 13 Nov 2026) and the talk's numbers on the span ruler: which way of reading
// each procedure is drawn with, that the trace stays blank until the first reading and grows only as the procedure's clock runs, that each reading
// shows only once it is taken, and that the talk's patients give the ruler the states its slides teach.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { scriptOf, scriptById, SCRIPT_IDS, progressOf, marksOf, traceInto, yMaxOf, readingWords } = await import('../src/ui/tool-reading.js');
const { specOf } = await import('../src/ui/proc-anim.js');
const { LOOKS, HOSTS } = await import('../src/ui/chart-looks/index.js');
const { GRADIENTS } = await import('../src/ui/decks/gradients.js');
const { deckStates } = await import('./deck-states.js');
const { spansState } = await import('../src/ui/tool-spans.js');
const { hvpgSev, ppgSev } = await import('../src/engine/pressure-cuts.js');

test('each procedure the talk measures has its way of reading, the chained PPG by IR one of them', () => {
  assert.equal(scriptOf('hvpgcath'), scriptById('hvpg'));
  assert.equal(scriptOf('eus'), scriptById('eus'));
  assert.equal(scriptOf({ kind: 'irivc', then: 'irpv' }), scriptById('ppg'));
  assert.equal(scriptOf('irpv'), scriptById('ppg'));
  assert.equal(scriptOf('tipsgrad'), scriptById('tips'));
  assert.equal(scriptOf('scope'), null);
  assert.equal(scriptOf(undefined), null);
  assert.deepEqual(scriptById('ppg').kinds, ['irivc', 'irpv']);
  assert.equal(scriptById('tips').target, 12);
  assert.equal(scriptById('hvpg').sev, hvpgSev);
  assert.equal(scriptById('eus').sev, hvpgSev);
  assert.equal(scriptById('ppg').sev, ppgSev);
});

test('every phase and mark lies inside its procedure\'s own time, in order', () => {
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id);
    let lastX = 0;
    for (const [kind, t0, t1, x0, x1] of S.phases) {
      const T = specOf(kind).T;
      assert.ok(S.kinds.includes(kind), `${id}: ${kind}`);
      assert.ok(Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 && t0 >= 0, `${id} ${kind}: ${t0}..${t1}`);
      assert.ok(t1 <= (T.end ?? Infinity), `${id} ${kind}: ends inside the run`);
      assert.ok(x0 >= lastX - 1e-9 && x1 > x0 && x1 <= 0.86 + 1e-9, `${id}: the plot fills left to right`);
      lastX = x1;
    }
    for (const [kind, at] of S.marks) assert.ok(S.kinds.includes(kind) && Number.isFinite(at) && at >= 0, `${id}: mark at ${at}`);
  }
});

test('blank before the procedure, growing with its clock, held when it stops, and set back when it runs again', () => {
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id), M = [0, 0, 0];
    assert.equal(progressOf(S, {}), 0, `${id}: nothing drawn before it runs`);
    assert.deepEqual(marksOf(S, {}, M), [0, 0, 0], `${id}: no reading before it is taken`);
    const last = S.phases[S.phases.length - 1], endT = {};
    for (const k of S.kinds) endT[k] = specOf(k).T.end;
    let prev = -1;
    // (the clock through every kind in turn: the trace never runs backwards while the clock runs forwards)
    for (const k of S.kinds) {
      const tk = {};
      for (const j of S.kinds) { if (j === k) break; tk[j] = endT[j]; }
      for (let t = 0; t <= endT[k]; t += 250) { tk[k] = t; const x = progressOf(S, tk); assert.ok(x >= prev - 1e-9, `${id} ${k} ${t}: ${x} < ${prev}`); prev = x; }
    }
    assert.ok(Math.abs(progressOf(S, endT) - last[4]) < 1e-9, `${id}: whole at the end`);
    assert.deepEqual(marksOf(S, endT, M), [1, 1, 1], `${id}: every reading shows at the end`);
    // (just before the first reading is marked, it is not shown yet; the gradient shows only after both readings)
    const [k0, at0] = S.marks[0];
    assert.equal(marksOf(S, { [k0]: at0 - 1 }, M)[0], 0, `${id}: the first reading is not shown before it is taken`);
    const [k2, at2] = S.marks[2], before = { ...endT, [k2]: at2 - 1 };
    if (k2 === S.kinds[S.kinds.length - 1]) assert.equal(marksOf(S, before, M)[2], 0, `${id}: the gradient waits for its second reading`);
    assert.ok(S.marks[1][1] <= S.marks[2][1] || S.marks[1][0] !== S.marks[2][0], `${id}: the second reading before the gradient`);
  }
});

test('the trace: the first plateau at its reading, the second at its own, inside the buffers, the climb only where the wedge climbs', () => {
  const a = new Float32Array(64), b = new Float32Array(64);
  for (const id of SCRIPT_IDS) {
    const S = scriptById(id), top = yMaxOf(9, 21);
    assert.deepEqual(traceInto(S, 9, 21, 0, top, a, b), [0, 0], `${id}: blank at 0`);
    const [na, nb] = traceInto(S, 9, 21, 0.86, top, a, b);
    assert.ok(na >= 2 && nb >= 2 && na * 2 <= 64 && nb * 2 <= 64, `${id}: ${na} and ${nb} points`);
    const ya = a[2 * na - 1], yb = b[2 * nb - 1];
    assert.ok(yb < ya, `${id}: 21 mmHg draws higher than 9`);
    for (let i = 0; i < nb; i++) assert.ok(Number.isFinite(b[2 * i]) && Number.isFinite(b[2 * i + 1]));
    const [, nbMid] = traceInto(S, 9, 21, (S.phases[0][4] + S.phases[S.phases.length - 1][3]) / 2, top, a, b);
    if (S.join === 'gap') assert.equal(nbMid, 0, `${id}: out and in again, nothing between the readings`);
    else assert.ok(nbMid >= 2, `${id}: the ${S.join} is drawn`);
  }
  assert.equal(yMaxOf(20, 21), 30);
  assert.equal(yMaxOf(20, 31), 40);
});

test('the card speaks only the readings already taken', () => {
  const S = scriptById('hvpg');
  assert.equal(readingWords(S, [8, 19.6, 11.6], [1, 0, 0]), 'FHVP 8.0 mmHg, WHVP not read yet, HVPG not read yet.');
  assert.equal(readingWords(S, [8, 19.6, 11.6], [1, 1, 1]), 'FHVP 8.0 mmHg, WHVP 19.6 mmHg, HVPG 11.6 mmHg.');
});

test('the card\'s looks are registered, with their host', () => {
  for (const k of ['rd.panel', 'rd.grid', 'rd.ax', 'rd.key', 'rd.val', 'rd.res', 'rd.line', 'rd.head', 'rd.tag', 'rd.brk', 'rd.pill', 'rd.pillw', 'rd.wait', 'rd.target', 'rd.tword']) assert.ok(LOOKS[k], k);
  assert.equal(typeof HOSTS.reading, 'function');
});

test('the talk: a tracing on every measurement slide, the ruler on every comparison, and the states each slide teaches', async () => {
  const by = Object.fromEntries(GRADIENTS.slides.map((s) => [s.id, s]));
  for (const s of GRADIENTS.slides) if (s.procedure) assert.equal(s.tool?.kind, 'reading', `${s.id}: a measurement draws its tracing`);
  for (const s of GRADIENTS.slides) if (s.tool?.kind === 'reading') assert.ok(scriptOf(s.procedure), `${s.id}: the card follows its procedure`);
  for (const id of ['where', 'agree', 'masld', 'psvd', 'bc']) assert.equal(by[id].tool?.kind, 'spans', id);
  assert.equal(by.where.tool.empty, true);
  const states = await deckStates(GRADIENTS), st = (id) => {
    const i = GRADIENTS.slides.findIndex((s) => s.id === id);
    return spansState(states[i], { blocked: id === 'bc' });
  };
  const lane = (S, k) => S.lanes.find((L) => L.key === k).st;
  const agree = st('agree'), masld = st('masld'), psvd = st('psvd'), bc = st('bc');
  assert.deepEqual(['hvpg', 'eus', 'ppg'].map((k) => lane(agree, k)), ['hit', 'hit', 'hit'], 'cirrhosis: all three agree');
  assert.deepEqual(['hvpg', 'eus', 'ppg'].map((k) => lane(masld, k)), ['part', 'hit', 'hit'], 'MASLD: the HVPG misses part');
  assert.deepEqual(['hvpg', 'eus', 'ppg'].map((k) => lane(psvd, k)), ['miss', 'hit', 'hit'], 'PSVD: the HVPG misses');
  assert.deepEqual(['hvpg', 'eus', 'ppg'].map((k) => lane(bc, k)), ['blank', 'blank', 'hit'], 'Budd–Chiari: only the PPG reads');
  // (the MASLD slide's point: the HVPG under 10 while the PPG is 12 or more)
  const i = GRADIENTS.slides.findIndex((s) => s.id === 'masld');
  assert.ok(states[i].hvpg < 10 && states[i].ppg >= 12, `MASLD: HVPG ${states[i].hvpg}, PPG ${states[i].ppg}`);
  const t = GRADIENTS.slides.findIndex((s) => s.id === 'tips');
  assert.ok(states[t].ppg < 12, `after the TIPS the PPG meets its target (${states[t].ppg})`);
  const p = GRADIENTS.slides.findIndex((s) => s.id === 'psvd-q');
  assert.ok(states[p].hvpg < 6, `PSVD: a normal HVPG (${states[p].hvpg})`);
  // (the summary table's misses name the slides' own states)
  const sum = by.summary.of;
  assert.deepEqual(sum.find((r) => r.id === 'masld').missPart, ['hvpg']);
  assert.deepEqual(sum.find((r) => r.id === 'psvd').miss, ['hvpg']);
  assert.deepEqual(sum.find((r) => r.id === 'bc').blank, ['hvpg', 'eus']);
});
