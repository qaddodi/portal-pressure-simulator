// The gallery's test controls (src/ui/gallery/api.js, readers.js): the address parser, open/settled/check/words/boxes on a fake page, the root attribute,
// the sweep hand-over and its published result; the two readers run from their source text over a jsdom page, as the scripts run them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { parseSweepAddress, createGalleryApi, publishResult, probeBusy, errorTotal, STATE_ATTR, SWEEP_ATTR, RESULT_ID } from '../src/ui/gallery/api.js';
import { readWords, readBoxes } from '../src/ui/gallery/readers.js';
import { inPageSource } from '../scripts/fit-io.mjs';

const LOOKS = ['light', 'soft', 'dark', 'navy', 'black'];

test('the sweep address names what to run, the looks and what to record', () => {
  assert.equal(parseSweepAddress('?gallery'), null);
  assert.deepEqual(parseSweepAddress('?gallery&sweep'), { all: true, looks: [], with: ['check'], fresh: false });
  assert.deepEqual(parseSweepAddress('?gallery&sweep=all&looks=light,navy,neon&with=check,words,nope&fresh=1', LOOKS), { all: true, looks: ['light', 'navy'], with: ['check', 'words'], fresh: true });
  assert.equal(parseSweepAddress('?gallery&sweep=affected').affected, true);
  assert.deepEqual(parseSweepAddress('?gallery&sweep=ids:doppler/pv-color,tiles/a').ids, ['doppler/pv-color', 'tiles/a']);
  assert.equal(parseSweepAddress('?gallery&sweep=doppler').family, 'doppler');
  assert.deepEqual(parseSweepAddress('?gallery&sweep=all&with=').with, ['check']);
});

// A fake page: a catalog, a clock that moves only when the API sleeps, and a busy flag the test controls.
function fake(over = {}) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document;
  let t = 0, look = 'light', openId = null, busyUntil = 0;
  const entries = [
    { id: 'doppler/a', section: 'Teaching cards', family: 'doppler', kind: 'slide', title: 'A' },
    { id: 'doppler/b', section: 'Teaching cards', family: 'doppler', kind: 'slide', title: 'B' },
    { id: 'tiles/c', section: 'Teaching cards', family: 'tiles', kind: 'slide', title: 'C' },
    { id: 'pane/d', section: 'Tests card', family: 'pane', kind: 'pane', title: 'D' },
  ];
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  const calls = { go: [], looks: [] };
  const env = {
    doc, entries, byId, now: () => t, sleep: async (ms) => { t += ms; },
    go: async (id) => { calls.go.push(id); openId = id; busyUntil = t + (over.settleAfter ?? 1000); if (over.throws) throw new Error('boom'); },
    setLook: (id) => { look = id; calls.looks.push(id); }, look: () => look, id: () => openId,
    busy: () => t < busyUntil,
    check: () => ({ problems: [{ kind: 'small', text: 'x 10 px', line: 'small: x 10 px', el: {} }], busy: false, slide: true, structure: false }),
    words: () => ({ vw: 390, vh: 844, cards: { '.pz-text': ['Hi'] } }),
    boxes: () => ({ vw: 390, vh: 844, boxes: { '.pz-text': [0, 0, 10, 10] } }),
    size: () => ({ w: 390, h: 844 }),
    errors: () => 0,
    ...over.env,
  };
  return { api: createGalleryApi(env), doc, calls, tick: (ms) => { t += ms; }, env };
}

test('list filters by family, section and kind and returns plain rows', () => {
  const { api } = fake();
  assert.equal(api.list().length, 4);
  assert.deepEqual(api.list({ family: 'doppler' }).map((e) => e.id), ['doppler/a', 'doppler/b']);
  assert.deepEqual(api.list({ section: 'Tests card' }).map((e) => e.kind), ['pane']);
  assert.deepEqual(Object.keys(api.list()[0]).sort(), ['family', 'id', 'kind', 'section', 'title']);
  JSON.stringify(api.list());
});

test('open resolves once the specimen has landed, and the root says opening then settled', async () => {
  const { api, doc, calls } = fake();
  const p = api.open('doppler/a', { look: 'navy' });
  assert.equal(doc.documentElement.getAttribute(STATE_ATTR), 'opening');
  const r = await p;
  assert.deepEqual(calls.go, ['doppler/a']);
  assert.deepEqual(calls.looks, ['navy']);
  assert.equal(r.ok, true); assert.equal(r.settled, true); assert.equal(r.look, 'navy'); assert.equal(r.errors, 0);
  assert.ok(r.ms >= 1300, `waits out the 1000 ms of motion and the 300 ms quiet window (${r.ms})`);
  assert.equal(doc.documentElement.getAttribute(STATE_ATTR), 'settled');
  assert.equal(doc.documentElement.getAttribute('data-gallery-id'), 'doppler/a');
});

