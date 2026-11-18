import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeGlowTexels } from '../src/ui/glow-texels.js';
import { wavePacks, paintWave } from '../src/ui/scan-waves.js';
import { appCss } from './split-src.js';

// Review P6, P9 and P12 (16 Oct): cheaper glow eases, FibroScan ripples, hidden tubes, label caches and font caching,
// each with the same picture as before.
const stage = stageSource();
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const rnd0 = (seed0) => { let seed = seed0; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); };

test('no glow is drawn on any vessel (13 Nov 2026; the glow engine is gone, 15 Nov): every glow texel is zero whatever else is in the row, the hover brightening stays', () => {
  const rnd = rnd0(11);
  for (let n = 0; n < 500; n++) {
    const kind = ['v', 's', 'f', 'c'][n % 4], ra = n % 3 === 0 ? 'B' : undefined;
    const hov = new Map(); if (rnd() < 0.7) hov.set('A', rnd()); if (ra && rnd() < 0.6) hov.set('B', rnd());
    const T = new Float32Array(48).fill(0.7);
    writeGlowTexels(T, 0, kind, 'A', ra, hov, ease);
    if (kind !== 'v' && kind !== 's') { assert.deepEqual([...T], new Array(48).fill(Math.fround(0.7)), `case ${n}: other kinds are left as they are`); continue; }
    assert.deepEqual([...T.slice(40, 48)], new Array(8).fill(0), `case ${n}: no glow colour, amount, ends or width`);
    const h = Math.max(hov.get('A') || 0, ra ? hov.get('B') || 0 : 0);
    assert.equal(T[39], Math.fround(h ? ease(h) : 0), 'the hover brightening is not a glow');
    assert.equal(T[38], Math.fround(0.7), 'the rest of the row is not touched');
  }
});

test('a glow ease runs the glow-only sync, which falls back to the whole sync unless nothing else changed', () => {
  const ok = stage.slice(stage.indexOf('function glowOnlyOk'), stage.indexOf('function syncGlowOnly'));
  for (const c of ['tubesNew', 'lensFrom', 'm.t !== t', 'm.F !== live.F', 'm.geo !== live.geometryVersion', 'm.netA !== live.netA', 'm.cs !== wrapCS()', 'm.mode !== layerMode()', 'm.origin !== live.originOn()', 'm.cath !== live.cathTint', 'm.vf !== live.varixFade', 'm.plate !== live.veins.hasPlate(0)', 'm.cls !== wrapCls()', 'm.reach !==', 'b[i] !== m.bits[i]', 'b[i] & 64']) assert.ok(ok.includes(c), `checks ${c}`);
  for (const c of ['it.x.sel', 'it.x.ghost', 'it.ra?.sel', 'it.x.lifted', 'it.x.reveal']) assert.ok(stage.slice(stage.indexOf('function glowBits'), stage.indexOf('function glowOnlyOk(t)')).includes(c), `bits hold ${c}`);
});

test('the FibroScan packets write an opacity or a path only when its text changed', () => {
  const writes = [];
  const el = (n) => ({ n, style: { set opacity(v) { writes.push([n, 'op', v]); } }, setAttribute: (k, v) => writes.push([n, k, v]) });
  const groups = [0, 1].map((i) => ({ ...el('g' + i), children: [el(`p${i}0`), el(`p${i}1`), el(`p${i}2`)] }));
  const packs = wavePacks({ querySelectorAll: (q) => (assert.equal(q, '.sp-waves > .sp-pk'), groups) });
  assert.equal(packs.length, 2);
  paintWave(packs[0], '0'); paintWave(packs[0], '0');
  assert.deepEqual(writes, [['g0', 'op', '0']]);
  writes.length = 0;
  paintWave(packs[1], '0.500', (j) => `M${j}`);
  paintWave(packs[1], '0.500', (j) => (j === 1 ? 'M9' : `M${j}`));
  assert.deepEqual(writes, [['g1', 'op', '0.500'], ['p10', 'd', 'M0'], ['p11', 'd', 'M1'], ['p12', 'd', 'M2'], ['p11', 'd', 'M9']]);
});

