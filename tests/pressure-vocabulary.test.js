// R6: pressure has one vocabulary. HVPG is amber above 5 and red from 10, PPG amber from 6 and red from 12 (src/engine/pressure-cuts.js),
// and every place that rates a gradient (the tiles, the Over time chart, the summary tables, the catheter, the talk trace, the plane, the
// ladder, the menu chips, the engine's events) reads them from that table and the colour tokens (--ok, --caution, --danger) for what they
// mean. These checks keep a second copy from creeping back in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './dom-shim.js';
import { HVPG_CUTS, PPG_CUTS, hvpgSev, ppgSev, hvpgRate, ppgRate, RATE_OF_SEV } from '../src/engine/pressure-cuts.js';
import { RATE } from '../src/ui/table-marks.js';
import { PLANES } from '../src/ui/visual-plane.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('the table holds the standing cut-offs', () => {
  assert.deepEqual({ ...HVPG_CUTS }, { amber: 5, red: 10, bleed: 12, over: true });
  assert.deepEqual({ ...PPG_CUTS }, { amber: 6, red: 12 });
});

test('a gradient is ok, caution, danger at its cut-offs exactly, and the tables rate it the same', () => {
  for (const [name, cuts, sev, rate, mark] of [['hvpg', HVPG_CUTS, hvpgSev, hvpgRate, RATE.hvpg], ['ppg', PPG_CUTS, ppgSev, ppgRate, RATE.ppg]]) {
    assert.equal(sev(cuts.amber - 0.01), 'ok', name);
    assert.equal(sev(cuts.amber), cuts.over ? 'ok' : 'caution', name);
    assert.equal(sev(cuts.amber + 0.1), 'caution', name);
    assert.equal(sev(cuts.red - 0.01), 'caution', name);
    assert.equal(sev(cuts.red), 'danger', name);
    for (let v = -2; v <= 40; v += 0.05) {
      const x = Math.round(v * 100) / 100;
      assert.equal(rate(x), RATE_OF_SEV[sev(x)], `${name} ${x}`);
      assert.equal(mark(x)[0], rate(x), `${name} ${x}: the summary table`);
    }
  }
});

// Code (not words) that compares a gradient with a literal, or draws its cut-offs as literals. Strings are blanked first: the cards
// and slides say "normal ≤5, CSPH ≥10" in words, checked against the model by deck-thresholds.test.js.
const blank = (line) => line.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
const LITERAL_CUT = [
  /\b(?:hvpg|ppg)\b[^;\n]{0,24}(?:>=?|<=?|===?)\s*-?\d/i,
  /\d\s*(?:<=?|>=?)\s*[\w.]*\b(?:hvpg|ppg)\b/i,
  /\b(?:warn|bad)\s*:\s*\d/,
  /\bticks:\s*\[\s*(?:5|6)\s*,\s*(?:10|12)\s*\]/,
  /\bcuts:\s*\{[^}]*\[\s*(?:5|6)\s*,\s*(?:10|12)\s*\]/,
];
test('no file but the table writes a HVPG or PPG cut-off as a number', () => {
  const stray = [];
  for (const f of walk('src').filter((x) => x.endsWith('.js') && !/pressure-cuts\.js$|snapshots\.js$/.test(x))) {
    read(f).split('\n').forEach((line, i) => {
      const code = blank(line);
      if (LITERAL_CUT.some((re) => re.test(code))) stray.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(stray, [], 'read the cut-off from src/engine/pressure-cuts.js');
});

test('every file that rates a gradient takes the table', () => {
  for (const f of ['src/ui/dock.js', 'src/ui/pressure-time.js', 'src/ui/table-marks.js', 'src/ui/presenter.js', 'src/ui/menu.js', 'src/ui/talk-trace.js',
    'src/ui/hvpg-proc.js', 'src/ui/visual-plane.js', 'src/ui/anatomy.js', 'src/engine/events.js']) assert.match(read(f), /from '(?:\.\.\/engine|\.)\/pressure-cuts\.js/, f);
});

test('the plane draws the table: its ticks, cuts and zone edges', () => {
  const p = PLANES['hvpg-ppg'];
  assert.deepEqual(p.x.ticks, [HVPG_CUTS.amber, HVPG_CUTS.red]);
  assert.deepEqual(p.y.ticks, [PPG_CUTS.amber, PPG_CUTS.red]);
  assert.deepEqual(p.cuts, { x: [HVPG_CUTS.amber, HVPG_CUTS.red], y: [PPG_CUTS.amber, PPG_CUTS.red] });
  assert.deepEqual(Object.keys(p.lineNames.x).map(Number), [HVPG_CUTS.red]);
  assert.deepEqual(Object.keys(p.lineNames.y).map(Number), [PPG_CUTS.red]);
  const edges = new Set(p.zones.flatMap((z) => (z.when || []).map((w) => `${w[0]}:${w[2]}`)));
  assert.deepEqual([...edges].sort(), [`hvpg:${HVPG_CUTS.amber}`, `ppg:${PPG_CUTS.amber}`]);
});

test('a deck line that marks a cut-off on an HVPG or PPG chart marks one of the table', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, dir))).find((v) => Array.isArray(v?.slides));
    for (const s of d?.slides || []) {
      const t = s.tool;
      if (t?.kind !== 'curve') continue;
      const first = t.lines?.[0], cuts = first === 'hvpg' ? HVPG_CUTS : first === 'ppg' ? PPG_CUTS : null;
      if (cuts && Array.isArray(t.cuts)) for (const c of t.cuts) if (c !== cuts.amber && c !== cuts.red) bad.push(`${d.id}/${s.id}: ${first} cut ${c}`);
      if (t.x === 'hvpg' && t.xCuts) for (const c of [].concat(t.xCuts)) if (c !== HVPG_CUTS.amber && c !== HVPG_CUTS.red) bad.push(`${d.id}/${s.id}: x cut ${c}`);
    }
  }
  assert.deepEqual(bad, []);
});

