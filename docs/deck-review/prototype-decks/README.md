# Three new decks, ready to try

These are the top three new decks from the review, built as real deck files. They are drafts for the owner to judge on the preview, not finished teaching. The clinical claims listed under "Check before teaching" rest on literature summaries, not on the guideline PDFs.

| Deck | Topic, after | Level | Slides | What it teaches that no deck does now |
|---|---|---|---|---|
| `encephalopathy` (Encephalopathy and shunting) | Complications, after Paracentesis | core | 8 | Encephalopathy as blood skipping the liver: first pass, a spontaneous splenorenal shunt, embolizing it and what that costs, stent width after a TIPS, narrowing a stent |
| `refractory-bleed` (When banding fails) | Complications, after Variceal bleed | advanced | 10 | The balloon bridge, rescue TIPS and when it is futile, a fundal varix bleed, BRTO against TIPS |
| `cause-treated` (Treating the cause) | Treatment, after Beta-blockers | core | 8 | Portal hypertension receding after hepatitis C cure, CSPH that persists when the HVPG started high, and weight loss in obese MASLD |

Each deck has 4 objectives, 4 quick-check questions and 2 or 3 case cards. Every number in the lines comes from live tokens; the only typed figures are two story numbers (an 8 mm stent and a 12% weight loss).

## Files

- `new-decks.patch`: the three deck files plus the `src/ui/decks.js` changes (three imports, one `DECKS.push`, three menu entries). Made against the integration branch at `db014d21`.
- `encephalopathy.js`, `refractory-bleed.js`, `cause-treated.js`: the same deck files, for reading.

## How to apply (for the dev)

On the integration branch:

```sh
git apply docs/deck-review/prototype-decks/new-decks.patch
node scripts/handout-figures.mjs encephalopathy refractory-bleed cause-treated   # tests/handout.test.js needs a figure per slide
npm run stamp
npm run lint && npm test
```

Then take the usual phone, iPad and desktop screenshots and push to the integration branch for the preview.

## What was checked

On a scratch copy of `db014d21` with the patch, the handout figures and `npm run stamp`:

- `npm test`: 898 of 898 pass.
- `eslint .` with the repo's own config: clean.
- Layout sweep (`tests/e2e/deck-sweep.mjs`) on desktop, iPad and phone, run earlier on `1af29676`: no off-screen cards, overlaps, clipped teaching text or console errors. The warnings it printed (text-size mismatch on desktop, 'title not shown' on case steps, a counter button outside its card on phone) also show on the existing `shunts` deck, so they are not from these decks.
- Every model number in the outlines was re-run headlessly. All matched within 5% except the refractory-bleed rescue PPG and the BRTO-against-TIPS compare; no rating changed, and the lines use tokens, so the screen shows the model's own numbers.

Not checked: smoothness on real devices. The sandbox renders at 1 to 3 fps, so screenshots show states, not motion.

## Needed in the app before `refractory-bleed` meets the easing rule

The deck runs, but four things on the figure pop instead of easing. They also affect the existing `variceal-bleed` tear and band slides.

1. **Balloons pop in and out.** The balloon is rebuilt with no fade (`stage.js:5618-5620`); only clamps fade (`stage.js:3796`, `:3912`). Fade balloons the way clamps fade, over about 450 ms.
2. **Bleeding jets and the stomach pool vanish in one frame** (`bleedSpray`, `stage.js:7432-7437`). Keep the last shapes and ease their alpha to 0, and up from 0 on a rupture, over about 0.5 s.
3. **The bleeding stops before the balloon appears.** The bleed state switches at the start of the morph and `balloonEso` halfway (`worker-core.js:47-61`); on the phone the jets stopped 1.4 to 3.8 s before the balloon showed. Switch both at the same point, or bring the balloon in first.
4. **The scope never shows the balloon.** The scope reads `params` from the raw frame (`instruments.js:173`), but frames carry params only when they change (`worker-core.js:124`), so the balloon eases in for one frame and back out. Read `store.get().params` instead.

Smaller ones:

