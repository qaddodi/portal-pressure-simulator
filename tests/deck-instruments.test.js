// Deck visuals, package G (src/ui/ext-instruments.js): the vessel in cross-section (V19), the Doppler's display mode (V20),
// calipers (V21) and paired trace (V29), and the fluid balance (V27). Their numbers are the model's own: the open lumen is
// 1 minus the engine's occlusion, made minus drained is the ascites made, the forces give the engine's liver lymph, and the
// calipers' index is the one the reading names the pattern from. No built-in deck uses any of it.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { createCore } from '../src/worker-core.js';
import { lumenOf, lumenShape, lumenWords, lumenFacts, lumenLabel, lumenSite, lumenBlock, LUMEN_NAME_Y, LUMEN_NUM_Y, LUMEN_WORD_Y, clotPath, LUMEN_R, LUMEN_WALL } from '../src/ui/tool-lumen.js';
import { fluidOf, fluidBars, fluidWords, sinusoidForces, pinnedForces } from '../src/ui/tool-fluid.js';
import { pulsatility, caliperPick, caliperFrame, caliperGlide, CAL_GLIDE, CAL_SECS, pairOf, pairBand, pairScale, PAIR_GAP } from '../src/ui/doppler-marks.js';
import ext from '../src/ui/ext-instruments.js';
import { EXT } from '../src/ui/slide-ext.js';
import { DECKS } from '../src/ui/decks.js';

const DOP = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

async function run(steps) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return out;
}

test('the package registers its two instruments, titled, and no built-in deck uses any of its fields', () => {
  assert.deepEqual(Object.keys(ext.tools).sort(), ['fluid', 'lumen']);
  for (const k of ['fluid', 'lumen']) assert.equal(EXT.owner.tools[k], 'G');
  assert.equal(ext.tools.lumen.title({ kind: 'lumen', vessel: 'PV_TRUNK' }), 'The main portal vein, in cross-section');
  assert.equal(ext.tools.lumen.title({ kind: 'lumen', vessel: 'TIPS' }), 'The TIPS, in cross-section');
  assert.equal(ext.tools.fluid.short(), 'Fluid balance');
  for (const d of DECKS) for (const s of d.slides) {
    const t = s.tool || {};
    assert.ok(!['lumen', 'fluid'].includes(t.kind), `${d.id}/${s.id}: a new instrument`);
    for (const k of ['mode', 'calipers', 'pair']) assert.equal(t[k], undefined, `${d.id}/${s.id}: tool.${k}`);
  }
});

