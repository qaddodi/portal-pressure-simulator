# Linking the simulator from a class page or syllabus

The simulator is a static site, so it can be linked or embedded without a server.

## Deep links

Open straight into an activity by adding a query string to the simulator's URL:

| Link | Opens |
|------|-------|
| `?script=<id>` | a presentation deck by id (the ids in `TOPICS` of `src/ui/decks.js`, e.g. `sites`, `hvpg`, `varices`, `where-resistance`, `meso-rex`; old ids in `DECK_ALIAS` still work) or a saved script; add `&slide=<n>` to start on slide n (slide 1 is the outline) |
| `?preset=<id>` | a patient, e.g. `healthy`, `csph`, `cirr-decomp`, `budd-chiari`, `rhf` (ids in `src/engine/scenario.js`); a mistyped id opens Patients with a note |
| `?home=<tab>` | the menu on `present`; any other value opens it on `patients` |

## Not built

SCORM 1.2 packaging (a zip for an LMS, with a client that finished the attempt on exit) was removed on 15 Nov 2026: there is no plan
to use the simulator that way, and the package was 35 MB. LTI 1.3 launches, Deep Linking and grade passback were never part of this static
build (they need a server-side tool: OIDC login, JWT validation, the Assignment and Grade Services). The deep links above are the entry
points such a tool would launch. To bring SCORM back, `git show 88df538d:scripts/scorm.mjs` and `:src/ui/lms.js` are the last copies.
