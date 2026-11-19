// The phone check's paths (src/ui/gallery/journeys.js): every move between views, every Tests pane, every structure card the catalog names, the HVPG pair, and the
// order they are walked in. Pure data: no page.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJourneys, heaviness, heaviestPair, VIEW_ROUTE, PANES, HVPG_PAIR, stepCount } from '../src/ui/gallery/journeys.js';
import { moveList } from '../src/ui/gallery/benches/camera-grid.js';
import { TESTS_PANES } from '../src/ui/gallery/catalog-main.js';
import { CATALOG } from '../src/ui/gallery/catalog.js';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { parseCheckAddress, pickJourneys } from '../src/ui/gallery/phone-check-panel.js';

const J = buildJourneys();
const byId = Object.fromEntries(J.map((j) => [j.id, j]));

test('the views path plays every ordered move between the four views exactly once', () => {
  const want = new Set(moveList().filter((m) => !m.refit).map((m) => m.id));
  const got = [];
  let at = 'anatomy';
  for (const to of VIEW_ROUTE) { got.push(`${at}>${to}`); at = to; }
  assert.deepEqual(new Set(got), want);
  assert.equal(got.length, want.size, 'no move twice');
  const steps = byId.views.steps.filter((s) => s.from);
  assert.deepEqual(steps.map((s) => `${s.from}>${s.to}`), got);
});

test('the panes path visits every Tests pane of the catalog, forward, on a TIPS patient, and back', () => {
  assert.deepEqual([...PANES].sort(), [...TESTS_PANES].sort());
  const panes = byId.panes.steps.filter((s) => s.op === 'pane').map((s) => s.pane);
  for (const p of TESTS_PANES) assert.ok(panes.filter((x) => x === p).length >= 2, `${p} at least twice (forward and back)`);
  const tips = byId.panes.steps.findIndex((s) => s.op === 'preset' && s.id === 'cirr-decomp-tips');
  assert.ok(tips > 0 && byId.panes.steps[tips + 1].pane === 'hvpg' && byId.panes.steps[tips + 2].pane === 'doppler', 'the reported crash: the IR pane of a TIPS patient, then Doppler');
  assert.ok(!byId.panes.steps.some((s) => s.op === 'clear' && byId.panes.steps.indexOf(s) > 0 && byId.panes.steps.indexOf(s) < byId.panes.steps.length - 1), 'the card is not closed between panes');
});

test('the structure paths cover every structure card of the catalog (the Details faces are one tap on the name, three of them walked)', () => {
  const ids = new Set(['structure', 'structure-lobule'].flatMap((k) => (byId[k]?.steps || []).filter((s) => s.op === 'pick' && !s.details).map((s) => s.id)));
  const want = CATALOG.filter((e) => e.kind === 'pick' && !e.details).map((e) => e.id);
  assert.deepEqual([...ids].sort(), want.sort());
  assert.ok(byId['structure-lobule'].steps.every((s) => s.op !== 'view' || s.to === 'lobule'));
});

test('the HVPG pair plays slide 5 and 6 as the presenter numbers them, the cycles told', () => {
  const s = byId['hvpg-5-6'].steps.filter((x) => x.op === 'slide');
  assert.equal(s.length, HVPG_PAIR.cycles * 2);
  assert.deepEqual(s.slice(0, 2).map((x) => x.at), [4, 5]);
  assert.ok(s.every((x) => x.deck === 'hvpg'));
  assert.equal(byId['hvpg-5-6'].steps.at(-1).op, 'talk-end');
});

test('every deck gets two consecutive slides that exist, in journeys of a few decks', () => {
  const decked = J.filter((j) => /^decks-/.test(j.id));
  assert.ok(decked.length >= 3);
  const seen = new Set();
  for (const j of decked) {
    for (const s of j.steps.filter((x) => x.op === 'slide')) {
      const d = DECKS.find((x) => x.id === s.deck);
      assert.ok(d, s.deck);
      assert.ok(s.at >= 1 && s.at < withOverview(d).slides.length, `${s.deck} slide ${s.at}`);
      seen.add(s.deck);
    }
  }
  assert.equal(seen.size, DECKS.filter((d) => d.slides?.length).length, 'every deck is walked');
});

test('the tour opens one specimen of each teaching-card family, and every id exists', () => {
  const t = byId.tour.steps.filter((s) => s.op === 'entry');
  const fams = new Set(CATALOG.filter((e) => e.kind === 'slide').map((e) => e.family));
  assert.equal(t.length, fams.size);
  for (const s of t) assert.ok(CATALOG.some((e) => e.id === s.id), s.id);
});

test('priority orders the walk: crash paths first, the family tour last; every step has a label and a known op', () => {
  const pr = J.map((j) => j.priority);
  assert.deepEqual(pr, [...pr].sort((a, b) => a - b));
  assert.equal(J.at(-1).id, 'tour');
  assert.ok(['views', 'panes', 'hvpg-5-6', 'tip-zoom'].every((id) => J.slice(0, 4).some((j) => j.id === id)));
  const ops = new Set(['preset', 'view', 'pane', 'organ', 'pick', 'clear', 'slide', 'talk-end', 'entry', 'camera']);
  for (const j of J) for (const s of j.steps) { assert.ok(ops.has(s.op), s.op); assert.ok(s.label, `${j.id} ${s.op}`); }
  assert.ok(stepCount(J) > 150 && stepCount(J) < 400, `${stepCount(J)} steps`);
  assert.equal(new Set(J.map((j) => j.id)).size, J.length, 'unique ids');
});

test('heaviness: instruments, procedures, the catheter and the lobule weigh more than a plain slide', () => {
  assert.equal(heaviness({}), 0);
  assert.ok(heaviness({ tool: { kind: 'doppler' } }) > heaviness({ tool: { kind: 'vitals' } }));
  assert.ok(heaviness({ procedure: 'tips', tool: { kind: 'stent' } }) > heaviness({ tool: { kind: 'stent' } }));
  assert.ok(heaviness({ cam: 'lobule:triad' }) >= 3);
  const d = { id: 'x', title: 'X', slides: [{ id: 'a' }, { id: 'b', tool: { kind: 'doppler' } }, { id: 'c' }, { id: 'd' }] };
  assert.deepEqual(heaviestPair(d), [2, 3], 'the heaviest slide (presenter index 2, after the outline) and the one after');
  assert.equal(heaviestPair({ slides: [] }), null);
});

test('the address: ?check, ?check=full, the rate, a subset of paths', () => {
  assert.equal(parseCheckAddress('?gallery'), null);
  assert.deepEqual(parseCheckAddress('?check'), { full: false, rate: 6, only: [], fresh: false, steps: true });
  assert.deepEqual(parseCheckAddress('?check=full&rate=10&only=views,decks&fresh=1'), { full: true, rate: 10, only: ['views', 'decks'], fresh: true, steps: true });
  assert.equal(parseCheckAddress('?check&rate=0').rate, 6);
  assert.equal(parseCheckAddress('?check&rate=99').rate, 20);
  assert.deepEqual(pickJourneys(J, ['decks']).map((j) => j.id).every((id) => /^decks-/.test(id)), true);
  assert.deepEqual(pickJourneys(J, ['views']).map((j) => j.id), ['views']);
  assert.equal(pickJourneys(J, []).length, J.length);
});
