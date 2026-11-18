// The gallery Sweep (src/ui/gallery/sweep.js, sweep-api.js, sweep-panel.js): which specimens a spec names, the opens it makes, the report it builds,
// and the resume after the browser ends the tab. Runs with a fake gallery API and a fake storage: no page, no layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.SVGElement = dom.window.SVGElement;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'addEventListener']) globalThis[k] ??= dom.window[k]?.bind ? dom.window[k].bind(dom.window) : dom.window[k];
globalThis.Element = dom.window.Element;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);

const { runSweep, resolveIds, planJobs, buildReport, savedSweep, forgetSweep, SWEEP_KEY, MAX_KILLS } = await import('../src/ui/gallery/sweep.js');
const { localApi, devicePps } = await import('../src/ui/gallery/sweep-api.js');
const { linkIds, scopeChoices } = await import('../src/ui/gallery/sweep-panel.js');
const { CATALOG } = await import('../src/ui/gallery/catalog.js');

const LIST = [
  { id: 'doppler/a', section: 'Teaching cards', family: 'doppler', kind: 'slide', title: 'A' },
  { id: 'doppler/b', section: 'Teaching cards', family: 'doppler', kind: 'slide', title: 'B' },
  { id: 'trace/c', section: 'Teaching cards', family: 'trace', kind: 'slide', title: 'C' },
  { id: 'tests-hvpg/d', section: 'Tests card', family: 'tests-hvpg', kind: 'pane', title: 'D' },
];
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const fakeApi = ({ problems = {}, fail = {}, unsettled = {}, seen = [], die = null } = {}) => {
  let id = null, look = null;
  return {
    list: (f = {}) => LIST.filter((e) => (!f.family || e.family === f.family)),
    async open(i, o = {}) {
      seen.push(`${i}@${o.look || '-'}`);
      if (die === i) throw new Error('boom');
      id = i; look = o.look || null;
      if (fail[i]) return { id: i, ok: false, settled: false, ms: 5, error: fail[i] };
      return { id: i, ok: true, settled: !unsettled[i], ms: 120 };
    },
    check: () => ({ id, look, size: { w: 390, h: 844 }, problems: problems[id] || [], busy: false, slide: true, structure: false }),
  };
};
const env = (o = {}) => ({ storage: store(), now: (() => { let t = 0; return () => (t += 10); })(), when: 'now', ...o });

test('a spec names its specimens: ids, family, section, kind; unknown ids are reported apart', () => {
  assert.deepEqual(resolveIds({ ids: ['doppler/b', 'nope', 'doppler/b'] }, LIST), { ids: ['doppler/b'], unknown: ['nope'] });
  assert.deepEqual(resolveIds({ family: 'doppler' }, LIST).ids, ['doppler/a', 'doppler/b']);
  assert.deepEqual(resolveIds({ section: 'Tests card' }, LIST).ids, ['tests-hvpg/d']);
  assert.deepEqual(resolveIds({ kind: 'slide', family: 'trace' }, LIST).ids, ['trace/c']);
  assert.equal(resolveIds({}, LIST).ids.length, 4);
});

test('jobs are specimens times looks, the page look when none is named', () => {
  assert.deepEqual(planJobs(['a', 'b'], []), [{ id: 'a', look: null }, { id: 'b', look: null }]);
  assert.deepEqual(planJobs(['a'], ['light', 'navy']), [{ id: 'a', look: 'light' }, { id: 'a', look: 'navy' }]);
});

test('a sweep opens each specimen in each look, checks it, and reports problems, failures and unsettled ones', async () => {
  const seen = [];
  const api = fakeApi({ seen, problems: { 'doppler/b': [{ kind: 'small', text: 'a label is 10 px', where: 'slide' }] }, fail: { 'trace/c': 'No opener' }, unsettled: { 'tests-hvpg/d': true } });
  const r = await runSweep({ looks: ['light', 'navy'] }, api, env());
  assert.equal(seen.length, 8);
  assert.deepEqual(seen.slice(0, 3), ['doppler/a@light', 'doppler/a@navy', 'doppler/b@light']);
  assert.equal(r.summary.opens, 8);
  assert.equal(r.summary.withProblems, 2);
  assert.equal(r.summary.problems, 2);
  assert.equal(r.summary.failed, 2);
  assert.equal(r.summary.unsettled, 2);
  assert.match(r.text, /Did not open:\n {2}- trace\/c \[light\]: No opener/);
  assert.match(r.text, /Fit problems:\ndoppler\/b \[light\]\n {2}- \[slide\] small: a label is 10 px/);
  assert.match(r.text, /Did not settle in time/);
});

test('a clean sweep says so and counts nothing as a problem', async () => {
  const r = await runSweep({ family: 'doppler' }, fakeApi(), env());
  assert.equal(r.summary.clean, 2);
  assert.match(r.text, /Every card fits on all 2 opens: no problems, no errors, every specimen settled\./);
  assert.ok(!/Fit problems:/.test(r.text));
});

