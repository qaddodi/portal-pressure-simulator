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
/**
 * The scar setting as a fibrosis stage. The model's scale is 0 to 1; read by what it makes (liver stiffness about 6 kPa at 0.2, 8 at 0.3, 12 at 0.4,
 * 18 or more from 0.5; HVPG 3 to 5 before 0.4 and clinically significant from about 0.55) it is F1, F2, F3 and F4, and F4 runs on to decompensation.
 * The combinations try each stage, so "F2 fibrosis + heart failure" is a scenario of its own and not "cirrhosis + X".
 */
export const stageOf = (v) => (v < 0.25 ? 'F1' : v < 0.35 ? 'F2' : v < 0.45 ? 'F3' : 'F4');
const STAGES = [0.2, 0.3, 0.4, 0.6, 0.9];
/** The volume a failing or constricted heart holds: the free pressure climbs about 3.5 mmHg for each 200 mL between 1 and 1.8 L, so the grid steps 200 mL. */
const VOLS = [1000, 1200, 1400, 1600, 1800];
const cross = (axes) => Object.entries(axes).reduce((acc, [k, vals]) => acc.flatMap((o) => vals.map((v) => ({ ...o, [k]: v }))), [{}]);

/** Each setting: { label, unit ('' | '×' | '%' | 'mL' | 'g/dL'), step (the live refinement's smallest move), note }. The span tried is the family's own grid. */
const A = {
  scar: { label: 'Fibrosis', unit: 'stage', step: 0.05, note: 'the model’s 0 to 1 scar setting, read as a stage by its stiffness and HVPG; not a biopsy score' },
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
  vol: { label: 'Extra volume held', unit: 'mL', step: 200 },
};

// The hepatic veins clot in the order right, middle, left: `veins` of them, each `occl` shut.
const HV_IDS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];
const hvPatch = (veins, occl) => ({ thrombus: Object.fromEntries(HV_IDS.slice(0, veins).map((id) => [id, occl])) });
const preFib = (pre, sin) => ({ fibrosis: { R: { pre, sin }, L: { pre, sin } } });

/**
 * id, label, short (the chip's word), sub: the family and its one line; group: the patient list's own group (scenario.js PRESETS group); free: settings it fits;
 * axes: the settings by key; grid: the virtual patients of the shipped library; patch/days/volume: how a setting becomes a patient;
 * limits: what the model cannot say about this family; ev: the guideline line behind it (Baveno VIII or AASLD 2024 only).
 */
