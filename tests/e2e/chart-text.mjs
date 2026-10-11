// Chart text check: on every presenter slide with a chart (a scale, the site ladders, the SAAG quadrant, the walls),
// at a phone (390x844 and 375x667), an upright iPad and a desktop, no two pieces of text touch and no text crosses a
// rule line (a cut-off tick, a divider, an SVG line). Run alone: node tests/e2e/chart-text.mjs; also run by smoke.mjs.
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const CHARTS = new Set(['scale', 'ladders', 'quadrant', 'walls']);
export async function chartSlides() {
  const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
  const out = [];
  for (const d of DECKS) withOverview(d).slides.forEach((s, i) => { if (CHARTS.has(s.visual)) out.push({ deck: d.id, n: i + 1, visual: s.visual, id: s.id }); });
  return out;
}
export const SIZES = [
  { name: 'phone 390x844', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'phone 375x667', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPad upright', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

// In the page: what in the slide's chart overlaps (empty when it reads cleanly).
export function chartClashes() {
  const root = document.querySelector('.pz-visual, .pz-grid');
  if (!root) return ['no chart on the slide'];
  const out = [], texts = [], lines = [];
  const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } return !el.closest('.sr-only'); };
  const name = (el, t) => `"${t.trim().slice(0, 24)}"`;
  // Text: one box per rendered line of each text node (HTML), one per <text> (SVG).
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const p = n.parentElement;
    if (!n.textContent.trim() || !shown(p)) continue;
    if (p.closest('svg')) continue;
    const g = document.createRange(); g.selectNodeContents(n);
    for (const r of g.getClientRects()) if (r.width > 1 && r.height > 1) texts.push({ r, el: p, label: name(p, n.textContent) });
  }
  for (const t of root.querySelectorAll('svg text')) if (shown(t) && t.textContent.trim()) {
    const spans = t.querySelectorAll('tspan');
    for (const s of spans.length ? spans : [t]) { const r = s.getBoundingClientRect(); if (r.width > 1) texts.push({ r, el: t, label: name(t, s.textContent) }); }
  }
  // Rule lines: HTML ticks (thin elements with a background), borders, and SVG lines.
  for (const el of root.querySelectorAll('*')) {
    if (!shown(el) || el.closest('svg') && el.tagName !== 'line') continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (el.tagName === 'line') { lines.push({ r, label: `line ${el.getAttribute('class') || el.parentNode.getAttribute('class') || ''}` }); continue; }
    if (!r.width || !r.height) continue;
    const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundImage === 'none';
    if (bg && (r.width <= 3 || r.height <= 3)) lines.push({ r, label: `rule ${el.tagName.toLowerCase()}.${el.className}` });
    for (const side of ['Top', 'Bottom']) if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && r.width > 40 && !(parseFloat(s.borderLeftWidth) > 0)) {
      const y = side === 'Top' ? r.top : r.bottom; lines.push({ r: { left: r.left, right: r.right, top: y - 0.5, bottom: y + 0.5 }, label: `${side.toLowerCase()} border of ${el.tagName.toLowerCase()}.${el.className}` });
    }
  }
  const hit = (a, b, m = 0.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
  // (text is trimmed to its ink: a line box carries leading above and below the letters)
  const ink = (r) => { const pad = r.height * 0.18; return { left: r.left, right: r.right, top: r.top + pad, bottom: r.bottom - pad }; };
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (hit(ink(a.r), ink(b.r))) out.push(`${a.label} overlaps ${b.label}`);
  }
  for (const t of texts) for (const l of lines) if (!t.el.contains(l.el) && hit(ink(t.r), l.r, 0)) {
    // (a marker's own number sits over the tick it marks: a dot is drawn above the line, opaque)
    if (t.el.closest('.pzk-dot')) continue;
    out.push(`${t.label} crosses the ${l.label}`);
  }
  return [...new Set(out)];
}

const settle = (page) => page.waitForFunction(() => {
  const v = document.querySelector('.pz-visual, .pz-grid');
  if (!v || document.querySelector('.pz-load.on')) return false;
  return !document.getAnimations().some((a) => a.playState === 'running' && isFinite(a.effect?.getTiming().iterations));
}, null, { timeout: 20000, polling: 200 }).catch(() => {});

export async function checkCharts(browser, url, log = console.log) {
  const slides = (await chartSlides()).filter((s) => !process.env.DECKS || process.env.DECKS.split(',').includes(s.deck)), bad = [];
  for (const size of SIZES) {
    const { name, ...opts } = size;
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    for (const s of slides) {
      await page.goto(`${url}?script=${s.deck}&slide=${s.n}`);
      await page.waitForFunction(() => document.querySelector('.pz-visual, .pz-grid'), null, { timeout: 45000 });
      await settle(page); await page.waitForTimeout(2600);   // (the dots glide in over about two seconds)
      const c = await page.evaluate(chartClashes);
      if (c.length) bad.push(`${s.deck} slide ${s.n} (${s.visual}) at ${name}: ${c.slice(0, 4).join('; ')}`);
      else log(`ok   ${name.padEnd(14)} ${s.deck} slide ${s.n} (${s.visual})`);
    }
    await ctx.close();
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await serve(new URL('../..', import.meta.url).pathname);
  const browser = await chromium.launch();
  const bad = await checkCharts(browser, server.url);
  for (const b of bad) console.log('FAIL ' + b);
  await browser.close(); server.close?.();
  process.exit(bad.length ? 1 : 0);
}
