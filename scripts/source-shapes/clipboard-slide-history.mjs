// Source shapes moved out of tests (16 Nov 2026, PR-02): clipboard-only-on-copy, slide-say and talk-exit-restores-history kept these as source reads; the
// behaviour they check stays in the tests, each rule here keeps its reason.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => relative(ROOT, f).split('\\').join('/'));

// The app writes to the system clipboard only when the user asks to copy (play-test 16 Nov 2026: the clipboard was written after picking a patient).
// Every write in src/ is listed with the control that asks for it; a new write anywhere else fails until it is added with its control, so nothing
// can copy by itself (on a pick, a load, a frame or a timer).
const WRITE = /clipboard\??\.write(Text)?\(|execCommand\(\s*['"](copy|cut)['"]/;
const ALLOWED = {
  'src/ui/frame-hud.js': [1, "the HUD's Copy button (copyB.onclick)"],
  'src/ui/presenter-library.js': [1, "a deck or script row's Copy link button"],
  'src/ui/main.js': [1, 'share(): the menu\'s "Copy link to this view" and the search card\'s "Copy share link"'],
  'src/ui/perf-readout.js': [2, '?perf Copy button (writeText, then its select-and-copy fallback)'],
  'src/ui/lap.js': [2, '?lap Copy button (writeText, then its select-and-copy fallback)'],
};
const clipboard = files.map((file) => (ALLOWED[file]
  ? { file, uncss: true, uncomment: true, exactly: [new RegExp(WRITE.source, 'g'), ALLOWED[file][0], `${ALLOWED[file][0]} clipboard write(s) expected, each behind a control the user taps: ${ALLOWED[file][1]}`] }
  : { file, uncss: true, uncomment: true, forbid: [WRITE, 'writes to the system clipboard: only a control the user taps may (add it to scripts/source-shapes/clipboard-slide-history.mjs with that control, or remove the write)'] }));

export default [
  ...clipboard,
  // share() runs only from the menu's link and the search card's command.
  { file: 'src/ui/menu.js', uncss: true, uncomment: true, exactly: [/share\(\)/g, 1, "share() is called once in the menu: the 'Copy link to this view' item"] },
  { file: 'src/ui/menu.js', need: [/onclick: \(\) => \{ close\(\); share\(\); \}/, 'the menu link is the only caller, and it is a tap'] },
  { file: 'src/ui/palette.js', uncss: true, uncomment: true, exactly: [/ctx\.share\(\)/g, 1, "the search card's 'Copy share link' command is the only other caller"] },

  // The bar's count and the reader's line are one source (slide-say.js): no second copy of either in the presenter.
  { file: 'src/ui/presenter-scales.js', forbid: [/`\$\{i \+ 1\} \/ \$\{n\}`/, 'a second copy of the bar count: it is slideCount() in slide-say.js'] },
  { file: 'src/ui/presenter-scales.js', forbid: [/`Slide \$\{i \+ 1} of/, "a second copy of the reader's line: it is slideSay() in slide-say.js"] },
  { file: 'src/ui/presenter-scales.js', need: [/slideCount\(i, n\)/, 'the bar takes its count from slide-say.js'] },
  { file: 'src/ui/presenter-scales.js', need: [/slideSay\(i, live\.slides\.length/, "the reader's line takes the slide number from slide-say.js"] },
  { file: 'src/ui/presenter-scales.js', need: [/slideSaid\(\{ want: live\.want, card: live\.caseCard \}\)/, 'a case card tells the reader only for the slide it came up for'] },
  { file: 'src/ui/presenter-case.js', need: [/live\.caseCard = \{ c, ms, lifted: false, i: live\.want \}/, 'the card is tagged with its slide'] },
  { file: 'src/ui/presenter-case.js', need: [/announce\(\);/, 'the reader is told once the card is up'] },

  // Closing a talk puts back the viewer's own History list and undo stack along with the patient (the Demo deck left six entries in History).
  { file: 'src/ui/presenter-start.js', need: [/history: patientHistory\?\.save\(\) \?\? null/, "the History and undo stacks are captured at the talk's start"] },
  { file: 'src/ui/presenter-start.js', need: [/if \(b\.history\) patientHistory\?\.load\(b\.history\)/, 'and put back on the way out'] },
  { file: 'src/ui/main.js', need: [/patientHistory: \{ save: \(\) => \(\{ timeline: timeline\.save\(\), stacks: saveHistory\(\) \}\), load: \(k\) => \{ loadHistory\(k\.stacks\); timeline\.load\(k\.timeline\); \} \}/, 'the presenter is handed both the timeline and the undo stacks to keep and restore'] },
  { file: 'src/ui/timeline.js', between: ['load: (s) => {', '\n    },'], need: [/clearTimeout\(pending\.timer\)/, 'an edit still being typed in is not recorded into the restored list'] },
  { file: 'src/ui/timeline.js', between: ['load: (s) => {', '\n    },'], need: [/tlGen\+\+/, 'a snapshot an entry of the deck asked for later is dropped'] },
];
