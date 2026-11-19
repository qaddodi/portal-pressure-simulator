// One Finding (bible review 19 Nov 2026, DBG-3): `{ rule, sev: 'fail'|'warn'|'note', what, where, why?, owner?, at?, scope? }`.
// Seven tools used to speak six dialects of it (the registry's, the fit judges', the Phone check's "bad", the glitch sweep's from/to, frame-step's frames, the deck sweep's
// "kind: words" strings). This module is the one place that knows all of them: each runner hands its own shape to an adapter and gets a Finding, so a paste from any of
// them can be shown and compared with a paste from any other. Pure: no DOM, no page.
//
// scope: { specimen | slide | step, device, look }, whichever the tool knows (strings only).

export const SEVS = ['fail', 'warn', 'note'];
const SCOPE_KEYS = ['specimen', 'slide', 'step', 'deck', 'device', 'look'];

/** The words older code used for severity, as the one scale. */
export const sevOf = (s) => (s === 'bad' || s === 'error' || s === 'fail' ? 'fail' : s === 'warn' || s === 'warning' ? 'warn' : s === 'note' || s === 'info' ? 'note' : 'fail');

const tidyScope = (s) => {
  if (!s || typeof s !== 'object') return undefined;
  const o = {};
  for (const k of SCOPE_KEYS) if (s[k] != null && s[k] !== '') o[k] = String(s[k]);
  return Object.keys(o).length ? o : undefined;
};

/** A Finding from its parts; every field a string, `sev` one of SEVS, empty optional fields left out. */
export function finding({ rule, sev, what, where, why, owner, at, scope } = {}) {
  const f = { rule: String(rule || 'unknown'), sev: sevOf(sev), what: String(what ?? ''), where: String(where ?? '') };
  if (why) f.why = String(why);
  if (owner) f.owner = String(owner);
  if (at != null && at !== '') f.at = String(at);
  const sc = tidyScope(scope);
  if (sc) f.scope = sc;
  return f;
}

/** The identity of a finding for `compare`: its rule and what it is about, whatever words wrap them (where and when may move with a fix). */
export const key = (f) => `${f.rule}|${String(f.what || '').replace(/\s+/g, ' ').trim()}`;

// ── adapters: each tool's own shape in, a Finding out ──

/** The self-check registry's finding (`runRules`): `{ rule, what, where, why, owner, at }`; a rule may say `sev: 'warn'`. */
export const fromRegistry = (f, scope) => finding({ ...f, scope: { ...(typeof f.scope === 'object' ? f.scope : null), ...scope } });

/** The card judges' problem (`fit-rules.js` P, the edge kinds): `{ kind, text, line?, where? }`. The rule is its kind, so `small` and `edge-cutoff` read as they do in the Check's copy. */
export const fromProblem = (p, scope) => finding({ rule: p.kind, sev: 'fail', what: p.text, where: p.where, scope });

/** The Phone check's step flag (`walk.js flagsFor`): `{ kind, sev: 'bad'|'warn', text }`, at the step it was raised on. */
export const fromWalkFlag = (fl, scope) => finding({ rule: `walk-${fl.kind}`, sev: fl.sev, what: fl.text, scope });

/** A Phone check or Sweep's grouped problem line (`{ kind, text, owner, n, first }`): counted, with the first place. */
export const fromGroup = (g, scope) => finding({ rule: String(g.kind).replace(/\s+/g, '-'), sev: 'fail', what: g.text, where: g.n > 1 ? `${g.n} stops, first at ${g.first}` : g.first ? `at ${g.first}` : '', owner: g.owner, scope });

/** The glitch sweep's finding: `{ rule, from, to, detail }` (times in ms). */
export const fromGlitch = (g, scope) => finding({ rule: g.rule, sev: 'fail', what: g.detail, at: g.from != null ? `${g.from}-${g.to ?? g.from} ms` : '', scope });

/** frame-step's merged anomaly: `{ rule, from, to, n, detail }` (frames). */
export const fromFrameStep = (g, scope) => finding({ rule: g.rule, sev: 'fail', what: g.detail, where: g.n > 1 ? `${g.n} frames` : '', at: g.from != null ? `frame ${g.from}${g.to != null && g.to !== g.from ? `-${g.to}` : ''}` : '', scope });

/** The deck sweep's line `"[case card up] kind: words"` for one slide (`slideProblems`): the bracket is where, the word before the first colon the rule. */
export function fromDeckLine(line, scope) {
  const m = /^\[([^\]]*)\]\s*(.*)$/.exec(line);
  const rest = m ? m[2] : line, i = rest.indexOf(':');
  return finding({ rule: i > 0 ? rest.slice(0, i).trim() : 'deck-sweep', sev: 'fail', what: i > 0 ? rest.slice(i + 1).trim() : rest, where: m ? m[1] : '', scope });
}

/** Any of the shapes above, told by its fields (what a pasted JSON or a mixed list holds). A string is a deck line. */
export function normalize(f, scope) {
  if (typeof f === 'string') return fromDeckLine(f, scope);
  if (!f || typeof f !== 'object') return finding({ rule: 'unknown', what: String(f), scope });
  if (f.what != null && f.rule != null) return fromRegistry(f, scope);
  if (f.kind != null && f.sev != null && f.text != null) return fromWalkFlag(f, scope);
  if (f.kind != null && f.text != null) return fromProblem(f, scope);
  if (f.rule != null && f.detail != null) return f.n != null || typeof f.frame === 'number' ? fromFrameStep({ ...f, from: f.from ?? f.frame, to: f.to ?? f.frame }, scope) : fromGlitch(f, scope);   // (frame-step's carry n or frame; the glitch sweep's carry times)
  return finding({ rule: f.rule || f.kind || 'unknown', what: f.what || f.text || f.detail || JSON.stringify(f).slice(0, 160), scope });
}
