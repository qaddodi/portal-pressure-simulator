// Pins moved out of source-regex tests (B6 slimming, 15 Nov 2026): each keeps its one-line reason. Pattern gone = the code it guarded changed: look before editing the rule.
export default [
  // audit-correctness-b
  { file: 'src/ui/main.js', need: [/catch \{.*return false;/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md). (a failed load answers false)'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', need: [/if \(gen !== presetGen\) return false;/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md). (a replaced load answers false)'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', need: [/return true;\s*\/\/[^\n]*\n\}/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md). (an applied load answers true)'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', need: [/if \(await loadPreset\(id\)\) \{ const pr = store\.get\(\)\.presetList\.find\(\(p\) => p\.id === id\); toast\(pr\?\.label/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md). (the palette toasts the patient only when it loaded)'] },
  { file: 'src/ui/main.js', need: [/if \(s\.frame\?\.probe\) host\.send\(\{ type: 'probe', id: s\.frame\.probe \}\)/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md). (restartPatient tells the probe vessel again)'] },
  { file: 'src/ui/timeline.js', need: [/try \{ \(\{ snap \} = await host\.request\('snapshot'\)\); \} catch \{ snap = null; \}/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md).'] },   // (was a slice of the file)
  { file: 'src/ui/timeline.js', need: [/e\.snapFailed = true/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md).'] },   // (was a slice of the file)
  { file: 'src/ui/timeline.js', need: [/e\.snapFailed && !e\.snap \? h\('div', \{ class: 'tl-pop-d tl-nogo' \}, 'Can’t go back here/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md).'] },
  { file: 'src/ui/main.js', need: [/readShare\(\)/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md).'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', need: [/loadShared\(next\)/, 'Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md).'] },   // (was a slice of the file)
  // card-sweep-2nov
  { file: 'src/ui/presenter*', need: [/const changing = \(\) => busy \|\| !!prepT;/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only):'] },   // (was a slice of the file)
  { file: 'src/ui/presenter*', need: [/if \(swipeHeld\(\{ gone, changing: changing\(\), out \}\)\) \{/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only):'] },   // (was a slice of the file)
  { file: 'src/ui/presenter*', need: [/if \(!changing\(\)\) pageForce = false;/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only): (the force that makes the words leave survives the wait)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter*', need: [/!!ui && !changing\(\) && !caseCard && !zoomOn\(\)/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only): (no finger follow starts on a card about to leave)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter.js', need: [/if \(!slidePrep\.ready\(want\)\) \{ outNow\(\); prepHold\(want, goOn\); \} else goOn\(\);/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only): (prepHold is the wait the swipe lands in (the cards that show are thrown first: push B))'] },   // (was a slice of the file)
  { file: 'src/ui/presenter.js', need: [/const goOn = \(\) => \{\n\s+clearTimeout\(prepT\); prepT = 0;/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only): (a press answered now leaves no stale wait that reads as a change)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter*', need: [/prepT = setTimeout\(look, 16\);/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only): (prepT is set for the whole wait)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-start.js', need: [/if \((?:live\.)?pageHeld\) \{ clearTimeout\((?:live\.)?pageHeld\.t\); (?:live\.)?pageHeld = null; \}\n\s+(?:live\.)?pull = null; (?:live\.)?pageForce = false; (?:live\.)?bare = false; (?:live\.)?throwDir = ''; (?:live\.)?throwD = 0;/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only):'] },   // (was a slice of the file)
  { file: 'src/ui/scope-tile.js', need: [/queue\.ask\(k\);/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only):'] },
  { file: 'src/ui/scope-tile.js', need: [/queue\.cancel\(\);\n\s+cancelFrame\(asked\)/, 'Card motion sweep (2 Nov 2026, "No more glitches", code only): (dispose cancels the waiting picture)'] },
  // circuit-nodes
  { file: 'src/ui/stage*', need: [/\.map\(\(n\) => \(\{ id: n\.id, r: dotRadius\(n\.kind\), on: false, u: 0 \}\)\)/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it (each dot starts off)'] },
  { file: 'src/ui/stage*', need: [/const a = MAP\.a \* easeMove\(nodeDots\[i\]\.u\), f = n0 \+ i \* ND_PER;\s*if \(a <= 0\) continue;/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it (off (u 0) or no circuit (MAP.a 0): not drawn)'] },
  { file: 'src/ui/stage*', need: [/count: 3 \* ND_SEG, col: null, alpha: 0, tri: true \}, \{ first: 0, count: 2 \* \(ND_SEG \+ 1\), col: null, alpha: 0 \}[\s\S]*sa\.first = f; sa\.col = nd\.fill; sa\.alpha = a; sb\.first = f \+ 3 \* ND_SEG; sb\.col = nd\.ring; sb\.alpha = a;/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it (the disc and its ring, one alpha)'] },
  { file: 'src/ui/stage*', need: [/V\[o\+\+\] = -1; V\[o\+\+\] = 0\.8;/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it (a ring 1.6 wide, as the SVG stroke was)'] },
  { file: 'src/ui/stage*', need: [/const hasDot = new Set\(nodeDots\.map\(\(d\) => d\.id\)\);/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/const NODE_ENDS = nodeEnds\(ALL_EDGES, \(e\) => E\[e\.id\]\);/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/const (?:live\.)?nodeVisible = \(id\) => [^;]*nodeDrawn\(NODE_ENDS\[id\]\);/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/const on = (?:live\.)?nodeVisible\(d\.id\);\s*if \(d\.on !== on\) \{ d\.on = on; (?:live\.)?mapWake = true; \}/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/\|\| !NODE_POS\[n\.id\] \|\| !(?:live\.)?(?:live\.)?nodeVisible\(n\.id\)\) continue;/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/\{ id: n\.id, r: dotRadius\(n\.kind\), on: false, u: 0 \}/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/const labelled = new Set\(nodes\.map\(\(it\) => it\.node\)\);/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/bareDots\(NODES\.filter\(\(n\) => hasDot\.has\(n\.id\)\), \{ labelled, shown: (?:live\.)?(?:live\.)?nodeVisible, at: \(id\) => worldToLocal\(\.\.\.nodePos\(id, t\)\), scale: (?:live\.)?(?:live\.)?CTM\.sc, minX: ringRX, minY: ringR \}\)/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/placed\.push\(\{ \.\.\.d\.box, dot: true \}\); ringXY\.push\(\[d\.x, d\.y, ringRX\]\);/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it'] },
  { file: 'src/ui/stage*', need: [/V\[o\+\+\] = 1; V\[o\+\+\] = 0\.8;/, 'No stray dots in the circuit: a station\'s marker (dot, label, Δ ring) shows only while a vessel is drawn at it (the outline width the box allows for (half of 1.6 either side of the radius))'] },
  // deck-lenses
  { file: 'src/ui/presenter*', need: [/^ {2}velocity: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has velocity)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}flow: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has flow)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}direction: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has direction)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}heat: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has heat)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}drop: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has drop)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}delta: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has delta)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}oxygen: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has oxygen)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}origin: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has origin)'] },
  { file: 'src/ui/presenter*', need: [/^ {2}firstpass: \['/m, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (presenter LENS_KEY has firstpass)'] },
  { file: 'src/ui/main.js', forbid: [/\bsystem:/, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (system stays out of Explore\'s lens menu)'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', forbid: [/\bsince:/, 'Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that (since stays out of Explore\'s lens menu)'] },   // (was a slice of the file)
  // doppler-alias
  { file: 'src/ui/dopplerWindow.js', need: [/if \(fixed\) \{ st\.baseF = fixed\.base; st\.scale = 2 \* fixed\.nyq \* Math\.max\(st\.baseF, 1 - st\.baseF\); st\.settleAt = tNow; \}/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler.js', need: [/FS_IN\.fixed = fixed; FS_IN\.holding = holding; FS_IN\.fits = fits; FS_IN\.target = target; FS_IN\.tbF = tbF; FS_IN\.tNow = tNow;\s+fitScale\(FS_ST, FS_IN\);/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler.js', need: [/g\.span = fixed \? H \/ pxPerV : 0; g\.topV = baseY \/ pxPerV; g\.botV = \(H - baseY\) \/ pxPerV/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler.js', need: [/const wraps = g\.span > 0 && P > \(s > 0 \? g\.topV : g\.botV\);/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler.js', need: [/gpu\.setCol\(x, P, b\.L, [^\n]*1 \+ \(wraps \? 2 : 0\) \+ \(s < 0 \? 4 : 0\), cn\);/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler-synth.js', need: [/bool wraps = \(fl & 2\) != 0;/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler-synth.js', need: [/float S = power\(vel \* s, P, L, sigHi, sigLo\);\n\s+if \(wraps\) S \+= power\(\(vel \+ span\) \* s, P, L, sigHi, sigLo\) \+ power\(\(vel - span\) \* s, P, L, sigHi, sigLo\);/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler-synth.js', need: [/uniform float [^;]*\bspan\b/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler.js', need: [/const next = nyq > 0 \? \{ nyq: clamp\(nyq, 5, 400\), base: Math\.round\(clamp\(Number\.isFinite\(b\) \? b : 0\.5, 0\.15, 0\.85\) \* 100\) \/ 100 \} : null;/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  { file: 'src/ui/doppler.js', need: [/if \(next\?\.nyq !== fixed\?\.nyq \|\| next\?\.base !== fixed\?\.base\) \{ fixed = next; scale = null; baseF = null; \}/, 'Doppler aliasing (20 Oct, Mohammad\'s pick 2 from the Doppler papers):'] },
  // ease-family
  { file: 'styles/tokens.css', need: [/--ease-arrive: cubic-bezier\(\.2, \.8, \.2, 1\); --ease-move: cubic-bezier\(\.5, 0, \.5, 1\);/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'styles/tokens.css', need: [/--ease: var\(--ease-arrive\);/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/const camEase = easeMove;/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/const raw = clamp\(\(clock \? clock\(now\) : now - t0\) \/ ms, 0, 1\), u = \(drift \? driftEase : camEase\)\(raw\);/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/const u = camEase\(clamp\(\(performance\.now\(\) - prev\.t0\) \/ prev\.ms, 0, 1\)\);/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/else if \(opt\.scale && !drift && ms > 0\) ms = Math\.min\(ms, Math\.max\(opt\.floor \|\| 0, \(ms > CAM_MS_MAX \? slideMs : camMs\)\(from, to, screenW\(\)\)\)\);/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/animateVT\(to, ms, \{ arc: true, steady: !!opt\.steady, scale: !opt\.steady, slide \}\)/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/animateVT\(to, ms, opt\.steady \? \{ steady: true \} : \{ scale: true, slide: !!opt\.slide \}\); \},/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/stage*', need: [/animateVT\(\{ \.\.\.to \}, ms, \{ scale: true \}\); \},/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/lobule-zoom*', need: [/e = ease === 'in' \? u \* u : easeMove\(u\);/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/lobule-zoom*', need: [/const c0 = v0 \? carryRate\(v0, from, to, Math\.max\(1, snap\.w\)\) \* ms : 0;/, 'One easing family and one duration scale (combined plan M2):'] },
  { file: 'src/ui/lobule-zoom*', forbid: [/CAM_M2|camease/, 'One easing family and one duration scale (combined plan M2):'] },
  // endo-motion
  { file: 'src/ui/instruments.js', need: [/tween\(an\.kn\[i\], knT\[i\], wall, dt \* 1000, BAND_TAU_MS, knT\[i\] \? BAND_DELAY_MS : 0\)/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', forbid: [/const ease = \(t\) => \(t < 0\.5/, 'The scope\'s view eases between states (Mohammad, 17 Oct: (no fixed cubic tween beside the follow)'] },
  { file: 'src/ui/instruments.js', need: [/if \(balA > 0\)/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', need: [/if \(jetA > 0 && bleedLast\)/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', need: [/bleedOpt\.t = still\.matches \? 0\.3 : simTime\(\)/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', need: [/poolA = poolA \? glide\(poolA, poolT, du, 600\) : poolT;/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', forbid: [/if \(f\.params\?\.balloonEso\) \{/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', need: [/if \(glId\) keep\(\); else fadeT0 = -1;/, 'The scope\'s view eases between states (Mohammad, 17 Oct:'] },
  { file: 'src/ui/instruments.js', need: [/G\.image\(null, cx - R, cy - R, 2 \* R, 2 \* R, 1, 'old'\);/, 'The scope\'s view eases between states (Mohammad, 17 Oct: (the old field drawn under the new one while it fades in)'] },
  // gpu-glass-steady
  { file: 'styles/app-*.css', need: [/pz-sheet::after \{ content: ''; --gl-tint: var\(--glass-tint\);/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'styles/app-*.css', need: [/:root, \.stage-wrap\.cmap \{ --glass-tint: color-mix\(in srgb, var\(--surface\) var\(--pz-frost, 66%\), transparent\); --glass-edge: var\(--hairline\); --glass-shadow: none; \}/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"): (the one glass: the surface at --pz-frost, a hairline edge, no drop shadow)'] },
  { file: 'src/ui/glass-gl.js', need: [/const inside = \(p, cr, vw, vh\) => \{\n\s+const l = Math\.max\(p\.r\.left, 0\), t = Math\.max\(p\.r\.top, 0\), r = Math\.min\(p\.r\.right, vw\), b = Math\.min\(p\.r\.bottom, vh\);/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/glass-gl.js', forbid: [/dropHost\(true\); return undefined; \}\n\s+else if \(crosses\(panes, host\.over\?\.\(\)\)\)/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/glass-gl.js', need: [/else if \(nowT - s\.moved < 250\) s\.since = 0;/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/glass-gl.js', need: [/else if \(nowT - s\.since >= 400\) \{ s\.out = want; s\.since = 0; \}/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/glass-gl.js', need: [/hf = hfSet;\n\s+hf\.panes = panes; hf\.cr = cr; hf\.base = [^\n]+\n\s+tellHoles\(panes\);/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/label-gl.js', forbid: [/cutHoles|setHoles|holeMask/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/stage*', need: [/onHoles: frostHoles\('callouts'\)/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/stage*', need: [/onHoles: frostHoles\(key\)/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/stage*', forbid: [/labelHoles|(?:live\.)?labelGL\.holes/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/stage*', need: [/const LABELS_ORDER = -6;/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?veins\.top\.add\(\{ order: LABELS_ORDER, prep: \(\) => \{ if \(!gpuProbe\.skipLabels\) (?:live\.)?labelGL\?\.drawInto\(\); \}, draw: \(\) => \{\} \}\)/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"): (laid before any glass takes its blur)'] },
  { file: 'src/ui/stage*', need: [/function hostFrost\(g, o\) \{ if \(!g \|\| !(?:live\.)?veins\?\.top\) return;/, 'The frosted glass drawn in the figure\'s canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"):'] },
  // heart-glow
  { file: 'src/ui/presenter*', need: [/ra: \{ node: 'RA', organ: 'heart', /, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/presenter*', need: [/heart: \{ organ: 'heart', /, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/stage*', need: [/PIN_ID = \(id\) => \(id === 'heart-ra' \? 'heart' : id\)/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/stage*', need: [/const HEART_GLOW = \{ reach: \d+, alpha: 0\.\d+ \};/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/stage*', need: [/glow: id === 'heart'/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/stage*', forbid: [/HEART_GLOW = \[\[/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe (no stack of stroke layers (they showed as bands))'] },
  { file: 'src/ui/veins-gl.js', need: [/exp\(-4\.5 \* t \* t\)/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe (a Gaussian falloff)'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/gl_FragCoord/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe (dithered, so a long faint ramp does not step)'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/if \(glowOn == 1\) pl = over\(pl, texelFetch\(glowL, ip, 0\)\);/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/veins-gl.js', need: [/vec4 o = over\(fluidC, over\(v, over\(inner, pl\)\)\);/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'src/ui/stage*', forbid: [/org-pin-flat|syncPinFlat/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  { file: 'styles/app-*.css', forbid: [/org-pin-flat/, 'The right atrium\'s slides light the whole heart with a soft glow (not an outline of the atrium alone), and whe'] },
  // hvpg-monitor-reading
  { file: 'src/ui/hvpg-proc.js', need: [/if \(t < T\.inflate\) \{ o\.label = 'FHVP'; o\.num = fmt\(v\.fhvp, 1\)/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (monitor FHVP)'] },
  { file: 'src/ui/hvpg-proc.js', need: [/o\.num = fmt\(t < T\.callout \? pressureAt\(t, v, st\.wave\) : v\.whvp, 1\)/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (monitor WHVP once settled)'] },
  { file: 'src/ui/hvpg-proc.js', need: [/ph === 'free'\) \{ lblF\.text = fm1\(cF, v\.fhvp\);/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (FHVP callout)'] },
  { file: 'src/ui/hvpg-proc.js', need: [/lblW\.text = fm1\(cW, v\.whvp\)/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (WHVP callout)'] },
  { file: 'src/ui/monitor.js', need: [/function fm1\(c, v\) \{\s*if \(!Object\.is\(c\.v, v\)\) \{ c\.v = v; c\.s = fmt\(v, 1\); \}/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (the cached text is fmt of the number)'] },
  { file: 'src/ui/hvpg-proc.js', forbid: [/fm1\([A-Za-z]+, pAt/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (no callout prints the trace height)'] },
  { file: 'src/ui/hvpg-proc.js', need: [/function step\(now\) \{\n\s+const dt = Math\.max\(0, Math\.min\(64, now - last\)\); last = now;/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8.'] },
  { file: 'src/ui/hvpg-proc.js', need: [/at: \(tt, v, w\) => pressureAt\(tt, v, w\),/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (the HVPG script draws the trace on the wave it is handed: the model\'s beat and breath)'] },
  { file: 'src/ui/hvpg-proc.js', need: [/cathA\.u = cruise\(k01\(t, T\.travel0, T\.travel1\)\);/, 'Review #55 (HVPG slide 3): the catheter monitor\'s number read 5.3 while the FHVP callout beside it read 4.8. (the catheter travels at a steady pace)'] },
  // join-trunk
  { file: 'src/ui/vein-joins.js', need: [/addJoin\(st, 2, qx, qy, y\.x\.e\.id === it\.x\.e\.id \? undefined : y\.row, N\)/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/vein-joins.js', need: [/const tk = g\.trunk >= 0 && !ghostAt\(g\.trunk\);\n\s+r\.trunk = tk \? UIT\[g\.trunk\]\.row : trunk;\n\s+r\.fork = tk;/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/float corner\(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role, float kw\)/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/smoothstep\(0\.25 \* rm, 0\.25 \* rm \+ max\(0\.35 \* rm, 0\.9 \* kw\), off\)/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/float off = role == 1 \? o1 : role == 2 \? o2 : min\(o1, o2\);/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(fract\(B\[m\]\) > 0\.1\) \{ tm \|= 1 << s; if \(fract\(B\[m\]\) > 0\.3\) tfm \|= 1 << s; \}/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/int ro = \(jt\[j\] & \(1 << a\)\) != 0 \? 1 : \(jt\[j\] & \(1 << b\)\) != 0 \? 2 : 0;/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/corner\(p, sg\[ta\], sd\[ta\], sr\[ta\], sg\[tb\], sd\[tb\], sr\[tb\], ro, kw\)/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/corner\(p, sg\[ts\], sd\[ts\], sr\[ts\], sg\[to\], sd\[to\], sr\[to\], role, kw\)/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  { file: 'src/ui/veins-gl.js', need: [/int ta = fa \? tn\[a\] : a, tb = fb \? tn\[b\] : b;/, 'Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk,'] },
  // label-repack
  { file: 'src/ui/label-gl.js', forbid: [/function repack\(\)/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', forbid: [/needRepack = true; st\.mode = 'svg'/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/gl\.copyTexSubImage2D\(gl\.TEXTURE_2D, 0, to\.x, to\.y, from\.x, from\.y, w, h\)/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/slot = packer\.alloc\(sw, lay\.h\); if \(slot\) \{ packer\.free\(st\.slot\); st\.slot = slot; \}/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/needRepack = true; st\.wait = true; retry\.add\(g\);/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/\(\(pending\.size > 0 && pending\.has\(g\)\) \|\| \(todo\.size > 0 && todo\.has\(g\)\) \|\| \(st\?\.wait && !stuck && st\.rot === rot\)\)/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/commitRepack\(rp\);/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/const REBUILD_MS = 4, REBUILD_LEAST = 12;/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/if \(\(pass === 0\) !== !st\) continue;/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/if \(did >= REBUILD_LEAST && now >= lookHoldUntil && performance\.now\(\) - now > REBUILD_MS\) \{ over = true; break; \}/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  { file: 'src/ui/label-gl.js', need: [/if \(over\) for \(const g of todo\.keys\(\)\) pending\.add\(g\);/, 'label-gl wiring (source checks, as the other label-gl tests:'] },
  // label-track
  { file: 'src/ui/label-gl.js', need: [/el\.getAnimations\(\{ subtree: true \}\)/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/try \{ list = takeAnims\(g, true\); \} catch \{ list = \[\]; \}/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/const hold = \(ev, ms = 700\) => \{ const g = labelOf\(ev\.target\); if \(g\) \{ keepAnims\(g, true\);/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', forbid: [/labeltrack=0\\b/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/try \{ d = given \|\| \(lk != null \? lookStyles\.describe\(dg, lk, lookSrc, ringBoxOf, geo, g\) : describeBlock\(dg, styleOf, ringBoxOf, geo, g\)\); \}/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/describeMark\(el, styleOf\)/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/if \(!fillT\) fillT = setTimeout\(fillStyles, 0\);/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', between: ['function styleOf(', 'function fillStyles('], forbid: [/getComputedStyle/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },   // (was a slice of the file)
  { file: 'src/ui/label-gl.js', forbid: [/getBoundingClientRect/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/if \(\(needRepack && !stuck\) \|\| rp \|\| todo\.size\) settleSoon\(\);/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  { file: 'src/ui/label-gl.js', need: [/if \(!moving && !pageTex\[1\] && packer\.maxPages > 1/, 'A stand-in for an Animation: its effect\'s keyframes and timing, its current time.'] },
  // leader-end
  { file: 'src/ui/lobule-zoom*', need: [/import \{[^}]*\bleaderEnd\b[^}]*\} from '\.\/leader-end\.js/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/stage*', need: [/import \{[^}]*\bleaderEnd as edgeOf\b[^}]*\bleaderEndRects\b[^}]*\} from '\.\/leader-end\.js/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', forbid: [/setAttribute\('x2', x\)/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/function syncLeaders\(/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/import \{[^}]*\bLONG_LEAD\b[^}]*\} from '\.\/label-place\.js';/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/const nameless = !CORE\.includes\(k\) && !named\(k\);/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/\(nameless && lead > LONG_LEAD \? 1e6/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/const dropCost = \(k\) => \(named\(k\) \? 2e7 : CORE\.includes\(k\) \? 1e7 : 3e4\);/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/placeZones\(fr0, hx, hy, callRingAt\(fr0\)\)/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/const at = zoneSpot\(zTx, zTy, nT, w, hh, hx, hy, zRing, boxes, boxes\.length, !dimmed\(z\.dataset\.target\)\);/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  { file: 'src/ui/lobule-zoom*', need: [/if \(!dimmed\(ZONE_TPL\[i\]\.dataset\.target\)\) zOrder\[nz\+\+\] = i;/, 'A zone name keeps off the lesion ring and off every zone name already placed (lobule-zone-spot.js):'] },
  { file: 'src/ui/lobule-zoom*', need: [/if \(at < 0\) \{ fadeOut\(z\); continue; \}/, 'A zone name keeps off the lesion ring and off every zone name already placed (lobule-zone-spot.js):'] },
  { file: 'src/ui/lobule-zone-spot.js', need: [/overlapLRTB\(box, placed\[i\]\) > 0[\s\S]*?if \(!ringDepth\(box\)\) return j;/, 'A zone name keeps off the lesion ring and off every zone name already placed (lobule-zone-spot.js):'] },
  { file: 'src/ui/stage*', need: [/base - f \* \(LOW\.test\(r\.t\[from\]\) \? X_HEIGHT : 0\.72\) - halo/, 'A leader reaches its label and stops on the edge of what is seen of it:'] },
  // lobule-since
  { file: 'src/ui/lobule-zoom*', need: [/M === 'pressure' \|\| M === 'delta' \|\| M === 'since' \|\| M === 'heat'/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views: (the Change colours serve the lens)'] },
  { file: 'src/ui/lobule-zoom*', need: [/M === 'pressure' \? pressureColor\((?:live\.)?qP\(v\)\) : M === 'heat' \? heatColor\((?:live\.)?qP\(v\)\) : deltaColor\((?:live\.)?qP\(v\)\)/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views: (delta and since share the scale)'] },
  { file: 'src/ui/lobule-zoom*', need: [/m\.mode === 'delta' \|\| m\.mode === 'since' \? deltaColor\((?:live\.)?qP\(d\)\) : pc\(v\)/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views: (a label bar takes the change\'s colour)'] },
  { file: 'src/ui/lobule-zoom*', need: [/L\.aSince \? 'since the slide before'/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views: (the label says what it counts from)'] },
  { file: 'src/ui/lobule-zoom*', need: [/const eased = easeP\.step\(f\.Pf \|\| f\.P\), since = sinceStep\(st\);\n\s+(?:live\.)?model = lobuleStateInto\(modelBuf, f, st, since\.v, eased\.v\);/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views:'] },
  { file: 'src/ui/lobule-zoom*', need: [/const st = store\.get\(\), eased = easeP\.step\((?:live\.)?F\.Pf \|\| (?:live\.)?F\.P\), since = sinceStep\(st\);/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views:'] },
  { file: 'src/ui/lobule-zoom*', need: [/easeP = createEaser\(\); easeS = createEaser\(\); (?:live\.)?rz = null;/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views: (out of sight it takes the reference at once)'] },
  { file: 'src/ui/stage*', need: [/sinceSource\(sinceRef\);/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views:'] },
  { file: 'src/ui/stage*', need: [/import \{ sinceSource \} from '\.\/since-ref\.js/, 'A change-since slide (lens \'since\', ext-highlights.js) in the lobule views:'] },
  // mark-fade
  { file: 'src/ui/stage*', forbid: [/ov\.(stents|plugs|bands)\.append\(/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s (a mark appended without a fade)'] },
  { file: 'src/ui/stage*', need: [/el\.closest\('\[data-(?:live\.)?mk\]'\)\?\.dataset\.mk/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/c\.alpha = d\.alpha \* fadeEase\(d\.fade\)/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/for \(const el of r\.gone\) el\.remove\(\); (?:live\.)?(?:live\.)?mk\.ver\+\+;/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/markA\.end\(\(key, m, fading\) => m\.t === t && \(anat \|\| !m\.anatOnly\) && \(fading \|\| !m\.vessel \|\| E\[m\.vessel\]\?\.vis\)\)/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/if \(glLines\) \{ if \(el\.hasAttribute\('opacity'\)\) el\.removeAttribute\('opacity'\); return; \}/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/sd\.live = e\.code === 'C1' \? clamp\(i \+ 1 - \(bandsShown \?\? \(f\.bands \|\| 0\)\), 0, 1\)/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?catchUp \|\| bandsMoving\(\) \|\| lesionsMoving\(\)\) return false;/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  { file: 'src/ui/stage*', need: [/if \(stepBands\(f, dtW\)\) (?:live\.)?(?:live\.)?widthEasing = true;/, 'The treatment marks on the figure (a stent\'s mesh, sutures, the tie on a divided vein, the cross on a closed s'] },
  // morph-sweep
  { file: 'src/ui/veins-gl.js', need: [/if \(morphOn == 2\) \{ vec2 hc = PT\(id, int\(B\.z \+ 0\.5\)\); hd = max\(hd, /, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(morphOn == 2\) \{ vec2 rc = PT\(id, int\(A\.w \+ 0\.5\)\); lo = max\(lo, /, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/veins-gl.js', need: [/UC\.i1\(u\.morphOn, geo\.morph \? \(geo\.morph\.tight \? 2 : 1\) : 0\);/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', need: [/const MORPH_GPU = typeof Worker !== 'undefined';/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', need: [/if \(\(key !== (?:live\.)?(?:live\.)?vBinKey \|\| grew\) && gpuProbe\.time\(null, 'vessel sync: (?:live\.)?(?:live\.)?morph frame', morphFrame, items\)\) (?:live\.)?(?:live\.)?vBinKey = key;\n\s*else if \(key !== (?:live\.)?(?:live\.)?vBinKey \|\| grew\)/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(morphOn >= 1\) \{ int si = int\(B\.y \+ 0\.5\); A = vec4\(PT\(id, si\), PT\(id, si \+ 1\)\); \}/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(morphOn >= 1\) A = JT\(int\(A\.x \+ 0\.5\)\);/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', need: [/if \((?:live\.)?(?:live\.)?viewXf\) return;/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', need: [/if \((?:live\.)?camMove\) \{ if \(!(?:live\.)?vtGliding\) camSettle\(\); return; \}/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', need: [/writeVT\(u >= 1 \? \{ \.\.\.viewXf\.to \} : viewXfCameraInto\((?:live\.)?viewXf, u, /, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', need: [/const m = viewXfMix\(p, x\.landAt, XF_MIX, true\);\s*xfLayer\(m\.n\);\s*(?:live\.)?labelGL\.crossfade\(m\.o, m\.n\);/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'src/ui/stage*', forbid: [/XF_FADE_MS|xfRamp/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  { file: 'styles/app-*.css', forbid: [/(?:live\.)?morph-fade/, 'The change between the Anatomy and the Circuit drawn on the GPU (2 Nov 2026, "Anatomy to circuit is so laggy"):'] },
  // over-records
  { file: 'src/ui/stage*', need: [/import \{ recordLayer \} from '\.\/over-records\.js/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },
  { file: 'src/ui/stage*', need: [/const recs = recordLayer\(\{ ease: easeArrive, ms: D_SURFACE \}\);/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },
  { file: 'src/ui/stage-resistors.js', need: [/recs\.put\(RES_KEYS\[k\]/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },   // (was a slice of the file)
  { file: 'src/ui/stage-resistors.js', need: [/recs\.drop\(RES_KEYS\[k\]/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },   // (was a slice of the file)
  { file: 'src/ui/stage-resistors.js', need: [/RES_KEYS\[k\] = 'res:' \+ k/, 'The figure\'s kept shapes (src/ui/over-records.js): (each reading\'s record key is res:<name>, made once)'] },
  { file: 'src/ui/stage-resistors.js', forbid: [/setAttribute|classList|\.style\.|setProperty|dataset|createElementNS|cloneNode/, 'The figure\'s kept shapes (src/ui/over-records.js): (a resistor writes no element, class or style)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', forbid: [/res-one|RES_TPL/, 'The figure\'s kept shapes (src/ui/over-records.js): (no resistor element is built)'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?veins\.overlay\.touch\(\);/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },
  { file: 'src/ui/stage*', need: [/if \(recs\.spec\) \{ groups\.set\('rec', \[recGroup\]\); names\.push\('rec'\); \}/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },
  { file: 'src/ui/stage*', need: [/recs\.show\(t > 0\.5 \? 1 : 0, performance\.now\(\)\)/, 'The figure\'s kept shapes (src/ui/over-records.js):'] },
  // paint-gate
  { file: 'src/ui/main.js', need: [/createPaintGate\(\{ ingest: ingestFrame, paint: paintFrame,/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },
  { file: 'src/ui/main.js', need: [/function onFrame\(f\) \{ frameGate\.push\(f\); \}/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },
  { file: 'src/ui/main.js', need: [/host\?\.send\(\{ type: 'painted' \}\)/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', scan: (t) => (t.slice(t.indexOf('function paintFrame'), t.indexOf('function paintFrame') + 400).includes("type: 'painted'") ? ["main.js: paintFrame must not send 'painted' itself: the paint gate's ingest does, once a frame is on screen"] : []) },
  { file: 'src/ui/main.js', need: [/replaceParams\(f\.params\)/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', need: [/timeline\.addEvents\(ev\)/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },   // (was a slice of the file)
  { file: 'src/ui/main.js', need: [/dock\?\.ingest\(f\)/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },   // (was a slice of the file)
  { file: 'src/ui/paint-gate.js', forbid: [/lerp|mix\(|interpolat\w+\(/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },
  { file: 'src/worker-core.js', need: [/samples: packSamples\(samples\),/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },
  { file: 'src/worker-core.js', need: [/if \(f\.samples\) xfer\.push\(f\.samples\.t\.buffer\);/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },
  { file: 'src/worker-core.js', need: [/buf\.subarray\(j \* n, \(j \+ 1\) \* n\)/, 'A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.'] },
  // portal-split
  { file: 'styles/app-*.css', need: [/\.cath-label\.site\.split\[data-rate="mid"\] \{ --sp-c: var\(--caution\)/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'styles/app-*.css', need: [/\.cath-label\.site\.split\[data-rate="hi"\] \{ --sp-c: var\(--danger\)/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'src/ui/stage*', need: [/<span class="sp-h"><em class="sp-n"><\/em><em class="sp-pc">%<\/em><span class="sp-w">bypasses the liver<\/span><\/span>/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'src/ui/stage*', need: [/<span class="sp-bar"><i class="sp-l"><\/i><i class="sp-s"><\/i><\/span>/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'src/ui/stage*', forbid: [/M4 20 C26 20 32 7 60 7/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'styles/app-*.css', forbid: [/\.cath-label\.site\.split svg/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'src/ui/stage*', need: [/follow2\(el\._sh, el\._shW, T, dt, SHOWN_TAU, SPLIT_EPS\)/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'src/ui/stage*', need: [/if \(el\.isConnected\) \{ const r = follow2/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'src/ui/stage*', need: [/prefers-reduced-motion: reduce/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'styles/app-*.css', need: [/\.cath-label\.site\.split \.sp-h \{ width: 12\.6em;/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  { file: 'styles/app-*.css', need: [/\.cath-label\.site\.split, \.app\.presenting \.cath-label\.site\.split \{[^}]*flex-direction: column;/, 'The figure\'s "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split int'] },
  // refine
  { file: 'src/ui/stage*', need: [/const refineHeld = \(\) => (?:live\.)?gestureOn\(\) \|\| !leftAlone\(120\);/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr (a gesture, or an input in the last 120 ms or a finger down)'] },
  { file: 'src/ui/stage*', need: [/const refineWaitFrame = \(\) => new Promise\(refineWaitExec\), refineWaitExec = \(res\) => nextFrame\(res\);/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr'] },
  { file: 'src/ui/stage*', need: [/const refineTurn = \(gone\) => refine\.turn\(refineWaitFrame, refineHeld, gone\);/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr'] },
  { file: 'src/ui/stage*', forbid: [/performance\.now\(\) \+ 6\)/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr'] },
  { file: 'src/ui/stage-plate.js', need: [/await refineTurn\(gone\)/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr'] },   // (was a slice of the file)
  { file: 'src/ui/stage-plate.js', need: [/refine\.spent\(performance\.now\(\) - t0, LAYER_SPENT\[L\]\)/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr (the longest step is named by layer)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/LAYER_SPENT\[L\] = `organ layer \$\{L\}`/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr'] },
  { file: 'src/ui/stage-plate.js', need: [/if \(await refineTurn\(\(\) => seq0 !== (?:live\.)?plateSeq \|\| drops0 !== (?:live\.)?plateDrops \|\| v !== (?:live\.)?veins \|\| !v \|\| v\.lost\) === null\) return false;/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr (reading every organ\'s shapes waits its turn too)'] },   // (was a slice of the file)
  { file: 'src/ui/stage-plate.js', need: [/refineStep\('organ layers: shapes read', bakeAll\)/, 'Optional refinement (the organ pictures made sharper, the gut\'s) shares one small CPU allowance per display fr'] },   // (was a slice of the file)
  // sinusoid-labels-kept
  { file: 'src/ui/sinusoid-view.js', need: [/const endShown = \(key\) => \{/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/\(cap\.on \? 1 : \+readStyle\(e\)\.opacity \|\| 0\) \* \(\+readStyle\(e\.firstElementChild\)\.opacity \|\| 0\) \* \(\+readStyle\(labels\)\.opacity \|\| 0\)\);/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/return \(endOp\[key\] \?\? 0\) \* \(cap\.on \? cap\.at\(key, easeNow\(\)\)\?\.a \?\? 0 : 1\);/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/END_NAMES = \['Portal venule', 'Central vein'\]/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/value = pressTxt\(u, u \? m\.P3 : m\.P1\)/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/region\('hep', 'Hepatocyte'/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/region\('lymph', 'Lymph'/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-gl.js', need: [/float nucAt\(int n, int nsd\) \{ return 38\.0 \* float\(n\) \+ 8\.0 \+ 22\.0 \* h1\(n, nsd\); \}/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-gl.js', need: [/sdE\(q, vec2\(3\.3, th \+ 0\.55 \* det\)\), 0\.9\)/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', scan: (t) => (/S\.por/.test((t.split('\n').find((x) => x.includes('const fenAt = ')) || '')) ? ['sinusoid-view.js: fenAt reads the open share of the wall (S.por): the Fenestrae callout is by place only, its leader never hops as pores close'] : []) },
  { file: 'src/ui/sinusoid-view.js', need: [/const fenAt = \(x\) => calloutPore\(geo\.pores\[0\], x, VW\.fr\[0\] \+ 3, VW\.fr\[1\] - 3, SEED\.nucUp\);/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  { file: 'src/ui/sinusoid-view.js', need: [/leader\('fen', rf, xp, -\(halfW\(xp\) \+ UM\.endo \* 0\.5\)\)/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct: (the callout ends on the pore\'s gap in the lining)'] },
  { file: 'src/ui/sinusoid-view.js', need: [/leader\('fen', region\('fen', 'Fenestrae', fenTxt\(\), x, -midTall\(x\)\), xp, -\(halfW\(xp\) \+ UM\.endo \* 0\.5\)\)/, 'The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct:'] },
  // slide-ext
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bEXT\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (EXT: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bexpandIds\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (expandIds: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bstepExtra\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (stepExtra: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bmarkLabel\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (markLabel: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bfigureHooks\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (figureHooks: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bsafe\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (safe: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter*', need: [/import \{[^}]*\bwarmOf\b[^}]*\} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9): (warmOf: the presenter (a part of it) reads the registry)'] },
  { file: 'src/ui/presenter-tools.js', need: [/import \{ EXT, guard, safe \} from '\.\/slide-ext\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9):'] },
  { file: 'src/ui/presenter-tools.js', need: [/import \{ talkTrace \} from '\.\/talk-trace\.js'/, 'The deck visuals packages\' plug-in points (src/ui/slide-ext.js, review/deck-visuals-recs.md §9):'] },
  // sweep-fixes-2-brackets
  { file: 'src/ui/decks/lobule.js', need: [/id: 'wedge'[^\n]*tool: \{ kind: 'profile' \}/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/const ws = Math\.max\(tw\(name, 600\), tw\(s, 700\)\);/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/const lw = z \* tw\(`\$\{name\} \$\{s\}`, 700\);/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/const wide = \(x1 - x0 - lw\) \/ 2 - LABEL_PAD >= BAR_MIN;/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/if \(!\(hi - lo >= x1 - x0 - 0\.5\)\) \{ {3}\/\/ \(the bar, broken round the label\)/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/if \(!b \|\| b\.a !== a\) \{ blkS\[i\]\.from = reduceMQ\.matches \? a : b \? blkOp\(b, t\) : 0; blkS\[i\]\.a = a; blkS\[i\]\.t0 = t; blkLive\[i\] = 1; \}/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/if \(blkLive\[i\] && t - blkS\[i\]\.t0 < FADE_MS\) fading = true;/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'src/ui/tool-profile.js', need: [/sv\('rect', \{ class: 'pz-hb', 'data-look': 'card\.hatch\.bg', width: s, height: s \}\), sv\('rect', \{ class: 'pz-hs', 'data-look': 'card\.hatch\.stripe', width: s \/ 2, height: s \}\)/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  { file: 'styles/app-*.css', forbid: [/\.pz-hs \{/, 'The sweep\'s bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder\'s phone strip:'] },
  // tile-bar
  { file: 'src/ui/hvpg-proc.js', need: [/for \(let ki = 0; ki < 2; ki\+\+\) \{\s*const k = KEYS2\[ki\];\s*const sk = shown\[k\] \? sevOfRead\(k, v\[k\]\) : '';/, 'Each data card tile\'s scale bar (layout A):'] },
  { file: 'src/ui/hvpg-proc.js', need: [/const KEYS3 = \['fhvp', 'whvp', 'hvpg'\], KEYS2 = \['fhvp', 'whvp'\];/, 'Each data card tile\'s scale bar (layout A):'] },
  { file: 'styles/app-*.css', need: [/\.hvpg-kv dd \{[^}]*transition: none/, 'Each data card tile\'s scale bar (layout A): (the colour is taken with the reading (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once))'] },
  { file: 'styles/app-*.css', need: [/\.pz-tile:has\(\.pzb-was:not\(\[hidden\]\)\) \.pzt-d \{ visibility: hidden; \}/, 'Each data card tile\'s scale bar (layout A): (the ring\'s change line folds out of sight, not out of the layout)'] },
  { file: 'src/ui/presenter*', need: [/const bar = h\('span', \{ class: 'pzt-bar'/, 'Each data card tile\'s scale bar (layout A): (every tile has a bar, an empty one with no scale)'] },
  { file: 'src/ui/presenter*', need: [/h\('span', \{ class: 'pzt-vu'[^\n]*\}, v, u\), r, d, bar\);/, 'Each data card tile\'s scale bar (layout A): (every tile has its change line)'] },
  { file: 'styles/app-*.css', need: [/\.pz-tile \.pzt-bar \{[^}]*height: calc\(/, 'Each data card tile\'s scale bar (layout A): (the bar has a fixed height)'] },
  { file: 'styles/app-*.css', need: [/\.pzt-bar\.empty \{ visibility: hidden; \}/, 'Each data card tile\'s scale bar (layout A): (a tile with no scale keeps the room, so a row stays one height)'] },
  { file: 'src/ui/presenter-cards.js', need: [/12 \/ uf/, 'Each data card tile\'s scale bar (layout A): (the unit stops at 12 px)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-cards.js', need: [/Math\.max\(12,/, 'Each data card tile\'s scale bar (layout A): (the number never goes below 12 px)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-cards.js', need: [/lineHeight = vs\.lineHeight/, 'Each data card tile\'s scale bar (layout A): (the line keeps its height, so the card never changes size)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-cards.js', need: [/p\.fin/, 'Each data card tile\'s scale bar (layout A): (measured with the number it counts to as well)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-cards.js', need: [/\(tileRO = new ResizeObserver\(fitSoon\)\)\.observe\(el\)/, 'Each data card tile\'s scale bar (layout A): (again when the row changes size)'] },   // (was a slice of the file)
  { file: 'src/ui/presenter-cards.js', need: [/p\.fin = tileVal\(p\.k, to\[p\.k\], to\);\s*if \(!tileGlide\(to, ms\)\) draw\.go\(to, ms\);[^]*?const shape = parts\.map\(\(p\) => `\$\{p\.fin\}\|\$\{vText\(p\)\.length\}`\)\.join\(\);\s*if \(shape !== fitShape\) \{ fitShape = shape; fitSoon\(\); \}/, 'Each data card tile\'s scale bar (layout A): (every set fits)'] },   // (was a slice of the file)
  // varix-look
  { file: 'src/ui/stage*', need: [/import \{ LOOK_SITE, varixHold, varixOpacity, varixSize, varixSpreadK, varixWidthK \} from '\.\/varix-look\.js/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/stage*', need: [/varixS\.VAR = varixSize\('VAR', varixHold\(varixHeld\.VAR, f\.metrics\?\.varix\?\.d\)\); varixS\.GV = varixSize\('GV', varixHold\(varixHeld\.GV, f\.metrics\?\.gastricVarix\?\.d\)\);/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/stage*', need: [/if \(LOOK_SITE\[e\.id\] && mode !== 'flow' && !isOccluded\(p, e\.id\)\) w = Math\.max\(Math\.min\(w, vesselPx\(dMinOf\(e\)\)\), w \* lerp\(varixWidthK\(varixS\[LOOK_SITE\[e\.id\]\]\), 1, t\)\);/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/stage*', need: [/LOOK_SITE\[e\.id\] \? varixOpacity\(varixS\[LOOK_SITE\[e\.id\]\]\) : 1\)/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/stage*', need: [/const fan = sd\.off \* \(1 - t\) \* \(g\.spr \?\? 1\);/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/stage*', need: [/const sprT = isOccluded\(p, x\.e\.id\) \? 1 : varixSpreadK\(varixS\[LOOK_SITE\[x\.e\.id\]\]\)/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/stage*', need: [/varixHeld\.VAR\.snap = varixHeld\.GV\.snap = f\.running === false \|\| !!f\.jump;/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/instruments.js', need: [/import \{ varixMean \} from '\.\/varix-look\.js';/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/instruments.js', need: [/mvHeld\.snap = f\.running === false \|\| !!f\.jump;/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/instruments.js', need: [/const dMean = varixMean\(mvHeld, vx\.d, wall\), kb = mvHeld\.k;/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are",'] },
  { file: 'src/ui/instruments.js', forbid: [/Math\.exp\(-dt \/ 4\)/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are", (no slower mean of its own)'] },
  { file: 'src/ui/instruments.js', need: [/if \(busy && !raf\) raf = drawFrame\(redraw\);/, '29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are", (a paused model\'s field finishes its ease)'] },
  // veins-tint
  { file: 'src/ui/veins-gl.js', need: [/layout\(location=3\) out vec4 outDep;/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/float aL = clamp\(0\.5 - D \/ aa, 0\.0, 1\.0\);\n\s*if \(aL > 0\.0\) dep = true;/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/if \(gv > 0\.0 && ge\.z > 0\.5\) dep = true;\n\s*if \(up\) \{ if \(gv > lgU\.a\) lgU = vec4\(\(ge\.z > 0\.5 \? scol\[s\]/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/col \+= w \* scol\[s\]/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/outColor = ditherOut\(o, q\);\n\s*outDep = vec4\(dep \? 1\.0 : 0\.0\);/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/veins-gl.js', need: [/gl\.framebufferTexture2D\(gl\.FRAMEBUFFER, gl\.COLOR_ATTACHMENT3, gl\.TEXTURE_2D, null, 0\);/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },
  { file: 'src/ui/veins-gl.js', forbid: [/\bspare\b/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },
  { file: 'src/ui/veins-gl.js', need: [/for \(const t of \[baseTex, gTex, gTex2\]\)/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },
  { file: 'src/ui/veins-gl.js', need: [/gl\.bindTexture\(gl\.TEXTURE_2D, depNone\)/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },
  { file: 'src/ui/stage*', need: [/pendRows\.length = 0;\n\s+if \((?:live\.)?veinsRows\.size\) (?:live\.)?veinsRows\.forEach\(pendPush\);\n\s+const pending = pendRows\.length \? pendRows : null;/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', forbid: [/(?:live\.)?veinsRows\.clear\(\)/, 'Shape apart from colour in the vessel layer (veins-gl.js): (never cleared before a draw has shown them)'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/if \((?:live\.)?veins\.drawRows\(T, (?:live\.)?vLook, (?:live\.)?bloodLook\(\), pending, fullComposite\)\) \{ rowsShown\(\); return true; \}/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/const rows = (?:live\.)?veinsDirty \? null : pending \|\| NO_ROWS;/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },   // (was a slice of the file)
  { file: 'src/ui/lobule-zoom*', need: [/if \(!g\.drawRows\(T, look, blood, rows\)\) \{ g\.draw\(T, look, blood, rows\); tLast \^= 1; \}/, 'Shape apart from colour in the vessel layer (veins-gl.js):'] },
  // venous-stent
  { file: 'src/ui/stage*', need: [/function meshPaths\(id, p, d0, d1, k = 1, ends = true, bare = 0\)/, 'A vein a slide shows stented (slide field `stented`): (one mesh for the TIPS and the veins)'] },
  { file: 'src/ui/stage-venous.js', need: [/stentFade\(`vst:\$\{id\}`, a\)/, 'A vein a slide shows stented (slide field `stented`): (the whole stent at one strength, by its key (the GPU lays it on the draws))'] },   // (was a slice of the file)
  { file: 'src/ui/stage*', need: [/meshPaths\(id, p, d0, d1, 1, false, tips \? tipsBare\(id\) : 0\)/, 'A vein a slide shows stented (slide field `stented`): (the whole mesh, built once)'] },
  { file: 'src/ui/stage*', need: [/putMark\(ov\.stents, `stent:\$\{id\}`, id, meshPaths\(id, p, 2, geo\[id\]\.len - 2\)\)/, 'A vein a slide shows stented (slide field `stented`): (the DIPS and the stent tool\'s shunts: the whole drawn shunt, faded in and out)'] },
  { file: 'src/ui/stage*', need: [/if \(id === 'TIPS'\) return;/, 'A vein a slide shows stented (slide field `stented`): (the TIPS is the covered stent, unrolled with the veins\' (D4))'] },
  { file: 'src/ui/stage*', need: [/venousSync\(p, t < 0\.5, key !== (?:live\.)?overlayKey\)/, 'A vein a slide shows stented (slide field `stented`): (followed on every overlay update)'] },
  { file: 'src/ui/stage*', need: [/(?:live\.)?easeInOut\(v\.k\)/, 'A vein a slide shows stented (slide field `stented`): (it eases, never snaps)'] },
  { file: 'src/ui/stage*', need: [/const step = fadeStep\(dt, goal \? VST_MS : VST_MS \* 0\.6\)/, 'A vein a slide shows stented (slide field `stented`): (reduced motion fades it over a short step, never in one (15 Nov 2026))'] },
  { file: 'src/ui/presenter*', need: [/stented: stentedOf\(s\)/, 'A vein a slide shows stented (slide field `stented`): (a landing slide sets its veins)'] },
  { file: 'src/ui/presenter*', need: [/stented: stentedKept\(s\)/, 'A vein a slide shows stented (slide field `stented`): (leaving a slide keeps only the veins the next one stents too)'] },
  { file: 'src/ui/presenter*', need: [/stented: \[\]/, 'A vein a slide shows stented (slide field `stented`): (ending the presentation clears them)'] },
  // vessel-taper
  { file: 'src/ui/stage*', need: [/import \{ chainsOf, planChainInto \} from '\.\/vessel-taper\.js/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/const plainRow = \(row\) => \{ const it = rowIt\[row\]; return !!it && it\.kind !== 's' && !it\.ra && !!it\.obj\.glR0; \};/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/L\.chained = !L\.fork && plainRow\(L\.a\) && plainRow\(L\.b\);/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/tapChains = chainsOf\(tapIds, tapLinks\)\.filter\(\(c\) => c\.length >= 2\);/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/planChainInto\(chain, tapBodyOf, tapLenOf, tapPlanOf, tapS, tapY, tapD, tapH, tapK\);/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/E\[i\] = R0\[i\] \* \(\(\(2 \* u3 - 3 \* u2 \+ 1\) \* y0 \+ \(u3 - 2 \* u2 \+ u\) \* len \* d0 \+ \(-2 \* u3 \+ 3 \* u2\) \* y1 \+ \(u3 - u2\) \* len \* d1\) \/ body\);/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/if \(L\.chained\) continue;/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', need: [/if \(fork\) \{/, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  { file: 'src/ui/stage*', forbid: [/svgTaper|const TP = /, 'Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov:'] },
  // menu (the deck's short name sits in a tab at the teaching card's top right corner; the search keeps the keyboard down on touch)
  { file: 'src/ui/presenter*', need: [/const deckTab = [^\n]*(?:live\.)?deck\?\.head \|\| \((?:live\.)?deck\?\.title\?\.length <= 24/, 'the teaching card carries the deck name in a corner tab (short head, else a short title)'] },
  { file: 'src/ui/presenter*', need: [/h\('div', \{ class: 'pz-shade' \}, deckTab\(\)/, 'the teaching card shows the deck tab'] },
  { file: 'src/ui/presenter*', need: [/const tab = s\.visual !== 'outline' && deckTab\(\)/, 'visual slides show the tab; the outline slide names the talk in full instead'] },
  { file: 'src/ui/presenter*', need: [/h\('span', \{ class: 'pz-sitetab', hidden: true \}\)/, 'the site tag stays on the left, the deck tab\'s mirror'] },
  { file: 'styles/app-*.css', need: [/\n\.pz-tabname \{[^}]*top: 0; right: 0;/, 'the deck tab is flush with the card\'s top and right edges'] },
  { file: 'styles/app-*.css', need: [/\n\.pz-tabname \{[^}]*border-radius: 0 var\(--pz-tab-ro, 0px\) 0 /, 'only the tab\'s bottom left corner is rounded'] },
  { file: 'styles/app-*.css', need: [/\n\.pz-tabname \{[^}]*white-space: nowrap/, 'the deck tab is never cut short'] },
  { file: 'styles/app-*.css', forbid: [/\n\.pz-tabname \{[^}]*(ellipsis|overflow: hidden)/, 'the deck tab is never cut short'] },
  { file: 'styles/app-*.css', need: [/--pz-tabf: calc\(12px \* var\(--ts, 1\)\)/, 'the deck tab text is never under 12 px'] },
  { file: 'styles/app-*.css', need: [/--pz-tabf: max\(12px, /, 'the deck tab text is never under 12 px'] },
  { file: 'src/ui/menu.js', need: [/const fine = matchMedia\('\(hover: hover\) and \(pointer: fine\)'\);/, 'the menu focuses its search only with a fine pointer, never on a touch screen'] },
  { file: 'src/ui/menu.js', between: ['    open(section, opts = {}) {', 'const scrollTo = () =>'], exactly: [/\.focus\(/g, 1, 'one focus call when the menu opens'] },
  { file: 'src/ui/menu.js', need: [/el\.querySelector\(sheet \|\| !fine\.matches \? '\.um-x' : '\.um-q'\)\.focus\(\{ preventScroll: true \}\);/, 'on open the menu focuses the close button on touch and in the sheet, the search only with a mouse'] },
];
