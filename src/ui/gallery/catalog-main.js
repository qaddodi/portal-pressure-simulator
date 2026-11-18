// The gallery catalog's main-app cards (step 2): the Tests card's panes, the structure cards (a tap on a vessel, an organ or a lobule part), the sheets and the
// chrome. Pure data, no DOM; catalog.js adds these to CATALOG. Each is opened through the app's own controls (window.pps, the top-bar buttons) by openers.js,
// never drawn as a copy.
//
//   pane   { pane: dock pane id, preset, params?, days?, sub? }       the Tests card on that pane, for that patient
//   pick   { view, sel, preset, params?, details? }                    the card for a tapped structure; `details: true` is its Details face (a tap on its name)
//   sheet  { open: 'treat' | 'history' | ..., preset, params? }       a sheet or chrome surface
//
// The structure cards come in about 15 shapes (plan 1.3): one specimen for each, with the Details face of each as its own entry.

export const TESTS_PANES = ['profile', 'scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts', 'trials'];
export const PANE_NAMES = { profile: 'Pressure', scope: 'Pressure over time', hvpg: 'IR (HVPG)', doppler: 'Doppler', endoscopy: 'Endoscopy', abdomen: 'Ascites', fibroscan: 'FibroScan', readouts: 'Readouts', trials: 'Trials' };

const pane = (p, state, title, o = {}) => ({ id: `tests-${p}/${state}`, kind: 'pane', section: 'Tests card', family: `tests-${p}`, title: `${PANE_NAMES[p]}: ${title}`, pane: p, ...o });
const pick = (id, title, sel, o = {}) => [
  { id: `structure/${id}`, kind: 'pick', section: 'Structure cards', family: 'structure', title, view: 'anatomic', sel, preset: 'cirr-decomp', ...o },
  { id: `structure/${id}-details`, kind: 'pick', section: 'Structure cards', family: 'structure', title: `${title}, Details face`, view: 'anatomic', sel, preset: 'cirr-decomp', ...o, details: true },
];
const sheet = (id, title, open, o = {}) => ({ id: `sheet/${id}`, kind: 'sheet', section: 'Sheets', family: 'sheet', title, open, preset: 'cirr-decomp', ...o });

