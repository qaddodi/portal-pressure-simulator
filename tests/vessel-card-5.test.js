// Card 5 on the side shelf (Mohammad's picks of 13 Nov 2026: placement B, contents card-5.html): every structure's card is the same
// shape (name, direction, pressure bar, readings by unit, icon controls, icon actions), one fixed size for its kind, and holds no
// scroll. These check the models every card is built from on a real patient, and the stylesheet's fixed sizes and places.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { EDGES } from '../src/engine/topology.js';
import { cardFor } from '../src/ui/actions.js';
import { cardSize } from '../src/ui/card.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), card = read('src/ui/card.js');
const CTX = { canShunt: () => true, injectDye: () => {}, canDye: () => true };
const PARAMS = { stenosis: {}, thrombus: {}, occluded: {}, spontaneous: {}, fibrosis: { R: {}, L: {} } };

function frameOf(preset) {
  const e = new Engine();
  if (preset) e.loadPreset(preset);
  e.settle();
  const D = new Float32Array(e.E);
  for (let k = 0; k < e.E; k++) D[k] = e.diameter(e.edges[k].id);
  return { P: e.P, Pf: e.Pf || e.P, Q: e.Q, Qf: e.Qf || e.Q, D, metrics: computeMetrics(e), slow: e.slow };
}
const f = frameOf('cirr-decomp');
const cards = [];
for (const e of EDGES) if (e.kind !== 'wedge') { const m = cardFor({ type: 'edge', id: e.id }, CTX); if (m) cards.push([e.id, m]); }
for (const id of ['liver', 'heart', 'varices', 'gastric', 'spleen']) cards.push([id, cardFor({ type: 'organ', id }, CTX)]);

test('every card is the one shape: a bar or one reading, readings that are numbers, controls and actions that carry an icon', () => {
  for (const [id, m] of cards) {
    assert.ok(m.title, id);
    if (m.span) {
      const s = m.span.at(f);
      assert.ok(Number.isFinite(s.a) && Number.isFinite(s.b) && Number.isFinite(s.d), `${id}: the bar's pressures`);
      assert.ok(Math.abs(s.a - s.b - s.d) < 0.06, `${id}: the drop is the bar's two ends`);
    } else assert.equal(typeof m.value, 'function', `${id}: a structure with no bar reads one value`);
    for (const v of m.verbs) {
      assert.notEqual(v.type, 'about', `${id}: no words on a vessel or organ card (they are in Details)`);
      if (v.type === 'read' || v.type === 'stat') assert.equal(typeof v.value(f), 'string', `${id}: ${v.unit || v.label}`);
      if (['slider', 'toggle', 'meter', 'button', 'dye', 'link'].includes(v.type)) assert.ok(v.icon, `${id}: ${v.label} has the app's icon`);
      if (['button', 'dye'].includes(v.type)) assert.ok(!/\s/.test(v.short || v.label), `${id}: the action "${v.short || v.label}" is one word`);
      if (v.type === 'meter') assert.ok(v.share(f) >= 0 && v.share(f) <= 1, `${id}: the meter is a share`);
    }
  }
});

test('the bar points from inflow to outflow, and across a stent and the liver it is the clinical pair', () => {
  const pv = cardFor({ type: 'edge', id: 'PV_TRUNK' }, CTX).span.at(f);
  assert.ok(pv.a >= pv.b - 1e-9, 'blood runs from the higher pressure to the lower');
  const liver = cardFor({ type: 'organ', id: 'liver' }, CTX);
  assert.deepEqual(liver.span.el, ['WHVP', 'FHVP']); assert.equal(liver.span.dn, 'HVPG'); assert.equal(liver.span.cut, 'hvpg');
  assert.ok(Math.abs(liver.span.at(f).d - f.metrics.hvpg) < 1e-9, 'the card\'s HVPG is the dock\'s');
  const tips = cardFor({ type: 'edge', id: 'TIPS' }, CTX);
  assert.deepEqual(tips.span.el, ['PV', 'IVC']); assert.equal(tips.span.dn, 'PPG'); assert.equal(tips.span.cut, 'ppg');
  assert.ok(Math.abs(tips.span.at(f).d - f.metrics.ppg) < 1e-9, 'the card\'s PPG is the dock\'s');
  assert.equal(cardFor({ type: 'edge', id: 'PV_TRUNK' }, CTX).span.el, null, 'a vein shows no end labels: the numbers say it');
});

test('the direction word: toward or away from the liver on the portal side, open for a shunt, none on an artery', () => {
  const word = (id) => cardFor({ type: 'edge', id }, CTX).status(f)?.[1] ?? null;
  assert.ok(['Hepatopetal', 'Hepatofugal', 'Stasis'].includes(word('PV_TRUNK')));
  assert.equal(word('A_HEP'), null);
  assert.ok(['Patent', 'Stasis'].includes(word('TIPS')));
  const lgv = EDGES.find((e) => e.id === 'C1a') ? word('C1a') : 'Hepatofugal';
  assert.ok(['Hepatofugal', 'Hepatopetal', 'Stasis'].includes(lgv));
});

test('one fixed size for each kind of card: two controls fit the small card, three or four the tall one, a lobule part its own', () => {
  const size = (sel) => cardSize(cardFor(sel, CTX), PARAMS);
  assert.equal(size({ type: 'edge', id: 'PV_TRUNK' }), 's');
  assert.equal(size({ type: 'organ', id: 'liver' }), 's');
  assert.equal(size({ type: 'edge', id: 'TIPS' }), 'l', 'diameter, stenosis and where');
  assert.equal(size({ type: 'organ', id: 'heart' }), 'l');
  assert.equal(size({ type: 'lobule', part: 'sin' }), 'x');
  assert.match(css, /\.action-card \{\n {2}position: absolute;[^}]*left: calc\(env\(safe-area-inset-left, 0px\) \+ 14px\); top: calc\(var\(--top-safe, 56px\) \+ 8px\); width: 276px; height: 320px;/, 'the Mac shelf: 276 x 320 under the case pill');
  assert.match(css, /\.action-card\.docked \{\n[^}]*width: auto; height: 224px;/, 'the iPhone card: 224 tall');
  assert.match(css, /\.app\.thumb:not\(\.dock-open\) \.action-card\.docked \{\n {4}bottom: calc\(var\(--nb-occ, calc\(var\(--vdock-h\) \+ 14px\)\) \+ 50px\);/, 'above the view switch');
  assert.ok(!/\.action-card[^{]*\{[^}]*overflow-y: auto/.test(css), 'nothing in the card scrolls');
  assert.ok(!/\.action-card\.docked:not\(\[hidden\]\)/.test(css.match(/^\.app\.thumb:is\(\.dock-open[^\n]*/m)[0]), 'the view switch stays up under an open card');
});

test('no leader, no placement by the vessel: the card stands in one place and its bar moves on the compositor', () => {
  assert.ok(!/placeCard|drawLeader|ac-leader/.test(card));
  assert.ok(!/ac-leader/.test(css));
  assert.match(card, /ramp\.style\.transform = `translateX\(/);
  assert.match(card, /ramp\.style\.background = gradientCss\('to right', RAMP_TOP\);/, 'the colours are laid once, when the card is built');
});
