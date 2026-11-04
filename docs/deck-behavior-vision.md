# Deck behavior vision: what a glitch-free talk looks like

Written 3 Nov 2026 for Mohammad and every thread that works on the presenter, the cards, the labels and the views. Read against
`claude/settings-topbar-icon-flvft1` at 4e2ea3f. This is the target, not a description of today: each rule says what a person sees,
how a gate or a headless check proves it, and whether the app already does it.

Tags on each rule:

- **Now**: the app does this today; keep it.
- **Fix**: the app tries, but Mohammad has reported it, or the code shows it can break. Work toward it.
- **New**: the app does not have it. A proposal; the ones that need Mohammad's taste are in section 14.

Rule ids (`V-SLIDE-3`) are stable, so commits, gates and the ledger can cite them.

## 1. Principles

1. **The figure is the stage, and nothing on it ever lies.** What is drawn in a frame belongs to one slide, one view and one camera.
   No label, leader, card or number from another slide, view or camera is ever on screen, even for one frame.
2. **Things that belong together move together, in the same frame.** A label and its point, a leader and both its ends, a card's
   words and its glass, a card and its handle, a chart and its card: each pair is drawn from one clock in one frame.
3. **The hand wins at once.** Any touch, click, key or wheel starts its effect on the next frame. A new input during a motion takes
   the motion from where it is, never from a jump, and never waits for it to finish.
4. **Interrupted is never broken.** Whatever is cut short (a slide change, a tuck, a zoom, a dive) ends in a whole, settled state
   that the last input asked for. Content is never lost, emptied or frozen half way.
5. **Stay still when nothing changes.** A card, label or chart that is the same on the next slide does not move, fade or redraw.
   Only what changes moves.
6. **One motion language.** A small set of durations and curves (section 11) is used everywhere. Nothing pops, nothing overshoots.
7. **Everything on the GPU.** Every fix and fallback stays on the GPU. A late or failed GPU frame keeps the last good GPU picture and
   tries again; it never swaps to a DOM, SVG or canvas 2D copy. (The no-WebGL2 path is the only exception.)
8. **Phone and Mac are one talk.** The same deck tells the same story on an iPhone held upright and on a Mac on a projector. Layout
   differs; meaning, order and timing do not.

## 2. Words with an exact meaning

Gates use these definitions; rules below lean on them.

| Term | Meaning | How it is measured |
|---|---|---|
| frame | one presented GPU frame (`frameFor` scheduler tick that drew) | scheduler frame id; headless runs sample every frame end |
| together | two things drawn in the same frame from the same transform, apart by at most 0.5 CSS px from where they should be relative to each other | displayed snapshots (`labelSnapshot()`, caption `snapshot()`, `glass()` records) compared per frame |
| lag | frames between an input and the first frame it changes | input timestamp vs first changed frame; target 1 frame, limit 2 |
| settled | two identical frames in a row, no ease running, no solve owed (`labelSolving()` false) | `settle()` in `scripts/shoot.mjs` |
| blink | a thing that is on screen before and after a change and drops below 98 % opacity, or leaves for one or more frames, during it | per-frame opacity of the card's words and glass, and label records |
| jump | a move between two frames that is not on the motion's curve: more than 2 px plus the curve's own step | per-frame position vs the curve evaluated at that frame's time |
| stale | anything drawn that belongs to a slide, view or camera other than the current one | snapshot `gen` / `seq` against the current slide and view generation |
| free space | the part of the stage not covered by a visible card, the top bar, the nav pill or the scale pill | union of rest boxes (`restBox`) subtracted from the stage box |

Insufficient frames is **inconclusive**, never a pass (as R16 and R17 already do).

## 3. Slide changes: Next, Back, jump, tap, swipe

### What a person sees

You press Next. On the very next frame the cards that change start to leave on the rail, the cards that stay hold perfectly still,
the camera sets off for the new framing, and the figure's model starts easing to the new patient. The new cards ride in on the same
rail and are readable before the camera lands. The labels for the new slide appear once the camera has landed, already in their final
spots, and fade in. Nothing blinks, nothing jumps, and the words and their glass are never apart.

### Rules

- **V-SLIDE-1 (Fix)** Every way of going forward is the same change: Next button, → / Page Down / Space / Enter, a clicker, a swipe
  left, and a tap on the forward zone (where offered). Back mirrors it. Same timings, same order, same end state.
  *Check*: gate `slides` runs each input kind over the same pair of slides and compares the frame-by-frame card records; they must match
  within 1 frame of offset.
