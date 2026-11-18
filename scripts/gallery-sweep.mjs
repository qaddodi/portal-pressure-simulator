// The layout sweep (plan step 5, /mnt/project-files/card-gallery-plan/faster-checks-recs.md): every gallery specimen at every device size, in headless
// Chromium with every GL draw stubbed, and a layout diff against the last good run.
//
//   node scripts/gallery-sweep.mjs [--dir .|dist] [--devices mac,mac-short,ipad,ipad-portrait,iphone,iphone-landscape] [--looks light,navy]
//        [--family doppler,trace] [--section "Teaching cards"] [--kind slide,pane] [--ids a/b,c/d] [--shard 1/3] [--jobs 3] [--rate 20]
//        [--timeout 60] [--out fit-report.json] [--baseline <file>] [--no-diff] [--update-baseline --why "<reason>"] [--tol 2] [--verbose]
//
// Layout only (owner, 18 Nov 2026: the headless ban is lifted for exactly this and nothing else): the page's state, layout and words are real and
// nothing is painted. It takes no picture, judges no colour, glass, lettering drawn by the GPU, Safari-only layout or real timing, and a pass says
// "the cards fit and nothing moved" and never "it looks right".
//
// How: one boot per run (a browser context), the sizes by `setViewportSize` on the same page, the test clock at `--rate` times real pace
// (?testclock=N: entries finish in moments but take their real path), each specimen opened by `pps.gallery.open(id)` and read with
// `check()` (the shared fit rules, src/ui/gallery/fit-rules.js), `boxes()` and `words()`. Runs go side by side (--jobs): desktop with a mouse (Mac, Mac
// short), then the touch ones (iPad both ways, iPhone both ways) so `(pointer: coarse)` rules apply. Extra looks are switched live on the open specimen
// and only their boxes read: a look changes colour, not layout, so any box that moves with the look is a finding on its own.
//
// What it writes: the report (--out, JSON: every result, its boxes and words) and a text summary. The baseline (default
// /mnt/project-files/gallery-baselines/layout-baseline.json, kept outside the repo) holds the last good run: the summary lists each specimen's box that
// grew, moved or went, each words list that changed, and each fit problem that is new. A baseline is replaced only with --update-baseline --why "...".
// Exit 1: a specimen that did not open, a fit problem or page error the baseline does not already hold. (A layout change alone is reported, not failed:
// a thread reviews it.)

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CHROMIUM_ARGS, openApp } from './shoot.mjs';
import { serve } from './serve.mjs';
import { CATALOG, LOOK_IDS, sid } from '../src/ui/gallery/catalog.js';
import { galleryDeck } from '../src/ui/gallery/deck.js';
import { SIZES, unitsFor, keyOf, normBoxes, normWords, normProblems, diffReports, newTrouble, summaryText, makeBaseline, pickIds } from './gallery-sweep-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const list = (n, d) => { const v = opt(n, d); return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined; };

const DIR = opt('dir', '.');
const DEVICES = list('devices', Object.keys(SIZES).join(',')).filter((d) => SIZES[d]);
const LOOKS = list('looks', 'light').filter((l) => LOOK_IDS.includes(l));
const JOBS = Math.max(1, +opt('jobs', 3));
const RATE = Math.max(1, +opt('rate', 20));
const TIMEOUT_MS = Math.max(5, +opt('timeout', 60)) * 1000;
const TOL = +opt('tol', 2);
const OUT = opt('out', '');
const BASELINE = opt('baseline', '/mnt/project-files/gallery-baselines/layout-baseline.json');
const VERBOSE = flag('verbose');
const [SHARD_I, SHARD_N] = opt('shard', '1/1').split('/').map(Number);
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

if (flag('update-baseline') && !opt('why', '')) { console.error('--update-baseline needs --why "<what changed and why it is right>" (a baseline is only replaced by a thread that says why)'); process.exit(2); }

// The GL draws do nothing: the page's state, layout and words are real, the picture is not (the same stub as card-fit.mjs).
const STUB = `(() => { for (const C of [window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {}; } })();`;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const withTimeout = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(`${what} took more than ${Math.round(ms / 1000)} s`)), ms); })]).finally(() => clearTimeout(t)); };

/**
 * Opens one specimen and reads it until two reads agree (a card still gliding reads differently 250 ms later). The waits are real time, here in node: the page's own
 * timers run on the test clock (`--rate` times as fast), and the page's timeoutMs is in its time, so it is given the real limit times the rate.
 */
