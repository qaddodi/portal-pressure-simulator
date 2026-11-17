// A stent's geometry (stent-geom.js): its hydraulic length, its waist's length and its tapered ends, solved inside the whole network
// (16 Nov 2026, the external reviewer's TIPS geometry proposal; plan /mnt/project-files/tips-geometry/tips-geometry-plan.md). The
// reviewer's verification list, one test each, then the app's own rules: the defaults are the stent the model always had, a first
// geometry eases from the defaults, links keep it, and the Doppler gates read the lumen where they sit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stentParts, geomOf, geomFix, geomDefault, benchFlow, profileAt, waistSpan, coneFactor, kExp, coneAngle,
  C_WALL, KIN, K_ENTRY, K_C, PINCH, TAPER_CM,
} from '../src/engine/stent-geom.js';
import { stenosisFactor } from '../src/engine/physiology.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge, sanitizeParams, sanitizeParamsReport } from '../src/engine/scenario.js';
import { stentSegments, stentReadsOf, STENT_SITES } from '../src/engine/topology.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';

// The model's stent as it was before geometry (engine.js until 16 Nov 2026), kept here as the reference.
const OLD = (() => {
  const kin = 5.96, PIN = 0.125;
  const pinch = (wall, kq, s) => { if (!(s > 0)) return 0; const a = (1 - s) * (1 - s); return wall * PIN * (stenosisFactor(s) - 1) + (kq / 1.5) * (1 / a - 1) * (1 / a - 1); };
  return {
    tips: (d, q, visc, s) => { const A = Math.PI * d * d / 4, wall = 0.04 * Math.pow(10 / d, 4) * visc, kq = kin * Math.abs(q) / (A * A); return 1 / (0.12 * visc + wall + kq + pinch(wall, kq, s)); },
    dips: (d, q, visc, s) => { const A = Math.PI * d * d / 4, wall = 0.04 * Math.pow(10 / d, 4) * visc, kq = kin * Math.abs(q) / (A * A); return 1 / (0.07 * visc + wall + kq + pinch(wall, kq, s)); },
    custom: (d, q, visc, s) => { const A = Math.PI * d * d / 4, wall = 0.05 * Math.pow(10 / d, 4) * visc; return 1 / (wall + pinch(wall, kin * Math.abs(q) / (A * A), s)); },
  };
})();
const KINDS = ['tips', 'dips', 'custom'];
const G = (kind, g = {}) => geomFix({ ...geomDefault(kind), ...g }, kind);
const R = (kind, d, q, s, g, visc = 1) => stentParts(kind, d, q, visc, s, g ? G(kind, g) : geomOf({}, 'X', kind));
const settled = (patch, preset = 'cirr-decomp') => {
  const e = new Engine(); e.loadPreset(preset);
  e.setParams(sanitizeParams(deepMerge(e.params, patch))); e.settle(3);
  return e;
};

test('the defaults are the stent the model always had, to the last bit (narrowings up to 70 %)', () => {
  let n = 0;
  for (const kind of KINDS) for (const d of [4, 6, 7.5, 8, 10, 12, 16]) for (let i = 0; i <= 14; i++) for (const q of [0, 0.3, 5, 17, 40]) for (const visc of [0.5, 1, 1.37, 1.6]) {
    const s = i / 20;
    assert.equal(1 / stentParts(kind, d, q, visc, s, geomOf({}, 'X', kind)).total, OLD[kind](d, q, visc, s), `${kind} d ${d} s ${s} q ${q} visc ${visc}`);
    n++;
  }
  assert.ok(n > 1000);
  // (Decision D2: past 70 % the waist's friction no longer takes the turbulence factor, which counted the jet's loss twice; the change is small.)
  for (const s of [0.75, 0.85, 0.9]) {
    const now = 1 / R('tips', 8, 10, s).total, was = OLD.tips(8, 10, 1, s);
    assert.ok(now > was && now < was * 2, `s ${s}: ${was} → ${now}`);
  }
});

