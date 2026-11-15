// Review F1, F3, F4, F5 (15 Nov 2026): the four instrument cards. No browser: the pure layouts and words, the cut-off modules (each number typed once),
// and a read of the sources that must name those modules and no second copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './dom-shim.js';
import { LSM_CUTS, LSM_STEPS, csphVerdict } from '../src/engine/lsm-cuts.js';
import { SAAG_PORTAL, TP_HIGH, saagPortal, tpHigh } from '../src/engine/ascites-cuts.js';
import { TRANSFUSE, transfuseBand, TRANSFUSE_WORDS } from '../src/engine/transfusion-cuts.js';
import { stiffLayout, stiffWords, verdictOf, plateletWords } from '../src/ui/stiff-bar.js';
import { saagLayout, pointsOf, readingOf, saagWords } from '../src/ui/tool-saag.js';
import { riForms, pulsatility } from '../src/ui/doppler-marks.js';
import { HB_LO, HB_HI, hbAt } from '../src/ui/vitals-monitor.js';
import { NO_ASC } from '../src/ui/table-marks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
// A measuring stand-in: 0.56 em a letter, at the px size the font string names.
const meas = (s, font) => s.length * 0.56 * parseFloat(/([\d.]+)px/.exec(font)[1]);
const sizeOf = (look, TYPE, f) => (TYPE[look] || TYPE[look.replace(/\.(ok|mid|hi)$/, '')])[1] * f;

test('the cut-off modules hold Baveno VIII and AASLD numbers', () => {
  assert.deepEqual({ ...LSM_CUTS }, { unlikely: 10, likely: 15, ruleIn: 25, ruleOutPlt: 150 });
  assert.deepEqual([...LSM_STEPS], [5, 10, 15, 20, 25]);
  assert.deepEqual({ ...TRANSFUSE }, { lo: 7, hi: 8 });
  assert.equal(SAAG_PORTAL, 1.1);
  assert.equal(TP_HIGH, 2.5);
});

test('CSPH verdict: 15 kPa with platelets 150 rules out, 25 rules in, a missing count rules nothing out', () => {
  assert.equal(csphVerdict(15, 150), 'out');
  assert.equal(csphVerdict(15, 149), 'open');
  assert.equal(csphVerdict(15.1, 300), 'open');
  assert.equal(csphVerdict(25, 40), 'in');
  assert.equal(csphVerdict(8, null), 'open');
  assert.equal(csphVerdict(NaN, 200), null);
  assert.deepEqual(verdictOf(20, 200), ['CSPH not ruled in or out', 'mid']);
  assert.deepEqual(verdictOf(12, 200), ['CSPH ruled out', 'ok']);
  assert.deepEqual(verdictOf(30, 90), ['CSPH ruled in', 'hi']);
  assert.match(plateletWords(128), /^Platelets 128 .*, under 150$/);
  assert.match(plateletWords(150), /150 or more$/);
});

test('transfusion band: under 7 below, 7 to 8 in target, over 8 above', () => {
  assert.equal(transfuseBand(6.9), 'below');
  assert.equal(transfuseBand(7), 'in');
  assert.equal(transfuseBand(8), 'in');
  assert.equal(transfuseBand(8.1), 'above');
  assert.equal(TRANSFUSE_WORDS.in, 'In target');
  assert.ok(hbAt(TRANSFUSE.lo) > 0 && hbAt(TRANSFUSE.hi) < 1 && hbAt(TRANSFUSE.lo) < hbAt(TRANSFUSE.hi));
  assert.equal(hbAt(HB_LO - 5), 0);
  assert.equal(hbAt(HB_HI + 5), 1);
});

test('the SAAG and protein cuts', () => {
  assert.equal(saagPortal(1.1), true);
  assert.equal(saagPortal(1.0), false);
  assert.equal(tpHigh(2.5), true);
  assert.equal(tpHigh(2.4), false);
});

test('the stiffness bar stays inside its card at every width and type size, and says its verdict', async () => {
  const { TYPE } = await import('../src/ui/chart-looks/stiff.js');
  for (const W of [240, 280, 320, 400, 480, 600]) for (const f of [12, 13, 14, 16]) {
    for (const [lsm, plt] of [[null, null], [7, 200], [12, 128], [18, 90], [27, 60], [40, null]]) {
      const L = stiffLayout(W, f, meas, { lsm, plt, note: true });
      const tag = `W ${W} f ${f} lsm ${lsm}`;
      for (const r of L.rects) assert.ok(r.x >= -0.01 && r.x + r.w <= W + 0.01 && r.y >= 0 && r.y + r.h <= L.H + 0.01, `rect inside, ${tag}`);
      for (const t of L.texts) {
        const w = meas(t.t, `400 ${sizeOf(t.look, TYPE, f)}px Inter`), x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
        assert.ok(x0 >= -0.5 && x0 + w <= W + 0.5, `"${t.t}" inside the card, ${tag}`);
        assert.ok(t.y <= L.H + 0.5, `"${t.t}" above the box's bottom, ${tag}`);
      }
      for (const v of LSM_STEPS) assert.ok(L.texts.some((t) => t.t === String(v)), `tick ${v}, ${tag}`);
    }
  }
  assert.match(stiffWords(12, 128), /12\.0 kPa/);
  assert.match(stiffWords(12, 128), /Platelets 128/);
  assert.match(stiffWords(12, 200), /CSPH ruled out/);
  assert.match(stiffWords(NaN, null), /no reading/);
});

