// A phone's card is exactly as tall as its words, and never scrolls or cuts a row unless it truly cannot fit (18 Nov 2026, Mohammad, the iPhone: a lobule card 600 px tall with 140 px of empty glass above the title,
// a cut row, a blank bottom third, and a body that scrolled). Opens the app at the iPhone's 390 x 844, picks every lobule part and the vessel, organ and TIPS cards in turn, and fails when a card:
//   blank    stands more than 24 px of empty card above its first line or below its last (its own padding is 14 and 12),
//   cut      has a line running past its box,
//   scroll   is let to scroll (ac-scroll) while its words fit the room, or its body's overflow is not hidden then.
// and, from the standing rules (17 Nov), lettering under 12 px, anything that scrolls sideways, and a card shown before it was whole (`--old-rules` leaves these out).
// The judging is src/ui/gallery/fit-rules.js, shared with the gallery page's Check button.
//
//   node scripts/phone-card-fit.mjs [--dir .]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { CHROMIUM_ARGS, openApp } from './shoot.mjs';
import { readStructureCard, judgeStructureCard, linesOf, WORDS_MIN_PX } from '../src/ui/gallery/fit-rules.js';
import { inPage } from './fit-io.mjs';

const argv = process.argv.slice(2), OLD_RULES = argv.includes('--old-rules'), DIR = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : '.';
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const PICKS = [
  ['lobule', { type: 'lobule', part: 'hep', zone: 1 }], ['lobule', { type: 'lobule', part: 'hep', zone: 2 }], ['lobule', { type: 'lobule', part: 'hep', zone: 3 }],
  ['lobule', { type: 'lobule', part: 'sin', tube: 12 }], ['lobule', { type: 'lobule', part: 'cv' }], ['lobule', { type: 'lobule', part: 'triad' }],
  ['lobule', { type: 'lobule', part: 'ha' }], ['lobule', { type: 'lobule', part: 'bd' }], ['lobule', { type: 'lobule', part: 'hep', zone: 2 }],
  ['anatomic', { type: 'edge', id: 'TIPS' }], ['anatomic', { type: 'edge', id: 'C8' }], ['anatomic', { type: 'organ', id: 'liver' }], ['anatomic', { type: 'organ', id: 'heart' }],
];
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
    const m = await inPage(page, readStructureCard, null, { minPx: WORDS_MIN_PX }), name = JSON.stringify(sel);
    if (!m) { bad.push(`${name}: no card`); continue; }
    for (const line of linesOf(judgeStructureCard(m, { oldRules: OLD_RULES }))) bad.push(`${name}: ${line}`);
    console.log(name.padEnd(46), JSON.stringify(m));
  }
} finally { await app.close(); await browser.close(); }
if (bad.length) { console.error('\nphone-card-fit: FAIL\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('\nphone-card-fit: every card fits its words');
