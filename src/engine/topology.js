// Vascular network definition (blueprint §7.2).
//
// Units: pressure mmHg, flow mL/s, resistance PRU (mmHg·s/mL), compliance mL/mmHg.
// Each node lists its *baseline target* pressure; each calibrated edge lists its
// baseline target flow. Resistances are derived as R = ΔP/Q at load time
// ("calibration by construction"), so the healthy state lands on the §7.8 targets.
//
// `ext` = which external pressure surrounds the node:
//   abd  – intra-abdominal (IAP deviation from baseline)
//   thor – pleural (respiration, Valsalva)
//   eso  – thoracic + esophageal lumen (balloon)
//   gas  – abdominal + gastric lumen (balloon)
//   none – not affected

export const NODES = [
  // id, label, P, C, ext, kind
  ['AO', 'Aorta', 93, 1.8, 'none', 'artery'],
  ['HA', 'Hepatic artery', 88, 0.05, 'none', 'artery'],

  ['INT', 'Intestinal capillary bed', 12, 8, 'abd', 'bed'],
  ['COL', 'Colon / rectal bed', 12, 2, 'abd', 'bed'],
  ['SPL', 'Spleen (red pulp)', 12, 4, 'abd', 'bed'],
  ['STO', 'Gastric bed', 12, 1.5, 'abd', 'bed'],

  ['SMV', 'Superior mesenteric vein', 9.0, 4, 'abd', 'portal'],
  ['IMV', 'Inferior mesenteric vein', 9.3, 1, 'abd', 'portal'],
  ['SV', 'Splenic vein', 8.8, 2, 'abd', 'portal'],
  ['LGV', 'Left gastric (coronary) vein', 8.6, 0.5, 'abd', 'portal'],
  ['CONF', 'Portal vein (main)', 7.8, 3, 'abd', 'portal'],
  ['PVH', 'Portal vein (hilum)', 7.5, 1.5, 'abd', 'portal'],
  ['RPV', 'Right portal vein', 7.3, 1, 'abd', 'portal'],
  ['LPV', 'Left portal vein', 7.3, 0.8, 'abd', 'portal'],
  ['VAR', 'Esophageal varices', 6.5, 0.08, 'eso', 'varix'],
  ['GV', 'Gastric fundal varices', 8.2, 0.08, 'gas', 'varix'],

  ['SIN_R', 'Sinusoids, right lobe (inlet)', 7.0, 6, 'none', 'liver'],
  ['SIN_L', 'Sinusoids, left lobe (inlet)', 7.0, 4, 'none', 'liver'],
  ['CV_R', 'Central venules, right lobe', 4.8, 2, 'none', 'liver'],
  ['CV_L', 'Central venules, left lobe', 4.8, 1.5, 'none', 'liver'],
  ['W_R', 'Wedge compartment (RHV)', 4.9, 0.3, 'none', 'wedge'],
  ['W_M', 'Wedge compartment (MHV)', 4.9, 0.3, 'none', 'wedge'],
  ['W_L', 'Wedge compartment (LHV)', 4.9, 0.3, 'none', 'wedge'],
  ['RHV', 'Right hepatic vein', 4.1, 1, 'abd', 'hepvein'],
  ['MHV', 'Middle hepatic vein', 4.1, 0.8, 'abd', 'hepvein'],
  ['LHV', 'Left hepatic vein', 4.1, 0.8, 'abd', 'hepvein'],

  ['IVCI', 'IVC (infrahepatic)', 4.5, 10, 'abd', 'vein'],
  ['IVCS', 'IVC (suprahepatic)', 3.5, 3, 'thor', 'vein'],
  ['RA', 'Right atrium', 3.0, 5, 'thor', 'heart'],
  ['SVC', 'Superior vena cava', 4.0, 4, 'thor', 'vein'],
  ['AZY', 'Azygos vein', 5.0, 1, 'thor', 'vein'],
  ['UPPV', 'Upper-body veins', 8.0, 35, 'none', 'vein'],
  ['LOWV', 'Lower-body veins', 9.0, 40, 'none', 'vein'],
  ['ILI', 'Iliac veins', 6.0, 6, 'abd', 'vein'],
  ['EPI', 'Epigastric / umbilical veins', 6.6, 1, 'none', 'vein'],
  ['KID_L', 'Left kidney', 14, 1, 'abd', 'bed'],
  ['KID_R', 'Right kidney', 14, 1, 'abd', 'bed'],
  ['LRV', 'Left renal vein', 6.0, 1, 'abd', 'vein'],
  ['RRV', 'Right renal vein', 6.0, 1, 'abd', 'vein'],
].map(([id, label, P, C, ext, kind]) => ({ id, label, P, C, ext, kind }));