async function probe(page, { id, look, extraLooks }) {
  const pageTimeout = TIMEOUT_MS * RATE;
  const read = () => page.evaluate(() => { const g = window.pps.gallery; return { boxes: g.boxes(), words: g.words(), check: g.check() }; });
  const opened = await page.evaluate(({ id, look, t }) => window.pps.gallery.open(id, { look, timeoutMs: t }), { id, look, t: pageTimeout });
  let a = await read(), stable = false;
  for (let k = 0; k < 6; k++) {
    await sleep(250);
    const b = await read();
    if (JSON.stringify(a.boxes?.boxes) === JSON.stringify(b.boxes?.boxes)) { stable = true; a = { ...b, check: { ...b.check, problems: (b.check?.problems || []).filter((p) => (a.check?.problems || []).some((q) => q.kind === p.kind && q.text === p.text)) } }; break; }
    a = b;
  }
  // (A case or question card holds the talk in front of the slide until it is tapped: what was read is that card standing. Lifted, the slide's own cards come in and are read too.)
  let lifted = null;
  if (opened.ok !== false && await page.evaluate(() => { const c = document.querySelector('.pz-case.on'); if (c) c.click(); return !!c; })) {
    const s = await page.evaluate((t) => window.pps.gallery.settled({ timeoutMs: t }), pageTimeout);
    await sleep(400);
    lifted = { settled: s.settled, ...(await read()) };
  }
  const looks = {};
  for (const l of extraLooks) {
    await page.evaluate((l) => window.pps.lookNow?.(l), l);
    await sleep(250);
    looks[l] = await page.evaluate(() => window.pps.gallery.boxes());
  }
  if (extraLooks.length) await page.evaluate((l) => window.pps.lookNow?.(l), look);
  return { opened, stable, boxes: a.boxes, words: a.words, check: a.check, looks, lifted };
}

/** A box map's differences between two looks, in words (a look changes colour, not layout). */
function lookChanges(base, other) {
  const out = [];
  for (const sel of new Set([...Object.keys(base), ...Object.keys(other)])) {
    const x = base[sel], y = other[sel];
    if (!x || !y) { out.push(`${sel} ${x ? 'is gone' : 'appears'}`); continue; }
    if (x.some((v, i) => Math.abs(v - y[i]) > TOL)) out.push(`${sel} [${x}] to [${y}]`);
  }
  return out;
}

const server = await serve(resolve(ROOT, DIR), 0, { prefix: '/preview' });
const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
const T0 = Date.now();

