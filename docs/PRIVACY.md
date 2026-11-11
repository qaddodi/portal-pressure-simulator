# Privacy

Portal Pressure Simulator runs entirely in the browser. Updated 11 November 2026.

- **No tracking.** No analytics, advertising, fingerprinting or third-party scripts. Fonts are
  served from the same site; the app makes no requests to any other origin.
- **No accounts, no server storage.** There is no backend. The publisher receives no personal
  data.
- **What stays on the device** (browser `localStorage`, keys starting with `pps.`): preferences
  (appearance, figure and label settings, quality), presenter scripts you create, and where each
  presentation was left (so the Present menu can offer Resume). A short ring of recent errors and
  a reload count are kept for the feedback draft (the ring in `sessionStorage`, gone when the tab
  closes). *Help › Privacy* lists the stored keys and clears them.
- **What leaves the device**, only by the user's action: shared links and script files (which
  contain the model state or a script). *Send feedback* (in Settings) opens a draft in the
  user's own email app, with the device, screen size, frame speed, recent errors and a link to
  the view. Nothing is sent unless the user sends that email. Inside an LMS (SCORM) no score is
  reported.
- **Offline cache.** A service worker caches the app's own files so it works offline. It caches
  nothing else.

For institutions this supports FERPA and GDPR compliance: the LMS remains the system of record,
and no student data is processed by the publisher.
