// Work backward (the patient menu's "From readings"): the search itself, pure numbers in and out, no engine. Readings the person has go in;
// out comes a ranked list of lesion families, each with the settings that fit, what it cannot explain and the reading that would split the
// candidates. The virtual patients it scores are the shipped library (inverse-library.js, made by scripts/gen-inverse-library.mjs from the
// engine itself) plus any the live refinement adds (inverse-worker.js), so a prediction here is what the app would show for that patient.
//
// What this is, said once because every screen repeats it: a search for MODEL scenarios that could give the readings, never a diagnosis.
// Unknown readings are not scored and not guessed. A scenario fits when its predictions sit inside each reading's allowed error (sigma);
// two scenarios whose scores are within TIE of each other are shown as a tie, never as a first and a second.

import { ASCITES_CUTS, VARIX_NONE_MM, VARIX_LARGE_MM } from './metrics.js';
import { FAMILIES, FAMILY, AXES, spanOf, keyOf } from './inverse-families.js';

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
  lsm: { label: 'Liver stiffness (LSM)', short: 'LSM', unit: 'kPa', kind: 'log', sigma: 0.18, min: 1, max: 75 },
  ssm: { label: 'Spleen stiffness (SSM)', short: 'SSM', unit: 'kPa', kind: 'log', sigma: 0.15, min: 5, max: 100 },
  spleen: { label: 'Spleen length', short: 'Spleen', unit: 'cm', kind: 'abs', sigma: 1, min: 5, max: 30 },
  plt: { label: 'Platelets', short: 'Platelets', unit: '×10⁹/L', kind: 'log', sigma: 0.18, min: 10, max: 600 },
  pvVel: { label: 'Portal vein velocity', short: 'PV velocity', unit: 'cm/s', kind: 'abs', sigma: 6, min: -40, max: 80, note: 'Zero if there is no flow; negative if it runs away from the liver.' },
  saag: { label: 'SAAG', short: 'SAAG', unit: 'g/dL', kind: 'abs', sigma: 0.3, min: 0, max: 5 },
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

/** How many readings must be entered before the search runs: fewer cannot tell families apart, and a ranking from two numbers would only look sure. */
export const MIN_READINGS = 4;
/** Each setting a family fits beyond the first costs this much, so an extra component has to earn its place (an Akaike-style penalty). */
export const SETTING_COST = 2;
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
/** The live refinement: this many rounds, each running at most this many patients one step either side of the best fits. */
export const REFINE_ROUNDS = 3;
export const REFINE_PER_ROUND = 14;

/** A reading's residual in allowed errors (signed: prediction minus entered). `entered` is the number, or a grade index for asc and varix. */
export function residual(key, entered, predicted) {
  const r = READINGS[key];
  if (predicted == null || !Number.isFinite(predicted)) return MISS;
  if (r.kind === 'abs') return (predicted - entered) / r.sigma;
  if (r.kind === 'log') return Math.log(Math.max(predicted, 1e-3) / entered) / r.sigma;
  const [lo, hi] = GRADE_RANGE[key][entered], p = scaleOf(key, predicted);
  if (predicted < lo) return (p - scaleOf(key, lo)) / r.sigma;
  if (predicted >= hi) return (p - scaleOf(key, hi)) / r.sigma;
  return 0;
}

/**
 * Tidy what was typed: a reading that is blank, not a number or out of its range is dropped (and named, so the screen says so); the HVPG is
 * dropped when both pressures it is made of are entered (it would count one reading twice); the PPG when the portal vein and IVC pressures
 * are both entered. Returns { readings, dropped: [{ key, why }] }.
 */
export function normalise(raw = {}) {
  const readings = {}, dropped = [];
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
  if ('hvpg' in readings && 'whvp' in readings && 'fhvp' in readings) { delete readings.hvpg; dropped.push({ key: 'hvpg', why: 'made from the two pressures above' }); }
  if ('ppg' in readings && 'pv' in readings && 'ivc' in readings) { delete readings.ppg; dropped.push({ key: 'ppg', why: 'made from the two pressures above' }); }
  return { readings, dropped };
}

