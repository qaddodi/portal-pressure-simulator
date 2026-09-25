// "Why?" popover (blueprint §9.3): sentence + waterfall + formula.

import { host } from './host.js';
import { h, fmt } from './util.js';

export function createWhy(pop) {
  let openFor = null;
  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = Math.min(440, innerWidth - 24);
    let x = r.left + r.width / 2 - pw / 2;
    x = Math.max(12, Math.min(innerWidth - pw - 12, x));
    pop.style.left = x + 'px';
    const below = r.bottom + 8;
    const ph = pop.offsetHeight || 260;
    pop.style.top = (below + ph > innerHeight - 8 ? Math.max(8, r.top - ph - 8) : below) + 'px';
  }
  async function open(metric, anchor) {
    if (openFor === metric && pop.classList.contains('show')) { close(); return; }
    openFor = metric;
    pop.replaceChildren(h('h3', {}, 'Why?', closeBtn()), h('div', { class: 'ctl-sub' }, 'Tracing causes… (reverting each change on a scratch copy of the model)'));
    pop.classList.add('show');
    place(anchor);
    const { result: r } = await host.request('explain', { metric });
    if (openFor !== metric || !r) return;
    const maxAbs = Math.max(1e-6, ...r.contributions.map((c) => Math.abs(c.delta)), Math.abs(r.total));
    const rows = r.contributions.filter((c) => Math.abs(c.delta) >= Math.pow(10, -r.digits) * 0.5).slice(0, 8).map((c) => {
      const wpct = (Math.abs(c.delta) / maxAbs) * 50;
      const bar = h('div', { class: 'wf-bar' }, h('i', { style: { left: c.delta >= 0 ? '50%' : `${50 - wpct}%`, width: `${wpct}%`, background: c.delta >= 0 ? 'var(--danger)' : 'var(--info)' } }));
      return h('div', { class: 'wf-row' }, h('span', { class: 'lab', title: c.label }, c.label), bar, h('span', { class: 'val' }, (c.delta >= 0 ? '+' : '') + fmt(c.delta, r.digits)));
    });
    pop.replaceChildren(
      h('h3', {}, `Why? ${r.label}`, closeBtn()),
      h('div', { class: 'sentence' }, r.sentence),
      rows.length ? h('div', { class: 'waterfall' }, h('div', { class: 'ctl-sub' }, `Contribution of each change (${r.unit}), estimated by reverting it alone:`), ...rows) : null,
      r.formula ? h('div', { class: 'formula' }, r.formula) : null,
    );
    place(anchor);
  }
  function closeBtn() { return h('button', { class: 'btn icon', 'aria-label': 'Close', onclick: close }, '×'); }
  function close() { pop.classList.remove('show'); openFor = null; }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  addEventListener('pointerdown', (e) => { if (pop.classList.contains('show') && !pop.contains(e.target) && !e.target.closest('.tile, .btn')) close(); });
  return { open, close };
}
