// Work backward (the patient menu's "From readings"): the lesions the search combines, how each one's severity becomes engine settings, and the
// families (every mix of one to three lesions) the shipped library and the worker's fit are made of.
//
// A lesion is a kind of disease, not a diagnosis: "Presinusoidal block" is narrowed portal venules and no cirrhosis, and the model has one such lesion
// for PSVD, schistosomiasis and the rest. Each has one severity `u`, from 0.1 (a hint) to 1 (the most the model draws), and a function that turns u
// into the exact settings the engine takes, so the search varies one number per lesion and the card can list every setting that follows from it.
// A family is a set of lesions at once: a heart lesion (failure or constriction) and a venous block (hepatic veins, IVC web or central veins) each
// come at most once, and cirrhosis (the slider), a presinusoidal block and a portal clot can join them, so up to three. The ranking (inverse.js) charges each
// lesion and each step away from healthy, so a second lesion has to earn its place.
//
// A virtual patient is { f: family id, p: { lesion: u } }, and patientOf() gives what the engine needs for it: a params patch, the days the disease
// clock runs, and the volume a failing or constricted heart keeps. No imports: the page, the worker and the generator all read it.

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const bound = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The cirrhosis slider as the app prints it: 0 to 100%. The model has no histological stage, so the search never names one. */
export const pctText = (v) => `${Math.round(v * 100)}%`;
/** A severity in a word. */
export const severityWord = (u) => (u < 0.25 ? 'mild' : u < 0.5 ? 'moderate' : u < 0.75 ? 'marked' : 'severe');
/** The severity bounds every lesion is searched over. */
export const U_MIN = 0.1;
export const U_MAX = 1;

// The hepatic veins clot in the order right, middle, left: `veins` of them, each `occl` shut.
const HV_IDS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];
const hvPatch = (veins, occl) => ({ thrombus: Object.fromEntries(HV_IDS.slice(0, veins).map((id) => [id, occl])) });
const preFib = (pre, sin) => ({ fibrosis: { R: { pre, sin }, L: { pre, sin } } });
// (`follows`: a setting that comes with the lesion's severity, not one the fit chose: the card lists it apart, as what follows from the slider.)
const kv = (label, text, follows = false) => (follows ? { label, text, follows } : { label, text });

/**
 * id, short (the chip's word), label, sub, group (the patient list's own group, scenario.js PRESETS), slot (a family holds one lesion per slot),
 * settings(u): the exact engine settings [{ label, text }], patch(u), days(u), volume(u); limits: what the model cannot say about it; ev: the guideline line.
 */
