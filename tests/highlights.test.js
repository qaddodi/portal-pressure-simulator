// Deck visuals, package A (figure highlights: src/ui/ext-highlights.js, src/ui/highlight-math.js): the new organs have
// shapes to outline, the named sets name real vessels, the spot list sorts vessels from organs, the ripple picks the same
// vessels Patients' Δ glow would, the vein system gives every vein one class, and no built-in deck uses any of it.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGES, NODES, PORTAL_TERRITORY } from '../src/engine/topology.js';
import { ORGANS } from '../src/ui/anatomy.js';
import { DECKS, REGIONS, withOverview } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { EXT, expandIds } from '../src/ui/slide-ext.js';
import A from '../src/ui/ext-highlights.js';
import { SETS, ORGAN_TARGETS, NEW_ORGANS, spotOf, liftEnd, bandRing, dashRings, normalShown, NORMAL_ON, NORMAL_OFF, rippleList, RIPPLE_MAX, systemOf, SYSTEM_COLOR, stateIndex, sinceWords } from '../src/ui/highlight-math.js';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';

const VESSELS = new Set(EDGES.map((e) => e.id));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the new organs are drawn, and each target points at one of them in a colour the tokens define', () => {
  const shapes = new Map(ORGANS.map((o) => [o.id, o]));
  const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  for (const id of NEW_ORGANS) assert.ok(shapes.get(id)?.d, `${id} has a path`);
  for (const [k, t] of Object.entries(ORGAN_TARGETS)) {
    assert.ok(NEW_ORGANS.includes(t.organ), `${k}: ${t.organ}`);
    assert.match(tokens, new RegExp(`${t.tone}:`), `${k}: ${t.tone} is a token`);
    assert.ok(new RegExp(`\\b(?:${t.words})\\b`, 'i').test(`the ${k === 'kidney' ? 'left kidney' : k}`), `${k}: its words name it`);
  }
  assert.deepEqual(A.targets, ORGAN_TARGETS); assert.deepEqual(A.organs, NEW_ORGANS);
  for (const id of NEW_ORGANS) assert.ok(EXT.organs.includes(id), `${id} registered`);
});

test('every named set names real vessels, and a set expands the same way in a glow, a spot and a mark', () => {
  for (const [name, ids] of Object.entries(SETS)) {
    assert.ok(ids.length, name);
    for (const id of ids) assert.ok(VESSELS.has(id), `@${name}: ${id}`);
    assert.deepEqual(expandIds([`@${name}`]), ids, `@${name} in a glow or a mark`);
    assert.deepEqual(spotOf(expandIds([`@${name}`]), (id) => VESSELS.has(id)).edges, [...new Set(ids)], `@${name} in a spot`);
  }
  assert.deepEqual(EXT.sets, SETS);
});

test('a spot list sorts its vessels from its organs, each organ in its own colour', () => {
  const sp = spotOf(['PV_TRUNK', 'spleen', 'bowel', 'stomach', 'esophagus', 'kidney', 'kidney-l', 'liver', 'nonsense', 'PV_TRUNK'], (id) => VESSELS.has(id));
  assert.deepEqual(sp.edges, ['PV_TRUNK']);
  assert.deepEqual(sp.organs, [{ id: 'spleen', tone: 'sv' }, { id: 'bowel', tone: '--text-2' }, { id: 'kidney-l', tone: '--text-2' }, { id: 'kidney-l', tone: '--text-2' }, { id: 'liver', tone: 'wedge' }]);
  assert.deepEqual(spotOf(null, () => true), { edges: [], organs: [] });
});

