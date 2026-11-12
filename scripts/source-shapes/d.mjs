// Source shapes from tests/perf-a1-switches.test.js, tests/perf-gpu-present.test.js and tests/stent-mesh.test.js (moved out 8 Nov 2026, PR-02).
// A pattern here may be an object with test(text) and toString() where a test judged a slice of a function, not the whole file.

const VEINS = 'src/ui/veins-gl.js', ORGANS = 'src/ui/organs-gl.js', GLASS = 'src/ui/stage-glass.js', STAGE = 'src/ui/stage*', VENOUS = 'src/ui/stage-venous.js', CSS = 'styles/app.css';

// (A forwarding stub the stage-split move tool leaves in stage.js: stage-src.js left it out, so the real function is the one found.)
const STUB = /^[ \t]*function\*? \w+\(\.\.\.a\) \{ return (?:yield\* )?\w+\$\(\.\.\.a\); \}[ \t]*\/\/ <stage-split stub>\n?/gm;

// Text of `function name(...) {...}` in the stage family, brace matched (as tests/stage-src.js stageFn did); false when there is none.
function stageFnText(text, name) {
  const src = text.replace(STUB, '');
  const m = new RegExp(`(?:async\\s+)?function\\s*\\*?\\s*${name}\\s*\\(`).exec(src);
  if (!m) return null;
  const i = src.indexOf('{', src.indexOf(')', m.index));
  for (let j = i, d = 0; j < src.length; j++) { const c = src[j]; if (c === '{') d++; else if (c === '}' && --d === 0) return src.slice(m.index, j + 1); }
  return null;
}
const inStageFn = (name, re) => ({ test: (text) => { const fn = stageFnText(text, name); return fn !== null && re.test(fn); }, toString: () => `in function ${name}: ${re}` });

// veins-gl.js composite(): the slice from its head to the next member, as the test cut it.
const COMP_HEAD = '    composite(look, blood = NOBLOOD, full = false, part = 0) {', COMP_END = '    /** Whether organ outlines can be drawn here';
const inComposite = (what, check) => ({
  test: (text) => {
    const a = text.indexOf(COMP_HEAD), b = text.indexOf(COMP_END);
    if (a < 0 || b < 0) return false;
    const comp = text.slice(a, b), sig = comp.slice(comp.indexOf('sn = 0;'), comp.indexOf('const btNow')), mark = comp.slice(comp.indexOf('const btNow'), comp.indexOf('let same'));
    return check({ comp, sig, mark });
  },
  toString: () => `composite() ${what}`,
});

