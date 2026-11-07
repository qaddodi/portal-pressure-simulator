// The halo the GPU draws the lobule's captions with is the theme's own (--label-halo): in light and in dark, after load and after a switch of
// theme with the lobule open (R06-R17 caption half; "the numbers are double lined", 3 Nov 2026). Read from the caption snapshot (what the pen
// was given for the frame that landed), never from the page's own names.
//
//   node tests/e2e/caption-halo.mjs [dir]       exit 1 on a halo that is not the theme's token; exit 2 when no halo could be read
import { openApp } from '../../scripts/shoot.mjs';

const dir = process.argv[2] || '.';
let failed = 0, inconclusive = 0;
const parse = (c) => { const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)/.exec(c || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
const same = (a, b) => a && b && Math.abs(a[0] - b[0]) <= 3 && Math.abs(a[1] - b[1]) <= 3 && Math.abs(a[2] - b[2]) <= 3 && Math.abs(a[3] - b[3]) <= 0.03;

for (const start of ['light', 'dark']) {
  const app = await openApp({ device: 'mac', theme: start, query: '', dpr: 1, dir, timeout: 240000 });
  const { page } = app;
  try {
    await page.waitForFunction(() => !!window.pps?.store?.get().frame && !document.documentElement.dataset.boot, null, { timeout: 150000 });
    await page.evaluate(() => document.querySelector('#viewSeg [data-view=lobule]').click());
    await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 240000, polling: 1000 });
    const judge = async (when) => {
      await page.waitForFunction(() => (window.pps.stage.lobuleCaptions()?.items || []).filter((i) => i.a > 0.95).length >= 2, null, { timeout: 90000, polling: 500 }).catch(() => {});
      await page.waitForTimeout(2500);   // (the page reads its names again between frames after a switch, then the GPU draws them)
      const r = await page.evaluate(() => {
        const d = document.createElement('div'); d.style.color = getComputedStyle(document.documentElement).getPropertyValue('--label-halo'); document.body.append(d);
        const token = getComputedStyle(d).color; d.remove();
        return { token, halos: (window.pps.stage.lobuleCaptions()?.items || []).map((i) => [i.key, i.halo]), theme: document.documentElement.dataset.theme || '' };
      });
      const want = parse(r.token), got = r.halos.filter(([, h]) => h);
      if (!want || !got.length) { inconclusive++; console.log(`INCONCLUSIVE ${start}, ${when}: ${got.length} caption(s) with a halo, token ${r.token}`); return; }
      for (const [k, h] of got) { if (!same(parse(h), want)) { failed++; console.log(`FAIL ${start}, ${when}: ${k}'s halo is ${h}, the theme's is ${r.token}`); } }
      console.log(`${start}, ${when}: token ${r.token}, ${got.length} caption(s) match`);
    };
    await judge('after load');
    for (const t of start === 'light' ? ['dark', 'light'] : ['light', 'dark']) {
      await page.evaluate((x) => { document.documentElement.dataset.theme = x; }, t);
      await judge(`after a switch to ${t}`);
    }
  } finally { await app.close(); }
}
console.log(failed ? `${failed} FAILED` : inconclusive ? 'INCONCLUSIVE' : 'ok');
process.exit(failed ? 1 : inconclusive ? 2 : 0);
