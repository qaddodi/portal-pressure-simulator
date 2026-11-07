// Small helpers the guideline path card's algorithm modules share (src/ui/path-algos/<id>.js). Plain data, no page.

/** A leaf action box: the thing to do. */
export const act = (id, t, o = {}) => ({ id, t, act: true, sh: t, ...o });

/** A node's tone passed down to children that have none of their own (an action takes its branch's). Returns the tree. */
export function inheritTone(tree, tone = 'n') {
  (function w(n, t) { n.tone = n.tone || t; (n.kids || []).forEach((k) => w(k, n.tone)); })(tree, tone);
  return tree;
}

/** Child–Pugh class of a score. */
export const cpClass = (cp) => (cp <= 6 ? 'A' : cp <= 9 ? 'B' : 'C');

/** Leaves under a node (a node with none counts one). */
export const leavesOf = (n) => (n.kids ? n.kids.reduce((s, k) => s + leavesOf(k), 0) : 1);

// ── The card kinds that are not trees (score, grid, ladder: drawn by path-cards.js) ──
// Their lit set names the answers (and a 'root', so a patient always lights something): the ids are the ones path-cards.js draws from.

/** The index of an option, an integer in 0..n-1 (the patient's answers are stored as the index of the option chosen), else the default. */
export const pickIndex = (v, n, d) => { const i = Math.trunc(+v); return v != null && v !== '' && Number.isFinite(i) && i >= 0 && i < n ? i : d; };

/** A score's total: the points of the option chosen in each row. */
export const scoreTotal = (rows, p) => rows.reduce((s, r) => s + r.o[p[r.k]][1], 0);

/** The score card's patient/lit/reading functions, from its rows and verdict (psvdscore.js, recomp.js). rows: [{ k, n, d?, o: [[label, points]] }]. */
export function scoreKit({ rows, verdict, zones, allOf = false, defaults, stmt }) {
  const stateOf = (p) => { const t = scoreTotal(rows, p), v = verdict(t, p, rows); return { t, v }; };
  return {
    rows, zones, verdict, allOf, defaults, stmt,
    outcomes: zones.map((_, i) => `z${i}`),
    lit(p) { const { v } = stateOf(p); return new Set(['root', ...rows.map((r) => `${r.k}:${p[r.k]}`), `z${v.z}`]); },
    outcomeOf: (L) => [...L].find((id) => /^z\d+$/.test(id)) || null,
    reading(key, p) {
      const { t, v } = stateOf(p), n = rows.length;
      const answers = rows.map((r) => `${r.n}: ${r.o[p[r.k]][0]}`).join('; ');
      return { head: v.head, tone: v.tone, stmt, z: v.z, score: t, why: `${allOf ? `${t} of ${n} met` : `Score ${t}`}. ${answers}.`, next: v.next || '' };
    },
    chips: () => [],
    patientFor(tool) { const base = tool?.patient || {}; return Object.fromEntries(rows.map((r) => [r.k, pickIndex(base[r.k], r.o.length, defaults[r.k])])); },
  };
}
