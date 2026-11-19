// Pins from the readout and deck-exit thread (16 Nov 2026), moved out of source-regex tests (PR-02). Pattern gone = the code it guarded changed: look before editing the rule.
const CLIP = /clipboard\??\.write(Text)?\(|execCommand\(\s*['"](copy|cut)['"]/g;
// file -> [how many writes, the control the user taps that runs each]
const COPY_ALLOWED = { 'src/ui/frame-hud.js': 1, 'src/ui/presenter-library.js': 1, 'src/ui/main.js': 2, 'src/ui/perf-readout.js': 2, 'src/ui/lap.js': 2 };
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
export default [
  // slide counter: one source for the bar's count and the reader's line
  { file: 'src/ui/presenter-scales.js', forbid: [/`\$\{i \+ 1\} \/ \$\{n\}`/, 'The slide count is slideCount() in slide-say.js, never a second copy (the count and the reader\'s line disagreed on a case card)'] },
  { file: 'src/ui/presenter-scales.js', forbid: [/`Slide \$\{i \+ 1} of/, 'The reader\'s "Slide x of n" line is slideSay() in slide-say.js, never a second copy'] },
  { file: 'src/ui/presenter-scales.js', need: [/slideSaid\(\{ want: live\.want, card: live\.caseCard \}\)/, 'A case card up counts as the slide being on screen, so the reader hears it with the visible count'] },
  { file: 'src/ui/presenter-case.js', need: [/live\.caseCard = \{ c, ms, lifted: false, i: live\.want \}/, 'The case card is tagged with its slide, so slideSaid can tell which slide it belongs to'] },
  // deck exit restores History and the undo stack with the patient
  { file: 'src/ui/presenter-start.js', need: [/history: patientHistory\?\.save\(\) \?\? null/, 'A talk captures History and the undo stack at its start'] },
  { file: 'src/ui/presenter-start.js', need: [/if \(b\.history\) patientHistory\?\.load\(b\.history\)/, 'and puts them back on the way out, with the patient'] },
  { file: 'src/ui/timeline.js', need: [/tlGen\+\+/, 'timeline.load drops the timers of the history it replaces (a snapshot asked for later, an edit still being typed)'] },
  // clipboard: written only behind a control the user taps
  { file: 'src/ui/main.js', scan: (t) => { const n = (code(t).match(CLIP) || []).length; return n === COPY_ALLOWED['src/ui/main.js'] ? [] : [`${n} clipboard writes, ${COPY_ALLOWED['src/ui/main.js']} allowed (share(): the menu's "Copy link to this view" and the search card's "Copy share link"; sendFeedback(): the "Copy the full report" button). Nothing copies by itself (a patient pick wrote the clipboard in a play-test, 16 Nov 2026)`]; } },
  { file: 'src/ui/frame-hud.js', scan: (t) => ((code(t).match(CLIP) || []).length === 1 ? [] : ['the HUD\'s Copy button is its one clipboard write']) },
  { file: 'src/ui/presenter-library.js', scan: (t) => ((code(t).match(CLIP) || []).length === 1 ? [] : ['a deck row\'s Copy link is its one clipboard write']) },
  { file: 'src/ui/perf-readout.js', scan: (t) => ((code(t).match(CLIP) || []).length === 2 ? [] : ['?perf Copy is its only clipboard write (writeText and its fallback)']) },
  { file: 'src/ui/lap.js', scan: (t) => ((code(t).match(CLIP) || []).length === 2 ? [] : ['?lap Copy is its only clipboard write (writeText and its fallback)']) },
  { file: 'src/ui/menu.js', exactly: [/share\(\)/, 1, 'share() runs from the menu\'s link only'] },
  { file: 'src/ui/palette.js', exactly: [/ctx\.share\(\)/, 1, 'share() runs from the search card\'s command only'] },
  // Readouts tile names wrap, never an ellipsis
  { file: 'styles/app-09-tests.css', need: [/\.rp-tiles \.metric \.k \{ white-space: normal; overflow: visible; text-overflow: clip;/, 'A Readouts tile\'s name wraps and is never cut ("Abdominal per…", 16 Nov 2026)'] },
  // Doppler: Pulsatility is worked out from the Max and Trough shown beside it, and a portal vein's two are its median beat's
  { file: 'src/ui/doppler.js', need: [/pulsatility\(shownV\(hiB\), shownV\(loB\)\)/, 'The Pulsatility tile follows its formula from the rounded numbers beside it (36, 21 and 0.17 did not agree, 16 Nov 2026)'] },
  { file: 'src/ui/doppler.js', need: [/beatwise \? r\.beatHi : r\.vmax/, 'A portal vein\'s Max and Trough are its median beat\'s, the beat Pulsatility and the calipers read'] },
  { file: 'src/ui/doppler.js', need: [/CI: 'Congestion index \(CI\)/, 'CI is spelled out where it is hovered, with the same kind of tooltip as Max'] },
  // the HVPG tracing has a time axis (seconds along its bottom, numbers where they clear the stage words)
  { file: 'src/ui/hvpg-proc.js', need: [/secs: true,/, 'The HVPG tracing\'s script asks for the seconds axis (tester, 16 Nov 2026: only stage words along the bottom)'] },
  { file: 'src/ui/monitor.js', need: [/if \(S\.secs\) \{/, 'The catheter monitor draws a seconds axis for a script that asks for one'] },
  // the traces start over with the viewer's own patient when a talk ends
  { file: 'src/ui/presenter-start.js', need: [/restartTraces\?\.\(\);/, 'The Over time and Doppler traces start over when the viewer\'s own patient comes back after a talk (the talk\'s last patient was drawn for 15 s, 16 Nov 2026)'] },
  { file: 'src/ui/doppler.js', need: [/Math\.abs\(BEAT_MEAN\[i\] - level\) < Math\.abs\(BEAT_MEAN\[pick\] - level\)/, 'The typical beat is the one nearest the window\'s mean, so Max and Trough stand either side of the Speed shown'] },
  // the pin toasts do not repeat the compare bar's label
  { file: 'src/ui/timeline.js', forbid: [/toast\(`Comparing with/, 'The toast that pins a moment does not repeat the label the compare bar shows'] },
];
