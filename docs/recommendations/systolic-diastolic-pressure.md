# Systolic and diastolic pressure: can the model do it, and where it goes

Status (11 Nov 2026): recommendations only, nothing built. Asked by Mohammad: "We should probably add systolic and diastolic since
we're able to model it right? And calculate the MAP subsequently?" Opened by the features thread's Systolic 90 card (item 41): the
vitals rail draws only the MAP 65 hold line because the model has no systolic pressure.

## Short answer

Yes, and with real physiology, not an offset. The model already has most of it:

- The aorta is a compliant node (`AO`, compliance 1.8 mL/mmHg, `topology.js`), drained by the arterioles' resistance: a two-element
  Windkessel.
- The heart already beats every 4 ms step in the worker (`hemoStep`, `WAVE_DT`), with an ejection shape (`systoleShape`) and a filling
  shape (`fillShape`) in `physiology.js`.
- So `P[AO]` already rises and falls each beat. It is just wrong in two ways today (measured below), and nothing reads its peaks.

Systolic and diastolic then fall out of stroke volume, heart rate, arterial compliance and systemic resistance:
`pulse pressure ≈ stroke volume / compliance` (shaped by how long the blood takes to run off, `τ = R·C`), and diastolic is where the
pressure has decayed to when the next beat starts.

One correction to the ask: the model should keep the MAP it has, the true mean of the pressure over the beat, and derive systolic and
diastolic beside it. `(S + 2D) / 3` is a bedside estimate of that mean, not its definition. An oscillometric cuff works the same way
round: it measures the mean (the largest oscillation) and works systolic and diastolic out from it. The organs, the baroreflex and every
flow in the engine run on the mean, so making the shown MAP a formula of S and D would put the display out of step with the model by 3 to
6 mmHg (measured below). Rec 9 tunes the waveform so the formula and the true mean agree within a few mmHg, so either reads right.

## What the engine does today (node runs, 11 Nov, 4 ms steps, beat on, 20 s after settle)

| Patient | P[AO] max/min per beat | Beat mean | MAP shown | SV mL | HR |
|---|---|---|---|---|---|
| Healthy | 99/82 (range 87 to 105 / 73 to 90) | 91.5 | 91.2 | 71 | 64 |
| Compensated | 96/79 | 89.0 | 88.6 | 71 | 71 |
| CSPH | 91/75 | 84.2 | 84.6 | 69 | 82 |
| Decompensated | 88/72 | 81.5 | 81.2 | 71 | 91 |

Two faults, both physical:

1. **The aorta fills when the ventricle fills.** The one pump (`heartFlow`, RA to AO) is scaled by `fillShape`, the right heart's filling
   pattern, and the same flow is put into the aorta. So the aortic pressure falls through ventricular systole (phase 0.04 to 0.36) and
   rises through diastole (E wave at 0.47, A wave at 0.9). Systole and diastole are the wrong way round in time, and the pulse pressure
   (17 to 30 mmHg) is too small because the inflow is spread across most of the beat.
2. **Stroke volume swings with every breath.** With no ventricle or lungs between the right atrium and the aorta, each breath's RA swing
   goes straight into the aorta: stroke volume ran 32 to 96 mL beat to beat in the healthy patient, systolic 87 to 105. A normal
   inspiratory fall in systolic pressure is under 10 mmHg.

## Prototype (scratch copy of the engine, not committed)

Change: the pump still takes blood from the right atrium with the filling shape and the calibrated Starling curve (so every preset's
cardiac output, RA and MAP stay where the tests pin them). What it took in during the last beat is held and ejected into the aorta over
the next systole with `systoleShape`. Patch and scripts: `/mnt/project-files/systolic-diastolic/` (`prototype-engine.diff`,
`proto.mjs`, `bleed.mjs`, `dop.mjs`).

| Variant | Healthy | Compensated | CSPH | Decompensated |
|---|---|---|---|---|
| Ejection timing only | 107/75 | 101/73 | 97/70 | 94/67 |
| + compliance ×0.8, root impedance Zc 0.05, 2 to 3 beat lung buffer | **121/74** | **120/73** | **117/69** | **117/65** |
| MAP shown (unchanged in every variant) | 92 | 90 | 85 | 82 |