test('a tube is outlined along both its edges, closed round its ends', () => {
  const line = [[0, 0], [50, 0], [100, 0]], r = bandRing(line, 10);
  assert.deepEqual(r[0], r.at(-1), 'closed');
  const ys = r.map((p) => p[1]), xs = r.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...ys) - 10) < 1e-9 && Math.abs(Math.min(...ys) + 10) < 1e-9, 'its two edges at half the width');
  assert.ok(Math.max(...xs) <= 110 + 1e-9 && Math.max(...xs) > 108 && Math.min(...xs) < -8, 'the caps round the two ends');
  for (const p of r) assert.ok(Math.min(Math.abs(Math.abs(p[1]) - 10), Math.abs(Math.hypot(p[0] - (p[0] > 50 ? 100 : 0), p[1]) - 10)) < 1e-6, `${p} on the outline`);
  assert.deepEqual(bandRing([[0, 0]], 10), []);
});

test('the stomach and the esophagus are not highlighted (Mohammad, 19 Oct)', () => {
  for (const id of ['stomach', 'esophagus']) {
    assert.equal(ORGAN_TARGETS[id], undefined, `${id}: no target`);
    assert.ok(!NEW_ORGANS.includes(id), `${id}: not outlined`);
  }
});

test('the normal spleen\'s outline is dashed: runs of on, gaps of off, along the ring', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const d = dashRings([sq], 3, 2);
  assert.equal(d.length, 8, 'a 40-unit ring: eight 3-unit dashes');
  const len = (r) => r.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - r[i][0], p[1] - r[i][1]), 0);
  for (const r of d) assert.ok(Math.abs(len(r) - 3) < 1e-9, `dash ${JSON.stringify(r)} is 3 long`);
  assert.deepEqual(d[0], [[0, 0], [3, 0]]);
  assert.deepEqual(d[1], [[5, 0], [8, 0]]);
  assert.deepEqual(d[2], [[10, 0], [10, 3]], 'a dash that starts on a corner');
  assert.deepEqual(d[4], [[10, 10], [7, 10]]);
  assert.deepEqual(dashRings([[[0, 0], [10, 0]]], 4, 2), [[[0, 0], [4, 0]], [[6, 0], [10, 0]]]);
  assert.equal(dashRings([[[0, 0], [10, 0]]], 4, 2)[1].length, 2, 'the last dash is cut where the line ends');
  assert.deepEqual(dashRings([sq], 0, 2), []);
});

test('the normal spleen\'s outline shows once the spleen is clearly enlarged, without blinking at the threshold', () => {
  assert.equal(normalShown(1, false), false);
  assert.equal(normalShown(NORMAL_ON, false), true);
  assert.equal(normalShown((NORMAL_ON + NORMAL_OFF) / 2, true), true, 'kept between the two');
  assert.equal(normalShown((NORMAL_ON + NORMAL_OFF) / 2, false), false);
  assert.equal(normalShown(NORMAL_OFF - 0.01, true), false);
});

test('the ripple picks the vessels whose pressure moved 2 mmHg or more, most first, at most 16, as Patients\' Δ glow', () => {
  const e = new Engine();
  e.loadPreset('cirr-decomp'); e.settle();
  const before = Float32Array.from(e.P);
  e.setParams(deepMerge(e.params, { tips: { on: true } })); e.settle();
  const after = Float32Array.from(e.P), list = rippleList(EDGES, NI, before, after);
  assert.ok(list.length > 3 && list.length <= RIPPLE_MAX, `${list.length} vessels`);
  for (let i = 1; i < list.length; i++) assert.ok(Math.abs(list[i - 1][1]) >= Math.abs(list[i][1]), 'most first');
  for (const [id, d] of list) {
    const x = EDGES.find((y) => y.id === id), want = (after[NI[x.from]] + after[NI[x.to]] - before[NI[x.from]] - before[NI[x.to]]) / 2;
    assert.ok(Math.abs(d - want) < 1e-6 && Math.abs(d) >= 2 && x.kind !== 'wedge', id);
  }
  assert.ok(list.some(([id, d]) => id === 'PV_TRUNK' && d < 0), 'TIPS lowers the portal vein');
  assert.deepEqual(rippleList(EDGES, NI, before, before), [], 'no change, no ripple');
  assert.deepEqual(rippleList(EDGES, NI, null, after), []);
  // (The stage reads the same rule: Patients' 2 mmHg floor and 16 vessels.)
  assert.match(STAGE, /glows\.slice\(0, 16\)/); assert.match(STAGE, /Math\.abs\(d\) >= 2\) glows\.push/);
});