test('V19: the open lumen is 1 minus the engine\'s occlusion, and the picture\'s remnant lumen has that share of the vessel\'s diameter', () => {
  const e = new Engine();
  for (const [st, th] of [[0, 0], [0, 0.6], [0.4, 0], [0.5, 0.5], [0.9, 0.3], [0, 1]]) {
    e.params.stenosis.PV_TRUNK = st; e.params.thrombus.PV_TRUNK = th;
    const L = lumenOf(e.params, 'PV_TRUNK');
    near(L.open, 1 - e.occlusion('PV_TRUNK'), 1e-12, `narrowing ${st}, clot ${th}`);
    const g = lumenShape(L), R0 = LUMEN_R - LUMEN_WALL;
    near((g.top - (50 - g.ri)) / (2 * R0), L.open, 1e-9, 'the remnant lumen\'s diameter');
    assert.ok(g.top >= 50 - g.ri - 1e-9 && g.top <= g.bot + 1e-9, 'the clot\'s top lies inside the lumen');
    assert.ok(!/NaN/.test(clotPath(g)), 'the clot\'s outline is drawable');
  }
  assert.equal(lumenWords(lumenOf({ thrombus: { PV_TRUNK: 1 } }, 'PV_TRUNK')), 'Completely occlusive');
  assert.equal(lumenWords(lumenOf({ thrombus: { PV_TRUNK: 0.6 } }, 'PV_TRUNK')), 'Partially occlusive');
  assert.equal(lumenWords(lumenOf({ thrombus: { PV_TRUNK: 0.5 } }, 'PV_TRUNK')), 'Minimally occlusive');
  assert.equal(lumenWords(lumenOf({ thrombus: { PV_TRUNK: 0.95 } }, 'PV_TRUNK')), 'Partially occlusive');
  assert.equal(lumenWords(lumenOf({ stenosis: { TIPS: 0.6 } }, 'TIPS')), 'Stent narrowed');
  assert.equal(lumenWords(lumenOf({}, 'PV_TRUNK')), 'Open');
  assert.equal(lumenOf({}, 'TIPS').stent, true);
  // One reading: a single cause is not repeated beside the open share; both causes, or a stent's size, are.
  assert.equal(lumenFacts(lumenOf({ thrombus: { PV_TRUNK: 0.6 } }, 'PV_TRUNK')), '');
  assert.equal(lumenFacts(lumenOf({ stenosis: { TIPS: 0.6 } }, 'TIPS'), 9), '9 mm stent');
  assert.equal(lumenFacts(lumenOf({ thrombus: { PV_TRUNK: 0.5 }, stenosis: { PV_TRUNK: 0.2 } }, 'PV_TRUNK')), 'Clot 50 % · narrowing 20 %');
});

test('V27: made minus drained is the ascites made, from the fingerprint and from a live frame alike', async () => {
  const st = await run([{ preset: 'cirr-decomp' }, { params: { diuretics: true } }, { preset: 'healthy' }, { preset: 'schisto' }]);
  for (const [i, m] of st.entries()) {
    const f = fluidOf(m.fp);
    assert.ok(f, `step ${i}: the fingerprint carries the fluid terms`);
    near(f.made - f.drained, m.fp.lymphNet, 1e-9, `step ${i}: made − drained = net`);
    near(f.made, m.fp.hepLymph + m.fp.splLymph, 1e-12, `step ${i}: liver + gut`);
    const e = new Engine(); e.restore(m.snap);
    const g = fluidOf(computeMetrics(e));
    for (const k of ['hep', 'spl', 'cap', 'over', 'net', 'back', 'drained']) near(g[k], f[k], 1e-6, `step ${i}: ${k} live and pinned`);
    const b = fluidBars(f);
    if (f.net > 0) near(b.carried + b.back + b.build, b.liver + b.gut, 1e-9, `step ${i}: the drained bar and its build-up reach the made bar's end`);
    for (const v of Object.values(b)) assert.ok(v >= 0 && v <= 1);
  }
  const [cirr, , healthy] = st.map((m) => fluidOf(m.fp));
  assert.ok(cirr.over > 0 && healthy.over === 0 && healthy.spare > 0, 'cirrhosis overflows its lymphatics; health has room to spare');
  assert.match(fluidWords(healthy), /^No ascites builds.*\.$/);
  for (const f of [cirr, healthy]) assert.match(fluidWords(f), /\.$/, 'a sentence, with its full stop');
  assert.equal(fluidOf({ pv: 10 }), null, 'a live fingerprint without the fluid terms gives no bars');
});

test('V27: the forces across the sinusoid wall give the engine\'s liver lymph', async () => {
  const st = await run([{ preset: 'cirr-decomp' }, { preset: 'healthy' }, { preset: 'rhf' }]);
  for (const m of st) {
    const e = new Engine(); e.restore(m.snap);
    const fo = sinusoidForces(e.P, e.params, e.iap);
    near(0.5 + 0.45 * Math.max(0, fo.out - fo.pull - 0.75), e.starling().hep, 1e-9, 'liver lymph from the forces');
  }
});

