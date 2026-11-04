// End-to-end smoke test in a real browser (Chromium via Playwright): the app loads without
// errors on a desktop and a phone, the model runs, and every major surface opens.
//
//   node tests/e2e/smoke.mjs            the repository root (the build-free site)
//   node tests/e2e/smoke.mjs dist       the production build (npm run build first)
//   SHOTS=dir node tests/e2e/smoke.mjs  also save screenshots
//   SMOKE_WORKERS=1                    checks at a time (default 4; use 1 on a small CI runner)
//   SMOKE_DEVICE=phone SMOKE_SHARD=1/2 one device, and one share of its checks (CI runs shards in parallel)
//   SMOKE_RETRIES=0                    no second try (default 1: a check that failed only by timing
//                                       out on a slow runner gets one more try; any other failure counts)
//   SMOKE_GPUORGANS=force              every page opens with ?gpuorgans=force: the organs drawn as GPU layers, which a
//                                       software renderer (CI's) otherwise never does (the "gpu-organs" job in ci.yml and checks.yml)
//   SMOKE_MATCH=<regex>                only the checks whose name matches it (with SMOKE_GPUORGANS and no SMOKE_MATCH: the figure's own, FIGURE_CHECKS)
//   The checks are in smoke-01.mjs … smoke-09.mjs beside this file (this file is the runner, the page helpers and the shares).
//
// Needs a Chromium for Playwright (`npx playwright install chromium`; the Claude Code cloud
// image ships one).

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, instantMotionOn, quiet } from './fast.mjs';
import { SIZES as CHART_SIZES_ALL, checkCharts, checkLadderBrackets, LADDER_SIZES, checkStrip, checkStripSlides, stripSlides, checkStripGaps } from './chart-text.mjs';
import { checkPhoneFit, fitIssues, PHONES } from './phone-fit.mjs';
import { checkTypeScale, SIZES as TYPE_SIZES } from './type-scale.mjs';
import { TEXT_MIN, TEXT_MAX } from '../../src/ui/type-scale.js';
import { checkChartText, chartTypeSlides } from './chart-type.mjs';

const dir = process.argv[2] || '.';
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const server = await serve(dir);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
// SMOKE_GPUORGANS=force (see the header): every page of every context, the checks' own as well as the shared ones, opens with ?gpuorgans=force.
const GPU_ORGANS = process.env.SMOKE_GPUORGANS;
// The checks that draw or move the figure itself (about 25 minutes on a desktop runner): what SMOKE_GPUORGANS runs when no SMOKE_MATCH names others.
// The rest judge cards, words and charts, which the organs' path does not touch.
const FIGURE_CHECKS = 'moving blood on the GPU|Fit always|pan and pinch|presenter in the liver|leaders reach|zooming out|vessels and plate|liver lobule: GPU|lobule: a Fit glide|lobule zoom is continuous: (Explore|lobule slide 1|tap slide 8)';
if (GPU_ORGANS) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (o) => {
    const ctx = await newContext(o), newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async () => {
      const page = await newPage(), go = page.goto.bind(page);
      page.goto = (url, opts) => { const [path, hash] = url.split('#'); return go(`${path}${path.includes('?') ? '&' : '?'}gpuorgans=${GPU_ORGANS}${hash ? '#' + hash : ''}`, opts); };
      return page;
    };
    return ctx;
  };
}
let failed = 0;

const TYPE_SCALE_SIZES = TYPE_SIZES.map((s) => s.name), CHART_TEXT_SIZES = CHART_SIZES_ALL.map((s) => s.name);
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

// Checks are queued, then run a few at a time (each has its own browser context).
const queue = [];
// SMOKE_ONLY=<words>: only the checks whose name contains them (a quick local run of one check).
const check = (device, name, fn) => { if (!process.env.SMOKE_ONLY || name.includes(process.env.SMOKE_ONLY)) queue.push([device, name, fn]); };
const RETRIES = process.env.SMOKE_RETRIES === undefined ? 1 : Number(process.env.SMOKE_RETRIES);
// a Playwright timeout, also when a check re-threw it with its own message ({ cause })
const timedOut = (e) => { for (; e; e = e.cause) if (e.name === 'TimeoutError') return true; return false; };
async function runCheck(device, name, fn, tries = RETRIES) {
  const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  // Four pages share a software GPU in CI, where one frame can take seconds: give taps and waits room.
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/DBG/.test(m.text())) console.log(m.text()); });
  const t0 = Date.now();
  try {
    await fn(page);
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    console.log(`ok   ${device.padEnd(7)} ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    // Only a timeout gets a second try (a slow runner); a wrong value or a page error fails at once.
    if (tries > 0 && timedOut(e)) {
      console.log(`RETRY ${device.padEnd(7)} ${name}: timed out (${e.message.split('\n')[0]})`);
      await ctx.close();
      return runCheck(device, name, fn, tries - 1);
    }
    failed++;
    console.log(`FAIL ${device.padEnd(7)} ${name}: ${e.message.split('\n')[0]}`); if (process.env.SMOKE_STACK) console.log(e.stack);
    if (shots) await page.screenshot({ path: `${shots}/FAIL-${device}-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
  await ctx.close();
}
// An upright phone has the thumb dock: Treat, Tests and Settings, and the Blood and lobule Layers menus (in Layers), are
// reached from the dock's tab row instead of the top bar.
const THUMB = { '#tabInstruments': 'tests', '#btnTreat': 'treat', '#btnBlood': 'layers', '#btnLobuleLayers': 'layers', '#btnSettings': 'settings' };
async function tapTool(page, sel) {
  const tab = THUMB[sel];
  if (!tab || !(await page.evaluate(() => document.querySelector('#app').classList.contains('thumb')))) return page.click(sel);
  await page.click(`#thumbBar [data-tab="${tab}"]`);
}
// A view by its switch: in the top bar, or on the thumb dock in its line above the tabs (the sinusoid view: a pill at the bottom left).
async function pickView(page, v) {
  // (Only once the loading cover is away: start-up work runs under it (8487ae22), and a tap on it is the cover's, not the button's.
  // On a slow software renderer it stays up for seconds after the first frame, and the view was never picked.)
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('done'); }, null, { timeout: 60000 });
  return page.click(`#viewSeg [data-view="${v}"]`, { force: true });
}
// The circuit's turn upright: the button on the figure, or on an upright phone the item in the Layers tab's menu.
async function turnCircuit(page) {
  if (!(await page.evaluate(() => document.querySelector('#app').matches('.thumb:not(.sin-focus)')))) return page.click('#rotateCircuit');
  await page.click('#thumbBar [data-tab="layers"]');
  await page.click('.layers-pop:not(.leaving) .menu-item:has-text("Turn upright")');
  await page.waitForSelector('.layers-pop', { state: 'detached' });
}
const shot = (page, name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : null);
const open = async (page, q = '') => {
  await page.goto(server.url + q);
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 45000 });
};

