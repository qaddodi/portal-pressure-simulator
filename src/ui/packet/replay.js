// Replaying a bug packet (plan section 3, "The agent inspects and fixes"): put the app back in the packet's state, take the screen report, run the rules, and
// say what is the same. The page, Node and the layout-only headless run differ only in the `env` they hand in, so one function decides the verdict everywhere.
//
//   replayPacket(packet, env)        -> a replay result (kind 'pps-replay')
//   comparePackets(before, after)    -> what a fix changed: findings fixed / still / introduced, and the report's differences
//   resultLines(result)              -> the lines a person or an agent reads
//
// env:
//   name                             'node' | 'headless' | 'page' (said in the result)
//   apply(state)                     puts the state on the app; resolves { skipped: [names] } (what it could not apply)
//   settle()                         resolves when nothing is arriving
//   screen()                         the screen report (JSON) or null when this build has none
//   rules(report)                    optional: the rules' findings over a report (default: report.findings, which pps.screen() and buildScreen() already carry)
//   judgeHistory(history)            optional: the motion rules over a recorded history (the recorder thread's pure judge), or null
//   commit                           optional: the build the env runs, to say whether it is the packet's own

import { findingKey, splitFindings } from './packet.js';
import { diffScreens, diffLines, compareFindings, VOLATILE } from './diff.js';

export const REPLAY_V = 1;

export async function replayPacket(packet, env, { ignore = VOLATILE } = {}) {
  const res = { kind: 'pps-replay', v: REPLAY_V, packet: packet?.id || null, env: env.name, commit: env.commit || null, packetCommit: packet?.build?.commit || null, verdict: '', applied: { skipped: [] }, screen: null, then: { state: [], motion: [] }, now: { state: [], motion: null }, compare: null, motion: null, screenDiff: [], notes: [] };
  if (!packet?.state) { res.verdict = 'unreadable'; res.notes.push('the packet carries no state to rebuild'); return res; }
  const was = splitFindings(packet.findings);
  res.then = was;
  const ap = await env.apply(packet.state);
  res.applied.skipped = ap?.skipped || [];
  await env.settle();
  const report = await env.screen();
  if (!report) { res.verdict = 'no-screen'; res.notes.push(`${env.name} cannot report the screen (no pps.screen in this build or this place)`); }
  else res.screen = report;
  const rules = report ? await (env.rules ? env.rules(report) : report.findings ?? null) : null;
  if (report && !rules) res.notes.push('this build has no rules registry: the report was taken, nothing was judged');
  res.now.state = splitFindings(rules || []).state;
  if (packet.history && env.judgeHistory) {
    const j = await env.judgeHistory(packet.history);
    if (j) { res.now.motion = splitFindings(j).motion; res.motion = compareFindings(was.motion, res.now.motion); }
  }
  res.compare = compareFindings(was.state, res.now.state);
  const packetReport = packet.screen?.json;
  if (report && packetReport) res.screenDiff = diffScreens(packetReport, report, { ignore });
  else if (report) res.notes.push('the packet has no screen JSON (cut for size or an older build): the replay cannot be compared with what you saw');
  if (env.commit && res.packetCommit && env.commit !== res.packetCommit) res.notes.push(`this tree is ${env.commit}, the packet was made on ${res.packetCommit}: a difference may be a change since`);
  if (res.applied.skipped.length) res.notes.push(`not applied: ${res.applied.skipped.join('; ')}`);
  if (!res.verdict) res.verdict = verdictOf(was, res);
  return res;
}

function verdictOf(was, res) {
  if (!was.state.length && !was.motion.length) return 'no-rule';
  if (!was.state.length) return 'motion-only';
  const { still, fixed } = res.compare;
  if (!fixed.length && still.length) return 'reproduced';
  if (still.length && fixed.length) return 'partly';
  return 'gone';
}