test('reviewer 1: a uniform profile is the uniform conduit, whatever its waist and ends are set to', () => {
  for (const kind of KINDS) for (const len of [4, 6, 8, 10]) for (const d of [6, 8, 10]) {
    const r = R(kind, d, 0, 0, { len, waist: 3, trans: 1.5 });
    assert.ok(Math.abs(r.wall - C_WALL * len * Math.pow(10 / d, 4)) < 1e-15, `${kind} ${len} cm ${d} mm`);
    assert.equal(r.waistWall, 0); assert.equal(r.jet, 0); assert.equal(r.inlet, 0);
  }
});

test('reviewer 2: a narrowing disappears continuously as its diameter reaches the stent’s', () => {
  for (const g of [{ waist: 0 }, { waist: 1 }, { waist: 4, trans: 1 }]) {
    const r0 = R('tips', 10, 15, 0, g).total;
    let prev = Infinity;
    for (const s of [0.1, 0.03, 0.01, 1e-3, 1e-5, 1e-7]) {
      const gap = R('tips', 10, 15, s, g).total - r0;
      assert.ok(gap > 0 && gap < prev && gap < 0.4 * s + 1e-12, `${JSON.stringify(g)} s ${s}: ${gap}`);
      prev = gap;
    }
  }
  assert.ok(Math.abs(coneFactor(1e-7) - 1) < 1e-6 && Math.abs(coneFactor(2e-6) - coneFactor(5e-7)) < 1e-5, 'the cone’s mean factor has no step where its series takes over');
});

test('reviewer 3: a longer narrowed segment adds more friction at the same diameter and viscosity', () => {
  for (const s of [0.2, 0.4, 0.6]) {
    let prev = -1;
    for (const waist of [0, 0.5, 1, 2, 4, 6]) {
      const w = R('tips', 10, 15, s, { waist }).wall;
      assert.ok(w > prev, `s ${s}, waist ${waist}`); prev = w;
    }
  }
  // …and in the patient the PPG rises with it (the coupled circulation sets how far).
  const ppg = [0, 1, 4].map((waist) => computeMetrics(settled({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stentGeom: { TIPS: { waist } } })).ppg);
  assert.ok(ppg[0] < ppg[1] && ppg[1] < ppg[2], `PPG ${ppg}`);
  // A longer uniform conduit carries less at the same gradient, and in the patient the PPG is higher (reviewer §1).
  assert.ok(benchFlow('tips', 6, 1, 0, G('tips', { len: 8 }), 7) < benchFlow('tips', 6, 1, 0, G('tips', { len: 4 }), 7));
  assert.ok(computeMetrics(settled({ tips: { on: true, d: 6 }, stentGeom: { TIPS: { len: 8 } } })).ppg > computeMetrics(settled({ tips: { on: true, d: 6 }, stentGeom: { TIPS: { len: 4 } } })).ppg);
});

test('reviewer 4: a waist of no length keeps its transition loss', () => {
  for (const trans of [0, 0.5, 1]) {
    const z = R('tips', 10, 15, 0.4, { waist: 0, trans }), one = R('tips', 10, 15, 0.4, { waist: 1, trans });
    assert.ok(z.jet > 0 && z.jet === one.jet && z.inlet === one.inlet, `ends ${trans} cm`);
  }
  assert.ok(R('tips', 10, 15, 0.4, { waist: 0 }).total > R('tips', 10, 15, 0).total, 'a focal waist still costs pressure');
});

