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
  { id: 'sinus', short: 'Cirrhosis', label: 'Cirrhosis (sinusoidal block)', sub: 'The cirrhosis slider: fibrosis that raises sinusoidal resistance.', group: 'Sinusoidal', slot: 'liver', step: 0.1,
    set: (u) => ({ scar: r2(u), alb: r1(4 - 1.4 * bound((u - 0.55) / 0.4, 0, 1)) }),
    patch: (u) => { const s = LES_SET.sinus(u); return { cirrhosis: s.scar, ...(s.alb < 4 ? { albumin: s.alb, diuretics: true } : {}) }; },
    settings: (u) => { const s = LES_SET.sinus(u); return [kv('Cirrhosis slider', pctText(s.scar)), kv('Albumin', `${s.alb} g/dL`, true)]; },
    days: (u) => (u > 0.8 ? 540 : 365), volume: () => 0,
    limits: 'The model has no histological stage and no etiology: one slider, 0 to 100%, sets the sinusoidal resistance, and the HVPG and LSM follow from it. Albumin falls with the slider from about 55%.',
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
  { id: 'pvt', short: 'Portal vein thrombosis', label: 'Portal vein thrombosis', sub: 'Thrombus in the main portal vein, with collaterals (cavernoma).', group: 'Pre-hepatic', slot: 'trunk', step: 0.1,
    set: (u) => ({ clot: Math.round(40 + 50 * u) }),
    patch: (u) => ({ thrombus: { PV_TRUNK: LES_SET.pvt(u).clot / 100 } }),
    settings: (u) => [kv('Main portal vein occlusion', `${LES_SET.pvt(u).clot}%`)],
    days: () => 240, volume: () => 0,
    limits: 'A thrombus occluding 65 to 75% of the lumen still allows flow; absent flow needs near-complete occlusion. The model does not draw a cavernoma.', ev: '',
    outside: 'Doppler or contrast CT or MR of the portal vein, which shows a cavernoma; the model does not draw one.' },
  { id: 'rhf', short: 'Right heart failure', label: 'Right heart failure with TR', sub: 'High right atrial pressure transmitted back to the liver.', group: 'Cardiac', slot: 'heart', step: 0.1,
    set: (u) => ({ contr: r2(0.7 - 0.5 * u), tr: r2(0.2 + 0.7 * u), vol: Math.round(200 + 1600 * u) }),
    patch: (u) => { const s = LES_SET.rhf(u); return { contractility: s.contr, tr: s.tr }; },
    settings: (u) => { const s = LES_SET.rhf(u); return [kv('RV contractility', `${s.contr} (1 is normal)`), kv('Tricuspid regurgitation', `${s.tr} (0 to 1)`)]; },
    days: () => 60, volume: (u) => LES_SET.rhf(u).vol,
    limits: 'The model’s heart is RV contractility, tricuspid regurgitation and the volume it holds; it cannot draw the RA waveform that separates heart failure from constriction.', ev: '',
    outside: 'Echocardiography with the RA waveform, which the model cannot draw.' },
  { id: 'constr', short: 'Constrictive pericarditis', label: 'Constrictive pericarditis', sub: 'Pericardial constriction raises the RA pressure.', group: 'Cardiac', slot: 'heart', step: 0.1,
    set: (u) => ({ peric: r2(0.5 + 0.5 * u), vol: Math.round(200 + 1600 * u) }),
    patch: (u) => ({ pericardial: LES_SET.constr(u).peric }),
    settings: (u) => { const s = LES_SET.constr(u); return [kv('Constriction', `${s.peric} (0 to 1)`)]; },
    days: () => 60, volume: (u) => LES_SET.constr(u).vol,
    limits: 'The model’s pericardium is one constriction value and the volume it holds. It cannot show septal bounce or the filling pattern.', ev: '',
    outside: 'Echocardiography and cardiac MR or CT for septal bounce, filling pattern and a thick pericardium.' },
  { id: 'bcs', short: 'Budd–Chiari syndrome', label: 'Hepatic vein outflow block', sub: 'Budd–Chiari: the hepatic veins are thrombosed.', group: 'Post-hepatic', slot: 'outflow', step: 0.1,
    set: (u) => (u < 0.3 ? { veins: 1, occl: 100 } : u < 0.5 ? { veins: 2, occl: 80 } : { veins: 3, occl: Math.round(50 + 70 * (u - 0.5)) }),
    patch: (u) => { const s = LES_SET.bcs(u); return hvPatch(s.veins, s.occl / 100); },
    settings: (u) => { const s = LES_SET.bcs(u); return [kv('Hepatic veins thrombosed', `${s.veins} of 3`), kv('Occlusion', `${s.occl}%`)]; },
    days: () => 60, volume: () => 0,
    limits: 'With the right hepatic vein occluded it cannot be wedged, so the app gives no HVPG for this patient.', ev: '',
    outside: 'Doppler or MR venography of the hepatic veins and IVC.' },
  { id: 'ivcweb', short: 'IVC web', label: 'IVC web', sub: 'Suprahepatic IVC stenosis: the hepatic veins are high, the right atrium is not.', group: 'Post-hepatic', slot: 'outflow', step: 0.1,
    set: (u) => ({ stenosis: Math.round(30 + 55 * u) }),
    patch: (u) => ({ stenosis: { IVCS_RA: LES_SET.ivcweb(u).stenosis / 100 } }),
    settings: (u) => [kv('IVC stenosis', `${LES_SET.ivcweb(u).stenosis}%`)],
    days: () => 90, volume: () => 800,
    limits: 'Readings at three months with 800 mL of volume expansion; the model has one IVC stenosis and does not draw it.', ev: '',
    outside: 'Cavography or MR venography of the IVC.' },
  { id: 'post', short: 'Sinusoidal obstruction syndrome', label: 'Postsinusoidal block', sub: 'Resistance at the central veins (sinusoidal obstruction type).', group: 'Postsinusoidal', slot: 'outflow', step: 0.1,
    set: (u) => ({ post: r1(4 * 20 ** u) }),
    patch: (u) => { const v = LES_SET.post(u).post; return { fibrosis: { R: { post: v }, L: { post: v } } }; },
    settings: (u) => [kv('Resistance at the central veins', `×${LES_SET.post(u).post}`)],
    days: () => 21, volume: () => 0,
    limits: 'The model has one central-vein lesion, with readings at three weeks. It does not separate drug, radiation or transplant causes.', ev: '',
    outside: 'History (drugs, radiation, transplant) and biopsy; the model has one central-vein lesion.' },
];
const LES_SET = Object.fromEntries(LESIONS.map((l) => [l.id, l.set]));
export const LESION = Object.freeze(Object.fromEntries(LESIONS.map((l) => [l.id, l])));
export const LESION_IDS = LESIONS.map((l) => l.id);

