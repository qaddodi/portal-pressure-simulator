# The brief, revision 1: Mohammad's reviewer, second recommendation (9 Nov 2026, 16:34 UTC), word for word

Sent after the first GPU run of Vector at 8772ff8. It amends the first brief (`vector-renderer-brief.md`); where the two differ, this one wins.

Keep the retained renderer, but replace the fixed 16-unit classification with an adaptive, segment-level spatial hierarchy. Bounding circles alone are not the fix.

The reported lobule results invalidate an assumption in my earlier recommendation: ordinary stretches cannot be treated as the dominant workload there. I should have made that assumption explicit before recommending the architecture.

I inspected the compiler, region shader and renderer at 8772ff8. There are concrete changes to make before deciding whether the architecture succeeds.

First, the six acceptance criteria have not passed yet.

Node tests can verify partition rules, mathematical helpers and scheduling. They cannot establish seamless GPU rendering, stable streaks or sustained frame pacing. With almost no vessels visible, those remain unverified.

Likewise, "one render pass" does not mean little work. One pass containing expensive nested loops can still be slow. The missing-vessels issue must be fixed before the reported frame rate becomes a useful comparison of completed renderers.

## 1. Is a region-dominated grid still right?

Regions are fine. Expensive regions covering almost everything are not.

The meaningful distinction should be how much geometry can affect a pixel, rather than whether a cell is labelled "ordinary" or "interaction."

The reported proportions count occupied cells. They do not establish the fraction of visible pixels, actual lumen overlap or GPU time. Your classification also includes shadows, glows and safety margins, so neighbouring vessels can turn a cell into a region even when their lumens never meet.

More importantly, the current compiler loses useful spatial information:
- It collects relevant segments, then represents each vessel with one [first, last] interval.
- If the relevant segments are separated, that interval includes the intervening segments.
- Adding junction dependencies can widen the interval further.
- The shader then evaluates that stored interval before determining whether the member matters.

That is visible in vec-compile.js and vec-region-glsl.js.

The correction is to retain explicit short segment runs, with their bounds and junction dependencies. A cell should reference the nearby pieces of a vessel, rather than a potentially long interval connecting them.

This is consistent with established vector-rendering work. Vello bins individual line segments into tiles, and its rendering research explicitly discusses arranging local segment data alongside per-tile commands. That supports the organization, although it does not establish the performance of your shaders. Git at Google

I would not introduce sinusoid merging or a distance-field representation in this round. First remove the unnecessary segment work without changing the anatomy.

## 2. Is bounds culling enough? Should we keep the nearest k?

Use bounds culling, but at the segment-run level. Do not use an unproven nearest-k cutoff.

A circle enclosing an entire curved vessel can be loose. Near the central vein, many such circles may contain the same pixels, making them ineffective.

The proposed hierarchy should do this:
1. Reject irrelevant spatial leaves.
2. Within a leaf, reject irrelevant short segment runs using conservative bounds.
3. Evaluate distances only for the surviving runs.
4. Resolve their applicable junctions and depth relationships.
5. Shade the resulting vessel and blood contributions.

Bounds must account for the particular contribution being evaluated:

| Contribution | What its bounds must include |
|---|---|
| Lumen and casing | Radius, wall and antialiasing |
| Shadow | Offset and shadow reach |
| Glow | Active glow reach |
| Junction | Fillet and required connected members |
| Morph | The geometry throughout the supported transition |

Do not automatically apply the widest possible glow to every lumen candidate. Separate these candidate categories while preserving their correct final composition. Material changes must invalidate the relevant bounds when necessary.

Nearest-k is not generally safe. The closest centrelines are not necessarily the vessels that determine the picture. A farther centreline may belong to a wider vessel, a vessel above another, a visible glow or a required junction member.

A shortlist is acceptable only when conservative bounds establish that excluded geometry cannot affect the result, within an explicitly defined rendering tolerance. Otherwise, preserve the candidates.

There is an additional issue in this build: 48 is the cell-member capacity, but SLOTS remains eight. The region shader evaluates candidate members and then retains eight per pixel. Increasing cell capacity therefore does not mean all contributing vessels survive.

That preserves a Classic limitation. It does not establish correct rendering of an arbitrarily dense junction. Similarly, compiler overflow currently selects members or joins to retain. Overflow should trigger subdivision or a complete overflow representation, never silently remove anatomy.

## 3. Should cell size adapt?

Yes. Subdivide based on estimated shader work, not vessel count alone.

Keep the existing grid as a broad spatial index. Within expensive cells, build smaller, disjoint leaves.

Each leaf should contain:
- References to short segment runs.
- The junction records needed there.
- Contribution bounds.
- A classification for the shader work it actually requires.

Refine when subdivision materially reduces candidate segment tests or junction work. Retain the hierarchy on the GPU. Camera movement should select and transform prepared data, without rebuilding the hierarchy on every pinch frame.

Screen footprint also matters. A world-space cell can cover a large screen area at deep zoom. The refinement policy needs to consider projected coverage as well as local geometry.

Do not choose a new universal cell size yet. Changing every cell from 16 units to another fixed size repeats the same assumption. Benchmark the adaptive policy against the actual anatomy.

There is one unavoidable exception: a genuine multiway junction. If multiple sinusoids physically meet at the same location, subdivision cannot make those connections disappear. That leaf needs a complete junction resolve, and its cost must be measured separately. Spatial subdivision removes false proximity and unnecessary segments. It cannot eliminate real anatomical interaction.

## What I would instruct the implementation team to do next

1. Fix visibility first. Confirm that strips and regions both render correctly, including their cell lookup, instance counts and coordinates.
2. Preserve disjoint segment runs. Stop expanding separated runs into one long interval.
3. Add conservative run-level bounds. Reject work before calling the expensive distance functions.
4. Add adaptive leaves. Refine expensive cells while preserving exclusive pixel ownership.
5. Make overflow explicit. Record it and handle the complete geometry.
6. Measure the actual workload. Report projected region pixels, segment tests, surviving members, active joins and time by rendering component. Cell percentages alone are insufficient.

The dense central-vein junction should be a named benchmark alongside ordinary lobule tissue, camera motion and blood-only frames.

My revised recommendation is still one renderer: retained geometry with an adaptive spatial hierarchy of short segment runs and complete local junction resolves. Proceed with that correction before adding another representation. I cannot yet say it will meet the frame target, but it directly addresses the expensive work visible in this implementation without sacrificing vessels or blood continuity.