export default [
  // ── perf-a1-switches: A1.1, the narrow fold ──
  { file: STAGE, need: [/ask: \(\) => veins\?\.top\?\.ask\(\), now: \(\) => veins\?\.top\?\.ask\(\), active:/, "A1.1: the stage's label hosts ask through top.ask"] },
  { file: GLASS, need: [/now: \(\) => \{ if \(live\.veins && !live\.veins\.lost\) live\.veins\.top\.ask\(\); \}/, "A1.1: the stage's glass host asks through top.ask"] },
  { file: VEINS, need: [/const PRES_FOLD = true;/, 'A1.1: the narrow fold is on'] },
  { file: VEINS, need: [/present: \(\) => present\(true, true\),/, "A1.1: top.present (the lobule's, the sinusoid's, the covers') is laid at once"] },
  { file: VEINS, need: [/setCameraRec[\s\S]{0,400}if \(!lost\) present\(true, true\);/, "A1.1: the camera's own present is the figure's"] },

  // ── A1.2: still lumens while blood flows ──
  { file: VEINS, need: [inComposite('signature has no blood clock (blood.bt), comments aside', ({ sig }) => !/blood\.bt/.test(sig.replace(/\/\/.*$/gm, ''))), "A1.2: the blood's clock is not in the still-lumens signature (no clock in the signature)"] },
  { file: VEINS, need: [inComposite('marks the rows that carry blood as moved when the clock moves', ({ mark }) => /const btNow = blood\.bt \|\| 0;\n\s+if \(btNow !== btLast && \(blood\.on \|\| blood\.chev \|\| blood\.origin\)\) for \(let r = 0; r < nTubes; r\+\+\) if \(bloodRow\[r\]\) moved\[r\] = 1;\n\s+btLast = btNow;/.test(mark)), 'A1.2: the rows that carry blood are marked moved when the clock moves'] },
  { file: VEINS, need: [inComposite('btLast = btNow comes before let same', ({ comp }) => comp.indexOf('btLast = btNow;') < comp.indexOf('let same')), 'A1.2: marked before the frame is judged still'] },
  { file: VEINS, need: [inComposite('btLast = btNow comes before moved.fill(0)', ({ comp }) => comp.indexOf('btLast = btNow;') < comp.indexOf('moved.fill(0); movedAll = false;')), 'A1.2: and before the marks are taken as drawn'] },

  // ── A1.3 ──
  { file: VEINS, forbid: [/bloodOk/, 'A1.3: no blood gate on the direct whole picture'] },
  { file: VEINS, need: [/const direct = who !== 'lobule' && !noDirect && !!own && full && !up && !camOn\(\)/, 'A1.3: a whole picture goes straight onto the canvas while blood flows too'] },
  { file: VEINS, need: [/if \(own && ownStale && !full\) full = true;/, 'A1.3: the frame after a direct one makes the kept picture again'] },

  // ── perf-gpu-present: A2 ──
  { file: ORGANS, need: [/gl\.useProgram\(moveP\.p\);\n\s+setM\(U\.toS/, "A2: the organ stack's camera move says so before it writes the whole target (program in use)"] },
  { file: ORGANS, need: [/gl\.disable\(gl\.SCISSOR_TEST\); gl\.disable\(gl\.BLEND\);\n\s+INVC\[0\] = gl\.COLOR_ATTACHMENT0; gl\.invalidateFramebuffer\(gl\.FRAMEBUFFER, INVC\);[^\n]*\n\s+gl\.useProgram\(moveP\.p\);/, "A2: the organ stack's camera move invalidates its target before it writes the whole target"] },
  { file: VEINS, need: [/gl\.bindFramebuffer\(gl\.DRAW_FRAMEBUFFER, rz\.fbo\);\n\s+if \(!own \|\| \(own\.w === rz\.w && own\.h === rz\.h\)\) noLoad\(gl\.DRAW_FRAMEBUFFER, false\);[^\n]*\n\s+gl\.blitFramebuffer\(0, 0, rz\.w, rz\.h/, 'A2: the reuse target says so before it writes the whole target'] },

  // ── A3 ──
  { file: STAGE, forbid: [/if \(OVER_ON && veins\?\.overlay\?\.stale && !veins\.lost\) veins\.present\(\);/, 'A3: no present of the overlays ahead of the draw'] },
  { file: STAGE, need: [/const overAt = OVER_ON && veins\?\.top \? veins\.top\.presents : -1;/, 'A3: the stage notes how many pictures were laid before its draw'] },
  { file: STAGE, need: [inStageFn('overAlone', /veins\?\.overlay\?\.stale && !veins\.lost && veins\.top\.presents === at\) veins\.present\(\)/), 'A3: the stage lays the overlays alone after its draw, and only if the draw laid no picture'] },
  { file: STAGE, need: [/veins\.composite\(vLook, bloodLook\(\), fluidMoved\) !== false\) \{[^\n]*\n\s+overAlone\(overAt\);\n\s+drawnView = viewVersion;/, 'A3: the overlays are laid alone after the draw and before the still key is copied'] },
  { file: STAGE, need: [/!anyReveal\(\)\) \{ overAlone\(overAt\); sleep\(\); return; \}/, 'A3: and where a still figure goes to sleep'] },

  // ── A5 ──
  { file: VEINS, need: [/function camDraw\(tex, blend, plain = false, box = null\) \{/, 'A5: camDraw cuts the camera lay with the box it is given'] },
  { file: VEINS, need: [/const sb = box \|\| \(plain \? ovBox : null\);\n\s+if \(sb\) \{ gl\.enable\(gl\.SCISSOR_TEST\); gl\.scissor\(sb\[0\], sb\[1\], sb\[2\] - sb\[0\], sb\[3\] - sb\[1\]\); \} else gl\.disable\(gl\.SCISSOR_TEST\);/, 'A5: camDraw scissors to the box it is given, or to the overlay bounds when plain'] },
  { file: VEINS, need: [/if \(ob && !camBox\(ob\)\) return;\n\s+try \{ if \(camDraw\(over\.texture, true, false, ob \? CB : null\)\) return; \} finally \{ gl\.disable\(gl\.SCISSOR_TEST\); \}/, 'A5: under a camera the overlay lay is cut to its bounds, and the scissor is switched off after'] },

  // ── D1 ──
  { file: VEINS, need: [/lowFree\(\);\n\s+if \(half\.tex\) \{[^\n]*texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA8, 1, 1,[^\n]*half\.w = half\.h = 0; \}/, "D1: the streaks' half-size target is shrunk to a texel by a trim"] },
  { file: STAGE, need: [/if \(veinsTrimmed\) \{ veinsTrimmed = false; lowWarm\(\); \}/, 'D1: the stage warms up again after a trim: shown again in the frame loop'] },
  { file: STAGE, need: [/set veinsTrimmed\(v\) \{ if \(veinsTrimmed && !v\) lowWarm\(\); veinsTrimmed = v; \}/, "D1: or by the dive's draw ahead"] },
  { file: STAGE, need: [/const \{ autoNow, easeRes, lowWarm, moveGaps,/, 'D1: the stage takes lowWarm from its parts'] },

  // ── stent-mesh ──
  { file: CSS, need: [/\.stent-cover \{[^}]*var\(--dev-ptfe\)/, 'the PTFE wash'] },
  { file: CSS, need: [/\.stent-ring \{[^}]*var\(--dev-tips-mesh\)/, 'the radiopaque ring and the end rings, in the TIPS mesh ink (a device material token)'] },
  { file: CSS, need: [/\.stent-px \{ vector-effect: non-scaling-stroke; \}/, 'a pixel floor for struts and rails'] },
  { file: VENOUS, need: [/meshPaths\(id, p, d0, d1, 1, false, tips \? tipsBare\(id\) : 0\)/, 'the whole covered mesh, built once'] },
  { file: VENOUS, need: [/d0 = tips \? ex\[0\] : /, 'unrolled from the portal end'] },
  { file: STAGE, need: [/for \(const id of \['TIPS', 'DIPS', 'C6', 'S_DSR', 'S_PC'\]\) if \(E\[id\]\) E\[id\]\.over = true;/, 'the splenorenal and portocaval shunts are in the portal tree\'s tier, so its wall is not drawn across their mouth (12 Nov 2026)'] },
];
