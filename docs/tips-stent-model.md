# The TIPS and DIPS stent model: what is calibrated, and how much it matters

This note is for reviewers. The code is `src/engine/stent-geom.js` (the stent's parts), `engine.js stentState` (one moment's descriptor) and
`stent-geom.js benchFlow` (the bench line). The numbers below come from the model in `cirr-decomp` with a uniform stent, settled. They are
model outputs, not predictions for a patient.

## The pressure across the stent

The drop is `ΔP = R_lin·Q + B·Q|Q|`. The engine solves it inside the coupled network, so the patient's pressures answer it. It has five parts.

| Part | Form | Status |
|---|---|---|
| tract | fixed, 0.12 PRU (TIPS), 0.07 PRU (DIPS), × viscosity | effective, calibrated (below) |
| wall | `C_WALL · visc · ∫ (10 / D(x))⁴ dx`, `C_WALL` = 0.005 PRU per cm at 10 mm | effective, about 4.67 × ideal Poiseuille at 3.5 cP |
| entry | ½ρ · 1.5 · (Q/A)², the device's two ends | textbook entrance plus exit coefficient |
| jet | Borda–Carnot at each narrowing's exit, × k_exp(cone angle) | k_exp provisional (diffuser data, not fitted) |
| inlet | K_C at a narrowing's inlet | K_C = 0 (provisional, decision D1) |

### The tract term

- **What it stands for:** the short stretches the stent does not line. These are the parenchymal tract and the native portal and hepatic vein ends, between the stent and the network's two nodes (the right portal vein and the right hepatic vein).
- **Why it does not follow the stent:** these stretches do not change with the stent's diameter or length.
- **No double counting:** none of these stretches is another edge of the network. The portal trunk and the hepatic veins keep their own resistances, which are in series outside it.
- **Where it came from:** it was introduced on 7 Oct 2026 (commit 7303d7d4). It was set so that the model's post-TIPS gradients and flows grade with diameter as the teaching decks show them: a 10 mm stent gives about 8 mmHg PPG in decompensated cirrhosis, and an 8 mm one about 9.
- **What it was not fitted to:** no measured per-patient data.

This term is influential. At 10 mm it is about 63 % of the stent's own drop. Many apparent effects of diameter and length are therefore damped by it, which is why wide stents plateau.

| Open diameter | PPG | flow L/min | drop across stent | tract share | wall share | ends share |
|---|---:|---:|---:|---:|---:|---:|
| 6 mm | 12.0 | 1.11 | 10.4 | 21 % | 54 % | 25 % |
| 8 mm | 9.4 | 1.58 | 7.2 | 43 % | 35 % | 23 % |
| 10 mm | 7.9 | 1.81 | 5.6 | 63 % | 21 % | 16 % |
| 12 mm | 7.3 | 1.91 | 4.8 | 78 % | 13 % | 10 % |

### Sensitivity (PPG, mmHg)

| Change | 6 mm | 8 mm | 10 mm | 12 mm |
|---|---:|---:|---:|---:|
| as calibrated | 12.0 | 9.4 | 7.9 | 7.3 |
| tract × 0.5 | 11.6 | 8.5 | 6.8 | 5.9 |
| tract × 1.5 | 12.3 | 10.0 | 8.9 | 8.4 |
| wall × 0.5 | 11.0 | 8.7 | 7.5 | 7.0 |
| wall × 1.5 | 12.7 | 9.8 | 8.3 | 7.4 |

The 8-to-10 mm difference holds at 1.1 to 1.7 mmHg across all four changes. The absolute PPG at 10 to 12 mm moves most with the tract term.

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