// Edge kinds:
//   arteriole – fixed-geometry resistance with vasomotor tone (group)
//   artery    – large artery
//   vein      – collapsible tube-law vessel
//   liver     – intrahepatic resistance segment (pre / sin / post, with lobe)
//   collateral– recruitable portosystemic collateral (slow diameter state)
//   wedge     – wedge-compartment conductances (fixed G)
//   shunt     – intervention (off unless enabled)
//   diode     – valved vein
//
// d = nominal diameter (mm) for velocity & drawing; Q = target baseline flow (mL/s).
export const EDGES = [
  // Arterial supply
  { id: 'A_SMA', from: 'AO', to: 'INT', Q: 10.0, kind: 'arteriole', tone: 'splanchnic', d: 7, label: 'Superior mesenteric artery' },
  { id: 'A_IMA', from: 'AO', to: 'COL', Q: 1.7, kind: 'arteriole', tone: 'splanchnic', d: 3.5, label: 'Inferior mesenteric artery' },
  { id: 'A_SPL', from: 'AO', to: 'SPL', Q: 5.0, kind: 'arteriole', tone: 'splanchnic', d: 5, label: 'Splenic artery' },
  { id: 'A_LGA', from: 'AO', to: 'STO', Q: 1.6, kind: 'arteriole', tone: 'splanchnic', d: 3, label: 'Left gastric artery' },
  { id: 'A_HEP', from: 'AO', to: 'HA', Q: 6.7, kind: 'artery', d: 5, label: 'Common hepatic artery' },
  { id: 'A_HR', from: 'HA', to: 'SIN_R', Q: 4.0, kind: 'arteriole', tone: 'habr', d: 3, label: 'Right hepatic artery' },
  { id: 'A_HL', from: 'HA', to: 'SIN_L', Q: 2.7, kind: 'arteriole', tone: 'habr', d: 2.5, label: 'Left hepatic artery' },
  { id: 'A_REN_L', from: 'AO', to: 'KID_L', Q: 8.3, kind: 'arteriole', tone: 'systemic', d: 5, label: 'Left renal artery' },
  { id: 'A_REN_R', from: 'AO', to: 'KID_R', Q: 8.3, kind: 'arteriole', tone: 'systemic', d: 5, label: 'Right renal artery' },
  { id: 'A_LOW', from: 'AO', to: 'LOWV', Q: 17.0, kind: 'arteriole', tone: 'systemic', d: 9, label: 'Lower-body arteries' },
  { id: 'A_UP', from: 'AO', to: 'UPPV', Q: 22.4, kind: 'arteriole', tone: 'systemic', d: 10, label: 'Upper-body arteries' },
  { id: 'A_AZY', from: 'AO', to: 'AZY', Q: 1.5, kind: 'arteriole', tone: 'systemic', d: 2, label: 'Intercostal arteries' },
  { id: 'A_EPI', from: 'AO', to: 'EPI', Q: 0.8, kind: 'arteriole', tone: 'systemic', d: 2, label: 'Abdominal-wall arteries' },

  // Splanchnic venous drainage
  { id: 'V_INT', from: 'INT', to: 'SMV', Q: 10.0, kind: 'vein', d: 6, label: 'Jejunal & ileal veins' },
  { id: 'V_COL', from: 'COL', to: 'IMV', Q: 1.7, kind: 'vein', d: 4, label: 'Colic veins' },
  { id: 'V_IMV', from: 'IMV', to: 'SV', Q: 1.7, kind: 'vein', d: 5, label: 'Inferior mesenteric vein' },
  { id: 'V_SPL', from: 'SPL', to: 'SV', Q: 5.0, kind: 'vein', d: 8, label: 'Splenic vein (distal)' },
  { id: 'V_STO', from: 'STO', to: 'LGV', Q: 1.6, kind: 'vein', d: 3, label: 'Gastric veins' },
  { id: 'SMV_CONF', from: 'SMV', to: 'CONF', Q: 10.0, kind: 'vein', d: 10, label: 'Superior mesenteric vein' },
  { id: 'SV_CONF', from: 'SV', to: 'CONF', Q: 6.7, kind: 'vein', d: 8, label: 'Splenic vein (proximal)' },
  { id: 'LGV_CONF', from: 'LGV', to: 'CONF', Q: 1.6, kind: 'vein', d: 4, label: 'Left gastric (coronary) vein' },
  { id: 'PV_TRUNK', from: 'CONF', to: 'PVH', Q: 18.3, kind: 'vein', d: 12, label: 'Portal vein' },
  { id: 'PVH_R', from: 'PVH', to: 'RPV', Q: 11.0, kind: 'vein', d: 9, label: 'Right portal vein' },
  { id: 'PVH_L', from: 'PVH', to: 'LPV', Q: 7.3, kind: 'vein', d: 8, label: 'Left portal vein' },

  // Liver microcirculation
  { id: 'PRE_R', from: 'RPV', to: 'SIN_R', Q: 11.0, kind: 'liver', lobe: 'R', zone: 'pre', d: 6, label: 'Portal venules (right)' },
  { id: 'PRE_L', from: 'LPV', to: 'SIN_L', Q: 7.3, kind: 'liver', lobe: 'L', zone: 'pre', d: 6, label: 'Portal venules (left)' },
  { id: 'SIN_RR', from: 'SIN_R', to: 'CV_R', Q: 15.0, kind: 'liver', lobe: 'R', zone: 'sin', d: 6, label: 'Sinusoids (right)' },
  { id: 'SIN_LL', from: 'SIN_L', to: 'CV_L', Q: 10.0, kind: 'liver', lobe: 'L', zone: 'sin', d: 6, label: 'Sinusoids (left)' },
  { id: 'SIN_RL', from: 'SIN_R', to: 'SIN_L', R: 0.5, kind: 'liver', lobe: 'X', zone: 'inter', d: 3, label: 'Inter-lobar sinusoids' },
  { id: 'POST_R_RHV', from: 'CV_R', to: 'RHV', Q: 9.0, kind: 'liver', lobe: 'R', zone: 'post', d: 6, label: 'Central veins → RHV' },
  { id: 'POST_R_MHV', from: 'CV_R', to: 'MHV', Q: 5.2, kind: 'liver', lobe: 'R', zone: 'post', d: 5, label: 'Central veins → MHV (right)' },
  { id: 'POST_L_LHV', from: 'CV_L', to: 'LHV', Q: 7.0, kind: 'liver', lobe: 'L', zone: 'post', d: 5, label: 'Central veins → LHV' },
  { id: 'POST_L_MHV', from: 'CV_L', to: 'MHV', Q: 3.0, kind: 'liver', lobe: 'L', zone: 'post', d: 4, label: 'Central veins → MHV (left)' },
  { id: 'CAUD', from: 'CV_R', to: 'IVCS', Q: 0.8, kind: 'vein', d: 3, label: 'Caudate lobe veins' },

  // Wedge compartments (§7.2): stagnant column to sinusoid inlet, leak to central venules, outflow to HV
  { id: 'WC_R', from: 'SIN_R', to: 'W_R', G: 0.02, kind: 'wedge', role: 'col', w: 'R' },
  { id: 'WL_R', from: 'CV_R', to: 'W_R', G: 0.005, kind: 'wedge', role: 'leak', w: 'R' },
  { id: 'WO_R', from: 'W_R', to: 'RHV', G: 0.05, kind: 'wedge', role: 'out', w: 'R' },
  { id: 'WC_M', from: 'SIN_R', to: 'W_M', G: 0.02, kind: 'wedge', role: 'col', w: 'M' },
  { id: 'WL_M', from: 'CV_R', to: 'W_M', G: 0.005, kind: 'wedge', role: 'leak', w: 'M' },
  { id: 'WO_M', from: 'W_M', to: 'MHV', G: 0.05, kind: 'wedge', role: 'out', w: 'M' },
  { id: 'WC_L', from: 'SIN_L', to: 'W_L', G: 0.02, kind: 'wedge', role: 'col', w: 'L' },
  { id: 'WL_L', from: 'CV_L', to: 'W_L', G: 0.005, kind: 'wedge', role: 'leak', w: 'L' },
  { id: 'WO_L', from: 'W_L', to: 'LHV', G: 0.05, kind: 'wedge', role: 'out', w: 'L' },

  // Hepatic veins & caval system
  { id: 'RHV_IVC', from: 'RHV', to: 'IVCS', Q: 9.0, kind: 'vein', d: 9, label: 'Right hepatic vein' },
  { id: 'MHV_IVC', from: 'MHV', to: 'IVCS', Q: 8.2, kind: 'vein', d: 8, label: 'Middle hepatic vein' },
  { id: 'LHV_IVC', from: 'LHV', to: 'IVCS', Q: 7.0, kind: 'vein', d: 8, label: 'Left hepatic vein' },
  { id: 'IVC_IS', from: 'IVCI', to: 'IVCS', Q: 34.3, kind: 'vein', d: 20, label: 'Retrohepatic IVC' },
  { id: 'IVCS_RA', from: 'IVCS', to: 'RA', Q: 59.3, kind: 'vein', d: 22, label: 'Suprahepatic IVC' },
  { id: 'V_KID_L', from: 'KID_L', to: 'LRV', Q: 8.3, kind: 'vein', d: 6, label: 'Left renal venules' },
  { id: 'V_KID_R', from: 'KID_R', to: 'RRV', Q: 8.3, kind: 'vein', d: 6, label: 'Right renal venules' },
  { id: 'LRV_IVC', from: 'LRV', to: 'IVCI', Q: 8.3, kind: 'vein', d: 8, label: 'Left renal vein' },
  { id: 'RRV_IVC', from: 'RRV', to: 'IVCI', Q: 8.3, kind: 'vein', d: 8, label: 'Right renal vein' },
  { id: 'V_LOW', from: 'LOWV', to: 'ILI', Q: 17.0, kind: 'diode', d: 12, label: 'Lower-limb veins (valved)' },
  { id: 'ILI_IVC', from: 'ILI', to: 'IVCI', Q: 17.7, kind: 'vein', d: 16, label: 'Common iliac veins' },
  { id: 'EPI_ILI', from: 'EPI', to: 'ILI', Q: 0.7, kind: 'vein', d: 2.5, label: 'Inferior epigastric veins' },
  { id: 'EPI_SVC', from: 'EPI', to: 'SVC', Q: 0.1, kind: 'vein', d: 2, label: 'Superior epigastric / internal thoracic veins' },
  { id: 'V_UP', from: 'UPPV', to: 'SVC', Q: 22.4, kind: 'vein', d: 14, label: 'Brachiocephalic veins' },
  { id: 'AZY_SVC', from: 'AZY', to: 'SVC', Q: 1.5, kind: 'vein', d: 6, label: 'Azygos arch' },
  { id: 'SVC_RA', from: 'SVC', to: 'RA', Q: 24.0, kind: 'vein', d: 18, label: 'Superior vena cava' },

  // Portosystemic collaterals (§6.3). dMax/Ropen: fully recruited geometry.
  // route = [upstream, downstream] nodes whose gradient (above healthy) drives remodeling.
  { id: 'C1a', from: 'LGV', to: 'VAR', kind: 'collateral', route: ['LGV', 'AZY'], dMax: 6, Ropen: 0.0133, dMinRatio: 0.12, label: 'Coronary vein → esophageal varices', code: 'C1' },
  { id: 'C1b', from: 'VAR', to: 'AZY', kind: 'collateral', route: ['LGV', 'AZY'], dMax: 6, Ropen: 0.0265, dMinRatio: 0.12, label: 'Esophageal varices → azygos', code: 'C1' },
  { id: 'C2', from: 'SV', to: 'GV', kind: 'collateral', route: ['SV', 'IVCI'], dMax: 6, Ropen: 0.3, label: 'Short / posterior gastric veins', code: 'C2' },
  { id: 'C2b', from: 'GV', to: 'LGV', kind: 'collateral', route: ['SV', 'AZY'], dMax: 5, Ropen: 0.4, label: 'Fundal → coronary vein', code: 'C2' },
  { id: 'C3', from: 'LPV', to: 'EPI', kind: 'collateral', route: ['LPV', 'ILI'], dMax: 8, Ropen: 0.6, label: 'Paraumbilical vein', code: 'C3' },
  { id: 'C4', from: 'IMV', to: 'ILI', kind: 'collateral', route: ['IMV', 'ILI'], dMax: 5, Ropen: 1.0, label: 'Superior ↔ middle/inferior rectal veins', code: 'C4' },
  { id: 'C5', from: 'GV', to: 'LRV', kind: 'collateral', route: ['SV', 'IVCI'], dMax: 12, Ropen: 0.12, label: 'Gastrorenal shunt', code: 'C5', spontaneous: true },
  { id: 'C6', from: 'SV', to: 'LRV', kind: 'collateral', route: ['SV', 'IVCI'], dMax: 12, Ropen: 0.1, label: 'Spontaneous splenorenal shunt', code: 'C6', spontaneous: true },
  { id: 'C7', from: 'SMV', to: 'IVCI', kind: 'collateral', route: ['SMV', 'IVCI'], dMax: 4, Ropen: 1.5, label: 'Retroperitoneal (Retzius) veins', code: 'C7' },
  { id: 'C9', from: 'IVCI', to: 'AZY', kind: 'collateral', route: ['IVCI', 'SVC'], dMax: 10, Ropen: 0.2, label: 'Ascending lumbar → azygos (caval collateral)', code: 'C9', systemic: true },
  { id: 'C8', from: 'CONF', to: 'PVH', kind: 'collateral', route: ['CONF', 'PVH'], dMax: 6, Ropen: 0.15, label: 'Periportal collaterals (cavernoma)', code: 'C8' },

  // Arterioportal shunting (scales with cirrhosis)
  { id: 'AP_R', from: 'HA', to: 'RPV', kind: 'shunt', shunt: 'ap', label: 'Arterioportal shunt (right)' },
  { id: 'AP_L', from: 'HA', to: 'LPV', kind: 'shunt', shunt: 'ap', label: 'Arterioportal shunt (left)' },

  // Interventions (off unless enabled)
  { id: 'TIPS', from: 'RPV', to: 'RHV', kind: 'shunt', shunt: 'tips', len: 8, label: 'TIPS' },
  { id: 'S_PC', from: 'CONF', to: 'IVCI', kind: 'shunt', shunt: 'portocaval', d: 14, label: 'Portocaval shunt' },
  { id: 'S_DSR', from: 'SV', to: 'LRV', kind: 'shunt', shunt: 'dsrs', d: 9, label: 'Distal splenorenal (Warren) shunt' },
  { id: 'S_MC', from: 'SMV', to: 'IVCI', kind: 'shunt', shunt: 'mesocaval', d: 10, label: 'Mesocaval shunt' },
];

