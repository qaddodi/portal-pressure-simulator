# Portal Pressure Simulator: UI/UX plan for a product schools can buy

*Status: proposal · Companion to [`DESIGN_BLUEPRINT.md`](DESIGN_BLUEPRINT.md) · Based on a full walkthrough
of the current build (desktop 1440 and 1280, tablet 1024, phone 390; light and dark; every mode, tray,
panel tab, color lens and instrument).*

---

## 0. The short version

The model is strong. Its physiology, lessons, cases, Why? traces, export and responsive layout are
already beyond what most commercial teaching simulators offer. What holds it back is the interface.
**Every capability has been given its own place to live, and most of them have two or three.** A
first-time student sees about 50 clickable targets before they have done anything. Changing one thing
can mean choosing between a tool tray, a panel tab, a vessel inspector and an instrument, and each of
those works a little differently.

The plan rests on four ideas:

1. **Act on the anatomy, not on menus (object → verb).** Click a structure and a small action card
   appears beside it with only the verbs that apply to it. This one surface replaces the 13-tool
   toolbar, the Pathology tab and most of the vessel inspector.
2. **One timeline for time, changes, events and comparison.** Play/pause, Seconds/Months, speed,
   undo/redo, the Findings list, the Log instrument and Compare mode all become one strip under the
   figure. Every change and every event is a marker on it, and any moment can be pinned as "A".
3. **Four surfaces instead of eleven.** Figure, Action card, Timeline, Patient chart. Modes turn into
   a Home screen plus a slim lesson or case banner. Instruments open one level deep, not three.
4. **Art-directed graphics.** Commission hand-authored anatomical art (the blueprint's own §16.1
   recommendation). Keep hue for data only. Render vessels, varices, ascites and flow with real
   material and motion, and add a continuous zoom from the whole abdomen down to the liver lobule.

The rest of this document gives the evidence (§1), the rules (§2), the new interaction model (§3),
the graphics program (§4), teaching features (§5), what schools will expect before they buy (§6),
quick fixes that can ship now (§7), and a phased roadmap with how to measure success (§8).

---

## 1. Audit: what we saw

### 1.1 Too much on screen at once

At rest on desktop (Healthy, Explore), these are all visible and clickable together:

| Zone | Controls | Count |
|---|---|---|
| Top bar | 4 mode tabs, Patient picker, Undo, Redo, Reset, Share, Theme, Help, Controls toggle | 12 |
| Figure header | Anatomy/Circuit (2), Color menu, legend (clickable), Figure | 5 |
| Figure footer | Play, Seconds/Months (2), time menu, Select, Disease, Treat, Measure, zoom −/fit/+ | 11 |
| Readout strip | 4 tiles (each opens Why?), All readouts | 5 |
| Instrument drawer | Instruments, 4 group tabs, 4 instrument tabs, collapse | 10 |
| Side panel | 4 tabs, 4 accordion sections, 4 sliders with an info icon each | ~16 |
| **Total** | | **≈ 59** |

There are also **three levels of tabs stacked on top of each other**: mode tabs (Explore/Learn/Cases/
Compare) → panel tabs (Pathology/Therapy/Physiology/Findings) → instrument groups (Hemodynamics/
Bedside/Microanatomy/Log) → instrument tabs (Pressure profile/Scope/Flow/Liver perfusion). That is
four rows of segmented controls, all styled almost the same, all on screen together.

**The figure is the product, but it gets the smallest share of the screen.** At 1440×900 with the
drawer open (which several tools do automatically), the anatomy takes up about 480×380 px, roughly
15 % of the window. The side panel, drawer and readout strip take the rest.

### 1.2 The same thing lives in several places

| What the learner wants | Where it can be done today |
|---|---|
| Make the liver fibrotic | Fibrosis brush (Disease tray) · Cirrhosis slider (Pathology) · three zonal sliders (Pathology) · "+ Portal tract / Sinusoids / Central vein" buttons (Lobule instrument) · scenario presets |
| Clot a vessel | Thrombus tool · Pathology sliders (6 named vessels) · vessel inspector "Thrombus" slider |
| Narrow a vessel | Pinch tool · vessel inspector "Stenosis" slider · `+`/`−` keys on a focused vessel · IVC slider in Pathology |
| Place a TIPS | Stent tool (drag between two vessels) · Therapy › Procedures › TIPS toggle + diameter slider · case action button "TIPS 8 mm" |
| Band varices | Band tool · Therapy › "Band varices" button · case action "Endoscopy + band ligation" |
| Doppler | Doppler tool · vessel inspector "Doppler here" · Instruments › Bedside › Doppler |
| See what happened | Findings panel tab · Log instrument · toasts · bleed pill · banner in the figure header |
| Compare two states | Compare mode (Capture A → change → switch A/B/Δ) · "Change" color lens · ▲/▼ deltas on every label · the healthy dashed line in the profile chart |
| Change time | Play · Seconds/Months · ⏩ menu (speed, fast-forward, settle) · `[` `]` `.` `Z` keys |

