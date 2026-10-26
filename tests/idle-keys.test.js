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
  // With the model's filtered pressures in the frame, the eased copy is not what is drawn: its easing alone never keeps the glide.
  assert.equal(glideMoving(true, true, false), false);
  assert.equal(glideMoving(true, true, true), true);    // the axis still easing
  assert.equal(glideMoving(false, true, false), true);  // before the filtered pressures exist, the eased copy is drawn
  assert.equal(glideMoving(false, false, false), false);
  const charts = src('charts.js');
  assert.match(charts, /const moving = glideMoving\(!!Fraw\.Pf, mP, mA\)/);
  // (It draws the filtered pressures: if that ever changed, the glide would have to follow the eased copy again.)
  assert.match(charts, /reading\(n, F\.Pf \|\| F\.P\)/);
});

test('the comparison line shows the same deltas and is rebuilt only when one changes', () => {
  const fmt = (v, d) => v.toFixed(d);
  const a = { hvpg: 10, liverPerfPct: 80, shuntFraction: 0.1 }, b = { hvpg: 12.34, liverPerfPct: 70.2, shuntFraction: 0.25 };
  assert.deepEqual(compareRows(a, b, true, true, fmt), [['HVPG', '+2.3 mmHg'], ['Liver flow', '-10 pp'], ['Shunting', '+15 pp']]);
  assert.deepEqual(compareRows(a, b, false, true, fmt).map((r) => r[0]), ['Liver flow', 'Shunting']);
  assert.deepEqual(compareRows(a, b, true, false, fmt).map((r) => r[0]), ['HVPG']);
  assert.match(src('dock.js'), /if \(comparison\._sig !== sig\)/);
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
  assert.match(src('stage.js'), /keys\.some\(\(k\) => k !== 'frame' && k !== 'params'\)\) watch\.touch\(\)/);
});

test('the framing, the labels\' card boxes and the credit\'s poll go by the watch', () => {
  const stage = src('stage.js');
  assert.match(stage, /if \(home && now - homeCheck > 500 && watch\.due\(\)\)/);
  assert.match(stage, /if \(home && !wasHome\) watch\.touch\(\)/);
  assert.match(stage, /performance\.now\(\) - blockersAt > 100 && watch\.due\(\)/);
  assert.match(stage, /for \(const g of \[gBackdrop, gOrgans, gAscites\]\) watch\.addGroup\(g\)/);
  const credit = src('credit.js');
  assert.match(credit, /if \(watch\.due\(\) \|\| k !== polled/);
  // Every obstacle the credit measures, and every piece the framing and the labels keep clear of, is watched.
  const { OBSTACLES } = { OBSTACLES: credit.match(/export const OBSTACLES = '([^']+)'/)[1] };
  const bases = OBSTACLES.split(',').map((s) => s.trim().split(/[\s:]/)[0].split('.').filter(Boolean)[0]);
  for (const b of bases) assert.ok(PLACED.includes('.' + b), `${b} is not watched`);
  for (const s of ['[data-safe]', '.stage-blocker', '.pz-shade', '#zoomPill']) assert.ok(PLACED.includes(s), s);
});

test('the composite allocates no uniform arrays per frame', () => {
  const gl = src('veins-gl.js'), body = gl.slice(gl.indexOf('    composite(look, blood = {}, full = false, part = 0) {'), gl.indexOf('    /** Whether organ outlines can be drawn here'));
  assert.ok(body.length > 1000);
  assert.ok(!/new Float32Array\(\[/.test(body) && !/new Float32Array\(\d+\)/.test(body), 'a fresh Float32Array in the composite');
  assert.match(body, /SCR\.be\.fill\(0\)/);
});

test('an outline change redraws the outline layer alone, a glow change its glow layer alone', () => {
  const gl = src('veins-gl.js');
  // (External review, 21 Oct: one outline's opacity redrew all three layers.)
  assert.match(gl, /for \(const d of lines\.draws\) sigs\[d\.warm \? 2 : d\.soft \? 1 : 0\]\.push\(/);
  assert.match(gl, /if \(fresh \|\| sig !== lineSigs\[i\]\) \{ lineSigs\[i\] = sig; lineVers\[i\]\+\+; \}/);
  assert.match(gl, /vk = lineVers\[0\] \+ at;/);
  assert.match(gl, /if \(lineVers\[1\] \+ at !== glowKey\)/);
  assert.match(gl, /if \(lineVers\[2\] \+ at !== warmKey\)/);
  assert.doesNotMatch(gl, /lineVer\b/);
});
