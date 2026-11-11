# Tube renderer: the speed plan and blood that shows trouble (10 Nov 2026)

**Status (11 Nov 2026).** Most of it is built; no gain was measured on a device in this repo (not verified).
- P1 built: `lobule-zoom.js` passes `cheap` (the Tube at stage 3 drew the last picture) to `calmFlowGapFor` / `calmFlowRule` in `frame.js` ("calm every frame (tube 3)").
- P2 built: `createDepthStamp` in `tube-stage2.js` (the lumen layer keeps its depth; `tests/tube-lumen-depth.test.js`).
- P3 built: `src/ui/tube-cull.js` wired in `tube-stage2.js` / `tube-pass.js` (`tests/tube-cull.test.js`, `tube-cull-wiring.test.js`).
- P5 built: `BACK_PX0` / `BACK_PX1` in `blood-particles.js` (a narrow lumen runs no back layer).
- P6 built: `tubeGlow` program, `src/ui/tube-glow-glsl.js` (`tests/tube-glow-wiring.test.js`).
- V7 built: `src/ui/blood-trouble.js`, called from `tube-lumen-glsl.js` (`tests/blood-trouble.test.js`). The TIPS swirl that waited for the join quads is not verified.
- P7 (find why some Anatomy views sit at 33 fps): a report, no code; whether it was written and what it found is not verified.
- P4 (one pass pair for all tiers): not built, on purpose, as the table says.
- Later work that is not in this plan: the lumen layer at a share of the vessel layer's size, no webs in the lumen colour pass, the lumen pass only where the lobule is (`docs/tube-renderer.md`, "brief PL").
- Superseded: the stage 2 and 3 safety rules that name `?tube=` and `?tubejoin=` are history (flags removed 11 Nov 2026).



Mohammad, 10 Nov: "Plan all performance gains so coordinator can parallelize them in sonnet threads. New features apart from number 1
I like 7 so plan it." On his iPhone the lobule and some Anatomy views sit at 33 fps, the rest at 56 to 59. This follows
`docs/recommendations/tube-renderer-stage2-3-plan.md`; its safety rules hold here too (every new program optional, no text another
renderer compiles changes, the compile check and nothing else headless, stop points to the planner thread). Briefs:
`/mnt/project-files/tube-renderer/briefs/` (`P1`, `P3`, `P5`, `P6`, `P7`, `PD`, `V7`).

Nothing here is measured on a device: the gains are estimates from the code. Each item names how `?perf` will show its effect.

## The items

| # | What | Why it should help | Risk | Brief, thread |
|---|---|---|---|---|
| P1 | The lobule's calm blood at the screen's rate when Tube stage 3 draws | Calm lobule blood is capped at 30 Hz since 6 Nov (`calmFlowGapFor`, 28 ms), which reads as 33 fps. The cap was for the old full-screen blood; the tubes' blood pass is far cheaper | Low: one rule; if the lobule cannot hold 60 the frame pacing already steps down | `P1`, new thread |
| P2 | The blood pass keeps its depth between frames | `tubeLumenPass` clears its depth and draws every vessel's depth again on every blood frame, exact rows with their full fragment shader. The depth only changes when the vessel layer is redrawn | Medium: a stale depth would show blood through an outline | `PD` part 2, thread D |
| P3 | Rows outside the layer are not drawn | Zoomed in (the lobule's dive, a zoomed Anatomy) most rows are off the layer and still go through both passes | Low: a pure test in node, a row is only dropped when its whole box is outside | `P3` (the test, new thread), `PD` part 3 (wiring, D) |
| P5 | Thin lumens draw one streak layer | Style P draws two layers and looks into neighbour cells for each; on a lumen a few pixels wide the back layer cannot be seen | Low: a fade by lumen width in pixels | `P5`, thread C |
| P6 | A short shader for glows | A lit vessel's glow pair still runs the stage 1 strip shader (the search over segments) twice | Low: optional program, falls back to today's | `P6` (shader, thread B), `PD` part 4 (wiring, D) |
| P7 | Find why some Anatomy views sit at 33 fps | Not knowable from the shaders alone: a pacing rule, a plate, a card or the labels could be the cap | None: a report, no code | `P7`, new thread |
| P4 | One pass pair for all tiers | Fewer passes whenever the layer is redrawn | **Not now.** Tiers blend over one another today (a see-through vessel shows the tier under it); one depth test for all tiers would hide the lower tier there, which changes the picture. Revisit after P7 says whether whole redraws are what costs |

## Order and files

- At once: `P1`, `P3`, `P5`, `P6`, `P7`, `V7`. They own different files (see each brief).
- Thread D (`PD`): part 1 at once (a one-line getter P1 waits for), part 2 at once, part 3 when `P3` is on the branch, part 4 when `P6` is.
- Thread C: `P5`, then `V7`'s two call lines in `tube-lumen-glsl.js` when `V7`'s module is on the branch.
- The joints thread (J) is replacing the webs with join quads. Nobody here edits `tube-joint.js` or `tube-data.js`, and nothing here may
  depend on what a join record holds: `PD` treats the stage 2 record (`B.s2`, `stage2Prepare`) as opaque, and `P3` drops rows only, never joins.

## Blood that shows trouble (V7)

Two effects in the Tube's blood (style P), both from what the shader already has, no new data from the model:

1. **Reversal shimmer.** Where a vessel's flow runs backwards (the sign the reversed colour already follows), the streaks waver across
   the lumen as they travel: a slow side-to-side wave, a little shorter and denser, so reversed flow reads as wrong even without colour.
2. **A swirl after a narrowing.** Where the lumen narrows sharply along a vessel (its radius against the radius a few widths upstream),
   the streaks tighten into a fast jet through the narrowing and curl into eddies for a few widths downstream, fading out.

Both stand still under reduced motion (the wave frozen, no curl animation), follow the blood's own clock, and fade to nothing on lumens
too thin to show them. A swirl where a TIPS empties into the hepatic vein needs the join, so it waits for J's join quads (phase 2, not
briefed yet).

## How each shows in `?perf`

P1: the lobule's frame rate at rest. P2: the lumen pass's GPU time and "lumen depth redraws" a second (near 0 at rest). P3: strips
drawn against strips in the binning. P5, P6: the lumen pass's and the vessel draw's GPU time. P7: its report.
