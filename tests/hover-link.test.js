import { stageSource } from './stage-src.js';
// A reading and its vessel light together on hover (sprint brief 8, 1 Nov 2026): the label under the pointer lights what it names with the
// vessel's own hover glow, a hovered vessel lifts its label.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES, EDGES } from '../src/engine/topology.js';
import { LABEL_VESSEL } from '../src/ui/anatomy.js';
import { HOVER_LINK, labelTarget, labelsOf, edgesOfLabel } from '../src/ui/hover-link.js';
import { appCss } from './split-src.js';

const stage = stageSource();
const css = appCss().replace(/\/\*[\s\S]*?\*\//g, '');
const EDGE_IDS = new Set(EDGES.map((e) => e.id));

test('a station label names the vessel a click on it selects', () => {
  assert.deepEqual(labelTarget('n:CONF'), { edge: 'PV_TRUNK', also: [] });
  assert.deepEqual(labelTarget('n:SIN_R'), { edge: 'SIN_RR', also: [] }, 'the sinusoids are one vessel on each side');
  assert.deepEqual(labelTarget('n:RHV'), { edge: 'RHV_IVC', also: [] });
  assert.deepEqual(labelTarget('n:IVCS'), { edge: 'IVCS_RA', also: [] }, 'the cava lights whole: stage.js vhEdges');
  assert.deepEqual(labelTarget('n:W_R'), { edge: 'RHV_IVC', also: [] }, 'a wedge reading is its hepatic vein');
});

test('the varices name the vessel their callout hangs from, a stent its own, the atrium its organ', () => {
  assert.deepEqual(labelTarget('n:VAR'), { edge: 'C1a', also: [] });
  assert.deepEqual(labelTarget('n:TIPS'), { edge: 'TIPS', also: [] });
  assert.deepEqual(labelTarget('n:TIPS:mid'), { edge: 'TIPS', also: [] }, 'a stent called out at its three points');
  assert.deepEqual(labelTarget('n:RA'), { organ: 'heart' });
});

test('the splenic vein lights both its runs: the one a click selects and the one its callout hangs from', () => {
  assert.deepEqual(labelTarget('n:SV'), { edge: 'SV_CONF', also: ['V_SPL'] });
  assert.deepEqual(edgesOfLabel(labelTarget('n:SV')), ['SV_CONF', 'V_SPL']);
  assert.deepEqual(labelsOf(['n:SV', 'n:CONF'], new Set(['V_SPL'])), ['n:SV'], 'hovering the distal run lifts the splenic vein label');
  assert.deepEqual(labelsOf(['n:SV', 'n:CONF'], new Set(['SV_CONF'])), ['n:SV']);
});

test('what has nothing of its own to light names nothing (no stray glow)', () => {
  for (const k of ['o:LIVER', 'z:Heart', 'lane:SMV', 'scan', 'focusO0', 'n:STO', 'n:GV', 'n:EPI', 'n:AO', '', null, undefined]) assert.equal(labelTarget(k), null, String(k));
});

test('every vessel a label names exists in the model', () => {
  for (const n of NODES) for (const e of edgesOfLabel(labelTarget('n:' + n.id))) assert.ok(EDGE_IDS.has(e), `${n.id} names ${e}`);
  for (const e of Object.values(LABEL_VESSEL)) assert.ok(EDGE_IDS.has(e), e);
});

test('a hovered vessel lifts the labels that name it, and only those', () => {
  const keys = ['n:CONF', 'n:PVH', 'n:SIN_R', 'n:RHV', 'o:LIVER', 'n:SMV'];
  assert.deepEqual(labelsOf(keys, new Set(['PV_TRUNK'])), ['n:CONF', 'n:PVH'], 'the portal trunk is named by the confluence and the porta hepatis');
  assert.deepEqual(labelsOf(keys, new Set(['SIN_RR'])), ['n:SIN_R']);
  assert.deepEqual(labelsOf(keys, new Set(['IVC_IS'])), []);
  assert.deepEqual(labelsOf(keys, new Set()), []);
  assert.deepEqual(labelsOf(keys, null), []);
});

test('it is on: no switch in the address turns it off', () => {
  assert.equal(HOVER_LINK, true);
});

test('off, the stage adds no class, no listener and no lift (stage.js)', () => {
  // The marker class on the label layer, the label listeners, the vessel-to-label sync and the setHover hook each sit under the switch.
  // (Only linkSync writes the class.)
  const sync = /function linkSync\(\) \{[\s\S]*?\n {2}\}\n/.exec(stage)[0];
  assert.ok(sync.includes("'hov-link'"));
  assert.ok(!stage.replace(sync, '').includes("'hov-link'"), 'hov-link is written only by linkSync');
});



test('the look is all behind #labels.hovlink, on a hovering pointer, its fades on --d-small, and off with Reduce Motion', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()]);
  const mine = rules.filter(([sel]) => /hov-link|hovlink/.test(sel));
  assert.ok(mine.length >= 5, 'the lifted name, unit and leader, and their eases');
  for (const [sel] of mine) assert.match(sel, /#labels\.hovlink/, `${sel} sits behind the switch's class`);
  const lift = rules.find(([sel]) => /\.lb\.hov-link:not\(\.sel\):not\(:hover\)(?::not\(\.ui-hover\))? \.lb-name/.test(sel));
  assert.match(lift[1], /fill: var\(--text\)/, 'the name goes to full ink');
  const lead = rules.find(([sel]) => /\.leader\.hov-link/.test(sel));
  assert.doesNotMatch(lead[1], /filter|box-shadow|drop-shadow|outline/, 'no glow, no border');
  assert.doesNotMatch(lift[1], /stroke|filter|background/, 'no panel, no border, no glow on the label');
  assert.ok(!rules.some(([, body]) => /transition:[^;]*\b(fill|stroke)\b/.test(body)), 'the ink is taken at once (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
  const leadEase = rules.filter(([, body]) => /transition: opacity var\(--d-small\) var\(--ease\)/.test(body));
  assert.ok(leadEase.length >= 1, 'the leader keeps its fade');
  assert.ok(css.includes('@media (hover: hover) {\n  .app:not(.presenting) #labels.hovlink'), 'on a hovering pointer only');
});
