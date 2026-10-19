// Drawn slide charts (the pressure ladder and the phone's strip, the site ladders, the SAAG map, the gut-versus-liver
// walls, the wedge's still column): every word drawn on them is a slide role (--s-*) as drawn, so never under 12 px and
// growing with the text size setting, no two words overlap, and none runs out of its card or the screen. Every slide of
// every deck that shows a chart, on phones 375, 390 and 430 px wide, an upright iPad and a desktop, at 100, 150 and 200 %.
// Run alone: node tests/e2e/chart-type.mjs (CHART_DECKS=a,b and CHART_SIZES=phone390,... narrow it); also run by smoke.mjs.
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const phone = (w) => ({ name: 'phone' + w, viewport: { width: w, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
export const SIZES = [phone(375), phone(390), phone(430),
  { name: 'iPad', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 } }];
const CHARTS = 'svg.pz-ladder, svg.pz-strip, svg.pz-quad, svg.pz-col, svg.pzw-art';

// In the page: what is wrong with the charts on the slide (empty when all is well), or null when it shows none.
export function chartFaults(sel) {
  const shown = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +(e.getAttribute?.('opacity') ?? 1) < 0.05 || +s.opacity < 0.05) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const charts = [...document.querySelectorAll(sel)].filter(shown);
  if (!charts.length) return null;
  const pz = document.querySelector('.pz'), rolesAt = (host) => ['cap', 'lab', 'body', 'val', 'big'].map((r) => { const p = document.createElement('span'); p.style.cssText = `position:absolute;visibility:hidden;font-size:var(--s-${r})`; host.append(p); const v = parseFloat(getComputedStyle(p).fontSize); p.remove(); return v; });
  // (A phone's site-ladder grid sets its own roles, 1.15 times the slide's (app.css .pz-grid): its strips letter from those.)
  const slideRoles = rolesAt(pz);
  // (A data card's charts draw at the card's own sizes where it sets them, --ch-cap and --ch-lab: the tiles' small size and
  // one and a half times it; past the fit's last step its words zoom, --pz-z.)
  // (And a big screen's site-ladder cell its own, app.css .pz-cell: the data card's chart size, 12 px at least.)
  // (A phone's stacked data card sets its own, larger roles, --s-cap and --s-lab at 1.15 times the slide's, 1.3 on a tablet: styles/app.css.)
  const cardRoles = (svg) => { const d = svg.closest('.pz-cell, .pz-data'); if (!d) return []; return ['ch-cap', 'ch-lab', 's-cap', 's-lab'].map((r) => { const p = document.createElement('span'); p.style.cssText = `position:absolute;visibility:hidden;font-size:var(--${r}, 0px)`; d.append(p); const v = parseFloat(getComputedStyle(p).fontSize); p.remove(); return v; }).filter((v) => v > 0); };
  const out = [];
  for (const svg of charts) {
    const grid = svg.closest('.pz-grid'), roles = grid ? rolesAt(grid) : slideRoles;
    // (A card too full for its screen zooms its contents down, --pz-fit: the roles are read at that zoom; 12 px stays the floor.)
    const fit = svg.closest('.pz-text > *, .pz-data > *, .pz-panel > *'), z = fit ? (parseFloat(fit.parentElement.style.getPropertyValue('--pz-fit')) || 1) * (fit.parentElement.classList.contains('col') && parseFloat(fit.parentElement.style.getPropertyValue('--pz-dk')) || 1) : 1;   // (and a stacked data card's blocks at their fixed smaller size, --pz-dk)
    const name = svg.getAttribute('class').split(' ')[0], vb = svg.viewBox.baseVal, sr = svg.getBoundingClientRect(), k = Math.min(sr.width / vb.width, sr.height / vb.height);   // (screen px per unit, zoom included)
    const card = (svg.closest('.pz-cell, .pz-panel, .pz-data, .pz-visual, .pz-text') || svg.parentElement).getBoundingClientRect();
    const runs = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim() && shown(t)).flatMap((t) => (t.querySelector('tspan') && !t.querySelector('tspan.pzs-bn') ? [...t.querySelectorAll('tspan')] : [t]).map((e) => ({ e, t, r: e.getBoundingClientRect() })));
    const own = cardRoles(svg), zz = parseFloat(svg.closest('.pz-data')?.style.getPropertyValue('--pz-z')) || 1;
    for (const { e, t, r } of runs) {
      const px = parseFloat(getComputedStyle(t).fontSize) * k, what = `${name} "${e.textContent.trim().slice(0, 18)}" ${px.toFixed(1)}px`;
      if (px < 11.95) out.push(`${what} under 12 px`);   // (the floor for every word: text never shrinks to fit, it reflows or takes a compact form)
      else if (!roles.some((v) => Math.abs(v * z - px) < 0.6 || Math.abs(v - px) < 0.6) && !own.some((v) => Math.abs(v * zz - px) < 0.6 || (px < v && px > v * 0.5)) && !(fit && fit.parentElement.style.getPropertyValue('--pz-fit') && roles.some((v) => px < v && px > v * 0.5))) out.push(`${what} off the scale (${roles.map((v) => v.toFixed(1)).join(' ')})`);
      if (r.left < card.left - 1 || r.right > card.right + 1 || r.top < card.top - 1 || r.bottom > card.bottom + 1 || r.left < -1 || r.right > innerWidth + 1) out.push(`${what} runs out of its card`);
    }
    // (Glyph boxes carry the line's ascent and descent, so two rows touch by a few px without the letters touching.)
    // (Two names tilted by one angle are parallel strips: they touch only when their baselines are closer than a line of letters,
    // however their slanted boxes overlap.)
    const tilt = (e) => { const m = /rotate\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)/.exec(e.getAttribute('transform') || ''); return m && +m[1] ? m.slice(1).map(Number) : null; };
    const parallel = (ea, eb) => { const ta = tilt(ea), tb = tilt(eb); if (!ta || !tb || ta[0] !== tb[0]) return false;
      const t = ta[0] * Math.PI / 180, d = Math.abs((tb[1] - ta[1]) * -Math.sin(t) + (tb[2] - ta[2]) * Math.cos(t)), fs = parseFloat(ea.getAttribute('font-size') || getComputedStyle(ea).fontSize);
      return d >= 1.05 * fs; };
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
      if (parallel(runs[i].e, runs[j].e)) continue;
      const a = runs[i].r, b = runs[j].r, sh = Math.min(a.height, b.height) * 0.22;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > sh) out.push(`${name} "${runs[i].e.textContent.trim()}" overlaps "${runs[j].e.textContent.trim()}"`);
    }
  }
  return out;
}

