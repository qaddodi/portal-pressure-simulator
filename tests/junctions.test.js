// A shunt, stent or collateral that meets a vein part-way along it needs a node there (15 Nov 2026, Mohammad: "the TIPS starts in the middle of the right
// portal vein and ends in the middle of the right hepatic vein, but the blood behaves as if it runs to the end of the portal vein, jumps into the TIPS and
// comes out at the start of the hepatic vein"). A shunt's end is a node, and a node is where a vein ENDS: a stent drawn onto the middle of a vein took its
// blood from the vein's far end and gave it back at the vein's near end, so every flow, direction, origin colour and dye in the stretch between the drawn
// attachment and the node was wrong. topology.js JUNCTIONS puts a node on the vein and splits it there (as the splenic vein always was, node SVD).
// Four things are held here: the model (blood is conserved at the junction, the pieces share the vein's resistance, a clot lies on every piece), the drawing
// (the node lies on the vein's drawn course, the shunt's drawn end lies on the node), the audit (no other end of any vessel lies in the middle of a vein
// without a junction, but those listed below with the reason they stay), and the readings (the vein's own name and numbers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, NODES, JUNCTIONS, JUNCTION_CHAINS, JUNCTION_PIECES, JUNCTION_HOST_ENDS, partOf } from '../src/engine/portal/topology.js';
import { EDGE_PATH, CIRCUIT_PATH, NODE_POS, HIDDEN_NODES, splitPathAt, pathFractionNear } from '../src/ui/anatomy.js';
import { Engine } from '../src/engine/portal/engine.js';
import { deepMerge } from '../src/engine/portal/scenario.js';

const edge = (id) => EDGES.find((e) => e.id === id);
const run = (preset, params) => { const e = new Engine(); e.loadPreset(preset); if (params) { e.setParams(deepMerge(e.params, params)); e.settle(); } return e; };

