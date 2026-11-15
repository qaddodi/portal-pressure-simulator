// Work backward (the patient menu's "From readings"): the lesion families the search tries, each with the settings it may vary, the
// grid of virtual patients that is run once for the shipped library (inverse-library.js, scripts/gen-inverse-library.mjs) and the live
// refinement round the worker adds (inverse-worker.js), and how a family's settings become a patient the engine can load.
//
// A family is a kind of lesion, not a diagnosis: "Presinusoidal block" is narrowed portal venules with no cirrhosis, and the model has one such
// lesion for PSVD, schistosomiasis and the rest. `free` is how many settings the family fits to the readings, and each beyond the first costs
// the family a penalty in the ranking (inverse.js), so an extra component must earn its place.
//
// A virtual patient is { f: family id, p: its settings }, and patientOf() gives what the engine needs for it: a params patch, the days the disease
// clock runs, and the volume a failing or constricted heart keeps. No imports: the page, the worker and the generator all read it.

const r2 = (v) => Math.round(v * 100) / 100;
const pts = (lo, hi, step) => { const out = []; for (let v = lo; v <= hi + 1e-9; v += step) out.push(r2(v)); return out; };
const cross = (axes) => Object.entries(axes).reduce((acc, [k, vals]) => acc.flatMap((o) => vals.map((v) => ({ ...o, [k]: v }))), [{}]);

/** Each setting: { label, unit ('' | '×' | '%' | 'mL' | 'g/dL'), step (the live refinement's smallest move), note }. The span tried is the family's own grid. */
const A = {
  scar: { label: 'Scar setting', unit: '', step: 0.05, note: 'the model’s 0 to 1 scale, not a METAVIR score' },
  alb: { label: 'Albumin', unit: 'g/dL', step: 0.7 },
  pre: { label: 'Resistance before the sinusoids', unit: '×', step: 10 },
  sin: { label: 'Sinusoid narrowing', unit: '×', step: 0.4 },
  clot: { label: 'Clot in the trunk', unit: '%', step: 5 },
  post: { label: 'Resistance at the central veins', unit: '×', step: 12 },
  veins: { label: 'Hepatic veins thrombosed', unit: '', step: 1 },
  occl: { label: 'How shut', unit: '%', step: 20 },
  stenosis: { label: 'IVC narrowing', unit: '%', step: 20 },
  contr: { label: 'Pump strength', unit: '', step: 0.15, note: '1 is normal' },
  tr: { label: 'Tricuspid regurgitation', unit: '', step: 0.3, note: '0 to 1' },
  peric: { label: 'Constriction', unit: '', step: 0.3, note: '0 to 1' },
  vol: { label: 'Extra volume held', unit: 'mL', step: 300 },
};

// The hepatic veins clot in the order right, middle, left: `veins` of them, each `occl` shut.
const HV_IDS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];
const hvPatch = (veins, occl) => ({ thrombus: Object.fromEntries(HV_IDS.slice(0, veins).map((id) => [id, occl])) });
const preFib = (pre, sin) => ({ fibrosis: { R: { pre, sin }, L: { pre, sin } } });

/**
 * id, label, sub: the family and its one line; group: the patient list's own group (scenario.js PRESETS group); free: settings it fits;
 * axes: the settings by key; grid: the virtual patients of the shipped library; patch/days/volume: how a setting becomes a patient;
 * limits: what the model cannot say about this family; ev: the guideline line behind it (Baveno VIII or AASLD 2024 only).
 */
