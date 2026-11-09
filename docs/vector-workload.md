# Vector renderer workload (workstream L, revision 1.1)

What the retained vector renderer does per frame, measured on the real anatomy and the real lobule, with the old fixed-cell structure beside the new
adaptive leaves. Mohammad's ask (9 Nov): measure projected region pixels, segment tests, surviving members, active joins and time per component; no
cell percentages; the dense central-vein junction is a named benchmark. Plan: `docs/recommendations/vector-renderer-plan-r1.md` section 4.

**Measured on dd8d543f** (K's revision 1.1 junction bound: a join is listed only where two members' grown bounds reach). The first measurement, on
c4a8e47d before that bound, found 24,492 of the lobule's 29,424 leaves were `L_WIDE`; the table in section 4 compares the two. Both are one command to repeat (section 6).

## 1. Headline: new against old

Cost is the plan's model, the same weights for both structures: `1` per bound test + `6` per segment test + `24` per join that covers the pixel.
Every 4th pixel of the picture is replayed in node (the real anatomy at the preset `cirr-decomp`, the real lobule, the real compilers), then scaled.
"px" is the pixels the structure shades: the squares of the region quads or leaf quads, and for strips only the lumen-and-2px band (what the BLOOD
pass draws). Pictures: `mac` 1440x900 at 2x (2880x1800), `iphone` 390x844 at 3x. Policy: `BOUND_HEADROOM 1`, `LEAF_MIN_PX 8`, `LEAF_OVERHEAD 64`,
`REFINE_GAIN 0.05`, `wJoin 24` (section 3).

| benchmark | picture | old px | old cost | old segment tests | new px | new cost | new segment tests | new / old cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| anat-fit | mac | 1.48M | 721.28M | 117.23M | 727k | 72.75M | 6.68M | 10% |
| anat-fit | iphone | 821k | 388.62M | 63.10M | 395k | 39.58M | 3.60M | 10% |
| anat-deep | mac | 5.18M | 2106.08M | 343.21M | 3.32M | 279.89M | 27.48M | 13% |
| anat-deep | iphone | 2.83M | 1353.90M | 220.96M | 1.84M | 165.03M | 16.21M | 12% |
| pinch | mac | 3.55M | 1386.94M | 225.70M | 2.07M | 169.19M | 16.74M | 12% |
| pinch | iphone | 2.00M | 955.29M | 155.50M | 1.17M | 104.90M | 9.95M | 11% |
| blood-only | mac | 992k | 694.79M | 112.82M | 494k | 67.23M | 5.91M | 10% |
| blood-only | iphone | 544k | 373.44M | 60.57M | 272k | 36.83M | 3.23M | 10% |
| cv-junction | mac | 5.18M | 7283.64M | 1204.06M | 3.39M | 297.29M | 33.47M | 4% |
| cv-junction | iphone | 2.96M | 11921.22M | 1967.17M | 2.51M | 407.80M | 41.52M | 3% |
| lobule-tissue | mac | 5.18M | 7386.40M | 1222.72M | 3.34M | 211.87M | 22.22M | 3% |
| lobule-tissue | iphone | 2.96M | 10466.96M | 1737.05M | 2.37M | 192.18M | 18.50M | 2% |

**The new structure does less work than the old one in every benchmark (2% to 13% of the old cost). Stop point 4 is not reached.**
The old column is the frozen ef44ef0 compiler (`scripts/vec-old/`), so it stays re-measurable after the switch-over removes the old names.

- **Ordinary lobule tissue and the central-vein junction were where the old structure was worst** (about 230 segment tests a pixel, over 1,200
  million per frame). The leaves bring that to 7 to 10 a pixel; the junction costs 24.0 work a pixel against 256.5 for the old cells.
- **The anatomy gains less (10% to 13%)**: its old cost was already low (about 80 segment tests a pixel), and the leaf quads cover about half the
  pixels the old regions did (727k against 1.48M at fit on the Mac).
- **Surviving members are few.** Candidates per pixel average 0.8 to 0.9 under the leaves (0.1 to 1.1 across classes; 6 at the most on the lobule);
  the old structure's regions carried 1.4 to 2.6 but tested every one of up to 48 members.
