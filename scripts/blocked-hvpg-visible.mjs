// A local browser check (never in CI, like the other probes): on Budd–Chiari every place the HVPG is shown says "Not measurable" where a person can SEE it,
// not only in the DOM (16 Nov 2026: the words were in the tile but its status span had no width, and the number read "? mmHg").
// For each place: the words' own box has width and height, its text is not drawn at font-size 0 or hidden, and no "?" stands for the number.
// node scripts/blocked-hvpg-visible.mjs [--device mac|ipad|iphone] [--dir dist]
import { openApp } from './shoot.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const device = arg('device', 'mac'), dir = arg('dir', '.');
const app = await openApp({ device, dir, query: 'preset=budd-chiari' });
let bad = 0;
try {
  await app.page.waitForTimeout(4000);
  const found = await app.page.evaluate(() => {
    const seen = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(cs.fontSize), vis: cs.visibility, op: +cs.opacity, disp: cs.display }; };
    const out = [];
    for (const t of document.querySelectorAll('.metric[data-id="hvpg"], [data-id="hvpg"].metric')) {
      const st = t.querySelector('.status'), val = t.querySelector('.val');
      if (!st) continue;
      const after = getComputedStyle(st, '::after');
      out.push({ where: t.closest('.vdock') ? 'dock tile' : 'readouts tile', tile: Math.round(t.getBoundingClientRect().width), text: st.textContent, cls: st.className, after: after.content, afterFs: parseFloat(after.fontSize), ...seen(st), num: val?.textContent, numSeen: val ? seen(val) : null });
    }
    for (const dd of document.querySelectorAll('.hvpg-kv dd')) out.push({ where: 'HVPG tab ' + dd.previousSibling?.textContent, tile: Math.round(dd.parentElement.getBoundingClientRect().width), text: dd.textContent, cls: dd.className, ...seen(dd) });
    return out;
  });
  if (!found.length) { console.log('no HVPG places found'); bad++; }
  for (const f of found) {
    const drawn = f.text.length && f.fs > 0 && f.w > 0 && f.h > 0 && f.vis === 'visible' && f.op > 0 && f.disp !== 'none';
    const words = /^Not measurable/.test(f.text);
    const shownEl = f.tile > 0;   // (a tile in a pane that is not on show has no box at all: not a place a person sees)
    const ok = !shownEl || (drawn && words && f.num !== '?');
    console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(f));
    if (!ok) bad++;
  }
} finally { await app.close(); }
process.exit(bad ? 1 : 0);
