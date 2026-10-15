// Presenter words' card check: on a laptop or tablet the words' card is only as tall as its words (padding equal above and
// below them), its top level with the data card's place at the top right, and clear of the controls' pill. The data card either
// stacks under the words' card (same left edge and width, a gap 0.6 of the cards' margin from the screen's edge, above the
// controls) or, when the pair would not fit, sits at the top right; the two never overlap. Lists the slides in each place.
//
//   DECKS=doppler DEVS=mac,ipad node tests/e2e/text-card.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
const only = process.env.DECKS ? process.env.DECKS.split(',') : null;
const decks = DECKS.map((d) => d.id).filter((id) => !only || only.includes(id));
const SIZES = {
  mac: { viewport: { width: 1280, height: 800 } },
  desktop: { viewport: { width: 1440, height: 900 } },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipadL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const devs = (process.env.DEVS || 'mac,desktop,ipad,ipadL').split(',');
const server = await serve(ROOT);
let fails = 0, seen = 0, stacked = 0;
const fallback = {};
const browser = await chromium.launch();
for (const dev of devs) {
  // (one page per size; each slide reached directly, its motion instant: tests/e2e/fast.mjs)
  const ctx = await fastContext(browser, SIZES[dev]);
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  for (const deck of decks) {
    const n = withOverview(DECKS.find((d) => d.id === deck)).slides.length;
    for (let i = 1; i <= n; i++) {
      await gotoSlide(page, server.url, deck, i - 1); await quiet(page);
      const check = () => page.evaluate(() => {
        const sh = document.querySelector('.pz-shade'), tx = document.querySelector('.pz-text'), da = document.querySelector('.pz-data'), bar = document.querySelector('.pz-bar');
        if (!sh?.classList.contains('pz-card') || !tx || tx.hidden || !tx.childElementCount || tx.classList.contains('pz-leave') || getComputedStyle(sh).opacity === '0') return null;
        const s = sh.getBoundingClientRect(), t = tx.getBoundingClientRect(), cp = t.left - s.left, err = [];
        if (Math.abs((t.top - s.top) - cp) > 1.5 || Math.abs((s.bottom - t.bottom) - cp) > 1.5) err.push(`not fitted: pad ${Math.round(t.top - s.top)}/${Math.round(s.bottom - t.bottom)} vs ${Math.round(cp)}`);
        if (tx.scrollHeight - tx.clientHeight > 1 && s.bottom < (bar?.getBoundingClientRect().top ?? innerHeight) - 40 && s.bottom < innerHeight - 140) err.push('words scroll with room to grow');
        const dv = da && !da.hidden && !('gone' in da.dataset) && !da.classList.contains('under') && !da.classList.contains('docked') && getComputedStyle(da).opacity !== '0';
        let where = null;
        if (da && !da.hidden && !('gone' in da.dataset) && !da.classList.contains('docked') && getComputedStyle(da).opacity !== '0') {
          const d = da.getBoundingClientRect(), m = s.left - document.querySelector('.pz').getBoundingClientRect().left, q = bar && !bar.hidden && bar.offsetWidth ? bar.getBoundingClientRect() : null;
          if (d.left < s.right && d.right > s.left && d.top < s.bottom && d.bottom > s.top) err.push('data card overlaps the words');
          if (da.classList.contains('col')) {
            where = 'stacked';
            if (Math.abs(d.left - s.left) > 1.5 || Math.abs(d.right - s.right) > 1.5) err.push(`stacked card not in the words' column (${Math.round(d.left)}-${Math.round(d.right)} vs ${Math.round(s.left)}-${Math.round(s.right)})`);
            // (The gap is 0.6 of the margin, presenter.js layout(), since a77f314 and audit/card-layout-recs.md; it was the margin itself before.)
            if (Math.abs(d.top - s.bottom - Math.round(0.6 * m)) > 1.5) err.push(`gap ${Math.round(d.top - s.bottom)}, not ${Math.round(0.6 * m)} (0.6 of the ${Math.round(m)} margin)`);
            if (q && q.left < d.right && q.right > d.left && d.bottom > q.top - 1) err.push('stacked card runs into the controls');
            if (d.bottom > innerHeight - m + 1) err.push('stacked card past the bottom');
            if (+getComputedStyle(da).getPropertyValue('--pz-fit') && +getComputedStyle(da).getPropertyValue('--pz-fit') < 0.97) err.push('stacked card shrunk to fit');
          } else {
            where = 'right';
            if (d.left < s.right + 8) err.push(`data card neither stacked nor at the right (left ${Math.round(d.left)} vs words right ${Math.round(s.right)})`);
            if (d.top > s.top + 1.5) err.push('right card not at the top');
          }
        }
        // (A stacked pair never shrinks the title below 0.8, presenter.js: past that the pair does not stack and the data card sits at the top right.)
        if (tx.style.getPropertyValue('--pz-tk') && +tx.style.getPropertyValue('--pz-tk') < 0.8) err.push(`title shrunk to ${tx.style.getPropertyValue('--pz-tk')}: a pair that will not stack at that size sits at the top right`);
        const top = dv && !da.classList.contains('col') ? da.offsetTop : null;   // (no data card: the words stay centred, the card wraps them)
        if (top != null && Math.abs(s.top - document.querySelector('.pz').getBoundingClientRect().top - top) > 1) err.push(`top ${Math.round(s.top)} vs data ${Math.round(top)}`);
        const q = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
        if (q && q.width && q.left < s.right && q.right > s.left && s.bottom > q.top + 1) err.push('runs under the controls');
        return { err, where };
      });
      let res = await check();
      if (res?.err.length) { await page.waitForTimeout(2500); await quiet(page); res = await check(); }   // (a slow machine: a slide or chart may still be landing)
      if (res) {
        seen++;
        if (res.err.length) { fails++; console.log(`FAIL ${dev} ${deck} ${i}/${n} ${res.err.join('; ')}`); }
        if (res.where === 'right') (fallback[dev] ||= []).push(`${deck} ${i}`); else if (res.where) stacked++;
      }
    }
  }
  await ctx.close();
}
await browser.close();
server.close?.();
console.log(`data card stacked on ${stacked} slide(s); at the top right (pair too tall):`);
for (const [dev, l] of Object.entries(fallback)) console.log(`  ${dev}: ${l.join(', ')}`);
console.log(fails ? `${fails} of ${seen} slide(s) with a mis-fitted words' card` : `words' card fitted on all ${seen} slides`);
process.exit(fails ? 1 : 0);