// Custom portosystemic shunts: any portal vessel to any systemic vein, created with the stent
// tool. Each exists in the topology from the start, closed (zero conductance) until the learner
// opens it; params.customShunts[id] holds its diameter in mm.
export const SHUNT_PORTAL = ['SMV', 'IMV', 'SV', 'LGV', 'CONF', 'PVH', 'RPV', 'LPV', 'VAR', 'GV'];
export const SHUNT_SYSTEMIC = ['RHV', 'MHV', 'LHV', 'IVCI', 'IVCS', 'SVC', 'AZY', 'ILI', 'LRV'];
const NAMED_SHUNTS = new Set(['RPV>RHV', 'CONF>IVCI', 'SV>LRV', 'SMV>IVCI']);
const nodeLabel = (id) => { const n = NODES.find((x) => (Array.isArray(x) ? x[0] : x.id) === id); return Array.isArray(n) ? n[1] : n?.label || id; };
export const customShuntId = (p, q) => `X_${p}_${q}`;
for (const p of SHUNT_PORTAL) for (const q of SHUNT_SYSTEMIC) {
  if (NAMED_SHUNTS.has(`${p}>${q}`)) continue;
  EDGES.push({ id: customShuntId(p, q), from: p, to: q, kind: 'shunt', shunt: 'custom', label: `${nodeLabel(p)} → ${nodeLabel(q)} shunt` });
}

