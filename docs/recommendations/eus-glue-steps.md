# EUS coils and glue: how the steps are shown (10 Nov 2026)

Docs only. Nothing was built and no app code changed. Mohammad picks what gets built.

Mohammad asked for a first-principles look at how the steps of the EUS-guided coils and glue are displayed (Gastric varices,
slide 10, `eusglue`). He had just said the scope should sit under the vessels and that its outline is too prominent. Another
thread is doing that work now, so this file does not repeat it. Items that touch the scope's look say how they fit with it.

**Read for this pass.** `src/ui/proc-anim.js` (`ENDO.eusglue`, `GLUE_T`, `GLUE_STEPS`, `GLUE_MARKS`, `glueFrame`, `playProcedure`),
`src/ui/eus-scope.js` (route, station, `eusDraw`, `layCoil`), `src/ui/stage-cath.js` (`glueFocus`, the glue cast tint),
`src/ui/presenter.js` (`procPlay`, `procEl`, `eventGraph`), `src/ui/event-graph.js`, `src/ui/decks/gastric-varices.js`, `styles/app.css`
(`.pz-procs`).

**Rules every item keeps.** Everything is drawn on the GPU. One label style, and only the labels thread edits label code: items
here change label *data* only (which vessel a callout names and where along it), unless they say "labels thread". Cards are glass
of one fixed size once built. Teaching cards show all their text at once. The X sits on the varix only, never on the shunt.

**Not verified.** I read the code and ran nothing. "Check first" marks what I could not confirm from the code alone.

---

## What the viewer gets today

The slide opens with the varix open. Each Next plays one step and holds at its stop.

| Step | What moves (ms, after retiming to the route's length) | Shot | Callout (at the step's stop) |
|---|---|---|---|
| 1 Scope in | The scope travels down the esophagus, through the cardia and under the fundus (300 to about 6500). | `way`, the view rides with the tip at 4x | "1 Scope in", on the varix (C2 at 0.8) |
| 2 Needle in | Port opens, faint ultrasound fan, needle runs square into the varix, a ring flash at the hit (about 6900 to 10200). | `tip`, push in to 7x, held | "2 Needle in", same point |
| 3 Coils | The coil curls out of the needle's point along the varix (about 10800 to 13200). | `tip`, held | "3 Coils", same point |
| 4 Glue | The opaque cast fills the varix out from the point (about 13800 to 16500). | `tip`, held | "4 Glue", same point |
| 5 Varix closed | The model closes C2 and its X lands (about 17100). Then the needle comes out, the fan goes, and the scope backs all the way out (about 19300 to 22700). | `work`, pull back to 5x | "5 Varix closed", at about 19300 |

The teaching card shows the title, the line, and the five steps as one inline row of numbered words with the current one lit.
The instrument card is the `gv` and `pv` tiles. The slide has no graph, because `eusglue` is not in `EVENT_WORD`, and that is right.

## What is wrong with it, from first principles

What does a viewer need to take away from this slide? Three things. EUS sees the varix *through the stomach wall*. The coils are
a scaffold that holds the glue. The proof of success is that **Doppler shows no flow**. Measured against that:

1. **The explanation of each step is never on screen.** The good sentence for each step (`GLUE_STEPS[i][2]`) is only the `title`
   tooltip on its pill (`presenter.js procEl`). In a lecture, nobody hovers, so the audience sees one word per step.
2. **What EUS sees is not shown.** The step 1 caption says "color Doppler shows the blood running through it", but the figure
   shows only a pale wedge (`eusDraw`: alpha 0.2, nothing inside it). The reason EUS is used here, imaging through the wall, is invisible.
3. **Closure is asserted, not shown.** Step 5 is an X and a word. The real end point of the procedure is a Doppler check showing no
   flow, and that check is missing.
