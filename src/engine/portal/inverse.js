// Work backward (the patient menu's "From readings"): the search itself, pure numbers in and out, no engine. Readings the person has go in;
// out comes a ranked list of lesion families, each with the settings that fit, what it cannot explain and the reading that would split the
// candidates. The virtual patients it scores are the shipped library (inverse-library.js, made by scripts/gen-inverse-library.mjs from the
// engine itself) plus any the live refinement adds (inverse-worker.js), so a prediction here is what the app would show for that patient.
//
// What this is, said once because every screen repeats it: a search for MODEL scenarios that could give the readings, never a diagnosis.
// Unknown readings are not scored and not guessed. A scenario fits when its predictions sit inside each reading's allowed error (sigma);
// two scenarios whose scores are within TIE of each other are shown as a tie, never as a first and a second.

import { HVPG_CUTS } from './pressure-cuts.js';
import { LSM_CUTS } from './lsm-cuts.js';
import { ASCITES_CUTS, VARIX_NONE_MM, VARIX_LARGE_MM } from './metrics.js';
import { FAMILIES, FAMILY, SIDE, sidesOf, sideDefault, sideClamp, spanOf, keyOf, settingText, settingsOf, pctText, LESION, LESION_IDS, U_MIN, U_MAX } from './inverse-families.js';

/** How a reading is compared. 'abs': difference in its unit; 'log': the log of the ratio (a stiffness or a count is wrong by a fraction);
 *  'grade': the person chose a grade, so a prediction inside the grade's range is a perfect fit and outside it is judged from the nearer edge. */
export const READINGS = Object.freeze({
  whvp: { label: 'Wedged hepatic vein pressure', short: 'WHVP', unit: 'mmHg', kind: 'abs', sigma: 1.5, min: 0, max: 60 },
  fhvp: { label: 'Free hepatic vein pressure', short: 'FHVP', unit: 'mmHg', kind: 'abs', sigma: 1.2, min: 0, max: 40 },
  hvpg: { label: 'HVPG', short: 'HVPG', unit: 'mmHg', kind: 'abs', sigma: 1.9, min: -5, max: 50 },
  pv: { label: 'Portal vein pressure', short: 'Portal vein', unit: 'mmHg', kind: 'abs', sigma: 2, min: 0, max: 60 },
  ppg: { label: 'Portal pressure gradient (PPG)', short: 'PPG', unit: 'mmHg', kind: 'abs', sigma: 2, min: -5, max: 50 },
  ra: { label: 'Right atrial pressure', short: 'RA', unit: 'mmHg', kind: 'abs', sigma: 2, min: -5, max: 40 },
  ivc: { label: 'IVC pressure', short: 'IVC', unit: 'mmHg', kind: 'abs', sigma: 2, min: -5, max: 40 },
  lsm: { label: 'Liver stiffness (LSM)', short: 'LSM', unit: 'kPa', kind: 'log', sigma: 0.18, floor: 1, min: 1, max: 75 },
  ssm: { label: 'Spleen stiffness (SSM)', short: 'SSM', unit: 'kPa', kind: 'log', sigma: 0.15, floor: 3, min: 5, max: 100 },
  spleen: { label: 'Spleen length', short: 'Spleen', unit: 'cm', kind: 'abs', sigma: 1.5, min: 5, max: 30 },
  plt: { label: 'Platelets', short: 'Platelets', unit: '×10⁹/L', kind: 'log', sigma: 0.18, floor: 10, min: 10, max: 600 },
  pvVel: { label: 'Portal vein velocity', short: 'PV velocity', unit: 'cm/s', kind: 'abs', sigma: 6, min: -40, max: 80, note: '0 is no flow; negative is hepatofugal.' },
  saag: { label: 'SAAG', short: 'SAAG', unit: 'g/dL', kind: 'abs', sigma: 0.3, min: 0, max: 5 },
  asctp: { label: 'Ascitic total protein', short: 'Ascitic protein', unit: 'g/dL', kind: 'abs', sigma: 0.5, min: 0, max: 8 },
  asc: { label: 'Ascites', short: 'Ascites', unit: '', kind: 'grade', sigma: 0.35, grades: ['None', 'Grade 1', 'Grade 2', 'Grade 3'] },
  varix: { label: 'Esophageal varices', short: 'Varices', unit: '', kind: 'grade', sigma: 1, grades: ['None', 'Small', 'Large'] },
});
export const READING_KEYS = Object.freeze(Object.keys(READINGS));

/** The mL range of each ascites grade and the mm range of each varix grade: the grades are the app's own (metrics.js), so the search reads the same cut-offs. */
const GRADE_RANGE = Object.freeze({
  asc: [[0, ASCITES_CUTS[0]], [ASCITES_CUTS[0], ASCITES_CUTS[1]], [ASCITES_CUTS[1], ASCITES_CUTS[2]], [ASCITES_CUTS[2], Infinity]],
  varix: [[0, VARIX_NONE_MM], [VARIX_NONE_MM, VARIX_LARGE_MM], [VARIX_LARGE_MM, Infinity]],
});
// (Fluid volume is judged on a log scale, so 100 mL against 150 is a small miss and 100 against 3,000 a large one.)
const scaleOf = (key, v) => (key === 'asc' ? Math.log1p(v / 300) : v);

/** How many readings must be entered before the search runs: one number cannot tell a lesion from its neighbours. */
export const MIN_READINGS = 2;
/** Below this many readings the list is a short list of what is possible, not a ranking: most families still fit, and the screen says so. */
export const FEW_READINGS = 4;
/**
 * Occam's razor, as a cost in the same unit as a misfit (squared allowed errors): every lesion in a scenario costs LESION_COST, and each costs a little more
 * (SEVERITY_COST per unit of severity, 0 to 1) the further it is pushed, so fewer lesions win first and smaller ones second. A second lesion has to cut the
 * misfit by more than LESION_COST to come out ahead. The severity part is small and linear on purpose: a squared one made two moderate lesions beat one severe one
 * (review E3), and the scales of the lesions are not comparable. The no-lesion family costs nothing.
 */
