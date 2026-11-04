# Working instructions for all coding agents

## Preview workflow (always follow)

The owner tests every change on laptop, iPad and iPhone before it goes to `main`.
Work happens in the cloud; previews are published to GitHub Pages.

- **Live site:** https://qaddodi.github.io/portal-pressure-simulator/ (tip of `main`)
- **Preview:** https://qaddodi.github.io/portal-pressure-simulator/preview/
  Only `main` and the integration branch `claude/settings-topbar-icon-flvft1` publish; other
  `claude/**` pushes are checked but leave the preview alone, so merge into the integration
  branch to preview. Pushing it triggers `.github/workflows/pages.yml`, which republishes
  the live site at `/` and that branch at `/preview/` (about a minute or two).
  Pushing `main` republishes both from `main`, so after a merge `/preview/` equals the live site
  (still badged, "PREVIEW · main <commit>", so it stays recognisable as the preview).
  `/preview/preview-info.txt` shows which branch and commit the preview was built from.
  Do not publish preview artifacts.
- **Preview badge:** a branch preview shows an orange "PREVIEW · <commit>" pill at the top
  centre (the page title is left as is), so the owner knows which build they are on. It is
  injected at deploy time by `scripts/preview-badge.mjs` (on every `/preview/` build, `main` included),
  never committed to the source, so nothing has to be removed on merge.
- **Preview branch:** work on your own one-level `claude/<name>` branch (include `preview`
  in the name), never commit or push directly to `main`. Keep the `claude/` prefix for every
  coding agent; do not add `codex/` branches without changing both deployment rules.

Loop for every change (fast previews first, full tests before merge):
1. Make the change and run `npm run lint && npm test` (seconds), then `npm run gate` (the pre-push gate, `scripts/gate.mjs`, a few
   minutes): it fails on a conflict marker, an import that does not resolve, a page that does not boot, a deck slide change that does
   not end whole (card frozen mid-fade, glass never arriving, camera still gliding), a Circuit/Anatomy/Lobule switch that does not
   settle, a missing diaphragm, labels that do not follow a pan or zoom, and a rest view that drifts from `tests/visual/`. A thread pushes only
   when it passes (`--only static,slides` for a quick run on a deck change; `--decks hvpg` narrows it). CI runs it only on request
   (`gate.yml`: `[gate]` in a commit message, or `[gate-full]` to run every slide on desktop and phone too). Details: header of `scripts/gate.mjs`. Do not run the browser
   checks (`npm run smoke`) or `npm run check` locally at this stage. For any UI change, also
   take screenshots of the intended behaviour in the running app before pushing: phone
   (390x844, deviceScaleFactor 3), iPad and desktop where the change applies. Check them
   against the request, and do not report a fix as done without that check. Keep the
   screenshots outside the repo (the scratchpad).
2. Commit and push to the preview branch. The preview deploy (`pages.yml`) does not wait for lint and unit
   (about a minute to live); they run beside it in `quick.yml` as a warning, so a red one is fixed in a follow-up
   push. A red "Pages (live site + preview)" run means the preview did not publish. Check it finished (GitHub
   Actions tools), then tell the owner the preview URL. The browser checks (`checks.yml`) run only on request:
   `[checks]` in a commit message, or the Actions tab.
3. The owner tests on their devices and reports anything broken; repeat steps 1-2 quickly.
4. When the owner is happy, run the full `npm run check` (lint, unit, build, smoke, smoke:dist),
   fix anything it finds, and recommend any tests worth adding for the new behaviour.
   The full CI (`ci.yml`) also runs every check on pull requests and on `main`, split over
   parallel runners (source site and build, desktop in twenty-eight shares and phone in fourteen, plus the visual
   check per device). A browser check that failed only by timing out gets one more try
   (`SMOKE_RETRIES`); any other failure counts at once.
   Visual references (`tests/visual/`): the browser checks compare the look (job `visual` in
   `browser.yml`, called by `checks.yml` and `ci.yml`). On the preview (`checks.yml`) a drift is a warning with the diffs as an artifact; in `ci.yml` it blocks
   the merge. If your change is meant to alter a view, run the "Visual references" workflow on your
   branch right after pushing it (GitHub Actions API: run `visual-refs.yml` on the branch). It
   redraws only the drifted views on CI's machines and commits them as "Visual references redrawn
   on CI: <views>"; pull before your next push. Never run it to silence a drift you did not intend.
   To redraw them all by hand (rarely needed), run `npm run visual -- --update`.
   Frame time and input latency (`scripts/frame-gate.mjs`, limits in `scripts/perf-limits.json`): the production build is driven as a
   person does on the laptop and phone profiles (a pan, a pinch, a camera glide, Next through a deck, a verb, a lens switch, the
   menu) and judged by the scheduler's script time per frame and the time from an input to the first change on the page. It runs
   inside the `visual` job of `browser.yml`: called by `checks.yml` it warns (the numbers in the job summary, the long frames in the
   `perf-gate-*` artifact); called by `ci.yml` it blocks past a ceiling. A measure past its ceiling is a regression to fix, never a limit to raise;
   tighten a ceiling to the measured number (plus its margin) when the runners have reported. In the app, `?perf` lists every frame over 50 ms with
   its surfaces and phase and the slowest inputs, and Copy puts them in the paste.