// Collaterals: diameter floor. R(d) = Ropen·(dMax/d)^4, closed ≈ 256·Ropen.
export const COLLATERAL_DMIN_RATIO = 1 / 4;
/** Resting (unrecruited) diameter of a collateral; a route may set its own ratio (dMinRatio). */
export const dMinOf = (e) => e.dMax * (e.dMinRatio ?? COLLATERAL_DMIN_RATIO);

export const TARGETS = {
  MAP: 93, CO_Lmin: 5.0, RA: 3, IVC: 3.5, FHVP: 4, HVPG: 3, PV: 7.5,
  hepaticFlow_Lmin: 1.5, pvFlow_Lmin: 1.1, haFlow_Lmin: 0.4,
};

export const PORTAL_TERRITORY = new Set(['SMV', 'IMV', 'SV', 'LGV', 'CONF', 'PVH', 'RPV', 'LPV', 'VAR', 'GV']);
// Edges that carry portal blood into systemic veins (for shunt fraction). Positive sign = toward systemic.
export const PORTOSYSTEMIC_EDGES = ['C1b', 'C3', 'C4', 'C5', 'C6', 'C7', 'TIPS', 'S_PC', 'S_DSR', 'S_MC'];
export const SPLANCHNIC_ARTERIES = ['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA'];
