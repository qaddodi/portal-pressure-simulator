// Each runner's own results as a Run report (src/ui/report/run.js): one adapter per tool, so the shapes the tools keep (a Sweep's results, a Phone check's rows, a deck sweep's
// slide visits) stay theirs and the report every tool ends with is one. Pure: handed data, returns a run.
import { fromProblem, fromGroup, fromWalkFlag, fromDeckLine, finding } from './finding.js';
import { buildRun } from './run.js';

const secs = (ms) => `${Math.round(ms / 1000)} s`;

/** The Check button's problems ({ kind, text, where? }) on the screen in hand. */
export function checkRun(problems, where = {}) {
  return buildRun({ tool: 'check', device: { screen: where.size }, scope: { look: where.look, title: where.title }, started: where.at,
    findings: problems.map((p) => fromProblem(p, { look: where.look, device: where.size })) });
}

/** A gallery Sweep's results ([{ id, look, ok, lost, settled, problems, errors, error, ms }]) and its summary. */
export function sweepRun({ results = [], summary = {}, spec = {}, size = null, ms = 0, stoppedEarly = false, tooMany = false, kills = 0, unknown = [], at = '' } = {}) {
  const f = [];
  for (const r of results) {
    const scope = { specimen: r.id, look: r.look, device: size };
    for (const p of r.problems || []) f.push(fromProblem(p, scope));
    if (r.lost) f.push(finding({ rule: 'sweep-lost', what: 'lost to a reload (the tab was ended while this was open)', scope }));
    else if (!r.ok) f.push(finding({ rule: 'sweep-open', what: `did not open: ${r.error || 'no reason given'}`, scope }));
    else if (!r.settled) f.push(finding({ rule: 'sweep-unsettled', sev: 'warn', what: `cards or camera still moving after ${secs(r.ms || 0)}`, scope }));
    if (r.errors > 0) f.push(finding({ rule: 'sweep-errors', sev: 'warn', what: `${r.errors} error${r.errors === 1 ? '' : 's'} counted while open (pps.caught)`, scope }));
  }
  const notes = [];
  if (stoppedEarly) notes.push(`stopped early: ${results.length} of ${summary.planned ?? '?'} opens done`);
  if (tooMany) notes.push(`stopped after ${kills} reloads (the browser ended the tab)`);
  return buildRun({ tool: 'sweep', device: { screen: size }, scope: { looks: (spec.looks || []).join(','), family: spec.family, section: spec.section }, started: at, ms,
    findings: f, health: { peakMB: summary.peakMB, errors: summary.errors, specimens: summary.specimens, opens: summary.opens }, notes, missing: unknown.length ? [`not in the catalog: ${unknown.join(', ')}`] : [] });
}

/** The Phone check: its rows (each with `flags`), its grouped fit and self-check problems, the tab kills, and what did not get walked. */
export function walkRun({ rows = [], problems = [], killed = [], dropped = [], summary = {}, info = {}, ms = 0, at = '' } = {}) {
  const f = [];
  const device = info.device || undefined;
  for (const g of problems) f.push(fromGroup(g, { device, look: info.look }));
  for (const r of rows) for (const fl of r.flags || []) f.push(fromWalkFlag(fl, { step: `${r.journey} > ${r.label}`, device, look: info.look }));
  for (const k of killed) f.push(finding({ rule: 'walk-tab-ended', what: `the browser ended the tab on step ${k.i + 1}: ${k.label}`, scope: { step: `${k.journey} > ${k.label}`, device, look: info.look } }));
  const notes = [];
  if (dropped.length) notes.push(`${dropped.length} path${dropped.length === 1 ? '' : 's'} not walked: ${dropped.join(', ')}`);
  return buildRun({ tool: 'phone-check', build: { commit: info.build }, device: { name: device, rate: info.rate }, scope: { look: info.look, steps: rows.length }, started: at, ms, findings: f,
    health: { peakMB: summary.peakMb, envelopeMB: summary.envelopeMb, errors: summary.errors }, notes });
}

/** A deck sweep's report ({ at, devices, decks, seconds, fast, cardsOnly, results: { key: { deck, slide, device, shuffle, ok, error, problems: ['kind: words'] } } }). */
export function deckRun(report) {
  const f = [];
  for (const r of Object.values(report.results || {})) {
    const scope = { deck: r.deck, slide: r.slide, device: r.device };
    if (r.ok === false) { f.push(finding({ rule: 'deck-open', what: r.error || 'did not open or settle', scope })); continue; }
    for (const line of r.problems || []) f.push(fromDeckLine(line, r.shuffle ? { ...scope, step: 'shuffle' } : scope));
  }
  return buildRun({ tool: 'deck-sweep', device: { sizes: (report.devices || []).join(',') }, scope: { decks: (report.decks || []).length, fast: report.fast ? 'yes' : undefined, cardsOnly: report.cardsOnly ? 'yes' : undefined }, started: report.at, ms: (report.seconds || 0) * 1000, findings: f });
}