Each path looks and behaves a little differently (a drag, a toggle, a slider, a button), so learners
can't build one mental model. Every path is also UI we have to maintain, test, localize and explain.

### 1.3 Moded tools make people guess

- A tool stays active after it's used. The learner has to remember to press Esc or click Select, and
  the next click on the figure does something unexpected.
- 13 tools in 3 trays. The names are good, but you can't tell which vessels a tool works on until
  you try. For example, Band only works on varices and the catheter only works in a hepatic vein.
- A click on empty space picks the nearest hit target. In testing it selected *Left renal venules*,
  a background vessel most learners have never heard of, and drew a blue label box over the
  anatomy.

### 1.4 Modes cause surprises

- **State carries over between modes.** Opening the *Night shift* case loads decompensated cirrhosis
  with an active variceal bleed. Clicking Explore afterwards leaves the bleed running in the sandbox
  ("Variceal bleed · 195 mL/min") with no prompt.
- Learn, Cases and Compare each replace the side panel with a different layout, and the panel toggle
  label changes too (Controls/Lesson/Case/Compare).
- Compare is a whole mode for what is really one action: "remember this moment".

### 1.5 Hierarchy and feedback

- Too many things look the same: segmented controls, chip buttons, tabs and pills share one visual
  weight, so nothing reads as the primary action.
- Some important controls look disabled: *All readouts* is light grey, and so is the case *Exit*
  link.
- Figure view is excellent, but hard to find (a small "Figure" chip, or `F`).
- There's no persistent "what changed" story. Active changes appear as chips at the top of the
  panel, while events go to a different tab.

### 1.6 Graphics

What works: a calm atlas palette, a clean label layout, tube casing and lumen, flow chevrons, and a
very good figure export.

What keeps it from looking premium:

- **The organs read as clip art.** Procedural silhouettes with a uniform pink/beige fill: a
  rounded-rectangle liver, a blob heart with a dashed "TO RV" arrow, and small bowel drawn as a
  uniform serpentine tube.
- **Organ hue competes with the data.** The pink liver and heart sit right next to the magenta end of
  the pressure scale. In decompensated cirrhosis the liver fill goes rose-red and blends into the
  high-pressure vessels.
- **Collaterals and varices look schematic.** Varices are a small cluster of dots and wiggles. The
  paraumbilical and epigastric route is one long dotted loop around the whole abdomen that reads as a
  body outline. Caput medusae is a thin purple star.
- **Ascites is a flat blue band** along the bottom edge.
- **The circuit view gets tangled in disease.** Collateral lanes cross, labels sit on top of lines
  ("SMV 24.2 ▲15" on the retroperitoneal lane), and dashed and solid lanes look too much alike.
- **Charts show their seams.** In the pressure profile the aorta bar is clipped at 30 mmHg with an
  "off the scale" footnote, and axis labels are rotated.
- **Nothing stands out when you select something.** Selecting a vessel dims the network, but there's
  no halo, callout or motion to confirm the selection.

### 1.7 Responsive

- **Tablet (1024 × 768).** The ⏩ time button slides under the **Select** tool button (they overlap).
- **Phone.** The layout is sensible (figure, then sheet, then three bottom tabs), but the Tools tray
  is a 13-item list that covers the whole screen, and every label is a floating card on top of the
  anatomy.

---

## 2. Design principles for v2

These rules decide conflicts. If a feature breaks one, redesign the feature.

1. **The figure owns the screen.** At least 60 % of the viewport on desktop and 55 % on phone, in
   every mode. Everything else floats, docks or collapses around it.
2. **One way to do each thing (plus a shortcut).** Each capability has one primary place, and it's on
   the anatomy wherever possible. Keyboard and command palette are accelerators to that same action,
   never a second UI.
3. **Object → verb.** Pick the structure first, then the verb. Never make the learner pick a tool and
   then hunt for a valid target.
4. **No modes to escape from.** Actions are one-shot. The only drag gesture that stays (connecting a
   shunt) ends itself when released.
5. **Show the consequence, then the cause.** After every change the figure briefly shows what moved
   (Δ halos), the timeline records it, and Why? is one click away.
6. **Hue means data.** Anatomy stays neutral, and color is only used for values.
7. **Progressive disclosure by role.** Student, Instructor and Researcher see the same model at three
   levels of control depth. Physiology knobs (arteriolar tone, buffer gain, breath depth,
   deterministic rupture) move to the Instructor/Advanced level.
8. **Calm by default, expressive on demand.** Motion only explains. Nothing blinks unless it's
   bleeding.

---

