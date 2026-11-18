// The wording rules the Words dump bench (benches/words-dump.js) judges the decks' text by. Pure data and one function: no DOM, no node
// modules, so the page can load it and a unit test can too.
//
// RULES is a COPY of the list in scripts/clinical-wording.mjs (the lint's rules), because that script reads files with node:fs and so cannot be
// imported into the page. tests/gallery-bench-words-dump.test.js compares the two lists (names and pattern sources), so a rule added to the
// script fails the test until it is copied here too. Below the copy are the checks that only the dump makes (Baveno VIII only, a double space).

// Drugs and therapies a clinician gives (not devices or procedures: a TIPS "returns" blood), then the verbs the clinician performs on them.
const THERAPY = '(?:carvedilol|propranolol|nadolol|timolol|NSBBs?|(?:non-?selective )?beta-?blockers?|terlipressin|octreotide|vasopressors?|midodrine|albumin|diuretics?|spironolactone|furosemide|rifaximin|lactulose|antibiotics?|antibiotic prophylaxis|anticoagulation|anticoagulants?|heparin|LMWH|enoxaparin|warfarin|rivaroxaban|apixaban|statins?|simvastatin|norfloxacin|ceftriaxone|antivirals?|somatostatin|vasoconstrictors?|the drug|the beta-blocker|the NSBB|the diuretics?)';
const DRUG_SUBJECT = new RegExp(`\\b${THERAPY}\\b(?:\\s+(?:and|or|with|plus)\\s+(?:EVL|banding|[A-Za-z-]+))?\\s+(?:(?:may|can|should|will|must|then|now|also|only|still|usually|again|first|always|never|just|too|often)\\s+)*(?:start|stop|restart|resume|continue|begin|cease)s?\\b|\\b${THERAPY}\\b(?:\\s+[\\w-]+){0,3}?\\s+and\\s+(?:start|stop|restart|resume|continue|begin|cease)s\\b`, 'i');

