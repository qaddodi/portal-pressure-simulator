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
  await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 45000 });
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
    // Animations step with the frames: wait for where they end, not a fixed time (CI has no GPU).
    const ratio = () => { const s = document.querySelector('#stage'); return s.viewBox.baseVal.height / s.viewBox.baseVal.width; };
    const until = (fn, msg) => page.waitForFunction(fn, null, { timeout: 30000 }).catch(() => { throw new Error(msg); });
    await until(`(${ratio})() < 1`, 'circuit did not open wide');
    await page.click('#rotateCircuit');
    await until(`(${ratio})() > 1`, 'circuit did not turn tall');
    // Zoomed in, turning back keeps the zoom.
    // The zoom glides: read it once it holds still (a software renderer draws a frame a second or two apart).
    const steady = () => page.evaluate(() => new Promise((res) => { let a = window.pps.stage.zoomLevel(); const t = setInterval(() => { const b = window.pps.stage.zoomLevel(); if (Math.abs(b - a) < 1e-4) { clearInterval(t); res(b); } a = b; }, 700); }));
    const k0 = await steady();
    await page.evaluate(() => { window.pps.stage.zoomIn(); window.pps.stage.zoomIn(); });
    await page.waitForFunction((k0) => window.pps.stage.zoomLevel() > k0 * 1.5, k0, { timeout: 20000 });
    const kIn = await steady();
    await page.click('#rotateCircuit');
    await until(`(${ratio})() < 1`, 'circuit did not turn back to wide');
    const kAfter = await steady();
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
      return { covers: r.bottom >= innerHeight - 2 && r.top < document.querySelector('#vdock').getBoundingClientRect().top, peek: c.classList.contains('peek'), docked: c.classList.contains('docked'), top: r.top - sv.top, h: r.height, stageH: sv.height, scrolls: sc.scrollHeight - sc.clientHeight, links: !!link && link.getBoundingClientRect().height > 0, foot: getComputedStyle(c.querySelector('.ac-foot.at-foot')).display !== 'none' };
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
    if (!s.covers) throw new Error('the sheet should rise from the bottom of the screen, over the vitals dock');
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
    // The Blood menu (streaks, chevrons), the Blood origin lens, dye.
    const fits = await page.$eval('#btnLayers', (el) => { const r = el.getBoundingClientRect(); return r.width >= 30 && r.left >= 0 && r.right <= innerWidth; });
    if (!fits) throw new Error('Display button is clipped');
    await page.click('#btnLayers');
    if ((await page.$$('.layers-pop .blood-opt')).length !== 2) throw new Error('the Display menu should offer streaks and chevrons for the blood');
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
    // The exported SVG figure is the SVG plate, tubes and overlays included.
    const svg = await page.evaluate(async () => (await window.pps.figure.buildSVG()).svg);
    if (!svg.includes('#gr-PV_TRUNK')) throw new Error('exported figure lost the vessel tubes');
    if (!(await page.evaluate(() => document.querySelector('#stageView').classList.contains('gl-on')))) throw new Error('the export left the SVG tubes showing');
    const png = await page.evaluate(() => window.pps.stage.rasterLayers(1));
    if (!png?.veins?.startsWith('data:image/png')) throw new Error('no GPU picture for the PNG export');
    await shot(page, `${device}-veins-gl`);
  });

  await check(device, 'liver lobule: GPU vessels, ladder, cards, zones', async (page) => {
    await open(page, '?preset=cirr-decomp');
    // The lobule is a view of its own, beside Anatomy and Circuit.
    await page.click('#viewSeg [data-view="lobule"]');
    await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
    if (await page.getAttribute('#viewSeg [data-view="lobule"]', 'aria-pressed') !== 'true') throw new Error('the Lobule button is not shown as the current view');
    await page.waitForTimeout(900);
    const kind = await page.evaluate(() => document.querySelector('.lz').dataset.vessels);
    if (kind !== 'webgl2') throw new Error(`expected the lobule's vessels on the GPU, got ${kind}`);
    // The vessel layer actually holds a picture.
    const lit = await page.evaluate(() => {
      const g = document.querySelector('.lz-gl'), c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      const x = c.getContext('2d');
      x.drawImage(g, 0, 0, 160, 100);
      const d = x.getImageData(0, 0, 160, 100).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    });
    if (lit < 300) throw new Error(`the lobule's vessel layer is nearly empty (${lit} px)`);
    if ((await page.locator('.lz-lab').count()) !== 3) throw new Error('station cards missing');
    if ((await page.locator('.lz-lad .lz-ladDot').count()) !== 5) throw new Error('pressure ladder incomplete');
    const seg = await page.evaluate(() => document.querySelector('.lz-verdict').dataset.seg);
    if (seg !== 'sinusoidal') throw new Error(`cirrhosis should read as a sinusoidal block, got ${seg}`);
    // A part of the lobule opens the same action card as the anatomy, with its fibrosis slider.
    await page.locator('.lz-lab').nth(1).click();
    await page.waitForSelector('.action-card:not([hidden])');
    const cardText = await page.locator('.action-card').innerText();
    if (!cardText.includes('Sinusoid')) throw new Error('the sinusoid card did not open');
    if (!(await page.locator('.action-card input[aria-label^="Fibrosis"]').count())) throw new Error('no fibrosis slider on the sinusoid card');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.action-card', { state: 'hidden' });
    // The liver's own card no longer carries fibrosis by zone; the lobule's panel has cirrhosis.
    if (!(await page.locator('.lz-cir input').count())) throw new Error('no cirrhosis slider in the lobule');
    // Framed in the free space: the lobule's bottom corner is above the vitals dock, also with every readout open.
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
      let k0 = await zk();
      for (let i = 0; i < 20; i++) { await page.waitForTimeout(700); const k = await zk(); if (k === k0) break; k0 = k; }
      await page.click('#zoomIn');
      await page.waitForFunction((k0) => window.pps.stage.lobuleViewKey() !== k0, k0, { timeout: 15000 }).catch(() => { throw new Error('zoom in does nothing in the lobule'); });
      await page.click('#zoomFit');
      await page.waitForFunction((k0) => window.pps.stage.lobuleViewKey() === k0, k0, { timeout: 15000 }).catch(() => { throw new Error('Fit does not return the lobule to its framing'); });
    }
    // Zooming in stays in the lobule.
    const box = await page.locator('.lz').boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    if (device === 'desktop') { await page.mouse.wheel(0, -400); await page.waitForTimeout(300); }
    if (!(await page.evaluate(() => window.pps.stage.lobuleOpen()))) throw new Error('zooming in left the lobule');
    // Zooming out never leaves the lobule view.
    if (device === 'desktop') { for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 600); await page.waitForTimeout(600); }
    if (!(await page.evaluate(() => window.pps.stage.lobuleOpen()))) throw new Error('zooming out left the lobule');
    if (device === 'phone') await page.click('.lz-more');
    await page.click('.lz-tg.zones');
    await page.waitForFunction(() => document.querySelectorAll('.lz-zone').length === 3, null, { timeout: 5000 }).catch(() => { throw new Error('zones did not show'); });
    await page.click('.lz-tg.lymph');
    await page.waitForTimeout(500);
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
      .catch(() => { throw new Error('the badge and the chart disagree on the number of findings'); });
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
      const bad = await page.evaluate(() => {
        const SEL = ['.tb-id', '.top-right', '#viewSeg', '.topbar .sb-right', '.sb-center.float-ui', '#vdock', '#panel', '#treatCard:not([hidden])', '#dock', '#zoomPill', '.action-card:not([hidden])', '.coach:not(:empty)', '.lz.on .lz-side', '.lz.on .lz-key', '.lz.on .lz-top'];
        const vis = (el) => { const st = getComputedStyle(el), r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && +st.opacity > 0.05 && r.width > 2 && r.height > 2; };
        // On a phone the chart, Treat and a vessel's card are sheets that rise over the dock by design.
        const sheet = (el) => el.classList.contains('docked') || (matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px)').matches && (el.id === 'panel' || el.id === 'treatCard'));
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
      if (bad.length) throw new Error(`${w}×${hgt} ${q}${act ? ' + ' + act : ''}: ${bad.join('; ')}`);
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
    await page.click('#tabInstruments');
    await page.waitForSelector('#dockBody .dock-pane.active');
    await page.waitForTimeout(400);
    // The card slides in: measure where it settles, not where it is on the way.
    const settled = () => page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.id === 'dock'), null, { timeout: 5000 });
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
    await page.click('.workspace-divider');
    await page.keyboard.press('ArrowUp');
    // Compare lives on the play bar now: pin a moment, then the full-screen toggle goes there and back.
    await page.click('.tl-pin');
    await page.waitForFunction(() => !!window.pps.store.get().compareSnap);
    await page.click('.workspace-expand');
    await page.click('.workspace-expand');
    await page.waitForSelector('.workspace-comparison:not([hidden])');
    // One tap on a tab chooses an instrument; each tab carries its live reading.
    if (await page.locator('.instr-tab').count() !== 8) throw new Error('the tabs must offer eight distinct instruments');
    const choose = async (id) => {
      await page.click(`.instr-tab[data-instrument="${id}"]`);
      await page.waitForFunction((id) => document.querySelector(`.instr-tab[data-instrument="${id}"]`).getAttribute('aria-selected') === 'true', id);
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
    // Play and pause stay on the play bar while the instrument has the whole screen.
    await page.click('#timeline .play');
    await page.waitForFunction(() => !window.pps.store.get().running);
    await page.waitForTimeout(250);
    await settled();
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
      // As on a tablet: the relayout follows the resize event, so wait for it (up to 10 s).
      await page.waitForFunction(() => {
        const dock = document.querySelector('#dock').getBoundingClientRect(), stage = document.querySelector('#stageView').getBoundingClientRect();
        return dock.right <= innerWidth + 1 && stage.height >= 20;
      }, null, { timeout: 10000 }).catch(() => { throw new Error('rotation makes workspace unusable'); });
      await page.click('.workspace-expand');
      await shot(page, 'phone-workspace-landscape');
      await page.click('.workspace-expand');
      await page.setViewportSize({ width: 390, height: 844 });
    } else {
      // The patient chart starts closed, so the workspace has the full width for two instruments.
      if (await page.evaluate(() => document.querySelector('#app').classList.contains('panel-open'))) throw new Error('the patient chart should start closed');
      await page.click('.dock-second');
      await page.click('.instr-tab[data-instrument="doppler"]');
      await page.waitForSelector('#dockBody.split');
      await shot(page, 'desktop-workspace-two-instruments');
      await page.setViewportSize({ width: 768, height: 1024 });
      // The dock relayouts on the resize event, which a busy machine may deliver late: wait for it.
      await page.waitForFunction(() => !document.querySelector('#dockBody').classList.contains('split'), null, { timeout: 10000 }).catch(() => { throw new Error('two cramped columns remain on tablet'); });
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
if (process.env.SMOKE_MATCH) { const match = new RegExp(process.env.SMOKE_MATCH, 'i'); for (let i = queue.length - 1; i >= 0; i--) if (!match.test(queue[i][1])) queue.splice(i, 1); }
const [shard, shards] = (process.env.SMOKE_SHARD || '1/1').split('/').map(Number);
for (let i = queue.length - 1; i >= 0; i--) if (i % shards !== shard - 1) queue.splice(i, 1);
const WORKERS = Number(process.env.SMOKE_WORKERS) || 4;
await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) await runCheck(...queue.shift()); }));

await browser.close();
server.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('All smoke checks passed.');