test('the vein system gives every vein one of three classes, the same on every patient', () => {
  const seen = new Set();
  for (const e of EDGES) {
    const c = systemOf(e, PORTAL_TERRITORY);
    assert.ok(SYSTEM_COLOR[c], `${e.id}: ${c}`);
    seen.add(c);
  }
  assert.deepEqual([...seen].sort(), ['ivc', 'pv', 'var']);
  assert.equal(systemOf(EDGES.find((e) => e.id === 'PV_TRUNK'), PORTAL_TERRITORY), 'pv');
  assert.equal(systemOf(EDGES.find((e) => e.id === 'IVCS_RA'), PORTAL_TERRITORY), 'ivc');
  assert.equal(systemOf(EDGES.find((e) => e.id === 'C1a'), PORTAL_TERRITORY), 'var');
  assert.equal(systemOf(EDGES.find((e) => e.id === 'TIPS'), PORTAL_TERRITORY), 'var');
  assert.match(STAGE, /mode === 'system'\) \{ c1 = c2 = SYSTEM_COLOR\[systemOf\(e, PORTAL_TERRITORY\)\]/);
});

test('"the slide before" is the state the presenter shows for it, and the key names what a slide compares with', () => {
  const slides = [{ preset: 'healthy' }, { title: 'b' }, { params: { x: 1 } }, { title: 'd' }, { days: 30 }];
  assert.deepEqual(stateIndex(slides), [0, 0, 2, 2, 4]);
  // (As the presenter's own stateOf, which counts the overview slide first on a built-in deck.)
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /const changes = \(s\) => !!\(s\.preset \|\| s\.params \|\| s\.action \|\| s\.days\);/);
  assert.match(pres, /slides = d\.mine \? d\.slides : withOverview\(d\)\.slides/);
  for (const d of DECKS.slice(0, 3)) assert.equal(stateIndex(withOverview(d).slides).length, withOverview(d).slides.length);
  assert.equal(sinceWords({}), 'change vs last slide');
  assert.equal(sinceWords({ since: 'pre' }), 'change vs earlier');
  assert.equal(sinceWords({ since: 'pre', sinceLabel: 'pre-TIPS' }), 'change vs pre-TIPS');
  assert.equal(sinceWords({ lapse: {} }), 'change over these days');
  const [name, bar, lo, hi] = EXT.lenses.since({ sinceLabel: 'the bleed' });
  assert.equal(name, 'change vs the bleed'); assert.equal(typeof bar, 'function'); assert.deepEqual([lo, hi], ['Lower', 'Higher']);
  assert.equal(EXT.lenses.system[0], 'vein system');
});

test('no built-in deck uses a package A field, so every talk looks as before', () => {
  for (const d of DECKS) for (const s of d.slides) {
    for (const k of ['spot', 'ripple', 'normalOutline', 'lapseGlow', 'since', 'sinceLabel']) if (!adopted(d, s, k)) assert.equal(s[k], undefined, `${d.id}/${s.id}: ${k}`);
    assert.ok(!['system', 'since'].includes(s.lens) || adopted(d, s, `lens:${s.lens}`), `${d.id}/${s.id}: lens ${s.lens}`);
    for (const g of s.glow || []) assert.ok(!String(typeof g === 'string' ? g : g.id).startsWith('@'), `${d.id}/${s.id}: glow set`);
  }
});

