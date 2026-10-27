// The relation charts of Treating the cause, Decompensation and recompensation, One patient ten years and Preventing the next
// variceal bleed (26 Oct): each chart's words are pinned to the model's own numbers (the line, the dots, the ring), so a retuned model
// shows up here instead of on a slide that quietly says the opposite. (Ascites draws its own course after the tap, in relation-ascites-chart.test.js; it
// stays in the shape check below.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { curveSteps, curveSeries, curveAt, dotsOf, ringAt, walksOf } from '../src/ui/tool-curve.js';
import { deckStates } from './deck-states.js';
import { ASCITES } from '../src/ui/decks/ascites.js';
import { CAUSE_TREATED } from '../src/ui/decks/cause-treated.js';
import { RECOMPENSATION } from '../src/ui/decks/recompensation.js';
import { TEN_YEARS } from '../src/ui/decks/ten-years.js';
import { NEXT_BLEED } from '../src/ui/decks/next-bleed.js';

async function seq(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}

// A deck's relation slide, its states, its curve (worked out once per distinct sweep: ten years and the next bleed share one) and its dots.
const swept = new Map();
async function chart(d, over = {}) {
  const i = d.slides.findIndex((s) => s.id === 'relation'), slide = d.slides[i], t = { ...slide.tool, ...over }, st = await deckStates(d);
  const key = JSON.stringify(curveSteps(t));
  if (!swept.has(key)) swept.set(key, seq(curveSteps(t), null).then((states) => curveSeries(t, states)));
  const ser = await swept.get(key);
  const at = (id) => st[d.slides.findIndex((s) => s.id === id)];
  const dot = (id) => { const f = at(id), xk = t.x; return { x: f[xk], f, on: curveAt(ser, f[xk]) }; };
  return { d, i, slide, t, st, ser, fp: st[i], at, dot, ring: ringAt(t, {}, st[i]) };
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);

test('a dot\'s own walk name joins that name\'s dots in order, one line for each patient', () => {
  const t = { x: 'lsm', dots: [{ slide: 'a', walk: 'one' }, { slide: 'b', walk: 'two' }, { slide: 'c', walk: 'one' }, { slide: 'd', walk: 'two' }, { slide: 'e' }, { slide: 'f', walk: 'three' }] };
  assert.deepEqual(walksOf(t), [[0, 2], [1, 3]], 'a name with one dot, and a dot with no name, draw nothing');
  assert.deepEqual(walksOf({ x: 'lsm', walk: true, dots: [{ slide: 'a' }, { slide: 'b' }, { slide: 'c' }] }), [[0, 1, 2]], 'walk: true is every dot, in order');
  assert.deepEqual(walksOf({ x: 'lsm', dots: [{ slide: 'a' }, { slide: 'b' }] }), []);
  assert.deepEqual(walksOf({ dots: [{ slide: 'a', walk: 'one' }, { slide: 'b', walk: 'one' }] }), [], 'dots need a reading on x');
});

test('every relation slide sits just before its summary, names slides that exist, and the walk dots keep to one line of the chart', () => {
  for (const d of [ASCITES, CAUSE_TREATED, RECOMPENSATION, TEN_YEARS, NEXT_BLEED]) {
    const i = d.slides.findIndex((s) => s.id === 'relation');
    assert.equal(d.slides[i + 1]?.id, 'summary', `${d.id}: the relation chart comes just before the summary`);
    assert.equal(d.slides[i].kicker, 'Summary', d.id);
    const ids = new Set(d.slides.map((s) => s.id));
    for (const x of dotsOf(d.slides[i].tool)) assert.ok(ids.has(x.slide), `${d.id}: no slide ${x.slide}`);
  }
});

test('Treating the cause: both hepatitis C patients sit on the line; the first ends under 10 on both cut-offs, the second does not', async () => {
  const c = await chart(CAUSE_TREATED), [a0, a1, a2, b0, b1] = ['before', 'year1', 'year2', 'high', 'high2'].map(c.dot);
  for (const p of [a0, a1, a2, b0, b1]) near(p.f.hvpg, p.on[0], 0.4, `${p.x.toFixed(1)} kPa sits on the HVPG line`);
  assert.ok(a0.f.hvpg > 10 && a2.f.hvpg < 10 && a2.f.lsm < 10, 'cure takes the first patient under an HVPG of 10 and a stiffness of 10 kPa');
  assert.ok(b1.f.hvpg >= 10 && b1.f.lsm >= 10, `the second stays at ${b1.f.hvpg.toFixed(1)} mmHg and ${b1.f.lsm.toFixed(1)} kPa`);
  assert.ok(b0.f.hvpg > a0.f.hvpg + 2, 'she starts well above him');
  assert.ok(a0.x > a1.x && a1.x > a2.x && b0.x > b1.x, 'every walk goes down the line');
  near(c.ring.x, b1.f.lsm, 0.05, 'the ring is the second patient two years on');
  near(c.fp.hvpg, b1.f.hvpg, 0.05, 'and so are the words\' numbers');
  assert.deepEqual(walksOf(c.t), [[0, 1, 2], [3, 4]]);
});

