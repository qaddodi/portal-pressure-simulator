// Deck visuals V31 and V17 (package E): boxes joined by arrows.
//
// V31, a mechanism chain: three to six boxes, each one step of a mechanism. A box can carry a live value (a fingerprint key),
// shown with its arrow against normal and in its rating colour; the box the slide is about is lit and the rest stay quiet.
//   tool: { kind: 'chain', steps: [['Scarred liver'], ['Portal pressure', 'pv'], ['Collaterals open'], ['Blood around the liver', 'shunt']], lit: 3 }
//   visual: 'chain', chain: { steps: [...], lit: 3 }            (a full panel on a summary slide)
// lit: the box's number, counted from 1 (or a list of them). A wide card runs the boxes left to right; a narrow one or a phone
// stacks them.
//
// V17, a guideline flowchart: boxes and lines whose words the deck sets (and sources), with the branch the case takes lit from
// the model's own numbers.
//   visual: 'flowchart', flow: 'csph' | { t, note?, then: [{ when, t, note?, then? }, …] }, case?: '<slide id>'
//   tool: { kind: 'flowchart', flow: 'csph' }
// A node's `when` lists conditions [key, op, value] (visual-plane.js holds); the first child whose conditions hold is the
// branch taken, and a child with no `when` is the one taken otherwise. On a summary the case is the slide named by `case`, or
// the slide's own state; in the data card it is the slide's case, following a what-if slider or a compare button.

import { h, fmt } from './util.js?v=8813192ea2';
import { TILE, rateOf, dirAbs } from './table-marks.js?v=810c0a1575';
import { holds } from './visual-plane.js?v=2f94fa77a5';

// ── V31: the chain ──
/** The chain's steps as { t, key }: from [words, key?], { t, key } or plain words; at most six, empty ones left out. */
export function chainSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((x) => (Array.isArray(x) ? { t: x[0], key: x[1] || null } : typeof x === 'string' ? { t: x, key: null } : x && typeof x === 'object' ? { t: x.t, key: x.key || null } : null))
    .filter((x) => x && typeof x.t === 'string' && x.t.trim()).slice(0, 6);
}
/** The boxes lit, as indexes from 0 (lit counts from 1). */
export const litSet = (lit, n) => new Set([lit].flat().filter((k) => Number.isInteger(k) && k >= 1 && k <= n).map((k) => k - 1));
/** A box's value as its tile prints it: { text, dir, rate }, or null without a number. */
export function stepValue(key, f) {
  const v = key && f ? f[key] : null;
  if (v == null || !Number.isFinite(v)) return null;
  const t = TILE[key];
  return { text: fmt(v * (t?.x ?? 1), t?.d ?? 1) + (t?.u ? (t.u === '%' ? '%' : ` ${t.u}`) : ''), dir: dirAbs(key, f), rate: rateOf(key, f)[0] };
}
// The table's arrows, drawn the same way: a solid head on a shaft; two for a large change; a short dash for normal.
const ARROW = (x, w) => `<path d="M${x} 15.2V7.4" stroke-width="2.5"/><path d="M${x} 1L${x + w} 8.2H${x - w}Z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/>`;
const SHAPE = { 1: ['0 0 12 16', ARROW(6, 4.4)], 2: ['0 0 19 16', ARROW(4.6, 3.9) + ARROW(14.4, 3.9)], 0: ['0 0 12 16', '<path d="M2.8 8.6H9.2" stroke-width="1.6" stroke-linecap="round"/>'] };
function arrowEl(n) {
  const el = document.createElement('span'), [box, d] = SHAPE[Math.min(2, Math.abs(n))];
  el.className = `pze-arr${n < 0 ? ' dn' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="${box}" focusable="false" stroke="currentColor">${d}</svg>`;   // (constant markup, never user text)
  return el;
}
const WORD = { 2: 'well above normal', 1: 'above normal', 0: 'normal', '-1': 'below normal', '-2': 'well below normal' };

