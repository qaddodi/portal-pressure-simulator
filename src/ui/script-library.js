// The presenter's saved scripts (localStorage) and their share-link encoding: moved out of presenter.js unchanged.

const KEY = 'pps.scripts';
// Only well-formed scripts: a damaged saved value is ignored rather than stopping the library.
// (A script with no steps, or a null step, is dropped too: one bad entry from a hand-edited link or an old import used to stop every start.)
const okScript = (x) => x && typeof x === 'object' && x.id && (x.deck ? typeof x.deck === 'object' : x.steps == null || (Array.isArray(x.steps) && x.steps.every((st) => st && typeof st === 'object')));
// alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
export const readMine = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(okScript) : []; } catch { return []; } };
// (Says whether it kept them: storage that is full or blocked used to report "Script created" for a script that was not there.)
// alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
export const writeMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };
export const NO_ROOM = 'This device has no room to keep scripts. Free some browser storage and try again.';
export const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
