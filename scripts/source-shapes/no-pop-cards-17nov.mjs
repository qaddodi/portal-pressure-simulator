// Nothing in a card pops (Mohammad's play-test of the TIPS, Treat and Tests › IR cards, 17 Nov 2026): a change inside a card, a tray opening, a tab or a sub-view
// changing, a section folding, is eased: what goes out fades where it stood, what changes the card's height glides it (card-glide.js). Source shapes kept here
// (PR-02), each with its reason. Pattern gone = the code changed: look before editing. (The behaviour is tests/tray-no-pop.test.js, card-glide-sheets.test.js and
// leave-fade.test.js.)
const W = 'Nothing in a card pops (17 Nov 2026):';
export default [
  { file: 'styles/app-06-plate.css', need: [/\.ac-panel:has\(> \.tv \.se-panel:not\(\[data-open=""\]\)\) \+ \.ac-as \{ position: absolute; top: var\(--as-top, 0px\);[^}]*opacity: 0; visibility: hidden;[^}]*transition: opacity/, `${W} the card's Doppler / Dye / IR / Remove row leaves the flow at once but fades where it stood while a tray is open (display: none popped it)`] },
  { file: 'styles/app-06-plate.css', forbid: [/\.ac-as \{ display: none; \}/, `${W} no display: none on the card's action row`] },
  { file: 'styles/app-06-plate.css', need: [/\.se-panel \.se-pb\.se-leave \{[^}]*position: absolute/, `${W} the controls of the tile that closes fade out over their own place`] },
  { file: 'styles/app-06-plate.css', need: [/\[data-view="tips"\] > :not\(\.ir-tips, \.lf-ghost\) \{ display: none; \}/, `${W} the IR host's hide rule leaves the leaving view's ghost alone`] },
  { file: 'styles/app-06-plate.css', need: [/\.lf-ghost \{[^}]*pointer-events: none;/, `${W} the leaving view's ghost takes no taps`] },
  { file: 'styles/app-08-cards.css', need: [/\.treat-pane \{[^}]*clip-path: inset\(-6px\);/, `${W} the Treat list's cut is a clip-path the card's glide can open`] },
  { file: 'styles/app-08-cards.css', forbid: [/\.treat-pane \{[^}]*overflow: clip/, `${W} an overflow cut cannot be opened by the glide`] },
  { file: 'styles/app-08-cards.css', need: [/\.glide-free \{ overflow: visible !important; \}/, `${W} a sheet's scroller lets the glide show past its new foot while it runs`] },
  { file: 'src/ui/chart.js', need: [/glideCard\(card, h0, readMetric\(card, 'offsetHeight'\), \{ prior: glides, ride: \[body\.nextElementSibling\], cut: \[body, body\.parentElement\], free: \[body\.parentElement\] \}\)/, `${W} a Treat tab that changes the card's height glides it`] },
  { file: 'src/ui/chart.js', need: [/d\.firstElementChild\.addEventListener\('click'/, `${W} a section opening or closing in a card glides the card's foot`] },
  { file: 'src/ui/chart.js', need: [/d\.lastElementChild\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\]/, `${W} a section's words fade before it folds (a folded section's words are gone at once)`] },
  { file: 'src/ui/ir-tips.js', need: [/const out = leaveFade\(v === 'tips' \? \[\.\.\.host\.children\]\.filter\(\(c\) => c !== el\) : \[el\], parts\[0\]\);\s+view = v;/, `${W} the view that goes out is lifted into its ghost before the flip: a hidden view cannot fade`] },
  { file: 'src/ui/ir-tips.js', need: [/const out = leaveFade\(\[subEl\(sub\)\], subEl\(v\)\);[^\n]*\n\s+sub = v;/, `${W} the sub-view that goes out is lifted before the flip`] },
  { file: 'src/ui/ir-tips.js', exactly: [/out\.start\(\);/, 2, `${W} both changes of view start the fade`] },
  { file: 'src/ui/stent-editor.js', need: [/if \(!switching\) holdActions\(\);\s+show\(rowId, switching\);/, `${W} the tray holds the action row's place before it takes its room, and a switch of tile fades the old controls`] },
  { file: 'src/ui/stent-editor.js', need: [/const out = on \? leaveFade\(\[rowsEl\], summary\) : leaveFade\(\[summary\], rowsEl\);/, `${W} the fold of a card's editor (its rows to one line and back) fades the part that goes out`] },
  { file: 'styles/app-06-plate.css', need: [/\.stent-editor\[data-fold="true"\] > \.se-rows \{ display: none; \}/, `${W} the fold's hide rule is a child rule: the rows going out stay visible in their ghost`] },
];
