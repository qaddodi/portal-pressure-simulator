// The console handle window.pps: one object that every module that has something to offer adds to (caught.js: caught, report.js: report,
// gl-contexts.js: contexts), and that main.js fills at boot. main.js used to ASSIGN a fresh object, which dropped what the others had put there first:
// pps.report (the device report's lines) and pps.contexts were gone from every page (SHL-3, 19 Nov 2026).
//
// `extendHandle(handle, props)` adds the properties of `props` to `handle` with their descriptors, so a getter (pps.perf, pps.credit) stays a getter
// (Object.assign would call it once, at boot) and what was already there stays unless `props` names it. Returns the handle.
/** @param {Record<string, any>} handle @param {Record<string, any>} props */
export function extendHandle(handle, props) {
  return Object.defineProperties(handle, Object.getOwnPropertyDescriptors(props));
}
