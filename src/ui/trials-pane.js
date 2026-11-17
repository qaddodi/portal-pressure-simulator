// The Trials tab of the Tests card (Mohammad, 14 Nov 2026, designs A and D of the trial-card mocks; rebuilt 15 Nov 2026 from the trials card
// review, /mnt/project-files/recs/trials-card-review.md): the landmark trials (trials.js) against the patient on screen. It loads after the first
// paint (main.js lazy(), lazy-pane.js), as the Doppler and the FibroScan do.
//
//   List    "Trials for this patient", the patient's own HVPG, varices and ascites, then (TC-L1):
//             Closest to this patient   the one or two trials whose key rules this patient meets best (closestOf), lifted, with a pip per key rule;
//             Also possible · N         the other trials that may fit, folded;
//             Not this patient · N      folded, with a chip per rule that keeps trials out ("Bleeding now 5"): a chip opens its trials;
//             Needs history · N         the trials whose defining rules the model cannot check, folded.
//           A row is two lines (TC-L2): the trial's name and its two rates with the outcome word ("16% vs 27% decompensated"), then why it is
//           where it is. A tap opens it in place (TC-L4, L5): what it taught (draft lines, Mohammad to approve), the deck's design A drawing
//           (endpoint, the arms' numbers, bars that grow, the effect, the caveat), the entry rules against this patient as a checklist (TC-L3),
//           the Model line (the model runs the treatment on a copy of this patient), Baveno VIII in short (TC-T2) and the source.
//   Forest  every trial's primary ratio on one log scale, grouped by kind (trial-forest.js), the closest trials in full ink (TC-V4).
// Whether a patient fits is trial-fit.js, with the case history of the preset and of this session (TC-fit-3). A trial's numbers are its own, never
// the model's; the Model line is the one place a model number sits beside a trial, and it says so.
//
// Motion (TC-M1-M5, nothing pops): rows are kept nodes, keyed by section and trial, and placed with reconcile (util.js): a row that comes rises
// in, one that goes fades, and the rest glide to their places by transform; text that changes cross-fades (swapText); a fold opens with
// foldHidden; List and Forest cross-fade (swapFade); counts roll (countTo, 0.4 s); the Model line's treated value rolls from the patient's own.
// Reduce Motion: the same changes as fades.
//
// Nothing here runs per frame: the dock's refresh hands every model frame to update(), which compares a few numbers and, when the patient has
// changed in a way the card shows, builds the card again between frames (rest-pass.js). The HVPG in the head line is drawn on the GPU as it
// changes (gl-words.js), so a value that eases writes nothing into the page.

import { store, hiddenNow } from './store.js';
import { h, fmt, reconcile, swapFade, swapText, foldHidden, countTo } from './util.js';
import { host } from './host.js';
import { restPass } from './rest-pass.js';
import { glWords } from './gl-words.js';
import { readMetric } from './layout-snap.js';
import { caught } from './caught.js';
import { D_SMALL } from './ease.js';
import { TRIAL_IDS, trialOf, trialSource, bavenoLine } from './trials.js';
import { fitTrial, failedRows, openDefining, groupOf, countWords, possiblyWords, whyNot, lcFirst, stillNeeded, FITS_HEAD, FITS_WORDS, NOT_IN_MODEL } from './trial-fit.js';
import { createForest, ratiosOf, ratioText } from './trial-forest.js';
import { createTrial } from './tool-trial.js';
import { hvpgSev, ppgSev, hvBlocked, NOT_MEASURABLE, PTIPS_HVPG } from '../engine/pressure-cuts.js';
import { PRESETS } from '../engine/scenario.js';

export const GROUPS = Object.freeze([['fits', FITS_HEAD], ['possible', 'Possibly fits'], ['no', 'Not this patient'], ['unknown', 'Cannot tell from the model']]);
/** The list's sections, in order: [key, heading]. */
export const SECTIONS = Object.freeze([['closest', 'Closest to this patient'], ['also', 'Also possible'], ['no', 'Not this patient'], ['unknown', 'Needs history the model lacks']]);
const MARK = { yes: '✓', no: '✕', na: '?' };
const MARK_WORD = { yes: 'Met', no: 'Not met', na: 'Not known' };
// (How often the card is built again for a value that drifts with no change of group or band: the disease clock moving the HVPG a tenth.)
const DRIFT_MS = 3000;
const CLOSEST_MAX = 2;

/** What the model can do of a trial's treatment, from its treated arm: a change to the params, and its name in the Model line; or, for a treatment
 *  the model holds but does not run as the trial did (albumin), { name, kind } with no patch; or null. */