/** What each verdict means and what to do next, in the words the agent guide uses (docs/bug-packet.md). */
export const VERDICT_WORDS = {
  reproduced: 'REPRODUCED: the same rule fails on the same state here. Fix it, replay again, and expect "gone".',
  partly: 'PARTLY: some findings still fail, others are gone. Look at what is still there.',
  gone: 'GONE: no finding of the packet fails on this state. On an unfixed tree this means the bug is not in what a replay can see (device-only: Safari, a real GPU, memory, timing): fix from the code, then ask for the button again on the device and run compare. After your fix it is the proof.',
  'no-rule': 'NO RULE: no self-check named this bug. First add the rule that would have caught it (src/ui/selfcheck/rules.js, with a test that fires and one that must not), then replay.',
  'motion-only': 'MOTION ONLY: the packet holds findings about the last seconds, which a static replay cannot repeat. The recorded motion was judged again below; to prove a fix, repeat the move on a device with ?watch and press the button again, then run compare.',
  'no-screen': 'NO SCREEN REPORT: this place cannot describe the screen. Try the layout-only headless run (scripts/packet-headless.mjs).',
  unreadable: 'UNREADABLE: the packet has no state.',
};

export function resultLines(r) {
  const L = [];
  L.push(`${VERDICT_WORDS[r.verdict] || r.verdict}`);
  L.push(`Replayed in ${r.env}${r.commit ? ` at ${r.commit}` : ''}; packet ${r.packet || '?'}${r.packetCommit ? ` made at ${r.packetCommit}` : ''}.`);
  if (r.compare) {
    for (const f of r.compare.still) L.push(`still: ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}${f.changed ? ` (was: ${f.changed.was || 'no place given'})` : ''}${f.owner ? ` [${f.owner}]` : ''}`);
    for (const f of r.compare.fixed) L.push(`gone: ${f.rule}: ${f.what}`);
    for (const f of r.compare.introduced) L.push(`NEW: ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}${f.owner ? ` [${f.owner}]` : ''}`);
  }
  if (r.motion) {
    L.push(`Recorded motion judged again by today's rules: ${r.motion.still.length} still flagged, ${r.motion.fixed.length} no longer flagged, ${r.motion.introduced.length} new.`);
  }
  if (r.screenDiff?.length) { L.push(`Screen differs from the packet's in ${r.screenDiff.length} place${r.screenDiff.length === 1 ? '' : 's'}${r.screenDiff.length >= 60 ? ' (first 60)' : ''}:`); for (const s of diffLines(r.screenDiff).slice(0, 12)) L.push(`  ${s}`); if (r.screenDiff.length > 12) L.push(`  ... ${r.screenDiff.length - 12} more (in the JSON)`); }
  else if (r.screen && r.notes.every((n) => !/no screen JSON/.test(n))) L.push('Screen matches the packet.');
  for (const n of r.notes) L.push(`Note: ${n}`);
  return L;
}

/** Normalises a packet or a replay result to { findings (state), screen, label }. */
function sideOf(x) {
  if (x?.kind === 'pps-bug-packet') return { findings: splitFindings(x.findings).state, screen: x.screen?.json || null, label: `packet ${x.id}` };
  if (x?.kind === 'pps-replay') return { findings: x.now?.state || [], screen: x.screen || null, label: `replay in ${x.env}` };
  throw new Error('compare takes a bug packet or a replay result');
}

/** What a fix changed: `before` and `after` are packets or replay results. verdict: 'fixed' | 'partly' | 'not-fixed' | 'regressed' | 'unchanged' (nothing failed before). */
export function comparePackets(before, after, { ignore = VOLATILE } = {}) {
  const a = sideOf(before), b = sideOf(after);
  const c = compareFindings(a.findings, b.findings);
  const screenDiff = a.screen && b.screen ? diffScreens(a.screen, b.screen, { ignore }) : [];
  let verdict;
  if (!a.findings.length) verdict = c.introduced.length ? 'regressed' : 'unchanged';
  else if (!c.still.length) verdict = c.introduced.length ? 'regressed' : 'fixed';
  else verdict = c.fixed.length ? 'partly' : 'not-fixed';
  const L = [`${verdict.toUpperCase()}: ${a.label} -> ${b.label}`];
  for (const f of c.fixed) L.push(`fixed: ${f.rule}: ${f.what}`);
  for (const f of c.still) L.push(`still: ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}${f.changed ? ` (was: ${f.changed.was})` : ''}`);
  for (const f of c.introduced) L.push(`NEW: ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}`);
  if (a.screen && b.screen) { L.push(screenDiff.length ? `Screen changed in ${screenDiff.length} place(s); list them in the push message and check each is intended:` : 'Screen unchanged.'); for (const s of diffLines(screenDiff).slice(0, 15)) L.push(`  ${s}`); }
  return { verdict, ...c, screenDiff, lines: L, keys: c.fixed.map(findingKey) };
}
