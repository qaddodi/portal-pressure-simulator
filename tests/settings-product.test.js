// Premium feel R14 (31 Oct, Mohammad: "Just implement all if I don't like we roll back"): Settings is a product, not a lab bench.
// The figure's resolution choices and performance switches are no longer in Settings. None of them was ever shown to lower no detail
// and no frame rate (the product rule: zero quality drop, no fps cap) or to keep the picture the same without anyone watching a screen,
// so none becomes the default: every one stays at its default (Full, and off), their code stays, and what a build stored for them is
// cleared at start so a leftover choice cannot hold a device below Full with no way to change it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const main = read('src/ui/main.js');
const html = read('index.html');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

test('R14 Settings keeps what a learner understands and none of the experiments', () => {
  for (const t of ["'Appearance'", "'Text size on the figure'", "'Blur effect'", "'Always show HVPG'", "'Send feedback'", "'Advanced physiology'"]) assert.ok(settings.includes(t), `${t} stays`);
  for (const t of ["'Figure resolution'", "'Auto’s lowest resolution'", "'Resolution while moving'", "'Glow resolution'", "'Figure size cap'", "'Adapt to frame rate'", "'Figure performance'",
    "'Motion at 60'", "'Callout glass kept'", "'Credit check in talks'", "'Sharper upscaling'", "'Lymph redrawn where it moves'", "'Lighter organ art'", "'Vessels lower while pinching'", "'Pinch frame reuse'"]) {
    assert.ok(!main.includes(t), `${t} is gone from the menu`);
  }
  assert.doesNotMatch(main, /function figLabRows\(|function figSeg\(/);
});

test('R14 owner-approved row (8 Nov 2026): Settings > Display has "Mesh vessel renderer" right after Figure size (megapixels)', () => {
  assert.ok(settings.includes("'Mesh vessel renderer'"), 'the row is in Settings');
  const at = (t) => settings.indexOf(t);
  assert.ok(at("'Figure size (megapixels)'") > 0 && at("figureMpControl()") > at("'Figure size (megapixels)'"));
  assert.ok(at("'Mesh vessel renderer'") > at('figureMpControl()'), 'after the megapixel control');
  assert.ok(at("'Mesh vessel renderer'") < at("'Sharp while moving'"), 'before the next row');
  assert.match(settings, /menuToggle\(vesselMesh\(\), 'layers', 'Mesh vessel renderer'/, 'an on/off menuToggle');
});

test('R14 every default is as it was: Full, and off (but the credit\'s lean look, H7, and the 8-megapixel budget, 1 Nov: on)', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=${Math.random()}`);
  assert.equal(f.renderSetting(), 1);
  assert.equal(f.renderScale(), 1);
  assert.deepEqual(Object.fromEntries(Object.keys(f.FIG_OPTS).map((k) => [k, f.figOpt(k)])), { move: 1, glow: 1, cap: 8, adapt: false, floor: 0.1 });
  assert.deepEqual(Object.fromEntries(Object.keys(f.FIG_LAB).map((k) => [k, f.figLab(k)])),
    { motion60: true, glassCache: false, creditLean: true, lymphBoxes: false, pinchReuse: 0, upscale: false, lightArt: false, pinchLow: false });
  assert.equal(f.paceMs(), f.MOTION60_MS, 'steady motion at most every 10 ms (4 Nov 2026)');
  delete globalThis.localStorage;
});

test('R14 what a build stored for the experiments is cleared before the app reads it', () => {
  const head = html.slice(html.indexOf("<script>document.documentElement.setAttribute('data-boot','hold');"));
  const code = head.slice('<script>'.length, head.indexOf('</script>'));
  const store = new Map([['pps.renderScale', '0.5'], ['pps.fig.move', '0.5'], ['pps.fig.motion60', 'true'], ['pps.fig.pinchReuse', '2'], ['pps.fig.adapt', 'true'],
    ['pps.theme', 'dark'], ['pps.noGlass', '1'], ['pps.showHvpg', '1'], ['pps.labelScale', '1.2'], ['pps.uiZoom', '1.5']]);
  const localStorage = {
    get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  const el = { setAttribute() {}, style: {} };
  vm.runInNewContext(code, { localStorage, document: { documentElement: el }, matchMedia: () => ({ matches: false }) });
  assert.deepEqual([...store.keys()].sort(), ['pps.figV', 'pps.labelScale', 'pps.noGlass', 'pps.showHvpg', 'pps.theme'], 'only the experiments\' keys go');
  // (Once only, since 1 Nov 2026 (the GPU move, step 4): a choice stored after it is kept at the next load.)
  store.set('pps.renderScale', '0.75'); store.set('pps.fig.cap', '0');
  vm.runInNewContext(code, { localStorage, document: { documentElement: el }, matchMedia: () => ({ matches: false }) });
  assert.equal(store.get('pps.renderScale'), '0.75');
  assert.equal(store.get('pps.fig.cap'), '0');
});
