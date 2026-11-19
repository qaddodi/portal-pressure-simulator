// Clinical readouts derived from engine state (blueprint §9.1).

import { PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES, EDGES } from './topology.js';
import { clamp } from '../core/physiology.js';
import { tenthGap } from '../core/gap.js';
import { ssmOf } from './ssm-cuts.js';
import { bedsideMean } from './bedside-mean.js';

const STENTS = new Set(['TIPS', 'DIPS']);   // the stents from the portal side: their flow is part arterial (see computeMetrics)

// The grades judge the number every readout prints (a diameter to 0.1 mm, a volume to 0.1 L), so "5.0 mm" is never Small
// and "5.0 L" never Grade 2.
// (tenths(v) is Math.round(+v.toFixed(1) * 10) without the string: the integer n for which n / 10 is nearest v, a tie going away from
// zero, decided on the exact value of the double as toFixed decides it. Checked against toFixed over millions of values, ties included.)
function tenths(v) {
  const a = v < 0 ? -v : v + 0;
  const n = a * 10, f = Math.floor(n), d = n - f;
  let k;
  if (d < 0.499999 || d > 0.500001) k = d < 0.5 ? f : f + 1;
  else {
    // (A tie to the double's precision: 20a against 2f + 1, exactly, by two-sum.)
    const x = 16 * a, y = 4 * a, p = x + y, bb = p - x, e = (x - (p - bb)) + (y - bb), q = p - (2 * f + 1);
    k = q > 0 || (q === 0 && e >= 0) ? f + 1 : f;
  }
  return v < 0 ? -k : k;
}
const tenth = (v) => tenths(v) / 10;
// A varix is graded by its size alone: None under 2.5 mm, Small under 5 mm, Large from 5 mm. There are no F-codes: they
// describe shape and red signs as well as size, and the model reads size only.
export const VARIX_NONE_MM = 2.5;
export const VARIX_LARGE_MM = 5;
// (The grades are three shared, frozen records: nothing writes to one, and each reader copies what it keeps.)
const VARIX_NONE = Object.freeze({ label: 'None' }), VARIX_SMALL = Object.freeze({ label: 'Small' }), VARIX_LARGE = Object.freeze({ label: 'Large' });
export function varixGrade(d0) {
  const d = Number.isFinite(d0) ? tenth(d0) : d0;
  if (d < VARIX_NONE_MM) return VARIX_NONE;
  if (d < VARIX_LARGE_MM) return VARIX_SMALL;
  return VARIX_LARGE;
}
// Whether there are varices to look at: the diameter reaches the "none" cut-off, or banded columns are still on the wall
// (esophageal only; bands shrink a varix under the cut-off for weeks). The one answer every view reads (store.varicesPresent).
const varixPresent = (d, banded) => d >= VARIX_NONE_MM || banded;

const ASC_0 = Object.freeze({ grade: 0, label: 'None' }), ASC_1 = Object.freeze({ grade: 1, label: 'Grade 1 (ultrasound only)' });
const ASC_2 = Object.freeze({ grade: 2, label: 'Grade 2 (moderate)' }), ASC_3 = Object.freeze({ grade: 3, label: 'Grade 3 (tense)' });
// (The grades' volume cut-offs in mL, one list: Grade 1 from 150, Grade 2 from 1,500, Grade 3 from 5,000; the Work-backward search reads the same ones.)
export const ASCITES_CUTS = Object.freeze([150, 1500, 5000]);
export function ascitesGrade(V0) {
  const V = Number.isFinite(V0) ? tenths(V0 / 1000) * 100 : V0;
  if (V < ASCITES_CUTS[0]) return ASC_0;
  if (V < ASCITES_CUTS[1]) return ASC_1;
  if (V < ASCITES_CUTS[2]) return ASC_2;
  return ASC_3;
}

// (The catheter's vein → its hepatic vein node and its wedged node, read for every frame: no object or string built to look them up.)
const HV_NODE = { R: 'RHV', M: 'MHV', L: 'LHV' }, WEDGE_NODE = { R: 'W_R', M: 'W_M', L: 'W_L' };
const qf = (eng, id) => (eng.Qf ? eng.Qf[eng.ei[id]] : eng.Q[eng.ei[id]]);