/**
 * The model's other sliders a lesion carries with it, which the search may set on its own when the readings call for it (review of 15 Nov, Mohammad's
 * "so many sliders": the heart's pump strength, tricuspid leak and the volume it holds, the albumin, the splanchnic tone). Each has a default that follows
 * from the lesions' severity (what the lesion's own line sets), so a point with no entry for it is the lesion as before; an entry in `p` is the search's own
 * choice, and the ranking charges it for how far it sits from the default (inverse.js costOf), so a side setting is used only when it earns its place.
 * `lo` to `hi` is the slider's own range, `step` the live fit's probe, `round` what the value is kept to.
 */
const SIDES = [
  { id: 'vol', label: 'Volume expansion', lo: 0, hi: 2400, probe: 200, round: 10, applies: (a) => a.some((k) => k === 'rhf' || k === 'constr' || k === 'ivcweb'),
    def: (a, p) => { let m = 0; for (const k of a) m = Math.max(m, LESION_VOLUME[k](p[k])); return m; }, text: (v) => `${Math.round(v)} mL` },
  { id: 'contr', label: 'RV contractility', lo: 0.15, hi: 1.2, probe: 0.1, round: 0.01, applies: (a) => a.includes('rhf'), def: (a, p) => LES_SET.rhf(p.rhf).contr, text: (v) => `${v} (1 is normal)` },
  { id: 'tr', label: 'Tricuspid regurgitation', lo: 0, hi: 1, probe: 0.15, round: 0.01, applies: (a) => a.includes('rhf'), def: (a, p) => LES_SET.rhf(p.rhf).tr, text: (v) => `${v} (0 to 1)` },
  { id: 'alb', label: 'Albumin', lo: 1.5, hi: 4.5, probe: 0.4, round: 0.1, applies: (a) => a.includes('sinus'), def: (a, p) => LES_SET.sinus(p.sinus).alb, text: (v) => `${v} g/dL` },
  { id: 'tone', label: 'Splanchnic arteriolar tone', lo: 0.5, hi: 2, probe: 0.2, round: 0.01, applies: (a) => a.length > 0, def: () => 1, text: (v) => `${v} (1 is normal)` },
];
export const SIDE = Object.freeze(Object.fromEntries(SIDES.map((x) => [x.id, x])));
export const SIDE_IDS = SIDES.map((x) => x.id);
const LESION_VOLUME = Object.fromEntries(LESIONS.map((l) => [l.id, l.volume]));
/** The side settings family axes `axes` has, with the value each takes when the search leaves it alone (a function of the lesions' severities in `p`). */
export const sidesOf = (axes) => SIDES.filter((x) => x.applies(axes));
export const sideDefault = (axes, id, p) => SIDE[id].def(axes, p);
/** `v` for side `id` as the model keeps it: inside the slider's range, to its resolution. */
export const sideClamp = (id, v) => { const x = SIDE[id]; return Math.round(Math.min(x.hi, Math.max(x.lo, v)) / x.round) * x.round; };
const sideOverlay = (p) => ({
  ...('contr' in p ? { contractility: p.contr } : {}), ...('tr' in p ? { tr: p.tr } : {}), ...('tone' in p ? { splanchnicTone: p.tone } : {}),
  ...('alb' in p ? { albumin: p.alb, diuretics: p.alb < 4 } : {}),
});

