// The Gut to heart chart's `spans` option (Mohammad, 12 Nov 2026: "we should probably be able to add EUS-PPG to the chart too ... keep it an option for other
// slides; usually PPG and HVPG is default"). A slide names the brackets it draws; none named, it draws HVPG and PPG as before. The third bracket and pill
// (EUS-PPG, the left portal vein to the left hepatic vein) stand narrowest-first with the others, clear of each other, the line and its numbers.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADIENTS } from '../src/ui/decks/gradients.js';
import { runSteps, deckStates } from './deck-states.js';
import { SPANS, NO_SPANS, spansOf, profileOf, profileGeo, numberSides, placePills, placeBrackets, bracketBox, BR_PAD, pillSize } from '../src/ui/tool-profile.js';

const tw = (t, wt) => t.length * (wt >= 700 ? 7.4 : 6.8);

test('spansOf: none named is HVPG and PPG; any subset comes back in the chart\'s order, the same list each time', () => {
  assert.equal(spansOf(undefined), SPANS);
  assert.equal(spansOf([]), NO_SPANS, 'an empty list is no bracket at all: the raw pressures');
  assert.equal(spansOf(['nonsense']), SPANS);
  assert.deepEqual(SPANS.map(([k]) => k), ['hvpg', 'ppg']);
  const three = spansOf(['ppg', 'hvpg', 'eus']);
  assert.deepEqual(three.map(([k]) => k), ['hvpg', 'eus', 'ppg']);
  assert.equal(spansOf(['hvpg', 'eus', 'ppg']), three, 'one list for one set, so a chart can tell a changed set by identity');
  assert.deepEqual(spansOf(['eus']).map(([k]) => k), ['eus']);
});

test('the gradients deck draws all three brackets on every profile slide, the other decks keep two', () => {
  for (const s of GRADIENTS.slides) if (s.tool?.kind === 'profile') assert.deepEqual(spansOf(s.tool.spans).map(([k]) => k), s.id === 'where' ? [] : ['hvpg', 'eus', 'ppg'], s.id);   // (the opening slide draws none: Mohammad, 13 Nov 2026)
});

test('three brackets in the plot (or the band at its foot) keep apart, and each pill has its own place, at the sizes the chart is drawn at', async () => {
  const states = await deckStates(GRADIENTS), spans = spansOf(['hvpg', 'eus', 'ppg']);
  const hl = profileOf((await runSteps([{ preset: 'healthy' }]))[0]);
  for (const [w, h, f] of [[560, 300, 13], [420, 260, 12], [340, 250, 12]]) {
    GRADIENTS.slides.forEach((s, i) => {
      if (s.tool?.kind !== 'profile') return;
      const goal = profileOf(states[i]);
      assert.ok(Number.isFinite(goal.eus), `${s.id}: the fingerprint carries an EUS-PPG`);
      goal.top = Math.max(...goal.v) * 1.15;
      const g = profileGeo(w, h, f, tw, true, spans), sides = numberSides(g, tw, goal), pills = placePills(g, tw, goal, hl, null, sides);
      assert.equal(g.spans, spans);
      const brk = placeBrackets(g, tw, goal, hl, null, sides, null, pills || []);
      const where = brk ? brk : [0, 1, 2].map((r) => profileGeo(w, h, f, tw, false, spans).brY(r));
      assert.equal(where.length, 3, `${s.id} ${w}x${h}`);
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
        const A = bracketBox(g, a, where[a]), B = bracketBox(g, b, where[b]);
        const gap = Math.max(B[0] - A[1], A[0] - B[1], B[2] - A[3], A[2] - B[3]);
        assert.ok(gap >= BR_PAD - 1e-6, `${s.id} ${w}x${h}: brackets ${a} and ${b} keep apart (${gap.toFixed(1)})`);
      }
      if (pills) assert.equal(pills.length, 3, `${s.id}: a pill for each`);
    });
  }
  assert.equal(pillSize(profileGeo(420, 260, 12, tw, true, spans), tw).w.length, 3);
});

test('without the option the chart is the two-bracket chart it was', () => {
  const g = profileGeo(420, 260, 12, tw, true);
  assert.equal(g.spans, SPANS);
  assert.equal(pillSize(g, tw).w.length, 2);
});

test('a ladder with no bracket keeps no band for them and every height is a number', () => {
  const G = profileGeo(400, 260, 12, tw, false, NO_SPANS), H = profileGeo(400, 260, 12, tw, false, SPANS);
  assert.equal(G.Z, G.B, 'no band at the plot\'s foot');
  assert.ok(H.Z < H.B, 'the two-bracket ladder keeps its band');
  for (const k of ['T', 'B', 'Z', 'need']) assert.ok(Number.isFinite(G[k]), k);
  assert.ok(G.need < H.need, 'the chart takes less room without them');
});
