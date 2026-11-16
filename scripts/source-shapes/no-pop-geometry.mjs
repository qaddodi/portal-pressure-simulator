// Geometry that exists only in some states (a clot, a stent's mesh, a plug, a band, a collateral, a closed collateral's outline) is faded in and out,
// never inserted or taken out whole (Mohammad, 16 Nov 2026: "a collateral closes and then it just POPS"; the play-test saw about 39 clot paths
// inserted at opacity 1 on a patient change). tests/no-pop-geometry.test.js holds the behaviour; these keep the wiring.

export default [
  // Every drawn mark goes through putMark (mark-fade.js: it fades in when it comes and out when it goes, under Reduce Motion too).
  { file: 'src/ui/stage*', forbid: [/ov\.(thrombi|stents|plugs|bands|varices|gvarices)\.append\(/, 'a mark appended to its overlay group straight pops in and out: build it with putMark(host, key, vessel, els) so mark-fade.js fades it'] },
  { file: 'src/ui/stage-clamps.js', need: [/putMark\(ov\.thrombi, `clot:\$\{id\}`, id, els\)/, 'a clot is a mark of its own (clot:<vessel>), faded in and out'] },
  { file: 'src/ui/stage-clamps.js', need: [/if \(!clots\) for \(const id of clotIds\) markA\.want\(`clot:\$\{id\}`/, 'while the clots key holds, the clots standing are wanted again (or begin() would fade them out at the next build)'] },
  // A collateral's closing front leaves a hairline: it fades with the front (frontAlpha) and a closed collateral's dotted outline comes in with a fade.
  { file: 'src/ui/stage-vessels.js', need: [/else if \(fronted\(x\)\) alpha \*= frontAlpha\(frontP\(x\.reveal, now\), x\.reveal\.out\)/, 'the closing and opening front fade the whole vessel at their ends'] },
  { file: 'src/ui/stage-transitions.js', need: [/r\.ghostIn = true;\s*setReveal\(x, r\)/, 'the dotted outline a closed collateral leaves comes in with a fade'] },
];
