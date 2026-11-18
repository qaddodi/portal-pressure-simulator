// The test made from a bug packet (plan section 3, step 4): "a unit test built from the packet (state plus rule), so the bug cannot return unnoticed".
// A fixture is a small JSON file in tests/packets/: the packet's state, the findings that must not appear on it, and optionally values the screen report must hold.
// tests/packets.test.js replays every fixture in Node and fails when one of those findings is back.
//
//   makeFixture(packet, { name, rules, expect, note })   -> fixture (what `node scripts/packet.mjs test` writes)
//   runFixture(fixture, env)                              -> { ok, failures: [string], findings }   (env as replay.js's)
//   getPath(report, 'labels[Splenic vein].alpha')        a value of a report by the same paths the diff prints

import { findingKey, hash32, splitFindings } from './packet.js';

export const FIXTURE_V = 1;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const nameOf = (v) => (isObj(v) ? v.id ?? v.name ?? v.key ?? v.text : undefined);

/** A file-name-safe name for a fixture: the rule, what it is about, and the packet's short id. */
export function fixtureName(packet, f) {
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
  return [slug(f?.rule || 'bug'), slug(f?.what || ''), String(packet.id || hash32(JSON.stringify(packet.state))).slice(0, 6)].filter(Boolean).join('-');
}

/** The value at a path of a report: `a.b`, `list[name].field`, `list[2]`. undefined when something on the way is missing. */
export function getPath(report, path) {
  let cur = report;
  for (const m of String(path).matchAll(/([^.[\]]+)|\[([^\]]*)\]/g)) {
    if (cur == null) return undefined;
    if (m[1] !== undefined) cur = cur[m[1]];
    else if (Array.isArray(cur)) { const k = m[2]; cur = /^\d+$/.test(k) ? cur[+k] : cur.find((v) => String(nameOf(v)) === k); } else return undefined;
  }
  return cur;
}

/**
 * rules: which of the packet's findings the test holds clean: rule ids, or "rule|what" keys; default all of its state findings.
 * expect: [{ path, equals | near, tol }] checked on the screen report after the replay (values the fix must produce, for example a label's alpha 0.65).
 */
export function makeFixture(packet, { name, rules, expect = [], note = '' } = {}) {
  if (!packet?.state) throw new Error('the packet carries no state to rebuild');
  const { state: states } = splitFindings(packet.findings);
  const pick = rules?.length ? states.filter((f) => rules.includes(f.rule) || rules.includes(findingKey(f))) : states;
  if (!pick.length && !expect.length) throw new Error(states.length ? `none of the packet's findings match ${JSON.stringify(rules)}` : 'the packet has no state findings to hold clean: add the rule that would have caught it first, or pass --expect path=value');
  const hold = pick.map((f) => ({ rule: f.rule, what: f.what }));
  return {
    kind: 'pps-packet-test', v: FIXTURE_V, name: name || fixtureName(packet, pick[0]), from: packet.id || null, madeAt: packet.build?.commit || null,
    note: note || packet.note || '', was: pick.map((f) => ({ rule: f.rule, what: f.what, where: f.where, owner: f.owner })), hold, expect, state: packet.state,
  };
}

/** Replays the fixture's state and judges it. env: replay.js's (apply, settle, screen, rules). */
export async function runFixture(fx, env) {
  const failures = [];
  const ap = await env.apply(fx.state);
  await env.settle();
  const report = await env.screen();
  if (!report) return { ok: false, failures: [`${env.name}: no screen report, so nothing was judged`], findings: [] };
  const found = splitFindings((await env.rules(report)) || []).state;
  const keys = new Set(found.map(findingKey));
  for (const h of fx.hold || []) if (keys.has(findingKey(h))) { const f = found.find((x) => findingKey(x) === findingKey(h)); failures.push(`${h.rule}: ${h.what}${f.where ? `, ${f.where}` : ''}${f.owner ? ` [${f.owner}]` : ''}: the bug of packet ${fx.from || fx.name} is back`); }
  for (const e of fx.expect || []) {
    const v = getPath(report, e.path);
    const ok = 'equals' in e ? JSON.stringify(v) === JSON.stringify(e.equals) : typeof v === 'number' && Math.abs(v - e.near) <= (e.tol ?? 0.01);
    if (!ok) failures.push(`${e.path}: expected ${'equals' in e ? JSON.stringify(e.equals) : `${e.near} ± ${e.tol ?? 0.01}`}, the screen has ${JSON.stringify(v)}`);
  }
  if (ap?.skipped?.length && !failures.length) { /* (a state part that could not be applied here is a note, not a failure) */ }
  return { ok: !failures.length, failures, findings: found };
}
