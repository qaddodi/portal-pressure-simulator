# Working notes for Claude

## Preview workflow (always follow)

The owner tests every change on laptop, iPad and iPhone before it goes to `main`.
Work happens in the cloud; previews are published to GitHub Pages.

- **Live site:** https://qaddodi.github.io/portal-pressure-simulator/ (tip of `main`)
- **Preview:** https://qaddodi.github.io/portal-pressure-simulator/preview/
  Pushing any `claude/**` branch triggers `.github/workflows/pages.yml`, which republishes
  the live site at `/` and that branch at `/preview/` (about a minute or two).
  `/preview/preview-info.txt` shows which branch and commit the preview was built from.
  Do not publish preview artifacts.
- **Preview branch:** work on a `claude/...preview...` branch, never directly on `main`.

Loop for every change:
1. Make the change and run `npm run check` (or at least `npm test` and `npm run lint`).
2. Commit and push to the preview branch. Tell the owner the preview URL, and check the
   "Pages (live site + preview)" run finished before saying it is ready.
3. The owner tests on their devices.
4. Merge to `main` only when the owner says so. That also resets `/preview/` to match `main`.

The repository root is served as is (no build step for Pages); `dist/` is only for SCORM.