// Liver stiffness (kPa): the larger of what the portal gradient would give and what the scarring itself gives, plus the congestion of the hepatic veins.
// The stiffness follows the scar (the cirrhosis slider) and does not fall when a clot in the portal vein lowers the gradient (Work-backward review E5, 15 Nov 2026:
// a cirrhotic liver with a portal clot kept the gradient's stiffness and read 17 kPa); for a liver with only sinusoidal scar the two agree up to 60 %, and
// beyond it the scar goes on stiffening the liver to decompensation (the gradient formula alone stopped at 30 kPa). FIB_LSM: slider → kPa.
const FIB_LSM = [[0, 5], [0.1, 5], [0.2, 5.9], [0.3, 8.4], [0.4, 12.4], [0.5, 18.3], [0.6, 23.7], [0.8, 36], [1, 48]];
const fibLsm = (c) => {
  if (!(c > 0)) return 5;
  for (let i = 1; i < FIB_LSM.length; i++) if (c <= FIB_LSM[i][0]) { const [x0, y0] = FIB_LSM[i - 1], [x1, y1] = FIB_LSM[i]; return y0 + ((y1 - y0) * (c - x0)) / (x1 - x0); }
  return FIB_LSM[FIB_LSM.length - 1][1];
};
const lsmOf = (hv, scar) => Math.max(5 + 2.2 * Math.max(0, Math.min(hv.hvpg, 12) - 3) + 0.8 * Math.max(0, hv.hvpg - 12), fibLsm(scar)) + 2 * Math.max(0, hv.fhvp - 6);

