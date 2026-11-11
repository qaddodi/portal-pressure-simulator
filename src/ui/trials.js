// The landmark trials a trial card (tool { kind: 'trial', id }, tool-trial.js) can show: two arms, the share of each arm that had the
// outcome, who was enrolled, how long they were followed and where it was published.
//
// Every number here was read from the trial's published abstract (the sources and what was read from each are in guidelines/trials.md,
// which tests/trials.test.js keeps in step with this file). Nothing is rounded or worked out: a rate is the abstract's own whole percent.
// A trial whose numbers were not read from the paper itself is status 'unchecked', and its card says so.
//
//   name       the card's title
//   journal, year, firstAuthor, pmid    the source line (pmid: null where it was not looked up)
//   n          people randomized (what the abstract calls randomized, not the number analyzed)
//   setting    who was enrolled, one line
//   followUp   how long they were followed, as the abstract words it
//   endpoint   what the percentages count
//   better     'lower' | 'higher': which way is better for the arm's rate (the card draws no good/bad colours; the words carry it)
//   arms       [{ label, rate (whole percent), n? (analyzed in that arm), side: 'treat' | 'control' }] the treated arm first
//   effect     the abstract's own effect size, with its confidence interval, or null
//   note       one caveat a learner should keep, or null
//   status     'checked' (read from the abstract) | 'unchecked'

/** @typedef {{ label: string, rate: number, n?: number, side: 'treat' | 'control' }} TrialArm */
/** @typedef {{ id: string, name: string, journal: string, year: number, firstAuthor: string, pmid: string | null, n: number, setting: string, followUp: string,
 *   endpoint: string, better: 'lower' | 'higher', arms: TrialArm[], effect: string | null, note: string | null, status: 'checked' | 'unchecked' }} Trial */

/** @type {Record<string, Trial>} */
export const TRIALS = {
  predesci: {
    id: 'predesci', name: 'PREDESCI', journal: 'Lancet', year: 2019, firstAuthor: 'Villanueva', pmid: '30910320', n: 201,
    setting: 'Cirrhosis with clinically significant portal hypertension, not yet decompensated',
    followUp: 'Median 37 months', endpoint: 'Decompensation or death', better: 'lower',
    arms: [{ label: 'Beta-blocker', rate: 16, n: 100, side: 'treat' }, { label: 'Placebo', rate: 27, n: 101, side: 'control' }],
    effect: 'HR 0.51 (0.26–0.97)',
    note: null, status: 'checked',
  },
  earlytips: {
    id: 'earlytips', name: 'Early TIPS after a bleed', journal: 'N Engl J Med', year: 2010, firstAuthor: 'García-Pagán', pmid: null, n: 63,
    setting: 'Cirrhosis with a variceal bleed, high risk of rebleeding (Child-Pugh C, or B with active bleeding)',
    followUp: 'Median 16 months', endpoint: 'Alive at 1 year', better: 'higher',
    arms: [{ label: 'Early TIPS', rate: 86, n: 32, side: 'treat' }, { label: 'Drug plus banding', rate: 61, n: 31, side: 'control' }],
    effect: 'Free of rebleeding or failure at 1 year: 97% against 50%',
    note: null, status: 'checked',
  },
  lvtips: {
    id: 'lvtips', name: 'Early TIPS, covered stents', journal: 'Lancet Gastroenterol Hepatol', year: 2019, firstAuthor: 'Lv', pmid: '31153882', n: 132,
    setting: 'Cirrhosis (Child-Pugh B or C) with an acute variceal bleed treated with drugs and endoscopy',
    followUp: '1 year', endpoint: 'Alive and not transplanted at 1 year', better: 'higher',
    arms: [{ label: 'Early TIPS', rate: 86, side: 'treat' }, { label: 'Standard care', rate: 73, side: 'control' }],
    effect: 'HR 0.50 (0.25–0.98)',
    note: null, status: 'checked',
  },
  transfusion: {
    id: 'transfusion', name: 'Restrictive transfusion', journal: 'N Engl J Med', year: 2013, firstAuthor: 'Villanueva', pmid: '23281973', n: 921,
    setting: 'Acute upper gastrointestinal bleeding, with or without cirrhosis',
    followUp: '6 weeks', endpoint: 'Alive at 6 weeks', better: 'higher',
    arms: [{ label: 'Restrictive (Hb 7 g/dL)', rate: 95, side: 'treat' }, { label: 'Liberal (Hb 9 g/dL)', rate: 91, side: 'control' }],
    effect: 'HR for death 0.55 (0.33–0.92)',
    note: 'In patients with cirrhosis the benefit held in Child-Pugh A and B, not in C, and was not significant for all of them together.', status: 'checked',
  },
  rifaximin: {
    id: 'rifaximin', name: 'Rifaximin before TIPS', journal: 'Ann Intern Med', year: 2021, firstAuthor: 'Bureau', pmid: '33524293', n: 197,
    setting: 'Cirrhosis, having an elective TIPS',
    followUp: '168 days after the TIPS', endpoint: 'Overt encephalopathy', better: 'lower',
    arms: [{ label: 'Rifaximin', rate: 34, n: 93, side: 'treat' }, { label: 'Placebo', rate: 53, n: 93, side: 'control' }],
    effect: 'OR 0.48 (0.27–0.87)',
    note: 'Started 14 days before the TIPS.', status: 'checked',
  },
  covered: {
    id: 'covered', name: 'Covered TIPS for recurrent ascites', journal: 'Gastroenterology', year: 2017, firstAuthor: 'Bureau', pmid: '27663604', n: 62,
    setting: 'Cirrhosis with ascites that came back after at least two large-volume paracenteses',
    followUp: '1 year', endpoint: 'Alive and not transplanted at 1 year', better: 'higher',
    arms: [{ label: 'Covered TIPS', rate: 93, n: 29, side: 'treat' }, { label: 'Large-volume paracentesis', rate: 52, n: 33, side: 'control' }],
    effect: 'P = .003',
    note: null, status: 'checked',
  },
};

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
    `Who: ${t.setting}`, `Counted: ${t.endpoint}`, `Followed: ${t.followUp}`,
    ...t.arms.map((a) => `${a.label}: ${a.rate}%${a.n ? ` (${a.n} people)` : ''}`),
    t.effect ? `Effect: ${t.effect}` : null, t.note ? `Caveat: ${t.note}` : null,
    `${trialSource(t)} · ${t.n} randomized`, t.status === 'checked' ? null : 'Not yet checked against the paper',
  ].filter(Boolean);
}
