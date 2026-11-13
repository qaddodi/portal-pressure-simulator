// Every card fits, on every slide (recs D4, A16). Walks each deck slide by slide with Next, at the Mac and the iPhone width, with the GL draws
// stubbed (state and DOM only: no GPU, no pixels), and fails when a slide's text card scrolls, cuts a line, or stands partly off the screen.
//
//   node scripts/card-fit.mjs [--dir dist] [--device mac,iphone] [--decks id,id | all] [--theme light|dark] [--jobs 2] [--shard 1/3] [--out file.json] [--slide n] [--no-zoom] [--verbose]
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
const VERBOSE = argv.includes('--verbose');
const ZOOM = !argv.includes('--no-zoom');
const ONLY = +opt('slide', 0);   // (a slide number: open at it and judge that slide alone, for checking a fix)
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const ALLOW_FILE = resolve(ROOT, 'scripts/card-fit-allowance.json');
const ALLOW = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : {};

// The GL draws do nothing: the page's state, layout and words are real, the picture is not.
const STUB = `(() => { for (const C of [window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {}; } })();`;

// Runs in the page: what does not fit right now.
const READ = () => {
  const vw = innerWidth, vh = innerHeight;
  // (Seen when it, and everything it sits in, would show: opacity does not inherit, so a card faded out or parked by its parent has to be found on the way up.)
  const vis = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || (n === el && cs.visibility === 'hidden') || +cs.opacity <= 0.05 || n.hidden) return false; }
    return getComputedStyle(el).visibility !== 'hidden';
  };
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
  // (A card whose real content runs past its box. Not scrollHeight: the GL words' and traces' overlay canvases stand 18 px past the box of a card whose
  // overflow is clipped, which made every such card look like it scrolled. The content is what is not a canvas.)
  const scroll = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => {
    const e = document.querySelector(q);
    if (!e || !vis(e)) return null;
    const box = e.getBoundingClientRect();
    let low = 0, who = '';
    for (const k of e.querySelectorAll('*')) {
      if (k.tagName === 'CANVAS' || k.closest('canvas')) continue;
      // (Inside a box of its own that clips, such as the ascites belly's fill, it is that box that cuts it, not the card.)
      let clippedInside = false;
      for (let n = k.parentElement; n && n !== e; n = n.parentElement) { const o = getComputedStyle(n); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') { clippedInside = true; break; } }
      if (clippedInside) continue;
      const r = k.getBoundingClientRect();
      if (!r.width || !r.height || !vis(k)) continue;
      if (r.bottom - box.bottom > low) { low = r.bottom - box.bottom; who = name(k); }
    }
    return low > 2 ? `${q} content runs ${Math.round(low)} px past its box (${who}; box ${Math.round(box.width)} x ${Math.round(box.height)} at y ${Math.round(box.top)}, screen ${vw} x ${vh}; teaching card ${(() => { const t = document.querySelector('.pz-text')?.getBoundingClientRect(); return t ? `y ${Math.round(t.top)}-${Math.round(t.bottom)}` : 'none'; })()})` : null;
  }).filter(Boolean);
  // (No card is enlarged until it is asked: a slide that lands with one up, or the zoomed state left over from the one before, is a finding.)
  const enlarged = [document.querySelector('#app')?.classList.contains('pz-zoomed') && 'the page is in its zoomed state', document.querySelector('.pz-data')?.dataset.zoomed !== undefined && 'the data card is zoomed', document.querySelector('.pz-zbtn')?.getAttribute('aria-expanded') === 'true' && 'the enlarge icon says it is up'].filter(Boolean).map((t) => `${t} on entry`);
  return { n: document.querySelector('.pzb-n')?.textContent || '', enlarged, clipped: clipped.slice(0, 12), off: off.slice(0, 12), scroll };
};

