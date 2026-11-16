// The landmark trials a trial card (tool { kind: 'trial', id }, tool-trial.js) can show: the arms, the share of each arm that had the
// outcome, who was enrolled, how long they were followed and where it was published.
//
// Every number here is from the reviewer's audited evidence tables (guidelines/trials-audit-2026-11-14.md, 14 Nov 2026), and only a value the
// audit gives as reported (never one it marks Calculated): nothing is rounded, worked out or back-calculated from a percent. Where the audit does
// not give a field, the field is left out (or null). The sources and what was read from each are in guidelines/trials.md, which
// tests/trials.test.js keeps in step with this file. A trial whose numbers were not read from an audited source is status 'unchecked', and its card
// says so.
//
//   name       the card's title
//   short      a row name of at most 22 characters, for a list of trials
//   group      the list section: 'decomp' | 'bleed' | 'ascites' | 'kidney' | 'infection' | 'he'
//   journal, year, firstAuthor    the source line
//   pmid, doi  the PubMed id (a string of digits) and the DOI (or null), as the audit gives them
//   n          people randomized (what the trial calls randomized or enrolled, not the number analyzed; ATTIRE: unique patients randomized)
//   setting    who was enrolled, one line
//   followUp   how long they were followed, as the source words it, or the time of the outcome; null where the audit gives neither (PREDESCI)
//   endpoint   what the percentages count
//   better     'lower' | 'higher': which way is better for the arm's rate (the card draws no good/bad colours; the words carry it)
//   arms       [{ label, rate, n?, events?, side: 'treat' | 'control' }], the treated arm first, then the control arm(s) (three arms: CAVARLY).
//              rate is the reported percent, a whole number or one decimal when that is what was reported (CALIBRE 3.8 against 7.6);
//              n the people in that arm (analyzed, or randomized where that is all the source gives); events the integer numerator, only when
//              the audit reports it. Empty only for a trial that reported no result per arm (MACHT): its card shows no bars.
//   km         true when the arm rates are Kaplan–Meier (actuarial) probabilities rather than shares of counted patients
//   effect     the trial's own headline effect size, with its confidence interval, as one line of words, or null
//   ratios     [{ kind: 'HR' | 'OR' | 'RR', est, lo, hi, of, vs? }] the trial's own reported ratios with their 95% CI, the primary endpoint first;
//              of the endpoint in words (marked adjusted where the trial adjusted it), vs the comparison in a three-arm trial. [] when none
//              with a CI was reported. Numbers are as printed, so 0.50 is held as 0.5 and CAVARLY keeps its three decimals (0.192).
//   bav        the Baveno VIII statement numbers that bear on the trial's question, each found in guidelines/baveno-viii-2026.pdf; [] when none
//              corresponds. A statement can be a counterpoint (Fernández 2007: 4.12 advises against long-term primary prophylaxis); the note says so.
//   entry      [{ rule, test, value?, minor? }] the entry rules the audit verified, in short clinical words. minor: true marks fine print that does not
//              define who was enrolled (an age band, a platelet floor, timing, the treatment given first); every other rule is a defining rule, and
//              a trial reads "fits" only when each defining rule was checked and met (trial-fit.js, 15 Nov 2026). test is a key of the trial-fit vocabulary
//              (src/ui/trial-fit.js) when the model can check the rule, or null when it cannot:
//                'cirrhosis' 'hvpg_ge' (value mmHg) 'compensated' (no ascites) 'ascites' 'varices_not_high_risk' (no or small varices)
//                'varices_medium_large' 'gastric_varices' 'acute_bleed' (acute variceal or GI bleeding) 'tips' (a TIPS in place) 'no_tips'
//                'varices_high_risk' (≥5 mm or red wale signs) 'varices_present' 'albumin_lt' (value g/dL) 'platelets_ge' (value ×1000/µL)
//                'ascitic_protein_lt' (value g/dL) 'diuretics' 'decompensated' (ascites or a bleed now, or a case author's history)
//              A rule whose fact the model holds must use its test, never null (tests/trial-fit-checkable.test.js, TC-F1). Cirrhosis and no TIPS are
//              context (trial-fit.js CONTEXT_TESTS): they can exclude but are not counted as evidence of a likeness.
//   note       one caveat a learner should keep, or null
//   verified   the reviewer's verification level for the trial, short
//   status     'checked' (numbers from the audited file) | 'unchecked'

/** @typedef {{ label: string, rate: number, n?: number, events?: number, side: 'treat' | 'control' }} TrialArm */
/** @typedef {{ kind: 'HR' | 'OR' | 'RR', est: number, lo: number, hi: number, of: string, vs?: string }} TrialRatio */
/** @typedef {{ rule: string, test: string | null, value?: number, minor?: boolean }} TrialEntry */
/** @typedef {{ id: string, name: string, short: string, group: 'decomp' | 'bleed' | 'ascites' | 'kidney' | 'infection' | 'he', journal: string,
 *   year: number, firstAuthor: string, pmid: string | null, doi: string | null, n: number, setting: string, followUp: string | null, endpoint: string,
 *   better: 'lower' | 'higher', arms: TrialArm[], km: boolean, effect: string | null, ratios: TrialRatio[], bav: string[], entry: TrialEntry[],
 *   note: string | null, verified: string, status: 'checked' | 'unchecked' }} Trial */

const ABSTRACT = 'Abstract verified; eligibility and baseline incomplete';
const CIRRHOSIS = { rule: 'Cirrhosis', test: 'cirrhosis' };

