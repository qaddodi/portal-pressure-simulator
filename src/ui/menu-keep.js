// What the menu's kept rows depend on (menu.js, rowFor): a row is put back as it was when this text is unchanged, and made again when it is not.
// Pure, so the rule is unit-tested without a browser (tests/menu-keep.test.js); tests/e2e/menu-kept.mjs checks that a kept list equals a made one.

const SEP = '\u241f';

/** A presentation's row: everything the row, and the preview its info button and a hover open, show. `script` is a test deck (listed as a script),
 *  `current` the deck now playing, `resume` { at, n } or null, `marked` the deck the menu was opened to highlight. */
export function deckSig(d, script, current, resume, marked) {
  return [script ? 's' : 'd', d.id, d.title, d.short, d.level, d.minutes, d.summary, d.slides?.length, d.steps?.length, d.deck?.slides?.length,
    (d.objectives || []).join('|'), current ? 1 : 0, resume ? `${resume.at}/${resume.n}` : '', marked ? 1 : 0].join(SEP);
}

/** A patient's row: the whole preset (its label, group, summary and what its preview shows) and whether it is the one on show. */
export function patientSig(p, current) {
  let j;
  try { j = JSON.stringify(p); } catch { j = null; }
  return j == null ? null : j + SEP + (current ? 1 : 0);   // (null never equals: a preset that cannot be written out is made again each time)
}
