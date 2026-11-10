# What to add next, from first principles (second pass, 10 Nov 2026)

Features, transitions, animations, UI and graphics. Docs only: nothing was built and no app code changed.

Mohammad asked for this file to be thought through again from nothing. This version replaces the first one (kept in git at
`8c4d381`). It starts from a different question, arrives at a different order, drops some items, and adds new ones. Where an idea
from the first pass is here again, it is because it came out of the new reasoning too, and the section says why.

**Read for this pass.** The app's own code at `8c4d381`: the model's settings, drugs and events (`src/engine/`), the timeline and
Compare, the lobule and sinusoid views, the instruments and their probes, the presenter, and the Tube renderer's files. The
earlier recs files were read only to avoid repeating them (new features I1 to L2, motion 1 to 24, visual style, the Tube plans).

**Rules every item keeps.** Everything drawn is drawn by the GPU. Tube is the cel-shaded look, and a renderer is never a hybrid.
No liver seep for ascites. The Vector renderer stays shelved. One label style, edited only by the labels thread. Nothing needs a
backend. Cards are glass of one fixed size.

**Not verified.** I read code and ran nothing. "Check first" marks what I could not confirm from the code.

---

## Starting point: what does the viewer have to remember?

The app's one asset is that the picture is computed. A book can show a state. Only a live model can show several views of one
state at once, the same patient under two choices, and a change as it happens.

The viewer's limit is memory. A person in a lecture hall can hold about four things in mind. Portal hypertension asks them to
connect four things that are almost never on screen together:

| What must be connected | Where it is today | What the viewer has to remember |
|---|---|---|
| **Scale**: sinusoid, lobule, organ, body | One scale at a time (the scale pill, the dive) | The other two scales |
| **The other choice**: treated or not, this drug or that | Buttons flip between them | The state they just left |
| **Cause**: where a change starts | Every vessel changes together | Nothing to remember, but nothing shown either |
| **Place**: which vessel a number or an instrument belongs to | Cards beside the figure | Which vessel the card is about |

So the test for every item is one sentence: **does it put on the screen something the viewer otherwise has to remember or
guess?** The list is ranked by that test, then by cost.

Two smaller tests come from who is watching:

- **The back row.** A room reads shape, colour and motion. It does not read 12 px numbers. A key moment should be visible
  without reading.
- **The learner alone.** One person with a phone and five minutes needs something to do, not something to watch.

---

## The short version

Size: **S** under a day, **M** one to three days, **L** several threads. "Mock" means it changes the picture, so Mohammad
should see a mock before a build.

