# Naming the circulation engine

2 Nov 2026. Shelved decision doc: not adopted yet, no code uses these names.

The engine is two things that ship together: the haemodynamics model (pressures, flows, resistances, compliances) and the GPU renderer that draws it. Today it runs the portal circulation. Later it may run pulmonary hypertension and systemic hypertension, and join several beds into one circuit. So the name has to fit pressure and flow in general, not the liver. That rules out Glisson and Hepar as the engine name, though Glisson is still useful for the portal module (see the module scheme below).

The clash checks are quick web searches, not a trademark search. Before the name goes anywhere public, a proper search in the US and EU registers is still needed.

## Shortlist

**1. Hales.** Stephen Hales, an English clergyman, put a brass tube into a horse's carotid artery in 1733 and watched the blood rise about 8 feet up a glass column. It was the first direct measurement of blood pressure, written up in *Haemastaticks*. Few names fit a pressure simulator this well: the app is about pressure gradients, and Hales started the field. It covers arterial, venous and pulmonary pressure equally, so it carries over to systemic and pulmonary hypertension without strain. The word is short, easy to say and easy to spell. Clash check: no physiology engine or simulator by that name. There is an unrelated clinic software called Hale and a product called Hale.med, both spelled without the s, and neither does simulation of circulation. Low risk.

**2. Kirchhoff.** Gustav Kirchhoff's laws say flow into a junction equals flow out, and pressure drops around a loop add up. A lumped circulation model is exactly this: an electrical-analogue network of resistors and capacitors. It is the most honest name for an engine meant to connect modules, because connecting modules is a Kirchhoff problem. The cost is the spelling (two h's, double f), and learners will not know why it is named after a physicist. Clash check: nothing medical found. The name is crowded in physics and electronics, so it is hard to search for.

**3. Windkessel.** German for "air chamber", from the fire engines whose air dome turned pulsed pumping into steady flow. Otto Frank used it in 1899 for how the aorta smooths each heartbeat, and it is still the standard name for lumped arterial models. It fits systemic hypertension well and pulmonary arteries fairly well. It fits the portal vein poorly, which is low pressure and barely pulsatile. Clash check: it is a generic model term used in hundreds of papers and code libraries, so it cannot be owned or found in a search.

**4. Torr.** The unit named after Evangelista Torricelli, who built the first mercury barometer in 1643. One torr is very close to one mmHg, the unit on every number in the app. It is four letters and works as a prefix. The downside is that it sounds like the Tor anonymity network when spoken, and most clinicians say "mmHg", not "torr". Clash check: no medical engine called Torr. The sound-alike with Tor is the real problem.

**5. Guyton.** Arthur Guyton's circulation model (1972) was the first large computer model of blood pressure control, and his venous return curves are still taught. A good name for an engine that will one day link the heart, vessels and kidneys. Clash check: real risk. HumMod and SAPHIR are both described as Guyton-based models, so "Guyton" already reads as a specific model family. People would assume the app runs his equations.

**6. Harvey.** William Harvey showed in 1628 that blood goes round in a circuit. The meaning is perfect for a multi-organ platform. Clash check: fails. "Harvey, the Cardiopulmonary Patient Simulator" is a well-known mannequin from the Gordon Center in Miami, sold by Laerdal. Same field, same word.

**7. Starling.** Ernest Starling: the Frank-Starling law of the heart and the Starling forces across capillaries. Clash check: fails. Baxter sells the Starling Fluid Management Monitoring System, a haemodynamic monitor. A doctor hearing "Starling engine" would think of that device.

**8. Poiseuille.** Jean Poiseuille measured flow in narrow tubes, and his law (with Hagen) ties resistance to the fourth power of the radius. Central to everything the model computes. It is hard to spell and most English speakers are unsure how to say it ("pwah-ZOY" or "pwah-ZEE"). Clash check: only the law and the old unit of viscosity. Clear, but awkward to use every day.

**9. Isobar.** A line of equal pressure, as on a weather map. It fits the renderer side best: pressure fields, gradients and colour bands across the vessels. It is neutral about organs. Clash check: Isobar was a large digital agency owned by Dentsu. It has since been folded into other brands, but the name is still well known in tech.

**10. Rete.** Latin for "net", as in rete mirabile, the "wonderful net" of vessels in some animals. Short, and it suggests a network of beds. Clash check: fails in software. The Rete algorithm is the classic engine inside rule engines such as Drools, and Rete.js is a popular node editor library. "Rete engine" already means something.

**11. Arbor.** The vascular tree. Clash check: fails. Arbor is an established open-source neuron simulator.

**12. Pulse.** Listed only because it is the obvious idea. Clash check: fails outright. The Pulse Physiology Engine from Kitware is an open-source human physiology engine, which is exactly what this would be compared with.

## Module scheme

Two layers work well together.

The first is the plain label a learner sees. Name each module by its circulation and add nothing clever: "Hales Portal", "Hales Pulmonary", "Hales Systemic". The join between modules is "the circuit", so a later combined case reads "Hales circuit: portal and systemic". In code the same structure becomes `hales/core` (the solver and node network), `hales/render` (the GPU renderer, glass and text), and `hales/portal`, `hales/pulmonary`, `hales/systemic` for the beds.

The second layer is optional internal codenames, one per bed, each a person who first measured or described that bed. These stay in the repo and release notes, never on a teaching card:

- Portal: **Glisson**. Francis Glisson described the liver's capsule and portal vessels in 1654.
- Pulmonary: **Cournand**. André Cournand put catheters in the right heart and pulmonary artery and shared the 1956 Nobel prize for it, which is where pulmonary artery pressure measurement starts.
- Systemic: **Korotkov**. Nikolai Korotkov described the sounds used for cuff blood pressure in 1905. (Riva-Rocci, who built the cuff, is the other choice, but a hyphen in a codename is a nuisance.)

This keeps the founder story for people who like it, and keeps learner text plain.

## Recommendation

Hales. It is the only name on the list that is about pressure itself, covers every vascular bed the engine might ever run, is short enough to say a hundred times a day, and has no clash in medical simulation that turned up in a search. Kirchhoff is the runner-up if the network side of the engine matters more to you than the pressure side. Use the plain module labels for learners and keep Glisson, Cournand and Korotkov as internal codenames if you want them.

## Sources for the clash checks

- Harvey simulator: https://www.laerdal.com/in/products/simulation-training/nursing/harvey-the-cardiopulmonary-patient-simulator
- Baxter Starling: https://www.baxter.com/healthcare-professionals/hospital-care/starling-fluid-management-monitoring-system
- Pulse Physiology Engine: https://pulse.kitware.com/_about_pulse.html
- Guyton-based SAPHIR model: https://www.physoc.org/abstracts/saphir-a-guyton-based-extensible-modular-core-model-of-blood-pressure-regulation-for-the-physiome/
- Arbor neuron simulator: https://gitlab.ebrains.eu/arbor-sim
- Hales and *Haemastaticks*: https://pubmed.ncbi.nlm.nih.gov/7884783/
- Hale.med: https://slashdot.org/software/comparison/Hale.med-vs-Medcases-Virtual-Patient/
