// The Trials tab of the Tests card (Mohammad, 14 Nov 2026, designs A and D of the trial-card mocks): the landmark trials (trials.js) against the
// patient on screen. It loads after the first paint (main.js lazy(), lazy-pane.js), as the Doppler and the FibroScan do.
//
//   List    "Trials for this patient", the patient's own HVPG, varices and ascites, then the trials in four groups: Matches the modeled criteria (every defining
//           entry rule checked and met; eligibility is still incomplete and the rules still open are named), Possibly fits ("2 of 5 entry rules checked"), Not this patient (with the rule it fails) and Cannot tell from
//           the model (no defining rule it can check). A row names the trial, what it
//           compared and counted, and the treated arm's rate against the control's; a tap opens it in place: who was enrolled (each entry rule
//           against the model), how long they were followed, the arms as bars, the effect, a caveat, the Model line where the model runs the
//           treatment, and the source.
//   Forest  every trial's ratios on one log scale, grouped by kind (trial-forest.js), the trials that fit in full ink.
// Whether a patient fits is trial-fit.js. A trial's numbers are its own, never the model's; the Model line is the one place a model number sits
// beside a trial, and it says so.
//
// Nothing here runs per frame: the dock's refresh hands every model frame to update(), which compares a few numbers and, when the patient has
// changed in a way the card shows, builds the card again between frames (rest-pass.js). The HVPG in the head line is drawn on the GPU as it
// changes (gl-words.js), so a value that eases writes nothing into the page.

import { store, hiddenNow } from './store.js';
import { h, fmt } from './util.js';
import { host } from './host.js';
import { restPass } from './rest-pass.js';
import { glWords } from './gl-words.js';
import { createSvgGL } from './svg-gl.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { caught } from './caught.js';
import { TRIAL_IDS, trialOf, trialSource } from './trials.js';
import { fitTrial, failedRows, openRows, groupOf, possiblyWords, whyNot, lcFirst, stillNeeded, FITS_HEAD, FITS_WORDS, NOT_IN_MODEL } from './trial-fit.js';
import { createForest, armsLayout, layoutTree, ratiosOf, ratioText } from './trial-forest.js';
import { hvpgSev, ppgSev, hvBlocked, NOT_MEASURABLE } from '../engine/pressure-cuts.js';

export const GROUPS = Object.freeze([['fits', FITS_HEAD], ['possible', 'Possibly fits'], ['no', 'Not this patient'], ['unknown', 'Cannot tell from the model']]);
const STATE_WORD = { yes: 'Met', no: 'Not met', na: NOT_IN_MODEL };
const PX = 13;   // (the card's words: the bars' type size, as the rows' 13 px)
// (How often the card is built again for a value that drifts with no change of group or band: the disease clock moving the HVPG a tenth.)
const DRIFT_MS = 3000;

/** What the model can do of a trial's treatment, from its treated arm: a change to the params, and its name in the Model line; or null. */
export function modelRx(t) {
  const arm = (t?.arms || []).find((a) => a.side === 'treat') || t?.arms?.[0];
  const s = `${arm?.label || ''} ${t?.name || ''}`;
  if (/carvedilol/i.test(arm?.label || '')) return { name: 'carvedilol', patch: { drugs: { carvedilol: true } } };
  if (/propranolol/i.test(arm?.label || '')) return { name: 'propranolol', patch: { drugs: { propranolol: true } } };
  if (/beta-blocker|\bNSBB\b/i.test(arm?.label || '')) return { name: 'carvedilol', patch: { drugs: { carvedilol: true } } };
  if (/\bTIPS\b/.test(arm?.label || '') && !/before TIPS/i.test(s)) return { name: 'TIPS', patch: { tips: { on: true, d: 8 } } };
  if (/terlipressin/i.test(arm?.label || '')) return { name: 'terlipressin', patch: { drugs: { terlipressin: true } } };
  return null;
}
const rxOn = (rx, p) => (rx.patch.tips ? !!p?.tips?.on : Object.keys(rx.patch.drugs).every((k) => p?.drugs?.[k]));

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

