// The modules the gallery page imports, each of which calls registerPanel or registerBench when it loads (registry.js).
// One line per module, in this file only, so threads adding a part touch one line each. Imported by page.js, never by the live app.
//
import './fit-rules-panel.js';   // the Check button (shared fit rules)
// import './benches/index.js';     // the debug benches
export {};
