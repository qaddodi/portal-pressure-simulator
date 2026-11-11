import { stageSource } from './stage-src.js';
// Loops that ran while nothing changed now skip their work, and only that (Fable's review, item 2 and the safe performance
// fixes): the Pressure chart stops repainting an unchanged picture, the home framing, the labels' card boxes and the corner
// credit's poll measure only when something they measure may have moved, the comparison line is rebuilt only when a number
// changes, and the blood's composite reuses its buffers. Nothing here paces a frame: what changes still draws every frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glideMoving, compareRows, netChanged, createLayoutWatch, PLACED, PLACE_ATTRS, PAINT_ONLY, INNER_FREE } from '../src/ui/idle-keys.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('the chart glides only while what it draws is moving', () => {
  // The eased copy of the filtered pressures is what is drawn (premium-feel R4): it keeps the glide while it moves, and settles.
  assert.equal(glideMoving(true, false), true);
  assert.equal(glideMoving(false, true), true);    // the axis still easing
  assert.equal(glideMoving(false, false), false);
  const charts = src('charts.js');
  assert.match(charts, /const moving = glideMoving\(mP, mA\)/);
  assert.match(charts, /Fshown\.P = shownP; Fshown\.Pf = Fraw\.Pf \? shownP : Fraw\.Pf;/);
  assert.match(charts, /createEaser\(undefined, \{ small: 0\.1, jumps: true \}\)/);
  assert.match(charts, /reading\(n, F\.Pf \|\| F\.P\)/);
});

test('the comparison line shows the same deltas and is rebuilt only when one changes', () => {
  const fmt = (v, d) => v.toFixed(d);
  const a = { hvpg: 10, liverPerfPct: 80, shuntFraction: 0.1 }, b = { hvpg: 12.34, liverPerfPct: 70.2, shuntFraction: 0.25 };
  assert.deepEqual(compareRows(a, b, true, true, fmt), [['HVPG', '+2.3 mmHg'], ['Liver flow', '-10 pts'], ['Shunting', '+15 pts']]);
  assert.deepEqual(compareRows(a, b, false, true, fmt).map((r) => r[0]), ['Liver flow', 'Shunting']);
  assert.deepEqual(compareRows(a, b, true, false, fmt).map((r) => r[0]), ['HVPG']);
  // (2 Nov 2026: rebuilt between frames only when its moment or names change; its numbers drawn on the GPU, gl-words.js, as they change.)
  assert.match(src('dock.js'), /if \(!same\) \{ cmpWhen = st\.compareSnap\.when;[^\n]*cmpAsk \|\|= restPass\(buildComparison\); \}/);
  assert.match(src('dock.js'), /for \(let i = 0; i < rows\.length; i\+\+\) cmpNums\[i\]\?\.set\(rows\[i\]\[1\]\)/);
});

// A record as a MutationObserver gives it, over a fake element.
const el = (attrs = {}) => ({ nodeType: 1, attrs, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; } });
const rec = (target, attributeName, oldValue) => ({ type: 'attributes', target, attributeName, oldValue });

test('a write of the value already there is no change; a new value or a node coming or going is', () => {
  const g = el({ transform: 'scale(1)', d: 'M0 0' });
  assert.equal(netChanged([rec(g, 'transform', 'scale(1)'), rec(g, 'd', 'M0 0')]), false);
  assert.equal(netChanged([rec(g, 'transform', 'scale(0.9)')]), true);
  // Changed and changed back in one batch: the first record holds the value before it.
  assert.equal(netChanged([rec(g, 'transform', 'scale(1)'), rec(g, 'transform', 'scale(2)')]), false);
  assert.equal(netChanged([{ type: 'childList', target: g, addedNodes: [el()], removedNodes: [] }]), true);
  assert.equal(netChanged([{ type: 'childList', target: g, addedNodes: [], removedNodes: [] }]), false);
  const t = { data: 'a' };
  assert.equal(netChanged([{ type: 'characterData', target: t, oldValue: 'a' }]), false);
  assert.equal(netChanged([{ type: 'characterData', target: t, oldValue: 'b' }]), true);
});

function fakes() {
  const mos = [];
  class MO { constructor(cb) { this.cb = cb; this.q = []; this.obs = []; mos.push(this); } observe(n, o) { this.obs.push([n, o]); } takeRecords() { const q = this.q; this.q = []; return q; } }
  const ros = [];
  class RO { constructor(cb) { this.cb = cb; this.els = new Set(); ros.push(this); } observe(e) { this.els.add(e); } unobserve(e) { this.els.delete(e); } }
  return { MO, RO, mos, ros };
}

