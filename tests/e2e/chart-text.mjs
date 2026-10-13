// Chart text check: on every presenter slide with a chart (a scale, the site ladders, the SAAG quadrant, the walls),
// at a phone (390x844 and 375x667), an upright iPad and a desktop, no two pieces of text touch and no text crosses a
// rule line (a cut-off tick, a divider, an SVG line). Run alone: node tests/e2e/chart-text.mjs; also run by smoke.mjs.
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';

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
// The strip's connecting line stops the same distance short of every reading, whether it has one digit or two: the gap
// between each number's edge and the bar on its left and on its right, in px as drawn, all within 1 px of each other.
// In the page: what is uneven (empty when it is even); the first item is [gaps, digit counts] for the coverage check.
export function stripGaps() {
  const strip = document.querySelector('.pz-strip');
  if (!strip || !strip.getBoundingClientRect().width) return null;
  const m = strip.getScreenCTM(), sx = (u) => m.a * u + m.e;
  const segs = [...(strip.querySelector('.pzs-c')?.getAttribute('d') || '').matchAll(/M([\d.-]+) [\d.-]+H([\d.-]+)/g)].map(([, a, b]) => [sx(+a), sx(+b)]);
  const nums = [...strip.querySelectorAll('.pzs-v')].map((e) => ({ t: e.textContent.trim(), r: e.getBoundingClientRect() }));
  if (segs.length !== 4 || nums.length !== 5 || nums.some((n) => !n.t)) return { bad: ['the strip is not drawn with five readings and four bars'], gaps: [], digits: [] };
  const gaps = [];
  segs.forEach(([a, b], i) => { gaps.push(a - nums[i].r.right, nums[i + 1].r.left - b); });
  const lo = Math.min(...gaps), hi = Math.max(...gaps), bad = [];
  if (hi - lo > 1) bad.push(`gaps differ by ${(hi - lo).toFixed(2)} px (${gaps.map((g) => g.toFixed(1)).join(', ')}) beside ${nums.map((n) => n.t).join(' ')}`);
  return { bad, gaps, digits: [...new Set(nums.map((n) => n.t.length))] };
}
// HVPG and PPG as shown add up with the readings as shown: WHVP − FHVP and PV − IVC, from the ladder's own numbers, in
// every place the gradient is drawn (the phone strip's brackets, the data card's tiles, a bracket pill that names a reading).
// In the page: what does not add up (empty when everything does).
export function gradientsAdd() {
  const out = [], vis = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const num = (t) => (/\d/.test(t || '') ? parseFloat(t.replace('−', '-').match(/-?\d+(\.\d+)?/)[0]) : NaN);
  const live = [...document.querySelectorAll('.pz-data > .pz-ladder .pzl-v, .pz-data > .pz-strip .pzs-v')];
  const R = [...document.querySelectorAll('.pz-data > .pz-strip .pzs-v')].map((e) => num(e.textContent));
  if (live.length && R.length === 5 && R.every(Number.isFinite)) {
    const want = { HVPG: R[1] - R[2], PPG: R[0] - R[3] };
    for (const b of document.querySelectorAll('.pz-data > .pz-strip .pzl-bg')) {
      if (+b.getAttribute('opacity') < 0.5) continue;
      const name = b.querySelector('.pzs-bn')?.textContent.trim(), v = num(b.querySelector('.pzs-bv')?.textContent);
      if (v !== want[name]) out.push(`strip ${name} reads ${v}, the readings give ${want[name]}`);
    }
    for (const t of document.querySelectorAll('.pz-data .pz-tile')) {
      const k = t.querySelector('.pzt-k')?.textContent.trim();
      if (!want[k] && want[k] !== 0 || !vis(t)) continue;
      // (Tiles keep the model's one decimal; only the ladder's own numbers are whole.)
      const txt = t.querySelector('.pzt-v')?.textContent || '', v = num(txt);
      if (!/\d\.\d/.test(txt)) out.push(`${k} tile reads "${txt.trim()}", not one decimal`);
      else if (Math.abs(v - want[k]) > 1.05) out.push(`${k} tile reads ${v}, far from the readings' ${want[k]}`);
    }
  }
  // The big ladders' bracket pills (the data card's and each site ladder's) name the gradient and write its whole number,
  // equal to the difference of that ladder's own readings.
  for (const L of document.querySelectorAll('.pz-ladder')) {
    const r = [...L.querySelectorAll('.pzl-v')].map((e) => num(e.textContent));
    for (const b of L.querySelectorAll('.pzl-bg')) {
      if (+b.getAttribute('opacity') < 0.5 || !vis(L)) continue;
      const t = b.querySelector('.pzl-bk')?.textContent.trim() || '', m = /^(HVPG|PPG) (−?\d+)$/.exec(t);
      if (!m) { out.push(`a bracket pill reads "${t}", with no whole number`); continue; }
      const want = m[1] === 'HVPG' ? r[1] - r[2] : r[0] - r[3];
      if (r.length === 5 && num(m[2]) !== want) out.push(`pill "${t}" is not the difference of the readings (${want})`);
      // Its colour is its own number against its own cut-offs (HVPG amber 5, red 10; PPG amber 6, red 12), whatever the slide says of it.
      const g = num(m[2]), [am, rd] = m[1] === 'HVPG' ? [5, 10] : [6, 12], rate = g >= rd ? 'hi' : g >= am ? 'mid' : 'ok';
      if (b.dataset.rate !== rate) out.push(`pill "${t}" is coloured ${b.dataset.rate}, its value is ${rate}`);
    }
  }
  // The catheter callouts (WHVP, FHVP and the HVPG sum) read one decimal, and the HVPG is their difference.
  const cv = {};
  for (const c of document.querySelectorAll('.cath-label')) {
    const k = c.querySelector('small')?.textContent.trim(), t = c.querySelector('b')?.textContent.trim() || '';
    if (!/^(WHVP|FHVP|HVPG)$/.test(k || '') || !vis(c) || !/\d/.test(t)) continue;
    if (!/^\d+\.\d$/.test(t)) out.push(`callout ${k} reads "${t}", not one decimal`);
    if (c.closest('.cath-sum')) cv[k] = num(t);
  }
  if (cv.HVPG != null && cv.WHVP != null && cv.FHVP != null && Math.abs(cv.WHVP - cv.FHVP - cv.HVPG) > 0.11)
    out.push(`callout HVPG ${cv.HVPG} is not WHVP ${cv.WHVP} − FHVP ${cv.FHVP}`);
  return out;
}
export async function checkStripGaps(browser, url, log = console.log) {
  const bad = [];
  const all = [['circulation', 10], ['sites', 3], ['sites', 6]];   // (raised, healthy and HVPG over 10: one- and two-digit readings in one strip)
  for (const size of SIZES) {
    const { name, ...opts } = size;
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const digits = new Set();
    // (An iPad or desktop shows the big ladder, with no joined bars: one slide proves the strip is not drawn there.)
    const wide = opts.viewport.width >= 800, slides = wide ? all.slice(0, 1) : all;
    for (const [deck, n] of slides) {
      await page.goto(`${url}?script=${deck}&slide=${n}`);
      await page.waitForFunction(() => document.querySelector('.pz-strip .pzs-v')?.textContent, null, { timeout: 45000 });
      await settle(page); await page.waitForTimeout(1800);
      const sums = await page.evaluate(gradientsAdd);
      if (sums.length) bad.push(`${deck} slide ${n} at ${name}: ${sums.join('; ')}`);
      const r = await page.evaluate(stripGaps);
      if (!r) { log(`--   ${name.padEnd(14)} ${deck} slide ${n}: strip not shown at this size`); continue; }
      r.digits.forEach((d) => digits.add(d));
      if (r.bad.length) bad.push(`${deck} slide ${n} at ${name}: ${r.bad.join('; ')}`); else log(`ok   ${name.padEnd(14)} ${deck} slide ${n} strip gaps ${r.gaps.map((g) => g.toFixed(1)).join(' ')}`);
    }
    if (!wide && digits.size < 2) bad.push(`strip gaps at ${name}: no strip had both one- and two-digit readings`);
    await ctx.close();
  }
  return bad;
}
// Every slide that has the strip (the ladder data card), at both phones: text at least 11 px, labels in their brackets and clear of the lines.
// (With a deck id, only that deck's slides: smoke runs one check per deck, as the whole sweep takes 45 minutes.)
export async function stripSlides(deck) {
  const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
  const slides = [];
  for (const d of DECKS) if (!deck || d.id === deck) withOverview(d).slides.forEach((sl, i) => { if (sl.data === 'ladder') slides.push({ deck: d.id, n: i + 1 }); });
  return slides;
}
export async function checkStripSlides(browser, url, log = console.log, deck = null) {
  const slides = await stripSlides(deck);
  const bad = [];
  for (const size of SIZES.slice(0, 2)) {
    const { name, ...opts } = size;
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    for (const s of slides) {
      await page.goto(`${url}?script=${s.deck}&slide=${s.n}`);
      await page.waitForFunction(() => document.querySelector('.pz-strip .pzs-v')?.textContent, null, { timeout: 45000 });
      await settle(page); await page.waitForTimeout(1800);
      const c = [...await page.evaluate(stripTextSize), ...await page.evaluate(stripOverflow), ...(await page.evaluate(stripGaps))?.bad || [], ...await page.evaluate(gradientsAdd)];
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
  const bad = [...await checkCharts(browser, server.url), ...await checkStrip(browser, server.url), ...await checkStripSlides(browser, server.url), ...await checkStripGaps(browser, server.url)];
  for (const b of bad) console.log('FAIL ' + b);
  await browser.close(); server.close?.();
  process.exit(bad.length ? 1 : 0);
}

// The big ladders' HVPG and PPG brackets (the data card's and each site ladder's, Mac and iPad): each visible bracket
// draws a line of real width between its end ticks, and its label touches no dotted drop line, reading, station name,
// end tick or other bracket. In the page: what clashes (empty when every bracket reads cleanly).
export function ladderBrackets() {
  const out = [], vis = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; } return true; };
  const hit = (a, b, m = 0.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
  // A path's straight pieces (M x y, then V or H moves) as screen boxes.
  const segs = (p) => {
    const m = p.getScreenCTM(), out = [];
    if (!m) return out;
    const pt = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    let x = 0, y = 0;
    for (const [, op, a, b] of (p.getAttribute('d') || '').matchAll(/([MVH])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g)) {
      if (op === 'M') { x = +a; y = +b; continue; }
      const p0 = pt(x, y); if (op === 'V') y = +a; else x = +a; const p1 = pt(x, y);
      out.push({ h: op === 'H', len: Math.hypot(p1.x - p0.x, p1.y - p0.y), r: { left: Math.min(p0.x, p1.x) - 0.6, right: Math.max(p0.x, p1.x) + 0.6, top: Math.min(p0.y, p1.y) - 0.6, bottom: Math.max(p0.y, p1.y) + 0.6 } });
    }
    return out;
  };
  const ink = (r) => { const pad = r.height * 0.2; return { left: r.left, right: r.right, top: r.top + pad, bottom: r.bottom - pad }; };
  for (const L of document.querySelectorAll('.pz-ladder')) {
    if (!vis(L)) continue;
    const brs = [...L.querySelectorAll('.pzl-bg')].filter((b) => +b.getAttribute('opacity') >= 0.5);
    const texts = [...L.querySelectorAll('.pzl-v, .pzl-k')].filter((t) => vis(t) && t.textContent.trim()).map((t) => ({ r: ink(t.getBoundingClientRect()), name: `"${t.textContent.trim()}"` }));
    for (const b of brs) {
      const t = b.querySelector('.pzl-bk'), name = t.textContent.trim(), lab = ink(t.getBoundingClientRect());
      const own = segs(b.querySelector('.pzl-br')), line = own.filter((s) => s.h).reduce((a, s) => a + s.len, 0);
      if (line < 12) out.push(`${name}: no visible bracket line (${line.toFixed(1)} px)`);
      for (const s of own) if (hit(lab, s.r)) out.push(`${name} sits on its own bracket ${s.h ? 'line' : 'tick'}`);
      for (const o of brs) if (o !== b) {
        for (const s of [...segs(o.querySelector('.pzl-br')), ...segs(o.querySelector('.pzl-lead'))]) if (hit(lab, s.r)) out.push(`${name} touches the ${o.querySelector('.pzl-bk').textContent.trim().split(' ')[0]} bracket`);
        if (hit(lab, ink(o.querySelector('.pzl-bk').getBoundingClientRect()))) out.push(`${name} overlaps the other label`);
      }
      for (const s of segs(b.querySelector('.pzl-lead'))) if (hit(lab, s.r)) out.push(`${name} sits on a drop line`);
      for (const x of texts) if (hit(lab, x.r)) out.push(`${name} overlaps ${x.name}`);
    }
  }
  return [...new Set(out)];
}
export const LADDER_SIZES = [
  { name: 'Mac 1280x800', viewport: { width: 1280, height: 800 } },
  { name: 'Mac 1440x900', viewport: { width: 1440, height: 900 } },
  { name: 'iPad upright', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPad landscape', viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
// Every slide of every deck, at each size, at 100% and 200% text. (DECKS=a,b limits the decks; LADDER_SIZES_N the sizes.)
export async function checkLadderBrackets(browser, url, log = console.log, sizes = LADDER_SIZES, zooms = [1, 2]) {
  const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
  const decks = DECKS.filter((d) => !process.env.DECKS || process.env.DECKS.split(',').includes(d.id)), bad = [];
  for (const { name, ...opts } of sizes) for (const z of zooms) {
    // (one page per size and text size; each slide reached directly, its motion instant: tests/e2e/fast.mjs)
    const ctx = await fastContext(browser, opts);
    await ctx.addInitScript((z) => { try { localStorage.setItem('pps.labelScale', String(z)); localStorage.setItem('pps.labelScaleV', '2'); } catch { /* private mode */ } }, z);
    const page = await ctx.newPage();
    for (const d of decks) {
      const n = withOverview(d).slides.length;
      for (let i = 1; i <= n; i++) {
        await gotoSlide(page, url, d.id, i - 1);
        await page.waitForFunction(() => document.querySelector('.pz-visual, .pz-grid, .pz-data'), null, { timeout: 45000 }).catch(() => {});
        await quiet(page);
        const c = await page.evaluate(ladderBrackets);
        if (c.length) bad.push(`${d.id} slide ${i} at ${name} ${z * 100}%: ${c.slice(0, 4).join('; ')}`);
      }
      log(`ok?  ${name} ${z * 100}% ${d.id}`);
    }
    await ctx.close();
  }
  return bad;
}
