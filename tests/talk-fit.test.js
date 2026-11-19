// The "Pressure so far" chart fits its box, on every card of every deck (Mohammad, 18 Nov 2026, iPhone, Next bleed 6: the stage names wrapped
// in five lines over a plot 50 px tall, the legend (FHVP) and the time row cut off by the card). The chart's pieces are painted on the GPU from a
// hidden model, so the page's fit rules (which read words in the DOM) never saw them; this builds the chart's layout (talk-trace.js layoutTalk,
// pure) for the chain of every slide that shows it, at the box sizes the card gives it, and judges the numbers:
//   - every word's foot (the time row, the readings rows) is inside the box, and the plot keeps its least height
//   - the legend stands inside the plot, its names a line and a quarter apart
//   - every word the header writes is inside the box's width, none cut short (a name's lines are its words, whole)
//   - every word is the host's size, 12 px at least
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { deckStatesFull } from './deck-states.js';
import { stateIndex } from '../src/ui/highlight-math.js';
import { talkChain } from '../src/ui/talk-chain.js';
import { layoutTalk, plotMinOf, stepR, wrapName } from '../src/ui/talk-trace.js';
import { bandKeys, bandRuns } from '../src/ui/rx-bands.js';
import { measure } from '../src/ui/glyph-measure.js';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { LABEL_MAX } from '../src/ui/trace-labels.js';

const tw = (t, f, wt = 600) => measure(t, `${wt} ${f}px Inter`);
// (The card's inner widths: a small phone, the iPhone, a big phone and a tablet's column, a wide card. Box heights: the stacked card's chart height
// clamp(190, 60cqi, 300) and its short-phone floor of 150, then the wide card's 280 and its tall 420; the treatments' rows come on top, as the CSS adds them.)
const WIDTHS = [300, 350, 400, 520, 700];
const HEIGHTS = [150, 190, 230, 280, 420];
const FONTS = [12, 14];
const MIN_PLOT_H = 150;   // (no card gives a chart less than this)

const cases = [];
for (const d of DECKS) {
  if (!d.slides.some((s) => s.tool?.kind === 'trace' && s.tool.range === 'talk' && s.tool.style !== 'milestones')) continue;
  cases.push(d);
}

test('the decks that show the talk chart are found', () => { assert.ok(cases.length >= 3, `found ${cases.map((d) => d.id)}`); });

for (const d of cases) {
  test(`${d.id}: the talk chart fits its box on every slide that shows it`, async () => {
    const states = await deckStatesFull(d), stateOf = stateIndex(d.slides), bad = [];
    let checked = 0;
    d.slides.forEach((s, i) => {
      if (s.tool?.kind !== 'trace' || s.tool.range !== 'talk' || s.tool.style === 'milestones') return;
      const pts = talkChain(d.slides, stateOf, states, i, s.tool.since).filter((c) => c.fp);
      if (!pts.length) return;
      const runs = bandKeys(s.tool).length ? bandRuns(pts.map((p) => p.params), bandKeys(s.tool)) : [];
      const gapName = typeof s.tool.gap === 'string' && s.tool.gap.trim() ? s.tool.gap.trim() : 'PV − WHVP';
      for (const fs of FONTS) for (const W of WIDTHS) for (const base of HEIGHTS) {
        if (fs > 12 && base < 230) continue;   // (a 14 px host is a big screen: its card is not 150 px tall)
        const one = layoutTalk({ pts, W, HT: base, fs, runs, gapName, tw });
        const HT = base + one.room, Lo = layoutTalk({ pts, W, HT, fs, runs, gapName, tw }), tag = `${d.id}/${s.id} ${W}x${Math.round(HT)} ${fs}px [${Lo.mode}, rows ${Lo.rows}]`;
        checked++;
        const plotMin = 3.4 * fs;   // (the legend's three names a line and a quarter apart, with their margins; the layout aims higher, plotMinOf)
        if (Lo.bottom > HT + 0.5) bad.push(`${tag}: the foot of the lowest word is ${Math.round(Lo.bottom)} px in a box ${Math.round(HT)} px tall`);
        if (Lo.plot < plotMin - 0.5 && base >= MIN_PLOT_H) bad.push(`${tag}: the plot is ${Math.round(Lo.plot)} px (at least ${Math.round(plotMin)}, aimed at ${Math.round(plotMinOf(fs))})`);
        const e = Lo.ends;
        if (e.length && (e[0].y < Lo.T - 0.5 || e.at(-1).y > Lo.B + 0.5)) bad.push(`${tag}: the legend runs out of the plot (${e.map((x) => Math.round(x.y))} in ${Math.round(Lo.T)}-${Math.round(Lo.B)})`);
        for (let k = 1; k < e.length; k++) if (e[k].y - e[k - 1].y < 1.2 * fs) bad.push(`${tag}: two legend names touch`);
        if (Lo.mode === 'steps') {
          const need = (pts.at(-1).tick || '').split(/\s+/).filter(Boolean).join(' ');
          assert.equal(Lo.cap.join(' '), need, `${tag}: the caption is the latest name, whole`);
          if (Lo.cap.some((t) => Lo.capX + tw(t, fs, 600) > W - 2)) bad.push(`${tag}: the caption runs past the card's right edge`);
          if (Lo.cap.length > 3) bad.push(`${tag}: the caption takes ${Lo.cap.length} lines`);
          if (!Lo.stepKept.has(Lo.last)) bad.push(`${tag}: the latest step has no ring`);
        } else {
          Lo.blocks.forEach((b, k) => { if (Lo.mp.at[k].show && b.lines.length > 3) bad.push(`${tag}: stage name ${k + 1} takes ${b.lines.length} lines`); });
        }
      }
    });
    assert.ok(checked > 0);
    assert.deepEqual(bad.slice(0, 12), [], `${bad.length} problems`);
  });
}