test('a specimen that throws is a result with its reason, and the sweep goes on', async () => {
  const r = await runSweep({}, fakeApi({ die: 'doppler/b' }), env());
  assert.equal(r.results.length, 4);
  const b = r.results.find((x) => x.id === 'doppler/b');
  assert.equal(b.ok, false); assert.equal(b.error, 'boom');
});

test('errors counted by the app while a specimen was open are named with it', async () => {
  let n = 0;
  const api = fakeApi();
  const open = api.open;
  api.open = async (i, o) => { if (i === 'trace/c') n += 2; return open(i, o); };
  const r = await runSweep({}, api, env({ probes: { errors: () => n, gpuMB: () => 180, peakMB: () => 230 } }));
  assert.equal(r.summary.errors, 2);
  assert.equal(r.results.find((x) => x.id === 'trace/c').errors, 2);
  assert.match(r.text, /Errors counted while open[^]*trace\/c: 2/);
  assert.match(r.text, /GPU memory: peak 230 MB/);
});

test('frame times and the slowest frame come from the frame recorder, per specimen', async () => {
  const stops = [{ gaps: [16, 90], scripts: [3], long: [{}] }, { gaps: [16], scripts: [2], long: [] }];
  let k = 0;
  const r = await runSweep({ ids: ['doppler/a', 'doppler/b'] }, fakeApi(), env({ probes: { framesStart() {}, framesStop: () => stops[k++] } }));
  assert.equal(r.results[0].worstFrameMs, 90);
  assert.equal(r.results[0].longFrames, 1);
  assert.deepEqual(r.summary.slowestFrame, { id: 'doppler/a', look: null, ms: 90 });
  assert.match(r.text, /Slowest frame: 90 ms at doppler\/a/);
});

test('the place is kept after every specimen, and a reload carries on from the next one', async () => {
  const storage = store();
  const seen1 = [];
  // The first run is killed while doppler/b is open: the page goes away, so nothing after open() runs. (Simulated by never resolving it and reading the storage.)
  const api1 = fakeApi({ seen: seen1 });
  let release;
  const open1 = api1.open;
  api1.open = (i, o) => (i === 'doppler/b' ? new Promise((ok) => { release = () => ok(open1(i, o)); }) : open1(i, o));
  const run1 = runSweep({}, api1, env({ storage }));
  for (let i = 0; i < 20 && !release; i++) await new Promise((r) => setTimeout(r, 0));
  const saved = savedSweep(storage);
  assert.equal(saved.state, 'running');
  assert.equal(saved.open, 'doppler/b@-');
  assert.deepEqual(saved.results.map((x) => x.id), ['doppler/a']);
  // The reload: a new runSweep with the same spec resumes.
  const seen2 = [];
  const r = await runSweep(saved.spec, fakeApi({ seen: seen2 }), env({ storage }));
  assert.deepEqual(seen2, ['trace/c@-', 'tests-hvpg/d@-']);
  assert.equal(r.resumed, true);
  assert.equal(r.results.length, 4);
  const lost = r.results.find((x) => x.lost);
  assert.equal(lost.id, 'doppler/b');
  assert.match(r.text, /Lost to a reload \(open when the tab was ended\):\n {2}- doppler\/b/);
  assert.equal(r.summary.lost, 1);
  assert.equal(savedSweep(storage), null, 'a finished sweep is not resumed again');
  release?.(); await run1.catch(() => {});
});

test('fresh starts over; a different spec starts over; a stopped or finished sweep is not resumed', async () => {
  const storage = store();
  storage.setItem(SWEEP_KEY, JSON.stringify({ sig: 'x', state: 'running', results: [], kills: 0, wall: Date.now() }));
  const seen = [];
  await runSweep({ family: 'trace' }, fakeApi({ seen }), env({ storage }));
  assert.deepEqual(seen, ['trace/c@-']);
  let n = 0;
  const r = await runSweep({ family: 'doppler' }, fakeApi({ seen: [] }), env({ storage, shouldStop: () => n++ > 0 }));
  assert.equal(r.results.length, 1);
  assert.match(r.text, /Stopped early: 1 of 2 opens done\./);
  assert.equal(savedSweep(storage), null, 'a stopped sweep is not resumed');
  const again = []; await runSweep({ family: 'doppler' }, fakeApi({ seen: again }), env({ storage }));
  assert.equal(again.length, 2);
});

test('a specimen that keeps ending the tab stops the sweep after MAX_KILLS reloads, with the report so far', async () => {
  const storage = store();
  const sig = 'doppler/a@-|doppler/b@-';
  storage.setItem(SWEEP_KEY, JSON.stringify({ sig, state: 'running', spec: { family: 'doppler' }, results: [], kills: MAX_KILLS - 1, open: 'doppler/a@-', wall: Date.now() }));
  const seen = [];
  const r = await runSweep({ family: 'doppler' }, fakeApi({ seen }), env({ storage }));
  assert.equal(seen.length, 0);
  assert.equal(r.kills, MAX_KILLS);
  assert.match(r.text, /Stopped after 3 reloads/);
  assert.match(r.text, /Lost to a reload[^]*doppler\/a/);
});

