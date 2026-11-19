# Finding and fixing what you see

How to report something that looks wrong, what the app can tell about itself, and what an agent does with your report. Written for Mohammad first (what to press, what comes back, what the tools can and cannot see); the last section is for agents.

Everything here is on the preview copy (`/preview/`) or a local run. The live site has only Send feedback (section 12).

## 1. The short version

1. Open `/preview/?debug` on the device where you saw the problem. (The old `?gallery` still works.)
2. Use the app the way you were using it when it went wrong.
3. Press **Report** on the bar at the top (on a phone you can also hold the orange PREVIEW pill for a second; on a Mac, Option+Shift+?). A sheet opens, says how many problems the app's own checks found, and takes a few words ("what did you see?").
4. Press **Copy packet** and paste it into the thread. That is all. The agent starts from your report, not from a guess.

## 2. What the app knows about itself

The app works out every card, label, number and camera move before the graphics card draws it, so it can describe its own screen in words: where each card is, how big its lettering is, what each label says and where it stands, which number is on which tile, what colour each vessel should be and why. It cannot see the final pixels (colour after blending, how it looks to your eye), so a report says "the card runs 9 px past its edge", never "it looks ugly".

## 3. The Report button

A report holds:

- **The screen in words:** every card and label with its place and size, the numbers on the screen, the camera's state.
- **The rules that failed**, each with what is wrong, where, why it matters, and the file that owns the behaviour.
- **The last 10 seconds of motion.** The motion recorder is on by default on `?debug` (elsewhere it needs `?watch`). It is what lets a report say "this card appeared in one frame" instead of "I did not see anything".
- **A link that rebuilds the moment** (the patient, the slide, the open cards), so an agent can put the app in the same state without you.
- **Memory and errors:** the page's own GPU memory estimate, its highest, and any caught errors.

From an iPhone or iPad: hold the PREVIEW pill, or open Settings > What's wrong here? From a Mac: Option+Shift+?. Copy packet puts one block of text on the clipboard; paste it into the thread. If a copy is refused (Safari sometimes needs a tap), the sheet shows the text to copy by hand.

## 4. The Full check

On `?debug`, Tools > **Full check** (or open `/preview/?debug=check`). Put the phone down for about three minutes. It walks the paths that have crashed the tab before (view to view, each Tests pane, structure cards, the HVPG deck's slide 5 to 6, the procedures, every deck's heaviest slides), on a fast test clock, reads the memory estimate after every step, runs the card-fit and self-check rules at each stop, and ends with **one report** and a Copy button. If the browser ends the tab, the check resumes and names the step it ended on. It also prints the **kill ledger**: what the page's memory estimate stood at each time the browser ended a tab on this device, so the memory limit can be set from facts. `?debug=full` has no time limit.

## 5. The rules, in plain words

Every check the app runs on itself is a named rule with one owner file and one reason. The table is generated from the code (`npm run debug -- doc`), so it cannot drift. The same list is `npm run debug -- rules`.

