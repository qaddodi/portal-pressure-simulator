// The insufflation lesson (deck rebuild plan B1): Endoscopy is six slides about what air in the esophagus does to the varix you see.
// One patient, one scope and one tile all the way through; the model never changes after the first slide, so the HVPG is the
// same on every slide and only the picture and the pressure across the wall move. Each rule here is one the lesson has to keep.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { dataPlan, keepData } from '../src/ui/card-keep.js';
import { abChoice } from '../src/ui/presenter.js';
import { deckStates } from './deck-states.js';

const deck = DECKS.find((d) => d.id === 'endoscopy');
const at = (id) => deck.slides.find((s) => s.id === id);
const plan = (s) => dataPlan(s, { keys: s.key, ref: false, title: '', ghost: null, under: false, sin: true });

test('the lesson: six slides in order and the relation chart after them, three objectives and three checks, the large-varix check kept', () => {
  assert.equal(deck.title, 'The varix changes when you insufflate');
  assert.equal(deck.level, 'core');
  assert.deepEqual(deck.slides.map((s) => s.id), ['size', 'red', 'air', 'across', 'flat', 'bridge', 'relation']);
  assert.equal(deck.objectives.length, 3);
  assert.equal(deck.checks.length, 3);
  const large = deck.checks.find(([q]) => q === 'When is a varix called large?');
  assert.ok(large && /≥5 mm/.test(large[1]), 'a varix is large from 5 mm');
  for (const s of deck.slides) assert.ok(Array.isArray(s.ask) && s.ask.length === 2, `${s.id}: an ask for the room`);
});

test('the lesson: each slide says one thing in one sentence, with its small print in the notes', () => {
  for (const s of deck.slides) {
    const sentences = s.line.split(/(?<=[.?!])\s+/);
    assert.equal(sentences.length, 1, `${s.id}: one sentence`);
    assert.ok(s.line.split(/\s+/).length <= 30, `${s.id}: 30 words or fewer`);
    assert.equal(s.cite, undefined, `${s.id}: no cite on the slide`);
    assert.equal(s.caveat, undefined, `${s.id}: no caveat on the slide`);
    assert.ok(!(s.whatIf && s.compare), `${s.id}: at most one control`);
    assert.ok(s.notes && s.notes.length > 40, `${s.id}: notes`);
  }
});

test('the lesson: one patient, the same camera and tile, and no change to the model after the case', async () => {
  const [first, ...rest] = deck.slides;
  assert.equal(first.preset, 'cirr-decomp');
  assert.ok(first.vignette && first.vignette.length < 220, 'the case card is short');
  for (const s of rest) for (const f of ['preset', 'params', 'action', 'days', 'lapse']) assert.equal(s[f], undefined, `${s.id}: ${f} would change the patient`);
  for (const s of deck.slides) {
    assert.equal(s.cam, 'gej', `${s.id}: the camera stays on the junction`);
    assert.deepEqual(s.tiles, ['hvpg'], `${s.id}: the HVPG is the one tile`);
    assert.equal(s.tool.kind, s.id === 'relation' ? 'curve' : 'scope', `${s.id}: the scope, and the relation chart its curve over the air`);
  }
  const fps = await deckStates(deck);
  for (const fp of fps) assert.equal(fp.hvpg, fps[0].hvpg, 'the HVPG is the same on every slide');
});

test('the lesson: the scope card stays through a run and is built again only where the readings join', () => {
  assert.equal(plan(at('red')), plan(at('air')), 'size and signs, then air: the same card');
  assert.equal(plan(at('across')), plan(at('flat')));
  assert.equal(plan(at('flat')), plan(at('bridge')));
  assert.notEqual(plan(at('air')), plan(at('across')), 'the readings join on the pressure slide');
  assert.equal(keepData({ from: plan(at('red')), to: plan(at('air')), prev: at('red'), next: at('air') }), true);
  assert.equal(keepData({ from: plan(at('air')), to: plan(at('across')), prev: at('air'), next: at('across') }), false);
});

test('the lesson: the buttons and the slider move the scope, not the model', () => {
  const size = at('size'), red = at('red');
  assert.deepEqual(size.compare.map((o, k) => abChoice(size.compare, k).kind), ['state', 'state']);
  assert.deepEqual(red.compare.map((o, k) => abChoice(red.compare, k).kind), ['tool', 'tool']);
  assert.deepEqual(abChoice(red.compare, 0).tool, { red: false });
  assert.equal(abChoice(red.compare, 1).tool, null, 'the slide\'s own button puts the scope\'s options back');
  for (const id of ['air', 'flat']) {
    const w = at(id).whatIf;
    assert.equal(w.tool, 'air');
    assert.equal(w.param, undefined, 'a slider on the scope, not the model');
    assert.ok(w.min === 0 && w.max === 20 && w.step === 1 && w.unit === 'mmHg');
  }
  assert.equal(at('flat').tool.air, 10, 'the slider on the last question starts at 10 mmHg');
  assert.equal(at('across').tool.readings, true);
});

test('the lesson: the one question card is on the slide that answers it, and no slide has an F-code', () => {
  assert.deepEqual(deck.slides.filter((s) => s.question !== undefined).map((s) => s.id), ['flat']);
  const words = JSON.stringify(deck);
  assert.ok(!/\bF[1-3]\b|\bEGD\b|\bour patient\b|—/.test(words), 'no F-code, no abbreviation left undefined, no em-dash');
});

test('what the lesson took from the old Endoscopy deck is taught where it went', async () => {
  const { BLEED } = await import('../src/ui/decks/variceal-bleed.js');
  const { NEXT_BLEED } = await import('../src/ui/decks/next-bleed.js');
  assert.equal(BLEED.checks.length, 4, 'four checks, as before');
  assert.ok(BLEED.checks.some(([q, a]) => /hemoglobin do you transfuse/.test(q) && /7 to 8 g\/dL/.test(a)), 'the transfusion check');
  assert.match(NEXT_BLEED.slides.find((s) => s.id === 'slough').notes, /Banding ulcers[^.]*bleed a week or two after a session/);
  assert.match(NEXT_BLEED.slides.find((s) => s.id === 'slough').notes, /every 6 to 12 months/);
});
