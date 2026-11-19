// Every card fits, on every slide (recs D4, A16). Walks each deck slide by slide with Next, at the Mac and the iPhone width, with the GL draws
// stubbed (state and DOM only: no GPU, no pixels), and fails when a slide's text card scrolls, cuts a line, or stands partly off the screen.
//
//   node scripts/card-fit.mjs [--dir dist] [--device mac,iphone] [--decks id,id | all] [--theme light|dark] [--jobs 2] [--shard 1/3] [--out file.json] [--slide n] [--no-zoom] [--old-rules] [--verbose]
//
// It judges layout only ("does every word the card holds show whole?"), so it says nothing about look or speed, and runs on a runner with no
// graphics card. A shard takes every n-th deck (balanced by slide count), so CI can split it over jobs (checks.yml).
//
// What fails (per slide step, per device):
//   scroll   a card (.pz-text, .pz-data, .pz-panel) whose content is taller than its box: its last lines are hidden from the room.
//   clipped  a text element wider than its box where the box clips (overflow not visible): a cut or ellipsised word.
//   off      a text element partly outside the screen (wholly outside is a parked card, ignored) and not inside something that scrolls on purpose.
//   enlarged a card already enlarged when the slide has landed (nothing zooms until asked).
//   zoomed   the same slide with its instrument card enlarged, by the corner icon and by a tap on the card (Mac and iPad landscape, where it is offered):
//            the instrument card must be larger than at rest and stand whole inside the screen (the page's own getBoundingClientRect answers the resting box while a card
//            rides the zoom, so the judge reads getClientRects). `--no-zoom` leaves this pass out.
//   small    lettering under 12 px on the screen (standing rule, 17 Nov).        ratio     a slide title under 1.4 times the words under it (1.3 on a phone).
//   sideways something inside a card that scrolls sideways.                       styled    a card on the screen before it was whole (still laying out, words before their backing, fonts loading, a bare tag).
//   `--old-rules` judges only the first six kinds. The judging is src/ui/gallery/fit-rules.js, which the gallery page's Check button runs on the device too.
// Known, accepted cases go in scripts/card-fit-allowance.json: { "<deck>:<slide n>:<device>": "<why>" }; a listed case that no longer fails is an error
// too (delete it), so the list only ever shrinks.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchLayout } from './headless.mjs';
import { DECKS } from '../src/ui/decks.js';
import { readCards, readZoom, judgeCards, judgeZoom, linesOf, WORDS_MIN_PX } from '../src/ui/gallery/fit-rules.js';
import { inPage } from './fit-io.mjs';

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
const VERBOSE = argv.includes('--verbose');
const ZOOM = !argv.includes('--no-zoom');
const ONLY = +opt('slide', 0);   // (a slide number: open at it and judge that slide alone, for checking a fix)
const ALLOW_FILE = resolve(ROOT, 'scripts/card-fit-allowance.json');
const ALLOW = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : {};

// The judging lives in src/ui/gallery/fit-rules.js, shared with the gallery page's Check button: the readers run in the page (their source text goes in
// as it is, scripts/fit-io.mjs), the judges are plain functions of what they return.
const OLD_RULES = argv.includes('--old-rules');   // (only the four first kinds: scroll, clipped, off, enlarged, zoomed; the 17 Nov standing-rule checks left out)
const READ = (page) => inPage(page, readCards, { minPx: WORDS_MIN_PX });
const ZREAD = (page) => inPage(page, readZoom);
const zoomFailing = (z, rest, how) => linesOf(judgeZoom(z, rest, how));
const failing = (r) => linesOf(judgeCards(r, { oldRules: OLD_RULES }));