test('Recompensation: ascites takes him up the line, a year without alcohol brings him back to where he began, still at 10 or more', async () => {
  const c = await chart(RECOMPENSATION), start = c.dot('csph'), top = c.dot('ascites'), back = c.dot('cure');
  for (const p of [start, top, back]) near(p.f.hvpg, p.on[0], 0.5, `${p.x.toFixed(1)} kPa sits on the HVPG line`);
  assert.ok(top.f.hvpg > start.f.hvpg + 4 && top.x > 25, 'the ascites takes him past 25 kPa and 4 mmHg up');
  near(back.f.hvpg, start.f.hvpg, 0.6, 'the cure brings the HVPG back to the start');
  assert.ok(c.fp.hvpg >= 10 && c.fp.hvpg < 12 && c.fp.lsm > 15, `off diuretics he is at ${c.fp.hvpg.toFixed(1)} mmHg, ${c.fp.lsm.toFixed(1)} kPa`);
  near(c.ring.x, c.fp.lsm, 1e-9, 'the ring is the slide before\'s state');
});

test('Ten years: carvedilol and the TIPS move him along the varix line, bands take the varix below it without lowering the HVPG', async () => {
  const c = await chart(TEN_YEARS), d365 = c.dot('d365'), carv = c.dot('carv'), asc = c.dot('ascites'), bands = c.dot('bands'), tips = c.dot('tips'), rebleed = c.at('rebleed');
  near(d365.f.varix, d365.on[0], 0.3, 'year 1 sits on the line');
  assert.ok(carv.x < d365.x - 2.5 && carv.f.varix < d365.f.varix - 1.5, 'carvedilol lowers the HVPG and the varix with it');
  assert.ok(carv.f.varix > carv.on[0] - 1, 'and stays near the line');
  assert.ok(bands.f.varix < bands.on[0] - 2, `bands: ${bands.f.varix.toFixed(2)} mm under the line's ${bands.on[0].toFixed(2)}`);
  assert.ok(bands.x >= asc.x - 0.1, 'and the HVPG is not lowered');
  assert.ok(tips.x < 7 && rebleed.hvpg > tips.x + 7, `the TIPS takes the HVPG from ${rebleed.hvpg.toFixed(1)} to ${tips.x.toFixed(1)}`);
  near(tips.f.varix, 2, 0.15, 'the varix rests at its floor');
  near(c.ring.x, c.fp.hvpg, 1e-9, 'the ring is the slide before\'s state');
});

test('Next bleed: bands drop the varix below the line with the HVPG up, ten months on it is back on the line, carvedilol moves him left', async () => {
  const c = await chart(NEXT_BLEED), after = c.dot('after'), bands = c.dot('bands'), slough = c.dot('slough'), nsbb = c.dot('nsbb'), both = c.dot('both'), held = c.dot('held');
  assert.ok(bands.f.varix < after.f.varix - 1.5 && bands.x >= after.x, 'bands: the varix falls, the HVPG does not');
  assert.ok(bands.f.varix < bands.on[0] - 3, `below the line: ${bands.f.varix.toFixed(2)} against ${bands.on[0].toFixed(2)} mm`);
  near(slough.f.varix, slough.on[0], 0.3, 'ten months on, bands alone are back on the line');
  assert.ok(nsbb.x < after.x - 2, `carvedilol takes the HVPG from ${after.x.toFixed(1)} to ${nsbb.x.toFixed(1)}`);
  assert.ok(both.f.varix < both.on[0] - 2 && held.f.varix < slough.f.varix - 1, 'with both, the varix stays smaller');
  near(c.ring.x, held.x, 1e-9, 'the ring is both together ten months on');
  assert.deepEqual(walksOf(c.t), [[0, 1, 2], [3, 4, 5]]);
});
