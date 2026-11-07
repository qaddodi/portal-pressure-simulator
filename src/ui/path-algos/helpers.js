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
