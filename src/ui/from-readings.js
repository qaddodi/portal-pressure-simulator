// "From readings" (the patient menu's top row): the readings a person has, entered step by step, and the model scenarios that could give them
// (src/engine/inverse.js: a search over the engine's own lesion families, never a diagnosis). A sheet on a phone and a popover under the menu's
// button elsewhere, built by util.js popover so it is the same glass, the same sheet over the dock and the same Esc and outside tap as every menu.
//
// Four short steps (pressures; stiffness; spleen, blood and varices; fluid and flow), each with "Still possible: n of 11" under the rows so the
// narrowing is the feedback, and a Skip on every one: nothing is required, and a reading left blank is unknown, never a guess. With four or more
// readings in, the scenarios are listed (ties as ties), each with what it cannot explain, the settings that fit, what it would predict for the
// readings that were not entered, and what the model cannot show. The next reading that would split the candidates is named, or the plain
// statement that none the model makes would. "Open as patient" saves the scenario under Patients as "Yours" and loads it.
//
// Nothing here moves a frame: a step is swapped in with the shared fade (swapFade; Reduce Motion keeps the fade), and every colour is a token.

import { h, svgIcon, popover, closePopover, swapFade, swapText, announce } from './util.js';
import { createInverseRemote } from './inverse-remote.js';
import { FAMILIES, FAMILY, AXES } from '../engine/inverse-families.js';
import {
  READINGS, MIN_READINGS, FEW_READINGS, OUTSIDE, readingText, gapLine, rangeText,
} from '../engine/inverse.js';

export const STEPS = Object.freeze([
  { id: 'pressures', name: 'Pressures', q: 'Do you have pressures?', sub: 'From a hepatic vein catheter, an EUS or a right heart study. Enter any you have.', keys: ['whvp', 'fhvp', 'hvpg', 'pv', 'ppg', 'ivc', 'ra'] },
  { id: 'stiffness', name: 'Stiffness', q: 'Do you have liver or spleen stiffness?', sub: 'Either one helps.', keys: ['lsm', 'ssm'] },
  { id: 'size', name: 'Spleen and blood', q: 'Spleen, platelets and varices?', sub: 'Size on ultrasound or CT, the blood count, the endoscopy.', keys: ['spleen', 'plt', 'varix'] },
  { id: 'fluid', name: 'Fluid and flow', q: 'Ascites and portal flow?', sub: 'The ultrasound, a tap, the Doppler of the portal vein.', keys: ['asc', 'saag', 'pvVel'] },
]);

// What each row says under its name: where it comes from and how far a real reading may be from the model's (the allowed error, in the search's own table).
const SUBS = {
  whvp: 'Balloon wedged in a hepatic vein', fhvp: 'The same vein, free', hvpg: 'Only if you do not have both pressures above', pv: 'Portal vein, direct or EUS',
  ppg: 'Portal vein minus IVC (EUS-PPG)', ivc: 'IVC pressure', ra: 'Right atrial pressure', lsm: 'Liver, transient elastography', ssm: 'Spleen, transient elastography',
  spleen: 'Longest length', plt: 'Platelet count', varix: 'Esophageal varices at endoscopy', asc: 'Ascites on ultrasound', saag: 'Serum–ascites albumin gradient',
  pvVel: 'Mean velocity; 0 is no flow, negative runs away from the liver',
};
const tolText = (k) => { const r = READINGS[k]; return r.kind === 'grade' ? '' : r.kind === 'log' ? `±${Math.round(r.sigma * 100)}%` : `±${r.sigma}`; };
const RESULT_MIN = MIN_READINGS;

/** Words for a family's status in the chips and cards. */
const STATUS_WORD = { best: 'Fits best', tie: 'Fits about equally', possible: 'Possible', out: 'Ruled out' };
const MARK_WORD = { fit: 'fits', near: 'close', off: 'does not fit' };

