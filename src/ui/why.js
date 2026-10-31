// "Why?" popover (blueprint §9.3): one causal sentence, a contribution waterfall and the formula.

import { host } from './host.js?v=9ec2108104';
import { h, fmt, svgIcon, visibleBottom } from './util.js?v=90ca733567';

export function createWhy(pop) {
  let openFor = null, anchorEl = null;
  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = Math.min(440, innerWidth - 24);
    let x = r.left + r.width / 2 - pw / 2;
    x = Math.max(12, Math.min(innerWidth - pw - 12, x));
    pop.style.left = x + 'px';
    const ph = pop.offsetHeight || 260;
    const below = r.bottom + 10;
    pop.style.top = (below + ph > visibleBottom() - 8 ? Math.max(8, r.top - ph - 10) : below) + 'px';
  }
  const head = (title) => h('header', {}, h('h3', {}, svgIcon('bulb'), title), h('button', { class: 'ib', 'aria-label': 'Close', onclick: close }, svgIcon('close')));
  async function open(metric, anchor) {
    if (openFor === metric && pop.classList.contains('show')) { close(); return; }
    openFor = metric; anchorEl = anchor;
    clearTimeout(leaveT); pop.classList.remove('leaving');
    pop.replaceChildren(head('Why?'), h('div', { class: 'sub' }, 'Working out what drives it…'), h('div', { class: 'skeleton', style: { width: '90%' } }), h('div', { class: 'skeleton', style: { width: '70%' } }), h('div', { class: 'skeleton', style: { width: '80%' } }));
    pop.classList.add('show');
    place(anchor);
    let r = null;
    try { ({ result: r } = await host.request('explain', { metric })); }
    catch { if (openFor === metric) pop.replaceChildren(head('Why?'), h('div', { class: 'sub' }, 'The model could not work this out right now.')); return; }
    if (openFor !== metric || !r) return;
    const maxAbs = Math.max(1e-6, ...r.contributions.map((c) => Math.abs(c.delta)), Math.abs(r.total));
    const tiny = Math.pow(10, -r.digits) * 0.5;
    const shown = r.contributions.filter((c) => Math.abs(c.delta) >= tiny).slice(0, 8);
    // The changes reverted one at a time do not add up to the whole (they interact): the rest is a row
    // of its own, so the bars always sum to the change shown above them.
    const rest = r.total - shown.reduce((a, c) => a + c.delta, 0);
    if (shown.length && Math.abs(rest) >= Math.max(tiny, 0.05 * Math.abs(r.total))) shown.push({ label: 'Interaction and other', delta: rest, other: true });
    // A short name on the row ("Cirrhosis"), the full one with its amount in the tooltip ("Cirrhosis 85 %").
    const short = (l) => l.replace(/\s[+×]?[\d.]+(\s?(%|mm|mL|L|g\/dL))?$/, '');
    const h0 = pop.offsetHeight, t0 = pop.style.top;
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
    // The answer takes the waiting lines' place by growing (or shrinking) the card to its height, the words fading in,
    // rather than the card jumping to a new size (P20).
    const h1 = pop.offsetHeight;
    if (pop.animate && h0 && Math.abs(h1 - h0) > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pop.animate([{ height: `${h0}px`, top: t0, overflow: 'hidden' }, { height: `${h1}px`, top: pop.style.top, overflow: 'hidden' }], { duration: 240, easing: 'cubic-bezier(.65, 0, .35, 1)' });
    }
    for (const k of pop.children) if (k.tagName !== 'HEADER') k.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
  // It fades out as it came in (it vanished in one frame: P20).
  let leaveT = 0;
  function close() {
    if (pop.classList.contains('show')) {
      pop.classList.remove('show'); pop.classList.add('leaving');
      clearTimeout(leaveT); leaveT = setTimeout(() => pop.classList.remove('leaving'), 200);
    }
    openFor = null; anchorEl?.focus?.({ preventScroll: true }); anchorEl = null;
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.classList.contains('show')) close(); });
  addEventListener('pointerdown', (e) => { if (pop.classList.contains('show') && !pop.contains(e.target) && !e.target.closest('.metric, .finding, .vital, .btn, .link')) close(); });
  return { open, close };
}
