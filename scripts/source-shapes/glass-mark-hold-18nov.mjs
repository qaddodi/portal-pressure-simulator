// A card's first mark waits for its glass to be on screen (18 Nov 2026, Mohammad: "all vessel and tips etc cards show text before card still"): the card shows a translucent paper (data-gl-wait) from its
// first frame, kept until two animation frames after its glass was drawn, then taken off (glass-gl.js applyMark; tests/glass-mark-hold.test.js). Source shapes (PR-02).
const W = 'A card has its paper until its glass is presented (18 Nov 2026):';
export default [
  { file: 'src/ui/glass-gl.js', need: [/requestAnimationFrame\(\(\) => requestAnimationFrame\(go\)\);/, `${W} two animation frames after the draw`] },
  { file: 'src/ui/glass-gl.js', need: [/if \(holding\.has\(g\)\) continue;/, `${W} the wait pass leaves a held card's paper alone`] },
  { file: 'src/ui/glass-gl.js', need: [/if \(\(waiting\.has\(p\.g\) \|\| !wasDrawn\.has\(p\.g\)\) && typeof requestAnimationFrame === 'function' && markHold\) holdMark\(p\.g, mk\);/, `${W} a first mark is held`] },
  { file: 'styles/app-11-deck-visuals.css', need: [/\[data-gl-wait\]:not\(\[data-gl\]\) \{ background: var\(--gl-paper\); \}/, `${W} the wait shows paper, never a bare card`] },
  { file: 'styles/app-03-layouts.css', need: [/--gl-paper: color-mix\(in srgb, var\(--surface\) 55%, transparent\);/, `${W} the paper's strength`] },
  { file: 'styles/app-11-deck-visuals.css', need: [/html\.thumb-ui \{ --gl-paper: var\(--gl-solid\); \}/, /html\.thumb-ui \.has-plate\.has-plate > \.sheet-plate\.sheet-plate\.sheet-plate\[data-gl\],[\s\S]{0,200}\{ background: var\(--gl-solid\); \}/, `${W} on a phone a card keeps an 84 % backing under its words whether or not the frost is presented (Mohammad, 18 Nov, the iPhone: the figure through the Portal vein card)`] },
  { file: 'src/ui/card.js', need: [/if \(!pinH && el\.classList\.contains\('ac-in'\) && el\.classList\.contains\('docked'\) && !el\.hidden\) \{ pinH = readMetric\(el, 'offsetHeight'\);/, /if \(pinH\) \{ pinH = 0; releasing = true; el\.style\.height = ''; setTimeout\(\(\) => \{ releasing = false; \}, 400\); \}/, `${W} a phone's card holds its first measured height while it comes in and lets go with the glide`] },
  { file: 'src/ui/card.js', need: [/if \(el\.hidden && !leaving && !prepOn\) prepBegin\(\);/, /const up = !widgetsPending\(el\) && document\.fonts\?\.status !== 'loading', late = performance\.now\(\) - prepAt >= PREP_MAX_MS;/, `${W} a card coming up from nothing is built hidden (ac-prep) and opened once its widgets are drawn and its fonts are in, at most PREP_MAX_MS`] },
  { file: 'src/ui/card.js', need: [/if \(prepOn\) \{ prepEnd\(\); el\.hidden = true; \}/, `${W} a card closed while still being built is never shown`] },
  { file: 'styles/app-03-layouts.css', need: [/\.action-card\.ac-prep \{ visibility: hidden; pointer-events: none; \}/, `${W} the card being built is laid out and not seen`] },
  { file: 'src/ui/main.js', need: [/switchIn\(el\); enterWhenReady\(el, NOOP\); \};/, `${W} Treat, History and every sheet that arrives are held until their widgets are drawn`] },
  { file: 'src/ui/util.js', need: [/const cancelEnter = enterWhenReady\(el, \(\) => \{ if \(el\.isConnected && asSheet\) rideIn\(/, `${W} a menu's ride waits for its widgets too`] },
  { file: 'styles/app-03-layouts.css', need: [/\.prep-hold, \.prep-hold > \* \{ visibility: hidden !important; animation: none !important; \}/, `${W} the hold: laid out, not seen, nothing animating`] },
];