4. **Everything piles up on one spot.** The needle's point, the coil, the cast, the X and all five callouts sit at C2 0.8, with the
   scope lying right next to them. Each callout replaces the last one in the same place, so the step change is a word swap.
5. **The time goes where the information is not.** About 6 s of step 1 is travel down the esophagus, which teaches nothing on this
   slide. Step 5 spends about 3.5 s reversing the scope out of the frame while the viewer should be reading the result. The callout
   "Varix closed" comes about 2 s after the X, once the scope has started to leave.
6. **"Scope in" names a move, not a finding.** The step clinicians care about is finding the varix and its flow.

---

## Recommendations

Each item says what to build, why, where it goes, and roughly how big it is (S: under an hour, M: a few hours, L: a day or more).

### Teaching card

**1. All steps listed at once, each with one short line (M).**
Replace the inline row with a short vertical list. Each step gets its number, its word, and one line of about 8 words. All five
are visible from the moment the slide lands. The current one is lit as it is today, and the ones already done stay at full ink.
This fixes problem 1 and follows his rule that teaching cards show all their text at once. The card is built at its full size,
so it never grows.
Draft lines:
- 1 Varix found: Doppler finds it through the stomach wall
- 2 Needle in: a 19-gauge needle enters the varix
- 3 Coils: they curl inside and hold the glue
- 4 Glue: cyanoacrylate casts the varix
- 5 No flow: Doppler confirms the varix is closed

Where: a short-line field on each step in `GLUE_STEPS`, `procEl` in `presenter.js`, `.pz-procs` / `.pz-proc` in `app.css`. The
long captions stay in the notes. On a phone (`.pz.stack`), keep today's one-line row and drop the short lines, so the stacked card
does not grow. This would work for TIPS, BRTO and BATO as well. Mohammad can choose EUS only, or all procedure slides.

**2. Step words name what is found or done (S).**
Change "Scope in" to "Varix found" and "Varix closed" to "No flow". Keep "Needle in", "Coils" and "Glue". The callout on the
figure and the list in rec 1 then say the same thing. Where: `GLUE_STEPS` words only.

### Instrument card

**3. The instrument card shows the varix's Doppler, with the varix tile tucked into its header (M, check first).**
Change the instrument card from tiles only to `tool: { kind: 'doppler', vessel: 'C2' }`, so the trace shows the flow in the varix
through steps 1 to 4. At step 5 it falls to "No flow · No signal" as the model closes C2. The `gv` tile goes into the header (T3).
`pv` can go, because it does not change on this slide. This puts the proof of closure (problem 3) in the instrument card as a moving
trace. It is the same idea he asked for today on the TIPS slide: the instrument card carries the moving picture, and the teaching
card carries none. The slide before (`svt`) already uses a Doppler tool on `SV_CONF`, so the deck stays consistent.
Check first: the Doppler tool draws its own transabdominal probe on the figure (`stage-doppler.js`). On this slide the scope *is*
the probe, so the tool needs a "no probe" (scope-sourced) option. A second probe beside the scope would be confusing. Also check that
`doppler.js` reads C2's flow (it judges collaterals: "This collateral carries no flow").

**4. Color Doppler inside the scope's ultrasound fan on the figure (M to L, check first).**
Where the varix's lumen falls inside the fan, color it in Doppler red and blue, moving with C2's own flow in the model. It goes
dark as the flow stops at step 5. The needle, the coil and the cast show bright inside the fan. This fixes problem 2 on the figure
itself: the viewer sees *how* EUS finds the varix through the wall. Rec 3 and rec 4 work together (the card's trace and the fan's
color go dark at the same moment), but rec 3 alone covers the proof of closure and costs less.
Where: the fan pass is `veins-gl.js` CATH_FS mode 9. It needs C2's lumen, clipped to the fan. The glue cast already tints C2 over a
range (`stage-cath.js`, `tint`/`castAt`), and that path is a good starting point. Check first: whether the cath pass can sample the
vessel's lumen mask, and how this sits with the other thread moving the scope under the vessels (the fan probably has to move with it).