5. Merge to `main` only when the owner says so. That also resets `/preview/` to match `main`.
   If the branch is already merged, restart it from the latest `main` before more work.

**Nothing off the GPU (owner, 1 Nov 2026: "block everything until everything is on GPU").** `npm run lint` and the unit tests run
`scripts/off-gpu-scan.mjs`, which lists every canvas 2D, CPU pixel copy, SVG drawing or raster, backdrop or CSS blur, layout-property
animation, repainting animation (mask, clip-path, colours, shadows, filters, custom properties), layout read or write in a frame or motion callback, raw `requestAnimationFrame` and synchronous shader status read, and prints
the share on the GPU (x/y). The score is the honest share on the GPU (every site counted, class writes and timer/observer sites included) and the target is 100% (owner, 2 Nov 2026: "No need to 95% gate but we need to get to 100% stat"). No percentage blocks lint, the unit test, a push or a deploy; they print it, and fail only on the layout-read allowance. Goal: nothing off. The full list,
with file, function, frame path and owning thread, is `docs/off-gpu-inventory.md` (`npm run offgpu` rewrites it; owners in
`scripts/off-gpu-owners.json`). `npx eslint .` alone checks code style while the list is not yet empty. Never weaken the scanner or
loosen its test to get green. `?offgpu=1` shows the same kinds of work live, per frame, and flashes red when any happens during motion.

Pages serves each copy as its production build (`npm run build` → `dist/`: bundled, minified, hashed), built in the deploy job of `pages.yml`; the repository root still runs as is for `npm start`. The preview's browser checks (`checks.yml`) test that build, as shipped; `ci.yml` tests both the source and the build. Source imports are plain addresses: no `?v=<hash>` stamp is committed (2 Nov 2026), so parallel branches no longer conflict on them; cache-busting is the build's hashed
file names and generated service worker. `tests/stamp.test.js` fails a committed stamp, and `npm run stamp` takes one out of a branch made before this.
Workflows pin `ubuntu-24.04`, so a new runner image (and new visual references) is a deliberate change.

## Per-frame work (the GPU is the only per-frame painter)

- No per-frame work on the main thread outside the scheduler: ask for a frame with `frameFor(tag)` from `src/ui/frame.js`,
  and never call `requestAnimationFrame` anywhere else. `tests/no-raw-raf.test.js` greps for it; the few older calls it lists
  may not grow, and a call you move onto the scheduler lowers its allowance there.
- No per-frame DOM writes outside `transform`, `opacity` and `clip-path`. A number, a trace or a label that changes every frame
  is drawn by the GPU or the canvas, not by layout.
- No `backdrop-filter` on anything that moves over the figure: the figure's own GPU glass (`glass-gl.js`) exists for that.
- Layout reads go through `src/ui/layout-snap.js` only (plan 3.4): `readBox`, `readStyle`, `readMetric(el, 'offsetHeight')`, `readCTM`…,
  and the snapshot it keeps (`stageBox()`, `worldCTM()`, `safeSides()`, kept boxes). `scripts/off-gpu-scan.mjs` (lint) fails a file with more
  direct reads than its allowance in `scripts/layout-read-allowance.json`, or fewer: lower the number when you move reads, never raise it.
- Gradient stop colours the organ painter uses are a generated table (`src/ui/stop-tokens.js`, per look: `npm run gen:stops`), never a style read.
  `tests/stop-tokens.test.js` fails when a stop rule or a custom property it reads changes in `styles/`: run `npm run gen:stops` (it measures the app in
  headless Chromium) and commit the file; `npm run check:stops` compares the table with the live page. A new gradient stop in `stage.js` needs it too.
- Pressure colours and cut-offs live once: HVPG amber 5, red 10; PPG amber 6, red 12, in `src/engine/pressure-cuts.js`.
  Read them from there and the colour tokens (`--ok`, `--caution`, `--danger`); `tests/pressure-vocabulary.test.js` fails on a
  second copy.

