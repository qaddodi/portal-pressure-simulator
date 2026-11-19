// The rotation sweep's pure parts (scripts/rotate-sweep.mjs): the pairs of sizes, how two reads of one slide are compared, the summary text. Node only.

import { SIZES } from './gallery-sweep-lib.mjs';

/** The turns a sweep makes: from one size to the other, both ways. A window resize across the phone, tablet and short thresholds is the same event. */
export const TURNS = [['ipad', 'ipad-portrait'], ['iphone', 'iphone-landscape'], ['mac', 'mac-short']];
export const turnsFor = (devices) => TURNS.flatMap(([a, b]) => (devices.includes(a) && devices.includes(b) && SIZES[a] && SIZES[b] ? [[a, b], [b, a]] : []));

/**
 * One slide turned mid-talk against the same slide opened fresh at that size: boxes ({ selector: [l, t, r, b] }, the page's own 2 px steps) that
 * differ by more than `tol` px, and the findings only one of them has. A card that is on screen in one and absent in the other counts as a difference.
 */
export function compareTurn(fresh, turned, tol = 2) {
  const boxes = [];
  const F = fresh.boxes || {}, T = turned.boxes || {};
  for (const sel of new Set([...Object.keys(F), ...Object.keys(T)])) {
    const a = F[sel], b = T[sel];
    if (!a || !b) { boxes.push(`${sel}: ${a ? 'only in a fresh open' : 'only in the turned one'} ${JSON.stringify(a || b)}`); continue; }
    if (a.some((v, i) => Math.abs(v - b[i]) > tol)) boxes.push(`${sel}: fresh [${a}] turned [${b}]`);
  }
  const pa = new Set(fresh.problems || []), pb = new Set(turned.problems || []);
  const problems = [...[...pa].filter((p) => !pb.has(p)).map((p) => `only in a fresh open: ${p}`), ...[...pb].filter((p) => !pa.has(p)).map((p) => `only after the turn: ${p}`)];
  return { boxes, problems, same: !boxes.length && !problems.length };
}

/** The text summary of a run: counts, then each slide that differs, grouped by turn. */
export function summarizeTurns(report) {
  const rs = Object.values(report.results);
  const bad = rs.filter((r) => r.ok === false), diff = rs.filter((r) => r.ok !== false && !r.same);
  const out = [`rotate-sweep: ${rs.length} turns (${report.turns.map((t) => t.join(' > ')).join(', ')}) in ${Math.round(report.seconds)} s`, `  ${bad.length} did not open, ${diff.length} slides laid out differently after the turn than in a fresh open`];
  if (bad.length) { out.push('', 'DID NOT OPEN:'); for (const r of bad) out.push(`  ${r.deck} slide ${r.slide}, ${r.turn}: ${r.error || 'did not open'}`); }
  if (diff.length) {
    out.push('', 'DIFFERENT AFTER THE TURN:');
    let turn = '';
    for (const r of [...diff].sort((a, b) => a.turn.localeCompare(b.turn) || a.deck.localeCompare(b.deck) || a.slide - b.slide)) {
      if (r.turn !== turn) { turn = r.turn; out.push(`  ${turn}:`); }
      out.push(`    ${r.deck} slide ${r.slide}:`);
      for (const t of [...r.boxes, ...r.problems]) out.push(`      ${t}`);
    }
  }
  return out.join('\n');
}
