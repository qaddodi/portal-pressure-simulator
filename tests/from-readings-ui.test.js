// "From readings" on the page (src/ui/from-readings.js), in jsdom: the four steps with their rows and a Skip on every one, the still-possible
// count and pills that narrow as readings are typed, unknown staying unknown, the scenarios (ties as ties, what each cannot explain, the footer
// that says model scenarios, not diagnoses), and "Open as patient" handing the family, its settings and only the readings that were entered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><button id="btnMenu" aria-label="Menu">Menu</button></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'Event', 'KeyboardEvent']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.innerHeight ??= 800; globalThis.innerWidth ??= 1200;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { createFromReadings, STEPS } = await import('../src/ui/from-readings.js');
const { closePopover } = await import('../src/ui/util.js');
const { FAMILIES } = await import('../src/engine/inverse-families.js');

const anchor = document.getElementById('btnMenu');
const opened = [];
const fr = createFromReadings({ makeWorker: null, openYours: async (f, p, r) => { opened.push({ f, p, r }); } });
const root = () => document.querySelector('.fr-pop');
const body = () => root().querySelector('.fr-body');
const type = (k, v) => { const i = body().querySelector(`input[data-k="${k}"]`); i.value = v; i.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
const grade = (label, name) => { const row = [...body().querySelectorAll('.fr-grade')].find((r) => r.querySelector('b').textContent === label); [...row.querySelectorAll('button')].find((b) => b.textContent === name).click(); };
const next = () => body().querySelector('.fr-next').click();
const pills = () => Object.fromEntries([...body().querySelectorAll('.fr-pill')].map((p) => [p.textContent, p.dataset.s]));
const count = () => Number(body().querySelector('.fr-count b').textContent);
const reset = () => { fr.state.raw = {}; fr.state.step = 0; fr.state.view = 'steps'; };
// (A sheet put away is still in the page for its exit: take it out, as the exit's timer does, so the next open is the only one.)
const openFresh = () => { closePopover(); for (const e of document.querySelectorAll('.fr-pop, .um-scrim')) e.remove(); fr.open(anchor); };

test('it opens on the pressures step with its rows, the count of all lesion types and a skip', () => {
  reset();
  openFresh();
  assert.ok(root(), 'the sheet is in the page');
  assert.equal(STEPS.length, 4);
  assert.deepEqual([...body().querySelectorAll('input')].map((i) => i.dataset.k), ['whvp', 'fhvp', 'hvpg', 'pv', 'ppg', 'ivc', 'ra']);
  assert.equal(count(), FAMILIES.length, 'nothing entered: every lesion type is still possible');
  assert.equal(Object.keys(pills()).length, FAMILIES.length);
  assert.ok(Object.values(pills()).every((s) => s === 'possible'));
  assert.match(body().querySelector('.fr-next').textContent, /skip/i, 'nothing entered: the one button skips');
  assert.match(body().textContent, /Model scenarios, not diagnoses/);
});

test('typing narrows the lesion types, a value that is not a number is said and not counted, and the HVPG is made from the two pressures', async () => {
  type('whvp', '21'); type('fhvp', '5');
  assert.match(body().querySelector('.fr-derived').textContent, /HVPG 16\.0 mmHg/);
  type('pv', '24'); type('ivc', '5'); type('ra', '3');
  assert.ok(Object.values(pills()).includes('out'), 'five pressures rule some lesion types out (the pills change at once)');
  await new Promise((r) => setTimeout(r, 200));   // (the count crossfades to its new number between frames)
  assert.ok(count() < FAMILIES.length);
  assert.doesNotMatch(body().querySelector('.fr-next').textContent, /skip/i);
  type('ra', 'abc');
  assert.match(body().querySelector('input[data-k="ra"]').closest('.fr-row').textContent, /number/i);
  type('ra', '');
});

test('every step can be skipped and the last one waits for enough readings', () => {
  reset();
  openFresh();
  for (let i = 0; i < 3; i++) { assert.match(body().querySelector('.fr-next').textContent, /skip/i, `step ${i + 1}`); next(); }
  assert.equal(fr.state.step, 3);
  assert.equal(body().querySelector('.fr-next').textContent, 'Show scenarios');
  assert.equal(body().querySelector('.fr-next').disabled, true, 'no readings: the search is not offered');
  assert.match(body().querySelector('.fr-need').textContent, /0 of the 4/);
});

test('a ranking from a presinusoidal patient: ties shown as ties, what each cannot explain, the next reading, the footer', () => {
  reset();
  openFresh();
  type('whvp', '8'); type('fhvp', '4.5'); type('ppg', '14'); next();
  type('lsm', '6.5'); type('ssm', '68'); next();
  type('spleen', '16'); type('plt', '78'); next();
  grade('Ascites', 'None');
  assert.equal(body().querySelector('.fr-next').disabled, false);
  next();
  assert.equal(fr.state.view, 'results');
  const heads = body().querySelector('.fr-q').textContent;
  assert.match(heads, /3 scenarios fit about equally/);
  const cards = [...body().querySelectorAll('.fr-card[data-s="best"], .fr-card[data-s="tie"]')].map((c) => c.dataset.f);
  assert.deepEqual(cards.sort(), ['mixpvt', 'presin', 'pvt']);
  assert.match(body().textContent, /Cannot explain/);
  assert.match(body().textContent, /Next reading to take/);
  assert.match(body().textContent, /Model scenarios, not diagnoses\. Saved on this device only\./);
  assert.match(body().textContent, /Ruled out by your readings/);
  assert.ok([...body().querySelectorAll('.fr-mark')].every((m) => m.dataset.m), 'every entered reading has its mark');
});

test('Open as patient hands over the family, its settings and only the readings that were entered', async () => {
  const card = body().querySelector('.fr-card[data-f="presin"]');
  card.querySelector('.fr-acts button').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].f, 'presin');
  assert.deepEqual(Object.keys(opened[0].r).sort(), ['asc', 'fhvp', 'lsm', 'plt', 'ppg', 'spleen', 'ssm', 'whvp']);
  assert.equal(opened[0].r.asc, 0);
  assert.ok(opened[0].p.pre > 0 && opened[0].p.sin > 0);
});

test('a reading that is made from two others is left out and said so; unknown readings are never passed on', () => {
  reset();
  openFresh();
  type('whvp', '8'); type('fhvp', '4.5'); type('hvpg', '3.5'); next();
  type('lsm', '6.5'); next(); type('plt', '78'); next(); next();
  assert.equal(fr.state.view, 'results');
  assert.match(body().textContent, /Left out: HVPG/);
  assert.ok(!('ra' in fr.remote.peek(fr.state.raw && Object.fromEntries(Object.entries(fr.state.raw).map(([k, v]) => [k, Number(v)]))).readings));
});

test('fewer than four readings gives no scenarios and says how many are needed', () => {
  reset();
  openFresh();
  type('whvp', '8'); type('fhvp', '4.5'); next(); next(); next();
  assert.equal(body().querySelector('.fr-next').disabled, true);
  fr.state.view = 'results'; openFresh();
  assert.match(body().textContent, /Not enough readings yet/);
  assert.equal(body().querySelectorAll('.fr-card').length, 0);
  closePopover();
});