test('V27: at rest the forces come from the slide\'s own state, the same on every screen, and match the model\'s', async () => {
  const st = await run([{ preset: 'csph', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] } }, { preset: 'cirr-decomp' }, { preset: 'healthy' }]);
  const [fill, cirr, healthy] = st;
  for (const m of [fill, cirr]) {
    const e = new Engine(); e.restore(m.snap);
    const pf = pinnedForces(m.fp, e.params), lf = sinusoidForces(e.P, e.params, e.iap);
    assert.ok(pf, 'the push is read from the liver lymph');
    near(pf.pull, lf.pull, 1e-9, 'the pull');
    near(pf.out, lf.out, 0.05, 'the push, as the model has it at that moment');
  }
  if (healthy.fp.hepLymph <= 0.5 + 1e-9) assert.equal(pinnedForces(healthy.fp, {}), null, 'lymph at its floor: the live frames show the push');
});

test('V21: the calipers read the window\'s extremes, on their own samples, with the reading\'s own index', () => {
  const buf = [];
  for (let t = 0; t <= 6; t += 0.02) buf.push([+t.toFixed(2), 20 + 8 * Math.sin(2 * Math.PI * t)]);
  const c = caliperPick(buf, 3, 6);
  near(c.hi[1], 28, 0.05, 'the peak'); near(c.lo[1], 12, 0.05, 'the trough');
  near(c.pi, pulsatility(c.hi[1], c.lo[1]), 1e-12, 'its index');
  near(c.pi, 16 / 28, 0.01, 'the swing over the larger extreme');
  assert.ok(c.hi[0] > 5 && c.lo[0] > 5, 'both on the newest beat');
  assert.equal(caliperPick(buf.map(([t]) => [t, 0.2]), 3, 6), null, 'no flow, no calipers');
  // A record scrolling past the window's edge, its beats growing and shrinking, on a phone's 3 s sweep and a 6 s one: every
  // frame the marks sit inside the trace, on the window's own highest and lowest samples, and the index is theirs.
  const rec = [];
  for (let t = 0; t <= 30; t += 1 / 50) rec.push([t, 15 + (6 + 5 * Math.sin(t / 3)) * Math.sin(2 * Math.PI * t * 1.1) - (Math.abs((t % 7) - 3.5) < 0.05 ? 9 : 0)]);
  for (const [sweep, W] of [[3, 280], [6, 560]]) {
    for (let tNow = 6; tNow <= 30; tNow += 1 / 60) {
      const f = caliperFrame(rec, tNow, sweep, W, 16), inWin = rec.filter(([t]) => t >= f.t0 && t <= f.t1);
      const margin = (8 * sweep) / W;
      assert.ok(f.t0 >= tNow - CAL_SECS - 1e-9 && f.t0 >= tNow - sweep + margin && f.t1 <= tNow - margin, 'the window lies on the trace, a whole mark from each edge');
      for (const w of ['hi', 'lo']) assert.ok(f[w][0] >= f.t0 && f[w][0] <= f.t1 && rec.some((p) => p[0] === f[w][0] && p[1] === f[w][1]), `the ${w} mark is on a sample inside it`);
      assert.equal(f.hi[1], Math.max(...inWin.map((p) => p[1])), 'on the highest sample');
      assert.equal(f.lo[1], Math.min(...inWin.map((p) => p[1])), 'on the lowest sample');
      assert.equal(f.pi, pulsatility(f.hi[1], f.lo[1]), 'the index from the same pick');
    }
  }
  // A mark moving to a new pick glides there: it starts where it was drawn, eases out (never further than it started, and
  // never overshooting), and lands exactly on its target by the end of the glide.
  const off = [-120, 35];
  near(caliperGlide(off, 0)[0], -120, 1e-12, 'starts where it was'); near(caliperGlide(off, 0)[1], 35, 1e-12, 'starts where it was');
  let last = Infinity;
  for (let s = 0; s <= CAL_GLIDE + 1e-9; s += CAL_GLIDE / 30) {
    const [dx, dy] = caliperGlide(off, s), d = Math.hypot(dx, dy);
    assert.ok(d <= last + 1e-12 && Math.sign(dx) !== 1 && Math.sign(dy) !== -1, 'closing in, never past the target');
    last = d;
  }
  assert.ok(Math.hypot(...caliperGlide(off, CAL_GLIDE / 2)) < 0.15 * Math.hypot(...off), 'eased out: most of the way in half the time');
  assert.deepEqual(caliperGlide(off, CAL_GLIDE).map(Math.abs), [0, 0], 'on its target at the end of the glide');
  assert.deepEqual(caliperGlide(off, 5).map(Math.abs), [0, 0], 'and stays there');
  assert.ok(CAL_GLIDE >= 0.12 && CAL_GLIDE <= 0.18, 'a short glide');
  // The reading's own formula (doppler.js interpret), read from its source.
  assert.match(DOP, /const pi = big > 0\.5 \? swing \/ big : 0;/);
});