| # | Item | Kind | What it puts on screen | Size |
|---:|---|---|---|---|
| 1 | **Three scales on one plate** (Mohammad's idea; top pick) | feature, transition | The other two scales | M to L, mock |
| 2 | **A second state on the same figure**: before, or the road not taken (top pick) | feature | The other choice | M, mock |
| 3 | **A change starts where it is made**: drugs land on their targets (top pick) | animation | The cause | M |
| 4 | Every card is tied to its place | UI, transition | Which vessel a card is about | S to M |
| 5 | Guess first: commit before the reveal | feature | The viewer's own prediction | S to M |
| 6 | Pressure lines: a tick wherever the pressure crosses 5, 10, 15... | graphics | Where the pressure is lost, without a chart | S to M, mock |
| 7 | Threshold moments: crossing 10 or 12 is an event the room sees | animation | The cut-off | S |
| 8 | The chart draws itself as the eye walks the path | transition | Where a chart comes from | S |
| 9 | Start from readings: open the patient nearest to a real one | feature | The viewer's own patient | M |
| 10 | Things to try: three experiments on every patient | feature, UI | What a learner can do | M |
| 11 | A detour in a talk, and the way back | UI | The room's own question | S to M |
| 12 | A Doppler you can hear | feature | What the instrument really gives | M |
| 13 | The patient in one sentence | UI | The state, in words | S |
| 14 | Three kinds of slide change, three motions | transition | What kind of change this was | M |
| 15 | Fork badges: how the flow splits, at the fork | UI | The split, where it happens | S |
| 16 | The legend is a control | UI | Every vessel in a pressure band | S |
| 17 | One hand: organs and devices in the tubes' cel language (Tube) | graphics | A picture that reads as one drawing | M, mock |
| 18 | Nothing see-through: stepped-back vessels become line art (Tube) | graphics, speed | What matters, at a glance | M, mock |
| 19 | Streak count is flow | graphics | Flow volume, without a number | S |
| 20 | The heart shows the circulation | animation | Heart rate and output, without a tile | S |
| 21 | Wall tension on the varix | animation | Why this varix will bleed | S |
| 22 | A collateral opens from its high-pressure end | animation | What opened it | S |
| 23 | Sudden things in the cartoon's language (Tube) | animation | That something just happened | S |
| 24 | Study mode: the notes as captions | feature | The speaker's half of the talk | S |
| 25 | A code on the last slide | feature | The patient, in the room's hands | S |

**If only three are built: 1, 2 and 3.** They are the three rows of the table above that are empty today.

---

## Top picks

### 1. Three scales on one plate (Mohammad's idea)

**The gap.** In this disease the cause is microscopic and the effect is whole-body. Stiff, closed sinusoids raise the
resistance; the room is shown varices. A slide shows one scale at a time, so the link between them, which is the whole lesson,
lives only in the viewer's memory.

**What to add.** A slide field, for example `cutouts: ['lobule', 'sinusoid']`, that lays the slide out as an atlas plate.

- The anatomy stays the main figure.
- A round cutout of the lobule sits beside the liver. A small ring on the liver marks where it was taken from, and two thin
  lines join the ring to the cutout, like a magnifier's cone.
- A second, smaller cutout of the sinusoid hangs off the lobule cutout the same way.
- All three are the real views, drawn from the one model state. Give carvedilol and the sinusoid's wall relaxes, the lobule's
  pressures fall and the varices shrink, together.

**The same grammar for every small thing.** The cutout is not only for the liver. The app already has small pictures that
belong to a place and are shown in a card or a ring: the scope view of the varices (the scope ring), the vessel cut across
(`lumen`), and the varix wall (`wall`). All of them become cutouts of one kind: a ring on the figure, a cone, a round glass
window. One rule, learned once: a round window is "this spot, magnified".

**Transition.** Tapping a cutout dives into it: the window grows into the full view, and the anatomy shrinks into a small
cutout of its own in the corner, so the way back is on screen. The dive then has a visible first and last frame. Inside a deep
view, that corner cutout also answers "where in the liver is this?".

**Rules that keep it good.**

- **One scale is the subject.** The slide names it. That one runs its blood. The others move slowly or hold still. Three busy
  pictures split the eye.
- **Only where cause and effect sit at different scales.** What cirrhosis does, carvedilol against propranolol, the wedge
  pressure, MASLD, congestion in outflow disease, the sinusoid's lymph and ascites.
- **Mac and iPad on its side only.** A phone keeps the scale pill.
- **The figure fits the room the cutouts leave**, as it does for cards.

**Cost, said plainly.** This is the heaviest frame the app would draw. The lobule alone runs near 21 to 33 fps at rest on Tube
today. A cutout is far fewer pixels than a full view, which helps a lot. A cutout should draw at its own small size; a still
cutout is drawn once and kept; only the subject redraws every frame. Build it after the lobule speed work, and read `?perf` on
the first slide before writing more.

**Check first.** Whether the lobule and sinusoid views can draw into a target that is not the stage. Each has its own caches,
glass and wide copy (`wide-gl.js`, `tissue-gl.js`). A cutout uses the chosen renderer, never another one.

**Size M to L.**

### 2. A second state on the same figure: before, or the road not taken

**The gap.** Medicine is a choice between two futures, and the app shows them one after the other. Compare buttons flip the
figure between "no drug" and "carvedilol". Compare on the timeline switches the header between then and now. Each time, one
state is on screen and the other is a memory.

**What to add.** Draw the second state on the same figure as a quiet outline under the live one.

- **Before.** While a moment is pinned in Compare, or on a slide with `outline: 'before'`, every vessel and organ keeps a thin
  dashed outline at its earlier size. A varix that grew shows its old size inside it. A portal vein that shrank after a TIPS
  sits inside its old outline. `normalOutline` already does exactly this for the spleen.
- **The road not taken.** On a slide that treats, `twin: 'untreated'` runs the same patient forward without the treatment and
  draws that patient as the outline. Six months after banding and carvedilol, the varix sits small inside the outline of the
  varix it would have been.
- **In the tiles.** Each tile's scale already has a dot for now and a ring for where the reading started. The twin is a second,
  hollow dot. The room sees "14 with treatment, 19 without" as two marks on one scale.

**Why it is plausible.** The model already runs other versions of a patient off to the side: the `curve` and `course` charts
sweep a setting or a treatment and draw a line for each. The twin is one more run, kept as a snapshot. The outline is one more
pass over vessel geometry that already exists at a second width.

**What it replaces.** Two patients side by side (7 Nov F10) and a draggable before/after wipe both need two full vessel layers.
This needs one extra outline pass.

**Check first.** The outline must be its own optional program in each renderer, with no fallback from one renderer to another.
A twin costs model time, so it is made when the slide is prepared, not when it lands.

**Size M.**

### 3. A change starts where it is made: drugs land on their targets

**The gap.** When a slide gives a drug or opens a stent, the whole tree changes together. That says "something happened". It
does not say what was touched, or in which direction the effect travelled. For a drug, the place it acts is the entire
pharmacology lesson, and it is on screen only as a sentence.

**What to add.**

- **Drugs land.** The model already holds each drug as a small set of actions (`scenario.js` `DRUGS`): propranolol slows the
  heart and tightens the gut's arterioles; carvedilol does both and also relaxes the sinusoids and the systemic arterioles;
  terlipressin clamps the gut's arterioles hard and raises systemic resistance; octreotide tightens the gut's arterioles only.
  When a drug is given, each of its targets lights in turn with a short tag (heart: "slower"; gut arterioles: "tighter";
  sinusoids: "looser"). Propranolol lights two places. Carvedilol lights the same two and then the liver. The difference
  between the two drugs is seen in two seconds, before any number moves.
- **Then the effect travels.** From each target, the pressure change runs along the vessels in the direction it really
  spreads: from the gut's arterioles forward into the portal vein, from the sinusoids back up the portal vein into the varices
  and the spleen. About 600 ms across the figure.
- **Lesions do the same.** A new clot, a narrowed stent or a scarring liver starts at its own site, and the rise in pressure
  backs up from there. A TIPS starts at the stent and the fall runs back.
- **"Why?" uses the same piece.** The Why card's causes (`explain.js` already returns them, largest first) can be played on the
  figure the same way: each cause lights its home, then its share travels to where the reading is taken.

**How.** A small table from each drug action and each cause to vessel and organ ids (the ids `glow` takes), and a delay per
vessel taken from its distance along the network to the start. `ripple: true` already picks the vessels whose pressure moved
(`highlight-math.js` `rippleList`); this gives them an order and a start. It is display order only. The model's pressures ease
exactly as they do now.

**Check first.** With a scale cutout up (item 1), carvedilol's "looser" tag belongs on the sinusoid cutout. That pairing is the
strongest single slide these three items make together.

**Size M.** Tags are label text and go through the labels thread.

---

## Features

### 5. Guess first: commit before the reveal

**Why it survives a second pass.** The strongest single finding about learning is that a prediction, made and then checked,
sticks far better than an answer that is shown. The question card already asks. Nobody has to answer, so nobody is wrong.

**What to add.** On a slide with `question`, an optional `guess: 'hvpg'`. The question card shows that reading's scale, large,
with a handle. The presenter drags it to what the room says, or the learner drags it alone. On reveal the real dot eases to its
value and the guess stays as a hollow ring. The gap is the lesson. A quick form, `as: 'updown'`, gives three targets: up, same,
down. No score, nothing stored, no backend.

**On the GPU.** A third mark on the tile scale (tile-gl) and a slider-gl handle.

**Size S to M.**

### 9. Start from readings: open the patient nearest to a real one

**The gap.** On rounds, teaching starts from a real patient: "stiffness 32, platelets 85, spleen 16 cm". The app has 17
patients, and none of them is that one. The viewer has to map their patient onto the nearest preset in their head.

**What to add.** "Start from readings" in the Patients menu. The user enters what they have (any of: stiffness, platelets,
spleen length, HVPG, ascites yes or no). The app searches the model's own settings for the state whose readings sit nearest,
opens it, and shows a row for each reading: entered, model, and how close.

- The model already computes each of these readings from its settings, so this is a search over a few settings, done in the
  worker.
- Nothing typed leaves the device or is stored after the tab closes.

**Wording matters here.** The app says it is an educational simulation and not for diagnosis or treatment. This feature must say
so on its own card, name the result "a model patient with similar readings", and never print a risk or a recommendation.

**Size M.**

### 10. Things to try: three experiments on every patient

**The gap.** The free simulator is the app's best part and it opens on a full figure with no suggestion. A learner alone does
not know what is worth doing. The decks know, but a deck is watched, not done.

**What to add.** Each patient carries three short experiments, listed on its card: "Clot the portal vein", "Give a meal", "Place
a 10 mm TIPS, then narrow it". Each is one tap. It does the action, moves the camera, and then asks one thing ("Which gradient
rose?") before showing a one-line finding from the live numbers.

- An experiment is a tiny script, written in the deck format the app already plays, so it needs no new engine.
- A harder tier turns it round: a target written as readings ("HVPG normal, PPG 15, large spleen") that the learner has to
  build from the healthy patient with the ordinary actions. The app's fingerprint of each state is the judge.
- The first visit opens the healthy patient with its first experiment offered. That is the onboarding. There is no tour.

**Size M.** The experiments are data; fifty lines each at most. The tester guides change in the same push.

### 12. A Doppler you can hear

**The gap.** There is no sound anywhere in `src/`. A Doppler is listened to: the portal vein's low steady hum, the hepatic
artery's sharp beat and the hiss of a narrowed stent are how the finding is first noticed.

**What to add.** A speaker button on the Doppler card, off by default. `doppler-synth.js` already computes how much signal sits
at each velocity at each moment; that spectrum drives the sound, with velocity as pitch. The bedside monitor gets its beep at the
model's heart rate from the same switch, so in the bleed deck the room hears the heart rate climb.

**Rules check.** Sound is not drawing. It runs in an audio worklet, off the main thread, fed by numbers the trace already has.
A talk never starts sound by itself. On an iPhone, audio only starts from a tap, so the button is what starts it.

**Size M.**

### 24. Study mode: the notes as captions

A deck is half a talk; the speaker is the other half. A learner who opens a deck alone gets slides without the voice. The voice
is already written in `notes` and today it only prints in the handout. A "Study" way to open a deck shows the first two
sentences of each slide's notes as a caption strip, and the slide's `ask` as a tap-to-reveal question before Next. Projected
talks do not change. **Size S.**

### 25. A code on the last slide

The quick-check slide shows a QR code that opens the deck's main patient on a phone, with its first experiment (item 10)
offered. Share links and deep links exist (`share-link.js`, `?preset=`). The code is drawn by the GPU as squares. No backend,
nothing collected. **Size S.**

---

## Transitions

### 4. Every card is tied to its place

**The gap.** A Doppler card, a cross-section, a FibroScan or a tile floats beside the figure. Which vessel it is reading is said
by a probe drawn on the figure (the Doppler has one) or not at all, and nothing joins the two.

**What to add.**

- **A tie.** Every instrument card gets a hairline from the card's edge to its site on the figure, drawn in the frame that
  draws both, so it follows a pan, a zoom and a card move. It fades in after the card lands and steps back to faint after two
  seconds.
- **A number arrives from its place.** When a tile's reading is also written on the figure, the number lifts off the vessel and
  glides into its tile as the card comes in, once.
- **Both ways.** Pointing at a station on the pressure profile, a segment of the portal blood bar or a bar of the causes chart
  lights its vessel. `hover-link.js` does this today between a label and its vessel only.

**How it fits item 1.** A cutout is tied by a cone; a card is tied by a hairline. Round means "magnified", square means
"measured".

**Check first.** Which instruments already draw a site mark on the figure, so the tie has an end to land on.

**Size S to M.** The tie and the travelling number are label-layer work, for the labels thread.

### 8. The chart draws itself as the eye walks the path

**The gap.** The Gut to heart chart is the anatomy with everything but pressure removed. It appears whole, in a card, and the
viewer has to work out that its eight columns are eight places on the figure.

**What to add.** The first time a deck shows the pressure profile, it is built in step with the figure: the gut lights and the
first point appears; the light runs to the superior mesenteric vein and the line extends to the second point; and so on through
the portal vein, the sinusoids, the central vein, the hepatic vein, the cava and the right atrium (the chart's own eight
stations, `snapshots.js` `PATH`). About three seconds. After that the chart behaves as it does now.

- Light on the figure is `glowSeq`. The chart side is the line's draw length, one number.
- Once per deck, forward only. Back and jumps show it whole.

**Size S.**

### 14. Three kinds of slide change, three motions

**The gap.** Motion is a language, and one word should not mean three things. Next can bring a different patient, the same
patient later, or the same patient treated. All three mostly look like "the figure eases to new values".

| The slide | What the room should feel | Motion |
|---|---|---|
| Loads a new patient | "This is someone else" | The figure dips in brightness and returns as the new patient, with the case card. No morph between two people. |
| Passes time | "Time went by" | The time-lapse and its time graph, as built. |
| Treats or acts | "We did something" | Item 3: it starts at the site and travels. |

The dip is an eased opacity change of the figure layer, never a cut: nothing may blink.

**Check first.** What a new-patient slide does today when it has no vignette.

**Size M.**

---

## Animations

### 7. Threshold moments

**The gap.** The subject is taught as cut-offs: an HVPG of 5, 10, 12, 16, 20. In the model a reading slides through 10 like any
other value. The tile changes colour, which the back row cannot see.

**What to add.** When a key reading crosses one of its cut-offs (they live once, in `pressure-cuts.js`), the room sees a moment:
a single ring opens from the place the reading is taken, in the cut-off's colour, and the cut-off's short name rides it once
("Clinically significant"). Crossing back down plays the same ring closing. It fires at most once per slide per cut-off, so a
reading that hovers at a line does not flicker; the events code already holds each state with hysteresis.

**Size S.** The name is label text.

### 20. The heart shows the circulation

**The gap.** Cirrhosis makes a fast, high-output circulation, and a bleed makes a fast, empty one. On the figure the heart is a
still shape. Heart rate and output are tiles.

**What to add.** The heart's outline beats at the model's heart rate, and the size of each beat follows the stroke volume. A
hyperdynamic heart beats fast and full; a bleeding patient's beats fast and small; a beta-blocker visibly slows it.

**Check with Mohammad first.** The standing decision is that blood keeps its steady mean speed, with no heartbeat swing in the
streaks. This item does not touch the blood. It moves one organ's outline by a few percent as a transform of a picture that is
already drawn, so it adds no redraw. It stands still under reduced motion and when the figure rests.

**Size S.**

### 21. Wall tension on the varix

A varix bleeds because its wall is under too much tension, not because it is large. The `wall` card shows that. On the figure a
varix only grows. The model already has the number (the varix's wall stress as a percent of rupture). Let the varix's wall line
thin and its fill pale as the stress climbs, most on the bulging side, and thicken again after banding or a fall in pressure.
**Size S.**

### 22. A collateral opens from its high-pressure end

The pressure opens the vessel, so the opening should start at the portal end and run to the systemic end over about a second,
and close the other way. In Tube this is a taper along the tube driven by one number. **Check first** how a collateral appears
today; if it already widens along its length, drop this. **Size S.**

### 23. Sudden things in the cartoon's language (Tube)

The Tube look is a cartoon, and cartoons have a vocabulary for sudden things. In the Tube look only: a short flat burst shape at
a rupture before the steady bleed spot takes over; a few percent of overshoot and settle when a balloon fills, a stent opens or a
band closes; two or three speed lines beside a jet through a narrowing (the blood's own curl there is already built). Still
under reduced motion. No number changes. **Size S.** For the Tube planner thread.

---

## UI and UX

### 11. A detour in a talk, and the way back

**The gap.** The best moment in a live talk is a question from the room: "what if you gave terlipressin now?" The app can answer
it, because the model is live. I could not find a way to do it without ending the talk.

**What to add.** A "Try it" control on the presenter's pill. It keeps the slide's patient, steps the cards aside and opens Treat
and Tests over the same figure. Whatever the presenter does is real. "Back to the talk" restores the slide exactly (its state is
a snapshot the talk already holds) and the cards return.

**Check first.** Whether leaving and resuming a talk today keeps the slide's patient. If it does, this is only the control and
the restore.

**Size S to M.**

### 13. The patient in one sentence

**The gap.** After an action, a learner looks across a dozen tiles to work out what the patient now is. The app already writes
the answer: a one-line reading of the patient, kept current for screen readers (`a11y.js`).

**What to add.** Show that sentence, small, under the patient's name in the free simulator: "Decompensated cirrhosis: HVPG 18,
large varices, 3 L of ascites." It changes when the state changes, with a crossfade. It is the cheapest feedback there is, and
it is already correct.

**Size S.**

### 15. Fork badges

Blood divides at a fork by resistance. The app's own first sentence is that blood "finds another way", and the fork is where it
does. A Blood menu choice, "Flow split", puts a small two-part ring at each main fork (the confluence, the portal bifurcation,
where the coronary vein leaves, the stent's mouth) showing the share going each way, live, from the flows the model already has.
A slide can ask for one: `forks: ['PV_TRUNK']`. **Size S.** The percent is label text.

### 16. The legend is a control

Drag along the colour legend to pick a band. Vessels in the band keep their colour and the rest step back, as `spot` does. Tap
a cut-off to snap to "over 10". It works for every lens. This is how a presenter answers "where is the pressure high?" in one
gesture. Two uniforms in the vessel shader. **Size S.**

---

## Graphics

### 6. Pressure lines: a tick wherever the pressure crosses 5, 10, 15...

**The gap.** Colour says how high the pressure is. It does not say clearly where the pressure is lost, because a smooth ramp
hides a steep fall inside a few shades. The profile chart shows it, in a card, away from the anatomy.

**What to add.** A map shows a hill with contour lines: where the lines crowd, the ground is steep. Do the same for pressure.
Along every vessel, draw a short tick across the lumen wherever the pressure crosses a multiple of 5 mmHg (or of 2 when zoomed
in). In a healthy patient the portal tree has almost none. In cirrhosis the ticks crowd inside the liver. With a clot they
crowd at the clot. In Budd-Chiari they crowd at the hepatic veins. **Where the ticks are close together is where the resistance
is**, and the room sees it on the anatomy with no chart.

- It suits the cel look: flat tones and ink lines. As an option, the colour can also step at each tick instead of blending, so
  the picture is bands and lines.
- In the vessel shader the pressure along a vessel is already what sets its colour. A tick is where that value, divided by the
  step, crosses a whole number. No new data.
- It is a Blood menu choice and a slide field (`lines: 5`), off by default.

**Check first.** That the pressure varies along a vessel in the shader and is not one value per vessel. If it is one value,
ticks fall only at joins, and the item becomes "a tick at each join whose pressure step is large", which is still useful.

**Size S to M.**

### 17. One hand: organs and devices in the tubes' cel language (Tube)

**The gap.** With Tube chosen, the vessels are flat tones with an ink outline. They sit on organs painted as soft gradients, and
catheters, stents, coils and balloons with their own soft shading. Three drawing styles on one plate read as three artists.

**What to add, in the Tube look only.**

- Organs in two or three flat tones, split along the tubes' light direction, with an ink outline.
- Devices in flat tones with an ink outline. A stent's struts are ink.
- One weight rule for every line: the outer edge of a shape is heaviest, an edge inside a shape is lighter, a thing behind
  another is lighter still. Weights are set in pixels so they hold at any zoom.
- The lobule's cells and the sinusoid's wall follow the same rule, so the cutouts of item 1 match the plate.

**How.** The organ painter already fills each organ on the GPU from gradient stops (`organ-paint.js`, `stop-tokens.js`). A cel
organ is the same fill with its stops snapped to bands, plus an outline pass. Classic and Mesh keep today's organs. This is the
Tube look being finished, not a mix of renderers.

**Size M.**

### 18. Nothing see-through: stepped-back vessels become line art (Tube)

**The gap.** A cartoon steps a thing back by drawing less of it. The app steps a vessel back by making it partly transparent,
which looks muddy over organs and is the costly choice: the Tube speed plan left out "one pass for all tiers" (P4) because
see-through vessels must blend over the tier beneath.

**What to add, in the Tube look only.** A dimmed vessel (by `spot`, by a lit label set, or as the network behind a focus) is
drawn as its outline only, in lighter ink, with no fill and no blood. A vessel behind an organ is the same, dashed. Nothing in
the Tube picture is partly transparent.

**It pays twice.** The lit vessels are full cartoon tubes on a quiet line drawing, which is how an atlas steps things back. And
with no see-through vessels, one depth test can serve every tier, which is what P4 needs.

**Check first.** A question for the Tube planner: whether every use of a tier's alpha (fades at a view change, the veil behind
organs, a fading branch) can become line art or a short dither.

**Size M.**

### 19. Streak count is flow

A picture is honest when each cue means one thing: colour is pressure, calibre is diameter, streak speed is velocity. Flow
volume has no cue. From the particle brief, streak density reads as a fixed coverage, so a vessel carrying almost nothing looks
as full as one carrying a litre a minute. Scale the density by the vessel's flow against its own normal, within a floor and a
ceiling. A new collateral starts sparse and fills. A portal vein that a shunt steals from thins out before it reverses.
**Check first** in `blood-particles.js`; if density already follows flow, drop this. **Size S.** For the Tube particles thread.

---

## What changed from the first pass, and why

- **New order.** The first pass ranked by "why" and "what if". This one ranks by what the viewer has to remember, which puts
  the scales, the second state and the cause at the top.
- **New items:** 3 as drugs landing on their targets, 4 the tie, 6 pressure lines, 7 threshold moments, 9 start from readings,
  10 things to try, 11 the detour, 13 the one sentence, 20 the heart.
- **Merged:** "then as an outline" and the twin are one item (2). "Why on the figure" and the spreading ripple are parts of 3.
  The locator is part of 1. The first-run tour and the puzzles are parts of 10. Cel organs and cel devices are one item (17).
- **Changed:** "the circuit stands up into the ladder" became item 8, which teaches the same link for a tenth of the work.
- **Dropped: "Ride a red cell".** It was a top pick in the first pass. On a second look it is a twenty-second show that a talk
  would use once, a camera chasing a particle is uncomfortable on a projector, and fork badges (15) teach the same point for far
  less.

## Considered and not recommended

- **Two patients side by side, or a draggable before/after wipe.** Two full vessel layers. Item 2 does it with one outline pass.
- **Haptics.** iPhone Safari has no vibration call.
- **A heartbeat swing in the blood.** Kept as decided. Item 20 moves the heart's outline only, and asks first.
- **A free 3D camera.** The Tube brief is a flat cel look, not 3D tubes.
- **A chat tutor, a room poll, phones following the talk live.** Each needs a service off the device.
- **Recording a talk as video.** Turned down before: it needs a CPU pixel copy.
- **Fluid shown leaving the liver for ascites.** Reverted and not to be re-added.

---

## If these are built: who owns what

| Thread | Items | Files it would own |
|---|---|---|
| Plate and cutouts | 1 | a new cutout module; hooks in the lobule and sinusoid views; the scope ring, `lumen` and `wall` as cutouts later |
| Second state | 2 | the twin run in the worker, the tile's second mark, the outline pass (with the vessel shader's owner) |
| Cause | 3, 7, 14 | the action and cause table (new), `highlight-math.js`, the presenter's slide change |
| Labels thread | 4, 15 and every tag, tie and name above | label code (only this thread edits it) |
| Question card and study | 5, 24, 25 | the question card, tile-gl's third mark, a Study way in, the quick-check slide |
| Vessel shader | 6, 16, 21, and 2's outline | `veins-gl.js` and the shared shader text, one thread, in order (the Tube integrator owns this file today) |
| Charts | 8 | the profile chart's draw length, a `glowSeq` hook |
| Patients | 9, 10, 13 | the Patients menu, a new experiments data file, the worker's search, both tester guide PDFs |
| Presenter | 11 | the presenter's pill and restore |
| Sound | 12 | a new audio module and worklet, the Doppler and monitor cards' button |
| Organs | 20 | the heart's transform in the organ layer |
| Tube planner and its threads | 17, 18, 19, 22, 23 | organ paint in Tube, the Tube pass, the particles, the cel shader |

Mock before building: 1, 2, 6, 17, 18.
