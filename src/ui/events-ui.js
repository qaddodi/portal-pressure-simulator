// Findings (blueprint §10.3). The model's events (a collateral opening, flow reversing, a
// varix rupturing, ascites forming) are collected quietly in one place: a Findings tab in the
// side panel, with a count of unread items on the tab. The list gives each one's detail and its
// cause ("Why?"). Nothing is drawn over the anatomy, nothing flashes, and every event stays in
// the Log instrument.

import { h, announce, svgIcon, fmt } from './util.js?v=61d6f9c200';

const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
const WHY = { VARIX_RUPTURE: 'varix', RED_WALE: 'varix', VARIX_LARGE: 'varix', HEPATOFUGAL_PV: 'pvFlow', PV_STASIS: 'pvFlow', CSPH: 'hvpg', BLEED_RISK: 'hvpg', ASCITES_FORMING: 'ascites', TENSE_ASCITES: 'ascites', HIGH_SHUNT: 'shunt', LIVER_HYPOPERFUSION: 'liverPerf', RA_HIGH: 'ra', HYPERDYNAMIC: 'co', SPLENOMEGALY: 'spleen' };
const RANK = { ok: 0, info: 1, caution: 2, danger: 3, critical: 4 };

export function createEventsUI({ onWhy, onOpenLog }) {
  const items = [];
  const lastShown = {};
  const badges = new Set();
  let unread = 0, unreadTop = 'info', listEl = null;

  function when(ev) { return ev.day > 0 ? `Day ${ev.day}` : `${fmt(ev.t, 0)} s`; }
  function syncBadges() {
    for (const b of badges) {
      if (!b.isConnected) { badges.delete(b); continue; }
      b.hidden = !unread;
      b.textContent = unread > 9 ? '9+' : String(unread);
      b.dataset.sev = unreadTop;
    }
  }
  function renderList() {
    if (!listEl?.isConnected) { listEl = null; return; }
    listEl.replaceChildren(...(items.length
      ? items.slice(0, 30).map((ev) => {
        const why = WHY[ev.id] || (ev.id.startsWith('COLL_') ? 'shunt' : null);
        return h('div', { class: 'find-item' },
          h('span', { class: 'find-dot', style: { background: SEV[ev.severity] || SEV.info } }),
          h('div', { class: 'find-body' },
            h('div', { class: 'find-t' }, ev.title, h('span', { class: 'find-when' }, when(ev))),
            ev.detail ? h('div', { class: 'find-d' }, ev.detail) : null,
            why ? h('button', { class: 'link', onclick: (e) => { onWhy(why, e.currentTarget); e.stopPropagation(); } }, 'Why?') : null));
      })
      : [h('div', { class: 'find-empty' }, 'Nothing yet. When the model crosses a threshold (a collateral opens, flow reverses, a varix ruptures), it is listed here.')]));
    unread = 0; unreadTop = 'info';
    syncBadges();
  }

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
    }
    if (listEl) renderList(); else syncBadges();
  }

  return {
    handle,
    clear() { items.length = 0; unread = 0; unreadTop = 'info'; if (listEl) renderList(); else syncBadges(); },
    mute() {},
    /** Unread count for a tab label; kept current as findings arrive. */
    badge() { const b = h('span', { class: 'find-count', hidden: true }); badges.add(b); syncBadges(); return b; },
    /** The findings list for the side panel; viewing it marks everything read. */
    panel() {
      listEl = h('div', { class: 'find-list' });
      queueMicrotask(renderList);
      return [listEl, h('button', { class: 'btn find-log', onclick: onOpenLog }, svgIcon('chart', 'mi-ic'), 'Full event log')];
    },
  };
}
