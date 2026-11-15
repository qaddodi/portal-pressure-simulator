// The trials' forest plot and arm bars (src/ui/trial-forest.js) and the Trials tab that shows them (trials-pane.js, dock.js): ratios of different
// kinds are grouped and labelled, never pooled; the scale takes in every interval with a line at 1; trials with no ratio are listed with their
// rates and no marker; every word stays inside the width; and the tab is wired as the other lazily loaded tests are. The trial records with the
// fields trials.js is gaining (ratios, short, km, three arms) are fixtures here.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forestLayout, forestRange, armsLayout, FOREST_SCALE, NOT_POOLED, ratiosOf, ratioText, ratesText, KIND_NAME, NO_RATIO, FAVORS } from '../src/ui/trial-forest.js';
import { measure } from '../src/ui/glyph-measure.js';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { TRIALS } from '../src/ui/trials.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const arms = (a, b, extra) => [{ label: 'Treatment', rate: a, side: 'treat' }, { label: 'Control', rate: b, side: 'control' }, ...(extra ? [extra] : [])];
const T = {
  predesci: { ...TRIALS.predesci, short: 'PREDESCI', ratios: [{ kind: 'HR', est: 0.51, lo: 0.26, hi: 0.97, of: 'decompensation or death' }], km: false },
  attire: { id: 'attire', name: 'ATTIRE', short: 'ATTIRE', endpoint: 'Infection, kidney dysfunction or death', followUp: 'Up to 15 days', arms: arms(29, 30), ratios: [{ kind: 'OR', est: 0.98, lo: 0.71, hi: 1.33, of: 'the composite' }] },
  calibre: { id: 'calibre', name: 'CALIBRE', short: 'CALIBRE', endpoint: 'Variceal bleeding', followUp: '2 years', arms: arms(7, 16), ratios: [{ kind: 'RR', est: 0.5, lo: 0.17, hi: 1.41, of: 'bleeding' }] },
  rifaximin: { ...TRIALS.rifaximin, short: 'Rifaximin, TIPS', ratios: [{ kind: 'OR', est: 0.48, lo: 0.27, hi: 0.87, of: 'overt encephalopathy' }] },
  covered: { ...TRIALS.covered, short: 'Covered TIPS', ratios: [], km: true },
  three: { id: 'three', name: 'Three arms', short: 'Three arms', endpoint: 'Death', arms: arms(20, 30, { label: 'Other', rate: 25, side: 'control' }), ratios: [] },
};
const ALL = Object.values(T);
const W = 460, f = 13;

test('a ratio is drawn only when it has a kind, an estimate and an interval around it; an abstract\'s effect line is read until the field lands', () => {
  assert.deepEqual(ratiosOf(T.predesci).map(ratioText), ['HR 0.51 (0.26–0.97)']);
  assert.deepEqual(ratiosOf(T.covered), [], 'an empty list is taken at its word');
  assert.deepEqual(ratiosOf({ ratios: [{ kind: 'HR', est: 2, lo: 0.5, hi: 1 }, { kind: 'MD', est: 1, lo: 0.5, hi: 2 }] }), []);
  const parsed = ratiosOf({ effect: 'HR for death 0.55 (0.33–0.92)', endpoint: 'Alive at 6 weeks' });
  assert.deepEqual(parsed.map((r) => [r.kind, r.est, r.lo, r.hi, r.of]), [['HR', 0.55, 0.33, 0.92, 'death']]);
  assert.deepEqual(ratiosOf({ effect: 'P = .003' }), []);
  for (const t of Object.values(TRIALS)) for (const r of ratiosOf(t)) assert.ok(r.lo <= r.est && r.est <= r.hi, t.id);
});

test('the scale takes in every interval: 0.1 to 2 holds ATTIRE 0.98 (0.71–1.33) and CALIBRE RR 0.50 (0.17–1.41)', () => {
  assert.deepEqual(forestRange(ALL.flatMap(ratiosOf)), [0.1, 2]);
  assert.deepEqual(forestRange([{ lo: 0.04, hi: 3 }]), [0.02, 4]);
});

