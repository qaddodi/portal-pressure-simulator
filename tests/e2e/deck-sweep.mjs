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
mkdirSync('deck-sweep', { recursive: true });
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  sideways: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const settle = (page) => page.waitForFunction(() => {
  if (document.querySelector('.pz-load.on')) return false;
  return !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.pz') && isFinite(a.effect.getTiming().iterations) );
}, null, { timeout: 5000, polling: 150 }).catch(() => 'timeout');
const snap = (page) => page.evaluate(() => {
  const vis = (el) => { if (!el || el.hidden) return null; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.5) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  const W = innerWidth, H = innerHeight, issues = [];
  const boxes = {};
  for (const s of ['.pz-text', '.pz-data', '.pz-panel', '.pz-bar']) { const el = document.querySelector(s); const r = vis(el); if (!r) continue; boxes[s] = r;
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) issues.push(`${s} off-screen ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
    // clipped content
    for (const c of [el, ...el.querySelectorAll('*')]) { if (c.closest('.sr-only')) continue; const cs = getComputedStyle(c); if (/(hidden|auto|scroll)/.test(cs.overflowY + cs.overflowX) && (c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2) && c.clientHeight > 0) issues.push(`${s} ${c.className || c.tagName} clips/scrolls ${c.scrollWidth}x${c.scrollHeight} in ${c.clientWidth}x${c.clientHeight}`); }
    // text sticking out of the card
    for (const c of el.querySelectorAll('h1,p,li,span,td,th,button')) { const q = c.getBoundingClientRect(); if (!q.width || getComputedStyle(c).visibility === 'hidden') continue; if (q.right > r.right + 2 || q.left < r.left - 2 || q.bottom > r.bottom + 2) { issues.push(`${s} ${c.tagName}.${c.className} "${c.textContent.trim().slice(0, 30)}" outside card`); break; } }
  }
  const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  const keys = Object.keys(boxes).filter((k) => k !== '.pz-panel');
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (ov(boxes[keys[i]], boxes[keys[j]])) issues.push(`${keys[i]} overlaps ${keys[j]}`);
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
  const txt = (s) => { const el = document.querySelector(s); return vis(el) ? el.innerText.replace(/\s+/g, ' ').trim() : ''; };
  const terms = [...document.querySelectorAll('.pz-term')].map((t) => `${t.textContent}→${t.dataset.target}`);
  const count = document.querySelector('.pzb-n, .pz-count')?.textContent.trim();
  const m = window.pps.store.get().frame?.metrics || {};
  const size = Object.fromEntries(['.pz-text', '.pz-data'].map((k) => [k, boxes[k] ? `${Math.round(boxes[k].width)}x${Math.round(boxes[k].height)}` : '']));
  const cam = window.__cam || 0; window.__cam = 0;
  return { size, cam, count, text: txt('.pz-text'), data: txt('.pz-data'), panel: txt('.pz-panel'), terms, issues, m: { pv: m.pv?.toFixed(1), hvpg: m.hvpg?.toFixed(1), ppg: m.ppg?.toFixed(1) } };
});
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
  await page.goto(server.url + '?script=' + deck);
  await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting'), null, { timeout: 60000 });
  // Every camera move asked of the stage, counted (read and reset by snap).
  await page.evaluate(() => { const st = window.pps.stage; for (const k of ['frameBox', 'fitSlow']) { const f = st[k]; st[k] = (...a) => { window.__cam = (window.__cam || 0) + 1; return f.apply(st, a); }; } });
  const fwd = [], back = [];
  let n = 99;
  for (let i = 0; i < n; i++) {
    const okT = await shows(page, TITLES[deck][i]); await settle(page); await page.waitForTimeout(700); await page.waitForFunction(() => { const t = document.querySelector('.pzl-t'); return !t || !t.offsetParent || !/Day |→/.test(t.textContent); }, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(300);
    const s0 = await snap(page); await page.waitForTimeout(1500); const s = await snap(page); s.issues = s.issues.filter((x) => s0.issues.includes(x)); if (!okT) s.issues.push('title not shown: ' + TITLES[deck][i]);
    // Once in, a slide's cards keep their size and the camera moved at most once for it (no second glide as the cards settle).
    for (const k of ['.pz-text', '.pz-data']) if (s0.size[k] && s.size[k] && s0.size[k] !== s.size[k]) s.issues.push(`${k} changed size after it showed (${s0.size[k]} -> ${s.size[k]})`);
    if (s0.cam + s.cam > 1) s.issues.push(`camera framed ${s0.cam + s.cam} times for one slide`);
    fwd.push(s);
    const m = s.count?.match(/(\d+) \/ (\d+)/); if (m) n = +m[2];
    if (i < n - 1) { await page.keyboard.press('ArrowRight'); await at(page, i + 2); }
  }
  if (dev === 'desktop') for (let i = n - 2; i >= 0; i--) { await page.keyboard.press('ArrowLeft'); await at(page, i + 1); await shows(page, TITLES[deck][i]); await settle(page); await page.waitForTimeout(2000); back.unshift(await snap(page)); }
  await ctx.close();
  return { fwd, back, errors };
  } finally { await browser.close().catch(() => {}); }
}
const jobs = [];
for (const d of decks) for (const dev of (process.env.DEVS || 'desktop,ipad,phone').split(',')) jobs.push([d, dev]);
let failed = 0;
const report = (deck, dev, r) => {
  const lines = [];
  r.errors.forEach((e) => lines.push(`console: ${e.slice(0, 200)}`));
  r.fwd.forEach((s, i) => {
    s.issues.forEach((x) => lines.push(`slide ${i + 1}: ${x}`));
    const b = r.back[i];
    if (b && (b.text !== s.text || b.panel !== s.panel)) lines.push(`slide ${i + 1}: words differ going back | F: ${(s.text + s.panel).slice(0, 160)} | B: ${(b.text + b.panel).slice(0, 160)}`);
  });
  console.log(`== ${deck} ${dev}: ${r.fwd.length} slides, ${lines.length ? lines.length + ' finding(s)' : 'clean'}`);
  for (const l of lines) console.log('   ' + l);
};
for (const [d, dev] of jobs) {
  let r = null;
  for (let tries = 0; tries < 2 && !r; tries++) {
    try { r = await run(d, dev); } catch (e) { console.log(`RETRY ${d} ${dev}: ${e.message.split('\n')[0]}`); }
  }
  if (!r) { failed++; console.log(`FAIL ${d} ${dev}`); continue; }
  writeFileSync(`deck-sweep/${d}.${dev}.json`, JSON.stringify(r));
  report(d, dev, r);
}
server.close?.();
process.exit(failed ? 1 : 0);