/** @type {Record<string, Trial>} */
export const TRIALS = {
  // ---- Preventing decompensation
  predesci: {
    id: 'predesci', name: 'PREDESCI', short: 'PREDESCI', group: 'decomp', journal: 'Lancet', year: 2019, firstAuthor: 'Villanueva',
    pmid: '30910320', doi: '10.1016/S0140-6736(18)31875-0', n: 201,
    setting: 'Compensated cirrhosis with CSPH (HVPG ≥10 mmHg) and no high-risk varices',
    followUp: null, endpoint: 'Decompensation or death', better: 'lower',
    arms: [{ label: 'Beta-blocker', rate: 16, n: 100, events: 16, side: 'treat' }, { label: 'Placebo', rate: 27, n: 101, events: 27, side: 'control' }],
    km: false, effect: 'HR 0.51 (0.26–0.97)',
    ratios: [{ kind: 'HR', est: 0.51, lo: 0.26, hi: 0.97, of: 'Decompensation or death' }, { kind: 'HR', est: 0.44, lo: 0.2, hi: 0.97, of: 'Ascites' }],
    bav: ['3.15'],
    entry: [CIRRHOSIS, { rule: 'Compensated', test: 'compensated' }, { rule: 'HVPG ≥10 mmHg', test: 'hvpg_ge', value: 10 }, { rule: 'No high-risk varices', test: 'varices_not_high_risk' }],
    note: 'Propranolol for patients whose HVPG fell ≥10% on IV propranolol, carvedilol for the others; not a carvedilol-only trial.',
    verified: ABSTRACT, status: 'checked',
  },
  // ---- Variceal bleeding: first bleed
  // (Added 16 Nov 2026, TC-T4: the two trials in which the HVPG itself picked the patients, each read from its PubMed abstract on 16 Nov 2026,
  // guidelines/trials-audit-2026-11-16.md. Only the abstract's own numbers; an arm size the abstract does not state is left out, never worked back.)
  groszmann: {
    id: 'groszmann', name: 'Timolol to prevent varices', short: 'Timolol 2005', group: 'bleed', journal: 'N Engl J Med', year: 2005,
    firstAuthor: 'Groszmann', pmid: '16306522', doi: '10.1056/NEJMoa044456', n: 213,
    setting: 'Cirrhosis with portal hypertension (HVPG 6 mmHg or more), before varices form',
    followUp: 'Median 54.9 months', endpoint: 'Varices or variceal bleeding', better: 'lower',
    arms: [{ label: 'Timolol', rate: 39, n: 108, side: 'treat' }, { label: 'Placebo', rate: 40, n: 105, side: 'control' }],
    km: false, effect: null, ratios: [], bav: ['3.16'],
    entry: [CIRRHOSIS, { rule: 'HVPG ≥6 mmHg', test: 'hvpg_ge', value: 6 }, { rule: 'No varices yet', test: 'no_varices' }],
    note: 'Serious adverse events 18% on timolol against 6% on placebo. Varices formed less often with a baseline HVPG under 10 mmHg.', verified: ABSTRACT, status: 'checked',
  },
  tripathi: {
    id: 'tripathi', name: 'Carvedilol or band ligation for a first bleed', short: 'Carvedilol vs EVL 2009', group: 'bleed', journal: 'Hepatology', year: 2009,
    firstAuthor: 'Tripathi', pmid: '19610055', doi: '10.1002/hep.23045', n: 152,
    setting: 'Cirrhosis with grade II or larger esophageal varices that have never bled',
    followUp: 'Median 20 months', endpoint: 'First variceal bleed', better: 'lower',
    arms: [{ label: 'Carvedilol', rate: 10, n: 77, side: 'treat' }, { label: 'Band ligation', rate: 23, n: 75, side: 'control' }],
    km: false, effect: 'Relative hazard 0.41 (0.19–0.96)',
    ratios: [{ kind: 'HR', est: 0.41, lo: 0.19, hi: 0.96, of: 'First variceal bleed' }],
    bav: ['3.15', '3.19'],
    entry: [CIRRHOSIS, { rule: 'Grade II or larger esophageal varices', test: 'varices_medium_large' }, { rule: 'No previous variceal bleeding', test: null }],
    note: 'The per-protocol analysis found no significant difference.', verified: ABSTRACT, status: 'checked',
  },
  shah: {
    id: 'shah', name: 'Carvedilol or band ligation, primary prophylaxis', short: 'Carvedilol vs EVL 2014', group: 'bleed', journal: 'J Hepatol', year: 2014,
    firstAuthor: 'Shah', pmid: '24291366', doi: '10.1016/j.jhep.2013.11.019', n: 168,
    setting: 'Cirrhosis with esophageal varices needing primary prophylaxis',
    followUp: 'Mean 13.3 months (range 1–50)', endpoint: 'First variceal bleed', better: 'lower',
    arms: [{ label: 'Carvedilol', rate: 6.9, n: 82, side: 'treat' }, { label: 'Band ligation', rate: 8.5, n: 86, side: 'control' }],
    km: false, effect: null, ratios: [], bav: ['3.15', '3.19'],
    entry: [CIRRHOSIS, { rule: 'Esophageal varices', test: 'varices_present' }, { rule: 'No previous variceal bleeding', test: null }],
    note: 'The authors state the trial was underpowered; no effect size or P value in the abstract.', verified: ABSTRACT, status: 'checked',
  },
  calibre: {
    id: 'calibre', name: 'CALIBRE', short: 'CALIBRE', group: 'bleed', journal: 'Aliment Pharmacol Ther', year: 2025, firstAuthor: 'Tripathi',
    pmid: '40241373', doi: '10.1111/apt.70080', n: 265,
    setting: 'Cirrhosis with medium (grade II) or large (grade III) varices that have never bled',
    followUp: '1 year', endpoint: 'First variceal bleed within 1 year', better: 'lower',
    arms: [{ label: 'Carvedilol', rate: 3.8, n: 133, events: 5, side: 'treat' }, { label: 'Band ligation', rate: 7.6, n: 132, events: 10, side: 'control' }],
    km: false, effect: 'RR 0.50 (0.17–1.41)',
    ratios: [
      { kind: 'RR', est: 0.5, lo: 0.17, hi: 1.41, of: 'First variceal bleed within 1 year' },
      { kind: 'HR', est: 0.46, lo: 0.16, hi: 1.35, of: 'Time to first variceal bleed' },
      { kind: 'HR', est: 0.58, lo: 0.24, hi: 1.41, of: 'Death within 1 year' },
      { kind: 'RR', est: 0.6, lo: 0.24, hi: 1.5, of: 'New ascites' },
    ],
    bav: ['3.15', '3.19'],
    entry: [CIRRHOSIS, { rule: 'Medium or large esophageal varices (grade II or III)', test: 'varices_medium_large' }, { rule: 'No previous variceal bleeding', test: null },
      { rule: 'Not already on a beta-blocker or band ligation for prophylaxis', test: null, minor: true }],
    note: 'Stopped early: 265 of 2630 planned (10%). Underpowered and open label; a result that is not significant is not proof of equivalence.',
    verified: 'Full text; Tables 1, 3 and 4 verified', status: 'checked',
  },
  cavarly: {
    id: 'cavarly', name: 'CAVARLY', short: 'CAVARLY', group: 'bleed', journal: 'Gut', year: 2024, firstAuthor: 'Tevethia',
    pmid: '39067870', doi: '10.1136/gutjnl-2023-331181', n: 330,
    setting: 'Child–Pugh B or C cirrhosis with high-risk esophageal varices that have never bled',
    followUp: '12 months', endpoint: 'First variceal bleed at 12 months', better: 'lower',
    arms: [
      { label: 'Carvedilol plus band ligation', rate: 11.8, n: 110, events: 13, side: 'treat' },
      { label: 'Band ligation', rate: 25.5, n: 110, events: 28, side: 'control' },
      { label: 'Carvedilol', rate: 33.6, n: 110, events: 37, side: 'control' },
    ],
    km: false, effect: 'Combination against band ligation: HR 0.37 (0.192–0.716)',
    ratios: [
      { kind: 'HR', est: 0.37, lo: 0.192, hi: 0.716, of: 'First variceal bleed', vs: 'Combination vs EVL' },
      { kind: 'HR', est: 0.31, lo: 0.163, hi: 0.578, of: 'First variceal bleed', vs: 'Combination vs carvedilol' },
    ],
    bav: [],
    entry: [CIRRHOSIS, { rule: 'Child–Pugh B or C', test: null }, { rule: 'Varices >5 mm, or smaller with red signs', test: 'varices_high_risk' }, { rule: 'No previous variceal bleeding', test: null },
      { rule: 'Age 18 to 75 years', test: null, minor: true }, { rule: 'No previous band ligation, TIPS or surgical shunt', test: null }, { rule: 'No HCC or portal vein thrombosis', test: null },
      { rule: 'Platelets ≥30,000/µL', test: 'platelets_ge', value: 30, minor: true }],
    note: 'Single center, open label, Child–Pugh B and C with a high HVPG: not for low-risk compensated patients.',
    verified: 'Full PDF; Table 1, Figure 2 and Table 2 verified', status: 'checked',
  },
  // ---- Variceal bleeding: the acute bleed
  earlytips: {
    id: 'earlytips', name: 'Early TIPS after variceal bleeding', short: 'Early TIPS 2010', group: 'bleed', journal: 'N Engl J Med', year: 2010, firstAuthor: 'García-Pagán',
    pmid: '20573925', doi: '10.1056/NEJMoa0910102', n: 63,
    setting: 'Cirrhosis with acute variceal bleeding at high risk of treatment failure (Child–Pugh C, or B with active bleeding)',
    followUp: 'Median 16 months', endpoint: 'Alive at 1 year', better: 'higher',
    arms: [{ label: 'Early TIPS', rate: 86, n: 32, side: 'treat' }, { label: 'Drugs plus EVL', rate: 61, n: 31, side: 'control' }],
    km: true, effect: 'Free of rebleeding or failure at 1 year: 97% vs 50%', ratios: [], bav: ['5.31', '5.32'],
    entry: [CIRRHOSIS, { rule: 'Acute variceal bleeding', test: 'acute_bleed' }, { rule: 'Child–Pugh C, or B with active bleeding at the first endoscopy', test: null },
      { rule: 'Randomized within 24 hours of admission, after vasoactive drugs and endoscopic therapy', test: null, minor: true }, { rule: 'No TIPS in place', test: 'no_tips' }],
    note: 'Rebleeding or failure to control bleeding, the primary endpoint, in 1 of 32 against 14 of 31.', verified: ABSTRACT, status: 'checked',
  },
  lvtips: {
    id: 'lvtips', name: 'Early TIPS, covered stents', short: 'Early TIPS 2019', group: 'bleed', journal: 'Lancet Gastroenterol Hepatol', year: 2019, firstAuthor: 'Lv',
    pmid: '31153882', doi: '10.1016/S2468-1253(19)30090-1', n: 132,
    setting: 'Cirrhosis (Child–Pugh B or C) with acute variceal bleeding treated with vasoactive drugs and endoscopy',
    followUp: '1 year', endpoint: 'Alive and not transplanted at 1 year', better: 'higher',
    arms: [{ label: 'Early TIPS', rate: 86, n: 84, side: 'treat' }, { label: 'Standard care', rate: 73, n: 45, side: 'control' }],
    km: true, effect: 'HR 0.50 (0.25–0.98)',
    ratios: [{ kind: 'HR', est: 0.5, lo: 0.25, hi: 0.98, of: 'Death or liver transplant' }],
    bav: ['5.31', '5.32'],
    entry: [CIRRHOSIS, { rule: 'Child–Pugh B or C', test: null }, { rule: 'Acute variceal bleeding', test: 'acute_bleed' }, { rule: 'Treated first with vasoactive drugs and endoscopic therapy', test: null, minor: true }, { rule: 'No TIPS in place', test: 'no_tips' }],
    note: 'Two patients assigned to TIPS for each control; 3 excluded after randomization. Wider than today\'s criteria for a preemptive TIPS.',
    verified: ABSTRACT, status: 'checked',
  },
  monescillo: {
    id: 'monescillo', name: 'Early TIPS when the HVPG is 20 or more', short: 'HVPG-guided TIPS 2004', group: 'bleed', journal: 'Hepatology', year: 2004,
    firstAuthor: 'Monescillo', pmid: '15382120', doi: '10.1002/hep.20386', n: 52,
    setting: 'Cirrhosis with acute variceal bleeding treated by sclerotherapy, HVPG ≥20 mmHg within 24 hours of admission',
    followUp: null, endpoint: 'Treatment failure', better: 'lower',
    arms: [{ label: 'TIPS within 24 hours', rate: 12, n: 26, side: 'treat' }, { label: 'No early TIPS', rate: 50, side: 'control' }],
    km: false, effect: null, ratios: [], bav: ['5.31'],
    entry: [CIRRHOSIS, { rule: 'Acute variceal bleeding', test: 'acute_bleed' }, { rule: 'HVPG ≥20 mmHg within 24 hours of admission', test: 'hvpg_ge', value: 20 },
      { rule: 'One session of sclerotherapy at urgent endoscopy', test: null, minor: true }, { rule: 'No TIPS in place', test: 'no_tips' }],
    note: 'In-hospital and 1-year mortality on early TIPS were 11% and 31%; the abstract gives no rates for the other arm. Uncovered stents, sclerotherapy as the control.', verified: ABSTRACT, status: 'checked',
  },
  transfusion: {
    id: 'transfusion', name: 'Restrictive transfusion', short: 'Transfusion 2013', group: 'bleed', journal: 'N Engl J Med', year: 2013, firstAuthor: 'Villanueva',
    pmid: '23281973', doi: '10.1056/NEJMoa1211801', n: 921,
    setting: 'Severe acute upper gastrointestinal bleeding of any cause, with or without cirrhosis',
    followUp: '6 weeks', endpoint: 'Alive at 6 weeks', better: 'higher',
    arms: [{ label: 'Restrictive (Hb 7 g/dL)', rate: 95, n: 461, side: 'treat' }, { label: 'Liberal (Hb 9 g/dL)', rate: 91, n: 460, side: 'control' }],
    km: true, effect: 'HR for death 0.55 (0.33–0.92)',
    ratios: [
      { kind: 'HR', est: 0.55, lo: 0.33, hi: 0.92, of: 'Death within 6 weeks' },
      { kind: 'HR', est: 0.3, lo: 0.11, hi: 0.85, of: 'Death, cirrhosis Child–Pugh A or B (subgroup)' },
      { kind: 'HR', est: 1.04, lo: 0.45, hi: 2.37, of: 'Death, cirrhosis Child–Pugh C (subgroup)' },
    ],
    bav: ['5.4'],
    entry: [{ rule: 'Severe acute upper GI bleeding', test: 'acute_bleed' }],
    note: 'Bleeding of every cause, not only varices. In cirrhosis the HR for death was 0.30 in Child–Pugh A or B and 1.04 in C.', verified: ABSTRACT, status: 'checked',
  },
  gavaprosec: {
    id: 'gavaprosec', name: 'GAVAPROSEC', short: 'GAVAPROSEC', group: 'bleed', journal: 'Lancet Gastroenterol Hepatol', year: 2025, firstAuthor: 'Cervoni',
    pmid: '40517780', doi: '10.1016/S2468-1253(25)00156-6', n: 105,
    setting: 'Cirrhosis with acute fundal variceal bleeding (not GOV1), controlled with glue and vasoactive drugs',
    followUp: '1 year', endpoint: 'Free of death or significant rebleeding at 1 year', better: 'higher',
    arms: [{ label: 'Preemptive TIPS', rate: 77, n: 47, side: 'treat' }, { label: 'Glue plus beta-blocker', rate: 37, n: 54, side: 'control' }],
    km: true, effect: 'HR 0.25 (0.12–0.51)',
    ratios: [{ kind: 'HR', est: 0.25, lo: 0.12, hi: 0.51, of: 'Death or clinically significant rebleeding' }],
    bav: ['5.39', '5.40', '5.41'],
    entry: [CIRRHOSIS, { rule: 'Fundal varices (GOV1 excluded)', test: 'gastric_varices' }, { rule: 'Acute bleeding from them', test: 'acute_bleed' },
      { rule: 'Bleeding controlled with glue and vasoactive drugs, stable ≥12 hours', test: null }, { rule: 'No TIPS in place', test: 'no_tips' }],
    note: 'Rescue TIPS in 20 of 54 controls. HE by 1 year 35% against 32%.',
    verified: 'Abstract verified; eligibility, baseline by arm and adverse events pending', status: 'checked',
  },
  // ---- Ascites and albumin
  covered: {
    id: 'covered', name: 'Covered TIPS for recurrent ascites', short: 'Covered TIPS 2017', group: 'ascites', journal: 'Gastroenterology', year: 2017, firstAuthor: 'Bureau',
    pmid: '27663604', doi: '10.1053/j.gastro.2016.09.016', n: 62,
    setting: 'Cirrhosis with recurrent ascites: ≥2 large-volume paracenteses over ≥3 weeks',
    followUp: '1 year', endpoint: 'Alive and not transplanted at 1 year', better: 'higher',
    arms: [{ label: 'Covered TIPS', rate: 93, n: 29, side: 'treat' }, { label: 'Large-volume paracentesis', rate: 52, n: 33, side: 'control' }],
    km: true, effect: 'P = .003', ratios: [], bav: ['6.3'],
    entry: [CIRRHOSIS, { rule: 'Ascites', test: 'ascites' }, { rule: 'At least 2 large-volume paracenteses over at least 3 weeks', test: null }, { rule: 'No TIPS in place', test: 'no_tips' }],
    note: 'A small, selected group with recurrent ascites, not all refractory ascites.', verified: ABSTRACT, status: 'checked',
  },
  answer: {
    id: 'answer', name: 'ANSWER', short: 'ANSWER', group: 'ascites', journal: 'Lancet', year: 2018, firstAuthor: 'Caraceni',
    pmid: '29861076', doi: '10.1016/S0140-6736(18)30840-7', n: 440,
    setting: 'Cirrhosis with uncomplicated ascites on an aldosterone antagonist ≥200 mg/day and furosemide ≥25 mg/day',
    followUp: 'Up to 18 months', endpoint: 'Alive at 18 months', better: 'higher',
    arms: [{ label: 'Albumin', rate: 77, n: 218, side: 'treat' }, { label: 'Standard care', rate: 66, n: 213, side: 'control' }],
    km: true, effect: 'HR for death 0.62 (0.40–0.95)',
    ratios: [{ kind: 'HR', est: 0.62, lo: 0.4, hi: 0.95, of: 'Death within 18 months' }],
    bav: ['6.10'],
    entry: [CIRRHOSIS, { rule: 'Ascites', test: 'ascites' }, { rule: 'On diuretics', test: 'diuretics' },
      { rule: 'Uncomplicated ascites on an aldosterone antagonist ≥200 mg/day and furosemide ≥25 mg/day', test: null }],
    note: 'Open label. Crude deaths 38 of 218 against 46 of 213. Baveno VIII is narrower: recurrent or refractory ascites when TIPS is not an option.',
    verified: ABSTRACT, status: 'checked',
  },
  attire: {
    id: 'attire', name: 'ATTIRE', short: 'ATTIRE', group: 'ascites', journal: 'N Engl J Med', year: 2021, firstAuthor: 'China',
    pmid: '33657293', doi: '10.1056/NEJMoa2022166', n: 777,
    setting: 'Hospitalized with decompensated cirrhosis and a serum albumin <3.0 g/dL (30 g/L)',
    followUp: 'Days 3 to 15', endpoint: 'New infection, renal dysfunction or death, days 3 to 15', better: 'lower',
    arms: [{ label: 'Albumin to ≥3.0 g/dL', rate: 29.7, n: 380, events: 113, side: 'treat' }, { label: 'Standard care', rate: 30.2, n: 397, events: 120, side: 'control' }],
    km: false, effect: 'Adjusted OR 0.98 (0.71–1.33)',
    ratios: [
      { kind: 'OR', est: 0.98, lo: 0.71, hi: 1.33, of: 'Infection, renal dysfunction or death (adjusted)' },
      { kind: 'HR', est: 1.04, lo: 0.81, hi: 1.35, of: 'Infection, renal dysfunction or death (time to event)' },
    ],
    bav: [],
    entry: [{ rule: 'Decompensated cirrhosis', test: 'decompensated' }, { rule: 'In hospital', test: null }, { rule: 'Serum albumin <3.0 g/dL', test: 'albumin_lt', value: 3 }],
    note: 'No benefit, and more fluid overload with albumin: pulmonary edema or fluid overload in 23 against 8 events.',
    verified: 'NEJM Results and Table 3 verified; baseline and protocol pending', status: 'checked',
  },
  macht: {
    id: 'macht', name: 'MACHT', short: 'MACHT', group: 'ascites', journal: 'J Hepatol', year: 2018, firstAuthor: 'Solà',
    pmid: '30138685', doi: '10.1016/j.jhep.2018.08.006', n: 196,
    setting: 'Cirrhosis with ascites, listed for liver transplant',
    followUp: 'Up to 1 year, or until transplant or removal from the list', endpoint: 'Renal failure, hyponatremia, infection, HE or GI bleeding', better: 'lower',
    arms: [], km: false, effect: 'No difference (P = 0.402)', ratios: [], bav: ['6.10'],
    entry: [CIRRHOSIS, { rule: 'Ascites', test: 'ascites' }, { rule: 'Listed for liver transplant', test: null }],
    note: 'Midodrine 15 to 30 mg/day plus albumin 40 g every 15 days against placebo. No difference in 1-year mortality (P = 0.527). The abstract gives no result per arm.',
    verified: 'Abstract verified; Table 1 and protocol pending', status: 'checked',
  },
  // ---- Kidney
  confirm: {
    id: 'confirm', name: 'CONFIRM', short: 'CONFIRM', group: 'kidney', journal: 'N Engl J Med', year: 2021, firstAuthor: 'Wong',
    pmid: '33657294', doi: '10.1056/NEJMoa2008290', n: 300,
    setting: 'Adults with type 1 hepatorenal syndrome; albumin recommended in both arms',
    followUp: 'Up to 14 days of treatment, deaths to day 90', endpoint: 'Verified HRS reversal', better: 'higher',
    arms: [{ label: 'Terlipressin', rate: 32, n: 199, events: 63, side: 'treat' }, { label: 'Placebo', rate: 17, n: 101, events: 17, side: 'control' }],
    km: false, effect: 'P = 0.006', ratios: [], bav: ['6.18'],
    entry: [{ rule: 'Type 1 hepatorenal syndrome', test: null }],
    note: 'Death from respiratory disorders by day 90 in 22 of 199 (11%) against 2 of 101 (2%). More reversal did not establish a survival benefit.',
    verified: ABSTRACT, status: 'checked',
  },
  // ---- Infection
  fernandez2007: {
    id: 'fernandez2007', name: 'Norfloxacin as primary SBP prophylaxis', short: 'SBP prophylaxis 2007', group: 'infection', journal: 'Gastroenterology', year: 2007,
    firstAuthor: 'Fernández', pmid: '17854593', doi: '10.1053/j.gastro.2007.06.065', n: 68,
    setting: 'Advanced cirrhosis, ascitic protein <1.5 g/dL, and Child–Pugh ≥9 with bilirubin ≥3 mg/dL or renal dysfunction',
    followUp: '1 year', endpoint: 'Alive at 3 months', better: 'higher',
    arms: [{ label: 'Norfloxacin', rate: 94, n: 35, side: 'treat' }, { label: 'Placebo', rate: 62, n: 33, side: 'control' }],
    km: true, effect: 'P = 0.003', ratios: [], bav: ['4.12'],
    entry: [CIRRHOSIS, { rule: 'Ascites', test: 'ascites' }, { rule: 'Ascitic fluid protein <1.5 g/dL', test: 'ascitic_protein_lt', value: 1.5 },
      { rule: 'Child–Pugh ≥9 with bilirubin ≥3 mg/dL, or creatinine ≥1.2 mg/dL, BUN ≥25 mg/dL or sodium ≤130 mEq/L', test: null }],
    note: '1-year survival 60% against 48% (P = 0.05). Baveno VIII now advises against long-term primary antibiotic prophylaxis after a first decompensation to prevent further decompensation.',
    verified: ABSTRACT, status: 'checked',
  },
  gines: {
    id: 'gines', name: 'Norfloxacin after SBP', short: 'SBP recurrence 1990', group: 'infection', journal: 'Hepatology', year: 1990, firstAuthor: 'Ginès',
    pmid: '2210673', doi: '10.1002/hep.1840120416', n: 80,
    setting: 'Cirrhosis, recovered from an episode of SBP',
    followUp: 'Mean 6.4 months (range 1–19)', endpoint: 'SBP recurrence', better: 'lower',
    arms: [{ label: 'Norfloxacin', rate: 12.5, n: 40, events: 5, side: 'treat' }, { label: 'Placebo', rate: 35, n: 40, events: 14, side: 'control' }],
    km: false, effect: 'P = 0.014', ratios: [], bav: ['6.21'],
    entry: [CIRRHOSIS, { rule: 'Ascites', test: 'ascites' }, { rule: 'Recovered from an earlier SBP episode', test: null }],
    note: 'Norfloxacin 400 mg daily. 1-year probability of recurrence 20% against 68%. Resistance patterns may differ from 1990.',
    verified: ABSTRACT, status: 'checked',
  },
  fernandez2006: {
    id: 'fernandez2006', name: 'Ceftriaxone or norfloxacin in GI bleeding', short: 'Ceftriaxone 2006', group: 'infection', journal: 'Gastroenterology', year: 2006,
    firstAuthor: 'Fernández', pmid: '17030175', doi: '10.1053/j.gastro.2006.07.010', n: 111,
    setting: 'Advanced cirrhosis with GI bleeding and ≥2 of ascites, severe malnutrition, encephalopathy or bilirubin >3 mg/dL',
    followUp: '10 days', endpoint: 'Proved or possible infection by day 10', better: 'lower',
    arms: [{ label: 'IV ceftriaxone', rate: 11, n: 54, side: 'treat' }, { label: 'Oral norfloxacin', rate: 33, n: 57, side: 'control' }],
    km: true, effect: 'P = 0.003', ratios: [], bav: ['5.10', '5.11'],
    entry: [CIRRHOSIS, { rule: 'Acute GI bleeding', test: 'acute_bleed' }, { rule: 'At least 2 of ascites, severe malnutrition, encephalopathy or bilirubin >3 mg/dL', test: null }],
    note: 'Ceftriaxone 1 g/day IV against norfloxacin 400 mg twice daily, both for 7 days. Of 7 gram-negative organisms on norfloxacin, 6 were quinolone-resistant.',
    verified: ABSTRACT, status: 'checked',
  },
  sort: {
    id: 'sort', name: 'Albumin with antibiotics for SBP', short: 'Albumin in SBP 1999', group: 'infection', journal: 'N Engl J Med', year: 1999, firstAuthor: 'Sort',
    pmid: '10432325', doi: '10.1056/NEJM199908053410603', n: 126,
    setting: 'Cirrhosis with spontaneous bacterial peritonitis, all treated with cefotaxime',
    followUp: 'Hospital stay and 3 months', endpoint: 'Renal impairment that did not reverse, in hospital', better: 'lower',
    arms: [{ label: 'Cefotaxime plus albumin', rate: 10, n: 63, events: 6, side: 'treat' }, { label: 'Cefotaxime alone', rate: 33, n: 63, events: 21, side: 'control' }],
    km: false, effect: 'P = 0.002', ratios: [], bav: [],
    entry: [CIRRHOSIS, { rule: 'Ascites', test: 'ascites' }, { rule: 'Spontaneous bacterial peritonitis', test: null }],
    note: 'Albumin 1.5 g/kg at diagnosis and 1.0 g/kg on day 3. Deaths in hospital 6 of 63 against 18 of 63.', verified: ABSTRACT, status: 'checked',
  },
  // ---- Hepatic encephalopathy
  rifaximin: {
    id: 'rifaximin', name: 'Rifaximin before TIPS', short: 'Rifaximin before TIPS', group: 'he', journal: 'Ann Intern Med', year: 2021, firstAuthor: 'Bureau',
    pmid: '33524293', doi: '10.7326/M20-0202', n: 197,
    setting: 'Cirrhosis, undergoing elective TIPS for intractable ascites or to prevent variceal rebleeding',
    followUp: '168 days after the TIPS', endpoint: 'Overt hepatic encephalopathy', better: 'lower',
    arms: [{ label: 'Rifaximin', rate: 34, n: 93, side: 'treat' }, { label: 'Placebo', rate: 53, n: 93, side: 'control' }],
    km: false, effect: 'OR 0.48 (0.27–0.87)',
    ratios: [{ kind: 'OR', est: 0.48, lo: 0.27, hi: 0.87, of: 'Overt HE within 168 days' }],
    bav: ['6.16'],
    entry: [CIRRHOSIS, { rule: 'Elective TIPS planned, for intractable ascites or to prevent variceal rebleeding', test: null }, { rule: 'No TIPS in place', test: 'no_tips' }],
    note: 'Rifaximin 600 mg twice daily, started 14 days before TIPS and continued 168 days after.', verified: ABSTRACT, status: 'checked',
  },
  bass: {
    id: 'bass', name: 'Rifaximin to prevent recurrent HE', short: 'Rifaximin for HE 2010', group: 'he', journal: 'N Engl J Med', year: 2010, firstAuthor: 'Bass',
    pmid: '20335583', doi: '10.1056/NEJMoa0907893', n: 299,
    setting: 'Chronic liver disease in remission after recurrent overt hepatic encephalopathy',
    followUp: '6 months', endpoint: 'Breakthrough overt hepatic encephalopathy', better: 'lower',
    arms: [{ label: 'Rifaximin', rate: 22.1, n: 140, side: 'treat' }, { label: 'Placebo', rate: 45.9, n: 159, side: 'control' }],
    km: false, effect: 'HR 0.42 (0.28–0.64)',
    ratios: [{ kind: 'HR', est: 0.42, lo: 0.28, hi: 0.64, of: 'Breakthrough overt HE' }, { kind: 'HR', est: 0.5, lo: 0.29, hi: 0.87, of: 'Hospitalization for HE' }],
    bav: [],
    entry: [{ rule: 'Chronic liver disease', test: null }, { rule: 'In remission after recurrent overt HE', test: null }],
    note: 'Rifaximin 550 mg twice daily; more than 90% also took lactulose.', verified: ABSTRACT, status: 'checked',
  },
  sharma: {
    id: 'sharma', name: 'Lactulose to prevent recurrent HE', short: 'Lactulose for HE 2009', group: 'he', journal: 'Gastroenterology', year: 2009, firstAuthor: 'Sharma',
    pmid: '19501587', doi: '10.1053/j.gastro.2009.05.056', n: 140,
    setting: 'Cirrhosis, after recovery from overt hepatic encephalopathy',
    followUp: 'Median 14 months (range 1–20)', endpoint: 'Recurrent overt hepatic encephalopathy', better: 'lower',
    arms: [{ label: 'Lactulose', rate: 19.6, n: 61, events: 12, side: 'treat' }, { label: 'Placebo', rate: 46.8, n: 64, events: 30, side: 'control' }],
    km: false, effect: 'P = 0.001', ratios: [], bav: [],
    entry: [CIRRHOSIS, { rule: 'Recovered from overt HE', test: null }],
    note: 'Open label; 125 of the 140 enrolled were analyzed.', verified: ABSTRACT, status: 'checked',
  },
};