test('reviewer 5 and 6: no gradient, no flow; the flow follows the gradient, on the bench and in the patient', () => {
  for (const kind of KINDS) for (const g of [{}, { waist: 4, trans: 1 }]) {
    assert.equal(benchFlow(kind, 8, 1, 0.4, G(kind, g), 0), 0);
    for (const dp of [0.5, 3, 12]) {
      const q = benchFlow(kind, 8, 1, 0.4, G(kind, g), dp);
      assert.ok(q > 0 && benchFlow(kind, 8, 1, 0.4, G(kind, g), -dp) === -q, `${kind} ${dp}`);
      // (and the flow it gives returns the gradient it was given)
      assert.ok(Math.abs(stentParts(kind, 8, q, 1, 0.4, G(kind, g)).total * q - dp) < 1e-9 * dp, `${kind} ${dp}: ΔP(Q) closes`);
    }
  }
  for (const [preset, patch] of [['cirr-decomp', { tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stentGeom: { TIPS: { waist: 4, trans: 1 } } }],
    ['cirr-decomp', { tips: { on: true, d: 6 }, stentGeom: { TIPS: { len: 4 } } }], ['budd-chiari', { dips: { on: true, d: 8 }, stentGeom: { DIPS: { waist: 2 } }, stenosis: { DIPS: 0.3 } }]]) {
    const e = settled(patch, preset);
    for (const id of ['TIPS', 'DIPS']) {
      const k = e.ei[id];
      if (!(e.G[k] > 0)) continue;
      const dp = e.P[e.edgeF[k]] - e.P[e.edgeT[k]];
      assert.equal(Math.sign(e.Q[k]), Math.sign(dp), `${preset} ${id}`);
    }
  }
});

test('reviewer 7: mass balance closes at every node, whatever the stent’s geometry', () => {
  for (const g of [{ waist: 0 }, { waist: 4, trans: 1 }, { len: 4 }, { len: 10, waist: 6 }]) {
    const e = settled({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stentGeom: { TIPS: g }, pulsatile: false, respiration: false });
    const V0 = Float64Array.from(e.V), bv0 = e.bloodVolume();
    e.step(0.01);
    for (let i = 0; i < e.N; i++) assert.ok(Math.abs(e.V[i] - V0[i]) / 0.01 < 1e-6, `${JSON.stringify(g)}: node ${e.nodes[i].id} gains ${(e.V[i] - V0[i]) / 0.01} mL/s at rest`);
    // and a change of geometry moves blood between nodes without making or losing any
    e.setParams(sanitizeParams(deepMerge(e.params, { stentGeom: { TIPS: { waist: 1, trans: 0 } } })));
    for (let i = 0; i < 300; i++) e.step(0.01);
    assert.ok(Math.abs(e.bloodVolume() - bv0) < 0.05, `blood volume ${bv0} → ${e.bloodVolume()}`);
  }
});

test('reviewer 8: the closed form is what a finer and finer profile converges to', () => {
  for (const [s, g] of [[0.4, { waist: 1, trans: 1 }], [0.6, { waist: 3, trans: 0.5 }], [0.2, { waist: 0, trans: 2 }], [0.5, { len: 4, waist: 1, trans: 1.5 }]]) {
    const gg = G('tips', g), d = 10, exact = stentParts('tips', d, 0, 1, s, gg).wall;
    let prev = Infinity;
    for (const N of [10, 100, 1000, 10000, 100000]) {
      let sum = 0;
      for (let i = 0; i < N; i++) { const f = profileAt(gg, s, STENT_SITES.mid, (i + 0.5) / N); sum += Math.pow(10 / (d * f), 4); }
      const err = Math.abs(C_WALL * gg.len * sum / N - exact) / exact;
      assert.ok(err <= prev + 1e-12, `${JSON.stringify(g)} N ${N}: ${err}`); prev = err;
    }
    assert.ok(prev < 1e-4, `${JSON.stringify(g)}: the integral converges (${prev})`);
  }
});

test('reviewer 9: no loss is counted twice, and each names its reference velocity', () => {
  for (const kind of KINDS) for (const g of [{}, { waist: 0 }, { waist: 4, trans: 1 }]) for (const s of [0, 0.3, 0.6, 0.9]) {
    const r = R(kind, 9, 12, s, g);
    assert.ok(Math.abs(r.total - (r.tract + r.wall + r.entry + r.jet + r.inlet)) < 1e-14 * r.total, `${kind} ${s}: the parts add up to the whole`);
    // The jet and the inlet depend on the area ratio and the cone, never on the waist's length.
    if (s > 0) assert.equal(R(kind, 9, 12, s, { ...g, waist: 0 }).jet, r.jet);
  }
  // The waist's friction is plain Poiseuille, (1 − s)⁻⁴, with no turbulence factor on top of the jet (decision D2).
  const s = 0.9, r = R('tips', 10, 0, s, { waist: 1 }), open = R('tips', 10, 0, 0);
  assert.ok(Math.abs(r.waistWall - open.wall * (1 / 8) * (Math.pow(1 - s, -4) - 1)) < 1e-9 * r.waistWall);
  // Entry and exit at the stent's velocity: ½ρK(Q/A)²; the jet at the waist's minus the stent's: ½ρ(v_w − v)².
  const d = 10, q = 15, A = Math.PI * d * d / 4, v = q / A, a = 0.36, vw = v / a, halfRho = KIN / K_ENTRY;
  const r2 = R('tips', d, q, 0.4, { waist: 1 });
  assert.ok(Math.abs(r2.entry * q - halfRho * K_ENTRY * v * v) < 1e-12);
  assert.ok(Math.abs(r2.jet * q - halfRho * (vw - v) * (vw - v)) < 1e-12);
  assert.equal(K_C, 0, 'the inlet loss stays off until measured reductions calibrate it (decision D1)');
});

