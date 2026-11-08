// The surgical shunts as orders of the free sim (Mohammad, 7 Nov 2026: "there is no option in procedures for Warren shunt, Rex,
// portocaval shunts; I can't even find it when I search in the / menu"). Each is the parameter the talks' slides set, placed and taken
// down from the Treat card's Procedures tab and from the command palette through surgical-shunts.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { defaultParams, deepMerge, sanitizeParams } from '../src/engine/scenario.js';
import { EDGES } from '../src/engine/topology.js';
import { SURGICAL, SURGICAL_BY_ID, surgicalVerbs, shuntName } from '../src/ui/surgical-shunts.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const made = (preset, patch) => { const e = new Engine(); e.loadPreset(preset); if (patch) { e.setParams(deepMerge(e.params, patch)); e.settle(); } return e; };

test('the five orders: Warren, both portocaval shunts, mesocaval and Meso-Rex, each on a vessel of the model', () => {
  assert.deepEqual(SURGICAL.map((s) => s.id), ['warren', 'pc-es', 'pc-ss', 'mesocaval', 'rex']);
  for (const s of SURGICAL) {
    const e = EDGES[EI[s.edge]];
    assert.ok(e && e.kind === 'shunt', `${s.id} → ${s.edge}`);
    const p = s.apply(defaultParams());
    assert.ok(s.on(p), `${s.id} is on once applied`);
    assert.ok(!s.on(s.remove(structuredClone(p))), `${s.id} is off once removed`);
  }
});

test('end-to-side and side-to-side are one shunt, one at a time, and removing either clears both', () => {
  const es = SURGICAL_BY_ID['pc-es'], ss = SURGICAL_BY_ID['pc-ss'];
  const p = ss.apply(defaultParams());
  assert.ok(ss.on(p) && !es.on(p));
  es.apply(p);
  assert.ok(es.on(p) && !ss.on(p) && p.portocavalSide === false);
  ss.apply(p); es.remove(p);
  assert.equal(p.portocaval, false); assert.equal(p.portocavalSide, false);
  assert.equal(defaultParams().portocavalSide, false);
  assert.equal(sanitizeParams({ portocavalSide: 1 }).portocavalSide, true, 'a share link keeps it as a switch');
});

test('the engine: end-to-side divides the portal trunk; side-to-side keeps it, and the liver drains back out through it', () => {
  const es = made('cirr-decomp', { portocaval: true }), ss = made('cirr-decomp', { portocaval: true, portocavalSide: true });
  assert.equal(es.G[EI.PV_TRUNK], 0, 'end-to-side: the trunk is tied');
  assert.ok(ss.G[EI.PV_TRUNK] > 0, 'side-to-side: the trunk stays open');
  assert.ok(ss.Q[EI.PV_TRUNK] < -1, `side-to-side: hepatofugal flow in the trunk, ${ss.Q[EI.PV_TRUNK]}`);
  const m0 = computeMetrics(made('cirr-decomp')), mE = computeMetrics(es), mS = computeMetrics(ss);
  assert.ok(mE.ppg < 6 && mS.ppg < 6, `both decompress: PPG ${m0.ppg} → ${mE.ppg} / ${mS.ppg}`);
  assert.ok(mS.hepaticFlow < mE.hepaticFlow, `side-to-side takes even the arterial blood back out: ${mE.hepaticFlow} vs ${mS.hepaticFlow}`);
});

test('the Warren shunt ties the coronary vein and divides the splenic vein, and lowers the PPG', () => {
  const e = made('cirr-decomp', SURGICAL_BY_ID.warren.apply({}));
  assert.equal(e.G[EI.LGV_CONF], 0, 'the coronary vein is tied off');
  assert.equal(e.G[EI.SV_MID], 0, 'the splenic vein is divided');
  assert.ok(e.Q[EI.S_DSR] > 1, 'the shunt carries the spleen’s blood');
  assert.ok(computeMetrics(e).ppg < computeMetrics(made('cirr-decomp')).ppg);
});

test('the Meso-Rex bypass keeps the slides’ rule: only for a clotted trunk with an open left portal vein', () => {
  const rex = SURGICAL_BY_ID.rex;
  assert.match(rex.blocked(defaultParams()), /trunk is open/);
  assert.equal(rex.blocked(made('pvt-chronic').params), '');
});

