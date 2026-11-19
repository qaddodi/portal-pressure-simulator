// "From readings" (the patient menu's top row): the readings a person has, entered step by step, and the model scenarios that could give them
// (src/engine/portal/inverse.js: a search over the engine's own lesion families, never a diagnosis). A sheet on a phone and a popover under the menu's
// button elsewhere, built by util.js popover so it is the same glass, the same sheet over the dock and the same Esc and outside tap as every menu.
//
// Four short steps (pressures; stiffness; spleen, blood and varices; fluid and flow), each with a "3 of 8 lesions still fit" strip under the progress
// bar so the narrowing is the feedback, and a Skip on every one: nothing is required, and a reading left blank is unknown, never a guess. Once two
// readings are in, the scenarios are listed as one compact row each (ties as ties: name, share of the likelihood, a bar, a chip per reading, one line of
// why); a tap opens the row's card (what it cannot explain, the settings that fit, what it would predict for the readings that were not entered), and
// the limits of the model stay folded under it. The next reading that would split the candidates is named at the top, or the plain statement that
// none the model makes would. "Open as patient" saves the scenario under Patients as "Yours" and loads it.
//
// While the fit runs on the model the list holds still, dimmed, with a progress line; it is rebuilt once, when the fit is done (review U5).
// Nothing here moves a frame: a step is swapped in with the shared fade (swapFade; Reduce Motion keeps the fade), a row opens by the shared
// transform fold (fold-slide.js), and every colour is a token.

import { h, svgIcon, popover, closePopover, swapFade, swapText, announce } from './util.js';
import { slideFold } from './fold-slide.js';
import { D_SMALL } from './ease.js';
import { createInverseRemote } from './inverse-remote.js';
import { FAMILIES, FAMILY, AXES, LESION, LESION_IDS, settingsOf } from '../engine/portal/inverse-families.js';
import { TRY_CASES } from '../engine/portal/inverse-try-cases.js';
import {
  READINGS, READING_KEYS, MIN_READINGS, FEW_READINGS, OUTSIDE, readingText, chipText, modelText, numberText, gapLine, rangeText, reasonsFor, bandsOf,
} from '../engine/portal/inverse.js';

export const STEPS = Object.freeze([
  { id: 'pressures', name: 'Pressures', q: 'Do you have pressures?', sub: 'From a hepatic vein catheter, an EUS or a right heart study. Enter any you have.', keys: ['whvp', 'fhvp', 'hvpg', 'pv', 'ppg', 'ivc', 'ra'] },
  { id: 'stiffness', name: 'Stiffness', q: 'Do you have liver or spleen stiffness?', sub: 'Either one helps.', keys: ['lsm', 'ssm'] },
  { id: 'size', name: 'Spleen and blood', q: 'Spleen, platelets and varices?', sub: 'Size on ultrasound or CT, the blood count, the endoscopy.', keys: ['spleen', 'plt', 'varix'] },
  { id: 'fluid', name: 'Fluid and flow', q: 'Ascites and portal flow?', sub: 'Ultrasound, diagnostic paracentesis, portal vein Doppler.', keys: ['asc', 'saag', 'asctp', 'pvVel'] },
]);

// What each row says under its name: where it comes from. It never repeats the row's name (review U7), and the allowed errors are not here: the review explains them once.
const SUBS = {
  whvp: 'Balloon wedged in a hepatic vein', fhvp: 'The same vein, free', hvpg: 'Only if you do not have both pressures above', pv: 'Direct or by EUS',
  ppg: 'EUS-PPG, if you do not have both pressures above', lsm: 'Transient elastography', ssm: 'Transient elastography',
  spleen: 'Longest length, ultrasound or CT', plt: 'From the blood count', varix: 'At endoscopy', asc: 'On ultrasound', saag: 'Serum albumin − ascitic fluid albumin', asctp: 'From the same paracentesis as the SAAG',
  pvVel: 'Mean velocity; 0 is no flow, negative is hepatofugal',
};
/** A reading the person does not type because it is made from two they did: the field shows it, read-only, and says where it comes from (review U8). */
const DERIVED = Object.freeze({ hvpg: { from: ['whvp', 'fhvp'], note: 'From WHVP − FHVP' }, ppg: { from: ['pv', 'ivc'], note: 'From portal vein − IVC' } });
const tolText = (k) => { const r = READINGS[k]; return r.kind === 'grade' ? '' : r.kind === 'log' ? `±${Math.round(r.sigma * 100)}%` : `±${r.sigma}${r.unit ? ' ' + r.unit : ''}`; };
const RESULT_MIN = MIN_READINGS;

/** Words for a family's status in the chips and cards. */
const STATUS_WORD = { best: 'Fits best', tie: 'Fits about equally', possible: 'Possible', out: 'Ruled out' };
const MARK_WORD = { fit: 'fits', near: 'close', off: 'does not fit' };

/** The state of the flow, kept for the page's life so the sheet can be closed and opened again where it was left. */
const state = { step: 0, raw: {}, view: 'steps', edit: false, back: null, open: new Set(), caseId: null, guess: new Set(), guessed: false };   // view: 'steps' | 'review' | 'results' | 'cases' | 'guess' (a case to guess before the scenarios; caseId the case, guess the lesions picked, guessed that they were revealed); edit: a step opened from the review (back: 'review') or from the results (back: 'results') to change one reading; open: the scenario rows that are open   // raw: what was typed, by reading key (a string, or a grade index for asc and varix)

