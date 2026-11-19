// The deck sweep (scripts/deck-sweep.mjs, deck-sweep-lib.mjs) and the pieces it stands on: the edge rules (src/ui/gallery/edge-rules.js) judged from plain numbers,
// the gallery API's slide() and shuffleTo(), the chunks of work, the summary. Node only, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { judgeEdges, readEdges } from '../src/ui/gallery/edge-rules.js';
import { createGalleryApi } from '../src/ui/gallery/api.js';
import { chunksFor, shardChunks, mergeReports, parseSlides, slideProblems, summarize } from '../scripts/deck-sweep-lib.mjs';

const card = (q, over = {}) => ({ q, behind: false, box: [24, 54, 336, 366], vis: [24, 54, 336, 366], leaves: [], ...over });
const leaf = (t, b, over = {}) => ({ t, b, n: 'p.line', ...over });
const read = (cards, over = {}) => ({ vw: 844, vh: 390, shuf: true, front: 'words', cards, ...over });

test('words that end inside the card and the screen are clean', () => {
  assert.deepEqual(judgeEdges(read([card('.pz-text', { leaves: [leaf('fine', [30, 60, 300, 360])] })])), []);
});

test('the last line below the card is cut off, and below the screen is off', () => {
  const out = judgeEdges(read([card('.pz-text', { leaves: [leaf('The free hepatic vein pressure', [24, 178, 336, 394])] })]));
  assert.ok(out.some((l) => /^cutoff: pz-text: .*ends 28 px below the card's visible edge/.test(l)), out.join('\n'));
  assert.ok(out.some((l) => /^off: pz-text: .*past the screen 844 x 390/.test(l)), out.join('\n'));
});

test('words standing outside their glass have no backing', () => {
  const out = judgeEdges(read([card('.pz-text', { shade: [24, 54, 336, 300], leaves: [leaf('low words', [30, 280, 300, 340])] })]));
  assert.ok(out.some((l) => /^nobacking: /.test(l)), out.join('\n'));
});

test('words cut by a box that clips are named with that box', () => {
  const out = judgeEdges(read([card('.pz-text', { leaves: [leaf('half line', [30, 100, 300, 130], { clipBy: [30, 90, 300, 120, 'div.fold'] })] })]));
  assert.ok(out.some((l) => /^cutby: .*div\.fold/.test(l)), out.join('\n'));
});

test('the card behind shows a strip: a line across its edge is a stray, a line wholly inside or outside is not', () => {
  const behind = (lines) => read([card('.pz-text', { behind: true, vis: [24, 10, 336, 40], leaves: [leaf('title', [24, 30, 300, 80], { lines })] })]);
  assert.ok(judgeEdges(behind([[24, 63]])).some((l) => /^stray: /.test(l)));
  assert.deepEqual(judgeEdges(behind([[12, 36]])), [], 'a line inside the strip');
  assert.deepEqual(judgeEdges(behind([[46, 63]])), [], 'a line below the strip is hidden, not half drawn');
  assert.deepEqual(judgeEdges(behind([[39, 41]])), [], 'a sliver is not a line');
});

test('the same finding is told once', () => {
  const c = card('.pz-text', { leaves: [leaf('x', [30, 340, 300, 380]), leaf('x', [30, 340, 300, 380])] });
  const out = judgeEdges(read([c]));
  assert.equal(out.length, new Set(out).size);
});

// The page reader, on a jsdom page whose boxes are given.
test('readEdges reads the visible edge from the clip-path inset, the shuffle state and the lines of the card behind', () => {
  const dom = new JSDOM('<!doctype html><div class="pz pz-shuf"><section class="pz-text" id="t"><p id="a">Hello <b id="b">there</b></p></section><section class="pz-data" id="d"><h3 id="h">Title</h3></section></div>');
  const { document } = dom.window;
  globalThis.window = dom.window; globalThis.document = document;
  try {
    const boxes = { t: [24, 54, 336, 366], a: [30, 60, 300, 120], b: [80, 60, 130, 77], d: [24, 10, 336, 197], h: [30, 14, 300, 44] };
    const styles = { t: { clipPath: 'inset(-40px round 18px)' }, d: { clipPath: 'inset(0px 0px 171px round 18px)' } };
    const io = {
      box: (el) => { const [l, t, r, b] = boxes[el.id]; return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; },
      style: (el) => ({ display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible', textOverflow: 'clip', clipPath: 'none', ...(styles[el.id] || {}) }),
      metric: (el, k) => (el === dom.window ? (k === 'innerWidth' ? 844 : 390) : k === 'offsetWidth' ? (boxes[el.id]?.[2] - boxes[el.id]?.[0]) : 0),
      lines: (el) => [{ top: boxes[el.id][1], bottom: boxes[el.id][1] + 17 }],
    };
    const r = readEdges(io);
    assert.equal(r.shuf, true);
    assert.equal(r.front, 'words');
    const words = r.cards.find((c) => c.q === '.pz-text'), data = r.cards.find((c) => c.q === '.pz-data');
    assert.equal(words.behind, false);
    assert.equal(data.behind, true);
    assert.deepEqual(words.vis, [24, 54, 336, 366], 'a negative inset widens the clip: the card box stays its edge');
    assert.deepEqual(data.vis, [24, 10, 336, 26], 'the strip: the box narrowed by the inset (171 px off the bottom)');
    assert.ok(data.leaves[0].lines.length === 1, 'the behind card keeps each leaf\'s lines');
    assert.equal(words.leaves[0].lines, undefined);
  } finally { delete globalThis.window; delete globalThis.document; }
});

// The gallery API: a real deck's slide, and the shuffle.
function fakeApi(over = {}) {
  const dom = new JSDOM('<!doctype html><body></body>');
  let t = 0, at = null, busyUntil = 0;
  const calls = [];
  const presenter = {
    position: () => at, count: () => 11,
    go: (i) => { calls.push(['go', i]); at = { id: at.id, at: i }; busyUntil = t + 500; },
    start: async (id, i) => { calls.push(['start', id, i]); at = { id, at: i }; busyUntil = t + 800; },
    shuffle: () => over.shuffle,
  };
  const env = { doc: dom.window.document, entries: [], byId: {}, now: () => t, sleep: async (ms) => { t += ms; }, busy: () => t < busyUntil, look: () => 'light', errors: () => 0, pps: { presenter }, check: () => ({ problems: [] }), words: () => ({}), boxes: () => ({}), size: () => ({ w: 1, h: 1 }) };
  return { api: createGalleryApi(env), calls };
}

test('slide() starts the deck at the slide, then steps inside it, and says where it stands', async () => {
  const { api, calls } = fakeApi();
  const a = await api.slide('hvpg', 2);
  assert.deepEqual(calls[0], ['start', 'hvpg', 2]);
  assert.equal(a.ok, true);
  assert.equal(a.n, '3/11');
  await api.slide('hvpg', 3);
  assert.deepEqual(calls[1], ['go', 3]);
  await api.slide('ascites', 0);
  assert.deepEqual(calls[2], ['start', 'ascites', 0]);
});

test('shuffleTo() springs the shuffle only when one is on', async () => {
  const sent = [];
  const { api } = fakeApi({ shuffle: { active: () => true, go: (to) => sent.push(to) } });
  assert.deepEqual(await api.shuffleTo(1), { ok: true, settled: true });
  assert.deepEqual(sent, [1]);
  const none = fakeApi({ shuffle: { active: () => false, go: () => { throw new Error('no'); } } });
  assert.deepEqual(await none.api.shuffleTo(1), { ok: false, settled: false });
});

test('the work is cut into chunks of one size and some decks, balanced by slide count, one size after another', () => {
  const decks = [{ id: 'a', slides: Array(10) }, { id: 'b', slides: Array(9) }, { id: 'c', slides: Array(2) }, { id: 'd', slides: Array(1) }];
  const chunks = chunksFor(['mac', 'iphone'], decks, 2);
  assert.equal(chunks.length, 4);
  const each = (dev) => chunks.filter((c) => c.device === dev).flatMap((c) => c.decks.map((d) => d.id)).sort();
  assert.deepEqual(each('mac'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(each('iphone'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(chunks.map((c) => c.device), ['mac', 'mac', 'iphone', 'iphone'], 'device by device, in the order asked');
  assert.equal(chunksFor(['mac'], decks, 9).length, 4, 'never more parts than decks');
});

test('--slides takes numbers and ranges', () => {
  assert.equal(parseSlides(''), null);
  assert.deepEqual([...parseSlides('1,4-6')], [1, 4, 5, 6]);
});

test('a slide\'s findings come from the fit rules, the edge rules, the case card and the shuffle\'s other state, told once', () => {
  const edges = read([card('.pz-text', { leaves: [leaf('x', [24, 340, 336, 394])] })]);
  const r = { main: { check: { problems: [{ kind: 'small', text: 'li 10 px' }] }, edges }, held: { check: { problems: [] }, edges: read([]) }, back: { edges: read([card('.pz-text', { behind: true, vis: [24, 10, 336, 40], leaves: [leaf('t', [24, 30, 300, 80], { lines: [[24, 63]] })] })]) } };
  const lines = slideProblems(r, judgeEdges);
  assert.ok(lines.includes('small: li 10 px'));
  assert.ok(lines.some((l) => /^cutoff: /.test(l)));
  assert.ok(lines.some((l) => /^\[instrument in front\] stray: /.test(l)));
});

test('the summary counts by kind and size, lists what did not open, and names every finding', () => {
  const report = { decks: ['hvpg'], devices: ['iphone-landscape'], seconds: 12, results: {
    'hvpg#3@iphone-landscape': { deck: 'hvpg', slide: 3, device: 'iphone-landscape', ok: true, shuffle: true, problems: ['cutoff: pz-text: "x" ends 28 px below', '[instrument in front] stray: pz-text behind: "t"'] },
    'hvpg#4@iphone-landscape': { deck: 'hvpg', slide: 4, device: 'iphone-landscape', ok: false, error: 'did not settle in time', problems: [] },
  } };
  const text = summarize(report);
  assert.match(text, /2 slide visits/);
  assert.match(text, /1 did not open or settle, 1 slides with findings \(2 findings\)/);
  assert.match(text, /by kind: .*cutoff 1/);
  assert.match(text, /hvpg slide 4 on iphone-landscape: did not settle/);
  assert.match(text, /hvpg slide 3 \(shuffle\):/);
});

test('shares of the whole job cover every deck at every size exactly once, balanced', () => {
  const decks = Array.from({ length: 12 }, (_, k) => ({ id: `d${k}`, slides: Array(5 + (k % 5) * 3) }));
  const devices = ['mac', 'iphone', 'iphone-landscape'];
  const seen = new Map();
  const loads = [];
  for (let i = 1; i <= 5; i++) {
    let load = 0;
    for (const c of shardChunks(devices, decks, i, 5)) for (const d of c.decks) { const key = `${c.device}:${d.id}`; seen.set(key, (seen.get(key) || 0) + 1); load += d.slides.length; }
    loads.push(load);
  }
  assert.equal(seen.size, 36);
  assert.ok([...seen.values()].every((n) => n === 1), 'each piece in exactly one share');
  assert.ok(Math.max(...loads) - Math.min(...loads) <= 15, `balanced: ${loads}`);
});

test('shares merge into one report', () => {
  const a = { devices: ['mac'], decks: ['x'], fast: true, seconds: 5, results: { 'x#1@mac': { deck: 'x', slide: 1, device: 'mac', ok: true, problems: [] } } };
  const b = { devices: ['iphone'], decks: ['x', 'y'], fast: true, seconds: 9, results: { 'y#1@iphone': { deck: 'y', slide: 1, device: 'iphone', ok: true, problems: ['small: x'] } } };
  const m = mergeReports([a, b]);
  assert.deepEqual(m.devices.sort(), ['iphone', 'mac']);
  assert.deepEqual(m.decks.sort(), ['x', 'y']);
  assert.equal(Object.keys(m.results).length, 2);
  assert.equal(m.seconds, 9);
});
