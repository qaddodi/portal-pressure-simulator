import { stageSource } from './stage-src.js';
// A reading and its vessel light together on hover (sprint brief 8, 1 Nov 2026): the label under the pointer lights what it names with the
// vessel's own hover glow, a hovered vessel lifts its label.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NODES, EDGES } from '../src/engine/topology.js';
import { LABEL_VESSEL } from '../src/ui/anatomy.js';
import { HOVER_LINK, labelTarget, labelsOf, edgesOfLabel } from '../src/ui/hover-link.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = stageSource();
const css = read('styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
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
  const src = read('src/ui/hover-link.js');
  assert.doesNotMatch(src, /hoverlink=0|location\.search/);
});

test('off, the stage adds no class, no listener and no lift (stage.js)', () => {
  // The marker class on the label layer, the label listeners, the vessel-to-label sync and the setHover hook each sit under the switch.
  assert.match(stage, /if \(HOVER_LINK\) labelSvg\.classList\.add\('hovlink'\);/);
  assert.match(stage, /if \(HOVER_LINK && labelTarget\(key\)\) \{\s*g\.addEventListener\('pointerenter'/);
  assert.match(stage, /if \(HOVER_LINK\) linkSync\(\);/);
  assert.match(stage, /if \(HOVER_LINK\) \{ store\.on\('presenting', linkApply\)/);
  assert.match(stage, /const linkOK = \(\) => HOVER_LINK && /);
  // (Only linkSync writes the class.)
  const sync = /function linkSync\(\) \{[\s\S]*?\n {2}\}\n/.exec(stage)[0];
  assert.ok(sync.includes("'hov-link'"));
  assert.ok(!stage.replace(sync, '').includes("'hov-link'"), 'hov-link is written only by linkSync');
});

test('a finger, a talk and a drag light nothing', () => {
  assert.match(stage, /const linkOK = \(\) => HOVER_LINK && MQ\[3\]\.matches && !store\.get\(\)\.presenting && store\.get\(\)\.tool === 'select' && !(?:live\.)?(?:live\.)?shunt;/, 'a hovering pointer, never a talk, only the select tool');
  assert.match(stage, /g\.addEventListener\('pointerenter', \(e\) => \{ if \(e\.pointerType !== 'touch'\) (?:live\.)?linkHover\(key\); \}\);/, 'never a touch');
  // (The press on a label hands the pointer to the figure by capture, which ends the label's hover: clearHover also clears the link.)
  assert.match(stage, /function clearHover\(\) \{[^}]*if \((?:live\.)?(?:live\.)?linkPtr\) \{ (?:live\.)?(?:live\.)?linkPtr = null; linkApply\(\); \} \}/);
  // (A move kept for the next frame no longer overrides the vessel the label lit.)
  assert.match(stage, /function hoverAt\(ev, look\) \{\s*if \(linkHeld\(\)\) return;/);
  // (A label that fades out under a still pointer sends no leave: the hold checks :hover, so the vessels never stay deaf to the pointer.)
  assert.match(stage, /function linkHeld\(\) \{[\s\S]*?g\.matches\(':hover'\)[\s\S]*?(?:live\.)?(?:live\.)?linkPtr = null; linkApply\(\);/);
});

test('the label lights the vessel through setHover, so the glow is the vessel\'s own', () => {
  assert.match(stage, /if \(edge\) setHover\(edge, also\);/);
  // (setHover, with no `also`, is what it was: the vessel under the pointer and nothing else.)
  assert.match(stage, /function setHover\(id, also = null\) \{\s*if \(id === (?:live\.)?(?:live\.)?hoverId && also === vh\.also\) return;/);
  assert.match(stage, /setGlowSrc\('hover', on \? vhEdges\(on\)\.map\(\(id\) => \(\{ id, col: null, amt: 1\.0, wide: 0\.5, dur: D_SMALL \}\)\) : \[\]\);/);
  assert.match(stage, /g\.addEventListener\('focus'/);
  assert.match(stage, /g\.matches\(':focus-visible'\)/, 'focus lights it only from the keyboard, not after a click');
});

test('the look is all behind #labels.hovlink, on a hovering pointer, its fades on --d-small, and off with Reduce Motion', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()]);
  const mine = rules.filter(([sel]) => /hov-link|hovlink/.test(sel));
  assert.ok(mine.length >= 5, 'the lifted name, unit and leader, and their eases');
  for (const [sel] of mine) assert.match(sel, /#labels\.hovlink/, `${sel} sits behind the switch's class`);
  const lift = rules.find(([sel]) => /\.lb\.hov-link:not\(\.sel\):not\(:hover\)(?::not\(\.ui-hover\))? \.lb-name/.test(sel));
  assert.match(lift[1], /fill: var\(--text\)/, 'the name goes to full ink');
  const unit = rules.find(([sel]) => /\.lb\.hov-link \.lb-unit/.test(sel));
  assert.match(unit[1], /fill: var\(--text-2\)/);
  const lead = rules.find(([sel]) => /\.leader\.hov-link/.test(sel));
  assert.match(lead[1], /stroke: color-mix\(in srgb, var\(--text\) 62%, transparent\)/);
  assert.doesNotMatch(lead[1], /filter|box-shadow|drop-shadow|outline/, 'no glow, no border');
  assert.doesNotMatch(lift[1], /stroke|filter|background/, 'no panel, no border, no glow on the label');
  assert.ok(!rules.some(([, body]) => /transition:[^;]*\b(fill|stroke)\b/.test(body)), 'the ink is taken at once (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
  const leadEase = rules.filter(([, body]) => /transition: opacity var\(--d-small\) var\(--ease\)/.test(body));
  assert.ok(leadEase.length >= 1, 'the leader keeps its fade');
  assert.ok(css.includes('@media (hover: hover) {\n  .app:not(.presenting) #labels.hovlink'), 'on a hovering pointer only');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.app:not\(\.presenting\) #labels\.hovlink \.lb :is\(\.lb-name, \.lb-unit\)[^}]*transition: none;/);
});