test('V20, V21, V29: the Doppler takes a slide\'s options, and a slide that names none is plain Spectrum', () => {
  assert.match(DOP, /return \{ id: 'doppler'[^}]*configure \};/);
  assert.match(DOP, /const m = MODE_OF\[t\?\.mode\] \|\| 'spectrum';/);
  assert.match(DOP, /color: 'velocity'/);
  assert.match(DOP, /calip = !!t\?\.calipers/);
  assert.match(DOP, /pair = !!t\?\.pair/);
  assert.equal(pairOf('portal'), 'RHV_IVC'); assert.equal(pairOf('hepatic'), 'PV_TRUNK'); assert.equal(pairOf('tips'), 'RHV_IVC');
  for (const hAll of [60, 100, 140, 200, 300]) {
    const b = pairBand(hAll);
    assert.ok(b === 0 || hAll - b - PAIR_GAP >= 60, `the main trace keeps 60 px at ${hAll}`);
    assert.ok(b === 0 || (b >= 30 && b <= 72));
  }
  assert.equal(pairBand(80), 0, 'too short for two traces: the pair is left out');
  const ps = pairScale(30, 0);
  assert.ok(ps.scale >= 30 / 0.85 && ps.base === 0.9, 'forward flow only: baseline low, the trace fills its side');
});

test('fluid balance flow: every band arrives, labels keep apart, and it fits the width', async () => {
  const { fluidFlows } = await import('../src/ui/tool-fluid.js');
  const cases = [
    { hep: 0.5, spl: 0, made: 0.5, cap: 2.4, carried: 0.5, spare: 1.9, back: 0, net: 0, perDay: 0 },
    { hep: 1.6, spl: 2.1, made: 3.7, cap: 2.9, carried: 2.9, spare: 0, back: 0.7, net: 0.11, perDay: 160 },
    { hep: 1.6, spl: 2.1, made: 3.7, cap: 2.9, carried: 2.9, spare: 0, back: 0.9, net: -0.1, perDay: -144 },
  ];
  for (const f of cases) for (const W of [300, 360, 560]) {
    const L = fluidFlows(f, W);
    const into = L.bands.reduce((s, b) => s + b.t, 0), left = L.left.reduce((s, n) => s + n.lh, 0);
    assert.ok(Math.abs(into - left) < 2.5, `bands carry what the left makes (${into} vs ${left})`);
    for (const col of [L.left, L.right]) for (let i = 1; i < col.length; i++) assert.ok(col[i].cy - col[i - 1].cy >= 18 - 1e-6, 'labels 18 px apart');
    for (const n of [...L.left, ...L.right]) { assert.ok(n.y >= 0 && n.y + n.h <= L.H + 1e-6, 'inside the picture'); }
    assert.ok(L.xR - L.xL >= 40, 'room for the bands');
  }
});

