# Vector renderer workload (workstream L, revision 1)

What the retained vector renderer does per frame, measured on the real anatomy and the real lobule, with the old fixed-cell structure beside the new
adaptive leaves. Mohammad's ask (9 Nov): measure projected region pixels, segment tests, surviving members, active joins and time per component; no
cell percentages; the dense central-vein junction is a named benchmark. Plan: `docs/recommendations/vector-renderer-plan-r1.md` section 4.

**Status of this measurement.** It was taken on the leaf builder as merged on 9 Nov before plan revision 1.1 (section 2.2.1: a join listed only
where two members' grown bounds meet). That revision is a specification so far (`G_JOIN` is in no source file yet). The `L_JOIN` and `L_WIDE`
numbers below are therefore the "whole disc" ones that revision 1.1 exists to shrink. Everything is one command to repeat once K's builder changes
(`node scripts/vec-workload.mjs`, section 6); the policy picks should be confirmed by that rerun.

## 1. Headline: new against old

Cost is the plan's model, the same weights for both structures: `1` per bound test + `6` per segment test + `24` per join that covers the pixel.
Every 4th pixel of the picture is replayed in node (the real anatomy at the preset `cirr-decomp`, the real lobule, the real compilers), then scaled.
"px" is the pixels the structure shades: the squares of the region quads or leaf quads, and for strips only the lumen-and-2px band (what the BLOOD
pass draws). Pictures: `mac` 1440x900 at 2x (2880x1800), `iphone` 390x844 at 3x. Policy: `BOUND_HEADROOM 1`, `LEAF_MIN_PX 8`, `LEAF_OVERHEAD 64`,
`REFINE_GAIN 0.05` (section 3).

| benchmark | picture | old px | old cost | old segment tests | new px | new cost | new segment tests | new / old cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| anat-fit | mac | 1.48M | 721.28M | 117.23M | 889k | 86.20M | 6.68M | 12% |
| anat-fit | iphone | 821k | 388.62M | 63.10M | 485k | 46.94M | 3.60M | 12% |
| anat-deep | mac | 5.18M | 2106.08M | 343.21M | 4.20M | 332.82M | 27.48M | 16% |
| anat-deep | iphone | 2.83M | 1353.90M | 220.96M | 2.39M | 196.98M | 16.21M | 15% |
| pinch | mac | 3.55M | 1386.94M | 225.70M | 2.54M | 200.40M | 16.74M | 14% |
| pinch | iphone | 2.00M | 955.29M | 155.50M | 1.47M | 125.81M | 9.95M | 13% |
| blood-only | mac | 992k | 694.79M | 112.82M | 705k | 82.42M | 6.16M | 12% |
| blood-only | iphone | 544k | 373.44M | 60.57M | 387k | 45.05M | 3.34M | 12% |
| cv-junction | mac | 5.18M | 7283.64M | 1204.06M | 4.37M | 329.67M | 33.47M | 5% |
| cv-junction | iphone | 2.96M | 11921.22M | 1967.17M | 2.91M | 455.08M | 41.52M | 4% |
| lobule-tissue | mac | 5.18M | 7386.40M | 1222.72M | 4.61M | 248.14M | 22.22M | 3% |
| lobule-tissue | iphone | 2.96M | 10466.96M | 1737.05M | 2.96M | 216.71M | 18.50M | 2% |

**The new structure does less work than the old one in every benchmark (2% to 18% of the old cost). Stop point 4 is not reached.**
The old column is the frozen ef44ef0 compiler (`scripts/vec-old/`), so it stays re-measurable after the switch-over removes the old names.

What the numbers say:

- **Ordinary lobule tissue and the central-vein junction are where the old structure was worst** (each pixel ran about 230 segment tests, over 1,200
  million per frame); the leaves bring that to 5 to 8 per pixel. The junction is 4% to 5% of the old cost, tissue 2% to 3%.
- **The anatomy gains less (12% to 18%)**: its old cost was already low (about 80 segment tests per pixel), and the leaf quads cover nearly as many
  pixels as the old regions (889k against 1.48M at fit on the Mac, 4.20M against 5.18M at 9x).
- **Surviving members are few.** Candidates per pixel average 0.6 to 0.8 under the leaves (0.1 to 3.1 across classes; 8 at the most); the old
  structure's regions carried 1.4 to 2.6 per pixel but tested every one of up to 48 members.
- **Active joins are few per pixel**: 0.1 on the junction and the tissue, 0.3 on the anatomy; the maximum is 28 in one anatomy pixel.

## 2. Per class, the junction and ordinary tissue

Mac, every 4th pixel, headline policy. Columns are means / 95th percentile / maximum per pixel.

### The central-vein junction

old, cv-junction, mac (2880x1800, every 4th pixel)

| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |
|---|---:|---:|---:|---:|---:|---:|
| region:join | 4.22M | 0.0 / 0 / 0 | 247.3 / 431 / 683 | 2.8 / 6 / 25 | 0.5 / 5 | 277.0 |
| region:cross | 964k | 0.0 / 0 / 0 | 166.5 / 249 / 250 | 1.5 / 2 / 4 | 0.0 / 0 | 166.5 |
| **all drawn** | 5.18M | 0.0 / 0 / 0 | 232.3 / 426 / 683 | 2.6 / 6 / 25 | 0.4 / 5 | 256.5 |
instances: 0 strip rows, 260 quads in view 

new, cv-junction, mac (2880x1800, every 4th pixel)

| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |
|---|---:|---:|---:|---:|---:|---:|
| L_JOIN | 3.67M | 9.5 / 23 / 33 | 7.9 / 28 / 90 | 0.7 / 3 / 6 | 0.1 / 2 | 23.1 |
| L_CROSS | 463k | 8.3 / 11 / 11 | 7.2 / 16 / 24 | 0.8 / 2 / 2 | 0.0 / 0 | 15.5 |
| L_SINGLE | 232k | 3.3 / 5 / 5 | 2.9 / 12 / 12 | 0.3 / 1 / 1 | 0.0 / 0 | 6.2 |
| L_WIDE | 7744 | 16.6 / 20 / 21 | 64.4 / 75 / 79 | 1.4 / 4 / 5 | 0.2 / 2 | 123.9 |
| L_LAYERED | 5776 | 4.0 / 4 / 4 | 0.6 / 8 / 8 | 0.1 / 1 / 1 | 0.0 / 0 | 4.6 |
| **all drawn** | 4.37M | 9.1 / 23 / 33 | 7.7 / 24 / 90 | 0.7 / 3 / 6 | 0.1 / 2 | 21.6 |

### Ordinary lobule tissue

old, lobule-tissue, mac (2880x1800, every 4th pixel)

| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |
|---|---:|---:|---:|---:|---:|---:|
| region:join | 4.74M | 0.0 / 0 / 0 | 242.3 / 361 / 407 | 2.6 / 6 / 6 | 0.4 / 2 | 264.6 |
| region:cross | 446k | 0.0 / 0 / 0 | 168.1 / 242 / 242 | 1.4 / 2 / 3 | 0.0 / 0 | 168.1 |
| **all drawn** | 5.18M | 0.0 / 0 / 0 | 235.9 / 359 / 407 | 2.5 / 6 / 6 | 0.4 / 2 | 256.2 |
instances: 0 strip rows, 104 quads in view 

new, lobule-tissue, mac (2880x1800, every 4th pixel)

| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |
|---|---:|---:|---:|---:|---:|---:|
| L_JOIN | 4.35M | 8.2 / 21 / 23 | 4.8 / 19 / 40 | 0.6 / 2 / 6 | 0.1 / 1 | 17.4 |
| L_CROSS | 176k | 8.2 / 11 / 11 | 6.0 / 16 / 24 | 0.7 / 2 / 2 | 0.0 / 0 | 14.2 |
| L_SINGLE | 92k | 3.1 / 5 / 5 | 3.3 / 12 / 12 | 0.4 / 1 / 1 | 0.0 / 0 | 6.5 |
| **all drawn** | 4.61M | 8.1 / 20 / 23 | 4.8 / 18 / 40 | 0.6 / 2 / 6 | 0.1 / 1 | 17.1 |

### The anatomy at fit

old, anat-fit, mac (2880x1800, every 4th pixel)

| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |
|---|---:|---:|---:|---:|---:|---:|
| region:join | 589k | 0.0 / 0 / 0 | 146.1 / 379 / 694 | 1.7 / 6 / 9 | 1.1 / 16 | 209.5 |
| strip | 552k | 0.0 / 0 / 0 | 9.3 / 17 / 17 | 1.0 / 1 / 1 | 0.0 / 0 | 9.3 |
| region:cross | 277k | 0.0 / 0 / 0 | 82.9 / 219 / 395 | 1.8 / 6 / 7 | 0.0 / 0 | 82.9 |
| region:near | 64k | 0.0 / 0 / 0 | 47.6 / 90 / 116 | 0.5 / 1 / 2 | 0.0 / 0 | 47.6 |
| **all drawn** | 1.48M | 0.0 / 0 / 0 | 79.1 / 255 / 694 | 1.4 / 6 / 9 | 0.4 / 16 | 104.3 |

new, anat-fit, mac (2880x1800, every 4th pixel)

| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |
|---|---:|---:|---:|---:|---:|---:|
| L_JOIN | 534k | 10.7 / 39 / 83 | 7.5 / 31 / 107 | 0.7 / 3 / 8 | 0.4 / 28 | 35.3 |
| L_SINGLE | 278k | 3.9 / 9 / 20 | 4.7 / 12 / 40 | 0.6 / 1 / 1 | 0.0 / 0 | 8.6 |
| L_CROSS | 52k | 19.1 / 35 / 41 | 21.4 / 48 / 64 | 3.1 / 6 / 7 | 0.0 / 0 | 40.5 |
| L_LAYERED | 24k | 9.5 / 18 / 22 | 10.4 / 27 / 64 | 1.3 / 4 / 7 | 0.0 / 0 | 19.9 |
| L_WIDE | 96 | 17.0 / 23 / 23 | 42.0 / 60 / 60 | 2.3 / 3 / 3 | 1.2 / 3 | 131.5 |
| **all drawn** | 889k | 9.0 / 31 / 83 | 7.5 / 28 / 107 | 0.8 / 3 / 8 | 0.3 / 28 | 26.8 |

The full per-class tables for every benchmark and both pictures are in `/mnt/project-files/vector-renderer/workload/report.txt`.

## 3. The policy sweep

One parameter at a time around the default (`BOUND_HEADROOM 1.1`, `LEAF_MIN_PX 8`, `LEAF_OVERHEAD 64`, `REFINE_GAIN 0.2`), the twelve benchmark and picture pairs. The objective is the replayed cost plus the leaf quads in view times a fixed quad cost (64, a stand-in
for the per-quad vertex and setup cost until device timers calibrate it). It is shown as a share of the default's.

**headroom** (base 1.1)

| headroom | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 1 | 88.5% | 92.4% | 42% | 12 |
| 1.05 | 94.0% | 95.4% | 63% | 12 |
| 1.1 | 100.0% | 100.0% | 100% | 12 |
| 1.2 | 112.5% | 113.7% | 241% | 12 |
| 1.35 | 132.9% | 136.4% | 588% | 12 |

**leafMinPx** (base 8)

| leafMinPx | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 2 | 100.0% | 100.0% | 100% | 12 |
| 4 | 100.0% | 100.0% | 100% | 12 |
| 8 | 100.0% | 100.0% | 100% | 12 |
| 16 | 100.0% | 100.0% | 100% | 12 |
| 32 | 100.5% | 101.3% | 98% | 12 |

**leafOverhead** (base 64)

| leafOverhead | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 16 | 100.0% | 100.0% | 100% | 12 |
| 64 | 100.0% | 100.0% | 100% | 12 |
| 256 | 100.0% | 100.1% | 100% | 12 |
| 1024 | 100.2% | 101.3% | 99% | 12 |

**refineGain** (base 0.2)

| refineGain | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 0.05 | 98.7% | 99.6% | 118% | 12 |
| 0.2 | 100.0% | 100.0% | 100% | 12 |
| 0.4 | 100.4% | 101.3% | 98% | 12 |

How to read it:

- **`BOUND_HEADROOM` is the one that matters.** Bounds and join discs grow by the headroom so a vessel can widen a little without a rebuild. Every step
  of headroom costs shading work and makes leaves wider and more numerous: 1.0 makes 42% of the default's leaves and 88.5% of its objective; 1.35
  would make nearly 6x the leaves. The price of 1.0 is that any radius change rebuilds the rows it touches. Counted across the deck's four preset
  changes (200 row steps, radius-past rows only):

| headroom | row steps | rows rebuilt |
|---:|---:|---:|
| 1 | 200 | 17 |
| 1.05 | 200 | 13 |
| 1.1 | 200 | 4 |
| 1.2 | 200 | 3 |
| 1.35 | 200 | 3 |

  At 1.0, 17 rows rebuild over the whole deck, each a single row (not the whole graph); at 1.1, 4. A single-row rebuild is cheap beside the frame
  cost it saves, so **1.0 is the pick**. A decides how the rebuild is triggered; this is the evidence.
- **`LEAF_MIN_PX` and `LEAF_OVERHEAD` barely matter** (100.0% to 100.5% across their ranges). Keep 8 and 64.
- **`REFINE_GAIN` 0.05** gives 98.7% of the default's objective at 118% of its leaves, so it is a small gain for a small memory price. Taken.

### What the chosen combination does, against the default policy

| benchmark | picture | default policy cost | chosen policy cost | chosen / default | default quads | chosen quads |
|---|---|---:|---:|---:|---:|---:|
| anat-fit | mac | 99M | 86M | 87% | 4918 | 2242 |
| anat-fit | iphone | 54M | 47M | 87% | 4925 | 2254 |
| anat-deep | mac | 381M | 333M | 87% | 57 | 78 |
| anat-deep | iphone | 226M | 197M | 87% | 71 | 100 |
| pinch | mac | 229M | 200M | 87% | 4918 | 2242 |
| pinch | iphone | 145M | 126M | 87% | 4925 | 2254 |
| blood-only | mac | 96M | 82M | 86% | 4918 | 2242 |
| blood-only | iphone | 52M | 45M | 86% | 4925 | 2254 |
| cv-junction | mac | 382M | 330M | 86% | 8977 | 2873 |
| cv-junction | iphone | 522M | 455M | 87% | 7962 | 5756 |
| lobule-tissue | mac | 284M | 248M | 87% | 109 | 182 |
| lobule-tissue | iphone | 247M | 217M | 88% | 21 | 27 |

The chosen policy cuts the cost to 86% to 88% of the default's everywhere and roughly halves the leaf quads on the anatomy and the junction (Mac).
It was run as a whole after the sweep rather than inferred from the one-at-a-time rows.

## 4. Findings for the other workstreams

- **`L_WIDE` dominates the leaf count.** At fit on the Mac, the default policy makes 5,387 leaves, of which 2,978 are `L_WIDE` and 1,829 `L_JOIN`;
  only 447 are `L_SINGLE`. On the lobule 24,492 of 29,424 leaves are `L_WIDE`. Their pixels are few (0.2% of the junction's) but each costs about
  120 work units a pixel against 5 to 23 for the other classes. Plan
  revision 1.1 targets exactly this (join discs covering 97% of the lobule); the rerun after it lands will say how far it gets.
- **No leaf is over 32 candidates and no false-proximity subdivision failed** in any benchmark (`overWide` and `falseProximity` are empty for all
  six). Stop points 1 and 2 are not reached. On the junction the old structure's busiest pixel keeps 25 candidates; the leaves' busiest keeps 6.
- **Old compile over its own limits.** The old anatomy compile has 60 regions above `MAX_JOINS` 16, the case that the plan's explicit overflow was
  made for; the new structure has none.
- **For A:** `pastRows` flags rows that are "on" with no run as radius-past. The easing counter above counts only rows whose radius left its headroom,
  to avoid about 25 phantom rebuilds per step.

## 5. Per-component GPU time and the benchmarks in the app

`src/ui/vec-measure.js` times the vector renderer's components with GPU timer queries (`EXT_disjoint_timer_query_webgl2`): strips, regions or leaves
(per class), blood, glass, composite, and the rest. It runs only with `?perf`: without it every hook returns at its first line and allocates nothing.
The "Vector work" section of the `?perf` panel shows the mean and total time per component and the leaves in view by class. Timer queries cannot nest,
so a nested pair ends the outer query and restarts it after the inner one; the panel says that splitting a render pass this way can cost a little.
Results come back asynchronously; a result taken under `GPU_DISJOINT_EXT` is dropped and counted, never shown.

`?vecbench=<name>` (Vector selected in Settings > Display) runs one named benchmark in the app: it loads the preset or the lobule focus, settles 90
frames, plays the camera (the pinch over 2 s), and leaves the report in the panel. The cameras are the same table node replays
(`src/ui/vec-bench.js`: `benchMatrix(name, t, picture)`), so a device measurement and this document speak about the same frames. Nobody has to run it
for this document; it is there for when the numbers need calibrating (the quad cost in the objective, the weights in the cost model).

The six benchmarks: `cv-junction`, `lobule-tissue`, `anat-fit`, `anat-deep` (9x over the portal confluence), `pinch` (fit to 9x in 2 s, replayed at
five instants), `blood-only` (anatomy at rest, blood frames only).

## 6. Repeat it

```
node scripts/vec-workload.mjs                       # all six benchmarks, both pictures, every 4th pixel, K's default policy
node scripts/vec-workload.mjs --policy 1,8,64,0.05  # headroom, leafMinPx, leafOverhead, refineGain
node scripts/vec-workload.mjs --sweep --easing      # the policy sweep and the width-easing count
node scripts/vec-workload.mjs --bench cv-junction --pic mac --stride 2
```

Each scene runs in its own process (`--scene anatomy|lobule`) and the driver merges the JSON. `--json -` prints the JSON; `--out <dir>` writes
`vector-workload.json` and the markdown tables. The replay is `replayPixel` / `replayOld` in `tests/vec-replay.js`, tested against A's bound test and
an independent quadtree walk (`tests/vec-measure.test.js`).

## 7. Caveats

- The cost model is the plan's, with K's weights (1, 6, 24). It counts tests, not time; the GPU timers above are what calibrates it, and no device
  number is in this document.
- The sweep's quad cost (64) is a stand-in. The ranking of `BOUND_HEADROOM` does not depend on it (the shading work moves the same way as the leaves),
  but the exact pick at 1.0 against 1.05 would if quads turned out far dearer.
- Rebuild CPU cost is outside the GPU objective. Section 3 counts rebuilds, not their milliseconds.
- The lobule's radii are the test recipe's derived ones (`tests/vec-lobule.test.js`), the anatomy fit uses k = 1 rather than the stage's own default
  camera, and the pinch uses `smooth01` over a straight log-zoom path to the portal confluence.
- "Blood-only" counts strip pixels within the lumen plus 2 px (the BLOOD pass's band) and whole squares for region and leaf quads. D's per-pixel
  blood work (`bloodPixelWork`) is not added in.
- Measured before plan revision 1.1; see the status note at the top.
