// Data card tile check: no tile's label, value or unit spills past the tile's edge (or is cut off by it), and no tile pokes out of
// its data card. Every slide of every deck, at the Mac, an upright iPad, a landscape iPad and a phone.
//
//   DECKS=hvpg,varices DEVS=mac,phone node tests/e2e/tile-fit.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));

export const TILE_SIZES = {
  mac: { viewport: { width: 1280, height: 800 } },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipadL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

// In the page: what spills out of its tile (empty when every tile holds its words).
export function tileSpill() {
  const da = document.querySelector('.pz-data');
  if (!da || da.hidden || 'gone' in da.dataset || getComputedStyle(da).opacity === '0') return null;
  const err = [], card = da.getBoundingClientRect();
  const tiles = da.querySelectorAll('.pz-tile, .endo-read > div, .dop-stats > div, .ab-tile');
  const range = document.createRange();
  for (const t of tiles) {
    const r = t.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(t).visibility === 'hidden') continue;
    const name = (t.querySelector('dt, .pzt-k')?.textContent || t.textContent).trim().slice(0, 24);
    if (r.right > card.right + 1 || r.left < card.left - 1) err.push(`tile "${name}" outside its card`);
    const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      if (!n.textContent.trim() || getComputedStyle(n.parentElement).display === 'none') continue;
      range.selectNodeContents(n);
      const q = range.getBoundingClientRect();
      if (!q.width) continue;
      if (q.right > r.right + 1 || q.left < r.left - 1 || q.bottom > r.bottom + 1 || q.top < r.top - 1) err.push(`"${n.textContent.trim().slice(0, 18)}" spills out of tile "${name}"`);
    }
    for (const e of [t, ...t.querySelectorAll('*')]) if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') err.push(`"${e.textContent.trim().slice(0, 18)}" is cut off in tile "${name}"`);
  }
  return err;
}

export async function checkTiles(browser, url, log = console.log, sizes = Object.keys(TILE_SIZES)) {
  const only = process.env.DECKS ? process.env.DECKS.split(',') : null, bad = [];
  for (const dev of sizes) {
    const ctx = await fastContext(browser, TILE_SIZES[dev]);
    const page = await ctx.newPage(); page.setDefaultTimeout(60000);
    for (const d of DECKS.filter((x) => !only || only.includes(x.id))) {
      const n = withOverview(d).slides.length;
      for (let i = 0; i < n; i++) {
        await gotoSlide(page, url, d.id, i); await quiet(page);
        let err = await page.evaluate(tileSpill);
        if (err?.length) { await page.waitForTimeout(2000); await quiet(page); err = await page.evaluate(tileSpill); }
        if (err?.length) bad.push(`${dev} ${d.id} ${i + 1}/${n}: ${[...new Set(err)].slice(0, 3).join('; ')}`);
      }
    }
    log(`checked ${dev}`);
    await ctx.close();
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await serve(ROOT), browser = await chromium.launch();
  const bad = await checkTiles(browser, server.url, console.log, (process.env.DEVS || 'mac,ipad,ipadL,phone').split(','));
  await browser.close(); server.close?.();
  for (const b of bad) console.log('FAIL ' + b);
  console.log(bad.length ? `${bad.length} slide(s) with a tile that spills` : 'every tile holds its words');
  process.exit(bad.length ? 1 : 0);
}