// ---- The teaching words (TC-L2, TC-T1, trials card review, 15 Nov 2026). Not from the audit and never a number: what a row's rate counts, in a word
// or two ("bled", "alive"), and what the trial taught, in one plain sentence, shown first when a trial is opened. The lessons were drafted on
// 15 Nov 2026 and approved by Mohammad as written on 16 Nov 2026 (lessonStatus 'approved'; a new or changed line is 'draft' until he approves it). response: the trial's own rule for a drug response, where the
// audit gives one, shown beside the model's fall in the HVPG (TC-T3).
//   outcome   at most 16 characters, lower case, read after the rates: "16% vs 27% decompensated"
//   lesson    one sentence, at most 160 characters, no number the record does not hold
const TEACH = {
  predesci: { outcome: 'decompensated', lesson: 'In compensated cirrhosis with CSPH, a beta-blocker lowered decompensation or death, mostly by preventing ascites.',
    response: 'PREDESCI counted a fall of 10% or more on IV propranolol as a response.' },
  groszmann: { outcome: 'varices or bled', lesson: 'In cirrhosis with an HVPG of 6 mmHg or more and no varices, timolol did not prevent varices or bleeding and caused more serious side effects.', lessonStatus: 'draft' },
  tripathi: { outcome: 'bled', lesson: 'Carvedilol prevented a first variceal bleed better than band ligation, though the per-protocol analysis found no difference.' },
  shah: { outcome: 'bled', lesson: 'Carvedilol and band ligation prevented a first bleed about equally; the trial was too small to show a difference.' },
  calibre: { outcome: 'bled', lesson: 'Stopped at a tenth of its planned size, it could not show carvedilol better or worse than band ligation.' },
  cavarly: { outcome: 'bled', lesson: 'In Child–Pugh B and C with high-risk varices, carvedilol plus band ligation prevented a first bleed better than either alone.' },
  earlytips: { outcome: 'alive', lesson: 'In high-risk patients after a variceal bleed, an early covered TIPS improved one-year survival over drugs and band ligation.' },
  lvtips: { outcome: 'alive, no LT', lesson: 'In Child–Pugh B and C, an early covered TIPS again improved transplant-free survival, in a broader group than the first trial.' },
  monescillo: { outcome: 'treatment failed', lesson: 'In a variceal bleed with an HVPG of 20 mmHg or more, a TIPS within 24 hours lowered treatment failure and mortality.', lessonStatus: 'draft' },
  transfusion: { outcome: 'alive', lesson: 'Transfusing only below a hemoglobin of 7 g/dL improved survival over a threshold of 9; in cirrhosis the gain was in Child–Pugh A and B.' },
  gavaprosec: { outcome: 'event-free', lesson: 'After fundal variceal bleeding controlled with glue, a preemptive TIPS cut death or significant rebleeding over glue and a beta-blocker.' },
  covered: { outcome: 'alive, no LT', lesson: 'In recurrent ascites, a covered TIPS improved transplant-free survival over repeated large-volume paracentesis.' },
  answer: { outcome: 'alive', lesson: 'Long-term albumin added to diuretics improved 18-month survival in uncomplicated ascites, in an open-label trial.' },
  attire: { outcome: 'had an event', lesson: 'Raising albumin to 3.0 g/dL in hospital did not prevent infection, kidney injury or death, and caused more fluid overload.' },
  macht: { outcome: 'no difference', lesson: 'Midodrine with albumin did not reduce complications or death in patients waiting for a transplant.' },
  confirm: { outcome: 'HRS reversed', lesson: 'Terlipressin reversed hepatorenal syndrome more often than placebo, with more deaths from respiratory failure.' },
  fernandez2007: { outcome: 'alive', lesson: 'In advanced cirrhosis with low ascitic protein, primary norfloxacin prophylaxis improved 3-month survival.' },
  gines: { outcome: 'SBP again', lesson: 'After a first SBP, daily norfloxacin cut its recurrence.' },
  fernandez2006: { outcome: 'infected', lesson: 'In advanced cirrhosis with GI bleeding, IV ceftriaxone prevented infection better than oral norfloxacin.' },
  sort: { outcome: 'kidney failure', lesson: 'Albumin given with antibiotics for SBP prevented kidney failure and lowered deaths in hospital.' },
  rifaximin: { outcome: 'overt HE', lesson: 'Rifaximin started two weeks before an elective TIPS lowered overt HE after it.' },
  bass: { outcome: 'overt HE', lesson: 'Rifaximin, mostly on top of lactulose, halved breakthrough HE in patients in remission.' },
  sharma: { outcome: 'overt HE again', lesson: 'Lactulose after recovery from overt HE lowered its recurrence.' },
};
for (const [id, w] of Object.entries(TEACH)) Object.assign(TRIALS[id], { lessonStatus: 'approved' }, w);

