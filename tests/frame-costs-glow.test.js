import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeGlowTexels } from '../src/ui/glow-texels.js';
import { wavePacks, paintWave } from '../src/ui/scan-waves.js';

// Review P6, P9 and P12 (16 Oct): cheaper glow eases, FibroScan ripples, hidden tubes, label caches and font caching,
// each with the same picture as before.
const stage = stageSource();
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
  assert.match(stage, /if \((?:live\.)?glowSync && !syncGlowOnly\((?:live\.)?easeInOut\((?:live\.)?morph\)\)\) syncVeins\((?:live\.)?easeInOut\((?:live\.)?morph\)\);/);
  assert.match(stage, /writeGlowTexels\((?:live\.)?tubeData, o, kind, id, ra\?\.e\.id, obj\.len, glow\.lit, vh\.amt, cpRgb, (?:live\.)?easeInOut\);/, 'the whole sync writes them with the same helper');
  assert.match(stage, /gm\.items = items; gm\.t = t; gm\.netA = (?:live\.)?(?:live\.)?netA; gm\.cs = cs; gm\.mode = mode; gm\.origin = cpOrigin; gm\.cath = (?:live\.)?(?:live\.)?cathTint; gm\.F = (?:live\.)?(?:live\.)?F; gm\.geo = (?:live\.)?(?:live\.)?geometryVersion;\n\s+gm\.plate = (?:live\.)?(?:live\.)?veins\.hasPlate\(0\); gm\.cls = wrapCls\(\); gm\.bits = glowBits\(items, 0\); gm\.reach = (?:live\.)?(?:live\.)?vLook\.reach;/);   // (the memo is one kept object written in place)
  const ok = stage.slice(stage.indexOf('function glowOnlyOk'), stage.indexOf('function syncGlowOnly'));
  for (const c of ['tubesNew', 'lensFrom', 'm.t !== t', 'm.F !== live.F', 'm.geo !== live.geometryVersion', 'm.netA !== live.netA', 'm.cs !== wrapCS()', 'm.mode !== layerMode()', 'm.origin !== live.originOn()', 'm.cath !== live.cathTint', 'm.plate !== live.veins.hasPlate(0)', 'm.cls !== wrapCls()', 'm.reach !==', 'b[i] !== m.bits[i]', 'b[i] & 64']) assert.ok(ok.includes(c), `checks ${c}`);
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
  assert.match(stage, /const scanArcAt = \(j\) => scanArc\(Math\.max\(1, scanWaveR \+ \(j - 1\) \* scanWaveGap\)\);/, 'the same arcs as before');
  assert.match(stage, /scanWaveR = r; scanWaveGap = gap;\n\s+paintWave\(w, fade\.toFixed\(3\), scanArcAt\);/);
  assert.match(stage, /scan\.el = null; scan\.packs = null;/, 'a new probe looks its packets up again');
});

test('the vessels are records the GPU draws: no SVG tube, gradient, mask or hit stroke is made for them; the credit takes their courses from the stage', () => {
  const build = stage.slice(stage.indexOf('  // Edge groups: each vessel is a record'), stage.indexOf('  ALL_EDGES.forEach((e, i) => { E[e.id].row = i; });'));
  assert.ok(build.length > 0, 'the vessel builder is found');
  for (const c of ['v-wall', 'v-lumen', 'v-shadow', 'v-sheen', 'v-shade', 'v-select', 'v-halo', 'v-strand', 'v-artery', 'v-hit', 'linearGradient', 'mask']) assert.ok(!build.includes(c), `no ${c} built for a vessel`);
  assert.doesNotMatch(stage, /tubesHidden|tubesHeld|flushTubes|setPaint|svgTaper|updateJoins|REVEAL_PARTS/, 'nothing left that wrote the SVG tubes');
  assert.doesNotMatch(stage, /flushHeld|class: 'v-hit'|ghost-hit/, 'no hit stroke or ghost copy, and nothing held for one');
  const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(credit, /const vesselsNow = \(\) => window\.pps\?\.stage\?\.vesselShapes\?\.\(\)/, 'the credit takes the vessels\' courses from the stage');
  assert.doesNotMatch(credit, /v-hit/, 'and reads no hit stroke');
  assert.match(credit, /window\.pps\?\.stage\?\.lumenWidth\?\.\(v\.id\) \?\? v\.w/, 'a lit vein\'s width is the stage\'s number');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  for (const c of ['.v-wall', '.v-lumen', '.v-artery', '.v-strand', '.v-select', '.v-shadow', '.tier-casing']) assert.ok(!css.includes(c + ' ') && !css.includes(c + ','), `no style left for ${c}`);
});

test('label widths are kept by their digit-normalised text, and the narrowings\' text by object', () => {
  assert.match(stage, /z = t\.replace\(\/\\d\/g, '0'\); if \(widthZ\.size > 3000\) widthZ\.clear\(\); widthZ\.set\(t, z\);/);   // (a text and its digits-as-zeros form, made once for each text seen)
  assert.match(stage, /let e = widths\.get\(z\);\n\s+if \(e\) for \(let i = 0; i < e\.length; i \+= 4\) if \(e\[i\] === weight && e\[i \+ 1\] === size && e\[i \+ 2\] === track\) return e\[i \+ 3\];/);
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

test("a pan or pinch's own classes never count as a change of the stage's look", () => {
  // (panning, stage-busy and figure-focus come on as a gesture starts and off as it ends, and stage-busy 0.6 s later, as the menus
  // fade back in. Each dropped the stage's style snapshot and the glow-only, marks and gut-look memos: a style pass and a whole
  // vessel sync, the marks read again from the SVG, at every one (Mohammad, 21 Oct: "still lag after i pan or zoom").)
  assert.match(stage, /const gestureFree = \(c\) => \(c \|\| ''\)\.replace\(\/\(\?:\^\|\\s\)\(\?:panning\|stage-busy\|figure-focus\|lb-ride\|pinch-hide\|off-home\)\(\?=\\s\|\$\)\/g, ''\);/);
  const obs = stage.slice(stage.indexOf('const drop = () => { csSnap = null; };'), stage.indexOf("addEventListener('resize', drop)"));
  assert.match(obs, /if \(r\.attributeName === 'class'\) \{ const c = gestureFree\(r\.target\.getAttribute\('class'\)\); if \(seen\.get\(r\.target\) === c\) continue; seen\.set\(r\.target, c\); \}\n\s+drop\(\);\n[^\n]*\n\s+if \(recs\.some\(\(x\) => x\.attributeName === 'data-theme' \|\| x\.attributeName === 'data-palette'\)\) csAsk \|\|= readFrame\(wrapCSTake\);\n\s+return;/);
  assert.match(stage, /const marksKey = \(\) => `\$\{mk\.ver\}\|\$\{wrapCls\(\)\}\|/);
  assert.match(stage, /const greyDeps = \(\) => \{ const r = document\.documentElement; return `\$\{wrapCls\(\)\}\|/);
  // Safe only while those classes set no custom property and nothing the figure draws: the cursor, and the floating pieces.
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  for (const m of css.matchAll(/([^{}]*\.(?:panning|stage-busy|figure-focus|lb-ride)\b[^{}]*)\{([^{}]*)\}/g)) {
    assert.doesNotMatch(m[2], /--[\w-]+\s*:/, `${m[1].trim()} sets no custom property`);
    assert.doesNotMatch(m[1], /#organs|#veins|#stage\s+\S|\.organ|\.v-/, `${m[1].trim()} styles nothing in the figure`);
  }
});
