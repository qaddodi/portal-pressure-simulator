// Rules moved from tests (11 Nov 2026, PR-02): collateral-front (the wiring), lobule-cut-vessels (the lobule's and the lumen shader's wiring), spleen-caliper-reveal.
// Each keeps its test's one-line reason; a pattern that no longer matches means the code it guarded changed, so look before editing the rule.
export default [
  // collateral-front: a collateral's front is drawn as a width, in the one radii path the Tube reads (no shader is touched)
  { file: 'src/ui/stage-tubes.js', need: [/frontScale\(fp, fr\.out/, 'tubeFill scales the radii by the front'] },
  { file: 'src/ui/stage-vessels.js', need: [/frontKey\(x, performance\.now\(\)\)/, 'the radii key follows the clock'] },
  { file: 'src/ui/stage-vessels.js', need: [/!fronted\(x\)/, 'a collateral keeps its whole length (no stretch cut)'] },
  { file: 'src/ui/stage-transitions.js', need: [/FRONT_MS/, 'a collateral opens and closes over the front time'] },
  ...['veins-gl.js', 'tube-pass.js', 'tube-geo.js'].map((f) => ({ file: `src/ui/${f}`, forbid: ['collateral-front', 'no shader and no renderer is touched by the collateral front'] })),

  // lobule-cut-vessels: the four end-on kinds (and only they) get the ring flag, the mouths and the ink; the lumen layer lays celDisc last
  { file: 'src/ui/lobule-zoom.js', need: [/const endOn = t\.kind === 'cv' \|\| t\.kind === 'pv' \|\| t\.kind === 'ha' \|\| t\.kind === 'bd';/, 'the end-on kinds are the four cut-across vessels'] },
  { file: 'src/ui/lobule-zoom.js', need: [/\(endOn \? F_RING : 0\)/, 'F_RING is set on the end-on kinds only'] },
  { file: 'src/ui/lobule-zoom.js', need: [/if \(endOn\) \{[\s\S]*G\.mouths\.get\(t\.id\)[\s\S]*tubeData\[o \+ 16 \+ i\]/, 'the mouths go into the tube texel for the end-on kinds'] },
  { file: 'src/ui/lobule-zoom.js', need: [/akLook === lookSig/, 'a new look makes the attributes again (the ink follows the casing)'] },
  { file: 'src/ui/tube-lumen-glsl.js', need: [/col = celTones\([\s\S]*col = celDisc\([\s\S]*outColor = ditherOut\(/, 'the lumen layer lays celDisc after the tones and before the output'] },
  { file: 'src/ui/tube-lumen-glsl.js', need: [/ringOpen\(T\(id, 3\)\.xyz,/, 'celDisc takes the row\'s mouth mask'] },
  { file: 'src/ui/tube-lumen-glsl.js', need: [/T\(id, 4\)\.rgb/, 'celDisc takes the row\'s ink'] },

  // spleen-caliper-reveal (Mohammad, 11 Nov: "when the spleen caliper appears it actually only half appears then it shows up fully")
  { file: 'src/ui/stage-outlines.js', need: [/const capHolds = \(c, f\) => !!f\.morphing && !capShown\.has\(c\.id\);/, 'a caliper not yet drawn waits while the patient morphs'] },
  { file: 'src/ui/stage-outlines.js', need: [/function caliperAt[\s\S]*?capHolds\(c, f\)\) return null;[\s\S]*?function caliperSegs/, 'the spleen caliper (line and reading) is not made while held'] },
  { file: 'src/ui/stage-outlines.js', need: [/function caliperAt[\s\S]*?capShown\.add\(c\.id\);[\s\S]*?function caliperSegs/, 'one drawn is not held again: it follows the spleen'] },
  { file: 'src/ui/stage-outlines.js', need: [/function fxSync[\s\S]*?if \(capWas && !capWait && live\.fx\) \{ live\.fx = \{ \.\.\.live\.fx \}; live\.stageWake\(\); \}[\s\S]*?let fxOpT/, 'the labels are solved again when the held caliper is let in'] },
  { file: 'src/ui/stage-outlines.js', need: [/if \(!sp \|\| sig !== live\.fxSig\) \{ capShown\.clear\(\); capWas = false;/, 'a new set of callouts forgets which calipers were drawn'] },
];