export function modelRx(t) {
  const arm = (t?.arms || []).find((a) => a.side === 'treat') || t?.arms?.[0];
  const s = `${arm?.label || ''} ${t?.name || ''}`;
  if (/carvedilol/i.test(arm?.label || '')) return { name: 'carvedilol', patch: { drugs: { carvedilol: true } } };
  if (/propranolol/i.test(arm?.label || '')) return { name: 'propranolol', patch: { drugs: { propranolol: true } } };
  if (/beta-blocker|\bNSBB\b/i.test(arm?.label || '')) return { name: 'carvedilol', patch: { drugs: { carvedilol: true } } };
  if (/\bTIPS\b/.test(arm?.label || '') && !/before TIPS/i.test(s)) return { name: 'TIPS', patch: { tips: { on: true, d: 8 } } };
  if (/terlipressin/i.test(arm?.label || '')) return { name: 'terlipressin', patch: { drugs: { terlipressin: true } } };
  if (/albumin/i.test(arm?.label || '')) return { name: 'albumin', kind: 'albumin', patch: null };
  return null;
}
const rxOn = (rx, p) => (rx.patch.tips ? !!p?.tips?.on : Object.keys(rx.patch.drugs).every((k) => p?.drugs?.[k]));
/** Whether a trial has a band ligation arm: its Model line says that ligation treats the varix, not the pressure (TC-T5). */
export const hasEvlArm = (t) => (t?.arms || []).some((a) => /band ligation|\bEVL\b/i.test(a.label));

/** The patient's facts as the card states them: the HVPG (null when it is not known), and the varix and ascites words. */
export function patientFacts(m, p, st) {
  const hid = !!hiddenNow(st)?.has('trueHVPG'), meas = st?.lastHVPG?.hvpg;
  const blocked = hvBlocked(p);
  const hvpg = blocked ? null : !hid ? m?.hvpg : Number.isFinite(meas) ? meas : null;
  const vx = m?.varix, g = vx?.grade?.label;
  const varix = !vx ? '' : !vx.present || g === 'None' ? 'No varices' : `${g} varices`;
  const a = m?.ascites, asc = !a ? '' : a.grade ? `Ascites ${fmt((a.volume || 0) / 1000, 1)} L` : 'No ascites';
  return { hvpg, blocked, varix, ascites: asc };
}

/** The case history fitTrial reads (TC-fit-3): the preset's own (scenario.js `facts`), and this session's, once it has shown ascites or a bleed.
 *  A preset that says decompensated wins (it is the case's history); a session that saw a decompensation says so next; else the preset's word. */
export function historyOf(presetId, seenDecomp) {
  const pf = PRESETS.find((x) => x.id === presetId)?.facts;
  if (pf?.decompensated === true) return { decompensated: true };
  if (seenDecomp) return { decompensated: true, source: 'session' };
  return pf && typeof pf.decompensated === 'boolean' ? { decompensated: pf.decompensated } : null;
}

/** Each trial's fit for this patient, in the order of trials.js, then grouped: { fits: [], possible: [], no: [], unknown: [] } of { t, fit }. */
export function sortTrials(ids, m, p, facts, history = null) {
  const view = { ...m, hvpg: facts.hvpg };
  const out = { fits: [], possible: [], no: [], unknown: [] };
  for (const id of ids) { const t = trialOf(id); if (t) { const fit = fitTrial(t, view, p, history); out[groupOf(fit)].push({ t, fit }); } }
  return out;
}

/** The list's sections from the groups (TC-L1): closest (every trial that matches, then the possible ones ranked by the share of key rules met,
 *  then by how many, at most CLOSEST_MAX in all), also (the rest that may fit), no and unknown. */
export function closestOf(groups) {
  const share = ({ fit }) => (fit.of ? fit.met / fit.of : 0);
  const ranked = [...groups.fits, ...groups.possible.map((q, i) => ({ q, i })).sort((a, b) => share(b.q) - share(a.q) || b.q.fit.met - a.q.fit.met || a.i - b.i).map((x) => x.q)];
  return { closest: ranked.slice(0, CLOSEST_MAX), also: ranked.slice(CLOSEST_MAX), no: groups.no, unknown: groups.unknown };
}

