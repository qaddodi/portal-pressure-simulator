// The modules the gallery page imports, each of which calls registerPanel or registerBench when it loads (registry.js).
// One line per module, in this file only, so threads adding a part touch one line each. Imported by page.js, never by the live app.
//
import './fit-rules-panel.js';   // the Check button (shared fit rules)
import './benches/index.js';   // the debug benches (camera, slow motion, procedures, memory loop, flags, looks, words, model, glyphs)
import './sweep-panel.js';   // the Sweep button (every or the affected specimens, one report)
import '../packet/gallery-panel.js';   // the What's-wrong-here button (the bug packet)
export {};
