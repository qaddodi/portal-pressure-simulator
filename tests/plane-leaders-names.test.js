// Plane names and leaders (15 and B22, play-test 16 Nov 2026: "Portal pressure as a circuit" 10/12 had two bare "Meal" names and leaders crossing the R-line names;
// "Lowering portal pressure" 9/13 at 375 px had names merging). Names are unique and say what they are; a leader crosses no word box and no other leader.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { placeNames, segsCross, crosses } from '../src/ui/visual-plane.js';

test('segsCross: crossing segments cross, touching and parallel ones do not', () => {
  assert.ok(segsCross(0, 0, 10, 10, 0, 10, 10, 0));
  assert.ok(!segsCross(0, 0, 10, 0, 0, 5, 10, 5));
  assert.ok(!segsCross(0, 0, 10, 10, 10, 10, 20, 0));
});

test('every plane slide names each point by a name that is its own (no two alike, never a bare "Meal")', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (!Array.isArray(s.of) || s.visual !== 'plane') continue;
    const names = s.of.map((o) => o.short || o.name || o.id), long = s.of.map((o) => o.name || o.id);
    assert.equal(new Set(names).size, names.length, `${d.id}/${s.id}: short names ${names.join(' | ')}`);
    assert.equal(new Set(long).size, long.length, `${d.id}/${s.id}: names ${long.join(' | ')}`);
    for (const nm of names) assert.ok(!/^meal$/i.test(nm), `${d.id}/${s.id}: "${nm}" says nothing of what it is`);
    n++;
  }
  assert.ok(n >= 5, `${n} plane slides`);
});

test('a leader crosses no word box and no other leader, at phone and desktop widths', () => {
  let leads = 0, forced = 0, cases = 0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [W, H] of [[330, 200], [640, 300], [900, 380]]) for (let k = 0; k < 60; k++) {
    const fr = { L: 30, R: W - 10, T: 8, B: H - 24 }, pts = Array.from({ length: 5 + Math.floor(rnd() * 3) }, (_, i) => ({ x: fr.L + 20 + rnd() * (W - 80), y: fr.T + 14 + rnd() * (H - 70), name: ['Healthy', 'Healthy, after a meal', 'Cirrhosis', 'Cirrhosis, after a meal', 'Advanced cirrhosis', 'TIPS', 'Collaterals'][i], short: ['Healthy', 'Healthy + meal', 'Cirrhosis', 'Cirrhosis + meal', 'Advanced', 'TIPS', 'Coll.'][i] }));
    const words = [[W - 70, fr.T + 20, W - 20, fr.T + 36], [fr.L + 40, fr.B - 40, fr.L + 90, fr.B - 24]];
    const res = placeNames(pts, fr, 12, 8, words, [], 0);
    cases++;
    res.forEach((a, i) => {
      if (!a?.lead) return;
      leads++;
      if (a.forced) { forced++; return; }   // (a plot too crowded for the rule: the name is kept, the leader may cross)
      for (const w of words) assert.ok(!crosses(pts[i].x, pts[i].y, a.lead[0], a.lead[1], w), `${W}x${H} #${k}: leader of ${pts[i].name} crosses a word box`);
      res.forEach((b, j) => { if (j > i && b?.lead && !b.forced) assert.ok(!segsCross(pts[i].x, pts[i].y, a.lead[0], a.lead[1], pts[j].x, pts[j].y, b.lead[0], b.lead[1]), `${W}x${H} #${k}: leaders of ${pts[i].name} and ${pts[j].name} cross`); });
    });
  }
  assert.ok(leads > 0, 'the property was exercised: some leaders were drawn');
  assert.ok(forced <= leads * 0.15, `${forced} of ${leads} leaders had to cross (in ${cases} random plots): the rule holds almost always`);
});
