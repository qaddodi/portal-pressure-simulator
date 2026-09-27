// Renders the PNG app icons from brand/mark.svg and brand/mark-maskable.svg (run
// scripts/brand/generate.py first). Uses the Chromium that Playwright drives.
//
//   node scripts/brand/render-icons.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const svg = (f) => readFileSync(resolve(ROOT, 'brand', f), 'utf8');
const JOBS = [['mark.svg', 32, 'icon-32.png'], ['mark.svg', 180, 'icon-180.png'], ['mark.svg', 192, 'icon-192.png'], ['mark.svg', 512, 'icon-512.png'], ['mark-maskable.svg', 512, 'icon-maskable-512.png']];

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [src, size, out] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(src)}`);
  await page.screenshot({ path: resolve(ROOT, 'brand', out), omitBackground: true });
  await page.close();
  console.log(`brand/${out}`);
}
await browser.close();
