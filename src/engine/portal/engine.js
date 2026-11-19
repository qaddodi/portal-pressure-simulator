// Lumped-parameter hemodynamic engine (blueprint §7).
// Pure JS, no DOM: runs in a Web Worker, on the main thread, or in Node tests.

import { NODES, EDGES, JUNCTIONS, JUNCTION_CHAINS, JUNCTION_HOST_ENDS, dopplerK, dMinOf, edgePresent, isOccluded, partOf, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES, stentReadsOf } from './topology.js';
import {
  clamp, tubeResistanceFactor, tubeArea, volumeOf, ptmOf, complianceAt, stenosisFactor,
  heartFlow, fillShape, systoleShape, raWave, iapFromAscites, makeRng, ARTERY, pulseOf,
} from '../core/physiology.js';
import { defaultParams, DRUGS, PRESETS, deepMerge, MEAL_TONE, MEAL_BLUNT, gastricUp } from './scenario.js';
import { detectEvents } from './events.js';
import { STENT_CLOSED_D } from './stent-ease.js';
import { stentParts, geomOf, geomDefault, kindOf, benchFlow, BENCH_DP, endSiteOf, END_U } from './stent-geom.js';
import { stentStillHeld } from './flow-cuts.js';
import { LYMPH, tissueP, sinusoidPull, hepLymphOf } from './lymph.js';
import { DisplayMean, holdAt, BREATH_S } from './display-mean.js';
import { hvBlocked } from './pressure-cuts.js';

const KNEE = { artery: [1e9, 1], bed: [14, 10], portal: [14, 10], vein: [14, 6], hepvein: [10, 3], heart: [10, 4], liver: [9, 2], wedge: [9, 5], varix: [30, 10] };
const KD = { vein: 0.03, diode: 0.03, collateral: 0.08 };
const EXT_OVERRIDE = { IVC_IS: 'abd', CAUD: 'none' };

// The drugs that lower the portal pressure within seconds (holdVarices: they do not regrade a varix until it has remodelled).
const JUNCTION_HAIR = 1e-6;   // (mmHg: how far a junction's pressure sits off the end of its vein it is joined at, so the order along the vein holds)
const VASO_DRUGS = ['propranolol', 'carvedilol', 'terlipressin', 'octreotide'];
const STRAIN_RISE = 1.5, STRAIN_FALL = 1.5, STRAIN_MAX = 30;   // (seconds: a strain builds, lets go and is held at most this long)
export const VARIX = { Tcrit: 150, r0Healthy: 1.0, rMax: 6.0, w0: 1.0, open: 7.0, k: 0.35, kBlocked: 0.4, kGV: 0.4, openGV: 5.0, mature: 0.3, tauRegress: 60, tauCut: 90, tauFall: 45, tauReopen: 8 };
// (tauRegress: days for a held grade size to remodel to the varix now, holdVarices; tauCut: days for the esophageal varices to shrink once a Warren shunt has cut their feeder, varixTarget.)
// (tauFall: the time constant, in days of the disease clock, of the FALL of a varix's resting size. The size the pressure sets still
// rises at once (a bleed's surge, a meal, a Valsalva strain, a worse scar), but a fall in the pressure, from a drug, a TIPS or a cured
// cause, lets the wall remodel back over weeks: a first-order lag, slow.vRest, applied in varixTarget and stepped in slowStep with
// exp(-days / tauFall), so it does not depend on the size of the time step. Banding, BRTO and coils do not wait for it: they close the
// varix rather than relieve its pressure.)
/** Seconds the tube's gastric balloon must press on the tear before the bleed counts as stopped: a little over the 2.4 s it takes the tube to go
 *  in and the balloon to fill and be drawn up on screen (balloon-eso.js BALLOON_MS; tests/tamponade-bleed.test.js holds the two together). */
export const BALLOON_SEAL_S = 3;
/** Rupture hazard per day as a function of T/Tcrit (§7.5). */
const ruptureHazardPerDay = (x) => (x <= 1 ? 0 : 0.01 * Math.pow((x - 1) / 0.25, 3));
const COLLATERAL = { open: 7.5, span: 14, tauGrow: 50, tauRegress: 120, acute: 0,
  acuteClot: 0.15 };   // acute: a clotted portal trunk opens the small pre-existing bypass veins this far (PV about 30 mmHg, not 46)
// (The stents' hydraulics, the TIPS, the DIPS and a drawn stent, live in stent-geom.js: stentConductance below.)
/** mmHg of hepatic venous rise the sinusoids still dilate with (a tense belly, a little fluid); only a congested outflow beyond it is taken off. */
const CONGESTED_FROM = 4;
/** The cirrhosis slider (0 to 1) from which the sinusoids no longer swell with congestion at all: a healthy liver's congested sinusoids do (congestive hepatopathy), a scarred one's do not, in between by degrees. */
const SCARRED_FROM = 0.3;
/** The part of a hepatic venous rise that is congestion: nothing under CONGESTED_FROM, then all of it from twice that, by a smooth step (no kink for the solver). */
const congestedRise = (rise) => { const x = Math.min(1, Math.max(0, (rise - CONGESTED_FROM) / CONGESTED_FROM)); return rise * x * x * (3 - 2 * x); };
// A stent's conductance from its geometry (stent-geom.js stentParts: the tract, the wall, the device's entrance and exit, the waist's jet and
// inlet; the one calculation the Doppler, the figure and the cards read too). With no geometry set it is the stent the model always had.
const PARTS = { tract: 0, wall: 0, waistWall: 0, entry: 0, jet: 0, inlet: 0, jetEnd: 0, jetWaist: 0, wallEnd: 0, wallWaist: 0, total: 0 };   // alloc-rare: made once (computeG's parts, read at once)
const GEOM = { len: 0, waist: 0, trans: 0, red: 0 };   // alloc-rare: made once (computeG's geometry, read at once)
const stentConductance = (kind, d, q, visc, s, p, id) => 1 / stentParts(kind, d, q, visc, s, geomOf(p, id, kind, GEOM), PARTS, END_U[endSiteOf(p, id)]).total;
const BLOOD_BASE = 5000, HCT_BASE = 0.42;
// How long the volumes a hidden relaxation moved take to come across to the live model (s): the worker's tick.
const CARRY_S = 0.033;
// How far (mmHg) below the outside pressure a vein's downstream end goes before its flow is wholly the collapsed vein's.
const WF_BAND = 1;
// A live change's numbers (a narrowing, a stent's width, a leak) ease in with this time constant (s) of model time, so a
// slider that sends a new value every frame moves the model, and every Doppler trace, without a step at each frame.
export const PARAM_EASE_S = 0.15;
// Numbers that are choices, not amounts: they change at once.
const NO_EASE = new Set(['seed', 'splenicRx', 'customShunts', 'catheter']);
const STENT_SWITCH = ['tips', 'dips'];   // (the stents whose switch opens and closes through their width: easeParams)
// The value a number missing from params stands for while it eases: 0, or a stent geometry's default length (stent-geom.js geomDefault).
const GEOM_D = { len: 0, waist: 0, trans: 0, red: 0 };   // alloc-rare: made once (missingAs's default, read at once)
const missingAs = (path, k) => {
  if (path.length !== 2 || path[0] !== 'stentGeom') return 0;
  const e = EDGES.find((x) => x.id === path[1]), kind = kindOf(e);
  return kind ? geomDefault(kind, GEOM_D)[k] ?? 0 : 0;
};
const HR_REST = 60;   // resting heart rate (/min); the contractility reference is scaled to it so cardiac output is unchanged
const PERICARDIAL_FILL = 0.6;   // constriction limits diastolic filling: the heart's pump capacity falls by this share at full constraint (as the tricuspid term below; 13 Nov 2026, constrictive pericarditis reaches RA 15+ with a low-normal output)
// Compensation for blood loss, calibrated to the ATLS hemorrhage classes (ATLS 10th ed., 2018): under 15 % lost the
// vital signs barely change, 15–30 % raises the heart rate with the pressure held, 30–40 % brings hypotension, and over
// 40 % is severe shock. Two reflexes the arterial baroreflex alone misses:
// - the venous reservoir: sympathetic venoconstriction (mostly splanchnic and skin veins) moves unstressed blood into
//   the stressed volume, so most of a moderate loss is made up from it (Gelman 2008, Anesthesiology 108:735);
//   k: share of the deficit refilled, max: reservoir limit (mL), tau: seconds; cirrhotic vasoplegia (vascular
//   hyporeactivity to vasoconstrictors) blunts it by up to `cirr`;
// - the volume afferent (cardiopulmonary receptors and the narrowing pulse pressure): drives the sympathetic tone
//   per fraction of the patient's own volume lost, before the mean pressure falls.
export const RESERVOIR = { k: 0.72, max: 1700, tau: 20, cirr: 0.5, afferent: 1.5, chrono: 0.4 };
// How fast the spleen and the splanchnic vasodilation RELAX when the portal pressure falls (a TIPS, a shunt, a drug), in days of the
// disease clock (doc 4.3, 8 Nov 2026). Both build up quickly (spleen 45 days, vasodilation 30) and let go at that pace without
// advanced cirrhosis (a Rex bypass, an anticoagulated portal vein clot, a presinusoidal block, a compensated liver). With advanced
// cirrhosis (`advanced` below: 0 at a scar of 0.6, 1 from 0.85) the spleen is fibrocongestive, with hyperplastic red pulp that does not
// shrink back as the pressure falls, and the vasodilation is kept up by the portosystemic shunting and the liver disease, not by the
// portal pressure alone. So after a TIPS the platelets rise only modestly over months, and the heart rate and cardiac output do not drop
// to a healthy patient's within weeks (they did: 70 to 56 beats/min and 6.7 to 5.1 L/min in 60 days in ten-years). The fall's time
// constant is `base + advanced * extra`. These are model choices with no source figure, tuned to relax plausibly. Only the tone is
// held: the plasma volume (slow.volExtra) still follows the pressure at the base pace, because holding it too would keep the flow
// through a TIPS stent above the 190 cm/s that the TIPS Doppler talk calls a working stent (tests/tips-doppler.test.js).
// Partial splenic artery embolization infarcts a share of the spleen's tissue (about 50 to 70 % of its volume is the usual aim) and the dead tissue is absorbed over weeks:
// the length shrinks by the cube root of what is left and the platelets, which the spleen was pooling, climb with it (play-test, 16 Nov 2026: "embolization does not
// change the spleen"). It moves on the disease clock like every other change of an organ's size, so it shows in a time-lapse, not in the first minute at the bedside.
export const SPLEEN_INFARCT = { share: 0.6, tauDays: 14 };
export const RELAX = { spleenBase: 45, spleenExtra: 165, toneBase: 30, toneExtra: 60, advLow: 0.6, advHigh: 0.85 };
// Lymph formation, its capacity and the belly's small brake: lymph.js (LYMPH, tissueP, sinusoidPull, hepLymphOf), shared with the fluid card.
// The peritoneum takes ascites back (slow.ascites > 0): through the diaphragm's lymphatics and the peritoneal capillaries, up to `bulk` mL/min
// as the first liters spread over it (`bulkL` per mL), and more as the belly's pressure rises (`kIap` per mmHg above rest), which drives
// that uptake. With diuretics the kidneys draw more back (`water`, up to `waterMax`). Tense ascites settles where the take-back meets
// the overflow.
const PERIT = { bulk: 0.6, bulkL: 1 / 2000, kIap: 0.16, waterMax: 0.9, waterL: 1 / 1500 };
// Protein in lymph and ascites (Kedem–Katchalsky sieving per bed, then a peritoneal mass balance).
// From the literature: the sinusoidal reflection coefficient for albumin, low in a fenestrated liver (lymph
// about 85 % of plasma) and about 0.55 once cirrhosis capillarizes it (lymph about 52 %, PMID 1214504);
// the gut capillary's, high (0.9). Tuned so the textbook taps come out: PS (diffusive leak, mL/min), the
// gut's basal lymph, the share of hepatic lymph that weeps off the liver into the peritoneum, and how much
// protein the diuretic-driven peritoneal reabsorption holds back.
const PROT = { sigHep0: 0.15, sigHepCirr: 0.45, sigGlob: 0.1, sigGut: 0.9, psHep: 0.8, psGut: 0.3, gutBase: 1, hepWeep: 0.25, sigPerit: 0.3 };
/** Filtrate-to-plasma ratio across a membrane at steady state: (1 − σ) / (1 − σ·e^(−Pe)), Pe = Jv(1 − σ)/PS. */
const sieve = (sig, jv, ps) => (1 - sig) / (1 - sig * Math.exp(-Math.max(0, jv) * (1 - sig) / ps));

/** Splenic artery resistance multiplier: none, partial embolization (about 60 % infarct), splenectomy (no inflow). */
const SPLENIC_RX_R = [1, 2.5, 80];
/** Systemic share of the chronic splanchnic vasodilation (fraction of the splanchnic tone drop). */
const SYS_DILATION = 1.0;
// The arterial pressure the baroreflex defends, and how far it gives way to the chronic vasodilation of portal hypertension:
// the reflex is reset to the lower pressure of the hyperdynamic circulation (MAP in the low 80s in decompensated cirrhosis,
// about 88 compensated; AASLD 2024 portal hypertension guidance, hyperdynamic circulation) rather than restoring 93 mmHg
// whatever the disease. Bleeds, fluids and drugs move the pressure from that lower baseline.
const MAP_SET = 93, MAP_DROP = 14;
// Pregnancy (params.gestation, weeks; 0 = not pregnant, and then none of this applies). At its full extent, from about
// 30 weeks: splanchnic and systemic arteriolar tone fall by a quarter and 30 %, the heart pumps 20 % harder and beats
// 15 /min faster (the rate only, as the chronic drive in cirrhosis), and blood volume grows by about 1.8 L (30–50 % in
// pregnancy): `stressed` mL raises venous filling, the rest (`plasma`) fills veins that widen to hold it, so the right
// atrial pressure stays normal, and is mostly plasma (`rbc`: its red cell share), so the hemoglobin falls (the
// physiological anemia). From 20 weeks the growing uterus raises intra-abdominal pressure, by `iap` mmHg at term.
// Red cells and plasma over hours and weeks (the hemoglobin's own clocks):
// - transcapillary refill: whole blood is lost, so the first hemoglobin after a bleed is the old one; plasma then moves in from
//   the tissues (and the kidneys hold salt and water) until the volume is the patient's own again, diluting the red cells left:
//   the hemoglobin falls over the next 24 to 72 hours. The same exchange takes the plasma of a unit given on top of a full
//   circulation back out, so a unit raises the hemoglobin by about 1 g/dL once it has settled, not the 0.4 it adds at once.
//   `refillTau`: seconds, one time constant (about 90 % back by a day);
// - the anemia of chronic liver disease (marrow suppression, chronic loss, shortened red cell life, hypersplenism): the
//   red cell mass the marrow keeps is a share of the healthy one, lower with the cirrhosis and the spleen's size; most
//   decompensated patients sit near 10 to 11 g/dL, compensated near 13. `marrowDays`: the anemia's own time constant;
// - after a bleed or a transfusion the red cell mass returns to the patient's own: the marrow makes up a loss over weeks
//   (`upDays`, slower the sicker the liver), and transfused cells above it are cleared as they age (`downDays`).
// blood.rbc keeps the red cell mass as a healthy marrow would hold it (mL; the true mass is marrow × rbc, slow.marrow), and blood.own
// is the mass the marrow restores it to. The chronic anemia is the calibration's own (every preset was tuned at its hematocrit), so
// the blood's viscosity reads rbc (hctEq): only a change from the patient's own (a bleed refilled, a transfusion) thins or thickens it.
export const RED = { refillTau: 10 * 3600, cirr: 0.25, spleen: 0.01, spleenFrom: 12, min: 0.6, marrowDays: 60, upDays: 30, downDays: 60 };
export const PREGNANCY = { spl: 0.25, sys: 0.3, contr: 0.2, hr: 15, stressed: 300, plasma: 1500, rbc: 0.2, iap: 4, tau: 5, mapDrop: 0 };
// (mapDrop: how far the baroreflex's set point falls with the vasodilation of pregnancy, mmHg, by pregnancyLevel. 0 for now: 8 (Clapp & Capeless, Am J Cardiol 1997) lowered the portal pressure of the pregnancy preset by 0.7 mmHg and took its varices from Large back to Small, so it needs the preset's own retuning with the deck's numbers first, 16 Nov 2026.)
/** How far pregnancy has changed the circulation, 0..1: fast in the first trimester, complete by about 30 weeks. */
export const pregnancyLevel = (weeks) => { const x = clamp((weeks || 0) / 30, 0, 1); return x * (2 - x); };
/** The uterus's share of the late rise in intra-abdominal pressure, 0 until 20 weeks, 1 at 40. */
const uterusLevel = (weeks) => Math.pow(clamp(((weeks || 0) - 20) / 20, 0, 1), 1.5);