/** Each lesion as a setting the search varies: its severity. `step` is the live fit's coarsest move. */
const AX = Object.fromEntries(LESIONS.map((l) => [l.id, { label: l.short, unit: 'severity', step: l.step, note: 'how far the model pushes it from healthy, 0.1 to 1' }]));

const merge = (a, b) => {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object' ? merge(out[k], b[k]) : b[k];
  return out;
};
const cross = (axes) => Object.entries(axes).reduce((acc, [k, vals]) => acc.flatMap((o) => vals.map((v) => ({ ...o, [k]: v }))), [{}]);

// The levels the shipped library tries for a family of one, two or three lesions; the worker's fit moves off them continuously.
const LEVELS = { 1: [0.15, 0.3, 0.4, 0.55, 0.65, 0.75, 1], 2: [0.25, 0.4, 0.6, 0.9], 3: [0.3, 0.8] };

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
      patch: (p) => merge(parts.reduce((acc, l) => merge(acc, l.patch(p[l.id])), {}), sideOverlay(p)),
      days: (p) => Math.max(...parts.map((l) => l.days(p[l.id]))), volume: (p) => ('vol' in p ? p.vol : Math.max(...parts.map((l) => l.volume(p[l.id])))),
      sides: sidesOf(axes).map((x) => x.id),
      settings: (p) => {
        const vol = 'vol' in p ? p.vol : Math.max(...parts.map((l) => l.volume(p[l.id])));   // (the one volume the patient holds: the larger of the lesions', never one line for each)
        const rows = [...parts.flatMap((l) => l.settings(p[l.id]).map((s) => ({ ...s, lesion: l.id }))), ...(vol > 0 ? [{ ...kv('Volume expansion', SIDE.vol.text(vol), !('vol' in p)), lesion: parts.find((l) => l.volume(p[l.id]) === Math.max(...parts.map((m) => m.volume(p[m.id])))).id }] : [])];
        // A side setting the search chose replaces the lesion's own line for it (or joins the list when the lesion has none), and is listed as chosen, not as what follows.
        for (const x of SIDES) {
          if (x.id === 'vol' || !(x.id in p)) continue;
          const row = { ...kv(x.label, x.text(p[x.id])), lesion: x.id === 'tone' ? axes[0] : x.id === 'alb' ? 'sinus' : 'rhf' }, at = rows.findIndex((r) => r.label === x.label);
          if (at >= 0) rows[at] = row; else rows.push(row);
        }
        return rows;
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
export const keyOf = (f, p) => f + ':' + FAMILY[f].axes.map((k) => r3(p[k])).join(',') + SIDES.filter((x) => x.id in p).map((x) => `|${x.id}=${r3(p[x.id])}`).join('');

/** A severity as people read it: the cirrhosis slider's percent, a word for the rest. */
export function settingText(axis, v) {
  if (axis === 'sinus') return pctText(LES_SET.sinus(v).scar);
  return severityWord(v);
}
