// Home: where a session starts. Four doors: explore a patient, take a lesson, manage a case, or
// present to a class. It replaces the mode tabs and the first-run welcome; the brand mark
// brings it back. A lesson or case then runs in the ordinary workspace with a slim banner.

import { store } from './store.js?v=4bf5a96a9d';
import { h, svgIcon, icon } from './util.js?v=13768f12bf';
import { LESSONS } from './learn.js?v=7a901c69eb';
import { CASES } from './cases.js?v=7f74ef142f';
import { t } from '../i18n/i18n.js?v=743b542534';
import { exportCSV, exportXAPI, learnerName, setLearnerName, records } from './records.js?v=26ab8fb634';
import { SNAPSHOTS, PATH } from './snapshots.js?v=85ffc8d0f9';
import { pressureColor } from './colormap.js?v=fa78a29bc0';

const GROUP_COLOR = { Normal: 'var(--ok)', Prehepatic: 'var(--s1)', Presinusoidal: 'var(--s7)', Sinusoidal: 'var(--s5)', Postsinusoidal: 'var(--s2)', Posthepatic: 'var(--s4)', Cardiac: 'var(--s8)' };
// Where each group's resistance sits along the pathway from the gut to the heart.
const GROUP_WHERE = { Normal: 'No obstruction', Prehepatic: 'Before the liver', Presinusoidal: 'In the portal tracts', Sinusoidal: 'In the sinusoids', Postsinusoidal: 'At the central veins', Posthepatic: 'Hepatic veins and IVC', Cardiac: 'The right heart' };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// A patient's pressure profile from the gut to the right atrium (a hydraulic grade line): blood
// runs downhill, and the steepest fall is where the resistance sits.
function profile(snap) {
  const W = 180, H = 56, pad = 3, max = 30;
  const x = (i) => pad + (i * (W - 2 * pad)) / (snap.P.length - 1);
  const y = (p) => H - pad - (Math.max(0, Math.min(max, p)) / max) * (H - 2 * pad - 4);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hp-prof', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  for (const t of [10, 20]) svg.append(sv('line', { x1: pad, x2: W - pad, y1: y(t), y2: y(t), class: 'hp-grid' }));
  let drop = 0, at = 0;
  for (let i = 1; i < snap.P.length; i++) { const d = snap.P[i - 1] - snap.P[i]; if (d > drop) { drop = d; at = i; } }
  const pts = snap.P.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  svg.append(sv('polygon', { points: `${x(0)},${H - pad} ${pts.join(' ')} ${x(snap.P.length - 1)},${H - pad}`, class: 'hp-area' }));
  if (drop > 5) svg.append(sv('rect', { x: x(at - 1), y: pad - 2, width: x(at) - x(at - 1), height: H - 2 * pad + 2, rx: 3, class: 'hp-drop' }));
  for (let i = 1; i < snap.P.length; i++) {
    svg.append(sv('line', { x1: x(i - 1), y1: y(snap.P[i - 1]), x2: x(i), y2: y(snap.P[i]), stroke: pressureColor((snap.P[i - 1] + snap.P[i]) / 2), class: 'hp-line' + (i === at && drop > 5 ? ' fall' : '') }));
  }
  snap.P.forEach((p, i) => svg.append(sv('circle', { cx: x(i), cy: y(p), r: 2.1, fill: pressureColor(p), class: 'hp-dot' })));
  return svg;
}
function patientCard(p, cur, onPreset) {
  const snap = SNAPSHOTS[p.id];
  const sev = !snap ? '' : snap.hvpg >= 12 ? 'high' : snap.hvpg >= 10 ? 'mid' : snap.hvpg > 5 ? 'low' : 'ok';
  const facts = snap ? h('span', { class: 'hp-facts' },
    h('span', { class: 'hp-chip ' + sev, title: 'Hepatic venous pressure gradient' }, 'HVPG ', h('b', {}, snap.hvpg.toFixed(snap.hvpg < 10 ? 1 : 0))),
    h('span', { class: 'hp-chip', title: 'Portal vein pressure' }, 'PV ', h('b', {}, Math.round(snap.pv))),
    snap.pvFlow < -0.05 ? h('span', { class: 'hp-chip rev', title: 'Portal flow runs away from the liver' }, 'Hepatofugal') : Math.abs(snap.pvFlow) <= 0.05 ? h('span', { class: 'hp-chip rev', title: 'Almost no portal flow' }, 'Stagnant') : null,
    snap.ascites >= 0.5 ? h('span', { class: 'hp-chip', title: 'Ascites volume' }, 'Ascites ', h('b', {}, `${snap.ascites.toFixed(1)} L`)) : null) : null;
  return h('button', { class: 'home-item hp' + (p.id === cur ? ' cur' : ''), onclick: () => onPreset(p.id), title: p.summary },
    h('span', { class: 't' }, p.label),
    snap ? profile(snap) : null,
    facts,
    h('span', { class: 'd' }, p.summary));
}

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };

