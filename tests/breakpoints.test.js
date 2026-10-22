import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// One set of breakpoints (codebase review 22 Oct, item 5): the presenter's phone()/tabUp() and the stage's upright rule read the
// same media queries as styles/app.css's phone blocks, so a 700–767 px window or a near-square upright one is never laid out
// as a phone by the style sheet and as a wide screen by the script.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// (util.js needs a page to load: its query constants are read from its source, in order, as the page would.)
const NAMES = ['UPRIGHT_MQ', 'SIDEWAYS_MQ', 'SHORT_SIDE_MQ', 'PHONE_MQ', 'STACK_MQ', 'TABLET_UP_MQ'];
const lines = read('../src/ui/util.js').split('\n').filter((l) => new RegExp(`^export const (${NAMES.join('|')}) = `).test(l)).map((l) => l.replace(/^export /, ''));
const { UPRIGHT_MQ, SIDEWAYS_MQ, SHORT_SIDE_MQ, PHONE_MQ, STACK_MQ, TABLET_UP_MQ } = new Function(`${lines.join('\n')}\nreturn { ${NAMES.join(', ')} };`)();

test('every breakpoint constant, written once', () => {
  assert.equal(UPRIGHT_MQ, '(max-width: 1100px) and (orientation: portrait)');
  assert.equal(SIDEWAYS_MQ, '(max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
  assert.equal(SHORT_SIDE_MQ, '(orientation: landscape) and (max-height: 500px)');
  assert.equal(PHONE_MQ, `(max-width: 767px), ${SIDEWAYS_MQ}, ${UPRIGHT_MQ}`);
  assert.equal(STACK_MQ, `(max-width: 767px), ${UPRIGHT_MQ}`);
  assert.equal(TABLET_UP_MQ, '(min-width: 768px) and (max-width: 1100px) and (orientation: portrait)');
});

test("the style sheet's phone blocks use exactly those queries", () => {
  const css = read('../styles/app.css');
  const qs = [...css.matchAll(/@media ([^{]*max-width: 767px[^{]*)\{/g)].map((m) => m[1].trim());
  assert.ok(qs.length >= 30, `${qs.length} phone blocks`);
  // (Narrowed on purpose, each clause the shared one plus a condition: listed here, so a new variant is a choice, not a copy that drifts.)
  const NARROWED = [
    '(max-width: 767px) and (min-height: 501px), (max-width: 1100px) and (orientation: portrait)',   // stacked: the phone less on its side
    '(min-width: 360px) and (max-width: 767px), (min-width: 360px) and (max-width: 1100px) and (orientation: portrait)',
    '(max-width: 767px) and (prefers-reduced-motion: no-preference), (max-width: 1100px) and (orientation: portrait) and (prefers-reduced-motion: no-preference)',
    '(max-width: 720px) and (max-height: 500px) and (orientation: landscape)',
  ];
  for (const q of qs) assert.ok([STACK_MQ, PHONE_MQ, ...NARROWED].includes(q), `app.css: @media ${q}`);
  for (const q of [...css.matchAll(/@media ([^{]*max-height: 500px[^{]*)\{/g)].map((m) => m[1].trim())) assert.ok([SIDEWAYS_MQ, SHORT_SIDE_MQ, PHONE_MQ, ...NARROWED].includes(q), `app.css: @media ${q}`);
});

test('the presenter and the stage read the shared queries, not their own pixel rules', () => {
  const pz = read('../src/ui/presenter.js'), st = read('../src/ui/stage.js'), dock = read('../src/ui/dock.js');
  assert.match(pz, /const stackMQ = matchMedia\(STACK_MQ\), shortMQ = matchMedia\(SHORT_SIDE_MQ\), tabMQ = matchMedia\(TABLET_UP_MQ\);/);
  assert.match(pz, /const phone = \(\) => stackMQ\.matches && !shortMQ\.matches;/);
  assert.match(pz, /const tabUp = \(\) => tabMQ\.matches;/);
  for (const src of [pz, st]) assert.doesNotMatch(src, /innerHeight > innerWidth \* 1\.15|innerWidth < 700 && innerHeight >= 500/);
  assert.match(st, /const portraitPhone = \(\) => matchMedia\(UPRIGHT_MQ\)\.matches;/);
  assert.match(dock, /const sidewaysMQ = matchMedia\(SIDEWAYS_MQ\);/);
});
