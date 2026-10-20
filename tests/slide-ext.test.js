// The deck visuals packages' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): the merged registry has
// no name twice and none of the app's own, nothing a built-in deck produces changes (targets, glows, marks, steps), the
// worker's extra work never moves the slides' chain, and a package that throws loses only its own feature.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXT, PACKAGES, mergeExt, expandIds, stepExtra, markLabel, safe, guard, STEP_EXTRAS } from '../src/ui/slide-ext.js';
import { COLS } from '../src/ui/table-marks.js';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { createCore } from '../src/worker-core.js';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const PRESENTER = read('ui/presenter.js'), TOOLS = read('ui/presenter-tools.js');
const block = (src, open, close) => { const i = src.indexOf(open); assert.ok(i >= 0, open); return src.slice(i, src.indexOf(close, i)); };
const keys = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

// The app's own names, read from its source (the presenter does not load in Node).
const TG = block(PRESENTER, 'const TARGETS = {', '\n};\n');
const BUILT = {
  targets: new Set([...keys(TG, /^\s+'?([\w:-]+)'?: \{/gm), ...keys(TG, /node: '(\w+)'/g)]),
  organs: new Set(keys(block(PRESENTER, 'const ORGANS = new Set([', '])'), /'([\w-]+)'/g)),
  lenses: new Set(keys(block(PRESENTER, 'const LENS_KEY = {', '\n};'), /^ {2}(\w+): /gm)),
  visuals: new Set(keys(block(PRESENTER, 'const VISUALS = {', '\n  };'), /^ {4}(\w+): /gm)),
  tools: new Set([...keys(block(TOOLS, 'const TITLE = {', '\n};'), /^ {2}(\w+): /gm), 'talk', 'beats', 'trace']),
  columns: new Set(Object.keys(COLS)),
};
// Each built-in target's edges and tone, and the station tone each vessel takes from them (presenter EDGE_TONE).
const TG_ROWS = TG.split('\n').map((l) => l.match(/^\s+'?([\w:-]+)'?: \{(.*)\},?$/)).filter(Boolean)
  .map(([, k, body]) => ({ k, edges: keys(body.match(/edges: \[([^\]]*)\]/)?.[1] || '', /'(\w+)'/g), tone: body.match(/tone: '([^']+)'/)?.[1] }));
const COLLATERALS = keys(block(PRESENTER, "for (const e of ['C3'", ']) EDGE_TONE'), /'(\w+)'/g);
function edgeTone(rows) {
  const t = {};
  for (const r of rows) for (const e of r.edges) t[e] ||= r.tone;
  for (const e of COLLATERALS) t[e] ||= 'var';
  return t;
}

test('the presenter, its instruments and the worker read the registry', () => {
  assert.match(PRESENTER, /import \{ EXT, expandIds, stepExtra, markLabel, figureHooks, safe \} from '\.\/slide-ext\.js\?v=/);
  assert.match(TOOLS, /import \{ EXT, guard, safe \} from '\.\/slide-ext\.js\?v=/);
  assert.match(TOOLS, /import \{ talkTrace \} from '\.\/talk-trace\.js\?v=/);
  assert.deepEqual(Object.keys(PACKAGES), ['A', 'B', 'C', 'E', 'F', 'G']);
  for (const k of ['A', 'B', 'C', 'E', 'F', 'G']) assert.equal(typeof PACKAGES[k], 'object', `package ${k} exports its registry`);
  assert.ok(TG_ROWS.length > 30 && BUILT.lenses.has('origin') && BUILT.visuals.has('table') && BUILT.tools.has('doppler'), 'the built-in names were read');
});

test('no name is registered twice, and none is one of the app\'s own', () => {
  assert.deepEqual(EXT.clashes, []);
  for (const part of ['targets', 'lenses', 'visuals', 'tools', 'columns']) {
    for (const name of Object.keys(EXT[part])) assert.ok(!BUILT[part].has(name), `${part} "${name}" (package ${EXT.owner[part][name]}) is already the app's own`);
  }
  for (const id of EXT.organs) assert.ok(!BUILT.organs.has(id) && !BUILT.targets.has(id), `organ "${id}" is already the app's own`);
  for (const [k, t] of Object.entries(EXT.targets)) if (t.node) assert.ok(!BUILT.targets.has(t.node), `target ${k}: node ${t.node} already names a target`);
  for (const [name, ids] of Object.entries(EXT.sets)) assert.ok(Array.isArray(ids) && ids.length && !name.includes('@'), `set @${name}`);
  for (const [k, c] of Object.entries(EXT.columns)) assert.ok(typeof c.heading === 'string' && c.heading && typeof c.cell === 'function', `column ${k} has a heading and a cell`);
  for (const [k, t] of Object.entries(EXT.tools)) assert.ok(typeof t.make === 'function' && typeof t.title === 'function', `tool ${k} has make and title`);
});

test('merging finds a name two packages register and a part no one reads', () => {
  const m = mergeExt({ A: { targets: { stomach: { organ: 'stomach', tone: 'var', words: 'stomach' } }, organs: ['stomach'] }, B: { targets: { stomach: {} }, organs: ['stomach'], colums: {} } });
  assert.deepEqual(m.clashes, ['B: unknown part "colums"', 'targets "stomach": A and B', 'organs "stomach": A and B']);
  assert.equal(m.owner.targets.stomach, 'A', 'the first registration is kept');
  assert.deepEqual(m.organs, ['stomach']);
});

test('nothing a built-in deck produces changes: targets, glows, marks and steps', () => {
  const merged = edgeTone([...TG_ROWS, ...Object.values(EXT.targets).map((t) => ({ edges: t.edges || [], tone: t.tone }))]), built = edgeTone(TG_ROWS);
  const newNames = new Set([...Object.keys(EXT.targets), ...Object.values(EXT.targets).map((t) => t.node).filter(Boolean)]);
  for (const d of DECKS) for (const s of d.slides) {
    const at = `${d.id}/${s.id}`;
    if (!adopted(d, s, 'cols.wave')) assert.equal(stepExtra(s), null, `${at}: no extra work on a built-in slide`);
    if (s.glow) assert.equal(expandIds(s.glow), s.glow, `${at}: its glow is read as it is`);
    for (const m of s.marks || (s.mark ? [s.mark] : [])) {
      assert.equal(expandIds(m.edges), m.edges, `${at}: its mark's edges are read as they are`);
      assert.equal(markLabel(m.label, m, { slide: s, fp: null }), m.label, `${at}: its mark's label is drawn as it is`);
    }
    // Every name the slide points at keeps what it pointed at: no new target lights a word that lit nothing, and a vessel
    // glowed by hand keeps its colour.
    const named = [...(s.line || '').matchAll(/\[[^\]]+\]\(([\w:]+)\)/g)].map((m) => m[1]);
    const terms = !s.terms ? [] : Array.isArray(s.terms) ? s.terms : Object.values(s.terms);
    for (const k of [...named, ...terms, ...(s.tint || [])]) if (!BUILT.targets.has(k)) assert.ok(!newNames.has(k), `${at}: "${k}" would now light a package's target`);
    for (const g of s.glow || []) {
      const id = typeof g === 'string' ? g : g.id;
      if (BUILT.targets.has(id) || BUILT.organs.has(id)) continue;
      assert.ok(!newNames.has(id) && !EXT.organs.includes(id), `${at}: glow "${id}" would now be a package's target or organ`);
      assert.equal(merged[id], built[id], `${at}: glow "${id}" keeps its colour`);
    }
    if (s.lens) assert.ok(BUILT.lenses.has(s.lens), `${at}: lens ${s.lens}`);
    if (s.visual) assert.ok(BUILT.visuals.has(s.visual), `${at}: visual ${s.visual}`);
    if (s.tool && !adopted(d, s, `kind:${s.tool.kind}`)) assert.ok(BUILT.tools.has(s.tool.kind), `${at}: tool ${s.tool.kind}`);
  }
});

test('a set name stands for its ids in a glow and in a mark', () => {
  const sets = { portal: ['PV_TRUNK', 'SV_CONF'] };
  assert.deepEqual(expandIds(['@portal', 'C1a'], sets), ['PV_TRUNK', 'SV_CONF', 'C1a']);
  assert.deepEqual(expandIds([{ id: '@portal', soft: true }], sets), [{ id: 'PV_TRUNK', soft: true }, { id: 'SV_CONF', soft: true }]);
  assert.deepEqual(expandIds(['@none'], sets), [], 'an unknown set names nothing');
  const g = ['PV_TRUNK'];
  assert.equal(expandIds(g, sets), g);
});

test('a step asks only for the work the worker knows, and a package that throws loses only its own part', () => {
  const s = { id: 'x', title: 'X' }, err = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(stepExtra(s, [() => ({ explain: 'pv', params: { cirrhosis: 1 }, days: 30 })]), { explain: 'pv' }, 'never a change to the model');
    assert.deepEqual(stepExtra(s, [() => { throw new Error('boom'); }, () => ({ wave: 'PV_TRUNK' })]), { wave: 'PV_TRUNK' });
    assert.deepEqual(STEP_EXTRAS, ['explain', 'wave']);
    assert.equal(markLabel('PV', {}, {}, [() => { throw new Error('boom'); }, (l) => `${l} 12`]), 'PV 12');
    assert.equal(safe(() => { throw new Error('x'); }, 7, 'test'), 7);
    const inst = guard({ el: 1, update() { throw new Error('frame'); }, n: () => 3 }, 'test');
    assert.equal(inst.el, 1);
    assert.doesNotThrow(() => inst.update({}));
    assert.equal(inst.n(), 3);
    assert.equal(guard(null, 'x'), null);
  } finally { console.error = err; }
});

// The worker's 'sequence', with or without extra work on its steps.
async function run(steps) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return out;
}

test('the worker\'s extra work (explain, wave) runs beside the chain and never moves it', async () => {
  const plain = [{ preset: 'cirr-decomp' }, { params: { drugs: { carvedilol: true } } }, {}];
  const extra = [{ ...plain[0], explain: ['pv', 'hvpg'] }, { ...plain[1], wave: [{ vessel: 'PV_TRUNK', secs: 2 }, 'NOPE'] }, { explain: 'ppg', wave: 'RHV_IVC' }];
  const a = await run(plain), b = await run(extra);
  for (let i = 0; i < plain.length; i++) {
    assert.deepEqual(b[i].fp, a[i].fp, `step ${i}: the same fingerprint`);
    assert.deepEqual(b[i].params, a[i].params, `step ${i}: the same params`);
    assert.equal(a[i].extra, undefined, 'no extra work asked, none sent');
  }
  const ex = b[0].extra.explain;
  assert.deepEqual(Object.keys(ex), ['pv', 'hvpg']);
  assert.ok(Math.abs(ex.pv.current - b[0].fp.pv) < 0.5, `explain reads the slide's own state (${ex.pv.current} vs ${b[0].fp.pv})`);
  assert.ok(ex.pv.contributions.some((c) => /Cirrhosis/.test(c.label)), 'with its causes');
  const w = b[1].extra.wave;
  assert.deepEqual(Object.keys(w), ['PV_TRUNK'], 'an unknown vessel is left out');
  assert.equal(w.PV_TRUNK.t.length, 101, '2 s, a point every 20 ms');
  assert.ok(w.PV_TRUNK.v.every(Number.isFinite));
  assert.ok(Math.max(...b[2].extra.wave.RHV_IVC.v) - Math.min(...b[2].extra.wave.RHV_IVC.v) > 1, 'the hepatic vein pulses');
  assert.equal(b[2].extra.explain.ppg.metricId, 'ppg', 'an empty step\'s work is at the state before it');
});

test('the fingerprint carries the fluid balance: lymph capacity, overflow, take-back and net', async () => {
  const [healthy, decomp] = (await run([{ preset: 'healthy' }, { preset: 'cirr-decomp' }])).map((m) => m.fp);
  for (const f of [healthy, decomp]) {
    for (const k of ['lymphCap', 'lymphOver', 'lymphBack', 'lymphNet']) assert.ok(Number.isFinite(f[k]), k);
    assert.ok(Math.abs(f.lymphNet - (f.lymphOver - f.lymphBack)) < 1e-9, 'net is the overflow less the take-back');
  }
  assert.equal(healthy.lymphOver, 0, 'a healthy liver\'s lymph all drains');
  assert.ok(decomp.hepLymph + decomp.splLymph > decomp.lymphCap && decomp.lymphOver > 0, 'decompensated: more lymph than the lymphatics carry');
});
