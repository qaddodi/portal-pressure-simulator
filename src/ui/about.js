// The short, plain-language explanation every card opens with: what the structure is, then what
// is happening to it in this patient right now (reversed flow, a clot, a collateral opening). The
// first sentence is fixed; the rest is read from the live model.

import { EDGES, NODES, dMinOf } from '../engine/topology.js';
import { fmt, clamp } from './util.js';
import { LABEL_VESSEL } from './anatomy.js';
import { judgeFlow } from './velNormal.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

const VESSEL = {
  V_INT: 'Drain the small bowel, carrying absorbed nutrients toward the liver.',
  V_COL: 'Drain the colon into the inferior mesenteric vein.',
  V_IMV: 'Drains the left colon and rectum into the splenic vein. Its rectal branches meet systemic veins: a portosystemic crossroads.',
  SV_MID: 'The splenic vein midway, where a splenorenal shunt leaves it.',
  V_SPL: 'Drains the spleen. Portal hypertension causes congestive splenomegaly.',
  V_STO: 'Drain the stomach toward the coronary vein.',
  SMV_CONF: 'Carries blood from the small bowel and right colon: the largest share of portal inflow.',
  SV_CONF: 'Carries splenic, gastric and (via the IMV) left colonic venous blood to the portal confluence.',
  LGV_CONF: 'The coronary vein: drains the stomach into the portal vein. In portal hypertension it reverses and feeds esophageal varices.',
  PV_TRUNK: 'Formed behind the pancreas by the superior mesenteric and splenic veins; supplies about three quarters of hepatic blood flow, at low pressure.',
  PVH_R: 'The portal vein’s branch to the right lobe, which takes most of the portal flow.',
  PVH_L: 'The portal vein’s branch to the left lobe; the paraumbilical vein leaves it.',
  CAUD: 'Short veins from the caudate lobe straight into the IVC: they are spared in hepatic vein occlusion, so the caudate lobe hypertrophies in Budd–Chiari syndrome.',
  RHV_IVC: 'Drains the right lobe into the IVC just below the heart. A balloon catheter wedged here measures the WHVP for the HVPG.',
  MHV_IVC: 'Drains the middle of the liver into the IVC.',
  LHV_IVC: 'Drains the left lobe into the IVC.',
  IVC_IS: 'The inferior vena cava below the liver: returns blood from the legs, kidneys and pelvis.',
  IVCS_RA: 'The last stretch of the IVC into the right atrium: right atrial pressure is transmitted to the hepatic veins through it.',
  ILI_IVC: 'The iliac veins joining to form the IVC.',
  LRV_IVC: 'The left renal vein: the usual outflow of spontaneous splenorenal and gastrorenal shunts.',
  RRV_IVC: 'The right renal vein.',
  V_KID_L: 'Left renal venules.', V_KID_R: 'Right renal venules.',
  V_LOW: 'Valved veins of the lower extremities: flow runs only toward the heart.',
  EPI_ILI: 'Abdominal-wall veins draining down to the iliac veins. With the paraumbilical vein open they form the caput medusae.',
  EPI_SVC: 'Abdominal-wall veins draining up to the superior vena cava.',
  V_UP: 'Drain the upper body to the superior vena cava.',
  AZY_SVC: 'The azygos arch: where esophageal varices and the lumbar collaterals drain into the superior vena cava.',
  SVC_RA: 'Returns venous blood from the upper body (and the azygos) to the right atrium.',
  C1a: 'The coronary vein running up into the esophageal wall: in portal hypertension it fills the esophageal varices.',
  C1b: 'Esophageal varices draining into the azygos system: the classic portosystemic route, and the one that bleeds.',
  C2: 'Short and posterior gastric veins from the spleen to the fundus: they feed fundal varices, the isolated gastric varices of splenic vein thrombosis.',
  C3: 'The paraumbilical vein: a recanalized remnant from the left portal vein to the abdominal wall (caput medusae). It decompresses the liver, not the varices.',
  C4: 'Rectal veins joining the portal (superior) and systemic (middle and inferior) sides: anorectal varices.',
  C5: 'A spontaneous gastrorenal shunt from fundal varices to the left renal vein; BRTO occludes it.',
  C6: 'A spontaneous splenorenal shunt: decompresses the portal system into the left renal vein, at the risk of hepatic encephalopathy.',
  C7: 'Retroperitoneal (Retzius) veins from the mesenteric veins to the IVC.',
  C9: 'The ascending lumbar veins: a caval collateral to the azygos when the IVC is occluded.',
  C8: 'Periportal collaterals that form around a thrombosed portal vein: a cavernoma.',
  AP_R: 'An arterioportal shunt: arterial blood straight into the portal vein, raising its pressure.', AP_L: 'An arterioportal shunt: arterial blood straight into the portal vein, raising its pressure.',
  TIPS: 'A stent through the liver from a portal branch to a hepatic vein: bypasses the sinusoids and lowers portal pressure at once.',
  DIPS: 'A stent through the caudate lobe from the right portal vein into the intrahepatic IVC, below the hepatic veins. Used when the hepatic veins are occluded and the cava is open.',
  S_PC: 'A surgical portocaval shunt: the portal vein joined to the IVC. End-to-side divides the portal vein at the liver (total diversion); side-to-side keeps it, so the portal trunk can also carry hepatofugal outflow from the liver.',
  S_DSR: 'The Warren distal splenorenal shunt: decompresses the varices through the splenic vein while keeping some portal flow to the liver.',
  S_MC: 'A surgical mesocaval shunt from the superior mesenteric vein to the IVC.',
  REX: 'The Meso-Rex bypass: a vein graft from the superior mesenteric vein to the left portal vein at the Rex recess, past a thrombosed main portal vein. It restores splanchnic venous inflow to the liver instead of diverting it to the systemic veins.',
};
// A stent between two portal-system veins (13 Nov 2026): the blood stays in the portal system, so it bypasses a segment of the portal system, not the liver.
const PORTAL_LINK = 'A stent between two veins of the portal system. It bypasses the segment between them, and its flow stays hepatopetal: portal blood still reaches the liver.';
const BY_KIND = {
  artery: 'An artery: oxygen-rich blood at high pressure, unaffected by portal pressure.',
  arteriole: 'An artery: oxygen-rich blood at high pressure, unaffected by portal pressure.',
  collateral: 'A portosystemic collateral: closed in health, it opens when portal pressure rises.',
  shunt: 'A shunt from the portal system to a systemic vein: it lowers portal pressure and diverts blood from the liver.',
  vein: 'A vein.', diode: 'A valved vein.',
};