test('the card of the report: Next bleed 6 on an iPhone is the steps header, one caption, the whole plot and legend', async () => {
  const d = DECKS.find((x) => x.id === 'next-bleed'), states = await deckStatesFull(d), stateOf = stateIndex(d.slides);
  const i = d.slides.findIndex((s) => s.id === 'nsbb'), pts = talkChain(d.slides, stateOf, states, i, d.slides[i].tool.since).filter((c) => c.fp);
  const Lo = layoutTalk({ pts, W: 350, HT: 200, fs: 12, runs: [], tw });
  assert.ok(Lo.plot >= plotMinOf(12));
  assert.ok(Lo.bottom <= 200);
  assert.equal(Lo.rows, 2, 'both readings rows still fit');
  assert.ok(Lo.headH <= 3 * Lo.lineH + 6, `the header is ${Lo.headH} px`);
});

test('a header that does not fit changes to steps, never to a taller header; short names keep their place over a wide plot', () => {
  const mk = (names) => names.map((t, k) => ({ n: k + 1, when: `Day ${k * 30}`, day: `Day ${k * 30}`, tick: t, fp: { pv: 20 - k, whvp: 18 - k, fhvp: 3, hvpg: 15 - k } }));
  const long = mk(['The bleeding has stopped, the portal hypertension has not', 'Bands slough and the varices recur', 'Carvedilol lowers the pressure behind the varices', 'EVL plus carvedilol is first-line']);
  assert.equal(layoutTalk({ pts: long, W: 350, HT: 200, fs: 12, tw }).mode, 'steps');
  assert.equal(layoutTalk({ pts: long, W: 900, HT: 300, fs: 12, tw }).mode, 'steps', 'sentences do not stand over a plot, wide or not');
  const short = mk(['Before PVT', 'Partial PVT', 'Carvedilol', 'Anticoagulation']);
  const wide = layoutTalk({ pts: short, W: 700, HT: 300, fs: 12, tw });
  assert.equal(wide.mode, 'names');
  assert.ok(wide.bottom <= 300);
});

test('a ring holds its number: the ring is as wide as two digits in the host\'s size', () => {
  for (const fs of [12, 14]) assert.ok(2 * stepR(fs) >= tw('10', fs, 700) + 3, `${fs}`);
});

test('every word of the chart is the host\'s size or more: 12 px at least, so its looks are 1 em', () => {
  for (const k of ['talk.stage', 'talk.when', 'talk.span', 'talk.read', 'talk.read.name', 'talk.lbl.n', 'talk.lbl.v', 'talk.gap.name', 'talk.rx.name', 'talk.step.n', 'plot.grid.text', 'plot.unit']) {
    const t = LOOKS[k]?.base?.font ?? LOOKS[k]?.base?.size;
    assert.ok(t, `${k} has a look`);
    const size = Array.isArray(t) ? t[1] : t;
    assert.equal(JSON.stringify(size).includes('0.9') || JSON.stringify(size).includes('0.8'), false, `${k} is under 1 em: ${JSON.stringify(size)}`);
  }
  assert.ok(wrapName);
});

test('every state on a talk chart has a short name of its own (a tick), not its slide\'s sentence', async () => {
  for (const d of cases) {
    const states = await deckStatesFull(d), stateOf = stateIndex(d.slides), last = d.slides.map((s, i) => [s, i]).filter(([s]) => s.tool?.kind === 'trace' && s.tool.range === 'talk').at(-1);
    for (const p of talkChain(d.slides, stateOf, states, last[1], last[0].tool.since)) {
      assert.ok(p.tick !== p.title && p.tick.length <= LABEL_MAX && p.tick.split(/\s+/).length <= 4, `${d.id}/${p.id}: "${p.tick}" is not a short name (set tick: on the slide)`);
    }
  }
});