<!-- generated:rules -->
**Cards fit the screen and its edges** (18)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `fit-enlarged` | the screen now | Cards must fit: a card up while nothing asked for it | `src/ui/presenter-zoom.js` |
| `fit-scroll` | the screen now | Cards must fit: words run past the card | `src/ui/card-type.js` |
| `fit-clipped` | the screen now | Cards must fit: a word is cut by its box | `src/ui/card-type.js` |
| `fit-off` | the screen now | Cards must fit: text stands partly off the screen | `src/ui/presenter.js` |
| `fit-small` | the screen now | Data-card text is at least 12 px (17 Nov) | `src/ui/card-type.js` |
| `fit-ratio` | the screen now | The slide title is at least 1.4 times the body (17 Nov), 1.3 on a phone where the words need the space (Mohammad, 19 Nov) | `src/ui/card-type.js` |
| `fit-sideways` | the screen now | Nothing inside a card scrolls sideways: a phone swipe would open the next card (17 Nov) | `src/ui/presenter-cards.js` |
| `fit-styled` | the screen now | A card is never shown before it is fully loaded and styled; no text before its backing (17 Nov) | `src/ui/presenter-question.js` |
| `fit-chart` | the screen now | Cards must fit: a word of a chart stands outside its box | `src/ui/presenter.js` |
| `fit-blank` | the screen now | Cards must fit: empty glass above or below the words | `src/ui/card.js` |
| `fit-cut` | the screen now | Cards must fit: a line runs past the card | `src/ui/card.js` |
| `fit-tall` | the screen now | Cards must fit: the card scrolls though its words fit the space | `src/ui/card.js` |
| `fit-sheet` | the screen now | A phone sheet is as tall as its words, up to the room under the top bar, and scrolls only past that (18 Nov 2026) | `src/ui/util.js` |
| `edge-cutoff` | the screen now | The last line of a card is never cut by the card's visible edge (Mohammad, 19 Nov: the words card was clipped on many Shuffle slides and no check named it) | `src/ui/card.js` |
| `edge-off` | the screen now | Words never reach past the screen (19 Nov) | `src/ui/presenter-cards.js` |
| `edge-cutby` | the screen now | A line is never half drawn by a box inside the card (19 Nov) | `src/ui/card.js` |
| `edge-stray` | the screen now | A card behind in the Shuffle shows only its strip: no line stands across the strip's edge, so no half-line of text peeks out (Mohammad, 18 Nov 20:33: a half-line of the back card's title in the strip is a stray-text failure) | `src/ui/card-shuffle.js` |
| `edge-nobacking` | the screen now | No text before its backing: the teaching card's words stand on its glass (17 Nov) | `src/ui/presenter-cards.js` |

**Nothing pops, flashes or sticks** (6)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `flash` | the last seconds of motion | Nothing may blink: a card or label that is shown, gone and back within a quarter second is a glitch (17 Nov: nothing pops in or out) | `src/ui/label-gl.js` |
| `stuck-mid` | the last seconds of motion | A card or label held part way through a fade is a fade that never finished | `src/ui/glass-clock.js` |
| `card-pop` | the last seconds of motion | Nothing pops in or out: a card goes from gone to shown by a fade, never in one frame (17 Nov 22:01: appearance and disappearance of anything must never glitch) | `src/ui/glass-clock.js` |
| `card-size-snap` | the last seconds of motion | Cards size exactly to their content with a glide, never a snap (17 Nov) | `src/ui/card.js` |
| `glass-before-words` | the last seconds of motion | Never show a card before it is fully loaded and styled: the glass does not show before its words (17 Nov 22:01) | `src/ui/presenter-cards.js` |
| `card-empty` | the last seconds of motion | A card is never shown with nothing in it (17 Nov 22:01) | `src/ui/presenter-cards.js` |

**Labels stay clear and fade in place** (9)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `label-slide` | the last seconds of motion | Labels fade between spots, never slide or jump (18 Nov) | `src/ui/stage-label-solve.js` |
| `label-detached` | the last seconds of motion | A label must keep up with the thing it names while the figure moves | `src/ui/label-gl.js` |
| `label-dim-alpha` | the last seconds of motion | A dimmed label rests at one alpha, DIM_ALPHA (label-explain.js), in one place | `src/ui/label-explain.js` |
| `label-under-card` | the screen now | Labels stay clear of every open card (Mohammad, 17 Nov 2026): a card never hides a name. | `src/ui/stage-label-solve.js` |
| `label-off-screen` | the screen now | A label is whole on the stage: none stands past its edge. | `src/ui/stage-label-solve.js` |
| `label-overlap` | the screen now | Two labels never lie over each other: the solver keeps a ring of spots so each can be read. | `src/ui/stage-label-solve.js` |
| `label-dim-at-rest` | the screen now | A label a slide or the explainer steps back sits at one dim, 65% (--label-dim, styles/tokens.css), in every place; a label at rest is 100% or that, never part way. | `src/ui/label-gl.js` |
| `label-no-leader` | the screen now | A label that stands apart from its point has a leader to it (label-place needsLeader: a gap over 12 px), so it is never a name floating free. | `src/ui/label-place.js` |
| `label-clipped-by-canvas` | the screen now | The GPU draws each label whole: its picture lies inside the label canvas. | `src/ui/label-gl.js` |

