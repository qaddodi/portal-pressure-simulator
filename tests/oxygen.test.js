// Colored by oxygen (Fable review G11, Mohammad yes 16 Oct): each vessel's oxygen saturation, from the flows the
// model already mixes for blood origin. The hepatic artery is arterial, the portal vein carries gut venous blood,
// the sinusoids use oxygen along their length and the hepatic veins carry what is left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { EDGES, NODES } from '../src/engine/topology.js';
import { oxygenSat, oxygenFor, SAT, LIVER_EXTRACTION } from '../src/ui/blood.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ends = (o, id) => [o.edge[2 * EI[id]], o.edge[2 * EI[id] + 1]];
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

test('oxygen: healthy liver, artery bright, portal blood gut venous, the sinusoids darken toward the central vein', () => {
  const e = new Engine(); e.settle();
  const o = oxygenSat(EDGES, NODES, e.Q, e.P);
  for (const id of ['A_HEP', 'A_HR', 'A_HL']) for (const s of ends(o, id)) assert.ok(near(s, SAT.artery), `${id} ${s}`);
  for (const id of ['V_INT', 'SV_CONF', 'PV_TRUNK', 'PRE_R']) for (const s of ends(o, id)) assert.ok(near(s, SAT.gut), `${id} ${s}`);
  const [inR, outR] = ends(o, 'SIN_RR');
  assert.ok(inR > SAT.gut && inR < SAT.artery, `the sinusoids' inlet mixes portal and arterial blood: ${inR}`);
  assert.ok(near(outR, inR * (1 - LIVER_EXTRACTION), 1e-6), `the liver takes its share: ${inR} → ${outR}`);
  const hv = ends(o, 'RHV_IVC')[0];
  assert.ok(hv > 0.6 && hv < 0.7, `hepatic venous blood about 65 %: ${hv}`);
  const ivc = o.node[NI.IVCS], ra = ends(o, 'IVCS_RA')[1];
  assert.ok(ivc > hv && ivc < SAT.systemic, `the IVC above the hepatic veins mixes them with systemic blood: ${ivc}`);
  assert.ok(near(ra, ivc), 'nothing is used along a vein');
});

test('oxygen: saturation mixes flow-weighted at a junction', () => {
  const e = new Engine(); e.settle();
  const o = oxygenSat(EDGES, NODES, e.Q, e.P);
  for (const n of ['SIN_R', 'IVCS', 'CONF']) {
    let w = 0, s = 0;
    EDGES.forEach((x, k) => {
      if (x.kind === 'wedge' || !e.Q[k]) return;
      const into = (e.Q[k] > 0 && x.to === n) || (e.Q[k] < 0 && x.from === n);
      if (into) { const q = Math.abs(e.Q[k]); w += q; s += q * o.edge[2 * k + (e.Q[k] > 0 ? 1 : 0)]; }
    });
    assert.ok(near(o.node[NI[n]], s / w, 1e-5), `${n}: ${o.node[NI[n]]} vs ${s / w}`);
  }
});

test('oxygen: with hepatofugal portal flow the hepatic artery fills the sinusoids, and the reversed portal vein carries arterialized blood', () => {
  const h = new Engine(); h.settle();
  const e = new Engine(); e.loadPreset('cirr-hepatofugal');
  const H = oxygenSat(EDGES, NODES, h.Q, h.P), C = oxygenSat(EDGES, NODES, e.Q, e.P);
  assert.ok(ends(C, 'SIN_RR')[0] > ends(H, 'SIN_RR')[0] + 0.05, 'brighter sinusoid inlet');
  assert.ok(e.Q[EI.PV_TRUNK] < 0, 'the preset reverses the portal vein');
  assert.ok(ends(C, 'PV_TRUNK')[1] > SAT.gut + 0.05, 'the portal vein leaves the liver with arterial blood in it');
});