// The lobule's station labels: every vessel label shows, no leader is longer than an optional label may take (140 px), and
// a Lymph label left out had no clear spot within that of its node. The spot search is the check's own: a fine grid of every
// position whose leader is short enough, kept inside the free space, off the other labels (with the margins the layout keeps
// between labels), the cards, the central vein and portal tract discs, the node itself, and with no leader crossing it or its own
// leader crossing a label. Returns what is wrong ([] when nothing is). (fault: 'drop' hides a shown Lymph label first, 'long'
// stretches one leader to 150 px, to prove the check catches both.)
const stationRoom = (page, fault = null) => page.evaluate((fault) => {
  const lay = document.querySelector('.lz.on .lz-labels'), room = JSON.parse(lay?.dataset.room || 'null'), bad = [];
  if (!room) return ['the lobule has no layout to check'];
  const host = lay.getBoundingClientRect(), labs = [...lay.querySelectorAll('.lz-lab')];
  const rel = (r) => ({ l: r.left - host.left, t: r.top - host.top, r: r.right - host.left, b: r.bottom - host.top });
  const ly = labs.find((l) => l.dataset.target === 'lobule:lymph');
  // (A label fading out, .lz-off, has already left: it is hidden once its fade ends. Its leader fades with it, .ld-gone.)
  const out = (l) => !!l && (l.hidden || l.classList.contains('lz-off'));
  if (fault === 'drop' && ly && !out(ly)) ly.hidden = true;
  const lines = [...document.querySelectorAll('.lz.on .lz-leaders line.leader')];
  if (fault === 'long') { const l = lines.find((q) => q.style.display !== 'none' && !q.classList.contains('ld-gone') && q.getAttribute('x2') != null); const [x, y] = [+l.getAttribute('x1'), +l.getAttribute('y1')]; l._g.x2 = x + 150; l._g.y2 = y; }   // (the ends are held on the piece, svg-gl setGeo, not written as attributes)
  for (const k of ['central', 'sinusoid', 'triad']) if (out(labs.find((l) => l.dataset.target === `lobule:${k}`))) bad.push(`the ${k} label is left out`);
  const shown = labs.filter((l) => !out(l) && l.offsetWidth);
  const segs = lines.filter((l) => l.style.display !== 'none' && !l.classList.contains('ld-gone') && l.getAttribute('x2') != null && !l.closest('[hidden]') && labs.find((q) => q.dataset.target === l.dataset.target && !out(q)))
    .map((l) => ({ k: l.dataset.target, p: [+l.getAttribute('x1'), +l.getAttribute('y1')], q: [+l.getAttribute('x2'), +l.getAttribute('y2')] }));
  for (const g of segs) { const n = Math.hypot(g.q[0] - g.p[0], g.q[1] - g.p[1]); if (n > room.lead + 1) bad.push(`the ${g.k} leader is ${n.toFixed(0)} px (over ${room.lead})`); }
  if (out(ly)) {
    // Its size as it would be drawn.
    const was = ly.hidden;
    ly.hidden = false; ly.style.visibility = 'hidden';
    const w = ly.offsetWidth, h = ly.offsetHeight;
    ly.hidden = was; ly.style.visibility = '';
    const [ax, ay] = (ly.dataset.at || '').split(',').map(Number);
    const boxes = shown.map((l) => rel(l.getBoundingClientRect()));
    const big = (b) => ({ l: b.l - room.hx, r: b.r + room.hx, t: b.t - room.hy, b: b.b + room.hy });
    const meets = (a, b) => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t);
    const disc = (x, y, r, b) => Math.hypot(Math.max(b.l - x, 0, x - b.r), Math.max(b.t - y, 0, y - b.b)) < r;
    const cross = (p, q, b) => { let t0 = 0, t1 = 1; for (const [d, lo, hi, o] of [[q[0] - p[0], b.l, b.r, p[0]], [q[1] - p[1], b.t, b.b, p[1]]]) { if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return false; continue; } let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) return false; } return true; };
    // (Two leaders crossing each other.)
    const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const cut = (p, q, r, t) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
    const [fl, ft, frr, fb] = room.fr;
    let clear = null;
    for (let x = fl + w / 2 + room.pad; x <= frr - w / 2 - room.pad && !clear; x += 3) for (let y = ft + h / 2 + room.pad; y <= fb - h / 2 - room.pad && !clear; y += 3) {
      const b = { l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 }, B = big(b);
      if (Math.hypot(Math.max(0, Math.abs(ax - x) - w / 2), Math.max(0, Math.abs(ay - y) - h / 2)) > room.lead) continue;
      if (disc(ax, ay, 10, B) || boxes.some((o) => meets(B, big(o))) || room.cards.some(([l, t, r, bb]) => meets(B, { l, t, r, b: bb })) || room.keep.some(([kx, ky, kr]) => disc(kx, ky, kr, B))) continue;
      if (boxes.some((o) => cross([ax, ay], [x, y], big(o))) || segs.some((g) => cross(g.p, g.q, B) || cut(g.p, g.q, [ax, ay], [x, y]))) continue;
      clear = [x, y];
    }
    if (clear) bad.push(`the Lymph label is left out though a clear spot lies at (${clear.map((v) => v.toFixed(0))}), within ${room.lead} px of its node`);
  }
  return bad;
}, fault);