- **V-SLIDE-2 (Now)** The first changed frame is the frame after the input (lag 1, limit 2). The leaving card sets off on that frame.
  *Check*: `frame-gate.mjs` "Next" input latency.
- **V-SLIDE-3 (Fix)** A card that stays (section 4) does not move, fade or redraw its glass on Next, Back or a swipe. Its opacity stays
  at 1.0 and its position within 0.5 px on every frame of the change. *Check*: gate `motion` adds a "kept card" probe on a pair of
  slides that keep the data card (hvpg deck, catheter steps) and a pair that keep the words.
- **V-SLIDE-4 (Now)** Words and their glass are together on every frame (one inline transform, read by `glass-gl.js` in the same
  frame). *Check*: gate `motion` words vs shade vs glass.
- **V-SLIDE-5 (Fix)** Rapid presses. Next, Next, Next as fast as the hand can go: each press supersedes the last (`slide-txn`), the
  cards always travel from where they are, and the talk lands on the slide the last press asked for. No slide in between leaves a card,
  label or highlight behind. Next then Back mid-entry returns the leaving card from where it is (a `back` throw), not by rebuilding it.
  *Check*: gate `motion` "Next-Next-Next" and "Next-Back" at 80 ms apart; end state equals a clean open of the target slide (same
  snapshot keys, same card plans); no frame has two slides' words visible at once above 10 % opacity.
- **V-SLIDE-6 (Fix)** Swipe follows the finger. On touch, a sideways drag moves the leaving cards with the finger 1:1 (the kept card does
  not move), and on release it either flies on (past `PAGE_FAR` 35 % of the width, or faster than `PAGE_V` 0.4 px/ms) or springs back
  on the rail's `back` curve from where it is. A spring back leaves the slide exactly as it was: no reload, no blink, no label solve.
  *Check*: headless touch drag to 20 % and release; card records return to the start within 1 px; label snapshot `gen` unchanged.
- **V-SLIDE-7 (Now)** A swipe that starts on a slider, a scrolling table, the slide list or the card being docked belongs to that
  control (`ownsSideways`), never to the slide.
- **V-SLIDE-8 (Now)** Jump (G list, number then Enter, Home, End) is one change straight to the target. The model is computed off
  screen, so the figure eases once, from where it is to the target, never through the slides between.
- **V-SLIDE-9 (Now)** Camera beats (`beats`) are a Next that moves only the figure: cards and words stay still (V-SLIDE-3 applies).
  Back from a beat goes to the previous beat. A jump opens the last beat.
- **V-SLIDE-10 (Now)** During a time-lapse the first Next runs it to its end; the second goes on. The card's readings climb with the
  frames and never jump at the end.
- **V-SLIDE-11 (Now)** Question card: Next, tap or swipe lifts it, then the slide plays its change. Case card (vignette) comes in
  over the figure as the new patient dims in, and leaves the same way.
- **V-SLIDE-12 (Fix)** The new slide's labels, glows and marks never show before the camera has landed on the new framing; the old
  slide's are gone (faded out) before the camera sets off. No label is ever drawn at the old camera's spot for the new slide.
  *Check*: label snapshot `gen` per frame: no item of the old slide after the camera starts; no item of the new slide before it lands.
- **V-SLIDE-13 (Now)** While a change runs, the leaving cards are inert (`txn.own`): a tap on them does nothing. The arriving cards take
  input once readable (`readable` milestone), not at landing.

## 4. Cards that stay or change across slides

### What a person sees

On a run of slides that share an instrument, the instrument never flickers. The HVPG monitor stays up across free, wedge and result:
its trace keeps running and the catheter on the figure steps on. Only the words change. When a slide brings a different instrument,
that card alone leaves and the new one comes in.

### Rules

- **V-CARD-1 (Now)** Whether a card stays is decided by its plan (`card-keep.js dataPlan` / `textPlan`): same instrument and options,
  same tiles, same title: it stays. The decision is made before the change starts, from the slides, never by measuring.
- **V-CARD-2 (Fix)** A kept data card's numbers ease to the new slide's values at the model's pace (`followData`); its chart redraws
  in place, on the GPU, without clearing. A kept card's size changes only if the new slide's layout needs it, and then by one glide
  (D_SURFACE, EASE_MOVE), never a snap. *Check*: kept-card probe (V-SLIDE-3) plus "no frame with an empty chart" on the card's GPU
  surface.
- **V-CARD-3 (Now)** Recording instruments (Doppler, vitals, beat traces) are rebuilt when the patient changes, and kept when it does
  not. A kept recording instrument never restarts its trace or shows "Acquiring…" again.
