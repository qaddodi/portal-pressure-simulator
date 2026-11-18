// The gallery page's plug-in points (docs/card-gallery.md). Pure data and functions: no DOM, so a unit test can import it.
//
//   registerPanel({ id, title, mount(host, ctx) })   a tool in the page's top bar and info drawer (the Check button, Freeze, ...).
//   registerBench({ id, title, group, summary, mount(host, ctx) })   a debug bench: one entry in the rail under "Benches",
//                                                     opened into the page's stage area (camera grid, slow motion, memory loop, ...).
//
// mount(host, ctx) draws into `host` (an element the page owns and empties when the person moves on) and may return a function
// (or { dispose }) that undoes everything it started: timers, listeners, frame requests (frameFor tags), GPU contexts. The page
// calls it before it unmounts `host`.
//
// ctx (made by page.js):
//   ctx.pps                 window.pps, the app's own controls (store, dock, card, loadPreset, presenter, host, stage ...)
//   ctx.specimen()          the open catalog entry ({ id, section, family, title, ... }) or null
//   ctx.onSpecimen(fn)      fn(entry | null) on every change; returns an off() function
//   ctx.look() / ctx.setLook(id)   the current look id ('light' | 'soft' | 'dark' | 'navy' | 'black') and a switch with no reload
//   ctx.toast(text) / ctx.say(text)   a short message on the page (the same call)
//   ctx.copy(text)          puts text on the clipboard; resolves true when it worked
//   ctx.catalog             the catalog module's exports (CATALOG, byId, sections ...)
//
// A module registers itself when it is imported; plugins.js lists the modules the page imports (one line each). Each part is
// registered under a unique id; a second registration of an id is ignored and counted in clashes() (tests/gallery-registry.test.js).

const panels = new Map(), benches = new Map(), clash = [];

function check(kind, o) {
  if (!o || typeof o !== 'object') throw new TypeError(`${kind}: an object is needed`);
  if (typeof o.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(o.id)) throw new TypeError(`${kind}: id must be lower-case words joined by dashes (${String(o.id)})`);
  if (typeof o.title !== 'string' || !o.title.trim()) throw new TypeError(`${kind} ${o.id}: a title is needed`);
  if (typeof o.mount !== 'function') throw new TypeError(`${kind} ${o.id}: mount(host, ctx) is needed`);
}

/** Adds a tool to the page's top bar and drawer. Returns true when added, false when the id was already taken. */
export function registerPanel(o) {
  check('panel', o);
  if (panels.has(o.id)) { clash.push(`panel ${o.id}`); return false; }
  panels.set(o.id, { order: 50, ...o });
  return true;
}

/** Adds a debug bench to the rail. group names its heading ('Camera', 'Motion', 'Memory', 'Diagnostics', 'Data'...). */
export function registerBench(o) {
  check('bench', o);
  if (benches.has(o.id)) { clash.push(`bench ${o.id}`); return false; }
  benches.set(o.id, { order: 50, group: 'Benches', summary: '', ...o });
  return true;
}

const byOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title);
export const panelList = () => [...panels.values()].sort(byOrder);
export const benchList = () => [...benches.values()].sort(byOrder);
export const clashes = () => clash.slice();
/** The ids registered, for the coverage test. */
export const registered = () => ({ panels: [...panels.keys()], benches: [...benches.keys()] });
/** Runs a mount and returns one dispose function that is safe to call twice. */
export function mountPart(part, host, ctx) {
  let off = null, done = false;
  try { off = part.mount(host, ctx); } catch (err) { console.error(`[gallery] ${part.id}:`, err); }   // alloc-rare: a part that throws loses only itself
  return () => {
    if (done) return; done = true;
    try { (typeof off === 'function' ? off : off?.dispose)?.call(off); } catch (err) { console.error(`[gallery] ${part.id} dispose:`, err); }   // alloc-rare
    host.replaceChildren?.();
  };
}
