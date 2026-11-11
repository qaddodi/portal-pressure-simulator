// Source shapes from the features of 11 Nov 2026 (items 41 and 42: the beta-blocker response control, the MAP hold rail and the hold-to-strain button;
// tests/hold-strain.test.js and tests/response-control.test.js test what the modules do, and their wiring is kept here with a one-line reason each, PR-02).

const PRES = 'src/ui/presenter.js', MON = 'src/ui/vitals-monitor.js';

export default [
  // The hold-to-strain button
  { file: 'src/worker-core.js', need: [/case 'strain': e\.holdStrain\(!!a\.on\); break;/, 'the worker turns the strain action into the engine\'s momentary hold'] },
  { file: PRES, need: [/s\.strain \? strainEl\(s, i\) : null/, 'a slide with strain gets its button on the teaching card'] },
  { file: PRES, need: [/addEventListener\('pointerdown'/, 'the button starts on a press'] },
  { file: PRES, need: [/for \(const ev of \['pointerup', 'pointercancel', 'lostpointercapture', 'blur'\]\) b\.addEventListener\(ev, release\)/, 'a lifted, cancelled, captured-away or blurred pointer lets go: the button works only while held'] },
  { file: PRES, need: [/e\.key === ' ' \|\| e\.key === 'Enter'\) && !e\.repeat/, 'the keyboard holds it too, once per press'] },
  { file: PRES, need: [/'contextmenu', \(e\) => e\.preventDefault\(\)/, 'a long press on a phone opens no menu while the button is held'] },
  { file: PRES, need: [/document\.addEventListener\('visibilitychange', onHidden\)/, 'a hidden page lets go of a held strain'] },
  { file: PRES, need: [/document\.removeEventListener\('visibilitychange', onHidden\)/, 'the listener goes with the talk'] },
  { file: PRES, need: [/strainStop\(\); stopLapse\(\); procStop\(\); abSlow\(\); handOn = false;/, 'leaving a slide lets go of a held strain'] },
  { file: PRES, need: [/strainStop\(\); stopLapse\(\); procStop\(\); cathStop\(\); abSlow\(\); liveOff = false;/, 'ending the talk lets go of a held strain'] },
  { file: PRES, need: [/if \(strainHeld\) \{ freed = 0; continue; \}/, 'held, the data card keeps following the live model'] },
  { file: PRES, need: [/liveSettled\(now - freed, now - still\)/, 'let go, it follows until the readings have rested (liveSet\'s rule)'] },
  { file: 'src/ui/card-keep.js', need: [/\['compare', 'whatIf', 'strain', 'column', 'scales', 'ask'\]/, 'a card with a strain button is never kept for the next slide'] },
  { file: 'styles/app.css', need: [/\.pz-strain-b \{ touch-action: none; user-select: none;/, 'a long press on the button must not select, scroll or zoom'] },
  { file: 'src/ui/decks.js', need: [/\/\/ {3}strain\s+true or/, 'the slide field is documented where the others are'] },
  { file: 'src/ui/test-decks/demo-all-new-visuals.js', need: [/"id": "r-strain"[\s\S]*?"strain": true/, 'the Testing deck has a slide to try the button on'] },
  // The response control and the hold rail
  { file: PRES, need: [/isResponse\(s\.compare\) \? 'Change how well the beta-blocker works on the live model'/, 'the response buttons are named for a screen reader'] },
  { file: 'src/ui/decks.js', need: [/const withResponse = \(s\) => \(s\.response && !s\.compare \? \{ \.\.\.s, compare: responseButtons\(s\) \} : s\);/, 'a slide with response gets its three buttons when the deck opens; its own compare wins'] },
  { file: MON, need: [/configure\(t\) \{ ids = vitalsShown\(t\); holdLine = t\?\.hold === true;/, 'the vitals tool\'s hold option turns the rail on'] },
  { file: MON, need: [/import \{ MAP_BETA_CUT, SBP_BETA_CUT \} from '\.\.\/engine\/kidney-cuts\.js'/, 'the hold lines are the one MAP and systolic cut-offs, from kidney-cuts.js'] },
  { file: MON, need: [/`MAP <\$\{MAP_BETA_CUT\}`/, 'the rail says what the mean line is'] },
  { file: MON, need: [/`Sys <\$\{SBP_BETA_CUT\}`/, 'the rail says what the systolic line is'] },
  { file: MON, forbid: [/fillText|getContext\('2d'\)/, 'the rail is drawn with the monitor\'s own GPU rectangles and words, no 2D'] },
];
