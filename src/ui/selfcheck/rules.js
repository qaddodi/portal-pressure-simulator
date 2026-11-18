// The self-check rules registry (plan screen-report-recs section 2): named rules, each a pure judge over ONE screen report (kind 'state') or over the
// recorder's last few seconds of frames (kind 'series'). A rule names what is wrong, where, why it matters and which file owns it, so an agent starts
// from "rule X failed at Y, owned by file Z" and not from a guess. No DOM and no import of the page here: a unit test loads this in node.
//
//   registerRule({ id, owner, why, kind?, check(input, ctx) })
//     id      lower-case words joined by dashes ('label-under-card'); unique (a second registration is ignored and counted in clashes())
//     owner   the file that owns the behaviour the rule guards ('src/ui/label-gl.js'), shown in every finding
//     why     one line: the standing rule or the reason ('Labels must stay clear of cards (17 Nov)')
//     kind    'state' (default): input is a screen report (pps.screen()); 'series': input is the recorder's frames, oldest first
//     check   returns an array of findings, or nothing. A finding is { what, where, at?, ...extra }: `what` names the thing ('Label "Splenic vein"'),
//             `where` says where and how bad ('under the Doppler card, 40% covered'), `at` a time ('12.4 s'). The registry adds rule, why and owner.
//             (`judge` is accepted as another name for `check`.)
//     ctx     { env }: the options pps.screen / runRules was called with, and { report } for a series rule when a report is at hand.
//
//   runRules(input, { history, only, skip, kinds })  ->  [{ rule, what, where, why, owner, at, ... }]
//     input: a screen report, run through the 'state' rules; history: the recorder's frames, run through the 'series' rules (either may be absent).
//     only / skip: a rule id or a list of ids; kinds: ['state'] or ['series'] to run just those. A rule that throws does not stop the others: it
//     becomes one finding with rule 'rule-error' (so a broken rule is seen, never silently lost).
//   RULES      the list of { id, owner, why, kind }, live (the same array registerRule adds to)
//   ruleList() / ruleIds() / clashes() / rulesOwning(file)
//
// Every rule ships with a unit test with a case that must not fire (tests/helpers/selfcheck.js: fires(), quiet()). A rule that fires wrongly wastes as much agent
// time as no rule. Modules register themselves when imported; selfcheck/plugins.js lists them (one import line each).

const rules = new Map(), clash = [];
/** { id, owner, why, kind } of every rule, in the order registered. Live. */
export const RULES = [];

/** Adds a rule. Returns true when added, false when the id was already taken. */
export function registerRule(o) {
  if (!o || typeof o !== 'object') throw new TypeError('rule: an object is needed');
  if (typeof o.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(o.id)) throw new TypeError(`rule: id must be lower-case words joined by dashes (${String(o.id)})`);
  const check = o.check || o.judge;
  if (typeof check !== 'function') throw new TypeError(`rule ${o.id}: check(input, ctx) is needed`);
  if (typeof o.owner !== 'string' || !o.owner) throw new TypeError(`rule ${o.id}: owner (the file that owns the behaviour) is needed`);
  if (typeof o.why !== 'string' || !o.why) throw new TypeError(`rule ${o.id}: why (one line) is needed`);
  const kind = o.kind || o.scope || 'state';
  if (kind !== 'state' && kind !== 'series') throw new TypeError(`rule ${o.id}: kind is 'state' or 'series'`);
  if (rules.has(o.id)) { clash.push(o.id); return false; }
  rules.set(o.id, { id: o.id, owner: o.owner, why: o.why, kind, check });
  RULES.push({ id: o.id, owner: o.owner, why: o.why, kind });
  return true;
}

export const ruleList = () => RULES.slice();
export const ruleIds = () => RULES.map((r) => r.id);
export const clashes = () => clash.slice();
export const rulesOwning = (file) => RULES.filter((r) => r.owner === file);

const asSet = (v) => (v == null ? null : new Set(Array.isArray(v) ? v : [v]));

/** Runs the rules over a report and/or a history of frames; see the header. Returns a plain array of findings. */
export function runRules(input, { history, only, skip, kinds, env } = {}) {
  const want = asSet(only), drop = asSet(skip), ks = asSet(kinds);
  const out = [];
  for (const r of rules.values()) {
    if (want && !want.has(r.id)) continue;
    if (drop && drop.has(r.id)) continue;
    if (ks && !ks.has(r.kind)) continue;
    const data = r.kind === 'series' ? history : input;
    if (data == null || (r.kind === 'series' && !history?.length)) continue;
    try {
      const found = r.check(data, { env: env || {}, report: input && typeof input === 'object' && !Array.isArray(input) ? input : undefined });
      for (const f of found || []) if (f) out.push({ rule: r.id, why: r.why, owner: r.owner, ...f });
    } catch (e) {   // alloc-rare: a rule that throws is reported, not lost
      out.push({ rule: 'rule-error', what: `rule ${r.id} threw`, where: String(e?.message || e), why: 'A broken rule hides real findings', owner: r.owner, of: r.id });
    }
  }
  return out;
}

/** One line per finding, for the text form: "[rule] what: where (at) - owner". */
export function findingText(f) {
  return `[${f.rule}] ${f.what}${f.where ? `: ${f.where}` : ''}${f.at ? ` (${f.at})` : ''} - ${f.owner}`;
}