- **V-CARD-4 (Fix)** The HVPG catheter run (`cath` free → wedge → result with `tool.catheter`) keeps one card throughout: the trace
  runs on, the catheter on the figure steps, the balloon and the trace step together (same frame). Back steps the catheter back with the
  trace following. *Check*: gate `slides --decks hvpg`: kept-card probe across the three steps; catheter tip and the trace's step edge
  move in the same frame (within 1 frame).
- **V-CARD-5 (Fix)** When only the words change, only the teaching card moves. When only the data card changes (the words stay), the
  data card's glass stays exactly where it is and only its content crossfades in place over D_SMALL (240 ms); the words do not re-fade
  or re-lay out (Mohammad, 3 Nov 2026, 14.1 B). If the new content needs a different card size, the glass glides to it (D_SURFACE,
  EASE_MOVE) under the crossfade, never a rail exit. *Check*: kept-card probe on both sides; on a data-only change the glass record's
  opacity stays at 1.0 and its position within 0.5 px (unless sized), and old and new content are never both above 50 % opacity.
- **V-CARD-6 (Now)** A changed card is never shown half-built. A card comes in only once its content is ready (fonts in, chart fitted,
  first GPU frame of its instrument drawn). If it is not ready by `PREP_MS`, the slide shows its other cards and this card arrives when
  ready, labelled degraded in `?perf`, never empty (R05).
- **V-CARD-7 (Now)** Tables (summary visuals) never enter with blank cells: they wait for their rows, or show a faint number-width
  placeholder (R15), and the rows swap in only after the card has landed.
- **V-CARD-8 (New)** A kept card's change of highlight (a different `key` tile lit) eases the tile's emphasis over D_SMALL, so the eye
  is led to the new reading.

## 5. Card gestures: tuck, untuck, hide, show, zoom

### What a person sees

The stacked instrument card on a phone tucks its readings under itself and pulls them out with a drag or a tap on the handle. It
follows the finger, it is never laggy, and if you change your mind half way it simply goes back. The card's content never empties,
never reloads. On a Mac, a tap on an empty part of a card zooms it to the middle of the screen, large and sharp, with no lag; a second
tap or Esc puts it back exactly where it was.

### Tuck and untuck

- **V-TUCK-1 (Fix)** The handle, a drag, ↑ / ↓ keys and a trackpad scroll all drive the same motion. A drag follows the finger 1:1 on
  the next frame (lag 1). Release decides by distance and speed (as `FLING_*`), then eases from where it is.
- **V-TUCK-2 (Fix)** An interrupted tuck keeps its content. Tuck then untuck mid-way, a slide change mid-way, a zoom mid-way, a rotate
  mid-way: the readings' card and the instrument card keep their content, and the motion ends in whichever state the last input asked
  for. No frame shows an empty card or the glass without its content. *Check*: `scripts/tuck-probe.mjs` extended with: tuck then
  untuck at 30 %, 60 %, 90 % of the way; tuck then Next at 50 %; each frame's card content non-empty (child count and GPU surface drawn);
  end state equals a clean tuck or untuck.
- **V-TUCK-3 (Now)** The gap between the words' card and the stacked card is the same tucked and untucked (Mohammad, 22 Oct).
- **V-TUCK-4 (Fix)** Tucking moves by transform only: no layout per frame, no refit per frame. The instrument keeps one size open or
  tucked. Frame time during a tuck stays under the frame-gate ceiling on the phone profile.
- **V-TUCK-5 (Now)** Each slide arrives with its readings tucked (Mac and iPad landscape) or partly open on the phone sheet, the same
  every time, whatever the last slide's state was.

### Hide and show (fold, the Show / Hide button)

- **V-HIDE-1 (Fix)** Hiding a card (Show / Hide, a fold, a phone held sideways folding its instruments) is one glide of D_SURFACE.
  As it starts, the free space is recomputed and the figure reframes into it (section 6) on the same clock: the card's leaving and the
  camera's glide start on the same frame and land together.
- **V-HIDE-2 (Fix)** Showing it again is the mirror: the camera reframes for the smaller free space as the card comes in, so no label
  ends up under the arriving card. *Check*: after show, `labels-off-cards.mjs` finds no label record overlapping a card's rest box.
- **V-HIDE-3 (Now)** A hide or show is remembered for the slide on screen only; the next slide arrives in its own default state.

### Card zoom

