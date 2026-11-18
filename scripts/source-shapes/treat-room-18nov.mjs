// The Treat card grows to the room it has before its body scrolls (18 Nov 2026, the tester, Mac 1440 x 900: Procedures with a TIPS placed and Changes open stopped at 698 px, 78 px above the dock, and cut its
// TIPS row and Undo). Its cap is the dock's own top edge (--vdock-edge, published by main.js), less one gap; a narrower window, where the view switch reaches under the card, keeps the old reserve. Source shapes (PR-02).
const W = 'The Treat card has the whole room (18 Nov 2026):';
export default [
  { file: 'src/ui/main.js', need: [/'--vdock-edge': px\(vdH \? vdTop - nbvH : 0\)/, `${W} the dock's own top edge is published`] },
  { file: 'styles/app-07-floating.css', need: [/max-height: calc\(100% - var\(--top-safe\) - 4px - var\(--cmp-occ, 0px\) - var\(--vdock-edge, var\(--vdock-h\)\) - var\(--gap\)\);/, `${W} the card's cap is that edge`] },
  { file: 'styles/app-07-floating.css', need: [/@media \(max-width: 1100px\) \{ \.treat-card \{ max-height: calc\(100% - var\(--top-safe\) - var\(--cmp-occ, 0px\) - var\(--vdock-h\) - 2 \* var\(--gap\) - 12px\); \} \}/, `${W} a narrow window keeps the view switch's reserve`] },
];
