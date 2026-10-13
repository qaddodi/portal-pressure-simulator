// Deck layout sweep (manual, .github/workflows/deck-sweep.yml): plays every slide of one or more presenter decks
// forward at each size (and back again on desktop), and prints what the DOM shows: a card off screen, clipped or
// overflowing text, cards that overlap, the corner credit on a card, a slide whose title never shows, a summary
// table or text that differs between forward and back, and console errors. The figure's look is not judged.
//
//   DECKS=circuit,hvpg DEVS=desktop,ipad,phone node tests/e2e/deck-sweep.mjs
//   (results also go to deck-sweep/<deck>.<size>.json)

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
const TITLES = Object.fromEntries(DECKS.map((d) => [d.id, withOverview(d).slides.map((x) => x.title)]));
const only = process.env.DECKS ? process.env.DECKS.split(',') : null;
const decks = DECKS.map((d) => d.id).filter((id) => !only || only.includes(id));
const server = await serve(ROOT);
// FAST=1: layout only (shorter settle, no camera checks, no backward pass); JOBS=n plays n deck/size pairs at once.
const ONE = +process.env.SLIDE || 0;   // SLIDE=n: only that slide (opened straight at it)
const FAST = !!process.env.FAST, JOBS = +process.env.JOBS || 1;
mkdirSync('deck-sweep', { recursive: true });
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1280, height: 800 } },
  wide: { viewport: { width: 1920, height: 1080 } },
  mac: { viewport: { width: 1901, height: 1139 } },
  ipadwide: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phone375: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone430: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  sideways: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  sideways375: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  sideways430: { viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const settle = (page) => page.waitForFunction(() => {
  if (document.querySelector('.pz-load.on')) return false;
  return !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.pz') && isFinite(a.effect.getTiming().iterations) );
}, null, { timeout: 5000, polling: 150 }).catch(() => 'timeout');
const snap = (page) => page.evaluate(() => {
  const vis = (el) => { if (!el || el.hidden) return null; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.5) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  const W = innerWidth, H = innerHeight, issues = [];
  // (content its card hides, such as a folded instrument, is not judged: under a see-through ancestor, or wholly outside one that clips)
  const hiddenIn = (c, card) => { const q = c.getBoundingClientRect(); for (let a = c.parentElement; a && a !== card; a = a.parentElement) { const cs = getComputedStyle(a); if (+cs.opacity < 0.05) return true; if (/(hidden|clip|auto|scroll)/.test(cs.overflowX + cs.overflowY)) { const r = a.getBoundingClientRect(); if (q.top >= r.bottom - 1 || q.bottom <= r.top + 1 || q.left >= r.right - 1 || q.right <= r.left + 1) return true; } } return false; };
  const boxes = {};
  for (const s of ['.pz-text', '.pz-data', '.pz-panel', '.pz-bar']) { const el = document.querySelector(s); const r = vis(el); if (!r) continue; boxes[s] = r;
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) issues.push(`${s} off-screen ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
    // clipped content
    for (const c of [el, ...el.querySelectorAll('*')]) { if (c.closest('.sr-only')) continue; const cs = getComputedStyle(c); if (/(hidden|auto|scroll)/.test(cs.overflowY + cs.overflowX) && (c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2) && c.clientHeight > 0) issues.push(`${s} ${c.className || c.tagName} clips/scrolls ${c.scrollWidth}x${c.scrollHeight} in ${c.clientWidth}x${c.clientHeight}`); }
    // text sticking out of the card
    for (const c of el.querySelectorAll('h1,p,li,span,td,th,button')) { const q = c.getBoundingClientRect(); if (!q.width || getComputedStyle(c).visibility === 'hidden' || hiddenIn(c, el)) continue; if (q.right > r.right + 2 || q.left < r.left - 2 || q.bottom > r.bottom + 2) { issues.push(`${s} ${c.tagName}.${c.className} "${c.textContent.trim().slice(0, 30)}" outside card`); break; } }
  }
  const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  const keys = Object.keys(boxes).filter((k) => k !== '.pz-panel');
  const inked = (el) => { const rs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('.sr-only, [aria-hidden="true"]')) { const g = document.createRange(); g.selectNodeContents(n); rs.push(...g.getClientRects()); } for (const e of el.querySelectorAll('svg, button, img, canvas')) rs.push(e.getBoundingClientRect()); return rs.filter((q) => q.width && q.height); };
  // (the words against the pill are judged by what is drawn: the last line runs beside the pill by design)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (ov(boxes[keys[i]], boxes[keys[j]]) && !([keys[i], keys[j]].includes('.pz-bar') && [keys[i], keys[j]].includes('.pz-text') && !inked(document.querySelector('.pz-text')).some((q) => ov(q, boxes['.pz-bar'])))) issues.push(`${keys[i]} overlaps ${keys[j]}`);
  // A callout on the figure (a reading, its summary, a site pill, an organ or vessel label) never sits under a card,
  // the slide's panel or its controls.
  for (const el of document.querySelectorAll('.cath-label:not(.in-sum):not(.cath-pre):not(.cath-out), .cath-sum-box, svg .lb')) {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    if (+getComputedStyle(el).opacity < 0.5 || el.closest('.cath-out, .cath-pre')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const name = (el.querySelector('small, text')?.textContent || el.textContent).trim().slice(0, 24);
    for (const [k, q] of Object.entries(boxes)) if (ov(r, q)) issues.push(`callout "${name}" under ${k}`);
  }
  const c = document.querySelector('.stage-credit');
  if (c && +getComputedStyle(c).opacity >= 0.5) { const r = c.getBoundingClientRect(); for (const el of document.querySelectorAll('.pz-text, .pz-data, .pz-panel, .pz-bar')) { const q = vis(el); if (q && q.left < r.right + 4 && q.right > r.left - 4 && q.top < r.bottom + 4 && q.bottom > r.top - 4) issues.push(`credit touches ${el.className.split(' ')[0]}`); } }
  // A summary table: each cell's visible contents sit inside its column heading, and no two cells overlap.
  const tb = document.querySelector('.pz-table');
  if (tb && !tb.querySelector('td.pend')) {
    const box = (el) => { const rs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('.sr-only')) { const g = document.createRange(); g.selectNodeContents(n); rs.push(...g.getClientRects()); } for (const e of el.querySelectorAll('svg, i')) if (!e.closest('.sr-only')) rs.push(e.getBoundingClientRect()); const v = rs.filter((q) => q.width && q.height); return v.length ? { l: Math.min(...v.map((q) => q.left)), r: Math.max(...v.map((q) => q.right)), t: Math.min(...v.map((q) => q.top)), b: Math.max(...v.map((q) => q.bottom)) } : null; };
    const heads = [...tb.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect());
    for (const tr of tb.querySelectorAll('tbody tr')) { let k = 0; const seen = []; for (const c of tr.children) { const span = +(c.getAttribute('colspan') || 1), hs = heads.slice(k, k + span).filter((h) => h.width); k += span; if (c.matches('td.note') || !hs.length) continue; const b = box(c); if (!b) continue; const n = c.textContent.trim().slice(0, 20), L = Math.min(...hs.map((h) => h.left)), R = Math.max(...hs.map((h) => h.right)); if (b.l < L - 1 || b.r > R + 1) issues.push(`table cell "${n}" outside its column`); for (const o of seen) if (b.l < o.b.r - 1 && o.b.l < b.r - 1 && b.t < o.b.b - 1 && o.b.t < b.b - 1) issues.push(`table cells "${n}" and "${o.n}" overlap`); seen.push({ b, n }); } }
  }
  // A station called out twice: a site pill and a live label on the same vessel (one reading, on the label).
  const SITE_NODE = { 'Portal vein': 'CONF', IVC: 'IVCS', 'Right atrium': 'RA' };
  for (const [k, n] of Object.entries(SITE_NODE)) {
    const pill = [...document.querySelectorAll('.cath-label.site:not(.cath-pre)')].find((e) => e.querySelector('small')?.textContent === k), lab = document.querySelector(`.lb[data-key="n:${n}"]`);
    if (pill && lab && +getComputedStyle(pill).opacity >= 0.5 && getComputedStyle(lab).display !== 'none' && +getComputedStyle(lab).opacity >= 0.5) issues.push(`${k} pill repeats the ${n} label`);
  }
  // Size checks. Laptop and iPad landscape (cards mode): the data card stacks under the teaching card, at its width, and
  // its blocks shrink only when the column has no room for them. Every size: no card text drawn below a readable size, and
  // a data card's drawing (a chart, an instrument) fills its box rather than sitting small inside it.
  const app = document.querySelector('.pz'), cards = app?.classList.contains('pz-card') && !app.classList.contains('stack');
  const T = boxes['.pz-text'], D = boxes['.pz-data'], dEl = document.querySelector('.pz-data'), tEl = document.querySelector('.pz-text');
  const tk = +(tEl?.style.getPropertyValue('--pz-tk') || 1), bk = +(tEl?.style.getPropertyValue('--pz-bk') || 1), dk = +(dEl?.style.getPropertyValue('--pz-dk') || 1);
  const fit = +(dEl?.style.getPropertyValue('--pz-fit') || 1), tfit = +(tEl?.style.getPropertyValue('--pz-fit') || 1);
  const shrink = { tk, bk, dk, fit, tfit };
  if (cards && T && D) {
    if (!(D.top >= T.bottom - 1)) issues.push(`SIDE BY SIDE: data card ${Math.round(D.width)}x${Math.round(D.height)} beside teaching card ${Math.round(T.width)}x${Math.round(T.height)} (window ${W}x${H})`);
    else {
      const bar = vis(document.querySelector('.pz-bar')), foot = bar && bar.left < T.right ? bar.top : H, spare = foot - D.bottom;
      if ((dk < 1 || bk < 1 || tk < 1) && spare > 120) issues.push(`SHRUNK WITH ROOM: ${Math.round(spare)}px spare below the stack, yet title x${tk}${bk < 1 ? `, text x${bk}` : ''}${dk < 1 ? `, data blocks x${dk}` : ''}`);
    }
  }
  if (fit < 0.9) issues.push(`DATA FIT: data card contents shrunk to x${fit.toFixed(2)} to fit`);
  if (tfit < 0.9) issues.push(`TEXT FIT: teaching card contents shrunk to x${tfit.toFixed(2)} to fit`);
  const minPx = W < 700 || H < 500 ? 10 : 11, small = new Map(), fonts = { teaching: [], data: [], panel: [] };
  for (const [s, el] of [['teaching', tEl], ['data', dEl], ['panel', document.querySelector('.pz-panel')]]) {
    if (!el || !vis(el)) continue;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const e = n.parentElement, t = n.textContent.trim(); if (!t || e.closest('.sr-only, [aria-hidden="true"]')) continue;
      if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const g = document.createRange(); g.selectNodeContents(n); const rr = [...g.getClientRects()].filter((q) => q.width && q.height); if (!rr.length) continue;
      if (rr.some((q) => q.bottom < 0 || q.top > H) || hiddenIn(e, el)) continue;
      let px = parseFloat(getComputedStyle(e).fontSize);
      if (e instanceof SVGElement) { const m = e.getScreenCTM?.(); if (m) px *= Math.hypot(m.a, m.b); } else px *= e.currentCSSZoom || 1;
      fonts[s].push([px, t.length, e.closest('h1, h2') ? 'title' : 'text']);
      if (px < minPx - 0.05) { const k = `${s}: "${t.slice(0, 24)}"`; if (!small.has(k) || small.get(k) > px) small.set(k, px); }
    }
  }
  if (small.size) issues.push(`SMALL TEXT (<${minPx}px): ` + [...small].sort((a, b) => a[1] - b[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}px`).join('; ') + (small.size > 6 ? ` (+${small.size - 6} more)` : ''));
  // Text sizes on one slide stay within reach of each other: the data card's words and numbers against the teaching card's
  // body text (its title aside), and no block far below the rest of its own card.
  const med = (a) => { const v = a.flatMap(([px, n]) => Array(Math.min(n, 40)).fill(px)).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };
  const tBody = med(fonts.teaching.filter((f) => f[2] === 'text')), dMed = med(fonts.data), dMin = fonts.data.length ? Math.min(...fonts.data.map((f) => f[0])) : 0;
  const type = { tBody: +tBody.toFixed(1), dMed: +dMed.toFixed(1), dMin: +dMin.toFixed(1) };
  if (tBody && dMed && dMed < tBody * 0.6) issues.push(`TEXT MISMATCH: data card text ${dMed.toFixed(1)}px against ${tBody.toFixed(1)}px teaching card text`);
  if (dMed && dMin && dMin < dMed * 0.6) issues.push(`TEXT MISMATCH: data card's smallest text ${dMin.toFixed(1)}px against its usual ${dMed.toFixed(1)}px`);
  if (D) for (const sv of dEl.querySelectorAll('svg')) {
    const r = sv.getBoundingClientRect(); if (r.width < 120 || r.height < 80 || sv.closest('[aria-hidden="true"] button, button')) continue;
    if (sv.checkVisibility && !sv.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let l = 1e9, t = 1e9, R = -1e9, B = -1e9;
    for (const g of sv.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, image')) { if (g.closest('defs, clipPath, mask, symbol')) continue; const q = g.getBoundingClientRect(); if (!q.width && !q.height) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); }
    if (R < l) continue;
    const fw = (Math.min(R, r.right) - Math.max(l, r.left)) / r.width, fh = (Math.min(B, r.bottom) - Math.max(t, r.top)) / r.height;
    if (fw < 0.7 || fh < 0.7) issues.push(`SMALL DRAWING: data card ${sv.getAttribute('class') || 'svg'} drawn in ${Math.round(fw * 100)}% x ${Math.round(fh * 100)}% of its ${Math.round(r.width)}x${Math.round(r.height)} box`);
  }
  if (D && cards) { const free = (D.height - [...dEl.children].reduce((a, c) => { const q = vis(c); return a + (q ? q.height : 0); }, 0)); if (free > 120) issues.push(`EMPTY DATA CARD SPACE: ${Math.round(free)}px of the data card's ${Math.round(D.height)}px height holds nothing`); }
  const txt = (s) => { const el = document.querySelector(s); return vis(el) ? el.innerText.replace(/\s+/g, ' ').trim() : ''; };
  const terms = [...document.querySelectorAll('.pz-term')].map((t) => `${t.textContent}→${t.dataset.target}`);
  const count = document.querySelector('.pzb-n, .pz-count')?.textContent.trim();
  const m = window.pps.store.get().frame?.metrics || {};
  const size = Object.fromEntries(['.pz-text', '.pz-data'].map((k) => [k, boxes[k] ? `${Math.round(boxes[k].width)}x${Math.round(boxes[k].height)}` : '']));
  const cam = window.__cam || 0; window.__cam = 0;
  const path = window.__path.splice(0);
  return { size, shrink, type, cam, path, count, text: txt('.pz-text'), data: txt('.pz-data'), panel: txt('.pz-panel'), terms, issues, m: { pv: m.pv?.toFixed(1), hvpg: m.hvpg?.toFixed(1), ppg: m.ppg?.toFixed(1) } };
});
// A camera that moves into a slide goes once, straight: no zoom or pan that turns back on itself (a round trip, or a move
// away and back to where it started). Zoom in log steps; pan in plate units at the camera's zoom (what the eye sees move).
const wander = (p) => {
  if (p.length < 3) return null;
  let lz = 0, lp = 0;
  for (let j = 1; j < p.length; j++) { lz += Math.abs(Math.log(p[j][0] / p[j - 1][0])); lp += Math.hypot(p[j][1] - p[j - 1][1], p[j][2] - p[j - 1][2]); }
  const a = p[0], b = p.at(-1), dz = Math.abs(Math.log(b[0] / a[0])), dp = Math.hypot(b[1] - a[1], b[2] - a[2]);
  if (lz - dz > 0.02 || (lp - dp > 6 && lp > dp * 1.15)) return `went back on itself: zoom ${lz.toFixed(3)} for a net ${dz.toFixed(3)}, pan ${lp.toFixed(0)} for a net ${dp.toFixed(0)}`;
  return null;
};
const norm = (t) => (t || '').replace(/[\u00ad\u200b-\u200d\u2060]/g, '').replace(/\s+/g, ' ').trim();
const shows = (page, title) => page.waitForFunction((t) => [...document.querySelectorAll('.pz-text h1, .pz-panel h1')].some((h) => h.textContent.replace(/[\u00ad\u200b-\u200d\u2060]/g, '').replace(/\s+/g, ' ').trim() === t && getComputedStyle(h.closest('section')).opacity > 0.9), norm(title), { timeout: 25000 }).then(() => true, () => false);
const at = (page, k) => page.waitForFunction((k) => (document.querySelector('.pzb-n')?.textContent.trim() || '').startsWith(k + ' /'), k, { timeout: 15000 }).catch(() => {});
async function run(deck, dev) {
  const browser = await chromium.launch();
  try {
  const ctx = await browser.newContext({ ...SIZES[dev], serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const tl = Date.now(); await page.goto(server.url + '?script=' + deck + (process.env.LITE ? '&lite=' + process.env.LITE : '') + (ONE ? '&slide=' + ONE : '')); if (process.env.DEBUGT) console.log('goto', Date.now() - tl);
  await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting'), null, { timeout: 60000 });
  if (process.env.DEBUGT) console.log('presenting', Date.now() - tl);
  // Every camera move asked of the stage, counted (read and reset by snap).
  // The camera, sampled every frame outside the lobule (read and reset by snap): the path it took into each slide.
  await page.evaluate(() => { window.__path = []; const st = window.pps.stage, f = () => { const g = window.pps.store.get(); if (!g.lobule && !g.sinusoid && st.cameraZoom() == null) { const c = st.cameraState(), l = window.__path.at(-1); if (!l || l[0] !== c.k || l[1] !== c.x || l[2] !== c.y) window.__path.push([c.k, c.x, c.y]); } requestAnimationFrame(f); }; f(); });
  await page.evaluate(() => { const st = window.pps.stage; for (const k of ['frameBox', 'fitSlow']) { const f = st[k]; st[k] = (...a) => { window.__cam = (window.__cam || 0) + 1; return f.apply(st, a); }; } });
  const fwd = [], back = [];
  let n = ONE || 99;
  for (let i = ONE ? ONE - 1 : 0; i < n; i++) {
    const t0 = Date.now(), lap = (w) => process.env.DEBUGT && console.log(deck, dev, i + 1, w, Date.now() - t0);
    const okT = await shows(page, TITLES[deck][i]); lap('title'); await settle(page); lap('settle'); await page.waitForTimeout(FAST ? 300 : 700); await page.waitForFunction(() => { const t = document.querySelector('.pzl-t'); return !t || !t.offsetParent || !/Day |→/.test(t.textContent); }, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(300);
    lap('lapse'); const s0 = await snap(page); await page.waitForTimeout(FAST ? 400 : 1500); const s = await snap(page); s.issues = s.issues.filter((x) => s0.issues.includes(x)); if (!okT) s.issues.push('title not shown: ' + TITLES[deck][i]);
    // Once in, a slide's cards keep their size and the camera moved at most once for it (no second glide as the cards settle).
    for (const k of ['.pz-text', '.pz-data']) if (s0.size[k] && s.size[k] && s0.size[k] !== s.size[k]) s.issues.push(`${k} changed size after it showed (${s0.size[k]} -> ${s.size[k]})`);
    if (!FAST && s0.cam + s.cam > 1) s.issues.push(`camera framed ${s0.cam + s.cam} times for one slide`);
    if (!FAST) { const w = wander([...s0.path, ...s.path]); if (w && i > 0) s.issues.push(`CAMERA ${w}`); }
    s.slide = i + 1; fwd.push(s); lap('snap');
    const m = s.count?.match(/(\d+) \/ (\d+)/); if (m && !ONE) n = +m[2];
    if (i < n - 1) { await page.keyboard.press('ArrowRight'); await at(page, i + 2); }
  }
  // The same deck at one size: a data card's text much smaller or larger than on the deck's other slides.
  { const v = fwd.map((s) => s.type?.dMed).filter(Boolean).sort((a, b) => a - b), m = v[v.length >> 1];
    if (m) fwd.forEach((s) => { const d = s.type?.dMed; if (d && (d < m * 0.75 || d > m * 1.33)) s.issues.push(`DECK MISMATCH: data card text ${d}px where the deck's slides use about ${m}px`); }); }
  if (dev === 'desktop' && !FAST) for (let i = n - 2; i >= 0; i--) { await page.keyboard.press('ArrowLeft'); await at(page, i + 1); await shows(page, TITLES[deck][i]); await settle(page); await page.waitForTimeout(2000); back.unshift(await snap(page)); }
  await ctx.close();
  return { fwd, back, errors };
  } finally { await browser.close().catch(() => {}); }
}
const jobs = [];
for (const d of decks) for (const dev of (process.env.DEVS || 'desktop,ipad,phone').split(',')) jobs.push([d, dev]);
let failed = 0, camBad = 0;
const report = (deck, dev, r) => {
  const lines = [];
  r.errors.forEach((e) => lines.push(`console: ${e.slice(0, 200)}`));
  r.fwd.forEach((s, i) => {
    s.issues.forEach((x) => { lines.push(`slide ${s.slide || i + 1}: ${x}`); if (x.startsWith('CAMERA')) camBad++; });
    const b = r.back[i];
    if (b && (b.text !== s.text || b.panel !== s.panel)) lines.push(`slide ${i + 1}: words differ going back | F: ${(s.text + s.panel).slice(0, 160)} | B: ${(b.text + b.panel).slice(0, 160)}`);
  });
  console.log(`== ${deck} ${dev}: ${r.fwd.length} slides, ${lines.length ? lines.length + ' finding(s)' : 'clean'}`);
  for (const l of lines) console.log('   ' + l);
};
const one = async ([d, dev]) => {
  let r = null;
  for (let tries = 0; tries < 2 && !r; tries++) {
    try { r = await run(d, dev); } catch (e) { console.log(`RETRY ${d} ${dev}: ${e.message.split('\n')[0]}`); }
  }
  if (!r) { failed++; console.log(`FAIL ${d} ${dev}`); return; }
  writeFileSync(`deck-sweep/${d}.${dev}.json`, JSON.stringify(r));
  report(d, dev, r);
};
const queue = [...jobs];
await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) await one(queue.shift()); }));
server.close?.();
// (A camera that goes back on itself fails the job; the layout findings are for reading.)
process.exit(failed || camBad ? 1 : 0);
