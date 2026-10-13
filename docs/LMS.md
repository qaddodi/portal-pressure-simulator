# Using the simulator in an LMS

The simulator is a static site, so it can be linked, embedded or packaged without a server.

## Deep links

Open straight into an activity by adding a query string to the simulator's URL:

| Link | Opens |
|------|-------|
| `?script=<id>` | a presenter script: `where-block`, `bleed` |
| `?preset=<id>` | a patient, e.g. `healthy`, `csph`, `cirr-decomp`, `budd-chiari`, `rhf` |
| `?home=<tab>` | the menu on `patients` (or `explore`) or `present` |
| `?lang=<code>` | interface language: `en`, `es`, `fr`, `pt`, `ar` |

## SCORM 1.2

```bash
npm run scorm                          # whole simulator, opens on Home
```

Upload the zip from `dist/` as a SCORM package (`-- --script <id>` packages one presenter script).
Inside the LMS the simulator finds the SCORM API, takes the learner's name from it and finishes the
attempt on exit. Presentations and patients are ungraded, so no score is reported.

## LTI 1.3

LTI 1.3 launches, Deep Linking and grade passback need a server-side tool (OIDC login, JWT
validation, the Assignment and Grade Services). They are not part of this static build; the
deep links above are the entry points such a tool would launch.
