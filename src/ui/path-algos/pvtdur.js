// Recent portal vein clot: how long to anticoagulate. Baveno VIII 9.6 to 9.10 (checked on guidelines/baveno-viii-2026.pdf, 7 Nov 2026):
//   9.6 anticoagulate at once, at a therapeutic dose (strong). 9.7 with recent SMV extension, assess for intestinal ischaemia.
//   9.8 ≥6 months (strong); stopping may be considered (weak) after complete recanalisation at 3 months, with the reversible risk factor
//       resolved and no permanent risk factor. 9.9 SMV and/or splenic vein extension that is not recanalised at 6 months: full dose for
//       6 more months may be continued (weak). 9.10 the long-term plan depends on the type of risk factor (Fig. 5).
// The guideline gives nothing more for a clot that is still blocked at 6 months but did not extend, so that patient lands on the
// long-term plan (9.10), with a reading that says so.
import { inheritTone } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'Recent portal vein clot', r: 'Anticoagulate now, full dose', s: 'If it reaches the SMV, look for bowel ischaemia.', stmt: '9.6, 9.7', tone: 'n', kids: [
    { id: 'stop', t: 'At 3 months: fully recanalised, reversible factor gone, no permanent one', r: 'Stopping can be considered', stmt: '9.8', tone: 'ok', sh: 'Can stop' },
    { id: 'cont', t: 'Otherwise', r: 'Anticoagulate ≥6 months', stmt: '9.8', tone: 'warn', sh: '6 months', kids: [
      { id: 'lt', t: 'At 6 months: recanalised, or no extension', r: 'Long-term plan by risk factors', s: 'See the risk-factor grid.', stmt: '9.10', tone: 'ok', sh: 'Long-term' },
      { id: 'ext', t: 'At 6 months: SMV or splenic extension, not recanalised', r: '6 more months, full dose', s: 'Late recanalisation can still happen.', stmt: '9.9', tone: 'bad', sh: '6 more' }] }] }, 'n');

const mapWords = { stop: ['Can', 'stop'], cont: ['6 months'], lt: ['Long-term', 'plan'], ext: ['6 more'] };

function lit(p) {
  const L = new Set(['root']);
  if (p.at === '3' && p.rec && p.rev && !p.perm) L.add('stop');
  else { L.add('cont'); if (p.at === '6') L.add(p.ext && !p.rec ? 'ext' : 'lt'); }
  return L;
}
const outcomeOf = (L) => ['stop', 'ext', 'lt', 'cont'].find((k) => L.has(k)) || null;
const outcomes = ['stop', 'cont', 'lt', 'ext'];

function reading(key, p) {
  if (key === 'stop') return { head: 'Stopping can be considered', tone: 'ok', stmt: '9.8', why: 'At 3 months the vein is fully open, the reversible factor is gone and there is no permanent factor.', next: 'This is a weak recommendation.' };
  if (key === 'ext') return { head: '6 more months, full dose', tone: 'bad', stmt: '9.9', why: 'The clot reached the SMV or splenic vein and the vein is still blocked at 6 months.', next: 'Delayed recanalisation can still occur. This is a weak recommendation.' };
  if (key === 'lt') return { head: 'Long-term plan by risk factors', tone: 'ok', stmt: '9.10', why: p.rec ? 'The 6 months are done and the vein is open.' : 'The 6 months are done. The vein is still blocked, but the clot did not extend into the SMV or splenic vein.', next: 'Whether to continue depends on the risk factors: see the risk-factor grid.' };
  return { head: 'Anticoagulate ≥6 months', tone: 'warn', stmt: '9.8', why: 'The conditions to stop early are not all met: the vein is not fully open, a reversible factor is still there or a permanent one is present.', next: 'Keep full-dose anticoagulation to 6 months, then review.' };
}

const chips = (p) => [`At ${p.at} months`, p.rec ? 'Recanalised' : 'Not recanalised', p.rev && 'Reversible factor gone', p.perm && 'Permanent factor', p.ext && 'SMV or splenic extension'].filter(Boolean);

function patientFor(tool) {
  const b = tool?.patient || {};
  return { at: String(b.at) === '6' ? '6' : '3', rec: !!b.rec, rev: !!b.rev, perm: !!b.perm, ext: !!b.ext };
}

export default {
  id: 'pvtdur',
  label: 'Recent portal vein clot: how long to anticoagulate',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree, mapWords, lit,
  outcomes, outcomeOf, reading, chips, patientFor,
  worst: { at: '6', rec: false, rev: true, perm: true, ext: true },
  notes: 'A recent portal vein thrombosis rarely resolves on its own, and recanalisation follows early anticoagulation, so treatment starts at once at a therapeutic dose (9.6). If the clot has reached the superior mesenteric vein, look for clinical and radiological signs of intestinal ischaemia (9.7). Anticoagulate for ≥6 months (9.8, strong); stopping may be considered, as a weak recommendation, when the vein is fully recanalised at 3 months, the reversible risk factor has resolved and there is no permanent risk factor. If the clot extends into the SMV or splenic vein and the vein is not recanalised at 6 months, full-dose treatment may continue for 6 more months, because late recanalisation can still happen (9.9, weak). The long-term plan then depends on the type of risk factor (9.10, Fig. 5).',
};
