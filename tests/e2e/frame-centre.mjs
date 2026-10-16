// Presenter framing check: on every slide of every deck that frames a box of the figure, the box sits centred in
// the free area (right of the words' panel, clear of the data card and the controls) and no card covers it.
//
//   DECKS=doppler DEVS=desktop,ipad node tests/e2e/frame-centre.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { fastContext, gotoSlide, quiet } from './fast.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
const only = process.env.DECKS ? process.env.DECKS.split(',') : null;
const decks = DECKS.map((d) => d.id).filter((id) => !only || only.includes(id));
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mac: { viewport: { width: 1280, height: 800 } },
  hd: { viewport: { width: 1920, height: 1080 } },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipadL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const devs = (process.env.DEVS || 'desktop,mac,hd,ipad,ipadL').split(',');
const TOL = +(process.env.TOL || 0.12);   // centre offset allowed, as a share of the free area's size
const server = await serve(ROOT);
let fails = 0;
const browser = await chromium.launch();
const spy = () => { if (window.__spied) return; window.__spied = true; const st = window.pps.stage, f = st.frameBox; st.frameBox = (box, ...a) => { window.__box = box; window.__camT = performance.now(); return f.apply(st, [box, ...a]); }; st.fitSlow = ((g) => (...a) => { window.__box = null; window.__camT = performance.now(); return g.apply(st, a); })(st.fitSlow); };
for (const dev of devs) {
  // (one page per size; each slide reached directly, its motion instant: tests/e2e/fast.mjs)
  const ctx = await fastContext(browser, SIZES[dev]);
  const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  for (const deck of decks) {
    const n = withOverview(DECKS.find((d) => d.id === deck)).slides.length;
    for (let i = 1; i <= n; i++) {
      await gotoSlide(page, server.url, deck, i - 1);
      // (as with a fresh load per deck: the camera is watched from the first slide's arrival on)
      if (i === 1) await page.evaluate(() => { window.__box = undefined; });
      await page.evaluate(spy);
      await quiet(page);
      // (the camera's glide has landed: none running, and none asked for in the last 0.6 s; reduced motion keeps glides short)
      await page.waitForFunction(() => !document.querySelector('.cam-move') && performance.now() - (window.__camT || 0) > 600, null, { timeout: 20000, polling: 100 }).catch(() => {});
      const measure = () => page.evaluate(() => {
        const box = window.__box;
        if (!box || window.pps.store.get().lobule || window.pps.store.get().view !== 'anatomic') return null;
        const m = document.getElementById('world').getScreenCTM();
        const xs = [box[0], box[2]].flatMap((x) => [box[1], box[3]].map((y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]));
        const b = { l: Math.min(...xs.map((p) => p[0])), r: Math.max(...xs.map((p) => p[0])), t: Math.min(...xs.map((p) => p[1])), b: Math.max(...xs.map((p) => p[1])) };
        const f = window.pps.stage.lastFree();
        if (!f || String(f.box) !== String(box) || window.pps.stage.cathOn?.()) return null;   // (framed by something else: a catheter, the lobule)
        const wr = document.querySelector('.pz').getBoundingClientRect(); f.l += wr.left; f.r += wr.left; f.t += wr.top; f.b += wr.top;
        const vis = (s) => { const el = document.querySelector(s); if (!el || el.hidden || el.classList.contains('pz-hide')) return null; const q = el.getBoundingClientRect(); return q.width ? q : null; };
        const cover = [], fits = b.r - b.l <= f.r - f.l + 2 && b.b - b.t <= f.b - f.t + 2;
        for (const s of fits ? ['.pz-text', '.pz-data', '.pz-bar'] : []) { const q = vis(s); if (!q) continue; const ow = Math.min(q.right, b.r) - Math.max(q.left, b.l), oh = Math.min(q.bottom, b.b) - Math.max(q.top, b.t); if (ow > 4 && oh > 4 && ow * oh > 0.04 * (b.r - b.l) * (b.b - b.t)) cover.push(s); }
        const dx = ((b.l + b.r) / 2 - (f.l + f.r) / 2) / (f.r - f.l), dy = ((b.t + b.b) / 2 - (f.t + f.b) / 2) / (f.b - f.t);
        // (a box larger than the free area even at the camera's widest zoom spills past it, centred: only its centre is judged)
        return { dx: +dx.toFixed(3), dy: +dy.toFixed(3), cover, b: [b.l, b.t, b.r, b.b].map(Math.round), f: [f.l, f.t, f.r, f.b].map(Math.round) };
      });
      let res = await measure();
      const off = (r) => r && (r.err || Math.abs(r.dx) > TOL || Math.abs(r.dy) > TOL || r.cover.length);
      if (off(res)) { await page.waitForTimeout(2500); res = await measure(); }   // (a slow machine: the glide may still be landing)
      await page.evaluate(() => { window.__box = undefined; });
      const title = await page.evaluate(() => document.querySelector('.pz-text h1, .pz-panel h1')?.textContent.trim().slice(0, 40));
      if (res) {
        const bad = off(res);
        if (bad) fails++;
        if (bad || process.env.VERBOSE) console.log(`${bad ? 'FAIL' : 'ok  '} ${dev} ${deck} ${i}/${n} "${title}" ${JSON.stringify(res)}`);
      }
    }
  }
  await ctx.close();
}
await browser.close();
server.close?.();
console.log(fails ? `${fails} slide(s) off centre or covered` : 'all framed slides centred and clear');
process.exit(fails ? 1 : 0);