export class Engine {
  // (Declared for the type checker, never reset: the hidden copy relaxHidden() settles and the unbanded twin of the bands' ratio are made on first use and kept
  // across a reset; _paramsOf and _V0 live on that copy: the params it was last set to, and its volumes before a relax.)
  /** @type {Engine | undefined} */ _hidden;
  /** @type {Engine | undefined} */ _nbTwin;
  /** @type {object | null | undefined} */ _paramsOf;
  /** @type {Float64Array | undefined} */ _V0;

  /** @param {{ params?: object, seed?: number }} [opts] */
  constructor({ params, seed } = {}) {
    this.nodes = NODES;
    this.edges = EDGES;
    this.N = NODES.length;
    this.E = EDGES.length;
    this.ni = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
    this.ei = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
    this.A = new Float64Array(this.N * this.N);
    this.b = new Float64Array(this.N);
    this.G = new Float64Array(this.E);
    this.Q = new Float64Array(this.E);
    this.P = new Float64Array(this.N);
    this.V = new Float64Array(this.N);
    this.ext = new Float64Array(this.N);
    this.Cn = new Float64Array(this.N);
    this.wf = new Int8Array(this.E);     // waterfall flag: +1 f→t, −1 t→f
    this.wfx = new Float64Array(this.E); // waterfall external pressure
    this.wfw = new Float64Array(this.E); // near the collapse point: the collapsed share of the flow (see computeG)
    this.wfo = new Float64Array(this.E); // and the open vein's conductance over the collapsed one's
    this.vx = new Float64Array(this.E);  // a vein's external pressure (set by computeG)
    this.wfPrev = new Int8Array(this.E); // the waterfall state of the step before

    // Static node constants
    this.nodeC = NODES.map((n) => n.C);
    this.nodeK = NODES.map((n) => KNEE[n.kind] || KNEE.vein);
    this.Pbase = Float64Array.from(NODES.map((n) => n.P));

    // Static edge constants
    this.Rbase = new Float64Array(this.E);
    this.edgeExt = [];
    this.edgeF = new Int32Array(this.E);
    this.edgeT = new Int32Array(this.E);
    EDGES.forEach((e, k) => {
      // (A shunt drawn onto the middle of a vein is joined to the vein's own node here, whatever junction it is drawn at: topology.js JUNCTIONS.)
      const f = this.ni[e.efrom ?? e.mfrom ?? e.from], t = this.ni[e.eto ?? e.mto ?? e.to];   // (efrom, eto: a shunt's hydraulic end where it is not its drawn one, topology.js TIPS)
      this.edgeF[k] = f; this.edgeT[k] = t;
      if (e.Q) this.Rbase[k] = (NODES[f].P - NODES[t].P) / e.Q;
      else if (e.R) this.Rbase[k] = e.R;
      this.edgeExt[k] = EXT_OVERRIDE[partOf(e.id)] || NODES[f].ext;
      if ((e.Q || e.R) && !(this.Rbase[k] > 0)) throw new Error(`Non-positive baseline resistance on ${e.id}`);
    });
    this.collaterals = EDGES.map((e, k) => (e.kind === 'collateral' ? k : -1)).filter((k) => k >= 0);
    this.veins = EDGES.map((e, k) => ((e.kind === 'vein' || e.kind === 'diode') && !e.virtual ? k : -1)).filter((k) => k >= 0);
    // The veins split where a shunt joins them part-way (topology.js JUNCTIONS): the pieces' edges and the junction nodes between them, filled after each step.
    this.jx = JUNCTION_CHAINS.map((c) => ({ ks: c.ids.map((id) => this.ei[id]), lead: c.lead, end: c.end, nodes: c.nodes.map((id) => this.ni[id]), at: c.at, taps: c.taps.map((l) => l.map(([id, sg]) => [this.ei[id], sg])) }));
    this.diodes = EDGES.map((e, k) => (e.kind === 'diode' ? k : -1)).filter((k) => k >= 0);
    // A shunt the engine joins past the end of a vein it is drawn into (eto / efrom: the TIPS, drawn into the right hepatic vein, joined to the cava) still
    // drains through that stretch of the vein: [the vein's solved edge, the stretch's share of its length], per shunt edge. A clot or a stenosis of the vein
    // then narrows the shunt's outlet too (shuntOutlet), so a TIPS cannot drain a hepatic vein that is occluded (Budd–Chiari: 17 Nov 2026, the TIPS had
    // drained to the cava past three occluded hepatic veins and lowered the portal pressure more than the DIPS did).
    this.through = EDGES.map((e) => {
      const j = (e.eto || e.efrom) && JUNCTIONS.find((x) => x[0] === e.junction);
      if (!j) return null;
      const [a, b] = JUNCTION_HOST_ENDS[j[1]], end = e.eto ?? e.efrom, chain = JUNCTION_CHAINS.find((c) => c.host === j[1]);
      const share = end === b ? 1 - j[2] : end === a ? j[2] : 0;
      return share > 0 && chain ? [this.ei[chain.ids[chain.lead]], share] : null;
    });

    this.params = params ? structuredClone(params) : defaultParams();
    this.reset(seed ?? this.params.seed);
  }

  // ───────────────────────── state ─────────────────────────
  reset(seed = 1) {
    this.t = 0;
    this.day = 0;
    this.rng = makeRng(seed);
    this.baro = 1; this.MAPf = 93; this.habr = 1;
    // Display filters start over from the new state (a non-finite run must not leak into the next patient).
    this.Pf = this.Qf = this.extf = null; this.iapf = undefined; this._held = null; this.COf = this.pvQm = this.pvVm = undefined; this.vitM = null; this.qpm = null;
    this._hiddenOn = false; this._carry = null; this._ease = null;
    this.hr = HR_REST;
    this.slow = {
      d: Object.fromEntries(this.collaterals.map((k) => [EDGES[k].id, dMinOf(EDGES[k])])),
      r0: { VAR: VARIX.r0Healthy, GV: VARIX.r0Healthy },
      vRest: { VAR: null, GV: null },   // (the resting size the pressure gave a varix, lagged on its fall: VARIX.tauFall, varixTarget)
      vHold: { VAR: null, GV: null },   // (the size a varix is graded at while a drug's fall in pressure has not yet remodelled it: varixGraded)
      vCut: null,   // (the radius, mm, the esophageal varices keep while they shrink after a Warren shunt has cut their feeder: varixTarget)
      spleen: 11,
      splTone: 1,
      volExtra: 0,
      marrow: 1,   // (the share of the healthy red cell mass the marrow keeps, see RED)
      lymphCap: LYMPH.base,
      ascites: 0,
      ascAlb: null, ascGlob: null,   // ascitic albumin and globulin, g/dL (null: no fluid yet)
    };
    // ref: the patient's own blood volume (the reflexes measure a loss against it), inf0: infused when it was set,
    // shift: blood the venous reservoir has moved into the circulation (counted out of bloodVolume, which is the
    // whole volume).
    // refill: plasma the tissues moved in since (out, below zero), held: volume taken that the tissues do not give back (a
    // paracentesis's circulatory dysfunction is underfilling, not a loss to refill).
    this.blood = { rbc: BLOOD_BASE * HCT_BASE, lost: 0, infused: 0, ref: BLOOD_BASE, inf0: 0, shift: 0, refill: 0, held: 0, own: BLOOD_BASE * HCT_BASE };
    this.bleed = { active: false, site: null, G: 0, clot: 0, total: 0 };
    this.infusions = [];
    this.valsalva = { until: -1, start: -1 };
    this.pi = { vmax: -Infinity, vmin: Infinity, cycleStart: 0, value: 0, lastPh: 0 };
    this.flows = { ascitesRate: 0, hepLymph: 0, splLymph: 0 };
    this.evState = {}; this.evAvg = null;
    this.vGrow = { VAR: 1, GV: 1 };   // (how far a varix has regrown since it was last closed off, 0 to 1: varixRegrow)
    this.newEvents = [];
    this.eventLog = [];
    this.eventCount = 0;   // every event ever pushed (the log keeps only the last 200)
    this.quiet = false;
    // Beat-to-beat waveform switched on by the UI while a waveform instrument is on screen,
    // without touching the patient's parameters (links and undo stay unchanged).
    this.beat = false;
    // The lungs and the ventricle between the pump and the aorta while the beat runs (physiology.js ARTERY; lvStep): null until it first runs.
    this.lv = null;
    this.bands = 0;
    for (let i = 0; i < this.N; i++) {
      const [Pk, Ps] = this.nodeK[i];
      this.V[i] = volumeOf(this.Pbase[i], this.nodeC[i], Pk, Ps);
      this.P[i] = this.Pbase[i];
    }
    this.Vbase = Float64Array.from(this.V);
    this.Qpref = 18.3;
    // Reference: healthy baseline pressures (for collateral drivers) & portal inflow (for HABR).
    const saved = this.params;
    this.params = defaultParams();
    this.settle();
    this.Qpref = this.portalInflow();
    this.refP = Float64Array.from(this.P);
    this.refQ = Float64Array.from(this.Q);
    this.Vbase = Float64Array.from(this.V);
    this.params = saved;
    this.settle();
  }

