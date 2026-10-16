import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeGlowTexels } from '../src/ui/glow-texels.js';
import { wavePacks, paintWave } from '../src/ui/scan-waves.js';

// Review P6, P9 and P12 (16 Oct): cheaper glow eases, FibroScan ripples, hidden tubes, label caches and font caching,
// each with the same picture as before.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rgb = (c) => ({ red: [1, 0, 0], green: [0, 0.5, 0], violet: [0.5, 0.2, 0.9] })[c];
// The glow texels as syncVeins wrote them before the helper (a04d37a), over a row zeroed first.
function before(T, o, kind, id, ra, len, lit, hovAmt) {
  T.fill(0, o, o + 48);
  const hov = (kind === 'v' || kind === 's') && Math.max(hovAmt.get(id) || 0, ra ? hovAmt.get(ra) || 0 : 0);
  if (hov) T[o + 39] = ease(hov);
  if (kind === 'v' || kind === 's') {
    const la = lit.get(id), lb = ra && lit.get(ra), l = la || lb;
    const lend = kind === 's' ? [0.3 * len, 0.3 * len] : la && lb ? [la.end[0], lb.end[1]] : l?.end;
    const v = l ? ease(Math.max(0, l.v)) * l.amt : 0;
    if (v > 0) {
      if (l.col) { const c = rgb(l.col); l.rgb = l.from && l.cu < 1 ? mix3(l.from, c, ease(l.cu)) : c; }
      const part = kind === 'v' && la && la.span && (la.span[0] > 0.002 || la.span[1] < 0.998);
      T.set([...(l.col ? l.rgb : [0, 0, 0]), v, part ? -1 - la.span[0] : lend[0], part ? -1 - la.span[1] : lend[1], l.col ? 0 : 1, l.wide + (l.top ? 10 : 0)], o + 40);
    } else T.fill(0, o + 40, o + 48);
  }
}

test('the glow texels are written exactly as the whole vessel sync wrote them, over any earlier values', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = [null, 'red', 'green', 'violet'];
  for (let n = 0; n < 2000; n++) {
    const kind = ['v', 's', 'f', 'c'][Math.floor(rnd() * 4)], ra = rnd() < 0.3 ? 'B' : undefined;
    const mk = () => ({ v: rnd() < 0.2 ? 0 : rnd(), amt: 1 + rnd(), col: cols[Math.floor(rnd() * 4)], from: rnd() < 0.5 ? [0.1, 0.2, 0.3] : null, cu: rnd() < 0.5 ? 1 : rnd(), end: [rnd() * 20, rnd() * 20], span: rnd() < 0.5 ? [rnd() * 0.3, 0.7 + rnd() * 0.3] : [0, 1], wide: 1 + rnd() * 0.3, top: rnd() < 0.2 });
    const lit = new Map(), hov = new Map();
    if (rnd() < 0.7) lit.set('A', mk());
    if (ra && rnd() < 0.6) lit.set('B', mk());
    if (rnd() < 0.5) hov.set('A', rnd());
    if (ra && rnd() < 0.5) hov.set('B', rnd());
    const len = 10 + rnd() * 50;
    const want = new Float32Array(48), got = new Float32Array(48).map(() => (kind === 'v' || kind === 's' ? rnd() : 0));   // stale values from an earlier frame
    const litB = new Map([...lit].map(([k, l]) => [k, { ...l }]));
    before(want, 0, kind, 'A', ra, len, lit, hov);
    writeGlowTexels(got, 0, kind, 'A', ra, len, litB, hov, rgb, ease);
    // (Only the glow texels are the helper's: the rest of the row is the whole sync's, zero in this stand-in.)
    for (let i = 0; i < 39; i++) got[i] = 0;
    assert.deepEqual([...got], [...want], `case ${n}`);
    for (const k of lit.keys()) assert.deepEqual(litB.get(k).rgb, lit.get(k).rgb);
  }
});