export const FAMILIES = [
  { id: 'sinus', label: 'Sinusoidal block', sub: 'Cirrhosis: the resistance sits in the sinusoids.', group: 'Sinusoidal', free: 2, axes: ['scar', 'alb'],
    grid: cross({ scar: pts(0.2, 1, 0.05), alb: [4, 3, 2.6] }),
    patch: (p) => ({ cirrhosis: p.scar, ...(p.alb < 4 ? { albumin: p.alb, diuretics: true } : {}) }), days: (p) => (p.scar > 0.8 ? 540 : 365), volume: () => 0,
    limits: 'The model has no stage and no cause. The scar setting is a scale from 0 to 1, not a METAVIR score.',
    ev: 'HVPG 10 mmHg or more is clinically significant portal hypertension (Baveno VIII; AASLD 2024).' },
  { id: 'presin', label: 'Presinusoidal block', sub: 'Narrowed portal venules and no cirrhosis. PSVD and schistosomiasis are one lesion to the model.', group: 'Presinusoidal', free: 2, axes: ['pre', 'sin'],
    grid: cross({ pre: [10, 20, 30, 40, 50, 60, 70, 80], sin: [1, 2.2, 3] }),
    patch: (p) => preFib(p.pre, p.sin), days: () => 365, volume: () => 0,
    limits: 'The model has one presinusoidal lesion. PSVD, schistosomiasis and other causes read the same here; history and biopsy decide between them.',
    ev: 'Baveno VIII 8.40 to 8.44 (PSVD without cirrhosis): in PSVD an SSM above 40 kPa is a specific sign of portal hypertension (8.44).' },
  { id: 'pvt', label: 'Chronic portal vein thrombosis', sub: 'Clot in the trunk, collaterals formed (a cavernoma).', group: 'Pre-hepatic', free: 1, axes: ['clot'],
    grid: cross({ clot: pts(50, 100, 5) }),
    patch: (p) => ({ thrombus: { PV_TRUNK: p.clot / 100 } }), days: () => 240, volume: () => 0,
    limits: 'A clot of 65 to 75% still passes flow, so “no flow” only holds for a nearly complete clot. The model has no cavernoma image to show.', ev: '' },
  { id: 'post', label: 'Postsinusoidal block', sub: 'Resistance at the central veins (sinusoidal obstruction type).', group: 'Postsinusoidal', free: 1, axes: ['post'],
    grid: cross({ post: [4, 8, 16, 32, 48, 64, 80] }),
    patch: (p) => ({ fibrosis: { R: { post: p.post }, L: { post: p.post } } }), days: () => 21, volume: () => 0,
    limits: 'The model has one central-vein lesion, taken at three weeks. It does not separate drug, radiation or transplant causes.', ev: '' },
  { id: 'bcs', label: 'Hepatic vein outflow block', sub: 'Budd–Chiari: the hepatic veins are thrombosed.', group: 'Post-hepatic', free: 2, axes: ['veins', 'occl'],
    grid: [{ veins: 1, occl: 100 }, { veins: 2, occl: 100 }, { veins: 3, occl: 60 }, { veins: 3, occl: 80 }, { veins: 3, occl: 100 }],
    patch: (p) => hvPatch(p.veins, p.occl / 100), days: () => 60, volume: () => 0,
    limits: 'With the right hepatic vein shut the app prints no HVPG, so a wedged reading from this patient would not exist.', ev: '' },
  { id: 'ivcweb', label: 'IVC web', sub: 'Suprahepatic IVC stenosis.', group: 'Post-hepatic', free: 1, axes: ['stenosis'],
    grid: cross({ stenosis: [40, 60, 80] }),
    patch: (p) => ({ stenosis: { IVCS_RA: p.stenosis / 100 } }), days: () => 90, volume: () => 800,
    limits: 'Taken at three months with 800 mL of extra volume held.', ev: '' },
  { id: 'rhf', label: 'Right heart failure with TR', sub: 'High right atrial pressure carried back to the liver.', group: 'Cardiac', free: 3, axes: ['contr', 'tr', 'vol'],
    grid: cross({ contr: [0.25, 0.4, 0.6], tr: [0.3, 0.6, 0.9], vol: [800, 1300, 1800] }),
    patch: (p) => ({ contractility: p.contr, tr: p.tr }), days: () => 60, volume: (p) => p.vol,
    limits: 'The model’s heart is a pump strength and a leak. It cannot draw the waveform that tells this from constriction.', ev: '' },
  { id: 'constr', label: 'Constrictive pericarditis', sub: 'The pericardium holds the right heart; RA pressure is high.', group: 'Cardiac', free: 2, axes: ['peric', 'vol'],
    grid: cross({ peric: [0.7, 0.9, 1], vol: [600, 1000, 1300, 1800] }),
    patch: (p) => ({ pericardial: p.peric }), days: () => 60, volume: (p) => p.vol,
    limits: 'The model’s pericardium is one constriction number. It cannot draw septal bounce or the filling pattern.', ev: '' },
  { id: 'mixpre', label: 'Cirrhosis with a presinusoidal part', sub: 'The MASLD-type pattern: the wedge under-reads the portal pressure.', group: 'Sinusoidal', free: 2, axes: ['scar', 'pre'],
    grid: cross({ scar: pts(0.3, 0.9, 0.1), pre: [2, 3, 4, 6] }),
    patch: (p) => ({ cirrhosis: p.scar, fibrosis: { R: { pre: p.pre }, L: { pre: p.pre } } }), days: () => 365, volume: () => 0,
    limits: 'The model has no cause. “MASLD-type” means a presinusoidal share, not a diagnosis.',
    ev: 'Baveno VIII 2.5: in MASLD-related cACLD the HVPG may underestimate the portal pressure gradient.' },
  { id: 'mixpvt', label: 'Portal vein thrombosis with mild cirrhosis', sub: 'The clot, plus a light sinusoidal fibrosis.', group: 'Pre-hepatic', free: 2, axes: ['scar', 'clot'],
    grid: cross({ scar: [0.2, 0.3, 0.4, 0.6, 0.8], clot: [50, 70, 100] }),
    patch: (p) => ({ cirrhosis: p.scar, thrombus: { PV_TRUNK: p.clot / 100 } }), days: () => 365, volume: () => 0,
    limits: 'Mild fibrosis is not required by the readings; it is allowed by them. The model cannot tell a little cirrhosis from none at this stiffness.', ev: '' },
  { id: 'mixrhf', label: 'Cirrhosis with right heart failure', sub: 'A fibrotic liver that is also congested.', group: 'Cardiac', free: 2, axes: ['scar'],
    grid: cross({ scar: [0.4, 0.6, 0.8] }),
    patch: (p) => ({ cirrhosis: p.scar, contractility: 0.4, tr: 0.6 }), days: () => 365, volume: () => 1000,
    limits: 'The heart is held at one setting (pump 0.4, leak 0.6) with 1 L of extra volume; only the scar is fitted.', ev: '' },
];

export const AXES = A;

/** The span a family's grid covers on one setting: [lowest, highest]. A fit range as wide as this is not set by the readings. */
export const spanOf = (f, axis) => { const v = FAMILY[f].grid.map((g) => g[axis]); return [Math.min(...v), Math.max(...v)]; };
export const FAMILY = Object.freeze(Object.fromEntries(FAMILIES.map((f) => [f.id, f])));
export const FAMILY_IDS = FAMILIES.map((f) => f.id);

/** What the engine needs for family `f` at settings `p`: a params patch, the disease days and the volume held. */
export function patientOf(f, p) {
  const fam = FAMILY[f];
  return { patch: fam.patch(p), days: fam.days(p), volume: fam.volume(p) };
}

/** The settings of a family as the library keys them: a stable string, for matching a refined point to a library one. */
export const keyOf = (f, p) => f + ':' + FAMILY[f].axes.map((k) => p[k]).join(',');

/** A setting's value as people read it ("×50", "80%", "0.6"). */
export function settingText(axis, v) {
  const a = A[axis];
  return a.unit === '×' ? `×${v}` : a.unit === '%' ? `${v}%` : a.unit === 'mL' ? `${v} mL` : a.unit === 'g/dL' ? `${v} g/dL` : String(v);
}