test('V19: the % in the cross-section is large, and "100 %" still clears the inner wall with room on both sides', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const rule = css.match(/^\.gl-in \{([^}]*)\}/m)[1];
  const size = +rule.match(/font:\s*\d+\s+(\d+(?:\.\d+)?)px/)[1], edge = +rule.match(/stroke-width:\s*([\d.]+)/)[1];
  // Inter at weight 650: "100 %" is about 3.02 em wide (measured from fonts/inter-latin.woff2); the outline adds its width.
  const width = 3.02 * size + edge, room = (2 * (LUMEN_R - LUMEN_WALL) - width) / 2;
  assert.ok(size >= 20, `the number is at least 20 units in the 100-unit picture (was 16): ${size}`);
  assert.ok(room >= 6, `at least 6 units clear of the inner wall on each side: ${room.toFixed(1)}`);
  assert.ok(edge / size >= 0.08, 'the outline keeps its weight in proportion to the number');
});

test('V19: the % in the cross-section fades with the share filled, so nothing shows at 0 %', () => {
  const src = readFileSync(new URL('../src/ui/tool-lumen.js', import.meta.url), 'utf8');
  assert.match(src, /inWord\.style\.opacity = inNum\.style\.opacity = b\.numOpacity/);
  assert.equal(lumenBlock(0).numOpacity, 0, 'nothing filled: no number');
  assert.equal(lumenBlock(0.06).numOpacity, 1, 'shown in full by 6 %');
  for (let o = 0; o < 0.06; o += 0.001) assert.ok(lumenBlock(o + 0.001).numOpacity >= lumenBlock(o).numOpacity, 'it fades in steadily');
});