export const LESION_COST = 3;
export const SEVERITY_COST = 0.5;
/**
 * A side setting the search chose (the pump strength, the tricuspid leak, the volume held, the albumin, the splanchnic tone) costs SIDE_COST for sitting a whole
 * slider range from the value its lesion would have set, in proportion to how far it is: used only when the readings call for it, and never for free.
 */
export const SIDE_COST = 3;
/** The Occam cost of family `f` at settings `p`: each lesion's share, its severity, and the distance of any side setting from where its lesion would put it. */
export const costOf = (f, p) => {
  const fam = FAMILY[f], axes = fam.axes;
  let c = 0;
  for (const k of axes) c += LESION_COST + SEVERITY_COST * p[k];
  for (const id of fam.sides || NO_SIDES) if (id in p) c += (SIDE_COST * Math.abs(p[id] - sideDefault(axes, id, p))) / (SIDE[id].hi - SIDE[id].lo);
  return c;
};
const NO_SIDES = Object.freeze([]);
/** A heart lesion is a raised right atrial pressure: a heart lesion whose fit leaves the RA below this is only a way of holding fluid, and is not a scenario (review E7). */
export const HEART_RA = 8;
/** The fit is called poor when the best scenario misses by more than this many allowed errors per reading on average, or any one reading by more than WORST_MISS (review E1). */
export const POOR_PER_READING = 2;
export const WORST_MISS = 3;
/** Scores within TIE of the best fit about equally; within POSSIBLE can still produce the readings; beyond it the family is ruled out. */
export const TIE = 4;
export const POSSIBLE = 12;
/** A prediction missing for an entered reading (the model prints no SSM there) counts as this many allowed errors off. */
export const MISS = 3;
/** A setting is in a family's fit range while its best fit is within this much of the family's best. */
export const RANGE_SLACK = 4;
/** A next reading splits two scenarios when their predictions differ by SPLIT allowed errors or more, and barely helps from BARELY. */
export const SPLIT = 2;
export const BARELY = 1;
/** The live fit: this many rounds on the real engine, each trying at most this many patients around the best fits, with moves that narrow each round (see refinePoints). */
export const REFINE_ROUNDS = 8;
export const REFINE_PER_ROUND = 72;
/** The size of a fit round's move in severity: coarse first, then finer, never below 0.01 (one setting step the engine cannot tell apart). */
export const fitStep = (round) => Math.max(0.01, Math.round(0.2 * 0.55 ** (round - 1) * 1000) / 1000);

/** The allowed error of a stiffness or a count in log units: its fraction, with a floor in the unit itself (a reading of 7 kPa is not good to 18% of 7). */
export const logSigma = (r, entered) => Math.sqrt(r.sigma * r.sigma + (r.floor ? (r.floor / entered) ** 2 : 0));

/** A reading's residual in allowed errors (signed: prediction minus entered). `entered` is the number, or a grade index for asc and varix. */
export function residual(key, entered, predicted) {
  const r = READINGS[key];
  if (predicted == null || !Number.isFinite(predicted)) return MISS;
  if (r.kind === 'abs') return (predicted - entered) / r.sigma;
  if (r.kind === 'log') return Math.log(Math.max(predicted, 1e-3) / entered) / logSigma(r, entered);
  const [lo, hi] = GRADE_RANGE[key][entered], p = scaleOf(key, predicted);
  if (predicted < lo) return (p - scaleOf(key, lo)) / r.sigma;
  if (predicted >= hi) return (p - scaleOf(key, hi)) / r.sigma;
  return 0;
}

/**
 * Tidy what was typed: a reading that is blank, not a number or out of its range is dropped (and named, so the screen says so); the HVPG is
 * dropped when both pressures it is made of are entered (it would count one reading twice); the PPG when the portal vein and IVC pressures
 * are both entered. Returns { readings, dropped: [{ key, why }], warnings: [{ code, text, keys }] } (the warnings are physiology checks and do not drop anything).
 */