test('the layout watch is due from a change until it has settled, and not on unchanged frames', () => {
  let t = 0;
  const { MO, RO, mos, ros } = fakes();
  const card = { ...el({ class: 'card' }), matches: (s) => s.includes('[data-safe]'), querySelector: () => null, closest: () => card };
  const label = { ...el({ style: 'opacity: 1' }), matches: () => false, querySelector: () => null, closest: () => null };
  const root = { querySelectorAll: () => [card], ownerDocument: { addEventListener() {} } };
  const w = createLayoutWatch({ root, now: () => t, settle: 2500, MO, RO, exclude: () => false });
  const [groupMO, pageMO] = mos;
  assert.ok(ros[0].els.has(card), 'a placed piece is watched for size');
  assert.deepEqual(pageMO.obs[0][1].attributeFilter, PLACE_ATTRS);
  assert.equal(w.due(), true, 'the first look is always taken');
  t = 3000;
  assert.equal(w.due(), false);
  // The organs rewritten with the same values on every model frame: still settled.
  const g = el({ transform: 'scale(1)' });
  groupMO.q.push(rec(g, 'transform', 'scale(1)'));
  assert.equal(w.due(), false);
  // The spleen grows: due, and for the settle time after.
  g.attrs.transform = 'scale(1.1)'; groupMO.q.push(rec(g, 'transform', 'scale(1)'));
  assert.equal(w.due(), true);
  t = 5400; assert.equal(w.due(), true);
  t = 5600; assert.equal(w.due(), false);
  // A style change on something that places nothing: not looked at.
  label.attrs.style = 'opacity: 0.5'; pageMO.q.push(rec(label, 'style', 'opacity: 1'));
  assert.equal(w.due(), false);
  // A card's class changing: due.
  card.attrs.class = 'card open'; pageMO.q.push(rec(card, 'class', 'card'));
  assert.equal(w.due(), true);
  t = 9000; assert.equal(w.due(), false);
  // A card changing size, and whatever the caller reports.
  ros[0].cb(); assert.equal(w.due(), true);
  t = 12000; assert.equal(w.due(), false);
  w.touch(); assert.equal(w.due(), true);
});

test('records an observer delivers to its callback count, with those still queued after them', () => {
  let t = 0;
  const { MO, RO, mos } = fakes();
  const card = { ...el({ class: 'card' }), matches: (s) => s.includes('[data-safe]'), querySelector: () => null, closest: () => card };
  const root = { querySelectorAll: () => [card], ownerDocument: { addEventListener() {} } };
  const w = createLayoutWatch({ root, now: () => t, settle: 2500, MO, RO, exclude: () => false });
  const [groupMO, pageMO] = mos;
  t = 3000; assert.equal(w.due(), false);
  // A card opening, delivered to the callback (no longer queued for takeRecords) before the next check.
  card.attrs.class = 'card open';
  pageMO.cb([rec(card, 'class', 'card')]);
  assert.equal(w.due(), true, 'a delivered page change is not dropped');
  t = 6000; assert.equal(w.due(), false);
  // A delivered change and a queued one that undoes it: no net change.
  const g = el({ transform: 'scale(1)' });
  g.attrs.transform = 'scale(1)';
  groupMO.q.push(rec(g, 'transform', 'scale(2)'));
  groupMO.cb([rec(g, 'transform', 'scale(1)')]);
  assert.equal(w.due(), false, 'delivered first, queued after: the first record holds the value before the batch');
  // A delivered group change.
  g.attrs.transform = 'scale(1.1)';
  groupMO.cb([rec(g, 'transform', 'scale(1)')]);
  t = 6001; assert.equal(w.due(), true, 'a delivered group change is not dropped');
});

