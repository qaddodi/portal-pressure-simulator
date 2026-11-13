// Every theme-varying token, per look and per view: the one place a colour that changes with the look is written down.
// styles/tokens.css is PRINTED from this file (scripts/gen-theme-css.mjs, `npm run gen:theme`; `npm run lint` fails when the two differ), so
// the page's CSS and the charts' own drawing code (src/ui/chart-looks, svg-gl) read one set of values and cannot disagree.
//
// Names are the CSS custom properties without the leading "--". Values are CSS text as the stylesheet had them, so var() and color-mix()
// stay as written (the resolver turns them into numbers). A look lists only what it changes: `from` names the look it starts from.
//   light  the base (:root)
//   soft   Light's warm, low-glare paper
//   dark   the Dark look. The system dark theme (prefers-color-scheme with no chosen look) takes the same values.
//   navy, black   palettes of Dark: the page keeps data-theme="dark" and adds data-palette
// 'color-scheme' is the CSS property of that name, not a custom property.
//
// Tokens that never change with the look (durations, fonts, sizes, ramps, one-theme colours) stay hand-written in styles/tokens.css.

export const TOKENS = {
  light: {
    // surfaces
    'bg': '#F1EBE0',   // ground: page and figure share the paper
    'stage-bg': '#F1EBE0',
    'surface': '#FCF9F3',
    'surface-2': '#F5F0E6',
    'surface-3': '#E9E2D4',
    'glass': 'rgba(252, 249, 243, .92)', 'frost': 'rgba(252, 249, 243, .42)',
    'scrim': 'rgba(34, 28, 20, .4)',

    // lines
    'hairline': 'rgba(70, 52, 30, .10)',
    'border': '#DDD3C1',
    'border-strong': '#C2B49C',

    // ink
    'text': '#1B1710',
    'text-2': '#463F34',
    'text-3': '#5A5347',   // ≥ 4.5:1 on every light surface
    'text-inverse': '#FFFFFF',

    // accent
    'brand-bg': '#1B1710',
    'accent': '#2E4BB8',
    'accent-ink': '#243C96',
    'accent-soft': 'rgba(46, 75, 184, .10)',
    'accent-line': 'rgba(46, 75, 184, .34)',
    'focus': '#2E4BB8',   // (the accent itself, not a UI kit's stock blue: DG3)

    // status (always paired with a label or icon)
    'ok': '#157A58',
    'caution': '#B07A0A',
    'danger': '#C23F2A',
    'critical': '#85190F',
    'info': '#2E4BB8',
    'disease': '#8A3FB5',   // a disease name in a teaching card (pz-dz)

    // flow semantics
    'flow-normal': '#16988F',
    'flow-reversed': '#EC7424',
    // lens ramps ("#colour position", interpolated in OKLab by colormap.js; pressure positions are mmHg, the others run 0 to 1)
    // (pressure: lightness falls at every stop, so 12 and 20 mmHg differ on a projector or a printout as well as in hue (round 2 review A7,
    // Mohammad 18 Oct). The hue turns where the meaning turns: blue to 8 or so, the violet turn centred on 10 to 12 and a richer violet there,
    // magenta by 16, wine from 20 (looks review, 31 Oct). Linen's pale end is #B8D5ED 0, #85B6E9 5 (visual-style C2): the old #DCEBF7 was ΔE 3.9 from the paper.)
    'ramp-pressure': '#B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30',
    'ramp-flow': '#9CC7B5 0, #72BFA4 .25, #3EAA98 .5, #1E6F8C .75, #1B366A 1',
    // (velocity against each vessel's normal: sand below it, teal within it, violet above it (thirds of the scale))
    'ramp-velocity': '#C9973F 0, #E2CF9A .2, #5DB4A4 .5, #9A7ED6 .8, #4A2A8C 1',
    'ramp-heat': '#B4B8C2 0, #F4D35E .12, #F08A24 .45, #D7263D .75, #6E0B2E 1',
    'ramp-drop': '#DCE6D2 0, #A8C97A .3, #4F8C3C .65, #1D4724 1',
    // anatomy plate: tissue tones [light face, shaded face, outline], muted so vessels lead
    'og-liver-1': '#e3b8a7', 'og-liver-2': '#c6826d', 'og-liver-3': '#97513e',
    'og-stomach-1': '#edcec2', 'og-stomach-2': '#d9a08c', 'og-stomach-3': '#a46854',
    'og-eso-1': '#eac7b8', 'og-eso-2': '#d59c88', 'og-eso-3': '#a16b5b',
    'og-spleen-1': '#d2b2c7', 'og-spleen-2': '#a57695', 'og-spleen-3': '#754b67',
    'og-panc-1': '#edd9a8', 'og-panc-2': '#d6b570', 'og-panc-3': '#a1803a',
    'og-kidney-1': '#d9a4bc', 'og-kidney-2': '#a55e85', 'og-kidney-3': '#6a3154',
    'og-gb-1': '#cad8a4', 'og-gb-2': '#98b16d', 'og-gb-3': '#627d40',
    'og-gut-1': '#eed2c2', 'og-gut-2': '#dcad95', 'og-gut-3': '#a77960',
    'og-heart-1': '#e9aca1', 'og-heart-2': '#ca7768', 'og-heart-3': '#94483d',
    'og-ra-1': '#e1998f', 'og-ra-2': '#c06456', 'og-ra-3': '#893c33',
    'og-light': 'rgba(255, 255, 255, .55)', 'og-dark': 'rgba(60, 22, 18, .26)', 'og-ao': 'rgba(70, 40, 30, .09)',
    // the gut's lit strip (organ picks, 20 Oct): the light tone mixed in by --og-light's own strength (x .4), as a solid colour
    'og-hi': 'rgb(255 255 255)', 'og-hi-k': '22%', 'gut-rim-k': '64%',
    // the gut's see-through strength (colon, small bowel, duodenum)
    'gut-a': '.66',   // as strong as the other organs (.55): at .28 it was too close to the background (Mohammad, 20 Oct)
    // the congested liver's nutmeg (organ picks, 20 Oct: "even dusk", faintest islands): an even dusky tone, pale islands
    'lv-cong-base': '#6E1F38', 'lv-cong-base-a': '.44', 'lv-cong-isl': '#E3C0A0', 'lv-cong-isl-a': '.11',
    'organ-body': '#E8DFD0',
    'organ-body-line': '#CFC1AA',
    'organ-liver': '#905b49',
    'organ-spleen': '#7a5f78',
    'organ-gut': '#a88570',
    'organ-stomach': '#a67a6c',
    'organ-heart': '#9d575c',
    'organ-kidney': '#895f7a',
    'organ-lung': '#AFC0D2',
    'organ-pancreas': '#a89567',
    'organ-gb': '#79886b',
    'organ-aorta': '#b09d98',
    'organ-a': '.44',
    'organ-tint': '18%',
    'diaphragm': '#886b59',
    'artery': '#c91f36',
    'casing-rgb': '59 44 34', 'casing-a': '.64',   // (the Tube's one outline ink: a warm sepia, #3B2C22; Mohammad, 13 Nov 2026, outlines A: the vessels' own deep tone read navy on the paper)
    'vessel-casing': 'rgb(var(--casing-rgb) / var(--casing-a))',
    'ascites': '#E0C677', 'ascites-a': '.4',   // a faint pale-straw wash, translucent so the organs read through
    'stage-grid': 'rgba(100, 72, 36, .06)',
    'leader': 'rgba(44, 38, 30, .5)',
    'vein-portal': 'var(--tour-portal)',
    'vein-systemic': 'var(--tour-sys)',
    'arrow-ink': 'rgba(24, 26, 34, .78)',
    'label-halo': 'rgba(241, 235, 224, .92)',
    'label-panel': 'rgba(241, 235, 224, .74)',   // a reading's panel on the figure: the paper itself at 72 %, the halo does the separating (looks review F8); dark: the ground
    'doppler': '#22C38E',
    'dop-head-rim': '#000000', 'dop-head-ink': '#FFFFFF',   // the probe head's outer rim and its inner line: black and white on the light looks, swapped on the dark ones (a true colour inversion, 8 Nov)
    'dop-face': '#15181D',   // the Doppler probe's front band (the face that touches the skin): dark on the light looks' cream body, light on the dark looks' dark one (the exact inverse, 8 Nov)
    'dop-glow': '#1F2433',   // the Doppler's vessel glow, beam and probe light on the figure (white on the dark themes): 19 Oct, the green read as "normal"
    'vel-ink': '45%',   // a stent point's number: how much of its velocity colour, the rest the text's (4.5:1 at least on the light stage)

    // rendering: organ lighting, vessel tubes, background plane, circuit map
    'shadow-rgb': '46 22 34', 'shadow-a': '.15', 'vessel-shadow': 'rgb(var(--shadow-rgb) / var(--shadow-a))',
    'tube-shade': '.24', 'tube-sheen': '.42',
    'vessel-knock-a': '0',   // the paper gap where vessels of one tier cross (veins-gl.js, visual-style V2): PARKED on every look (8 Nov 2026). It cut the lower vessel round the end of one that joins it (hepatic veins into the IVC, branches off a trunk) with a black cap on the dark looks; it needs the joins listed before it comes back
    'vessel-rim-a': '0',   // a dark lumen's light rim (veins-gl.js, visual-style V1): off on the light looks, whose dark casing already edges it
    'organ-cast': 'rgba(80, 44, 40, .15)',
    'tex-a': '.11', 'lit-hi': '.4', 'lit-lo': '.13',
    'spine': 'rgba(124, 150, 255, .09)', 'map-dot': 'rgba(160, 182, 255, .11)',
    'fx-ink': 'rgba(22, 24, 29, .88)',
    'stent-metal': '#667285', 'suture-thread': '#E8742A', 'suture-edge': '#3a1d0a', 'stent-marker': '#545D6C', 'stent-alpha': '.5', 'stent-glint': '.24', 'stent-rail-w': '1.15', 'stent-strut-w': '.8',
    // ── BEGIN device materials (visual-style D1): one table per look, read by the catheter shader (stage-cath.js, eus-scope.js: through toRGB), the tamponade marks (app.css) and the clots ──
    // poly: the catheter's shaft (a blue-grey body that shows on paper) and its dark hairline; scope*: the EUS echoendoscope (insertion tube, rigid tip, transducer face, port) and its hairline
    // (dark on the light looks, light on the dark ones); latex: compliant balloons (HVPG wedge, BRTO / BATO occlusion, tamponade; -a: the tamponade fill); nylon: the TIPS dilation balloon; steel: needles, wire;
    // platinum: marker bands and coils; glue: the cyanoacrylate cast (EUS coils and glue); ptfe: the covered stent's cover (D4)
    'dev-poly': '#9AA9BC', 'dev-poly-edge': '#2A303B',
    'dev-scope': '#2B2E33', 'dev-scope-tip': '#5C5E66', 'dev-scope-face': '#C7C9CC', 'dev-scope-edge': '#0B0D12', 'dev-port': '#0D0D0F',
    'dev-latex': '#DDB262', 'dev-latex-edge': '#8F6A33', 'dev-latex-a': '.45', 'dev-nylon': '#C9D9EE',
    'dev-steel': '#7C8696', 'dev-platinum': '#8E949E', 'dev-glue': '#3B4E6B', 'dev-ptfe': '#D9DEE5', 'dev-tips-mesh': '#2A3650', 'dev-graft': '#F8F7F4', 'dev-stent-wire': '#B8975C', 'dev-stent-glint': '#F1E1B8', 'dev-stent-gold': '#D9B263',
    // ── END device materials ──
    // chart series (validated categorical order, light)
    's1': '#2a78d6', 's2': '#eb6834', 's3': '#1baf7a', 's4': '#eda100', 's5': '#e87ba4', 's6': '#008300', 's7': '#4a3aa7', 's8': '#e34948',
    'grid': '#E2DACB',
    // pressure-over-time traces: the plate's own vessel hues (portal magenta, wedged orchid,
    // hepatic blue), then quieter inks for the rest
    'tr-pv': '#B01E62', 'tr-wedge': '#A52DA9', 'tr-hv': '#2A78D6', 'tr-ra': '#5B6270', 'tr-ivc': '#059bae', 'tr-var': '#ee5d26', 'tr-cav': '#7a933f', 'tr-sv': 'var(--origin-spleen)', 'tr-smv': 'var(--origin-smv)', 'tr-imv': 'var(--origin-imv)', 'tr-scler': '#9a5505',
    'axis': '#B9AE98',
    'shadow-menu': 'calc(6px * var(--light-slant)) 6px 20px rgb(var(--shadow-rgb) / .1), calc(1px * var(--light-slant)) 1px 3px rgb(var(--shadow-rgb) / .06)',
    'shadow-dialog': 'calc(18px * var(--light-slant)) 18px 48px rgb(var(--shadow-rgb) / .16), calc(4px * var(--light-slant)) 4px 12px rgb(var(--shadow-rgb) / .08)',
    'shadow-1': '0 0 0 1px var(--hairline)',
    'shadow-2': 'var(--shadow-menu)',
    'shadow-3': 'var(--shadow-dialog)',
    // ink on filled controls and badges
    'on-accent': '#FFFFFF', 'on-status': '#FFFFFF',
    // pathology and devices on the plate
    'skin': '#E9C9B4',
    'bile-duct': '#7C8040',
    // lobule and sinusoid figures: septa, nodules, acinar zones (1 oxygen-rich to 3), and the cells' labels
    'lv-sep': '#FFF4E6', 'lv-nod': '#C9955C',
    'zone-1': 'rgb(186, 66, 48)', 'zone-2': 'rgb(150, 100, 32)', 'zone-3': 'rgb(96, 72, 182)',
    'sv-lumen-hidden': '#A0939C', 'sv-fenestra': '#56688A', 'sv-disse': '#4F7440', 'sv-hsc': '#93603F', 'sv-kupffer': '#5E4690', 'sv-hepatocyte': '#A0625A',
    'albumin': '#E39A1E',
    // guided tour: portal and systemic sides
    'tour-portal': '#B8326F', 'tour-sys': '#3F7FCB',
    // timeline time-lapse, and a wrong answer in the exam review
    'lapse-ink': '#8a5200',
    // lobule art (canvas): tract, congestion, nutmeg, acinar zone fills, cells, lymph, albumin beads, collagen
    'collagen': 'rgb(237, 222, 186)', 'lz-field-sin-pale': 'var(--collagen)',
    // the lobule's fibrous bands, tracts and cuffs: a deeper tan in light and Soft so they read on the pale cells (dark: the collagen)
    'lz-septum': 'rgb(206, 178, 130)',
    'lz-zone-line': 'rgba(60, 40, 60, .28)',
    'lz-nodule-ink': 'rgba(110, 60, 84, .22)', 'lz-nodule-shadow': 'rgba(110, 50, 50, .3)', 'lz-plate-line': 'rgba(80, 50, 50, .14)',
    'lz-duct-cell': '#A3A55F', 'lz-duct-edge': 'rgba(66, 68, 28, .5)', 'lz-duct-nucleus': '#5A5D2A', 'lz-duct-lumen': '#6B6E36',
    'lz-lymph': 'rgba(150, 186, 140, .42)', 'lz-albumin-ring': 'rgba(255, 255, 255, .95)',
    'lz-collagen': '#966828', 'lz-rbc': 'rgba(150, 18, 40, .8)',
    // sinusoid art (WebGL): cells, lymph by protein (low, mid, high), albumin
    'sv-gl-nucleus': '#844664', 'sv-gl-basement': '#967646', 'sv-gl-endothelium': '#B8B0CC', 'sv-gl-endo-sheet': '#D2CBE6', 'sv-gl-endo-edge': '#5A5082',
    'sv-gl-endo-nucleus': '#8072A0', 'sv-gl-hsc-quiet': '#E0B896', 'sv-gl-hsc-active': '#BE805E',
    'sv-gl-hsc-nucleus': '#925A42', 'sv-gl-kupffer': '#B296D6', 'sv-gl-kupffer-nucleus': '#6C509C',
    'sv-gl-kupffer-edge': '#60468E', 'sv-gl-rbc': '#CC4A50', 'sv-gl-albumin-edge': '#8C4C00',
    'sv-gl-lymph-lo': '#EBF0E0', 'sv-gl-lymph-mid': '#E0EBD1', 'sv-gl-lymph-hi': '#D1E3BD',
    // ── WP10, fluid + lumen (the vessel cross-section's clot and its numbers; one value in every look) ──
    'thrombus': '#5A1A24', 'thrombus-edge': '#36101A',
    'gl-in-ink': '#FFFFFF', 'gl-in-edge': 'rgba(20, 8, 14, .7)',

    // WP11 (card diagrams, the lobule leaders): flat colours the same in every look, read by chart-looks/card.js (the pressure ramp's 12 and 20 mmHg stops; the hepatocyte)
    'ramp-violet': '#925CDD', 'ramp-wine': '#A4216E', 'pz-hepatocyte': '#C58B5C', 'fibroscan': '#f0924a',

    'pze-black': '#000000',   // (the dark looks' zone tints are mixed over it; the same as --black)
    // WP9 plane (chart-looks/plane.js reads the same mixes as numbers; these are printed for the keys' swatches, .pze-key and .pze-ckey): a zone's fill and its words' ink
    // (blue, and the pressure ramp's violet and wine stops; quieter tints of the same colours, Mohammad 29 Oct, each still 30 apart from the others, plane-callouts test)
    'pze-ok': 'color-mix(in srgb, var(--ok) 28%, var(--surface))', 'pze-mid': 'color-mix(in srgb, var(--caution) 40%, var(--surface))', 'pze-hi': 'color-mix(in srgb, var(--danger) 30%, var(--surface))',
    'pze-ok-ink': 'color-mix(in srgb, var(--ok) 55%, var(--text))', 'pze-mid-ink': 'color-mix(in srgb, var(--caution) 40%, var(--text))', 'pze-hi-ink': 'color-mix(in srgb, var(--danger) 55%, var(--text))',
    'pze-ppg': 'color-mix(in srgb, var(--tr-hv) 32%, var(--surface))', 'pze-hvpg': 'color-mix(in srgb, var(--ramp-violet) 24%, var(--surface))', 'pze-both': 'color-mix(in srgb, var(--ramp-wine) 26%, var(--surface))',
    'pze-ppg-ink': 'color-mix(in srgb, var(--tr-hv) 30%, var(--text))', 'pze-hvpg-ink': 'color-mix(in srgb, var(--ramp-violet) 25%, var(--text))', 'pze-both-ink': 'color-mix(in srgb, var(--ramp-wine) 35%, var(--text))',
    'color-scheme': 'light',
  },
  // Soft light: warm, low-glare paper with frosted cards and softer ink; organ colours unchanged.
  soft: {
    from: 'light',
    // (pressure keeps its pale end from before Linen's: Oat is darker than #DCEBF7, so that end reads lighter than the ground here, where Linen's #B8D5ED would sit at Oat's own lightness)
    'ramp-pressure': '#DCEBF7 0, #99C2ED 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30',
    // Oat (6 Nov, picked from the Soft mocks): a deeper, warmer cream, frosted cards, firmer organs, trace lines at 3:1 on the card
    'gut-a': '.80',
    'organ-a': '.52',
    'bg': '#DDD0B9',
    'stage-bg': '#DDD0B9',
    'surface': '#F0E9DC',
    'surface-2': '#E5D9C3',
    'surface-3': '#D3C5AB',
    'ascites': '#DCB95E',
    'ascites-a': '.42',
    'glass': 'rgba(240, 233, 220, .84)',
    'frost': 'rgba(240, 233, 220, 0.4)',
    'scrim': 'rgba(40, 32, 22, .34)',
    'hairline': 'rgba(70, 52, 30, .11)',
    'border': '#C7B89C',
    'border-strong': '#A99A7E',
    'text': '#1F1A12',
    'text-2': '#463E31',
    'text-3': '#514838',
    'brand-bg': '#372E22',
    'accent': '#3652B8',
    'accent-ink': '#2A4399',
    'accent-soft': 'rgba(54, 82, 184, 0.11)',
    'accent-line': 'rgba(54, 82, 184, 0.32)',
    'stage-grid': 'rgba(100, 72, 36, .06)',
    'ok': '#0F6B57',
    'caution': '#845200',
    'danger': '#AA3622',
    'critical': '#7E1C12',
    'label-halo': 'rgba(228, 218, 200, 0.9)',
    'label-panel': 'rgba(228, 218, 200, 0.72)',
    'tile-bg': 'rgba(247, 241, 230, 0.72)',
    'tile-edge': 'rgba(110, 82, 46, .12)',
    'inst-panel': '#F5EFE2',
    'tr-ra': '#526074',
    'tr-ivc': '#188ea1',
    'tr-var': '#dd5610',
    'tr-cav': '#678a2b',
    'tr-scler': '#8a8077',
    'grid': '#DACEB6',
    'axis': '#B7AA90',
    'focus': '#3155D1',
    'info': '#3155D1',
    'color-scheme': 'light',
      // the gut a little stronger on the cream paper (organ picks, 20 Oct; raised with the rest, 20 Oct)
      // a mid straw, between the old deep amber and Light's faint wash: visible against the beige ground, still translucent
    // status inks deepened for cream (the light theme's are tuned for white); the figure's label halo matches the paper
    // data card tiles and the FibroScan panel share one warm cream with a warm edge
    // The organs, re-derived from Linen's (C3, 8 Nov): each tone keeps Linen's hue and chroma and sits the same OKLab step (ΔE) from Oat that Linen's sits from Linen.
    // (The old pins were tuned for the near-white paper; the lit faces were ΔE 3 to 10 from Oat, Linen's are 6 to 21.) Edge strength: casing-a .66 (Linen .64); the knock-out is Oat itself.
    'knockout': 'rgba(221, 208, 185, .75)', 'casing-rgb': '51 37 26', 'casing-a': '.66', 'tube-shade': '.2',
    'leader': 'rgba(40, 42, 52, .42)', 'og-dark': 'rgba(60, 22, 18, .22)',
    'og-liver-1': '#c89e8e', 'og-liver-2': '#ab6955', 'og-liver-3': '#7d3a28',
    'og-stomach-1': '#d2b4a8', 'og-stomach-2': '#be8773', 'og-stomach-3': '#8a513d',
    'og-eso-1': '#cfad9e', 'og-eso-2': '#ba836f', 'og-eso-3': '#885444',
    'og-spleen-1': '#ba9baf', 'og-spleen-2': '#8d607e', 'og-spleen-3': '#5e3651',
    'og-panc-1': '#cfbb8b', 'og-panc-2': '#ba9955', 'og-panc-3': '#87671e',
    'og-kidney-1': '#c08ca4', 'og-kidney-2': '#8c486e', 'og-kidney-3': '#531c3f',
    'og-gb-1': '#afbc89', 'og-gb-2': '#7f9754', 'og-gb-3': '#4b6528',
    'og-gut-1': '#d3b8a8', 'og-gut-2': '#c1937c', 'og-gut-3': '#8e6149',
    'og-heart-1': '#ce9288', 'og-heart-2': '#af5e50', 'og-heart-3': '#7a3127',
    'og-ra-1': '#c68076', 'og-ra-2': '#a54b3f', 'og-ra-3': '#6f251d',
    'organ-body': '#cec6b7', 'organ-body-line': '#b5a791',
    'organ-liver': '#774433', 'organ-spleen': '#634962', 'organ-gut': '#8f6d59', 'organ-stomach': '#8d6255', 'organ-heart': '#834046', 'organ-kidney': '#724963', 'organ-pancreas': '#8f7c4f', 'organ-gb': '#627054', 'organ-aorta': '#978580',
    'diaphragm': '#8E7566',
    'artery': '#C8414D', 
  },
  dark: {
    from: 'light',
    'bg': '#1A1917', 'stage-bg': '#1A1917', 'surface': '#242321', 'surface-2': '#2B2A27', 'surface-3': '#333130',
    'on-accent': '#15140F', 'on-status': '#15140F', 'skin': '#7A5E55',
    'shadow-menu': 'calc(6px * var(--light-slant)) 6px 20px rgb(var(--shadow-rgb) / calc(var(--shadow-a) * 1.2))', 'shadow-dialog': 'calc(24px * var(--light-slant)) 24px 60px rgb(var(--shadow-rgb) / calc(var(--shadow-a) * 1.6))',
    'glass': 'rgba(30, 29, 27, .95)', 'frost': 'rgba(30, 29, 27, .42)', 'scrim': 'rgba(6, 5, 4, .6)',
    'hairline': 'rgba(255, 244, 228, .09)', 'border': '#35332F', 'border-strong': '#4B4843',
    'text': '#EEEBE5', 'text-2': '#B7B1A8', 'text-3': '#A69E95', 'text-inverse': '#15140F',
    'brand-bg': '#3A342E', 'accent': '#7C9BFF', 'accent-ink': '#A5BAFF', 'accent-soft': 'rgba(124, 155, 255, .13)', 'accent-line': 'rgba(124, 155, 255, .4)', 'focus': '#7C9BFF',
    'ok': '#34C38F', 'caution': '#F0B43C', 'danger': '#F2634D', 'critical': '#FF4747', 'info': '#7C9BFF', 'disease': '#D2A2F2',
    'flow-normal': '#2CC5BD', 'flow-reversed': '#FF8C42',
    // lens ramps for a dark ground (visual-style C1): the light looks' ramps fall to dark ends that sink into the ground (a 30 mmHg vessel was 1.41:1).
    // Pressure keeps its hue path (ice, sky, cornflower, violet, magenta, wine) and keeps lightness falling at every stop (OKLab L .92 to .50); the flow,
    // velocity, heat and drop ramps keep their stops and lift only the dark end to about L .5 (hue and chroma kept). Navy and Black take these from Dark.
    'ramp-pressure': '#D7E7F4 0, #9DC9F7 5, #7BA1FC 10, #A074F4 12, #BD2C92 20, #B31553 30',
    'ramp-flow': '#9CC7B5 0, #72BFA4 .25, #3EAA98 .5, #1E6F8C .75, #3F5C94 1',
    'ramp-velocity': '#C9973F 0, #E2CF9A .2, #5DB4A4 .5, #9A7ED6 .8, #684DB1 1',
    'ramp-heat': '#B4B8C2 0, #F4D35E .12, #F08A24 .45, #D7263D .75, #9E3D55 1',
    'ramp-drop': '#DCE6D2 0, #A8C97A .3, #4F8C3C .65, #456F4A 1',
    // organs lit as the light theme's, two steps darker in OKLab with their hue and chroma kept (looks review L3, 31 Oct), so the liver stays
    // liver-coloured on the dark ground; the outline is the lit face a step lighter, since on a dark ground the line is the light thing
    'og-liver-1': '#885B4C', 'og-liver-2': '#6F3425', 'og-liver-3': '#C1998B',
    'og-stomach-1': '#907065', 'og-stomach-2': '#825040', 'og-stomach-3': '#CBAFA4',
    'og-eso-1': '#8D6A5C', 'og-eso-2': '#7E4D3D', 'og-eso-3': '#C7A89B',
    'og-spleen-1': '#76576E', 'og-spleen-2': '#522C48', 'og-spleen-3': '#B094A8',
    'og-panc-1': '#917A45', 'og-panc-2': '#82621D', 'og-panc-3': '#CCB98D',
    'og-kidney-1': '#7D4864', 'og-kidney-2': '#50133B', 'og-kidney-3': '#B5869E',
    'og-gb-1': '#6F7A42', 'og-gb-2': '#4C5E1B', 'og-gb-3': '#ACB788',
    'og-gut-1': '#917465', 'og-gut-2': '#855C48', 'og-gut-3': '#CCB3A5',
    'og-heart-1': '#8D4F47', 'og-heart-2': '#712820', 'og-heart-3': '#C58E86',
    'og-ra-1': '#853C37', 'og-ra-2': '#67130F', 'og-ra-3': '#BD7C75',
    'og-light': 'rgba(255, 238, 226, .14)', 'og-dark': 'rgba(24, 10, 6, .35)', 'og-ao': 'rgba(10, 4, 2, .3)',
    'og-hi': 'rgb(255 235 225)', 'og-hi-k': '5.6%', 'gut-rim-k': '50%',
    'lv-cong-base': '#2A0C18', 'lv-cong-base-a': '.3', 'lv-cong-isl': '#C99A8C', 'lv-cong-isl-a': '.065',
    'organ-body': '#262421', 'organ-body-line': '#3A3733',
    'organ-liver': '#A88C82', 'organ-spleen': '#93889A', 'organ-gut': '#A8948A', 'organ-stomach': '#A99088', 'organ-heart': '#AE8387',
    'organ-kidney': '#A07E8E', 'organ-lung': '#6E7A8C', 'organ-pancreas': '#AFA286', 'organ-gb': '#8C9A7E', 'organ-aorta': '#6E6470', 'organ-a': '.3', 'organ-tint': '20%', 'diaphragm': '#9C8C84',
    'artery': '#E4606C', 'casing-rgb': '14 11 9', 'casing-a': '.3', 'vessel-casing': 'rgb(var(--casing-rgb) / var(--casing-a))', 'ascites': '#F0C67A', 'ascites-a': '.24', 'stage-grid': 'rgba(255, 240, 220, .05)', 'leader': 'rgba(236, 228, 214, .42)', 'vein-portal': 'var(--tour-portal)', 'vein-systemic': 'var(--tour-sys)', 'arrow-ink': 'rgba(238, 235, 229, .82)', 'label-halo': 'rgba(26, 25, 23, .9)', 'label-panel': 'rgba(26, 25, 23, .72)', 'doppler': '#3EE0A5', 'dop-glow': '#F4F6FF', 'dop-face': '#F1ECE2', 'dop-head-rim': '#FFFFFF', 'dop-head-ink': '#000000', 'vel-ink': '72%',
    's1': '#3987e5', 's2': '#d95926', 's3': '#199e70', 's4': '#c98500', 's5': '#d55181', 's6': '#17A317', 's7': '#9085e9', 's8': '#e66767',
    'grid': '#2B2926', 'axis': '#4A4641',
    'tr-pv': '#F0649E', 'tr-wedge': '#DA7EDD', 'tr-hv': '#5CA4F2', 'tr-ra': '#B7B1A8', 'tr-ivc': '#4CC2D6', 'tr-var': '#F28A56', 'tr-cav': '#A9CC55', 'tr-sv': 'var(--origin-spleen)', 'tr-smv': 'var(--origin-smv)', 'tr-imv': 'var(--origin-imv)', 'tr-scler': '#B7C2D4',
    'shadow-1': '0 0 0 1px var(--hairline)', 'shadow-2': 'var(--shadow-menu)', 'shadow-3': 'var(--shadow-dialog)',
    'shadow-rgb': '0 0 0', 'shadow-a': '.38', 'vessel-shadow': 'rgb(var(--shadow-rgb) / var(--shadow-a))', 'tube-shade': '.3', 'tube-sheen': '.38', 'vessel-rim-a': '.3', 'vessel-knock-a': '0', 'organ-cast': 'rgba(0, 0, 0, .42)', 'tex-a': '.13', 'lit-hi': '.2', 'lit-lo': '.18', 'fx-ink': 'rgba(233, 237, 246, .9)', 'stent-metal': '#A0ABBE', 'suture-thread': '#E8742A', 'suture-edge': '#3a1d0a', 'stent-marker': '#BAC2D0', 'stent-alpha': '.5', 'stent-glint': '.24', 'stent-rail-w': '1.15', 'stent-strut-w': '.8',
    // ── BEGIN device materials, dark looks (visual-style D1, D6, D9; Navy and Black take these) ──
    'dev-poly': '#F0F0ED', 'dev-poly-edge': '#1C212B', 'dev-scope-edge': '#C9CED6',
    'dev-latex': '#FCE6B3', 'dev-latex-edge': '#B08A59', 'dev-latex-a': '.34', 'dev-nylon': '#E5EDF7',
    'dev-steel': '#B3B8C2', 'dev-platinum': '#A8ADB8', 'dev-glue': '#C9D6EC', 'dev-ptfe': '#C9D0DA', 'dev-tips-mesh': '#2A3650', 'dev-graft': '#F8F7F4', 'dev-stent-wire': '#B8975C', 'dev-stent-glint': '#F1E1B8', 'dev-stent-gold': '#D9B263',
    'thrombus': '#8C3442', 'thrombus-edge': '#D49AA0',   // (a wine clot on a wine lumen needs a lighter body and a pale edge)
    // ── END device materials, dark looks ──
    'lv-sep': '#E8C4AE', 'lv-nod': '#6E4428',
    'zone-1': 'rgb(246, 140, 120)', 'zone-2': 'rgb(232, 186, 112)', 'zone-3': 'rgb(170, 150, 246)',
    'sv-lumen-hidden': '#58607A', 'sv-fenestra': '#B8C6E2', 'sv-disse': '#B5D3A3', 'sv-hsc': '#D9B092', 'sv-kupffer': '#D6C6F2', 'sv-hepatocyte': '#E3B2A9',
    'tour-portal': '#E06AA2', 'tour-sys': '#79AEEF', 'lapse-ink': '#f2b45a',
    'collagen': 'rgb(199, 186, 153)', 'lz-field-sin-pale': '#2E1A26', 'lz-septum': 'rgb(199, 186, 153)', 'lz-zone-line': 'rgba(255, 255, 255, .3)', 'lz-nodule-ink': 'rgba(30, 14, 28, .22)', 'lz-nodule-shadow': 'rgba(0, 0, 0, .5)', 'lz-plate-line': 'rgba(255, 255, 255, .1)',
    'lz-duct-cell': '#8E9150', 'lz-duct-edge': 'rgba(36, 38, 16, .55)', 'lz-duct-nucleus': '#3E4120', 'lz-duct-lumen': '#2C2F16',
    'lz-lymph': 'rgba(214, 236, 204, .42)', 'lz-albumin-ring': 'rgba(20, 14, 4, .9)', 'lz-collagen': '#E8C48C', 'lz-rbc': 'rgba(255, 120, 140, .9)',
    'sv-gl-nucleus': '#281222', 'sv-gl-basement': '#CCBC8E', 'bile-duct': '#969C50', 'sv-gl-endothelium': '#7A749C', 'sv-gl-endo-sheet': '#A39CCB', 'sv-gl-endo-edge': '#2C2650',
    'sv-gl-endo-nucleus': '#544A78', 'sv-gl-hsc-quiet': '#B08666', 'sv-gl-hsc-active': '#A0664A',
    'sv-gl-hsc-nucleus': '#60382A', 'sv-gl-kupffer': '#846AB0', 'sv-gl-kupffer-nucleus': '#4A3674',
    'sv-gl-kupffer-edge': '#3A2A60', 'sv-gl-rbc': '#B03E48', 'albumin': '#F2B64A', 'sv-gl-albumin-edge': '#6E3A00',
    'sv-gl-lymph-lo': '#B8C2B0', 'sv-gl-lymph-mid': '#B2C4A8', 'sv-gl-lymph-hi': '#A3BF94',
    // WP9 plane (chart-looks/plane.js reads the same mixes as numbers; these are printed for the keys' swatches, .pze-key and .pze-ckey): a zone's fill and its words' ink
    'pze-ok': 'color-mix(in srgb, var(--ok) 42%, var(--black))', 'pze-mid': 'color-mix(in srgb, var(--caution) 55%, var(--black))', 'pze-hi': 'color-mix(in srgb, var(--danger) 50%, var(--black))',
    'pze-ok-ink': 'var(--text)', 'pze-mid-ink': 'var(--text)', 'pze-hi-ink': 'var(--text)',
    'pze-ppg': 'color-mix(in srgb, var(--tr-hv) 45%, var(--black))', 'pze-hvpg': 'color-mix(in srgb, var(--ramp-violet) 55%, var(--black))', 'pze-both': 'color-mix(in srgb, var(--ramp-wine) 55%, var(--black))',
    'pze-ppg-ink': 'var(--text)', 'pze-hvpg-ink': 'var(--text)', 'pze-both-ink': 'var(--text)',
    // (Light became Linen on 6 Nov; Dark keeps the Light values it was built on: 1 tokens pinned)
    'gut-a': '.55',
    'color-scheme': 'dark',
  },
  // Two more dark looks (Settings > Appearance: Navy and Black). A look like this is a variant of Dark, not a theme of its own: the page
  // keeps data-theme="dark" (so every dark rule in app.css and every script that asks "is it dark" stays true) and adds data-palette
  // ("navy", "black"). A block moves the ground, the surfaces, the ink, the lines and the casing (Navy also the organs' lighting); the
  // status colours, the accent and every other dark token are Dark's. These blocks sit last, at one step more specificity than the dark ones, so they win over
  // both the attribute block and the system-dark media block above. Another palette is one more block of the same shape, one more
  // entry in src/ui/looks.js, and one more tile (--look-<id>-* below, a .look-half rule in styles/app.css).
  // Navy: the "Monitor" dark Dark was until 31 Oct (ecb18cd4), exactly as it was: cool surfaces, light-blue hairlines, organs re-lit
  // for the navy ground (clearer hue, cool shade) and a pale casing. Dark's amber ascites (1 Nov) stays.
  navy: {
    from: 'dark',
    'bg': '#0E1422', 'stage-bg': '#0E1422', 'surface': '#161E30', 'surface-2': '#1B2438', 'surface-3': '#232D44',
    'on-accent': '#0B1120', 'on-status': '#0B1120',
    'glass': 'rgba(16, 23, 42, .95)', 'frost': 'rgba(16, 23, 42, .42)', 'scrim': 'rgba(2, 4, 10, .6)',
    'hairline': 'rgba(200, 215, 255, .08)', 'border': '#222C46', 'border-strong': '#33405F',
    'text': '#E9EDF6', 'text-2': '#A9B2C7', 'text-3': '#8F99B3', 'text-inverse': '#0B1120',
    'brand-bg': '#24325C',
    'og-liver-1': '#85514F', 'og-liver-2': '#5A3440', 'og-liver-3': '#C48A86',
    'og-stomach-1': '#82585F', 'og-stomach-2': '#573846', 'og-stomach-3': '#C09098',
    'og-eso-1': '#7A5559', 'og-eso-2': '#523544', 'og-eso-3': '#B88A90',
    'og-spleen-1': '#6E4F78', 'og-spleen-2': '#483456', 'og-spleen-3': '#A98BB6',
    'og-panc-1': '#7D6C4C', 'og-panc-2': '#544938', 'og-panc-3': '#BCA878',
    'og-kidney-1': '#7A4766', 'og-kidney-2': '#4E2C46', 'og-kidney-3': '#D9B3CC',
    'og-gb-1': '#56704A', 'og-gb-2': '#3A4C3A', 'og-gb-3': '#93B07E',
    'og-gut-1': '#7C5D5F', 'og-gut-2': '#553F47', 'og-gut-3': '#B79A9A',
    'og-heart-1': '#8E4A52', 'og-heart-2': '#5E2E3C', 'og-heart-3': '#CE8C92',
    'og-ra-1': '#964650', 'og-ra-2': '#632B3A', 'og-ra-3': '#D48F96',
    'og-light': 'rgba(255, 235, 225, .14)', 'og-dark': 'rgba(0, 0, 0, .35)', 'og-ao': 'rgba(0, 0, 0, .3)',
    'organ-body': '#1A2238', 'organ-body-line': '#2C3756',
    'organ-lung': '#5A6E90',
    'casing-rgb': '6 10 20', 'casing-a': '.34',   // (the ground's own near-black, 13 Nov 2026: the pale blue-white line read as a halo)
    'stage-grid': 'rgba(160, 180, 255, .05)', 'leader': 'rgba(200, 212, 240, .42)', 'arrow-ink': 'rgba(233, 237, 246, .82)', 'label-halo': 'rgba(11, 17, 32, .9)', 'label-panel': 'rgba(14, 20, 34, .72)',
    'grid': '#1F2840', 'axis': '#34405E',
    'tr-ra': '#A9B2C7',
  },
  // Black: a true black ground, for an OLED screen (an iPhone's pixels switch off, the figure floats on the glass's own black) and a
  // dark room's projector. Neutral, with no tint: the surfaces are a few steps of grey above the ground, the lines and the ink neutral
  // too. The organs, the accent and the status colours are Dark's; the casing is plain black a little stronger, since a darker-than-
  // the-ground casing has nowhere to go (the lumen is still the light thing, and the organs behind it are what the casing separates
  // from). Every text token keeps 4.5:1 on every surface (tests/token-contrast.test.js).
  black: {
    from: 'dark',
    'bg': '#000000', 'stage-bg': '#000000', 'surface': '#0D0D0E', 'surface-2': '#141416', 'surface-3': '#1C1C1F',
    'on-accent': '#0A0A0B', 'on-status': '#0A0A0B',
    'glass': 'rgba(10, 10, 11, .95)', 'frost': 'rgba(10, 10, 11, .42)', 'scrim': 'rgba(0, 0, 0, .7)',
    'hairline': 'rgba(255, 255, 255, .1)', 'border': '#26262A', 'border-strong': '#3A3A40',
    'text': '#F4F4F5', 'text-2': '#B6B6BC', 'text-3': '#9C9CA4', 'text-inverse': '#0A0A0B',
    'brand-bg': '#232327',
    'organ-body': '#0F0F11', 'organ-body-line': '#2A2A2E',
    'casing-rgb': '0 0 0', 'casing-a': '.38',
    'stage-grid': 'rgba(255, 255, 255, .05)', 'leader': 'rgba(230, 230, 235, .42)', 'arrow-ink': 'rgba(244, 244, 245, .82)', 'label-halo': 'rgba(0, 0, 0, .9)', 'label-panel': 'rgba(0, 0, 0, .72)',
    'grid': '#19191C', 'axis': '#3A3A40',
    'tr-ra': '#B6B6BC',
  },
};