export function normalise(raw = {}) {
  /** @type {Record<string, number>} */
  const readings = {};
  const dropped = [], warnings = [];
  for (const key of READING_KEYS) {
    const v = raw[key];
    if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) continue;
    const r = READINGS[key], n = +v;
    if (!Number.isFinite(n)) { dropped.push({ key, why: 'not a number' }); continue; }
    if (r.kind === 'grade') {
      if (!Number.isInteger(n) || n < 0 || n >= r.grades.length) { dropped.push({ key, why: 'not a grade' }); continue; }
    } else if (n < r.min || n > r.max) { dropped.push({ key, why: `outside ${r.min} to ${r.max} ${r.unit}` }); continue; }
    readings[key] = n;
  }
  const f1 = (v) => (Math.round(v * 10) / 10).toString(), warn = (code, text, keys) => warnings.push({ code, text, keys });
  if ('hvpg' in readings && 'whvp' in readings && 'fhvp' in readings) {
    const made = readings.whvp - readings.fhvp;
    const off = Math.abs(readings.hvpg - made), allowed = 2 * READINGS.hvpg.sigma;
    if (off > allowed) warn('hvpg-mismatch', `The HVPG you entered (${f1(readings.hvpg)}) is not WHVP − FHVP (${f1(made)}); only the two pressures are used.`, ['hvpg', 'whvp', 'fhvp']);
    delete readings.hvpg; dropped.push({ key: 'hvpg', why: 'made from the two pressures above' });
  }
  if ('ppg' in readings && 'pv' in readings && 'ivc' in readings) {
    const made = readings.pv - readings.ivc;
    const off = Math.abs(readings.ppg - made), allowed = 2 * READINGS.ppg.sigma;
    if (off > allowed) warn('ppg-mismatch', `The PPG you entered (${f1(readings.ppg)}) is not portal vein − IVC (${f1(made)}); only the two pressures are used.`, ['ppg', 'pv', 'ivc']);
    delete readings.ppg; dropped.push({ key: 'ppg', why: 'made from the two pressures above' });
  }
  // Physiology checks (review E8): pressures that cannot all be true together are kept, and said, so a wrong zero level or a typing slip is not read as a disease.
  if ('fhvp' in readings && 'ra' in readings && readings.fhvp < readings.ra - 2) warn('fhvp-below-ra', `FHVP (${f1(readings.fhvp)}) is below the right atrial pressure (${f1(readings.ra)}): a hepatic vein cannot be at a lower pressure than the right atrium it drains into. Check the zero level.`, ['fhvp', 'ra']);
  if ('whvp' in readings && 'fhvp' in readings && readings.whvp < readings.fhvp - 1) warn('whvp-below-fhvp', `WHVP (${f1(readings.whvp)}) is below FHVP (${f1(readings.fhvp)}): the wedged pressure is not lower than the free one. Check which is which.`, ['whvp', 'fhvp']);
  if ('ivc' in readings && 'ra' in readings && readings.ivc < readings.ra - 2) warn('ivc-below-ra', `IVC pressure (${f1(readings.ivc)}) is below the right atrial pressure (${f1(readings.ra)}): the IVC drains into the atrium. Check the zero level.`, ['ivc', 'ra']);
  if ('pv' in readings && 'whvp' in readings && readings.pv < readings.whvp - 3) warn('pv-below-whvp', `Portal vein pressure (${f1(readings.pv)}) is below the wedged pressure (${f1(readings.whvp)}): the WHVP is normally at or below the portal pressure.`, ['pv', 'whvp']);
  return { readings, dropped, warnings };
}

/**
 * A reading's residual in this set of readings. The model makes the platelet count from the spleen's length, so with both entered the platelets are
 * not a second measurement of the same thing: they are judged with a wider error (PLT_WITH_SPLEEN, in place of the usual one).
 */
export const PLT_WITH_SPLEEN = 0.3;
export function resid(key, readings, pred) {
  const d = residual(key, readings[key], pred[key]);
  return key === 'plt' && 'spleen' in readings ? (d * logSigma(READINGS.plt, readings.plt)) / Math.sqrt(PLT_WITH_SPLEEN ** 2 + (READINGS.plt.floor / readings.plt) ** 2) : d;
}

/** One virtual patient's score: { chi (sum of squared residuals), per (residual of each entered reading) }. */
export function scorePoint(readings, pred) {
  let chi = 0;
  const per = {};
  for (const key of Object.keys(readings)) { const d = resid(key, readings, pred); per[key] = d; chi += d * d; }
  return { chi, per };
}

/** How one reading fits: 'fit' inside one allowed error, 'near' inside two, 'off' beyond. The mark every scenario shows beside each entered reading. */
export const fitMark = (d) => (Math.abs(d) < 1 ? 'fit' : Math.abs(d) < 2 ? 'near' : 'off');

/** A family's place against the best one: 'best' (the top, with the ties), 'tie' (within TIE of it), 'possible' (within POSSIBLE), 'out'. */
export const statusOf = (delta) => (delta <= 0 ? 'best' : delta <= TIE ? 'tie' : delta <= POSSIBLE ? 'possible' : 'out');

/**
 * Rank the lesion families against the entered readings.
 *  raw     what was typed (normalise() tidies it).
 *  points  the virtual patients to score: [{ f: family id, p: its settings, r: its readings (key → number) }].
 * Returns { readings, dropped, warnings, n, ready, few, fit, healthy, families, possible, play, next, tieNotes }:
 *  ready     whether enough readings are in (MIN_READINGS) to show a ranking; below that the families are still scored, so a screen can say how many remain
 *  fit       { ok, perReading, worst: [{ key, d }], conflict: [keys] }: whether the best scenario gives the readings at all (not ok: no ratings, no next reading)
 *  healthy   the no-lesion family leads and fits
 *  few       ready with fewer than FEW_READINGS readings: the screen shows the scenarios as a short list and says it is not a ranking
 *  possible  how many families are not ruled out (the count a guided entry shows beside each reading)
 *  families  every family, best first: { id, label, sub, status, delta, rating (its share of all the likelihood, adds to 1), best: { p, chi, cost, score, per, pred }, free, ranges, predicts, gaps, marks, count }
 *  play      the families still in play (status best or tie), the ones the next reading must split
 *  next      the reading to take next, see nextReading()
 */
