// Timers and callbacks owned by one thing that can end (a talk, a view, a gesture). See docs/scheduling.md.
import { caught } from './caught.js';

/**
 * A disposable scope (R03, 3 Nov 2026; moved to its own file under PR-10, 4 Nov 2026, so the stage can own one per view and one per gesture): the timers and callbacks one talk starts. timer(fn, ms) is setTimeout whose
 * callback runs only while the scope is live; dispose() clears every timer still waiting, runs the onDispose functions (newest first)
 * and makes later calls do nothing, so nothing a closed talk started can reach a talk that began after it.
 */
export function createScope() {
  let dead = false;
  const ids = new Set(), offs = [], ivs = new Set();
  return {
    live: () => !dead,
    timer(fn, ms) {
      if (dead) return 0;
      const id = setTimeout(() => { ids.delete(id); if (!dead) fn(); }, ms);
      ids.add(id);
      return id;
    },
    clear(id) { clearTimeout(id); ids.delete(id); },
    /** setInterval whose callback runs only while the scope is live; dispose() stops it. Returns the id (0 once disposed). */
    interval(fn, ms) {
      if (dead) return 0;
      const id = setInterval(() => { if (!dead) fn(); }, ms);
      ivs.add(id);
      return id;
    },
    clearInterval(id) { clearInterval(id); ivs.delete(id); },
    onDispose(fn) { if (dead) { try { fn(); } catch (e) { caught('scope', e); /* given back already */ } return; } offs.push(fn); },
    dispose() {
      if (dead) return;
      dead = true;
      for (const id of ids) clearTimeout(id);
      ids.clear();
      for (const id of ivs) clearInterval(id);
      ivs.clear();
      for (const f of offs.splice(0).reverse()) { try { f(); } catch (e) { caught('scope', e); /* the rest still run */ } }
    },
    pending: () => ids.size + ivs.size,
  };
}
