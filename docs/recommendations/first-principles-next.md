# What to add next, from first principles (10 Nov 2026)

Features, transitions, animations, UI and graphics. Docs only: nothing was built and no app code changed.
Read at `9245905` on `claude/settings-topbar-icon-flvft1`.

**What I read so this does not repeat it.** `new-features-recs.md` (I1 to L2), `animation-and-transitions.md` (items 1 to 24),
`visual-style.md` (C, V, B, D, S), `picture-blood-fills-look.md`, `tubes-and-particles-first-principles.md`, `tube-renderer-plan.md`,
`tube-renderer-speed-plan.md` (P1 to P7, V7), `deck-accuracy-and-feature-use.md`, `docs/deck-behavior-vision.md` (N1 to N10), the
7 Nov ideas file, the short deck guide, and the code where an item below names a file. None of those items is repeated here. Where
a new item leans on one of them, it says so.

**Rules every item keeps.** Everything drawn is drawn by the GPU. Tube is the cel-shaded look, and a renderer is never a hybrid.
No liver seep for ascites. The Vector renderer stays shelved. One label style, and only the labels thread edits label code. Blood
keeps its steady mean speed. Nothing here needs a backend, so nothing leaves the device.

**What is not verified.** I read code; I ran nothing in a browser. Where an item says "check first", I could not tell from the
code alone whether part of it already exists.

---

## The first principles

The app has one job: make a hidden causal system visible, to a room and to a learner alone. A person watching any system change
asks five questions, in this order. Each item below is ranked by how directly it answers one of them.

1. **Where do I look?** The eye needs one place at a time.
2. **What changed?** The eye sees motion and difference, not state.
3. **Why did it change?** A cause has a place and a direction. It should be seen starting somewhere and going somewhere.
4. **What would happen if?** People learn a system by predicting it and being wrong.
5. **Is the picture honest?** One quantity, one visual cue. A cue that means two things teaches nothing.

The app is already strong on 1 and 2 (camera, glow, spot, ripple, tiles that ease, the `since` lens). It is weakest on 3 and 4.
"Why?" is a popover of bars, away from the figure. A prediction is a question card with no way to commit to an answer. Most of the
top items are there.

Two more things fall out of the same thinking:

- **The app is silent.** There is no audio anywhere in `src/`. A Doppler is an instrument people listen to.
- **The Tube look stops at the vessel wall.** The tubes are cel-shaded with an outline. The organs, devices and events around them
  are still drawn in the older painted language.

---

## The short version

Size: **S** under a day, **M** one to three days, **L** several threads.