export function rank(raw, points) {
  const { readings, dropped, warnings } = normalise(raw);
  const keys = Object.keys(readings), n = keys.length;
  if (n < 1) return { readings, dropped, warnings, n, ready: false, few: false, fit: { ok: true, perReading: 0, worst: [], conflict: [] }, healthy: false, families: [], possible: FAMILIES.length, play: [], next: null, tieNotes: [] };
  const by = new Map(FAMILIES.map((f) => [f.id, []]));
  for (const pt of points) {
    const fam = by.get(pt.f);
    if (!fam) continue;
    if (HEART_FAMILY.has(pt.f) && !(pt.r.ra >= HEART_RA)) continue;   // (a heart lesion that leaves the atrium normal is a way to hold fluid, not a lesion: review E7)
    const s = scorePoint(readings, pt.r);
    fam.push({ ...pt, ...s, score: s.chi + costOf(pt.f, pt.p) });
  }
  const fams = [];
  for (const f of FAMILIES) {
    const pts = by.get(f.id);
    if (!pts.length) continue;
    const best = pts.reduce((a, b) => (b.score < a.score ? b : a));
    const cost = costOf(f.id, best.p);
    const ok = pts.filter((pt) => pt.score <= best.score + RANGE_SLACK);
    const ranges = {}, predicts = {};
    for (const k of f.axes) {
      const v = ok.map((pt) => pt.p[k]), lo = Math.min(...v), hi = Math.max(...v), [slo, shi] = spanOf(f.id, k);
      ranges[k] = { lo, hi, whole: shi > slo && lo <= slo && hi >= shi, fixed: shi === slo };
    }
    for (const k of READING_KEYS) {
      if (k in readings) continue;
      const v = ok.map((pt) => pt.r[k]).filter((x) => x != null);
      if (v.length) predicts[k] = [Math.min(...v), Math.max(...v)];
    }
    const marks = {}, gaps = [];
    for (const k of keys) {
      marks[k] = fitMark(best.per[k]);
      if (marks[k] === 'off') gaps.push({ key: k, entered: readings[k], predicted: best.r[k], d: best.per[k] });
    }
    gaps.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    fams.push({ id: f.id, label: f.label, short: f.short, sub: f.sub, free: f.free, best: { p: best.p, chi: best.chi, cost, score: best.score, per: best.per, pred: best.r }, score: best.score, rating: 0, delta: 0, status: /** @type {'best' | 'tie' | 'possible' | 'out'} */ ('out'), redundant: /** @type {string | null} */ (null), tieGroup: /** @type {string | null} */ (null), why: /** @type {{ key: string, entered: number, mine: number | null, theirs: number | null }[]} */ ([]), ranges, predicts, marks, gaps, count: ok.length });
  }
  // The nested rule (review E6): a mix that adds a lesion without cutting the misfit by more than the lesion costs is the smaller mix with a trace added, not a scenario.
  const chiOf = new Map(fams.map((f) => [f.id, f.best.chi]));
  for (const f of fams) {
    const axes = FAMILY[f.id].axes;
    for (const k of axes) {
      const parent = axes.length === 1 ? 'none' : axes.filter((x) => x !== k).join('+');
      if (chiOf.has(parent) && chiOf.get(parent) <= f.best.chi + LESION_COST) { f.redundant = parent; break; }
    }
  }
  fams.sort((a, b) => (a.redundant ? 1 : 0) - (b.redundant ? 1 : 0) || a.score - b.score);
  const live = fams.filter((f) => !f.redundant), top = (live[0] || fams[0]).score;
  let wsum = 0;
  for (const f of fams) {
    f.delta = f.score - top;
    f.status = f.redundant ? 'out' : statusOf(f.delta);
    f.rating = f.redundant ? 0 : Math.exp(-f.delta / 2); wsum += f.rating;
  }
  for (const f of fams) f.rating /= wsum;
  // Whether the best scenario gives the readings at all (review E1): the rating is a share between scenarios, so it says nothing about a fit that is bad everywhere.
  const lead = live[0] || fams[0], worst = keys.map((k) => ({ key: k, d: lead.best.per[k] })).filter((x) => Math.abs(x.d) > WORST_MISS).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const perReading = lead.best.chi / n, fit = { ok: perReading <= POOR_PER_READING && !worst.length, perReading, worst, conflict: keys.filter((k) => Math.abs(lead.best.per[k]) > 2) };
  const ready = n >= MIN_READINGS, few = ready && n < FEW_READINGS, possible = fams.filter((f) => f.status !== 'out').length;
  const play = ready && fit.ok ? fams.filter((f) => f.status === 'best' || f.status === 'tie') : [];
  const tieNotes = tiesOf(play);
  const liveList = fams.filter((f) => !f.redundant);
  liveList.forEach((f, i) => { if (i < 3 && liveList[i + 1] && f.status !== 'out') f.why = whyBeats(readings, f, liveList[i + 1]); });
  return { readings, dropped, warnings, n, ready, few, fit, healthy: lead.id === 'none' && fit.ok, families: fams, possible, play, next: ready && fit.ok ? nextReading(readings, play) : null, tieNotes };
}

/** The families whose heart lesion is checked against the atrial pressure (a heart lesion means a raised RA). */
const HEART_FAMILY = new Set(FAMILIES.filter((f) => f.axes.includes('rhf') || f.axes.includes('constr')).map((f) => f.id));

/**
 * The readings that separate scenario `a` from the next one `b` (the "why this one beats the next" the screen teaches from): each entered reading
 * where `a` misses by at least one allowed error less than `b` does, the largest gain first, with what each predicts. At most three.
 */
export function whyBeats(readings, a, b) {
  return Object.keys(readings).map((key) => ({ key, gain: Math.abs(b.best.per[key]) - Math.abs(a.best.per[key]) }))
    .filter((x) => x.gain >= 1).sort((x, y) => y.gain - x.gain).slice(0, 3)
    .map((x) => ({ key: x.key, entered: readings[x.key], mine: a.best.pred[x.key] ?? null, theirs: b.best.pred[x.key] ?? null }));
}

/**
 * Natural ties: scenarios the model cannot tell apart however many readings it is given, with the one sentence that says why and what would. A tie
 * group is the same lesions with the heart lesion swapped (failure and constriction are one pump and one waveform the model does not draw), or the
 * blocks before the sinusoids (presinusoidal, a clot, a clot on a scarred liver) which differ by imaging and biopsy. Returns [{ ids, text }] for the groups
 * with two or more scenarios in `play`, and marks each family's `tieGroup`.
 */
