// View-switch hand-off (16 Nov 2026; behaviour in tests/view-switch-hop.test.js). One hop at a time along Sinusoid, Lobule, Anatomy, Circuit.
export default [
  // Out of the lobule or the sinusoid the Circuit's change waits for the rise to land (circGo), and a talk waits for it (viewChanging).
  { file: 'src/ui/stage.js', need: [/if \(target === 1 && !force && lobuleCovers\(\)\) \{ circWait = true;/, 'the Circuit asked for over the lobule waits for the rise (one hop at a time)'] },
  { file: 'src/ui/stage.js', need: [/if \(circWait\) nextFrame\(circGo\);/, 'the rise out of the lobule begins the Circuit change as it lands'] },
  // From the Circuit both the lobule and the sinusoid turn to the anatomy first.
  { file: 'src/ui/stage.js', need: [/async function turnToAnatomy\(\)/, 'the Circuit turns to the anatomy before a dive (lobule or sinusoid)'] },
  { file: 'src/ui/stage.js', need: [/if \(store\.get\(\)\.view === 'circuit' && !\(await turnToAnatomy\(\)\)\) return;/, 'the Sinusoid button from the Circuit turns to the anatomy first'] },
  // The names of the lobule are measured and placed before the dive scales its layer, so they fade in with the view (not 1 to 2 s after it lands).
  { file: 'src/ui/lobule-zoom-field.js', need: [/live\.labelsAhead\(\);/, 'stage() places the lobule\'s names before the dive'] },
  { file: 'src/ui/lobule-zoom.js', need: [/function labelsAhead\(\) \{\n\s*if \(fade > 0 \|\| !geo \|\| diveScaled \|\| sinU > 0\) return;\n\s*measureNow\(\);/, 'the names are measured while the layer stands straight'] },
  // Sinusoid to anatomy is one glide: the zoom out eases in only and the rise begins in the frame it lands.
  { file: 'src/ui/lobule-zoom.js', need: [/sinCarry && sinTo === 0 \? 1 - easeIn\(1 - u\) : easeIO\(u\)/, 'the way out of the sinusoid that carries on eases in only'] },
  { file: 'src/ui/lobule-zoom.js', need: [/const go = sinCarry; sinCarry = null; if \(go\) go\(\);/, 'the rise begins in the frame the sinusoid zoom lands'] },
  { file: 'src/ui/presenter.js', need: [/stage\.exitSinusoid\((?:to)?\);/, 'a slide leaving the sinusoid for the anatomy is one glide (stage.exitSinusoid)'] },
  { file: 'src/ui/presenter.js', forbid: [/\{ setViewKey\('lobule'\); await waitCut\(60, cut\); await until\(\(\) => cut\(\) \|\| \(!stage\.sinBusy\(\) && !stage\.sinusoidOpen\(\)\), 4000\)/, 'no stop at the lobule between the sinusoid and the anatomy'] },
  // A late solve's landing (a deck closed onto the free view) crossfades the held ghosts with the new labels on a timed ramp: no one-frame swap.
  { file: 'src/ui/stage-view.js', need: [/function xfRelStep\(\) \{[\s\S]*?viewXfMix\(u < 0 \? 0 : u, 0, XF_MIX, true\)[\s\S]*?relId = relFrame\(xfRelStep\);/, 'the ghosts give way to the late-landing labels over a timed crossfade'] },
  { file: 'src/ui/stage-view.js', need: [/xfRelCancel\(\);\n\s*glideXfCut\(\);/, 'the next view change cuts a release ramp under way'] },
  // The sinusoid's names are built when the view opens (page model and looks, pageRun) and held for the zoom's first part, so they come in with the view's detail.
  { file: 'src/ui/sinusoid-view.js', need: [/draw\(0, false\);\n\s*pageRun\(\);/, 'the sinusoid\'s names have their page model and looks as the zoom opens, not at the rest after it'] },
  { file: 'src/ui/sinusoid-view.js', need: [/const hold = !!dive && dive\.g < NAMES_AT;\n\s*if \(hold !== capHold\)/, 'the sinusoid\'s names are held until the zoom\'s last part and laid out as they are let in'] },
];
