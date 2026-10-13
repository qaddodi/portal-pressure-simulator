// Slide change order: the cards leave, the camera zooms, then the cards come in. While the camera moves (the presenter's
// bare phase) the teaching card and its glass stay out whole: never an empty card on screen. When they come back, the
// words are already in. Real motion, stepping with Next through a deck, sampled every frame.
//
//   DECKS=doppler node tests/e2e/card-order.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { gotoSlide } from './fast.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
const deck = (process.env.DECKS || DECKS[0].id).split(',')[0];
const steps = Math.min(+process.env.STEPS || 6, withOverview(DECKS.find((d) => d.id === deck)).slides.length - 1);
const server = await serve(ROOT);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.setDefaultTimeout(60000);
await gotoSlide(page, server.url, deck, 0);
await page.evaluate(() => {
  window.__bad = []; window.__bareSeen = 0;
  const tick = () => {
    const root = document.querySelector('.pz'), sh = document.querySelector('.pz-shade'), tx = document.querySelector('.pz-text');
    if (root && sh && tx) {
      const bare = 'bare' in root.dataset, op = +getComputedStyle(sh).opacity;
      if (bare) window.__bareSeen++;
      if (bare && !tx.classList.contains('pz-leave')) window.__bad.push('teaching card not held out while the camera moves');
      if (!bare && op > 0.5 && !tx.classList.contains('pz-leave') && !tx.textContent.trim()) window.__bad.push('empty teaching card on screen');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
for (let i = 1; i <= steps; i++) await gotoSlide(page, server.url, deck, i);
const { bad, seen } = await page.evaluate(() => ({ bad: [...new Set(window.__bad)], seen: window.__bareSeen }));
await browser.close(); server.close?.();
if (!seen) { console.error(`card-order ${deck}: the bare phase never ran`); process.exit(1); }
if (bad.length) { console.error(`card-order ${deck}: ${bad.join('; ')}`); process.exit(1); }
console.log(`card-order ${deck}: ${steps} slide changes, cards held out during every zoom`);