// The station a vessel's pressure is read at, by the vessel (the first station named for it).
const STATION_OF = new Map();
for (const n of Object.keys(LABEL_VESSEL)) if (!STATION_OF.has(LABEL_VESSEL[n])) STATION_OF.set(LABEL_VESSEL[n], n);
const JF_OPTS = { ref: 1 };   // (judgeFlow reads it as it is called)
// A card asks for its words with every frame the model sends. The words are made again only when something they say moved: each vessel keeps the
// numbers its words were made from (whether it is still, reversed, how far open, how much clot and narrowing, how far above normal) and the
// words, and the same list comes back until one of the numbers changes.
const VESSEL_MEMO = new Map();
const pctOf = (v) => (v > 0.05 ? Math.round(v * 100) : 0);

/** Lines for a vessel's card (the same list comes back until what it says changes: do not write into it). */
export function aboutVessel(e, f, st) {
  const k = EI[e.id], p = st.params;
  let m = VESSEL_MEMO.get(e.id);
  if (!m) VESSEL_MEMO.set(e.id, m = { has: false, still: false, rev: false, rec: -2, clot: 0, sten: 0, rise: 0, lines: null });
  const isArt = e.kind === 'artery' || e.kind === 'arteriole';
  let still = false, rev = false, rec = -2, rise = 0;
  const clot = pctOf(p.thrombus?.[e.id]), sten = pctOf(p.stenosis?.[e.id]);
  if (f) {
    if (!isArt) {
      const q = f.Qf ? f.Qf[k] : f.Q[k];
      JF_OPTS.ref = st.healthy?.Q?.[k] ?? 1;
      const jf = judgeFlow(null, q, null, JF_OPTS);
      still = !!jf.still; rev = !still && !!jf.reversed && !e.portal;
    }
    if (e.kind === 'collateral') {
      const d = f.slow.dEff?.[e.id] ?? f.slow.d[e.id], r = clamp((d - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1);
      rec = r > 0.1 ? Math.round(r * 100) : -1;
    }
    if (st.healthy?.P && !isArt && !st.imaging) {
      // The same breath-smoothed pressure, at the same station, as the card's chip (actions.js edgeValue),
      // and its rounded rise, so the sentence and the card's change (+n) always agree.
      const stn = STATION_OF.get(e.id);
      const PP = f.Pf || f.P, H = st.healthy.P;
      const r = Math.round((stn ? PP[NI[stn]] : (PP[NI[e.from]] + PP[NI[e.to]]) / 2) - (stn ? H[NI[stn]] : (H[NI[e.from]] + H[NI[e.to]]) / 2));
      rise = r > 4 ? r : 0;
    }
  }
  if (m.lines && m.has === !!f && m.still === still && m.rev === rev && m.rec === rec && m.clot === clot && m.sten === sten && m.rise === rise) return m.lines;
  m.has = !!f; m.still = still; m.rev = rev; m.rec = rec; m.clot = clot; m.sten = sten; m.rise = rise;
  const out = [];
  const first = VESSEL[e.id] || (e.kind === 'arteriole' && e.id === 'A_HR' ? 'The right hepatic artery: a quarter of hepatic blood flow and most of the liver’s oxygen supply.' : e.portal ? PORTAL_LINK : BY_KIND[e.kind] || '');
  if (first) out.push(first);
  if (f) {
    if (still) out.push('Flow here has almost stopped: stasis predisposes to thrombosis.');
    else if (rev) out.push(e.kind === 'collateral' ? 'Flow in this collateral is reversed.' : 'Flow is reversed (hepatofugal for a portal vein): blood leaves the way it normally comes in.');
    if (rec > 0) out.push(`Recruited to ${rec}% of its maximum width by the upstream pressure.`);
    else if (rec === -1) out.push('Still closed: portal pressure is not high enough to open it.');
    if (clot) out.push(`Thrombus occludes ${clot}% of the lumen.`);
    if (sten) out.push(`Narrowed by ${sten}%: resistance varies inversely with the fourth power of the radius.`);
    if (rise) out.push(`Pressure is ${rise} mmHg above normal here.`);
  }
  m.lines = out;
  return out;
}

const ORGAN_TEXT = {
  heart: Object.freeze(['The right heart receives all venous return; right atrial pressure is the downstream pressure for every vein. When it rises (right heart failure, tricuspid regurgitation, constrictive pericarditis), the liver becomes congested.']),
  varices: Object.freeze(['Dilated submucosal veins in the lower esophagus, fed by the coronary vein and draining to the azygos. Modeled wall stress rises with pressure and diameter: past a threshold they rupture.']),
  gastric: Object.freeze(['Fundal varices, fed by the short and posterior gastric veins and often draining through a gastrorenal shunt. They bleed less often but more heavily than esophageal varices.']),
  abdomen: Object.freeze(['Ascites forms when sinusoidal pressure drives hepatic lymph formation beyond lymphatic drainage capacity, with sodium retention and hypoalbuminemia contributing.']),
};
const NO_TEXT = Object.freeze([]);
const LIVER_LEAD = 'Receives portal blood (three quarters) and hepatic arterial blood, perfuses the sinusoids and drains through the hepatic veins. Zoom into a lobule to see where resistance builds.';
const SPLEEN_LEAD = 'Drains through the splenic vein into the portal system: portal hypertension causes congestive splenomegaly and platelet sequestration.';
const LIVER_STAGE = [
  [0.4, 'Early fibrosis: resistance is starting to rise in the sinusoids.'],
  [0.6, 'Compensated cirrhosis: sinusoidal resistance raises portal pressure.'],
  [0.85, 'Clinically significant portal hypertension: collaterals and varices form.'],
];
const LIVER_LAST = 'Decompensated cirrhosis: ascites, variceal bleeding and hepatic encephalopathy become likely.';
// The liver's and the spleen's words say a number: made again only when it moves (the same list comes back until then; do not write into it).
const LIVER_MEMO = { c: -1, hv: null, lines: null }, SPLEEN_MEMO = { len: null, lines: null };

/** Lines for an organ's card. */
export function aboutOrgan(id, f, st) {
  const m = f?.metrics;
  switch (id) {
    case 'liver': {
      const c = st.params.cirrhosis, hv = m && !st.imaging ? Math.round(m.hvpg * 10) : null;
      const M = LIVER_MEMO;
      if (M.lines && M.c === c && M.hv === hv) return M.lines;
      const out = [LIVER_LEAD];
      if (c > 0.05) {
        let w = LIVER_LAST;
        for (let i = 0; i < LIVER_STAGE.length; i++) if (c < LIVER_STAGE[i][0]) { w = LIVER_STAGE[i][1]; break; }
        out.push(w);
      }
      if (hv != null) out.push(`HVPG ${fmt(m.hvpg, 1)} mmHg (normal <5, CSPH ≥10).`);
      M.c = c; M.hv = hv; M.lines = out;
      return out;
    }
    case 'spleen': {
      const len = m ? (m.spleen.length > 0 ? Math.round(m.spleen.length * 10) : 0) : null, M = SPLEEN_MEMO;
      if (M.lines && M.len === len) return M.lines;
      const out = [SPLEEN_LEAD];
      if (len != null) out.push(len > 0 ? `${fmt(m.spleen.length, 1)} cm long (normal up to 13).` : 'Removed (splenectomy).');
      M.len = len; M.lines = out;
      return out;
    }
    default: return ORGAN_TEXT[id] || NO_TEXT;
  }
}
