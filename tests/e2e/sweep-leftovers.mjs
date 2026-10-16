// The overnight screenshot sweep's leftovers (16 Oct), measured on screen:
//   1. the whole circuit keeps clear of the zoom pill (+, −, Fit) beside the Tests card (Mac, iPad on its side);
//   2. a scale bar's dot stays whole inside its track, even past the end of the scale (platelets of 380 on a sideways phone);
//   3. the quick check leaves no empty band under its last question (phones);
//   4. the patient's name in the top bar shows whole, never cut with "…" (every patient, sideways phones, iPad, Mac);
//   5. the menu's titles show whole (phones);
//   6. the summary table's "vs …" lines are 12 px or more (Mac).
//
//   node tests/e2e/sweep-leftovers.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const server = await serve(ROOT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(size, q) {
  const [w, h] = size;
  const phone = w < 600 || h < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: phone, isMobile: phone });
  const page = await ctx.newPage(); page.setDefaultTimeout(90000);
  await page.goto(server.url + q);
  await page.waitForFunction(() => window.pps?.store?.get().frame);
  await sleep(1500);
  return { page, close: () => ctx.close() };
}

// 1. Circuit and zoom pill.
for (const size of [[1280, 800], [1440, 900], [1180, 820]]) {
  const { page, close } = await open(size, '?preset=gastric-varix');
  await page.click('[data-view="circuit"]');
  await sleep(4000);
  await page.click('#tabInstruments');
  // (the camera has settled: the map's box holds still for a second)
  let last = '', same = 0;
  for (let i = 0; i < 60 && same < 3; i++) { await sleep(400); const b = await page.evaluate(() => JSON.stringify(document.querySelector('#net').getBoundingClientRect())); same = b === last ? same + 1 : 0; last = b; }
  const r = await page.evaluate(() => {
    const a = document.querySelector('#net').getBoundingClientRect(), p = document.querySelector('#zoomPill').getBoundingClientRect();
    return { hit: a.right > p.left - 8 && a.bottom > p.top - 8 && p.width > 0, a: [a.right, a.bottom].map(Math.round), p: [p.left, p.top].map(Math.round) };
  });
  if (r.hit) fail(`${size}: the circuit runs under the zoom pill (map right/bottom ${r.a}, pill left/top ${r.p})`);
  await close();
}

// 2. The platelets dot on a sideways phone (spleen deck, slide 8).
{
  const { page, close } = await open([844, 390], '?script=spleen&slide=8');
  await page.waitForSelector('.pzb-now:not([hidden])', { state: 'attached' });
  await sleep(3000);
  const out = await page.evaluate(() => [...document.querySelectorAll('.pzb-now:not([hidden])')].map((d) => {
    const t = d.closest('.pzb-track').getBoundingClientRect(), b = d.getBoundingClientRect();
    return b.width ? Math.max(t.left - b.left, b.right - t.right) : -1;
  }));
  if (!out.length) fail('spleen 8: no scale dot to measure');
  for (const o of out) if (o > 0.5) fail(`spleen 8: a scale dot runs ${o.toFixed(1)} px past the end of its track`);
  await close();
}

// 3. The quick check's card ends as close under its last question as it starts above its title.
for (const size of [[390, 844], [320, 568]]) {
  const { page, close } = await open(size, '?script=ascites&slide=12');
  await page.waitForSelector('.pz-check li');
  await sleep(2500);
  const r = await page.evaluate(() => {
    const card = document.querySelector('.pz-check').closest('section').getBoundingClientRect(), list = document.querySelector('.pz-check');
    const last = [...list.querySelectorAll('li')].pop().getBoundingClientRect();
    return { below: card.bottom - last.bottom, scrolls: list.scrollHeight > list.clientHeight + 1 };
  });
  if (r.below > 32) fail(`${size} quick check: ${Math.round(r.below)} px empty under the last question`);
  if (r.scrolls) fail(`${size} quick check: the list scrolls`);
  await close();
}

// 4. The patient's name, whole, for every patient.
const IDS = ['healthy', 'postprandial', 'pvt-acute', 'pvt-chronic', 'svt', 'schisto', 'cirr-comp', 'csph', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix', 'sos', 'budd-chiari', 'ivc-web', 'rhf', 'constrictive'];
for (const size of [[844, 390], [667, 375], [320, 568], [820, 1180], [1024, 768], [1280, 800]]) {
  const { page, close } = await open(size, '?preset=healthy');
  for (const id of IDS) {
    await page.evaluate((id) => window.pps.store.set({ presetId: id }), id);
    await sleep(600);
    const r = await page.evaluate(() => {
      const e = document.querySelector('#scenarioName'), cs = getComputedStyle(e);
      const shown = [...e.children].find((c) => getComputedStyle(c).display !== 'none');
      return { cut: e.scrollWidth > e.clientWidth + 0.5 || e.scrollHeight > e.clientHeight + 0.5, fs: parseFloat(cs.fontSize), ell: cs.textOverflow, t: shown?.textContent };
    });
    if (r.cut || r.ell === 'ellipsis') fail(`${size} ${id}: the name "${r.t}" is cut`);
    if (r.fs < 12) fail(`${size} ${id}: the name is ${r.fs} px`);
  }
  await close();
}

// 5. The menu's titles, whole, on phones.
for (const size of [[390, 844], [320, 568]]) {
  const { page, close } = await open(size, '?preset=healthy');
  await page.click('#btnMenu');
  await page.waitForSelector('.umenu .um-row');
  await sleep(1200);
  const cut = await page.evaluate(() => [...document.querySelectorAll('.umenu .um-t')].filter((t) => t.offsetParent && (t.scrollWidth > t.clientWidth + 0.5 || getComputedStyle(t).textOverflow === 'ellipsis')).map((t) => t.textContent));
  for (const t of cut) fail(`${size} menu: "${t}" is cut`);
  await close();
}

// 6. The summary table's "vs …" lines on a Mac (circuit deck, slide 10).
for (const size of [[1440, 900], [1280, 800]]) {
  const { page, close } = await open(size, '?script=circuit&slide=10');
  await page.waitForSelector('.pz-table .vs');
  await sleep(2500);
  const r = await page.evaluate(() => [...document.querySelectorAll('.pz-table .vs')].map((v) => ({ fs: parseFloat(getComputedStyle(v).fontSize), cut: v.scrollWidth > v.clientWidth + 0.5 })));
  if (!r.length) fail(`${size} circuit 10: no "vs" lines`);
  for (const v of r) { if (v.fs < 12) fail(`${size} circuit 10: a "vs" line is ${v.fs} px`); if (v.cut) fail(`${size} circuit 10: a "vs" line is cut`); }
  const scroll = await page.evaluate(() => { const t = document.querySelector('.pz-table'); return t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1; });
  if (scroll) fail(`${size} circuit 10: the table scrolls`);
  await close();
}

await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'sweep leftovers: all passed');
process.exit(fails ? 1 : 0);