// The Circuit view's map (.stage-wrap.cmap) re-defines about 50 of these in the dark looks, so a dock instrument or a chart inside it takes
// them instead. 'light' applies in every look; 'dark' on top of it in the dark looks; 'navy' and 'black' on top of 'dark' in their palettes.
export const CIRCUIT = {
  // Circuit view: follows the page theme. In the light theme it is a light schematic on the page
  // paper; in the dark theme a darker "hemodynamic map" than the surrounding chrome (the same warm family, a step down).
  light: {
    'map-dot': 'rgba(70, 90, 160, .16)', 'spine': 'rgba(90, 110, 200, .1)',
  },
  dark: {
    'bg': '#0F0E0D', 'stage-bg': '#121110', 'surface': '#1C1B19', 'surface-2': '#232220', 'surface-3': '#2D2B28',
    'glass': 'rgba(22, 21, 19, .95)', 'frost': 'rgba(22, 21, 19, .42)',
    'hairline': 'rgba(255, 244, 228, .1)', 'border': '#35332F', 'border-strong': '#4B4843',
    'text': '#EEEBE5', 'text-2': '#B7B1A8', 'text-3': '#A69E95', 'text-inverse': '#15140F',
    'accent': '#7C9BFF', 'accent-ink': '#A5BAFF', 'accent-soft': 'rgba(124, 155, 255, .13)', 'accent-line': 'rgba(124, 155, 255, .4)', 'focus': '#7C9BFF',
    'ok': '#34C38F', 'caution': '#F0B43C', 'danger': '#F2634D', 'critical': '#FF4747', 'info': '#7C9BFF', 'disease': '#D2A2F2',
    'flow-normal': '#2CC5BD', 'flow-reversed': '#FF8C42',
    'artery': '#E4606C', 'casing-rgb': '0 0 0', 'casing-a': '.38', 'vessel-casing': 'rgb(var(--casing-rgb) / var(--casing-a))', 'leader': 'rgba(236, 228, 214, .42)',
    'vein-portal': 'var(--tour-portal)', 'vein-systemic': 'var(--tour-sys)', 'arrow-ink': 'rgba(238, 235, 229, .82)', 'label-halo': 'rgba(18, 17, 16, .92)', 'label-panel': 'rgba(18, 17, 16, .72)', 'doppler': '#3EE0A5',
    'spine': 'rgba(124, 150, 255, .1)', 'map-dot': 'rgba(160, 182, 255, .12)',
    'fx-ink': 'rgba(233, 237, 246, .9)', 'stent-metal': '#A0ABBE', 'suture-thread': '#E8742A', 'suture-edge': '#3a1d0a', 'stent-marker': '#BAC2D0', 'stent-alpha': '.5', 'stent-glint': '.24', 'stent-rail-w': '1.15', 'stent-strut-w': '.8',
    'shadow-1': '0 0 0 1px var(--hairline)', 'shadow-2': 'var(--shadow-menu)',
    'color-scheme': 'dark',
  },
  navy: {
    'bg': '#070B14', 'stage-bg': '#0A0F1C', 'surface': '#10172A', 'surface-2': '#151E34', 'surface-3': '#1D2842',
    'glass': 'rgba(14, 20, 38, .95)', 'frost': 'rgba(14, 20, 38, .42)',
    'hairline': 'rgba(200, 215, 255, .09)', 'border': '#222C46', 'border-strong': '#33405F',
    'text': '#E9EDF6', 'text-2': '#A9B2C7', 'text-3': '#8F99B3', 'text-inverse': '#0B1120',
    'leader': 'rgba(200, 212, 240, .42)', 'arrow-ink': 'rgba(233, 237, 246, .82)', 'label-halo': 'rgba(10, 15, 28, .92)', 'label-panel': 'rgba(10, 15, 28, .72)',
  },
  black: {
    'bg': '#000000', 'stage-bg': '#000000', 'surface': '#0B0B0C', 'surface-2': '#121214', 'surface-3': '#19191C',
    'glass': 'rgba(8, 8, 9, .95)', 'frost': 'rgba(8, 8, 9, .42)',
    'hairline': 'rgba(255, 255, 255, .11)', 'border': '#26262A', 'border-strong': '#3A3A40',
    'text': '#F4F4F5', 'text-2': '#B6B6BC', 'text-3': '#9C9CA4', 'text-inverse': '#0A0A0B',
    'leader': 'rgba(230, 230, 235, .42)', 'arrow-ink': 'rgba(244, 244, 245, .82)', 'label-halo': 'rgba(0, 0, 0, .92)', 'label-panel': 'rgba(0, 0, 0, .72)',
  },
};

