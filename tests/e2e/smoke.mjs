// End-to-end smoke test in a real browser (Chromium via Playwright): the app loads without
// errors on a desktop and a phone, the model runs, and every major surface opens.
//
//   node tests/e2e/smoke.mjs            the repository root (the build-free site)
//   node tests/e2e/smoke.mjs dist       the production build (npm run build first)
//   SHOTS=dir node tests/e2e/smoke.mjs  also save screenshots
//   SMOKE_WORKERS=1                    checks at a time (default 4; use 1 on a small CI runner)
//   SMOKE_DEVICE=phone SMOKE_SHARD=1/2 one device, and one share of its checks (CI runs shards in parallel)
//
// Needs a Chromium for Playwright (`npx playwright install chromium`; the Claude Code cloud
// image ships one).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from '../../scripts/serve.mjs';

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
async function runCheck(device, name, fn) {
  const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  try {
    await fn(page);
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    console.log(`ok   ${device.padEnd(7)} ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${device.padEnd(7)} ${name}: ${e.message.split('\n')[0]}`);
    if (shots) await page.screenshot({ path: `${shots}/FAIL-${device}-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
  await ctx.close();
}
const shot = (page, name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : null);
const open = async (page, q = '') => {
  await page.goto(server.url + q);
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 20000 });
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

  await check(device, 'circuit turns upright and back', async (page) => {
    await open(page, '?preset=csph');
    if (await page.$eval('#rotateCircuit', (b) => getComputedStyle(b).display) !== 'none') throw new Error('turn button shows in the anatomy');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(1000);
    const box = () => page.$eval('#stage', (s) => s.viewBox.baseVal.height / s.viewBox.baseVal.width);
    if (!((await box()) < 1)) throw new Error('circuit did not open wide');
    await page.click('#rotateCircuit');
    await page.waitForTimeout(900);
    if (!((await box()) > 1)) throw new Error('circuit did not turn tall');
    if ((await page.$eval('#rotateCircuit', (b) => b.getAttribute('aria-pressed'))) !== 'true') throw new Error('turn button is not pressed');
    await shot(page, `${device}-circuit-upright`);
    // A vessel can still be picked, and the flow marks keep running, in the turned map.
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } }));
    await page.waitForSelector('.action-card:not([hidden])');
    await page.evaluate(() => { window.pps.store.set({ selection: null }); document.querySelector('#rotateCircuit').click(); });
    await page.waitForTimeout(900);
    if (!((await box()) < 1)) throw new Error('circuit did not turn back to wide');
  });
  if (device === 'phone') await check(device, 'action card is a compact sheet that keeps the vessel in view', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(800);
    const read = () => page.evaluate(() => {
      const c = document.querySelector('.action-card'), r = c.getBoundingClientRect(), sv = document.querySelector('#stageView').getBoundingClientRect(), sc = c.querySelector('.ac-scroll');
      const link = c.querySelector('.ac-foot.in-head .link');
      return { covers: r.bottom > sv.bottom + 20, peek: c.classList.contains('peek'), docked: c.classList.contains('docked'), top: r.top - sv.top, h: r.height, stageH: sv.height, scrolls: sc.scrollHeight - sc.clientHeight, links: !!link && link.getBoundingClientRect().height > 0, foot: getComputedStyle(c.querySelector('.ac-foot.at-foot')).display !== 'none' };
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
    if (!s.docked || s.peek) throw new Error('the card should open as a docked sheet, not as the strip');
    if (s.h > s.stageH * 0.36) throw new Error(`the sheet covers ${Math.round((100 * s.h) / s.stageH)} % of the figure`);
    if (!s.covers) throw new Error('the sheet should reach the bottom of the figure column, over the play row');
    if (s.scrolls > 2) throw new Error(`the portal vein card scrolls by ${s.scrolls} px: everything should show at once`);
    if (!s.links || s.foot) throw new Error('Why? and Details should be in the header, with no row of their own at the foot');
    const anchorY = await page.evaluate(() => { const a = window.pps.stage.anchorFor({ type: 'edge', id: 'PV_TRUNK' }); return a && a.y; });
    if (anchorY == null || anchorY > s.top) throw new Error(`the vessel (y ${Math.round(anchorY)}) is under the sheet (top ${Math.round(s.top)})`);
    await page.click('.ac-grab');
    await page.waitForTimeout(500);
    s = await read();
    if (!s.peek || s.h > s.stageH * 0.22) throw new Error('the strip is not small');
    await swipe(-70);
    s = await read();
    if (s.peek) throw new Error('a swipe up did not open the sheet');
    await swipe(70);
    s = await read();
    if (!s.peek) throw new Error('a swipe down did not fold the sheet to the strip');
    await shot(page, 'phone-card-strip');
    await swipe(70);
    if (!(await page.$eval('.action-card', (c) => c.hidden))) throw new Error('a swipe down from the strip did not close the card');
  });
  await check(device, 'circuit view, selection card, lenses', async (page) => {
    await open(page, '?preset=csph');
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(1200);
    await shot(page, `${device}-circuit`);
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
    if (await page.locator('.action-card').isVisible()) throw new Error('the card stays open after Doppler');
  });

  await check(device, 'home, palette, figure, presenter, instruments', async (page) => {
    await open(page, '?home=explore');
    await page.waitForSelector('#home:not([hidden])');
    await shot(page, `${device}-home`);
    await page.evaluate(() => window.pps.home.open('present'));
    await page.waitForFunction(() => document.querySelector('#home .script, #home .home-item'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.pps.palette.open());
    await page.waitForSelector('.pal-back:not([hidden])');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.pps.toggleFigure(true));
    await page.waitForFunction(() => document.querySelector('#figHead')?.textContent.includes('Portal circulation'));
    await page.evaluate(() => window.pps.toggleFigure(false));
    await page.evaluate(() => window.pps.dock.show('profile', { reveal: true }));
    await page.waitForTimeout(500);
    await shot(page, `${device}-instruments`);
    await page.evaluate(() => window.pps.dock.show('landscape', { reveal: true }));
    await page.waitForFunction(() => document.querySelector('.land-verdict')?.textContent.includes('Steepest fall'));
    await shot(page, `${device}-landscape`);
  });

  await check(device, 'lesson and case deep links', async (page) => {
    await open(page, '?lesson=hvpg');
    await page.waitForFunction(() => (document.querySelector('#coach')?.textContent.length > 20) || (document.querySelector('#panelLesson')?.textContent.length > 20));
    await open(page, '?case=bleed');
    await page.waitForFunction(() => document.querySelector('#panelCase')?.textContent.length > 20);
    await shot(page, `${device}-case`);
  });

  await check(device, 'flow renderers (WebGL2 forced, Canvas2D forced)', async (page) => {
    await page.addInitScript(() => { window.PPS_FLOW_GL = true; });
    await open(page, '?preset=cirr-hepatofugal');
    const kind = await page.evaluate(() => document.querySelector('#stageView').dataset.flow);
    if (kind !== 'webgl2') throw new Error(`expected the WebGL2 flow renderer, got ${kind}`);
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
    await page.waitForTimeout(900);
    await shot(page, `${device}-flow-webgl2`);
    const p2 = await page.context().newPage();
    await p2.addInitScript(() => { window.PPS_FLOW_2D = true; });
    await p2.goto(server.url + '?preset=cirr-hepatofugal');
    await p2.waitForFunction(() => window.pps?.store?.get().frame);
    const k2 = await p2.evaluate(() => document.querySelector('#stageView').dataset.flow);
    if (k2 !== 'canvas2d') throw new Error(`expected the Canvas2D flow renderer, got ${k2}`);
    await p2.close();
  });

  await check(device, 'vessels and plate on the GPU (?veins=gl)', async (page) => {
    await open(page, '?preset=cirr-decomp&veins=gl');
    const kind = await page.evaluate(() => document.querySelector('#stageView').dataset.veins);
    if (kind !== 'webgl2') throw new Error(`expected the WebGL2 veins, got ${kind}`);
    const on = (cls) => page.waitForFunction((c) => document.querySelector('#stageView').classList.contains(c), cls);
    await on('gl-on');
    await on('gl-plate');   // the organs, rasterized for the GPU
    if (await page.evaluate(() => window.pps.stage.organAt(560, 350)) !== 'liver') throw new Error('organs cannot be picked under the GPU plate');
    await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' }, colorMode: 'heat' }));
    await page.evaluate(() => window.pps.store.set({ view: 'circuit' }));
    await page.waitForFunction(() => !document.querySelector('#stageView').classList.contains('gl-on'));
    await page.evaluate(() => window.pps.store.set({ view: 'anatomic', selection: null, colorMode: 'pressure' }));
    await on('gl-on');
    // The exported figure is the SVG plate, tubes and overlays included.
    const svg = await page.evaluate(async () => (await window.pps.figure.buildSVG()).svg);
    if (!svg.includes('#gr-PV_TRUNK')) throw new Error('exported figure lost the vessel tubes');
    if (!(await page.evaluate(() => document.querySelector('#stageView').classList.contains('gl-on')))) throw new Error('the export left the SVG tubes showing');
    const png = await page.evaluate(() => window.pps.stage.rasterLayers(1));
    if (!png?.veins?.startsWith('data:image/png')) throw new Error('no GPU picture for the PNG export');
    await shot(page, `${device}-veins-gl`);
  });

  await check(device, 'dark theme', async (page) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '?preset=budd-chiari');
    await page.waitForTimeout(800);
    await shot(page, `${device}-dark`);
  });
  await check(device, 'responsive instrument workspace', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.click('#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    await page.waitForTimeout(400);
    const geometry = () => page.evaluate(() => {
      const dock = document.querySelector('#dock').getBoundingClientRect();
      const stage = document.querySelector('#stageView').getBoundingClientRect();
      const panel = document.querySelector('#panel');
      return { stageH: stage.height, stageBottom: stage.bottom, dockTop: dock.top,
        dockRight: dock.right, width: innerWidth,
        scrim: getComputedStyle(document.querySelector('#panelScrim')).visibility,
        panel: getComputedStyle(panel).visibility };
    });
    let g = await geometry();
    if (g.stageH < 50 || g.stageBottom > g.dockTop + 1) throw new Error('workspace overlays or hides the anatomy');
    if (g.dockRight > g.width + 1) throw new Error('workspace extends off screen');
    if (device === 'phone' && (g.scrim === 'visible' || g.panel === 'visible')) throw new Error('opening instruments also opens a patient overlay');
    const before = await page.evaluate(() => window.pps.store.get().frame.t);
    await page.waitForTimeout(500);
    if (!((await page.evaluate(() => window.pps.store.get().frame.t)) > before)) throw new Error('opening instruments paused simulation');
    await page.click('.workspace-divider');
    await page.keyboard.press('ArrowUp');
    await page.click('.workspace-expand');
    await page.click('.workspace-compare');
    await page.waitForFunction(() => !!window.pps.store.get().compareSnap);
    await page.click('.workspace-expand');
    await page.waitForSelector('.workspace-comparison:not([hidden])');
    const choose = async (id) => {
      await page.click('#dockHead .dock-title');
      if (await page.locator('.instrument-option').count() !== 8) throw new Error('chooser must offer eight distinct instruments');
      await page.click(`.instrument-option[data-instrument="${id}"]`);
      await page.waitForTimeout(250);
    };
    for (const id of ['scope', 'flow', 'perfusion', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'profile']) {
      await choose(id);
      const overflow = await page.$eval(`#pane-${id}`, (el) => el.scrollWidth - el.clientWidth);
      if (overflow > 2) throw new Error(`${id} has horizontal overflow (${overflow}px)`);
      const sized = await page.$eval(`#pane-${id}`, (el) => [...el.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().height > 0).every((c) => c.width > 1 && c.height > 1));
      if (!sized) throw new Error(`${id} has an unsized visible canvas`);
    }
    await page.evaluate(() => window.pps.dock.show('landscape', { reveal: true }));
    await page.waitForSelector('.land-verdict');
    await page.evaluate(() => window.pps.dock.show('varixwall', { reveal: true }));
    if (!(await page.$eval('.wall-details', (d) => d.open))) throw new Error('legacy varixwall route does not open mechanics');
    await page.click('.workspace-expand');
    await page.waitForFunction(() => document.querySelector('#app').classList.contains('instrument-focus'));
    // Run and Compare live in the header only while the instrument has the whole screen.
    await page.click('.workspace-run');
    await page.waitForFunction(() => !window.pps.store.get().running);
    await page.waitForTimeout(250);
    const square = await page.$eval('#pane-endoscopy .chart-box.square', (el) => { const r = el.getBoundingClientRect(); return Math.abs(r.width - r.height); });
    if (square > 2) throw new Error('endoscopy loses its square aspect ratio');
    await page.$eval('#pane-endoscopy', (el) => { el.scrollTop = 0; });
    await shot(page, `${device}-workspace-endoscopy`);
    await page.click('.workspace-expand');
    await page.click('.workspace-fold');
    await page.waitForFunction(() => document.querySelector('#dock').dataset.state === 'peek');
    await page.click('.workspace-fold');
    if (device === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(500);
      g = await geometry();
      if (g.dockRight > g.width + 1 || g.stageH < 20) throw new Error('rotation makes workspace unusable');
      await page.click('.workspace-expand');
      await shot(page, 'phone-workspace-landscape');
      await page.click('.workspace-expand');
      await page.setViewportSize({ width: 390, height: 844 });
    } else {
      await page.click('#btnInspector');
      await page.waitForTimeout(500);
      await page.click('.dock-second');
      await page.click('.instrument-option[data-instrument="doppler"]');
      await page.waitForSelector('#dockBody.split');
      await shot(page, 'desktop-workspace-two-instruments');
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);
      if (await page.$eval('#dockBody', (el) => el.classList.contains('split'))) throw new Error('two cramped columns remain on tablet');
      await shot(page, 'tablet-workspace');
    }
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await page.waitForFunction(() => window.pps.store.get().running);
  });

  await check(device, 'pressure over time and Doppler', async (page) => {
    await open(page, '?preset=cirr-decomp');
    if (await page.evaluate(() => window.pps.store.get().frame.pulsing)) throw new Error('heartbeat runs before a waveform instrument is open');
    await page.click('#tabInstruments');
    await page.evaluate(() => window.pps.dock.show('scope'));
    // The heartbeat switches on while a waveform instrument is on screen, without touching the patient's parameters.
    await page.waitForFunction(() => window.pps.store.get().frame.pulsing, null, { timeout: 5000 });
    if (await page.evaluate(() => window.pps.store.get().params.pulsatile)) throw new Error('opening an instrument changed the patient parameters');
    await page.waitForTimeout(2500);
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
    await page.waitForFunction(() => window.pps.store.get().frame.day > 0, null, { timeout: 20000 });
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
    await page.waitForFunction(() => !window.pps.store.get().frame.pulsing, null, { timeout: 5000 });
  });
}
// the slowest first, so they do not end up alone at the end (and shards share them out evenly)
const SLOW = ['responsive instrument workspace', 'pressure over time and Doppler', 'action card is a compact sheet that keeps the vessel in view', 'circuit view, selection card, lenses'];
const weight = (name) => { const i = SLOW.indexOf(name); return i < 0 ? 0 : SLOW.length - i; };
queue.sort((a, b) => weight(b[1]) - weight(a[1]));
const [shard, shards] = (process.env.SMOKE_SHARD || '1/1').split('/').map(Number);
for (let i = queue.length - 1; i >= 0; i--) if (i % shards !== shard - 1) queue.splice(i, 1);
const WORKERS = Number(process.env.SMOKE_WORKERS) || 4;
await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) await runCheck(...queue.shift()); }));

await browser.close();
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('All smoke checks passed.');
