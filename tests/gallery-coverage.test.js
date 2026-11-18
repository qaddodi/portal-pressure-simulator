// The gallery catalog stays complete (src/ui/gallery/catalog.js; plan 4.1 in /mnt/project-files/card-gallery-plan/debug-page-recs.md).
// Fails when a card kind, an instrument option, a visual, a readout tile, a trial, a flowchart, a procedure or a teaching-card
// field has no specimen, and when a specimen no longer fits the slide format. A new card or option needs its specimen in the same push.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, KINDS, SECTIONS, DECK_SECTIONS, LOOK_IDS, DEVICES, byId, sid } from '../src/ui/gallery/catalog.js';
import { galleryDeck } from '../src/ui/gallery/deck.js';
import { checkDeck } from '../src/ui/deck-source.js';
import { EXT } from '../src/ui/slide-ext.js';
import { DECKS } from '../src/ui/decks.js';
import { DEMO_ALL } from '../src/ui/test-decks/demo-all-new-visuals.js';
import { TILE } from '../src/ui/table-marks.js';
import { TRIAL_IDS } from '../src/ui/trials.js';
import { PATHS } from '../src/ui/path-data.js';
import { LOOKS } from '../src/ui/looks.js';

// (The presenter does not load in Node, so the built-in kinds are read from what the built-in decks and the Testing deck use, plus the registered ones.)
const ALL_SLIDES = [...DECKS.flatMap((d) => d.slides), ...DEMO_ALL.slides];

const deck = galleryDeck();
const slides = deck.slides;
const spec = CATALOG.filter((e) => e.kind === 'slide');
const tools = slides.map((s) => s.tool).filter(Boolean);
const toolKey = (t) => (t.kind === 'trace' ? `trace:${t.range}` : t.kind);

test('the catalog is well formed', () => {
  const ids = CATALOG.map((e) => e.id);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'an id twice');
  for (const e of CATALOG) {
    assert.ok(KINDS.includes(e.kind), `${e.id}: kind ${e.kind}`);
    assert.ok(SECTIONS.includes(e.section), `${e.id}: section ${e.section}`);
    assert.match(e.id, /^[a-z0-9-]+\/[a-z0-9-]+$/, `${e.id}: family/name`);
    assert.equal(e.family, e.id.split('/')[0]);
    assert.ok(e.title && e.title.length < 90, `${e.id}: title`);
    if (e.kind === 'slide') {
      assert.ok(e.slide && typeof e.slide === 'object', `${e.id}: slide`);
      assert.ok(DECK_SECTIONS.some(([k]) => k === e.deck), `${e.id}: deck section ${e.deck}`);
    }
  }
  assert.deepEqual(LOOK_IDS, LOOKS.map((l) => l.id));
  assert.ok(DEVICES.length >= 6 && DEVICES.every((d) => d.id && d.w > 0 && d.h > 0));
});

test('the gallery deck is a deck the presenter can play', () => {
  assert.doesNotThrow(() => checkDeck(deck));
  const ids = slides.map((s) => s.id);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'a slide id twice');
  assert.equal(slides.length, spec.length);
  assert.ok(deck.sections.length >= 3 && deck.sections.length <= 5, 'an outline of 3 to 5 sections');
  assert.ok(deck.objectives.length >= 2 && deck.objectives.length <= 3);
  assert.deepEqual(deck.sections.flatMap((s) => s[1]), ids, 'the outline lists every slide once, in order');
  for (const s of slides) {
    assert.ok(s.preset || s.carry === undefined, s.id);
    assert.ok(s.line && s.kicker, `${s.id}: words`);
  }
});

test('a slide that names another slide names an earlier one', () => {
  const at = Object.fromEntries(slides.map((s, i) => [s.id, i]));
  const words = new Set(['start', 'before', 'after']);   // (a keyword some decks use; not a slide id)
  slides.forEach((s, i) => {
    const refs = [s.delta, s.hvpgResp, s.tool?.delta, s.tool?.from, s.tool?.since, ...(s.tool?.trail || []).map((t) => t.slide), ...(s.cohort || []).flatMap((c) => c.slides)];
    for (const r of refs) {
      if (typeof r !== 'string' || words.has(r)) continue;
      assert.ok(r in at, `${s.id} names the slide "${r}", which is not in the gallery deck`);
      assert.ok(at[r] < i, `${s.id} names "${r}", which comes after it`);
    }
  });
});

test('every instrument kind, built in or registered, has a specimen', () => {
  const kindOf = (t) => (t.kind === 'trace' ? `trace:${t.range}` : t.kind);
  const want = new Set([...ALL_SLIDES.map((s) => s.tool).filter(Boolean).map(kindOf), ...Object.keys(EXT.tools)]);
  const have = new Set(tools.map(toolKey));
  assert.deepEqual([...want].filter((k) => !have.has(k)), [], 'instrument kinds with no specimen: add one to src/ui/gallery/catalog.js');
  assert.deepEqual([...have].filter((k) => !want.has(k)), [], 'a specimen names an instrument the app does not have');
});

