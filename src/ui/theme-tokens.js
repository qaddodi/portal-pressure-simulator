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
    'bg': '#FBFAF7',   // ground: page and figure share the paper
    'stage-bg': '#FBFAF7',
    'surface': '#FFFEFB',
    'surface-2': '#F7F5F0',
    'surface-3': '#EEEBE4',
    'glass': 'rgba(255, 254, 251, .94)', 'frost': 'rgba(255, 254, 251, .38)',
    'scrim': 'rgba(18, 20, 28, .38)',

    // lines
    'hairline': 'rgba(52, 40, 28, .09)',
    'border': '#E6E1D8',
    'border-strong': '#CEC7BB',

    // ink
    'text': '#1A1917',
    'text-2': '#4E4B46',
    'text-3': '#67635D',   // ≥ 4.5:1 on every light surface
    'text-inverse': '#FFFFFF',

    // accent
    'brand-bg': '#1A1917',
    'accent': '#3155D1',
    'accent-ink': '#2442AE',
    'accent-soft': 'rgba(49, 85, 209, .09)',
    'accent-line': 'rgba(49, 85, 209, .32)',
    'focus': '#3155D1',   // (the accent itself, not a UI kit's stock blue: DG3)

    // status (always paired with a label or icon)
    'ok': '#178A63',
    'caution': '#C98A0E',
    'danger': '#D2452F',
    'critical': '#8B1A10',
    'info': '#3155D1',
    'disease': '#8A3FB5',   // a disease name in a teaching card (pz-dz)

    // flow semantics
    'flow-normal': '#16988F',
    'flow-reversed': '#EC7424',
    // anatomy plate: tissue tones [light face, shaded face, outline], muted so vessels lead
    'og-liver-1': '#E9C3B6', 'og-liver-2': '#C98E7E', 'og-liver-3': '#9A5D4F',
    'og-stomach-1': '#F4D9CF', 'og-stomach-2': '#DDAC9C', 'og-stomach-3': '#A87464',
    'og-eso-1': '#F0D2C6', 'og-eso-2': '#D9A898', 'og-eso-3': '#A5766A',
    'og-spleen-1': '#D8BDD0', 'og-spleen-2': '#A9829D', 'og-spleen-3': '#7A566F',
    'og-panc-1': '#F5E3BA', 'og-panc-2': '#DDBF86', 'og-panc-3': '#A88A52',
    'og-kidney-1': '#DDB0C6', 'og-kidney-2': '#A86C8E', 'og-kidney-3': '#6E3E5C',
    'og-gb-1': '#D6E0B4', 'og-gb-2': '#A5B87E', 'og-gb-3': '#6F8450',
    'og-gut-1': '#F5DDD0', 'og-gut-2': '#E1B8A5', 'og-gut-3': '#AC8470',
    'og-heart-1': '#EDB8B0', 'og-heart-2': '#CC8479', 'og-heart-3': '#97554D',
    'og-ra-1': '#E4A69F', 'og-ra-2': '#C27268', 'og-ra-3': '#8C4A43',
    'og-light': 'rgba(255, 255, 255, .55)', 'og-dark': 'rgba(60, 22, 18, .22)', 'og-ao': 'rgba(70, 40, 30, .09)',
    // the gut's lit strip (organ picks, 20 Oct): the light tone mixed in by --og-light's own strength (x .4), as a solid colour
    'og-hi': 'rgb(255 255 255)', 'og-hi-k': '22%', 'gut-rim-k': '64%',
    // the gut's see-through strength (colon, small bowel, duodenum)
    'gut-a': '.55',   // as strong as the other organs (.55): at .28 it was too close to the background (Mohammad, 20 Oct)
    // the congested liver's nutmeg (organ picks, 20 Oct: "even dusk", faintest islands): an even dusky tone, pale islands
    'lv-cong-base': '#6E1F38', 'lv-cong-base-a': '.44', 'lv-cong-isl': '#E3C0A0', 'lv-cong-isl-a': '.11',
    'knockout': 'rgba(251, 250, 247, .75)',
    'organ-body': '#EFE8DF',
    'organ-body-line': '#D9CEC0',
    'organ-liver': '#946658',
    'organ-spleen': '#80697F',
    'organ-gut': '#AE8F7E',
    'organ-stomach': '#AB857A',
    'organ-heart': '#A06469',
    'organ-kidney': '#8E6A82',
    'organ-lung': '#AFC0D2',
    'organ-pancreas': '#B09E78',
    'organ-gb': '#849077',
    'organ-aorta': '#B7A7A3',
    'organ-a': '.3',
    'organ-tint': '18%',
    'diaphragm': '#8E7566',
    'artery': '#C8414D',
    'casing-rgb': '30 24 40', 'casing-a': '.56', 'vessel-casing': 'rgb(var(--casing-rgb) / var(--casing-a))',
    'ascites': '#E6D28E', 'ascites-a': '.34',   // a faint pale-straw wash, translucent so the organs read through
    'stage-grid': 'rgba(80, 70, 60, .06)',
    'leader': 'rgba(40, 42, 52, .42)',
    'vein-portal': 'var(--tour-portal)',
    'vein-systemic': 'var(--tour-sys)',
    'arrow-ink': 'rgba(24, 26, 34, .78)',
    'label-halo': 'rgba(251, 250, 247, .92)',
    'label-panel': 'rgba(251, 250, 247, .72)',   // a reading's panel on the figure: the paper itself at 72 %, the halo does the separating (looks review F8); dark: the ground
    'doppler': '#22C38E',
    'dop-glow': '#1F2433',   // the Doppler's vessel glow, beam and probe light on the figure (white on the dark themes): 19 Oct, the green read as "normal"
    'vel-ink': '45%',   // a stent point's number: how much of its velocity colour, the rest the text's (4.5:1 at least on the light stage)

    // rendering: organ lighting, vessel tubes, background plane, circuit map
    'shadow-rgb': '46 22 34', 'shadow-a': '.15', 'vessel-shadow': 'rgb(var(--shadow-rgb) / var(--shadow-a))',
    'tube-shade': '.2', 'tube-sheen': '.42',
    'organ-cast': 'rgba(80, 44, 40, .15)',
    'tex-a': '.11', 'lit-hi': '.4', 'lit-lo': '.13',
    'spine': 'rgba(124, 150, 255, .09)', 'map-dot': 'rgba(160, 182, 255, .11)',
    'fx-ink': 'rgba(22, 24, 29, .88)',
    'stent-metal': '#667285', 'stent-marker': '#545D6C', 'stent-alpha': '.5', 'stent-glint': '.24', 'stent-rail-w': '1.15', 'stent-strut-w': '.8',
    // chart series (validated categorical order, light)
    's1': '#2a78d6', 's2': '#eb6834', 's3': '#1baf7a', 's4': '#eda100', 's5': '#e87ba4', 's6': '#008300', 's7': '#4a3aa7', 's8': '#e34948',
    'grid': '#E6E4DD',
    // pressure-over-time traces: the plate's own vessel hues (portal magenta, wedged orchid,
    // hepatic blue), then quieter inks for the rest
    'tr-pv': '#B01E62', 'tr-wedge': '#A52DA9', 'tr-hv': '#2A78D6', 'tr-ra': '#5B6270', 'tr-ivc': '#1F9BB0', 'tr-var': '#E0632E', 'tr-cav': '#6E8F1F', 'tr-sv': 'var(--origin-spleen)', 'tr-smv': 'var(--origin-smv)', 'tr-imv': 'var(--origin-imv)', 'tr-scler': '#7D8AA0',
    'axis': '#C6C2B8',
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

    // WP11 (card diagrams): flat colours the same in every look, read by chart-looks/card.js (the pressure ramp's 12 and 20 mmHg stops; the hepatocyte)
    'ramp-violet': '#925CDD', 'ramp-wine': '#A4216E', 'pz-hepatocyte': '#C58B5C',

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
    'gut-a': '.7',   // the gut a little stronger on the cream paper (organ picks, 20 Oct; raised with the rest, 20 Oct)
    'bg': '#E8DFD1', 'stage-bg': '#E8DFD1', 'surface': '#F6F0E6', 'surface-2': '#EBE2D4', 'surface-3': '#DDD2C0',
    'ascites': '#DCB95E', 'ascites-a': '.42',   // a mid straw, between the old deep amber and Light's faint wash: visible against the beige ground, still translucent
    'glass': 'rgba(246, 240, 230, .84)', 'frost': 'rgba(246, 240, 230, .36)', 'scrim': 'rgba(40, 32, 22, .34)',
    'hairline': 'rgba(70, 52, 30, .11)', 'border': '#D4C8B4', 'border-strong': '#B9AA92',
    'text': '#221E18', 'text-2': '#4A443A', 'text-3': '#5E574B',
    'brand-bg': '#3A3228', 'accent': '#3652B8', 'accent-ink': '#2A4399', 'accent-soft': 'rgba(54, 82, 184, .11)', 'accent-line': 'rgba(54, 82, 184, .32)',
    'stage-grid': 'rgba(100, 72, 36, .06)',
    // status inks deepened for cream (the light theme's are tuned for white); the figure's label halo matches the paper
    'ok': '#24724F', 'caution': '#A2700C', 'danger': '#B03C28', 'critical': '#7E1C12',
    'label-halo': 'rgba(236, 228, 214, .9)', 'label-panel': 'rgba(236, 228, 214, .72)',
    // data card tiles and the FibroScan panel share one warm cream with a warm edge
    'tile-bg': 'rgba(251, 247, 240, .72)', 'tile-edge': 'rgba(110, 82, 46, .12)', 'inst-panel': '#F8F2E8',
    'color-scheme': 'light',
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
    'knockout': 'rgba(26, 25, 23, .7)',
    'organ-body': '#262421', 'organ-body-line': '#3A3733',
    'organ-liver': '#A88C82', 'organ-spleen': '#93889A', 'organ-gut': '#A8948A', 'organ-stomach': '#A99088', 'organ-heart': '#AE8387',
    'organ-kidney': '#A07E8E', 'organ-lung': '#6E7A8C', 'organ-pancreas': '#AFA286', 'organ-gb': '#8C9A7E', 'organ-aorta': '#6E6470', 'organ-a': '.3', 'organ-tint': '20%', 'diaphragm': '#9C8C84',
    'artery': '#E4606C', 'casing-rgb': '10 8 8', 'casing-a': '.6', 'vessel-casing': 'rgb(var(--casing-rgb) / var(--casing-a))', 'ascites': '#F0C67A', 'ascites-a': '.24', 'stage-grid': 'rgba(255, 240, 220, .05)', 'leader': 'rgba(236, 228, 214, .42)', 'vein-portal': 'var(--tour-portal)', 'vein-systemic': 'var(--tour-sys)', 'arrow-ink': 'rgba(238, 235, 229, .82)', 'label-halo': 'rgba(26, 25, 23, .9)', 'label-panel': 'rgba(26, 25, 23, .72)', 'doppler': '#3EE0A5', 'dop-glow': '#F4F6FF', 'vel-ink': '72%',
    's1': '#3987e5', 's2': '#d95926', 's3': '#199e70', 's4': '#c98500', 's5': '#d55181', 's6': '#17A317', 's7': '#9085e9', 's8': '#e66767',
    'grid': '#2B2926', 'axis': '#4A4641',
    'tr-pv': '#F0649E', 'tr-wedge': '#DA7EDD', 'tr-hv': '#5CA4F2', 'tr-ra': '#B7B1A8', 'tr-ivc': '#4CC2D6', 'tr-var': '#F28A56', 'tr-cav': '#A9CC55', 'tr-sv': 'var(--origin-spleen)', 'tr-smv': 'var(--origin-smv)', 'tr-imv': 'var(--origin-imv)', 'tr-scler': '#B7C2D4',
    'shadow-1': '0 0 0 1px var(--hairline)', 'shadow-2': 'var(--shadow-menu)', 'shadow-3': 'var(--shadow-dialog)',
    'shadow-rgb': '0 0 0', 'shadow-a': '.38', 'vessel-shadow': 'rgb(var(--shadow-rgb) / var(--shadow-a))', 'tube-shade': '.3', 'tube-sheen': '.38', 'organ-cast': 'rgba(0, 0, 0, .42)', 'tex-a': '.13', 'lit-hi': '.2', 'lit-lo': '.18', 'fx-ink': 'rgba(233, 237, 246, .9)', 'stent-metal': '#A0ABBE', 'stent-marker': '#BAC2D0', 'stent-alpha': '.5', 'stent-glint': '.24', 'stent-rail-w': '1.15', 'stent-strut-w': '.8',
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
    'knockout': 'rgba(11, 17, 32, .7)',
    'organ-body': '#1A2238', 'organ-body-line': '#2C3756',
    'organ-lung': '#5A6E90',
    'casing-rgb': '214 222 246', 'casing-a': '.34',
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
    'knockout': 'rgba(0, 0, 0, .7)',
    'organ-body': '#0F0F11', 'organ-body-line': '#2A2A2E',
    'casing-rgb': '0 0 0', 'casing-a': '.7',
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
    'artery': '#E4606C', 'casing-rgb': '0 0 0', 'casing-a': '.72', 'vessel-casing': 'rgb(var(--casing-rgb) / var(--casing-a))', 'leader': 'rgba(236, 228, 214, .42)',
    'vein-portal': 'var(--tour-portal)', 'vein-systemic': 'var(--tour-sys)', 'arrow-ink': 'rgba(238, 235, 229, .82)', 'label-halo': 'rgba(18, 17, 16, .92)', 'label-panel': 'rgba(18, 17, 16, .72)', 'doppler': '#3EE0A5',
    'spine': 'rgba(124, 150, 255, .1)', 'map-dot': 'rgba(160, 182, 255, .12)',
    'fx-ink': 'rgba(233, 237, 246, .9)', 'stent-metal': '#A0ABBE', 'stent-marker': '#BAC2D0', 'stent-alpha': '.5', 'stent-glint': '.24', 'stent-rail-w': '1.15', 'stent-strut-w': '.8',
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
