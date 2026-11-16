// Pins moved out of source-regex tests (B6 slimming, 15 Nov 2026): each keeps its one-line reason. Pattern gone = the code it guarded changed: look before editing the rule.
export default [
  // blood-cells
  { file: 'src/ui/stage*', need: [/const reachOf = \(it\) => Math\.ceil\(\(it\.obj\.glMaxR \+ \(it\.x\.wallPx \|\| 1\) \+ 18\) \/ 2\) \* 2;/, 'A frame where only the blood moved repaints only the cells a lumen can reach (binVeins\' `blood`)'] },
  { file: 'src/ui/stage*', need: [/const core = reach - 18 \+ BLOOD_PAD;/, 'A frame where only the blood moved repaints only the cells a lumen can reach (binVeins\' `blood`)'] },
  { file: 'src/ui/stage*', need: [/o\.reach = reach \+ a\.m; o\.core = core \+ a\.m;/, 'A frame where only the blood moved repaints only the cells a lumen can reach (binVeins\' `blood`)'] },
  { file: 'src/ui/veins-gl.js', need: [/for \(let c = 0; c < nCells; c\+\+\) if \(mt\.mark\[c\] && !mark\[c\]\) \{ mark\[c\] = 1; k\+\+; \}\n(?:.*\n)*?\s*if \(k\) uploadPart\(mark\);\n\s*this\.composite\(look, blood, full, k\);/, 'A frame where only the blood moved repaints only the cells a lumen can reach (binVeins\' `blood`)'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(part && partG\) \{ gl\.bindVertexArray\(partVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, partG\); \}/, 'A frame where only the blood moved repaints only the cells a lumen can reach (binVeins\' `blood`)'] },
  { file: 'src/ui/veins-gl.js', need: [/function uploadPart\(mark\) \{\n\s*const \{ gen, nGen: g \} = splitCells\(cellsCPU, nCells, null, mark, PART_SPLIT\);/, 'A frame where only the blood moved repaints only the cells a lumen can reach (binVeins\' `blood`)'] },
  // blur-gauge
  { file: 'src/ui/glass-gl.js', need: [/why\(el\) \{/, 'Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-'] },
  { file: 'src/ui/stage*', need: [/const frostOn = \(\) => !frostWhy\(\);/, 'Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-'] },
  { file: 'src/ui/stage*', need: [/why: frostWhy/, 'Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-'] },
  { file: 'src/ui/stage*', need: [/const blurWhy = /, 'Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-'] },
  { file: 'src/ui/stage*', need: [/\n {4}blurWhy,\n/, 'Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-'] },
  { file: 'src/ui/perf-readout.js', need: [/scanBlurs\(document/, 'Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-'] },
  // callouts
  { file: 'src/ui/presenter*', need: [/forEach\(\(g0, i\) => \{ for \(const g of Array\.isArray\(g0\) \? expandIds\(g0\) : \[g0\]\)/, 'Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js) (the presenter lights a group at its entry\'s moment)'] },
  { file: 'src/ui/stage*', need: [/if \(g\.group && mids\.length > 1\) \{ fans = mids;/, 'Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js) (a group\'s number stands between its vessels)'] },
  { file: 'src/ui/stage*', need: [/\.\.\.nearFar\(near\)\.map\(\(ps\) => \(\{ \.\.\.ps, fans \}\)\)[^\n]*\.\.\.nearFar\(near\)\]/, 'Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js) (its leaders keep clear first, and it never vanishes)'] },
  { file: 'src/ui/stage*', need: [/k: `lf:\$\{it\.key\}:\$\{j\}`/, 'Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js) (one leader to each vessel)'] },
  { file: 'src/ui/decks/prehepatic.js', need: [/mark: \{ edges: \['PV_TRUNK'\], clot: true \}/, 'Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js)'] },
  { file: 'src/ui/decks/prehepatic.js', forbid: [/label: 'Partial clot'/, 'Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js)'] },
  // cath-pill
  { file: 'src/ui/stage*', need: [/if \(first \|\| \(calm && !pillsClear\(q\)\)\) \{[\s\S]*?placePillsInto\(q, cathSideOut\);/, 'The HVPG catheter\'s two readings (cath-pill.js) never sit on a card, the top sheet or each other (2 Nov 2026, his ask'] },
  { file: 'src/ui/stage*', need: [/calm = !(?:live\.)?(?:live\.)?vtGliding && !cath\.glideRaf;/, 'The HVPG catheter\'s two readings (cath-pill.js) never sit on a card, the top sheet or each other (2 Nov 2026, his ask'] },
  { file: 'src/ui/stage*', need: [/if \(ready\) \{ const q = cathGlide\(el, bx, by, x, y\); cx = q\[0\]; cy = q\[1\]; \} else el\._gl = null;/, 'The HVPG catheter\'s two readings (cath-pill.js) never sit on a card, the top sheet or each other (2 Nov 2026, his ask'] },
  { file: 'styles/app-*.css', need: [/\.cath-label\.cath-js, \.cath-label\.cath-js\[data-at="ahead"\], \.cath-label\.cath-js\[data-at="ahead"\]\.above \{ translate: -50% var\(--pre, 0px\); \}/, 'The HVPG catheter\'s two readings (cath-pill.js) never sit on a card, the top sheet or each other (2 Nov 2026, his ask'] },
  // clot-shape
  { file: 'src/ui/stage*', need: [/q\[0\] - ln\[i\]\[0\] \* side \* r/, 'The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen.'] },
  { file: 'styles/app-*.css', need: [/\.thrombus-halo \{ fill: var\(--thrombus\); fill-opacity: \.[0-9]+; \}/, 'The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen. (thrombus-halo)'] },
  { file: 'styles/app-*.css', need: [/\.thrombus \{ fill: var\(--thrombus\); fill-opacity: \.[0-9]+; \}/, 'The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen. (thrombus)'] },
  { file: 'styles/app-*.css', need: [/\.thrombus-core \{ fill: var\(--thrombus\); fill-opacity: \.[0-9]+; \}/, 'The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen. (thrombus-core)'] },
  { file: 'styles/app-*.css', need: [/\.thrombus-edge \{[^}]*stroke: var\(--thrombus-edge\)/, 'The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen.'] },
  // coil-bin-reach
  { file: 'src/ui/stage*', need: [/const wigE = !!g && g\.wigT != null && g\.wig !== g\.wigT, sprE = !!g && it\.kind === 's' && g\.sprT != null && \(g\.spr \?\? 1\) !== g\.sprT;\n\s+if \(!wigE && !sprE\) \{ binFrom\.delete\(it\.row\); o\.bin = null; o\.reach = reach; o\.core = core; return o; \}/, 'A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must st'] },
  { file: 'src/ui/stage*', need: [/m: Math\.ceil\(\(wigE \? Math\.abs\(g\.wigT - g\.wig\) \* 2 : 0\) \+ \(sprE \? Math\.abs\(it\.obj\.off \|\| 0\) \* Math\.abs\(g\.sprT - \(g\.spr \?\? 1\)\) \* 2\.4 : 0\) \+ 1\) \/ 2/, 'A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must st'] },
  { file: 'src/ui/stage*', need: [/g\.sprT = sprT;/, 'A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must st'] },
  { file: 'src/ui/stage.js', need: [/if \(far > a\.m\) a = null;/, 'A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must st (a strand moved past the margin is binned again)'] },   // (was a slice of the file)
  { file: 'src/ui/stage.js', need: [/o\.bin = a\.pts; o\.reach = reach \+ a\.m; o\.core = core \+ a\.m;\n\s+return o;/, 'A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must st'] },   // (was a slice of the file)
  // credit-cath-shaft
  { file: 'src/ui/stage*', need: [/cathBoxes\(\) \{\s*const st = cath\.st, r = st && cathRoute\(\);/, 'The corner credit stood on the catheter\'s shaft (HVPG 2, an iPhone held sideways'] },
  { file: 'src/ui/credit.js', need: [/window\.pps\?\.stage\?\.cathBoxes\?\.\(\)/, 'The corner credit stood on the catheter\'s shaft (HVPG 2, an iPhone held sideways'] },
  { file: 'src/ui/credit.js', need: [/\.\.\.cathBars\]\.filter\(\(o\) => o && hit\(o, fig\)\)/, 'The corner credit stood on the catheter\'s shaft (HVPG 2, an iPhone held sideways'] },
  { file: 'src/ui/credit.js', need: [/b: Math\.ceil\(q\.b \/ GRID\) \* GRID, chrome: true/, 'The corner credit stood on the catheter\'s shaft (HVPG 2, an iPhone held sideways'] },
  // deck-review-bugs
  { file: 'src/ui/presenter*', need: [/liveSettled\(now - t0, now - still\)/, 'Three bugs from the external deck review (18 Oct)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/stepSpray\(dt\);/, 'Three bugs from the external deck review (18 Oct)'] },
  { file: 'src/ui/stage*', need: [/!plateEasing\(\) && !sprayFading\(\)/, 'Three bugs from the external deck review (18 Oct)'] },
  { file: 'src/ui/stage*', need: [/fadeBleedShapes\(bleedShapes\((?:live\.)?sprayLast\.bleed/, 'Three bugs from the external deck review (18 Oct)'] },
  // engine-crash
  { file: 'src/ui/main.js', need: [/host\.on\('crash'/, 'An engine that throws, or whose numbers stop being numbers, stops the clock and says so once (\'crash\'), keeps'] },
  { file: 'src/ui/main.js', need: [/'The model stopped\. Reload, or restart this patient\.'/, 'An engine that throws, or whose numbers stop being numbers, stops the clock and says so once (\'crash\'), keeps'] },
  { file: 'src/ui/main.js', need: [/\['Restart patient', \(\) => restartPatient\(\)\], \['Reload', \(\) => location\.reload\(\)\]/, 'An engine that throws, or whose numbers stop being numbers, stops the clock and says so once (\'crash\'), keeps'] },
  { file: 'src/ui/host.js', need: [/w\.onerror = \(e\) => \{ e\.preventDefault\?\.\(\); crashed\(/, 'An engine that throws, or whose numbers stop being numbers, stops the clock and says so once (\'crash\'), keeps (an uncaught worker error after start-up is a crash)'] },
  // ext-review-fixes
  { file: 'src/ui/timeline.js', need: [/clearTimeout\(pending\.timer\);\s*pending = null;/, 'External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c (a flush cancels its own timer)'] },   // (was a slice of the file)
  { file: 'src/ui/timeline.js', need: [/if \(pending\) clearTimeout\(pending\.timer\);\s*tlGen\+\+;/, 'External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c (a reset cancels it and starts a new history)'] },   // (was a slice of the file)
  { file: 'src/ui/timeline.js', need: [/if \(pending && mine === editSeq\) flushParams\(\)/, 'External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c (a timer of an older edit does not flush the newer one)'] },
  { file: 'src/ui/timeline.js', need: [/later\(\(\) => snapInto\(e\), 80\)/, 'External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c'] },
  { file: 'src/ui/timeline.js', need: [/later\(\(\) => snapInto\(e\), 120\)/, 'External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c'] },
  { file: 'src/ui/timeline.js', need: [/if \(g !== tlGen\) return;/, 'External review of 96b8354 (3 Nov 2026): EXT-ENG-1, EXT-WRK-1, EXT-WRK-2, EXT-WRK-3, EXT-HIS-1 (EXT-CLK-1 is c (a snapshot that comes back after a reset is not published)'] },
  // fact-target
  { file: 'src/ui/chart.js', need: [/const go = !undo && factTarget\(a\.key\);/, 'U14: every "About this patient" fact a built-in patient comes with either opens a real vessel or organ, or is'] },
  { file: 'src/ui/chart.js', need: [/class: 'chg-go'/, 'U14: every "About this patient" fact a built-in patient comes with either opens a real vessel or organ, or is'] },
  { file: 'src/ui/chart.js', need: [/onclick: \(\) => reveal\(go\) \}/, 'U14: every "About this patient" fact a built-in patient comes with either opens a real vessel or organ, or is'] },
  { file: 'src/ui/main.js', need: [/reveal: \(sel\) => \{ closeTreat\(\); select\(sel\); \},/, 'U14: every "About this patient" fact a built-in patient comes with either opens a real vessel or organ, or is'] },
  // fen-place
  { file: 'src/ui/sinusoid-view.js', need: [/import \{ placeFenDisse \} from '\.\/fen-place\.js';/, 'The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/PFD\.lo = \(VW\.f\.l - VW\.tC\[0\] \+ 6\) \/ tk; PFD\.hi = \(VW\.f\.r - VW\.tC\[0\] - 6\) \/ tk;/, 'The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis) (the resting frame (tC), not the eased one)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/PFD\.fp = 16 \/ tk;/, 'The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis) (in the resting scale)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/const tk = VW\.tk, hsHalf = hs\.w \/ 2 \/ tk, hsx = hs\.x, hshalf = hs\.half;/, 'The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/leader\('fen', rf, xp, -\(halfW\(xp\) \+ UM\.endo \* 0\.5\)\);/, 'The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/xp = fenAt\(pickTags\(0\.6\)\); rf = fenR\(xp, 0\);/, 'The Fenestrae callout on a wide sinusoid view (Mohammad, 27 Oct, screenshot of Sinusoid 4/9, cirrhosis)'] },
  // fibrous-band-ends
  { file: 'src/ui/lobule-paint.js', need: [/bandOutlineFlat\(c, P, N, Wd, k, Math\.min\(k, 1\.45\)\)/, 'The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e'] },
  { file: 'src/ui/lobule-paint.js', need: [/PASS_K = \[2\.1, 1\.45, 1\], PASS_A = \[0\.12, 0\.24, 0\.5\]/, 'The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e'] },
  { file: 'src/ui/tissue-gl.js', need: [/vec4 l = textureGrad\(uW, w, gx, gy\) \* uWMix\.x;\n\s+if \(uWMix\.y > 0\.0\) l \+= textureGrad\(uWO, w, gx, gy\) \* uWMix\.y;/, 'The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e'] },
  { file: 'src/ui/tissue-gl.js', need: [/UC\.f2\(U\.uWMix, old \? wMix : 1, old \? 1 - wMix : 0\);/, 'The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e (u new + (1 - u) old)'] },
  { file: 'src/ui/lobule-zoom*', need: [/A\.wo = crossfading \? worldOld : null; A\.woVer = worldOld\.ver \|\| 0; A\.wMix = crossfading \? xfU\(xfT0, xfNow\(now\)\) : 1;/, 'The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e'] },
  { file: 'src/ui/lobule-zoom*', forbid: [/drawImage\(worldOld/, 'The fibrous bands of cirrhosis end in round caps, so where they meet at a portal tract they blend instead of e'] },
  // fingerprint
  { file: 'src/worker-core.js', need: [/fingerprintOf\(m,/, 'One fingerprint (engine/fingerprint.js) for the worker\'s slide states and the presenter\'s live model during a time-lapse.'] },
  { file: 'src/ui/presenter*', need: [/const liveFp = \(fr\) => fingerprintOf\(/, 'One fingerprint (engine/fingerprint.js) for the worker\'s slide states and the presenter\'s live model during a time-lapse.'] },
  { file: 'src/worker-core.js', forbid: [/pvFlow: m\.pvFlowMean/, 'One fingerprint (engine/fingerprint.js) for the worker\'s slide states and the presenter\'s live model during a time-lapse.'] },
  { file: 'src/ui/presenter*', forbid: [/pvFlow: m\.pvFlowMean/, 'One fingerprint (engine/fingerprint.js) for the worker\'s slide states and the presenter\'s live model during a time-lapse.'] },
  // flow-judge
  { file: 'src/engine/events.js', need: [/FLOW_CUTS\.stasis\b/, 'One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js).'] },
  { file: 'src/ui/table-marks.js', need: [/FLOW_CUTS\.stasis\b/, 'One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js).'] },
  { file: 'src/ui/stage.js', forbid: [/best < 9/, 'One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js).'] },
  { file: 'src/ui/a11y.js', forbid: [/< 9\b/, 'One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js).'] },
  { file: 'src/ui/doppler.js', forbid: [/\ba < (1|9)\b/, 'One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js).'] },
  // fork-joins
  { file: 'src/ui/vein-joins.js', need: [/import \{ nodeJoinsInto, newJoinAnswer \} from '\.\/fork-joins\.js/, 'A pair of members, order-free. Splenic vein from the right, on to the left'] },
  { file: 'src/ui/vein-joins.js', need: [/nodeJoinsInto\(PEND, nu, OUT\)/, 'A pair of members, order-free. Splenic vein from the right, on to the left'] },
  { file: 'src/ui/vein-joins.js', need: [/e\.strand = it\.kind === 's'/, 'A pair of members, order-free. Splenic vein from the right, on to the left'] },
  { file: 'src/ui/stage*', need: [/import \{ (?:flareScale, )?sideEndScale \} from '\.\/fork-joins\.js/, 'A pair of members, order-free. Splenic vein from the right, on to the left'] },
  // glass-gpu-mask
  { file: 'src/ui/glass-gl.js', forbid: [/getContext\('2d'\)|Path2D/, 'The glass\'s masks and colours with no canvas 2D (1 Nov 2026, Mohammad'] },
  { file: 'src/ui/glass-gl.js', need: [/G\.blendFuncSeparate\(G\.ONE_MINUS_DST_COLOR, G\.ZERO, G\.ONE_MINUS_DST_ALPHA, G\.ZERO\);/, 'The glass\'s masks and colours with no canvas 2D (1 Nov 2026, Mohammad (filled by parity)'] },
  { file: 'src/ui/glass-gl.js', need: [/parseCssColor\(k\)/, 'The glass\'s masks and colours with no canvas 2D (1 Nov 2026, Mohammad (any colour, in sRGB, worked out in script (css-color.js))'] },
  { file: 'src/ui/glass-gl.js', forbid: [/createElement\('i'\)|probe\.style/, 'The glass\'s masks and colours with no canvas 2D (1 Nov 2026, Mohammad (no probe element is written to or read back)'] },
  { file: 'src/ui/glass-gl.js', between: ['  function nowGeo(list) {', '  // While a callout shows, every frame'], forbid: [/resolveColour/, 'The glass\'s masks and colours with no canvas 2D (1 Nov 2026, Mohammad (never in a frame)'] },   // (was a slice of the file)
  // heat-once-a-frame
  { file: 'src/ui/instruments.js', need: [/const drawFrame = lateFrameFor\('instruments'\);/, 'Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work.'] },
  { file: 'src/ui/instruments.js', need: [/if \(framePhase\(\) === 'early'\) \{ last = lastS; lastS\.f = f; lastS\.vx = vx; if \(!raf\) raf = drawFrame\(redraw\); return; \}\n\s+draw\(f, vx\);/, 'Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work.'] },
  { file: 'src/ui/instruments.js', need: [/const redraw = \(\) => \{ raf = 0; if \(last\) draw\(last\.f, last\.vx\); \};/, 'Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work.'] },
  { file: 'src/ui/instruments.js', forbid: [/nextFrame\(/, 'Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work. (every follow-up draw on the same late callback)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/const askAnimate = \(\) => \{ if \(!animRaf\) animRaf = drawFrame\(animate\); \};\n\s+function animate\(now\) \{\n\s+animRaf = 0;/, 'Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work.'] },
  // hidden-levels-follow
  { file: 'src/ui/stage-tubes.js', need: [/if \(under\) \{ followHidden\(f\); return; \}/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-tubes.js', need: [/(?:live\.)?easeLiver\(f, p, dt\)/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-tubes.js', need: [/fluidTarget\((?:live\.)?(?:live\.)?ascTarget, f\.slow\.ascites\)/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-tubes.js', need: [/fluidSpringFor\(/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-tubes.js', need: [/if \(hid\.at\) \{ followHidden\(f\);/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-tubes.js', need: [/(?:live\.)?(?:live\.)?plateStale = true/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-plate.js', need: [/const drop = themed \|\| \(stale && !liveNow\);\n\s+if \(drop && (?:live\.)?(?:live\.)?(?:live\.)?veins\.hasPlate\(0\)\)/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  { file: 'src/ui/stage-diaphragm.js', need: [/easeLiver\(f, p, Math\.min\(0\.1, \(performance\.now\(\) - (?:live\.)?(?:live\.)?lvAt\) \/ 1000\)\)/, 'A patient changed while the lobule or the sinusoid covers the anatomy'] },   // (was a slice of the file)
  // idle-rest
  { file: 'src/ui/main.js', need: [/idleRest = createIdleRest\(\{ after: REST_AFTER_MS, canRest: \(\) => false, onInput: noteInput \}\);/, 'the chevrons never slow down at random (13 Nov): one idle-rest, no talk-rest timers'] },
  { file: 'src/ui/main.js', forbid: [/TALK_REST_MS|presenter\.idle|stage\.rest\(true\)|visible: false \}\); \}/, 'the chevrons never slow down at random (13 Nov): one idle-rest, no talk-rest timers'] },
  { file: 'src/ui/stage*', need: [/const REST_IN_S = 1\.5, REST_OUT_S = 0\.4;/, 'the chevrons never slow down at random (13 Nov): one idle-rest, no talk-rest timers'] },
  { file: 'src/ui/stage*', need: [/if \(!st\.running \|\| reduceMotion\.matches \|\| (?:live\.)?restStill\(\)\) return false;/, 'the chevrons never slow down at random (13 Nov): one idle-rest, no talk-rest timers'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?bloodClock = \((?:live\.)?bloodClock \+ dt \* (?:live\.)?restK\) % 10000;/, 'the chevrons never slow down at random (13 Nov): one idle-rest, no talk-rest timers'] },
  // label-build-sweep
  { file: 'src/ui/stage-label-layer.js', need: [/renderBlock\(it\);\s*\}\s*[^]*lateQueue\.now\(\);[^]*labelGlSync\?\.\(\);\s*\}/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late) (the queue is applied before the pass ends, then the built labels go to the GPU (review #3))'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/const lateQueue = createLateQueue\(\(op, a, b\) => lateRun\(op, a, b\), restPass, cancelRest\);/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?laidFrame = (?:live\.)?frameNo; blockWant\.clear\(\);\s*for \(const it of out\) renderBlock\(it\);/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },
  { file: 'src/ui/stage-label-layer.js', need: [/b\.seen = (?:live\.)?laidFrame;[^]*b\.seen = (?:live\.)?laidFrame;/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },   // (was a slice of the file)
  { file: 'src/ui/stage-label-layer.js', forbid: [/\.seen = (?:live\.)?frameNo/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/import \{ dropLabel \} from '\.\/drop-label\.js';/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },
  { file: 'src/ui/stage*', forbid: [/function dropLabel\(/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },
  { file: 'src/ui/stage*', need: [/if \(cath\.made\) for \(const el of cath\.made\.values\(\)\) dropLabel\(el\)/, 'The label pool\'s deferred builds (stage.js blockBuild, renderBlock, late)'] },
  // ladder-pills
  { file: 'src/ui/tool-profile.js', need: [/class: 'ppf-pill', 'data-rate': rate, 'data-k': k, opacity: 0/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/toneOf\(RATES\[k\]\(v\)\)/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/RATES = \[hvpgRate, ppgRate\]/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/setWords\(q\.val, numWords\(v, 0\)\)/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/const gx = at \? glideX\(at, t\) : box\[0\]/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/blkOp\(pillK, t\)/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/t - pillK\.t0 < FADE_MS/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  { file: 'src/ui/tool-profile.js', need: [/const brk = null;\n\s*const g = profileGeo\(w, hh, f, tw, false, spans\), s = numberSides\(g, tw, goal\), pl = placePills\(g, tw, goal, hl, bf, s\);/, 'The Gut to heart ladder\'s two pills, HVPG and PPG, in the plot\'s top right (Mohammad, 22 Oct'] },
  // lesion-ease
  { file: 'src/ui/stage*', need: [/const pRaw = f\.viewParams \|\| st\.params, p = lesions\.view\(pRaw, dtW, reduceMotion\.matches\);/, 'A narrowing and a clot are drawn as they follow the params in a moment, not whole in one frame (src/ui/lesion-ease.js'] },
  { file: 'src/ui/stage*', need: [/if \(lesions\.differs\(pRaw\)\) (?:live\.)?(?:live\.)?widthEasing = true;/, 'A narrowing and a clot are drawn as they follow the params in a moment, not whole in one frame (src/ui/lesion-ease.js'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?catchUp \|\| bandsMoving\(\) \|\| lesionsMoving\(\)\) return false;/, 'A narrowing and a clot are drawn as they follow the params in a moment, not whole in one frame (src/ui/lesion-ease.js'] },
  { file: 'src/ui/stage*', need: [/bandsMoving\(\) \|\| lesionsMoving\(\) \|\| anyReveal\(\) \|\| visWidthMoving\(\)\) return false;/, 'A narrowing and a clot are drawn as they follow the params in a moment, not whole in one frame (src/ui/lesion-ease.js'] },
  // lobule-dive-rim
  { file: 'src/ui/lobule-zoom*', need: [/const rt = R \* 0\.1;/, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas'] },
  { file: 'src/ui/lobule-paint.js', need: [/rt = G\.rt \* \(0\.8 \+ 0\.9 \* gp\)/, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas'] },
  { file: 'src/ui/lobule-paint.js', need: [/fibrousCuff\(c, x, y, rt \* 0\.62, rt \* 1\.08, PRE, gp\)/, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas'] },
  { file: 'src/ui/tissue-gl.js', need: [/if \(uRim\.w > 0\.0\) \{ float f = clamp\(\(uRim\.w - length\(p - uRim\.xy\)\) \/ max\(uRim\.w - uRim\.z, 1e-6\), 0\.0, 1\.0\); o = o \* f \+ own \* \(1\.0 - f\); \}/, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas (tissue × keep + own × (1 − keep))'] },   // (was a slice of the file)
  { file: 'src/ui/lobule-zoom*', need: [/rimOut\[0\] = x \* kx; rimOut\[1\] = y \* ky; rimOut\[2\] = r \* k \* DIVE_RIM\.solid; rimOut\[3\] = r \* k \* DIVE_RIM\.clear;/, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas (at the rim\'s own radii)'] },
  { file: 'src/ui/lobule-zoom*', forbid: [/maskImage/, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas'] },
  { file: 'src/ui/lobule-zoom*', forbid: [/function diveCopy\(|worldAt = /, 'the lobule dive rim is composited on the GPU (tissue shader), never with a mask image or a copy canvas'] },
  // long-frame-log
  { file: 'src/ui/perf-text.js', need: [/none answered yet/, 'The ?perf long-frame log and the slowest inputs (recs P4, R2)'] },   // (was a slice of the file)
  { file: 'src/ui/perf-readout.js', need: [/watchFrames\(frameLog\.add\)/, 'The ?perf long-frame log and the slowest inputs (recs P4, R2) (the log is fed by the scheduler, not a loop of its own)'] },
  { file: 'src/ui/perf-readout.js', need: [/setInterval\(\(\) => \{ if \(!cur && !document\.hidden && !folded\) restPass\(writeLog\); \}, 1000\)/, 'The ?perf long-frame log and the slowest inputs (recs P4, R2) (never written during a gesture window, nor while hidden or folded)'] },
  { file: 'src/ui/perf-readout.js', need: [/logText\(\)\]\.join/, 'The ?perf long-frame log and the slowest inputs (recs P4, R2) (the Copy text carries the log and the inputs)'] },
  // no-cavity-glow
  { file: 'src/ui/stage*', forbid: [/cavityShade|bd-cavity/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  { file: 'styles/app-*.css', forbid: [/\.cav-(hi|mid|lo)\b|bd-cavity/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  { file: 'styles/tokens.css', forbid: [/--cavity:/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  { file: 'src/ui/stage*', need: [/class="org-diaphragm band-body"/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays (the diaphragm stays)'] },
  { file: 'src/ui/stage*', need: [/id: 'backdrop', mask: 'url\(#diaMask\)'/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  { file: 'src/ui/stage*', need: [/\['heart', 'heart-ra', 'esophagus', 'liver', 'stomach', 'spleen'\]/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  { file: 'src/ui/stage*', need: [/function diaphragmPath\(shrink, sc\)/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  { file: 'src/ui/stage*', need: [/liverPaths\.push\(diaCut\.liver\)/, 'no body-cavity shading behind the abdomen (it read as a glow); only the diaphragm stays'] },
  // organ-names-off-vessels
  { file: 'src/ui/stage*', need: [/import \{ NAME_BREAK, OFF_NEAR, nameSpots, onOtherOrgan \} from '\.\/organ-names\.js';/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov)'] },
  { file: 'src/ui/stage*', need: [/const spot = \{ gap: 0, leader: false, clear: true, unblocked: true \}, off = \{ \.\.\.spot, offOrgans: txt \};\s*const at = nameSpots\(txt\)\.map\(\(\[sx, sy\]\) => \{ const \[bx, by\] = worldToLocal\(sx, sy\); return \[bx - ax, by - ay, Math\.hypot\(sx - x, sy - y\) <= OFF_NEAR\]; \}\);\s*placeMulti\(it, \['C'\], \[off, \.\.\.at\.filter\(\(a\) => a\[2\]\)\.map\(\(a\) => \(\{ \.\.\.off, at: a \}\)\), spot, \.\.\.at\.map\(\(a\) => \(\{ \.\.\.spot, at: a \}\)\), \{ gap: 0, leader: false, unblocked: true \}\]\);/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov)'] },
  { file: 'src/ui/stage*', forbid: [/it\.h = (?:live\.)?LINE_H\(it\.lines\[0\]\);\s*place\(it, \['C'\], 0, false\);/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov) (no organ name is placed by the old single pass)'] },
  { file: 'styles/app-10-thumb-dock.css', need: [/bottom: calc\(29px \+ var\(--pz-sb\)\);/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov) (beside the pill: level with it)'] },   // (was a slice of the file)
  { file: 'styles/app-10-thumb-dock.css', need: [/bottom: calc\(73px \+ var\(--pz-sb\)\);/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov) (on its own row: clear of the pill)'] },   // (was a slice of the file)
  { file: 'styles/app-10-thumb-dock.css', need: [/bottom: calc\(21px \+ var\(--pz-sb\)\); min-height: 38px;/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov) (the phone\'s key is as it was)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/lines: up\.split\(NAME_BREAK\.has\(txt\) \? ' ' : '\\u0000'\)\.map\(\(t\) => \[\{ t, size: 9\.5, weight: 600, cls: 'lb-organ', track: 0\.06 \}\]\)/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov)'] },
  { file: 'src/ui/stage*', need: [/it\.w = Math\.max\(\.\.\.it\.lines\.map\(lineW\)\); it\.h = it\.lines\.reduce\(\(a, l\) => a \+ LINE_H\(l\), 0\);\s*(?:\/\/.*\n\s*)*const spot/, 'organ names stay off the vessels; the tablet colour key sits level with the nav pill (1 Nov)'] },
  // organ-paint
  { file: 'src/ui/stage*', need: [/const LIVE_LAYERS = /, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles'] },
  { file: 'src/ui/stage*', need: [/if \(!liveNow && \((?:live\.)?(?:live\.)?lvMoving \|\| (?:live\.)?(?:live\.)?fluidEasing\(\)\)\) \{ if \((?:live\.)?(?:live\.)?plateKey && (?:live\.)?(?:live\.)?veins\.hasPlate\(0\) && plateStateKey\(\) !== (?:live\.)?(?:live\.)?plateKey\) hidePlate\(\); return; \}/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles'] },
  { file: 'src/ui/stage*', need: [/if \(!liveNow && spleenMoving\(\)\) \{ if \((?:live\.)?plateKey && (?:live\.)?veins\.hasPlate\(0\) && plateStateKey\(\) !== (?:live\.)?plateKey\) hidePlate\(\);/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles'] },
  { file: 'src/ui/organ-paint.js', need: [/const own = el\.style\?\.visibility \|\| el\.getAttribute\('visibility'\);\n\s+if \(own && own !== 'inherit'\) vis = own;/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles'] },
  { file: 'src/ui/organ-paint.js', need: [/for \(let i = 0; i < kids\.length; i\+\+\) walk\(c, kids\[i\], me, a, cl, vis, ch, out, a0\); return; \}\n\s+if \([^\n]*\|\| vis !== 'visible'\) return;/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles'] },
  { file: 'src/ui/organ-paint.js', need: [/tol = detailTol\(sc\)/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles'] },   // (was a slice of the file)
  { file: 'src/ui/organ-paint.js', need: [/csh = meshOf\(op\.clip\.geom, 0, detailTol\(scaleOf\(cm\)\)\)/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles (the clip in the same buckets)'] },   // (was a slice of the file)
  { file: 'src/ui/organ-paint.js', forbid: [/0\.2 \/ scaleOf/, 'The organs painted live on the GPU (organ-paint.js) read their colours from the page\'s computed styles (no continuous clip tolerance)'] },   // (was a slice of the file)
  // path-cmds
  { file: 'src/ui/stage*', need: [/cmds = cmdsReset\(liverMorphCmds\);\n\s+for \(let i = 0; i < xy\.length; i\+\+\) \(i \? cmdL : cmdM\)\(cmds, \+xy\[i\]\[0\], \+xy\[i\]\[1\]\);\n\s+cmdZ\(cmds\);/, 'A path\'s commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver'] },
  { file: 'src/ui/stage*', need: [/d = 'M' \+ xy\.map\(\(\[x, y\]\) => `\$\{x\} \$\{y\}`\)\.join\(' L'\) \+ ' Z';/, 'A path\'s commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver'] },
  { file: 'src/ui/stage*', need: [/for \(const el of liverPaths\) \{ el\.setAttribute\('d', d\); bindShape\(el, src\); \}/, 'A path\'s commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver'] },
  { file: 'src/ui/stage*', need: [/d \+= `Q\$\{qx\} \$\{qy\} \$\{mx\} \$\{my\}`;\n\s+cmdQ\(cmds, \+qx, \+qy, \+mx, \+my\);/, 'A path\'s commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver'] },
  { file: 'src/ui/stage*', need: [/lv\.nod\.setAttribute\('d', nod\); bindShape\(lv\.nod, reshape\(nodSrc, nod, nodCmds\)\);/, 'A path\'s commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver'] },
  // path-pieces
  { file: 'src/ui/stage*', need: [/const loc = olLocal\(d \|\| RING_OF\[id\] \|\| organEls\[id\]\.getAttribute\('d'\), stride\);/, 'The organs\' outlines read piece by piece (path-pieces.js)'] },
  { file: 'src/ui/stage*', need: [/const mp = measurePath\(src\);/, 'The organs\' outlines read piece by piece (path-pieces.js) (measured in script, no element (2 Nov 2026))'] },
  { file: 'src/ui/stage-outlines.js', forbid: [/getTotalLength\(|getPointAtLength\(/, 'The organs\' outlines read piece by piece (path-pieces.js) (no outline measured by the page)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/if \(memo\.size >= 48\) memo\.delete/, 'The organs\' outlines read piece by piece (path-pieces.js)'] },
  { file: 'src/ui/doppler-gl.js', need: [/exerciseDraw\(gl, \(\) => \{\n\s+gl\.useProgram\(prog\);/, 'The organs\' outlines read piece by piece (path-pieces.js)'] },
  // perf-mac-30oct
  { file: 'src/ui/perf-readout.js', need: [/const fdt = prevTs && ts > prevTs \? ts - prevTs : 0;/, 'His Mac ?perf readouts on 8d45bef7 (30 Oct)'] },   // (was a slice of the file)
  { file: 'src/ui/perf-readout.js', need: [/if \(fdt\) \{ recent\.push\(fdt\);/, 'His Mac ?perf readouts on 8d45bef7 (30 Oct)'] },   // (was a slice of the file)
  { file: 'src/ui/perf-readout.js', need: [/if \(fdt\) cur\.dts\.push\(fdt\);/, 'His Mac ?perf readouts on 8d45bef7 (30 Oct)'] },   // (was a slice of the file)
  { file: 'src/ui/perf-readout.js', need: [/const dt = t - prevT, at = prevT - cur\.t0;/, 'His Mac ?perf readouts on 8d45bef7 (30 Oct) (a gap and the steps listed with it stay on the clock)'] },   // (was a slice of the file)
  { file: 'src/ui/perf-readout.js', need: [/prevT = t; prevTs = ts > 0 \? ts : 0;/, 'His Mac ?perf readouts on 8d45bef7 (30 Oct)'] },   // (was a slice of the file)
  // plane-csph-words
  { file: 'src/ui/visual-plane.js', need: [/pl\.key === 'never' \? null : planeCardKey\(pl\)/, 'The stiffness and platelets plane names its own zones (Mohammad, 19 Oct (no key under the card plot)'] },
  { file: 'src/ui/visual-plane.js', need: [/card && pl\.key === 'never' \? ' pze-ownwords' : ''/, 'The stiffness and platelets plane names its own zones (Mohammad, 19 Oct (the plot takes the key\'s room)'] },
  { file: 'styles/app-*.css', need: [/\.pz\.stack \.pze-plot\.pze-incard\.pze-ownwords \{ height: calc\(min\(clamp\(210px, 66cqi, 300px\) \* var\(--pz-fit, 1\), max\(150px, var\(--pz-ph, 9999px\)\)\) \+ 1\.3em \+ 6px\); \}/, 'The stiffness and platelets plane names its own zones (Mohammad, 19 Oct'] },
  { file: 'src/ui/visual-plane.js', need: [/ringG = sv\('g', \{ class: 'pze-ring', 'data-look': 'plane.ring' \}, halo, dot\)/, 'The stiffness and platelets plane names its own zones (Mohammad, 19 Oct (a dot with its gap, no ring)'] },
  { file: 'src/ui/visual-plane.js', need: [/svg\.append\(base, wordsG, ringG\)/, 'The stiffness and platelets plane names its own zones (Mohammad, 19 Oct (the dot and the words stay the same elements, so they ease)'] },
  { file: 'src/ui/test-decks/demo-all-new-visuals.js', need: [/moves into the CSPH zone/, 'The stiffness and platelets plane names its own zones (Mohammad, 19 Oct'] },   // (was a slice of the file)
  // pressure-along
  { file: 'src/ui/veins-gl.js', need: [/gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA32F, N_SAMPLES, nTubes, 0, gl\.RGBA, gl\.FLOAT, null\);/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/radAll\[o \+ i \* 4 \+ 2\] = A \? A\[i\] : -1; radAll\[o \+ i \* 4 \+ 3\] = A \? A\[j\] : -1;/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },   // (was a slice of the file)
  { file: 'src/ui/comp-glsl.js', need: [/return a\.x < 0\.0 \? u : mix\(a\.x, a\.y, ui - float\(i0\)\);/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },   // (was a slice of the file)
  { file: 'src/ui/veins-mesh-glsl.js', need: [/col = mix\(t0\.rgb, t1\.rgb, alongAt\(id, clamp\(uAt, 0\.0, 1\.0\)\)\);/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/vc1 = mix\(texelFetch\(tube, ivec2\(0, id1\), 0\)\.rgb, texelFetch\(tube, ivec2\(1, id1\), 0\)\.rgb, alongAt\(id1, clamp\(s1 \/ len1, 0\.0, 1\.0\)\)\);/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/if \(r\[i\] > mx\) mx = r\[i\];/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/x\.stenF = f;/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },
  { file: 'src/ui/stage*', need: [/if \(it\.kind !== 'v'\) return null;\n\s*const fa = it\.x\.stenF, fb = it\.ra\?\.stenF, f = it\.f;\n\s*if \(!fa && !fb\) return null;/, 'Where the pressure falls along a stenosed vessel (combined plan V1)'] },
  // quiet
  { file: 'src/ui/stage*', need: [/import \{ (?:leftAlone, )?sinceInput(?:, booting, holdCover)? \} from '\.\/quiet\.js/, 'one clock of input for deferred work (quiet.js): no second listener set'] },
  { file: 'src/ui/stage*', forbid: [/let inputAt|const pressed = new Set/, 'one clock of input for deferred work (quiet.js): no second listener set (no second set of listeners)'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(!leftAlone\(PUBLISH_QUIET_MS\)\) return;/, 'one clock of input for deferred work (quiet.js): no second listener set (prepare() publishes the optional builds after a gesture)'] },
  { file: 'src/ui/gl-compile.js', need: [/import \{ leftAlone \} from '\.\/quiet\.js/, 'one clock of input for deferred work (quiet.js): no second listener set'] },
  { file: 'src/ui/main.js', need: [/const warmUp = \[\(\) => paletteL\.warm\(\), \(\) => presenterL\.warm\(\), \(\) => dock\.load\(\)\];/, 'one clock of input for deferred work (quiet.js): no second listener set'] },
  { file: 'src/ui/main.js', need: [/whenQuiet\(\(\) => idle\(\(\) => \{ step\(\); warmNext\(\); \}\)\)/, 'one clock of input for deferred work (quiet.js): no second listener set (one module per quiet idle moment)'] },
  // reverse-arrows-colour
  { file: 'src/ui/stage*', need: [/revHolder\.step\(revFlag, t, jump\)/, 'The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve'] },
  { file: 'src/ui/stage*', need: [/const revFlag = \(k\) => \(isReversed\(EDGES\[k\], (?:live\.)?(?:live\.)?(?:live\.)?revF\) \? 1 : 0\);/, 'The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve'] },
  { file: 'src/ui/stage*', need: [/if \(perF !== (?:live\.)?(?:live\.)?(?:live\.)?(?:live\.)?F \|\| perH !== H\) \{\n\s*perF = (?:live\.)?(?:live\.)?(?:live\.)?(?:live\.)?F; perH = H;\n\s*holdReversals\((?:live\.)?(?:live\.)?(?:live\.)?(?:live\.)?F\);/, 'The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve'] },
  { file: 'src/ui/stage*', need: [/const rt = revHold\[k\];\s*so\.large = LARGE\[k\]; so\.rev = !!rt;\s*const sm = advanceStreamAt\([^;]*, so\);/, 'The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve'] },
  { file: 'src/ui/stage*', need: [/mode === 'direction'\) \{ const rev = (?:live\.)?(?:live\.)?reversedShown\(e\)/, 'The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve'] },
  { file: 'src/ui/stage*', need: [/x\.rev = REVERSAL_WATCH\.has\(e\.id\) && (?:live\.)?reversedShown\(e\);/, 'The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a vein neve'] },
  // shader-warm
  { file: 'src/ui/veins-gl.js', need: [/prestartOrganStack\(gl\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  { file: 'src/ui/veins-gl.js', need: [/auxStart\('lay'\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  { file: 'src/ui/veins-gl.js', need: [/warmFade\(gl\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  { file: 'src/ui/veins-gl.js', need: [/auxTake\('up', false\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  { file: 'src/ui/veins-gl.js', need: [/auxTake\('lay', true\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  { file: 'src/ui/glass-gl.js', need: [/h\.warmIn\?\.\(warmTask\(h\.gl\)\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  { file: 'src/ui/field-gl.js', need: [/compileDone\(gl, \[started\]\)/, 'the shader warm-up order: organ stack, layers, fade and glass compile before first use'] },
  // short-vessel-labels
  { file: 'src/ui/stage-label-items.js', need: [/if \(abbr && abbrevName\(it\)\) return true;\n\s+if \(it\.short === 2/, 'Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, a'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/short: it\.short \|\| 0, abbr: !!it\.abbr(, au: it\.au)?(, vh: [^}]+)? \}\);/, 'Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, a (a solved slot remembers its abbreviation)'] },
  { file: 'src/ui/stage*', need: [/if \(\(prev\.short \|\| prev\.abbr\) && it\.canShort\) shortenTo\(it, \+prev\.short \|\| 0, prev\.abbr\);/, 'Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, a (a carried slot reads it again)'] },
  { file: 'src/ui/stage*', need: [/if \(it\.short \|\| it\.abbr\) shortenTo\(n, it\.short \|\| 0, it\.abbr\);/, 'Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, a (live values keep it)'] },
  { file: 'src/ui/stage-label-solve.js', need: [/shortenItem\(it, false\)/, 'Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, a'] },   // (was a slice of the file)
  // sin-perfusion
  { file: 'src/ui/stage*', need: [/const sinStrand = kind === 's' && SIN_EDGES\.has\(id\);/, 'Review G15 (16 Oct): the sinusoids\' strands are drawn 60 % fainter and taper to a quarter of the sinusoid\'s wi'] },
  { file: 'src/ui/stage*', need: [/if \(sinStrand\) alpha \*= SIN_PERFUSION\.fade;/, 'Review G15 (16 Oct): the sinusoids\' strands are drawn 60 % fainter and taper to a quarter of the sinusoid\'s wi'] },
  { file: 'src/ui/stage*', need: [/if \(kind === 's' && SIN_EDGES\.has\(x\.e\.id\)\) \{ const w = x\.width; return \[`\$\{r\.toFixed\(2\)\}\|\$\{w\.toFixed\(2\)\}\|sin`, \(i\) => sinStrandRadius\(r, w, i \/ \(N_SAMPLES - 1\), o\.span\)\]; \}/, 'Review G15 (16 Oct): the sinusoids\' strands are drawn 60 % fainter and taper to a quarter of the sinusoid\'s wi'] },
  { file: 'src/ui/veins-gl.js', forbid: [/F_PERF|SIN_PERFUSION|sin-perfusion/, 'Review G15 (16 Oct): the sinusoids\' strands are drawn 60 % fainter and taper to a quarter of the sinusoid\'s wi'] },
  { file: 'src/ui/stage*', forbid: [/F_PERF|tubeData\[o \+ 51\]|sinGlow/, 'Review G15 (16 Oct): the sinusoids\' strands are drawn 60 % fainter and taper to a quarter of the sinusoid\'s wi'] },
  // spleen-growth-live
  { file: 'src/ui/stage-diaphragm.js', need: [/const sc = f\.slow\.spleen \/ 11;\n\s+normalSync\(sc\);\n[^\n]*\n\s+if \(spleenMv\.see\(sc, performance\.now\(\)\) && (?:live\.)?veins && !(?:live\.)?veins\.lost && (?:live\.)?veins\.hasPlate\(0\) && !liveOn\(\)\) hidePlate\(\);\n\s+putA\(organG\.spleen, 'transform', `translate\(\$\{SPLEEN_CENTER\[0\]\} \$\{SPLEEN_CENTER\[1\]\}\) scale\(\$\{sc\.toFixed\(3\)\}\)/, 'A spleen growing through a time-lapse stood still under the organs\' picture, jumped bigger, waited and jumped'] },   // (was a slice of the file)
  { file: 'src/ui/stage-plate.js', need: [/if \(!liveNow && spleenMoving\(\)\) \{ if \((?:live\.)?(?:live\.)?plateKey && (?:live\.)?(?:live\.)?veins\.hasPlate\(0\) && plateStateKey\(\) !== (?:live\.)?(?:live\.)?plateKey\) hidePlate\(\); stageScope\.clear\((?:live\.)?(?:live\.)?spleenTimer\); (?:live\.)?(?:live\.)?spleenTimer = stageScope\.timer\(platePoke, 320\); return; \}/, 'A spleen growing through a time-lapse stood still under the organs\' picture, jumped bigger, waited and jumped'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/const moving = !liveOn\(\) && \((?:live\.)?lvMoving \|\| (?:live\.)?fluidEasing\(\) \|\| spleenMoving\(\)\);\n\s+if \(figureHidden\(\) \|\| moving \|\|/, 'A spleen growing through a time-lapse stood still under the organs\' picture, jumped bigger, waited and jumped (no picture is drawn while it grows (unless it is painted live))'] },
  { file: 'src/ui/stage*', need: [/400 - \(performance\.now\(\) - spleenMv\.stillAt\(\)\)/, 'A spleen growing through a time-lapse stood still under the organs\' picture, jumped bigger, waited and jumped'] },
  { file: 'src/ui/stage-plate.js', need: [/k\[12\] = organG\.spleen\.style\.opacity/, 'A spleen growing through a time-lapse stood still under the organs\' picture, jumped bigger, waited and jumped'] },   // (was a slice of the file)
  { file: 'src/ui/stage-plate.js', need: [/const liveKeyNow = \[(?:'', ){12}''\], liveKeyOld = \[(?:'', ){12}''\]/, 'A spleen growing through a time-lapse stood still under the organs\' picture, jumped bigger, waited and jumped'] },
  // stage-dive-record
  { file: 'src/ui/stage-dive.js', need: [/const DIVEC = cams\.stage\.dive;/, 'Push B of the one-camera record (one-camera-record-plan.md)'] },
  { file: 'src/ui/stage-dive.js', need: [/camAbout\(DIVEC, k, live\.camOx, live\.camOy\); pushCam\(\);/, 'Push B of the one-camera record (one-camera-record-plan.md)'] },
  { file: 'src/ui/stage-dive.js', need: [/camId\(DIVEC\); pushCam\(\); nextFrame\(diveWillOff\);/, 'Push B of the one-camera record (one-camera-record-plan.md)'] },
  { file: 'src/ui/stage-dive.js', need: [/live\.veins\.setCameraRec\(DIVEC\.k, DIVEC\.x \* sx, DIVEC\.y \* sy,/, 'Push B of the one-camera record (one-camera-record-plan.md)'] },
  { file: 'src/ui/stage-dive.js', forbid: [/live\.camK/, 'Push B of the one-camera record (one-camera-record-plan.md)'] },
  { file: 'src/ui/veins-gl.js', need: [/const a = plain \? 1 : cam\.a, k = plain \? 1 : cam\.k \* scn\.k, ex = plain \? 0 : scn\.k \* cam\.ex \+ scn\.ex, eyUp = plain \? 0 : canvas\.height \* \(1 - k\) - \(scn\.k \* cam\.ey \+ scn\.ey\);/, 'Push B of the one-camera record (one-camera-record-plan.md)'] },
  // sw-yield
  { file: 'src/ui/veins-gl.js', need: [/const software = softwareGL\(gl\);/, 'A software renderer\'s yield (src/ui/sw-yield.js) (veins-gl.js decides software through sw-yield.js)'] },
  { file: 'src/ui/stage*', need: [/swYield && !swYield\.ready\(now, forceDraw \|\| drawOnce \|\| viewVersion !== drawnView\)/, 'A software renderer\'s yield (src/ui/sw-yield.js)'] },
  { file: 'src/ui/lobule-zoom.js', need: [/lzYield && !lzYield\.ready\(now, viewVer !== pacedVer\)/, 'A software renderer\'s yield (src/ui/sw-yield.js)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/if \(opacity > 0 && model\) \{ draw\(0, false\); drewNow = true; \}/, 'A software renderer\'s yield (src/ui/sw-yield.js)'] },
  // velocity-normal
  { file: 'src/ui/main.js', need: [/\[\[0, 'Slow'\], \[100, 'Fast'\]\]/, 'Colored by velocity, each vessel is set against its own normal range (velNormal.js)'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', forbid: [/\[\[0, 'Slow'\][^\n]*'Normal'/, 'Colored by velocity, each vessel is set against its own normal range (velNormal.js)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-words.js', need: [/'Slow'/, 'Colored by velocity, each vessel is set against its own normal range (velNormal.js)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-words.js', need: [/'Fast'/, 'Colored by velocity, each vessel is set against its own normal range (velNormal.js)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-words.js', forbid: [/Normal/, 'Colored by velocity, each vessel is set against its own normal range (velNormal.js)'] },   // (was a slice of the file)
  // vessel-pick
  { file: 'src/ui/stage-hover.js', need: [/const vesselPick = createVesselPick\(/, 'vessel picking uses the vessels own data (vessel-pick.js), never DOM hit-tests'] },   // (was a slice of the file)
  { file: 'src/ui/stage-hover.js', need: [/if \(!x\.vis \|\| x\.noHit\) continue;/, 'vessel picking uses the vessels own data (vessel-pick.js), never DOM hit-tests'] },   // (was a slice of the file)
  { file: 'src/ui/stage-hover.js', need: [/rank = pickTier\(x\) \* GL_ROWS \+ x\.row/, 'vessel picking uses the vessels own data (vessel-pick.js), never DOM hit-tests (drawn on top = the GPU\'s tier, then its row)'] },   // (was a slice of the file)
  { file: 'src/ui/stage-hover.js', forbid: [/getElementsByClassName|--hit-w|chainMat|closest\('\.vg/, 'vessel picking uses the vessels own data (vessel-pick.js), never DOM hit-tests'] },   // (was a slice of the file)
  // vitals-gl
  { file: 'src/ui/vitals-monitor.js', need: [/export function createVitalsMonitor\(\{ gpu = true, makeGL = createVitalsGL \} = \{\}\)/, 'the vitals monitor is all GPU: no 2D context, no cached pictures'] },
  { file: 'src/ui/vitals-monitor.js', forbid: [/vitalsgl|location\.search/, 'the vitals monitor is all GPU: no 2D context, no cached pictures'] },
  { file: 'src/ui/vitals-monitor.js', need: [/if \(glr\) drawGL\(now\);/, 'the vitals monitor is all GPU: no 2D context, no cached pictures (the GPU draws the monitor; there is no 2D drawing)'] },
  { file: 'src/ui/vitals-monitor.js', forbid: [/fitCanvas|getContext|fillText|stroke\(|createStill/, 'the vitals monitor is all GPU: no 2D context, no cached pictures (no 2D context, no cached 2D pictures anywhere in the file)'] },
  { file: 'src/ui/vitals-monitor.js', need: [/glr\.draw\(/, 'the vitals monitor is all GPU: no 2D context, no cached pictures'] },   // (was a slice of the file)
  { file: 'src/ui/vitals-gl.js', need: [/import \{ sdfAtlas[^}]*\} from '\.\/text-gl\.js/, 'the vitals monitor is all GPU: no 2D context, no cached pictures (the atlas through text-gl.js, the one door to GPU text)'] },
  { file: 'src/ui/vitals-gl.js', need: [/drawArraysInstanced\(gl\.TRIANGLES, 0, 6, L\.n - 1\)/, 'the vitals monitor is all GPU: no 2D context, no cached pictures (one capsule per strip segment)'] },
  // wall-numbers-agree
  { file: 'src/ui/instruments.js', need: [/const wr = wallRead\(v\)/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },
  { file: 'src/ui/instruments.js', need: [/share > 1 \? 'above the rupture point'/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },   // (was a slice of the file)
  { file: 'src/ui/instruments.js', need: [/const share = wallShare\(v\)/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },   // (was a slice of the file)
  { file: 'src/ui/dock.js', need: [/wallShare\(m\.varix\) \* 100/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },
  { file: 'src/ui/compare.js', need: [/wallShare\(m\.varix\) \* 100/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },
  { file: 'src/ui/inspector.js', need: [/wallShare\(f\.metrics\.varix\) \* 100/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },
  { file: 'src/ui/inspector.js', need: [/metrics\.gastricVarix\.ratioShown \* 100/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },
  { file: 'src/engine/explain.js', need: [/wallShare\(m\.varix\) \* 100/, 'The Wall mechanics tiles multiply out (review 19 Oct)'] },
  // warm-vis
  { file: 'src/ui/stage*', need: [/const seen = warmVis\(o\.id\);/, 'The after-meal gut glow lights only the loop edges that show (Mohammad, 20 Oct, Circulation 10/13'] },
  { file: 'src/ui/stage*', need: [/\(wmVis && !wmVis\[2 \* \(t < 0\.5 \? i0 : i1\) \+ \(side > 0 \? 1 : 0\)\]\)/, 'The after-meal gut glow lights only the loop edges that show (Mohammad, 20 Oct, Circulation 10/13'] },
  { file: 'src/ui/stage*', need: [/ringGrid\(olRingsRaw\(id, true\)\)/, 'The after-meal gut glow lights only the loop edges that show (Mohammad, 20 Oct, Circulation 10/13 (clipped to the organ\'s own outline)'] },
  { file: 'src/ui/stage*', need: [/sp = glow \? Math\.min\(GLOW_SPAN, \(n - 1\) >> 1\) : 1/, 'The after-meal gut glow lights only the loop edges that show (Mohammad, 20 Oct, Circulation 10/13'] },
  // lobule-callout-ring
  { file: 'styles/app-*.css', forbid: [/\.lz-call-[lr]/, 'the lobule callout ring and leader keep a bold fixed weight: no sheet rule is left to thin it'] },
  { file: 'src/ui/lobule-zoom*', need: [/setGeo\(callLine, 'x1', a\[0\] \+ \(bx - a\[0\]\) \* e0\)/, 'the lesion leader starts on the ring edge, not its centre'] },
  { file: 'src/ui/lobule-zoom*', forbid: [/callLine\.setAttribute\('x1', a\[0\]\); callLine/, 'the lesion leader no longer starts at the ring centre'] },
  { file: 'src/ui/lobule-zoom*', need: [/const rd = ringDepth\(ring, cb\);[\s\S]*?\(rd > 0 \? 1e6 \+ rd \* 1e3 : 0\)/, 'labels pay the full clash cost for touching the ring'] },
  { file: 'src/ui/lobule-zoom*', need: [/\(rd0 > 0 \? 1e6 \+ rd0 \* 1e4 : 0\)/, 'the pointer pill pays the full clash cost for touching the ring too'] },
  { file: 'src/ui/lobule-zoom*', need: [/const hexOf = \(\) =>/, 'the lobule outline on screen is measured each layout'] },
  { file: 'src/ui/lobule-zoom*', need: [/\+ hex\.share\(cBox\) \* INSIDE_COST \+ c4/, 'the pointer pill prefers spots outside the lobule'] },
  { file: 'src/ui/credit.js', need: [/\.lz-call, \.lz-call-r\.on,/, 'the credit keeps clear of the lobule pointer pill ring'] },
  // play-test fixes, 16 Nov 2026
  { file: 'styles/app-04-presenter.css', need: [/\.pz-panel\.pz-grows \{ top: calc\(50% - var\(--pz-open-h\) \/ 2\); translate: -50% 0; \}/, 'A centred card that grows (the quick check\'s answers) hangs its top where its open height centres, so it lengthens downward and nothing above moves (7d)'] },
  { file: 'src/ui/presenter-zoom.js', need: [/el\.style\.setProperty\('--pz-open-h', `\$\{readMetric\(el, 'offsetHeight'\)\}px`\)/, 'The open height is read while every answer is open (7d)'] },
  { file: 'src/ui/chart-looks/path.js', forbid: [/tok\('border-strong'\)/, 'A path figure\'s quiet lines are the third text ink at about half, never the pale border colour (7c)'] },
  { file: 'src/ui/chart-looks/path.js', forbid: [/opacity: 0\.[0-6]\d*\b(?!\s*\))/, 'An unlit word or line in a path figure keeps at least UNLIT (70%) of its colour (7c)'] },
  { file: 'src/ui/stage-label-items.js', need: [/const unitHere = \(id, u\) => u !== 'mmHg' \|\| selStation\(id\) \|\| unitNow\(\);/, 'A figure label on a slide always carries its unit (B2); off a slide the unit is said once, in the legend'] },
  { file: 'src/ui/presenter.js', need: [/const toolStep = \(d\) => shown\?\.i === want && !!ui\?\.tools\?\.canStep\(d\);/, 'A swipe for a Next that only takes the data card\'s next reading lifts no card (Varices 6/11: the upper card moved and sprang back)'] },
  { file: 'src/ui/tool-hvpg.js', need: [/class: 'mon-steps'/, 'The HVPG tracing card shows its readings as numbered steps, one for each Next (Varices 6/11)'] },
  { file: 'src/ui/presenter-scales.js', need: [/class: 'pzb-pips'[^\n]*h\('i'\), h\('i'\), h\('i'\)/, 'A slide with several views shows them as short strokes under the count, the one on show full (Collaterals 2/11: the views were unseen)'] },
  { file: 'styles/app-05-presenter-cards.css', need: [/\.pzb-pips \{[^}]*transition: opacity var\(--d-small\) var\(--ease\); \}/, 'The view dots fade, never pop'] },
  { file: 'src/ui/presenter-case.js', need: [/dataTo\(s, chartFp\(s, end, liveFp\(fr\), d \/ days\)/, 'While the days play, the sentence and the tiles take the chart head\'s own number (the trail at this share), so they never disagree with the chart (Choose the treatment 3)'] },
  { file: 'src/ui/presenter-question.js', need: [/if \(s\.lapse && s\.line\) wst = live\.states\[live\.stateOf\[i\]\] \|\| wst;/, 'The words of a time-lapse slide are typeset from its end state, from the first frame (Two lesions 3: "ending at 21.2" before 18.6; Carvedilol 3: LSM 17.1 meets >=25 kPa)'] },
  { file: 'src/ui/presenter-case.js', need: [/chipsTo\(s, end\.fp\);/, 'A time-lapse slide lands its words on the end state as the days start, and no step of the days moves them again'], },
  { file: 'src/ui/presenter-case.js', forbid: [/if \(s\.lapse\) chipsTo\(s, f\);/, 'The words never ride the days'] },
];
