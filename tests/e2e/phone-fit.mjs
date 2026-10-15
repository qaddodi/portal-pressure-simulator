// Phone slide fit, on every slide of one deck at three phone widths upright and sideways: the slide's words stay clear
// of the controls pill (back, count, next): no drawn word under it, and every reading in the numbers card (tiles, and an instrument such as the
// Doppler, opened if it is folded) sits inside the card. Content the card hides (a folded instrument) is not judged.
import { fastContext, gotoSlide, quiet } from './fast.mjs';
export const PHONES = [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
export const fitIssues = () => {
  const vis = (el) => { if (!el || el.hidden) return null; const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.5) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  // Hidden by the card itself: under a see-through ancestor, or wholly outside an ancestor that clips.
  const hidden = (c, card) => { const q = c.getBoundingClientRect(); for (let a = c.parentElement; a && a !== card; a = a.parentElement) { const cs = getComputedStyle(a); if (+cs.opacity < 0.05) return true; if (/(hidden|clip|auto|scroll)/.test(cs.overflowX + cs.overflowY)) { const r = a.getBoundingClientRect(); if (q.top >= r.bottom - 1 || q.bottom <= r.top + 1 || q.left >= r.right - 1 || q.right <= r.left + 1) return true; } } return false; };
  const out = [], text = vis(document.querySelector('.pz-text')), bar = vis(document.querySelector('.pz-bar')), data = document.querySelector('.pz-data'), dr = vis(data);
  // (judged by what is drawn, not the card's box: the last line is meant to run beside the pill, clear of it)
  const inked = (el) => { const rs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('.sr-only, [aria-hidden="true"]')) { const g = document.createRange(); g.selectNodeContents(n); rs.push(...g.getClientRects()); } for (const e of el.querySelectorAll('svg, button, img, canvas')) rs.push(e.getBoundingClientRect()); return rs.filter((q) => q.width && q.height); };
  const hit = text && bar && inked(document.querySelector('.pz-text')).find((q) => Math.min(q.right, bar.right) - Math.max(q.left, bar.left) > 1 && Math.min(q.bottom, bar.bottom) - Math.max(q.top, bar.top) > 1);
  // An equation sits whole inside its box and the card (the last letter of a subscript was once cut off at the card's edge).
  const eqm = document.querySelector('.pz-text .pz-eq math'), eqb = eqm && vis(eqm.parentElement), mq = eqm && eqm.getBoundingClientRect();
  if (eqb && text && mq.width && (mq.right > Math.min(eqb.right, text.right) + 1 || mq.left < Math.max(eqb.left, text.left) - 1)) out.push(`equation runs past its card (${Math.round(mq.right)} vs ${Math.round(Math.min(eqb.right, text.right))})`);
  if (hit) out.push(`slide words run under the controls pill (${Math.round(hit.left)},${Math.round(hit.bottom)} vs ${Math.round(bar.left)},${Math.round(bar.top)})`);
  if (dr) for (const c of data.querySelectorAll('h1,p,li,span,td,th,button,b,small,output')) { const q = c.getBoundingClientRect(); if (!q.width || getComputedStyle(c).visibility === 'hidden' || hidden(c, data)) continue; if (q.right > dr.right + 2 || q.left < dr.left - 2 || q.bottom > dr.bottom + 2 || q.top < dr.top - 2) { out.push(`reading "${c.textContent.trim().slice(0, 30)}" outside its card`); break; } }
  // The numbers card sits in the figure, whole on screen and clear of the words (sideways it had been pushed under them and cut off).
  // (Judged also while the card is held back: a card with no room under the words had waited off screen, never shown.)
  const held = data?.classList.contains('pz-hide') ? 16 : 1;
  // (a held card is judged where it will show: without the small slide its hiding adds, 18 px up on a phone)
  const rest = (el) => { const t = el.style.transform, tr = el.style.transition; el.style.transition = 'none'; el.style.transform = 'none'; const r = el.getBoundingClientRect(); el.style.transform = t; el.style.transition = tr; return r; };
  const db = data && !data.hidden && !('gone' in data.dataset) && (held > 1 ? rest(data) : data.getBoundingClientRect());
  if (db && db.width && (db.left < -1 || db.top < -1 || db.right > innerWidth + 1 || db.bottom > innerHeight + held)) out.push(`numbers card off screen (${Math.round(db.left)},${Math.round(db.top)},${Math.round(db.right)},${Math.round(db.bottom)})`);
  if (dr && !data.classList.contains('pz-hide')) {
    if (text && Math.min(dr.right, text.right) - Math.max(dr.left, text.left) > 4 && Math.min(dr.bottom, text.bottom) - Math.max(dr.top, text.top) > 4) out.push('numbers card over the slide words');
    if (text && dr.height < 60 && !data.classList.contains('tool-only')) out.push(`numbers card squeezed to ${Math.round(dr.height)} px`);
  }
  // Upright, the words sit in a teaching card at the bottom: it holds the words and the pill, stays on screen, and the data card
  // at the top ends clear of it, so the figure shows between them.
  const sh = document.querySelector('.pz.stack') && text && vis(document.querySelector('.pz-shade'));
  if (sh) {
    if (text.left < sh.left - 1 || text.right > sh.right + 1 || text.top < sh.top + 4 || text.bottom > sh.bottom + 1) out.push('slide words outside the teaching card');
    // The docked colour key never touches the nav pill, and stays whole inside the teaching card (15 Oct: the Origin key ran under the pill).
    const fk = vis(document.querySelector('.pz.stack .pz-fk'));
    if (fk && bar && Math.min(fk.right, bar.right) - Math.max(fk.left, bar.left) > -2 && Math.min(fk.bottom, bar.bottom) - Math.max(fk.top, bar.top) > -2) out.push(`colour key overlaps the nav pill (${Math.round(fk.right)} vs ${Math.round(bar.left)})`);
    if (fk && (fk.left < sh.left || fk.right > sh.right || fk.bottom > sh.bottom || fk.top < sh.top)) out.push('colour key outside the teaching card');
    if (fk && inked(document.querySelector('.pz-text')).some((q) => Math.min(q.right, fk.right) - Math.max(q.left, fk.left) > 1 && Math.min(q.bottom, fk.bottom) - Math.max(q.top, fk.top) > 1)) out.push('slide words run under the colour key');
    if (bar && (bar.left < sh.left || bar.right > sh.right || bar.bottom > sh.bottom)) out.push('controls pill outside the teaching card');
    if (sh.left < 1 || sh.right > innerWidth - 1 || sh.bottom > innerHeight - 1) out.push('teaching card touches the screen edge');
    if (db && db.width && !data.classList.contains('pz-hide') && db.bottom > sh.top - 4) out.push(`data card runs into the teaching card (${Math.round(db.bottom)} vs ${Math.round(sh.top)})`);
  }
  // No slide words, card or legend chip under the preview badge (a slim tab at the top centre, 13 px tall, added only to
  // /preview/). (An organ's name the camera leaves at the screen's edge is the figure, not a chip; it is not judged.)
  const seen = (e) => { for (let a = e; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const cx = innerWidth / 2, w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!n.textContent.trim() || n.parentElement.closest('.sr-only') || !n.parentElement.closest('.pz, [class*="legend"]')) continue;
    const g = document.createRange(); g.selectNodeContents(n);
    const q = [...g.getClientRects()].find((r) => r.width && r.top < 13 && r.bottom > 1 && r.right > cx - 60 && r.left < cx + 60);
    if (q && seen(n.parentElement)) { out.push(`"${n.textContent.trim().slice(0, 20)}" under the preview badge`); break; }
  }
  return out;
};
export async function checkPhoneFit(browser, url, deck, slides, log = () => {}) {
  const bad = [];
  for (const size of PHONES) {
    // (one page per size; each slide reached directly, its motion instant: tests/e2e/fast.mjs)
    const ctx = await fastContext(browser, { viewport: size, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (let i = 0, again = 1; i < slides; i++) try {
      await gotoSlide(page, url, deck, i); await quiet(page);
      if (await page.evaluate(() => { const b = document.querySelector('.pz-data:not(.pz-hide):not(.tool-open) .pz-fold'); if (b && b.offsetWidth) { b.click(); return true; } return false; })) await quiet(page);
      const c = await page.evaluate(fitIssues);
      if (c.length) bad.push(`${deck} slide ${i + 1} at ${size.width}x${size.height}: ${c.join('; ')}`); else log(`ok ${size.width}x${size.height} ${deck} ${i + 1}`);
    } catch (e) {
      // (a page that reloaded mid-slide, as a runner's page now and then does: once more from a fresh load, then it counts)
      if (!again-- || !/context was destroyed|navigation/.test(e.message)) throw e;
      await page.goto('about:blank'); i--;
    }
    await ctx.close();
  }
  return bad;
}
