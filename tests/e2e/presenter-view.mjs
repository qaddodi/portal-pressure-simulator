// N1 presenter view: two pages in one context. P opens the window; Next in either moves both; its notes match the deck; closing the window
// leaves the talk working, and a window opened after the talk began is told where it is. Headless, software GL.
//   DECKS=hvpg node tests/e2e/presenter-view.mjs
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { gotoSlide, fastContext } from './fast.mjs';
const ROOT = new URL('../..', import.meta.url).pathname;
const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
const id = (process.env.DECKS || 'hvpg').split(',')[0];
const slides = withOverview(DECKS.find((d) => d.id === id)).slides;
const plain = (t) => String(t ?? '').replace(/\[([^\]]+)\]\([\w:]+\)/g, '$1').replace(/\{([^}]+)\}/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const server = await serve(ROOT), browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await fastContext(browser, { viewport: { width: 1280, height: 800 } });
const main = await ctx.newPage(); main.setDefaultTimeout(60000);
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
await gotoSlide(main, server.url, id, 0);
const at = () => main.evaluate(() => window.pps.presenter.position()?.at ?? -1);
// (Position only: software GL keeps a slide's entry busy for minutes; a press is repeated until the talk is on the slide asked for.)
const settle = async (n, press) => { await main.bringToFront(); for (let i = 0; i < 60; i++) { if ((await at()) === n) return true; if (press && i % 5 === 4) await press(); await main.waitForTimeout(1000); } console.log('  at', await at()); return false; };
await settle(0);
const popup = ctx.waitForEvent('page');
await main.keyboard.press('p');
const win = await popup; win.setDefaultTimeout(30000);
win.on('console', (m) => console.log('win:', m.text().slice(0, 200))); win.on('pageerror', (e) => console.log('winerr:', String(e).slice(0, 300))); await win.waitForSelector('.pv-title', { timeout: 60000 }).catch(async () => { console.log((await win.content()).slice(-1500)); throw new Error('no title'); });
const text = (p, s) => p.locator(s).first().innerText();
const gl = await win.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length }));
ok(gl.canvases === 0, 'presenter window draws text only (no canvas, no app)');
ok(await text(win, '.pv-title') === plain(slides[0].title), 'window shows slide 1 title');
for (const n of [1, 2]) {
  const src = n === 1 ? win : main, press = () => src.keyboard.press('ArrowRight'); await press();
  ok(await settle(n, async () => { if ((await at()) === n - 1) await press(); }), `slide ${n + 1} reached (Next from the ${n === 1 ? 'window' : 'main page'})`);
  await win.waitForFunction((t) => document.querySelector('.pv-title')?.textContent === t, plain(slides[n].title));
  ok(true, `window follows to slide ${n + 1}`);
  const notes = await win.locator('.pv-notes').count() ? await text(win, '.pv-notes') : '';
  ok(notes === String(slides[n].notes ?? '').trim(), `notes match deck for slide ${n + 1}`);
  const next = await text(win, '.pv-next b').catch(() => '');
  ok(slides[n + 1] ? next === plain(slides[n + 1].title) : true, 'next title matches');
}
await win.keyboard.press('ArrowLeft'); ok(await settle(1), 'Back from the window moves the talk');
await win.click('text=Next →'); ok(await settle(2, async () => { if ((await at()) === 1) await win.click('text=Next →'); }), 'Next button moves the talk');
await win.keyboard.press('Home'); ok(await settle(0), 'Home from the window jumps to the first slide');
await win.close();
await main.keyboard.press('ArrowRight'); ok(await settle(1), 'closing the window leaves the talk working');
await main.waitForTimeout(1000); const popup2 = ctx.waitForEvent('page'); await main.keyboard.press('p'); const win2 = await popup2;
await win2.waitForFunction((t) => document.querySelector('.pv-title')?.textContent === t, plain(slides[1].title));
ok(true, 'a window opened mid-talk is told where it is');
await main.close();
await win2.keyboard.press('ArrowRight'); await win2.waitForTimeout(300);
ok(await win2.locator('.pv-title').count() === 1, 'closing the main page leaves the window up');
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