export const MAIN = [
  // ── The Tests card: each pane for the patients that change it ──
  pane('profile', 'healthy', 'healthy', { preset: 'healthy' }),
  pane('profile', 'csph', 'clinically significant portal hypertension', { preset: 'csph' }),
  pane('profile', 'decomp', 'decompensated cirrhosis', { preset: 'cirr-decomp' }),
  pane('profile', 'tips', 'decompensated cirrhosis with a TIPS', { preset: 'cirr-decomp-tips' }),
  pane('profile', 'pvt', 'acute portal vein thrombosis', { preset: 'pvt-acute' }),
  pane('profile', 'budd-chiari', 'Budd–Chiari syndrome', { preset: 'budd-chiari' }),
  pane('scope', 'csph', 'clinically significant portal hypertension', { preset: 'csph' }),
  pane('scope', 'decomp', 'decompensated cirrhosis', { preset: 'cirr-decomp' }),
  pane('hvpg', 'csph', 'clinically significant portal hypertension', { preset: 'csph' }),
  pane('hvpg', 'healthy', 'healthy', { preset: 'healthy' }),
  pane('hvpg', 'not-measurable', 'Budd–Chiari syndrome (not measurable)', { preset: 'budd-chiari' }),
  pane('hvpg', 'tips', 'after a TIPS', { preset: 'cirr-decomp-tips' }),
  pane('doppler', 'healthy', 'healthy portal vein', { preset: 'healthy' }),
  pane('doppler', 'hepatofugal', 'hepatofugal flow', { preset: 'cirr-hepatofugal' }),
  pane('doppler', 'pvt', 'no flow in a thrombosed portal vein', { preset: 'pvt-acute' }),
  pane('doppler', 'tips', 'after a TIPS', { preset: 'cirr-decomp-tips' }),
  pane('endoscopy', 'large-varix', 'large esophageal varix', { preset: 'cirr-decomp' }),
  pane('endoscopy', 'none', 'no varices', { preset: 'healthy' }),
  pane('endoscopy', 'gastric', 'gastric varix', { preset: 'gastric-varix' }),
  pane('endoscopy', 'wall', 'the varix wall', { preset: 'cirr-decomp', sub: 'wall' }),
  pane('abdomen', 'ascites', 'ascites', { preset: 'cirr-decomp' }),
  pane('abdomen', 'none', 'no ascites', { preset: 'healthy' }),
  pane('fibroscan', 'liver', 'liver stiffness', { preset: 'csph' }),
  pane('fibroscan', 'spleen', 'spleen stiffness', { preset: 'csph', organ: 'spleen' }),
  pane('fibroscan', 'no-spleen', 'no spleen to read', { preset: 'healthy', params: { splenicRx: 2 }, organ: 'spleen' }),
  pane('readouts', 'healthy', 'healthy', { preset: 'healthy' }),
  pane('readouts', 'decomp', 'decompensated cirrhosis', { preset: 'cirr-decomp' }),
  pane('trials', 'csph', 'for a patient with CSPH', { preset: 'csph' }),

  // ── Structure cards: one for each shape, each with its Details face ──
  ...pick('portal-vein', 'Portal vein', { type: 'edge', id: 'PV_TRUNK' }, { preset: 'csph' }),
  ...pick('mesenteric-vein', 'Superior mesenteric vein', { type: 'edge', id: 'SMV_CONF' }, { preset: 'csph' }),
  ...pick('splenic-vein', 'Splenic vein, with its Spleen link', { type: 'edge', id: 'V_SPL' }, { preset: 'csph' }),
  ...pick('hepatic-vein', 'Hepatic vein', { type: 'edge', id: 'RHV_IVC' }),
  ...pick('ivc', 'Inferior vena cava', { type: 'edge', id: 'IVCS_RA' }),
  ...pick('hepatic-artery', 'Hepatic artery', { type: 'edge', id: 'A_HEP' }),
  ...pick('small-artery', 'A small artery', { type: 'edge', id: 'A_SMA' }),
  ...pick('liver-bed', 'The liver bed on a lobe', { type: 'edge', id: 'PRE_R' }),
  ...pick('valve', 'The one-way valve in the lower body', { type: 'edge', id: 'V_LOW' }),
  ...pick('collateral-varix', 'Collateral: esophageal varices', { type: 'edge', id: 'C1b' }),
  ...pick('collateral-umbilical', 'Collateral: paraumbilical vein', { type: 'edge', id: 'C3' }),
  ...pick('collateral-gastrorenal', 'Collateral: gastrorenal shunt', { type: 'edge', id: 'C5' }, { preset: 'gastric-varix' }),
  ...pick('shunt-surgical', 'Surgical shunt: portacaval', { type: 'edge', id: 'S_PC' }),
  ...pick('shunt-rex', 'Surgical shunt: Meso-Rex bypass', { type: 'edge', id: 'REX' }, { preset: 'pvt-chronic' }),
  ...pick('shunt-crossing', 'A shunt between two named veins (the shape 127 vessels share)', { type: 'edge', id: 'X_SMV_RHV' }),
  ...pick('tips', 'TIPS with the stent editor', { type: 'edge', id: 'TIPS' }, { preset: 'cirr-decomp-tips' }),
  ...pick('tips-offered', 'TIPS offered, none placed', { type: 'edge', id: 'TIPS' }),
  ...pick('dips', 'DIPS with the stent editor', { type: 'edge', id: 'DIPS' }, { preset: 'budd-chiari', params: { dips: { on: true } } }),
  ...pick('organ-liver', 'Liver', { type: 'organ', id: 'liver' }),
  ...pick('organ-heart', 'Heart', { type: 'organ', id: 'heart' }),
  ...pick('organ-varices', 'Varices', { type: 'organ', id: 'varices' }),
  ...pick('organ-gastric', 'Gastric varices', { type: 'organ', id: 'gastric' }, { preset: 'gastric-varix' }),
  ...pick('organ-spleen', 'Spleen', { type: 'organ', id: 'spleen' }, { preset: 'csph' }),
  ...pick('lobule-zone1', 'Lobule: zone 1, periportal', { type: 'lobule', part: 'hep', zone: 1 }, { view: 'lobule' }),
  ...pick('lobule-zone2', 'Lobule: zone 2, midzonal', { type: 'lobule', part: 'hep', zone: 2 }, { view: 'lobule' }),
  ...pick('lobule-zone3', 'Lobule: zone 3, centrilobular', { type: 'lobule', part: 'hep', zone: 3 }, { view: 'lobule' }),
  ...pick('lobule-sinusoid', 'Lobule: sinusoid', { type: 'lobule', part: 'sin', tube: 12 }, { view: 'lobule' }),
  ...pick('lobule-central-vein', 'Lobule: central vein', { type: 'lobule', part: 'cv' }, { view: 'lobule' }),
  ...pick('lobule-triad', 'Lobule: portal triad', { type: 'lobule', part: 'triad' }, { view: 'lobule' }),
  ...pick('lobule-artery', 'Lobule: hepatic arteriole', { type: 'lobule', part: 'ha' }, { view: 'lobule' }),
  ...pick('lobule-bile-duct', 'Lobule: bile ductule', { type: 'lobule', part: 'bd' }, { view: 'lobule' }),

  // ── Sheets and chrome ──
  sheet('treat', 'Treat: drugs, fluids and procedures', 'treat'),
  sheet('history', 'History', 'history'),
  sheet('compare', 'Compare: a pinned state against the patient now', 'compare', { params: { drugs: { carvedilol: true } } }),
  sheet('settings', 'Settings', 'settings'),
  sheet('menu-patients', 'The menu: patients', 'menu-patients'),
  sheet('menu-present', 'The menu: present', 'menu-present'),
  sheet('palette', 'The command palette', 'palette'),
  sheet('tests', 'The Tests card, opened from the top bar', 'tests'),
  sheet('toast', 'A toast', 'toast'),
  sheet('toast-bad', 'A toast that reports a problem', 'toast-bad'),
  sheet('toast-action', 'A toast with an action', 'toast-action'),
];

/** Sub-pieces of the structure cards the page and the test name: the edge kinds, organs and lobule parts the specimens must reach. */
export const ORGAN_IDS = ['liver', 'heart', 'varices', 'gastric', 'spleen'];
export const LOBULE_PARTS = ['hep', 'sin', 'cv', 'triad', 'ha', 'bd'];
