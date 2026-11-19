// One Run report (bible review 19 Nov 2026, DBG-3): what any runner (the Check, the Sweep, the Phone check, the deck sweep, a layout run, the bug packet) says when it finishes,
// as one object, one text and one JSON block a chat cannot break. Every tool keeps its own text (its own readers know what to put first); each ends with this block, and
// `report show|compare` (scripts/report.mjs) reads the block of any of them, so a Phone check paste and a packet from the same session can be compared.
// Pure: no DOM, no page.
//
//   buildRun({ tool, build, device, scope, started, ms, findings, health, notes, missing })   -> run object (findings normalized, capped)
//   validateRun(run)                  -> { ok, errors: [] }   the schema the contract test holds every runner to
//   renderRun(run, { json })          -> the text (head, counts, findings, notes) with the JSON block at the end when `json`
//   runBlock(run)                     -> just the JSON block, for a tool that keeps its own text and adds this under it
//   parseReport(text)                 -> { ok, run, from, why? }   a run block, a bug packet (converted), a replay result (converted), or JSON alone
//   compareRuns(a, b)                 -> { verdict, fixed, still, introduced, lines }

import { SEVS, finding, key, normalize } from './finding.js';
import { compareFindings } from '../packet/diff.js';
import { parsePacket } from '../packet/packet.js';

export const RUN_KIND = 'pps-run-report';
export const RUN_V = 1;
export const BEGIN = '-----BEGIN REPORT JSON-----';
export const END = '-----END REPORT JSON-----';
/** Findings carried in the JSON block: a paste stays something a thread can read (the text above it lists as many as it likes). */
export const MAX_FINDINGS = 400;

const hash32 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const withSum = (r) => { const q = { ...r }; delete q.sum; q.sum = hash32(JSON.stringify(q)); return q; };
const sumOk = (r) => { const { sum, ...rest } = r; return sum == null || sum === hash32(JSON.stringify(rest)); };

/** A Run report: the findings are normalized to Findings (any tool's shape), duplicates dropped, and over MAX_FINDINGS the rest are named in `missing`. */
export function buildRun({ tool, build, device, scope, started, ms, findings = [], health, notes = [], missing = [] } = {}) {
  const seen = new Set(), all = [];
  for (const raw of findings) { const f = normalize(raw); const k = `${key(f)}|${f.where}|${f.at || ''}|${JSON.stringify(f.scope || '')}`; if (!seen.has(k)) { seen.add(k); all.push(f); } }
  const miss = [...missing];
  if (all.length > MAX_FINDINGS) miss.push(`${all.length - MAX_FINDINGS} more findings than a report carries (the first ${MAX_FINDINGS}, the worst first, are here)`);
  const order = (f) => SEVS.indexOf(f.sev);
  const kept = all.length > MAX_FINDINGS ? all.map((f, i) => [f, i]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1]).slice(0, MAX_FINDINGS).map((x) => x[0]) : all;
  return withSum({ kind: RUN_KIND, v: RUN_V, tool: String(tool || 'unknown'), build: obj(build), device: obj(device), scope: obj(scope), started: String(started || ''), ms: Number.isFinite(ms) ? Math.round(ms) : null,
    findings: kept, total: all.length, health: obj(health), notes: notes.map(String), missing: miss });
}

/** The contract every runner's report passes: right kind and version, a tool name, Findings with a rule, a severity of the one scale and words. */
export function validateRun(r) {
  const errors = [];
  if (!r || typeof r !== 'object') return { ok: false, errors: ['not an object'] };
  if (r.kind !== RUN_KIND) errors.push(`kind is ${r.kind}, not ${RUN_KIND}`);
  if (r.v !== RUN_V) errors.push(`v is ${r.v}, this build reads ${RUN_V}`);
  if (!r.tool || typeof r.tool !== 'string') errors.push('no tool name');
  for (const k of ['build', 'device', 'scope', 'health']) if (!r[k] || typeof r[k] !== 'object' || Array.isArray(r[k])) errors.push(`${k} is not an object`);
  for (const k of ['notes', 'missing']) if (!Array.isArray(r[k])) errors.push(`${k} is not a list`);
  if (!Array.isArray(r.findings)) errors.push('findings is not a list');
  else r.findings.forEach((f, i) => {
    if (!f || typeof f.rule !== 'string' || !f.rule) errors.push(`finding ${i + 1} has no rule`);
    else if (!SEVS.includes(f.sev)) errors.push(`finding ${i + 1} (${f.rule}) has severity ${f.sev}`);
    if (f && typeof f.what !== 'string') errors.push(`finding ${i + 1} has no words`);
  });
  return { ok: !errors.length, errors };
}

