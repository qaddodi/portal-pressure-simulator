// N8 probe: on a lapse slide and a drug slide, press R (Replay) and judge it: the figure's portal pressure falls back toward the slide before's
// state and then returns to the slide's settled one, the cards never move or fade, and the presenter ends idle on the same slide.
//   node scripts/replay-probe.mjs [--decks ascites:fill,next-bleed:nsbb] [--size desktop]
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { launch, openPage, stepUntil, stepFor, landed } from './gate-clock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const picks = arg('decks', 'ascites:fill,next-bleed:nsbb').split(',').map((x) => x.split(':'));
const size = arg('size', 'desktop');

const read = () => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(), c = getComputedStyle(e); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width), Math.round(b.height), +c.opacity]; };
  return { pv: window.pps.store.get().frame?.metrics?.pv, text: r('.pz-text'), data: r('.pz-data'), busy: window.pps.presenter.busy(), n: document.querySelector('.pzb-n')?.textContent, btn: !!document.querySelector('.pz-rp button') };
};

const { DECKS, withOverview } = await import(new URL('../src/ui/decks.js', import.meta.url));
const server = await serve(ROOT), browser = await launch(false);
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL', m); };
try {
  for (const [id, sid] of picks) {
    const deck = withOverview(DECKS.find((d) => d.id === id)), at = deck.slides.findIndex((s) => s.id === sid);
    if (at < 0) { fail(`${id}:${sid} not found`); continue; }
    const app = await openPage(browser, `${server.url}?script=${id}&slide=1`, { size });
    const { page } = app; 
    try {
      await stepUntil(page, () => document.querySelector('#app')?.classList.contains('presenting') && !window.pps?.presenter?.busy(), null, { maxFake: 60000 });
      await page.evaluate((k) => window.pps.presenter.go(k), at);
      if (await stepUntil(page, landed, at + 1, { maxFake: 60000 }) < 0) { fail(`${id}:${sid} never landed`); continue; }
      await stepFor(page, 12000);   // (its own days play out)
      const settled = await page.evaluate(read);
      if (!settled.btn) fail(`${id}:${sid}: no Replay button in the card`);
      console.log(id, sid, 'settled', JSON.stringify(settled));
      await page.keyboard.press('r');
      const frames = [];
      for (let t = 0; t < 20000; t += 100) { await stepFor(page, 100); frames.push(await page.evaluate(read)); }
      const pvs = frames.map((f) => f.pv).filter((x) => x != null), lo = Math.min(...pvs), hi = Math.max(...pvs);
      console.log(id, sid, 'pv range during replay', lo?.toFixed(2), hi?.toFixed(2), 'settled', settled.pv?.toFixed(2), 'end', frames.at(-1).pv?.toFixed(2));
      const moved = (a, b) => a && b && (Math.abs(a[0] - b[0]) > 0.5 || Math.abs(a[1] - b[1]) > 0.5 || Math.abs(a[4] - b[4]) > 0.02);
      for (const k of ['text', 'data']) if (frames.some((f) => moved(settled[k], f[k]))) fail(`${id}:${sid}: the ${k} card moved or faded during the replay`);
      if (Math.abs(frames.at(-1).pv - settled.pv) > 0.6) fail(`${id}:${sid}: replay ended at pv ${frames.at(-1).pv} not ${settled.pv}`);
      if (Math.abs(lo - settled.pv) < 0.3 && Math.abs(hi - settled.pv) < 0.3) fail(`${id}:${sid}: the figure never left its settled state, nothing replayed`);
      if (frames.at(-1).busy || frames.at(-1).n !== settled.n) fail(`${id}:${sid}: not idle on the same slide after`);
      for (const e of [...new Set(app.errors)].slice(0, 5)) fail(`${id}:${sid}: ${e}`);
    } finally { await app.close(); }
  }
} finally { await browser.close(); server.close(); }
console.log(bad ? `${bad} problem(s)` : 'replay probe: ok (headless, software GL off: SVG figure, reduced motion)');
process.exit(bad ? 1 : 0);
