// The card's GPU paragraph layout (text-gl.js layoutParagraph) against the browser's own: every line of every paragraph in the teaching
// card (.pz-line, .pz-caveat, .pz-causes) of every slide, at a laptop and a phone size, must break at the same character as the browser
// breaks it. The runs come from the live page (each text node's own weight, size, figure style, letter spacing, its no-wrap pieces and
// the padding of the pills round them); the browser's breaks are read from the page (a Range's client rects, per character).
//
//   DECKS=doppler DEVS=mac,phone node tests/e2e/paragraph-match.mjs      (PRETTY=0: compare against greedy filling alone)
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';
import { loadMetrics, layoutParagraph, metricsCover } from '../../src/ui/text-gl.js';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
const only = process.env.DECKS ? process.env.DECKS.split(',') : null;
const decks = DECKS.map((d) => d.id).filter((id) => !only || only.includes(id));
const SIZES = {
  mac: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const devs = (process.env.DEVS || 'mac,phone').split(',');
const pretty = process.env.PRETTY !== '0';
await loadMetrics();
const server = await serve(ROOT);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const dump = [];
let paras = 0, bad = 0, uncovered = 0, lines = 0, badLines = 0;
const shown = [];
// (In the page: every paragraph's runs and the browser's line starts.)
const read = () => {
  const out = [];
  for (const el of document.querySelectorAll('.pz-text :is(.pz-line, .pz-caveat, .pz-causes)')) {
    if (el.closest('[hidden]') || !el.getClientRects().length) continue;
    const cs0 = getComputedStyle(el);
    const width = el.clientWidth - parseFloat(cs0.paddingLeft) - parseFloat(cs0.paddingRight);
    const runs = [], tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) {
      const text = t.nodeValue.replace(/[\n\t ]+/g, ' ');
      if (!text) continue;
      const p = t.parentElement, cs = getComputedStyle(p);
      let padL = 0, padR = 0, nowrap = false;
      for (let a = p; a && a !== el; a = a.parentElement) {
        const c = getComputedStyle(a);
        if (a.firstChild === t || a === p) { /* boxes the text opens */ }
        if (c.whiteSpace === 'nowrap' || c.whiteSpace === 'pre') nowrap = true;
      }
      // the inline boxes this text node opens (it is their first text) or closes (last): their margin, border and padding
      for (let a = p; a && a !== el; a = a.parentElement) {
        const c = getComputedStyle(a);
        const first = document.createTreeWalker(a, NodeFilter.SHOW_TEXT).nextNode() === t;
        let last = null, w2 = document.createTreeWalker(a, NodeFilter.SHOW_TEXT), n2;
        while ((n2 = w2.nextNode())) last = n2;
        if (first) padL += parseFloat(c.marginLeft) + parseFloat(c.paddingLeft) + parseFloat(c.borderLeftWidth);
        if (last === t) padR += parseFloat(c.marginRight) + parseFloat(c.paddingRight) + parseFloat(c.borderRightWidth);
      }
      const r = document.createRange();
      for (let k = 0; k < t.nodeValue.length; k++) {
        r.setStart(t, k); r.setEnd(t, k + 1);
        const rc = r.getClientRects();
        tops.push(rc.length ? Math.round(rc[rc.length - 1].top) : null);
      }
      runs.push({ text: t.nodeValue, weight: parseFloat(cs.fontWeight), size: parseFloat(cs.fontSize), tnum: /tabular-nums/.test(cs.fontVariantNumeric), ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing), nowrap, padL, padR, family: cs.fontFamily.split(',')[0], tt: cs.textTransform });
    }
    out.push({ cls: el.className, width, runs, tops, tw: cs0.textWrap || cs0.textWrapMode, text: el.textContent });
  }
  return out;
};
for (const dev of devs) {
  const ctx = await fastContext(browser, SIZES[dev]);
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  for (const deck of decks) {
    const n = withOverview(DECKS.find((d) => d.id === deck)).slides.length;
    for (let i = 0; i < n; i++) {
      await gotoSlide(page, server.url, deck, i); await quiet(page);
      const found = await page.evaluate(read);
      for (const p of found) {
        const runs = p.runs.map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ') }));
        if (runs.some((r) => !metricsCover(r.text) || r.family !== '"Inter"' && r.family !== 'Inter' || r.tt !== 'none')) { uncovered++; continue; }
        // the browser's line starts: where a character's top differs from the one before (collapsed whitespace skipped)
        const tops = p.tops.filter((v, k) => v != null || k < 0);
        paras++;
        let want = [], prev = null, idx = 0;
        for (const r of p.runs) for (let k = 0; k < r.text.length; k++, idx++) {
          const tp = p.tops[idx]; if (tp == null) continue;
          if (r.text[k] === ' ') continue;   // (a space at a line's end hangs, its rect on the old line or the new)
          if (prev == null || tp > prev + 2) want.push(idx);
          prev = tp;
        }
        void tops;
        dump.push({ dev, deck, slide: i + 1, width: p.width, runs, want });
        const got = layoutParagraph(runs, p.width, { pretty }).lines.map((l) => l.start);
        // (offsets: the layout works on whitespace-collapsed text, the page text may hold a newline: both here are single-spaced)
        const same = want.length === got.length && want.every((v, k) => v === got[k]);
        lines += want.length;
        if (!same) { bad++; badLines += want.filter((v) => !got.includes(v)).length; if (shown.length < 12) shown.push(`${dev} ${deck} ${i + 1} (${p.cls}, w ${p.width.toFixed(0)}, ${p.tw}): browser ${want.join(',')} / layout ${got.join(',')}  "${p.text.slice(0, 70)}"`); }
      }
    }
  }
  await ctx.close();
}
await browser.close(); server.close?.();
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(dump));
console.log(`paragraphs ${paras}, lines ${lines}; layout breaks differently in ${bad} paragraphs (${badLines} lines); ${uncovered} skipped (a character or font without metrics)`);
for (const s of shown) console.log('  ' + s);
process.exit(bad ? 1 : 0);
