// Treat's Changes as a page of its own on a phone (18 Nov 2026, the tester at 390 px, Procedures with four changes: 726 px of words in a room of 654, so a list that opened inline scrolled inside the sheet;
// Mohammad: "no internal scroll", the coordinator: "its own page, the same slide and back row as the menu pages"). A row in the body ("Changes", how many) opens it: the page slides in from the right over the tabs
// and the body, which slide back and fade out, the sheet taking the room it needs (it is a Full sheet while the page is up); the back row, or a swipe right, slides it away. Moved by transform and opacity
// alone, one animation each, as util.js menuPush does for the menus' pages: nothing is rebuilt, so nothing blinks (and the page follows a swipe right with the finger, page-push.js). The Changes section itself (its list, its Clear all, its count) is the one chart.js builds: it is
// moved into the page, opened, with its own summary out of sight.
import { h, icon } from './util.js';
import { pushPage } from './page-push.js';
import { readMetric } from './layout-snap.js';
import { glideCall, glideStop } from './script-glide.js';

const SETTLE_MS = 600;   // (the longest a page waits for its sheet to land: the sheet's ease is 240 ms and its measure a frame or two)

/** card: the Treat sheet; sec: the Changes section (chart.js treatChanges), back: the name of what the page goes back to. Returns { row, sync, close }: row goes in the body in the section's place. */
export function changesPage(card, sec, back = 'Treat') {
  const count = h('span', { class: 'tcp-n' }), row = h('button', { class: 'tcp-row', type: 'button', 'aria-haspopup': 'dialog' }, h('span', { class: 'tcp-t' }, 'Changes'), count, icon('chev-right'));
  const sync = () => { const n = sec.querySelector('.chg-list')?.dataset.n || ''; count.textContent = n && n !== '0' ? n : ''; };
  let page = null, push = null, away = [];
  const keep = () => ['.treat-tabs', '.tc-body'].map((q) => card.querySelector(`:scope > ${q}`)).filter(Boolean);
  const open = () => {
    if (page) return;
    const tabs = card.querySelector(':scope > .treat-tabs'), body = card.querySelector(':scope > .tc-body');
    if (!tabs || !body) return;
    const top = readMetric(tabs, 'offsetTop');   // (read in the tap itself, once: the page stands where the tabs stood and runs to the sheet's foot)
    sec.open = true;
    const backBtn = h('button', { class: 'tcp-back', type: 'button' }, icon('chev-left'), back);
    const p = page = h('div', { class: 'tc-page', role: 'group', 'aria-label': 'Changes', style: { top: `${top}px` } }, h('div', { class: 'tcp-head' }, backBtn, h('span', { class: 'tcp-title' }, 'Changes')), h('div', { class: 'tcp-body' }, sec));
    card.append(p); card.dataset.page = '';
    away = keep(); for (const e of away) e.inert = true;
    // (The sheet and the page never move together: the sheet grows to Full first, the page slides in when it has landed, and on the way back the page slides out and the sheet then settles. A sheet that rises while the
    // page slides carries the page up with it, and it came in from the lower right; the tester, 18 Nov. Held until the sheet says it has landed (the refit event's detail.landed, dock-sheet.js), or, where none will, after SETTLE_MS.)
    push = pushPage(p, away, readMetric(card, 'offsetWidth'), {
      plate: true,
      wait: true,
      onPop: () => {
        page = null;   // (a tap on the row now opens a page again, while this one is still going out)
        for (const e of away) e.inert = false;
        p.inert = true;
        row.focus({ preventScroll: true });
      },
      onGone: () => { delete card.dataset.page; card.dispatchEvent(new Event('sheet-refit')); p.remove(); },
    });
    const start = () => { glideStop(row); push.start(); };
    glideCall(row, SETTLE_MS, (u) => u, () => {}, start);   // (the frame clock's own wait, in case no sheet lands)
    card.dispatchEvent(new CustomEvent('sheet-refit', { detail: { landed: start } }));
    backBtn.addEventListener('click', close);
  };
  function close() { push?.pop(0); }
  row.addEventListener('click', open);
  return { row, sync, close };
}
