// The lobule's vessel layer names each call it makes as a part of the frame (17 Nov 2026, the tester: lz.drawGL 52 to 153 ms for 15 to 27 frames after a pick, and nothing under it named), so a long
// frame says whether it was the whole draw, the rows' redraw, the composite or one of the sends. The functions are made once and read one record: a frame makes no closure. Source shapes (PR-02).
const W = 'The vessel layer names its calls (17 Nov 2026):';
export default [
  { file: 'src/ui/lobule-zoom.js', need: [/framePart\('lz\.vessels: whole draw', vesWhole\)/, `${W} the whole draw`] },
  { file: 'src/ui/lobule-zoom.js', need: [/framePart\('lz\.vessels: rows draw', vesRows\)/, `${W} the rows' redraw`] },
  { file: 'src/ui/lobule-zoom.js', need: [/framePart\('lz\.vessels: composite', vesComposite\)/, `${W} the composite`] },
  { file: 'src/ui/lobule-zoom.js', need: [/framePart\('lz\.vessels: flow send', vesFlow\)/, /framePart\('lz\.vessels: attributes send', vesTubes\)/, /framePart\('lz\.vessels: geometry send', vesGeo, bins\)/, `${W} the three sends`] },
];
