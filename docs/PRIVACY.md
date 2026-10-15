# Privacy

Portal Pressure Simulator runs entirely in the browser.

- **No tracking.** No analytics, advertising, fingerprinting or third-party scripts. Fonts are
  served from the same site; the app makes no requests to any other origin.
- **No accounts, no server storage.** There is no backend. The publisher receives no personal
  data.
- **What stays on the device** (browser `localStorage`, keys starting with `pps.`): preferences
  (theme, units) and presenter scripts. *Menu › Privacy* lists what is stored and
  clears it.
- **What leaves the device**, only by the user's action: shared links and script files (which
  contain the model state or a script). Inside an LMS (SCORM) no score is reported.
- **Offline cache.** A service worker caches the app's own files so it works offline. It caches
  nothing else.

For institutions this supports FERPA and GDPR compliance: the LMS remains the system of record,
and no student data is processed by the publisher.
