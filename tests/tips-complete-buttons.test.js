// The TIPS deck's parameter buttons (external review of 57cd1ca7, 17 Nov 2026). A button is a whole configuration: pressing "Short, tapered" after
// "Long, 4 cm" must show a short tapered waist, never a long tapered one. The live model patches its parameters with the button's, so a button that
// names only the one field it changes leaves the last button's fields behind. Every ordered pair of a slide's buttons is pressed here, on the engine,
// and what the stent then does must equal what the second button does alone. The words follow the button too, and the PPG is never the drop across the stent.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge, sanitizeParams } from '../src/engine/scenario.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { TIPS_COMPLETE as D } from '../src/ui/decks/tips-complete.js';
import { abChoice } from '../src/ui/presenter-words.js';
import { toggleLabels } from '../src/ui/variant-toggle.js';

// The live model's patch (presenter.js merge): objects merge, everything else replaces.
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge({ ...(a[k] || {}) }, v) : v; return a; };
// What a slide shows: the patient of the nearest preset before it, with the slides' params laid on in order, then the buttons pressed.
const baseOf = (i) => { let j = i; while (j > 0 && !D.slides[j].preset) j--; let p = {}; for (let k = j; k <= i; k++) p = merge(p, structuredClone(D.slides[k].params || {})); return { preset: D.slides[j].preset, params: p }; };
const STENT = ['tipsFlow', 'tipsDp', 'tipsVel', 'tipsLumen', 'tipsLocalPct', 'ppg'];
const shows = (preset, params) => {
  const e = new Engine(); e.loadPreset(preset);
  e.setParams(sanitizeParams(deepMerge(e.params, params))); e.settle(3);
  const f = fingerprintOf(computeMetrics(e));
  return Object.fromEntries(STENT.map((k) => [k, Number.isFinite(f[k]) ? +f[k].toFixed(6) : f[k]]));
};
const paramRows = D.slides.map((s, i) => ({ s, i })).filter(({ s }) => s.compare?.every((o) => abChoice(s.compare, s.compare.indexOf(o)).kind === 'params'));

test('there are slides with parameter buttons to hold (the waist, the reduction, the jet)', () => {
  const ids = paramRows.map(({ s }) => s.id);
  for (const id of ['waist', 'reduce', 'jet']) assert.ok(ids.includes(id), `${id} has parameter buttons`);
});

test('every ordered pair of a slide\'s parameter buttons ends where the second button alone does', () => {
  for (const { s, i } of paramRows) {
    const { preset, params } = baseOf(i), n = s.compare.length, patch = (k) => abChoice(s.compare, k).patch;
    const alone = [...Array(n).keys()].map((k) => shows(preset, merge(structuredClone(params), structuredClone(patch(k)))));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const after = shows(preset, merge(merge(structuredClone(params), structuredClone(patch(a))), structuredClone(patch(b))));
      assert.deepEqual(after, alone[b], `${s.id}: "${s.compare[b].label}" pressed after "${s.compare[a].label}" shows something else than it does alone`);
    }
  }
});

test('the waist buttons really differ (short, long and tapered are three experiments, not one)', () => {
  const s = D.slides.find((x) => x.id === 'waist'), { preset, params } = baseOf(D.slides.indexOf(s));
  const r = s.compare.map((o, k) => shows(preset, merge(structuredClone(params), structuredClone(abChoice(s.compare, k).patch))));
  assert.equal(new Set(r.map((x) => x.tipsDp)).size, 3, JSON.stringify(r.map((x) => x.tipsDp)));
  assert.ok(r[1].tipsDp > r[0].tipsDp, 'a long waist drops more across the device than a short one');
});

test('a row where any button has words gives every button its words (its own, or the slide\'s through own)', () => {
  for (const { s } of paramRows) {
    if (!s.compare.some((o) => o.title || o.line)) continue;
    assert.ok(s.compare.some((o) => o.own), `${s.id}: no button carries the slide's own words`);
    for (const o of s.compare) if (!o.own) assert.ok(o.line, `${s.id} "${o.label}": the row speaks, so this button needs its line`);
  }
});

test('the waist and reduction rows are captioned Geometry, the jet\'s Stenosis site', () => {
  const cap = (id) => toggleLabels(D.slides.find((x) => x.id === id).compare).caption;
  assert.equal(cap('waist'), 'Geometry'); assert.equal(cap('reduce'), 'Geometry'); assert.equal(cap('jet'), 'Stenosis site');
});

test('the reduction is a focal waist inside the original conduit, not a smaller conduit', () => {
  const s = D.slides.find((x) => x.id === 'reduce'), tubes = (o) => o.params?.tips ?? {};
  assert.ok(!s.params.tips || s.params.tips.d === 10, 'the slide keeps the 10 mm conduit');
  for (const o of s.compare) assert.ok(!tubes(o).d || tubes(o).d === 10, `"${o.label}" changes the conduit`);
  assert.ok(s.params.stentGeom?.TIPS?.red > 0, 'the slide\'s reduction is a waist (stentGeom red)');
  assert.equal(s.tool.kind, 'stent', 'the longitudinal stent card is on the slide');
});

// Every string of the deck.
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };

test('the PPG is the portal vein minus the IVC pressure, never the drop across the stent', () => {
  for (const t of strings(D)) {
    assert.ok(!/\bPPG\b[^.;]{0,30}\bacross the (stent|device)\b/i.test(t), `"${t.slice(0, 120)}"`);
    assert.ok(!/\b(gradient|pressure)\b[^.;]{0,12}\bacross the stent\b[^.;]{0,30}\bPPG\b/i.test(t), `"${t.slice(0, 120)}"`);
    assert.ok(!/\bthe PPG across\b/i.test(t), `"${t.slice(0, 120)}"`);
  }
});

test('a tube is not said to move flow in proportion to pressure, and no check cites Table 3 for a target', () => {
  for (const t of strings(D)) {
    assert.ok(!/in proportion to the pressure/i.test(t), t.slice(0, 120));
    assert.ok(!/<\s?12 mmHg[^.]*Table 3|Table 3[^.]*<\s?12 mmHg/i.test(t), `Baveno VIII Table 3 holds no 12 mmHg target: "${t.slice(0, 120)}"`);
  }
});