test('V19: "occluded" sits under the % as one block, fades with it, and is never under 12 px on screen', () => {
  const src = readFileSync(new URL('../src/ui/tool-lumen.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /inWord\.textContent = 'occluded'/);
  assert.match(src, /inWord\.style\.opacity = inNum\.style\.opacity/);
  assert.match(src, /inNum = sv\('text'[^)]*y: LUMEN_NUM_Y/);
  assert.match(src, /inWord = sv\('text'[^)]*y: LUMEN_WORD_Y/);
  const yn = LUMEN_NUM_Y, yw = LUMEN_WORD_Y;
  assert.ok(yw > yn + 12, 'the word is under the number');
  // The word's font: 12 px on screen (12 / px-per-unit units), held between 9 and 12 units; the number is 22 units.
  const rule = css.match(/^\.gl-word \{([^}]*)\}/m)[1];
  assert.match(rule, /font-size: max\(9px, min\(12px, calc\(12px \/ var\(--gl-u/);
  for (const u of [1.2, 1.5, 2.5, 4]) {
    const fs = Math.max(9, Math.min(12, 12 / u));
    assert.ok(fs * u >= 12 - 1e-9 || fs === 9, `${u} px per unit: the word is 12 px on screen unless the picture is large`);
    assert.ok(fs * 4.7 + 2 <= 2 * Math.sqrt((LUMEN_R - LUMEN_WALL) ** 2 - (yw + 4.5 - 50) ** 2) - 6, `the word clears the wall at ${u} px per unit`);
  }
});

test('V19: the vessel\'s name sits above the % in the circle, stays at 0 %, fits inside the lumen, and a deck may set its own', () => {
  const src = readFileSync(new URL('../src/ui/tool-lumen.js', import.meta.url), 'utf8');
  const ya = LUMEN_NAME_Y, yn = LUMEN_NUM_Y, yw = LUMEN_WORD_Y;
  assert.ok(ya < yn - 12, 'the name is above the number');
  assert.ok(Math.abs((ya + yw) / 2 - 50) <= 2, 'name, number and word are one block centred on the vessel');
  assert.match(src, /inName = sv\('text', \{ class: 'gl-in gl-word gl-name'/, 'the name is the size of "occluded", so it keeps the 12 px floor');
  assert.doesNotMatch(src, /inName\.style\.opacity/, 'the name never fades: the circle always says what it is');
  assert.match(src, /inName\.setAttribute\('y', b\.nameY/);
  assert.equal(lumenBlock(0).nameY, 50, 'alone, the name sits at the vessel\'s centre');
  assert.equal(lumenBlock(0.06).nameY, ya, 'with a clot it sits above the %');
  assert.equal(lumenLabel('PV_TRUNK'), 'Portal vein');
  assert.equal(lumenLabel('TIPS'), 'Distal TIPS');
  assert.equal(lumenLabel('TIPS', null, 'proximal'), 'Proximal TIPS');
  assert.equal(lumenLabel('TIPS', null, 'mid'), 'Mid TIPS');
  // Where a stent is cut: the slide's site, else its narrowing's segment, distal if unset (scenario.js).
  assert.equal(lumenSite({}, 'TIPS'), 'distal');
  assert.equal(lumenSite({ stenosisSite: { TIPS: 'mid' } }, 'TIPS'), 'mid');
  assert.equal(lumenSite({ stenosisSite: { TIPS: 'mid' } }, 'TIPS', 'proximal'), 'proximal');
  assert.equal(lumenLabel('PV_TRUNK', 'Superior MV'), 'Superior MV');
  assert.equal(lumenLabel('PV_TRUNK', '  '), 'Portal vein');
  // Every built-in name fits inside the inner wall, 2 units clear each side, at the word's font (9 to 10 units from 1.2 px per
  // unit up). Inter 600 widths, roughly: narrow letters (and I) 0.3 em, other capitals 0.68 em, the rest 0.58 em; the outline adds 2 units.
  const em = (t) => [...t].reduce((a, c) => a + (/[iljtfrI ]/.test(c) ? 0.3 : /[A-Z]/.test(c) ? 0.68 : 0.58), 0);
  const ids = ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SV_CONF', 'SMV_CONF', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA', 'TIPS', 'DIPS'];
  const names = [...ids.map((id) => lumenLabel(id)), ...['proximal', 'mid'].flatMap((x) => ['TIPS', 'DIPS'].map((id) => lumenLabel(id, null, x)))];
  for (const fs of [9, 10]) for (const t of names) {
    const top = ya - fs / 2, chord = 2 * Math.sqrt((LUMEN_R - LUMEN_WALL) ** 2 - (top - 50) ** 2);
    assert.ok(em(t) * fs + 2 <= chord - 4, `"${t}" fits the circle at ${fs} units: ${(em(t) * fs + 2).toFixed(1)} of ${chord.toFixed(1)}`);
  }
});

test('V19: the vessel\'s name and the % never overlap at any frame as a clot comes or goes, on phone, iPad and Mac', () => {
  // The name's font is the word's: 12 px on screen, 9 units from 1.33 px per unit up (iPad, Mac), 10 at a phone's 1.2,
  // 12 under 1 px per unit. Its box: 0.55 em each side of its centre (descenders too) plus half the 1.3 outline. The %'s
  // digits: 0.727 em of 22 units tall about its centre, plus half its 1.9 outline.
  const numTop = LUMEN_NUM_Y - 0.727 * 22 / 2 - 0.95;
  for (const fs of [9, 10, 12]) {
    let prevY = 50;
    for (let i = 0; i <= 2000; i++) {
      const o = i / 2000 * 0.1, b = lumenBlock(o), nameBottom = b.nameY + 0.55 * fs + 0.65;
      if (b.numOpacity > 0) assert.ok(nameBottom <= numTop, `${fs} units, ${(o * 100).toFixed(2)} % filled: name ends at ${nameBottom.toFixed(2)}, % starts at ${numTop.toFixed(2)}`);
      assert.ok(b.nameY <= prevY + 1e-12 && prevY - b.nameY < 0.1, 'the name glides up, never jumps');
      prevY = b.nameY;
    }
  }
});
