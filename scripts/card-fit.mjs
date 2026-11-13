// Every card fits, on every slide (recs D4, A16). Walks each deck slide by slide with Next, at the Mac and the iPhone width, with the GL draws
// stubbed (state and DOM only: no GPU, no pixels), and fails when a slide's text card scrolls, cuts a line, or stands partly off the screen.
//
//   node scripts/card-fit.mjs [--dir dist] [--device mac,iphone] [--decks id,id | all] [--theme light|dark] [--jobs 2] [--shard 1/3] [--out file.json]
//
// It judges layout only ("does every word the card holds show whole?"), so it says nothing about look or speed, and runs on a runner with no
// graphics card. A shard takes every n-th deck (balanced by slide count), so CI can split it over jobs (checks.yml).
//
// What fails (per slide step, per device):
//   scroll   a card (.pz-text, .pz-data, .pz-panel) whose content is taller than its box: its last lines are hidden from the room.
//   clipped  a text element wider than its box where the box clips (overflow not visible): a cut or ellipsised word.
//   off      a text element partly outside the screen (wholly outside is a parked card, ignored) and not inside something that scrolls on purpose.
// Known, accepted cases go in scripts/card-fit-allowance.json: { "<deck>:<slide n>:<device>": "<why>" }; a listed case that no longer fails is an error
// too (delete it), so the list only ever shrinks.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CHROMIUM_ARGS, openApp } from './shoot.mjs';
import { DECKS } from '../src/ui/decks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = opt('dir', '.');
const DEVICES_WANTED = opt('device', 'mac,iphone').split(',');
const WANT = opt('decks', 'all');
const THEME = opt('theme', 'light');
const JOBS = Math.max(1, +opt('jobs', 2));
const [SHARD_I, SHARD_N] = opt('shard', '1/1').split('/').map(Number);
const OUT = opt('out', '');
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const ALLOW_FILE = resolve(ROOT, 'scripts/card-fit-allowance.json');
const ALLOW = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : {};

// The GL draws do nothing: the page's state, layout and words are real, the picture is not.
const STUB = `(() => { for (const C of [window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {}; } })();`;

