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
const { LESION_IDS } = await import('../src/engine/inverse-families.js');

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
const reset = () => { fr.state.raw = {}; fr.state.step = 0; fr.state.view = 'steps'; fr.state.edit = false; fr.state.back = null; fr.state.open = new Set(); };
// (A sheet put away is still in the page for its exit: take it out, as the exit's timer does, so the next open is the only one.)
const openFresh = () => { closePopover(); for (const e of document.querySelectorAll('.fr-pop, .um-scrim')) e.remove(); fr.open(anchor); };

test('it opens on the pressures step with its rows, the count of all the mixes, a pill for each lesion and a skip', () => {
  reset();
  openFresh();
  assert.ok(root(), 'the sheet is in the page');
  assert.equal(STEPS.length, 4);
  assert.deepEqual([...body().querySelectorAll('input')].map((i) => i.dataset.k), ['whvp', 'fhvp', 'hvpg', 'pv', 'ppg', 'ivc', 'ra']);
  assert.equal(count(), LESION_IDS.length, 'nothing entered: every lesion still fits');
  assert.match(body().querySelector('.fr-count').textContent, /of 8 lesions still fit/);
  assert.equal(body().querySelector('input').placeholder, '–', 'a dash, not the word unknown (which the field clipped)');
  assert.equal(Object.keys(pills()).length, 8, 'a pill for each lesion');
  assert.ok(Object.values(pills()).every((s) => s === 'possible'));
  assert.match(body().querySelector('.fr-next').textContent, /skip/i, 'nothing entered: the one button skips');
  assert.match(body().textContent, /Model scenarios, not diagnoses/);
});

test('typing narrows the lesion types, a value that is not a number is said and not counted, and the HVPG is made from the two pressures', async () => {
  type('whvp', '21'); type('fhvp', '5');
  const hv = body().querySelector('input[data-k="hvpg"]');
  assert.equal(hv.value, '16.0', 'the HVPG field shows the derived value');
  assert.equal(hv.readOnly, true, 'and cannot be typed over');
  assert.match(hv.closest('.fr-row').textContent, /From WHVP − FHVP/);
  type('pv', '24'); type('ivc', '5'); type('ra', '3');
  assert.ok(Object.values(pills()).includes('out'), 'five pressures rule some lesion types out (the pills change at once)');
  await new Promise((r) => setTimeout(r, 200));   // (the count crossfades to its new number between frames)
  assert.ok(count() < LESION_IDS.length);
  assert.doesNotMatch(body().querySelector('.fr-next').textContent, /skip/i);
  // (The PPG is made from the portal vein and the IVC the same way, and a field made from two others lets go when one of them is cleared.)
  const ppg = body().querySelector('input[data-k="ppg"]');
  assert.equal(ppg.readOnly, true); assert.equal(ppg.value, '19.0');
  type('ivc', ''); assert.equal(ppg.readOnly, false); assert.equal(ppg.value, ''); type('ivc', '5');
  type('ra', 'abc');
  assert.match(body().querySelector('input[data-k="ra"]').closest('.fr-row').textContent, /number/i);
  type('ra', '');
});

test('every step can be skipped and the last one waits for enough readings', () => {
  reset();
  openFresh();
  for (let i = 0; i < 3; i++) { assert.match(body().querySelector('.fr-next').textContent, /skip/i, `step ${i + 1}`); next(); }
  assert.equal(fr.state.step, 3);
  assert.equal(body().querySelector('.fr-next').textContent, 'Review your readings');
  next();
  assert.equal(fr.state.view, 'review');
  assert.equal(body().querySelector('.fr-next').textContent, 'Show scenarios');
  assert.equal(body().querySelector('.fr-next').disabled, true, 'no readings: the search is not offered');
  assert.match(body().querySelector('.fr-need').textContent, /0 of the 2/);
});