| # | Item | Kind | Question it answers | Size |
|---:|---|---|---|---|
| 1 | **Why, drawn on the figure** (top pick) | feature | Why | M |
| 2 | **Ride a red cell** (top pick) | feature, animation | Why, Where | M |
| 3 | **Guess first**: drag your guess before the reveal (top pick) | feature | What if | S to M |
| 4 | A Doppler you can hear | feature | Honest | M |
| 5 | Build the patient: puzzles solved on the model | feature | What if | M |
| 6 | "Then" as an outline under "now" | feature | What changed | M |
| 7 | Notes as captions in self-study | feature | Why | S |
| 8 | Take this patient with you: a code on the last slide | feature | What if | S |
| 9 | The circuit stands up into the pressure ladder | transition | Why | M |
| 10 | A change spreads from where it was made | transition | Why | S to M |
| 11 | A number travels from its vessel to its tile | transition | Where | S |
| 12 | Three kinds of slide change, three motions | transition | What changed | M |
| 13 | A locator in the lobule and the sinusoid | transition, UI | Where | S |
| 14 | A collateral opens from its high-pressure end | animation | Why | S |
| 15 | Events happen at a place | animation, UI | Where | S |
| 16 | Events in the cartoon's own language (Tube) | animation | What changed | S to M |
| 17 | Wall tension you can see on the varix | animation | Why | S |
| 18 | The legend is a control: brush a pressure band | UI | Where | S |
| 19 | Charts and figure answer each other | UI | Where | S to M |
| 20 | Fork badges: how the flow splits, at the fork | UI | Why | S |
| 21 | First touch: a 20-second start on the figure | UI | Where | S |
| 22 | Organs in the tubes' cel language (Tube) | graphics | Honest | M |
| 23 | One quantity, one cue: particle count is flow | graphics | Honest | S |
| 24 | Stepped-back vessels become line art, not see-through (Tube) | graphics, speed | Where | M |
| 25 | Devices in the cel language (Tube) | graphics | Honest | S to M |
| 26 | Three scales on one screen: anatomy with lobule and sinusoid cutouts (Mohammad's idea, 10 Nov) | feature | Why, Where | M to L |

**If only three are built:** 1, 2 and 3. They are the three that change what a room understands, and each reuses pieces that
exist.

---

## A. Features

### 1. Why, drawn on the figure (top pick)

**Principle.** A cause has a place and a direction. Today "Why?" (`why.js`) answers with one sentence and a waterfall of bars in a
card. The bars are right, but the learner has to carry them back to the anatomy in their head.

**What to add.** A "Show on the figure" step in the Why card, and a slide field (`why: 'ppg'`) that plays the same thing in a talk.

1. The model already returns the contributions, largest first (`explain.js`: label, delta, kind).
2. Each contribution has a home on the figure: cirrhosis is the liver's sinusoids, a clot is its vessel, a meal is the gut, a
   beta-blocker is the heart and the gut arteries, a TIPS is the stent. That is a small table from factor to vessel or organ ids,
   the ids `glow` already takes.
3. The figure plays them in order. The first cause's home lights and carries its number ("+9 mmHg"). A pulse then runs along the
   vessels from that home to the place the reading is taken. Then the second cause, and so on. The reading's own site lights last
   with the total.
4. On a talk, each Next plays one cause. In the free simulator it plays through once and holds.

**Why it is cheap.** The pieces exist: `glowSeq` and `steps` light sites in order with numbered circles, marks carry live numbers,
and the path between two stations is the topology the profile chart already walks. The new parts are the factor table, the pulse
along a path (see item 10, the same piece), and the hook from the Why card.

**Check first.** Contributions interact, so they do not add up exactly; the card already shows the rest as its own row. On the
figure, the rest should stay in the card and not get a home.

**Size M.** Callouts go through the labels thread's system.

### 2. Ride a red cell (top pick)

**Principle.** "Blood takes the path of least resistance" is the whole subject, and nobody has ever watched one cell do it. The
figure shows all the blood at once, which is a state. One cell's trip is a story.

**What to add.** A "Follow a cell" action on any vessel, and a slide field (`ride: { from: 'SMV' }`).

- One particle is drawn bright with a small ring. The camera follows it at a steady, comfortable speed (not the blood's real
  speed, which is far too fast in the cava and far too slow in the sinusoids).
- At each fork the cell goes one way. Which way is drawn from the model's own flow shares at that fork, so in a healthy patient
  nearly every ride crosses the liver, and in decompensated cirrhosis most rides leave by a collateral. Run it five times and the
  learner has seen the shunt fraction.
- A small strip under the figure draws the pressure the cell has felt so far, station by station. It is the pressure profile,
  built as the cell travels.
- With the scale switch the ride can go through the lobule: down a sinusoid, past the stellate cells, into the central vein.
- A slide can fix the route (`via: 'C1a'`) so a talk shows the same trip every time.

**On the GPU.** The particle is one more instance in the blood pass. The camera is the existing glide following a moving target.
The strip is trace-gl. No new surface.

**Check first.** The camera has one owner per move; a ride is a long move that Next, a pinch or a tap must be able to cut cleanly.
The motion doc's item 2 (waits Next cannot cut) is the same concern.

**Size M.**

### 3. Guess first: drag your guess before the reveal (top pick)

**Principle.** People learn a system by predicting it and being wrong. The question card asks, but nobody has to commit, so
nobody is wrong, and the reveal lands softly.

**What to add.** On a slide with `question`, an optional `guess: 'hvpg'`.

- The question card shows that reading's tile scale, large, with a handle. The presenter (or the learner alone) drags the handle
  to where they think the reading will land. On a talk the presenter asks the room and drags to what the room says.
- On reveal the real dot eases along the scale to its value and the guess stays as a hollow ring. The gap between them is the
  lesson. No score, no right or wrong words, nothing stored.
- Direction-only form for quick slides: `guess: { of: 'pvFlow', as: 'updown' }` gives three targets (up, same, down).

**On the GPU.** The tile scale already draws a dot for now and a ring for where the reading started (tile-gl). The guess is a
third mark and a slider-gl handle.

**Why not a poll.** N7 (the room poll) was turned down because it needs a backend. This needs none: one handle on the
presenter's screen.

**Size S to M.**

### 4. A Doppler you can hear

**Principle.** An instrument should be shown the way it is used. Nobody reads a Doppler in silence: the portal vein's low
continuous hum, the hepatic artery's sharp beat and the hiss of a narrowed TIPS are how the finding is first noticed.

**What to add.**

- A speaker button on the Doppler card, off by default. On, the trace's own spectrum drives the sound: `doppler-synth.js` already
  computes, for every moment, how much signal sits at each velocity. Velocity maps to pitch the way a real machine maps Doppler
  shift, so a faster jet is a higher sound and a reversed flow moves to the other channel.
- The same switch gives the bedside monitor (`vitals`) its beep at the model's heart rate. In the bleed deck the room hears the
  heart rate climb before anyone reads the tile.
- Silent under reduced motion unless turned on by hand. A talk never starts sound by itself: the presenter turns it on.

**Rules check.** Sound is not drawing, so the GPU rule is not touched. It should run in an audio worklet, off the main thread,
fed by the numbers the trace already has, so it adds no per-frame work to the page.

**Check first.** iPhone Safari only starts audio from a tap, so the speaker button must be the thing that starts it.

**Size M.**

### 5. Build the patient: puzzles solved on the model

**Principle.** The deepest test of understanding a system is the inverse problem. "Where is the resistance?" asks the learner to
name it. This asks them to make it.

**What to add.** A small set of puzzles under Patients, each a target written as readings: "HVPG normal, PPG 15, large spleen",
"HVPG 20 and a portal vein that flows backwards", "varices with a normal liver". The learner starts from the healthy patient and
uses the ordinary vessel actions (narrow, clot, scar the liver, open a shunt) until the live readings sit inside the target.

- The target shows as rings on the tiles; each ring fills as its reading enters range. When all fill, the puzzle names the
  textbook patient the learner has built and offers its deck.
- The judge is the fingerprint the app already computes for every state. No new model work.
- Different from the case runner (L1): a case tests decisions on a patient. This tests the mechanism, takes two minutes, and has
  no vignette.

**Size M.** Eight puzzles are enough to start; each is a few lines of data.

### 6. "Then" as an outline under "now"

**Principle.** The eye compares shapes far better than it compares memories. Compare (`compare.js`) pins a moment and lets the
header switch between then, now and the change, so the two states are never on screen together.

**What to add.** While a moment is pinned, draw every vessel's *then* calibre as a thin dashed outline under the live vessel, the
way `normalOutline` already draws the normal spleen inside the large one. A varix that grew shows its old size inside it. A portal
vein that shrank after a TIPS sits inside its old outline. The same for the spleen and the liver.

- For decks: `outline: 'before'` draws the outline of an earlier slide's state.
- It replaces the idea of two patients side by side (7 Nov F10), which needs two full vessel layers. This is one extra outline
  pass over geometry that already exists at two widths.

**Check first.** The outline pass must be its own optional program per renderer (Classic, Mesh, Tube), with no fallback from one
renderer to another.

**Size M.** Owned by whoever owns `veins-gl.js` at the time.

### 7. Notes as captions in self-study

**Principle.** A deck is half a talk: the other half is the speaker. A learner who opens a deck alone gets the slides without the
voice. The voice is already written, in `notes`, and today it only prints.

**What to add.** A "Study" way to open a deck (beside Present). Each slide shows its `notes` as two or three caption lines under
the teaching card, and its `ask` as a tap-to-reveal question before Next. Nothing changes for a projected talk.

**On the GPU.** Caption text is the same GPU text the cards use. Teaching cards keep showing all their text at once; the caption
is a separate strip.

**Check first.** Some notes start with "Source:" lines or are long. A caption should take the first two sentences and leave the
rest behind a "more" tap. The humanizer rules apply to notes that become on-screen text.

**Size S.**

### 8. Take this patient with you: a code on the last slide

**Principle.** A lecture ends and the room has watched, not done. The app's best feature is that anyone can do.

**What to add.** The quick-check slide at the end of each deck shows a QR code that opens the app on the deck's main patient in
the free simulator, with one suggested thing to try ("Narrow the stent and watch the liver"). `share-link.js` already packs a
state into a link, and deep links (`?preset=`, `?script=`) exist.

- The code is drawn by the GPU as squares (shape-gl), not as an image.
- No backend, no account, nothing collected.

**Size S.**

---

## B. Transitions

### 9. The circuit stands up into the pressure ladder

**Principle.** The Circuit view and the Gut to heart chart are the same thing drawn twice: the same eight stations in the same
order. One is laid out by anatomy and the other by pressure. Today they are a figure and a card with no visible link, and the
learner has to work out that they match.

**What to add.** One move. On the Circuit view, each station slides straight up or down to the height of its own pressure. The
wires between stations tilt into the slopes of the ladder. A steep wire is a resistance. A flat one is not. Blood keeps running
along the wires, now visibly downhill. A second tap lays the circuit flat again.

- Raising the cirrhosis slider while it stands makes the sinusoid step grow under the learner's finger.
- For decks: `view: 'circuit', stand: true`.

**Why it is plausible.** Anatomy to Circuit already morphs every vessel between two layouts (`stage-morph.js`). This is a third
layout of the same stations, with y taken from the model. The ladder's zones and brackets come from the profile chart's own
drawing.

**Check first.** Station heights move with every model update, so the layout must follow them through the same followers the
tiles use, not rebuild the morph.

**Size M.**

### 10. A change spreads from where it was made

**Principle.** A cause has a place. When a slide gives carvedilol or opens a TIPS, `ripple: true` makes the vessels whose pressure
moved glow, all at once as far as I can read. The whole tree changing together says "something happened". It does not say where
it started.

**What to add.** Order the ripple by distance along the vessels from the place of the change. A TIPS starts at the stent and the
fall runs back down the portal vein into the varices and the spleen. A banding starts at the varix. A drug starts at its target.
The wave takes about 600 ms to cross the figure, on the existing curves.

- This is a display order, not physiology. The pressures themselves still ease as they do now.
- It is the same piece as the pulse in item 1: a delay per vessel, read from its distance to a start vessel.

**Check first.** Confirm how the ripple is timed today (`highlight-math.js`, `veins-gl.js`). If it already staggers, this item is
only the choice of the start vessel.

**Size S to M.**

### 11. A number travels from its vessel to its tile

**Principle.** One thing should stay one thing. A pressure written beside the portal vein (`sites`) and the same pressure in a
tile are one reading shown twice, and nothing on screen says so.

**What to add.** When a slide brings in a tile whose reading is also written on the figure, the number lifts off the vessel and
glides into its tile as the card arrives, once. After that both stay. On Back it does not replay.

**On the GPU.** GPU text moving between two anchors; `num-move.js` and the card-entry clock exist. It must ride the card's own
throw so it never arrives before its tile.

**Size S.** Touches label code, so it goes to the labels thread.

### 12. Three kinds of slide change, three motions

**Principle.** Motion is a language, and the same word should not mean three things. A Next can mean a new patient, the same
patient later, or the same patient treated. Today all three mostly read as "the figure eases to new values".

**What to add.** One fixed motion for each, used everywhere:

| The slide | What the room should feel | Motion |
|---|---|---|
| Loads a new patient | "This is someone else" | The figure dips a little in brightness and comes back with the new patient, with the case card. No morph between two people. |
| Passes time (`days`, `lapse`) | "Time went by" | The time-lapse and its time graph, as built. |
| Treats or acts | "We did something" | The spreading change of item 10, starting at the site. |

**Check first.** What a new-patient slide does today when it has no vignette. The deck behaviour vision says nothing may blink, so
the dip must be a real eased dip of the figure layer (opacity only), never a cut.

**Size M.**

### 13. A locator in the lobule and the sinusoid

**Principle.** A dive that loses the whole loses its meaning. Inside the lobule or the sinusoid nothing on screen says where in
the liver this is or how small it is.

**What to add.** A small locator in a corner of the two deep views: the liver's outline with a dot where the lobule is, and in
the sinusoid view the lobule's hexagon with the sinusoid marked. It carries a scale bar ("1 mm", "50 µm"). Tapping it rises one
level.

- During the dive, the locator's dot is where the camera went in, so the two views stay tied.
- Drawn by shape-gl and GPU text; one small fixed card of glass.

**Size S.**

---

## C. Animations

### 14. A collateral opens from its high-pressure end

**Principle.** The pressure opens the vessel, so the opening should start where the pressure is.

**What to add.** When a collateral is recruited, it grows in calibre from its portal end toward its systemic end over about a
second, and closes the other way when the pressure falls. In the Tube look this is a taper along the tube's length driven by one
number per vessel.

**Check first.** How a collateral appears today (a fade, a width follower, or both). If it already widens along its length, drop
this item.

**Size S.**

### 15. Events happen at a place

**Principle.** The model fires events (a stagnant portal vein, a varix at its rupture threshold, a caudate that has grown). They
arrive as lines in History and as toasts, away from where they happened.

**What to add.** Each event drops a small pin on its vessel or organ for a few seconds, with a short pulse, and then the pin
shrinks into the History button so the eye learns where the record went. Tapping an event in History glides the camera to the
place and lights it.

**On the GPU.** shape-gl and GPU text. The pin's words are label text, so the labels thread places them.

**Size S.**

### 16. Events in the cartoon's own language (Tube)

**Principle.** A look is a promise about how things will be told. The Tube look is a cartoon, and cartoons have a vocabulary for
sudden things that the painted look never had.

**What to add, in the Tube look only:**

- **Rupture:** a short flat burst shape at the tear (two frames large, then settling), in the outline's ink, before the steady
  bleed spot takes over. The steady spot stays as decided.
- **A balloon inflating, a stent opening, a band closing:** a brief overshoot and settle in the shape (squash and stretch of a few
  percent), on the existing curves.
- **A jet through a narrowing:** V7 already curls the blood. Add two or three short speed lines beside the jet, in outline ink.

All of it is still under reduced motion. None of it changes a number.

**Size S to M.** It should go to the Tube planner thread, since it sits on the Tube's pass.

### 17. Wall tension you can see on the varix

**Principle.** A varix bursts because its wall tension is too high, not because it is large. The wall tool shows this in a card.
On the figure a varix only gets bigger.

**What to add.** The varix's outline carries the model's wall stress (the `varix` reading, percent of rupture). As it climbs, the
wall line thins and the fill pales toward the thin-wall colour, most on the bulging side. Near the threshold the wall trembles
slightly (still under reduced motion). Banding or a fall in pressure thickens it again.

**How it fits.** V3 in the visual style doc gives varices their beads and red signs. This adds the one variable that predicts the
bleed. One uniform per varix in the vessel shader.

**Size S.**

---

## D. UI and UX

### 18. The legend is a control: brush a pressure band

**Principle.** A key that only explains is half a tool. The best way to ask "where is the pressure over 12?" is to point at 12.

**What to add.** Drag along the colour legend to pick a band. Vessels inside the band keep their colour; the rest step back, as
`spot` does. Tap the amber or red cut-off to snap to "over 5", "over 10" or "over 12". Tap away to clear.

- Works for every lens: on velocity it shows the fast vessels, on direction the reversed ones.
- One pair of uniforms in the vessel shader, read against the value the colour already comes from.

**Size S.**

### 19. Charts and figure answer each other

**Principle.** Two pictures of one thing should point at each other. `hover-link.js` already does this between a label and its
vessel. The charts are not part of it, as far as I can read.

**What to add.**

- Pointing at (or tapping) a station on the pressure profile lights that vessel on the figure, and the other way round.
- The same for a segment of the portal blood bar (its route lights), a row of a summary table (its patient's dot on a plane), and
  a bar of the causes waterfall (its home on the figure, which is item 1's table).
- In a talk it is tap only, and it clears on Next.

**Check first.** Which charts already light a vessel. Build only the missing links.

**Size S to M.**

### 20. Fork badges: how the flow splits, at the fork

**Principle.** Flow divides at a fork in inverse proportion to resistance. That is where the lesson happens, and the split is
shown only in a bar in a card.

**What to add.** A Blood menu choice, "Flow split". At each main fork (the confluence, the portal bifurcation, where the coronary
vein leaves, the stent's mouth) a small two-part ring shows the share going each way, live. A slide can ask for one:
`forks: ['PV_TRUNK']`.

- The shares are the flows the model already has on each edge.
- Rings are shape-gl; the percent is label text in the one label style.

**Size S.**

### 21. First touch: a 20-second start on the figure

**Principle.** People learn a tool by doing one thing with it, not by reading about it. A new user lands on a full figure and a
top bar, and the thing that makes the app special (touch a vessel, and everything answers) is not visible until they try it.

**What to add.** On the first visit only, three prompts on the figure itself, each waiting for the user to do it:

1. "Tap the liver." The action card opens.
2. "Make it cirrhotic." The pressures climb and the collaterals open.
3. "Now look at the HVPG." The tile pulses once.

Then it ends and never returns (one flag on the device, cleared by Reset everything). A "Skip" is always there. Deep links from
an LMS skip it.

**Size S.** The tester guides say what the first steps are, so both PDFs are regenerated in the same push.

---

## E. Graphics

### 22. Organs in the tubes' cel language (Tube)

**Principle.** A picture should have one hand. With Tube chosen, the vessels are flat-toned with an ink outline, and they sit on
organs that are still soft painted gradients. The two do not look drawn by the same person, and the eye reads the mismatch before
it reads the anatomy.

**What to add, when Tube is chosen and only then:**

- Each organ in two or three flat tones split along the same light direction the tubes use, with one ink outline at the tubes'
  outer weight.
- A simple weight rule for every line in the picture: the outer edge of a shape is heaviest, an edge inside a shape is lighter,
  and a thing behind another is lighter still.
- The lobule's cells and the sinusoid's wall follow the same rule.

**How.** The organ painter already fills each organ on the GPU from gradient stops (`organ-paint.js`, `stop-tokens.js`). A cel
organ is the same fill with its stops snapped to bands, plus an outline pass. Classic and Mesh keep today's painted organs
untouched. This is a look of the Tube choice, not a mix of renderers.

**Check first.** Mohammad should see a mock of one organ before a build: this changes the whole picture.

**Size M.**

### 23. One quantity, one cue: particle count is flow

**Principle.** A cue that means two things teaches nothing. The picture has four cues and four quantities, and they should be
paired once and kept:

| Cue | Quantity |
|---|---|
| Colour | Pressure (or the chosen lens) |
| Calibre | Diameter |
| Streak speed and length | Velocity |
| How many streaks | Flow volume |

The first three are in place. For the fourth, I could not confirm from the particle brief that streak density follows the flow in
a vessel; it reads as a fixed coverage. If so, a wide slow vessel and a wide fast one differ only in streak speed, and a vessel
that carries almost nothing still looks full.

**What to add.** Scale the streak density by the vessel's flow against its own normal, within a floor and a ceiling so no vessel
looks empty or solid. A collateral that has just opened then starts sparse and fills. A portal vein that a shunt has stolen from
thins out before it reverses.

**Check first.** Read `blood-particles.js` for what sets density today. If it already follows flow, drop this item.

**Size S.** It belongs to the Tube particles thread.

### 24. Stepped-back vessels become line art, not see-through (Tube)

**Principle.** A cartoon steps a thing back by drawing it with less, not by making it transparent. Transparency is also the
costly choice: the speed plan left out P4 (one pass for all tiers) because see-through vessels have to blend over the tier under
them.

**What to add, in the Tube look only.** A vessel that is dimmed (by `spot`, by a lit label set, or as the network behind a
focus) is drawn as its outline only, in a lighter ink, with no fill and no blood. A vessel behind an organ is drawn the same way,
dashed. Nothing in the Tube picture is partly transparent any more.

**Why it matters twice.**

- The picture is clearer: lit vessels are full cartoon tubes and everything else is a quiet line drawing. That is how an atlas
  steps things back.
- With no see-through vessels, one depth test can serve every tier, which is exactly what P4 needs.

**Check first.** This is a question for the Tube planner thread: whether every case of a tier's alpha under one (fades at a view
change, the veil behind organs, a fading branch's depth band) can become line art or a short dither. It also changes the picture,
so it needs a mock.

**Size M.**

### 25. Devices in the cel language (Tube)

**Principle.** Same as item 22. Catheters, wires, balloons, stents, coils, bands and the EUS scope are drawn with their own soft
shading. The visual style doc's D1 gives them one set of materials per look. In the Tube look they also need the look's line.

**What to add, in the Tube look only.** Each device gets flat tones and the ink outline at the "inside a shape" weight from item
22, so a catheter in a vein reads as an object inside a tube. The stent's struts become outline ink. A balloon gets one flat
highlight shape.

**Size S to M.** Best built after D1, since D1 makes the device colours tokens.

### 26. Three scales on one screen: anatomy with lobule and sinusoid cutouts

Mohammad's idea (10 Nov). It is a stronger form of item 13: the locator puts the whole inside the deep view; this puts the deep
views beside the whole.

**Principle.** In this disease the cause is microscopic and the effect is whole-body. Scarred sinusoids raise the resistance, and
the varices are what the room sees. Today a slide shows one scale at a time (the `scales` pill flips between them), so the room
has to hold the other two in memory. With all three up, a change at one scale is seen arriving at the others.

**What to add.** A slide field, for example `cutouts: ['lobule', 'sinusoid']`.

- The anatomy stays the main figure. A round cutout of the lobule sits beside the liver, tied to it by two thin lines from a small
  ring on the liver (a magnifier's cone). A second cutout of the sinusoid hangs off the lobule cutout the same way.
- Each cutout is the real view, drawn from the same model state, so a drug or a `whatIf` drag moves all three together.
- Tapping a cutout dives into it, with the cutout growing into the full view. That gives the dive its missing first frame.

**Rules that keep it good.**

- **One place moves at a time.** The slide names which scale is the point; that one runs its blood, and the others hold still or
  run slowly. Three moving pictures split the eye.
- **Only where it earns it.** Slides where cause and effect sit at different scales: what cirrhosis does, carvedilol against
  propranolol, the HVPG wedge, MASLD, congestion in outflow disease. Not on every slide.
- **Mac and iPad on its side only.** A phone has no room; there the `scales` pill stays.
- **Cutouts are glass of one fixed size**, placed by the same free-space rule as cards, and the figure fits the room they leave.

**Cost, said plainly.** This is the item's risk. The lobule alone sits near 21 to 33 fps at rest on the Tube renderer today. A
cutout is far fewer pixels than the full view, which helps, but three live views in one frame is still the heaviest thing the app
would draw. So: a cutout draws at its own small size, a still cutout is drawn once and kept, and only the scale the slide names
redraws every frame. Build it after the lobule's speed work lands, and read `?perf` on the first slide before adding more.

**Check first.** Whether the lobule and sinusoid views can draw into a target that is not the stage (they have their own caches
and glass), and that a cutout uses the chosen renderer with no fallback to another.

**Size M to L.** Mock one slide first.

---

## Considered and not recommended

- **A draggable before/after wipe across the figure.** It needs two full vessel layers on screen. Item 6 gives the comparison for
  one extra outline pass.
- **Haptics.** iPhone Safari has no vibration call, and the iPhone is the phone that is tested.
- **A heartbeat swing in the blood or the vessel walls.** Kept as decided: blood moves at its steady mean speed.
- **A free 3D camera or orbit.** The Tube brief is a cel-shaded flat look, not 3D tubes.
- **A chat tutor.** It needs a service off the device, which the privacy page rules out.
- **Recording a talk as video.** Turned down before: it needs a CPU pixel copy.
- **A room poll or phones following the talk live.** They need a backend. Items 3 and 8 give the room a part without one.
- **Fluid shown leaving the liver for ascites.** Reverted and not to be re-added.

---

## If these are built: who owns what

So that parallel threads do not edit one file:

| Thread | Items | Files it would own |
|---|---|---|
| Cause and ripple | 1, 10 | the factor table (new), the path pulse (new), `why.js` hook, `highlight-math.js` |
| Ride | 2 | a new ride module, the blood pass's one bright instance, a trace strip |
| Question card | 3, 7 | the question card, tile-gl's third mark, a Study way in |
| Sound | 4 | a new audio module and worklet, the Doppler and vitals cards' button |
| Puzzles and code | 5, 8 | a new puzzles data file, the Patients menu, the quick-check slide |
| Vessel shader | 6, 17, 18 | `veins-gl.js` and the shared shader text (one thread, in order; the Tube integrator owns this file today) |
| Circuit | 9 | `stage-morph.js` third layout |
| Presenter | 12, 13 | the presenter's slide change, a locator card |
| Labels thread | 11, 15, 20 and every callout above | label code (only this thread edits it) |
| Charts | 19 | chart hit-testing and the hover link |
| First touch | 21 | a new first-run module, both tester guide PDFs |
| Tube planner and its threads | 14, 16, 22, 23, 24, 25 | the Tube pass, particles, cel shader, organ paint in Tube |

Items that change the picture and should be mocked for Mohammad before a build: 9, 16, 22, 24.
