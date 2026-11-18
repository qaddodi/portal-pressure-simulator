// One finding of a self-check rule (screen-report-recs.md section 2): the rule that failed, what and where, why it is a rule, the file that owns the fix.
// Pure: a rule returns these, the registry (and the gallery's Check) lists them. Shapes match the plan's example:
//   { rule: 'label-under-card', what: 'Label "Splenic vein"', where: 'under the Doppler card, 40% covered',
//     why: 'Labels must stay clear of cards (17 Nov)', owner: 'src/ui/label-gl.js', at: '12.4 s' }

/** A finding with every field a string (`at` and `sev` optional). sev: 'error' (default) or 'warn' (a rule that can be fooled by a move in progress). */
export function finding({ rule, what, where, why, owner, at, sev = 'error' }) {
  const f = { rule, what: String(what), where: String(where), why: String(why), owner: String(owner), sev };
  if (at != null) f.at = String(at);
  return f;
}

/** A rule's definition, checked once so a typo cannot register a rule that never runs. `on`: the part of the screen report it reads ('labels', 'camera', 'figure'). */
export function defineRule(r) {
  for (const k of ['id', 'on', 'owner', 'why']) if (typeof r[k] !== 'string' || !r[k]) throw new TypeError(`rule ${r.id ?? '?'}: ${k} is needed`);
  if (typeof r.check !== 'function') throw new TypeError(`rule ${r.id}: check(part, report) is needed`);
  return Object.freeze({ sev: 'error', ...r });
}

/** Runs rules over a report: report[part] is each part's JSON. A rule that throws is a finding of its own (a broken rule must not hide the others). */
export function runRules(rules, report, { only } = {}) {
  const out = [];
  for (const r of rules) {
    if (only && !only.includes(r.id)) continue;
    const part = report?.[r.on];
    if (part == null) continue;
    try {
      for (const f of r.check(part, report) || []) out.push(f);
    } catch (e) {
      out.push(finding({ rule: r.id, what: 'the rule itself', where: `threw: ${e?.message || e}`, why: r.why, owner: r.owner, sev: 'warn' }));
    }
  }
  return out;
}