test('a transition that moves no box leaves the watch settled; one that moves a placed piece makes it due', () => {
  let t = 0;
  const { MO, RO } = fakes();
  const listeners = {};
  const card = { ...el({ class: 'card' }), matches: (s) => s.includes('[data-safe]'), querySelector: () => null, closest: () => card };
  const fill = { ...el({}), matches: () => false, querySelector: () => null, closest: () => card };   // (a lapse bar's fill inside the card)
  const holder = { ...el({}), matches: () => false, querySelector: () => card, closest: () => null };  // (a parent of the card)
  const root = { querySelectorAll: () => [card], ownerDocument: { addEventListener(type, fn) { listeners[type] = fn; } } };
  const w = createLayoutWatch({ root, now: () => t, settle: 2500, MO, RO, exclude: () => false });
  t = 3000; assert.equal(w.due(), false);
  const run = (target, propertyName) => listeners.transitionrun({ target, propertyName });
  for (const p of ['transform', 'opacity', 'color']) { run(fill, p); assert.equal(w.due(), false, `${p} inside the card`); }
  for (const p of ['color', 'box-shadow', 'background-color']) { run(card, p); assert.equal(w.due(), false, `${p} on the card`); }
  run(fill, 'width'); assert.equal(w.due(), true, 'a width inside the card can grow it');
  t = 6000; assert.equal(w.due(), false);
  run(card, 'transform'); assert.equal(w.due(), true, 'the card itself moving');
  t = 9000; assert.equal(w.due(), false);
  run(holder, 'transform'); assert.equal(w.due(), true, 'a parent moving the card');
  t = 12000; assert.equal(w.due(), false);
  listeners.animationstart({ target: fill }); assert.equal(w.due(), true, 'an animation: its properties are unknown');
  assert.ok(PAINT_ONLY.has('color') && INNER_FREE.has('transform'));
  // (and the model's parameters, set several times a second by a slide's time-lapse, wake the stage's watch no more than its frames do)
  assert.match(stageSource(), /for \(let i = 0; i < keys\.length; i\+\+\) if \(keys\[i\] !== 'frame' && keys\[i\] !== 'params'\) \{ watch\.touch\(\); break; \}/);
});

test('the framing, the labels\' card boxes and the credit\'s poll go by the watch', () => {
  const stage = stageSource();
  assert.match(stage, /if \(home && now - (?:live\.)?(?:live\.)?homeCheck > 500 && watch\.due\(\)\)/);
  assert.match(stage, /if \(home && !(?:live\.)?wasHome\) watch\.touch\(\)/);
  assert.match(stage, /performance\.now\(\) - (?:live\.)?blockersAt > 100 && watch\.due\(\)/);
  assert.match(stage, /for \(const g of \[gBackdrop, gOrgans, gAscites\]\) watch\.addGroup\(g\)/);
  const credit = src('credit.js');
  assert.match(credit, /if \(watch\.due\(\) \|\| k !== polled/);
  // Every obstacle the credit measures, and every piece the framing and the labels keep clear of, is watched.
  const { OBSTACLES } = { OBSTACLES: credit.match(/export const OBSTACLES = '([^']+)'/)[1] };
  const bases = OBSTACLES.split(',').map((s) => s.trim().split(/[\s:]/)[0].split('.').filter(Boolean)[0]);
  for (const b of bases) assert.ok(PLACED.includes('.' + b), `${b} is not watched`);
  for (const s of ['[data-safe]', '.stage-blocker', '.pz-shade', '#zoomPill']) assert.ok(PLACED.includes(s), s);
});

test('an organ outline is laid under the vessels: a draw marked under lives in the warm layer, the marks stay in the outline layer (11 Nov 2026)', () => {
  const gl = src('veins-gl.js'), ol = src('stage-outlines.js');
  assert.match(gl, /isHardDraw = \(d\) => !d\.soft && !d\.under, isWarmDraw = \(d\) => d\.warm \|\| d\.under;/);
  assert.match(gl, /if \(warm\) drawLines\(m, false, false, true\);/);
  assert.match(gl, /!!d\.under !== under/);
  assert.match(ol, /d\.under = !soft && !warm \? true : undefined;/);
});

test('an outline change redraws the outline layer alone, a glow change its glow layer alone', () => {
  const gl = src('veins-gl.js');
  // (External review, 21 Oct: one outline's opacity redrew all three layers.)
  // (The signatures are lists of numbers kept between calls, not strings.)
  assert.match(gl, /const i = d\.warm \|\| d\.under \? 2 : d\.soft \? 1 : 0, c = d\.col;/);
  assert.match(gl, /if \(fresh \|\| !same\) \{[^}]*SIG_KN\[i\] = SIG_N\[i\]; lineVers\[i\]\+\+; \}/);
  assert.match(gl, /lineVers\[0\] !== lineKV \|\| viewId !== lineKI/);
  assert.match(gl, /if \(lineVers\[1\] !== glowKV \|\| viewId !== glowKI\)/);
  assert.match(gl, /if \(lineVers\[2\] !== warmKV \|\| viewId !== warmKI\)/);
  assert.doesNotMatch(gl, /lineVer\b/);
});
