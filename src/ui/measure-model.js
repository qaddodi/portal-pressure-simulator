// Pressure measurement card content (blueprint F3): what a hepatic vein pressure card may show.
// Pure: metrics + params in, labeled rows out, so it is unit-testable and shared by every surface.

const HV = { R: 'RHV_IVC', M: 'MHV_IVC', L: 'LHV_IVC' };
/** A hepatic vein too obstructed to pass a catheter or to give an interpretable wedge. */
export const veinBlocked = (p, v = 'R') => (p.thrombus?.[HV[v]] || 0) >= 0.5 || (p.stenosis?.[HV[v]] || 0) >= 0.8;

/**
 * @param m metrics frame, p params, hidden the case's hidden readout keys (or null)
 * @returns {{ blocked, recorded, model, network, notes }} rows are [label, value, unit, site]
 */
export function measureView(m, p, hidden) {
  const blocked = veinBlocked(p, 'R');
  const hideTrue = !!hidden?.has('trueHVPG'), hidePv = !!hidden?.has('pv');
  const recorded = [];
  if (!blocked && m.measured) {
    recorded.push(['Free hepatic venous pressure (FHVP)', m.measured.fhvp, 'mmHg', 'right hepatic vein, catheter free']);
    if (m.measured.wedged) {
      recorded.push(['Wedged hepatic venous pressure (WHVP)', m.measured.whvp, 'mmHg', 'right hepatic vein, balloon wedged']);
      recorded.push(['Wedged − free', m.measured.whvp - m.measured.fhvp, 'mmHg', 'recorded sequentially']);
    }
  }
  const model = blocked || hideTrue ? [] : [
    ['FHVP', m.fhvp, 'mmHg', 'right hepatic vein'],
    ['WHVP', m.whvp, 'mmHg', 'right-lobe wedge surrogate'],
    ['HVPG', m.hvpg, 'mmHg', 'WHVP − FHVP'],
  ];
  const network = hidePv ? [] : [
    ['Portal confluence', m.pv, 'mmHg', 'model network'],
    ['IVC at the right atrium', m.ivc ?? null, 'mmHg', 'model network'],
    ['Portal − IVC (PPG)', m.ppg, 'mmHg', 'portal confluence − IVC'],
  ].filter((r) => r[1] != null);
  const notes = ['Model values with stated sampling sites. The wedge reflects sinusoidal pressure, so a block before the sinusoids is not seen by HVPG.'];
  if (blocked) notes.unshift('Not interpretable here: the right hepatic vein is obstructed, so no catheter can be wedged and a free or wedged pressure would not estimate the sinusoidal gradient. The network pressures below are shown separately.');
  else if ((m.ra ?? 0) >= 8) notes.push('Right atrial pressure is raised: free and wedged pressures rise together, so HVPG stays small.');
  if (!blocked && m.ppg - m.hvpg > 4 && !hidePv && !hideTrue) notes.push('Portal pressure exceeds the wedged estimate: the block lies before the sinusoids.');
  return { blocked, recorded, model, network, notes };
}
