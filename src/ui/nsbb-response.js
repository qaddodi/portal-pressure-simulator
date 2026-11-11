// The beta-blocker response control (features item 41, 11 Nov 2026): a slide's `response: true` puts three buttons on its teaching card that change how
// strongly this patient's portal pressure answers a beta-blocker (the engine's nsbbGain, scenario.js), live, the drug and everything else unchanged.
// They are compare buttons (the presenter's abPick follows the model as it does for any treatment button), made from the slide here so the slide
// states only that it wants them. The three gains were measured on the engine (a settled decompensated patient on carvedilol, 11 Nov 2026): none
// takes the HVPG down 7% (under Baveno VIII Table 3's 10%, a non-response), the usual one 19%, the strong one 27%; on propranolol 5%, 13%, 16%.
// The drug itself comes from the slide's own params, as the Treating the cause slides set it.

/** The gain of each level: nsbbGain's meaning is in scenario.js (1 the usual; the portal parts of propranolol and carvedilol scale with it). */
export const NSBB_GAIN = Object.freeze({ non: 0, usual: 1, strong: 1.6 });
export const RESPONSE_LEVELS = Object.freeze([
  { id: 'non', label: 'Non-responder', short: 'None', gain: NSBB_GAIN.non },
  { id: 'usual', label: 'Usual responder', short: 'Usual', gain: NSBB_GAIN.usual },
  { id: 'strong', label: 'Strong responder', short: 'Strong', gain: NSBB_GAIN.strong },
]);
/** The level a slide opens on: the one its own nsbbGain names (1, the usual, when it sets none); null if its gain is none of the three. */
export function responseOwn(s) {
  const g = s?.params?.nsbbGain ?? NSBB_GAIN.usual;
  return RESPONSE_LEVELS.find((l) => l.gain === g)?.id ?? null;
}
/** The compare buttons for a slide with `response: true`: [{ label, short, params: { nsbbGain }, own? }] in the order none, usual, strong. */
export function responseButtons(s) {
  const own = responseOwn(s);
  return RESPONSE_LEVELS.map((l) => ({ label: l.label, short: l.short, params: { nsbbGain: l.gain }, ...(l.id === own ? { own: true } : {}) }));
}
/** Whether a compare list is the response control's (its group is named for it). */
export const isResponse = (compare) => Array.isArray(compare) && compare.length > 0 && compare.every((o) => o?.params && Object.keys(o.params).length === 1 && 'nsbbGain' in o.params);
