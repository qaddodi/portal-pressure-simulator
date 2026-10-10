// Visual regression: six views on a desktop and a phone, compared with the reference pictures in
// tests/visual/. The art (organ tones, lighting, vessels) is meant to change only on purpose.
//
//   node tests/e2e/visual.mjs           compare; exit 1 when a view drifts past the threshold
//   node tests/e2e/visual.mjs --update  rewrite the references (after a deliberate change to the look)
//   VISUAL_OUT=dir                      where the current pictures and diffs of a failure go
//                                       (default test-results/visual)
//
// The model is paused and motion reduced, so a view is still. Pictures are kept at half size and
// compared there: a live number that differs in its last digit, or anti-aliasing that differs
// between machines, stays far under the threshold; a change of tone, light or layout does not.

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REF = join(ROOT, 'tests/visual');
const OUT = resolve(process.env.VISUAL_OUT || join(ROOT, 'test-results/visual'));
const update = process.argv.includes('--update');
// A pixel differs when a channel moves by more than TOL (of 255); a view fails when more than
// LIMIT of its pixels differ.
const TOL = 40, LIMIT = 0.01;

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// [name, colour scheme, view, lens]
const VIEWS = [
  ['anatomy', 'light', 'anatomic', 'pressure'],
  ['anatomy-dark', 'dark', 'anatomic', 'pressure'],
  ['anatomy-flow', 'light', 'anatomic', 'flow'],
  ['circuit', 'light', 'circuit', 'pressure'],
  ['circuit-dark', 'dark', 'circuit', 'pressure'],
  ['lobule', 'light', 'lobule', 'pressure'],
];

mkdirSync(REF, { recursive: true });
const server = await serve(ROOT);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let failed = 0;

// Half-size RGBA of a PNG, decoded by the browser (no image library needed).
const halfPixels = (page, b64) => page.evaluate(async (src) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
  const w = Math.round(img.width / 2), h = Math.round(img.height / 2);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  return { w, h, png: c.toDataURL('image/png').split(',')[1], data: Array.from(x.getImageData(0, 0, w, h).data) };
}, b64);

// Share of pixels that differ, and a picture of where (red on a dimmed copy).
function compare(ref, now) {
  if (ref.w !== now.w || ref.h !== now.h) return { share: Infinity };
  const mask = new Uint8ClampedArray(now.data.length);
  let diff = 0;
  for (let i = 0; i < now.data.length; i += 4) {
    const d = Math.max(Math.abs(now.data[i] - ref.data[i]), Math.abs(now.data[i + 1] - ref.data[i + 1]), Math.abs(now.data[i + 2] - ref.data[i + 2]));
    if (d > TOL) { diff++; mask[i] = 255; } else mask[i] = mask[i + 1] = mask[i + 2] = now.data[i] * 0.3;
    mask[i + 3] = 255;
  }
  return { share: diff / (now.w * now.h), mask, w: now.w, h: now.h };
}

const steady = async (page) => {
  const T = () => page.evaluate(() => document.querySelector('#world')?.getAttribute('transform') || '');
  let a = await T(), same = 0;
  for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await T(); same = c === a ? same + 1 : 0; a = c; }
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running'), null, { timeout: 20000 }).catch(() => {});
};

for (const [device, opts] of Object.entries(DEVICES)) {
  for (const [name, scheme, view, lens] of VIEWS) {
    const id = `${device}-${name}`;
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    try {
      await page.goto(server.url + '?preset=cirr-decomp');
      await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
      await page.waitForFunction(() => window.pps.store.get().running === false);
      await page.evaluate((l) => window.pps.store.set({ colorMode: l }), lens);
      if (view !== 'anatomic') await page.click(`#viewSeg [data-view="${view}"]`, { force: true });
      if (view === 'lobule') await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
      await steady(page);
      await page.waitForTimeout(1500);   // the organ plate re-rasterizes after a change of lens
      // A software GPU can show a frame late: a view counts as settled when two pictures taken a
      // moment apart agree (for a reference), or when one of a few tries matches the reference.
      const shoot = async () => halfPixels(page, (await page.screenshot()).toString('base64'));
      const refPath = join(REF, `${id}.png`);
      if (update || !existsSync(refPath)) {
        let cur = await shoot();
        for (let i = 0; i < 4; i++) {
          await page.waitForTimeout(2500);
          const next = await shoot();
          const same = compare(await halfPixels(page, cur.png), await halfPixels(page, next.png)).share <= LIMIT / 4;
          cur = next;
          if (same) break;
        }
        writeFileSync(refPath, Buffer.from(cur.png, 'base64'));
        console.log(`ref  ${id} written`);
        continue;
      }
      // halfPixels halves again: both are compared at the same (quarter) size.
      const ref = await halfPixels(page, readFileSync(refPath).toString('base64'));
      let cur, res;
      for (let i = 0; i < 3; i++) {
        if (i) await page.waitForTimeout(2500);
        cur = await shoot();
        res = compare(ref, await halfPixels(page, cur.png));
        if (res.share <= LIMIT) break;
      }
      const { share, mask, w, h } = res;
      if (share > LIMIT) {
        failed++;
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `${id}.png`), Buffer.from(cur.png, 'base64'));
        const diffPng = mask && await page.evaluate(({ w, h, px }) => {
          const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
          c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
          return c.toDataURL('image/png').split(',')[1];
        }, { w, h, px: Array.from(mask) }).catch(() => null);
        if (diffPng) writeFileSync(join(OUT, `${id}-diff.png`), Buffer.from(diffPng, 'base64'));
        console.log(`FAIL ${id}: ${Number.isFinite(share) ? (share * 100).toFixed(2) + '% of pixels differ' : 'size changed'} (limit ${LIMIT * 100}%)`);
      } else console.log(`ok   ${id} (${(share * 100).toFixed(2)}%)`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();
if (failed) console.log(`\n${failed} view(s) changed. If the change is intended, run: npm run visual -- --update\nThe current pictures and diffs are in ${OUT}.`);
process.exit(failed ? 1 : 0);