// How a look is found from the page's state (the attributes looks.js writes, the system dark switch) and how the values stack.
const PARENT = { soft: 'light', dark: 'light', navy: 'dark', black: 'dark' };
export const LOOK_IDS = ['light', 'soft', 'dark', 'navy', 'black'];

/** The look id for a context: { theme, dark, palette } as src/ui/looks.js and the page's attributes give them. */
export function lookIdOf(ctx) {
  const p = ctx && ctx.palette, t = ctx && ctx.theme;
  if (p && PARENT[p] === 'dark' && t === 'dark') return p;
  if (t === 'soft') return 'soft';
  if (t === 'dark') return 'dark';
  if (t === 'light') return 'light';
  return ctx && ctx.dark ? 'dark' : 'light';
}

const chain = (id) => { const c = []; for (let k = id; k; k = PARENT[k]) c.unshift(k); return c; };
const memo = new Map();
const stack = (table, id) => { const o = {}; for (const k of chain(id)) if (table[k]) for (const n in table[k]) if (n !== 'from') o[n] = table[k][n]; return o; };

/** Every token of a look as one flat object ({ name: css text }), the Circuit view's map on top when circuit is true. Memoised by look and view. */
export function tokensOfLook(id, circuit = false) {
  const k = circuit ? `${id}|circuit` : id;
  let t = memo.get(k);
  if (!t) {
    t = stack(TOKENS, id);
    if (circuit) {
      // (the map's own blocks: Light's applies everywhere, then Dark's, then the palette's, as tokens.css has always layered them)
      const dark = id === 'dark' || id === 'navy' || id === 'black';
      const layers = ['light', ...(dark ? ['dark'] : []), ...(id === 'navy' || id === 'black' ? [id] : [])];
      for (const l of layers) Object.assign(t, CIRCUIT[l]);
    }
    memo.set(k, t);
  }
  return t;
}

/** tokensOfLook for a context { theme, dark, palette, view } (src/ui/looks.js's attributes, the system dark switch, the store's view). */
export const tokensFor = (ctx) => tokensOfLook(lookIdOf(ctx), !!ctx && ctx.view === 'circuit');
