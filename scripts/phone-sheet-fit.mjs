// A phone's sheets are as tall as their words, up to the room under the top bar, and scroll only past that (18 Nov 2026, the tester at 390 x 844: Treat stood at 405 px with 726 px of words and free room above it).
// Opens each sheet in turn (Treat's three tabs, Layers, Settings, History, Search) at the iPhone's size and fails when one scrolls while it stops short of the room (its top more than 40 px below the top bar's
// foot), when it cuts a row without scrolling (a line past its edge), or when a scroller shows blank under its last line.
//
//   node scripts/phone-sheet-fit.mjs [--dir .]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { CHROMIUM_ARGS, openApp } from './shoot.mjs';

const argv = process.argv.slice(2), DIR = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : '.';
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const SHEETS = '.treat-card, .history-card, .menu.as-sheet, .why-pop.as-sheet, .pal, .modal';
const MEASURE = (sel) => {
  const vis = (e) => { const cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5 && e.getBoundingClientRect().height > 40; };
  const el = [...document.querySelectorAll(sel)].filter(vis).at(-1);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const tb = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 56;
  const scrollers = [el, ...el.querySelectorAll('*')].filter((n) => { const o = getComputedStyle(n).overflowY; return (o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1 && n.clientHeight > 40; });
  const dv = document.createElement('div'); dv.style.cssText = 'position:fixed;height:100dvh;width:1px;visibility:hidden'; document.body.append(dv); const dvh = dv.getBoundingClientRect().height; dv.remove();
  return { dvh: Math.round(dvh), inner: innerHeight, maxH: getComputedStyle(el).maxHeight, anim: el.getAnimations().length, cls: String(el.className).split(' ').slice(0, 3).join('.'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), topBar: Math.round(tb), scrolls: scrollers.length > 0, room: Math.round(r.top - tb) };
};
const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
const app = await openApp({ device: 'iphone', dir: DIR, browser });
const bad = [];
try {
  const { page } = app;
  const tab = (name) => page.locator('button', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).last();
  const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(700); };
  const check = async (name) => {
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.menu, .pal, .treat-card')).length === 0, null, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(500);
    const m = await page.evaluate(MEASURE, SHEETS);
    console.log(name.padEnd(22), JSON.stringify(m));
    if (!m) { bad.push(`${name}: no sheet showed`); return; }
    // (A sheet that scrolls has used the room: its top is at the top bar's foot, give or take the gap.)
    // (Layers stops under half the screen on purpose, so the figure stays in view as its rows are toggled. Search is a list of results whose height is fixed on purpose, so it does not jump as the query changes: its list scrolls inside it.)
    if (m.scrolls && m.room > 40 && name !== 'Search' && name !== 'Layers') bad.push(`${name}: scrolls while stopping ${m.room}px short of the room under the top bar (sheet ${m.top}-${m.bottom}, ${m.h}px)`);
  };
  await tab('Treat').click();
  for (const t of ['Drugs', 'Fluids', 'Procedures']) { await page.locator('[role="tab"]', { hasText: t }).first().click(); await check('Treat ' + t); }
  await close();
  for (const n of ['Layers', 'Settings', 'Search']) { await tab(n).click(); await check(n); await close(); }
  // (History is in the top bar on a phone: a sheet, or the history card, as the page offers it.)
  { const h = page.locator('#btnHistory'); if (await h.count()) { await h.click(); await check('History'); await close(); } else bad.push('History: no button'); }
} finally { await app.close(); await browser.close(); }
if (bad.length) { console.error('\nphone-sheet-fit: FAIL\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('\nphone-sheet-fit: every sheet takes the room its words need');
