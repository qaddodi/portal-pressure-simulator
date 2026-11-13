// Can carvedilol be stopped after recompensation? Baveno VIII 7.15 to 7.19. Stop only if CSPH resolution is confirmed: HVPG <10 mmHg off
// carvedilol (7.16), or by stiffness: LSM <10 kPa, or LSM <15 with SSM <25 kPa (7.19). LSM >25 kPa may rule CSPH in. Varices and collaterals
// can stay after CSPH resolves, so they prove nothing (7.17).
// Patient { hv: 'none' | 'low' | 'high' (HVPG off carvedilol: not measured, <10, ≥10 mmHg), lsm, ssm } in kPa.
// Changed from the mock: an HVPG measured ≥10 mmHg off carvedilol is direct proof that CSPH persists, so it keeps carvedilol whatever the stiffness says.
import { act, inheritTone } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'Recompensated, on carvedilol', r: 'Stop only if CSPH has resolved', s: 'Varices and collaterals can persist after CSPH resolves, so they do not show it persists.', stmt: '7.17, 7.18', tone: 'n', kids: [
    { id: 'res', t: 'Resolution shown', r: 'CSPH has resolved', s: 'HVPG <10 mmHg off carvedilol, or LSM <10 kPa, or LSM <15 with SSM <25 kPa.', stmt: '7.16, 7.19', tone: 'ok', sh: 'Resolved', kids: [act('stop', 'Carvedilol may be stopped', { stmt: '7.18' })] },
    { id: 'open', t: 'Resolution not shown', r: 'CSPH not ruled out', s: 'LSM >25 kPa may rule it in.', stmt: '7.19c', tone: 'warn', sh: 'Not shown', kids: [act('keep', 'Keep carvedilol')] },
  ],
}, 'n');

const DEFAULT = { hv: 'none', lsm: 8, ssm: 20 };
const resolved = (p) => p.hv !== 'high' && (p.hv === 'low' || p.lsm < 10 || (p.lsm < 15 && p.ssm < 25));

export default {
  id: 'stopcarv',
  label: 'Stopping carvedilol after recompensation',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree,
  mapWords: { res: ['Resolved'], open: ['Not', 'shown'], stop: ['Stop'], keep: ['Keep'] },
  lit(p) {
    const L = new Set(['root']);
    if (resolved(p || {})) { L.add('res'); L.add('stop'); } else { L.add('open'); L.add('keep'); }
    return L;
  },
  outcomes: ['stop', 'keep'],
  outcomeOf: (L) => (L.has('stop') ? 'stop' : L.has('keep') ? 'keep' : null),
  reading(key, p) {
    if (key === 'stop') return { head: 'Carvedilol may be stopped', tone: 'ok', stmt: '7.18', why: p.hv === 'low' ? 'HVPG is <10 mmHg off carvedilol, which confirms that CSPH has resolved.' : p.lsm < 10 ? `LSM ${p.lsm} kPa is <10, which may rule CSPH out.` : `LSM ${p.lsm} kPa is <15 and SSM ${p.ssm} kPa is <25, which may rule CSPH out.`, next: 'Persistent varices or collaterals do not mean CSPH persists.' };
    return { head: 'Keep carvedilol', tone: 'warn', stmt: '7.19', why: p.hv === 'high' ? 'HVPG is ≥10 mmHg off carvedilol, so CSPH persists.' : p.lsm > 25 ? `LSM ${p.lsm} kPa is >25, which may rule CSPH in.` : 'No test has shown that CSPH resolved.', next: 'Measure HVPG off carvedilol if the decision depends on it, or repeat LSM and SSM later.' };
  },
  chips: (p) => [p.hv === 'low' ? 'HVPG <10 off carvedilol' : p.hv === 'high' ? 'HVPG ≥10 off carvedilol' : 'HVPG not measured', `LSM ${p.lsm} kPa`, `SSM ${p.ssm} kPa`],
  patientFor(tool, fp, shown = (k, v) => v) {
    const b = { ...DEFAULT, ...(tool?.patient || {}) };
    const live = (k, v) => (fp && Number.isFinite(fp[k]) ? shown(k, fp[k]) : v);
    return { hv: ['none', 'low', 'high'].includes(b.hv) ? b.hv : 'none', lsm: live('lsm', b.lsm), ssm: live('ssm', b.ssm) };
  },
  worst: { hv: 'high', lsm: 99.9, ssm: 99.9 },
  notes: 'Carvedilol (or another nonselective beta-blocker) in a recompensated patient may be stopped only if resolution of clinically significant portal hypertension can be confirmed (7.18, weak). CSPH may resolve over time after recompensation (7.15). Resolution is confirmed by an HVPG <10 mmHg measured off carvedilol (7.16). Portosystemic collaterals and varices may persist after CSPH has resolved, so they are not reliable signs that it persists, and the risk of bleeding from them seems low (7.17). Without an HVPG, stiffness may be used (7.19): LSM <10 kPa may rule CSPH out, LSM <15 kPa with SSM <25 kPa may rule it out, and LSM >25 kPa may rule it in. Where none of these shows resolution, carvedilol is kept. An HVPG of ≥10 mmHg off carvedilol shows that CSPH persists.',
};
