# Design humanizer: making the interface look drawn by a person

Use this whenever you add or change anything a learner sees that is not the organ art itself: cards, tiles,
pills, labels, figure callouts, keys, buttons, menus, icons, colours and motion. It is the visual partner of
`docs/ai-humanizer.md`, which covers the words. Generated interfaces share a look: tinted chips on every noun,
a coloured stripe on the "important" card, tracked capitals over every block, a navy dashboard with neon
accents. Learners have seen that look on a thousand template sites, and it makes a careful teaching tool
read as a quick build. This guide lists those tells and what a medical illustrator or a textbook designer
would do instead.

The owner's recorded decisions (`/mnt/project-files/rules/decisions.md`, and the project instructions) win
over this guide. Where a rule here touches one of them, the decision stands until he changes it; the
"Decisions that stay" section below lists the ones that matter most.

## The test

Look at the screen and ask two questions.

1. **Would a textbook or atlas have printed it this way?** A good anatomy plate, a journal figure or a
   well-set clinical handbook page. If the element only makes sense on a SaaS dashboard or a landing page,
   rewrite it.
2. **What does this mark tell the learner?** Every stroke, fill, box, colour, capital and icon should carry
   a fact. Hide it in your head: if nothing is lost, delete it. If two marks say the same thing, keep one.

A third check for anything that signals importance: **is the emphasis in the content or added on top of
it?** People make a thing important by giving it more size, a better position, darker ink or the first
place in the order. Templates make it important by drawing something extra around it (a ring, a stripe,
a glow, a badge). Prefer the first.

## Workflow: humanize one element

1. **Name its job.** One sentence: "shows the HVPG and whether it is above 10 mmHg".
2. **Count the signals.** List every visual device on it: box, border, fill, colour, weight, caps, icon,
   arrow, shadow, motion. One meaning needs one signal. A second is allowed only for colour-blind safety
   (colour plus a word or shape).
3. **Strip to the job.** Remove each signal that repeats another or carries nothing.
4. **Rank by type and space.** Get hierarchy from size, weight, ink and position before reaching for a
   box or a colour.
5. **Borrow from the subject.** Colours from the anatomy and the lenses, shapes from the instrument it
   imitates, labels in the way an atlas labels.
6. **Check the neighbours.** The element should match its siblings on the same screen and on every device.
   A one-off style is a tell of its own.
7. **Check the decisions file.** If the change touches a recorded decision, stop and ask.

## Patterns to remove, with replacements

### Boxes, strokes and emphasis

| Machine-made look | Why it gives itself away | Human |
|---|---|---|
| A coloured stripe along one edge of a card or tile (top or left accent bar) to mark it "key" | The single most common generated-UI motif; it decorates the box, not the fact | Make the content itself stronger: larger or darker number, name in full ink, first in the row, or the only tile on the slide |
| An accent ring around a "selected" card that is not selected | Reads as an iOS focus ring or a checked option | Keep rings for real focus and real selection only |
| Every group in its own rounded box, boxes inside boxes (tile inside card, what-if box inside card) | Bento and card-grid templates; boxes stand in for layout decisions | One container per layer. Inside it, separate with space or one hairline |
| Short decorative rule under a heading | A leftover divider that marks nothing | Space. A rule only where it divides two things |
| Soft glow, blob or gradient halo behind a card, number or button | "Glassmorphism with aurora" template | A glow only where it means something on the figure (a vessel being measured) |
| Bevelled top highlight plus a large soft drop shadow on every surface | Generic elevation recipe | One elevation per layer, kept small; the figure is the ground |
| Text shadow or glow around body text | Blurs the letter edge; a crutch for low contrast | Fix the contrast underneath instead |

### Labels and type

