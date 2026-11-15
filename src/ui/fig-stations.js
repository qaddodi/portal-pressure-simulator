// The figure's keyboard walk (F15): the arrow keys step through its stations in the order the blood meets them, from the gut to the heart:
// superior mesenteric vein, splenic vein, portal vein, sinusoids, hepatic veins, IVC, right atrium. Pure (no page): the figure hands it the
// items its keyboard can reach now (stage-pick.js figItems), and it names the next station and what to say. A station that is not drawn
// (a hepatic vein a Budd-Chiari patient has no flow in, an organ the circuit does not show) is skipped; the right atrium is the heart in
// the anatomy and its station in the circuit.
export const STATIONS = [
  { name: 'Superior mesenteric vein', ids: ['SMV_CONF'] },
  { name: 'Splenic vein', ids: ['SV_CONF'] },
  { name: 'Portal vein', ids: ['PV_TRUNK'] },
  { name: 'Sinusoids', ids: ['SIN_RR', 'SIN_LL'] },
  { name: 'Hepatic veins', ids: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'] },
  { name: 'Inferior vena cava', ids: ['IVCS_RA'] },
  { name: 'Right atrium', ids: ['organ:heart', 'node:RA'] },
];

/** The stations the keyboard can reach now, in flow order: [{ item, name }]. */
export function stationsOf(items) {
  const out = [];
  for (const s of STATIONS) {
    const item = s.ids.find((id) => items.includes(id));
    if (item) out.push({ item, name: s.name });
  }
  return out;
}

/**
 * The station a step of the arrows lands on. cur: the item the keyboard is on (or null); dir: +1 toward the heart, -1 toward the gut.
 * From an item that is not a station (a Tab stop on some other vessel) the walk starts at the first station going on, the last going back.
 * It stops at either end (an arrow never wraps round: the end is the right atrium). Returns { item, name, n, of } or null when none is drawn.
 */
export function stationStep(items, cur, dir) {
  const list = stationsOf(items);
  if (!list.length) return null;
  const at = cur == null ? -1 : list.findIndex((s) => s.item === cur || STATIONS.some((t) => t.name === s.name && t.ids.includes(cur)));
  const to = at < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + dir));
  return { item: list[to].item, name: list[to].name, n: to + 1, of: list.length };
}
