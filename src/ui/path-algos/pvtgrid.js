// Portal vein clot without cirrhosis: long-term anticoagulation. Baveno VIII Fig. 5 and 9.10 (checked on guidelines/baveno-viii-2026.pdf,
// 7 Nov 2026): 9.10a a permanent major risk factor: long-term therapeutic anticoagulation (strong). 9.10b without one: long-term lower-dose
// DOACs can be considered (weak). 9.10c after complete resolution of a reversible factor and with no permanent factor: stopping can be
// considered (weak). The grid is the figure's own layout and its cell colours follow the figure (red, grey, blue). The major permanent risk
// factors are listed in the supplement (Table S4).
// The patient is the slide's own answers { r: 'yes' | 'no' (a reversible factor), c: 'abs' | 'min' | 'maj' (a permanent factor: none, not major, major) }.
const rowsH = [['yes', 'Reversible factor', 'provoked, within 3 months'], ['no', 'No reversible factor', 'unprovoked']];
const colsH = [['abs', 'No permanent factor'], ['min', 'Permanent, not major'], ['maj', 'Permanent, major']];
const cells = {
  'yes|abs': ['Consider stopping', 'if the factor has resolved', 'acc'], 'yes|min': ['Lower-dose DOAC', 'can be considered', 'warn'], 'yes|maj': ['Full dose, long-term', '', 'bad'],
  'no|abs': ['Lower-dose DOAC', 'can be considered', 'warn'], 'no|min': ['Lower-dose DOAC', 'can be considered', 'warn'], 'no|maj': ['Full dose, long-term', '', 'bad'],
};
const defaults = { r: 'yes', c: 'abs' };
const R = rowsH.map((r) => r[0]), C = colsH.map((c) => c[0]);
const norm = (p) => ({ r: R.includes(p?.r) ? p.r : defaults.r, c: C.includes(p?.c) ? p.c : defaults.c });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default {
  id: 'pvtgrid',
  label: 'PVT without cirrhosis: long-term anticoagulation',
  kind: 'grid',
  source: 'Baveno VIII',
  cite: 'Fig. 5',
  rowsH, colsH, cells, defaults,
  presets: [['Provoked, nothing permanent', { r: 'yes', c: 'abs' }], ['Unprovoked', { r: 'no', c: 'min' }], ['Major permanent factor', { r: 'no', c: 'maj' }]],
  outcomes: Object.keys(cells),
  lit(p) { const q = norm(p); return new Set(['root', `r:${q.r}`, `c:${q.c}`, `cell:${q.r}|${q.c}`]); },
  outcomeOf: (L) => { const id = [...L].find((i) => i.startsWith('cell:')); return id ? id.slice(5) : null; },
  reading(key, p) {
    const q = norm(p), cell = cells[key] || cells[`${q.r}|${q.c}`];
    return {
      head: cell[0], tone: cell[2], stmt: '9.10',
      why: q.c === 'maj' ? 'A permanent major risk factor is present.' : q.r === 'yes' && q.c === 'abs' ? 'The risk factor was reversible and nothing permanent is present.' : 'No permanent major risk factor.',
      next: cell[1] ? `${cap(cell[1])}.` : '',
    };
  },
  chips(p) { const q = norm(p); return [rowsH.find((r) => r[0] === q.r)[1], colsH.find((c) => c[0] === q.c)[1]]; },
  patientFor: (tool) => norm(tool?.patient),
  worst: { r: 'no', c: 'min' },   // (the longest two answers)
  notes: 'In a portal vein thrombosis without cirrhosis, the duration of anticoagulation depends on two questions (9.10, Fig. 5): was the risk factor reversible (provoked, within 3 months), and is any permanent risk factor major (the major ones are listed in supplement Table S4). With a permanent major risk factor, long-term therapeutic anticoagulation is recommended (9.10a, strong). With no major permanent factor, long-term lower-dose DOACs can be considered (9.10b, weak). After complete resolution of a reversible factor, with no permanent factor, stopping can be considered (9.10c, weak).',
};
