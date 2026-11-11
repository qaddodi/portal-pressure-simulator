# The picture, the blood and the fills: look suggestions (9 Nov 2026)

**Status (11 Nov 2026).** A dated record of look suggestions; only item 9 is known to be built.
- Built: item 9, cut vessels in the lobule drawn as cut tubes with a wall ring (`tests/lobule-cut-vessels.test.js` names this file; `F_RING` in `veins-mesh-glsl.js`, `celRingJS` / `celDiscJS` in `tube-cel-glsl.js`).
- Superseded or changed by the Tube (the only vessel renderer since 11 Nov 2026): items 1, 3, 6 and 7 were written against the Mesh and composite blood (`tubeShade`, `bloodAt`, blood styles D and E). The Tube draws its own cel look (`celShade`: outline 1.6 x the casing, opaque, no contact shadow), its blood is style P (particles, `blood-particles.js`), and its glow is the `tubeGlow` program. Item 3 (line weights that hold when zoomed) is still open for the Tube (`docs/tube-renderer.md`, "Known differences"). The old pale-ink blend of item 1 (`pale = smoothstep(0.58, 0.66, ...)`) is still in `comp-glsl.js`; whether the Tube's blood has the same dead band is not verified.
- Not verified: items 2, 4, 5, 6, 8, 10, 11 (nothing found in `src/` that does them; organ outlines moved under the vessels in f445406, which is not item 5).
- The companion `mesh-renderer-beautiful-fast.md` was deleted on 11 Nov 2026 (the Mesh renderer is gone). Its item 3 is the line-weight item above. The screenshots this file rests on were of the Mesh and Vector builds; nothing from their vessel shapes is claimed.


Docs only. Nothing here is built. Every item changes the picture, so every item is Mohammad's pick. Read at `cecc020` on
`claude/settings-topbar-icon-flvft1`. A companion to `mesh-renderer-beautiful-fast.md` (speed and structure; deleted 11 Nov 2026); this file is only about how it looks.

Everything stays drawn by the GPU. Labels keep the one label style, glass stays real glass. Not reopened: the textbook shading with a faint
contact shadow, the portal tree's heavier casing, streaks not dots, the arrowheads' spacing, true Black, the pressure ramp's hues.

## What this rests on

- **Code**: the composite's blood (`veins-gl.js` `bloodAt`, 1256 to 1372), the shared vessel shading (`veins-mesh-glsl.js` `tubeShade`,
  `vesAttrs`), the organ painter and the look tokens (`theme-tokens.js`).
- **Counts**: contrast worked out from the token colours through the shader's own arithmetic (WCAG ratio; script values in the tables).
- **Five of your device screenshots** from 8 and 9 Nov: the anatomy and the lobule on Soft (Mac, `8105972a`), the lobule on Dark (Mac,
  `8772ff8e`), a slide on Dark (Mac, `2fc33027`), and the gastric varices slide on Black (iPhone, `2edf60b9`). Three of them are from the
  Vector build, so I took nothing from their vessel shapes, only colour, organs and backdrop. Five pictures are not a survey: where an item says "seen", it
  means seen in one of these.

## The short version

| Rank | What | Where it shows | Size |
|---:|---|---|---|
| 1 | **Blood streaks that never fade into the lumen** | The healthy portal vein, on every look | S |
| 2 | **A vessel behind an organ keeps its line and loses its fill**, not the other way round | The cava behind the liver, the renal veins | S |
| 3 | **Line weights that hold when zoomed** | Every zoom (already item 3 of the mesh doc) | S to M |
| 4 | **Organs on the dark looks as lit glass, not brown** | Dark, Navy, Black | M |
| 5 | **One drawing language for organs and vessels on the light looks**: a fine edge line on each organ | Light, Soft | S to M |
| 6 | **A glow that is a line of light, not a halo** | Every lit vessel | S |
| 7 | **The blood's highlight on the lit side** | Every wide vessel | S to M |
| 8 | **The lobule's surroundings drawn as fine line work**, not blurred shapes | Lobule view | M |
| 9 | **Cut vessels in the lobule drawn as cut tubes** (a wall ring) | Lobule view | S |
| 10 | **Paper tooth**: a fixed fine grain over the big soft fills | Organs, backdrop | S |
| 11 | **An arterial pulse in the hepatic artery's streaks** | Optional, your call | S |

