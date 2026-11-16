// Pins moved out of source-regex tests (B6 slimming, 15-Nov-2026): each keeps its one-line reason. Pattern gone = the code it guarded changed: look before editing the rule.
export default [
  // belly-rate-no-flash
  { file: 'src/ui/instruments.js', need: [/showRate = balanceLine\(rateEl, rateArrow, rateTxt\)/, 'the belly\'s daily balance never flashes (19 Oct): one balanceLine, no dip-and-return timer'] },
  { file: 'src/ui/instruments.js', forbid: [/ab-rate-out|rateTimer/, 'the belly\'s daily balance never flashes (19 Oct): one balanceLine, no dip-and-return timer'] },
  // cam-arc
  { file: 'src/ui/stage*', need: [/function frameBox\([\s\S]{0,700}animateVT\(to, ms, \{ arc: true, steady: !!opt\.steady, scale: !opt\.steady, slide \}\)/, 'long camera moves pull back and come in (camera recs B, 29 Oct); Reduce Motion keeps the short plain glide'] },
  { file: 'src/ui/stage*', need: [/opt\.arc && !opt\.slide && !reduceMotion\.matches/, 'long camera moves other than a slide\'s pull back and come in (camera recs B, 29 Oct); a slide\'s move never does (slide-cam.js, 16 Nov 2026: the zoom one way); Reduce Motion keeps the short plain glide'] },
  // cath-settle
  { file: 'src/ui/presenter*', need: [/later = glide && !ct && !!ui/, 'a catheter slide with a new patient changes the patient before its camera moves, the catheter then drives the view once the organs have settled'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/organsSettled: \(\) => plateOn\(\) \|\| !glWanted\(\),/, 'a catheter slide with a new patient changes the patient before its camera moves, the catheter then drives the view once the organs have settled'] },
  // causes-looks
  { file: 'styles/app-*.css', forbid: [/\.pcs-/, 'the causes chart reads no computed style and keeps no .pcs-* rule (chart looks in code, WP7) (no .pcs-* rule is left)'] },
  // cavity-spans
  { file: 'src/ui/stage*', need: [/const FLUID_R = \[284, 430, 856, 650\]/, 'the GPU fills the ascites from the cavity\'s half-width per row: FLUID_R is the ellipse the rows are cut from'] },
  // circuit-resistor-segments
  { file: 'src/ui/seg-hits.js', need: [/\bsg\.id = ln\.id;/, 'the Circuit talk, slide 2 to 3 (16 Oct crash): each segment takes its line\'s id (each segment takes its line\'s id)'] },
  // credit-art
  { file: 'src/ui/credit.js', need: [/export function organTest\(wr, ring = null, spread = null\) \{\n\s+if \(!ring\) \{ const t = worldTest\(wr, spread\); if \(t\) return t; \}\n\s+return screenTest\(wr, ring\);/, 'the corner credit\'s art test lives in the figure\'s own coordinates: a camera move reads no shape from the page'] },
  { file: 'src/ui/credit.js', need: [/if \(!world\.closest\('\.stage-view'\)\?\.classList\.contains\('gl-on'\)\) \{ artDirty = true; artJob = null; return null; \}/, 'the corner credit\'s art test lives in the figure\'s own coordinates: a camera move reads no shape from the page'] },
  // disease-pills
  { file: 'src/ui/presenter*', need: [/const \[all, lw, lk, mk, mkStop, dz, tword, val, valStop, key, term, lensBy, lensW\] = m/, 'a disease name in a teaching card is set in a pill, marked from one list (the markup regex\'s capture groups)'] },
  // doppler-stent-course
  { file: 'src/ui/doppler.js', need: [/probeName\(p\)\)\)/, 'a stent probe\'s name carries its gate (probeName(meta(), gateOf()))'] },
  { file: 'src/ui/doppler.js', need: [/probe \? probeName\(meta\(\), isStentProbe\(\) \? gateOf\(\) : ''\)/, 'a stent probe\'s name carries its gate (probeName(meta(), gateOf()))'] },
  // endo-size
  { file: 'src/ui/instruments.js', need: [/const gNow = endoGrow\(mv\.d\);/, 'the scope draws a large varix (5 mm or more) large and bulging through endoGrow (17 Oct)'] },
  // flank-mask
  { file: 'src/ui/stage*', need: [/<linearGradient id="diaFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="420">/, 'the organs\' copy for the GPU leaves the flank out: it sits under the diaphragm\'s fade, clear from y 420 down (clear from 420 down)'] },
  { file: 'src/ui/stage*', need: [/const DIA_MASK_H = 422 \+ 150;/, 'the organs\' copy for the GPU leaves the flank out: it sits under the diaphragm\'s fade, clear from y 420 down'] },
  // fluid-lumen-looks
  { file: 'src/ui/tool-fluid.js', forbid: [/getComputedStyle/, 'the fluid balance and the vessel cross-section read no computed style (chart looks in code, WP10) (tool-fluid)'] },
  { file: 'src/ui/tool-lumen.js', forbid: [/getComputedStyle/, 'the fluid balance and the vessel cross-section read no computed style (chart looks in code, WP10) (tool-lumen)'] },
  // glass-motion-translate
  { file: 'src/ui/glass-gl.js', need: [/if \(AM\.hasT\) \{ tx = AM\.tx; ty = AM\.ty; hasT = true; byProp = AM\.prop; \}/, 'an animation of the translate property moves the glass as a transform\'s does'] },
  { file: 'src/ui/glass-gl.js', need: [/if \(byProp\) \{[^}]*\} else if \(!inlineTranslate\(im, s\.translate\)\) \{ if \(inlineTranslateNew\(im, s\.translate\)\) flag\.bad = true; \} else \{ inlineTranslateOk\(im\); tx \+= im\.ux; ty \+= im\.uy; \}/, 'an animation of the translate property moves the glass as a transform\'s does'] },
  // gpu-probe
  { file: 'src/ui/frame.js', need: [/if \(gpuProbe\.on\) probed\(tag, cb, now\); else cb\(now\);/, 'the debug overlay\'s GPU readout: off, a step only runs; the name and closure are made only inside the probe'] },
  { file: 'src/ui/frame.js', need: [/function probed\(tag, cb, now\) \{\n {2}gpuProbe\.time\(null, `\$\{tag\} \(script\)`, \(\) => cb\(now\)\);/, 'the debug overlay\'s GPU readout: off, a step only runs; the name and closure are made only inside the probe (the name and the closure are made only inside the probed branch)'] },
  // input-latency
  { file: 'src/ui/frame.js', need: [/get inputToPaint\(\) \{ return inputMeasure\(\); \}/, 'input to first change (recs R2): inputToPaint is the scheduler\'s own measure (perf().inputToPaint)'] },
  { file: 'src/ui/frame.js', need: [/ask: \(fn\) => finalFrame\(fn, 'input'\)/, 'input to first change (recs R2): inputToPaint is the scheduler\'s own measure (its frames come from the scheduler)'] },
  // join-room
  { file: 'src/ui/stage*', need: [/const out = b && Math\.hypot\(j\.x - b\.x, j\.y - b\.y\) \+ j\.reach > b\.r;\n\s+let c = b;\n\s+if \(!b\) joinBin\.set\(k, c = \{ x: j\.x, y: j\.y, r: Math\.ceil\(Math\.max\(j\.reach \* 1\.5, 0\) \/ 2\) \* 2 \+ 8 \}\);\n\s+else if \(out\) \{ b\.x = j\.x; b\.y = j\.y; b\.r = Math\.ceil\(Math\.max\(j\.reach \* 1\.5, b\.r \* 1\.5\) \/ 2\) \* 2 \+ 8; \}/, 'a join easing wider inside its binning circle keeps its cells: the binning is patched in place, not made again whole'] },
  { file: 'src/ui/stage*', need: [/const J = veinJoins\(items\), smooth = smoothRunOn\(items\);\n\s+joinRoom\(J, items\);/, 'a join easing wider inside its binning circle keeps its cells: the binning is patched in place, not made again whole'] },
  // key-chevron-lanes
  { file: 'src/ui/stage*', need: [/keyChevron\(EDGES\[k\], laneOpen\)/, 'the key\'s chevron lanes come from keyChevron, no KEY_IDS list'] },
  // look-signature
  { file: 'src/ui/stage*', need: [/const lookDiffers = lookChanged\(vl, (?:live\.)?(?:live\.)?plateOn\(\), LOOK_SIG\);/, 'the vessel look\'s signature (look-sig.js) sees every number the old JSON text did: no JSON.stringify of the look'] },
  { file: 'src/ui/stage*', forbid: [/JSON\.stringify\((?:live\.)?vLook/, 'the vessel look\'s signature (look-sig.js) sees every number the old JSON text did: no JSON.stringify of the look'] },
  // organ-art-lite
  { file: 'src/ui/stage*', need: [/onFigLab\(\(k\) => \{ if \(k === 'lightArt'\) syncArtLite\(\); \}\);\n {2}if \(figLab\('lightArt'\)\) syncArtLite\(\);/, 'lighter organ art (off by default) syncs with its Settings switch'] },
  // organ-paint-job
  { file: 'src/ui/stage*', need: [/const roomW = (?:live\.)?(?:live\.)?picNow \? (?:live\.)?(?:live\.)?picNow\[0\] : vCanvas\.width, roomH = (?:live\.)?(?:live\.)?picNow \? (?:live\.)?(?:live\.)?picNow\[1\] : vCanvas\.height;[^\n]*\n\s+const room = targetRoom\(roomW, roomH\);/, 'the painter\'s room is the picture\'s size, so a picture is cut at the size it will be drawn'] },
  { file: 'src/ui/stage*', need: [/room \/ \(Math\.max\(1, roomH\) \* \(x1 - x0\)\), room \/ \(Math\.max\(1, roomW\) \* \(y1 - y0\)\)\);/, 'the painter\'s room is the picture\'s size, so a picture is cut at the size it will be drawn'] },
  // plane-callouts
  { file: 'styles/app-*.css', need: [/\.pze-planewrap\.pze-nokey > \.pze-key \{ display: none; \}/, 'the HVPG against PPG plane: no key beside it on a Mac or iPad, an iPhone keeps the key under it (no key beside the plot)'] },
  { file: 'styles/app-*.css', need: [/\.pz\.stack \.pze-planewrap\.pze-nokey > \.pze-key \{ display: block; \}/, 'the HVPG against PPG plane: no key beside it on a Mac or iPad, an iPhone keeps the key under it (an iPhone keeps the key under it)'] },
  // plane-looks
  { file: 'src/ui/visual-plane.js', forbid: [/getComputedStyle/, 'the plane reads no computed style and keeps no .pze-* model rule (chart looks in code, WP9) (the plane asks the page for no style)'] },
  { file: 'styles/app-*.css', forbid: [/\.pze-(zone|zt|box|cut|diag|grid|axis|dt|ln|t|ax|pt|lead|path|was|ring|halo|dot|trail|walk|stop|sn)\b/, 'the plane reads no computed style and keeps no .pze-* model rule (chart looks in code, WP9) (the model pieces\' rules are gone from the stylesheet)'] },
  // rise-path
  { file: 'src/ui/stage*', need: [/if \((?:live\.)?(?:live\.)?riseLine\) \{ diveFrom\[0\] = (?:live\.)?(?:live\.)?diveLand\.x; diveFrom\[1\] = (?:live\.)?(?:live\.)?diveLand\.y; diveTo\[0\] = ox; diveTo\[1\] = oy; const c = riseCentre\(diveFrom, diveTo, Math\.exp\(-lt\), Math\.exp\(z - lt\)\); px = c\[0\]; py = c\[1\]; \}\n\s*else \{ px = lerp\(ox, (?:live\.)?(?:live\.)?diveLand\.x, g\); py = lerp\(oy, (?:live\.)?(?:live\.)?diveLand\.y, g\); \}/, 'out of a zoomed-in lobule the camera pulls straight out toward the next view, with no sideways pan'] },
  { file: 'src/ui/stage*', need: [/\} else if \(!on && (?:live\.)?diveT >= 1\) \{\n\s+(?:live\.)?riseLine = true;/, 'out of a zoomed-in lobule the camera pulls straight out toward the next view, with no sideways pan (set as any way out of the landed lobule begins)'] },
  // stop-tokens
  { file: 'src/ui/organ-paint.js', need: [/import \{ STOPS, STOPS_CMAP, STOP_LOOK \} from '\.\/stop-tokens\.js';/, 'the organ painter takes its gradient stops from the generated table, never a style read'] },
  // trace-labels
  { file: 'src/ui/talk-trace.js', forbid: [/rotate\(/, 'the event labels of a talk-so-far chart are level over the plot, each time point named once (no slanted or upright words)'] },
  { file: 'src/ui/talk-trace.js', need: [/'data-look': 'talk\.stage'/, 'the event labels of a talk-so-far chart are level over the plot, each time point named once (the stage names, level)'] },
  // veins-relay
  { file: 'src/ui/stage*', need: [/binMemo\.relay = true;/, 'binVeins with room in its cells\' lists writes a changed vessel in place (memo.relay)'] },
  { file: 'src/ui/veins-gl.js', need: [/for \(const c of bins\.patchCells\) if \(!patchMark\[c\]\) \{ patchMark\[c\] = 1; patchK\+\+; \}\n\s+rowCells = null;/, 'binVeins with room in its cells\' lists writes a changed vessel in place (memo.relay)'] },
  // worker-recovery-b20-b22
  { file: 'src/ui/stage*', need: [/createSweepClient\(/, 'a failed sweep worker is dropped and replaced or bypassed (B20)'] },
  { file: 'src/ui/stage*', forbid: [/mt\.worker/, 'a failed sweep worker is dropped and replaced or bypassed (B20)'] },
];
