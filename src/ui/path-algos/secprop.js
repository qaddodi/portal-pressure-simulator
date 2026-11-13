// Preventing the next oesophageal bleed: Baveno VIII 4.8 to 4.10, for a patient not eligible for rescue or preemptive TIPS.
// Patient { more, can: 'both' | 'evl' | 'nsbb' }: a non-bleeding decompensation as well; what can be given (carvedilol and banding, banding only, carvedilol only).
import { inheritTone } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'After esophageal variceal bleeding', r: 'Prevent rebleeding', s: 'Not a candidate for rescue or preemptive TIPS.', stmt: '4.8–4.10', tone: 'n', kids: [
    { id: 'only', t: 'The bleed is the only decompensation', tone: 'n', sh: 'Bleed only', kids: [
      { id: 'both', t: 'Can receive carvedilol and EVL', r: 'Both, carvedilol preferred', s: 'Also after earlier prophylaxis with carvedilol.', stmt: '4.8', tone: 'ok', sh: 'Both' },
      { id: 'mono', t: 'Can receive only one', r: 'That one alone', stmt: '4.9', tone: 'warn', sh: 'One' },
    ] },
    { id: 'more', t: 'Also a non-bleeding decompensation', r: 'TIPS and transplant may be considered', stmt: '4.10', tone: 'bad', sh: 'Other events' },
  ],
}, 'n');

const CAN = ['both', 'evl', 'nsbb'];
const DEFAULT = { more: false, can: 'both' };

export default {
  id: 'secprop',
  label: 'Preventing esophageal variceal rebleeding',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree,
  mapWords: { only: ['Bleed', 'only'], more: ['Other', 'events'], both: ['Both'], mono: ['One'] },
  lit(p) {
    const q = p || {};
    const L = new Set(['root']);
    if (q.more) L.add('more'); else { L.add('only'); L.add(q.can === 'evl' || q.can === 'nsbb' ? 'mono' : 'both'); }
    return L;
  },
  outcomes: ['both', 'mono', 'more'],
  outcomeOf: (L) => ['both', 'mono', 'more'].find((k) => L.has(k)) || null,
  reading(key, p) {
    if (key === 'more') return { head: 'TIPS and transplant may be considered', tone: 'bad', stmt: '4.10', why: 'The patient also had a non-bleeding decompensating event.', next: 'Weak recommendation: discuss both.' };
    if (key === 'both') return { head: 'Carvedilol and banding', tone: 'ok', stmt: '4.8', why: 'The bleed is the only decompensating event and the patient tolerates both.', next: 'Carvedilol is preferred to the other NSBBs, whether or not the patient was on one before.' };
    return { head: p.can === 'evl' ? 'Banding alone' : 'Carvedilol alone', tone: 'warn', stmt: '4.9', why: 'Only one of the two can be given.', next: 'Start or continue the tolerated one as monotherapy.' };
  },
  chips: (p) => ['Esophageal bleed', p.more ? 'Ascites or HE too' : 'Bleed only', p.can === 'evl' ? 'Banding only' : p.can === 'nsbb' ? 'Carvedilol only' : 'Both possible'],
  patientFor(tool) {
    const b = { ...DEFAULT, ...(tool?.patient || {}) };
    return { more: !!b.more, can: CAN.includes(b.can) ? b.can : 'both' };
  },
  worst: { more: true, can: 'nsbb' },
  notes: 'After a first esophageal variceal bleed that is the patient\'s only decompensating event, first-line prevention of rebleeding is a nonselective beta-blocker with endoscopic band ligation, carvedilol being preferred to the other beta-blockers whether or not the patient was already on one (4.8, strong). If the patient cannot have either band ligation or carvedilol, the tolerated treatment alone is started or kept (4.9, strong). These patients are those not eligible for rescue or preemptive TIPS. If the patient has also had a non-bleeding decompensating event, TIPS and liver transplant may be considered (4.10, weak).',
};