| Machine-made look | Why it gives itself away | Human |
|---|---|---|
| Small tracked capitals above every block ("THE PATIENT", "OVERVIEW", "WHAT IF") | The "eyebrow" on every template section | A heading only where it tells the reader something new; sentence case or true small capitals |
| Generic block names (Overview, Insights, Summary, The patient) | Could head any block in any app | Name the content ("Liver stiffness, FibroScan") or drop the header |
| A tinted pill or badge on every noun | Tag-cloud look; when everything is a chip nothing stands out | Pills only for things that behave differently (a live value, a rule number, a view name). Anatomy terms as plain coloured text |
| The same word bold, coloured and in a pill at once | Three emphasis devices on one word | One device per word |
| Two-colour headlines, gradient text | Landing-page hero styling | Titles in one ink |
| Label stack: caps name, big coloured number, status word, bar, tick numbers, all centred | The KPI tile from every admin dashboard | Fewer layers: name and number on a shared baseline, one status signal, numbers aligned on the decimal |
| "▲ 9.1" beside every reading | Stock-ticker delta, doubles the numbers on screen | Show a change only where the slide is about the change, written as "+9.1" |
| Everything centred | Centring is the template default; it breaks reading lines | Left-align words, right- or decimal-align numbers in columns, centre only single short items |
| Unit, value and name in three sizes and three weights inside one small label | Over-styled micro-typography | Two levels at most: the reading and its unit, the name at the unit's size |

### Colour

| Machine-made look | Why it gives itself away | Human |
|---|---|---|
| Framework default colours (blue-500 `#3B82F6`, slate-900 navy `#0F172A`, indigo or violet accents) | Recognisable as the defaults of popular UI kits | Colours chosen for this subject: the plate's tissue tones, the lens ramps, ink and paper |
| Dark theme as navy with neon accents and mint "success" green | The "dark SaaS dashboard" palette | A dark that suits a reading room or a monitor: near-neutral ink, accents drawn from the figure |
| One accent colour doing every job (links, progress, selection, labels, highlights) | A theme token applied everywhere, so the accent no longer means anything | Accent only on the control the learner is touching; everything else in ink |
| Purple-to-blue or pink-to-orange gradients | The generic "AI" gradient | Flat colour; a ramp only where it encodes a scale |
| Every state its own hue; traffic lights on everything | Colour as decoration | Colour where it carries a clinical meaning (normal, raised, dangerous), the same three hues everywhere |
| Colour as the only signal | Fails colour-blind learners and photocopies | Colour plus a word or a shape |

### Layout and motion

