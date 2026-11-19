// The deck sweep (Mohammad, 19 Nov 2026: "so we find this crap"): EVERY slide of EVERY real deck at every device size and orientation, layout only.
//
//   node scripts/deck-sweep.mjs [--dir .|dist] [--devices mac,mac-short,ipad,ipad-portrait,iphone,iphone-landscape] [--decks hvpg,ascites | all]
//        [--slides 1-3] [--jobs 4] [--parts 2] [--rate 20] [--timeout 60] [--out report.json] [--fast] [--verbose]
//
// Numbers only: the page's state, layout and words are real, every GL draw is stubbed, nothing is painted and no picture is taken. Each slide is stepped to
// with the presenter (pps.gallery.slide), waited for until it has landed (pps.gallery.settled), and read until two reads agree. What it judges:
//   - the shared fit rules (fit-rules.js: scroll, clipped, off, small lettering, title ratio, sideways, styled ...), the same ones the gallery's Check runs;
//   - the edge rules (edge-rules.js): each card's last line against its VISIBLE edge and the screen's, words cut by a clipping box, strip-edge glyphs of
//     the card behind, words outside their glass;
//   - on a screen where the two cards share one place (the Shuffle, an iPhone on its side) BOTH states: the words in front, then the instrument in front;
//   - a case or question card that holds the slide, read as it stands and again once it is tapped away.
// It says "the numbers fit", never "it looks right". Output: the failures as they come, a report (--out, JSON) and a text summary beside it.
// --fast: the figure is not drawn at all (window.ppsLayoutOnly, seen.js) and frames come every 100 ms of app time; about a third quicker, and `--verify`
// compares it with a plain run on a few decks so the shortcut is never trusted on its own word.
// --cards-only: no figure at all (window.ppsCardsOnly, src/ui/cards-only.js: the stage is a stand-in that does nothing), so a slide costs only
// its cards: boot 2 s instead of 8, a step 0.1 to 1.3 s instead of 1.2 to 8 s. It cannot judge what the cards take from the figure (call-outs
// on vessels, labels, the camera's framing): `node scripts/deck-sweep-compare.mjs <full.json> <cards.json>` lists every slide whose
// problems differ between a full run and a cards-only one over the same slides, so the shortcut is never trusted on its own word.
// Runs go side by side (--jobs): a chunk is one device and one part of the decks, one browser page each (touch devices get touch, so `(pointer: coarse)` rules apply).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchLayout } from './headless.mjs';
import { DECKS } from '../src/ui/decks.js';
import { SIZES } from './gallery-sweep-lib.mjs';
import { chunksFor, slideProblems, summarize, parseSlides } from './deck-sweep-lib.mjs';
import { deckRun } from '../src/ui/report/emit.js';
import { runBlock } from '../src/ui/report/run.js';
import { pointTo } from './debug-notice.mjs';
pointTo('sweep decks ...');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const list = (n, d) => { const v = opt(n, d); return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined; };

const DIR = opt('dir', '.');
const DEVICES = list('devices', Object.keys(SIZES).join(',')).filter((d) => SIZES[d]);
const WANT = list('decks', 'all');
const SLIDES = parseSlides(opt('slides', ''));
const JOBS = Math.max(1, +opt('jobs', 4));
const PARTS = Math.max(1, +opt('parts', 2));
const RATE = Math.max(1, +opt('rate', 20));
const TIMEOUT_MS = Math.max(5, +opt('timeout', 60)) * 1000;
const OUT = opt('out', '');
const CARDS = flag('cards-only');
const FAST = flag('fast') || CARDS;
const NAP = CARDS ? 120 : 250;   // (the read-until-two-agree pause, real ms)
const VERBOSE = flag('verbose');

const withTimeout = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(`${what} took more than ${Math.round(ms / 1000)} s`)), ms); })]).finally(() => clearTimeout(t)); };

const decks = DECKS.filter((d) => WANT[0] === 'all' || WANT.includes(d.id));
if (!decks.length) { console.error('no deck matches'); process.exit(2); }
const L = await launchLayout({ dir: resolve(ROOT, DIR), prefix: '/preview' });   // (scripts/headless.mjs: the one layout-only opener, GL draws stubbed)
const T0 = Date.now();
const results = {};

const bootFor = async (device) => {
  const s = SIZES[device];
  const app = await L.open({ device: device === 'mac-short' ? 'mac' : device, query: `gallery&testclock=${RATE}${FAST ? '&testframe=100' : ''}&look=light`, layoutOnly: FAST, cardsOnly: CARDS });
  await app.page.setViewportSize({ width: s.w, height: s.h });
  await app.page.waitForFunction(() => !!window.pps?.gallery?.slide, null, { timeout: 120000 });
  return app;
};