## 3. The new interaction model

### 3.1 Layout: four surfaces

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Portal Pressure   Patient: Decompensated cirrhosis ▾   [Lesson 3 · Step 2 of 6 ▸]  ⌘K  ⇪  ☰ │ ← Top bar (slim)
├──────────────────────────────────────────────────────────────────────┬───────────────┤
│  Anatomy | Circuit     Lens: Pressure ▾      ░░░░ legend ░░░░          │ PATIENT CHART │
│                                                                      │ ───────────── │
│                    ┌────────────────────┐                            │ HVPG   17.3 ▲ │
│      (figure)      │ PORTAL VEIN  23.6  │  ← Action card (§3.2)     │ PV     23.6 ▲ │
│                    │ ▲16 vs healthy     │                            │ Flow   0.82   │
│                    │ Narrow · Clot ·    │                            │ Varix  68 %   │
│                    │ Doppler · Shunt ⤳  │                            │ + 4 abnormal  │
│                    │ Why? · Details ›   │                            │ ───────────── │
│                    └────────────────────┘                            │ TREAT         │
│                                                                      │ Drugs · Fluids│
│                                                                      │ Procedures    │
│                                                                      │ ───────────── │
│                                                                      │ STORY (auto)  │
├──────────────────────────────────────────────────────────────────────┴───────────────┤
│ ▶  1×   ●────◆──────●──────────▲───────────────●  Day 142   [+1 wk] [+1 mo] [+6 mo]  📌 A │ ← Timeline (§3.3)
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Surface | Replaces | Purpose |
|---|---|---|
| **Figure** | Figure, stage bars, tool toolbar, zoom bar | The model. Lens and view live in one compact header; zoom is pinch/scroll plus a small fit button |
| **Action card** | Tool trays, tool hint card, vessel inspector, Pathology tab, `+`/`−` keys | Verbs on the selected structure (§3.2) |
| **Timeline** | Transport, Seconds/Months, time menu, Undo/Redo/Reset, Findings tab, Log, Compare mode | Time, history, events, comparison (§3.3) |
| **Patient chart** | Readout strip, All readouts, Therapy tab, Active changes chips, Lesson/Case/Compare panels | What a clinician would see and order (§3.4) |

Instruments (§3.5) open as one floating or docked panel on request, one level deep.

### 3.2 The Action card (object → verb)

Clicking or tapping any structure opens a small card anchored beside it. It's placed by the label
layout engine so it never covers the selected structure. The card shows:

- **Identity and value:** the name, the current value in the active lens, the change from healthy,
  and a direction pill (physiological, reversed or stagnant).
- **3–5 verbs that fit this structure**, using the same icons as today:

| Structure | Verbs |
|---|---|
| Portal / splenic / SMV / hepatic veins, IVC | **Narrow** (inline slider on the card, drag to set %), **Clot** (slider), **Doppler**, **Start a shunt from here** |
| Liver (click on the parenchyma) | **Cirrhosis** (one slider), **Where is the block?** (a zone switch: portal tract / sinusoid / central vein), **Zoom into lobule** |
| Varices (esophageal/fundal) | **Band**, **Endoscope**, **Balloon**, **Occlude (BRTO)** for fundal with a GRS |
| Hepatic vein | **Wedge catheter → HVPG** (runs the flagship procedure, §8.3 of the blueprint) |
| Collateral / shunt | **Occlude**, **Remove** (for placed shunts), **Diameter** |
| Heart | **Contractility**, **Tricuspid regurgitation**, **Constriction** |
| Abdomen / ascites | **Paracentesis (litres)**, **Albumin** |

- **Footer:** `Why?` · `Details ›` (opens the current inspector content: live values, resistance,
  healthy comparison, "About this vessel").

Rules:

- **Every verb takes effect immediately and is added to the timeline**, so there's no "tool is still
  armed" state. Sliders on the card are live, and releasing one commits a single history entry.
- **Shunts are the one drag gesture.** Choose *Start a shunt from here*, then a rubber band follows
  the pointer and valid targets glow. Release on a target to create it, anywhere else to cancel. The
  card then offers the right named procedure (TIPS / Warren / portocaval / mesocaval) and a diameter.
- **Brushing stays available for power users** as the Fibrosis brush and "paint clot". It lives in a
  small *Draw* menu in the figure header and in the command palette, not in the main toolbar.
- **Hover (desktop)** shows a lightweight value tooltip. This replaces the Measure (hover) tool, so
  hovering always measures.
- **Hit priority:** portal tree > hepatic outflow > collaterals > context/background vessels. A click
  on empty space deselects. It never picks the nearest background vein.
- **Keyboard:** Tab walks structures along the flow (as today). Enter opens the card, and the number
  keys trigger its verbs.

