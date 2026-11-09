# The brief: Mohammad's reviewer recommendation (9 Nov 2026, 14:27 UTC), word for word

My reviewer recommendations attached.
Have an opus high thread come up with a plan, then send sonnet threads to execute the plan as parallelized as possible.

My recommendation is a retained GPU vector renderer with sparse, explicitly resolved junctions and crossings, with blood shaded directly on that geometry. Implement it in your existing WebGL2 figure context.

In plain language: prepare the anatomical drawing once, keep its geometry on the GPU, and make each frame mostly move that geometry and animate its material. Reserve the complicated blending calculations for the small regions where vessels actually interact.

This changes my earlier recommendation of a world-space distance-field atlas. After looking more broadly at established vector renderers and your blood pipeline, I would choose reusable geometry as the foundation.

I researched Apple's GPU guidance, vector rendering literature, Vello, PixiJS and Valve's flow-texture techniques. I also inspected your vessel, mesh, organ, tissue and blood shaders at 7955b2d. This is my engineering recommendation from that evidence. It is not a measured claim that this implementation already reaches 120 fps.

## Why your apparently simple drawing can become expensive

The number of anatomical objects does not explain the workload by itself. What matters is how often the renderer calculates their shapes, shades overlapping pixels and moves intermediate images through memory.

Your code currently takes two expensive routes:

* Classic reconstructs geometry in the fragment shader. Pixels search nearby segments, select candidate vessels, resolve junctions and tiers, and then shade.
* Mesh still performs substantial analytic work. Its fragment shaders calculate segment distances, while its key and colour passes repeatedly process overlapping strips and patches. It is not yet the inexpensive "draw a prepared mesh" pipeline that the name might suggest.

The mesh also writes colour, two flow attachments and a mask, which the blood composite subsequently consumes. Meanwhile, organs, tissue, glass and presentation have their own work.

Those are verified architectural costs. Which cost currently dominates on your iPhone and Mac still requires device measurements.

Apple specifically identifies unnecessary pass dependencies, attachment traffic and overdraw as major optimization targets. Moving a calculation onto the GPU does not automatically make it inexpensive.

## What the research supports

The established approaches share an important principle: prepare a compact representation, then limit rendering work to what contributes to the image.

* Loop and Blinn demonstrate rendering vector interiors with triangles and evaluating curved boundaries locally in shaders.
* PixiJS retains reusable geometry and render instructions, allowing group transforms without rebuilding every child.
* Vello's sparse architecture concentrates coverage information around boundaries and represents fully covered areas more compactly. Its raster backends demonstrate that this principle does not require compute shaders.

The architecture below is my application of those principles to your particular anatomy and flow semantics. No cited engine provides your complete vessel renderer out of the box.

## 1. Keep anatomy as a persistent graph

Each vessel should have persistent data describing:

* Its centreline and radius along its course.
* Its connections to other vessels.
* Its anatomical identity and depth.
* Its material, selection and visibility state.
* Its flow, direction and stream relationships.

Organs should retain their outlines, internal shapes, gradients, masks and deformation parameters.

From these records, prepare reusable GPU buffers. Changing the camera should update a camera matrix. Changing pressure should update the affected parameters. Neither should trigger parsing anatomical paths or reconstructing the whole scene.

Your existing code already contains useful parts of this architecture. This is a reorganization and simplification of the rendering path, not a reason to discard the physiology engine.

## 2. Divide the vessel drawing into ordinary stretches and interaction regions

This is the central change.

Most vessel pixels belong to an ordinary stretch of one vessel. They should use a small shader that already knows which vessel and stretch it is drawing.

Where vessels join, cross, approach closely or fold over themselves, use a dedicated interaction region. That region contains the relevant local segments and resolves their combined appearance.

The regions must partition the drawing so that an ordinary stretch and an interaction region do not independently blend the same vessel contribution into the same pixel.

| Region | Rendering work |
|---|---|
| Ordinary vessel stretch | Draw retained triangles with known vessel coordinates |
| Connected junction | Resolve the local union, fillet, shading and streams together |
| Unconnected crossing | Resolve depth, casing and visible stream ownership |
| Hairpin or self-overlap | Resolve the interacting stretches locally |
| Empty space | No vessel shading |