- **V-ZOOM-1 (Fix)** Zoom starts on the frame after the tap (lag 1, limit 2). The card and its handle grow as one piece by a transform,
  in ZOOM_MS 520 on EASE_ARRIVE; back in SHUT_MS 440. No layout, measure, refit or label solve runs during the glide, and none runs
  at the start of it either (they are done before or after). *Check*: `frame-gate.mjs` adds "card zoom" input: latency ≤ 2 frames,
  no long frame (> 50 ms) in the first 3 frames, script time per frame under the ceiling.
- **V-ZOOM-2 (Fix)** The zoomed card is sharp at its zoomed size from the first frame it reaches it: its words and its GPU charts are
  drawn at the zoomed pixel scale (redrawn once, at landing, if needed, with the old picture kept until the new one is ready). It never
  shows blurry then sharp in a visible step.
- **V-ZOOM-3 (Now)** The figure, the model and the instrument run on under the zoom; nothing behind moves (the veil dims it).
- **V-ZOOM-4 (Fix)** Labels never show through the zoomed card or its veil. The veil is drawn by the GPU over the figure and its labels
  in the figure canvas, so there is no label layer above it. *Check*: `labels-off-cards.mjs` with the card zoomed: no label record
  drawn above veil opacity in the card's zoomed box.
- **V-ZOOM-5 (Fix)** Interrupted zoom: a second tap mid-zoom reverses from where it is; Next mid-zoom shuts the zoom first (from where
  it is, SHUT_MS scaled by how far it got) then changes slide, in one continuous motion with no stop between. Untuck while zoomed works
  and keeps the words' card in place (Mohammad, 28 Oct).
- **V-ZOOM-6 (Now)** No card zoom on a phone (Mohammad, 3 Nov 2026, 14.4 C). A tap on an empty part of a phone's card does nothing,
  and never starts a zoom, a veil or a layout pass. Card zoom is for Mac and iPad landscape only.

### Gestures in general

- **V-GEST-1 (Fix)** Any gesture can be interrupted by any other at any frame and the result is the state the last gesture asks for,
  reached from where things are. The matrix to test: {Next, Back, swipe, tuck, untuck, hide, show, zoom, unzoom, view switch, pinch,
  pan, rotate} × {each of the same} at 25 %, 50 %, 90 % of the first. *Check*: a new `scripts/gate-interrupt.mjs` that runs a sampled
  subset each push (and the whole matrix with `[gate-full]`): no blink, no stale, no empty card, end state equals a clean run.

## 6. The figure fits the free space

### What a person sees

The figure always sits in the room the cards leave: centred in it, as large as the framing asks, with its labels inside it. When a card
hides, the figure glides to use the new room. When the top card on a phone hides, the lobule grows to fill the space above.