test('reviewer 10: units stay consistent', () => {
  // ½ρK in mmHg per (m/s)²: a velocity of 1 mL/s per mm² is 1 m/s.
  assert.ok(Math.abs(KIN - (0.5 * 1060 * 1.5) / 133.322) < 0.01, `kin ${KIN}`);
  // The wall's coefficient against ideal Poiseuille for blood at 3.5 cP, per cm at 10 mm, in mmHg·s/mL: an effective, calibrated value.
  const poiseuille = (128 * 3.5e-3 * 0.01) / (Math.PI * Math.pow(0.01, 4)) / 133.322 / 1e6;
  assert.ok(Math.abs(C_WALL / poiseuille - 4.7) < 0.1, `C_WALL is ${(C_WALL / poiseuille).toFixed(2)}× Poiseuille`);
  // The engine's readings: the parts × Q are the pressure across the stent (mmHg), flow in L/min, velocity in cm/s.
  const e = settled({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stentGeom: { TIPS: { waist: 4 } } }), m = computeMetrics(e), t = m.tips;
  assert.ok(Math.abs(t.parts.total - t.dp) < 0.02, `parts ${t.parts.total} against ΔP ${t.dp}`);
  assert.ok(Math.abs(t.flow - t.q * 0.06) < 1e-12 && t.flow > 0.5 && t.flow < 3);
  assert.ok(Math.abs(t.vWaist - t.vOpen / 0.36) < 1e-9 && t.vWaist > 40 && t.vWaist < 200, `waist ${t.vWaist} cm/s`);
  const f = fingerprintOf(m);
  assert.ok(Math.abs(f.tipsFric + f.tipsLocal - f.tipsDp) < 0.02 && f.tipsFlow === t.flow);
  assert.equal(fingerprintOf(computeMetrics(settled({}))).tipsFlow, null, 'no TIPS, no reading');
});

test('the tapered end’s loss falls with the cone’s angle, and is the abrupt step’s at a steep one', () => {
  assert.equal(kExp(coneAngle(10, 0.4, 0)), 1);
  assert.ok(Math.abs(kExp(coneAngle(10, 0.4, TAPER_CM)) - 0.42) < 0.02, `10 → 6 mm over 1 cm: ${kExp(coneAngle(10, 0.4, TAPER_CM))}`);
  for (let th = 2; th <= 90; th += 2) assert.ok(kExp(th) >= kExp(th - 2), `θ ${th}: a steeper cone never loses less`);
  assert.ok(R('tips', 10, 15, 0.4, { trans: 1 }).jet < R('tips', 10, 15, 0.4, { trans: 0 }).jet);
});

test('the waist and its ends always fit inside the stent, centred on their site unless that would run them off its end', () => {
  const g = geomFix({ len: 4, waist: 6, trans: 2 }, 'tips');
  assert.ok(g.waist + 2 * g.trans <= g.len + 1e-12 && g.trans === 2 && g.waist === 0, JSON.stringify(g));
  for (const site of Object.values(STENT_SITES)) for (const gg of [G('tips'), G('tips', { waist: 5, trans: 1 })]) {
    const w = waistSpan(gg, site);
    assert.ok(w.a0 >= -1e-12 && w.b0 <= 1 + 1e-12 && w.a1 - w.a0 >= 0 && w.b0 - w.b1 >= 0);
  }
  assert.equal(waistSpan(G('tips'), STENT_SITES.proximal).c, STENT_SITES.proximal, 'a short waist sits on its site');
  assert.ok(waistSpan(G('tips', { waist: 5 }), STENT_SITES.distal).c < STENT_SITES.distal, 'a long one slides inward');
});

