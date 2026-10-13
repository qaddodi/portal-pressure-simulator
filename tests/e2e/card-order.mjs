// Slide change order: the cards leave, the camera makes one zoom to the framing that fits around the new cards (measured
// unseen), then the cards come in. While the camera moves (the presenter's bare phase) the teaching card and its glass stay
// out whole: never an empty card on screen. When they come back, the words are already in, the camera has stopped, and it
// does not move again until the next slide's cards leave. The corner credit sits the whole move out: gone from the moment the cards leave, back once (fading
// in at its final spot, never moving while visible) after the cards are in and the camera has settled. Real motion, stepping with Next through a deck, sampled every frame.
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
  window.__bad = []; window.__bareSeen = 0; window.__creditSeen = 0;
  const app = document.getElementById('app'), cr = document.querySelector('.stage-credit');
  let heldAt = 0, last = null, wasBare = false, armed = false, cam = null;
  const world = document.getElementById('world');
  const camOf = () => (world?.getAttribute('transform') || '').match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) || [];
  const moved = (a, b) => a.length !== b.length || a.some((v, i) => Math.abs(v - b[i]) > (i === 2 ? 0.002 : 0.5));
  const tick = () => {
    const held = app.classList.contains('pz-moving'), op = +getComputedStyle(cr).opacity, r = cr.getBoundingClientRect();
    if (held) { heldAt ||= performance.now(); if (performance.now() - heldAt > 400 && op > 0.02) window.__bad.push('corner credit visible during the slide change'); } else heldAt = 0;
    if (op > 0.02) window.__creditSeen++;
    if (last && last.op > 0.05 && op > 0.05 && Math.hypot(r.left - last.x, r.top - last.y) > 4) window.__bad.push('corner credit moved while visible');
    last = { op, x: r.left, y: r.top };
    const root = document.querySelector('.pz'), sh = document.querySelector('.pz-shade'), tx = document.querySelector('.pz-text');
    if (root && sh && tx) {
      const bare = 'bare' in root.dataset, op = +getComputedStyle(sh).opacity;
      if (bare) window.__bareSeen++;
      // (The camera: still when the cards come in, and still while they are on screen.)
      const c = camOf();
      if (wasBare && !bare) { if (cam && moved(c, cam)) window.__bad.push('cards came in before the zoom ended'); armed = true; }
      else if (armed && cam && moved(c, cam)) window.__bad.push('camera moved after the cards appeared');
      if (bare || tx.classList.contains('pz-leave')) armed = false;   // (the next slide's cards are leaving)
      wasBare = bare; cam = c;
      if (bare && !tx.classList.contains('pz-leave')) window.__bad.push('teaching card not held out while the camera moves');
      if (!bare && op > 0.5 && !tx.classList.contains('pz-leave') && !tx.textContent.trim()) window.__bad.push('empty teaching card on screen');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
for (let i = 1; i <= steps; i++) await gotoSlide(page, server.url, deck, i);
await page.waitForTimeout(8000);
const { bad, seen, credit } = await page.evaluate(() => ({ bad: [...new Set(window.__bad)], seen: window.__bareSeen, credit: window.__creditSeen }));
await browser.close(); server.close?.();
if (!seen) { console.error(`card-order ${deck}: the bare phase never ran`); process.exit(1); }
if (!credit) { console.error(`card-order ${deck}: the corner credit never came back after the slide changes`); process.exit(1); }
if (bad.length) { console.error(`card-order ${deck}: ${bad.join('; ')}`); process.exit(1); }
console.log(`card-order ${deck}: ${steps} slide changes, cards held out during every zoom (one move, none after they came in), credit out of sight until the cards and camera settled`);
