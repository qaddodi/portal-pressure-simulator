// Home's Learn tab extras: the skills path (lessons, cases and the drill grouped by the five
// clinical skills, with progress and "Next up") and a two-question warm-up from lessons finished
// earlier, shown when a student comes back (spaced retrieval). Progress is read from this device:
// pps.lessons (lessons), pps.caseScores (cases), pps.drill (the drill), pps.review (the warm-up).

import { h, svgIcon, icon } from './util.js?v=a357853926';
import { LESSONS } from './learn.js?v=037aa0c280';
import { CASES } from './cases.js?v=8d4fbd875f';
import { drillProgress, DRILL_TITLE } from './drill.js?v=af9584165f';
import { UNITS, course } from './course.js?v=7531d86bf7';

// [skill, what it means, items]; an item is 'l:<lesson>', 'c:<case>' or 'drill'.
export const SKILLS = [
  ['Recognize', 'Spot portal hypertension and its signs', ['l:portal-flow', 'l:varices', 'l:ascites', 'l:doppler-report', 'c:prevention']],
  ['Localize', 'Find the level of the block', ['l:which-level', 'l:measuring-pressure', 'drill', 'l:left-sided', 'c:new-ascites', 'c:gastric', 'c:schisto']],
  ['Act', 'Treat, and know what each treatment costs', ['l:inflow-and-drugs', 'l:toolbox', 'c:bleed', 'c:refractory', 'c:nsbb-problem']],
  ['Refer', 'Know when it needs a specialist', ['c:budd-chiari', 'c:pvt', 'c:hepatofugal', 'c:post-tips']],
  ['Explain', 'Tell the patient what is happening', []],
];

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };

function resolve(item, done, best, drill) {
  if (item === 'drill') return { kind: 'drill', title: DRILL_TITLE, done: !!drill.n };
  const [k, id] = item.split(':');
  const src = k === 'l' ? LESSONS : CASES, it = src.find((x) => x.id === id);
  if (!it) return null;
  return { kind: k === 'l' ? 'lesson' : 'case', id, title: it.title, done: k === 'l' ? !!done[id] : best[id] != null };
}

/** The path: one row per skill, its items as chips, and "Next up" for the first unfinished item. */
export function skillsPath({ onLesson, onCase, onDrill }) {
  const done = read('pps.lessons'), best = read('pps.caseScores'), drill = drillProgress();
  const open = (it) => (it.kind === 'lesson' ? onLesson(it.id) : it.kind === 'case' ? onCase(it.id) : onDrill());
  let nextUp = null;
  const rows = SKILLS.map(([skill, what, items]) => {
    const its = items.map((x) => resolve(x, done, best, drill)).filter(Boolean);
    const n = its.filter((x) => x.done).length;
    nextUp ||= its.find((x) => !x.done);
    return h('div', { class: 'sp-row' },
      h('div', { class: 'sp-k' }, h('b', {}, skill), h('span', {}, what)),
      its.length ? h('div', { class: 'sp-bar', role: 'img', 'aria-label': `${n} of ${its.length} done` }, h('i', { style: { width: `${(100 * n) / its.length}%` } })) : null,
      its.length ? h('span', { class: 'sp-n' }, `${n} / ${its.length}`) : h('span', { class: 'sp-n soon' }, 'Coming with the cases update'),
      h('div', { class: 'sp-items' }, its.map((it) => h('button', { class: 'sp-it' + (it.done ? ' done' : ''), 'data-kind': it.kind, title: it.title, onclick: () => open(it) },
        it.done ? svgIcon('check', 'sp-ic') : null, h('span', {}, it.title)))));
  });
  return h('section', { class: 'sp', 'aria-label': 'Your path' },
    h('div', { class: 'sp-head' }, h('span', { class: 'overline' }, 'Your path'),
      nextUp ? h('button', { class: 'btn sm primary sp-next', onclick: () => open(nextUp) }, 'Next up: ', nextUp.title, icon('chev-right')) : h('span', { class: 'sp-all' }, 'Everything done. The drill is always there for practice.')),
    h('div', { class: 'sp-rows' }, rows));
}

const REVIEW_KEY = 'pps.review', GAP_MS = 12 * 3600 * 1000;
/** Two questions from finished lessons, least recently seen first, once per return (12 h apart). */
export function reviewCard({ now = Date.now() } = {}) {
  const done = read('pps.lessons'), rv = read(REVIEW_KEY), seen = rv.seen || {};
  if (rv.last && now - rv.last < GAP_MS && !rv.open) return null;
  const pool = LESSONS.filter((l) => done[l.id] && now - Date.parse(done[l.id].date || 0) > 3600 * 1000)
    .flatMap((l) => l.steps.filter((s) => s.type === 'check').flatMap((s) => s.quiz.map((q, k) => ({ q, key: `${l.id}#${k}`, lesson: l.title }))));
  // Stems from finished course units join the pool (vignette and lead-in as one question).
  const unitsDone = course.progress().done;
  pool.push(...UNITS.filter((u) => unitsDone[u.id] && now - Date.parse(unitsDone[u.id].date || 0) > 3600 * 1000)
    .flatMap((u) => u.steps.filter((s) => s.type === 'stem').map((s) => ({ q: { q: `${s.stem} ${s.q}`, options: s.options, answer: s.answer, why: s.explain?.[s.answer] }, key: `${u.id}#${s.sid}`, lesson: `Unit ${u.n} · ${u.title}` }))));
  if (pool.length < 2) return null;
  const qs = (rv.open || []).map((k) => pool.find((x) => x.key === k)).filter(Boolean);
  if (qs.length < 2) { qs.length = 0; qs.push(...pool.sort((a, b) => (seen[a.key] || 0) - (seen[b.key] || 0) || Math.random() - 0.5).slice(0, 2)); }
  const save = (patch) => { try { localStorage.setItem(REVIEW_KEY, JSON.stringify({ ...read(REVIEW_KEY), ...patch })); } catch { /* storage unavailable */ } };
  save({ open: qs.map((x) => x.key) });
  let answered = 0;
  const card = h('section', { class: 'rv', 'aria-label': 'Warm-up' },
    h('div', { class: 'rv-head' }, h('span', { class: 'overline' }, 'Warm-up · two questions from earlier lessons'),
      h('button', { class: 'ib', 'aria-label': 'Skip the warm-up', title: 'Skip', onclick: () => { save({ last: now, open: null }); card.remove(); } }, icon('close'))),
    qs.map(({ q, key, lesson }) => {
      const order = q.options.map((_, k) => k).sort(() => Math.random() - 0.5);
      const why = h('p', { class: 'rv-why', hidden: true });
      const opts = order.map((k) => h('button', { class: 'rv-opt', onclick: () => {
        opts.forEach((b, j) => { b.disabled = true; b.classList.toggle('ok', order[j] === q.answer); });
        if (k !== q.answer) opts[order.indexOf(k)].classList.add('no');
        why.hidden = false; why.textContent = (k === q.answer ? 'Right. ' : 'Not quite. ') + (q.why || '');
        const s = read(REVIEW_KEY); save({ seen: { ...(s.seen || {}), [key]: Date.now() } });
        if (++answered === qs.length) save({ last: Date.now(), open: null });
      } }, q.options[k]));
      return h('div', { class: 'rv-q' }, h('p', {}, h('small', {}, lesson), q.q), h('div', { class: 'rv-opts' }, opts), why);
    }));
  return card;
}
