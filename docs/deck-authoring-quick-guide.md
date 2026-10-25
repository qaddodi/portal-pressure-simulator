# Writing a deck: the short guide

This guide is for people. It explains what a deck can show, gives one small example of each feature and says when to use it. Each section ends with a pointer to the full guide, `docs/deck-authoring-guide.md`, which lists every option, value and rule. When the two disagree, the full guide and the code win. Both were checked against the app on 22 Oct 2026.

## How a deck works

A deck is a talk played on the live model. Each slide says which patient to show and what changed. The app works out every pressure, flow and size itself, so the numbers in the words, the figure and the cards always agree.

A slide has three parts on screen:

- **The teaching card** holds the title and one short line of words.
- **The figure** is the body plate (or the circuit map) with its vessels, labels and highlights.
- **The data card** holds the numbers: a pressure ladder, tiles, a chart or an instrument.

The app adds the outline slide at the start, the quick check at the end, the deck's name tab and the printed handout. You never write those.

A deck file is a JavaScript object. The smallest useful deck looks like this:

```js
export const MY_DECK = {
  id: 'my-deck', level: 'core', title: 'A clot in the portal vein', minutes: 5,
  summary: 'What a portal vein clot does to the pressures.',
  objectives: ['Explain why the HVPG stays normal', 'Name the gradient that finds the clot', 'Describe a cavernoma'],
  checks: [['Which gradient finds a portal vein clot?', 'The PPG.'], ['Why is the HVPG normal?', 'The catheter reads the sinusoids, downstream of the clot.'], ['What grows around an old clot?', 'A cavernoma.']],
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'],
      mark: { edges: ['PV_TRUNK'], label: 'Clot' },
      data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'Acute clot', site: 'pre', title: 'A clot in the portal vein',
      line: 'Behind the clot, the portal pressure climbs to {pv}.',
      notes: 'Printed in the handout only.',
      ask: ['What is the first treatment?', 'Anticoagulation, started at once.'],
    },
  ],
};
```

Full guide: sections 1 to 3, the template in section 10 and a complete example in section 11.

## Writing the words

Each slide has a `title` that stands on its own and a `line` of fewer than 45 words. Write for a learner, in full sentences, the way a clinician teaches on rounds. Run every line through `docs/ai-humanizer.md`.

- **Live numbers.** Write `{hvpg}`, `{ppg}`, `{pv}` and the app fills in the patient's value in a coloured pill. Use these instead of typing a number, so the words always match the figure. `{ppg@before}` reads the value at the slide whose `id` is `before`.
- **Cut-offs.** Write `{>=10 mmHg}` and the app draws an outlined pill reading "10 mmHg". Put the words around it: "above {>=10 mmHg}". A filled pill is the patient; an outlined pill is the rule.
- **Words that point at the figure.** Write `[portal vein](pv)` and the words become a pill in the portal vein's colour, and the vein lights up on the figure.
- **Causes.** `causes: ['Cirrhosis', 'MASH']` adds up to four short items after the line.
- **A source line.** `cite: 'Baveno VIII 1.15, 1.16'` prints a small source under the words. Use it when a slide states a guideline rule. Cite Baveno VIII, EASL 2025 or AASLD 2024, never Baveno VII.
- **Small print.** `caveat` adds one sentence where the model differs from real patients.
- **Handout only.** `notes` and `ask` print in the handout and never show on screen.
- **The closing quick check.** `checks` holds 3 or 4 `[question, answer]` pairs, and the app turns them into the last slide. Make one a reasoning question that gives a change in the numbers and asks what moved: `['The HVPG falls from 16 to 11 mmHg on a beta-blocker. Is the bleeding risk gone?', 'Much lower, not gone: varices can still bleed below 12 mmHg.']`. A card with four questions is full: merge two recall checks to make room for a reasoning one.
- **Puzzle first.** End the slide before a reveal on the paradox as a plain statement ("A meal is about to raise the portal flow by half."), and let the next slide resolve it.
- **One coloring a line, and a title that names the finding.** Write a "Colored by …" sentence only when the color is the finding, since the key already says what each coloring shows. Title a slide "A clotted hepatic artery starves the bile ducts", not "Hepatic artery thrombosis".
- **Say when the patient changes.** "In another patient with CSPH, …" for a new one, and "Back in the first patient, …" for a return (that slide then carries its own `preset`, `days` and `ramp`).
- **Name the setting of a source.** Baveno VIII Table 3's HVPG response (a fall of 10% or more, or to 12 mmHg or less) is stated for primary prophylaxis. EASL 2025's recanalization is about 4 in 10 without cirrhosis and 7 in 10 with it. Check a claim against `/mnt/project-files/guidelines/` and leave out what no file supports.
- **Taking a slide out.** Delete its handout figure and its `tests/deck-adopted.js` entries, fix `sections` and `objectives`, then run `UPDATE=1 node --test tests/deck-terms.test.js` once, after reading the diff.

