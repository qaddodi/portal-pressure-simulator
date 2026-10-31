# Changelog

## October 2026

- **Blood runs on through every junction, and the flow arrows run through it too.** (Combined plan B1 + C1, 31 Oct; Mohammad approved Part III, 1.)
  Each vessel's streaks were their own pattern, so at every join two unrelated patterns met, and the figure hid that by dimming the blood to 40 % there and taking the arrowheads away. Now a vessel whose blood comes on from another (the largest inflow at the node where its blood enters) draws that vessel's pattern carried on at its own speed (`createStreamChain` in `src/ui/blood.js`; flow texels 3 w, 4 and 5 in `veins-gl.js`), so a streak that reaches the join goes on into the next vessel and the arrowheads run through it. The dimming is gone where one pattern runs through, halved for the minor inflow at a confluence, and as before elsewhere. A link forms, ends or moves to another parent by easing (never a jump). The cava keeps its own. `?bloodchain=0` draws it as before, for one release. Code only; nobody has looked on screen.
- **The lobule's tissue is painted in the background, so the page no longer freezes while it is drawn.** (Performance review A5a, 31 Oct; Mohammad: "let's implement all your recommendations".)
  The tissue under the lobule's vessels (the plates, the zones, the collagen, the stellate cells, the nutmeg) is one bitmap of the whole lobule, up to 3600 px square, painted again when its state or its sharpness changes. It was painted on the page's own thread, which stopped everything while it ran: the 2.8 s step into the lobule after a new patient, and the 60 to 80 ms pinch repaints. Where the tissue is drawn on the GPU and the browser has a worker that can paint the same picture, it is now painted in a worker (`src/ui/tissue-paint-worker.js`, started by `src/ui/tissue-worker.js`) by the same code from the same values: the painting moved into `src/ui/lobule-paint.js`, and its calls were checked one by one against the old code across 16 tissue states. The bitmap it replaces goes on showing; the new one comes back in 512 px tiles laid a few a frame (`tissue-gl.js` begin, put, done), and once the last is in it takes over as before, crossfading from the last state. The spare bitmap painted ahead for zooming in, and the bitmap the idle preparation paints before a dive, go the same way. What looks different: a new state, or a zoom past the bitmap painted ahead, shows the old bitmap for the moment the worker takes, then the new one, instead of the page holding still. Without the GPU, without such a worker, or if the worker fails or takes longer than 15 s, the bitmap is painted on the page as before, so the headless checks paint it as they always did. Code only, nobody has looked on screen. `tests/tissue-worker.test.js`.
- **The lobule gives its old tissue pictures back to the GPU at once.** (Performance review B7, 31 Oct.) A crossfade's old picture, a bitmap replaced by the sharper one painted ahead, a snap to the patient and the trim before a wide dive freed their canvases, but their textures (up to about 69 MB with mipmaps) waited for a later sweep. They now go when their canvases do. Nothing on screen changes. `tests/lobule-gpu-free.test.js`.
- **The figure now moves with the stacked card's readings, frame by frame, under the finger too.** (Mohammad, 30 Oct, on 684b71a, which already started the camera as the card began to move: "The view still jumps on phone when I untuck the stacked card".)
  Starting the glide when the card started still left two moves side by side: the camera's own 0.4 s ease-in-out next to the card's 0.36 s ease-out. And a finger's pull slid the card over a figure that only moved once it was let go. Now the framing for the readings tucked and the framing for them out are worked out once (`stage.aimView`: the slide's own camera, asked where it would go without moving), and every frame of the card's travel sets the view between the two at the share the card has travelled (`camAt` beside each `liftTo` of the slide, the finger and the end; `stage.followAt`). A tap works out the new state once the card is laid out for it. A finger works out the other state as it takes the card at rest, with the card switched to that state only for the measure. The labels ride along as they do with a time-lapse's slow push, and are placed again once the card rests. The refit at rest then finds the view already there. This applies to a phone and an upright iPad, in every deck, on any slide framed at the fit or on a box. A catheter, a procedure's shot, a time-lapse's push, the lobule and sinusoid views, a zoomed card, a dock move and Reduce Motion keep the refit glide. Any other camera move, or a move to another slide, ends the follow. On a Mac or an iPad on its side the two framings agree, so nothing follows. `tests/fold-frame-early.test.js`. Code only, nobody has looked on screen.
- **A bleed stops once the tamponade balloon is up, and the balloon slide looks closer.** (Mohammad, 30 Oct, Variceal bleed 12: "the balloon is inflated but the varix is still bleeding. Also should zoom more on the balloon area and varix".)
  Why it kept bleeding: with the balloon on, the model's bleed flow was nil from the first step (the balloon's pressure outweighs the varix's), but the bleed stayed "active" until its clot had formed, up to 45 seconds later, and the figure, the scope, the varix card and the screen-reader text all draw a bleed from that flag, so a full balloon sat in a spraying esophagus. Now the model ends the bleed 3 seconds after the balloon is on (`BALLOON_SEAL_S` in `src/engine/engine.js`, a little over the 2.4 s the balloon takes to go in and fill: `BALLOON_MS` in `src/ui/balloon-eso.js` holds both), with its own event, "Bleeding controlled by balloon tamponade"; a balloon let down before that starts the count again, and the balloon for the other varix (gastric against esophageal) does nothing. The figure's spray and pool, and the scope's jet and pool, ease out as their own balloon fills (the figure's `sprayOn` in `src/ui/stage.js`, the scope's `bleeding` in `src/ui/instruments.js`), and come back if the balloon is let down while the model still bleeds, so Back to the slide before shows the bleed again. The gastric balloon works the same way for a fundal bleed.
  The slide's camera is its own box (695, 70 to 905, 340) round the balloon, the varix up the wall, the tear at the balloon's foot and the cardia below it: about twice the zoom of the region it used (`varices`), the ring and the label inside it as before. Code only, nobody has looked on screen. Tests: `tamponade-bleed` (the seal and its restart, both balloons, the wrong balloon, a snapshot from before, the figure's and the scope's gates, the slide's box).
- **Untucking or tucking the stacked card on an iPhone: the figure now moves with the card, from the moment it starts, instead of after it stops.** (Mohammad, 30 Oct: "The view still snaps/jumps when I untuck a stacked card on phone".)
  The 29 Oct fix smoothed the camera's glide, but the glide still began only once the readings' card had come to rest (`foldStill`, 450 ms or more after the tap): the card slid over the figure and stopped, and then the figure moved off from under it. On a slide framed at the fit, the stage's home look (`followHome`, taken on the model's frames) could also measure the card part way and glide the figure to a room the card was only passing through, before the presenter's refit moved it on. Now `setFold` frames the camera (`foldFrame`) between the card's layout and its slide, when the card already stands as it will rest and its handle is placed at its foot, so the camera glides to the final room alongside the card. The refit once the card rests finds the camera already headed there and leaves it alone. The home look waits while a slide's stacked card folds. This applies on a phone and an upright iPad, in every deck, for a tap on the handle, a pull or push with the finger, the wheel and the arrow keys. A Mac or an iPad on its side keeps the same column for the figure, so nothing changes there. Not changed: a dock of the whole card (it already framed for where it ends), a zoomed card, and the lobule and sinusoid views (they already refit when the cards announce their new room). `tests/fold-frame-early.test.js`. Code only, nobody has looked on screen.
- **The "Stent" on the right hepatic vein now has a stent: a metal mesh on the figure and its ring in the cross-section.** (Mohammad, 30 Oct, Budd–Chiari 4 "One open hepatic vein is enough": "i don't see a stent (and the cross section should show a stent too)".)
  Why it showed nothing: the figure drew a stent mesh only for the TIPS, the DIPS and shunts drawn with the stent tool, and the cross-section drew its ring only for the TIPS and DIPS, so the slide's "Stent" mark pointed at a plain vein. A slide can now list the veins it shows stented (`stented: ['RHV_IVC']`, `src/ui/decks.js`), and one setting does both. The figure draws the TIPS's mesh over the middle of the vein (`meshPaths` in `src/ui/stage.js`, shared with the TIPS, whose drawing is unchanged), unrolled from the vein's heart end over about a second while it fades in, and rolled back the same way when the next slide does not stent it. The cross-section's ring (`src/ui/tool-lumen.js`) fades in and out with it.
  It applies to any hepatic vein or the IVC, in any deck. The only built-in slide that stents one is the Budd–Chiari slide above; `tests/venous-stent.test.js` fails if a built-in mark labelled "Stent" sits on a vein without `stented`. Code only, nobody has looked on screen.
- **Tucking or untucking the stacked card eases the view on an iPhone; it no longer snaps to its new place.** (Mohammad, 29 Oct: "When I untuck and tuck card stacked on iPhone the view is snapping into new camera position instead of easing".)
  Only a phone or an upright iPad re-frames the figure when the readings come out or tuck away, because there the data card's height changes the room between the cards (on a Mac or an iPad on its side the figure's column stays the same). Two things made that glide look like a snap. The camera's glide starts right after the layout pass and the label pass the tuck sets off, which can be a long frame on a phone, and the glide was timed on the wall clock, so a long frame carried it part of the way at once (read from the code, not timed on a device). And the sinusoid view's room-glide was an exponential approach: it moved 7% of the way in its first frame, and a 200 ms frame carried it 60% of the way. Both now run on a clock that counts a frame at most 40 ms long (`src/ui/glide-clock.js`), so a slow frame holds the glide back and never skips part of it; the first frame draws the start.
  The sinusoid view's glide is now a critically damped spring (`stepView` in `src/ui/sinusoid-view.js`): it sets out from rest, reaches 60% of the way in 0.2 s and 95% in 0.47 s, and a new target (the second layout pass after a tuck) carries it on with no stop; the names, end arrows and legend ride it as before. Every refit to cards that moved takes the steady clock: the presenter's region and whole-figure framings (`fitAround`), the HVPG catheter's and a procedure's shots, the stage's home look and the Tests card's refit, and the lobule's refit to a changed room. A slide's own framing, the buttons and the long-move arcs keep the wall clock, so each still ends when the presenter waits for it.
  A layout pass that is no resize (the card finished folding, docking or settling) no longer lays out every label on the figure again and drops the stage's style snapshot: `setLabels` leaves them out when the projector size and text size are the ones it set last, so that cost no longer lands in the frame the camera's glide begins. Code only, nobody has looked on screen. Tests: `glide-clock` (the clock, and where it is used), `sinusoid-view-glide` (an ease in, a 200 ms frame at the start and a 250 ms frame in the middle, a target that moves on).
- **Varices draw as big and as strong as they are now, and the BRTO catheter keeps clear of the splenic vein.** (Mohammad, 29 Oct: "Gastric varices should visibly get smaller and less intense the less pressurized they are" and "The BRTO catheter is appearing on TOP of the splenic vein in the GRS even though should be behind it ... end the tip either a bit earlier ... or later ... Your call."; the esophageal varices followed on his standing "fix it everywhere", through the coordinator as his proxy.)
  The figure drew the varices' channels (the coronary vein and its drain; the short gastric feeder and the gastrorenal shunt) at the size weeks of remodeling had left them, while the varix itself, and its card, follow the pressure now: carvedilol took the fundal varix from 8.5 to 5.5 mm and a TIPS to 2.1 mm, and the drawing moved 5 % at most. `src/ui/varix-look.js` turns the varix's size (2 mm at rest up to 8 mm fundal or 7 mm esophageal, held in half-millimetre steps) into the drawing: the channels' width from 1 down to 0.4 (never under a channel's resting caliber), the strands fanning out from 1 down to 0.55 of their spread, and the opacity from 1 down to the faintest stack level (0.3), all eased. The two gastric presets (8.0 and 8.5 mm) and the decompensated preset (esophageal 7.2 mm) look as they did; smaller varices (CSPH, a TIPS, carvedilol) now draw smaller and fainter. The anatomy only for width and spread (the circuit's lanes keep their even width, as with the bands' shrink); the flow lens keeps its flow widths; a closed shunt keeps its ghost; band ligation's own shrink stays and the smaller varix adds to it.
  The catheter: BRTO's tip stopped 0.3 of the way up the shunt, where the splenic vein crosses it (0.30 to 0.34), so the tip and balloon lay on the vein and the catheter, which the GPU draws over every vessel, covered it. The tip now stops at 0.2, near the renal end where the balloon goes, about 36 px below the vein, so the catheter never meets it; the "Catheter in" and "Balloon up" callouts point at the new places (0.8 and 0.84 along the shunt). Code only, nobody has looked on screen. `src/ui/stage.js`, `src/ui/proc-anim.js`; test `varix-look`.