/** Each trial's fit for this patient, in the order of trials.js, then grouped: { fits: [], possible: [], no: [], unknown: [] } of { t, fit }. */
export function sortTrials(ids, m, p, facts) {
  const view = { ...m, hvpg: facts.hvpg };
  const out = { fits: [], possible: [], no: [], unknown: [] };
  for (const id of ids) { const t = trialOf(id); if (t) { const fit = fitTrial(t, view, p); out[groupOf(fit)].push({ t, fit }); } }
  return out;
}

/** Why a trial is in its group, in a line: the rules it fails, or the rules the model cannot check. */
export function reasonOf(t, fit) {
  if (fit.verdict === 'no') return failedRows(fit).map((r) => `${r.rule} (${r.value === NOT_IN_MODEL ? 'not in the model' : lcFirst(r.value)})`).join('; ');
  if (fit.verdict === 'unknown') {
    if (!fit.rows.length) return 'Its entry rules are not listed yet';
    const open = `Not in the model: ${openRows(fit).map((r) => lcFirst(r.rule)).join(', ')}`;
    return fit.met > 0 ? `${possiblyWords(fit)}. ${open}` : open;
  }
  // (A full match is not eligibility: the line says so and names the rules still open, R01.)
  return [FITS_WORDS, stillNeeded(fit) && `${stillNeeded(fit)}.`].filter(Boolean).join(' ');
}

