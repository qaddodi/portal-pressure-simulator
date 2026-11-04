// Progressive reveal of a slide's line (slide field reveal: true, N3 / V-SLIDE-9). The line is cut into clauses, and each Next brings
// in one more (and lights the terms it names); Back takes the last away. Pure text work, no DOM: presenter.js draws the clauses (all
// of them from the start, the unshown ones transparent, so the card is fitted once and never reflows), slide-beats.js counts them
// as views of the figure.
//
//   line: 'Pressure backs up, the spleen swells; collaterals open.'     cut after a comma, semicolon or full stop
//   line: 'Portal pressure rises | and the spleen swells | and collaterals open.'    cut at each | (the bars do not show)
//
// A cut after "," ";" "." or ":" is made only between words (not inside a number, a {value}, a [term](link) or an abbreviation), and
// a clause shorter than SHORT characters joins the one after it (the last, the one before it), so no clause is a stub.

const SHORT = 14;
const ABBR = /(?:\b(?:e\.g|i\.e|vs|approx|ca|Dr|Fig|Figs|No|et al|cf)|\b[A-Z])\.$/;

/** The clauses of a line, each with the space that follows it, so they join back into the line the learner reads. */
export function clausesOf(line) {
  const t = String(line || '');
  if (!t.trim()) return [];
  if (t.includes('|')) return t.split('|').map((p) => p.trim()).filter(Boolean).map((p, i, a) => (i < a.length - 1 ? `${p} ` : p));
  const out = []; let at = 0, depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === ',' || c === ';' || c === '.' || c === ':') && /\s/.test(t[i + 1] || '') && !ABBR.test(t.slice(Math.max(0, i - 8), i + 1))) {
      let e = i + 1;
      while (/\s/.test(t[e] || '')) e++;
      if (e < t.length) { out.push(t.slice(at, e)); at = e; i = e - 1; }
    }
  }
  out.push(t.slice(at));
  // (Stubs join a neighbour: a short clause leads into the next; a short last one trails the one before.)
  const merged = [];
  for (const p of out) {
    if (merged.length && merged.at(-1).trim().length < SHORT) merged[merged.length - 1] += p; else merged.push(p);
  }
  if (merged.length > 1 && merged.at(-1).trim().length < SHORT) { const last = merged.pop(); merged[merged.length - 1] += last; }
  return merged;
}

/** The line as the learner reads it (the bars of an explicit cut gone). */
export const plainLine = (line) => clausesOf(line).join('') || String(line || '');

/** How many clauses a slide brings in one at a time: 0 when it does not reveal (no flag, one clause, or a card that owns its own steps). */
export function revealCount(s) {
  if (!s?.reveal || s.visual || s.beats || s.lapse || s.cath || s.procedure || s.scales || !s.line) return 0;
  const n = clausesOf(s.line).length;
  return n > 1 ? n : 0;
}

/** The first `n` clauses of a slide's line (all of them when it does not reveal). */
export function shownLine(s, n) {
  if (!revealCount(s) || n == null) return s?.line || '';
  return clausesOf(s.line).slice(0, Math.max(1, n)).join('').trim();
}

/** What is wrong with a slide's reveal. */
export function revealProblems(s) {
  if (s?.reveal === undefined) return [];
  const out = [];
  if (s.reveal !== true) out.push('reveal is true or left out');
  if (!s.line) out.push('reveal needs a line to reveal');
  else if (s.reveal === true && clausesOf(s.line).length < 2) out.push('reveal: the line has one clause only; cut it with commas, semicolons or |');
  for (const [k, why] of [['beats', 'camera beats'], ['lapse', 'a time-lapse'], ['cath', 'a catheter'], ['procedure', 'a procedure'], ['scales', 'a scale switch'], ['visual', 'a visual']]) {
    if (s[k]) out.push(`no reveal on a slide with ${why}: each takes the Next key for its own steps`);
  }
  return out;
}