**Result:** the toolbar goes from 4 buttons + 13 tray items to nothing permanent. The Pathology tab
and vessel inspector sliders go away as separate surfaces.

### 3.3 The Timeline

One strip under the figure unifies time, history, events and comparison.

```
 ▶ 1×  |●──────●────◆────────▲──────────●───────────|  Day 142 · 14:32:05     [+1 wk][+1 mo][+6 mo]   📌 Pin as A
        ↑       ↑    ↑        ↑          ↑
     Healthy  Cirr. TIPS   Varix bled  Now
     (start)  85 %  10 mm  (event)
```

- **Two clocks, one scale.** The strip shows simulated time. Seconds run at the left of each change
  (acute hemodynamics), and the *+1 wk / +1 mo / +6 mo* buttons jump the disease clock forward with a
  short animated fast-forward. This replaces the Seconds/Months switch, speed menu and "Settle". The
  model always settles before a jump, and "settle" is implicit after every change.
- **Changes are markers (◆).** Hovering a marker shows what changed. Clicking it reverts to that
  moment, with a toast offering Redo. This replaces Undo/Redo/Reset in the top bar (the keyboard
  shortcuts still work).
- **Events are markers (▲):** collateral opened, flow reversed, varix ruptured, ascites formed. This
  replaces the Findings tab and the Log instrument. The newest event pulses once and then stays as a
  marker. Clicking it opens its detail with Why?.
- **Compare is a pin.** *📌 Pin as A* freezes the current moment. From then on the figure header gets
  an **A | Now | A→Now** switch, and readouts show "vs A". Unpinning ends it. Compare mode goes away.
- **Bleeding** shows as a steady red band on the timeline, plus the existing status pill in the
  figure header.

### 3.4 The Patient chart (right panel)

It's one panel with no tabs. It reads top to bottom like a bedside chart:

1. **Vitals & hemodynamics:** the four key readouts. Abnormal ones join the list automatically, each
   with a one-word status and a sparkline over the timeline. Clicking a readout highlights where it's
   measured on the figure and offers Why?. *All readouts* becomes a quiet "Show all (12)" link that
   is clearly a link.
2. **Treat:** clinician-level actions, grouped the way a ward order set is:
   - *Drugs:* propranolol, carvedilol, terlipressin, octreotide, ceftriaxone, diuretics
   - *Fluids & blood:* crystalloid, PRBC, albumin
   - *Procedures:* band ligation, balloon tamponade, BRTO, TIPS, surgical shunts, paracentesis

   Procedures that have a place on the anatomy run through the Action card flow, pointing at the
   structure ("Choose where to place the TIPS"), so the panel and the figure never disagree.
3. **Story:** an auto-written, plain-language summary of the timeline, for example *"Cirrhosis set to
   85 %. After 6 months collaterals opened (left gastric, paraumbilical). Portal flow fell 18 %. A
   10 mm TIPS lowered the PPG from 18 to 8 mmHg."* It can be copied, printed and included in figure
   exports. It replaces the Active changes chip row. Each sentence has an ✕ to undo that change.
4. **Advanced** (collapsed; Instructor/Researcher only): splanchnic and systemic arteriolar tone,
   hepatic arterial buffer, arterioportal shunting, pulsatile, respiration, deterministic rupture,
   anatomical variants (GRS/SRS present).

In a lesson or case, the chart shows a **step card** at the top (§5) and locks what the step doesn't
allow. It keeps the same layout and doesn't swap to a different panel.

### 3.5 Instruments: one level

- The drawer becomes an **Instruments** button in the figure header. It opens a grid of cards with
  live thumbnails (Pressure profile, Flow Sankey, Trends, Liver perfusion, HVPG trace, Doppler,
  Endoscopy, Lobule, Varix wall, Abdomen). The group tabs go away.
- An open instrument docks at the bottom (desktop) or opens as a sheet (phone). You can pop it out
  as a floating, resizable panel, and on large or projector screens pin two side by side.
- Instruments still open automatically when an action needs one (wedge → HVPG trace, Doppler →
  spectrum), but the figure shrinks at most 25 % to make room. The instrument is never bigger than
  the figure.

### 3.6 Top bar and modes

- **Top bar:** brand · **Patient ▾** · (lesson/case banner, only when in one) · **⌘K** command palette ·
  **Share/Export ▾** (link, SVG, PNG, print, projector) · **☰** (theme, units, help, role level,
  language).
- **Home screen instead of mode tabs.** The first-run welcome grows into a real Home (also reachable
  from the brand mark), with four large entries: *Explore a patient*, *Lessons* (with progress),
  *Cases* (with best scores), *Presenter* (instructor scripts, §5.4). Starting a lesson or case puts
  a slim banner in the top bar with progress and **Exit**.
- **Clean boundaries.** Leaving a case or lesson always asks: *"Keep this patient in Explore, or
  return to where you were?"* A running bleed never carries over silently.

