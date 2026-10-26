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
  if (fault === 'long') { const l = lines.find((q) => q.style.display !== 'none' && !q.classList.contains('ld-gone') && q.getAttribute('x2') != null); const [x, y] = [+l.getAttribute('x1'), +l.getAttribute('y1')]; l.setAttribute('x2', x + 150); l.setAttribute('y2', y); }
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
        if (e.hidden || !k || !b.width || +getComputedStyle(k).opacity < 0.05) continue;
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

for (const device of Object.keys(DEVICES).filter((d) => !process.env.SMOKE_DEVICE || d === process.env.SMOKE_DEVICE)) {
  await check(device, 'patient loads and the model runs', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForFunction(() => document.querySelector('#scenarioName').textContent.includes('Decompensated'));
    const t1 = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(800);
    const t2 = await page.evaluate(() => window.pps.store.get().frame.t);
    if (!(t2 > t1)) throw new Error('model clock did not advance');
    const hvpg = await page.evaluate(() => window.pps.store.get().frame.metrics.hvpg);
    if (!(hvpg > 12)) throw new Error(`HVPG ${hvpg} is not portal hypertensive`);
    await page.waitForTimeout(600);
    await shot(page, `${device}-anatomy`);
  });

  // A pan or a pinch moves every mark on the figure with it. The vessel marks (bands, the TIPS stent, clamps, clots, plugs,
  // balloons) are drawn by the GPU with the vessels, never by an SVG layer that a browser may composite a frame apart
  // from them; and after every step of a drag and of a pinch the GPU's picture, the bands and the labels' anchor dots
  // all sit where the figure's own transform puts them. At phone, iPad and desktop sizes.
  await check(device, 'pan and pinch: marks and labels stay locked to the figure', async (page) => {
    const sizes = device === 'phone' ? [[390, 844]] : [[1024, 1366], [1440, 900]];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, '?preset=cirr-decomp');
      await page.evaluate(() => { window.pps.host.send({ type: 'action', action: { kind: 'band' } }); window.pps.host.send({ type: 'action', action: { kind: 'band' } }); });
      await page.waitForFunction(() => document.querySelectorAll('.band-ring[data-gl]').length >= 2, null, { timeout: 30000 });
      await page.evaluate(() => window.pps.updateParams({ tips: { on: true, d: 8 } }));
      await page.waitForFunction(() => document.querySelectorAll('.stent-rail[data-gl]').length > 0, null, { timeout: 30000 });
      await page.waitForTimeout(900);
      const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { const f = () => (n-- ? requestAnimationFrame(f) : r()); f(); }), n);
      await frames(3);
      // Where each mark and anchor is now, and the figure's transform (world → stage px) against the GPU's.
      const state = () => page.evaluate(() => {
        const st = window.pps.stage, wr = document.querySelector('.stage-view').getBoundingClientRect();
        const [ox, oy] = st.worldToLocal(0, 0), [ax, ay] = st.worldToLocal(1, 0), [bx, by] = st.worldToLocal(0, 1);
        const M = [ax - ox, ay - oy, bx - ox, by - oy, ox, oy];
        const c = (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2 - wr.left, r.top + r.height / 2 - wr.top]; };
        const svgMarks = [...document.querySelectorAll('#overlays > g:not(.res-zz) :is(path, circle, ellipse, rect)')].filter((e) => !e.closest('[class*="cath"]') && !e.hasAttribute('data-gl') && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('class') || e.tagName);
        return { M, gl: st.glMatrix(), bands: [...document.querySelectorAll('.band-ring, .stent-mark')].map(c), dots: [...document.querySelectorAll('#labels .leader-dot:not(.scan, .ld-gone)')].map(c), svgMarks };
      });
      const fail = [];
      const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
      const apply = (A, B, p) => {   // B · A⁻¹ · p: where the figure's motion from A to B takes the stage point p
        const det = A[0] * A[3] - A[1] * A[2], x = p[0] - A[4], y = p[1] - A[5];
        const u = (A[3] * x - A[2] * y) / det, v = (-A[1] * x + A[0] * y) / det;
        return [B[0] * u + B[2] * v + B[4], B[1] * u + B[3] * v + B[5]];
      };
      const compare = (a, b, what) => {
        if (b.svgMarks.length) fail.push(`${what}: drawn by SVG, not with the vessels: ${b.svgMarks.join(', ')}`);
        if (!b.gl) fail.push(`${what}: the figure is not drawn on the GPU`);
        else if (b.gl.some((v, i) => Math.abs(v - b.M[i]) > (i > 3 ? 0.6 : 0.002 * Math.abs(b.M[0])))) fail.push(`${what}: vessels drawn at [${b.gl.map((v) => v.toFixed(2))}], figure at [${b.M.map((v) => v.toFixed(2))}]`);
        b.bands.forEach((p, i) => { const q = apply(a.M, b.M, a.bands[i]); if (!near(p, q, 0.8)) fail.push(`${what}: mark ${i} (band or stent end) at ${p.map((v) => v.toFixed(1))}, its vessel at ${q.map((v) => v.toFixed(1))}`); });
        // A label may be placed or dropped as the view changes; every anchor dot that stays must ride with the figure.
        const moved = a.dots.map((p) => apply(a.M, b.M, p));
        const kept = b.dots.filter((p) => moved.some((q) => near(p, q, 0.8))).length;
        if (Math.min(a.dots.length, b.dots.length) >= 4 && kept < Math.min(a.dots.length, b.dots.length) * 0.6) fail.push(`${what}: only ${kept} of ${b.dots.length} label anchor dots moved with the figure`);
      };
      const box = await page.locator('.stage-view').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height * 0.45;
      // A pinch in (short of the liver's dive into the lobule), then a drag.
      if (device === 'phone') {
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
        let a = await state();
        await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
        for (let i = 1; i <= 6; i++) {
          await touch('touchMove', [[cx - 40 - i * 8, cy - i * 2], [cx + 40 + i * 8, cy + i * 2]]);
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pinch step ${i}`); a = b;
        }
        await touch('touchEnd', []);
        await frames(3);
        a = await state();
        await touch('touchStart', [[cx, cy]]);
        for (let i = 1; i <= 8; i++) {
          await touch('touchMove', [[cx - i * 14, cy - i * 9]]);
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pan step ${i}`); a = b;
        }
        await touch('touchEnd', []);
      } else {
        await page.mouse.move(cx, cy);
        let a = await state();
        for (let i = 1; i <= 4; i++) {
          await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pinch step ${i}`); a = b;
        }
        await frames(3);
        a = await state();
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
          await page.mouse.move(cx - i * 14, cy - i * 9);
          await frames();
          const b = await state(); compare(a, b, `${w}x${h} pan step ${i}`); a = b;
        }
        await page.mouse.up();
      }
      if (fail.length) throw new Error(fail.slice(0, 4).join(' | '));
    }
  });

  // The first fit sets the view, the home framing and the glide's target outright; one object for the three meant the first zoom changed them
  // all, so the home look took the zoomed view for home and glided it back to the fit when a card moved (a pinch in the first seconds undone).
  if (device === 'desktop') await check(device, 'a pinch soon after the page opens stays when a card moves', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForFunction(() => window.ppsFigureReady, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const box = await page.locator('.stage-view').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
    const scale = () => page.evaluate(() => { const st = window.pps.stage, a = st.worldToLocal(0, 0), b = st.worldToLocal(1, 0); return b[0] - a[0]; });
    const rest = await scale();
    await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
    await page.waitForTimeout(800);
    const zoomed = await scale();
    if (zoomed < rest * 1.2) throw new Error(`the pinch did not stay: the figure's scale went ${rest.toFixed(3)} to ${zoomed.toFixed(3)} and was back at the fit within 0.8 s`);
    await page.evaluate(() => dispatchEvent(new Event('pps:occ')));   // (a card or sheet announcing a new place)
    await page.waitForTimeout(1500);
    const after = await scale();
    if (Math.abs(after - zoomed) > 0.005) throw new Error(`a card moving glided the pinched view back: scale ${zoomed.toFixed(3)} to ${after.toFixed(3)} (the fit is ${rest.toFixed(3)})`);
  });

  await check(device, 'sinusoid view: a rebuilt caption does not fade in again (no flashing at rest)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
    await page.waitForFunction(() => document.querySelector('.sv.on') && document.querySelectorAll('.sv-region').length > 3, null, { timeout: 45000 });
    // Once the captions' own entrance has run, no caption may start another fade, however often its text is rebuilt.
    const fading = () => page.evaluate(() => [...document.querySelectorAll('.sv-region')].flatMap((r) => r.getAnimations({ subtree: true })).filter((a) => a.animationName === 'sv-fade-in' && a.playState === 'running').length);
    for (let i = 0; i < 80 && (await fading()); i++) await page.waitForTimeout(300);
    const restarted = await page.evaluate(() => new Promise((res) => {
      let bad = 0; const regions = [...document.querySelectorAll('.sv-region')];
      const mo = new MutationObserver(() => { queueMicrotask(() => { bad += regions.flatMap((r) => r.getAnimations({ subtree: true })).filter((a) => a.animationName === 'sv-fade-in' && a.playState === 'running').length; }); });
      regions.forEach((r) => mo.observe(r, { childList: true }));
      setTimeout(() => { mo.disconnect(); res(bad); }, 4000);
    }));
    if (restarted) throw new Error(`a rebuilt sinusoid caption faded in again (${restarted}): the captions flash`);
  });

  await check(device, 'sinusoid view: the zoom pill stays at the bottom right, with its plus resting and its minus and fit stepping back out to the lobule', async (page) => {
    await open(page, '?preset=healthy');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    const pillBox = () => page.evaluate(() => { const r = document.querySelector('#zoomPill').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, vw: innerWidth, vh: innerHeight }; });
    const lob = await pillBox();
    await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('sin-focus') && document.querySelector('.sv.on'), null, { timeout: 45000 });
    const sin = await pillBox();
    const shown = await page.evaluate(() => ['#zoomIn', '#zoomOut', '#zoomFit'].map((s) => !document.querySelector(s).disabled));
    if (!(sin.w > 0)) throw new Error('the zoom pill is gone in the sinusoid view');
    if (shown.join() !== 'false,true,true') throw new Error(`in the sinusoid the plus should rest and the minus and fit stay active, got ${shown}`);
    if (!(await page.evaluate(() => ['#zoomIn', '#zoomOut', '#zoomFit'].every((q) => document.querySelector(q).offsetParent)))) throw new Error('the sinusoid view does not show all three zoom buttons (+, − and Fit)');
    if (sin.r > sin.vw || sin.b > sin.vh || sin.r < sin.vw - 40 || sin.b < sin.vh - 140) throw new Error(`the zoom pill is not at the bottom right in the sinusoid: ${JSON.stringify(sin)} (lobule: ${JSON.stringify(lob)})`);
    await page.evaluate(() => [...document.querySelectorAll('#zoomOut, #zoomFit')].find((b) => b.offsetParent && !b.disabled).click());
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('sin-focus') && window.pps.store.get().lobule && !window.pps.store.get().sinusoid, null, { timeout: 30000 });
  });

  if (device === 'desktop') await check(device, 'playing, the model frames read the stage styles from a kept copy (no live style reads each frame)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(4000);
    // Each live read of the stage's computed style made the browser bring its styles up to date mid-frame (colours, the plate's
    // theme, whether the figure shows): now read once and kept until a class, style, theme or size change.
    const n = await page.evaluate(async () => {
      const wrap = window.pps.stage.wrap || document.querySelector('.stage-view'), g = window.getComputedStyle;
      let k = 0; window.getComputedStyle = function (el, ...a) { if (el === wrap) k++; return g.call(this, el, ...a); };
      const f0 = window.pps.store.get().frame; await new Promise((r) => setTimeout(r, 3000));
      window.getComputedStyle = g;
      return { k, moved: window.pps.store.get().frame !== f0 };
    });
    if (!n.moved) throw new Error('the model did not run');
    if (n.k > 4) throw new Error(`the stage's computed style was read ${n.k} times in 3 s of playing (kept, it is read again only after a change)`);
  });

  await check(device, 'lobule: a Sinusoid tap during the dive goes on into the sinusoid, and Colored by crossfades', async (page) => {
    await open(page, '?preset=healthy');
    // Tapped while the dive is still on its way (the lobule not yet shown): it used to be dropped.
    await page.evaluate(() => { window.pps.store.set({ lobule: true }); document.querySelector('#viewSeg [data-view="sinusoid"]').click(); });
    await page.waitForFunction(() => window.pps.stage.sinusoidOpen(), null, { timeout: 60000 }).catch(() => { throw new Error('a Sinusoid tap during the dive into the lobule was ignored'); });
    await page.evaluate(() => window.pps.store.set({ sinusoid: false }));
    await page.waitForFunction(() => !window.pps.stage.sinBusy() && !window.pps.stage.sinusoidOpen() && window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    // "Colored by" fades over 300 ms in the lobule, as in the anatomy (it switched at once).
    const fade = await page.evaluate(() => { const s = window.pps.store; s.set({ colorMode: s.get().colorMode === 'flow' ? 'pressure' : 'flow' }); return window.pps.stage.lobuleLensFade(); });
    if (fade === null) throw new Error('changing Colored by in the lobule switched the colours at once instead of crossfading');
    await page.waitForFunction(() => window.pps.stage.lobuleLensFade() === null, null, { timeout: 15000 });
  });

  // The dive into the lobule and the rise out of it, a frame at a time on a held clock. The lobules around the landing one fade in and
  // out as one field and never blink: no frame differs from both the frames beside it by more than those two differ from each other.
  // And the tissue shown scaled down mid-zoom has nothing past the lobule's rim (its corners are clear): it no longer leans on a CSS
  // mask, which Safari dropped for a frame now and then, flashing a pale card of the lobules around the one being landed on.
  await check(device, 'lobule dive and rise: the lobules around the landing one never blink, and the scaled tissue is clear past its rim', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const real = performance.now.bind(performance), st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
      let T = real(), q = [], timers = [], id = 1e9;
      performance.now = () => T;
      window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
      window.setTimeout = (cb, ms = 0, ...a) => { if (typeof cb !== 'function') return st(cb, ms, ...a); timers.push([id, T + (+ms || 0), cb, a]); return id++; };
      window.clearTimeout = (i) => { if (i >= 1e9) timers = timers.filter(([j]) => j !== i); else ct(i); };
      const due = () => { for (;;) { timers.sort((a, b) => a[1] - b[1]); const t = timers[0]; if (!t || t[1] > T) return; timers.shift(); t[2](...t[3]); } };
      window.__step = (dt) => { T += dt; due(); const run = q; q = []; for (const cb of run) cb(T); due(); };
      // Every canvas of the lobule view shown scaled down whose corners are not clear (the WebGL canvases, the vessels' and the tissue's,
      // are not read: the tissue's is hidden through the dive and the rise, which show the 2D canvas's copy).
      window.__opaqueCorners = () => [...document.querySelectorAll('.lz canvas:not(.lz-gl):not(.lz-tissue-gl)')].filter((c) => {
        const cs = getComputedStyle(c);
        if (cs.visibility === 'hidden' || !c.width || !/matrix/.test(cs.transform) || new DOMMatrix(cs.transform).a > 0.999) return false;
        const x = c.getContext('2d'), px = (u, v) => x.getImageData(u, v, 1, 1).data[3];
        return px(0, 0) || px(c.width - 1, 0) || px(0, c.height - 1) || px(c.width - 1, c.height - 1);
      }).map((c) => c.className);
    });
    const shots = [], opaque = new Set();
    for (const [on, ms] of [[true, 2500], [false, 1600]]) {   // (the dive 2.2 s, the rise 1.3 s, and a little after each)
      await page.evaluate((v) => window.pps.store.set({ lobule: v }), on);
      for (let t = 0; t <= ms; t += 50) {
        await page.evaluate(() => window.__step(50));
        for (const c of await page.evaluate(() => window.__opaqueCorners())) opaque.add(c);
        shots.push((await page.screenshot({ type: 'jpeg', quality: 90, scale: 'css' })).toString('base64'));
      }
      for (let i = 0; i < 30; i++) await page.evaluate(() => window.__step(50));
      shots.push(null);   // (the dive and the rise are judged apart)
    }
    if (opaque.size) throw new Error(`mid-zoom, a scaled-down lobule canvas shows past the lobule's rim (${[...opaque].join(', ')}): it would show as a card of lobules if its mask were dropped`);
    const blinks = await page.evaluate(async (shots) => {
      const lum = async (b) => {
        if (!b) return null;
        const img = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b}`)).blob());
        const c = new OffscreenCanvas(Math.round(img.width / 4), Math.round(img.height / 4)), x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        const d = x.getImageData(0, 0, c.width, c.height).data, out = new Float32Array(d.length / 4);
        for (let i = 0; i < out.length; i++) out[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
        return out;
      };
      const L = []; for (const b of shots) L.push(await lum(b));
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
      const out = [];
      for (let i = 1; i + 1 < L.length; i++) {
        if (!L[i - 1] || !L[i] || !L[i + 1]) continue;
        const a = diff(L[i - 1], L[i]), b = diff(L[i], L[i + 1]), c = diff(L[i - 1], L[i + 1]);
        if (Math.min(a, b) > 1.5 && (a + b) / (c + 0.5) > 2.5) out.push(`frame ${i}: ${a.toFixed(1)} and ${b.toFixed(1)} from its neighbours, which differ by ${c.toFixed(1)}`);
      }
      return out;
    }, shots);
    if (blinks.length) throw new Error(`the dive or rise blinked: ${blinks.join('; ')}`);
  });

  if (device === 'desktop') await check(device, 'lobule: a Fit glide redraws its bitmap once, leaving after a close zoom gives back its large bitmaps, and a drain rasterizes the organs once', async (page) => {
    await open(page, '?preset=healthy');
    await page.evaluate(() => window.pps.store.set({ lobule: true }));
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
    const landed = await page.evaluate(() => window.pps.stage.lobuleMem(true));
    for (let i = 0; i < 5; i++) { await page.evaluate(() => document.querySelector('#zoomIn').click()); await page.waitForTimeout(700); }
    await page.waitForFunction((t) => window.pps.stage.lobuleMem(true).tiles > t, landed.tiles, { timeout: 30000 }).catch(() => {});
    const zoomed = await page.evaluate(() => window.pps.stage.lobuleMem(true));
    // A glide (here Fit, from about 2.5×) keeps the lobule's bitmap at the scale it had and redraws it once, as it lands: redrawn at each
    // √2 step on the way (up to 3600 px square, tens of ms each), the glide stuttered.
    const d0 = await page.evaluate(() => window.pps.stage.lobuleMem(true).worldDraws);
    await page.evaluate(() => document.querySelector('#zoomFit').click());
    await page.waitForTimeout(3000);
    const glideDraws = (await page.evaluate(() => window.pps.stage.lobuleMem(true).worldDraws)) - d0;
    if (glideDraws > 1) throw new Error(`the lobule's bitmap was redrawn ${glideDraws} times during one Fit glide (once, when it lands, is enough)`);
    for (let i = 0; i < 5; i++) { await page.evaluate(() => document.querySelector('#zoomIn').click()); await page.waitForTimeout(700); }
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.pps.store.set({ lobule: false }));
    await page.waitForFunction(() => window.pps.stage.lobuleSettled() && !window.pps.stage.lobuleOpen(), null, { timeout: 60000 });
    await page.waitForTimeout(1500);   // (the next dive's idle preparation redraws the world bitmap and a canvas 0.4 to 0.9 s after the lobule is left: read after it)
    const left = await page.evaluate(() => window.pps.stage.lobuleMem(true));
    const MB = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / 1e6).toFixed(1)])));
    if (left.canvases > 0 || left.tiles > Math.max(landed.tiles, 1) * 1.05 || left.world > Math.max(landed.world, 1) * 1.05) throw new Error(`after a close zoom the anatomy still holds the lobule's bitmaps: landed ${MB(landed)}, zoomed ${MB(zoomed)}, after leaving ${MB(left)} (MB)`);
    // Ascites drained: the fluid eases down over a second or two; the organs' raster waits for it to settle (it was redone at every step).
    await page.evaluate(() => window.pps.loadPreset('cirr-decomp'));
    await page.waitForFunction(() => (window.pps.store.get().frame?.slow?.ascites || 0) > 800, null, { timeout: 60000 });
    await page.evaluate(() => window.pps.store.set({ running: false }));
    await page.waitForTimeout(4000);
    const rasters0 = await page.evaluate(() => window.pps.stage.plateRasters());
    await page.evaluate(() => window.pps.host.send({ type: 'action', action: { kind: 'paracentesis', mL: 6000, albumin: true } }));
    await page.evaluate(() => window.pps.store.set({ running: true })); await page.waitForTimeout(1500); await page.evaluate(() => window.pps.store.set({ running: false }));
    await page.waitForTimeout(9000);
    // (Counted as passes over the plate, not as pictures: a pass is a picture a strip at a time, and with the organs drawn on the GPU a
    // picture per organ layer too, so 14 pictures were two passes there, and 4 to 10 on the single picture.)
    const n = (await page.evaluate(() => window.pps.stage.plateRasters())) - rasters0;
    if (n > 2) throw new Error(`draining the ascites rasterized the organ plate ${n} times while the fluid eased (once, plus the view's sharper copy, is enough)`);
  });

  await check(device, 'lobule: the flow chevrons show when Chevrons is on (and go when it is off)', async (page) => {
    await open(page, '?preset=healthy');
    await page.evaluate(() => { const s = window.pps.store; s.set({ blood: { ...s.get().blood, chevrons: true } }); window.pps.host.send({ type: 'run', running: false }); });
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    // The vessels' layer, read back after a frame; with the clock paused only the chevrons differ between on and off.
    const grab = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
      const g = document.querySelector('.lz-gl'), c = document.createElement('canvas'); c.width = g.width; c.height = g.height;
      const x = c.getContext('2d'); x.drawImage(g, 0, 0); res(Array.from(x.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 4 === 0)));
    })));
    const setChev = (on) => page.evaluate((on) => { const s = window.pps.store; s.set({ blood: { ...s.get().blood, chevrons: on } }); }, on);
    let n = 0;
    for (let zoom = 0; zoom < 3 && !n; zoom++) {   // (closer in where the sinusoids are too fine for a head at the fit)
      if (zoom) { await page.evaluate(() => window.pps.stage.zoomIn()); await page.waitForTimeout(1200); }
      await setChev(true); await page.waitForTimeout(1500);
      const on = await grab();
      await setChev(false); await page.waitForTimeout(1500);
      const off = await grab();
      n = on.reduce((k, v, i) => k + (Math.abs(v - off[i]) > 25 ? 1 : 0), 0);
    }
    if (n < 20) throw new Error(`no chevrons drawn in the lobule with Chevrons on (${n} px differ from off)`);
  });

  await check(device, 'presenter lobule: a label and its pill fade out as one when the camera moves', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.evaluate(() => { const a = document.querySelector('#app'); a.classList.add('presenting'); a.dataset.lit = 'lobule:sinusoid'; });
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-lab')].some((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent), null, { timeout: 30000 });
    // Time is stepped by hand (a software renderer would otherwise sample too few frames): at each step the pill is exactly as faded as its text.
    const rows = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('.lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent);
      const read = () => ({ pill: +getComputedStyle(lab, '::before').opacity, text: +getComputedStyle(lab.firstElementChild).opacity });
      document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* (already done) */ } });
      const start = read();
      document.querySelector('#app').dataset.lit = '';
      document.querySelector('.lz').classList.add('lz-cam');
      getComputedStyle(lab).opacity; getComputedStyle(lab, '::before').opacity;
      const anims = document.getAnimations().filter((a) => ['--pill-o', '--lab-o', '--lit-o'].includes(a.transitionProperty));
      anims.forEach((a) => a.pause());
      const out = [start];
      for (const t of [20, 60, 100, 150]) { anims.forEach((a) => { a.currentTime = t; }); out.push(read()); }
      return out;
    });
    if (rows[0].pill < 0.99 || rows[0].text < 0.99) throw new Error(`the lit label is not pilled at rest (${JSON.stringify(rows[0])})`);
    for (const r of rows) if (Math.abs(r.pill - r.text) > 0.02) throw new Error(`the pill and its text fade apart (${JSON.stringify(rows)})`);
    if (!(rows[rows.length - 1].text < 0.5)) throw new Error('the label did not fade with the camera');
  });

  await check(device, 'presenter lobule: a label and its pill fade as one when the slide changes (out and in)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.evaluate(() => { const a = document.querySelector('#app'); a.classList.add('presenting'); a.dataset.lit = 'lobule:sinusoid'; });
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-lab')].some((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent), null, { timeout: 30000 });
    // Time is stepped by hand (a software renderer would otherwise sample too few frames).
    const rows = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('.lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && !e.classList.contains('lz-off') && e.offsetParent);
      const read = () => ({ pill: +getComputedStyle(lab, '::before').opacity, text: +getComputedStyle(lab.firstElementChild).opacity });
      const done = () => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* (already done) */ } });
      const stepped = (change) => {
        done();
        const out = [read()];
        change();
        getComputedStyle(lab).opacity; getComputedStyle(lab, '::before').opacity;
        const anims = document.getAnimations().filter((a) => ['--pill-o', '--lab-o', '--lit-o'].includes(a.transitionProperty) || a.animationName === 'pill-in');
        anims.forEach((a) => a.pause());
        for (const t of [30, 90, 150, 220, 300, 400]) { anims.forEach((a) => { a.currentTime = t; }); out.push(read()); }
        return out;
      };
      const app = document.querySelector('#app');
      const away = stepped(() => { app.dataset.lit = 'lobule:central'; });   // the next slide is about something else
      const back = stepped(() => { app.dataset.lit = 'lobule:sinusoid'; });  // and the slide before it comes back
      return { away, back };
    });
    for (const [name, r] of Object.entries(rows)) for (const x of r) if (Math.abs(x.pill - x.text) > 0.02) throw new Error(`the pill and its text fade apart going ${name} (${JSON.stringify(r)})`);
    if (!(rows.away[rows.away.length - 1].text < 0.05)) throw new Error('the label did not fade away with the slide');
    if (!(rows.back[rows.back.length - 1].pill > 0.95)) throw new Error('the pill did not come back with its label');
  });

  await check(device, 'lobule and sinusoid pills: the reading is never smaller than its name or unit, all text 11 px or more, the lesion pill on screen (smallest and largest label sizes)', async (page) => {
    // Every shown pill on the lobule or the sinusoid: any text under 11 px, or a part set larger than the pill's reading (its <b>).
    const pills0 = (where) => page.evaluate((where) => {
      const bad = [], W = innerWidth, H = innerHeight;
      const shown = (e) => { const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || !e.getBoundingClientRect().width) return false; for (let p = e; p && p.nodeType === 1; p = p.parentElement) if (+getComputedStyle(p).opacity < 0.05) return false; return true; };
      let n = 0;
      for (const p of document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')) {
        if (p.hidden || p.classList.contains('lz-off') || !shown(p)) continue;
        const parts = [], w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode());) if (t.textContent.trim() && shown(t.parentElement)) parts.push([t.parentElement, t.textContent.trim(), parseFloat(getComputedStyle(t.parentElement).fontSize)]);
        if (!parts.length) continue; n++;
        const say = parts.map(([, t, f]) => `${t} ${f.toFixed(1)}`).join(' | ');
        if (parts.some(([, , f]) => f < 10.95)) bad.push(`${where}: text under 11 px in "${say}"`);
        const v = parts.find(([e]) => e.tagName === 'B');
        if (v && parts.some(([e, , f]) => e !== v[0] && f > v[2] + 0.1)) bad.push(`${where}: a part larger than the reading in "${say}"`);
      }
      const c = document.querySelector('.lz-call.on');
      if (c && shown(c)) { const r = c.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) bad.push(`${where}: lesion pill off screen (${Math.round(r.left)}..${Math.round(r.right)} of ${W})`); }
      return n ? bad : null;
    }, where);
    // (Polled: a slide's pills fade in after its camera settles.)
    const pills = async (where) => { for (let i = 0; i < 40; i++) { const r = await pills0(where); if (r) return r; await page.waitForTimeout(250); } return [`${where}: no pill shown`]; };
    const bad = [];
    for (const k of [String(TEXT_MIN), String(TEXT_MAX)]) {
      await open(page, '?preset=cirr-decomp');
      await page.evaluate((k) => { localStorage.setItem('pps.labelScale', k); localStorage.setItem('pps.labelScaleV', '2'); }, k);
      await open(page, '?preset=cirr-decomp');
      // Explore: the lobule, then the sinusoid (at the smallest size; the largest only for the lesion pill below).
      if (k === String(TEXT_MIN)) {
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
      await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 45000 });
      await page.waitForTimeout(1200);
      bad.push(...await pills(`explore lobule, size ${k}`));
      await page.evaluate(() => window.pps.store.set({ sinusoid: true }));
      await page.waitForFunction(() => document.querySelector('.sv.on') && document.querySelectorAll('.sv-region').length > 3, null, { timeout: 45000 });
      await page.waitForTimeout(1500);
      bad.push(...await pills(`explore sinusoid, size ${k}`));
      await page.evaluate(() => window.pps.store.set({ sinusoid: false }));
      }
      // Presenter: the HVPG deck's presinusoidal slide (its lesion pill), then the lobule deck's sinusoid slide.
      for (const [deck, i, sin] of [['hvpg', 5, false], ...(k === String(TEXT_MIN) ? [['lobule', 3, true]] : [])]) {
        await page.evaluate(([deck, i]) => window.pps.presenter.start(deck, i), [deck, i]);
        // (Each stage waits on its own: the start's cover alone can take 15 s here, and a CI runner's shared GPU is far slower.)
        for (const ready of [() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'),
          () => !document.querySelector('#app').className.includes('pz-hush'),
          (sin) => sin || (window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled()),
          (sin) => (sin ? !!document.querySelector('.sv.on') : !!document.querySelector('.lz-call.on'))]) await page.waitForFunction(ready, sin, { timeout: 60000 });
        await page.waitForFunction((sin) => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover') && !document.querySelector('#app').className.includes('pz-hush')
          && (sin ? !!document.querySelector('.sv.on') : window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled() && !!document.querySelector('.lz-call.on')), sin, { timeout: 60000 });
        await page.waitForTimeout(1500);
        bad.push(...await pills(`presenter ${deck} slide ${i + 1}, size ${k}`));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'), null, { timeout: 30000 });
      }
    }
    if (bad.length) throw new Error(bad.join('; '));
  });

  await check(device, 'presenter in the liver: a slide change shows only the old and new slides\' labels, pills with their text', async (page) => {
    // The portal circulation deck (after its outline), one patient: the whole lobule, the portal tract, the sinusoid wall, the central vein.
    // (Labels fade, not pixels: drawn at one device pixel per pixel, since a software renderer draws the lobule at a phone's three-fold
    // scale about nine times slower, a frame every few seconds, and the slide changes then took longer than the check waits.)
    if (device === 'phone') await (await page.context().newCDPSession(page)).send('Emulation.setDeviceMetricsOverride', { ...DEVICES.phone.viewport, deviceScaleFactor: 1, mobile: true });
    await open(page, '?preset=healthy');
    await page.evaluate(() => window.pps.presenter.start('circulation', 4));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled() && !document.querySelector('.pz-cover'), null, { timeout: 60000 });   // (the start's cover gone)
    const settle = async () => {
      await page.waitForFunction(() => { const a = document.querySelector('#app'); return !a.classList.contains('pz-hush') && !a.classList.contains('pz-hush-in') && (window.pps.stage.lobuleOpen() || window.pps.store.get().sinusoid); }, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
    };
    await settle();
    // Every frame (and between frames): each label's text and pill, and each leader, as seen (times every ancestor's opacity).
    const watch = () => page.evaluate(() => {
      const app = document.querySelector('#app'), seen = window.__labSeen = [], t0 = performance.now();
      // (Each label's own text-to-pill ratio at rest: some captions are drawn a little lighter than their pill.)
      const ids = window.__labIds ||= new WeakMap();
      const id = (e) => { if (!ids.has(e)) ids.set(e, ids.size || Math.random()); return ids.get(e); };
      window.__labRatio = () => Object.fromEntries([...document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')]
        .filter((l) => !l.hidden && l.firstElementChild && +getComputedStyle(l, '::before').opacity > 0.5)
        .map((l) => [id(l), +getComputedStyle(l.firstElementChild).opacity / +getComputedStyle(l, '::before').opacity]));
      window.__labBefore = window.__labRatio();
      // (A pass reads each ancestor's style once, however many labels share it: the labels of a slide share most of theirs, and
      // sampling every frame and every 30 ms with a style read per label per ancestor slowed the page being watched.)
      let own = new Map();
      const anc = (e) => { let o = 1; for (let x = e; x && x !== app; x = x.parentElement) { let v = own.get(x); if (v === undefined) { const cs = getComputedStyle(x); v = cs.visibility === 'hidden' || cs.display === 'none' ? 0 : +cs.opacity; own.set(x, v); } if (!v) return 0; o *= v; } return o; };
      const sample = () => {
        own = new Map();
        const lit = app.dataset.lit || '';
        for (const lab of document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')) {
          if (lab.hidden || !lab.firstElementChild) continue;
          const a = anc(lab), text = a * +getComputedStyle(lab.firstElementChild).opacity, pill = a * +getComputedStyle(lab, '::before').opacity;
          if (text > 0.01 || pill > 0.01) seen.push({ kind: 'label', id: id(lab), t: lab.dataset.target || '', text, pill, lit, ms: Math.round(performance.now() - t0) });
        }
        for (const ld of document.querySelectorAll(':is(.lz-leaders, .sv-leaders) [data-target]')) {
          const o = anc(ld);
          if (o > 0.01) seen.push({ kind: 'leader', t: ld.dataset.target, text: o, lit });
        }
      };
      const tick = () => { sample(); if (window.__labSeen === seen) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const iv = setInterval(() => (window.__labSeen === seen ? sample() : clearInterval(iv)), 30);
    });
    const step = async (what) => {
      const before = await page.evaluate(() => document.querySelector('#app').dataset.lit || '');
      await watch();
      const n = await page.evaluate(() => document.querySelector('.pzb-n, .pz-count')?.textContent);
      await page.keyboard.press('ArrowRight');
      // (The counter moves in the same task that starts the slide change, so from here on the change is under way.)
      await page.waitForFunction((n) => document.querySelector('.pzb-n, .pz-count')?.textContent !== n, n);
      await settle();
      const { seen, after, ratio } = await page.evaluate(() => { const seen = window.__labSeen; window.__labSeen = null; return { seen, after: document.querySelector('#app').dataset.lit || '', ratio: { ...window.__labBefore, ...window.__labRatio() } }; });
      if (!before || !after) throw new Error(`${what}: a slide lights nothing in the liver (before "${before}", after "${after}"), so this check cannot tell`);
      const ok = new Set([...before.split(' '), ...after.split(' ')]);
      const stray = seen.filter((x) => !ok.has(x.t));
      if (stray.length) {
        const worst = stray.reduce((m, x) => (x.text > m.text ? x : m));
        throw new Error(`${what}: ${new Set(stray.map((x) => x.t || '(no target)')).size} label(s) from neither slide showed, up to ${worst.text.toFixed(2)} (${worst.kind} ${worst.t || '(no target)'}, lit "${worst.lit}")`);
      }
      const apart = seen.filter((x) => x.kind === 'label' && (x.lit.split(' ').includes(x.t) || x.pill > 0.01) && Math.abs(x.pill * (ratio[x.id] ?? 1) - x.text) > 0.03);
      if (apart.length) throw new Error(`${what}: a pill and its text faded apart (${apart[0].t}: pill ${apart[0].pill.toFixed(2)}, text ${apart[0].text.toFixed(2)}, ${apart[0].ms} ms in)`);
      const shownNow = await page.waitForFunction(() => [...document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')].some((l) => (document.querySelector('#app').dataset.lit || '').split(' ').includes(l.dataset.target) && !l.hidden && +getComputedStyle(l.firstElementChild).opacity > 0.7), null, { timeout: 15000 }).then(() => true, () => false);
      if (!shownNow) throw new Error(`${what}: the new slide's labels did not come back (${await page.evaluate(() => { const a = document.querySelector('#app'); return `${a.className.match(/pz-hush\S*/g)} sin ${window.pps.store.get().sinusoid} sv ${document.querySelector('.sv')?.className} lz ${document.querySelector('.lz')?.className}: ` + [...document.querySelectorAll(':is(.lz, .sv) :is(.lz-lab, .lz-zone, .sv-region)')].filter((l) => (a.dataset.lit || '').split(' ').includes(l.dataset.target)).map((l) => { const c = getComputedStyle(l.firstElementChild); return `${l.dataset.target}${l.hidden ? ' hidden' : ''} ${(+c.opacity).toFixed(2)} lab ${c.getPropertyValue('--lab-o')} lit ${c.getPropertyValue('--lit-o')} in ${c.getPropertyValue('--sv-in')} anims ${document.getAnimations().filter((x) => x.effect?.target === l || x.effect?.target === l.firstElementChild).map((x) => `${x.animationName || x.transitionProperty}:${x.playState}:${Math.round(x.currentTime)}`).join('/')}`; }).join(', '); })})`);
    };
    await step('lobule to the portal tract');
    await step('portal tract to the sinusoid');
    await step('sinusoid to the central vein');
  });

  await check(device, 'leaving the lobule frames the next view, not the dive', async (page) => {
    await open(page, '?preset=cirr-decomp');
    const T = () => page.evaluate(() => (document.querySelector('#world').getAttribute('transform') || '').replace(/-?\d+\.\d+/g, (n) => (+n).toFixed(1)));
    // A software renderer draws a frame a second or two apart: wait until the transform holds for a while.
    const steady = async () => { let a = await T(), same = 0; for (let i = 0; i < 80 && same < 5; i++) { await page.waitForTimeout(300); const c = await T(); same = c === a ? same + 1 : 0; a = c; } return a; };
    // The opening framing is set before the vitals dock reaches its full height (its caption line
    // arrives later); the anatomy's own framing is what Fit gives once the page has settled.
    await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const home = await steady();
    await pickView(page, 'lobule');
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await pickView(page, 'circuit');
    const inCircuit = await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const f1 = await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const f2 = await steady();
    if (inCircuit !== f1 && inCircuit !== f2) throw new Error(`circuit opened at ${inCircuit}, not at a fit framing (${f1} / ${f2})`);
    await pickView(page, 'anatomic');
    const back = await steady();
    if (back !== home) throw new Error(`the anatomy came back at ${back}, not at its framing ${home}`);
  });

  // Zooming out never leaves the figure small: the first pinch out after the page opens (on a large Mac window a refit glide
  // used to be cut off as the figure appeared, stay 'gliding' for good and stop the spring back, so the figure stayed small and
  // off to one side), a mouse wheel, and the − button all end on the whole figure, the same framing Fit gives.
  if (device === 'desktop') await check(device, 'zooming out ends on the whole figure: pinch, wheel and the − button, from a fresh page', async (page) => {
    await page.setViewportSize({ width: 1908, height: 1175 });
    await open(page);
    const key = () => page.evaluate(() => window.pps.stage.cameraKey());
    const steady = async () => { let a = await key(), same = 0; for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await key(); same = c === a ? same + 1 : 0; a = c; } return a; };
    await page.waitForFunction(() => window.ppsFigureReady, null, { timeout: 45000 });
    const restore = await instantMotionOn(page);
    await steady();
    const out = (n, ctrl) => page.evaluate(([n, ctrl]) => new Promise((done) => {
      const x = innerWidth / 2, y = innerHeight / 2, el = document.elementFromPoint(x, y);
      let i = 0; const tick = () => { el.dispatchEvent(new WheelEvent('wheel', { deltaY: ctrl ? 6 : 100, ctrlKey: ctrl, clientX: x, clientY: y, bubbles: true, cancelable: true })); if (++i < n) setTimeout(tick, 16); else done(); };
      tick();
    }), [n, ctrl]);
    // (the first thing done on the page: a pinch out, no Fit before it)
    await out(60, true);
    const pinched = await steady();
    await page.click('#zoomFit');
    const whole = await steady();
    if (pinched !== whole) throw new Error(`a pinch out on a fresh page stayed at ${pinched}, not the whole figure ${whole}`);
    await page.mouse.move(954, 587);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 200);
    let k = await steady();
    if (k !== whole) throw new Error(`a mouse wheel out stayed at ${k}, not the whole figure ${whole}`);
    for (let i = 0; i < 4; i++) await page.click('#zoomOut');
    k = await steady();
    if (k !== whole) throw new Error(`the − button stayed at ${k}, not the whole figure ${whole}`);
    await restore();
  });

  // Fit always brings the figure back to its framing, whatever the hand did just before it: a Mac trackpad's scroll still coming in
  // (its momentum runs on for a second after the fingers lift, and used to cancel the lobule's Fit and carry the anatomy off it again),
  // a mouse flick still gliding, a pinch or the − button past the framing, or a resize. In the anatomy, the circuit and the lobule.
  if (device === 'desktop') await check(device, 'Fit always re-frames the figure after a zoom, pan, flick, scroll or resize', async (page) => {
    await open(page, '?preset=cirr-decomp');
    const key = () => page.evaluate(() => (window.pps.store.get().lobule ? 'lobule ' + window.pps.stage.lobuleViewKey() : window.pps.stage.cameraKey()));
    // (a software renderer can take a second a frame: settled means the camera holds over several readings)
    const steady = async () => { let a = await key(), same = 0; for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await key(); same = c === a ? same + 1 : 0; a = c; } return a; };
    const fitKey = async () => { await page.click('#zoomFit'); return steady(); };
    // A trackpad scroll (or, with ctrl, a pinch) at the middle of the figure: one event every 16 ms for `ms`, Fit pressed `fitAt` ms in.
    // (It stops early if the page stalls between two events for longer than a real scroll ever pauses: that would be a new scroll.)
    const scrollThenFit = (dx, dy, ms, fitAt, ctrl = false) => page.evaluate(([dx, dy, ms, fitAt, ctrl]) => new Promise((done) => {
      const x = innerWidth * 0.55, y = innerHeight * 0.5, el = document.elementFromPoint(x, y), t0 = performance.now();
      let last = t0, pressed = false;
      const tick = () => {
        const now = performance.now();
        if (now - last > 200) { if (!pressed) document.querySelector('#zoomFit').click(); done(); return; }
        last = now;
        el.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, deltaMode: 0, ctrlKey: ctrl, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        if (!pressed && now - t0 >= fitAt) { pressed = true; document.querySelector('#zoomFit').click(); }
        if (now - t0 < ms) setTimeout(tick, 16); else done();
      };
      tick();
    }), [dx, dy, ms, fitAt, ctrl]);
    // A quick mouse drag let go while still moving (a flick), then Fit at once.
    const flickThenFit = () => page.evaluate(() => {
      const x = innerWidth * 0.55, y = innerHeight * 0.5, el = document.elementFromPoint(x, y);
      const ev = (type, i) => el.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x + i * 40, clientY: y + i * 12, bubbles: true, cancelable: true }));
      const until = (t) => { while (performance.now() < t) { /* the moves come 12 ms apart */ } };
      ev('pointerdown', 0);
      for (let i = 1; i <= 6; i++) { until(performance.now() + 12); ev('pointermove', i); }
      ev('pointerup', 6);
      document.querySelector('#zoomFit').click();
    });
    const expect = async (what, ref) => { const k = await steady(); if (process.env.SMOKE_FIT_LOG) console.log(what, k); if (k !== ref) throw new Error(`${what}: Fit left the view at ${k}, not at its framing ${ref}`); };
    // (zoomed in for certain before the next step: on a slow renderer a reading taken before the zoom's glide began looked settled)
    const zoomIn = async (n = 2) => { const k0 = await key(); for (let i = 0; i < n; i++) await page.click('#zoomIn'); for (let i = 0; i < 100 && (await key()) === k0; i++) await page.waitForTimeout(100); await steady(); };
    // (the figure's WebGL canvases are not shown: a software renderer then draws several frames a second instead of one)
    const restore = await instantMotionOn(page);
    await steady();
    for (const view of ['anatomic', 'circuit', 'lobule']) {
      await pickView(page, view);
      if (view === 'lobule') await page.waitForFunction(() => window.pps.stage.lobuleSettled() && window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
      await steady();
      const ref = await fitKey();
      await zoomIn(); await scrollThenFit(14, 10, 1400, 250); await expect(`${view}, zoomed in, a trackpad scroll still running`, ref);
      if (view !== 'circuit') { await zoomIn(); await scrollThenFit(0, 20, 700, 350, true); await expect(`${view}, a pinch out still running`, ref); }
      if (view !== 'lobule') { await zoomIn(); await flickThenFit(); await expect(`${view}, zoomed in, a flick still gliding`, ref); }
      if (view !== 'anatomic') continue;
      await scrollThenFit(14, 10, 1400, 250); await expect(`${view}, at its framing, a trackpad scroll still running`, ref);
      for (let i = 0; i < 3; i++) await page.click('#zoomOut');
      await page.click('#zoomFit'); await page.click('#zoomFit'); await expect(`${view}, after the − button and Fit twice`, ref);
      await zoomIn(1); await page.setViewportSize({ width: 1100, height: 720 }); await steady();
      const small = await fitKey(); await page.click('#zoomIn'); await page.click('#zoomFit');
      await expect(`${view}, after a resize`, small);
      await page.setViewportSize(DEVICES.desktop.viewport);
    }
    await restore();
  });

  // The corner credit holds its spot while it stays good (review, 15 Oct): on Circuit 7 a station's live number changing width
  // beside it had it hop between two spots every few seconds. And on a lobule slide it keeps off the lobule (it had sat on the
  // hepatocytes: its art test looked at the anatomy hidden under the lobule).
  if (device === 'phone') await check(device, 'The credit holds its spot while numbers tick, and keeps off the lobule', async (page) => {
    // (on an upright iPad: an iPhone carries the credit in the teaching card's foot, so the figure's credit is a tablet's and a laptop's)
    const restore = await instantMotionOn(page);
    const shown = () => page.waitForFunction(() => { const c = document.querySelector('.stage-credit'); return c.matches('.placed:not(.moving), .covered') && !document.querySelector('#app.pz-moving'); }, null, { timeout: 60000 });
    await gotoSlide(page, server.url, 'circuit', 6);   // (reached at the phone's size, then turned into an iPad: a slide reached at 3x iPad size outran the wait)
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.waitForTimeout(1000); await quiet(page); await shown();
    await page.evaluate(() => { const c = document.querySelector('.stage-credit'); window.__moves = []; let last = ''; const tick = () => { const k = (c.matches('.moving, .covered') ? 'hidden ' : '') + c.style.getPropertyValue('--cx') + ',' + c.style.getPropertyValue('--cy'); if (k !== last) { if (last) window.__moves.push(k); last = k; } window.__mt = requestAnimationFrame(tick); }; tick(); });
    await page.waitForTimeout(12000);
    const moves = await page.evaluate(() => { cancelAnimationFrame(window.__mt); return window.__moves; });
    if (moves.length) { await page.setViewportSize({ width: 390, height: 844 }); await restore(); throw new Error(`Circuit 7: the credit moved ${moves.length} times in 12 s with nothing but the numbers changing (${moves.slice(0, 4).join(' | ')})`); }
    await gotoSlide(page, server.url, 'lobule', 1);
    await page.waitForFunction(() => window.pps.stage.lobuleSettled() && window.pps.stage.lobuleRing(), null, { timeout: 60000 });
    await quiet(page); await shown();
    const on = await page.evaluate(() => {
      if (document.querySelector('.stage-credit.covered')) return null;   // (hidden: nowhere bare)
      const ring = window.pps.stage.lobuleRing(), r = document.querySelector('.stage-credit').getBoundingClientRect();
      const inside = ([x, y]) => { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o; } return o; };
      const pts = []; for (let u = 0; u <= 1; u += 0.25) for (const v of [0, 0.5, 1]) pts.push([r.left + u * r.width, r.top + v * r.height]);
      return pts.some(inside) ? `${Math.round(r.left)},${Math.round(r.top)}` : null;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await restore();
    if (on) throw new Error(`Lobule 2: the credit sits on the lobule at ${on}`);
  });

  // The credit at 12 px (15 Oct). An iPhone carries it as one line at the teaching card's foot, whole and clear of the words, the key
  // and the pill (on the figure it had been scaled to about 9 px and, on Treatment 2, sat across a vessel). A tablet keeps it on the
  // figure, only on bare figure (or hidden where nothing is bare).
  if (device === 'phone') await check(device, 'The credit is 12 px: in the iPhone card foot, on bare figure on an iPad (Treatment 2)', async (page) => {
    const restore = await instantMotionOn(page);
    await gotoSlide(page, server.url, 'treatment', 1);
    await quiet(page);
    const phone = await page.evaluate(() => {
      const out = [], c = document.querySelector('.pz-shade .pz-cred'), st = document.querySelector('.stage-credit');
      if (getComputedStyle(st).display !== 'none') out.push('the figure credit still shows on an iPhone slide');
      if (!c || !c.offsetWidth) return [...out, 'no credit at the card foot'];
      const cs = getComputedStyle(c), r = c.getBoundingClientRect(), sh = document.querySelector('.pz-shade').getBoundingClientRect();
      if (parseFloat(cs.fontSize) < 12) out.push(`text ${cs.fontSize}`);
      if (c.scrollWidth > c.clientWidth + 1 || r.left < sh.left || r.right > sh.right || r.bottom > sh.bottom) out.push('cut off or outside the card');
      for (const s of ['.pz-text', '.pz-bar', '.pz-fk:not([hidden])']) for (const e of document.querySelectorAll(s)) {
        const q = e.getBoundingClientRect(), w = Math.min(q.right, r.left + c.scrollWidth) - Math.max(q.left, r.left), h = Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top);
        if (q.width && w > 0 && h > 0) out.push(`overlaps ${s}`);
      }
      return out;
    });
    if (phone.length) { await restore(); throw new Error(`Treatment 2 on an iPhone: ${phone.join('; ')}`); }
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.waitForTimeout(1500); await quiet(page);
    await page.waitForFunction(() => document.querySelector('.stage-credit').matches('.placed:not(.moving), .covered'), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const pad = await page.evaluate(() => {
      const cr = document.querySelector('.stage-credit'), cs = getComputedStyle(cr), out = [];
      const px = parseFloat(cs.fontSize) * (cs.scale === 'none' ? 1 : parseFloat(cs.scale));
      if (px < 12) out.push(`text ${px.toFixed(1)} px`);
      if (cr.classList.contains('covered')) return out;   // (hidden where nothing is bare: allowed)
      // (the figure's vessels and organs under its drawn box, sampled every 3 px; the GPU figure's vessels are their hit strokes)
      const b = cr.getBoundingClientRect(), on = new Set();
      for (let x = b.left; x <= b.right; x += 3) for (let y = b.top; y <= b.bottom; y += 3) for (const e of document.elementsFromPoint(x, y)) if (e.matches('.v-hit, .v-lumen, .v-strand, g.organ *, #labels .lb *')) on.add(e.matches('#labels .lb *') ? 'a label' : e.matches('g.organ *') ? 'an organ' : 'a vessel');
      if (on.size) out.push(`sits on ${[...on].join(' and ')} at ${b.left | 0},${b.top | 0}`);
      return out;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await restore();
    if (pad.length) throw new Error(`Treatment 2 on an upright iPad: the credit ${pad.join('; ')}`);
  });

  // Turning an iPad mid-slide (review #52): the data card never shows over the words' card on the way, and turned upright it
  // leaves the stacked place under the words (it had stayed there for good, hidden behind them, when its fade-out ran slow).
  if (device === 'phone') await check(device, 'Turning an iPad mid-slide keeps the data card off the words', async (page) => {
    // (reached with motion instant, as the layout checks do, and an iPad held sideways; the turns then run with the page's own fades and glides)
    const restore = await instantMotionOn(page);
    await gotoSlide(page, server.url, 'hvpg', 5);
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.waitForTimeout(1000); await quiet(page);
    await restore();
    await page.evaluate(() => {
      window.__ov = [];
      const vis = (el) => el && !el.hidden && +getComputedStyle(el).opacity > 0.05 && el.getBoundingClientRect().width > 0;
      const tick = () => {
        const t = document.querySelector('.pz-text'), d = document.querySelector('.pz-data');
        if (vis(t) && vis(d)) { const a = t.getBoundingClientRect(), b = d.getBoundingClientRect(); const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left), oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ow > 4 && oh > 4) window.__ov.push(`${Math.round(ow)}x${Math.round(oh)} at ${innerWidth}x${innerHeight}`); }
        window.__ovT = requestAnimationFrame(tick);
      };
      tick();
    });
    for (const [w, h] of [[1024, 1366], [1366, 1024], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(3000); await quiet(page);
    }
    const r = await page.evaluate(() => { cancelAnimationFrame(window.__ovT); const d = document.querySelector('.pz-data'); return { ov: window.__ov, col: d.classList.contains('col'), top: Math.round(d.getBoundingClientRect().top) }; });
    if (r.ov.length) throw new Error(`the data card covered the words' card while turning (${r.ov.slice(0, 3).join(', ')})`);
    if (r.col) throw new Error(`turned upright, the data card stayed stacked under the words (top ${r.top})`);
  });

  // Turning the device while paused re-frames the figure for the new shape, with the Tests sheet open (review #19): the
  // refit used to run only on the model's frames, and a turned phone or iPad kept the old framing (the figure off screen
  // behind the sheet, or under the top bar). Judged against Fit's own framing for the new shape.
  if (device === 'phone') await check(device, 'A turn while paused re-frames the figure for the new shape', async (page) => {
    await open(page);
    const key = () => page.evaluate(() => window.pps.stage.cameraKey());
    const steady = async () => { let a = await key(), same = 0; for (let i = 0; i < 80 && same < 4; i++) { await page.waitForTimeout(300); const c = await key(); same = c === a ? same + 1 : 0; a = c; } return a; };
    await page.waitForFunction(() => window.ppsFigureReady, null, { timeout: 45000 });
    await tapTool(page, '#tabInstruments');
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => !window.pps.store.get().running);
    await steady();
    for (const [w, h] of [[844, 390], [390, 844], [1366, 1024], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: h });
      const got = await steady();
      await page.evaluate(() => window.pps.stage.refit());
      const want = await steady();
      if (got !== want) throw new Error(`turned to ${w}x${h} while paused, the camera stayed at ${got}, not the new shape's framing ${want}`);
    }
  });

  // Every way into or out of the lobule is one continuous zoom (to the lobule's normal framing; the sinusoid and a station are a second zoom from there): the camera's magnification (the plate's zoom plus the dive's)
  // moves steadily from the first frame to the last, in one direction, with no stop at an intermediate framing (the liver, the fit).
  // The presenter's slides are walked with the arrow keys, from the slide before a crossing to the one after it, and back.
  const CROSSINGS = [   // [deck, slide to start on (0-based), key, whether the key goes into the lobule, whether it is the sinusoid view that is gone to or left]
    ['circulation', 3, 'ArrowRight', true], ['circulation', 4, 'ArrowLeft', false], ['circulation', 5, 'ArrowRight', false],   // ladder → lobule and back; the sinusoid wall → the next view
    ['lobule', 0, 'ArrowRight', true],   // the outline's fit → the whole lobule
    ['ncph', 1, 'ArrowRight', true], ['ncph', 4, 'ArrowRight', true], ['ncph', 5, 'ArrowRight', false, false, true],   // a fit, then a liver close-up, before it (the last one leaves the lobule for the summary table)
    ['sites', 7, 'ArrowLeft', true],   // backwards into it
    ['ascites', 0, 'ArrowRight', true, true], ['ascites', 4, 'ArrowRight', true, true],   // anatomy straight to the sinusoid view, through the lobule without stopping in it
    ['ascites', 5, 'ArrowRight', false, true, true],   // and the sinusoid view straight back out to the anatomy (a new patient: the words, and so the space the camera frames into, are settled after the rise)
    ['hvpg', 5, 'ArrowRight', false, false, true], ['outflow', 4, 'ArrowRight', true],   // out to a region, with a new patient (schisto to chronic PVT: the words settle after the rise); in from a region
    // In Explore (the view buttons), with no slide: anatomy to the lobule, to a station in it as a slide asks for one, and straight to
    // the sinusoid view and back out.
    ['explore', 'lobule', null, true], ['explore', 'triad', null, true], ['explore', 'sinusoid', null, true, true], ['explore', 'out', null, false, true],
  ];
  for (const [deck, from, key, into, sin, newPatient] of CROSSINGS) {
    const explore = deck === 'explore';
    await check(device, `lobule zoom is continuous: ${explore ? 'Explore' : `${deck} slide ${from + 1}`} ${key === 'ArrowLeft' ? 'back ' : ''}${into ? 'into' : 'out of'} the ${sin ? 'sinusoid view' : 'lobule'}${from === 'triad' ? ', at its portal tract' : ''}`, async (page) => {
      await open(page, '?preset=healthy');
      const n = explore ? from : from + 1, way = (into ? 'into' : 'out of') + (sin ? ' the sinusoid view' : ' the lobule');
      if (!explore) {
        await page.evaluate(([d, i]) => window.pps.presenter.start(d, i), [deck, from]);
        await page.waitForFunction((n) => (document.querySelector('.pzb-n, .pz-count')?.textContent || '').trim().startsWith(n + ' /') && !document.querySelector('.pz-cover'), n, { timeout: 60000 });
      } else if (from === 'out') {
        await page.evaluate(() => window.pps.stage.diveToSinusoid());
        await page.waitForFunction(() => window.pps.stage.sinusoidOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
      }
      const viewKey = () => page.evaluate(() => `${window.pps.stage.lobuleOpen()}|${window.pps.stage.lobuleSettled()}|${window.pps.stage.cameraKey()}|${document.querySelector('.pz-load.on') ? 'load' : ''}`);
      const quiet = async (open, from) => {   // the figure holds still (a software renderer draws a frame a second or two apart)
        // (After a key, first the move has to begin: the old slide's words leave before it, which on a loaded software
        // renderer can hold the view as it was for longer than the stillness looked for below.)
        if (from) for (let t0 = Date.now(); (await viewKey()) === from && Date.now() - t0 < 60000;) await page.waitForTimeout(400);
        // (A case card holds the slide's own zoom until it is tapped away, as a person does (3c79c6f): tapped once it shows, and the
        // slide waited for as gotoSlide does.)
        if (from && !explore) await page.waitForFunction(() => { document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy(); }, null, { timeout: 120000, polling: 100 });
        let last = '', same = 0;
        for (let i = 0; i < 120 && same < 6; i++) {
          await page.waitForTimeout(400);
          const k = await viewKey();
          same = k === last ? same + 1 : 0; last = k;
        }
        if (open !== undefined && (await page.evaluate(() => window.pps.stage.lobuleOpen())) !== open) throw new Error(`${deck} slide ${n}: the lobule is ${open ? 'not open' : 'still open'} once the view settled`);
      };
      await quiet();
      if (sin && !into && !(await page.evaluate(() => window.pps.store.get().sinusoid))) throw new Error(`${deck} slide ${n}: expected to start in the sinusoid view`);
      if ((await page.evaluate(() => window.pps.stage.lobuleOpen())) === into) throw new Error(`${deck} slide ${n}: expected to start ${into ? 'outside' : 'inside'} the lobule`);
      await page.evaluate(() => {
        const rec = window.__zoomTrace = { go: true, s: [] };
        const tick = () => { if (!rec.go) return; const z = window.pps.stage.cameraZoom(); if (z !== null) rec.s.push([performance.now(), z]); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await page.evaluate(() => window.pps.stage.cameraMoves(true));
      const before = await viewKey();
      if (explore) {
        // (A station is aimed at as the presenter aims at a slide's, before the dive.)
        await page.evaluate((m) => { if (m === 'triad') window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); if (m === 'sinusoid') window.pps.stage.diveToSinusoid(); else if (m === 'out') window.pps.stage.exitSinusoid(); else window.pps.store.set({ lobule: true }); }, from);
      } else {
        const label = await page.evaluate(() => document.querySelector('.pzb-n, .pz-count')?.textContent.trim());
        await page.keyboard.press(key);
        await page.waitForFunction((l) => (document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '') !== l, label);
      }
      await quiet(into, before);
      const s = await page.evaluate(() => { window.__zoomTrace.go = false; return window.__zoomTrace.s; });
      // One move: the dive (or rise) itself, with no glide of the camera before or after it beyond a small settling (a new patient changes the space the words leave, after the rise has begun).
      const moves = await page.evaluate(() => window.pps.stage.cameraMoves());
      const big = moves.filter((m) => m.kind === 'glide' && (m.zoom > 0.2 || m.pan > 100));
      // The sinusoid view and a station in the lobule are gone to in two steps (the lobule's normal framing first, then the target; out, the same in reverse), so a glide beside the dive or rise is expected there.
      const twoStep = sin || big.length > 0;
      if (big.length && !newPatient && !twoStep) throw new Error(`${deck} slide ${n} ${way}: the camera also glided ${big.map((m) => `${m.zoom.toFixed(2)} in zoom, ${Math.round(m.pan)} across`).join('; ')} (${moves.map((m) => m.kind + (m.zoom !== undefined ? ` ${m.zoom.toFixed(2)}/${Math.round(m.pan)}@${Math.round(m.t - moves[0].t)}` : '')).join(', ')})`);
      if (moves.some((m) => m.kind === 'chain-in' || m.kind === 'chain-out')) throw new Error(`${deck} slide ${n} ${way}: a zoom straight through the lobule, without stopping at its normal framing (${moves.map((m) => m.kind).join(', ')})`);
      if (sin && into && !(await page.evaluate(() => window.pps.store.get().sinusoid && window.pps.stage.sinusoidOpen()))) throw new Error(`${deck} slide ${n}: the sinusoid view is not open at the end`);
      if (moves.filter((m) => m.kind === 'dive' || m.kind === 'rise').length !== 1) throw new Error(`${deck} slide ${n} ${way}: ${moves.filter((m) => m.kind === 'dive' || m.kind === 'rise').length} dives or rises, not one`);
      // The zoom's own span: from its first move to its last (the words fade before it starts and the labels after it ends).
      if (process.env.ZOOM_TRACE) console.log(`${deck} ${n} ${key}`, s.map(([t, z]) => `${Math.round(t - s[0][0])}:${z.toFixed(3)}`).join(' '));
      const z0 = s[0]?.[1], zEnd = s[s.length - 1]?.[1];
      // (A loaded software renderer may draw too few frames to follow the zoom: the check of the moves above is then the one that counts.)
      if (twoStep || s.length < 10 || Math.abs(zEnd - z0) < 0.3) return;
      const dir = Math.sign(zEnd - z0), eps = 0.02;   // (a step under 2% of the scale over 150 ms or more is a stop)
      let a = 0, b = s.length - 1;
      while (a < b && Math.abs(s[a + 1][1] - s[0][1]) < 0.02 * Math.abs(zEnd - z0)) a++;
      // (The last few percent may settle slowly, as the framing takes the slide's words into account; a stop before that is a stop.)
      while (b > a && Math.abs(s[b - 1][1] - zEnd) < 0.05 * Math.abs(zEnd - z0)) b--;
      for (let i = a + 1; i <= b; i++) {
        const dz = (s[i][1] - s[i - 1][1]) * dir, dt = s[i][0] - s[i - 1][0];
        if (dz < -0.004) throw new Error(`${deck} slide ${n} ${way}: the zoom turned back (${(-dz).toFixed(3)} log units at ${Math.round(s[i][0] - s[a][0])} ms)`);
        if (dz < eps && dt > 150) throw new Error(`${deck} slide ${n} ${way}: the zoom stopped part way for ${Math.round(dt)} ms, at ${Math.round(100 * (s[i][1] - z0) / (zEnd - z0))}% of its way`);
      }
    });
  }

  await check(device, 'circuit turns upright and back', async (page) => {
    await open(page, '?preset=csph');
    // (Out of the circuit it is folded away in the zoom pill, no size and hidden, as it folds and opens (61f5c59), not taken out of the layout.)
    if (await page.$eval('#rotateCircuit', (b) => { const s = getComputedStyle(b); return s.display !== 'none' && s.visibility !== 'hidden' && b.getBoundingClientRect().width > 0; })) throw new Error('turn button shows in the anatomy');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    // Animations step with the frames: wait for where they end, not a fixed time (CI has no GPU).
    const ratio = () => { const s = document.querySelector('#stage'); return s.viewBox.baseVal.height / s.viewBox.baseVal.width; };
    const until = (fn, msg) => page.waitForFunction(fn, null, { timeout: 30000 }).catch((e) => { throw new Error(msg, { cause: e }); });
    // A phone held upright opens the circuit upright; turn it wide first.
    if (device === 'phone') { await until(`(${ratio})() > 1`, 'circuit did not open upright on a phone'); await turnCircuit(page); }
    await until(`(${ratio})() < 1`, 'circuit did not open wide');
    await turnCircuit(page);
    await until(`(${ratio})() > 1`, 'circuit did not turn tall');
    // Zoomed in, turning back keeps the zoom.
    // The zoom glides: read it once it holds still (a software renderer draws a frame a second or two apart).
    const steady = () => page.evaluate(() => new Promise((res) => { let a = window.pps.stage.zoomLevel(); const t = setInterval(() => { const b = window.pps.stage.zoomLevel(); if (Math.abs(b - a) < 1e-4) { clearInterval(t); res(b); } a = b; }, 700); }));
    const k0 = await steady();
    await page.evaluate(() => { window.pps.stage.zoomIn(); window.pps.stage.zoomIn(); });
    await page.waitForFunction((k0) => window.pps.stage.zoomLevel() > k0 * 1.5, k0, { timeout: 60000 });
    const kIn = await steady();
    await turnCircuit(page);
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
    let kAfter = await steady();
    for (let i = 0; i < 8 && Math.abs(kAfter - kIn) / kIn > 0.05; i++) kAfter = await steady();   // a loaded runner can read mid-glide; a real reset stays reset
    if (Math.abs(kAfter - kIn) / kIn > 0.05) throw new Error(`turning reset the zoom (${kIn.toFixed(2)} → ${kAfter.toFixed(2)})`);
    await page.evaluate(() => window.pps.stage.fit()); await turnCircuit(page);
    await until(`(${ratio})() > 1`, 'circuit did not turn tall again');
    if ((await page.$eval('#rotateCircuit', (b) => b.getAttribute('aria-pressed'))) !== 'true') throw new Error('turn button is not pressed');
    await shot(page, `${device}-circuit-upright`);
    // A vessel can still be picked, and the flow marks keep running, in the turned map.
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.evaluate(() => { window.pps.store.set({ selection: null }); document.querySelector('#rotateCircuit').click(); });
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
  });
  // Scope's Wall mechanics tab (15 Oct): every tile's name on one line and never cut, values and units inside their tiles, the values
  // of each row of tiles on one line, the name and value of the stress tile apart, and every tile inside the card (no scrolling) at
  // Half and Full on phones down to an iPhone SE with Safari's toolbar, and at desktop and upright and sideways iPad sizes,
  // with long and extreme readings.
  await check(device, 'Wall mechanics tiles fit at every card size', async (page) => {
    const sizes = device === 'phone' ? [[390, 844], [375, 667], [390, 664], [430, 932], [320, 568], [320, 480]] : [[1440, 900], [820, 1180], [1180, 820]];   // (320 wide: the compact Half card)
    const fit = () => page.evaluate(() => {
      const v = document.querySelector('.wall-view'), pane = v.closest('.dock-pane'), pr = pane.getBoundingClientRect(), bad = [];
      const tiles = [...v.querySelectorAll('.endo-read > div')].filter((d) => d.offsetWidth);
      if (tiles.length !== 5) bad.push(`${tiles.length} tiles shown`);
      for (const d of tiles) {
        const dt = d.querySelector('dt'), q = d.getBoundingClientRect(), name = dt.textContent;
        if (dt.scrollWidth > dt.clientWidth + 1) bad.push(`name cut: ${name}`);
        if (dt.getBoundingClientRect().height > parseFloat(getComputedStyle(dt).lineHeight) * 1.5) bad.push(`name wraps: ${name}`);
        for (const c of d.querySelectorAll('dd, .wall-big')) {
          if (!c.offsetWidth) continue;
          const r = c.getBoundingClientRect();
          if (c.scrollWidth > c.clientWidth + 1 || r.right > q.right - 2 || r.bottom > q.bottom) bad.push(`value cut: ${name}`);
        }
        if (q.bottom > pr.bottom + 1) bad.push(`tile below the card: ${name}`);
      }
      if (pane.scrollHeight > pane.clientHeight + 4) bad.push(`card scrolls ${pane.scrollHeight - pane.clientHeight}px`);
      const st = v.querySelector('.endo-stress'), g = document.createRange();
      g.selectNodeContents(st.querySelector('dt'));
      const sv = st.querySelector('.wall-big').getBoundingClientRect(), sn = g.getBoundingClientRect();
      if (sn.bottom > sv.top + 1 && sn.right > sv.left - 4) bad.push('stress name meets its value');
      const nums = tiles.filter((d) => d.classList.contains('endo-tile')).map((d) => d.querySelector('.endo-num > span').getBoundingClientRect());
      const rows = [];
      for (const n of nums) { const r = rows.find((x) => Math.abs(x[0].top - n.top) < 30); if (r) r.push(n); else rows.push([n]); }
      for (const r of rows) { const b = r.map((n) => n.bottom); if (Math.max(...b) - Math.min(...b) > 0.5) bad.push(`values not level: ${b.map((x) => x.toFixed(1)).join('/')}`); }
      // The picture's names, measured by their ink as drawn: T clear of the wall's outline and inside the canvas, r inside the
      // varix and clear of its dashes, lumen and muscle inside their rings and lumen clear of the w label and the arrows.
      const cv = v.querySelector('.endo-stage canvas'), gaps = cv?.offsetWidth ? cv.wallGaps : null;
      if (gaps) {
        if (!gaps.T || !gaps.w) bad.push('T or w missing from the picture');
        const least = { T: { ring: 2, top: 1 }, r: { fill: 1, dash: 2 }, lumen: { edge: 1, w: 2, arrows: 2 }, muscle: { outer: 1, band: 1 } };
        for (const [k, lim] of Object.entries(least)) for (const [q, m] of Object.entries(lim)) if (gaps[k] && !(gaps[k][q] >= m - 0.01)) bad.push(`picture: ${k} ${q} ${gaps[k][q]?.toFixed(2)} px (needs ${m})`);
      }
      return bad;
    });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await open(page, '?preset=budd-chiari');
      await page.evaluate(() => window.pps.dock.show('varixwall', { reveal: true }));
      await page.waitForTimeout(900);
      for (const extreme of [false, true]) {
        if (extreme) {
          await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
          await page.waitForTimeout(300);
          await page.evaluate(() => { const v = document.querySelector('.wall-view'); ['188.8', '12.5', '10.4', '9999'].forEach((t, i) => { v.querySelectorAll('.endo-num > span')[i].textContent = t; }); v.querySelector('.wall-big > span').textContent = '1999'; });
        }
        for (const s of device === 'phone' ? ['half', 'full'] : ['card']) {
          if (s !== 'card') { await page.evaluate((half) => { const d = document.getElementById('dock'); for (let i = 0; i < 3 && d.classList.contains('sheet-half') !== half; i++) d.querySelector('.sheet-grab').click(); }, s === 'half'); await page.waitForTimeout(700); }
          const bad = await fit();
          if (bad.length) throw new Error(`${width}x${height} ${s}${extreme ? ' (extreme readings)' : ''}: ${bad.join('; ')}`);
        }
      }
    }
  });

  if (device === 'phone') await check(device, 'action card is a compact sheet that keeps the vessel in view', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(800);
    const read = () => page.evaluate(() => {
      const c = document.querySelector('.action-card'), r = c.getBoundingClientRect(), sv = document.querySelector('#stageView').getBoundingClientRect(), sc = c.querySelector('.ac-scroll');
      const link = c.querySelector('.ac-foot.in-head .link');
      // The figure fills the screen; the sheet rises from the bottom edge, over the vitals dock.
      // (Over the thumb dock it sits 8 px above the tab row instead, with the play bar stepped aside: a571c9c, 15 Oct.)
      const nb = document.querySelector('#app.thumb #thumbBar')?.getBoundingClientRect();
      return { covers: nb ? Math.abs(nb.top - r.bottom - 8) <= 1 : r.bottom <= sv.bottom && r.bottom >= sv.bottom - 40 && r.top < document.querySelector('#vdock').getBoundingClientRect().top, peek: c.classList.contains('peek'), docked: c.classList.contains('docked'), top: r.top - sv.top, h: r.height, stageH: sv.height, scrolls: sc.scrollHeight - sc.clientHeight, links: !!link && link.getBoundingClientRect().height > 0, foot: getComputedStyle(c.querySelector('.ac-foot.at-foot')).display !== 'none' };
    });
    const swipe = async (dy) => {
      const box = await (await page.$('.ac-top')).boundingBox();
      await page.mouse.move(box.x + 100, box.y + 14); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 14 + dy, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(400);
    };
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.waitForTimeout(900);
    let s = await read();
    for (let i = 0; i < 20 && !s.covers; i++) { await page.waitForTimeout(250); s = await read(); }   // the sheet's rise can lag on a slow runner
    if (!s.docked || s.peek) throw new Error('the card should open as a docked sheet, not as the strip');
    if (s.h > s.stageH * 0.36) throw new Error(`the sheet covers ${Math.round((100 * s.h) / s.stageH)} % of the figure`);
    if (!s.covers) throw new Error('the sheet should rise from the bottom of the screen, over the vitals dock');
    if (s.scrolls > 2) throw new Error(`the portal vein card scrolls by ${s.scrolls} px: everything should show at once`);
    if (!s.links || s.foot) throw new Error('Why? and Details should be in the header, with no row of their own at the foot');
    const anchorY = await page.evaluate(() => { const a = window.pps.stage.anchorFor({ type: 'edge', id: 'PV_TRUNK' }); return a && a.y; });
    if (anchorY == null || anchorY > s.top) throw new Error(`the vessel (y ${Math.round(anchorY)}) is under the sheet (top ${Math.round(s.top)})`);
    const zoom = await page.$eval('#zoomPill', (el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { bottom: r.bottom, visible: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 };
    });
    const cardTop = await page.$eval('.action-card', (el) => el.getBoundingClientRect().top);
    // (An upright phone keeps Fit in the Layers tab's menu: nothing floats over the figure.)
    const thumb = await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'));
    if (thumb ? zoom.visible : !zoom.visible || zoom.bottom > cardTop) throw new Error(thumb ? 'the zoom buttons float over the figure on an upright phone' : 'zoom and Fit should remain visible above the card');
    if (await page.$('.ac-grab')) throw new Error('the compact card should have no handle or intermediate heights');
    await swipe(70);
    if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('one swipe down should close the card');
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.waitForTimeout(300);
    // (A phone card has no X: a pull closes it, as above. a571c9c)
    if (thumb) { if (await page.locator('.ac-close').isVisible()) throw new Error('the phone card still shows an X'); } else {
      await page.click('.ac-close');
      await page.waitForTimeout(300);
      if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('close should dismiss the card');
    }

  });
  await check(device, 'a vessel\'s card never covers that vessel (every vessel, each window size)', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(800);
    const sizes = device === 'phone' ? [[390, 844]] : [[1440, 900], [1024, 1366]];
    const bad = [];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.pps.stage.fit());
      await page.waitForTimeout(700);
      const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('.v-hit[data-id]')].map((e) => e.dataset.id))].filter((id) => window.pps.stage.anchorFor({ type: 'edge', id })));
      if (ids.length < 10) throw new Error(`only ${ids.length} vessels to check`);
      for (const id of ids) {
        await page.evaluate((id) => window.pps.store.set({ selection: { type: 'edge', id } }), id);
        await page.waitForTimeout(device === 'phone' ? 450 : 120);
        const r = await page.evaluate((id) => {
          const c = document.querySelector('.action-card'), a = window.pps.stage.anchorFor({ type: 'edge', id });
          if (c.hidden || !a) return null;
          const view = document.querySelector('#stageView').getBoundingClientRect(), cr = c.getBoundingClientRect();
          // Where the card is going (its left/top glide), relative to the figure.
          const x = c.classList.contains('docked') ? cr.left - view.left : parseFloat(c.style.left), y = c.classList.contains('docked') ? cr.top - view.top : parseFloat(c.style.top);
          const under = a.path.filter(([px, py]) => px > x - a.r && px < x + c.offsetWidth + a.r && py > y - a.r && py < y + c.offsetHeight + a.r).length;
          return { under, docked: c.classList.contains('docked'), mid: a.y > y - a.r && a.x > x - a.r && a.x < x + c.offsetWidth + a.r && a.y < y + c.offsetHeight + a.r };
        }, id);
        // A phone's sheet spans the width: a long vessel may run under it, but the part tapped stays in view.
        if (r && (r.docked ? r.mid : r.under)) bad.push(`${id}@${w}x${h}`);
      }
      await page.evaluate(() => window.pps.store.set({ selection: null }));
    }
    if (bad.length) throw new Error(`card over its vessel: ${bad.join(', ')}`);
  });
  await check(device, 'circuit view, selection card, lenses', async (page) => {
    await open(page, '?preset=csph');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(1200);
    await shot(page, `${device}-circuit`);
    // The liver's title opens the liver's card (there is no organ to click in the circuit).
    await page.locator('#labels .lb.zonecap.link', { hasText: 'LIVER' }).click();
    await page.waitForFunction(() => { const s = window.pps.store.get().selection; return s?.type === 'organ' && s.id === 'liver'; }, null, { timeout: 5000 })
      .catch((e) => { throw new Error('the LIVER title did not open the liver card', { cause: e }); });
    await page.waitForSelector('.action-card:not([hidden])');
    await page.evaluate(() => window.pps.store.set({ selection: null }));
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    for (const m of ['delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'pressure']) {
      await page.evaluate((m) => window.pps.store.set({ colorMode: m }), m);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await shot(page, `${device}-card`);
    // Doppler from the card opens the instrument and puts the card away
    await page.click('.action-card button:has-text("Doppler")');
    await page.waitForSelector('#pane-doppler', { state: 'visible' });
    await page.waitForFunction(() => !window.pps.store.get().selection);
    await page.locator('.action-card').waitFor({ state: 'hidden' });
  });

  // A damaged saved setting (half-written JSON, the wrong type, an unknown name) is ignored: the app still starts, the menu
  // lists the presentations and no error is thrown. (chart.js used to throw on a bad pps.chartOpen3 before anything drew.)
  if (device === 'desktop') await check(device, 'damaged saved settings do not stop the app from starting', async (page) => {
    await page.addInitScript(() => {
      const bad = { 'pps.chartOpen3': '{', 'pps.scripts': '{"id":1}', 'pps.instruments': '[', 'pps.blood2': '"x"', 'pps.theme': 'nope', 'pps.labelScale': 'big', 'pps.quality': 'x', 'pps.labels': '7' };
      try { for (const [k, v] of Object.entries(bad)) localStorage.setItem(k, v); } catch { /* no storage on this frame */ }
    });
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:hvpg"]');
    const t1 = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(600);
    if (!(await page.evaluate((t) => window.pps.store.get().frame.t > t, t1))) throw new Error('the model clock did not advance');
    if (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) throw new Error('an unknown saved theme was applied');
  });

  // The Interface zoom setting is gone: a value saved by it is dropped, and the page keeps its default size.
  if (device === 'desktop') await check(device, 'a saved interface zoom no longer applies', async (page) => {
    await page.addInitScript(() => { try { localStorage.setItem('pps.uiZoom', '1.4'); } catch { /* no storage on this frame */ } });
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:hvpg"]');
    const st = await page.evaluate(() => ({ zoom: document.documentElement.style.zoom, prop: document.documentElement.style.getPropertyValue('--ui-zoom'), saved: localStorage.getItem('pps.uiZoom') }));
    if (st.zoom || st.prop) throw new Error(`the saved interface zoom was applied: ${JSON.stringify(st)}`);
    if (st.saved !== null) throw new Error(`the saved interface zoom was kept: ${st.saved}`);
  });

  // A page left open across an update: its presentation engine's files no longer load (here the worker never answers and
  // its main-thread fallback fails). The show ends with a word, not a cover held up for ever. (The source site only: the
  // build bundles the engine under hashed names.)
  if (device === 'desktop' && dir === '.') await check(device, 'a presentation whose engine cannot load ends with a word instead of hanging', async (page) => {
    await open(page);
    await page.route(/\/worker\.js\?/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/\/worker-core\.js\?/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("gone");' }));
    await page.evaluate(() => window.pps.presenter.start('circulation', 0));
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting') && /could not be prepared/.test(document.getElementById('toasts').textContent), null, { timeout: 45000 });
  });

  // A slow first load: the engine worker's files arrive late (here 6 s), and the engine still runs in the worker, not on the
  // main thread for the whole session.
  // (worker.js?v=… on the source site, assets/worker-<hash>.js in the build)
  if (device === 'desktop') await check(device, 'a slow first load still runs the engine in its worker', async (page) => {
    await page.route(/\/worker(-\w+)?\.js(\?|$)/, async (r) => { await new Promise((res) => setTimeout(res, 6000)); await r.continue(); });
    await open(page);
    const kind = await page.evaluate(() => document.querySelector('#app').dataset.engine);
    if (kind !== 'worker') throw new Error(`the engine runs in ${kind}, not its worker`);
  });

  await check(device, 'menu, palette, presenter, instruments', async (page) => {
    // ?home=present opens the one menu: both columns side by side, or a bottom sheet on a phone.
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:hvpg"]');
    const sheet = await page.evaluate(() => document.querySelector('.umenu').classList.contains('sheet'));
    if (sheet !== (device === 'phone')) throw new Error(`the menu is ${sheet ? 'a sheet' : 'a popover'} on ${device}`);
    // Two tabs, Present first: only its list shows.
    const shown = await page.evaluate(() => [...document.querySelectorAll('.um-col')].filter((c) => c.offsetParent).map((c) => c.dataset.col).join());
    if (shown !== 'present') throw new Error(`the menu opened showing ${shown || 'nothing'}, not the Present tab`);
    await shot(page, `${device}-menu`);
    // Typing "hvpg" leaves one presentation; Enter presents it.
    await page.fill('.um-q', 'hvpg');
    const left = await page.evaluate(() => [...document.querySelectorAll('.um-col[data-col="present"] li:not([hidden]) > .um-row')].filter((r) => r.offsetParent).length);
    if (left !== 1) throw new Error(`"hvpg" left ${left} presentations`);
    // "budd" has no presentation: the note offers the matching patient in the other tab.
    await page.fill('.um-q', 'budd');
    await page.waitForSelector('.um-other:not([hidden])');
    await page.fill('.um-q', 'hvpg');
    await page.press('.um-q', 'Enter');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
    // A patient row loads that patient and marks it current.
    await page.click('#btnMenu');
    await page.click('#umtab-patients');
    await page.click('.um-row[data-k="p:schisto"]');
    await page.waitForFunction(() => window.pps.store.get().presetId === 'schisto' && !window.pps.menu.isOpen());
    await page.click('#btnMenu');
    await page.waitForSelector('.um-row[data-k="p:schisto"][aria-current="true"]', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.umenu'));
    await page.evaluate(() => window.pps.palette.open());
    await page.waitForSelector('.pal-back:not([hidden])');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.pps.dock.show('profile', { reveal: true }));
    await page.waitForTimeout(500);
    await shot(page, `${device}-instruments`);
  });

  if (device === 'desktop') await check(device, 'presenter on an upright iPad: type at landscape scale, words clear of the data card', async (page) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('circulation', 1));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const fs = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      const t = r('.pz-text'), d = r('.pz-data');
      const wide = [...document.querySelectorAll('.pz-text *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length;
      return { h: fs('.pz-h'), line: fs('.pz-line'), wide, overlap: !!(t && d && d.width && t.right > d.left && t.left < d.right && t.bottom > d.top && t.top < d.bottom) };
    });
    // (Sized by the height, an upright iPad's 1180 px set the title at 57 px in a 300 px column. Since 1f25c95 an upright iPad
    // takes the phone's layout and its 1.7x slide words (a77f314): its body is 23.3 px there, the bound 24.)
    if (m.h > 40 || m.line > 24) throw new Error(`upright iPad presenter type too large: title ${m.h}px, body ${m.line}px`);
    if (m.overlap) throw new Error('upright iPad presenter: the words overlap the data card');
    if (m.wide) throw new Error(`upright iPad presenter: ${m.wide} element(s) of the words overflow sideways`);
  });

  // Text that runs into other text, in what the selector names (each text box once, boxes of one element never compared).
  const textClash = (page, sel) => page.evaluate((sel) => {
    const root = document.querySelector(sel); if (!root || !root.getClientRects().length) return ['none shown: ' + sel];
    const tr = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), out = [];
    for (let x; (x = w.nextNode());) { if (!x.textContent.trim() || x.parentElement.closest('.sr-only, [hidden]')) continue; const g = document.createRange(); g.selectNodeContents(x); for (const q of g.getClientRects()) if (q.width) tr.push([q, x.textContent.trim().slice(0, 16), x.parentElement]); }
    for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) { const [a, ta, ea] = tr[i], [c, tc, ec] = tr[j]; if (ea !== ec && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 3) out.push(`"${ta}" runs into "${tc}"`); }
    return out;
  }, sel);
  // The Doppler data card's report is two narrow columns on an upright iPad: its 32 px direction word once ran into the readings beside it.
  if (device === 'desktop') await check(device, 'presenter on an upright iPad: the Doppler data card\'s words never run into each other', async (page) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    for (const n of [2, 10]) {   // (toward the liver; no signal)
      await open(page, `?script=doppler&slide=${n}`);
      await page.waitForFunction(() => document.querySelector('.pz-data .dop-report')?.getClientRects().length && document.querySelector('.pz-data .dop-vel b')?.textContent.trim(), null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const bad = await textClash(page, '.pz-data .dop-report');
      if (bad.length) throw new Error(`Doppler slide ${n}: ${bad.slice(0, 3).join('; ')}`);
    }
  });
  // The Doppler monitor's top strip beside a tile (TIPS Doppler's narrowed stent, Mac and iPad sizes): every word whole inside the monitor,
  // the pattern ("High velocity") never dropped or cut to an ellipsis, the type never under 0.8 of its size. (It was hidden on a
  // 1440 x 900 Mac, and printed cut at "Low velocity, je…".)
  if (device === 'desktop') await check(device, 'presenter: the Doppler strip beside a tile keeps every word whole inside the monitor', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const deck = withOverview(DECKS.find((d) => d.id === 'tips-doppler'));
    for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const id of ['narrow', 'fix']) {
        await open(page, `?script=tips-doppler&slide=${deck.slides.findIndex((s) => s.id === id) + 1}`);
        await page.waitForFunction(() => document.querySelector('.pz-data:not(.pz-hide) .dop-pattern')?.textContent.trim() && document.querySelector('.pz-data:not(.pz-hide) .dop-pattern').closest('.dop-report').style.getPropertyValue('--dop-k'), null, { timeout: 60000 });
        // (a short window folds the instrument behind Show: opened, as a presenter would)
        if (await page.evaluate(() => { const f = document.querySelector('.pz-data:not(.pz-hide) .pz-fold'); if (f?.getClientRects().length && f.getAttribute('aria-expanded') === 'false') { f.click(); return true; } return false; })) await page.waitForTimeout(1500);
        await page.waitForTimeout(800);
        const bad = await page.evaluate(() => {
          const rep = document.querySelector('.pz-data:not(.pz-hide) .dop-report'), mon = rep.closest('.dop-main').querySelector('.dop-box').getBoundingClientRect(), out = [];
          const k = +rep.style.getPropertyValue('--dop-k');
          if (k < 0.8) out.push(`type at ${k}`);
          // (the reading and the direction share the strip's first line; only the pattern may take a line of its own)
          const v = rep.querySelector('.dop-vel').getBoundingClientRect(), d = rep.querySelector('.dop-dir').getBoundingClientRect();
          if (d.top >= v.bottom - 2) out.push(`"${rep.querySelector('.dop-dir').textContent}" dropped under the reading`);
          for (const e of rep.querySelectorAll('.dop-vel, .dop-dir, .dop-pattern')) {
            if (e.hidden || !e.getClientRects().length) { out.push(`"${e.textContent}" hidden`); continue; }
            const g = document.createRange(); g.selectNodeContents(e); const q = g.getBoundingClientRect();
            if (q.right > mon.right - 3 || q.left < mon.left) out.push(`"${e.textContent}" runs ${Math.round(q.right - mon.right + 3)} px past the monitor`);
            if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') out.push(`"${e.textContent}" cut to an ellipsis`);
          }
          return out;
        });
        if (bad.length) throw new Error(`${w} x ${h}, TIPS Doppler ${id}: ${bad.join('; ')}`);
      }
    }
  });
  // A phone held sideways: Tests > Doppler on a TIPS keeps its range bar and tiles under the monitor, never over it (the monitor's
  // size-contained box gave the grid only its 100 px floor, and they were laid over its lower half), and its words inside it.
  if (device === 'phone') await check(device, 'phone sideways: Tests > Doppler shows the monitor, range bar and tiles side by side, none over another', async (page) => {
    for (const [w, h] of [[568, 320], [667, 375], [844, 390], [932, 430]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, '?preset=cirr-decomp');
      await page.evaluate(() => window.pps.updateParams({ tips: { on: true, d: 9 } }));
      await page.evaluate(() => window.pps.dock.show('doppler'));
      await page.waitForTimeout(800);
      await page.evaluate(() => { const s = document.querySelector('#pane-doppler .dop-vessel'); s.value = 'TIPS'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      for (const seg of ['Proximal', 'Mid', 'Distal']) {
        await page.evaluate((k) => [...document.querySelectorAll('#pane-doppler .dop-seg')].find((b) => b.textContent === k)?.click(), seg);
        await page.waitForFunction(() => /\d/.test(document.querySelector('#pane-doppler .dop-vel b')?.textContent || ''), null, { timeout: 30000 });
        await page.waitForTimeout(600);
        const bad = await page.evaluate(() => {
          const q = (s) => document.querySelector('#pane-doppler ' + s), cv = q('.dop-box canvas').getBoundingClientRect(), out = [];
          for (const s of ['.dop-range', '.dop-stats', '.dop-note']) { const e = q(s); if (!e || !e.getClientRects().length || getComputedStyle(e).display === 'none') continue; const r = e.getBoundingClientRect(); if (r.height && r.top < cv.bottom - 1 && r.bottom > cv.top + 1 && r.left < cv.right - 1 && r.right > cv.left + 1) out.push(`${s} over the monitor by ${Math.round(Math.min(cv.bottom - r.top, cv.right - r.left))} px`); }
          for (const s of ['.dop-vel', '.dop-dir', '.dop-pattern']) { const e = q(s); if (!e.textContent || e.hidden) continue; const g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(); if (r.width && (r.right > cv.right - 3 || r.bottom > cv.bottom)) out.push(`"${e.textContent}" outside the monitor`); if (parseFloat(getComputedStyle(e).fontSize) < 12) out.push(`"${e.textContent}" under 12 px`); }
          // (everything on screen at once: the monitor, the range bar and the tiles inside the card's visible height)
          const pane = document.querySelector('#pane-doppler').getBoundingClientRect();
          for (const s of ['.dop-box canvas', '.dop-stats']) { const r = q(s).getBoundingClientRect(); if (r.bottom > Math.min(pane.bottom, innerHeight) + 1) out.push(`${s} runs ${Math.round(r.bottom - Math.min(pane.bottom, innerHeight))} px below the card`); }
          return out;
        });
        if (bad.length) throw new Error(`${w} x ${h}, ${seg}: ${bad.join('; ')}`);
      }
    }
  });
  // A phone's top bar keeps the lens scale 40 px wide: its numbers never run into each other (0, 10, 20 and 30 once did).
  if (device === 'phone') await check(device, 'phone top bar: the lens scale numbers never run into each other', async (page) => {
    for (const width of [390, 375]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, '?preset=cirr-decomp');
      await page.waitForTimeout(800);
      const bad = await textClash(page, '.lg-scale');
      if (bad.length) throw new Error(`${width} px: ${bad.slice(0, 3).join('; ')}`);
    }
  });

  // Circulation slide 10 ("After a meal"): the coronary and splenic veins, their glow and the figure's labels sit in the band the data card
  // (top) and the words (bottom sheet) leave, and clear of the controls' pill (read from the pill itself).
  if (device === 'phone') await check(device, 'presenter on a phone: Circulation slide 10 frames the coronary and splenic veins clear of the data card, the words and the pill', async (page) => {
    const GLOW = 8;   // px of glow around a vein
    for (const [w, h] of [[390, 844], [375, 667]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.evaluate(() => window.pps.presenter.start('circulation', 9));
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
      let r = null, prev = null, still = 0;
      for (let t = 0; t < 50 && !(r?.ok && still >= 4); t++) {
        await page.waitForTimeout(300);
        r = await page.evaluate((glow) => {
          const st = window.pps.stage, svg = document.querySelector('#stage'), cam = st.cameraState(), m = svg.getScreenCTM();
          const rect = (e) => e.getBoundingClientRect(), data = document.querySelector('.pz-data'), sheet = document.querySelector('.pz-safe');
          if (!data || !sheet || data.hidden || !rect(data).height) return { ok: false, why: 'the slide is not in yet', key: '' };
          const top = rect(data).bottom, bottom = rect(sheet).top, W = innerWidth, pill = rect(document.querySelector('.pz-bar'));
          const px = (x, y) => { const p = svg.createSVGPoint(); p.x = cam.k * x + cam.x; p.y = cam.k * y + cam.y; const q = p.matrixTransform(m); return [q.x, q.y]; };
          const veins = { 'coronary vein': ['LGV_CONF', 'V_STO'], 'splenic vein': ['SV_CONF', 'V_SPL'] };
          const bad = [], boxes = [];
          for (const [name, ids] of Object.entries(veins)) {
            const b = st.focusBox({ edges: ids });
            if (!b) { bad.push(`${name} is not drawn`); continue; }
            const [x0, y0] = px(b[0], b[1]), [x1, y1] = px(b[2], b[3]);
            boxes.push([name, x0 - glow, y0 - glow, x1 + glow, y1 + glow]);
          }
          for (const l of document.querySelectorAll('.lb-blocks g.lb')) {
            const q = rect(l);
            if (q.width && q.height && +getComputedStyle(l).opacity > 0.05) boxes.push([`the "${l.textContent.trim().slice(0, 18)}" label`, q.left, q.top, q.right, q.bottom]);
          }
          for (const [name, x0, y0, x1, y1] of boxes) {
            if (y0 < top - 0.5) bad.push(`${name} reaches ${Math.round(top - y0)} px under the data card`);
            if (y1 > bottom + 0.5) bad.push(`${name} reaches ${Math.round(y1 - bottom)} px under the words`);
            if (x0 < -0.5 || x1 > W + 0.5) bad.push(`${name} runs off the side of the screen`);
            if (x0 < pill.right && x1 > pill.left && y0 < pill.bottom && y1 > pill.top) bad.push(`${name} sits under the controls' pill`);
          }
          return { ok: !bad.length, why: bad.join('; '), key: st.cameraKey() + '|' + Math.round(top) + '|' + Math.round(bottom) };
        }, GLOW);
        still = r.key && r.key === prev ? still + 1 : 0; prev = r.key;
      }
      if (!r?.ok) throw new Error(`Circulation slide 9 at ${w}x${h}: ${r?.why || 'never settled'}`);
    }
  });

  // Each slide of two decks, at each size (the desktop run also tries an upright iPad). The bar's size and the spacing of its
  // controls are the same on every slide (Next turning into Finish moved them once). A bar centred at the bottom keeps one
  // spot, and so does a phone's pill; every frame in which it shows is at that spot, never elsewhere.
  // Once each slide is in, the controls' icons and count may not cover any of the card's words or its table, and a phone's
  // pill keeps clear of them (see barFit). (A phone's bar once stayed where the slide before had it, over the summary card's table.)
  // Three decks are walked from the start (endoscopy: its data card sits at the top); one more only over its last slides, the summary card among them.
  // (One check per deck and size: in one piece it took 26 minutes on a desktop runner, longer than a share should hold.)
  for (const size of device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null]) for (const [deck, from] of [['circulation', 0], ['lobule', 0], ['endoscopy', 0], ['hvpg', -2]]) await check(device, `presenter: the controls never glide between slides, and keep their size and spacing, first and last included: ${deck}${size ? ' on an upright iPad' : ''}`, async (page) => {
    {
      if (size) await page.setViewportSize(size);
      await open(page);
      await page.evaluate(([id, at]) => window.pps.presenter.start(id, at), [deck, from]);
      if (from < 0) {   // (the deck's length is known once it runs: go to its last slides)
        await page.waitForFunction(() => /\d+ \/ \d+/.test(document.querySelector('.pzb-n')?.textContent || ''), null, { timeout: 60000 });
        const n = await page.evaluate(() => +document.querySelector('.pzb-n').textContent.split('/')[1]);
        await page.evaluate(([id, at]) => window.pps.presenter.start(id, at), [deck, n + from]);
      }
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
      const where = `${deck} at ${size ? 'upright iPad' : device}`;
      const read = () => page.evaluate(() => {
        const bar = document.querySelector('.pz-bar'), b = bar.getBoundingClientRect(), q = (el) => { const r = el.getBoundingClientRect(); return [r.left - b.left, r.top - b.top, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
        const m = new DOMMatrix(getComputedStyle(bar).transform);   // (an idle bar fades and sinks 8 px by design: its spot is where it rests, without that nudge)
        return { n: document.querySelector('.pzb-n')?.textContent.trim(), at: [b.left - m.m41, b.top - m.m42], boxes: [[0, 0, b.width, b.height], ...[...bar.children].filter((c) => !c.classList.contains('pzb-q')).map(q)] };
      });
      const fits = async (n) => { if ((await barSettle(page)) !== 'ok') throw new Error(`${where}, slide ${n}: ${await barFit(page) || 'the slide never settled'}`); };
      let ref = null, slides = 0;
      await page.waitForTimeout(1000);
      for (let guard = 0; guard < 80; guard++) {
        await fits((await read()).n);
        const cur = await read();
        if (!ref) ref = cur;
        else {
          if (cur.boxes.length !== ref.boxes.length || cur.boxes.some((b, i) => b.some((v, j) => Math.abs(v - ref.boxes[i][j]) > 1))) throw new Error(`${where}: the controls' size or spacing changed on slide ${cur.n} (${JSON.stringify(cur.boxes)} vs ${JSON.stringify(ref.boxes)})`);
          if (Math.abs(cur.at[0] - ref.at[0]) > 1 || Math.abs(cur.at[1] - ref.at[1]) > 1) throw new Error(`${where}: the bar moved on slide ${cur.n} (${cur.at} vs ${ref.at})`);
        }
        slides++;
        const [a, b] = cur.n.split('/').map((x) => +x);
        if (a === b) break;
        // Press Next while watching every frame of the bar until the next slide has settled.
        await page.evaluate(() => { const bar = document.querySelector('.pz-bar'); window.__bs = []; const f = () => { const r = bar.getBoundingClientRect(); window.__bs.push([r.left, r.top, +getComputedStyle(bar).opacity]); window.__braf = requestAnimationFrame(f); }; f(); });
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(1050);
        const seen = await page.evaluate(() => { cancelAnimationFrame(window.__braf); return window.__bs; });
        const to = seen[seen.length - 1], from = seen[0], near = (p, q) => Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1;
        const glide = seen.find((p) => p[2] > 0.05 && !near(p, from) && !near(p, to));
        if (glide) throw new Error(`${where}: the bar glided on the way to slide ${a + 1}: it showed at ${Math.round(glide[0])},${Math.round(glide[1])} between ${from.slice(0, 2).map(Math.round)} and ${to.slice(0, 2).map(Math.round)}`);
      }
      if (slides < (from < 0 ? -from : 5)) throw new Error(`${where}: only ${slides} slide(s) walked`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
    }
  });

  // Every slide of every deck on a phone (390x844 and 375x667): the controls' pill sits fixed at the lower right, over none of
  // the words, no other card and no label, and each card starts with its title (see barFit).
  // (Every deck at both sizes: CI splits the phone checks over sixteen runners so each stays well under its limit.)
  // (Slides with a live data card at the top once kept them at the slide before's spot, over the figure or the card.)
  if (device === 'phone') for (const deck of DECK_IDS) for (const size of [null, { width: 375, height: 667 }]) await check(device, `presenter: on every slide of ${deck}${size ? ' at 375x667' : ''} the controls' pill stays at the lower right, clear of the words`, async (page) => {
    if (size) await page.setViewportSize(size);
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    for (let guard = 0; guard < 80; guard++) {
      const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim());
      if ((await barSettle(page)) !== 'ok') throw new Error(`${deck}, slide ${n}: ${await barFit(page) || 'the slide never settled'}`);
      const gap = await cardGap(page);
      if (gap) throw new Error(`${deck}, slide ${n}: ${gap}`);
      const sv = await svCovered(page);
      if (sv) throw new Error(`${deck}, slide ${n}: ${sv}`);
      const dl = badDelta(await cardTiles(page));
      if (dl) throw new Error(`${deck}, slide ${n}: ${dl}`);
      // (A folding tool: Show then Hide must leave the card hugging its contents, as on arrival.)
      const fold = page.locator('.pz-data:not(.pz-hide):not([hidden]) .pz-fold');
      if (await fold.isVisible().catch(() => false)) {
        for (const want of ['true', 'false']) {
          await page.evaluate(() => document.querySelector('.pz-data:not(.pz-hide):not([hidden]) .pz-fold').click());
          await page.waitForFunction((w) => document.querySelector('.pz-data .pz-fold')?.getAttribute('aria-expanded') === w, want);
          // (The fold eases, then the card is fitted again: give it until it settles, up to 3 s.)
          let g = null;
          for (let w = 0; w < 10; w++) { await page.waitForTimeout(300); g = await cardGap(page); if (!g) break; }
          if (g && want === 'false') throw new Error(`${deck}, slide ${n}, after Show then Hide: ${g}`);
          // (Opened, no two stacked sections of the card touch: the readout, a bar, the lab tiles and the card's own tiles keep a gap.)
          const tight = want === 'true' && await page.evaluate(() => {
            const card = document.querySelector('.pz-data:not(.pz-hide):not([hidden])');
            const shown = (e) => { const st = getComputedStyle(e), r = e.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && !/absolute|fixed/.test(st.position) && !e.matches('.pz-grip') && r.height > 1 && r.width > 1; };
            for (const box of [card, ...card.querySelectorAll('.pz-tool .ab-read, .pz-tool .pz-inst, .pz-tool .dop-main, .pz-tool .hv-main')]) {
              const kids = [...box.children].filter(shown).map((e) => [e, e.getBoundingClientRect()]);
              for (const [a, ra] of kids) for (const [b, rb] of kids) {
                if (a === b || rb.top < ra.bottom - 1 || ra.right <= rb.left || rb.right <= ra.left) continue;
                if (kids.some(([c, rc]) => c !== a && c !== b && rc.top >= ra.bottom - 1 && rc.bottom <= rb.top + 1)) continue;   // (not neighbours)
                if (rb.top - ra.bottom < 4) return `${a.className.split(' ')[0]} sits ${Math.round(rb.top - ra.bottom)} px from ${b.className.split(' ')[0]}`;
              }
            }
            return null;
          });
          if (tight) throw new Error(`${deck}, slide ${n}, opened card: ${tight}`);
        }
      }
      const [a, b] = n.split('/').map((x) => +x);
      if (a === b) break;
      // (On a time-lapse, Next first runs it to its end: press again until the slide changes.)
      for (let k = 0; k < 4; k++) {
        await page.keyboard.press('ArrowRight');
        if (await page.waitForFunction((was) => document.querySelector('.pzb-n')?.textContent.trim() !== was, n, { timeout: 15000 }).then(() => true, () => false)) break;
      }
      await page.waitForTimeout(300);
    }
  });

  // The data card's tiles as shown: each value, and its change line read back as numbers (value, sign × change, from).
  // (In the page, so a recorder can sample them without a round trip.)
  const TILES_JS = `() => {
    const num = (t) => parseFloat(String(t).replace('−', '-').replace(/[^0-9.+-]/g, ''));
    return [...document.querySelectorAll('.pz-data:not(.pz-hide):not([hidden]) .pz-tile')].map((t) => {
      const v = t.querySelector('.pzt-v')?.textContent.trim(), d = t.querySelector('.pzt-d')?.textContent.trim() || '';
      const m = d.match(/^([▲▼])\\s*(?:Up |Down )?([0-9.]+).*from ([−0-9.-]+)/);
      return { k: t.querySelector('.pzt-k')?.textContent.trim(), v, d, val: num(v), dd: m ? (m[1] === '▼' ? -1 : 1) * num(m[2]) : d.startsWith('No change') ? 0 : null, from: m ? num(m[3]) : null };
    });
  }`;
  const cardTiles = (page) => page.evaluate(`(${TILES_JS})()`);
  // "▲ X from Y" must add up: the value shown is Y plus the change, to the last digit shown.
  const badDelta = (tiles) => tiles.filter((t) => t.dd != null && t.from != null && Math.abs(t.val - t.from - t.dd) > 1e-6).map((t) => `${t.k} ${t.v} reads "${t.d}"`).join('; ');

  // The slide a presentation starts on never waits on its case card, even on a machine slow enough that the start's cover
  // gives up (12 s) before the slide arrives: it once waited there for a tap, and every check that started a deck on the slide
  // before a time-lapse (Varices 2, a case) timed out. Here the cover gives up at once.
  if (device === 'desktop') await check(device, 'presenter: a start on a case slide lands on it, with no case card, however slow the start', async (page) => {
    await open(page);
    await page.evaluate(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 12000 ? 0 : ms, ...a); });
    await page.evaluate(() => window.pps.presenter.start('varices', 0));
    await page.waitForFunction(() => window.pps.presenter.probe()?.i === 0, null, { timeout: 60000 });
    await page.evaluate(() => window.pps.presenter.start('varices', 1));
    const came = await page.waitForFunction(() => window.pps.presenter.probe()?.i === 1, null, { timeout: 60000, polling: 250 }).then(() => true, () => false);
    if (!came) throw new Error(`Varices slide 2 never arrived (a case card up: ${await page.evaluate(() => !!document.querySelector('.pz-case.on'))})`);
    if (await page.evaluate(() => !!document.querySelector('.pz-case.on'))) throw new Error('Varices slide 2 landed under its case card');
  });

  // A time-lapse slide's card shows the state the time-lapse plays from on its first frames (not its end, nor the slide before),
  // climbs from there with no snap back, ends on the slide's state, and every change line adds up.
  // (A numbers-only card is held back until the days have run (cbb1919: the cards come in after the change settles), so it
  // first shows after the end, never while held, and is not judged on its first frames.)
  if (device === 'desktop') for (const deck of DECK_IDS) await check(device, `presenter: ${deck}'s time-lapse cards start from the model's start state and climb without a snap`, async (page) => {
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    const laps = (await page.evaluate(() => window.pps.presenter.probe())).lapses;
    for (const at of laps) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, at - 1]);
      // (The slide before may be a time-lapse too: it plays to its end first.)
      await page.waitForFunction((i) => window.pps.presenter.probe()?.i === i && !window.pps.presenter.probe().playing, at - 1, { timeout: 240000, polling: 500 });
      await page.waitForTimeout(1500);
      // A recorder in the page: every 50 ms, once the slide's number is up, the card's tiles and the slide shown.
      await page.evaluate(([at, js]) => {
        const read = (0, eval)(js), rec = window.__lapRec = [];
        window.__lapT = setInterval(() => {
          if (!document.querySelector('.pzb-n')?.textContent.trim().startsWith(`${at + 1} `)) return;
          const p = window.pps.presenter.probe();
          rec.push({ t: Math.round(performance.now()), i: p.i, playing: p.playing, start: p.start, end: p.end, n: p.keys.length, tiles: read(), done: !!document.querySelector('.pz-lapse.done'), held: 'hold' in (document.querySelector('.pz-data')?.dataset || {}) });
        }, 50);
      }, [at, TILES_JS]);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((at) => window.__lapRec.some((r) => r.i === at && r.done && !r.playing), at, { timeout: 240000, polling: 500 })
        .catch(async () => { throw new Error(`${deck} slide ${at + 1}: the time-lapse never ended (last: ${JSON.stringify(await page.evaluate(() => [window.__lapRec.length, window.__lapRec.at(-1), document.querySelector('.pzb-n')?.textContent]))})`); });
      await page.waitForTimeout(1500);
      // (A held card comes in once the end's ease and the cards' fit have run: up to 15 s on a slow machine.)
      if (await page.evaluate(() => window.__lapRec.some((r) => r.held))) await page.waitForFunction(() => { const p = window.__lapRec.findLast((r) => r.start && r.end); return p && window.__lapRec.some((r) => !r.held && r.tiles.length === p.n); }, null, { timeout: 15000, polling: 250 }).catch(() => {});
      const rec = await page.evaluate(() => { clearInterval(window.__lapT); return window.__lapRec; });
      const p = rec.findLast((r) => r.start && r.end), at1 = `${deck} slide ${at + 1}`;
      if (!p) throw new Error(`${at1}: the slide never counted as shown (${rec.length} samples, ${JSON.stringify(rec.slice(-2))})`);
      // Every sample with the full card: the values as the model has them at the start, then a climb with no jump.
      const full = rec.filter((r) => r.tiles.length === p.n);
      if (!full.length) throw new Error(`${at1}: the card never showed`);
      for (const r of full) { const bad = badDelta(r.tiles); if (bad) throw new Error(`${at1}: ${bad}`); }
      const held = rec.some((r) => r.held), first = full[0].tiles, off = held ? [] : first.filter((x, j) => x.v !== p.start[j]);
      if (held && (full[0].held || full[0].playing)) throw new Error(`${at1}: the held card showed before the days had run`);
      if (off.length) throw new Error(`${at1} opens on ${off.map((x) => `${x.k} ${x.v}`).join(', ')}, but the model starts at ${p.start.join(', ')}`);
      // No snap or reset: sample to sample, no tile moves back away from where the time-lapse ends by more than a small wobble
      // (two last digits and 15% of its whole change). (Not a speed limit: a slow machine samples sparsely.)
      const num = (v) => parseFloat(v.replace('−', '-')), s0 = p.start.map(num), s1 = p.end.map(num);
      for (let n = 1; n < full.length; n++) full[n].tiles.forEach((x, j) => {
        const unit = 2 * 10 ** -((p.end[j].split('.')[1] || '').length) + 0.15 * Math.abs(s1[j] - s0[j] || 0), was = full[n - 1].tiles[j];
        if (Math.abs(x.val - s1[j]) > Math.abs(was.val - s1[j]) + unit) throw new Error(`${at1}: ${x.k} goes back from ${was.v} to ${x.v} (start ${p.start[j]}, end ${p.end[j]})`);
      });
      // (Once the numbers have eased onto the slide's state, up to 15 s on a slow machine.)
      await page.waitForFunction(([js, end]) => (0, eval)(js)().every((x, j) => x.v === end[j]), [TILES_JS, p.end], { timeout: 15000, polling: 500 }).catch(() => {});
      const last = await cardTiles(page), endOff = last.filter((x, j) => x.v !== p.end[j]);
      if (endOff.length) throw new Error(`${at1} ends on ${endOff.map((x) => `${x.k} ${x.v}`).join(', ')}, model ${p.end.join(', ')}`);
    }
  });

  // A time-lapse's chart in the card (flow-time.js: the meal, ascites building, varices growing) gains its points live as the
  // slide plays, one after another, never going back, and ends with every point; on a phone, an upright iPad and a desktop.
  for (const size of device === 'phone' ? [null] : [{ width: 820, height: 1180 }, null]) for (const deck of ['circulation', 'ascites', 'varices']) await check(device, `presenter: ${deck}'s time-lapse chart gains its points as the slide plays${size ? ` at ${size.width}x${size.height}` : ''}`, async (page) => {
    if (size) await page.setViewportSize(size);
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    const charts = (await page.evaluate(() => window.pps.presenter.probe())).charts;
    if (!charts.length) throw new Error(`${deck}: no time-lapse chart`);
    for (const at of charts) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, at - 1]);
      await page.waitForFunction((i) => window.pps.presenter.probe()?.i === i && !window.pps.presenter.probe().playing, at - 1, { timeout: 240000, polling: 500 });
      await page.waitForTimeout(800);
      // A recorder in the page: every count of points the chart draws on this slide (each paint, not a sampled few).
      await page.evaluate((at) => {
        const rec = window.__ptRec = [];
        window.__ptT = new MutationObserver(() => {
          const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child'), p = window.pps.presenter.probe();
          if (p.i === at && svg?.dataset.points && +svg.dataset.points !== rec.at(-1)?.n) rec.push({ n: +svg.dataset.points, playing: p.playing });
        });
        window.__ptT.observe(document.querySelector('.pz-data'), { subtree: true, attributes: true, attributeFilter: ['data-points'] });
      }, at);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((at) => window.pps.presenter.probe().playing || window.__ptRec.length > 2, at, { timeout: 240000, polling: 200 });
      await page.waitForFunction((at) => window.pps.presenter.probe().i === at && !window.pps.presenter.probe().playing, at, { timeout: 240000, polling: 500 });
      // (Then the heads ease onto the last point, up to 60 s on a slow machine.)
      await page.waitForFunction(() => { const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child'); return svg.dataset.points === svg.dataset.of; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
      const rec = await page.evaluate(() => { window.__ptT.disconnect(); return window.__ptRec.map((r) => r.n); });
      // (Points between the first and the last: a slow machine samples sparsely, so a few are enough; the talk trace had none.)
      const steps = new Set(rec.filter((n) => n > rec[0])).size, back = rec.findIndex((n, j) => j && n < rec[j - 1]), full = await page.evaluate(() => {
        const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child');
        return [+svg.dataset.points, svg.querySelectorAll('.ptk-line')[0].getAttribute('d').split('L').length, +svg.dataset.of];
      });
      const at1 = `${deck} slide ${at + 1}${size ? ` at ${size.width}x${size.height}` : ''}`;
      if (back > 0) throw new Error(`${at1}: the chart lost points (${rec[back - 1]} to ${rec[back]})`);
      if (steps < 5) throw new Error(`${at1}: the chart grew in only ${steps} step(s) while the slide played (${rec.slice(0, 40).join(',')})`);
      if (full[0] !== full[2] || full[1] < 30) throw new Error(`${at1}: the chart ends with ${full[0]} of its ${full[2]} points (${full[1]} on its line)`);
      // Its words are 12 px or more on the screen, the card's own zoom included (they were 9.6 px on a Mac, 8 px on an iPad held sideways).
      const small = await page.evaluate(() => { const svg = document.querySelector('.pz-data:not(.pz-hide) .pz-flowtime svg:last-child'), k = svg.getScreenCTM().a;
        return [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => [t.textContent.trim(), parseFloat(getComputedStyle(t).fontSize) * k]).filter(([, px]) => px < 11.95).map(([s, px]) => `"${s}" ${px.toFixed(1)} px`); });
      if (small.length) throw new Error(`${at1}: the chart's words under 12 px: ${small.slice(0, 4).join(', ')}`);
    }
  });

  // Tiles under a slide's chart (desktop and iPad, text at 100 %): a tile's name never breaks inside a word, no tile text sticks
  // out of its tile, a change line ("▲ 7.9 from 16.9") takes at most two lines, and the card fits the screen. Three, four
  // and two tiles under the day-by-day, Doppler and bleed charts, at three laptop sizes (a 16-inch Mac first) and an iPad both ways.
  if (device === 'desktop') for (const size of [{ width: 1728, height: 1000 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }]) await check(device, `presenter: tiles under a chart keep their words whole and their change lines short at ${size.width}x${size.height}`, async (page) => {
    await page.setViewportSize(size);
    await open(page);
    for (const [deck, at] of [['ascites', 3], ['varices', 2], ['shunts', 4], ['variceal-bleed', 2]]) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, at]);
      await page.waitForFunction((i) => window.pps.presenter.probe()?.i === i && !document.querySelector('.pz-cover') && document.querySelector('.pz-data.has-tool:not(.pz-hide) .pzt-d'), at, { timeout: 60000 });
      await page.waitForFunction(() => !window.pps.presenter.probe().playing, null, { timeout: 120000, polling: 500 });
      await page.waitForTimeout(1200);
      const bad = await page.evaluate(() => {
        const out = [], card = document.querySelector('.pz-data.has-tool:not(.pz-hide)'), c = card.getBoundingClientRect();
        const rows = (g) => new Set([...g.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top))).size;
        for (const k of card.querySelectorAll('.pzt-k')) for (const t of k.childNodes) if (t.nodeType === 3) for (const m of t.textContent.matchAll(/\S+/g)) {
          const g = document.createRange(); g.setStart(t, m.index); g.setEnd(t, m.index + m[0].length);
          if (rows(g) > 1) out.push(`"${m[0]}" breaks inside the word`);
        }
        for (const e of card.querySelectorAll('.pzt-k, .pzt-vu, .pzt-r, .pzt-d')) if (e.scrollWidth > e.clientWidth + 1) out.push(`"${e.textContent}" sticks out of its tile`);
        for (const d of card.querySelectorAll('.pzt-d')) { const g = document.createRange(); g.selectNodeContents(d); if (rows(g) > 2) out.push(`change "${d.textContent}" takes ${rows(g)} lines`); }
        if (c.top < 0 || c.bottom > innerHeight) out.push(`card runs off the screen (${Math.round(c.top)} to ${Math.round(c.bottom)} of ${innerHeight})`);
        return out;
      });
      if (bad.length) throw new Error(`${deck} slide ${at + 1} at ${size.width}x${size.height}: ${bad.join('; ')}`);
    }
  });

  // An upright iPad (820x1180): on every slide of the decks that open the sinusoid view, its names keep off the cards.
  if (device === 'desktop') for (const deck of ['ascites', 'lobule']) await check(device, `presenter: on every slide of ${deck} at 820x1180 the sinusoid's names keep off the cards`, async (page) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    for (let guard = 0; guard < 80; guard++) {
      const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim());
      await barSettle(page); await page.waitForTimeout(1200);
      const sv = await svCovered(page);
      if (sv) throw new Error(`${deck}, slide ${n}: ${sv}`);
      const [a, b] = n.split('/').map((x) => +x);
      if (a === b) break;
      for (let k = 0; k < 4; k++) {
        await page.keyboard.press('ArrowRight');
        if (await page.waitForFunction((was) => document.querySelector('.pzb-n')?.textContent.trim() !== was, n, { timeout: 15000 }).then(() => true, () => false)) break;
      }
      await page.waitForTimeout(300);
    }
  });

  // Presenter, every slide of every deck that opens the sinusoid view (phone, iPad and desktop sizes): an end arrow (toward the portal
  // venule, toward the central vein) shows only with its name and fades with it; where the name shows, so does the arrow.
  // DOM state, not pixels: the view exposes each arrow's strength (canvas data-end-arrows) and the names' own opacity is read here.
  // (Each deck's sinusoid slides, from its source: the slide's cam. A software renderer takes up to a minute to open the view.)
  const SV_DECKS = new Map(), { DECKS: ALL } = await import(new URL('../../src/ui/decks.js', import.meta.url)), CHECKS = (id) => (ALL.find((d) => d.id === id)?.checks?.length ? 1 : 0);
  for (const f of readdirSync(new URL('../../src/ui/decks/', import.meta.url))) {
    if (!f.endsWith('.js') || !/cam: ['"]sinusoid/.test(readFileSync(new URL(`../../src/ui/decks/${f}`, import.meta.url), 'utf8'))) continue;
    const mod = await import(`../../src/ui/decks/${f}`), d = Object.values(mod).find((v) => Array.isArray(v?.slides));
    if (d) SV_DECKS.set(d.id, { at: d.slides.map((x, i) => (x.cam === 'sinusoid' && !x.visual ? i : -1)).filter((i) => i >= 0), n: d.slides.length });
  }
  if (!SV_DECKS.size) throw new Error('no deck opens the sinusoid view: the end-arrow check has nothing to walk');
  // Presenter, the closing quick check of every deck: every answer starts hidden (no room reserved for it), tapping a question
  // slides only its own answer open, and a second tap closes it again.
  for (const d of ALL.filter((x) => x.checks?.length)) await check(device, `presenter: quick check of ${d.id} starts with every answer hidden; a tap opens its answer and a second tap closes it`, async (page) => {
    await open(page);
    await page.evaluate((id) => window.pps.presenter.start(id, 0), d.id);
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
    await page.keyboard.press('End');
    await page.waitForSelector('.pz-check .pzc-q', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1500);
    const state = () => page.evaluate(() => {
      const l = document.querySelector('.pz-check');
      return { stuck: l.classList.contains('pzc-all') || l.classList.contains('pzc-still'), answers: [...l.querySelectorAll('.pzc-a')].map((a) => Math.round(a.getBoundingClientRect().height)), expanded: [...l.querySelectorAll('.pzc-q')].map((q) => q.getAttribute('aria-expanded')) };
    });
    const s0 = await state(), n = s0.answers.length;
    if (n !== d.checks.length || s0.stuck || s0.answers.some((h) => h > 0) || s0.expanded.some((e) => e !== 'false')) throw new Error(`${d.id}: the quick check does not start with every answer hidden ${JSON.stringify(s0)}`);
    for (let k = 0; k < n; k++) {
      // (It eases open and shut: tapping starts a running transition of the answer's row, not a jump. The page may draw only a few frames
      // a second here, so the transition is read straight after the tap rather than by sampling heights.)
      // (While it eases, no text on the card may change size and the easing may not be cut short (a refit mid-ease snapped it):
      // every frame records the card's zoom and the type sizes, and any cancelled transition is counted.)
      const eases = (page) => page.evaluate((k) => {
        const l = document.querySelector('.pz-check'), card = l.closest('.pz-panel, .pz-text, .pz-data');
        const a = l.querySelectorAll('.pzc-a')[k];
        const look = () => [card.style.getPropertyValue('--pz-fit') || '1', ...[...card.querySelectorAll('.pz-h, .pzc-t, .pzc-a > p')].map((e) => getComputedStyle(e).fontSize)].join();
        const w = { cut: 0, first: look(), changed: null, done: false };
        window.__pzcWatch = w;
        const cut = () => { w.cut++; };
        l.addEventListener('transitioncancel', cut);
        const tick = () => { const v = look(); if (v !== w.first && !w.changed) w.changed = v; if (l.getAnimations({ subtree: true }).length) requestAnimationFrame(tick); else { w.done = true; l.removeEventListener('transitioncancel', cut); } };
        l.querySelectorAll('.pzc-q')[k].click(); a.getBoundingClientRect();
        requestAnimationFrame(tick);
        return a.getAnimations().filter((x) => x.transitionProperty === 'grid-template-rows' && x.effect.getTiming().duration >= 200).length;
      }, k);
      const steady = async (what) => {
        await page.waitForFunction(() => window.__pzcWatch?.done, null, { timeout: 20000 });
        const w = await page.evaluate(() => window.__pzcWatch);
        if (w.cut) throw new Error(`${d.id}: question ${k + 1}'s answer was cut short while easing ${what} (${w.cut} transitions cancelled)`);
        if (w.changed) throw new Error(`${d.id}: the card's text changed size while question ${k + 1}'s answer eased ${what} (${w.first} became ${w.changed})`);
      };
      if (!await eases(page)) throw new Error(`${d.id}: question ${k + 1}'s answer does not ease open`);
      // (A slow page draws few frames: wait for the transition to finish, not a fixed time.)
      await steady('open');
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !document.querySelector('.pz-check').getAnimations({ subtree: true }).length, null, { timeout: 20000 });
      const on = await state();
      if (!(on.answers[k] > 0) || on.answers.some((h, j) => j !== k && h > 0) || on.expanded[k] !== 'true') throw new Error(`${d.id}: question ${k + 1} does not open only its own answer ${JSON.stringify(on)}`);
      if (!await eases(page)) throw new Error(`${d.id}: question ${k + 1}'s answer does not ease shut`);
      // (A slow page draws few frames: wait for the transition to finish, not a fixed time.)
      await steady('shut');
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !document.querySelector('.pz-check').getAnimations({ subtree: true }).length, null, { timeout: 20000 });
      const off = await state();
      if (off.answers.some((h) => h > 0) || off.expanded.some((e) => e !== 'false')) throw new Error(`${d.id}: question ${k + 1} does not close again ${JSON.stringify(off)}`);
    }
  });
  const endArrows = () => {
    const c = document.querySelector('.sv.on .sv-canvas');
    if (!c || !c.dataset.endArrows) return null;
    const a = c.dataset.endArrows.split(' ').map(Number), names = [...document.querySelectorAll('.sv.on .sv-end')];
    if (names.length !== 2) return `${names.length} end names`;
    const bad = names.map((e, i) => {
      const k = e.firstElementChild, shown = e.hidden || !k ? 0 : Math.min(1, (+getComputedStyle(e).opacity || 0) * (+getComputedStyle(k).opacity || 0) / 0.78);
      return Math.abs(shown - a[i]) > 0.08 ? `${i ? 'central vein' : 'portal venule'} arrow ${a[i]} but its name shows ${shown.toFixed(2)}` : null;
    }).filter(Boolean);
    return bad.length ? bad.join('; ') : 'ok';
  };
  // (One check per deck and size: ascites at three sizes took 18 minutes in one piece.)
  for (const [deck, { at: sinAt, n: count }] of SV_DECKS) for (const size of device === 'desktop' ? [null, { width: 820, height: 1180 }, { width: 1180, height: 820 }] : [null]) await check(device, `presenter: on every sinusoid slide of ${deck}${size ? ` at ${size.width}x${size.height}` : ''} no direction arrow shows without its name`, async (page) => {
    {
      if (size) await page.setViewportSize(size);
      await open(page);
      await page.evaluate((id) => window.pps.presenter.start(id, 0), deck);
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover'), null, { timeout: 60000 });
      let seen = 0;
      for (let guard = 0; guard < 80; guard++) {
        const n = await page.evaluate(() => document.querySelector('.pzb-n')?.textContent.trim());
        const [a, b] = n.split('/').map((x) => +x);
        await barSettle(page);
        // (A slide that opens the sinusoid view is waited for until it shows; any other slide is checked only if the view happens to be up.)
        const must = sinAt.some((i) => i + 1 + (b - count - CHECKS(deck)) === a);   // (the overview before, the quick check after)
        let r = null;
        for (let t = 0; t < (must ? 240 : 14); t++) {   // (the names and their arrows ease together; the view itself can be slow to open)
          r = await page.evaluate(endArrows);
          if (r === 'ok' || (r === null && !must)) break;
          await page.waitForTimeout(250);
        }
        if (r === 'ok') seen++;
        else if (must) throw new Error(`${deck}, slide ${n}${size ? ` at ${size.width}x${size.height}` : ''}: the sinusoid view never showed its end arrows (${r})`);
        else if (r) throw new Error(`${deck}, slide ${n}${size ? ` at ${size.width}x${size.height}` : ''}: ${r}`);
        if (a === b) break;
        for (let k = 0; k < 4; k++) {
          await page.keyboard.press('ArrowRight');
          if (await page.waitForFunction((was) => document.querySelector('.pzb-n')?.textContent.trim() !== was, n, { timeout: 15000 }).then(() => true, () => false)) break;
        }
      }
      if (!seen) throw new Error(`${deck}: no slide showed the sinusoid view`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
    }
  });

  // A phone's data card stays short and its tiles alike: the name on top, the value and unit below it with the rating at that
  // row's right end, then the change said short; nothing spilling out of a tile. The FibroScan slide's two tiles sit side by side.
  if (device === 'phone') await check(device, 'presenter: a phone keeps the data card short', async (page) => {
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('stiffness', 2));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && document.querySelector('.pz-data:not(.pz-hide) .pzt-d')?.textContent.includes('from'), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    // (Short means no dead room, judged from what each part holds, since the tiles carry scale bars (14 Oct): a tile no taller
    // than its name, value, rating and scale bar with its numbers, plus its padding; the card no taller than its header, tiles
    // and grip, plus its padding; 2 px of slack each. And the figure keeps at least its 276 px at 390x844.)
    const r = await page.evaluate(() => {
      const d = document.querySelector('.pz-data:not(.pz-hide)'), tiles = [...d.querySelectorAll('.pz-tile')];
      const spill = tiles.flatMap((t) => { const b = t.getBoundingClientRect(); return [...t.children].filter((c) => { const cb = c.getBoundingClientRect(); return cb.width && (cb.right > b.right + 1 || cb.bottom > b.bottom + 1); }).map((c) => c.className); });
      // (the span its shown parts cover, top to bottom, plus its padding and border; the card counts its tiles themselves, so an
      // empty row in the tile grid shows as dead room)
      const held = (el, parts) => {
        const shows = (c) => c.textContent.trim() || c.matches('canvas, svg, img, .pz-grip, .pz-fold') || c.querySelector('canvas, svg, img');
        const rs = parts.filter((c) => { const s = getComputedStyle(c); return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed' && shows(c); }).map((c) => c.getBoundingClientRect()).filter((q) => q.width && q.height);
        const s = getComputedStyle(el), z = el.getBoundingClientRect().height / el.offsetHeight || 1;
        const pad = (parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth)) * z;
        return rs.length ? Math.max(...rs.map((q) => q.bottom)) - Math.min(...rs.map((q) => q.top)) + pad : pad;
      };
      const loose = tiles.map((t) => ({ k: t.querySelector('.pzt-k')?.textContent.trim(), h: t.getBoundingClientRect().height, held: held(t, [...t.querySelectorAll(':scope > *')]) })).filter((x) => x.h > x.held + 2);
      const card = d.getBoundingClientRect(), cardHeld = held(d, [...d.children].flatMap((c) => c.matches('.pz-tiles') ? [...c.children] : [c]));
      const sh = document.querySelector('.pz-shade.stack');
      return { h: card.height, cardHeld, loose, n: tiles.length, spill, fig: sh ? sh.getBoundingClientRect().top - card.bottom : null };
    });
    const why = [];
    if (r.n !== 2) why.push(`${r.n} tiles (2)`);
    if (r.h > r.cardHeld + 2) why.push(`FibroScan card ${Math.round(r.h)}px tall for ${Math.round(r.cardHeld)}px of header, tiles and padding`);
    for (const x of r.loose) why.push(`the ${x.k} tile ${Math.round(x.h)}px tall for ${Math.round(x.held)}px of content and padding`);
    if (r.fig != null && r.fig < 276) why.push(`the figure keeps ${Math.round(r.fig)}px (at least 276)`);
    if (r.spill.length) why.push('spilling: ' + r.spill.join());
    if (why.length) throw new Error(why.join('; '));
    // The Doppler card: its report in three short rows, the direction clear of the stats.
    await page.evaluate(() => window.pps.presenter.start('doppler', 1));
    await page.waitForFunction(() => document.querySelector('.pz-data:not(.pz-hide) .pz-tool[data-kind="doppler"] .dop-dir')?.textContent.length > 2, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => {
      const R = (q) => document.querySelector('.pz-data:not(.pz-hide) ' + q).getBoundingClientRect(), a = R('.dop-dir'), b = R('.dop-stats');
      return { h: R('').height, hit: a.bottom > b.top && a.right > b.left };
    });
    if (d.h > 300 || d.hit) throw new Error(`Doppler card ${Math.round(d.h)}px tall (cap 300)${d.hit ? ', the direction runs into the stats' : ''}`);
    // The DIPS slide's ascites rating ("Grade 1") stays inside its tile, clear of the other tiles' words.
    await page.evaluate(() => window.pps.presenter.start('outflow', 4));
    await page.waitForFunction(() => /Grade/.test(document.querySelector('.pz-data:not(.pz-hide) .pz-tiles')?.textContent || ''), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const hits = await page.evaluate(() => {
      const kids = [...document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')].flatMap((t) => { const b = t.getBoundingClientRect(); return [...t.children].map((c) => ({ c, r: c.getBoundingClientRect(), b })).filter((x) => x.r.width && x.c.textContent.trim()); });
      const bad = kids.filter((x) => x.r.right > x.b.right + 1 || x.r.bottom > x.b.bottom + 1).map((x) => `"${x.c.textContent}" spills`);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const p = kids[i].r, q = kids[j].r; if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1) bad.push(`"${kids[i].c.textContent}" hits "${kids[j].c.textContent}"`); }
      return bad;
    });
    if (hits.length) throw new Error(`DIPS slide tiles: ${hits.join('; ')}`);
  });

  // Every deck's number tiles share one layout at each size: in a card, each tile's name, value and rating sit at the same place
  // within the tile (the rating's left or right edge), and every tile with a unit shows it (each deck's first card of two, three and four tiles).
  // Every slide's numbers agree once it has settled: an HVPG or PPG tile equals the difference of the WHVP and FHVP (portal
  // vein and IVC) callouts shown, and each live value in the words ({pv}, {ra}, ...) reads as its callout or tile does.
  if (device === 'desktop') await check(device, 'presenter: slide words, callouts and tiles agree', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const K = ['pv', 'ra', 'whvp', 'fhvp', 'ivc', 'hvpg', 'ppg'];
    const slides = DECKS.flatMap((d) => withOverview(d).slides.map((s, i) => [d.id, i, s]).filter(([, , s]) => K.some((k) => (s.line || '').includes(`{${k}}`)) || s.data === 'ladder' || (s.tiles || []).some((k) => k === 'hvpg' || k === 'ppg' || k === 'sin')))
      .filter(([d]) => !process.env.DECKS || process.env.DECKS.split(',').includes(d));
    await open(page);
    // (motion instant and a wait for the readings to stop changing, not a fixed 3.5 s a slide: tests/e2e/fast.mjs)
    const restore = await instantMotionOn(page);
    const bad = [];
    for (const [d, i, s] of slides) {
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [d, i]);
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover, .pz-load.on'), null, { timeout: 30000 }).catch(() => {});
      await quiet(page, { still: 400 });
      const keys = [...(s.line || '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).filter((k) => !/^[<>≥≤\d]/.test(k));   // (cut-offs and typed numbers are outlined rule pills, not the patient's)
      const read = () => page.evaluate((keys) => {
        const num = (t) => { const m = /(-?\d+(?:\.\d+)?)/.exec(t || ''); return m ? +m[1] : null; };
        const v = {}, out0 = [];
        for (const n of document.querySelectorAll('.lb-name')) {
          const t = n.parentElement.textContent, x = num(t.slice(n.textContent.length));
          if (x == null) continue;
          const k = /WHVP/.test(n.textContent) ? 'whvp' : /FHVP/.test(n.textContent) ? 'fhvp' : /^Portal v\./.test(n.textContent) ? 'pv' : /^IVC$/.test(n.textContent) ? 'ivc' : /^RA$/.test(n.textContent) ? 'ra' : null;
          if (k) v[k] = x;
        }
        for (const t of document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')) {
          if (!t.offsetWidth) continue;
          const k = { HVPG: 'hvpg', PPG: 'ppg', 'Sinusoidal pressure': 'sinT' }[t.querySelector('.pzt-k')?.textContent.trim()], x = num(t.querySelector('.pzt-vu')?.textContent);
          if (k && x != null) v[k] = x;
        }
        // The lobule's and the zoomed sinusoid's labels read as the Sinusoids tile.
        for (const zl of document.querySelectorAll('.lz-lab[data-target="lobule:sinusoid"], .sv-region-sin')) {
          if (!zl.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || v.sinT == null) continue;
          const x = num(zl.textContent.replace(/^\D+/, '')); if (x != null && Math.abs(x - v.sinT) > 0.05) out0.push(`Sinusoids tile ${v.sinT} but figure ${x}`);
        }
        const out = [...out0], gap = (a, b) => Math.round((a - b) * 10) / 10;
        if (v.hvpg != null && v.whvp != null && v.fhvp != null && Math.abs(gap(v.whvp, v.fhvp) - v.hvpg) > 0.05) out.push(`HVPG ${v.hvpg} but WHVP ${v.whvp} − FHVP ${v.fhvp}`);
        if (v.ppg != null && v.pv != null && v.ivc != null && Math.abs(gap(v.pv, v.ivc) - v.ppg) > 0.05) out.push(`PPG ${v.ppg} but portal vein ${v.pv} − IVC ${v.ivc}`);
        const pills = [...document.querySelectorAll('.pz-line .pz-val:not(.cut)')].map((e) => num(e.textContent));
        keys.forEach((k, j) => { if (v[k] != null && pills[j] != null && Math.abs(pills[j] - v[k]) > 0.05) out.push(`words say ${k} ${pills[j]}, figure ${v[k]}`); });
        return out;
      }, keys);
      let r = await read();
      if (r.length) { await page.waitForTimeout(2500); r = await read(); }   // (a slow machine: a long glide may still be landing)
      if (r.length) bad.push(`${d} slide ${i + 1}: ${r.join('; ')}`);
    }
    await restore();
    if (bad.length) throw new Error(bad.join('\n'));
  });

  await check(device, 'presenter: data card tiles are laid out alike', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    await open(page);
    const bad = [];
    // Five cards each of two, three and four tiles (each from a different deck where it can), a phone at its narrowest, 375 wide.
    // (Every deck's cards at 375 and 390 passed once by hand; that sweep takes about 15 minutes, too long to run on every push.)
    const firsts = DECKS.flatMap((d) => [2, 3, 4].map((n) => [d, withOverview(d).slides.map((x, i) => [x, i]).find(([x]) => x.data === 'tiles' && x.tiles?.length === n)]).filter(([, x]) => x));
    const slides = [2, 3, 4].flatMap((n) => firsts.filter(([, x]) => x[0].tiles.length === n).slice(0, 5));
    for (const W of device === 'phone' ? [375] : [0]) for (const [d, sl] of slides) {
      if (W) await page.setViewportSize({ width: W, height: 844 });
      await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [d.id, sl[1]]);
      const ok = await page.waitForFunction((n) => [...document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')].filter((t) => t.offsetWidth).length >= Math.min(n, 2) && !document.querySelector('.pz-cover'), sl[0].tiles.length, { timeout: 6000 }).then(() => true, () => false);
      if (!ok) continue;   // (a slide whose tiles fold away at this size, behind its tool)
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const out = [], tiles = [...document.querySelectorAll('.pz-data:not(.pz-hide) .pz-tile')].filter((t) => t.offsetWidth);
        const at = (t, q) => { const e = t.querySelector(q), b = t.getBoundingClientRect(), c = e?.getBoundingClientRect(); return c?.width ? { t: c.top - b.top, l: c.left - b.left, r: b.right - c.right } : null; };
        const P = tiles.map((t) => ({ k: at(t, '.pzt-k'), v: at(t, '.pzt-v'), r: at(t, '.pzt-r'), u: t.querySelector('.pzt-vu small'), name: t.querySelector('.pzt-k')?.textContent }));
        for (const p of P) if (p.u?.hidden && !/—/.test(p.u.parentElement.textContent)) out.push(`${p.name} has no unit`);
        const same = (f, why) => { const v = P.map(f).filter((x) => x != null); if (v.length > 1 && Math.max(...v) - Math.min(...v) > 3) out.push(why + ' ' + v.map(Math.round).join('/')); };
        same((p) => p.k?.t, 'name top'); same((p) => p.k?.l, 'name left'); same((p) => p.v?.l, 'value left');
        same((p) => p.v && p.k && p.v.t - p.k.t > 0 ? 1 : 0, 'value below name');
        const rl = P.map((p) => p.r?.l), rr = P.map((p) => p.r?.r), spread = (v) => Math.max(...v) - Math.min(...v);
        if (P.every((p) => p.r) && spread(rl) > 3 && spread(rr) > 3) out.push('rating placed differently');
        // A rating never clipped, spilling from its tile or broken onto a second line (every rating is a word or two).
        for (const t of tiles) { const e = t.querySelector('.pzt-r'), c = e.getBoundingClientRect(), b = t.getBoundingClientRect(); if (!c.width) continue;
          const lh = parseFloat(getComputedStyle(e).lineHeight) || 15;
          if (c.right > b.right + 1 || c.left < b.left - 1 || e.scrollWidth > e.clientWidth + 1 || c.height > lh * 1.5) out.push(`rating "${e.textContent}" clipped or broken`); }
        return out;
      });
      if (r.length) bad.push(`${d.id} slide ${sl[1]}${W ? ' at ' + W : ''}: ${r.join('; ')}`);
    }
    if (bad.length) throw new Error(bad.join('\n'));
  });

  // A phone's data card opens and shuts by dragging its lower edge (as well as Show/Hide), its parts at full size after each.
  if (device === 'phone') await check(device, 'presenter: a phone drags the data card open and shut', async (page) => {
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('prehepatic', 1));   // (a card with a second part: stiffness 4's is its tiles alone now)
    // (A phone's card keeps its second part on a sheet under it, pulled out by the finger or a tap on its handle, no Show or Hide:
    // 802e093. Its open state is still the card's fold, aria-expanded, kept in step for readers.)
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const drag = (dy) => page.evaluate(async (dy) => {
      const d = document.querySelector('.pz-data.pz-sheet'), b = d.getBoundingClientRect();
      const x = b.left + b.width / 2, y0 = dy > 0 ? b.top + b.height / 2 : b.bottom - 20;   // (anywhere on the card)
      const fire = (type, y) => { const t = new Touch({ identifier: 1, target: d, clientX: x, clientY: y });
        d.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
      fire('touchstart', y0);
      for (let i = 1; i <= 10; i++) { fire('touchmove', y0 + dy * i / 10); await new Promise((r) => setTimeout(r, 30)); }
      await new Promise((r) => setTimeout(r, 150));   // (a slow release: decided by how far it got)
      fire('touchend', y0 + dy);
    }, dy);
    const state = () => page.evaluate(() => document.querySelector('.pz-data.pz-sheet .pz-fold')?.getAttribute('aria-expanded'));
    await drag(260); await page.waitForTimeout(900);
    if (await state() !== 'true') throw new Error('dragging the card edge down did not open it');
    let gap = await cardGap(page); if (gap) throw new Error(`after dragging open: ${gap}`);
    await drag(-400); await page.waitForTimeout(900);
    if (await state() !== 'false') throw new Error('dragging the card edge up did not shut it');
    gap = await cardGap(page); if (gap) throw new Error(`after dragging shut: ${gap}`);
  });

  // A phone's data card keeps its parts' size the whole way open and shut, pulled or tapped: it is fitted as it will rest before the
  // part moves. (Refitted as the finger pulled, the 440 px iPhone's Doppler card met the shut card's cap and shrank its tiles and
  // words mid-pull, then grew back once open.) A folded card's header and Show stay full size (a 320 px folded header had zoomed to half).
  if (device === 'phone') await check(device, 'presenter: a phone data card holds its size while it opens and shuts', async (page) => {
    const bad = [];
    const look = () => page.evaluate(() => {
      const d = document.querySelector('.pz-data'), tile = d.querySelector('.pz-tiles .pz-tile'), dh = d.querySelector('.pz-dh');
      return { fit: d.style.getPropertyValue('--pz-fit') || '1', z: d.style.getPropertyValue('--pz-z') || '1', tile: tile ? Math.round(tile.getBoundingClientRect().height) : 0,
        dh: +(parseFloat(getComputedStyle(dh).fontSize) * (parseFloat(getComputedStyle(dh).zoom) || 1)).toFixed(1), open: d.classList.contains('tool-open') };
    });
    const same = (a, b) => a.fit === b.fit && a.z === b.z && Math.abs(a.tile - b.tile) <= 1 && a.dh === b.dh;
    const show = (o) => `fit ${o.fit}, zoom ${o.z}, tile ${o.tile} px, header ${o.dh} px`;
    for (const [w, h] of [[440, 956], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.evaluate(() => window.pps.presenter.start('prehepatic', 1));
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
        && document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const shut = await look();
      // Pulled open by the finger: sampled at each step of the pull, then at rest.
      const during = await page.evaluate(async () => {
        const d = document.querySelector('.pz-data'), b = d.querySelector('.pz-tiles').getBoundingClientRect(), x = b.left + b.width / 2, y0 = b.top + b.height / 2, out = [];
        const fire = (type, y) => { const t = new Touch({ identifier: 1, target: d, clientX: x, clientY: y });
          d.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
        const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const labs = () => [...document.querySelectorAll('#labels .lb:not(.lb-off)')].filter((l) => +getComputedStyle(l).opacity > 0.5 && l.getBoundingClientRect().width).map((l) => l.textContent.trim().split(/\s/)[0]).sort().join('+');
        const snap = () => { const tile = d.querySelector('.pz-tiles .pz-tile'); out.push({ fit: d.style.getPropertyValue('--pz-fit') || '1', z: d.style.getPropertyValue('--pz-z') || '1', tile: Math.round(tile.getBoundingClientRect().height), labs: labs() }); };
        out.labs = labs();
        fire('touchstart', y0);
        for (let i = 1; i <= 16; i++) { fire('touchmove', y0 + 15 * i); await raf(); snap(); }
        await new Promise((r) => setTimeout(r, 150));
        fire('touchend', y0 + 240);
        for (let i = 0; i < 12; i++) { await raf(); snap(); }
        return { out, labs: out.labs };
      });
      // (The figure holds still under the finger: the labels showing before the pull still show a quarter of the way in. A camera
      // that glided mid-pull faded them all.)
      const quarter = during.out.slice(0, 4).find((o) => o.labs !== during.labs);
      if (quarter) bad.push(`${w}: a quarter into the pull the figure labels were ${quarter.labs || 'none'}, before it ${during.labs}`);
      await page.waitForTimeout(1200);
      const opened = await look();
      if (!opened.open) bad.push(`${w}: pulling the card down did not open it`);
      for (const o of during.out) if (!same({ ...o, dh: opened.dh }, opened) && !same({ ...o, dh: opened.dh }, { ...shut, dh: opened.dh })) { bad.push(`${w}: mid-pull ${show({ ...o, dh: opened.dh })}; shut ${show(shut)}, open ${show(opened)}`); break; }
      // Its handle tapped, tucking the sheet, then again, bringing it out (802e093: no Hide or Show): the fit is the resting one from the first frame.
      for (const want of [false, true]) {
        // (Its handle steps open, tucked, closed, partly open, open: from tucked, the next tap closes the card, and one more brings it
        // back partly open, the sheet tucked, from where the measured tap brings the sheet out.)
        if (want) for (let k = 0; k < 2; k++) { await page.evaluate(() => document.querySelector('.pz-lip').click()); await page.waitForTimeout(1200); }
        const frames = await page.evaluate(async () => {
          const d = document.querySelector('.pz-data'), out = [];
          document.querySelector('.pz-lip').click();
          for (let i = 0; i < 30; i++) { await new Promise((r) => requestAnimationFrame(r)); const tile = d.querySelector('.pz-tiles .pz-tile'); out.push({ fit: d.style.getPropertyValue('--pz-fit') || '1', z: d.style.getPropertyValue('--pz-z') || '1', tile: Math.round(tile.getBoundingClientRect().height) }); }
          return out;
        });
        await page.waitForTimeout(1200);
        const rest = await look();
        if (rest.open !== want) bad.push(`${w}: a tap on the handle (${want ? 'out' : 'tuck'}) left the card ${rest.open ? 'open' : 'shut'}`);
        const odd = frames.find((o) => !same({ ...o, dh: rest.dh }, rest));
        if (odd) bad.push(`${w}: ${want ? 'opening' : 'shutting'} by a handle tap passed through ${show({ ...odd, dh: rest.dh })}; rests at ${show(rest)}`);
      }
    }
    // A folded card (a 320 px iPhone, TIPS Doppler slide 6): its header at full size, 12 px words or more.
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page);
    await page.evaluate(() => window.pps.presenter.start('tips-doppler', 5));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && document.querySelector('.pz-data.pz-sheet')?.offsetWidth, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const f = await look();
    if (await page.evaluate(() => document.querySelector('.pz-data').classList.contains('pz-folds')) && f.dh < 12) bad.push(`320: the folded card's header is ${f.dh} px`);
    if (bad.length) throw new Error(bad.join('\n'));
  });

  await check(device, 'presenter: summary table returns after back then forward', async (page) => {
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:lobule"]');
    await page.fill('.um-q', 'lobule');
    await page.press('.um-q', 'Enter');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting'));
    // (The summary is the slide before the closing quick check.)
    const at = (n) => page.waitForFunction((n) => { const m = (document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '').match(/^(\d+) \/ (\d+)$/); return !!m && (+m[1] === +m[2] - 1) === n; }, n);
    const table = () => page.waitForSelector('.pz-panel .pz-table', { state: 'visible' });
    await page.keyboard.press('End');
    await page.waitForFunction(() => /^(\d+) \/ \1$/.test(document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || ''));
    await page.keyboard.press('ArrowLeft');
    await at(true);
    await table();
    // Back one and forward again, several times and also before the move has finished: the table always draws again.
    for (const fast of [false, true, false]) {
      await page.keyboard.press('ArrowLeft');
      if (!fast) await page.waitForFunction(() => !document.querySelector('.pz-panel .pz-table'));
      await page.keyboard.press('ArrowRight');
      await at(true);
      await table();
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'));
  });

  // Every chart slide (scales, ladders, the SAAG map, the walls) at two phones, an upright iPad and a desktop: no two
  // pieces of text touch and no text crosses a rule line (tests/e2e/chart-text.mjs). Run once, from the desktop run.
  // (One check per size, and the strip's own: in one piece it took 18 minutes on a desktop runner.)
  if (device === 'desktop') for (const size of CHART_TEXT_SIZES) await check(device, `presenter: chart text never overlaps or crosses a line, ${size}`, async () => {
    const bad = await checkCharts(browser, server.url, () => {}, size);
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });
  if (device === 'desktop') await check(device, 'presenter: the pressure strip\'s text never overlaps or crosses a line, light and dark', async () => {
    const bad = await checkStrip(browser, server.url, () => {});
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // The Mac and iPad ladder card's HVPG and PPG brackets on every slide: a real line between the ticks, the label clear
  // of every drop line, reading, name and other bracket (Mac 1280x800 and upright iPad at 100% and 200% text here; run
  // checkLadderBrackets alone for every size).
  // (One check per size and text size, so the four walks of every slide share out over the runners: as one check they ran past
  // a share's time limit, and the checks after it in that share went unreported.)
  if (device === 'desktop') for (const size of [LADDER_SIZES[0], LADDER_SIZES[2]]) for (const z of [1, 2]) {
    await check(device, `presenter: ladder HVPG/PPG brackets draw a line and their labels clash with nothing (${size.name}, ${z * 100}% text)`, async () => {
      const bad = await checkLadderBrackets(browser, server.url, () => {}, [size], [z]);
      if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
    });
  }

  // A Mac or iPad ladder card too tall for its room even at its smallest steps folds its plot behind Show, its tiles keeping the
  // readings; shown, the plot takes the tiles' place. Folded or shown, every reading sits inside the card at 12 px or more, and
  // at 100% text the card never folds. (Treatment slide 2 at 200% on a 1440x900 Mac: the strip ran below the card's end.)
  if (device === 'desktop') await check(device, 'presenter: a ladder card too tall for its room folds whole, its readings inside it, never at 100% text, and a live text size lays out as a fresh load', async () => {
    const bad = [];
    const inside = () => {
      const dd = document.querySelector('.pz-data'), out = [];
      if (!dd || dd.hidden) return ['no numbers card'];
      const r = dd.getBoundingClientRect(), z = dd.offsetHeight ? r.height / dd.offsetHeight : 1;
      const shown = (e) => { for (let a = e; a && a !== dd; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
      const w = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const el = n.parentElement;
        if (!n.textContent.trim() || el.closest('.sr-only, [aria-hidden="true"]') || !shown(el)) continue;
        const g = document.createRange(); g.selectNodeContents(n);
        const q = [...g.getClientRects()].find((x) => x.width && x.height);
        if (!q) continue;
        const word = n.textContent.trim().slice(0, 20);
        if (q.left < r.left - 2 || q.right > r.right + 2 || q.top < r.top - 2 || q.bottom > r.bottom + 2) { out.push(`"${word}" outside the card (${Math.round(q.bottom)} vs ${Math.round(r.bottom)})`); break; }
        // (drawn size: the font's size times the card's own zoom, and an SVG's scale for the ladder's labels)
        const svg = el.closest('svg'), m = svg && svg.getScreenCTM && el.getScreenCTM ? el.getScreenCTM() : null;
        const px = parseFloat(getComputedStyle(el).fontSize) * (m ? Math.hypot(m.b, m.d) : z);
        // (the card's 12 px floor: its zoom stops at 11.5 px, a chart's lettering within 1% of that)
        if (px < 11.4) { out.push(`"${word}" drawn at ${px.toFixed(1)} px`); break; }
      }
      return out;
    };
    // (The cards' layout: the numbers card's classes, whether its ladder shows as the compact strip, and the boxes of both cards,
    // the words' title and the ladder.)
    const lay = () => {
      const dd = document.querySelector('.pz-data');
      // (the strip as the viewer sees it: a folded card's hidden ladder can carry either)
      const lad = dd.querySelector(':is(.pz-ladder,.pz-strip)'), seen = lad && lad.getBoundingClientRect().height > 0;
      const cls = `${[...dd.classList].filter((c) => c !== 'stage-blocker' && c !== 'strip').sort().join(' ')}${seen && (dd.querySelector('.strip') || dd.classList.contains('strip')) ? ' +strip' : ''}`;
      const box = {};
      for (const [n, q] of [['numbers card', '.pz-data'], ['words card', '.pz-text'], ['title', '.pz-text h1, .pz-text h2'], ['ladder', '.pz-data :is(.pz-ladder,.pz-strip)']]) {
        const e = document.querySelector(q), r = e?.getBoundingClientRect();
        box[n] = r && r.width ? [r.left, r.top, r.width, r.height].map(Math.round) : [0, 0, 0, 0];
      }
      return { cls, box };
    };
    // (Read once the cards have settled: the same layout twice, half a second apart, within 15 s.)
    const settled = async (pg) => { let was = ''; for (let t = 0; t < 30; t++) { const now = JSON.stringify(await pg.evaluate(lay)); if (now === was) return JSON.parse(now); was = now; await pg.waitForTimeout(500); } return JSON.parse(was); };
    const fresh = new Map(), live = new Map();
    for (const [w, h] of [[1440, 900], [1280, 800], [1180, 820]]) for (const k of [1, 2]) {
      const ctx = await fastContext(browser, { viewport: { width: w, height: h } });
      await ctx.addInitScript((k) => { localStorage.setItem('pps.labelScale', String(k)); localStorage.setItem('pps.labelScaleV', '2'); }, k);
      const page = await ctx.newPage();
      await gotoSlide(page, server.url, 'treatment', 1); await quiet(page);
      const at = `treatment slide 2 at ${w}x${h} ${k * 100}%`;
      fresh.set(`${w}x${h}:${k}`, await settled(page));
      const folds = await page.evaluate(() => document.querySelector('.pz-data')?.classList.contains('pz-folds'));
      if (k === 1 && folds) bad.push(`${at}: the card folded at 100% text`);
      for (const c of await page.evaluate(inside)) bad.push(`${at}${folds ? ', folded' : ''}: ${c}`);
      if (folds) {
        await page.click('.pz-data .pz-fold'); await quiet(page);
        fresh.set(`${w}x${h}:${k} shown`, await page.evaluate(lay));
        for (const c of await page.evaluate(inside)) bad.push(`${at}, shown: ${c}`);
        // (Text set back to 100% in Settings while the slide shows: the card lays out again and unfolds, as a fresh load does.)
        await page.evaluate(() => window.pps.stage.setLabelScale(1)); await quiet(page);
        if (await page.evaluate(() => document.querySelector('.pz-data')?.classList.contains('pz-folds'))) bad.push(`${at}: still folded after text went back to 100%`);
      }
      // (The other size set live in Settings on a newly loaded slide: compared below with a fresh load at that size.)
      await page.close();   // (one page at a time: a page left open in the background held the other's frames, and its cards never came in)
      const again = await ctx.newPage();
      await gotoSlide(again, server.url, 'treatment', 1); await quiet(again);
      await again.evaluate((k) => window.pps.stage.setLabelScale(k), 3 - k); await quiet(again);
      live.set(`${w}x${h}:${3 - k}`, await settled(again));
      if (await again.evaluate(() => document.querySelector('.pz-data')?.classList.contains('pz-folds'))) {
        await again.click('.pz-data .pz-fold'); await quiet(again);
        live.set(`${w}x${h}:${3 - k} shown`, await again.evaluate(lay));
      }
      await ctx.close();
    }
    // A live text-size change lays the cards out exactly as a fresh load at that size: the same plot or strip, fold, and boxes
    // within 2 px. (17507e3: switched from 200% to 100% the card kept the strip a fresh 100% load shows as the full plot.)
    for (const [key, got] of live) {
      const want = fresh.get(key), at = `treatment slide 2 at ${key.replace(/:(\d)/, ' $100%')} set live`;
      if (!want) { bad.push(`${at}: a fresh load did not fold`); continue; }
      if (got.cls !== want.cls) bad.push(`${at}: card "${got.cls}", a fresh load "${want.cls}"`);
      // (Opened by Show, the card eases to its height: its boxes differ by a few px from one load to the next, so only its parts are compared.)
      else if (!key.endsWith(' shown')) for (const n of Object.keys(want.box)) if (want.box[n].some((v, i) => Math.abs(v - got.box[n][i]) > 2)) bad.push(`${at}: ${n} at ${got.box[n]}, a fresh load ${want.box[n]}`);
    }
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // The phone pressure strip on every slide that has it: all its text at least 11 px as drawn, labels centred in their brackets, clear of every line.
  // (One check per deck: the whole sweep is 64 page loads and took 45 minutes in one piece, longer than a runner's limit.)
  if (device === 'desktop') for (const deck of new Set((await stripSlides()).map((s) => s.deck))) {
    const name = `presenter: ${deck}'s pressure strip keeps 11 px text and clear labels on every slide, at both phones`;
    STRIP_SLIDES.set(name, (await stripSlides(deck)).length);
    await check(device, name, async () => {
      const bad = await checkStripSlides(browser, server.url, () => {}, deck);
      if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
    });
  }

  // The strip's bar stops the same distance from every reading, one digit or two (within 1 px), at phones, an upright iPad and a desktop.
  if (device === 'desktop') await check(device, 'presenter: the pressure strip leaves equal gaps beside one- and two-digit readings, at every size', async () => {
    const bad = await checkStripGaps(browser, server.url, () => {});
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // Every slide of every deck at three phone widths, upright and sideways: the words clear of the controls pill, and every
  // reading in the numbers card (a folded instrument opened) inside the card. One check per deck, weighed by its slides.
  if (device === 'desktop') {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    for (const d of DECKS) {
      // (One check per deck upright and one sideways: in one piece a deck took up to 14 minutes on a runner.)
      for (const [way, sizes] of [['upright', PHONES.filter((s) => s.height > s.width)], ['sideways', PHONES.filter((s) => s.width > s.height)]]) {
        const name = `presenter: ${d.id}'s slides keep their words off the controls pill and readings inside their card, at phones ${way}`;
        STRIP_SLIDES.set(name, withOverview(d).slides.length * 0.15);
        await check(device, name, async () => {
          const bad = await checkPhoneFit(browser, server.url, d.id, withOverview(d).slides.length, () => {}, sizes);
          if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
        });
      }
    }
  }

  // A larger text size reads larger on a phone: Circulation 3 at 150 % keeps its words bigger on the screen than at 100 %, its
  // four colour buttons at a role size and no smaller on the screen, 8 px or more above the colour key, and the organ names the figure shows at 100 % (KIDNEY
  // had gone when the buttons grew and the card with them).
  if (device === 'desktop') await check(device, 'presenter: Circulation 3 at 150 % text keeps larger words, the colour key clear and the organ names, on a phone', async () => {
    const look = async (step) => {
      const ctx = await fastContext(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await ctx.addInitScript((s) => { try { localStorage.setItem('pps.labelScale', String(s)); localStorage.setItem('pps.labelScaleV', '2'); } catch { /* */ } }, step);
      const page = await ctx.newPage();
      await gotoSlide(page, server.url, 'encephalopathy', 5); await quiet(page); await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const t = document.querySelector('.pz-text'), a = t.querySelector('.pz-ab').getBoundingClientRect(), k = document.querySelector('.pz-fk').getBoundingClientRect();
        const names = [...document.querySelectorAll('#stageView g.lb text')].filter((x) => { const g = x.closest('g.lb'); return getComputedStyle(g).display !== 'none' && +getComputedStyle(g).opacity > 0.1; }).map((x) => x.textContent.trim()).filter((s) => /^[A-Z]+$/.test(s));
        const ab = t.querySelector('.pz-ab');
        return { words: parseFloat(getComputedStyle(t.querySelector('.pz-line')).fontSize) * (parseFloat(t.style.getPropertyValue('--pz-fit')) || 1), buttons: parseFloat(getComputedStyle(ab.firstElementChild).fontSize) * (parseFloat(getComputedStyle(ab).zoom) || 1), gap: k.top - a.bottom, names };
      });
      await ctx.close();
      return r;
    };
    const one = await look(1), big = await look(1.5), bad = [];
    if (!(big.words > one.words * 1.05)) bad.push(`words ${big.words.toFixed(1)} px at 150 %, ${one.words.toFixed(1)} px at 100 %`);
    for (const [s, r] of [['100', one], ['150', big]]) if (r.gap < 7.5) bad.push(`colour buttons ${r.gap.toFixed(1)} px above the key at ${s} %`);
    if (big.buttons < one.buttons - 0.3) bad.push(`colour buttons ${big.buttons.toFixed(1)} px at 150 %, ${one.buttons.toFixed(1)} px at 100 %`);
    if (!big.names.includes('KIDNEY')) bad.push(`KIDNEY gone at 150 % (shown: ${big.names.join(', ')})`);
    if (bad.length) throw new Error(bad.join('; '));
  });

  // Every choice in a slide's row of treatment buttons stays in view, whole, with no sideways scrolling, at 11 px or more
  // (a phone once cut Terlipressin off the right edge), at three phone widths, a phone on its side and an upright iPad.
  if (device === 'desktop') await check(device, 'presenter: every choice button on every slide fits on screen, at phones, sideways and iPad', async (page) => {
    const bad = [];
    // The slides with a row of choices are read from the decks, not probed for on screen: a probe with a time limit
    // read a slow runner's late-arriving words as "no row", and a sweep of every slide costs minutes besides.
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const found = ['circulation', 'circuit', 'recompensation', 'treatment', 'two-inflows'].flatMap((deck) =>
      withOverview(DECKS.find((d) => d.id === deck)).slides.flatMap((x, i) => (x.compare?.length ? [[deck, i + 1]] : [])));
    if (!found.length) throw new Error('no slide has a row of choices');
    for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(size);
      for (const [deck, n] of found) {
        // (the page is loaded once per size and the presenter moved on to each slide, not reloaded: 55 loads outran a CI runner)
        if (deck === found[0][0] && n === found[0][1]) await open(page, `?script=${deck}&slide=${n}`);
        else await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, n - 1]);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && document.querySelector('.pz-abb') && !document.querySelector('.pz-cover'), n, { timeout: 30000 });
        await page.waitForTimeout(900);
        const out = await page.evaluate(() => [...document.querySelectorAll('.pz-abb')].map((b) => {
          const r = b.getBoundingClientRect(), row = b.parentElement.getBoundingClientRect(), fs = parseFloat(getComputedStyle(b).fontSize);
          if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.left < row.left - 0.5 || r.right > row.right + 0.5) return `"${b.textContent}" is clipped`;
          if (b.scrollWidth > b.clientWidth + 1) return `"${b.textContent}" overflows its button`;
          if (fs < 11) return `"${b.textContent}" is ${fs}px`;
          return null;
        }).filter(Boolean).concat(document.querySelector('.pz-ab').scrollWidth > document.querySelector('.pz-ab').clientWidth + 1 ? ['the row scrolls sideways'] : [],
          new Set([...document.querySelectorAll('.pz-abb')].map((b) => Math.round(b.getBoundingClientRect().top))).size > 1 ? ['the buttons wrap to two rows'] : []));
        for (const o of out) bad.push(`${deck} ${n} at ${size.width}x${size.height}: ${o}`);
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join(' | '));
  });

  // A laptop, a sideways and an upright iPad show the phone's pill at the lower right (Mohammad): back, count, next, settings,
  // exit, always shown; no separate count, Quiz or ask-the-room button; clear of the words, the data card, a full card and the credit.
  if (device === 'desktop') await check(device, 'presenter: the controls are a lower-right pill on wide screens', async (page) => {
    const bad = [];
    for (const size of [{ width: 1440, height: 900 }, { width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
      await page.setViewportSize(size);
      for (const [deck, n] of [['circulation', 3], ['hvpg', 10], ['circulation', 12]]) {
        if (size.width === 1440 && n === 3) await open(page, `?script=${deck}&slide=${n}`);
        else await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, n - 1]);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !document.querySelector('.pz-cover, .pz-load.on'), n, { timeout: 60000 });
        await page.waitForTimeout(3500);   // (longer than the old bar's idle fade)
        // (An upright iPad has used the phone's layout since 1f25c95: the teaching card at the bottom holds the phone's pill (count,
        // settings, exit) at its lower right, and the words keep clear of it as on a phone: phone-fit.mjs judges them.)
        const upright = size.height > size.width;
        const out = await page.evaluate((upright) => {
          const o = [], bar = document.querySelector('.pz-bar'), b = bar.getBoundingClientRect();
          const vis = (el) => { if (!el || el.hidden || el.classList.contains('pz-hide')) return null; const st = getComputedStyle(el); if (st.display === 'none' || +st.opacity < 0.5) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
          if (+getComputedStyle(bar).opacity < 0.9) o.push('the pill hides');
          const kids = [...bar.children].map((c) => c.getAttribute('aria-label') || c.textContent.trim());
          if (document.querySelector('.pz-count')) o.push('a second count shows');
          if (upright) {
            const sh = document.querySelector('.pz.stack') && vis(document.querySelector('.pz-shade'));
            // (A slide with no words, a summary table, has no teaching card: the pill then keeps to the lower right of the column.)
            if (!sh) { if (b.left < innerWidth / 2 || innerHeight - b.bottom > 60) o.push(`the pill is not at the lower right (${Math.round(b.left)},${Math.round(b.top)})`); }
            else if (sh.right - b.right < 0 || sh.right - b.right > 30 || sh.bottom - b.bottom < 0 || sh.bottom - b.bottom > 30 || b.left < (sh.left + sh.right) / 2) o.push(`the pill is not at the teaching card's lower right (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)}; card ${sh ? [sh.left, sh.top, sh.right, sh.bottom].map(Math.round).join(',') : 'none'})`);
            if (kids.length !== 3 || !/^Slide \d+ of/.test(kids[0]) || kids[1] !== 'Settings') o.push(`the pill holds ${kids.join(', ')}`);
            return o;
          }
          // (One margin from the right and the bottom, the cards' own margin (--pz-cm, since a77f314: 37 px at 1440 wide), not a fixed 20 px.)
          const pr = document.createElement('div'); pr.style.cssText = 'position:absolute;visibility:hidden;width:var(--pz-cm)'; bar.parentElement.append(pr);
          const cm = pr.getBoundingClientRect().width; pr.remove();
          if (Math.abs(innerWidth - b.right - cm) > 2 || Math.abs(innerHeight - b.bottom - cm) > 2 || b.left < innerWidth / 2) o.push(`the pill is not at the lower right, one margin (${Math.round(cm)} px) in (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)})`);
          if (kids.length !== 5 || !/^Slide \d+ of/.test(kids[1]) || kids[3] !== 'Settings') o.push(`the pill holds ${kids.join(', ')}`);
          if (!['none', 'normal'].includes(getComputedStyle(bar, '::before').content) || [...bar.children][0].getBoundingClientRect().left - b.left > 4) o.push('a mark shows before the back button');   // (the app's status-pill dot once did)
          for (const s of ['.pz-text', '.pz-data', '.pz-panel', '.stage-credit']) { const q = vis(document.querySelector(s)), g = s === '.stage-credit' ? 4 : 0;
            if (q && Math.min(q.right, b.right) - Math.max(q.left, b.left) > -g && Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top) > -g) o.push(`the pill touches ${s}`); }
          return o;
        }, upright);
        if (upright) out.push(...await page.evaluate(fitIssues));
        for (const x of out) bad.push(`${deck} ${n} at ${size.width}x${size.height}: ${x}`);
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join(' | '));
  });

  // Figure labels and slide cards keep to the six-role type scale at every text size step, never under 11 px, units never
  // above their readings, on a phone, an upright iPad and a desktop (tests/e2e/type-scale.mjs). Run once, from the desktop run.
  // (One check per size: in one piece it took 22 minutes on a desktop runner.)
  if (device === 'desktop') for (const size of TYPE_SCALE_SIZES) await check(device, `type scale: figure and slide text on the six roles at every text size, ${size}`, async () => {
    const bad = await checkTypeScale(browser, server.url, () => {}, size);
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // Drawn slide charts letter from the same scale as drawn: never under 12 px, growing with the text size, no word over
  // another or out of its card, on every chart slide at three phones, an iPad and a desktop (tests/e2e/chart-type.mjs).
  // (One check for each deck and text size: the whole sweep is 35 slides at five sizes and two text sizes, some 78 minutes in one piece.)
  if (device === 'desktop') {
    const perDeck = new Map();
    for (const s of await chartTypeSlides()) perDeck.set(s.deck, (perDeck.get(s.deck) || 0) + 1);
    for (const [deck, count] of perDeck) for (const step of [1, 1.5, 2]) {
      const name = `chart type: ${deck}'s drawn slide charts on the type scale at ${step * 100} %`;
      CHART_SLIDES.set(name, count);
      await check(device, name, async () => {
        const bad = await checkChartText(browser, server.url, () => {}, { deck, step });
        if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
      });
    }
  }

  await check(device, 'presenter: summary table cells stay under their headings', async (page) => {
    // Each cell's contents sit inside its column heading's width, and no two cells overlap, at each size (the desktop run
    // also tries an upright iPad and an iPad on its side, small and large), and the table never scrolls sideways: a card
    // never scrolls (Mohammad, 25 Oct: the nine-column tables scrolled on an iPad on its side).
    // (A phone's control padding once pushed the names into the HVPG column.)
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }, { width: 1024, height: 768 }, { width: 1194, height: 834 }, { width: 1366, height: 1024 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const deck of ['circuit', 'hvpg', 'sites']) {   // (sites: the most columns)
        const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
        const at = withOverview(DECKS.find((d) => d.id === deck)).slides.findIndex((x) => x.visual === 'table') + 1;
        await open(page, `?script=${deck}&slide=${at}`);   // (the summary: the slide before the closing quick check)
        await page.waitForFunction(() => { const t = document.querySelector('.pz-table'); return t && t.querySelector('tbody tr') && !t.querySelector('td.pend'); });
        await page.waitForTimeout(600);
        const bad = await page.evaluate(() => {
          const t = document.querySelector('.pz-table'), out = [];
          // What a cell shows: its text and icons, not the words kept for screen readers.
          const box = (el) => {
            const rs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n; (n = w.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('.sr-only')) { const g = document.createRange(); g.selectNodeContents(n); rs.push(...g.getClientRects()); }
            for (const e of el.querySelectorAll('svg, i')) if (!e.closest('.sr-only')) rs.push(e.getBoundingClientRect());
            const v = rs.filter((r) => r.width && r.height);
            return v.length ? { left: Math.min(...v.map((r) => r.left)), right: Math.max(...v.map((r) => r.right)), top: Math.min(...v.map((r) => r.top)), bottom: Math.max(...v.map((r) => r.bottom)) } : null;
          };
          const heads = [...t.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect());
          // The column heads: inside their own column, and never smaller than 8 px (a phone's once were 7.5).
          for (const th of t.querySelectorAll('thead th')) {
            if (getComputedStyle(th).display === 'none') continue;
            const hb = th.getBoundingClientRect(), g = document.createRange(), fs = parseFloat(getComputedStyle(th).fontSize);
            g.selectNodeContents(th);
            if ([...g.getClientRects()].some((q) => q.width && (q.left < hb.left - 1 || q.right > hb.right + 1))) out.push(`head "${th.textContent.trim()}" runs outside its column`);
            if (fs < 8) out.push(`head "${th.textContent.trim()}" is ${fs}px`);
          }
          for (const tr of t.querySelectorAll('tbody tr')) {
            let k = 0; const seen = [];
            for (const c of tr.children) {
              const span = +(c.getAttribute('colspan') || 1), hs = heads.slice(k, k + span).filter((h) => h.width);
              k += span;
              if (c.matches('td.note') || !hs.length) continue;
              const b = box(c); if (!b) continue;
              const l = Math.min(...hs.map((h) => h.left)), r = Math.max(...hs.map((h) => h.right)), name = c.textContent.trim().slice(0, 20);
              if (b.left < l - 1 || b.right > r + 1) out.push(`"${name}" runs outside its column (${Math.round(b.left)}-${Math.round(b.right)} in ${Math.round(l)}-${Math.round(r)})`);
              for (const o of seen) if (b.left < o.b.right - 1 && o.b.left < b.right - 1 && b.top < o.b.bottom - 1 && o.b.top < b.bottom - 1) out.push(`"${name}" overlaps "${o.name}"`);
              seen.push({ b, name });
            }
          }
          if (!document.querySelector('.pz.stack') && t.scrollWidth > t.clientWidth + 1) out.push(`the table scrolls sideways (${t.scrollWidth} px of content in ${t.clientWidth})`);
          return out;
        });
        if (bad.length) throw new Error(`${deck}${size ? ` at ${size.width}x${size.height}` : ''}: ${bad.slice(0, 4).join('; ')}`);
      }
    }
  });

  await check(device, 'lobule: the sinusoid reading and its lesion pointer point at the middle of a sinusoid', async (page) => {
    // Each of the presenter's lobule framings (the whole lobule, a portal tract, the sinusoids, the central vein; every
    // lobule slide uses one of these) and Explore's lobule: where the sinusoid's reading or the "Block: sinusoids" pointer
    // is shown, the spot they name lies half way between the portal tract and the central vein (not at either end), and
    // the reading, the pointer and the corner credit keep clear of each other.
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const slides = [['lobule', 'lobule:fit'], ['sites', 'lobule:triad'], ['sites', 'lobule:sinusoid'], ['sites', 'lobule:central']]
      .map(([deck, cam]) => [deck, withOverview(DECKS.find((d) => d.id === deck)).slides.findIndex((x) => x.cam === cam)]);
    if (slides.some(([, i]) => i < 0)) throw new Error('a lobule framing is missing from its deck');
    const bad = [];
    const look = async (where) => {
      // Settled: the labels hold still across two looks a moment apart.
      const pos = () => page.evaluate(() => [...document.querySelectorAll('.lz-lab, .lz-call')].map((e) => e.style.left + e.style.top + e.style.transform).join());
      for (let prev = '', i = 0; i < 8; i++) { await page.waitForTimeout(400); const now = await pos(); if (now === prev) break; prev = now; }
      bad.push(...await page.evaluate((where) => {
        const out = [], a = window.pps.stage.lobuleSinAnchor();
        const shown = (e) => !!e && !e.hidden && !!e.offsetParent && +getComputedStyle(e).opacity > 0.5;
        const lab = [...document.querySelectorAll('.lz.on .lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid');
        const call = document.querySelector('.lz.on .lz-call.on'), sinCall = shown(call) && /sinusoid/i.test(call.textContent);
        if (!a || !(shown(lab) || sinCall)) return out;
        if (a.f < 0.3 || a.f > 0.7) out.push(`${where}: the sinusoid ${sinCall ? 'pointer' : 'reading'} names a spot ${Math.round(a.f * 100)}% of the way out from the central vein (want 30 to 70%)`);
        const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const hit = (p, q) => Math.min(p.r, q.r) - Math.max(p.l, q.l) > 1 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 1;
        const credit = document.querySelector('.stage-credit'), parts = [];
        if (shown(lab)) parts.push(['reading', box(lab)]);
        if (shown(call)) parts.push(['pointer', box(call)]);
        if (credit && +getComputedStyle(credit).opacity > 0.5) parts.push(['credit', box(credit)]);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hit(parts[i][1], parts[j][1])) out.push(`${where}: the sinusoid ${parts[i][0]} overlaps the ${parts[j][0]}`);
        return out;
      }, where));
    };
    await open(page);
    for (const [deck, i] of slides) {
      await page.evaluate(([deck, i]) => window.pps.presenter.start(deck, i), [deck, i]);
      await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover') && !document.querySelector('#app').className.includes('pz-hush')
        && window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
      await look(`${deck} slide ${i + 1}`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('presenting'), null, { timeout: 30000 });
    }
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 45000 });
    await look('explore lobule');
    if (bad.length) throw new Error(bad.slice(0, 6).join(' | '));
  });

  await check(device, 'presenter: lobule labels never touch, leaders never cross', async (page) => {
    // The slides that name several lobule structures at once, at each size: no two labels, pills included, come within
    // a few pixels of each other; no leader runs under another label or crosses another leader. The desktop run also
    // tries an iPad's portrait screen.
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const [deck, n] of [['circulation', 5], ['circulation', 6], ['two-inflows', 3], ['lobule', 5]]) {
        await open(page, `?script=${deck}&slide=${n}`);
        await page.waitForFunction(() => [...document.querySelectorAll('.lz.on:not(.lz-cam):not(.lz-sin) .lz-lab, .sv-region')].filter((e) => !e.hidden && e.offsetParent).length >= 2);
        // Settled: the labels hold still across two looks a moment apart.
        const where = () => page.evaluate(() => [...document.querySelectorAll('.lz-lab, .sv-region')].map((e) => e.style.left + e.style.top + e.style.transform).join());
        for (let prev = '', i = 0; i < 6; i++) { await page.waitForTimeout(400); const now = await where(); if (now === prev) break; prev = now; }
        const bad = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('.lz.on:not(.lz-cam):not(.lz-sin) :is(.lz-lab, .lz-zone, .lz-call.on), .sv-region')) {
            if (el.hidden || !el.offsetParent) continue;
            // (A name that is not lit on a presenter slide is drawn at no opacity: it cannot be seen to touch anything.)
            const lit = (document.querySelector('#app').dataset.lit || '').split(' ');
            if (el.matches('.lz-lab, .lz-zone') && lit.some((x) => x.startsWith('lobule:')) && !lit.includes(el.dataset.target)) continue;
            const b = el.getBoundingClientRect(), pill = getComputedStyle(el, '::before'), px = Math.max(0, -parseFloat(pill.left) || 0), py = Math.max(0, -parseFloat(pill.top) || 0);
            out.push({ n: el.textContent.trim().slice(0, 20), l: b.left - px, r: b.right + px, t: b.top - py, b: b.bottom + py });
          }
          const hits = [];
          for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
            const a = out[i], c = out[j], gap = Math.max(Math.max(a.l, c.l) - Math.min(a.r, c.r), Math.max(a.t, c.t) - Math.min(a.b, c.b));
            if (gap < 3) hits.push(`"${a.n}" and "${c.n}" (gap ${gap.toFixed(1)} px)`);
          }
          // Leaders on screen: each runs from the spot it names to the middle of its own label.
          const segs = [...document.querySelectorAll('.lz.on:not(.lz-cam) .lz-leaders line.leader')].filter((l) => l.style.display !== 'none' && !l.classList.contains('ld-gone')).map((l) => {
            const m = l.getScreenCTM(), at = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
            return { n: l.dataset.target, p: at(+l.getAttribute('x1'), +l.getAttribute('y1')), q: at(+l.getAttribute('x2'), +l.getAttribute('y2')) };
          });
          const inside = ([x, y], b) => x >= b.l - 1 && x <= b.r + 1 && y >= b.t - 1 && y <= b.b + 1;
          const under = (p, q, b) => {
            let t0 = 0, t1 = 1;
            for (const [d, lo, hi, o] of [[q[0] - p[0], b.l, b.r, p[0]], [q[1] - p[1], b.t, b.b, p[1]]]) {
              if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
              let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
              t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
            }
            return t1 - t0 > 0.02;
          };
          const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
          for (const s of segs) for (const b of out) if (!inside(s.p, b) && !inside(s.q, b) && under(s.p, s.q, b)) hits.push(`the ${s.n} leader runs under "${b.n}"`);
          for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
            const a = segs[i], c = segs[j];
            if (side(a.p, a.q, c.p) * side(a.p, a.q, c.q) < 0 && side(c.p, c.q, a.p) * side(c.p, c.q, a.q) < 0) hits.push(`the ${a.n} and ${c.n} leaders cross`);
          }
          return hits;
        });
        if (bad.length) throw new Error(`${deck} slide ${n} at ${page.viewportSize().width}px: ${bad.join('; ')}`);
      }
    }
  });

  await check(device, 'presenter lobule: the zone names and the lesion pill hold steady while the values ease', async (page) => {
    // Congestion slide: the central vein's value eases in, so the labels are laid out again and again. The zone names
    // used to be re-made on each pass (their lit pill flashed); the pill and its leader used to be free to change side.
    await open(page, '?script=lobule&slide=7');
    await page.waitForFunction(() => document.querySelector('.lz-call.on') && document.querySelector('.lz-zone.z3'), null, { timeout: 60000 });
    const rows = await page.evaluate(async () => {
      for (const z of document.querySelectorAll('.lz-zone')) z.dataset.mark = '1';
      const op = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
      const out = [], t0 = performance.now();
      await new Promise((done) => {
        const f = () => {
          const call = document.querySelector('.lz-call'), line = document.querySelector('.lz-call-l'), z3 = document.querySelector('.lz-zone.z3'), b = call.getBoundingClientRect();
          out.push({ t: performance.now() - t0, fresh: [...document.querySelectorAll('.lz-zone')].filter((z) => !z.dataset.mark).length, zones: document.querySelectorAll('.lz-zone').length,
            call: [b.left, b.top], callO: op(call), line: [line.getAttribute('x2'), line.getAttribute('y2')].join(), lineO: op(line), pill: z3 ? op(z3) * +getComputedStyle(z3, '::before').opacity : 0 });
          if (performance.now() - t0 < 6000) requestAnimationFrame(f); else done();
        };
        f();
      });
      return out;
    });
    if (rows.some((r) => r.fresh || r.zones !== 3)) throw new Error('the zone names were re-made while the slide was open');
    const rest = rows.filter((r) => r.t > 3500);
    for (const k of ['callO', 'lineO', 'pill']) if (rest.some((r) => r[k] < 0.9)) throw new Error(`${k} dipped to ${Math.min(...rest.map((r) => r[k])).toFixed(2)} after it had come in`);
    const still = (f) => rest.every((r) => Math.hypot(f(r)[0] - f(rest[0])[0], f(r)[1] - f(rest[0])[1]) < 1.5);
    if (!still((r) => r.call)) throw new Error('the lesion pill moved after it had settled');
    if (!still((r) => r.line.split(',').map(Number))) throw new Error('the lesion leader moved after it had settled');
  });

  await check(device, 'presenter lobule: the lesion leader stops at the ring\'s edge and no label sits on the ring', async (page) => {
    for (const slide of [7, 3]) {
      await open(page, `?script=lobule&slide=${slide}`);
      await page.waitForFunction(() => document.querySelector('.lz-call.on') && window.pps.stage.lobuleSettled(), null, { timeout: 60000 }).catch(() => null);
      const r = await page.evaluate(() => {
        const call = document.querySelector('.lz-call.on'), ring = document.querySelector('.lz-call-r.on'), line = document.querySelector('.lz-call-l.on');
        if (!call || !ring || !line) return null;
        const cx = +ring.getAttribute('cx'), cy = +ring.getAttribute('cy'), rr = +ring.getAttribute('r'), host = ring.ownerSVGElement.getBoundingClientRect();
        const start = Math.hypot(+line.getAttribute('x1') - cx, +line.getAttribute('y1') - cy);
        const near = (b) => Math.hypot(Math.max(b.left - host.left - cx, 0, cx - (b.right - host.left)), Math.max(b.top - host.top - cy, 0, cy - (b.bottom - host.top)));
        const boxes = [...document.querySelectorAll('.lz-lab, .lz-call, .lz-zone')].filter((e) => e.offsetWidth && !e.hidden && !e.classList.contains('lz-off') && +getComputedStyle(e).opacity > 0.5);
        return { rr, start, closest: Math.min(...boxes.map((e) => near(e.getBoundingClientRect()))) };
      });
      if (!r) continue;
      if (Math.abs(r.start - r.rr) > 1) throw new Error(`slide ${slide}: the leader starts ${r.start.toFixed(1)}px from the ring's centre, ring radius ${r.rr.toFixed(1)}px`);
      if (r.closest < r.rr + 2) throw new Error(`slide ${slide}: a label reaches within ${r.closest.toFixed(1)}px of the ring's centre (radius ${r.rr.toFixed(1)}px)`);
    }
  });

  await check(device, 'moving blood on the GPU: menu, origin, dye, reversal', async (page) => {
    await open(page, '?preset=cirr-hepatofugal');
    const kind = await page.evaluate(() => document.querySelector('#stageView').dataset.veins);
    if (kind !== 'webgl2') throw new Error(`expected the GPU figure, got ${kind}`);
    await page.waitForFunction(() => window.pps.stage.flowDir('PV_TRUNK')?.vd != null);
    // Hepatofugal: the portal vein's stream runs backward (to → from), with the model's flow.
    // (The display eases into a reversal over a couple of seconds.)
    await page.waitForFunction(() => { const r = window.pps.stage.flowDir('PV_TRUNK'); return r.q < 0 && r.vd < 0; }, null, { timeout: 60000 })
      .catch(async () => { throw new Error(`portal stream not reversed: ${JSON.stringify(await page.evaluate(() => window.pps.stage.flowDir('PV_TRUNK')))}`); });
    // Pause holds the stream still.
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => window.pps.store.get().running === false);
    await page.waitForTimeout(150);
    const d0 = await page.evaluate(() => window.pps.stage.flowDir('PV_TRUNK').D);
    await page.waitForTimeout(400);
    if (await page.evaluate(() => window.pps.stage.flowDir('PV_TRUNK').D) !== d0) throw new Error('paused blood kept moving');
    // The Blood menu (streaks, chevrons; what the figure shows), the Blood origin lens, dye.
    const fits = await page.evaluate(() => { const el = document.querySelector('#app.thumb #thumbBar [data-tab="layers"]') || document.querySelector('#btnBlood'), r = el.getBoundingClientRect(); return r.width >= 30 && r.left >= 0 && r.right <= innerWidth; });
    if (!fits) throw new Error('Blood button is clipped');
    await tapTool(page, '#btnBlood');
    const opts = await page.$$eval('.blood-pop .lens-opt .lens-t', (els) => els.map((e) => e.textContent));
    if (opts.join('|') !== 'Streaks|Chevrons|Key chevrons only|Pressure values|Potential collaterals|Organ names') throw new Error(`the Blood menu offers ${opts.join(', ')}`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.pps.store.set({ colorMode: 'origin', blood: { look: 'shimmer', chevrons: true } }));
    await page.waitForFunction(() => /Splenic vein|SV/.test(document.querySelector('#legend').textContent));
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await page.keyboard.press('j');
    if (!(await page.evaluate(() => window.pps.stage.dyeActive()))) throw new Error('J did not inject dye');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(900);
    if (!(await page.evaluate(() => document.querySelector('#stageView').classList.contains('gl-on')))) throw new Error('the circuit is not drawn on the GPU');
    await shot(page, `${device}-blood-circuit`);
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic', colorMode: 'pressure', blood: { look: 'shimmer', chevrons: false } }));
    await page.waitForTimeout(900);
    await shot(page, `${device}-blood`);
  });

  await check(device, 'vessels and plate on the GPU', async (page) => {
    await open(page, '?preset=cirr-decomp');
    const kind = await page.evaluate(() => document.querySelector('#stageView').dataset.veins);
    if (kind !== 'webgl2') throw new Error(`expected the WebGL2 veins, got ${kind}`);
    const on = (cls) => page.waitForFunction((c) => document.querySelector('#stageView').classList.contains(c), cls);
    await on('gl-on');
    await on('gl-plate');   // the organs, rasterized for the GPU
    if (await page.evaluate(() => window.pps.stage.organAt(560, 350)) !== 'liver') throw new Error('organs cannot be picked under the GPU plate');
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' }, colorMode: 'heat' }));
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(700);
    if (!(await page.evaluate(() => document.querySelector('#stageView').classList.contains('gl-on')))) throw new Error('the circuit left the GPU');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic', selection: null, colorMode: 'pressure' }));
    await on('gl-on');
    await shot(page, `${device}-veins-gl`);
  });

  await check(device, 'a presenter dive lands on its station in one move, with no other station labelled', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // Every frame the lobule's labels show, note the framing: they may show only at the slide's final framing.
    const watch = () => page.evaluate(() => {
      window.__lzSeen = []; window.__lzWatch = true;
      const tick = () => {
        const lz = document.querySelector('.lz'), lab = lz?.querySelector('.lz-labels');
        if (lz?.classList.contains('on') && !lz.classList.contains('lz-cam') && lab && +getComputedStyle(lab).opacity > 0.05) window.__lzSeen.push(window.pps.stage.lobuleViewKey());
        if (window.__lzWatch) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const settle = async () => { await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 }); await page.waitForTimeout(2200); };
    const verify = async (what) => {
      const { seen, end } = await page.evaluate(() => { window.__lzWatch = false; return { seen: window.__lzSeen, end: window.pps.stage.lobuleViewKey() }; });
      const other = [...new Set(seen)].filter((k) => k !== end);
      if (other.length) throw new Error(`${what}: labels showed at ${other.length} other framing(s) before the station (${other[0]} vs ${end})`);
    };
    // Straight from the anatomy to a portal tract.
    await watch();
    await page.evaluate(() => { window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); window.pps.store.set({ lobule: true }); });
    // As the presenter does once the dive lands: the slide's focus, which should have nothing left to do.
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 });
    await page.evaluate(() => window.pps.stage.lobuleFocus('triad', { zoom: 2.3, ms: 900 }));
    await settle();
    await verify('dive to the portal tract');
    // Out, then in again with a newer slide (the central vein) arriving mid-dive.
    await page.evaluate(() => window.pps.store.set({ lobule: false }));
    await page.waitForFunction(() => !window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 });
    await watch();
    await page.evaluate(() => { window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); window.pps.store.set({ lobule: true }); });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.pps.stage.lobuleAim('central', { zoom: 2.3 }));
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 30000 });
    await page.evaluate(() => window.pps.stage.lobuleFocus('central', { zoom: 2.3, ms: 900 }));
    await settle();
    await verify('a newer station mid-dive');
  });

  await check(device, 'liver lobule: GPU vessels, pressure drops, caption, cards, zones', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // The lobule is a view of its own, beside Anatomy and Circuit.
    await pickView(page, 'lobule');
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
    if (await page.getAttribute('#viewSeg [data-view="lobule"]', 'aria-pressed') !== 'true') throw new Error('the Lobule button is not shown as the current view');
    await page.waitForTimeout(900);
    const kind = await page.evaluate(() => document.querySelector('.lz').dataset.vessels);
    if (kind !== 'webgl2') throw new Error(`expected the lobule's vessels on the GPU, got ${kind}`);
    // The vessel layer actually holds a picture.
    const vesselPixels = () => {
      const g = document.querySelector('.lz-gl'), c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      const x = c.getContext('2d');
      x.drawImage(g, 0, 0, 160, 100);
      const d = x.getImageData(0, 0, 160, 100).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    };
    // Read the GPU canvas a few times: a copy taken between two presented frames can come back blank on a slow runner.
    let lit = 0;
    for (let i = 0; i < 12 && lit < 300; i++) { if (i) await page.waitForTimeout(500); lit = await page.evaluate(vesselPixels); }
    if (lit < 300) throw new Error(`the lobule's vessel layer is nearly empty (${lit} px)`);
    // The four stations carry cards; the arteriole and ductule labels exist but stay hidden until a slide's term names them.
    const stations = await page.evaluate(() => [...document.querySelectorAll('.lz-lab')].map((l) => `${l.dataset.target}${l.hidden || l.classList.contains('lz-off') ? ':hidden' : ''}`).sort().join());
    // (The Lymph label may be left out, never stacked, but only where no clear spot lies within a short leader of its node.)
    const full = 'lobule:arteriole:hidden,lobule:central,lobule:ductule:hidden,lobule:lymph,lobule:sinusoid,lobule:triad';
    if (stations !== full && stations !== full.replace('lobule:lymph,', 'lobule:lymph:hidden,')) throw new Error(`station cards missing (${stations})`);
    const room = await stationRoom(page);
    if (room.length) throw new Error(room.join('; '));
    // The card is gone: nothing floats beside the lobule but its labels.
    if (await page.locator('.lz-side').count()) throw new Error('the lobule still has its card');
    // The strip reads the lobule's two flows here, as the anatomy's reads HVPG and PPG (the slim bar, 88e0a8d: arterial inflow and
    // lymph are in Tests > Readouts).
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#strip .metric.primary')].filter((e) => e.offsetWidth).map((e) => e.dataset.id).join());
    if (tiles !== 'lz-sin,lz-pv') throw new Error(`the strip should show the lobule's flows, got ${tiles}`);
    // A part of the lobule opens the same action card as the anatomy, with its fibrosis slider.
    await page.locator('.lz-lab').nth(1).evaluate((el) => el.click());   // its value updates live, so it never holds still for a pointer click
    await page.waitForSelector('.action-card:not([hidden])');
    const cardText = await page.locator('.action-card').innerText();
    if (!cardText.includes('Sinusoid')) throw new Error('the sinusoid card did not open');
    if (!(await page.locator('.action-card input[aria-label^="Fibrosis"]').count())) throw new Error('no fibrosis slider on the sinusoid card');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.action-card', { state: 'hidden' });
    // Framed in the free space: the lobule's bottom corner is above the vitals dock (every readout is in Tests > Readouts).
    {
      const clear = await page.waitForFunction(() => {
        const dock = document.querySelector('#vdock').getBoundingClientRect().top, labs = [...document.querySelectorAll('.lz-lab:not([hidden], .lz-off)')];
        return labs.every((l) => l.getBoundingClientRect().bottom <= dock + 1);
      }, null, { timeout: 15000 }).then(() => true, () => false);
      if (!clear) throw new Error('a lobule label sits under the dock');
    }
    // The zoom buttons work in the lobule: in, out, and Fit back to the framing.
    if (device === 'desktop') {
      const zk = () => page.evaluate(() => window.pps.stage.lobuleViewKey?.());
      // The framing glides when the free space changes: start from where it settles.
      // Settled means three readings in a row agree (a busy machine can pause a glide between two).
      // Fit first: the vitals dock's caption line can arrive after the opening framing was set.
      await page.click('#zoomFit');
      let k0 = await zk(), same = 0;
      for (let i = 0; i < 30 && same < 2; i++) { await page.waitForTimeout(700); const k = await zk(); same = k === k0 ? same + 1 : 0; k0 = k; }
      await page.click('#zoomIn');
      await page.waitForFunction((k0) => window.pps.stage.lobuleViewKey() !== k0, k0, { timeout: 15000 }).catch((e) => { throw new Error('zoom in does nothing in the lobule', { cause: e }); });
      await page.click('#zoomFit');
      await page.waitForFunction((k0) => window.pps.stage.lobuleViewKey() === k0, k0, { timeout: 15000 }).catch((e) => { throw new Error('Fit does not return the lobule to its framing', { cause: e }); });
    }
    // Zooming in stays in the lobule.
    const box = await page.locator('.lz').boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    if (device === 'desktop') { await page.mouse.wheel(0, -400); await page.waitForTimeout(300); }
    if (!(await page.evaluate(() => window.pps.stage.lobuleOpen()))) throw new Error('zooming in left the lobule');
    // Zooming out never leaves the lobule view.
    if (device === 'desktop') { for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 600); await page.waitForTimeout(600); }
    if (!(await page.evaluate(() => window.pps.stage.lobuleOpen()))) throw new Error('zooming out left the lobule');
    // Zones and Lymph are in the toolbar's Layers menu, which is there only on the lobule.
    // Lymph starts on, so this switches it off and back on: turning it on with a settled, paused
    // model must initialize its radii; otherwise invalid reaches empty the geometry bins and erase the vessel layer.
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => !window.pps.store.get().running);
    await page.waitForTimeout(1500);
    await tapTool(page, '#btnLobuleLayers');
    await page.click('.menu .lens-opt:has-text("Zones")');
    await page.waitForFunction(() => document.querySelectorAll('.lz-zone').length === 3, null, { timeout: 5000 }).catch((e) => { throw new Error('zones did not show', { cause: e }); });
    await page.click('.menu .lens-opt:has-text("Lymph")');
    await page.click('.menu .lens-opt:has-text("Lymph")');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const lymphLit = await page.evaluate(vesselPixels);
    if (lymphLit < 300) throw new Error(`enabling lymph while paused erased the vessel layer (${lymphLit} px)`);
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await shot(page, `${device}-lobule`);
    // Leaving the lobule closes its card.
    await page.evaluate(() => document.querySelector('.lz-lab:not([hidden], .lz-off)').click());   // its value updates live, so it never holds still for a pointer click
    await page.waitForSelector('.action-card:not([hidden])');
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'))) {
      // A phone's docked card hides the view pill under it (the play bar steps aside), so its user pulls the card away first,
      // then taps the pill once it shows again.
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await page.waitForFunction(() => !document.querySelector('.action-card').getAnimations().length);
      const [x, y] = await page.evaluate(() => { const r = document.querySelector('.action-card .ac-top').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 16]; });
      await touch('touchStart', x, y);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', x, y + 160 * i / 12); await page.waitForTimeout(25); }
      await page.waitForTimeout(100);
      await touch('touchEnd');
      await page.waitForFunction(() => document.querySelector('.action-card').hidden, null, { timeout: 10000 })
        .catch((e) => { throw new Error('a pull down did not put the lobule card away', { cause: e }); });
      await page.waitForFunction(() => +getComputedStyle(document.querySelector('#nbViews')).opacity === 1, null, { timeout: 10000 })
        .catch((e) => { throw new Error('the view pill did not come back once the card was away', { cause: e }); });
      await page.click('#viewSeg [data-view="anatomic"]');   // (a real tap: it fails if anything else takes it)
    } else await pickView(page, 'anatomic');   // (a Mac or iPad: the switch stays in reach with the card open)
    await page.waitForFunction(() => !window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
    if (await page.evaluate(() => window.pps.store.get().selection?.type === 'lobule')) throw new Error('the lobule card stayed open after leaving');
  });

  await check(device, 'floating layout: figure fills the screen, Treat card, its changes, advanced physiology in Settings', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    const fill = await page.evaluate(() => { const r = document.querySelector('#stageView').getBoundingClientRect(); return (r.width * r.height) / (innerWidth * innerHeight); });
    if (fill < 0.97) throw new Error(`the figure covers only ${Math.round(fill * 100)} % of the screen`);
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('panel-open'))) throw new Error('the side panel should start closed');
    // No Patient button and no abnormal-results list: the top bar is Treat, Tests, Settings and Search.
    if (await page.$('#btnInspector, #findBadge, #panel .finding')) throw new Error('the Patient button or its abnormal results are back');
    await tapTool(page, '#btnTreat');
    await page.waitForSelector('#treatCard:not([hidden]) .order-chip');
    await page.locator('#treatCard .order-chip', { hasText: 'Carvedilol' }).click();
    await page.waitForFunction(() => window.pps.store.get().params.drugs.carvedilol);
    // The changes sit closed under the orders; opened, they list the new order with its undo.
    if (await page.$eval('#treatCard .tc-body > .section[data-id="changes"]', (d) => d.open)) throw new Error('Changes should start closed in the Treat card');
    await page.click('#treatCard .section[data-id="changes"] > summary');
    await page.waitForFunction(() => [...document.querySelectorAll('#treatCard .chg .chg-n')].some((e) => e.textContent.includes('Carvedilol')), null, { timeout: 5000 })
      .catch((e) => { throw new Error('the Treat card does not list Carvedilol under Changes', { cause: e }); });
    await shot(page, `${device}-treat`);
    // A card is put away as its user would: Escape on a Mac or iPad, a pull down on the card's head on a phone (no X there since
    // da7516d; the thumb dock's gesture).
    const thumb = await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'));
    const pullAway = async (sel) => {
      await page.waitForFunction((sel) => !document.querySelector(sel).getAnimations().length, sel);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const [x, y] = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + 16]; }, sel);
      await touch('touchStart', x, y);
      for (let i = 1; i <= 20; i++) { await touch('touchMove', x, y + 320 * i / 20); await page.waitForTimeout(25); }
      await page.waitForTimeout(150);
      await touch('touchEnd');
    };
    if (thumb) await pullAway('#treatCard'); else await page.keyboard.press('Escape');
    await page.waitForSelector('#treatCard', { state: 'hidden', timeout: 10000 });
    // Advanced physiology: in Settings; it opens in the side panel.
    await tapTool(page, '#btnSettings');
    await page.locator('.menu-item', { hasText: 'Advanced physiology' }).click();
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('panel-open') && document.querySelector('#panelTitle').textContent.includes('Advanced physiology'));
    if (!(await page.$('#panel .adv-body input[type="range"]'))) throw new Error('advanced physiology has no controls');
    if (thumb) await pullAway('#panel'); else await page.click('#panelClose');
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('panel-open'), null, { timeout: 5000 })
      .catch((e) => { throw new Error('the side panel does not close', { cause: e }); });
  });
  // The slim play line (15 Oct, option 2): play, speed, clock and jump, then the two key readings as plain numbers on the
  // same row, with no bars or rating words, all inside the bar and not overlapping, on a narrow and a tall phone, a Mac and
  // an iPad held sideways, in the anatomy and the lobule (whose readings are longer).
  await check(device, 'slim play line: one row, the readings as plain numbers, nothing clipped or overlapping', async (page) => {
    for (const [w, ht] of device === 'phone' ? [[375, 667], [390, 844]] : [[1024, 768], [1280, 800], [1440, 900], [1728, 1117], [1180, 820]]) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      for (const lob of [false, true]) {
        if (lob) { await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click()); await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 }); }
        await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const bar = document.querySelector('#stageBottom').getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect();
          const tiles = [...document.querySelectorAll('#strip .metric')].filter((m) => m.offsetParent);
          const parts = [...document.querySelectorAll('#timeline > *, #timeline .tl-left, #strip .metric :is(.k, .val, .unit, .tr)')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden');
          const boxes = parts.map((e) => ({ q: e.className, ...e.getBoundingClientRect().toJSON() }));
          const flat = boxes.filter((b) => !/tl-left/.test(b.q)).sort((a, b) => a.left - b.left);
          const lap = flat.find((b, i) => flat.slice(0, i).some((a) => b.left < a.right - 0.5 && b.top < a.bottom - 0.5 && a.top < b.bottom - 0.5));   // (overlapping both ways: a name over its number shares its column, not its line)
          return { n: tiles.length, bars: tiles.some((m) => m.querySelector('.rb')?.offsetParent || m.querySelector('.s')?.offsetParent),
            out: boxes.filter((b) => b.left < d.left - 0.5 || b.right > d.right + 0.5 || b.right > innerWidth).map((b) => b.q),
            off: boxes.filter((b) => b.top < bar.top - 2 || b.bottom > bar.bottom + 2).map((b) => b.q), lap: lap ? lap.q : '',
            dockH: d.height, tileH: Math.max(...tiles.map((m) => m.getBoundingClientRect().height)),
            gap: Math.max(0, ...flat.map((b, i) => (i ? b.left - Math.max(...flat.slice(0, i).map((x) => x.right)) : 0))) };
        });
        const at = `${w}x${ht}${lob ? ' lobule' : ''}`;
        if (r.n < 2) throw new Error(`${at}: the play line shows ${r.n} readings, not two`);
        if (r.bars) throw new Error(`${at}: the readings still have bars or rating words`);
        if (r.out.length) throw new Error(`${at}: outside the bar or the screen: ${r.out.join(', ')}`);
        if (r.off.length) throw new Error(`${at}: not on the play line's row: ${r.off.join(', ')}`);
        if (r.lap) throw new Error(`${at}: ${r.lap} overlaps its neighbour on the play line`);
        // On a Mac or an iPad held sideways the bar is the play line alone: one row about the play button's height (not the
        // three-line label, number, bar and rating it was), with no dead space between its parts (15 Oct, Mohammad: "can definitely be slimmer").
        if (device !== 'phone') {
          if (r.dockH > 60) throw new Error(`${at}: the bar is ${Math.round(r.dockH)} px tall, more than one slim row`);
          if (r.tileH > 40) throw new Error(`${at}: a reading is ${Math.round(r.tileH)} px tall, more than one line`);
          if (r.gap > 40) throw new Error(`${at}: a ${Math.round(r.gap)} px gap inside the bar`);
        }
      }
    }
  });
  // The view switch is one tap away on every screen (15 Oct, Mohammad: "it should remain outside and accessible", then "put it
  // down below"; 16 Oct: "detached from the timeline ... slightly above it as a pill and centered"): a centred pill just above
  // the play bar (in the sinusoid view centred at the bottom); in every view, and still with Treat or Tests open on the thumb dock.
  // Each view is reached by one tap on its button's centre, which must be on screen, at least 32 px tall and not under anything.
  await check(device, 'view switch: one tap from every view on every screen, with a card open too', async (page) => {
    const sizes = device === 'phone' ? [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375]] : [[768, 1024], [820, 1180], [1024, 1366], [1180, 820], [1024, 768], [1440, 900], [1920, 1080]];
    const want = (v) => (st) => (v === 'sinusoid' ? st.lobule && st.sinusoid : v === 'lobule' ? st.lobule && !st.sinusoid : !st.lobule && st.view === v);
    const tapView = async (v, at) => {
      // (A person taps once the bar holds still: wait until its glides have ended and the button stays put for a moment.)
      await page.waitForFunction((v) => { const tb = document.querySelector('#topbar');
        if (document.getAnimations().some((a) => a.playState === 'running' && tb.contains(a.effect?.target))) { window.__vsAt = ''; return false; }
        const q = document.querySelector(`#viewSeg [data-view="${v}"]`).getBoundingClientRect(), k = `${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.width)},${Math.round(q.height)}`, w = window;
        if (w.__vsAt !== k) { w.__vsAt = k; w.__vsSince = performance.now(); } return performance.now() - w.__vsSince > 350; }, v, { timeout: 15000, polling: 50 }).catch(() => {});
      const r = await page.evaluate((v) => {
        const b = document.querySelector(`#viewSeg [data-view="${v}"]`), q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, h: q.height, why: `css ${getComputedStyle(b).height}, bar ${document.querySelector('#topbar').className} fit ${document.querySelector('#topbar').dataset.fit}, app ${document.querySelector('#app').className}`, shown: !!b.offsetParent, home: (() => { const a = document.querySelector('#app'), q = a.classList.contains('presenting') ? '#topbar' : a.classList.contains('sin-focus') ? '#sinViews' : '#nbViews'; return [q, document.querySelector(q).contains(b)]; })(), on: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight, free: !!hit && b.contains(hit), over: hit ? `${hit.tagName}#${hit.id}.${hit.getAttribute('class')}` : 'nothing' };
      }, v);
      if (!r.shown || !r.home[1]) throw new Error(`${at}: the ${v} button is not shown in ${r.home[0]}`);
      if (!r.on) throw new Error(`${at}: the ${v} button is off the screen`);
      if (r.h < 28) throw new Error(`${at}: the ${v} button is ${Math.round(r.h)} px tall (${r.why})`);
      if (!r.free) throw new Error(`${at}: the ${v} button is under ${r.over}`);
      if (device === 'phone') await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y);
      await page.waitForFunction((v) => { const st = window.pps.store.get(); return v === 'sinusoid' ? st.lobule && st.sinusoid : v === 'lobule' ? st.lobule && !st.sinusoid : !st.lobule && st.view === v; }, v, { timeout: 30000 })
        .catch(() => { throw new Error(`${at}: one tap on ${v} did not switch to it`); });
      await page.waitForTimeout(400);
    };
    for (const [w, ht] of sizes) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });   // (the start-up cover lifts)
      await page.waitForTimeout(600);
      const at = `${w}x${ht}`;
      await tapView('circuit', `${at} anatomy`);
      await tapView('anatomic', `${at} circuit`);
      await tapView('lobule', `${at} anatomy`);
      if (await page.evaluate(() => !document.querySelector('#viewSeg [data-view="sinusoid"]').hidden)) {
        await tapView('sinusoid', `${at} lobule`);
        await tapView('lobule', `${at} sinusoid`);
      }
      await tapView('anatomic', `${at} lobule`);
      if (!want('anatomic')(await page.evaluate(() => window.pps.store.get()))) throw new Error(`${at}: not back in the anatomy`);
      // On the thumb dock the switch is the dock's first line: a card open above the tab row (Treat, then Tests pulled to full)
      // covers it as it covers the play row (it fades, and takes no tap); once the card is put away it is one tap again.
      if (await page.evaluate(() => document.querySelector('#app').classList.contains('thumb'))) {
        for (const tab of ['treat', 'tests']) {
          await page.click(`#thumbBar [data-tab="${tab}"]`);
          await page.waitForTimeout(900);
          if (tab === 'tests') await page.evaluate(() => { const d = document.querySelector('#dock'); if (d.dataset.state !== 'full') document.querySelector('#dock .sheet-grab')?.click(); });
          await page.waitForTimeout(600);
          // (a busy machine can still be fading the play bar's half out: give it up to 3 s to finish)
          await page.waitForFunction(() => +getComputedStyle(document.querySelector('#nbViews')).opacity <= 0.05, null, { timeout: 3000, polling: 50 }).catch(() => {});
          const shows = await page.evaluate(() => { const b = document.querySelector('#viewSeg [data-view="circuit"]'), q = b.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
            return +getComputedStyle(document.querySelector('#nbViews')).opacity > 0.05 || (!!hit && b.contains(hit)); });
          if (shows) throw new Error(`${at}: the view switch shows over the open ${tab} card`);
          await page.click(`#thumbBar [data-tab="${tab}"]`);
          await page.waitForTimeout(700);
          await tapView('circuit', `${at} ${tab} put away`);
          await tapView('anatomic', `${at} ${tab} put away`);
        }
      }
    }
  });
  // The view switch is its own pill, centred on the screen 8 px above the play bar on every screen, Mac and phone held sideways
  // included (16 Oct, Mohammad: "detached from the timeline button slightly above it as a pill and centered"); in the sinusoid
  // view the same pill sits centred at the bottom, level with the zoom group and clear of it; every label 12 px or more, whole.
  // The figure's readings end 8 px or more above the pill; the sinusoid view keeps the key's whole card in the top bar (it had
  // shrunk to a 4 px sliver, its scale spilling under History); on a Mac with Tests open the zoom group keeps clear of the pill.
  await check(device, 'view switch: a centred pill 8 px above the play bar; in the sinusoid view centred and clear of the zoom group', async (page) => {
    const sizes = device === 'phone' ? [[320, 568], [390, 844], [844, 390]] : [[820, 1180], [1180, 820], [1440, 900]];
    const look = (sin) => page.evaluate((sin) => {
      const out = [], r = (e) => e.getBoundingClientRect(), pill = document.querySelector(sin ? '#sinViews' : '#nbViews'), p = r(pill);
      if (!pill.contains(document.querySelector('#viewSeg'))) return ['the switch is not in its pill'];
      // (centred on the play bar, which is centred on the screen everywhere but a phone held sideways, where it starts at the left)
      const bar = r(document.querySelector('#vdock')), mid = sin ? innerWidth / 2 : (bar.left + bar.right) / 2;
      if (Math.abs((p.left + p.right) / 2 - mid) > 1.5) out.push(`the pill's centre is ${Math.round((p.left + p.right) / 2 - mid)} px off the ${sin ? 'screen' : 'play bar'}'s`);
      if (p.left < 0 || p.right > innerWidth) out.push('the pill runs off the screen');
      if (!sin) { const gap = r(document.querySelector('#vdock')).top - p.bottom; if (Math.abs(gap - 8) > 1) out.push(`the pill is ${Math.round(gap)} px above the play bar, not 8`); }
      else {
        const z = r(document.querySelector('#zoomPill'));
        if (Math.abs(z.bottom - p.bottom) > 1.5) out.push(`the pill's foot is ${Math.round(z.bottom - p.bottom)} px off the zoom group's`);
        if (p.right > z.left - 4) out.push(`the pill runs into the zoom group (${Math.round(p.right)} vs ${Math.round(z.left)})`);
      }
      // (the readings and names on the figure: none ends closer than 8 px above the pill where it would sit over it)
      for (const l of document.querySelectorAll('#labels .lb:not(.lb-off), .lz-lab, .sv-region')) {
        const q0 = r(l);
        if (!q0.width || !q0.height || +getComputedStyle(l).opacity < 0.05 || q0.bottom < 0 || q0.top > innerHeight) continue;
        // (the words' own boxes, a line's full descent included: the label's box can stop short of a "g")
        const q = { left: q0.left, right: q0.right, top: q0.top, bottom: q0.bottom };
        const walk = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.textContent.trim()) continue; const t = document.createRange(); t.selectNodeContents(n); const b = t.getBoundingClientRect(); if (b.height) q.bottom = Math.max(q.bottom, b.bottom); }
        if (q.right > p.left && q.left < p.right && q.bottom > p.top - 7.5 && q.top < p.bottom) out.push(`"${l.textContent.trim().slice(0, 24)}" ends ${Math.round(p.top - q.bottom)} px above the pill, not 8`);
      }
      if (sin && document.querySelector('#app').classList.contains('thumb')) {
        const k = r(document.querySelector('#stageTop .sb-right')), lg = r(document.querySelector('#legend')), tr = r(document.querySelector('.top-right'));
        if (k.width < 100) out.push(`the key's card is ${Math.round(k.width)} px wide`);
        if (lg.left < k.left - 0.5 || lg.right > k.right + 0.5) out.push('the key spills out of its card');
        if (k.right > tr.left && k.left < tr.right && k.bottom > tr.top && k.top < tr.bottom) out.push('the key runs under the buttons beside it');
      }
      for (const b of [...document.querySelectorAll('#viewSeg button')].filter((e) => e.offsetParent)) {
        const t = document.createRange(); t.selectNodeContents(b); const tr = t.getBoundingClientRect(), q = r(b);
        if (parseFloat(getComputedStyle(b).fontSize) < 12) out.push(`"${b.textContent.trim()}" is under 12 px`);
        if (tr.left < q.left - 0.5 || tr.right > q.right + 0.5 || q.left < p.left || q.right > p.right) out.push(`"${b.textContent.trim()}" is cut short`);
      }
      return out;
    }, sin);
    for (const [w, ht] of sizes) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });
      await page.waitForTimeout(600);
      await page.waitForTimeout(1500);   // (the framing settles)
      let bad = await look(false);
      if (bad.length) throw new Error(`${w}x${ht} anatomy: ${bad.join('; ')}`);
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="circuit"]').click());
      await page.waitForTimeout(2500);
      bad = await look(false);
      if (bad.length) throw new Error(`${w}x${ht} circuit: ${bad.join('; ')}`);
      // A Mac with Tests open: the zoom group, pushed left of the card, stays 16 px above the pill or beside it.
      if (await page.evaluate(() => !document.querySelector('#app').classList.contains('thumb') && innerWidth >= 1000)) {
        await page.evaluate(() => document.querySelector('#tabInstruments').click());
        await page.waitForTimeout(1500);
        const z = await page.evaluate(() => { const a = document.querySelector('#zoomPill').getBoundingClientRect(), p = document.querySelector('#nbViews').getBoundingClientRect();
          return { show: !!document.querySelector('#zoomPill').offsetParent, side: a.right <= p.left || a.left >= p.right, gap: p.top - a.bottom }; });
        if (z.show && !z.side && z.gap < 15.5) throw new Error(`${w}x${ht} Tests open: the zoom group ends ${Math.round(z.gap)} px above the view pill, over it`);
        await page.evaluate(() => document.querySelector('#tabInstruments').click());
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
      await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
      await page.waitForTimeout(600);
      bad = await look(false);
      if (bad.length) throw new Error(`${w}x${ht} lobule: ${bad.join('; ')}`);
      if (await page.evaluate(() => !document.querySelector('#viewSeg [data-view="sinusoid"]').hidden)) {
        await page.evaluate(() => document.querySelector('#viewSeg [data-view="sinusoid"]').click());
        await page.waitForFunction(() => document.querySelector('#app').classList.contains('sin-focus') && document.querySelector('#sinViews').contains(document.querySelector('#viewSeg')), null, { timeout: 30000 });
        await page.waitForTimeout(2500);
        // (the top bar glides its pieces to the sinusoid view's places: measure once nothing in it is moving)
        await page.waitForFunction(() => { const tb = document.querySelector('#topbar'); return !document.getAnimations().some((a) => a.playState === 'running' && tb.contains(a.effect?.target)); }, null, { timeout: 15000, polling: 100 }).catch(() => {});
        await page.waitForTimeout(300);
        bad = await look(true);
        if (bad.length) throw new Error(`${w}x${ht} sinusoid: ${bad.join('; ')}`);
      }
    }
  });
  // The thumb dock's words sit whole (15 Oct, Mohammad's iPhone: the tab labels were cut off along the bar's foot): every tab
  // label shows in full inside the dock and every view label inside the switch's pill, on every upright phone and tablet and
  // in every view; the pill sits apart from the dock, just above it (16 Oct).
  await check(device, 'thumb dock: every tab and view label sits whole, the switch a pill above the dock', async (page) => {
    const sizes = device === 'phone' ? [[320, 568], [375, 667], [390, 844], [430, 932]] : [[768, 1024], [820, 1180], [1024, 1366]];
    for (const [w, ht] of sizes) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });
      for (const v of ['anatomic', 'circuit', 'lobule']) {
        if (v !== 'anatomic') { await pickView(page, v); await page.waitForTimeout(v === 'lobule' ? 2500 : 1200); }
        const bad = await page.evaluate(() => {
          const out = [], r = (e) => e.getBoundingClientRect(), d = r(document.querySelector('#vdock')), nb = r(document.querySelector('#thumbBar'));
          if (!document.querySelector('#app').classList.contains('thumb')) return ['no thumb dock'];
          if (d.bottom > innerHeight + 0.5) out.push(`the dock runs ${Math.round(d.bottom - innerHeight)} px off the screen`);
          if (nb.bottom > d.bottom + 1) out.push(`the tab row runs ${Math.round(nb.bottom - d.bottom)} px below the dock`);
          const words = [...document.querySelectorAll('#thumbBar .nb-tab .nb-l'), ...document.querySelectorAll('#viewSeg button')].filter((e) => e.offsetParent);
          for (const e of words) {
            const q = r(e), box = e.closest('#thumbBar') ? nb : r(document.querySelector('#nbViews')), name = e.textContent.trim();
            // (the words' own box against the label's: a touch area drawn past a button's edge does not count as cut)
            const t = document.createRange(); t.selectNodeContents(e); const tr = t.getBoundingClientRect();
            if (e.scrollWidth > e.clientWidth + 1 || tr.left < q.left - 0.5 || tr.right > q.right + 0.5 || tr.top < q.top - 0.5 || tr.bottom > q.bottom + 0.5) out.push(`"${name}" is cut short (${Math.round(tr.width)}x${Math.round(tr.height)} words in ${Math.round(q.width)}x${Math.round(q.height)})`);
            if (q.top < box.top - 0.5 || q.bottom > box.bottom + 0.5 || q.left < box.left - 0.5 || q.right > box.right + 0.5) out.push(`"${name}" runs outside its bar (${Math.round(q.top)}-${Math.round(q.bottom)} in ${Math.round(box.top)}-${Math.round(box.bottom)})`);
            const hit = document.elementFromPoint(q.left + q.width / 2, q.bottom - 2);
            if (!hit || !(e.closest('button').contains(hit))) out.push(`"${name}" has ${hit ? hit.tagName + '.' + hit.getAttribute('class') : 'nothing'} over its foot`);
          }
          for (const m of [...document.querySelectorAll('#strip .metric')].filter((e) => e.offsetParent)) { const q = r(m); if (q.right > d.right + 0.5 || q.left < d.left - 0.5) out.push(`the reading "${m.textContent.trim().slice(0, 24)}" runs out of the dock`); }
          if (!document.querySelector('#nbViews').contains(document.querySelector('#viewSeg'))) out.push('the switch is not in its pill');
          else if (r(document.querySelector('#nbViews')).bottom > d.top - 4) out.push('the switch\'s pill is not apart from the dock, above it');
          return out;
        });
        if (bad.length) throw new Error(`${w}x${ht} ${v}: ${bad.join('; ')}`);
      }
    }
  });
  // An upright iPad: Treat opens lined up with the bar's edges, 8 px above the tab row, which is then a rounded piece of its own
  // (15 Oct: it had sat at the screen's right margin, overhanging the bar, and flush on a square-cornered tab row).
  if (device === 'desktop') await check(device, 'thumb dock on an upright iPad: Treat and Tests line up with the bar, 8 px above the rounded tab row, every Tests tab name whole', async (page) => {
    for (const [w, ht] of [[768, 1024], [820, 1180], [1024, 1366]]) {
      await page.setViewportSize({ width: w, height: ht });
      await open(page, '?preset=cirr-decomp');
      await page.waitForFunction(() => !document.querySelector('#boot:not(.done)'), null, { timeout: 30000 });
      await page.click('#thumbBar [data-tab="treat"]');
      await page.waitForFunction(() => { const c = document.querySelector('#treatCard'); return !c.hidden && !c.getAnimations().length; });
      await page.waitForTimeout(400);
      const v = await page.evaluate(() => { const c = document.querySelector('#treatCard').getBoundingClientRect(), t = document.querySelector('#thumbBar'), n = t.getBoundingClientRect(), cs = getComputedStyle(t);
        return { l: c.left - n.left, r: n.right - c.right, gap: n.top - c.bottom, round: parseFloat(cs.borderTopLeftRadius) > 4 && parseFloat(cs.borderTopRightRadius) > 4 }; });
      if (Math.abs(v.l) > 1 || Math.abs(v.r) > 1) throw new Error(`${w}x${ht}: Treat is ${Math.round(v.l)} px in from the bar's left and ${Math.round(v.r)} px from its right, not lined up`);
      if (Math.abs(v.gap - 8) > 1) throw new Error(`${w}x${ht}: Treat ends ${Math.round(v.gap)} px above the tab row, not 8`);
      if (!v.round) throw new Error(`${w}x${ht}: the tab row keeps square top corners under the open card`);
      // Tests too: lined up with the bar, 8 px above it, and every tab's name whole (Readouts, not "Reado…").
      await page.click('#thumbBar [data-tab="tests"]');
      await page.waitForFunction(() => { const c = document.querySelector('#dock'); return document.querySelector('#app').classList.contains('dock-open') && document.querySelector('#treatCard').hidden && !c.getAnimations().length; });
      await page.waitForTimeout(400);
      const t = await page.evaluate(() => { const c = document.querySelector('#dock').getBoundingClientRect(), n = document.querySelector('#thumbBar').getBoundingClientRect();
        const cut = [...document.querySelectorAll('#dock .ws-tabs .instr-tab')].filter((b) => b.offsetParent).map((b) => { const l = b.querySelector('.it-t b'), sp = [...l.children].find((k) => getComputedStyle(k).display !== 'none'), r = document.createRange(); r.selectNodeContents(sp);
          const q = r.getBoundingClientRect(), box = l.getBoundingClientRect(); return l.scrollWidth > l.clientWidth + 0.5 || q.right > box.right + 0.5 || q.left < box.left - 0.5 ? sp.textContent : null; }).filter(Boolean);
        return { l: c.left - n.left, r: n.right - c.right, gap: n.top - c.bottom, cut }; });
      if (Math.abs(t.l) > 1 || Math.abs(t.r) > 1) throw new Error(`${w}x${ht}: Tests is ${Math.round(t.l)} px in from the bar's left and ${Math.round(t.r)} px from its right, not lined up`);
      if (Math.abs(t.gap - 8) > 1) throw new Error(`${w}x${ht}: Tests ends ${Math.round(t.gap)} px above the tab row, not 8`);
      if (t.cut.length) throw new Error(`${w}x${ht}: Tests tab names cut short: ${t.cut.join(', ')}`);
    }
  });
  // The thumb dock (an upright phone): the top bar is two chips, the patient and the key; the view switch is the dock's first
  // line, above the play row (never between the play row and the tabs); Treat, Tests, History, Layers and Settings
  // sit in the dock's tab row, and every card or menu they open sits above the dock, so the tab row never moves or hides.
  if (device === 'phone') await check(device, 'thumb dock: two chips on top; the tab row opens every card and menu above the dock', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    if (!(await page.evaluate(() => document.querySelector('#app').classList.contains('thumb')))) throw new Error('an upright phone has no thumb dock');
    const tabs = await page.$$eval('#thumbBar .nb-tab', (els) => els.filter((e) => e.offsetParent).map((e) => e.querySelector('.nb-l').textContent));
    if (tabs.join('|') !== 'Treat|Tests|History|Layers|Settings') throw new Error(`the tab row reads ${tabs.join(', ')}`);
    const shown = await page.evaluate(() => ['.top-right', '#btnBlood', '.tl-hist', '#zoomIn'].filter((q) => document.querySelector(q)?.offsetParent));
    if (shown.length) throw new Error(`still shown outside the tab row: ${shown.join(', ')}`);
    const row = await page.evaluate(() => { const a = document.querySelector('.tb-id').getBoundingClientRect(), b = document.querySelector('#btnLayers').getBoundingClientRect(); return Math.abs(a.top - b.top) < 8 && a.right <= b.left && b.right <= innerWidth; });
    if (!row) throw new Error('the patient and the key are not one row inside the screen');
    // Nothing floats over the figure above the dock: Fit is in the Layers tab's menu; the view switch is the dock's first line, above the play row.
    if (await page.evaluate(() => ['#zoomPill', '#zoomFit'].some((q) => document.querySelector(q)?.offsetParent))) throw new Error('the zoom buttons still float over the figure');
    const first = await page.evaluate(() => { const v = document.querySelector('#viewSeg').getBoundingClientRect(), p = document.querySelector('#stageBottom').getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect(); return document.querySelector('#nbViews').contains(document.querySelector('#viewSeg')) && v.height >= 28 && v.bottom < d.top && v.bottom < p.top; });
    if (!first) throw new Error('the view switch is not a pill above the dock');
    await pickView(page, 'circuit');
    await page.waitForFunction(() => window.pps.store.get().view === 'circuit');
    await page.click('#thumbBar [data-tab="layers"]');
    if (await page.locator('.layers-pop:not(.leaving) [data-view]').count()) throw new Error('the Layers menu still holds a second view switch');
    if (!(await page.locator('.layers-pop:not(.leaving) .menu-item:has-text("Fit to screen")').count())) throw new Error('Fit is not in the Layers menu');
    if (!(await page.locator('.layers-pop:not(.leaving) .menu-item:has-text("Turn upright")').count())) throw new Error('the circuit view has no Turn upright in the Layers menu');
    if (!(await page.locator('.layers-pop:not(.leaving) .lens-opt:has-text("Streaks")').count())) throw new Error('the blood layers are not in the Layers menu');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.layers-pop', { state: 'detached' });
    await pickView(page, 'anatomic');
    await page.waitForFunction(() => window.pps.store.get().view === 'anatomic');
    const dockTop = await page.evaluate(() => document.querySelector('#thumbBar').getBoundingClientRect().top);
    const above = (sel) => page.evaluate(([sel, top]) => { const r = document.querySelector(sel).getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect(); const n = document.querySelector('#thumbBar').getBoundingClientRect(); return r.height > 40 && r.bottom > d.top && Math.abs(n.top - r.bottom - 8) <= 1 && Math.abs(document.querySelector('#thumbBar').getBoundingClientRect().top - top) < 1; }, [sel, dockTop]);
    for (const [tab, sel] of [['tests', '#dock'], ['treat', '#treatCard']]) {
      await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForTimeout(800);
      await page.waitForFunction((sel) => !document.querySelector(sel).getAnimations().length, sel);
      if (!(await above(sel))) throw new Error(`${tab} does not sit on the tab row over the play bar, or the tab row moved`);
      if (await page.getAttribute(`#thumbBar [data-tab="${tab}"]`, 'aria-pressed') !== 'true') throw new Error(`the ${tab} tab is not shown as open`);
    }
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('dock-open'))) throw new Error('Tests stayed open under Treat');
    await page.click('#thumbBar [data-tab="treat"]');
    await page.waitForSelector('#treatCard', { state: 'hidden' });
    for (const tab of ['history', 'layers', 'settings']) {
      await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForSelector('.menu.as-sheet:not(.leaving)');
      await page.waitForFunction(() => !document.querySelector('.menu.as-sheet:not(.leaving)').getAnimations().length);   // (risen in full)
      if (!(await above('.menu.as-sheet:not(.leaving)'))) throw new Error(`${tab} does not sit on the tab row over the play bar`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    // Switching straight from one tab's sheet to another's: only one sheet at a time, and it too sits above the dock.
    await page.click('#thumbBar [data-tab="history"]');
    await page.waitForSelector('.menu.as-sheet:not(.leaving)');
    await page.click('#thumbBar [data-tab="settings"]');
    if (await page.locator('.menu.as-sheet:not(.leaving)').count() !== 1) throw new Error('two sheets open at once');
    await page.waitForFunction(() => !document.querySelector('.menu.as-sheet:not(.leaving)').getAnimations().length);
    if (!(await above('.menu.as-sheet:not(.leaving)'))) throw new Error('Settings, opened from History, does not sit on the tab row');
    if (!(await page.locator('.menu.as-sheet:not(.leaving) .menu-item:has-text("Search")').count())) throw new Error('Search is not in Settings');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
  // No card is ever drawn over the tab row: sampled every frame while Treat and Tests open, are pulled down from a button
  // in their content (which closes them), and while Tests closes from its tab. A pull from a button on Treat closes it.
  if (device === 'phone') await check(device, 'thumb dock: no card ever covers the tab row (open, drag, close); a pull from anywhere closes Treat', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.__cover = [];
      const tick = () => { const b = document.querySelector('#thumbBar'), r = b.getBoundingClientRect();
        for (const f of [0.1, 0.5, 0.9]) for (const y of [r.top + 4, r.bottom + 3, innerHeight - 1]) { const e = document.elementFromPoint(r.left + r.width * f, y); const c = e?.closest('#treatCard, #dock, #panel, .menu'); if (c) window.__cover.push(c.id || c.className); }
        window.__coverRaf = requestAnimationFrame(tick); };
      tick();
    });
    for (const [tab, sel] of [['treat', '#treatCard'], ['tests', '#dock']]) {
      await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForTimeout(900);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#stageBottom')).opacity === '0', null, { timeout: 5000 })   // (its fade, on a busy browser)
        .catch(() => { throw new Error(`the play bar still shows over the ${tab} card`); });
      const pt = await page.evaluate((sel) => { const c = document.querySelector(sel), b = [...c.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.height && !x.closest('[role="tablist"], .card-head, .dock-head, .tc-head') && r.top > c.getBoundingClientRect().top + 80 && r.bottom < document.querySelector('#thumbBar').getBoundingClientRect().top; }); const r = (b || c).getBoundingClientRect(); return [r.x + r.width / 2, r.y + Math.min(r.height / 2, 20)]; }, sel);
      await page.mouse.move(pt[0], pt[1]); await page.mouse.down();
      for (let i = 1; i <= 30; i++) await page.mouse.move(pt[0], pt[1] + 6 * i);
      // (The card follows the finger from the button: the button never keeps the pull to itself.)
      if (tab === 'treat' && !(await page.evaluate(() => { const c = document.querySelector('#treatCard'); return c.classList.contains('dragging') && parseFloat(c.style.getPropertyValue('--sink')) > 100; }))) throw new Error('a pull down from a button on Treat did not move it');
      await page.mouse.up();
      // (It sinks behind the tab row and closes; a slow runner's frames can run late, so the close is waited for, not timed.)
      if (tab === 'treat' && !(await page.waitForFunction(() => document.querySelector('#treatCard').hidden, null, { timeout: 5000 }).then(() => true, () => false))) throw new Error('a pull down from a button on Treat did not close it');
      await page.waitForTimeout(700);
      if (tab === 'tests' && await page.evaluate(() => document.querySelector('#app').classList.contains('dock-open'))) await page.click('#thumbBar [data-tab="tests"]');
      await page.waitForTimeout(700);
    }
    const cover = await page.evaluate(() => { cancelAnimationFrame(window.__coverRaf); return [...new Set(window.__cover)]; });
    if (cover.length) throw new Error(`drawn over the tab row: ${cover.join(', ')}`);
  });
  // A Tests card over the thumb dock has two heights, Half and Full, at any phone height (Safari's bars leave about 660 px): pulled
  // up from its tabs it stays at Full instead of snapping back, the grabber toggles Half and Full, and a tab keeps the height.
  if (device === 'phone') await check(device, 'thumb dock: the Tests card pulls up to Full and stays, and keeps its height across tabs', async (page) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.click('#thumbBar [data-tab="tests"]');
    await page.waitForTimeout(900);
    const box = () => page.evaluate(() => { const r = document.querySelector('#dock').getBoundingClientRect(); return { top: r.top, h: r.height }; });
    const full = await page.evaluate(() => { const a = document.querySelector('#app'), v = (k) => parseFloat(a.style.getPropertyValue(k)) || 0; return a.clientHeight - v('--top-safe') - v('--nb-occ') - 22; });
    const half = (await box()).h;
    // No grabber over the title or the tabs: the button is unseen and the head under it takes the touch.
    const grab = await page.evaluate(() => { const g = document.querySelector('#dock .sheet-grab'), r = g.getBoundingClientRect(), cs = getComputedStyle(g); return { op: +cs.opacity, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === g }; });
    if (grab.op > 0.01 || grab.hit) throw new Error(`the Tests card still shows a grabber over its head: ${JSON.stringify(grab)}`);
    if (half > full * 0.75 || half < full * 0.5) throw new Error(`Half is ${half} px of ${full}`);
    const tab = await page.evaluate(() => { const r = document.querySelectorAll('#dock [role=tab]')[2].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(tab[0], tab[1]); await page.mouse.down();
    for (let i = 1; i <= 60; i++) await page.mouse.move(tab[0], tab[1] - 5 * i);   // (small steps: a mouse is not captured until the sheet moves)
    await page.mouse.up();
    await page.waitForTimeout(600);
    if (Math.abs((await box()).h - full) > 2) throw new Error(`pulled up, the card settled at ${(await box()).h} px, not ${full}`);
    await page.$eval('#dock .sheet-grab', (b) => b.click());   // (the keyboard's Half/Full button: no touch reaches it)
    await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);   // (its height has finished easing)
    await page.waitForTimeout(600);
    if (Math.abs((await box()).h - half) > 2) throw new Error('the grabber does not return the card to Half');
    const before = await box();
    await page.evaluate(() => document.querySelector('#dock [data-instrument="abdomen"]').click());
    await page.waitForTimeout(800);
    const after = await box();
    if (Math.abs(after.top - before.top) > 1) throw new Error(`switching tab moved the card's top edge by ${after.top - before.top} px`);
  });
  // From Full a pull down settles the Tests card at Half, however fast (a flick included); only a second pull closes it. After the
  // finger lifts, every frame the card's slide and its cut are the same length (one value, --sink), so the part that would pass
  // the tab row is never drawn: on iOS a transform animated beside a clip-path ran ahead of it and showed over the tab row.
  if (device === 'phone') await check(device, 'thumb dock: a fast pull from Full settles at Half, a second pull closes, and the slide never outruns its cut', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.click('#thumbBar [data-tab="tests"]');
    await page.waitForTimeout(900);
    const halfH = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().height);
    await page.$eval('#dock .sheet-grab', (b) => b.click());   // (the keyboard's Half/Full button: no touch reaches it)
    await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);   // (its height has finished easing)
    await page.waitForTimeout(600);
    const fullH = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().height);
    await page.evaluate(() => {
      window.__bad = [];
      const cutLine = (cp) => { const i = cp.indexOf('polygon('); if (i < 0) return ''; const t = cp.slice(i + 8, cp.lastIndexOf(')')), pts = []; let d = 0, cur = '';
        for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { pts.push(cur.trim()); cur = ''; } else cur += ch; } pts.push(cur.trim());
        const p = pts[7] || ''; let k = 0, sp = -1; for (let j = 0; j < p.length && sp < 0; j++) { if (p[j] === '(') k++; else if (p[j] === ')') k--; else if (p[j] === ' ' && !k) sp = j; } return sp < 0 ? '' : p.slice(sp + 1); };   // (the cut's y, from the card's top: the end of its straight run, where the right corner's arc meets it)
      // (a length, a percentage of the card's height, or a calc() of them with max()/min(), as a computed cut reads)
      const px = (v, el) => Function(`return ${String(v).trim().replace(/calc\(/g, '(').replace(/(max|min)\(/g, 'Math.$1(').replace(/(-?[\d.]+)%/g, `($1 / 100 * ${el.offsetHeight})`).replace(/(-?[\d.]+)px/g, '$1')}`)() || 0;
      const tick = () => { const c = document.querySelector('#dock'), cs = getComputedStyle(c);
        if (c.offsetParent) {
          const ty = px(cs.translate.split(' ')[1] || '0', c), cut = c.offsetHeight - px(cutLine(cs.clipPath), c) + 8;
          if (Math.abs(ty - cut) > 0.5) window.__bad.push(`slide ${ty} vs cut ${cut} (the line 8 px under the card's edge)`);
        }
        window.__sinkRaf = requestAnimationFrame(tick); };
      tick();
    });
    const flick = async () => {
      const g = await page.evaluate(() => { const r = document.querySelector('#dock .sheet-grab').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(g[0], g[1]); await page.mouse.down();
      for (let i = 1; i <= 4; i++) await page.mouse.move(g[0], g[1] + 8 + 60 * i);
      await page.mouse.up();
      await page.waitForTimeout(700);
    };
    // A slow pull from Full shrinks the card: its foot stays on the tab row and its top follows the finger (it never slides down).
    {
      const r0 = await page.evaluate(() => { const r = document.querySelector('#dock').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      const x = 195, y = r0.top + 30;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + 8 * i);
      await page.waitForTimeout(50);
      const mid = await page.evaluate(() => { const c = document.querySelector('#dock'), r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, ty: parseFloat(getComputedStyle(c).translate.split(' ')[1]) || 0 }; });
      if (Math.abs(mid.bottom - r0.bottom) > 1 || Math.abs(mid.ty) > 0.5) throw new Error(`a pull from Full slid the card down instead of shrinking it: ${JSON.stringify({ r0, mid })}`);
      if (Math.abs(mid.top - (r0.top + 80)) > 3) throw new Error(`the card's top did not follow the finger: ${mid.top - r0.top} px for 80`);
      for (let i = 11; i <= 4 * 10 + 30; i++) await page.mouse.move(x, y + 8 * i);
      await page.mouse.up();
      await page.waitForTimeout(700);
      const h = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().height);
      if (Math.abs(h - halfH) > 2) throw new Error(`released past Half, the card settled at ${h} px, not Half (${halfH})`);
      await page.$eval('#dock .sheet-grab', (b) => b.click());
      await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);
      await page.waitForTimeout(600);
    }
    await flick();
    const st = await page.evaluate(() => ({ open: document.querySelector('#app').classList.contains('dock-open'), h: document.querySelector('#dock').getBoundingClientRect().height }));
    if (!st.open) throw new Error('a fast pull from Full closed the Tests card instead of settling at Half');
    if (Math.abs(st.h - halfH) > Math.abs(st.h - fullH)) throw new Error(`a pull from Full settled at ${st.h} px, not Half (${halfH}; Full ${fullH})`);
    await flick();
    // (The close lands when the card's 220 ms sink ends, by its frames or its timer: on a CI runner whose frames take seconds
    // that can be later than the flick's fixed 700 ms wait, which had failed this check on a card that did close. It must
    // still close, within a few seconds.)
    if (!(await page.waitForFunction(() => !document.querySelector('#app').classList.contains('dock-open'), null, { timeout: 5000 }).then(() => true, () => false))) throw new Error('a second pull, from Half, did not close the Tests card');
    const bad = await page.evaluate(() => { cancelAnimationFrame(window.__sinkRaf); return [...new Set(window.__bad)].slice(0, 3); });
    if (bad.length) throw new Error(`the card's slide and cut came apart: ${bad.join('; ')}`);
  });

  // A stent's Proximal, Mid and Distal tiles under the Doppler trace are the sample-spot buttons (no dropdown); a tap or Enter moves the gate.
  await check(device, 'Doppler stent tiles pick the sample spot', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => window.pps.updateParams((p) => { p.tips.on = true; return p; }, { label: 'TIPS' }));
    if (device === 'phone') { await page.click('#thumbBar [data-tab="tests"]'); await page.waitForTimeout(900); await page.evaluate(() => document.querySelector('#dock [data-instrument="doppler"]').click()); }
    else await page.evaluate(() => window.pps.dock.show('doppler'));
    await page.waitForTimeout(1200);
    await page.selectOption('#pane-doppler .dop-vessel', 'TIPS');
    await page.waitForFunction(() => window.pps.store.get().frame.probe === 'TIPS' && document.querySelector('#pane-doppler .dop-seg').closest('div').offsetParent, null, { timeout: 30000 });
    if (await page.$('#pane-doppler .dop-gate')) throw new Error('the stent Doppler still has a separate spot dropdown');
    const tap = (sel) => (device === 'phone' ? page.tap(sel) : page.click(sel));
    // (The figure's TIPS callout points at the sampled third: its anchor dot moves along the stent with the gate.)
    const dots = () => page.evaluate(() => [...document.querySelectorAll('circle.leader-dot:not(.ld-gone)')].map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).join(' '));
    const anchors = {};
    for (const seg of ['proximal', 'distal', 'mid']) {
      await tap(`#pane-doppler .dop-seg[title*="${seg}"]`);
      await page.waitForFunction((x) => window.pps.store.get().dopGate === x && document.querySelector(`#pane-doppler .dop-seg[title*="${x}"]`).getAttribute('aria-pressed') === 'true', seg, { timeout: 8000 });
      if (device !== 'phone') {
        await page.waitForFunction((x) => document.querySelector('[data-key="n:TIPS"]')?.textContent.includes(`TIPS ${x}`), seg, { timeout: 8000 });
        await page.waitForTimeout(300);
        anchors[seg] = await dots();
      }
    }
    if (device !== 'phone' && (anchors.proximal === anchors.distal || anchors.mid === anchors.distal)) throw new Error('the TIPS callout stays put when the Doppler gate moves along the stent');
    await page.focus('#pane-doppler .dop-seg[title*="distal"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.pps.store.get().dopGate === 'distal', null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await shot(page, `${device}-doppler-stent-tiles`);
  });
  // TIPS Doppler's stent slides (the three points, the narrowed stent, where it narrows, the reopened stent) call out the stent's
  // velocity at all three points, each reading what the Doppler's tile for that point reads, and only the sampled one in green.
  await check(device, 'presenter TIPS Doppler: the stent slides call out all three points, matching the Doppler tiles', async (page) => {
    // (On a phone, each slide twice: as it opens, and with its data card's monitor open, which moves the figure: a point slid off its
    // dot's line by the open card got past the check once: Review 16 Oct.)
    // (The slides are found by name: their numbers went stale when two slides were added before them (the check then stood on slides with
    // no points and found nothing to fail on), and the presenter's buttons are waited for, as they arrive after the figure.)
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const tips = withOverview(DECKS.find((d) => d.id === 'tips-doppler'));
    for (const id of ['jet', 'narrow', 'fix']) for (const unfold of device === 'phone' ? [false, true] : [false]) {
      const n = tips.slides.findIndex((s) => s.id === id) + 1;
      if (!n) throw new Error(`TIPS Doppler has no slide "${id}"`);
      await open(page, `?script=tips-doppler&slide=${n}`);
      await page.waitForFunction(() => document.querySelectorAll('.pz-abb').length > 0, null, { timeout: 60000 });
      if (unfold) {
        const folded = await page.evaluate(() => { const f = document.querySelector('.pz-data:not(.pz-hide):not([hidden]) .pz-fold'); if (!f?.getClientRects().length || f.getAttribute('aria-expanded') !== 'false') return false; f.click(); return true; });
        if (!folded) continue;
        await page.waitForFunction(() => document.querySelector('.pz-data .pz-fold')?.getAttribute('aria-expanded') === 'true');
        await quiet(page);
      }
      const at = unfold ? `slide ${n} (monitor open)` : `slide ${n}`;
      const picks = await page.$$eval('.pz-abb', (b) => b.length);
      let first = null;
      for (let k = 0; k < picks; k++) {
        await page.evaluate((k) => document.querySelectorAll('.pz-abb')[k].click(), k);
        // (A phone's data card may fold behind its Show control on a slide whose words are long: the callouts are then only counted.)
        const ok = await page.waitForFunction((phone) => {
          const tiles = Object.fromEntries([...document.querySelectorAll('.pz-data .dop-stats > div')].filter((d) => !d.hidden && d.getClientRects().length)
            .map((d) => [d.querySelector('dt').textContent.trim().toLowerCase(), parseFloat(d.querySelector('dd').textContent)]));
          const shown = [...document.querySelectorAll('#labels g.lb[data-key^="n:TIPS:"]')].filter((g) => g.style.display !== 'none' && !g.classList.contains('lb-off'));
          if (shown.length !== 3 || shown.filter((g) => g.querySelector('.lb-gate')).length !== 1) return false;
          // (Where no tiles show (a phone's folded card; the Mac's and iPad's card now shows the monitor alone) there is nothing to match them to, and
          // the callouts are only counted, once the green one is the point just picked; the monitor's own number is matched to it below.)
          if (!Object.keys(tiles).length) { const st = window.pps.store.get(), gate = st.dopGate === 'site' ? st.params.stenosisSite?.TIPS || 'distal' : st.dopGate; return !!shown.find((g) => g.querySelector('.lb-gate'))?.dataset.key.endsWith(gate); }
          // (A phone names them short: "Prox 99 cm/s".)
          const names = { tipsproximal: 'proximal', tipsmid: 'mid', tipsdistal: 'distal', prox: 'proximal', mid: 'mid', dist: 'distal' };
          return shown.every((g) => { const m = g.textContent.match(/^(TIPS ?(?:proximal|mid|distal)|Prox|Mid|Dist)\s*([\d.]+)/); return m && tiles[names[m[1].replace(/ /g, '').toLowerCase()]] === parseFloat(m[2]); });
        }, device === 'phone', { timeout: 30000 }).then(() => true, () => false);
        if (!ok) {
          const got = await page.evaluate(() => [...document.querySelectorAll('#labels g.lb[data-key^="n:TIPS"]')].map((g) => `${g.textContent}${g.classList.contains('lb-off') || g.style.display === 'none' ? ' (hidden)' : ''}`).join(', '));
          throw new Error(`TIPS Doppler ${at}, button ${k + 1}: the stent's three callouts are not all shown or disagree with the Doppler tiles (${got || 'none'})`);
        }
        // (Measured once the labels hold still: two readings half a second apart agree, so a camera still gliding is not measured.)
        await page.waitForFunction(() => { const now = JSON.stringify(window.pps.stage.labelClearance()), same = now === window.__tipsClear; window.__tipsClear = now; return same; }, null, { polling: 500, timeout: 30000 }).catch(() => {});
        // (The green name is the point the Doppler samples. After review, 15 Oct: the three stand in order on one side of the stent,
        // distal at the top, each 16 px at most from its own dot, and none covers another label, a mark or the "60 %", which reads 12 px
        // at least; and they keep their places when another point is picked.)
        const got = await page.evaluate(() => {
          const g = document.querySelector('#labels g.lb[data-key^="n:TIPS:"] .lb-gate')?.closest('g.lb'), st = window.pps.store.get();
          const gate = st.dopGate === 'site' ? st.params.stenosisSite?.TIPS || 'distal' : st.dopGate;   // (a gate on the narrowing samples the third it sits in)
          const box = (e) => e.getBoundingClientRect(), meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          const pts = Object.fromEntries(['proximal', 'mid', 'distal'].map((p) => [p, document.querySelector(`#labels g.lb[data-key="n:TIPS:${p}"]`)]));
          const rs = Object.fromEntries(Object.entries(pts).map(([p, e]) => [p, box(e)]));
          const others = [...document.querySelectorAll('#labels g.lb:not(.lb-off)')].filter((e) => !e.dataset.key?.startsWith('n:TIPS:') && e.style.display !== 'none' && !e.dataset.key?.startsWith('o:'));
          const clamps = [...document.querySelectorAll('.clamp-label')];
          // (The figure's own leader dots: the lobule view's, hidden behind it, stand wherever its labels would and are none of the stent's.)
          const dots = [...document.querySelectorAll('.lb-leaders .leader-dot:not(.ld-gone)')].map((d) => { const r = box(d); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2]; });
          const far = (r) => Math.min(...dots.map(([x, y]) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))));
          const err = [], list = Object.values(rs), cx = (r) => (r.left + r.right) / 2;
          if (list.some((a, i) => list.some((b, j) => j > i && meet(a, b)))) err.push('two callouts overlap');
          if (!(rs.distal.top < rs.mid.top && rs.mid.top < rs.proximal.top)) err.push('the callouts are not in order, distal at the top');
          const own = (r) => dots.reduce((m, d) => (Math.hypot(Math.max(r.left - d[0], 0, d[0] - r.right), Math.max(r.top - d[1], 0, d[1] - r.bottom)) < Math.hypot(Math.max(r.left - m[0], 0, m[0] - r.right), Math.max(r.top - m[1], 0, m[1] - r.bottom)) ? d : m), dots[0] || [0, 0]);
          const sides = list.map((r) => Math.sign(cx(r) - own(r)[0]));
          if (new Set(sides).size > 1) err.push('the callouts are not all on one side of the stent');
          // (Only the jet may stand farther, just past its narrowing's arrow on its dot's line: 8 px beyond the arrow at most. An arrow's box
          // reaches the dot's line from one side, so it counts within 2 px of it.)
          const arrows = [...document.querySelectorAll('path.clamp')].map(box);
          const reach = (r) => { const [x, y] = own(r); return Math.max(16.5, ...arrows.filter((a) => a.top - 2 <= y && y <= a.bottom + 2 && (cx(r) > x ? a.left >= x - 2 && a.left < r.left : a.right <= x + 2 && a.right > r.right)).map((a) => (cx(r) > x ? a.right - x : x - a.left) + 8)); };
          for (const [p, r] of Object.entries(rs)) if (far(r) > reach(r)) err.push(`${p} stands ${Math.round(far(r))} px from its dot`);
          // (Level with its own dot, where the dots stand far enough apart for three level callouts.)
          const ys = list.map((r) => own(r)[1]).sort((a, b) => a - b);
          if (ys.every((y, i) => !i || y - ys[i - 1] >= 28)) for (const [p, r] of Object.entries(rs)) if (Math.abs((r.top + r.bottom) / 2 - own(r)[1]) > 4) err.push(`${p} is not level with its dot (${Math.round((r.top + r.bottom) / 2 - own(r)[1])} px)`);
          // (The slide's mark (Narrowing, Stent) still shows, moved off the column, not dropped or under a card.)
          const mk = [...document.querySelectorAll('#labels g.lb[data-key^="focus"]')].filter((e) => e.style.display !== 'none');
          if (st.focus && !mk.some((e) => !e.classList.contains('lb-off'))) err.push("the slide's mark is not shown");
          for (const [p, r] of Object.entries(rs)) for (const o of [...others, ...clamps]) if (meet(r, box(o))) err.push(`${p} covers "${o.textContent.trim().slice(0, 16)}"`);
          for (const c of clamps) if (box(c).height && parseFloat(getComputedStyle(c).fontSize) * (c.getScreenCTM()?.a || 1) < 11.5) err.push('the "60 %" reads under 12 px');
          if (!g.dataset.key.endsWith(gate)) err.push(`the green callout (${g.textContent}) is not the sampled ${gate}`);
          // (Review 16 Oct: the slide's pill and the "60 %" keep 2 px off every vessel as drawn; a pill with no such spot is ringed in the
          // stage's colour instead, 2 px at least. The three callouts read through their own solid halo.)
          for (const r of window.pps.stage.labelClearance()) {
            if (!r.shown || /^n:(TIPS|DIPS):/.test(r.key)) continue;
            if (r.ring ? r.ring < 2 : r.clear < 2) err.push(`${r.key.replace(/^focus\d*/, 'the mark ').replace(/^60%:.*/, 'the "60 %"')} is ${r.clear} px from ${r.vessel}${r.ring ? ` with a ${r.ring} px ring` : ''}`);
          }
          return { err, at: Object.fromEntries(Object.entries(rs).map(([p, r]) => [p, [Math.round(r.left), Math.round(r.top)]])) };
        });
        // (The monitor's number is the green callout's. Both follow the live trace and tick a moment apart, so they are read until they agree
        // at one reading, ten seconds at most, then no longer.)
        const agree = () => { const mon = document.querySelector('.pz-data .dop-vel > b'), g = document.querySelector('#labels g.lb[data-key^="n:TIPS:"] .lb-gate')?.closest('g.lb'); return !mon?.getClientRects().length || !g || Math.abs(parseFloat(mon.textContent.replace('−', '-'))) === parseFloat(g.querySelector('.lb-val')?.textContent); };
        const apart = await page.waitForFunction(agree, null, { polling: 'raf', timeout: 10000 }).then(() => '', () => page.evaluate(() => `the monitor reads ${document.querySelector('.pz-data .dop-vel > b').textContent}, the green callout ${document.querySelector('#labels g.lb[data-key^="n:TIPS:"] .lb-gate').closest('g.lb').textContent}`));
        if (apart) got.err.push(apart);
        if (got.err.length) throw new Error(`TIPS Doppler ${at}, button ${k + 1}: ${[...new Set(got.err)].join('; ')}`);
        // (The "narrow" and "fix" slides move or open the narrowing itself with the pick; elsewhere only the sampled point changes, and nothing moves.)
        if (id !== 'narrow' && id !== 'fix' && k && Object.entries(got.at).some(([p, [x, y]]) => Math.abs(x - first[p][0]) > 2 || Math.abs(y - first[p][1]) > 2)) throw new Error(`TIPS Doppler ${at}, button ${k + 1}: a callout moved when another point was picked (${JSON.stringify(first)} → ${JSON.stringify(got.at)})`);
        if (!k) first = got.at;
      }
    }
  });
  // A narrowing's "60 %" stands whole, 2 px clear of every callout, label and arrow on the figure, and inside the stage: on the TIPS
  // slides with a narrowing (a stent called out at its three points puts the "60 %" on the side the callouts leave free; a redraw of the
  // marks had put it back beside the arrows, under the distal callout, with its "%" hidden: Mohammad, 22 Oct). The slides are found by
  // name, and the check waits for the labels to hold still, as the callout check above does.
  await check(device, 'presenter TIPS Doppler: the narrowing\'s "60 %" keeps clear of every callout, label and arrow', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const tips = withOverview(DECKS.find((d) => d.id === 'tips-doppler'));
    for (const id of ['narrow']) {
      await open(page, `?script=tips-doppler&slide=${tips.slides.findIndex((s) => s.id === id) + 1}`);
      await page.waitForFunction(() => document.querySelector('.clamp-label') && document.querySelectorAll('#labels g.lb[data-key^="n:TIPS:"]:not(.lb-off)').length === 3, null, { timeout: 60000 });
      await page.waitForFunction(() => { const now = JSON.stringify(window.pps.stage.labelClearance()), same = now === window.__tipsClear; window.__tipsClear = now; return same; }, null, { polling: 500, timeout: 30000 }).catch(() => {});
      const bad = await page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect(), meet = (a, b, g) => a.left - g < b.right && b.left - g < a.right && a.top - g < b.bottom && b.top - g < a.bottom;
        const lab = document.querySelector('.clamp-label'), r = box(lab), err = [], st = box(document.querySelector('#labels'));
        if (lab.textContent.trim() !== '60%') err.push(`the label reads "${lab.textContent}"`);
        // (The "60 %" reads in the labels' own name size: the same as "TIPS distal" beside it, 12 px at least, at the text size set.)
        const px = parseFloat(getComputedStyle(lab).fontSize) * lab.getScreenCTM().a, name = parseFloat(document.querySelector('#labels g.lb[data-key="n:TIPS:distal"] tspan')?.getAttribute('font-size'));
        if (!(Math.abs(px - name) < 0.5 && px >= 11.95)) err.push(`the "60 %" reads ${px.toFixed(1)} px, the callouts' names ${name} px`);
        if (getComputedStyle(lab).fontWeight !== '600') err.push(`the "60 %" is weight ${getComputedStyle(lab).fontWeight}, the names 600`);
        if (r.left < st.left || r.right > st.right || r.top < st.top || r.bottom > st.bottom) err.push('the "60 %" is not inside the stage');
        const others = [...document.querySelectorAll('#labels g.lb')].filter((e) => e.style.display !== 'none' && !e.classList.contains('lb-off'));
        for (const o of others) if (meet(r, box(o), 2)) err.push(`the "60 %" touches "${o.textContent.trim().slice(0, 20)}"`);
        for (const a of document.querySelectorAll('path.clamp')) if (meet(r, box(a), 2)) err.push('the "60 %" touches an arrow of its clamp');
        return err;
      });
      if (bad.length) throw new Error(`TIPS Doppler "${id}": ${[...new Set(bad)].join('; ')}`);
    }
  });
  // Every phone card and sheet, driven by real touches (the path iOS takes), at the Home Screen app's height and Safari's: a short
  // pull eases back, a pull from Full (slow or a flick) settles at Half, a pull or flick from Half closes, and a new touch while the
  // card is still easing (back, to Half, or away) takes it over. Every frame, every card's slide equals its cut and nothing of a
  // card is drawn on the tab row or below it (the cut is the tab row's top, 8 px under the card's resting edge).
  for (const H of [844, 664]) if (device === 'phone') await check(device, `thumb dock: every card and sheet pulls, flicks and closes by touch behind the tab row (${H} px)`, async (page) => {
    await page.setViewportSize({ width: 390, height: H });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => window.pps.store.set({ role: 'instructor' }));
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => {
      window.__bad = [];
      const cutLine = (cp) => { const i = cp.indexOf('polygon('); if (i < 0) return ''; const t = cp.slice(i + 8, cp.lastIndexOf(')')), pts = []; let d = 0, cur = '';
        for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { pts.push(cur.trim()); cur = ''; } else cur += ch; } pts.push(cur.trim());
        const p = pts[7] || ''; let k = 0, sp = -1; for (let j = 0; j < p.length && sp < 0; j++) { if (p[j] === '(') k++; else if (p[j] === ')') k--; else if (p[j] === ' ' && !k) sp = j; } return sp < 0 ? '' : p.slice(sp + 1); };   // (the cut's y, from the card's top: the end of its straight run, where the right corner's arc meets it)
      // (a length, a percentage of the card's height, or a calc() of them with max()/min(), as a computed cut reads)
      const px = (v, el) => Function(`return ${String(v).trim().replace(/calc\(/g, '(').replace(/(max|min)\(/g, 'Math.$1(').replace(/(-?[\d.]+)%/g, `($1 / 100 * ${el.offsetHeight})`).replace(/(-?[\d.]+)px/g, '$1')}`)() || 0;
      const tick = () => {
        const b = document.querySelector('#thumbBar').getBoundingClientRect();
        for (const f of [0.1, 0.5, 0.9]) for (const y of [b.top + 4, b.bottom + 3, innerHeight - 1]) { const e = document.elementFromPoint(b.left + b.width * f, y); const c = e?.closest('#treatCard, #dock, #panel, .menu, .action-card'); if (c) window.__bad.push(`${c.id || c.className} on the tab row`); }
        for (const c of document.querySelectorAll('#treatCard:not([hidden]), #app.dock-open #dock, #app.panel-open #panel, .menu.as-sheet, .action-card.docked:not([hidden])')) {
          const cs = getComputedStyle(c), cut = cutLine(cs.clipPath), ty = px(cs.translate.split(' ')[1] || '0', c);
          if (Math.abs(ty - (c.offsetHeight - px(cut, c) + 8)) > 0.5) window.__bad.push(`${c.id || c.className}: slide ${cs.translate} vs cut ${cut} (the line 8 px under the card's edge)`);
        }
        window.__raf = requestAnimationFrame(tick);
      };
      tick();
    });
    const CARDS = [['tests', '#dock', true], ['treat', '#treatCard', true], ['details', '#panel', true], ['history', '.menu.as-sheet:not(.leaving)', false], ['layers', '.menu.as-sheet:not(.leaving)', false], ['settings', '.menu.as-sheet:not(.leaving)', false]];
    const isOpen = (sel) => page.evaluate((sel) => { const c = document.querySelector(sel); return !!c && !c.hidden && (c.id !== 'dock' || document.querySelector('#app').classList.contains('dock-open')) && (c.id !== 'panel' || document.querySelector('#app').classList.contains('panel-open')); }, sel);
    const height = (sel) => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().height, sel);
    const openIt = async (tab, sel) => {
      if (tab === 'details') { await page.click('#thumbBar [data-tab="settings"]'); await page.locator('.menu-item', { hasText: 'Advanced physiology' }).click(); }
      else await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForFunction((sel) => { const c = document.querySelector(sel); return c && !c.getAnimations().length; }, sel);
      await page.waitForTimeout(500);
    };
    // A pull from near the card's top edge (the grabber or the sheet's padding), in `steps` moves `ms` apart; `hold` keeps the
    // finger down at the end before lifting (so it is not a flick).
    const pull = async (sel, dy, { steps = 12, ms = 25, hold = 0 } = {}) => {
      const r = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + 16]; }, sel);   // (the card's head: no grabber takes a touch)
      await touch('touchStart', r[0], r[1]);
      for (let i = 1; i <= steps; i++) { await touch('touchMove', r[0], r[1] + dy * i / steps); if (ms) await page.waitForTimeout(ms); }
      if (hold) await page.waitForTimeout(hold);
      await touch('touchEnd');
    };
    const flick = (sel, dy = 260) => pull(sel, dy, { steps: 4, ms: 0 });
    const expectOpen = async (sel, want, what) => {
      // (a busy browser can take a while to finish easing: wait up to 5 s for the state, then a moment for it to hold)
      for (let t = 0; t < 50 && (await isOpen(sel)) !== want; t++) await page.waitForTimeout(100);
      await page.waitForTimeout(300);
      if ((await isOpen(sel)) === want) return;
      const st = await page.evaluate((sel) => { const c = document.querySelector(sel), r = c?.getBoundingClientRect(); return c ? `top ${Math.round(r.top)}, height ${Math.round(r.height)}, sink ${c.style.getPropertyValue('--sink') || 0}` : 'gone'; }, sel);
      throw new Error(`${what}: the card is ${want ? 'closed' : 'still open'} (${st})`);
    };
    // A vessel's and an organ's card: whole, 8 px above the tab row, with the play bar stepped aside; it closes behind its own edge.
    for (const sel of [{ type: 'edge', id: 'SV_MID' }, { type: 'organ', id: 'liver' }, { type: 'organ', id: 'spleen' }]) {
      await page.evaluate((s) => window.pps.store.set({ selection: s }), sel);
      await page.waitForFunction(() => { const c = document.querySelector('.action-card'); return !c.hidden && !c.getAnimations().length; });
      const v = await page.evaluate(() => { const c = document.querySelector('.action-card').getBoundingClientRect(), t = document.querySelector('#thumbBar').getBoundingClientRect(); return { gap: Math.round(t.top - c.bottom), top: Math.round(c.top), bar: [...document.querySelectorAll('#vdock > :not(.thumb-bar):not(.vd-status)')].some((e) => +getComputedStyle(e).opacity > 0.05) }; });
      if (Math.abs(v.gap - 8) > 1) throw new Error(`the ${sel.id} card ends ${v.gap} px above the tab row, not 8`);
      if (v.top < 60) throw new Error(`the ${sel.id} card runs up to ${v.top} px`);
      if (v.bar) throw new Error(`the play bar shows over the ${sel.id} card`);
      // (Fit is in the Layers tab's menu and the view switch is the dock's first line, under the card, so nothing floats over the figure above it.)
      if (await page.evaluate(() => !!document.querySelector('#zoomPill')?.offsetParent || !document.querySelector('#nbViews').contains(document.querySelector('#viewSeg')))) throw new Error(`Fit floats above the ${sel.id} card, or the view switch left the dock`);
      if (await page.evaluate(() => getComputedStyle(document.querySelector('.action-card .ac-close')).display !== 'none')) throw new Error(`the ${sel.id} card has an X`);
      await pull('.action-card .ac-top', 160, { hold: 100 });   // (no X: a pull down puts it away)
      await page.waitForFunction(() => document.querySelector('.action-card').hidden, null, { timeout: 10000 })
        .catch(() => { throw new Error(`a pull down did not close the ${sel.id} card`); });
    }
    for (const [tab, sel, sizes] of CARDS.filter(([t]) => !process.env.SMOKE_CARDS || process.env.SMOKE_CARDS.includes(t))) {
      const name = `${tab} at ${H} px`;
      await openIt(tab, sel);
      const h0 = await height(sel);
      await pull(sel, 24, { hold: 150 });
      await expectOpen(sel, true, `${name}, a short pull`);
      if (Math.abs((await height(sel)) - h0) > 2) throw new Error(`${name}: a short pull changed the height`);
      if (sizes) {
        for (const how of ['slow', 'flick', 'regrab']) {
          await page.$eval(`${sel} :is(.sheet-grab, .panel-grab)`, (b) => b.click());   // (the keyboard's Half/Full button)
          await page.waitForFunction((sel) => !document.querySelector(sel).getAnimations().length, sel);   // (its height has finished easing)
          await page.waitForTimeout(500);
          // (Full, waited for: a slow runner's frames can run late; it still has to get there, and to stay.)
          await page.waitForFunction(([sel, h0]) => document.querySelector(sel).getBoundingClientRect().height >= h0 + 20, [sel, h0], { timeout: 5000 }).catch(() => {});
          const full = await height(sel);
          if (full < h0 + 20) throw new Error(`${name}: the grabber did not open Full (${Math.round(full)} px, Half ${Math.round(h0)})`);
          if (how === 'slow') await pull(sel, 300, { steps: 20, hold: 150 });
          else await flick(sel);
          if (how === 'regrab') { await page.waitForTimeout(60); await pull(sel, 20, { hold: 150 }); }   // (caught while it eases to Half)
          await expectOpen(sel, true, `${name}, a ${how} pull from Full`);
          const h = await height(sel);
          if (Math.abs(h - h0) > Math.abs(h - full)) throw new Error(`${name}: a ${how} pull from Full settled at ${h} px, not Half (${h0})`);
        }
      }
      // From Half (or a sheet's one height): a short pull caught again while it eases back and pulled on closes it.
      await pull(sel, 30, { hold: 150 });
      await page.waitForTimeout(60);
      if (sizes || tab !== 'history') await pull(sel, 320, { steps: 20, hold: 150 });
      else await flick(sel);
      await expectOpen(sel, false, `${name}, a pull from Half`);
      // And a flick from Half closes it.
      await openIt(tab, sel);
      await flick(sel);
      await expectOpen(sel, false, `${name}, a flick from Half`);
    }
    const bad = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return [...new Set(window.__bad)].slice(0, 4); });
    if (bad.length) throw new Error(bad.join('; '));
  });
  // The Doppler tab of a phone's Tests card: the Peak, Trough, Pulsatility and CI tiles are on top of the play bar at Half and at Full
  // (the play bar once covered the card's bottom edge), and the one-line note under them shows only at Full.
  if (device === 'phone') await check(device, 'thumb dock: Doppler tiles show at Half and Full, the note only at Full', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.click('#thumbBar [data-tab="tests"]');
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('#dock [data-instrument="doppler"]').click());
    await page.waitForFunction(() => document.querySelector('#dock .dop-stats > div:not([hidden]) dd')?.textContent.trim(), null, { timeout: 60000 });
    const look = () => page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#dock .dop-stats > div:not([hidden])')], note = document.querySelector('#dock .dop-note');
      // (the play bar's parts and the tab row are what could be drawn over a tile: each must be clear of it or invisible)
      const over = (t) => { const a = t.getBoundingClientRect(); return [...document.querySelectorAll('.vdock > *')].some((e) => { const r = e.getBoundingClientRect(); return +getComputedStyle(e).opacity > 0.05 && r.width && r.top < a.bottom && r.bottom > a.top; }); };
      return { n: tiles.length, covered: tiles.filter(over).length, note: note.textContent.trim() && getComputedStyle(note).display !== 'none' };
    });
    await page.waitForTimeout(600);
    let v = await look();
    if (v.n < 4 || v.covered) throw new Error(`at Half ${v.n} Doppler tiles, ${v.covered} covered`);
    if (v.note) throw new Error('the Doppler note shows at Half');
    await page.$eval('#dock .sheet-grab', (b) => b.click());   // (the keyboard's Half/Full button: no touch reaches it)
    await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);   // (its height has finished easing)
    await page.waitForTimeout(900);
    v = await look();
    if (v.n < 4 || v.covered) throw new Error(`at Full ${v.n} Doppler tiles, ${v.covered} covered`);
    if (!v.note) throw new Error('the Doppler note is missing at Full');
  });
  // History sits beside Treat and Tests in a laptop's top bar (not in the play bar) and opens as a card on the right, in Treat's place.
  if (device === 'desktop') await check(device, 'History: a top-bar button beside Tests, its card on the right in Treat\'s place', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !!document.querySelector('.vdock .tl-hist')?.offsetParent)) throw new Error('History is still in the play bar');
    const order = await page.$$eval('.top-right > button', (els) => els.filter((e) => e.offsetParent).map((e) => e.id));
    if (order.indexOf('btnHistory') !== order.indexOf('tabInstruments') + 1) throw new Error(`History is not beside Tests: ${order.join(', ')}`);
    await page.click('#btnHistory');
    await page.waitForSelector('#historyCard:not([hidden]) :is(.tl-pop-row, .tl-pop-empty)');   // (a new patient may have no event yet: events wait for breath-averaged readings)
    const r = await page.evaluate(() => { const c = document.querySelector('#historyCard').getBoundingClientRect(); return innerWidth - c.right; });
    if (r > 40) throw new Error(`the History card sits ${Math.round(r)} px from the right edge`);
    await tapTool(page, '#btnTreat');
    await page.waitForSelector('#treatCard:not([hidden])');
    if (await page.evaluate(() => !document.querySelector('#historyCard').hidden)) throw new Error('History stayed open under Treat');
    await page.click('#btnHistory');
    await page.waitForSelector('#treatCard', { state: 'hidden' });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#historyCard', { state: 'hidden' });
  });
  // Nothing that floats over the figure may cover another floating piece, or leave the screen, at the
  // sizes the owner tests on (laptop, iPad both ways, iPhone both ways), in Explore, with the
  // instruments, and with the patient chart and the instruments together.
  // The bottom bar's key readouts: every name, value and rating stays on one line inside its tile, the lines under each other never
  // overlap, on a phone the ratings sit left-aligned under their values with the tiles side by side at one height, and different
  // readings (a healthy patient, a decompensated one) never change a tile's size or place.
  await check(device, 'bottom bar: nothing wraps, clips or overlaps, and the readouts keep their place as values change', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [1024, 768], [820, 1180]] : [[390, 844], [360, 740], [320, 568], [375, 667], [430, 932], [844, 390]];
    const read = () => page.evaluate(() => {
      const strip = document.querySelector('#strip');
      const tiles = [...strip.querySelectorAll('.metric')].filter((e) => e.offsetWidth && getComputedStyle(e).display !== 'none');
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      return { tiles: tiles.map((m) => {
        const parts = ['.k', '.v', '.rb', '.s'].map((q) => m.querySelector(q)).filter((e) => e && e.offsetWidth).map((e) => ({ q: e.className.split(' ')[0], ...R(e), clip: e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('rb') }));
        return { id: m.dataset.id, ...R(m), parts, sNode: R(m.querySelector('.s .status') || m.querySelector('.s')) };
      }), strip: R(strip) };
    });
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const seen = [];
      for (const q of ['?preset=cirr-decomp', '?preset=healthy']) {
        await open(page, q);
        await page.waitForTimeout(900);
        const r = await read();
        const where = `${w}x${hgt} ${q}`;
        if (r.tiles.length < 2) throw new Error(`${where}: fewer than two readouts show`);
        for (const t of r.tiles) {
          for (const p of t.parts) if (p.clip) throw new Error(`${where}: the ${p.q} of "${t.id}" is clipped or wraps (${Math.round(p.w)} px)`);
          // (Side by side on one line, as on a Mac's slim play row, or stacked: two lines overlap only where their boxes cross.)
          for (let i = 1; i < t.parts.length; i++) if (t.parts[i].t < t.parts[i - 1].b - 0.5 && t.parts[i].l < t.parts[i - 1].r - 0.5 && t.parts[i].r > t.parts[i - 1].l + 0.5) throw new Error(`${where}: "${t.id}" ${t.parts[i].q} overlaps ${t.parts[i - 1].q}`);
          if (t.parts.some((p) => p.l < t.l - 0.5 || p.r > t.r + 0.5)) throw new Error(`${where}: a line of "${t.id}" sticks out of its tile`);
        }
        for (let i = 1; i < r.tiles.length; i++) if (r.tiles[i].l < r.tiles[i - 1].r - 0.5 && r.tiles[i].t < r.tiles[i - 1].b - 0.5 && r.tiles[i].b > r.tiles[i - 1].t + 0.5) throw new Error(`${where}: readouts "${r.tiles[i - 1].id}" and "${r.tiles[i].id}" overlap`);
        if (r.tiles.some((t) => t.r > r.strip.r + 0.5)) throw new Error(`${where}: a readout runs out of the strip`);
        // The rest of the bar: the play row's parts stay inside the bar, never overlap, and the buttons are touch-sized. No pill floats above it.
        const bar = await page.evaluate(() => {
          const dock = document.querySelector('#vdock').getBoundingClientRect();
          const parts = ['.tl-split', '.tl-time', '.tl-ff', '.tl-hist', '.tl-pin'].map((q) => [q, document.querySelector(q)])
            .filter(([, e]) => e && e.offsetWidth && !e.closest('[hidden]') && getComputedStyle(e).opacity !== '0')
            .map(([q, e]) => { const b = e.getBoundingClientRect(); return { q, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; });
          return { dock: { l: dock.left, r: dock.right, t: dock.top, b: dock.bottom }, parts, floaters: document.querySelectorAll('.tl-latest, .narrator, .bleed-pill, .vd-note, #vdStatus').length, thumb: document.querySelector('#app').classList.contains('thumb') };
        });
        if (bar.floaters) throw new Error(`${where}: a pill (event, narrator, bleed or note) is back above the timeline`);
        for (const p of bar.parts) {
          const box = bar.dock;
          if (p.l < box.l - 0.5 || p.r > box.r + 0.5 || p.t < box.t - 0.5 || p.b > box.b + 0.5) throw new Error(`${where}: ${p.q} sticks out of the bottom bar`);
          // (The Mac's Pin carries its word in a 34 px bordered button on the one-line play row, 29f1d0f; the icons are 36 px.)
          // (and a 320 px phone narrows the jump button to 30 px so both readings fit, f2d0dbd)
          const minH = p.q === '.tl-pin' && p.w > 40 ? 33.5 : 35.5, minW = p.q === '.tl-ff' && w < 360 ? 29.5 : 35.5;
          if (/tl-(ff|hist|pin)/.test(p.q) && (p.w < minW || p.h < minH)) throw new Error(`${where}: ${p.q} is smaller than a 36 px button`);
        }
        for (let i = 0; i < bar.parts.length; i++) for (let j = i + 1; j < bar.parts.length; j++) { const a = bar.parts[i], c = bar.parts[j]; if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) throw new Error(`${where}: ${a.q} overlaps ${c.q}`); }
        if (w < 768 && hgt > 500) {
          if (new Set(r.tiles.map((t) => Math.round(t.t))).size > 1) throw new Error(`${where}: the readouts do not line up (tops ${r.tiles.map((t) => Math.round(t.t))})`);
          if (new Set(r.tiles.map((t) => Math.round(t.h))).size > 1) throw new Error(`${where}: the readouts differ in height`);
          // (The one-line play row, 29f1d0f, shows no rating under a value; where one shows, it sits under it.)
          for (const t of r.tiles) { const v = t.parts.find((p) => p.q === 'v'), s = t.parts.find((p) => p.q === 's') || t.parts.find((p) => p.q === 'rb'); if (v && s && Math.abs(v.l - s.l) > 1) throw new Error(`${where}: the rating of "${t.id}" is not under its value`); }
        }
        seen.push({ q, tiles: r.tiles.map((t) => [t.id, Math.round(t.l), Math.round(t.t), Math.round(t.w), Math.round(t.h)].join(':')).join(' '), strip: Math.round(r.strip.h) });
      }
      if (seen[0].tiles !== seen[1].tiles || seen[0].strip !== seen[1].strip) throw new Error(`${w}x${hgt}: the readouts moved or resized between two patients (${seen[0].tiles} | ${seen[1].tiles})`);
    }
  });

  // Every word in the bottom bar's readout row stays inside the row, the bar and the screen, in Explore and in the lobule view
  // (16 Oct: a reserved width for the readings pushed the lobule's "Portal in 36" 6 px past a 390 px phone's bar).
  // (and the readings share the room right of the play row evenly: no empty run there, before the first reading, between two or
  // after the last, is wider than the gap between two readings, measured on the letters' ink; a name over its number keeps
  // 16 px or more from the next reading on both lines. 16 Oct: it had piled up past the last reading, and the tiles crowded.)
  await check(device, 'readout row: no word runs past the row, the bar or the screen, or under 12 px, and the readings spaced evenly, in Explore and the lobule', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [1024, 768], [820, 1180], [768, 1024]] : [[320, 568], [360, 780], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375]];
    const bad = [];
    for (const [w, hgt] of sizes) for (const q of ['?preset=cirr-decomp', '?preset=healthy']) for (const lob of [false, true]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page, q);
      if (lob) { await page.evaluate(() => window.pps.store.set({ lobule: true })); await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 }); }
      await page.waitForTimeout(900);
      const out = await page.evaluate(() => {
        const strip = document.querySelector('#strip'), vd = document.querySelector('#vdock');
        if (!strip?.offsetWidth || !vd?.offsetWidth) return [];
        const sr = strip.getBoundingClientRect(), dr = vd.getBoundingClientRect(), right = Math.min(sr.right, dr.right, innerWidth), res = [];
        // (the row's room starts where the play row's last button ends: the readings may use the strip's edge, not a button)
        const playEnd = Math.max(-Infinity, ...[...vd.querySelectorAll('.timeline :is(button, .tl-time)')].filter((e) => e.checkVisibility()).map((e) => e.getBoundingClientRect().right));
        const left = Math.max(playEnd > -Infinity ? playEnd : sr.left, dr.left, 0);
        const walk = document.createTreeWalker(strip, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
          if (!t.textContent.trim() || !t.parentElement.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          const g = document.createRange(); g.selectNodeContents(t); const b = g.getBoundingClientRect();
          if (b.width && (b.right > right + 0.5 || b.left < left - 0.5)) res.push(`"${t.textContent.trim()}" ${Math.round(Math.max(b.right - right, left - b.left))} px out`);
          if (b.width && parseFloat(getComputedStyle(t.parentElement).fontSize) < 11.95) res.push(`"${t.textContent.trim()}" at ${getComputedStyle(t.parentElement).fontSize}`);   // (and at 12 px or more)
        }
        // The spacing, on ink: a word's ink from its baseline and the font's measured glyphs; an icon button's from its icon; a
        // reading's slot (the room kept for its usual value) counts as taken.
        const vis = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }), cv = document.createElement('canvas').getContext('2d');
        const ink = (el) => {
          const g = document.createRange(); g.selectNodeContents(el); const b = g.getBoundingClientRect(), s = getComputedStyle(el);
          cv.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; cv.letterSpacing = s.letterSpacing;
          const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0'; el.appendChild(m); const base = m.getBoundingClientRect().bottom; m.remove();
          const t = cv.measureText(el.textContent); return { l: b.left + Math.max(0, -t.actualBoundingBoxLeft), r: b.left + t.actualBoundingBoxRight, t: base - t.actualBoundingBoxAscent, b: base + t.actualBoundingBoxDescent };
        };
        let start = -Infinity;   // the play row's last ink, or the hairline before the readings
        for (const el of vd.querySelectorAll('.timeline :is(button, .tl-time)')) {
          if (!vis(el)) continue;
          const lab = [...el.querySelectorAll('span')].find((e) => vis(e) && e.getBoundingClientRect().width && e.textContent.trim());
          const r = el.matches('.tl-time') && lab ? ink(lab) : lab ? el.getBoundingClientRect() : (el.querySelector('svg use, svg') || el).getBoundingClientRect();
          if (r.right > r.left || r.r > r.l) start = Math.max(start, r.r ?? r.right);
        }
        const ro = strip.closest('.readouts') || strip; if (parseFloat(getComputedStyle(ro).borderLeftWidth) > 0) start = Math.max(start, ro.getBoundingClientRect().left + 1);
        const tiles = [...strip.querySelectorAll('.metric')].filter((m) => m.offsetWidth && vis(m)).map((m) => {
          const k = [...m.querySelectorAll('.k > *, .k')].find((e) => e.offsetWidth && !e.children.length && vis(e)), v = m.querySelector('.val'), u = m.querySelector('.v .unit'), vv = m.querySelector('.v');
          const kb = ink(k), vb = ink(v); let r = Math.max(vb.r, v.getBoundingClientRect().right);
          if (u && vis(u) && u.getBoundingClientRect().width) r = Math.max(r, ink(u).r);
          if (parseFloat(getComputedStyle(vv).minWidth) > 0) r = Math.max(r, vv.getBoundingClientRect().right);
          return { id: m.dataset.id, l: Math.min(kb.l, vb.l), r: Math.max(kb.r, r), k: kb, v: { l: vb.l, r, t: vb.t } };
        }).sort((a, b) => a.l - b.l);
        if (tiles.length > 1 && start > -Infinity) {
          const gaps = tiles.slice(1).map((t, i) => t.l - tiles[i].r), gap = Math.min(...gaps);
          const runs = [['before the first', tiles[0].l - start], ['after the last', dr.right - tiles[tiles.length - 1].r]];
          for (const [where, run] of runs) if (run > gap + 0.5) res.push(`${Math.round(run)} px empty ${where} reading, more than the ${Math.round(gap)} px between readings`);
          if (gap < 4) res.push(`readings ${Math.round(gap)} px apart`);
          if (tiles[0].k.b <= tiles[0].v.t + 1)   // (a name over its number)
            tiles.slice(1).forEach((t, i) => { const a = tiles[i]; const gk = t.k.l - a.k.r, gv = t.v.l - a.v.r; if (Math.min(gk, gv) < 15.5) res.push(`${a.id} and ${t.id} ${Math.round(Math.min(gk, gv))} px apart`); });
        }
        return res;
      });
      if (out.length) bad.push(`${w}x${hgt} ${q}${lob ? ' lobule' : ''}: ${out.join(', ')}`);
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join('; '));
  });
  await check(device, 'floating pieces never overlap', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [820, 1180]] : [[390, 844], [844, 390]];
    const states = [['?preset=cirr-decomp', null], ['?preset=cirr-decomp', 'measure'], ['?preset=cirr-decomp', 'both'], ['?preset=cirr-decomp', 'card'], ['?preset=cirr-decomp', 'lobule']];
    for (const [w, hgt] of sizes) for (const [q, act] of states) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page, q);
      if (act === 'measure' || act === 'both') { await tapTool(page, '#tabInstruments'); await page.waitForSelector('#dockBody .dock-pane.active'); }
      if (act === 'both') await page.evaluate(() => window.pps.details({ type: 'edge', id: 'PV_TRUNK' }));
      if (act === 'lobule') {
        await page.evaluate(() => window.pps.store.set({ lobule: true }));
        await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
        await page.waitForTimeout(600);
      }
      if (act === 'card') { await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } })); await page.waitForSelector('.action-card:not([hidden])'); }
      await page.waitForTimeout(700);
      // The floating pieces follow each other's sizes a frame later (main.js publishes them on the next
      // animation frame), and the model keeps changing them (a bleed adds a line to the dock): an overlap
      // counts only if it is still there a few frames later.
      const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const measure = () => page.evaluate(() => {
        const SEL = ['.tb-id', '.top-right', '#viewSeg', '.topbar .sb-right', '.sb-center.float-ui', '#vdock', '#panel', '#treatCard:not([hidden])', '#dock', '#zoomPill', '.action-card:not([hidden])'];
        // (A piece whose holder is faded out counts as hidden: the view switch's pill fades while a card is open.)
        const vis = (el) => { const st = getComputedStyle(el), r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && el.checkVisibility({ opacityProperty: true }) && +st.opacity > 0.05 && r.width > 2 && r.height > 2; };
        // On a phone, and in the thumb layout (an upright iPad), the chart, Treat, the instruments and a vessel's card are sheets
        // that rise from behind the tab row by design.
        const sheet = (el) => el.classList.contains('docked') || ((document.querySelector('#app').classList.contains('thumb') || matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px)').matches) && (el.id === 'panel' || el.id === 'treatCard' || (el.id === 'dock' && !el.classList.contains('side'))));
        const items = SEL.flatMap((s) => [...document.querySelectorAll(s)].filter(vis).map((el) => [s, el.getBoundingClientRect(), el]));
        const out = [];
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const [a, A, ea] = items[i], [c, C, ec] = items[j];
          if ((sheet(ea) || sheet(ec)) && [a, c].some((x) => x === '#vdock' || x === '#zoomPill')) continue;
          const x = Math.min(A.right, C.right) - Math.max(A.left, C.left), y = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
          if (x > 1 && y > 1) out.push(`${a} covers ${c}`);
        }
        for (const [s, r] of items) if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) out.push(`${s} is off screen`);
        return out;
      });
      // The cards slide in: measure where they settle, not where they are on the way.
      await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && ['panel', 'treatCard', 'dock'].includes(a.effect?.target?.id)), null, { timeout: 60000 });
      let bad = await measure();
      // A slow machine can take several frames to follow a change in size (a bleed adds a line to the dock).
      for (let i = 0; i < 4 && bad.length; i++) { await frames(); bad = await measure(); }
      if (bad.length) throw new Error(`${w}×${hgt} ${q}${act ? ' + ' + act : ''}: ${bad.join('; ')}`);
    }
  });
  // A vessel's or organ's card open first, then Tests, Treat or History opened over it (Mac, iPad): the card moves clear of them,
  // with its leader, never left under one (it used to stay put, hidden under the Tests card with its dashed line still pointing at it).
  if (device === 'desktop') await check(device, 'an open vessel card moves clear of Tests, Treat and History', async (page) => {
    const out = [];
    for (const [w, hgt] of [[1440, 900], [1280, 800], [1024, 768], [1180, 820], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const sel of [{ type: 'edge', id: 'PV_TRUNK' }, { type: 'edge', id: 'V_SPL' }, { type: 'organ', id: 'liver' }]) for (const [btn, card] of [['#tabInstruments', '#dock'], ['#btnTreat', '#treatCard'], ['#btnHistory', '#historyCard']]) {
        await open(page, '?preset=cirr-decomp');
        await page.evaluate((s) => window.pps.store.set({ selection: s }), sel);
        await page.waitForSelector('.action-card:not([hidden])'); await page.waitForTimeout(700);
        await page.evaluate((b) => document.querySelector(b).click(), btn);   // (the top bar's buttons, as a click; History has no tab of its own)
        await page.waitForSelector(`${card}:not([hidden])`).catch((e) => { throw new Error(`${w}x${hgt} ${sel.id}: ${btn} opened no ${card}`, { cause: e }); });
        await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && ['panel', 'treatCard', 'historyCard', 'dock'].includes(a.effect?.target?.id)), null, { timeout: 60000 });
        let bad = null;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(150);
          bad = await page.evaluate((cs) => {
            const a = document.querySelector('.action-card:not([hidden])'), c = document.querySelector(cs);
            if (!a) return null;
            const A = a.getBoundingClientRect(), C = c.getBoundingClientRect();
            return Math.min(A.right, C.right) - Math.max(A.left, C.left) > 1 && Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top) > 1 ? `${Math.round(Math.min(A.right, C.right) - Math.max(A.left, C.left))} px` : null;
          }, card);
          if (!bad) break;
        }
        if (bad) out.push(`${w}x${hgt} ${sel.id} + ${btn}: the card is ${bad} under ${card}`);
      }
    }
    if (out.length) throw new Error(out.join('; '));
  });
  // The corner credit never sits on or touches a card, a sheet, a bar or a slide's panels, in every mode and on every
  // slide of a deck; it may fade out only when no figure is left (src/ui/credit.js).
  await check(device, 'corner credit never touches a card', async (page) => {
    // (A phone held sideways too: the words' glass pane (.pz-shade) is a card like the others.)
    const sizes = device === 'desktop' ? [[1440, 900], [820, 1180]] : [[390, 844], [844, 390], [667, 375], [932, 430]];
    const creditHits = () => page.evaluate(() => {
      const c = document.querySelector('.stage-credit'), r = c.getBoundingClientRect();
      if (+getComputedStyle(c).opacity < 0.5) return [];
      const out = [];
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push('the screen edge');
      // The figure's own labels (station values, organ captions): never under the credit either.
      for (const g of document.querySelectorAll('#labels .lb:not(.lb-off)')) {
        let o = 1;
        for (let el = g; el && el !== document.body; el = el.parentElement) { const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') o = 0; o *= +st.opacity; }
        if (o < 0.05) continue;
        for (const t of g.querySelectorAll('text, .lb-bg')) {
          const q = t.getBoundingClientRect();
          if (q.width > 1 && q.left < r.right + 2 && q.right > r.left - 2 && q.top < r.bottom + 2 && q.bottom > r.top - 2) { out.push(`label ${g.dataset.key}`); break; }
        }
      }
      for (const el of document.querySelectorAll('.stage-blocker:not([hidden]), .menu, .pz-text, .pz-data, .pz-panel, .pz-bar, .pz-shade')) {
        const st = getComputedStyle(el), q = el.getBoundingClientRect();
        if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.05 || !q.width) continue;
        if (q.left < r.right + 4 && q.right > r.left - 4 && q.top < r.bottom + 4 && q.bottom > r.top - 4) out.push(el.id || el.className.split(' ')[0]);
      }
      return out;
    });
    const settle = async () => { await page.waitForTimeout(900); await page.waitForFunction(() => !document.querySelector('.stage-credit.moving'), null, { timeout: 5000 }).catch(() => {}); };
    const verify = async (what) => {
      await settle();
      let bad = await creditHits();
      for (let i = 0; i < 3 && bad.length; i++) { await settle(); bad = await creditHits(); }
      if (bad.length) throw new Error(`${what}: the credit touches ${bad.join(', ')}`);
    };
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const at = `${w}×${hgt}`;
      await open(page, '?preset=cirr-decomp'); await verify(`${at} explore`);
      await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } })); await verify(`${at} vessel card`);
      await open(page, '?preset=cirr-decomp'); await tapTool(page, '#tabInstruments'); await verify(`${at} tests`);
      await page.evaluate(() => window.pps.details({ type: 'edge', id: 'PV_TRUNK' })); await verify(`${at} tests + details`);
      await open(page, '?script=circulation');
      for (let i = 0; i < 8; i++) { await verify(`${at} slide ${i + 1}`); await page.keyboard.press('ArrowRight'); }
    }
  });
  // A phone held sideways is laid out like a narrow iPad: one bar row, Tests docked on the right at full height, the
  // play bar ending at the card, the figure framed in the space left of it, and every test's controls and heading
  // inside the card (styles/app.css, sideways block; dock.js isSide).
  if (device === 'phone') await check(device, 'sideways phone docks Tests on the right', async (page) => {
    for (const [w, hgt] of [[844, 390], [667, 375]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      for (const id of ['profile', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan']) {
        await page.evaluate((i) => window.pps.dock.show(i, { reveal: true }), id);
        await page.waitForTimeout(700);
        await page.waitForFunction(() => !document.querySelector('#dock').getAnimations({ subtree: false }).some((a) => a.playState === 'running') && document.querySelector('#dock').getBoundingClientRect().right <= innerWidth, null, { timeout: 5000 }).catch(() => {});
        const bad = await page.evaluate(() => {
          const out = [], R = (s) => document.querySelector(s).getBoundingClientRect();
          const tb = document.querySelector('#topbar'), dock = R('#dock'), vd = R('#vdock');
          if (tb.classList.contains('two-rows') || tb.offsetHeight > 60) out.push(`top bar takes ${tb.offsetHeight} px`);
          if (!document.querySelector('#dock').classList.contains('side')) out.push('Tests is not docked at the side');
          if (dock.right > innerWidth + 1 || dock.top > tb.offsetHeight + 8 || dock.bottom < innerHeight - 20) out.push(`Tests card ${Math.round(dock.top)}-${Math.round(dock.bottom)} right ${Math.round(dock.right)}/${innerWidth}, bar ${tb.offsetHeight}, not full height`);
          if (vd.right > dock.left) out.push('the play bar runs under the Tests card');
          const pane = document.querySelector('#dock .dock-pane.active');
          for (const el of pane.querySelectorAll('*')) {
            const st = getComputedStyle(el);
            if (!el.offsetWidth || st.overflowX === 'auto' || st.overflowX === 'scroll') continue;
            if (/^(h3|h4)$/i.test(el.tagName) || el.matches('[class*="-head"]')) {
              const q = el.getBoundingClientRect();
              if (q.left < dock.left - 1 || q.right > dock.right + 1) out.push(`${el.className || el.tagName} spills out of the card`);
              if (el.scrollWidth > el.clientWidth + 2 && st.overflowX !== 'hidden') out.push(`${el.className || el.tagName} overflows by ${el.scrollWidth - el.clientWidth} px`);
            }
          }
          // The figure is framed left of the card: its labels sit in the space the card leaves.
          const lbs = [...document.querySelectorAll('#labels .lb:not(.lb-off) text')].map((t) => t.getBoundingClientRect()).filter((q) => q.width > 1);
          const under = lbs.filter((q) => q.left + q.width / 2 > dock.left);
          if (!lbs.length || under.length > lbs.length / 3) out.push(`figure framed under the card (${under.length}/${lbs.length} labels)`);
          return out;
        });
        if (bad.length) throw new Error(`${w}×${hgt} ${id}: ${bad.join('; ')}`);
      }
    }
  });
  // Every Tests picture fits its pane on an iPad, upright and sideways, at the card's default and a low dragged height:
  // no chart box taller than the pane, and no block of the pane drawn over another.
  if (device === 'desktop') await check(device, 'Tests pictures fit their pane on an iPad', async (page) => {
    for (const [w, hgt] of [[820, 1180], [1180, 820]]) for (const hr of [null, 0.25]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      await page.evaluate((v) => { if (v == null) localStorage.removeItem('pps.instruments'); else localStorage.setItem('pps.instruments', JSON.stringify({ open: ['profile'], h: v })); }, hr);
      await open(page);
      for (const id of ['profile', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan']) {
        await page.evaluate((i) => window.pps.dock.show(i, { reveal: true }), id);
        await page.waitForTimeout(800);
        const bad = await page.evaluate(() => {
          const pane = document.querySelector('#dock .dock-pane.active'), pr = pane.getBoundingClientRect(), out = [];
          const els = [...pane.querySelectorAll('.instrument-view > *, .chart-box')].filter((e) => e.offsetHeight > 0);
          for (const e of els) { const q = e.getBoundingClientRect(); if (e.matches('.chart-box') && q.height > pr.height + 2) out.push(`chart ${Math.round(q.height)} px in a ${Math.round(pr.height)} px pane`); }
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
            if (c.top < a.bottom - 2 && c.bottom > a.top + 2 && c.left < a.right - 2 && c.right > a.left + 2) out.push(`${els[i].className.split(' ')[0]} under ${els[j].className.split(' ')[0]}`);
          }
          return out;
        });
        if (bad.length) throw new Error(`${w}×${hgt}${hr ? ' low card' : ''} ${id}: ${bad.join('; ')}`);
      }
    }
    await page.evaluate(() => localStorage.removeItem('pps.instruments'));
  });
  // The figure's labels never sit on each other: at the home framing, for every patient, on a phone, an iPad
  // held upright and a laptop, in the anatomy and the circuit (stage.js layoutLabels, its last overlap pass).
  await check(device, 'figure labels never overlap', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [820, 1180]] : [[390, 844]];
    const presets = ['healthy', 'postprandial', 'pvt-acute', 'pvt-chronic', 'svt', 'schisto', 'cirr-comp', 'csph', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix', 'sos', 'budd-chiari', 'ivc-web', 'rhf', 'constrictive'];
    await open(page);
    const overlaps = () => page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#labels .lb:not(.lb-off)')].filter((g) => getComputedStyle(g).display !== 'none' && +getComputedStyle(g).opacity > 0.05)
        .map((g) => [g.dataset.key, [...g.querySelectorAll('text')].map((t) => t.getBoundingClientRect()).filter((r) => r.width > 1)]).filter(([, rs]) => rs.length);
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        for (const A of boxes[i][1]) for (const C of boxes[j][1]) {
          const x = Math.min(A.right, C.right) - Math.max(A.left, C.left), y = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
          if (x > 1.5 && y > 1.5) out.push(`${boxes[i][0]} × ${boxes[j][0]}`);
        }
      }
      return [...new Set(out)];
    });
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const id of presets) {
        await page.evaluate((p) => window.pps.loadPreset(p), id);
        for (const view of ['anatomic', 'circuit']) {
          await page.evaluate((v) => window.pps.store.set({ view: v }), view);
          await page.waitForTimeout(1200);
          const bad = await overlaps();
          // The sinusoids' callout hangs from the middle of their bed (half way along the drawn vessel), in both views.
          bad.push(...await page.evaluate(() => ['SIN_R', 'SIN_L'].flatMap((id) => {
            const a = window.pps.stage.labelAnchorOf(id), eid = { SIN_R: 'SIN_RR', SIN_L: 'SIN_LL' }[id];
            const p = document.querySelector(`.vg[data-id="${eid}"] .v-hit[role="button"]`);
            if (!a?.mid || !p) return [];
            const m = p.getPointAtLength(p.getTotalLength() / 2), c = p.getScreenCTM();
            const d = Math.hypot(c.a * m.x + c.c * m.y + c.e - a.x, c.b * m.x + c.d * m.y + c.f - a.y), len = p.getTotalLength() * Math.hypot(c.a, c.b);
            return d > Math.max(6, len * 0.08) ? [`${id} anchor ${Math.round(d)}px from the bed's middle`] : [];
          })));
        if (bad.length) throw new Error(`${w}×${hgt} ${id} ${view}: ${bad.join('; ')}`);
        }
        await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
      }
    }
  });
  // A Circuit station's reading never prints over a vessel: the figure is drawn with its labels hidden, and under each word of a reading
  // no vessel's colour shows (stage.js layoutLabels moves a reading off its vessel to a near clear spot, with a short leader). One with
  // no clear spot near its station stays, knocked out of its vessel by a solid halo with no flow arrowhead under it (.on-vessel).
  // (On 612a1c5 "4.1" sat on the liver's zigzag, RA's "mmHg" on its branch and Portal v.'s "mmHg" on the trunk at 375.)
  await check(device, 'presenter: Circuit readings sit clear of the vessels', async (page) => {
    const cases = device === 'desktop' ? [[820, 1180, [2, 4, 6]]] : [[375, 667, [2, 4, 6]], [390, 844, [2, 4, 6]], [320, 568, [2, 4]]];
    const out = [];
    for (const [w, hgt, list] of cases) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      let started = false;
      for (const n of list) {
        if (!started) { await page.evaluate((k) => window.pps.presenter.start('circuit', k), n - 1); started = true; } else await page.evaluate((k) => window.pps.presenter.go(k), n - 1);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'), n, { timeout: 120000 });
        await page.waitForTimeout(5000);
        const boxes = await page.evaluate(() => {
          const res = [];
          for (const g of document.querySelectorAll('#labels g.lb[data-key^="n:"]')) {
            if (getComputedStyle(g).display === 'none' || +getComputedStyle(g).opacity < 0.5) continue;
            if (g.classList.contains('on-vessel')) { if ([...g.querySelectorAll('text')].some((t) => parseFloat(getComputedStyle(t).strokeWidth) < 7 || getComputedStyle(t).stroke === 'none')) res.push({ k: g.dataset.key.slice(2), t: 'halo', x: 0, y: 0, w: 0, h: 0, thin: true }); continue; }
            for (const sp of g.querySelectorAll('tspan')) { const b = sp.getBoundingClientRect(); if (b.width > 1) res.push({ k: g.dataset.key.slice(2), t: sp.textContent, x: b.left, y: b.top + b.height * 0.22, w: b.width, h: b.height * 0.62 }); }
          }
          for (const e of document.querySelectorAll('#labels, .cath-labels')) e.style.visibility = 'hidden';
          return res;
        });
        await page.waitForTimeout(300);
        const png = (await page.screenshot({ scale: 'css' })).toString('base64');
        out.push(...await page.evaluate(async ({ png, boxes, at }) => {
          for (const e of document.querySelectorAll('#labels, .cath-labels')) e.style.visibility = '';
          const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const bad = [];
          for (const b of boxes) {
            if (b.thin) { bad.push(`${at}: ${b.k} sits on its vessel without its solid halo`); continue; }
            const d = x.getImageData(Math.round(b.x), Math.round(b.y), Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h))).data;
            let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 50) n++;
            if (n / (d.length / 4) > 0.02) bad.push(`${at}: ${b.k} "${b.t}" prints on a vessel (${Math.round((100 * n) / (d.length / 4))}% of it)`);
          }
          return bad;
        }, { png, boxes, at: `${w}x${hgt} Circuit ${n}` }));
      }
    }
    if (out.length) throw new Error(out.join('; '));
  });
  // Every Circuit slide at every size: every station's reading shows whole (its value too) unless a card covers its station, and no
  // leader, nor the station ring it starts from, runs within 2 px of another reading's halo (stage.js layoutLabels: the passes from 3
  // on, and the fallbacks after them). (Before this, "Esoph. varices" and its value went missing at 375 and 390 on slides 5, 6 and 9,
  // and RHV's leader ran under RA's "3.7" at 375.)
  // Not every reading has room yet on a small phone: the ones still hidden or without their value are counted, and the count may only
  // fall (MISSING_MAX: lower it with each round that shows more). The ones fixed so far must show: STRICT.
  const MISSING_MAX = { phone: 38, desktop: 23 }[device];
  const STRICT = { '375x667': { 5: ['VAR'], 6: ['VAR'] }, '390x844': { 5: ['VAR'], 6: ['VAR'], 9: ['VAR'] } };
  await check(device, 'presenter: every Circuit reading shows, and no leader runs into another reading', async (page) => {
    const cases = device === 'desktop' ? [[820, 1180], [1180, 820]] : [[375, 667], [390, 844], [320, 568]];
    const out = [], missing = [];
    for (const [w, hgt] of cases) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      for (let n = 1; n <= 10; n++) {
        if (n === 1) await page.evaluate(() => window.pps.presenter.start('circuit', 0)); else await page.evaluate((k) => window.pps.presenter.go(k), n - 1);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'), n, { timeout: 120000 });
        await page.waitForTimeout(4000);
        const found = await page.evaluate((at) => {
          const bad = [], miss = [], boxes = [];
          // (Covered: the point is under something other than the figure, a card, the slide's words or a callout on the figure, or
          // off the screen.)
          const calls = [...document.querySelectorAll('.cath-labels:not([hidden]) > *')].filter((c) => !c.classList.contains('off') && +getComputedStyle(c).opacity > 0.5).map((c) => c.getBoundingClientRect());
          const covered = (x, y) => { const e = document.elementFromPoint(x, y); return !e || !e.closest('#stageView') || calls.some((c) => x > c.left && x < c.right && y > c.top && y < c.bottom); };
          for (const g of document.querySelectorAll('#labels g.lb[data-key^="n:"]')) {
            const k = g.dataset.key.slice(2), r = g.getBoundingClientRect(), cs = getComputedStyle(g);
            const shown = cs.display !== 'none' && +cs.opacity >= 0.5 && r.width > 1;
            if (!shown) { if (r.width > 1 && !covered(r.left + r.width / 2, r.top + r.height / 2)) miss.push([k, `${at}: ${k} is hidden`]); continue; }
            if (!/\d/.test(g.textContent) && !covered(r.left + r.width / 2, r.top + r.height / 2)) miss.push([k, `${at}: ${k} shows "${g.textContent}" without its value`]);
            const t = g.querySelector('text'), m = parseFloat(getComputedStyle(t).strokeWidth) / 2 + 2;
            for (const sp of g.querySelectorAll('tspan')) { const b = sp.getBoundingClientRect(); if (b.width > 1) boxes.push({ k, x0: b.left - m, y0: b.top + b.height * 0.15 - m, x1: b.right + m, y1: b.top + b.height * 0.85 + m }); }
          }
          // (A reading given up for want of room is not drawn at all: stage.js lists it.)
          // (Its station under a card or off the screen excuses it, as for one hidden.)
          const lr = document.querySelector('#labels').getBoundingClientRect();
          for (const d of (document.querySelector('#labels .lb-blocks')?.dataset.dropped || '').split(' ').filter(Boolean)) {
            const [k, xy] = d.split('@'), [x, y] = (xy || '').split(',').map(Number);
            if (xy && !covered(lr.left + x, lr.top + y)) miss.push([k, `${at}: ${k} is left out`]);
          }
          const inBox = (x, y, b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
          for (const p of document.querySelectorAll('#labels path.leader:not(.ld-gone)')) {
            const L = p.getTotalLength(), ctm = p.getScreenCTM();
            if (L < 1) continue;
            const pt = (u) => { const q = p.getPointAtLength(u); return new DOMPoint(q.x, q.y).matrixTransform(ctm); };
            const a = pt(0), e = pt(L);
            // (Its own reading: the one nearest its far end, which stops a few px short of it: stage.js leaderEnd.)
            const gap = (b) => Math.hypot(Math.max(b.x0 - e.x, 0, e.x - b.x1), Math.max(b.y0 - e.y, 0, e.y - b.y1));
            const near = boxes.reduce((m, b) => (!m || gap(b) < gap(m) ? b : m), null);
            const own = near && gap(near) < 14 ? [near.k] : [];
            const hit = new Set();
            for (let u = 0; u <= L; u += 1.5) { const q = pt(u); for (const b of boxes) if (!own.includes(b.k) && inBox(q.x, q.y, b)) hit.add(b.k); }
            for (const b of boxes) if (!own.includes(b.k) && inBox(a.x, a.y, { x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3 })) hit.add(b.k);   // (the station ring, 3 px round)
            if (hit.size) bad.push(`${at}: the leader of ${own.join('/') || '?'} from (${Math.round(a.x)},${Math.round(a.y)}) runs into ${[...hit].join(', ')}`);
            // (It reaches its text: within 3 px of the words, as near as the glyph boxes measure.)
            const ownBoxes = [...document.querySelectorAll('#labels g.lb[data-key="n:' + own[0] + '"] tspan')].map((t) => t.getBoundingClientRect()).filter((b) => b.width > 1);
            const reach = Math.min(...ownBoxes.map((b) => Math.hypot(Math.max(b.left - e.x, 0, e.x - b.right), Math.max(b.top + b.height * 0.15 - e.y, 0, e.y - b.top - b.height * 0.85))));
            if (own.length && ownBoxes.length && reach > 4) bad.push(`${at}: the leader of ${own[0]} stops ${Math.round(reach)} px short of its text`);
          }
          // No reading's halo covers a station's ring (its own too), 2 px clear of the ring's 4 px radius. (Every visible dot has one in the list,
          // a station without a reading beside it too: the colon bed's, under the spleen's reading.)
          for (const xy of (document.querySelector('#labels .lb-blocks')?.dataset.rings || '').split(' ').filter(Boolean)) {
            const [x, y] = xy.split(',').map(Number), lr = document.querySelector('#labels').getBoundingClientRect(), cx = lr.left + x, cy = lr.top + y;
            const on = boxes.filter((b) => Math.hypot(Math.max(b.x0 - cx, 0, cx - b.x1), Math.max(b.y0 - cy, 0, cy - b.y1)) < 4).map((b) => b.k);
            if (on.length) bad.push(`${at}: ${[...new Set(on)].join(', ')} covers the station ring or dot at (${Math.round(cx)},${Math.round(cy)})`);
          }
          return { bad, miss };
        }, `${w}x${hgt} Circuit ${n}`);
        out.push(...found.bad);
        for (const [k, m] of found.miss) (STRICT[`${w}x${hgt}`]?.[n]?.includes(k) ? out : missing).push(m);
      }
    }
    if (missing.length > MISSING_MAX) out.push(`${missing.length} readings hidden or without their value, more than ${MISSING_MAX}: ${missing.join('; ')}`);
    if (out.length) throw new Error(out.join('; '));
    if (missing.length < MISSING_MAX) console.log(`  (${device}: ${missing.length} readings still hidden or without their value; lower MISSING_MAX to ${missing.length})`);
  });
  // The readings over the figure (the Circuit deck's resistors, a slide's measuring sites, the HVPG catheter's callouts) on a phone and
  // an iPad: every resistor with a ratio shows, whole on screen and clear of the slide's cards, and no figure label prints on any reading.
  // A 320 px phone's data card folded behind Show keeps its whole header: the title never cut (it had read "DOPPLER, THE ..." in a
  // card squeezed to 27 px, the title cut through), and the figure key's words are 12 px or more (they had read 11 px).
  if (device === 'phone') await check(device, 'presenter: a folded data card on a 320 px phone shows its whole title, and the key is 12 px', async (page) => {
    const out = [];
    for (const [w, hgt] of [[320, 568], [375, 667]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      const restore = await instantMotionOn(page);
      let started = false;
      for (const k of [2, 5, 8]) {   // (TIPS Doppler 3, 6 and 9: an instrument folded, and the velocity and direction keys)
        if (!started) { await page.evaluate((n) => window.pps.presenter.start('tips-doppler', n), k); started = true; }
        else await page.evaluate((n) => window.pps.presenter.go(n), k);
        await page.waitForFunction((n) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === n + 1 && !window.pps.presenter.busy(), k, { timeout: 60000 });
        await quiet(page); await page.waitForTimeout(600);
        out.push(...await page.evaluate((at) => {
          const bad = [], R = (e) => e.getBoundingClientRect();
          const dc = document.querySelector('.pz-data:not(.pz-hide):not([hidden])'), dh = dc?.querySelector('.pz-dh'), t = dh?.querySelector(':scope > span:first-child');
          if (t && getComputedStyle(dc).display !== 'none') {
            if (t.scrollWidth > t.clientWidth + 1) bad.push(`${at}: the card title "${t.textContent}" is cut (${t.scrollWidth} px in ${t.clientWidth})`);
            if (R(dh).bottom > R(dc).bottom + 0.5 || R(t).bottom > R(dc).bottom - 2) bad.push(`${at}: the card (to ${Math.round(R(dc).bottom)}) cuts its header (to ${Math.round(R(dh).bottom)})`);
          }
          const fk = document.querySelector('.pz-fk');
          if (fk && !fk.hidden && getComputedStyle(fk).display !== 'none') {
            let k = 1; for (let q = fk; q; q = q.parentElement) { const sc = getComputedStyle(q).scale; if (sc && sc !== 'none') k *= parseFloat(sc); }
            for (const e of [fk, ...fk.querySelectorAll('*')]) {
              if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
              const px = parseFloat(getComputedStyle(e).fontSize) * k;
              if (px < 11.95) bad.push(`${at}: the key's "${e.textContent.trim().slice(0, 16)}" is ${px.toFixed(1)} px`);
            }
            if (R(fk).right > innerWidth || R(fk).left < 0) bad.push(`${at}: the key runs off the screen`);
          }
          return bad;
        }, `${w}x${hgt} tips-doppler ${k + 1}`));
      }
      await page.keyboard.press('Escape');
      await restore?.();
    }
    if (out.length) throw new Error(out.slice(0, 6).join('; '));
  });
  await check(device, 'presenter: resistance readings and callouts show, clear of the cards and the figure labels', async (page) => {
    const sizes = device === 'desktop' ? [[820, 1180], [1180, 820], [1440, 900]] : [[390, 844], [375, 667], [320, 568]];
    // (Plus every other slide with a reading on the figure, and every slide whose words a 320 px phone had fitted under 12 px.)
    const more = 'hvpg 4,5,7,9;right-heart 3,5,7;shunts 2,5,6,8,9;stiffness 7;treatment 10;two-inflows 8;lobule 6;ncph 4;outflow 6,8;prehepatic 3,6;doppler 2,8;sites 3,8';
    const slides = [...Array.from({ length: 10 }, (_, i) => ['circuit', i]), ['hvpg', 2],
      ...more.split(';').flatMap((x) => { const [d, n] = x.split(' '); return n.split(',').map((k) => [d, k - 1]); })];
    const out = [];
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      const restore = await instantMotionOn(page);
      let deck = null;
      for (const [id, k] of slides) {
        if (deck !== id) { await page.evaluate(([d, n]) => window.pps.presenter.start(d, n), [id, k]); deck = id; }
        else await page.evaluate((n) => window.pps.presenter.go(n), k);
        await page.waitForFunction((n) => { window.pps.presenter.skipLapse?.(); document.querySelector('.pz-case.on')?.click(); return Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === n + 1 && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'); }, k, { timeout: 60000, polling: 100 })
          .catch((e) => { throw new Error(`${w}x${hgt} ${id} ${k + 1}: the slide never arrived`, { cause: e }); });
        await quiet(page); await page.waitForTimeout(600);
        out.push(...await page.evaluate((at) => {
          const bad = [], rect = (e) => e.getBoundingClientRect(), hit = (a, b, m = 1) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
          const shown = (e) => { const st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && rect(e).width > 1; };
          // A phone keeps the figure a fixed share of its height between the data card and the words' glass (presenter.js FIG_MIN),
          // or a little less (FIG_REG) where that keeps the words at Regular.
          const sh = document.querySelector('.pz-shade.stack'), dc = document.querySelector('.pz-data'), reg = !document.querySelector('.pz-text')?.style.getPropertyValue('--pz-fit');
          if (sh && dc && shown(dc) && !dc.classList.contains('pz-hide') && +getComputedStyle(sh).opacity > 0.5) {
            const room = rect(sh).top - rect(dc).bottom, need = Math.round(Math.max(170, (reg ? 0.25 : 0.3) * innerHeight)) - 2;
            if (room < need) bad.push(`${at}: the cards leave ${Math.round(room)} px of figure (at least ${Math.round(need + 2)})`);
          }
          // A phone's words never fit below 12 px (their body size times the card's fit).
          const tx = document.querySelector('.pz-text'), ln = tx && shown(tx) && tx.querySelector('.pz-line');
          if (sh && ln) { const px = parseFloat(getComputedStyle(ln).fontSize) * (parseFloat(tx.style.getPropertyValue('--pz-fit')) || 1) * (parseFloat(tx.style.getPropertyValue('--pz-z')) || 1); if (px < 11.95) bad.push(`${at}: the words are ${px.toFixed(1)} px`); }
          const cards = [...document.querySelectorAll('.stage-blocker:not([hidden])')].filter((e) => shown(e) && +getComputedStyle(e).opacity > 0.5 && !e.classList.contains('pz-hide'));
          const texts = [...document.querySelectorAll('#labels .lb:not(.lb-off)')].filter((g) => +getComputedStyle(g).opacity > 0.05)
            .flatMap((g) => [...g.querySelectorAll('text')].map((t) => [t.textContent.trim().slice(0, 18), rect(t)]).filter(([, r]) => r.width > 1));
          for (const el of document.querySelectorAll('.cath-label')) {
            if (el.closest('[hidden]') || el.classList.contains('cath-pre') || el.classList.contains('cath-out') || el.classList.contains('in-sum') || !shown(el)) continue;
            const name = `${el.querySelector('small')?.textContent} ${el.querySelector('b')?.textContent}`.trim(), res = el.classList.contains('res');
            if (res && el.classList.contains('off')) { if (el.querySelector('b').textContent) bad.push(`${at}: "${name}" is hidden`); continue; }
            if (el.classList.contains('off')) continue;
            const r = rect(el);
            if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) bad.push(`${at}: "${name}" runs off screen`);
            if (res) for (const c of cards) if (hit(r, rect(c))) bad.push(`${at}: "${name}" is under ${c.className.split(' ')[0]}`);
            for (const [t, q] of texts) if (hit(r, q, 1.5)) bad.push(`${at}: the "${t}" label prints on "${name}"`);
          }
          return bad;
        }, `${w}x${hgt} ${id} ${k + 1}`));
      }
      await restore();
    }
    if (out.length) throw new Error([...new Set(out)].join('; '));
  });
  // Scale and tick labels: the numbers under the lens pill's colour scale (and the other tick rows) never overlap, in any view,
  // lens or width; a scale too narrow for its numbers drops the ones between its ends first (styles: .lg-scale container queries).
  await check(device, 'tick labels clear of each other in every view', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1024, 768], [768, 1024]] : [[390, 844], [360, 740], [320, 640], [844, 390]];
    const clash = () => page.evaluate(() => {
      const out = [];
      for (const g of document.querySelectorAll('.lg-scale, .pzk-axis, .dop-ticks')) {
        const gr = g.getBoundingClientRect();
        if (!gr.width || !gr.height) continue;
        const rs = [...g.children].filter((c) => c.textContent.trim() && getComputedStyle(c).display !== 'none').map((c) => { const r = document.createRange(); r.selectNodeContents(c); const b = r.getBoundingClientRect(); return { t: c.textContent.trim(), l: b.left, r: b.right }; }).filter((x) => x.r > x.l).sort((a, b) => a.l - b.l);
        for (let i = 1; i < rs.length; i++) if (rs[i].l < rs[i - 1].r + 1) out.push(`"${rs[i - 1].t}" and "${rs[i].t}" overlap in a ${Math.round(gr.width)} px scale`);
      }
      return out;
    });
    await open(page, '?preset=cirr-decomp');
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const steps = [['anatomic', 'pressure'], ['anatomic', 'flow'], ['circuit', 'pressure'], ['lobule', 'pressure'], ['sinusoid', 'pressure']];
      for (const [view, lens] of steps) {
        await page.evaluate(([v, l]) => { window.pps.store.set({ colorMode: l }); const b = document.querySelector(`#viewSeg [data-view="${v}"]`); if (b && !b.hidden) b.click(); }, [view, lens]);
        await page.waitForTimeout(1300);
        const bad = await clash();
        if (bad.length) throw new Error(`${w}×${hgt} ${view} (${lens}): ${bad.join('; ')}`);
      }
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]')?.click());
    }
  });
  // The FibroScan probe's callout (its live kPa beside the waves): wherever the probe shows on the figure, in Explore with the FibroScan
  // card open and on every FibroScan slide, the callout shows too, inside the stage, and sits on no other label, the probe or its caption,
  // a site callout, a card, a bar or the credit (stage.js scanItem and layoutLabels place it before the other labels).
  await check(device, 'FibroScan reading on the probe body, clear of labels and the credit', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [820, 1180]] : [[390, 844]];
    const inspect = () => page.evaluate(() => {
      const probe = document.querySelector('.scan-probe:not(.off):not(.cath-pre)');
      const tool = !!document.querySelector('.pz-tool[data-kind="fibroscan"]');
      if (!probe) return { probe: false, tool };
      const wr = document.querySelector('#stageWrap').getBoundingClientRect(), tip = probe.querySelector('.sp-tip').getBoundingClientRect();
      if (tip.left < wr.left + 4 || tip.right > wr.right - 4 || tip.top < wr.top + 4 || tip.bottom > wr.bottom - 4) return { probe: false, tool };   // the camera has taken the liver off the stage
      const covered = [...document.querySelectorAll('.stage-blocker:not([hidden]), .pz-text, .pz-data, #dock, #panel')].some((e) => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return st.visibility !== 'hidden' && +st.opacity > 0.5 && r.width > 2 && tip.left < r.right && tip.right > r.left && tip.top < r.bottom && tip.bottom > r.top; });
      if (covered) return { probe: false, tool };   // the slide's own card sits over the probe: nothing to name
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const vis = (e) => { const st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && +st.opacity > 0.05; };
      const g = probe.querySelector('.sp-read');
      if (!g || !vis(probe)) return { probe: true, tool, shown: false };
      const pill = R(probe.querySelector('.sp-screen')), bad = [], others = [];
      const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
      const head = R(probe.querySelector('.sp-body'));
      if (pill.l < head.l - 1 || pill.r > head.r + 1 || pill.t < head.t - 1 || pill.b > head.b + 1) bad.push('reading off the probe body');
      // (At 45°, steeper beside the left edge and flatter below the top one, a0a9590e and e948cbf: the angle the probe was
      // given, --sp-turn, is the one it shows.)
      const m = new DOMMatrix(getComputedStyle(probe.querySelector('svg')).transform), turn = parseFloat(getComputedStyle(probe).getPropertyValue('--sp-turn')) || 45;
      if (Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI - turn) > 0.5) bad.push(`probe not at its ${turn}° (${m.a.toFixed(2)}, ${m.b.toFixed(2)})`);
      if (turn < 10 || turn > 80) bad.push(`probe turned ${turn}°, outside 10° to 80°`);
      if (parseFloat(getComputedStyle(probe.querySelector('.sp-unit')).fontSize) < 11) bad.push('reading smaller than 11 px');
      for (const e of document.querySelectorAll('#labels .lb:not(.lb-off)')) if (vis(e)) for (const t of e.querySelectorAll('text')) { const r = R(t); if (r.r - r.l > 1) others.push([`label ${e.dataset.key}`, r]); }
      for (const e of document.querySelectorAll('.cath-label.site, .stage-credit')) if (vis(e)) { const r = R(e); if (r.r - r.l > 2) others.push([e.id || e.className.split(' ')[0], r]); }
      for (const [n, r] of others) if (hit(pill, r)) bad.push(n);
      if (document.querySelector('#labels .lb[data-key="scan"]:not(.lb-off)')) bad.push('the old kPa pill still shows');
      const txt = g.textContent;
      const card = [...document.querySelectorAll('canvas[data-reading]')].find((c) => c.offsetParent !== null && c.getBoundingClientRect().width > 0);
      const val = probe.querySelector('.sp-val').textContent;
      if (card && val !== '--' && card.dataset.reading !== val) bad.push(`probe reads ${val}, card reads ${card.dataset.reading}`);   // same number, same rounding (read in one frame)
      if (!/(\d|--)/.test(txt) || !/kPa/.test(txt)) bad.push(`text "${txt}"`);
      return { probe: true, tool, shown: true, bad };
    });
    // The callout fades in with the probe, and a slide's camera glides first: it counts only if it is still wrong a few seconds later.
    // A slide that carries the FibroScan card (data-kind) shows the probe; one without it may still be fading the last one out.
    const settle = async (what, needTool, needProbe) => {   // needProbe: Explore must show the probe, so a first look while it is still fading in or the sheet is opening is not the answer
      let r = null;
      for (let i = 0; i < 48; i++) {
        await page.waitForTimeout(500); r = await inspect();
        if (needTool && !r.tool) continue;
        if (needProbe && !r.probe && i < 30) continue;
        if (!r.probe && needTool) { if (i > 30) return false; continue; }   // covered by the slide's own card, or off the stage: nothing to name
        if (!r.probe || (r.shown && !r.bad.length)) return r.probe;
      }
      if (!needTool && !r.tool) return false;
      throw new Error(`${what}: ${r.shown ? `callout touches ${r.bad.join(', ')}` : needTool && !r.tool ? 'the FibroScan card never showed' : 'the probe shows but its reading does not'}`);
    };
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const at = `${w}×${hgt}`;
      await open(page, '?preset=cirr-comp');
      await tapTool(page, '#tabInstruments'); await page.waitForSelector('#dockBody .dock-pane.active');
      await page.evaluate(() => window.pps.dock.show('fibroscan', { reveal: true }));
      if (!(await settle(`${at} explore`, false, true))) throw new Error(`${at} explore: no probe on the figure ${JSON.stringify(await inspect())}`);
      await open(page, '?script=stiffness');
      await page.waitForSelector('.pz-h'); await page.waitForTimeout(2000);
      let withProbe = 0;
      const FIBRO = [2, 3, 11];   // the stiffness deck's slides with the FibroScan card (the overview is slide 1; 12 slides in all)
      for (let n = 1; n <= 12; n++) {
        if (n > 1) { await page.keyboard.type(String(n)); await page.keyboard.press('Enter'); }
        if (await settle(`${at} slide ${n}`, FIBRO.includes(n))) withProbe++;
      }
      if (withProbe < Math.ceil(FIBRO.length / 2)) throw new Error(`${at}: only ${withProbe} of ${FIBRO.length} FibroScan slides showed the probe`);
    }
  });
  // One type scale and one icon scale (styles/tokens.css): every menu, card and sheet the owner can
  // open uses only the five interface sizes and three weights, icons come in 16, 20 and 24 (12 for a
  // check mark in a dot), and every button has a name. Figure artwork (the anatomy's labels, the
  // lobule's labels, the bedside monitor, charts drawn in SVG or on a canvas) has its own sizes.
  await check(device, 'one type and icon scale in every menu and card', async (page) => {
    const surfaces = [
      ['explore', null], ['menu', '#btnMenu'], ['blood', '#btnBlood'], ['colors', '#btnLayers'],
      ['treat', '#btnTreat'], ['measure', '#tabInstruments'], ['search', '#btnPalette'],
      ['vessel card', { type: 'edge', id: 'PV_TRUNK' }], ['liver card', { type: 'organ', id: 'liver' }],
      ['help', '?'], ['menu from a link', 'home'],
    ];
    const bad = new Set();
    await open(page, '?preset=cirr-decomp');
    for (const [name, how] of surfaces) {
      // one load for all of them: close whatever the last one opened
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await page.evaluate(() => { window.pps.store.set({ selection: null }); if (document.querySelector('#app').classList.contains('panel-open')) document.querySelector('#panelClose').click(); });
      if (how === 'home') await open(page, '?home=explore');
      if (typeof how === 'string' && how.startsWith('#')) await page.evaluate((s) => document.querySelector(s)?.click(), how);
      else if (how === '?') await page.keyboard.press('?');
      else if (how && typeof how === 'object') await page.evaluate((sel) => window.pps.store.set({ selection: sel }), how);
      await page.waitForTimeout(500);
      const found = await page.evaluate(() => {
        const ART = '#stage, #labels, .lz-lab, .lz-zone, .mon, .legend, svg';
        const DISPLAY = '.presenter-title, .big-overlay';
        const SIZES = [12, 14, 16, 20, 28], WEIGHTS = [400, 500, 600], ICONS = [16, 20, 24];
        const shown = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden'; };
        const who = (el) => { const c = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') : ''; return `${c(el.parentElement)} > ${c(el)}`; };
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (!shown(el) || el.closest('.lz:not(.on)')) continue;
          if (!el.closest(ART) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
            const st = getComputedStyle(el), fs = parseFloat(st.fontSize), fw = +st.fontWeight;
            if (!SIZES.includes(fs) && !el.closest(DISPLAY)) out.push(`${who(el)}: ${fs}px`);
            if (!WEIGHTS.includes(fw)) out.push(`${who(el)}: weight ${fw}`);
          }
          if (el.matches('svg') && el.querySelector(':scope > use[href^="#i-"]') && !el.closest('#stage, #labels')) {
            const w = Math.round(el.getBoundingClientRect().width), mark = el.querySelector('use').getAttribute('href') === '#i-check' && w === 12;
            if (!ICONS.includes(w) && !mark) out.push(`${who(el)} icon ${el.querySelector('use').getAttribute('href')}: ${w}px`);
          }
          if (el.matches('button, [role="button"]') && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby'))) out.push(`${who(el)}: button without a name`);
        }
        return out;
      });
      for (const f of found) bad.add(`${name}: ${f}`);
    }
    if (bad.size) throw new Error(`${bad.size} off-scale: ${[...bad].slice(0, 40).join(' | ')}`);
  });
  await check(device, 'tests card: every Ascites, HVPG and FibroScan row reaches the card\'s inner right edge', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 45000 });
    await tapTool(page, '#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    for (const id of ['abdomen', 'hvpg', 'fibroscan']) {
      await page.click(`.instr-tab[data-instrument="${id}"]`);
      // (A slow page draws few frames: wait for the transition to finish, not a fixed time.)
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !document.querySelector('#dock').getAnimations({ subtree: true }).length, null, { timeout: 20000 });   // (the Tests card; 26b17c4b had copied the quick check's .pz-check here, absent outside Present)
      const off = await page.evaluate((id) => {
        const pane = document.querySelector(`#pane-${id}`), view = pane.firstElementChild, R = (e) => e.getBoundingClientRect();
        const inner = R(pane).right - parseFloat(getComputedStyle(pane).paddingRight) - (pane.offsetWidth - pane.clientWidth);
        const vis = (e) => R(e).width > 0 && R(e).height > 0;
        let rows;
        if (id === 'abdomen') {
          // one column: every row reaches the edge; beside each other: the controls do, and the readings share their column's edge
          const two = getComputedStyle(view.querySelector('.ab-main')).gridTemplateColumns.split(' ').length > 1;
          const read = view.querySelector('.ab-read');
          const ref = two ? R(read).right - parseFloat(getComputedStyle(read).paddingRight) : inner;
          // (the drain sits in the belly's row, which is centred and reaches the edge as one block)
          rows = [...['.ab-ctl > .ab-row'].flatMap((q) => [...view.querySelectorAll(q)].map((e) => [e, inner])),
            ...['.ab-vol', '.ab-iap', '.ab-tiles'].flatMap((q) => [...view.querySelectorAll(q)].map((e) => [e, ref]))];
        } else {
          // a picture's box and the notes beside or under it; side by side, the right-most reaches the edge
          const kids = [...view.children].filter(vis);
          const two = Math.max(...kids.map((e) => R(e).left)) - Math.min(...kids.map((e) => R(e).left)) > 60;
          // (a box set to bleed into the card's padding, as a phone's HVPG monitor does by 10 px since da7516d, reaches exactly that far)
          const edge = (e) => inner - Math.min(0, parseFloat(getComputedStyle(e).marginRight) || 0);
          rows = two ? [kids.reduce((a, b) => (R(b).right > R(a).right ? b : a))].map((e) => [e, edge(e)]) : kids.map((e) => [e, edge(e)]);
        }
        return rows.filter(([e]) => vis(e)).map(([e, ref]) => [String(e.className).split(' ')[0], +(R(e).right - ref).toFixed(1)]).filter(([, d]) => Math.abs(d) > 1);
      }, id);
      if (off.length) throw new Error(`${id}: rows stop short of (or run past) the card's inner right edge: ${JSON.stringify(off)}`);
    }
  });
  await check(device, 'dark theme', async (page) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '?preset=budd-chiari');
    await page.waitForTimeout(800);
    await shot(page, `${device}-dark`);
  });
  await check(device, 'responsive instrument workspace', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // Let the first frames (shader compiles on a software GPU) finish before the first tap.
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 45000 });
    await tapTool(page, '#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    await page.waitForTimeout(400);
    // The card slides in: measure where it settles, not where it is on the way.
    const settled = () => page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.id === 'dock'), null, { timeout: 60000 });
    await settled();
    const geometry = () => page.evaluate(() => {
      const dock = document.querySelector('#dock').getBoundingClientRect();
      const stage = document.querySelector('#stageView').getBoundingClientRect();
      const panel = document.querySelector('#panel');
      // The workspace floats over the bottom of the full-screen figure: between it and the top bar
      // the anatomy must still have room.
      const top = document.querySelector('#topbar').getBoundingClientRect().bottom;
      // On a wide landscape screen the card is on the right (the figure keeps the width to its left);
      // otherwise it is a sheet (the figure keeps the height above it).
      const side = document.querySelector('#dock').classList.contains('side');
      return { stageH: stage.height, free: side ? dock.left : dock.top - top, side, dockTop: dock.top,
        dockRight: dock.right, width: innerWidth,
        scrim: getComputedStyle(document.querySelector('#panelScrim')).visibility,
        panel: getComputedStyle(panel).visibility };
    });
    let g = await geometry();
    if (g.stageH < 50 || g.free < (g.side ? 300 : 120)) throw new Error(`workspace leaves the anatomy ${Math.round(g.free)} px`);
    if (device === 'desktop' && !g.side) throw new Error('on a laptop the instruments should be a card on the right');
    if (g.dockRight > g.width + 1) throw new Error('workspace extends off screen');
    if (device === 'phone' && (g.scrim === 'visible' || g.panel === 'visible')) throw new Error('opening instruments also opens a patient overlay');
    const before = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(500);
    if (!((await page.evaluate(() => window.pps.store.get().frame.t)) > before)) throw new Error('opening instruments paused simulation');
    // A laptop or tablet resizes the card with its divider; a phone's sheet uses its handle instead.
    if (device !== 'phone') { await page.click('.workspace-divider'); await page.keyboard.press('ArrowUp'); }
    await page.evaluate(() => window.pps.timeline.togglePin());
    await page.waitForFunction(() => !!window.pps.store.get().compareSnap);
    await page.waitForSelector('.workspace-comparison:not([hidden])');
    // One tap on a tab chooses an instrument; each tab carries its live reading.
    if (await page.locator('.instr-tab').count() !== 7) throw new Error('the tabs must offer seven distinct instruments (Pressure holds both pressure views; Readouts lists every readout)');
    const choose = async (id) => {
      await page.click(`.instr-tab[data-instrument="${id}"]`);
      await page.waitForFunction((id) => document.querySelector(`.instr-tab[data-instrument="${id}"]`).getAttribute('aria-selected') === 'true', id);
      await page.waitForTimeout(250);
    };
    for (const id of ['scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'profile']) {
      if (id === 'scope') { await choose('profile'); if (!await page.locator('#pane-scope.active').count()) { await page.click('#pane-profile .ps-btn[data-view="scope"]'); await page.waitForTimeout(250); } }
      else await choose(id);
      const overflow = await page.$eval(`#pane-${id}`, (el) => el.scrollWidth - el.clientWidth);
      if (overflow > 2) throw new Error(`${id} has horizontal overflow (${overflow}px)`);
      const sized = await page.$eval(`#pane-${id}`, (el) => [...el.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().height > 0).every((c) => c.width > 1 && c.height > 1));
      if (!sized) throw new Error(`${id} has an unsized visible canvas`);
    }
    await page.evaluate(() => window.pps.dock.show('varixwall', { reveal: true }));
    if ((await page.$eval('#pane-endoscopy', (d) => d.dataset.sub)) !== 'wall') throw new Error('legacy varixwall route does not open Wall mechanics');
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await page.waitForFunction(() => !window.pps.store.get().running);
    await page.waitForTimeout(250);
    await settled();
    for (const v of ['wall', 'scope']) {
      await page.click(`#pane-endoscopy .ps-btn[data-view="${v}"]`);
      const sq = await page.$$eval('#pane-endoscopy .chart-box.square', (els) => els.map((el) => el.getBoundingClientRect()).filter((r) => r.width).map((r) => [r.width, r.height]));
      if (sq.length !== 1 || Math.abs(sq[0][0] - sq[0][1]) > 2 || sq[0][0] < 100) throw new Error(`endoscopy ${v} view is not one visible square: ${JSON.stringify(sq)}`);
    }
    await page.$eval('#pane-endoscopy', (el) => { el.scrollTop = 0; });
    await shot(page, `${device}-workspace-endoscopy`);
    if (device === 'phone') {
      // A phone's instruments are a bottom sheet: no minimise; a drag down on the handle closes them.
      await page.evaluate(() => window.pps.dock.setState('open'));
      await page.waitForTimeout(300);
      const g = await page.$eval('#dock .sheet-grab', (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.mouse.move(g[0], (page.viewportSize().height - 4), { steps: 8 }); await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('#app').classList.contains('dock-open')).catch(async () => { throw new Error('drag down did not close: ' + JSON.stringify(await page.evaluate(() => [document.querySelector('#app').className, document.querySelector('#dock').dataset.state, document.elementFromPoint(195, document.querySelector('#dock .sheet-grab').getBoundingClientRect().y + 9)?.className, document.querySelector('#dock').getBoundingClientRect().height])) + JSON.stringify(g)); });
      await page.evaluate(() => window.pps.dock.show('endoscopy', { reveal: true }));
    }
    if (device === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 });
      // As on a tablet: the relayout follows the resize event, so wait for it (up to 10 s).
      await page.waitForFunction(() => {
        const dock = document.querySelector('#dock').getBoundingClientRect(), stage = document.querySelector('#stageView').getBoundingClientRect();
        return dock.right <= innerWidth + 1 && stage.height >= 20;
      }, null, { timeout: 10000 }).catch((e) => { throw new Error('rotation makes workspace unusable', { cause: e }); });
      await shot(page, 'phone-workspace-landscape');
      await page.setViewportSize({ width: 390, height: 844 });
    } else {
      // The patient chart starts closed, so the workspace has the full width for two instruments.
      if (await page.evaluate(() => document.querySelector('#app').classList.contains('panel-open'))) throw new Error('the patient chart should start closed');
      await page.evaluate(() => window.pps.dock.show('doppler', { alongside: true }));
      await page.waitForSelector('#dockBody.split');
      await shot(page, 'desktop-workspace-two-instruments');
      await page.setViewportSize({ width: 768, height: 1024 });
      // The dock relayouts on the resize event, which a busy machine may deliver late: wait for it.
      await page.waitForFunction(() => !document.querySelector('#dockBody').classList.contains('split'), null, { timeout: 10000 }).catch((e) => { throw new Error('two cramped columns remain on tablet', { cause: e }); });
      await shot(page, 'tablet-workspace');
    }
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await page.waitForFunction(() => window.pps.store.get().running);
  });

  await check(device, 'HVPG procedure: the button holds still and every tap starts it', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => { window.pps.dock.show('hvpg'); window.pps.dock.setState('open'); });
    const sel = '[data-pane="hvpg"] .hvpg-bar .btn';
    await page.waitForSelector(sel, { state: 'visible' });
    // The card repaints on every model frame; the button must not change under a finger (Safari then drops the tap).
    const changes = await page.$eval(sel, (b) => new Promise((res) => {
      let n = 0; const mo = new MutationObserver((m) => { n += m.length; });
      mo.observe(b, { subtree: true, childList: true, characterData: true, attributes: true });
      setTimeout(() => { mo.disconnect(); res(n); }, 1500);
    }));
    if (changes) throw new Error(`the Measure HVPG button changed ${changes} times while idle`);
    // The sheet slides up: tap where the button settles, not where it is on the way.
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.id === 'dock'), null, { timeout: 60000 });
    if (device === 'phone') { const b = await page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.touchscreen.tap(b[0], b[1]); }
    else await page.click(sel);
    await page.waitForFunction((q) => document.querySelector(q).textContent.includes('Measuring'), sel, { timeout: 10000 }).catch((e) => { throw new Error('a tap on Measure HVPG did not start it', { cause: e }); });
  });

  // The HVPG deck's result slide: the summary (WHVP and FHVP bracketed to the HVPG) sits in the free figure, never
  // under the data card, the words or the slide controls (on a Mac it once went half under the pressure card).
  if (device === 'desktop') await check(device, 'presenter: the HVPG summary callout is never under a card, at every size', async (page) => {
    const out = [];
    for (const [width, height] of [[1440, 900], [1280, 800], [1920, 1080], [1180, 820], [820, 1180]]) {
      await page.setViewportSize({ width, height });
      await open(page, '?script=hvpg&slide=5');
      await page.waitForFunction(() => { const b = document.querySelector('.cath-sum-box .calc'); return b && +getComputedStyle(b).opacity > 0.9; }, null, { timeout: 60000 })
        .catch((e) => { throw new Error(`${width}x${height}: the HVPG summary never showed`, { cause: e }); });
      await page.waitForTimeout(2500);   // (the camera and the cards settle)
      out.push(...await page.evaluate((sz) => {
        const b = document.querySelector('.cath-sum-box').getBoundingClientRect(), bad = [];
        for (const el of document.querySelectorAll('.stage-blocker:not([hidden])')) {
          if (getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity < 0.5) continue;
          const q = el.getBoundingClientRect();
          if (q.width && Math.min(b.right, q.right) - Math.max(b.left, q.left) > 1 && Math.min(b.bottom, q.bottom) - Math.max(b.top, q.top) > 1) bad.push(`${sz}: the HVPG summary is under ${el.className.split(' ')[0]}`);
        }
        if (b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight) bad.push(`${sz}: the HVPG summary runs off screen`);
        return bad;
      }, `${width}x${height}`));
    }
    if (out.length) throw new Error(out.join('; '));
  });

  await check(device, 'HVPG procedure: each reading\'s shadow fades with its body, and no reading outlives its step', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => { window.pps.dock.show('hvpg'); window.pps.dock.setState('open'); });
    const sel = '[data-pane="hvpg"] .hvpg-bar .btn';
    await page.waitForSelector(sel, { state: 'visible' });
    await page.$eval(sel, (b) => b.click());
    // Every frame of the run: a label's shadow alpha (0.22 at full) tracks its children's opacity; once the
    // summary has gone (the camera heading home), no reading stays on screen.
    const bad = await page.evaluate(() => new Promise((res) => {
      const out = [], t0 = performance.now(); let sumSeen = 0, sumGone = 0;
      const tick = () => {
        const now = performance.now() - t0;
        const sum = document.querySelector('.cath-sum');
        if (sum) sumSeen = now; else if (sumSeen && !sumGone) sumGone = now;
        for (const l of document.querySelectorAll('.cath-label:not(.ghost):not(.res)')) {
          const sh = getComputedStyle(l).boxShadow; if (sh === 'none') continue;
          const m = sh.match(/rgba?\(([^)]+)\)/); const a = m ? +(m[1].split(',')[3] ?? 1) / 0.22 : 1;
          const o = +getComputedStyle(l.firstElementChild).opacity;
          if (Math.abs(a - o) > 0.2 && out.length < 5) out.push(`${l.className} shadow ${a.toFixed(2)} vs body ${o.toFixed(2)} at ${now | 0} ms`);
        }
        if (sumGone && now > sumGone + 100 && document.querySelector('.cath-labels .cath-label')) { out.push(`a reading is still on screen ${(now - sumGone) | 0} ms after the summary went`); return res(out); }
        if (now > 26000) { if (!sumSeen) out.push('the HVPG summary never appeared'); return res(out); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    if (bad.length) throw new Error(bad.join('; '));
  });

  await check(device, 'pressure over time and Doppler', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // The heartbeat always runs, so the trace is beat to beat before any instrument opens, and it
    // never touches the patient's parameters.
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 45000 });
    // Pulsatile is on by default, so compare with its value before the instrument opens, not with false.
    const pulsatileBefore = await page.evaluate(() => window.pps.store.get().params.pulsatile);
    await tapTool(page, '#tabInstruments');
    // Settings › Always show HVPG is on by default; turn it off to check the unmeasured state.
    await page.evaluate(() => window.pps.store.set({ showHvpg: false }));
    await page.evaluate(() => window.pps.dock.show('scope'));
    if (await page.evaluate(() => window.pps.store.get().params.pulsatile) !== pulsatileBefore) throw new Error('opening an instrument changed the patient parameters');
    await page.waitForTimeout(2500);
    // In Explore the HVPG stays hidden until the HVPG procedure measures it.
    const before = await page.$eval('#pane-scope .pt-num', (el) => el.textContent.trim());
    if (before !== '—') throw new Error(`pressure over time shows HVPG ${before} before it is measured`);
    await page.evaluate(() => window.pps.store.set({ hvpgMeasured: true }));
    await page.waitForTimeout(600);
    const hero = await page.$eval('#pane-scope .pt-num', (el) => parseFloat(el.textContent));
    if (!(hero > 12)) throw new Error(`pressure over time shows HVPG ${hero}`);
    const drawn = await page.$eval('#pane-scope canvas', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i]) n++; return n; });
    if (drawn < 200) throw new Error('pressure over time draws nothing');
    await page.evaluate(() => window.pps.updateParams((p) => { p.drugs.carvedilol = true; return p; }, { label: 'Carvedilol' }));
    await page.waitForTimeout(1500);
    await page.click('#pane-scope [data-range="minutes"]');
    await page.click('#pane-scope .pt-chip[data-trace="RA"]');
    const box = await page.$eval('#pane-scope canvas', (c) => { const r = c.getBoundingClientRect(); return [r.x + r.width * 0.7, r.y + r.height * 0.4]; });
    await page.mouse.move(box[0], box[1]);
    await shot(page, `${device}-pressure-over-time`);
    await page.click('#pane-scope [data-range="days"]');
    // A jump stops early if a varix ruptures on the way, so only require that the clock moved.
    await page.evaluate(() => window.pps.timeline.jump(30, '1 month'));
    await page.waitForFunction(() => window.pps.store.get().frame.day > 0, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    await shot(page, `${device}-pressure-over-time-days`);
    await page.evaluate(() => window.pps.dock.show('doppler'));
    await page.waitForTimeout(1500);
    const dir = await page.$eval('#pane-doppler .dop-dir', (el) => el.textContent);
    if (!/Hepatopetal|Hepatofugal|To-and-fro|Stasis|No flow/.test(dir)) throw new Error(`Doppler reports "${dir}" for the portal vein`);
    await page.selectOption('#pane-doppler .dop-vessel', 'RHV_IVC');
    await page.waitForFunction(() => window.pps.store.get().frame.probe === 'RHV_IVC');
    await page.waitForTimeout(2500);
    const pattern = await page.$eval('#pane-doppler .dop-pattern', (el) => el.textContent);
    if (!/phasic/i.test(pattern)) throw new Error(`hepatic vein pattern is "${pattern}"`);
    await shot(page, `${device}-doppler`);
    await page.evaluate(() => window.pps.dock.close());
    await page.waitForTimeout(800);
    if (!(await page.evaluate(() => window.pps.store.get().frame.pulsing))) throw new Error('the heartbeat stopped when the instruments closed');
  });

  // A leader reaches its label in every frame, and never runs in under it or across another label: the dive into the lobule,
  // a text-size change gliding the lobule's labels, the rise back out, and zooming in on the anatomy. (The lobule's leaders
  // once ran to each label's middle, through its letters, and the anatomy's stopped 9 px short of theirs.)
  // The station check above proves its own case: it fails on a Lymph label hidden where a clear spot exists and on a
  // leader stretched to 150 px, and passes on the lobule of every kind of patient (the Lymph label left out only where no
  // clear spot lies near its node: a phone's decompensated cirrhosis).
  await check(device, 'lobule stations: the Lymph label is left out only where no clear spot lies near its node, no leader over 140 px', async (page) => {
    const into = async (q) => {
      await open(page, q);
      await pickView(page, 'lobule');
      await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled() && !!document.querySelector('.lz.on .lz-labels')?.dataset.room, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
    };
    const bad = [];
    for (const q of ['?preset=healthy', '?preset=rhf', '?preset=cirr-comp', '?preset=cirr-decomp', '?preset=budd-chiari', '?preset=csph', '?preset=schisto']) {
      await into(q);
      for (const b of await stationRoom(page)) bad.push(`${q}: ${b}`);
    }
    if (bad.length) throw new Error(bad.join('; '));
    // (The faults: on a lobule whose Lymph label shows.)
    await into('?preset=healthy');
    if (await page.evaluate(() => document.querySelector('.lz.on .lz-lab[data-target="lobule:lymph"]').hidden)) throw new Error('the healthy lobule shows no Lymph label to test with');
    const dropped = await stationRoom(page, 'drop');
    if (!dropped.some((b) => /left out though a clear spot/.test(b))) throw new Error(`a Lymph label hidden beside a clear spot was not caught (${dropped.join('; ') || 'no problem found'})`);
    await into('?preset=healthy');
    const long = await stationRoom(page, 'long');
    if (!long.some((b) => /leader is 150 px/.test(b))) throw new Error(`a 150 px leader was not caught (${long.join('; ') || 'no problem found'})`);
  });

  await check(device, 'leaders reach their labels in every frame: lobule dive, glide and rise, anatomy zoom', async (page) => {
    const bad = [];
    const look = async (what, ms, act) => { const run = leaderFrames(page, ms); await act?.(); for (const b of await run) bad.push(`${what}: ${b}`); };
    await open(page, '?preset=rhf');
    await page.waitForFunction(() => document.querySelectorAll('#labels path.leader, #labels g.lb').length > 0);
    await page.waitForTimeout(1500);
    await look('diving into the lobule', 2600, () => page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click()));
    await page.waitForFunction(() => [...document.querySelectorAll('.lz.on .lz-lab')].some((e) => !e.hidden));
    await look('text size 150 %', 1200, () => page.evaluate(() => window.pps.stage.setLabelScale(1.5)));
    await look('text size back to 100 %', 1200, () => page.evaluate(() => window.pps.stage.setLabelScale(1)));
    await look('rising out of the lobule', 2400, () => page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click()));
    await page.waitForTimeout(800);
    await look('zooming in on the anatomy', 2400, async () => { for (let i = 0; i < 4; i++) { await page.evaluate(() => document.getElementById('zoomIn').click()); await page.waitForTimeout(250); } });
    await look('zoomed in', 600);
    // A label the slide's words light: its leader stops on the pill's rounded outline, at 100 % and 200 % text.
    await open(page, '?script=hvpg&slide=6');
    await page.waitForFunction(() => window.pps.stage.lobuleSettled?.() && [...document.querySelectorAll('.lz.on .lz-lab')].some((e) => !e.hidden) && +getComputedStyle(document.querySelector('.lz-call.on') || document.body).opacity > 0.9 && !!document.querySelector('.lz-call.on'), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    if (!(await page.evaluate(() => (document.getElementById('app').dataset.lit || '').includes('lobule:')))) throw new Error('HVPG slide 6 lights no lobule label');
    await look('a lit label (HVPG slide 6)', 800);
    await look('a lit label at 200 % text', 2000, () => page.evaluate(() => window.pps.stage.setLabelScale(2)));
    // At rest no leader is hidden for a label passing over it: a label's own pill once hid its leader (it counted
    // the pill's square corner as another label).
    await page.waitForTimeout(800);
    const hid = await page.evaluate(() => [...document.querySelectorAll('.lz-leaders line.leader.lz-hid')].filter((l) => l.style.display !== 'none' && !l.classList.contains('ld-gone')).map((l) => l.dataset.target));
    if (hid.length) bad.push(`at rest, 200 % text: the ${hid.join(', ')} leader is hidden`);
    await page.evaluate(() => window.pps.stage.setLabelScale(1));
    if (bad.length) throw new Error(bad.slice(0, 8).join('; '));
  });
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