// A store and a figure to drive the verbs with, as the Treat card and the palette do.
function rig(params) {
  const st = { params }, log = [], toasts = [], sels = [];
  const store = { get: () => st };
  const updateParams = (fn, o) => { st.params = fn(structuredClone(st.params)); log.push(o.label); };
  return { st, log, toasts, sels, verbs: surgicalVerbs({ store, updateParams, select: (s) => sels.push(s), toast: (t) => toasts.push(t) }) };
}

test('placing makes the shunt, names it in the timeline and shows its vessel; a second tap only shows it', () => {
  const r = rig(defaultParams());
  assert.equal(r.verbs.placeShunt('warren'), true);
  assert.equal(r.st.params.dsrs, true); assert.deepEqual(r.log, ['Warren shunt']); assert.deepEqual(r.sels.at(-1), { type: 'edge', id: 'S_DSR' });
  assert.equal(r.verbs.placeShunt('warren'), false);
  assert.equal(r.log.length, 1); assert.match(r.toasts.at(-1), /The Warren shunt is already in place/);
  assert.equal(r.verbs.removeShunt('warren'), true);
  assert.equal(r.st.params.dsrs, false); assert.equal(r.log.at(-1), 'Remove Warren shunt');
  assert.equal(r.verbs.removeShunt('warren'), false);
});

test('a Meso-Rex bypass on an open trunk is refused with the reason, and made on a clotted one', () => {
  const r = rig(defaultParams());
  assert.equal(r.verbs.placeShunt('rex'), false);
  assert.equal(r.st.params.rex, false); assert.match(r.toasts.at(-1), /trunk is open/);
  const c = rig(made('pvt-chronic').params);
  assert.equal(c.verbs.placeShunt('rex'), true);
  assert.equal(c.st.params.rex, true); assert.deepEqual(c.sels.at(-1), { type: 'edge', id: 'REX' });
});

test('switching the portocaval shunt from end-to-side to side-to-side is one change', () => {
  const r = rig(defaultParams());
  r.verbs.placeShunt('pc-es'); r.verbs.placeShunt('pc-ss');
  assert.deepEqual(r.log, ['Portocaval shunt (end-to-side)', 'Portocaval shunt (side-to-side)']);
  assert.ok(r.st.params.portocaval && r.st.params.portocavalSide);
  r.verbs.removeShunt('pc-es');
  assert.ok(!r.st.params.portocaval && !r.st.params.portocavalSide, 'Remove portocaval shunt takes down either kind');
});

test('the Procedures tab lists every order, and the palette finds each with its take-down', () => {
  const chart = src('src/ui/chart.js'), pal = src('src/ui/palette.js');
  assert.match(chart, /\.\.\.SURGICAL\.map\(\(x\) => placed\(proc\('stent', x\.label, x\.sub, \(\) => surgical\.placeShunt\(x\.id\)\), x\.on\)\)/);
  assert.doesNotMatch(chart, /b\.hidden = !\(p\.rex/, 'the Meso-Rex bypass is no longer hidden');
  assert.match(pal, /for \(const x of SURGICAL\) add\('Treat', shuntName\(x\), \(\) => surgical\.placeShunt\(x\.id\)/);
  for (const id of ['warren', 'pc-es', 'mesocaval', 'rex']) assert.match(pal, new RegExp(`\\['${id}', '[^']+'\\]`), `Remove for ${id}`);
  // What the palette's matcher sees (its norm: lower case, punctuation as spaces): each query reaches its order.
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ');
  const kw = (s) => norm(`${shuntName(s)} ${s.kw} ${s.sub}`);
  for (const [q, id] of [['warren', 'warren'], ['dsrs', 'warren'], ['splenorenal', 'warren'], ['portocaval', 'pc-es'], ['side to side', 'pc-ss'], ['end to side', 'pc-es'], ['rex', 'rex'], ['mesorex', 'rex'], ['meso rex', 'rex'], ['mesocaval', 'mesocaval']]) {
    assert.ok(norm(q).split(/\s+/).every((w) => kw(SURGICAL_BY_ID[id]).includes(w)), `"${q}" finds ${id}`);
  }
});
