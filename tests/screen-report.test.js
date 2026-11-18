// pps.screen() (src/ui/screen/): the reader registry, the builder, the page, cards and health parts, the text and stable forms, and the fit rules run over a report.
import './screen-dom.js';   // (first: the figure reader's painters (colormap.js, util.js) watch the page at import, so the page's globals must be there)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerReader, readerList, readerIds, readerClashes } from '../src/ui/screen/registry.js';
import { buildScreen, stableReport } from '../src/ui/screen/build.js';
import { screenText, SUMMARY_MAX } from '../src/ui/screen/text.js';
import { readCardLines } from '../src/ui/screen/read-cards.js';
import { readWords } from '../src/ui/gallery/readers.js';
import { ruleIds } from '../src/ui/selfcheck/rules.js';
import { KINDS } from '../src/ui/gallery/fit-rules.js';
import { page, screenOf, fires, quiet } from './selfcheck-helpers.js';

const CLEAN = `<div class="pz">
  <div class="pz-shade"></div>
  <section class="pz-text" data-box="40,40,440,400"><h1 class="pz-h" style="font-size:28px" data-box="50,50,400,100">A title</h1><p class="pz-line" style="font-size:18px" data-box="50,110,400,160">Portal flow is 12 cm/s toward the liver, HVPG 14 mmHg.</p></section>
  <section class="pz-data" data-box="900,60,1400,500"><span class="x" style="font-size:14px" data-box="910,70,1000,90">Tile name</span></section>
</div><span class="pzb-n">3/9</span>`;
const SMALL = CLEAN.replace('font-size:14px', 'font-size:9px');

test('the built-in readers are registered in order: page, cards, health', () => {
  const ids = readerIds();
  assert.ok(ids.indexOf('page') < ids.indexOf('cards') && ids.indexOf('cards') < ids.indexOf('health'));
  assert.deepEqual(readerClashes(), []);
});

test('a reader needs an id, an owner and read(); a taken id is ignored and counted', () => {
  assert.throws(() => registerReader({ id: 'Bad Id', owner: 'x', read() {} }), /id must be/);
  assert.throws(() => registerReader({ id: 'findings', owner: 'x', read() {} }), /id must be/);
  assert.throws(() => registerReader({ id: 'zz-a', read() {} }), /owner/);
  assert.throws(() => registerReader({ id: 'zz-a', owner: 'x' }), /read\(ctx\)/);
  assert.equal(registerReader({ id: 'cards', owner: 'x', read() {} }), false);
  assert.ok(readerClashes().includes('cards'));
});

test('the report holds the page, the cards and the health, in plain JSON', () => {
  const p = page(CLEAN);
  try {
    const r = screenOf(p);
    assert.equal(r.v, 1);
    assert.equal(r.page.vw, 1440); assert.equal(r.page.deck, 'demo'); assert.equal(r.page.slide, 3); assert.equal(r.page.patient, 'healthy'); assert.equal(r.page.view, 'anatomy');
    assert.deepEqual(r.cards.cards.map((c) => c.sel), ['.pz-text', '.pz-data']);
    const t = r.cards.cards[0];
    assert.equal(t.title, 'A title'); assert.deepEqual(t.box, [40, 40, 440, 400]); assert.equal(t.stage, 'shown');
    assert.deepEqual(t.lines, [['A title', 28], ['Portal flow is 12 cm/s toward the liver, HVPG 14 mmHg.', 18]]);
    assert.ok(t.nums.includes('12 cm/s') && t.nums.includes('14 mmHg'));
    assert.ok(r.health.contexts && r.health.errors);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r, 'plain JSON: it survives a round trip unchanged');
    assert.deepEqual(r.findings, []);
  } finally { p.restore(); }
});

test('the card lines are exactly the gallery reader\'s words (the reader walks the page as readWords does)', () => {
  const p = page(CLEAN);
  try {
    const lines = readCardLines(p.io, {}), words = readWords(p.io, {}).cards;
    for (const q of Object.keys(words)) assert.deepEqual(lines[q].lines.map((l) => l[0]), words[q], q);
    assert.deepEqual(Object.keys(lines), Object.keys(words));
  } finally { p.restore(); }
});

test('a page with no layout says so and still reports its words', () => {
  const p = page('<section class="pz-text"><h1 class="pz-h">Words</h1></section>');
  try {
    const r = screenOf(p);
    assert.equal(r.cards.layout, false);
    assert.equal(r.cards.cards[0].box, null);
    assert.match(screenText(r), /no layout here/);
  } finally { p.restore(); }
});

test('the text form is plain sentences, with the self-checks at the end, and the summary stays under 2 KB', () => {
  const p = page(SMALL);
  try {
    const r = screenOf(p);
    const t = screenText(r);
    assert.match(t, /^Screen 1440×900/);
    assert.match(t, /Teaching card "A title"/);
    assert.match(t, /Self-checks found \d+ problem/);
    assert.match(t, /\[fit-small\]/);
    assert.ok(t.length < SUMMARY_MAX + 300, `summary ${t.length} chars`);
    const full = screenText(screenOf(p, { detail: 'full' }));
    assert.match(full, / 18 px {2}Portal flow/);
  } finally { p.restore(); }
});

