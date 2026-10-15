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
//
// Needs a Chromium for Playwright (`npx playwright install chromium`; the Claude Code cloud
// image ships one).

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { serve } from '../../scripts/serve.mjs';
import { instantMotionOn, quiet } from './fast.mjs';
import { checkCharts, checkLadderBrackets, LADDER_SIZES, checkStrip, checkStripSlides, stripSlides, checkStripGaps } from './chart-text.mjs';
import { checkPhoneFit } from './phone-fit.mjs';
import { checkTypeScale } from './type-scale.mjs';
import { TEXT_MIN, TEXT_MAX } from '../../src/ui/type-scale.js';
import { checkChartText, chartTypeSlides } from './chart-type.mjs';

const dir = process.argv[2] || '.';
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const server = await serve(dir);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let failed = 0;

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
// A view by its switch: in the top bar, or on an upright phone in the pill just above the dock.
async function pickView(page, v) {
  if (!(await page.evaluate(() => document.querySelector('#app').classList.contains('thumb')))) return page.click(`#viewSeg [data-view="${v}"]`, { force: true });
  await page.click(`#viewPill [data-view="${v}"]`);
}
const shot = (page, name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : null);
const open = async (page, q = '') => {
  await page.goto(server.url + q);
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 45000 });
};

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
    // the card's on an upright iPad; styles/app.css .pz.stack .pz-bar.)
    const inR = document.querySelector('.pz.stack.tab') ? innerWidth * 0.15 + 13 : 21;
    if (Math.abs(innerWidth - b.right - inR) > 1.5) return `the pill is ${Math.round(innerWidth - b.right)} px from the right edge, not ${Math.round(inR)}`;
    if (Math.abs(innerHeight - b.bottom - 21) > 1.5) return `the pill is ${Math.round(innerHeight - b.bottom)} px from the bottom, not 21`;
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
    const first = [...host.querySelectorAll(':scope > *, :scope > .pz-ph > *')].find((el) => el.getBoundingClientRect().height && !el.matches('.pz-ph, .pz-site'));   // (the site tag, a small kicker over the title since 505b732, belongs to it)
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
// A phone's data card hugs its contents: at most 12 px of empty card above the first part or below the last, and its
// contents at full size (a folded tool must not count as overflow and shrink them). null when it fits, else what is wrong.
const cardGap = (page) => page.evaluate(() => {
  const d = document.querySelector('.pz-data:not(.pz-hide):not([hidden])');
  if (!d || !d.offsetHeight) return null;
  const b = d.getBoundingClientRect(), parts = [...d.children].filter((c) => { const s = getComputedStyle(c), r = c.getBoundingClientRect(); return s.display !== 'none' && s.position !== 'absolute' && r.height > 0.5; });
  if (!parts.length) return null;
  const top = Math.min(...parts.map((c) => c.getBoundingClientRect().top)) - b.top - d.clientTop;
  const bottom = b.bottom - d.clientTop - Math.max(...parts.map((c) => c.getBoundingClientRect().bottom));
  // (The words' own zoom: an opened phone instrument may give way, the header and tiles never.)
  const fit = Math.min(...[...d.children].filter((c) => !c.classList.contains('pz-tool') || !(d.classList.contains('tool-open') || d.classList.contains('tool-only'))).map((c) => parseFloat(getComputedStyle(c).zoom) || 1));
  if (top > 12 || bottom > 12) return `the data card has ${Math.round(top)} px empty above and ${Math.round(bottom)} px below its contents (cap 12)`;
  if (fit < 1) return `the data card's contents are shrunk to ${Math.round(fit * 100)} %`;
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

// Every deck's id (the presenter's library), for the per-deck checks below.
const CHART_SLIDES = new Map();   // (chart-type check name -> its slides, for weighing the shares)
const STRIP_SLIDES = new Map();   // (check name -> its weight in slides, for weighing the shares)
const DECK_IDS = [...readFileSync(new URL('../../src/ui/decks.js', import.meta.url), 'utf8').matchAll(/\['([a-z0-9-]+)', '(?:[^'\\]|\\.)*'\]/g)].map((m) => m[1]);
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
        return { M, gl: st.glMatrix(), bands: [...document.querySelectorAll('.band-ring, .stent-mark')].map(c), dots: [...document.querySelectorAll('#labels .leader-dot:not(.scan)')].map(c), svgMarks };
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
    if (sin.r > sin.vw || sin.b > sin.vh || sin.r < sin.vw - 40 || sin.b < sin.vh - 140) throw new Error(`the zoom pill is not at the bottom right in the sinusoid: ${JSON.stringify(sin)} (lobule: ${JSON.stringify(lob)})`);
    await page.evaluate(() => [...document.querySelectorAll('#zoomOut, #zoomFit')].find((b) => b.offsetParent && !b.disabled).click());   // (the phone layout shows Fit alone)
    await page.waitForFunction(() => !document.querySelector('#app').classList.contains('sin-focus') && window.pps.store.get().lobule && !window.pps.store.get().sinusoid, null, { timeout: 30000 });
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
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-lab')].some((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && e.offsetParent), null, { timeout: 30000 });
    // Time is stepped by hand (a software renderer would otherwise sample too few frames): at each step the pill is exactly as faded as its text.
    const rows = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('.lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && e.offsetParent);
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
    await page.waitForFunction(() => [...document.querySelectorAll('.lz-lab')].some((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && e.offsetParent), null, { timeout: 30000 });
    // Time is stepped by hand (a software renderer would otherwise sample too few frames).
    const rows = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('.lz-lab')].find((e) => e.dataset.target === 'lobule:sinusoid' && !e.hidden && e.offsetParent);
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
        if (p.hidden || !shown(p)) continue;
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
      for (const [deck, i, sin] of [['hvpg', 6, false], ...(k === String(TEXT_MIN) ? [['lobule', 4, true]] : [])]) {
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

  // Every way into or out of the lobule is one continuous zoom (to the lobule's normal framing; the sinusoid and a station are a second zoom from there): the camera's magnification (the plate's zoom plus the dive's)
  // moves steadily from the first frame to the last, in one direction, with no stop at an intermediate framing (the liver, the fit).
  // The presenter's slides are walked with the arrow keys, from the slide before a crossing to the one after it, and back.
  const CROSSINGS = [   // [deck, slide to start on (0-based), key, whether the key goes into the lobule, whether it is the sinusoid view that is gone to or left]
    ['circulation', 3, 'ArrowRight', true], ['circulation', 4, 'ArrowLeft', false], ['circulation', 7, 'ArrowRight', false],   // ladder → lobule and back; central vein → the next view
    ['lobule', 0, 'ArrowRight', true],   // the outline's fit → the whole lobule
    ['ncph', 1, 'ArrowRight', true], ['ncph', 4, 'ArrowRight', true], ['ncph', 5, 'ArrowRight', false, false, true],   // a fit, then a liver close-up, before it (the last one changes the patient: propranolol)
    ['sites', 7, 'ArrowLeft', true],   // backwards into it
    ['ascites', 0, 'ArrowRight', true, true], ['ascites', 4, 'ArrowRight', true, true], ['tap', 7, 'ArrowRight', true, true],   // anatomy straight to the sinusoid view, through the lobule without stopping in it
    ['ascites', 5, 'ArrowRight', false, true, true], ['ascites', 8, 'ArrowRight', false, true, true],   // and the sinusoid view straight back out to the anatomy (a new patient: the words, and so the space the camera frames into, are settled after the rise)
    ['hvpg', 6, 'ArrowRight', false, false, true], ['outflow', 5, 'ArrowRight', true],   // out to a region, with a new patient (schisto to chronic PVT: the words settle after the rise); in from a region
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
      const quiet = async (open) => {   // the figure holds still (a software renderer draws a frame a second or two apart)
        let last = '', same = 0;
        for (let i = 0; i < 120 && same < 6; i++) {
          await page.waitForTimeout(400);
          const k = await page.evaluate(() => `${window.pps.stage.lobuleOpen()}|${window.pps.stage.lobuleSettled()}|${window.pps.stage.cameraKey()}|${document.querySelector('.pz-load.on') ? 'load' : ''}`);
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
      if (explore) {
        // (A station is aimed at as the presenter aims at a slide's, before the dive.)
        await page.evaluate((m) => { if (m === 'triad') window.pps.stage.lobuleAim('triad', { zoom: 2.3 }); if (m === 'sinusoid') window.pps.stage.diveToSinusoid(); else if (m === 'out') window.pps.stage.exitSinusoid(); else window.pps.store.set({ lobule: true }); }, from);
      } else {
        const label = await page.evaluate(() => document.querySelector('.pzb-n, .pz-count')?.textContent.trim());
        await page.keyboard.press(key);
        await page.waitForFunction((l) => (document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '') !== l, label);
      }
      await quiet(into);
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
    if (await page.$eval('#rotateCircuit', (b) => getComputedStyle(b).display) !== 'none') throw new Error('turn button shows in the anatomy');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    // Animations step with the frames: wait for where they end, not a fixed time (CI has no GPU).
    const ratio = () => { const s = document.querySelector('#stage'); return s.viewBox.baseVal.height / s.viewBox.baseVal.width; };
    const until = (fn, msg) => page.waitForFunction(fn, null, { timeout: 30000 }).catch((e) => { throw new Error(msg, { cause: e }); });
    // A phone held upright opens the circuit upright; turn it wide first.
    if (device === 'phone') { await until(`(${ratio})() > 1`, 'circuit did not open upright on a phone'); await page.click('#rotateCircuit'); }
    await until(`(${ratio})() < 1`, 'circuit did not open wide');
    await page.click('#rotateCircuit');
    await until(`(${ratio})() > 1`, 'circuit did not turn tall');
    // Zoomed in, turning back keeps the zoom.
    // The zoom glides: read it once it holds still (a software renderer draws a frame a second or two apart).
    const steady = () => page.evaluate(() => new Promise((res) => { let a = window.pps.stage.zoomLevel(); const t = setInterval(() => { const b = window.pps.stage.zoomLevel(); if (Math.abs(b - a) < 1e-4) { clearInterval(t); res(b); } a = b; }, 700); }));
    const k0 = await steady();
    await page.evaluate(() => { window.pps.stage.zoomIn(); window.pps.stage.zoomIn(); });
    await page.waitForFunction((k0) => window.pps.stage.zoomLevel() > k0 * 1.5, k0, { timeout: 60000 });
    const kIn = await steady();
    await page.click('#rotateCircuit');
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
    let kAfter = await steady();
    for (let i = 0; i < 8 && Math.abs(kAfter - kIn) / kIn > 0.05; i++) kAfter = await steady();   // a loaded runner can read mid-glide; a real reset stays reset
    if (Math.abs(kAfter - kIn) / kIn > 0.05) throw new Error(`turning reset the zoom (${kIn.toFixed(2)} → ${kAfter.toFixed(2)})`);
    await page.evaluate(() => window.pps.stage.fit()); await page.click('#rotateCircuit');
    await until(`(${ratio})() > 1`, 'circuit did not turn tall again');
    if ((await page.$eval('#rotateCircuit', (b) => b.getAttribute('aria-pressed'))) !== 'true') throw new Error('turn button is not pressed');
    await shot(page, `${device}-circuit-upright`);
    // A vessel can still be picked, and the flow marks keep running, in the turned map.
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.evaluate(() => { window.pps.store.set({ selection: null }); document.querySelector('#rotateCircuit').click(); });
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
  });
  if (device === 'phone') await check(device, 'action card is a compact sheet that keeps the vessel in view', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(800);
    const read = () => page.evaluate(() => {
      const c = document.querySelector('.action-card'), r = c.getBoundingClientRect(), sv = document.querySelector('#stageView').getBoundingClientRect(), sc = c.querySelector('.ac-scroll');
      const link = c.querySelector('.ac-foot.in-head .link');
      // The figure fills the screen; the sheet rises from the bottom edge, over the vitals dock.
      return { covers: r.bottom <= sv.bottom && r.bottom >= sv.bottom - 40 && r.top < document.querySelector('#vdock').getBoundingClientRect().top, peek: c.classList.contains('peek'), docked: c.classList.contains('docked'), top: r.top - sv.top, h: r.height, stageH: sv.height, scrolls: sc.scrollHeight - sc.clientHeight, links: !!link && link.getBoundingClientRect().height > 0, foot: getComputedStyle(c.querySelector('.ac-foot.at-foot')).display !== 'none' };
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
    if (!zoom.visible || zoom.bottom > cardTop) throw new Error('zoom and Fit should remain visible above the card');
    if (await page.$('.ac-grab')) throw new Error('the compact card should have no handle or intermediate heights');
    await swipe(70);
    if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('one swipe down should close the card');
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.waitForTimeout(300);
    await page.click('.ac-close');
    await page.waitForTimeout(300);
    if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('close should dismiss the card');

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
    // (Sized by the height, an upright iPad's 1180 px set the title at 57 px in a 300 px column.)
    if (m.h > 40 || m.line > 22) throw new Error(`upright iPad presenter type too large: title ${m.h}px, body ${m.line}px`);
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

  // Circulation slide 9 ("After a meal"): the coronary and splenic veins, their glow and the figure's labels sit in the band the data card
  // (top) and the words (bottom sheet) leave, and clear of the controls' pill (read from the pill itself).
  if (device === 'phone') await check(device, 'presenter on a phone: Circulation slide 9 frames the coronary and splenic veins clear of the data card, the words and the pill', async (page) => {
    const GLOW = 8;   // px of glow around a vein
    for (const [w, h] of [[390, 844], [375, 667]]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.evaluate(() => window.pps.presenter.start('circulation', 8));
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

  await check(device, 'presenter: the controls never glide between slides, and keep their size and spacing, first and last included', async (page) => {
    // Each slide of two decks, at each size (the desktop run also tries an upright iPad). The bar's size and the spacing of its
    // controls are the same on every slide (Next turning into Finish moved them once). A bar centred at the bottom keeps one
    // spot, and so does a phone's pill; every frame in which it shows is at that spot, never elsewhere.
    // Once each slide is in, the controls' icons and count may not cover any of the card's words or its table, and a phone's
    // pill keeps clear of them (see barFit). (A phone's bar once stayed where the slide before had it, over the summary card's table.)
    // Three decks are walked from the start (endoscopy: its data card sits at the top); one more only over its last slides, the summary card among them.
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null];
    const runs = [['circulation', 0], ['lobule', 0], ['endoscopy', 0], ['hvpg', -2]];
    for (const size of sizes) for (const [deck, from] of runs) {
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
      // (A folding tool: Show then Hide must leave the card's contents at full size, as on arrival.)
      const fold = page.locator('.pz-data:not(.pz-hide):not([hidden]) .pz-fold');
      if (await fold.isVisible().catch(() => false)) {
        for (const want of ['true', 'false']) {
          await page.evaluate(() => document.querySelector('.pz-data:not(.pz-hide):not([hidden]) .pz-fold').click());
          await page.waitForFunction((w) => document.querySelector('.pz-data .pz-fold')?.getAttribute('aria-expanded') === w, want);
          // (The fold eases, then the card is fitted again: give it until it settles, up to 3 s.)
          let g = null;
          for (let w = 0; w < 10; w++) { await page.waitForTimeout(300); g = await cardGap(page); if (!g) break; }
          if (g && (want === 'false' || g.includes('shrunk'))) throw new Error(`${deck}, slide ${n}, after ${want === 'true' ? 'Show' : 'Show then Hide'}: ${g}`);
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

  // A time-lapse slide's card shows the state the time-lapse plays from on its first frames (not its end, nor the slide before),
  // climbs from there with no snap back, ends on the slide's state, and every change line adds up.
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
          rec.push({ t: Math.round(performance.now()), i: p.i, playing: p.playing, start: p.start, end: p.end, n: p.keys.length, tiles: read(), done: !!document.querySelector('.pz-lapse.done') });
        }, 50);
      }, [at, TILES_JS]);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((at) => window.__lapRec.some((r) => r.i === at && r.done && !r.playing), at, { timeout: 240000, polling: 500 })
        .catch(async () => { throw new Error(`${deck} slide ${at + 1}: the time-lapse never ended (last: ${JSON.stringify(await page.evaluate(() => [window.__lapRec.length, window.__lapRec.at(-1), document.querySelector('.pzb-n')?.textContent]))})`); });
      await page.waitForTimeout(1500);
      const rec = await page.evaluate(() => { clearInterval(window.__lapT); return window.__lapRec; });
      const p = rec.findLast((r) => r.start && r.end), at1 = `${deck} slide ${at + 1}`;
      if (!p) throw new Error(`${at1}: the slide never counted as shown (${rec.length} samples, ${JSON.stringify(rec.slice(-2))})`);
      // Every sample with the full card: the values as the model has them at the start, then a climb with no jump.
      const full = rec.filter((r) => r.tiles.length === p.n);
      if (!full.length) throw new Error(`${at1}: the card never showed`);
      for (const r of full) { const bad = badDelta(r.tiles); if (bad) throw new Error(`${at1}: ${bad}`); }
      const first = full[0].tiles, off = first.filter((x, j) => x.v !== p.start[j]);
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
  if (device === 'desktop') for (const deck of ['ascites', 'tap', 'lobule']) await check(device, `presenter: on every slide of ${deck} at 820x1180 the sinusoid's names keep off the cards`, async (page) => {
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
  for (const [deck, { at: sinAt, n: count }] of SV_DECKS) await check(device, `presenter: on every sinusoid slide of ${deck} no direction arrow shows without its name`, async (page) => {
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }, { width: 1180, height: 820 }] : [null];
    for (const size of sizes) {
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
    const r = await page.evaluate(() => {
      const d = document.querySelector('.pz-data:not(.pz-hide)'), tiles = [...d.querySelectorAll('.pz-tile')];
      const spill = tiles.flatMap((t) => { const b = t.getBoundingClientRect(); return [...t.children].filter((c) => { const cb = c.getBoundingClientRect(); return cb.width && (cb.right > b.right + 1 || cb.bottom > b.bottom + 1); }).map((c) => c.className); });
      return { h: d.getBoundingClientRect().height, tile: Math.max(...tiles.map((t) => t.getBoundingClientRect().height)), n: tiles.length, spill };
    });
    if (r.n !== 2 || r.h > 114 || r.tile > 66 || r.spill.length) throw new Error(`FibroScan card ${Math.round(r.h)}px tall (cap 114), tallest of ${r.n} tiles ${Math.round(r.tile)}px (cap 66)${r.spill.length ? ', spilling: ' + r.spill.join() : ''}`);
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
    await page.evaluate(() => window.pps.presenter.start('outflow', 5));
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
      const keys = [...(s.line || '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).filter((k) => !/^[<>≥≤]/.test(k));
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
    await page.evaluate(() => window.pps.presenter.start('stiffness', 3));
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting') && !document.querySelector('.pz-cover')
      && [...document.querySelectorAll('.pz-fold')].some((f) => f.offsetWidth), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const drag = (dy) => page.evaluate(async (dy) => {
      const d = [...document.querySelectorAll('.pz-data')].find((x) => x.querySelector('.pz-fold')?.offsetWidth), b = d.getBoundingClientRect();
      const x = b.left + b.width / 2, y0 = dy > 0 ? b.top + b.height / 2 : b.bottom - 20;   // (anywhere on the card)
      const fire = (type, y) => { const t = new Touch({ identifier: 1, target: d, clientX: x, clientY: y });
        d.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
      fire('touchstart', y0);
      for (let i = 1; i <= 10; i++) { fire('touchmove', y0 + dy * i / 10); await new Promise((r) => setTimeout(r, 30)); }
      await new Promise((r) => setTimeout(r, 150));   // (a slow release: decided by how far it got)
      fire('touchend', y0 + dy);
    }, dy);
    const state = () => page.evaluate(() => document.querySelector('.pz-data .pz-fold[aria-expanded]') && [...document.querySelectorAll('.pz-fold')].find((f) => f.offsetWidth).getAttribute('aria-expanded'));
    await drag(260); await page.waitForTimeout(900);
    if (await state() !== 'true') throw new Error('dragging the card edge down did not open it');
    let gap = await cardGap(page); if (gap) throw new Error(`after dragging open: ${gap}`);
    await drag(-400); await page.waitForTimeout(900);
    if (await state() !== 'false') throw new Error('dragging the card edge up did not shut it');
    gap = await cardGap(page); if (gap) throw new Error(`after dragging shut: ${gap}`);
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
  if (device === 'desktop') await check(device, 'presenter: chart text never overlaps or crosses a line, at every size', async () => {
    const bad = [...await checkCharts(browser, server.url, () => {}), ...await checkStrip(browser, server.url, () => {})];
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // The Mac and iPad ladder card's HVPG and PPG brackets on every slide: a real line between the ticks, the label clear
  // of every drop line, reading, name and other bracket (Mac 1280x800 and upright iPad at 100% and 200% text here; run
  // checkLadderBrackets alone for every size).
  if (device === 'desktop') await check(device, 'presenter: ladder HVPG/PPG brackets draw a line and their labels clash with nothing', async () => {
    const bad = await checkLadderBrackets(browser, server.url, () => {}, [LADDER_SIZES[0], LADDER_SIZES[2]]);
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
      const n = withOverview(d).slides.length, name = `presenter: ${d.id}'s slides keep their words off the controls pill and readings inside their card, at phones`;
      STRIP_SLIDES.set(name, n * 0.3);   // (about 25 s a slide over its six sizes)
      await check(device, name, async () => {
        const bad = await checkPhoneFit(browser, server.url, d.id, n);
        if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
      });
    }
  }

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
      for (const [deck, n] of [['circulation', 4], ['hvpg', 10], ['circulation', 12]]) {
        if (size.width === 1440 && n === 4) await open(page, `?script=${deck}&slide=${n}`);
        else await page.evaluate(([id, i]) => window.pps.presenter.start(id, i), [deck, n - 1]);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !document.querySelector('.pz-cover, .pz-load.on'), n, { timeout: 60000 });
        await page.waitForTimeout(3500);   // (longer than the old bar's idle fade)
        const out = await page.evaluate(() => {
          const o = [], bar = document.querySelector('.pz-bar'), b = bar.getBoundingClientRect();
          const vis = (el) => { if (!el || el.hidden || el.classList.contains('pz-hide')) return null; const st = getComputedStyle(el); if (st.display === 'none' || +st.opacity < 0.5) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
          if (+getComputedStyle(bar).opacity < 0.9) o.push('the pill hides');
          if (innerWidth - b.right > 50 || innerHeight - b.bottom > 20 || b.left < innerWidth / 2) o.push(`the pill is not at the lower right (${Math.round(b.left)},${Math.round(b.top)})`);
          const kids = [...bar.children].map((c) => c.getAttribute('aria-label') || c.textContent.trim());
          if (kids.length !== 5 || !/^Slide \d+ of/.test(kids[1]) || kids[3] !== 'Settings') o.push(`the pill holds ${kids.join(', ')}`);
          if (document.querySelector('.pz-count')) o.push('a second count shows');
          if (!['none', 'normal'].includes(getComputedStyle(bar, '::before').content) || [...bar.children][0].getBoundingClientRect().left - b.left > 4) o.push('a mark shows before the back button');   // (the app's status-pill dot once did)
          for (const s of ['.pz-text', '.pz-data', '.pz-panel', '.stage-credit']) { const q = vis(document.querySelector(s)), g = s === '.stage-credit' ? 4 : 0;
            if (q && Math.min(q.right, b.right) - Math.max(q.left, b.left) > -g && Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top) > -g) o.push(`the pill touches ${s}`); }
          return o;
        });
        for (const x of out) bad.push(`${deck} ${n} at ${size.width}x${size.height}: ${x}`);
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join(' | '));
  });

  // Figure labels and slide cards keep to the six-role type scale at every text size step, never under 11 px, units never
  // above their readings, on a phone, an upright iPad and a desktop (tests/e2e/type-scale.mjs). Run once, from the desktop run.
  if (device === 'desktop') await check(device, 'type scale: figure and slide text on the six roles at every text size', async () => {
    const bad = await checkTypeScale(browser, server.url, () => {});
    if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
  });

  // Drawn slide charts letter from the same scale as drawn: never under 11 px, growing with the text size, no word over
  // another or out of its card, on every chart slide at three phones, an iPad and a desktop (tests/e2e/chart-type.mjs).
  // (One check for each deck and text size: the whole sweep is 35 slides at five sizes and two text sizes, some 78 minutes in one piece.)
  if (device === 'desktop') {
    const perDeck = new Map();
    for (const s of await chartTypeSlides()) perDeck.set(s.deck, (perDeck.get(s.deck) || 0) + 1);
    for (const [deck, count] of perDeck) for (const step of [1, 2]) {
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
    // also tries an upright iPad). (A phone's control padding once pushed the names into the HVPG column.)
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const deck of ['circulation', 'hvpg', 'sites']) {   // (sites: the most columns)
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
      for (const [deck, n] of [['circulation', 6], ['circulation', 7], ['two-inflows', 3], ['lobule', 7]]) {
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
          const segs = [...document.querySelectorAll('.lz.on:not(.lz-cam) .lz-leaders line.leader')].filter((l) => l.style.display !== 'none').map((l) => {
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
        const boxes = [...document.querySelectorAll('.lz-lab, .lz-call, .lz-zone')].filter((e) => e.offsetWidth && !e.hidden && +getComputedStyle(e).opacity > 0.5);
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
    const stations = await page.evaluate(() => [...document.querySelectorAll('.lz-lab')].map((l) => `${l.dataset.target}${l.hidden ? ':hidden' : ''}`).sort().join());
    if (stations !== 'lobule:arteriole:hidden,lobule:central,lobule:ductule:hidden,lobule:lymph,lobule:sinusoid,lobule:triad') throw new Error(`station cards missing (${stations})`);
    // The card is gone: nothing floats beside the lobule but its labels.
    if (await page.locator('.lz-side').count()) throw new Error('the lobule still has its card');
    // The strip reads the lobule's flows here.
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#strip .metric.primary')].filter((e) => e.offsetWidth).map((e) => e.dataset.id).join());
    if (tiles !== 'lz-sin,lz-pv,lz-art,lz-ly') throw new Error(`the strip should show the lobule's flows, got ${tiles}`);
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
        const dock = document.querySelector('#vdock').getBoundingClientRect().top, labs = [...document.querySelectorAll('.lz-lab:not([hidden])')];
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
    await page.evaluate(() => document.querySelector('.lz-lab:not([hidden])').click());   // its value updates live, so it never holds still for a pointer click
    await page.waitForSelector('.action-card:not([hidden])');
    await pickView(page, 'anatomic');
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
    await page.keyboard.press('Escape');
    await page.waitForSelector('#treatCard', { state: 'hidden' });
    // Advanced physiology: in Settings; it opens in the side panel.
    await tapTool(page, '#btnSettings');
    await page.locator('.menu-item', { hasText: 'Advanced physiology' }).click();
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('panel-open') && document.querySelector('#panelTitle').textContent.includes('Advanced physiology'));
    if (!(await page.$('#panel .adv-body input[type="range"]'))) throw new Error('advanced physiology has no controls');
    await page.click('#panelClose');
  });
  // The thumb dock (an upright phone): the top bar is two chips, the patient and the key; Treat, Tests, History, Layers and Settings
  // sit in the dock's tab row, and every card or menu they open sits above the dock, so the tab row never moves or hides.
  if (device === 'phone') await check(device, 'thumb dock: two chips on top; the tab row opens every card and menu above the dock', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    if (!(await page.evaluate(() => document.querySelector('#app').classList.contains('thumb')))) throw new Error('an upright phone has no thumb dock');
    const tabs = await page.$$eval('#thumbBar .nb-tab', (els) => els.filter((e) => e.offsetParent).map((e) => e.querySelector('.nb-l').textContent));
    if (tabs.join('|') !== 'Treat|Tests|History|Layers|Settings') throw new Error(`the tab row reads ${tabs.join(', ')}`);
    const shown = await page.evaluate(() => ['.top-right', '.topbar #viewSeg', '#btnBlood', '.tl-hist', '#zoomIn'].filter((q) => document.querySelector(q)?.offsetParent));
    if (shown.length) throw new Error(`still shown outside the tab row: ${shown.join(', ')}`);
    const row = await page.evaluate(() => { const a = document.querySelector('.tb-id').getBoundingClientRect(), b = document.querySelector('#btnLayers').getBoundingClientRect(); return Math.abs(a.top - b.top) < 8 && a.right <= b.left && b.right <= innerWidth; });
    if (!row) throw new Error('the patient and the key are not one row inside the screen');
    // The view switch is a pill at the left, just above the dock, level with Fit, and switches the view.
    const pill = await page.evaluate(() => { const p = document.querySelector('#viewPill').getBoundingClientRect(), f = document.querySelector('#zoomFit').getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect();
      return { left: p.left < innerWidth / 2 && p.left >= 0, level: Math.abs((p.top + p.bottom) / 2 - (f.top + f.bottom) / 2) < 4, above: p.bottom <= d.top - 4, clear: p.right <= f.left - 4, seg: !!document.querySelector('#viewPill #viewSeg') }; });
    for (const [k, msg] of Object.entries({ seg: 'the view switch is not in the pill', left: 'the view pill is not at the left', level: 'the view pill is not level with Fit', above: 'the view pill is not above the dock', clear: 'the view pill runs into Fit' })) if (!pill[k]) throw new Error(msg);
    await page.click('#viewPill [data-view="circuit"]');
    await page.waitForFunction(() => window.pps.store.get().view === 'circuit');
    await page.click('#viewPill [data-view="anatomic"]');
    const dockTop = await page.evaluate(() => document.querySelector('#thumbBar').getBoundingClientRect().top);
    const above = (sel) => page.evaluate(([sel, top]) => { const r = document.querySelector(sel).getBoundingClientRect(), d = document.querySelector('#vdock').getBoundingClientRect(); const n = document.querySelector('#thumbBar').getBoundingClientRect(); return r.height > 40 && r.bottom > d.top && Math.abs(r.bottom - n.top) <= 1 && Math.abs(document.querySelector('#thumbBar').getBoundingClientRect().top - top) < 1; }, [sel, dockTop]);
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
      await page.mouse.up();
      await page.waitForTimeout(700);
      if (tab === 'treat' && await page.evaluate(() => !document.querySelector('#treatCard').hidden)) throw new Error('a pull down from a button on Treat did not close it');
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
      const tick = () => { const c = document.querySelector('#dock'), cs = getComputedStyle(c);
        if (c.offsetParent) {
          const ty = parseFloat(cs.translate.split(' ')[1]) || 0, cut = parseFloat((cs.clipPath.match(/inset\(([^)]*)\)/)?.[1] || '').split(/\s+/)[2]) || 0;
          if (Math.abs(ty - cut) > 0.5) window.__bad.push(`slide ${ty} vs cut ${cut}`);
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
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('dock-open'))) throw new Error('a second pull, from Half, did not close the Tests card');
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
    const dots = () => page.evaluate(() => [...document.querySelectorAll('circle.leader-dot')].map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).join(' '));
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
  // Every phone card and sheet, driven by real touches (the path iOS takes), at the Home Screen app's height and Safari's: a short
  // pull eases back, a pull from Full (slow or a flick) settles at Half, a pull or flick from Half closes, and a new touch while the
  // card is still easing (back, to Half, or away) takes it over. Every frame, every card's slide equals its cut and nothing of a
  // card is drawn on the tab row or below it.
  for (const H of [844, 664]) if (device === 'phone') await check(device, `thumb dock: every card and sheet pulls, flicks and closes by touch behind the tab row (${H} px)`, async (page) => {
    await page.setViewportSize({ width: 390, height: H });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => window.pps.store.set({ role: 'instructor' }));
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => {
      window.__bad = [];
      const px = (v, el) => (String(v).trim().endsWith('%') ? parseFloat(v) / 100 * el.offsetHeight : parseFloat(v) || 0);
      const tick = () => {
        const b = document.querySelector('#thumbBar').getBoundingClientRect();
        for (const f of [0.1, 0.5, 0.9]) for (const y of [b.top + 4, b.bottom + 3, innerHeight - 1]) { const e = document.elementFromPoint(b.left + b.width * f, y); const c = e?.closest('#treatCard, #dock, #panel, .menu, .action-card'); if (c) window.__bad.push(`${c.id || c.className} on the tab row`); }
        for (const c of document.querySelectorAll('#treatCard:not([hidden]), #app.dock-open #dock, #app.panel-open #panel, .menu.as-sheet, .action-card.docked:not([hidden])')) {
          const cs = getComputedStyle(c), cut = (cs.clipPath.match(/inset\(([^)]*)\)/)?.[1] || '').split(/\s+/)[2];
          if (Math.abs(px(cs.translate.split(' ')[1], c) - px(cut, c)) > 0.5) window.__bad.push(`${c.id || c.className}: slide ${cs.translate} vs cut ${cut}`);
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
    // A vessel's and an organ's card: whole, on the tab row's top edge, with the play bar stepped aside; it closes behind the tab row.
    for (const sel of [{ type: 'edge', id: 'SV_MID' }, { type: 'organ', id: 'liver' }, { type: 'organ', id: 'spleen' }]) {
      await page.evaluate((s) => window.pps.store.set({ selection: s }), sel);
      await page.waitForFunction(() => { const c = document.querySelector('.action-card'); return !c.hidden && !c.getAnimations().length; });
      const v = await page.evaluate(() => { const c = document.querySelector('.action-card').getBoundingClientRect(), t = document.querySelector('#thumbBar').getBoundingClientRect(); return { gap: Math.round(t.top - c.bottom), top: Math.round(c.top), bar: [...document.querySelectorAll('#vdock > :not(.thumb-bar):not(.vd-status)')].some((e) => +getComputedStyle(e).opacity > 0.05) }; });
      if (Math.abs(v.gap) > 1) throw new Error(`the ${sel.id} card ends ${v.gap} px above the tab row, not on it`);
      if (v.top < 60) throw new Error(`the ${sel.id} card runs up to ${v.top} px`);
      if (v.bar) throw new Error(`the play bar shows over the ${sel.id} card`);
      const pill = await page.evaluate(() => { const c = document.querySelector('.action-card').getBoundingClientRect(), p = document.querySelector('#viewPill').getBoundingClientRect(); return Math.round(c.top - p.bottom); });
      if (pill < 0 || pill > 16) throw new Error(`the view switch sits ${pill} px above the ${sel.id} card, not just above it`);
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
          const full = await height(sel);
          if (full < h0 + 20) throw new Error(`${name}: the grabber did not open Full`);
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
    await page.waitForSelector('#historyCard:not([hidden]) .tl-pop-row');
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
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [1024, 768], [820, 1180]] : [[390, 844], [360, 740], [430, 932], [844, 390]];
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
          for (let i = 1; i < t.parts.length; i++) if (t.parts[i].t < t.parts[i - 1].b - 0.5) throw new Error(`${where}: "${t.id}" ${t.parts[i].q} overlaps ${t.parts[i - 1].q}`);
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
          if (/tl-(ff|hist|pin)/.test(p.q) && (p.w < 35.5 || p.h < 35.5)) throw new Error(`${where}: ${p.q} is smaller than a 36 px button`);
        }
        for (let i = 0; i < bar.parts.length; i++) for (let j = i + 1; j < bar.parts.length; j++) { const a = bar.parts[i], c = bar.parts[j]; if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) throw new Error(`${where}: ${a.q} overlaps ${c.q}`); }
        if (w < 768 && hgt > 500) {
          if (new Set(r.tiles.map((t) => Math.round(t.t))).size > 1) throw new Error(`${where}: the readouts do not line up (tops ${r.tiles.map((t) => Math.round(t.t))})`);
          if (new Set(r.tiles.map((t) => Math.round(t.h))).size > 1) throw new Error(`${where}: the readouts differ in height`);
          for (const t of r.tiles) { const v = t.parts.find((p) => p.q === 'v'), s = t.parts.find((p) => p.q === 's') || t.parts.find((p) => p.q === 'rb'); if (Math.abs(v.l - s.l) > 1) throw new Error(`${where}: the rating of "${t.id}" is not under its value`); }
        }
        seen.push({ q, tiles: r.tiles.map((t) => [t.id, Math.round(t.l), Math.round(t.t), Math.round(t.w), Math.round(t.h)].join(':')).join(' '), strip: Math.round(r.strip.h) });
      }
      if (seen[0].tiles !== seen[1].tiles || seen[0].strip !== seen[1].strip) throw new Error(`${w}x${hgt}: the readouts moved or resized between two patients (${seen[0].tiles} | ${seen[1].tiles})`);
    }
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
        const vis = (el) => { const st = getComputedStyle(el), r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && +st.opacity > 0.05 && r.width > 2 && r.height > 2; };
        // On a phone the chart, Treat, the instruments and a vessel's card are sheets that rise over the dock by design.
        const sheet = (el) => el.classList.contains('docked') || (matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px)').matches && (el.id === 'panel' || el.id === 'treatCard' || (el.id === 'dock' && !el.classList.contains('side'))));
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
      for (let i = 0; i < 10; i++) { await verify(`${at} slide ${i + 1}`); await page.keyboard.press('ArrowRight'); }
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
      const m = probe.querySelector('.scan-probe svg') && getComputedStyle(probe.querySelector('svg')).transform;
      if (!/matrix\(0\.70\d+, 0\.70\d+/.test(m)) bad.push(`probe not at 45° (${m})`);
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
      const FIBRO = [2, 3, 4, 7, 8, 9];   // the stiffness deck's slides with the FibroScan card (the overview is slide 1)
      for (let n = 1; n <= 10; n++) {
        if (n > 1) { await page.keyboard.type(String(n)); await page.keyboard.press('Enter'); }
        if (await settle(`${at} slide ${n}`, FIBRO.includes(n))) withProbe++;
      }
      if (withProbe < 3) throw new Error(`${at}: only ${withProbe} FibroScan slides showed the probe`);
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
      await page.waitForFunction(() => !document.querySelector('.pz-check').getAnimations({ subtree: true }).length, null, { timeout: 20000 });
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
          rows = two ? [[kids.reduce((a, b) => (R(b).right > R(a).right ? b : a)), inner]] : kids.map((e) => [e, inner]);
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
}
// The endoscopic field is drawn once per state and then left as it is: the model's varix swells with every heartbeat,
// and following each swell redrew the shaded field many times a second, which held a browser without a GPU's page for
// minutes on every scope slide (15 Oct: the browser checks ran past their time limit). Over 8 s of a steady patient
// with the heartbeat running, it is drawn again at most twice.
check('desktop', 'endoscopy: a steady patient\'s field is not redrawn with every heartbeat', async (page) => {
  // (One year on, slide 5: small varices, whose beat-by-beat swell crossed the field's steps.)
  await open(page, '?script=one-year&slide=5');
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
// the slowest first, so they do not end up alone at the end (and shards share them out evenly)
const SLOW = ['responsive instrument workspace', 'pressure over time and Doppler', 'action card is a compact sheet that keeps the vessel in view', 'circuit view, selection card, lenses'];
const weight = (name) => { const i = SLOW.indexOf(name); return i < 0 ? 0 : SLOW.length - i; };
queue.sort((a, b) => weight(b[1]) - weight(a[1]));
if (process.env.SMOKE_MATCH) { const match = new RegExp(process.env.SMOKE_MATCH, 'i'); for (let i = queue.length - 1; i >= 0; i--) if (!match.test(queue[i][1])) queue.splice(i, 1); }
// Shards are filled by expected time, longest first, each check going to the least-loaded share
// (times measured on CI runners; checks not listed count as 45 s, a deck walk as 3 min).
const MEASURED = {
  'pan and pinch: marks and labels stay locked to the figure': 150000,
  'presenter in the liver: a slide change shows only the old and new slides\' labels, pills with their text': 90000,   // (one device pixel per pixel on a phone: about 65 s here)
  'presenter: lobule labels never touch, leaders never cross': 140000,
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
  'presenter: the controls never glide between slides, and keep their size and spacing, first and last included': 780000,   // (a phone CI runner took 10 minutes, a desktop one 12.7)
};
const expected = (name) => MEASURED[name] ?? (STRIP_SLIDES.has(name) ? STRIP_SLIDES.get(name) * 2 * 42000 : null) ?? (CHART_SLIDES.has(name) ? CHART_SLIDES.get(name) * 125000 : null) ?? (/^presenter: on every slide of /.test(name) ? 180000 : 45000);
const [shard, shards] = (process.env.SMOKE_SHARD || '1/1').split('/').map(Number);
const load = Array(shards).fill(0);
const owner = new Map();
for (const item of [...queue].sort((a, b) => expected(b[1]) - expected(a[1]))) {
  const k = load.indexOf(Math.min(...load));
  load[k] += expected(item[1]);
  owner.set(item, k);
}
if (process.env.SMOKE_PLAN) { console.log(`${queue.length} checks; expected minutes per share: ${load.map((v) => Math.round(v / 6000) / 10).join(' ')}`); if (process.env.SMOKE_PLAN === 'list') for (const [item, k] of owner) console.log(`${k + 1}/${shards} ${Math.round(expected(item[1]) / 6000) / 10} ${item[1]}`);
  process.exit(0); }   // (SMOKE_PLAN=1: only print how the shares divide; =list also names the checks of each share)
for (let i = queue.length - 1; i >= 0; i--) if (owner.get(queue[i]) !== shard - 1) queue.splice(i, 1);
const WORKERS = Number(process.env.SMOKE_WORKERS) || 4;
await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) await runCheck(...queue.shift()); }));

await browser.close();
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('All smoke checks passed.');