### 3.7 Command palette (⌘K / Ctrl-K)

This is the power-user accelerator. It uses the same verbs and the same history entries as the UI.
Examples: *"TIPS 10"*, *"cirrhosis 60"*, *"propranolol"*, *"+6 months"*, *"lens flow"*, *"lesson
Laplace"*, *"export PNG"*. It gives instructors fast control without adding any on-screen UI.

### 3.8 Keyboard cleanup

- **F is used twice.** It's Figure view in the guide and the Fibrosis brush in the tool list, and
  which one you get depends on the current tool. Keep `F` = Figure and move the brush to the palette
  / *Draw* menu.
- Drop single-letter shortcuts for the 13 tools once the Action card exists. Keep Space, `[ ]`,
  `A` (view), `L` (lens cycle), `P` (pin A), `F` (figure), `?`, `⌘K`, and Esc.
- Show shortcuts inside tooltips and the palette, not only in a separate 30-row guide.

### 3.9 Before and after: clicks for key tasks

| Task | Today | Target |
|---|---|---|
| Put in a 10 mm TIPS | Treat ▸ Stent · shunt ▸ drag PV → HV ▸ (panel) diameter ▸ Esc = **5** | Click portal vein ▸ *Shunt* ▸ drag to hepatic vein (card suggests TIPS, 10 mm default) = **3** |
| Measure HVPG | Measure ▸ Hepatic vein catheter ▸ click hepatic vein ▸ wedge in drawer ▸ read ▸ Esc = **5–6** | Click hepatic vein ▸ *Wedge → HVPG* (runs free/wedged automatically, trace opens) = **2** |
| Before/after comparison | Compare tab ▸ Capture A ▸ change ▸ switch A/B/Δ ▸ read table = **5+**, plus a mode switch | 📌 Pin ▸ change ▸ A→Now = **3**, no mode switch |
| Six months of cirrhosis | Pathology slider ▸ Months ▸ Play ▸ wait ▸ Pause = **4** + waiting | Click liver ▸ Cirrhosis slider ▸ *+6 mo* = **3**, no waiting |
| Why is PV pressure high? | Click readout ▸ Why? pop = **1–2** | Same, plus the source glows on the figure |
| Band varices | Treat ▸ Band ▸ click varix ▸ Esc = **4** | Click varix ▸ *Band* = **2** |

---

## 4. Graphics program

### 4.1 Art direction

**Target look:** a modern textbook plate. It should be as clear as Netter, flatter and calmer, and
fully vector. Anatomy is the stage and data is the actor.

- **Commission hand-authored anatomical art** from a medical illustrator. This is the blueprint's
  own recommendation in §16.1, and the topology is now stable enough to do it. Deliverables:
  layered SVG per organ (base, form shading, texture, outline, cast shadow), matched to the existing
  1400 × 1000 world coordinates and `NODE_POS`, in two variants (atlas light, monitor dark), with
  morph targets for splenomegaly, liver shrinkage/nodularity and ascites distension.
- **Organs to (re)draw:** liver with its segmental surface and falciform ligament, gallbladder,
  stomach with correct lesser/greater curvature and fundus, spleen, pancreas (head, neck, body, tail)
  wrapped by the duodenal C-loop, both kidneys, small bowel on a mesentery fan, colon with haustra
  and flexures, esophagus through the diaphragm, a proper right heart (RA/RV with tricuspid), the
  aorta as a quiet context silhouette, and the abdominal wall/umbilicus for caput medusae.
- **Palette:** organs move to **neutral warm greys with only a trace of tissue tint** (≤ 12 %
  chroma), so no organ competes with the pressure scale. The liver's "congested" state is shown
  with texture and a subtle vignette, not a red fill.
- **Lighting:** one light from the upper left, the same across organs, tubes and icons. Soft ambient
  occlusion where organs overlap.
- **Line weights:** three tiers. Organ outline 1.25 px, vessel casing scaled by caliber, and hairline
  leaders at 0.75 px, all constant in screen space at any zoom.

### 4.2 Vessels and flow

- **Vessel tubes:** keep the "streets map" junction merging. Add a proper specular highlight that
  follows the tube curve, and a darker far wall so each vessel reads as a cylinder. Caliber changes
  (collaterals swelling, splenic vein enlarging) animate over 400 ms, driven by the model.
- **Flow:** keep the chevron language, which is excellent and model-true. Render it on a single
  WebGL/Canvas layer (PixiJS or raw WebGL2) so hundreds of vessels stay at 60 fps on a school
  Chromebook. Add a soft motion trail at high velocity, and a turbulence shimmer where a stenosis
  jet exits.
- **Reversal:** a brief "flow reversing" ripple that travels along the vessel, then chevrons
  pointing the other way. Keep the existing rule: no badges, direction is the cue.