test('the figure hook does nothing on a slide that sets none of the fields', () => {
  const calls = [];
  const stage = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const deck = { id: 't', mine: true, slides: [{ title: 'a', preset: 'healthy' }, { title: 'b', params: { x: 1 } }] };
  const ctx = (i) => ({ slide: deck.slides[i], index: i, deck, stage, fp: { at: { P: [i] } }, state: null, fpOf: () => null });
  A.figure[0].show(ctx(0)); A.figure[0].show(ctx(1));
  assert.deepEqual(calls, []);
  A.figure[0].update({}, deck.slides[1]);
  assert.deepEqual(calls, []);
  A.figure[0].clear();
  assert.deepEqual(calls.map((c) => c[0]), ['spotlight', 'normalOutline', 'changeRef'], 'clear lifts what a slide may have set');
});

test('a slide\'s fields reach the figure: spotlight, outline, ripple going forward only, and the reference for "since"', () => {
  const calls = [];
  const stage = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const deck = { id: 't2', mine: true, slides: [
    { id: 'a', title: 'a', preset: 'cirrhosis' },
    { id: 'b', title: 'b', params: { tips: { on: true } }, ripple: true, spot: ['@shunts', 'liver'], normalOutline: ['spleen', 'liver'] },
    { id: 'c', title: 'c', lens: 'since', since: 'a' },
    { id: 'd', title: 'd', days: 30, lapse: {}, ripple: true }] };
  const fps = [{ at: { P: [1] } }, { at: { P: [2] } }, { at: { P: [3] } }, { at: { P: [4] } }];
  const ctx = (i) => ({ slide: deck.slides[i], index: i, deck, stage, fp: fps[i], state: i === 3 ? { start: { fp: { at: { P: [9] } } } } : null, fpOf: (id) => fps[deck.slides.findIndex((s) => s.id === id)] });
  const h = A.figure[0];
  h.show(ctx(0)); h.show(ctx(1));
  assert.deepEqual(calls.find((c) => c[0] === 'spotlight')[1], { edges: SETS.shunts, organs: [{ id: 'liver', tone: 'wedge' }] });
  assert.deepEqual(calls.find((c) => c[0] === 'normalOutline')[1], ['spleen']);
  assert.deepEqual(calls.find((c) => c[0] === 'ripple').slice(1), [[1], [2]], 'from the slide before to this one');
  calls.length = 0; h.clear(); calls.length = 0;
  h.show(ctx(2));
  assert.deepEqual(calls, [['changeRef', [1]]], 'since: the named slide');
  calls.length = 0;
  h.show(ctx(1));
  assert.ok(!calls.some((c) => c[0] === 'ripple'), 'no ripple stepping back');
  calls.length = 0;
  h.show(ctx(3));
  assert.ok(!calls.some((c) => c[0] === 'ripple'), 'a time-lapse waits for its end');
  h.update({ at: { P: [5] } });
  assert.ok(!calls.some((c) => c[0] === 'ripple'));
  h.update(fps[3]);
  assert.deepEqual(calls.filter((c) => c[0] === 'ripple').map((c) => c.slice(1)), [[[9], [4]]], 'once it lands, from its own start');
  h.update(fps[3]);
  assert.equal(calls.filter((c) => c[0] === 'ripple').length, 1, 'once');
});