const LESIONS = [
  { id: 'sinus', short: 'Cirrhosis', label: 'Cirrhosis (sinusoidal block)', sub: 'The cirrhosis slider: scar that raises the resistance in the sinusoids.', group: 'Sinusoidal', slot: 'liver', step: 0.1,
    set: (u) => ({ scar: r2(u), alb: r1(4 - 1.4 * bound((u - 0.55) / 0.4, 0, 1)) }),
    patch: (u) => { const s = LES_SET.sinus(u); return { cirrhosis: s.scar, ...(s.alb < 4 ? { albumin: s.alb, diuretics: true } : {}) }; },
    settings: (u) => { const s = LES_SET.sinus(u); return [kv('Cirrhosis slider', pctText(s.scar)), kv('Albumin', `${s.alb} g/dL`, true)]; },
    days: (u) => (u > 0.8 ? 540 : 365), volume: () => 0,
    limits: 'The model has no histological stage and no cause: one slider, 0 to 100%, sets the sinusoidal resistance. What it makes is read as HVPG and LSM. Albumin falls with the slider from about 55%.',
    ev: 'HVPG 10 mmHg or more is clinically significant portal hypertension (Baveno VIII; AASLD 2024).',
    outside: 'Liver biopsy or elastography for the cause and stage; the model has neither.' },
  { id: 'presin', short: 'Presinusoidal', label: 'Presinusoidal block', sub: 'Narrowed portal venules and no cirrhosis. PSVD and schistosomiasis are one lesion to the model.', group: 'Presinusoidal', slot: 'pre', step: 0.1,
    set: (u) => ({ pre: r1(2 * 40 ** u) }),
    patch: (u) => preFib(LES_SET.presin(u).pre, 1),
    settings: (u) => [kv('Resistance before the sinusoids', `×${LES_SET.presin(u).pre}`)],
    days: () => 365, volume: () => 0,
    limits: 'The model has one presinusoidal lesion. PSVD, schistosomiasis and other causes read the same here; history and biopsy decide between them.',
    ev: 'Baveno VIII 8.40 to 8.44 (PSVD without cirrhosis): in PSVD an SSM above 40 kPa is a specific sign of portal hypertension (8.44).',
    outside: 'Liver biopsy for obliterative portal venopathy and to exclude cirrhosis; history and imaging for the cause.' },
  { id: 'pvt', short: 'Portal clot', label: 'Portal vein thrombosis', sub: 'Clot in the trunk, collaterals formed (a cavernoma).', group: 'Pre-hepatic', slot: 'trunk', step: 0.1,
    set: (u) => ({ clot: Math.round(40 + 50 * u) }),
    patch: (u) => ({ thrombus: { PV_TRUNK: LES_SET.pvt(u).clot / 100 } }),
    settings: (u) => [kv('Clot in the trunk', `${LES_SET.pvt(u).clot}%`)],
    days: () => 240, volume: () => 0,
    limits: 'A clot of 65 to 75% still passes flow, so “no flow” only holds for a nearly complete clot. The model has no cavernoma image to show.', ev: '',
    outside: 'Doppler or contrast CT or MR of the portal vein: a cavernoma is a picture the model does not make.' },
  { id: 'rhf', short: 'Right heart failure', label: 'Right heart failure with TR', sub: 'High right atrial pressure carried back to the liver.', group: 'Cardiac', slot: 'heart', step: 0.1,
    set: (u) => ({ contr: r2(0.7 - 0.5 * u), tr: r2(0.2 + 0.7 * u), vol: Math.round(200 + 1600 * u) }),
    patch: (u) => { const s = LES_SET.rhf(u); return { contractility: s.contr, tr: s.tr }; },
    settings: (u) => { const s = LES_SET.rhf(u); return [kv('Pump strength', `${s.contr} (1 is normal)`), kv('Tricuspid regurgitation', `${s.tr} (0 to 1)`)]; },
    days: () => 60, volume: (u) => LES_SET.rhf(u).vol,
    limits: 'The model’s heart is a pump strength, a leak and the volume it holds; it cannot draw the waveform that tells failure from constriction.', ev: '',
    outside: 'Echocardiography with the RA waveform; the model cannot draw it.' },
  { id: 'constr', short: 'Constriction', label: 'Constrictive pericarditis', sub: 'The pericardium holds the right heart; RA pressure is high.', group: 'Cardiac', slot: 'heart', step: 0.1,
    set: (u) => ({ peric: r2(0.5 + 0.5 * u), vol: Math.round(200 + 1600 * u) }),
    patch: (u) => ({ pericardial: LES_SET.constr(u).peric }),
    settings: (u) => { const s = LES_SET.constr(u); return [kv('Constriction', `${s.peric} (0 to 1)`)]; },
    days: () => 60, volume: (u) => LES_SET.constr(u).vol,
    limits: 'The model’s pericardium is one constriction number and the volume it holds. It cannot draw septal bounce or the filling pattern.', ev: '',
    outside: 'Echocardiography and cardiac MR or CT for septal bounce, filling pattern and a thick pericardium.' },
  { id: 'bcs', short: 'Hepatic veins', label: 'Hepatic vein outflow block', sub: 'Budd–Chiari: the hepatic veins are thrombosed.', group: 'Post-hepatic', slot: 'outflow', step: 0.1,
    set: (u) => (u < 0.3 ? { veins: 1, occl: 100 } : u < 0.5 ? { veins: 2, occl: 80 } : { veins: 3, occl: Math.round(50 + 70 * (u - 0.5)) }),
    patch: (u) => { const s = LES_SET.bcs(u); return hvPatch(s.veins, s.occl / 100); },
    settings: (u) => { const s = LES_SET.bcs(u); return [kv('Hepatic veins thrombosed', `${s.veins} of 3`), kv('How shut', `${s.occl}%`)]; },
    days: () => 60, volume: () => 0,
    limits: 'With the right hepatic vein shut the app prints no HVPG, so a wedged reading from this patient would not exist.', ev: '',
    outside: 'Doppler or MR venography of the hepatic veins and IVC.' },
  { id: 'ivcweb', short: 'IVC web', label: 'IVC web', sub: 'Suprahepatic IVC stenosis: the hepatic veins are high, the right atrium is not.', group: 'Post-hepatic', slot: 'outflow', step: 0.1,
    set: (u) => ({ stenosis: Math.round(30 + 55 * u) }),
    patch: (u) => ({ stenosis: { IVCS_RA: LES_SET.ivcweb(u).stenosis / 100 } }),
    settings: (u) => [kv('IVC narrowing', `${LES_SET.ivcweb(u).stenosis}%`)],
    days: () => 90, volume: () => 800,
    limits: 'Taken at three months with 800 mL of extra volume held; the model has one IVC narrowing and no image of it.', ev: '',
    outside: 'Cavography or MR venography of the IVC.' },
  { id: 'post', short: 'Central veins', label: 'Postsinusoidal block', sub: 'Resistance at the central veins (sinusoidal obstruction type).', group: 'Postsinusoidal', slot: 'outflow', step: 0.1,
    set: (u) => ({ post: r1(4 * 20 ** u) }),
    patch: (u) => { const v = LES_SET.post(u).post; return { fibrosis: { R: { post: v }, L: { post: v } } }; },
    settings: (u) => [kv('Resistance at the central veins', `×${LES_SET.post(u).post}`)],
    days: () => 21, volume: () => 0,
    limits: 'The model has one central-vein lesion, taken at three weeks. It does not separate drug, radiation or transplant causes.', ev: '',
    outside: 'History (drugs, radiation, transplant) and biopsy; the model reads one central-vein lesion.' },
];
const LES_SET = Object.fromEntries(LESIONS.map((l) => [l.id, l.set]));
export const LESION = Object.freeze(Object.fromEntries(LESIONS.map((l) => [l.id, l])));
export const LESION_IDS = LESIONS.map((l) => l.id);

