// One pressure chart on every card (Mohammad, 21 Oct: "Gut to heart is good, unify it"; Pre-hepatic 3: "do we really need both in
// the same figure? ... just use the one we decided on"). The old five-station ladder card is gone from every deck: each of its slides
// shows the Gut to heart chart (tool { kind: 'profile' }), its earlier line as the chart's from, its tiles kept. The resistance is
// read from where the chart falls steeply, as on the Sites slides, with no hatching (his OK on the plan, 21 Oct).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseDeckSource } from '../src/ui/deck-source.js';
import { DECKS } from '../src/ui/decks.js';
import { oneLadder } from '../src/ui/teach-extras.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const slides = readdirSync(DIR).filter((f) => f.endsWith('.js'))
  .flatMap((f) => parseDeckSource(readFileSync(new URL(f, DIR), 'utf8')).slides.map((s) => ({ ...s, f })));
const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const at = (f, id) => slides.find((x) => x.f === f && x.id === id);

test('no built-in slide asks for the old ladder card or any of its fields', () => {
  for (const s of slides) {
    for (const k of ['brackets', 'block', 'ladderFrom', 'ladderFromLabel', 'fold']) assert.equal(s[k], undefined, `${s.f} ${s.id}: ${k}`);
    assert.notEqual(s.data, 'ladder', `${s.f} ${s.id}`);
    for (const o of s.of || []) if (typeof o === 'object') assert.equal(o.block, undefined, `${s.f} ${s.id} row ${o.id}`);
    for (const c of s.compare || []) assert.equal(c.block, undefined, `${s.f} ${s.id} button ${c.label}`);
  }
});

test('the presenter has no old ladder left: no five-station drawing, strip, legend, hatching on a station or block buttons', () => {
  assert.doesNotMatch(pres, /bigLadder|RUNGS|ladderFromTo|ui\.ladder|ladder\.strip|pz-strip|pz-ladder|pz-lg|snodeBlk|nodeBlk|blockOf|abBlk|data === 'ladder'/);
  assert.doesNotMatch(css, /pz-ladder|pz-strip|pz-lg|pzl-(base|bg|bk|br|drop|from|grid|k|lead|line|nb|pt|v)\b|lad-swap|lad-fixed/);
  // (The level rail keeps its own hatched block: it names the level, not a station.)
  assert.match(pres, /function railBlock\(\)/);
  assert.match(css, /\.pzs-drop \{/);
});

test('every slide that had the old ladder shows the Gut to heart chart, or keeps its instrument with the readings as tiles', () => {
  const was = { 'circulation.js': ['ladder', 'define'], 'circuit.js': ['where'], 'hvpg.js': ['presin', 'ppg', 'heart'], 'lobule.js': ['wedge'],
    'treatment.js': ['target', 'oct', 'vs'], 'cause-treated.js': ['high', 'high2'],
    'recompensation.js': ['csph'], 'ncph.js': ['wedge'], 'outflow.js': ['soswedge'],
    'prehepatic.js': ['cath', 'gradients'], 'where.js': ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] };
  for (const [f, ids] of Object.entries(was)) for (const id of ids) assert.equal(at(f, id)?.tool?.kind, 'profile', `${f} ${id}`);
  // (A card holds one instrument, and a phone has no room for a Doppler and the chart: there the chart's numbers are tiles.)
  assert.deepEqual(at('outflow.js', 'nowedge').tiles, ['pv', 'ppg']);
  // (Each card that had tiles beside the ladder keeps them.)
  for (const s of slides) if (s.tiles?.length && s.tool) assert.equal(s.data, 'tiles', `${s.f} ${s.id}: its tiles show`);
});