Full guide: section 6 (words), section 9 (house rules).

## Choosing the patient

- `preset: 'cirr-decomp'` loads a patient fresh. There are 17, from healthy to Budd–Chiari.
- `params: { drugs: { carvedilol: true } }` changes only what you name.
- `action: { kind: 'band' }` is a one-off event, such as banding, paracentesis or a bleed.
- `days: 90` lets the disease run on, and `ramp: { cirrhosis: [0.5, 0.6] }` moves a setting across those days.
- `lapse: { seconds: 8 }` plays those days on the figure as a time-lapse.
- `days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }` plays a meal. Add `clock: 'seconds'` to the lapse when a Doppler has to keep recording while it happens, so the trace shows the flow rising.
- `params: { fenestrae: 1 }` opens the pores in the sinusoid wall again, and `0` leaves them as the disease has them.

A slide that sets none of these keeps the patient from the slide before.

Full guide: section 4, and the lists of presets, settings and actions in section 8.

## Opening a new patient with a case

`vignette: 'A 39-year-old woman with factor V Leiden …'` shows a short clinical case on a centred card when the talk moves forward onto a slide that loads a new patient. Keep it under 220 characters, quote findings rather than pressures, and put it only on a slide with a `preset`. Before a reveal the room should think about, add `caseQ: 'Will his HVPG be raised?'`: one short question on its own line under the case. The case and its question together stay under 220 characters.

Full guide: section 14.

## Framing the figure

- **Camera.** `cam: 'portal'` frames a named region such as `liver`, `spleen`, `varices`, `heart` or `gut` (the portal system with the whole small bowel). `cam: 'lobule:central'` dives into the liver lobule.
- **Circuit view.** `view: 'circuit'` shows the electrical-circuit map instead of the body.
- **Labels.** `labels: ['CONF', 'RHV', 'RA']` names those stations on the figure. Only the stations you list appear.
- **Glow.** `glow: ['C3', 'spleen']` lights vessels or organs the words do not name. Add `glowSeq: 550` to light them one after another.
- **Marks.** `mark: { edges: ['PV_TRUNK'], label: 'Clot' }` rings a vessel and adds a callout. Use `kind: 'treat'` for a stent or bands and `kind: 'note'` to name a collateral.
- **Readings on the figure.** `sites: ['pv', 'ra']` writes those pressures beside the vessels.
- **The HVPG catheter.** `cath: 'wedge'` plays the catheter step instead of a camera move, and `monitor: 'wedge'` shows its tracing.

Full guide: section 5.1 to 5.8.

## Colouring the vessels

`lens: 'velocity'` colours every vessel by its speed instead of its pressure, and a small key appears on the figure. Use a lens when the colour is the point of the slide, such as a reversed vein on `direction` or a fast stent on `velocity`. Say in the line what the colours show ("colored by velocity").

Two lenses are for decks only:

- **Vein systems.** `lens: 'system'` colours portal veins, systemic veins and shunts in three colours. The Varices deck uses it on its collaterals slide.
- **Change since.** `lens: 'since'` colours each vessel by how much its pressure moved since the slide before. `since: 'norx'` compares with another slide instead, and `sinceLabel: 'no Rx'` names it in the key. The Lowering pressure deck uses it to show what each treatment changes. It works inside the liver lobule too: the lobule's vessels and readings take the same colours, so the Propranolol or carvedilol deck can show what carvedilol adds there.

Full guide: section 5.2 and section 5.9.

## Highlights on the figure

These are optional extras. Each shows only on the slides that ask for it.

