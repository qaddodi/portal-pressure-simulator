// A card is one still box whatever is picked or switched in it (Mohammad's play-tests of 17 Nov 2026: opening, closing and choosing still felt glitchy; the tester's
// Pressure-to-IR finding). Source shapes kept here (PR-02), each with its reason. Pattern gone = the code changed: look before editing. (The behaviour of a pick is
// tests/card-pick-no-blink.test.js; the Tests tabs are stepped in the browser with the test clock, pps.testClock.)
const W = 'A card is one still box (17 Nov 2026):';
export default [
  { file: 'src/ui/card.js', need: [/const swap = wasOpen && !same && !!el\.animate && !!old;/, `${W} a pick while the card is open is always the words' crossfade, whatever the new card's size or shape (it used to be the card going out and coming in again: a blink)`] },
  { file: 'src/ui/card.js', need: [/if \(el\.hidden \|\| leaving \|\| \(resized && !swap\)\) \{ opening\(\); backIn\(leaving \? lo : null\); \}/, `${W} only a card that is not open comes in from its edge`] },
  { file: 'src/ui/card.js', need: [/if \(swap && resized && !el\.classList\.contains\('ac-in'\) && !reduceMotionMQ\?\.matches\) glideFrom = sizes\.h;/, `${W} a pick that changes the height glides the card from the height it had`] },
  { file: 'src/ui/card.js', need: [/if \(swap && oldH > 0\) \{ old\.style\.height = `\$\{oldH\}px`; old\.style\.bottom = 'auto'; \}/, `${W} the old words fade at their own height, never stretched to the new box`] },
  { file: 'src/ui/dock.js', need: [/for \(const w of was\) if \(!w\.el\.classList\.contains\('active'\) && w\.el\.animate\) paneOut\(w\.el, w\.top, w\.box, w\.pair\);/, `${W} every pane a tab leaves, a pair included, fades out where it stood`] },
  { file: 'src/ui/dock.js', need: [/const canStage = \(target\) => open\.length >= 1 && !open\.includes\(target\)/, `${W} a tab picked from a pair is built before it is shown, as one picked from a single pane is`] },
  { file: 'styles/app-07-floating.css', need: [/\.dock-body\.split > \.dock-pane\.active\.staging:not\(\.landed\) \{ position: absolute; inset: 0; grid-area: auto; \}/, `${W} a pane built beside a pair stands over the body, out of the grid, so the pair does not move into one cell`] },
  { file: 'src/ui/card.js', need: [/\} else if \(lo && old && el\.animate\) \{/, `${W} a pick while the card is still going out takes it from where it is: the old words go on fading from the opacity they had, never in one frame`] },
];
