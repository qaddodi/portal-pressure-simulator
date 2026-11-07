// The guideline path card's algorithms (the first two; since 7 Nov 2026 every one is a module in path-algos/, this file is their registry) and the patient's place on them (7 Nov 2026, Mohammad's pick: the whole chart on a Mac or
// an iPad held sideways, the map and a reading on a phone; mocks at artifact QxXCFjXnD8dSki5UWgYWxG and G8n2ujW8wXL8sVxXpmygqx).
// Plain data and plain functions, no page: tool-path.js draws them, tests/path-card.test.js holds them.
//
// Checked on the PDFs in guidelines/ (Baveno VIII, J Hepatol 2026):
//   first visit  Fig. 1 and 1.3, 1.14 to 1.17, 1.19: LSM <10 kPa rules cACLD out; LSM ≤15 kPa with platelets ≥150 ×10⁹/L rules CSPH out;
//                LSM ≥25 kPa rules CSPH in (viral, alcohol, non-obese MASLD); between, or with platelets <150, is the gray zone, where an
//                ANTICIPATE (ANTICIPATE-NASH at a BMI ≥30) or NICER probability ≥75%, or an SSM >55 kPa rules CSPH in (the figure prints
//                ≥55; the statement, 1.16c, and SSM_CUTS use >55). With nothing ruling it in: repeat the tests at 12 months or add SSM, and
//                a patient who cannot take a beta-blocker has the screening scope unless LSM <20 kPa with platelets ≥150, or SSM <40 kPa.
//   acute bleed  Fig. 3 and 5.4, 5.16, 5.18, 5.20, 5.31, 5.35 to 5.37, 5.39 to 5.41: a bleed from an oesophageal varix or GOV1 is banded;
//                controlled, a pre-emptive TIPS within 72 h (ideally 24) for Child–Pugh C 10–13, or B 8–9 with active bleeding at endoscopy,
//                or HVPG ≥20 mmHg, with age <75, creatinine <3 mg/dL and no heart failure; otherwise carvedilol with banding every 2–4
//                weeks. Not controlled: a covered stent as a bridge, then salvage TIPS. GOV2 or IGV1: two phases in parallel, the acute one
//                (EUS-guided coil with cyanoacrylate, else cyanoacrylate) and the definitive one, TIPS ± embolisation as soon as possible
//                for Child–Pugh C <14 with the same age, creatinine and heart conditions, else other options after a team discussion.
// Not in the model, so a slide states them as the case's own facts: the ANTICIPATE probability, a BMI, the Child–Pugh score, active
// bleeding at endoscopy, whether banding controlled the bleed, and fitness for TIPS.

import first from './path-algos/first-visit.js';
import bleed from './path-algos/bleed.js';
import gastric from './path-algos/gastric.js';
import ascites from './path-algos/ascites.js';
import stopcarv from './path-algos/stopcarv.js';
import holdcarv from './path-algos/holdcarv.js';
import secprop from './path-algos/secprop.js';
import psvdscope from './path-algos/psvdscope.js';
import pvtocc from './path-algos/pvtocc.js';
import pvtdur from './path-algos/pvtdur.js';
import aasld from './path-algos/aasld.js';
import { leavesOf, cpClass } from './path-algos/helpers.js';

/** Every algorithm by the name a slide gives (tool { kind: 'path', of }): its module (path-algos/<id>.js, the contract in each file's shape). */
export const ALGOS = Object.fromEntries([first, bleed, gastric, ascites, stopcarv, holdcarv, secprop, psvdscope, pvtocc, pvtdur, aasld].map((a) => [a.id, a]));
export const DEFAULT_OF = 'first-visit';
/** The algorithm a tool names (an unknown name is the first-visit chart). */
export const algoOf = (of) => ALGOS[of] || ALGOS[DEFAULT_OF];
export const knownOf = (of) => (ALGOS[of] ? of : DEFAULT_OF);

export const FIRST_VISIT = first.tree;
export const BLEED = bleed.tree;
export { leavesOf, cpClass };
/** The short name in a slide's tab. */
const SHORT = { 'first-visit': 'First-visit path', bleed: 'Bleed path', gastric: 'Gastric bleed path', ascites: 'Ascites path', stopcarv: 'Stop carvedilol?', holdcarv: 'Hold carvedilol?', secprop: 'Next-bleed path', psvdscope: 'PSVD scope?', pvtocc: 'Clot occlusion', pvtdur: 'Clot duration', aasld: 'Rule of five' };
/** What the card needs of an algorithm by name: its tree (or rows), the pill's words, the foot, the screen-reader name. */
export const PATHS = Object.fromEntries(Object.values(ALGOS).map((a) => [a.id, { tree: a.tree, kick: a.source, foot: a.cite, label: a.label, short: SHORT[a.id] || a.label, kind: a.kind }]));
/** The words under each node of the phone's map (one or two short lines). */
export const mapWordsOf = (of, id) => algoOf(of).mapWords?.[id] || null;

export const litOf = (of, p) => algoOf(of).lit(p);
export const litFirst = first.lit;
export const litBleed = bleed.lit;
/** The outcome a lit set ends in: the leaf the phone's reading is written for. */
export const outcomeOf = (of, L) => algoOf(of).outcomeOf(L);
export const OUTCOMES = Object.fromEntries(Object.values(ALGOS).map((a) => [a.id, a.outcomes]));
/** The phone's reading for one outcome: { head, tone, stmt, why, next }, in words, from the patient's own numbers. */
export const readingFor = (of, key, p) => algoOf(of).reading(key, p);
/** The patient's numbers as a short list of words ('LSM 31 kPa', 'Child–Pugh C11'), for the card's header. */
export const chipsOf = (of, p) => algoOf(of).chips(p);
/** The patient a slide's tool names: the slide's own facts (tool.patient), over which the live model's readings go where it has them. */
export const patientFor = (t, fp, shown = (k, v) => v) => algoOf(t?.of).patientFor(t, fp, shown);
/** The longest patient each algorithm can print (every chip, the widest numbers), so a card reserves room for any patient: it never changes size. */
export const WORST = Object.fromEntries(Object.values(ALGOS).map((a) => [a.id, a.worst]));