- Beat-to-beat systolic swing with the lung buffer: 119 to 129 healthy (was 87 to 105).
- Variceal bleed in decompensated cirrhosis (prototype, 0.9 rupture): the pulse pressure narrows as the volume goes, which is what a
  bleed does, and the two halves of Baveno VIII 4.6 arrive together without being forced:

| Lost | BP | MAP | HR |
|---|---|---|---|
| 0 | 114/67 | 82 | 87 |
| 760 mL | 105/66 | 74 | 110 |
| 1.1 L | 98/64 | 70 | 121 |
| 1.4 L | **88/60** | **64** | 133 |
| 1.8 L | 71/54 | 54 | 158 |

Still off in the prototype: decompensated pulse pressure (52) is wider than the usual 40 to 45, because the prototype gives every
patient the same arterial compliance. Rec 3 fixes that with the cirrhosis compliance rise.

## Recommendations

### Engine (`src/engine/`)

**1. Eject in systole (the core change).** In `step()`, keep the RA side of the pump as it is (filling shape, `heartFlow`, the TR term).
Add a ventricle volume `Vv` that the filling adds to, and eject into `AO` with `SV · HR/60 · systoleShape(phase)`, where SV is the volume
filled over the last beat (Frank-Starling: this beat's output is last beat's filling). The flow source enters `b[AO]` directly; the
`A[AO·N+RA]` coupling goes. Volume stays exactly conserved (`Vv` is counted in the blood total). Quiet steps (`settle`, `relax`, the
disease clock) keep today's steady pump, so nothing about settled states changes.
Ejection here does not depend on afterload. That is fine for the teaching ranges; a true time-varying elastance ventricle (Suga) would add
it but would also replace the calibrated Starling curve that every preset sits on, so it is not recommended now.

**2. A lung buffer between the two hearts.** Add a pulmonary node (`LUNG`, compliance chosen so it holds 2 to 3 beats of transit, low
resistance) between the right-heart pump and the ventricle volume. This is what the prototype's low-pass stood in for. It damps the
breath's swing to the real size, and it gives the right timing for free: inspiration fills the right heart first and the left heart
2 to 3 beats later. Tie it into the chest pressure (`ext`, thoracic) so a strain and a tense belly act on it.

**3. Arterial compliance as physiology, not one number.**
- Lower `AO` compliance to about 1.4 to 1.5 mL/mmHg for the healthy patient (total arterial compliance in adults is usually given as 1 to
  2 mL/mmHg).
- Raise it with the chronic vasodilation, the same driver `mapSetOf()` uses (`slow.splTone`). Arterial compliance is reported raised in
  cirrhosis (Henriksen, Møller and colleagues on the stroke volume to pulse pressure ratio). That paper is not in `guidelines/`; check it
  before the number is set, and add it to the sources.
- Optional: stiffer at higher pressure (the artery `KNEE` is linear now), which widens pulse pressure in hypertension.

**4. Characteristic impedance at the root.** The arterial pressure the cuff sees is `P[AO] + Zc · Q_eject` (three-element Windkessel).
Zc about 0.04 to 0.05 mmHg·s/mL. It lifts systolic without dropping diastolic, which compliance alone cannot do (compliance ×0.55 gave
123/63). It needs no new node: with a flow source it is exact as a sum. Put it in a pure helper (`arterialRoot(eng)`).

**5. Systolic, diastolic and MAP readings.**
- Live beat: track per-beat max and min of the root pressure (as `trackPulsatility` does for the portal vein) and average them over two
  breaths with the same two 4 s stages as `vitM`, so the numbers hold through a breath. Add them to `vitM` (index 5 and 6) and to
  `metrics.vitals` as `sbp`, `dbp`.
- Quiet and disease-clock states (settle, time-lapse days, pinned slide fingerprints): there is no beat, so add a closed-form periodic
  Windkessel in `physiology.js`, `pulseOf({ map, ra, sv, hr, C, R, Zc, te })`, with a square ejection over the systolic time. It gives the
  same S and D the beat would, so a slide's numbers do not jump when its beat starts. A test pins the two within 3 mmHg (rec 12).
