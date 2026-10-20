// Built-in slides that took up an opt-in deck visual on Mohammad's pick (20 Oct 2026, "Do all except #1":
// review/deck-card-ideas/recs.md). Each package test that says "no built-in deck uses this" skips exactly these slides and
// fields, so the guard stays as strict for every other slide; deck-adopted.test.js checks that every entry is still in
// use, so the list never grows wider than the decks. Fields: 'kind:<tool kind>', 'tool.<option>', 'cols.<column>', or a
// slide field.
export const ADOPTED = {
  'circuit/ohm': ['span'],
  'circuit/where': ['zone'],
  'circuit/meal': ['span'],
  'circuit/resist': ['zone', 'span'],
  'circuit/both': ['span'],
  'circuit/parallel': ['kind:flows'],
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
  'doppler/probe': ['tool.mode'],
  'doppler/hepatic': ['tool.mode'],
  'doppler/rhf': ['tool.pair', 'tool.calipers'],
  'doppler/summary': ['cols.wave', 'wave'],
  'tips-doppler/shunted': ['kind:flows'],
  'tips-doppler/alias': ['tool.scale'],
  'tips-doppler/alias-fix': ['tool.scale', 'tool.baseline'],
  'tips-doppler/where': ['tool.mode'],
  'two-inflows/dual': ['kind:flows'],
  'two-inflows/switch': ['kind:flows'],
  'two-inflows/tips': ['kind:flows'],
  'two-inflows/summary': ['cols.wave', 'wave'],
  'stiffness/spleen': ['calipers', 'normalOutline'],
  'stiffness/rule': ['visual', 'plane'],
  'stiffness/year': ['cite'],
  'encephalopathy/collat': ['kind:flows'],
  'encephalopathy/srs': ['kind:flows'],
  'encephalopathy/embolize': ['kind:flows'],
  'encephalopathy/tips': ['kind:flows'],
  'encephalopathy/narrow': ['kind:flows'],
  'tap/back': ['kind:fluid'],
  'tap/diuretics': ['kind:fluid'],
  'tap/tips': ['kind:fluid'],
  'spleen/grown': ['normalOutline', 'calipers'],
  'spleen/later': ['calipers'],
  'varices/collat': ['lens:system'],
  'varices/lapse': ['calipers', 'normalOutline'],
  'varices/eso': ['spot'],
  'varices/umbilical': ['kind:flows'],
};

/** Whether the slide d/s may use the field. */
export const adopted = (d, s, field) => (ADOPTED[`${d.id}/${s.id}`] || []).includes(field);

/** Whether the slide uses the field. */
export function uses(s, field) {
  const [kind, name] = field.split(/[.:](.*)/s);
  if (kind === 'kind') return s.tool?.kind === name;
  if (kind === 'tool') return s.tool?.[name] !== undefined;
  if (kind === 'cols') return (s.cols || []).includes(name);
  if (kind === 'lens') return s.lens === name;
  return s[field] !== undefined;
}