test('HR, OR and RR are grouped by kind, in that order, each under its name, and every value carries its kind', () => {
  const L = forestLayout(ALL, W, f, measure);
  const grp = L.texts.filter((s) => s.look === 'forest.grp').map((s) => s.t);
  assert.deepEqual(grp, [KIND_NAME.HR, KIND_NAME.OR, KIND_NAME.RR]);
  const ys = (k) => L.texts.find((s) => s.t === KIND_NAME[k]).y;
  const vals = L.texts.filter((s) => /^forest\.val/.test(s.look) && /\(/.test(s.t));
  assert.equal(vals.length, 4);
  for (const v of vals) {
    const kind = v.t.slice(0, 2);
    assert.match(v.t, /^(HR|OR|RR) \d\.\d\d \(\d\.\d\d–\d\.\d\d\)$/);
    const next = ['HR', 'OR', 'RR'].filter((k) => ys(k) > ys(kind)).map(ys);
    assert.ok(v.y > ys(kind) && (!next.length || v.y < Math.min(...next)), `${v.t} sits in its own group`);
  }
  assert.equal(L.texts.filter((s) => s.look === 'forest.ref').length, 0);
  assert.equal(L.lines.filter((l) => l.look === 'forest.ref').length, 4, 'a short line at 1 through each row\'s interval (TC-V2)');
  const ref = L.lines.find((l) => l.look === 'forest.ref');
  assert.equal(ref.x1, ref.x2);
  for (const s of FAVORS) assert.ok(L.texts.some((t) => t.t === s), s);
  assert.deepEqual(L.texts.filter((s) => s.look === 'forest.tick').map((s) => s.t), ['0.1', '0.25', '0.5', '1', '2']);
});

test('the estimate sits inside its interval, left of the line at 1 when it favors the treatment', () => {
  const L = forestLayout([T.predesci, T.attire], W, f, measure);
  const ref = L.lines.find((l) => l.look === 'forest.ref').x1;
  const cis = L.lines.filter((l) => /^forest\.ci/.test(l.look)), mks = L.rects.filter((r) => /^forest\.mk/.test(r.look));
  assert.equal(cis.length, 2); assert.equal(mks.length, 2);
  cis.forEach((c, i) => { const cx = mks[i].x + mks[i].w / 2; assert.ok(c.x1 <= cx && cx <= c.x2); });
  assert.ok(mks[0].x + mks[0].w / 2 < ref, 'PREDESCI 0.51 is left of 1');
  assert.ok(cis[1].x1 < ref && cis[1].x2 > ref, 'ATTIRE crosses 1');
});

test('trials that fit are in full ink and first in their group; the others quieter', () => {
  const L = forestLayout([T.attire, T.rifaximin], W, f, measure, { highlight: new Set(['rifaximin']) });
  const names = L.texts.filter((s) => /^forest\.nm/.test(s.look));
  assert.deepEqual(names.map((s) => [s.t, s.look]), [['Rifaximin, TIPS', 'forest.nm'], ['ATTIRE', 'forest.nm.dim']]);
  assert.ok(L.lines.some((l) => l.look === 'forest.ci.dim') && L.rects.some((r) => r.look === 'forest.mk.dim'));
});

test('the row picked is marked and its detail line follows the axis; trials with no ratio are listed with their rates and no marker', () => {
  const L = forestLayout(ALL, W, f, measure, { selected: 'predesci', notes: { predesci: 'Fits this patient.' } });
  assert.equal(L.rects.filter((r) => r.look === 'forest.sel').length, 1);
  assert.ok(L.texts.some((s) => s.look === 'forest.dt' && s.t === 'PREDESCI: 16% vs 27%'));
  assert.ok(L.texts.some((s) => s.look === 'forest.dx' && /Fits this patient\./.test(s.t)));
  const k = L.texts.find((s) => s.t === NO_RATIO);
  assert.ok(k);
  const after = L.texts.filter((s) => s.y > k.y);
  assert.ok(after.some((s) => s.t === '93% vs 52%'), 'covered TIPS: its two rates');
  assert.ok(after.some((s) => s.t === '20% vs 30% / 25%'), 'a third arm after a slash');
  assert.ok(L.rects.filter((r) => /^forest\.mk/.test(r.look)).every((r) => r.y < k.y), 'no marker under the no-ratio name');
  assert.deepEqual(L.hits.map((q) => q.id).sort(), Object.keys(T).sort(), 'every trial can be tapped');
});

test('every word stays inside the width, on a phone\'s sheet and the side card', () => {
  for (const w of [320, 360, 460]) {
    const L = forestLayout(ALL, w, f, measure, { selected: 'attire' });
    for (const s of L.texts) {
      const size = /forest\.(nm|dt)$|forest\.nm\.dim/.test(s.look) ? f : f * 0.92, weight = /forest\.(nm|dt)$/.test(s.look) ? 600 : 500;
      const tw = measure(s.t, `${weight} ${size}px Inter`), x0 = s.anchor === 'end' ? s.x - tw : s.anchor === 'middle' ? s.x - tw / 2 : s.x;
      assert.ok(x0 >= -0.5 && x0 + tw <= w + 0.5, `${w}: "${s.t}" (${s.look}) from ${x0.toFixed(1)} to ${(x0 + tw).toFixed(1)}`);
    }
    const [fa, fb] = FAVORS.map((t) => L.texts.find((s) => s.t === t)), ext = (s) => { const tw = measure(s.t, `500 ${f * 0.92}px Inter`); return s.anchor === 'end' ? [s.x - tw, s.x] : [s.x, s.x + tw]; };
    assert.ok(ext(fa)[1] < ext(fb)[0], `${w}: the two sides' names do not meet`);
    for (const l of L.lines) assert.ok(Math.min(l.x1, l.x2) >= 0 && Math.max(l.x1, l.x2) <= w, `${w}: a line inside`);
    assert.ok(L.H > 0 && L.texts.every((s) => s.y <= L.H));
  }
});

test('pure: the same trials at the same size give the same drawing', () => {
  assert.deepEqual(forestLayout(ALL, W, f, measure, { selected: 'calibre' }), forestLayout(ALL, W, f, measure, { selected: 'calibre' }));
  assert.deepEqual(forestLayout([], W, f, measure), { texts: [], rects: [], lines: [], hits: [], H: Math.ceil(f * 0.3) });
});

test('the arms are bars on a 0 to 100% track, the treated arm in the series colour, three arms when the trial had three', () => {
  const L = armsLayout(T.three, 400, 13, measure);
  const bars = L.rects.filter((r) => r.look === 'forest.bar');
  assert.deepEqual(bars.map((b) => b.tone), ['s1', 'text-3', 'text-3']);
  assert.deepEqual(bars.map((b) => Math.round(b.w)), [80, 120, 100]);
  assert.deepEqual(L.rects.filter((r) => r.look === 'forest.track').map((r) => r.w), [400, 400, 400]);
  assert.deepEqual(L.texts.filter((s) => s.look === 'forest.pct').map((s) => s.t), ['20%', '30%', '25%']);
  assert.equal(ratesText(T.predesci), '16% vs 27%');
});

test('each forest look resolves in every theme and palette with no missing token; the host is 13 px on the Tests card', () => {
  const ctx = (o = {}) => withCtx(makeCtx({ host: 'forest', scale: {}, svk: 1 }), { theme: 'light', dark: false, palette: 'navy', ...o });
  const keys = Object.keys(LOOKS).filter((k) => k.startsWith('forest.'));
  assert.ok(keys.length >= 18);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of keys) {
    const p = resolveProps(LOOKS[k], ctx({ theme, palette, dark: theme === 'dark' }), {}, {});
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
  assert.equal(HOSTS.forest({ scale: {} }), 13);
  assert.equal(HOSTS.forest({ scale: { sm: 15 } }), 15);
  // Every look the layouts name is defined.
  const used = new Set();
  for (const L of [forestLayout(ALL, W, f, measure, { selected: 'predesci', highlight: new Set(['predesci']) }), armsLayout(T.three, 300, 13, measure)]) for (const p of [...L.texts, ...L.rects, ...(L.lines || [])]) used.add(p.look);
  for (const k of used) assert.ok(LOOKS[k], `${k} has a look`);
});

test('the Trials tab is the last of the Tests card, loaded after the first paint, and refreshes from the dock\'s frame without a frame of its own', () => {
  const dock = read('src/ui/dock.js'), main = read('src/ui/main.js'), pane = read('src/ui/trials-pane.js');
  assert.match(dock, /lazyPane\(\{ id: 'trials', label: 'Trials', handle: lazy\.trials/);
  assert.match(dock, /trials: \['book',/);
  assert.match(dock, /trials: 'Trials' \}/);
  assert.match(main, /lazy\(\(\) => import\('\.\/trials-pane\.js'\), \(\{ createTrialsPane \}\) => createTrialsPane\(\)\)/);
  assert.match(main, /lazy: \{ doppler: dopplerL, fibroscan: fibroL, trials: trialsL \}/);
  assert.doesNotMatch(main, /from '\.\/trials-pane\.js'/);
  assert.doesNotMatch(pane, /requestAnimationFrame|frameFor\(/, 'no frame of its own');
  assert.match(pane, /function askBuild\(\) \{ if \(!ask\) ask = restPass\(build\); \}/, 'the card is built between frames');
  assert.match(read('src/worker-core.js'), /whatIf\(\{ patch, reqId \}\)/);
});

test('a ratio keeps the decimals the paper gave: two, or three (CAVARLY 0.192–0.716), never rounded', () => {
  assert.equal(ratioText({ kind: 'HR', est: 0.5, lo: 0.25, hi: 0.98 }), 'HR 0.50 (0.25–0.98)');
  assert.equal(ratioText({ kind: 'HR', est: 0.37, lo: 0.192, hi: 0.716 }), 'HR 0.37 (0.192–0.716)');
  for (const t of Object.values(TRIALS)) for (const r of t.ratios ?? []) for (const v of [r.est, r.lo, r.hi]) assert.equal(Number(ratioText({ kind: 'HR', est: v, lo: v, hi: v }).split(' ')[1]), v, `${t.id}: ${v} shown as given`);
});

test('F14: a fixed 0.1 to 2 scale, an arrowhead on an interval that runs past it, and "Not pooled" under each group', () => {
  const real = Object.values(TRIALS);
  const L = forestLayout(real, 360, 13, measure, { all: true });   // (every ratio: the transfusion subgroup is the one past 2)
  assert.deepEqual([...FOREST_SCALE], [0.1, 2]);
  assert.deepEqual(L.texts.filter((s) => s.look === 'forest.tick').map((s) => s.t), ['0.1', '0.25', '0.5', '1', '2'], 'the same ticks whatever the trials');
  // Transfusion's Child–Pugh C interval (1.04, 0.45–2.37) is the one that runs past 2: two strokes meet at the scale's right end.
  const ci = L.lines.filter((l) => /^forest\.ci/.test(l.look));
  const axis = L.lines.find((l) => l.look === 'forest.axis');
  const tips = ci.filter((l) => Math.abs(l.x2 - axis.x2) < 1e-6 && l.x1 < l.x2 && l.y1 !== l.y2);
  assert.equal(tips.length, 2, 'two strokes make one arrowhead');
  assert.equal(tips[0].y2, tips[1].y2);
  assert.ok(tips[0].y1 < tips[0].y2 && tips[1].y1 > tips[1].y2, 'one stroke from above, one from below');
  assert.equal(ci.filter((l) => l.y1 !== l.y2).length, 2, 'no other interval gets an arrowhead');
  assert.ok(ci.every((l) => l.x1 >= axis.x1 - 1e-6 && l.x2 <= axis.x2 + 1e-6), 'nothing is drawn past the scale');
  const groups = L.texts.filter((s) => Object.values(KIND_NAME).includes(s.t)).length;
  assert.ok(groups >= 2);
  assert.equal(L.texts.filter((s) => s.t === NOT_POOLED).length, groups, 'one "Not pooled" line under each group');
  // A scale wide enough takes the same interval in, so it gets no arrowhead.
  const wide = forestLayout(real, 360, 13, measure, { scale: [0.1, 4], all: true });
  assert.equal(wide.lines.filter((l) => /^forest\.ci/.test(l.look) && l.y1 !== l.y2).length, 0);
});

test('F4: the picked trial\'s first row carries a second line under its interval, and the row grows to hold it', () => {
  const real = Object.values(TRIALS);
  const plain = forestLayout(real, 360, 13, measure, { selected: 'predesci' });
  const L = forestLayout(real, 360, 13, measure, { selected: 'predesci', why: { predesci: 'Not this patient: HVPG 8.2, needs ≥10', sort: 'ignored: not picked' } });
  assert.equal(plain.texts.filter((s) => s.look === 'forest.why').length, 0);
  const why = L.texts.filter((s) => s.look === 'forest.why');
  assert.deepEqual(why.map((s) => s.t), ['Not this patient: HVPG 8.2, needs ≥10'], 'once, and not for a trial that is not picked');
  const hit = L.hits.find((q) => q.id === 'predesci'), hit0 = plain.hits.find((q) => q.id === 'predesci');
  assert.ok(hit.h > hit0.h && L.H > plain.H);
  const mk = L.rects.filter((r) => /^forest\.mk/.test(r.look)).find((r) => r.y > hit.y && r.y < hit.y + hit.h);
  assert.ok(why[0].y - 13 > mk.y + mk.h - 1 && why[0].y < hit.y + hit.h, 'the line sits under the marker and inside the row');
});

// TC-V2 / TC-V3 (trials card review, 15 Nov 2026): on a phone the line at 1 ran through every row's "HR 0.51 (…)" words, two CAVARLY rows and two
// transfusion rows read the same once cut, and subgroups sat beside primary results.
test('TC-V2, V3: one row per trial (its primary ratio), the line at 1 never crosses a word, and no two rows read the same', () => {
  const real = Object.values(TRIALS);
  for (const w of [300, 343, 460]) {
    const L = forestLayout(real, w, 13, measure, { selected: 'predesci', why: { predesci: 'Possibly fits: 2 of 3 key rules met' } });
    const ids = L.hits.map((q) => q.id), withRatio = real.filter((t) => ratiosOf(t).length).map((t) => t.id);
    for (const id of withRatio) assert.equal(ids.filter((x) => x === id).length, 1, `${w}: ${id} has one row`);
    const vals = L.texts.filter((s) => /^forest\.val/.test(s.look)).map((s) => s.t);
    for (const t of real.filter((x) => ratiosOf(x).length)) assert.ok(vals.includes(ratioText(ratiosOf(t)[0])), `${w}: ${t.id} shows its primary ratio`);
    // (A word's box: from its baseline up a type size, across its measured width.)
    const boxes = L.texts.map((s) => { const wd = measure(s.t, `500 13px Inter`), x0 = s.anchor === 'end' ? s.x - wd : s.anchor === 'middle' ? s.x - wd / 2 : s.x; return { x0, x1: x0 + wd, y0: s.y - 13, y1: s.y + 2, t: s.t }; });
    for (const l of L.lines.filter((q) => q.look === 'forest.ref')) {
      const y0 = Math.min(l.y1, l.y2), y1 = Math.max(l.y1, l.y2);
      for (const b of boxes) assert.ok(!(l.x1 > b.x0 && l.x1 < b.x1 && y1 > b.y0 && y0 < b.y1), `${w}: the line at 1 crosses "${b.t}"`);
    }
    const rowWords = L.texts.filter((s) => /^forest\.(nm|of)/.test(s.look));
    const labels = L.hits.filter((q) => withRatio.includes(q.id)).map((q) => rowWords.filter((s) => s.y > q.y && s.y < q.y + q.h).map((s) => s.t).join(' '));
    assert.equal(new Set(labels).size, labels.length, `${w}: every row reads differently (${labels.join(' | ')})`);
  }
});