/** A failing rule as a chip's words: what the trial needs that this patient lacks ("Bleeding now", "HVPG ≥10", "Albumin <3.0"). */
const CHIP = {
  cirrhosis: 'Cirrhosis', compensated: 'Compensated', decompensated: 'Decompensated', ascites: 'Ascites', acute_bleed: 'Bleeding now',
  varices_present: 'Varices', varices_medium_large: 'Varices ≥5 mm', varices_high_risk: 'High-risk varices', varices_not_high_risk: 'No high-risk varices',
  gastric_varices: 'Fundal varices', diuretics: 'On diuretics', tips: 'TIPS in place', no_tips: 'No TIPS',
};
export function chipOf(row) {
  if (!row) return null;
  if (row.need) return `${{ hvpg_ge: 'HVPG', albumin_lt: 'Albumin', platelets_ge: 'Platelets', ascitic_protein_lt: 'Ascitic protein' }[row.test] || row.rule} ${row.need}`;
  return CHIP[row.test] || row.rule;
}
/** The chips of the "Not this patient" fold: [{ key, label, ids }], the most common rule first. Each trial counts once, under its first failing rule. */
export function chipsOf(no) {
  const by = new Map();
  for (const { t, fit } of no) {
    const label = chipOf(failedRows(fit)[0]);
    if (!label) continue;
    if (!by.has(label)) by.set(label, { key: label, label, ids: [] });
    by.get(label).ids.push(t.id);
  }
  return [...by.values()].sort((a, b) => b.ids.length - a.ids.length);
}

/** Why a trial is in its group, in a line: the rules it fails, or the rules the model cannot check. */
export function reasonOf(t, fit) {
  if (fit.verdict === 'no') return failedRows(fit).map((r) => `${r.rule} (${r.value === NOT_IN_MODEL ? 'not in the model' : lcFirst(r.value)})`).join('; ');
  if (fit.verdict === 'unknown') {
    if (!fit.rows.length) return 'Its entry rules are not listed yet';
    // (The group heading already says "Possibly fits": the row gives the count and the defining rules still open; fine print waits for the open trial.)
    const open = `Not in the model: ${openDefining(fit).map((r) => lcFirst(r.rule)).join(', ')}`;
    return groupOf(fit) === 'possible' ? `${countWords(fit)}. ${open}` : open;
  }
  // (A full match is not eligibility: the line says so and names the rules still open, R01.)
  return [FITS_WORDS, stillNeeded(fit) && `${stillNeeded(fit)}.`].filter(Boolean).join(' ');
}
/** A row's second line (TC-L2): short. A trial that fails says the one rule and this patient's value ("HVPG 8.2, needs ≥10"). */
export const rowReason = (t, fit) => (fit.verdict === 'no' ? whyNot(fit) || reasonOf(t, fit) : reasonOf(t, fit));

const treatArm = (t) => (t.arms || []).find((a) => a.side === 'treat') || t.arms?.[0];
const others = (t) => (t.arms || []).filter((a) => a !== treatArm(t));
/** "Beta-blocker vs placebo". */
export const comparisonOf = (t) => (t.arms || []).map((a, i) => (i ? lcFirst(a.label) : a.label)).join(' vs ');
/** The row's numbers in words (TC-L2, A5): ["16%", " vs 27% decompensated"]; a trial with no per-arm result reads its outcome word alone. */
export function ratesOf(t) {
  const tr = treatArm(t);
  // (A trial that reported no result per arm (MACHT) gives what it did report: its effect, "No difference (P = 0.402)", not an empty row.)
  if (!tr) return [t.arms.length ? (t.outcome ? t.outcome.charAt(0).toUpperCase() + t.outcome.slice(1) : '') : (t.effect || ''), ''];
  const rest = others(t);
  return [`${tr.rate}%`, `${rest.length ? ` vs ${rest.map((a) => `${a.rate}%`).join(' / ')}` : ''}${t.outcome ? ` ${t.outcome}` : ''}`];
}
/** "Lancet 2019 · Villanueva · 201 randomized · PMID 30910320". */
export const sourceLine = (t) => `${trialSource(t)} · ${t.n} randomized${t.pmid ? ` · PMID ${t.pmid}` : ''}`;
/** The pips of a row (TC-L1), one letter per key rule (defining, not context): 'y' met, 'x' failed, 'o' not known. */
export const pipsOf = (fit) => fit.rows.filter((r) => r.defining && !r.context).map((r) => (r.state === 'yes' ? 'y' : r.state === 'no' ? 'x' : 'o')).join('');
/** The open trial's checklist (TC-L3): defining rules first, then the fine print. */
export const ruleRows = (fit) => [...fit.rows.filter((r) => r.defining), ...fit.rows.filter((r) => !r.defining)];
/** Baveno VIII 5.31 checked against the patient's HVPG (TC-A2): the HVPG ≥20 rule is the one the model can check. */
export function today531(hvpg, bleeding) {
  if (!Number.isFinite(hvpg)) return 'This patient: HVPG not measured.';
  const v = `HVPG ${fmt(hvpg, 1)} mmHg`;
  if (!bleeding) return `The HVPG rule applies at a bleed. This patient: ${v}.`;
  return hvpg >= PTIPS_HVPG ? `This patient is bleeding with ${v}: meets the HVPG rule.` : `This patient is bleeding with ${v}: under the HVPG rule.`;
}

