// Numbers hold still (2 Nov 2026): on slides that carry live numbers in rules written with the `font` shorthand (which sets the
// figures back to proportional unless the page says otherwise), every text node with a digit is drawn in tabular figures, and each
// such number is as wide with its digits all 1 as all 8.   node tests/e2e/numbers-tabular.mjs   (SLIDES="circulation:6,doppler:4" DEVS=mac,phone)
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';

const DEVICES = {
  mac: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const SLIDES = (process.env.SLIDES || 'circulation:6,doppler:4,endoscopy:3,hvpg:3,treatment:3,ascites:5').split(',').map((s) => s.split(':'));
const DEVS = (process.env.DEVS || 'mac,phone').split(',');
const DIR = process.env.DIR || '.';

// In the page: the digit-carrying text that is not tabular, and the numbers whose width depends on their digits.
function audit() {
  const bad = [], wide = [];
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;visibility:hidden';
  document.body.append(probe);
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!/\d/.test(n.data)) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,.sr-only') || el === probe) continue;
    const cs = getComputedStyle(el);
    if (!el.getBoundingClientRect().width || cs.display === 'none') continue;
    const where = `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').trim().split(/\s+/).join('.')} "${n.data.trim().slice(0, 20)}"`;
    if (!/tabular-nums/.test(cs.fontVariantNumeric)) bad.push(where);
    // A number (digits and its signs only): as wide made of 1s as of 8s, in this element's own type.
    const num = n.data.trim();
    if (/^[−+-]?[\d.,:]+$/.test(num)) {
      const key = `${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}|${cs.letterSpacing}|${num.replace(/\d/g, '0')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      probe.style.font = cs.font; probe.style.fontVariantNumeric = cs.fontVariantNumeric; probe.style.fontFeatureSettings = cs.fontFeatureSettings; probe.style.letterSpacing = cs.letterSpacing;
      const at = (d) => { probe.textContent = num.replace(/\d/g, d); return probe.getBoundingClientRect().width; };
      const a = at('1'), b = at('8'), z = at('0');
      if (Math.abs(a - b) > 0.01 || Math.abs(z - b) > 0.01) wide.push(`${where}: 1s ${a.toFixed(2)}, 8s ${b.toFixed(2)}, 0s ${z.toFixed(2)}`);
    }
  }
  probe.remove();
  return { bad, wide };
}

const srv = await serve(DIR, 0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (await import('node:fs')).existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
const fails = [];
for (const dev of DEVS) {
  const ctx = await fastContext(browser, DEVICES[dev]);
  const page = await ctx.newPage();
  for (const [deck, n] of SLIDES) {
    try {
      await gotoSlide(page, srv.url, deck, Number(n) - 1);
      await quiet(page, { timeout: 5000 });
      const { bad, wide } = await page.evaluate(audit);
      console.log(`${dev} ${deck}#${n}: ${bad.length} not tabular, ${wide.length} change width with their digits`);
      for (const b of bad) fails.push(`${dev} ${deck}#${n} not tabular: ${b}`);
      for (const b of wide) fails.push(`${dev} ${deck}#${n} width follows digits: ${b}`);
    } catch (e) { fails.push(`${dev} ${deck}#${n}: ${String(e).slice(0, 160)}`); }
  }
  await ctx.close();
}
await browser.close(); srv.close();
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? `${fails.length} failed` : 'all numbers hold still');
process.exit(fails.length ? 1 : 0);
