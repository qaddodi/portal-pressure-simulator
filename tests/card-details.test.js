// The details of a structure are inside its own card (17 Nov 2026, Mohammad: "have the card itself slide into these extensive more details... Not make a new
// pop up"). A tap on the card's name slides the face away and the details in, in the same box; Back slides the face home. These hold the data: every card with a
// name to tap has details that say something the card does not, and the numbers they read are real on a real patient. (The source shapes, that the panel for a
// vessel or an organ is gone and the slide moves by opacity and translate only: scripts/source-shapes/card-details-17nov.mjs.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { EDGES } from '../src/engine/topology.js';
import { cardFor } from '../src/ui/actions.js';
import { detailsPlan, stationName } from '../src/ui/card-details.js';
import { newCell } from '../src/ui/live-readings.js';

const CTX = { canShunt: () => true, injectDye: () => {}, canDye: () => true };

function frameOf(preset) {
  const e = new Engine();
  if (preset) e.loadPreset(preset);
  e.settle();
  const D = new Float32Array(e.E);
  for (let k = 0; k < e.E; k++) D[k] = e.diameter(e.edges[k].id);
  return { P: e.P, Pf: e.Pf || e.P, Q: e.Q, Qf: e.Qf || e.Q, D, metrics: computeMetrics(e), slow: e.slow };
}
const cards = [];
for (const e of EDGES) if (e.kind !== 'wedge') { const m = cardFor({ type: 'edge', id: e.id }, CTX); if (m) cards.push([e.id, m]); }
for (const id of ['liver', 'heart', 'varices', 'gastric', 'spleen']) cards.push([id, cardFor({ type: 'organ', id }, CTX)]);

test('every card with a name to tap has details: its kind, its words, its Why?, and numbers that are real on a patient', () => {
  for (const preset of ['healthy', 'cirr-decomp']) {
    const f = frameOf(preset === 'healthy' ? null : preset);
    for (const [id, m] of cards) {
      assert.ok(!m.noDetails, id);
      const plan = detailsPlan(m);
      assert.ok(plan, `${id}: details`);
      assert.ok(plan.kicker && plan.about.length > 40, `${id}: says what it is`);
      assert.ok(plan.why, `${id}: asks the Why? explainer, by the card's own id`);
      assert.equal(plan.why, m.why, `${id}: the card's own Why?`);
      for (const [name, fn] of plan.stats) {
        const text = fn(f, newCell());
        assert.equal(typeof text, 'string', `${id} ${name}`);
        assert.ok(text.length > 0 && !/NaN|undefined|Infinity/.test(text), `${id} ${name}: "${text}" (${preset})`);
      }
    }
  }
});

test('a vessel\'s details name the two stations its bar reads and leave out what the card already shows', () => {
  const SAID = /^(In|Out)\b|Pressure drop|^Flow$|velocity|^Diameter$|Doppler/i;
  for (const [id, m] of cards) {
    const plan = detailsPlan(m);
    for (const [name] of plan.stats) assert.ok(!SAID.test(name), `${id}: "${name}" is on the card already`);
    if (m.edge) {
      assert.match(plan.between, / → /, `${id}: between two stations`);
      const kind = EDGES.find((e) => e.id === id).kind;
      assert.equal(plan.stats[0][0], 'Resistance', `${id}: resistance first`);
      assert.deepEqual(plan.stats.slice(1).map((x) => x[0]), kind === 'collateral' ? ['Recruited'] : kind === 'shunt' ? [] : ['Healthy flow'], `${id}: how far a collateral has opened, nothing for a shunt (a healthy patient has none), else the healthy flow`);
    } else assert.equal(plan.between, null, `${id}: an organ has no two ends`);
  }
});

test('a lobule part\'s card has no name to tap and no details', () => {
  assert.equal(detailsPlan({ title: 'Hepatocytes · zone 1', verbs: [] }), null);
  assert.equal(cardFor({ type: 'lobule', part: 'hepatocyte', zone: 1 }, CTX)?.noDetails, true);
});

test('no segment\'s two ends read alike, and none repeats the figure label\'s "(where ...)" aside: a station is named by its place along its vessel', () => {
  const base = (s) => s.split(/,| \(/)[0].trim();
  let shared = 0;
  for (const e of EDGES) {
    if (e.kind === 'wedge') continue;
    const a = stationName(e.from), b = stationName(e.to);
    assert.notEqual(a, b, `${e.id}: ${a}`);
    assert.ok(!/\(where|\(midway|\(hilum|\(main/.test(a + b), `${e.id}: "${a} → ${b}" has a figure label's aside`);
    if (base(a) === base(b)) { shared++; assert.ok(/, /.test(a) || /, /.test(b), `${e.id}: of one vessel's two ends, one at least is named by its place: "${a} → ${b}"`); }
    const m = cardFor({ type: 'edge', id: e.id }, CTX);   // (a segment with no card of its own has no details to name)
    if (m?.edge === e.id) assert.equal(detailsPlan(m).between, `${a} → ${b}`, e.id);   // (a card may stand for the vessel's other segment: only its own edge is compared)
  }
  assert.ok(shared >= 8, 'the portal trunk, the hepatic and portal branches, the IVC and SVC have such segments');
  assert.equal(detailsPlan(cardFor({ type: 'edge', id: 'PV_TRUNK' }, CTX)).between, 'Portal vein, at the coronary vein → Portal vein, at the hilum');
});