export const NATURAL_TIES = Object.freeze([
  { id: 'heart', text: 'The model cannot separate right heart failure from constrictive pericarditis; echocardiography with the RA waveform, or cardiac MR, decides.', key: (id) => (FAMILY[id].axes.includes('rhf') || FAMILY[id].axes.includes('constr') ? id.replace('constr', 'rhf') : null) },
  { id: 'pre', text: 'A presinusoidal block, PVT, and PVT with mild fibrosis give the same readings in the model; portal vein Doppler or CT and a liver biopsy decide.', set: ['presin', 'pvt', 'sinus+pvt', 'presin+pvt'] },
]);
export function tiesOf(play) {
  const out = [];
  for (const rule of NATURAL_TIES) {
    const groups = new Map();
    for (const f of play) {
      const g = rule.set ? (rule.set.includes(f.id) ? 'set' : null) : rule.key(f.id);
      if (g != null) (groups.get(g) || groups.set(g, []).get(g)).push(f);
    }
    for (const [g, list] of groups) if (list.length >= 2) { for (const f of list) f.tieGroup = `${rule.id}:${g}`; out.push({ ids: list.map((f) => f.id), text: rule.text }); }
  }
  return out;
}

// Readings the model does not make (the picture, the biopsy, the heart's waveform): never scored, named so a person knows what else would help.
/** For each family, the test outside the model that would separate it from its neighbours. Said as advice, never as a score. */
export const OUTSIDE = Object.freeze(Object.fromEntries(FAMILIES.map((f) => [f.id, f.outside])));

/**
 * The reading that would best split the scenarios still in play: for each reading not entered, the largest difference between two of them
 * in allowed errors. Returns { key, sep, verdict: 'splits' | 'barely' | 'none', pair: [familyId, familyId], by: [{ id, value }] } or null when
 * there is one scenario left or none to compare. `verdict` is honest: below BARELY no unentered reading helps, and the screen says so.
 */
export function nextReading(readings, play) {
  if (play.length < 2) return null;
  let best = null;
  for (const key of READING_KEYS) {
    if (key in readings) continue;
    const r = READINGS[key];
    const vals = play.map((f) => ({ id: f.id, value: f.best.pred[key] })).filter((x) => x.value != null);
    if (vals.length < 2) continue;
    let sep = 0, pair = null;
    for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
      const d = r.kind === 'grade' ? gradeGap(key, vals[i].value, vals[j].value) : r.kind === 'log' ? Math.abs(Math.log(Math.max(vals[i].value, 1e-3) / Math.max(vals[j].value, 1e-3))) / r.sigma : Math.abs(vals[i].value - vals[j].value) / r.sigma;
      if (d > sep) { sep = d; pair = [vals[i].id, vals[j].id]; }
    }
    if (!best || sep > best.sep) best = { key, sep, pair, by: vals };
  }
  if (!best) return null;
  return { ...best, verdict: best.sep >= SPLIT ? 'splits' : best.sep >= BARELY ? 'barely' : 'none' };
}
const gradeIndex = (key, v) => GRADE_RANGE[key].findIndex(([lo, hi]) => v >= lo && v < hi);
const gradeGap = (key, a, b) => Math.abs(gradeIndex(key, a) - gradeIndex(key, b)) * 2;

/** A reading the person entered as it is printed: "8.0 mmHg", "Grade 2", "66 kPa" (a grade is its index). */
export function readingText(key, v) {
  const r = READINGS[key];
  if (v == null) return 'none';
  if (r.kind === 'grade') return r.grades[v] ?? String(v);
  const dec = r.kind === 'log' || key === 'plt' || key === 'pvVel' ? 0 : 1;
  return `${(+v).toFixed(dec)} ${r.unit}`.trim();
}

/** A reading the person entered, as a chip prints it: the number as typed (no trailing zero, at most one decimal) and its unit, always ("24 mmHg",
 *  "1.9 g/dL", "60 ×10⁹/L"); a grade is its word. One rule for every chip, so units and precision never differ from chip to chip. */
export function chipText(key, v) {
  const r = READINGS[key];
  if (v == null || !Number.isFinite(+v)) return r.kind === 'grade' ? readingText(key, v) : 'none';
  if (r.kind === 'grade') return readingText(key, v);
  return `${String(Math.round(+v * 10) / 10)} ${r.unit}`.trim();
}

/**
 * What the MODEL gives for a reading, as it is printed. A grade reading's model value is the engine's number (varix mm, ascites mL), so it is
 * named by its grade ("Small"); readingText takes the grade INDEX a person picked. Every place that prints a prediction goes through here
 * (the Model column printed "4.1" for varices before: review U2, 15 Nov 2026).
 */
export function modelText(key, v) {
  const r = READINGS[key];
  if (v == null || !Number.isFinite(v)) return 'none';
  if (r.kind !== 'grade') return readingText(key, v);
  return r.grades[gradeIndex(key, v)] ?? 'none';
}
/** A reading's number alone (no unit), for a table that names the unit once in its row label; a grade is its word. `model`: the value is the model's. */
export function numberText(key, v, model = false) {
  const r = READINGS[key];
  if (r.kind === 'grade') return model ? modelText(key, v) : readingText(key, v);
  if (v == null || !Number.isFinite(v)) return 'none';
  return (+v).toFixed(r.kind === 'log' || key === 'plt' || key === 'pvVel' ? 0 : 1);
}

/** What a family cannot explain, in one line: "Predicts WHVP 12.4 mmHg; you entered 8.0 mmHg." (A grade reading's prediction is named by its grade.) */
export function gapLine(g) {
  const r = READINGS[g.key];
  return `Predicts ${r.short} ${g.predicted == null ? 'nothing' : modelText(g.key, g.predicted)}; you entered ${readingText(g.key, g.entered)}.`;
}

