# Embedding the simulator (an iframe, an LMS page)

Add `?embed` to any deep link. It is the same app with no top bar, no first-run hint, no feedback ask and no offline worker
(an iframe on another site installs nothing). A talk stays on its last slide instead of ending, and has no exit button.

| What to show | Address |
|---|---|
| One patient | `https://qaddodi.github.io/portal-pressure-simulator/?embed&preset=cirr-decomp` |
| One presentation | `https://qaddodi.github.io/portal-pressure-simulator/?embed&script=hvpg` |
| A presentation from slide 5 | `https://qaddodi.github.io/portal-pressure-simulator/?embed&script=hvpg&slide=5` |

Patient ids are the `id` values in `src/engine/scenario.js` (`PRESETS`); presentation ids are the `id` values in `src/ui/decks/*.js`.

```html
<iframe src="https://qaddodi.github.io/portal-pressure-simulator/?embed&script=hvpg"
        title="Portal Pressure Simulator" style="width:100%;height:640px;border:0"
        allow="fullscreen; screen-wake-lock" loading="lazy"></iframe>
```

Give it room: 16:10 or taller works; below about 480 px wide the phone layout takes over. Leave the corner credit alone.

The app keeps the screen awake while a talk is up (`src/ui/wake-lock.js`); inside an iframe that needs `allow="screen-wake-lock"`.

Pasted links preview with a picture: `/c/<patient id>.html` and `/c/deck-<deck id>.html` carry a 1200 x 630 card made by
`scripts/share-stills.mjs` (`brand/share/`). Re-run it after adding a patient or a deck or changing the look.
