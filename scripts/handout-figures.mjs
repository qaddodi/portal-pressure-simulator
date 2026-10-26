// Figures for the printed speaker notes (handout.js): every slide of every deck in decks.js as the
// audience sees it, without its words (the handout prints those as text): the figure with its labels,
// the pressure chart or tiles, or the slide's table or chart. Written to brand/handout/<deck>/<slide id>.webp
// (light theme, 720 px wide; 1200 px for a figure with its data card beside it). Run it after adding a deck or
// changing the look: tests/handout.test.js fails while a slide has no figure. The outline and the quick check print
// as text only (handout.js NO_FIGURE).
//
//   node scripts/handout-figures.mjs            every deck
//   node scripts/handout-figures.mjs varices    only the named decks
//   node scripts/handout-figures.mjs varices/burst variceal-bleed/oct    only the named slides (deck/slide id)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { NO_FIGURE } from '../src/ui/handout.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 720, WIDE = 1200;   // (a figure with its data card beside it is landscape and prints larger, so it is drawn wider)
const only = process.argv.slice(2);
const jobs = DECKS.filter((d) => !only.length || only.some((o) => o === d.id || o.startsWith(d.id + '/')))
  .flatMap((d) => withOverview(d).slides.map((s, i) => ({ d, s, i })).filter(({ s }) => !NO_FIGURE.has(s.visual) && (only.length === 0 || only.includes(d.id) || only.includes(`${d.id}/${s.id}`))));
const server = await serve(ROOT);
// (SwiftShader stands in for a GPU on a machine without one, so the blood and the glows draw as on a screen.)
const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function capture({ d, s, i }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  try {
    await page.goto(`${server.url}?script=${d.id}&slide=${i + 1}`);
    await page.waitForFunction(() => document.querySelector('.pz-text .pz-h, .pz-panel .pz-h') && window.pps?.store?.get().frame, null, { timeout: 120000 });
    // (the slide's cards are built unseen and fitted before they show: wait for them to be in)
    await page.waitForFunction(() => !document.querySelector('.pz.pz-prep'), null, { timeout: 180000 });
    // The patient settles, the camera lands, a time-lapse runs to its end.
    await page.waitForTimeout(11000 + (s.lapse?.seconds || 0) * 1000);
    // A table or chart still filling in shows "…" in its cells: wait for every row.
    if (s.visual) await page.waitForFunction(() => !/…/.test(document.querySelector('.pz-panel:not([hidden])')?.textContent || ''), null, { timeout: 120000 }).catch(() => {});
    const box = await page.evaluate(() => {
      for (const el of document.querySelectorAll('.pz-text, .pz-case, .pz-shade, .stage-credit, .pz-bar, .pz-count, .pz-prog, .pz-safe')) el.style.visibility = 'hidden';
      for (const el of document.querySelectorAll('.pz-panel .pz-ph')) el.style.display = 'none';   // (the handout prints the words)
      const wrap = document.getElementById('stageWrap').getBoundingClientRect();
      const panel = document.querySelector('.pz-panel:not([hidden])');
      if (panel) { const r = panel.getBoundingClientRect(); return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 }; }
      const l = parseFloat(getComputedStyle(document.getElementById('app')).getPropertyValue('--pz-l')) || 0;
      // The data card (tiles, ladder or instrument) sits under the words in the left column: with the words gone it moves
      // to the column's middle, and the figure is the card and the anatomy beside it.
      const data = document.querySelector('.pz-data:not([hidden]):not(.pz-hide)'), r = data?.getBoundingClientRect();
      if (r?.width && r.right <= wrap.left + l + 40) {
        data.style.transition = 'none';
        data.style.transform = `translateY(${(wrap.top + (wrap.height - r.height) / 2 - r.top).toFixed(1)}px)`;
        return { x: r.left - 16, y: wrap.top, width: wrap.right - r.left + 16, height: wrap.height };
      }
      return { x: wrap.left + l, y: wrap.top, width: wrap.width - l, height: wrap.height };
    });
    await page.waitForTimeout(300);
    const png = await page.screenshot({ clip: box });
    const webp = await page.evaluate(async ([b64, w]) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = Math.round(img.height * w / img.width);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.8).split(',')[1];
    }, [png.toString('base64'), box.width > 1.2 * box.height ? WIDE : W]);
    const dir = join(ROOT, 'brand/handout', d.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${s.id}.webp`), Buffer.from(webp, 'base64'));
    console.log(`${d.id}/${s.id}.webp`);
  } catch (e) { console.log(`FAIL ${d.id}/${s.id}: ${e.message.split('\n')[0]}`); }
  await ctx.close();
}

try {
  const queue = [...jobs];
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) await capture(queue.shift()); }));
} finally {
  await browser.close();
  server.close();
}
