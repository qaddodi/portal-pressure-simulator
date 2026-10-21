// No stray dots in the circuit: a station's marker (dot, label, Δ ring) shows only while a vessel is drawn at it, and the dot
// really fades when it must (the stylesheet's "show every circuit dot" rule used to win over the one that hides it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGES, NODES } from '../src/engine/topology.js';
import { HIDDEN_EDGES, HIDDEN_NODES, NEEDS_C3 } from '../src/ui/anatomy.js';
import { nodeEnds, nodeDrawn, drawnAt, leadEnd } from '../src/ui/circuit-nodes.js';

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

// The cascade for `<circle class="node-dot circuit-only off">` inside the circuit (svg.circuit): the opacity that wins.
function circuitDotOpacity(css, classes) {
  const el = new Set(classes), anc = new Set(['circuit']);
  let best = null, order = 0;
  for (const [, sel, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    order++;
    const m = /(?:^|;)\s*opacity:\s*([\d.]+)/.exec(body);
    if (!m) continue;
    for (const one of sel.split(',')) {
      const parts = one.trim().split(/\s+/);
      if (!parts.every((p) => /^(\.[\w-]+)+$/.test(p)) || parts.length > 2) continue;
      const own = parts.at(-1).split('.').filter(Boolean), up = parts.length === 2 ? parts[0].split('.').filter(Boolean) : [];
      if (!own.every((c) => el.has(c)) || !up.every((c) => anc.has(c))) continue;
      const spec = own.length + up.length;
      if (!best || spec > best.spec || (spec === best.spec && order > best.order)) best = { spec, order, v: Number(m[1]) };
    }
  }
  return best?.v;
}

test('in the circuit a dot marked off is invisible, and one that is not shows (the cascade, not just a rule that exists)', () => {
  const css = read('styles/app.css');
  assert.equal(circuitDotOpacity(css, ['node-dot', 'circuit-only', 'off']), 0, 'a hidden dot fades out in the circuit view');
  assert.equal(circuitDotOpacity(css, ['node-dot', 'circuit-only']), 1, 'a shown one is fully there');
});

test('the stage keeps no dot of a station without a drawn vessel: starts off, follows nodeDrawn, no Δ ring over one', () => {
  const src = read('src/ui/stage.js');
  assert.match(src, /class: 'node-dot circuit-only off'/);
  assert.match(src, /nodeEls\[n\.id\] = \{ c, off: true \};/);
  assert.match(src, /const NODE_ENDS = nodeEnds\(ALL_EDGES, \(e\) => E\[e\.id\]\);/);
  assert.match(src, /const nodeVisible = \(id\) => [^;]*nodeDrawn\(NODE_ENDS\[id\]\);/);
  assert.match(src, /const ne = nodeEls\[n\.id\], off = !nodeVisible\(n\.id\);/);
  assert.match(src, /\|\| !NODE_POS\[n\.id\] \|\| !nodeVisible\(n\.id\)\) continue;/);
});