I would mock 1, 2, 4, 5 and 6 on one page (each as today against proposed, on Soft and on Black) before anything is built.

## Blood

### 1. Streaks that never fade into the lumen

**Now.** A streak is light ink on a dark lumen and dark ink on a pale one, and between the two the shader blends the inks
(`pale = smoothstep(0.58, 0.66, lightness)`). Halfway through that blend the light and the dark cancel and the streak is the lumen's own
colour. Counted, streak at its strongest against its lumen:

| Lumen pressure | Light (Linen) | Soft (Oat) | Dark |
|---|---:|---:|---:|
| 5 mmHg | 1.65 | 1.68 | 1.69 |
| 7 mmHg | **1.05** | 1.60 | 1.66 |
| 8 mmHg | 1.42 | **1.08** | 1.64 |
| 10 mmHg | 1.63 | 1.63 | **1.16** |
| 12 mmHg | 1.80 | 1.80 | 1.60 |
| 20 mmHg | 2.07 | 2.07 | 1.83 |

The dead band sits at 7 to 8 mmHg on the light looks and at 10 mmHg on the dark ones. A healthy portal vein is 7 to 9 mmHg, and 10 mmHg is
the threshold every talk turns on. So the moving blood is at its faintest in the vessel and at the pressure the app most often shows.
Elsewhere the streaks top out near 1.7 to 2:1, which is quiet by design.

**Change.** Give each streak a crest and a trough from the same pattern: a lighter crest and, just behind it, a deeper trough, as light on
moving liquid has. On a dark lumen the crest carries it, on a pale lumen the trough does, and in between both show at part strength, so
the two never cancel. Use the lumen's own hue for both (a lighter tint and a deeper shade of the vessel's colour) in place of white and
blue-black ink, so the blood reads as that vessel's blood moving and not as grey marks on it. Aim for about 1.5:1 at the weakest point and
today's strength at the ends. No new texture read: the pattern is already there, read at a second threshold.

### 7. The blood's highlight on the lit side

**Now.** The round-tube light under the streaks (a soft highlight a third of the way across, a darker rim) sits at a fixed place across
the vessel (`y = -0.38`, `veins-gl.js` 1365), measured in the vessel's own direction. The vessel's own light and dark lines follow the
figure's one light (`tubeShade`, `dot(g, light)`). So on a vessel that runs the other way the blood's highlight is on the shaded side,
against the wall's own light line. It is also drawn only in blood style D, not in style E.

**Change.** Carry the vessel's direction to the composite (one more channel in the per-vessel bend texture) and place the highlight by the
light, as the wall's lines are. Draw it in both blood styles. The result is one light across the whole figure.

### 11. An arterial pulse (optional)

The hepatic artery's streaks move as steadily as a vein's. Letting their brightness and pace swell slightly with each heartbeat of the
model (a few percent, eased, off under Reduce Motion) would set the artery apart from the veins by its motion as well as its colour. You
ruled on 31 Oct that the bleed flows and never pulses, so this is offered, not recommended.

## Fills

### 2. A vessel behind an organ keeps its line and loses its fill

