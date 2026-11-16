// Play-test 16 Nov 2026: a control that hides its own words, a gauge or a marker the card crops or crowds. Source shapes kept here (PR-02), each with its reason.

// A button that takes the hover tint (::before, z-index -1 in the button's own stacking context) paints it OVER its own background. A pressed
// button with the ink colour for its fill and light words (Stop, a pressed chip) went cream under the pointer and its words vanished: the blank
// "Stop" pill, Compare on, 1280x800, light look. Every such rule must hand the hover tint the same ink (--hv-bg: var(--text)).
const TINTED = /:where\(([^)]*)\)::before/;
const pressedFills = (css) => {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = TINTED.exec(css);
  if (!m) return ['the list of controls that take the hover tint (the :where(...)::before rule in app-01-chrome.css) is gone: move this rule with it'];
  const tinted = new Set([...m[1].matchAll(/\.([\w-]+)/g)].map((x) => x[1])), bad = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\[aria-(pressed|selected)="true"\]/.test(sel) || !/background(-color)?:\s*var\(--text\)/.test(body)) continue;
    if (![...sel.matchAll(/\.([\w-]+)/g)].some((x) => tinted.has(x[1]))) continue;   // (no tint on it: nothing lies over its fill)
    if (!/--hv-bg:\s*var\(--text\)/.test(body)) bad.push(`${sel.trim()} is a pressed pill filled with the ink and has no --hv-bg: var(--text), so the hover tint covers its fill and its light words vanish`);
  }
  return bad;
};

export default [
  { file: 'styles/app-*.css', scan: pressedFills },
  { file: 'styles/app-*.css', exactly: [/\.tl-pin\[aria-pressed="true"\] \{[^}]*--hv-bg: var\(--text\)/, 3, 'Compare/Stop: the timeline, the dock, and the dock at Mac width (three rules) and the chip all carry the ink tint'] },
  { file: 'styles/tests-card.css', need: ['.dop-speed .dop-range { display: block; margin: 9px 1px 0; }', "the Speed tile's range marker stands clear of the reading and in from the tile's sides ('15 | 40' was crammed against 'Speed 24 cm/s')"] },
  { file: 'styles/tests-card.css', need: ['.dop-speed .dop-ticks { height: 14px; margin-top: 4px;', "the marker's numbers stand clear of its track"] },
];