test('open names a specimen that is not in the catalog, a throw, and a timeout as failed', async () => {
  let f = fake();
  let r = await f.api.open('nope/x');
  assert.equal(r.ok, false); assert.match(r.error, /no specimen/);
  assert.equal(f.doc.documentElement.getAttribute(STATE_ATTR), 'failed');
  f = fake({ throws: true });
  r = await f.api.open('doppler/a');
  assert.equal(r.ok, false); assert.equal(r.error, 'boom');
  f = fake({ settleAfter: 99999 });
  r = await f.api.open('doppler/a', { timeoutMs: 2000 });
  assert.equal(r.ok, false); assert.equal(r.settled, false); assert.match(r.error, /settle/);
  assert.equal(f.doc.documentElement.getAttribute(STATE_ATTR), 'failed');
});

test('open counts the errors the app caught while the specimen opened', async () => {
  let n = 0;
  const { api } = fake({ env: { errors: () => n, go: async () => { n += 2; } } });
  assert.equal((await api.open('doppler/a')).errors, 2);
});

test('settled needs a quiet window: a busy blip restarts it', async () => {
  let blips = 0;
  const f = fake({ env: { busy: () => (++blips === 3) } });   // busy once, on the third ask
  const r = await f.api.settled({ quietMs: 300, pollMs: 100 });
  assert.equal(r.settled, true);
  assert.ok(r.ms >= 600, `the blip restarted the window (${r.ms})`);
});

test('check, words and boxes are plain JSON for the open specimen, with no element in them', async () => {
  const { api } = fake();
  await api.open('tiles/c');
  const c = api.check();
  assert.equal(c.id, 'tiles/c'); assert.equal(c.look, 'light'); assert.deepEqual(c.size, { w: 390, h: 844 });
  assert.deepEqual(c.problems, [{ kind: 'small', text: 'x 10 px', line: 'small: x 10 px', where: undefined }]);
  assert.equal(JSON.stringify(c).includes('"el"'), false);
  assert.deepEqual(api.words(), { id: 'tiles/c', look: 'light', vw: 390, vh: 844, cards: { '.pz-text': ['Hi'] } });
  assert.deepEqual(api.boxes().boxes, { '.pz-text': [0, 0, 10, 10] });
});

test('sweep hands over to the registered runner with the spec and the API, and says so when none is registered', async () => {
  const { api } = fake();
  await assert.rejects(() => api.sweep({ all: true }), /no sweep runner/);
  let got;
  api.registerSweep(async (spec, a) => { got = [spec, a]; return { ok: true, total: 3 }; });
  assert.deepEqual(await api.sweep({ family: 'doppler' }), { ok: true, total: 3 });
  assert.deepEqual(got[0], { family: 'doppler' });
  assert.equal(got[1], api);
});

test('the sweep from the address publishes its report, or its failure, where a harness reads it', async () => {
  const f = fake();
  const win = {};
  assert.equal(await f.api.startFromAddress('?gallery', { win }), null);
  f.api.registerSweep(async (spec) => ({ ok: true, spec }));
  const rep = await f.api.startFromAddress('?gallery&sweep=doppler&looks=navy', { win, lookIds: LOOKS });
  assert.equal(rep.spec.family, 'doppler');
  assert.equal(win.ppsGalleryResult, rep);
  assert.equal(f.doc.documentElement.getAttribute(SWEEP_ATTR), 'done');
  assert.deepEqual(JSON.parse(f.doc.getElementById(RESULT_ID).textContent), rep);
  f.api.registerSweep(async () => { throw new Error('tab gone'); });
  const bad = await f.api.startFromAddress('?gallery&sweep=all', { win });
  assert.equal(bad.ok, false); assert.equal(bad.error, 'tab gone');
  assert.equal(f.doc.documentElement.getAttribute(SWEEP_ATTR), 'failed');
  assert.equal(f.doc.querySelectorAll(`#${RESULT_ID}`).length, 1, 'one result element, rewritten');
});

test('sweep=affected asks the page for the ids and passes them on', async () => {
  const f = fake({ env: { affected: async () => ['doppler/a'] } });
  f.api.registerSweep(async (spec) => ({ ok: true, spec }));
  const rep = await f.api.startFromAddress('?gallery&sweep=affected', { win: {} });
  assert.deepEqual(rep.spec.ids, ['doppler/a']);
  assert.equal(rep.spec.affected, true);
});