- **Spotlight.** `spot: ['@esophageal']` keeps the named vessels bright and dims the rest. Use it when one route matters and the rest is noise.
- **Named groups of vessels.** `@esophageal`, `@collaterals`, `@shunts`, `@hepatic-veins` and others stand for a whole set in `glow`, `spot` and marks.
- **Normal spleen outline.** `normalOutline: ['spleen']` draws a dashed line at the normal size inside an enlarged spleen.
- **Calipers.** `calipers: ['spleen']` draws a measuring line with its reading. It also works for `'varix'`, `'TIPS'` or any vessel.
- **Scale switch (Anatomy / Lobule / Sinusoid pill).** `scales` lets the presenter flip the figure to other scales of the same patient and back. Short form: `scales: ['lobule', 'anatomy:fit']`. Full form: one view per scale, with its own camera and callouts:
  `scales: { anatomy: { cam: 'liver', labels: ['CONF'], glow: ['PV_TRUNK'], mark: {...} }, lobule: { cam: 'lobule:triad', zoom: 2.6, glow: ['lobule:triad'], callout: { at: 'triad', label: 'Resistance' } } }`.
  The slide's own scale shows the slide as written. Another scale shows only its own view (cam, zoom, kMax, clear, labels, mark/marks, sites, glow, callout, layers). Every slide opens on its own scale, again on Next, Back and jump, because a flip is never remembered. Sinusoid only on pressure-lens slides. Never on question, catheter, Doppler, calipers or Circuit slides. The pill sits left of the slide counter on Mac and iPad landscape, and centred above the teaching card on phone and upright iPad. Adopt runs of slides together and list built-in ones in `tests/deck-adopted.js`. Full details: guide 5.10.
- **Gut glow in a time-lapse.** `lapseGlow: ['bowel']` on a slide with `lapse` glows those organs from the days' start and keeps them lit while the slide is up, easing in and out. Use `cam: 'gut'` so the bowel is in frame.
- **Pressure ripple.** `ripple: true` makes the vessels whose pressure moved glow warm or cool for a moment as the slide lands. Use it on the slide where a drug or a TIPS starts.
- **Live numbers in a callout.** A mark's label can hold a live value: `mark: { organ: 'spleen', label: 'Spleen {spleen}' }`.
- **Numbered steps.** `steps: true` with `glowSeq` numbers each glow as it lights, for a route the eye should follow in order.
- **Circuit brackets and zones.** On the circuit view, `span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }]` draws a bracket with its reading, and `zone: 'liver'` shades that part of the circuit.

Full guide: section 5.9.

## The data card

### Ladder and tiles

- `tool: { kind: 'profile' }` shows the pressure ladder, the Gut to heart chart. It has three tinted zones (pre-hepatic, intrahepatic, post-hepatic), the HVPG and PPG brackets with the two readings as pills at the top right, and a red block wherever the pressure falls steeply, so the chart shows where the resistance is. (An old `data: 'ladder'` is read as this chart.)
- `data: 'tiles', tiles: ['hvpg', 'plt']` shows readout tiles. Each tile has a coloured scale with a dot for now and a ring for where it started.
- `key: ['hvpg']` highlights a tile and bolds its name in the words.
- `delta: true` shows each tile's change from the slide before.
- `tool: { kind: 'profile', from: 'norx', fromLabel: 'No Rx' }` draws an earlier state as a faint dotted line on the chart, to show what a treatment changed.

- A data card that is the same on the next slide (same `tool` and options, same tiles) stays on screen while the words change, and its numbers ease to the new slide's. Different tiles or instrument options build it afresh.

Full guide: section 7.1 and the tile list in section 8.6.

### Instruments

An instrument goes in the data card with `tool`. It reads the live model, so it moves when the patient changes.