A practical implementation can use a sparse world-space grid to organize these regions. Simple cells reference prepared geometry. Complex cells reference their local interaction lists. Cell boundaries must use consistent clipping and coverage rules to prevent seams.

The distinction from today's mesh is ownership. Today, overlapping pieces compete through repeated key passes. In the proposed renderer, each interaction region evaluates the complete local result and writes it once.

This preparation must include the reach of shadows, glows and selection rings. Looking only at lumen overlap would miss important interactions.

## 3. Blend connected vessels as one anatomical shape

At a confluence, drawing separate translucent tubes on top of each other produces double-darkening, overlapping outlines and discontinuous highlights.

Instead, the junction shader should:

1. Calculate the connected members' local distances.
2. Construct their combined boundary and fillet.
3. Determine the member contributions inside that shape.
4. Blend radius, wall properties, colour and shading direction consistently.
5. Apply the outer coverage once.

Your current junction equations are valuable here. I would initially preserve them, but execute them within these local regions rather than repeatedly across competing mesh pieces.

Crossings need a different rule. An unconnected crossing must preserve depth and must not mix the two streams. The compiler therefore needs an explicit distinction between "connected here" and "overlapping in the picture."

Cross-tier junctions, such as hepatic veins entering the cava, must preserve your existing trunk and tributary rules. They cannot be reduced to whichever vessel was drawn last.

For transparency, preserve group semantics. If the whole network fades, composite that network correctly before applying its group opacity. Multiplying each vessel's opacity independently changes the picture where they overlap.

## 4. Render blood directly from vessel coordinates

The vessel geometry should supply:

* Distance along the vessel.
* Position across the lumen.
* Vessel identity.
* The relevant stream data.

The blood shader can then calculate streaks directly at the visible lumen pixels. It does not need to recover those coordinates from full-resolution integer flow images during normal rendering.

For ordinary stretches, interpolation provides much of this information. At junctions, the interaction shader supplies the contributing stream coordinates after resolving ownership.

This creates a path to removing the two full-resolution flow attachments from the normal display pipeline. Any separate feature that actually needs an identity or picking image should request it when needed.

There is also useful work to preserve: your blood-tile.js already implements a good underlying technique, using a small mipmapped texture sampled in two phases.

Valve describes the same family of technique for flowing surface detail: offset texture samples in time and blend overlapping phases to hide their resets. It is established, practical rendering work.

I would carry that implementation into the new renderer.

## 5. Make blood motion continuous and medically coherent

The blood material needs explicit rules, particularly when flow changes.

Integrate motion over time. Advance the stream's travelled distance using its velocity over each time interval. Simply multiplying the current velocity by total elapsed time makes the pattern jump when velocity changes.

Anchor the pattern to the vessel. Camera movement must not move streaks relative to the anatomical wall.

Separate physical and drawn dimensions. If the simulator derives velocity from flow and cross-sectional area, use the physiological dimensions. A deliberately widened vessel in the illustration should not silently change the modeled velocity.

Preserve continuity between connected stretches. Splitting one anatomical course into several drawing objects should not restart its pattern at every object boundary.

At confluences, blend sampled stream contributions, not their texture coordinates. Sample each contributing stream in its own coordinates, then combine those results using normalized junction weights. Averaging unrelated coordinates first can create stretching, stationary seams and sudden pattern changes.

The contributing streams also need to follow the current flow direction. A reversal can change which branches supply the junction.

Preserve provenance separately from decorative texture. Where blood came from is physiological state. Noise is only how that state is illustrated.

## 6. Filter streaks correctly at every zoom

Fine streaks that become smaller than a pixel need filtering. Otherwise they shimmer, flicker or appear to move backwards.

Use:

* Mipmaps on the blood texture.
* Screen-space derivatives to choose the appropriate detail.
* Smooth attenuation of unresolved fine detail.
* Stable phase offsets between streams.
* A continuous cross-lumen velocity profile where that matches the intended illustration.

Mipmapping is both an image-quality and a bandwidth technique, as Apple documents. It avoids sampling unnecessary high-frequency texture detail.

