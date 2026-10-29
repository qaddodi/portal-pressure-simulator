// The beat-by-beat card on a slide (Mohammad's pick d1b, 29 Oct): the wedged and free pressures on EKG paper with the HVPG the gap
// between them, the readings in a column, and where the patient stood before the slide's event as dotted lines and a grey band.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beatTop, beatLayout, colPlan, COL_NEED, paperFine, beforeLabelY, sinceText } from '../src/ui/beat-card.js';
import { DECKS } from '../src/ui/decks.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const pt = read('../src/ui/pressure-time.js');
const css = read('../styles/app.css');
const presenter = read('../src/ui/presenter.js');

test('the scale runs from 0 to a multiple of 5, 20 or more, over every value with room to spare', () => {
  assert.equal(beatTop([17.4, 17.2, 4.4]), 20);
  assert.equal(beatTop([18.5]), 25, 'a line 2 mmHg from the top gets the next 5');
  assert.equal(beatTop([NaN, 3]), 20);
  assert.equal(beatTop([]), 20);
});

test('a wide card has its column beside the plot; a narrow or short one writes the values at the lines\' ends', () => {
  const wide = beatLayout(560, 400);
  assert.ok(wide.wide && wide.colX > wide.R + 12 + 5, 'the caliper stands between the plot and the column');
  assert.ok(560 - wide.colX >= 140, 'the column has 140 px or more');
  assert.ok(wide.ekg && wide.ekg.bot < wide.top, 'the strip sits over the pressures');
  for (const [w, h] of [[340, 172], [520, 140], [430, 300]]) assert.equal(beatLayout(w, h).wide, false, `${w} × ${h}`);
  const phone = beatLayout(340, 172);
  assert.ok(phone.ekg, 'a phone\'s 172 px card keeps the strip');
  assert.ok(phone.bot - phone.top >= 60, 'and the pressures their room');
  assert.equal(beatLayout(340, 96).ekg, null, 'a 96 px card drops the strip first');
  assert.equal(beatLayout(560, 400, false).ekg, null, 'a slide\'s ekg: false leaves the strip off');
});

test('the column always fits its card: closer first, then without the changes, then without the key', () => {
  for (let h = 170; h <= 420; h += 5) {
    for (const d of [true, false]) {
      const p = colPlan(h, d);
      const need = p.rows ? (p.deltas ? COL_NEED.full : COL_NEED.plain) : COL_NEED.bare;
      assert.ok(26 + need * p.k <= h - 4 + 1e-9, `${h} px: the column ends inside the card`);
      assert.ok(p.k <= 1 && (p.k >= 0.75 || !p.rows), `${h} px: set no closer than 0.75 while it has the key`);
      if (!d) assert.equal(p.deltas, false);
    }
  }
  assert.deepEqual(colPlan(400, true), { k: 1, deltas: true, rows: true });
});

test('the paper\'s fine lines only where a square has room', () => {
  assert.equal(paperFine(15), true);
  assert.equal(paperFine(3.6), false);
});

test('"before the bleed" goes above the old gap, under it when a line passes there, nowhere when both are taken', () => {
  assert.equal(beforeLabelY(100, 200, [[150, 160]], 20, 300), 78);
  assert.equal(beforeLabelY(100, 200, [[80, 95]], 20, 300), 204, 'a line under the words above: below the lower line');
  assert.equal(beforeLabelY(100, 200, [[80, 95], [205, 210]], 20, 300), null);
  assert.equal(beforeLabelY(30, 200, [], 20, 300), 204, 'no room above the plot\'s top');
});

test('the change since before: one decimal for a pressure, whole beats for the heart, nothing when it has not moved', () => {
  assert.equal(sinceText(10.1, 12.8, 1), '▼ 2.7 since before');
  assert.equal(sinceText(118, 79, 0), '▲ 39 since before');
  assert.equal(sinceText(12.84, 12.81, 1), '');
  assert.equal(sinceText(12, undefined, 1), '');
});

test('the slide card draws the new layout; the Patients chart and an unmeasured HVPG keep theirs', () => {
  assert.match(pt, /if \(slide && range === 'beats' && showHvpg\) \{ drawBeatCard\(/);
  assert.match(pt, /before = ctx\?\.ref \? \{ fp: ctx\.ref, label: t\?\.deltaLabel \|\| 'before' \} : null;/);
  assert.match(pt, /setLineDash\(\[6, 4\]\); line\(ctx, data\.CONF/, 'the portal pressure dashed');
  assert.match(pt, /ctx\.strokeStyle = text; ctx\.lineWidth = 1\.6;/, 'the EKG in the text colour');
  assert.match(pt, /fillStyle = cssAlpha\('--text-3', 0\.08\); ctx\.fillRect\(L, Y\(wWas\)/, 'the old gap faint grey');
  assert.ok(css.includes('.pz-tool[data-kind="beats"] .pt-head { display: none !important; }'), 'the header leaves the slide card');
  assert.match(pt, /const BEAT_CARD_S = 5;/, 'the slide card shows the last 5 s');
  assert.match(pt, /const span = slide && range === 'beats' && showHvpg \? BEAT_CARD_S :/);
  assert.match(presenter, /ref: s\.tool \|\| s\.delta != null \? refOf\(/, 'the slide\'s context carries its delta\'s fingerprint');
});

test('the bleed decks name what the dotted lines are', () => {
  const tools = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'trace' && s.tool.range === 'beats').map((s) => [d.id, s.id, s.tool]));
  assert.ok(tools.length >= 10);
  for (const [d, id, t] of tools) assert.match(t.deltaLabel || '', /^before the (re)?bleed$/, `${d} ${id}`);
  const vb = DECKS.find((d) => d.id === 'variceal-bleed');
  for (const id of ['rebleed', 'failure', 'bridge']) assert.equal(vb.slides.find((s) => s.id === id).tool.deltaLabel, 'before the rebleed');
});