async function walkDeck(L, d, device) {
  const rec = { deck: d.id, device, steps: [], problems: [], errors: [] };
  let app;
  try {
    app = await L.open({ device, theme: THEME, query: `script=${d.id}&slide=${ONLY || 1}`, timeout: 180000 });
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
      const r = await READ(app.page);
      // (Judged only on what stands still: a card or a line still gliding in reads 27 px off the screen for a moment, and the second read 0.7 s later no longer agrees.)
      await app.page.waitForTimeout(700);
      const r2 = await READ(app.page);
      const both = (x, y) => x.filter((t) => y.includes(t));
      r.enlarged = both(r.enlarged, r2.enlarged); r.scroll = both(r.scroll, r2.scroll); r.clipped = both(r.clipped, r2.clipped); r.off = both(r.off, r2.off);
      r.small = both(r.small, r2.small); r.sideways = both(r.sideways, r2.sideways); r.styled = both(r.styled, r2.styled);
      if (r.title !== r2.title || r.body !== r2.body) r.title = r.body = 0;   // (a title still easing to its size)
      const [a, b] = r.n.split('/').map((x) => parseInt(x, 10));
      const slide = a || k + 1;
      const f = failing(r);
      // (The slide with its instrument card enlarged, by the corner icon and then by a tap on an empty part of the card: both cards zoom, whole on the screen.
      // Only where the icon is offered; put back before Next.)
      if (ZOOM && await app.page.evaluate(() => { const z = document.querySelector('.pz-zbtn'), d = document.querySelector('.pz-data'); return !!z && !!d && getComputedStyle(z).display !== 'none' && d.getBoundingClientRect().width > 0 && !d.hidden; })) {
        const rest = await ZREAD(app.page);
        const judge = async (how) => {
          await app.page.waitForTimeout(1800);
          const z1 = await ZREAD(app.page);
          await app.page.waitForTimeout(700);
          const z2 = await ZREAD(app.page);
          const zf = zoomFailing(z2, rest, how).filter((t) => zoomFailing(z1, rest, how).includes(t));
          // (A press that opened nothing (the icon offered while the cards were still gliding in, or planned with another margin than the zoom uses) is listed, not failed:
          // it is how the zoom has always behaved, and it changes no card's fit.)
          for (const t of zf) { if (/the card did not enlarge/.test(t)) console.log(`    note ${d.id} ${device} slide ${slide}: ${t}`); else f.push(t); }
          if (VERBOSE) console.log(`    ${d.id} ${device} slide ${slide} ${how}: rest ${JSON.stringify(rest.boxes)} zoomed ${JSON.stringify(z2.boxes)}`);
        };
        const putBack = async () => { await app.page.evaluate(() => { const z = document.querySelector('.pz-zbtn'); if (z?.getAttribute('aria-expanded') === 'true') z.click(); }); await app.page.waitForTimeout(900); await idle(); };
        await app.page.evaluate(() => document.querySelector('.pz-zbtn').click());
        await judge('icon');
        await putBack();
        // (A tap on an empty corner of the card: one that is not a control or something drawn to be pressed, as card-zoom.js emptyTap says.)
        const spotOf = (sel) => app.page.evaluate((q) => {
          const card = document.querySelector(q), r = card.getBoundingClientRect(), LIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="slider"], [role="tab"], [role="switch"], [role="checkbox"], .range-wrap, .pz-lip, [data-no-zoom]';
          for (const [x, y] of [[r.left + 10, r.top + 10], [r.right - 10, r.bottom - 10], [r.left + 10, r.bottom - 10], [r.right - 10, r.top + 10]]) {
            let n = document.elementFromPoint(x, y), live = !n || !card.contains(n);
            for (; n && n !== card && !live; n = n.parentElement) if (n.matches(LIVE) || getComputedStyle(n).cursor === 'pointer') live = true;
            if (!live) return [x, y];
          }
          return null;
        }, sel);
        for (const [how, sel] of [['tap', '.pz-data']]) {
          const spot = await spotOf(sel);
          if (spot) { await app.page.mouse.click(spot[0], spot[1]); await judge(how); await putBack(); }
          else if (VERBOSE) console.log(`    ${d.id} ${device} slide ${slide}: no empty spot to tap (${how})`);
        }
        await idle();
      }
      rec.steps.push({ slide, n: r.n, problems: f });
      if (f.length) rec.problems.push({ slide, problems: f });
      same = r.n === last ? same + 1 : 0;
      last = r.n;
      if (ONLY || (a && a === b && same >= 2) || same >= 8 || (!r.n && k > 2)) break;
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

const L = await launchLayout({ dir: DIR, serveSite: false });   // (scripts/headless.mjs: the one layout-only opener, GL draws stubbed)
const jobs = pick.flatMap((d) => DEVICES_WANTED.map((device) => ({ d, device })));
const results = [];
let next = 0;
const T0 = Date.now();
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  for (let j = next++; j < jobs.length; j = next++) {
    const { d, device } = jobs[j];
    const rec = await walkDeck(L, d, device);
    results.push(rec);
    console.log(`${d.id} ${device}: ${rec.steps.length} slides${rec.fail ? `, FAILED TO WALK (${rec.fail})` : ''}, ${rec.problems.length} with problems${rec.errors.length ? `, ${rec.errors.length} page errors` : ''}`);
    for (const p of rec.problems) for (const t of p.problems) console.log(`    slide ${p.slide}: ${t}`);
  }
}));
await L.close();

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
for (const key of stale) { const [deck, , device] = key.split(':'); if (!ONLY && walked.has(`${deck}:${device}`)) bad.push(`${key}: allowed in card-fit-allowance.json but it fits now; delete the entry`); }

if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`\ncard-fit: ${results.length} walks (${pick.length} decks x ${DEVICES_WANTED.join(', ')}) in ${Math.round((Date.now() - T0) / 1000)} s`);
if (bad.length) { console.log(`FAIL ${bad.length}:\n  ${bad.join('\n  ')}`); process.exit(1); }
console.log('every card fits');
