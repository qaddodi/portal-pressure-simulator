# Motion, polish and heat review

**Build reviewed:** the preview published at 22:28 UTC on 17 Oct 2026, integration branch
`claude/settings-topbar-icon-flvft1` at `8b62ae0` ("Upright iPad: the phone's bottom bar and cards at the deck cards'
70 % of the width…"). Every `file:line` below refers to that commit.

**Goal (the owner's words):** elegant and beautiful; animations perfect and eased; nothing poppy or snappy; nothing pops
in or out of existence, everything glides or fades into place; 120 Hz with the device running cool. The figure keeps
full quality ("0 drop in quality", "120hz persistently", recorded at `src/ui/stage.js:1952-1955`).

---

## How this was reviewed, and what it can't tell you

- **Same build, run locally.** This cloud sandbox cannot open `github.io` (the proxy returns 403), so the same commit was
  built with `npm run build` and served from `dist/`, which is exactly what Pages publishes.
- **Browser runs.** Headless Chromium ran at iPhone (390×844 @3×), upright iPad (820×1180 @2×) and Mac (1440×900 @2×)
  sizes, with a busy patient (decompensated cirrhosis) and a healthy one.
- **A pop detector.** A small script read every UI element on every frame and flagged anything that appeared at full
  opacity, vanished from full opacity, or jumped more than 24 px within a single frame. It ran through a scripted tour:
  - Settings and all four themes;
  - the Treat, Tests (switching a tab), History and Layers cards, and the Patients menu;
  - Circuit → Lobule → Anatomy;
  - a vessel tap, play/pause and a patient change;
  - the Doppler talk: start, four slides forward, one back, then exit.
- **Counters.** DevTools counted style recalcs, layouts, DOM mutations and WebGL calls. The physics engine was timed on
  its own in Node.
- **Code reading.** Three line-by-line audits covered motion, render loops and CSS/compositing. Every claim used here was
  re-checked against the code.
- **Evidence labels.** "**measured**" means seen in the browser, "**code**" means verified by reading, and "**likely**"
  means a device must confirm it.

**Limits.** The sandbox has no GPU: WebGL is drawn on the CPU, so frame rates, GPU time and temperature cannot be
measured here. Figures in ms/s are relative costs on that machine. Use them to rank work and to compare builds, not as
device numbers. Phase 0 below measures the real devices.

---

## The short version

**What is already right.**
- One frame scheduler for the whole app (`src/ui/frame.js`).
- The figure stops drawing when paused and nothing moves (measured: no draws once easing ends).
- Every motion follows elapsed time, so it is correct at 120 Hz. No 60 Hz assumptions were found.
- Only changed vessels are redrawn.
- The physics runs in a worker, and its arrays are transferred rather than copied.
- The always-on pills no longer use live blur (`styles/app.css:3102`).

**Where the heat comes from.**
1. **Work repeated on every display frame** that needs to happen ten times a second or less:
   - vessel widths that never stop easing, because breathing keeps re-targeting them;
   - the lobule rebuilding its paths and reading layout every frame;
   - the Tests traces repainted in full at 3× density.
2. **Work nobody can see:**
   - the figure keeps animating at full rate under the Patients menu and other sheets that cover it;
   - a spinner turns at opacity 0;
   - full-screen layers and WebGL contexts are kept alive before they are needed.
3. **Live frosted glass over a picture that changes every frame.** A 16 px backdrop blur sits on the presenter's cards
   (nested two deep on iPhone), on every lobule label pill and on the toasts. Each blur is recomputed every frame. It is
   **on by default**, and its switch is hidden during a talk.
4. **The platform caps Safari at 60 Hz.** Safari on iPhone, iPad and Mac caps page animation at about 60 fps by default,
   even on ProMotion screens (see §0). The JavaScript-driven figure cannot reach 120 Hz in Safari unless that setting is
   changed.

**Why things pop.** The design token `--ease` is used 367 times, but alongside it there are about 50 durations and 9
curves. Exits use the entrance curve. The reduced-motion rule switches every transition off, which makes everything
pop. About 25 places still hard-cut:
- the theme switch and leaving a talk;
- the modal, History card and vessel card, which all close instantly;
- the zoom pill (jumps 412 px);
- the credit line;
- legends, tab panes, readouts and the play/pause icon.

### The ten things to do first

| # | Item | Why it matters | Effort | Look changes? |
|---|------|----------------|--------|---------------|
| 1 | **H1**: vessel widths never settle, so the whole figure update runs every frame | ~1.3 ms of script on every frame (VM), doubled at 120 Hz | S | No |
| 2 | **H6**: the figure keeps animating under menus, sheets and dialogs that cover it | Full CPU and GPU cost while invisible | S | No |
| 3 | **H11**: live blur over the moving figure (talks, lobule labels, toasts) | Likely the largest GPU and heat cost during talks on iPhone and iPad | S–M | Barely (solid glass) |
| 4 | **H2**: the lobule rebuilds paths and reads layout every frame | ~4.3 ms of script a frame (VM) | M | No |
| 5 | **H3**: Tests traces repainted whole at 3× every frame | +66 and +103 ms/s (VM) | M | No |
| 6 | **P3**: the reduced-motion rule turns every transition into a pop | Everything pops for those users | S | Yes, better |
| 7 | **P1 + P2**: theme switch and leaving a talk are hard cuts | The most visible pops in the app | S–M | Yes |
| 8 | **P4–P7**: modal, History card and vessel card close instantly; the zoom pill jumps 412 px | Small pops on every use | S | Yes |
| 9 | **M1–M3**: motion tokens, an exit curve, and shared enter/leave/swap helpers | One vocabulary; each later fix becomes a line or two | M | Subtly |
| 10 | **Phase 0**: fix the FPS meter (it clamps at 60) and measure on the devices with Safari's 60 fps setting on and off | Without it, 120 Hz can't be verified | S | No |

Effort: **S** is under half a day, **M** is one to two days.

---

## 0. 120 Hz on Apple devices: what is possible

- **Safari caps page rendering at about 60 fps by default** on iPhone, iPad and Mac, ProMotion included. That covers
  `requestAnimationFrame`, so the blood, the lobule, chart glides and the presenter's counters are all capped. The switch
  is Settings › Apps › Safari › Advanced › Feature Flags › "Prefer Page Rendering Updates near 60fps". Users report it
  turning itself back on after iOS updates (for example 26.3).
  - A Home Screen copy of the app uses the same WebKit, and so does Chrome on iOS.
  - Chrome on a ProMotion Mac runs `requestAnimationFrame` at 120 Hz, so every per-frame cost below doubles there.
- **Low Power Mode:** WebKit deliberately throttles `requestAnimationFrame` to 30 fps (WebKit bug 215745).
- **Embedded in an LMS:** cross-origin iframes (SCORM players, see `docs/LMS.md`) are throttled to 30 fps on iOS until
  the user interacts.

What this means for the plan:
1. **Make every frame cheaper rather than chasing the number.** On the owner's devices in Safari the figure runs at 60 by
   default. Removing waste (Phase 1) cools the device at 60, and lets 120 hold where the browser allows it.
2. **Move UI motion to the compositor.** Cards, sheets, pills and fades should use CSS transitions or Web Animations on
   `transform` and `opacity` only. Those run off the main thread, so they stay smooth while the page is busy and are the
   motion most likely to reach the screen's full rate.
3. **Fix the meter before measuring.**
   - The debug overlay's graph clamps at 60 (`src/ui/debug.js:69`), so it can never show 120.
   - Its own `requestAnimationFrame` runs forever while any debug option is on (`src/ui/debug.js:36-39`), which keeps
     the display at full rate and adds heat during the very measurement it is taking.

---

## 1. Heat and frame rate

### 1.1 Work done every display frame that need not be

**H1 · Vessel widths never settle, so the full model-frame update runs on every display frame** (code + measured)
- **Where:**
  - `src/ui/stage.js:2332-2335` re-targets a width whenever it moves 0.5 px or more, then eases it (τ 0.25 s).
  - While any width eases, `widthEasing` stays true and `animate` calls `update(F)` every frame (`stage.js:7149`).
- **Why it never stops:** breathing swings the caval and hepatic vein widths past 0.5 px on every breath (SVC_RA,
  RHV_IVC, IVC_IS, IVCS_RA, the hepatic veins), in both healthy and diseased patients. The full update covers the vessel
  loop, `syncVeins`, organs, `followHome` and `prepLobule`, and it runs at display rate instead of the ten times a second
  intended at `src/ui/main.js:330`.
- **Cost:** 71–81 ms/s at 60 fps on the VM, about 1.3 ms of every frame, doubled at 120 Hz.
- **Fix, same picture:** add a widths-only path like `syncGlowOnly` that writes only the changed radius rows
  (`setRadii`, `veins-gl.js:1586`) while widths ease, instead of the whole update. Or upload target widths and ease them
  in the shader with a time uniform.
- **Alternative, owner's call:** key widths on the breath- and beat-filtered diameter, as colours already use `Pf`. The
  cava would then stop visibly breathing.

**H2 · The lobule rebuilds its geometry and reads layout every frame** (code + measured: ~4.3 ms of script per frame on
the VM with GL draws stubbed)
- **The radius easing never settles.** The pulse moves its targets (`src/ui/lobule-zoom.js:1552`, `1994`), so the path
  cache keys (`2575`, `2604`) change every frame. Every `Path2D` and every `radiusAt` is then rebuilt.
- **Per-frame reads:**
  - `host.getBoundingClientRect()` (`1589`);
  - a new `matchMedia(...)` object (`1593`);
  - `getComputedStyle(host)` (`1598`);
  - label cache keys built from every `<html>` attribute (`960`) plus `innerHTML` serialisation (`1306`).
- **Fix:**
  - Quantise the radius targets with hysteresis, as the anatomy does with its 0.5 mmHg colour steps, or ease them on
    the GPU.
  - Rebuild the 2D paths only when a model frame arrives.
  - Get the size from a `ResizeObserver` and the styles from the stage's cached `wrapCS`.
  - Keep one `MediaQueryList`, and key labels on a version counter.

**H3 · The Tests traces repaint their whole canvas every frame at up to 3× density** (code + measured: +66 ms/s for the
pressure-time trace and +103 ms/s for the Doppler at 60 fps on the VM)
- **Where:** `src/ui/pressure-time.js:244-249` and `src/ui/doppler.js:918-929`. The density comes from
  `src/ui/util.js:468`, which allows 3× on purpose so the text is crisp.
- **Fix:**
  - Draw the text, axes and grid once, at 3×, on a static layer.
  - Draw the moving trace into its own canvas: append only the new columns when samples arrive (10 Hz), and scroll the
    canvas with a transform or a `drawImage` offset.
  - Draw that moving layer at 2× (the text stays at 3×).

**H4 · The blood's own CPU work per frame** (code + measured: `stepBlood` ~12 ms/s plus ~6.5 ms/s of GL calls at 60 fps
on the VM)
- **Where:**
  - 169 `advanceStream` calls, each allocating an options object;
  - `store.get()` and `keyOnly()` per vessel (`src/ui/stage.js:7027`);
  - `syncEnds` builds a ~1 KB key string every frame (`6994`);
  - `Object.values(E)` arrays in `stepReveals` (`3497`, `3515`);
  - `bloodLook()` allocates and spreads every frame (`7096`);
  - the flow texture is re-uploaded every frame (`src/ui/veins-gl.js:1647`);
  - ~65 uniform and texture-bind calls in `composite` (`veins-gl.js:1718-1810`).
- **Fix:**
  - Compute stream positions in the shader in closed form (start + velocity × (clock − t₀)), uploading per-vessel data
    only on model frames, so each frame sets one `clock` uniform.
  - Cache unchanged uniforms.
  - Keep a persistent list of visible vessels and reuse objects. This also cuts the 4–20 ms/s of garbage collection
    measured on the main thread.

**H5 · Each model frame is one long main-thread task, ten times a second** (code + measured: 2–4 ms on the VM, so likely
6–20 ms on a phone, longer than a 120 Hz frame of 8.3 ms)
- **Where:** `src/ui/main.js:366-389` (`onFrame`) updates store, stage, card, dock, inspector, compare, timeline and
  charts in one go. `charts.update` draws even when the chart is hidden (`src/ui/charts.js:526`).
- **Fix:**
  - On arrival, store the frame and mark surfaces dirty.
  - Apply stage and labels in the next scheduled frame.
  - Spread the panels over the following frames or `requestIdleCallback`.
  - Skip anything not on screen.

### 1.2 Work nobody can see

**H6 · The figure animates at full rate under menus, sheets and dialogs that cover it** (code + measured)
- **Where:** the "covered" check `appEl.classList.contains('home-open')` (`src/ui/stage.js:7114`) is dead code. Nothing
  sets `home-open`; it appears only in `styles/app.css:1207`.
- **Measured:** with the Patients menu open on iPhone (it covers 743 of 844 px under a scrim), the figure kept drawing at
  60 fps and the worker kept publishing.
- **Fix:**
  - While a scrimmed or opaque surface covers most of the figure (the menu sheet, Settings sheet, a modal, Help, the
    palette, a Full card), let the stage loop sleep and skip `stage.update` in `onFrame`, as the lobule already does
    with its `under` path.
  - Nothing visible changes. The blood follows elapsed time with `dt` capped at 0.1 s, so it resumes without a jump.

**H7 · A spinner turns forever while invisible** (code)
- **Where:** `.pz-cover i` runs `pz-spin 1.1s infinite` (`styles/app.css:4186`) inside a full-screen cover that sits at
  opacity 0. An infinite animation keeps the compositor ticking even when everything else is still. `.pz-load` already
  stops its spinner when idle (`4194`); the cover needs the same.
- **Fix:** `animation-play-state: paused` unless `.on`, plus `visibility: hidden` after the fade.

**H8 · Full-screen layers kept alive** (measured by the CSS audit)
- **Where:**
  - `.lz` has `will-change: transform, opacity` permanently (`styles/app.css:1282`) and is hidden only by opacity.
  - `canvas.lz-gl` is allocated even on the home view.
  - `#stageOver` is 1360 px wide on an 820 px iPad because of `overflow: visible` (`2608`).
- **Measured:** 27–34 compositing layers. Estimated backing memory is 69 MB on the phone's home view and 80–119 MB
  during talks (upper bounds).
- **Fix:**
  - Give `.lz:not(.on)` `visibility: hidden`, and set `will-change` only during a dive (`stage.js:1635` already does).
  - Clip `#stageOver` to the viewport.
  - Shrink the lobule canvases to 1×1 when the view is closed.

**H9 · WebGL contexts created before they are needed** (code)
- **Where:** four contexts are live on the phone before the Lobule or Sinusoid views are opened:
  - veins;
  - sinusoid (`src/ui/sinusoid-gl.js:488`);
  - endoscopy (`src/ui/endo-gl.js:213`, through `instruments.js`, with `preserveDrawingBuffer`);
  - the lobule prewarm.
  
  `src/ui/sinusoid-view.js:38` also makes a throwaway WebGL2 context just to test for support.
- **Fix:**
  - Create the sinusoid and endoscopy contexts on first open.
  - Test for support with the veins context that already exists.
  - Release idle contexts after a while.

**H10 · Polling** (code + measured)
- **Where:**
  - Asleep, the stage, lobule and sinusoid each wake every 250 ms to look again (`src/ui/stage.js:7172`,
    `lobule-zoom.js:1562`, `sinusoid-view.js:680`). Measured paused: 4 wake-ups a second, ~0.6 ms/s.
  - The credit line polls every second (`src/ui/credit.js:458`). When it decides to look, it reads the layout of every
    label and organ (`credit.js:135`, `196-226`, `307`).
  - Numbers inside `aria-label`s are rewritten with every model frame: 20–34 writes a second in the lobule
    (`lobule-zoom.js:1000`) and the bottom bar. This churns the accessibility tree, which costs most when VoiceOver is
    on.
- **Fix:**
  - Wake on events only, keeping a 1–2 s safety net.
  - Make the credit event-driven.
  - Update live-number labels at most once a second, or when the rounded value changes.

### 1.3 GPU and compositing

**H11 · Live 16 px backdrop blur over a figure that changes every frame** (code + measured)
- **Where:**
  - The presenter cards: `.pz-shade` `1442`, `.pz-data` `1478`, `.pz-fk` `1582`, `.pz-case` `1792`, `.pz-bar` `1984`,
    `.pz-shade.stack` `2023`, plus `2150` and `5124` (all in `styles/app.css`).
  - Every lobule and sinusoid label pill (`4704`), whether lit or not.
  - Toasts (`3965`) and `.pz-fold` (`5153`), whose fills are already 92–95 % opaque, so their blur can't be seen.
- **Measured:** 2–5 blur layers visible at once in a talk. On iPhone the colour key and nav pill sit *inside* the
  frosted words card, so they blur an already-blurred backdrop. At 3× a 16 px blur samples ~48 device pixels across over
  a megapixel, every frame.
- **The blur mostly frosts blank paper.** The presenter already frames the anatomy clear of the cards.
- **Settings gaps:**
  - The "Blur effect" switch defaults to on (`index.html:23` sets `data-noglass` only from storage).
  - The switch is hidden during a talk (`src/ui/main.js:831`, `845-849`).
  - `prefers-reduced-transparency` keeps the blur on `.pz-shade` (`1447`, `1458`, `2030`) and has no rule at all for the
    label pills, toasts or `.pz-fold`.
- **Fix:**
  - Use one solid glass recipe over the figure: a 92–96 % surface fill with the existing hairline, inner highlight and
    shadow, which reads almost the same.
  - Never blur glass that sits inside glass.
  - Remove the blur where the fill is opaque anyway.
  - Show the switch during talks, and make the reduced-transparency media query apply exactly the `data-noglass` rules.
  - Owner's call: no live blur by default on touch devices.

**H12 · Layout and clipping animated under the blur** (code)
- **Where:**
  - `.pz-shade` transitions `width`, `height` and `top` over 0.45 s, together with blur and a large shadow
    (`styles/app.css:1442`), so every frame re-lays out, repaints the shadow and re-blurs.
  - It also carries `filter: brightness(.9)` in high contrast (`2558`).
  - Phone cards keep a polygon `clip-path` at rest and animate the registered property `--sink` on the main thread
    (`5563-5615`).
- **Fix:**
  - Animate `transform` or `clip-path: inset()` on a layer already at its final size.
  - Express high contrast as a tint variable, not a filter.
  - Apply the card clip only while entering or leaving, or use an `overflow: clip` wrapper and slide with `transform`.

**H13 · The vessel pass's memory bandwidth** (likely; A/B test on a device)
- **Where:** every frame, each vessel pixel reads:
  - the base layer;
  - two 16-byte RGBA16UI g-buffers (`src/ui/veins-gl.js:1335-1337`);
  - the plate, glow and line layers;
  - shimmer noise.
  
  The canvas also uses `preserveDrawingBuffer: true` (`veins-gl.js:1195`), which forces a full-buffer copy for
  compositing every frame.
- **Fix:**
  - Pack the two g-buffers into one RG32UI, and read the join data only where a flag bit says a pixel is near a join.
  - Exit early where a pixel holds no vessel.
  - A/B test `preserveDrawingBuffer: false` with a cheap full pass, in Safari's Web Inspector (Graphics timeline) on the
    iPad.

**H14 · Smaller GPU costs** (code)
- The FibroScan beam carries `filter: blur(5px)` (`styles/app.css:2811`) in an SVG whose waves change every frame. Bake
  the soft edge into its gradient instead.
- The liver nodule path is a 290 KB `d` string rebuilt on every step while the liver eases (`src/ui/stage.js:780`, with
  the outline copies at `774`). Quantise severity (for example to steps of 0.02) and cache the strings.

### 1.4 The physics worker (measured; not the main heat source)

The engine was timed in Node on the VM. On a phone's performance core expect a similar order of magnitude.

| Patient | 1×, pulse on (4 ms steps) | 4×, pulse on (8 ms steps) | Pulse off (20 ms) |
|---------|---------------------------|---------------------------|-------------------|
| Healthy | 11 ms of CPU a second | 23 ms/s | 2.5 ms/s |
| Decompensated cirrhosis | 18 ms/s | 58 ms/s | 3.4 ms/s |
| Right heart failure | 19 ms/s | 35 ms/s | 3.4 ms/s |

At 1× that is about 2 % of one core; 8× roughly doubles the 4× figure.
- **Fix, same physics:**
  - Tick at the publish rate (every 100 ms instead of every 33 ms, `src/worker-core.js:204`), with the same timestep and
    the same number of steps per real second.
  - Pause the worker with the figure while it is covered (H6).
  - The documentation requires the timestep to stay unchanged, and it does.

### 1.5 A motion policy (owner's decision)

Even with the waste removed, the blood animates at the display's rate as long as the model runs, and nothing ever winds
it down. The owner has asked for no drop in quality, so the default stays as it is. A policy could offer:
- **Interaction and glides:** always the full display rate.
- **The steady blood:** keep the full rate (today's behaviour), or cap it at 60 on 120 Hz screens. A/B test this on the
  iPad; a slow shimmer may look the same.
- **No input for a long while** (for example 2 minutes): pause the blood with a small "Paused to keep the device cool"
  chip that resumes on touch. Resolution and detail never drop.
- **Low Power Mode** (detectable: `requestAnimationFrame` arrives every ~33 ms): already 30 fps by the platform, so don't
  fight it.

---

## 2. Things that pop, snap or jump

Ranked by how often a user sees them. "**detector**" means the per-frame scan caught it in the tour.

**P1 · The theme switch is a hard cut** (code)
- **Where:** `applyTheme` (`src/ui/main.js:963`) flips `data-theme`. Only 12 transitions fire, so most surfaces snap
  while a few fade. The WebGL figure repaints in one frame. A full style recalc costs ~51 ms on a desktop CPU.
- **Fix:** `document.startViewTransition(() => applyTheme(t))`, with a 0.45 s crossfade on `::view-transition-old(root)`
  and `::view-transition-new(root)`. Fall back to an instant switch where it isn't supported or under reduced motion.

**P2 · Leaving a talk is a hard cut** (code + detector)
- **Where:** `stop()` removes the presenter root and glass at once (`src/ui/presenter.js:3648`), then drops `presenting`.
  The app chrome, hidden with `display: none` (`styles/app.css:1410-1420`), snaps back.
- **Detector:** the top bar, view dock and zoom pill popped in on exit, and the top bar's box jumped from 100 to 50 px.
- **Fix:**
  - Fade the words card, data card and nav pill out first (`wordsOut()` exists).
  - Bring the chrome back with opacity and a delayed `visibility` instead of `display`.
  - Or wrap the switch in a view transition.

**P3 · Reduced motion turns every transition into a pop** (code)
- **Where:** `styles/app.css:937-939` sets `*{animation-duration:.001s!important; transition-duration:.001s!important}`.
  This overrides the reduced-motion crossfades written on purpose: toast (`4023-4026`), `hvpg-kv` (`2905`), catheter
  label (`2908`), `pz-load` (`4193`).
- **The JavaScript paths also go instant:** `closePopover` (`src/ui/util.js:295`), `leave()` (`main.js:994`) and the
  action card (`card.js:76`).
- **Fix:**
  - Delete the blanket rule.
  - Under reduced motion, remove movement (translate and scale) but keep 150–200 ms opacity fades, as the presenter
    block already does (`2520-2526`).

**P4 · The modal opens animated but closes instantly** (code)
- **Where:** `closeModal()` (`src/ui/util.js:408`) removes `.show`, which means `display: none` (`styles/app.css:810-813`).
  This affects Help, About, deck import and every other dialog.
- **Fix:** add a leaving state that fades the scrim and scales the card (0.96 → 1 in reverse) over 0.2 s, then hide.

**P5 · The History card closes instantly on Mac and iPad in landscape** (code + detector)
- **Where:** `closeHistory` calls `leave(el)` and then sets `el.hidden = true` (`src/ui/main.js:1622-1623`), but the
  `.card-leaving` rule only lists `#panel`, `#treatCard` and `#dock` (`styles/app.css:3806`, and `3812` for reduced
  motion).
- **Fix:** add `#historyCard` to both rules.

**P6 · The desktop vessel card** (code + detector)
- **Where:**
  - It opens in 120 ms (`acIn .12s`, `styles/app.css:963`).
  - Undocked, it closes instantly (`src/ui/card.js:79`).
  - On a new vessel it moves with `left`/`top` (layout) while its body hard-swaps (`card.js:149`).
- **Fix:**
  - Open in 0.24 s.
  - Leave in 0.2 s with `--ease-in`.
  - Move with `translate`.
  - Crossfade the body (the `swap` helper in M3).

**P7 · The zoom pill jumps 412 px when a side card opens on desktop** (measured)
- Opening Treat moved the pill's `right` from 12 px to 424 px within 40 ms, while the figure glided beside it. Only its
  opacity and `translate` are transitioned.
- **Fix:** transition `translate` instead, positioning the pill from the card's width with a transform.

**P8 · The patient-name pill snaps to its new width** (measured)
- On a patient change, `.tb-id` went from 135 to 257 px wide (Healthy → Decompensated cirrhosis) with no transition. The
  rest of the top bar jumps with it.
- **Fix:** FLIP the pill's width with `scaleX` on a backing face (the `.vp-face` approach already used for the view pill)
  and crossfade the name.

**P9 · Figure labels vanish under the Patients menu** (code + detector)
- **Where:** `#labels .lb.under-menu { visibility: hidden; }` (`styles/app.css:5975`), toggled by `labelsUnderMenu`
  (`src/ui/main.js:154-163`). The labels pop out when the menu opens and pop back when it closes.
- **Fix:** fade them over 0.16 s.

**P10 · The credit line pops on almost every action, and moves between top and bottom** (code + detector + screenshots)
- **Where:** `.stage-credit` never animates by design (`styles/app.css:4083-4088`, `src/ui/credit.js`). The detector saw
  it pop out and back on nearly every card open and close. On iPhone it sits above the view pill in one state and under
  the top bar in the next.
- **Fix, owner's call:** give it one fixed home per layout, plus a 0.15 s opacity fade with no glide.

**P11 · The legend and lens name swap instantly while the vessels crossfade over 300 ms** (code + detector)
- **Where:** the legend is rebuilt with `replaceChildren` (`src/ui/main.js:598-610`) and `#colorModeLabel` is set directly
  (`559`, `639`).
- **Fix:** crossfade with the fill-after-fade pattern of `src/ui/figure-key.js:14-27`.

**P12 · The bottom readouts swap groups instantly when leaving the lobule** (detector)
- `#strip .ro-group` changes from "Sinusoids/Portal in" to "HVPG/PPG" in one frame.
- **Fix:** crossfade the two groups.

**P13 · Tests tab switch** (code + detector)
- **Where:**
  - The old pane goes `display: none` at once while the new one fades in (`styles/app.css:2746-2747`, `3491`): a
    one-sided fade.
  - After a swipe, `clearSwipe()` runs before `pick()` (`src/ui/dock.js:422-424`), so the pane that just landed replays
    its entrance and blinks.
- **Fix:** a true crossfade, keeping the outgoing pane absolute while it fades over 150 ms, and no replayed entrance
  after a swipe.

**P14 · The play/pause icon swaps instantly** (code + detector)
- **Where:** `src/ui/timeline.js:284`.
- **Fix:** stack both icons and crossfade them with a 0.8 → 1 scale over 160 ms.

**P15 · Lobule labels pop** (code + detector)
- **Where:**
  - `hidden` and `style.display` toggles (`src/ui/lobule-zoom.js:1296-1297`, `1332`, `1484`).
  - Leaders fade in but cut out (`styles/app.css:1356`).
  - Zone names are removed outright (`lobule-zoom.js:1160`).
  - Label text is rebuilt with `innerHTML`.
- **Fix:** mirror the anatomy labels' `.lb-off` fade (`styles/app.css:186-189`), and set `hidden` only after the fade.

**P16 · The talk's nav pill is rebuilt on every slide** (detector)
- The page counter and buttons are removed and re-created on each slide.
- **Fix:** update the text in place and roll the number.

**P17 · Readouts snap** (code)
- **Where:**
  - Numbers glide only while running and only for small jumps (`src/ui/dock.js:227`), so a paused edit or a treatment
    jumps.
  - The status word, ▲▼ arrows, "vs then" and the value colour all swap instantly (`dock.js:248-268`,
    `styles/app.css:3162-3163`, `src/ui/readouts-pane.js:95-99`, `src/ui/card.js:107-113`).
- **Fix:**
  - Count numbers with the presenter's tweener (`src/ui/presenter.js:371`, moved into `util.js`).
  - Transition colour.
  - Crossfade words and arrows.

**P18 · Lists rebuild whole** (code)
- **Where:** the Changes list (`src/ui/chart.js:71-76`) and the History list (`src/ui/main.js:1603`).
- **Fix:** a keyed update. New rows rise in over 220 ms; removed rows fade and collapse (the `grid-template-rows: 0fr`
  pattern of `.ac-info`) before removal.

**P19 · Toasts** (code)
- **Where:** the queue hard-removes the oldest toast, even one already mid-exit (`src/ui/util.js:100`). The survivor
  jumps (`styles/app.css:831`). The undocked exit uses the default `ease` (`834`).
- **Fix:** close the old toast through its own `close()`, FLIP the rest, and use the tokens.

**P20 · Popovers and small surfaces** (code)
- **Where:**
  - Command palette: no scrim fade, and it closes instantly (`src/ui/palette.js:124`, `128`).
  - "Why?" popover: closes instantly, and its skeleton is swapped for content, which jumps its height
    (`src/ui/why.js:23`, `45`, `52`).
  - Shunt hint card: no exit (`src/ui/main.js:524`, `530`).
  - Projector overlay (`main.js:1709-1716`).
  - Compare banner and badge (`main.js:804-809`).
- **Fix:** the M3 helpers; FLIP the Why? popover's height.

**P21 · Figure pieces** (code)
- **Where:**
  - Circuit junction dots toggle `display` (`src/ui/stage.js:4007`).
  - The catheter and its labels vanish when the HVPG procedure is cancelled (`stage.js:4875-4876`).
  - Shunts and collaterals pop under reduced motion (`stage.js:3466`).
- **Fix:** opacity with `--view-fade`.

**P22 · Scroll jumps** (code)
- **Where:**
  - "Differences" scrolls while its panel is still sliding in (`src/ui/main.js:801`).
  - Help jumps to its section (`main.js:1782`).
  - The tab strip after a swipe (`src/ui/dock.js:424`).
  - The slide list (`src/ui/presenter.js:3266`).
- **Fix:** `behavior: reduce.matches ? 'auto' : 'smooth'`, as `src/ui/menu.js:344` already does.

**P23 · Small ones** (code)
- **Where:**
  - The monitor alarm blinks with `steps(1)` (`styles/app.css:1405`).
  - The History badge appears through `:empty` → `display: none`.
  - `.menu-item:hover` has no transition (`750`), unlike `.um-row`.
  - Doppler stat rows toggle `hidden` when the vessel changes (`src/ui/doppler.js:437-446`).
- **Fix:** ease-in-out pulses and short fades.

---

## 3. One motion vocabulary

### Today
- **Tokens:** `--ease` = `cubic-bezier(.2,.8,.2,1)` is used 367 times, which is good. `--t: .24s` is defined but never
  used. There is no exit curve.
- **Curves:** 9 distinct curves in CSS and JS, plus ~27 transitions that fall back to the browser's `ease`.
- **JS easing copies:** `easeInOutCubic` is copied 5 times, `smoothstep` about 8 times, and there are 4 separate
  exponential easers.
- **Durations:** about 52 distinct durations. 97 transitions run under 180 ms, below the design blueprint's 180–260 ms
  (`docs/DESIGN_BLUEPRINT.md` §5.5): menus at .12 s, the card entrance at .12–.14 s, tooltips at .12 s.
- **Exits use the decelerating entrance curve**, so an element moves fastest in its first frame on the way out. This is
  the main reason closes feel abrupt even where they are animated.

### M1 · Tokens (add to `styles/tokens.css`)

```css
:root {
  --ease-out: cubic-bezier(.2, .8, .2, 1);    /* entering, settling into place (today's --ease) */
  --ease-in:  cubic-bezier(.4, 0, 1, 1);      /* leaving: starts gently, gets out of the way */
  --ease-io:  cubic-bezier(.65, 0, .35, 1);   /* moving from one resting place to another */
  --dur-micro: .16s;  /* hover, press, icon swaps, tiny fades */
  --dur-in:    .24s;  /* menus, popovers, tooltips, cards appearing */
  --dur-out:   .2s;   /* everything leaving: a little faster than its entrance */
  --dur-move:  .32s;  /* sheets, cards and pills gliding to a new place or size */
  --dur-view:  .45s;  /* view, theme and slide crossfades */
}
```

Keep `--ease` as an alias of `--ease-out` so nothing breaks, then sweep the literals onto the tokens.

### M2 · The no-pop contract (put it in `AGENTS.md` once adopted)

1. Nothing appears or disappears without opacity, usually paired with a 4–8 px translate or a 0.96 → 1 scale.
2. Nothing changes size or position without a glide (FLIP or `transform`).
3. Changing content crossfades: fade out about 120 ms, swap, fade in about 200 ms. Numbers count rather than jump.
4. Animate only `transform` and `opacity`, plus `clip-path` on small elements. Never animate width, height, top, left,
   margin, `filter` or `backdrop-filter`.
5. Entrances use `--ease-out` with `--dur-in`. Exits use `--ease-in` with `--dur-out`. Moves use `--ease-io` with
   `--dur-move`.
6. Animations can be interrupted: a reversal mid-way continues from where the element is. CSS transitions and the Web
   Animations API do this; keyframe animations restart.
7. Reduced motion removes movement but keeps short crossfades (150–200 ms). Never 0.001 s.

### M3 · Shared helpers (in `src/ui/util.js`)

Most of the pieces already exist in the codebase:

| Helper | What it does | Based on |
|--------|--------------|----------|
| `enter(el, {from})` / `leave(el, then)` | Fade or slide in and out; set `hidden` or remove only after the exit ends | `main.js:992`, `main.js:1002`, `util.js:289` (`closePopover`) |
| `swap(el, fill)` | Fade out, replace the content, fade in | `figure-key.js:14-27` |
| `flip(els, mutate)` | Measure, change, then glide from the old box to the new | `topbar-motion.js`, `pill-motion.js` |
| `tween(from, to, ms)` | Count a number to its new value | `presenter.js:371` (`tweener`) |
| `easing.js` | One copy each of `easeInOutCubic`, `smoothstep` and an exponential easer, replacing the duplicates | |

### M4 · Platform features that remove most of the timers

Safari 18+ and Chrome 117+ support all three of these:
- **`@starting-style` with `transition-behavior: allow-discrete`.** An element toggled with `[hidden]` or a class can
  fade in and out with no JavaScript timers. The global `[hidden]{display:none!important}` (`styles/app.css:35`) needs an
  exception for elements that animate out.

  ```css
  .sheet { transition: opacity var(--dur-in) var(--ease-out), translate var(--dur-in) var(--ease-out),
                       display var(--dur-out) allow-discrete; }
  .sheet.is-closed { display: none; opacity: 0; translate: 0 12px;
                     transition-timing-function: var(--ease-in); transition-duration: var(--dur-out); }
  @starting-style { .sheet:not(.is-closed) { opacity: 0; translate: 0 12px; } }
  ```

- **View Transitions** for the theme switch (P1), view switches and entering or leaving a talk (P2). The canvases are
  snapshotted, so the WebGL figure crossfades too.
- **`@property`** to register lengths that should glide, for example `--cmp-h` for the compare banner.

---

## 4. Visual polish

- **V1 · Labels collide on iPhone.**
  - "Right sinusoids 7.2 mmHg" sits on its own vessel, and "RIGHT ATRIUM" crowds "Right hepatic vein".
  - After switching to decompensated cirrhosis, "Varices 18.6 mmHg +11.2" touches the right edge of the screen.
  - On the Mac, "IVC 3.9 mmHg" sits on the right atrium.
  - The pressure-profile axis names ("Portal vein", "Portal venule") overlap on iPhone.
- **V2 · One glass recipe.** Settle a single solid-glass surface for cards over the figure (H11) and use it everywhere.
  Glass inside glass reads muddy as well as costing GPU time.
- **V3 · Tests › HVPG on iPhone.** Before a measurement, a large empty black monitor dominates a light screen. Use a
  lighter empty state, or a faint placeholder trace with the hint.
- **V4 · Type.**
  - `font-weight: 700` is used 31 times, and weights 540 and 650 also appear, against the 400/500/600 rule
    (`styles/tokens.css:144`).
  - Source Serif 4 is declared for 400–600 only, so 700 headings (`styles/app.css:1941`, `1953`) can't render as
    designed.
  - Inter has no metric-matched fallback (`size-adjust`), so text reflows when the font arrives.
  - The serif is preloaded on every visit although only Home and slides use it.
- **V5 · Token drift.** There are 61 distinct radii (140 of 300 use tokens), 67 distinct shadows (46 of 140 use tokens)
  and the glass shadow is written out six times. Add `--r-label`, `--r-card-lg`, `--shadow-glass`, `--glass-tint` and
  `--glass-solid`, then sweep.
- **V6 · iOS details.**
  - `100vh` in `.action-card` (`styles/app.css:966-969`) and `.app-menu` (`3410`) should be `dvh`.
  - `-webkit-tap-highlight-color: transparent` should be set on `html`, so tappable divs don't flash a square grey box
    on rounded glass.
- **V7 · The Soft theme is thin.** It has 4 selectors against 19 for dark. `--knockout` and the glass edge and drop
  aren't tuned for it.
- **V8 · CSS weight.** The bundle is 467 KB raw (83 KB gzipped) in 4,436 rules. Presenter rules are 131 KB of that. The
  dark theme is written twice, 229 selectors are redefined later in the file, and there are 146 `!important`s.
  - The head script already resolves the theme: always write it to `data-theme`, so only one dark block is needed.
  - Use a `.lit` class instead of the 3 KB `data-lit` selector lists.
  - Use `@layer` to retire `!important`.
  
  Smaller CSS makes the theme switch and every class toggle cheaper.

---

## 5. Next steps

Each phase is one or more passes of the preview loop in `AGENTS.md`: `npm run lint && npm test`, screenshots at iPhone,
iPad and Mac sizes, push to a `claude/<name>` preview branch, merge into the integration branch to publish `/preview/`,
then the owner tests on laptop, iPad and iPhone.

### Phase 0 · Measure on the devices (S)
- **Fix the meter.**
  - The `?debug` FPS graph should scale to the screen's rate (`src/ui/debug.js:69`).
  - It should sample through `frame.js` instead of running its own endless `requestAnimationFrame`
    (`debug.js:36-39`).
  - It should show ms per frame for each surface from `window.pps.perf`.
- **Owner's device runs.** On the iPhone and iPad in Safari, with "Prefer Page Rendering Updates near 60fps" on and then
  off, and on the Mac in Safari and Chrome, run 2 minutes each of:
  - anatomy running;
  - the lobule;
  - Tests › Doppler open;
  - a talk (Doppler, slides 1–5).

  Note fps, warmth by hand, and battery % over 10 minutes. For the GPU, Safari's Web Inspector Timelines can be used
  over a cable.
- **Wider CI report.** Add to `npm run perf:frames` the Patients menu open and a talk slide, so H6 and H11 show up in
  the CI report.

### Phase 1 · Same picture, less work (M; no visual change)
- **Items:** H1, H2, H3, H4 (uniform caching and allocations first, the shader-clock rewrite after), H5, H6, H7, H8,
  H9, H10, H14, the worker tick (§1.4) and the debug loop.
- **Done when:**
  - The visual references are unchanged.
  - `npm run perf:frames` shows the stage's script time with the model running at least 50 % lower, and the lobule's at
    least 50 % lower.
  - With the Patients menu open, the stage draws no frames.
  - The device runs in Phase 0 repeat cooler and steadier.

### Phase 2 · The glass diet (S–M; looks nearly the same)
- **Items:** H11, H12, the reduced-transparency mapping, and the switch shown during talks.
- **Ask the owner:** should touch devices default to solid glass?
- Run the "Visual references" workflow on the branch, since the look changes slightly.

### Phase 3 · Motion foundation (M)
- **Items:** M1 tokens, M3 helpers, M4 `@starting-style` and View Transitions, and the P3 reduced-motion fix.
- Sweep the menu, card and tooltip durations onto the tokens, with exits on `--ease-in`.

### Phase 4 · Remove the pops (M–L, in this order)
1. P1 and P2.
2. P4–P7.
3. P9, P11–P14.
4. P17.
5. P10 (after the owner decides on the credit).
6. P15, P16, P18–P23.

Check each with the detector (§6) and the owner's eyes.

### Phase 5 · Polish (ongoing)
V1–V8, the token sweep and the CSS clean-up.

### Decisions only the owner can make
- The ambient blood rate and the idle pause (§1.5).
- Solid glass as the default on touch devices (H11).
- A fixed home for the credit line (P10).
- Whether the cava should visibly breathe (the H1 alternative).

---

## 6. Guard rails, so it stays this way

- **A no-pop browser check (`tests/e2e/no-pop.mjs`).** It works at any frame rate, so it fits CI machines without a
  GPU.
  - When an element becomes visible (`hidden` removed, `display` or `visibility` changed, or added to the DOM), it, or an
    ancestor, must have a running animation or transition (`el.getAnimations()`) in that same frame.
  - When an element is about to be hidden or removed while visible at full opacity, a `MutationObserver` checks that an
    exit animation is running.
  - Drive it through the tour used for this review, with an allowlist for deliberate cuts.
- **Style lint.** Use stylelint, or a small script in `npm run lint`, to reject:
  - `transition: all`;
  - transitions on layout properties;
  - raw `cubic-bezier` or durations outside the tokens;
  - `backdrop-filter` outside the one glass utility.
- **Frame budgets in CI.** `scripts/frame-cost.mjs` already reports per surface. Add soft budgets so a regression is
  flagged as a warning, as the visual check does.
- **Agent rules** (add to `AGENTS.md`):
  - No new `requestAnimationFrame` loops outside `frame.js`.
  - No live blur over the figure.
  - Every new show or hide uses the helpers and tokens.
  - Every new per-frame path states its idle condition.

---

## Appendix · Measurements and sources

**DOM writes once settled** (iPhone size, decompensated cirrhosis, running; per second)

| View | DOM writes | Main sources |
|------|------------|--------------|
| Anatomy | ~120 | Bottom-bar styles and labels, vessel gradient stops, a few paths |
| Circuit | ~160 | The same |
| Lobule | ~230 | Bottom-bar styles (~3 per frame), lobule labels, `aria-label`s at 34/s |

None of these target covered layers.

**Paused:** once easing finished, the figure stopped drawing (checked over 48 s) and woke 4 times a second to look again.

**WebGL uploads:** in steady state, uploads were small and tied to model frames (radius, tube and flow rows, ~9 KB/s).
The organ plate (~6 MB) is uploaded once, in strips, after load.

**Pop detector:**
- **What it checks:** each frame, every element's effective opacity (its own multiplied by its ancestors'), its
  `display` and `visibility`, and its box. An appearance at over 0.9 opacity, a vanishing from over 0.9, or a jump of
  more than 24 px in one frame is flagged.
- **What counts as evidence:** the VM's frame rate fell to 1–10 fps during talks, so only events that repeated at a
  usable rate, or that the code confirms, are cited above. Sheets that slide in from off-screen are not counted as pops.

**Safari behaviour sources:**
- [MacRumors: enable 120Hz browsing in Safari](https://www.macrumors.com/how-to/enable-smoother-120hz-browsing-in-safari/)
- [Report that iOS 26.3 re-enabled the 60 fps flag](https://www.threads.com/@techwitheugene/post/DUvAva7E0Zg/if-youve-updated-to-i-os-and-safari-doesnt-feel-as-smooth-anymore-this-is)
- [WebKit bug 215745: Low Power Mode throttles requestAnimationFrame to 30 fps by design](https://bugs.webkit.org/show_bug.cgi?id=215745)
- [Popmotion: iOS throttles cross-origin iframes to 30 fps](https://popmotion.io/blog/20180104-when-ios-throttles-requestanimationframe)
- [Motion.dev: when browsers throttle requestAnimationFrame](https://motion.dev/blog/when-browsers-throttle-requestanimationframe)
