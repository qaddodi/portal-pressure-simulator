// A card's details are inside the card (Mohammad, 17 Nov 2026: "have the card itself slide into these extensive more details... Not make a new pop up"). A tap on the
// card's name slides the face away and the details in, in the same box; Back slides the face home. Source shapes kept here (PR-02), each with its reason.
// Pattern gone = the code changed: look before editing. (The data side, what each card's details say and that their numbers are real, is tests/card-details.test.js.)
const W = 'A card\'s details are inside the card (17 Nov 2026):';
export default [
  { file: 'src/ui/card.js', forbid: [/onDetails/, `${W} no panel or sheet for a vessel, a station or an organ`] },
  { file: 'src/ui/card.js', need: [/const onNameClick = \(\) => openDetails\(\);/, `${W} the name opens them`] },
  { file: 'src/ui/main.js', forbid: [/onDetails|NAMED_DETAILS|store\.set\(\{ details: normalizeSel/, `${W} the app fills the side panel for the advanced physiology and a pinned comparison only`] },
  { file: 'src/ui/main.js', need: [/onWhy: \(m, el\) => why\.open\(m, el\), {3}\/\/ \(the card's own details view/, `${W} the Why? explainer is one tap from the details`] },
  { file: 'src/ui/main.js', need: [/else if \(card\.detailsOpen\(\)\) card\.closeDetails\(\);/, `${W} Esc takes the details back before it takes the card away`] },
  { file: 'src/ui/inspector.js', forbid: [/function (edgePanel|nodePanel|organPanel)|ORGAN_ABOUT|ABOUT_EDGE|'Doppler here'/, `${W} the panel builders are gone`] },
  { file: 'src/ui/inspector.js', need: [/sel\?\.type === 'advanced' \? chart\.renderAdvanced\(ctl\) : home\(\)/, `${W} the panel keeps the chart and the advanced physiology`] },
  { file: 'src/ui/inspector.js', need: [/export const readings = liveReadings;/, `${W} tests/inspector-live-text.test.js still reads the same words`] },
  { file: 'src/ui/card-details.js', forbid: [/Doppler here|Pressure drop|Peak velocity/, `${W} no second copy of the card's own readings or its Doppler button (comments aside, they are the words of the change)`] },
  { file: 'src/ui/card-details.js', need: [/onWhy\(plan\.why, e\.currentTarget\)/, `${W} the card model's own Why? id, no metric picked per kind`] },
  { file: 'src/ui/card-details.js', need: [/import \{ newCell, numText, lpmText, Pof, Qof \} from '\.\/live-readings\.js';/, `${W} one number, one wording: the shared live words`] },
  { file: 'src/ui/card-details.js', need: [/class: 'ad-back'[^\n]*h\('span', \{\}, title\)/, `${W} the way back is the card's name row`] },
  { file: 'src/ui/card.js', need: [/const SIDE_FACE_OUT = \[\{ opacity: 1, translate: '0 0' \}, \{ opacity: 0, translate: '-20px 0' \}\]/, `${W} the face leaves toward the left`] },
  { file: 'src/ui/card.js', need: [/const SIDE_DET_IN = \[\{ opacity: 0, translate: '20px 0' \}, \{ opacity: 1, translate: '0 0' \}\]/, `${W} the details come in from the right`] },
  { file: 'src/ui/card.js', scan: (src) => ['SIDE_FACE_OUT', 'SIDE_FACE_IN', 'SIDE_DET_IN', 'SIDE_DET_OUT'].flatMap((n) => { const line = src.split('\n').find((l) => l.includes(`${n} = [`)) || ''; const bad = [...line.matchAll(/(\w+):/g)].map((x) => x[1]).filter((k) => k !== 'opacity' && k !== 'translate'); return bad.length || !line ? [`${W} ${n} moves by opacity and translate only (found ${bad.join(', ') || 'no such line'})`] : []; }) },
  { file: 'src/ui/card.js', need: [/classSoon\(face, 'ac-under', true\); propSoon\(face, 'inert', true\);[^\n]*runSoon\(\(\) => a\.cancel\(\)\)/, `${W} the face is hidden first, then the slide let go: never a frame with it back`] },
  { file: 'src/ui/card.js', need: [/classNow\(face, 'ac-under', false\); propSoon\(face, 'inert', false\); face\.animate\(still \? FADE_IN : SIDE_FACE_IN, WORDS_IN_OPT\)/, `${W} Back shows the face first, then slides it home`] },
  { file: 'src/ui/card.js', need: [/const keepDet = detOpen && same && !leaving;/, `${W} a rebuild of the same card keeps the details showing`] },
  { file: 'src/ui/card.js', need: [/if \(keepDet\) \{ classNow\(body, 'ac-under', true\); body\.inert = true;/, `${W} the rebuilt face goes under them`] },
  { file: 'src/ui/card.js', need: [/trigger\(n\) \{ if \(detOpen\) return false;/, `${W} the number keys do not press the hidden face`] },
  { file: 'src/ui/card.js', need: [/e\.target\.closest\('input, button, \.ac-c, \.ad-scroll'\)/, `${W} a phone's pull-down starts on the head, never on the scrolling view`] },
  { file: 'styles/app-03-layouts.css', need: [/\.ac-body, \.ac-ghost, \.ac-details \{ position: absolute; inset: 0;/, `${W} the details are laid over the face's own box: the card's height never changes`] },
  { file: 'styles/app-03-layouts.css', need: [/\.action-card\.docked\.ac-scroll > \.ac-details \{ touch-action: pan-y; \}/, `${W} on a phone the details face takes the vertical touch when it is taller than its room (the face's own rule), or its scroller never gets the swipe`] },
  { file: 'src/ui/card.js', need: [/detOpen \? ':scope > \.ac-details > \.ad-scroll' : ':scope > \.ac-body'/, `${W} ac-scroll measures the face that shows: the details' scroller while they are open`] },
  { file: 'styles/app-03-layouts.css', need: [/\.ad-scroll \{[^}]*overflow-x: hidden; overflow-y: auto;/, `${W} a taller view scrolls up and down inside the box, never sideways`] },
  { file: 'styles/app-03-layouts.css', need: [/\.ac-body\.ac-under \{ visibility: hidden; pointer-events: none; \}/, `${W} the face under the details takes no taps`] },
];
