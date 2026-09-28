# Working notes for Claude

## Preview workflow (always follow)

The owner tests every change on laptop, iPad and iPhone before it goes to `main`.

- **Private preview link:** https://claude.ai/artifact/GMsN4NSCbrUcz1VFrJjQZs
  Always update this same link; never create a new preview artifact. Publish
  with the Artifact tool, passing this URL as `url` (read it first), with
  `dist/index.html` as the page and every other file in `dist/` in `files`
  (asset names are content-hashed, so remove stale ones with `null`).
- **Preview branch:** work on a `claude/...preview...` branch, never directly on `main`.

Loop for every change:
1. Make the change, run `npm run build`, republish `dist/` to the preview link.
2. The owner tests on their devices.
3. Commit and push every tested change to the preview branch, so no work is lost
   when the cloud session ends.
4. Merge to `main` only when the owner says so.