/** One slide, all in one call into the page (no round trips between the steps): step to it, wait, read until two reads agree, the case card, the Shuffle's other state. */
const IN_PAGE = async ({ deck, i, t, nap0 }) => {
  const g = window.pps.gallery, P = window.pps.presenter;
  const nap = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const opened = await g.slide(deck, i, { timeoutMs: t });
  const read = async () => {
    let a = { check: g.check(), boxes: JSON.stringify(g.boxes().boxes) }, stable = false;
    for (let k = 0; k < 6; k++) {
      await nap(nap0);
      const b = { check: g.check(), boxes: JSON.stringify(g.boxes().boxes) };
      if (a.boxes === b.boxes) { stable = true; a = b; break; }
      a = b;
    }
    return { check: a.check, stable };
  };
  const out = { opened, main: null, held: null, back: null, shuffle: false };
  if (opened.ok === false && !opened.settled) { out.main = await read(); return out; }
  const kase = document.querySelector('.pz-case.on');
  if (kase) {
    out.held = await read();   // (the case card standing over the slide)
    kase.click();
    await g.settled({ timeoutMs: t });
    await nap(300);
  }
  out.main = await read();
  const sh = P.shuffle?.();
  if (sh?.active?.()) {
    out.shuffle = true;
    // (The spring takes about 0.4 s to land: read when two reads 150 ms apart agree.)
    const still = async () => { let a = JSON.stringify(g.edges()); for (let k = 0; k < 12; k++) { await nap(150); const b = JSON.stringify(g.edges()); if (a === b) return JSON.parse(b); a = b; } return JSON.parse(a); };
    await g.shuffleTo(1);
    await still();
    out.back = { check: g.check() };
    await g.shuffleTo(0);
    await still();
  }
  out.count = P.count?.() ?? 0;
  return out;
};

async function runChunk(chunk) {
  let app = await bootFor(chunk.device);
  let seen = 0;
  const reboot = async () => { await app.close().catch(() => {}); app = await bootFor(chunk.device); seen = 0; };
  try {
    for (const d of chunk.decks) {
      const total = d.slides.length;
      for (let i = 0; i < total; i++) {
        if (SLIDES && !SLIDES.has(i + 1)) continue;
        const key = `${d.id}#${i + 1}@${chunk.device}`, t0 = Date.now();
        let rec;
        try {
          const r = await withTimeout(app.page.evaluate(IN_PAGE, { deck: d.id, i, t: TIMEOUT_MS * RATE, nap0: NAP }), TIMEOUT_MS * 2 + 30000, `${d.id} slide ${i + 1} on ${chunk.device}`);
          const errors = app.errors.slice(seen); seen = app.errors.length;
          const problems = slideProblems(r);
          rec = { deck: d.id, slide: i + 1, device: chunk.device, ok: r.opened.ok !== false, settled: r.opened.settled !== false, ms: Date.now() - t0, stable: !!r.main?.stable, shuffle: r.shuffle, problems,
            ...(errors.length ? { errors: errors.slice(0, 3).map((e) => e.slice(0, 200)) } : {}), ...(r.opened.error ? { error: String(r.opened.error) } : {}) };
        } catch (e) {
          rec = { deck: d.id, slide: i + 1, device: chunk.device, ok: false, settled: false, ms: Date.now() - t0, problems: [], error: String(e.message).split('\n')[0].slice(0, 300) };
          await reboot();
        }
        results[key] = rec;
        if (VERBOSE || rec.ok === false || rec.problems.length) console.log(`${chunk.device} ${d.id} ${i + 1}/${total}: ${rec.ok === false ? `DID NOT OPEN (${rec.error})` : `${rec.problems.length} problems`}${VERBOSE ? ` ${rec.ms} ms` : ''}`);
        for (const p of rec.problems) console.log(`    ${p}`);
      }
    }
  } finally { await app.close().catch(() => {}); }
  console.log(`${chunk.name}: done (${Math.round((Date.now() - T0) / 1000)} s so far)`);
}

const chunks = chunksFor(DEVICES, decks, PARTS);
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, chunks.length) }, async () => {
  for (let j = next++; j < chunks.length; j = next++) {
    try { await runChunk(chunks[j]); } catch (e) { console.log(`${chunks[j].name}: the run stopped: ${String(e.message).split('\n')[0]}`); }
  }
}));
await L.close();

const report = { schema: 1, at: new Date().toISOString(), devices: DEVICES, decks: decks.map((d) => d.id), fast: FAST, cardsOnly: CARDS, rate: RATE, seconds: (Date.now() - T0) / 1000, results: Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b))) };
const run = deckRun(report);
const summary = `${summarize(report)}\n\n${runBlock(run)}`;   // (the text, then the one report block `npm run debug -- report show|compare` reads)
if (OUT) { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(OUT, JSON.stringify(report, null, 1)); writeFileSync(OUT.replace(/\.json$/, '') + '.txt', `${summary}\n`); }
console.log(`\n${summary}`);
process.exit(Object.values(results).some((r) => r.ok === false || r.problems.length) ? 1 : 0);
