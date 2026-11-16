// A guideline path card's height on an iPhone (16 Nov 2026: Mohammad, "this instrument card for iPhone is too long": the Stages card filled
// 60 % of the screen; four stages in full, a chip row that said the stage again, and room kept for the way back that this stage does not have).
// Root cause: a phone card was laid out at whatever its words needed, with no budget, and reserved the tallest body of every patient the
// algorithm could have, though a slide's patient is the slide's own and never changes while the card is up.
// This holds every path card of every slide to a height at the phone's width: a card kind (score, grid, ladder) within PHONE_BODY_MAX, and the
// ones still over it to the ceiling they have today (a ceiling only goes down: lower it when a card is shortened, never raise it).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { PATHS, WORST, OUTCOMES, readingFor, mapWordsOf, patientFor } from '../src/ui/path-data.js';
import { CARD_HELPERS, flow, mapPlace, mapType, readParas, shownOf } from '../src/ui/tool-path.js';
import { layout, isCardKind } from '../src/ui/path-cards.js';
import { loadMetrics } from '../src/ui/text-gl.js';

await loadMetrics();
export const PHONE_BODY_MAX = 330;   // (px under the pill, above the rule: the pill, the rule and the foot add about 50, the card's title and padding 60 more; the card holds about half an iPhone's height)
// the cards over the budget today, by algorithm: their tallest body at 340 px (how far a ceiling may sit above the real height: SLACK)
const CEILING = { psvdscore: 455, first_visit: 440, recomp: 365, ascites: 350, pvtdur: 350 };
const SLACK = 30;
const W = 340, SMALL = 280;

const slides = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'path').map((s) => ({ id: `${d.id}/${s.id}`, tool: s.tool })));
/** The body of a path card at a width (px between the pill and the rule), for the slide's own patient. */
function bodyAt(tool, w) {
  const of = tool.of, spec = PATHS[of], patient = patientFor(tool, null, shownOf);
  if (isCardKind(spec.kind)) return layout(spec.algo, w, true, patient, CARD_HELPERS, true).H;
  const worst = WORST[of], k = mapType(w) / 12;
  const map = mapPlace(spec.tree, w, k, 0, (id) => mapWordsOf(of, id));
  const read = Math.max(...OUTCOMES[of].flatMap((o) => [patient, worst].map((p) => flow(readParas(readingFor(of, o, p)), w, { gap: 4 }).h)));
  return Math.ceil(map.H + 10 + 12 + read);
}

test('there are path cards on slides to hold', () => { assert.ok(slides.length >= 30); });

test('a card kind (score, grid, ladder) fits the phone budget, or stands at its ceiling; a ceiling is never above its card', () => {
  const worst = {};
  for (const s of slides) {
    const of = s.tool.of;
    if (!isCardKind(PATHS[of].kind)) continue;
    worst[of] = Math.max(worst[of] || 0, bodyAt(s.tool, W));
  }
  for (const [of, h] of Object.entries(worst)) {
    const cap = Math.max(PHONE_BODY_MAX, CEILING[of] || 0);
    assert.ok(h <= cap, `${of}: ${h} px on a phone, over ${cap}: shorten the card (abbreviate its rows) rather than raise a ceiling`);
    if (CEILING[of]) assert.ok(h > PHONE_BODY_MAX && CEILING[of] <= h + SLACK, `${of}: its ceiling ${CEILING[of]} is far above its ${h} px: lower it (or drop it under ${PHONE_BODY_MAX})`);
  }
});

test('the stages card is short on a phone, whichever stage the slide is at, and on a small phone', () => {
  for (const s of slides.filter((q) => q.tool.of === 'ladder')) for (const w of [W, SMALL]) {
    const h = bodyAt(s.tool, w), st = s.tool.patient.s;
    assert.ok(h <= (st >= 2 ? 300 : 240), `${s.id} at ${w}: ${h} px (stage ${st + 1})`);
  }
});

test('the tree maps stand at their ceilings on a phone (they only go down)', () => {
  const worst = {};
  for (const s of slides) { const of = s.tool.of; if (!isCardKind(PATHS[of].kind)) worst[of] = Math.max(worst[of] || 0, bodyAt(s.tool, W)); }
  for (const [of, h] of Object.entries(worst)) {
    const key = of.replace('-', '_'), cap = Math.max(PHONE_BODY_MAX, CEILING[key] || 0);
    assert.ok(h <= cap, `${of}: ${h} px on a phone, over ${cap}`);
    if (CEILING[key]) assert.ok(h > PHONE_BODY_MAX && CEILING[key] <= h + SLACK, `${of}: its ceiling ${CEILING[key]} is far above its ${h} px: lower it`);
  }
});

test('a card kind is sized for the slide\'s own patient, and the slide\'s patient is the slide\'s alone (the model never moves it)', () => {
  const dummy = { lsm: 60, plt: 40, ssm: 99, hvpg: 30 };
  for (const s of slides) {
    if (!isCardKind(PATHS[s.tool.of].kind)) continue;
    assert.deepEqual(patientFor(s.tool, dummy, shownOf), patientFor(s.tool, null, shownOf), `${s.id}: a live reading moves a card kind's patient, so its height cannot be the slide's alone`);
  }
});
