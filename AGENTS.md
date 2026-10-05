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
  Pushing `main` republishes both from `main`, so after a merge `/preview/` equals the live site.
  `/preview/preview-info.txt` shows which branch and commit the preview was built from.
  Do not publish preview artifacts.
- **Preview badge:** a branch preview shows an orange "PREVIEW · <commit>" pill at the top
  centre and a "PREVIEW ·" title prefix, so the owner knows which build they are on. It is
  injected at deploy time by `scripts/preview-badge.mjs` (only when the ref is not `main`),
  never committed to the source, so nothing has to be removed on merge.
- **Preview branch:** work on your own one-level `claude/<name>` branch (include `preview`
  in the name), never commit or push directly to `main`. Keep the `claude/` prefix for every
  coding agent; do not add `codex/` branches without changing both deployment rules.

Loop for every change (fast previews first, full tests before merge):
1. Make the change and run only `npm run lint && npm test` (seconds). Do not run the browser
   checks (`npm run smoke`) or `npm run check` locally at this stage.
2. Commit and push to the preview branch. Check the "Pages (live site + preview)" deploy job
   finished (GitHub Actions tools), then tell the owner the preview URL. Do not wait for the
   browser-check job; glance at it later and mention any failure, but it does not block testing.
3. The owner tests on their devices and reports anything broken; repeat steps 1-2 quickly.
4. When the owner is happy, run the full `npm run check` (lint, unit, build, smoke, smoke:dist),
   fix anything it finds, and recommend any tests worth adding for the new behaviour.
   The full CI (`ci.yml`) also runs every check on pull requests and on `main`.
5. Merge to `main` only when the owner says so. That also resets `/preview/` to match `main`.
   If the branch is already merged, restart it from the latest `main` before more work.

The repository root is served as is (no build step for Pages); `dist/` is only for SCORM.

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
  The browser checks are grouped per branch, so another branch's push does not cancel them.
  A `main` push replaces a branch preview with `main`, which is expected after a merge.

Preview access depends on the current agent's environment. Some cloud sandboxes block
`github.io` (for example, with a proxy 403); others can open it. Try the available browser
or fetch tools, and report any access limitation accurately. A successful Pages run confirms
deployment, not visual or device testing. The owner's laptop, iPad and iPhone testing and
explicit permission to merge are required even when the agent can inspect the preview.
The live site and the preview share one browser cache name (`CACHE` in `sw.js`); changing
it on a branch can clear the other copy's offline cache once.