test('a stent’s geometry is sanitized, kept by links and dropped for a vessel that is not a stent', () => {
  const { params, repairs } = sanitizeParamsReport({ stentGeom: { TIPS: { len: 30, waist: -1 }, PV_TRUNK: { len: 5 }, DIPS: 'long' } });
  assert.deepEqual(params.stentGeom, { TIPS: { len: 10, waist: 0, trans: 0 } });
  assert.ok(repairs.some((r) => r.path === 'stentGeom.TIPS.len') && repairs.some((r) => r.path === 'stentGeom.PV_TRUNK') && repairs.some((r) => r.path === 'stentGeom.DIPS'));
  const p = sanitizeParams({ stentGeom: { TIPS: { len: 6, waist: 2.5, trans: 1 } } });
  assert.deepEqual(sanitizeParams(JSON.parse(JSON.stringify(p))).stentGeom, p.stentGeom, 'a link’s round trip keeps it');
  assert.deepEqual(sanitizeParams({}).stentGeom, {}, 'unset, a stent has its defaults');
  const id = Object.keys(sanitizeParams({ stentGeom: { X_SMV_RHV: { waist: 2 } } }).stentGeom);
  assert.deepEqual(id, ['X_SMV_RHV'], 'a drawn stent keeps its geometry too');
});

test('a stent given a geometry for the first time eases from its defaults, not from nothing', () => {
  const quiet = { pulsatile: false, respiration: false };
  const e = settled({ tips: { on: true, d: 8 }, ...quiet });
  const k = e.ei.TIPS, q0 = e.Q[k];
  const next = deepMerge(e.params, { stentGeom: { TIPS: { len: 8, waist: 1, trans: 0 } } });
  e.easeParams(next);
  for (let i = 0; i < 40; i++) { e.step(0.01); assert.ok(Math.abs(e.Q[k] - q0) < 0.02 * q0, `step ${i}: ${q0} → ${e.Q[k]}`); }
  const e2 = settled({ tips: { on: true, d: 8 }, ...quiet }), q1 = e2.Q[k];
  e2.easeParams(deepMerge(e2.params, { stentGeom: { TIPS: { len: 4 } } }));
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 60; i++) { e2.step(0.01); lo = Math.min(lo, e2.Q[k]); hi = Math.max(hi, e2.Q[k]); }
  assert.ok(lo >= q1 * 0.98, `a shorter stent never carries less on its way (${q1} → ${lo})`);
});

test('the Doppler gates read the lumen where they sit: a long waist jets at every gate inside it', () => {
  // The default geometry reads as the short pinch always did.
  for (const site of ['proximal', 'mid', 'distal']) for (const s of [0, 0.2, 0.6]) {
    assert.deepEqual(stentSegments(100, s, site, null, G('tips')), stentSegments(100, s, site), `${site} ${s}`);
    assert.deepEqual(stentReadsOf({ stenosis: { TIPS: s }, stenosisSite: { TIPS: site } }, 'TIPS', 100), stentSegments(100, s, site));
  }
  // A 6 cm waist mid stent (1 to 7 cm) holds all three gates (at 1.3, 4 and 6.7 cm); a 5 cm one (1.5 to 6.5 cm) only the middle one.
  const long = stentReadsOf({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'mid' }, stentGeom: { TIPS: { waist: 6 } } }, 'TIPS', 100);
  assert.ok(long[1] === 400 && long[0] === 400 && long[2] === 400, `${long}`);
  const five = stentReadsOf({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'mid' }, stentGeom: { TIPS: { waist: 5 } } }, 'TIPS', 100);
  assert.deepEqual(five, [100, 400, 100]);
  const four = stentReadsOf({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { waist: 4 } } }, 'TIPS', 100);
  assert.deepEqual(four, [100, 400, 100], 'a 4 cm waist is mid stent (2 to 6 cm) even when Distal was picked');
  const taper = stentReadsOf({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'mid' }, stentGeom: { TIPS: { waist: 0.5, trans: 2 } } }, 'TIPS', 100);
  assert.ok(taper[1] === 400 && taper[0] > 90 && taper[0] < 400, `a gate on the cone reads in between: ${taper}`);
});