test('a lapse glow eases the named organs in when the time-lapse starts and stays; a lapse without one touches nothing', () => {
  const calls = [];
  const stage = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const deck = { id: 't3', mine: true, slides: [{ id: 'a', title: 'a', preset: 'healthy' }, { id: 'b', title: 'b', days: 8, lapse: { seconds: 6 }, lapseGlow: ['bowel', 'nothing'] }, { id: 'c', title: 'c', days: 8, lapse: {} }] };
  const ctx = (i) => ({ slide: deck.slides[i], index: i, deck, stage, fp: { at: { P: [i] } }, state: null, fpOf: () => null });
  const h = A.figure[0];
  h.show(ctx(1));
  assert.deepEqual(calls, [], 'nothing while the slide is only shown: the glow waits for the lapse (or the presenter\'s call for a slide shown after it)');
  h.lapse(deck.slides[1]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'glowOrgans');
  assert.deepEqual(calls[0][1].map((o) => [o.id, o.glow, o.tone, o.fade > 800]), [['bowel', true, '--origin-smv', true]], 'the small bowel only, glowing, slowly');
  assert.equal(calls[0][1][0].warm, true, 'its loops light up too, not only its outline');
  h.update(deck.slides[1].fp);
  h.lapse(deck.slides[1]);
  assert.ok(calls.every((c) => c[0] === 'glowOrgans' && c[1]), 'the glow is never asked off by the hook: it goes when the slide leaves');
  calls.length = 0;
  h.show(ctx(2)); h.lapse(deck.slides[2]); h.lapse(null);
  assert.deepEqual(calls, [], 'a lapse without lapseGlow leaves the figure alone');
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /figureHooks\('lapse', s\); {3}\/\/ \(a deck visuals package's glow from the days' start/);
  assert.match(pres, /else if \(s\.lapse\) figureHooks\('lapse', s\);/);
  assert.match(STAGE, /glowOrgans\(list\) \{ pinOrgans\(null, list \|\| \[\]\); \}/);
});

