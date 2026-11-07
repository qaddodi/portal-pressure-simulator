// Controls panel (blueprint §4.1, §8.4): global parameters in three tabs, or the selected vessel.

import { EDGES, NODES, dMinOf } from '../engine/topology.js';
import { dopplerVel } from './velNormal.js';
import { DRUGS, PREGNANCY_INFO } from '../engine/scenario.js';
import { store, updateParams, hiddenNow } from './store.js';
import { h, fmt, fmtFlow, fp, ff, clamp, units, tooltipFor, infoButton, icon, svgIcon, paintRange, putText, releaseWords } from './util.js';
import { liveBalance } from './balance-hold.js';
import { frameFor, cancelFrame } from './frame.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
const nextFrame = frameFor('inspector');

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── Live readings ─────────────────────────────────
// A reading on an open panel is written every frame, so its words are made once per number it shows: each keeps a cell
// {k, s, t, u, tv, ts} (the number last shown by its place value, the words made from it, every number's words so far, the unit those
// are in, and the words of a value that lay on a rounding tie) and a frame that shows the same number again, or one it has shown
// before, builds nothing. The key is the number as it shows, in units of its last place; a value within 1e-9 of a rounding tie
// has no key (TIE) and is worded from itself, as fmt does it, so the words are exactly what fmt prints, never one place off.
const UNSET = {}, TIE = {};   // (UNSET: no number shown yet, unlike any number, NaN or missing value)
const newCell = () => ({ k: UNSET, s: '', t: new Map(), u: '', tv: UNSET, ts: '' });   // alloc-rare: one per reading, made when its panel is built (a selection opens)
const madeText = (c, key, make, v, a, b) => { const s = make(key, v, a, b); if (c.t.size > 512) c.t.clear(); c.t.set(key, s); return s; };   // alloc-rare: each number a reading shows is built once, then reused
const tieText = (c, make, v, a, b) => {
  if (Object.is(c.tv, v)) return c.ts;
  c.tv = v;
  return (c.ts = make(TIE, v, a, b));   // alloc-rare: only a value that lies on a rounding tie, and only while it changes
};
const cachedText = (c, key, make, v, a, b) => {
  if (key === TIE) return tieText(c, make, v, a, b);
  if (Object.is(c.k, key)) return c.s;
  c.k = key;
  return (c.s = c.t.get(key) ?? madeText(c, key, make, v, a, b));
};
const POW10 = [1, 10, 100];
const numMake = (k, v, d, suffix) => `${fmt(k === TIE ? v : Number.isFinite(k) ? k / POW10[d] : k, d)}${suffix}`;
/** The number to d places (0 to 2) and the suffix after it, as fmt prints it. */
const numText = (c, v, d, suffix) => cachedText(c, keyed(v, POW10[d], false), numMake, v, d, suffix);
// (A reading in the person's units: the key is the number as that unit shows it, in units of its last place, so the words are what
// fp / ff / fmtFlow print. The scale of each unit is the factor and places of util's table; tests/inspector-live-text.test.js holds them to it.)
const PRESS_KEY = { mmHg: 10, cmH2O: 13.6, kPa: 13.33 };
const FLOW_KEY = { 'L/min': 10, 'mL/min': 1000 };
const pressMake = (k, v) => fp(v).join(' ');   // alloc-rare: built once per number shown
const flowMake = (k, v) => ff(v).join(' ');   // alloc-rare: built once per number shown
const lpmMake = (k, v) => `${fmtFlow(v)} L/min`;   // alloc-rare: built once per number shown
const TINY_FLOW = 0.5;   // (fmtFlow reads a small real flow as "< 0.1": its own key, which no whole number takes)
const keyed = (v, scale, tiny) => {
  if (!Number.isFinite(v)) return v;
  if (tiny) { const a = Math.abs(v); if (a > 0.0005 && a < 0.05) return v < 0 ? -TINY_FLOW : TINY_FLOW; }
  const x = Math.abs(v) * scale, f = Math.floor(x), r = x - f;
  if (Math.abs(r - 0.5) < 1e-9) return TIE;
  const key = r > 0.5 ? f + 1 : f;
  return v < 0 && key ? -key : key;
};
const unitKept = (c, name) => { if (c.u !== name) { c.u = name; c.k = UNSET; c.tv = UNSET; c.t.clear(); } };
/** A pressure as fp prints it, with its unit. */
function pressText(c, v) { const u = units.pressure; unitKept(c, u); return cachedText(c, keyed(v, PRESS_KEY[u], false), pressMake, v); }
/** A flow in L/min as ff prints it, in the person's flow unit. */
function flowText(c, v) { const u = units.flow; unitKept(c, u); return cachedText(c, keyed(v, FLOW_KEY[u], u === 'L/min'), flowMake, v); }
/** A flow in L/min with its unit, whatever the person's flow unit is. */
const lpmText = (c, v) => cachedText(c, keyed(v, 10, true), lpmMake, v);
export const readings = { newCell, numText, pressText, flowText, lpmText };   // (for tests/inspector-live-text.test.js)
const Pof = (f) => f.Pf || f.P, Qof = (f) => f.Qf || f.Q;   // (the smoothed pressures and flows, as the vessel card and the figure read them: the raw ones swing with each beat)
const strMake = (k) => String(k);   // alloc-rare: built once per value
const fnMake = (k, v, fn) => fn(k);   // alloc-rare: the words of a value, built once per value a slider shows
const pltMake = (n) => `${(n * 1000).toLocaleString('en-US')}/µL`;   // alloc-rare: built once per count shown
const DIR_WARN = ['warn', 'Stagnant'], DIR_REV = ['rev', 'Reversed flow'], DIR_OK = ['ok', 'Physiological direction'];
const SPLENIC_RX = ['none', 'partial embolization', 'splenectomy'];

