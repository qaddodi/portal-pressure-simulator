// "Why?" popover (blueprint §9.3): one causal sentence, a contribution waterfall and the formula.

import { host } from './host.js?v=606ab97574';
import { h, fmt, svgIcon, visibleBottom, settleFrom, announce } from './util.js?v=d639a1333f';
import { leaveFromHere } from './menu-leave.js?v=e885166f40';
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_MOVE } from './ease.js?v=7513a88c68';
import { glidePlate } from './plate-glide.js?v=b608fe722c';

export function createWhy(pop) {
  let openFor = null, anchorEl = null;
  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth || Math.min(440, innerWidth - 24);
    // (Clear of the notch and the home indicator when the phone is held sideways; env() is 0 elsewhere.)
    pop.style.left = `clamp(calc(12px + env(safe-area-inset-left, 0px)), ${r.left + r.width / 2 - pw / 2}px, calc(100% - ${pw}px - 12px - env(safe-area-inset-right, 0px)))`;
    const x = pop.offsetLeft;
    const ph = pop.offsetHeight || 260;
    const below = r.bottom + 10;
    const top = below + ph > visibleBottom() - 8 ? Math.max(8, r.top - ph - 10) : below;
    pop.style.top = top + 'px';
    settleFrom(pop, r, x, top);
  }
  const head = (title) => h('header', {}, h('h3', {}, svgIcon('bulb'), title), h('button', { class: 'ib', 'aria-label': 'Close', onclick: close }, svgIcon('close')));
  // (The card's content replaced: focus that was on its Close button, the keyboard's way in, goes to the new one, not to the page.)
  function swap(...kids) {
    const had = pop.contains(document.activeElement);
    pop.replaceChildren(...kids);
    if (had) pop.querySelector('button')?.focus({ preventScroll: true });
  }
  async function open(metric, anchor) {
    if (openFor === metric && pop.classList.contains('show')) { close(); return; }
    openFor = metric; anchorEl = anchor;
    clearTimeout(leaveT); pop.classList.remove('leaving');
    pop.replaceChildren(head('Why?'), h('div', { class: 'sub' }, 'Working out what drives it…'), h('div', { class: 'skeleton', style: { width: '90%' } }), h('div', { class: 'skeleton', style: { width: '70%' } }), h('div', { class: 'skeleton', style: { width: '80%' } }));
    pop.classList.add('show');
    place(anchor);
    // Opened from the keyboard: focus goes into the card (its close button), and Esc or that button brings it back to the anchor.
    if (anchor.matches?.(':focus-visible')) pop.querySelector('button')?.focus({ preventScroll: true });
    let r = null;
    try { ({ result: r } = await host.request('explain', { metric })); }
    catch { if (openFor === metric) swap(head('Why?'), h('div', { class: 'sub' }, 'The model could not work this out right now.')); return; }
    if (openFor !== metric || !r) return;
    announce(`${r.label}. ${r.sentence}`);
    const maxAbs = Math.max(1e-6, ...r.contributions.map((c) => Math.abs(c.delta)), Math.abs(r.total));
    const tiny = Math.pow(10, -r.digits) * 0.5;
    const shown = r.contributions.filter((c) => Math.abs(c.delta) >= tiny).slice(0, 8);
    // The changes reverted one at a time do not add up to the whole (they interact): the rest is a row
    // of its own, so the bars always sum to the change shown above them.
    const rest = r.total - shown.reduce((a, c) => a + c.delta, 0);
    if (shown.length && Math.abs(rest) >= Math.max(tiny, 0.05 * Math.abs(r.total))) shown.push({ label: 'Interaction and other', delta: rest, other: true });
    // A short name on the row ("Cirrhosis"), the full one with its amount in the tooltip ("Cirrhosis 85%").
    const short = (l) => l.replace(/\s[+×]?[\d.]+(\s?(%|mm|mL|L|g\/dL))?$/, '');
    const h0 = pop.offsetHeight, t0 = pop.style.top;
    const rows = shown.map((c) => {
      const wpct = (Math.abs(c.delta) / maxAbs) * 50;
      const bar = h('div', { class: 'wf-bar' }, h('i', { style: { left: c.delta >= 0 ? '50%' : `${50 - wpct}%`, width: `${Math.max(1, wpct)}%`, background: c.other ? 'var(--text-3)' : c.delta >= 0 ? 'var(--danger)' : 'var(--accent)' } }));
      return h('div', { class: 'wf-row' }, h('span', { class: 'lab', title: c.label }, short(c.label)), bar, h('span', { class: 'val' }, (c.delta >= 0 ? '+' : '−') + fmt(Math.abs(c.delta), r.digits)));
    });
    swap(
      head(r.label),
      h('div', { class: 'sentence' }, r.sentence),
      rows.length ? h('div', { class: 'waterfall' }, h('div', { class: 'overline', style: { marginBottom: '2px' } }, `Contribution of each change · ${r.unit}`), ...rows,
        h('div', { class: 'ctl-sub', style: { marginTop: '2px' } }, 'Estimated by reverting each change on its own. Red raises the value, blue lowers it, gray is what they add together.')) : null,
      r.formula ? h('div', { class: 'formula' }, r.formula) : null,
    );
    place(anchor);
    // The answer takes the waiting lines' place by growing (or shrinking) the card to its height, the words fading in,
    // rather than the card jumping to a new size (P20).
    // (By transform: the card takes its new size and place at once and its paper glides there from the old in pieces, plate-glide.js;
    // nothing is laid out per frame. The words come in as the paper is nearly there, so they never show past it.)
    const h1 = pop.offsetHeight, glide = pop.animate && h0 && Math.abs(h1 - h0) > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (glide) {
      glideEnd?.();
      const w = pop.offsetWidth, dy = (parseFloat(t0) || 0) - (parseFloat(pop.style.top) || 0);
      glideEnd = glidePlate(pop, { x: 0, y: dy, w, h: h0 }, { x: 0, y: 0, w, h: h1 }, { R: 16, duration: D_SMALL, easing: EASE_MOVE, done: () => { glideEnd = null; } });
    }
    for (const k of pop.children) if (k.tagName !== 'HEADER' && !k.classList.contains('pg-piece')) k.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, delay: glide ? D_FLIP : 0, easing: EASE_ARRIVE, fill: 'backwards' });
  }
  let glideEnd = null;
  // It fades out as it came in (it vanished in one frame: P20).
  let leaveT = 0;
  function close() {
    if (pop.classList.contains('show')) {
      leaveFromHere(pop, () => { pop.classList.remove('show'); pop.classList.add('leaving'); });
      clearTimeout(leaveT); leaveT = setTimeout(() => pop.classList.remove('leaving'), 200);
    }
    openFor = null; anchorEl?.focus?.({ preventScroll: true }); anchorEl = null;
  }
  // (Capture: one Esc closes this card and only this card; the page's own Esc, which clears the selection it was opened from, does not also run. Not while Search has the key: its Esc is the one that counts.)
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.classList.contains('show') && !e.target.closest?.('.pal-back')) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
  addEventListener('pointerdown', (e) => { if (pop.classList.contains('show') && !pop.contains(e.target) && !e.target.closest('.metric, .finding, .vital, .btn, .link')) close(); });
  return { open, close };
}