test('the SAAG plane: points come only from patients with fluid, and every word stays inside the card', async () => {
  const rows = [
    { id: 'cirr', name: 'Cirrhosis', f: { saag: 1.8, tp: 1.0, asc: NO_ASC + 5 } },
    { id: 'dry', name: 'No fluid', f: { saag: 1.8, tp: 1.0, asc: NO_ASC - 1 } },
    { id: 'hf', name: 'Heart failure', f: { saag: 1.7, tp: 3.4, asc: NO_ASC + 5 } },
    { id: 'bad', name: 'Missing', f: null },
  ];
  const pts = pointsOf(rows, [{ name: 'Peritoneal', saag: 0.6, tp: 3.8 }], 'hf');
  assert.deepEqual(pts.map((p) => p.name), ['Cirrhosis', 'Heart failure', 'Peritoneal']);
  assert.deepEqual(pts.map((p) => p.own), [false, true, false]);
  assert.deepEqual(pts.map((p) => p.modeled), [true, true, false]);
  assert.match(saagWords(pts), /Peritoneal \(not modeled\)/);
  assert.match(saagWords([]), /No patient/);
  assert.match(readingOf(1.8, 1.0), /cirrhosis/);
  assert.match(readingOf(1.7, 3.4), /heart or the hepatic veins/);
  assert.match(readingOf(0.6, 3.8), /not the cause/);
  const { TYPE } = await import('../src/ui/chart-looks/saag.js');
  for (const W of [240, 280, 320, 400, 480, 600]) for (const f of [12, 13, 14, 16]) {
    const L = saagLayout(W, f, meas, pts, { read: readingOf(1.7, 3.4) });
    const tag = `W ${W} f ${f}`;
    for (const r of L.rects) assert.ok(r.x >= -0.01 && r.x + r.w <= W + 0.01, `rect inside, ${tag}`);
    for (const t of L.texts) {
      const w = meas(t.t, `400 ${sizeOf(t.look, TYPE, f)}px Inter`), x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
      assert.ok(x0 >= -0.5 && x0 + w <= W + 0.5, `"${t.t}" inside the card, ${tag}`);
    }
    assert.ok(Number.isFinite(L.H) && L.H > 0);
  }
});

test('the resistive index written out: four forms, the longest first, the numbers as the marks print them', () => {
  const [a, b, c, d] = riForms(62, 20, 0.68);
  assert.equal(a, 'RI = (PSV − EDV) / PSV = (62 − 20) / 62 = 0.68');
  assert.equal(b, 'RI = (PSV − EDV) / PSV = 0.68');
  assert.equal(c, 'RI = (62 − 20) / 62 = 0.68');
  assert.equal(d, 'RI 0.68');
  assert.ok(a.length > b.length && b.length > d.length);
  // a reversed diastole prints its sign, in brackets in the sum
  assert.match(riForms(60, -10, 1.17)[0], /\(60 − \(−10\)\) \/ 60 = 1\.17$/);
  // the index is the pulsatility the marks make, so the sum and the strip's number agree
  const hi = 62, lo = 20;
  assert.equal((Math.round(pulsatility(hi, lo) * 100) / 100).toFixed(2), '0.68');
});

test('each cut-off is typed once: the cards, the tiles and the monitor import the modules and keep no second copy', () => {
  const need = {
    'src/ui/stiff-bar.js': 'lsm-cuts.js', 'src/ui/fibroscan.js': 'stiff-bar.js', 'src/ui/table-marks.js': 'lsm-cuts.js',
    'src/ui/tool-saag.js': 'ascites-cuts.js', 'src/ui/vitals-monitor.js': 'transfusion-cuts.js', 'src/ui/vital-read.js': 'transfusion-cuts.js',
  };
  for (const [f, mod] of Object.entries(need)) assert.ok(read(f).includes(mod), `${f} reads ${mod}`);
  const own = new Set(['src/engine/lsm-cuts.js', 'src/engine/ascites-cuts.js', 'src/engine/transfusion-cuts.js']);
  for (const f of walk('src').filter((x) => x.endsWith('.js') && !own.has(x) && !x.startsWith('src/ui/decks/'))) {   // (a deck's teaching text may quote a number)
    const c = code(read(f));
    assert.ok(!/\bSAAG_PORTAL\s*=|\bTP_HIGH\s*=/.test(c), `${f}: no second SAAG or protein cut-off`);
    assert.ok(!/(saag|SAAG)\w*\s*(>=|<)\s*1\.1\b/.test(c), `${f}: no typed SAAG 1.1`);
    assert.ok(!/\b(hb|Hb|hgb)\w*\s*(<|<=|>=|>)\s*[78]\b/.test(c), `${f}: no typed 7 or 8 g/dL for a hemoglobin`);
  }
});

test('the hemoglobin rail is on the one bleeding slide whose monitor shows the hemoglobin', () => {
  const src = read('src/ui/decks/variceal-bleed.js');
  const hits = src.match(/rail: 'hb'/g) || [];
  assert.equal(hits.length, 1, 'one slide asks for the hemoglobin rail');
  assert.match(src, /id: 'blood'[^\n]*rail: 'hb'/);
});

test('the Doppler caliper tap is wired once on the spectrum and from the keyboard', () => {
  const s = code(read('src/ui/doppler.js'));
  assert.match(s, /tapCal/);
  assert.match(s, /riForms\(/);
  assert.ok(!/RI = \(PSV/.test(s), 'the sum is written in doppler-marks.js only');
});
