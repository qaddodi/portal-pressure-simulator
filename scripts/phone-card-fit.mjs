// A phone's card is exactly as tall as its words, and never scrolls or cuts a row unless it truly cannot fit (18 Nov 2026, Mohammad, the iPhone: a lobule card 600 px tall with 140 px of empty glass above the title,
// a cut row, a blank bottom third, and a body that scrolled). Opens the app at the iPhone's 390 x 844, picks every lobule part and the vessel, organ and TIPS cards in turn, and fails when a card:
//   blank    stands more than 24 px of empty card above its first line or below its last (its own padding is 14 and 12),
//   cut      has a line running past its box,
//   scroll   is let to scroll (ac-scroll) while its words fit the room, or its body's overflow is not hidden then.
//
//   node scripts/phone-card-fit.mjs [--dir .]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { CHROMIUM_ARGS, openApp } from './shoot.mjs';

const argv = process.argv.slice(2), DIR = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : '.';
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const PICKS = [
  ['lobule', { type: 'lobule', part: 'hep', zone: 1 }], ['lobule', { type: 'lobule', part: 'hep', zone: 2 }], ['lobule', { type: 'lobule', part: 'hep', zone: 3 }],
  ['lobule', { type: 'lobule', part: 'sin', tube: 12 }], ['lobule', { type: 'lobule', part: 'cv' }], ['lobule', { type: 'lobule', part: 'triad' }],
  ['lobule', { type: 'lobule', part: 'ha' }], ['lobule', { type: 'lobule', part: 'bd' }], ['lobule', { type: 'lobule', part: 'hep', zone: 2 }],
  ['anatomic', { type: 'edge', id: 'TIPS' }], ['anatomic', { type: 'edge', id: 'C8' }], ['anatomic', { type: 'organ', id: 'liver' }], ['anatomic', { type: 'organ', id: 'heart' }],
];
const MEASURE = () => {
  const c = window.pps.card.el;
  if (!c || c.hidden) return null;
  // (Layout, not drawn boxes: a card's words ride on transforms while it glides, so their rectangles are not where the layout puts them.)
  const body = c.querySelector(':scope > .ac-body'), H = c.offsetHeight;
  const kids = [...body.children].filter((e) => e.offsetHeight > 0 && !e.classList.contains('wgl'));
  const top = body.offsetTop + Math.min(...kids.map((e) => e.offsetTop)), bot = body.offsetTop + Math.max(...kids.map((e) => e.offsetTop + e.offsetHeight));
  const r = { height: H };
  const max = parseFloat(getComputedStyle(c).maxHeight) || Infinity;
  return { h: H, gapTop: Math.round(top), gapBot: Math.round(H - bot), cut: Math.round(bot - H), scroll: c.classList.contains('ac-scroll'), ovf: getComputedStyle(body).overflowY, atMax: H >= max - 1 };
};
const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
const app = await openApp({ device: 'iphone', dir: DIR, browser });
const bad = [];
try {
  const { page } = app;
  let view = '';
  for (const [v, sel] of PICKS) {
    if (v !== view) { view = v; await page.click(`#viewSeg button[data-view="${v}"]`); await page.waitForTimeout(1500); }
    await page.evaluate((s) => window.pps.store.set({ selection: s }), sel);
    // (Settled: no animation left on the card, whose words ride from where they stood while it glides to its height.)
    await page.waitForFunction(() => !window.pps.card.el.getAnimations({ subtree: true }).some((a) => a.playState === 'running'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const m = await page.evaluate(MEASURE), name = JSON.stringify(sel);
    if (!m) { bad.push(`${name}: no card`); continue; }
    if (m.gapTop > 24 || m.gapBot > 24) bad.push(`${name}: blank ${m.gapTop}px above, ${m.gapBot}px below (card ${m.h}px)`);
    if (m.cut > 1) bad.push(`${name}: a line runs ${m.cut}px past the card`);
    if (!m.atMax && (m.scroll || m.ovf !== 'hidden')) bad.push(`${name}: scrolls (ac-scroll ${m.scroll}, overflow ${m.ovf}) though it fits the room`);
    console.log(name.padEnd(46), JSON.stringify(m));
  }
} finally { await app.close(); await browser.close(); }
if (bad.length) { console.error('\nphone-card-fit: FAIL\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('\nphone-card-fit: every card fits its words');