export function createHome({ el, brandMark, onPreset, onLesson, onCase, onPresenter, onClose, onClosed }) {
  let tab = 'explore';
  function render() {
    const st = store.get();
    const done = read('pps.lessons', '{}');
    const best = read('pps.caseScores', '{}');
    const tabs = [['explore', 'explore', t('home.explore'), t('home.explore.d')],
      ['learn', 'book', t('home.lessons'), `${LESSONS.filter((l) => done[l.id]).length} / ${LESSONS.length} · predict, observe, explain`],
      ['cases', 'case', t('home.cases'), t('home.cases.d')],
      ['present', 'projector', t('home.presenter'), t('home.presenter.d')]];
    const nav = h('nav', { class: 'home-doors', 'aria-label': 'Start' }, tabs.map(([id, ic, t, d]) => {
      const b = h('button', { class: 'home-door', 'aria-pressed': String(tab === id) }, h('span', { class: 'hd-ic' }, svgIcon(ic)), h('span', { class: 'hd-t' }, t), h('span', { class: 'hd-d' }, d));
      b.addEventListener('click', () => { tab = id; render(); });
      return b;
    }));
    let body;
    if (tab === 'explore') {
      const groups = {};
      for (const p of st.presetList || []) (groups[p.group] ||= []).push(p);
      // A map of the disease: patients grouped by where the resistance sits, from the gut to the
      // heart, each drawn as its own pressure profile.
      const axis = h('div', { class: 'hp-axis', 'aria-hidden': 'true' }, PATH.map(([, l]) => h('span', {}, l)));
      body = h('div', {},
        h('div', { class: 'hp-intro' },
          h('p', {}, 'Each line is a patient’s pressure from the gut to the heart. Blood runs downhill; ', h('b', {}, 'the steepest fall (shaded) is where the resistance sits.')),
          h('div', { class: 'hp-key' }, axis)),
        h('div', { class: 'home-grid scen' }, Object.entries(groups).map(([g, ps]) => h('section', { class: 'home-group' },
          h('h3', {}, h('i', { style: { background: GROUP_COLOR[g] || 'var(--text-3)' } }), g, h('small', {}, GROUP_WHERE[g] || '')),
          ps.map((p) => patientCard(p, st.presetId, onPreset))))));
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
    // Assessment: every finished lesson and case is recorded on this device for export.
    if (tab === 'learn' || tab === 'cases') {
      const name = h('input', { class: 'input', type: 'text', placeholder: 'Your name (for the export)', value: learnerName(), 'aria-label': 'Learner name' });
      name.addEventListener('change', () => setLearnerName(name.value.trim()));
      const n = records().length;
      body = h('div', {}, body, h('div', { class: 'home-records' }, h('span', { class: 'overline' }, `Your records · ${n} attempt${n === 1 ? '' : 's'}`), name,
        h('button', { class: 'btn sm', disabled: !n, onclick: exportCSV }, 'Export CSV'), h('button', { class: 'btn sm', disabled: !n, onclick: exportXAPI }, 'Export xAPI')));
    }
    el.replaceChildren(h('div', { class: 'home-inner' },
      h('header', { class: 'home-head' }, brandMark(), h('div', {}, h('h1', {}, t('app.name')), h('p', {}, t('app.tagline'))),
        h('button', { class: 'ib home-x', 'aria-label': 'Close', title: 'Back to the model (Esc)', onclick: onClose }, icon('close'))),
      nav, h('div', { class: 'home-body' }, body),
      h('p', { class: 'disclaimer' }, t('app.disclaimer'))));
  }
  return {
    open(t) { if (t) tab = t; render(); el.hidden = false; document.getElementById('app').classList.add('home-open'); el.querySelector('.home-door[aria-pressed="true"]')?.focus({ preventScroll: true }); },
    close() { if (el.hidden) return; el.hidden = true; document.getElementById('app').classList.remove('home-open'); onClosed?.(); },
    isOpen: () => !el.hidden,
    render,
  };
}
