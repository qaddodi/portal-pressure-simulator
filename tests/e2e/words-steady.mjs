// The presenter's words show once at their final size: on an iPhone (WebKit) they used to come in at one size and,
// a moment later, shrink. A card's fit (--pz-fit) read an entry slide-up as overflow, and WebKit keeps that overflow
// after the slide-up has eased away. This walks a deck on an iPhone profile and fails on any change in the words'
// size or zoom after they first show; then it checks a shift alone never shrinks a card.
//
//   node tests/e2e/words-steady.mjs            WebKit (CI installs it: npx playwright install --with-deps webkit)
//   ENGINE=chromium node tests/e2e/words-steady.mjs

import { webkit, chromium, devices } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const engine = process.env.ENGINE === 'chromium' ? chromium : webkit;
const server = await serve(process.argv[2] || '.');
const browser = await engine.launch(process.env.CHROMIUM && engine === chromium ? { executablePath: process.env.CHROMIUM } : {});
const iphone = { ...devices['iPhone 13'] };   // (390 x 664, as Safari shows it with its bars)
delete iphone.defaultBrowserType;
const ctx = await browser.newContext({ ...iphone, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

try {
  await page.goto(server.url);
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 45000 });
  await page.evaluate(() => window.pps.presenter.start('circulation', 0));
  await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
  // Every frame, the words' title and line: their size and zoom, and which slide they belong to.
  await page.evaluate(() => {
    window.__words = [];
    const f = () => {
      for (const card of document.querySelectorAll('.pz-text:not([hidden]), .pz-panel:not([hidden])')) {
        const h1 = card.querySelector('.pz-h'), ln = card.querySelector('.pz-line');
        if (!h1 || +getComputedStyle(card).opacity < 0.05) continue;
        const z = getComputedStyle(h1).zoom;
        window.__words.push([h1.textContent, getComputedStyle(h1).fontSize, ln ? getComputedStyle(ln).fontSize : '', z, Math.round(h1.getBoundingClientRect().width)].join('|'));
      }
      window.__wordsRaf = requestAnimationFrame(f);
    };
    f();
  });
  let walked = 0;
  for (let guard = 0; guard < 14; guard++) {
    await page.waitForTimeout(2600);   // (the camera lands and the card settles)
    walked++;
    if (walked === 2) {
      // A shift alone (an entry under way, a glide) never counts as overflow: the card keeps its zoom.
      const shrunk = await page.evaluate(async () => {
        const text = document.querySelector('.pz-text:not([hidden])');
        if (!text) return 'no words on the second slide';
        const last = [...text.children].at(-1);
        last.style.translate = '0 60px';
        dispatchEvent(new Event('resize'));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const fit = text.style.getPropertyValue('--pz-fit');
        last.style.translate = '';
        return fit ? `zoom ${fit}` : '';
      });
      if (shrunk) fail(`a shifted line shrank the words (${shrunk})`);
    }
    const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim() || '');
    const [a, b] = n.split('/').map((x) => +x);
    if (a === b) break;
    await page.keyboard.press('ArrowRight');
  }
  const rows = await page.evaluate(() => { cancelAnimationFrame(window.__wordsRaf); return window.__words; });
  // Per slide title, the first look it showed with and every other one it took after.
  const seen = new Map();
  for (const r of rows) {
    const [title, ...look] = r.split('|'), k = look.join('|');
    if (!seen.has(title)) seen.set(title, new Set([k]));
    else seen.get(title).add(k);
  }
  for (const [title, looks] of seen) if (looks.size > 1) fail(`"${title.slice(0, 50)}": the words changed size after they showed (${[...looks].join(' -> ')})`);
  if (walked < 6) fail(`only ${walked} slide(s) walked`);

} catch (e) {
  fail(e.message.split('\n')[0]);
}
if (errors.length) fail('page errors: ' + errors.join(' | '));
if (!failed) console.log(`ok   words-steady (${engine.name()}): the presenter's words keep one size on every slide`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