export function createTrialsPane() {
  let mode = 'list';
  try { if (localStorage.getItem('pps.trialsView') === 'forest') mode = 'forest'; } catch (e) { caught('trials:mode', e); }
  const el = h('div', { class: 'instrument-view trials-view', 'data-pane': 'trials', 'data-mode': mode });
  const sw = h('div', { class: 'pressure-switch', role: 'group', 'aria-label': 'Trials view' },
    [['list', 'List'], ['forest', 'Forest']].map(([v, label]) => h('button', { type: 'button', class: 'ps-btn', 'data-view': v, 'aria-pressed': String(v === mode), onclick: () => setMode(v) }, label)));
  const head = h('div', { class: 'tr-hd' }, h('div', { class: 'tr-t' }, 'Trials for this patient'));
  const line = h('div', { class: 'tr-s' });
  head.append(line);
  const list = h('div', { class: 'tr-list' });
  let forestSel = null;
  const forest = createForest({ onSelect: (id) => { forestSel = id; } });
  const forestWrap = h('div', { class: 'tr-forest' }, forest.el);
  const body = h('div', { class: 'tr-body' }, list, forestWrap);
  el.append(sw, head, body);

  // ── The list's sections: kept nodes, each with its items container ──
  const secs = {};
  const open = { also: false, no: false, unknown: false };   // (which folds are open: kept for the session)
  let chipSel = null;   // (the chip whose trials the "Not this patient" fold shows, or null for all)
  for (const [k, label] of SECTIONS) {
    const items = h('div', { class: 'tr-items', id: `tr-items-${k}` });
    if (k === 'closest') {
      const none = h('div', { class: 'tr-none', hidden: '' }, 'No trial\'s key rules are met by this patient yet.');
      const wrap = h('section', { class: 'tr-sec', 'data-sec': k }, h('div', { class: 'tr-grp', role: 'heading', 'aria-level': '3' }, label), none, items);
      secs[k] = { wrap, items, none };
    } else {
      const n = h('span', { class: 'tr-fn' }, '0');
      const hd = h('button', { type: 'button', class: 'tr-fh', 'data-fold': k, 'aria-expanded': 'false', 'aria-controls': `tr-items-${k}` },
        h('span', { class: 'tr-ft' }, label), h('span', { class: 'tr-fc' }, n, h('span', { class: 'tr-chev', 'aria-hidden': 'true' })));
      const chips = k === 'no' ? h('div', { class: 'tr-chips', role: 'group', 'aria-label': 'What these trials need' }) : null;
      const fb = h('div', { class: 'tr-fb', hidden: '' }, items);
      const wrap = h('section', { class: 'tr-sec tr-fold', 'data-sec': k, hidden: '' }, hd, chips, fb);
      secs[k] = { wrap, items, hd, n, chips, fb, chipNodes: new Map() };
    }
    list.append(secs[k].wrap);
  }
  list.addEventListener('click', onClick);

  // ── The open trial: one design A drawing, moved into the block that is open ──
  const tool = createTrial({ head: false });
  const rows = new Map();   // (row nodes by `${section}:${id}`)
  let block = null;         // ({ key, el, id, rules, rulesSig, model, gen } for the open trial)

  let frame = null, openId = null, built = null, ask = 0, driftT = 0, hvWords = null, gen = 0, lineSig = '', seenDecomp = false;
  const models = new Map();   // (the Model line's answers for this patient, by treatment: cleared when the patient changes)
  // What the card was last built from: the patient (params, preset), and each fact that changes what it shows.
  const K = { p: null, preset: null, hid: null, band: null, vg: null, ag: null, gv: null, bl: null, cross: -1, hv10: NaN, at: 0 };

  function setMode(v) {
    if (v === mode) return;
    mode = v;
    for (const b of sw.children) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    try { localStorage.setItem('pps.trialsView', v); } catch (e) { caught('trials:mode', e); }
    // (TC-M2: the two views cross-fade, never a one-frame swap.)
    swapFade(body, () => { el.dataset.mode = mode; if (built) configureForest(built); });
  }
  function configureForest(b) {
    const notes = {}, whys = {};
    for (const [g] of GROUPS) for (const { t, fit } of b.groups[g]) {
      notes[t.id] = g === 'fits' ? `${FITS_WORDS}` : g === 'no' ? 'Not this patient.' : g === 'possible' ? 'Some entry rules are not in the model.' : 'The model cannot tell whether this patient fits.';
      if (g === 'no') whys[t.id] = `Not this patient: ${whyNot(fit)}`;
      else if (g === 'possible') whys[t.id] = possiblyWords(fit);
    }
    // (TC-V4: the closest trials in full ink, so free play, whose "matches" group is mostly empty, still shows which trial bears on the patient.)
    const lit = new Set(b.secs.closest.map((q) => q.t.id));
    if (forestSel == null || !trialOf(forestSel)) forestSel = b.secs.closest[0]?.t.id ?? null;
    if (mode === 'forest') forest.configure({ ids: TRIAL_IDS, highlight: lit, selected: forestSel, notes, why: whys });
  }

  // ── Per frame: a few comparisons, nothing built ──
  function update(f) {
    if (!f?.metrics) return;
    frame = f;
    const st = store.get(), m = f.metrics, p = st.params;
    const hid = !!hiddenNow(st)?.has('trueHVPG');
    const hv = hid ? st.lastHVPG?.hvpg : m.hvpg, hvOk = Number.isFinite(hv) && !hvBlocked(p);
    const band = hvOk ? hvpgSev(hv) : '';
    const vg = m.varix?.present ? m.varix.grade?.label : 'None', ag = m.ascites?.grade ?? -1, gv = !!m.gastricVarix?.present, bl = !!m.bleeding;
    const hv10 = hvOk ? Math.round(hv * 10) : NaN;
    const same = K.p === p && K.preset === st.presetId && K.hid === hid && K.band === band && K.vg === vg && K.ag === ag && K.gv === gv && K.bl === bl && crossings(hv) === K.cross;
    if (!same) { askBuild(); return; }
    // Only the HVPG moved: its number is drawn as it changes; the rest of the card is brought up to date now and then.
    if (hv10 !== K.hv10 && !Number.isNaN(hv10)) {
      K.hv10 = hv10;
      hvWords?.set(fmt(hv, 1));   // alloc-rare: only when the HVPG shown changes by a tenth
      if (!driftT) driftT = setTimeout(driftDone, Math.max(0, K.at + DRIFT_MS - performance.now()));
    }
  }
  // (Which of the trials' HVPG entry values the HVPG has reached: a count, so a change of it changes a verdict.)
  let cuts = null;
  function crossings(v) {
    if (!cuts) { cuts = [PTIPS_HVPG]; for (const id of TRIAL_IDS) for (const e of trialOf(id)?.entry || []) if (e?.test === 'hvpg_ge' && Number.isFinite(e.value)) cuts.push(e.value); }   // alloc-rare: once, from the trial list (PTIPS_HVPG: Baveno VIII 5.31's line)
    let n = 0;
    if (Number.isFinite(v)) for (let i = 0; i < cuts.length; i++) if (v >= cuts[i]) n++;
    return n;
  }
  function askBuild() { if (!ask) ask = restPass(build); }
  const driftDone = () => { driftT = 0; askBuild(); };

  // ── Building the card (between frames) ──
  function build() {
    ask = 0; clearTimeout(driftT); driftT = 0;
    if (!frame?.metrics) return;
    const st = store.get(), m = frame.metrics, p = st.params;
    if (K.preset !== st.presetId) seenDecomp = false;
    if (K.p !== p || K.preset !== st.presetId) { models.clear(); gen++; }
    if ((m.ascites?.grade ?? 0) >= 1 || m.bleeding) seenDecomp = true;
    const facts = patientFacts(m, p, st);
    const hid = !!hiddenNow(st)?.has('trueHVPG');
    Object.assign(K, { p, preset: st.presetId, hid, band: Number.isFinite(facts.hvpg) ? hvpgSev(facts.hvpg) : '', vg: m.varix?.present ? m.varix.grade?.label : 'None',
      ag: m.ascites?.grade ?? -1, gv: !!m.gastricVarix?.present, bl: !!m.bleeding, cross: crossings(facts.hvpg), hv10: Number.isFinite(facts.hvpg) ? Math.round(facts.hvpg * 10) : NaN, at: performance.now() });
    const groups = sortTrials(TRIAL_IDS, m, p, facts, historyOf(st.presetId, seenDecomp));
    built = { facts, groups, secs: closestOf(groups), hid, bleeding: !!m.bleeding };
    paintLine(facts);
    paintList();
    configureForest(built);
  }
  function paintLine(facts) {
    const sig = `${facts.blocked}|${Number.isFinite(facts.hvpg) ? hvpgSev(facts.hvpg) : 'x'}|${facts.varix}|${facts.ascites}`;
    const fill = () => {
      hvWords?.dispose(); hvWords = null;
      const parts = [];
      if (facts.blocked) parts.push(h('span', {}, `HVPG ${NOT_MEASURABLE.toLowerCase()}`));
      else if (!Number.isFinite(facts.hvpg)) parts.push(h('span', {}, 'HVPG not measured'));
      else {
        const b = h('b', { 'data-sev': hvpgSev(facts.hvpg) }, fmt(facts.hvpg, 1));
        parts.push(h('span', {}, 'HVPG ', b, ' mmHg'));
        hvWords = glWords(b);
      }
      for (const s of [facts.varix, facts.ascites]) if (s) parts.push(h('span', { class: 'tr-dot' }, ' · '), h('span', {}, s));
      line.replaceChildren(...parts);
    };
    if (sig === lineSig) { if (Number.isFinite(facts.hvpg)) hvWords?.set(fmt(facts.hvpg, 1)); return; }
    lineSig = sig;
    swapFade(line, fill);
  }

  // A row: kept for as long as its trial stays in its section; its words cross-fade when they change.
  function rowOf(sec, { t, fit }) {
    const key = `${sec}:${t.id}`;
    let r = rows.get(key);
    const [a, b] = ratesOf(t), why = rowReason(t, fit), pips = sec === 'closest' ? pipsOf(fit) : '';
    if (!r) {
      const whyEl = h('span', { class: 'tr-why' }, why);
      const pipEl = sec === 'closest' ? h('span', { class: 'tr-pips', 'aria-hidden': 'true' }) : null;
      const btn = h('button', { type: 'button', class: `tr-row${sec === 'closest' ? ' hero' : ''}`, 'data-id': t.id, 'data-row': key, 'aria-expanded': 'false', 'aria-controls': `tr-x-${t.id}` },
        h('span', { class: 'tr-l1' }, h('span', { class: 'tr-nm' }, t.short ?? t.name), h('span', { class: 'tr-rs' }, a, h('span', { class: 'tr-vs' }, b))),
        h('span', { class: 'tr-l2' }, pipEl, whyEl));
      r = { el: btn, whyEl, pipEl, why, pips: null };
      rows.set(key, r);
    } else if (r.why !== why) { r.why = why; swapText(r.whyEl, why); }
    if (r.pipEl && r.pips !== pips) {
      const fill = () => r.pipEl.replaceChildren(...[...pips].map((c) => h('i', { class: c })));
      if (r.pips == null) fill(); else swapFade(r.pipEl, fill);
      r.pips = pips;
    }
    r.el.setAttribute('aria-expanded', String(t.id === openId));
    return r.el;
  }

  function paintList() {
    const S = built.secs, wanted = new Set();
    if (openId && !TRIAL_IDS.includes(openId)) openId = null;
    for (const [k] of SECTIONS) {
      const s = secs[k];
      let items = S[k];
      if (k === 'no') { paintChips(s, items); if (chipSel) { const c = chipsOf(items).find((x) => x.key === chipSel); items = c ? items.filter((q) => c.ids.includes(q.t.id)) : items; if (!c) chipSel = null; } }
      const nodes = [];
      for (const q of items) {
        const r = rowOf(k, q); wanted.add(r.dataset.row); nodes.push(r);
        if (q.t.id === openId) nodes.push(blockFor(k, q));
      }
      reconcile(s.items, nodes);
      if (k === 'closest') foldHidden(s.none, S.closest.length > 0);
      else {
        countTo(s.n, S[k].length, 0);
        foldHidden(s.wrap, S[k].length === 0);
        s.hd.setAttribute('aria-expanded', String(open[k]));
        foldHidden(s.fb, !open[k]);
      }
    }
    for (const key of rows.keys()) if (!wanted.has(key)) rows.delete(key);
    if (block && !openId) block = null;
  }
  function paintChips(s, no) {
    const cs = chipsOf(no), nodes = [];
    for (const c of cs) {
      let n = s.chipNodes.get(c.key);
      if (!n) {
        const num = h('b', {}, String(c.ids.length));
        n = { el: h('button', { type: 'button', class: 'tr-chip', 'data-chip': c.key, 'data-row': `chip:${c.key}`, 'aria-pressed': 'false' }, c.label, num), num };
        s.chipNodes.set(c.key, n);
      }
      countTo(n.num, c.ids.length, 0);
      n.el.setAttribute('aria-pressed', String(chipSel === c.key));
      nodes.push(n.el);
    }
    for (const k of [...s.chipNodes.keys()]) if (!cs.some((c) => c.key === k)) s.chipNodes.delete(k);
    reconcile(s.chips, nodes);
  }

  function onClick(e) {
    const b = e.target.closest?.('button');
    if (!b || !list.contains(b)) return;
    if (b.dataset.fold) {
      const k = b.dataset.fold;
      open[k] = !open[k];
      if (k === 'no' && !open[k]) chipSel = null;
      if (built) paintList();
      return;
    }
    if (b.dataset.chip) {
      chipSel = chipSel === b.dataset.chip ? null : b.dataset.chip;
      open.no = true;
      if (built) paintList();
      return;
    }
    if (b.dataset.id) {
      const id = b.dataset.id;
      openId = openId === id ? null : id;
      if (openId) forestSel = openId;
      if (built) paintList();
    }
  }

  // ── The open trial (TC-L4, L5): kept while it stays open in the same section, its rules and Model line brought up to date ──
  function blockFor(sec, { t, fit }) {
    const key = `${sec}:x:${t.id}`;
    if (!block || block.key !== key) {
      const W = Math.round(readMetric(secs[sec].items, 'clientWidth') || 0);
      tool.configure({ id: t.id });
      tool.grow();
      tool.prime(W);   // (TC-M5: the drawing's height is the block's before the block comes in, so the rows under it glide once, to the right place)
      const rules = h('div', { class: 'tr-rules', role: 'list', 'aria-label': 'Entry rules against this patient' });
      const model = h('div', { class: 'tr-model' });
      const rs = ratiosOf(t).slice(1);   // (the secondary results: the forest shows only the primary, TC-V3)
      const elB = h('div', { class: 'tr-exp', id: `tr-x-${t.id}`, 'data-row': key, role: 'region', 'aria-label': t.name },
        t.lesson ? h('div', { class: 'tr-lesson' }, t.lesson) : null,
        tool.el,
        rs.length ? h('div', { class: 'tr-also' }, `Also: ${rs.map((r) => `${ratioText(r)}${r.of ? ` for ${lcFirst(r.of)}` : ''}`).join(' · ')}`) : null,
        h('div', { class: 'tr-lab' }, 'This patient against its entry rules'),
        rules,
        model,
        t.bav?.length ? h('div', { class: 'tr-bav' }, t.bav.map((k) => h('div', {}, h('b', {}, `Baveno VIII ${k}. `), bavenoLine(k).replace(/^[\d.]+\. /, ''),
          k === '5.31' ? h('span', { class: 'tr-today' }, ` ${today531(built.facts.hvpg, built.bleeding)}`) : null))) : null,
        h('div', { class: 'tr-src' }, sourceLine(t)));
      block = { key, el: elB, id: t.id, rules, rulesSig: null, model, gen: -1, bav: elB.querySelector('.tr-today') };
    }
    paintRules(block, fit);
    if (block.bav) { const s = ` ${today531(built.facts.hvpg, built.bleeding)}`; if (block.bav.textContent !== s) swapText(block.bav, s); }
    if (block.gen !== gen || block.hv10 !== K.hv10) { block.gen = gen; block.hv10 = K.hv10; paintModel(block.model, t); }
    return block.el;
  }
  function paintRules(b, fit) {
    const R = ruleRows(fit), sig = R.map((r) => `${r.state}:${r.value}`).join('|');
    if (sig === b.rulesSig) return;
    const first = b.rulesSig == null;
    b.rulesSig = sig;
    const fill = () => {
      const kids = [];
      let minor = false;
      for (const r of R) {
        if (!r.defining && !minor) { minor = true; kids.push(h('div', { class: 'tr-rsep', 'aria-hidden': 'true' })); }
        const v = r.state === 'na' ? (r.value && r.value !== NOT_IN_MODEL ? r.value : NOT_IN_MODEL) : r.value;
        kids.push(h('div', { class: `tr-rule${r.defining ? '' : ' minor'}`, role: 'listitem', 'data-state': r.state, 'aria-label': `${r.rule}: ${MARK_WORD[r.state]}, ${v}` },
          h('span', { class: 'g', 'aria-hidden': 'true' }, MARK[r.state]), h('span', { class: 'r' }, r.rule), h('span', { class: 'v' }, v)));
      }
      if (!kids.length) kids.push(h('div', { class: 'tr-rule' }, h('span', { class: 'g' }), h('span', { class: 'r' }, 'Its entry rules are not listed yet'), h('span', { class: 'v' })));
      b.rules.replaceChildren(...kids);
    };
    if (first) fill(); else swapFade(b.rules, fill);
  }

  /** The Model line's starting values: the ones the card shows (the head line's HVPG, the live frame's PPG, MAP and heart rate), each falling back
   *  to the settled copy's where the card has none. */
  function liveBase(settled) {
    const m = frame?.metrics || {}, out = { ...settled };
    const live = { hvpg: built?.facts.hvpg, ppg: m.ppg, map: m.map, hr: m.hr };
    for (const k in live) if (Number.isFinite(live[k])) out[k] = live[k];
    return out;
  }
  // The Model line: the model's own numbers for this patient, settled with the trial's treatment (the engine's worker, on a copy: whatIf).
  function paintModel(wrap, t) {
    const rx = modelRx(t);
    if (!wrap.firstChild) {
      wrap.append(h('span', { class: 'k' }, `Model${rx ? ` · ${rx.name} on this patient` : ''}`), h('span', { class: 'v' }), h('span', { class: 's', hidden: '' }));
    }
    const v = wrap.children[1], sub = wrap.children[2];
    const say = (txt, note = '') => { swapText(v, txt); setSub(sub, note); };
    const evl = hasEvlArm(t) ? 'Band ligation treats the varix, not the pressure: the model\'s HVPG does not change with it.' : '';
    const hvNow = Number.isFinite(built?.facts.hvpg) ? `${fmt(built.facts.hvpg, 1)} mmHg` : 'not measured';
    if (!rx) { say('The model does not run this treatment.', evl); return; }
    if (rx.kind === 'albumin') {
      // (TC-T5: the model holds the serum albumin and gives albumin as an infusion from Treat, but does not run a trial's weeks-long course.)
      const alb = store.get().params?.albumin;
      say(Number.isFinite(alb) ? `Serum albumin ${fmt(alb, 1)} g/dL` : 'Serum albumin not in the model',
        'An infusion from Treat raises it in the model. The model does not run the trial\'s long course.');
      return;
    }
    // (A reading this case keeps hidden stays hidden here too: the HVPG until it is measured, the portal pressures in the Imaging view.)
    const hidSet = hiddenNow(store.get());
    if (hidSet?.has('trueHVPG') || (rx.patch.tips && hidSet?.has('pv'))) { say('Measure the HVPG to see the model\'s numbers.', evl); return; }
    if (rxOn(rx, store.get().params)) { say(`Already on. HVPG ${hvNow}.`, evl); return; }
    const key = rx.name, my = gen;
    const show = (r) => {
      if (my !== gen || !wrap.isConnected) return;
      if (!r?.base || !r?.rx) { say(`HVPG now ${hvNow}.`, evl); return; }
      // (A TIPS lowers the portal pressure gradient, which the HVPG does not see: its line leads with the PPG.)
      const tips = !!rx.patch.tips, sev = tips ? ppgSev : hvpgSev, k0 = tips ? 'ppg' : 'hvpg';
      // (TC-fit-4: the line starts from the value the card shows, the live frame's, and takes only the change from the settled copies, so its first
      // number is the head line's and the rules', never the settled copy's 11.5 beside a card that reads 11.1.)
      const B = liveBase(r.base), at = (k) => B[k] + (r.rx[k] - r.base[k]);
      const from = B[k0], to = at(k0);
      const more = tips ? ` · HVPG ${fmt(B.hvpg, 1)} → ${fmt(at('hvpg'), 1)}` : rx.patch.drugs?.terlipressin ? ` · MAP ${fmt(B.map, 0)} → ${fmt(at('map'), 0)} mmHg` : ` · heart rate ${fmt(B.hr, 0)} → ${fmt(at('hr'), 0)}/min`;
      // (TC-T3: the fall in percent, the model's own, beside the trial's response rule where the audit gives one.)
      const pct = Number.isFinite(from) && from > 0 ? Math.round(((to - from) / from) * 100) : null;
      const note = [pct != null && pct !== 0 ? `${pct < 0 ? '−' : '+'}${Math.abs(pct)}% in the model.` : '', t.response || '', evl].filter(Boolean).join(' ');
      // (TC-M4: the line cross-fades in, and the treated value rolls from the patient's own to the model's answer.)
      swapFade(v, () => {
        const end = h('b', { 'data-sev': sev(to) });
        v.replaceChildren(tips ? 'PPG ' : 'HVPG ', h('b', { 'data-sev': sev(from) }, fmt(from, 1)), h('s', {}, ' → '), end, ` mmHg${more}`);
        countTo(end, from, 1);
        setTimeout(() => countTo(end, to, 1), D_SMALL);
      });
      setSub(sub, note);
    };
    // (One question per treatment and patient: a card built again while the answer is on its way waits for the same answer.)
    let q = models.get(key);
    if (q && 'r' in q) { show(q.r); return; }
    say('Settling the model…', '');
    if (!q) {
      q = { p: host.request('whatIf', { patch: rx.patch }).then((msg) => msg.result, (e) => { caught('trials:whatIf', e); return null; }) };
      q.p.then((r) => { q.r = r; });
      models.set(key, q);
    }
    q.p.then(show);
  }
  function setSub(sub, note) {
    if (!note) { foldHidden(sub, true); return; }
    if (sub.hidden) { sub.textContent = note; foldHidden(sub, false); } else swapText(sub, note);
  }

  return {
    id: 'trials', label: 'Trials', el,
    update,
    clear() {},
    dispose() { forest.dispose(); tool.dispose?.(); hvWords?.dispose(); list.removeEventListener('click', onClick); },
  };
}
