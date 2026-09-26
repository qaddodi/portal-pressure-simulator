// Product and content versions. A course built on one content version behaves the same all
// semester: the model, presets, lessons and cases only change with a new content version.
export const APP_VERSION = '2.1.0';
export const CONTENT_VERSION = '2.0';
export const RELEASED = '2026-09';

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
  'No variceal rupture below HVPG 12 mmHg',
  'Hemorrhage lowers portal pressure; over-transfusion raises it above the pre-bleed level',
  'BRTO of a gastrorenal shunt raises portal pressure by at least 2 mmHg',
  'Non-selective β-blockers lower HVPG; carvedilol more than propranolol',
  'Budd–Chiari: caudate outflow at least 3× normal and ascites forms',
  'Large-volume paracentesis lowers intra-abdominal and variceal transmural pressure',
  'Blood volume is conserved without bleeding or infusion',
  'Determinism: the same actions give an identical state',
  'Stability at every slider extreme',
];