- MAP stays `MAPf` (the mean of `P[AO]`). The baroreflex and the organs keep reading it.

**6. Drugs and states then follow without new constants.** Each moves S and D through SV, HR, C or R, the way it does in a patient:
carvedilol's α1 block lowers R, so diastolic falls most; slower heart rates lengthen diastole (lower diastolic, bigger SV, wider pulse
pressure); terlipressin raises R and diastolic; a bleed shrinks SV and narrows the pulse pressure; sepsis and pregnancy lower R.
Add tests for the direction of each (rec 12), not new parameters.

### Worker (`src/worker-core.js`)

**7.** `AO` is already in `SAMPLE_NODES`, so an arterial trace needs no new channel. Add `sbp`, `dbp` to the posted vitals and to the
history and fingerprint records (`fingerprint.js`: `sbp`, `dbp` beside `map`). The beat-on worker path already runs 4 ms steps, so
there is no new cost to speak of: a max, a min and two filters per step.

### UI (all on the GPU, one label style)

**8. Vitals monitor (`vitals-monitor.js`, `vitals-gl.js`, `vital-read.js`).**
- New VITALS entry `bp`: shown like a bedside monitor, `118/72` large with `(88)` small after it, from the same glyph atlas. Alarm when
  systolic <90 or MAP <65 (both Baveno VIII 4.6), same hold and hysteresis as today. Keep `map` as its own entry for slides that want
  the MAP alone.
- Hold rail (`hold: true`): draw the pressure as a short bar from diastolic to systolic with a tick at the MAP, and both lines, 65 for the
  MAP and 90 for the systolic. This is the half the Systolic 90 card is waiting for.
- Drop the "model has no systolic" comments.

**9. Tune the waveform shape, not the formula.** Set Zc and the systolic time so `(S + 2D)/3` lands within 3 mmHg of the true MAP in the
four core patients and through a bleed. Then the formula a learner knows checks out on screen, and the model keeps one MAP.

**10. Tiles, tokens, tables, graphs.** Add `sbp` and `dbp` (or one `bp` tile that prints `S/D`) to: tile keys and token list (`{bp}`,
`{sbp}`), `table-marks.js` COLS and cut-offs (<90 "Low"), `flow-time.js` LINE, the inspector's Aorta row, Tests > Readouts. Bottom bar:
recommend it keeps MAP (phone width); BP goes in Readouts and the vitals card.

**11. An arterial-line trace (optional, later).** With the waveform right, the beat-trace card can draw `AO` as an arterial line, which
shows the narrowing pulse pressure in a bleed better than any number. Only if he wants it.

### Tests (`tests/`, node only)

**12.** New `tests/arterial-pressure.test.js`:
- healthy about 120/80 (±8), decompensated about 105 to 115 / 60 to 70, each stage's MAP unchanged (the existing
  `map-hyperdynamic.test.js` bands stay green untouched);
- pulse pressure narrows and systolic crosses 90 within ±4 mmHg of MAP crossing 65 in a variceal bleed;
- carvedilol lowers diastolic more than systolic, terlipressin raises diastolic;
- breath-to-breath systolic swing under 10 mmHg in the healthy patient;
- `pulseOf()` within 3 mmHg of the beat-tracked values in four presets;
- `(S + 2D)/3` within 3 mmHg of MAP;
- blood volume conserved with `Vv` and `LUNG` counted.
Guard tests for what the waveform change touches: hepatic artery resistive index stays 0.55 to 0.75, portal vein pulsatility per preset
(healthy, decompensated, right heart failure + TR, Budd-Chiari) within today's bands. New wiring shapes go in `scripts/source-shapes/`,
not tests that read `src` (rule PR-02).

### Decks and author guides

**13. Slides that cite systolic 90 or MAP 65.** Every one goes through the humanizer before push.