const parse = (k, v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const entered = () => Object.fromEntries(Object.keys(state.raw).map((k) => [k, parse(k, state.raw[k])]).filter(([, v]) => v !== null));

/**
 * ctx: { makeWorker(): the refinement worker, openYours(f, p, readings): saves the scenario as Yours and loads it }.
 * Returns { open(anchor), close() }.
 */
export function createFromReadings(ctx) {
  const remote = createInverseRemote(ctx.makeWorker);
  let body = null, el = null, offRemote = null, askT = 0, lastSig = '';

  const chipState = (res, f) => (!res.ready && (f.status === 'best' || f.status === 'tie') ? 'possible' : f.status);

  // ── The strip under the progress bar: "3 of 8 lesions still fit" and every lesion as a pill, filled where it fits, outlined where it is possible,
  // struck through where the readings rule it out. Made once for a step and updated in place at each key (the state is an attribute the stylesheet
  // fades; the count crossfades), so nothing pops. ──
  let still = null;
  function makeStill() {
    const num = h('b', {}, String(LESION_IDS.length)), fine = h('p', { class: 'fr-fine' });
    const pillEls = new Map(LESION_IDS.map((id) => [id, h('span', { class: 'fr-pill', 'data-s': 'possible', role: 'listitem' }, LESION[id].short)]));
    const root = h('div', { class: 'fr-still' },
      h('div', { class: 'fr-count' }, num, h('span', {}, `of ${LESION_IDS.length} lesions still fit`)),
      h('div', { class: 'fr-pills', role: 'list', 'aria-label': 'Lesions still in play' }, [...pillEls.values()]), fine);
    let first = true;
    const update = (res) => {
      // (a lesion is as possible as the best mix that holds it)
      const order = ['best', 'tie', 'possible', 'out'], by = {};
      for (const f of res.families) for (const id of FAMILY[f.id].axes) { const st = chipState(res, f); if (!by[id] || order.indexOf(st) < order.indexOf(by[id])) by[id] = st; }
      let fit = 0;
      for (const id of LESION_IDS) { const st = by[id] || 'possible', pe = pillEls.get(id); if (st !== 'out') fit++; pe.dataset.s = st; pe.setAttribute('aria-label', `${LESION[id].short}: ${STATUS_WORD[st].toLowerCase()}`); }
      const t = String(fit);
      if (num.textContent !== t) { if (first) num.textContent = t; else swapText(num, t); }
      first = false;
      fine.textContent = res.ready ? 'Filled: fits best or about equally. Outline: possible. Struck through: ruled out.' : `Filled once ${RESULT_MIN} readings are in. Struck through: ruled out.`;
    };
    return { el: root, update };
  }

  // One fold for every row that opens: the shared transform slide (fold-slide.js), never a height eased.
  const fold = (item, box, open) => slideFold({ item, inner: box.firstElementChild, root: body, open, set: (v) => box.classList.toggle('on', v), ms: D_SMALL });
  /** A closed line that opens its content under it (the limits of the model, how readings are compared). */
  function disclosure(label, make) {
    const box = h('div', { class: 'fr-cb' }, h('div', {}, make()));
    const btn = h('button', { type: 'button', class: 'fr-dh', 'aria-expanded': 'false' }, h('span', {}, label), h('span', { class: 'fr-chev', 'aria-hidden': 'true' }));
    const item = h('div', { class: 'fr-disc' }, btn, box);
    btn.addEventListener('click', () => { const on = !box.classList.contains('on'); btn.setAttribute('aria-expanded', String(on)); fold(item, box, on); });
    return item;
  }

  // ── A row of the entry ──
  function numRow(k) {
    const r = READINGS[k];
    const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: '–', 'aria-label': `${r.label}${r.unit ? ' in ' + r.unit : ''}`, value: state.raw[k] ?? '', 'data-k': k });
    const hint = h('span', { class: 'fr-hint', 'aria-live': 'polite' });
    const row = h('label', { class: 'fr-row', 'data-known': state.raw[k] ? '1' : '0' },
      h('span', { class: 'fr-l' }, h('b', {}, r.label), SUBS[k] ? h('i', {}, SUBS[k]) : null),
      h('span', { class: 'fr-in' }, input, r.unit ? h('em', {}, r.unit) : null), hint);
    input.addEventListener('input', () => {
      state.raw[k] = input.value;
      if (!input.value.trim()) delete state.raw[k];
      const v = parse(k, input.value), bad = v !== null && (Number.isNaN(v) || v < r.min || v > r.max);
      row.dataset.known = input.value.trim() ? '1' : '0'; row.dataset.bad = bad ? '1' : '0';
      hint.textContent = bad ? (Number.isNaN(v) ? 'A number, please' : `Outside ${r.min} to ${r.max}`) : '';
      changed();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(1); } });
    return row;
  }
  function gradeRow(k) {
    const r = READINGS[k], cur = state.raw[k] == null ? null : Number(state.raw[k]);
    const opts = [['Unknown', null], ...r.grades.map((g, i) => [g, i])];
    const seg = h('div', { class: 'seg full fr-seg', role: 'group', 'aria-label': r.label, 'data-k': k },
      opts.map(([label, v]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), 'data-v': v == null ? '' : String(v) }, label)));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !seg.contains(b)) return;
      if (b.dataset.v === '') delete state.raw[k]; else state.raw[k] = Number(b.dataset.v);
      for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b));
      changed();
    });
    return h('div', { class: 'fr-row fr-grade' }, h('span', { class: 'fr-l' }, h('b', {}, r.label), SUBS[k] ? h('i', {}, SUBS[k]) : null), seg);
  }

  // ── The steps ──
  function stepView() {
    const st = STEPS[state.step], res = remote.peek(entered()), n = res.n, last = state.step === STEPS.length - 1;
    still = makeStill(); still.update(res);
    const here = st.keys.some((k) => state.raw[k] != null && state.raw[k] !== '');
    const dots = h('div', { class: 'fr-prog', role: 'img', 'aria-label': `Step ${state.step + 1} of ${STEPS.length + 1}` }, [...STEPS, null].map((_, i) => h('i', { class: i <= state.step ? 'on' : '' })));
    const nextBtn = h('button', { type: 'button', class: 'btn primary fr-next', onclick: () => go(1) }, nextLabel(here, last));
    const kids = [
      dots, still.el, h('p', { class: 'fr-q' }, st.q), h('p', { class: 'fr-small' }, st.sub),
      // (Nothing entered yet, first step: a way in for a learner who has no patient to type: a textbook case, or one to guess. Review T1, T2.)
      state.step === 0 && !state.edit && !Object.keys(state.raw).length ? h('button', { type: 'button', class: 'fr-try', onclick: () => { state.view = 'cases'; show(); } }, h('span', {}, h('b', {}, 'No patient to enter?'), h('i', {}, 'Try a textbook case, or guess one')), h('span', { class: 'fr-chev', 'aria-hidden': 'true' })) : null,
      h('div', { class: 'fr-rows' }, st.keys.map((k) => (READINGS[k].kind === 'grade' ? gradeRow(k) : numRow(k)))),
      h('p', { class: 'fr-fine' }, h('b', {}, 'Model scenarios, not diagnoses.')),
      // (the foot stays on screen while the rows scroll, so Next is never below the fold or under the keyboard: review U6)
      h('div', { class: 'fr-foot' }, h('p', { class: 'fr-need' }, needText(n)),
        h('div', { class: 'fr-btns' }, state.step > 0 && !state.edit ? h('button', { type: 'button', class: 'btn', onclick: () => go(-1) }, 'Back') : null, nextBtn)),
    ];
    return h('div', { class: 'fr-step', 'data-step': st.id }, kids);
  }
  // The one button's words: while a reading is being changed from the review (or the scenarios) it goes back there; otherwise the next step, or the review after the last.
  const nextLabel = (here, last) => (state.edit ? (state.back === 'results' ? 'Back to the scenarios' : 'Back to your readings') : last ? 'Review your readings' : here ? `Next: ${STEPS[state.step + 1].name.toLowerCase()}` : 'I do not have these: skip');
  const needText = (n) => (n >= RESULT_MIN ? `${n} readings entered. Enough to search.` : `${n} of the ${RESULT_MIN} readings the search needs.`);
  /**
   * The step's live parts, updated in place at each key: the strip, a reading made from two others (its field shows it, read-only, and says from
   * where: HVPG from WHVP − FHVP, PPG from portal vein − IVC) and the count of readings. No swap, so typing is never interrupted.
   */
  function liveParts() {
    if (!body || state.view !== 'steps') return;
    const res = remote.peek(entered());
    still?.update(res);
    const need = body.querySelector('.fr-need'); if (need) need.textContent = needText(res.n);
    const nb = body.querySelector('.fr-next');
    if (nb) { const st = STEPS[state.step], here = st.keys.some((k) => state.raw[k] != null && state.raw[k] !== ''); nb.textContent = nextLabel(here, state.step === STEPS.length - 1); }
    for (const [k, d] of Object.entries(DERIVED)) {
      const input = body.querySelector(`input[data-k="${k}"]`); if (!input) continue;
      const [a, b] = d.from, on = a in res.readings && b in res.readings, row = input.closest('.fr-row'), sub = row.querySelector('.fr-l i');
      if (on) { input.readOnly = true; input.tabIndex = -1; input.value = (res.readings[a] - res.readings[b]).toFixed(1); }
      else if (input.readOnly) { input.readOnly = false; input.removeAttribute('tabindex'); input.value = state.raw[k] ?? ''; }
      row.dataset.derived = on ? '1' : '0';
      const t = on ? d.note : SUBS[k];
      if (sub && sub.textContent !== t) { if (sub.dataset.set) swapText(sub, t); else sub.textContent = t; sub.dataset.set = '1'; }
    }
  }
  function changed() {
    liveParts();
    clearTimeout(askT);
    askT = setTimeout(() => { remote.set(entered()); }, 450);   // (the refinement waits for the typing to rest; the ranking above is already live)
  }

  // ── The scenarios ──
  function nextText(res) {
    const nx = res.next;
    if (!nx) return null;
    const lab = (id) => FAMILY[id].short, r = READINGS[nx.key];
    const val = (id) => { const v = nx.by.find((x) => x.id === id)?.value; return v == null ? null : modelText(nx.key, v); };
    if (nx.verdict === 'none') return { lead: 'No reading this model makes would split them.', rest: res.play.map((f) => `${lab(f.id)}: ${OUTSIDE[f.id]}`) };
    const [a, b] = nx.pair, va = val(a), vb = val(b), pair = va && vb ? ` ${lab(a)} predicts about ${va}, ${lab(b)} about ${vb}.` : '';
    return { lead: nx.verdict === 'splits' ? `Next reading to take: ${r.label.toLowerCase()}. It would split ${lab(a)} from ${lab(b)}.${pair}` : `Next reading: ${r.label.toLowerCase()} helps only a little.${pair}`, rest: [] };
  }
  const refineText = () => {
    const s = remote.status(), p = remote.progress();
    if (s === 'refining') return `Fitting on the model, round ${Math.max(1, p.round + 1)} of ${p.rounds}. The list updates when it is done.`;
    if (s === 'done') return 'The fit on the model is finished, so this list is final.';
    if (s === 'library') return 'Searched the grid of settings only; the finer fit is not available here.';
    return '';
  };
  const fitChips = (f, res) => h('span', { class: 'fr-marks', role: 'list', 'aria-label': 'How each reading you entered fits' },
    Object.keys(res.readings).map((k) => h('span', { class: 'fr-mark', 'data-m': f.marks[k], role: 'listitem', 'aria-label': `${READINGS[k].short} ${MARK_WORD[f.marks[k]]}` }, READINGS[k].short)));
  const fitWith = (f) => FAMILY[f.id].axes.map((k) => `${AXES[k].label.toLowerCase()} ${rangeText(k, f.ranges[k])}`);
  // The exact settings the best fit gives the model (the ones the fit chose, then the ones that follow from them), and what the model gives back beside what was entered.
  const settingList = (rows) => h('ul', { class: 'fr-set' }, rows.map((x) => h('li', {}, h('span', {}, x.label), h('b', {}, x.text))));
  const settingBlocks = (f) => {
    const all = settingsOf(f.id, f.best.p), chosen = all.filter((x) => !x.follows), follows = all.filter((x) => x.follows);
    return h('div', {}, h('p', { class: 'fr-sub' }, 'Model settings that give this'), settingList(chosen),
      follows.length ? [h('p', { class: 'fr-sub fr-sub2' }, 'Follow from those'), settingList(follows)] : null);
  };
  // (Each unit once, in the row's name: a number column never wraps, review U11.)
  const backRows = (f, res) => Object.keys(res.readings).map((k) => {
    const r = READINGS[k], v = f.best.pred[k];
    return h('li', { 'data-m': f.marks[k] }, h('span', {}, r.unit ? `${r.short} (${r.unit})` : r.short), h('em', {}, numberText(k, res.readings[k])), h('b', {}, v == null ? 'none' : numberText(k, v, true)));
  });
  const ratingShort = (f) => (f.rating >= 0.995 ? '99%+' : f.rating < 0.01 ? '<1%' : `${Math.round(f.rating * 100)}%`);
  const PREDICT_KEYS = ['pv', 'ppg', 'ra', 'ivc', 'ssm', 'pvVel', 'saag', 'lsm', 'spleen', 'plt'];
  const predictLine = (f, res) => PREDICT_KEYS.filter((k) => !(k in res.readings) && f.predicts[k]).slice(0, 4).map((k) => {
    const [lo, hi] = f.predicts[k], r = READINGS[k], t = (v) => readingText(k, v).replace(` ${r.unit}`, '');
    return `${r.short} ${Math.abs(hi - lo) < (r.kind === 'log' ? lo * 0.03 : 0.15) ? t(lo) : `${t(lo)} to ${t(hi)}`}${r.unit ? ' ' + r.unit : ''}`;
  });
  /** One scenario: a compact row (name, share, bar, one chip per reading, one line of why) that opens its card on a tap. */
  function card(f, res, topRating) {
    const fam = FAMILY[f.id], why = reasonsFor(fam, res.readings, f.best), n = fam.axes.length, open = state.open.has(f.id), ok = res.fit.ok;   // (no rating or bar when no scenario gives the readings: a share between scenarios says nothing then, review E1)
    const lead = why[0] || (f.gaps.length ? `Does not fit: ${f.gaps.map((g) => READINGS[g.key].short).join(', ')}.` : 'Every reading you entered is within the usual error.');
    const bar = h('i', {}); bar.style.setProperty('--fit', String(Math.max(0.02, Math.min(1, f.rating / Math.max(topRating, 1e-6)))));
    const head = h('button', { type: 'button', class: 'fr-ch', 'aria-expanded': String(open), 'aria-label': `${fam.label}. ${ok ? `${STATUS_WORD[f.status]}, relative fit ${ratingShort(f)}` : 'Does not fit all the readings'}. ${open ? 'Close' : 'Open'} the details` },
      h('span', { class: 'fr-ct' }, h('b', {}, fam.label), ok ? h('span', { class: 'fr-rate' }, ratingShort(f)) : null),
      h('span', { class: 'fr-st' }, (ok ? STATUS_WORD[f.status] : 'Closest fit') + (n > 1 ? ` · ${n === 2 ? 'two' : 'three'} lesions` : '')),
      ok ? h('span', { class: 'fr-bar', 'aria-hidden': 'true' }, bar) : null,
      fitChips(f, res), h('span', { class: 'fr-why1' }, lead), h('span', { class: 'fr-chev', 'aria-hidden': 'true' }));
    const bands = bandsOf(f.best.pred, fam);
    const detail = h('div', { class: 'fr-cd' },
      why.length > 1 ? h('ul', { class: 'fr-why' }, why.slice(1).map((t) => h('li', {}, t))) : null,
      h('div', { class: 'fr-fit' }, n ? settingBlocks(f) : h('div', {}, h('p', { class: 'fr-sub' }, 'Model settings that give this'), h('p', { class: 'fr-fine' }, 'None changed: every setting is the healthy one.')),
        h('div', {}, h('p', { class: 'fr-sub' }, 'The model gives back'), h('ul', { class: 'fr-back' }, h('li', { class: 'fr-bh' }, h('span', {}, ''), h('em', {}, 'You'), h('b', {}, 'Model')), backRows(f, res)))),
      h('dl', { class: 'fr-kv' },
        bands.length ? [h('dt', {}, 'In the model'), h('dd', {}, bands.map((b) => h('span', { class: 'fr-band' }, `${b.label} ${b.text}: ${b.band}.`)))] : null,
        n ? [h('dt', {}, 'Settings could be'), h('dd', {}, fitWith(f).join('; '))] : null,
        // (Review T3: the readings that decide between this scenario and the next one down: what you entered, what each gives.)
        f.why?.length ? [h('dt', {}, 'Beats the next one'), h('dd', {}, f.why.map((w) => h('span', { class: 'fr-band' }, `${READINGS[w.key].short}: you entered ${readingText(w.key, w.entered)}; this gives ${w.mine == null ? 'none' : modelText(w.key, w.mine)}, the next ${w.theirs == null ? 'none' : modelText(w.key, w.theirs)}.`)))] : null,
        h('dt', {}, 'Cannot explain'), h('dd', {}, f.gaps.length ? f.gaps.map((g) => gapLine(g)).join(' ') : 'Nothing: every reading you entered is within the usual error.'),
        predictLine(f, res).length ? [h('dt', {}, 'Would predict'), h('dd', {}, predictLine(f, res).join(', ') + '. You did not enter these.')] : null),
      disclosure('Limits of the model', () => h('div', { class: 'fr-lim' }, [fam.limits, OUTSIDE[f.id], fam.ev].filter(Boolean).map((t) => h('p', {}, t)))),
      h('div', { class: 'fr-acts' }, h('button', { type: 'button', class: f.status === 'possible' ? 'btn' : 'btn primary', onclick: () => openYours(f) }, 'Open as patient')));
    const box = h('div', { class: 'fr-cb' + (open ? ' on' : '') }, detail);
    const art = h('article', { class: 'fr-card', 'data-s': f.status, 'data-f': f.id, 'data-tie': f.tieGroup || null }, head, box);
    head.addEventListener('click', () => {
      const on = !box.classList.contains('on');
      if (on) state.open.add(f.id); else state.open.delete(f.id);
      head.setAttribute('aria-expanded', String(on)); fold(art, box, on);
    });
    return art;
  }
  // ── Your readings: only what was entered, each a button that opens its step; what was not entered is one line of buttons that add it ──
  const typed = (k) => String(state.raw[k] ?? '').trim().replace(',', '.');
  function editReading(k, back) { state.caseId = null; state.step = STEPS.findIndex((st) => st.keys.includes(k)); state.view = 'steps'; state.edit = true; state.back = back; show(k); }
  function reviewRow(k, res, why) {
    const r = READINGS[k], known = state.raw[k] != null && state.raw[k] !== '', v = parse(k, state.raw[k]);
    const derived = !known && k in DERIVED && DERIVED[k].from.every((a) => a in res.readings);
    const bad = known && (Number.isNaN(v) || (r.kind !== 'grade' && (v < r.min || v > r.max)));
    let val, note = '';
    if (known && r.kind === 'grade') val = h('b', {}, r.grades[v] ?? typed(k));
    else if (known) val = h('span', { class: 'fr-val' }, h('b', {}, typed(k)), r.unit ? h('em', {}, r.unit) : null);
    else val = h('span', { class: 'fr-val' }, h('b', {}, (res.readings[DERIVED[k].from[0]] - res.readings[DERIVED[k].from[1]]).toFixed(1)), h('em', {}, r.unit));
    if (bad) note = `Not used: ${Number.isNaN(v) ? 'not a number' : `outside ${r.min} to ${r.max}`}`;
    else if (known && why[k]) note = `Not used: ${why[k]}`;
    else if (derived) note = `${DERIVED[k].note}, not typed`;
    const row = h('button', { type: 'button', class: 'fr-rv', 'data-k': k, 'data-s': known ? (bad || why[k] ? 'off' : 'on') : 'derived', 'aria-label': `${r.label}: ${known ? typed(k) : 'made from two pressures'}. Change` },
      h('span', { class: 'fr-rl' }, h('b', {}, r.label), note ? h('i', {}, note) : null), val, h('span', { class: 'fr-chev', 'aria-hidden': 'true' }));
    row.addEventListener('click', () => editReading(k, 'review'));
    return h('li', {}, row);
  }
  const isKnown = (k) => state.raw[k] != null && state.raw[k] !== '';
  const compareView = () => h('div', { class: 'fr-cmp' },
    h('p', { class: 'fr-fine' }, 'A value the model gives fits when it is within one allowed error of yours, is close within two, and does not fit beyond that. The allowed errors:'),
    h('ul', { class: 'fr-tol' }, READING_KEYS.filter((k) => READINGS[k].kind !== 'grade').map((k) => h('li', {}, h('span', {}, READINGS[k].short), h('b', {}, tolText(k))))),
    h('p', { class: 'fr-fine' }, 'Ascites and varices are grades: a model value inside the grade you chose fits, and outside it is counted from the nearer edge.'));
  function reviewView() {
    const res = remote.peek(entered()), why = Object.fromEntries(res.dropped.map((d) => [d.key, d.why]));
    const total = STEPS.reduce((n, st) => n + st.keys.length, 0), have = Object.keys(state.raw).length;
    const shown = (k) => isKnown(k) || (k in DERIVED && DERIVED[k].from.every((a) => a in res.readings));
    const groups = STEPS.filter((st) => st.keys.some(shown)).map((st) => h('section', { class: 'fr-rg', 'aria-label': st.name },
      h('div', { class: 'fr-rgh' }, h('b', {}, st.name)),
      h('ul', {}, st.keys.filter(shown).map((k) => reviewRow(k, res, why)))));
    const missing = STEPS.flatMap((st) => st.keys).filter((k) => !shown(k));
    const ok = res.n >= RESULT_MIN, go2 = h('button', { type: 'button', class: 'btn primary fr-next', onclick: () => go(1) }, 'Show scenarios');
    go2.disabled = !ok;
    return h('div', { class: 'fr-review' },
      h('div', { class: 'fr-prog', role: 'img', 'aria-label': `Step ${STEPS.length + 1} of ${STEPS.length + 1}` }, [...STEPS, null].map(() => h('i', { class: 'on' }))),
      h('p', { class: 'fr-q' }, 'Your readings'),
      h('p', { class: 'fr-small' }, have ? `${have} of ${total} entered. Tap one to change it. What is not entered stays unknown, and the search never fills it in.` : 'Nothing entered yet. Tap a reading below to add it.'),
      groups,
      notes(res),
      missing.length ? h('div', { class: 'fr-miss' }, h('p', { class: 'fr-sub' }, 'Not entered: tap to add'), h('div', { class: 'fr-chips' }, missing.map((k) => h('button', { type: 'button', class: 'fr-rc', 'data-k': k, onclick: () => editReading(k, 'review') }, READINGS[k].short)))) : null,
      disclosure('How readings are compared', compareView),
      h('p', { class: 'fr-fine' }, h('b', {}, 'Model scenarios, not diagnoses.')),
      h('div', { class: 'fr-foot' }, h('p', { class: 'fr-need' }, needText(res.n)),
        h('div', { class: 'fr-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { state.step = STEPS.length - 1; state.view = 'steps'; state.edit = false; show(); } }, 'Back'), go2)));
  }
  /** "Ruled out: any mix with a heart lesion, an IVC web or a portal clot": said by lesion, not as a list of every mix (review U4). */
  function ruledOutText(res) {
    const out = res.families.filter((f) => f.status === 'out');
    if (!out.length) return null;
    const outIds = new Set(out.map((f) => f.id)), gone = new Set(LESION_IDS.filter((id) => FAMILIES.filter((f) => f.axes.includes(id)).every((f) => outIds.has(f.id))));
    const words = [], heart = gone.has('rhf') && gone.has('constr');
    if (heart) words.push('a heart lesion');
    for (const id of LESION_IDS) if (gone.has(id) && !(heart && (id === 'rhf' || id === 'constr'))) { const sh = LESION[id].short; words.push(/^[A-Z][a-z]/.test(sh) ? sh[0].toLowerCase() + sh.slice(1) : sh); }
    // (ruled out for what the mix does together, not for a lesion that is out on its own; a mix that only adds a trace to a smaller one is not ruled out, it is not needed)
    const rest = out.filter((f) => f.id !== 'none' && !f.redundant && !FAMILY[f.id].axes.some((id) => gone.has(id)));
    const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : words[0];
    const parts = [];
    if (outIds.has('none')) parts.push('a normal liver');
    if (words.length) parts.push(`any mix with ${list}`);
    if (rest.length) parts.push(`${rest.length} other ${rest.length === 1 ? 'mix' : 'mixes'}`);
    return parts.length ? `Ruled out by your readings: ${parts.join(', and ')}.` : null;
  }
  /** The names of readings, as a list: "WHVP, FHVP and RA". */
  const nameList = (keys) => { const n = keys.map((k) => READINGS[k].short); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] || ''; };
  // (Pressures that cannot all be true together are kept and said, quietly: a wrong zero level or a slip is not a disease. Review E8.)
  const notes = (res) => (res.warnings?.length ? h('div', { class: 'fr-notes' }, res.warnings.map((w) => h('p', { class: 'fr-note' }, w.text))) : null);
  // The textbook case or the one to guess, with what the search found, once the scenarios are up (review T1, T2).
  function caseBanner(res) {
    const c = TRY_CASES.find((x) => x.id === state.caseId);
    if (!c) return null;
    const lead = res.families.find((f) => !f.redundant), play = res.play.length ? res.play : lead ? [lead] : [];
    const said = [...state.guess].filter((id) => id !== 'none').sort().join('+');
    const hit = state.guessed && play.some((f) => [...FAMILY[f.id].axes].sort().join('+') === said);
    const leadWords = play.map((f) => FAMILY[f.id].short).join(' or ');
    const picked = state.guess.size ? [...state.guess].map((id) => (id === 'none' ? 'no lesion' : LESION[id].short.toLowerCase())).join(' + ') : 'nothing';
    return h('div', { class: 'fr-case' }, h('p', { class: 'fr-sub' }, state.guessed ? 'Your guess' : 'Textbook case'),
      h('p', {}, h('b', {}, c.label + '. '), c.note),
      state.guessed ? h('p', {}, `You picked ${picked}. The search leads with ${leadWords}. ${hit ? 'That is a match.' : 'Compare what it fits with your readings below.'}`) : null);
  }
  /** Cases to try: the readings load and the scenarios come up (T1); or one to guess first, its name kept back (T2). */
  function casesView() {
    return h('div', { class: 'fr-cases' },
      h('p', { class: 'fr-q' }, 'Try a case'),
      h('p', { class: 'fr-small' }, 'Each is a textbook set of readings. The search puts the right scenario among its leaders; the model has no patient behind it.'),
      h('button', { type: 'button', class: 'btn primary fr-guessgo', onclick: () => startCase(TRY_CASES[Math.floor(Math.random() * TRY_CASES.length)], true) }, 'Guess one first'),
      h('div', { class: 'fr-rg' }, h('ul', {}, TRY_CASES.map((c) => h('li', {}, h('button', { type: 'button', class: 'fr-rv', 'data-case': c.id, onclick: () => startCase(c, false) },
        h('span', { class: 'fr-rl' }, h('b', {}, c.label), h('i', {}, `${Object.keys(c.readings).length} readings`)), h('span', {}), h('span', { class: 'fr-chev', 'aria-hidden': 'true' })))))),
      h('div', { class: 'fr-foot' }, h('div', { class: 'fr-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { state.view = 'steps'; show(); } }, 'Back'))));
  }
  function startCase(c, guess) {
    state.raw = { ...c.readings }; state.caseId = c.id; state.guess = new Set(); state.guessed = false; state.open = new Set(); state.edit = false; state.back = null; state.step = 0;
    clearTimeout(askT); remote.set(entered()); lastSig = '';
    state.view = guess ? 'guess' : 'results';
    show();
  }
  /** Guess first: the readings, then the lesions the learner thinks explain them, then the scenarios. */
  function guessView() {
    const res = remote.peek(entered()), have = Object.keys(res.readings);
    const picks = ['none', ...LESION_IDS], word = (id) => (id === 'none' ? 'No lesion' : LESION[id].short);
    const reveal = h('button', { type: 'button', class: 'btn primary fr-next', onclick: () => { state.guessed = true; state.view = 'results'; lastSig = ''; show(); } }, 'Show what the search finds');
    reveal.disabled = !state.guess.size;
    const pills = h('div', { class: 'fr-pick', role: 'group', 'aria-label': 'Lesions you think explain these readings' }, picks.map((id) => {
      const b = h('button', { type: 'button', class: 'fr-rc', 'aria-pressed': String(state.guess.has(id)), 'data-id': id }, word(id));
      b.addEventListener('click', () => {
        if (id === 'none') state.guess = state.guess.has('none') ? new Set() : new Set(['none']);
        else { state.guess.delete('none'); if (state.guess.has(id)) state.guess.delete(id); else if (state.guess.size < 3) state.guess.add(id); }
        for (const x of pills.children) x.setAttribute('aria-pressed', String(state.guess.has(x.dataset.id)));
        reveal.disabled = !state.guess.size;
      });
      return b;
    }));
    return h('div', { class: 'fr-guess' },
      h('p', { class: 'fr-q' }, 'Which lesion explains these readings?'),
      h('p', { class: 'fr-small' }, 'Pick up to three, or no lesion. Then see what the search finds.'),
      h('div', { class: 'fr-yr' }, h('div', { class: 'fr-chips' }, have.map((k) => h('span', { class: 'fr-rc fr-rc-static' }, `${READINGS[k].short} ${chipText(k, res.readings[k])}`)))),
      pills,
      h('div', { class: 'fr-foot' }, h('div', { class: 'fr-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { state.view = 'cases'; show(); } }, 'Back'), reveal)));
  }
  function resultView() {
    const res = remote.peek(entered());   // (what was entered, over the grid and every patient the refinement has added: one source, never a result left over from earlier)
    const top = res.families.filter((f) => f.status === 'best' || f.status === 'tie'), possible = res.families.filter((f) => f.status === 'possible');
    const nx = nextText(res), dropped = res.dropped, topRating = res.families[0]?.rating ?? 1;
    const poor = res.ready && !res.fit.ok, bad = poor ? (res.fit.worst.length ? res.fit.worst.map((x) => x.key) : res.fit.conflict) : [];
    const head = !res.ready ? 'Not enough readings yet.' : poor ? 'No model scenario gives all of these readings.' : res.healthy ? 'These readings are in the model’s normal range.' : res.few ? `A short list from ${res.n} readings.` : top.length > 1 ? `${top.length} scenarios fit about equally.` : 'One scenario fits best.';
    const have = Object.keys(res.readings), ruled = res.ready ? ruledOutText(res) : null;
    const kids = [
      h('p', { class: 'fr-q' }, head),
      caseBanner(res),
      h('p', { class: 'fr-small' }, poor ? `The closest the model gets still misses ${bad.length ? nameList(bad) : 'several readings'} by more than the usual error. Check ${bad.length ? 'those readings' : 'the readings'} for a slip or a different zero level, or the cause may be one the model does not draw. These are the closest it gets, not scenarios that fit.` : res.healthy ? 'Every reading is within the model’s healthy range, so no lesion is needed. The model’s healthy patient is one set of readings; normal ranges in people are wider.' : res.few ? `With under ${FEW_READINGS} readings several lesions can fit, so this is what is possible, not a ranking. Each added reading narrows it.` : res.ready ? 'Each is a made-up patient built from your readings. The percentage is its relative fit, its share of the likelihood across the scenarios. Fewer lesions, each closer to healthy, rate higher. Opening one saves it under Patients as “Yours”.' : `The search needs ${RESULT_MIN} readings; ${res.n} entered.`),
      notes(res),
      // (the next reading goes straight under the head, where it teaches most)
      res.ready && nx ? h('div', { class: 'fr-next-note' }, h('span', { class: 'fr-pillnote' }, 'Next'), h('div', {}, h('p', {}, nx.lead), nx.rest.map((t) => h('p', { class: 'fr-fine' }, t)))) : null,
      have.length ? h('div', { class: 'fr-yr' }, h('p', { class: 'fr-sub' }, 'Your readings: tap one to change it'),
        h('div', { class: 'fr-chips' }, have.map((k) => h('button', { type: 'button', class: 'fr-rc', 'data-k': k, onclick: () => editReading(k, 'results') }, `${READINGS[k].short} ${chipText(k, res.readings[k])}`)))) : null,
      dropped.length ? h('p', { class: 'fr-fine fr-dropped' }, 'Left out: ' + dropped.map((d) => `${READINGS[d.key].short} (${d.why})`).join('; ') + '.') : null,
      res.ready ? h('p', { class: 'fr-fine fr-key' }, h('b', {}, 'Chips: '), 'filled fits, outlined is close, struck through does not fit.') : null,
      poor ? h('p', { class: 'fr-sub' }, 'Closest the model gets') : null,
      res.ready ? h('div', { class: 'fr-list' }, top.map((f) => card(f, res, topRating))) : null,
      // (Review T5: scenarios the model cannot tell apart are one teaching sentence, not three cards at 25%.)
      res.ready && !poor && res.tieNotes?.length ? h('div', { class: 'fr-ties' }, res.tieNotes.map((t) => h('p', { class: 'fr-fine' }, h('b', {}, 'The model cannot tell these apart. '), t.text))) : null,
      res.ready && possible.length ? h('div', { class: 'fr-also' }, h('p', { class: 'fr-sub' }, 'Also possible'), possible.map((f) => card(f, res, topRating))) : null,
      ruled ? h('p', { class: 'fr-fine' }, ruled) : null,
      res.ready ? h('p', { class: 'fr-fine fr-refine', 'aria-live': 'polite' }, refineText()) : null,
      h('p', { class: 'fr-fine' }, h('b', {}, 'Model scenarios, not diagnoses.'), ' Saved on this device only.'),
      h('div', { class: 'fr-foot' }, h('div', { class: 'fr-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { state.view = 'review'; show(); } }, 'Your readings'),
        h('button', { type: 'button', class: 'btn ghost', onclick: startOver }, 'Start over'))),
    ];
    return h('div', { class: 'fr-results', 'data-fitting': remote.status() === 'refining' ? '1' : '0' }, kids);
  }
  const sigOf = (res) => res.families.map((f) => `${f.id}${f.status}${f.score.toFixed(1)}${JSON.stringify(f.ranges)}`).join('|') + remote.status() + remote.progress().round;

  async function openYours(f) {
    const res = remote.peek(entered()), r = { ...res.readings };
    try { await ctx.openYours(f.id, f.best.p, r); closePopover(); } catch { announce('The patient could not be made right now.'); }
  }
  function startOver() { state.caseId = null; state.guess = new Set(); state.guessed = false; state.raw = {}; state.step = 0; state.view = 'steps'; state.edit = false; state.back = null; state.open = new Set(); remote.set({}); show(); }
  function go(d) {
    if (state.view === 'review') { if (d > 0) { clearTimeout(askT); remote.set(entered()); state.view = 'results'; lastSig = ''; show(); } return; }
    const to = state.step + d;
    if (state.edit || to >= STEPS.length) {
      const toResults = state.edit && state.back === 'results';
      state.edit = false; state.back = null; state.view = toResults ? 'results' : 'review';
      if (toResults) { clearTimeout(askT); remote.set(entered()); lastSig = ''; }
      show(); return;
    }
    if (to < 0) return;
    state.step = to; state.view = 'steps'; show();
  }
  const viewNow = () => (state.view === 'steps' ? stepView() : state.view === 'review' ? reviewView() : state.view === 'cases' ? casesView() : state.view === 'guess' ? guessView() : resultView());
  // The body's content swapped with the shared fade; the sheet itself never closes and opens again.
  // `focus`: a reading to put the cursor in once its step is up (a tap on it in the review).
  function show(focus = null) {
    if (!body) return;
    swapFade(body, () => {
      body.replaceChildren(viewNow());
      if (state.view === 'steps') liveParts();
      if (focus) { const t = body.querySelector(`input[data-k="${focus}"]`) || body.querySelector(`[data-k="${focus}"] button[aria-pressed="true"]`); t?.focus({ preventScroll: true }); }
    });
  }
  // While the fit runs the list holds still (dimmed, with its progress line), and is rebuilt once when it is done: the leader changes in
  // about a fifth of the cases between the grid's answer and the fitted one, so a list rebuilt every round moved under the reader (review U5).
  function onRemote() {
    if (state.view !== 'results' || !body) return;
    const line = body.querySelector('.fr-refine'), t = refineText();
    if (line && line.textContent !== t) swapText(line, t);
    if (remote.status() === 'refining') return;
    const res = remote.peek(entered()), sig = sigOf(res);
    if (sig === lastSig) return;
    lastSig = sig;
    swapFade(body, () => body.replaceChildren(resultView()), { instant: false });
  }

  return {
    open(anchor) {
      body = h('div', { class: 'fr-body' });
      el = popover(anchor, h('div', { class: 'fr' }, h('div', { class: 'fr-head' }, svgIcon('rewind', 'fr-ic'), h('b', {}, 'From readings'), h('span', {}, 'Work backward from what you measured')), body), { cls: 'fr-pop', title: 'From readings', align: 'start', onClose: () => { clearTimeout(askT); offRemote?.(); offRemote = null; body = null; el = null; } });
      if (!el) return;
      el.setAttribute('aria-label', 'From readings');
      body.replaceChildren(viewNow());
      if (state.view === 'steps') liveParts();
      offRemote = remote.on(onRemote);
    },
    close: () => closePopover(),
    dispose() { remote.dispose(); },
    // (for the tests: the state of the flow and the search it holds)
    state, remote,
  };
}
