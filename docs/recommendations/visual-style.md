# Visual style recommendations (8 Nov 2026)

Read at `2bde649` on `claude/settings-topbar-icon-flvft1` (EUS line numbers checked again at `013ee7d`, which moved the coils and the port). This is a review only: no app code was changed.

How it was done. The code was read, not run: no app, no headless browser, no screenshots (the owner's rule). Contrast is the WCAG luminance ratio and ΔE is OKLab distance × 100, both computed from the token values in `src/ui/theme-tokens.js` and `styles/tokens.css` against each look's ground (Light "Linen" #F1EBE0, Soft "Oat" #DDD0B9, Dark #1A1917, Navy #0E1422, Black #000000). Where this file says what something looks like, that is read from the shader or the style and is marked as inferred where it matters. Every change proposed here stays drawn by the GPU.

Owner decisions this file keeps (not re-opened): one label style everywhere (outlined text, no boxes), real GPU glass, fixed card sizes, the textbook vessel shading with a faint contact shadow, the portal tree's heavier casing, true Black, the resistor zigzag look, streaks not dots, arrowheads 2.5 times apart, the steady bleed spot, FibroScan look G, no B-mode picture, the scope ring C1, no liver seep for ascites.

IDs: **C** colour and looks, **V** vessels, **B** blood and arrowheads, **D** devices on the figure, **S** instrument screens. Size: S under a day, M one to two days, L more.

---

## The short version

| Rank | ID | Change | Why it matters | Size |
|---|---|---|---|---|
| 1 | C1 + V1 | A pressure scale and a vessel rim that work on the dark looks | On Dark a 30 mmHg vessel is 1.41:1 against the ground and ΔE 12 against the organ behind it. The sickest vessels, the ones every talk is about, sink into the figure on the projector looks | M |
| 2 | D1 + D2 | One set of device materials, per look, read by the catheter shader | The catheter is near-white on near-white (1.04:1 on Linen) with a quarter-pixel edge. Its colours are hard-coded floats that ignore the look. There are four metals, two balloon colours and two shaft whites | M |
| 3 | D4 | Draw the TIPS stent as a covered stent | The card says "covered stent"; the figure draws a bare diamond mesh at half opacity with 0.8-unit struts that pops in whole | M |
| 4 | D3 | Pixel floors for needles, wires, struts and coils | The TIPS needle is about 1.3 px and the wire about 0.4 px at the start width; they vanish when zoomed out | S |
| 5 | B1 | Arrowheads that flip ink by lumen lightness | A dark head on a 30 mmHg lumen is 1.49:1; only its rim shows | S |
| 6 | V3 | Varices that look like varices on the figure | Red wale signs exist only in the scope, fundal varices never bead, the tortuosity is one pure sine | M |
| 7 | C2 | Linen's pale end | 0 mmHg is ΔE 3.9 from the paper, so a bleeding patient's collapsed cava vanishes by colour, not by collapse | S |
| 8 | B2 + B3 | One orange for reversed flow, and a shape cue for it | Two oranges in code; an orange head on SMV amber in the origin lens is 1.01:1; the blueprint's "never colour alone" rule has no second cue on moving blood | S |
| 9 | V2 | A paper knock-out where vessels of one tier cross | Already recommended on 5 Nov (L3 A) and not built; same-tier crossings swap colour with no edge | S |
| 10 | S1 + S3 + S4 | Scope and Doppler fixes: red wale, the away side, the varix "r" | The red wale is 1.29:1 against the varix it sits on; the hepatofugal Doppler trace is the dim one; the "r" is white on a pale fill | S |
| 11 | C4 | Untangle colour roles that collide | The Change lens's red is ΔE 2.7 from the artery; the scope and the figure use two reds for the red wale | S |
| 12 | C3 | Finish the Soft (Oat) look | 57 tokens are still pinned to the old near-white paper: organ lit faces are ΔE 4 to 9 from the ground and casings are lighter than Linen's on a darker ground | M |

Build order by package (one thread each, so no two threads edit one file) is at the end.

---

## Part 1. Colour and looks

### C1. A pressure scale that works on the dark looks (high, M)

**What is wrong.** There is one `--ramp-pressure` for all five looks (`styles/tokens.css:23`). It falls in lightness as pressure rises, which is right on paper and backwards on a dark ground. Contrast of each stop against the ground:

| mmHg | 0 | 5 | 10 | 12 | 20 | 30 |
|---|---|---|---|---|---|---|
| Linen | 1.02 | 1.57 | 2.85 | 3.69 | 5.86 | 10.5 |
| Oat | 1.25 | 1.22 | 2.22 | 2.88 | 4.57 | 8.20 |
| Dark | 14.5 | 9.45 | 5.19 | 4.01 | **2.53** | **1.41** |
| Navy | 15.1 | 9.89 | 5.44 | 4.20 | 2.65 | 1.47 |
| Black | 17.3 | 11.3 | 6.21 | 4.80 | 3.02 | 1.68 |

On Dark the 30 mmHg stop is also only ΔE 12 from the organ fill behind it (the liver at `--organ-a` .3), where the 5 mmHg stop is ΔE 46. A decompensated patient's portal tree lives at 20 to 25 mmHg, so on the projector looks the sickest vessels are the faintest things on the figure, and the healthy cava is the brightest (14:1). The dark casing cannot help: Dark's casing (`10 8 8 / .6`) is 1.09:1 against the ground and Black's is the ground itself. The vessel shader already knows: it backs its dark line off on dark lumens (`src/ui/veins-gl.js:774-779`). The flow, velocity, heat and drop ramps have the same dark end (1.46 to 1.67:1).

**Why it is not done yet.** The table is built once: `lutBuilt` in `src/ui/colormap.js:72-75` is never reset, and every `makeScale` and `deltaColor` keeps its first table. The Linen build (CHANGELOG, 6 Nov) left the pale end alone for this reason.

**What to do.**
1. In `colormap.js`, subscribe to the theme epoch (`onTheme` in `src/ui/theme-epoch.js`, already used by `gl-words.js`, `col-wave.js`, `fibroscan.js`): set `lutBuilt = false`, clear `GRADS`, reset each `makeScale`'s `built` and `cssKept`, and set `deltaReady = false`. `cssRamp` already keys its cache by the token's text (`src/ui/util.js:1334`), so a new value is read as soon as the table is rebuilt. Check that the vessels take the new colours at once on a look change (`main.js:1426` `stage.lookChanged`, `live.themeSnap` in `stage-vessels.js:921`), and that the legend keys, the lobule and the sinusoid re-read them (`lobule-zoom.js:750`, `sinusoid-view.js:345`).
2. Move `--ramp-pressure` from the hand-written block into `TOKENS` in `theme-tokens.js` (light keeps today's value, Soft pins today's value, see C2), and give `dark` its own, which Navy and Black inherit:

   `--ramp-pressure: #D7E7F4 0, #9DC9F7 5, #7BA1FC 10, #A074F4 12, #BD2C92 20, #B31553 30;`

   It keeps the hue path (ice, sky, cornflower, violet, magenta, wine) and keeps lightness falling at every stop (OKLab L .92, .82, .72, .66, .555, .50), so it passes the A7 test (`tests/vessel-blood-visuals.test.js:167`: each stop darker by .03 or more, 12 to 20 mmHg by more than .1). Against Dark it gives 13.9, 10.2, 7.0, 5.3, **3.3, 2.6**:1 (Black 3.9 and 3.2), and the 30 mmHg stop is ΔE 24 from the organ fill (was 12). Neighbouring stops stay ΔE 9.7 to 18.6 apart (today 11.2 to 18.9). All six are in gamut.
3. Give the dark looks' flow, velocity, heat and drop ramps the same treatment (a floor of about L .5 on their dark ends).
4. Tests to update with the change: `vessel-blood-visuals.test.js:120` (G12 pins the 0 stop at #DCEBF7 in every block), `orange-chevrons.test.js:27` (lists today's stops as backgrounds), and the ramp copies in `still-layer.test.js:61` and `profile-model.test.js:39`.

An alternative was tried on paper: a dark ramp whose lightness rises with pressure (the danger end the brightest). It separates neighbouring stops less (ΔE 6.5 to 8.3 between 0, 5 and 10) and breaks the one reading rule the legend, the handout and the A7 test share ("deeper is higher"), so it is not recommended. Pair this with V1, which gives a dark lumen a light rim.

### C2. Linen's pale end (medium, S)

0 mmHg (#DCEBF7) is 1.02:1 and ΔE 3.9 against Linen. In a healthy figure this hardly shows (the cava and hepatic veins sit at 3.5 to 4.5 mmHg, ΔE about 12, and the casing draws them), but a bleeding, hypovolaemic patient's right atrium and cava at 1 to 2 mmHg lose their colour against the paper. The learner sees a vessel empty out by colour when the lesson is that it collapses.

Linen only (in `TOKENS.light`): `#B8D5ED 0, #85B6E9 5`, the rest unchanged. That is 1.28:1 and ΔE 10 at 0 mmHg, 1.79:1 and ΔE 21 at 5, with neighbouring stops ΔE 10.9 and 13.6 apart, and lightness still falling. Soft must pin today's two stops: Oat is darker than #DCEBF7, so today's pale end reads lighter than the ground there (ΔE 9), while #B8D5ED would sit at Oat's own lightness (1.00:1).

### C3. Finish the Soft (Oat) look (medium, M)

Soft was rebuilt on 6 Nov but its block still says "Soft keeps the Light values it was built on until it is redone: 57 tokens pinned" (`theme-tokens.js` soft block). The pins were tuned for the old near-white paper and now sit on a darker cream:
- The organs' lit faces (`og-*-1`) are ΔE 4 to 9 from the Oat ground (Linen 6 to 18), so the organs lose the top of their light-to-shade form.
- `casing-a` is .56 against Linen's .64 and `tube-shade` .2, so Soft's vessel edges are the weakest of the light looks on the ground where the pale lumens need them most (5 mmHg is 1.22:1 on Oat).
- `knockout` is `rgba(251, 250, 247, .75)`, the old paper (it is unused today, see C5).

Re-derive Soft's `og-*-1/2/3` and `organ-*` so each sits the same OKLab step from Oat as Linen's sit from Linen, raise `casing-a` to about .66, and run `npm run gen:theme` and `npm run gen:stops` (the organ strength lives in the stop table; see the Linen and Oat notes in project memory).

### C4. Colour roles that collide (medium, S)

| Collision | Numbers | Fix |
|---|---|---|
| Change lens "higher" against the artery | `--delta-high` #D22846 vs `--artery` #c91f36: ΔE 2.7 on Linen (heat's .75 stop #D7263D: ΔE 3.2). The artery is flat `--artery` in every lens (`stage-vessels.js:704`), so in the Change lens every artery reads "rose a lot" | Draw arteries in `--lens-neutral` in the lenses whose ramp uses red (Change and Heat). Keep `--artery` in the pressure and origin lenses |
| Two oranges for one meaning | `--flow-reversed` #EC7424 / #FF8C42 and `--blood-reversed` #FF8C29 (hand-written, `tokens.css:37`, read once at `util.js:1348`) | See B3 |
| Reversed head in the origin lens | an orange head on SMV amber #E69929 is 1.01:1 | See B2 |
| Red wale, two reds | figure `--red-wale` #D0192E; scope `--endo-red-wale` rgb(158, 26, 42); the CPU twin hard-codes its own (`endo-render.js:145, 161, 166`) | One token, see S1 |
| Portal and wedged traces | #B01E62 and #A52DA9 on light, #F0649E and #DA7EDD on dark: about 35° of hue apart at similar lightness (`pressure-time.js:34-35`). The hues are pinned by tests and were the owner's | Keep the hues; draw the wedged trace dashed (and its monitor line, `--mon-wedge`) |
| Accent against 10 mmHg on dark | `--accent` #7C9BFF is ΔE 7 from the 10 mmHg stop | Low. Watch it where the accent is drawn on the figure (the selection ring at .34, `stage-vessels.js:935`; the traction arrow; the circuit's lit zone) |

### C5. Dead and duplicate tokens (low, S)

`--balloon`, `--balloon-line` and `--knockout` are read nowhere; `--inst-panel` is read into `th.panel` in `fibroscan.js:33` and not used. The catheter's `--cath-body`, `--cath-tip` and `--cath-balloon` reach only the SVG fallback and the tamponade tube, while the GPU catheter uses floats (D1). The comment at `tokens.css:127` says the wedge balloon and the tamponade balloons share `--latex`; they do not any more. Fold these into D1's material set and delete the rest.

---

## Part 2. Vessels

### V1. A rim that follows the lumen, so dark lumens get a light edge (high, S)

The casing is one colour per look (`veins-gl.js:761`). Its contrast against the ground: Linen 4.86:1, Oat 3.51, Navy 2.61, Dark 1.09, Black 1.00. Navy is the only dark look whose vessels have an outline, because its casing is pale (`214 222 246 / .34`). On Dark and Black a dark lumen inside a near-black casing has no edge at all.

In the vessel shader, mix the casing toward a light rim by the lumen's own lightness, the way the label halo works: `lumY` is already computed (`veins-gl.js:777`; move it above the casing line), so the change is about two lines. On the dark looks, a lumen darker than about .3 gets a 1 device px rim in `--light-ink` at about .3 inside the casing; pale lumens keep the dark casing. On the light looks nothing changes. With C1 this lifts a 30 mmHg vessel on Dark from 1.41:1 with no edge to 2.6:1 with a light edge.

### V2. A paper knock-out where vessels of one tier cross (medium, S)

Recommended on 5 Nov as L3 option A (`/mnt/project-files/portal-reliability/app-and-blood-review.md`, Part 4) and not built. Vessels in different tiers cross with a casing; vessels in the same tier only swap which lumen owns the pixel (`veins-gl.js:685-696`), with the 8 % contact shadow as the only cue. A 2.5 px ring of `--stage-bg` round the front vessel where the owner changes is the atlas convention and is drawn once into the kept layer.

### V3. Varices that look like varices on the figure (medium, M)

- **Red wale on the figure.** The blueprint (§6.3) asks for a red-wale overlay on the esophageal strands when wall stress is high; today `--red-wale` is used only in the endoscopy, the dock and the instruments. Tint the strands' dark line toward the shared red-wale token (S1) when the varix's red-wale reading is on, using the existing per-vessel recolour path (tube texels); no new pass.
- **Beading beyond C1a.** Only the esophageal channel C1a beads (`stage-tubes.js:229`), at ±35 % with a 22-unit period, from 6 to 8 mm (`varix-bead.js`). Bead the fundal feeder C2 and the gastrorenal shunt C5 with a longer period (about 30 units) so fundal varices read as a knot, not a tube.
- **Tortuosity.** The wiggle is one pure sine (`stage-paths.js:85-101`, amplitude 1.5 + 3.5 × size). Add a second harmonic at an incommensurate period and about a third of the amplitude so recruited collaterals stop reading as a spring.

These fit the owner's 29 Oct direction ("Gastric varices should visibly get smaller and less intense the less pressurized they are"): every cue still follows the model's size.

### V4. Thin vessels may stripe (low, S; check on a device)

The light line needs a width of 3.4 px (`stage-vessels.js:728`); between 3.4 and about 5 px the light line, the dark line and the rim together cover most of the lumen, so a thin vessel likely reads striped (inferred, not seen). Raising the light line's threshold to about 6 px is one number. Look at the IMV and the gastric veins at a phone's fit before changing it.

### V5. Circuit: zones you can see, in the chart's own colours (low, S)

The circuit's zone bands are `--text` at .028 (`stage.js:1133`), about ΔE 1.4 on Oat: below what anyone sees. The pressure profile already has zone tokens (`--chart-pre-band`, `--chart-liver-band`, `--chart-post-band`, `tokens.css`, at .09 to .10). Use those in the circuit so the map and the ladder speak one zone language. Optional, and an owner call: the circuit's lanes use the full tube shading (`fx` on, `stage-vessels.js:861`); scaling the light and dark lines by the morph (`1 - t`) would make the lanes flat transit-map lines.

---

## Part 3. Blood and arrowheads

Status of the 5 Nov blood review: B1, B3 and B6 are fixed; B2 (correlated tile reads, `blood-tile.js:73-74`), B4 (the look flips at morph 0.5, `stage-blood.js:381`) and B5 (the tube light at y = −0.38, `veins-gl.js:1336-1343`) are still open. They belong to the blood thread and are not repeated here.

### B1. Arrowheads that flip ink by lumen lightness (high, S)

The head is `--blood-chevron` #14141A tinted a fifth toward the lumen, with a light rim at .75 (`veins-gl.js:1722-1735`, the same in `blood-heads.js:136`), on every lumen and every look. On a 30 mmHg lumen the core is 1.49:1 and on 20 mmHg 2.64:1, so at the pressures the talks are about the head reads as a pale outline with a hole. Use the label rule: for lumens lighter than about .35, today's dark head with a light rim; for darker lumens, a near-white head (`--blood-chevron-light` #FFEEDC) with a dark rim. Blend by `lumY` over a small band so a vessel whose colour eases never pops. The reversed-on-orange branch (`chevOrange`) already does exactly this for one case; generalise it.

### B2. A shape cue for reversed flow (medium, S)

Reversal is colour only: an orange head (`revCol`). The blueprint's principle P7 ("never colour alone") asked for a second cue, and the only ⟲ today is on station pills (`stage-label-items.js:197-199`). Where colour fails the head is nearly gone: on SMV amber in the origin lens 1.01:1; on a 5 mmHg lumen 1.25:1 (hue carries it there, luminance does not). Give a reversed head a second, smaller notch behind it (a » pair) in `chevHead` (`chevron-glsl.js:8-14`), eased in with the reversed flag the shader already has. In the origin lens, keep the head in its normal ink and let the pair alone say "reversed".

### B3. One orange for reversed flow (low, S)

`--blood-reversed` #FF8C29 is hand-written and not per look; `--flow-reversed` is #EC7424 on Linen and #FF8C42 elsewhere (1.01:1 from #FF8C29, but 1.27:1 from Linen's). Set `--blood-reversed: var(--flow-reversed)` and read it per look (`util.js:1340` calls the blood colours theme-independent; they are read once). The arrows, the direction lens and the pills then say "reversed" in one orange.

### B4. The dye's front edge (low, S)

The lime dye (#C7F533) is separated from pale lumens by hue only: 1.04:1 on #DCEBF7, 1.46:1 on #99C2ED. A thin darker leading edge on the bolus (a few pixels, in the lumen's own deep shade) would show where the front is, which is what the dye teaches.

### B5. The sinusoid's own language (low, S)

The sinusoid view has its own shader: white glints, nine lanes, no heads, and only two big end arrows (`sinusoid-gl.js:222-241, 439-451`). White glints on a healthy pale lumen are 1.2 to 1.9:1, and reversal only flips the glint's leading end (line 238). Tint the glints by lumen lightness as B1 does, and fix the header of `chevron-glsl.js`, which says the sinusoid shares `chevHead` (only `veins-gl.js` imports it).

### B6. Stagnant blood (low, S)

Stasis is the blueprint's thrombosis-risk cue. Today it is faint smoke (alpha × .6, density floor .45, about 2 to 3 px a second in a fixed direction; `veins-gl.js:1114, 1318, 1332`), about 1.15 to 1.76:1, with no heads. A slightly stronger, slower, swirling drift (no pop in or out, as the owner asked on 31 Oct) would let a learner see a near-still portal vein as "stagnant" rather than "empty".

---

## Part 4. Devices on the figure

How they are drawn today. The catheter family (the HVPG catheter, and TIPS, BRTO, BATO and EUS on the same chassis) is drawn by the catheter shader (`CATH_FS`, `veins-gl.js:913-1000`: mode 2 polymer, 3 metal band, 4 rounded tip, 5 balloon, 7 and 8 flat edges, 9 ultrasound sector) with colours hard-coded as floats in `stage-cath.js:389` and `eus-scope.js:223-224`. The stent, the tamponade tube and balloons, bands, clots and badges are SVG marks painted on the GPU, coloured by tokens. So the look reaches one family and not the other.

### D1. One set of device materials, per look (high, M)

Today: the shaft is `CATH_POLY` [.94, .94, .93] (#F0F0ED) on the GPU and `--cath-body` #F4F6FA on the tamponade tube; there are four metals (`CATH_METAL`, EUS `STEEL`, `--stent-metal`, and `--cath-tip` as the tamponade marker); two balloon colours (`CATH_LATEX`, a cool white, and `--latex`, a cream); and the EUS scope's `BLACK`, `INK`, `FAN` floats.

Make one material table in `theme-tokens.js`, read by the catheter shader (through the same `toRGB` the needle flash already uses) and by the marks. Starting values, with their contrast against Linen / Oat / Dark:

| Material | Light looks | Dark looks | Used by |
|---|---|---|---|
| `--dev-poly` (catheter, tube) | #9AA9BC, a blue-grey polymer: 2.0 / 1.6 / – | #F0F0ED, today's ivory: – / – / 16 | every catheter shaft and the tamponade tube |
| `--dev-poly-edge` | #2A303B: 11.2 / 8.7 | #C9CED6 (a light hairline) | the shaft's edge (D2) |
| `--dev-latex` (compliant balloons) | #DDB262 amber latex at higher fill: 1.7 / 1.3 | today's | HVPG wedge, BRTO and BATO occlusion, tamponade balloons |
| `--dev-latex-edge` | #8F6A33: 4.1 / 3.2 / 3.6 | – | balloon rims |
| `--dev-nylon` (non-compliant) | a clearer, cooler tint (today's `CATH_LATEX`) with crisper shoulders | – | the TIPS angioplasty balloon only |
| `--dev-steel` | #7C8696: 3.1 / 2.4 / 4.8 | today's `STEEL` | needles, wire, EUS steel |
| `--dev-platinum` | #8E949E | today's `CATH_METAL` | marker bands, coils |
| `--dev-glue` (cyanoacrylate cast) | #3B4E6B: 7.1 / 5.6 | a pale cast on the dark looks | D7 |
| `--dev-ptfe` (stent cover) | a pale grey wash | a pale grey wash | D4 |
| `--thrombus` | today's #5A1A24 | #8C3442 body, #D49AA0 edge (2.3 and 7.5 on Dark) | clots (D9) |

The compliant / non-compliant split gives the two balloon colours a reason: the occlusion and tamponade balloons are latex, the TIPS dilation balloon is a clear nylon balloon. Delete `CATH_*`, the EUS floats and the unused tokens (C5) once the table is read.

### D2. The catheter on paper (high, S)

On Linen the shaft is 1.04:1 against the ground (1.33 on Oat), so wherever it crosses bare ground (the SVC lead-in, `stage-cath.js:117`) only its edge draws it. That edge is `CATH_EDGE` 1.16, 0.16 of the shaft's radius: about a quarter of a pixel at the HVPG start width (a 1.6 px radius, `stage-cath.js:225`), and the shaft's own shaded rim fades out below 2.5 px wide (`rim = smoothstep(2.5, 9.0, wpx)`, `veins-gl.js:945`). The shadow is a symmetric halo at .2 (`stage-cath.js:321`), not cast along the one light like the vessels' (`shOff`).

- Make the edge at least 1 device pixel: radius `rc + max(0.16 rc, 1 px)`, with `px` (world units per device pixel) already known when the strips are built.
- Use `--dev-poly` (D1) so the shaft has a body on paper, not only an edge.
- Offset the contact shadow along `LIGHT` as the vessels do, so the catheter sits on the figure in the same light.

### D3. Pixel floors for the finest devices (high, S)

Device widths are world units fixed when the route is built (`cath.rc`, `stage-cath.js:225`), so they thin with the zoom: the TIPS needle is `rc × .42` a side (about 1.3 px wide on a 1.6 px shaft radius, `stage-cath.js:337`), the wire core `rc × .14` (about 0.4 px, line 333), the EUS coil's wire 0.56 units (`eus-scope.js:384`), the stent's struts 0.8 and rails 1.15 units (`theme-tokens.js` `stent-*`), and the marks reader has no minimum. Floor each at draw time: needle 2 px, wire 1 px, coil 1.5 px, strut and rail 1 px, the scope ring 1.25 px (D10). A floor is a `max(w, k · px)` in the strip builder, so it still moves 100 % with the figure.

### D4. Draw the TIPS stent as the covered stent it is (high, M)

Today `stentMesh` (`stage-transitions.js:292`) draws a uniform diamond lattice (`meshPaths`, lines 260-289) at alpha .5, with a marker line at each end, and it appears whole at once while the venous stent unrolls. The slides call it a covered stent, and the reason covered stents changed TIPS (they stay open) is part of the TIPS talk.

Draw it in three parts on the same path: a PTFE-covered length through the liver tract (a pale `--dev-ptfe` wash over the lumen under the struts, the struts fainter under it), a bare 2 cm of open struts at the portal end, and one radiopaque ring where the two meet (`--dev-platinum`). Unroll it from the portal end over the deploy step, as `venousDraw` already unrolls the venous stent (`meshPaths` takes `k`). With D3's floors the struts stay visible when zoomed out. DIPS and the other stent-tool shunts keep the plain mesh.

### D5. The tamponade tube (medium, S)

The tube is a 1.4-unit `--cath-body` stroke on a 2.2-unit dark rim (`app.css:741-742`), so it reads as an outline on paper. The balloons are `--latex` at .34 fill (1.04:1 on Linen; `app.css:737-739`), carried only by a 0.7-unit edge. With D1: the tube in `--dev-poly`, the balloons in `--dev-latex` at about .45 fill on the light looks with the `--dev-latex-edge` rim at 1 px or more. The marker bands take `--dev-platinum` instead of `--cath-tip` ink.

### D6. The EUS scope and its fan, per look (medium, S)

The insertion tube is `BLACK` [.17, .18, .2] with an `INK` hairline darker still (`eus-scope.js:223`): about 1.27:1 on Dark, and the hairline adds no edge there, so only the grey tip and the pale transducer face show. The ultrasound fan is `FAN` [.8, .86, .93] at .2 (line 277): under 1.1:1 on Linen. The Doppler's wedge already solves this with `--dop-glow` (dark ink on light, white on dark, `dop-probe.js:499`). Give the scope a light hairline on the dark looks (`--dev-poly-edge`) and draw the fan in `--dop-glow` at the same low alpha, so the two probes on the figure behave alike.

### D7. Coils and glue that look like coils and glue (medium, M)

- **Coils.** Today a steel helix on a dark edge (`COIL_LAYERS`, `eus-scope.js:384`). Use `--dev-platinum` and add short fibre tufts every half turn (two short strokes across the wire, pale), which is what makes an embolisation coil read as one and is why it holds the glue.
- **Glue.** Today the cyanoacrylate is a soft tint of the varix lumen in `--tr-scler` (`stage-cath.js:233-238`, `proc-anim.js:381`), the same token BRTO's sclerosant uses and a chart ink besides. The step says it "casts the varix from inside" (`proc-anim.js:203`). Draw it as an opaque, slightly glossy cast in `--dev-glue` that fills the lumen and stops at the coils, with the blood streaks stopping inside it. BRTO's sclerosant can keep the translucent `--tr-scler` wash: that difference (a liquid against a solid cast) is the teaching point.

### D8. Ligation bands on the esophagus (low, S)

Bands are flat ellipses (rx 11, ry 3) in `--text` (`stage-clamps.js:310`, `.band-ring` `app.css:735`) placed on a straight line `789 + (y − 24) × .066`. Against the esophagus's own Béziers (`balloon-eso.js:5-6`) that line runs about 2 units right of the centreline, so a band's right end pokes about 3 units past the wall, and the first band (y 272) sits below the drawn esophagus, which ends at y 251 (computed, not seen). Place them on `balloon-eso.js`'s centreline and walls, bend each to the wall's direction, and draw them in a device colour rather than text ink.

### D9. Clots on the dark looks (low, S)

`--thrombus` #5A1A24 at .4 to .6 with a #36101A edge is the same in every look (`theme-tokens.js:154`, `app.css:693, 730-732`): fine on paper, dark on dark in a wine lumen. Use D1's dark-look clot (#8C3442 body, #D49AA0 edge).

### D10. The scope ring at whole-figure zoom (low, S)

Mock C1 stays as it is ("C1 is perfect", `scope-lens.js:1`). Only its size: the ring is 0.85 world units and the badge 12 units across with glyph parts of 0.5 to 1.3 (`scope-lens-rule.js:9, 12, 44-66`), sub-pixel at the whole-figure fit (inferred). Give the ring stroke a 1.25 px floor (D3) and the badge a minimum of about 16 CSS px, since it is the only way into the lens.

### D11. Not drawn today (information)

- BRTO and BATO show their closure as a badge with an X (`stage-clamps.js:286-287`). That is correct for those two; a plug or coils belong to PARTO and CARTO, which the app does not play.
- The surgical shunts (Warren, portocaval, mesocaval, Meso-Rex) are ordinary vessels with a tie and a suture line (`app.css:719-720`). A short suture-line mark at each anastomosis would say "made by a surgeon" at a glance; low priority.
- Mode 1 of the catheter shader (the still blood column) has no caller (`veins-gl.js:938`); the column is drawn as a vessel tint (`stage-cath.js:221-262`). Remove the branch or note why it stays.

---

## Part 5. Instrument screens

The scope, the Doppler, the HVPG tracing, the monitor and the FibroScan map are drawn dark in every look, as their machines are (`tokens.css:101`). That stays.

### S1. Red wale and cherry-red spots (medium, S)

`--endo-red-wale` rgb(158, 26, 42) over the large varix's blue rgb(80, 90, 172) is 1.29:1 (1.34 after the 0.6 mix at `endo-gl.js:154`): told apart by hue alone, and dimmer than the varix. The Endoscopy talk teaches exactly this sign. Use one brighter cherry red for the figure and the scope, about #E8404A (1.55:1 and ΔE 30 against the varix), as one token replacing `--red-wale` and `--endo-red-wale`, and read it in the CPU twin instead of its literals (`endo-render.js:145, 161, 166`; its Z-line literal has already drifted from the token).

### S2. The scope's bezel and resolution (low, S)

- `--scope-rim` #0c0d10 is the same on every look (`instruments.js:342`): heavy on Linen and Oat, gone on Black and Navy. Add a 1 px `--border` hairline outside it on the dark looks.
- The field is capped at 480 px (`instruments.js:237`); a large card at 2× is upscaled, which softens the fine vessels and the grain (inferred). Try 720 on 2× screens once the perf thread has a device timing.

### S3. The Doppler's away side (medium, S)

Blue-away, red-toward is the convention and stays. But after the 28 % softening (`doppler-synth.js:56`, `dopplerColor.js:75-80`) away is about 3.4:1 on the scope's black against 5.9:1 for toward, and the away side is the hepatofugal portal trace, the key teaching case. Brighten `--dop-away` to about #5072E0 (4.8:1 on black; today #3A4BA8 is 2.75:1). The figure says "reversed" in orange and the Doppler in blue; one line in the Doppler card's key ("below the line: away from the probe; here, hepatofugal") ties the two together.

### S4. The varix cross-section (medium, S)

- The "r" is white (`instruments.js:567`) on the pressure fill: 1.22:1 at 0 mmHg and 1.86:1 at 5. Give it the one label style (the label outline: halo stroke under the fill, as the T3 readings got on 7 Nov) so it reads on every fill.
- The rim jumps from `--text-2` to `--danger` at a ratio of .7 (`instruments.js:539`), while the stress meter beside it has four states. Follow the meter: ok, caution, danger, critical.

### S5. Smaller screen items (low, S)

- Over-time traces: dash the wedged trace (C4).
- The lobule's zones are nested hexagons at 17 to 20 % (`lobule-paint.js:284`) and read as a target; a radial gradient from the portal tracts to the central vein (the tissue shader, `tissue-gl.js`) reads as zonation.
- The ascites belly (`.ab-belly`, `app.css:5049-5050`) is a CSS box with a gradient fill: the one in-card picture in this review drawn by the browser rather than the GPU. Hand it to the GPU inventory's owner (`docs/off-gpu-inventory.md`).

---

## Build order

Grouped so one thread owns each set of files. Each step is one push.

| Step | Package | Items | Main files | Size |
|---|---|---|---|---|
| 1 | Look-aware colour | C1, C2, V1 | `colormap.js`, `theme-tokens.js` (then `npm run gen:theme`), `veins-gl.js` (casing line), the four tests in C1 | M |
| 2 | Device materials | D1, D2, D3, D5, D6, D9, C5 | `theme-tokens.js`, `stage-cath.js`, `eus-scope.js`, `veins-gl.js` (CATH_FS reads), `app.css` device rules, `stage-marks.js` (floors) | M |
| 3 | Arrowheads | B1, B2, B3 | `veins-gl.js` composite heads, `blood-heads.js`, `chevron-glsl.js`, `util.js` blood colours (the blood thread) | S |
| 4 | Covered TIPS stent | D4 | `stage-transitions.js`, `proc-anim.js` (deploy timing) | M |
| 5 | Varices | V3, D8 | `stage-tubes.js`, `varix-bead.js`, `stage-paths.js`, `stage-clamps.js` | M |
| 6 | Crossings | V2 | `veins-gl.js` vessel pass | S |
| 7 | Screens | S1, S3, S4 | `tokens.css` hand block, `endo-gl.js`, `endo-render.js`, `doppler-synth.js`, `instruments.js` | S |
| 8 | Soft finish | C3 | `theme-tokens.js` soft block, `npm run gen:theme`, `npm run gen:stops` | M |
| 9 | Roles and zones | C4 (artery in data lenses, dashed wedge), V5 | `stage-vessels.js`, `pressure-time.js`, `stage.js` map ink | S |
| 10 | Coils and glue | D7 | `eus-scope.js`, `stage-cath.js` | M |
| 11 | The rest | B4, B5, B6, S2, S5, D10, V4, D11 | various | S each |

Steps 1 and 3 both touch `veins-gl.js` (the vessel pass and the composite): run them in order, not side by side. After step 1, look at the three teaching states (healthy, CSPH, decompensated cirrhosis) on Dark and Black before tuning further: the numbers above say they will read, but only a screen says how they look.

## What this review does not claim

- Nothing here was seen on a screen. The contrast and ΔE numbers are arithmetic on token values; they ignore the shading lines, the casing and the blood drawn over a lumen.
- Device realism notes (covered stents, fibred coils, latex against nylon balloons, the glue cast) describe the common devices, not every brand.
- Sizes are estimates from reading the code.