// Every slide that draws a chart: the ladder data card (with the phone's strip), the site ladders, the SAAG map, the walls, the still column.
export async function chartTypeSlides() {
  const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
  const out = [];
  for (const d of DECKS) withOverview(d).slides.forEach((s, i) => { if (s.data === 'ladder' || s.column || ['ladders', 'quadrant', 'walls'].includes(s.visual)) out.push({ deck: d.id, n: i + 1 }); });
  return out;
}

// (With a deck and a step, only that deck's slides at that text size: smoke runs one check for each, as the whole sweep is some 78 minutes.)
export async function checkChartText(browser, url, log = console.log, { deck = null, step: only = null } = {}) {
  const bad = [];
  const sizes = SIZES.filter((s) => !process.env.CHART_SIZES || process.env.CHART_SIZES.split(',').includes(s.name));
  const slides = (await chartTypeSlides()).filter((s) => !process.env.CHART_DECKS || process.env.CHART_DECKS.split(',').includes(s.deck)).filter((s) => !deck || s.deck === deck);
  // (The sizes run one after another, each slide opening from its own link: five browsers drawing the lobule at once starved each other on a two-core runner, and slides 'never opened'.)
  for (const { name, ...opts } of sizes) {
    for (const step of only ? [only] : [1, 1.5, 2]) {
      const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await ctx.addInitScript((s) => { try { localStorage.setItem('pps.labelScale', String(s)); localStorage.setItem('pps.labelScaleV', '2'); } catch { /* */ } }, step);
      const page = await ctx.newPage(), errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      for (const s of slides) {
        await page.goto(`${url}?script=${s.deck}&slide=${s.n}`);
        const open = await page.waitForFunction((n) => document.querySelector('.pzb-n')?.textContent.startsWith(n + ' /'), s.n, { timeout: 60000 }).then(() => true, () => false);
        if (!open) { bad.push(`${name} ${s.deck} slide ${s.n} at ${step * 100}%: the slide never opened${errs.length ? ` (${errs.join('; ')})` : ''}`); errs.length = 0; continue; }
        // (Judged once the slide has arrived, its loading cover gone, as the reader first sees it: under the cover, a card was read
        // before its layout had settled.)
        await page.waitForFunction(() => !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'), null, { timeout: 60000, polling: 100 }).catch(() => {});
        // (A slide's numbers come from the off-screen engine: wait for its chart to show, then for the line to ease in.)
        // (A card folded behind Show has its chart hidden until opened, below: no wait for it.)
        await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((e) => e.getBoundingClientRect().width > 0) || document.querySelector('.pz-data.pz-folds:not(.tool-open)'), CHARTS, { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const r = await page.evaluate(chartFaults, CHARTS);
        // (A phone shows some ladder slides as tiles alone: no chart there to check.)
        if (r) r.forEach((x) => bad.push(`${name} ${s.deck} slide ${s.n} at ${step * 100}%: ${x}`));
      }
      await ctx.close();
    }
    log(`chart type ${name}: ${slides.length} chart slides checked at 100, 150 and 200 %`);
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await serve(new URL('../..', import.meta.url).pathname);
  const browser = await chromium.launch();
  const bad = await checkChartText(browser, server.url);
  const seen = new Map(); for (const b of bad) { const k = b.replace(/^\S+ \S+ slide \d+ at \d+%: /, '').replace(/"[^"]*"/g, '').replace(/[\d.]+px/, ''); seen.set(k, (seen.get(k) || []).concat(b)); }
  for (const [, v] of seen) console.log(v[0] + (v.length > 1 ? `  (+${v.length - 1} more like it)` : "")), process.env.ALL && v.slice(1).forEach((x) => console.log("   " + x));
  await browser.close(); server.close?.();
  process.exit(bad.length ? 1 : 0);
}
