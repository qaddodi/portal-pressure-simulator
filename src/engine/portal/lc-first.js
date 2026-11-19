/**
 * The first letter of a name lower-cased where it drops into a sentence ("Presinusoidal fibrosis" → "presinusoidal fibrosis"), except where the first word is an acronym or
 * carries a capital inside it (TIPS, DIPS, PSVD, HVPG, IVC, pH, mmHg): "the narrowed tIPS" is what a bare charAt(0).toLowerCase() made of "TIPS" (play-test 17 Nov 2026).
 * One helper for every sentence the app builds from a name; tests/lc-first.test.js fails a second, unguarded copy in the source.
 */
export const lcFirst = (s) => {
  if (typeof s !== 'string' || !s) return s;
  const word = s.match(/^[^\s,.;:()/–-]+/)?.[0] ?? '';
  return /[A-Z]/.test(word.slice(1)) || /^[a-z]/.test(word) ? s : s.charAt(0).toLowerCase() + s.slice(1);
};