function sample(d, per = 40) {
  const t = d.match(/[MCLQ]|-?[\d.]+/g), out = [];
  let i = 0, cur = null;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M' || c === 'L') { cur = [+t[i++], +t[i++]]; out.push(cur); }
    else if (c === 'Q') { const p1 = [+t[i++], +t[i++]], p2 = [+t[i++], +t[i++]]; for (let k = 1; k <= per; k++) { const s = k / per, u = 1 - s; out.push([0, 1].map((a) => u * u * cur[a] + 2 * u * s * p1[a] + s * s * p2[a])); } cur = p2; }
    else if (c === 'C') { const p1 = [+t[i++], +t[i++]], p2 = [+t[i++], +t[i++]], p3 = [+t[i++], +t[i++]]; for (let k = 1; k <= per; k++) { const s = k / per, u = 1 - s; out.push([0, 1].map((a) => u * u * u * cur[a] + 3 * u * u * s * p1[a] + 3 * u * s * s * p2[a] + s * s * s * p3[a])); } cur = p3; }
  }
  return out;
}
const arc = (P) => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return c; };
function onCourse(P, p) {
  const c = arc(P);
  let best = [Infinity, 0];
  for (let i = 1; i < P.length; i++) {
    const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], u = Math.max(0, Math.min(1, ((p[0] - P[i - 1][0]) * dx + (p[1] - P[i - 1][1]) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(P[i - 1][0] + dx * u - p[0], P[i - 1][1] + dy * u - p[1]);
    if (d < best[0]) best = [d, (c[i - 1] + u * (c[i] - c[i - 1])) / c.at(-1)];
  }
  return best;
}

test('every junction is a node on its host vein, the host is split in series, and the pieces carry the host\'s id and name', () => {
  assert.ok(JUNCTIONS.length >= 6);
  for (const [node, host, at, label, ends] of JUNCTIONS) {
    assert.ok(at > 0.05 && at < 0.95, `${node}: a junction at ${at} is at the vein's end, not part-way along it`);
    assert.ok(NODES.some((n) => n.id === node), `${node} is a node`);
    const ids = JUNCTION_PIECES[host];
    assert.ok(ids.length >= 2 && ids.includes(host), `${host} is split in pieces and one keeps its id`);
    assert.ok(label && ends.length >= 1);
    for (const [sid, end] of ends) assert.equal(edge(sid)[end], node, `${sid}'s ${end} end is the junction ${node}, not the vein's far node`);
    // the pieces run in series from the host's own ends
    const [a, b] = JUNCTION_HOST_ENDS[host];
    const pieces = ids.map((id) => edge(id));
    assert.equal(pieces.find((p) => p.from === a)?.part, host);
    assert.equal(pieces.find((p) => p.to === b)?.part, host);
    for (const p of pieces) { assert.equal(partOf(p.id), host); assert.equal(p.label, edge(host).label, 'a piece is named as its vein'); }
  }
});

test('the engine solves the lumped graph it always did: the lead piece is its vessel, the other pieces carry no conductance of their own, and the junction holds the pressure of the vein\'s end its shunts are joined at', () => {
  const e = run('cirr-decomp', { tips: { on: true, d: 8 } });
  for (const host of Object.keys(JUNCTION_PIECES)) {
    const pieces = JUNCTION_PIECES[host].map((id) => edge(id));
    assert.equal(pieces.filter((p) => !p.virtual).length, 1, `${host}: one piece is the engine's own vessel`);
    // (it keeps the vein's id, unless a shunt on the vein has a hydraulic end of its own past the junction (the TIPS joins the cava past the right hepatic
    // vein, topology.js eto, 17 Nov 2026): then it is the piece at the vein's other end, and the one keeping the id is filled after each step)
    const own = EDGES.some((s) => s.junction && JUNCTION_CHAINS.find((c) => c.host === host)?.nodes.includes(s.junction) && (s.eto || s.efrom));
    const ch = JUNCTION_CHAINS.find((c) => c.host === host);
    assert.equal(pieces.find((p) => !p.virtual).id, own ? ch.ids[ch.lead] : host, `${host}: it is the one that keeps the vein's id`);
    if (own) assert.notEqual(ch.ids[ch.lead], host, `${host}: the piece solved is the one before the junction`);
    for (const p of pieces) {
      assert.equal(e.edgeF[e.ei[p.id]], e.ni[JUNCTION_HOST_ENDS[host][0]], `${p.id}: the engine reads the vein's own ends`);
      assert.equal(e.edgeT[e.ei[p.id]], e.ni[JUNCTION_HOST_ENDS[host][1]]);
      if (p.virtual) assert.equal(e.G[e.ei[p.id]], 0, `${p.id} has no conductance of its own`);
    }
    assert.ok(Math.abs(pieces.reduce((s, p) => s + p.share, 0) - 1) < 1e-9, `${host}: the pieces' shares add to the whole vein`);
  }
  // A junction's pressure is the model's at the end of the vein its shunts are joined at, a hair off it on the side the stretch between runs downhill: no drop of its
  // own, and blood runs downhill through it whichever way it runs (the order every blend and dye pass visits nodes in).
  for (const c of JUNCTION_CHAINS) {
    const [a, b] = JUNCTION_HOST_ENDS[c.host], end = c.end === 'to' ? b : a, adj = c.ids[c.end === 'to' ? c.ids.length - 1 : 0], q = e.Q[e.ei[adj]];
    c.nodes.forEach((node, i) => {
      const Pj = e.P[e.ni[node]], Pe = e.P[e.ni[end]];
      assert.ok(Math.abs(Pj - Pe) < 1e-4, `${node} reads ${Pj}, the model's ${end} reads ${Pe}`);
      // (the junction beside the end: the stretch between them has the one hair; the others are walked in from it, tested piece by piece below)
      if (Math.abs(q) > 1e-6 && i === (c.end === 'to' ? c.nodes.length - 1 : 0)) assert.ok((c.end === 'to' ? Pj - Pe : Pe - Pj) * Math.sign(q) > 0, `${node}: blood runs downhill through ${adj}`);
    });
  }
  for (const k of [edge('TIPS'), edge('DIPS'), edge('C6'), edge('S_DSR'), edge('C7')]) assert.ok(k.mfrom && k.mto, `${k.id} keeps the model ends the engine reads`);
});

test('blood is conserved at a junction: the TIPS leaves the right portal vein where it is drawn, and joins the right hepatic vein where it is drawn', () => {
  const e = run('cirr-decomp', { tips: { on: true, d: 8 } });
  const Q = (id) => e.Q[e.ei[id]];
  const tips = Q('TIPS');
  assert.ok(tips > 5, `the TIPS carries blood (${tips.toFixed(2)} mL/s)`);
  // the portal vein before the stent carries what goes on to the liver plus what goes down the stent; past it, only what goes on
  // (the arterioportal shunt joins it first, 0.2 along: PVH_R, then PVH_R_1 with the shunt's blood, then PVH_R_2 past the stent)
  assert.ok(Math.abs(Q('PVH_R_2') - (Q('PVH_R') + Q('AP_R') - tips)) < 1e-6, `PVH_R_2 ${Q('PVH_R_2')} = PVH_R ${Q('PVH_R')} + AP_R ${Q('AP_R')} - TIPS ${tips}`);
  assert.ok(Q('PVH_R') > 0.5 * tips && Q('PVH_R_2') < Q('PVH_R') * 0.2, 'past the stent the right portal vein carries almost nothing, or runs back toward it: the stent has taken the flow');
  // the hepatic vein before the stent carries only the liver's blood; past it, the liver's plus the stent's
  assert.ok(Math.abs(Q('RHV_IVC') - (Q('RHV_IVC_1') + tips)) < 1e-6, `RHV_IVC ${Q('RHV_IVC')} = RHV_IVC_1 ${Q('RHV_IVC_1')} + TIPS ${tips}`);
  assert.ok(Q('RHV_IVC_1') < Q('RHV_IVC') * 0.5, 'the hepatic vein upstream of the stent carries only the liver\'s own blood');
  // the right branches past the stent drain back toward it (hepatofugal): the stretch of the portal vein between the stent and the sinusoids runs backward
  assert.ok(Q('PRE_R') < 0, 'the right branches beyond the stent drain back toward it');
});

test('blood is conserved at every junction, in the healthy liver and with a shunt open, and nothing is lost at a split', () => {
  for (const [preset, params] of [['healthy', null], ['cirr-decomp', { tips: { on: true, d: 8 } }], ['cirr-decomp', { dips: { on: true, d: 8 } }], ['cirr-decomp', { dsrs: true }]]) {
    const e = run(preset, params);
    for (const [node] of JUNCTIONS) {
      let net = 0;
      for (let k = 0; k < EDGES.length; k++) { if (EDGES[k].from === node) net -= e.Q[k]; if (EDGES[k].to === node) net += e.Q[k]; }
      assert.ok(Math.abs(net) < 1e-3, `${preset}: ${node} gains ${net.toFixed(5)} mL/s from nowhere`);
    }
  }
});

test('a clot or a narrowing on a split vein is on every piece of it (Budd–Chiari shuts the whole right hepatic vein, TIPS or not)', () => {
  const e = run('budd-chiari', null);
  assert.ok(Math.abs(e.Q[e.ei.RHV_IVC]) < 0.05 && Math.abs(e.Q[e.ei.RHV_IVC_1]) < 0.05, 'no blood in either piece of the clotted right hepatic vein');
  const n = run('healthy', { stenosis: { RHV_IVC: 0.9 } });
  const h = run('healthy', null);
  assert.ok(n.Q[n.ei.RHV_IVC_1] < h.Q[h.ei.RHV_IVC_1] - 0.05 && n.Q[n.ei.RHV_IVC] < h.Q[h.ei.RHV_IVC] - 0.05, 'a narrowing given to the vein narrows both pieces');
});

test('each junction is drawn on its vein\'s course and the shunt\'s drawn end lies on it (anatomy and circuit)', () => {
  for (const [node, host, at, , ends] of JUNCTIONS) {
    const [aPos, cPos] = NODE_POS[node];
    assert.ok(HIDDEN_NODES.has(node), `${node} has no marker of its own`);
    // anatomy: on the host's whole course (the pieces end to end), at its fraction of it
    const whole = JUNCTION_PIECES[host].flatMap((id) => sample(EDGE_PATH[id]));
    const [d, f] = onCourse(whole, aPos);
    assert.ok(d < 1.5, `${node} lies ${d.toFixed(2)} off ${host}'s course in the anatomy`);
    assert.ok(Math.abs(f - at) < 0.04 || JUNCTIONS.filter((j) => j[1] === host).length > 1, `${node} lies at ${f.toFixed(3)} of ${host}, not ${at}`);
    // circuit
    const cw = JUNCTION_PIECES[host].flatMap((id) => sample(CIRCUIT_PATH[id]));
    assert.ok(onCourse(cw, cPos)[0] < 1.5, `${node} lies off ${host}'s course in the circuit`);
    for (const [sid, end] of ends) {
      const P = sample(EDGE_PATH[sid]), p = end === 'from' ? P[0] : P.at(-1);
      assert.ok(Math.hypot(p[0] - aPos[0], p[1] - aPos[1]) < 4.5, `${sid}'s ${end} end is ${Math.hypot(p[0] - aPos[0], p[1] - aPos[1]).toFixed(1)} from ${node} in the anatomy`);
      const C = sample(CIRCUIT_PATH[sid]), c = end === 'from' ? C[0] : C.at(-1);
      assert.ok(Math.hypot(c[0] - cPos[0], c[1] - cPos[1]) < 0.5, `${sid}'s ${end} end is ${Math.hypot(c[0] - cPos[0], c[1] - cPos[1]).toFixed(1)} from ${node} in the circuit`);
    }
  }
});

test('the pieces of a split vein meet end to end and add up to the vein as it was drawn', () => {
  for (const host of Object.keys(JUNCTION_PIECES)) for (const paths of [EDGE_PATH, CIRCUIT_PATH]) {
    const ids = JUNCTION_PIECES[host];
    for (let i = 1; i < ids.length; i++) {
      const a = sample(paths[ids[i - 1]]).at(-1), b = sample(paths[ids[i]])[0];
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05, `${ids[i - 1]} and ${ids[i]} do not meet`);
    }
    for (const id of ids) assert.ok(arc(sample(paths[id])).at(-1) > 8, `${id} is a stub, not a vessel`);
  }
});

test('splitPathAt cuts a course at a share of its length: the two parts add up to it and meet where asked', () => {
  const d = 'M0 0 C 40 0 60 40 100 40 L 160 40 Q 200 40 200 80';
  const whole = arc(sample(d)).at(-1);
  for (const f of [0.1, 0.35, 0.5, 0.8]) {
    const [a, b, pt] = splitPathAt(d, f), la = arc(sample(a)).at(-1), lb = arc(sample(b)).at(-1);
    assert.ok(Math.abs(la + lb - whole) < 0.8, `the parts add up at ${f}: ${la} + ${lb} vs ${whole}`);
    assert.ok(Math.abs(la / whole - f) < 0.01, `the cut is at ${f}, not ${(la / whole).toFixed(3)}`);
    assert.ok(Math.hypot(sample(a).at(-1)[0] - pt[0], sample(a).at(-1)[1] - pt[1]) < 0.01 && Math.hypot(sample(b)[0][0] - pt[0], sample(b)[0][1] - pt[1]) < 0.01);
    assert.ok(Math.abs(pathFractionNear(d, pt) - f) < 0.01);
  }
});

// The audit: where a vessel's drawn end lies on the middle of another vein that shares its node, the blood of that end belongs there, not at the node.
// Every such end in the anatomy is either given a junction (JUNCTIONS) or listed here with the reason it stays at the node. A new shunt or collateral drawn onto
// the middle of a vein fails this until it is given a junction.
const STAYS = {
  'CAUD.end': 'the caudate veins are not drawn in the anatomy (ANAT_HIDDEN); in the circuit they end at the cava\'s top, where the model puts them',
  'AP_R.start': 'the arterioportal shunt leaves the right hepatic artery (the arterioles\' own lobar branch; engine.js velocity reads the artery before it): arterial, not split',
  'AP_L.start': 'the same, on the left',
  'SIN_RL.end': 'the interlobar sinusoidal link is modeled, not drawn (HIDDEN_EDGES)',
};
test('no other vessel is drawn onto the middle of a vein it is not joined to: each is split, or listed here with the reason it is not', () => {
  // (A vein split in pieces is one vein: its course is its pieces end to end.)
  const C = {}, TOUCH = {};
  for (const e of EDGES) {
    if (e.kind === 'wedge' || e.id.startsWith('X_') || typeof EDGE_PATH[e.id] !== 'string') continue;
    const host = partOf(e.id);
    (TOUCH[host] ||= new Set()).add(e.from).add(e.to);
  }
  for (const e of EDGES) if (TOUCH[e.id]) C[e.id] = (JUNCTION_PIECES[e.id] || [e.id]).flatMap((id, i) => sample(EDGE_PATH[id]).slice(i ? 1 : 0));
  const junctionNodes = new Set(JUNCTIONS.map((j) => j[0]));
  const found = new Set();
  for (const e of EDGES) {
    if (e.kind === 'wedge' || e.id.startsWith('X_') || typeof EDGE_PATH[e.id] !== 'string' || JUNCTION_PIECES[partOf(e.id)]?.length > 1 && e.part) continue;
    const P = sample(EDGE_PATH[e.id]);
    for (const [end, p, node] of [['start', P[0], e.from], ['end', P.at(-1), e.to]]) {
      if (junctionNodes.has(node)) continue;
      for (const host of Object.keys(C)) {
        if (host === e.id || !TOUCH[host].has(node)) continue;
        const [d, f] = onCourse(C[host], p);
        if (d < 7 && f > 0.2 && f < 0.8) found.add(`${e.id}.${end}`);
      }
    }
  }
  const stray = [...found].filter((k) => !(k in STAYS));
  assert.deepEqual(stray, [], `drawn onto the middle of a vein with no node there (give each a JUNCTIONS row): ${stray.join(', ')}`);
  const gone = Object.keys(STAYS).filter((k) => !found.has(k));
  assert.deepEqual(gone, [], `listed as staying, but no longer drawn onto the middle of a vein (take it off the list): ${gone.join(', ')}`);
});

test('each piece carries the flow that is physically in that stretch: the shunts have joined (or have not yet left) before the model\'s flow is read', () => {
  const e = run('cirr-decomp', { tips: { on: true, d: 8 }, spontaneous: { C6: true, C7: true }, dips: { on: true, d: 8 } });
  const Q = (id) => e.Q[e.ei[id]];
  // the portal vein: all of it before the stent leaves, what is left after
  assert.ok(Math.abs(Q('PVH_R_2') - (Q('PVH_R') + Q('AP_R') - Q('TIPS'))) < 1e-9 && Q('TIPS') > 0.1);
  // the hepatic vein: its own flow before the stent joins, the sum after (the model's flow there)
  assert.ok(Math.abs(Q('RHV_IVC') - (Q('RHV_IVC_1') + Q('TIPS'))) < 1e-9);
  // the left renal vein: the kidney's before the shunt joins, kidney plus shunt after
  assert.ok(Math.abs(Q('V_KID_L_1') - (Q('V_KID_L') + Q('C6') + Q('S_DSR'))) < 1e-9 && Q('C6') > 0.1);
  // the cava: the iliac veins' before the DIPS joins (the model's flow at its start includes it, so after the junction the whole)
  assert.ok(Math.abs(Q('IVC_IS') - (Q('IVC_IS_1') + Q('DIPS'))) < 1e-9);
  // the bowel's veins and the iliac veins: the retroperitoneal veins leave one and join the other
  assert.ok(Math.abs(Q('V_INT_1') - (Q('V_INT') - Q('C7'))) < 1e-9 && Math.abs(Q('ILI_IVC_1') - (Q('ILI_IVC') + Q('C7'))) < 1e-9);
  // the coronary vein joins the portal trunk 0.43 along it, the epigastric veins the SVC, the arterioportal shunt the left portal vein
  assert.ok(Math.abs(Q('PV_TRUNK') - (Q('PV_TRUNK_1') + Q('LGV_CONF'))) < 1e-9 && Math.abs(Q('SVC_RA') - (Q('SVC_RA_1') + Q('EPI_SVC'))) < 1e-9 && Math.abs(Q('PVH_L_1') - (Q('PVH_L') + Q('AP_L'))) < 1e-9);
  for (const c of JUNCTION_CHAINS) assert.equal(c.lead, c.end === 'to' ? 0 : c.ids.length - 1, `${c.host}: the engine's piece is on the side of the model's end`);
});

test('blood runs downhill through every piece of a cut vein, whichever way it runs (the blend, oxygen and dye passes visit nodes high pressure to low)', () => {
  const on = { tips: { on: true, d: 8 }, spontaneous: { C6: true, C7: true } };
  for (const [preset, params] of [['healthy'], ['cirr-decomp'], ['cirr-hepatofugal'], ['budd-chiari'], ['cirr-decomp', on], ['cirr-decomp', { dips: { on: true, d: 8 } }], ['cirr-hepatofugal', on]]) {
    const e = run(preset, params);
    for (const id of Object.values(JUNCTION_PIECES).flat()) {
      const q = e.Q[e.ei[id]], drop = e.P[e.ni[edge(id).from]] - e.P[e.ni[edge(id).to]];   // (the drawn ends)
      assert.ok(q * drop >= -1e-6, `${preset} ${JSON.stringify(params ?? {})}: ${id} runs ${q.toFixed(3)} against a drop of ${drop.toExponential(2)}`);
    }
  }
});

// Cutting a vein into pieces moves no flow of the model (15 Nov 2026, Mohammad saw the left portal vein teal beside a TIPS and asked whether the cut had
// changed it: it had not; measured against the build before the cut, every vessel that existed before carries the same mean flow, so the same reversal).
// What the cut adds is the stretches' own flows: the right portal vein beyond the stent runs backwards while the part before it runs on.
test('a TIPS in decompensated cirrhosis: the left portal vein\'s mean flow runs backwards (all but still at 8 mm, plainly at 10 mm), and the right portal vein reverses from the stent outward', () => {
  const shown = (d) => {
    const e = run('cirr-decomp', { tips: { on: true, d } });
    for (let i = 0; i < 400; i++) e.step(0.05);   // (the shown means: one breath and one beat)
    return (id) => e.Qf[e.ei[id]];
  };
  const q8 = shown(8), q10 = shown(10);
  // (At 8 mm the left portal vein's mean sits at the edge of still: a few thousandths of a mL/s one way or the other, which the ascites volume decides
  // (the lymph model, 16 Nov 2026, moved it from -0.01 to +0.002), so it is asked to be all but still, and the stent's 10 mm to reverse it plainly.)
  assert.ok(Math.abs(q8('PVH_L')) < 0.05, `left portal vein at 8 mm ${q8('PVH_L').toFixed(3)}`);
  assert.ok(q10('PVH_L') < -0.5, `left portal vein at 10 mm ${q10('PVH_L').toFixed(3)}`);
  for (const q of [q8, q10]) {
    assert.ok(q('PVH_R') > 5, 'the right portal vein runs on toward the stent');
    assert.ok(q('PVH_R_2') < -0.5, 'and backwards from the stent outward, where the sinusoids empty into it');
    assert.ok(Math.abs(q('PVH_R_2') - (q('PVH_R') + q('AP_R') - q('TIPS'))) < 1e-6 && Math.abs(q('RHV_IVC') - (q('RHV_IVC_1') + q('TIPS'))) < 1e-6, 'the pieces add up to the model\'s own flows');
  }
});

test('the peripheral hepatic vein beside a TIPS drains forward, the portal vein beyond the stent still reverses, and a junction\'s shown pressure follows the shown flow', async () => {
  const { flowReversed } = await import('../src/ui/velNormal.js');
  const { throughFlow } = await import('../src/ui/part-names.js');
  const reversed = (e, id) => flowReversed(e.Qf[e.ei[id]], 1, throughFlow(id, e.Qf, e.ei));
  const at = (d) => { const e = run('cirr-decomp', { tips: { on: true, d } }); for (let i = 0; i < 400; i++) e.step(0.05); return e; };
  const e8 = at(8), e10 = at(10);
  // (17 Nov 2026: the peripheral right hepatic vein ran backwards beside a TIPS only because the stent's flow ran through the whole vein's resistance in
  // the model; joined to the cava past it (topology.js eto), it drains the right lobe forward at both sizes, as it does after a working TIPS.)
  assert.ok(e8.Qf[e8.ei.RHV_IVC_1] > 0.5 && e10.Qf[e10.ei.RHV_IVC_1] > 0.5, 'the peripheral right hepatic vein runs forward at 8 and 10 mm');
  assert.equal(reversed(e8, 'RHV_IVC_1'), false); assert.equal(reversed(e10, 'RHV_IVC_1'), false);
  assert.equal(reversed(e8, 'PVH_R_2'), true);
  assert.equal(throughFlow('SV_CONF', e8.Qf, e8.ei), 0, 'a vein that is whole has no pieces to compare');
  // the shown pressure beside a junction agrees with the shown flow's direction (the lenses visit nodes by pressure, and the shown flow decides each vessel's direction)
  for (const e of [e8, e10]) for (const c of JUNCTION_CHAINS) {
    const toEnd = c.end === 'to', q = e.Qf[e.ei[c.ids[toEnd ? c.ids.length - 1 : 0]]];
    const at = e.Pf[toEnd ? e.ni[edge(c.ids[c.lead]).mto] : e.ni[edge(c.ids[c.lead]).mfrom]], j = e.Pf[e.ni[c.nodes[toEnd ? c.nodes.length - 1 : 0]]];
    if (Math.abs(q) > 1e-6) assert.ok((toEnd ? 1 : -1) * Math.sign(q) * (j - at) > 0, `${c.host}: the junction's shown pressure lies on the side the shown flow runs from (flow ${q.toFixed(3)}, junction ${(j - at).toExponential(1)})`);
  }
});