/** Each lesion as a setting the search varies: its severity. `step` is the live fit's coarsest move. */
const AX = Object.fromEntries(LESIONS.map((l) => [l.id, { label: l.short, unit: 'severity', step: l.step, note: 'how far the model pushes it from healthy, 0.1 to 1' }]));

const merge = (a, b) => {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object' ? merge(out[k], b[k]) : b[k];
  return out;
};
const cross = (axes) => Object.entries(axes).reduce((acc, [k, vals]) => acc.flatMap((o) => vals.map((v) => ({ ...o, [k]: v }))), [{}]);

// The levels the shipped library tries for a family of one, two or three lesions; the worker's fit moves off them continuously.
const LEVELS = { 1: [0.15, 0.3, 0.4, 0.55, 0.75, 1], 2: [0.25, 0.55, 0.9], 3: [0.3, 0.8] };

/** Every mix of one to three lesions with no two in one slot (one heart lesion, one venous block). */
function familiesOf() {
  const out = [];
  const pick = (from, chosen) => {
    if (chosen.length) out.push(chosen);
    if (chosen.length === 3) return;
    for (let i = from; i < LESIONS.length; i++) {
      const l = LESIONS[i];
      if (chosen.some((c) => c.slot === l.slot)) continue;
      pick(i + 1, [...chosen, l]);
    }
  };
  pick(0, []);
  return out.map((parts) => {
    const axes = parts.map((l) => l.id), n = parts.length;
    return {
      id: axes.join('+'), short: parts.map((l) => l.short).join(' + '), label: parts.map((l) => l.label).join(' + '),
      sub: n === 1 ? parts[0].sub : parts.map((l) => l.sub).join(' '), group: parts[0].group, free: n, axes, parts: axes, lesions: n,
      grid: cross(Object.fromEntries(axes.map((k) => [k, LEVELS[n]]))),
      patch: (p) => parts.reduce((acc, l) => merge(acc, l.patch(p[l.id])), {}),
      days: (p) => Math.max(...parts.map((l) => l.days(p[l.id]))), volume: (p) => Math.max(...parts.map((l) => l.volume(p[l.id]))),
      settings: (p) => {
        const vol = Math.max(...parts.map((l) => l.volume(p[l.id])));   // (the one volume the patient holds: the larger of the lesions', never one line for each)
        return [...parts.flatMap((l) => l.settings(p[l.id]).map((s) => ({ ...s, lesion: l.id }))), ...(vol > 0 ? [{ ...kv('Extra volume held', `${vol} mL`, true), lesion: parts.find((l) => l.volume(p[l.id]) === vol).id }] : [])];
      },
      limits: [...new Set(parts.map((l) => l.limits))].join(' '), ev: [...new Set(parts.map((l) => l.ev).filter(Boolean))].join(' '),
      outside: [...new Set(parts.map((l) => l.outside))].join(' '),
    };
  });
}

/** No lesion at all: the healthy patient, the answer for readings in the normal range (it costs nothing, and every other family costs for being there). */
const NONE = { id: 'none', short: 'No lesion', label: 'No lesion', sub: 'Every setting healthy: the readings are in the model’s normal range.', group: 'Healthy', free: 0, axes: [], parts: [], lesions: 0, grid: [{}],
  patch: () => ({}), days: () => 0, volume: () => 0, settings: () => [], limits: 'The model’s healthy patient is one set of readings; normal ranges in people are wider.', ev: '', outside: 'Nothing further is needed if the readings are normal.' };
export const FAMILIES = [NONE, ...familiesOf()];
export const AXES = AX;
export const FAMILY = Object.freeze(Object.fromEntries(FAMILIES.map((f) => [f.id, f])));
export const FAMILY_IDS = FAMILIES.map((f) => f.id);

/** The span every severity is searched over (the same for every lesion). A fit range as wide as this is not set by the readings. */
export const spanOf = (f, axis) => (FAMILY[f] && FAMILY[f].axes.includes(axis) ? [U_MIN, U_MAX] : [0, 0]);

/** What the engine needs for family `f` at severities `p`: a params patch, the disease days and the volume held. */
export function patientOf(f, p) {
  const fam = FAMILY[f];
  return { patch: fam.patch(p), days: fam.days(p), volume: fam.volume(p) };
}

/** The exact engine settings of family `f` at severities `p`: [{ lesion, label, text }]. */
export const settingsOf = (f, p) => FAMILY[f].settings(p);

/** The severities of a family as the library keys them: a stable string, for matching a fitted point to a library one. */
export const keyOf = (f, p) => f + ':' + FAMILY[f].axes.map((k) => r3(p[k])).join(',');

/** A severity as people read it: the cirrhosis slider's percent, a word for the rest. */
export function settingText(axis, v) {
  if (axis === 'sinus') return pctText(LES_SET.sinus(v).scar);
  return severityWord(v);
}