  setParams(p) {
    this.paramsRev = (this.paramsRev | 0) + 1;   // (counts the changes made to the patient: the History's events tell a patient's settling in from a change, events.js)
    const prev = this.params;
    if (prev && this.slow && this.refP) this.holdVarices(prev, p);
    this.params = structuredClone(p);
    this._ease = null;
    if (prev.seed !== p.seed) this.rng = makeRng(p.seed);
  }
  /** setParams with the numbers that changed eased in over about PARAM_EASE_S of model time (switches and choices at once).
   *  A number missing on one side (a narrowing added or taken away) counts as 0 there (a stent's geometry: its default, missingAs). */
  easeParams(p) {
    const from = this.params;
    this.setParams(p);
    const legs = [];
    const walk = (a, b, path) => {
      for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        if (NO_EASE.has(k)) continue;
        const x = a?.[k], y = b?.[k];
        if (y && typeof y === 'object') { if (!x || typeof x === 'object') walk(x, y, [...path, k]); continue; }
        // (A missing number is 0, except a stent geometry's length, which is its default: a stent given a waist length for the first time
        // eases from the 8 cm and 1 cm it had, not from nothing, which would open it wide for a moment.)
        const z = missingAs(path, k);
        if (!(typeof x === 'number' || x === undefined) || !(typeof y === 'number' || y === undefined) || (x ?? z) === (y ?? z)) continue;
        legs.push({ path, key: k, from: x ?? z, to: y ?? z, drop: y === undefined });
      }
    };
    walk(from, this.params, []);
    // A stent that is put in or taken out opens or closes through its width, the way a number eases (its switch is not one): turned on,
    // it opens from nothing to its width; turned off, it narrows to nothing and only then goes out (16 Nov 2026, Mohammad: "the TIPS
    // comes in and out of existence, pops": the switch flipped the whole shunt's flow in one step). Its flow, its drawn width and the
    // stent's mesh then all follow this one width.
    for (const id of STENT_SWITCH) {
      const x = from?.[id], y = this.params[id];
      if (!x || !y || !!x.on === !!y.on) continue;
      for (let i = legs.length - 1; i >= 0; i--) if (legs[i].path[0] === id && legs[i].key === 'd') legs.splice(i, 1);   // (its width is eased by this leg alone)
      legs.push({ path: [id], key: 'd', from: x.on ? x.d : STENT_CLOSED_D, to: y.on ? y.d : STENT_CLOSED_D, drop: false, fin: { on: !!y.on, d: y.d } });
      this.params[id].on = true;
    }
    if (!legs.length) return;
    this._ease = { legs, left: 1, to: structuredClone(this.params) };
    this.easeStep(0);
  }
  easing() { return !!this._ease; }
  /** The params a live change is easing toward (this.params once it has landed). */
  paramsTarget() {
    if (!this._ease) return this.params;
    const p = structuredClone(this.params);
    for (const l of this._ease.legs) { const o = l.path.reduce((q, k) => q[k], p); if (l.drop) delete o[l.key]; else o[l.key] = l.to; if (l.fin) Object.assign(o, l.fin); }
    return p;
  }
  easeStep(dt) {
    const e = this._ease;
    if (!e) return;
    e.left *= 1 - Math.min(1, dt / PARAM_EASE_S);
    const done = e.left < 1e-3;
    for (const l of e.legs) {
      const o = l.path.reduce((q, k) => q?.[k], this.params);
      if (!o) continue;
      if (done && l.drop) delete o[l.key];
      else o[l.key] = done ? l.to : l.to + (l.from - l.to) * e.left;
      if (done && l.fin) Object.assign(o, l.fin);
    }
    if (done) this._ease = null;
  }

  /** Load a preset: healthy reset, apply params, run the disease clock for its chronic days. `preset` is a patient made at run time (scenario.js presetFromPatch) in place of the one `id` names. */
  loadPreset(id, /** @type {{ days?: number, preset?: object }} */ { days, preset } = {}) {
    const steps = this.loadPresetSteps(id, { days, preset });
    let next;
    do { next = steps.next(); } while (!next.done);
    return next.value;
  }

  *loadPresetSteps(id, /** @type {{ days?: number, preset?: object }} */ { days, preset } = {}) {
    const pr = preset || PRESETS.find((x) => x.id === id) || PRESETS[0];
    const params = pr.apply(defaultParams());
    params.seed = this.params.seed;
    this.params = defaultParams();
    this.params.seed = params.seed;
    this.reset(params.seed);
    this.params = params;
    // (A preset's extra volume, a failing heart's salt and water, is the patient's own: the tissues do not refill it away over its days.)
    if (pr.volume) this.addVolume(pr.volume, 0.35, true);
    this.settle();
    const n = days ?? pr.days;
    if (n > 0) yield* this.advanceDaySteps(n, { noRupture: true, silent: true });
    // What the patient has now, after the years of disease (a pregnancy): set once the disease clock has run.
    if (pr.now) Object.assign(params, deepMerge(params, pr.now));
    // (Years of disease: the anemia of liver disease is complete, and the red cell mass sits at the marrow's set point.)
    this.slow.marrow = this.marrowTarget(); this.blood.own = this.blood.rbc;
    // Day steps relax only roughly; start from a true equilibrium so a before/after comparison
    // (e.g. closing a shunt) shows the intervention, not leftover relaxation.
    this.settle();
    this.blood.ref = this.bloodVolume(); this.blood.inf0 = this.blood.infused;
    this.day = 0;
    this.t = 0;
    this.eventLog = [];
    this.newEvents = [];
    this.evState = {}; this.evAvg = null; this.vGrow = { VAR: 1, GV: 1 };
    detectEvents(this, true);
    this.newEvents = [];
    return params;
  }

  // ───────────────────────── derived params ─────────────────────────
  drugEffects() {
    const e = { hr: 1, contr: 1, spl: 1, sys: 1, sin: 1, baroHr: 1, baroSlow: 1 };
    for (const [k, on] of Object.entries(this.params.drugs)) {
      if (!on || !DRUGS[k]) continue;
      const d0 = DRUGS[k], g = (k === 'propranolol' || k === 'carvedilol') ? (this.params.nsbbGain ?? 1) : 1;
      // (nsbbGain: a stronger or weaker responder to a beta-blocker, the portal side of its effect scaled; 1 leaves it as it was)
      const d = g === 1 ? d0 : { ...d0, spl: 1 + (d0.spl - 1) * g, sin: 1 - (1 - d0.sin) * g };
      e.hr *= d.hr; e.contr *= d.contr; e.spl *= d.spl; e.sys *= d.sys; e.sin *= d.sin; e.baroHr = Math.min(e.baroHr, d.baroHr); e.baroSlow = Math.min(e.baroSlow, d.baroSlow ?? 1);
    }
    return e;
  }

  zoneMult(lobe, zone) {
    const p = this.params, s = p.cirrhosis;
    const sinM = 1 + 20 * Math.pow(s, 2.5);
    const cz = { pre: 1 + 2 * s, sin: sinM, post: 1 + 2 * s, inter: sinM }[zone];
    const user = lobe === 'R' || lobe === 'L' ? p.fibrosis[lobe][zone] ?? 1
      : 0.5 * ((p.fibrosis.R.sin ?? 1) + (p.fibrosis.L.sin ?? 1));
    let m = cz * user;
    if (zone === 'sin' || zone === 'inter') m *= this._drug.sin;
    return m;
  }

  /** The hematocrit as a healthy marrow would hold it (RED): what the viscosity and a bleed's red cell account read. */
  hctEq() {
    const u = this.pregnancyPlasma();
    return clamp((this.blood.rbc + PREGNANCY.rbc * u) / (this.bloodVolume() + u), 0.05, 0.8);
  }
  /** The hematocrit the patient has: the anemia of liver disease (slow.marrow) included. */
  hct() {
    const u = this.pregnancyPlasma();
    return clamp(this.marrow() * (this.blood.rbc + PREGNANCY.rbc * u) / (this.bloodVolume() + u), 0.05, 0.8);
  }
  /** Pregnancy's blood held in widened veins (mL): in the circulation but adding no pressure, so it is counted out of
   *  bloodVolume (and so out of what the bleeding reflexes measure) and added back where the volume is shown. */
  pregnancyPlasma() { return PREGNANCY.plasma * pregnancyLevel(this.params.gestation); }
  bloodVolume() {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.V[i] - this.Vbase[i];
    // (The lungs' and the ventricle's share of the beat, lvStep: blood out of the nodes, a few mL either way.)
    if (this.lv) s += this.lv.vp + this.lv.vv;
    return BLOOD_BASE + s - (this.blood.shift || 0);
  }
  viscosity() { return clamp(1 + 1.6 * (this.hctEq() - HCT_BASE), 0.5, 1.6); }
  marrow() { return this.slow.marrow ?? 1; }
  /** The marrow's set point now (RED): a share of the healthy red cell mass, lower with the cirrhosis and a large spleen. */
  marrowTarget() {
    const c = this.params.cirrhosis || 0, sp = this.params.splenicRx === 2 ? RED.spleenFrom : this.slow.spleen;
    return clamp(1 - RED.cirr * c * c - RED.spleen * Math.max(0, sp - RED.spleenFrom), RED.min, 1);
  }
  /** The red cell mass the marrow restores (blood.own, in rbc's units): the healthy one, with the red cells of the body's own volume
   *  added since (addVolume's silent plasma: the chronic plasma expansion, a pregnancy, a preset's retained volume). */
  ownRbc() { return this.blood.own ?? BLOOD_BASE * HCT_BASE + ((this.slow.volExtra || 0) + (this.blood.preg || 0)) * HCT_BASE * 0.7; }
  /** The volume the tissues refill toward (mL, as bloodVolume counts it). */
  refillTarget() { return (this.blood.ref ?? BLOOD_BASE) - (this.blood.held || 0); }
  /** Hemoglobin (g/dL) once the plasma has refilled (or the extra left) at the red cells there are now: where the reading is heading. */
  hbSettled() {
    const u = this.pregnancyPlasma();
    return (clamp(this.marrow() * (this.blood.rbc + PREGNANCY.rbc * u) / (Math.max(1000, this.refillTarget()) + u), 0.05, 0.8) * 100) / 3;
  }
  /** Transcapillary refill (RED.refillTau) over sec seconds of the patient's own time: plasma, no red cells. */
  plasmaRefill(sec) {
    const def = this.refillTarget() - this.bloodVolume();
    if (!(Math.abs(def) > 0.05) || !(sec > 0)) return;
    const mv = def * (1 - Math.exp(-sec / RED.refillTau));
    for (const id of ['UPPV', 'LOWV']) this.shiftVolume(id, mv / 2);
    this.blood.refill = (this.blood.refill || 0) + mv;
  }

  heartState() {
    const d = this._drug, p = this.params, b = this.baro;
    // Chronic sympathetic drive in cirrhosis (tracks the splanchnic vasodilation): a resting heart rate
    // in the 70s to 80s in decompensated disease, as at the bedside. It sets the rate only, not the
    // pump capacity, so pressures and flows are unchanged.
    const symp = 1 + 1.4 * (1 - this.slow.splTone);
    // Volume afferent (see RESERVOIR): the heart rate climbs with the fraction lost before the mean pressure falls.
    const vol = RESERVOIR.afferent * this.volumeDeficit() / (this.blood.ref || BLOOD_BASE);
    // A reflex speeding the heart adds beats to the resting rate rather than scaling it, and cirrhosis blunts it (lower
    // baroreflex sensitivity and chronotropic incompetence, Møller & Henriksen 2010, Heart 96:1088), by up to `chrono`
    // with the vasodilation; slowing (a high pressure) scales the rate as before.
    // (A drug can blunt the slowing alone, `baroSlow`: terlipressin's rise in pressure slows the heart less than the reflex would.)
    const reflex0 = 0.9 * (b - 1) + vol, reflex = reflex0 * d.baroHr * (reflex0 < 0 ? d.baroSlow : 1);
    const blunt = 1 - RESERVOIR.chrono * clamp((1 - this.slow.splTone) / 0.45, 0, 1);
    // Pregnancy adds beats to the resting rate and strengthens the heart; like the chronic drive, the beats it adds do not
    // add pump capacity. (At 0 weeks `rest` is the rate as before: HR_REST · symp.)
    const pg = pregnancyLevel(p.gestation), add = PREGNANCY.hr * pg, rest = HR_REST * symp + add;
    const hr = clamp(HR_REST * d.hr * (reflex > 0 ? symp + reflex * blunt : symp * (1 + reflex)) + d.hr * add * (reflex > 0 ? 1 : 1 + reflex), 38, 170);
    const contr = p.contractility * (1 + PREGNANCY.contr * pg) * d.contr * clamp(1 + 0.35 * (b - 1), 0.6, 1.6);
    const cap = contr * Math.pow(hr / rest, 0.6) * (1 - 0.3 * p.tr) * (1 - PERICARDIAL_FILL * p.pericardial);
    return { hr, cap };
  }

  // ───────────────────────── externals ─────────────────────────
  computeExt(t) {
    const p = this.params;
    let ppl = 0, iapResp = 0;
    if (p.respiration && !this.quiet) {
      const s = Math.sin((2 * Math.PI * t) / 4);
      ppl = -2 * p.respDepth * s;
      iapResp = 1 * p.respDepth * s;
    }
    let vals = 0;
    if (t < this.valsalva.until && !this.quiet) vals = 30 * this.strainLevel(t);
    this.iap = iapFromAscites(this.slow.ascites) + PREGNANCY.iap * uterusLevel(p.gestation) + iapResp + vals;
    const iapDev = this.iap - 5;
    const pplDev = ppl + vals;
    let raExt = pplDev + 12 * p.pericardial;
    const raW = this.pulsing() ? raWave(this.phase()) : 0;
    raExt += raW;
    // (The breath's and the beat's share of the outside pressures, so the shown readings can start from the calm ones: calmExt.)
    this._swing = this._swing || { ppl: 0, iap: 0, ra: 0 };
    this._swing.ppl = ppl; this._swing.iap = iapResp; this._swing.ra = raW;
    for (let i = 0; i < this.N; i++) {
      const ext = NODES[i].ext;
      this.ext[i] = ext === 'abd' ? iapDev
        : ext === 'thor' ? pplDev
        : ext === 'eso' ? pplDev + (gastricUp(p) ? 40 : 0)   // (the first step: the gastric balloon, drawn up against the cardia, presses on the veins there; the esophageal balloon, the second, presses on the varices themselves)
        : ext === 'gas' ? iapDev + (gastricUp(p) ? 45 : 0)
        : 0;
    }
    this.ext[this.ni.RA] = raExt;
  }

  /** Cardiac phase 0..1, integrated so heart-rate changes never jump the phase. */
  phase() {
    return this.cyc - Math.floor(this.cyc);
  }

  extFor(kind, ext = this.ext, iap = this.iap) {
    const iapDev = iap - 5;
    return kind === 'abd' ? iapDev : kind === 'thor' ? ext[this.ni.SVC] : kind === 'eso' ? ext[this.ni.VAR]
      : kind === 'gas' ? ext[this.ni.GV] : 0;
  }
  /** The outside pressures without this moment's breath and beat (computeExt's swing taken off): where the shown readings start. */
  calmExt(out) {
    const w = this._swing || { ppl: 0, iap: 0, ra: 0 };
    for (let i = 0; i < this.N; i++) {
      const k = NODES[i].ext;
      out[i] = this.ext[i] - (k === 'abd' || k === 'gas' ? w.iap : k === 'thor' || k === 'eso' ? w.ppl : 0);
    }
    out[this.ni.RA] = this.ext[this.ni.RA] - w.ppl - w.ra;
    return out;
  }

  // ───────────────────────── conductances ─────────────────────────
  computeG(P) {
    const p = this.params, s = p.cirrhosis, d = this._drug;
    const visc = this.viscosity();
    const pg = pregnancyLevel(p.gestation);
    // (A meal dilates the gut arterioles less the more cirrhosis has dilated them already: scenario.js, MEAL_TONE.)
    const meal = 1 - (1 - MEAL_TONE) * (p.meal || 0) * clamp(1 - MEAL_BLUNT * (1 - this.slow.splTone), 0, 1);
    // (The lower arterial pressure of the hyperdynamic circulation (mapSetOf) drives the gut arteries less: their tone falls with
    // it, a little more than in proportion, so the splanchnic inflow, the portal pressures and the slow portal vein of a disease
    // stay those tuned at 93 mmHg: decompensated cirrhosis 0.76 L/min and 14.8 cm/s against 0.74 and 14.2 before.)
    const spl = p.splanchnicTone * meal * (1 - PREGNANCY.spl * pg) * this.slow.splTone * d.spl * Math.pow(this.baro, 0.6) * (this.mapSetOf(true) / MAP_SET) ** 1.25;   // (the hyperdynamic reset only: pregnancy's own lower set point does not feed the gut less, so the portal numbers of the pregnancy patient stay those tuned)
    // Chronic portal hypertension dilates systemic arterioles too (nitric oxide spill-over), not only the
    // splanchnic bed: SVR falls and, with the expanded plasma volume, cardiac output rises (hyperdynamic circulation).
    const sys = p.systemicTone * (1 - PREGNANCY.sys * pg) * d.sys * this.baro * (1 - SYS_DILATION * (1 - this.slow.splTone));
    const cath = p.catheter;
    const extE = { abd: this.iap - 5, thor: this.ext[this.ni.SVC], eso: this.ext[this.ni.VAR], gas: this.ext[this.ni.GV], none: 0 };

    this.wf.fill(0);
    for (let k = 0; k < this.E; k++) {
      const e = EDGES[k];
      if (e.virtual) { this.G[k] = 0; continue; }   // (a piece of a vein split by a junction that the engine does not solve: its flow is written after the step, fillJunctions)
      const f = this.edgeF[k], t = this.edgeT[k];
      let R = this.Rbase[k];
      switch (e.kind) {
        case 'arteriole':
          if (e.id === 'A_SPL') R *= SPLENIC_RX_R[p.splenicRx | 0] ?? 1;
          R *= e.tone === 'splanchnic' ? spl : e.tone === 'systemic' ? sys : 1 / this.habr;
          if (e.tone === 'splanchnic') {
            // Venoarteriolar response: marked venous hypertension constricts the feeding arterioles.
            const ex = P[t] - (this.refP ? this.refP[t] : this.Pbase[t]);
            if (ex > 15) R *= 1 + 0.06 * (ex - 15);
          }
          break;
        case 'artery':
          break;
        case 'vein': case 'diode': {
          const x = extE[this.edgeExt[k]];
          this.vx[k] = x;
          const up = P[f] >= P[t] ? f : t, dn = up === f ? t : f;
          // Starling resistor: downstream end collapsed → flow set by upstream − external pressure.
          if (P[dn] - x < 0 && P[up] - x > 0.5) {
            const kd = KD[e.kind] ?? 0.03, fc = tubeResistanceFactor(P[up] - x, P[up] - x, this.Pbase[up], this.Pbase[up], kd);
            R *= fc;
            this.wf[k] = up === f ? 1 : -1;
            this.wfx[k] = x;
            // Within WF_BAND of the collapse point the open vein's flow hands over to the collapsed one's gradually (wfw: the
            // collapsed share; wfo: the open vein's conductance over the collapsed one's), so the flow never steps as the
            // downstream pressure crosses the outside pressure (it jumped tenfold there, every beat at an IVC web's middle).
            const w = Math.min(1, (x - P[dn]) / WF_BAND);
            this.wfw[k] = w;
            if (w < 1) this.wfo[k] = fc / tubeResistanceFactor(P[f] - x, P[t] - x, this.Pbase[f], this.Pbase[t], kd);
          } else {
            R *= tubeResistanceFactor(P[f] - x, P[t] - x, this.Pbase[f], this.Pbase[t], KD[e.kind] ?? 0.03);
          }
          break;
        }
        case 'liver':
          R *= this.zoneMult(e.lobe, e.zone);
          if (e.zone === 'sin' || e.zone === 'post') {
            // Congested sinusoids dilate; capillarized (cirrhotic) sinusoids cannot. What dilates them is the pressure above the pressure the whole liver
            // drains into: a rise of the central venous pressure above its baseline, read at the suprahepatic IVC (right heart failure, constriction, an IVC web; not a TIPS, which only raises the hepatic vein it joins, and not a hepatic vein block, where the catheter reads the shut vein) lifts
            // every sinusoid together, and the liver, held by its capsule, does not swell with it (the varix above takes the same rise off its own wall).
            // Without this a congested outflow wiped out the HVPG of a cirrhotic liver: 6.4 mmHg at 40% on the slider fell to 2 with the right atrium at 24,
            // where in patients the gradient follows the sinusoidal resistance and dips only a little with the lower inflow.
            const kd = 0.08 * (1 - s);
            if (kd > 0) {
              const hv = this.ni.IVCS, rise = congestedRise(P[hv] - this.Pbase[hv]) * Math.min(1, s / SCARRED_FROM);
              R *= tubeResistanceFactor(P[f] - rise, P[t] - rise, this.Pbase[f], this.Pbase[t], kd);
            }
          }
          break;
        case 'wedge': {
          let g = e.G;
          if (e.role === 'leak') g *= Math.max(0.01, (1 - s) * (1 - s));
          if (e.role === 'out' && cath.wedged && cath.vein === e.w) g = 0;
          this.G[k] = g;
          continue;
        }
        case 'collateral': {
          const present = edgePresent(e, p);
          if (!present || isOccluded(p, e.id)) { this.G[k] = 0; continue; }
          const dd = this.collateralD(e);
          // Collaterals cross compartments (e.g. the diaphragm): each end sees its own surroundings.
          R = e.Ropen * Math.pow(e.dMax / dd, 4) * tubeResistanceFactor(P[f] - this.ext[f], P[t] - this.ext[t], this.refP ? this.refP[f] : this.Pbase[f], this.refP ? this.refP[t] : this.Pbase[t], KD.collateral);
          if (e.code === 'C1' && this.bands > 0) R /= Math.max(0.02, 1 - this.bands / 4);
          break;
        }
        case 'shunt': {
          let g = 0;
          // Stents narrow at a short pinch (stentConductance); a surgical shunt narrows along its whole length.
          const occ = this.occlusion(e.id), stent = e.shunt === 'tips' || e.shunt === 'dips' || e.shunt === 'custom';
          if (stent && occ >= 0.995) g = 0;
          else if (e.shunt === 'ap') g = 0.5 * (0.05 * s * s * s + 0.1 * p.apShunt);
          // Diameter grades both the shunt fraction and the portosystemic gradient.
          else if (e.shunt === 'tips' && p.tips.on) g = stentConductance('tips', p.tips.d, this.Q[k], visc, occ, p, e.id);
          else if (e.shunt === 'dips' && p.dips.on) g = stentConductance('dips', p.dips.d, this.Q[k], visc, occ, p, e.id);
          else if (e.shunt === 'portocaval' && p.portocaval) g = 1 / (0.03 * visc);
          else if (e.shunt === 'dsrs' && p.dsrs) g = 1 / (0.08 * visc);
          else if (e.shunt === 'mesocaval' && p.mesocaval) g = 1 / (0.08 * visc);
          // The Meso-Rex graft: a vein of 8 mm (Poiseuille: the Warren shunt's resistance at 9 mm, scaled by (9/8)^4).
          else if (e.shunt === 'rex' && p.rex) g = 1 / (0.128 * visc);
          else if (e.shunt === 'custom' && p.customShunts?.[e.id]) g = stentConductance('custom', p.customShunts[e.id], this.Q[k], visc, occ, p, e.id);
          if (g > 0 && !stent) g /= Math.min(1e9, stenosisFactor(occ));
          if (g > 0 && this.through[k]) g = this.shuntOutlet(g, this.through[k], visc);
          this.G[k] = g;
          continue;
        }
      }
      R *= visc;
      const sf = stenosisFactor(this.occlusion(e.id));
      if (sf === Infinity) { this.G[k] = 0; continue; }
      R *= sf;
      // Surgical ligations implied by shunt procedures
      // (End-to-side only: a side-to-side portocaval shunt keeps the portal trunk, so the liver can drain back out through it.)
      if (p.portocaval && e.id === 'PV_TRUNK' && !p.portocavalSide) { this.G[k] = 0; continue; }
      // Warren: the splenic vein is divided between the shunt and the IMV, so the IMV still drains to the portal vein.
      if (p.dsrs && e.id === 'SV_MID') { this.G[k] = 0; continue; }
      // Warren: the coronary (left gastric) vein is tied off where it meets the portal vein, so the high portal pressure no longer feeds the esophageal varices through it.
      if (p.dsrs && e.id === 'LGV_CONF') { this.G[k] = 0; continue; }
      // ... and the stomach then drains through the short gastric veins into the splenic vein (the Warren shunt's selective decompression); otherwise they are shut.
      if (!p.dsrs && e.id === 'V_STO_SG') { this.G[k] = 0; continue; }
      this.G[k] = 1 / R;
    }
  }

  /** A shunt's conductance with the stretch of vein it drains through (this.through) in series: unchanged while the vein is open (the open stretch is
   *  in the shunt's own tract term, stent-geom.js), the stretch's extra resistance from a clot or a stenosis added, none when the vein is occluded. */
  shuntOutlet(g, [kv, share], visc) {
    const o = this.occlusion(EDGES[kv].id);
    if (o <= 0) return g;
    const sf = stenosisFactor(o);
    return sf === Infinity ? 0 : 1 / (1 / g + share * this.Rbase[kv] * visc * (sf - 1));
  }

  occlusion(id) {
    const v = partOf(id);   // (a vein split in pieces by a shunt joining it part-way along: a clot or a stenosis on it is on every piece)
    const s1 = this.params.stenosis[v] || 0, s2 = this.params.thrombus[v] || 0;
    return 1 - (1 - s1) * (1 - s2);
  }

  /**
   * The flow of each virtual piece of a split vein (topology.js JUNCTIONS), from the one the engine solved and the blood the shunts take from the
   * junctions or give to them: the flow past a junction is the flow before it plus what the shunts joined there bring (net into the junction), so
   * blood is conserved at every junction exactly. Written into Q (which the filtered flows follow) and nothing else.
   */
  fillJunctionFlows() {
    const Q = this.Q;
    for (const c of this.jx) {
      const n = c.ks.length;
      const net = (i) => { let s = 0; for (const [k, sg] of c.taps[i]) s += sg * Q[k]; return s; };
      for (let i = c.lead; i < n - 1; i++) Q[c.ks[i + 1]] = Q[c.ks[i]] + net(i);
      for (let i = c.lead - 1; i >= 0; i--) Q[c.ks[i]] = Q[c.ks[i + 1]] - net(i);
    }
  }
  /** The pressure at each junction node: the model's pressure at the end of the vein its shunts are joined at, a hair off it on the side the stretch between
   *  the two runs downhill (above it where blood runs from the junction to the end, below it where it runs from the end to the junction), so the stretch has no drop
   *  of its own and blood runs downhill through it whichever way it runs: the order every blend and dye pass visits nodes in (blood.js byPressure). */
  fillJunctionPressures(P = this.P, Q = this.Q) {
    for (const c of this.jx) {
      const toEnd = c.end === 'to', k = c.ks[c.lead], at = toEnd ? this.edgeT[k] : this.edgeF[k], n = c.nodes.length;
      // Walk in from the model's end: each stretch's two ends differ by a hair on the side its flow runs from (a stretch's flow runs from its `from` end to its `to` end when positive).
      if (toEnd) {
        let p = P[at];
        for (let i = n - 1; i >= 0; i--) { const q = Q[c.ks[i + 1]]; p += (q > 1e-9 ? 1 : q < -1e-9 ? -1 : 0) * JUNCTION_HAIR; P[c.nodes[i]] = p; }
      } else {
        let p = P[at];
        for (let i = 0; i < n; i++) { const q = Q[c.ks[i]]; p -= (q > 1e-9 ? 1 : q < -1e-9 ? -1 : 0) * JUNCTION_HAIR; P[c.nodes[i]] = p; }
      }
    }
  }
  /** The same for the shown pressures (Pf) from the shown flows (Qf): a junction's shown pressure is set from the sign of the shown flow beside it, not
   *  averaged from the instants' hairs (a stretch whose flow swings across zero with the beat averaged them to noise, so the order the lenses visit the
   *  nodes in, by pressure, flipped from frame to frame against the shown flow's direction: the origin and first-pass colours flickered, 15 Nov 2026). */
  fillShownJunctionPressures() { if (this.Pf && this.Qf) this.fillJunctionPressures(this.Pf, this.Qf); }

  // ───────────────────────── integration ─────────────────────────
  /** One implicit (backward-Euler, Picard-linearized) step of dt seconds. */
  step(dt) {
    const N = this.N, A = this.A, b = this.b, P = this.P, p = this.params;
    this._drug = this.drugEffects();
    if (!this._sub) { this.easeStep(dt); this.carryVolume(dt); this.pregnancyVolume(dt); }
    const hs = this.heartState();
    this.hr = hs.hr;
    this.cyc = (this.cyc || 0) + dt * hs.hr / 60;
    const tNew = this.t + dt;
    this.computeExt(tNew);
    this.computeG(P);

    // Heart pump RA → AO, linearized about the pressures at the start of the step
    const RA = this.ni.RA, AO = this.ni.AO;
    let m = 1;
    if (this.pulsing()) {
      const ph = this.phase();
      m = fillShape(ph) + p.tr * 1.2 * (fillShape(ph) - systoleShape(ph));
    }
    const [Qh0, dQh0] = heartFlow(P[RA] - this.ext[RA], hs.cap, P[RA] - this.ext[this.ni.SVC]);
    const Qh = Qh0 * m, dQh = dQh0 * m;
    // With the beat on, the aorta takes the ventricle's ejection (a flow source, lvEject) rather than the pump's flow at the same instant.
    const ej = this.pulsing() ? this.lvEject(Qh0, hs.hr) : -1;
    const a0 = Qh - dQh * P[RA];
    // Bleeding sink
    let gb = 0, bi = -1;
    if (this.bleed.active) {
      bi = this.ni[this.bleed.site];
      if (P[bi] - this.ext[bi] > 0) gb = this.bleed.G;
    }
    // Infusions (mL/s) into upper-body veins
    let inf = 0;
    for (const f of this.infusions) inf += f.rate;
    const UP = this.ni.UPPV;

    // A diode (valved vein) is shut, its conductance × 0.002, while its gradient runs backwards. It takes its state from
    // the gradient at the start of the step; when the solved gradient disagrees (the flow reverses within the step), the
    // step is solved again with the new state, at most three solves, so the valve does not chatter open and shut on
    // alternate steps.
    const G0 = this._G0 || (this._G0 = new Float64Array(this.E)), shut = this._shut || (this._shut = new Uint8Array(this.E));
    G0.set(this.G);
    for (const k of this.diodes) shut[k] = P[this.edgeF[k]] < P[this.edgeT[k]] ? 1 : 0;
    const P0 = this._P0 || (this._P0 = new Float64Array(N)), Pit = this._Pit || (this._Pit = new Float64Array(N));
    for (let pass = 0; ; pass++) {
      A.fill(0);
      for (let i = 0; i < N; i++) {
        const [Pk, Ps] = this.nodeK[i];
        const C = this.nodeC[i] * this.liverStiff(i);
        const ptm = ptmOf(this.V[i], C, Pk, Ps);
        P0[i] = this.ext[i] + ptm;
        const Ci = complianceAt(ptm, C, Pk, Ps);
        this.Cn[i] = Ci;
        A[i * N + i] = Ci / dt;
        b[i] = (Ci / dt) * P0[i];
      }
      for (let k = 0; k < this.E; k++) {
        let g = G0[k];
        if (g === 0) continue;
        const f = this.edgeF[k], t = this.edgeT[k];
        if (shut[k]) g *= 0.002;
        this.G[k] = g;
        if (this.wf[k]) {
          const up = this.wf[k] > 0 ? f : t, dn = up === f ? t : f, x = this.wfx[k], w = this.wfw[k], gc = g * w, go = g * (1 - w) * this.wfo[k];
          A[up * N + up] += gc; b[up] += gc * x;
          A[dn * N + up] -= gc; b[dn] -= gc * x;
          if (go > 0) { A[f * N + f] += go; A[t * N + t] += go; A[f * N + t] -= go; A[t * N + f] -= go; }
          continue;
        }
        A[f * N + f] += g; A[t * N + t] += g;
        A[f * N + t] -= g; A[t * N + f] -= g;
      }
      A[RA * N + RA] += dQh; b[RA] -= a0;
      if (ej >= 0) b[AO] += ej;
      else { A[AO * N + RA] -= dQh; b[AO] += a0; }
      if (gb > 0) { A[bi * N + bi] += gb; b[bi] += gb * this.ext[bi]; }
      b[UP] += inf;

      solve(A, b, N);
      if (pass === 2) break;
      let flip = false;
      for (const k of this.diodes) {
        const s = b[this.edgeF[k]] < b[this.edgeT[k]] ? 1 : 0;
        if (s !== shut[k]) { shut[k] = s; flip = true; }
      }
      if (!flip) break;
      // Re-linearize the vessel conductances about the solved pressures for the next solve.
      Pit.set(b); this.computeG(Pit); G0.set(this.G);
    }
    // A long quiet step (settling, 5 to 10 s) that carries a vein across its collapse point, the downstream end falling
    // below or rising above the pressure outside it, can overshoot the far side and flip back on the next step: a
    // cycle that never settles (a tense belly, from ascites or late pregnancy, holds the hepatic veins at that edge).
    // When the solved step sends a vein back to the state it had the step before, the step is taken again as half-second
    // steps, which follow the vein across. (The pregnancy volume step above stands for the whole step.)
    const flips = this.quiet && dt > 0.5 && !this._sub && this.collapseFlips(b);
    this.wfPrev.set(this.wf);
    if (flips) {
      this.cyc -= dt * hs.hr / 60;
      const n = Math.ceil(dt / 0.5);
      this._sub = true;
      try { for (let i = 0; i < n; i++) this.step(dt / n); } finally { this._sub = false; }
      return;
    }
    const Pn = b;

    // Flows & volume update (exactly conservative)
    const net = this._net || (this._net = new Float64Array(N));
    net.fill(0);
    for (let k = 0; k < this.E; k++) {
      const g = this.G[k];
      const f = this.edgeF[k], t = this.edgeT[k];
      let q;
      if (this.wf[k]) {
        const w = this.wfw[k];
        q = (this.wf[k] > 0 ? g * (Pn[f] - this.wfx[k]) : -g * (Pn[t] - this.wfx[k])) * w;
        if (w < 1) q += g * (1 - w) * this.wfo[k] * (Pn[f] - Pn[t]);
      } else q = g * (Pn[f] - Pn[t]);
      this.Q[k] = q;
      net[f] -= q; net[t] += q;
    }
    this.fillJunctionFlows();
    const qh = a0 + dQh * Pn[RA];
    this.Qheart = qh;
    net[RA] -= qh;
    if (ej >= 0) { net[AO] += ej; this.lvStep(qh, ej, dt); } else net[AO] += qh;
    let qb = 0;
    if (gb > 0) { qb = Math.max(0, gb * (Pn[bi] - this.ext[bi])); net[bi] -= qb; }
    this.Qbleed = qb;
    net[UP] += inf;

    for (let i = 0; i < N; i++) {
      this.V[i] += dt * net[i];
      const [Pk, Ps] = this.nodeK[i];
      P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i] * this.liverStiff(i), Pk, Ps);
    }
    this.fillJunctionPressures();

    // Blood accounting
    // (In rbc's units, RED: whole blood leaves at the healthy-marrow hematocrit, and a unit's cells count over the marrow's share.)
    const hct = this.hctEq();
    if (qb > 0) { this.blood.lost += qb * dt; this.blood.rbc -= qb * dt * hct; this.bleed.total += qb * dt; }
    for (const f of this.infusions) {
      const v = Math.min(f.remaining, f.rate * dt);
      f.remaining -= v;
      this.blood.rbc += v * f.hct / this.marrow();
      this.blood.infused += v;
    }
    this.infusions = this.infusions.filter((f) => f.remaining > 1e-6);
    this.infusions.forEach((f) => { if (f.remaining < f.rate * dt) f.rate = f.remaining / dt; });

    this.t = tNew;
    this.controllers(dt);
    if (!this.quiet) this.fastProcesses(dt);
    if (this.pulsing()) this.trackPulsatility();
    else if (this.lv) this.lv.gap += dt;
  }

  pulsing() { return (this.params.pulsatile || this.beat) && !this.quiet; }

  /** Whether solved pressures Pn put any open vein on the other side of its collapse point (computeG's waterfall test). */
  collapseFlips(Pn) {
    const EDGE_BAND = 1;
    for (const k of this.veins) {
      if (this.G[k] === 0) continue;
      const f = this.edgeF[k], t = this.edgeT[k], x = this.vx[k];
      const up = Pn[f] >= Pn[t] ? f : t, dn = up === f ? t : f;
      const w = Pn[dn] - x < 0 && Pn[up] - x > 0.5 ? (up === f ? 1 : -1) : 0;
      if (w !== this.wf[k] && w === this.wfPrev[k]) return true;
      // (A vein that sits within a mmHg of its collapse point is at that edge whichever side the step left it: a long step carries it across and a
      // shorter one back, three or four steps to the cycle, so the sos patient with 2 L of ascites never settled to one number. It is stepped by halves.)
      if (Math.abs(Pn[dn] - x) < EDGE_BAND && Pn[up] - x > 0.5) return true;
    }
    return false;
  }

  liverStiff(i) {
    const k = NODES[i].kind;
    return (k === 'liver') ? 1 - 0.6 * this.params.cirrhosis : 1;
  }

  /** The flow (mL/s) the ventricle ejects into the aorta at this moment of the beat: the stroke volume it filled over the last beat, by
   *  systoleShape. The first beat (or the first after quiet steps, a slider's relax or the disease clock) starts the lungs at the pump's
   *  flow and the ventricle at the stroke volume that flow gives, and keeps what the two hold, so the blood is conserved. */
  lvEject(Qmean, hr) {
    let lv = this.lv;
    const ph = this.phase();
    if (!lv || lv.gap > 0.5) {
      const sv = Qmean * 60 / hr;
      lv = this.lv = { vp: lv?.vp || 0, vv: lv?.vv || 0, y: Qmean, sv, fill: ph * sv, lastPh: ph, hi: -Infinity, lo: Infinity, sbp: NaN, dbp: NaN, beats: 0, gap: 0 };
    }
    lv.gap = 0;
    lv.ej = lv.sv * hr / 60 * systoleShape(ph);
    return lv.ej;
  }
  /** One step of the lungs and the ventricle: the pump's flow `qh` in, the lungs' outflow (a first-order store, ARTERY.lungTau) fills the
   *  ventricle, `ej` leaves it. At each new beat the filling becomes the next stroke volume, and the beat's peak (at the root, with Zc)
   *  and trough of the aortic pressure become its systolic and diastolic. */
  lvStep(qh, ej, dt) {
    const lv = this.lv, y = lv.y, P = this.P[this.ni.AO];
    lv.vp += (qh - y) * dt; lv.vv += (y - ej) * dt; lv.fill += y * dt;
    lv.y += (qh - y) * (1 - Math.exp(-dt / ARTERY.lungTau));
    const root = P + ARTERY.Zc * ej;
    if (root > lv.hi) lv.hi = root;
    if (P < lv.lo) lv.lo = P;
    const ph = this.phase();
    if (ph < lv.lastPh) {
      lv.sv = lv.fill; lv.fill = 0;
      if (lv.beats++ > 0) { lv.sbp = lv.hi; lv.dbp = lv.lo; }
      lv.hi = -Infinity; lv.lo = Infinity;
    }
    lv.lastPh = ph;
  }
  /** Systolic and diastolic (mmHg) now: the last whole beat's while the beat runs, else the periodic Windkessel about the MAP (pulseOf),
   *  the stroke volume the pump's mean flow gives at this heart rate. */
  bpNow(out = { sbp: NaN, dbp: NaN }) {
    const lv = this.lv;
    if (this.pulsing() && lv && lv.gap === 0 && Number.isFinite(lv.sbp)) { out.sbp = lv.sbp; out.dbp = lv.dbp; return out; }
    const AO = this.ni.AO;
    let G = 0;
    for (let k = 0; k < this.E; k++) if (this.edgeF[k] === AO) G += this.G[k];
    const q = this.COf ?? this.Qheart ?? 83.3, C = this.nodeC[AO] * this.liverStiff(AO);
    return pulseOf(this.MAPf, q * 60 / this.hr, this.hr, C, G, ARTERY.Zc, out);
  }

  /** One bedside step of the shown readings (display-mean.js): the pressures, flows, outside pressures and the abdomen's pressure, each
   *  the mean over the last breath and beat, into Pf, Qf, extf and iapf. (The dead band is on the readings as they print, holdShown, not
   *  on Pf: two neighbouring nodes held at one rounding edge read no gradient between them, and the figure reads gradients from Pf.) Whenever something else wrote Pf or Qf since (a restore, a hidden copy's relax, the quiet steps' filters), the means start
   *  over from what they hold, so a change of patient or a slider's relax shows at once, as it did. */
  shownMean(dt) {
    const N = this.N, E = this.E, n = 2 * N + E + 2;   // (P, Q, ext, the IAP, and the portal vein's Doppler velocity: pvVm)
    let dm = this._dm;
    if (!dm || dm.n !== n) {
      dm = this._dm = new DisplayMean(n);
      this._dmIn = new Float64Array(n); this._dmP = new Float64Array(N); this._dmQ = new Float64Array(E);
    }
    const v = this._dmIn, Pf = this.Pf, Qf = this.Qf;
    const arrive = this._arrive; this._arrive = false;   // (a restored slide's state, at rest: restore)
    let same = dm.seeded && this.extf?.length === N;
    for (let i = 0; same && i < N; i++) same = Pf[i] === this._dmP[i];
    for (let k = 0; same && k < E; k++) same = Qf[k] === this._dmQ[k];
    if (!same) {
      v.set(Pf, 0); v.set(Qf, N);
      this.calmExt(v.subarray(N + E, N + E + N));
      v[n - 2] = this.iap - (this._swing?.iap || 0);
      v[n - 1] = this.pvVm ?? this.dopplerVelocity('PV_TRUNK');
      dm.seed(v, arrive ? BREATH_S + 60 / (this.hr || HR_REST) + 0.1 : 0);
      this.extf = Float64Array.from(v.subarray(N + E, N + E + N)); this.iapf = v[n - 2]; this._pvVshown = v[n - 1];
    }
    v.set(this.P, 0); v.set(this.Q, N); v.set(this.ext, N + E); v[n - 2] = this.iap; v[n - 1] = this.dopplerVelocity('PV_TRUNK');
    // (The beat's window is one beat long, 60 / the heart rate. The rate the baroreflex gives dithers by a tenth of a beat a minute at rest, and a window that long
    // changes by 0.15% with it, which on an aortic swing of ±25 mmHg is 0.05 mmHg of ripple in the shown mean: a rate with the dither filtered out, 5 s, keeps it still.)
    const hr = this.hr || HR_REST;
    this._hrw = !same || this._hrw == null ? hr : this._hrw + (hr - this._hrw) * Math.min(1, dt / 5);
    if (dm.add(v, dt, 60 / this._hrw)) {
      const o = dm.out;
      for (let i = 0; i < N; i++) Pf[i] = o[i];
      for (let k = 0; k < E; k++) Qf[k] = o[N + k];
      for (let i = 0; i < N; i++) this.extf[i] = o[N + E + i];
      this.iapf = o[n - 2];
      this._pvVshown = o[n - 1];
    }
    this.fillShownJunctionPressures();
    this._dmP.set(Pf); this._dmQ.set(Qf);
  }

  /** A reading as it prints, through the dead band at its precision (display-mean.js holdAt), kept by `key` between frames. Only while
   *  the bedside means run (shownMean): a model settled in quiet steps, a scratch copy or a test reads the value as it is. */
  holdShown(key, v, step = 0.1) {
    if (!this._dm?.seeded || this.quiet) { if (this._held) this._held[key] = v; return v; }
    const h = this._held ??= {};
    return (h[key] = holdAt(h[key], v, step));
  }

  /** A vessel's diameter as the figure draws it: from the shown pressures (shownMean), not this instant's, so a vein does not
   *  breathe on the screen. (diameter() itself, this instant's, is what the Doppler's velocity divides by.) */
  diameterShown(id) {
    return this.diameter(id, this.Pf || this.P, this.extf || this.ext, this.iapf ?? this.iap);
  }

  controllers(dt) {
    const p = this.params;
    // The shown pressures and flows (Pf, Qf: every readout and the figure read them). At the bedside, the mean over exactly one breath
    // and one beat (shownMean, display-mean.js); in the quiet steps of a settle, a relax or the disease
    // clock, which have no breath or beat to average, the first-order filters they always had (2.5 s and 1.5 s), so the days the
    // disease clock runs read the same as before.
    if (!this.Qf) this.Qf = Float64Array.from(this.Q);
    if (!this.Pf) this.Pf = Float64Array.from(this.P);
    if (this.quiet || !(dt > 0)) {
      const a = Math.min(1, dt / 1.5), ap = Math.min(1, dt / 2.5);
      for (let k = 0; k < this.E; k++) this.Qf[k] += (this.Q[k] - this.Qf[k]) * a;
      for (let i = 0; i < this.N; i++) this.Pf[i] += (this.P[i] - this.Pf[i]) * ap;
      if (this.extf?.length !== this.N) this.extf = new Float64Array(this.N);
      this.extf.set(this.ext); this.iapf = this.iap;
      this.fillShownJunctionPressures();
    } else this.shownMean(dt);
    this.varixRegrow(this.quiet ? Infinity : dt);
    // Portal flow and velocity averaged over a few breaths, so the readout's status does not
    // flicker as breathing swings the instantaneous velocity across a cut-off.
    // (At the bedside, the breath and beat means of shownMean, which take the breath out exactly; the 6 s filter let a 4 s breath through at
    // a tenth of its size, ±1 to 2 cm/s on the velocity tile. The quiet steps keep the filter.)
    const av = Math.min(1, dt / 6), kPV = this.ei.PV_TRUNK;
    if (!this.quiet && dt > 0 && this._dm?.seeded && Number.isFinite(this._pvVshown)) { this.pvQm = this.Qf[kPV]; this.pvVm = this._pvVshown; }
    else {
      this.pvQm = (this.pvQm ?? this.Q[kPV]) + (this.Q[kPV] - (this.pvQm ?? this.Q[kPV])) * av;
      const vPV = this.dopplerVelocity('PV_TRUNK');
      this.pvVm = (this.pvVm ?? vPV) + (vPV - (this.pvVm ?? vPV)) * av;
    }
    this.COf = (this.COf ?? this.Qheart) + (this.Qheart - (this.COf ?? this.Qheart)) * Math.min(1, dt / 2);
    this.MAPf += (this.P[this.ni.AO] - this.MAPf) * (dt / (2 + dt));
    // The vitals as the bar and Readouts show them, averaged over two breaths at every step: breathing swings the
    // cardiac output 5.6 to 7.1 and the MAP 91 to 96 in decompensated cirrhosis, and a screen's frames sample that too
    // sparsely to average it out themselves.
    // (Two 4 s stages: one leaves the output wandering ±0.07 L/min, right across its 6.5 cut-off in that patient.)
    // (The fifth is the esophageal varix's wall index: the breath swings the pressure around it by a third in schistosomiasis,
    // so the red-wale flag (events.js) reads this mean, as the vitals' flags do, and fires once.)
    // (The sixth and seventh are the systolic and diastolic, bpNow: the last whole beat's, or the Windkessel's about the MAP.)
    const bp = this.bpNow(this._bp || (this._bp = { sbp: NaN, dbp: NaN }));
    const vNow = [this.COf * 0.06, this.MAPf, this.hr, this.P[this.ni.RA], this.refP ? this.varix('VAR').ratio : NaN, bp.sbp, bp.dbp], av4 = Math.min(1, dt / 4);
    if (!this.vitM || !this.vitM.every(Number.isFinite)) { this.vitM = vNow; this.vitM1 = [...vNow]; }
    else for (let i = 0; i < vNow.length; i++) { this.vitM1[i] += (vNow[i] - this.vitM1[i]) * av4; this.vitM[i] += (this.vitM1[i] - this.vitM[i]) * av4; }
    const def = this.volumeDeficit();
    const mapSet = this.mapSetOf();
    const bt = clamp(1 + 4 * (mapSet - this.MAPf) / mapSet, 0.5, 2.5);
    this.baro += (bt - this.baro) * Math.min(0.25, dt / (15 + dt));
    // The buffer response answers the portal inflow averaged over several breaths (two 5 s stages, qpm), not each instant's: the liver's
    // inlet flow swings by about half its mean with every beat and breath, and a deficit read beat by beat (and floored at zero, as a
    // surplus does not constrict) dilated the artery on the ripple alone, with the mean portal flow normal (healthy with the heartbeat
    // on: HA flow 402 to about 495 mL/min, habr 1.29; Mohammad, 13 Nov 2026, the hepatic artery's Doppler).
    const Qp = this.portalInflowMean(dt);
    const kh = 2.0 * (1 - 0.5 * p.cirrhosis) * p.habrStrength;
    const ht = 1 + kh * clamp((this.Qpref - Qp) / this.Qpref, 0, 1);
    this.habr += (ht - this.habr) * Math.min(0.3, dt / (10 + dt));
    // Venous reservoir (see RESERVOIR): eases toward its share of the deficit, a soft limit at max, and gives the
    // blood back as the volume is replaced.
    const R = RESERVOIR, vaso = clamp((1 - this.slow.splTone) / 0.45, 0, 1);
    const want = R.k * (1 - R.cirr * vaso) * def, target = want / Math.pow(1 + Math.pow(want / R.max, 4), 0.25);
    const ds = (target - (this.blood.shift || 0)) * Math.min(1, dt / R.tau);
    if (Math.abs(ds) > 1e-9) {
      this.blood.shift = (this.blood.shift || 0) + ds;
      for (const id of ['UPPV', 'LOWV']) this.shiftVolume(id, ds / 2);
    }
  }

  /** Pregnancy's extra venous filling (PREGNANCY.stressed), eased in or out as the gestation changes: the body's own
   *  volume, so the reflexes reset to it (blood.preg: the mL added so far). */
  pregnancyVolume(dt) {
    const want = PREGNANCY.stressed * pregnancyLevel(this.params.gestation), now = this.blood.preg || 0;
    if (want === now) return;
    const dv = Math.abs(want - now) < 0.01 ? want - now : (want - now) * Math.min(1, dt / PREGNANCY.tau);
    this.addVolume(dv, HCT_BASE * 0.7, true);
    this.blood.preg = now + dv;
  }

  /** Blood volume missing against the patient's own (mL, never negative): what the bleeding reflexes respond to. */
  volumeDeficit() { return Math.max(0, (this.blood.ref ?? BLOOD_BASE) - this.bloodVolume()); }

  portalInflow() {
    return Math.max(0, this.Q[this.ei.PRE_R]) + Math.max(0, this.Q[this.ei.PRE_L]);
  }
  /** The portal inflow averaged over several breaths (two first-order stages of 5 s each), advanced by dt: what the buffer response reads. */
  portalInflowMean(dt) {
    const q = this.portalInflow(), a = Math.min(1, dt / 5);
    if (!this.qpm || !Number.isFinite(this.qpm[1])) this.qpm = [q, q];
    else { this.qpm[0] += (q - this.qpm[0]) * a; this.qpm[1] += (this.qpm[0] - this.qpm[1]) * a; }
    return this.qpm[1];
  }

  /** Processes on the hemodynamic clock: bleeding, clotting, rupture hazard, ascites trickle. */
  fastProcesses(dt) {
    const p = this.params;
    this.plasmaRefill(dt);
    // Ascites (mL/min → per dt)
    const as = this.starling();
    this.ascitesProtein(as, dt / 60);
    this.slow.ascites = Math.max(0, this.slow.ascites + (as.net * dt) / 60);
    // Bleeding / clot
    if (this.bleed.active) {
      const i = this.ni[this.bleed.site];
      const ptm = this.P[i] - this.ext[i], slack = ptm < 9;
      if (slack) this.bleed.clot += dt; else this.bleed.clot = Math.max(0, this.bleed.clot - dt * 0.5);
      if (this.bleed.clot > 45) this.stopBleed('clot');
      // The tube's gastric balloon, up and drawn against the cardia, presses a tear shut (the esophageal balloon, filled only on top of it,
      // does the same). Its pressure outweighs the varix's at once (the bleed's flow is nil from the first step, see the sink in the solve),
      // so the tear stays open only for the time the tube needs to go in and the balloon to fill; lifted or outweighed before that (the
      // varix still taut past the clot's own limit), the count starts over.
      else if (gastricUp(p) && slack) {
        this.bleed.press = (this.bleed.press || 0) + dt;
        if (this.bleed.press >= BALLOON_SEAL_S) this.stopBleed('balloon');
      } else if (this.bleed.press) this.bleed.press = 0;
    } else if (p.bleeding) {
      for (const site of ['VAR', 'GV']) {
        const x = this.varix(site).ratio;
        if (x <= 1) continue;
        if (p.deterministicRupture) { this.rupture(site, 0.6); break; }
        const hDay = ruptureHazardPerDay(x);
        if (this.rng() < hDay * dt / 86400) { this.rupture(site, 0.4 + 0.5 * this.rng()); break; }
      }
    }
    if (this.valsalva.until > 0 && this.t > this.valsalva.until) this.valsalva.until = -1;
  }

  trackPulsatility() {
    const ph = this.phase();
    const v = this.velocity('PV_TRUNK');
    if (ph < this.pi.lastPh) {
      const vmax = this.pi.vmax, vmin = this.pi.vmin;
      this.pi.value = Math.abs(vmax) > 0.5 ? clamp((vmax - vmin) / Math.max(Math.abs(vmax), 1e-6), 0, 3) : 0;
      this.pi.vmax = -Infinity; this.pi.vmin = Infinity;
    }
    this.pi.vmax = Math.max(this.pi.vmax, v);
    this.pi.vmin = Math.min(this.pi.vmin, v);
    this.pi.lastPh = ph;
  }

  /** Relax to quasi-steady state (no respiration, no pulsatility). */
  // Relaxation steps are a numerical device, not elapsed physiological time: the clock is restored.
  settle(n = 1) {
    const q = this.quiet, t = this.t, cyc = this.cyc; this.quiet = true;
    const sched = [[0.02, 10], [0.2, 15], [2, 20], [10, 30]];
    for (let r = 0; r < n; r++) for (const [dt, k] of sched) for (let i = 0; i < k; i++) this.step(dt);
    this.quiet = q; this.t = t; this.cyc = cyc;
  }
  /** A slide's state with a transfusion in it is the transfusion DONE: the units run in over 10 to 15 minutes of model time, which the settle's 343 s does
   *  not cover, so a state handed to the page with units still dripping went on moving for minutes after it landed (eight units: the portal pressure
   *  26 → 35 mmHg, the systolic pressure +10; ENG-1 of 19 Nov 2026). Quiet 10 s steps until every infusion has run out, then the settle again. */
  finishInfusions() {
    if (!this.infusions.length || this.bleed.active) return;   // (a bleed under way is a process: its slide shows it going on, and the quiet steps would run it on for ten more minutes)
    const q = this.quiet, t = this.t, cyc = this.cyc; this.quiet = true;
    for (let i = 0; i < 200 && this.infusions.length; i++) this.step(10);
    this.quiet = q; this.t = t; this.cyc = cyc;
    this.settle();
  }
  /** A few quiet relaxation steps that leave the clock alone, so a live change reaches its steady state in about a second
   *  while the Doppler and tracings keep sweeping at real time (the arterial buffer alone takes half a minute of model time). */
  relax(dt = 0.5, n = 3) {
    const q = this.quiet, t = this.t, cyc = this.cyc; this.quiet = true;
    for (let i = 0; i < n; i++) this.step(dt);
    this.quiet = q; this.t = t; this.cyc = cyc;
  }
  /** relax() on a hidden copy of this model, this one taking only how far the copy moved: its volumes shifted by as much
   *  as the copy's, its slow reflexes and averaged readings set to the copy's. A live change (a slider dragged, a button)
   *  settles in about a second while this model's beat runs on untouched. (Relaxing this model itself, once a tick,
   *  flattens its beat every time and the restart jolts the flow: a comb of spikes in the Doppler for as long as a slider
   *  moves.) The copy is taken on the first call and followed until relaxDone(). It neither bleeds nor runs infusions:
   *  this model does those at the bedside clock. */
  relaxHidden() {
    let h = this._hidden;
    if (!this._hiddenOn) {
      h = this._hidden ??= new Engine({ params: this.params });
      h.restore(this.snapshot());
      // (Restoring starts the copy's averages over from this instant of the beat: it takes this model's own instead.)
      h.Pf = Float64Array.from(this.Pf || this.P); h.Qf = Float64Array.from(this.Qf || this.Q);
      Object.assign(h, { COf: this.COf, pvQm: this.pvQm, pvVm: this.pvVm, qpm: this.qpm && [...this.qpm], vitM: this.vitM && [...this.vitM], vitM1: this.vitM1 && [...this.vitM1] });
      h._paramsOf = null;
      this._hiddenOn = true;
    }
    // (The copy takes a change easing in on this model at once: it is where the change settles.)
    const to = this._ease?.to ?? this.params;
    if (h._paramsOf !== to) { h.setParams(to); h._paramsOf = to; }
    // The copy holds this model's blood (what bled or was given since the last call, and the accounts the reflexes read).
    let dv = 0;
    for (let i = 0; i < this.N; i++) dv += this.V[i] - h.V[i];
    h.shiftVolume('UPPV', dv);
    h.blood = structuredClone(this.blood);
    h.bleed = { ...h.bleed, active: false }; h.infusions = [];
    const V0 = h._V0 ??= new Float64Array(this.N);
    V0.set(h.V);
    h.relax();
    // (Eased in over the next tick's steps, not all at once: see carryVolume.)
    const c = this._carry ??= { dV: new Float64Array(this.N), left: 0 };
    for (let i = 0; i < this.N; i++) c.dV[i] += h.V[i] - V0[i];
    c.left = CARRY_S;
    // (The venous reservoir and a pregnancy moved blood in the copy: those volumes come across with the rest, their accounts here.)
    for (const k of ['shift', 'preg', 'ref', 'rbc', 'own']) if (h.blood[k] !== undefined) this.blood[k] = h.blood[k];
    for (const k of ['baro', 'habr', 'MAPf', 'COf', 'pvQm', 'pvVm']) this[k] = h[k];
    this.qpm = h.qpm && [...h.qpm];
    if (this.Pf) this.Pf.set(h.Pf);
    if (this.Qf) this.Qf.set(h.Qf);
    if (h.vitM) { this.vitM = [...h.vitM]; this.vitM1 = [...h.vitM1]; }
  }
  relaxDone() { this._hiddenOn = false; }
  /** The volumes relaxHidden moved, added a share at each step over CARRY_S (one tick of the worker), so a tick's
   *  move reaches the beat as a ramp rather than a step. */
  carryVolume(dt) {
    const c = this._carry;
    if (!c || !(c.left > 0)) return;
    const f = Math.min(1, dt / c.left);
    for (let i = 0; i < this.N; i++) {
      const d = c.dV[i] * f;
      if (!d) continue;
      const [Pk, Ps] = this.nodeK[i];
      this.V[i] += d; c.dV[i] -= d;
      this.P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i] * this.liverStiff(i), Pk, Ps);
    }
    c.left -= dt;
    if (!(c.left > 0)) { c.dV.fill(0); c.left = 0; }
  }
  /** mL added to (or taken from) one node, its pressure following. */
  shiftVolume(id, mL) {
    const i = this.ni[id], [Pk, Ps] = this.nodeK[i];
    this.V[i] += mL;
    this.P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i], Pk, Ps);
  }
  settleQuick() {
    const q = this.quiet, t = this.t, cyc = this.cyc; this.quiet = true;
    for (let i = 0; i < 10; i++) this.step(5);
    this.quiet = q; this.t = t; this.cyc = cyc;
  }

  // ───────────────────────── disease clock ─────────────────────────
  advanceDays(n, { noRupture = false, silent = false } = {}) {
    const steps = this.advanceDaySteps(n, { noRupture, silent });
    let next;
    do { next = steps.next(); } while (!next.done);
    return next.value;
  }

  /** Time-lapse below one day per tick: slow remodeling advances by a fraction of a day; events and rupture risk
   * are evaluated for the fraction (hazard scaled to it), and the day counter ticks on each whole day. */
  advanceFraction(f) {
    const out = { ruptured: false };
    this.settleQuick();
    this.slowStep(f);
    this.dayFrac = (this.dayFrac || 0) + f;
    while (this.dayFrac >= 1 - 1e-9) { this.dayFrac -= 1; this.day += 1; }
    detectEvents(this);
    this.rollRupture(f, out);
    return out;
  }

  rollRupture(days, out) {
    if (!this.params.bleeding || this.bleed.active) return;
    for (const site of ['VAR', 'GV']) {
      const x = this.varix(site).ratio;
      if (x <= 1) continue;
      const hDay = this.params.deterministicRupture ? Infinity : ruptureHazardPerDay(x);
      if (this.rng() < 1 - Math.exp(-hDay * days)) { this.rupture(site, 0.4 + 0.5 * this.rng()); out.ruptured = true; break; }
    }
  }

  *advanceDaySteps(n, { noRupture = false, silent = false } = {}) {
    const out = { ruptured: false };
    for (let d = 0; d < n; d++) {
      this.settleQuick();
      this.slowStep(1);
      this.day += 1;
      if (!silent) detectEvents(this);
      if (!noRupture) this.rollRupture(1, out);
      if (out.ruptured) break;
      yield this.day;
    }
    this.settleQuick();
    return out;
  }

  slowStep(days) {
    const p = this.params, P = this.P, s = this.slow;
    // A meal lasts hours: the slow organs (the spleen, the collaterals, the ascites, the blood volume) do not follow its pressures. A meal slide plays
    // its ramp over "8 days" (circuit, doppler), and without this the cirrhotic patient's spleen, varix and belly moved with it (doc 4.6, 8 Nov 2026).
    if (p.meal > 0) return;
    // Collateral remodeling (§7.4): diameter relaxes toward a pressure-driven target.
    for (const k of this.collaterals) {
      const e = EDGES[k];
      let driver = this.routeExcess(e.route);
      if (isOccluded(p, e.id)) driver = 0;
      const dMin = dMinOf(e);
      const frac = clamp((driver - (e.open ?? COLLATERAL.open)) / COLLATERAL.span, 0, 1);
      const target = dMin + (e.dMax - dMin) * Math.sqrt(frac);
      const d = s.d[e.id];
      const tau = target > d ? COLLATERAL.tauGrow : COLLATERAL.tauRegress;
      s.d[e.id] = clamp(d + (target - d) * Math.min(1, days / tau), dMin, e.dMax);
    }
    // Varix size rises with the portosystemic gradient at once and falls from it over weeks (VARIX.tauFall; see varixTarget).
    for (const site of ['VAR', 'GV']) {
      const raw = this.varixGrown(site), h = s.vRest[site];
      s.vRest[site] = h == null || raw >= h || this.varixCut(site) ? raw : raw + (h - raw) * Math.exp(-days / VARIX.tauFall);
    }
    // (Its grade's held size, holdVarices, remodels toward it over about two months of the disease clock, then is let go.)
    if (s.vHold) for (const site of ['VAR', 'GV']) {
      const h = s.vHold[site]; if (h == null) continue;
      const now = 2 * this.varix(site).r, next = h + (now - h) * Math.min(1, days / VARIX.tauRegress);
      s.vHold[site] = next - now < 0.05 ? null : next;
    }
    if (s.vCut != null) {   // the esophageal varices a Warren shunt cut off shrink toward the size the pressure now sets (VARIX.tauCut)
      const to = this.varixTarget('VAR', this.Pf || this.P, true), next = s.vCut + (to - s.vCut) * Math.min(1, days / VARIX.tauCut);
      s.vCut = next - to < 0.03 ? null : next;
    }
    if (this.bands > 0) this.bands = Math.max(0, this.bands - 0.02 * days); // bands slough; columns can recur
    // Spleen
    // Venous back-pressure from the right heart (raised IVC) congests the spleen far less than a portal block:
    // congestive hepatopathy rarely causes splenomegaly or more than mild thrombocytopenia.
    const advanced = clamp((p.cirrhosis - RELAX.advLow) / (RELAX.advHigh - RELAX.advLow), 0, 1);
    const spTarget = clamp(11 + 0.5 * Math.max(0, P[this.ni.SPL] - 12 - 0.6 * Math.max(0, P[this.ni.IVCS] - 5)), 9, 22);
    s.spleen += (spTarget - s.spleen) * (spTarget < s.spleen ? 1 - Math.exp(-days / (RELAX.spleenBase + RELAX.spleenExtra * advanced)) : Math.min(1, days / RELAX.spleenBase));   // (the slow fall by the exact exponential, so a long step and many short ones agree)
    { const target = this.params.splenicRx === 1 ? SPLEEN_INFARCT.share : 0, was = s.spInf || 0; s.spInf = was + (target - was) * (1 - Math.exp(-days / SPLEEN_INFARCT.tauDays)); }   // (the infarcted share of the spleen: SPLEEN_INFARCT)
    // Chronic splanchnic vasodilation & plasma expansion (hyperdynamic circulation)
    const ppg = P[this.ni.CONF] - P[this.ni.IVCS];
    const x = clamp((ppg - 6) / 14, 0, 1);
    const toneT = 1 - 0.45 * x;
    s.splTone += (toneT - s.splTone) * (toneT > s.splTone ? 1 - Math.exp(-days / (RELAX.toneBase + RELAX.toneExtra * advanced)) : Math.min(1, days / RELAX.toneBase));
    const volT = 700 * x;
    const dv = (volT - s.volExtra) * Math.min(1, days / RELAX.toneBase);
    if (Math.abs(dv) > 0.01) { s.volExtra += dv; this.addVolume(dv, HCT_BASE * 0.7, true); }
    // Red cells (RED): the anemia of liver disease follows the disease, and the red cell mass follows the marrow's set point
    // (a loss made up over weeks, transfused cells cleared as they age); the plasma refills over the day.
    s.marrow = this.marrow() + (this.marrowTarget() - this.marrow()) * Math.min(1, days / RED.marrowDays);
    const b = this.blood, own = this.ownRbc();
    if (b.rbc !== own) b.rbc += (own - b.rbc) * Math.min(1, days / (own > b.rbc ? RED.upDays * (1 + p.cirrhosis) : RED.downDays));
    this.plasmaRefill(days * 86400);
    // The lymphatics remodel toward (but never fully match) the chronic demand, and level off at their most (LYMPH).
    const st = this.starling();
    const capT = Math.min(LYMPH.max, LYMPH.base + LYMPH.adaptFrac * Math.max(0, st.made - LYMPH.base));
    s.lymphCap += (capT - s.lymphCap) * (1 - Math.exp(-LYMPH.adapt * days));   // (by the exact exponential, so a long step and many short ones agree)
    this.ascitesProtein(st, 1440 * days);
    // A day's step can carry the fluid past the volume where it balances (the net turns with the volume and the belly's
    // pressure: drained by diuretics, refilled when nearly empty), and the next step back past it, so the volume would
    // swing every day. A step that crosses the balance is taken implicitly instead (the volume whose own net, over the
    // day, leads back to where it started), which settles without swinging.
    const a0 = s.ascites, iap0 = this.iap ?? 5, ia0 = iapFromAscites(a0), dt = 1440 * days;
    const netAt = (a) => { s.ascites = a; this.iap = iap0 + iapFromAscites(a) - ia0; return this.starling().net; };
    const a1 = clamp(a0 + st.net * dt, 0, 18000);
    if (a1 !== a0 && netAt(a1) * st.net < 0) {
      let lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (m - a0 - netAt(m) * dt < 0) lo = m; else hi = m; }
      s.ascites = (lo + hi) / 2;
    } else s.ascites = a1;
    this.iap = iap0;
    // Anticoagulation slowly lyses thrombus
    if (p.anticoag) {
      for (const k of Object.keys(p.thrombus)) {
        p.thrombus[k] = Math.max(0, p.thrombus[k] - 0.006 * days);
        if (p.thrombus[k] === 0) delete p.thrombus[k];
      }
    }
  }

  /**
   * Working diameter of a collateral (mm): the largest of
   *  - its remodeled size (slow.d: weeks of growth under a sustained gradient, disease clock);
   *  - an acute, passive opening of the pre-existing channel as the gradient across its route rises
   *    (up to COLLATERAL.acute of the full range; 0, since collaterals and a cavernoma take weeks to
   *    form and they grow on the disease clock; only a clotted portal trunk opens the small
   *    pre-existing bypass veins a little, COLLATERAL.acuteClot, which holds the portal vein near 30 mmHg);
   *  - full size for a spontaneous shunt that is present (an anatomical variant, not remodeled).
   * The result is recorded in slow.dEff so the figure draws what the model conducts.
   */
  // (P: the pressures the route's excess is read at. The physics step reads the instant's (this.P); a shown diameter (diameter(id, Pf)) reads the shown means,
  // so a collateral that opens with the gradient (the acute clot's, which opens on a span of a few mmHg) holds still at rest instead of swinging with the beat:
  // the acute PVT's C1a/C1b shown diameters swung 8% every 7 s, so the worker posted 6 states a second for ever, 17 Nov 2026.)
  collateralD(e, P = this.P) {
    let d = this.slow.d[e.id];
    if (e.spontaneous) d = e.dMax;
    else if (this.refP) {
      const dMin = dMinOf(e);
      const frac = clamp((this.routeExcess(e.route, P) - (e.open ?? COLLATERAL.open)) / COLLATERAL.span, 0, 1);
      const acute = e.acute ?? (this.params.thrombus.PV_TRUNK > 0.5 ? COLLATERAL.acuteClot : COLLATERAL.acute);
      d = Math.max(d, dMin + (e.dMax - dMin) * acute * Math.sqrt(frac));
    }
    // The short/posterior gastric veins feed the fundal varices that the gastrorenal shunt
    // drains: this feeder is only as open as the shunt is.
    if (e.id === 'C2') {
      const g = EDGES[this.ei.C5], gMin = dMinOf(g), gd = Math.max(this.slow.d.C5, (this.slow.dEff || {}).C5 ?? 0);
      d = Math.max(d, dMinOf(e) + (e.dMax - dMinOf(e)) * clamp((gd - gMin) / (g.dMax - gMin), 0, 1));
    }
    if (P === this.P) (this.slow.dEff ||= {})[e.id] = d;   // (what the C2 feeder reads: the step's own, not a shown reading's)
    return d;
  }

  /** Gradient between two nodes in excess of the healthy gradient (mmHg). */
  routeExcess([a, b], P = this.P) {
    const i = this.ni[a], j = this.ni[b];
    return (P[i] - P[j]) - (this.refP[i] - this.refP[j]);
  }

  /** Starling filtration & lymph balance, mL/min; protein in g/dL. `shown`: the screen's reading, from the pressures averaged over one
   *  breath and beat (Pf, iapf: shownMean), so the lymph and its protein hold still at rest; the hemodynamic clock's integration of the
   *  ascites (fastProcesses) reads this instant's, which its sum over time averages out. (The sinusoidal and abdominal pressures swing with
   *  the breath, and the lymph was read off them as they swung: 0.5 to 1.1 mL/min in a healthy liver, the protein 86 to 91 %.) */
  starling(shown = false) {
    const p = this.params, P = shown && this.Pf ? this.Pf : this.P, s = p.cirrhosis;
    const iap = (shown ? this.iapf : undefined) ?? this.iap ?? 5;
    const pic = 25 * (p.albumin / 4.0);
    // How capillarized the sinusoid wall is: as the cirrhosis has it, less the share of its closed pores opened again (fenestrae,
    // a what-if: the pores opened in the same liver, its scar and resistance unchanged). A number at both ends, so a change eases.
    const shut = s * (1 - clamp(p.fenestrae ?? 0, 0, 1));
    const sigH = 0.1 + 0.5 * shut;
    const pMid = 0.6 * (0.7 * P[this.ni.SIN_R] + 0.3 * P[this.ni.CV_R]) + 0.4 * (0.7 * P[this.ni.SIN_L] + 0.3 * P[this.ni.CV_L]);
    const pT = tissueP(iap);
    // Formation (LYMPH): the liver's from the sinusoids' net filtration pressure, never below its healthy rate; the gut's beyond its basal lymph.
    const pull = sinusoidPull(p.albumin, sigH), splOf = (t) => LYMPH.kfSpl * Math.max(0, (P[this.ni.INT] - t) - 0.9 * (pic - 10));
    const hep = hepLymphOf(pMid - pT, pull), spl = splOf(pT);
    const cap = this.slow.lymphCap, made = hep + spl, carried = Math.min(made, cap);
    const excess = made - carried;
    const V = this.slow.ascites;
    const bulk = V > 0 ? Math.min(PERIT.bulk, V * PERIT.bulkL) + PERIT.kIap * (iapFromAscites(V) - 5) : 0;
    const water = p.diuretics && V > 0 ? Math.min(PERIT.waterMax, V * PERIT.waterL) : 0;
    const reabs = bulk + water;
    const net = excess - reabs;
    // Protein: what crosses each bed (sieving by the wall's reflection coefficient, more complete the faster
    // the filtration), then the overflow's mix of liver and gut lymph.
    const alb = p.albumin, glob = 3 + 0.8 * s;          // plasma, g/dL (globulins rise in cirrhosis)
    const sA = PROT.sigHep0 + PROT.sigHepCirr * shut, sG = Math.min(0.95, sA + PROT.sigGlob);
    const jg = spl + PROT.gutBase, gA = sieve(PROT.sigGut, jg, PROT.psGut), gG = sieve(Math.min(0.97, PROT.sigGut + 0.05), jg, PROT.psGut);
    const hA = sieve(sA, hep, PROT.psHep) * alb, hG = sieve(sG, hep, PROT.psHep) * glob;
    const wH = PROT.hepWeep * hep, wS = jg;
    const inAlb = (wH * hA + wS * gA * alb) / (wH + wS), inGlob = (wH * hG + wS * gG * glob) / (wH + wS);
    const prot = { sigma: sA, alb, glob, hepAlb: hA, hepTP: hA + hG, lymphProt: (hA + hG) / (alb + glob), inAlb, inGlob };
    this.flows = { hep, spl, carried, excess, reabs, bulk, water, prot };
    const ascAlb = this.slow.ascAlb ?? inAlb, ascTP = ascAlb + (this.slow.ascGlob ?? inGlob);
    return { hep, spl, made, carried, cap, net, excess, bulk, water, prot, ascAlb, ascTP, saag: alb - ascAlb, highProtein: ascTP >= 2.5 };
  }

  /**
   * Peritoneal protein balance over dtMin minutes. Overflow lymph brings protein in; the peritoneal
   * lymphatics take fluid back whole (no change in concentration), while diuretic-driven reabsorption takes
   * mostly water. At a steady volume that settles at C = C_in · inflow / (inflow − σ·water); the fluid
   * relaxes toward it as fast as it turns over (stable on the one-day clock too).
   */
  ascitesProtein(st, dtMin) {
    const s = this.slow, V = s.ascites, { excess: q, water, prot } = st;
    if (V + q * dtMin < 1) { s.ascAlb = s.ascGlob = null; return; }
    const conc = q > 0 ? q / Math.max(q - PROT.sigPerit * water, 0.25 * q) : 1 / 0.25;
    const k = V < 1 ? 1 : Math.min(1, ((q + st.bulk + water) * dtMin) / V);
    const relax = (c, cin, cap) => { const t = Math.min(cap, cin * conc); return c == null ? t : c + (t - c) * k; };
    s.ascAlb = relax(s.ascAlb, prot.inAlb, 0.95 * prot.alb);
    s.ascGlob = relax(s.ascGlob, prot.inGlob, 0.95 * prot.glob);
  }

  // ───────────────────────── actions ─────────────────────────
  addVolume(mL, hct = 0, silentPlasma = false) {
    const i = this.ni.UPPV;
    this.V[i] += mL;
    const [Pk, Ps] = this.nodeK[i];
    this.P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i], Pk, Ps);
    // Silent plasma is the body's own volume changing (the chronic plasma expansion): the reflexes reset to it, and its red cells are the
    // patient's own (RED: counted as a healthy marrow holds them). Red cells given are counted at the anemic marrow's rate (rbc's units).
    this.blood.rbc += silentPlasma ? mL * hct : mL * hct / this.marrow();
    if (!silentPlasma) this.blood.infused += mL;
    else { this.blood.ref = (this.blood.ref ?? BLOOD_BASE) + mL; if (this.blood.own != null) this.blood.own += mL * hct; }
  }

  infuse(kind) {
    const spec = {
      crystalloid: { vol: 250, hct: 0, dur: 900 },   // 1 L, ~25 % stays intravascular
      prbc: { vol: 300, hct: 0.6, dur: 600 },
      albumin: { vol: 400, hct: 0, dur: 900 },
      plasma: { vol: 250, hct: 0, dur: 900 },
    }[kind];
    if (!spec) return;
    this.infusions.push({ kind, rate: spec.vol / spec.dur, remaining: spec.vol, hct: spec.hct });
    if (kind === 'albumin') this.params.albumin = Math.min(4.5, this.params.albumin + 0.25);
  }

  hemorrhage(mL) {
    // Instant external blood loss (for tests / scenarios)
    const hct = this.hctEq();
    const per = mL / 2;
    for (const id of ['UPPV', 'LOWV']) {
      const i = this.ni[id];
      this.V[i] -= per;
      const [Pk, Ps] = this.nodeK[i];
      this.P[i] = this.ext[i] + ptmOf(this.V[i], this.nodeC[i], Pk, Ps);
    }
    this.blood.rbc -= mL * hct;
    this.blood.lost += mL;
  }

  rupture(site, tear = 0.6) {
    this.bleed = { active: true, site, G: 0.25 * tear, clot: 0, press: 0, total: 0, tear, t0: this.t, day: this.day };
    this.pushEvent({ id: 'VARIX_RUPTURE', severity: 'critical', title: site === 'VAR' ? 'Esophageal varix ruptured' : 'Gastric varix ruptured', anchor: site });
  }

  stopBleed(reason) {
    if (!this.bleed.active) return;
    const site = this.bleed.site;
    this.bleed = { active: false, site: null, G: 0, clot: 0, total: this.bleed.total };
    this.pushEvent({ id: 'BLEED_STOPPED', severity: 'ok', title: reason === 'band' ? 'Bleeding controlled by banding' : reason === 'balloon' ? 'Bleeding controlled by balloon tamponade' : 'Bleeding stopped (clot formed)', anchor: reason === 'balloon' ? site : 'VAR' });
  }

  band() {
    this.bands = Math.min(4, this.bands + 1);
    if (this.slow.vHold) this.slow.vHold.VAR = null;   // (banding grades the varix by what the bands left: no held size)
    if (this.bleed.active && this.bleed.site === 'VAR') this.stopBleed('band');
  }

  paracentesis(mL, albumin) {
    const removed = Math.min(mL, this.slow.ascites);
    this.slow.ascites -= removed;
    if (albumin) this.params.albumin = Math.min(4.5, this.params.albumin + 0.3 * removed / 5000);
    else if (removed > 5000) {
      // Post-paracentesis circulatory dysfunction: effective hypovolemia
      this.hemorrhageSilent(0.12 * (removed - 5000));
      this.pushEvent({ id: 'PICD', severity: 'caution', title: 'Post-paracentesis circulatory dysfunction', anchor: 'PERITONEUM' });
    }
    return removed;
  }
  hemorrhageSilent(mL) { const l = this.blood.lost; this.hemorrhage(mL); this.blood.lost = l; this.blood.held = (this.blood.held || 0) + mL; }

  startValsalva(sec = 10) { this.valsalva = { start: this.t, until: this.t + sec }; }

  /** How far the strain has built, 0 to 1 (1 is the Valsalva's 30 mmHg of chest and belly pressure): it rises over STRAIN_RISE s while held and, once
   *  let go (a hold's `rel`) or timed out (`max`), falls back over STRAIN_FALL s. The timed 10 s strain (startValsalva) has neither and stops at its end. */
  strainLevel(t = this.t) {
    const v = this.valsalva;
    if (!(t < v.until)) return 0;
    const rel = v.rel >= 0 ? v.rel : v.max > 0 && t >= v.max ? v.max : -1;
    const held = rel >= 0 ? rel : t;
    return Math.min(1, Math.max(0, held - v.start) / STRAIN_RISE) * (rel >= 0 ? Math.max(0, 1 - (t - rel) / STRAIN_FALL) : 1);
  }
  /** A momentary strain (a deck slide's hold-to-strain button): on starts it and holds it, off lets go and it falls back over STRAIN_FALL s. A hold
   *  lets go by itself after STRAIN_MAX s, as nobody holds a strain for long. Pressed again on the way down, it rises from where it is. */
  holdStrain(on) {
    const v = this.valsalva, t = this.t, held = v.max > 0 && t < v.max && !(v.rel >= 0);
    if (on) {
      if (held) return;
      this.valsalva = { start: t - this.strainLevel(t) * STRAIN_RISE, until: t + STRAIN_MAX + STRAIN_FALL, max: t + STRAIN_MAX, rel: -1 };
    } else if (held) this.valsalva = { start: v.start, until: t + STRAIN_FALL, max: v.max, rel: t };
  }

  pushEvent(ev) {
    const e = { ...ev, t: this.t, day: this.day, key: `${ev.id}-${this.eventCount++}` };
    this.newEvents.push(e);
    this.eventLog.push(e);
    if (this.eventLog.length > 200) this.eventLog.shift();
  }

  // ───────────────────────── measurement helpers ─────────────────────────
  diameter(id, P = this.P, ext = this.ext, iap = this.iap) {
    const k = this.ei[id], e = EDGES[k];
    if (e.kind === 'collateral') {
      const f = this.edgeF[k], t = this.edgeT[k];
      const a = 0.5 * (tubeArea(P[f] - ext[f], 0.08) / tubeArea(this.refP[f], 0.08) + tubeArea(P[t] - ext[t], 0.08) / tubeArea(this.refP[t], 0.08));
      const present = edgePresent(e, this.params);
      return present && !isOccluded(this.params, e.id) ? this.collateralD(e, P) * Math.sqrt(a) : 0;
    }
    if (e.kind === 'shunt') {
      if (e.shunt === 'tips') return this.params.tips.on ? this.params.tips.d : 0;
      if (e.shunt === 'dips') return this.params.dips.on ? this.params.dips.d : 0;
      if (e.shunt === 'custom') return this.params.customShunts?.[e.id] || 0;
      return this.G[k] > 0 ? (e.d || 3) : 0;
    }
    const base = e.d || 3;
    if (e.kind !== 'vein' && e.kind !== 'diode') return base;
    const f = this.edgeF[k], t = this.edgeT[k];
    const x = this.extFor(this.edgeExt[k], ext, iap);
    const a = 0.5 * (tubeArea(P[f] - x) / tubeArea(this.Pbase[f]) + tubeArea(P[t] - x) / tubeArea(this.Pbase[t]));
    return base * Math.sqrt(a) * Math.sqrt(1 - this.occlusion(id) * 0.9);
  }

  /** Mean velocity (cm/s), signed. */
  /** A stent's hydraulics as they stand (stent-geom.js): its flow (mL/s, smoothed as the readouts are), the pressure across it (mmHg,
   *  portal end less systemic end), its open and waist mean velocities (cm/s), and the pressure each part takes (mmHg: tract, wall with
   *  waistWall its waist's share, entry, jet, inlet, total), written into `out`; null when the stent is not open. The sibling cards,
   *  tiles and curves read this, so the model's split and theirs cannot differ. */
  stentState(id, out = null) {
    const k = this.ei[id], e = EDGES[k], kind = kindOf(e);
    if (!kind || !(this.G[k] > 0)) return null;
    const p = this.params, d = kind === 'tips' ? p.tips.d : kind === 'dips' ? p.dips.d : p.customShunts?.[id];
    if (!(d > 0)) return null;
    const o = out || { parts: {}, geom: {} };   // alloc-rare: a reader that brings no record (a test, the compare request); the tick brings its own
    const q = this.Qf ? this.Qf[k] : this.Q[k], P = this.Pf || this.P, s = this.occlusion(id);
    const g = geomOf(p, id, kind, o.geom || (o.geom = {})), su = END_U[endSiteOf(p, id)], r = stentParts(kind, d, q, this.viscosity(), s, g, o.parts || (o.parts = {}), su);   // alloc-rare: a record brought without them, once
    for (const f of ['tract', 'wall', 'waistWall', 'entry', 'jet', 'inlet', 'jetEnd', 'jetWaist', 'wallEnd', 'wallWaist', 'total']) r[f] *= q;
    const A = Math.PI * (d / 10) * (d / 10) / 4;
    // (Its two narrowings, stent-geom.js: the end stenosis `end` at its end `site`, the waist `red` mid stent. s, dWaist and vWaist are the
    // narrowest lumen of the two, as the Narrowest lumen tile and the jet read it.)
    const n = Math.max(s, g.red || 0);
    o.kind = kind; o.d = d; o.end = s; o.red = g.red || 0; o.site = endSiteOf(p, id); o.s = n; o.dWaist = d * (1 - n); o.q = q; o.flow = q * 0.06;
    // The lesion kinds (17 Nov 2026, the external review's "intentional reduction"): the waist is a reduction made on purpose (against encephalopathy, a
    // constrained stent), the end stenosis is dysfunction. o.lesion names what the stent has ('none', 'stenosis', 'reduction' or 'both'); o.gateKind
    // what each Doppler gate (proximal, mid, distal) reads a jet from ('stenosis', 'reduction' or null), so a deliberate reduction's jet reads as intended.
    const hasS = s > 0.004, hasR = o.red > 0.004, gk = o.gateKind || (o.gateKind = [null, null, null]);   // alloc-rare: made with the record
    o.lesion = hasS && hasR ? 'both' : hasR ? 'reduction' : hasS ? 'stenosis' : 'none';
    gk[0] = hasS && o.site === 'proximal' ? 'stenosis' : null; gk[1] = hasR ? 'reduction' : null; gk[2] = hasS && o.site === 'distal' ? 'stenosis' : null;
    o.dp = P[this.edgeF[k]] - P[this.edgeT[k]];
    o.vOpen = q / A; o.vWaist = n > 0 ? q / (A * (1 - n) * (1 - n)) : q / A;
    // The three Doppler points as the scanner reads them (the card's own numbers, stentReadsOf: the open stent's mean × dopplerK at each gate, the
    // narrowing's jet where the waist lies) and the highest of them, the stent's peak velocity: the tile and the Doppler cannot differ.
    const peaks = o.peaks || (o.peaks = [0, 0, 0]);   // alloc-rare: made with the record
    stentReadsOf(p, id, Math.abs(q) / (Math.PI * (this.diameter(id) / 10) * (this.diameter(id) / 10) / 4) * dopplerK(e), peaks);
    // A stent that has almost stopped (flow-cuts.js stentStillHeld, with its memory in the record so a flow hovering at the cut-off does not flip it) is
    // stopped everywhere: no flow, no velocity at any gate or at the waist, no friction or jet (the pressure across it, dp, is held by the blockage, not
    // lost to flow). This record is the one rule: the vessel card's Stasis, the Doppler, the tiles, the side view, the trace and the loss bar read it
    // (play-test 17 Nov 2026: 0 cm/s on the card, 29 at the waist on the Along view and "Stasis" turning "Patent" at an 88 % stenosis).
    o.still = stentStillHeld(q, o.still === true);
    if (o.still) {
      peaks[0] = 0; peaks[1] = 0; peaks[2] = 0; o.vOpen = 0; o.vWaist = 0; o.q = 0; o.flow = 0;
      for (const f of ['tract', 'wall', 'waistWall', 'entry', 'jet', 'inlet', 'jetEnd', 'jetWaist', 'wallEnd', 'wallWaist', 'total']) r[f] = 0;
    }
    o.vPeak = Math.max(peaks[0], peaks[1], peaks[2]);
    // (The record is one descriptor of one moment, for a card to pin whole (external review, 17 Nov 2026): its geometry (geom, d, end, red, site), its
    // readings, the direction of its flow (dir: 1 portal to systemic, −1 reversed, 0 stopped; the parts are signed with the flow, so a reversed
    // stent's parts and dp are both negative), the raw residual of its pressure split (resid: dp less the parts' sum, mmHg, signed; the smoothed
    // pressures and flow are not one instant, so it is small but not 0 while the patient moves, and 0 once settled) and the patient's revision.)
    o.dir = o.still ? 0 : q < 0 ? -1 : 1; o.resid = o.still ? 0 : o.dp - r.total; o.rev = this.paramsRev | 0;
    // The same stent on a bench: the flow (L/min) it would carry with a fixed BENCH_DP across it and no patient behind it (the tube-alone line of the Tests card's curves).
    o.bench = benchFlow(kind, d, this.viscosity(), s, g, BENCH_DP, su) * 0.06;
    return o;
  }

  velocity(id) {
    const k = this.ei[id], e = EDGES[k];
    const q = e.lobar ? this.lobarFlow(k) : this.Q[k];
    // A lumped bundle (e.g. the jejunal and ileal veins) is drawn at one vein's width but its flow
    // reaches the probe through a wider trunk: vd is the diameter the probe sees.
    const d = Math.max(0.5, this.diameter(id) * (e.vd ? e.vd / e.d : 1)) / 10; // cm
    return q / (Math.PI * d * d / 4);
  }

  /** The flow (mL/s) in a lobar hepatic artery (topology lobar: A_HR, A_HL): its lobe's arteriolar flow plus its share of the flow filling
   *  the hepatic arterial tree's compliance (the HA node's: what the common hepatic artery brings in less what leaves the node). The two
   *  lobes' shares, by their arteriolar flow, add up to the common hepatic artery's flow at every instant; over a beat the filling averages out. */
  lobarFlow(k) {
    // (The two lobes, with their shunts, add up to the common hepatic artery's flow at every instant.)
    const HA = this.ni.HA;
    let qin = 0, qart = 0, qout = 0;
    for (let j = 0; j < this.E; j++) {
      if (this.edgeT[j] === HA) qin += this.Q[j];
      else if (this.edgeF[j] === HA) { qout += this.Q[j]; if (EDGES[j].lobar) qart += Math.abs(this.Q[j]); }
    }
    const share = qart > 1e-9 ? Math.abs(this.Q[k]) / qart : 0;
    const ap = this.ei[EDGES[k].lobar];   // (the lobe's arterioportal shunt, intrahepatic: it leaves the tree past the lobar artery)
    return this.Q[k] + (ap != null ? this.Q[ap] : 0) + share * (qin - qout);
  }

  /** Doppler velocity (cm/s), signed: the time-averaged peak of the spectrum (see dopplerK). */
  dopplerVelocity(id) {
    return this.velocity(id) * dopplerK(EDGES[this.ei[id]]);
  }

  /** A varix that was obliterated (BRTO or coils) and is open again regrows to the size the pressure sets over about VARIX.tauReopen
   *  seconds of model time, instead of taking it in one frame (16 Nov 2026: BRTO switched off took the fundal varices from none to Large with red wale
   *  signs at once). It is 0 while closed and 1 once regrown; the quiet steps of a settle and the disease clock take it at once. */
  varixRegrow(dt) {
    const g = this.vGrow || (this.vGrow = { VAR: 1, GV: 1 });
    for (const site of ['VAR', 'GV']) g[site] = this.varixObliterated(site) ? 0 : Math.min(1, g[site] + dt / VARIX.tauReopen);
  }

  /** The radius (mm) of a varix at the current gradient. It follows the gradient as it changes (smoothed over a few
   *  seconds by the display-filtered pressures), up to a ceiling that grows over weeks with the coronary vein; banding shrinks it until the bands slough.
   *  A rise is at once; a fall waits for the wall to remodel (VARIX.tauFall, slow.vRest). */
  varixTarget(site, P = this.Pf || this.P, noKeep = false) {
    // Both kinds of varix follow the portosystemic pressure gradient above its healthy value, the same quantity
    // that recruits collaterals (see routeExcess): the portal-to-systemic drop for esophageal varices (portal
    // pressure above the right atrium it drains to; no varices below an HVPG-like gradient of ~10, large ones
    // from ~12-14, very large above ~20) and splenic vein to IVC for fundal ones. Absolute venous pressure
    // grows nothing: in right heart failure or constriction the whole bed is high and the gradient is nil.
    // Portal pressure, not the pressure inside the varix, because the collaterals themselves drop it as they
    // open and the size must not fall away as they do.
    // (A Warren shunt ties the coronary vein off the portal vein: nothing of the portal pressure reaches the esophageal varices then, so they follow
    // the pressure of their own feeding vein, the stomach's, which drains through the short gastric veins to the renal vein.)
    // Fundal varices exist only where a gastrorenal shunt can drain them.
    // Isolated fundal varices (IGV1) have no esophageal varices beside them, until BRTO closes their shunt.
    // BRTO plugs that shunt and its short gastric feeder and obliterates the varices with it: they shrink back to a
    // resting vein even though the splenic-to-caval gradient that sized them climbs once the shunt is closed. EUS-guided coils and
    // glue cast the varix itself (the feeder, C2, closed with the shunt left open): it too is obliterated, whatever the gradient.
    // (Coils in the coronary vein, C1a, take the esophageal varices' feeder: the portal pressure no longer reaches them, so they too shrink back, whatever the gradient.)
    // (Esophageal varices are collaterals too, so they take weeks to form: varixGrown caps their size by how far the coronary
    // vein feeding them has remodeled on the disease clock, none at the onset of an acute block. Fundal varices ride
    // on a gastrorenal shunt that is present from birth, so they are not capped.)
    const grown = this.varixGrown(site, P);
    // A fall in the pressure waits for the wall (VARIX.tauFall); a varix that has been closed off does not.
    const held = this.varixCut(site) ? null : this.slow.vRest?.[site];
    const rest = held != null && held > grown ? held : grown;
    const open = this.vGrow ? this.vGrow[site] : 1;   // (regrowing after a closure: varixRegrow; a smoothstep, so it starts and lands without a corner)
    const regrown = open >= 1 ? rest : VARIX.r0Healthy + (rest - VARIX.r0Healthy) * open * open * (3 - 2 * open);
    const r = site === 'VAR' ? VARIX.r0Healthy + (regrown - VARIX.r0Healthy) * Math.pow(0.6, this.bands) : regrown;
    // A Warren shunt drops the pressure in them at once, but the wall took weeks to build and takes months to go: they stay as they were,
    // slack under the low pressure (varix: the radius follows the pressure across the wall), and shrink over about three months (vCutStep).
    // Most are small or gone by a year; shunt failure or a stenosis puts the pressure back and they swell again at once.
    const kept = site === 'VAR' && !noKeep ? this.slow.vCut : null;
    return kept != null && kept > r ? kept : r;
  }

  /** Whether the varix is closed off rather than relieved (the cases listed in varixTarget): it is then held at a resting vein whatever the gradient. */
  varixObliterated(site) {
    const p = this.params;
    return (site === 'GV' && (p.spontaneous.C5 === false || p.occluded.C5 || p.occluded.C2)) || (site === 'VAR' && ((p.isolatedGV && !p.occluded.C5) || !!p.occluded.C1a));
  }

  /** Whether the varix has been cut off from the pressure that sized it rather than relieved of some of it: closed off (varixObliterated), or the
   *  esophageal varices after a Warren shunt, whose coronary vein is tied off the portal vein. These do not wait for the wall (VARIX.tauFall). */
  varixCut(site) { return this.varixObliterated(site) || (site === 'VAR' && !!this.params.dsrs); }

  /** The radius (mm) the pressure alone gives a varix, before banding and before the lag on its fall (varixTarget). */
  varixGrown(site, P = this.Pf || this.P) {
    const p = this.params;
    const ex = site === 'VAR' ? this.routeExcess([p.dsrs ? 'LGV' : 'CONF', 'RA'], P) : this.routeExcess(['SV', 'IVCI'], P);
    const ex0 = this.varixObliterated(site) ? -1e9 : ex;
    // (Hepatic veins blocked, Budd–Chiari: the portal bed has outlets cirrhosis lacks, the caval, capsular and intrahepatic collaterals, so the gradient from the portal vein to the right atrium sizes an esophageal varix less than it does there: VARIX.kBlocked. Left whole, the cirrhosis rule gave an 11 mm varix and a wall stress three times the tear point, 16 Nov 2026.)
    const k = (site === 'GV' ? VARIX.kGV : VARIX.k) * (hvBlocked(p) ? VARIX.kBlocked : 1);
    return clamp(VARIX.r0Healthy + k * Math.max(0, ex0 - (site === 'GV' ? VARIX.openGV : VARIX.open)), VARIX.r0Healthy, VARIX.r0Healthy + this.varixMature(site) * (VARIX.rMax - VARIX.r0Healthy));
  }

  /** A vasoactive drug that lowers the portal pressure (a beta-blocker, terlipressin, octreotide) drops the varix's distending pressure within
   *  seconds, but the varix's wall took weeks to build and takes weeks to go (app review H5, 5 Nov 2026: Large regraded Small within about
   *  2.5 s). When one is started, the size the varix had is held for its grade (varixGraded), and slowStep lets that go on the disease clock.
   *  The drawn and measured diameter (varix, metrics varix.d) still follows the pressure at once, as the drawing of it is asked to. */
  holdVarices(prev, p) {
    // A Warren shunt cuts the esophageal varices' feeder (the coronary vein): the varices keep the size they had while the pressure in them falls (varixTarget).
    if (!prev.dsrs && p.dsrs) this.slow.vCut = this.varixTarget('VAR', this.Pf || this.P);
    else if (prev.dsrs && !p.dsrs) this.slow.vCut = null;   // (the feeder is open again: the pressure sizes them)
    const on = (q) => VASO_DRUGS.some((k) => !!q?.drugs?.[k]);
    const h = this.slow.vHold || (this.slow.vHold = { VAR: null, GV: null });
    if (!on(p)) { h.VAR = h.GV = null; return; }
    const started = VASO_DRUGS.some((k) => !!p.drugs?.[k] && !prev.drugs?.[k]);
    if (!started) return;
    for (const site of ['VAR', 'GV']) { const d = 2 * this.varix(site, this.Pf || this.P, 0, undefined, this.extf || this.ext).r; if (h[site] == null || d > h[site]) h[site] = d; }   // (with the params before the drug: its pressures are still those)
  }
  /** The diameter (mm) a varix is graded at: its diameter d now, or the size held since a drug was started, whichever is larger (holdVarices). */
  varixGraded(site, d) {
    const h = this.slow.vHold?.[site];
    return h != null && h > d ? h : d;
  }

  /** The arterial pressure the baroreflex defends in this patient: 93 mmHg, less the reset of the hyperdynamic circulation and of pregnancy (tone: the first only, which sets the gut's tone). */
  mapSetOf(tone = false) { return MAP_SET - MAP_DROP * clamp((1 - this.slow.splTone) / 0.45, 0, 1) - (tone ? 0 : PREGNANCY.mapDrop * pregnancyLevel(this.params.gestation)); }

  /** How far the channel feeding a varix has remodeled (0 at the onset of a block, 1 once established). */
  varixMature(site) {
    if (site === 'GV') return 1;
    if (this.params.isolatedGV && !this.params.occluded.C5) return 0;   // BRTO closes the shunt: esophageal varices can form
    const ch = EDGES[this.ei.C1a], chMin = dMinOf(ch);
    return clamp((this.slow.d.C1a - chMin) / (ch.dMax - chMin) / VARIX.mature, 0, 1);
  }

  /** The varix at the pressures P. air (mmHg) is the pressure of the air in the lumen round it, read view-only: it is taken off the pressure
   *  across the wall and so off the radius seen, and nothing else moves. It is never sent through the solver, which would collapse the varix
   *  and choke its own collateral (the balloon's way; HVPG 16.5 → 18.0 at 20 mmHg). r0: the resting radius, when a caller has it already. */
  varix(site, P = this.P, air = 0, r0 = this.varixTarget(site), ext = this.ext) {
    const i = this.ni[site];
    // (`ext` goes with `P`: the shown means of pressure and of the outside pressure, or this instant's of both. Pressure held at its mean under the breath's
    // swing of the intrathoracic and abdominal pressure made the drawn and printed diameter swing with every breath, 16 Nov 2026.)
    const ptm = P[i] - ext[i] - air;
    const ref = this.refP ? this.refP[i] : this.Pbase[i];
    // The vein swells with the pressure above its own resting level, not with a rise shared by the whole venous
    // bed: central venous pressure above its baseline (right heart failure, constriction) lifts every vein
    // together and is not a varix, so it is taken off the distending pressure. The wall stress below still
    // uses the full transmural pressure.
    const ra = this.ni.RA, raRise = Math.max(0, P[ra] - (this.refP ? this.refP[ra] : this.Pbase[ra]));
    // A vein that has not yet remodeled into a varix is not distended into one either.
    const r = r0 * (1 + this.varixMature(site) * (Math.sqrt(tubeArea(ptm - raRise, 0.08) / tubeArea(ref, 0.08)) - 1));
    const w = Math.max(0.12, VARIX.w0 / r0) * (site === 'GV' ? 1.4 : 1);
    const T = Math.max(0, ptm) * r / w;
    // (ratioShown: the stress index as the tiles show it (wall-read.js), over the tear point, so every percentage printed agrees with the index beside it.)
    return { ptm, r, r0, w, T, ratio: T / VARIX.Tcrit, ratioShown: wallIndex(ptm, r, w) / VARIX.Tcrit };
  }

  /** The diameter (mm) a varix is seen at with 0, 1, … n − 1 mmHg of air in the lumen round it (varix above). The pressures are held. */
  varixAir(site, P = this.P, n = 21, ext = this.ext) {
    const r0 = this.varixTarget(site);
    return Array.from({ length: n }, (_, a) => 2 * this.varix(site, P, a, r0, ext).r);
  }

  hvpgTrue(P = this.P) {
    const lc = this.G[this.ei.WC_R], ll = this.G[this.ei.WL_R];
    const wh = (lc * P[this.ni.SIN_R] + ll * P[this.ni.CV_R]) / (lc + ll);
    return { whvp: wh, fhvp: P[this.ni.RHV], hvpg: wh - P[this.ni.RHV] };
  }

  /** The HVPG and free hepatic vein pressure this liver would read without its beta-blocker, for the stiffness (metrics.lsm).
   *  A beta-blocker lowers the gradient through the portal inflow and the sinusoidal tone, not the scarring, and liver
   *  stiffness does not follow the fall (AASLD 2024 p. 1189: no role for LSM in judging the HVPG response to NSBB). `hv` is
   *  the reading as it stands (hvpgTrue); with no beta-blocker on it comes back unchanged. Otherwise a copy of this model,
   *  the beta-blockers off and everything else as it is, is settled and read. The copy is taken again only when the
   *  state it depends on changes (the params but the drugs, the day, the blood, the slow state), and at most every
   *  half second of model time while a change eases in; in between, the last difference is carried on the live reading,
   *  so the number moves smoothly while a slider is dragged. */
  hvNoBlocker(hv) {
    const dr = this.params.drugs;
    if (!dr?.propranolol && !dr?.carvedilol) { this._nb = null; return hv; }
    const to = this._ease?.to ?? this.params, s = this.slow;
    const key = JSON.stringify([{ ...to, drugs: { ...to.drugs, propranolol: false, carvedilol: false }, seed: 0 }, this.day,
      Math.round(this.bloodVolume() / 10), Math.round(s.splTone * 1e3), Math.round(s.volExtra), Math.round(s.ascites / 50),
      Math.round(s.spleen * 10), this.bands > 0, this.iap != null ? Math.round(this.iap * 10) : null]);
    const nb = this._nb;
    if (!nb || (nb.key !== key && (!this._ease || this.t - nb.t >= 0.5 || this.t < nb.t))) {
      const h = this._nbTwin ??= new Engine({ params: this.params });
      h.restore(this.snapshot());
      h.setParams({ ...h.params, drugs: { ...h.params.drugs, propranolol: false, carvedilol: false } });
      h.bleed = { ...h.bleed, active: false }; h.infusions = [];
      h.settle();
      const t = h.hvpgTrue();
      this._nb = { key, t: this.t, dHvpg: t.hvpg - hv.hvpg, dFhvp: t.fhvp - hv.fhvp };
    }
    return { ...hv, hvpg: hv.hvpg + this._nb.dHvpg, fhvp: hv.fhvp + this._nb.dFhvp };
  }

  // ───────────────────────── snapshot ─────────────────────────
  /** `rest`: the state is a settled patient whose shown means have converged (a slide's), so the page's restore holds its readings still while the
   *  display windows refill (display-mean.js seed) instead of reading the first seconds' partial windows. */
  snapshot({ rest = false } = {}) {
    return structuredClone({
      params: this.paramsTarget(), V: Array.from(this.V), P: Array.from(this.P), Q: Array.from(this.Q), t: this.t, day: this.day,
      baro: this.baro, MAPf: this.MAPf, habr: this.habr, hr: this.hr, slow: this.slow, blood: this.blood,
      cyc: this.cyc || 0, COf: this.COf, qpm: this.qpm,   // (qpm: the buffer response's averaged portal inflow, portalInflowMean) (EXT-ENG-1: the beat's phase and the cardiac-output filter belong to the moment too)
      lv: this.lv,   // (the lungs' and ventricle's share of the beat, lvStep)
      bleed: this.bleed, infusions: this.infusions, bands: this.bands, rng: this.rng.state(), iap: this.iap,
      valsalva: this.valsalva, evState: this.evState,
      // (The shown readings, the means over the last breath and beat: a restored moment reads as it did, not as this instant's swing.)
      Pf: this.Pf ? Array.from(this.Pf) : null, Qf: this.Qf ? Array.from(this.Qf) : null, iapf: this.iapf,
      // (and the slow means the vitals and the portal flow read, with the shown ones: a restore that started them over from this instant's beat put 1 to 4 s of swing on the MAP, the pressures and the portal flow)
      vitM: this.vitM ? [...this.vitM] : null, vitM1: this.vitM1 ? [...this.vitM1] : null, pvQm: this.pvQm, pvVm: this.pvVm,
      ...(rest ? { rest: true } : {}),
    });
  }
  restore(s) {
    const c = structuredClone(s);
    this.params = deepMerge(defaultParams(), c.params);
    this.V.set(c.V); this.P.set(c.P); if (c.Q) this.Q.set(c.Q);
    Object.assign(this, { t: c.t, day: c.day, baro: c.baro, MAPf: c.MAPf, habr: c.habr, hr: c.hr, slow: c.slow, blood: c.blood,
      bleed: c.bleed, infusions: c.infusions, bands: c.bands, iap: c.iap, valsalva: c.valsalva || { until: -1, start: -1 }, evState: c.evState || {} });
    // EXT-ENG-1: the moment's own beat phase and cardiac-output filter. A snapshot made before they were kept has neither: the beat then starts
    // at phase 0 and the filter at the first step's output, not the later moment's values this engine happened to hold.
    this.cyc = Number.isFinite(c.cyc) ? c.cyc : 0; this.COf = Number.isFinite(c.COf) ? c.COf : undefined;
    this.lv = c.lv || null;
    this.evAvg = null; this.evStart = null;   // (the events' breath average, events.js, starts over from the restored state, which is not a patient settling in)
    this.vGrow = { VAR: 1, GV: 1 };   // (a restored state shows its varices as they were: varixRegrow)
    this.rng.setState(c.rng);
    // A snapshot from before the bleeding reflexes: the volume it holds is the patient's own.
    if (!(this.blood.ref > 0)) Object.assign(this.blood, { ref: this.bloodVolume(), inf0: this.blood.infused || 0, shift: 0 });
    // (One from before the red cells' clocks (RED): its patient's own red cell mass, worked out as it was then.)
    if (this.blood.own == null) this.blood.own = this.ownRbc();
    this.slow.vRest ||= { VAR: null, GV: null };   // (one from before the varix's lag on its fall (VARIX.tauFall) starts it at the size the pressure gives)
    this.Pf = Float64Array.from(c.Pf?.length === this.N ? c.Pf : this.P);
    this.Qf = Float64Array.from(c.Qf?.length === this.E ? c.Qf : this.Q);
    this.iapf = Number.isFinite(c.iapf) && c.Pf?.length === this.N ? c.iapf : undefined;
    this._held = null;   // (the readings' dead band, holdShown, starts over with the shown means)
    this.pvQm = Number.isFinite(c.pvQm) ? c.pvQm : undefined; this.pvVm = Number.isFinite(c.pvVm) ? c.pvVm : undefined;
    this.vitM = Array.isArray(c.vitM) && Array.isArray(c.vitM1) ? [...c.vitM] : null; this.vitM1 = this.vitM ? [...c.vitM1] : undefined;
    this._arrive = !!c.rest;
    this.qpm = Array.isArray(c.qpm) ? [...c.qpm] : null;   // (one from before it was kept starts it at this moment's inflow)
    this._hiddenOn = false; this._carry = null; this._ease = null;   // (a hidden copy being relaxed, and what it moved, belonged to the state before)
    this._drug = this.drugEffects();
    this.computeExt(this.t);
    this.computeG(this.P);
  }
}

function solve(A, b, n) {
  // inline import to keep hot path monomorphic
  return solveInPlace(A, b, n);
}
import { solveInPlace } from '../core/linalg.js';
import { wallIndex } from './wall-read.js';

export { SPLANCHNIC_ARTERIES, PORTOSYSTEMIC_EDGES };