// The colour a rating takes is one thing everywhere: data-rate "mid" is --caution (amber) and "hi" is --danger (red), never the other
// way about, in any rule of the stylesheet. (Rules that tint with the colour of a pill's own tone, --tone, are set from these.)
test('the stylesheet colours "mid" amber and "hi" red, everywhere', () => {
  const css = read('styles/app.css');
  const bad = [];
  for (const m of css.matchAll(/([^{}]*\[data-rate="(mid|hi)"\][^{}]*)\{([^{}]*)\}/g)) {
    const [, sel, rate, body] = m, want = rate === 'mid' ? 'caution' : 'danger', other = rate === 'mid' ? 'danger' : 'caution';
    // (A selector list can name both ratings: each declaration belongs to the rating it follows, so only a single-rating rule is judged.)
    if (/\[data-rate="(?:mid|hi)"\]/.test(sel.replace(new RegExp(`\\[data-rate="${rate}"\\]`, 'g'), ''))) continue;
    const colours = [...body.matchAll(/(?:color|fill|stroke|--tone|--c)\s*:\s*([^;]+)/g)].map((x) => x[1]);
    for (const c of colours) if (new RegExp(`var\\(--${other}\\)`).test(c) && !new RegExp(`var\\(--${want}\\)`).test(c)) bad.push(`${sel.trim().slice(0, 70)} → ${c.trim()}`);
  }
  assert.deepEqual(bad, []);
});

// The timeline's events take the colour of the readings they name: HVPG at 10 or more is red on the tile, so its CSPH event (and the HVPG 12
// one above it) is red too, never amber (Mohammad, 31 Oct).
test('the HVPG events are red, as the readings they name', () => {
  const ev = read('src/engine/events.js');
  for (const id of ['CSPH', 'BLEED_RISK']) assert.match(ev, new RegExp(`id: '${id}', on: \\(m\\) => m\\.hvpg[^\\n]*severity: 'danger'`), id);
  assert.equal(hvpgSev(HVPG_CUTS.red), 'danger');
});

// Portal hypertension is an HVPG above 5 mmHg (Baveno VIII: normal 1 to 5), CSPH 10 or more. The readings arrive at one decimal, so these
// are the values a tile can actually print on each side of each line (external review, 14 Nov 2026: 5.0 was amber and "normal" at once).
test('the HVPG boundaries: 5.0 is normal, 5.1 is portal hypertension, 10.0 is CSPH', () => {
  const want = { 4.9: 'ok', 5: 'ok', 5.1: 'caution', 9.9: 'caution', 10: 'danger', 10.1: 'danger' };
  for (const [v, sev] of Object.entries(want)) assert.equal(hvpgSev(Number(v)), sev, `HVPG ${v}`);
  assert.equal(ppgSev(5.9), 'ok'); assert.equal(ppgSev(6), 'caution'); assert.equal(ppgSev(12), 'danger');
});

// No sentence in the app puts the HVPG's normal below 5 or portal hypertension at 5 or more: the words say what the colours do.
test('no text calls an HVPG of 5 abnormal', () => {
  const bad = [];
  for (const p of walk('src').filter((f) => f.endsWith('.js'))) {
    read(p).split('\n').forEach((line, i) => {
      const t = line.replace(/\\u2265/g, '≥').replace(/\\u2264/g, '≤');
      if (/HVPG[^.;'`]{0,40}(?:≥|>=)\s?5 mmHg/.test(t) || /[Nn]ormal\s?<\s?5 mmHg/.test(t) || /HVPG[^.;'`]{0,20}<\s?5 mmHg/.test(t)) bad.push(`${p}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