test('savedSweep ignores a sweep that is not running or is a day old, and forgetSweep clears it', () => {
  const s = store();
  assert.equal(savedSweep(s), null);
  s.setItem(SWEEP_KEY, JSON.stringify({ state: 'done', wall: Date.now() })); assert.equal(savedSweep(s), null);
  s.setItem(SWEEP_KEY, JSON.stringify({ state: 'running', wall: Date.now() - 86400000 })); assert.equal(savedSweep(s), null);
  s.setItem(SWEEP_KEY, JSON.stringify({ state: 'running', wall: Date.now() })); assert.equal(savedSweep(s).state, 'running');
  forgetSweep(s); assert.equal(savedSweep(s), null);
});

test('a storage that refuses writes does not stop the sweep', async () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() {} };
  const r = await runSweep({ family: 'trace' }, fakeApi(), env({ storage: bad }));
  assert.equal(r.summary.opens, 1);
});

test('the report names ids that are not in the catalog and keeps the verdict honest when anything failed', () => {
  const rep = buildReport({ spec: {}, results: [{ id: 'a', look: null, ok: true, settled: true, problems: [], ms: 1 }, { id: 'b', look: null, ok: false, error: 'No opener', problems: [], ms: 1 }], jobs: [1, 2], unknown: ['zzz'] });
  assert.match(rep.text, /Not in the catalog: zzz/);
  assert.ok(!/Every card fits/.test(rep.text));
});

test('the link names its specimens: ?ids=a,b or ?sweep=ids:a,b', () => {
  assert.deepEqual(linkIds('?gallery&ids=doppler/a,doppler/b,doppler/a'), ['doppler/a', 'doppler/b']);
  assert.deepEqual(linkIds('?gallery&sweep=ids:trace/c,tests-hvpg/d&fresh=1'), ['trace/c', 'tests-hvpg/d']);
  assert.deepEqual(linkIds('?gallery&sweep=all'), []);
  assert.deepEqual(linkIds(''), []);
});

test('the scope menu offers the link first, then everything, each section and each family', () => {
  const c = scopeChoices(LIST, ['doppler/a']);
  assert.deepEqual(c.map((x) => x.value), ['ids', 'all', 'section:Teaching cards', 'section:Tests card', 'family:doppler', 'family:trace', 'family:tests-hvpg']);
  assert.deepEqual(c[0].spec, { ids: ['doppler/a'] });
  assert.equal(scopeChoices(LIST).some((x) => x.value === 'ids'), false);
  assert.match(c[1].label, /Every specimen \(4\)/);
  assert.equal(scopeChoices(CATALOG).find((x) => x.value === 'all').spec && true, true);
});

test('the local API (used when pps.gallery is absent) lists, opens through the page and checks with the shared rules', async () => {
  const calls = [];
  let look = 'light';
  const ctx = {
    catalog: { CATALOG },
    pps: { presenter: { busy: () => false }, stage: { viewChanging: () => false } },
    look: () => look, setLook: (l) => { look = l; calls.push(`look:${l}`); },
    go: async (id, o) => { calls.push(`go:${id}:${o?.quiet}`); },
  };
  const IO = { box: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }), rects: () => [], style: () => ({}), metric: (el, k) => ({ innerWidth: 390, innerHeight: 844 }[k]), ctm: () => null };
  const api = localApi(ctx, IO, { poll: 1 });
  assert.equal(api.list({}).length, CATALOG.length);
  assert.ok(api.list({ family: 'doppler' }).every((e) => e.family === 'doppler'));
  const o = await api.open('doppler/pv-color', { look: 'navy' });
  assert.equal(o.ok, true); assert.equal(o.settled, true);
  assert.deepEqual(calls, ['look:navy', 'go:doppler/pv-color:true']);
  const c = api.check();
  assert.equal(c.id, 'doppler/pv-color'); assert.deepEqual(c.size, { w: 390, h: 844 }); assert.ok(Array.isArray(c.problems));
});

test('the local API reports a specimen that cannot open, and a page that never settles', async () => {
  const ctx = { catalog: { CATALOG }, pps: { presenter: { busy: () => true } }, look: () => 'light', setLook() {}, go: async () => { throw new Error('no opener'); } };
  const api = localApi(ctx, {}, { poll: 1 });
  const bad = await api.open('doppler/pv-color', {});
  assert.equal(bad.ok, false); assert.match(bad.error, /no opener/);
  ctx.go = async () => {};
  const slow = await api.open('doppler/pv-color', { timeoutMs: 20 });
  assert.equal(slow.ok, true); assert.equal(slow.settled, false);
});

test('the device probes tolerate a page with none of them', () => {
  const p = devicePps({});
  assert.equal(p.errors(), 0); assert.equal(p.gpuMB(), null); assert.equal(p.framesStop(), null);
  const q = devicePps({ caught: () => ({ a: { n: 2 }, b: { n: 3 } }), budget: { memoryMB: () => 12.345, peakMB: () => 20 } });
  assert.equal(q.errors(), 5); assert.equal(q.gpuMB(), 12.3); assert.equal(q.peakMB(), 20);
});
