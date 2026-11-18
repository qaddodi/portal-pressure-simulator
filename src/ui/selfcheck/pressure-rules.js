// The pressure cut-off rules of the self-check (screen-report-recs.md, section 2): what is shown must agree with src/engine/pressure-cuts.js, the one place the
// cut-offs live (HVPG amber 5, red 10; PPG amber 6, red 12; the portal vein's own bands 10 and 15). Pure functions over plain records; node tests feed them.
//
//   pressure-colour  A number shown with a rating (a tile or header reading's data-rate, a pill's) wears the rating its own cut-offs give it, read on the number AS SHOWN
//                    (the tile prints one decimal: 5.0 is normal, 5.1 amber).
//   pressure-words   Words that name a cut-off of the HVPG or the PPG ("HVPG ≥10", "PPG <12") name one of the app's: the two colour lines, the bleed line and the
//                    pre-emptive TIPS line for the HVPG.
import { PRESSURE_CUTS, HVPG_CUTS, PPG_CUTS, PTIPS_HVPG, sevOfCuts, RATE_OF_SEV, SEV_OF_RATE } from '../../engine/pressure-cuts.js';

/** The cut-offs a pressure key is rated on: the EUS-PPG and the HVPG's fall read on the HVPG's lines, the others on their own. */
const CUTS_OF = Object.freeze({ hvpg: PRESSURE_CUTS.hvpg, eus: PRESSURE_CUTS.hvpg, ppg: PRESSURE_CUTS.ppg, pv: PRESSURE_CUTS.pv });
const OWNER = { tile: 'src/ui/presenter-cards.js', header: 'src/ui/presenter-cards.js', words: 'src/ui/presenter-words.js' };

/** The number a text shows first ("14.2", "−3.5", "1,250"), as a number, or null (no number, or the "—" a missing one prints). */
export function leadNumber(text) {
  const m = /[−–-]?\d[\d,]*(?:\.\d+)?/.exec(String(text).replace(/\u00a0/g, ' '));
  if (!m) return null;
  const v = parseFloat(m[0].replace(/[−–]/g, '-').replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

/** A shown reading's rating, "ok" / "mid" / "hi" (or a severity word, "caution" / "danger"), as a rating; anything else (plain, none, info) is no rating. */
const rateOf = (r) => (RATE_OF_SEV[r] ? RATE_OF_SEV[r] : SEV_OF_RATE[r] ? r : null);

/**
 * Pressure readings shown with a rating that is not the cut-offs' for the number shown.
 * shown: [{ where: 'tile' | 'header' | 'words', key, text, rate }] (number-rules.js readShownNumbers).
 */
export function pressureColour(shown) {
  const out = [];
  for (const s of shown) {
    const cuts = CUTS_OF[s.key], rate = rateOf(s.rate), v = leadNumber(s.text);
    if (!cuts || !rate || v == null) continue;
    const want = RATE_OF_SEV[sevOfCuts(cuts, v)];
    if (rate !== want) {
      out.push({ rule: 'pressure-colour', chart: null, what: `${s.key.toUpperCase()} reads ${s.text.trim()} in the ${s.where}`, where: `rated ${rate}, the cut-offs rate it ${want}`,
        why: `${s.key === 'ppg' ? `PPG amber ${PPG_CUTS.amber}, red ${PPG_CUTS.red}` : s.key === 'pv' ? 'Portal vein amber over 10, red from 15' : `HVPG amber over ${HVPG_CUTS.amber}, red ${HVPG_CUTS.red}`} (src/engine/pressure-cuts.js)`, owner: OWNER[s.where] || OWNER.tile });
    }
  }
  return out;
}

/** The numbers each metric's cut-off may be named by in words. */
export const NAMED_CUTS = Object.freeze({
  hvpg: new Set([HVPG_CUTS.amber, HVPG_CUTS.red, HVPG_CUTS.bleed, PTIPS_HVPG]),
  ppg: new Set([PPG_CUTS.amber, PPG_CUTS.red]),
});
const CUT_WORDS = /\b(HVPG|PPG)\s*(?:[<>≥≤]=?|>=|<=)\s*(\d+(?:\.\d+)?)/g;

/** Words that name a cut-off of the HVPG or PPG the app does not have. texts: [{ where, text }]. */
export function pressureWords(texts) {
  const out = [];
  for (const t of texts) {
    for (const m of String(t.text).replace(/\u00a0/g, ' ').matchAll(CUT_WORDS)) {
      const metric = m[1].toLowerCase(), n = parseFloat(m[2]);
      if (!NAMED_CUTS[metric].has(n)) {
        out.push({ rule: 'pressure-words', chart: null, what: `"${m[0]}" in ${t.where}`, where: t.where, why: `The app's ${m[1]} cut-offs are ${[...NAMED_CUTS[metric]].join(', ')} mmHg (src/engine/pressure-cuts.js)`, owner: t.owner || OWNER.words });
      }
    }
  }
  return out;
}
