// Stills for the Presenter's deck picker: the first slide's figure of every deck in decks.js, in the
// light and the dark theme, written to brand/decks/<deck id>-<theme>.webp (200×250, 4:5, the figure's own shape). Run it after
// adding a deck or changing the look; a deck without a still simply shows none in the picker.
//
//   node scripts/deck-stills.mjs            every deck
//   node scripts/deck-stills.mjs varices    only the named decks

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { DECKS } from '../src/ui/decks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'brand/decks');
const W = 200, H = 250;
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
const decks = DECKS.filter((d) => !only.length || only.includes(d.id));
const server = await serve(ROOT);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, serviceWorkers: 'block' });
    for (const d of decks) {
      const page = await ctx.newPage();
      await page.goto(`${server.url}?script=${d.id}`);
      await page.waitForFunction(() => document.querySelector('.pz-text h2, .pz-text h1')?.textContent && window.pps?.store?.get().frame, null, { timeout: 60000 });
      await page.waitForTimeout(12000);   // the patient settles, the camera lands and the organ plate is drawn
      // The figure only: the slide's words, its shade, the labels (too small to read here) and the corner credit go.
      const box = await page.evaluate(() => {
        for (const el of document.querySelectorAll('.pz, .pz-shade, .stage-credit, #labels')) el.style.visibility = 'hidden';
        const wrap = document.getElementById('stageWrap').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('app'));
        const l = parseFloat(cs.getPropertyValue('--pz-l')) || 0, r = parseFloat(cs.getPropertyValue('--pz-r')) || 0;
        // Within the figure's free space, the drawn vessels' extent (stage-local), with a margin.
        let x0 = l, x1 = wrap.width - r, y0 = 0, y1 = wrap.height;
        const c = window.pps.stage.contentRect?.();
        if (c) { const m = 0.06 * Math.max(c.x1 - c.x0, c.y1 - c.y0); x0 = Math.max(x0, c.x0 - m); x1 = Math.min(x1, c.x1 + m); y0 = Math.max(y0, c.y0 - m); y1 = Math.min(y1, c.y1 + m); }
        return { x: wrap.left + x0, y: wrap.top + y0, width: x1 - x0, height: y1 - y0 };
      });
      await page.waitForTimeout(300);
      const png = await page.screenshot({ clip: box });
      // Cover W×H (the figure's background behind any gap), in the page itself (its canvas writes WebP).
      const webp = await page.evaluate(async ([b64, w, h]) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const k = Math.max(w / img.width, h / img.height), c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.fillStyle = getComputedStyle(document.getElementById('stageWrap')).getPropertyValue('--stage-bg').trim() || '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
        return c.toDataURL('image/webp', 0.82).split(',')[1];
      }, [png.toString('base64'), W, H]);
      writeFileSync(join(OUT, `${d.id}-${scheme}.webp`), Buffer.from(webp, 'base64'));
      console.log(`${d.id}-${scheme}.webp`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