const when = (iso) => String(iso || '').replace('T', ' ').replace(/:\d\d\.\d+Z$/, ' UTC');
const kv = (o) => Object.entries(o || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k} ${v}`).join(', ');

/** One finding as a line. */
export const findingLine = (f) => `[${f.sev}] ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}.${f.why ? ` Why: ${f.why}.` : ''}${f.owner ? ` Owner: ${f.owner}.` : ''}${f.at ? ` At ${f.at}.` : ''}${f.scope ? ` (${kv(f.scope)})` : ''}`;

export const counts = (findings) => Object.fromEntries(SEVS.map((s) => [s, findings.filter((f) => f.sev === s).length]));

/** Just the JSON block (a tool that keeps its own text adds this beneath it). */
export const runBlock = (run) => `${BEGIN}\n${JSON.stringify(run)}\n${END}`;

/** The report as text, with the JSON block at the end when `json`. */
export function renderRun(r, { json = true } = {}) {
  const c = counts(r.findings), L = [];
  L.push(`PPS RUN REPORT v${r.v} · ${r.tool}${r.started ? ` · ${when(r.started)}` : ''}${r.ms != null ? ` · ${r.ms >= 10000 ? `${Math.round(r.ms / 1000)} s` : `${r.ms} ms`}` : ''}`);
  if (Object.keys(r.build).length) L.push(`Build: ${[r.build.badge || r.build.release, r.build.commit].filter(Boolean).join(' · ') || kv(r.build)}`);
  if (Object.keys(r.device).length) L.push(`Device: ${kv(r.device)}`);
  if (Object.keys(r.scope).length) L.push(`Scope: ${kv(r.scope)}`);
  if (Object.keys(r.health).length) L.push(`Health: ${kv(r.health)}`);
  L.push('');
  const n = r.total ?? r.findings.length;
  L.push(n ? `FINDINGS (${n}: ${c.fail} fail, ${c.warn} warn, ${c.note} note)` : 'FINDINGS (none)');
  r.findings.forEach((f, i) => L.push(`${i + 1}. ${findingLine(f)}`));
  for (const x of r.notes) L.push(`Note: ${x}`);
  if (r.missing.length) L.push('', `NOT IN THIS REPORT: ${r.missing.join('; ')}.`);
  if (json) L.push('', runBlock(r));
  return L.join('\n');
}

// ── reading a paste back ──

/** A bug packet as a Run report (tool 'packet'): its findings, build, device, health and what it lacked. */
export function fromPacket(p) {
  return buildRun({ tool: 'packet', build: p.build, device: p.device, scope: p.link ? { link: p.link } : {}, started: p.at, findings: p.findings || [], health: p.health, notes: p.note ? [`What was seen: ${p.note}`] : [], missing: p.missing || [] });
}
/** A replay result as a Run report (tool 'replay'): the findings that fail on the replayed state and in the recorded motion now. */
export function fromReplay(x) {
  return buildRun({ tool: 'replay', build: { commit: x.commit }, device: { env: x.env }, scope: { packet: x.packet }, findings: [...(x.now?.state || []), ...(x.now?.motion || [])], notes: [`verdict ${x.verdict}`, ...(x.notes || [])] });
}

/** Reads what was pasted: a run block, a packet block, a replay result's JSON, or a JSON run on its own. Tolerates chat fences and wrapped lines; refuses a block that changed on the way. */
export function parseReport(text) {
  const s = String(text ?? '');
  const a = s.indexOf(BEGIN), z = s.indexOf(END);
  if (a >= 0 && z > a) {
    const body = s.slice(a + BEGIN.length, z).replace(/```(json)?/g, '').replace(/[\r\n]+/g, '').trim();
    let r;
    try { r = JSON.parse(body); } catch (e) { return { ok: false, why: `the report's JSON could not be read (${e.message}); copy it again from the app` }; }
    if (r?.kind !== RUN_KIND) return { ok: false, why: 'this JSON is not a run report' };
    if (r.v !== RUN_V) return { ok: false, why: `report version ${r.v}, this build reads ${RUN_V}` };
    if (!sumOk(r)) return { ok: false, why: 'the report changed on its way (its check sum does not match): copy it again, whole' };
    return { ok: true, run: r, from: 'run' };
  }
  const t = s.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      if (j?.kind === RUN_KIND) return sumOk(j) ? { ok: true, run: j, from: 'run' } : { ok: false, why: 'the report changed on its way (its check sum does not match)' };
      if (j?.kind === 'pps-replay') return { ok: true, run: fromReplay(j), from: 'replay' };
      if (j?.kind === 'pps-bug-packet') return { ok: true, run: fromPacket(j), from: 'packet' };
    } catch { /* (a packet block with wrapped lines is read below) */ }
  }
  const p = parsePacket(s);
  if (p.ok) return { ok: true, run: fromPacket(p.packet), from: 'packet' };
  return { ok: false, why: 'no report found: the text has no REPORT JSON block and no PACKET JSON block' };
}

/** What changed between two runs (any tools): by finding identity (rule and words), as compareFindings does for packets. verdict: fixed | partly | not-fixed | regressed | unchanged. */
export function compareRuns(a, b) {
  const c = compareFindings(a.findings, b.findings);
  let verdict;
  if (!a.findings.length) verdict = c.introduced.length ? 'regressed' : 'unchanged';
  else if (!c.still.length) verdict = c.introduced.length ? 'regressed' : 'fixed';
  else verdict = c.fixed.length ? 'partly' : 'not-fixed';
  const L = [`${verdict.toUpperCase()}: ${a.tool}${a.started ? ` ${when(a.started)}` : ''} -> ${b.tool}${b.started ? ` ${when(b.started)}` : ''}`];
  if (a.tool !== b.tool) L.push(`(two different tools: only findings that name the same rule and the same words are matched)`);
  for (const f of c.fixed) L.push(`fixed: ${f.rule}: ${f.what}`);
  for (const f of c.still) L.push(`still: ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}${f.changed ? ` (was: ${f.changed.was || 'no place given'})` : ''}`);
  for (const f of c.introduced) L.push(`NEW: ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}`);
  return { verdict, ...c, lines: L };
}

export { finding, normalize, key };