**Now.** A veiled vessel is faded as a whole to about 0.4, and its casing is halved on top of that ("the wall's line is the first thing to
go", `tubeShade`). Counted for the fill against the ground:

| Lumen pressure | Light | Soft | Dark |
|---|---:|---:|---:|
| 2 mmHg | 1.16 | **1.02** | 3.03 |
| 4 mmHg | 1.22 | **1.05** | 2.80 |
| 6 mmHg | 1.29 | 1.14 | 2.58 |
| 20 mmHg | 1.96 | 1.84 | **1.47** |

Seen on Soft: the cava at 3.8 mmHg, the largest vein in the body, is a grey smear down the middle of the figure, and the renal veins are
the same. On the dark looks the high pressures sink the same way.

**Change.** Swap the two: behind an organ the fill thins to a pale wash of the vessel's own hue and the wall line stays, at full strength
and a touch finer. That is how an atlas shows a structure seen through another: its outline is kept and its body is let go. The blood
streaks inside thin with the fill. The vessel then reads as a vessel, placed behind, at every pressure and on every look.

### 4. Organs on the dark looks as lit glass

**Now.** On Dark, Navy and Black the organs are their terracotta, plum and ochre fills at low opacity over a near-black ground. Seen on
Black: the stomach and bowel come out a flat brown, the spleen is almost the ground itself, and the kidney is a saturated plum. Three
organs in three different strengths, and the brown is the least clean colour on the screen, behind the most saturated vessels.

**Change.** On the dark looks, draw each organ as lit glass: a thin bright rim in its own light tone (the looks already carry it as
`og-*-3`), a faint fill of the same hue lifted in lightness (about a tenth), and the inner line work (gastric folds, bowel loops) in the
rim's tone at lower strength. The grey line-work organs your slides already show when a lens greys them (seen on Dark, slide 9 of 14)
are close to this and look more refined than the brown; this is that look with each organ's hue kept. All organs then sit at one
strength, and the vessels are the only saturated things on the figure.

### 5. One drawing language on the light looks

**Now.** Seen on Soft: the liver and spleen are airbrushed, with a soft blurred edge and a broad highlight, while the vessels over them
are inked, with a crisp dark casing. The two do not look drawn by the same hand, and the blurred organ edge is the softest thing in a
picture whose labels and vessels are all sharp.

**Change.** Give every organ a fine edge line (about 1 device px) in its own deep tone (`og-*-3` on the light looks) at moderate
strength, and pull the soft outer cast in to about half its spread. The airbrushed body stays. The organ then has an edge of the same kind
the vessels have, lighter in weight, so vessels still lead.

### 6. A glow that is a line of light

**Now.** A lit vessel's glow is a soft band up to 12 to 15.6 figure units past its wall, at up to 0.6 strength. Seen on Black: the
gastrorenal shunt's orange glow over the brown stomach reads as a smudge round the vessel, and it hides the vessel's own edge.

**Change.** Split it in two: a bright, thin line hugging the wall (about 1.5 device px, near full strength) and a much shorter, fainter
falloff behind it (about a third of today's reach). The eye then gets a sharp lit outline, and the halo only hints at light. It also
answers the zoom problem (a 140 px band at 6x) together with item 3.

### 10. Paper tooth

**Now.** The ground and the organs' large soft gradients are perfectly smooth, which on a large screen looks digital, and long gradients
in 8 bits can band.

**Change.** A fixed, very fine grain (2 to 3 levels, from the hash the vessel dither already uses, fixed to the figure so it pans and
zooms with it) over the organ fills and the ground. It costs one hash per pixel in the composite, breaks any banding and gives the plate
the tooth of printed paper. Leave it off the vessels and the cards.

## The lobule

### 8. Surroundings as fine line work

**Now.** Seen on Soft and on Dark: round the lobule the neighbouring lobules are large blurred shapes, soft blue discs for their central
veins and broad soft bands along the seams. Against the sharp hexagon they look out of focus, not far away.

**Change.** Draw the neighbours as what they are, in fine low-contrast line work: each hexagon's outline, a small ring for its central
vein, the triads at the corners as dots, all fading with distance from the lobule in view. Sharp but quiet says "more of the same tissue
continues"; a blur says the picture is unfinished.

### 9. Cut vessels as cut tubes

**Now.** Seen on Soft: the portal venules at the corners, the central vein, the arterioles and the bile ducts are flat discs of one
colour with a dark outline.

**Change.** Draw each as a vessel cut across: the lumen in its colour, a wall ring in the vessel's casing weight, and the same pale band
just inside the wall that the long vessels have. The central vein then looks like the end of a vessel the sinusoids drain into, which is
the point of the picture.

## 3. Line weights that hold when zoomed

Item 3 of `mesh-renderer-beautiful-fast.md` (deleted 11 Nov 2026), unchanged, listed here because it is the largest single change to the picture: the casing
goes from 1.3 px at fit to 8 px at 6x today, and the shadow from 5 px away to 28 px away. Items 2, 5 and 6 above assume it.

## What this file does not claim

- The contrast numbers are arithmetic on token colours through the shader's formulas; they leave out the casing, the shading lines and
  motion, which is most of how a streak is seen.
- "Seen" means seen in one of five screenshots, three of them from a build since removed. The organs, backdrop and colours in those are the
  shared painters', as far as the code shows, but that is read, not confirmed.
- The proposed strengths are starting values. A mock, then your devices, decide them.