/** The chain's element and its update with a fingerprint (the values in the boxes). */
export function chainEl(steps0, lit0) {
  const steps = chainSteps(steps0), lit = litSet(lit0, steps.length);
  const vals = [];
  const el = h('ol', { class: 'pze-chain', 'data-n': String(steps.length) }, steps.map((s, i) => {
    const v = h('span', { class: 'pze-cv' });
    vals.push([s.key, v]);
    return h('li', { class: lit.has(i) ? 'on' : null, 'aria-current': lit.has(i) ? 'step' : null }, h('span', { class: 'pze-ct' }, s.t), s.key ? v : null);
  }));
  const set = (f) => {
    for (const [k, v] of vals) {
      if (!k) continue;
      const x = stepValue(k, f);
      if (!x) { v.replaceChildren(); continue; }
      v.dataset.rate = x.rate || '';
      const txt = v.querySelector('b');
      if (txt && txt.textContent === x.text && v.dataset.dir === String(x.dir)) continue;
      v.dataset.dir = String(x.dir);
      v.replaceChildren(arrowEl(x.dir), h('b', {}, x.text), h('span', { class: 'sr-only' }, `, ${WORD[x.dir]}`));
    }
  };
  // (Side by side while each box has room for its words, about 7 em; stacked, with arrows down, when it has not.)
  const fit = () => { const w = el.clientWidth, fs = parseFloat(getComputedStyle(el.firstElementChild || el).fontSize) || 14; if (w) el.classList.toggle('pze-v', w < steps.length * fs * 7.5); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(el);
  return { el, set };
}
export function chainVisual(s, ctx) {
  const c = s.chain && typeof s.chain === 'object' ? s.chain : null;
  if (!c) return null;
  const ch = chainEl(Array.isArray(c) ? c : c.steps, Array.isArray(c) ? s.lit : c.lit);
  ch.set(ctx?.fp);
  return h('div', { class: 'pz-visual pze-chainwrap' }, ch.el);
}
export function createChainTool() {
  const el = h('div', { class: 'pze-ctool' });
  let ch = null, sig = '', last = null;
  return {
    el,
    configure(t) {
      const k = JSON.stringify([t.steps, t.lit]);
      if (k === sig && ch) return;
      sig = k; ch = chainEl(t.steps, t.lit);
      el.replaceChildren(ch.el);
      if (last) ch.set(last);
    },
    pin(fp) { last = fp; ch?.set(fp); },
    clear() { last = null; },
  };
}

// ── V17: the flowchart ──
// CSPH in compensated advanced chronic liver disease, Baveno VIII (checked against guidelines/baveno8-aasld.md): 15 kPa or less with
// platelets 150 or more rules CSPH out (1.15); 25 kPa or more rules it in (1.16), but not in obese MASLD; in between, a model
// (ANTICIPATE) or spleen stiffness decides; under 20 kPa with platelets 150 or more, or a spleen stiffness under 40 kPa, spares the
// screening scope in a patient not on a beta-blocker (1.19); stiffness and platelets are repeated every year (1.9). CSPH calls for a
// beta-blocker, carvedilol preferred, and a patient on one needs no screening scope. The model has no spleen stiffness, so the
// case's branch is chosen on liver stiffness and platelets alone; the spleen rule is in the note.
export const FLOWS = {
  csph: {
    t: 'Compensated advanced chronic liver disease', note: 'Stiffness and platelets',
    then: [
      { when: [['lsm', '<=', 15], ['plt', '>=', 150]], t: 'CSPH ruled out', note: '15 kPa or less, platelets 150 or more',
        then: [{ t: 'No screening scope; repeat both every year' }] },
      { when: [['lsm', '>=', 25]], t: 'CSPH ruled in', note: '25 kPa or more (not in obese MASLD)',
        then: [{ t: 'Beta-blocker, carvedilol preferred; no screening scope' }] },
      { t: 'Gray zone', note: 'A model or spleen stiffness decides',
        then: [{ when: [['lsm', '<', 20], ['plt', '>=', 150]], t: 'No screening scope', note: 'Under 20 kPa, platelets 150 or more; or spleen stiffness under 40 kPa' }, { t: 'Screening scope, unless on a beta-blocker' }] },
    ],
    source: 'Baveno VIII 1.9, 1.15, 1.16, 1.19',
  },
};
export const flowOf = (f) => (typeof f === 'string' ? FLOWS[f] || null : f && typeof f === 'object' && typeof f.t === 'string' ? f : null);
/** The nodes the case passes through, root first: at each node, the first child whose conditions hold (a child with no
 *  conditions is taken when none of the others is). Stops where no child is taken (a case with no numbers yet). */
export function flowPath(tree, f) {
  const path = [];
  let n = tree;
  while (n) {
    path.push(n);
    const kids = Array.isArray(n.then) ? n.then : [];
    if (!kids.length || !f) break;
    n = kids.find((k) => k.when && holds(k.when, f)) || kids.find((k) => !k.when) || null;
  }
  return path;
}
/** How many boxes the tree has across at its widest (its leaves). */
export const flowLeaves = (n) => (Array.isArray(n?.then) && n.then.length ? n.then.reduce((s, k) => s + flowLeaves(k), 0) : 1);

const SVGNS = 'http://www.w3.org/2000/svg';
export function flowEl(tree) {
  const boxes = new Map();
  const node = (n) => {
    const box = h('div', { class: 'pze-fb' }, h('b', {}, n.t), n.note ? h('span', {}, n.note) : null);
    const li = h('li', {}, box, Array.isArray(n.then) && n.then.length ? h('ul', {}, n.then.map(node)) : null);
    boxes.set(n, li);
    return li;
  };
  const links = document.createElementNS(SVGNS, 'svg'), ul = h('ul', { class: 'pze-tree' }, node(tree));
  links.setAttribute('class', 'pze-links'); links.setAttribute('aria-hidden', 'true');
  const el = h('div', { class: 'pze-flow', style: { '--leaves': String(flowLeaves(tree)) } }, links, ul, tree.source ? h('p', { class: 'pze-src' }, tree.source) : null);
  let on = new Set();
  // The lines between boxes, drawn where the boxes are (a narrow card's indented list draws its own, in CSS): down from each
  // parent, across its children, down into each; the case's way through drawn again on top in the lit colour.
  const draw = () => {
    const parts = [], lit = [];
    if (el.isConnected && getComputedStyle(ul).display === 'flex') {
      const o = el.getBoundingClientRect(), r = (n) => boxes.get(n).firstChild.getBoundingClientRect();
      const walk = (n) => {
        const kids = Array.isArray(n.then) ? n.then.filter((k) => boxes.get(k)?.firstChild.offsetParent) : [];
        if (!kids.length) return;
        const p = r(n), px = Math.round(p.left + p.width / 2 - o.left), py = p.bottom - o.top;
        const cs = kids.map((k) => { const c = r(k); return [k, Math.round(c.left + c.width / 2 - o.left), c.top - o.top]; });
        const my = Math.round((py + Math.min(...cs.map((c) => c[2]))) / 2), xs = cs.map((c) => c[1]);
        parts.push(`M${px} ${py}V${my}`, `M${Math.min(px, ...xs)} ${my}H${Math.max(px, ...xs)}`, ...cs.map(([, x, y]) => `M${x} ${my}V${y}`));
        for (const [k, x, y] of cs) if (on.has(n) && on.has(k)) lit.push(`M${px} ${py}V${my}H${x}V${y}`);
        kids.forEach(walk);
      };
      walk(tree);
    }
    const path = (d, cls) => { const e = document.createElementNS(SVGNS, 'path'); e.setAttribute('d', d); if (cls) e.setAttribute('class', cls); return e; };
    links.replaceChildren(...(parts.length ? [path(parts.join(''))] : []), ...(lit.length ? [path(lit.join(''), 'on')] : []));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => requestAnimationFrame(draw)).observe(el);
  const set = (f) => {
    on = new Set(flowPath(tree, f));
    const decided = on.size > 1;
    if (!decided) on = new Set();
    el.classList.toggle('decided', decided);
    for (const [n, li] of boxes) { li.classList.toggle('on', on.has(n)); li.toggleAttribute('aria-current', on.has(n) && !n.then?.length); }
    requestAnimationFrame(draw);
  };
  return { el, set };
}
export function flowVisual(s, ctx) {
  const tree = flowOf(s.flow);
  if (!tree) return null;
  const fl = flowEl(tree);
  // (The case: the slide named by `case`, else the slide's own state. A slide not yet computed lights its path when it is.)
  const fpNow = () => (s.case ? ctx?.fpOf?.(s.case) : ctx?.fp) ?? null;
  fl.set(fpNow());
  if (!fpNow() && ctx?.shown) {
    let n = 0;
    const again = () => { if (n++ > 100) return; const f = fpNow(); if (f) fl.set(f); else setTimeout(again, 300); };
    setTimeout(again, 300);
  }
  return h('div', { class: 'pz-visual pze-flowwrap' }, fl.el);
}
export function createFlowTool() {
  const el = h('div', { class: 'pze-ftool' });
  let fl = null, sig = '', last = null;
  return {
    el,
    configure(t) {
      const tree = flowOf(t.flow ?? 'csph'), k = JSON.stringify(t.flow ?? 'csph');
      if (k === sig && fl) return;
      sig = k; fl = tree ? flowEl(tree) : null;
      el.replaceChildren(...(fl ? [fl.el] : []));
      if (last) fl?.set(last);
    },
    pin(fp) { last = fp; fl?.set(fp); },
    clear() { last = null; },
  };
}
