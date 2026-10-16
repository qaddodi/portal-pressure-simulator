# AI humanizer: turning AI-sounding text into plain, human wording

Use this whenever you write or revise words a learner will read: teaching card text, titles,
pills, tile labels, tooltips, README and changelog prose. It rewrites text that sounds
machine-made into the way a good clinician-teacher would say it at the bedside.
It sits on top of the style rules in `docs/deck-authoring-guide.md` section 9, rule 13 (plain sentence
case, no emoji, American spelling, numbers with units, Baveno VIII accurate). Where they differ,
the authoring guide and the clinical facts win.

## The test

Read the line aloud as if telling a resident on rounds. If you would not say it, or it would
make them roll their eyes, rewrite it. Then ask: does it say something specific that a learner
can use? If the sentence could be pasted onto any other slide, it says nothing. Cut it or make it concrete.

## Workflow: humanize a sentence

1. **Find the claim.** What single fact or action does the sentence carry? Write it in one short clause.
2. **Name the actor and the verb.** Who or what does what? "The spleen enlarges", not "splenic enlargement is observed".
3. **Put the number or threshold in.** Replace vague size words with the value and unit.
4. **Cut the frame.** Delete openers, wrap-ups and hedges that carry no fact.
5. **Fit the space.** Slides have fixed cards. Shorten the words first; never grow a card.
6. **Check the facts again.** Rewording must not change the meaning, the threshold or the direction of an effect.

## Patterns to remove, with replacements

### Filler openers and closers

| AI-sounding | Human |
|---|---|
| It is important to note that the portal vein carries blood to the liver. | The portal vein carries blood to the liver. |
| It's worth mentioning that HVPG ≥ 10 mmHg is clinically significant. | HVPG ≥ 10 mmHg is clinically significant. |
| In conclusion, treating the cause matters most. | Treat the cause first. |
| Let's dive into how pressure builds. | How pressure builds: |
| Overall, this highlights the role of resistance. | Resistance is the main driver here. |

Drop: "it is important to note", "it is worth noting", "it should be noted", "in conclusion",
"overall", "in summary", "let's explore", "let's delve", "as we can see", "needless to say".

### Cliché and inflated words

| AI-sounding | Human |
|---|---|
| A crucial/pivotal/vital role in pressure | A main cause of pressure |
| Plays a key role in | Drives / causes / lowers / raises |
| Delve into / unpack / navigate the complexities of | Look at / explain |
| A testament to / a tapestry of / a landscape of | (say the fact) |
| Leverage / utilize / harness | Use |
| Robust, seamless, cutting-edge, game-changing | (name the measurable property, or cut) |
| Unlock / unleash / revolutionize | (cut) |
| Fundamentally, essentially, ultimately | (cut, or state the reason) |
| Myriad / plethora / a wide array of | Many, or list two or three |
| Furthermore, moreover, additionally | (start a new sentence, or use "and") |

### Vague quantity and hedging

| AI-sounding | Human |
|---|---|
| Significantly elevated pressure | Pressure above 10 mmHg |
| A substantial amount of blood is diverted | About a third of portal flow bypasses the liver (give the figure, or say "most" or "some") |
| May potentially lead to possible bleeding | Raises the risk of bleeding |
| Can sometimes occur in certain patients | Occurs in (name which patients) |

One hedge per claim is enough. Use "raises the risk" or "more likely" for thresholds, since
risk climbs gradually and does not switch on at a cutoff.

### Sentence shapes that give it away

- **"Not only X but also Y"** and **"It's not just X, it's Y"**: say X and Y as two plain statements.
- **Rule-of-three lists** used for rhythm ("fast, accurate, and reliable"): keep only items that carry a different fact.
- **Em-dash asides** and **colon-then-reveal** ("The result? Pressure."): use a full stop or a comma. Avoid em-dashes in student-facing text.
- **Rhetorical questions** ("So what happens next?"): state what happens.
- **Passive and nominalized** ("is characterized by", "results in the development of"): use the active verb ("causes", "develops").
- **Stacked abstractions** ("a multifaceted interplay of hemodynamic factors"): name the factors.
- **Same-length, same-rhythm sentences in a row**: vary them, and let a short one land.
- **Summary sentence repeating the one before**: delete it.
- **Metaphor dressing** ("the liver acts as a gatekeeper", "a perfect storm"): say the mechanism, or keep one metaphor only if it explains something a plain statement cannot.

## Teaching-card rules

- Student-facing only. No instructor notes, no "teaching tip", no "as an educator".
- One idea per card line. A learner should get it on the first read.
- Define a term the first time it appears on a slide (HVPG, PPG, WHVP, FHVP), then use it plainly.
- Lead with the mechanism or the clinical consequence, then the number. "Resistance rises in the sinusoids, so portal pressure climbs: HVPG 14 mmHg."
- Use the same word for the same thing across all decks (portal vein, not "main portal conduit").
- Keep thresholds as rising risk, as in the app: HVPG 5 mmHg (amber) and 10 mmHg (red); PPG 6 mmHg (amber) and 12 mmHg (red).
- Numbers: whole numbers only on the "Pressure, portal vein to heart" ladder card; one decimal everywhere else. Any HVPG or PPG must equal the difference of the readings shown.
- US audience: octreotide, not terlipressin or somatostatin. SOS is post-sinusoidal.
- No emoji, no exclamation marks, no slogans, no hype words.
- Titles name the topic or the finding, not a teaser. "Splenic vein thrombosis raises pressure upstream", not "When the plumbing fails".
- Titles can shrink to fit; do not shorten the meaning to make them fit. Trim the filler instead.

## Before and after

**Teaching card line**
- Before: *It is crucial to understand that portal hypertension fundamentally arises from a multifaceted interplay of increased resistance and elevated inflow.*
- After: *Portal hypertension has two causes: higher resistance to flow through the liver, and more blood flowing in from the gut.*

**Threshold**
- Before: *An HVPG significantly above 10 mmHg is a pivotal marker of clinically significant portal hypertension.*
- After: *At an HVPG of 10 mmHg or more, varices and decompensation become much more likely.*

**Title**
- Before: *Unlocking the Secrets of the Portal Vein*
- After: *Portal vein pressure*

**Pill / label**
- Before: *Robust collateral formation*
- After: *Collaterals open*

**Case line**
- Before: *The patient presents with a concerning constellation of symptoms suggestive of decompensation.*
- After: *Ascites and confusion: this patient has decompensated.*

**Explanation of a drug**
- Before: *Octreotide leverages splanchnic vasoconstriction to effectively mitigate variceal bleeding.*
- After: *Octreotide narrows the splanchnic arteries, so less blood reaches the portal vein and bleeding slows.*

## Final pass

1. No phrase from the "Filler" or "Cliché" tables remains.
2. Every claim has a subject, a verb and, where it applies, a number with a unit.
3. No sentence could sit unchanged on another slide.
4. No em-dash, emoji, exclamation mark, rhetorical question or "not only... but also".
5. Read it aloud once. If you stumble, shorten it.
6. Meaning, thresholds and direction of effect are unchanged from the source.

## Prompt to hand to a model

> Rewrite the text below for medical learners. Keep every fact, number and threshold exactly as is.
> Use plain, active, specific wording as a clinician-teacher would say it. Remove filler openers and
> closers, cliché and inflated words, vague quantity words, em-dashes, rhetorical questions and
> "not only... but also" constructions. One idea per sentence. Define abbreviations on first use.
> Return only the rewritten text, plus a one-line list of any fact you were unsure about.