test('the vessels are records the GPU draws: no SVG tube, gradient, mask or hit stroke is made for them; the credit takes their courses from the stage', () => {
  const build = stage.slice(stage.indexOf('  // Edge groups: each vessel is a record'), stage.indexOf('  ALL_EDGES.forEach((e, i) => { E[e.id].row = i; });'));
  assert.ok(build.length > 0, 'the vessel builder is found');
  for (const c of ['v-wall', 'v-lumen', 'v-shadow', 'v-sheen', 'v-shade', 'v-select', 'v-halo', 'v-strand', 'v-artery', 'v-hit', 'linearGradient', 'mask']) assert.ok(!build.includes(c), `no ${c} built for a vessel`);
  const css = appCss();
  for (const c of ['.v-wall', '.v-lumen', '.v-artery', '.v-strand', '.v-select', '.v-shadow', '.tier-casing']) assert.ok(!css.includes(c + ' ') && !css.includes(c + ','), `no style left for ${c}`);
});


test('fonts and brand art come from the cache at once and are refreshed behind it', async () => {
  const handlers = {}, puts = [], fetched = [];
  const store = new Map([['https://x.test/fonts/inter-latin.woff2', 'cached-font']]);
  const self = { addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const caches = { match: async (r) => store.get(r.url), open: async () => ({ put: async (r, v) => puts.push([r.url, v]) }), keys: async () => [] };
  const fetch = async (r, o) => { fetched.push([r.url, o?.cache]); return { ok: true, clone: () => 'fresh:' + r.url, url: r.url }; };
  new Function('self', 'caches', 'fetch', 'location', 'URL', 'Response', sw)(self, caches, fetch, { origin: 'https://x.test' }, URL, { error: () => 'error' });
  const run = async (url) => {
    let out, wait = [];
    handlers.fetch({ request: { url, method: 'GET', mode: 'cors' }, respondWith: (p) => { out = p; }, waitUntil: (p) => wait.push(p) });
    const res = await out; await Promise.all(wait); await new Promise((r) => setTimeout(r, 0));
    return res;
  };
  assert.equal(await run('https://x.test/fonts/inter-latin.woff2'), 'cached-font');
  assert.deepEqual(fetched.at(-1), ['https://x.test/fonts/inter-latin.woff2', 'no-cache'], 'refreshed behind the cached copy');
  assert.deepEqual(puts.at(-1), ['https://x.test/fonts/inter-latin.woff2', 'fresh:https://x.test/fonts/inter-latin.woff2']);
  const miss = await run('https://x.test/preview/brand/mark.svg');
  assert.equal(miss.url, 'https://x.test/preview/brand/mark.svg', 'a miss waits on the network');
});

test("a pan or pinch's own classes never count as a change of the stage's look", () => {
  // (panning, stage-busy and figure-focus come on as a gesture starts and off as it ends, and stage-busy 0.6 s later, as the menus
  // fade back in. Each dropped the stage's style snapshot and the glow-only, marks and gut-look memos: a style pass and a whole
  // vessel sync, the marks read again from the SVG, at every one (Mohammad, 21 Oct: "still lag after i pan or zoom").)
  // Safe only while those classes set no custom property and nothing the figure draws: the cursor, and the floating pieces.
  const css = appCss();
  for (const m of css.matchAll(/([^{}]*\.(?:panning|stage-busy|figure-focus|lb-ride)\b[^{}]*)\{([^{}]*)\}/g)) {
    assert.doesNotMatch(m[2], /--[\w-]+\s*:/, `${m[1].trim()} sets no custom property`);
    assert.doesNotMatch(m[1], /#organs|#veins|#stage\s+\S|\.organ|\.v-/, `${m[1].trim()} styles nothing in the figure`);
  }
});
