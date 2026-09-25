// Home: where a session starts. Four doors: explore a patient, take a lesson, manage a case, or
// present to a class. It replaces the mode tabs and the first-run welcome; the brand mark
// brings it back. A lesson or case then runs in the ordinary workspace with a slim banner.

import { store } from './store.js?v=609dde7847';
import { h, svgIcon, icon } from './util.js?v=61d6f9c200';
import { LESSONS } from './learn.js?v=64140e2389';
import { CASES } from './cases.js?v=f5f5cb7bcb';

const GROUP_COLOR = { Normal: 'var(--ok)', Prehepatic: 'var(--s1)', Presinusoidal: 'var(--s7)', Sinusoidal: 'var(--s5)', Postsinusoidal: 'var(--s2)', Posthepatic: 'var(--s4)', Cardiac: 'var(--s8)' };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };

export function createHome({ el, brandMark, onPreset, onLesson, onCase, onPresenter, onClose }) {
  let tab = 'explore';
  function render() {
    const st = store.get();
    const done = read('pps.lessons', '{}');
    const best = read('pps.caseScores', '{}');
    const tabs = [['explore', 'explore', 'Explore a patient', 'Start healthy, or open any of 16 patients.'],
      ['learn', 'book', 'Lessons', `${LESSONS.filter((l) => done[l.id]).length} of ${LESSONS.length} complete · predict, observe, explain`],
      ['cases', 'case', 'Cases', 'A bleed at 3 a.m. and three diagnostic puzzles, scored'],
      ['present', 'projector', 'Presenter', 'Step through a live model in front of a class']];
    const nav = h('nav', { class: 'home-doors', 'aria-label': 'Start' }, tabs.map(([id, ic, t, d]) => {
      const b = h('button', { class: 'home-door', 'aria-pressed': String(tab === id) }, h('span', { class: 'hd-ic' }, svgIcon(ic)), h('span', { class: 'hd-t' }, t), h('span', { class: 'hd-d' }, d));
      b.addEventListener('click', () => { tab = id; render(); });
      return b;
    }));
    let body;
    if (tab === 'explore') {
      const groups = {};
      for (const p of st.presetList || []) (groups[p.group] ||= []).push(p);
      body = h('div', { class: 'home-grid scen' }, Object.entries(groups).map(([g, ps]) => h('section', { class: 'home-group' },
        h('h3', {}, h('i', { style: { background: GROUP_COLOR[g] || 'var(--text-3)' } }), g),
        ps.map((p) => h('button', { class: 'home-item' + (p.id === st.presetId ? ' cur' : ''), onclick: () => onPreset(p.id) }, h('span', { class: 't' }, p.label), h('span', { class: 'd' }, p.summary))))));
    } else if (tab === 'learn') {
      body = h('div', { class: 'home-grid' }, LESSONS.map((l, i) => h('button', { class: 'home-item lesson' + (done[l.id] ? ' done' : ''), onclick: () => onLesson(l.id) },
        h('span', { class: 'meta' }, h('span', { class: 'num' }, done[l.id] ? svgIcon('check') : String(i + 1)), `${l.minutes} min`, done[l.id]?.score != null ? h('span', { class: 'score' }, `${done[l.id].score} %`) : done[l.id] ? h('span', { class: 'score' }, 'Done') : null),
        h('span', { class: 't' }, l.title), h('span', { class: 'd' }, l.summary))));
    } else if (tab === 'cases') {
      body = h('div', { class: 'home-grid' }, CASES.map((c) => h('button', { class: 'home-item case', onclick: () => onCase(c.id) },
        h('span', { class: 'meta' }, c.level, best[c.id] != null ? h('span', { class: 'score' }, `Best ${best[c.id]}`) : null),
        h('span', { class: 't' }, c.title), h('span', { class: 'd' }, c.summary))));
    } else {
      body = onPresenter();
    }
    el.replaceChildren(h('div', { class: 'home-inner' },
      h('header', { class: 'home-head' }, brandMark(), h('div', {}, h('h1', {}, 'Portal Pressure Simulator'), h('p', {}, 'A living, physics-based model of the portal circulation. Raise a resistance anywhere from the gut to the heart and blood finds another way.')),
        h('button', { class: 'ib home-x', 'aria-label': 'Close', title: 'Back to the model (Esc)', onclick: onClose }, icon('close'))),
      nav, h('div', { class: 'home-body' }, body),
      h('p', { class: 'disclaimer' }, 'Educational simulation. Simplified model with illustrative values; not for diagnosis or treatment decisions.')));
  }
  return {
    open(t) { if (t) tab = t; render(); el.hidden = false; document.getElementById('app').classList.add('home-open'); el.querySelector('.home-door[aria-pressed="true"]')?.focus({ preventScroll: true }); },
    close() { el.hidden = true; document.getElementById('app').classList.remove('home-open'); },
    isOpen: () => !el.hidden,
    render,
  };
}
