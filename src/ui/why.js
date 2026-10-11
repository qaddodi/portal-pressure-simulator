// "Why?" popover (blueprint §9.3): one causal sentence, a contribution waterfall and the formula.

import { host } from './host.js?v=0bd4e7637f';
import { h, fmt, svgIcon, uiScale } from './util.js?v=045e641b44';

export function createWhy(pop) {
  let openFor = null, anchorEl = null;
  function place(anchor) {
    const r = anchor.getBoundingClientRect(), z = uiScale();
    const pw = Math.min(440 * z, innerWidth - 24);
    let x = r.left + r.width / 2 - pw / 2;
    x = Math.max(12, Math.min(innerWidth - pw - 12, x));
    pop.style.left = x / z + 'px';
    const ph = (pop.offsetHeight || 260) * z;
    const below = r.bottom + 10;
    pop.style.top = (below + ph > innerHeight - 8 ? Math.max(8, r.top - ph - 10) : below) / z + 'px';
  }
  const head = (title) => h('header', {}, h('h3', {}, svgIcon('bulb'), title), h('button', { class: 'ib', 'aria-label': 'Close', onclick: close }, svgIcon('close')));
  async function open(metric, anchor) {
    if (openFor === metric && pop.classList.contains('show')) { close(); return; }
    openFor = metric; anchorEl = anchor;
    pop.replaceChildren(head('Why?'), h('div', { class: 'sub' }, 'Reverting each change on a scratch copy of the model…'), h('div', { class: 'skeleton', style: { width: '90%' } }), h('div', { class: 'skeleton', style: { width: '70%' } }), h('div', { class: 'skeleton', style: { width: '80%' } }));
    pop.classList.add('show');
    place(anchor);
    const { result: r } = await host.request('explain', { metric });
    if (openFor !== metric || !r) return;
    const maxAbs = Math.max(1e-6, ...r.contributions.map((c) => Math.abs(c.delta)), Math.abs(r.total));
    const tiny = Math.pow(10, -r.digits) * 0.5;
    const shown = r.contributions.filter((c) => Math.abs(c.delta) >= tiny).slice(0, 8);
    // The changes reverted one at a time do not add up to the whole (they interact): the rest is a row
    // of its own, so the bars always sum to the change shown above them.
    const rest = r.total - shown.reduce((a, c) => a + c.delta, 0);
    if (shown.length && Math.abs(rest) >= Math.max(tiny, 0.05 * Math.abs(r.total))) shown.push({ label: 'Interaction and other', delta: rest, other: true });
    // A short name on the row ("Cirrhosis (85 %)"), the full one in its tooltip.
    const short = (l) => (l.includes(':') ? l.slice(0, l.indexOf(':')) : l.replace(/\s*\([^)]*\)\s*$/, '')).trim();
    const rows = shown.map((c) => {
      const wpct = (Math.abs(c.delta) / maxAbs) * 50;
      const bar = h('div', { class: 'wf-bar' }, h('i', { style: { left: c.delta >= 0 ? '50%' : `${50 - wpct}%`, width: `${Math.max(1, wpct)}%`, background: c.other ? 'var(--text-3)' : c.delta >= 0 ? 'var(--danger)' : 'var(--accent)' } }));
      return h('div', { class: 'wf-row' }, h('span', { class: 'lab', title: c.label }, short(c.label)), bar, h('span', { class: 'val' }, (c.delta >= 0 ? '+' : '−') + fmt(Math.abs(c.delta), r.digits)));
    });
    pop.replaceChildren(
      head(r.label),
      h('div', { class: 'sentence' }, r.sentence),
      rows.length ? h('div', { class: 'waterfall' }, h('div', { class: 'overline', style: { marginBottom: '2px' } }, `Contribution of each change · ${r.unit}`), ...rows,
        h('div', { class: 'ctl-sub', style: { marginTop: '2px' } }, 'Estimated by reverting each change on its own. Red raises the value, blue lowers it, grey is what they add together.')) : null,
      r.formula ? h('div', { class: 'formula' }, r.formula) : null,
    );
    place(anchor);
  }
  function close() { pop.classList.remove('show'); openFor = null; anchorEl?.focus?.({ preventScroll: true }); anchorEl = null; }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.classList.contains('show')) close(); });
  addEventListener('pointerdown', (e) => { if (pop.classList.contains('show') && !pop.contains(e.target) && !e.target.closest('.metric, .finding, .vital, .btn, .link')) close(); });
  return { open, close };
}
