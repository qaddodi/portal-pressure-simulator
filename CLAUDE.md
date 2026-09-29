# Working notes for Claude

## Preview workflow (always follow)

The owner tests every change on laptop, iPad and iPhone before it goes to `main`.
Work happens locally on the owner's desktop; do not publish preview artifacts.

- **Preview locally:** run `npm start` (serves the source at http://localhost:8080 and
  prints a network address). On iPad and iPhone, open that network address
  (`http://<desktop-ip>:8080`) on the same Wi-Fi.
  To test the built output instead, run `npm run build` and then
  `npx --yes http-server dist -c-1 -p 8081`.
  Do not use `npm run preview` for devices: it binds to 127.0.0.1 only.
- **Preview branch:** work on a `claude/...preview...` branch, never directly on `main`.

Loop for every change:
1. Make the change and run `npm run check` (or at least `npm test` and `npm run lint`).
2. Start the local server for the owner to test on their devices.
3. Commit and push every tested change to the preview branch, so no work is lost.
4. Merge to `main` only when the owner says so.