/** The state of the flow, kept for the page's life so the sheet can be closed and opened again where it was left. */
const state = { step: 0, raw: {}, view: 'steps', edit: false };   // view: 'steps' | 'review' | 'results'; edit: a step opened from the review to change one reading   // raw: what was typed, by reading key (a string, or a grade index for asc and varix)

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

  // ── Still possible: every lesion type as a pill, filled where it fits, outlined where it is possible, struck through where the readings rule it out.
  // Made once for a step and updated in place at each key (the state is an attribute the stylesheet fades; the count crossfades), so nothing pops. ──
  let still = null;
  function makeStill() {
    const num = h('b', {}, String(FAMILIES.length)), fine = h('p', { class: 'fr-fine' });
    const pillEls = new Map(FAMILIES.map((f) => [f.id, h('span', { class: 'fr-pill', 'data-s': 'possible', role: 'listitem' }, f.short)]));
    const root = h('div', { class: 'fr-still' }, h('span', { class: 'fr-sub' }, 'Still possible'),
      h('div', { class: 'fr-count' }, num, h('span', {}, `of ${FAMILIES.length} lesion types`)),
      h('div', { class: 'fr-pills', role: 'list', 'aria-label': 'Lesion types' }, [...pillEls.values()]), fine);
    let first = true;
    const update = (res) => {
      const by = Object.fromEntries(res.families.map((f) => [f.id, chipState(res, f)]));
      for (const f of FAMILIES) { const st = by[f.id] || 'possible', pe = pillEls.get(f.id); pe.dataset.s = st; pe.setAttribute('aria-label', `${f.short}: ${STATUS_WORD[st].toLowerCase()}`); }
      const t = String(res.possible);
      if (num.textContent !== t) { if (first) num.textContent = t; else swapText(num, t); }
      first = false;
      fine.textContent = res.ready ? 'Filled: fits best or about equally. Outline: possible. Struck through: ruled out so far.' : `Filled once ${RESULT_MIN} readings are in. Struck through: ruled out so far.`;
    };
    return { el: root, update };
  }

  // ── A row of the entry ──
  function numRow(k) {
    const r = READINGS[k];
    const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: 'unknown', 'aria-label': `${r.label}${r.unit ? ' in ' + r.unit : ''}`, value: state.raw[k] ?? '', 'data-k': k });
    const hint = h('span', { class: 'fr-hint', 'aria-live': 'polite' });
    const row = h('label', { class: 'fr-row', 'data-known': state.raw[k] ? '1' : '0' },
      h('span', { class: 'fr-l' }, h('b', {}, r.label), h('i', {}, [SUBS[k], tolText(k) && `allowed error ${tolText(k)}`].filter(Boolean).join(' · '))),
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
    return h('div', { class: 'fr-row fr-grade' }, h('span', { class: 'fr-l' }, h('b', {}, r.label), h('i', {}, SUBS[k])), seg);
  }

  // ── The steps ──
  function stepView() {
    const st = STEPS[state.step], res = remote.peek(entered()), n = res.n, last = state.step === STEPS.length - 1;
    still = makeStill(); still.update(res);
    const here = st.keys.some((k) => state.raw[k] != null && state.raw[k] !== '');
    const dots = h('div', { class: 'fr-prog', role: 'img', 'aria-label': `Step ${state.step + 1} of ${STEPS.length + 1}` }, [...STEPS, null].map((_, i) => h('i', { class: i <= state.step ? 'on' : '' })));
    const nextBtn = h('button', { type: 'button', class: 'btn primary fr-next', onclick: () => go(1) }, nextLabel(here, last));
    const kids = [
      dots, h('p', { class: 'fr-q' }, st.q), h('p', { class: 'fr-small' }, st.sub),
      h('div', { class: 'fr-rows' }, st.keys.map((k) => (READINGS[k].kind === 'grade' ? gradeRow(k) : numRow(k)))),
      h('div', { class: 'fr-derived', 'aria-live': 'polite' }),
      still.el,
      h('p', { class: 'fr-need' }, needText(n)),
      h('div', { class: 'fr-btns' }, state.step > 0 && !state.edit ? h('button', { type: 'button', class: 'btn', onclick: () => go(-1) }, 'Back') : null, nextBtn),
      h('p', { class: 'fr-fine' }, h('b', {}, 'Model scenarios, not diagnoses.')),
    ];
    return h('div', { class: 'fr-step', 'data-step': st.id }, kids);
  }
  // The one button's words: while a reading is being changed from the review it goes back there; otherwise the next step, or the review after the last.
  const nextLabel = (here, last) => (state.edit ? 'Back to your readings' : last ? 'Review your readings' : here ? `Next: ${STEPS[state.step + 1].name.toLowerCase()}` : 'I do not have these: skip');
  const needText = (n) => (n >= RESULT_MIN ? `${n} readings entered. Enough to search.` : `${n} of the ${RESULT_MIN} readings the search needs.`);
  /** The step's live parts, updated in place at each key: the still-possible block, the derived HVPG and the count of readings. No swap, so typing is never interrupted. */
  function liveParts() {
    if (!body || state.view !== 'steps') return;
    const res = remote.peek(entered());
    still?.update(res);
    const need = body.querySelector('.fr-need'); if (need) need.textContent = needText(res.n);
    const nb = body.querySelector('.fr-next');
    if (nb) { const st = STEPS[state.step], here = st.keys.some((k) => state.raw[k] != null && state.raw[k] !== ''); nb.textContent = nextLabel(here, state.step === STEPS.length - 1); }
    const d = body.querySelector('.fr-derived'), v = entered();
    if (d) d.textContent = state.step === 0 && v.whvp != null && v.fhvp != null && !Number.isNaN(v.whvp + v.fhvp) ? `HVPG ${(v.whvp - v.fhvp).toFixed(1)} mmHg, from the two pressures.` : '';
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
    const val = (id) => { const v = nx.by.find((x) => x.id === id)?.value; return r.kind === 'grade' ? null : v == null ? null : readingText(nx.key, v); };
    if (nx.verdict === 'none') return { lead: 'No reading this model makes would split them.', rest: res.play.map((f) => `${lab(f.id)}: ${OUTSIDE[f.id]}`) };
    const [a, b] = nx.pair, va = val(a), vb = val(b), pair = va && vb ? ` ${lab(a)} predicts about ${va}, ${lab(b)} about ${vb}.` : '';
    return { lead: nx.verdict === 'splits' ? `Next reading to take: ${r.label.toLowerCase()}. It would split ${lab(a)} from ${lab(b)}.${pair}` : `Next reading: ${r.label.toLowerCase()} helps only a little.${pair}`, rest: [] };
  }
  const refineText = () => {
    const s = remote.status(), p = remote.progress();
    if (s === 'refining') return `Checking settings near the best fits (round ${Math.max(1, p.round + 1)} of ${p.rounds})…`;
    if (s === 'done') return 'Settings checked near the best fits.';
    if (s === 'library') return 'Searched the grid of settings only; the finer check is not available here.';
    return '';
  };
  const fitChips = (f, res) => h('div', { class: 'fr-marks', role: 'list', 'aria-label': 'How each reading you entered fits' },
    Object.keys(res.readings).map((k) => h('span', { class: 'fr-mark', 'data-m': f.marks[k], role: 'listitem', 'aria-label': `${READINGS[k].short} ${MARK_WORD[f.marks[k]]}` }, READINGS[k].short)));
  const fitWith = (f) => FAMILY[f.id].axes.map((k) => `${AXES[k].label.toLowerCase()} ${rangeText(k, f.ranges[k])}`);
  const PREDICT_KEYS = ['pv', 'ppg', 'ra', 'ivc', 'ssm', 'pvVel', 'saag', 'lsm', 'spleen', 'plt'];
  const predictLine = (f, res) => PREDICT_KEYS.filter((k) => !(k in res.readings) && f.predicts[k]).slice(0, 4).map((k) => {
    const [lo, hi] = f.predicts[k], r = READINGS[k], t = (v) => readingText(k, v).replace(` ${r.unit}`, '');
    return `${r.short} ${Math.abs(hi - lo) < (r.kind === 'log' ? lo * 0.03 : 0.15) ? t(lo) : `${t(lo)} to ${t(hi)}`}${r.unit ? ' ' + r.unit : ''}`;
  });
  function card(f, res) {
    const fam = FAMILY[f.id];
    return h('article', { class: 'fr-card', 'data-s': f.status, 'data-f': f.id },
      h('div', { class: 'fr-ct' }, h('b', {}, fam.label), h('span', { class: 'fr-st' }, STATUS_WORD[f.status] + (fam.parts ? ' · two lesions' : ''))),
      h('p', { class: 'fr-cs' }, fam.sub),
      fitChips(f, res),
      h('dl', { class: 'fr-kv' },
        h('dt', {}, 'Fits with'), h('dd', {}, fitWith(f).join('; ')),
        h('dt', {}, 'Cannot explain'), h('dd', {}, f.gaps.length ? f.gaps.map((g) => gapLine(g)).join(' ') : 'Nothing: every reading you entered is within the usual error.'),
        predictLine(f, res).length ? [h('dt', {}, 'Would predict'), h('dd', {}, predictLine(f, res).join(', ') + '. You did not enter these.')] : null,
        h('dt', {}, 'Not in the model'), h('dd', {}, [fam.limits, OUTSIDE[f.id], fam.ev].filter(Boolean).join(' '))),
      h('div', { class: 'fr-acts' }, h('button', { type: 'button', class: f.status === 'possible' ? 'btn' : 'btn primary', onclick: () => openYours(f) }, 'Open as patient')));
  }
  // ── Your readings: every reading by step, unknown where none was entered, each a button that opens its step ──
  const typed = (k) => String(state.raw[k] ?? '').trim().replace(',', '.');
  function reviewRow(k, res, why) {
    const r = READINGS[k], known = state.raw[k] != null && state.raw[k] !== '', v = parse(k, state.raw[k]);
    const derived = !known && k === 'hvpg' && 'whvp' in res.readings && 'fhvp' in res.readings;
    const bad = known && (Number.isNaN(v) || (r.kind !== 'grade' && (v < r.min || v > r.max)));
    let val, note = '';
    if (known && r.kind === 'grade') val = h('b', {}, r.grades[v] ?? typed(k));
    else if (known) val = h('span', { class: 'fr-val' }, h('b', {}, typed(k)), r.unit ? h('em', {}, r.unit) : null);
    else if (derived) val = h('span', { class: 'fr-val' }, h('b', {}, (res.readings.whvp - res.readings.fhvp).toFixed(1)), h('em', {}, r.unit));
    else val = h('span', { class: 'fr-unk' }, 'Unknown');
    if (bad) note = `Not used: ${Number.isNaN(v) ? 'not a number' : `outside ${r.min} to ${r.max}`}`;
    else if (known && why[k]) note = `Not used: ${why[k]}`;
    else if (derived) note = 'Made from the two pressures above';
    const row = h('button', { type: 'button', class: 'fr-rv', 'data-k': k, 'data-s': known ? (bad || why[k] ? 'off' : 'on') : derived ? 'derived' : 'unknown', 'aria-label': `${r.label}: ${known ? typed(k) : derived ? 'made from the two pressures' : 'unknown'}. Change` },
      h('span', { class: 'fr-rl' }, h('b', {}, r.label), note ? h('i', {}, note) : null), val, h('span', { class: 'fr-chev', 'aria-hidden': 'true' }));
    row.addEventListener('click', () => { state.step = STEPS.findIndex((st) => st.keys.includes(k)); state.view = 'steps'; state.edit = true; show(k); });
    return h('li', {}, row);
  }
  function reviewView() {
    const res = remote.peek(entered()), why = Object.fromEntries(res.dropped.map((d) => [d.key, d.why]));
    const total = STEPS.reduce((n, st) => n + st.keys.length, 0), have = Object.keys(state.raw).length;
    const groups = STEPS.map((st) => h('section', { class: 'fr-rg', 'aria-label': st.name },
      h('div', { class: 'fr-rgh' }, h('b', {}, st.name), h('span', {}, `${st.keys.filter((k) => state.raw[k] != null && state.raw[k] !== '').length} of ${st.keys.length}`)),
      h('ul', {}, st.keys.map((k) => reviewRow(k, res, why)))));
    const ok = res.n >= RESULT_MIN, go2 = h('button', { type: 'button', class: 'btn primary fr-next', onclick: () => go(1) }, 'Show scenarios');
    go2.disabled = !ok;
    return h('div', { class: 'fr-review' },
      h('div', { class: 'fr-prog', role: 'img', 'aria-label': `Step ${STEPS.length + 1} of ${STEPS.length + 1}` }, [...STEPS, null].map(() => h('i', { class: 'on' }))),
      h('p', { class: 'fr-q' }, 'Your readings'),
      h('p', { class: 'fr-small' }, `${have} of ${total} entered. Tap a reading to change it. Anything left blank stays unknown, and the search never fills it in.`),
      groups,
      h('p', { class: 'fr-need' }, needText(res.n)),
      h('div', { class: 'fr-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { state.step = STEPS.length - 1; state.view = 'steps'; state.edit = false; show(); } }, 'Back'), go2),
      h('p', { class: 'fr-fine' }, h('b', {}, 'Model scenarios, not diagnoses.')));
  }
  function resultView() {
    const res = remote.peek(entered());   // (what was entered, over the grid and every patient the refinement has added: one source, never a result left over from earlier)
    const top = res.families.filter((f) => f.status === 'best' || f.status === 'tie'), possible = res.families.filter((f) => f.status === 'possible'), out = res.families.filter((f) => f.status === 'out');
    const nx = nextText(res), dropped = res.dropped;
    const head = !res.ready ? 'Not enough readings yet.' : res.few ? `A short list from ${res.n} readings.` : top.length > 1 ? `${top.length} scenarios fit about equally.` : 'One scenario fits best.';
    const kids = [
      h('p', { class: 'fr-q' }, head),
      h('p', { class: 'fr-small' }, res.few ? `With under ${FEW_READINGS} readings several lesions can fit, so this is what is possible, not a ranking. Each added reading narrows it.` : res.ready ? 'Each is a made-up patient built from your readings. Opening one saves it under Patients as “Yours”.' : `The search needs ${RESULT_MIN} readings; ${res.n} entered.`),
      dropped.length ? h('p', { class: 'fr-fine fr-dropped' }, 'Left out: ' + dropped.map((d) => `${READINGS[d.key].short} (${d.why})`).join('; ') + '.') : null,
      res.ready ? top.map((f) => card(f, res)) : null,
      res.ready && possible.length ? h('div', { class: 'fr-also' }, h('p', { class: 'fr-sub' }, 'Also possible'), possible.map((f) => card(f, res))) : null,
      res.ready && out.length ? h('p', { class: 'fr-fine' }, `Ruled out by your readings: ${out.map((f) => f.short).join(', ')}.`) : null,
      res.ready && nx ? h('div', { class: 'fr-next-note' }, h('span', { class: 'fr-pillnote' }, 'Next'), h('div', {}, h('p', {}, nx.lead), nx.rest.map((t) => h('p', { class: 'fr-fine' }, t)))) : null,
      res.ready ? h('p', { class: 'fr-fine fr-refine', 'aria-live': 'polite' }, refineText()) : null,
      h('div', { class: 'fr-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { state.view = 'review'; show(); } }, 'Your readings'),
        h('button', { type: 'button', class: 'btn ghost', onclick: startOver }, 'Start over')),
      h('p', { class: 'fr-fine' }, h('b', {}, 'Model scenarios, not diagnoses.'), ' Saved on this device only.'),
    ];
    return h('div', { class: 'fr-results' }, kids);
  }
  const sigOf = (res) => res.families.map((f) => `${f.id}${f.status}${f.score.toFixed(1)}${JSON.stringify(f.ranges)}`).join('|') + remote.status() + remote.progress().round;

  async function openYours(f) {
    const res = remote.peek(entered()), r = { ...res.readings };
    try { await ctx.openYours(f.id, f.best.p, r); closePopover(); } catch { announce('The patient could not be made right now.'); }
  }
  function startOver() { state.raw = {}; state.step = 0; state.view = 'steps'; state.edit = false; remote.set({}); show(); }
  function go(d) {
    if (state.view === 'review') { if (d > 0) { clearTimeout(askT); remote.set(entered()); state.view = 'results'; lastSig = ''; show(); } return; }
    const to = state.step + d;
    if (state.edit || to >= STEPS.length) { state.edit = false; state.view = 'review'; show(); return; }
    if (to < 0) return;
    state.step = to; state.view = 'steps'; show();
  }
  const viewNow = () => (state.view === 'steps' ? stepView() : state.view === 'review' ? reviewView() : resultView());
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
  function onRemote() {
    if (state.view !== 'results' || !body) return;
    const res = remote.peek(entered()), sig = sigOf(res);
    if (sig === lastSig) return;
    lastSig = sig;
    swapFade(body, () => body.replaceChildren(resultView()), { instant: false });
  }

  return {
    open(anchor) {
      body = h('div', { class: 'fr-body' });
      el = popover(anchor, h('div', { class: 'fr' }, h('div', { class: 'fr-head' }, svgIcon('scenario', 'fr-ic'), h('b', {}, 'From readings'), h('span', {}, 'Work backward from what you measured')), body), { cls: 'fr-pop', title: 'From readings', align: 'start', onClose: () => { clearTimeout(askT); offRemote?.(); offRemote = null; body = null; el = null; } });
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
