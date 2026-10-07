// The short, plain-language explanation every card opens with: what the structure is, then what
// is happening to it in this patient right now (reversed flow, a clot, a collateral opening). The
// first sentence is fixed; the rest is read from the live model.

import { EDGES, NODES, dMinOf } from '../engine/topology.js?v=80b8d861de';
import { fmt, clamp } from './util.js?v=8aa5e5cdf1';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

const VESSEL = {
  V_INT: 'Drain the small bowel, carrying absorbed nutrients toward the liver.',
  V_COL: 'Drain the colon into the inferior mesenteric vein.',
  V_IMV: 'Drains the left colon and rectum into the splenic vein. Its rectal branches meet systemic veins: a portosystemic crossroads.',
  V_SPL: 'Drains the spleen. In portal hypertension the spleen congests and enlarges.',
  V_STO: 'Drain the stomach toward the coronary vein.',
  SMV_CONF: 'Carries blood from the small bowel and right colon: the largest share of portal inflow.',
  SV_CONF: 'Carries spleen, stomach and (via the IMV) left colon blood to the portal confluence.',
  LGV_CONF: 'The coronary vein: drains the stomach into the portal vein. In portal hypertension it reverses and feeds esophageal varices.',
  PV_TRUNK: 'Formed behind the pancreas by the superior mesenteric and splenic veins; brings about three quarters of the liver’s blood, at low pressure.',
  PVH_R: 'The portal vein’s branch to the right lobe, which takes most of the portal flow.',
  PVH_L: 'The portal vein’s branch to the left lobe; the paraumbilical vein leaves it.',
  CAUD: 'Short veins from the caudate lobe straight into the IVC: they survive hepatic-vein occlusion, so the caudate lobe enlarges in Budd–Chiari.',
  RHV_IVC: 'Drains the right lobe into the IVC just below the heart. A balloon catheter wedged here measures HVPG.',
  MHV_IVC: 'Drains the middle of the liver into the IVC.',
  LHV_IVC: 'Drains the left lobe into the IVC.',
  IVC_IS: 'The inferior vena cava below the liver: returns blood from the legs, kidneys and pelvis.',
  IVCS_RA: 'The last stretch of the IVC into the right atrium: right heart pressure reaches the liver through it.',
  ILI_IVC: 'The iliac veins joining to form the IVC.',
  LRV_IVC: 'The left renal vein: a common landing site for spontaneous splenorenal and gastrorenal shunts.',
  RRV_IVC: 'The right renal vein.',
  V_KID_L: 'The left kidney’s venules.', V_KID_R: 'The right kidney’s venules.',
  V_LOW: 'Valved veins of the legs: they let blood go only toward the heart.',
  EPI_ILI: 'Abdominal-wall veins draining down to the iliac veins. With the paraumbilical vein open they form the caput medusae.',
  EPI_SVC: 'Abdominal-wall veins draining up to the superior vena cava.',
  V_UP: 'Bring the upper body’s blood to the superior vena cava.',
  AZY_SVC: 'The azygos arch: where esophageal varices and the lumbar collaterals drain into the superior vena cava.',
  SVC_RA: 'Returns the upper body’s blood (and the azygos) to the right atrium.',
  C1a: 'The coronary vein running up into the esophageal wall: in portal hypertension it fills the esophageal varices.',
  C1b: 'Esophageal varices draining into the azygos system: the classic portosystemic route, and the one that bleeds.',
  C2: 'Short and posterior gastric veins from the spleen to the fundus: they feed fundal varices, alone in splenic vein thrombosis.',
  C3: 'The paraumbilical vein: a remnant reopened from the left portal vein to the abdominal wall (caput medusae). It decompresses the liver, not the varices.',
  C4: 'Rectal veins joining the portal (superior) and systemic (middle and inferior) sides: anorectal varices.',
  C5: 'A spontaneous gastrorenal shunt from fundal varices to the left renal vein; BRTO plugs it.',
  C6: 'A spontaneous splenorenal shunt: decompresses the portal system into the left renal vein, at the cost of encephalopathy.',
  C7: 'Retroperitoneal (Retzius) veins from the mesenteric veins to the IVC.',
  C9: 'The ascending lumbar veins: a caval collateral to the azygos when the IVC is blocked.',
  C8: 'Periportal collaterals that form around a thrombosed portal vein: a cavernoma.',
  AP_R: 'An arterioportal shunt: arterial blood straight into the portal vein, raising its pressure.', AP_L: 'An arterioportal shunt: arterial blood straight into the portal vein, raising its pressure.',
  TIPS: 'A stent through the liver from a portal branch to a hepatic vein: bypasses the sinusoids and lowers portal pressure at once.',
  S_PC: 'A surgical portocaval shunt: the portal vein joined to the IVC. Total diversion.',
  S_DSR: 'The Warren distal splenorenal shunt: decompresses the varices through the splenic vein while keeping some portal flow to the liver.',
  S_MC: 'A surgical mesocaval shunt from the superior mesenteric vein to the IVC.',
};
const BY_KIND = {
  artery: 'An artery: oxygen-rich blood at high pressure, unaffected by portal pressure.',
  arteriole: 'An artery: oxygen-rich blood at high pressure, unaffected by portal pressure.',
  collateral: 'A portosystemic collateral: closed in health, it opens when portal pressure rises.',
  shunt: 'A shunt from the portal system to a systemic vein: it lowers portal pressure and diverts blood from the liver.',
  vein: 'A vein.', diode: 'A valved vein.',
};