## Screenshots of the real app (always use `scripts/shoot.mjs`)

Cloud sandboxes have no GPU, and headless Chromium then gives the app one of three different pictures, which is why shots from
different threads looked different (vessels flat, soft or sharp):
1. no WebGL2 (`data-veins="none"`): the SVG vessels, a fallback no phone or laptop shows;
2. SwiftShader as is (`data-renderer="software"`, `data-quality="2"`): the app deliberately drops to 8 frames a second at half the pixels;
3. SwiftShader named as a GPU (`data-renderer="gpu"`, `data-quality="0"`): the code path, resolution and shading of the owner's iPhone, iPad and Mac.

Only the third is a screenshot of the real app. `scripts/shoot.mjs` always gets it (software WebGL2 flags, renderer named as a GPU,
the model paused so two frames can match), checks it before and after the shot and exits non-zero with the reason when it did not:
`node scripts/shoot.mjs --out <png> --device mac|ipad|ipad-portrait|iphone|iphone-landscape --theme light|dark --query "preset=cirr-decomp"`
(or `--script <deck> --slide <n>`; `--dir dist` to shoot the build; `--selector` for one element; `--no-vessels` for a view with none).
Several shots in one script: `import { openApp } from './scripts/shoot.mjs'` (a fresh page per view; `settle()` then `app.page.screenshot`).
Do not write your own `chromium.launch` for screenshots. A shot takes 2-4 minutes (software GL; Mac is 1x, `--dpr 2` is far slower),
so run one at a time: a second browser at once starves the first, and its slide's cards (not a bug) arrive 60 seconds or more later.
A view that is still easing in a shot is not a bug; `settle()` waits for two identical frames. On a deck slide (`--script`) it also waits
for the slide's cards to come in (words, data and teaching card whole, no entry running, the Doppler past "Acquiring…"), up to 240 s
(`--cards-wait <s>`, 0 skips it): a slide's entry takes about 90 s on software GL, and a shot inside it shows a card that is only a
shell with its tag, or no card at all. Do not report that as a bug without re-shooting the slide alone.
A slide whose figure is faded behind a table card (the summary tables) has almost no vessel colour, so `shoot.mjs` fails its vessel check:
pass `--no-vessels` for it.
Keep screenshots outside the repo. A headless shot is still not a device test: say "headless, software GL" when you report one.

## Pages setup and troubleshooting

One-time settings the owner made on GitHub (repo Settings), needed for deploys to work:
- **Pages → Source:** GitHub Actions.
- **Environments → github-pages → Deployment branches and tags:** "Selected branches and
  tags" with rules `main` and `claude/*` (single `*`: it does not match `/`, so `claude/**`
  is rejected; branch names are one level deep, `claude/<name>`).

If a deploy fails:
- A run that fails in about 2 seconds with no steps and the annotation "Branch ... is not
  allowed to deploy to github-pages due to environment protection rules" is the environment
  rule above, not the workflow. The owner has to fix it in Settings; it cannot be fixed by a push.
- The API often returns no job logs; the run page annotations hold the real message.
  Ask the owner to paste them.
- Each agent uses its own preview branch. Coordinate pushes: there is one shared `/preview/`,
  and the newest Pages run replaces it even when agents use different branches. Check
  `/preview/preview-info.txt` against your branch and commit before asking the owner to test.
- Only one Pages deploy matters at a time (job `deploy`, `concurrency: pages`, newest wins).
  The browser, visual and WebKit checks run in their own workflow (`checks.yml`, on request), so a deploy never
  waits for them. A started checks run always finishes; a newer request replaces only the run waiting behind it.
  A `main` push replaces a branch preview with `main`, which is expected after a merge.

Preview access depends on the current agent's environment. Some cloud sandboxes block
`github.io` (for example, with a proxy 403); others can open it. Try the available browser
or fetch tools, and report any access limitation accurately. A successful Pages run confirms
deployment, not visual or device testing. The owner's laptop, iPad and iPhone testing and
explicit permission to merge are required even when the agent can inspect the preview.
The built site's service worker (generated by `scripts/build.mjs`) keeps one cache per copy (live site and preview,
named by scope and version). An update drops that copy's older caches, keeping the previous version's for a tab still
open on it, and never touches the other copy's.

## Tester guides

`guides/beta-start-guide.pdf` (Letter) and `guides/beta-start-guide-iphone.pdf` (iPhone) are the beta testers'
start guides, served at `/guides/` and `/preview/guides/` under stable names that testers get as links.
When a change alters anything a guide shows or says (buttons, Settings rows, Send feedback, the first steps),
regenerate both PDFs in the same push and keep the file names.
