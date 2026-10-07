// Shared pieces for lessons and cases (see plans/lessons-cases-redesign.md §3 and the
// "Reusable mechanisms" section). Content files only declare data; these helpers draw it.
//
//   trustLine()           the one teaching-model sentence for the first screen of a lesson or case
//   teachChip()           small "Teaching model" chip for model-derived numbers
//   blindOn() / blindOff()  hide every number that would answer the open question, then restore
//   optionList(opts)      answers directly under the question: lettered options or direction buttons
//   compareChip(...)      "You said … · The patient showed …"
//   bindQuestionKeys(el)  keys 1 to 4 pick an option, Enter presses the primary button
//   mirrorMarker(...)     "?" then an arrow on the vessel the question is about

import { store } from './store.js?v=6209f4be01';
import { h } from './util.js?v=8aa5e5cdf1';

export const TRUST_LINE = 'Teaching model: shows how pressure and flow behave. It does not predict an individual patient.';
export const trustLine = () => h('p', { class: 'trust-line' }, TRUST_LINE);
export const teachChip = (text = 'Teaching model') => h('span', { class: 'teach-chip', title: TRUST_LINE }, text);

// ── Blind mode ─────────────────────────────────────────────────────────────────
// `imaging` is the existing anatomy-only switch (neutral color, no pressure labels, no Findings
// verdict, no readout values); the keys below hide the remaining numeric readouts. blindOff()
// puts back exactly what a case had set before, so the two never fight.
const BLIND_KEYS = ['pv', 'trueHVPG', 'ra', 'iap', 'model'];
export const MODEL_ONLY_EVENTS = ['CSPH', 'BLEED_RISK', 'RED_WALE', 'HIGH_SHUNT', 'LIVER_HYPOPERFUSION', 'INTRAHEPATIC_REVERSAL', 'CAUDATE', 'COLL_*', 'PV_STASIS', 'SV_REVERSAL', 'SMV_REVERSAL', 'HEPATOFUGAL_PV'];
let before = null;
export const isBlind = () => !!before;
export function blindOn() {
  if (before) return;
  const st = store.get();
  before = { hiddenReadouts: st.hiddenReadouts, hiddenEvents: st.hiddenEvents, imaging: st.imaging };
  store.set({ blind: true, imaging: true, hiddenReadouts: new Set([...(st.hiddenReadouts || []), ...BLIND_KEYS]), hiddenEvents: new Set([...(st.hiddenEvents || []), ...MODEL_ONLY_EVENTS]) });
}
export function blindOff() {
  if (!before) return;
  const b = before; before = null;
  store.set({ blind: false, ...b });
}

// ── Answers ────────────────────────────────────────────────────────────────────
const ARROW = '➜';
/**
 * The answer controls, placed directly under the question in the same card.
 *   options   strings
 *   picked    index (or array of indexes when multi), null until answered
 *   answer    right index/array; marks right/wrong only when reveal is true
 *   multi     toggle several, then press the caller's Commit button
 *   dir       direction buttons: options[0] is "forward" (arrow →), options[1] is "reverse" (arrow ←)
 *   onPick(i) called with the option index
 */
export function optionList({ options, picked = null, answer = null, reveal = false, locked = false, multi = false, dir = false, onPick }) {
  const isPicked = (i) => (Array.isArray(picked) ? picked.includes(i) : picked === i);
  const isRight = (i) => (Array.isArray(answer) ? answer.includes(i) : answer === i);
  return h('div', { class: 'opts' + (dir ? ' dir' : ''), role: multi ? 'group' : 'radiogroup', 'data-locked': locked ? '1' : '0' },
    options.map((o, i) => {
      const cls = ['opt'];
      if (isPicked(i)) cls.push('sel');
      if (reveal) { if (isRight(i)) cls.push('right'); else if (isPicked(i)) cls.push('wrong'); }
      return h('button', { class: cls.join(' '), disabled: locked, role: multi ? 'checkbox' : 'radio', 'aria-checked': String(isPicked(i)), 'data-i': String(i), onclick: () => onPick?.(i) },
        dir ? h('span', { class: 'dir-arrow', 'aria-hidden': 'true', style: { transform: i === 0 ? 'none' : 'scaleX(-1)' } }, ARROW) : h('span', { class: 'letter' }, 'ABCDE'[i]),
        h('span', {}, o));
    }));
}

/** "You said … · The patient showed …", green when they match and amber when they do not. */
export function compareChip({ said, showed, ok, sayLabel = 'You said', showLabel = 'The patient showed' }) {
  return h('div', { class: 'cmp-chip ' + (ok ? 'right' : 'wrong'), role: 'status' },
    h('span', {}, h('i', {}, sayLabel), ' ', h('b', {}, said)), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), h('span', {}, h('i', {}, showLabel), ' ', h('b', {}, showed)));
}

/** Keys 1 to 4 pick the Nth enabled option of the first open question inside `root()`; Enter presses the primary button. Returns an unbind function. */
export function bindQuestionKeys(root) {
  const on = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    const el = root(); if (!el || !el.isConnected) return;
    if (/^[1-4]$/.test(e.key)) {
      const group = [...el.querySelectorAll('.opts')].find((g) => g.dataset.locked !== '1');
      const b = group?.querySelectorAll('button.opt')[Number(e.key) - 1];
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') {
      const p = el.querySelector('.primary-action:not(:disabled), .lesson-foot .btn.primary:not(:disabled)');
      if (p) { e.preventDefault(); p.click(); }
    }
  };
  addEventListener('keydown', on);
  return () => removeEventListener('keydown', on);
}

// ── The vessel the question is about ───────────────────────────────────────────
/**
 * A marker on the figure that mirrors the question: a pulsing "?" before the answer, then the
 * student's arrow and, once revealed, the real one. Not interactive. `anchor` is stage.anchorFor().
 */
export function mirrorMarker(anchor) {
  const pts = anchor.path, p0 = pts[0], p1 = pts[pts.length - 1];
  const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
  const arrow = (cls, dir) => h('span', { class: 'dm-arrow ' + cls, style: { transform: `rotate(${ang + (dir > 0 ? 0 : 180)}deg)` } }, ARROW);
  const el = h('div', { class: 'dir-mirror', style: { left: `${anchor.x}px`, top: `${anchor.y}px` }, 'aria-hidden': 'true' }, h('span', { class: 'dm-q' }, '?'));
  return {
    el,
    pick(dir) { el.querySelector('.dm-q')?.remove(); el.querySelector('.dm-pick')?.remove(); el.append(arrow('dm-pick', dir)); },
    reveal(dir) { el.querySelector('.dm-true')?.remove(); el.append(arrow('dm-true', dir)); el.classList.add('revealed'); },
  };
}