- **Active joins are few per pixel**: 0.1 on the junction and the tissue (2 at most); the old structure's regions have 0.4 on average.

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
| L_JOIN | 1.90M | 13.1 / 34 / 38 | 12.8 / 71 / 90 | 1.1 / 3 / 6 | 0.2 / 2 | 32.9 |
| L_CROSS | 962k | 8.4 / 11 / 14 | 7.8 / 16 / 36 | 0.9 / 2 / 3 | 0.0 / 0 | 16.2 |
| L_SINGLE | 529k | 3.3 / 6 / 7 | 3.2 / 12 / 12 | 0.4 / 1 / 1 | 0.0 / 0 | 6.5 |
| L_LAYERED | 5776 | 4.0 / 4 / 4 | 0.6 / 8 / 8 | 0.1 / 1 / 1 | 0.0 / 0 | 4.6 |
| **all drawn** | 3.39M | 10.2 / 27 / 38 | 9.9 / 32 / 90 | 0.9 / 3 / 6 | 0.1 / 2 | 24.0 |

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
| L_JOIN | 2.30M | 9.1 / 20 / 23 | 6.8 / 20 / 40 | 0.9 / 3 / 6 | 0.1 / 1 | 20.7 |
| L_CROSS | 599k | 7.8 / 11 / 11 | 8.1 / 16 / 36 | 1.0 / 2 / 3 | 0.0 / 0 | 15.8 |
| L_SINGLE | 443k | 3.9 / 7 / 7 | 3.8 / 12 / 16 | 0.4 / 1 / 1 | 0.0 / 0 | 7.7 |
| **all drawn** | 3.34M | 8.2 / 17 / 23 | 6.7 / 20 / 40 | 0.8 / 3 / 6 | 0.1 / 1 | 18.1 |

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
| L_SINGLE | 359k | 4.4 / 11 / 22 | 5.3 / 16 / 43 | 0.6 / 1 / 1 | 0.0 / 0 | 9.7 |
| L_JOIN | 271k | 14.8 / 49 / 83 | 11.7 / 40 / 107 | 1.1 / 3 / 8 | 0.8 / 28 | 47.0 |
| L_CROSS | 67k | 17.0 / 33 / 41 | 19.3 / 48 / 64 | 2.7 / 6 / 7 | 0.0 / 0 | 36.3 |
| L_LAYERED | 30k | 9.2 / 18 / 25 | 9.9 / 24 / 64 | 1.2 / 3 / 7 | 0.0 / 0 | 19.1 |
| **all drawn** | 727k | 9.6 / 31 / 83 | 9.2 / 32 / 107 | 1.0 / 4 / 8 | 0.3 / 28 | 26.5 |

The full per-class tables for every benchmark and both pictures are in `/mnt/project-files/vector-renderer/workload/report.txt`.

## 3. The policy sweep (on dd8d543f)

One parameter at a time around the contract's defaults (`BOUND_HEADROOM 1.1`, `LEAF_MIN_PX 8`, `LEAF_OVERHEAD 64`, `REFINE_GAIN 0.2`, `wJoin 24`),
the twelve benchmark and picture pairs. The objective is the replayed cost plus the leaf quads in view times a fixed quad cost (64, a stand-in for
the per-quad vertex and setup cost until device timers calibrate it), shown as a share of the default's.

**headroom** (base 1.1)

| headroom | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 1 | 92.8% | 94.1% | 100% | 12 |
| 1.05 | 96.4% | 97.3% | 100% | 12 |
| 1.1 | 100.0% | 100.0% | 100% | 12 |
| 1.2 | 107.6% | 110.5% | 103% | 12 |
| 1.35 | 118.8% | 124.7% | 104% | 12 |

**leafMinPx** (base 8)

| leafMinPx | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 1 | 100.0% | 100.0% | 100% | 12 |
| 2 | 100.0% | 100.0% | 100% | 12 |
| 4 | 100.0% | 100.0% | 100% | 12 |
| 8 | 100.0% | 100.0% | 100% | 12 |
| 16 | 100.2% | 100.5% | 97% | 12 |
| 32 | 102.9% | 104.6% | 84% | 12 |

**leafOverhead** (base 64)

| leafOverhead | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 16 | 99.9% | 100.0% | 101% | 12 |
| 64 | 100.0% | 100.0% | 100% | 12 |
| 256 | 100.3% | 101.5% | 96% | 12 |
| 1024 | 100.8% | 102.3% | 91% | 12 |

