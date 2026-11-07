// What the frame-time and input-latency gate (scripts/frame-gate.mjs) decides and prints, apart from the browser: the limits, the
// verdict on one scenario, the lines of the report, the GitHub annotations and the exit code. Separate so a unit test runs it.
import { readFileSync } from 'node:fs';
import { summarize, topSurfaces } from '../src/ui/frame-stats.js';

/** A scenario with fewer frames than this is not judged: too few to say what p95 is. */
export const MIN_FRAMES = 8;
const LEVELS = ['fail', 'target'];
const KEYS = ['p95', 'max', 'input'];
/** The idle scenario's name (frame-gate.mjs). */
export const IDLE = 'idle (Play)';

/** The limits file: { laptop: { target: { p95, max, input }, fail: { ... }, scenarios?: { name: { p95?, max?, input? } } }, phone: ... }. Throws on a malformed one. */
export function loadLimits(file = new URL('./perf-limits.json', import.meta.url)) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  for (const profile of ['laptop', 'phone']) {
    for (const level of LEVELS) for (const k of KEYS) {
      const v = j[profile]?.[level]?.[k];
      if (!(v > 0)) throw new Error(`perf-limits.json: ${profile}.${level}.${k} must be a positive number`);
    }
    for (const k of KEYS) if (j[profile].fail[k] < j[profile].target[k]) throw new Error(`perf-limits.json: ${profile}.fail.${k} is below its target`);
    for (const [name, own] of Object.entries(j[profile].scenarios || {})) for (const [k, v] of Object.entries(own)) {
      if (!KEYS.includes(k) || !(v >= j[profile].target[k])) throw new Error(`perf-limits.json: ${profile}.scenarios["${name}"].${k} must be one of ${KEYS.join(', ')} and not below its target`);
    }
  }
  return j;
}

/** A profile's limits for one scenario: the profile's ceilings, with the ones that scenario has of its own (set from what the runners
 *  measured for it) in their place. */
export function limitsFor(limits, scenario) {
  return { target: limits.target, fail: { ...limits.fail, ...(limits.scenarios?.[scenario] || {}) } };
}

/**
 * The verdict on one frame scenario. `sum` is frame-stats.js summarizeRaw of its recording; `limits` the profile's
 * { target, fail }. The scheduler's script time per frame is always judged (the app's own cost, the same on any machine); the
 * interval between frames only with `gpu` (a software renderer, as CI's runners have, sets the pace there, not the app).
 * Each breach is { metric, value, limit, target, level }: level 'fail' past the ceiling, else 'target' past the recs' bar.
 */
export function judgeFrames(sum, limits, { gpu = false } = {}) {
  if (!sum || sum.frames < MIN_FRAMES) return [];
  const out = [];
  const check = (metric, value, key) => {
    for (const level of LEVELS) if (value > limits[level][key]) { out.push({ metric, value, limit: limits[level][key], ceiling: limits.fail[key], target: limits.target[key], level }); return; }
  };
  check('script p95', sum.script.p95, 'p95');
  check('script max', sum.script.max, 'max');
  if (gpu && sum.gap.n >= MIN_FRAMES) { check('interval p95', sum.gap.p95, 'p95'); check('interval max', sum.gap.max, 'max'); }
  return out;
}

/** The verdict on one input action: its slowest answer against the input limits. [] or one breach. */
export function judgeInput(samples, limits) {
  if (!samples.length) return [];
  const worst = Math.max(...samples.map((s) => s.ms));
  for (const level of LEVELS) if (worst > limits[level].input) return [{ metric: 'input to first change', value: worst, limit: limits[level].input, ceiling: limits.fail.input, target: limits.target.input, level }];
  return [];
}

