// A tile's name never runs out of its tile (17 Nov 2026, play-test finding 7): the fit goes long name, short name, then wraps. Pattern gone = the code changed: look before editing.
export default [
  { file: 'src/ui/presenter-zoom.js', need: [/for \(const k of allNames\) k\.classList\.remove\('wrap'\)/, 'The fit clears both steps before it measures a tile name again'] },
  { file: 'src/ui/presenter-zoom.js', need: [/for \(const k of wraps\) k\.classList\.add\('wrap'\)/, 'A name still wider than its tile in its short form wraps instead of clipping on both sides ("Liver blood flow, % of healthy" beside "Encephalopathy risk")'] },
  { file: 'styles/app-09-tests.css', need: [/\.pzt-k\.wrap \{ --tk-ws: normal;[^}]*overflow-wrap: anywhere/, 'The wrapped name breaks inside its tile (the one white-space rule reads --tk-ws, so no second !important)'] },
  // The start's "Preparing the slides" cover is whole: the first slide's cards come in under it, and a dimmed (90 %) cover let their words through the loader's own (iPhone play-test, 17 Nov 2026).
  { file: 'styles/app-08-cards.css', need: [/html\.pz-covered :is\([^)]*\.pz-shade[^)]*\) \{ visibility: hidden; \}/, 'While the loading cover is up the slide\'s cards are unseen: no card words under "Preparing the slides"'] },
  { file: 'src/ui/presenter-start.js', need: [/classList\.add\('pz-covered'\)/, 'The cover puts the page in its covered state'] },
  { file: 'src/ui/presenter.js', need: [/classList\.remove\('pz-covered'\)/, 'and the cover\'s lift takes it off, so the cards fade up with the cover'] },
  // The TIPS reading's monitor names the 12 mmHg line a reference, never a target (17 Nov 2026: no guideline in the deck sets a post-TIPS gradient target).
  { file: 'src/ui/tool-reading.js', need: [/targetWord: `reference </, 'The post-TIPS reading says "reference <12", not a target'] },
  { file: 'src/ui/tool-reading.js', forbid: [/targetWord: `target/, 'no "target <12" on the post-TIPS reading'] },
  // The pressure ladder's line names stand on a chip, which moves with the name (F28, 17 Nov 2026).
  { file: 'src/ui/tool-profile.js', need: [/M\.nameChip\[c\] = sv\('rect', \{ class: `ppf-lchip \$\{c\}`, 'data-look': 'prof\.name\.chip'/, 'Each line name has a chip behind it'] },
  { file: 'src/ui/tool-profile.js', need: [/setGeo\(chip, 'opacity', 1\); setGeo\(chip, 'width', cw\)/, 'and the chip is set where the name is'] },
  { file: 'src/ui/tool-profile.js', need: [/setSpans\(spansWant, fp\)/, 'the brackets follow the patient: no HVPG once a stent is in'] },
];
