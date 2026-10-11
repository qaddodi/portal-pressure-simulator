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
import { mkdirSync, readFileSync } from 'node:fs';
import { serve } from '../../scripts/serve.mjs';
import { checkCharts, checkStrip } from './chart-text.mjs';

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
const check = (device, name, fn) => { queue.push([device, name, fn]); };
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
    if (Math.abs(innerWidth - b.right - 10) > 1.5) return `the pill is ${Math.round(innerWidth - b.right)} px from the right edge, not 10`;
    if (Math.abs(innerHeight - b.bottom - 4) > 1.5) return `the pill is ${Math.round(innerHeight - b.bottom)} px from the bottom, not 4`;
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
    const first = [...host.querySelectorAll(':scope > *, :scope > .pz-ph > *')].find((el) => el.getBoundingClientRect().height && !el.matches('.pz-ph'));
    const pad = parseFloat(getComputedStyle(host).paddingTop) + parseFloat(getComputedStyle(host).borderTopWidth);
    if (first && !first.matches('.pz-h, .pz-dtitle, h1')) return `the card starts with ${first.className || first.tagName.toLowerCase()}, not its title`;
    if (first && first.getBoundingClientRect().top - h.top > pad + 2) return `the card's title starts ${Math.round(first.getBoundingClientRect().top - h.top - pad)} px below its top`;
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
  const fit = parseFloat(d.style.getPropertyValue('--pz-fit')) || 1;
  if (top > 12 || bottom > 12) return `the data card has ${Math.round(top)} px empty above and ${Math.round(bottom)} px below its contents (cap 12)`;
  if (fit < 1) return `the data card's contents are shrunk to ${Math.round(fit * 100)} %`;
  return null;
});