// Every frame for `ms`: each leader on screen against the labels on screen (the lobule's and the anatomy's). A leader ends on
// the edge of its own label's letters (no gap, never in under them) and crosses no other label. Returns what was wrong, each
// problem once with the time it was first seen.
const leaderFrames = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const out = new Map(), t0 = performance.now();
  const op = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement || e.parentNode) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
  // A lobule label's letters are its .n and .v rows; an anatomy label's are its letters, each from the top of its ink to
  // the bottom (measured with the same font on a canvas), so a gap above the letters counts.
  const cv = document.createElement('canvas').getContext('2d');
  const ink = (el) => {
    let b = null, sc = 1;
    const parts = [];
    const add = (l, r, t, bt) => { parts.push({ l, r, t, b: bt }); b = b ? { l: Math.min(b.l, l), r: Math.max(b.r, r), t: Math.min(b.t, t), b: Math.max(b.b, bt), parts } : { l, r, t, b: bt, parts }; };
    // (A label the slide's words light is seen as its pill.)
    if (el.matches('.lz-lab') && (document.getElementById('app').dataset.lit || '').split(' ').includes(el.dataset.target)) {
      const r = el.getBoundingClientRect(), pill = getComputedStyle(el, '::before'), px = Math.max(0, -parseFloat(pill.left) || 0), py = Math.max(0, -parseFloat(pill.top) || 0);
      add(r.left - px, r.right + px, r.top - py, r.bottom + py);
      // (Its corners are rounded: a leader stopping on the square corner stops short of what is seen.)
      parts[0].rr = Math.min(parseFloat(pill.borderTopLeftRadius) || 0, (r.width + 2 * px) / 2, (r.height + 2 * py) / 2);
      return b;
    }
    // (The slide's pointer pill: its own rounded box.)
    if (el.matches('.lz-call')) { const r = el.getBoundingClientRect(); add(r.left, r.right, r.top, r.bottom); parts[0].rr = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.width / 2, r.height / 2); return b; }
    if (el.matches('.lz-lab')) { for (const p of el.querySelectorAll('.n, .v')) { const r = p.getBoundingClientRect(); if (r.width) add(r.left, r.right, r.top, r.bottom); } return b; }
    // (Letter by letter: where each sits from the text's own layout, how high and low its ink reaches from the font.)
    for (const tx of el.querySelectorAll('text')) {
      const m = tx.getScreenCTM(); if (!m) continue;
      const k = Math.hypot(m.c, m.d), base = m.d * +tx.getAttribute('y') + m.f;
      sc = k;
      let i = 0;
      for (const sp of tx.querySelectorAll('tspan')) {
        const cs = getComputedStyle(sp);
        cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        for (const ch of sp.textContent) {
          if (ch.trim()) {
            const e = tx.getExtentOfChar(i), mt = cv.measureText(ch);
            add(m.a * e.x + m.e, m.a * (e.x + e.width) + m.e, base - mt.actualBoundingBoxAscent * k, base + mt.actualBoundingBoxDescent * k);
          }
          i++;
        }
      }
    }
    if (b) b.sc = sc;
    return b;
  };
  // How far the segment p→q runs inside box b.
  const under = (p, q, b) => {
    let t0 = 0, t1 = 1;
    for (const [d, lo, hi, o] of [[q[0] - p[0], b.l, b.r, p[0]], [q[1] - p[1], b.t, b.b, p[1]]]) {
      if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return 0; continue; }
      let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) return 0;
    }
    return (t1 - t0) * Math.hypot(q[0] - p[0], q[1] - p[1]);
  };
  const tick = () => {
    const t = Math.round(performance.now() - t0), labs = [];
    for (const el of document.querySelectorAll('.lz-lab, .lz-call.on, #labels g.lb')) {
      // (One fading in counts as its leader's label; only those seen count as labels a leader must not cross.)
      if (el.hidden || el.matches('.lb-off, .lz-off, .organ')) continue;
      const b = ink(el);
      if (b) labs.push({ k: el.matches('.lz-call') ? 'lesion' : el.dataset.target || el.dataset.key, n: el.textContent.trim().slice(0, 20), o: op(el), ...b });
    }
    for (const ln of document.querySelectorAll('.lz-leaders line.leader, .lz-call-l.on, #labels path.leader:not(.scan, .ld-gone)')) {
      if (ln.style.display === 'none' || ln.classList.contains('ld-gone') || op(ln) < 0.05) continue;
      const m = ln.getScreenCTM(); if (!m) continue;
      const at = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
      const n = ln.tagName === 'line' ? ['x1', 'y1', 'x2', 'y2'].map((a) => +ln.getAttribute(a)) : ln.getAttribute('d').match(/-?[\d.]+/g).map(Number);
      const p = at(n[0], n[1]), q = at(n[n.length - 2], n[n.length - 1]);
      // (Measured against each run of letters, not the box round them all: a name, its number and its unit.)
      // (A rounded pill by its signed distance: outside > 0; how far the leader runs inside it, in quarter-pixel steps.)
      const sd = (c, x, y) => { const ux = Math.abs(x - (c.l + c.r) / 2) - ((c.r - c.l) / 2 - c.rr), uy = Math.abs(y - (c.t + c.b) / 2) - ((c.b - c.t) / 2 - c.rr); return Math.hypot(Math.max(ux, 0), Math.max(uy, 0)) + Math.min(Math.max(ux, uy), 0) - c.rr; };
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]), steps = Math.max(1, Math.ceil(len * 4));
      const inRound = (c) => { let n = 0; for (let i = 0; i <= steps; i++) if (sd(c, p[0] + (q[0] - p[0]) * i / steps, p[1] + (q[1] - p[1]) * i / steps) < 0) n++; return n * len / steps; };
      const gap = (b) => Math.min(...b.parts.map((c) => (c.rr ? Math.max(0, sd(c, q[0], q[1])) : Math.hypot(Math.max(c.l - q[0], 0, q[0] - c.r), Math.max(c.t - q[1], 0, q[1] - c.b)))));
      const thru = (b) => Math.max(...b.parts.map((c) => (c.rr ? inRound(c) : under(p, q, c))));
      const key = ln.matches('.lz-call-l') ? 'lesion' : ln.dataset.target || ln.dataset.k, own = labs.find((b) => b.k === key);
      const note = (k, v) => { if (!out.has(k)) out.set(k, `${k} (${v.toFixed(1)} px, at ${t} ms)`); };
      if (!own) { note(`the ${key} leader shows without its label`, 0); continue; }
      // (3 px of play: the letters' halo and side bearings, larger while the labels are drawn larger in a dive.)
      // (A pill's outline is drawn exactly where it is measured: 1 px.)
      const play = own.parts[0]?.rr ? 1 : 3 * own.sc;
      if (gap(own) > play) note(`the "${own.n}" leader stops short of its label`, gap(own));
      // (The pointer's leader runs to the middle of its solid pill, hidden under it.)
      if (key !== 'lesion' && thru(own) > play) note(`the "${own.n}" leader runs in under its label`, thru(own));
      for (const b of labs) if (b !== own && b.o >= 0.05 && thru(b) > 0.5) note(`the "${own.n}" leader crosses "${b.n}"`, thru(b));
    }
    if (t < ms) requestAnimationFrame(tick); else done([...out.values()]);
  };
  requestAnimationFrame(tick);
}), ms);

