// The IR TIPS card and the side card's height (17 Nov 2026). Source shapes kept here (PR-02), each with its reason. Pattern gone = the code changed: look before editing.
const W = 'IR TIPS card and side card (17 Nov 2026):';
export default [
  { file: 'styles/app-07-floating.css', need: [/\.instrument-workspace\.side:not\(\[data-state="peek"\]\) \{ --ws-h: min\(var\(--ws-max, 760px\), calc\(100% - var\(--top-safe\)/, `${W} the side card takes the room there is, up to 760 px, one height for every test (F31: it stopped at 560 px with the screen empty below)`] },
  { file: 'styles/app-07-floating.css', forbid: [/--ws-h: min\(560px/, `${W} no 560 px cap`] },
  { file: 'styles/app-09-tests.css', need: [/\.rp-tiles \.metric \.k \{[^}]*overflow-wrap: normal; word-break: normal; hyphens: none;/, `${W} a reading's name wraps between words, never inside one (F37)`] },
  { file: 'styles/app-06-plate.css', need: [/\.ir-tips \{[^}]*overflow: hidden auto;[^}]*touch-action: pan-y;/, `${W} the TIPS view scrolls down at most, never sideways (overflow-y alone made x scroll)`] },
  { file: 'styles/app-06-plate.css', need: [/\.ir-zone > \.se-panel \{ top: var\(--se-top, 0px\); min-height: calc\(100% - var\(--se-top, 0px\)\); \}/, `${W} the editor's panel grows over the chart and the rows, never over the stent (the approved mock, 17 Nov)`] },
  { file: 'src/ui/monitor.js', need: [/monitorNote\(ctx, note\[0\], L \+ 3 \+ Math\.ceil\(ctx\.measureText\(tick\(ymax\)\)\.width\) \+ 8,/, `${W} a monitor's idle note starts clear of the axis numbers' ink, so "10" never reads "1(" (F48)`] },
];
