// The rotation sweep (19 Nov 2026): turn the screen in the middle of a talk and lay it out as a fresh open at that size does.
//
//   node scripts/rotate-sweep.mjs [--decks hvpg,ascites | all] [--slides 1-12] [--devices ipad,ipad-portrait,iphone,iphone-landscape,mac,mac-short]
//        [--dir .|dist] [--rate 20] [--timeout 60] [--out report.json]
//
// For every slide: the slide is opened at one size, the window is resized to the other (what a turned iPad does, a resize), and the cards' boxes and the fit
// rules' findings are read once the slide has settled; the same slide opened fresh at that size is the reference. Any difference is a layout that depends on
// where the window has been (the data card above the screen after an iPad turn, HVPG 3), reported as a finding. Layout only, as the deck sweep: GL draws stubbed,
// the cards-only app, no picture. Local only: no workflow runs it.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CHROMIUM_ARGS, openApp } from './shoot.mjs';
import { serve } from './serve.mjs';
import { DECKS } from '../src/ui/decks.js';
import { SIZES } from './gallery-sweep-lib.mjs';
import { judgeEdges } from '../src/ui/gallery/edge-rules.js';
import { parseSlides, slideProblems } from './deck-sweep-lib.mjs';
import { compareTurn, summarizeTurns, turnsFor } from './rotate-sweep-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const list = (n, d) => (opt(n, d) || '').split(',').map((s) => s.trim()).filter(Boolean);
const DIR = opt('dir', '.'), RATE = Math.max(1, +opt('rate', 20)), TIMEOUT_MS = Math.max(5, +opt('timeout', 60)) * 1000, OUT = opt('out', '');
const DEVICES = list('devices', 'ipad,ipad-portrait,iphone,iphone-landscape,mac,mac-short');
const WANT = list('decks', 'hvpg'), SLIDES = parseSlides(opt('slides', ''));
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const STUB = `(() => { for (const C of [window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {}; } })(); window.ppsLayoutOnly = true; window.ppsCardsOnly = true;`;

const decks = DECKS.filter((d) => WANT[0] === 'all' || WANT.includes(d.id));
const turns = turnsFor(DEVICES);
if (!decks.length || !turns.length) { console.error('no deck or no pair of sizes to turn between'); process.exit(2); }
const server = await serve(resolve(ROOT, DIR), 0, { prefix: '/preview' });
const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
const T0 = Date.now(), results = {};

const boot = async (device) => {
  const s = SIZES[device];
  const app = await openApp({ device: device === 'mac-short' ? 'mac' : device, theme: 'light', query: `gallery&testclock=${RATE}&testframe=100&look=light`, url: server.url, dir: DIR, browser, initScript: STUB, dpr: 1, timeout: 120000, gpuPath: false });
  await app.page.setViewportSize({ width: s.w, height: s.h });
  await app.page.waitForFunction(() => !!window.pps?.gallery?.slide, null, { timeout: 120000 });
  return app;
};
const open = (app, deck, i) => app.page.evaluate(({ deck, i, t }) => window.pps.gallery.slide(deck, i, { timeoutMs: t }), { deck, i, t: TIMEOUT_MS * RATE });
/** Read once the slide has settled and two reads agree (as the deck sweep does). */
const read = (app) => app.page.evaluate(async ({ t }) => {
  const g = window.pps.gallery, nap = (ms) => new Promise((ok) => setTimeout(ok, ms));
  await g.settled({ timeoutMs: t });
  const get = () => ({ check: g.check(), edges: g.edges(), boxes: g.boxes().boxes });
  let a = get(), stable = false;
  for (let k = 0; k < 8; k++) { await nap(150); const b = get(); if (JSON.stringify(a.boxes) === JSON.stringify(b.boxes)) { stable = true; a = b; break; } a = b; }
  return { ...a, stable };
}, { t: TIMEOUT_MS * RATE });
const shape = (r) => ({ boxes: r.boxes, problems: slideProblems({ main: r }, judgeEdges) });

// The fresh reference of every device the turns end at, then the turned reads.
const targets = [...new Set(turns.map(([, to]) => to))];
const fresh = {};
for (const dev of targets) {
  const app = await boot(dev);
  try {
    for (const d of decks) for (let i = 0; i < d.slides.length; i++) {
      if (SLIDES && !SLIDES.has(i + 1)) continue;
      const o = await open(app, d.id, i);
      fresh[`${d.id}#${i + 1}@${dev}`] = o.ok === false ? { error: String(o.error || 'did not open') } : shape(await read(app));
    }
  } finally { await app.close().catch(() => {}); }
  console.log(`fresh ${dev}: done (${Math.round((Date.now() - T0) / 1000)} s)`);
}
for (const [from, to] of turns) {
  let app = await boot(from);
  try {
    for (const d of decks) for (let i = 0; i < d.slides.length; i++) {
      if (SLIDES && !SLIDES.has(i + 1)) continue;
      const turn = `${from} > ${to}`, key = `${d.id}#${i + 1} ${turn}`, ref = fresh[`${d.id}#${i + 1}@${to}`];
      let rec = { deck: d.id, slide: i + 1, turn };
      try {
        const o = await open(app, d.id, i);
        if (o.ok === false || !ref || ref.error) throw new Error(ref?.error || String(o.error || 'did not open'));
        await app.page.setViewportSize({ width: SIZES[to].w, height: SIZES[to].h });
        const got = compareTurn(ref, shape(await read(app)));
        rec = { ...rec, ok: true, ...got };
        await app.page.setViewportSize({ width: SIZES[from].w, height: SIZES[from].h });
      } catch (e) {
        rec = { ...rec, ok: false, same: false, boxes: [], problems: [], error: String(e.message).split('\n')[0].slice(0, 300) };
        await app.close().catch(() => {}); app = await boot(from);
      }
      results[key] = rec;
      if (rec.ok === false || !rec.same) { console.log(`${rec.turn} ${rec.deck} ${rec.slide}: ${rec.ok === false ? `DID NOT OPEN (${rec.error})` : `${rec.boxes.length} boxes, ${rec.problems.length} findings differ`}`); for (const t of [...rec.boxes, ...rec.problems]) console.log(`    ${t}`); }
    }
  } finally { await app.close().catch(() => {}); }
  console.log(`${from} > ${to}: done (${Math.round((Date.now() - T0) / 1000)} s)`);
}
await browser.close();
server.close();

const report = { schema: 1, at: new Date().toISOString(), turns, decks: decks.map((d) => d.id), seconds: (Date.now() - T0) / 1000, results };
const summary = summarizeTurns(report);
if (OUT) { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(OUT, JSON.stringify(report, null, 1)); writeFileSync(OUT.replace(/\.json$/, '') + '.txt', `${summary}\n`); }
console.log(`\n${summary}`);
process.exit(Object.values(results).some((r) => r.ok === false || !r.same) ? 1 : 0);
