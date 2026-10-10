// Home is the course page: "Continue" with the next unit, the units with their progress (each opens
// when the one before is done), the review card for a returning student, and a link to Explore.
// Instructors also get "Unlock all units" and the lesson and case libraries and the presenter.
// The other pages (explore, learn, drill, cases, present) open from here and lead back to it.

import { store } from './store.js?v=25cbe77a76';
import { h, svgIcon, icon } from './util.js?v=e803df99cd';
import { LESSONS } from './learn.js?v=6bbb5475b3';
import { CASES } from './cases.js?v=9543b1fdde';
import { createDrill, drillProgress, DRILL_TITLE, ROUNDS } from './drill.js?v=415aede895';
import { skillsPath, reviewCard } from './practice.js?v=22ad13c319';
import { UNITS, FINAL, PARTS, course } from './course.js?v=3bf3617fd0';
import { openExam } from './exam.js?v=237348df1c';
import { t } from '../i18n/i18n.js?v=96bbcced4d';
import { exportCSV, exportXAPI, learnerName, setLearnerName, records } from './records.js?v=50fb9dd463';
import { SNAPSHOTS, PATH } from './snapshots.js?v=47b3a3415c';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { AUTHOR, AUTHOR_URL } from '../version.js?v=1ecade66d2';

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

// Who is using the simulator (chosen in Settings): Student sees the course and a simpler Explore;
// Instructor adds the physiology knobs, the case and lesson libraries, the presenter and unlocking units.
export const ROLES = [['student', 'Student', 'A simpler set of controls, with the HVPG shown from the start.'], ['instructor', 'Instructor', 'All controls, including the physiology settings and resistances.']];

// One row of the unit list: its number (a check once done, a lock until it opens), title, objective and time.
function unitRow(u, onUnit) {
  const st = course.state(u.id), done = course.progress().done[u.id], at = course.progress().at[u.id];
  const mark = st === 'done' ? svgIcon('check') : st === 'locked' ? svgIcon('lock') : String(u.n ?? '★');
  return h('button', { class: 'cu-row', 'data-state': st, disabled: st === 'locked', title: st === 'locked' ? 'Opens when the unit before it is done' : u.objective, onclick: () => onUnit(u.id) },
    h('span', { class: 'cu-n', 'aria-hidden': 'true' }, mark),
    h('span', { class: 'cu-b' }, h('span', { class: 'cu-t' }, u.n ? `${u.n}. ` : '', u.title), h('span', { class: 'cu-d' }, u.objective)),
    h('span', { class: 'cu-m' }, done ? h('b', {}, `${done.score} %`) : at > 0 && st === 'open' ? h('b', { class: 'cu-go' }, 'In progress') : null, h('small', {}, u.draft ? 'Draft' : `${u.minutes} min`)));
}
function coursePage({ onUnit, go, instructor, render }) {
  const next = course.next(), n = course.doneCount(), started = next && course.progress().at[next.id] > 0;
  const cont = next
    ? h('button', { class: 'cr-continue', onclick: () => onUnit(next.id) },
      h('span', { class: 'overline' }, started ? 'Continue' : n ? 'Next unit' : 'Start the course'),
      h('span', { class: 'cr-t' }, `Unit ${next.n} · ${next.title}`), h('span', { class: 'cr-d' }, next.objective),
      h('span', { class: 'cr-p' }, h('span', { class: 'ub-track' }, h('i', { style: { width: `${(100 * n) / UNITS.length}%` } })), `${n} of ${UNITS.length} units done`),
      h('span', { class: 'cr-go', 'aria-hidden': 'true' }, icon('chev-right')))
    : h('div', { class: 'cr-continue done' }, h('span', { class: 'overline' }, 'Course'), h('span', { class: 'cr-t' }, 'All eight units done'), h('span', { class: 'cr-d' }, 'The final assessment is next.'));
  const parts = Object.entries(PARTS).map(([k, name]) => h('section', { class: 'cu-part' }, h('h3', { class: 'home-sub' }, `${k} · ${name}`), UNITS.filter((u) => u.part === k).map((u) => unitRow(u, onUnit))));
  const final = h('section', { class: 'cu-part' }, h('h3', { class: 'home-sub' }, 'Assessment'), unitRow(FINAL, () => openExam({ onDone: render })));
  const explore = h('button', { class: 'cr-explore', onclick: () => go('explore') }, h('span', { class: 'hd-ic' }, svgIcon('explore')),
    h('span', {}, h('b', {}, 'Explore the model'), h('small', {}, 'Any of the patients, freely: views, treatments, time-lapse, Doppler and endoscopy.')), icon('chev-right'));
  let teach = null;
  if (instructor) {
    const unlock = h('input', { type: 'checkbox', checked: course.progress().unlockAll });
    unlock.addEventListener('change', () => { course.setUnlockAll(unlock.checked); render(); });
    teach = h('section', { class: 'cr-teach' }, h('span', { class: 'overline' }, 'Instructor'),
      h('label', { class: 'cr-unlock' }, unlock, 'Unlock all units'),
      h('div', { class: 'cr-lib' }, h('button', { class: 'btn sm', onclick: () => go('learn') }, svgIcon('book'), 'Lessons')));
  }
  return h('div', { class: 'course' }, cont, reviewCard(), parts, final, explore, teach);
}

