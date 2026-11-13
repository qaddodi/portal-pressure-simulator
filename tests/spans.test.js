// The span ruler (tool-spans.js; the gradients talk, Option A, 13 Nov 2026): its states for each patient of the talk, its fixed height and its looks.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { spansState, spansLayout, spansWords, RES_MIN, TAGS, EMPTY_NOTE } = await import('../src/ui/tool-spans.js');
const { LOOKS, HOSTS } = await import('../src/ui/chart-looks/index.js');
const { Engine } = await import('../src/engine/engine.js');
const { computeMetrics } = await import('../src/engine/metrics.js');
const { fingerprintOf } = await import('../src/engine/fingerprint.js');
const { hvBlocked } = await import('../src/engine/pressure-cuts.js');

const { measure: meas } = await import('../src/ui/glyph-measure.js');
const fpOf = (id) => { const e = new Engine(); e.loadPreset(id); const m = computeMetrics(e); return { fp: fingerprintOf(m, { P: e.P, Q: e.Q, D: e.D, params: e.params }), params: e.params }; };
const stOf = (id) => { const { fp, params } = fpOf(id); return spansState(fp, { blocked: hvBlocked(params) }); };
const lane = (S, k) => S.lanes.find((L) => L.key === k);

test('the fingerprint carries the EUS needle\'s two veins', () => {
  const { fp } = fpOf('csph');
  assert.ok(Number.isFinite(fp.lpv) && Number.isFinite(fp.lhv));
  assert.ok(Math.abs(fp.lpv - fp.lhv - fp.eus) < 0.06, 'EUS-PPG is LPV minus LHV');
});

test('cirrhosis: the resistance is in the sinusoids and all three brackets hold it', () => {
  const S = stOf('csph');
  assert.equal(S.res, 2);
  assert.ok(S.drops[2] >= RES_MIN);
  for (const L of S.lanes) assert.equal(L.st, 'hit', L.key);
  assert.equal(lane(S, 'hvpg').rate, 'hi');
});

test('MASLD with the slide\'s portal-tract scar: the HVPG misses part', () => {
  const S0 = stOf('masld-csph');
  assert.equal(S0.res, 2);
  // (the talk's slide adds a little presinusoidal scar: a portal-tract drop >= RES_MIN beside the sinusoids)
  const fp = { ...fpOf('masld-csph').fp };
  fp.lpv = fp.whvp + 3.5; fp.pv = fp.lpv + 0.4;
  const S = spansState(fp);
  assert.equal(lane(S, 'hvpg').st, 'part');
  assert.equal(lane(S, 'eus').st, 'hit');
  assert.equal(lane(S, 'ppg').st, 'hit');
});

test('PSVD and schistosomiasis: the resistance is in the portal tracts and the HVPG misses it', () => {
  for (const id of ['psvd', 'schisto']) {
    const S = stOf(id);
    assert.equal(S.res, 1, id);
    assert.equal(lane(S, 'hvpg').st, 'miss', id);
    assert.equal(lane(S, 'eus').st, 'hit', id);
    assert.equal(lane(S, 'ppg').st, 'hit', id);
  }
});

test('Budd–Chiari: the HVPG and EUS-PPG cannot be read, the PPG holds the outflow drop', () => {
  const S = stOf('budd-chiari');
  assert.equal(S.res, 3);
  assert.equal(lane(S, 'hvpg').st, 'blank');
  assert.equal(lane(S, 'eus').st, 'blank');
  assert.equal(lane(S, 'hvpg').v, null);
  assert.equal(lane(S, 'ppg').st, 'hit');
  assert.equal(lane(S, 'ppg').rate, 'hi');
});

test('healthy and heart failure: no zone loses >= RES_MIN, so nothing is missed', () => {
  for (const id of ['healthy', 'rhf']) {
    const S = stOf(id);
    assert.equal(S.res, -1, id);
    for (const L of S.lanes) assert.equal(L.st, 'hit', `${id} ${L.key}`);
  }
});

test('the empty ruler: no bars, no readings, its note', () => {
  const S = spansState(fpOf('csph').fp, { empty: true });
  assert.equal(S.empty, true);
  assert.equal(S.drops, null);
  for (const L of S.lanes) { assert.equal(L.v, null); assert.equal(L.rate, null); }
  const L = spansLayout(S, 352, 12, meas);
  assert.ok(!L.rects.some((r) => r.look.startsWith('spans.bar')));
  assert.ok(L.texts.map((t) => t.t).join(' ').includes(EMPTY_NOTE.split(' ')[0]));
  assert.ok(!L.texts.some((t) => t.t === 'Resistance'));
});

test('the card is one height for every patient at a width, and stays inside its box', () => {
  for (const [W, f] of [[352, 12], [300, 12], [420, 14]]) {
    const hs = new Set();
    for (const id of ['healthy', 'csph', 'masld-csph', 'psvd', 'budd-chiari', 'rhf']) {
      const L = spansLayout(stOf(id), W, f, meas);
      hs.add(L.H);
      for (const t of L.texts) {
        const w = meas(t.t, `650 ${f}px Inter`), x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
        assert.ok(x0 >= -0.5 && x0 + w <= W + 0.5, `${id} ${W}: "${t.t}" inside`);
        assert.ok(t.y <= L.H, `${id}: "${t.t}" above the foot`);
      }
    }
    hs.add(spansLayout(spansState(null, { empty: true }), W, f, meas).H);
    assert.equal(hs.size, 1, `one height at ${W}`);
  }
});

test('tags: a missed lane is tagged, a blank lane is hatched and tagged', () => {
  const psvd = spansLayout(stOf('psvd'), 352, 12, meas);
  assert.ok(psvd.texts.some((t) => t.t === TAGS.miss));
  assert.ok(psvd.lines.some((l) => l.look === 'spans.br.miss'));
  const bc = spansLayout(stOf('budd-chiari'), 352, 12, meas);
  assert.equal(bc.hatches.length, 2);
  assert.equal(bc.texts.filter((t) => t.t === TAGS.blank).length, 2);
});

test('every look the ruler names is in the table, and the host has a size', () => {
  const looks = new Set();
  for (const id of ['csph', 'psvd', 'budd-chiari']) {
    const L = spansLayout(stOf(id), 352, 12, meas);
    for (const p of [...L.texts, ...L.rects, ...L.lines, ...L.circles]) looks.add(p.look);
  }
  looks.add('spans.hatch');
  for (const k of looks) assert.ok(LOOKS[k], `look ${k}`);
  assert.equal(typeof HOSTS.spans, 'function');
});

test('the spoken summary names the resistance and each lane', () => {
  assert.match(spansWords(stOf('psvd')), /portal tracts.*HVPG [\d.]+ mmHg, misses it/);
  assert.match(spansWords(stOf('budd-chiari')), /HVPG cannot be read; EUS-PPG cannot be read; PPG/);
  assert.match(spansWords(spansState(null, { empty: true })), /No reading yet/);
});