- **V-FIT-1 (Fix)** The camera's target framing is always computed against the current free space (section 2), using the cards' rest
  boxes (where they will be, not where they are mid-glide). Every change of free space (slide change, hide, show, fold, tuck that
  changes the card's height, rotate, resize, text size, a top card hiding on a phone) reframes the figure.
- **V-FIT-2 (Fix)** This holds in every view: Anatomy, Circuit, lobule and sinusoid. The lobule and sinusoid fit to free space by the
  same rule and on the same clock as the Anatomy camera. *Check*: gate `views` adds "hide top card in lobule (phone)" and "fold the data
  card in sinusoid (Mac)": the figure's bounding box centre ends within 2 % of the free space's centre and its scale within 2 % of a clean
  open of that slide in that free space.
- **V-FIT-3 (Fix)** A reframe from a free-space change glides (D_SURFACE, EASE_MOVE) and starts on the same frame as the card motion
  that caused it. Labels ride the reframe (section 7), so they never stand still while the figure moves.
- **V-FIT-4 (Now)** The figure never reframes while a card zoom is up (the zoomed card reports its rest place).
- **V-FIT-6 (Now)** A Circuit slide frames what it teaches: its `cam` (a Circuit region or a box in circuit units), else its `zone`, else the fit. The glide is `frameBox`, so labels ride it as in Anatomy. Check: `deck: circuit` slides ohm, where, meal, resist, both, parallel and tips each frame a different box.
- **V-FIT-7 (Now)** In a talk whose deck sets `keepPinch` (the Circuit talk), a view the learner pinched, dragged, wheeled or zoomed by a step stays put in a talk when a card changes size, the dock moves or a sheet settles (`stage.handMoved`, presenter `reframe`). Next, Back, a jump, Fit, a view switch and a turn of the device frame it again. Check: pinch on any slide, tuck the data card: the view does not glide back.
- **V-FIT-5 (Now)** The framing leaves room for the slide's marks, lit vessels, readings and labels (`cam-room.js`), so none stands
  outside the frame or under a card.
- **V-FIT-7 (Fix)** When a card hides, the figure glides to centre in the new free space and grows to fill it, up to the slide's own
  framing limit (`kMax`) and keeping room for its marks and labels (V-FIT-5); when the card shows again it shrinks back by the same glide.
  This is the same in Anatomy, Circuit, lobule and sinusoid (Mohammad, 3 Nov 2026, 14.2 A). *Check*: after a hide, the figure's scale is
  larger than before by the ratio the new free space allows (within 2 %), capped at `kMax`; show restores the first framing to 0.5 %.
- **V-FIT-6 (Fix)** Repeated opens of the same slide in the same free space give the same framing, to 0.5 %. (A phone once came in at
  0.814 and refit to 0.847.)

## 7. Labels and leaders

### What a person sees

Every label sits on its thing and moves with it, in every view, under every zoom, pan, dive, switch and reframe, with no lag at all.
Leaders join the label to its point at both ends on every frame. On a deck slide, the labels the words name are lit in their colours,
and the rest step back, the same way in every view.

### Following the figure

- **V-LBL-1 (Fix)** A label's anchor and its figure point are together on every frame of a pan, a pinch, a camera glide, a reframe, a
  view morph and a dive (0.5 px). Labels keep their screen size; anchors move with the figure (Mohammad, 3 Nov). *Check*:
  `label-follow.mjs` and `label-anchor.mjs`: every judged frame within 0.5 px median, 1 px worst; a frozen label fails (LF_FREEZE);
  run in Anatomy, Circuit, lobule and sinusoid on Mac and iPhone profiles.
- **V-LBL-2 (Fix)** Leaders are drawn from the point and the label's current place in the same frame as the label, on the GPU, after
  the pictures. A leader never stretches during a ride (Mohammad, 3 Nov). *Check*: both ends of each leader record within 0.5 px of the
  point and the label edge each frame.
- **V-LBL-3 (Fix)** No stale labels. After a view switch, slide change or camera move, no label from the previous layout is drawn
  (snapshot `gen`). Labels that need a new layout fade out, the layout is solved for the landed camera, and they fade in at their final
  places; they never slide across the figure from an old spot.
- **V-LBL-4 (Fix)** A label never sits under a card, the veil, the top bar or the nav pill. If its own spot is covered it moves to the
  nearest free spot by one glide; if there is none it hides. *Check*: `labels-off-cards.mjs` on every slide in `[gate-full]`.
- **V-LBL-5 (Now)** Labels keep one look in every view (the Anatomy/Circuit pen: Inter outlines, theme halo), being moved onto one
  shared label core (unified-labels plan, W2/W4).
- **V-LBL-6 (Fix)** A late solve never makes labels change sides after the figure has settled. Once a layout is shown for a camera,
  it holds until the camera, view or slide changes. *Check*: a settled slide sampled for 3 s: no label record moves more than 0.5 px.

### Highlight and selection on deck slides

- **V-LIT-1 (Fix)** A slide lights what its words name (`[term](target)`, `labels`, `glow`, marks). In every view the lit label shows
  the same three things: its term colour (`--term-c`), bold name, and a soft tinted pill behind it. The vessel or structure it names
  glows in the same tone, in the same frame.
- **V-LIT-2 (Fix)** In the lobule and the sinusoid, the lit look is drawn by the GPU captions exactly as the DOM captions would show it.
  Today the lit look (`.app[data-lit~=…]` in `styles/app.css`: pill, colour, bold, others at opacity 0) is written as CSS on the DOM
  labels; once `cap-gl-on` hides them, the GPU picture must carry the same state, or the lit label looks unlit and the unlit ones stay.
  *Check*: on a lit lobule slide (lobule deck) and a lit sinusoid slide, the caption `snapshot()` items carry `lit` and `a`; lit items
  have the term tone, unlit items are at the dim level of 14.3; compare to a reference shot per view.
- **V-LIT-3 (Fix)** On a slide that lights some labels, every unlit label and its leader dims to 35 % opacity and keeps its place, the
  same in Anatomy, Circuit, lobule and sinusoid (Mohammad, 3 Nov 2026, 14.3 B). This replaces the lobule's and sinusoid's opacity 0
  (`app.css` `--lit-o`). Lighting or unlighting a term never makes the other labels move. *Check*: on a lit slide in each view, the
  snapshot's unlit items have `a` 0.35 (±0.03), lit items 1.0, and no item moves more than 0.5 px between the unlit and lit layouts.
- **V-LIT-4 (Fix)** Lit labels arrive with the slide's other marks (after the camera lands, V-SLIDE-12) and leave before the camera
  sets off. A lit label on a kept view (same view, same camera) eases its tone over D_SMALL; it never blinks off and on.
- **V-LIT-5 (Now)** Hovering or focusing a label lights what it names (the hover link), on Mac. On a deck slide, hover adds to the
  slide's lit set and never removes it.
- **V-LIT-6 (Fix)** During a dive, the lobule's lit labels fade in with the words, so they are already lit when the dive lands.
- **V-LIT-7 (New)** Tap a label during a talk to spotlight it: the label and its structure light, others step back, a second tap or
  Next clears it. Approved as N4.

## 8. View switches and dives

### What a person sees

Anatomy to Circuit morphs each vessel into its circuit line, and each station's label rides with its station through the morph. A dive
into the lobule zooms from the liver straight into the lobule with no cut, and the lobule's labels are waiting when it lands. Going back
up is the same film run backwards.

- **V-VIEW-1 (Fix)** Anatomy ↔ Circuit is one morph (MORPH_ONE_MS 1200). Station labels, leaders and dots follow their station's move
  through it; labels that do not exist on both sides fade out before and in after. *Check*: gate `views` switch: per-frame label vs
  station within 1 px; no label `gen` mismatch.
- **V-VIEW-2 (Fix)** The scale pill (Anatomy / Lobule / Sinusoid) and a slide's `cam: 'lobule:…'` both dive by the same film: camera
  into the liver, crossfade into the lobule on the GPU, settle at the target. The reverse is the same film backwards.
- **V-VIEW-3 (Fix)** During a dive the figure's labels fade out in the first quarter; the lobule's labels are solved for the landed
  view before the dive lands and fade in over its last quarter. The lobule is never shown with no labels after the dive has landed.
- **V-VIEW-4 (Now)** Every slide opens on its own scale, again on Next, Back and jump (a flip is never remembered).
- **V-VIEW-5 (Fix)** A switch interrupted by another switch, or by Next, reverses or retargets from where it is (V-GEST-1).
- **V-VIEW-6 (Fix)** Pan and dive are separate transforms composed once (R08); unpan never clears the dive. Pinch in the lobule zooms
  around the pinch centre and the labels ride it (V-LBL-1).
- **V-VIEW-7 (Fix)** Cards and the dive: the card glass stays on during a dive, so no label shows through a card while the figure dives
  (unified-labels finding).

## 9. Charts and tracing

- **V-CHART-1 (Now)** Charts that read the model (`profile`, `curve`, `flows`, `plane`, `criteria`, `trace`) ride the change: their
  numbers and lines ease with the vessels on the same clock.
- **V-CHART-2 (Fix)** A chart's lines, dots and its lettering are drawn in the same frame; a kept chart never clears to empty while it
  redraws. Numbers keep their shape through a hand-over (no opsz switch between GPU outline and page text; glitch audit top item).
- **V-CHART-3 (Fix)** Doppler and FibroScan frames are never held back by the scheduler (frameAnimating), so the trace scrolls at the
  display's rate on Mac and iPhone. *Check*: frame-gate trace-scroll step even within 1 frame over 3 s.
- **V-CHART-4 (Now)** A recording trace (Doppler, EKG, HVPG) scrolls continuously; a kept card's trace never restarts. A new patient
  starts a new trace with a clean cut, not a smear.
- **V-CHART-5 (Fix)** The HVPG tracing follows the catheter: the step in the trace (free to wedge) appears in the same frame the balloon
  inflates on the figure.
- **V-CHART-6 (New)** Tracing callouts: a short GPU marker drops onto the trace at the moment the reading is taken ("Wedge 22",
  "Free 8"), so the room sees where the number came from. Approved as N6.
- **V-CHART-7 (Now)** On a held question slide (`hold: true`), the answer marks ease in only after the answer slide lands.

## 10. Readiness, loading and failure

- **V-READY-1 (Now)** The figure only shows finished model states (computed off screen). A slide whose state is not ready keeps the
  last slide's figure with a quiet arc, never a blank figure.
- **V-READY-2 (Now)** A failed or late GPU frame keeps the last good GPU picture and retries (GPU-only rule). No DOM or SVG stand-in
  appears on a device with WebGL2.
- **V-READY-3 (Fix)** A first open of a deck shows its first slide whole within the cold-load budget; warm neighbours (the slide before
  and after) are prepared so Next never waits on shaders or atlases. *Check*: `scripts/cold-load.mjs`, slide-prep manifest done for
  the neighbours before the first Next is allowed to need them.
- **V-READY-4 (Fix)** A theme switch, font load or text-size change mid-talk re-lays out once, at a coherent boundary (after any
  throw lands, R14), and never makes a label or card jump in view.

## 11. Timing and easing

One table. Anything not listed uses the closest row. Reduced motion replaces every travel with a 120 ms crossfade in place.

| Motion | Duration | Curve | Source |
|---|---|---|---|
| Card leave / enter on the rail | 560 ms | `cubic-bezier(.32,.72,0,1)`, out gone by 85 %, in whole by 40 % | `card-throw.js RAIL_MS` |
| Second card behind the first | +40 ms stagger | same | `THROW_STAGGER` |
| Cards readable during camera glide | at 75 % of the glide | | `CARDS_AT` |
| Camera glide | 480 to 900 ms by distance | EASE_MOVE `(.5,0,.5,1)` | `CAM_MS_MIN/MAX` |
| Anatomy ↔ Circuit morph | 1200 ms | EASE_MOVE | `MORPH_ONE_MS` |
| Card zoom in / out | 520 / 440 ms | EASE_ARRIVE `(.2,.8,.2,1)` | `card-zoom.js` |
| Surface (card size, hide/show, reframe, lens) | 420 ms | EASE_MOVE for moves, EASE_ARRIVE for arrivals | `D_SURFACE` |
| Small (word, chip, pill, label tone, label fade) | 240 ms | EASE_ARRIVE | `D_SMALL` |
| State flip | 120 ms | EASE_ARRIVE | `D_FLIP` |
| Swipe fling / spring back | 380 to 600 ms by remaining distance | rail curve, `back` kind | `FLIGHT_MIN/MAX` |

Rules:

- **V-TIME-1 (Now)** No overshoot anywhere (curve y never past 1).
- **V-TIME-2 (Fix)** All motion runs on the scheduler's clock (`easeNow`); a long frame holds everything where it was together rather
  than letting one part run ahead.
- **V-TIME-3 (Fix)** A motion taken over mid-way keeps its velocity (no stop then start). A retarget blends from the current velocity.
- **V-TIME-4 (Now)** 120 Hz on iPhone ProMotion and Mac: durations are in ms, never in frames.

## 12. Phone versus Mac (and iPad)

| | Mac / iPad landscape | iPhone upright / iPad upright | Phone sideways |
|---|---|---|---|
| Teaching card | floating card | panel above the figure | floating card |
| Data card | beside the figure, readings stacked and tucked under its top edge | sheet under the figure, readings tucked on the sheet's lip | instruments fold behind Show |
| Next | keys, clicker, Next button, trackpad swipe | swipe, Next button | swipe, Next button |
| Tuck | ↑ / ↓, handle, trackpad | drag, handle, swipe up or down anywhere on the slide | handle |
| Card zoom | tap empty part of card | none (14.4 C) | none (14.4 C) |
| Scale pill | left of the slide counter | centred above the teaching card | left of the counter |

- **V-DEV-1 (Now)** The same deck shows the same slides, words, highlights and order on every device.
- **V-DEV-2 (Fix)** Rotating mid-talk lays out once for the new shape, reframes the figure into its new free space (V-FIT-1) and keeps
  every card's content and tuck state. Rotating mid-motion finishes the motion in the new layout (R14).
- **V-DEV-3 (Now)** A short screen keeps every card's text at 12 px or more; a slide with too many words fails a check rather than
  shrinking text.
- **V-DEV-4 (Fix)** Touch targets are at least 44 px on phone, and a swipe on the figure never pans the figure during a talk (hands
  off: the figure only points while presenting).

## 13. New behaviour worth building

Proposals for a great teaching deck, all GPU-drawn. Each is tagged New; the ones marked ★ needed Mohammad's pick in section 14.

**Approved to build (Mohammad, 3 Nov 2026): N1, N2, N3, N4, N5, N6, N8 and N9.** N7 (room poll) and N10 (rehearsal) are not
being built. Each feature must keep every rule above (no blink, labels with the figure, everything on the GPU) and comes with its own check.

- **N1 ★ Presenter view (Mac).** A second window (or the same window on a laptop while the projector mirrors) with the current slide,
  the next slide's title, the notes, the handout question and a clock. Keys work from either window.
- **N2 ★ Pointer and ink.** Hold a key (or long-press on iPad) for a soft GPU spotlight that follows the pointer and dims the rest;
  a pen that draws on the figure and rides it (pan, zoom) and clears on Next.
- **N3 Progressive reveal of the line.** `reveal: true` brings the line's clauses in one per Next, each lighting its term on the figure,
  so the words and the figure build together.
- **N4 ★ Tap to explain a label.** Tap a label during a talk: it lights its structure, and a one-line GPU tooltip with its live value
  appears beside it (V-LIT-7).
- **N5 Slide overview strip.** The G list as a strip of live thumbnails (GPU snapshots taken as each slide is prepared), so the presenter
  jumps by picture, not by number.
- **N6 ★ Trace callouts.** Markers on the HVPG and Doppler traces where a reading is taken (V-CHART-6).
- **N7 Room poll on the question card.** The question card shows a QR code; phones in the room answer, and a bar fills live on the
  card before it lifts. (Needs a backend; later.)
- **N8 Replay the change.** A small replay button on a slide that plays a change (a drug, a TIPS, a lapse) runs it again from the
  slide before, without Back then Next.
- **N9 Before / after scrub.** On a slide with `delta` or `since`, a scrubber in the data card that eases the figure between the slide
  before and this one, so the room can see exactly what moved.
- **N10 Auto-advance rehearsal.** A rehearse mode that times each slide and shows the talk's pace against `minutes`.

## 14. Style questions for Mohammad

Each is asked as a clickable card in the project thread. Answers are written back here.

1. **14.1 When only the data card changes between slides (the words stay), how should it change?**
   A. It leaves and comes in on the rail, like any card. B. ★ Its glass stays put and only its content crossfades in place (240 ms).
   C. Its glass resizes to the new card while the content crossfades.
   *Answer*: **B** (Mohammad, 3 Nov 2026). Applied in V-CARD-5.
2. **14.2 When a card hides, how should the figure use the room?**
   A. ★ Glide to centre in the new space and grow to fill it. B. Glide to centre but keep its size. C. Stay where it is.
   *Answer*: **A** (Mohammad, 3 Nov 2026). Applied in V-FIT-7.
3. **14.3 On a deck slide that lights some labels, what do the other labels do (every view)?**
   A. Hide, as the lobule does today. B. ★ Dim to about 35 % and keep their places. C. Stay as they are; only the lit ones change.
   *Answer*: **B** (Mohammad, 3 Nov 2026). Applied in V-LIT-3.
4. **14.4 Should a phone get card zoom?**
   A. ★ Yes, as a full-screen sheet over the running figure. B. Yes, the same scaled zoom as Mac. C. No zoom on phone.
   *Answer*: **C** (Mohammad, 3 Nov 2026). V-ZOOM-6 now says no zoom on phone.
5. **14.5 Which new feature first?**
   A. ★ Presenter view with notes and next slide (N1). B. Pointer spotlight and pen (N2). C. Tap a label to explain it (N4).
   D. Trace callouts (N6).
   *Answer*: all of them except N7 and N10 (Mohammad, 3 Nov 2026). See section 13.

## 15. How gates check this

| Area | Stage or script | Adds |
|---|---|---|
| Slide changes | `gate.mjs slides`, `gate-motion.mjs` | kept-card probe (V-SLIDE-3, V-CARD-5), rapid press (V-SLIDE-5), input kinds (V-SLIDE-1) |
| Gestures | new `scripts/gate-interrupt.mjs`, `scripts/tuck-probe.mjs` | interrupt matrix (V-GEST-1), interrupted tuck content (V-TUCK-2) |
| Card zoom | `frame-gate.mjs` | zoom input latency and long frames (V-ZOOM-1) |
| Free space | `gate.mjs views` | lobule and sinusoid refit on hide (V-FIT-2) |
| Labels | `tests/e2e/label-follow.mjs`, `label-anchor.mjs`, `labels-off-cards.mjs` | all four views, zoomed card, settled stillness (V-LBL-1, -4, -6) |
| Highlight | new lit-label check on caption `snapshot()` and label-gl `snapshot()` | lit state carried on GPU records (V-LIT-2) |
| Charts | `frame-gate.mjs` | trace scroll evenness (V-CHART-3) |

A rule is done when its check exists, passes on the Mac and iPhone profiles headless (software GL named as a GPU), and fails on a
fixture that breaks it. Headless is not a device test; say so when reporting.