/** The Baveno VIII statements the trials cite, each in one short line, from guidelines/baveno-viii-2026.pdf (TC-T2): a learner reads what the
 *  statement says, not its number alone. Shortened, never strengthened; the PDF's own words where they fit. */
export const BAVENO_VIII = Object.freeze({
  '3.15': 'NSBBs, particularly carvedilol, are recommended in compensated cirrhosis with CSPH to prevent decompensation and improve survival.',
  '3.16': 'Without CSPH, NSBBs should not be used to prevent decompensation or death.',
  '3.19': 'When NSBBs are contraindicated or not tolerated and large varices are found, band ligation is recommended to prevent a first bleed.',
  '4.12': 'After a first decompensation, long-term primary antibiotic prophylaxis is not recommended to prevent further decompensation.',
  '5.4': 'Transfuse red cells restrictively, to a hemoglobin of 7 to 8 g/dL, individualized to the patient.',
  '5.10': 'Preventive antibiotics are recommended at presentation with acute variceal bleeding.',
  '5.11': 'Third-generation cephalosporins are generally preferred, with local resistance in mind.',
  '5.31': 'Preemptive covered TIPS within 72 h (ideally under 24 h) for Child–Pugh C 10–13, Child–Pugh B over 7 with active bleeding at endoscopy, or HVPG ≥20 mmHg at the bleed.',
  '5.32': 'Past the 72-hour window, a TIPS within 2 weeks (Child–Pugh C 10–13) or 1 week (B over 7 with active bleeding) may still help.',
  '5.39': 'Bleeding from GOV2 or IGV1 is high risk: stop the bleeding first, then treat definitively, with as short a gap as possible.',
  '5.40': 'Glue injection or EUS-guided therapy can stop bleeding from GOV2 or IGV1.',
  '5.41': 'TIPS, with or without embolization, as soon as possible is the preferred definitive treatment for GOV2 or IGV1 bleeding.',
  '6.3': 'Patients with recurrent or refractory ascites should be considered for TIPS.',
  '6.10': 'In recurrent or refractory ascites without the option of TIPS, long-term albumin may be considered.',
  '6.16': 'Rifaximin should be considered to prevent HE in candidates for elective TIPS.',
  '6.18': 'In HRS-AKI, terlipressin with albumin should be considered.',
  '6.21': 'After SBP, antibiotic prophylaxis should be considered to prevent its recurrence.',
});
/** "Baveno VIII 5.31: Preemptive covered TIPS …", or the bare number where the table has no line. */
export const bavenoLine = (k) => (BAVENO_VIII[k] ? `${k}. ${BAVENO_VIII[k]}` : k);

/** The trial ids, in the order above. */
export const TRIAL_IDS = Object.keys(TRIALS);
/** The trial for an id, or null. */
export const trialOf = (id) => (typeof id === 'string' && Object.hasOwn(TRIALS, id) ? TRIALS[id] : null);
/** The source line: "Lancet 2019 · Villanueva". */
export const trialSource = (t) => `${t.journal} ${t.year} · ${t.firstAuthor}`;

/** The card's facts as plain lines, for the handout: who, what was counted, follow-up, each arm, the effect, the caveat, the source and, for a
 *  trial not yet read against its paper, a line that says so. */
export function trialLines(t) {
  return [
    `Patients: ${t.setting}`, `Endpoint: ${t.endpoint}`, t.followUp ? `Follow-up: ${t.followUp}` : null,
    ...t.arms.map((a) => `${a.label}: ${a.rate}%${a.n ? ` (${a.events != null ? `${a.events} of ${a.n}` : `n = ${a.n}`})` : ''}`),
    t.effect ? `Effect: ${t.effect}` : null, t.note ? `Caveat: ${t.note}` : null,
    `${trialSource(t)} · ${t.n} randomized`, t.status === 'checked' ? null : 'Not yet checked against the paper',
  ].filter(Boolean);
}