| What you want to show | Write | Use it when |
|---|---|---|
| Spectral Doppler in one vessel | `tool: { kind: 'doppler', vessel: 'PV_TRUNK' }` | flow direction, speed or wave shape is the point |
| The esophagus through a scope | `tool: { kind: 'scope' }` | varix size or banding |
| A FibroScan reading | `tool: { kind: 'fibroscan' }` | liver stiffness |
| A spleen ultrasound | `tool: { kind: 'spleen' }` | spleen size, with calipers and the length in cm |
| A bedside monitor | `tool: { kind: 'vitals', show: ['hr', 'map', 'hb'] }` | the patient's heart rate, pressure, output or hemoglobin, with an EKG strip |
| The HVPG catheter's tracing | `tool: { kind: 'hvpg' }` | how the HVPG is measured, free pressure to wedge to result |
| HVPG and pressures across the talk | `tool: { kind: 'trace', range: 'talk' }` | a patient followed over months |
| The belly and its ascites | `tool: { kind: 'abdomen' }` | ascites and wall collaterals |
| The varix wall | `tool: { kind: 'wall' }` | why a large varix bursts |
| Pressure and flow around a meal | `tool: { kind: 'flowtime' }` | a time-lapse with a meal |

Doppler has extra options. `mode: 'color'` shows a colour Doppler map. `calipers: true` marks peak and trough and gives the pulsatility index. `pair: true` adds a slim second trace (a hepatic vein under a portal vein). `scale: 60` fixes the velocity scale so a fast jet wraps round, which shows aliasing, and `baseline: 0.3` moves the baseline to make room. On a stent, `gate: 'distal'` picks the third that is sampled and `points: true` calls out the velocity at all three.

The app judges slow, absent and backward flow with one set of cut-offs everywhere: under 1 cm/s is no flow (2 cm/s for a stent), under 9 cm/s is stasis, and a tiny backward flow near zero is not called reversed. Word the line to match what the trace shows.

Full guide: section 7.2.

### Newer charts in the card

| Chart | Write | What it shows | Use it when |
|---|---|---|---|
| Pressure profile | `tool: { kind: 'profile' }` | the pressure from gut to heart through eight stations, with the healthy line dashed | showing where along the way the pressure is lost |
| Portal blood bar | `tool: { kind: 'flows' }` | one centred bar split by where the portal blood goes, the healthy split a dashed bracket over it, small routes named in pills under it | collaterals, shunts or a TIPS taking blood past the liver |
| Liver inflow bar | `tool: { kind: 'flows', of: 'inflow' }` | one centred bar: the liver's inflow split into portal vein and hepatic artery, the healthy split a dashed line over it | the arterial buffer, or a TIPS stealing portal flow |
| Setting curve | `tool: { kind: 'curve', param: 'cirrhosis', from: 0, to: 1, lines: ['ppg'] }` | one reading across a setting's range, with a ring at the slide's value | dose or severity against pressure |
| Causes waterfall | `tool: { kind: 'causes' }` | steps from the healthy PPG to the patient's, one per cause | splitting a pressure into what raised it |
| Two-reading plane | `tool: { kind: 'plane', plane: 'csph' }` | the case as a dot on stiffness against platelets, with the Baveno VIII zones | ruling CSPH in or out without a catheter |
| Cross-section | `tool: { kind: 'lumen' }` | the vessel cut across, with how much is open, clotted or stented | a clot, a web or a narrowed stent |
| Fluid balance | `tool: { kind: 'fluid', window: true }` | the day's lymph made split into what the lymphatics carry, what the belly reabsorbs and what builds as ascites, on one strip | how ascites builds and what treatment changes |
| Criteria card | `tool: { kind: 'criteria', title: 'Who gets a pre-emptive TIPS', rows: [..] }` | a guideline's rules as up to four rows; a row read from the model (`['HVPG 20 mmHg or more', 'hvpg', '>=', 20]`) shows its reading with a tick or a dash; `note` gives the case's own value and `lit: true` sets the row that applies in full-white words; `ticks: false` for a classification | the rules are the lesson (pre-emptive TIPS, recompensation, the Sarin classes): a phone never shows the causes line, but it shows the card |

A few details worth knowing:

- The portal blood bar is one bar across the card with a dashed Healthy bracket over it; a route too narrow to carry its name is named in a pill under the bar, so the card has no leaders and nothing off to one side.
- A profile with `from: true` adds a dotted line for the slide before.
- A curve with `against: { label: 'Carvedilol', params: { drugs: { carvedilol: true } } }` draws a second line for a drug on the same scale.
- A year chart with `style: 'milestones'` shows the HVPG line alone and names the slides that set `milestone: 'Dx'`. `since: 'dx'` starts the chart at that slide, and `bands: ['carvedilol']` shades the time a drug was on.
- A cross-section of a stent takes `site: 'mid'` to say where it is cut.
- These charts use the model's own numbers. Do not quote their shares in the words without a checked source.

