// Source shapes from the 16 Nov 2026 play-test fixes; the behaviour is tested in tests/talk-exit-restores-patient.test.js and tests/steady-readings.test.js.

export default [
  // A sticky foot inside a menu stacks above the menu's scroll-edge veils (app-02-controls.css .menu.se::after, z-index 1): the bottom veil is the menu's
  // last child and reaches under the foot, and washed a pale band over the From readings buttons.
  { file: 'styles/from-readings.css', scan: (text) => {
    const m = text.match(/\.fr-foot \{[^}]*\}/);
    if (!m) return ['the .fr-foot rule is gone: a sticky foot in a menu must stack above the scroll-edge veils'];
    const z = Number((m[0].match(/z-index:\s*(\d+)/) || [])[1]);
    return z >= 2 ? [] : [`.fr-foot has z-index ${z || 'none'}: a sticky foot stacks above the veils (z-index 1), or a veil washes over its buttons`];
  } },
  // The end of a talk restores the patient and clock the viewer started it from; healthy is only the fallback when nothing was captured.
  { file: 'src/ui/presenter-start.js', need: [/if \(b\.snap && b\.params\) \{\s*host\.send\(\{ type: 'restore', snap: b\.snap/, 'putHealthy restores the captured model state'] },
  { file: 'src/ui/presenter-start.js', need: [/\} else \{.{0,200}loadPreset\?\.\('healthy'\)/s, 'the healthy preset loads only when no state was captured'] },
  // The loading cover a talk start puts up (issue 5, 16 Nov 2026): the scene stays faintly under it (never a blank beige screen), and it names what is opening.
  { file: 'styles/app-08-cards.css', need: [/\.pz-cover \{[^}]*background: color-mix\(in srgb, var\(--stage-bg\) \d\d%, transparent\)/, 'the cover is a dimming scrim, not an opaque blank'] },
  { file: 'src/ui/presenter-start.js', need: ["coverUp(d.title)", 'the cover names the talk it is opening'] },
  // Mac play-test findings (16 Nov 2026; behaviour in tests/slide-count.test.js, tests/upright-fit.test.js, tests/view-xf-ghosts.test.js).
  // The Present menu's slide counts come from the library's one count (the outline slide and the quick check included): the deck said 73 and opened as 1 / 74.
  { file: 'src/ui/menu.js', forbid: [/slides\.length/, "the Present menu never counts a deck's slides itself: lib.count (decks.js slideCount) is the number the presenter shows"] },
  { file: 'src/ui/menu.js', need: [/lib\.count\(/, 'the Present menu reads its slide counts from lib.count'] },
  // Turning the circuit upright: a fresh snapshot of the bars, and the turned map kept as a circuit framing so a bar that changes size refits it.
  { file: 'src/ui/stage-fit.js', need: [/snapFresh\(\);[^\n]*\n\s*try \{ localStorage\.setItem\('pps\.circuitRot'/, 'the turn reads the bars as they stand now'] },
  { file: 'src/ui/stage-fit.js', need: [/markCirc\('whole', live\.rotWhole\)/, 'the turned map is a circuit framing the look-home pass refits'] },
  // Cards on the right edge glide aside for the card to their right by translate (--occ-x), never by a jump of their `right`.
  { file: 'styles/app-*.css', forbid: [/(?:^|[;{\s])right\s*:\s*calc\([^;}]*var\(--(?:panel|instr)-occ(?![^;}]*\+ 6px)/m, 'a card offsets its right edge by the cards beside it: use translate by --occ-x (app-07-floating.css .treat-card), which glides'] },
  { file: 'styles/app-07-floating.css', need: [/\.treat-card \{[^}]*--occ-x: calc\(-1 \* \(var\(--panel-occ, 0px\) \+ var\(--instr-occ, 0px\)\)\); translate: var\(--occ-x\) 0; transition: [^;}]*translate/, 'Treat and History glide aside for Tests and the Details panel'] },
  { file: 'styles/app-07-floating.css', need: [/\.instrument-workspace\.side \{[^}]*--occ-x: calc\(-1 \* var\(--panel-occ, 0px\)\); translate: var\(--occ-x\) 0; transition: [^;}]*translate/, 'the side Tests card glides aside for the Details panel'] },
  { file: 'styles/app-10-thumb-dock.css', need: [/translate: var\(--occ-x, 0px\) var\(--sink, 0px\)/, 'the thumb dock keeps the glide beside the sheet sink'] },
  // The Circuit's zone bands and dots come in over the second half of the change (a ramp of t from 0.5), never with the first: a faint panel showed over the plate.
  { file: 'src/ui/stage-frame.js', need: [/const ma = t <= 0\.5 \? 0 : t >= 1 \? 1 : /, 'the map fades in only after the organs are mostly gone'] },
  { file: 'src/ui/stage-frame.js', forbid: [/if \(MAP\.a !== t\)/, 'the map\'s opacity is not the morph\'s t itself'] },
  // A shortcut label names the device's own modifier (platform-keys.js keyLabel): the guide's rows and the Search button never write Ctrl or ⌘ by hand.
  { file: 'src/ui/main.js', forbid: [/\['Ctrl\/⌘/, 'a Guide row writes Ctrl/⌘ by hand: wrap it in keyLabel so a Mac reads ⌘'] },
  { file: 'src/ui/main.js', need: [/b\.title = `Search \(\$\{keyLabel\('Ctrl\/⌘ K'\)\}\)`/, 'the Search button is named for the device'] },
  // Entering the Sinusoid view: the cards leave by a fade (display is a discrete transition), as they come back; only the top bar's own pieces drop at once (topbar-motion.js ghosts them).
  { file: 'styles/app-03-layouts.css', need: [/#app\.sin-focus :is\(#dock, #panel, #treatCard, #stageCenter\) \{ display: none !important; opacity: 0; pointer-events: none; transition: opacity [^;]*display [^;]*allow-discrete; \}/, 'the cards fade out of the sinusoid view'] },
  { file: 'styles/app-03-layouts.css', forbid: [/#app\.sin-focus :is\([^)]*#dock[^)]*\) \{ display: none !important; \}/, 'the cards are hidden by display alone: they pop out'] },
  // The zoom pill's box changes size by a glide; under Reduce Motion by a short fade, never in one frame.
  { file: 'src/ui/plate-glide.js', need: [/if \(still\.matches\) \{ host\.animate\(\[\{ opacity: 0\.4 \}, \{ opacity: 1 \}\]/, 'a box that changes size under Reduce Motion fades in, it does not snap'] },
  // The Compare switch (Then, Now, Change) keeps its elements while its words stand, so the selection glides from one choice to the next (seg-glide.js) instead of being set down on the new one.
  { file: 'src/ui/main.js', need: [/bannerSeg\._words === cmpLabel \+ '\|' \+ cmpNA \+ '\|' \+ cmpNB\) \{\s*for \(let i = 0; i < 3; i\+\+\) bannerSeg\.children\[i\]\.setAttribute\('aria-pressed'/, 'a press of Then, Now or Change only moves the pressed mark'] },
];