**refineGain** (base 0.2)

| refineGain | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 0.02 | 91.1% | 95.0% | 375% | 12 |
| 0.05 | 93.5% | 96.3% | 254% | 12 |
| 0.2 | 100.0% | 100.0% | 100% | 12 |
| 0.4 | 102.2% | 103.9% | 87% | 12 |

**wJoin** (base 24)

| wJoin | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |
|---:|---:|---:|---:|---:|
| 6 | 99.7% | 100.1% | 101% | 12 |
| 12 | 99.9% | 100.0% | 100% | 12 |
| 24 | 100.0% | 100.0% | 100% | 12 |
| 48 | 100.2% | 100.8% | 100% | 12 |
| 96 | 100.3% | 100.9% | 100% | 12 |

How to read it:

- **`REFINE_GAIN` is now the lever that splits the junction leaves.** 0.05 gives 93.5% of the default's objective at 254% of its leaves, 0.02 gives
  91.1% at 375%. Below that it flattens (section 3.1).
- **`BOUND_HEADROOM` still pays**: 1.0 is 92.8% of the default with the same leaf count (the r1.1 bound no longer multiplies leaves with it). Its
  price is rebuilds when a radius changes, counted over the deck's four preset changes (200 row steps, radius-past rows only):

| headroom | row steps | rows rebuilt |
|---:|---:|---:|
| 1 | 200 | 17 |
| 1.05 | 200 | 13 |
| 1.1 | 200 | 4 |
| 1.2 | 200 | 3 |
| 1.35 | 200 | 3 |

  At 1.0, 17 single rows rebuild over the whole deck; at 1.1, 4. A single-row rebuild is cheap beside the frame cost it saves.
