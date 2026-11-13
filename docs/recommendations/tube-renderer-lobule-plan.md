# The lobule on the Tube renderer: build plan (10 Nov 2026)

**Status (11 Nov 2026).** Built; `docs/tube-renderer.md` ("The lobule on the Tube", "Stage 2") is the as-built reference and this file is the 10 Nov plan, kept as history.
- Built (checked in `src/ui/tube-pass.js` `LV`, `tube-geo.js`, `veins-gl.js` `startLobuleTube`, `tests/tube-lobule*.test.js`, `scripts/lobule-joins.mjs`): the `z` rule (`zK` 1, `hK` 0.008, `hRef` 22), the patch's fragment depth, the lobule's own Tube programs, the redraw of the pulse's cells through `meshCellsPass`. Stage 2 later gave the lobule webs in place of its patch groups (the "next build" this plan names).
- Superseded: "only when Tube is the choice", "Mesh chosen leaves the lobule classic" and "With Tube chosen" in the acceptance list. The lobule makes its Tube programs at its creation, there is no choice, and the classic pass draws it only while those programs are not finished or on software GL. The "Honest expectation on speed" section is the 10 Nov estimate for patches; webs and the lumen pass changed it (not re-timed on a device; not verified).
- Open: the device acceptance list below (Mohammad's Mac and iPhone) is the owner's; nothing in the code records it as passed (not verified).



Plan only. Read at `d78a694` on `claude/settings-topbar-icon-flvft1`. Mohammad's brief (10 Nov): "plan the lobule so it's perfect,
let's build it with the tube renderer". Briefs: `/mnt/project-files/tube-renderer/briefs/L-*.md`. Each thread builds its brief exactly
as written and asks before deviating. This plan extends `tube-renderer-plan.md`; where the two differ on the points below, this one wins.

## What the lobule is, measured

I booted the real lobule layer in node (the recipe is kept at `/mnt/project-files/tube-renderer/lobule-capture.mjs`) and ran the
Mesh's own join grouping (`patchGroups`) on its binning:

| | Blood only | With the lymph layer |
|---|---:|---:|
| Vessel rows | 156 | about 285 (`MAXT` 320) |
| Joins | 190 | 250 |
| Join patches after grouping (at most 8 vessels, 6 joins each) | 127 | 168 |
| Pairs of patches whose boxes overlap | 118 | 205 |
| ... of which share a vessel (wanted to merge, the caps said no) | 74 | 86 |
| Share of all vessel length that lies inside a join's reach | 74.6% | 75.7% |
| Sharpest joint | 10.9° | 45.1° |

And from `lobule-zoom.js`: **every row is on one tier** (tier 1), and what is in front of what is the row's `z`, set by the kind of
vessel (`Z_OF`: sinusoids 0.09 to 0.12, lymph 0.13, twig 0.2, inlet 0.3, portal venule and central vein 0.4, bile duct 0.55, artery 0.7,
with gaps as small as 0.01). The lobule has its own renderer instance (`who: 'lobule'`, sharing the figure's GPU context), its kept
picture (`lobule-keep.js`), and a pulse that recolours some vessels every beat.

## Why the anatomy's Tube rules are not enough here

Two rules of stage 1 are right for the anatomy and wrong for the lobule:

1. **"Within a tier the taller surface wins; `z` is not used."** The anatomy has 20 tiers to say what is in front. The lobule has one,
   so its whole front-to-back order is `z`. Without it an artery would merge into the sinusoids it crosses.
2. **"A join patch sits at one fixed level above its tier's lumens."** Fine while patches rarely overlap. In the lobule three quarters
   of the picture is inside patches and 118 to 205 pairs of them overlap. At one level the first one drawn would win each shared pixel,
   whichever it is, and it only knows its own vessels.

Both are fixed by giving depth the meaning the classic shader gives a pixel: **a lumen by its `z`, then the taller; an outline under
every lumen, the nearest wall winning.**

## The rules (these replace the plan's level table for patches and add `z`)

Levels `f` in a band, higher is nearer, as before. Two new strip uniforms `zK`, `hK`:

| What | f |
|---|---|
| Strip lumen | `LUMEN0 + LUMEN_H * clamp(zK * z + hK * clamp(h / hRef, 0, 1), 0, 1)` |
| Strip casing, glow | unchanged |
| Patch pixel inside a lumen | `LUMEN0 + LUMEN_H * clamp(zK * zmx + hK, 0, 1) + 0.02` (`zmx`: the highest `z` of the patch's vessels of this tier, as the kept key block already finds it) |
| Patch pixel on an outline | `CASE1 + 0.05 * (1 - clamp(Dk / 255, 0, 1))` (`Dk`: the distance to the wall, as the key block finds it), so the nearest wall wins and every lumen is above it |

- Anatomy: `zK = 0`, `hK = 1`. Strips are exactly as today. A patch lumen sits at 0.82 (above every strip lumen, as 0.95 did); a patch
  outline now sits **under** every lumen, where today it sits above them. That is a change for the anatomy too, and I expect it to
  remove part of the outline faults in Mohammad's joint screenshots; thread D decides with its joints job in hand.
- Lobule: `zK = 1`, `hK = 0.008` (under the smallest gap between two kinds' `z`, 0.01), `hRef` = the lobule's largest radius.
- **The patch's fragment shader writes this as `gl_FragDepth`** (`keyBase + (1 - f) * keyH`). This amends "no Tube shader writes
  `gl_FragDepth`": strips still never do (their depth is the geometry's), patches do, because a patch is one quad over many vessels and
  only the fragment knows which one it is on. The patch already runs its whole shader in the prepass, so this costs nothing new.

## What the lobule needs besides depth

| Lobule feature | Tube |
|---|---|
| Its own renderer instance | builds the Tube programs too (`who === 'lobule'`), only when Tube is the choice; Mesh chosen leaves the lobule classic, as today |
| 320 rows | `tubeIndex(320)`; the depth and stencil buffer on the lobule's layer target |
| Kinds with their own edge colour (portal venule, inlet, artery, bile duct) | `F_EDGE`, kept by `celShade` |
| Central vein and portal venule drawn flat | no `F_DIFFUSE`, so no tone and no light line, as `celShade` has it |
| Twig alpha, unselected rows at 0.55, the greyed origin | row alpha and colours, shared text |
| Lymph layer on and off, the lymph's dashes | rows like any other; the dashes are the composite's (`lymphAt`), untouched |
| The pulse: some rows recoloured each beat | Classic uses its colour-only pass, which is off for a geometry renderer; Tube redraws those rows' cells (`meshCellsPass`). **This is the cost to watch.** |
| The kept picture, blood repainted in boxes | reads the layer and the flow targets as today; the blood style follows the renderer (style P when Tube draws) |
| The wide copy on dive and rise, the second lobule instance | the same instance code; check it is covered |
| Software GL | classic, as everywhere |

## Honest expectation on speed

In the lobule three quarters of the vessel picture is join patches, and a patch runs the full classic arithmetic for up to eight
vessels, twice (prepass and colour). So this build makes the lobule **look** like Tube and be **correct**, and it will not be faster
than Classic for a whole vessel draw; it may be slower, most of all on the pulse. The vessel layer is kept between draws, so a steady
lobule frame (blood only) costs what it costs today.

The way to make the lobule fast is to stop using patches there: fillets as geometry (a small arc mesh in the corner of each join,
placed in the vertex shader) with the short strip shader. That is stage 2 of the main plan and it is the right next build for the
lobule if this one is too slow. I did not put it in this plan because it is new shader code for 190 to 250 joins that nothing here
can compile, and the brief was "perfect".

## Workstreams

| | Thread | Files | Depends on |
|---|---|---|---|
| L-A | A (geometry) | `src/ui/tube-geo.js`, its test | nothing |
| L-E | new Sonnet thread, "lobule harness" | new `tests/tube-lobule.test.js`, new `scripts/lobule-joins.mjs` | nothing |
| L-D | D (integrator), after its joints job | `tube-pass.js`, the Tube builds, `veins-gl.js`, `docs/tube-renderer.md` | L-A, L-E |

## Acceptance (what "perfect" means here)

With Tube chosen, in the lobule, on Mohammad's Mac and iPhone, light and dark looks:

1. Every vessel kind is drawn, in the order Classic shows (artery and bile duct over the venules, twig under the inlet, sinusoids under all).
2. Every join is smooth, with no ring, disc, dash or notch, including the crowded central vein and the triad.
3. No vessel shows through another, and nothing is drawn twice where vessels are see-through (the twig, unselected rows).
4. Lymph on and off, selection, the greyed origin, the pulse, the dive and the rise all behave as in Classic.
5. The blood is style P and moves through joins without a visible seam.
6. `?perf` shows `vessels: tube` for the lobule.

## Stop points

- L-D stops and reports if the pulse's redraw cannot be made to work through `meshCellsPass` as it is, or if any row count or patch
  count exceeds what the buffers and caps hold. It does not invent a new pass.
- If Mohammad finds the lobule slower with Tube than with Classic, the next step is the geometric fillets, on his word.