test('oxygen: computed once per model frame and shared', () => {
  const e = new Engine(); e.settle();
  const f = { Q: e.Q, P: e.P };
  assert.equal(oxygenFor(EDGES, NODES, f), oxygenFor(EDGES, NODES, { ...f }));
});

test('oxygen: a view in the Colored by menu, the legend, the lobule, the vessel card and the slide words', () => {
  const main = src('src/ui/main.js');
  assert.match(main, /oxygen: \['Oxygen', /, 'a Colored by choice');
  assert.match(main, /oxygen: 'Oxygen'/, 'the menu label');
  assert.match(main, /m === 'oxygen'/, 'its own legend');
  assert.match(src('src/ui/stage.js'), /mode === 'oxygen'\) \{ c1 = oxygenColor\(oxy\[2 \* k\]\); c2 = oxygenColor\(oxy\[2 \* k \+ 1\]\)/, 'the figure colors each lumen end');
  assert.match(src('src/ui/lobule-zoom.js'), /M === 'oxygen'/, 'the lobule colors its vessels');
  assert.match(src('src/ui/lobule-model.js'), /m\.mode === 'oxygen'/);
  assert.match(src('src/ui/actions.js'), /lens === 'oxygen'/, 'the vessel card reads the saturation');
  const pres = src('src/ui/presenter.js');
  assert.match(pres, /oxygen: 'oxygen' \}/, '"colored by oxygen" is a pill');
  assert.match(pres, /oxygen: '--lens-oxygen' \}/);
});

test('oxygen: its ramp runs blue to red and its pill colour is its own', () => {
  const tokens = src('styles/tokens.css');
  const ramp = tokens.match(/--ramp-oxygen: ([^;]+);/)[1].split(',').map((x) => x.trim().split(/\s+/)[0]);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [lo, hi] = [rgb(ramp[0]), rgb(ramp.at(-1))];
  assert.ok(lo[2] > lo[0], 'low saturation is blue');
  assert.ok(hi[0] > hi[2] * 1.5, 'high saturation is red');
  const pill = tokens.match(/--lens-oxygen: (#[0-9A-F]{6})/i)[1].toUpperCase();
  const taken = ['--lens-heat', '--vel-normal', '--lens-flow', '--flow-reversed', '--lens-drop', '--origin-spleen'].map((t) => tokens.match(new RegExp(`${t}: (#[0-9A-F]{6})`, 'i'))[1].toUpperCase());
  assert.ok(!taken.includes(pill), 'distinct from the other views\' pills');
});

// Mohammad, 17 Oct: in the Oxygen lens the figure's labels read the oxygen saturation (% O₂), not pressure, from the same
// saturation the lens colours by: the anatomy's station labels and the lobule's Portal venule, Sinusoids and Central vein.
test('oxygen: the labels read % O₂ in the Oxygen lens, from the value the lens colours by', () => {
  const stage = src('src/ui/stage.js'), lz = src('src/ui/lobule-zoom.js');
  const runs = stage.slice(stage.indexOf('function layerRuns('), stage.indexOf('function shortenItem('));
  assert.match(runs, /lm !== 'oxygen'/, 'the oxygen lens has its own label runs');
  assert.match(runs, /oxygenFor\(EDGES, NODES, f\)\.node\[NI\[id\]\]/, 'anatomy labels read the station node\'s saturation');
  assert.match(runs, /'% O₂'/);
  const mv = lz.slice(lz.indexOf('const mv = (key, v, r) =>'), lz.indexOf("setLab('triad'"));
  assert.match(mv, /m\.mode === 'oxygen' && m\.oxy/, 'lobule labels switch to oxygen in the Oxygen lens');
  assert.match(mv, /'% O₂'/);
  assert.match(src('src/ui/lobule-model.js'), /m\.oxy = \[node\[NI\[S\.pv\]\], node\[NI\[S\.sin\]\], node\[NI\[S\.cv\]\]\]/, 'portal venule, sinusoids, central vein in that order');
});
