# The TIPS and DIPS stent model: what is calibrated, and how much it matters

This note is for reviewers. The code is `src/engine/stent-geom.js` (the stent's parts), `engine.js stentState` (one moment's descriptor) and
`stent-geom.js benchFlow` (the bench line). The numbers below come from the model in `cirr-decomp` with a uniform stent, settled. They are
model outputs, not predictions for a patient.

## The pressure across the stent

The drop is `ΔP = R_lin·Q + B·Q|Q|`. The engine solves it inside the coupled network, so the patient's pressures answer it. It has five parts.

| Part | Form | Status |
|---|---|---|
| tract | fixed, 0.18 PRU (TIPS), 0.07 PRU (DIPS), × viscosity | effective, calibrated (below) |
| wall | `C_WALL · visc · ∫ (10 / D(x))⁴ dx`, `C_WALL` = 0.005 PRU per cm at 10 mm | effective, about 4.67 × ideal Poiseuille at 3.5 cP |
| entry | ½ρ · 1.5 · (Q/A)², the device's two ends | textbook entrance plus exit coefficient |
| jet | Borda–Carnot at each narrowing's exit, × k_exp(cone angle) | k_exp provisional (diffuser data, not fitted) |
| inlet | K_C at a narrowing's inlet | K_C = 0 (provisional, decision D1) |

### The tract term

**What it stands for.** The stretches between the stent and the network's nodes that the stent does not line: the parenchymal tract, the native portal vein end, and the short stretch of the right hepatic vein from the stent's outlet to the cava.

**Why it does not follow the stent.** These stretches do not change with the stent's diameter or length.

**What changed on 17 Nov 2026.** The TIPS used to join the right hepatic vein's node, so its 1.8 L/min ran through the whole hepatic vein's resistance. That resistance belongs to the right lobe's own outflow, so it raised the RHV above the right lobe's central veins. The right lobe's outflow then turned back through the middle hepatic vein, which is a model artefact, not a TIPS picture.

**How it is joined now.** The engine joins the TIPS to the cava itself (topology.js TIPS `eto: 'IVCS'`), and the short outlet stretch is part of this term. The figure still draws the TIPS joining the vein near the cava (RHV_T). The term went from 0.12 to 0.18 PRU, chosen so that the post-TIPS gradients the decks were tuned to stay where they were:

| | PPG before (0.12, via the RHV) | PPG now (0.18, to the cava) |
|---|---:|---:|
| 10 mm, decompensated | 7.9 | 7.9 |
| 8 mm, decompensated | 9.4 | 9.2 |
| 10 mm, compensated | 5.4 | 5.3 |
| 10 mm, schistosomiasis | 6.0 | 6.0 |

**No double counting.** None of these stretches is another edge of the shunt's path. The hepatic vein's own resistance now carries only the liver's outflow.

**Where it came from.** It was introduced on 7 Oct 2026 (commit 7303d7d4) as a tract and hepatic vein outlet resistance. It was set so the model's post-TIPS gradients and flows grade with diameter as the teaching decks show them. It was not fitted to measured per-patient data.

**How much it weighs.** It is influential: at 10 mm it is about 72 % of the shunt's own drop. The shunt's own drop now runs from the right portal vein to the cava, so it includes the outlet stretch. Many apparent effects of diameter and length are damped by this term, which is why wide stents plateau.

| Open diameter | PPG | flow L/min | drop across the shunt | tract share | wall share | ends share |
|---|---:|---:|---:|---:|---:|---:|
| 6 mm | 11.9 | 1.11 | 11.5 | 29 % | 49 % | 22 % |
| 8 mm | 9.2 | 1.56 | 8.7 | 53 % | 29 % | 18 % |
| 10 mm | 7.9 | 1.78 | 7.2 | 72 % | 16 % | 12 % |
| 12 mm | 7.3 | 1.88 | 6.6 | 84 % | 9 % | 7 % |

### Sensitivity (PPG, mmHg, decompensated)

| Change | 6 mm | 8 mm | 10 mm | 12 mm |
|---|---:|---:|---:|---:|
| as calibrated | 11.9 | 9.2 | 7.9 | 7.3 |
| tract × 0.5 | 11.4 | 8.1 | 6.3 | 5.4 |
| tract × 1.5 | 12.3 | 10.2 | 9.2 | 8.7 |
| wall × 0.5 | 10.9 | 8.6 | 7.6 | 7.1 |
| wall × 1.5 | 12.6 | 9.8 | 8.2 | 7.5 |

The 8-to-10 mm difference holds at 1.0 to 1.8 mmHg across these changes. The absolute PPG at 10 to 12 mm moves most with the tract term.

## The bench line ("Tube alone")

`benchFlow` is the **whole shunt branch** under a fixed 7 mmHg from its portal end to its hepatic end: every part above, the tract included.
These are the same resistances as the patient's shunt, so the gap between the two lines is the circulation's answer alone. It is not an isolated lumen.
The curve's note and the reading's long text say so.

## The pressure split and its residual

`stentState` gives the parts as pressures (mmHg, signed with the flow: a reversed stent's parts and drop are negative) and `resid`, the drop less
the parts' sum. They come from the smoothed pressures and the smoothed flow, which are not quite one instant. So while the patient moves, the residual is
small but not zero, and once the patient settles it is zero. `tests/stent-descriptor.test.js` bounds it at 2 % of the drop (or 0.05 mmHg), both settled
and while the heart beats. A display may scale the parts to the printed drop only within that bound. `dir` gives the direction (1 portal to systemic,
−1 reversed, 0 stopped).

## A stopped stent

Under 0.05 mL/s the stent stops, and it flows again only above 0.08 mL/s (`flow-cuts.js stentStillHeld`, with its memory in the record). A stopped
stent has no flow, velocity or loss parts, and its drop stays, because the blockage holds it. Every view reads that one state.
