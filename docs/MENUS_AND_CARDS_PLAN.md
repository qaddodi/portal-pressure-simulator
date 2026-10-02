# Menus and cards overhaul

*Status: in progress · step 1 done. Agreed with the owner on 2026-10-02.*

## Rules

| | Rule |
|---|---|
| **Type** | Five sizes: 12 small labels · 14 body and buttons · 16 card titles · 20 key numbers · 28 big readouts. Weights 400 · 500 · 600. Small labels are sentence case, never spaced capitals. Serif (Source Serif 4) only for the Home title, presenter titles and the Figure view. Tokens in `styles/tokens.css`. |
| **Icons** | 16 in lists and chips, 20 on buttons and the top bar, 24 on tiles and tabs; 12 only for a check mark inside a dot or badge. Every command has an icon and a visible label; icon-only only for zoom, close and search. Icon left of the label in rows, above it in tiles. One stroke style (the sprite in `index.html`). |
| **Surfaces** | One menu style for every dropdown; one card style for every panel (header: icon, title, close; sections with the same section label; actions in a footer). On a phone every card is the same bottom sheet. |
| **Shapes** | `--r-control`, `--r-card`, `--r-sheet`, `--r-pill`. |
| **Guard** | `tests/e2e/smoke.mjs` › *one type and icon scale in every menu and card*. Figure artwork (anatomy and lobule labels, the bedside monitor, charts) is exempt. |

## Decisions

1. Phone: labels under the action icons in the top bar (no bottom tab bar).
2. Blood merges into the color menu as one **View** menu (Color by · Show · blood style).
3. Export folds into one **Export…** item that opens Figure view (PNG, SVG, Print).
4. Home's "I am a… Student / Instructor / Researcher" stays for now.
5. The serif stays where it is; to be decided later.

## Steps (one preview each)

1. **Foundations:** tokens, type and icon normalization, the guard. *Done.*
2. **Menus:** one menu style; the View merge; the Menu as a compact list with icons (same wording as Home); one Export item; no duplicates (Figure view and Projector only in the Menu; one lens shortcut, L).
3. **Vessel card:** one layout on desktop and phone; one-line description with *More*; a "What you changed" list with a reset per change; keep clear of its own labels; no key hints on touch.
4. **Treat, Measure, patient chart** on the shared card: icons for every drug, fluid and procedure (TIPS and surgical shunt distinct), drugs grouped by class; Measure's tabs with icons and labels, sub-modes inside each instrument.
5. **Top bar, timeline, phone:** labels under the phone's action icons and the Findings count; one *Skip ahead* control; *Compare* with an icon; patient name and legend never cut off; a first-visit hint "Tap any vessel".
6. **Home** matched to the above; README and CHANGELOG.