test('a long report is cut to about 2 KB with a line saying how to ask for the rest, and the self-checks stay', () => {
  const many = Array.from({ length: 80 }, (_, i) => `<p class="pz-line" style="font-size:18px" data-box="50,110,400,160">Line number ${i} of a very long teaching card with plenty of words in it.</p>`).join('');
  const p = page(`<div class="pz"><section class="pz-text" data-box="40,40,440,400"><h1 class="pz-h" style="font-size:28px">T</h1>${many}</section></div>`);
  try {
    const r = screenOf(p, { detail: 'full' });
    const full = screenText(r, { detail: 'full' });
    assert.ok(full.length > SUMMARY_MAX, 'the full text is long');
    const t = screenText(r, { detail: 'summary' });
    assert.ok(t.length <= SUMMARY_MAX, `summary ${t.length} chars`);
    assert.match(t, /Self-checks: nothing wrong found/);
  } finally { p.restore(); }
});

test('stableReport leaves out the volatile parts and the times in findings, so two runs of one state compare equal', () => {
  const p = page(CLEAN);
  try {
    const a = screenOf(p), b = screenOf(p);
    b.health = { ...b.health, fps: 99 };
    assert.deepEqual(stableReport(a), stableReport(b));
    assert.ok(!('health' in stableReport(a)));
  } finally { p.restore(); }
});

test('a reader that throws is named in errors and the other parts still come', () => {
  registerReader({ id: 'zz-broken', owner: 'tests/screen-report.test.js', order: 95, read() { throw new Error('nope'); } });
  const p = page(CLEAN);
  try {
    const r = screenOf(p);
    assert.equal(r.errors['zz-broken'], 'nope');
    assert.ok(r.cards && r.page);
    assert.match(screenText(r), /Readers that failed: zz-broken \(nope\)/);
  } finally { p.restore(); }
});

test('only: reads the page and the parts named, and nothing else', () => {
  const p = page(CLEAN);
  try {
    const r = screenOf(p, { only: 'cards', rules: false });
    assert.ok(r.page && r.cards); assert.ok(!r.health); assert.ok(!('findings' in r));
  } finally { p.restore(); }
});

test('every fit kind has a rule (zoomed needs a second reading, so it has none)', () => {
  for (const k of KINDS) assert.equal(ruleIds().includes(`fit-${k}`), k !== 'zoomed', k);
});

test('fit-small fires on lettering under 12 px and stays quiet on a clean slide', () => {
  const bad = page(SMALL), good = page(CLEAN);
  try {
    fires('fit-small', screenOf(bad), /9\.0 px|9 px/);
    quiet('fit-small', screenOf(good));
  } finally { bad.restore(); good.restore(); }
});

test('fit-ratio fires when the title is under 1.4 times the words and stays quiet at 28 over 18', () => {
  const bad = page(CLEAN.replace('font-size:28px', 'font-size:20px')), good = page(CLEAN);
  try { fires('fit-ratio', screenOf(bad), /1\.11x|ratio|title/); quiet('fit-ratio', screenOf(good)); } finally { bad.restore(); good.restore(); }
});

test('fit-styled fires on a card shown while the slide is still being laid out, and stays quiet once it is whole', () => {
  const bad = page(CLEAN.replace('<div class="pz">', '<div class="pz pz-prep">')), good = page(CLEAN);
  try { fires('fit-styled', screenOf(bad), /pz-prep/); quiet('fit-styled', screenOf(good)); } finally { bad.restore(); good.restore(); }
});

// (The readers' own findings, as a reader hands them: each rule fires on its kind and on no other.)
const withFit = (fit, structure = null) => ({ v: 1, cards: { fit, structure } });
for (const [kind, key] of [['scroll', 'scroll'], ['clipped', 'clipped'], ['off', 'off'], ['enlarged', 'enlarged'], ['sideways', 'sideways']]) {
  test(`fit-${kind} fires on what the reader found and on no other kind`, () => {
    fires(`fit-${kind}`, withFit({ [key]: ['p.pz-line "words"'] }), /words/);
    quiet(`fit-${kind}`, withFit({}));
    for (const other of ['scroll', 'clipped', 'off', 'enlarged', 'sideways'].filter((k) => k !== kind)) quiet(`fit-${kind}`, withFit({ [other]: ['something'] }));
  });
}

test('the structure card rules fire on a blank gap, a cut line and a scroller that did not need to, and stay quiet on a card that fits', () => {
  const fits = { h: 200, gapTop: 14, gapBot: 12, cut: 0, scroll: false, ovf: 'hidden', atMax: false, small: [], sideways: [], styled: [] };
  for (const k of ['blank', 'cut', 'tall']) quiet(`fit-${k}`, withFit({}, fits));
  fires('fit-blank', withFit({}, { ...fits, gapTop: 60 }), /60px above/);
  fires('fit-cut', withFit({}, { ...fits, cut: 9 }), /9px past/);
  fires('fit-tall', withFit({}, { ...fits, scroll: true }), /scrolls/);
  quiet('fit-tall', withFit({}, { ...fits, scroll: true, atMax: true }));
});

test('a report with no cards at all gives no fit findings', () => {
  quiet('fit-scroll', { v: 1 });
  quiet('fit-off', { v: 1, cards: { fit: {}, structure: null } });
});
