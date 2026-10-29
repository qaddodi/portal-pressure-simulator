// A slide's camera, framed by name (cam-frame.js, presenter.js camBox): cam: { on: [names], near? } and a list of regions, opt-in
// beside the older forms (a region, a raw box, 'fit', a lobule or sinusoid view), which frame exactly as before.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGES, NODES } from '../src/engine/topology.js';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { isCamOn, unionBox, regionBox, growBox, camNames, camProblems } from '../src/ui/cam-frame.js';
import { camOn } from '../src/ui/presenter.js';
import { scaleViews } from '../src/ui/scale-switch.js';

const EDGE_IDS = new Set(EDGES.map((e) => e.id));

test('a region, a raw box and a list of regions frame as boxes; the by-name form frames what its names fill', () => {
  assert.deepEqual(regionBox('portal', REGIONS), REGIONS.portal);
  assert.deepEqual(regionBox([1, 2, 3, 4], REGIONS), [1, 2, 3, 4], 'a raw box is the box');
  assert.equal(regionBox('nowhere', REGIONS), null, 'the presenter falls back to the route for a region the plate lacks');
  const [a, b] = [REGIONS.portal, REGIONS.spleen];
  assert.deepEqual(regionBox(['portal', 'spleen'], REGIONS), [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], 'two regions: their union');
  assert.deepEqual(regionBox(['portal', 'nowhere'], REGIONS), REGIONS.portal, 'a region the plate lacks is left out of the union');
  assert.equal(regionBox({ on: ['PV_TRUNK'] }, REGIONS), null, 'the by-name form has no region of its own');
  assert.equal(isCamOn({ on: ['spleen'] }), true);
  for (const c of ['portal', [1, 2, 3, 4], ['portal', 'spleen'], 'fit', 'lobule:triad', null, undefined]) assert.equal(isCamOn(c), false, JSON.stringify(c));
  assert.equal(unionBox([]), null);
});

test('growing a box takes in what the slide points at with the 8 % room the camera has always left, and a floor for a lone point', () => {
  const r = [100, 100, 200, 200], f = [150, 150, 450, 250];
  // (the older camBox, written out: its box grown by 8 % of the target's larger side)
  const m = 0.08 * 300, old = [Math.min(r[0], f[0] - m), Math.min(r[1], f[1] - m), Math.max(r[2], f[2] + m), Math.max(r[3], f[3] + m)];
  assert.deepEqual(growBox(r, f), old, 'the older framing is unchanged');
  assert.equal(growBox(r, null), r, 'nothing to take in: the same box');
  assert.deepEqual(growBox(null, [500, 400, 500, 400], 30), [470, 370, 530, 430], 'a lone station gets a box of its own, 30 units each way');
  assert.deepEqual(growBox(null, [0, 0, 1000, 10], 30), [-80, -80, 1080, 90], 'a long vessel gets the 8 % when that is more');
});