test('every deck visual has a specimen', () => {
  // (The presenter's own: table, ladders, scale, quadrant, walls; the quick check and the outline the app adds itself. Add a new one here and to the catalog.)
  const want = new Set(['table', 'ladders', 'scale', 'quadrant', 'walls', ...Object.keys(EXT.visuals), ...ALL_SLIDES.map((s) => s.visual).filter((v) => v && !['outline', 'check'].includes(v))]);
  const have = new Set(slides.map((s) => s.visual).filter(Boolean));
  assert.deepEqual([...want].filter((k) => !have.has(k)), [], 'visuals with no specimen');
});

test('every readout tile has a specimen', () => {
  const have = new Set(slides.flatMap((s) => s.tiles || []));
  if (slides.some((s) => s.hvpgResp)) have.add('hvpgFall');
  if (slides.some((s) => s.scopeTile)) have.add('scope');
  assert.deepEqual(Object.keys(TILE).filter((k) => !have.has(k)), [], 'tiles with no specimen');
  assert.ok(have.has('hvpgFall') && have.has('scope'));
  assert.deepEqual([...have].filter((k) => !(k in TILE) && !['hvpgFall', 'scope'].includes(k)), [], 'a specimen names a tile the app does not have');
});

test('every flowchart, trial and procedure has a specimen', () => {
  const paths = new Set(tools.filter((t) => t.kind === 'path').map((t) => t.of));
  assert.deepEqual(Object.keys(PATHS).filter((k) => !paths.has(k)), [], 'flowcharts with no specimen');
  const trials = new Set([...tools.filter((t) => t.kind === 'trial').map((t) => t.id), ...tools.filter((t) => t.kind === 'forest').flatMap((t) => t.ids)]);
  assert.deepEqual(TRIAL_IDS.filter((k) => !trials.has(k)), [], 'trials with no specimen');
  const proc = (p) => (typeof p === 'string' ? p : p.kind);
  const used = new Set(DECKS.flatMap((d) => d.slides.map((s) => s.procedure).filter(Boolean).map(proc)));
  const have = new Set(slides.map((s) => s.procedure).filter(Boolean).map(proc));
  assert.deepEqual([...used].filter((k) => !have.has(k)), [], 'procedures the decks play with no specimen');
});

// The options each instrument takes are the ones the built-in decks use: a deck that starts using an option the gallery lacks fails here.
const GENERIC = new Set(['kind', 'title', 'short', 'title']);
test('every option a built-in deck gives an instrument appears on a specimen of that instrument', () => {
  const usedBy = (list) => {
    const m = {};
    for (const t of list) { const k = toolKey(t); (m[k] ||= new Set()); for (const o of Object.keys(t)) if (!GENERIC.has(o)) m[k].add(o); }
    return m;
  };
  const used = usedBy(DECKS.flatMap((d) => d.slides.map((s) => s.tool).filter(Boolean)));
  const have = usedBy(tools);
  const missing = [];
  for (const [k, opts] of Object.entries(used)) for (const o of opts) if (!have[k]?.has(o)) missing.push(`${k}.${o}`);
  assert.deepEqual(missing.sort(), [], 'options with no specimen');
});

test('the doppler specimens cover its modes, gates and displays', () => {
  const d = tools.filter((t) => t.kind === 'doppler');
  const has = (f) => d.some(f);
  for (const mode of ['color', 'variance']) assert.ok(has((t) => t.mode === mode), mode);
  for (const gate of ['proximal', 'mid', 'distal', 'site']) assert.ok(has((t) => t.gate === gate), gate);
  assert.ok(has((t) => t.waves) && has((t) => t.points) && has((t) => t.scale) && has((t) => t.baseline != null) && has((t) => t.pair) && has((t) => t.calipers) && has((t) => t.delta) && has((t) => t.probe === 'scope'));
});

test('every card-shaping slide field a built-in deck uses appears on a specimen', () => {
  const FIELDS = ['vignette', 'eq', 'cite', 'compare', 'whatIf', 'response', 'strain', 'question', 'caseQ', 'steps', 'lapse', 'marks', 'mark', 'callout', 'terms', 'hvpgResp', 'delta', 'key', 'dataTitle', 'cath', 'procedure', 'days', 'ramp', 'params', 'action', 'lens', 'glow', 'view', 'visual'];
  const used = new Set(DECKS.flatMap((d) => d.slides.flatMap((s) => FIELDS.filter((f) => s[f] !== undefined))));
  const have = new Set(slides.flatMap((s) => FIELDS.filter((f) => s[f] !== undefined)));
  // (dataTitle renames a card's heading, which an instrument's own title does for a specimen; the gallery keeps the title field covered through `tool.title`.)
  const skip = new Set(['dataTitle']);
  assert.deepEqual([...used].filter((f) => !have.has(f) && !skip.has(f)), [], 'slide fields with no specimen');
});

test('a specimen id is a stable address: the slide id is its id with dashes', () => {
  for (const e of spec) assert.equal(slides.find((s) => s.title === e.title && s.id === sid(e.id))?.id, sid(e.id), e.id);
  assert.ok(byId['doppler/pv-color']);
});
