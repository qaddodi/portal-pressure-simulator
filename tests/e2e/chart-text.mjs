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

// The phone's pressure strip (the data card's one-line ladder): each HVPG and PPG label sits inside its own bracket, at a
// healthy and a raised case, on both phones, light and dark. In the page: what runs outside (empty when it fits).
export function stripOverflow() {
  const out = [], strip = document.querySelector('.pz-strip');
  if (!strip || !strip.getBoundingClientRect().width) return ['no pressure strip on the slide'];
  for (const g of strip.querySelectorAll('.pzl-bg')) {
    if (+g.getAttribute('opacity') < 0.5) continue;
    const lab = g.querySelector('.pzs-bl').getBoundingClientRect(), bar = g.querySelector('.pzl-br').getBoundingClientRect(), t = g.querySelector('.pzs-bl').textContent.trim();
    if (lab.left < bar.left - 0.5 || lab.right > bar.right + 0.5) out.push(`"${t}" runs outside its bracket (${Math.round(lab.left)}-${Math.round(lab.right)} in ${Math.round(bar.left)}-${Math.round(bar.right)})`);
    // Numbers only (no rating arrows), centred in the bracket, and clear of every dotted drop line and of the bracket's own line.
    if (/[↑↓]/.test(t)) out.push(`"${t}" carries an arrow`);
    if (Math.abs((lab.left + lab.right) / 2 - (bar.left + bar.right) / 2) > 1.5) out.push(`"${t}" is not centred in its bracket`);
    const m = strip.getScreenCTM(), sx = (u) => m.a * u + m.e, sy = (u) => m.d * u + m.f;
    for (const lead of strip.querySelectorAll('.pzl-bg[opacity="1"] .pzl-lead')) {
      for (const [, x, y0, y1] of (lead.getAttribute('d') || '').matchAll(/M([\d.]+) ([\d.]+)V([\d.]+)/g)) {
        const px = sx(+x), ya = Math.min(sy(+y0), sy(+y1)), yb = Math.max(sy(+y0), sy(+y1));
        if (px > lab.left - 2 && px < lab.right + 2 && yb > lab.top && ya < lab.bottom) out.push(`"${t}" touches a dotted drop line at x ${Math.round(px)}`);
      }
    }
    // The bracket's line keeps a gap of at least 4 px to the text: along it (a line that runs up to the label) or, with the label above an unbroken line, 1 px between the two.
    for (const [, a, r, b] of (g.querySelector('.pzl-br').getAttribute('d') || '').matchAll(/M([\d.]+) ([\d.]+)H([\d.]+)/g)) {
      const l = sx(Math.min(+a, +b)), rr = sx(Math.max(+a, +b)), ry = sy(+r);
      if (rr > lab.left - 4 && l < lab.right + 4 && ry > lab.top - 1 && ry < lab.bottom + 1) out.push(`"${t}" is within 4 px of its bracket line`);
    }
  }
  return out;
}
// Every word on the strip is at least 11 px as drawn (its svg is scaled to the card, so the size is the style's times the scale). In the page.
export function stripTextSize() {
  const strip = document.querySelector('.pz-strip'), out = [];
  if (!strip || !strip.getBoundingClientRect().width) return ['no pressure strip on the slide'];
  const k = strip.getScreenCTM().a;
  for (const sel of ['.pzs-bl', '.pzs-v', '.pzs-d', '.pzs-k', '.pzs-u']) for (const e of strip.querySelectorAll(sel)) {
    if (!e.textContent.trim()) continue;
    const px = parseFloat(getComputedStyle(e).fontSize) * k;
    if (px < 10.95) out.push(`${sel} "${e.textContent.trim()}" is ${px.toFixed(1)} px`);
  }
  return [...new Set(out)];
}
// Every slide that has the strip (the ladder data card), at both phones: text at least 11 px, labels in their brackets and clear of the lines.
export async function checkStripSlides(browser, url, log = console.log) {
  const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
  const slides = [];
  for (const d of DECKS) withOverview(d).slides.forEach((sl, i) => { if (sl.data === 'ladder') slides.push({ deck: d.id, n: i + 1 }); });
  const bad = [];
  for (const size of SIZES.slice(0, 2)) {
    const { name, ...opts } = size;
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    for (const s of slides) {
      await page.goto(`${url}?script=${s.deck}&slide=${s.n}`);
      await page.waitForFunction(() => document.querySelector('.pz-strip .pzs-v')?.textContent, null, { timeout: 45000 });
      await settle(page); await page.waitForTimeout(1800);
      const c = [...await page.evaluate(stripTextSize), ...await page.evaluate(stripOverflow)];
      if (c.length) bad.push(`${s.deck} slide ${s.n} at ${name}: ${c.slice(0, 3).join('; ')}`); else log(`ok   ${name.padEnd(14)} ${s.deck} slide ${s.n} pressure strip`);
    }
    await ctx.close();
  }
  return bad;
}
export async function checkStrip(browser, url, log = console.log) {
  const bad = [];
  for (const size of SIZES.slice(0, 2)) for (const scheme of ['light', 'dark']) for (const [q, what] of [['script=sites&slide=3', 'healthy'], ['script=circulation&slide=10', 'raised'], ['script=sites&slide=6', 'HVPG over 10']]) {
    const { name, ...opts } = size;
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(`${url}?${q}`);
    await page.waitForFunction(() => document.querySelector('.pz-strip .pzs-v')?.textContent, null, { timeout: 45000 });
    await settle(page); await page.waitForTimeout(2600);
    const c = await page.evaluate(stripOverflow);
    if (c.length) bad.push(`pressure strip, ${what}, at ${name} ${scheme}: ${c.join('; ')}`); else log(`ok   ${name.padEnd(14)} ${scheme.padEnd(5)} pressure strip, ${what}`);
    await ctx.close();
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await serve(new URL('../..', import.meta.url).pathname);
  const browser = await chromium.launch();
  const bad = [...await checkCharts(browser, server.url), ...await checkStrip(browser, server.url), ...await checkStripSlides(browser, server.url)];
  for (const b of bad) console.log('FAIL ' + b);
  await browser.close(); server.close?.();
  process.exit(bad.length ? 1 : 0);
}
