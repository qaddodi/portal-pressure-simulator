# Redesigning the organs and vessels: atlas-faithful, still flat and minimal

A plan for the anatomy plate: the organ silhouettes and shading, the vessel routes and calibres, and
the way disease shows on them. Reviewed at the integration branch (`a04d37ad`) from 2× renders of the
healthy, cirrhotic (decompensated), right-heart-failure and Budd–Chiari patients in both themes, and
from the code that draws them: `src/ui/anatomy.js` (`ORGANS` 411–436, `ORGAN_DETAIL` 437–447,
`NODE_POS` 61–103, `EDGE_PATH` 105–206, `STRANDS` 207–221), `src/ui/stage.js` (organ build 548–603,
liver pathology 604–765, organ update 3776–3830, diaphragm 3677–3760, plate raster 2933–3147) and
`styles/tokens.css` (organ tones 47–57, dark 236–246).

The target look, in one sentence: **a modern atlas plate drawn flat**. Correct proportions and
positions, each organ a clean silhouette in its own tissue hue, one hard-edged shade shape and one
small highlight (cel shading, not gradients), a crisp ink outline, two or three interior lines for
surface anatomy, and disease shown by changing the shape, the hue and a sparse surface pattern. No
3D rendering, no blur, no photographic texture. The GPU vessel tubes already have this character and
are kept; the organs are brought up to meet them.

Everything below is drawn once per state into the organ plate (`stage.js:3000-3030`), so none of it
adds per-frame work. Section 5 lists the performance rules the redesign must keep.

---

## 1. What is anatomically off today

Measured on the 2× healthy render (world coordinates are the plate's 1400 × 1000 units; the anatomy
viewport is `VB_ANAT = [300, 0, 820, 920]`, midline at x ≈ 620 where the IVC runs).

**Liver**
- Far too large: the silhouette (`anatomy.js:427`) spans x 322–873, 550 units, two and a half times the
  stomach's width, and reaches the spleen. An atlas liver spans from the right flank to just past the
  midline, with a thin left lobe ending over the stomach's upper body, roughly 60 % of this width.
- One featureless lens: a flat inferior margin, no distinction of the right and left lobes beyond a
  single faint falciform line (`ORGAN_DETAIL.liver`), no gallbladder (the changelog says the fundus was
  drawn once; it is gone), no inferior notch for the ligamentum teres, no caudate shoulder beside the IVC.
- Drawn behind the stomach: the stomach is later in `ORGANS` so it paints over the liver's left half.
  Anatomically the left lobe lies in front of the stomach's upper body. The layering should be the
  other way round, which also lets the liver hide the top of the left gastric vein as it really does.

**Intrahepatic vessels**
- The portal branches and hepatic veins form a closed ring (RPV → `SIN_R` → RHV → IVC, and the same on the
  left), so the liver reads as a bicycle chain with two fish-net "sinusoid" bulbs at the lobe tips
  (`STRANDS.SIN_RR/SIN_LL`, `anatomy.js:217-218`). An atlas shows two separate trees: portal branches
  ramifying into the lobes and three hepatic veins converging on the IVC just under the diaphragm.
- The middle hepatic vein is drawn as a short stub (`POST_R_MHV`, `MHV_IVC`) so the right and left
  veins meet the IVC as a symmetric "Y"; the three veins should enter at distinct heights, the right one
  largest.

**IVC, heart**
- The IVC is a straight pole from the pelvis to above the heart (`IVC_IS` x = 620, `IVCS_RA`, `SVC_RA`,
  `V_UP`), passing *through* the right atrium (`heart-ra`, `anatomy.js:418`) and on as the SVC. The cavae
  should enter the atrium at its lower and upper poles, the IVC widening behind the liver and bending
  slightly as it passes the caudate lobe.