- **Camera beats: one slide can show the figure two or three ways, one per Next (`beats`).** (Recommendation E of the 29 Oct camera critique; Mohammad's go 29 Oct, "yes do it both".)
  Opt-in. The slide's own fields are the first view and `beats` lists up to two more, figure fields only (`BEAT_KEYS` in `src/ui/slide-beats.js`); the words, the data card and the model stay. Next goes through the views before the next slide (after a case card, a time-lapse and a procedure step), Back the other way; Next onto the slide opens view 1, and Back from the next slide, a jump, the list, a reload or Resume open the last. A beat clears the call-outs, makes one camera move and calls out its own (`beatMove` in `src/ui/presenter.js`, in the same loop as slide moves, so a quick Next twice lands once); a zoomed card glides back first, a scale flip ends, a refit keeps the beat's framing, and the Next button reads "Next view, 2 of 3" and stays on for the last slide's views. Every beat is walked by `tests/camera-room.test.js` like a slide. Pilot: Varices, Other collaterals: the paraumbilical vein (the abdominal wall), then the rectal varices, then both routes as the slide framed them before. Code only, nobody has looked on screen. `tests/slide-beats.test.js`.
- **A time-lapse can push the camera in slowly while its days run: `lapse: { cam }`.** (Recommendation D of the 29 Oct camera critique; Mohammad's go 29 Oct, "yes do it both", and his pick "Labels ride along".)
  Opt-in. The slide lands on its `cam`; as the days start the camera drifts to `lapse.cam` over the lapse's seconds (`driftEase` in `src/ui/cam-arc.js`: it gathers speed over the first fifth, moves evenly, settles over the last fifth). The drift is no ordinary camera move: the labels stay up and ride with the figure, carried on their sides as under a hand's zoom, never onto each other, and solved again as it lands, gliding there (`drifting` in `src/ui/stage.js`). Next finishes it with the days in 0.6 s; the end framing is measured afresh as the days end, so a grown spleen is framed whole; a refit (cards, a turn) keeps pushing over the seconds left; Back, a jump back and the first slide open on the end framing (`figView`, `fig` in `src/ui/presenter.js`). No drift with Reduce Motion or without live GPU organs (each frame would paint every organ again); one eased move as the days end instead. Pilot: Varices, Varices grow as the gradient climbs (fit to the varices). Rules in `src/ui/slide-beats.js`; code only, nobody has looked on screen. `tests/slide-beats.test.js`.
- **The HVPG against PPG plane is tidy again: no axis names, a shorter scale, quieter zones, a smaller card.** (Mohammad, 29 Oct, Sites 11, "this slide got screwed for some reason ... we shouldn't have the labels of the x and y axis ... don't stretch the x axis all the way to like 40 ... the colors should be quieter. same colors just quieter".)
  Why it broke: the rounded-plot look of 27 Oct (`fa509f7`) gave the plane's numbers and axis names the FibroScan readings' outline, 55 % black round the text, which on a picture is white text with a dark edge. On a plane the text is the card's own dark ink, so the outline smeared it into the blotches in the screenshot. The numbers and names carry no outline now, and the cut-off lines break 4 px clear of a number instead of hiding behind its outline. The first-visit criteria graph's words had the same outline (`.pzz-w`); their halo is now the card's own colour, as every other chart's words.
  The HVPG against PPG plane (Sites 11, Choose the treatment's before-and-after slide and the HVPG deck's two-gradients slide share its one definition): no axis names, only the cut-off numbers 5 and 10 along the foot and 6 and 12 up the side, HVPG to 24 (was 30; the farthest point on any slide is 16.5, and 24 keeps room on a phone's narrow plot for the Bleed risk name beside the Sinusoidal obstruction point) and PPG to 28 (was 30; the highest is 26.8), and the same blue, violet, wine and green with the blue, violet and wine at about half to two thirds of their strength in the light themes (the green was already pale and moves a touch; the dark themes as before), each still 30 apart from the others and from the card. The summary card on a Mac or an iPad on its side is narrower (48 body-text widths, never over 74 % of the screen, `--pz-rw-plane`) and its plot lower (44 instead of 52 of the screen's hundredths of height); the Stiffness plane's summary card takes the same size.
  Code only, nobody has looked on screen. `visual-plane.js`, `styles/app.css`; tests `plot-look`, `reading-cards-width`, `relation-charts`, `panels-e` updated for the new scale.
- **Two more slides ask first: Two inflows 8 and Pre-hepatic 8.** (Mohammad, 29 Oct: "go if it won't freeze or ruin anything", on the wording pass's leftover Predict slides.)
  Predict is gone, so these use the question card. Two inflows 8 asks "After a TIPS, will the artery or the portal vein carry most of the liver's blood?", and the slide plays the TIPS behind it. Pre-hepatic 8 asks "Will a partial portal vein clot raise the HVPG, the PPG or both?", and the clot fills in once the card is lifted. Pre-hepatic 8's handout question is now "does an unchanged HVPG rule the clot out?", so it no longer repeats the card. Neither slide has a preset, a case, a catheter or a procedure, and each is the only question in its deck and section, so the rules in `tests/question-card.test.js` hold. Left out on purpose: Treating the cause 6 (slide 5's case card already asks "Will cure remove her CSPH?"), Gastric varices 6 (a procedure), Pre-hepatic 3, Hyperdynamic 3 and Treating the cause 2 and 5 (each loads a preset or a vignette), and the Treatment slide the old list called 7 (Variceal bleed 7 already asks it). Code only, nobody has looked on screen. Guide 7.5 lists the two slides; `tests/deck-adopted.js` and `tests/question-card.test.js`.
- **A slide can frame the camera by name: `cam: { on: [...] }`.** (Recommendation C of the 29 Oct deck-authoring camera critique, `review/deck-authoring-camera-recs.md`.)
  Instead of a raw `[x0, y0, x1, y1]` box, a slide names what it is about: `cam: { on: ['PV_TRUNK', 'SV', 'spleen'] }`. The names are the ones `glow` takes (a vessel id, an organ, a term target, a station id, a `@set`); the camera frames the box they fill as drawn now, with the usual 8 % room for the glow (at least 30 units, so a lone station or a thin vessel still has a box), no closer than the slide's `kMax`, centred in the room the cards leave. `cam: { on: ['@collaterals'], near: 'portal' }` starts from a region and grows it to take the names in; `cam: ['portal', 'spleen']` is the union of two regions. Opt-in: every existing `cam` (a region, a box, `'fit'`, a lobule station, `'sinusoid'`) frames exactly as before, and no built-in slide is changed. The camera still glides 1.5 s, eased, and the labels fade while it moves as they do for any framing. It works for a slide's `cam`, for the anatomy view of `scales` and for a visual's `cam`; `scalesProblems` accepts the new forms.
  New `src/ui/cam-frame.js` (the sums, no DOM), `camBox` in `src/ui/presenter.js` uses it, `camOn` exported for the tests; documented in guide 5.1 and 5.10, the quick guide and the `cam` header in `src/ui/decks.js`. Code only, nobody has looked on screen. `tests/cam-frame.test.js` (forms, the 8 % room unchanged for the older framing, names resolved as `glow` resolves them, an unknown name or a bad shape in a built-in deck or in the guides' examples fails).
- **The camera makes room for everything a slide points at: its marks, labels, lit vessels, Doppler probe and readings.** (Deck authoring camera critique, recommendation 1, 29 Oct.)
  Present, every deck whose slides the camera frames by region (170 slides; the whole-figure, circuit, lobule and catheter slides have cameras of their own). Until now a slide's frame was its region plus its outlined organs, so a mark's ring, a station's label or a vessel the words light could stand outside it, off the screen, with nothing to say so. `src/ui/cam-room.js` turns each into an anchor on the plate (a label hangs from the middle of the vessel it names, as `labelAnchor` in `stage.js` places it; a mark rings the middle of its first vessel) and `camBox` in `src/ui/presenter.js` now grows the frame to hold any it misses, with 28 units of room round the nearest place. A term that lights several vessels counts as on screen when any one is, so the Endoscopy close-ups keep their frame. Twelve slides loosen, by 3 to 59 % on one side: Sites (Portal vein thrombosis 15 % wider, Right heart failure), Ascites (Budd-Chiari), Varices (Esophageal varices drain to the azygos vein 35 % taller, The burst 28 % taller), Doppler (The probe, Normal) and Pregnancy (More portal inflow) 23 % wider for the splenic vein label, Outflow (DIPS 59 % taller for the IVC and portal vein labels), Gastric varices (shunt), and Choose treatment (a3, a5 52 % taller for the IVC and right atrium labels). Code only, nobody has looked on screen. `tests/camera-room.test.js` names every slide a region leaves something out of (with the reason), fails if the frame still misses one, and fails if a frame would have to grow past 1.75 times; `slideTargets` now also hands over the groups of vessels each term and glow lights.
- **The teaching card stays put while a stacked card is zoomed, and settles where the stack needs it when the zoom closes.** (Mohammad, 28 Oct: "when the stacked cards are zoomed in (in focus) and i open untuck the stacked card, the TEACHING card in the background is reacting still by going up; it shouldn't in fact, if the stack is unstacked, and i zoom into it, the teaching card should go back to original location".)
  Mac and iPad on its side, Present, every stacked instrument card in every deck. Untucking or tucking the readings under a zoomed card used to lift or lower the teaching card and its glass behind the veil, because `liftTo` in `src/ui/presenter.js` wrote their rise on every frame. While the card is zoomed their rise is now held at the tucked place (`words.held`, `wordsAt`): the readings and the zoom still follow each other as before, and the teaching card does not stir. If the readings were already out when the card zooms, the teaching card eases down to its original place as the card glides in (`wordsGlide`: the rise is written where it ends and the card's translate is animated from where it stands, on the zoom's own ease and for as long as its glide, so the two move together). When the zoom closes, the teaching card eases to the place the stack needs, up if the readings are still out, its original place if they are tucked, in step with the card gliding back. Esc, a tap outside, a slide change and a resize all go through the same cue (`behind` in `src/ui/card-zoom.js`); Reduce Motion, a resize and the end of the talk move it at once. A Gut to heart chart's own rise (`slip.base`) counts as the original place. A pull or a slide that writes another place takes over from a glide in flight. Code only, nobody has looked on screen. `tests/card-zoom.test.js`, `tests/wide-stack.test.js`.
- **The six site ladders are the instrument itself, drawn once at its own size and scaled down whole into each cell; the card fits round them.** (Mohammad, 28 Oct, Sites 10: "each graph should look in proportions exactly as the instrument so we just fit the slide borders around; now the individual instrument graph ladders look too tall and not similar to the instrument"; then, on the first try, with the Sites slide 8 card beside slide 10: "looks wrong to me".)
  The cells had filled the card's whole height, so each chart came out about 0.8 of its width tall (the instrument's is about 0.58). The first fix laid each chart out afresh at the cell's size in the instrument's type, which left the plot far flatter than the instrument's, moved the HVPG and PPG brackets and pills (PPG on top in Cirrhosis and SOS, the pills on the line in Right heart failure) and cost the Budd–Chiari axis its ticks. Now a cell holds the chart at the instrument's own width (a card's width less its padding), type size and height (the instrument's formulas, in `--lad-w`, `--lad-f`, `--lad-h` on `.pz-cell`), and `fitChart` in `src/ui/presenter.js` scales that picture down as one piece with a transform (`chartScale` in `src/ui/tool-profile.js`), so the layout, label places, plot shape and relative type are the instrument's. The words never come under 12 px on the screen: where the scale would take them under, the picture is drawn in type larger by that much, in a box as much taller (a few percent on a Mac, about a quarter on an iPad on its side) and scaled by the same amount, and the chart is drawn again for it (`redraw` on the profile tool). The card (`.pz-panel.fill`) no longer takes the screen's height: it is as tall as its two rows and centred in the room over the nav pill. This takes back the 26 Oct lettering that grew with the cell (4.5 cqi, up to 20 px): the words are about 12 px, the instrument's type scaled with it. Sites 10 and Where-resistance 14 share the grid, so both change; a phone, upright or sideways, and an upright iPad draw each case as one line and are untouched. In `styles/app.css`; code only, nobody has looked on screen. `tests/ladders-chart-size.test.js` (rewritten for it), `tests/grid-key-phone.test.js`, `tests/data-sheet.test.js`, `docs/deck-authoring-guide.md`.
- **On a zoomed stacked card the readings come out and tuck away, and the zoom fits the whole stack as they go.** (Mohammad, 28 Oct: "allow me to untuck the card when zoomed in to instrument stacked cards and adjust the zoom ease".)
  Mac and iPad on its side, Present: with an instrument card zoomed, a tap on the handle, a pull up or down on the handle or the card (or a swipe anywhere on the veil), two fingers up or down on the trackpad, and the Up and Down arrow keys bring the readings' card out above it or tuck it away, as they do on the card at rest. The zoom is fitted again on every frame of it (`follow` in `src/ui/card-zoom.js`, fed from `liftTo` in `src/ui/presenter.js`): out, the stack is taller, so the zoom eases smaller and the whole stack stays centred and inside the screen; tucked, it eases larger again. The card's own rise with the readings is an unscaled CSS translate that a zoom's transform does not scale, so the transform makes up for the difference and the whole lands exactly in the middle at both ends. A pull follows the finger over the travel as the zoomed card shows it (divided by the zoom). The readings move only once the glide in has ended, never while the card glides in or back, and Reduce Motion moves them at once. The pictures are drawn for the largest the zoom gets. It holds for every stacked instrument card in every deck. Code only, nobody has looked on screen. `tests/card-zoom.test.js`.
- **A stacked instrument card zooms whole and centred, and the card zooms while a time-lapse plays.** (Mohammad, 28 Oct, a stacked Doppler card zoomed: "this is a stacked card; the zoom is glitchy. fix; also it doesn't want to zoom while a timeline is going", then "like timeline skipping forward".)
  The glitch: a stacked card (instrument card with the readings' card tucked behind it, Mac and iPad on its side) was measured while it was up. The zoom makes the card report the place it rests, so the measure of how far the readings travel read none (`--pz-d` 0): the tucked readings' room opened above the header as a big empty glass, the card grew past the plan and ran off the bottom. A zoomed card is no longer measured (`measureUnder` in `src/ui/presenter.js`); it is measured again the moment the card is back. The handle on the card's top edge now counts in the box that is centred and fitted (`src/ui/card-zoom.js`), so the whole card sits in the middle, not the card's box with the handle hanging over it. This holds for every stacked instrument card in every deck; a card with nothing to tuck behind it is as it was.
  The time-lapse: the slide's move stayed busy until the days had played, and a busy move allowed no zoom. The slide stands whole once it has landed, so the card may zoom while its days (or its answer) play on the live figure; Next still skips the days forward with the card zoomed, and the next slide, or a slide asked for meanwhile, glides it back first instead of snapping it. Code only, nobody has looked on screen. `tests/card-zoom.test.js`.
- **The zoomed card no longer moves the liver or anything behind it.** (Mohammad, 28 Oct: "the zoom moves the liver in the background; don't move anything; I actually like the zoom as is, without moving the liver and background stuff".)
  The figure used to come in 6 % toward the card as it zoomed. That push-in is gone (`PUSH` and the figure's holder are out of `src/ui/card-zoom.js`): only the card and its handle move, and the veil still dims the rest. Everything else about the zoom is as it was. Code only, nobody has looked on screen. `tests/card-zoom.test.js`.
- **The instrument's data card zooms to the middle of the screen.** (Mohammad, 28 Oct: "display it bigger when clicking on it directly; however it shouldn't like make the text smaller. the camera should like zoom on the card to display it centered large in middle of the screen"; "VERY subtle and clean" icon; "will the instrument card and the physics engine and everything keep running while zoomed? i vote yes.")
  Mac and iPad on its side, in Present: a tap on an empty part of the card, or the small corner brackets at the right end of its header row, glides the card to the middle and grows it as one piece (up to 2.2 times, never past the room the screen leaves), so its words and pictures only get larger. The readings' card stays tucked behind it, the handle riding on its edge. A veil dims the figure and the words (the figure itself stays exactly where it is); a tap on the veil, on the card, on the icon, Esc, or a slide change (the card glides back first, then the slide runs) puts it back. Sliders, buttons, pills and the handle keep their own taps; a drag is not a tap. Nothing pauses: the instrument, the model and the figure run on, and the canvas pictures are drawn for the size they are seen at (`setCanvasBoost` in `src/ui/util.js`). Only the layout waits while the card is up (`zoomHeld` in `src/ui/presenter.js`; one pass runs when it is back), and the card and its handle report the places they rest, so the figure's labels and the camera keep still. The corner credit sits out the glide as it does a slide change; Reduce Motion moves the card at once. Phone and upright iPad are unchanged. `ZOOM_OPENS_READINGS` in the presenter brings the readings out as the card zooms (off). New `src/ui/card-zoom.js` (plan, tap, controller), the icon `i-shrink` in `index.html`, `.pz-zscrim` and `.pz-zbtn` in `styles/app.css`; `tests/card-zoom.test.js`. Code only, nobody has looked on screen.
- **Blur effect off: a lit lobule or sinusoid name keeps its pill instead of a glowing cloud.** (Mohammad, 28 Oct: "the non blur effect in the lobule sucks ... it looks childish now, i don't like the glow".)
  With the blur off, the lit names in the lobule and sinusoid views (Portal venule, Sinusoids, Central vein, the zones and the sinusoid's own names) sat in a soft coloured cloud. They now show the pill they
  have with the blur, same box and ring, the 18 % tint laid on the solid surface as the cards are, so nothing glows and nothing about the labels' spacing or easing changes. The other glows the setting added are
  gone too: the lobule's resistance and problem pills keep their solid fill and white words, and the figure's focus and term labels keep their usual pill and colour, as with the blur on. The Settings hint
  and the README no longer say "glowing labels". In `styles/app.css`; code only, nobody has looked on screen. `tests/blur-off-labels.test.js`.
- **The sinusoid view glides when a data card tucks, untucks, hides or docks, names and arrows included.** (Mohammad, 28 Oct: "in the slide decks, on iphone and upright ipad, in sinusoid view, when opening and closing data cards, tucking, untucking, hiding, the whole view jumps instead of transition/ease/glide".)
  The vessel always glided to its new centre (`stepView` in `src/ui/sinusoid-view.js`), but everything laid against the room the cards leave (the Portal venule and Central vein names and their arrows, the legend, the band the other names are spread over, the names' keep-in limits) was laid against the room where it comes to rest, so it stood there at once while the vessel was still on its way. The free room and the insets under the top bar and above the words now ease with the centre and scale they fit (`VW.fe`, `VW.ins`), and every name is laid out against that each frame. Runs on the real view in node (a stand-in DOM and frame scheduler) over a phone, an upright iPad and a wide screen: before, the portal venule's name moved 150 px in one frame (320 px with the card hidden on the iPad, 376 px for Disse's name on a wide screen); now each frame moves a share of the way. Also: on a wide screen the fenestrae's and Disse's names, which are placed for the view at rest, and the pore the Fenestrae callout ends on, catch up with the view's glide instead of stepping (`noteJumps`); a card change (`pps:occ`) wakes a sleeping view; and a view still gliding no longer counts as settled (a paused simulation could leave it half way). The lobule already glides its framing (`refit`, `glideTo`) and carries its names with it, and was not changed. Code only: nobody has looked on screen. `tests/sinusoid-view-glide.test.js`.
- **The Ascites relation chart is now the course after the tap: the fluid day by day, with the grades as zones.** (Mohammad, 27 Oct: "ughhhh" on the HVPG curve; he picked J of the mocks, "more smooth", "show 1.5 and 5 are liters".)
  "Ascites after the tap" (Ascites, the slide before the summary) replaces the HVPG curve. One patient, the one from the Tense ascites and Large-volume paracentesis slides, day by day from the tap: the tense belly as a
  dot, the tap emptying the belly, the fluid refilling for two weeks with nothing done (grey), then diuretics alone and diuretics with a TIPS from that same day for four weeks, each in its own colour with its name at
  its end. The line runs smoothly through the model's own number for every day and never overshoots one. The grades are the plot's zones (None, Grade 1, 2, 3, the app's own bands), each named on its own band (his 17:34Z: "so much wasted space on the left of the y axis", so the left strip is only the numbers
  now, 0, 1.5 L and 5 L, 48 px on a phone against 102); the x axis is in weeks, the tap named at 0. A new chart kind in `src/ui/tool-course.js` (`tool: { kind: 'course', from, event, wait, after, then, words }`, registered in `ext-model.js`,
  zone colours `.pco-z` in `styles/app.css`); the days are worked out once on the presenter's worker and kept, started when the deck opens. A name with no clear spot beside its line stands in a key row under the
  caption, and "Treatment starts" (with its upright line) and any grade name with no clear spot are left out on a card too short for them. The slide's line quotes the Two weeks later and Treatment slides' own numbers, and the notes say the speeds are the
  model's, not a patient's (the model has no kidneys); nothing says how fast a TIPS clears ascites. The HVPG curve's options stay in `tool-curve.js` for other decks. Layout was run on the real chart code in node
  (a stand-in DOM, the model's own numbers) at card sizes from 250 × 170 to 700 × 330 px, with no word on another word, a line or a dot; code only, nobody has looked on screen.
  `tests/relation-ascites-chart.test.js` (rewritten for it), `tests/deck-adopted.js`, `docs/deck-authoring-guide.md`, `docs/deck-authoring-quick-guide.md`.
- **The Ascites relation chart reads at a glance: one line, the visits named and joined by arrows, an axis that says what it is.** (Mohammad, 27 Oct: "what are the dots? it's so busy", "no idea what x axis is", "it's completely illegible".)
  The chart ("Ascites by HVPG", Ascites, the slide before the summary) draws only the ascites now: the blood volume, its second axis, the blue ring that floated off the line, the live values in the key row and the
  numbers-and-key for the dots are gone (the notes still quote the blood volume's half liter). His three visits, Tense belly, Diuretics and TIPS, are named on their dots, joined by the dotted walk with an arrowhead on
  each step (so the order reads as a path, not as a time axis), the HVPG axis runs on to 22 so the names have room to the right of the dots, and the ascites cut-offs stand as the axis numbers, 0, 1.5 and 5, with
  "Grade 2" and "Grade 3" over their gridlines. In `src/ui/tool-curve.js`, for every relation chart: `ring: false` (no ring for a slide with no state of its own), `cutTicks` and `cutNames` (cut-offs no even scale can
  hold become the axis numbers; names for them), the arrowheads on every walk (`walkArrow`), an HVPG axis written "HVPG (wedged − free), mmHg" and the HVPG 10 line named "CSPH ≥10", the x cut-offs' names placed before
  the dots' names (which have sixteen ways round their dots) so a name no longer lands on one. Layout was run on the real chart code in node (a stand-in DOM, the model's own numbers) at card sizes from 315 × 170 to
  700 × 330 px, with no word on another word, a line, a dot or an arrow; code only, nobody has looked on screen. `tests/relation-ascites-chart.test.js`, `tests/relation-chart-declutter.test.js`,
  `tests/relation-charts-batch-a.test.js`.
- **The two Explore charts, Along the circuit and Over time, sit on the rounded plot panel.** (Mohammad, 27 Oct: the G2 look for the graphs, Explore dock.) Both are drawn on a canvas, so
  `src/ui/plot-look.js` gained `plotFill(ctx, x, y, w, h, fill)`, the same rounded panel the slide charts use, in the same tile tone (`--surface-2`), 10 px corners. The panel is the chart's
  whole box. The axis numbers stand in a strip inside its left edge, 8 px in, 6 px clear of the lines (as wide as the widest number: two digits, three only as the pressure axis passes 100,
  eased in); the unit, the station names, the times and the readings at the right end all stay 8 px or more inside it; the separate axis line under the profile is gone (the panel's edge and
  the grid's bottom line are the axis); the grid hairlines use the stronger border tone so they read on the panel; the plates behind cut-off names, the dots' rings and the markers' halos
  take the panel's tone, so no patch shows. Over time is also the slide `beats` card, so it changes the same way in Present and Patients. Code only: nobody has looked on screen.
- **The faint line round the lobule's tissue is gone, and the Fenestrae callout no longer sits on the stellate cell's name.** (Mohammad, 27 Oct: "fix the seam on the left side (it's a
  square/rectangular seam around the lobule); this also appears in other lobule view in decks", and "fix the callout for fenestrae; it's competing with the stellate cell call out".)
  The seam, measured in his screenshot of Lobule 5/9, is a line one device pixel wide at 1.28 R from the lobule's centre, the edge of the tissue's bitmap (a 2.6 R square, drawn on
  the GPU by `src/ui/tissue-gl.js`). The shader looked the bitmap up inside the test for being in its box, where the derivatives that choose a mipmap level are undefined, so a pixel
  along the edge could take the coarsest level, the bitmap's average colour (diagnosed from the screenshot and the code; no GPU ran here). The lookups now carry their own gradients (`textureGrad`), and the outermost two device pixels of
  the box fade out. Every lobule view in Present, Patients and Explore draws through it. On a wide sinusoid view the Fenestrae pill was set beside the stellate name and, when they
  overlapped, shoved up by the declutter step while its leader still ran down through the stellate name. `src/ui/fen-place.js` now places the pill, its pore and the Space of Disse's
  name together, in the view's resting frame: the pill keeps a gap of at least 2 × 16 px from the stellate name, its leader ends at the pore that stays open longest (so an open pore
  even at 15 % open) that no nucleus covers, and the Disse name keeps clear of the pill, its leader and the stellate name, inside the free stretch (before, it could be pushed to the
  edge of the screen). A view too narrow for all three places the pill alone, then the old steps. Open or closed fenestrae, any name length, Present, Patients and Explore, and every
  wide screen size are covered; the portrait layout, whose names sit in their own rows, is as it was. Code and unit tests only; nobody has looked on screen. `src/ui/tissue-gl.js`,
  `src/ui/fen-place.js`, `src/ui/sinusoid-view.js`, `tests/tissue-gl-edge.test.js`, `tests/fen-place.test.js`, `tests/tissue-gl.test.js`, `tests/lobule-surround-grey.test.js`.
- **The FHVP and WHVP callouts' backgrounds leave and move with their words.** (Mohammad, 27 Oct: "the callouts for FHVP and WHVP backgrounds glitch; sometimes remain on slide when
  next slide is transitioning, sometimes they're slow to move".) Each callout's frosted background is drawn on the GPU, on a canvas beside the callout layers
  (`src/ui/glass-gl.js`), from what the page says about that callout. Two things reached the words but not that background. When the catheter went (a slide that leaves the
  procedure, the end of a talk, a finished measurement), the whole layer of readings faded as one, which the background never saw: the pills stayed solid until the
  readings were removed, after their words had gone. The readings now leave as every other reading does, each one's own children fading, so the background fades with its
  words; the glass also takes the opacity of everything that holds it up to its layer, and no longer goes to sleep while a script's fade is still running in the layers (that
  fade sends no event). And when the two readings travelled into the HVPG summary, their move was a CSS transition, which the browser runs a frame ahead of anything the page
  draws, so each background trailed its words by a few dozen pixels at the start of the move. The offset is now worked out and written each frame, on the same thread as the
  glass (`src/ui/cath-flip.js`), with the same curve (`--ease`) and the same 0.6 s, so nothing about the look of the move changes. This applies wherever those readings show:
  the HVPG deck, Measure › HVPG, the treatment procedures (TIPS, BRTO, BATO) and the Budd–Chiari slide, on a Mac, an iPad and a phone; the measuring sites' callouts and the liver
  pane's glass share the glass changes. Code and unit tests only; nobody has looked on screen. `src/ui/stage.js`, `src/ui/glass-gl.js`, `src/ui/cath-flip.js`,
  `tests/glass-follow.test.js`.
- **The HVPG against PPG plane names its two red lines.** (Mohammad, 26 Oct: "make it clear that the 10/12 line is clinically significant portal hypertension", then "keep it 4 quadrants;
  just label the 10/12 line".) The HVPG 10 line is named "CSPH ≥10" and the PPG 12 line "Bleed risk ≥12", each beside its own line, on Sites and causes, Where HVPG misleads and
  Choose the treatment. The four quadrants and their colours stay as they were. Only the HVPG line defines CSPH (Baveno VIII; AASLD 2024 statement 4: HVPG ≥10 mmHg); the PPG 12 line
  is where the risk of bleeding rises and the gradient a TIPS aims under (AASLD 2024: no beta-blocker after TIPS under 12 mmHg), so the plane never calls it CSPH, and the notes say
  so. Also, a name that sat as near another point as its own (Portal vein thrombosis, three lines above its dot, against Schisto's name beside it) now goes to its short name beside
  its point or a place plainly its own. Code and unit tests only; nobody has looked on screen. `src/ui/visual-plane.js`, `styles/app.css`, `tests/plane-callouts.test.js`,
  `tests/panels-e.test.js`.
- **The six site ladders (Sites 10 of 12, Where-resistance 14) draw each chart larger inside its cell: bigger type and heavier lines, the card as it was.** (Mohammad, 26 Oct:
  "this slide could use larger diagrams", then "bigger doesn't mean the card is bigger; I mean keep what it was before but each individual card graph should be bigger; like bigger
  lines/text", then "I want larger text size on it, or for it to look bigger".) The card, its width, side padding, 1560 px cap and the room above the nav pill are unchanged. On a Mac or
  an iPad on its side each chart's lettering (axis numbers, station values and names, zone words, HVPG and PPG brackets and pills, the brace) is now 4.5 cqi of its cell's width,
  at least what it was, held by the cell's height (1.86 of the screen's 1 % less 1.2 px, about the chart's height over 17.7) and at 20 px: 14.6 to 19.5 px at 1877 x 1137, 13.9 to 18.9
  at 1920 x 1080, 12.8 to 17.4 at 1728 x 1000, 12 to 15.5 at 1440 x 900, 12 to 14 on an iPad at 1180 x 820, 12 to 13.5 at 1440 x 790. The room comes from inside the card, not from
  its size: the gap under the title, the foot, the gap between the two rows and each cell's top and first gap are shorter (about 27 px more height per chart at 1877 x 1137), and the
  zone words ("PRE-HEPATIC", "INTRAHEPATIC", "POST-HEPATIC") stop growing past 16 px and ease down to 13 (`zoneSize` in `src/ui/tool-profile.js`), so the strip over the plot stays one
  short line instead of two while the numbers, stations and brackets grow; a chart of 16 px or less, every other chart the data card draws, is as it was. The lines grow with the
  type, never thinner than before: the line 3 px to 0.2 em (3.9 px at 19.5), the healthy and earlier lines, the brackets, the brace, the axis and the gridlines in the same proportion;
  the value halos stay 4 px, as the label placing counts them. The brace and "mmHg" stay: they share one row, so dropping them would give back no height. Where a larger chart has no room for
  the brackets in its plot they stand in the band at its foot, as before. A phone, upright or on its side, keeps its strips. Code and unit tests only; nobody has looked on screen.
  `styles/app.css` (`.pz-cell`, `.pz-panel.fill`), `src/ui/tool-profile.js`, `tests/ladders-chart-size.test.js`, `tests/ladder-pills.test.js`.
- **The lobules around the one in focus are grey in every lens but Pressure, like the liver they come from.** (Mohammad, 26 Oct: "when zooming out of a gray liver in the decks or
  elsewhere when we're choosing a different lens than pressure; the surrounding lobules should also be gray as the color of the liver".) In Colored by oxygen, Blood origin, change
  and the other lenses the organs in the anatomy are grey, but the neighbouring lobules kept the pressure lens's pinks: the field that comes in through the dive and the way out, the
  tissue round the open lobule, and the thin ring of it the dive's copy keeps. They now take the organs' own grey (saturation 0.12, opacity 0.72, `LENS_GREY` in `src/ui/organ-dim.js`,
  the two numbers `stage.js` greys the organs with), laid over the finished picture in the field's and the tissue's shaders and in both 2D fallbacks, so a lens switch needs no new
  tiles. It eases over the lens crossfade, and is there at once where nothing of the surround is seen yet (a dive not begun, the lobule drawn ahead). The lobule in focus keeps the
  lens's colours, and Pressure draws exactly as before. Code and unit tests only; nobody has looked on screen. `src/ui/lobule-zoom.js`, `src/ui/field-gl.js`, `src/ui/tissue-gl.js`,
  `src/ui/lobule-look.js`, `src/ui/lobule-model.js`, `src/ui/organ-dim.js`, `tests/lobule-surround-grey.test.js`.
- **Relation charts for eight more talks.** (Mohammad, 26 Oct, "I love the plan for relationship slides. please implement all!!!"; review/relation-chart-ideas.) One slide with kicker
  `Summary` and id `relation` in Circulation (last in the talk, which has no table: the HVPG and the PPG as scarring builds, with the HVPG's 5 and 10), Doppler (the portal vein's velocity and
  flow against the HVPG: still normal at CSPH, under 15 cm/s only from about 16), The circulation in cirrhosis (output and arterial pressure against the HVPG), Outflow (the free hepatic
  vein pressure and the HVPG against stiffness as an IVC web narrows, heart failure and constriction as points on the same line: the HVPG stays under 2 mmHg), Presinusoidal portal
  hypertension (the PPG and the spleen against stiffness, the schistosomiasis ring far above the cirrhosis line), Gastric varices (the fundal varix with the shunt open and closed and the
  esophageal varix with it closed, against the HVPG), Encephalopathy (the PPG and the liver's flow against the stent's width) and Doppler of TIPS (the PPG and the portal vein's velocity
  against the stent's narrowing, 12 mmHg at about a third, under 30 cm/s at about half). Two choices differ from the recommendations: Outflow's x axis is stiffness, not the right
  atrial pressure, because an IVC web raises the liver's pressure with the right atrium normal; Encephalopathy charts the liver's flow, not the HE index, which is past its 0 to 1 tile
  after a TIPS (1.2 at every width here). New curve option: an `against` sweep may carry `of: '<reading>'` to draw another reading on the same scale, and `reading` names the key row
  and the cut-offs. Pregnancy keeps the relation chart it has. `tests/relation-slides-b.test.js` pins the numbers the words and notes quote; the handout figures are stand-ins copied
  from a neighbouring slide until `scripts/handout-figures.mjs` runs. Code and unit tests only; nobody has looked on screen. `src/ui/tool-curve.js`, `src/ui/decks/`, `docs/`.
- **The figure's numbered markers also show in the teaching card's words.** (Mohammad, 26 Oct, "the labels 1, 2, 3, 4, etc. should also show up in the teaching cards in a
  similar way as they appear in the figure".) A slide with `steps: true` numbers its glow on the figure with black circles; its line now names each step with the same circle,
  written `{#1}`, `{#2}` straight after the words that name that site ("the gut and spleen's capillaries (1), the liver's sinusoids (2)"). The marker is the figure's own look
  (a dark circle in the theme's ink, a light numeral), sized from the line's type with the numeral never under 12 px, set inside the line's own spacing so no line grows, and it
  keeps its word and the stop after it on one line. It is no word in the 30-word count and no value (a typed number with a unit keeps its automatic pill); the Print notes
  handout writes it "(1)". On for the three slides that number their glow: Circulation 3 of 8 ("Gut blood crosses two capillary beds in series"), the Sites overview (five steps, now
  worded for them: "...through the portal veins (2) and the liver's sinusoids (3) to the systemic veins (4) and the heart (5)") and the preview-only demo deck's route slide.
  `tests/step-markers.test.js` fails a numbered slide whose line misses a step, repeats one or numbers a step the figure lacks; both authoring guides say so (6.5, 5.9, the quick guide).
  Code and unit tests only; nobody has looked on screen. `src/ui/presenter.js`, `src/ui/handout.js`, `styles/app.css`, `src/ui/decks/circulation.js`, `src/ui/decks/sites.js`, `docs/`.
- **The first-visit rules card puts the platelets with the kPa, and every comparison in the app is a symbol.** (Mohammad, 26 Oct, "we should really have the platelet count next to
  the kPa column... also don't be shy to use > symbol instead of 'more than'... something 150,000+, sometimes 'more than'".) Stiffness 5 ("Baveno VIII at a first visit") had the
  platelets only inside each rule's sentence, away from the kPa cut-off. A criteria row now takes `and`, a second condition set small under its cut-off in the same cell:
  "≤15 kPa" over "platelets ≥150,000/µL", and "<20 kPa" over the same, with the row's words saying only what follows ("CSPH ruled out", "Scope skipped, even with no carvedilol");
  a screen reader reads that cell, since the words no longer repeat it. Every comparison written as words is now `>` `<` `≥` `≤` with no space: the cut-off column of every criteria card
  (HVPG ≥20 mmHg, Child–Pugh B >7, ≥3 large taps, ≥2 events, "for >6 months"), the summary tables' cut-off headings (`CUT`) and the HVPG response tile ("<10%"), titles, lines and quick
  checks in 23 decks ("5 or more", "at least 6 months", "under 15 cm/s", "150,000/µL+" and the like), the legend's ends ("≥12", "≥15"), the instruments' tooltips, the stiffness
  plane's zone notes, About, the model's check list and the preview-only demo deck. A cut-off pill in the words keeps its sign (`{>=10 mmHg}` reads "≥10 mmHg"; the automatic pill
  takes a sign typed before a value), so the words beside it that said "above"/"at or above" are gone. Left as prose on purpose: the speaker notes (the Print notes handout), a
  comparative with no number ("lowers the HVPG more than propranolol"), a duration in a case story, the screen-reader-only labels, and one range edge ("Above 10 to 12 mmHg").
  `tests/comparison-symbols.test.js` scans every deck's words so the words cannot creep back; the authoring guide (6.2, the criteria card, the tile table) and the humanizer say so.
  Code and unit tests only; nobody has looked on screen. `src/ui/tool-criteria.js`, `styles/app.css`, `src/ui/presenter.js`, `src/ui/handout.js`, `src/ui/table-marks.js`,
  `src/ui/decks/*.js`, `docs/`.
- **The © credit finds its spot without reading the figure again after each camera move.** (Reviewer's smoothness brief, T04; Mohammad, 26 Oct, "ok do it".) After the camera rested, the credit
  read every organ, fluid and vessel shape from the page and drew them onto a canvas it read back, about 11 ms a look. On the GPU figure it now reads the shapes once, keeps their
  outlines and matrices, and draws a grid in the figure's own coordinates over the view and a margin; a pan or a zoom inside that margin only maps the credit's candidate boxes into the
  world and looks cells up (`src/ui/credit-art.js`), with no shape read and no pixel read. The shapes are read again only after one changes (a watch on the art's groups, not on the
  camera) or after 15 s; a far pan or a big zoom draws the grid again from what was kept. The cells are never coarser than before (3 to 6 px on screen), so the credit keeps the same
  distance from the art, and the lobule, Lite graphics and a grid over the cap keep the old screen grid. The `?perf` readout counts shapes read, grids drawn and grids kept.
  Code and unit tests only; nobody has looked on screen. `src/ui/credit-art.js`, `src/ui/credit.js`, `src/ui/gpu-probe.js`, `docs/PERFORMANCE.md`, `tests/credit-art.test.js`, `tests/dom-shim.js`.
- **The spleen ultrasound is gone, and Stiffness 4 of 13 shows the spleen on the figure again.** (Mohammad, 26 Oct, "i hate it; need to fix slide 4/13 stiffness".) The `spleen`
  tool kind (deck rebuild A4) is removed with its picture, its card sizing and its tests; the Stiffness and Gastric varices decks were the only two slides that used it. "A large
  spleen sequesters platelets" goes back to what the slide showed before the ultrasound: the figure's calipers and the dashed normal-spleen outline, with the spleen and platelet
  tiles (rings from the fibrosis slide) beside it. Its line now points at the outline ("The dashed outline is a normal spleen. Hers measures 15.5 cm and traps platelets, which
  have fallen to 90,000/µL."), and the sentence about the falling count moved to the notes. "Treat the spleen, and the varices empty" keeps its three compare buttons and its varix
  and platelet tiles. `?script=spleen` still opens Stiffness. Code and unit tests only; nobody has looked on screen. The two handout pictures for these slides (`brand/handout/stiffness/spleen.webp`,
  `brand/handout/gastric-varices/splenectomy.webp`) show the old card and are on the redraw list. `src/ui/spleen-us.js` (deleted), `src/ui/presenter-tools.js`, `src/ui/decks.js`,
  `src/ui/decks/stiffness.js`, `src/ui/decks/gastric-varices.js`, `styles/app.css`, `tests/deck-adopted.js`, `tests/instruments-a4.test.js`, `tests/instruments-draw.test.js`,
  both authoring guides.

- **After a pan or pinch the figure's extra work waits its turn: one small shared allowance, nothing optional during a gesture.** (Reviewer's smoothness brief, T03 and T15;
  Mohammad, 26 Oct, "ok do it".) The organ pictures made sharper after a zoom each took 6 ms of painting a frame, a strip's drawing and read-back on top, and went on while the
  figure was still moving. They now take turns, one step a frame, from 1 ms a frame (`src/ui/refine.js`; `?refinems=` tries another), only in frames outside a gesture, and
  the longest step is listed by layer in the `?perf` readout. Shader programs that finish compiling mid gesture are published after it, the vessel renderer's optional programs
  likewise, and the palette, presenter and dock modules are read in one at a time once the page has been left alone (`src/ui/quiet.js`, one clock of input for the app).
  Code and unit tests only; nobody has looked on screen. The sharp view picture can take a few seconds longer to arrive than before. `src/ui/refine.js`, `src/ui/quiet.js`,
  `src/ui/stage.js`, `src/ui/gl-compile.js`, `src/ui/veins-gl.js`, `src/ui/main.js`, `docs/PERFORMANCE.md`, `tests/refine.test.js`, `tests/quiet.test.js`.

- **The "Look first for" card and every plain-list criteria card get a mark per row and key words in ink.** (Mohammad, 26 Oct, "we need to fix this card to look much better", then
  his pick "C with D's key words" from the mocks in `review/look-first-card-ideas`.) A list with no cut-off column now puts a ring at each row's left, for a thing to check; the ring is
  filled on the row that applies to the case or that the model meets (outlined is the rule, filled is the case, as the rule pill), and its fill eases with the reading. A list that says
  "In this order" takes numerals instead (`ordered: true`, Encephalopathy after a TIPS). The rules are a step larger, the key words in each row (`**...**`) in ink on the quieter words, and
  they go quiet themselves when one row applies. "Treating them comes first." moved from above the Look first for list to its foot (`verdict`), where "them" has something to point at.
  Ten cards in seven decks: Encephalopathy, Pregnancy (2), Shunts (2), Gastric varices, Ascites, Ten years (2) and Recompensation. The four table cards keep their cut-off column. The
  no-dots test names the row marks as an exception on purpose. Code and unit tests only; nobody has looked on screen. `src/ui/tool-criteria.js`, `styles/app.css`, the seven decks,
  `tests/teaching-features.test.js`, `tests/no-status-dots.test.js`, the authoring guides.
- **The teaching card's words hold still while a what-if slider moves, on a phone and everywhere else.** (Mohammad, 26 Oct, "When using sliders on teaching cards on phone the text of the
  teaching card jitters a lot".) Three causes found by reading the code. The slider's value and the time-lapse's "Day 12 of 30" counter were plain text in a box that took the
  width of whatever they said, so a digit coming or going changed that box's width, and with it the room the label row or the bar beside it had; each now stands in a box as wide as
  its widest words, with a hidden copy of them laid over the live words in one grid cell, in tabular figures (`src/ui/live-text.js`, `.pzv`). The card's fit signature read those
  words too, so a digit more or less asked for a fresh fit; it now leaves them out (`wordsOf`). And a slider that moves an instrument's option instead of the model (Endoscopy 3 and
  5, the air pressure) never set `liveOff`, the flag that keeps the cards' plan while only readings change, so a scope reading that measured the data card a hair different could lay
  the cards out and fit the words again; every what-if slider now sets `handOn` on its first move (cleared with the next slide), and `readingsOnly` and `cardsStill` count it.
  The authoring guide follows. Code and unit tests only; nobody has looked on screen. `src/ui/live-text.js`, `src/ui/presenter.js`, `styles/app.css`, `tests/live-text.test.js`,
  `tests/card-text-lock.test.js`, `docs/deck-authoring-guide.md`.

- **The HVPG pressure trace moves out of the words into a data card on slides 3 to 5 of HVPG and PPG.** (Mohammad, 26 Oct, "move the HVPG monitor into an instrument data
  card ... keep the teaching card without it".) Free, Wedged and Result now carry `tool: { kind: 'hvpg', catheter: true }` instead of `monitor`: the same black tracing sits
  in the data card under the words, follows the catheter on the figure (its balloon sets the pressure's rise, the slide's readings are the callouts' own) and stays on screen
  from one of the three slides to the next while only the words swap (card-keep.js; the catheter card is the one catheter slide that keeps its data card). The teaching card
  holds the words and, on Result, the equation. No other built-in talk used the teaching-card trace; the `monitor` field still works for decks of your own. The authoring
  guides follow. Code and unit tests only; nobody has looked on screen. The three handout figures (`brand/handout/hvpg/free`, `wedge`, `hvpg`) still show the figure
  alone until redrawn. `src/ui/tool-hvpg.js`, `src/ui/presenter-tools.js`, `src/ui/presenter.js`, `src/ui/card-keep.js`, `src/ui/decks/hvpg.js`, `tests/`, `docs/`.

- **The menu leads with twelve core talks; the other sixteen are under "More talks".** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, G1 and G2.) The five
  topics list Circulation, Circuit, Sites and causes, HVPG and PPG, Doppler, Stiffness, Varices, Insufflation, Variceal bleed, Next bleed, Ascites and Encephalopathy, in
  teaching order; a sixth group with the same heading holds the rest, and search still finds all 28. New `tests/deck-shape.test.js` keeps every built-in talk to two lenses,
  steady tiles between neighbouring slides with the same instrument, two tiles a slide, no `cite`, a `caveat` only on the TIPS Doppler jet slide and lines of 30 words or
  fewer (it replaces the 45-word test); its allowlists are commented and fail when an entry goes stale. To pass it, 22 lines were cut to 30 words (the dropped clauses moved
  to the notes), and the pregnancy sources and three caveats moved into the notes. The authoring guides follow. Words went through the AI humanizer; no new UI. Code and unit
  tests only; nobody has looked on screen. `src/ui/decks.js`, `src/ui/decks/`, `tests/`, `docs/`.

- **The Spleen and the Doppler after a liver transplant talks are gone.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, F7.) The spleen's teaching already lives in
  Stiffness (the spleen's size and the platelets) and Gastric varices (the splenectomy slide, with its three-way compare, now tested there). The transplant Doppler talk's
  cases were the least used; the Doppler talk keeps the basics. Old links keep working: `?script=spleen` opens Stiffness and `?script=transplant-doppler` opens the Doppler talk
  at slide 1, as do their share pages. The app has 28 talks, was 30; the menu lost both rows. The words and design needed no pass because nothing new was written.

- **Treating the cause: the weight-loss patient is one slide.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, F6.) The MASLD cirrhosis patient and the
  weight loss slide are merged: her case card (BMI of 34, a stiffness of 15 kPa, platelets of 136,000/µL) opens the year of weight loss, and the stiffness and platelets
  play out after the card lifts. The talk is 7 slides, was 8; the gray-zone and ANTICIPATE-NASH teaching moved into the slide's notes, the 25 kPa question stays in
  the deck's quick checks, and the summary table reads her start from a preset row. The words went through the AI humanizer and nothing was looked at on screen.

- **The foundations talks shed the slides other talks teach.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, F5.) The portal circulation loses "One
  patient, five ways to color the vessels", the meal and the summary table (the meal is Portal pressure as a circuit's); its Gut to heart chart is the one
  card from the two capillary beds to the definition, including the lobule and sinusoid slides, and the talk is 6 slides, was 9. Portal pressure as a circuit
  loses the propranolol and carvedilol slide (Lowering portal pressure teaches the drugs): 8 slides, was 9, its summary table one row shorter. The liver's two
  inflows loses the hepatofugal slide (the Doppler talk's first case shows reversed flow) and keeps the hepatic artery clot, the only clotted-artery slide the
  app has now; the talk reads in the origin lens and the pressure lens, the buffer slides in pressure and the Oxygen button for the sinusoids. `cite` and the
  caveat moved into the notes, and lines were trimmed to 30 words. Tests: the shipped-pair floor in card-keep.test.js went from 300 to 200 because it
  counts the shipped slides (about 290 now) and checks no behaviour; the tests that read a dropped slide follow it (the Oxygen test reads the
  hepatofugal preset itself). Both humanizer passes were done: no new UI. Code and unit tests only; nobody has looked on screen. `src/ui/decks/circulation.js`,
  `circuit.js`, `two-inflows.js`, `tests/`, `brand/handout/`.
- **Decompensation and recompensation: seven slides, and the cure slide reads the HVPG monitor.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan,
  F4.) The carvedilol slide leaves, because Lowering portal pressure teaches the drug; Baveno VIII's advice to cut or stop a beta-blocker when the blood
  pressure stays low or the kidneys fail moved into the diuretics slide's notes, and the talk's chart, summary table and objectives no longer name
  carvedilol. The first ascites and the diuretics share one belly gauge with the ascites and HVPG tiles. "Stopping alcohol lowers the portal
  pressure" shows the HVPG monitor card (the wedged and free tracings and the result, easing as the year runs) beside the albumin and ascites
  tiles. `cite` moved into the notes. Test lists that named the dropped slide follow it. Both humanizer passes were done: no new UI. Code and unit
  tests only; nobody has looked on screen. `src/ui/decks/recompensation.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/one-ladder.test.js`,
  `tests/sweep-fixes-2-brackets.test.js`, `brand/handout/recompensation/`.
- **The vitals monitor's EKG no longer restarts when the time-lapse finishes.** (Mohammad, 26 Oct, on The circulation in cirrhosis, slide 3: "after the transition was done,
  the EKG restarted"; the build before it, 3d8bbbd3.) The presenter ends a time-lapse by easing the patient to the slide's end state and then restoring that state, and
  both put the model's own clock to the end state's (about 2 s back in the check: 2.098 s, 0.02 s, then 0.004 s). The monitor read any step back in the model's clock as a new
  patient and wiped the strip. Now a clock that was set, back or well ahead, only moves the strip's time on so it starts where it left off, and the beat's phase (which a
  restore leaves alone) carries the rhythm across. A new patient still clears the strip, as it always did, from the card (`presenter-tools.js` show). The check now sets the
  clock back and forward as the easing ends, and fails on the build before. Code and unit tests only; nobody has looked on screen. The beat trace has the same wipe on a
  step back and also clears when the day changes; that is how it shows a time-lapse as a trend and then a fresh trace, so it was left alone. `src/ui/vitals-monitor.js`,
  `tests/vitals-lapse.test.js`.
- **Encephalopathy and shunting: eight slides, one flows card, and a question about the narrower stent.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild
  plan, F3.) "Closing the shunt sends blood back through the liver" and "Closing the shunt brings the portal pressure back" are one slide: the shunt
  closes, the flows empty, and a two-month time-lapse brings the PPG back and the ascites with it; its two buttons compare the shunt open and embolized. One
  flows card and the same two tiles run through the first slides, the encephalopathy risk index beside the PPG; the spontaneous shunt slide is colored by
  origin like the rest (it was colored by direction), flow only where the shunt closes. After a TIPS the index is already High at any stent width (it counts
  the shunted share of the portal blood, near 94% from 6 to 12 mm), so the two stent slides keep the liver's flow and the PPG, and the notes say why. The narrowing slide asks "Will a narrower stent
  bring the confusion down?" and is the answer: it opens on the 6 mm stent, with the 8 mm and occluded buttons, and the tiles' rings mark the 8 mm stent. `cite`
  and the caveats moved into the notes, and long lines were trimmed to 30 words. Tests: the question-card list gains this slide; the summary-table step
  list gains the risk tile. Both humanizer passes were done: no new UI. Code and unit tests only; nobody has looked on screen. `src/ui/decks/encephalopathy.js`,
  `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/question-card.test.js`, `tests/table-marks.test.js`, `brand/handout/encephalopathy/`.
- **Gastric varices: eight slides, and the spleen slide gets the ultrasound.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, F2.) The
  carvedilol slide leaves, because Lowering portal pressure teaches the drug; its gastric point (carvedilol first for fundal varices that have not
  bled, glue, BRTO and a TIPS not used to prevent a first bleed) is now in the first slide's notes and the talk's objective. The bleed slide gives the
  carvedilol itself (the heart rate stays blunted), as the dropped slide used to. "Treat the spleen, and the varices empty" shows the spleen
  ultrasound next to the varix and platelet tiles and keeps its three buttons (spleen in place, partial embolization, splenectomy); the embolization
  slide's pain, fever and abscess, and the clot risk after splenectomy, joined its notes. `cite` moved into the notes on every slide, and the lines
  that ran past 30 words were trimmed (the "colored by origin" words stay). Both humanizer passes were done: no new UI. Code and unit tests only;
  nobody has looked on screen. `src/ui/decks/gastric-varices.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `brand/handout/gastric-varices/`.
- **Ascites takes in Paracentesis and albumin: one talk, why it forms and how it is treated.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, F1.)
  Ascites is 14 slides in three sections, was 11 and 9 in two talks. Where it forms keeps three slides (the sinusoids, the lymph along the portal tracts, two months
  of building) on one fluid card with the sinusoid and ascites tiles. The tap keeps the SAAG, heart failure, Budd–Chiari and the quadrant, now headed "Telling
  them apart". The treatment runs on one belly gauge with the ascites and portal pressure tiles: tense ascites, the large-volume tap (which now carries the albumin and
  its serum albumin tile, so "Albumin with the tap" is gone), the fluid back after two weeks, diuretics, refractory ascites defined, TIPS, and the table. Cut:
  the gut capillary against the sinusoid wall, the portal vein clot and the schistosomiasis slides (Portal vein clots and Presinusoidal portal hypertension teach
  them), low protein in cirrhosis (its point is in the SAAG slide's notes) and the first diagnostic tap (also in those notes). `cite` and the two caveats moved into
  the notes. The old Paracentesis and albumin link opens Ascites at slide 1 (`DECK_ALIAS`). The crossing checks that opened Paracentesis and the old
  portal vein clot and schistosomiasis slides follow the new slides. Both humanizer passes were done: no new UI, only the fluid card, the belly gauge and the tiles.
  Code and unit tests only; nobody has looked on screen. `src/ui/decks/ascites.js`, `src/ui/decks.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`,
  `tests/ascites-sinusoid-label.test.js`, `tests/e2e/smoke.mjs`, `docs/deck-authoring-guide.md`, `brand/handout/ascites/`.
- **Measuring HVPG and PPG: the catheter slide shows the catheter, and the four-patient scale is gone.** (Mohammad, 25 Oct, "Build the new decks"; deck
  rebuild plan, D5.) The HVPG talk loses "Four patients on the HVPG scale", whose job the plane on the second-to-last slide already does (it places six
  patients by both gradients, with the cut-offs drawn on it). The slide that reads the result keeps what only it can show: the catheter on the
  figure, the monitor with the wedged and free tracings, and the HVPG equation. Its Gut to heart chart, its two tiles and its four patient buttons
  went; the line still says the HVPG is {hvpg}, clinically significant. The cut-offs the scale slide carried (1 to 5 normal, 6 to 9 subclinical, 10
  or more clinically significant, the bleeding risk rising from about 12, an HVPG of 20 or more in an acute bleed) moved into this slide's notes, with
  the guideline sources the slide used to print as a line under the words; the quick check still asks for them. The talk is 10 slides, was 11. Old
  numbers shift by one from the pressure slides on: Normal HVPG, high portal pressure is now 6, the PPG slide 7, heart failure 8, Budd–Chiari 9, the
  plane 10 and the summary 11. The checks that open the talk at a slide (the lit lobule label, the zoom crossing out of the lobule, the iPad turn, the
  narrow phone sweep) follow the new numbers; the type-scale look at the dropped scale slide now looks at the plane. Tests: the four-button
  test became a check that the catheter slide's case sits between compensated and decompensated cirrhosis; the Gut-to-heart test says the catheter
  slide carries no chart, tiles or buttons. Code only; nobody has looked on screen. `src/ui/decks/hvpg.js`, `tests/deck-adopted.js`,
  `tests/hands-on-decks.test.js`, `tests/one-ladder.test.js`, `tests/e2e/smoke.mjs`, `tests/e2e/type-scale.mjs`, `docs/deck-authoring-guide.md`,
  `brand/handout/hvpg/`.
- **Choose the treatment: one slide for each case.** (Mohammad, 25 Oct, "Go"; deck rebuild plan, C6.) The five cases were each two slides, a question with
  buttons and then the answer. Each is now one slide: the case card brings the patient in and asks one question ("Does she meet the criteria for a
  pre-emptive TIPS?", "What stops ascites that keeps coming back?", "What stops his fundal varices?", "What treatment reopens the vein?", "Which shunt
  decompresses her liver?"), and the slide behind it plays the choice the guidelines make. Four of the five are time-lapses, so the card covers the patient at
  the time-lapse's start and the days run once it lifts. The option buttons and the "before" arrows on the summary are gone (the summary table still shows
  each case after its treatment). The deck is six slides, not eleven; the end states are the same as before (checked with the deck-state numbers: the
  bleeding case's PPG 14.3, the ascites case 8.8 and an empty belly, the splenic vein case 2.6 for the fundal varices, the portal vein clot 4.2, Budd–Chiari 8.3).
  `cite` and the two caveats moved into the notes, with their ADOPTED entries; a few vignettes and lines were trimmed to fit the case card's 220 characters and
  the 30-word line. Both humanizer passes were done. Code and unit tests only; nobody has looked on screen. `src/ui/decks/choose-treatment.js`,
  `tests/deck-adopted.js`, `tests/deck-pills.json`, `docs/deck-authoring-guide.md`, `docs/deck-authoring-quick-guide.md`, `brand/handout/choose-treatment/`.
- **The vitals monitor's EKG keeps going through a time-lapse.** (Mohammad, 26 Oct, on The circulation in cirrhosis, slide 3, "While the compensated to decompensated is fast
  switching the EKG bounces or starts redrawing over and over"; he picked "Keep it alive at the rising rate".) A time-lapse runs a year in ten seconds on the disease
  clock, where the model's own beat and clock stand still. The strip scrolled by the days a second, so it jumped back about four seconds and crept forward again
  thirty times a second, and it laid no beats until the year was over. Now the strip runs on the card's own clock while the model's stands still: it scrolls at the
  normal speed and lays a beat at the heart rate shown in the HR number, so the beats close in as it climbs (about 68 to 89 a minute on that slide, a beat every 0.88 s
  down to every 0.67 s). Over the last second and a half it eases the beat to the phase the model resumes at, so the live strip takes over where the last beat left off.
  The same carries the strip through the half-second a patient eases to its end state, which used to freeze it. A strip with nothing on it when a time-lapse
  starts is given its window of the starting steady state; an easing never makes up a window. A time-lapse also ends a history request under way, and a strip that has
  run on its own is not backfilled afterwards. Frames carry `parkSecs`, the seconds the model's clock stands still. The check plays a worker-shaped run (live, the
  year, the easing, live) against a fake page and follows every beat on the strip frame by frame (one steady scroll speed, no stall or jump at either end, beats
  closing in, no crowded or missing beat at the join); it fails on the old monitor. Code and unit tests only; nobody has looked on screen. `src/ui/vitals-monitor.js`,
  `src/ui/ekg.js`, `src/worker-core.js`, `tests/vitals-lapse.test.js`.
- **Inside the lobule is six slides, down from eight.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, E6.)
  The schistosomiasis and sinusoidal obstruction slides leave: the summary table still holds all four diseases, with the schistosomiasis and obstruction rows
  now built from their patients directly. The sections are the lobule, where the resistance sits (sinusoidal, cardiac) and measuring; it is 7 minutes. Code and unit
  tests only; nobody has looked on screen. `src/ui/decks/lobule.js`, `tests/deck-adopted.js`, `tests/lobule-sinusoid-reading.test.js`, `tests/e2e/smoke.mjs`
  (three Lobule slide numbers), `docs/deck-authoring-guide.md`, `brand/handout/lobule/`.
- **The stacked card's handle comes in with the cards, never ahead of them.** (Mohammad, 25 Oct, "The handle of the stacked cards appears before the
  cards".) Found in code: with Reduce Motion on, `.pz *` turned every transition off and the handle (`.pz-lip`) was the one piece of the stacked card
  left out of the fade the cards keep, so it came up at once, and went at once, while the cards were still fading. In motion, its bar fades with the
  same start and ease as the glass but is a crisp mark on glass that is nearly clear while it fades, so it read as first in and last out. It now fades in
  once the glass is in (opacity .3 s after .42 s, where the card's own fade runs .12 s to .62 s) and out first (.2 s), still sliding with the card, on the
  phone's sheet and the Mac and iPad stack. With Reduce Motion it fades in after the glass and out before it, with no slide. A handle that is shown with its
  card already standing (a move cut short) starts from its out look and eases in instead of coming up at full strength; a slide
  that changes in the middle of a pull lets it leave first too. Code and unit tests only; nobody has looked on screen. `styles/app.css`,
  `src/ui/presenter.js` (`lipSync`), `tests/handle-with-card.test.js`.
- **One patient, ten years: the first year is now the one-year follow-up.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, D4.) "A year of
  compensated cirrhosis" is gone; its four best slides open Ten years as Year 0 to Year 1, and the clock moves to match: CSPH and carvedilol at year 1,
  not year 3. The case card and the plane (Year 0, HVPG just below 10), the FibroScan at month 3, the HVPG monitor card at year 1 (the HVPG above 12,
  from the diagnosis reading), and carvedilol with the percent fall in the HVPG and the blood pressure. Then the same chain as before: the first
  ascites at year 6 (five more years of injury now, not three), diuretics, the bleeds of years 8 and 9, the TIPS, the confusion, the transplant
  evaluation. Dropped: the catheter on the figure, the small-varices slide, the Doppler and the first-fluid slides (their own talks teach them),
  the plane summary and the day buttons. The state chain was read slide by slide against the old one with `deck-states`: the later steps keep the
  same HVPG, PPG and varix within a tenth or two (the ascites volume at year 6 is 1388 mL, was 1443), and the threshold checks still hold. The
  quick check's first question now says "an HVPG of 10 mmHg or more". Lines are 30 words or fewer, sources moved into the notes, the second
  "Year 9" label is now "Confusion" (the chart's labels had two the same). Old link `?script=one-year` opens Ten years at slide 1. Words went
  through the AI humanizer and no new visual device was added. Handout figures of the four kept slides moved with them; the stale ones are listed
  for the redraw. Tests: the thresholds, adopted, ladder and tile checks follow the new ids; the day-button test became a check that the HVPG rises
  visit by visit and falls on carvedilol; the smoke check of the scope's redraw now opens Ten years 9; the catheter-callout size check lost its
  One year slides (no slide of Ten years has a catheter on the figure). Code only; nobody has looked on screen. `src/ui/decks/ten-years.js`,
  `src/ui/decks.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/deck-thresholds.test.js`, `tests/engine-solver.test.js`,
  `tests/hands-on-decks.test.js`, `tests/one-ladder.test.js`, `tests/review-doppler-text.test.js`, `tests/tile-grid.test.js`,
  `tests/trace-labels.test.js`, `tests/e2e/smoke.mjs`, `docs/deck-authoring-guide.md`.
- **Presinusoidal portal hypertension is six slides, down from eight.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, E5.)
  The beta-blocker and banding slides leave: treating the varices is the same as in cirrhosis and has its own talks. The talk ends on the table of the healthy liver,
  schistosomiasis and cirrhosis (the "After treatment" row goes), its objectives are three, and it is 7 minutes. Code and unit tests only; nobody has looked on screen.
  `src/ui/decks/ncph.js`, `tests/deck-adopted.js`, `tests/e2e/smoke.mjs` (the last lobule crossing now ends on the summary), `brand/handout/ncph/`.
- **Where is the resistance? is eight slides, down from fourteen.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, E4.)
  Each case is now one slide: the case card holds the patient and asks "Where is the resistance?", and the slide behind it shows the Gut to heart chart with the
  Pressure and Pressure drop buttons and names the level. The six question slides, their held data cards and the two Doppler cards leave (the open or clotted portal
  vein is said in the case 2 and case 5 lines), so the talk is the six cases, the six ladders on one chart and the summary table. Lines are 30 words or fewer. The
  talk is 12 minutes. Code and unit tests only; nobody has looked on screen. `src/ui/decks/where.js`, `tests/deck-adopted.js`, `tests/one-ladder.test.js`,
  `tests/teaching-features.test.js` (no slide is on hold any more once First visit's five go, so the count is no longer asserted), `tests/grid-key-phone.test.js`,
  `docs/deck-authoring-guide.md`, `brand/handout/where-resistance/`.
- **TIPS and shunts is one 11-slide talk: the spontaneous shunt, the woman's TIPS and the surgical shunt.** (Mohammad, 25 Oct, "Go"; deck rebuild plan, C5.)
  "A TIPS from start to finish" is folded into the shunts talk (`?script=tips-journey` and its share page still open it, at slide 1). The talk runs
  in four sections: the spontaneous splenorenal shunt (own flow, then the shunt's effect on the pressure), who gets a TIPS (the woman with recurrent
  ascites and a four-row criteria card ending "No single number rules a TIPS out"), the stent and the flow (the procedure, the pressure it
  buys, the heart's response with its compare button, the 12 mm stent and the stepwise dilation, and the closed stent), and the surgical distal
  splenorenal shunt. The gastric-variceal shunt and BRTO slides left (Gastric varices teaches them), and so did "TIPS around the stent" and
  "What a TIPS does not decide"; the criteria card's last row says the second one. Each section runs one instrument; no slide shows more than two
  tiles except the distal shunt, which keeps three and says why in a code comment. The talk uses the flow lens on every slide but the last (blood
  origin). Lines are 30 words or fewer; every `cite` and caveat moved into the notes, with the field and its ADOPTED entry removed. Both
  humanizer passes were done. Code and unit tests only; nobody has looked on screen. Menu title now "TIPS and shunts". `src/ui/decks/shunts.js`,
  `src/ui/decks.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `docs/deck-authoring-guide.md`, `brand/handout/shunts/`.
- **The EKG strip and the other recording traces open already full.** (Mohammad, 25 Oct, "In the heart ekg card while things are happening in the
  slide the ekg is empty it takes a while for it to show up so needs to be fixed somehow".) The vitals monitor's strip, the beat trace (its EKG strip and
  its pressures) and the Doppler were held empty while a slide's patient changed, then started over and swept in from the left for six to twelve seconds.
  Now the model makes the steady state's last seconds on a scratch copy of itself and the instrument takes them in front of what it records
  (`history` in `src/worker-core.js`, `src/ui/backfill.js`). The copy runs between the live ticks and never stops the clock. It ends on the last sample the
  model posted, on the same moment of the same beat and breath, so the live samples follow on with no seam: in the check, the phase matches exactly, the heart
  rate to within one beat a minute and the portal pressure steps by about 0.15 mmHg at the join. A card waits up to 0.9 s for its window before it comes in; on
  Patients, a loaded patient's Over time and Doppler traces open the same way. Nothing is made for a state that is still changing (an easing patient, a
  time-lapse, the disease clock), and a newer state cancels one under way. The instruments are let go at the landing, not after the cards are in. An
  instrument coming back after another card showed starts over (it had missed the frames between). Code and unit tests only; nobody has looked on screen.
  `src/worker-core.js`, `src/ui/backfill.js`, `src/ui/presenter-tools.js`, `src/ui/presenter.js`, `src/ui/pressure-time.js`, `src/ui/vitals-monitor.js`,
  `src/ui/doppler.js`, `src/ui/lazy-pane.js`, `src/ui/dock.js`, `src/ui/main.js`, `tests/history-backfill.test.js`.
- **Stiffness, platelets and the first visit: one talk of 12 slides.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, D3.) Liver stiffness takes
  in "Stage the patient at the first visit". It has three sections. The measurements: the shear wave, "Fibrosis stiffens the liver", and a large spleen
  with the new spleen ultrasound (calipers and the length in cm) and the platelet tile. The first visit: the Baveno VIII rules card, then five cases,
  each on one slide. The case card asks ("Is CSPH ruled out, ruled in or still open?"), and the stiffness and platelet plane with its two tiles
  answers; the plane and the tiles stay up from case to case, and the ring moves. Cases 4 and 5 were on a rules card and now sit on the plane too,
  with their point (the BMI, the soft liver) in the line. Where stiffness misleads: congestion from the heart, with the HVPG tile gone. The summary is
  the plane with cases 1 to 4. The first visit's 5 question slides, the meal, the year on, the schistosomiasis slide, the stiffness rule slide and
  the old summary table are gone (case 5 makes the schistosomiasis point; the meal and the hepatitis flare moved into the rules slide's notes). The
  old link `?script=first-visit` opens Stiffness at slide 1. Lines are 30 words or fewer, the sources and caveats are in the notes, the quick
  check has four questions, and each case card plus its question is under 220 characters. The spleen slide no longer draws calipers and the normal
  outline on the figure, since the ultrasound shows the length. Words went through the AI humanizer and no new visual device was added. Figures moved
  with their slides; the stale ones are listed for the redraw. The smoke check that counts FibroScan slides names the three that are left
  (half of them must show the probe, as before). Code only; nobody has looked on screen. `src/ui/decks/stiffness.js`, `src/ui/decks.js`,
  `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/doppler-meal-plays.test.js`, `tests/e2e/smoke.mjs`, `docs/deck-authoring-guide.md`,
  `docs/deck-authoring-quick-guide.md`.
- **Sites and causes: a lighter talk, one question for the room.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, E3.)
  The six level slides drop the case questions, the extra sliders and buttons (except the heart buttons on the cardiac slide), the causes list and the scale
  switch; the causes moved into each slide's notes, and the periportal fibrosis slider moved to the presinusoidal talk's "Where the resistance sits" slide so
  the control is kept. Slide lines are 30 words or fewer. The tag that names the level is not said twice when the kicker already says it. The ladders slide
  asks "Which of the six raised the HVPG?" on a question card. Code and unit tests only; nobody has looked on screen. `src/ui/decks/sites.js`,
  `src/ui/decks/ncph.js`, `src/ui/decks.js`, `tests/deck-adopted.js`, `tests/question-card.test.js`, `tests/sites-what-if.test.js`, `docs/deck-authoring-guide.md`.
- **Collaterals and varices: fundal varices and the rectal slide leave, the other routes share one slide, and one pair of tiles runs through the first four.**
  (Mohammad, 25 Oct, "Sure"; deck rebuild plan, B2.) Gastric varices have their own talk, so the fundal slide is gone, and the paraumbilical and rectal
  slides are one, "Other collaterals: the paraumbilical and rectal routes", with both routes marked and the camera framing the two. The HVPG and the varix
  are the two tiles on slides 2 to 5 (the spleen and platelet tiles and the normal-spleen outline left the time-lapse; they are in its notes), the wall
  slide's card is titled "Wall stress" and its line says it, and the vein-system colours give way to the flow colours as the one second lens, over the
  first three slides, with pressure home. Every line is one sentence of 30 words or fewer, the time-lapse's caveat is in its notes, "over 5 mm" now
  reads "5 mm or more", and the two cases no longer say "EGD". Three objectives (the fundal one left with its slide). Both humanizer passes
  were done. Code and unit tests only; nobody has looked on screen. `src/ui/decks/varices.js`, `tests/varices-cards.test.js`, `tests/deck-adopted.js`,
  `tests/deck-pills.json`, `brand/handout/varices/`.
- **Preventing the next variceal bleed: one scope card through seven slides.** (Mohammad, 25 Oct, "Go"; deck rebuild plan, C4.) The scope, with the varix and
  the HVPG as tiles, now runs from "The bleed is over" to the last slide, `nsbb` (carvedilol) included; the tiles' ring marks the state after the bleed on every slide
  of the run, and `nsbb` adds the percent-fall tile as a third tile, because the fall is the point of the slide. The first slide reads the HVPG instead of
  the PPG, as the carvedilol slide's words do. The TIPS slide left: the bleed talk's last section and A TIPS from start to finish carry it, and the summary's
  last line and notes say when a rebleed despite both means a TIPS (the carvedilol stop, rifaximin and the encephalopathy cost went into the notes). The summary
  table loses the liver column and the TIPS row. Small print (`cite`, the slough caveat) moved into the notes. The scope-timing and banding-ulcer points
  from the Endoscopy talk are already in `slough`'s notes. Code and unit tests only; nobody has looked on screen. `src/ui/decks/next-bleed.js`,
  `tests/deck-adopted.js`, `tests/deck-pills.json`.
- **Doppler ultrasound of TIPS is 10 slides, down from 15.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, D2.) The talk now runs: the scan
  before the stent, the working stent read at its three points, aliasing, the main portal vein, the left portal vein, the narrowed stent, the warning
  sign, the portal vein slowing again, venography and the summary. The three-points slide takes the working stent's state and says what the stent did
  to the PPG (its live value before the stent and after it); the stent slide, the shunted-share slide (Two inflows and Spontaneous shunts and TIPS teach that), the baseline
  fix, the right portal vein and "where it narrows" are gone. The aliasing slide has a "Baseline down" button that moves the baseline in place, with
  the instrument buttons from the last push (it took a second slide before). The narrowed stent's Proximal, Mid and Distal buttons now move
  the narrowing itself and the gate follows it. The left portal vein slide says in one sentence that the right portal vein flows toward the liver only
  before the stent; a button cannot switch the Doppler's vessel without new code, so the slide keeps the left. The talk uses two lenses, velocity and
  direction (direction on the two branch slides only); flow, congestion and blood origin went with the slides that used them. The data card is on the
  narrowed and reopened stent only, with the PPG as its one tile. The on-screen caveat stays on the three-points slide; the narrowing's caveat and the
  left portal vein's source moved into the notes. Lines are 30 words or fewer. Words went through the AI humanizer and no new visual device was added.
  The old slide ids are gone from the checks (the smoke checks now name `narrow` and `fix`; the callout-moves check treats `narrow` as a slide whose
  buttons move the narrowing, as `where` was). Handout figures of the five dropped slides were removed; eight of the rest are listed for the figure
  redraw at the end of the rebuild. Code only; nobody has looked on screen. `src/ui/decks/tips-doppler.js`, `tests/deck-adopted.js`,
  `tests/deck-pills.json`, `tests/tips-doppler.test.js`, `tests/tips-doppler-points.test.js`, `tests/teaching-features.test.js`,
  `tests/e2e/smoke.mjs`, `docs/deck-authoring-guide.md`, `docs/deck-authoring-quick-guide.md`.
- **After the sinusoids: one talk for the hepatic veins, sinusoidal obstruction and the heart.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, E2.)
  Hepatic venous outflow obstruction takes the right heart slides and is renamed "After the sinusoids: hepatic veins and the heart" (id `outflow`, Causes). Its three
  sections are the hepatic veins (Budd–Chiari syndrome, the missing wedge, a stent, a DIPS), sinusoidal obstruction (the case, the wedge, recovery) and the heart and IVC
  (the normal waveform, tricuspid regurgitation, the pulsatile portal vein, constriction and the IVC web), ending on one table that holds all of them. The caudate lobe
  slide and the heart catheter slide leave (their words moved into the notes). The congestion view is the talk's own colouring on every slide, with the flow view on the DIPS
  slide only; the heart slides share one hepatic vein Doppler and one right atrial pressure tile. Slide lines are 30 words or fewer, the citation moved to the notes, and
  Budd–Chiari 2 and the IVC web lost their extra tiles and readings. The old id `right-heart` opens this talk (`?script=right-heart`, `c/deck-right-heart.html`).
  Code and unit tests only; nobody has looked on screen. `src/ui/decks/outflow.js`, `src/ui/decks.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`,
  `tests/e2e/smoke.mjs` (the two Outflow slide numbers), `docs/deck-authoring-guide.md`.
- **Endoscopy is now a six-slide lesson, "The varix changes when you insufflate".** (Mohammad, 25 Oct, "Sure"; deck rebuild plan, B1.) One
  decompensated patient and one scope all the way through, and nothing changes in the model after the case card, so the HVPG is the same on every
  slide. Slide 2 compares a small varix (under 5 mm) with a large one (5 mm or more); slide 3 switches the red wale marks off and on to show they are
  a finding of their own and the size does not move; slide 4 has a slider for the pressure of the air in the esophagus, 0 to 20 mmHg (a teaching
  range, said in the notes), and the varix narrows and flattens; slide 5 adds the pressure inside the varix, in the lumen and across the wall;
  slide 6 asks on a question card whether a flatter varix means less portal hypertension (it does not: the HVPG is unchanged) and lets the slider
  answer it; slide 7 points to Preventing the next variceal bleed. Three objectives and three checks (the large-varix check is kept; the other two
  come from the lesson). Every line is one sentence of 30 words or fewer; the sources and the study the 9 mmHg comes from are in the notes. The menu
  reads "The varix and insufflation" (tab "Insufflation"). The old slides (screening, growth, large, wall stress, bleed, octreotide, transfusion,
  banding, summary) and their figures are gone; the follow-up scope after banding and the banding-ulcer note moved to the notes of the Preventing
  the next variceal bleed slide on bands sloughing, and the transfusion check ("To what hemoglobin do you transfuse?") replaced the octreotide-dose
  check in Acute variceal bleeding, which repeated that deck's own slide. Both humanizer passes were done on the words and the design (the lesson
  reuses the scope, the Small/Large and red-sign buttons, the slider and the HVPG tile as they are).
  The scope's compact card in the presenter hides every tile but the grade and the stigmata, so the three pressures got a row of their own under the
  grade (three columns, the name over its number); the Tests card's scope is unchanged. Code and unit tests only apart from the six
  handout figures, which are drawn on a desktop; nobody has looked on a phone or an iPad. `src/ui/decks/endoscopy.js`, `src/ui/decks/variceal-bleed.js`, `src/ui/decks/next-bleed.js`,
  `src/ui/decks.js`, `tests/endoscopy-lesson.test.js`, `tests/bleed.test.js`, `tests/review-doppler-text.test.js`, `tests/deck-adopted.js`,
  `tests/deck-pills.json`, `tests/deck-thresholds.test.js`, `tests/hands-on-decks.test.js`, `tests/question-card.test.js`, `brand/handout/endoscopy/`.
- **Portal vein clots: one talk for the clot without cirrhosis and the clot in cirrhosis.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild plan, E1.)
  Pre-hepatic portal hypertension takes the slides of Portal vein thrombosis in cirrhosis and is renamed Portal vein clots (id `prehepatic`, Causes). Section 1
  keeps the acute clot, the catheter, anticoagulation, the cavernoma and the soft liver; section 2 follows a patient with cirrhosis through the case, the partial
  clot that raises the PPG and not the HVPG, carvedilol, six months of anticoagulation and the course on one chart (its chart now starts at the cirrhosis
  patient). The splenic vein clot slide leaves (Gastric varices teaches it), as do the partial-clot and endoscopy slides of the old talk (their words moved into
  the gradients and carvedilol notes). The clot-without-cirrhosis anticoagulation and cavernoma slides share one card (the portal vein in section, with the
  portal pressure and the PPG), colored by velocity; the pressure-drop view is gone from the talk. Slide lines are 30 words or fewer and the citations moved to
  the notes. The old talk's id `pvt-cirrhosis` is removed (`brand/handout` figures moved with their slides). Code and unit tests only; nobody has looked on
  screen. `src/ui/decks/prehepatic.js`, `src/ui/decks.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `docs/deck-authoring-guide.md`.
- **Doppler of the portal system takes in Read the Doppler: five cases, one slide each.** (Mohammad, 25 Oct, "Build the new decks"; deck rebuild
  plan, D1.) The talk is now 11 slides: the probe, the hepatic veins, the meal, cirrhosis, the reading order (Read the Doppler's "Read every trace in
  the same order"), the five cases and a table of the five traces. Each case is one slide: its case card asks ("Which way will his portal blood run?"),
  and the slide that follows is the answer, with the reading grid under the trace the room reads (the portal vein for the first, second and fourth, the
  right hepatic vein for Budd–Chiari, the left portal vein after a TIPS). Nothing is held back any more, so the Doppler no longer blanks its direction
  and shape words, and the five cases carry no tiles; the lines quote their numbers live. The slides the cases cover (reversed flow, portal vein
  thrombosis, the cavernoma, Budd–Chiari, heart failure and the stent) and Read the Doppler's five question slides are gone, as is the deck. The old
  link `?script=read-doppler` opens Doppler of the portal system at slide 1. Lines are 30 words or fewer; the two sources moved into the notes. Words
  went through the AI humanizer and no new visual device was added. Handout figures moved with their slides; the eight slides whose look changed are
  listed for the figure redraw at the end of the rebuild. Code only; nobody has looked on screen. `src/ui/decks/doppler.js`, `src/ui/decks.js`,
  `src/ui/presenter.js`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/teaching-features.test.js`, `tests/deck-lenses.test.js`,
  `tests/deck-terms.test.js`.
- **Lowering portal pressure takes in Propranolol or carvedilol (9 slides).** (Mohammad, 25 Oct, "Go"; deck rebuild plan, C3.) The talk is now
  `target`, `prop`, `carv`, `carv-sin`, `oct`, `terli`, `vs`, then the old beta-blocker talk's schistosomiasis case (`schisto`, with its case card and
  the question "Will carvedilol add much to propranolol here?") and the summary. The three beta-blocker slides (`prop`, `carv`, `carv-sin`) share one
  card, the HVPG catheter's tracing with the percent-fall tile counted from the untreated patient; `carv` opens with a question card ("Which lever
  does carvedilol pull?") and `carv-sin` keeps the Propranolol and Carvedilol buttons. `oct` and `terli` keep their tiles. Flow is the second lens, on the drug
  slides; the drop, origin and since lenses are gone. The banding, TIPS, after-TIPS and cost slides left (Preventing the next bleed, TIPS and shunts and the
  bleed talk own them), as did the beta-blocker talk's other slides: its circuit slide, the propranolol slides, the carvedilol-in-schistosomiasis slide and
  "In practice", which went into the notes of `carv-sin` and `schisto`. `vs` sets its own state (a TIPS) so it does not inherit the schistosomiasis
  patient. The quick check and the summary table follow. Because the talk now teaches two levels its slides carry the level tab. `?script=beta-blockers`
  opens this talk (`DECK_ALIAS`, and its share page). Figures: `carv-sin` and `schisto` moved; the others of both talks that left were removed, and every figure that
  stays is stale until the redraw. Code and unit tests only; nobody has looked on screen. `src/ui/decks/treatment.js`, `src/ui/decks.js`,
  `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/one-ladder.test.js`, `tests/site-tags.test.js`, `tests/question-card.test.js`.
- **"The circulation in cirrhosis": Hyperdynamic takes in Blood volume (8 slides).** (Mohammad, 25 Oct, "Go"; deck rebuild plan, C2.) The talk keeps
  its id `hyperdynamic` and its Foundations place and is now `rest`, `dilate`, `resist`, `volume`, `forward`, then the old Blood volume's `full` (its case
  card, "Losing blood") and `loss` (its question card, "What will a liter lost do to the portal pressure?"), then the summary. One vitals monitor (heart
  rate, mean arterial pressure and cardiac output, with the EKG strip) carries the whole talk, with one or two tiles under it: blood volume and portal vein
  pressure on `volume` and `forward`, the portal vein pressure on `full` and `loss`, whose ring marks the state before the liter. The flow lens is the second lens, on
  `dilate`, `resist` and `volume`; the rest stay on pressure. The three drug slides (propranolol, carvedilol, terlipressin) went, since Lowering portal
  pressure owns them, and so did the transfusion slides (reserve, units, over), which the bleed talk owns. The quick check and the summary table follow the
  new slides; small print (`cite`, the volume caveat) moved to the notes. `?script=blood-volume` opens this talk at slide 1 (`DECK_ALIAS`, and
  its share page). Figures: `full` and `loss` moved to `brand/handout/hyperdynamic/`; the rest of Blood volume and the drug slides' were removed; every slide's
  is stale until the redraw. Code and unit tests only; nobody has looked on screen. `src/ui/decks/hyperdynamic.js`, `src/ui/decks.js`,
  `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/question-card.test.js`.
- **Acute variceal bleeding takes in "When the bleeding will not stop" (13 slides).** (Mohammad, 25 Oct, "Go"; deck rebuild plan, C1. The merged talk is
  Resuscitating an acute variceal bleed, Treatment and core.) After the pre-emptive TIPS comes a fifth section, "If it does not stop": a second case
  whose bleed octreotide and bands controlled comes back by day 5 (`controlled`, `rebleed`, `failure`, `bridge`, `rescue`). Treatment failure and
  who is considered for a rescue TIPS now sit in the words and notes of those slides; the two refractory slides on who gets a rescue TIPS and on
  encephalopathy afterward went into the notes, since Choose the treatment, TIPS and shunts and Encephalopathy carry those points. The whole bleed runs on
  one card, the beat trace (EKG strip, portal pressure, HVPG lane) over the map and hemoglobin tiles, whose ring marks where the run began; the
  vitals monitor goes to the circulation talk. Two question cards: on "Shock before anemia" ("His pulse is racing. Has the hemoglobin fallen yet?") and
  on "Bands stop the bleeding" ("Will banding lower his portal pressure?"). Bands opens the scope on the active bleed (the question card holds the
  slide before's state, so the scope arrives bleeding) and the jet fades as the bands go on; its tiles are the portal vein pressure and the map, so the
  answer is on the card. The summary table gains the rebleed and the rescue TIPS; the quick check's weakest question became the failure one. Small print
  (`cite`, the failure and bridge caveats) moved into the notes. Old links keep working: `DECK_ALIAS` is now in `decks.js` and holds `refractory-bleed`
  as well as `where-block` and `bleed`; an aliased id opens its deck at slide 1, and the share pages (`c/deck-refractory-bleed.html`) point at the
  new deck. `src/ui/decks/refractory-bleed.js` is gone; its figures moved to `brand/handout/variceal-bleed/` (the stale ones are listed for the
  redraw). Code and unit tests only; nobody has looked on screen. `src/ui/decks/variceal-bleed.js`, `src/ui/decks.js`, `src/ui/presenter.js`,
  `scripts/share-pages.mjs`, `tests/deck-adopted.js`, `tests/deck-pills.json`, `tests/ekg-lane.test.js`, `tests/question-card.test.js`,
  `tests/share-pages.test.js`.
- **The scope can show a varix with air in the esophagus, and a slide can move an instrument's option.** (Mohammad, 25 Oct, "yes to both"; deck
  rebuild plan, B1, machinery only: the lesson itself is the next push.) The engine reads the diameter a varix is seen at with 0 to 20 mmHg of air in
  the lumen around it (`engine.varix(site, P, air)`; `metrics.varix.air`, a diameter for each mmHg): the air is taken off the pressure across the
  wall and nothing else moves, because sending it through the solver collapses the varix and chokes its own collateral (HVPG 16.5 to 18.0 at 20 mmHg).
  For the decompensated patient the table reads 7.2 mm at no air, 6.2 at 10 mmHg, 5.7 at 14, 4.6 at 16, 2.7 at 18 and 2.1 at 20; the pressure inside
  the varix stays 18.2, and so do the HVPG and the portal pressure. The scope takes three options from a slide: `air` (the drawing flattens with the
  size seen, through the scope's own 0.2 s ease; the Diameter row reads that size and the Grade row stays the size at rest), `red` (the red wale marks
  and the Stigmata row shown or hidden whatever the wall stress) and `readings` (three more rows: the pressure in the varix, in the lumen and across
  the wall, the last the difference of the other two as printed). The Diameter and the pressure inside now read the slide's own numbers once the
  slide has pinned them, as the wall tool does, so they do not swing with each breath. A `whatIf` slider can take a `tool` in place of a `param`,
  and `compare` buttons can take a `tool` patch (the slide's own button puts the options back); neither touches the model. No deck uses them
  yet. Code and unit tests only; nobody has looked on screen. `src/engine/engine.js`, `src/engine/metrics.js`, `src/ui/instruments.js`,
  `src/ui/endo-size.js`, `src/ui/presenter.js`, `src/ui/presenter-tools.js`, `styles/app.css`, `tests/varix-air.test.js`, `tests/scope-air.test.js`.
- **A time-lapse can keep the data card from the slide before.** (Mohammad, 25 Oct, "yes to both"; deck rebuild plan, A5.) A run of slides that crosses a
  time-lapse (ten years, the next bleed, ascites building) no longer fades its data card out and builds the same one again when the card is the same.
  If the lapse slide has the same instrument, tiles and title as the slide before, and the patient stays, the card is already on screen when the days
  start and its readings climb with them, which the presenter already sets from each frame of the lapse; it stays on into the next slide too. This is
  only for a card that reads the live model (tiles alone, the ladder, the flows bars, the FibroScan, the spleen and the HVPG tracing). A lapse that
  opens on a patient of its own (it has `params`), and the Doppler, the vitals monitor, the beat trace, the flow-time chart and the talk trace, are built for
  the lapse as before, and the teaching card of a lapse slide is still built afresh (its bar is in it). No shipped deck has such a pair today, so
  nothing on screen changes until the rebuilt decks use it. The keep decision now counts a lapse's patient as the transition does (a lapse plays
  from the slide before's state, so it is not a new patient unless it has its own start). Code and unit tests only; nobody has looked on screen.
  `src/ui/card-keep.js`, `src/ui/presenter.js`, `tests/card-keep.test.js`.
- **Three new instruments for a slide's data card, and an encephalopathy tile: a spleen ultrasound, a vitals monitor and the HVPG catheter's
  tracing.** (Mohammad, 25 Oct, "yes to both"; deck rebuild plan, A4. No deck uses them yet; phase C does.) `tool: { kind: 'spleen' }` is a grey
  sector on the monitor's black with the spleen cut along its long axis, calipers end to end and the length in cm written in the picture in
  white with a dark outline, as the FibroScan's reading is. The scale is the same for every length, so a bigger spleen is drawn bigger; the
  picture redraws only when the length changes by 0.1 cm and eases between; with no spleen it says "Spleen removed". `tool: { kind: 'vitals',
  show? }` is a bedside monitor: the EKG strip across the top and up to three of heart rate, mean arterial pressure (named MAP, since the model
  has no systolic and diastolic), cardiac output and hemoglobin as large numbers, past-limit readings in the monitor's alarm red with the bottom
  bar's hold and hysteresis. `tool: { kind: 'hvpg' }` is the HVPG procedure's monitor with no catheter on the figure: going forward onto the
  slide it plays free pressure, balloon, wedge and result (about 9 s), and jumped to or gone back to it shows the finished tracing at once; a
  model change on the slide eases the levels, and the HVPG it prints is the difference of the two readings as shown. The `he` tile (HE risk,
  the model's index from 0 to 1; Low under 0.2, Moderate from 0.2, High from 0.45) joins the tiles, and the keyword highlighter knows
  "encephalopathy risk". The vitals monitor counts as a recording card, so a new patient starts its strip over. No gradients, glow, stripes
  or live dots on any of them; the numbers and words stay at 12 px or more. The tests run each instrument against a fake page with a real
  model's frames (no browser): `tests/instruments-a4.test.js`, `tests/instruments-draw.test.js`. Code and unit tests only; nobody has looked
  on screen. `src/ui/spleen-us.js`, `src/ui/vitals-monitor.js`, `src/ui/tool-hvpg.js`, `src/ui/hvpg-proc.js`, `src/ui/presenter-tools.js`,
  `src/ui/presenter.js`, `src/ui/card-keep.js`, `src/ui/table-marks.js`, `src/ui/vital-read.js`, `src/ui/dock.js`, `styles/app.css`.
- **"Where the portal blood goes" is one centred bar too, with its names under it in pills, none hanging.** (Mohammad, 25 Oct, on an iPhone:
  "The data card should be fixed similar to the other one (all of those kinds) centered", of the Next bleed slide's card.) Its two bars
  kept "Healthy" and "Now" in a gutter at the left, so on a phone the bars sat well right of the card's centre, and the names of small
  routes hung under the bar on leaders. Now the card is one bar across the whole card: the liver's segment first, then each route in its
  colour, largest first. The healthy split (all of it to the liver) is a dashed bracket over the bar with "Healthy: liver 100%" centred
  above it, drawn as the pressure ladder draws its Healthy line, so the liver's segment compares with the whole it would fill. A segment
  wide enough carries its name and percent; one that fits only its percent carries that; one too narrow for even that is named in a
  pill under the bar in its colour (the app's value pills), the pills in the bar's order in rows centred on the card. The card is ten em
  tall (it was 9.25) and holds two rows of pills; on a card or text size where they would not fit, the smallest routes join Other until
  they do, as before. A name that moves between the bar and a pill fades out and in. There is no gutter, no leader and no second bar
  left on either flow card, and no Now/Healthy row names. The causes waterfall, which has its own Healthy bar, is a different chart and
  is unchanged. Code and unit tests only; nobody has looked on screen. `src/ui/tool-flows.js`, `styles/app.css`,
  `tests/flows-inflow.test.js`, `tests/deck-charts.test.js`, `tests/data-sheet.test.js`, the authoring guides.

- **The beat trace gets a schematic EKG strip, the HVPG lane stays on small cards, and the three bleed runs turn breathing off.** (Mohammad, 25 Oct,
  "yes to both"; deck rebuild plan, A3.) The model's cardiac phase now travels with every pressure sample, and a thin EKG strip over the
  pressures lays a P wave, a QRS and a T wave on each beat, one QRS to a beat, in the text colour, with the heart rate at its right end
  like the other lanes' readings. It is a rhythm timed to the model's heartbeat, not a modelled ECG (the first slide of each run says so in
  its notes). On a slide the pressure lane now holds the portal pressure alone, since the HVPG lane under it is wedged minus free, and the
  HVPG lane is no longer dropped on a small card; it draws faint lines at 5, 10 and 12 mmHg, named once on a short lane. Where the room
  is short the strip goes first, then the HVPG lane (EKG about 15 %, pressures 50 %, HVPG 35 % of the room when all three show). A phone's
  trace box is 172 px instead of 140 so the HVPG lane fits there; the strip needs a taller card. Patients mode keeps its two lanes and
  gains two pills in the chart's pill row, EKG (off) and HVPG lane (on, as before). Breathing is off on Variceal bleed 2, Gastric varices 5
  and When the bleeding will not stop 2 (`params: { respiration: false }`), so the pressures show the heartbeat alone; a later preset
  brings it back, and the Doppler decks keep it. Code and unit tests only; nobody has looked on screen. `src/worker-core.js`,
  `src/ui/ekg.js`, `src/ui/trace-lanes.js`, `src/ui/pressure-time.js`, `tests/ekg-lane.test.js`.
- **A summary table never scrolls, on an iPad on its side or anywhere else.** (Mohammad, 25 Oct: "The tables on the slide before last scrolls
  right and left on iPad. They should not ever scroll.") The summary table was a scroll box of its own inside its card, so a table wider than
  the narrower, centred card (the 25 Oct width cap) scrolled sideways, and the card's fit never saw it: it only measured the card, and the
  box swallowed the overflow. Now the table is clipped, not scrollable, and the card's fit reads the table's own sideways overflow and
  zooms the card until every column is in view (first only as far as the lettering stays 12 px, then past it as a last resort, as the
  compact layout's cards do). Before it comes to a zoom, the table gives room itself: a column heading wraps between its words, never
  inside one, and the value columns keep less padding at their sides (the row names and notes keep theirs). A phone's and an upright
  tablet's rows are a grid that fits its width and are unchanged. The smoke check for summary tables now also runs an iPad on its side
  (1024 x 768, 1194 x 834, 1366 x 1024) and fails if the table scrolls sideways. Code and unit tests only; nobody has looked on screen.
  `src/ui/presenter.js`, `styles/app.css`, `tests/table-no-scroll.test.js`, `tests/e2e/smoke.mjs`.
- **Predict is gone; a slide can ask one short question on a glass card instead.** (Mohammad, 25 Oct, "yes to both"; deck rebuild plan, A2.)
  The four Predict slides (Circuit 6, Blood volume 3, Next bleed 4, Beta-blockers 7) no longer show choices, a tinted right answer or an
  answer line, and nothing about a guess is kept. Stepping onto one now brings up the case card's glass over the figure as it stands,
  tagged Question, with one question in large type; a tap, Next or a swipe lifts it. There is no camera pull-back and no new patient. A slide
  that changes the model lands holding the numbers before the change and plays the change after the lift (the time-lapse, or the eased
  change a compare button makes), the numbers following. The slide is the answer. Going back or jumping to the slide shows no card. A slide
  field `question` replaces `predict`; the handout prints the question before the slide's words. A case card can now also open a
  time-lapse: it covers the patient at the time-lapse's own start, and the days play after the lift. The question card keeps no data or
  teaching card from the slide before. Code and unit tests only; nobody has looked on screen. No handout figure changes. `src/ui/presenter.js`,
  `src/ui/card-keep.js`, `src/ui/handout.js`, `styles/app.css`, `tests/question-card.test.js`, `tests/case-card.test.js`.
- **Varices are graded Small or Large by size alone, with no F-codes; the wall tool says "wall stress" and uses σ.** (Mohammad, 25 Oct, "yes to
  both" to the varix and insufflation recommendations; deck rebuild plan, A1.) The scope's Grade row, the Tests card tile, the dock chip,
  the screen-reader summary and the inspector now read None (under 2.5 mm), Small (under 5 mm) or Large (5 mm or more). F1, F2, F3 and
  "Large, coil-shaped" are gone from Present and Patients alike: the model reads size only, and the codes also mean shape and red signs.
  The scope still draws a large varix beaded; that is its picture, not a grade. "Are there varices?" is one flag on the metrics
  (`varix.present`, `gastricVarix.present`: the diameter reaches 2.5 mm, or banded columns are still on the wall) that the figure, the
  circuit, the scope, the Tests card, the inspector's Grade stat and the screen-reader summary all read; the dock chip and the stat used
  to cut at 2.5 and 2.4 mm on their own. After banding shrinks a varix under the cut-off, the dock chip now says "Banded varices" and no
  longer "No varices". Laplace's ΔP · r / w is "wall stress" everywhere in the app's own words (wall tool, inspector, deck lines and
  notes) with σ as its symbol; "wall tension" stays only where a sentence quotes AASLD. The scope's Stigmata row says the red wale rule is
  the model's (70 % of the tear point). Code and unit tests only; nobody has looked on screen. `src/engine/metrics.js`,
  `src/ui/store.js`, `src/ui/instruments.js`, `src/ui/dock.js`, `src/ui/a11y.js`, `src/ui/actions.js`, `src/ui/inspector.js`,
  `tests/varix-grade.test.js`.
- **"Blood into the liver" is one centred bar with the Healthy line over it.** (Mohammad, 25 Oct: "The blood into the liver card sucks. Need
  to think of a way to center it. It's just so off center it's bad", then his pick of three drawn options.) The two bars had a 54 px gutter
  for "Healthy" and "Now" at their left, so they sat about 27 px right of the card's centre; on the opening slide the Now bar faded out but
  kept its space, and "Hepatic artery" hung on a leader under the right end. Now the liver's inflow is one bar across the whole card,
  centred top to bottom, with the healthy split as a dashed line over it, "Healthy portal 73%" above, as the pressure ladder marks its
  Healthy line. Names stay on the segments, 4 px clear of the line: "Hepatic artery" takes "Artery" where it does not fit, then the percent
  alone. The card is 6 em tall instead of 9.25, so the tiles under it get that room back. "Where the portal blood goes" took the same treatment in the entry above this one.
  Code only; nobody has looked on screen.

- **The outline, summary table, quick check and chart cards are narrower and centred on wide screens; the case card's question is centred.**
  (Mohammad, 25 Oct: "The outline card, the tables card and the questions card on wide screens like iPad side way and Mac should be more
  centered and not too wide... Need the viewer to focus"; then "The little question in the case card should be centered", then "Ladders OK but
  the rest can be narrowed".) On a Mac or an iPad on its side each full card is a centred card of its own width, in multiples of the
  teaching card's body text so it grows with the words: the outline 50, the table 54 and the quick check 42, and never more than 82% of the
  screen. The scale, the SAAG plot, the two capillary walls and the planes (stiffness against platelets and the others) take the table's
  width; only the six ladders keep the whole screen. A 1440 x 900 Mac, where they took 1366 px, now shows the outline about 1040 px
  wide, the table and the charts about 1120 and the quick check about 870; an iPad at 1024 x 768 shows them at 840 (the outline keeps its
  two columns down to 1024 wide). Phones and the upright iPad keep their full-width and 70% cards. The outline
  had a 1180 px width rule that never applied (the wide panel's own rule was more specific); it is gone. The case card's short question
  (`caseQ`) sat at the left of the card under its centred text, because the card is a flex column that starts its lines at the left and a
  line shorter than the card keeps its own width; each line of the case card now stretches across the card, on every device and deck.
  Code and unit tests only; nobody has looked on screen. `styles/app.css`, `tests/reading-cards-width.test.js`, `tests/case-card.test.js`.
- **Self-study is gone.** (Mohammad, 25 Oct: "I hate self study and question with it. Remove".) The Settings switch that showed each slide's
  handout question under a Question handle, the handle and its card, Show answer, their styles, their unit test and the guides' sections
  are removed; no slide, deck or other feature changed. Each slide's `ask` still prints in the handout, and a unit test still checks that
  every content slide has one. The two beta tester guide PDFs are back to the 18 Oct build, which never showed the switch. Anyone who had
  turned it on keeps an unused `pps.selfStudy` entry in their browser, which nothing reads. Code and unit tests only; nobody has looked
  on screen. `src/ui/presenter.js`, `src/ui/main.js`, `styles/app.css`, `tests/teaching-features.test.js`.
- **Five new talks, a Refractory ascites slide and an Overt encephalopathy slide.** (Mohammad, 25 Oct:
  "All and make sure to run by humanizer and update author guides", then "Yes" to the browser run for the figures and the two new slides.)
  New talks, each from the deck-teaching recommendations (F1 to F5), every line through the humanizer rules and every medical claim
  checked against the guideline files: **Stage the patient at the first visit** (Measuring, 12 slides; Baveno VIII 1.15, 1.16 and 1.19, five
  held cases), **When the bleeding will not stop** (Treatment, 8; Baveno VIII 5.16 and 5.35 to 5.37, AASLD 2024), **Doppler after a liver
  transplant** (Measuring, 7; Lechowicz et al., J Ultrason 2015), **One patient, ten years** (Complications, 14; Baveno VIII 3.15, 3.16, 4.1,
  4.3, 4.4, 4.6, 4.8, 4.13, 6.1, 6.16, 6.17) and **A TIPS from start to finish** (Treatment, 8; Baveno VIII 4.13, 4.15, 4.19, 5.31, 5.33,
  5.34, 6.3 to 6.11, 6.14, 6.16). Each uses only slide options that already exist (criteria card, held cases, hold rule, procedure, milestones,
  calipers, summary table); no Predict slide. Every number on a slide was read off the engine, and where the model cannot draw what the
  guideline describes the slide says so: one band stops a bleed but three sessions shrink a varix; the shunt tile reads 94% for any stent
  of 6 mm or more, so the stent-width slide uses the gradient and liver flow; a narrowed portal vein speeds the Doppler about 1.6 times,
  where a real jet is 3 to 4; there is no ammonia. Paracentesis: slide 9 (high-protein ascites, which repeated the Ascites talk) is
  gone, and a new slide 8, Refractory ascites, defined, a criteria card, comes before the TIPS slide; objective 4 and quick check 3 follow, and the definition
  is the deck's own wording (the Baveno VIII statements, 6.3 and 6.4, name refractory ascites without defining it). Encephalopathy: a new
  slide 4, Overt encephalopathy: the trigger first, then lactulose, then rifaximin, with the triggers on a criteria card in place of the
  phone-hidden list on the spontaneous-shunt slide; the order of treatment is the deck's own teaching. Handout figures for every new slide
  were drawn in a headless browser, the first browser run since 23 Oct, and the one for the removed slide deleted. Authoring guides: counts and the id list, rules 28
  (a decision talk follows one patient), 29 (state the source criteria and caveat what the model cannot draw) and 30 (model facts found).
  Nobody has looked at the new slides on a device. `src/ui/decks/{first-visit,refractory-bleed,transplant-doppler,ten-years,tips-journey}.js`,
  `src/ui/decks.js`, `tests/deck-adopted.js`.

- **A card that stays the same stays on screen when the slide changes.** (Mohammad, 25 Oct: "If the instrument data card on a deck is gonna
  stay the same for the next slide and only teaching card is changed or other way around we shouldn't reload the data card or vice versa
  keep it while you load the other card".) Every slide change used to fade both cards out and build both again. Now, when the next slide's
  data card is the same (same instrument and options, same tiles, title and layout), it stays up and live while the words swap; its tiles
  count to the new slide's numbers, and with a new patient the card follows the model as it eases rather than jumping ahead of the figure.
  When the words are the same and the patient is, the teaching card stays and only the data card swaps. A kept card that the new slide's
  layout would change (its size, fit or fold) is put back at once and leaves and returns as before. Not kept: the Doppler and the
  beat-by-beat trace through a new patient (their trace starts over), and slides with a time-lapse, the catheter, a case card (a new
  patient's), a question or a Predict slide. Present on Mac, iPad and iPhone, in every deck. In the decks as they stand it applies to two
  slide changes (Circulation 4 to 5 and HVPG 7 to 8), because almost every other slide that repeats an instrument brings a new patient
  behind a case card, runs a time-lapse, asks a question or changes its tiles; the words card is never the same twice in them. It is
  there for the decks being written. Code and unit checks only; nobody has looked on screen. `src/ui/card-keep.js`; tests:
  `tests/card-keep.test.js`.
- **The decks' wording, order and quick checks were gone over (words and data only; nothing on screen has been looked at).** (Mohammad, 25 Oct:
  "All" from the deck-teaching recommendations.) Lines: a second "Colored by" sentence is cut where the key already says it (Circulation,
  Two inflows, Sites, Outflow, Treatment, Beta-blockers); lines of 42 to 44 words are shorter (Doppler 2 and 10, Varices 2, Variceal bleed 5,
  Shunts 6, One year 2 and 10); the slide before a reveal ends on the puzzle (Circulation 5, Hyperdynamic 3, Ascites 4); titles name the
  finding (Circuit 9, Two inflows 5 and 6, Right heart 5, Shunts 3 to 5); a slide that loads another patient says so (Ascites, Spleen 8);
  Where is the resistance? ends all six question slides on one sentence. Order: Stiffness 9 follows the rule; Ascites 6 and 7 (portal vein
  clot, schistosomiasis) follow the mechanism; Circulation's three lobule slides are one; Varices lost its splenic vein slide, which
  Pre-hepatic and Gastric varices teach. Quick checks: a reasoning question in Circulation, Circuit, Two inflows, HVPG, Hyperdynamic,
  Where is the resistance?, Blood volume, Encephalopathy, Recompensation, Pregnancy, Treating the cause, Shunts and TIPS Doppler. Medical,
  each against the guideline files: octreotide is a 50 µg bolus then 25 to 50 µg an hour (AASLD 2024); a covered stent is preferred to a
  balloon tube (Baveno VIII 5.35); the HVPG response (10% or to 12 mmHg) is Baveno VIII Table 3, stated for primary prophylaxis, and the
  20% figure is gone from HVPG 5; Budd–Chiari starts with anticoagulation (EASL 2025); the 4 in 10 and 7 in 10 recanalization rates name
  their populations; Recompensation 2 says Baveno VIII starts carvedilol at CSPH; Next bleed 8 stops carvedilol under 12 mmHg (AASLD 2024);
  Choose the treatment's case 4 and Outflow 6 (a TIPS beside the DIPS) get live buttons. The authoring guides gained the rules behind this (guide rules 24 to 27).
- **The organs' pictures are painted on the GPU from their own shapes.** (Mohammad, 25 Oct: no more SVG → image → canvas → read back →
  upload.) The heart and esophagus, the gut, the kidney, the stomach and the bowel were each a picture made by copying the SVG, loading
  it as an image, drawing it on a 2D canvas, reading its pixels back and uploading them, after every change and every settled pan or zoom.
  Now the painter that already drew the liver, spleen and diaphragm reads them too (nested masks and see-through groups painted in
  layers of their own, as the browser lays them), and paints each layer into a texture that stays on the GPU, a few milliseconds a frame:
  a pan or zoom only moves it. Shapes keep their arrays on the GPU while they are drawn. A layer the painter cannot read is still made
  from the SVG copy; software renderers keep the old pictures (CI unchanged).
- **The lobule dive's hand-over is gradual.** The field of lobules comes in over two octaves of zoom (it was under one, at the dive's
  fastest: lobules and vessels popped), the zoom eases on a sine curve, the field arrives soft and sharpens, and the lobules away from the
  landing one stay a little soft until it lands (a mip bias in the field's shader: no extra pass).

- **The zoom into the lobule goes about four times deeper, through simpler lobules first, and its field of lobules is drawn on the GPU.**
  (Mohammad, 24 Oct: "the zoom into the lobule and out is 1) still laggy, and 2) the lobule appears to be larger than what it should ...
  maybe we need to have simpler lobules at super zoomed out level then more defined then more defined and then our main lobule appears
  lastly".) The anatomy now zooms ×16 into one part of the liver, its vessels still drawn, before any lobule shows (it handed over at
  ×5, while the liver and its portal branches still filled the screen: Mohammad's iPad photo, 24 Oct); the field's lobules come in only
  over its last stretch, about true to scale (a radius of 19 px at ×16), and fill the screen before the neighbours fade toward the landing.
  The whole dive zooms about ×140 on a phone and ×230 on a Mac instead of ×34 and ×57. Zooming in, the anatomy stays whole under the
  field until the field covers it (fading both at once let the page through: a dark flash). The field's tile sizes, each with its
  own detail (a fine grain of outlines and vein dots when small; triads and septa; then sinusoids and fibres), are now blended on the GPU by
  where the zoom is between them, so the lobules gain detail gradually as they grow and the main lobule fades in last, at about a sixth of
  its size. The field was four passes over the whole screen on the main thread each frame; it is now one shader pass (`src/ui/field-gl.js`)
  with the same tiles, quieting, fade and emerging mask, sent to the GPU ahead of the dive (the 2D canvas still draws it without WebGL2).
  The dive takes 2.2 s and the way out 1.3 s (1.6 s and 1.0 s before), so its pace on a log scale stays about the same. Every way into
  the lobule (View row, the liver's card, search, slides and the scale switch) in Present and Patients, on every device. Code and unit
  checks only; nobody has looked on screen. Tests: `tests/lobule-field-gpu.test.js`, `tests/lobule-field.test.js`.

- **BRTO and BATO play slower with a closer camera, their step callouts keep off the vessels and follow light and dark mode, and they are
  offered only when there are gastric varices.** (Mohammad, 23 Oct: "The BRTO/BATO animations should be refined, like camera zoom and slower;
  also the callouts are still in the way, and they're not obeying light/dark mode; and they only need to be options when the varices are
  present".) Each now lasts 24 s instead of 15 s: the catheter travels for 7 s while the view follows its tip, the camera closes in on the
  stretch it works on, then closer again on the vein it treats (the shunt for BRTO, the short gastric feeder for BATO) before the sclerosant
  fills, and every camera move glides for 1.4 to 2 s. The step callout tries spots all round the tip and takes the one that crosses the
  fewest vessels (the catheter's own route included), keeps off the cards and the tip, and keeps its leader off other vessels. Its glass had
  been painted solid grey by the leader's style (a dark box in light mode, a pale one under white words in dark mode); it is now the same
  frosted glass as every other figure callout. In Tests › HVPG the BRTO and BATO buttons are shown only while the fundal varices are large
  enough to grade (2.4 mm, the Fundal varices card's own "none"), and a slide's Play button likewise. TIPS is unchanged. Checked on desktop
  in light and dark mode and on an iPad on its side (screenshots). Tests: `tests/proc-anim.test.js`.
- **The six-site ladders (Sites 10 of 12, Where-resistance 14) use their room better, and a phone's rows carry the HVPG and PPG pills.**
  (Mohammad, 23 Oct: "this slide can be optimized in terms of sizes; the cards are wasting some space below sinusoidal within each card; also
  the title is wasting space. also for the phone view, it should have the HVPG PPG pills".) On a Mac or an iPad on its side the card's title
  steps down to the Compact title step (0.8 of its size), so it stands on one line where it had run a second for its last two words and
  every case gets that height; each case's chart reaches half a type size into the cell's bottom padding, which is blank under the brace's
  name, and the padding is shorter, so the plots stand taller. On an upright phone or tablet each row ends in two pills, "HVPG n" and "PPG n",
  the whole mmHg the chart's brackets read, tinted by the same cut-offs; the cause steps down (never under 12 px) to leave them room, and
  where it cannot stay beside the site and the pills it goes under the site at the largest size the row holds, the pills staying at the right of
  the first line. A phone on its side shows none (two columns, no height for a second line). Code and unit checks only; nobody has looked
  on screen. Tests: `tests/grid-key-phone.test.js`.
- **A teaching card too tall for its data card no longer cuts the data card off (Mac and iPad on its side).** (Mohammad, 23 Oct, Sites 4 of 12
  on a Mac: "remove CAUSES perhaps; fix the title so it's not too big; I want the data card to show".) At a larger text size the two-line
  title and the long CAUSES line left the Gut to heart chart about 180 px, and a chart that cannot zoom lost its foot. When the pair is still
  too tall at Compact with the data card's blocks stepped down, the words' card now gives way once more before anything is cut off: its title
  one step smaller (0.62 of Regular, still well above the words), then the CAUSES line gone, the blocks stepping again from full size under
  each. Only a slide the earlier steps could not fit comes here, so every slide that fitted stays as it was; applies to every stacked data
  card in every deck on Mac and iPad on its side. A phone never showed CAUSES. Code and unit checks, and one headless look at Sites 4 at a
  125 % text size; the other decks and sizes have not been compared.
- **Wide chart-only time-lapse cards keep their full width and readable plots.** The chart uses the space below the teaching card,
  reserving its header, padding and gaps before choosing a height. Its minimum accounts for both plots, a wrapped legend and treatment
  bars; shorter windows retain the existing fitting fallback. Applies to every wide chart-only time-lapse card. Circulation's meal slide
  also uses the shorter approved explanation. Code and unit checks only; no browser or device review has been run.
- **The lower colon and small bowel extend a little further down, with more depth at the colon's edges.** The lower gut is 8% taller
  below its upper attachments; its artwork, outlines, vessel covers, appendix, captions and rectum fade follow together. A faint inner
  shadow and upper-left highlight round the colon's scalloped edges in each theme, using the existing tissue colors. Vessels stay in
  place. The shared gut camera region also extends to hold the taller bowel's glow. Applies to the anatomy in Patients and every
  presentation. Code and unit checks only; the changed art has not been viewed on screen.
- **One sideways swipe on a Mac trackpad moves one slide; the up and down arrow keys work the stack, not the slides.** (Mohammad, 22 Oct:
  "swiping sideways on mac is moving multiple slides"; "up and down arrow keys should tuck and untuck on mac ... not move slides".) A flick's
  momentum glide runs a second or more after the fingers lift, with an odd zero or bump in it, and the wheel rule took any of those for a
  fresh push and acted again: a simulated flick moved two to six slides. A gesture now lasts until the wheel goes quiet (250 ms between
  events, timed by the events' own stamps, so a slow frame cannot split a glide) and acts once, for slides, case cards and the stack alike;
  only fingers turned clearly back the other way in one unbroken run start the next action inside a glide. The Up arrow brings the stacked
  card's readings out and the Down arrow tucks them, eased as the swipe is (Mac, iPad on its side; never over a case card; a focused slider,
  field or the slide list keeps its arrows); Left, Right, Page Up, Page Down, Space, Enter and Backspace still move slides. The Guide lists
  the keys. Checked on simulated wheel streams only; nobody has tried it on a Mac trackpad. Tests: `tests/wheel-gesture.test.js`.
- **A Mac trackpad works the stack and the slides like a finger; an iPad on its side swipes the stack anywhere.** (Mohammad, 22 Oct.) In a
  talk, a two-finger swipe up on the trackpad anywhere on the slide (or a mouse-wheel notch up) brings the readings' card out, a swipe down
  tucks it away, a swipe left goes on and a swipe right goes back, or throws a case card off the way the fingers go. One action a gesture, eased
  like the finger's, whatever the Mac's scroll direction setting says (it follows the fingers); a pinch stays the figure's, and a box that scrolls
  itself keeps its wheel. A sideways glide never ends the talk on its last slide. On an iPad held sideways a swipe up or down anywhere on the
  figure or the words opens and tucks the stack as on an iPhone, and a sideways swipe over the data card moves the slide (the card no longer
  docks to the side there). Checked headless with real wheel and touch events on a 1280×800 window and a 1180×820 touch window; nobody has
  tried it on a Mac trackpad or an iPad. Tests: `tests/wheel-gesture.test.js`, `tests/card-swipe-anywhere.test.js`.
- **The Gut to heart chart stacks on Mac and iPad landscape like every other instrument.** It was the one chart left with its tiles beside
  it (Mohammad, 22 Oct: "every stacked should be stacked"). Its card now sits under the words with the readings' card tucked behind its
  top, in every deck, as on a phone. The chart is drawn at its own size and never zoomed by the fit, so where the words are so tall that the
  card does not fit in the room under them even at the smallest steps (HVPG slide 5 below about 900 px tall, Treatment slides 5 and 11 at
  1024x768) the words' card eases up with the data card and its top slips behind the screen's top, as it already does when the readings
  come out, instead of the chart spilling out of its card. Looked at headless on 1440x900, 1280x800, 1180x820 and 1024x768; nobody has
  looked at it on a device. Tests: `tests/wide-stack.test.js`, `tests/data-sheet.test.js`.
- **Cardiac output reads 8 L/min as the top of normal everywhere, and the Hyperdynamic deck's words follow.** Mohammad's call (22 Oct):
  the tile's "Normal up to 8 L/min" stands. The bottom bar's own flag for the output (a strip no screen shows) moves from 6.5 to 8, and
  Tests › Readouts already rates it as the tile does, so nothing flags a 6.6 or 6.7 L/min output. The Hyperdynamic deck no longer calls a
  normal output "high": its objective, summary, quick check and the slide "More output, less resistance" say the output, the heart rate
  and the arterial pressure are higher or lower than in health, and the speaker notes say both numbers can sit inside their normal ranges
  while the resistance has still fallen. Tests: `tests/readouts-tab.test.js`.
- **The author guides are up to date again.** Both deck guides (`docs/deck-authoring-guide.md` and the quick guide) were checked against
  the code on 22 Oct. New in them: the bedside time-lapse (`lapse.clock: 'seconds'`) and the `meal` and `fenestrae` settings (a meal is
  ramped with `meal`, not `splanchnicTone`), the `gut` camera region, patient buttons that carry `params` and `days`, `procedure`
  (TIPS, BRTO, BATO), the time-point and gate buttons, the `gv`, `co` and `bv` table columns, the one set of flow cut-offs, the Gut to heart
  chart's zones, pills and red block, the six-case grid, the reasoning question in the closing quick check, question and answer pairs, and
  the six decks added since 20 Oct. Docs only.
- **The Systemic row of Tests › Readouts gets bars.** MAP, heart rate, cardiac output, RA pressure and Hb were plain numbers (red past an
  unlisted cut-off of the bottom bar's own: 65, 110, 6.5, 10 and 7). Each is now a tile like the ones above it, with a bar, a tick at every
  cut-off and a rating word, and takes its scale, cut-offs, word and colour from its data card tile (`SCALE` and `RATE` in
  `table-marks.js`), so the Readouts and the data card tiles can never disagree about what is normal. Where they did differ, the card's
  numbers now win in this row: a heart rate is "Fast" over 100 (was red over 110), RA pressure "High" over 8 (was 10), hemoglobin "Low" under
  12 and "Severe" under 7 (was red under 7 only). A slow heart rate and a high output show gray, as on the card. The bottom bar's own
  strip of the five values is not shown on any screen and keeps its flags. Code only; looked at on screen on Mac and phone widths for the
  row's height and words. Test: `tests/readouts-tab.test.js`.
- **Cardiac output and Blood volume tiles get their normal bands.** They were the only two data card tiles left with a bare gray track and
  no word. Each now has coloured bands with its cut-off numbers, a dot for now, a ring for the start and a rating word, in Heart rate's
  style (Mohammad, 22 Oct: any tile should always have its normal where it can). The guideline files give no numbers for either, so these
  are the standard physiology ranges: a resting adult's cardiac output is 4 to 8 L/min (cardiac index 2.5 to 4 L/min/m²), and the blood
  volume is about 70 mL/kg, 4.5 to 5.5 L for the model's 70 kg adult (±10% of its 5.0 L). A low one is red ("Low"); a high one (output over
  8 L/min, volume over 5.5 L) is gray "High", not a warning, as a slow heart rate is, because pregnancy and the hyperdynamic circulation of
  cirrhosis raise both on their own. The same rating now colours the {co} and {bv} pills and callouts, the cut-off lines on a curve of either, and a
  summary table read against normal flags only a low one (↓↓). Every tile in every deck, in Present, Patients and Explore and on every
  device takes it. A new test fails for any tile left bare. Code only, not looked at on screen. Tests: `tests/tile-bar.test.js`,
  `tests/callouts.test.js`, `tests/model-charts.test.js`.
- **The stent's three callouts keep their places when a point is picked.** On the TIPS Doppler slides the middle callout could jump to the
  far side of the stent (or the whole column land there) when Proximal, Mid or Distal was picked, depending on whether the Doppler probe
  or the callouts reached the screen first: the probe's body and line of sight counted as obstacles to the callouts, and its place was
  worked out before they stood. The three now ignore the probe (the column's side, its spots and whether it shows are the stent's and
  the screen's alone, as the layout's own comment always said), the probe waits until they show (four seconds at most) and keeps off
  them, and the callouts stay level with their dots, 16 px away, on every pick, on every slide and device that calls out a stent's
  points (the TIPS Doppler deck, Read the Doppler). The browser check "the stent slides call out all three points" had been passing
  without testing anything (its slide numbers had gone stale and it read the pick buttons before they drew); it now finds the slides
  by name, waits for the buttons and the pick, counts only the figure's own leader dots (the lobule view's hidden ones fell under the
  callouts), reads the monitor and the green callout together once the live trace has ticked them to the same number, and passes on
  desktop and phone with its rules unchanged. Tests: `tests/tips-doppler-points.test.js`, `tests/dop-probe.test.js`.
- **A narrowing's "60 %" fits.** On the TIPS Doppler slides with a narrowing (the narrowed stent, where it narrows), the "60 %" stood
  between its arrow and the distal callout with its "%" under "TIPS". A redraw of the figure's marks had put it back on the vessel's own
  side, undoing the side the layout chose (the one the stent's column of callouts leaves free). One rule now places the "60 %" wherever it
  shows (every deck, Explore, Patients, the circuit, phone, iPad and Mac): on the side the layout chose, reading outward from its spot,
  level whatever the figure's turn. Where the spot has to stand off from the clamp (a crowded stretch of the liver, or off the Doppler
  probe) a thin leader joins it to the nearer arrow, as the probe's own move already did. Tests: `tests/clamp-label-place.test.js`, and the
  browser check "the narrowing's 60 % keeps clear of every callout, label and arrow".
  The "60 %" also reads in the same size as the callouts beside it: it had been fixed at 12 px, smaller than the names of the readings
  ("TIPS distal") wherever the figure's text is larger (a laptop or iPad, a bigger text size in Settings, a presentation at the
  projector's size). It now takes the labels' own name size (13.6 px on a Mac or iPad, 12 px on a phone, following the text size
  setting), the same weight and the same stage-coloured outline, with its gap from the spot and its leader's stop-short growing with it.
- **WHVP and FHVP tiles get the scale bar.** The two tiles used to show a bare number with an empty bar. They now carry coloured
  bands, a dot for now and a ring for the start, and a rating word, like HVPG's. The guidelines give no cut-offs for either pressure on
  its own, so each is judged as the pressure it stands for, with the numbers the summary tables already used: the wedged pressure like
  the portal vein's (normal up to 10 mmHg, "High" over 10, "Severe" from 15), the free pressure like the IVC's (normal up to 8, "High"
  over 8; AASLD 2024, Box 2: FHVP and IVC pressure should be almost identical). The same on every slide that shows them (Sites 3, the
  HVPG deck, One year), on phone, iPad and Mac. A WHVP or FHVP written into a slide's words (`{whvp}`, `{fhvp}`), a figure pill or a
  callout now takes the same green, amber or red, and in Explore and Patients the two readings of Tests › HVPG take it too (easing,
  never snapping). Tests: `tests/tile-bar.test.js`, `tests/pill-rating-tone.test.js`.
- **Ladder: HVPG and PPG pills in the plot's top right.** Every Gut to heart ladder (the data cards, the slides' charts, each case of the
  six-case grids on Mac and iPad) shows the two readings as two small pills, "HVPG 5" and "PPG 16", in the plot's top right corner, in the
  same whole numbers and the same green, amber and red as the brackets (HVPG amber from 5, red from 10; PPG amber from 6, red from 12).
  Each pill is as wide as its name and the widest value, so a number changing never moves an edge. They stand in a row, or one over the
  other where the row does not fit, in the nearest place to the corner that keeps 4 px clear of every line, reading, block, zone name and
  bracket; a new state eases them there (never jumping), and where a place appears or disappears they fade. Where a chart is too crowded
  for pills that clear all that (the narrow six-case cells on Mac and iPad, some phone and iPad states), they stand down and the brackets
  keep the same two numbers: the brackets and the plot's height never give way for them. The phone's one-line cases and the app's own
  Pressure panel in Explore and Patients are not changed. Tests: `tests/ladder-pills.test.js`.
- **Ladder: three zones, three tints.** The Gut to heart ladder's one LIVER band becomes three soft tints, each named over the plot in full:
  PRE-HEPATIC over Gut and PV (a cool blue), INTRAHEPATIC over the liver's Pre-, Intra- and Post- columns (the warm tint the LIVER band
  had) and POST-HEPATIC over HV, IVC and RA (a green); the written-out words never read as the Pre- and Post- stations under the axis.
  The three names are set as wide as the chart allows: on one line, else with the letters a little closer, else on two lines ("PRE"
  over "HEPATIC"; every iPhone), else on two with the letters closer (a small grid cell), and none where even that cannot fit, only
  the tints. The strip over the plot is as tall as the names need (about half an em more than the old one line; one em more for a
  second line), and a name stands clear of a reading at the plot's top and of a block hanging from it. The phone's one-line cases get the
  three tints too (no names, as they had none). The app's own Pressure panel (Explore, Patients) is a separate chart and is unchanged.
  Tests: `tests/deck-charts.test.js`, `tests/grid-key-phone.test.js`, `tests/data-sheet.test.js`.
- **Ladder: full width and a readable height at every window size.** On a Mac, an iPad landscape or a wide window, the data card sits under
  the words' card, and a card too tall for its room is shrunk in fixed steps. One of the card's width rules (its fit times the block step)
  outranked the ladder's own full-width rule, so the Gut to heart ladder on Sites 4 and 5 was drawn at about a third of its card, its plot a
  few px tall, its HVPG and Healthy words piled over the numbers. The ladder (and the portal blood bars) now keep the card's full width, and
  the ladder's height steps with the card's block steps (never with the fit, so it still cannot vibrate), at least 28 % of the window's
  height; a ladder beside its tiles (Treatment 2 to 5, HVPG 5 and others) no longer stops at its minimum. In a short window, and on a phone
  held sideways, where the card has the window's height to itself beside the words, the ladder takes up to 48 % of it instead of a flat
  170 px. Tests: `tests/data-sheet.test.js`.
- **Ladder: the resistance block stands on its column.** The red hatched block on the Gut to heart ladder used to hang in the gap between
  the two readings the pressure falls across. It now stands on the column of the station the pressure falls from (Pre- to Intra- marks
  Pre-, Intra- to Post- marks Intra-, Post- to HV marks Post-, the portal vein to Pre- marks PV, HV to IVC marks HV, and the heart marks the
  RA), as wide as a two-digit reading, from just over that reading down to the level of the one it falls to (the heart's down to zero).
  The reading, the line and the station names are drawn over the block and keep their outline, and the dashed Healthy and Before lines are
  drawn again over it, so all of them stay whole. The same on the chart (every deck's data card, phone, iPad and Mac) and on the phone's
  one-line cases; the app's own Pressure panel (Explore, Patients) draws no block, as before. A block still fades in and out and moves
  with the line as it eases. Tests:
  `tests/sweep-fixes-2-brackets.test.js`, `tests/grid-key-phone.test.js`.
- **Fluid balance card: one strip.** The card is redrawn for the slides that opt in with `window: true` (Ascites 4 and 5, Tap, Recompensation,
  the Testing deck). It leads with the answer ("Each day · ascites builds ▲ 160"), then the lymph made with its Liver and Gut, then one strip
  that splits the day on one scale: what the lymphatics carry (named inside the bar, with "full" once they can carry no more, or the room left
  as a dashed outline), what the belly reabsorbs and what builds, with a bracket over what leaked. Under it the forces are one strip too:
  the push and the pull as two arrows meeting at the wall, named inside. Every size is em from one text size, so the card scales as one, and
  that size holds 12 px on the screen after the card's zoom (an iPhone on Ascites 5 had come down to about 10.8 px); the block now fills
  the card's width instead of shrinking with the zoom. Parts with nothing in them are dashed swatches or outlines, and every part eases.
  Same numbers as before; Liver and Gut are no longer keyed by colour on the strip (they are printed in the line above it). The flow
  picture (no `window`) keeps its own drawing but takes the new forces strip. Tests: `tests/fluid-window.test.js`.
- **No stray dots in the circuit.** A station's dot used to show whether or not a vessel was drawn at it: in health, four hollow dots
  floated alone (the gastric bed, the fundal varices, the esophageal varices and the epigastric veins, whose vessels are left out or
  still closed), because the stylesheet's "show every circuit dot" rule outranked the one that fades a dot out. A dot, its label and
  the Δ ring after a change now show only while a vessel is drawn at that station, in every deck, preset and mode, on every device.
  A collateral or shunt that draws on brings its far end's dot in once it has arrived, and one that retracts takes it away as it
  withdraws; each dot fades, never snaps, and none shows on the first frame. Tests: `tests/circuit-nodes.test.js`.
- **Card titles keep a unit's case.** The data card's header is set in capitals, which turned "Fluid balance · mL/day" into "ML/DAY".
  A unit in a title (mmHg, kPa, mL, mL/day, mL/min, L/min, cm/s, m/s) now sits in its own span that the style leaves as typed, on the card's
  header and on the copy of it that folds under the words on a Mac or iPad. Only the Fluid balance title has a unit today; the rest of
  the header is unchanged.
- **Fluid balance card: ghost parts.** Every part of the capacity window is now always drawn: a part with nothing in it is a
  dashed outline in its own colour that the solid part grows out of (the room left in the window, the overflow's cap and drop,
  the Leaked and Reabsorbed lanes, the gut's swatch), so nothing pops in or out as a time-lapse moves the numbers, and 10 mL a day
  still leaves a mark. Two swatches key the fill's two greens to Liver and Gut (they give way on a card too narrow for them). The
  lanes' names sit on the left and their numbers on the card's right edge with the sum's and the day's, a dotted leader between;
  "Nothing runs over, so none collects" is replaced by the dashed lanes reading 0. The Reabsorbed lane now shows whenever something
  is reabsorbed, not only while something also leaks. Same height as before. Tests: `tests/fluid-window.test.js`.
- **Change since, in the lobule.** A slide that colours by change since an earlier slide (`lens: 'since'`) now does so in the
  lobule and sinusoid-zoom views too, where it used to fall back to plain pressure colours under a "Change vs …" key. The lobule's
  vessels and its three readings count from the same reference as the figure's vessels, and ease to a new one instead of snapping. Every other lens and
  Patients are untouched. Used on Propranolol or carvedilol? slides 4 and 7 (carvedilol against propranolol). Tests: `tests/lobule-since.test.js`.
- **Phone colour key beside the pill, on two lines.** A key too long for one line beside the nav pill now flows its name and
  swatches over two lines there, then tries the swatches' short names (blood origin: SMV, IMV, SV, HA, Sys), before taking a row
  of its own above the pill, which had cost the words a whole line and left the room beside the pill empty (TIPS Doppler 3 on an iPhone).
- **Phone teaching card: Regular where there is room.** On a phone or an upright iPad, words that need a little more than their
  share now take it from the figure (which keeps at least a quarter of the screen's height, 170 px at least) instead of dropping a
  whole step to Compact and leaving that room empty: PVT in cirrhosis slide 5 on an iPhone had come in at Compact over a large bare
  figure. Words that would take more than that still go to Compact, with the figure's full share. Tests: `tests/card-type.test.js`.
- **Moving blood: less GPU work per frame, same picture.** A frame where only the blood moves now repaints just the squares
  of the figure that a lumen can reach, instead of every square near a vessel (casings, shadows and the space around thin
  vessels stay as the last frame left them, since the blood never changes them). A sicker patient opens far more vessels
  (decompensated cirrhosis about 106 against 38 for a healthy one: collaterals, braided varices, caput medusae), so this cut
  is largest there. Any frame where something else changed repaints every square as before. Tests: `tests/blood-cells.test.js`.
- **Congestion view: colour only.** The halo around backed-up veins is gone (on the GPU and in Lite graphics): it reached
  full strength at 8 mmHg while the colour runs to 15, spread well past each vein and repeated what the colour says. The
  veins' colour now carries congestion, as every other view carries its data, and the view draws a narrower band per vein.
- **Send feedback.** Settings has a new Send feedback item at its top (in talks too): it opens a draft in the viewer's own email app,
  addressed to the author, with the build, device, screen size and a link back to the exact view; the app sends nothing
  itself (Privacy says so). After ten minutes of active use in one visit, a message card asks once for feedback (Send
  feedback or Not now; Not now asks once more on a later visit), never during a drag, a talk or projector mode.
- **Pregnancy, and a Cirrhosis in pregnancy patient.** A new setting, the weeks of pregnancy (0 to 40), changes the
  circulation as pregnancy does: blood volume up about a third (most of it plasma, so the hemoglobin falls to about 12),
  cardiac output up about half, the heart about 15 beats a minute faster, splanchnic and systemic vasodilation, and from
  20 weeks a rising abdominal pressure from the uterus. The new patient (Sinusoidal) has compensated cirrhosis with small
  varices and an HVPG of about 12 before pregnancy; at 24 weeks the portal inflow is a third higher, HVPG about 13 and
  the varices large with red wale signs, and propranolol takes them back to small. The weeks are a slider on the heart
  card (shown for a pregnant patient), in Changes and in Why?. At 0 weeks nothing changes for any other patient.
  Tests: `tests/pregnancy.test.js`.
- **Colored by oxygen.** A new view in Colored by shows each vessel's oxygen saturation, 60 to 100 %, from blue
  (deoxygenated) to cerise red (arterial). The hepatic artery is 98 %, the portal vein about 85 % (gut venous blood),
  systemic veins about 75 %; the sinusoids mix portal and arterial blood at the portal tract and darken toward the
  central vein as the liver takes about a quarter of the oxygen, so hepatic venous blood is about 65 %. Saturation
  mixes flow-weighted at every junction, so when portal flow falls or reverses the hepatic artery's blood fills the
  sinusoids (the buffer response). The lobule colours its vessels the same way, the vessel card reads the saturation,
  and "colored by oxygen" in slide words is a cerise pill. Tests: `tests/oxygen.test.js`.
- **Less work per frame while a glow eases, and for the FibroScan waves.** Hovering, selecting or a slide's glow
  easing in now rewrites only the glow values of the vessels instead of rebuilding all of them each frame, the FibroScan
  probe's waves write a path or an opacity only when it changed, hidden SVG tubes under the GPU are written when they
  show again, label widths and the label check keep their measurements, and fonts and the brand art load from the
  offline cache at once (refreshed behind it). The picture is the same. Test: `tests/frame-costs-glow.test.js`.
- **Colour changes no longer redraw every vessel.** When only vessels' colours change (the pulse, the lobule's lymph
  tint, a lens fade), the vessel layer draws again just the pixels those colours reach, with the same shader, instead
  of the whole layer: the lymph tint moves all 63 lymph channels at once, which used to redraw over 90 % of the
  lobule's vessel cells about 12 times a second. Casings, shadows and the space between vessels stay as drawn, so the
  picture is the same pixel for pixel. Tests: `tests/veins-tint.test.js`, smoke:rows (a colour-only case).
- **The view switch is its own centred pill, just above the play bar.** On every screen (upright phone and iPad, Mac,
  iPad and phone held sideways) Circuit, Anatomy, Lobule and Sinusoid sit in one pill, centred on the screen 8 px above
  the play bar, the selected view in a soft inner pill. It is no longer part of the dock or the Mac's top bar. A card
  on an upright phone or iPad covers it as it covers the play row. In the sinusoid view the same pill sits centred at
  the bottom, level with +, − and Fit, which now stand upright at the bottom right on every screen. While presenting,
  the switch stays in the top bar. Test: smoke "view switch: a centred pill 8 px above the play bar".
- **The view switch is the bottom bar's first line, one tap away.** On an upright phone or iPad the switch (Circuit,
  Anatomy, Lobule, Sinusoid) is one slim line at the top of the dock, above the play row: small text, the selected view
  in a soft pill, no box. A card covers it as it covers the play row. The tab labels sit whole on an iPhone again (the
  switch had shared the tab row's line, which Safari sized too short), the flat band under the dock shows only while a
  card is up, and on a 320 px phone both readings fit. The sinusoid view, which hides the dock, puts Lobule and Sinusoid
  in a pill at the bottom left, level with +, − and Fit. The top bar is two chips again. Mac, iPad and phone held
  sideways keep the switch in the top bar. The View tab is called **Layers** again (Fit to screen, Turn upright, the
  layers). Tests: smoke "view switch: one tap" (13 screen sizes, every view) and "every tab and view label sits whole".
- **Blood loss gives realistic vital signs (ATLS classes).** A 500 mL bleed in a healthy adult used to drop the mean
  pressure from 93 to 76 and a litre left almost no circulation. Two reflexes now compensate: the venous reservoir
  (sympathetic venoconstriction moves unstressed blood back into circulation, Gelman 2008) and a volume afferent that
  speeds the heart before the pressure falls. Healthy, MAP/HR: 500 mL 91/74, 1000 mL 87/92, 1500 mL 79/119, 2000 mL
  62/168 (ATLS 10th ed.: class I, II, III, IV). Cirrhosis has less reserve and a blunted heart rate; carvedilol blunts
  it more. The shock class now counts the patient's own blood volume (the plasma expansion of cirrhosis no longer reads
  as a negative loss). The variceal bleed talk tears a little wider (0.35) so its "Shock before anemia" slide is a class
  II loss. Test: `tests/bleed.test.js`.
- **Bottom bar rearranged (option 2).** On an upright phone or tablet the bottom is two bands instead of three: the
  view switch and Fit no longer float above the dock. A **View** tab replaces Layers and holds the views (Circuit,
  Anatomy, Lobule, Sinusoid), Fit to screen, Turn upright (circuit) and, under them, the layers of the current view.
  The play row is one slim line: play, speed, clock and jump, then the two key readings as plain numbers (no bars or
  rating words; their colour still shows normal, raised or high). A Mac or an iPad held sideways gets the same slim
  bar, with Compare labelled. The sinusoid view keeps its zoom buttons (+, − back to the lobule, Fit) at the bottom
  right. Present is unchanged. Tests: smoke "slim play line" and the thumb dock checks.
- **Language selection removed (for now).** Settings no longer has a Language menu, and the Spanish, French,
  Portuguese and Arabic interface strings are gone with it, so the app is English only. A language saved in the browser
  is cleared on load, and a shared link with `?lang=` simply opens in English. Language selection may come back later.
  Test: `tests/no-language.test.js`.
- **Student role removed (for now).** Settings no longer has "I am a…" (Student or Instructor), and the role is gone from
  the app's internals, so everyone gets what Instructor had: every lens in Colored by, pressure values on the figure, the
  full play bar and History, all procedures in Treat, and Advanced physiology in Settings. "Always show HVPG" is on unless
  someone turned it off, so the HVPG still shows without measuring, as before. A role saved in the browser is cleared on load. A simpler student mode may
  come back later. Test: `tests/no-role.test.js`.
- **No Patient button.** The top bar is Treat, Tests, Settings and Search. The abnormal-results list and its badge
  are gone (the readouts and instruments already show the numbers). What has been changed, with undo and Clear all, sits
  closed under the orders in the Treat card. Advanced physiology opens from Settings. Tapping a
  vessel's details still opens the side panel.
- **One type scale for the figure and slides.** Figure labels and slide cards now use six text roles (caption, label,
  body, value, big value, title) instead of about 18 loose sizes. Each grows smoothly with the screen (phone 11/12/14/16/20/28 px
  up to laptop 12/14/16/22/32/44; slide cards on a wide screen follow its height). A pill keeps name, reading and unit in
  proportion, so a unit is never larger than its number. Text size now runs 100–200 % (100 % is the design size; a size saved
  below it reads as 100 %), so nothing drops under 11 px. The map's labels no longer change size between views. The four drawn
  slide charts (scale, ladders, SAAG map, walls) keep their own lettering for now. Tests: `tests/e2e/type-scale.mjs` (in smoke).
- **Caudate lobe.** Shown only on the slides about it, eased in and out: on "The caudate lobe still drains" a soft
  dome of the liver's own tone (no outline) beside the IVC with three fine, tapered caudate veins that merge into the
  IVC's wall below the hepatic veins, colored from the pressure they drain at; on the DIPS slide the lobe alone, with
  the tract running through it. In Budd–Chiari it is larger as its veins take over the outflow. Nothing changes in
  Explore or on other slides. Test: `tests/caudate.test.js`.

- **Corner credit on a phone held sideways.** In Present the credit sat on the words' glass pane at the lower left. The pane now
  counts as a card: the credit moves along the figure's edge to the first free spot beside it, and sets itself on two
  lines when only a narrow strip of figure is left between the pane and a data card. The credit check now also runs at
  844×390 and 932×430. Tests: `tests/credit.test.js`, `tests/e2e/smoke.mjs`.

- **FibroScan callout.** Wherever the FibroScan probe and its shear waves show on the figure (Explore with the FibroScan card
  open, and every FibroScan slide), an orange pill beside the waves reads the live stiffness (for example "12.5 kPa"), with
  a leader to the waves. It is placed by the figure's label solver before the other labels, so it keeps clear of them, the
  probe, the cards and the credit; the probe carries no text label of its own; the number eases as the value changes, and the pill and leader fade in
  and out with the probe. In a quiz slide it waits with the card until the answer. The schistosomiasis and congestion
  slides' cards now list the liver stiffness too. Check: "FibroScan callout beside the waves" in `tests/e2e/smoke.mjs`.

- **Import a deck file in Present.** Menu › Present › Your scripts › *Import* opens a dialog: choose a deck `.js`
  (written like the built-in decks in `src/ui/decks/`) or a `.json` deck or script, or paste its contents. A deck keeps
  every feature (tiles, tools, term pills, equations, visuals, time-lapses) and is stored on that device like a script.
  The `.js` is read as data and never run (`src/ui/deck-source.js`, a small interpreter for the subset the decks use;
  `mi mo mn sub frac` are built in); `import`, `new`, globals and functions with a `{ }` body are refused with the line
  number. Section 13 of `docs/deck-authoring-guide.md` lists what it accepts. Tests: `tests/deck-source.test.js`.

- **Every deck in its own file.** The six decks that were written inside `src/ui/decks.js` (circulation, sites, hvpg,
  ascites, varices, treatment) moved to `src/ui/decks/<id>.js` like the other eleven; `decks.js` now only lists them,
  with the topics, regions and the outline slide. The decks themselves are unchanged.

- **Presenter data card: no overlap beside a tool.** With a tool (the abdomen) and several tiles, the tiles were forced
  onto one row and their names and ratings ran over each other. They now keep about 9.5em each and wrap to a second row;
  on a phone the rating wraps inside its tile; the tool's tap chips put the name over the number when narrow; and a
  portrait-tablet card scrolls instead of clipping its bottom.

- **Explore for instructors.** Explore has a *Present* button and a *Case library* for instructors only. The library
  lists the eight cases cut from the course; the course's own four sit below it. Presenter keeps two tours,
  *Sites of portal hypertension* and *Acute variceal bleeding*; the other two are cut. The last card of every unit has
  *Open this patient in Explore*, which finishes the unit and loads that patient through the patient picker.

- **Lymph on in the lobule by default.** The lobule opens with its lymph drawn and *Lymph* ticked in the Layers menu.
  Untick it to hide the lymph; the zone bands still start off.

- **Measure ▸ Pressure: wedge tables removed.** The Hepatic vein pressures card (free and wedged catheter readings,
  FHVP, WHVP, HVPG, and the portal and IVC rows) is gone, with its catheter buttons, the catheter drawn on the figure and
  its entry in the active-settings list. The HVPG and PPG readouts are unchanged, the measuring lesson drops its catheter
  step, and the cases' HVPG study is unchanged. The engine still models the catheter, so the wedge can come back later.

- **Role from the menu.** The Menu button has an "I am a…" control with Student, Instructor and Researcher, so the role
  can change in any mode without going back to Home. It is the same setting Home shows, saved the same way.

- **Right kidney removed from the anatomy figure.** The plate draws only the left kidney, beside the spleen and the
  splenorenal shunt. The right kidney stays in the model: only its drawing, its hover target and its style went.

- **DIPS option.** A direct intrahepatic portosystemic shunt sits beside the TIPS in Treat, the Procedures list and the
  stent tool. It runs from the right portal vein through the caudate lobe into the intrahepatic IVC, below the hepatic
  veins, so it is the option when the hepatic veins are blocked and the cava is open (Budd–Chiari). The model uses the
  same stent as a TIPS through a shorter tract: at 8 mm it lowers the HVPG from 16.6 to 9.6 mmHg in the decompensated
  cirrhosis patient, close to the TIPS (8.7). The stent is drawn from the portal branch across the caudate to the IVC.

- **Lessons and cases, deeper pass.** Liver stiffness is now a model reading (about 21 kPa at an HVPG of 10, higher in a
  congested liver), so a chart's kPa matches the simulation, and cases can order a FibroScan. Scope, Doppler and abdominal
  ultrasound orders open the matching view, and each result has a button to show it again. In 30 questions the right
  answer was the longest option; the options are now parallel. Lesson numbers on do and observe steps show where they
  started (7 mm, up from 4). The varices lesson now starts with thin varices that grow over six months, as the text says,
  and the ascites lesson starts with about 4 litres to tap. The debrief table marks numbers that rose or fell. The scope's
  wall stress reads "% of the tear point" and says when it is past it.

- **Cases rebuilt (11).** Every case now has a named patient, an authored chart and orders in clinical words. The old
  “supplied clinical assessment” cards are gone: the chart holds facts (an asthma history, a bilirubin of 6.5, severe
  tricuspid regurgitation) and the learner has to notice them. The bleeding patient arrives tachycardic and hypotensive;
  decisions pause the clock; feedback waits for the debrief, except for unsafe choices (no vasoactive drug, transfusing to
  10, TIPS in heart disease or a blocked splenic vein, carvedilol with low pressure), whose effect the model shows at once.
  New: new ascites, Budd–Chiari/SOS/caval web, portal vein thrombosis, the beta blocker problem, varices with a normal
  liver, reversed flow on a routine scan, and confusion after a TIPS. The debrief lists key actions, your choices against
  the expert's, an “inside the patient” table and three pearls. Content version 2026.10-c1.

- **Curriculum rewrite, batches 5 to 8.** Lessons *sinistral*, *heart* and *costs* are rewritten and *vascular-patterns* is
  new (12 lessons). Cases: new *prevention*, *vascular*; *gastric* has a local and a cirrhotic variant; *cardiac* is
  restored; *bleed* and *refractory* are rewritten (6 cases). Cases open with the history behind an order, pressures and
  Hb hidden until ordered, supplied clinical cards labelled outside the model, weighted objectives and 80 % mastery with
  critical objectives. The bleed replay no longer offers a “without transfusions” alternative. Presenter scripts stay shelved.
- **Doppler display modes.** Measure → Doppler replaces “Direction color” with a pill that cycles Spectrum, Color and
  Variance. The spectral trace is drawn in the scanner's map 1: Color in flat bands (orange toward the probe, blue away),
  Variance orange → yellow (toward) or purple → green (away) from laminar to turbulent. Invert swaps toward/away.
  Nothing is drawn on the figure, and the velocity scale fits the trace more tightly.
- **No bleeding by default.** Varices still grow, but they only rupture on their own when *Variceal
  bleeding* is switched on (Simulation settings). The bleeding case still starts with its bleed.
- **Gestures.** A trackpad's two-finger scroll pans and its pinch zooms; a mouse wheel zooms. A flick keeps the
  figure gliding; past the zoom limits, or panned off screen, it springs back. Double click zooms in (Shift: out), a long
  press on a vessel shows its readings, right-click opens its card.
- **Sliders.** A finger anywhere on a track moves the thumb (iOS); Shift + arrows step ×10; the wheel adjusts a
  focused slider; double click resets it.
- **Cards.** A vessel's card sits beside the figure rather than on it, with a leader line; on an iPad it is a side
  panel; on a phone the sheet has a third, full height. Card values match the labels and readouts.
- **Phone.** The circuit opens upright when held upright; the legend, readout names and clock fit; the zoom
  buttons step aside under a card sheet; the patient name gets the room in the top bar.
- **Graphics.** Vessels whose pressure moved glow briefly after a change; ascites shows as a visible pool sooner; softer moving-blood sheen; a light rim on vessels in
  dark mode; quieter stellate cells and septa in the lobule.
- **Steady framing.** The default framing is measured from the organs, abdomen and ascites only (the vessels morph),
  and waits for the patient to load; the figure appears once, already framed, and switching views is one glide.
  On touch, no double tap, two-finger tap or post-pinch glide, so the view only moves when you move it.
- **View changes land where they should.** Leaving the lobule for the circuit opens the circuit's own framing (a
  delayed return to the anatomy's framing used to fire in the circuit). Opening a patient from Home frames that
  patient, not the one before. The lobule zooms and pans as the anatomy does (mouse wheel zooms, trackpad scroll
  pans, pinch zooms), its drag no longer drops over labels, and the room to pan opens sooner.
- **Zoom stays where you put it.** The spring-back only pulls the view back when its middle has left the figure, so
  zooming into the spleen or a collateral holds. A pinch or pan that starts on a pressure label now works (the labels
  used to swallow the first finger on a phone); a tap on a label still opens it.
- **Lobule.** On a phone the labels keep clear of the zoom buttons. The zones are named inside their bands, in quiet
  capitals in each zone's color, instead of chips.
- **Play bar.** The clock sits by the track, speed looks like a control, Compare is an icon, events stand on the track.

- **Circuit: the liver's titles open cards.** In the circuit, the LIVER and HEART column titles are
  buttons that open the liver's and the right heart's cards (with their parameters).
- **Circuit: the liver branches.** Inside the liver the portal venules divide (one channel, then three,
  then seven) toward the sinusoids, and the sinusoids gather back the same way into the central veins
  that become the hepatic veins. Drawn branches of the same modeled vessels, in their colors, with
  their moving blood.
- **Simpler menus.** The color menu only colors the vessels (the eight lenses; L cycles them). The Blood
  menu holds the moving blood (streaks, chevrons) and what the figure shows (pressure values, potential
  collaterals, organ names). The unit menus are gone (mmHg and L/min), and so is *How to read the figure*.
- **Figure view is gone**, with its PNG, SVG and Print exports, its F key and its search entries. Projector
  mode no longer has a menu item, key (Shift F) or button; Presenter still uses its look while presenting.
- **Fit glides** to its framing, as the zoom buttons do, instead of jumping.
- **iPhone:** Fit (and everything placed above the vitals dock) keeps clear of the dock when the dock sits
  above the home indicator; the readouts lose an empty strip the height of the home indicator.
- **Phone:** an open instrument (Doppler, pressure, …) rests on the vitals dock as one panel, with no gap
  and its content fading out where it meets the dock; the run clock steps aside while it is open.
- **One type scale, one icon scale (menus and cards overhaul, step 1).** The interface now uses five
  sizes (12 small labels · 14 body and buttons · 16 titles · 20 key numbers · 28 big readouts) and three
  weights (400 · 500 · 600), down from 24 sizes and 6 weights; small labels are sentence case ("Menu",
  "Patient") instead of spaced capitals. Icons come in 16, 20 and 24 (12 for a check mark in a dot),
  down from 17 sizes; corners use the three radius tokens. The lobule card's title is no longer serif.
  A new browser check opens every menu and card and fails on any other size, weight or icon size, or
  a button without a name. (The working plan has since been removed; see git history.)
- On a phone held sideways, the zoom buttons step aside when a vessel's card leaves no room for them
  under the top bar.
- **Into the lobule, a dive.** Choosing *Lobule* flies the camera into the liver (0.9 s) while the lobule grows out of
  that spot and the liver dissolves into it; leaving, it shrinks back into the liver and the camera pulls out to
  where the anatomy was. From the circuit it eases into the anatomy first. Reduced motion: a plain cross-fade.
- **The lobule respects the rest of the screen.** It frames itself in the free space (under the top bar, above the
  dock even with every readout open, beside its card) and follows when that space changes; zooming out stops at
  that framing. The zoom pill's +, − and Fit now work in the lobule.
- **Lobule labels as in the anatomy:** no boxes, the station, its pressure and unit, ▲/▼ from healthy past 5 mmHg,
  and a bar in the pressure's color facing the vessel (one line on a phone); kept inside the free space.
- **Lobule card:** a floating card on the right (a sheet on a phone), open on entry, foldable with *Details*; the
  Resistance row is gone. The key to the lobule's parts is a pill beside the lobule that fades as you zoom in.
- **Circuit:** the pale bands under the main route (an SVG layer drawn over the GPU picture, whose overlaps made
  sharp seams) and the SVG crossing marks are gone; the GPU's own vessel border is a little wider in the circuit
  instead. Turning the circuit keeps the zoom and the point in the middle of the screen (shown whole, it stays whole).
- The zoom buttons glide, and zoom about the middle of the free space. The Instruments card's trace chips wrap.
- **A menu you can see.** The logo is now a *Menu* button named after the current mode (Explore, Lesson, Case,
  Presenter). It opens Explore, Lessons, Cases and Presenter as four large choices, the Home page, Share and
  export (link, Figure view, PNG, SVG, print, projector), Settings and Help. Share, Settings and Help left the
  top bar.
- **A calmer top bar.** One row of pills when it fits (main.js measures it), two otherwise: menu and patient ·
  view · Blood and legend · Findings, Treat, Measure, Search. In a lesson or case its bar takes the patient's
  place in the first pill. Active bleeding is a status line in the vitals dock; the compare switch floats
  under the top bar.
- **Instruments, reworked.** A tab per instrument with its live reading replaces the chooser screen; the header
  names the instrument and says what it shows, with *Two at once*, *Full screen*, Minimise and Close. On a wide
  landscape screen it is a tall card on the right (resizable from its left edge), so the anatomy keeps its
  size; on a phone or portrait tablet a sheet. It slides in, and remembers its instruments and size.
- **Nothing overlaps.** Cards on the right stack side by side; a vessel's card, the zoom buttons (now one pill
  with zoom in, zoom out, Fit and turn) and a lesson's card keep to the free space; a phone shows one sheet at
  a time, and in landscape keeps the four readouts beside the play bar. A new browser check fails if any
  floating piece covers another or leaves the screen at laptop, iPad and iPhone sizes, in Explore, with the
  instruments and the chart, with a vessel's card, and in a case.
- **The figure fills the screen.** The side panel, the readout strip and the separate bars above and below
  the figure are gone; everything floats over the anatomy instead, and Fit frames it in the space left free.
  - *Top:* small floating pills: the logo and patient; the view, Blood, lens and Figure controls; and
    Findings, Treat, Measure, Search, Share, Settings and Help. On a wide screen (1600 px+) this is one row.
  - *Bottom:* a vitals dock with the play bar and the four key readouts (HVPG, portal pressure, portal flow,
    varix wall). Abnormal values are tinted amber or red and flash once when they cross into a worse band;
    the chevron opens every readout group.
  - *Findings:* a badge with the number of findings in the color of the worst (a check when nothing is
    abnormal). It opens the patient chart, a card on the right; lessons, cases and a vessel's Details open it too.
  - *Treat (T):* drugs, fluids and blood, and procedures in a card of their own.
  - *Measure:* the instrument workspace floats over the bottom of the figure, which re-fits above it.
  - While the figure is dragged, pinched or scrolled, the floating pieces fade back.
  - *Phones:* the chart and Treat are bottom sheets with three heights; drag the handle, or below the lowest
    to close. A lesson's step card sits under the top bar.
- **Lobule is a view of its own.** *Anatomy · Circuit · Lobule* in the view switch. The lobule opens over the
  anatomy and closes only from the switch (or A): zooming or pinching out stops at 1× instead of dropping back to
  the liver, and Fit inside it shows the whole lobule. The Abdomen › Liver › Lobule zoom trail is gone; the
  liver's card button reads *Open the lobule view*.
- **One home framing for every zoom out.** First load, Fit and coming back from the circuit all use the same
  fitted framing, and while the view sits there it follows the figure: as ascites fills the pelvis (or the spleen
  grows) it re-fits, so the fluid is never cut off.
- **Lymph is white** in the lobule.
- **No stray vessel at 100 % cirrhosis.** The intrahepatic shunts (a straight vessel across the lobule) are gone;
  portal-central septa now run wavy from three triads toward the central vein, cutting it into nodules.
- **Labels without boxes on desktop**, one line each, as on a phone.
- **Circuit:** the *Inside the liver* box (and its outline) is gone; the liver's stations show when zoomed in.
- **No more paint brushes.** The Draw menu (fibrosis and clot brushes) is removed: the Clot and Narrow sliders on
  each vessel's card and the fibrosis sliders on the lobule's cards do the same, better.
- **One card for everything.** The lobule's parts (triad, inlet venule, sinusoid, arteriole, central vein, shunt,
  septum, hepatocytes) open the same action card as the anatomy's vessels: the close button always in view, Escape,
  and on a phone the bottom sheet that drags up and down. Every card, anatomy included, now opens with a short
  plain-language explanation of what the structure is and what is happening to it now (on a phone one line; tap
  for the rest).
- **Fibrosis where it happens.** The triad, sinusoid and central vein cards each carry their zone's fibrosis
  slider (applied to the whole liver). The liver's card keeps only cirrhosis; its zone and lobe controls are gone.
  The lobule's panel has the cirrhosis slider too.
- **One lobule, no left/right switch.** It stands for the whole liver.
- **Free zoom in the lobule.** Wheel, pinch or double-click zoom up to 5×; dragging pans, held to the lobule.
  Zooming out past 1× returns to the liver. Leaving the lobule closes its card and folds its panel.
- **Lymph as shimmer.** With *Lymph* on, soft streaks drift through the tissue from around the central vein out to
  the portal tracts, denser, brighter and faster as hepatic lymph rises.
- **The lobule follows every lens.** Pressure, change, congestion, drop, flow, velocity and direction now color the
  lobule's vessels as they color the anatomy's (they followed only pressure and origin).
- **Phone:** the lobule's panel drags up to open and down to fold; its header stays put while it scrolls.
- **The liver lobule, redrawn.** Zooming into the lobule now grows it out of the liver and draws its vessels with the
  anatomy's own GPU renderer: the same casings, smooth filleted joins, shading and moving blood (streaks, chevrons,
  orange where flow reverses, and the Blood origin lens). The network follows blood's real path: a portal triad at
  each corner (venule, arteriole, bile ductule), inlet venules along the edges, sinusoids that cross-link and merge
  toward the central vein (so blood speeds up as they converge), and arterioles emptying into zone 1.
- **Quiet tissue, visible disease.** Hepatocyte plates one cell thick; neighbouring lobules fade into the page.
  Collagen, stellate cells and septa appear only with disease: capillarization sleeves along the sinusoids, a
  thickened portal tract (pre-sinusoidal), a fibrotic central vein (post-sinusoidal), bridging septa that cut the
  lobule into nodules with intrahepatic shunts running in them (cirrhosis), and zone-3 congestion with cell dropout
  ("nutmeg") when the outflow backs up. In hepatofugal flow the inlet venules run backwards, in orange.
- **Teaching layers in the lobule.** A pressure ladder (portal venule → sinusoids → central vein → hepatic vein →
  IVC, against the healthy ladder) names where the pressure is lost and what that means for HVPG. *Zones* shades
  the acinus (1 periportal → 3 centrilobular); *Lymph* shows lymph leaving the space of Disse for the portal tract
  at the model's rate. Tap any part (triad, inlet venule, sinusoid, arteriole, central vein, shunt, septum,
  hepatocytes) for a short card; a tapped sinusoid lights its path to the central vein. Station labels use the
  anatomy's label cards. On a phone the panel is a compact sheet with *Details* (ladder, fibrosis buttons, legend).
- **Circuit lanes stay tube-like on a phone.** Shown small (a phone, the whole map), every circuit lane grows by
  the same factor so the widest stays about 10 px on screen, capped so neighbouring lanes stay apart.
- **Simpler Blood menu:** just *Streaks* and *Chevrons*, each on or off. Parcels, breathing and heartbeat and the
  menu's dye item are gone (dye stays on each vessel's card and on J).
- **Blood origin adds the hepatic artery** (crimson) beside SMV, IMV, splenic vein and systemic. The legend uses
  dots and, on a phone, short names in two rows (SMV · IMV · SV · HA · Sys).
- **Bigger, clearer arrowheads** (a stronger light rim), and **wider circuit lanes**, still scaled to each vessel.
- **Blood origin is a lens.** It moved from the Blood menu to the color dropdown (beside pressure, velocity,
  direction, flow), and now separates the **SMV** (amber; the coronary vein shares it), the **IMV** (teal), the
  **splenic vein** (violet) and **systemic** blood (slate blue, hepatic artery included), as streams side by side.
  The legend names the four.
- **Arrowheads keep one shape.** Each vessel's heads are one size (from its caliber), evenly spaced along it and
  moving at its own speed; none is cut at a junction.
- **Flow chevrons are back, as an option.** Blood menu › *Chevrons*: slim arrowheads (a notched back and a soft light rim) along each vessel's axis that point
  and move with the mean flow, dark, and orange where flow is reversed, drawn on top of the streaks. *Streaks*
  and *Chevrons* switch on and off independently: streaks, chevrons, or both.
- **Lighter on machines without a GPU.** Where WebGL is drawn on the CPU (a software renderer), the figure now
  draws at 8 frames a second and half resolution, so panels, menus and instruments stay responsive.
- **Reversed flow glows orange.** Where a vessel's flow runs against its healthy direction (the Direction lens's
  test), its shimmer (or parcels) warms to the reversed-flow orange, easing in over half a second, so hepatofugal
  portal flow or a reversed splenic vein stands out as it happens. Not applied over the origin streams.
- **Shimmer, refined, and now the default look.** Long, soft streaks of light carried by the flow, each at its
  lane's laminar speed (fastest on the axis, so the sheen visibly shears), over a faint glow along the core;
  brighter and denser where more blood passes. Parcels remain in the Blood menu.
- **Color by origin, redone.** Instead of grey vessels with scattered colored dots, the blood itself is colored:
  side-by-side streams (laminar flow keeps them apart) for the gut (amber), spleen (violet), hepatic artery
  (crimson) and the rest of the body (slate blue), each as wide as its share of the flow. The portal vein shows
  gut and splenic blood running together; the hepatic veins add the arterial stream; in hepatofugal flow the
  portal colors run out through the collaterals to the cava.
- **Moving blood, polished.** Parcels are now bright beads with a soft glow on dark lumens (deep beads on pale
  ones), so the blood reads at a glance. At every junction the blood and the dye pass from one vessel into the
  next: near a join both vessels' streams are cross-faded over about a radius, and each stream runs on past its
  vessel's end, instead of stopping at a seam and reappearing beyond it. Dye now mixes visibly at a confluence.
- **Inject dye from a vessel's card.** Tap a vessel and use *Inject dye*: a press injects for 6 seconds (it was 2),
  a second press extends it, and holding the button (or J) goes on injecting until let go (up to 30 s).
- **Circuit fixes.** The circuit no longer shows the anatomy's tributaries (the mesenteric fan, the azygos and
  lumbar branches, the umbilical/epigastric network) at their anatomic places, and its lanes no longer wash out
  where an organ lies in the anatomy. The brief Δ-pressure rings no longer appear when a patient is loaded, and
  are cleared when the view changes, so no stray "+17" tags sit over the labels.
- **Moving blood, rebuilt from scratch on the GPU.** The arrows, streaks, dashes and dots are gone. Each lumen now
  carries fine parcels of blood, a quiet tint of the vessel's own color, drawn on the GPU inside the vessel (so they
  pass under organs and nearer vessels exactly as the vessel does). What they show is kept true: direction; which
  vessel is faster; the number of parcels passing a point each second is proportional to flow, so what enters a
  junction leaves it; lanes near the axis run faster than those near the wall (laminar flow, the centre at twice the
  mean). Time is slowed and speed compressed (speed grows with √velocity), and the menu says so. Slow flow (under
  ~5 cm/s) in a large vein drifts and clumps like the "smoke" seen on ultrasound. A new **Blood** menu above the
  figure: *Parcels* or *Shimmer* (a soft sheen carried by the same flow), *Color by origin* (gut, spleen, hepatic
  artery or the rest of the body, mixed at every junction by flow: watch gut blood reach the cava in hepatofugal
  flow), *Breathing and heartbeat* (the model's phasic flow, amplified ×2), and *Inject dye* (J): a short bolus
  into the selected vessel, or the gut's veins, that travels the network, keeps its concentration through a split
  and is diluted where undyed blood joins, with the bullet-shaped front of laminar flow. Per frame only the blood is
  redrawn, over the vessels' tiles; the vessel layer is redrawn only when it changes.
- **The anatomy is drawn on the GPU.** Where the device has a GPU with WebGL2, every vessel in the anatomy (the
  portal tree, the veins behind the organs, the translucent context veins and collaterals, the arteries, the
  cavernoma strands, the tributaries, closed collaterals and vessels drawing on) is drawn by one WebGL2 layer from
  signed distances to each vessel's centerline. Vessels that share a junction merge into one smooth, filleted
  shape, including where a vein ends on one in another layer, so no round ends or rings show where vessels meet.
  Vessels are drawn as on a textbook plate: a flat pressure color with a thin light line along the lit side and a
  thin dark line along the other, and only a faint contact shadow where one passes over another. The organs and the ascites are drawn by the same layer from a raster of
  the plate (sharpened once a pan or zoom settles), so panning and zooming no longer repaint the SVG; the
  congestion glow is drawn there too, without the SVG blur filter. The circuit is drawn on the GPU too. An
  exported PNG is the GPU's picture; an exported SVG keeps vector tubes.
- **Smooth joins between vessels.** Where a vein ends on a vessel drawn in a fainter or deeper layer (the
  inferior vena cava at the renal veins and at the right atrium, a splenorenal shunt at the renal vein), its
  round end and outline no longer sit on top of the other vessel as a ringed disc: the end now dissolves into
  the vessel that carries on beneath it. A blind end (nothing continues past it) keeps its round end.
- **Chrome: the cava and SVC drawn in the right place.** Chrome could measure a vessel's course from the one
  sampled before it, which drew the suprahepatic IVC over the infrahepatic one and put the SVC out of place.
  Each course is now measured on its own element.
- **The action card, rebuilt for the phone.** Tapping a vessel opens a compact bottom sheet that shows everything
  at once, with nothing to swipe through: Why? and Details sit in the header (on the line with the kind and the
  close button), the name has the reading at its right, the status takes the place of the kind, and the controls follow with no row of wasted space
  underneath. Short-named sliders share a row with their track, buttons and switches sit two to a row, and
  readouts pair up. The sheet sits at the bottom of the screen over the play row (the readout strip stays visible), and is as tall as what is in it (a portal vein is under a third of the figure, and no sheet is taller than half); only a
  few liver compartments on a short phone scroll, with a fade at the bottom. Tap the handle to fold it to a strip
  with just the header, or swipe down to fold it and again to close it. The figure pans, no more than needed, so
  the vessel you tapped stays visible above the sheet, and goes back when the card closes; Fit, the turn button and
  the clock ride above the sheet. On a desktop the card keeps its place beside the vessel and has the same parts
  (header, controls, Why? and Details at the foot).
- **Turn the circuit upright.** A new button above Fit (circuit view only) turns the circuit a quarter
  turn counter-clockwise, so the flow runs from the splanchnic beds at the bottom to the heart at the
  top. The map becomes tall instead of wide and fills a phone held upright, where the wide map was
  shown very small. Pan, zoom, selection and the flow marks work as before; labels and zone titles are
  re-placed for the turned map, and the zone titles and the names of collaterals that run up the screen are
  turned to read bottom to top. The choice is remembered on the device. The anatomy is never turned.
- **Zoomed out stays zoomed out.** Switching from the anatomy to the circuit while the whole plate
  is showing (or zoomed out) now opens the whole circuit, instead of the close-up the circuit uses
  by default on a phone. From a zoomed-in anatomy it still takes its usual framing.
- **Fit works on a phone in the circuit view.** The circuit opens on a phone as a close-up of the
  portal vein and liver, so Fit (which went back to that same close-up) seemed to do nothing, and
  jumped into a close-up after zooming out. Fit now shows the whole map there, and tapping it again
  returns to the close-up. Station labels shrink (down to 70 %) when the map is shown that small, so
  they no longer bury it.
- **Fit on a phone, and fit takes in the ascites.** The Fit button (bottom right of the figure) was
  hidden on phones; it now shows there, with a 44 px touch target. Fit also frames the whole
  abdomen when there is ascites: the frame grows (by up to about 8 %) to take in the bulging
  flanks and the fluid pooled in the pelvic floor, which the default frame cut off.
- **No varices, no varices label.** The "Esophageal varices" callout (and "Fundal varices", in the
  circuit) is hidden until varices exist (2.5 mm or more), so a healthy patient no longer shows a
  pressure on a structure that isn't there. It still appears if the station is selected.
- **The coronary vein fades unless something attaches.** The left gastric (coronary) vein's upper
  end fades out into the stomach wall, and is drawn solid to its end only while a collateral to the
  esophageal varices or the fundus is open and leaves it there.
- **Zooming out shows a finished figure.** The abdomen now closes in a rounded pelvic floor, so
  ascites pools in a basin (and the abdominal outline closes beneath it) instead of ending in a
  flat cut below the default frame, and the esophagus fades out at the top of the plate instead of
  being cut off. The default framing is unchanged.
- **Veins fade into their organs.** The splenic vein at the hilum, the superior and inferior
  mesenteric veins at the small bowel and colon, and the left renal vein at the kidney now end as
  straight vessels that fade out over their last stretch (and their flow marks with them), instead
  of breaking into small branching trees. The circuit view is unchanged.
- **Caput medusae redrawn.** Instead of an even ring of eleven flat, wavy strokes, the caput is
  now a branching, tortuous network of veins that leaves the umbilicus, thins to fine tips and
  fades into the skin: the same tree as the mesenteric and splenic-hilum veins, with the same
  border and shading, the color of the epigastric veins' pressure, and flow marks running
  outward. It fills in as the paraumbilical route opens and is absent before that.
- **Vessels leave gracefully.** A collateral that closes, a shunt or TIPS that is removed, and the
  epigastric veins that come with the paraumbilical route no longer vanish in a single frame:
  they retract along their flow, the reverse of how they draw on, and then disappear (or turn
  into the dotted outline of a closed collateral). The epigastric veins now also draw on when
  they appear. Nothing plays under reduced motion or in the figure view.
- **Vessels join without seams.** The dark border and contact shadow of each vessel were
  semi-transparent, so wherever two vessels overlapped (every junction and bend) they doubled up
  into a darker ringed disc. Borders and shadows are now solid with their transparency applied once
  per layer, so overlaps read as one shape. The translucent vessels (the SVC, azygos arch, renal
  and iliac veins, and collaterals) are drawn as whole faded groups by opacity level, beneath the
  opaque network, instead of each fading on its own; the ghost outlines behind the organs likewise.
  When a vessel is selected or hovered, the rest of the network now recedes as one group and the
  focused vessel is lifted above it, instead of every layer of every vessel dimming separately.
- **Loose ends fade.** In the anatomic view the SVC fades out upward above the azygos arch
  instead of being cut off at the top of the plate, and the azygos trunk fades out toward its
  lower end instead of ending in a blunt stub. When the ascending lumbar collateral is open (for
  example Budd–Chiari) the azygos is connected to it and is drawn through, unfaded.
- **Continuous vessels.** Where veins meet, the lit highlight and the shaded side now taper to
  nothing at each end and sit above the whole network, so they dissolve into a junction instead of
  stopping and restarting on the next vessel. A thin vessel joining a thick one narrows more
  gradually (down to half its width, was 0.7×).
- **Callouts on the vessel.** A label that names a vessel (portal vein, splenic vein, SMV, hepatic
  veins, IVC, esophageal varices, and so on) now hangs from the middle of that vessel in both the
  anatomic and circuit views, with a small dot marking the spot, instead of from the junction at
  one end. The value is still the station's pressure, so it matches the readout strip. Beds,
  organs, the right atrium, sinusoids and the fundal varices keep their station.
- **Pressure language.** Vessel color is absolute mean venous pressure with numeric ticks only;
  the CSPH / bleeding / high-risk labels and the reference planes at 10 and 12 mmHg are gone from
  the scale, the figure legend and the pressure landscape. A card sets three different
  measurements side by side (in the Pressure landscape and on the Figure plate): vessel pressure,
  HVPG (wedged − free) and the direct portal–systemic gradient (portal vein − suprahepatic IVC),
  with thresholds only beside the two gradients and with their clinical context. 12 mmHg is no
  longer called a bleeding threshold, and HVPG ≥ 20 is described as a prognostic finding in acute
  variceal bleeding. The PPG readout is now *Portal–IVC*. About the model gains a reference
  review against Baveno VIII (August 2026) and the supporting PMIDs.
- **Esophageal varices climb the esophagus.** From the gastroesophageal junction the varices run
  up the esophageal wall as a braid of submucosal columns, then drain over the heart into the
  azygos arch.
- **Touch.** Pinch zoom no longer jumps: every finger is tracked, two fingers zoom and pan
  together, and lifting one hands over to a pan.
- **Restart and reset.** ↺ beside play restarts the patient; Settings › Reset everything reloads
  the simulator clean (preferences and progress kept).
- **Endoscopy.** Esophageal varices are drawn as mucosa-covered submucosal columns converging on
  the lumen (F1 straight, F2 tortuous, F3 beaded), inside the circular field.
- **One home per thing.** Instruments open from the Measure tab only; the readout strip is always
  under the figure; tabs are Patient and Measure; Settings and Help replace the sliders menu;
  the role moves to Home; *Compare from here* replaces *Pin as A*; *Create shunt…*; *Search*.
- **Quieter figure.** Changes from healthy show from 5 mmHg, in neutral ink; statuses follow
  clinical cut-offs (listed in About the model).
- **Presenting** is chrome-free: figure, hero metric, slide title, progress bar; controls appear
  on mouse movement. Atlas labels switch to projection sizes.
- **Lessons** get a reserved rail (top of the side panel, or a bottom sheet below 1280 px); the
  HVPG instrument is laid out top-down.
- **Design system.** One type ramp, three radii, six named layers, two shadows, a 4-pt grid, no
  raw hex; re-lit dark organs; tabular figures; sentence-case eyebrows.
- **New mark and lockups.** The portal confluence inside a liver; outlined wordmark lockups; a
  generator for the SVGs and app icons (`scripts/brand/`).
- **Devices.** Tablet keeps +1 wk; phones get a margined, centered figure and a snapping readout
  carousel; verified at 320 px and 200 % zoom.

- **Installed on iPhone and iPad.** The top bar is no longer blurred under the status bar: the
  app is a fixed layer (as the start screen already was), which iOS 26 keeps sharp, and the top
  bar extends up behind the status bar. The side panel, dialogs and palette start below it.
  The status bar takes the color of what is under it (top bar, figure or start screen) in the
  theme chosen in the app, not the system's.
- **New logo.** The mark is now a liver with the portal vein and its splenic and mesenteric
  tributaries, colored by pressure from the gut (high) to the liver (low), replacing the abstract
  "Y". Favicon, app icons and lockup redrawn to match.
- **The logo says what it does.** It sits in a button with a *Modes* chevron (just the chevron on
  narrow screens) and a hover state, and opens the start screen: explore, lessons, cases, presenter.
- **Credit.** "Created by Mohammad Almeqdadi, MD" with a link to all of the author's tools, on
  the start screen, at the foot of the settings menu and in *About the model*.
- **Thicker veins.** Vessel calibers on the anatomy are 30 % larger at baseline (intrahepatic
  branches about 15 %), so the veins read at a glance; dilation in disease scales on top.

- **Lobule on request.** Scrolling or pinching into the liver no longer drops the view into the
  lobule; the zoom only moves the camera. The lobule opens from the zoom trail's *Lobule* step,
  the liver's card, the command palette or a presenter step, and scrolling or pinching out (or
  *Back to the liver*) returns to the liver.
- **One side panel.** The instruments moved from the drawer under the figure into the side
  panel, as a second tab beside the patient chart (the panel widens a little for charts). On
  tablets and phones the panel slides over the figure from the Chart button; phones lose the
  bottom sheet and tab bar, so the figure takes the screen, and a tap outside closes the panel.
- **Anatomy.** Caput medusae restored in full: larger, with the abdominal-wall veins drawn again
  from the umbilicus up to the SVC (beside the azygos arch) and down to the iliac once the
  paraumbilical vein opens, and the umbilicus always marked. The tip of the left lobe of the
  liver is rounded. The esophagus now flows into the cardia of the stomach instead of ending
  over it.
- **Varix plexuses.** Esophageal and fundal varices are drawn connected to their vessels the way
  the cavernoma is: the coronary vein reaches the esophageal varices, and they reach the azygos,
  as a braid of periesophageal channels; the short and posterior gastric veins reach the fundal
  varices as a leash from the splenic vein; the gastrorenal shunt leaves them as a tortuous
  bundle. The braids grow with recruitment and are hidden while the collateral is closed.
  The varices are now shown by these channels alone: the beaded columns in the esophagus, the
  grape cluster at the fundus and the wall-tension ring around the esophageal varices are gone
  (wall tension is still read from Varix tension in the readouts and the Varix wall instrument).
- **Fundal varices, anatomy corrected.** The fundal ↔ coronary vein channel is now an anatomical
  variant ("Fundal varices reach the coronary vein", under Anatomical variants and on the vessel's
  card), present by default: gastroesophageal varices (GOV2) and the sinistral route of splenic
  vein thrombosis use it. The *Cirrhosis with gastrorenal shunt* patient now has isolated fundal
  varices (IGV1) without it: fed by the short and posterior gastric veins, drained only through
  the gastrorenal shunt. Its patient snapshot was regenerated.
- **Banding shows on the anatomy.** Each band thromboses one of the esophageal varix channels
  (they fade out one by one) and the remaining channels shrink, alongside the band rings; as
  bands slough over the months the channels return.
- **One arrow style.** Flow marks no longer grow tails in fast vessels (TIPS, shunts, varices):
  every arrow in the figure is the same notched dart, including the heart's "to RV" mark and the
  figure legend.
- **Shunts and feeders.** The gastrorenal and splenorenal shunts are drawn as single large veins,
  not tortuous collaterals. The short and posterior gastric veins leave the splenic vein as one
  vein and break into a plexus only as they reach the fundal varices.
- **Tributaries.** The splenic vein (hilar branches), the superior mesenteric vein (jejunal and
  ileal branches) and the inferior mesenteric vein (descending colic and sigmoid veins) are drawn
  formed by a network of tortuous, branching tributaries, like the variceal plexus, with flow
  marks (anatomy only); the vessels themselves have not moved.
- The gastrorenal shunt leaves the fundal varices in a smooth arc instead of a hairpin. In the
  circuit, the fundal varices → coronary vein line drops clear of the short gastric line instead
  of running on top of it.
- Tributaries fade out into the bowel (only the stretch near the vessel carries flow marks); the
  IMV's come from the descending colon on the patient's left. The gastrorenal shunt runs clear
  of the coronary vein and fades into the left renal vein; the caudate vein fades into the IVC.
  The esophageal varices drain to the azygos through one vein, no plexus.
- Budd–Chiari caudate collaterals are drawn as veins: smooth, smaller, each colored from the
  pressure of the portal branch it leaves (right or left portal vein) to that of the caudate vein,
  and no longer veiled by the caudate vein's fade. The caudate vein itself is a little smaller.
- The caudate vein no longer looks like a portal vein → IVC channel on the anatomy: it gathers
  from a few small tributaries in the caudate lobe and drains into the IVC (the circuit still
  shows it connected). Only in Budd–Chiari do portal collaterals join it.
  Its tributaries fan out behind it along its own course, so they flow into it without a kink,
  clear of the portal vein; the Budd–Chiari collaterals merge into it in smooth arcs.
- The caudate lobe vein, its tributaries and its Budd–Chiari collaterals are not drawn for now,
  in either view (still modeled).
- **Cards on phones** are a bottom sheet: the title, value and close button stay fixed while only
  the controls scroll; the sheet is smaller (at most 44 % of the figure) and more compact. Tap
  the handle or the title, or swipe, to collapse it to its header (a second swipe down closes
  it); a collapsed sheet stays collapsed for the next card. No number-key hints on a phone.
- **Text size.** Figure labels are about 20 % larger in the circuit by default, and Menu › Text
  size on the figure (Small, Default, Large, Larger) scales them in both views; the choice is
  remembered on the device.
- **Caudate lobe.** Its vein runs from the portal vein straight into the IVC. In Budd–Chiari it
  enlarges with its flow and collaterals from the right and left portal veins drain into it.
- **Flow rates** read to one decimal everywhere (labels, cards, readouts, charts), with "< 0.1"
  for a small but real flow; the low end of the flow lens is darker so trickles stay visible.

## 2.1.0 (content version 2.0), 2026-09

The overhaul: faster on every device, a quieter and clearer figure, a simpler shell. The model,
patients, lessons and cases are unchanged (content version 2.0).

- **Phase 1, foundations.** Command palette, figure plate and presenter load on first use (and
  are fetched when the app is idle, for offline use). Frosted-glass blurs replaced with solid
  surfaces. The figure stops painting while Home covers it. Font and module preloads. An
  optional production build (`npm run build`), ESLint, a browser smoke test on desktop and
  phone, a performance report, and CI. Fixed: the legend's "How to read" popover failed in the
  Congestion lens; an unknown `?preset=` link now says so and opens the closest patient.
- **Phase 2, rendering.** Flow marks drawn on the GPU (WebGL2, with the Canvas2D renderer as the
  fallback), occlusion masks rendered on the GPU; adaptive detail for slow devices; colors,
  widths and varices no longer rebuilt on every heartbeat; hit testing limited to hit strokes.
  On a throttled phone profile: 7 → 31 frames a second (see docs/PERFORMANCE.md).
- **Phase 3, the figure.** Quiet anatomy: organs are flat tinted silhouettes with a hairline (no
  cast shadows, blurred rims or decorative textures); texture now appears only as disease
  (nodules, nutmeg, congestion). A varix wall-tension ring closes as the varices approach their
  rupture threshold (amber ≥ 70 %, red ≥ 90 %). On small screens the station labels are single
  lines on a text halo instead of cards, uncovering the anatomy.
- **Phase 4, the shell.** Home's patient list is now a map of the disease: patients grouped by
  where the resistance sits, each drawn as its own pressure profile from the gut to the heart
  (generated from the model by `scripts/snapshots.mjs`, checked by `npm test`), with HVPG,
  portal pressure, flow direction and ascites. Compact Home on phones. The legend is now the
  lens switcher (one control, with "How to read the figure" inside); Draw is an icon. The
  pressure profile's ΔP labels are pills that never overlap bars or each other, and the largest
  fall (where the resistance sits) is highlighted. Phone readouts fit four across and snap.
- **Phase 5, signature views.** The pressure landscape instrument: the circuit raised by mean
  pressure in 2.5D (drag to tilt and turn), flow running downhill, the CSPH and bleeding planes,
  and a live verdict naming the steepest fall on the portal pathway (presinusoidal, sinusoidal,
  postsinusoidal, posthepatic). In the circuit, the liver's resistance gates take the color of
  the pressure they drop, so the dominant resistance lights up. Instruments and Home arrive with
  a short, staggered motion (off with reduced motion).
- **Anatomy redrawn as a plate.** New silhouettes drawn to the anterior view of an atlas: a
  domed liver with a sharp oblique inferior margin, a teres notch and a thin rounded left lobe,
  the gallbladder fundus just below the margin; a single-form heart on the diaphragm; a smooth
  notched spleen; one continuous colon ending in the cecum where the ileum enters, with the
  appendix; the duodenum leaving the pylorus. The pancreas is no longer drawn. Matte tissue
  rendering from one light source: per-tissue tones, soft volume, a gradual inner shade, a faint
  rim light and ambient occlusion; surface anatomy (falciform ligament, gastric folds, pylorus,
  splenic and renal hila, haustra). Vessels are cut out of the tissue by a thin paper edge so
  pressure colors stay legible. Light and dark themes; gradients and clips only (no blur
  filters); exports as vector.

## 2.0.0 (content version 2.0), 2026-09

The v2 redesign (its proposal, `docs/UI_UX_NEXT_LEVEL.md`, is in git history).

- **Interaction:** object → verb. Click a vessel or organ and an action card opens beside it;
  the toolbar and tool modes are gone. Shunts are dragged from source to target.
- **One timeline** for time, history, events and comparison: jump the disease clock, go back to
  any change, pin a moment as A. Compare mode, the Findings tab and the Log are gone.
- **Shell:** Home with four doors, a patient chart (vitals, Treat, Story), one-level
  instruments that dock, pop out or sit side by side, a command palette, and role levels.
- **Art:** anatomy redrawn (warm tissue palette, colon frame, kidneys, gallbladder, lobes);
  nodular cirrhotic liver, nutmeg congestion, ascites with meniscus and flank bulge, beaded and
  grape-cluster varices, caput medusae, laminated thrombus, stent mesh. Change halos, selection
  lift, a new brand mark, self-hosted fonts with a serif for lesson prose.
- **Signature visuals:** semantic zoom from abdomen to liver to lobule; circuit crossings drawn
  as bridges; grey-scale spectral Doppler; rendered endoscopy; motion trails in fast flow.
- **Teaching:** lesson step card on the figure, predictions on the figure, Replay, scores;
  cases with a bedside monitor, a single visibility map, pre-roll, randomized variants and a
  printable debrief with a counterfactual; assessment records (CSV, xAPI); presenter scripts
  with notes, laser pointer and sharing.
- **Institution-ready:** SCORM 1.2 packaging and LMS score reporting, deep links, PWA/offline,
  privacy and accessibility statements, versioned content, interface in five languages
  (including right-to-left Arabic).

## 1.0.0

First public version: the hemodynamic engine, anatomy and circuit views, lessons, cases and
instruments.
