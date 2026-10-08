// Hepatic vein obstruction: a vein too blocked to pass a catheter or to give an interpretable wedge
// pressure. Pure: params in, boolean out. The cases' HVPG study withholds the vein's values with it.

const HV = { R: 'RHV_IVC', M: 'MHV_IVC', L: 'LHV_IVC' };
/** A hepatic vein too obstructed to pass a catheter or to give an interpretable wedge. */
export const veinBlocked = (p, v = 'R') => (p.thrombus?.[HV[v]] || 0) >= 0.5 || (p.stenosis?.[HV[v]] || 0) >= 0.8;
