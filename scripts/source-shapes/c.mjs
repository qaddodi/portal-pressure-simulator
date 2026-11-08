// Source shapes moved out of tests/menu-glass, menus-one-at-a-time, palette-veil and view-key (PR-02).
// first(): a regex that only looks at the text from the FIRST occurrence of `head` on (the tests' indexOf(...) then slice(...) form).
const first = (head, rest) => new RegExp('^(?:(?!' + head + ')[\\s\\S])*' + head + rest);
const PAL_BACK = '\\n\\.pal-back \\{', PAL = '\\n\\.pal \\{';
const SIN_ASK = 'function askSinusoid\\(on\\) \\{(?:(?!\\n {2}\\}\\n)[\\s\\S])*?';   // inside askSinusoid(on) only: up to its closing two-space brace

export default [
  // --- menu-glass ---
  { file: 'src/ui/menu-glass.js', forbid: [/tip\.getAnimations/, 'the present does not read the tooltip\'s animations (getAnimations flushes style)'] },

  // --- menus-one-at-a-time ---
  { file: 'src/ui/util.js', need: [/export function onSurfaceOpened\(fn\)/, 'claimSurface tells main.js which surface opened'] },
  { file: 'src/ui/util.js', need: [/surface = s; s\.armed = false;\n\s*surfaceOpened\?\.\(s\);/, 'claimSurface tells main.js which surface opened'] },
  { file: 'src/ui/util.js', need: [/const me = \{ close: closePopover, has:[^}]*anchor, el, box:/, 'every surface that claims the keys says its box and what opened it'] },
  { file: 'src/ui/menu.js', need: [/const surf = \{ anchor, get el\(\) \{ return el; \}, box:/, 'every surface that claims the keys says its box and what opened it'] },
  { file: 'src/ui/why.js', need: [/const me = \{ get anchor\(\) \{ return anchorEl; \}, el: pop, box:/, 'every surface that claims the keys says its box and what opened it'] },
  { file: 'src/ui/main.js', need: [/onSurfaceOpened\(cardsAway\);/, 'main.js sends away the cards under a surface when one opens'] },
  { file: 'src/ui/main.js', need: [/if \(s\.anchor && el\.contains\(s\.anchor\)\) \{ under = true; continue; \}/, 'main.js sends away the cards under a surface, but not the card it came from'] },
  { file: 'src/ui/main.js', need: [/if \(!panelShown\(\)\) surfacesAway\(\);/, 'main.js puts menus away as a card opens'] },
  { file: 'src/ui/main.js', need: [/if \(instr && !was\) surfacesAway\(\);\n\s*if \(instr && !was\) giveWay\('dock'\);/, 'main.js puts menus away as a card opens'] },
  { file: 'src/ui/main.js', need: [/if \(s\.anchor && el\.contains\(s\.anchor\)\) \{ under = true; continue; \}/, 'a menu opened from inside a card, over it, keeps a plain fill so the card does not show through'] },
  { file: 'src/ui/main.js', need: [/s\.el\?\.classList\.toggle\('over-card', under\);/, 'a menu opened from inside a card, over it, keeps a plain fill so the card does not show through'] },
  { file: 'styles/app.css', need: [/:root:root :is\(\.menu, \.why-pop\)\.over-card:not\(\[data-gl\]\) \{ background: var\(--surface\);/, 'a menu opened from inside a card, over it, keeps a plain fill so the card does not show through'] },

  // --- palette-veil ---
  { file: 'styles/app.css', need: [first(PAL_BACK, ''), '.pal-back rule exists'] },
  { file: 'styles/app.css', forbid: [first(PAL_BACK, '[^}]*background'), '.pal-back paints no veil over the palette\'s glass (its background would dim the frost drawn under it)'] },
  { file: 'styles/app.css', forbid: [first('/\\* Command palette \\*/', '[\\s\\S]*?\\.pal-back[^{]*\\{[^}]*background:\\s*var\\(--scrim\\)'), '.pal-back paints no veil over the palette\'s glass (no scrim background in the palette section)'] },
  { file: 'styles/app.css', need: [first(PAL, '[^}]*--pal-veil: 0 0 0 100vmax var\\(--scrim\\)'), 'the veil is the palette\'s outer shadow'] },
  { file: 'styles/app.css', need: [first(PAL, '[^}]*box-shadow:[^;}]*var\\(--pal-veil\\)'), 'the veil is the palette\'s outer shadow'] },
  { file: 'styles/app.css', need: [/:root:root \.pal\[data-gl\] \{ box-shadow: var\(--pal-veil\); \}/, 'the veil is kept when the GPU draws the glass'] },

  // --- view-key ---
  { file: 'src/ui/lobule-zoom.js', need: [new RegExp(SIN_ASK + 'if \\(fade < 0\\.98 && sv\\.available && store\\.get\\(\\)\\.lobule\\) \\{ sinPending = true; return true; \\}'), 'bug (a): the stage keeps the sinusoid ask in the lobule while it fades in and returns true'] },
  { file: 'src/ui/lobule-zoom.js', forbid: [new RegExp(SIN_ASK + 'store\\.set'), 'the ask writes no store field'] },
  { file: 'src/ui/stage*', need: [/if \(!lz\?\.askSinusoid\(true\)\) setViewKey\('sinusoid'\);/, 'bug (a): the sinusoid is written once, at the landing'] },
  { file: 'src/ui/main.js', need: [/store\.get\(\)\.lobule \? stage\.askSinusoid\(\) : stage\.diveToSinusoid\(\)/, 'the view button asks, it does not write sinusoid: true'] },
  { file: 'src/ui/actions.js', need: [/run: \(\) => CTX\.askSinusoid\(\)/, 'bug (a): the sinusoid action asks, it does not write the store'] },
  { file: 'src/ui/main.js', forbid: [/store\.set\(\{ sinusoid: true \}\)/, 'bug (a): main.js never writes sinusoid: true directly'] },
  { file: 'src/ui/lobule-zoom.js', need: [/if \(quietSin \|\| \(!on && !store\.get\(\)\.lobule\)\) \{ sinTo = 0; cancelFrame\(sinRaf\); sinClock\.stop\(\); return; \}/, 'the lobule closing with the sinusoid open is quiet in one write as it was in two'] },
  { file: 'src/ui/stage*', need: [/else if \(diveWait && morphTarget !== 0\) \{ diveWait = 0; diveGen\+\+; if \(store\.get\(\)\.lobule\) store\.setSoon\(LOBULE_OFF\); \}/, 'bug (b): a turn to the circuit during the dive paint wait ends the wait and the store stops saying lobule'] },
  { file: 'src/ui/stage*', need: [/live\.diveWait === gen && !live\.lobuleOn && live\.diveT === 0/, 'bug (b): the paint-ahead continuation re-checks diveWait === gen, so the called-off wait never dives'] },
  { file: 'src/ui/main.js', need: [/setViewKey\(b\.dataset\.view === 'circuit' \? 'circuit' : 'anatomy'\)/, 'the view buttons write the view through setViewKey'] },
  { file: 'src/ui/main.js', need: [/setViewKey\(viewKey\(\) === 'circuit' \? 'anatomy' : 'circuit'\)/, 'the A key writes the view through setViewKey'] },
  { file: 'src/ui/main.js', need: [/function zoomLobule\(\) \{ stage\.askSinusoid\(false\); setViewKey\('lobule'\); \}/, 'zoomLobule writes the view through setViewKey'] },
  { file: 'src/ui/palette.js', need: [/setViewKey\('anatomy'\)/, 'the palette writes the view through setViewKey'] },
  { file: 'src/ui/palette.js', need: [/setViewKey\('circuit'\)/, 'the palette writes the view through setViewKey'] },
];
