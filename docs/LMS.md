# Using the simulator in an LMS

The simulator is a static site, so it can be linked, embedded or packaged without a server.

## Deep links

Open straight into an activity by adding a query string to the simulator's URL:

| Link | Opens |
|------|-------|
| `?lesson=<id>` | a lesson: `valveless`, `resistance-site`, `hvpg`, `forward`, `collaterals`, `laplace`, `hepatofugal`, `starling`, `sinistral`, `costs`, `heart` |
| `?case=<id>` | a case: `bleed`, `gastric`, `cardiac`, `refractory` |
| `?script=<id>` | a presenter script: `ph-ten`, `where-block`, `bleed` |
| `?preset=<id>` | a patient, e.g. `healthy`, `csph`, `cirr-decomp`, `budd-chiari`, `rhf` |
| `?home=<tab>` | Home on `explore`, `learn`, `cases` or `present` |
| `?lang=<code>` | interface language: `en`, `es`, `fr`, `pt`, `ar` |

## SCORM 1.2

```bash
npm run scorm                          # whole simulator, opens on Home
npm run scorm -- --lesson hvpg         # one lesson
npm run scorm -- --case bleed          # one case
```

Upload the zip from `dist/` as a SCORM package. Inside the LMS the simulator finds the SCORM
API, takes the learner's name from it, reports the best lesson or case score
(`cmi.core.score.raw`, 0–100) and sets `cmi.core.lesson_status` to *passed* at 50 or above
(mastery score 50), otherwise *failed*.

## xAPI

Learners can export their attempts as xAPI 1.0.3 statements (Home › Lessons or Cases ›
*Export xAPI*, or from a case debrief) and upload them to a learning record store. Each
statement carries the activity, score, duration, variant and objectives.

## LTI 1.3

LTI 1.3 launches, Deep Linking and grade passback need a server-side tool (OIDC login, JWT
validation, the Assignment and Grade Services). They are not part of this static build; the
deep links above are the entry points such a tool would launch.