- **`wJoin` (K's join weight in the split estimate) moves nothing** (99.7% to 100.3% over 6 to 96): active joins average 0.1 a pixel, so a join
  term in the estimate rarely decides a split. Keep 24.
- **`LEAF_MIN_PX` and `LEAF_OVERHEAD` barely matter** (below 8 px no change at all; 16 and 32 only lose). Keep 8 and 64.

### 3.1 How far splitting goes

All four headroom 1.0, `LEAF_MIN_PX 8`, `LEAF_OVERHEAD 64`, `wJoin 24`; only `REFINE_GAIN` differs (Mac unless noted; cost in cost-model units
per frame).

| benchmark | picture | default (0.2, headroom 1.1): cost / leaves / quads | refine 0.05: cost / leaves / quads | refine 0.02 | refine 0.01 |
|---|---|---:|---:|---:|---:|
| anat-fit | mac | 84M / 1218 / 571 | 73M / 3203 / 1332 | 70M / 4728 / 2013 | 69M / 5577 / 2460 |
| anat-deep | mac | 304M / 1218 / 35 | 280M / 3203 / 50 | 271M / 4728 / 109 | 268M / 5577 / 157 |
| pinch | mac | 188M / 1218 / 571 | 169M / 3203 / 1332 | 164M / 4728 / 2013 | 162M / 5577 / 2460 |
| blood-only | mac | 78M / 1218 / 571 | 67M / 3203 / 1332 | 64M / 4728 / 2013 | 63M / 5577 / 2460 |
| cv-junction | mac | 352M / 1369 / 234 | 297M / 3754 / 495 | 287M / 5510 / 724 | 281M / 6352 / 874 |
| cv-junction | iphone | 469M / 757 / 261 | 408M / 1695 / 289 | 390M / 2467 / 328 | 384M / 2781 / 340 |
| lobule-tissue | mac | 253M / 1369 / 91 | 212M / 3754 / 228 | 208M / 5510 / 307 | 206M / 6352 / 358 |
| lobule-tissue | iphone | 228M / 757 / 11 | 192M / 1695 / 27 | 190M / 2467 / 30 | 188M / 2781 / 34 |

Each step buys less: 0.2 to 0.05 takes 8% to 16% off the cost for 2.6x the leaves, 0.05 to 0.02 another 2% to 4% for 1.5x, 0.02 to 0.01 another 1% to 2%.
Per pixel on the junction, bound tests fall 10.2 to 8.7 to 7.9 and segment tests stay at 10 (they are set by the runs, not the leaf size). The
chosen **0.05** takes most of the gain; 0.02 is available if the build time and memory of 5,500 leaves are acceptable (a build takes 313 to 355 ms
on the lobule at 0.05 to 0.01 in node).

## 4. Before and after revision 1.1

| | c4a8e47d (before) | dd8d543f (after) |
|---|---:|---:|
| lobule leaves (default policy) | 29,424 | 1,369 |
| `L_WIDE` leaves, lobule | 24,492 | 0 |
| `L_WIDE` leaves, anatomy fit | 2,978 of 5,387 | 0 of 1,218 |
| cv-junction cost, Mac, default policy | 382M | 352M |
| lobule-tissue cost, Mac, default policy | 284M | 253M |

The wide leaves are gone, and with them the 120-work-per-pixel pixels. The cost fell less than the leaf count (the pixels were few): what is left
is L_JOIN leaves (the lobule's leaves by area) whose pixels hold 0.1 active joins on average, i.e. the leaf is bigger than the junction it names,
which is what section 3.1 shows `REFINE_GAIN` splitting.

## 5. Per-component GPU time and the benchmarks in the app

`src/ui/vec-measure.js` times the vector renderer's components with GPU timer queries (`EXT_disjoint_timer_query_webgl2`): strips, regions or leaves
(per class), blood, glass, composite, and the rest. It runs only with `?perf`: without it every hook returns at its first line and allocates nothing.
The "Vector work" section of the `?perf` panel shows the mean and total time per component and the leaves in view by class. Timer queries cannot nest,
so a nested pair ends the outer query and restarts it after the inner one; the panel says that splitting a render pass this way can cost a little.
A result taken under `GPU_DISJOINT_EXT` is dropped and counted, never shown.

`?vecbench=<name>` (Vector selected in Settings > Display) runs one named benchmark in the app: it loads the preset or the lobule focus, settles 90
frames, plays the camera (the pinch over 2 s), and leaves the report in the panel. The cameras are the same table node replays
(`src/ui/vec-bench.js`: `benchMatrix(name, t, picture)`), so a device measurement and this document speak about the same frames. Mohammad approved
keeping the switch, the replay, the frozen old compiler and the report script (9 Nov).

The six benchmarks: `cv-junction`, `lobule-tissue`, `anat-fit`, `anat-deep` (9x over the portal confluence), `pinch` (fit to 9x in 2 s, replayed at
five instants), `blood-only` (anatomy at rest, blood frames only).

## 6. Repeat it

```
node scripts/vec-workload.mjs                          # all six benchmarks, both pictures, every 4th pixel, the contract's defaults
node scripts/vec-workload.mjs --policy 1,8,64,0.05,24  # headroom, leafMinPx, leafOverhead, refineGain[, wJoin]
node scripts/vec-workload.mjs --sweep --easing         # the policy sweep and the width-easing count
node scripts/vec-workload.mjs --bench cv-junction --pic mac --stride 2
```

Each scene runs in its own process (`--scene anatomy|lobule`) and the driver merges the JSON. `--json -` prints the JSON; `--out <dir>` writes
`vector-workload.json` and the markdown tables. The replay is `replayPixel` / `replayOld` in `tests/vec-replay.js`, tested against A's bound test and
an independent quadtree walk (`tests/vec-measure.test.js`).

## 7. Caveats

- The cost model is the plan's, with K's weights (1, 6, 24). It counts tests, not time; the GPU timers above calibrate it, and no device number is
  in this document.
- The sweep's quad cost (64) is a stand-in. If a quad turns out far dearer than 64 test-units, the finer `REFINE_GAIN` values lose their edge.
- Rebuild CPU cost is outside the GPU objective. Section 3 counts rebuilds, not their milliseconds.
- The lobule's radii are the test recipe's derived ones (`tests/vec-lobule.test.js`), the anatomy fit uses k = 1 rather than the stage's own default
  camera, and the pinch uses `smooth01` over a straight log-zoom path to the portal confluence.
- "Blood-only" counts strip pixels within the lumen plus 2 px (the BLOOD pass's band) and whole squares for region and leaf quads. D's per-pixel
  blood work (`bloodPixelWork`) is not added in.
- A's `pastRows` flags rows that are "on" with no run as radius-past; the easing count only includes rows whose radius left its headroom.