| Machine-made look | Why it gives itself away | Human |
|---|---|---|
| Three equal cards in a row by default | The rule of three as layout | As many as the content has, sized by what they hold |
| Identical padding and gaps everywhere | No hierarchy of space | Tighter inside a group, looser between groups |
| Every slide in the same skeleton (pill, title, rule, body, widget, three tiles) | Template filling | Each slide shows what it teaches; a data card only when its numbers are the point |
| Hover lift, bounce, shimmer, pulsing dots, staggered fade-ins | Motion as decoration | Motion that follows the model: eased changes of a real value, cards entering whole (see the project's motion rules) |
| A "live" badge, a status dot, a sparkle icon | Banned here already: LIVE (14 Oct), dots (15 Oct) | Nothing |

### Icons and controls

| Machine-made look | Why it gives itself away | Human |
|---|---|---|
| A stock line icon beside every heading, tab and button | Icon packs applied by default | Icons only where the word does not fit (a bottom tab bar, a gear, a close X) |
| An icon in a tinted circle or rounded square | Feature-grid template | The icon alone, or no icon |
| A segmented control with a bright filled pill for the choice | iOS template in a teaching card | Separate outlined buttons, so each plainly reads as tappable; the chosen one in full ink with an accent edge |
| Toggles drawn as chips with a radio circle inside | Chip-with-checkbox hybrid | A plain row with a check, or a switch |
| Emoji in the interface | Never seen in a textbook | None (also a writing rule) |

### Figures and data

| Machine-made look | Why it gives itself away | Human |
|---|---|---|
| A gauge, ring or progress bar for a single number | Chart as ornament | The number, with its threshold if it matters |
| A stock slider (white thumb with a coloured ring and a drop shadow, inside its own box) | Form-kit control dropped into a teaching card | The tiles' scale bar made draggable: the same 6 px track, a solid dot for now, a ring where the slide started |
| A scale bar with no labels, or labels that look like readings | Decoration that only looks like data | Bands at the real cut-offs with their numbers, or no numbers at all |
| A legend far from what it explains | Template layout | Label the thing directly, with a short leader if needed (atlas style) |
| Labels with heavy outlines or halos everywhere | Meme-caption look | A thin halo only where a label crosses art; otherwise plain text on a clear spot |

## What already reads as human here

Keep these when you change anything near them:
- The organ plate itself, drawn as an atlas plate, and direct labels with thin leaders.
- Source Serif 4 titles over an Inter body: a textbook pairing, not a dashboard one.
- Black instrument monitors that look like the real machines, and a real-looking Doppler texture.
- Sentence-case body text, units on every number, tabular figures.
- No emoji, no gradient text, no LIVE badges, no status dots.

## Decisions that stay

These look like items in the tables above but are the owner's recorded choices. Leave them as they are
unless he changes them; you may point out the tension, but do not "fix" them on your own.
- Frosted glass on every card, nav pill and key, with its edge highlight; no more opaque glass (C3 declined, 17 Oct).
- Disease names in violet in body text; titles in one colour (17 Oct).
- View names ("colored by" lenses) as pills in the view's own colour (16 Oct); outlined pills for rule numbers (#14, 15 Oct).
- Site tags as small coloured pills above the title, in decks covering more than one site.
- The deck's short name as a darker corner tab (e9c1844).
- Tiles with a scale bar: bands at the real cut-offs, a dot for now and a ring for the start (17890fe); tile status words (0fc8c43).
- Red diagonal hatching for the resistance site on the ladder and the site rail.
- The white glow on the vessel being Dopplered (ink on the light themes) and the small probe with its sample gate, the olive cavernoma glow, the soft glow on a selected vessel, the heart glow behind the liver.
- The FibroScan reading in white with a dark outline inside the map (M4 declined); black monitors in every theme (I22 declined).
- Live callouts that follow the model (4bded44).

## Before and after

**Key tile**
- Before: the tile a slide is about gets a 2 px accent stripe along its top edge.
- After: it is set apart by its content: its number a step larger, or it is the first tile, or it is the only tile.

**Data card header**
- Before: "THE PATIENT" in tracked capitals, centred above three tiles.
- After: no header when the tiles name themselves; an instrument card keeps its plain name ("Liver stiffness, FibroScan").

**Anatomy term in a sentence**
- Before: "the ( splenic vein )" in a tinted rounded chip.
- After: "the splenic vein" in the vessel's colour, and the vessel glows in that colour on the figure while the slide is up.

**Figure callout**
- Before: "Esoph. varices **18.4** mmHg ▲ 11.0" with a white outline.
- After: "Varices 18.4 mmHg", and "+11.0" only on the slide about the rise.

**Choice buttons in a teaching card**
- Before: "Normal heart | **Failing heart**" with the choice in a bright accent-filled pill inside a bordered track.
- After: two separate buttons with a thin outline, the chosen one in full ink with an accent edge. (Plain text with an underline was tried and did not read as something to tap.)

## Final pass

1. No element carries two signals for one meaning (except colour plus word for colour-blind safety).
2. Nothing is emphasised by an added stripe, ring, glow or badge where size, ink or order could do it.
3. No tracked-capital heading that names nothing specific; no generic block names.
4. No tinted chip on a plain anatomy term; no word that is bold, coloured and pilled at once.
5. The accent colour appears only on the control being used.
6. No framework-default colour, no navy-and-neon, no gradient that does not encode a scale.
7. No icon beside a word that already says it; no emoji.
8. Words left-aligned, numbers aligned, centring only for single short items.
9. The element matches its siblings on every device and theme.
10. No recorded decision was overridden.

## Prompt to hand to a model

> Review this interface element for a medical teaching app as a textbook designer would. List every visual
> device on it (box, border, fill, colour, weight, capitals, icon, arrow, shadow, glow, motion) and the one
> meaning each carries. Remove any device that repeats another or carries nothing. Replace emphasis drawn
> on top of the content (accent stripes, rings, glows, badges, tinted chips) with emphasis in the content
> (size, ink, order, position). Avoid framework-default colours, navy-and-neon dark themes, tracked-capital
> eyebrows, generic headers, stock-ticker change arrows and centred everything. Keep every number, unit,
> threshold and colour that encodes a clinical meaning. Do not change anything listed as a recorded decision.
> Return the element's new specification and a one-line list of anything you were unsure about.