| Deck | Slide | Now | Change |
|---|---|---|---|
| carvedilol | MAP hold rail (`hold: true`, line 83 to 86) | rail at 65 only; notes say no systolic | rail shows both lines; notes drop the disclaimer; words can say `{bp}` |
| kidney | holdcarv path (line 92 to 99) | typed `sbp: 105`, `map: 79` | read `sbp` and `map` from the model, as the path card already does for lsm and plt; `holdcarv.js` takes the model's reading when the slide types none |
| kidney | criteria card (line 104) | MAP row live, systolic row typed | make the systolic row live (`['**Systolic**', 'sbp', '<', 90]`) |
| ascites | holdcarv, `sbp: 84` with HRS-AKI (line 171 to 174) | typed | keep typed: the model's patient is not hypotensive here, and the story needs 84. Say so in a comment |
| treatment | propranolol and carvedilol (lines 35 to 41, 114) | "keep systolic >90" in words | add `{sbp}` beside `{map}` where the line gives the pressure |
| ten-years | ascites + carvedilol (lines 83 to 85) | words only | same |
| variceal-bleed, hyperdynamic, tipping, albumin, landmark-trials, gastric-varices | lines with `{map}` as "the blood pressure" | MAP named as blood pressure | where the words say "blood pressure", use `{bp}`; where they say "mean arterial pressure", keep `{map}`. The bleed slides gain the narrowing pulse pressure as a teaching point |
| circuit | slide notes line 52 | "MAP about 90" | fine as is |
| demo-all-new-visuals | line 2124 to 2125 | disclaimer | update |

**14. Author guides.** `docs/deck-authoring-guide.md` and the quick guide: the vitals tool row (line 468: new `bp`, both rail lines,
remove "no systolic and diastolic"), the token list (line 359), the tile table (line 800: `sbp` <90 "Low"), table COLS (line 512),
rule 19 (BP moves at once with a drug, like MAP), and the `response` note (line 532). Add a short "what the model's blood pressure is"
note: one lumped arterial tree, read as an arm cuff would, MAP is the true mean. `docs/ai-humanizer.md` cut-off list if it names MAP 65.
Beta guides (PDFs) change only if the bottom bar changes (rec 10 says it does not).

## Risks

1. **The arterial pulse reaches everything downstream.** Ejecting in systole makes the hepatic artery peakier: its resistive index went
   0.63 to 0.81 (healthy) and 0.69 to 0.85 (decompensated) in the prototype, above the normal 0.55 to 0.7. Portal vein pulsatility in
   decompensated cirrhosis doubled (0.08 to 0.16). Both are Doppler instruments learners read. Fix by putting some compliance in the
   arterial branches (the hepatic artery node is 0.05 mL/mmHg) and checking with the guard tests before the change lands. Highest risk.
2. **Deck numbers move a little.** MAP itself does not move (steady means do not depend on compliance), but heart rate, output and the
   reflexes see a different beat, so `{map}`, `{hr}` and `{co}` on beat-on slides can shift 0 to 2. The deck number tests catch it.
3. **Two sources for S and D** (beat-tracked and closed-form). If they disagree, a slide's BP jumps when its beat starts. The agreement
   test (rec 12) is the guard; the closed form must use the same Zc, C and systolic time as the engine.
4. **Calibration sources.** The healthy 120/80 target is textbook; the cirrhosis compliance rise and the decompensated 105 to 115 / 60 to 70
   band are from the literature, not from the three guideline PDFs in `guidelines/`. Check and add the source before setting numbers.
5. **Respiratory coupling.** Without the lung buffer (rec 2) the systolic swings 20 to 30 mmHg per breath, which looks like pulsus
   paradoxus in every patient. Recs 1 and 2 should land together.
6. **Snapshots.** `Vv` and `LUNG` volume belong to a saved moment (`snapshot`/`restore`, the EXT-ENG-1 list), or a restored state's first
   beat ejects nothing.
7. **Scope creep.** A full left heart (afterload-dependent ejection, mitral valve, pulmonary pressures) is a bigger model and would
   re-open every calibrated preset. Not recommended now.

## Order of work

1. Engine recs 1 to 5 together, with the guard tests (12) and the hepatic artery fix (risk 1). One thread owns `engine.js`.
2. Worker rec 7 and the vitals monitor rec 8 (the Systolic 90 card's half of the rail).
3. Tiles, tokens and tables (10), then decks (13) and guides (14), humanizer on every learner-facing line.
4. Arterial-line trace (11) only if he asks.