test('a glow ease runs the glow-only sync, which falls back to the whole sync unless nothing else changed', () => {
  assert.match(stage, /if \(glowSync && !syncGlowOnly\(easeInOut\(morph\)\)\) syncVeins\(easeInOut\(morph\)\);/);
  assert.match(stage, /writeGlowTexels\(tubeData, o, kind, id, ra\?\.e\.id, obj\.len, glow\.lit, vh\.amt, rgbCs, easeInOut\);/, 'the whole sync writes them with the same helper');
  assert.match(stage, /glowMemo = \{ items, t, netA, cs, mode, origin: originMode, cath: cathTint, F, geo: geometryVersion, plate: veins\.hasPlate\(0\), cls: wrap\.className, bits: glowBits\(items\), reach: vLook\.reach \};/);
  const ok = stage.slice(stage.indexOf('function glowOnlyOk'), stage.indexOf('function syncGlowOnly'));
  for (const c of ['tubesNew', 'lensFrom', 'm.t !== t', 'm.F !== F', 'm.geo !== geometryVersion', 'm.netA !== netA', 'm.cs !== wrapCS()', 'm.mode !== layerMode()', 'm.origin !== originOn()', 'm.cath !== cathTint', 'm.plate !== veins.hasPlate(0)', 'm.cls !== wrap.className', 'm.reach !==', 'b[i] !== m.bits[i]', 'b[i] & 64']) assert.ok(ok.includes(c), `checks ${c}`);
  for (const c of ["'is-sel'", "'hl'", "'coll-ghost'", 'it.x.lifted', 'it.x.reveal']) assert.ok(stage.slice(stage.indexOf('function glowBits'), stage.indexOf('function glowOnlyOk')).includes(c), `bits hold ${c}`);
});

test('the FibroScan packets write an opacity or a path only when its text changed', () => {
  const writes = [];
  const el = (n) => ({ n, style: { set opacity(v) { writes.push([n, 'op', v]); } }, setAttribute: (k, v) => writes.push([n, k, v]) });
  const groups = [0, 1].map((i) => ({ ...el('g' + i), children: [el(`p${i}0`), el(`p${i}1`), el(`p${i}2`)] }));
  const packs = wavePacks({ querySelectorAll: (q) => (assert.equal(q, '.sp-waves > g'), groups) });
  assert.equal(packs.length, 2);
  paintWave(packs[0], '0'); paintWave(packs[0], '0');
  assert.deepEqual(writes, [['g0', 'op', '0']]);
  writes.length = 0;
  paintWave(packs[1], '0.500', (j) => `M${j}`);
  paintWave(packs[1], '0.500', (j) => (j === 1 ? 'M9' : `M${j}`));
  assert.deepEqual(writes, [['g1', 'op', '0.500'], ['p10', 'd', 'M0'], ['p11', 'd', 'M1'], ['p12', 'd', 'M2'], ['p11', 'd', 'M9']]);
  assert.match(stage, /paintWave\(w, fade\.toFixed\(3\), \(j\) => scanArc\(Math\.max\(1, r \+ \(j - 1\) \* gap\)\)\)/, 'the same arcs as before');
  assert.match(stage, /scan\.el = null; scan\.packs = null;/, 'a new probe looks its packets up again');
});

test('under the GPU the hidden SVG tubes are written when they show again; lumens always', () => {
  assert.match(stage, /if \(!on\) \{ tubesHidden = false; if \(tubesHeld\.size\) flushTubes\(\); \}/);
  assert.doesNotMatch(stage, /setT\(x\.lumen/, 'credit.js reads a lit lumen\'s width');
  assert.match(stage, /setA\(x\.lumen, 'stroke-width', w\.toFixed\(1\)\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const hidden = css.match(/\.stage-view\.gl-on #world :is\(([^)]*)\) \{ display: none; \}/)[1];
  for (const c of ['.v-wall', '.v-artery', '.v-strand', '.v-strand-wall', '.v-heat', '.v-select']) assert.ok(hidden.includes(c), `${c} is hidden under gl-on`);
});

test('label widths are kept by their digit-normalised text, and the narrowings\' text by object', () => {
  assert.match(stage, /const z = t\.replace\(\/\\d\/g, '0'\), k = `\$\{weight\}\|\$\{size\}\|\$\{track\}\|\$\{z\}`;/);
  assert.match(stage, /paramJSON\(\(f\.viewParams \|\| st\.params\)\.stenosis\), paramJSON\(\(f\.viewParams \|\| st\.params\)\.stenosisSite\)/);
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
