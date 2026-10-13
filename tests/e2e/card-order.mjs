// Slide change order: the cards leave, the camera makes one zoom to the framing that fits around the new cards (measured
// unseen), then the cards come in. While the camera moves (the presenter's bare phase) the teaching card and its glass stay
// out whole: never an empty card on screen. When they come back, the words are already in, the camera has stopped, and it
// does not move again until the next slide's cards leave. A catheter slide keeps its teaching card (the live tracing) on
// screen through the measurement. The catheter's readings (FHVP, WHVP, HVPG) glide to a new spot,
// never jump there in one frame. The corner credit sits the whole move out: gone from the moment the cards leave, back once (fading
// in at its final spot, never moving while visible) after the cards are in and the camera has settled.
// The data card leaves at the same moment as the teaching card, with the same ease and pace (never left standing, never drifting the other way). Real motion, stepping with Next through a deck, sampled every frame.
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
  const at = new WeakMap();
  let lastWorld = '';
  const tick = () => {
    const wt = document.getElementById('world')?.getAttribute('transform') || '', still = wt === lastWorld; lastWorld = wt;
    for (const el of document.querySelectorAll('.cath-labels .cath-label:not(.in-sum), .cath-labels .cath-sum-box')) {
      const r = el.getBoundingClientRect(), p = at.get(el), vis = +getComputedStyle(el.closest('.cath-sum') || el).opacity > 0.5 && r.width > 0;
      // (Checked while the camera holds still: a reading following the camera is not a jump.)
      if (p && p.vis && vis && still && Math.hypot(r.left - p.x, r.top - p.y) > 30) window.__bad.push('catheter reading jumped to a new spot');
      at.set(el, { x: r.left, y: r.top, vis });
    }
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
      // (The data card leaves with the teaching card, at the same moment, with the same ease and pace, whole: never left standing
      // while the words go, never snapped off, and never drifting the other way when it is stacked under the teaching card.)
      const dc = document.querySelector('.pz-data'), gone = tx.classList.contains('pz-leave');
      if (dc && !dc.hidden && gone && !dc.dataset.prep) {
        const cs = getComputedStyle(dc), ts = getComputedStyle(tx), two = (v) => v.split(',').slice(0, 2).join(',');
        if (!dc.classList.contains('pz-hide')) window.__bad.push('data card stayed on screen while the teaching card left');
        else if (two(cs.transitionDuration) !== two(ts.transitionDuration) || two(cs.transitionTimingFunction) !== two(ts.transitionTimingFunction) || +cs.transitionDelay.split(',')[0].replace('s', '')) window.__bad.push('data card leaves with a different ease or pace than the teaching card');
        if (dc.classList.contains('col') && !dc.classList.contains('under') && new DOMMatrixReadOnly(cs.transform).m41 > 0.5) window.__bad.push('stacked data card drifted away from the left edge while leaving');
      }
      if (bare && tx.querySelector('.pz-mon')) window.__bad.push('live tracing card left during the HVPG measurement');
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
console.log(`card-order ${deck}: ${steps} slide changes, cards held out during every zoom (one move, none after they came in), credit out of sight until the cards and camera settled, catheter readings never jumped`);