- **Thrombus:** draw a visible clot inside the lumen: a dark red-brown mass with a laminated edge,
  its length and occlusion proportional to the model. Show recanalization as the clot shrinking and
  channelling.
- **Stenosis:** a real waist in the casing with an upstream bulge in pressure color, and chevrons
  bunching and then jetting through it (velocity ∝ 1/area, as the model already provides).
- **TIPS/stents:** metallic mesh with a subtle sheen and radiopaque markers, placed along a curved
  path through the parenchyma (portal → hepatic vein), not a straight rail.

### 4.3 The hidden network

- **Varices** are the emotional center of the disease, so draw them that way. Esophageal varices are
  tortuous, beaded columns along the distal esophagus, growing in length, number and diameter with
  grade (F1 → F3). Red wale signs appear as small red streaks on the surface. Fundal varices form a
  grape-like cluster at the fundus. Rupture gets a local blood plume (brief, calm, no flashing) and
  then a steady ooze while bleeding continues.
- **Collaterals** grow in (as they do today) as tortuous vessels with anatomical paths: coronary →
  esophageal plexus, short gastrics, splenorenal, gastrorenal, retroperitoneal (Retzius), rectal,
  and paraumbilical down the falciform ligament to the umbilicus. **Remove the full-body dotted loop.**
  Only draw a closed potential collateral as a faint ghost when the *Potential collaterals* layer is
  on.
- **Caput medusae:** a radiating fan of tortuous, slightly raised veins on a semi-transparent
  abdominal wall layer that fades in only when the paraumbilical route carries meaningful flow.
- **Ascites:** translucent fluid filling the peritoneal cavity from the dependent flanks and pelvis
  upward, with a meniscus line and a slow ripple. Organs float slightly as volume rises and the
  abdominal wall silhouette distends. Paracentesis visibly lowers the level.
- **Splenomegaly and liver change:** the spleen scales smoothly with `spleen.length`. The cirrhotic
  liver gets a nodular surface texture, a blunter edge and slight shrinkage with severity.

### 4.4 Semantic zoom: abdomen to lobule

Build one continuous zoom ("powers of ten") in place of the separate Lobule instrument:

1. **Abdomen:** the current plate.
2. **Liver:** the portal and hepatic venous trees inside a translucent liver, with segment outlines.
3. **Lobule:** the hexagonal lobule with portal triads, sinusoids and central vein. Fibrosis zones
   are painted directly, with flow particles running from triad to central vein, and stellate cell
   and collagen overlays by stage.

This is a signature feature to lead demos with, and it removes a whole instrument and its buttons.

### 4.5 Circuit view redesign

- Route it like a transit map: octilinear (0/45/90°) lines, fixed lane spacing, and no crossings in
  any preset (solve routing once per preset family and cache it).
- Treat labels as station labels: they're placed with collision avoidance against lines, not only
  against other labels.
- Give each collateral lane a clear line style (solid, recruited; ghost, potential), a lane name at
  its start, and flow chevrons as on the anatomy.
- Morph between anatomy and circuit (blueprint §6.5) in 600 ms with every vessel interpolating its
  path, so learners see that it's the same network.
- Keep the collapsed liver module; it's very good.

### 4.6 Charts and instruments

- **One chart style:** axes, grid, tick labels and annotations from shared tokens. No rotated axis
  labels (stagger them or use two rows). Direct labels instead of legends.