test('a ranking from a presinusoidal patient: ties shown as ties, what each cannot explain, the next reading, the footer', () => {
  reset();
  openFresh();
  type('whvp', '8'); type('fhvp', '4.5'); type('ppg', '14'); next();
  type('lsm', '6.5'); type('ssm', '68'); next();
  type('spleen', '16'); type('plt', '78'); next();
  grade('Ascites', 'None');
  next();
  assert.equal(fr.state.view, 'review');
  assert.equal(body().querySelector('.fr-next').disabled, false);
  next();
  assert.equal(fr.state.view, 'results');
  const heads = body().querySelector('.fr-q').textContent;
  assert.match(heads, /\d+ scenarios fit about equally/);
  const cards = [...body().querySelectorAll('.fr-card[data-s="best"], .fr-card[data-s="tie"]')].map((c) => c.dataset.f);
  assert.ok(cards.includes('pvt') && cards.includes('presin') && !cards.includes('sinus+pvt'), 'the blocks before the sinusoids tie, and a clot on a liver with fibrosis is not needed for these readings: ' + cards);
  assert.match(body().querySelector('.fr-card .fr-rate').textContent, /^(\d+%|<1%|99%\+)$/, 'each row shows its share of the likelihood');
  assert.ok(body().querySelectorAll('.fr-card .fr-ch').length >= 2 && body().querySelector('.fr-card .fr-ch').getAttribute('aria-expanded') === 'false', 'rows are compact and closed');
  assert.ok(body().querySelector('.fr-card .fr-bar i') && body().querySelector('.fr-card .fr-why1').textContent.length > 0, 'a bar and one line of why');
  assert.equal(body().querySelectorAll('.fr-small').length, 1, 'the rating is explained once, not on every card');
  assert.ok(body().querySelectorAll('.fr-card .fr-set li').length >= 1, 'each card lists the exact settings');
  assert.ok(body().querySelectorAll('.fr-card .fr-back li').length > Object.keys(fr.state.raw).length, 'and the readings the model gives back beside the ones entered');
  assert.match(body().textContent, /Cannot explain/);
  assert.match(body().textContent, /Limits of the model/);
  assert.match(body().textContent, /Next reading to take/);
  assert.match(body().textContent, /Model scenarios, not diagnoses\. Saved on this device only\./);
  assert.match(body().textContent, /Ruled out by your readings: any mix with/, 'ruled out is said by lesion');
  assert.ok(body().querySelector('.fr-next-note').compareDocumentPosition(body().querySelector('.fr-list')) & 4, 'the next reading comes before the list');
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
  assert.ok(opened[0].p.presin >= 0.1 && opened[0].p.presin <= 1);
});

test('a reading that is made from two others is left out and said so; unknown readings are never passed on', () => {
  reset();
  openFresh();
  type('whvp', '8'); type('fhvp', '4.5'); type('hvpg', '3.5'); next();
  type('lsm', '6.5'); next(); type('plt', '78'); next(); next(); next();
  assert.equal(fr.state.view, 'results');
  assert.match(body().textContent, /Left out: HVPG/);
  assert.ok(!('ra' in fr.remote.peek(fr.state.raw && Object.fromEntries(Object.entries(fr.state.raw).map(([k, v]) => [k, Number(v)]))).readings));
});

test('one reading gives no scenarios and says how many are needed; two give a short list that says it is not a ranking', () => {
  reset();
  openFresh();
  type('whvp', '8'); next(); next(); next(); next();
  assert.equal(fr.state.view, 'review');
  assert.equal(body().querySelector('.fr-next').disabled, true);
  fr.state.view = 'results'; openFresh();
  assert.match(body().textContent, /Not enough readings yet/);
  assert.equal(body().querySelectorAll('.fr-card').length, 0);
  closePopover();
  reset();
  openFresh();
  type('whvp', '30'); type('fhvp', '24'); next(); next(); next(); next();
  assert.equal(body().querySelector('.fr-next').disabled, false, 'two readings are enough to search');
  next();
  assert.equal(fr.state.view, 'results');
  assert.match(body().querySelector('.fr-q').textContent, /short list from 2 readings/);
  assert.match(body().textContent, /not a ranking/);
  assert.ok(body().querySelectorAll('.fr-card').length >= 1, 'scenarios are shown, with the caution');
  closePopover();
});