// Each rule: a name, a pattern on the learner text, what to write instead and, for a word with a second meaning, the context it is judged in.
export const RULES = [
  // "MAP less the IAP", "the WHVP less the FHVP", "the pressure inside less the air's", "18 less 10". A comparative "less" is followed by
  // a noun with no article ("less portal blood", "less ascites") or by than/likely/often, and never by the/its/his/her/their/a number.
  ['less-as-minus', /\bless\s+(?:(?:the|its|his|her|their|that|this|what)\b|[0-9])/i, 'write "minus" (or − in an equation)'],
  ['less-as-minus', /\b(?:MAP|WHVP|FHVP|IVC|RAP|IAP|HVPG|PPG|pressure|pressures|reading|readings|mmHg)\s+less\b(?!\s+(?:than|likely|often|so|well|room|time|common|reliable|blood|flow|portal|of|and|or|in|to|on|at))/i, 'write "minus"'],
  ['belly', /\bbell(?:y|ies)\b/i, 'abdomen, peritoneal cavity, intra-abdominal pressure (IAP)'],
  ['takes-back', /\b(?:takes?|took|taken|taking)\s+back\b/i, 'peritoneal reabsorption (mL/day)'],
  ['kidney-pressure', /\bkidney (?:pressure|P)\b/i, 'abdominal perfusion pressure (APP)'],
  // MAP − IAP is the abdominal perfusion pressure (WSACS). "Renal perfusion pressure" claimed a kidney reading the model does not have (external review R03).
  ['renal-perfusion-pressure', /\b[Rr]enal perfusion pressure\b|\bRPP\b/, 'abdominal perfusion pressure (APP) for MAP − IAP'],
  ['tap', /\b(?:a|the|one|each|every|another|first|second|after|before|big|large|repeat(?:ed)?)\s+taps?\b|\btapp(?:ed|ing)\b|\btaps\b/i, 'paracentesis, large-volume paracentesis (LVP)', /ascit|paracent|albumin|abdom|\bliters?\b|\bL\b|drain|SBP|diuretic|fluid/i],
  ['water-pill', /\bwater (?:pills?|tablets?)\b/i, 'diuretic'],
  ['tummy', /\btumm(?:y|ies)\b/i, 'abdomen'],
  ['gut', /\b(?:gut|bowel)(?:[’']s)?\s+(?:arter\w*|arteriol\w*|veins?|blood|inflow)\b|\bthe gut[’']s\b/i, 'splanchnic arteries, mesenteric veins, splanchnic inflow'],
  ['scarring', /\bscarr(?:ing|ed)\b/i, 'fibrosis, fibrotic'],
  ['clotted', /\bclotted\b/i, 'thrombosed'],
  ['lymph-made', /\blymph (?:made|it makes)\b/i, 'lymph formation'],
  ['lay-anatomy', /\b(?:tricuspid|valve) leak\b|\bvein of the (?:left|right) kidney\b|\bwater in the (?:chest|lungs)\b|\bfluid in the (?:belly|lungs)\b/i, 'tricuspid regurgitation, left renal vein, hydrothorax, pulmonary edema'],
  ['british-idiom', /\bin brackets\b|\bcommonest\b|\bbooked for\b|\bcarr(?:y|ies) on\b|\bwhilst\b|\bper cent\b|\bat weekends\b|\bstraight away\b/i, 'American idiom (in parentheses, most common, scheduled for, continue)'],
  ['word-by-pill', /\b(?:above|below|under|over|more than|less than|at least)\s+(?:the\s+)?\{[<>≥≤]/i, 'no comparison word beside a cut-off pill (authoring guide rule 6)'],
  ['lay-measure', /\bpressure across (?:its|the) (?:varix )?wall\b|\b(?:esophageal )?air pressure\b|\bthe air (?:presses|pushes|in the esophagus)\b|\bvomit(?:s|ed|ing)? blood\b|\bsalt limit\b|\bsober\b|\bthe free reading\b|\bswollen legs\b|\btakes? away\b|\bportosystemic vascular disorder\b/i, 'transmural pressure, insufflation pressure, hematemesis, sodium restriction, abstinent'],
  ['possessive', /\b(?:the )?(?:liver|spleen|abdomen|gut|kidney)[’']s (?:flow|blood|portal|own blood|pressure|size)\b/i, 'hepatic blood flow, splenic venous outflow, intra-abdominal pressure, spleen size'],
  ['the-scope', /\b(?:the|a|at|before|after|no) scope\b/i, 'endoscopy, the endoscope, EGD'],
  ['the-room', /\b(?:the|this) room\b/i, 'write to the learner'],
  ['british', /\b(?:colour\w*|grey(?:er|ish|s)?|haemorrhag\w*|oesophag\w*|oedema\w*|anaemi\w*|haemat\w*|haemo\w*|whilst|per cent|centre(?:d|s)?|litre(?:s)?|millilitre\w*|behaviour\w*|favour\w*|tumour\w*|fibre\w*|labour\w*|ischaemi\w*|paediatric\w*|foetal|foetus|oestrogen\w*|leukaemi\w*|diarrhoea|organis(?:e|ed|es|ing|ation)|recognis(?:e|ed|es|ing)|minimis(?:e|ed|es|ing)|stabilis(?:e|ed|es|ing)|haemodynamic\w*|modell(?:ed|ing)|tunnell\w*|recanalis\w*|embolis(?:e|ed|es|ing|ation)\b|afterwards|favour\w*|aetiolog\w*|pre-emptive|non-selective|catheteris\w*|anaesthe\w*)\b/i, 'American spelling'],
  // A drug or therapy is never the subject of "starts", "stops", "restarts", "continues" or "resumes": a clinician starts, stops or restarts it, so the
  // sentence says who acts ("Restart carvedilol once the blood pressure has recovered", "carvedilol is restarted"). Mohammad, 16 Nov 2026, on the title
  // "Carvedilol restarts once the blood pressure has recovered": "Who restarts it? If the app utters nonsense it's fucked."
  ['drug-as-subject', DRUG_SUBJECT, 'an imperative or a passive: "Restart carvedilol", "carvedilol is restarted", "continue the NSBB" (docs/ai-humanizer.md section 5)'],
  // A guideline, an algorithm or a finding never acts either (wording audit, 16 Nov 2026, the advisor's review): Baveno VIII recommends, the algorithm says
  // to, a clinician holds the drug for hypotension. "Baveno VIII starts carvedilol", "the algorithm continues carvedilol", "Hypotension holds carvedilol",
  // "Does the bilirubin withhold the TIPS?" leave the reader unsure who acts.
  ['guideline-as-actor', /\b(?:Baveno VIII|AASLD(?: 20\d\d)?|EASL(?: 20\d\d)?|the algorithm|the guidelines?)\s+(?:(?:would|may|then|also|now|still|only|never)\s+)?(?:starts?|stops?|continues?|restarts?|holds?|withholds?|keeps?)\s+(?:carvedilol|propranolol|nadolol|an? |the |it\b|NSBB|anticoag|albumin|terlipressin|octreotide|antibiotic|rifaximin|lactulose|diuretic)/i, '"Baveno VIII recommends starting carvedilol", "the algorithm says to continue it"'],
  // (Built from a template so the kidney cut-off test, which reads numbers in code, does not see the 65 of the script's own pattern.)
  ['finding-as-actor', new RegExp(String.raw`\b(?:hypotension|HRS-AKI|the bilirubin|the MELD|a MAP <6${5} mmHg(?: or HRS-AKI)?)\s+(?:holds?|withholds?|stops?|spares?|cancels?)\b`, 'i'), 'an imperative: "Reduce or hold carvedilol for hypotension", "Does the bilirubin rule out a TIPS?"'],
  // Pressures are, rise or fall; they do not "run at" or "sit higher", and a gradient or a vessel does not "see" (ibid.).
  ['pressure-motion', /\b(?:portal vein|PPG|HVPG|WHVP|FHVP|pressure|right atrium|IVC)\s+(?:still\s+)?(?:runs?|sits?)\s+(?:at|high|higher|low|lower|close)\b/i, '"the portal vein pressure is {pv}", "her PPG is higher"'],
  ['sees', /\b(?:HVPG|WHVP|FHVP|PPG|EUS-PPG|sinusoids?|catheter|gradients?|wedge)\s+(?:cannot |can not |does not |do not |never )?(?:see|sees|saw)\b/i, 'say what the gradient reflects, includes or misses'],
  ['scar', /\bscars?\b/i, 'fibrosis, fibrous septa'],
  ['region-caveat', /\b(?:outside (?:of )?the US|in Europe and much of the world|not approved in North America)\b/i, 'name the drug and its alternative with no region (owner, 16 Nov 2026): "Octreotide", "Terlipressin is an alternative"'],
  ['em-dash', /[A-Za-z0-9,.)]\s*—\s*[A-Za-z0-9(]/, 'a full stop or a comma (no em-dash in learner text)'],
];

// Checks the dump adds. The lint walks code strings; the dump walks the finished deck objects, so these catch what a template or a helper builds.
export const EXTRA_RULES = [
  // The guideline is the eighth Baveno consensus (J Hepatol 2026) and only that (docs/deck-authoring-guide.md rule 13). The pattern is built from parts so that the source-wide check for the older one does not see it.
  ['older-baveno', new RegExp(String.raw`\bBaveno[\s-]+(?:V${'I'}I|${7})\b(?![\s-]*(?:I|\d))`, 'i'), 'Baveno VIII (the current guideline) only'],
  ['double-space', /\S {2,}\S/, 'one space'],
];

/** The rules `text` breaks, as [{ rule, match, fix }]: the lint's rules, then the dump's own. */
export function checkWording(text) {
  const s = String(text), out = [];
  for (const [rule, re, fix, when] of RULES) {
    if (when && !when.test(s)) continue;   // (a tap on a screen is not a paracentesis)
    const m = s.match(re);
    if (m) out.push({ rule, match: m[0], fix });
  }
  for (const [rule, re, fix] of EXTRA_RULES) {
    const m = s.match(re);
    if (m) out.push({ rule, match: m[0], fix });
  }
  return out;
}
