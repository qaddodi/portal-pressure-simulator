// When the app and its model content were last updated, shown as a date (no version number is shown
// anywhere; package.json keeps one only for SCORM exports). A class taught on content of one date
// behaves the same all term: the model, presets and decks only change when the content date does.
export const UPDATED = 'October 2026';
export const CONTENT_UPDATED = 'October 2026';

// Creator, and the page that lists all of their teaching tools.
export const AUTHOR = 'Mohammad Almeqdadi, MD';
export const AUTHOR_URL = 'https://qaddodi.github.io/#tools';

// The model's validation targets: each is an automated test in tests/acceptance.test.js.
export const VALIDATION = [
  'Healthy adult: portal pressure, HVPG, portal flow and cardiac output within normal ranges',
  'Healthy: negligible collateral flow, no reversed portal vessels',
  'Cirrhosis: HVPG rises monotonically; collateral recruitment begins near HVPG 10 mmHg',
  'Presinusoidal disease: high portal pressure with a normal HVPG and no ascites',
  'Right heart failure: high RA and WHVP, normal HVPG, pulsatile portal vein, protein-rich ascites',
  'Splenic vein thrombosis: normal portal pressure, high splenic pressure, short-gastric flow',
  'Splenorenal shunt in decompensated cirrhosis: the splenic vein reverses',
  'End-stage cirrhosis with arterioportal shunting: hepatofugal portal flow',
  'TIPS 10 mm at HVPG ≈ 20: gradient below 12 mmHg, shunt fraction and liver perfusion change as expected',
  'Model calibration: no variceal rupture below HVPG 12 mmHg (a simplification: real varices can bleed below 12)',
  'Hemorrhage lowers portal pressure; over-transfusion raises it above the pre-bleed level',
  'BRTO of a gastrorenal shunt raises portal pressure by at least 2 mmHg',
  'Non-selective β-blockers lower HVPG; carvedilol more than propranolol',
  'Budd–Chiari: caudate outflow at least 3× normal and ascites forms',
  'Large-volume paracentesis lowers intra-abdominal and variceal transmural pressure',
  'Blood volume is conserved without bleeding or infusion',
  'Determinism: the same actions give an identical state',
  'Stability at every slider extreme',
];