### Timing and the figure

**5. Step 5 becomes the Doppler check, and the scope stays parked (S to M).**
Order the step as: the needle comes out, the fan stays on, the flow in the varix slows and stops, the Doppler (recs 3 and 4) goes
dark, then the X lands and "5 No flow" appears. Do not back the scope out up the esophagus inside the step. It stays parked over
the varix with its fan off, and it fades out in place over about 600 ms when the slide moves on. This fixes the end of problem 5:
the viewer looks at the result, not a departing scope.
Where: `GLUE_T` (fanOut after the flow has stopped; `back` and the travel out replaced by an opacity fade), `markAt` for the last step
(the callout should come with the X, not at `T.back`), and `procStop` / `cathForget` in `presenter.js` so that leaving the slide fades
the scope rather than cutting it. Check first: Back from the next slide lands "done" (`procDoneAt`), and the parked scope must show there too.

**6. A shorter way in (S).**
The esophagus is about half of the 499-unit route, and it shows nothing new on this slide. Two options:
(a) cruise faster down the esophagus and slow down only for the turn into the fundus, so step 1 takes about 3.5 s instead of 6.2 s;
(b) start step 1 with the scope already at the cardia, entering from the frame's edge.
I recommend (a), because the turn through the cardia is worth seeing once. Where: `GLUE_MOVE` / `GLUE_T`, plus a speed per stretch of
the route (the `eso` part) in `glueFrame`'s `u`. The EUS-PPG slide uses the same esophagus, so it could share this.

**7. Each step's callout points at that step's own thing (S, data only).**
Point step 1 at the varix ahead of the scope, step 2 at the needle's point (C2 0.8, as now), step 3 at the coil's far end, step 4 at
the middle of the cast, and step 5 at the X. A step change then moves the leader to the new thing, so it no longer looks like a word
swap on one spot (problem 4). Where: the `f` of each mark in `GLUE_MARKS` (the coil's reach is known from `coilReach`). This changes
mark data only. If the callout also has to keep to the far side of the varix from the scope, that is label code and goes to the
labels thread.

**8. The glue sets on the coil first, then fills the lumen (M).**
Today the cast spreads out from the needle's point. Instead, let it first gather along the coil's loops and fibres, then close the
lumen around them. That shows the slide's own question, "Why are coils placed before the glue?", in the picture: the coils hold the
glue. Where: the cast range in `stage-cath.js` driven over the coil's span first, then widened. The coil is drawn on top of the cast,
as now.

**9. Fade the scope's shaft once it is parked (S, after the other thread lands).**
From step 2 on, only the tip, the transducer and the needle matter. Let the insertion tube fade to about 35% beyond three scope
lengths from the tip, so a long dark bar does not cross the figure in the step 5 pull-back. This fits with the softer outline the
other thread is building. It should be built after that thread, on top of its look, and not in parallel.

### Clinical check (his call)

**10. Transesophageal-transcrural approach instead of transgastric (L, his decision).**
Many experienced centres puncture fundal varices from the distal esophagus, through the crus (Binmoeller 2011, the coils and glue
series this slide's technique comes from). The scope is straight and stable there, and the view is not blocked by blood in the
fundus. The figure now shows the transgastric route, which is also used. Changing it would mean a new station near the cardia,
a needle angled down to the medial part of the varix, and a new target along C2 within a needle's reach (the current target is
about 130 units from the cardia, too far). I recommend keeping transgastric unless he wants the transesophageal route taught.

---

## What I would build first

1, 2, 3 and 5 together. This is one clear story: every step's line is on the card from the start, the Doppler trace runs in the
instrument card, and step 5 ends on "No flow" with the scope parked. Then 6 (a shorter way in) and 7 (callouts that move to each
step's thing). 4, 8 and 9 make it richer once those are in. 10 is a clinical choice for him.