// Runs in the page: what does not fit right now.
const READ = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').slice(0, 3).join('.')}`;
  const clipped = [], off = [];
  const root = document.querySelector('.pz');
  if (root) for (const el of root.querySelectorAll('*')) {
    if (el.childElementCount || !el.textContent.trim() || el.classList.contains('sr-only') || !vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') clipped.push(`${name(el)} "${el.textContent.trim().slice(0, 40)}" sw${el.scrollWidth}>cw${el.clientWidth}`);
    // (Wholly outside the screen is a card parked away or a slide's leftover waiting off stage, not text cut by the edge: only text that is partly in view counts.)
    const inView = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
    if (inView && (r.right > vw + 2 || r.left < -2 || r.bottom > vh + 2 || r.top < -2)) {
      let p = el, sc = false;
      while (p && p !== root) { const o = getComputedStyle(p); if (/auto|scroll/.test(o.overflowY + o.overflowX)) { sc = true; break; } p = p.parentElement; }
      if (!sc) off.push(`${name(el)} "${el.textContent.trim().slice(0, 40)}" [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  const scroll = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => {
    const e = document.querySelector(q);
    if (!e || !vis(e)) return null;
    return e.scrollHeight > e.clientHeight + 2 ? `${q} scrollHeight ${e.scrollHeight} > clientHeight ${e.clientHeight}` : null;
  }).filter(Boolean);
  return { n: document.querySelector('.pzb-n')?.textContent || '', clipped: clipped.slice(0, 12), off: off.slice(0, 12), scroll };
};

const failing = (r) => [...r.scroll.map((t) => `scroll: ${t}`), ...r.clipped.map((t) => `clipped: ${t}`), ...r.off.map((t) => `off: ${t}`)];

async function walkDeck(browser, d, device) {
  const rec = { deck: d.id, device, steps: [], problems: [], errors: [] };
  let app;
  try {
    app = await openApp({ device, theme: THEME, query: `script=${d.id}&slide=1`, dir: DIR, initScript: STUB, browser });
    const idle = async (max = 30000) => {
      const t0 = Date.now();
      for (let ok = 0; Date.now() - t0 < max;) {
        const busy = await app.page.evaluate(() => { document.querySelector('.pz-case.on')?.click(); return !!window.pps?.presenter?.busy?.() || !document.querySelector('.pzb-n'); });
        ok = busy ? 0 : ok + 1;
        if (ok >= 3) return true;
        await app.page.waitForTimeout(300);
      }
      return false;
    };
    let last = '', same = 0;
    for (let k = 0; k < 160; k++) {
      await idle();
      await app.page.waitForTimeout(900);
      const r = await app.page.evaluate(READ);
      const [a, b] = r.n.split('/').map((x) => parseInt(x, 10));
      const slide = a || k + 1;
      const f = failing(r);
      rec.steps.push({ slide, n: r.n, problems: f });
      if (f.length) rec.problems.push({ slide, problems: f });
      same = r.n === last ? same + 1 : 0;
      last = r.n;
      if ((a && a === b && same >= 2) || same >= 8 || (!r.n && k > 2)) break;
      await app.page.keyboard.press('ArrowRight');
      await app.page.waitForTimeout(250);
    }
  } catch (e) { rec.fail = String(e.message).split('\n')[0].slice(0, 300); }
  finally { rec.errors = (app?.errors || []).slice(0, 5); await app?.close().catch(() => {}); }
  return rec;
}

// Decks, balanced by slide count over the shards (largest first, onto the lightest shard).
const pick = (() => {
  const all = DECKS.filter((d) => WANT === 'all' || WANT.split(',').includes(d.id));
  if (SHARD_N <= 1) return all;
  const load = Array(SHARD_N).fill(0), mine = [];
  for (const d of [...all].sort((a, b) => b.slides.length - a.slides.length || a.id.localeCompare(b.id))) {
    const k = load.indexOf(Math.min(...load));
    load[k] += d.slides.length;
    if (k === SHARD_I - 1) mine.push(d);
  }
  return mine;
})();

const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
const jobs = pick.flatMap((d) => DEVICES_WANTED.map((device) => ({ d, device })));
const results = [];
let next = 0;
const T0 = Date.now();
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  for (let j = next++; j < jobs.length; j = next++) {
    const { d, device } = jobs[j];
    const rec = await walkDeck(browser, d, device);
    results.push(rec);
    console.log(`${d.id} ${device}: ${rec.steps.length} slides${rec.fail ? `, FAILED TO WALK (${rec.fail})` : ''}, ${rec.problems.length} with problems${rec.errors.length ? `, ${rec.errors.length} page errors` : ''}`);
    for (const p of rec.problems) for (const t of p.problems) console.log(`    slide ${p.slide}: ${t}`);
  }
}));
await browser.close();

// Judge.
const bad = [], stale = new Set(Object.keys(ALLOW));
for (const rec of results) {
  if (rec.fail) bad.push(`${rec.deck} ${rec.device}: could not walk the deck: ${rec.fail}`);
  for (const e of rec.errors) bad.push(`${rec.deck} ${rec.device}: page error: ${e}`);
  for (const p of rec.problems) {
    const key = `${rec.deck}:${p.slide}:${rec.device}`;
    if (key in ALLOW) { stale.delete(key); continue; }
    for (const t of p.problems) bad.push(`${rec.deck} slide ${p.slide} (${rec.device}): ${t}`);
  }
}
// An allowance entry is stale only when its deck and device were walked here and the slide now passes.
const walked = new Set(results.filter((r) => !r.fail).map((r) => `${r.deck}:${r.device}`));
for (const key of stale) { const [deck, , device] = key.split(':'); if (walked.has(`${deck}:${device}`)) bad.push(`${key}: allowed in card-fit-allowance.json but it fits now; delete the entry`); }

if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`\ncard-fit: ${results.length} walks (${pick.length} decks x ${DEVICES_WANTED.join(', ')}) in ${Math.round((Date.now() - T0) / 1000)} s`);
if (bad.length) { console.log(`FAIL ${bad.length}:\n  ${bad.join('\n  ')}`); process.exit(1); }
console.log('every card fits');
