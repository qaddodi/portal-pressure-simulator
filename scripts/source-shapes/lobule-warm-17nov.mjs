// The lobule is made ready as the reader reaches for it (17 Nov 2026, the tester: opened cold it took 565 ms of stage, 386 of tissue, 161 of labels in one go). The preparation itself, a piece at a time while
// the page is quiet, is stage-tubes.js prepLobule; the pointer resting 0.22 s on the Lobule button, a focus, or a finger down on it starts it at once (warmLobule), with a short quiet, and a card or
// sheet coming or going holds every piece (card-motion.js). Source shapes kept here (PR-02).
const W = 'The lobule is warmed as it is reached for (17 Nov 2026):';
export default [
  { file: 'src/ui/main.js', need: [/lb\.addEventListener\('pointerenter', \(e\) => \{ if \(e\.pointerType === 'touch'\) return; clearTimeout\(warmT\); warmT = setTimeout\(\(\) => stage\.warmLobule\?\.\(\), 220\); \}\);/, `${W} the pointer resting 0.22 s on the Lobule button warms it`] },
  { file: 'src/ui/main.js', need: [/lb\.addEventListener\('pointerdown', \(\) => \{ clearTimeout\(warmT\); stage\.warmLobule\?\.\(\); \}\);/, `${W} a finger down on the button warms it at once (a phone has no hover)`] },
  { file: 'src/ui/stage-tubes.js', need: [/if \(handDown\(\) \|\| sinceInput\(\) < prepQuiet\(\) \|\| settling\(\) \|\| cardMoveLeft\(\) > 0\) stageScope\.timer\(/, `${W} a piece of the preparation waits for a quiet moment and for any card or sheet to land`] },
  { file: 'src/ui/stage-tubes.js', need: [/function warmLobule\(\) \{\s+if \(live\.lobuleOn\) return;\s+prepRush = performance\.now\(\) \+ 4000; prepAt = 0;\s+prepLobule\(\);/, `${W} warmLobule starts the preparation now, with a tenth of a second of quiet for a few seconds`] },
  { file: 'src/ui/stage-morph.js', need: [/if \(live\.lobuleOn \|\| live\.diveWait \|\| live\.diveT > 0\) \{ mayTask\(TRACK_TAG, morphTrackStep, \{ notBefore: performance\.now\(\) \+ 250 \}\); return false; \}/, `${W} the view switch's pieces (anatomy and circuit) are not built while the lobule opens or is open`] },
  { file: 'src/ui/stage-morph.js', need: [/cardMoveLeft\(\) > 0 \|\| handDown\(\) \|\| \(sinceInput\(\) < 700 && bd\.held < 12\)/, `${W} the view switch's pieces are held for as long as a drag is in the hand, not only twelve looks`] },
  { file: 'src/ui/stage-tubes.js', need: [/if \(handDown\(\) \|\| sinceInput\(\) < prepQuiet\(\)/, `${W} nor is a piece of the lobule's preparation run mid-drag`] },
];
