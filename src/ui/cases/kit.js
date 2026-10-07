// Shared pieces for the case content: order catalogue, and small helpers. Pure data and functions,
// no DOM, so the content is unit-testable (tests/cases.test.js).

/** Order catalogue: clinical names, grouped as the Orders tab shows them. `hidden` orders are only
 *  run by a decision option, never listed. The runtime (cases.js) supplies what each one does. */
export const ORDER_META = {
  labs: { g: 'assess', label: 'Blood tests' },
  'abd-us': { g: 'assess', label: 'Ultrasound of the abdomen' },
  doppler: { g: 'assess', label: 'Doppler of the liver vessels' },
  ct: { g: 'assess', label: 'CT scan with contrast' },
  egd: { g: 'assess', label: 'Upper endoscopy' },
  fibroscan: { g: 'assess', label: 'Liver stiffness scan (FibroScan)' },
  echo: { g: 'assess', label: 'Echocardiogram' },
  hvpg: { g: 'assess', label: 'Hepatic vein pressure study (HVPG)' },
  'tap-dx': { g: 'assess', label: 'Diagnostic tap of the ascites' },
  'clot-screen': { g: 'assess', label: 'Clotting disorder and JAK2 tests' },
  ecg: { g: 'assess', label: 'ECG' },
  crystalloid: { g: 'treat', label: '1 L IV fluid' },
  prbc: { g: 'treat', label: 'Transfuse 1 unit of red cells' },
  vaso: { g: 'treat', label: 'Terlipressin infusion' },
  ceftriaxone: { g: 'treat', label: 'IV ceftriaxone' },
  carvedilol: { g: 'treat', label: 'Carvedilol', toggle: true },
  diuretics: { g: 'treat', label: 'Spironolactone and furosemide', toggle: true },
  anticoag: { g: 'treat', label: 'Anticoagulation', toggle: true },
  'lvp-alb': { g: 'treat', label: 'Large tap (5 L) with albumin' },
  'lvp-noalb': { g: 'treat', label: 'Large tap (5 L) without albumin', hidden: true },
  evl: { g: 'procedure', label: 'Band ligation at endoscopy' },
  balloon: { g: 'procedure', label: 'Balloon tamponade', toggle: true },
  tips8: { g: 'procedure', label: 'TIPS with an 8 mm stent' },
  tips10: { g: 'procedure', label: 'TIPS with a 10 mm stent' },
  brto: { g: 'procedure', label: 'BRTO (close the gastrorenal shunt)' },
  'tips-reduce': { g: 'procedure', label: 'Reduce the TIPS shunt', hidden: true },
};
export const GROUPS = [['assess', 'Assess'], ['treat', 'Treat'], ['procedure', 'Procedure and refer']];

/** Readouts a clinician cannot know at the bedside: hidden until a study measures them. */
export const DX_HIDDEN = ['trueHVPG', 'pv', 'ra', 'iap', 'hb', 'bloodLoss'];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** Cuff pressure from the model's mean pressure: the pulse pressure narrows as shock deepens. */
export function bpOf(m) {
  const pp = clamp(46 - 6 * (m.blood?.shock || 0), 24, 46);
  return [Math.round(m.map + (2 / 3) * pp), Math.round(m.map - pp / 3)];
}
/** Varix wall tension as a band, never a percentage. */
export const tension = (ratio) => (ratio < 0.6 ? 'low' : ratio < 1 ? 'moderate' : 'high');
/** Abdomen description from the model's ascites volume (mL). */
export const abdomen = (mL) => (mL < 300 ? 'flat, no fluid' : mL < 1500 ? 'mild fullness' : mL < 4000 ? 'distended' : 'tense');

/** Chart numbers read from the model, so what the chart says always matches what the figure shows. */
export const plt = (m) => Math.round(m.spleen.platelets / 2) * 2;
export const pltRow = (m) => { const n = plt(m); return ['Platelets', `${n} ×10⁹/L`, n < 50 ? 'bad' : n < 150 ? 'warn' : '']; };
export const spleenCm = (m) => Math.round(m.spleen.length);
export const lsm = (m) => Math.round(m.lsm);
export const hbRow = (m) => { const h = m.blood?.hb ?? 14; return ['Hemoglobin', `${h.toFixed(1)} g/dL`, h < 8 ? 'bad' : h < 12 ? 'warn' : '']; };
/** Endoscopy wording for the esophageal varices the model has. */
export function esoText(m) {
  const g = m.varix.grade.label;
  if (g === 'None') return 'No esophageal varices';
  if (g === 'Small') return 'Small esophageal varices';
  return `Large esophageal varices${m.varix.redWale ? ' with red wale signs' : ''}`;
}
/** Ascites wording from the volume (mL), as an examiner would put it. */
export const ascitesText = (mL) => (mL < 300 ? 'No ascites' : mL < 1500 ? 'Small ascites' : mL < 4000 ? 'Moderate ascites' : 'Tense ascites');

/** Fill model placeholders in authored text: {plt} platelets, {spl} spleen cm, {lsm} liver stiffness kPa,
 *  {eso} esophageal varices, {alb} albumin. Works on a string, a row array or a list of either. */
export function fill(x, c) {
  if (Array.isArray(x)) return x.map((y) => fill(y, c));
  if (typeof x !== 'string') return x;
  return x.replace(/\{plt\}/g, plt(c.m)).replace(/\{spl\}/g, spleenCm(c.m)).replace(/\{lsm\}/g, lsm(c.m)).replace(/\{alb\}/g, c.params.albumin.toFixed(1))
    .replace(/\{eso\}/g, esoText(c.m)).replace(/\{eso-\}/g, esoText(c.m).toLowerCase());
}

export const ZERO = 0;
