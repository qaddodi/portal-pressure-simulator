// The pressure ladder, shared by every deck that draws it (iPad play-test F28, 17 Nov 2026, "Resuscitating an acute variceal bleed" slide 16):
// the lines' names ("Healthy", "Before TIPS") stand on a chip of the card's colour beside their lines, the HVPG and PPG brackets stand BR_GAP apart,
// and once a stent is in no bracket or pill says HVPG: after a TIPS or a DIPS the reading is the PPG.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPANS, NO_SPANS, spansOf, spansStented, hasStent, pillReadings, profileGeo, bracketBox, BR_GAP, BR_PAD } from '../src/ui/tool-profile.js';
import { PROFILE } from '../src/ui/chart-looks/profile.js';

// (A patient's readings as the chart reads them: its stations' pressures and its gradients; a stent in has its flow a number, as the engine's fingerprint gives it.)
const BASE = { at: { P: new Array(200).fill(14) }, int: 24, pv: 22, whvp: 18, cv: 12, fhvp: 8, ivc: 6, ra: 4, hvpg: 10, ppg: 16, eus: 0, tipsFlow: null, dipsFlow: null };
const fpOf = (patch) => ({ ...BASE, ...patch });
const tw = (t) => String(t).length * 6.5;

test('a patient with a stent has no HVPG bracket or pill; one without keeps both', () => {
  const none = fpOf({}), tips = fpOf({ tipsFlow: 1.2, ppg: 8, hvpg: 6 }), dips = fpOf({ dipsFlow: 1.0 });
  assert.ok(!hasStent(none) && hasStent(tips) && hasStent(dips));
  assert.deepEqual(pillReadings(none).map((p) => p.k), ['hvpg', 'ppg']);
  assert.deepEqual(pillReadings(tips).map((p) => p.k), ['ppg']);
  assert.deepEqual(pillReadings(dips).map((p) => p.k), ['ppg']);
});

test('the stented brackets are the slide\'s less the HVPG, the same list each time, and none stays none', () => {
  assert.deepEqual(spansStented(SPANS).map(([k]) => k), ['ppg']);
  assert.equal(spansStented(SPANS), spansStented(SPANS));
  assert.deepEqual(spansStented(spansOf(['hvpg', 'eus', 'ppg'])).map(([k]) => k), ['eus', 'ppg']);
  assert.equal(spansStented(NO_SPANS), NO_SPANS);
  const eusPpg = spansOf(['eus', 'ppg']);
  assert.equal(spansStented(eusPpg), eusPpg);
});

test('the HVPG and PPG brackets stand BR_GAP apart in the band, at every size', () => {
  for (const [w, h, f] of [[330, 300, 12], [480, 360, 13], [640, 420, 15], [760, 440, 16]]) {
    const G = profileGeo(w, h, f, tw, false);
    const a = bracketBox(G, 0, G.brY(0)), b = bracketBox(G, 1, G.brY(1));
    const gap = Math.max(b[0] - a[1], a[0] - b[1], b[2] - a[3], a[2] - b[3]);
    assert.ok(gap >= BR_GAP, `${w}x${h}: ${gap.toFixed(1)} px between the brackets`);
  }
  assert.ok(BR_GAP >= 2 * BR_PAD);
});

test('the lines\' names stand on a chip of the card\'s colour (a look for it, and the chart builds and moves it with the name)', () => {
  assert.ok(PROFILE['prof.name.chip'], 'the chip has a look');
});