test('names resolve as the glow resolves them: a term target, an organ, a station, a named set, else a vessel', () => {
  const o = camOn(['PV_TRUNK', 'spleen', 'varix', 'CONF', 'AO', '@hepatic-veins']);
  assert.deepEqual(o.organs, ['spleen']);
  // varix → C1a, C1b; CONF is the portal vein's station and frames its vessel, not a point; the set brings the three hepatic veins
  assert.deepEqual(o.edges, ['PV_TRUNK', 'C1a', 'C1b', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC']);
  assert.equal(o.points.length, 1, 'AO has no term target: it frames where the station stands');
  assert.deepEqual(o.unknown, []);
  assert.deepEqual(camOn(['liver', 'liver', 'C5', 'C5']), { organs: ['liver'], edges: ['C5'], points: [], unknown: [] }, 'a name twice counts once');
  assert.deepEqual(camOn(['@collaterals']).edges, ['C1a', 'C1b', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']);
  // A vessel is only known when the caller has the list; a made-up name is reported then, and framed as nothing otherwise.
  assert.deepEqual(camNames(['PV_TRUNK', 'PV_TRUNKK'], { targets: {}, organs: new Set(), nodes: {}, edges: EDGE_IDS }).unknown, ['PV_TRUNKK']);
  assert.deepEqual(camNames([7, 'spleen'], { targets: {}, organs: new Set(['spleen']), nodes: {} }).unknown, ['7']);
  // (the resolution order holds only while no id is both a vessel and a station)
  const clash = NODES.map((n) => n.id).filter((id) => EDGE_IDS.has(id));
  assert.deepEqual(clash, [], 'an id names a vessel or a station, never both');
});

test('a camera that cannot frame is reported, each form checked', () => {
  const ok = ['fit', 'portal', 'lobule:triad', 'sinusoid', [380, 30, 900, 690], ['portal', 'spleen'], { on: ['PV_TRUNK'] }, { on: ['spleen', '@portal'], near: 'portal' }];
  for (const c of ok) assert.deepEqual(camProblems(c, REGIONS), [], JSON.stringify(c));
  assert.deepEqual(camProblems(undefined, REGIONS), [], 'no camera is no problem here: the slide takes the fit');
  for (const [c, re] of [['nowhere', /no region nowhere/], [[5, 5, 1, 9], /x0 < x1/], [['portal', 'nowhere'], /no region nowhere/], [[], /holds region names/],
    [{ on: [] }, /at least one name/], [{ on: ['spleen'], near: 'nowhere' }, /near: no region/], [{ on: ['spleen'], size: 2 }, /unknown field size/], [{ near: 'portal' }, /region, a box/], [42, /region, a box/]])
    assert.ok(camProblems(c, REGIONS).some((p) => re.test(p)), JSON.stringify(c));
});

// The names a camera by name uses must be ones the camera knows: a typo would frame the route and nobody would be told.
const NAMES_OK = (on, where) => {
  const { unknown, organs, edges, points } = camOn(on);
  assert.deepEqual(unknown, [], `${where}: a name the camera knows nothing of`);
  for (const e of edges) assert.ok(EDGE_IDS.has(e), `${where}: ${e} is no vessel`);
  assert.ok(organs.length + edges.length + points.length > 0, `${where}: the names frame something`);
};

test('every built-in slide\'s camera, and every anatomy view\'s, is a form the camera frames; any names it uses are known', () => {
  for (const d of DECKS) for (const s of d.slides) {
    const cams = [[s.cam, `${d.id}/${s.id}`], ...Object.entries(scaleViews(s)).filter(([k]) => k === 'anatomy').map(([, v]) => [v?.cam, `${d.id}/${s.id} (anatomy view)`])];
    for (const [cam, where] of cams) {
      assert.deepEqual(camProblems(cam, REGIONS), [], where);
      if (isCamOn(cam)) NAMES_OK(cam.on, where);
    }
  }
});

test('the examples in the authoring guides name things the camera knows', () => {
  const guides = ['deck-authoring-guide.md', 'deck-authoring-quick-guide.md'].map((f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8'));
  let n = 0;
  for (const g of guides) for (const m of g.matchAll(/cam: \{ on: \[([^\]]*)\](?:, near: '(\w+)')? \}/g)) {
    const on = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (!on.length) continue;   // (the form written out in a heading, cam: { on: [...] })
    n++;
    NAMES_OK(on, m[0]);
    if (m[2]) assert.ok(REGIONS[m[2]], `${m[0]}: no region ${m[2]}`);
  }
  assert.ok(n >= 2, 'the guides show the form (the full guide and the quick guide)');
});

test('the presenter frames by name through camBox, and the older forms through the same sums', () => {
  const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const body = /function camBox\(cam, s\) \{([\s\S]*?)\n {2}\}\n/.exec(pz)?.[1];
  assert.ok(body, 'camBox is where the framing is worked out');
  assert.match(body, /regionBox\(isCamOn\(cam\) \? cam\.near : cam, REGIONS\)/, 'a region, a box or a list of regions, or the region the names grow from');
  assert.match(body, /growBox\(r, unionBox\(\[stage\.focusBox\(n\), pts\]\.filter\(Boolean\)\), 30\)/, 'the names, as drawn now, with the stations where they stand');
  assert.match(body, /growBox\(r \|\| REGIONS\.route, f\)/, 'the slide\'s outlines and soft glows still grow it, as before, and a region the plate lacks is still the route');
  // Every place that frames a slide goes through camBox, so a camera by name works at the slide, in a flip of scales and on the rise out of the lobule.
  assert.equal((pz.match(/camBox\(/g) || []).length, 4, 'the glide, the rise, the refit and the definition');
  assert.doesNotMatch(pz, /Array\.isArray\(cam\) \? cam : REGIONS/, 'no second reading of a camera that skips the sums');
});