// (The tick's record: computeMetrics(eng, out) writes into the `out` it is given, and the records inside it, in place, so a frame makes none
// of them; the frame is posted (cloned) before the next tick writes it again. With no `out` a call makes a record of its own, for the readers
// that keep what they ask for: tests, the compare and explain requests.)
const copyInto = (o, src) => { for (const k in src) o[k] = src[k]; return o; };
// (The records a field switches between, kept beside the metrics record that holds one of them: not fields of it, so the posted frame carries only the fields.)
const spares = new WeakMap();
const spareOf = (r) => spares.get(r) || (spares.set(r, { meas: {}, gOn: {}, gOff: {}, bleed: {} }), spares.get(r));   // alloc-rare: made once for a record
// (A reading through the dead band at its printed precision, engine holdShown; an engine without it, a stand-in in a test, reads as it is.)
const hold = (eng, k, v, step) => (eng.holdShown ? eng.holdShown(k, v, step) : v);
const part = (r, k) => r[k] || (r[k] = {});   // alloc-rare: a record inside the metrics, made when the metrics record is (once for the tick's, per call for a reader that gave none)
export function computeMetrics(eng, out = null) {
  const P = eng.Pf || eng.P, ni = eng.ni, ei = eng.ei, p = eng.params;
  if (!eng.baseHepFlow) eng.baseHepFlow = eng.refQ ? eng.refQ[ei.SIN_RR] + eng.refQ[ei.SIN_LL] : 25;

  // (The wedged and free pressures through the dead band at one decimal, engine holdShown: a wedged pressure is a weighted mean of two
  // sinusoid nodes, so it can rest on a rounding boundary even when each node does not, and the HVPG is their difference as printed.)
  const hv = eng.hvpgTrue(P);   // (a record of its own each call, which this one writes in place)
  hv.whvp = hold(eng, 'whvp', hv.whvp); hv.fhvp = hold(eng, 'fhvp', hv.fhvp); hv.hvpg = hv.whvp - hv.fhvp;
  let splIn = 0;
  for (let i = 0; i < SPLANCHNIC_ARTERIES.length; i++) splIn += qf(eng, SPLANCHNIC_ARTERIES[i]);
  const apIn = Math.max(0, qf(eng, 'AP_R')) + Math.max(0, qf(eng, 'AP_L'));
  let shunted = 0;
  const r = out || {};   // alloc-rare: a reader that gives no record to write into gets one of its own; the tick always gives its kept record
  const collateralFlows = part(r, 'collateralFlows');
  const portalIn = Math.max(0, qf(eng, 'PRE_R')) + Math.max(0, qf(eng, 'PRE_L'));
  let stentQ = 0;
  for (const id of PORTOSYSTEMIC_EDGES) {
    const v = qf(eng, id);
    if (STENTS.has(id)) stentQ += Math.max(0, v); else shunted += Math.max(0, v);
    collateralFlows[id] = v;
  }
  // A stent (TIPS or DIPS) also drains arterial blood that recirculates through the sinusoids and back out by the
  // portal branches, so only the portal-trunk blood that no longer reaches the sinusoids counts as shunted portal blood.
  shunted += clamp(Math.max(0, qf(eng, 'PV_TRUNK')) - portalIn - Math.max(0, qf(eng, 'C3')), 0, stentQ);
  // Custom shunts the learner has made carry portal blood to systemic veins as well (one between two portal veins keeps its blood in the portal system).
  for (const e of EDGES) if (e.shunt === 'custom' && !e.portal && eng.params.customShunts?.[e.id]) shunted += Math.max(0, qf(eng, e.id));
  for (const e of EDGES) if (e.kind === 'collateral') collateralFlows[e.id] = qf(eng, e.id);
  const shuntFraction = clamp(shunted / Math.max(1e-6, splIn + apIn), 0, 1);

  const hepFlow = qf(eng, 'SIN_RR') + qf(eng, 'SIN_LL');
  const arterialIn = qf(eng, 'A_HR') + qf(eng, 'A_HL');

  const extS = eng.extf || eng.ext;   // (the shown means of the outside pressure go with the shown pressures: eng.varix)
  const varE = eng.varix('VAR', P, 0, undefined, extS), varG = eng.varix('GV', P, 0, undefined, extS);
  const noGRS = eng.params.spontaneous?.C5 === false;   // no gastrorenal shunt, no fundal varices
  const st = eng.starling(true);   // (the shown means: the lymph and its protein hold still at rest)
  const asc = ascitesGrade(eng.slow.ascites);
  const co = (eng.COf ?? 83.3) * 0.06;
  const map = eng.MAPf;
  const ra = P[ni.RA];
  const bv = eng.bloodVolume();
  // Share of the patient's own volume lost (ATLS class), counting what was drawn, not what was given back since.
  const b = eng.blood, ref = b.ref || 5000;
  // (The plasma the tissues refill over the next day does count: by then the circulation is full again, and the shock is over.)
  const lossPct = clamp((ref + b.infused - (b.inf0 || 0) - bv) / ref * 100, -50, 100);
  const shock = eng.blood.lost > 0 ? (lossPct >= 40 ? 4 : lossPct >= 30 ? 3 : lossPct >= 15 ? 2 : 1) : 0;
  const hct = eng.hct();
  // The encephalopathy index (0 to 1, a model index and not a clinical score): how much of the gut's blood misses the liver's work, from the two
  // things that say so: the share of the portal blood that skips the liver (shunt) and how little the liver itself is perfused (the sinusoidal flow
  // against its own normal). The share saturates near 94% after any TIPS from 6 to 12 mm, the perfusion does not, so the stent widths read apart.
  // Cirrhosis weighs both (a scarred liver clears less of what still reaches it); a normal liver keeps 0.8 of it (acute PVT, 0.34).
  const heIdx = (0.5 * shuntFraction + 0.5 * clamp(1 - hepFlow / eng.baseHepFlow, 0, 1)) * (0.8 + 0.2 * clamp(p.cirrhosis, 0, 1));

  const cath = p.catheter;
  let measured = null;
  if (cath.vein) {
    measured = spareOf(r).meas;
    measured.vein = cath.vein; measured.fhvp = hold(eng, 'mfhvp', P[ni[HV_NODE[cath.vein]]]); measured.wedged = cath.wedged; measured.whvp = cath.wedged ? hold(eng, 'mwhvp', P[ni[WEDGE_NODE[cath.vein]]]) : null;
  }
  const vx = part(r, 'varix'), gx = noGRS ? spareOf(r).gOff : spareOf(r).gOn;
  copyInto(vx, varE); vx.d = 2 * varE.r; vx.air = eng.varixAir('VAR', P, 21, extS); vx.grade = varixGrade(eng.varixGraded('VAR', 2 * varE.r)); vx.present = varixPresent(2 * varE.r, eng.bands > 0); vx.redWale = varE.ratio > 0.7; vx.closed = eng.varixObliterated('VAR'); vx.ratioMean = eng.vitM?.[4] ?? varE.ratio;
  copyInto(gx, varG);
  gx.closed = !noGRS && eng.varixObliterated('GV');   // (obliterated: BRTO or coils closed it, so its card reads no pressure)
  if (noGRS) { gx.d = 0; gx.grade = varixGrade(0); gx.present = false; gx.redWale = false; }
  else { gx.d = 2 * varG.r; gx.grade = varixGrade(eng.varixGraded('GV', 2 * varG.r)); gx.present = varixPresent(2 * varG.r, false); gx.redWale = varG.ratio > 0.7; }
  const ax = part(r, 'ascites');
  ax.volume = eng.slow.ascites; ax.ratePerDay = st.net * 1440; ax.iap = eng.iapf ?? eng.iap ?? 5; ax.grade = asc.grade; ax.label = asc.label;
  ax.highProtein = st.highProtein; ax.totalProtein = st.ascTP; ax.albumin = st.ascAlb; ax.saag = st.saag; ax.lymphProt = st.prot.lymphProt; ax.lymphSigma = st.prot.sigma;
  ax.hepLymph = st.hep; ax.splLymph = st.spl; ax.lymphCap = eng.slow.lymphCap; ax.lymphOver = st.excess;   // (formed, liver and gut; what the lymphatics can carry; what is made beyond it)
  const sp = part(r, 'spleen');
  if (eng.params.splenicRx === 2) { sp.length = 0; sp.platelets = 380; } else { sp.length = eng.slow.spleen * Math.cbrt(1 - (eng.slow.spInf || 0)); sp.platelets = clamp(250 * Math.pow(11 / sp.length, 3), 25, 400); }   // (an embolized spleen is the smaller one it has left: SPLEEN_INFARCT)
  const he = part(r, 'heRisk'); he.index = heIdx; he.label = heIdx < 0.2 ? 'Low' : heIdx < 0.45 ? 'Moderate' : 'High';
  const bl = part(r, 'blood');
  bl.volume = bv + eng.pregnancyPlasma(); bl.lossPct = lossPct; bl.lost = eng.blood.lost; bl.hct = hct; bl.hb = (hct * 100) / 3; bl.shock = shock;
  // (Where the hemoglobin is heading once the plasma has refilled, or a unit's extra plasma has gone: the reading lags a bleed by a day.)
  bl.hbSettled = eng.hbSettled();
  let bleeding = null;
  if (eng.bleed.active) { bleeding = spareOf(r).bleed; bleeding.site = eng.bleed.site; bleeding.rate = eng.Qbleed * 60; bleeding.total = eng.bleed.total; }
  const vt = part(r, 'vitals');
  vt.co = eng.vitM?.[0] ?? co; vt.map = eng.vitM?.[1] ?? map; vt.hr = eng.vitM?.[2] ?? eng.hr; vt.ra = eng.vitM?.[3] ?? ra;
  // (Systolic and diastolic, engine bpNow: the arm cuff's reading, beside the MAP, which stays the true mean.)
  const bp = eng.bpNow ? eng.bpNow(spareOf(r).bp || (spareOf(r).bp = { sbp: NaN, dbp: NaN })) : { sbp: NaN, dbp: NaN };
  vt.sbp = eng.vitM?.[5] ?? bp.sbp; vt.dbp = eng.vitM?.[6] ?? bp.dbp;
  // (The blood pressure is one triple everywhere: the mean is the bedside one, diastolic plus a third of the pulse pressure, which a physician checks by hand
  // against "S/D (M)". The model's own time-mean of the aortic pressure ran 2 to 4 mmHg under it; the engine keeps it for its flows (MAPf).)
  if (Number.isFinite(vt.sbp) && Number.isFinite(vt.dbp)) vt.map = bedsideMean(vt.sbp, vt.dbp);

  r.t = eng.t; r.day = eng.day;
  // (The gradients are the difference of the two readings as every screen shows them, at one decimal: WHVP 16.6 and
  // FHVP 4.9 read HVPG 11.7 in Tests, Over time, the figure's bracket and the bottom bar alike, never 11.6.)
  r.hvpg = tenthGap(hv.whvp, hv.fhvp, hv.hvpg); r.whvp = hv.whvp; r.fhvp = hv.fhvp;
  // Liver stiffness (transient elastography, kPa), an estimate from the model. It rises with the sinusoidal
  // gradient (about 20 kPa at an HVPG of 10), flattens above an HVPG of 12 where fibrosis is already
  // advanced, and with congestion at about 2 kPa per mmHg of free hepatic vein pressure above normal
  // (heart failure and hepatic outflow block stiffen the liver too). It reads the gradient the liver would have without a
  // beta-blocker (Engine.hvNoBlocker): the drug lowers the HVPG, not the stiffness (AASLD 2024 p. 1189).
  r.lsm = hold(eng, 'lsm', lsmOf(eng.hvNoBlocker ? eng.hvNoBlocker(hv) : hv, eng.params.cirrhosis));
  r.scar = eng.params.cirrhosis;   // (the liver's sinusoidal scar, 0 to 1: lsm-cuts.js lsmContext tells a vascular liver from a fibrotic one by it)
  // Spleen stiffness (the 100 Hz spleen probe, kPa), an estimate from the model (ssm-cuts.js): the red pulp's transmural pressure
  // (its pressure less the abdomen's) and the spleen's size. Unlike the liver's, it follows the pressure as it stands, beta-blocker
  // and TIPS included. No spleen (splenectomy), no reading.
  // (The spleen's outside pressure averaged as its pressure is, engine shownMean: this instant's would put the breath back in.)
  const X = eng.extf || eng.ext;
  r.ssm = eng.params.splenicRx === 2 ? null : hold(eng, 'ssm', ssmOf(P[ni.SPL] - (X ? X[ni.SPL] : 0), sp.length));
  r.measured = measured;
  // (The portal and IVC pressures through the dead band at one decimal, as the wedged and free ones: the PPG is their difference as printed.)
  const pv = hold(eng, 'pv', P[ni.CONF]), ivc = hold(eng, 'ivc', P[ni.IVCS]);
  r.ppg = tenthGap(pv, ivc, pv - ivc);
  r.pv = pv; r.pvh = P[ni.PVH]; r.sv = P[ni.SV]; r.ra = hold(eng, 'ra', ra); r.ivc = ivc;
  r.pvFlow = qf(eng, 'PV_TRUNK') * 0.06; r.pvVel = eng.dopplerVelocity('PV_TRUNK');
  // Portal flow is the blood the portal system brings to the liver. With the trunk thrombosed, that is what the cavernoma, the periportal collaterals (C8), carries round the clot: about a litre a minute months after the clot (chronic PVT: hepatopetal),
  // little in the first days, before it has formed (acute: the two-lesions deck's clot carries none); the trunk's own flow and Doppler velocity stay zero (pvVelMean), as the main portal vein shows on ultrasound (16 Nov 2026: "0.0 L/min, Stasis" beside a cavernoma).
  r.pvFlowMean = ((eng.params.thrombus?.PV_TRUNK ?? 0) >= 0.9 ? qf(eng, 'C8') : (eng.pvQm ?? qf(eng, 'PV_TRUNK'))) * 0.06; r.pvVelMean = hold(eng, 'pvVel', eng.pvVm ?? eng.dopplerVelocity('PV_TRUNK'), 1);
  // (the vitals over a breath, engine.js controllers: what the bar and Readouts show)
  r.vitals = vt;
  r.pvPI = p.pulsatile || eng.beat ? eng.pi.value : null;
  r.hepaticFlow = hepFlow * 0.06; r.liverPerfPct = (hepFlow / eng.baseHepFlow) * 100;
  r.portalIn = portalIn * 0.06; r.arterialIn = arterialIn * 0.06; r.splanchnicIn = splIn * 0.06;
  r.shuntFraction = shuntFraction; r.collateralFlows = collateralFlows;
  // The TIPS's and the DIPS's hydraulics (engine stentState: flow, the pressure across the stent, the waist's velocity and each part's share
  // of the drop), null when the stent is not in. The pressure across the stent is its portal end less its hepatic vein end: not the PPG,
  // which is the portal vein less the IVC, and never an HVPG.
  r.tips = eng.stentState ? eng.stentState('TIPS', r.tips || undefined) : null;
  r.dips = eng.stentState ? eng.stentState('DIPS', r.dips || undefined) : null;
  r.varix = vx; r.gastricVarix = gx; r.ascites = ax; r.spleen = sp;
  // (Abdominal perfusion pressure (APP; the key is rpp, its first name): the mean arterial pressure less the abdomen's, kidney-cuts.js. A pressure, not renal perfusion or a filtration rate: the model has no kidneys.
  // Both over the breath, as the bar's MAP and the IAP read (full app review ENG-3: this instant's IAP swung the APP by 2 mmHg a breath).)
  r.rpp = hold(eng, 'rpp', vt.map - ax.iap, 1);
  // (The blood pressure's three numbers are one reading, the vitals' (vt): systolic, diastolic and mean all come through the same two-breath averaging.
  // The mean was the engine's raw MAPf, one fast stage, beside a systolic and a diastolic averaged over about eight seconds, so in any change of
  // pressure (the Valsalva strain, a bleed, a drug) a tile printed 102/72 (103), a mean outside its own systolic and diastolic: 16 Nov 2026.
  // The resistance below is physics and keeps the raw mean.)
  r.map = vt.map; r.sbp = vt.sbp; r.dbp = vt.dbp; r.co = vt.co; r.hr = eng.hr; r.svr = (map - ra) / Math.max(0.5, vt.co);   // (the cardiac output as the vitals show it, averaged over two breaths: the 2 s filter's `co` swung 3.9 to 5.6 L/min at rest in a healthy liver, and the heart's label and the tiles read this field)
  r.heRisk = he; r.blood = bl; r.bleeding = bleeding;
  r.habr = eng.habr; r.baro = eng.baro; r.splTone = eng.slow.splTone;
  return r;
}