// Runs in the page with a card enlarged: where the two cards really are (getClientRects: the zoom pins getBoundingClientRect to the resting box).
const ZREAD = () => {
  const vw = innerWidth, vh = innerHeight, o = {};
  for (const q of ['.pz-text', '.pz-data']) {
    const e = document.querySelector(q), r = e?.getClientRects()[0];
    o[q] = r && r.width ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
  }
  return { vw, vh, boxes: o, up: document.querySelector('.pz-zbtn')?.getAttribute('aria-expanded') === 'true' };
};
const zoomFailing = (z, rest, how) => {
  if (!z.up) return [`zoomed (${how}): the card did not enlarge`];
  // (The camera zooms into the card: the instrument card is the focus and is what must stand whole and larger. The teaching card rides the same turn, where it stands.)
  const b = z.boxes['.pz-data'], r0 = rest.boxes['.pz-data'], out = [];
  if (!b) return [`zoomed (${how}): the enlarged card is not on the screen`];
  if (b[0] < -2 || b[1] < -2 || b[2] > z.vw + 2 || b[3] > z.vh + 2) out.push(`zoomed (${how}): enlarged card [${b}] runs off the ${z.vw} x ${z.vh} screen`);
  if (r0 && (b[2] - b[0]) < (r0[2] - r0[0]) * 1.02) out.push(`zoomed (${how}): the enlarged card did not grow (${r0[2] - r0[0]} px wide at rest, ${b[2] - b[0]} px zoomed)`);
  return out;
};

const failing = (r) => [...(r.enlarged || []).map((t) => `enlarged: ${t}`), ...r.scroll.map((t) => `scroll: ${t}`), ...r.clipped.map((t) => `clipped: ${t}`), ...r.off.map((t) => `off: ${t}`)];

async function walkDeck(browser, d, device) {
  const rec = { deck: d.id, device, steps: [], problems: [], errors: [] };
  let app;
  try {
    app = await openApp({ device, theme: THEME, query: `script=${d.id}&slide=${ONLY || 1}`, dir: DIR, initScript: STUB, browser });
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
      // (Judged only on what stands still: a card or a line still gliding in reads 27 px off the screen for a moment, and the second read 0.7 s later no longer agrees.)
      await app.page.waitForTimeout(700);
      const r2 = await app.page.evaluate(READ);
      const both = (x, y) => x.filter((t) => y.includes(t));
      r.enlarged = both(r.enlarged, r2.enlarged); r.scroll = both(r.scroll, r2.scroll); r.clipped = both(r.clipped, r2.clipped); r.off = both(r.off, r2.off);
      const [a, b] = r.n.split('/').map((x) => parseInt(x, 10));
      const slide = a || k + 1;
      const f = failing(r);
      // (The slide with its instrument card enlarged, by the corner icon and then by a tap on an empty part of the card: both cards zoom, whole on the screen.
      // Only where the icon is offered; put back before Next.)
      if (ZOOM && await app.page.evaluate(() => { const z = document.querySelector('.pz-zbtn'), d = document.querySelector('.pz-data'); return !!z && !!d && getComputedStyle(z).display !== 'none' && d.getBoundingClientRect().width > 0 && !d.hidden; })) {
        const rest = await app.page.evaluate(ZREAD);
        const judge = async (how) => {
          await app.page.waitForTimeout(1800);
          const z1 = await app.page.evaluate(ZREAD);
          await app.page.waitForTimeout(700);
          const z2 = await app.page.evaluate(ZREAD);
          const zf = zoomFailing(z2, rest, how).filter((t) => zoomFailing(z1, rest, how).includes(t));
          f.push(...zf);
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
for (const key of stale) { const [deck, , device] = key.split(':'); if (!ONLY && walked.has(`${deck}:${device}`)) bad.push(`${key}: allowed in card-fit-allowance.json but it fits now; delete the entry`); }

if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`\ncard-fit: ${results.length} walks (${pick.length} decks x ${DEVICES_WANTED.join(', ')}) in ${Math.round((Date.now() - T0) / 1000)} s`);
if (bad.length) { console.log(`FAIL ${bad.length}:\n  ${bad.join('\n  ')}`); process.exit(1); }
console.log('every card fits');
