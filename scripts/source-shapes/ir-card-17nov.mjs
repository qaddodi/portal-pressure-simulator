// The IR TIPS card and the side card's height (17 Nov 2026). Source shapes kept here (PR-02), each with its reason. Pattern gone = the code changed: look before editing.
const W = 'IR TIPS card and side card (17 Nov 2026):';
export default [
  { file: 'styles/app-07-floating.css', need: [/\.instrument-workspace\.side:not\(\[data-state="peek"\]\) \{ --ws-h: min\(var\(--ws-max, 760px\), calc\(100% - var\(--top-safe\)/, `${W} the side card takes the room there is, up to 760 px, one height for every test (F31: it stopped at 560 px with the screen empty below)`] },
  { file: 'styles/app-07-floating.css', forbid: [/--ws-h: min\(560px/, `${W} no 560 px cap`] },
  { file: 'styles/app-09-tests.css', need: [/\.rp-tiles \.metric \.k \{[^}]*overflow-wrap: normal; word-break: normal; hyphens: none;/, `${W} a reading's name wraps between words, never inside one (F37)`] },
  { file: 'styles/app-06-plate.css', need: [/\.ir-tips \{[^}]*overflow: hidden auto;[^}]*touch-action: pan-y;/, `${W} the TIPS view scrolls down at most, never sideways (overflow-y alone made x scroll)`] },
  { file: 'styles/app-06-plate.css', need: [/\.ir-figs \.sc > \.sc-stage \{ flex: none; width: min\(100cqw, 520px, max\(min\(100cqw, var\(--fig-min, 340px\)\), calc\(\(100cqh - 6px\) \* var\(--fig-r, 1\.35\)\)\)\); \}/, `${W} the pictures size width first, never below a readable 340 px (F22, F25)`] },
];