const ms = (v) => v.toFixed(1);
/** A scenario's report lines. */
export function frameLines(r, { gpu = false } = {}) {
  const s = r.sum;
  const head = `  ${r.name.padEnd(20)} ${String(s.frames).padStart(4)} frames   script p50 ${ms(s.script.p50)} p95 ${ms(s.script.p95)} max ${ms(s.script.max)}   interval p50 ${ms(s.gap.p50)} p95 ${ms(s.gap.p95)} max ${ms(s.gap.max)}${gpu ? '' : ' (not judged: software renderer)'}`;
  const top = topSurfaces(s.surfaces, 6).map(([k, v]) => `${k} p95 ${ms(v.p95)} max ${ms(v.max)}`).join(' · ');
  const lines = [head];
  if (top) lines.push(`${' '.repeat(23)}by surface: ${top}`);
  if (s.frames < MIN_FRAMES) lines.push(`${' '.repeat(23)}too few frames to judge (${s.frames})`);
  for (const note of r.notes || []) lines.push(`${' '.repeat(23)}${note}`);
  for (const b of r.breaches) lines.push(`${' '.repeat(23)}${breachLine(b)}`);
  return lines;
}
/**
 * What a model left running and a view left alone costs, surface by surface (the idle scenario; laptop heat, 31 Oct): for each surface the
 * scheduler ran, how many frames of the recording it ran in, its script time in those (mean and p95), and what it adds up to in
 * a second of wall time, most expensive first. `raw` is the recording (frame-stats.js raw()); `top` how many surfaces to list.
 */
export function idleLines(raw, top = 12) {
  const gaps = raw.gaps || [], frames = raw.frames || 0;
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0, wall = (frames * mean) / 1000;
  const rows = Object.entries(raw.byTag || {}).map(([tag, v]) => ({ tag, ...summarize(v), total: v.reduce((a, b) => a + b, 0) }));
  rows.sort((a, b) => b.total - a.total);
  const lines = [`${' '.repeat(23)}per surface over ${wall.toFixed(1)} s (${frames} frames): frames it ran in · mean ms · p95 ms · ms of script per second`];
  if (!wall || !rows.length) { lines.push(`${' '.repeat(23)}no surface ran`); return lines; }
  for (const r of rows.slice(0, top)) lines.push(`${' '.repeat(25)}${r.tag.padEnd(18)} ${String(r.n).padStart(5)}  ${r.mean.toFixed(2).padStart(6)}  ${r.p95.toFixed(2).padStart(6)}  ${(r.total / wall).toFixed(1).padStart(7)}`);
  const all = rows.reduce((a, r) => a + r.total, 0);
  lines.push(`${' '.repeat(25)}${'all surfaces'.padEnd(18)} ${' '.repeat(5)}  ${' '.repeat(6)}  ${' '.repeat(6)}  ${(all / wall).toFixed(1).padStart(7)}`);
  return lines;
}
/** An input action's report lines. */
export function inputLines(r) {
  const v = r.samples.map((s) => s.ms), sum = summarize(v);
  const lines = [`  ${r.name.padEnd(20)} ${String(v.length).padStart(4)} samples  p50 ${sum.p50.toFixed(0)} ms  worst ${sum.max.toFixed(0)} ms${r.gated ? '' : '  (reported, not judged)'}`];
  lines.push(`${' '.repeat(23)}${r.samples.map((s) => `${s.ms.toFixed(0)}`).join(' ')} ms (${[...new Set(r.samples.map((s) => s.what))].join(', ')})`);
  for (const b of r.breaches) lines.push(`${' '.repeat(23)}${breachLine(b)}`);
  return lines;
}
export function breachLine(b) {
  return b.level === 'fail'
    ? `OVER THE LIMIT: ${b.metric} ${ms(b.value)} ms is past the ${b.limit} ms limit (the bar is ${b.target} ms)`
    : `over the bar: ${b.metric} ${ms(b.value)} ms is past ${b.target} ms (the limit is ${b.ceiling ?? b.limit} ms)`;
}

