// Presenter words' card check: on a laptop or tablet the words' card is only as tall as its words (padding equal above and
// below them), the data card stacked under them when both fit (else at the top right), its top level with the data card's when one is beside it, and clear of the controls' pill.
//
//   DECKS=doppler DEVS=mac,ipad node tests/e2e/text-card.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS } = await import(new URL('../../src/ui/decks.js', import.meta.url));
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
let fails = 0, seen = 0;
const settle = (page) => page.waitForFunction(() => !document.querySelector('.pz-load.on') && !document.getAnimations().some((a) => a.playState === 'running' && isFinite(a.effect?.getTiming().iterations)), null, { timeout: 8000, polling: 150 }).catch(() => {});
for (const dev of devs) {
  const browser = await chromium.launch();
  for (const deck of decks) {
    const ctx = await browser.newContext({ ...SIZES[dev], serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await ctx.newPage(); page.setDefaultTimeout(60000);
    await page.goto(server.url + '?script=' + deck);
    await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting'));
    const n = await page.evaluate(() => +(document.querySelector('.pzb-n')?.textContent.split('/')[1] || 0));
    for (let i = 1; i <= n; i++) {
      await page.waitForTimeout(700); await settle(page);
      const check = () => page.evaluate(() => {
        const sh = document.querySelector('.pz-shade'), tx = document.querySelector('.pz-text'), da = document.querySelector('.pz-data'), bar = document.querySelector('.pz-bar');
        if (!sh?.classList.contains('pz-card') || !tx || tx.hidden || !tx.childElementCount || tx.classList.contains('pz-leave') || getComputedStyle(sh).opacity === '0') return null;
        const s = sh.getBoundingClientRect(), t = tx.getBoundingClientRect(), cp = t.left - s.left, err = [];
        if (Math.abs((t.top - s.top) - cp) > 1.5 || Math.abs((s.bottom - t.bottom) - cp) > 1.5) err.push(`not fitted: pad ${Math.round(t.top - s.top)}/${Math.round(s.bottom - t.bottom)} vs ${Math.round(cp)}`);
        if (tx.scrollHeight - tx.clientHeight > 1 && s.bottom < (bar?.getBoundingClientRect().top ?? innerHeight) - 40 && s.bottom < innerHeight - 140) err.push('words scroll with room to grow');
        const dv = da && !da.hidden && !('gone' in da.dataset) && !da.classList.contains('under') && !da.classList.contains('docked') && getComputedStyle(da).opacity !== '0';
        // The data card sits under the words in the left column when both fit (no overlap, as wide as the words' card,
        // above the controls' pill, nothing shrunk), or else keeps the top right (nofit), clear of the words.
        if (da && !da.hidden && !('gone' in da.dataset) && !da.classList.contains('docked') && getComputedStyle(da).opacity !== '0') {
          const d = da.getBoundingClientRect(), q = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
          if (da.classList.contains('under')) {
            if (d.top < s.bottom + 16) err.push(`gap under the words ${Math.round(d.top - s.bottom)}px (min 16)`);
            if (Math.abs(d.left - s.left) > 2 || Math.abs(d.right - s.right) > 2) err.push('data card not in the words\' column');
            if (q && q.width && d.bottom > q.top && d.right > q.left && d.left < q.right) err.push('data card runs under the controls');
            if (d.bottom > innerHeight) err.push('data card off screen');
            if ((+getComputedStyle(da).getPropertyValue('--pz-fit') || 1) < 0.95) err.push('data card shrunk to fit');
          } else if (!da.classList.contains('nofit')) err.push('data card neither stacked nor in its fallback');
          else if (d.left < s.right + 8) err.push('data card against the words');
        }
        const top = dv ? da.offsetTop : null;   // (no data card: the words stay centred, the card wraps them)
        if (top != null && Math.abs(s.top - document.querySelector('.pz').getBoundingClientRect().top - top) > 1) err.push(`top ${Math.round(s.top)} vs data ${Math.round(top)}`);
        const q = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
        if (q && q.width && q.left < s.right && q.right > s.left && s.bottom > q.top + 1) err.push('runs under the controls');
        return err;
      });
      let res = await check();
      if (res?.length) { await page.waitForTimeout(2500); await settle(page); res = await check(); }   // (a slow machine: a slide or chart may still be landing)
      if (res) { seen++; if (res.length) { fails++; console.log(`FAIL ${dev} ${deck} ${i}/${n} ${res.join('; ')}`); } }
      if (i < n) await page.keyboard.press('ArrowRight');
    }
    await ctx.close();
  }
  await browser.close();
}
server.close?.();
console.log(fails ? `${fails} of ${seen} slide(s) with a mis-fitted words' card` : `words' card fitted on all ${seen} slides`);
process.exit(fails ? 1 : 0);