// A presenter's controls against the slide's card: 'ok', or what is wrong (null while the slide is still coming in). The controls'
// icons and count may not cover the card's words or table. A phone's are a pill fixed at the lower right (10 px in, 4 px up),
// every tap target at least 44 px, over no line of the words, no other card and no figure label; and the card's title is its
// first line (no empty row above it).
const barFit = (page) => page.evaluate(() => {
  const bar = document.querySelector('.pz-bar');
  if (bar.classList.contains('hop')) return null;
  const host = [...document.querySelectorAll('.pz-panel, .pz-text')].find((el) => !el.hidden && !el.classList.contains('pz-hide') && !el.classList.contains('pz-leave') && el.childElementCount);
  // (Still coming in: the card or one of its blocks is in its entry; a live part deep inside, such as a time-lapse's bar, does not count.)
  if (!host || [host, ...host.children].some((el) => el.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)))) return null;
  const marks = [...bar.querySelectorAll('svg, .pzb-n, .pzb-go')].map((el) => { if (!el.matches('.pzb-n')) return el.getBoundingClientRect(); const g = document.createRange(); g.selectNodeContents(el); return g.getBoundingClientRect(); }).filter((r) => r.width && r.height);   // (the count's words, not its 44 px tap box)
  // (A phone's pill is checked against each line of the words below, not their blocks: the last line ends short of it.)
  const hit = !bar.classList.contains('phone') && [...host.querySelectorAll('.pz-dtitle, .pz-h, .pz-line, .pz-caveat, .pz-eq, table, li, .pz-abb')].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height && marks.some((m) => m.left < r.right - 1 && m.right > r.left + 1 && m.top < r.bottom - 1 && m.bottom > r.top + 1);
  });
  if (hit) return `the controls cover the card's ${hit.className || hit.tagName.toLowerCase()} ("${hit.textContent.trim().slice(0, 40)}")`;
  const b = bar.getBoundingClientRect();
  if (bar.classList.contains('phone')) {
    // (Inside the teaching card at its lower right, 13 px in from its corner: 21 px from the screen's edge on a phone, 13 from
    // the card's on an upright iPad, where it also sits 29 px up, 8 px inside the card raised above the progress line;
    // styles/app.css .pz.stack .pz-bar and .pz.stack.tab .pz-bar. A phone taller than 600 px carries the credit's 20 px row at the
    // card's foot, so its pill stands 41 px up: b1d5216, .pz-cred.)
    const tab = !!document.querySelector('.pz.stack.tab'), cred = !tab && !!document.querySelector('.pz-shade.stack .pz-cred')?.offsetWidth;
    const inR = tab ? innerWidth * 0.15 + 13 : 21, inB = tab ? 29 : cred ? 41 : 21;
    if (Math.abs(innerWidth - b.right - inR) > 1.5) return `the pill is ${Math.round(innerWidth - b.right)} px from the right edge, not ${Math.round(inR)}`;
    if (Math.abs(innerHeight - b.bottom - inB) > 1.5) return `the pill is ${Math.round(innerHeight - b.bottom)} px from the bottom, not ${inB}`;
    const small = [...bar.querySelectorAll('button')].find((c) => { const r = c.getBoundingClientRect(); return r.width < 44 || r.height < 44; });
    if (small) return `a control (${small.getAttribute('aria-label')}) is under 44 px`;
    const h = host.getBoundingClientRect();
    if (host.matches('.pz-panel') && b.top < h.bottom + 4) return 'the pill is not below the full card';
    // (Every line of the words, and every box among them: none under the pill.)
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.textContent.trim()) continue;
      const g = document.createRange(); g.selectNodeContents(t);
      if ([...g.getClientRects()].some((q) => q.width > 1 && q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top)) return `the pill covers the words "${t.textContent.trim().slice(0, 40)}"`;
    }
    const box = [...host.querySelectorAll('button, svg, canvas, .pzl-bar')].find((el) => { const q = el.getBoundingClientRect(); return q.width > 1 && q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top; });
    if (box) return `the pill covers the card's ${(box.className?.baseVal ?? box.className) || box.tagName.toLowerCase()}`;
    for (const el of document.querySelectorAll('.pz-data, .pz-panel')) {
      const st = getComputedStyle(el), q = el.getBoundingClientRect();
      if (el.hidden || el.classList.contains('pz-hide') || st.display === 'none' || +st.opacity < 0.05 || !q.width) continue;
      if (q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top) return `the pill overlaps ${el.className.split(' ')[0]}`;
    }
    for (const g of document.querySelectorAll('#labels .lb:not(.lb-off)')) {
      let o = 1;
      for (let el = g; el && el !== document.body; el = el.parentElement) { const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') o = 0; o *= +st.opacity; }
      if (o < 0.05) continue;
      const t = [...g.querySelectorAll('text, .lb-bg')].find((t) => { const q = t.getBoundingClientRect(); return q.width > 1 && q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top; });
      if (t) return `the pill covers the label ${g.dataset.key} ("${g.textContent.trim().slice(0, 30)}")`;
    }
    const first = [...host.querySelectorAll(':scope > *, :scope > .pz-ph > *')].find((el) => el.getBoundingClientRect().height && !el.matches('.pz-ph, .pz-site, .pz-tabname'));   // (the site tag, a small kicker over the title since 505b732, belongs to it; the deck's tab sits in the card's corner, out of the flow)
    const pad = parseFloat(getComputedStyle(host).paddingTop) + parseFloat(getComputedStyle(host).borderTopWidth);
    if (first && !first.matches('.pz-h, .pz-dtitle, h1')) return `the card starts with ${first.className || first.tagName.toLowerCase()}, not its title`;
    const lead = first?.previousElementSibling?.matches('.pz-site') ? first.previousElementSibling : first;   // (a site tag over the title starts the card)
    if (lead && lead.getBoundingClientRect().top - h.top > pad + 2) return `the card's title starts ${Math.round(lead.getBoundingClientRect().top - h.top - pad)} px below its top`;
  }
  // (A phone's words sit on a glass pane rising from the bottom: the title keeps at least the pane's side gap (14 px) below its top
  // edge, also once a chart under the words has arrived and grown them.)
  const shade = document.querySelector('.pz-shade.stack'), title = host.matches('.pz-text') && host.querySelector('.pz-h, .pz-dtitle');
  if (shade && title && +getComputedStyle(shade).opacity > 0.5) {
    const gap = title.getBoundingClientRect().top - shade.getBoundingClientRect().top;
    if (gap < 14) return gap < -1 ? null : `the title sits ${Math.round(gap)} px below the glass pane's top edge (at least 14)`;   // (above it: the pane still growing)
  }
  return 'ok';
});
// A phone's data card hugs its contents: at most 12 px of empty card above the first part or below the last. null when it fits,
// else what is wrong. (The fit may shrink the header and tiles to make a tall card fit, down to its 12 px lettering floor: that is
// by design, so the card's zoom is not a failure here.)
const cardGap = (page) => page.evaluate(() => {
  const d = document.querySelector('.pz-data:not(.pz-hide):not([hidden])');
  if (!d || !d.offsetHeight) return null;
  const b = d.getBoundingClientRect(), parts = [...d.children].filter((c) => { const s = getComputedStyle(c), r = c.getBoundingClientRect(); return s.display !== 'none' && s.position !== 'absolute' && r.height > 0.5; });
  // (An open sheet's handle, .pz-lip, sits over the card's foot by design: it counts as contents.)
  const lip = d.nextElementSibling;
  if (lip?.matches('.pz-lip:not([hidden])') && getComputedStyle(lip).display !== 'none') { const r = lip.getBoundingClientRect(); if (r.height > 0.5 && r.top >= b.top && r.bottom <= b.bottom + 1) parts.push(lip); }
  if (!parts.length) return null;
  const top = Math.min(...parts.map((c) => c.getBoundingClientRect().top)) - b.top - d.clientTop;
  const bottom = b.bottom - d.clientTop - Math.max(...parts.map((c) => c.getBoundingClientRect().bottom));
  if (top > 12 || bottom > 12) return `the data card has ${Math.round(top)} px empty above and ${Math.round(bottom)} px below its contents (cap 12)`;
  return null;
});