/** Lines for a vessel's card. */
export function aboutVessel(e, f, st) {
  const k = EI[e.id], p = st.params;
  const out = [VESSEL[e.id] || (e.kind === 'arteriole' && e.id === 'A_HR' ? 'The right hepatic artery: a quarter of the liver’s blood and most of its oxygen.' : BY_KIND[e.kind] || '')];
  if (!f) return out.filter(Boolean);
  const q = f.Qf ? f.Qf[k] : f.Q[k], ref = st.healthy?.Q?.[k] ?? 1;
  const isArt = e.kind === 'artery' || e.kind === 'arteriole';
  if (!isArt) {
    if (Math.abs(q) < 0.05 && Math.abs(ref) > 0.3) out.push('Flow here has almost stopped: stagnant blood can clot.');
    else if (q < -Math.max(0.12, 0.02 * Math.abs(ref))) out.push(e.kind === 'collateral' ? 'Blood runs the other way from usual in this collateral.' : 'Flow is reversed (hepatofugal for a portal vein): blood leaves the way it normally comes in.');
  }
  if (e.kind === 'collateral') {
    const d = f.slow.dEff?.[e.id] ?? f.slow.d[e.id], r = clamp((d - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1);
    if (r > 0.1) out.push(`Recruited to ${Math.round(r * 100)} % of its maximum width by the pressure behind it.`);
    else out.push('Still closed: portal pressure is not high enough to open it.');
  }
  if (p.thrombus?.[e.id] > 0.05) out.push(`A clot fills ${Math.round(p.thrombus[e.id] * 100)} % of the lumen.`);
  if (p.stenosis?.[e.id] > 0.05) out.push(`Narrowed by ${Math.round(p.stenosis[e.id] * 100)} %: resistance rises with the fourth power of the radius.`);
  if (st.healthy?.P && !isArt && !st.imaging) {
    const P = (f.P[NI[e.from]] + f.P[NI[e.to]]) / 2, P0 = (st.healthy.P[NI[e.from]] + st.healthy.P[NI[e.to]]) / 2;
    if (P - P0 > 4) out.push(`Pressure is ${fmt(P - P0, 0)} mmHg above normal here.`);
  }
  return out.filter(Boolean);
}

/** Lines for an organ's card. */
export function aboutOrgan(id, f, st) {
  const m = f?.metrics;
  switch (id) {
    case 'liver': {
      const out = ['Receives portal blood (three quarters) and hepatic arterial blood, filters it through the sinusoids and returns it by the hepatic veins. Zoom into a lobule to see where resistance builds.'];
      const c = st.params.cirrhosis;
      if (c > 0.05) out.push(c < 0.4 ? 'Early fibrosis: resistance is starting to rise in the sinusoids.' : c < 0.6 ? 'Compensated cirrhosis: sinusoidal resistance raises portal pressure.' : c < 0.85 ? 'Clinically significant portal hypertension: collaterals and varices form.' : 'Decompensated cirrhosis: ascites, bleeding and encephalopathy become likely.');
      if (m && !st.imaging) out.push(`HVPG ${fmt(m.hvpg, 1)} mmHg (normal under 5, varices from 10).`);
      return out;
    }
    case 'heart': return ['The right heart receives all venous return; its pressure is the floor every vein drains against. When it rises (failure, tricuspid regurgitation, constriction) the liver congests from behind.'];
    case 'varices': return ['Dilated submucosal veins in the lower esophagus, fed by the coronary vein and draining to the azygos. Wall tension rises with pressure and diameter: past a threshold they rupture.'];
    case 'gastric': return ['Fundal varices, fed by the short and posterior gastric veins and often draining through a gastrorenal shunt. They bleed less often but more heavily than esophageal varices.'];
    case 'spleen': return ['Drains through the splenic vein into the portal system: portal hypertension congests it, it enlarges and traps platelets.', m ? `${fmt(m.spleen.length, 1)} cm long (normal up to 13).` : ''].filter(Boolean);
    case 'abdomen': return ['Ascites forms when sinusoidal pressure pushes more lymph out of the liver than the lymphatics can carry away, with sodium retention and low albumin adding to it.'];
    default: return [];
  }
}
