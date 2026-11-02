// The device report (recs.md 2.10, Mohammad, 2 Nov 2026: "a one-tap copy report of the last 60 s, so the owner's devices become the
// test bench"). One tap in Settings starts a minute of recording while the app is used as usual; then a card offers the report to copy
// or to send by email. It holds the frames (intervals and script time against the 120 Hz target), every overrun with the surfaces that
// ran in it, the tier changes, what the scheduler carried (shedStats().byTag) and ran past its wait (mayStats().aged), and the layout
// reads by phase (layoutReads().afterWrites). The last three must read zero on a phone: the report says so line by line.
// Nothing is recorded until the tap, and nothing is kept after the card is closed: the frame watcher and the read counts are on only for
// the minute (frame.js watchFrames: nothing is timed while nobody watches).
import { watchFrames, shedStats, mayStats, targetHz, frameBudget } from './frame.js?v=897b4f8e7e';
import { createFrameRecorder, summarize, longFrameLine } from './frame-stats.js?v=5cd07c7e9b';
import { tierLog } from './adapt-tier.js?v=d916b4b4b7';
import { countReads, layoutReads } from './layout-snap.js?v=49ac75f2f5';

export const REPORT_S = 60;
const OVERRUN_LINES = 24;

// What the scheduler counted since `from` (a copy taken as the minute began): per surface, the frames each was carried.
function delta(now, from) {
  const out = {};
  for (const [k, v] of Object.entries(now)) { const d = v - (from[k] || 0); if (d > 0) out[k] = d; }
  return out;
}
const fmt = (s) => (s.n ? `p50 ${s.p50.toFixed(1)}, p95 ${s.p95.toFixed(1)}, p99 ${s.p99.toFixed(1)}, max ${s.max.toFixed(1)} ms` : 'none');

/**
 * The report's text from what a minute recorded (pure: the unit tests feed it numbers).
 * rec: { gaps, scripts, overruns: [{ at, gap, script, top: [[tag, phase, ms]], phases, outside }] }, t0, seconds, shed, aged, tiers, reads, header
 */
export function reportText({ gaps, scripts, overruns, t0 = 0, seconds = REPORT_S, shed = {}, aged = 0, tiers = [], reads = null, header = [], hz = 120 }) {
  const frame = 1000 / hz, g = summarize(gaps), s = summarize(scripts);
  const over15 = gaps.filter((x) => x > 1.5 * frame).length, over2 = gaps.filter((x) => x > 2 * frame).length;
  const shedN = Object.values(shed).reduce((a, b) => a + b, 0), after = reads ? reads.afterWrites : null;
  const ok = (cond) => (cond ? 'zero: passes' : 'NOT zero: fails');
  const L = [
    'Device report', ...header,
    `Recorded ${seconds} s, target ${hz} Hz (${frame.toFixed(2)} ms a frame)`,
    '',
    `Frames: ${gaps.length} intervals; ${fmt(g)}`,
    `Missed: ${over15} over 1.5 × the frame, ${over2} over 2 ×`,
    `Script per frame: ${fmt(s)} (budget 3.5 ms)`,
    '',
    `Carried by the scheduler (shedStats().byTag): ${shedN ? Object.entries(shed).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}: ${ok(!shedN)}`,
    `Run past their wait (mayStats().aged): ${aged}: ${ok(!aged)}`,
    reads ? `Layout reads after writes (layoutReads().afterWrites): ${after}: ${ok(!after)} (in the read phase ${reads.read}, from events and timers ${reads.task}, early ${reads.early}, late ${reads.late}, final ${reads.final})` : 'Layout reads: not counted',
    '',
    `Tier changes: ${tiers.length ? tiers.map((t) => `${((t.at - t0) / 1000).toFixed(1)} s ${t.from}→${t.to}${t.why ? ` (${t.why})` : ''}`).join('; ') : 'none'}`,
    '',
    `Overruns (over 2 × the frame), slowest ${OVERRUN_LINES}, with what ran in them:`,
    ...(overruns.length ? overruns.slice().sort((a, b) => (b.gap || b.script) - (a.gap || a.script)).slice(0, OVERRUN_LINES).sort((a, b) => a.at - b.at).map((f) => longFrameLine(f, t0)) : ['  none']),
  ];
  return L.join('\n');
}

/**
 * Records for `seconds` and hands the report's text to done(text). Returns a stop function (ends it early, with what it has).
 * header: lines put at the top (the build, the device, the screen).
 */
export function recordDeviceReport({ seconds = REPORT_S, header = [], done = () => {} } = {}) {
  const hz = targetHz();
  const rec = createFrameRecorder({ longMs: 2 * frameBudget(), keepLong: 400 });
  const shed0 = { ...shedStats().byTag }, aged0 = mayStats().aged, t0 = performance.now();
  countReads(true);
  const unwatch = watchFrames(rec.add);
  let over = false;
  const finish = () => {
    if (over) return;
    over = true; clearTimeout(timer); unwatch();
    const reads = layoutReads();
    countReads(false);
    const raw = rec.raw();
    done(reportText({
      gaps: raw.gaps, scripts: raw.scripts, overruns: rec.long.slice(), t0, seconds: Math.round((performance.now() - t0) / 1000), hz,
      shed: delta(shedStats().byTag, shed0), aged: mayStats().aged - aged0, tiers: tierLog().filter((t) => t.at >= t0), reads, header,
    }));
  };
  const timer = setTimeout(finish, seconds * 1000);
  return finish;
}