// The sinusoid view's names that still show over a card (a slide's words, data or summary panel, an open card): none may.
// Polled for up to 3 s, so a name still easing out as a card arrives is not counted. null when clear, else what is wrong.
const svCovered = async (page) => {
  let r = null;
  for (let t = 0; t < 12; t++) {
    r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.stage-blocker:not([hidden])')].map((c) => [c, c.getBoundingClientRect()]).filter(([c, q]) => q.width && getComputedStyle(c).visibility !== 'hidden' && +getComputedStyle(c).opacity > 0.5);
      const bad = [];
      for (const e of document.querySelectorAll('.sv.on .sv-region')) {
        const k = e.firstElementChild, b = e.getBoundingClientRect();
        if (e.hidden || !k || !b.width || +getComputedStyle(k).opacity < 0.05 || e.hasAttribute('data-covered')) continue;   // (covered: faded out by the GPU, label-captions.js)
        for (const [c, q] of cards) if (b.left < q.right - 1 && q.left < b.right - 1 && b.top < q.bottom - 1 && q.top < b.bottom - 1) bad.push(`"${e.textContent.replace(/\s+/g, ' ').trim().slice(0, 24)}" under ${c.className.split(' ')[0]}`);
      }
      return bad.length ? 'sinusoid names over a card: ' + bad.join(', ') : null;
    });
    if (!r) return null;
    await page.waitForTimeout(250);
  }
  return r;
};