The goal is stable blood motion during a slow pinch, including the point where individual streaks become too small to distinguish.

## 7. Keep organs as retained vector geometry

For organs, use reusable triangulated interiors and accurately represented boundaries, with gradients and material coordinates attached to the geometry.

A pan or pinch then changes the transform. It should not trigger another outline flattening and triangulation cycle.

Your organ painter already caches meshes, but its detailTol() and meshOf() paths can create new detail representations as scale changes. I would prepare the required detail levels ahead of interaction, within a defined maximum zoom, and retain them.

For deformation:

* Use GPU vertex interpolation where the mesh correspondence remains valid.
* Prepare separate geometry where the topology actually changes.
* Keep clipping and organ-coverage masks explicit.
* Update a mask when its underlying shape changes, rather than redundantly rebuilding it for every consumer.

Decorative tissue texture can remain a small texture in organ coordinates. Anatomical boundaries should remain geometric.

This does not require replacing every existing organ subsystem immediately. The existing retained meshes and gradient handling are useful starting points.

## 8. Draw soft effects near their boundaries

Shadows and glows should occupy bounded geometry around the relevant vessel or organ edges.

For these effects, analytic coverage can avoid repeatedly blurring a large image. Rive's vector-feathering work demonstrates this approach, while also documenting that curvature, corners and overlapping coverage need careful treatment. A simple opacity ramp alone is insufficient for every shape.

For your app, I would first preserve the existing shadow and glow appearance, then localize its evaluation. Glass remains a separate scene-sampling effect, restricted to the regions that require it.

## 9. Preserve cheap stationary frames

A direct renderer should not throw away your existing advantage when the camera is still.

Within this same renderer:

| Change | Work required |
|---|---|
| Blood advances | Update visible lumen pixels using retained geometry |
| Camera moves | Transform and draw retained geometry |
| Colour or selection changes | Update material data and affected cached colour |
| Radius changes | Update affected stretches and interaction regions |
| Organ deforms | Update its geometry and dependent masks |
| Nothing visible changes | No new figure rendering |

At rest, retain a colour-only static scene containing the organs and stationary vessel appearance. The blood pass can sample that immutable base and overwrite the affected lumen regions with the current result.

During camera movement or deformation, the same renderer draws current geometry and blood together. This is one renderer with explicit cache invalidation.

Interaction lists must cover the supported width and motion ranges. If a morph creates a new crossing, that crossing must already be represented by a conservative transition region or trigger an interaction update. This is one of the implementation's main correctness challenges.

## Why I prefer this over the proposed field atlas

Your app has changing radii, drawing endpoints, morphs, overlapping tiers and stream ownership. A field atlas has to retain enough information to reproduce all of those, while also maintaining sufficient resolution at deep zoom.

Reusable geometry directly represents those changes. Local interaction shaders preserve the difficult semantics without making every ordinary vessel pixel pay their cost.

It also gives you a more useful foundation for eventual 3D: the anatomical graph, radii, stream coordinates and materials remain relevant. Actual 3D organ surfaces and vessel junction geometry would still require additional work.

## What would establish that this is successful

I would build a representative vertical slice first: curved vessels, a confluence, an unconnected crossing, a cross-tier junction, one deforming organ and moving blood. It must exercise selection, transparency, radius changes and morphing.

The first measurements should compare complete frames, including presentation and glass, on your actual devices. Supported WebGL GPU timer queries can provide additional measurements, read asynchronously and checked for invalid timing results.

The budgets are 16.67 ms at 60 fps and 8.33 ms at 120 fps, calculated in Python. Those are whole-frame intervals, not budgets available entirely to vessels.

Acceptance should require:

* Seamless joins and region boundaries at maximum supported zoom.
* Correct stream ownership at crossings and confluences.
* Continuous blood during speed change and reversal.
* Stable streaks during slow pinch and pan.
* Correct fades and selection without double-darkening.
* Sustained frame pacing after the device warms up.

That is the one architecture I would build: retained vector geometry, exclusive local interaction regions, and directly shaded, filtered blood. Its purpose is to remove repeated work across the whole pipeline while preserving the anatomical and flow rules that make your simulator valuable.
