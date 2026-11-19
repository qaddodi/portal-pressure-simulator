# How the figure draws a stent that stands

Moved out of `src/ui/stage-venous.js` (the line budget of `src/ui/stage*` may not grow); the text is unchanged.

A stent that is already standing is kept, not built again (10 Nov 2026, Mohammad: "when the TIPS stent appears it flickers"): the overlays are
asked to rebuild whenever anything in their key moves, and the TIPS's own width eases for a long while after the shunt opens, so a rebuild came
every few hundred ms while it came in. Each one took the old elements out of the page, and the painter, which reads a piece's opacity from its
element as it paints, drew the removed elements as the last frame left them until the layer was read again. Now a rebuild whose pieces are the
same pieces (the same classes in the same order) writes the new outlines into the elements it has: the painter reads an outline's `d` as it
paints (stage-over.js needsReread), so nothing is read again and nothing leaves the page; and a rebuild whose mesh did not move (its signature)
writes nothing at all.

## A stent follows its shunt (16 Nov 2026)

Mohammad: "the TIPS comes in and out of existence, pops", "the stent remained despite the connection blood not being there". The mesh is wanted only while the shunt is open and as wide as a stent (`stentOpen`, `src/engine/portal/stent-ease.js`), the shunt itself opens and closes through its width (`easeParams` for a live change, `stentMix` in `morphAt` for a change of patient), a shunt turned round mid draw-on turns from the share it shows (`src/ui/reveal-turn.js`), and a stent that has faded is held at nothing, never dropped (a dropped key reads as full strength). Tests: `tests/stent-switch-eases.test.js`, `tests/stent-follows-shunt.test.js`.