// Every deck's id (the presenter's library, [id, title, short name]), for the per-deck checks below.
const CHART_SLIDES = new Map();   // (chart-type check name -> its slides, for weighing the shares)
const STRIP_SLIDES = new Map();   // (check name -> its weight in slides, for weighing the shares)
const DECK_IDS = [...readFileSync(new URL('../../src/ui/decks.js', import.meta.url), 'utf8').matchAll(/\['([a-z0-9-]+)', '(?:[^'\\]|\\.)*'(?:, '(?:[^'\\]|\\.)*')?\]/g)].map((m) => m[1]);
if (DECK_IDS.length < 15) throw new Error(`only ${DECK_IDS.length} deck ids read from decks.js`);
// Waits for the slide to settle (up to 10 s) and returns the last reading.
const barSettle = async (page) => {
  let r = null;
  // (A case card waits for a tap before its slide goes on (59a379e), so it is tapped away as a person would.)
  for (let t = 0; t < 40 && r !== 'ok'; t++) { await page.evaluate(() => document.querySelector('.pz-case.on')?.click()); r = await barFit(page); if (r !== 'ok') await page.waitForTimeout(250); }
  return r;
};

// The checks themselves live in smoke-NN.mjs beside this file (PR-20), in the order they always ran; each is handed the runner and the helpers it uses.
const SHARED = { CHART_SLIDES, CHART_TEXT_SIZES, DECK_IDS, DEVICES, LADDER_SIZES, PHONES, STRIP_SLIDES, TEXT_MAX, TEXT_MIN, TYPE_SCALE_SIZES, barFit, barSettle, browser, cardGap, chartTypeSlides, check, checkChartText, checkCharts, checkLadderBrackets, checkPhoneFit, checkStrip, checkStripGaps, checkStripSlides, checkTypeScale, dir, fastContext, fitIssues, gotoSlide, instantMotionOn, leaderFrames, open, pickView, quiet, readFileSync, readdirSync, server, shot, stationRoom, stripSlides, svCovered, tapTool, turnCircuit };
const GROUPS = await Promise.all(['./smoke-01.mjs', './smoke-02.mjs', './smoke-03.mjs', './smoke-04.mjs', './smoke-05.mjs', './smoke-06.mjs', './smoke-07.mjs', './smoke-08.mjs', './smoke-09.mjs'].map((f) => import(f)));
for (const device of Object.keys(DEVICES).filter((d) => !process.env.SMOKE_DEVICE || d === process.env.SMOKE_DEVICE)) {
  for (const g of GROUPS) await g.default({ ...SHARED, device });
}
// The endoscopic field is drawn once per state and then left as it is: the model's varix swells with every heartbeat,
// and following each swell redrew the shaded field many times a second, which held a browser without a GPU's page for
// minutes on every scope slide (15 Oct: the browser checks ran past their time limit). Over 8 s of a steady patient
// with the heartbeat running, it is drawn again at most twice.
check('desktop', 'endoscopy: a steady patient\'s field is not redrawn with every heartbeat', async (page) => {
  // (Ten years, slide 9: small varices after the bands, whose beat-by-beat swell crossed the field's steps.)
  await open(page, '?script=ten-years&slide=9');
  const field = '.pz-data .pz-inst canvas';
  await page.waitForFunction((sel) => { window.pps.presenter.skipLapse?.(); return !window.pps.presenter.busy() && !document.querySelector('.pz-cover') && +(document.querySelector(sel)?.dataset.renders || 0) > 0; }, field, { timeout: 90000, polling: 200 });
  await page.waitForFunction(() => window.pps.store.get().frame.pulsing && !window.pps.presenter.probe()?.playing, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const n0 = await page.$eval(field, (c) => +c.dataset.renders);
  await page.waitForTimeout(8000);
  const n1 = await page.$eval(field, (c) => +c.dataset.renders);
  if (!(await page.evaluate(() => window.pps.store.get().frame.pulsing))) throw new Error('the heartbeat stopped');
  if (n1 - n0 > 2) throw new Error(`the field was drawn ${n1 - n0} times in 8 s of a steady patient`);
});
// Without a GPU (the browser draws WebGL on the CPU, as on the CI runners) a frame of the vessels held the page 0.4 to 3 s,
// and drawn back to back they left it about one frame a second: a 100 ms timer ran 13 times in 6 s instead of 60, and a
// slide's timed steps ran 10 to 20 times late ("the slide never arrived"). The stage now yields as long again after each
// such frame (src/ui/sw-yield.js; never on a GPU): the page keeps at least half its time and the vessels still move.
for (const device of Object.keys(DEVICES).filter((d) => !process.env.SMOKE_DEVICE || d === process.env.SMOKE_DEVICE)) check(device, 'a software renderer leaves the page its time while the figure moves (timers, frames, the vessels still drawn)', async (page) => {
  await open(page);
  const renderer = await page.evaluate(() => document.querySelector('[data-renderer]')?.dataset.renderer);
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => new Promise((res) => {
    const d0 = window.pps.perf.totals.drawn.stage || 0;
    let ticks = 0, frames = 0; const t0 = performance.now();
    const tick = () => { ticks++; if (performance.now() - t0 < 6000) setTimeout(tick, 100); else res({ ticks, frames, drawn: (window.pps.perf.totals.drawn.stage || 0) - d0, running: window.pps.store.get().running }); };
    setTimeout(tick, 100);
    const fr = () => { frames++; if (performance.now() - t0 < 6000) requestAnimationFrame(fr); }; requestAnimationFrame(fr);
  }));
  if (!r.running) throw new Error('the model is not running, so nothing on the figure moves');
  const at = `${renderer} renderer: a 100 ms timer ran ${r.ticks} times in 6 s, ${r.frames} frames, ${r.drawn} vessel frames`;
  if (r.ticks < 25) throw new Error(`${at} (at least 25: the page is starved)`);
  if (r.frames < 30) throw new Error(`${at} (at least 30 frames)`);
  if (r.drawn < 3) throw new Error(`${at} (the vessels stopped moving)`);
});
// The yield is only for the model's own motion: a pan or a pinch moves the rest of the figure in the frame it happens, so
// the vessels are drawn in that frame too. (Made to wait as well, they were drawn a step behind it, which veins-gesture
// saw as blocks left undrawn: 53234e1, reverted.) At the first frame each move shows in, the transform the vessels were
// drawn in is the one a whole draw of that view takes.
for (const device of Object.keys(DEVICES).filter((d) => !process.env.SMOKE_DEVICE || d === process.env.SMOKE_DEVICE)) check(device, 'a software renderer draws a moved view in the frame it moves, never a step behind (a drag and a pinch while playing)', async (page) => {
  await open(page);
  await page.evaluate(() => { const c = window.pps.stage.cameraState(); window.pps.stage.setCamera({ k: c.k * 2.2, x: c.x - 200, y: c.y - 150 }, 1); });
  await page.waitForTimeout(3000);
  if (!(await page.evaluate(() => window.pps.store.get().running))) throw new Error('the model is not running, so its own motion is not drawn');
  const vp = page.viewportSize(), cx = vp.width / 2, cy = vp.height / 2;
  // (The first frame the move shows in: the camera has moved, and every loop of that frame has run. Then a whole draw of
  // the same view, whose transform the vessels on screen must already have.)
  const behind = async (what, move) => {
    const k0 = await page.evaluate(() => window.pps.stage.cameraKey());
    await move();
    const r = await page.evaluate((k0) => new Promise((res) => {
      const t0 = performance.now();
      const f = () => {
        if (window.pps.stage.cameraKey() === k0) { if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(null); return; }
        const shown = window.pps.stage.glMatrix();
        window.pps.stage.veinsCheck();
        res({ shown, whole: window.pps.stage.glMatrix() });
      };
      requestAnimationFrame(f);
    }), k0);
    if (!r) throw new Error(`${what}: the camera did not move`);
    if (!r.shown || !r.whole) throw new Error(`${what}: no GPU figure to check`);
    const off = Math.max(...r.shown.map((v, i) => Math.abs(v - r.whole[i])));
    if (off > 1e-3) throw new Error(`${what}: the vessels were drawn a step behind the view (their transform ${r.shown.map((v) => v.toFixed(2)).join(' ')}, the view's ${r.whole.map((v) => v.toFixed(2)).join(' ')})`);
  };
  await page.mouse.move(cx + 60, cy); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await behind(`drag, step ${i}`, () => page.mouse.move(cx + 60 - 24 * i, cy + 6 * i));
  await page.mouse.up();
  await page.waitForTimeout(600);
  if (device === 'desktop') {
    await page.mouse.move(cx, cy);
    for (let i = 1; i <= 3; i++) await behind(`pinch, step ${i}`, async () => { await page.keyboard.down('Control'); await page.mouse.wheel(0, -9); await page.keyboard.up('Control'); });
  }
});
// The checks that hide the figure's WebGL canvases (tests/e2e/fast.mjs) left nothing to hold the page back, so on a software
// renderer the lobule's and the sinusoid's frames (the zoom into the sinusoid most of all) piled up for the CPU faster than it
// drew them, and it went on drawing them for a minute or more after the page had closed: the next page in the same browser
// took 60 to 100 s to open the presenter ("Timeout 60000ms exceeded" on each sweep's second size). Each now waits for its
// last frame to finish there (src/ui/sw-yield.js; never on a GPU).
if (!process.env.SMOKE_DEVICE || process.env.SMOKE_DEVICE === 'desktop') check('desktop', 'a software renderer has nothing left to draw after a page with the lobule and the sinusoid closes', async () => {
  const opts = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  let ctx = await fastContext(browser, opts), page = await ctx.newPage();
  // (Circulation 5 and 6: into the lobule, into the sinusoid.)
  for (const i of [4, 5]) await gotoSlide(page, server.url, 'circulation', i);
  await page.waitForTimeout(3000);
  await ctx.close();
  ctx = await fastContext(browser, opts); page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${server.url}?script=circulation&slide=1`);
  await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting'), null, { timeout: 60000 });
  const ms = Date.now() - t0;
  await ctx.close();
  if (ms > 20000) throw new Error(`the next page took ${Math.round(ms / 1000)} s to open the presenter (at most 20 s): the last page's frames were still being drawn`);
});
// the slowest first, so they do not end up alone at the end (and shards share them out evenly)
const SLOW = ['responsive instrument workspace', 'pressure over time and Doppler', 'action card is a compact sheet that keeps the vessel in view', 'circuit view, selection card, lenses'];
const weight = (name) => { const i = SLOW.indexOf(name); return i < 0 ? 0 : SLOW.length - i; };
queue.sort((a, b) => weight(b[1]) - weight(a[1]));
if (process.env.SMOKE_MATCH || GPU_ORGANS) { const match = new RegExp(process.env.SMOKE_MATCH || FIGURE_CHECKS, 'i'); for (let i = queue.length - 1; i >= 0; i--) if (!match.test(queue[i][1])) queue.splice(i, 1); }
// Shards are filled by expected time, longest first, each check going to the least-loaded share.
// The times are each check's own on CI runners (tests/e2e/check-times.json, seconds, by device and name: a failing check counted
// with its retry, as it costs that much until it is fixed); refresh them with node scripts/check-times.mjs <job logs>.
// (15 Oct: shares planned from estimates ran 40+ minutes where 23 were expected, and nine hit the time limit.)
// A check not in that file falls back to the older estimates below (checks not listed count as 45 s, a deck walk as 3 min).
const MEASURED = {
  'pan and pinch: marks and labels stay locked to the figure': 150000,
  'Fit always re-frames the figure after a zoom, pan, flick, scroll or resize': 300000,
  'zooming out ends on the whole figure: pinch, wheel and the − button, from a fresh page': 90000,   // (about 5 minutes here, on a software renderer)
  'presenter in the liver: a slide change shows only the old and new slides\' labels, pills with their text': 90000,   // (one device pixel per pixel on a phone: about 65 s here)
  'presenter: lobule labels never touch, leaders never cross': 140000,
  'leaders reach their labels in every frame: lobule dive, glide and rise, anatomy zoom': 120000,
  'lobule stations: the Lymph label is left out only where no clear spot lies near its node, no leader over 140 px': 150000,
  'lobule: the sinusoid reading and its lesion pointer point at the middle of a sinusoid': 150000,
  'liver lobule: GPU vessels, pressure drops, caption, cards, zones': 160000,
  'corner credit never touches a card': 130000,
  'pressure over time and Doppler': 76000,
  'presenter: summary table returns after back then forward': 61000,
  'menu, palette, presenter, instruments': 55000,
  'tests card: every Ascites, HVPG and FibroScan row reaches the card\'s inner right edge': 37000,
  'sinusoid view: a rebuilt caption does not fade in again (no flashing at rest)': 36000,
  'circuit view, selection card, lenses': 38000,
  'action card is a compact sheet that keeps the vessel in view': 28000,
  'type scale: figure and slide text on the six roles at every text size': 880000,   // (a desktop CI runner took 14.6 minutes over it)
  'presenter: chart text never overlaps or crosses a line, at every size': 600000,   // (a desktop CI runner took 11.5 minutes over it)
  'presenter: every choice button on every slide fits on screen, at phones, sideways and iPad': 420000,   // (five sizes over eleven slides, about 7 minutes on a CI runner)
};
const TIMES = JSON.parse(readFileSync(new URL('./check-times.json', import.meta.url), 'utf8'));
const expectedOf = ([device, name]) => (TIMES[`${device} ${name}`] ?? 0) * 1000 || expected(name);
const expected = (name) => MEASURED[name] ?? (STRIP_SLIDES.has(name) ? STRIP_SLIDES.get(name) * 2 * 42000 : null) ?? (CHART_SLIDES.has(name) ? CHART_SLIDES.get(name) * 125000 : null) ?? (/^presenter: on every slide of /.test(name) ? 180000 : 45000);
const [shard, shards] = (process.env.SMOKE_SHARD || '1/1').split('/').map(Number);
const load = Array(shards).fill(0);
const owner = new Map();
for (const item of [...queue].sort((a, b) => expectedOf(b) - expectedOf(a))) {
  const k = load.indexOf(Math.min(...load));
  load[k] += expectedOf(item);
  owner.set(item, k);
}
if (process.env.SMOKE_PLAN) { console.log(`${queue.length} checks; expected minutes per share: ${load.map((v) => Math.round(v / 6000) / 10).join(' ')}`); if (process.env.SMOKE_PLAN === 'list') for (const [item, k] of owner) console.log(`${k + 1}/${shards} ${Math.round(expectedOf(item) / 6000) / 10} ${item[1]}`);
  process.exit(0); }   // (SMOKE_PLAN=1: only print how the shares divide; =list also names the checks of each share)
for (let i = queue.length - 1; i >= 0; i--) if (owner.get(queue[i]) !== shard - 1) queue.splice(i, 1);
const WORKERS = Number(process.env.SMOKE_WORKERS) || 4;
await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) await runCheck(...queue.shift()); }));

await browser.close();
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('All smoke checks passed.');