/** Every breach of a profile's results, with the scenario each came from. */
export function allBreaches(profile) {
  return [...profile.frames, ...profile.inputs].flatMap((r) => r.breaches.map((b) => ({ ...b, scenario: r.name, profile: profile.name })));
}

/** A GitHub Actions annotation for a breach: an error in block mode, a warning otherwise; none for a miss of the bar alone. */
export function annotation(b, mode) {
  if (b.level !== 'fail') return null;
  const kind = mode === 'block' ? 'error' : 'warning';
  return `::${kind} title=Frame time and input latency (${b.profile})::${b.scenario}: ${b.metric} ${ms(b.value)} ms is past the ${b.limit} ms limit (the bar is ${b.target} ms)`;
}

/** 1 when a pull request must be blocked: block mode and a breach past the ceiling, or nothing at all could be measured. */
export function exitCode(mode, profiles) {
  if (mode !== 'block') return 0;
  const measured = profiles.some((p) => p.frames.length + p.inputs.length > 0);
  return !measured || profiles.some((p) => allBreaches(p).some((b) => b.level === 'fail')) ? 1 : 0;
}

/** The run as a Markdown table for the job summary. */
export function summaryMarkdown(profiles) {
  const out = ['## Frame time and input latency', ''];
  for (const p of profiles) {
    out.push(`### ${p.name} (CPU ${p.cpu}×, ${p.renderer} renderer)`, '', '| Scenario | Frames | Script p95 | Script max | Interval p95 | Verdict |', '|---|---|---|---|---|---|');
    for (const r of p.frames) out.push(`| ${r.name} | ${r.sum.frames} | ${ms(r.sum.script.p95)} | ${ms(r.sum.script.max)} | ${ms(r.sum.gap.p95)} | ${verdict(r.breaches)} |`);
    // (The idle scenario also lists what each surface cost: the model running and nobody touching the view.)
    for (const r of p.frames) if (r.name === IDLE && r.raw) out.push('', `${r.name}, by surface:`, '', '```', ...idleLines(r.raw).map((l) => l.trim()), '```');
    out.push('', '| Input | Samples | p50 | Worst | Verdict |', '|---|---|---|---|---|');
    for (const r of p.inputs) { const s = summarize(r.samples.map((x) => x.ms)); out.push(`| ${r.name} | ${s.n} | ${s.p50.toFixed(0)} | ${s.max.toFixed(0)} | ${r.gated ? verdict(r.breaches) : 'reported'} |`); }
    if (p.skipped.length) out.push('', `Not measured: ${p.skipped.map((s) => `${s.name} (${s.why})`).join('; ')}`);
    out.push('');
  }
  return out.join('\n');
}
const verdict = (b) => (b.some((x) => x.level === 'fail') ? 'OVER THE LIMIT' : b.length ? 'over the bar' : 'ok');

/**
 * What the run ends with: the lines to print (an annotation for each scenario that could not be measured and for each measure past
 * its ceiling, then the count), the exit code and the job summary's Markdown.
 */
export function verdictOf(results, mode) {
  const lines = [];
  for (const p of results) for (const s of p.skipped) lines.push(`::warning title=Frame time and input latency (${p.name})::${s.name} was not measured: ${s.why}`);
  const all = results.flatMap(allBreaches);
  for (const b of all) { const a = annotation(b, mode); if (a) lines.push(a); }
  const failing = all.filter((b) => b.level === 'fail'), missed = all.filter((b) => b.level === 'target');
  lines.push(failing.length ? `${failing.length} past a ceiling, ${missed.length} over the bar only` : `none past a ceiling; ${missed.length} over the bar`);
  const code = exitCode(mode, results);
  if (code) lines.push(results.some((p) => p.frames.length + p.inputs.length) ? 'blocking: a measure is past its ceiling (scripts/perf-limits.json)' : 'blocking: nothing could be measured');
  return { lines, code, markdown: summaryMarkdown(results) };
}