**The camera goes straight** (8)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `camera-straight` | the last seconds of motion | The camera zooms straight from any view to any view: one way, one line, no stop at the fit (18 Nov) | `src/ui/stage-glide.js` |
| `camera-slide` | the last seconds of motion | A slide's camera move is one plan on one even path, judged by slide-cam.js judgeSlideMove | `src/ui/slide-cam.js` |
| `camera-path` | the screen now | A slide move is one straight glide on one quintic curve: no turn back, no overshoot, no jump, lands on its plan (slide-cam.js judgeSlideMove, the judge pps.cameraGate uses). | `src/ui/slide-cam.js` |
| `camera-late-start` | the screen now | A slide move starts at once: within 120 ms of the ask and 900 ms of the press (judgeSlideMove). Untimed in a hidden or throttled page. | `src/ui/slide-cam.js` |
| `camera-second-move` | the screen now | One slide change is one move: no glide after the landing (a refit with a different framing means the plan's framing was wrong). | `src/ui/slide-cam.js` |
| `camera-refused-write` | the screen now | While a slide move runs the camera has one writer; another writer is refused and named, and should not have tried. | `src/ui/slide-cam.js` |
| `camera-two-moves-one-press` | the screen now | One press is one move: a second slide move for the same press is a stop on the way (Mohammad, 18 Nov 2026: the camera zooms straight from any view to any view, no waypoint). | `src/ui/slide-cam.js` |
| `camera-stop-between` | the screen now | A glide that ends and another that begins a moment later is a stop at a waypoint (the fit) on the way between two views: the camera zooms straight from any view to any view (18 Nov 2026). | `src/ui/stage-glide.js` |

**Numbers, charts and pressure colours agree** (10)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `number-width-jump` | the last seconds of motion | A number that changes must not change width while its card holds still: figures are tabular | `src/ui/count-roll.js` |
| `chart-zone-names-with-legend` | the screen now | A chart that has a legend writes no zone names on its plot (17 Nov: "you have a legend already") | `src/ui/visual-plane.js` |
| `chart-axes-fit-data` | the screen now | A chart that cuts its axes to its points leaves no more than 45% of an axis empty, and draws no point outside its frame (18 Nov, b52b29d1) | `src/ui/visual-plane.js` |
| `number-agree` | the screen now | A reading is the same number in the tile, the header, the words, the chart and the figure label, and the model's | `src/ui/presenter-cards.js` |
| `pressure-colour` | the screen now | A pressure wears the colour its cut-offs give the number shown: HVPG amber over 5, red 10; PPG amber 6, red 12 | `src/engine/pressure-cuts.js` |
| `pressure-words` | the screen now | Words that name a cut-off of the HVPG or PPG name one of the app's (HVPG 5, 10, 12, 20; PPG 6, 12) | `src/engine/pressure-cuts.js` |
| `figure-colour-stale` | the screen now | Under the pressure lens a vessel end is the ramp colour of its pressure in 0.5 mmHg steps (colormap.js pressureColor, held 0.4 mmHg: stage-geohold.js qHold). A colour from a pressure more than a bin or two away is a stale paint. | `src/ui/stage-tubes.js` |
| `figure-vessel-no-colour` | the screen now | A vein the GPU draws has its two end colours (setColPair); a shown vein with none draws black or not at all. Arteries take the artery colour and are left out. | `src/ui/stage-tubes.js` |
| `figure-vessel-width` | the screen now | A shown vessel has a width: a width that is not a number, or nothing, is a vessel the GPU draws as a hairline or not at all. | `src/ui/stage-tubes.js` |
| `figure-pressure-missing` | the screen now | Under the pressure lens every shown vein has a model pressure at both ends; none means the colour was painted from no frame. | `src/ui/stage-tubes.js` |

**Words follow US and Baveno VIII usage** (33)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `wording-less-as-minus` | the screen now | Subtraction is "minus", never "less" (Mohammad, 13 Nov 2026) | `src/ui/wording.js` |
| `wording-belly` | the screen now | Learner text is written for US physicians: abdomen, peritoneal cavity, intra-abdominal pressure (IAP) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-takes-back` | the screen now | Learner text is written for US physicians: peritoneal reabsorption (mL/day) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-kidney-pressure` | the screen now | Learner text is written for US physicians: abdominal perfusion pressure (APP) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-renal-perfusion-pressure` | the screen now | Learner text is written for US physicians: abdominal perfusion pressure (APP) for MAP − IAP (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-tap` | the screen now | Learner text is written for US physicians: paracentesis, large-volume paracentesis (LVP) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-water-pill` | the screen now | Learner text is written for US physicians: diuretic (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-tummy` | the screen now | Learner text is written for US physicians: abdomen (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-gut` | the screen now | Learner text is written for US physicians: splanchnic arteries, mesenteric veins, splanchnic inflow (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-scarring` | the screen now | Learner text is written for US physicians: fibrosis, fibrotic (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-clotted` | the screen now | Learner text is written for US physicians: thrombosed (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-alcohol-related` | the screen now | Learner text is written for US physicians: alcohol-associated (AASLD) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-lymph-made` | the screen now | Learner text is written for US physicians: lymph formation (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-lay-anatomy` | the screen now | Learner text is written for US physicians: tricuspid regurgitation, left renal vein, hydrothorax, pulmonary edema (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-british-idiom` | the screen now | Learner text is written for US physicians: American idiom (in parentheses, most common, scheduled for, continue) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-word-by-pill` | the screen now | Learner text is written for US physicians: no comparison word beside a cut-off pill (authoring guide rule 6) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-lay-measure` | the screen now | Learner text is written for US physicians: transmural pressure, insufflation pressure, hematemesis, sodium restriction, abstinent (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-possessive` | the screen now | Learner text is written for US physicians: hepatic blood flow, splenic venous outflow, intra-abdominal pressure, spleen size (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-the-scope` | the screen now | Learner text is written for US physicians: endoscopy, the endoscope, EGD (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-the-room` | the screen now | Learner text is written for US physicians: write to the learner (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-british` | the screen now | American spelling (US physicians) | `src/ui/wording.js` |
| `wording-drug-as-subject` | the screen now | Learner text is written for US physicians: an imperative or a passive: "Restart carvedilol", "carvedilol is restarted", "continue the NSBB" (docs/ai-humanizer.md section 5) (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-guideline-as-actor` | the screen now | Learner text is written for US physicians: "Baveno VIII recommends starting carvedilol", "the algorithm says to continue it" (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-finding-as-actor` | the screen now | Learner text is written for US physicians: an imperative: "Reduce or hold carvedilol for hypotension", "Does the bilirubin rule out a TIPS?" (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-pressure-motion` | the screen now | Learner text is written for US physicians: "the portal vein pressure is {pv}", "her PPG is higher" (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-sees` | the screen now | Learner text is written for US physicians: say what the gradient reflects, includes or misses (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-scar` | the screen now | Learner text is written for US physicians: fibrosis, fibrous septa (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-region-caveat` | the screen now | Learner text is written for US physicians: name the drug and its alternative with no region (owner, 16 Nov 2026): "Octreotide", "Terlipressin is an alternative" (docs/ai-humanizer.md section 6) | `src/ui/wording.js` |
| `wording-em-dash` | the screen now | No em-dash in learner text (Mohammad) | `src/ui/wording.js` |
| `wording-older-baveno` | the screen now | The guideline is Baveno VIII only, never VII (Mohammad, 18 Nov 2026) | `src/ui/wording.js` |
| `wording-ppg-label` | the screen now | The PPG is labelled "PPG (PV − IVC)" with the minus sign (Mohammad, 18 Nov 2026) | `src/ui/wording.js` |
| `wording-no-number` | the screen now | A value that was never worked out never reaches the page (production) | `src/ui/wording.js` |
| `wording-open-token` | the screen now | A {token} the page did not fill never reaches the page (production) | `src/ui/wording.js` |
<!-- /generated -->

The numbers the rules hold the screen to are your decisions, named once with their date and exceptions:

<!-- generated:limits -->
| Standing number | Value | Since | What it holds | Exceptions |
|---|---|---|---|---|
| `words-floor` | 12 px | 17 Nov 2026 | Lettering on a card is never under this on the screen (data-card text, ffa2bfba). | Tall instrument cards in the Shuffle on a short sideways phone: 10 px (18 Nov 21:08 ET). |
| `title-ratio` | 1.4 x the body | 17 Nov 2026 | A slide title is at least this many times its words (0dcbf220). | A phone's slide: 1.3 when the words need the space (19 Nov 2026). |
| `body-never-shrinks` | 0.3 px under the role size | 17 Nov 2026 | The teaching card's body text never shrinks to fit (2a8217e3): the figure and the top card yield instead. | none |
| `label-dim` | 0.65 alpha | 16 Nov 2026 | Dim labels step back to one value everywhere (tokens.css --label-dim). | none |
| `blank-glass` | 24 px | 18 Nov 2026 | A structure card stands no more empty glass than this above its first line or below its last. | none |
| `sheet-room` | 40 px | 18 Nov 2026 | A phone sheet is as tall as its words, up to the room under the top bar, and scrolls only past that. | Layers (stops under half the screen on purpose) and the command palette (a fixed-height list on purpose). |
<!-- /generated -->

## 6. Reading a report

- **fail** is a rule the screen breaks now. **warn** is something to look at that may be fine (a step near the memory limit). **note** is information.
- "The report shows" means a rule read it from the app's own records. "I saw" means a person looked. The two are different evidence; an agent should say which.
- A finding that says **device only** is one a replay cannot see (Safari layout, a real GPU, memory, timing): the agent fixes it from the code and asks you to press Report again after the fix.
- "**0 motion findings**" means no rule fired on what the recorder saw. The recorder has not yet been run on a real device (its first run is its test), so it does not yet mean nothing popped.
- Every tool ends with the same report block (`-----BEGIN REPORT JSON-----`). An agent reads any of them the same way, and can compare two (say, your Full check and a later one) to show what a fix changed.

## 7. The gallery

`/preview/?debug` is also the gallery: every card in every look and size, one tap each (Browse, then pick; ‹ › step through). Each push message from an agent carries links to the specimens its change touches, and a **Sweep** link that opens every one of them in turn and reports what does not fit. Tools holds the look (Light, Soft, Dark, Navy, Black), Freeze, Shoot (the bar away, for a picture), Copy link, and the panels: What's wrong here? (the same as Report), Check (the rules on the card in front of you, with red outlines), Sweep and Phone check.

## 8. The benches

Under Browse > Benches: **Camera moves** (every view to every view; hold a move to loop it; each is checked for a straight path, the 18 Nov rule), **Slow motion** (quarter or tenth speed, or one frame at a time, for "it popped" and "it flickered"), **Procedures** (TIPS, BRTO, BATO, Rex, EUS and the HVPG catheter, one Next at a time), **Memory loop** (repeat a move and watch the GPU estimate, its peak, the contexts and the heap: the iPhone tab kills), **Diagnostics switches** (the `?perf`, `?fps`, `?offgpu`, `?budget`, `?lap` and `?inputs` flags as toggles), **Looks table**, **Words dump** (every string the decks show, one copyable text, with the wording check), **Model table**, **Glyph atlas** (the GPU text atlas as a picture: the black-box-behind-a-label class of bug).

## 9. Speed and heat

When an agent asks for **`?perf`**, open `/preview/?perf`: a frame panel and a lag readout after a pan or pinch; **Copy** puts the slowest frames, with the surfaces that drew and the phase, on the clipboard. **`?lap`** is the device lap: a fixed route of about 90 seconds that the page drives on its own and writes up as one block of text (the frame, the surface and the phase for every step; heat is read from the frame rate and the work done at rest, start against end, because a web page cannot read the battery's temperature). Paste what each copies. Neither is a finding list; they are measurements.

## 10. What an agent does with your report

1. Reads it (`npm run debug -- packet show`): did it arrive whole, what failed, in what state.
2. Replays it without a GPU (Node, or a layout-only headless run with every draw stubbed and no picture) and says `REPRODUCED`, `GONE` (device only), `NO RULE` or `MOTION ONLY`.
3. If no rule named it, writes the rule first (with a test that fires and one that must not), so the next bug of its kind finds itself.
4. Fixes the cause at its owner file and checks the whole app for the same bug.
5. Proves it: replays again and runs `compare`: `FIXED`, `PARTLY`, `NOT-FIXED` or `REGRESSED`, with the list of everything else on the screen that changed.
6. Adds a test from your packet so it cannot return, and posts the push with what to test and what could still be wrong.

## 11. What no tool can judge

How it looks to your eye (beauty, balance, "elegant"), colour after the glass and figure blend, Safari-only layout, real heat in your hand, real GPU speed, and the feel of a motion. These stay with you on your devices. The tools also do not yet judge: contrast of a line against the backing it actually stands on, whether a selected vessel is under a card, shader-only bugs that leave no number (a black box behind a label from a texture that did not upload), and the recorder's own thresholds on a device. Each is listed as open work, not forgotten.

## 12. For testers

On the live site, Settings > **Send feedback** opens an email draft in the tester's own mail app with the device, the screen size, frame speed, recent errors, a link to the view, and now a few lines on what the app's own checks found on the screen (at most 1,800 characters; the whole link is capped so any mail app takes it). A toast then offers **Copy the full report**, which puts the whole report on the clipboard to paste under the message. Nothing is sent by the app: the person sends the email. The Privacy page says so.

## 13. The switches (reference)

Address flags, where each works (live site, preview, or preview and local only), and what it does. Generated from the code (`src/ui/flags.js`); `npm run debug -- flags` prints the same.

<!-- generated:flags -->
| Flag | Where | Group | What it does |
|---|---|---|---|
| `?perf` | everywhere | Measure | The frame panel and the lag readout after a pan or pinch (frame-hud.js, perf-readout.js); also counts GL budget sites, layout reads and caught errors in the console. |
| `?fps` | everywhere | Measure | Frames asked for every refresh while the page shows, and every overrun written to the console with its surfaces. It keeps the page drawing. |
| `?offgpu` | everywhere | Measure | A live count of work that is not on the GPU, per frame, flashing red when any happens while something moves. |
| `?watch` | preview and local run | Measure | The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/watch, docs/watch.md). |
| `?budget` | everywhere | Measure | Counts the motion budget only, with no readout, for a run that reads pps.motionBudget. |
| `?lap` | everywhere | Measure | The device lap: a fixed route of about 90 seconds the page drives itself and writes up as one block of text to paste back. |
| `?inputs` | everywhere | Measure | Starts the input-to-paint tracker at load (tap, press or key to the first changed frame, last 200 inputs). |
| `?testclock` | everywhere | Measure | Starts the page on the test clock before any other module reads the time (the number is the rate; none means the default). |
| `?rest` | everywhere | Compare | Turns the rest pacing off (frames at a lower rate when nothing moves), for comparing. |
| `?scene` | everywhere | Compare | Turns the page's own layout engine off, so every element is asked of the browser. |
| `?scenecheck` | everywhere | Compare | Compares every answer of the page's own layout engine with the browser's and logs a difference. |
| `?swblur` | everywhere | Compare | Leaves the blur effect on a software renderer (it is dropped by default there). |
| `?stageover` | everywhere | Compare | Draws the figure's overlays on the GPU (off by default; on a software renderer only when asked for). |
| `?gpuorgans` | everywhere | Compare | Organs on the GPU on the software renderer too, for the browser check of the plate layers. |
| `?lumen` | everywhere | Compare | No lumen pass and no blood drawn by the Tube renderer (a device A/B that proves or clears the lumen pass). |
| `?lumenscale` | everywhere | Compare | The lumen layer's size as a share of the vessel layer (0.25 to 1) for every instance. |
| `?debug` | preview and local run | Pages | The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, ?debug=full its long walk, ?debug=frame the device frame. |
| `?gallery` | preview and local run | Pages | The old spelling of ?debug (?gallery=frame is the phone frame, ?gallery&sweep=... runs the Sweep; the sweeps still open it so). |
| `?check` | preview and local run | Pages | The old spelling of ?debug=check, the Phone check (?check=full for the long walk). |
| `?rate` | everywhere | Pages | The Phone check's old spelling of the test clock's rate: the same as ?testclock=N. (old spelling of ?testclock) |
| `?only` | everywhere | Pages | The Phone check or the Sweep: just these journeys or specimens (comma list). |
| `?steps` | everywhere | Pages | The Phone check: steps=0 leaves out the per-step rows. |
| `?fresh` | everywhere | Pages | The Phone check: fresh=1 forgets a walk the browser was part way through. |
| `?sweep` | preview and local run | Pages | The gallery page: run the Sweep over these specimens (a list, or affected). |
| `?testframe` | everywhere | Measure | The test clock's frame length in ms (with ?testclock). |
| `?presenter-view` | everywhere | Pages | The presenter's second window; the value names the talk it follows. |
| `?script` | everywhere | Open | Open this deck (with ?slide=N). |
| `?slide` | everywhere | Open | Open this slide of ?script. |
| `?preset` | everywhere | Open | Open this patient preset. |
| `?home` | everywhere | Open | Open Patients or Present (?home=explore\|present). |
| `?back` | everywhere | Open | Open quietly (no case card, no shared-scenario toast): a replay or a back link. |
<!-- /generated -->

## 14. For agents (appendix)

**One command:** `npm run debug` lists the verbs.

| Verb | What it does |
|---|---|
| `packet show\|link\|replay\|compare\|test\|make` | The bug packet: read a paste, replay it, prove a fix, make a regression test (`docs/bug-packet.md`). |
| `report show\|compare <paste>` | Read the report block of any tool, a packet or a replay; compare any two (`docs/report.md`). |
| `model ...` | The model's numbers for a patient, a treatment and some days (`docs/model-cli.md`). |
| `sweep decks\|specimens\|turns` | The layout-only headless sweeps (every card at several sizes). |
| `rules [--family f]`, `limits`, `flags` | The registry, the standing numbers and the flags, with owners. |
| `scan` | Node-only scans: off-GPU, wording, source shapes. |
| `affected` | The gallery links a change touches (paste into the push message). |
| `doc [--check]` | Regenerate (or check) the generated tables of this file. |

**Allowed run types (the owner's rules):** Node (unit tests, `npm run model`, packet replay, `npm run debug`); layout-only headless through `scripts/headless.mjs` only (every GL draw stubbed, no picture, no screenshot; `tests/headless-only.test.js` holds this); the owner's own devices through the preview. Never GitHub Actions runners or minutes for a check or a sweep. No pictures or timing from software GL. Play-tests, only when asked, run on his Mac in the Claude desktop app's browser.

**Adding things.** A **rule**: `registerRule({ id, owner, why, family, kind, check })` in `src/ui/selfcheck/`, one import line in `selfcheck/plugins.js`, a test that fires and one that must not (`tests/selfcheck-helpers.js`); runners select by family and never import a judge. A **reader** (a part of the screen report): `registerReader` in `src/ui/screen/`; the readers are the only readers (`pps.gallery.check/words/boxes/edges` are views of them). A **limit** (one of the owner's numbers): `src/ui/selfcheck/limits.js`, never a literal in a judge. A **runner**: an adapter in `src/ui/report/emit.js` plus a case in `tests/run-report.test.js`, so its output is one report block. A **flag**: a row in `src/ui/flags.js`; nothing else reads the address. A **device size**: `src/ui/devices.js`. A **gallery specimen** for every new card, tool, pane or sheet: `src/ui/gallery/catalog.js` (the coverage test fails until it has one).

**Where the code is.** `src/ui/selfcheck/` (rules), `src/ui/screen/` (readers, `settle.js`), `src/ui/packet/` (packet, replay, short report), `src/ui/watch/` (recorder and motion rules), `src/ui/report/` (finding and run report), `src/ui/gallery/` (the page, Check, Sweep, Phone check, benches), `scripts/headless.mjs` and `scripts/debug.mjs`.