test('the earlier line keeps its name: Before TIPS and Year 8 on Ten years\' profile slides, the HVPG tracing on the drug slides', () => {
  // (Lowering portal pressure's propranolol and carvedilol slides read the HVPG tracing and the percent fall now, not the line: C3, 25 Oct.)
  for (const id of ['prop', 'carv', 'carv-sin']) assert.deepEqual(at('treatment.js', id).tool, { kind: 'hvpg' }, id);
  for (const id of ['d365', 'carv']) assert.deepEqual(at('ten-years.js', id).tool, { kind: 'hvpg' }, id);
  assert.deepEqual(at('ten-years.js', 'rebleed').tool, { kind: 'profile', from: 'bands', fromLabel: 'Year 8' });
  assert.deepEqual(at('ten-years.js', 'tips').tool, { kind: 'profile', from: 'rebleed', fromLabel: 'Before TIPS' });
  const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
  assert.match(prof, /fromLabel: typeof t\?\.fromLabel === 'string' && t\.fromLabel\.trim\(\) \? t\.fromLabel\.trim\(\) : 'Before'/);
  assert.match(prof, /placeLineNames\(g, tw, goal, hl, bf, s, brk, cfg\.fromLabel, pl \|\| \[\]\)/, 'the faint line is named as the slide asks');
  assert.match(prof, /\[bf, bfName, 'bf'\]/);
});

test('the HVPG deck still names the wedged and free readings: WHVP and FHVP tiles beside the heart chart, the catheter tracing in the data card of its own slides', () => {
  const heart = at('hvpg.js', 'heart'); assert.equal(heart.data, 'tiles'); assert.deepEqual(heart.tiles, ['whvp', 'fhvp']);
  // (The catheter slide reads the two on the tracing in its data card and gives the equation in its words; it carries no chart, tiles or buttons
  // of its own: D5, 25 Oct. The tracing moved from the teaching card to the data card on 26 Oct, and follows the figure's catheter.)
  const cath = at('hvpg.js', 'hvpg');
  assert.deepEqual(cath.tool, { kind: 'hvpg', catheter: true }); assert.equal(cath.cath, 'result'); assert.ok(cath.eq);
  assert.equal(cath.monitor, undefined, 'the teaching card holds only words');
  for (const k of ['data', 'tiles', 'compare']) assert.equal(cath[k], undefined, `hvpg slide has no ${k}`);
  // (And the figure tags the wedge and the free hepatic vein on every Gut to heart slide, as it did on the ladder's.)
  assert.match(pres, /presentNames: s\.tool\?\.kind === 'profile' \|\| !!s\.cath,/);
});

test('an older deck\'s ladder slide, an imported deck or a script, shows the Gut to heart chart too', () => {
  assert.match(pres, /ask: st\.ask, tool: \{ kind: 'profile' \}, key: st\.key \|\| \[\],/, 'an instructor\'s script');
  // (The test decks still written with the old field come out as the built-in slides do.)
  const demo = readFileSync(new URL('../src/ui/test-decks/demo-all-new-visuals.js', import.meta.url), 'utf8');
  assert.match(demo, /"data": "ladder"/);
  assert.deepEqual(oneLadder({ data: 'ladder', ladderFrom: 'd-start', ladderFromLabel: 'No Rx' }).tool, { kind: 'profile', from: 'd-start', fromLabel: 'No Rx' });
  // (Every built-in deck, once through it, is unchanged: none has a ladder slide left.)
  for (const d of DECKS) for (const s of d.slides) assert.equal(oneLadder(s), s, `${d.id}/${s.id}`);
});

test('the six-case summary keeps its six patients, the heart failure one included', () => {
  const lad = slides.find((x) => x.f === 'sites.js' && x.visual === 'ladders');
  assert.ok(lad.of.some((r) => (r.id ?? r) === 'cardiac'), 'the summary includes the heart failure slide');
  assert.equal(lad.of.length, 6);
  assert.equal(slides.find((x) => x.f === 'where.js' && x.visual === 'ladders').of.length, 6);
});

test('the profile\'s HVPG and PPG brackets round the true values, never the difference of the drawn readings (Mohammad\'s pick: they may be 1 off it)', () => {
  const src = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /wholeGap/);
  assert.doesNotMatch(readFileSync(new URL('../src/engine/gap.js', import.meta.url), 'utf8'), /wholeGap/, 'the whole-number gap is gone');
  assert.match(src, /const v = shown\[k\], rate = RATE\[k\]\(v\)\[0\];/);
  assert.match(src, /HVPG \$\{whole\(shown\.hvpg\)\}, PPG \$\{whole\(shown\.ppg\)\}/);
  assert.match(src, /return \{ v, hvpg: fp\.hvpg, ppg: fp\.ppg \};/);
});
