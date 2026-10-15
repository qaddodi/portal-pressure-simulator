// Type scale check: every piece of text on the figure (labels and pills) and on a presenter slide card is one of six
// roles (styles/tokens.css --t-*, slide cards --s-*) times the text size setting, never under 11 px, and a pill's
// unit is never larger than its reading. Explore's four views at every text size step on a phone, at 100 % and 200 %
// on an upright iPad and a desktop; the first slides of eight decks at 100 % (and one at 150 %) at each size, a phone on
// its side included. A phone's slide words (its bottom panel, the title panel) are 1.7 times the roles' size upright, 1.4 times on its side (a77f314: the phone sizes; its summary table and level rail keep their own size).
// The drawn slide charts (ladders, strip, SAAG map, walls, still column) are checked by tests/e2e/chart-type.mjs.
// Run alone: node tests/e2e/type-scale.mjs; also run by smoke.mjs (desktop run).
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { TEXT_STEPS } from '../../src/ui/type-scale.js';

export const SIZES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'iPad', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'phone sideways', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];
const DECKS = ['circulation', 'lobule', 'hvpg', 'sites', 'ascites', 'doppler', 'endoscopy', 'variceal-bleed'];
const ROLES = ['cap', 'lab', 'body', 'val', 'big', 'title'];

// In the page: text that is off the scale (empty when it all fits).
export function offScale(roles) {
  const out = [];
  const probe = (host, v) => { const p = document.createElement('span'); p.style.cssText = `position:absolute;visibility:hidden;font-size:${v}`; host.append(p); const px = parseFloat(getComputedStyle(p).fontSize); p.remove(); return px; };
  const shown = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !el.closest('.sr-only'); };
  const areas = [];
  const fig = document.querySelector('#stageView');
  if (fig) areas.push({ root: fig, name: 'figure', skip: '.pz, .float-ui, .stage-credit, .tool-card, .zoom-pill, .vdock, .sb-banner', sizes: (el) => { const host = el.closest('.sv, .lz-host') || fig; return roles.map((r) => probe(host, `calc(var(--t-${r}) * var(--label-scale, 1) * ${el.closest('.lz-zone') ? 'var(--zk, 1)' : 1})`)); } });
  for (const pz of document.querySelectorAll('.pz')) areas.push({ root: pz, name: 'slide', skip: 'svg, .pz-bar, .pz-tool, .pzj, .pz-deck, .pz-outline svg', sizes: (el) => { const host = el.closest('.pz-table, .pz-grid, .pz.low .pz-rail, .pz-text, .pz-panel, .pz-data.col') || pz; return [...roles.map((r) => probe(host, `var(--s-${r})`)),
    // (A long title in the teaching card is the big role at the title's step, --pz-tk, as the title itself: presenter.js layout.)
    ...(host.matches('.pz-text') ? [probe(host, 'calc(var(--s-big) * var(--pz-tk, 1))')] : []),
    // (A stacked data card's smallest words stay 11.5 px on the screen at its smaller steps, --pz-dk: app.css .pz-data.col.)
    ...(host.matches('.pz-data.col') ? [probe(host, 'calc(11.5px / var(--pz-dk, 1))')] : []),
    // (A data card beside the words has one small size for its tiles' names, units and scales, --pz-sm: app.css .pz-data.)
    ...(el.closest('.pz:not(.stack) .pz-data') ? [probe(el.closest('.pz-data'), 'var(--pz-sm)')] : []),
    // (An equation is set a little above its line's role, as STIX runs small: app.css .pz-eq math, --eq-k its fitted step.)
    ...(el.closest('.pz-eq math') ? ['calc(var(--s-lab) * 1.1 * var(--eq-k, 1))', 'calc(var(--s-body) * 1.15 * var(--eq-k, 1))', 'calc(var(--s-val) * var(--eq-k, 1))'].map((v) => probe(el.closest('.pz-eq'), v)) : []),
    // (A case card's words are the body role at the card's fitted step, --case-k: app.css .pz-case-p.)
    ...(el.closest('.pz-case') ? [probe(el.closest('.pz-case'), 'calc(var(--s-body) * var(--case-k, var(--case-max)))')] : [])]; } });
  for (const a of areas) {
    const w = document.createTreeWalker(a.root, NodeFilter.SHOW_TEXT);
    const cache = new Map();
    for (let n; (n = w.nextNode());) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest(a.skip) || (a.name === 'figure' && el.closest('.pz')) || !shown(el)) continue;
      // (A tile's short name is its ::after, the full name kept at 0 px for readers: the short name's size is judged.)
      const fs = parseFloat(getComputedStyle(el).fontSize) || (el.dataset.s ? parseFloat(getComputedStyle(el, '::after').fontSize) : 0);
      const key = el.closest('.sv, .lz-host, .lz-zone, .pz-eq math, .pz-case, .pz-table, .pz-grid, .pz.low .pz-rail, .pz-text, .pz-panel, .pz-data') || a.root;   // (a phone's site rows letter at their own roles, as the summary table does)
      if (!cache.has(key)) cache.set(key, a.sizes(el));
      const ok = cache.get(key);
      const what = `${a.name} ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${n.textContent.trim().slice(0, 16)}" ${fs.toFixed(1)}px`;
      // (Figure text is never under 12 px, the floor for captions on a phone too; slide cards keep their own 11 px floor.)
      if (fs < (a.name === 'figure' ? 11.95 : 10.95)) out.push(`${what} under ${a.name === 'figure' ? 12 : 11} px`);
      else if (!ok.some((v) => Math.abs(v - fs) < 0.6)) out.push(`${what} off the scale (${ok.map((v) => v.toFixed(1)).join(' ')})`);
    }
  }
  // A pill's unit is never larger than its reading.
  for (const [val, unit] of [['.lb-val', '.lb-unit'], ['.lz-lab .v b', '.lz-lab small'], ['.sv-region .v b', '.sv-region .v']]) {
    for (const v of document.querySelectorAll(val)) {
      const g = v.closest('.lb, .lz-lab, .sv-region'), u = g?.querySelector(unit);
      if (u && u !== v && shown(v) && shown(u) && parseFloat(getComputedStyle(u).fontSize) > parseFloat(getComputedStyle(v).fontSize) + 0.1) out.push(`unit larger than its reading in ${g.className.baseVal ?? g.className} "${v.textContent.trim()}"`);
    }
  }
  // The outline slide's items and objectives are set in the title's serif face.
  const title = document.querySelector('.pz-h, .pz-dtitle');
  for (const li of document.querySelectorAll('.pz-outline li')) {
    if (title && shown(li) && getComputedStyle(li).fontFamily !== getComputedStyle(title).fontFamily) out.push(`outline item "${li.textContent.trim().slice(0, 16)}" not in the title's font`);
  }
  return [...new Set(out)];
}

