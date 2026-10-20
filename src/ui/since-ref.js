// The network a "change since" slide counts from (deck visuals V11, ext-highlights.js: lens 'since'). The stage holds it (stage.js
// changeRef) and registers how to read it here, so the lobule's colours count the change from the very same state the vessels on
// the figure do, and the figure key's "Change vs …" is true in both.
let source = null;
/** The stage hands over the reader of its reference (a Float32Array of node pressures, or null). */
export const sinceSource = (fn) => { source = typeof fn === 'function' ? fn : null; };
/** The reference now, or null before the stage has registered one. */
export const sinceNow = () => source?.() || null;
