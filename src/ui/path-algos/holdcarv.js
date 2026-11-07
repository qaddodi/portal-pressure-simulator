// Hold or restart carvedilol in decompensation: Baveno VIII 4.6 and 4.7. Reduce the dose or stop it for persistently low pressure
// (systolic <90 or mean <65 mmHg) and/or HRS-AKI; restart and re-titrate once the HRS-AKI has resolved and/or the pressure has recovered.
// Patient { held, sbp, hrs, map? }: map (mean arterial pressure, mmHg) is optional; a slide that gives none is judged on the systolic alone.
import { inheritTone } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'Decompensated cirrhosis, carvedilol', r: 'Watch pressure and kidney', stmt: '4.6, 4.7', tone: 'n', kids: [
    { id: 'low', t: 'SBP <90 or MAP <65 mmHg, and/or HRS-AKI', r: 'Reduce the dose or stop', s: 'If it is already stopped, it stays off.', stmt: '4.6', tone: 'bad', sh: 'Reduce or stop' },
    { id: 'okk', t: 'Pressure and kidney fine', r: 'Carry on', tone: 'ok', sh: 'Carry on' },
    { id: 'back', t: 'HRS-AKI resolved and pressure recovered', r: 'Restart and re-titrate', stmt: '4.7', tone: 'ok', sh: 'Restart' },
  ],
}, 'n');

const DEFAULT = { held: false, sbp: 84, hrs: true };
const lowSbp = (p) => p.sbp < 90;
const lowMap = (p) => Number.isFinite(p.map) && p.map < 65;
const bad = (p) => lowSbp(p) || lowMap(p) || !!p.hrs;

export default {
  id: 'holdcarv',
  label: 'Hold or restart carvedilol',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree,
  mapWords: { low: ['Reduce', 'or stop'], okk: ['Carry on'], back: ['Restart'] },
  lit(p) {
    const q = p || {};
    const L = new Set(['root']);
    if (bad(q)) L.add('low'); else L.add(q.held ? 'back' : 'okk');
    return L;
  },
  outcomes: ['low', 'okk', 'back'],
  outcomeOf: (L) => ['low', 'okk', 'back'].find((k) => L.has(k)) || null,
  reading(key, p) {
    if (key === 'low') {
      const why = [lowSbp(p) && `systolic pressure ${p.sbp} mmHg is <90`, lowMap(p) && `mean pressure ${p.map} mmHg is <65`, p.hrs && 'there is HRS-AKI'].filter(Boolean).join(' and ');
      return { head: p.held ? 'Stay off carvedilol' : 'Reduce or stop carvedilol', tone: 'bad', stmt: '4.6', why: `${why.charAt(0).toUpperCase()}${why.slice(1)}.`, next: 'Restart when the HRS-AKI has resolved and the pressure has recovered.' };
    }
    if (key === 'back') return { head: 'Restart and re-titrate', tone: 'ok', stmt: '4.7', why: 'The HRS-AKI has resolved and the pressure has recovered.', next: 'Re-titrate to the dose the patient tolerates.' };
    return { head: 'Carry on', tone: 'ok', stmt: '4.6', why: `Systolic pressure ${p.sbp} mmHg is ≥90${Number.isFinite(p.map) ? `, mean pressure ${p.map} mmHg is ≥65` : ''} and there is no HRS-AKI.`, next: 'Watch pressure and kidney at every review.' };
  },
  chips: (p) => [p.held ? 'Carvedilol held' : 'On carvedilol', `SBP ${p.sbp}`, Number.isFinite(p.map) && `MAP ${p.map}`, p.hrs ? 'HRS-AKI' : 'No HRS-AKI'].filter(Boolean),
  patientFor(tool) {
    const b = { ...DEFAULT, ...(tool?.patient || {}) };
    const p = { held: !!b.held, sbp: Number.isFinite(b.sbp) ? b.sbp : DEFAULT.sbp, hrs: !!b.hrs };
    if (Number.isFinite(b.map)) p.map = b.map;
    return p;
  },
  worst: { held: true, sbp: 140, hrs: false, map: 100 },
  notes: 'In decompensated cirrhosis carvedilol (or another non-selective beta-blocker) should be dose-reduced or stopped when the blood pressure stays low (systolic <90 mmHg or mean <65 mmHg) and/or there is HRS-AKI (4.6, strong). It should be restarted and re-titrated once the HRS-AKI has resolved and/or the pressure has recovered (4.7, strong). A patient whose drug is already held and who still has either problem stays off it; one who is held and has recovered on both counts is restarted.',
};
