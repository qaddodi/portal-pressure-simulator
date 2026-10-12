// Frame-exact smoothness of the zooms into and out of the lobule and the sinusoid view: the page's clock is stepped (16 ms of page
// time per frame, however long a software renderer takes to draw it) and the camera's magnification is read at the end of every
// frame (frame.js __frameProbe). Prints, for each zoom, the largest change of speed from one frame to the next (as a share of its top
// speed; the ease's own is about 5%) and any frame where it stops. A joint between the anatomy, the field of lobules, the lobule and
// the sinusoid that runs at its own rate, or a hand-off that starts a frame late, shows here as a jump.
//
//   node scripts/zoom-even.mjs [dir] [--size=390x844] [--trace]

import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || '.';
const [width, height] = (args.find((a) => a.startsWith('--size=')) || '--size=390x844').slice(7).split('x').map(Number);
const ZOOMS = [   // [the move, the station aimed at first (as a presenter slide does)]
  ['lobule', null], ['lobule', 'triad'], ['sinusoid', null], ['sinusoid', 'sinusoid'], ['out', null],
];
const server = await serve(dir);
let bad = 0;
async function measure(move, part) {
  // (A browser of its own for each zoom: a software GPU stepped frame by frame can take the whole browser down.)
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 1200, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  try {
    await page.goto(server.url + '?preset=healthy');
    await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 60000 });
    if (move === 'out') {
      await page.evaluate(() => window.pps.stage.diveToSinusoid());
      await page.waitForFunction(() => window.pps.stage.sinusoidOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 60000 });
    }
    await page.waitForTimeout(3000);
    // (The clock is stepped only once the page runs: stepped from the start, the engine's worker would time out unseen.)
    await page.clock.install();
    const run = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.runFor(100); };
    await run(2000);
    await page.evaluate(() => { const s = window.__zoomTrace = []; globalThis.__frameProbe = (t) => { const z = window.pps.stage.cameraZoom(); if (z !== null) s.push([t, z]); }; });
    await page.evaluate(([m, p]) => { if (p) window.pps.stage.lobuleAim(p, { zoom: 2.3 }); if (m === 'lobule') window.pps.store.set({ lobule: true }); else if (m === 'sinusoid') window.pps.stage.diveToSinusoid(); else window.pps.stage.exitSinusoid(); }, [move, part]);
    await run(4000);
    return await page.evaluate(() => { globalThis.__frameProbe = null; return window.__zoomTrace; });
  } finally { await browser.close(); }
}
for (const [move, part] of ZOOMS) {
  const name = `${move === 'out' ? 'sinusoid view to the anatomy' : `anatomy to the ${move === 'lobule' ? 'lobule' : 'sinusoid view'}`}${part ? ` (aimed at ${part})` : ''}`;
  let s;
  for (let tries = 0; !s && tries < 2; tries++) s = await measure(move, part).catch((e) => { console.log(`  ${name}: ${e.message.split('\n')[0]}`); return null; });
  if (!s || s.length < 20) { console.log(`${name}: too few frames (${s?.length ?? 0})`); bad++; continue; }
  const z0 = s[0][1], zEnd = s.at(-1)[1], span = zEnd - z0, dir = Math.sign(span);
  const v = s.slice(1).map(([t, z], i) => [t, (z - s[i][1]) / (t - s[i][0]) * dir, t - s[i][0]]);
  const vMax = Math.max(...v.map((x) => x[1]));
  let worst = 0, at = 0, stop = null;
  for (let i = 1; i < v.length; i++) {
    const z = s[i + 1][1];
    if (Math.abs(z - z0) < 0.03 * Math.abs(span) || Math.abs(zEnd - z) < 0.03 * Math.abs(span)) continue;   // the ends, easing from and to rest
    if (v[i][1] < 0.1 * vMax && !stop) stop = `${Math.round(100 * (z - z0) / span)}% of the way`;
    const d = Math.abs(v[i][1] - v[i - 1][1]) / vMax / Math.max(1, (v[i][2] + v[i - 1][2]) / 32);
    if (d > worst) { worst = d; at = i; }
  }
  const ok = worst <= 0.09 && !stop;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name}: ${s.length} frames, zoom ${span.toFixed(2)} log units, largest speed change in a frame ${Math.round(100 * worst)}% of top speed at ${Math.round(100 * (s[at + 1][1] - z0) / span)}% of the way${stop ? `, stops at ${stop}` : ''}`);
  if (args.includes('--trace')) console.log('  ' + v.map(([t, x]) => `${Math.round(t - s[0][0])}:${(x / vMax).toFixed(2)}`).join(' '));
}
server.close();
process.exit(bad ? 1 : 0);
