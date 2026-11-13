// No two series on one chart wear the same colour (Mohammad, 13 Nov 2026, the "Portal pressure and PPG over six months" chart: both lines pink,
// "those are same color almost not good"). The cause was not that slide: the charts took a reading's colour from tables of their own, several readings
// shared one token (the portal pressure and the PPG, the ascites and the liver flow), and a curve's reading with no entry took a colour by its place in the
// chart. Every chart now reads one table (reading-colours.js). This test walks every chart every deck draws, in all five looks, and fails when two of its
// lines share a colour or are closer than the palette floor (OKLab ΔE x100, SERIES_MIN_DE), so a new slide cannot bring the bug back.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const { READING_COLOUR, SERIES_MIN_DE } = await import('../src/ui/reading-colours.js');
const { LINE, MEAL_LINES } = await import('../src/ui/flow-time.js');
const { graphLines } = await import('../src/ui/lapse-graph.js');
const { eventLines } = await import('../src/ui/event-graph.js');
const { drawnLines, lineMeta } = await import('../src/ui/tool-curve.js');
const { TRACES } = await import('../src/ui/pressure-time.js');
const { tokensOfLook, LOOK_IDS } = await import('../src/ui/theme-tokens.js');
const { withVarsResolved } = await import('../src/ui/chart-looks/resolve.js');
const { parseCssColor } = await import('../src/ui/css-color.js');

const decks = (await Promise.all(readdirSync(new URL('../src/ui/decks/', import.meta.url)).map((f) => import(`../src/ui/decks/${f}`))))
  .flatMap((m) => Object.values(m)).filter((d) => d?.slides && d.id);
const unique = [...new Map(decks.map((d) => [d.id, d])).values()];

// ── OKLab distance (x100), the palette floor's own measure ──
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const dE = (a, b) => { const p = oklab(a), q = oklab(b); return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const LOOKS = Object.fromEntries(LOOK_IDS.map((id) => [id, withVarsResolved(tokensOfLook(id))]));
const rgbOf = (look, tok) => { const c = parseCssColor(LOOKS[look][tok.replace(/^--/, '')]); assert.ok(c, `${look}: ${tok} is a colour`); return c; };

/** The ways a chart's lines break the rule: lines: [{ k, c, dash? }] (a reading, its colour token, a dashed repeat of a reading). → a list of words, empty when fine. */
export function clashes(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (a.k === b.k && (a.dash || b.dash)) continue;   // (a dashed repeat of a reading is the same reading in another state: the colour says which reading, the dashes which state)
    if (a.c === b.c) { out.push(`${a.k} and ${b.k} both ${a.c}`); continue; }
    if (a.ref || b.ref) continue;   // (the diagonal where nothing changed is a neutral guide, never a reading: it only has to differ from the lines)
    for (const look of LOOK_IDS) {
      const d = dE(rgbOf(look, a.c), rgbOf(look, b.c));
      if (d < SERIES_MIN_DE) out.push(`${a.k} (${a.c}) and ${b.k} (${b.c}) are ΔE ${d.toFixed(1)} apart in ${look}`);
    }
  }
  return out;
}

const lineOf = (k) => ({ k, c: LINE[k][3] });
/** Every chart the decks draw: { where, lines }. */
function charts() {
  const out = [{ where: 'the meal chart', lines: MEAL_LINES.map(lineOf) }];
  for (const d of unique) for (const s of d.slides) {
    const where = `${d.id}/${s.id}`;
    if (s.tool?.kind === 'flowtime') out.push({ where: `${where} (flow-time chart)`, lines: s.tool.lines.map(lineOf) });
    if (s.tool?.kind === 'curve') out.push({ where: `${where} (curve)`, lines: drawnLines(s.tool).map((l) => ({ k: l.k, c: l.c, dash: l.dash, ref: l.ref })) });
    const g = graphLines(s); if (g) out.push({ where: `${where} (time-lapse graph)`, lines: g.map(lineOf) });
    const e = eventLines(s); if (e) out.push({ where: `${where} (procedure graph)`, lines: e.map(lineOf) });
  }
  return out;
}

test('the checker itself: the same colour twice, and two colours too near, are caught', () => {
  assert.equal(clashes([{ k: 'pv', c: '--tr-pv' }, { k: 'ppg', c: '--tr-pv' }]).length, 1, 'the one colour');
  assert.ok(clashes([{ k: 'pv', c: '--tr-pv' }, { k: 'whvp', c: '--tr-wedge' }]).length > 0, 'magenta and orchid are 11 apart');
  assert.deepEqual(clashes([{ k: 'pv', c: '--tr-pv' }, { k: 'pvFlow', c: '--tr-hv' }]), []);
  assert.deepEqual(clashes([{ k: 'gv', c: '--tr-var' }, { k: 'gv', c: '--tr-var', dash: true }]), [], 'a dashed repeat keeps its reading\'s colour');
});

test('the portal pressure and the PPG, the chart Mohammad flagged, wear two colours', () => {
  assert.notEqual(LINE.pv[3], LINE.ppg[3]);
  assert.equal(LINE.ppg[3], '--tr-ppg');
  assert.deepEqual(clashes(['pv', 'ppg'].map(lineOf)), []);
});

test('no chart of any deck draws two lines in one colour, or two too near, in any look', () => {
  const all = charts();
  assert.ok(all.length > 60, `${all.length} charts found`);
  const bad = all.flatMap((c) => clashes(c.lines).map((w) => `${c.where}: ${w}`));
  assert.deepEqual([...new Set(bad)], []);
});

test('the flow-time chart and the curve read one table: a reading has one colour on both', () => {
  for (const k of Object.keys(LINE)) assert.equal(LINE[k][3], READING_COLOUR[k], `${k}: flow-time`);
  for (const k of Object.keys(READING_COLOUR)) assert.equal(lineMeta(k, 0).c, READING_COLOUR[k], `${k}: curve`);
  // (the position a reading holds in a chart never picks its colour: the same reading first or second)
  for (const k of Object.keys(READING_COLOUR)) assert.equal(lineMeta(k, 1).c, lineMeta(k, 0).c, `${k}: place`);
});

test('every reading a deck plots has an entry: none falls back to its place in the chart', () => {
  const used = new Set();
  for (const d of unique) for (const s of d.slides) {
    if (s.tool?.kind === 'flowtime') s.tool.lines.forEach((k) => used.add(k));
    if (s.tool?.kind === 'curve') drawnLines(s.tool).forEach((l) => used.add(l.k));
    (graphLines(s) || []).forEach((k) => used.add(k)); (eventLines(s) || []).forEach((k) => used.add(k));
  }
  const missing = [...used].filter((k) => !(k in READING_COLOUR));
  assert.deepEqual(missing, [], 'add the reading to reading-colours.js, choosing the colour no partner on its charts wears');
});

test('the beat trace draws each of its lanes in its own token', () => {
  const toks = TRACES.map((t) => t.c);
  assert.equal(new Set(toks).size, toks.length, `lanes: ${toks.join(' ')}`);
});