// Every deck's id (the presenter's library), for the per-deck checks below.
const DECK_IDS = [...readFileSync(new URL('../../src/ui/decks.js', import.meta.url), 'utf8').matchAll(/\['([a-z0-9-]+)', '(?:[^'\\]|\\.)*'\]/g)].map((m) => m[1]);
if (DECK_IDS.length < 15) throw new Error(`only ${DECK_IDS.length} deck ids read from decks.js`);
// Waits for the slide to settle (up to 10 s) and returns the last reading.
const barSettle = async (page) => {
  let r = null;
  for (let t = 0; t < 40 && r !== 'ok'; t++) { r = await barFit(page); if (r !== 'ok') await page.waitForTimeout(250); }
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

  await check(device, 'presenter in the liver: a slide change shows only the old and new slides\' labels, pills with their text', async (page) => {
    // The portal circulation deck (after its outline), one patient: the whole lobule, the portal tract, the sinusoid wall, the central vein.
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
      const anc = (e) => { let o = 1; for (let x = e; x && x !== app; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= +cs.opacity; } return o; };
      const sample = () => {
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
    await page.click('#viewSeg [data-view="lobule"]', { force: true });
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 });
    await page.click('#viewSeg [data-view="circuit"]', { force: true });
    const inCircuit = await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const f1 = await steady();
    await page.evaluate(() => window.pps.stage.fit());
    const f2 = await steady();
    if (inCircuit !== f1 && inCircuit !== f2) throw new Error(`circuit opened at ${inCircuit}, not at a fit framing (${f1} / ${f2})`);
    await page.click('#viewSeg [data-view="anatomic"]', { force: true });
    const back = await steady();
    if (back !== home) throw new Error(`the anatomy came back at ${back}, not at its framing ${home}`);
  });

  // Every way into or out of the lobule is one continuous zoom: the camera's magnification (the plate's zoom plus the dive's)
  // moves steadily from the first frame to the last, in one direction, with no stop at an intermediate framing (the liver, the fit).
  // The presenter's slides are walked with the arrow keys, from the slide before a crossing to the one after it, and back.
  const CROSSINGS = [   // [deck, slide to start on (0-based), key, whether the key goes into the lobule, whether it is the sinusoid view that is gone to or left]
    ['circulation', 3, 'ArrowRight', true], ['circulation', 4, 'ArrowLeft', false], ['circulation', 7, 'ArrowRight', false],   // ladder → lobule and back; central vein → the next view
    ['lobule', 0, 'ArrowRight', true],   // the outline's fit → the whole lobule
    ['ncph', 1, 'ArrowRight', true], ['ncph', 4, 'ArrowRight', true], ['ncph', 5, 'ArrowRight', false],   // a fit, then a liver close-up, before it
    ['sites', 7, 'ArrowLeft', true],   // backwards into it
    ['ascites', 0, 'ArrowRight', true, true], ['ascites', 4, 'ArrowRight', true, true], ['tap', 7, 'ArrowRight', true, true],   // anatomy straight to the sinusoid view, through the lobule without stopping in it
    ['ascites', 5, 'ArrowRight', false, true, true], ['ascites', 8, 'ArrowRight', false, true, true],   // and the sinusoid view straight back out to the anatomy (a new patient: the words, and so the space the camera frames into, are settled after the rise)
    ['hvpg', 6, 'ArrowRight', false], ['outflow', 5, 'ArrowRight', true],   // out to a region, with a new patient; in from a region
  ];
  for (const [deck, from, key, into, sin, newPatient] of CROSSINGS) {
    await check(device, `lobule zoom is continuous: ${deck} slide ${from + 1} ${key === 'ArrowLeft' ? 'back ' : ''}${into ? 'into' : 'out of'} the ${sin ? 'sinusoid view' : 'lobule'}`, async (page) => {
      await open(page, '?preset=healthy');
      const n = from + 1, way = (into ? 'into' : 'out of') + (sin ? ' the sinusoid view' : ' the lobule');
      await page.evaluate(([d, i]) => window.pps.presenter.start(d, i), [deck, from]);
      await page.waitForFunction((n) => (document.querySelector('.pzb-n, .pz-count')?.textContent || '').trim().startsWith(n + ' /') && !document.querySelector('.pz-cover'), n, { timeout: 60000 });
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
      const label = await page.evaluate(() => document.querySelector('.pzb-n, .pz-count')?.textContent.trim());
      await page.keyboard.press(key);
      await page.waitForFunction((l) => (document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '') !== l, label);
      await quiet(into);
      const s = await page.evaluate(() => { window.__zoomTrace.go = false; return window.__zoomTrace.s; });
      // One move: the dive (or rise) itself, with no glide of the camera before or after it beyond a small settling (a new patient changes the space the words leave, after the rise has begun).
      const moves = await page.evaluate(() => window.pps.stage.cameraMoves());
      const big = moves.filter((m) => m.kind === 'glide' && (m.zoom > 0.2 || m.pan > 100));
      if (big.length && !newPatient) throw new Error(`${deck} slide ${n} ${way}: the camera also glided ${big.map((m) => `${m.zoom.toFixed(2)} in zoom, ${Math.round(m.pan)} across`).join('; ')} (${moves.map((m) => m.kind + (m.zoom !== undefined ? ` ${m.zoom.toFixed(2)}/${Math.round(m.pan)}@${Math.round(m.t - moves[0].t)}` : '')).join(', ')})`);
      if (sin && moves.filter((m) => m.kind === (into ? 'chain-in' : 'chain-out')).length !== 1) throw new Error(`${deck} slide ${n} ${way}: not one zoom through the lobule (${moves.map((m) => m.kind).join(', ')})`);
      if (sin && into && !(await page.evaluate(() => window.pps.store.get().sinusoid && window.pps.stage.sinusoidOpen()))) throw new Error(`${deck} slide ${n}: the sinusoid view is not open at the end`);
      if (moves.filter((m) => m.kind === 'dive' || m.kind === 'rise').length !== 1) throw new Error(`${deck} slide ${n} ${way}: ${moves.filter((m) => m.kind === 'dive' || m.kind === 'rise').length} dives or rises, not one`);
      // The zoom's own span: from its first move to its last (the words fade before it starts and the labels after it ends).
      if (process.env.ZOOM_TRACE) console.log(`${deck} ${n} ${key}`, s.map(([t, z]) => `${Math.round(t - s[0][0])}:${z.toFixed(3)}`).join(' '));
      const z0 = s[0]?.[1], zEnd = s[s.length - 1]?.[1];
      // (A loaded software renderer may draw too few frames to follow the zoom: the check of the moves above is then the one that counts.)
      if (s.length < 10 || Math.abs(zEnd - z0) < 0.3) return;
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
        return { n: document.querySelector('.pzb-n')?.textContent.trim(), at: [b.left, b.top], boxes: [[0, 0, b.width, b.height], ...[...bar.children].filter((c) => !c.classList.contains('pzb-q')).map(q)] };
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
      // (A folding tool: Show then Hide must leave the card's contents at full size, as on arrival.)
      const fold = page.locator('.pz-data:not(.pz-hide):not([hidden]) .pz-fold');
      if (await fold.isVisible().catch(() => false)) {
        for (const want of ['true', 'false']) {
          await fold.click();
          await page.waitForFunction((w) => document.querySelector('.pz-data .pz-fold')?.getAttribute('aria-expanded') === w, want);
          await page.waitForTimeout(700);
          const g = await cardGap(page);
          if (g && (want === 'false' || g.includes('shrunk'))) throw new Error(`${deck}, slide ${n}, after ${want === 'true' ? 'Show' : 'Show then Hide'}: ${g}`);
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

  // A phone's data card stays short: its tiles read as one wrapping line (name, value, rating, the change said short), nothing
  // spilling out of a tile. The FibroScan slide's two tiles sit side by side, one line each.
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
    if (r.n !== 2 || r.h > 72 || r.tile > 32 || r.spill.length) throw new Error(`FibroScan card ${Math.round(r.h)}px tall (cap 72), tallest of ${r.n} tiles ${Math.round(r.tile)}px (cap 32)${r.spill.length ? ', spilling: ' + r.spill.join() : ''}`);
    // The Doppler card: its report in three short rows, the direction clear of the stats.
    await page.evaluate(() => window.pps.presenter.start('doppler', 1));
    await page.waitForFunction(() => document.querySelector('.pz-data:not(.pz-hide) .pz-tool[data-kind="doppler"] .dop-dir')?.textContent.length > 2, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => {
      const R = (q) => document.querySelector('.pz-data:not(.pz-hide) ' + q).getBoundingClientRect(), a = R('.dop-dir'), b = R('.dop-stats');
      return { h: R('').height, hit: a.bottom > b.top && a.right > b.left };
    });
    if (d.h > 300 || d.hit) throw new Error(`Doppler card ${Math.round(d.h)}px tall (cap 300)${d.hit ? ', the direction runs into the stats' : ''}`);
  });

  await check(device, 'presenter: summary table returns after back then forward', async (page) => {
    await open(page, '?home=present');
    await page.waitForSelector('.umenu .um-row[data-k="d:lobule"]');
    await page.fill('.um-q', 'lobule');
    await page.press('.um-q', 'Enter');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('presenting'));
    const at = (n) => page.waitForFunction((n) => /^(\d+) \/ \1$/.test(document.querySelector('.pzb-n, .pz-count')?.textContent.trim() || '') === n, n);
    const table = () => page.waitForSelector('.pz-panel .pz-table', { state: 'visible' });
    await page.keyboard.press('End');
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

  await check(device, 'presenter: summary table cells stay under their headings', async (page) => {
    // Each cell's contents sit inside its column heading's width, and no two cells overlap, at each size (the desktop run
    // also tries an upright iPad). (A phone's control padding once pushed the names into the HVPG column.)
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const deck of ['circulation', 'hvpg']) {
        await open(page, `?script=${deck}&slide=99`);   // (the last slide: the summary)
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

  await check(device, 'presenter: lobule labels never touch, leaders never cross', async (page) => {
    // The slides that name several lobule structures at once, at each size: no two labels, pills included, come within
    // a few pixels of each other; no leader runs under another label or crosses another leader. The desktop run also
    // tries an iPad's portrait screen.
    const sizes = device === 'desktop' ? [null, { width: 820, height: 1180 }] : [null];
    for (const size of sizes) {
      if (size) await page.setViewportSize(size);
      for (const [deck, n] of [['circulation', 5], ['circulation', 6], ['two-inflows', 3], ['lobule', 7]]) {
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

  await check(device, 'lesson and case deep links', async (page) => {
    await open(page, '?lesson=portal-flow');
    await page.waitForFunction(() => (document.querySelector('#coach')?.textContent.length > 20) || (document.querySelector('#panelLesson')?.textContent.length > 20));
    await open(page, '?case=bleed');
    await page.waitForFunction(() => document.querySelector('#panelCase')?.textContent.length > 20);
    await shot(page, `${device}-case`);
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
    const fits = await page.$eval('#btnBlood', (el) => { const r = el.getBoundingClientRect(); return r.width >= 30 && r.left >= 0 && r.right <= innerWidth; });
    if (!fits) throw new Error('Blood button is clipped');
    await page.click('#btnBlood');
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
    await page.click('#viewSeg [data-view="lobule"]');
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
    // Framed in the free space: the lobule's bottom corner is above the vitals dock, also with every readout open
    // (the More readouts button is for instructors; Student mode keeps just HVPG and PPG).
    await page.evaluate(() => window.pps.store.set({ role: 'instructor' }));
    for (const all of [false, true]) {
      if (all) await page.click('#strip .ro-more');
      const clear = await page.waitForFunction(() => {
        const dock = document.querySelector('#vdock').getBoundingClientRect().top, labs = [...document.querySelectorAll('.lz-lab:not([hidden])')];
        return labs.every((l) => l.getBoundingClientRect().bottom <= dock + 1);
      }, null, { timeout: 15000 }).then(() => true, () => false);
      if (!clear) throw new Error(`a lobule label sits under the dock${all ? ' with every readout open' : ''}`);
      if (all) { await page.click('#strip .ro-more'); await page.waitForTimeout(400); }
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
    await page.click('#btnLobuleLayers');
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
    await page.click('#viewSeg [data-view="anatomic"]', { force: true });
    await page.waitForFunction(() => !window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
    if (await page.evaluate(() => window.pps.store.get().selection?.type === 'lobule')) throw new Error('the lobule card stayed open after leaving');
  });

  await check(device, 'floating layout: figure fills the screen, Treat card, findings badge', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    const fill = await page.evaluate(() => { const r = document.querySelector('#stageView').getBoundingClientRect(); return (r.width * r.height) / (innerWidth * innerHeight); });
    if (fill < 0.97) throw new Error(`the figure covers only ${Math.round(fill * 100)} % of the screen`);
    if (await page.evaluate(() => document.querySelector('#app').classList.contains('panel-open'))) throw new Error('the patient chart should start closed');
    const n = await page.$eval('#findBadge', (el) => parseInt(el.textContent, 10));
    if (!(n > 0)) throw new Error('decompensated cirrhosis shows no findings on the badge');
    await page.click('#btnInspector');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('panel-open'));
    // The model runs, so a finding can come or go between two reads: compare them in one frame.
    await page.waitForFunction(() => parseInt(document.querySelector('#findBadge').textContent, 10) === document.querySelectorAll('#panel .finding').length, null, { timeout: 5000 })
      .catch((e) => { throw new Error('the badge and the chart disagree on the number of findings', { cause: e }); });
    await page.click('#panelClose');
    await page.click('#btnTreat');
    await page.waitForSelector('#treatCard:not([hidden]) .order-chip');
    await page.locator('#treatCard .order-chip', { hasText: 'Carvedilol' }).click();
    await page.waitForFunction(() => window.pps.store.get().params.drugs.carvedilol);
    await shot(page, `${device}-treat`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#treatCard', { state: 'hidden' });
  });
  // Nothing that floats over the figure may cover another floating piece, or leave the screen, at the
  // sizes the owner tests on (laptop, iPad both ways, iPhone both ways), in Explore, with the
  // instruments, with the patient chart and the instruments together, and in a case.
  await check(device, 'floating pieces never overlap', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [820, 1180]] : [[390, 844], [844, 390]];
    const states = [['?preset=cirr-decomp', null], ['?preset=cirr-decomp', 'measure'], ['?preset=cirr-decomp', 'both'], ['?preset=cirr-decomp', 'card'], ['?case=bleed', null], ['?preset=cirr-decomp', 'lobule'], ['?preset=cirr-decomp', 'lobule-all']];
    for (const [w, hgt] of sizes) for (const [q, act] of states) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page, q);
      if (act === 'measure' || act === 'both') { await page.click('#tabInstruments'); await page.waitForSelector('#dockBody .dock-pane.active'); }
      if (act === 'both') await page.evaluate(() => document.querySelector('#btnInspector').click());
      if (act === 'lobule' || act === 'lobule-all') {
        await page.evaluate(() => window.pps.store.set({ lobule: true }));
        await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
        if (act === 'lobule-all') await page.evaluate(() => document.querySelector('#strip .ro-more').click());   // hidden on a phone held sideways
        await page.waitForTimeout(600);
      }
      if (act === 'card') { await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } })); await page.waitForSelector('.action-card:not([hidden])'); }
      await page.waitForTimeout(700);
      // The floating pieces follow each other's sizes a frame later (main.js publishes them on the next
      // animation frame), and the model keeps changing them (a bleed adds a line to the dock): an overlap
      // counts only if it is still there a few frames later.
      const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const measure = () => page.evaluate(() => {
        const SEL = ['.tb-id', '.top-right', '#viewSeg', '.topbar .sb-right', '.sb-center.float-ui', '#vdock', '#panel', '#treatCard:not([hidden])', '#dock', '#zoomPill', '.action-card:not([hidden])', '.coach:not(:empty)'];
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
      await open(page, '?preset=cirr-decomp'); await page.click('#tabInstruments'); await verify(`${at} tests`);
      await page.evaluate(() => document.querySelector('#btnInspector').click()); await verify(`${at} tests + patient`);
      await open(page, '?lesson=portal-flow'); await verify(`${at} lesson`);
      await open(page, '?case=bleed'); await verify(`${at} case`);
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
        if (bad.length) throw new Error(`${w}×${hgt} ${id} ${view}: ${bad.join('; ')}`);
        }
        await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
      }
    }
  });
  // The FibroScan probe's callout (its live kPa beside the waves): wherever the probe shows on the figure, in Explore with the FibroScan
  // card open and on every FibroScan slide, the callout shows too, inside the stage, and sits on no other label, the probe or its caption,
  // a site callout, a card, a bar or the credit (stage.js scanItem and layoutLabels place it before the other labels).
  await check(device, 'FibroScan callout beside the waves, clear of everything', async (page) => {
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
      const g = document.querySelector('#labels .lb[data-key="scan"]');
      if (!g || !vis(g) || g.classList.contains('lb-off')) return { probe: true, tool, shown: false };
      const pill = R(g.querySelector('.lb-bg')), bad = [], others = [];
      const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
      others.push(['probe', R(probe.querySelector('.sp-head'))]);
      for (const e of document.querySelectorAll('#labels .lb:not(.lb-off):not([data-key="scan"])')) if (vis(e)) for (const t of e.querySelectorAll('text')) { const r = R(t); if (r.r - r.l > 1) others.push([`label ${e.dataset.key}`, r]); }
      for (const e of document.querySelectorAll('.cath-label.site, .stage-blocker:not([hidden]), .pz-text, .pz-data, .pz-panel, .pz-bar, #dock, #panel, #treatCard:not([hidden]), .action-card:not([hidden]), .stage-credit')) if (vis(e)) { const r = R(e); if (r.r - r.l > 2) others.push([e.id || e.className.split(' ')[0], r]); }
      for (const [n, r] of others) if (hit(pill, r)) bad.push(n);
      if (pill.l < wr.left || pill.r > wr.right || pill.t < wr.top || pill.b > wr.bottom) bad.push('off the stage');
      if (probe.textContent.trim()) bad.push(`probe text "${probe.textContent.trim()}"`);   // the probe carries no caption: the orange number is the only callout
      if (!/\d/.test(g.textContent) || !/kPa/.test(g.textContent)) bad.push(`text "${g.textContent}"`);
      return { probe: true, tool, shown: true, bad };
    });
    // The callout fades in with the probe, and a slide's camera glides first: it counts only if it is still wrong a few seconds later.
    // A slide that carries the FibroScan card (data-kind) shows the probe; one without it may still be fading the last one out.
    const settle = async (what, needTool) => {
      let r = null;
      for (let i = 0; i < 48; i++) {
        await page.waitForTimeout(500); r = await inspect();
        if (needTool && !r.tool) continue;
        if (!r.probe && needTool) { if (i > 30) return false; continue; }   // covered by the slide's own card, or off the stage: nothing to name
        if (!r.probe || (r.shown && !r.bad.length)) return r.probe;
      }
      if (!needTool && !r.tool) return false;
      throw new Error(`${what}: ${r.shown ? `callout touches ${r.bad.join(', ')}` : needTool && !r.tool ? 'the FibroScan card never showed' : 'the probe shows but its callout does not'}`);
    };
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const at = `${w}×${hgt}`;
      await open(page, '?preset=cirr-comp');
      await page.click('#tabInstruments'); await page.waitForSelector('#dockBody .dock-pane.active');
      await page.evaluate(() => window.pps.dock.show('fibroscan', { reveal: true }));
      if (!(await settle(`${at} explore`, false))) throw new Error(`${at} explore: no probe on the figure`);
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
      ['findings', '#btnInspector'], ['treat', '#btnTreat'], ['measure', '#tabInstruments'], ['search', '#btnPalette'],
      ['vessel card', { type: 'edge', id: 'PV_TRUNK' }], ['liver card', { type: 'organ', id: 'liver' }], ['all readouts', '#strip .ro-more'],
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
    await page.click('#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    for (const id of ['abdomen', 'hvpg', 'fibroscan']) {
      await page.click(`.instr-tab[data-instrument="${id}"]`);
      await page.waitForTimeout(900);
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
          rows = [...['.ab-ctl > .ab-row', '.ab-drain'].flatMap((q) => [...view.querySelectorAll(q)].map((e) => [e, inner])),
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
    await page.click('#tabInstruments');
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
    if (await page.locator('.instr-tab').count() !== 6) throw new Error('the tabs must offer six distinct instruments (Pressure holds both pressure views)');
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
    await page.click('#tabInstruments');
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
// the slowest first, so they do not end up alone at the end (and shards share them out evenly)
const SLOW = ['responsive instrument workspace', 'pressure over time and Doppler', 'action card is a compact sheet that keeps the vessel in view', 'circuit view, selection card, lenses'];
const weight = (name) => { const i = SLOW.indexOf(name); return i < 0 ? 0 : SLOW.length - i; };
queue.sort((a, b) => weight(b[1]) - weight(a[1]));
if (process.env.SMOKE_MATCH) { const match = new RegExp(process.env.SMOKE_MATCH, 'i'); for (let i = queue.length - 1; i >= 0; i--) if (!match.test(queue[i][1])) queue.splice(i, 1); }
// Shards are filled by expected time, longest first, each check going to the least-loaded share
// (times measured on CI runners; checks not listed count as 45 s, a deck walk as 3 min).
const MEASURED = {
  'presenter in the liver: a slide change shows only the old and new slides\' labels, pills with their text': 125000,
  'presenter: lobule labels never touch, leaders never cross': 140000,
  'liver lobule: GPU vessels, pressure drops, caption, cards, zones': 160000,
  'corner credit never touches a card': 130000,
  'pressure over time and Doppler': 76000,
  'presenter: summary table returns after back then forward': 61000,
  'menu, palette, presenter, instruments': 55000,
  'tests card: every Ascites, HVPG and FibroScan row reaches the card\'s inner right edge': 37000,
  'sinusoid view: a rebuilt caption does not fade in again (no flashing at rest)': 36000,
  'circuit view, selection card, lenses': 38000,
  'action card is a compact sheet that keeps the vessel in view': 28000,
};
const expected = (name) => MEASURED[name] ?? (/^presenter: on every slide of /.test(name) ? 180000 : 45000);
const [shard, shards] = (process.env.SMOKE_SHARD || '1/1').split('/').map(Number);
const load = Array(shards).fill(0);
const owner = new Map();
for (const item of [...queue].sort((a, b) => expected(b[1]) - expected(a[1]))) {
  const k = load.indexOf(Math.min(...load));
  load[k] += expected(item[1]);
  owner.set(item, k);
}
for (let i = queue.length - 1; i >= 0; i--) if (owner.get(queue[i]) !== shard - 1) queue.splice(i, 1);
const WORKERS = Number(process.env.SMOKE_WORKERS) || 4;
await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) await runCheck(...queue.shift()); }));

await browser.close();
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('All smoke checks passed.');
