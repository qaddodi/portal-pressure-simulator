// Built-in slides that took up an opt-in deck visual on Mohammad's pick (20 Oct 2026, "Do all except #1":
// review/deck-card-ideas/recs.md). Each package test that says "no built-in deck uses this" skips exactly these slides and
// fields, so the guard stays as strict for every other slide; deck-adopted.test.js checks that every entry is still in
// use, so the list never grows wider than the decks. Fields: 'kind:<tool kind>', 'tool.<option>', 'cols.<column>', or a
// slide field.
export const ADOPTED = {
  'pvt-cirrhosis/clot': ['kind:lumen'],
  'pvt-cirrhosis/carv': ['ripple'],
  'pvt-cirrhosis/anticoag': ['kind:lumen'],
  'pvt-cirrhosis/course': ['tool.bands'],
  'shunts/own': ['kind:flows'],
  'shunts/grs': ['kind:flows'],
  'shunts/srs': ['kind:flows'],
  'shunts/tips': ['calipers'],
  'shunts/wide': ['kind:curve'],
  'shunts/brto': ['kind:flows'],
};

/** Whether the slide d/s may use the field. */
export const adopted = (d, s, field) => (ADOPTED[`${d.id}/${s.id}`] || []).includes(field);

/** Whether the slide uses the field. */
export function uses(s, field) {
  const [kind, name] = field.split(/[.:](.*)/s);
  if (kind === 'kind') return s.tool?.kind === name;
  if (kind === 'tool') return s.tool?.[name] !== undefined;
  if (kind === 'cols') return (s.cols || []).includes(name);
  return s[field] !== undefined;
}
