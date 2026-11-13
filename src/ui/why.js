// "Why?" popover (blueprint §9.3): one causal sentence, a contribution waterfall and the formula.

import { cancelMoves } from './num-move.js';
import { classSoon } from './class-soon.js';
import { host } from './host.js';
import { h, fmt, svgIcon, announce, claimSurface, releaseSurface, placeAt, swipeSheet, STACK_MQ } from './util.js';
import { leaveFromHere } from './menu-leave.js';
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_MOVE } from './ease.js';
import { restRemove } from './rest-pass.js';
import { glidePlate } from './plate-glide.js';
import { sheetLayer } from './sheet-layer.js';
import { reduceMotionMQ, afterMs } from './motion.js';

export function createWhy(pop) {
  if (pop?.isConnected) sheetLayer().append(pop);   // (laid in the one sheet layer, cut on the dock's top line: sheet-layer.js)
  // (The one surface on top: util.js claimSurface routes Esc and the outside tap to it; a metric, finding, vital, button or link is not 'outside', it opens the next card.)
  const me = { get anchor() { return anchorEl; }, el: pop, box: () => (pop.classList.contains('as-sheet') ? null : pop.getBoundingClientRect()), close: () => close(), has: (n) => pop.contains(n) || !!n.closest?.('.metric, .finding, .vital, .btn, .link') };
  let openFor = null, anchorEl = null;
  // (Placed by util.js placeAt, the one placer: under the button, centred on it, or above it where there is no room. On a phone, upright
  // or an upright iPad, it is a short bottom sheet instead, as every other menu is there: CSS places it, with a scrim that takes the tap,
  // and a pull down closes it. A phone held sideways keeps the card, as a Mac does.)
  let placedTop = 0, scrim = null;
  const sheetMQ = matchMedia(STACK_MQ), asSheet = () => pop.classList.contains('as-sheet');
  swipeSheet(pop, () => close(), asSheet);
  function place(anchor) {
    if (asSheet()) return;
    placedTop = placeAt(pop, anchor, { align: 'center', gap: 10, margin: 12 });
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
    const sheet = sheetMQ.matches;
    // (A card put away by a swipe was left drawn off the screen: that, and its swiped mark, are cleared before it comes in again.)
    for (const a of pop.getAnimations()) a.cancel();
    cancelMoves(pop);   // (and the swipe's held number, so its glass is not drawn off by the last let-go: num-move.js)
    delete pop.dataset.swiped; pop.style.translate = ''; pop.style.transform = '';
    pop.classList.toggle('as-sheet', sheet); placedTop = 0;
    if (sheet && !scrim) { scrim = h('div', { class: 'um-scrim why-scrim' }); sheetLayer().append(scrim); }
    pop.replaceChildren(head('Why?'), h('div', { class: 'sub' }, 'Calculating the contributions…'), h('div', { class: 'skeleton', style: { width: '90%' } }), h('div', { class: 'skeleton', style: { width: '70%' } }), h('div', { class: 'skeleton', style: { width: '80%' } }));
    pop.classList.add('show');
    claimSurface(me);
    place(anchor);
    // Opened from the keyboard: focus goes into the card (its close button), and Esc or that button brings it back to the anchor.
    if (anchor.matches?.(':focus-visible')) pop.querySelector('button')?.focus({ preventScroll: true });
    let r = null;
    try { ({ result: r } = await host.request('explain', { metric })); }
    catch { if (openFor === metric) swap(head('Why?'), h('div', { class: 'sub' }, 'The model could not calculate this right now.')); return; }
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
    const h0 = pop.offsetHeight, t0 = placedTop;
    const rows = shown.map((c) => {
      const wpct = (Math.abs(c.delta) / maxAbs) * 50;
      const bar = h('div', { class: 'wf-bar' }, h('i', { style: { left: c.delta >= 0 ? '50%' : `${50 - wpct}%`, width: `${Math.max(1, wpct)}%`, background: c.other ? 'var(--text-3)' : c.delta >= 0 ? 'var(--danger)' : 'var(--accent)' } }));
      return h('div', { class: 'wf-row' }, h('span', { class: 'lab', title: c.label }, short(c.label)), bar, h('span', { class: 'val' }, (c.delta >= 0 ? '+' : '−') + fmt(Math.abs(c.delta), r.digits)));
    });
    swap(
      head(r.label),
      h('div', { class: 'sentence' }, r.sentence),
      rows.length ? h('div', { class: 'waterfall' }, h('div', { class: 'overline', style: { marginBottom: '2px' } }, `Contribution of each change · ${r.unit}`), ...rows,
        h('div', { class: 'ctl-sub', style: { marginTop: '2px' } }, 'Estimated by reverting each change on its own. Red raises the value, blue lowers it, gray is the interaction between changes and other effects.')) : null,
      r.formula ? h('div', { class: 'formula' }, r.formula) : null,
    );
    place(anchor);
    // The answer takes the waiting lines' place by growing (or shrinking) the card to its height, the words fading in,
    // rather than the card jumping to a new size (P20).
    // (By transform: the card takes its new size and place at once and its paper glides there from the old in pieces, plate-glide.js;
    // nothing is laid out per frame. The words come in as the paper is nearly there, so they never show past it.)
    const h1 = pop.offsetHeight, glide = !asSheet() && pop.animate && h0 && Math.abs(h1 - h0) > 1 && !reduceMotionMQ.matches;
    if (glide) {
      glideEnd?.();
      const w = pop.offsetWidth, dy = t0 - placedTop;
      glideEnd = glidePlate(pop, { x: 0, y: dy, w, h: h0 }, { x: 0, y: 0, w, h: h1 }, { R: 16, duration: D_SMALL, easing: EASE_MOVE, done: () => { glideEnd = null; } });
    }
    for (const k of pop.children) if (k.tagName !== 'HEADER' && !k.classList.contains('pg-piece')) k.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, delay: glide ? D_FLIP : 0, easing: EASE_ARRIVE, fill: 'backwards' });
  }
  let glideEnd = null;
  // It fades out as it came in (it vanished in one frame: P20).
  let leaveT = 0;
  function close() {
    if (pop.classList.contains('show')) {
      // (A card swiped away is already sliding down: it leaves as it is.)
      if (pop.dataset.swiped) { pop.classList.remove('show'); pop.classList.add('leaving'); }
      else leaveFromHere(pop, () => { pop.classList.remove('show', 'pulling'); pop.classList.add('leaving'); });   // (.pulling, left by an earlier pull, would hold off the exit: menu recs C1)
      clearTimeout(leaveT); leaveT = setTimeout(() => classSoon(pop, 'leaving', false), afterMs(asSheet() ? D_SMALL : D_FLIP));
    }
    if (scrim) { const sc = scrim; scrim = null; leaveFromHere(sc, () => sc.classList.add('out')); setTimeout(() => restRemove(sc), afterMs(D_SMALL)); }
    releaseSurface(me);
    openFor = null; anchorEl?.focus?.({ preventScroll: true }); anchorEl = null;
  }
  return { open, close };
}
