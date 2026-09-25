// Findings (blueprint §10.3). The model's events (a collateral opening, flow reversing, a
// varix rupturing, ascites forming) are collected quietly in one place: a Findings button in
// the figure header with a count of unread items. The newest finding is named beside the
// button for a few seconds; the list gives each one's detail and its cause ("Why?"). Nothing is
// drawn over the anatomy, nothing flashes, and every event stays in the Log instrument.

import { h, announce, svgIcon, popover, closePopover, fmt } from './util.js';

const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
const WHY = { VARIX_RUPTURE: 'varix', RED_WALE: 'varix', VARIX_LARGE: 'varix', HEPATOFUGAL_PV: 'pvFlow', PV_STASIS: 'pvFlow', CSPH: 'hvpg', BLEED_RISK: 'hvpg', ASCITES_FORMING: 'ascites', TENSE_ASCITES: 'ascites', HIGH_SHUNT: 'shunt', LIVER_HYPOPERFUSION: 'liverPerf', RA_HIGH: 'ra', HYPERDYNAMIC: 'co', SPLENOMEGALY: 'spleen' };
const RANK = { ok: 0, info: 1, caution: 2, danger: 3, critical: 4 };

export function createEventsUI({ button, onWhy, onOpenLog }) {
  const items = [];
  const lastShown = {};
  let unread = 0, unreadTop = 'info', muted = false, latestTimer = null;
  const count = h('span', { class: 'find-count', hidden: true });
  const latest = h('span', { class: 'find-latest' });
  button.replaceChildren(svgIcon('bell'), h('span', { class: 'find-l' }, 'Findings'), count, latest);

  function sync() {
    count.hidden = !unread;
    count.textContent = unread > 9 ? '9+' : String(unread);
    button.dataset.sev = unread ? unreadTop : '';
    button.setAttribute('aria-label', unread ? `Findings: ${unread} new` : 'Findings');
  }
  function when(ev) { return ev.day > 0 ? `Day ${ev.day}` : `${fmt(ev.t, 0)} s`; }

  function handle(evs) {
    for (const ev of evs) {
      const now = performance.now();
      if (lastShown[ev.id] && now - lastShown[ev.id] < 30000 && ev.severity !== 'critical') continue;
      lastShown[ev.id] = now;
      items.unshift(ev);
      if (items.length > 40) items.pop();
      unread++;
      if (RANK[ev.severity] > RANK[unreadTop] || unread === 1) unreadTop = ev.severity;
      announce(`${ev.title}. ${ev.detail || ''}`);
      if (!muted || ev.severity === 'critical') {
        latest.textContent = ev.title;
        button.classList.add('has-latest');
        clearTimeout(latestTimer);
        latestTimer = setTimeout(() => button.classList.remove('has-latest'), 6000);
      }
    }
    sync();
  }

  button.addEventListener('click', () => {
    button.classList.remove('has-latest');
    const list = items.length
      ? items.slice(0, 12).map((ev) => {
        const why = WHY[ev.id] || (ev.id.startsWith('COLL_') ? 'shunt' : null);
        return h('div', { class: 'find-item' },
          h('span', { class: 'find-dot', style: { background: SEV[ev.severity] || SEV.info } }),
          h('div', { class: 'find-body' },
            h('div', { class: 'find-t' }, ev.title, h('span', { class: 'find-when' }, when(ev))),
            ev.detail ? h('div', { class: 'find-d' }, ev.detail) : null,
            why ? h('button', { class: 'link', onclick: (e) => { closePopover(); onWhy(why, button); e.stopPropagation(); } }, 'Why?') : null));
      })
      : [h('div', { class: 'find-empty' }, 'Nothing yet. When the model crosses a threshold (a collateral opens, flow reverses, a varix ruptures), it is listed here.')];
    popover(button, [h('div', { class: 'menu-title' }, 'Findings'), h('div', { class: 'find-list' }, list),
      h('div', { class: 'menu-sep' }), h('button', { class: 'menu-item', onclick: () => { closePopover(); onOpenLog(); } }, svgIcon('chart', 'mi-ic'), h('span', {}, 'Full event log'))], { align: 'end', cls: 'find-pop' });
    unread = 0; unreadTop = 'info';
    sync();
  });

  sync();
  return {
    handle,
    clear() { items.length = 0; unread = 0; unreadTop = 'info'; button.classList.remove('has-latest'); sync(); },
    mute(v) { muted = v; },
  };
}