test('probeBusy asks the presenter, the camera, the cards and the animations; errorTotal sums the counted errors', () => {
  const dom = new JSDOM('<!doctype html><body><div class="pz"></div></body>');
  const doc = dom.window.document;
  assert.equal(probeBusy({}, doc), false);
  assert.equal(probeBusy({ presenter: { busy: () => true } }, doc), true);
  assert.equal(probeBusy({ stage: { viewChanging: () => true } }, doc), true);
  assert.equal(probeBusy({ stage: { gliding: () => true } }, doc), true);
  doc.querySelector('.pz').classList.add('pz-prep');
  assert.equal(probeBusy({}, doc), true);
  doc.querySelector('.pz').classList.remove('pz-prep');
  doc.body.insertAdjacentHTML('beforeend', '<section class="pz-data" aria-busy="true"></section>');
  assert.equal(probeBusy({}, doc), true);
  const fin = { playState: 'running', effect: { getTiming: () => ({ iterations: 1 }), target: null } }, loop = { playState: 'running', effect: { getTiming: () => ({ iterations: Infinity }), target: null } };
  const calm = new JSDOM('<!doctype html><body></body>').window.document;
  assert.equal(probeBusy({}, calm, () => [loop]), false, 'a loop that never ends is not motion to wait for');
  assert.equal(probeBusy({}, calm, () => [fin]), true, 'a running animation that will end is');
  assert.equal(errorTotal({ caught: () => ({ a: { n: 2 }, b: { n: 3 } }) }), 5);
  assert.equal(errorTotal({}), 0);
});

test('publishResult writes the report once and keeps one element', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const win = {};
  publishResult({ a: 1 }, { doc: dom.window.document, win, state: 'running' });
  publishResult({ a: 2 }, { doc: dom.window.document, win });
  assert.deepEqual(win.ppsGalleryResult, { a: 2 });
  assert.equal(dom.window.document.querySelectorAll('pre').length, 1);
});

// ── The readers, from their source text (a reader that reached outside its own body fails with a ReferenceError) ──
function page(html, { vw = 390, vh = 844 } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="app">${html}</div></body>`);
  const win = dom.window, doc = win.document;
  const DEFAULTS = { display: 'block', visibility: 'visible', opacity: '1' };
  const style = (el) => { const o = { ...DEFAULTS }; for (const d of (el.getAttribute('style') || '').split(';')) { const [k, v] = d.split(':'); if (k && v) o[k.trim()] = v.trim(); } return o; };
  const rect = (el) => { const [l, t, r, b] = (el.dataset.box || '0,0,0,0').split(',').map(Number); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
  const io = { box: rect, rects: (el) => [rect(el)], style, metric: (el, k) => (el === win ? { innerWidth: vw, innerHeight: vh }[k] : 0), ctm: () => null };
  const sandbox = { window: win, document: doc, Map, Math };
  return { doc, run: (fn, ...a) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${fn.toString()})`, sandbox)(io, ...a))) };   // (JSON: the reader's arrays belong to another realm)
}

test('readWords lists the words of each card that is up, in order, leaving out hidden and screen-reader-only words', () => {
  const p = page(`<section class="pz-text" data-box="0,0,300,300"><h1>Portal  vein</h1><p>Flow <b>toward</b> the liver.</p><span class="sr-only">hidden from view</span><i style="display:none">no</i><i style="opacity:0">faded</i></section>
    <section class="pz-data" data-box="0,300,300,600"><span>PPG (PV − IVC)</span><span> </span></section>
    <section class="pz-panel" hidden><span>parked</span></section>`);
  const r = p.run(readWords);
  assert.deepEqual(r, { vw: 390, vh: 844, cards: { '.pz-text': ['Portal vein', 'Flow toward the liver.'], '.pz-data': ['PPG (PV − IVC)'] } });
  assert.deepEqual(p.run(readWords, { roots: ['.pz-data'] }).cards, { '.pz-data': ['PPG (PV − IVC)'] });
});

test('readBoxes rounds each card to 2 px and leaves out a card that is not up', () => {
  const p = page(`<section class="pz-text" data-box="11,41,379,301"></section><section class="pz-data" data-box="0,0,0,0"></section><div id="dock" hidden data-box="0,0,10,10"></div>
    <section class="action-card" style="display:none" data-box="0,0,10,10"></section><div class="toast" data-box="20.9,700.2,300.4,760.6"></div>`);
  assert.deepEqual(p.run(readBoxes), { vw: 390, vh: 844, boxes: { '.pz-text': [12, 42, 380, 302], '.toast': [20, 700, 300, 760] } });
  assert.equal(p.run(readBoxes, { roots: ['.pz-text'] }).boxes['.toast'], undefined);
});

test('the two readers are self-contained functions the scripts can send into a page', () => {
  for (const fn of [readWords, readBoxes]) {
    const src = fn.toString();
    assert.match(src, /^function /);
    assert.ok(!/\bWORD_ROOTS\b/.test(src), `${fn.name} names no module constant`);
    assert.match(inPageSource(fn, {}), new RegExp(`^\\(\\(io\\) => \\(function ${fn.name}`));
  }
});
