# Accessibility

Portal Pressure Simulator 2.0.0 · self-assessment against WCAG 2.2 level AA, in the format of an
Accessibility Conformance Report (ACR). **This is not a third-party audit.** An independent
audit and a published VPAT® are planned before institutional sale; this document records what
the product does today and where it falls short.

## Summary

| Area | Status |
|------|--------|
| Keyboard | Supported. Every vessel is a focusable control (Tab, then ← → along the flow, Enter opens its actions, 1–9 run them). All menus, dialogs, the timeline, instruments and the command palette (Ctrl/⌘ K) work from the keyboard. Esc always backs out one level. |
| Screen readers | Partially supported. The figure has an accessible name and a live description (`aria-description`) of the patient generated from the model, the same line as the narrator caption. Dialogs are modal with focus return. Instrument canvases carry a name and their key values are shown as text beside them; chart data is not yet exposed as tables. |
| Color | Supported. The pressure scale is perceptually uniform; every value shown by color also has a number, an arrow, a dash pattern or a word. Direction is shown by chevron orientation, not hue. |
| Motion | Supported. `prefers-reduced-motion` turns every animation into an instant state change (the moving blood holds still, halos and transitions are skipped). |
| Zoom and reflow | Responsive layouts down to 320 CSS px with no horizontal page scroll; at 200 % browser zoom (1280 × 900 → 640 × 450 CSS px) the figure, top bar and transport reflow into the phone-landscape layout and the readouts stay in the Patient tab. Figure labels keep a constant size at any figure zoom. Settings → Interface zoom scales the bars, dock, sheets and menus from 80 % to 140 % without changing the figure. |
| Text contrast | All text tokens measure at least 4.5:1 against every surface they sit on, in both themes (secondary captions 4.5–5.6:1, body 7–9:1). Text drawn over the anatomy carries a halo in the page color. |
| Timing | No time limits, except the clinical clock in the bleeding case, which can be paused at any time. |
| Language | The document language and direction follow the chosen interface language (Arabic is right-to-left). |

## WCAG 2.2 AA criteria with known gaps

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 1.1.1 Non-text content | A | Partially supports | Instrument canvases (Doppler, endoscopy, lobule) are named and have live text readouts beside them; the images themselves (e.g. the spectral trace) are not described in detail. |
| 1.3.1 Info and relationships | A | Partially supports | Chart data is summarized in text, not exposed as data tables. |
| 1.4.11 Non-text contrast | AA | Supports with exceptions | Faint "potential collateral" ghosts are intentionally below 3:1; they are decorative until the layer is switched on. |
| 2.5.7 Dragging movements | AA | Partially supports | Sliders, shunt placement (card → click the target) and painting (the card's fibrosis and clot controls) have click or keyboard alternatives. Drawing a prediction on the pressure profile does not yet. |
| 4.1.2 Name, role, value | A | Supports | Custom controls use native buttons, `aria-pressed`, `role="dialog"`, and labelled regions. |

## Testing done

- Automated browser runs (Chromium) through Home, a lesson with an on-figure prediction, the
  bleeding case to its debrief, and a presenter script stepped from the keyboard.
- Light and dark themes at 390 px (phone), 1024 px (tablet) and 1440 px (desktop).
- Contrast of every text color token against every surface token, both themes (computed).
- Reflow at 320 px and at 200 % browser zoom (640 × 450 CSS px): no horizontal page scroll, every
  control reachable (checked in Chromium).
- Not yet done: screen-reader testing with NVDA, JAWS and VoiceOver; color-vision simulation of
  each lens. All are part of the planned third-party
  audit.

## Contact

Report an accessibility problem through the repository's issue tracker; include the browser,
assistive technology and the steps to reproduce.