const catalog = CATALOG.map(({ id, family, section, kind }) => ({ id, family, section, kind }));
// In the gallery deck's own order, then the rest: a jump from one end of the deck to the other costs the presenter about 45 s (it builds every state between), a step to the next slide 2 to 4.
const deckAt = Object.fromEntries(galleryDeck().slides.map((s, i) => [s.id, i]));
const IDS = pickIds(catalog, { family: list('family'), section: list('section'), kind: list('kind'), ids: list('ids'), shard: [SHARD_I, SHARD_N] })
  .map((id, i) => [id, sid(id) in deckAt ? deckAt[sid(id)] : 1e6 + i]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
if (!IDS.length) { console.error('no specimen matches'); await browser.close(); server.close(); process.exit(2); }

const results = {};
const bootFor = async (unit) => {
  const first = SIZES[unit.sizes[0]];
  const app = await openApp({ device: unit.sizes[0], theme: 'light', query: `gallery&testclock=${RATE}&look=${LOOKS[0]}`, url: server.url, dir: DIR, browser, initScript: STUB, dpr: 1, timeout: 120000 });
  await app.page.setViewportSize({ width: first.w, height: first.h });
  await app.page.waitForFunction(() => !!window.pps?.gallery?.open, null, { timeout: 120000 });
  return app;
};

async function runUnit(unit) {
  let app = await bootFor(unit);
  let seenErrors = 0;
  const reboot = async () => { await app.close().catch(() => {}); app = await bootFor(unit); seenErrors = 0; };
  const ids = IDS;
  try {
    for (const device of unit.sizes) {
      const s = SIZES[device];
      await app.page.setViewportSize({ width: s.w, height: s.h });
      await sleep(300);
      let n = 0;
      for (const id of ids) {
        const key = keyOf(id, device), t0 = Date.now();
        let rec;
        try {
          const r = await withTimeout(probe(app.page, { id, look: LOOKS[0], extraLooks: LOOKS.slice(1) }), TIMEOUT_MS * 2 + 30000, `${id} on ${device}`);
          const errors = app.errors.slice(seenErrors); seenErrors = app.errors.length;
          const base = normBoxes(r.boxes);
          const looks = {};
          for (const l of LOOKS.slice(1)) { const c = lookChanges(base, normBoxes(r.looks?.[l])); if (c.length) looks[l] = c; }
          rec = {
            id, device, ok: r.opened?.ok !== false, settled: r.opened?.settled !== false, ms: r.opened?.ms ?? Date.now() - t0, stable: r.stable,
            problems: normProblems(r.check), boxes: base, words: normWords(r.words),
            ...(Object.keys(looks).length ? { looks } : {}), ...(errors.length ? { errors: errors.slice(0, 3).map((e) => e.slice(0, 200)) } : {}),
            ...(r.lifted ? { lifted: r.lifted } : {}),
            ...(r.opened?.ok === false ? { error: String(r.opened.error || 'did not open') } : {}),
          };
        } catch (e) {
          rec = { id, device, ok: false, settled: false, stable: false, problems: [], boxes: {}, words: {}, error: String(e.message).split('\n')[0].slice(0, 300) };
          await reboot();   // (the page may be hung or gone: start it over and carry on with the next specimen)
          await app.page.setViewportSize({ width: s.w, height: s.h });
          await sleep(300);
        }
        results[key] = rec;
        if (rec.ok !== false && rec.lifted) {
          const L = rec.lifted; delete rec.lifted;
          results[keyOf(`${id}#lifted`, device)] = { id: `${id}#lifted`, device, ok: true, settled: L.settled !== false, stable: true, ms: 0, problems: normProblems(L.check), boxes: normBoxes(L.boxes), words: normWords(L.words) };
        }
        n++;
        if (VERBOSE || rec.ok === false || rec.problems.length) console.log(`${unit.name} ${device} ${n}/${ids.length} ${id}: ${rec.ok === false ? `DID NOT OPEN (${rec.error})` : `${rec.problems.length} problems${rec.settled && rec.stable ? '' : ' (not settled)'}, ${Object.keys(rec.boxes).length} boxes, ${rec.ms} ms`}`);
        if (rec.ok !== false) for (const p of rec.problems) console.log(`    ${p.kind}: ${p.text}`);
      }
      console.log(`${unit.name}: ${device} done (${ids.length} specimens, ${Math.round((Date.now() - T0) / 1000)} s so far)`);
    }
  } finally { await app.close().catch(() => {}); }
}

const units = unitsFor(DEVICES);
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, units.length) }, async () => {
  for (let j = next++; j < units.length; j = next++) {
    try { await runUnit(units[j]); } catch (e) { console.log(`${units[j].name}: the run stopped: ${String(e.message).split('\n')[0]}`); for (const device of units[j].sizes) for (const id of IDS) { const key = keyOf(id, device); if (!results[key]) results[key] = { id, device, ok: false, settled: false, problems: [], boxes: {}, words: {}, error: `the ${units[j].name} run stopped: ${String(e.message).split('\n')[0].slice(0, 200)}` }; } }
  }
}));
await browser.close();
server.close();

let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* (not a checkout) */ }
const report = {
  schema: 1, at: new Date().toISOString(), commit, rate: RATE, looks: LOOKS, devices: DEVICES, ids: IDS, catalogIds: CATALOG.map((e) => e.id), seconds: (Date.now() - T0) / 1000,
  results: Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b))),
};
const baseline = !flag('no-diff') && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const diff = baseline ? diffReports(baseline, report, { tol: TOL }) : null;
const trouble = newTrouble(report, baseline);
report.diff = diff ? { changes: diff.changes, added: diff.added, removed: diff.removed, same: diff.same } : null;
report.trouble = trouble;
const summary = summaryText(report, diff, trouble);
const lookFindings = Object.values(results).flatMap((r) => Object.entries(r.looks || {}).map(([l, c]) => `${r.id} on ${r.device}: ${l} moves layout: ${c.slice(0, 3).join('; ')}`));

if (OUT) { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(OUT, JSON.stringify(report, null, 1)); writeFileSync(OUT.replace(/\.json$/, '') + '.txt', `${summary}\n`); }
console.log(`\n${summary}`);
if (lookFindings.length) console.log(`\nLOOKS that move layout (${lookFindings.length}):\n  ${lookFindings.slice(0, 40).join('\n  ')}`);
if (!baseline && !flag('no-diff')) console.log(`\nNo baseline at ${BASELINE}: nothing to compare with. Review this run on the devices once, then keep it with --update-baseline --why "...".`);

if (flag('update-baseline')) {
  const old = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  mkdirSync(dirname(resolve(BASELINE)), { recursive: true });
  const tmp = `${BASELINE}.tmp`;
  writeFileSync(tmp, JSON.stringify(makeBaseline(report, old, { why: opt('why', '') })));
  renameSync(tmp, BASELINE);
  console.log(`baseline written: ${BASELINE} (${opt('why', '')})`);
}
process.exit(trouble.length ? 1 : 0);