test('the Circulation meal slide glows the small bowel from the start of its time-lapse, framed so the whole pile and its glow are in view', () => {
  const circ = DECKS.find((d) => d.id === 'circulation'), s = circ.slides.find((x) => x.id === 'flow');
  assert.deepEqual(s.lapseGlow, ['bowel']);
  assert.ok(s.lapse && adopted(circ, s, 'lapseGlow'));
  // The pile as drawn (its outline ring is the whole pile as one), and the outline glow's reach (stage.js HEART_GLOW) around it.
  const ring = ORGANS.find((o) => o.id === 'bowel').d, pts = (ring.match(/-?[\d.]+[ ,]-?[\d.]+/g) || []).map((t) => t.split(/[ ,]/).map(Number));
  const [x0, y0, x1, y1] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  const reach = +/HEART_GLOW = \{ reach: (\d+)/.exec(STAGE)[1], [bx0, by0, bx1, by1] = REGIONS[s.cam];
  assert.ok(pts.length > 100 && x1 - x0 > 500, 'the real extent was read');
  const [px0, py0, px1, py1] = REGIONS.portal;
  assert.ok(bx0 <= px0 && by0 <= py0 && bx1 >= px1 && by1 >= py1, 'the portal system (confluence, trunk, splenic vein, SMV) stays in frame');
  assert.ok(bx0 <= x0 - reach && by0 <= y0 && bx1 >= x1 + reach && by1 >= y1 + reach, `the box ${REGIONS[s.cam]} holds the pile ${[x0, y0, x1, y1]} and ${reach} units of glow`);
});

test('Circulation 4/13 numbers each bed\'s vessels as a group, in a frame that holds every vessel and its leader', () => {
  const circ = DECKS.find((d) => d.id === 'circulation'), s = circ.slides.find((x) => x.id === 'series');
  assert.deepEqual(s.glow, [['V_INT', 'V_SPL', 'V_IMV'], ['SIN_RR', 'SIN_LL']]);
  assert.ok(adopted(circ, s, 'glow:group'));
  const [x0, y0, x1, y1] = s.cam;
  // Each vessel's middle (and the solid stretch of one that fades out of its organ) lies inside the camera's box.
  const paths = { V_INT: 'M756 800 C 752 758 700 716 690 660', V_SPL: 'M1034 360 C 1010 385 988 420 962 448', V_IMV: 'M932 690 C 925 620 905 560 880 505' };
  for (const [id, d] of Object.entries(paths)) {
    assert.equal(ORGANS.length > 0 && !!EDGES.find((e) => e.id === id), true);
    const n = d.match(/-?[\d.]+/g).map(Number), at = (t) => { const [ax, ay, bx, by, cx, cy, dx, dy] = n.slice(-8), u = 1 - t; return [u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t ** 3 * dx, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t ** 3 * dy]; };
    const [x, y] = at(id === 'V_SPL' ? 0.83 : 0.5);
    assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${id} (${x.toFixed(0)}, ${y.toFixed(0)}) is in ${s.cam}`);
  }
  assert.match(STAGE, /arcMid\(geo\[x\]\.cur, TIP_FADE\[x\] > 0\.5 \? \(1 \+ TIP_FADE\[x\]\) \/ 2 : 0\.5\)/, 'a faded vein is aimed at on its solid stretch');
});

test('a lapse glow goes when the slide leaves, and is drawn from the pile\'s own live loops', () => {
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  // The leaving slide's pins go first (the glow's own fade carries it out), and every pin not asked for again goes off.
  assert.match(pres, /stage\.setGlow\(null\); stage\.pinOrgans\(null\);\s*\n\s*figureHooks\('clear'\)/);
  assert.match(STAGE, /if \(o\.kind === 'pin' && !want\.has\(o\.id\)\) o\.on = false;/);
  assert.match(STAGE, /if \(o\.kind === 'warm' && !warm\.has\(o\.id\)\) o\.on = false;/);
  // The warm layer reads the loops from the drawing itself (the pile's deep-tone tubes), not a copy of their path.
  assert.match(STAGE, /querySelectorAll\('\.ob-deep'\)/);
  // The glow lies on the organs, under the vessels, after the plate's dimming (one strength with the plate up or down), and is
  // read from the path's own text once (no measuring along it on a slide's start), and only where WebGL can draw it.
  const GL = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(GL, /if \(warmOn == 1\) pl = over\(texelFetch\(warmL, ip, 0\), pl\);/);
  assert.ok(GL.indexOf('plateSat), pl.a) * plateAlpha') < GL.indexOf('warmOn == 1) pl'), 'after the dimming');
  assert.match(STAGE, /soft: true, warm: true/);
  assert.match(STAGE, /glLines && o\.warm/);
  assert.match(STAGE, /const lines = warmLines\(d\) \|\| olRingsRaw\(/);
  // Only the edges glow (Mohammad, 20 Oct: "just the outline glows"): a strip along each side of every tube, starting on the tube's
  // edge (its radius out from the centre line, read from the drawing's own pieces) and easing outward, none over the tube itself.
  assert.match(STAGE, /for \(const side of \[-1, 1\]\)/);
  assert.match(STAGE, /ex, ey, -ty, tx, 0, w, ex, ey, -ty, tx, side, w/);
  assert.match(STAGE, /querySelectorAll\('\.ob-edge'\)/);
  assert.ok(!/ -ty, tx, -1, WARM\.reach/.test(STAGE), 'no centred strip: the tubes\' insides are not filled');
  // The glow's reach stays under a tube's own half width (about 12.5), so a tube's middle is clear of its neighbours' glow.
  assert.ok(+/const WARM = \{ reach: (\d+)/.exec(STAGE)[1] < 12, 'reach under the tube half width');
  // Strips never stack (MAX), the colon is left clear, a tight bend's inner side is held short, and the group's transform is
  // read without consolidate() (it would rewrite the attribute and change the outline keys at every build).
  const GLSRC = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(GLSRC, /if \(warm\) \{ gl\.blendEquation\(gl\.MAX\)/);
  assert.match(GLSRC, /if \(warm\) gl\.blendEquation\(gl\.FUNC_ADD\)/);
  assert.match(STAGE, /underColon\(ex, ey\)/);
  assert.match(STAGE, /\(R\[i\] - rad\) \* 0\.85/);
  assert.ok(!/function warmRings[\s\S]{0,120}consolidate/.test(STAGE) && !/function olRingsRaw[\s\S]{0,120}consolidate/.test(STAGE), 'the loop outlines read the transform without consolidate()');
  // A redrawn pile is noticed: the cached tubes and their radius are dropped when the old ones leave the page, and the radius is
  // read again when the bed's stroke width changes; it comes from the pieces' own stroke-width attribute (.ob-edge).
  assert.match(STAGE, /t\.some\(\(el\) => !el\.isConnected\)/);
  assert.match(STAGE, /c\.sw !== sw/);
  assert.match(STAGE, /Math\.min\(WARM\.reach, 0\.8 \* rad\)/, 'the reach follows the measured tube radius');
  assert.match(STAGE, /warmEdges\.get\(id\)\?\.some\(\(el\) => !el\.isConnected\)/, 'a redrawn piece is noticed too');
  // The colon cut is a grid look-up (filled once by scanlines), not a ring test per point; each run's reach eases off at both ends.
  assert.match(STAGE, /grid\.bits\[j \* grid\.w \+ i\] === 1/);
  assert.ok(!/inRing/.test(STAGE), 'no per-point ring test');
  assert.match(STAGE, /Math\.min\(k, len - 1 - k\) \/ WARM\.taper/);
  assert.ok(!/baseVal\.consolidate\(\)/.test(STAGE), 'no transform is consolidated: the keys stay the same across builds');
  assert.match(STAGE, /el\.getAttribute\('stroke-width'\)/);
  assert.ok(readFileSync(new URL('../src/ui/organ-art.js', import.meta.url), 'utf8').includes('ob-edge\\" d=\\"') && /class=\\"ob-edge\\" d=\\"[^"]*\\" stroke-width=\\"[\d.]+\\"/.test(readFileSync(new URL('../src/ui/organ-art.js', import.meta.url), 'utf8')), 'the pieces carry a stroke-width attribute');
  assert.ok(readFileSync(new URL('../src/ui/organ-art.js', import.meta.url), 'utf8').includes('class=\\"ob-deep\\"'), 'the pile still draws .ob-deep tubes');
});

// A spotlit vessel (the shunts on the demo deck's spotlight slide) fades out along its course at both ends, into the dimmed
// network or at a free end, and runs on only into another lifted vessel: never a blunt, hard-capped end (Mohammad, 19 Oct).
test('a spotlit vessel fades toward every end that meets no other lifted vessel', () => {
  const dim = { lit: false, ghost: false }, ghost = { lit: false, ghost: true }, lit = { lit: true, ghost: false };
  // Spotlit: fades at a free end, where a dimmed vessel carries on, and beside a dotted collateral.
  assert.equal(liftEnd(true, []), 1);
  assert.equal(liftEnd(true, [dim]), 1);
  assert.equal(liftEnd(true, [ghost]), 1);
  // Into another spotlit or selected vessel it runs on at full, whatever else joins there.
  assert.equal(liftEnd(true, [lit]), 0);
  assert.equal(liftEnd(true, [dim, lit, ghost]), 0);
  // A selected vessel keeps its rule: eases back only where a visible vessel carries on.
  assert.equal(liftEnd(false, []), 0);
  assert.equal(liftEnd(false, [ghost]), 0);
  assert.equal(liftEnd(false, [dim]), 1);
  assert.equal(liftEnd(false, [dim, lit]), 0);
  // The stage asks it for each end of a lifted vessel (written to tube row 12, which the vessel shader fades over a third of
  // the vessel, at most 60), with no early return that kept a spotlit vessel whole to its ends.
  const fn = STAGE.match(/function selEnd\(id, n\) \{[\s\S]*?\n {2}\}/)?.[0] || '';
  assert.match(fn, /return liftEnd\(spot\.ids\.has\(id\) && spotOn\(\), joins\)/);
  assert.doesNotMatch(fn, /spotOn\(\)\) return 0/);
  assert.match(STAGE, /\[easeInOut\(sa\), selEnd\(id, x\.e\.from\), selEnd\(id, x\.e\.to\), 0\]/);
});
