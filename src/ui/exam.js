// The final assessment: ten single-best-answer vignettes drawn from the bank (three ask where the
// block is, seven come from the clinic), pass at 70 %. No feedback until the end; then the score,
// a certificate on a pass, a review of every answer and the key points of every unit. Each attempt
// is kept in the records, so it exports with them as CSV or xAPI.

import { h, openModal, closeModal } from './util.js?v=045e641b44';
import { optionList } from './learning-kit.js?v=d80de1677e';
import { UNITS, FINAL, course } from './course.js?v=0339234e33';
import { addRecord, learnerName, setLearnerName, exportCSV, exportXAPI } from './records.js?v=50fb9dd463';
import { BANK } from './exam-bank.js?v=8e5d34c933';

export const EXAM_SIZE = 10, EXAM_SITE = 3, EXAM_PASS = 70;

const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Ten questions with their options shuffled (the answer index follows its option). */
export function drawExam(rnd = Math.random, bank = BANK) {
  const site = shuffle(bank.filter((q) => q.src === 'site'), rnd).slice(0, EXAM_SITE);
  const rest = shuffle(bank.filter((q) => q.src !== 'site'), rnd).slice(0, EXAM_SIZE - site.length);
  return shuffle([...site, ...rest], rnd).map((q) => {
    const order = shuffle(q.options.map((_, i) => i), rnd);
    return { ...q, options: order.map((i) => q.options[i]), explain: order.map((i) => q.explain[i]), answer: order.indexOf(q.answer) };
  });
}
export const examScore = (qs, picks) => Math.round((100 * qs.filter((q, i) => picks[i] === q.answer).length) / qs.length);

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export function openExam({ onDone } = {}) {
  let qs, picks, i, t0, shown = [];
  const root = h('div', { class: 'exam' });
  const show = (...els) => { root.replaceChildren(...els); root.closest('.modal')?.scrollTo({ top: 0 }); };
  const btn = (label, on, primary = true) => h('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: on }, label);

  function intro() {
    const name = h('input', { type: 'text', class: 'exam-name', value: learnerName(), placeholder: 'Your name (for the certificate)', 'aria-label': 'Your name' });
    show(h('p', {}, `${EXAM_SIZE} vignettes, drawn from a bank of ${BANK.length}: where the block is, and what to do in clinic. One best answer each; the answers and explanations come at the end.`),
      h('p', {}, h('b', {}, `Pass mark ${EXAM_PASS} %.`), ' You can retake it with a new draw.'),
      name,
      h('div', { class: 'exam-foot' }, btn('Start', () => { setLearnerName(name.value.trim()); qs = drawExam(); picks = []; i = 0; t0 = Date.now(); question(); })));
  }

  function question() {
    const q = qs[i];
    const next = btn(i === qs.length - 1 ? 'Finish' : 'Next', () => { if (++i < qs.length) question(); else finish(); });
    next.disabled = picks[i] == null;
    const opts = () => optionList({ options: q.options, picked: picks[i] ?? null, onPick: (k) => { picks[i] = k; list.replaceWith(list = opts()); next.disabled = false; } });
    let list = opts();
    show(h('div', { class: 'exam-bar' }, h('span', {}, h('b', {}, `Question ${i + 1}`), ` of ${qs.length}`), h('span', { class: 'ub-track' }, h('i', { style: { width: `${(100 * (i + 1)) / qs.length}%` } }))),
      h('p', { class: 'exam-stem' }, q.stem), h('p', { class: 'exam-q' }, h('b', {}, q.q)), list,
      h('div', { class: 'exam-foot' }, i ? btn('Back', () => { i--; question(); }, false) : null, next));
  }

  function finish() {
    const score = examScore(qs, picks), pass = score >= EXAM_PASS, right = qs.filter((q, k) => picks[k] === q.answer).length;
    addRecord({ kind: 'exam', id: FINAL.id, title: FINAL.title, score, assessment: 2, completed: true, mastered: pass, met: right, total: qs.length,
      duration: (Date.now() - t0) / 1000, wallDuration: (Date.now() - t0) / 1000,
      answers: qs.map((q, k) => `${q.id}: ${picks[k] === q.answer ? 'correct' : 'incorrect'}`) });
    if (pass) course.complete(FINAL.id, score);
    const head = h('div', { class: 'exam-result ' + (pass ? 'pass' : 'fail') }, h('b', {}, `${score} %`), h('span', {}, `${right} of ${qs.length} right · ${pass ? 'Passed' : `the pass mark is ${EXAM_PASS} %`}`));
    const cert = pass ? h('div', { class: 'exam-cert' },
      h('span', { class: 'overline' }, 'Certificate of completion'),
      h('h3', {}, learnerName() || 'Learner'),
      h('p', {}, 'completed the Portal pressure course, eight units and the final assessment'),
      h('p', { class: 'exam-cert-m' }, `Score ${score} % · ${today()}`)) : null;
    const review = qs.map((q, k) => h('details', { class: 'exam-rev' },
      h('summary', {}, h('span', { class: picks[k] === q.answer ? 'ok' : 'no' }, picks[k] === q.answer ? '✓' : '✗'), ` ${k + 1}. ${q.q}`),
      h('p', { class: 'exam-stem' }, q.stem), optionList({ options: q.options, picked: picks[k], answer: q.answer, reveal: true, locked: true, notes: q.explain })));
    show(head, cert,
      h('div', { class: 'exam-foot' }, pass ? btn('Print certificate', () => window.print(), false) : null, btn('Key points', keyPoints, !pass), btn(pass ? 'Done' : 'Retake', pass ? () => { closeModal(); onDone?.(); } : intro, pass)),
      h('h3', { class: 'home-sub' }, 'Your answers'), review,
      h('div', { class: 'exam-foot' }, btn('Export CSV', exportCSV, false), btn('Export xAPI', exportXAPI, false)));
    shown = [...root.childNodes];
  }

  // Every unit's key points, in course order; a unit not written yet says so.
  function keyPoints() {
    const done = new Set(course.keyPoints().map((k) => k.unit.id));
    show(h('p', {}, 'The key points of the course, unit by unit.'),
      UNITS.map((u) => h('section', { class: 'exam-kp' + (done.has(u.id) ? '' : ' todo') }, h('h4', {}, `${u.n}. ${u.title}`),
        u.keyPoints?.length ? h('ul', {}, u.keyPoints.map((p) => h('li', {}, p))) : h('p', {}, 'Key points arrive with this unit.'))),
      h('div', { class: 'exam-foot' }, btn('Back to the result', () => show(...shown), false), btn('Close', () => { closeModal(); onDone?.(); })));
  }
  intro();
  openModal(FINAL.title, root, { wide: true, sub: `${EXAM_SIZE} questions · pass at ${EXAM_PASS} %` });
}
