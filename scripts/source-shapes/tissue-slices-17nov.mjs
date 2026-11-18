// A new tissue state's bitmap is painted on the GPU in slices between frames, and never inside one (17 Nov 2026, the tester, a lobule pick that changed the tissue's state: the bitmap painted in
// one frame, lz.texUpload 743 ms on his Mac). The old picture stays on screen until the new one is whole, then the crossfade the page always had begins. The slicing itself is paint-gl.js
// beginJob / stepJob (tests/paint-gl-slices.test.js); the rest is kept here as source shapes (PR-02).
const W = 'The tissue is painted in slices (17 Nov 2026):';
export default [
  { file: 'src/ui/lobule-zoom.js', need: [/const later = gpu && wk !== worldKey && !!worldState && ws !== worldState && worldGeo === G && worldCv\.width > 0 && !wideBuild && !diveScaled && !diveRim && !unseen\(\);/, `${W} a new state with a picture already shown is made later, not at once (the dive and the first frame still wait for theirs)`] },
  { file: 'src/ui/lobule-zoom.js', need: [/if \(!pend\) \{[\s\S]{0,300}pend = \{ cv: paintWorld\(sc, m, G, dark, cs\), tg, G, ws, wk, sc \};[\s\S]{0,80}mayTask\(PEND_TAG, pendRun\);/, `${W} the new bitmap is recorded once and its painting handed to a may task`] },
  { file: 'src/ui/lobule-zoom.js', need: [/if \(cardMoveLeft\(\) > 0 \|\| settling\(\)\) \{ mayTask\(PEND_TAG, pendRun, \{ notBefore: performance\.now\(\) \+ 60 \}\); return false; \}/, `${W} no slice is painted while a card or sheet moves`] },
  { file: 'src/ui/lobule-zoom.js', need: [/if \(!framePart\('lz\.tissueSlice', pendPrep\)\) return true;\s+pendLand\(\);/, `${W} a slice is a named part of the frame, and the picture lands only when it is whole`] },
  { file: 'src/ui/lobule-zoom.js', need: [/worldCv = p\.cv; worldKey = p\.wk; worldState = p\.ws; worldSc = p\.sc; worldGeo = G; worldDraws\+\+;\s+p\.tg\.sweep\(\);[\s\S]{0,80}wake\(\);/, `${W} landing swaps the bitmap in, gives the old texture back and draws again`] },
  { file: 'src/ui/lobule-zoom.js', need: [/else if \(wk !== worldKey && gpu\) \{\s+if \(pend\) dropPend\(\);/, `${W} a picture wanted now (a zoom, the dive) paints at once and drops the one being made`] },
  { file: 'src/ui/tissue-gl.js', need: [/prepare\(cv, ver = 0, ms = 4\) \{[\s\S]{0,200}prepareFor\(cv, ver, ms\)/, `${W} the tissue's handle paints a recorded picture a slice at a time`] },
  { file: 'src/ui/tissue-gl.js', need: [/for \(const \[cv, j\] of jobs\) if \(!cv\.width \|\| !keep\(cv\)\) \{ if \(!lost\) paintGL\(gl\)\.abandon\(j\.job\); jobs\.delete\(cv\); \}/, `${W} a picture given back before it was whole gives its job back`] },
  { file: 'src/ui/paint-gl.js', need: [/if \(fresh && ms < Infinity\) \{ gl\.flush\(\); job\.setup = true; return false; \}/, `${W} a sliced paint's first step only sets up: no tile with the targets' allocation (tester: a first slice of 417 ms)`] },
  { file: 'src/ui/lobule-zoom.js', need: [/const radDue = rzMoving \|\| lensFrom \|\| !radAll \|\| kq !== radAllK \|\| now - lastRadSend >= RAD_GAP_MS;\s+const calCh = radDue && calibersChanged\(rzOf\(\), G\);/, `${W} the vessels' easing calibers are sent at RAD_GAP_MS at the fastest (each send redraws their rows: 100 to 145 ms on a Mac), asked about only when due`] },
];
