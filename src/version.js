// When the app was last updated, shown as a month and year (no version number is shown anywhere). The model, presets and decks change with
// the app, so the date is the only promise the About sheet makes (19 Nov 2026, bible ENG-8: it used to promise content fixed to October). A
// no-break space keeps month and year on one line.
export const UPDATED = 'November\u00a02026';
// Which build this is: the release tag and short commit, written by scripts/build.mjs (define). The unbuilt source site says "source".
export const RELEASE = typeof __PPS_RELEASE__ === 'undefined' ? 'source' : __PPS_RELEASE__; // eslint-disable-line no-undef

// Creator, and the page that lists all of their teaching tools.
export const AUTHOR = 'Mohammad Almeqdadi, MD';
export const AUTHOR_URL = 'https://qaddodi.github.io/#tools';
// Where Help › Send feedback addresses its email (the item is left out while this is empty).
export const FEEDBACK_EMAIL = 'mohammad.almeqdadi@gmail.com';

// The model's validation targets: each is an automated test in tests/acceptance.test.js.
export const VALIDATION = [
  'Healthy adult: portal pressure, HVPG, portal flow and cardiac output within normal ranges',
  'Healthy: negligible collateral flow, no reversed portal vessels',
  'Cirrhosis: HVPG rises monotonically; collateral recruitment begins near HVPG 10 mmHg',
  'Presinusoidal disease: high portal pressure with a normal HVPG and no ascites',
  'Right heart failure: high RAP and WHVP, normal HVPG, pulsatile portal vein, protein-rich ascites',
  'Splenic vein thrombosis: normal portal pressure, high splenic vein pressure, flow through the short gastric veins',
  'Splenorenal shunt in decompensated cirrhosis: the splenic vein reverses',
  'Cirrhosis with arterioportal shunting: hepatofugal portal flow',
  'TIPS 10 mm at HVPG ≈20 mmHg: PPG <12 mmHg, shunt fraction and hepatic perfusion change as expected',
  'Model calibration: no variceal rupture at an HVPG <12 mmHg (a simplification: real varices can bleed <12)',
  'Hemorrhage lowers portal pressure; over-transfusion raises it above the pre-bleed level',
  'BRTO of a gastrorenal shunt raises portal pressure by ≥2 mmHg',
  'Nonselective β-blockers lower HVPG; carvedilol more than propranolol',
  'Budd–Chiari: caudate outflow ≥3× normal and ascites forms',
  'Large-volume paracentesis lowers intra-abdominal and variceal transmural pressure',
  'Blood volume is conserved without bleeding or infusion',
  'Determinism: the same actions give an identical state',
  'Stability at every slider extreme',
];