const settle = (page) => page.waitForTimeout(1600);
// (only: one size's name, as smoke.mjs runs each size as a check of its own)
export async function checkTypeScale(browser, url, log = console.log, only = null) {
  const bad = [];
  for (const size of SIZES.filter((s) => (!process.env.TS_SIZES || process.env.TS_SIZES.split(',').includes(s.name)) && (!only || s.name === only))) {
    const { name, ...opts } = size;
    const steps = name === 'phone' ? TEXT_STEPS : name === 'phone sideways' ? [1] : [1, 2];
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const at = async (step, path) => { await page.addInitScript((s) => { try { localStorage.setItem('pps.labelScale', String(s)); localStorage.setItem('pps.labelScaleV', '2'); } catch { /* */ } }, step); await page.goto(url + path); await page.waitForTimeout(3000); };
    const look = async (where) => { const r = await page.evaluate(offScale, ROLES); r.forEach((x) => bad.push(`${name} ${where}: ${x}`)); };
    for (const step of steps) {
      await at(step, '');
      for (const v of ['anatomic', 'circuit', 'lobule', 'sinusoid']) {
        await page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`)?.click(), v); await settle(page);
        await look(`${v} at ${step * 100}%`);
      }
    }
    for (const [deck, step] of [...DECKS.map((d) => [d, 1]), ['circulation', 1.5]]) {
      await at(step, `?script=${deck}`);
      await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting'), null, { timeout: 60000 });
      for (let i = 1; i <= 4; i++) { await settle(page); await look(`${deck} slide ${i} at ${step * 100}%`); await page.keyboard.press('ArrowRight'); }
      // A phone sets the slide's words at 1.7 times the roles' size upright, 1.4 times on its side (a77f314; the summary table keeps their own size).
      if (name.startsWith('phone') && deck === 'circulation') {
        const k = await page.evaluate(() => +getComputedStyle(document.querySelector('.pz-text')).getPropertyValue('--pk'));
        const want = name === 'phone' ? 1.7 : 1.4;   // (on its side, 1.4, the phone sizes since a77f314: twice would not fit 390 px of height)
        if (k !== want) bad.push(`${name} slides: slide text ${k}× the roles, not ${want}×`);
      }
    }
    // The pressure-scale slides (their HTML scale on a phone and the key under it).
    for (const [deck, n] of [['hvpg', 6], ['stiffness', 5]]) { await at(1, `?script=${deck}&slide=${n}`); await settle(page); await look(`${deck} slide ${n} at 100%`); }
    log(`type scale ${name}: ${bad.length} finding(s) so far`);
    await ctx.close();
  }
  return bad;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await serve(new URL('../..', import.meta.url).pathname);
  const browser = await chromium.launch();
  const bad = await checkTypeScale(browser, server.url);
  const seen = new Map(); for (const b of bad) { const k = b.replace(/^\S+ [^:]+: /, '').replace(/"[^"]*" [\d.]+px/, ''); seen.set(k, (seen.get(k) || []).concat(b)); }
  for (const [, v] of seen) console.log(v[0] + (v.length > 1 ? `  (+${v.length - 1} more like it)` : ''));
  await browser.close(); server.close?.();
  process.exit(bad.length ? 1 : 0);
}