const SINGLE = [
  { id: 'sinus', short: 'Sinusoidal', label: 'Sinusoidal block', sub: 'Cirrhosis: the resistance sits in the sinusoids.', group: 'Sinusoidal', free: 2, axes: ['scar', 'alb'],
    grid: cross({ scar: pts(0.2, 1, 0.05), alb: [4, 3, 2.6] }),
    patch: (p) => ({ cirrhosis: p.scar, ...(p.alb < 4 ? { albumin: p.alb, diuretics: true } : {}) }), days: (p) => (p.scar > 0.8 ? 540 : 365), volume: () => 0,
    limits: 'The model has no cause. Its scar setting is read as a stage by the stiffness and HVPG it makes (F2 about 8 kPa, F3 about 12, F4 from 15); that is a match to the model, not a biopsy score.',
    ev: 'HVPG 10 mmHg or more is clinically significant portal hypertension (Baveno VIII; AASLD 2024).' },
  { id: 'presin', short: 'Presinusoidal', label: 'Presinusoidal block', sub: 'Narrowed portal venules and no cirrhosis. PSVD and schistosomiasis are one lesion to the model.', group: 'Presinusoidal', free: 2, axes: ['pre', 'sin'],
    grid: cross({ pre: [10, 20, 30, 40, 50, 60, 70, 80], sin: [1, 2.2, 3] }),
    patch: (p) => preFib(p.pre, p.sin), days: () => 365, volume: () => 0,
    limits: 'The model has one presinusoidal lesion. PSVD, schistosomiasis and other causes read the same here; history and biopsy decide between them.',
    ev: 'Baveno VIII 8.40 to 8.44 (PSVD without cirrhosis): in PSVD an SSM above 40 kPa is a specific sign of portal hypertension (8.44).' },
  { id: 'pvt', short: 'Chronic PVT', label: 'Chronic portal vein thrombosis', sub: 'Clot in the trunk, collaterals formed (a cavernoma).', group: 'Pre-hepatic', free: 1, axes: ['clot'],
    grid: cross({ clot: pts(50, 100, 5) }),
    patch: (p) => ({ thrombus: { PV_TRUNK: p.clot / 100 } }), days: () => 240, volume: () => 0,
    limits: 'A clot of 65 to 75% still passes flow, so “no flow” only holds for a nearly complete clot. The model has no cavernoma image to show.', ev: '' },
  { id: 'post', short: 'Postsinusoidal', label: 'Postsinusoidal block', sub: 'Resistance at the central veins (sinusoidal obstruction type).', group: 'Postsinusoidal', free: 1, axes: ['post'],
    grid: cross({ post: [4, 8, 16, 32, 48, 64, 80] }),
    patch: (p) => ({ fibrosis: { R: { post: p.post }, L: { post: p.post } } }), days: () => 21, volume: () => 0,
    limits: 'The model has one central-vein lesion, taken at three weeks. It does not separate drug, radiation or transplant causes.', ev: '' },
  { id: 'bcs', short: 'Hepatic veins', label: 'Hepatic vein outflow block', sub: 'Budd–Chiari: the hepatic veins are thrombosed.', group: 'Post-hepatic', free: 2, axes: ['veins', 'occl'],
    grid: [{ veins: 1, occl: 100 }, { veins: 2, occl: 100 }, { veins: 3, occl: 60 }, { veins: 3, occl: 80 }, { veins: 3, occl: 100 }],
    patch: (p) => hvPatch(p.veins, p.occl / 100), days: () => 60, volume: () => 0,
    limits: 'With the right hepatic vein shut the app prints no HVPG, so a wedged reading from this patient would not exist.', ev: '' },
  { id: 'ivcweb', short: 'IVC web', label: 'IVC web', sub: 'Suprahepatic IVC stenosis.', group: 'Post-hepatic', free: 1, axes: ['stenosis'],
    grid: cross({ stenosis: [40, 60, 80] }),
    patch: (p) => ({ stenosis: { IVCS_RA: p.stenosis / 100 } }), days: () => 90, volume: () => 800,
    limits: 'Taken at three months with 800 mL of extra volume held.', ev: '' },
  { id: 'rhf', short: 'Right heart', label: 'Right heart failure with TR', sub: 'High right atrial pressure carried back to the liver.', group: 'Cardiac', free: 3, axes: ['contr', 'tr', 'vol'],
    grid: cross({ contr: [0.25, 0.4, 0.6], tr: [0.3, 0.6, 0.9], vol: VOLS }),
    patch: (p) => ({ contractility: p.contr, tr: p.tr }), days: () => 60, volume: (p) => p.vol,
    limits: 'The model’s heart is a pump strength and a leak. It cannot draw the waveform that tells this from constriction.', ev: '' },
  { id: 'constr', short: 'Constriction', label: 'Constrictive pericarditis', sub: 'The pericardium holds the right heart; RA pressure is high.', group: 'Cardiac', free: 2, axes: ['peric', 'vol'],
    grid: cross({ peric: [0.7, 0.9, 1], vol: [600, 800, ...VOLS] }),
    patch: (p) => ({ pericardial: p.peric }), days: () => 60, volume: (p) => p.vol,
    limits: 'The model’s pericardium is one constriction number. It cannot draw septal bounce or the filling pattern.', ev: '' },
];