/** A fit range in words: "×30 to ×60", or "any value tried" when the readings do not set it. */
export function rangeText(axis, rg) {
  const t = (v) => settingText(axis, v);
  if (rg.fixed) return t(rg.lo);
  if (rg.whole) return 'not set by these readings';
  return rg.lo === rg.hi || t(rg.lo) === t(rg.hi) ? t(rg.lo) : `${t(rg.lo)} to ${t(rg.hi)}`;   // (two severities in one word read as that word, not "severe to severe")
}

/** Solve the small system A x = b (n up to a few) by elimination with pivoting; null when it is singular. */
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let t = M[r][n]; for (let k = r + 1; k < n; k++) t -= M[r][k] * x[k]; x[r] = t / M[r][r]; }
  return x;
}

/** The families the live fit works on: the best few by score, and always the simplest still in play (a mix of one lesion, then two), so a coarse grid cannot hide them. */
function fitCandidates(result, count) {
  const live = result.families.filter((f) => f.status !== 'out'), out = new Set(live.slice(0, Math.ceil(count / 2)));
  for (const n of [1, 2, 3]) for (const f of live.filter((x) => FAMILY[x.id].axes.length === n).slice(0, 3)) out.add(f);
  for (const f of live) if (out.size < count) out.add(f);
  return [...out].slice(0, count);
}

/** The step of the finite differences that measure how each reading moves with each severity. */
export const PROBE = 0.06;
/** How many of the best families also move their side settings (the pump, the volume, the albumin, the tone): each adds probes, so the leaders only. */
export const SIDE_FAMILIES = 4;
/** How many of the best families start their neighbours (the same mix with one lesion swapped for another of its slot). */
const SEED_FAMILIES = 3;
/** How far (in a move's own range) a point may sit from the base and still shape the slopes the step is made from. */
const NEIGHBOUR = 0.3;

/**
 * Where the live fit looks next. It is a Gauss-Newton fit on the real engine, one family at a time, so a mix of lesions finds its own
 * trade-offs instead of stepping along one setting at a time. From a family's best point it needs how each entered reading moves with each lesion's
 * severity; a probe of PROBE in severity on each lesion gives that (a probe already scored counts), and with all of them in hand it solves for the
 * move that most cuts the misfit plus the Occam cost, damped (and kept within a step that narrows with the round) so it cannot jump past what
 * the straight-line picture can promise. The families are the best few and the simplest still in play. `known` is a Map of key to point
 * ({ f, p, r }, inverse-families.js keyOf) or a Set of keys; a point already scored is never asked for again. At most `max` points, a family at a time in turn.
 */