- **Pressure profile:** use a broken axis for the aorta (//) instead of clipping. Animate the healthy
  → now transition. Show the site of resistance with the same bracket glyph the figure uses.
- **Doppler, endoscopy and varix wall:** these are the most "real" visuals, so make them
  photographic in feel. Doppler gets a true spectral display (grey-scale envelope on black, with
  velocity scale and baseline). Endoscopy gets a rendered lumen with varices by grade and red wale
  signs.
- **Readout sparklines** line up with the timeline, so time always reads left to right in the same
  place.

### 4.7 Motion language

| Moment | Motion | Duration |
|---|---|---|
| Selection | Halo ring + gentle lift (shadow grows) | 150 ms |
| A change is applied | Δ halos on the 3 structures that changed most, fading | 1.2 s |
| Pressure propagating | The existing travelling band (keep) | model-driven |
| Collateral opening | Draw-on in flow direction (keep) | model-driven |
| Timeline jump (+6 mo) | Fast-forward with day counter, then a settled pulse | ≤ 1.5 s |
| Panel/card open | Fade + 4 px rise | 120 ms |

Everything follows reduced-motion and becomes an instant state change.

### 4.8 Brand and typography

- Refine the brand mark (the Y-shaped portal tree is a good idea). Build a proper lockup, a favicon
  set, a monochrome version, and a name that's easy to license. *"Portal Pressure Simulator"* is
  descriptive; consider a product name with this as the subtitle.
- Typography: keep Inter for UI and JetBrains Mono for numbers. Add a **tabular-figure** setting on
  every live number so values don't jitter. Consider a humanist serif for lesson prose and figure
  titles so it feels like a textbook.
- Icon audit: one grid, one stroke weight, one corner radius. Remove icons that aren't used.

---

## 5. Teaching features

### 5.1 Lesson player

- Lessons today switch the side panel and show a step pill in the figure header. Instead, put a
  **step card on the figure**: a coach mark that points at the structure to act on, with *Predict*
  inputs done **on the figure** (drag an arrow for "which way will the portal vein flow?", or draw on
  the pressure profile as today).
- Show instant feedback that compares the prediction with what happened, with a short animation.
- Give every step a **Replay** that restores its starting state (it's already a timeline entry).
- Save progress on the device, and to the LMS when one is connected (§6.2).

### 5.2 Cases

- Show the patient on a **bedside monitor** (a dark vitals strip styled like a real monitor, with
  trends), an **orders panel** (the Treat section of the chart), and a **case clock**.
- **Hide what the clinician can't know, everywhere.** Today PPG, varix tension and shunt fraction
  stay visible while HVPG and portal pressure are hidden, and PPG plus the IVC value gives the answer
  away. Each case needs one visibility map covering readouts, labels, lenses, instruments and the
  story.
- The opening vitals must match the narrative. *Night shift* says "HR climbing, MAP falling" but
  opens at HR 63, MAP 99. Pre-roll the case until the vitals match the story.
- Make the debrief a one-page printable report: the timeline with decisions, the counterfactual
  ("had you started terlipressin at minute 2…"), scores per objective, and references.

### 5.3 Assessment

- Checkpoint questions (MCQ, prediction, "place the TIPS") with scoring and explanations.
- Randomized case variants (different Hb, delays, anatomy) so students can't share answers.
- An exportable per-student record (CSV, xAPI statements).

### 5.4 Presenter mode (instructors)

- **Scripts:** an ordered list of model states with speaker notes ("Healthy → cirrhosis 60 % →
  +6 mo → TIPS"), stepped with arrow keys or a clicker, like a slide deck that is a live model.
- Large type, hidden chrome, a laser pointer, and optional audience-facing readouts (projector mode
  today, grown into a product feature).
- **Share a script** as a link or file, and build a small library of instructor-made scripts.

---

## 6. What schools will expect before they buy

A polished product also has to pass procurement. Plan for these from the start:

### 6.1 Accessibility (a requirement for many public institutions)

- A WCAG 2.2 AA audit by a third party, plus a published **VPAT/ACR**.
- Figure accessibility: every structure reachable by keyboard (partly done), screen-reader
  descriptions of the current state (generated from the Story), a sonification option for pressure,
  and color-blind-safe lenses checked with simulation.
- Every value shown by color must also be shown another way (the blueprint already requires this;
  audit it in every lens).

### 6.2 Integration

- **LTI 1.3** (Canvas, Moodle, Blackboard, D2L) with Deep Linking to a specific lesson, case or
  script, and grade passback.
- **SCORM 1.2 / xAPI** package for older LMSs.
- SSO (SAML/OIDC) for institution licenses.

### 6.3 Deployment and reliability

- **PWA / offline** (it's already build-free and static): installable, works in exam halls with poor
  Wi-Fi.
- A supported browser/device matrix (Chrome, Edge, Safari, Firefox; iPad; Chromebook) with
  performance budgets tested on a low-end Chromebook.
- **Privacy:** no third-party trackers, FERPA/GDPR statement, data stays in the LMS.
  - Self-host fonts. Today they load from Google Fonts, which some EU institutions will flag.

### 6.4 Content credibility

- A **clinical advisory review** and sign-off per lesson and case, named on an "About the model"
  page with version, validation targets (blueprint §12 tests) and references (Baveno VII, AASLD).
- **Versioned content** so a course built on v2.1 behaves the same all semester.
- Localization-ready strings (no text baked into SVG, as the blueprint requires). Start with
  Spanish, French, Arabic (RTL test), and Portuguese.

### 6.5 Sales surfaces

- A product site with a 60-second video, an interactive demo, a lesson catalogue mapped to
  curriculum objectives (USMLE/MCCQE content outlines, physiology course maps), pricing tiers, and
  instructor guides.
- Instructor guide PDFs and slide-ready figure exports licensed for teaching use.

---

## 7. Fixes to ship now (before the redesign)

These are small and independent. They improve the current build right away.

| # | Fix | Where |
|---|---|---|
| 1 | Resolve the `F` conflict (Figure vs Fibrosis brush): move the brush to another key and update the guide | `src/ui/main.js` `wireKeyboard`, tool list |
| 2 | Tablet 1024 px: the ⏩ time button overlaps the Select tool; let the transport and toolbar wrap or shrink | `styles/app.css` stage-bar bottom |
| 3 | Leaving a case/lesson: ask whether to keep the patient, and never carry an active bleed into Explore silently | `src/ui/cases.js`, `main.js` `onMode` |
| 4 | Case visibility: hide PPG (and anything that implies HVPG/PV pressure) while those are hidden | `src/ui/dock.js` TILES `hideKey`, `cases.js` |
| 5 | Make *All readouts* and the case *Exit* look clickable (not disabled-grey) | `styles/app.css` |
| 6 | Hit priority: a click on empty space deselects; background/context vessels have lower hit priority | `src/ui/stage.js` `edgeFromEvent` |
| 7 | Remove the full-body dotted paraumbilical/epigastric loop unless that route is open | `src/ui/anatomy.js`, `NEEDS_C3` |
| 8 | Pressure profile: broken axis for the aorta instead of clipping; no rotated tick labels | `src/ui/charts.js` |
| 9 | Circuit view in decompensated presets: labels must avoid lines, not only labels | `src/ui/stage.js` `updateLabels` |
| 10 | Tone down organ tint so the pink liver/heart doesn't clash with the magenta end of the pressure scale | `styles/tokens.css`, `anatomy.js` |
| 11 | README: the Findings button described in "Interface" now lives in a panel tab; bring the docs in line | `README.md` |
| 12 | Tabular figures on all live numbers | `styles/tokens.css` |

---

## 8. Roadmap

Each phase ships on its own and leaves the product better than before.

| Phase | Scope | Exit criteria |
|---|---|---|
| **A: Quick fixes** (1–2 wk) | §7 list | All 12 fixed; tests green |
| **B: Interaction core** (4–6 wk) | Action card (§3.2) with hit priority and the shunt drag; hover always measures; toolbar removed; Pathology tab and inspector sliders folded into the card; keyboard cleanup (§3.8) | Click counts in §3.9 met; no permanent toolbar; tool-arming gone |
| **C: Timeline** (3–4 wk) | Unified timeline (§3.3): change and event markers, revert, jump buttons, pin-as-A; Compare mode, Findings tab, Log and Seconds/Months removed | Compare/Findings/Log reachable only via the timeline; undo = click a marker |
| **D: Shell** (3 wk) | Home screen, Patient chart (§3.4), one-level instruments (§3.5), command palette (§3.7), role levels (§2.7), clean mode boundaries | ≤ 25 visible targets at rest; figure ≥ 60 % of the viewport |
| **E: Art** (8–10 wk, parallel with B–D) | Commissioned anatomy (§4.1), organ morphs, vessel materials, varices/collaterals/ascites (§4.3), motion language (§4.7), brand (§4.8) | Illustrator deliverables integrated in light + dark; art review sign-off |
| **F: Signature visuals** (4–6 wk) | Semantic zoom to the lobule (§4.4), circuit redesign and morph (§4.5), WebGL flow layer, chart system (§4.6) | 60 fps on reference Chromebook; zero label/line collisions in all presets |
| **G: Teaching** (6–8 wk) | Lesson player on the figure, case monitor and debrief report, assessment, presenter scripts (§5) | 11 lessons + 4 cases ported; 3 presenter scripts shipped |
| **H: Institution-ready** (6–8 wk) | WCAG audit + VPAT, LTI 1.3 + SCORM, PWA offline, self-hosted fonts, privacy statement, clinical review, versioning, i18n (§6) | Passes a pilot school's procurement checklist |

### 8.1 How we'll know it's working

Run a moderated usability test (5–8 medical students and 3 instructors) **before phase B and after
phases D and G**, with the same tasks each time:

1. Make this patient cirrhotic and show what happens after six months.
2. Measure the HVPG.
3. Treat the varices without a TIPS, then with a TIPS, and compare.
4. Explain why the portal vein flow reversed.
5. (Instructor) Prepare a 3-step demonstration for tomorrow's lecture.

| Metric | Target |
|---|---|
| Task success without help | ≥ 90 % |
| Time to first meaningful change (from cold start) | < 20 s |
| Clicks per task | ≤ §3.9 targets |
| System Usability Scale | ≥ 80 (from a baseline measured before phase B) |
| "I'd use this in my teaching" (instructors) | 3 / 3 |

### 8.2 Guardrails

- The engine and the acceptance tests in `tests/` don't change for UI work. Every phase keeps
  `npm test` green and the stamp step (`npm run stamp`) current.
- No capability is lost. Everything in §1.2 still has one place to live after the redesign; the
  mapping in §3.1 and §3.2 is the checklist.
- The figure export (SVG/PNG/print) stays at least as good as today in every phase.
