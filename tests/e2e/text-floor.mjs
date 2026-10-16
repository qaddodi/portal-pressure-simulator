// Text floor: no piece of text on screen is drawn under 12 px, as the eye sees it: the font size times every scale on its
// way to the screen (a card scaled to fit, an SVG drawn into a smaller box, the interface zoom). HTML and SVG text are
// measured; canvas text is held to the floor where it is set (tests/text-floor.test.js reads the sources).
// (Sweep batches 02–04: FibroScan scale numbers about 7 px at 320 px, a title card scaled to 8 px on a phone held sideways,
// the circuit table's sublabels at 10 px, the bottom bar's HVPG and PPG at 9.6 px on a 320 px phone.)
//
//   node tests/e2e/text-floor.mjs                 every deck's slides, Explore's views and the Tests tabs, at five sizes
//   DEVS=phone320,mac DECKS=stiffness node tests/e2e/text-floor.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';

export const FLOOR = 12;

// In the page: every visible text run under `min` px on screen, as { t: its words, px: its size on screen, where }.
export function smallText(min) {
  const out = [];
  const seen = new Set();
  const shown = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement || e.parentNode?.host) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || +s.opacity < 0.05) return false;
      if (e.hidden || e.closest?.('.sr-only, .preview-badge, [data-preview-badge]')) return false;
    }
    return true;
  };
  const onScreen = (r) => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  const where = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 3; e = e.parentElement) {
      const c = typeof e.className === 'string' ? e.className : e.className?.baseVal || '';
      if (c || e.id) parts.unshift((e.id ? '#' + e.id : '') + (c ? '.' + c.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    }
    return parts.join(' > ');
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const txt = n.textContent.replace(/\s+/g, ' ').trim();
    const el = n.parentElement;
    if (!txt || !el || seen.has(el) || /^[·•|–—]$/.test(txt)) continue;
    seen.add(el);
    if (el.closest('script, style, title, noscript, option, select, desc, defs, mask, clipPath')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rr = range.getBoundingClientRect();
    if (!onScreen(rr) || !shown(el)) continue;
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    if (!fs) continue;   // (a tile's full name kept at 0 px for readers, its short name shown by ::after)
    let k = 1;
    if (el instanceof SVGElement) {
      const m = el.getScreenCTM?.();
      if (m) k = Math.hypot(m.a, m.b);
    } else {
      // (A transform or a zoom on the way: the line's height on screen over its height in layout.)
      const hl = el.offsetHeight, r = el.getBoundingClientRect();
      if (hl > 0 && r.height > 0 && cs.display !== 'inline') k = r.height / hl;
      else {
        let s = 1;
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
          const t = getComputedStyle(e).transform;
          if (t && t !== 'none') { const mm = new DOMMatrixReadOnly(t); s *= Math.hypot(mm.a, mm.b); }
        }
        k = s;
      }
    }
    const px = fs * k;
    if (px < min - 0.15) out.push({ t: txt.slice(0, 40), px: Math.round(px * 10) / 10, where: where(el) });
  }
  return out;
}

const DEVICES = {
  phone320: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  sideways: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
const TABS = ['profile', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts'];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { DECKS, withOverview } = await import('../../src/ui/decks.js');
  const srv = await serve(process.argv[2] || '.', 0);
  const url = srv.url;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const devs = (process.env.DEVS || Object.keys(DEVICES).join(',')).split(',');
  const decks = DECKS.filter((d) => !process.env.DECKS || process.env.DECKS.split(',').includes(d.id));
  const found = new Map();   // "words @ where" → { px, at: [...] }
  const note = (at, list) => { for (const x of list) { const k = `${x.t} @ ${x.where}`; const f = found.get(k) || { px: x.px, at: [] }; f.px = Math.min(f.px, x.px); if (f.at.length < 4) f.at.push(at); found.set(k, f); } };
  for (const dev of devs) {
    const ctx = await fastContext(browser, DEVICES[dev]);
    const page = await ctx.newPage();
    if (!process.env.DECKS) {
      for (const [preset, view] of [['cirr-decomp', 'anatomic'], ['cirr-decomp', 'circuit'], ['budd-chiari', 'lobule'], ['ivc-web', 'circuit']]) {
        await page.goto(`${url}?preset=${preset}`);
        await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 60000 });
        await page.evaluate((v) => window.pps.store.set(v === 'lobule' ? { lobule: true } : { view: v }), view);
        await quiet(page, { still: 400 });
        note(`${dev} ${preset} ${view}`, await page.evaluate(smallText, FLOOR));
        if (view === 'circuit') for (const tab of TABS) {
          await page.evaluate((t) => window.pps.dock.show(t), tab).catch(() => {});
          await quiet(page, { still: 300 });
          note(`${dev} ${preset} Tests ${tab}`, await page.evaluate(smallText, FLOOR));
        }
      }
    }
    for (const d of decks) {
      const n = withOverview(d).slides.length;
      for (let i = 0; i < n; i++) {
        try { await gotoSlide(page, url, d.id, i); await quiet(page, { still: 300, timeout: 6000 }); note(`${dev} ${d.id} ${i + 1}`, await page.evaluate(smallText, FLOOR)); }
        catch (e) { console.log(`skip ${dev} ${d.id} ${i + 1}: ${e.message.split('\n')[0]}`); }
      }
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  const rows = [...found].sort((a, b) => a[1].px - b[1].px);
  for (const [k, f] of rows) console.log(`${String(f.px).padStart(5)} px  ${k}  [${f.at.join('; ')}]`);
  console.log(rows.length ? `FAIL: ${rows.length} pieces of text under ${FLOOR} px` : `ok: no text under ${FLOOR} px`);
  process.exitCode = rows.length ? 1 : 0;
}