const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `×${v.toFixed(v < 10 ? 2 : 0)}`;
const tone = (v) => (Math.abs(v - 1) < 0.01 ? 'normal' : v < 1 ? `×${v.toFixed(2)} · dilated` : `×${v.toFixed(2)} · constricted`);
const occl = (id) => ({ get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; } });
const sten = (id) => ({ get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; } });
const fibAll = (z) => ({ get: (p) => Math.sqrt(p.fibrosis.R[z] * p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; } });
const prop = (k) => ({ get: (p) => p[k], set: (p, v) => { p[k] = v; } });

// Every global control, addressable by id.
export const CONTROLS = {
  cirrhosis: { type: 'slider', key: 'cirrhosis', label: 'Cirrhosis severity', min: 0, max: 1, step: 0.01, ...prop('cirrhosis'), format: pct, def: 0,
    info: 'Macro control: sinusoidal fibrosis and capillarization, a stiffer liver, less buffer reserve and arterioportal shunting. Run the Months clock to watch collaterals and varices develop.',
    sub: '40% compensated · 60% CSPH · 85% decompensated' },
  fibPre: { type: 'slider', key: 'fibrosis', label: 'Presinusoidal', min: 1, max: 80, step: 0.5, ...fibAll('pre'), format: mult, def: 1, info: 'Resistance in the portal tracts and venules (e.g. schistosomiasis). Raises portal pressure without raising the wedged pressure.' },
  fibSin: { type: 'slider', key: 'fibrosis', label: 'Sinusoidal', min: 1, max: 40, step: 0.5, ...fibAll('sin'), format: mult, def: 1, info: 'Extra sinusoidal resistance on top of the cirrhosis macro.' },
  fibPost: { type: 'slider', key: 'fibrosis', label: 'Postsinusoidal', min: 1, max: 40, step: 0.5, ...fibAll('post'), format: mult, def: 1, info: 'Central vein / terminal hepatic venule (e.g. sinusoidal obstruction syndrome).' },
  pvt: { type: 'slider', key: 'thrombus', label: 'Portal vein', min: 0, max: 1, step: 0.01, ...occl('PV_TRUNK'), format: pct, def: 0 },
  svt: { type: 'slider', key: 'thrombus', label: 'Splenic vein', min: 0, max: 1, step: 0.01, ...occl('SV_CONF'), format: pct, def: 0 },
  smvt: { type: 'slider', key: 'thrombus', label: 'Superior mesenteric vein', min: 0, max: 1, step: 0.01, ...occl('SMV_CONF'), format: pct, def: 0 },
  rhv: { type: 'slider', key: 'thrombus', label: 'Right hepatic vein', min: 0, max: 1, step: 0.01, ...occl('RHV_IVC'), format: pct, def: 0 },
  mhv: { type: 'slider', key: 'thrombus', label: 'Middle hepatic vein', min: 0, max: 1, step: 0.01, ...occl('MHV_IVC'), format: pct, def: 0 },
  lhv: { type: 'slider', key: 'thrombus', label: 'Left hepatic vein', min: 0, max: 1, step: 0.01, ...occl('LHV_IVC'), format: pct, def: 0 },
  ivc: { type: 'slider', key: 'stenosis', label: 'Suprahepatic IVC stenosis', min: 0, max: 0.95, step: 0.01, ...sten('IVCS_RA'), format: pct, def: 0, info: 'IVC web or membrane that narrows the outflow.' },
  anticoag: { type: 'toggle', key: 'anticoag', label: 'Anticoagulation', ...prop('anticoag'), info: 'Thrombi slowly recanalize as time passes.' },
  contractility: { type: 'slider', key: 'contractility', label: 'Right-heart contractility', min: 0.15, max: 1.6, step: 0.01, ...prop('contractility'), format: pct, def: 1, normal: [0.85, 1.2] },
  tr: { type: 'slider', key: 'tr', label: 'Tricuspid regurgitation', min: 0, max: 1, step: 0.01, ...prop('tr'), format: pct, def: 0, info: 'Systolic backflow into the right atrium: large v-waves reach the liver (turn on Pulsatile mode and use the Doppler).' },
  pericardial: { type: 'slider', key: 'pericardial', label: 'Pericardial constraint', min: 0, max: 1, step: 0.01, ...prop('pericardial'), format: pct, def: 0 },
  grShunt: { type: 'toggle', key: 'spontaneous', label: 'Gastrorenal shunt present', get: (p) => p.spontaneous.C5 !== false, set: (p, v) => { p.spontaneous.C5 = v; }, def: false, info: 'Present in most patients with gastric varices (about 80–85%) and required for them: fundal varices drain through it into the left renal vein. It stays small until the portal-to-caval gradient is high.' },
  srShunt: { type: 'toggle', key: 'spontaneous', label: 'Splenorenal shunt present', get: (p) => p.spontaneous.C6, set: (p, v) => { p.spontaneous.C6 = v; }, info: 'A large spontaneous shunt from the splenic to the left renal vein.' },
  tips: { type: 'toggle', key: 'tips', label: 'TIPS', get: (p) => p.tips.on, set: (p, v) => { p.tips.on = v; }, info: 'Transjugular intrahepatic portosystemic shunt, right portal → right hepatic vein. You can also drag one with the Stent tool.' },
  tipsD: { type: 'slider', key: 'tips', label: 'Stent diameter', min: 6, max: 12, step: 0.5, get: (p) => p.tips.d, set: (p, v) => { p.tips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, def: 8, info: 'Resistance ∝ 1/d⁴ (Poiseuille): small changes in diameter matter a lot.', showIf: (p) => p.tips.on },
  dips: { type: 'toggle', key: 'dips', label: 'DIPS', get: (p) => p.dips.on, set: (p, v) => { p.dips.on = v; }, info: 'Direct intrahepatic portosystemic shunt, right portal vein → intrahepatic IVC through the caudate lobe, below the hepatic veins. For hepatic vein occlusion with an open cava (Budd–Chiari). You can also drag one with the Stent tool.' },
  dipsD: { type: 'slider', key: 'dips', label: 'Stent diameter', min: 6, max: 12, step: 0.5, get: (p) => p.dips.d, set: (p, v) => { p.dips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, def: 8, info: 'The same stent as a TIPS, through a shorter tract: the diameter matters as much.', showIf: (p) => p.dips.on },
  // (The tamponade tube: the gastric balloon is the first step, drawn up against the cardia; the esophageal balloon is the second and goes on a tube
  // whose gastric balloon is up, so it brings the gastric one with it and the gastric one lets it down first.)
  balloonEso: { type: 'toggle', key: 'balloonEso', label: 'Esophageal balloon tamponade (second step)', get: (p) => p.balloonEso, set: (p, v) => { p.balloonEso = v; if (v) p.balloonGas = true; } },
  balloonGas: { type: 'toggle', key: 'balloonGas', label: 'Gastric balloon tamponade (first step)', get: (p) => p.balloonGas, set: (p, v) => { p.balloonGas = v; if (!v) p.balloonEso = false; } },
  brto: { type: 'toggle', key: 'occluded', label: 'BRTO (occlude the gastrorenal shunt)', get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, info: 'Balloon-occluded retrograde transvenous obliteration. Watch what it does to portal pressure.' },
  splenicRx: { type: 'slider', key: 'splenicRx', label: 'Spleen: embolization / splenectomy', min: 0, max: 2, step: 1, get: (p) => p.splenicRx | 0, set: (p, v) => { p.splenicRx = v; }, format: (v) => SPLENIC_RX[v], def: 0, info: 'Cuts splenic artery inflow: partial embolization removes part of the spleen\u2019s blood supply, splenectomy removes all of it. Less inflow means a lower portal pressure and less flow to the varices.' },
  portocaval: { type: 'toggle', key: 'portocaval', label: 'Portocaval shunt', get: (p) => p.portocaval, set: (p, v) => { p.portocaval = v; if (!v) p.portocavalSide = false; }, info: 'End-to-side: total diversion; the liver loses all portal perfusion. Side-to-side (the shunt\u2019s own card) keeps the portal trunk, so the liver drains back out through it.' },
  dsrs: { type: 'toggle', key: 'dsrs', label: 'Distal splenorenal (Warren)', ...prop('dsrs'), info: 'Selective: the coronary vein is tied off and the stomach drains through the spleen, so the gastroesophageal varices collapse while SMV blood still perfuses the liver.' },
  mesocaval: { type: 'toggle', key: 'mesocaval', label: 'Mesocaval shunt', ...prop('mesocaval') },
  rex: { type: 'toggle', key: 'rex', label: 'Meso-Rex bypass', ...prop('rex'), info: 'A vein graft from the superior mesenteric vein to the left portal vein, past a clotted trunk: the gut\u2019s blood goes back into the liver.' },
  gestation: { type: 'slider', key: 'gestation', label: 'Pregnancy', min: 0, max: 40, step: 1, ...prop('gestation'), format: (v) => (v > 0 ? `${Math.round(v)} weeks` : 'Not pregnant'), def: 0, info: PREGNANCY_INFO },
  albumin: { type: 'slider', key: 'albumin', label: 'Serum albumin', min: 1.5, max: 5, step: 0.1, ...prop('albumin'), format: (v) => `${v.toFixed(1)} g/dL`, def: 4, normal: [3.5, 5], info: 'Plasma oncotic pressure opposes filtration out of capillaries (Starling).' },
  diuretics: { type: 'toggle', key: 'diuretics', label: 'Diuretics', ...prop('diuretics'), info: 'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites.' },
  splanchnicTone: { type: 'slider', key: 'splanchnicTone', label: 'Splanchnic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, ...prop('splanchnicTone'), format: tone, def: 1, normal: [0.85, 1.15], info: 'Forward-flow theory: splanchnic vasodilation raises portal inflow, and so portal pressure.' },
  systemicTone: { type: 'slider', key: 'systemicTone', label: 'Systemic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, ...prop('systemicTone'), format: tone, def: 1, normal: [0.85, 1.15] },
  habr: { type: 'slider', key: 'habrStrength', label: 'Hepatic arterial buffer', min: 0, max: 2, step: 0.05, ...prop('habrStrength'), format: mult, def: 1, info: 'Adenosine washout: when portal flow falls the hepatic artery dilates to preserve liver perfusion.' },
  apShunt: { type: 'slider', key: 'apShunt', label: 'Arterioportal shunting', min: 0, max: 1, step: 0.01, ...prop('apShunt'), format: pct, def: 0, info: 'Hepatic-artery blood entering portal branches directly. With high sinusoidal resistance it can drive the portal vein backwards.' },
  pulsatile: { type: 'toggle', key: 'pulsatile', label: 'Pulsatile (beat-to-beat)', ...prop('pulsatile'), info: 'Adds the right-atrial waveform (a, x, v, y). Needed for Doppler pulsatility.' },
  respiration: { type: 'toggle', key: 'respiration', label: 'Respiration', ...prop('respiration') },
  respDepth: { type: 'slider', key: 'respDepth', label: 'Breath depth', min: 0, max: 3, step: 0.1, ...prop('respDepth'), format: mult, def: 1 },
  bleeding: { type: 'toggle', key: 'bleeding', label: 'Variceal bleeding', ...prop('bleeding'), info: 'Off: varices grow but never rupture on their own. On: a varix can tear once its wall stress passes the critical value.' },
  detRupture: { type: 'toggle', key: 'deterministicRupture', label: 'Deterministic rupture', ...prop('deterministicRupture'), info: 'Rupture exactly when wall stress exceeds the critical value, instead of a random hazard.' },
};
for (const k of Object.keys(DRUGS)) CONTROLS['drug:' + k] = { type: 'drug', key: 'drugs', drug: k };

const DRUG_SHORT = { propranolol: 'Non-selective beta-blocker', carvedilol: 'Beta-blocker + α1 blockade', terlipressin: 'Vasopressin analogue', octreotide: 'Somatostatin analogue' };

// What the About card says of a vessel: the words by its id, or by its left-hand twin's.
const ABOUT_EDGE = {
    PV_TRUNK: 'Carries about 75% of liver blood flow (≈ 1.1 L/min). Normal Doppler velocity 15–40 cm/s, toward the liver (the mean across the lumen is about 0.57 of that). The portal system has no valves: flow goes wherever the gradient points.',
    C1a: 'The left gastric (coronary) vein feeds the esophageal submucosal plexus: the source of esophageal varices.',
    C1b: 'Esophageal varices drain to the azygos vein and SVC. Modeled wall stress follows ΔP · r / w (an educational index, not a measured stress).',
    C2: 'Short and posterior gastric veins connect the splenic vein to the fundus: the route of isolated gastric varices in splenic vein thrombosis.',
    C3: 'The recanalized paraumbilical vein runs from the left portal vein along the falciform ligament to the umbilicus (caput medusae, Cruveilhier–Baumgarten murmur).',
    C4: 'Superior rectal (portal) ↔ middle and inferior rectal (systemic) veins: anorectal varices, not hemorrhoids.',
    C5: 'Gastrorenal shunt: fundal varices → left inferior phrenic / adrenal → left renal vein. The target of BRTO.',
    C6: 'Spontaneous splenorenal shunt: large, can steal portal flow and cause encephalopathy.',
    C7: 'Retroperitoneal veins of Retzius connect mesenteric veins to lumbar and renal veins.',
    C8: 'Periportal (pericholedochal) collaterals bypass an occluded portal vein: cavernous transformation, which stays hepatopetal.',
    C9: 'The ascending lumbar–azygos route decompresses the IVC when its outflow is resistant.',
    TIPS: 'A covered stent from a portal branch to a hepatic vein. Target portosystemic gradient < 12 mmHg. Costs: encephalopathy, liver hypoperfusion, higher cardiac preload.',
    CAUD: 'The caudate lobe drains straight into the IVC through its own short veins, so it is spared (and hypertrophies) in Budd–Chiari syndrome.',
    PRE_R: 'Presinusoidal segment: portal venules in the portal tract. Resistance rises here in schistosomiasis and other non-cirrhotic portal hypertension.',
    SIN_RR: 'Sinusoids: normally low-resistance, fenestrated and compliant. In cirrhosis, collagen in the space of Disse, stellate-cell contraction and capillarization raise their resistance.',
};
const aboutEdge = (e) => ABOUT_EDGE[e.id] || ABOUT_EDGE[e.id.replace(/_L$|L$/, '')] || `${e.label}. Connects ${NODES[NI[e.from]].label} → ${NODES[NI[e.to]].label} (physiological flow direction).`;   // alloc-rare: the About card is made when a vessel is selected

export function createInspector(root, { onWhy, onAction, onOpenTab, onScenarios, onMode, pinned, chart, onBack }) {
  const live = [];        // [el, fn(frame, cell), cell]
  const syncers = [];
  let lastSel;
  const openSections = new Set(['liver', 'drugs', 'procedures', 'inflow', 'live', 'ctl']);

  const liveText = (fn) => { const el = h('span', { class: 'num' }); live.push([el, fn, newCell()]); return el; };   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
  const reg = (el) => { if (el?._sync) syncers.push(el); return el; };

  // ── Control builders ──────────────────────────────
  function slider(c) {
    const { label, min, max, step, get, set, format, normal, info, sub, def } = c;
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label, 'data-def': def ?? null });
    const val = h('span', { class: 'ctl-val' });
    const reset = h('button', { class: 'reset-btn', title: 'Reset', 'aria-label': `Reset ${label}` }, icon('reset'));
    const wrap = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, label, info ? infoButton(info) : null, reset), val),
      // (The normal range is the tiles' green band on the track, placed on the thumb's own scale: its centre runs from half the
      // thumb's width, --tw, to the far end less half of it.)
      h('div', { class: 'range-wrap' }, normal ? h('span', { class: 'normal', title: 'Normal range', style: { left: `calc(var(--tw) / 2 + (100% - var(--tw)) * ${(normal[0] - min) / (max - min)})`, width: `calc((100% - var(--tw)) * ${(normal[1] - normal[0]) / (max - min)})` } }) : null, input),
      sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    const sCell = newCell(), tCell = newCell();   // (the thumb's value and the words beside it, made once per value the slider shows)
    const paint = (v) => {
      const vs = cachedText(sCell, v, strMake, v), vt = cachedText(tCell, v, fnMake, v, format);
      propSoon(input, 'value', vs); if (val.textContent !== vt) val.textContent = vt;
      paintRange(input, (v - min) / (max - min));
      wrap.classList.toggle('changed', def != null && Math.abs(v - def) > 1e-9);
    };
    let fresh = true;
    input.addEventListener('pointerdown', () => { fresh = true; });
    input.addEventListener('keydown', () => { fresh = true; });
    // The thumb and its number follow the pointer at once; the model gets the newest value once per frame, in a task of its own
    // straight after that frame (class-soon runSoon): what the change wakes is built between frames, never inside one.
    let pend = null, raf = 0;
    const send = () => { const p = pend; pend = null; if (p) updateParams((pp) => { set(pp, p.v); return pp; }, { history: p.history, label }); };
    const flush = () => { cancelFrame(raf); raf = 0; if (pend) runSoon(send); };
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      paint(v);
      if (!pend) pend = { history: fresh }; pend.v = v;
      fresh = false;
      if (!raf) raf = nextFrame(flush);
    });
    input.addEventListener('change', flush);
    reset.addEventListener('click', () => {
      if (def == null) return;
      paint(def);
      updateParams((pp) => { set(pp, def); return pp; }, { label: `Reset ${label}` });
    });
    paint(get(store.get().params));
    wrap._sync = (pp) => { if (document.activeElement !== input) paint(get(pp)); if (c.showIf) propSoon(wrap, 'hidden', !c.showIf(pp)); };
    if (c.showIf) wrap.hidden = !c.showIf(store.get().params);
    return wrap;
  }
  function toggle({ label, get, set, info, sub }) {
    const cb = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
    cb.checked = !!get(store.get().params);
    cb.addEventListener('change', () => updateParams((pp) => { set(pp, cb.checked); return pp; }, { label: `${label} ${cb.checked ? 'on' : 'off'}` }));
    const row = h('div', { class: 'ctl' }, h('label', { class: 'toggle-row' }, h('span', { class: 'ctl-label' }, label, info ? infoButton(info) : null), h('span', { class: 'switch' }, cb, h('span'))), sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    row._sync = (pp) => { propSoon(cb, 'checked', !!get(pp)); };
    return row;
  }
  function drugCard(k) {
    const d = DRUGS[k];
    const b = h('button', { class: 'drug', 'aria-pressed': String(!!store.get().params.drugs[k]) },
      h('span', { class: 'dn' }, d.label, h('span', { class: 'dot' }, icon('check'))), h('span', { class: 'dd' }, DRUG_SHORT[k] || ''));
    tooltipFor(b, d.info);
    b.addEventListener('click', () => updateParams((pp) => { pp.drugs[k] = !pp.drugs[k]; return pp; }, { label: d.label }));
    b._sync = (pp) => attrSoon(b, 'aria-pressed', !!pp.drugs[k]);
    return b;
  }
  /** Build any registered control (used by panels). */
  function build(id) {
    const c = CONTROLS[id];
    if (!c) return null;
    const el = c.type === 'slider' ? slider(c) : c.type === 'toggle' ? toggle(c) : drugCard(c.drug);
    return reg(el);
  }
  function section(id, title, ic, count, ...children) {
    const d = h('details', { class: 'section', 'data-id': id },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      h('summary', {}, ic ? svgIcon(ic, 'sec-ic') : null, title, count ? h('span', { class: 'count' }, count) : null, svgIcon('chev-down', 'chev')),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      h('div', { class: 'section-body' }, ...children));   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    if (openSections.has(id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) openSections.add(id); else openSections.delete(id); });   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    return d;
  }
  const whyBtn = (metric, text = 'Why this value?') => h('button', { class: 'btn sm', onclick: (e) => onWhy(metric, e.currentTarget) }, icon('bulb'), text);   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame

  // A details request that names nothing known falls back to the patient chart, as an empty one does.
  const ctl = (ids) => ids.map((id) => build(id));
  const home = () => chart.render(ctl);

  // ── Selection panels ──────────────────────────────
  function selectionHead(kicker, title, extra) {
    return h('div', { class: 'p-head' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      h('div', { class: 'p-head-row' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
        h('button', { class: 'ib', 'aria-label': 'Back', title: 'Back', onclick: () => (onBack ? onBack() : store.set({ details: null })) }, icon('arrow-left')),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
        h('div', { class: 'p-title' }, h('span', { class: 'kicker' }, kicker), h('h2', { title }, title))),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      extra);
  }
  // A selected thing's readings open its panel under its name, with no heading of their own (17 Oct, V9).
  const liveBlock = (...children) => h('div', { class: 'p-live' }, ...children);   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
  function stat(k, fn, wide) { return h('div', { class: 'stat' + (wide ? ' wide' : '') }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, liveText(fn))); }   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame

  function edgePanel(id) {
    const e = EDGES[EI[id]];
    if (!e) return home();
    const k = EI[id];
    const fromN = NODES[NI[e.from]], toN = NODES[NI[e.to]];
    const isColl = e.kind === 'collateral', isArt = e.kind === 'arteriole' || e.kind === 'artery';
    const kicker = isColl ? `Collateral · ${e.code}` : isArt ? 'Artery' : e.kind === 'liver' ? 'Liver microcirculation' : e.kind === 'shunt' ? 'Shunt' : 'Vein';   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    const iFrom = NI[e.from], iTo = NI[e.to];
    const dirEl = h('div', { class: 'p-state' });   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    live.push([dirEl, (f) => {   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      const q = f.Qf[k];
      const ref = store.get().healthy?.Q?.[k] ?? 1;
      const cls = Math.abs(q) < 0.05 ? DIR_WARN : q < -Math.max(0.12, 0.02 * Math.abs(ref)) ? DIR_REV : DIR_OK;
      if (dirEl._c !== cls[1]) { dirEl.replaceChildren(h('span', { class: 'st-word ' + cls[0] }, cls[1])); dirEl._c = cls[1]; }   // alloc-rare: only on the frame the direction's word changes
      return null;
    }, newCell()]);
    const R = (f, c) => { const q = Qof(f)[k]; return Math.abs(q) > 1e-3 ? numText(c, (Pof(f)[iFrom] - Pof(f)[iTo]) / (q * 0.06), 2, ' WU') : '∞'; };   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    const els = [   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      selectionHead(kicker, e.label, dirEl),
      h('div', { class: 'p-body' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
        liveBlock(
          h('div', { class: 'stat-grid' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat(`In · ${fromN.label}`, (f, c) => pressText(c, Pof(f)[iFrom]), true),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat(`Out · ${toN.label}`, (f, c) => pressText(c, Pof(f)[iTo]), true),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Pressure drop', (f, c) => numText(c, Pof(f)[iFrom] - Pof(f)[iTo], 1, ' mmHg')),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Flow', (f, c) => flowText(c, Qof(f)[k] * 0.06)),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Velocity', (f, c) => numText(c, Math.abs(dopplerVel(f, k)), 1, ' cm/s')),   // Doppler (peak), like the callouts   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Diameter', (f, c) => numText(c, f.D[k], 1, ' mm')),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Resistance', R),
            isColl ? stat('Recruitment', (f, c) => numText(c, clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1) * 100, 0, '%')) : stat('Healthy flow', (f, c) => { const q = store.get().healthy?.Q?.[k]; return q != null ? lpmText(c, q * 0.06) : '—'; })),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
          h('div', { class: 'btn-row' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            h('button', { class: 'btn sm', onclick: () => { onAction({ kind: 'probe', id }); onOpenTab('doppler'); } }, icon('doppler'), 'Doppler here'),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            whyBtn(['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L'].includes(id) ? 'pvFlow' : isColl ? 'shunt' : 'pv'))),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      ),
    ];
    const body = els[1];
    body.append(h('p', { class: 'ctl-sub', style: { margin: '12px 0 0' } }, 'Change this vessel from its card on the figure.'));   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    body.append(section('about', 'About this vessel', null, null, h('p', { class: 'sub', style: { margin: 0 } }, aboutEdge(e))));   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    openSections.add('about');
    return els;
  }

  function nodePanel(id) {
    const n = NODES[NI[id]], iN = NI[id];
    return [   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      selectionHead('Compartment', n.label),
      h('div', { class: 'p-body' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
        liveBlock(
          h('div', { class: 'stat-grid' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Pressure', (f, c) => pressText(c, Pof(f)[iN])),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Healthy', (f, c) => { const v = store.get().healthy?.P?.[iN]; return v != null ? numText(c, v, 1, ' mmHg') : '—'; }),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('External pressure (Δ)', (f, c) => numText(c, f.ext[iN], 1, ' mmHg')),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
            stat('Transmural', (f, c) => numText(c, f.P[iN] - f.ext[iN], 1, ' mmHg'))),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
          h('div', { class: 'btn-row' }, whyBtn(id === 'RA' ? 'ra' : id === 'AO' ? 'map' : id === 'VAR' ? 'varix' : 'pv'))),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
        section('connections', 'Connected vessels', null, null, h('div', { class: 'btn-row' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
          EDGES.filter((e) => (e.from === id || e.to === id) && e.kind !== 'wedge').map((e) => h('button', { class: 'btn sm', onclick: () => store.set({ details: { type: 'edge', id: e.id }, selection: { type: 'edge', id: e.id } }) }, e.label || e.id))))),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    ];
  }

  const ORGAN_ABOUT = {
    liver: ['Organ', 'Liver', 'Blood crosses three resistances in series: portal venules (presinusoidal), sinusoids and central veins (postsinusoidal). Cirrhosis raises sinusoidal resistance; schistosomiasis raises it in the portal tracts; sinusoidal obstruction syndrome, in the central veins. The hepatic artery buffers falls in portal flow.', [['Sinusoids (R)', (f, c) => pressText(c, Pof(f)[NI.SIN_R])], ['HVPG', (f, c) => (hiddenNow()?.has('trueHVPG') ? 'Not measured' : numText(c, f.metrics.hvpg, 1, ' mmHg'))], ['Liver perfusion', (f, c) => numText(c, f.metrics.liverPerfPct, 0, '%')], ['Hepatic artery flow', (f, c) => lpmText(c, f.metrics.arterialIn)]], 'hvpg'],
    heart: ['Organ', 'Right heart', 'The right atrium is where both cavae end. Its pressure is the floor of the whole venous system: a failing right ventricle or tricuspid regurgitation raises every pressure upstream, including the hepatic veins, so the HVPG stays normal.', [['Right atrium', (f, c) => pressText(c, Pof(f)[NI.RA])], ['Cardiac output', (f, c) => lpmText(c, f.metrics.co)], ['MAP', (f, c) => numText(c, f.metrics.map, 0, ' mmHg')], ['Heart rate', (f, c) => numText(c, f.metrics.hr, 0, ' /min')]], 'ra'],
    varices: ['Collateral bed', 'Esophageal varices', 'Submucosal veins of the lower esophagus fed by the left gastric (coronary) vein and draining to the azygos. Wall stress follows Laplace: σ = ΔP · r / w, so large thin-walled varices rupture.', [['Pressure', (f, c) => pressText(c, Pof(f)[NI.VAR])], ['Diameter', (f, c) => numText(c, f.metrics.varix.d, 1, ' mm')], ['Wall stress', (f, c) => numText(c, f.metrics.varix.ratioShown * 100, 0, '% of rupture')], ['Grade', (f) => f.metrics.varix.grade.label]], 'varix'],
    gastric: ['Collateral bed', 'Fundal varices', 'Fed by the short and posterior gastric veins, often draining through a gastrorenal shunt to the left renal vein. They bleed at lower pressures than esophageal varices; BRTO occludes the shunt.', [['Pressure', (f, c) => pressText(c, Pof(f)[NI.GV])], ['Diameter', (f, c) => numText(c, f.metrics.gastricVarix.d, 1, ' mm')], ['Wall stress', (f, c) => numText(c, f.metrics.gastricVarix.ratioShown * 100, 0, '% of rupture')]], 'varix'],
    spleen: ['Organ', 'Spleen', 'Portal hypertension congests and enlarges the spleen, which sequesters platelets. Splenic vein thrombosis isolates it: sinistral portal hypertension with fundal varices.', [['Length', (f, c) => numText(c, f.metrics.spleen.length, 1, ' cm')], ['Platelets (illustrative)', (f, c) => cachedText(c, Math.round(f.metrics.spleen.platelets), pltMake, 0)]], 'spleen'],
    abdomen: ['Peritoneum', 'Abdomen & ascites', 'Ascites forms when filtration from the sinusoids and gut capillaries outpaces lymph drainage (Starling). Sinusoidal pressure and albumin decide the balance; intra-abdominal pressure rises as it accumulates.', [['Ascites', (f, c) => numText(c, f.metrics.ascites.volume / 1000, 2, ' L')], ['Formation', (f, c) => numText(c, liveBalance(f.metrics.ascites.ratePerDay), 0, ' mL/day')], ['IAP', (f, c) => numText(c, f.metrics.ascites.iap, 1, ' mmHg')], ['Hepatic lymph', (f, c) => numText(c, f.metrics.ascites.hepLymph, 1, ' mL/min')]], 'ascites'],
  };
  function organPanel(id) {
    const o = ORGAN_ABOUT[id];
    if (!o) return home();
    const [kicker, title, about, stats, why] = o;
    return [selectionHead(kicker, title), h('div', { class: 'p-body' },   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      liveBlock(h('div', { class: 'stat-grid' }, stats.map(([k, fn]) => stat(k, fn))), h('div', { class: 'btn-row' }, whyBtn(why))),   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
      section('about', 'About', null, null, h('p', { class: 'sub', style: { margin: 0 } }, about)))];   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
  }


  // ── Render ────────────────────────────────────────
  function render() {
    live.length = 0; syncers.length = 0;
    releaseWords(root);   // (the old panel's GPU words let go before it is replaced)
    const sel = store.get().details;
    const els = !sel ? home() : sel.type === 'advanced' ? chart.renderAdvanced(ctl) : sel.type === 'edge' ? edgePanel(sel.id) : sel.type === 'node' ? nodePanel(sel.id) : sel.type === 'organ' ? organPanel(sel.id) : home();
    const scroller = root.closest('.panel') || root;
    const top = scroller.scrollTop;
    root.replaceChildren(...els.filter(Boolean));   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    if (sel === lastSel) scroller.scrollTop = top;
    lastSel = sel;
    if (store.get().frame) update(store.get().frame);
  }

  function update(f) {
    for (const [el, fn, c] of live) { const v = fn(f, c); if (v != null) putText(el, v); }   // (GPU words: the page's own text is written only at rest, never in a frame)
    if (!store.get().details) chart?.update(f);
  }

  store.on('details', render);
  document.addEventListener('pps:rerender-panel', render);
  for (const k of ['presetId', 'mode', 'hiddenReadouts', 'showHvpg']) store.on(k, () => { if (!store.get().details) render(); });
  store.on('params', () => { const p = store.get().params; for (const s of syncers) s._sync(p); });
  return {
    render, update,
    /** Detached controls; they keep themselves in sync with params. */
    buildControls(ids) {
      const els = ids.map((id) => { const c = CONTROLS[id]; if (!c) return null; return c.type === 'slider' ? slider(c) : c.type === 'toggle' ? toggle(c) : drugCard(c.drug); }).filter(Boolean);
      const off = store.on('params', () => { const p = store.get().params; for (const e of els) e._sync?.(p); });
      return { els, dispose: off };
    },
  };
}

// ── What differs from a healthy default patient ─────
// Every change is one record that stays, by its key (a vessel's thrombus is always the same record), and carries its words: a
// change whose number moves is worded once per number (its `t` keeps them), so asking again builds nothing. The list handed back
// is one array, emptied and filled afresh by each call: a caller reads it at once and does not hold it across another call.
const ZONES = ['pre', 'sin', 'post'], FIB_LOBE = ['fib:R:', 'fib:L:'], LOBE_OF = ['R', 'L'];
const ZONE_WORD = { pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' };
const edgeName = (id) => EDGES[EI[id]]?.label || id;
const changes = [];
/** A change worded by a number: pre + the number + suf. */
const numbered = (key, pre, suf, remove) => ({ key, label: '', v: UNSET, t: new Map(), pre, suf, remove });   // alloc-rare: made once, the first time that change is shown (or at load), then kept by its key
/** A change worded in full. */
const worded = (key, label, remove) => ({ key, label, remove });   // alloc-rare: made once, the first time that change is shown (or at load), then kept by its key
const numberLabel = (e, v, scale, digits) => {
  const s = `${e.pre}${digits === -2 ? v : digits < 0 ? Math.round(v * scale) : (v * scale).toFixed(digits)}${e.suf}`;   // alloc-rare: each number of a change is worded once (e.t keeps it)
  if (e.t.size > 256) e.t.clear();
  e.t.set(v, s);
  return s;
};
/** Puts the change in the list, worded for its number (as a percent of `scale`, to `digits` places; -1 whole, -2 as it stands). */
function put(e, v, scale, digits) {
  if (!Object.is(e.v, v)) { e.v = v; e.label = e.t.get(v) ?? numberLabel(e, v, scale, digits); }
  changes.push(e);
}
// (Changes of a vessel or a drug: one record each, made the first time it is seen.)
const BY_ID = { 'fib:': new Map(), 'fib:R:': new Map(), 'fib:L:': new Map(), 'sten:': new Map(), 'thr:': new Map(), 'drug:': new Map(), 'cs:': new Map(), 'occ:': new Map() };
const MAKE_BY_ID = {
  'fib:': (z) => numbered('fib:' + z, `${ZONE_WORD[z]} fibrosis ×`, '', (q) => { q.fibrosis.R[z] = 1; q.fibrosis.L[z] = 1; }),   // alloc-rare: made once per zone
  'fib:R:': (z) => numbered(`fib:R:${z}`, `${ZONE_WORD[z]} fibrosis, right lobe ×`, '', (q) => { q.fibrosis.R[z] = 1; }),   // alloc-rare: made once per zone
  'fib:L:': (z) => numbered(`fib:L:${z}`, `${ZONE_WORD[z]} fibrosis, left lobe ×`, '', (q) => { q.fibrosis.L[z] = 1; }),   // alloc-rare: made once per zone
  'sten:': (id) => numbered('sten:' + id, `${edgeName(id)} narrowed `, '%', (q) => { delete q.stenosis[id]; }),   // alloc-rare: made once per vessel
  'thr:': (id) => numbered('thr:' + id, `${edgeName(id)} thrombus `, '%', (q) => { delete q.thrombus[id]; }),   // alloc-rare: made once per vessel
  'drug:': (k) => worded('drug:' + k, DRUGS[k].label, (q) => { q.drugs[k] = false; }),   // alloc-rare: made once per drug
  'cs:': (id) => numbered('cs:' + id, `${edgeName(id)} `, ' mm', (q) => { const c = { ...(q.customShunts || {}) }; delete c[id]; q.customShunts = c; }),   // alloc-rare: made once per vessel
  'occ:': (id) => worded('occ:' + id, id === 'C5' ? 'BRTO (gastrorenal shunt occluded)' : edgeName(id) + ' occluded', (q) => { delete q.occluded[id]; }),   // alloc-rare: made once per vessel
};
const dyn = (prefix, id) => BY_ID[prefix].get(id) ?? madeDyn(prefix, id);
const madeDyn = (prefix, id) => { const e = MAKE_BY_ID[prefix](id); BY_ID[prefix].set(id, e); return e; };
// (The rest are one record each, made when this file loads.)
const C = {
  cirrhosis: numbered('cirrhosis', 'Cirrhosis ', '%', (q) => { q.cirrhosis = 0; }),
  splenectomy: worded('splenicRx', 'Splenectomy', (q) => { q.splenicRx = 0; }),
  embolization: worded('splenicRx', 'Partial splenic embolization', (q) => { q.splenicRx = 0; }),
  tips: numbered('tips', 'TIPS ', ' mm', (q) => { q.tips.on = false; }),
  dips: numbered('dips', 'DIPS ', ' mm', (q) => { q.dips.on = false; }),
  portocaval: worded('portocaval', 'Portocaval shunt', (q) => { q.portocaval = false; q.portocavalSide = false; }),
  portocavalSide: worded('portocaval', 'Portocaval shunt (side-to-side)', (q) => { q.portocaval = false; q.portocavalSide = false; }),
  dsrs: worded('dsrs', 'Distal splenorenal shunt', (q) => { q.dsrs = false; }),
  mesocaval: worded('mesocaval', 'Mesocaval shunt', (q) => { q.mesocaval = false; }),
  rex: worded('rex', 'Meso-Rex bypass', (q) => { q.rex = false; }),
  balloonGas: worded('balloonGas', 'Gastric balloon', (q) => { q.balloonGas = false; q.balloonEso = false; }),   // (the esophageal balloon goes on a tube whose gastric balloon is up: it comes off with it)
  balloonEso: worded('balloonEso', 'Esophageal balloon', (q) => { q.balloonEso = false; }),
  splTone: numbered('splTone', 'Splanchnic tone ×', '', (q) => { q.splanchnicTone = 1; }),
  meal: worded('meal', 'After a meal', (q) => { q.meal = 0; }),
  sysTone: numbered('sysTone', 'Systemic tone ×', '', (q) => { q.systemicTone = 1; }),
  contractility: numbered('contractility', 'RV contractility ', '%', (q) => { q.contractility = 1; }),
  tr: numbered('tr', 'Tricuspid regurgitation ', '%', (q) => { q.tr = 0; }),
  pericardial: numbered('pericardial', 'Pericardial constraint ', '%', (q) => { q.pericardial = 0; }),
  apShunt: numbered('apShunt', 'Arterioportal shunting ', '%', (q) => { q.apShunt = 0; }),
  habr: numbered('habr', 'Arterial buffer ×', '', (q) => { q.habrStrength = 1; }),
  gestation: numbered('gestation', 'Pregnancy ', ' weeks', (q) => { q.gestation = 0; }),
  albumin: numbered('albumin', 'Albumin ', ' g/dL', (q) => { q.albumin = 4; }),
  diuretics: worded('diuretics', 'Diuretics', (q) => { q.diuretics = false; }),
  anticoag: worded('anticoag', 'Anticoagulation', (q) => { q.anticoag = false; }),
  C5: worded('C5', 'No gastrorenal shunt (no fundal varices)', (q) => { q.spontaneous.C5 = true; }),
  C6: worded('C6', 'Splenorenal shunt', (q) => { q.spontaneous.C6 = false; }),
};

export function activeInterventions(p) {
  changes.length = 0;
  if (p.cirrhosis > 0) put(C.cirrhosis, p.cirrhosis, 100, -1);
  for (let i = 0; i < 3; i++) {
    const z = ZONES[i], r = p.fibrosis.R[z], l = p.fibrosis.L[z];
    if (r !== 1 && Math.abs(r - l) < 1e-9) put(dyn('fib:', z), r, 1, r < 10 ? 1 : 0);
    else for (let j = 0; j < 2; j++) { const x = p.fibrosis[LOBE_OF[j]][z]; if (x !== 1) put(dyn(FIB_LOBE[j], z), x, 1, 1); }
  }
  for (const id in p.stenosis) put(dyn('sten:', id), p.stenosis[id], 100, -1);
  for (const id in p.thrombus) put(dyn('thr:', id), p.thrombus[id], 100, -1);
  for (const k in p.drugs) if (p.drugs[k]) changes.push(dyn('drug:', k));
  if (p.splenicRx) changes.push(p.splenicRx === 2 ? C.splenectomy : C.embolization);
  if (p.tips.on) put(C.tips, p.tips.d, 1, -2);
  if (p.dips.on) put(C.dips, p.dips.d, 1, -2);
  if (p.portocaval) changes.push(p.portocavalSide ? C.portocavalSide : C.portocaval);
  if (p.dsrs) changes.push(C.dsrs);
  if (p.mesocaval) changes.push(C.mesocaval);
  if (p.rex) changes.push(C.rex);
  const cs = p.customShunts;
  if (cs) for (const id in cs) put(dyn('cs:', id), cs[id], 1, -2);
  if (p.balloonGas) changes.push(C.balloonGas);
  if (p.balloonEso) changes.push(C.balloonEso);
  for (const id in p.occluded) changes.push(dyn('occ:', id));
  if (p.splanchnicTone !== 1) put(C.splTone, p.splanchnicTone, 1, 2);
  if (p.meal > 0) changes.push(C.meal);
  if (p.systemicTone !== 1) put(C.sysTone, p.systemicTone, 1, 2);
  if (p.contractility !== 1) put(C.contractility, p.contractility, 100, -1);
  if (p.tr > 0) put(C.tr, p.tr, 100, -1);
  if (p.pericardial > 0) put(C.pericardial, p.pericardial, 100, -1);
  if (p.apShunt > 0) put(C.apShunt, p.apShunt, 100, -1);
  if (p.habrStrength !== 1) put(C.habr, p.habrStrength, 1, 2);
  if (p.gestation > 0) put(C.gestation, p.gestation, 1, -1);
  if (p.albumin !== 4) put(C.albumin, p.albumin, 1, 1);
  if (p.diuretics) changes.push(C.diuretics);
  if (p.anticoag) changes.push(C.anticoag);
  if (p.spontaneous.C5 === false) changes.push(C.C5);
  if (p.spontaneous.C6) changes.push(C.C6);
  return changes;
}
