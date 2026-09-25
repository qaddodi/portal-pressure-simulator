// Event notifications (blueprint §10.3, §5.5): a quiet stack in the stage corner, plus a pulse
// ring on the anatomy where the event happened. Critical events stay until acknowledged.

import { h, announce, svgIcon } from './util.js';
import { ANCHORS } from './anatomy.js';

const ICON = { critical: 'alert', danger: 'alert', caution: 'info', info: 'info', ok: 'check' };
const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
const WHY = { VARIX_RUPTURE: 'varix', RED_WALE: 'varix', VARIX_LARGE: 'varix', HEPATOFUGAL_PV: 'pvFlow', PV_STASIS: 'pvFlow', CSPH: 'hvpg', BLEED_RISK: 'hvpg', ASCITES_FORMING: 'ascites', TENSE_ASCITES: 'ascites', HIGH_SHUNT: 'shunt', LIVER_HYPOPERFUSION: 'liverPerf', RA_HIGH: 'ra', HYPERDYNAMIC: 'co', SPLENOMEGALY: 'spleen' };
const MAX = 2;

export function createEventsUI({ stack, overlay, vignette, stage, onWhy }) {
  const active = [];
  const lastShown = {};
  let muted = false;

  function anchorPt(anchor) {
    const p = ANCHORS[anchor] || stage.anchorPos(anchor);
    return p ? stage.worldToLocal(p[0], p[1]) : null;
  }
  function show(ev) {
    if (muted && ev.severity !== 'critical') return;
    const now = performance.now();
    if (lastShown[ev.id] && now - lastShown[ev.id] < 30000 && ev.severity !== 'critical') return;
    lastShown[ev.id] = now;
    const why = WHY[ev.id] || (ev.id.startsWith('COLL_') ? 'shunt' : null);
    const item = { ev, born: now };
    const close = h('button', { class: 'ib x', 'aria-label': 'Dismiss' }, svgIcon('close'));
    close.addEventListener('click', () => dismiss(item));
    const el = h('div', { class: `note glass stage-blocker ${ev.severity}`, role: ev.severity === 'critical' ? 'alert' : 'status', style: { '--sev': SEV[ev.severity] || SEV.info } },
      svgIcon(ICON[ev.severity] || 'info', 'ic'), h('span', { class: 'ttl' }, ev.title), close,
      ev.detail ? h('span', { class: 'dtl' }, ev.detail) : null,
      why ? h('div', { class: 'row' }, h('button', { class: 'link', onclick: (e) => onWhy(why, e.currentTarget) }, 'Why?'), ev.severity === 'critical' ? h('button', { class: 'link', onclick: () => dismiss(item) }, 'Acknowledge') : null) : null);
    el.style.setProperty('--sev', SEV[ev.severity] || SEV.info);
    item.el = el;
    el.addEventListener('pointerenter', () => { item.hold = true; });
    el.addEventListener('pointerleave', () => { item.hold = false; item.born = performance.now() - 3000; });
    stack.prepend(el);
    active.unshift(item);
    const max = stack.closest('.stage-wrap')?.classList.contains('compact') ? 2 : MAX;
    while (active.length > max) dismiss([...active].reverse().find((a) => a.ev.severity !== 'critical') || active[active.length - 1], true);
    const a = anchorPt(ev.anchor);
    if (a) {
      const ring = h('div', { class: `pulse-ring ${ev.severity}`, style: { left: a[0] + 'px', top: a[1] + 'px' } });
      overlay.append(ring);
      setTimeout(() => ring.remove(), 5200);
    }
    if (ev.severity === 'critical') { vignette.classList.remove('pulse'); void vignette.offsetWidth; vignette.classList.add('pulse'); }
    announce(`${ev.title}. ${ev.detail || ''}`);
  }
  function dismiss(item, instant = false) {
    const i = active.indexOf(item);
    if (i < 0) return;
    active.splice(i, 1);
    if (instant) { item.el.remove(); return; }
    item.el.classList.add('leaving');
    setTimeout(() => item.el.remove(), 220);
  }
  setInterval(() => {
    const now = performance.now();
    for (const it of [...active]) if (it.ev.severity !== 'critical' && !it.hold && now - it.born > 8000) dismiss(it);
  }, 500);
  return {
    handle(evs) { for (const e of evs) show(e); },
    position() {},
    clear() { for (const it of [...active]) dismiss(it, true); },
    mute(v) { muted = v; },
  };
}