/** One virtual patient's score: { chi (sum of squared residuals), per (residual of each entered reading) }. */
export function scorePoint(readings, pred) {
  let chi = 0;
  const per = {};
  for (const key of Object.keys(readings)) { const d = residual(key, readings[key], pred[key]); per[key] = d; chi += d * d; }
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
 * Returns { readings, dropped, n, ready, families, possible, play, next }:
 *  ready     whether enough readings are in (MIN_READINGS) to show a ranking; below that the families are still scored, so a screen can say how many remain
 *  possible  how many families are not ruled out (the count a guided entry shows beside each reading)
 *  families  every family, best first: { id, label, sub, status, delta, best: { p, chi, score, per, pred }, free, ranges, predicts, gaps, marks, count }
 *  play      the families still in play (status best or tie), the ones the next reading must split
 *  next      the reading to take next, see nextReading()
 */
export function rank(raw, points) {
  const { readings, dropped } = normalise(raw);
  const keys = Object.keys(readings), n = keys.length;
  if (n < 1) return { readings, dropped, n, ready: false, families: [], possible: FAMILIES.length, play: [], next: null };
  const by = new Map(FAMILIES.map((f) => [f.id, []]));
  for (const pt of points) { const s = scorePoint(readings, pt.r); by.get(pt.f)?.push({ ...pt, ...s }); }
  const fams = [];
  for (const f of FAMILIES) {
    const pts = by.get(f.id);
    if (!pts.length) continue;
    const best = pts.reduce((a, b) => (b.chi < a.chi ? b : a));
    const cost = SETTING_COST * (f.free - 1);
    const ok = pts.filter((pt) => pt.chi <= best.chi + RANGE_SLACK);
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
    fams.push({ id: f.id, label: f.label, short: f.short, sub: f.sub, free: f.free, best: { p: best.p, chi: best.chi, score: best.chi + cost, per: best.per, pred: best.r }, score: best.chi + cost, delta: 0, status: /** @type {'best' | 'tie' | 'possible' | 'out'} */ ('out'), ranges, predicts, marks, gaps, count: ok.length });
  }
  fams.sort((a, b) => a.score - b.score);
  const top = fams[0].score;
  for (const f of fams) { f.delta = f.score - top; f.status = statusOf(f.delta); }
  const ready = n >= MIN_READINGS, possible = fams.filter((f) => f.status !== 'out').length;
  const play = ready ? fams.filter((f) => f.status === 'best' || f.status === 'tie') : [];
  return { readings, dropped, n, ready, families: fams, possible, play, next: ready ? nextReading(readings, play) : null };
}

// Readings the model does not make (the picture, the biopsy, the heart's waveform): never scored, named so a person knows what else would help.
/** For each family, the test outside the model that would separate it from its neighbours. Said as advice, never as a score. */
export const OUTSIDE = Object.freeze({
  sinus: 'Liver biopsy or elastography for the cause and stage; the model has neither.',
  presin: 'Liver biopsy for obliterative portal venopathy and to exclude cirrhosis; history and imaging for the cause.',
  pvt: 'Doppler or contrast CT or MR of the portal vein: a cavernoma is a picture the model does not make.',
  post: 'History (drugs, radiation, transplant) and biopsy; the model reads one central-vein lesion.',
  bcs: 'Doppler or MR venography of the hepatic veins and IVC.',
  ivcweb: 'Cavography or MR venography of the IVC.',
  rhf: 'Echocardiography with the RA waveform; the model cannot draw it.',
  constr: 'Echocardiography and cardiac MR or CT for septal bounce, filling pattern and a thick pericardium.',
  mixpre: 'Liver biopsy: the model cannot tell a mixed pattern from its parts.',
  mixpvt: 'Doppler or CT of the portal vein, and biopsy for the stage of the scar.',
  mixrhf: 'Echocardiography with the RA waveform, and biopsy for the liver’s own scar.',
  mixconstr: 'Echocardiography and cardiac MR or CT, and biopsy for the liver’s own scar.',
  mixbcs: 'Doppler or MR venography of the hepatic veins, and biopsy for the scar.',
  prepvt: 'Doppler or CT of the portal vein, and liver biopsy to exclude cirrhosis.',
});

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

/** What a family cannot explain, in one line: "Predicts WHVP 12.4 mmHg; you entered 8.0 mmHg." (A grade reading's prediction is named by its grade.) */
export function gapLine(g) {
  const r = READINGS[g.key];
  const pred = g.predicted == null ? 'nothing' : r.kind === 'grade' ? r.grades[gradeIndex(g.key, g.predicted)] : readingText(g.key, g.predicted);
  return `Predicts ${r.short} ${pred}; you entered ${readingText(g.key, g.entered)}.`;
}

/** A fit range in words: "×30 to ×60", or "any value tried" when the readings do not set it. */
export function rangeText(axis, rg) {
  const a = AXES[axis], t = (v) => (a.unit === '×' ? `×${v}` : a.unit === '%' ? `${v}%` : a.unit === 'mL' ? `${v} mL` : a.unit === 'g/dL' ? `${v} g/dL` : String(v));
  if (rg.fixed) return t(rg.lo);
  if (rg.whole) return 'not set by these readings';
  return rg.lo === rg.hi ? t(rg.lo) : `${t(rg.lo)} to ${t(rg.hi)}`;
}

/**
 * Where the live refinement looks next: for each of the best `families` families, the points one step either side of its best point on each
 * setting (inside the family's span) that are not scored yet. `known` is a Set of keys (inverse-families.js keyOf). At most `max` points.
 */
export function refinePoints(result, known, { families = 3, max = 40 } = {}) {
  if (!result.ready) return [];
  const out = [], seen = new Set(known);
  for (const f of result.families.slice(0, families)) {
    const fam = FAMILY[f.id];
    for (const k of fam.axes) {
      const [lo, hi] = spanOf(f.id, k), step = AXES[k].step;
      if (hi === lo) continue;
      for (const dir of [-1, 1]) {
        const v = Math.round((f.best.p[k] + dir * step) * 1000) / 1000;
        if (v < lo - 1e-9 || v > hi + 1e-9) continue;
        const p = { ...f.best.p, [k]: v }, key = keyOf(fam.id, p);
        if (seen.has(key)) continue;
        seen.add(key); out.push({ f: f.id, p });
      }
    }
  }
  return out.slice(0, max);
}

/** The library's compact rows [family, settings (in the family's axes order), readings (in READING_KEYS order)] as points the search scores. */
export function pointsOf(rows) {
  return rows.map(([f, vals, rs]) => ({
    f, p: Object.fromEntries(FAMILY[f].axes.map((k, i) => [k, vals[i]])),
    r: Object.fromEntries(READING_KEYS.map((k, i) => [k, rs[i]])),
  }));
}
/** A point's readings as the library row keeps them. */
export const rowOf = (f, p, r) => [f, FAMILY[f].axes.map((k) => p[k]), READING_KEYS.map((k) => r[k] ?? null)];
