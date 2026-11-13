# Accessibility

Portal Pressure Simulator (updated 11 November 2026) · self-assessment against WCAG 2.2 level AA, in the format of an
Accessibility Conformance Report (ACR). **This is not a third-party audit.** An independent
audit and a published VPAT® are planned before institutional sale; this document records what
the product does today and where it falls short.

## Summary

| Area | Status |
|------|--------|
| Keyboard | Supported. Every vessel is a focusable control (Tab, then ← → along the flow, Enter opens its actions, 1–9 run them). All menus, dialogs, the timeline, instruments and the command palette (Ctrl/⌘ K, or /; a combobox: type, ↑ ↓, Enter, and Tab stays inside it) work from the keyboard. Shortcuts leave text fields, input-method composition and a slider's or switch's own keys alone, and a held key acts once. Esc backs out one layer at a time (a menu, then a dialog, then the card or selection). In a talk, Enter and Space on a control reached with Tab work as that control; the slide keys apply after a mouse click or with nothing focused. |
| Screen readers | Partially supported. The figure has an accessible name and a live description (`aria-description`) of the patient generated from the model, a one-line reading of the patient. Dialogs are modal (the page behind is inert) with focus returned to the first opener; a menu opened from the keyboard takes focus and gives it back. Instrument canvases carry a name and their key values are shown as text beside them; chart data is not yet exposed as tables. |
| Color | Supported. The pressure scale is perceptually uniform; every value shown by color also has a number, an arrow, a dash pattern or a word. Direction is shown by chevron orientation, not hue. |
| Motion | Supported, with one exception. `prefers-reduced-motion` turns every animation into an instant state change (the moving blood holds still, its arrowheads spaced by how much blood flows, and halos and transitions are skipped). Two moves keep a short form instead of a jump, because a jump of the whole figure is harder to follow: the camera's glide (a slide's framing, Fit, a zoom) runs 300 ms, and the change between Anatomy and Circuit runs 300 ms as a crossfade and move instead of 1.3 s (`REDUCED_MOVE_MS` in `src/ui/motion.js`, which states the same exception). The live data traces (the Doppler spectral trace, the pressure-over-time chart and the bedside monitor strip) still scroll with the model's clock; pausing the model stops them. |
| Zoom and reflow | Responsive layouts down to 320 CSS px with no horizontal page scroll; at 200 % browser zoom (1280 × 900 → 640 × 450 CSS px) the figure, top bar and transport reflow into the phone-landscape layout and the readouts stay in the Patient tab. Figure labels keep a constant size at any figure zoom. |
| Text contrast | All text tokens measure at least 4.5:1 against every surface they sit on, in every look (Light, Soft, Dark, Navy and Black; secondary captions 4.5–5.6:1, body 7–9:1); amber, green and red used as text are `--caution-ink`, `--ok-ink` and `--danger-ink` (4.5:1 or more on every surface, kept by tests); the raw status colours are fills and strokes. Text drawn over the anatomy is outlined in the page color (one label style, no boxes). Windows high-contrast (forced colours) shows the on and selected states and the switches in system colours. |
| Timing | No time limits; the model's clock can be paused at any time. |
| Language | The interface is in English and the document declares `lang="en"`. |

## WCAG 2.2 AA criteria with known gaps

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 1.1.1 Non-text content | A | Partially supports | Instrument canvases (Doppler, endoscopy, lobule) are named and have live text readouts beside them; the images themselves (e.g. the spectral trace) are not described in detail. |
| 1.3.1 Info and relationships | A | Partially supports | Chart data is summarized in text, not exposed as data tables. |
| 1.4.11 Non-text contrast | AA | Supports with exceptions | Faint "potential collateral" ghosts are intentionally below 3:1; they are decorative until the layer is switched on. |
| 2.5.7 Dragging movements | AA | Partially supports | Sliders, shunt placement (card → click the target) and painting (the card's fibrosis and clot controls) have click or keyboard alternatives. Drawing a prediction on the pressure profile does not yet. |
| 2.2.2 Pause, stop, hide | A | Partially supports | The live data traces scroll while the model runs, also under Reduce Motion; the model's clock can be paused. |
| 4.1.2 Name, role, value | A | Supports | Custom controls use native buttons, `aria-pressed`, `role="dialog"`, and labelled regions. |

## Testing done

- Automated browser runs (Chromium) through the menu, the patients and the presentation decks
  stepped from the keyboard. The full browser suite no longer runs in CI (4 Nov 2026); its scripts stay in
  `tests/e2e/` as local tools, and CI runs a lite smoke (boot, the three views, slide 1 of every deck).
- Light and dark looks at 390 px (phone), 1024 px (tablet) and 1440 px (desktop); Soft, Navy and Black were
  added later and are covered by the contrast test only.
- Contrast of every text color token against every surface token, in every look (computed by
  `tests/token-contrast.test.js` on each push).
- Reflow at 320 px and at 200 % browser zoom (640 × 450 CSS px): no horizontal page scroll, every
  control reachable (checked in Chromium).
- Not yet done: screen-reader testing with NVDA, JAWS and VoiceOver; color-vision simulation of
  each lens. All are part of the planned third-party
  audit.

## Contact

Report an accessibility problem through the repository's issue tracker; include the browser,
assistive technology and the steps to reproduce.