const treatArm = (t) => (t.arms || []).find((a) => a.side === 'treat') || t.arms?.[0];
const others = (t) => (t.arms || []).filter((a) => a !== treatArm(t));
/** "Beta-blocker vs placebo". */
export const comparisonOf = (t) => (t.arms || []).map((a, i) => (i ? a.label.charAt(0).toLowerCase() + a.label.slice(1) : a.label)).join(' vs ');
/** "Lancet 2019 · Villanueva · 201 randomized · Baveno VIII 3.15". */
export const sourceLine = (t) => `${trialSource(t)} · ${t.n} randomized${t.bav?.length ? ` · Baveno VIII ${t.bav.join(', ')}` : ''}`;

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
  el.append(sw, head, list, forestWrap);
  // The one picture of a trial's arms, moved into the row that is open.
  const armsEl = h('div', { class: 'tr-arms' });
  const armsGL = createSvgGL(armsEl, { host: 'trial' });
  armsGL.setCtx({ px: PX });
  let armsT = null, armsW = 0;
  function drawArms() {
    const W = Math.round(readMetric(armsEl, 'clientWidth') || 0);
    if (!armsT || !W || !armsEl.isConnected || W === armsW) return;
    armsW = W;
    const L = armsLayout(armsT, W, PX, measure);
    armsGL.show(layoutTree(L, W, armsT.arms.map((a) => `${a.label} ${a.rate}%`).join(', ')), false);
    armsEl.style.height = `${L.H}px`;
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => drawArms()).observe(armsEl);

  let frame = null, openId = null, built = null, ask = 0, driftT = 0, hvWords = null, gen = 0;
  const models = new Map();   // (the Model line's answers for this patient, by treatment: cleared when the patient changes)
  // What the card was last built from: the patient (params, preset), and each fact that changes what it shows.
  const K = { p: null, preset: null, hid: null, band: null, vg: null, ag: null, gv: null, bl: null, cross: -1, hv10: NaN, at: 0 };

  function setMode(v) {
    mode = v; el.dataset.mode = v;
    for (const b of sw.children) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    try { localStorage.setItem('pps.trialsView', v); } catch (e) { caught('trials:mode', e); }
    if (built) configureForest(built);
  }
  function configureForest(b) {
    const notes = {}, whys = {};
    for (const [g] of GROUPS) for (const { t, fit } of b.groups[g]) {
      notes[t.id] = g === 'fits' ? `${FITS_WORDS}` : g === 'no' ? 'Not this patient.' : g === 'possible' ? 'Some entry rules are not in the model.' : 'The model cannot tell whether this patient fits.';
      if (g === 'no') whys[t.id] = `Not this patient: ${whyNot(fit)}`;
      else if (g === 'possible') whys[t.id] = possiblyWords(fit);
    }
    const fits = new Set(b.groups.fits.map((q) => q.t.id));
    if (forestSel == null || !trialOf(forestSel)) forestSel = b.groups.fits[0]?.t.id ?? null;
    if (mode === 'forest') forest.configure({ ids: TRIAL_IDS, highlight: fits, selected: forestSel, notes, why: whys });
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
    if (!cuts) { cuts = []; for (const id of TRIAL_IDS) for (const e of trialOf(id)?.entry || []) if (e?.test === 'hvpg_ge' && Number.isFinite(e.value)) cuts.push(e.value); }   // alloc-rare: once, from the trial list
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
    if (K.p !== p || K.preset !== st.presetId) { models.clear(); gen++; }
    const facts = patientFacts(m, p, st);
    const hid = !!hiddenNow(st)?.has('trueHVPG');
    Object.assign(K, { p, preset: st.presetId, hid, band: Number.isFinite(facts.hvpg) ? hvpgSev(facts.hvpg) : '', vg: m.varix?.present ? m.varix.grade?.label : 'None',
      ag: m.ascites?.grade ?? -1, gv: !!m.gastricVarix?.present, bl: !!m.bleeding, cross: crossings(facts.hvpg), hv10: Number.isFinite(facts.hvpg) ? Math.round(facts.hvpg * 10) : NaN, at: performance.now() });
    built = { facts, groups: sortTrials(TRIAL_IDS, m, p, facts), hid };
    paintLine(facts);
    paintList();
    configureForest(built);
  }
  function paintLine(facts) {
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
  }
  function paintList() {
    const kids = [];
    for (const [g, label] of GROUPS) {
      const rows = built.groups[g];
      if (!rows.length) continue;
      kids.push(h('div', { class: 'tr-grp', role: 'heading', 'aria-level': '3' }, label));
      for (const q of rows) { kids.push(rowEl(q, g)); if (q.t.id === openId) kids.push(openEl(q)); }
    }
    if (openId && !kids.some((k) => k.dataset?.id === openId)) openId = null;
    if (armsEl.isConnected && !openId) armsEl.remove();
    list.replaceChildren(...kids);
  }
  function rowEl({ t, fit }, g) {
    const tr = treatArm(t), rest = others(t);
    const id = `tr-x-${t.id}`;
    const left = h('span', { class: 'tr-l' },
      h('span', { class: 'tr-nm' }, t.short ?? t.name),
      h('span', { class: 'tr-ds' }, comparisonOf(t)),
      h('span', { class: 'tr-ds tr-ds2' }, t.endpoint),
      h('span', { class: 'tr-why' }, reasonOf(t, fit)));
    const right = h('span', { class: 'tr-rs' }, tr ? `${tr.rate}%` : '',
      rest.length ? h('span', { class: 'tr-vs' }, ` vs ${rest.map((a) => `${a.rate}%`).join(' / ')}`) : null,
      t.km ? h('small', {}, 'Kaplan–Meier') : null);
    const open = t.id === openId;
    return h('button', { type: 'button', class: `tr-row${g === 'fits' ? '' : ' q'}`, 'data-id': t.id, 'aria-expanded': String(open), 'aria-controls': id,
      onclick: () => { openId = open ? null : t.id; paintList(); } }, left, right);
  }
  function openEl({ t, fit }) {
    const kv = h('div', { class: 'tr-kv' });
    kv.append(h('span', { class: 'k' }, 'Patients'));
    if (fit.rows.length) {
      kv.append(h('span', { class: 'v tr-rules' }, fit.rows.map((r) => h('span', { class: 'tr-rule', 'data-state': r.state },
        h('span', { class: 'tr-rw' }, r.rule), h('span', { class: 'tr-rv' }, r.state === 'na' ? NOT_IN_MODEL : `${STATE_WORD[r.state]} · ${r.value}`)))));
    } else kv.append(h('span', { class: 'v' }, t.setting));
    if (t.followUp) kv.append(h('span', { class: 'k' }, 'Followed'), h('span', { class: 'v' }, t.followUp));
    armsT = t; armsW = 0;
    const rs = ratiosOf(t);
    const eff = rs.length ? rs.map((r) => `${ratioText(r)}${r.of ? ` for ${r.of}` : ''}`).join(' · ') : t.effect;
    const box = h('div', { class: 'tr-exp', id: `tr-x-${t.id}` }, kv, armsEl,
      eff ? h('div', { class: 'tr-eff' }, eff) : null,
      t.km ? h('div', { class: 'tr-note' }, 'The rates are Kaplan–Meier estimates.') : null,
      t.note ? h('div', { class: 'tr-note' }, t.note) : null,
      modelEl(t),
      h('div', { class: 'tr-src' }, sourceLine(t)),
      t.status && t.status !== 'checked' ? h('div', { class: 'tr-warn' }, 'Not yet checked against the paper') : null);
    restPass(drawArms);
    return box;
  }
  // The Model line: the model's own numbers for this patient, settled with the trial's treatment (the engine's worker, on a copy: whatIf).
  function modelEl(t) {
    const rx = modelRx(t), wrap = h('div', { class: 'tr-model' });
    const k = h('span', { class: 'k' }, h('b', {}, 'Model'), rx ? ` · ${rx.name} on this patient` : '');
    const v = h('span', { class: 'v' });
    wrap.append(k, v);
    if (!rx) { v.textContent = 'The model does not run this treatment.'; return wrap; }
    // (A reading this case keeps hidden stays hidden here too: the HVPG until it is measured, the portal pressures in the Imaging view.)
    const hidSet = hiddenNow(store.get());
    if (hidSet?.has('trueHVPG') || (rx.patch.tips && hidSet?.has('pv'))) { v.textContent = 'Measure the HVPG to see the model\'s numbers.'; return wrap; }
    if (rxOn(rx, store.get().params)) { v.textContent = `Already on. HVPG ${Number.isFinite(built?.facts.hvpg) ? `${fmt(built.facts.hvpg, 1)} mmHg` : 'not measured'}.`; return wrap; }
    const key = rx.name, my = gen;
    const show = (r) => {
      if (my !== gen) return;
      if (!r?.base || !r?.rx) { v.textContent = `HVPG now ${Number.isFinite(built?.facts.hvpg) ? `${fmt(built.facts.hvpg, 1)} mmHg` : 'not measured'}.`; return; }
      // (A TIPS lowers the portal pressure gradient, which the HVPG does not see: its line leads with the PPG.)
      const tips = !!rx.patch.tips, sev = tips ? ppgSev : hvpgSev, k0 = tips ? 'ppg' : 'hvpg';
      const num = (x) => h('b', { 'data-sev': sev(x) }, fmt(x, 1));
      const more = tips ? ` · HVPG ${fmt(r.base.hvpg, 1)} → ${fmt(r.rx.hvpg, 1)}` : rx.patch.drugs?.terlipressin ? ` · MAP ${fmt(r.base.map, 0)} → ${fmt(r.rx.map, 0)} mmHg` : ` · heart rate ${fmt(r.base.hr, 0)} → ${fmt(r.rx.hr, 0)}/min`;
      v.replaceChildren(tips ? 'PPG ' : 'HVPG ', num(r.base[k0]), h('s', {}, ' → '), num(r.rx[k0]), ` mmHg${more}`);
    };
    // (One question per treatment and patient: a card built again while the answer is on its way waits for the same answer.)
    let q = models.get(key);
    if (q && 'r' in q) { show(q.r); return wrap; }
    v.textContent = 'Settling the model…';
    if (!q) {
      q = { p: host.request('whatIf', { patch: rx.patch }).then((msg) => msg.result, (e) => { caught('trials:whatIf', e); return null; }) };
      q.p.then((r) => { q.r = r; });
      models.set(key, q);
    }
    q.p.then(show);
    return wrap;
  }

  return {
    id: 'trials', label: 'Trials', el,
    update,
    clear() {},
    /** The card's peek line. */
    summary: () => (built ? `${built.groups.fits.length} of ${TRIAL_IDS.length} fit` : 'Trials'),
    dispose() { forest.dispose(); armsGL.dispose?.(); hvWords?.dispose(); },
  };
}