Full guide: section 7.2, and 7.5 for the criteria card.

### Whole-panel visuals

`visual` replaces the words and the figure with a panel, with the figure dimmed behind. Use it for a summary or a comparison.

- `visual: 'table'` with `of: ['clot', 'cavernoma']` puts earlier slides in a table, one row each. `cols` picks the columns (`pv hvpg ppg varix gv asc plt lsm spleen map hr co bv` and more; the full guide lists them). A `wave` column adds a small Doppler trace to each row, and `focusRow: 'clot'` highlights one row.
- `visual: 'ladders'` puts several ladders (Gut to heart charts) side by side.
- `visual: 'scale'` puts several patients on one banded scale.
- `visual: 'plane'` puts several patients on a two-reading plane (`plane: 'hvpg-ppg'` or `'csph'`).
- `visual: 'quadrant'` sorts ascites by SAAG and protein, and `visual: 'walls'` compares the gut capillary wall with the sinusoid wall.

End every deck with a `visual: 'table'` summary under `kicker: 'Summary'`.

Full guide: section 7.3.

### Buttons and sliders

- **Treatment buttons.** `compare: [{ label: 'No drug', params: { drugs: { carvedilol: false } }, own: true }, { label: 'Carvedilol', params: { drugs: { carvedilol: true } } }]` lets the presenter switch treatments live. Give each button the full set of switches.
- **Patient buttons.** `{ label: 'Normal heart', preset: 'healthy' }` eases to another patient and back. A patient button can carry `params` and `days` too: `{ label: 'No anticoagulation', preset: 'pvt-acute', params: {}, days: 180 }` leaves the acute clot alone for six months.
- **Time-point buttons.** `{ label: 'Day 0', slide: 'd0' }` eases to the state of an earlier slide of the same deck, one patient's earlier visit. The slide's own button is `{ label: 'Day 365', own: true }`.
- **Lens buttons.** `{ label: 'Direction', lens: 'direction', short: 'Dir.' }` switches the colours without touching the model.
- **Gate buttons.** `{ label: 'Distal', gate: 'distal' }` moves a stent Doppler's sample gate, again without touching the model.
- **Instrument buttons.** `{ label: 'No red signs', tool: { red: false } }` changes the options of the slide's scope (here, hides the red wale marks), the model untouched; the slide's own button, `{ label: 'Red signs', own: true }`, puts them back. The Doppler's aliasing slide does the same with `{ label: 'Baseline down', tool: { baseline: 0.85 } }`.
- **Short labels.** Any button can carry `short`, a compact name (`'Prop.'`) that a phone uses when the full names would wrap.
- **A what-if slider.** `whatIf: { label: 'Clot size', param: 'thrombus.PV_TRUNK', min: 0, max: 1, ends: ['None', 'Occluded'] }` lets the room drag one setting and watch everything follow. `whatIf: { label: 'Esophageal air pressure', tool: 'air', min: 0, max: 20, unit: 'mmHg' }` drags a scope option instead (the air's pressure round a varix) and leaves the model alone.

Put buttons and sliders on key slides only. 32 of the 40 built-in decks have at least one. `tests/hands-on-decks.test.js` shows how to test a new one.

### A catheter treatment

`procedure: 'tips'` (or `'brto'`, `'bato'`) puts a Play button on the teaching card. It plays the procedure on the real vessels: the camera follows the catheter, closes in on the balloon, the sclerosant or the stent, and goes back. When it ends, the live model keeps the change, as a treatment button would. `procedure: { kind: 'tips', auto: true }` plays it as the slide lands, going forward only. The patient must not have had the procedure yet and needs the vessels it uses (a gastrorenal shunt for BRTO and BATO). Otherwise the button is dimmed and says why. Do not put it on a slide with the HVPG catheter. A built-in slide uses it only when `tests/deck-adopted.js` lists it.

Full guide: section 7.4.

## Question and answer slides

The capstone decks (Where is the resistance?, Choose the treatment, Stage the patient at the first visit) show each case twice. Doppler of the portal system shows each of its five cases on one slide: the case card asks, the slide answers. The question slide loads the patient with a `vignette`, shows the readings or the live options as `compare` buttons, and asks in its line without naming anything. Where is the resistance? leaves `site` off here, so no level tab gives the answer away. The answer slide carries on with the same patient (no `preset`), names the finding, and may add `delta: 'q1'` to show what changed since the question, a `cite`, and `causesHead` with `causes` for the criteria. Give the two slides the same `kicker`, and never put `scales` on a question slide. Put `hold: true` on the question slide: its card then keeps back whatever names the answer (the chart's red blocks and brackets, the Doppler's direction and pattern words, the tiles' rating words), and they ease in once the answer slide has landed.

Full guide: section 9, rule 23, and section 7.5 for `hold`.

## Asking the room first: the question card

A slide that shows its answer can ask first. Add `question: 'What will a liter lost do to the portal pressure?'`. Going forward, the glass card comes up over the figure as it stands, tagged Question, with the question in large type. A tap, Next or a swipe lifts it, and the slide plays its change (a drug, an action, days, a time-lapse) with the numbers following. The slide is the answer: no choices, no score, no answer line. One question under 100 characters, no number in it, at most one in any three slides and three in a deck. Not on a slide with a `preset`, a `vignette`, a `cath` or a `procedure`. A built-in slide uses it only when `tests/deck-adopted.js` lists it.

Full guide: section 7.5.

## Reading a Doppler in three steps

On a Doppler slide, `grid: true` in its tool adds three boxes under the trace, Direction, Speed and Shape, filled from the reading. `grid: ['dir']` sets the name in full white for the box the slide is about. On a held question slide the boxes stay blank until the answer.

## Showing a response to a drug

On a tiles slide, `hvpgResp: 'ohm'` adds an HVPG fall tile: the fall in percent from slide `ohm`'s HVPG, live, with marks at 10% and 20%. Count from the untreated patient. Full guide: section 7.5.

## Where a bleed stands in time

On a tiles slide in a bleed talk, `clock: { at: 10, label: 'Scope by 12 h' }` adds a Since the bleed tile: the hours from the slide's own words on a bar from 0 to 72, marked at 12 (the scope) and 72 (a pre-emptive TIPS). Never let the hours run backward. Full guide: section 7.5.

## The handout question

Each slide's `ask` prints in the handout, never on a projected talk. Give every content slide a short one with its answer: `ask: ['Where is the resistance?', 'In the sinusoids.']`.

## Adding the deck to the app

You can try a deck without changing the app. In the app, open Menu, then Present, then Your scripts, and choose Import. The deck keeps every feature and stays in that browser.

To make it a built-in deck for everyone:

1. Save it as `src/ui/decks/<id>.js`.
2. Import and register it in `src/ui/decks.js`, and list it under one topic in `TOPICS`.
3. If a built-in slide uses any of the newer options (the highlights, `scales`, `procedure`, charts, `cite`, the deck-only lenses), list that slide in `tests/deck-adopted.js`.
4. Run `npm run lint && npm test`, then `npm run stamp`.
5. Draw the handout pictures with `node scripts/handout-figures.mjs <id>`.

Full guide: sections 12 and 13.

## The rules that matter most

- One idea a slide, and a line under 45 words. A short screen (an iPad on its side) keeps every card's text at 12 px or more, so a slide with too many words fails a browser check. Shorten the words, never the text size.
- HVPG is WHVP minus FHVP (amber 5, red 10). PPG is portal vein minus IVC (amber 6, red 12).
- Say numbers through live values, never typed.
- Say "resistance" for where pressure is lost, not "block" or "obstruction".
- A deck that follows one patient through several decisions (Ten years) puts the preset and the case card on its first slide only, passes time with `days` and `ramp`, and pairs a question slide (with `compare` buttons) with an answer slide at each step.
- Quote a source's criteria even when the model cannot draw them (the jet at a narrowed portal vein), and add one `caveat` that says what the model shows instead.
- Everything eases. Never write a slide that relies on a jump.
- The Testing deck "Demo: all the new visuals" (Present, then Testing, on the preview) shows every newer feature on a slide of its own.

Full guide: section 9.
