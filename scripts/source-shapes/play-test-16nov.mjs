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
];