- The heart is a pale ventricle silhouette with a separate red "tomato" for the atrium; the atrium
  outline is larger than the ventricle body that it sits on. A small, single heart silhouette with the
  atrium as a chamber on its right border (viewer's left) reads better and is what the slides point at.

**Stomach, duodenum, bowel**
- No fundus: the stomach's top is flat (`anatomy.js:426`, from 813,249), so the cardia sits at the
  highest point. The fundus should dome up under the left hemidiaphragm, above and to the left of the
  cardia, touching the spleen. The body is also oversized relative to the liver and ends too low.
- The duodenal C-loop (`anatomy.js:425`) is drawn to the viewer's right of the midline (x 644–806
  centred on ≈ 725), under the stomach's body, and the SMV runs through it. It belongs to the patient's
  right of the midline (viewer's left, around x 520–640), framing the pancreatic head, with the SMV
  passing behind its third part.
- The small bowel is a single long ribbon folded four times (`anatomy.js:424`), which reads as one worm.
  Three to five short loops filling the colon frame are the atlas convention and still minimal.
- The colon frame is good; only the cecum sits very low and the sigmoid/rectum tail ends at the left
  margin instead of turning to the midline.

**Umbilicus and abdominal wall**
- The umbilicus (`SITES.umbilicus`, `anatomy.js:432` circle at 500, 800) is 120 units to the patient's
  right of the midline, so the paraumbilical vein and the caput medusae radiate from the wrong place.
  It belongs on the midline (x ≈ 620) a little below the level of the iliac crests.

**Spleen, kidney, pancreas, esophagus**
- The spleen is a reasonable bean but its hilum faces straight down-left; it should face anteromedially
  toward the stomach with the splenic vein leaving it at mid-height. Splenomegaly scales about the
  centre (`stage.js:3817`), so a big spleen grows into the diaphragm instead of down toward the
  umbilicus.
- The left kidney is a plain oval with no hilum, sitting low and lateral; it needs a medial hilar notch
  for the renal vein and should sit higher, behind the spleen's lower pole.
- No pancreas, so the splenic vein and the confluence float in empty space. A faint pancreas is the
  atlas landmark that explains the splenic vein's course and the sinistral hypertension of pancreatitis.
- The esophagus is a straight tube; a gentle leftward curve above the hiatus and a short abdominal
  segment entering the cardia obliquely are enough.

**Vessel calibres and shape**
- Base calibres (`topology.js` d, drawn as `1.3 · 2 · d^0.72` px, `stage.js:40`) give IVC 22 mm → 23 px,
  PV 12 → 16 px, SMV 10 → 14, SV 8 → 12, LGV 4 → 7, which is a sound hierarchy. But every vessel is drawn
  at one width along its whole length (only the organ tips fade, `TIP_FADE`), so veins look like pipes.
  Atlas veins taper toward their tributaries and swell at confluences.
- Junction angles: the SMV meets the splenic vein at nearly 90° and the left gastric vein joins the
  confluence with a loop (`LGV_CONF`); both should be acute, in the direction of flow.

**Disease states as drawn**
- Cirrhosis: the organ keeps its healthy size (`shrink = 1 − 0.035·c`, `stage.js:3800`) and the margin
  stays smooth (±2.2 units, `:740`); the regenerative nodules are a uniform honeycomb of equal cells
  (`lv-nod`/`lv-sep`); no tawny colour shift reaches the plate; the left lobe does not visibly
  hypertrophy. The spleen enlarges well. The ascites is a flat straw band over everything.
- Congestion (right heart failure, Budd–Chiari): the liver swells a little and is sprinkled with faint
  purple dots (`lv-nut`, fill-opacity .07) that read as a rash rather than nutmeg; the hue does not
  deepen; the hepatic veins and IVC do not visibly widen; the atrium does not enlarge; in Budd–Chiari the
  occluded hepatic veins look identical to open ones.
- Dark theme: all organs collapse to one brown; the liver, stomach and kidney cannot be told apart.

---

## 2. The style guide (how every organ is drawn)

**Construction, per organ (five layers, all plain fills and strokes).**

1. *Silhouette fill* in the organ's base tone (`--og-<tissue>-1`).
2. *Shade shape*: one hard-edged region in the shade tone (`--og-<tissue>-2`) covering the lower-right
   third, built as the silhouette clipped by a copy of itself translated (−6, −8) and inverted (the
   clip exists today as `clip-<id>`; the three widening strokes `org-shade s1–s3` become one fill). A
   cel edge, not a ramp.
3. *Highlight*: one small, soft-cornered shape in the light tone (`--og-light`) along the upper-left
   contour, built the same way with a (+5, +7) offset and a short clip, about a fifth of the contour.
4. *Ink outline*: 1.6 units in the organ's line tone (`--og-<tissue>-3`), opacity .9, round joins. The same
   weight on every organ; vessels keep their own casing.
5. *Surface lines*: two or three ink lines per organ at 0.9 units, opacity .55: the falciform ligament
   and the gallbladder, the gastric folds, the splenic notches, the renal hilum, the haustra. Nothing
   else inside the organ in health.

Drop `org-form` (the radial volume gradient), `org-rimlight` and `org-ao` for organs; keep a soft
*contact shadow* only where the liver overlaps the stomach and colon (one 4-unit dark stroke of the
liver's outline clipped to the organs beneath, opacity .18). That single overlap cue is what makes a flat
plate read in depth without any 3D.

**Palette.** Each tissue gets a distinct hue, with lightness matched so no organ shouts. Light theme:

| Tissue | Base (-1) | Shade (-2) | Line (-3) | Note |
|---|---|---|---|---|
| Liver | #D9A08E | #B9766A | #8E5345 | warm red-brown; cirrhosis shifts it toward #C9A070 (tawny), congestion toward #A86C7A (plum) |
| Stomach, duodenum, esophagus | #F0CFC2 | #D8A797 | #A47464 | pink |
| Small bowel, colon | #F3DFC9 | #DEBE9F | #AE8B6E | peach-beige, lighter than the stomach |
| Spleen | #C9A3C4 | #A07A9C | #70506C | plum-violet |
| Kidney | #D29A8C | #B07466 | #8A5A4C | dull red, darker than liver |
| Pancreas | #EFDDAF | #D5BA7F | #A68D55 | pale yellow, drawn at 60 % opacity |
| Gallbladder | #B9CBA0 | #8EA677 | #627A4C | sage green |
| Heart | #E0A39E | #C07A74 | #91524D | the atrium one step darker than the ventricles |

Dark theme: the same hues, lifted. Base ≈ L 46, shade ≈ L 32, line ≈ L 68 (the line is *lighter* than
the fill in dark mode, as ink on a dark plate), so every organ keeps an edge against the #0E1422 ground.
Today's dark tokens (`tokens.css:236-246`) are the light ones darkened and desaturated, which is why
they merge.

**Opacity.** Organs are not see-through in an atlas. Keep the organs opaque in the plate and keep the
*vessel* layer drawn over them with the existing tier fading (`organ cover`, `veins-gl.js:965-975`), so
a vessel behind an organ shows faded by that organ's tone, as it does now. The only translucent organ
is the pancreas (behind the splenic vein by design).

**What stays flat on purpose.** No gradients across an organ, no inner glow, no drop shadows, no texture
in health. Surface patterns are reserved for disease (nodules, nutmeg) and are themselves flat marks.

---

## 3. Organs, one by one

Target shapes are described in world units for the 1400 × 1000 plate so they can be drawn in a vector
editor on the same artboard (see §6 for the hand-off). Keep each silhouette under ~40 path nodes.

**Liver.** Width ≈ 330 (x 330–660 for the right lobe, left lobe tapering to x ≈ 760 over the stomach's
upper body), height ≈ 190 on the right (y 190–380), 110 on the left. A domed superior surface following
the diaphragm, a sharp oblique inferior margin running from the right flank up to the left, a shallow
notch for the ligamentum teres at x ≈ 620, the gallbladder fundus peeping 10 units below the margin at
x ≈ 560 (sage, 28 × 16, as the one asymmetric accent that tells left from right), and the falciform
line from the notch to the superior border. The caudate lobe is only the small shoulder beside the IVC
at x 600–640, y 300–340 (the CAUDATE overlay already exists for the slides). The hilum is on the
inferior surface at x ≈ 600, y ≈ 360: the portal vein and hepatic artery enter there, not along the
margin as now.

**Heart and cavae.** One silhouette, 200 wide and 150 tall, apex pointing down-left (viewer's) at
about 45°, resting on the diaphragm's saddle at y ≈ 190. The right atrium is a rounded chamber on the
heart's right border (viewer's left) with the SVC entering its top at x ≈ 600, y ≈ 95 and the IVC its
bottom at y ≈ 170, each as a short collar, never a line through it. The atrium gets a slightly darker
fill and a thin line marking the atrioventricular groove; the three darts stay.

**Esophagus.** 22 wide, descends at x ≈ 700 (patient's left of the IVC), bends 25 units leftward (viewer's
right) over its last 60 units and enters the cardia obliquely at y ≈ 255.

**Stomach.** Fundus domed to y ≈ 225 at x 760–840, above the cardia, lying against the spleen; body
160 wide running down and medially to the antrum; pylorus at x ≈ 640, y ≈ 420 just right of the midline
(viewer's left); greater curvature outermost. Four short fold lines in the body only. Overall footprint
about 60 % of today's.

**Duodenum and pancreas.** The C-loop from the pylorus down to y ≈ 520 and back to x ≈ 660 at the
duodenojejunal flexure, around the pancreatic head; the pancreas as a faint tapered band from the head
(x 560, y 480) to the tail at the splenic hilum (x 1000, y 400), drawn at 60 % opacity behind the
splenic vein, with three or four lobulation marks. The SMV passes behind the pancreas neck.

**Small bowel.** Four loops, each a rounded tube 18 wide, filling the frame below the transverse colon
(x 520–920, y 580–820), the last ending at the cecum. Loops overlap the duodenum's lower edge, never the
colon.

**Colon.** Keep the frame. Raise the cecum to y ≈ 780, bring the sigmoid round to a short rectal stub on
the midline at y ≈ 900 (the rectal varices node `C4` ends there). Haustra as now; the colon tube 26 wide.

**Spleen.** Keep the bean, rotate so the long axis runs from upper-posterior (x 1090, y 290) to
lower-anterior (x 1010, y 450); hilum facing the stomach with two notches; splenic vein leaving at
mid-height. Splenomegaly: anchor the scale at the upper pole and scale 1.15× more along the long axis
than across it, so the tip descends toward the umbilicus (`stage.js:3817`, replace the centred scale).

**Left kidney.** Raise to y 480–620, bean with a medial hilum at x ≈ 1000, y ≈ 560 where the renal vein
leaves; drawn at 85 % opacity behind the splenic flexure.

**Diaphragm.** Keep the traced hull (`diaphragmPath`); draw it as one 1.6-unit ink line with a 6-unit
paler band beneath, and let it end at the flanks as now.

**Abdominal wall and umbilicus.** Move the umbilicus to (620, 790). Draw it as a 7-unit ring in the line
tone with a darker lower crescent, visible only when the paraumbilical vein is open (as now). The caput
fan (`FEEDERS.C3`) then radiates from the midline, symmetric.

**Z-order (back to front).** Kidney, IVC and renal vein (back tier) → pancreas → duodenum → colon →
small bowel → spleen → stomach → esophagus → liver → gallbladder → heart. The liver in front of the
stomach is the single biggest fix for the "where is what" reading.

---

## 4. Vessels

The GPU tube renderer stays (analytic edges, filleted joins, casing, contact shadow). The changes are
to routes, calibre along the route, and a few cues.

**V1. Cavae and atrium.** Route `IVC_IS` with a gentle S (x 612 at the renal level, 624 behind the
liver), widen it from 20 to 24 mm over the retrohepatic segment (per-sample radius is already supported
by the `rad` texture, `veins-gl.js:87`), and end it at the atrium's lower pole. Draw `SVC_RA` and `V_UP`
as a separate vessel from the atrium's upper pole. Keep both in the back tier.

**V2. Two trees in the liver, not a ring.** Keep the model's edges and nodes (the `SIN_R/SIN_L` nodes stay
hit targets and label anchors). Draw them differently:
- Portal side: `PVH_R/PVH_L` taper from 9/8 mm to 5 mm and end in a fan of three fading twigs each
  (`fanFeeders`, `len 40, n 3, levels 1, fade [0.2, 1]`), pointing into the lobe.
- Hepatic side: three veins, right (9 mm) from the right lobe's posterior-superior corner, middle (7 mm)
  from the Cantlie line, left (7 mm) from the left lobe, each starting as a fan of two fading twigs and
  converging on the IVC at y 215, 230 and 245 respectively. Drop the drawn `SIN_RR/SIN_LL` strands; in
  their place draw a soft parenchymal wash (the existing glow path, `veins-gl.js:305-313`, pressure
  colour at .15 alpha, reach 30) between the portal twigs and the hepatic twigs so blood visibly sinks
  into tissue and gathers again. The sinusoid pressure label anchors on the wash's centre.
- The ring disappears visually, the hit paths and topology do not change, and the lobule zoom still dives
  into the `SIN_R` point.

**V3. Taper and swell.** Give every named vein a radius profile: 1.0 at its downstream end, 0.7 at its
upstream end, with a 1.15 swell over 20 units at each confluence (`itemRadii`, `stage.js` around 2560).
Tributary tips keep `TIP_FADE`. Varices and collaterals are exempt (their calibre is the model's).

**V4. Junctions in the direction of flow.** Re-route `SMV_CONF` to meet the splenic vein at ≈ 40°,
`V_IMV` to enter the splenic vein from below at ≈ 45°, `LGV_CONF` as a single curve along the lesser
curvature into the portal vein's left side without the loop, `V_SPL` leaving the hilum at mid-height
and running behind the pancreas with one gentle wave.

**V5. Hepatic artery.** When shown, run it from the celiac region (x 640, y 430) into the hilum beside
the portal vein, 5 mm, in `--artery` with a thinner casing, and branch once inside the liver. Its
presence makes the hilum read as a hilum.

**V6. Collateral styling.** Keep the braids (varices, cavernoma, caput, rectal). Two cues to add, both
on the GPU pass: a thinner casing on varices as they distend (`wall = w0·sqrt(r0/r)`), and beading along
the esophageal column (per-sample radius modulated `1 + 0.35·grade·sin`, wavelength ≈ 22) so grade
reads on the figure as it does in the endoscopy.

**V7. Tube look.** Keep the flat lumen. Two small changes: a broad lateral gradient at 8 % on vessels
wider than 4 px so the IVC and portal vein read as cylinders at projector distance, and a dark-theme
casing that is lighter than the lumen (as the organ lines will be), which the tokens already have.

---

## 5. Disease states (the part that must look "much better")

All states are the same five-layer construction with the silhouette, the hue and the surface pattern
driven by the model; everything blends continuously as `morphLiver` does today.

**Cirrhosis (`c` 0–1).**
- Shape: whole-organ scale `1 − 0.09·c` about the hilum; right-lobe atrophy term in `liverField` from
  0.15 to 0.24; left-lobe and caudate hypertrophy terms doubled so the organ visibly shifts mass to the
  left. The inferior margin scallops: contour amplitude 6 units at full cirrhosis with wavelengths
  14–40 (`sampleLiver` nodule lengths), cusps at the notches, and the margin blunts (round the sharp edge
  by 4 units).
- Surface: two nodule populations, macronodules (radius 10–18) and micronodules (4–7), mixed by
  severity (`nodularSites` in `liver-geo.js` already gives sites; weight them), each a flat cell in the
  tawny tone (`--lv-nod`) with one darker crescent on its lower-right (the same cel rule as the organs)
  so nodules bulge without a gradient; septa as 1-unit pale lines at .35, not a honeycomb mesh (drop the
  current septum fill to a stroke). Nodules cover the whole surface at c ≥ 0.6 and only the periphery
  below that.
- Colour: the base tone eases toward tawny (#C9A070) by `0.6·c`; the ink line follows.
- Gloss: keep 40 % of the capsule highlight.
- Around it: spleen as in §3 (long-axis growth toward the umbilicus); ascites redrawn as fluid *around*
  organs (depth shading, a bright meniscus at each organ edge, the small-bowel loops lifted 6 units,
  flank bulge as now); umbilicus on the midline with the caput fan symmetric; the recanalised
  paraumbilical vein leaving the left portal vein along the falciform line.

**Congestion (`g` 0–1: right heart failure, constrictive pericarditis, Budd–Chiari, IVC web).**
- Shape: scale `1 + 0.08·g`, the inferior margin rounds (blunt by 8 units) and the organ sags below the
  costal margin, which the plate shows as the liver's lower edge dropping 20 units.
- Colour: base tone eases toward plum (#A86C7A) by `0.7·g`; this hue shift is the main cue, as in a
  pathology photo, and reads at any size.
- Surface: nutmeg as a sparse, regular mottle, not dots: 40–60 soft-edged rings (outer radius 9, inner
  5, the ring in the shade tone at .25, the centre lighter) on a jittered lattice, visible from g ≥ 0.3,
  linking into a lace at g ≥ 0.7 (`links` already computed in `sampleLiver`). Drawn flat.
- Vessels: hepatic veins and the retrohepatic IVC widen (`d` scaled `1 + 0.3·g`, the model already
  tracks their distension in the slow state) and lose their taper; in Budd–Chiari the occluded hepatic
  veins are drawn as thin grey cords with a clot mark at the ostium (the `mark` machinery exists for
  slides) while the caudate veins enlarge (as now).
- Heart: in right heart failure the atrium scales `1 + 0.25·tr` about its centre and the IVC collar
  widens; the jugular is off-plate, so this is the only cardiac cue.
- Spleen: congestive splenomegaly as in cirrhosis, from the model's spleen length.

**Pre-hepatic (portal vein thrombosis, splenic vein thrombosis).** The liver stays healthy; the clot
is drawn as now (cavernoma braid), the spleen enlarges; add a faint grey "thrombus" fill inside the
occluded segment so the vessel does not simply look empty.

**Presinusoidal (schistosomiasis, NCPH).** Normal size, smooth margin; a fine periportal pattern: 20–30
short pale lines radiating from the portal twigs (clipped to the liver), opacity .3, so the "fibrosis
around the portal tracts" idea is visible on the plate as well as in the lobule.

**Pancreatitis (sinistral hypertension).** The pancreas band darkens and thickens around the splenic
vein; the clot sits in the vein where it lies against the pancreas.

**Every state in the Congestion and Flow lenses.** The lens desaturation (`app.css:563`, `saturate(.12)
opacity(.72)`) turns the organs into grey cardboard. With opaque, flat organs the plate can instead drop
to 70 % saturation and 85 % opacity, keeping the organs legible while the vessels carry the data.

---

## 6. Performance rules the redesign must keep

- One raster per state key (`plateStateKey`, `stage.js:3016`): the new layers add to the SVG once; the
  cel construction (one shade fill, one highlight fill, one line) replaces three strokes, a gradient
  fill and a rim stroke per organ, so the plate SVG gets smaller (the comment at `stage.js:3838` notes
  ~712 KB per raster today).
- No SVG filters anywhere on the plate; the contact shadow is a clipped stroke.
- Nodules, nutmeg rings and periportal lines are generated from precomputed sites (`liver-geo.js`), as
  quadratic paths, capped at ~300 cells and ~60 rings; quantised severity (`q = 40` steps outside a
  time-lapse) stays.
- Per-frame cost unchanged: tapered radii and beads are per-sample texels the shader already reads; the
  parenchymal wash reuses the glow path with reach 30 (today's congestion glow is 40).
- Plate re-rasters only on the existing keys plus a new `heart` scale key; the heartbeat (if added later)
  pulses the glow layer, never the plate.
- Verify with the existing checks: `npm run smoke:rows`, `tests/e2e/idle-steady.mjs` (restyle budget),
  `npm run perf -- --budget`, and the plate's own timing (`pps.perf()` surfaces `stage`).

---

## 7. Implementation plan

The drawing is done in a vector editor, the wiring by an agent. That split is faster and gives atlas
quality the code cannot reach by nudging numbers.

**Step 0: reference sheet and harness (1 day).**
- Export the current plate as SVG at 1400 × 1000 (the plate markup, `plateMarkup`) with the vessel
  centrelines (`EDGE_PATH`) on a locked layer and the node positions as dots. This is the artboard.
- Add `scripts/plate-preview.mjs`: renders the organ plate alone (no app) for a list of states
  (healthy, cirrhosis 0.4/0.85, congestion 0.5/1, Budd–Chiari, ascites 3 L, splenomegaly 18 cm) in both
  themes at 2× to the scratchpad, in seconds, so every change can be looked at without a deploy.
- Pin the palette of §2 in `tokens.css` as new tokens beside the old ones (`--og2-*`) so both can be
  compared in the preview.

**Step 1: cel construction and palette (1–2 days, code only, silhouettes unchanged).**
- Replace `org-form`, `org-shade s1–s3`, `org-rimlight`, `org-ao` with shade fill, highlight fill, line,
  contact shadow (`stage.js:548-603`, `app.css:2594-2623`); switch tokens; retune dark mode.
- This alone fixes the dark theme and the paper-cut-out look, and is a safe first preview for the owner.

**Step 2: silhouettes (2–3 days drawing, 1 day wiring).**
- Draw the organs of §3 on the artboard, in the z-order given, with the vessel centrelines visible so
  the hilum, the splenic hilum, the renal hilum and the cardia land where the routes end.
- Wire: `ORGANS` (new `d`), `ORGAN_DETAIL` (new lines), `ORGAN_LABELS` positions, `SITES.umbilicus`
  (620, 790), `SPLEEN_CENTER` → spleen upper pole, `LIVER_INNER`/`liverField` centres, the diaphragm
  cut list, the organ covers (`getOrganCovers`), `liver-geo.js` regenerated (its key is the liver path's
  hash). Re-run the label clearance check (`clearanceReport`) and the phone-fit sweep.
- Tests: liver bounding box within [330, 760] × [190, 390]; umbilicus on the midline; every organ label
  inside its organ; the diaphragm hull above every organ.

**Step 3: vessels (2–3 days).**
- V1 cavae and atrium (routes in `EDGE_PATH`, atrium node positions `IVCS`, `RA`, `SVC`).
- V2 the two trees: new fans in `FEEDERS`, strands removed from `STRANDS`, the parenchymal wash in
  `syncVeins`; label anchors for `SIN_R/SIN_L` on the wash.
- V3 taper profiles, V4 junction re-routes, V5 artery route; V6/V7 on the GPU pass.
- Tests: `smoke:rows`; a hepatofugal preset smoke (the arrows reverse on the new routes); the circuit
  morph still lands (the morph uses `EDGE_PATH` endpoints, so moved nodes need their circuit positions in
  `NODE_POS[..][1]` unchanged).

**Step 4: disease states (3–4 days).**
- Cirrhosis shape and surface (`morphLiver`, `liverField`, `sampleLiver`, `cellPath`), tawny shift,
  spleen anchoring, ascites around organs, midline caput.
- Congestion shape, plum shift, nutmeg rings, widened hepatic veins and IVC, atrium scale, Budd–Chiari
  cords and clot marks.
- Presinusoidal periportal lines; pre-hepatic thrombus fill; pancreatitis band.
- Lens dimming retuned.
- Tests: liver area decreases monotonically with cirrhosis and increases with congestion; nodule and
  ring counts within caps; plate raster time under 60 ms on the desktop profile; visual references
  redrawn via `visual-refs.yml` once the owner approves each state.

**Step 5: dark theme and projector pass (1 day).** Every state in dark on the preview harness; organ
edges ≥ 1.5:1 against the ground; vessel casing lighter than lumen; a lecture-hall check at 1024 × 768.

**Owner checkpoints.** After Step 1 (palette and shading, nothing moved), after Step 2 (new plate,
healthy only), after Step 3 (vessels), then per disease state. Each is one preview push to the
integration branch; the deck sweep and the phone-fit check run on each.

---

## 8. Decisions for the owner

1. **Pancreas and gallbladder**: both were drawn once and removed. This plan draws them faint (pancreas
   at 60 %, gallbladder as a 28-unit accent). Say if either should stay out.
2. **Liver in front of the stomach**: the atlas layering hides the top of the left gastric vein under
   the liver's left lobe. The vein still shows faded through the organ cover; confirm that is acceptable
   for the varices slides, or the lobe can be drawn thinner so the vein stays clear.
3. **Right kidney**: stays off the plate (as decided in October). It would balance the figure but is
   not part of the portal story.
4. **Opaque organs**: the current see-through organs let labels sit over tissue. Opaque flat fills with
   halo'd labels read better on a projector; the label halo already exists. Confirm.
5. **Hue shift as the main disease cue** (tawny for cirrhosis, plum for congestion) alongside shape:
   it is the convention in pathology atlases and reads from the back of the room; it does not conflict
   with the pressure lens because the lens colours vessels, not organs.
