// Treat's Changes as a page of its own on a phone (18 Nov 2026, the tester at 390 px, Procedures with four changes: 726 px of words in a room of 654, so a list that opened inline scrolled inside the sheet;
// Mohammad: "no internal scroll", the coordinator: "its own page, the same slide and back row as the menu pages"). A row in the body ("Changes", how many) opens it: the page slides in from the right over the tabs
// and the body, which slide back and fade out, the sheet taking the room it needs (it is a Full sheet while the page is up); the back row, or a swipe right, slides it away. Moved by transform and opacity
// alone, one animation each, as util.js menuPush does for the menus' pages: nothing is rebuilt, so nothing blinks. The Changes section itself (its list, its Clear all, its count) is the one chart.js builds: it is
// moved into the page, opened, with its own summary out of sight.
import { h, icon } from './util.js';
import { D_SMALL, EASE_ARRIVE } from './ease.js';
import { reduceMotionMQ } from './motion.js';

/** card: the Treat sheet; sec: the Changes section (chart.js treatChanges), back: the name of what the page goes back to. Returns { row, sync, close }: row goes in the body in the section's place. */
export function changesPage(card, sec, back = 'Treat') {
  const count = h('span', { class: 'tcp-n' }), row = h('button', { class: 'tcp-row', type: 'button', 'aria-haspopup': 'dialog' }, h('span', { class: 'tcp-t' }, 'Changes'), count, icon('chev-right'));
  const sync = () => { const n = sec.querySelector('.chg-list')?.dataset.n || ''; count.textContent = n && n !== '0' ? n : ''; };
  let page = null, away = [];
  const keep = () => ['.treat-tabs', '.tc-body'].map((q) => card.querySelector(`:scope > ${q}`)).filter(Boolean);
  const open = () => {
    if (page) return;
    const tabs = card.querySelector(':scope > .treat-tabs'), body = card.querySelector(':scope > .tc-body');
    if (!tabs || !body) return;
    const top = tabs.offsetTop;   // (read in the tap itself, once: the page stands where the tabs stood and runs to the sheet's foot)
    sec.open = true;
    const backBtn = h('button', { class: 'tcp-back', type: 'button' }, icon('chev-left'), back);
    page = h('div', { class: 'tc-page', role: 'group', 'aria-label': 'Changes', style: { top: `${top}px` } }, h('div', { class: 'tcp-head' }, backBtn, h('span', { class: 'tcp-title' }, 'Changes')), h('div', { class: 'tcp-body' }, sec));
    card.append(page); card.dataset.page = ''; card.dispatchEvent(new Event('sheet-refit'));
    const still = reduceMotionMQ.matches, opt = { duration: D_SMALL, easing: EASE_ARRIVE, fill: 'both' };
    page.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translateX(100%)' }, { transform: 'none' }], opt);
    away = keep().map((e) => { e.inert = true; return e.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-30%)', opacity: 0 }], opt); });
    backBtn.addEventListener('click', close);
    let sx = null;   // (a swipe right from the page goes back, as a pushed page does on iOS)
    page.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = e.touches.length === 1 ? [t.clientX, t.clientY] : null; }, { passive: true });
    page.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (sx && t.clientX - sx[0] > 70 && Math.abs(t.clientY - sx[1]) < 40) close(); sx = null; }, { passive: true });
  };
  function close() {
    const p = page;
    if (!p) return;
    page = null;
    const still = reduceMotionMQ.matches, o = { duration: D_SMALL, easing: EASE_ARRIVE, fill: 'both' };
    for (const a of away) a.cancel();
    away = [];
    for (const e of keep()) { e.inert = false; const home = e.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translateX(-30%)', opacity: 0 }, { transform: 'none', opacity: 1 }], o); home.finished.then(() => home.cancel()).catch(() => {}); }
    p.inert = true;
    delete card.dataset.page; card.dispatchEvent(new Event('sheet-refit'));
    const out = p.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none' }, { transform: 'translateX(100%)' }], o);
    const gone = () => p.remove();
    out.finished.then(gone, gone);
    row.focus({ preventScroll: true });
  }
  row.addEventListener('click', open);
  return { row, sync, close };
}
