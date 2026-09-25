// Event callouts anchored to anatomy (blueprint §10.3, §5.5).

import { h, announce } from './util.js';
import { ANCHORS } from './anatomy.js';

const ICON = { critical: '⚠', danger: '⚠', caution: '●', info: 'ℹ', ok: '✓' };

export function createEventsUI({ overlay, vignette, stage, onWhy }) {
  const active = [];
  let muted = false;
  function anchorPt(anchor) {
    const p = ANCHORS[anchor] || stage.anchorPos(anchor);
    return p ? stage.worldToLocal(p[0], p[1]) : null;
  }
  const lastShown = {};
  function show(ev) {
    if (muted && ev.severity !== 'critical') return;
    const now = performance.now();
    if (lastShown[ev.id] && now - lastShown[ev.id] < 30000 && ev.severity !== 'critical') return;
    lastShown[ev.id] = now;
    const whyMap = { VARIX_RUPTURE: 'varix', RED_WALE: 'varix', HEPATOFUGAL_PV: 'pvFlow', CSPH: 'hvpg', BLEED_RISK: 'hvpg', ASCITES_FORMING: 'ascites', HIGH_SHUNT: 'shunt', LIVER_HYPOPERFUSION: 'liverPerf', RA_HIGH: 'ra', HYPERDYNAMIC: 'co', SPLENOMEGALY: 'spleen' };
    const why = whyMap[ev.id] || (ev.id.startsWith('COLL_') ? 'shunt' : null);
    const el = h('div', { class: `callout ${ev.severity}`, role: ev.severity === 'critical' ? 'alert' : 'status' },
      h('div', { class: 'ttl' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, ICON[ev.severity] || 'ℹ'), h('span', {}, ev.title)),
      ev.detail ? h('div', { class: 'dtl' }, ev.detail) : null,
      h('div', { class: 'row' }, why ? h('a', { onclick: (e) => onWhy(why, e.currentTarget) }, 'Why?') : null, h('a', { onclick: () => dismiss(item) }, ev.severity === 'critical' ? 'Acknowledge' : 'Dismiss')));
    const leader = h('div', { class: 'leader' });
    overlay.append(leader, el);
    const item = { ev, el, leader, born: performance.now() };
    active.push(item);
    while (active.length > 3) dismiss(active.find((a) => a.ev.severity !== 'critical') || active[0]);
    if (ev.severity === 'critical') { vignette.classList.remove('pulse'); void vignette.offsetWidth; vignette.classList.add('pulse'); }
    announce(`${ev.title}. ${ev.detail || ''}`);
    position();
  }
  function dismiss(item) {
    const i = active.indexOf(item);
    if (i < 0) return;
    active.splice(i, 1);
    item.el.remove(); item.leader.remove();
  }
  function position() {
    const W = overlay.clientWidth;
    const legend = document.querySelector('#hudTR');
    let slotY = legend ? legend.offsetTop + legend.offsetHeight + 10 : 70;
    if (W < 700) slotY = 60;
    for (const it of active) {
      const a = anchorPt(it.ev.anchor);
      const x = Math.max(8, W - 282), y = slotY;
      it.el.style.left = x + 'px'; it.el.style.top = y + 'px';
      slotY += it.el.offsetHeight + 10;
      if (a) {
        const ex = x, ey = y + 18;
        const dx = ex - a[0], dy = ey - a[1];
        it.leader.style.left = a[0] + 'px'; it.leader.style.top = a[1] + 'px';
        it.leader.style.width = Math.hypot(dx, dy) + 'px';
        it.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
  }
  setInterval(() => {
    const now = performance.now();
    for (const it of [...active]) if (it.ev.severity !== 'critical' && now - it.born > 7000) dismiss(it);
  }, 500);
  return {
    handle(evs) { for (const e of evs) show(e); },
    position,
    clear() { for (const it of [...active]) dismiss(it); },
    mute(v) { muted = v; },
  };
}
