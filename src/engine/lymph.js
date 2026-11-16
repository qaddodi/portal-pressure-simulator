// The liver's and the gut's lymph: how fast it forms, the tissue pressure it meets and what the lymphatics can carry (engine.js starling,
// slowProcesses). One copy, read by the engine and by the fluid card's forces (tool-fluid.js), so the two cannot drift apart.

// Lymph (16 Nov 2026, Mohammad: the liver's lymph must rise with the sinusoidal pressure, level off at the lymphatics' capacity, and never
// fall below its healthy rate; ascites is what is made beyond that capacity). In cirrhosis hepatic and thoracic duct lymph flow rise many
// times over (the duct from about 1 L/day to 8–20 L/day, and it dilates): ascites forms when the sinusoids and the splanchnic capillaries
// make lymph faster than the lymphatics return it. Rates are mL/min (× 1440 for a day).
// - Formation, per bed, by Starling: the liver's hepBase (its healthy rate) plus kfHep for each mmHg of net filtration pressure beyond the
//   healthy liver's offset (`hepOffset`), so it rises with the sinusoidal pressure without limit and never falls below hepBase; the gut's
//   likewise from its capillary pressure (kfSpl, beyond its basal lymph, PROT.gutBase).
// - The back-pressure the filtrate meets is the liver tissue's (`tissueP`), which the belly's pressure presses on. The model's sinusoids
//   take only part of a rise in the belly's pressure (about a third, through the portal vein; their nodes are not themselves in the belly),
//   though in life the liver and its sinusoids are pressed together. So the tissue's pressure leaves out `iapShare` of the rise, up to
//   `iapGap` mmHg (reached at 20 mmHg, tense ascites), and takes the whole of any rise beyond that. Up to tense ascites the belly's
//   pressure is then a small brake (about 0.3 mmHg of filtration pressure per mmHg) and the lymph stays many times its usual flow; past
//   it the brake is whole, so more ascites, a higher pressure and more lymph can never feed on each other (the ascites cannot run away).
// - Capacity (slow.lymphCap): `base` in a healthy adult (about 7.2 L/day, several times what a healthy liver and gut make: the lymphatics'
//   reserve); it remodels toward chronic demand (the duct and the hilar lymphatics dilate) by `adaptFrac` of the demand beyond it, over
//   two to three weeks (`adapt` per day), and levels off at `max` (about 14 L/day). What the lymphatics carry is the lymph made up to that
//   capacity; the rest is ascites.
export const LYMPH = { hepBase: 0.5, hepOffset: 0.75, kfHep: 0.9, kfSpl: 0.25, iapShare: 0.4, iapGap: 6, base: 5, max: 10, adapt: 0.06, adaptFrac: 0.55 };
/** The tissue pressure the sinusoidal and gut filtrate meets (mmHg) at a belly pressure `iap` (5 at rest): the belly's own, less the part of
 *  its rise the sinusoids already take (LYMPH.iapShare, up to iapGap mmHg). Continuous, and never below 5 + (1 − iapShare) of the rise. */
export const tissueP = (iap) => { const d = (iap ?? 5) - 5; return 5 + d - Math.min(LYMPH.iapShare * Math.max(0, d), LYMPH.iapGap); };
/** The oncotic pull across the sinusoid wall (mmHg) at serum albumin `alb` (g/dL) and wall reflection coefficient `sigH`. */
export const sinusoidPull = (alb, sigH) => { const pic = 25 * (alb / 4); return sigH * (pic - pic * (1 - sigH) * 0.9); };
/** The liver's lymph (mL/min) for a push `out` (mmHg: the mid-sinusoidal pressure less the tissue's) against a pull `pull`. */
export const hepLymphOf = (out, pull) => LYMPH.hepBase + LYMPH.kfHep * Math.max(0, out - pull - LYMPH.hepOffset);
/** The push back out of a liver lymph rate: the inverse of hepLymphOf (null at its floor, where the lymph does not tell the push). */
export const pushOfHepLymph = (hep, pull) => (hep > LYMPH.hepBase + 1e-9 ? (hep - LYMPH.hepBase) / LYMPH.kfHep + pull + LYMPH.hepOffset : null);
