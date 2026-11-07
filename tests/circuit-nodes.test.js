import { stageSource } from './stage-src.js';
// No stray dots in the circuit: a station's marker (dot, label, Δ ring) shows only while a vessel is drawn at it, and the dot
// really fades when it must (the stylesheet's "show every circuit dot" rule used to win over the one that hides it). And no reading
// sits on a dot: every visible dot, with a reading beside it or not, has a box the readings keep out of.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGES, NODES } from '../src/engine/topology.js';
import { HIDDEN_EDGES, HIDDEN_NODES, NEEDS_C3, NODE_POS } from '../src/ui/anatomy.js';
import { nodeEnds, nodeDrawn, drawnAt, leadEnd, dotRadius, dotBox, bareDots } from '../src/ui/circuit-nodes.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ALL = EDGES.filter((e) => e.kind !== 'wedge' && !HIDDEN_EDGES.has(e.id));
// The stations the circuit gives a dot (stage.js builds one for each of these).
const STATIONS = NODES.filter((n) => n.kind !== 'wedge' && !HIDDEN_NODES.has(n.id)).map((n) => n.id);
// What the stage draws for a given set of open collaterals and shunts (stage.js edgeVisible, no findings hidden).
const records = (open = []) => Object.fromEntries(ALL.map((e) => [e.id, {
  vis: e.kind === 'collateral' || e.kind === 'shunt' ? open.includes(e.id) : NEEDS_C3.has(e.id) ? open.includes('C3') : true,
  reveal: null,
}]));
const shownIn = (rec) => { const ends = nodeEnds(ALL, (e) => rec[e.id]); return STATIONS.filter((id) => nodeDrawn(ends[id])); };

test('in health the four stations with nothing drawn at them show no dot (the stray dots of the circuit)', () => {
  const shown = shownIn(records());
  assert.deepEqual(STATIONS.filter((id) => !shown.includes(id)).sort(), ['EPI', 'GV', 'STO', 'VAR']);
  // Every other station has a vessel drawn at it.
  for (const n of ['INT', 'COL', 'SPL', 'SMV', 'IMV', 'SV', 'LGV', 'CONF', 'LPV', 'RHV', 'IVCI', 'RA', 'AZY', 'ILI', 'KID_L', 'LRV']) assert.ok(shown.includes(n), n);
});

test('a station gets its dot with the vessels that open at it, and loses it with the last one', () => {
  assert.ok(shownIn(records(['C1a', 'C1b'])).includes('VAR'), 'the esophageal varices: their feeder and drain are drawn');
  assert.ok(!shownIn(records(['C1a', 'C1b'])).includes('GV'), 'the fundal varices stay without one until their own vessels are drawn');
  assert.ok(shownIn(records(['C2'])).includes('GV'));
  assert.ok(shownIn(records(['C3'])).includes('EPI'), 'the paraumbilical vein opens the epigastric veins and the dot with them');
  assert.ok(shownIn(records(['TIPS'])).includes('RPV') && !shownIn(records(['TIPS'])).includes('EPI'));
});

test('a vessel that draws on or retracts is drawn at its upstream end only; the far end waits for it', () => {
  const rec = records(['C2']);
  rec.C2.reveal = { dir: 1, out: false };
  const ends = nodeEnds(ALL, (e) => rec[e.id]);
  assert.equal(leadEnd(rec.C2.reveal), 'from');
  assert.equal(drawnAt(rec.C2, 'from'), true, 'at SV the line starts at once');
  assert.equal(drawnAt(rec.C2, 'to'), false, 'GV has no dot until the line has arrived');
  assert.equal(nodeDrawn(ends.GV), false);
  rec.C2.reveal = null;
  assert.equal(nodeDrawn(ends.GV), true, 'arrived');
  // Retracting (the same stroke run backward): the far end's dot goes as the line withdraws, the upstream end's stays to the last.
  rec.C2.reveal = { dir: 1, out: true };
  assert.equal(nodeDrawn(ends.GV), false);
  assert.equal(drawnAt(rec.C2, 'from'), true);
  // A vessel whose flow runs the other way (the path's end first) draws on from its `to` end.
  rec.C2.reveal = { dir: -1, out: false };
  assert.equal(leadEnd(rec.C2.reveal), 'to');
  assert.equal(nodeDrawn(ends.GV), true);
  assert.equal(drawnAt(rec.C2, 'from'), false);
  // A vessel hidden is drawn at neither end, a missing record at none.
  rec.C2.vis = false;
  assert.equal(drawnAt(rec.C2, 'to'), false);
  assert.equal(drawnAt(undefined, 'to'), false);
  assert.equal(nodeDrawn(undefined), false);
});

// A station's dot is drawn by the GPU (2 Nov 2026, no element): off until a vessel is drawn at it, then eased in and out by its own share
// (stepMap), times the circuit's own fade (MAP.a), so a dot marked off shows nothing and one that is on shows whole.
test('in the circuit a dot marked off is invisible, and one that is not shows (its alpha on the GPU, not a rule that exists)', () => {
  const src = stageSource();
  assert.match(src, /\.map\(\(n\) => \(\{ id: n\.id, r: dotRadius\(n\.kind\), on: false, u: 0 \}\)\)/, 'each dot starts off');
  assert.match(src, /const a = MAP\.a \* easeMove\(nodeDots\[i\]\.u\), f = n0 \+ i \* ND_PER;\s*if \(a <= 0\) continue;/, 'off (u 0) or no circuit (MAP.a 0): not drawn');
  assert.match(src, /count: 3 \* ND_SEG, col: null, alpha: 0, tri: true \}, \{ first: 0, count: 2 \* \(ND_SEG \+ 1\), col: null, alpha: 0 \}[\s\S]*sa\.first = f; sa\.col = nd\.fill; sa\.alpha = a; sb\.first = f \+ 3 \* ND_SEG; sb\.col = nd\.ring; sb\.alpha = a;/, 'the disc and its ring, one alpha');
  assert.match(src, /V\[o\+\+\] = -1; V\[o\+\+\] = 0\.8;/, 'a ring 1.6 wide, as the SVG stroke was');
});