// The eight cases cut from the course (the plan's §2): they stay in the Case library under Explore, for instructors.
// The other four are the course's own (units 4, 6, 7 and 8); the library lists them last, as a reminder.
const LIBRARY = ['gastric', 'budd-chiari', 'pvt', 'nsbb-problem', 'schisto', 'hepatofugal', 'post-tips', 'treat-cause'];

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };

export function createHome({ el, brandMark, onPreset, onLesson, onUnit, onCase, onPresenter, onClose, onClosed }) {
  let tab = 'explore';
  function render() {
    const st = store.get();
    const done = read('pps.lessons', '{}');
    const best = read('pps.caseScores', '{}');
    const go = (id) => { tab = id; render(); el.scrollTop = 0; };
    // The course, lessons and cases are hidden for now (their pages stay below, unreachable): Home is
    // Explore, with Present one step down, for both roles.
    if (tab !== 'present') tab = 'explore';
    const TITLES = { explore: 'Explore the model', learn: 'Lessons', drill: 'Lessons', practice: 'Unit 3 practice', cases: 'Case library', present: 'Present' };
    const parent = tab === 'drill' ? ['learn', 'Lessons'] : tab === 'cases' || tab === 'present' ? ['explore', 'Explore'] : ['course', 'Course'];
    const nav = tab === 'explore' ? null : h('nav', { class: 'home-back', 'aria-label': 'Back' },
      h('button', { class: 'btn ghost sm', onclick: () => go(parent[0]) }, svgIcon('chev-left'), parent[1]), h('h2', {}, TITLES[tab]));
    let body;
    if (tab === 'course') {
      body = coursePage({ onUnit, go, instructor: st.role === 'instructor', render });
    } else if (tab === 'explore') {
      const groups = {};
      for (const p of st.presetList || []) (groups[p.group] ||= []).push(p);
      // A map of the disease: patients grouped by where the resistance sits, from the gut to the
      // heart, each drawn as its own pressure profile.
      const axis = h('div', { class: 'hp-axis', 'aria-hidden': 'true' }, PATH.map(([, l]) => h('span', {}, l)));
      body = h('div', {},
        h('section', { class: 'ex-teach' },
          h('button', { class: 'btn sm', onclick: () => go('present') }, svgIcon('projector'), 'Present')),
        h('div', { class: 'hp-intro' },
          h('p', {}, 'Each line plots one patient’s pressure from the gut to the heart. The shaded segment, where pressure drops most, marks the site of resistance.'),
          h('div', { class: 'hp-key' }, axis)),
        h('div', { class: 'home-grid scen' }, Object.entries(groups).map(([g, ps]) => h('section', { class: 'home-group' },
          h('h3', {}, h('i', { style: { background: GROUP_COLOR[g] || 'var(--text-3)' } }), g, h('small', {}, GROUP_WHERE[g] || '')),
          ps.map((p) => patientCard(p, st.presetId, onPreset))))));
    } else if (tab === 'practice') {
      // Unit 3's optional practice: the drill, five patients, back to the course.
      body = createDrill({ rounds: 5, exitLabel: 'Back to the course', onExit: () => go('course') }).el;
    } else if (tab === 'drill') {
      body = createDrill({ onExit: () => { tab = 'learn'; render(); } }).el;
    } else if (tab === 'learn') {
      const drill = drillProgress(), openDrill = () => { tab = 'drill'; render(); };
      const lessons = h('div', { class: 'home-grid' }, LESSONS.map((l, i) => h('button', { class: 'home-item lesson' + (done[l.id] ? ' done' : ''), onclick: () => onLesson(l.id) },
        h('span', { class: 'meta' }, h('span', { class: 'num' }, done[l.id] ? svgIcon('check') : String(i + 1)), `${l.minutes} min`, done[l.id]?.score != null ? h('span', { class: 'score' }, `${done[l.id].score} %`) : done[l.id] ? h('span', { class: 'score' }, 'Done') : null),
        h('span', { class: 't' }, l.title), h('span', { class: 'd' }, l.summary))));
      body = h('div', { class: 'home-learn' }, reviewCard(), skillsPath({ onLesson, onCase, onDrill: openDrill }),
        h('button', { class: 'home-item drill-door', onclick: openDrill },
          h('span', { class: 'meta' }, 'Practice', `${ROUNDS} patients`, drill.n ? h('span', { class: 'score' }, `Best ${drill.best} %`) : null),
          h('span', { class: 't' }, DRILL_TITLE), h('span', { class: 'd' }, 'A hidden patient each round: order up to three tests, tap the level of the block, then see the pressure ladder.')),
        h('h3', { class: 'home-sub' }, 'Lessons'), lessons);
    } else if (tab === 'cases') {
      const card = (c) => h('button', { class: 'home-item case', onclick: () => onCase(c.id) },
        h('span', { class: 'meta' }, c.level, best[c.id] != null ? h('span', { class: 'score' }, `Best ${best[c.id]}`) : null),
        h('span', { class: 't' }, c.title), h('span', { class: 'd' }, c.summary));
      body = h('div', {},
        h('p', { class: 'ctl-sub lib-note' }, 'Eight cases that are not part of the course. Each has a history, orders, decisions and a debrief, and any of them can be presented to a class from the Present page.'),
        h('div', { class: 'home-grid' }, CASES.filter((c) => LIBRARY.includes(c.id)).map(card)),
        h('h3', { class: 'home-sub' }, 'Used in the course'), h('div', { class: 'home-grid' }, CASES.filter((c) => !LIBRARY.includes(c.id)).map(card)));
    } else {
      body = onPresenter();
    }
    // Assessment: every finished lesson and case is recorded on this device for export.
    if (tab === 'course' || tab === 'learn' || tab === 'cases') {
      const name = h('input', { class: 'input', type: 'text', placeholder: 'Your name (for the export)', value: learnerName(), 'aria-label': 'Learner name' });
      name.addEventListener('change', () => setLearnerName(name.value.trim()));
      const n = records().length;
      body = h('div', {}, body, h('div', { class: 'home-records' }, h('span', { class: 'overline' }, `Your records · ${n} attempt${n === 1 ? '' : 's'}`), name,
        h('button', { class: 'btn sm', disabled: !n, onclick: exportCSV }, 'Export CSV'), h('button', { class: 'btn sm', disabled: !n, onclick: exportXAPI }, 'Export xAPI')));
    }
    el.replaceChildren(h('div', { class: 'home-inner' },
      h('header', { class: 'home-head' }, brandMark(), h('div', {}, h('h1', {}, t('app.name')), h('p', {}, t('app.tagline')),
          h('p', { class: 'home-byline' }, 'Created by ', h('b', {}, AUTHOR), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
            h('a', { href: AUTHOR_URL, target: '_blank', rel: 'noopener' }, 'More tools by the author ', icon('chev-right')))),
        h('button', { class: 'ib home-x', 'aria-label': 'Close', title: 'Back to the model (Esc)', onclick: onClose }, icon('close'))),
      nav, h('div', { class: 'home-body' }, body),
      h('p', { class: 'disclaimer' }, t('app.disclaimer'))));
  }
  return {
    open(t) { if (t) tab = t; render(); el.hidden = false; document.getElementById('app').classList.add('home-open'); el.querySelector('.cr-continue, .home-back button')?.focus({ preventScroll: true }); },
    close() { if (el.hidden) return; el.hidden = true; document.getElementById('app').classList.remove('home-open'); onClosed?.(); },
    isOpen: () => !el.hidden,
    tab: () => tab,
    render,
  };
}