// Two lesions together. A combination is its own family: it takes the settings of both lesions (the ones it varies are `axes`, the rest are held at
// `fixed`), builds the patient by laying one lesion's params patch over the other's, and runs the disease clock for the longer of the two. It is
// charged for the second lesion (free = settings varied + 1, so the ranking's cost is 2 for the lesion beyond the settings it adds), so a
// combination only comes out ahead of a single lesion when it explains the readings clearly better. Axes never repeat across the two parts.
const merge = (a, b) => {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object' ? merge(out[k], b[k]) : b[k];
  return out;
};
const BASE = Object.fromEntries(SINGLE.map((f) => [f.id, f]));
function combo({ id, short, label, sub, group, parts, fixed = {}, grid, limits, ev = '' }) {
  const ps = parts.map((x) => BASE[x]), axes = Object.keys(grid[0]), all = (p) => ({ ...fixed, ...p });
  return { id, short, label, sub, group, free: axes.length + 1, axes, grid, parts,
    patch: (p) => ps.reduce((acc, f) => merge(acc, f.patch(all(p))), {}),
    days: (p) => Math.max(...ps.map((f) => f.days(all(p)))), volume: (p) => Math.max(...ps.map((f) => f.volume(all(p)))), limits, ev };
}
const COMBOS = [
  combo({ id: 'mixpre', short: 'Cirrhosis + pre', label: 'Cirrhosis + presinusoidal block', sub: 'The MASLD-type pattern: a presinusoidal part in a cirrhotic liver, so the wedge under-reads the portal pressure.', group: 'Sinusoidal',
    parts: ['sinus', 'presin'], fixed: { alb: 4, sin: 1 }, grid: cross({ scar: [0.3, 0.4, 0.6, 0.9], pre: [2, 3, 4, 6] }),
    limits: 'The model has no cause. “MASLD-type” means a presinusoidal share, not a diagnosis.',
    ev: 'Baveno VIII 2.5: in MASLD-related cACLD the HVPG may underestimate the portal pressure gradient.' }),
  combo({ id: 'mixpvt', short: 'Fibrosis + PVT', label: 'Fibrosis + portal vein thrombosis', sub: 'A clot in the trunk on top of a sinusoidal scar, which may be a light one.', group: 'Pre-hepatic',
    parts: ['sinus', 'pvt'], fixed: { alb: 4 }, grid: cross({ scar: STAGES, clot: [50, 70, 100] }),
    limits: 'Mild fibrosis is not required by the readings; it is allowed by them. The model cannot tell a little cirrhosis from none at this stiffness.' }),
  combo({ id: 'mixrhf', short: 'Fibrosis + heart', label: 'Fibrosis + right heart failure', sub: 'Fibrosis of any stage, F1 to F4, in a liver that is also congested by a failing right heart.', group: 'Cardiac',
    parts: ['sinus', 'rhf'], fixed: { alb: 4, tr: 0.6 }, grid: cross({ scar: STAGES, contr: [0.25, 0.5], vol: VOLS }),
    limits: 'The heart is a pump strength, a leak and the volume it holds; it cannot draw the waveform that tells failure from constriction.' }),
  combo({ id: 'mixconstr', short: 'Fibrosis + constriction', label: 'Fibrosis + constrictive pericarditis', sub: 'Fibrosis of any stage, F1 to F4, with a constricted right heart.', group: 'Cardiac',
    parts: ['sinus', 'constr'], fixed: { alb: 4 }, grid: cross({ scar: STAGES, peric: [0.7, 0.9, 1], vol: [800, 1100, 1400, 1700] }),
    limits: 'The model’s pericardium is one constriction number and the volume it holds. It cannot draw septal bounce or the filling pattern.' }),
  combo({ id: 'mixbcs', short: 'Fibrosis + hepatic veins', label: 'Fibrosis + hepatic vein block', sub: 'Budd–Chiari on a cirrhotic liver: thrombosed hepatic veins and a sinusoidal scar.', group: 'Post-hepatic',
    parts: ['sinus', 'bcs'], fixed: { alb: 4 }, grid: cross({ scar: [0.3, 0.4, 0.6, 0.9], veins: [1, 3], occl: [60, 100] }),
    limits: 'With the right hepatic vein shut the app prints no HVPG, so a wedged reading from this patient would not exist.' }),
  combo({ id: 'mixivc', short: 'Fibrosis + IVC web', label: 'Fibrosis + IVC web', sub: 'A narrowing of the IVC above the liver on top of a sinusoidal scar: the hepatic veins are high, the right atrium is not.', group: 'Post-hepatic',
    parts: ['sinus', 'ivcweb'], fixed: { alb: 4 }, grid: cross({ scar: STAGES, stenosis: [50, 70, 85] }),
    limits: 'Taken at three months with 800 mL of extra volume held; the model has one IVC narrowing and no image of it.' }),
  combo({ id: 'prepvt', short: 'Pre + PVT', label: 'Presinusoidal block + portal vein thrombosis', sub: 'Narrowed portal venules and a clot in the trunk, with no cirrhosis.', group: 'Pre-hepatic',
    parts: ['presin', 'pvt'], fixed: { sin: 1 }, grid: cross({ pre: [10, 20, 40, 70], clot: [60, 85, 100] }),
    limits: 'The model has one presinusoidal lesion; PSVD, schistosomiasis and other causes read the same here, and a clot of 65 to 75% still passes flow.' }),
];
export const FAMILIES = [...SINGLE, ...COMBOS];

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
  if (a.unit === 'stage') { const g = stageOf(v); return g === 'F4' && v >= 0.55 ? `F4 (${v})` : g; }
  return a.unit === '×' ? `×${v}` : a.unit === '%' ? `${v}%` : a.unit === 'mL' ? `${v} mL` : a.unit === 'g/dL' ? `${v} g/dL` : String(v);
}