5. `table-marks.js:102-107`: add `gv` and `hb` to COLS and CUT. The fundal varix cannot be a summary column without it, and `variceal-bleed` already heads a column with the raw key "hb".
6. `diseases.js`: add MASH (and decide on NASH), so a title can name it. The disease-pill test fails on it today, which is why the `cause-treated` title says MASLD.
7. `tests/e2e/deck-sweep.mjs` presses the arrow once per slide, but each case card needs an extra press. The last N slides of a deck with N cases are never swept, and case steps report "title not shown". Lift the case card first.
8. In the handout figures, a days chart stops short of the lapse's end value (`cause-treated` year1: 8.6 against 7.7 mmHg). The committed `varices` lapse figure does the same. Check on a device; if real, add the final trail point when the computed state takes over.

## Where these decks overlap existing ones

- `encephalopathy` srs reproduces `shunts/srs` exactly. Let `shunts/srs` keep the gradient against liver-flow trade and point here for the work-up of recurrent encephalopathy.
- `encephalopathy` tips and narrow overlap `shunts/tips` and `shunts/wide`; the numbers agree. `treatment.js:78-79` and `tap.js:69` say encephalopathy after TIPS is "about a third", and this deck says "a third to a half in the first year". Align all three.
- `refractory-bleed` builds on `variceal-bleed/band`, which calls the esophageal stent "preferred". Align the wording (check item 3 below) and add a pointer from `variceal-bleed/band` notes.
- `refractory-bleed` gv and choose reuse the `gastric-varix` patient of `shunts/grs` and `shunts/brto`, but the cases differ.
- `cause-treated` shares the `csph` patient (24.1 kPa, 88,000/µL, HVPG 11.6 mmHg) with `hvpg`, `where-resistance` and `stiffness/rule`; its case card uses different words.

## Check before teaching

No learner text names Baveno VII, and guideline names are left off the slides where the source could not be confirmed. These claims still need the owner's check against the sources:

1. `cause-treated` year2 and check 1: after cure, a stiffness under 12 kPa with platelets over 150,000/µL rules CSPH out and follow-up can stop. This is a Baveno VII statement. If Baveno VIII did not keep it, use "makes CSPH very unlikely" and "the hepatologist may stop portal hypertension follow-up".
2. `refractory-bleed` rescue: the futility limits (Child–Pugh 14 or 15; MELD 30 or more with lactate 12 mmol/L or more). Safest wording if unverified: "Often futile in the most advanced liver failure, or shock with failure of several organs", with "Decide with the transplant team" in the notes.
3. `refractory-bleed` balloon notes: the balloon kept up to about 24 hours, and the small trial in which a covered esophageal stent beat the balloon (Escorsell 2016). Safest: "Where available, a covered esophageal stent is an alternative bridge."
4. `refractory-bleed` choose notes: when TIPS suits and when BRTO suits (AASLD 2024 guidance) and the French pre-emptive TIPS trial after a fundal bleed (GAVAPROSEC 2025). If unverified, delete the trial sentence.
5. `encephalopathy` tips notes: overt encephalopathy in a third to a half of patients in the first year; 8 mm stents causing less than 10 mm (Wang 2017); rifaximin 14 days before a TIPS cutting overt encephalopathy by about a third (Bureau 2021). Safest: "about a third", and "lowered overt encephalopathy in a randomized trial".
6. `encephalopathy` collat and srs: one test such as animal naming finds covert encephalopathy; treat the precipitant, then lactulose to 2 or 3 soft stools a day, then rifaximin after a recurrence (ACG 2026 guideline, known only from a summary). Keep without attribution until checked.
7. `encephalopathy` embolize and price notes: embolization controls encephalopathy in most selected patients; new or larger varices or ascites in about 15% and bleeding in about 10%. Safest: "in selected patients with good liver function" and "in some patients".
8. `encephalopathy` narrow notes: narrowing the stent, or embolizing a large spontaneous shunt, for encephalopathy after TIPS (Baveno VIII, per a summary). Unattributed on the slide.
9. `cause-treated` high and loss notes: ascites seen only on ultrasound is not decompensation; 10% weight loss goes with a 30% fall in stiffness; GLP-1 receptor agonists; bariatric surgery only without CSPH (Baveno VIII MASLD statements, via summaries). Safest: "Weight loss of about 10% or more lowers the stiffness."
10. `cause-treated` year1, high, high2 notes: "in many patients with CSPH before treatment it stays at 10 mmHg or more". Safest: "in some patients".
11. `refractory-bleed` fail, gv and gvbleed notes: "about 1 in 10 is not controlled"; fundal varices bleed less often but more heavily; cyanoacrylate is off-label in the US. Safest: "a minority is not controlled".
