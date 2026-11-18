// The blood's Streaks option is gone (Mohammad, 16 Nov 2026: "remove the option for streaks for blood and remove it from the code completely"). The chevrons are the
// only mark of moving blood. This test fails if the option, its saved choice, its shader, its modules or its feeds come back, and pins the saved-choice migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadBloodPref } from '../src/ui/blood-pref.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir, ok, out = []) => {
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${n}`, st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, ok, out); else if (ok(n)) out.push(rel);
  }
  return out;
};
// What the app ships and builds with: the source, the styles, the page and the scripts (not the tests, which name what must be gone, nor the historical docs).
const SHIPPED = [...walk('src', (n) => /\.(js|mjs|css|html)$/.test(n)), ...walk('styles', (n) => n.endsWith('.css')), ...walk('scripts', (n) => /\.(mjs|json)$/.test(n)), 'index.html', 'sw.js'];

// Names that only the streaks used: the shader function and its styles, their uniforms, the half-size pass, the baked tile, the moving-light feeds and the saved look.
const GONE = [
  'bloodAt\\(', 'bloodStyle', 'noiseT', 'lenOn', 'streakA', 'streakLen', 'halfL', 'halfOn', 'halfR', 'HALF_R', 'halfReady', 'halfCellsFor', 'laneSum', 'LANE_K', 'lnWb', 'lnWf', 'lnS',
  'dNoise', 'eNoise', 'pNoise', 'D_GLSL', 'E_GLSL', 'P_GLSL', 'TROUBLE_GLSL', 'troubleAt', 'createBloodTile', 'TILE_V_PER_ROW', 'STYLE_LEGACY', 'STYLE_D', 'STYLE_E', 'STYLE_P',
  'zoomA', 'zoomB', 'ZOOM_VS', '(?:void|function) zoomOut\\b', 'finishStreak', 'streakFS', 'streakP', 'streakCellP', 'tileGPU', 'tileNow', 'rMaxAll',
  'layers\\??\\.flow', 'layers: \\{ flow', 'ic-streaks', "'streaks'", 'Moving blood drawn along each vessel', 'pps\\.streaks',
];
// (pps.streaks is read once, to be dropped: blood-pref.js. Nothing else may name it.)
const ALLOWED = { 'pps\\.streaks': ['src/ui/blood-pref.js'] };

test('no streak code, name, uniform or saved choice remains in what the app ships', () => {
  const found = [];
  for (const file of SHIPPED) {
    const text = read(file);
    for (const g of GONE) {
      if ((ALLOWED[g] || []).includes(file)) continue;
      const m = text.match(new RegExp(`(?<![\\w$])${g}(?![\\w$])`));
      if (m) found.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(found, [], `streak code is back:\n${found.join('\n')}`);
});

test('the modules that only drew the streaks are deleted', () => {
  for (const f of ['src/ui/blood-tile.js', 'src/ui/blood-particles.js', 'src/ui/blood-trouble.js']) assert.ok(!existsSync(join(ROOT, f)), `${f} is back`);
  const left = walk('tests', (n) => /(blood-particles|blood-trouble|streak-length)/.test(n));
  assert.deepEqual(left, []);
});

test('the Blood menu offers chevrons only, with no Streaks row, icon or saved key', () => {
  const main = read('src/ui/main.js');
  const items = main.slice(main.indexOf('function bloodItems()'), main.indexOf('// Which stations are labelled'));
  assert.ok(items.includes("menuSection('Moving blood',"), 'the Moving blood section is there');
  assert.ok(!/streak/i.test(items), 'no streak wording in the Blood menu');
  assert.deepEqual([...items.matchAll(/toggle\(!!b\.(\w+), '(\w+)', '([^']+)'/g)].map((m) => [m[1], m[3]]), [['chevrons', 'Chevrons'], ['keyChevrons', 'Key chevrons only']]);
  assert.ok(!/streak/i.test(read('index.html')), 'the Blood chip names no streaks');
  assert.ok(!/streak/i.test(read('styles/icons.css')), 'no streaks icon rule');
  assert.ok(!/streak/i.test(main.slice(main.indexOf('function syncBloodBtn()'), main.indexOf('function injectDye('))), 'the Blood chip is lit by the chevrons alone');
});

test('the store has no flow layer and no blood look', async () => {
  const { store } = await import('../src/ui/store.js');
  const st = store.get();
  assert.ok(!('flow' in st.layers), `layers: ${Object.keys(st.layers)}`);
  assert.ok(!('look' in st.blood), `blood: ${Object.keys(st.blood)}`);
});

test('no compositor or lumen build carries the streak shader, its uniforms or the half-size pass', async () => {
  const gl = await import('../src/ui/veins-gl.js');
  const { tubeLumenFS } = await import('../src/ui/tube-lumen-glsl.js');
  const builds = { 'COMP_FS()': gl.COMP_FS(), 'COMP_FS(true)': gl.COMP_FS(true), 'COMP_FS(heads)': gl.COMP_FS(false, true), 'COMP_FS(tube)': gl.COMP_FS(false, false, 1), COMP_VS: gl.COMP_VS, COMP_CELL_VS: gl.COMP_CELL_VS };
  const K = { F_DIFFUSE: 1, F_EDGE: 2, F_SHADOW: 4, F_SPEC: 8, F_VEIL: 16, F_WHOLE: 32, F_SEL: 64, F_DOTTED: 128, F_NOCASE: 256, LIFT_EASE_MAX: 0.5, LIFT_EASE_SHARE: 0.5, LUMEN2: 0x8000, ROW2_BITS: 11, VEIL_K: 1, EDGE: '1.0', ENT_W: 8, N_SAMPLES: 64, MAX_TIERS: 20, S_OFF: 96 };
  try { builds.tubeLumenFS = tubeLumenFS({ ...K, PLAIN: 0 }); } catch { /* (the lumen shader needs the app's constants: its text is read from the source below) */ }
  const bad = /bloodAt|bloodStyle|noiseT|lenOn|halfL|halfOn|halfR|zoomA|zoomB|STREAK|LANE_K|lnWb|dNoise|eNoise|pNoise|troubleAt/;
  for (const [name, text] of Object.entries(builds)) assert.ok(!bad.test(text), `${name} still carries streak shader text: ${text.match(bad)?.[0]}`);
  for (const name of ['COMP_FS()', 'COMP_FS(true)', 'COMP_FS(heads)', 'COMP_FS(tube)']) assert.ok(builds[name].includes('uniform vec2 blendA;'), `${name}: blendA holds the chevrons' and the origin colours' shares only`);
  assert.ok(!/uniform vec3 blendA/.test(read('src/ui/tube-lumen-glsl.js')), 'the lumen shader\'s blendA has no streak slot');
});

test('the lobule and the stage feed the chevrons and the origin colours, and the lymph and the bile, never a streak', () => {
  const lz = read('src/ui/lobule-zoom.js'), sb = read('src/ui/stage-blood.js');
  assert.ok(/blood\.on = \(lyOn \|\| biOn\) && flowA > 0\.002;/.test(lz), 'the lobule\'s composite is on for lymph and bile only');
  assert.ok(/if \(!flowSame && \(chev \|\| origin\)\) for \(const t of tubeSet\)/.test(lz), 'the lobule\'s blood rows are written for the chevrons and the origin colours');
  assert.ok(/const blendA = \{ c: null, o: null \};/.test(sb), 'the stage eases the chevrons and the origin colours');
});

// ---- the saved choice ----
const fake = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};

test('nothing saved: the chevron default, no streaks key written', () => {
  const s = fake();
  assert.deepEqual(loadBloodPref(s), { phasic: false, chevrons: true });
  assert.equal(s.m.size, 0, 'nothing is written for a device that never chose');
});

test('a device that had the streaks on gets chevrons, and the streaks key is gone', () => {
  const s = fake({ 'pps.streaks': '1', 'pps.blood2': JSON.stringify({ chevrons: false, keyChevrons: false, look: 'shimmer', phasic: false }) });
  const b = loadBloodPref(s);
  assert.equal(b.chevrons, true);
  assert.ok(!('look' in b));
  assert.equal(s.getItem('pps.streaks'), null);
  assert.deepEqual(JSON.parse(s.getItem('pps.blood2')), b, 'the migrated choice is saved, so it is read the same next time');
});

test('a device that had the streaks off keeps its own chevron choice, and the key is gone', () => {
  const off = fake({ 'pps.streaks': '0', 'pps.blood2': JSON.stringify({ chevrons: false, keyChevrons: true }) });
  assert.deepEqual(loadBloodPref(off), { phasic: false, chevrons: false, keyChevrons: true });
  assert.equal(off.getItem('pps.streaks'), null);
  const bare = fake({ 'pps.streaks': '0' });
  assert.equal(loadBloodPref(bare).chevrons, true, 'no chevron choice saved: the default');
  assert.equal(bare.getItem('pps.streaks'), null);
});

test('any other stored value is read as the chevron default, and a dead key is dropped', () => {
  for (const v of ['"x"', '[1]', '{', 'null', '7']) assert.equal(loadBloodPref(fake({ 'pps.blood2': v })).chevrons, true, v);
  for (const v of ['yes', '2', '']) { const s = fake({ 'pps.streaks': v }); assert.equal(loadBloodPref(s).chevrons, true); assert.equal(s.getItem('pps.streaks'), null, `'${v}' is dropped`); }
  const b = loadBloodPref(fake({ 'pps.blood2': JSON.stringify({ origin: true, look: 'parcels', phasic: true, keyChevrons: true }) }));
  assert.deepEqual(b, { phasic: false, chevrons: true, keyChevrons: true });
});

test('storage that throws leaves the defaults', () => {
  const dead = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadBloodPref(dead), { phasic: false, chevrons: true });
});

test('relative paths in this test point at the repository', () => {
  assert.equal(relative(ROOT, join(ROOT, 'src/ui/blood-pref.js')), 'src/ui/blood-pref.js');
});
