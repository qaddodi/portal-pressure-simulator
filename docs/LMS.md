# Using the simulator in an LMS

The simulator is a static site, so it can be linked, embedded or packaged without a server.

## Deep links

Open straight into an activity by adding a query string to the simulator's URL:

| Link | Opens |
|------|-------|
| `?script=<id>` | a presentation deck by id (the ids in `TOPICS` of `src/ui/decks.js`, e.g. `sites`, `hvpg`, `varices`, `where-resistance`, `meso-rex`; old ids in `DECK_ALIAS` still work) or a saved script; add `&slide=<n>` to start on slide n (slide 1 is the outline); add `&route=<route id>` to play one of the short routes of the longest decks (`ascites`: `forms`, `treat`; `ten-years`: `turning`; `prehepatic`: `short`, `acute`, `cirrhosis`; `variceal-bleed`: `first`, `fails`). `&slide=<n>` still counts the whole deck's slides, and a slide the route skips opens the next one on the route. A route id the deck does not have plays the whole talk |
| `?preset=<id>` | a patient, e.g. `healthy`, `csph`, `cirr-decomp`, `budd-chiari`, `rhf` (ids in `src/engine/scenario.js`); a mistyped id opens Patients with a note |
| `?home=<tab>` | the menu on `present`; any other value (the SCORM package uses `explore`) opens it on `patients` |

## SCORM 1.2

```bash
npm run scorm                          # whole simulator, opens on the Patients menu
```

Upload the zip from `dist/` as a SCORM package (`-- --script <id>` packages one deck or script).
Inside the LMS the simulator finds the SCORM API and finishes the
attempt on exit. Presentations and patients are ungraded, so no score is reported.

## LTI 1.3

LTI 1.3 launches, Deep Linking and grade passback need a server-side tool (OIDC login, JWT
validation, the Assignment and Grade Services). They are not part of this static build; the
deep links above are the entry points such a tool would launch.