test('the review lists the readings that were entered, names the rest as buttons that add them, and a tap on a reading opens its step to change it', () => {
  reset();
  openFresh();
  type('whvp', '8'); type('fhvp', '4.5'); next();
  type('lsm', '6,5'); next();
  next();
  grade('Ascites', 'Grade 1');
  next();
  assert.equal(fr.state.view, 'review');
  const rows = [...body().querySelectorAll('.fr-rv')];
  assert.deepEqual(rows.map((r) => r.dataset.k), ['whvp', 'fhvp', 'hvpg', 'lsm', 'asc'], 'only what was entered (and the HVPG made from two), in step order');
  const row = (k) => rows.find((r) => r.dataset.k === k);
  assert.equal(row('whvp').dataset.s, 'on');
  assert.match(row('whvp').textContent, /8.*mmHg/);
  assert.equal(row('hvpg').dataset.s, 'derived', 'the HVPG is shown, made from the two pressures');
  assert.match(row('hvpg').textContent, /3\.5/);
  assert.match(row('lsm').textContent, /6\.5/, 'a comma is read as a point');
  assert.match(row('asc').textContent, /Grade 1/);
  assert.equal(body().querySelectorAll('.fr-rg').length, 3, 'a step with nothing entered has no group');
  const miss = [...body().querySelectorAll('.fr-miss .fr-rc')].map((b) => b.dataset.k);
  assert.ok(miss.includes('ra') && miss.includes('varix') && !miss.includes('whvp') && !miss.includes('hvpg'), 'not entered: ' + miss);
  assert.match(body().textContent, /How readings are compared/);
  assert.match(body().querySelector('.fr-tol').textContent, /WHVP\s*±1\.5 mmHg/, 'the allowed errors are said once, here');
  assert.doesNotMatch(body().textContent, /allowed error ±/, 'and not on the entry rows');
  row('lsm').click();
  assert.equal(fr.state.view, 'steps');
  assert.equal(fr.state.step, 1, 'its own step');
  assert.equal(body().querySelector('.fr-next').textContent, 'Back to your readings');
  type('lsm', '9');
  next();
  assert.equal(fr.state.view, 'review');
  assert.match([...body().querySelectorAll('.fr-rv')].find((r) => r.dataset.k === 'lsm').textContent, /9/);
  body().querySelector('.fr-miss .fr-rc[data-k="ra"]').click();
  assert.equal(fr.state.step, 0, 'a reading not entered opens its step');
  closePopover();
});

test('graded readings print as grades in the Model column, and numbers carry their unit once, in the row name (review U2, U11)', () => {
  reset();
  openFresh();
  type('whvp', '14'); type('fhvp', '4'); next(); type('lsm', '24'); next(); type('spleen', '15'); grade('Esophageal varices', 'Small'); next();
  grade('Ascites', 'None'); next(); next();
  assert.equal(fr.state.view, 'results');
  const back = [...body().querySelectorAll('.fr-card[data-f="sinus"] .fr-back li:not(.fr-bh)')];
  assert.ok(back.length >= 5, 'the card gives back every entered reading');
  const v = back.find((li) => /Varices/.test(li.textContent)), a = back.find((li) => /Ascites/.test(li.textContent));
  assert.match(v.querySelector('b').textContent, /^(None|Small|Large)$/, 'varices are a grade, never raw millimetres: ' + v.textContent);
  assert.match(a.querySelector('b').textContent, /^(None|Grade [123])$/, 'ascites are a grade, never raw millilitres: ' + a.textContent);
  const w = back.find((li) => /^WHVP/.test(li.textContent));
  assert.match(w.querySelector('span').textContent, /WHVP \(mmHg\)/);
  assert.match(w.querySelector('b').textContent, /^\d+\.\d$/, 'the number alone, so the column never wraps');
  closePopover();
});

test('a row opens its card on a tap and the rest of the list stays; "Your readings" chips open their step and come back to the scenarios', () => {
  reset();
  openFresh();
  type('whvp', '14'); type('fhvp', '4'); next(); type('lsm', '24'); next(); next(); next(); next();
  assert.equal(fr.state.view, 'results');
  const first = body().querySelector('.fr-card'), id = first.dataset.f, box = first.querySelector('.fr-cb');
  assert.equal(box.classList.contains('on'), false);
  first.querySelector('.fr-ch').click();
  assert.equal(box.classList.contains('on'), true);
  assert.equal(first.querySelector('.fr-ch').getAttribute('aria-expanded'), 'true');
  assert.ok(fr.state.open.has(id), 'the open row is kept, so a rebuild when the fit is done keeps it open');
  body().querySelector('.fr-yr .fr-rc[data-k="lsm"]').click();
  assert.equal(fr.state.view, 'steps'); assert.equal(fr.state.step, 1);
  assert.equal(body().querySelector('.fr-next').textContent, 'Back to the scenarios');
  next();
  assert.equal(fr.state.view, 'results', 'a reading changed from the scenarios returns to them, not to the review');
  assert.ok(body().querySelector(`.fr-card[data-f="${id}"] .fr-cb`).classList.contains('on'));
  closePopover();
});