export function refinePoints(result, known, { families = 12, max = 40, round = 1, sides = SIDE_FAMILIES } = {}) {
  if (!result.ready) return [];
  const pts = known instanceof Map ? [...known.values()] : [], seen = new Set(known instanceof Map ? known.keys() : known);
  const keys = Object.keys(result.readings), lists = [];
  fitCandidates(result, families).forEach((f, rankIn) => {
    const fam = FAMILY[f.id], base = f.best, mine = [];
    const push = (p) => { const key = keyOf(fam.id, p); if (seen.has(key)) return false; seen.add(key); mine.push({ f: f.id, p }); return true; };
    const mineAll = pts.filter((x) => x.f === f.id);
    // The settings the fit moves: each lesion's severity, and (for the best few families) each side setting, all in units of their own range so one trust region fits them.
    const moves = [
      ...fam.axes.map((k) => ({ k, side: false, lo: U_MIN, hi: U_MAX, scale: 1, probe: PROBE })),
      ...(rankIn < sides ? sidesOf(fam.axes).map((x) => ({ k: x.id, side: true, lo: x.lo, hi: x.hi, scale: x.hi - x.lo, probe: x.probe / (x.hi - x.lo) })) : []),
    ];
    const value = (p, m) => (m.side && !(m.k in p) ? sideDefault(fam.axes, m.k, p) : p[m.k]);
    // The slope of every reading along each move, from the points already run near the base: a least-squares plane through the neighbours (nearer ones count
    // more), so the slopes carry over from one step to the next and a step does not wait for a round of fresh probes. A move no neighbour has gone along
    // gets a probe of its own.
    const t = (p) => moves.map((m) => (value(p, m) - value(base.p, m)) / m.scale);
    const near = mineAll.filter((x) => x.r && t(x.p).some((d) => Math.abs(d) > 1e-9) && t(x.p).every((d) => Math.abs(d) <= NEIGHBOUR));
    const reach = moves.map((m, j) => Math.max(0, ...near.map((x) => Math.abs(t(x.p)[j]))));
    const missing = [];
    moves.forEach((m, j) => {
      if (reach[j] >= 0.02) return;
      const v0 = value(base.p, m), up = v0 + m.probe * m.scale <= m.hi + 1e-9, v = v0 + (up ? 1 : -1) * m.probe * m.scale;
      missing.push({ ...base.p, [m.k]: m.side ? sideClamp(m.k, v) : Math.round(v * 1000) / 1000 });
    });
    let J = [];
    if (!missing.length) {
      const D = near.map((x) => t(x.p)), w = D.map((d) => 1 / (1 + (Math.hypot(...d) / 0.12) ** 2));
      const G = moves.map((_, a) => moves.map((__, b) => D.reduce((acc, d, i) => acc + w[i] * d[a] * d[b], 0) + (a === b ? 1e-6 : 0)));
      const cols = keys.map((key, ki) => solve(G, moves.map((_, a) => D.reduce((acc, d, i) => acc + w[i] * d[a] * (resid(key, result.readings, near[i].r) - base.per[key]), 0))));
      if (!cols.some((c) => !c)) J = moves.map((_, a) => cols.map((c) => c[a]));
    }
    if (missing.length || !J.length) { for (const p of missing) push(p); lists.push(mine); return; }
    const r0 = keys.map((key) => base.per[key]), t0 = moves.map((m) => value(base.p, m)), trust = Math.max(0.03, 0.4 * 0.75 ** (round - 1));
    // The Occam cost's slope along each move (per unit of the move): a lesion's severity cost, or a side setting's pull back toward where its lesion puts it.
    const lean = moves.map((m, a) => (m.side ? SIDE_COST * (Math.abs(t0[a] - sideDefault(fam.axes, m.k, base.p)) < 1e-9 ? 0 : Math.sign(t0[a] - sideDefault(fam.axes, m.k, base.p))) : SEVERITY_COST));
    for (let tries = 0, lam = 0.3; tries < 8 && !mine.length; tries++, lam *= 2.5) {
      const A = moves.map((_, a) => moves.map((__, b) => J[a].reduce((t, v, i) => t + v * J[b][i], 0) + (a === b ? lam : 0)));
      const g = moves.map((_, a) => -(J[a].reduce((t, v, i) => t + v * r0[i], 0)) - lean[a] / 2);
      const sol = solve(A, g);
      if (!sol) break;
      const move = sol.map((v) => Math.max(-trust, Math.min(trust, v)));
      if (Math.max(...move.map(Math.abs)) < 0.004) break;
      const p = { ...base.p };
      moves.forEach((m, a) => {
        const v = Math.min(m.hi, Math.max(m.lo, t0[a] + move[a] * m.scale));
        if (!m.side) p[m.k] = Math.round(v * 1000) / 1000;
        else if (Math.abs(move[a]) * m.scale >= SIDE[m.k].round / 2) p[m.k] = sideClamp(m.k, v);
      });
      for (const m of moves) if (m.side && m.k in p && Math.abs(p[m.k] - sideDefault(fam.axes, m.k, p)) < SIDE[m.k].round / 2) delete p[m.k];
      push(p);
    }
    lists.push(mine);
  });
  // Starts in the neighbouring families: the best few, with each lesion swapped for another that fills the same slot (a failing heart for a constricted one,
  // a hepatic vein block for an IVC web) at the same severity. Where the model cannot tell two lesions apart one of them may sit far from the library's coarse
  // points and never be fitted; a start beside its twin's fit gets it there, and the ranking then shows both.
  const seeds = [];
  for (const f of result.families.filter((x) => !x.redundant && x.status !== 'out').slice(0, SEED_FAMILIES)) {
    const axes = FAMILY[f.id].axes;
    for (const k of axes) for (const l of LESION_IDS) {
      if (l === k || LESION[l].slot !== LESION[k].slot || axes.includes(l)) continue;
      const id = axes.map((a) => (a === k ? l : a)).sort((a, b) => LESION_IDS.indexOf(a) - LESION_IDS.indexOf(b)).join('+');
      if (!FAMILY[id]) continue;
      const p = Object.fromEntries(FAMILY[id].axes.map((a) => [a, a === l ? f.best.p[k] : f.best.p[a]])), key = keyOf(id, p);
      if (!seen.has(key)) { seen.add(key); seeds.push({ f: id, p }); }
    }
  }
  lists.unshift(seeds);
  const out = [];
  for (let i = 0; out.length < max; i++) {
    let any = false;
    for (const l of lists) if (i < l.length && out.length < max) { out.push(l[i]); any = true; }
    if (!any) break;
  }
  return out;
}

/** The library's compact rows [family, settings (in the family's axes order), readings (in READING_KEYS order), side settings the search chose (an object, only when there are any)] as points the search scores. */
export function pointsOf(rows) {
  return rows.map(([f, vals, rs, side]) => ({
    f, p: { ...Object.fromEntries(FAMILY[f].axes.map((k, i) => [k, vals[i]])), ...(side || {}) },
    r: Object.fromEntries(READING_KEYS.map((k, i) => [k, rs[i]])),
  }));
}
/** A point's readings as the library row keeps them. */
export const rowOf = (f, p, r) => {
  const side = Object.fromEntries(sidesOf(FAMILY[f].axes).filter((x) => x.id in p).map((x) => [x.id, p[x.id]]));
  return [f, FAMILY[f].axes.map((k) => p[k]), READING_KEYS.map((k) => r[k] ?? null), ...(Object.keys(side).length ? [side] : [])];
};

/**
 * Why a scenario fits, in a line or two of physiology, from the readings that were entered and the lesions in the scenario (never from a reading
 * that was not entered). Returns up to four sentences.
 */
