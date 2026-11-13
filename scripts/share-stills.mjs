// The pictures link previews show: one 1200 x 630 card per patient and per presentation, written to brand/share/<patient id>.jpg and
// brand/share/deck-<deck id>.jpg (scripts/share-pages.mjs names them in each case's share page; index.html names healthy.jpg).
// Each card is the real figure (a patient's anatomy view, a deck's first slide, light theme, the words and tools hidden) beside the case's
// title and summary, set in the app's own faces. Run it after adding a patient or a deck or changing the look; a case without a card
// simply previews as a title and summary.
//
//   node scripts/share-stills.mjs                 every missing card
//   node scripts/share-stills.mjs --force         every card, again
//   node scripts/share-stills.mjs healthy hvpg    only these patient ids / deck ids
//
// Headless, software GL (shoot.mjs's GPU path): about a minute a deck and 20 s a patient. One browser, one page at a time.

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, CHROMIUM_ARGS } from './shoot.mjs';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { PRESETS } from '../src/engine/scenario.js';
import { DECKS } from '../src/ui/decks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'brand/share');
const force = process.argv.includes('--force');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
mkdirSync(OUT, { recursive: true });

const items = [
  ...PRESETS.map((p) => ({ kind: 'Patient', id: p.id, file: `${p.id}.jpg`, title: p.label, summary: p.summary, query: `?embed&preset=${p.id}` })),
  ...DECKS.map((d) => ({ kind: 'Presentation', id: d.id, file: `deck-${d.id}.jpg`, title: d.title, summary: d.summary, query: `?embed&script=${d.id}` })),
].filter((x) => (!only.length || only.includes(x.id)) && (force || only.length || !existsSync(join(OUT, x.file))));
console.log(`${items.length} cards to make`);
if (!items.length) process.exit(0);

// The figure alone: tools, labels, the slide's words and the corner credit hidden, then the drawn vessels' extent (with a margin) cropped.
const HIDE = '.pz, .pz-shade, .pz-case, .stage-credit, #labels, .vdock, .dock, .panel, .toolbar, .zoom-pill, .stage-bar, .tool-card, .float-ui, #toast, .toast, .pv-badge';
const figureBox = (page) => page.evaluate((hide) => {
  for (const el of document.querySelectorAll(hide)) el.style.visibility = 'hidden';
  const wrap = document.getElementById('stageWrap').getBoundingClientRect();
  let x0 = 0, x1 = wrap.width, y0 = 0, y1 = wrap.height;
  const c = window.pps.stage.contentRect?.();
  if (c) { const m = 0.06 * Math.max(c.x1 - c.x0, c.y1 - c.y0); x0 = Math.max(x0, c.x0 - m); x1 = Math.min(x1, c.x1 + m); y0 = Math.max(y0, c.y0 - m); y1 = Math.min(y1, c.y1 + m); }
  return { x: wrap.left + x0, y: wrap.top + y0, width: x1 - x0, height: y1 - y0, bg: getComputedStyle(document.getElementById('stageWrap')).getPropertyValue('--stage-bg').trim() };
}, HIDE);

const server = await serve(ROOT);
const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const cardPage = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await cardPage.goto(`${server.url}scripts/share-card.html`);
await cardPage.evaluate(() => document.fonts.ready);

let made = 0, failed = [];
try {
  for (const it of items) {
    let app;
    try {
      app = await openApp({ device: 'mac', theme: 'light', query: it.query, browser, dir: '.', url: server.url, timeout: 240000 });
      await app.page.waitForTimeout(it.kind === 'Patient' ? 8000 : 15000);   // (the patient settles, the camera lands, the organ plate is drawn)
      // (A deck's loading cover lifts when its first slide is ready; on a loaded machine that took over a minute, and the card showed the spinner.)
      if (it.kind !== 'Patient') { await app.page.waitForFunction(() => !document.querySelector('.pz-cover.on'), null, { timeout: 240000 }); await app.page.waitForTimeout(8000); }
      await app.freeze();
      await app.page.waitForTimeout(1500);
      const box = await figureBox(app.page);
      await app.page.waitForTimeout(300);
      const png = await app.page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
      await cardPage.evaluate(({ b64, it, bg }) => {
        document.body.style.setProperty('--bg', bg || '#F1EBE0');
        document.getElementById('fig').style.backgroundImage = `url(data:image/png;base64,${b64})`;
        document.getElementById('kind').textContent = it.kind;
        document.getElementById('title').textContent = it.title;
        document.getElementById('sum').textContent = it.summary || '';
      }, { b64: png.toString('base64'), it, bg: box.bg });
      await cardPage.waitForTimeout(150);
      const jpg = await cardPage.screenshot({ type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: 1200, height: 630 } });
      writeFileSync(join(OUT, it.file), jpg);
      made++;
      console.log(`${it.file}  ${(jpg.length / 1024).toFixed(0)} KB  (${made}/${items.length})`);
    } catch (e) {
      failed.push(it.id);
      console.error(`FAILED ${it.id}: ${e.message}`);
    } finally { await app?.close().catch(() => {}); }
  }
} finally { await browser.close(); server.close(); }
if (failed.length) { console.error(`not made: ${failed.join(' ')}`); process.exit(1); }
