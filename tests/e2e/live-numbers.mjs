// Live numbers keep their box and are never blank (2 Nov 2026: "the HVPG and PPG numbers disappear now and then and change size as
// they change number", in the bottom bar and "a lot of places"). In a real browser, frame by frame, on the bar's HVPG and PPG:
//   - a number drawn by the GPU words or by the page is always there: no frame where the page's own words are made clear (glw-on)
//     with no picture in the page to show instead, and none with no words at all;
//   - the readout's box (and the width of its words) is the same whatever its digits are: 0.0 to 9.9 in every digit's place;
//   - the numbers a model running writes (the bar follows it) and the steps a paused one takes (countTo, not eased) are both walked.
//
//   node tests/e2e/live-numbers.mjs                 (Mac and phone profiles, the repository's source)
//   DEVS=phone DIR=dist node tests/e2e/live-numbers.mjs
// Run through scripts/shoot.mjs, which asks for the real GPU path on a machine without a GPU (software WebGL named as a GPU): slow, a
// few frames a second, which only makes a blank frame easier to catch.
import { openApp } from '../../scripts/shoot.mjs';

const DEVS = (process.env.DEVS || 'phone,mac').split(',');
const DIR = process.env.DIR || '.';
const fails = [];
const fail = (m) => { fails.push(m); console.log(`FAIL ${m}`); };

// In the page: every frame, what each readout shows.
function sampler(ids) {
  window.__ln = [];
  const rows = ids.map((id) => document.querySelector(`.metric[data-id="${id}"]`)).filter(Boolean);
  const range = document.createRange();
  const f = () => {
    for (const m of rows) {
      const val = m.querySelector('.val'), v = m.querySelector('.v');
      const on = val.classList.contains('glw-on');
      const gpu = val.querySelector(':scope > canvas.trace-gl');
      const cs = getComputedStyle(val);
      const txt = [...val.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('') || val.textContent;
      range.selectNodeContents(val);
      const words = [...val.childNodes].find((n) => n.nodeType === 3);
      let ww = 0;
      if (words) { range.selectNode(words); ww = range.getBoundingClientRect().width; }
      const alpha = /rgba\(.*,\s*0\)$/.test(cs.color) || cs.color === 'transparent' ? 0 : 1;
      // Something is on screen: the page's own words (not clear, not empty), or the picture's canvas, in the page.
      const shown = on ? !!(gpu && gpu.isConnected) : (alpha > 0 && txt.trim().length > 0 && +cs.opacity > 0);
      window.__ln.push({ id: m.dataset.id, t: Math.round(performance.now()), txt: txt.trim(), on, shown, vw: +v.getBoundingClientRect().width.toFixed(2), valw: +val.getBoundingClientRect().width.toFixed(2), ww: +ww.toFixed(2), op: +cs.opacity });
    }
    window.__lnRaf = requestAnimationFrame(f);
  };
  f();
}

for (const dev of DEVS) {
  const app = await openApp({ device: dev === 'phone' ? 'iphone' : 'mac', theme: 'dark', query: '', dir: DIR });
  const page = app.page;
  try {
    await page.waitForTimeout(6000);
    await page.evaluate(sampler, ['hvpg', 'ppg']);

    // 1. The model running: the bar follows it.
    await page.evaluate(() => window.pps.store.set({ running: true }));
    await page.waitForTimeout(20000);
    const running = await page.evaluate(() => window.__ln.splice(0));

    // 2. The model stopped, the bar's numbers stepped by hand through every digit (countTo, not eased: what a treatment or a paused edit does).
    await page.evaluate(() => window.pps.store.set({ running: false }));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__ln.splice(0));
    const stepped = await page.evaluate(async () => {
      const U = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/ui\/util\.js/.test(n)));   // (the module the app loaded: one instance)
      const vals = ['hvpg', 'ppg'].map((id) => document.querySelector(`.metric[data-id="${id}"] .val`));
      const seq = [0.0, 8.8, 1.1, 4.2, 6.9, 2.4, 7.7, 3.3, 9.6, 0.5, 5.1, 2.4];
      // (The page's own writes of the model's numbers are stopped for the walk: it is the only writer.)
      for (const v of seq) {
        for (const el of vals) U.countTo(el, v, 1, { eased: false });
        await new Promise((r) => setTimeout(r, 650));
      }
      for (const v of seq) {
        for (const el of vals) U.countTo(el, v, 1, { eased: true });
        await new Promise((r) => setTimeout(r, 140));
      }
      await new Promise((r) => setTimeout(r, 1200));
      return window.__ln.splice(0);
    });

    for (const [name, rows] of [['model running', running], ['stepped by hand', stepped]]) {
      console.log(`${dev}, ${name}: ${rows.length} frames`);
      if (rows.length < 20) { fail(`${dev}, ${name}: only ${rows.length} frames were sampled`); continue; }
      for (const id of ['hvpg', 'ppg']) {
        const r = rows.filter((x) => x.id === id);
        const blank = r.filter((x) => !x.shown);
        if (blank.length) fail(`${dev}, ${name}, ${id}: ${blank.length} of ${r.length} frames show no number (first at ${blank[0].t} ms: ${JSON.stringify(blank[0])})`);
        // (One decimal and one digit before the point throughout: the box and its words are one width.)
        const one = r.filter((x) => /^\d\.\d$/.test(x.txt));
        const spread = (k) => (one.length ? Math.max(...one.map((x) => x[k])) - Math.min(...one.map((x) => x[k])) : 0);
        for (const k of ['vw', 'valw']) if (spread(k) > 0.5) fail(`${dev}, ${name}, ${id}: the readout's ${k} changed by ${spread(k).toFixed(2)} px across ${new Set(one.map((x) => x.txt)).size} numbers`);
        if (spread('ww') > 0.5) fail(`${dev}, ${name}, ${id}: the page's words changed width by ${spread('ww').toFixed(2)} px across the digits`);
        console.log(`  ${id}: ${r.length} frames, ${new Set(r.map((x) => x.txt)).size} different numbers, ${blank.length} blank, box ${one.length ? Math.min(...one.map((x) => x.vw)) : '-'} to ${one.length ? Math.max(...one.map((x) => x.vw)) : '-'} px`);
      }
    }
  } finally { await app.close(); }
}
if (fails.length) { console.log(`\n${fails.length} failure(s)`); process.exit(1); }
console.log('live numbers steady');
