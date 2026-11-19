// GPU memory fixes (bible review 19 Nov 2026, GPU-1, GPU-5, GPU-9, GPU-13): source shapes moved out of tests (PR-02), each with its reason. Behaviour is tested in
// tests/chart-pictures-held.test.js, tests/keep-screen.test.js, tests/chart-ink-and-look-resets.test.js and tests/trace-gl-own-cap.test.js.
export default [
  // GPU-1: the chart pool's size classes are each a context; a fourth is a fourth context on the phone closest to its memory limit.
  { file: 'src/ui/trace-gl.js', need: [/const pools = \[null, null, null\];/, 'three chart pools by size class (card, screen-size, readouts); a fourth kind is a deliberate change that also moves tests/gpu-journeys.test.js and docs/gpu-practices.md'] },
  { file: 'src/ui/trace-gl.js', exactly: [/\bmakePool\(/, 3, 'makePool is defined once and called for the first pool and for a size class when it is first asked for: no other place makes a pool'] },
  { file: 'src/ui/trace-gl.js', need: [/kind === 'big' \? 1 : kind === 'small' \? 2 : 0/, 'the three pool kinds map to their three slots'] },
  // GPU-5: the one place the figure canvas is resized gives the canvas the kept picture when it does not draw the figure again in that task.
  { file: 'src/ui/stage-res.js', need: [/drawVeins\(false, 'resize'\); live\.veins\?\.showNow\?\.\(\); \}\s*(\/\/[^\n]*\n\s*)*else live\.veins\?\.screenResized\?\.\(\);/, 'a resize that does not draw the figure again in its task carries the kept screen into the new size and shows it (a cleared canvas for a paint is the lobule\'s blank frame)'] },
  { file: 'src/ui/veins-gl.js', need: [/screenResized\(\) \{ if \(screenKeep && !lost\) screenKeep\.resized\(\); \}/, 'the renderer hands the resize to its kept screen'] },
  // GPU-9: a change of look drops the labels' cached default leader and dot inks.
  { file: 'src/ui/label-gl.js', need: [/let defLine = null, defDot = null, PIN_LINE0 = null, PIN_DOT0 = null;\s*const themeNow = \(\) => \{ if \(disposed\) return; defLine = defDot = PIN_LINE0 = PIN_DOT0 = null;/, 'the four default inks are declared before themeNow and it clears them, or a leader that falls back to the default keeps the old look\'s ink (a pale ring on a dark stage)'] },
  // GPU-13: the glass wakes for a transition elsewhere only where it can move or resize a glass.
  { file: 'src/ui/glass-gl.js', need: [/const docStart = \(e\) => \{ if \(paintOnly\(e\)\) return;/, 'a repaint-only transition elsewhere does not wake the glass'] },
  { file: 'src/ui/glass-gl.js', need: [/const docEnd = \(e\) => \{ if \(paintOnly\(e\)\) return;/, 'nor read every glass box again as it ends'] },
  { file: 'src/ui/glass-gl.js', scan: (t) => {
    const m = /const PAINT_ONLY = (\/.*\/);/.exec(t);
    if (!m) return ['the list of repaint-only properties (PAINT_ONLY) is gone'];
    const re = new RegExp(m[1].slice(1, -1));
    return ['width', 'height', 'margin-left', 'top', 'left', 'padding', 'font-size', 'flex-basis', '--pz-u', 'inset', 'max-height', 'gap'].filter((p) => re.test(p)).map((p) => `${p} can move or resize a glass and must not be in the repaint-only list`)
      .concat(['opacity', 'color', 'background-color', 'box-shadow', 'transform', 'filter'].filter((p) => !re.test(p)).map((p) => `${p} only repaints and belongs in the list`));
  } },
  // GPU-6: no synchronous GL object or state query in a frame (setup calls are listed).
  { file: ['src/ui/trace-gl.js', 'src/ui/field-gl.js', 'src/ui/glass-gl.js'], forbid: [/\.is(Texture|Framebuffer|Renderbuffer|Buffer|Program|Shader|Enabled|VertexArray)\(/, 'gl.is* is a synchronous driver round trip in Safari: keep the context generation (glGen, the pool\'s gen) or read the record (glOn)'] },
];
