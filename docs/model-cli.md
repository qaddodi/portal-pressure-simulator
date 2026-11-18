# The model from a terminal (`npm run model`)

Use this for any question about what the model says: a number for a patient, what a treatment does, what a slide shows. It runs the
same engine and the same step chain as the app's slides (`src/worker-core.js` `sequence`: preset → params → settle → actions → days →
settle), so a number here is the number the app prints for that state. No browser, no pictures, no timing; a run takes about a second
(a deck, 5 s the first time, then cached by `tests/deck-states.js`). It touches nothing in the app.

```
npm run model -- --preset cirr-decomp --carvedilol --days 30          one state, as text
npm run model -- --preset cirr-decomp --tips 8 --compare              the preset as loaded beside the treated state, with the change
npm run model -- --preset csph --set albumin=3 --json                 JSON: every fingerprint number plus the app's words
npm run model -- --deck carvedilol --slide 3                          what the app shows on that slide (slide 1 is the outline)
npm run model -- --list                                               presets, decks, shortcuts
```

## What goes in

| Option | Meaning |
| --- | --- |
| `--preset <id>` | The patient (`--list`); `--preset-days N` adds disease days before the change |
| `--propranolol` `--carvedilol` `--terlipressin` `--octreotide` | Drugs on |
| `--tips [mm]` `--dips [mm]` | A TIPS or DIPS stent, 8 mm unless given (6 to 12) |
| `--diuretics` `--anticoag` `--splenectomy` | Switches |
| `--albumin` `--cirrhosis` `--meal` `--gestation` `--splenic-rx` `--nsbb-gain` | Numbers |
| `--band` `--paracentesis mL` `--action '{"kind":"infuse","fluid":"prbc"}'` | Actions (kinds: `applyAction` in `src/worker-core.js`), run after the change and before the days |
| `--set path=value` (repeat), `--params '<json>'` | Any parameter of `defaultParams()` in `src/engine/scenario.js`, for example `--set fibrosis.R.sin=3` |
| `--days N` | Days that pass after the change |
| `--compare` | Before (the preset as loaded) beside after (change plus days), with the change |
| `--deck <id>` `--slide <n or slide id>` | A deck's own state, as the presenter numbers its slides |
| `--json` | JSON instead of text |

The preset is one settled step; everything else is a second step that follows it, so "before" is the preset as loaded.
A parameter the model does not have, a vessel id it does not know or a value outside its range is **refused** (exit 2), never
dropped or clamped quietly: the engine would otherwise ignore a typo and print the untreated patient.

## What comes out

Text, in groups: Pressures (portal vein, WHVP, FHVP, HVPG, PPG, right atrium, IVC, sinusoid), Flow (portal flow, velocity, liver
perfusion %, shunted %), Ascites (volume, SAAG, protein), Varices and spleen (varix mm, wall stress as % of rupture, gastric varix,
spleen, platelets), Stiffness (LSM, SSM), Circulation (MAP, BP, heart rate, cardiac output, HE index). HVPG and PPG carry the app's
words and colours from `src/engine/pressure-cuts.js` (HVPG amber 5, red 10; PPG amber 6, red 12), and an HVPG with the hepatic vein
clotted reads "Not measurable", as on the app's tiles.

`--json` gives `{ input, before?, after, change? }`. Each state is `{ fingerprint, readout }`: `fingerprint` is every key of
`fingerprintOf` (`src/engine/fingerprint.js`; pressures mmHg, `pvFlow` L/min, `asc` mL, `shunt` 0 to 1, `wall` 0 to 1 of rupture,
`plt` ×10³/µL), and `readout` has the HVPG and PPG status (`ok`, `caution`, `danger`) and word, and the varix and ascites grades.
`change` is after minus before for every numeric key.

## Limits

It prints the settled state after the days, not the path: for a curve over time use the app's Over time chart or run the command at
several `--days`. A time-lapse slide (`lapse`, `ramp`) reports its end state. `--deck` numbers are the app's, shown at full precision
as the fingerprint holds them. Exit codes: 0 done, 2 a bad option (the message says which), 1 a crash.

Home's patient cards (`src/ui/snapshots.js`) come from the quiet settle and can differ from this command by 0.1 to 0.6 mmHg; the slides, and so
this command, read the model at the bedside clock (`atBedside` in `src/worker-core.js`: beat and breath on, the shown means). Ask this command, not the snapshot file.

Tested by `tests/model-cli.test.js` (the numbers equal the worker chain's and sit within 0.7 mmHg of Home's snapshots; typos are refused; `--compare`, `--deck`, `--list`).