export function reasonsFor(fam, readings, best) {
  const out = [], has = (id) => fam.parts.includes(id), after = has('rhf') || has('constr') || has('bcs') || has('ivcweb');
  const hvpg = 'whvp' in readings && 'fhvp' in readings ? readings.whvp - readings.fhvp : readings.hvpg;
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  if ('fhvp' in readings && readings.fhvp >= 8 && after) out.push(`FHVP ${f1(readings.fhvp)} mmHg is raised: the pressure downstream of the sinusoids is high, which only a posthepatic block or a cardiac cause produces.`);
  if ('ra' in readings && readings.ra >= 10 && (has('rhf') || has('constr'))) out.push(`RA ${f1(readings.ra)} mmHg places the cause in the heart; the pressure is transmitted back through the IVC and hepatic veins to the liver.`);
  if ('ra' in readings && readings.ra <= 6 && 'fhvp' in readings && readings.fhvp >= 8 && (has('ivcweb') || has('bcs'))) out.push(`RA ${f1(readings.ra)} mmHg is normal, so the obstruction lies between the liver and the right atrium (hepatic veins or IVC), not in the heart.`);
  if (hvpg != null && hvpg >= HVPG_CUTS.amber && (has('sinus') || has('presin') || has('post'))) {
    const st = has('sinus') && best ? pctText(LESION.sinus.set(best.p.sinus).scar) : null;
    out.push(`HVPG ${f1(hvpg)} mmHg requires intrahepatic resistance${st && hvpg < HVPG_CUTS.red ? `; the cirrhosis slider at ${st} produces it` : ''}.`);
  } else if (hvpg != null && hvpg < HVPG_CUTS.amber && !has('sinus') && !has('presin') && !has('post')) out.push(`HVPG ${f1(hvpg)} mmHg is normal, as with a purely prehepatic or posthepatic block.`);
  if ('lsm' in readings && best) {
    const v = f1(readings.lsm), pct = has('sinus') ? pctText(LESION.sinus.set(best.p.sinus).scar) : null, cong = congests(fam);
    // (Baveno VIII's LSM bands are for compensated advanced chronic liver disease: said only where cirrhosis is in the scenario, and the stiffness is credited to the lesion that makes it.)
    if (pct) out.push(`LSM ${v} kPa: ${readings.lsm >= LSM_CUTS.unlikely ? lsmBand(readings.lsm) + '; ' : ''}the cirrhosis slider at ${pct} produces it${cong ? ', and congestion adds to it' : ''}.`);
    else if (cong) out.push(`LSM ${v} kPa: congestion raises liver stiffness, so the Baveno VIII cut-offs do not apply.`);
  }
  if ('spleen' in readings && readings.spleen >= 14 && hvpg != null && hvpg < HVPG_CUTS.amber && (has('presin') || has('pvt'))) out.push('Splenomegaly with a normal HVPG points to presinusoidal or prehepatic resistance.');
  return out.slice(0, 4);
}

/** The exact model settings of a result's best fit: [{ lesion, label, text }] (inverse-families.js settingsOf). */
export const settingsFor = (fam, p) => settingsOf(fam.id, p);

/** Where a liver stiffness falls in Baveno VIII's bands (lsm-cuts.js): in words. */
export const lsmBand = (v) => (v < LSM_CUTS.unlikely ? `under ${LSM_CUTS.unlikely}, compensated advanced chronic liver disease is unlikely` : v <= LSM_CUTS.likely ? `${LSM_CUTS.unlikely} to ${LSM_CUTS.likely}, suggests compensated advanced chronic liver disease` : v < LSM_CUTS.ruleIn ? `over ${LSM_CUTS.likely}, highly likely compensated advanced chronic liver disease` : `${LSM_CUTS.ruleIn} or more, rules clinically significant portal hypertension in`);
/** Where an HVPG falls: normal, raised, or clinically significant. */
export const hvpgBand = (v) => (v < HVPG_CUTS.amber ? `under ${HVPG_CUTS.amber}, normal range` : v < HVPG_CUTS.red ? `${HVPG_CUTS.amber} to ${HVPG_CUTS.red}, portal hypertension below the clinically significant cut-off` : `${HVPG_CUTS.red} or more, clinically significant portal hypertension`);
/** Lesions that congest the liver (a heart lesion, or a block after it): they raise liver stiffness and the pressures beyond the sinusoids. */
const CONGESTING = ['rhf', 'constr', 'bcs', 'ivcweb', 'post'];
/** Lesions that sit before the sinusoids: the HVPG under-reads the portal pressure there (Baveno VIII, PSVD and pre-hepatic block). */
const BEFORE_LIVER = ['presin', 'pvt'];
const congests = (fam) => !!fam && fam.parts.some((id) => CONGESTING.includes(id));
const f1text = (v) => (Math.round(v * 10) / 10).toFixed(1);
/**
 * What a scenario's fit gives for the two measures that grade liver disease: [{ label, text, band }] (what the model makes, not what was entered).
 * The bands are said only where they apply (review U3, 15 Nov 2026). Baveno VIII's LSM bands are for compensated advanced chronic liver disease, so
 * they are printed when cirrhosis is in the scenario; congestion from the heart or the outflow raises stiffness without it, and a block before the
 * liver is not read by them. The HVPG band is for a pressure inside or after the sinusoids; before them the HVPG under-reads, so the model's PPG is named.
 * `fam` is the scenario's family; left out, every band applies.
 */
export function bandsOf(pred, fam = null) {
  // (The no-lesion family has no lesion to qualify the bands: the plain ones apply.)
  const out = [], parts = fam ? fam.parts : ['sinus'], sinus = parts.includes('sinus') || (!!fam && !parts.length), before = parts.some((id) => BEFORE_LIVER.includes(id));
  if (pred.hvpg != null) {
    const band = before ? `underestimates the portal pressure with a presinusoidal or prehepatic block${pred.ppg != null ? `; the model's PPG is ${f1text(pred.ppg)} mmHg` : ''}` : hvpgBand(pred.hvpg);
    out.push({ label: 'HVPG', text: `${f1text(pred.hvpg)} mmHg`, band });
  }
  if (pred.lsm != null) {
    const band = sinus ? lsmBand(pred.lsm) + (congests(fam) ? '; congestion raises it too' : '')
      : congests(fam) ? 'congestion raises it, so the Baveno VIII cut-offs do not apply'
        : 'the Baveno VIII cut-offs are for cirrhosis and are not applied to a presinusoidal or prehepatic block';
    out.push({ label: 'LSM', text: `${f1text(pred.lsm)} kPa`, band });
  }
  return out;
}