test('the stage keeps no dot of a station without a drawn vessel: starts off, follows nodeDrawn, no Δ ring over one', () => {
  const src = stageSource();
  assert.match(src, /const hasDot = new Set\(nodeDots\.map\(\(d\) => d\.id\)\);/);
  assert.match(src, /const NODE_ENDS = nodeEnds\(ALL_EDGES, \(e\) => E\[e\.id\]\);/);
  assert.match(src, /const (?:live\.)?nodeVisible = \(id\) => [^;]*nodeDrawn\(NODE_ENDS\[id\]\);/);
  assert.match(src, /const on = (?:live\.)?nodeVisible\(d\.id\);\s*if \(d\.on !== on\) \{ d\.on = on; (?:live\.)?mapWake = true; \}/);
  assert.match(src, /\|\| !NODE_POS\[n\.id\] \|\| !(?:live\.)?(?:live\.)?nodeVisible\(n\.id\)\) continue;/);
});

const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const SCALES = [0.3, 0.45, 0.8, 1, 1.4, 2.5];

test('a dot\'s keep-clear box holds the dot as drawn, and a reading beside it stands 4 px or more from its edge', () => {
  for (const kind of ['bed', 'portal', 'liver', 'hepvein', 'vein', 'heart']) for (const sc of SCALES) {
    const R = (dotRadius(kind) + 0.8) * sc, b = dotBox(100, 100, kind, sc, 7, 5);
    for (const [side, v] of Object.entries({ left: 100 - b.x0, right: b.x1 - 100, up: 100 - b.y0, down: b.y1 - 100 })) assert.ok(v >= R + 2 - 1e-9, `${kind} at ${sc}: ${side} clears the dot's edge by 2 px`);
    // A station's reading box: 3 px round its words sideways, 2 px up and down (stage.js nodeItem padX, padY); it may touch the dot's box.
    assert.ok(b.x1 - 100 + 3 - R >= 4 - 1e-9 && b.y1 - 100 + 2 - R >= 4 - 1e-9, `${kind} at ${sc}: the words stand 4 px off the dot`);
  }
  assert.deepEqual(dotBox(0, 0, 'vein', 0.3, 7, 5), { x0: -7, y0: -5, x1: 7, y1: 5 }, 'never smaller than a station\'s ring');
});

test('every visible dot without a reading gets a box (the colon bed under the spleen\'s reading, the portal bifurcation)', () => {
  const rec = records(), ends = nodeEnds(ALL, (e) => rec[e.id]);
  const sc = 0.8, circ = (id) => NODE_POS[id][1].map((v) => v * sc);
  // The circuit zoomed out, readings at the key level: only the major stations (priority 5 and up) have one.
  const labelled = new Set(['INT', 'SPL', 'SMV', 'SV', 'LGV', 'CONF', 'RPV', 'LPV', 'SIN_R', 'RHV', 'LHV', 'IVCI', 'IVCS', 'RA', 'AZY']);
  const stations = NODES.filter((n) => STATIONS.includes(n.id));
  const bare = bareDots(stations, { labelled, shown: (id) => nodeDrawn(ends[id]), at: circ, scale: sc, minX: 7, minY: 5 });
  const ids = bare.map((d) => d.id);
  assert.ok(ids.includes('COL') && ids.includes('PVH') && ids.includes('IMV'), 'stations with no reading beside them');
  for (const id of ['STO', 'GV', 'VAR', 'EPI']) assert.ok(!ids.includes(id), `${id}: no vessel drawn, so no dot, so no box`);
  for (const id of labelled) assert.ok(!ids.includes(id), `${id} keeps the ring its reading sets`);
  // The case that showed: the spleen's reading set below its station (S, 7 px off) lands on the colon bed's dot; its box now rules the spot out.
  const [sx, sy] = circ('SPL'), col = bare.find((d) => d.id === 'COL');
  const reading = { x0: sx - 52, x1: sx + 52, y0: sy + 7, y1: sy + 7 + 44 };
  assert.ok(hits(reading, col.box), 'the spot the spleen\'s reading took is over the colon bed\'s dot');
  assert.deepEqual([col.x, col.y], circ('COL'));
});

test('the stage gives every dot without a reading its box, and draws each dot at the size the box assumes', () => {
  const src = stageSource();
  assert.match(src, /\{ id: n\.id, r: dotRadius\(n\.kind\), on: false, u: 0 \}/);
  assert.match(src, /const labelled = new Set\(nodes\.map\(\(it\) => it\.node\)\);/);
  assert.match(src, /bareDots\(NODES\.filter\(\(n\) => hasDot\.has\(n\.id\)\), \{ labelled, shown: (?:live\.)?(?:live\.)?nodeVisible, at: \(id\) => worldToLocal\(\.\.\.nodePos\(id, t\)\), scale: (?:live\.)?(?:live\.)?CTM\.sc, minX: ringRX, minY: ringR \}\)/);
  assert.match(src, /placed\.push\(\{ \.\.\.d\.box, dot: true \}\); ringXY\.push\(\[d\.x, d\.y, ringRX\]\);/);
  assert.match(src, /V\[o\+\+\] = 1; V\[o\+\+\] = 0\.8;/, 'the outline width the box allows for (half of 1.6 either side of the radius)');
});