test('the default waist is PINCH of the stent: 1 cm of a TIPS or DIPS, 1.25 cm of a drawn stent', () => {
  assert.deepEqual(geomDefault('tips'), { len: 8, waist: 8 * PINCH, trans: 0 });
  assert.deepEqual(geomDefault('dips'), { len: 8, waist: 1, trans: 0 });
  assert.deepEqual(geomDefault('custom'), { len: 10, waist: 1.25, trans: 0 });
});

test('a waist set along the stent is always mid stent; proximal and distal stay a short focal stenosis (17 Nov 2026)', async () => {
  const { stentSite } = await import('../src/engine/topology.js');
  // A focal stenosis keeps its own site; a long or tapered waist is mid, whatever stenosisSite says, for every kind of stent.
  for (const [id, kind] of [['TIPS', 'tips'], ['DIPS', 'dips'], ['X_SMV_RHV', 'custom']]) {
    for (const site of ['proximal', 'mid', 'distal']) {
      assert.equal(stentSite({ stenosisSite: { [id]: site } }, id), site, `${id} focal at ${site}`);
      assert.equal(stentSite({ stenosisSite: { [id]: site }, stentGeom: { [id]: geomDefault(kind) } }, id), site, `${id}: the default geometry is focal`);
      for (const g of [{ waist: 4 }, { waist: 0 }, { trans: 1 }]) {
        const p = { stenosisSite: { [id]: site }, stentGeom: { [id]: g } };
        assert.equal(stentSite(p, id), 'mid', `${id} ${JSON.stringify(g)} at ${site}`);
      }
    }
  }
  assert.equal(stentSite({}, 'TIPS'), 'distal', 'unset: the hepatic vein end');
  // The Doppler gates and the waist's place follow: a 4 cm waist set at Distal jets mid stent, not at the hepatic vein end.
  const p = { stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { waist: 4 } } };
  const v = stentReadsOf(p, 'TIPS', 100);
  assert.ok(v[1] === 400 && v[0] === 100 && v[2] === 100, `a 4 cm waist mid stent (2 to 6 cm): ${v}`);
  assert.equal(waistSpan(geomOf(p, 'TIPS', 'tips'), STENT_SITES[stentSite(p, 'TIPS')]).c, 0.5);
});

test('the stent card keeps Where, Waist length and Ends telling the same story', async () => {
  const { withWaist, withSite } = await import('../src/engine/stent-geom.js');
  const { stentSite } = await import('../src/engine/topology.js');
  let p = withWaist({ stenosis: { TIPS: 0.4 }, stenosisSite: { TIPS: 'distal' } }, 'TIPS', 'tips', 'waist', 4);
  assert.equal(p.stenosisSite.TIPS, 'mid', 'setting Waist length moves the narrowing to Mid');
  assert.deepEqual(p.stentGeom.TIPS, { len: 8, waist: 4, trans: 0 });
  p = withWaist(p, 'TIPS', 'tips', 'trans', TAPER_CM);
  assert.equal(stentSite(p, 'TIPS'), 'mid');
  p = withSite(p, 'TIPS', 'tips', 'distal');
  assert.deepEqual(p.stentGeom.TIPS, { len: 8, waist: 1, trans: 0 }, 'Distal puts back the short focal waist');
  assert.equal(stentSite(p, 'TIPS'), 'distal');
  assert.equal(withSite({ stenosisSite: {} }, 'TIPS', 'tips', 'proximal').stentGeom, undefined, 'a stent with no geometry gets none');
  assert.deepEqual(withSite(withWaist({}, 'TIPS', 'tips', 'waist', 3), 'TIPS', 'tips', 'mid').stentGeom.TIPS.waist, 3, 'Mid keeps the waist');
});
