# Working notes for Claude

## Preview workflow (always follow)

The owner tests every change on laptop, iPad and iPhone before it goes to `main`.
Work happens in the cloud; previews are published to GitHub Pages.

- **Live site:** https://qaddodi.github.io/portal-pressure-simulator/ (tip of `main`)
- **Preview:** https://qaddodi.github.io/portal-pressure-simulator/preview/
  Pushing any `claude/**` branch triggers `.github/workflows/pages.yml`, which republishes
  the live site at `/` and that branch at `/preview/` (about a minute or two).
  Pushing `main` republishes both from `main`, so after a merge `/preview/` equals the live site.
  `/preview/preview-info.txt` shows which branch and commit the preview was built from.
  Do not publish preview artifacts.
- **Preview badge:** a branch preview shows an orange "PREVIEW · <commit>" pill at the top
  centre and a "PREVIEW ·" title prefix, so the owner knows which build they are on. It is
  injected at deploy time by `scripts/preview-badge.mjs` (only when the ref is not `main`),
  never committed to the source, so nothing has to be removed on merge.
- **Preview branch:** work on a `claude/...preview...` branch, never directly on `main`.

Loop for every change:
1. Make the change and run `npm run check` (or at least `npm test` and `npm run lint`).
2. Commit and push to the preview branch. Tell the owner the preview URL, and check the
   "Pages (live site + preview)" run finished (GitHub Actions tools) before saying it is ready.
3. The owner tests on their devices.
4. Merge to `main` only when the owner says so. That also resets `/preview/` to match `main`.
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
- Only one Pages run matters at a time (`concurrency: pages`, newest wins). A `main` push
  replaces a branch preview with `main`, which is expected after a merge.

Sandbox limits: cloud sessions cannot fetch `github.io` (proxy 403), so a person has to look
at the live site and the preview. Confirm the Pages run succeeded, then ask the owner to check.
The live site and the preview share one browser cache name (`CACHE` in `sw.js`); changing
it on a branch can clear the other copy's offline cache once.
