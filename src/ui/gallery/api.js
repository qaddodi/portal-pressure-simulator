// The gallery's test controls, window.pps.gallery (plan faster-checks-recs 3): plain-JSON calls a harness, a sweep or a thread in the browser console
// can drive the page with, and the signal that says a specimen has landed. Pure of the page: page.js hands in what it owns (the opener, the look,
// the layout reads) and this file adds the contract, so tests/gallery-api.test.js runs it with a fake page.
//
//   pps.gallery.list({ family, section, kind })        [{ id, section, family, kind, title }]
//   pps.gallery.open(id, { look, timeoutMs })          Promise<{ id, ok, settled, ms, look, errors, error? }>   (resolves once the specimen has landed)
//   pps.gallery.settled({ timeoutMs, quietMs })        Promise<{ settled, ms }>   (nothing moving for quietMs; call it after a resize too)
//   pps.gallery.check()                                { id, look, size, problems: [{ kind, text, line, where }], busy, slide, structure }
//   pps.gallery.words()                                { id, look, vw, vh, cards: { selector: [words] } }
//   pps.gallery.boxes()                                { id, look, vw, vh, boxes: { selector: [l, t, r, b] } }   (rounded to 2 px)
//   pps.gallery.slide(deck, i, { timeoutMs })          Promise<{ deck, i, n, ok, settled, ms, errors, error? }>   (a REAL deck's slide i, 0-based: starts the deck or steps in it, resolves once it has landed)
//   pps.gallery.edges()                                { id, look, vw, vh, shuf, front, cards: [...] }   (edge-rules.js: each card's words against its visible edge and the screen's)
//   pps.gallery.shuffleTo(0 | 1)                       Promise<{ ok, settled }>   (the Shuffle's card in front: 0 the words, 1 the instrument; false when no shuffle is on)
//   pps.gallery.sweep(spec)                            runs the registered sweep runner (registerSweep); the loop and its resume are sweep.js's
//   pps.gallery.mark(state, id)                        sets the root attribute (page.js marks the openings a person starts: Browse, the arrows, Next inside a talk)
//   pps.gallery.registerSweep(fn)                      fn(spec, api) -> report; the Sweep button's runSweep plugs in here
//
// The root (document.documentElement) carries data-gallery-state="opening|settled|failed" and data-gallery-id; a harness waits on the attribute.
// ?gallery&sweep=<all | affected | a family | ids:a,b>&looks=light,navy[&with=check,words,boxes][&fresh=1] starts the sweep at boot (parseSweepAddress,
// startFromAddress) and writes the report to window.ppsGalleryResult and <pre id="gallery-result">, with data-gallery-sweep="running|done|failed".
//
// The settled test is sampled only while somebody waits (one timer, 100 ms, gone when the wait ends): the presenter and the camera announce no "done"
// event, so a quiet window is the honest signal. Nothing here runs per frame or when no call is waiting.

import { pageBusy, waitQuiet, QUIET_MS, POLL_MS } from '../screen/settle.js';

export const STATE_ATTR = 'data-gallery-state';
export const SWEEP_ATTR = 'data-gallery-sweep';
export const RESULT_ID = 'gallery-result';
export const WITH_ALL = ['check', 'words', 'boxes'];

/**
 * What the address asks for: null without `sweep`, else { all | affected | family | ids, looks, with, fresh }.
 * `sweep=` (or all, or 1): every specimen; `sweep=affected`: the ones the last push touched; `sweep=ids:a/b,c/d`: those; any other word: that family.
 * `looks=` keeps only the looks the page knows (lookIds); `with=` picks what each specimen records (default check).
 */
export function parseSweepAddress(search, lookIds = ['light', 'soft', 'dark', 'navy', 'black']) {
  const q = new URLSearchParams(search || '');
  if (!q.has('sweep')) return null;
  const v = (q.get('sweep') || '').trim();
  const spec = {};
  if (v === '' || v === 'all' || v === '1') spec.all = true;
  else if (v === 'affected') spec.affected = true;
  else if (v.startsWith('ids:')) spec.ids = v.slice(4).split(',').map((s) => s.trim()).filter(Boolean);
  else spec.family = v;
  spec.looks = (q.get('looks') || '').split(',').map((s) => s.trim()).filter((s) => lookIds.includes(s));
  const w = (q.get('with') || 'check').split(',').map((s) => s.trim()).filter((s) => WITH_ALL.includes(s));
  spec.with = w.length ? w : ['check'];
  spec.fresh = q.get('fresh') === '1';
  return spec;
}

export { pageBusy as probeBusy };   // (the one probe is screen/settle.js: this name is kept for the page, the packet and the tests)

/** The sum of the app's counted errors (pps.caught()), so open() can say how many happened while a specimen opened. */
export function errorTotal(pps) {
  try { return Object.values(pps?.caught?.() || {}).reduce((n, r) => n + (r.n || 0), 0); } catch { return 0; }
}

/** Writes a sweep's report where a harness reads it: window.ppsGalleryResult, <pre id="gallery-result">, data-gallery-sweep. */
export function publishResult(report, { doc = document, win = window, state = 'done' } = {}) {
  win.ppsGalleryResult = report;
  let pre = doc.getElementById(RESULT_ID);
  if (!pre) { pre = doc.createElement('pre'); pre.id = RESULT_ID; pre.hidden = true; pre.setAttribute('aria-hidden', 'true'); (doc.body || doc.documentElement).append(pre); }
  pre.textContent = JSON.stringify(report);
  doc.documentElement.setAttribute(SWEEP_ATTR, state);
}

const sleepFor = (ms) => new Promise((ok) => setTimeout(ok, ms));
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * env (what the page owns):
 *   entries, byId     the catalog
 *   go(id)            opens a specimen (page.js's go), resolves when its opener returned
 *   setLook(id), look()      the look
 *   busy()            true while something still arrives (default pageBusy(pps, doc), screen/settle.js)
 *   check(), words(), boxes()   the page's own readers, raw (runCheck's result, readWords, readBoxes); the API strips elements
 *   id()              the open specimen's id (default: the last one api.open opened)
 *   size()            { w, h } of the screen
 *   errors()          the app's counted errors so far (default errorTotal(pps))
 *   affected()        Promise<ids> for `sweep: affected` (the push's touched specimens)
 *   doc, sleep, now   for tests
 */
export function createGalleryApi(env) {
  const doc = env.doc || document;
  const sleep = env.sleep || sleepFor, now = env.now || nowMs;
  const busy = env.busy || (() => pageBusy(env.pps, doc));
  const errors = env.errors || (() => errorTotal(env.pps));
  let current = null, runner = null;
  const setState = (s, id) => { doc.documentElement.setAttribute(STATE_ATTR, s); if (id != null) doc.documentElement.setAttribute('data-gallery-id', id); };
  const brief = (e) => ({ id: e.id, section: e.section, family: e.family, kind: e.kind, title: e.title });

  function list(f = {}) {
    return env.entries.filter((e) => (!f.family || e.family === f.family) && (!f.section || e.section === f.section) && (!f.kind || e.kind === f.kind)).map(brief);
  }

  const settled = ({ timeoutMs = 30000, quietMs = QUIET_MS, pollMs = POLL_MS } = {}) => waitQuiet(busy, { timeoutMs, quietMs, pollMs, now, sleep });

  async function open(id, { look, timeoutMs } = {}) {
    const e = env.byId[id];
    if (!e) { setState('failed', id); return { id, ok: false, settled: false, ms: 0, look: env.look(), errors: 0, error: `no specimen "${id}"` }; }
    const t0 = now(), err0 = errors();
    setState('opening', id);
    let error;
    try {
      if (look) env.setLook(look);
      await env.go(id);
      current = id;
    } catch (x) { error = x?.message || String(x); }
    const s = error ? { settled: false } : await settled({ timeoutMs });
    const n = errors() - err0;
    const ok = !error && s.settled;
    setState(ok ? 'settled' : 'failed', id);
    const out = { id, ok, settled: !!s.settled, ms: Math.round(now() - t0), look: env.look(), errors: n };
    if (error) out.error = error; else if (!s.settled) out.error = 'did not settle in time';
    return out;
  }

  /** A real deck's slide (0-based): the deck is started at it, or the presenter steps there when that deck is already open. */
  async function slide(deck, i, { timeoutMs } = {}) {
    const p = env.pps?.presenter;
    const t0 = now(), err0 = errors();
    const id = `${deck}#${i + 1}`;
    setState('opening', id);
    let error;
    try {
      if (!p) throw new Error('no presenter');
      const at = p.position?.();
      if (at && at.id === deck) p.go(i); else await p.start(deck, i);
      current = id;
    } catch (x) { error = x?.message || String(x); }
    const s = error ? { settled: false } : await settled({ timeoutMs });
    const ok = !error && s.settled;
    setState(ok ? 'settled' : 'failed', id);
    let n = '';
    try { n = `${(p.position?.()?.at ?? i) + 1}/${p.count?.() ?? '?'}`; } catch { /* (no count) */ }
    const out = { deck, i, n, ok, settled: !!s.settled, ms: Math.round(now() - t0), errors: errors() - err0 };
    if (error) out.error = error; else if (!s.settled) out.error = 'did not settle in time';
    return out;
  }
  /** The Shuffle's card in front (0 the words, 1 the instrument), and the wait for it to land. */
  async function shuffleTo(to, { timeoutMs = 20000 } = {}) {
    const sh = env.pps?.presenter?.shuffle?.();
    if (!sh || !sh.active?.()) return { ok: false, settled: false };
    sh.go(to);
    const s = await settled({ timeoutMs });
    return { ok: true, settled: s.settled };
  }

  const where = () => ({ id: env.id ? env.id() : current, look: env.look() });
  function check() {
    const r = env.check();
    const sz = env.size();
    return { ...where(), size: sz, problems: r.problems.map((p) => ({ kind: p.kind, text: p.text, line: p.line, where: p.where })), busy: !!r.busy, slide: !!r.slide, structure: !!r.structure };
  }
  const words = () => ({ ...where(), ...env.words() });
  const boxes = () => ({ ...where(), ...env.boxes() });
  const edges = () => ({ ...where(), ...(env.edges ? env.edges() : { cards: [] }) });

  function registerSweep(fn) { runner = fn; return true; }
  async function sweep(spec = {}) {
    if (!runner) throw new Error('no sweep runner is registered (the Sweep panel registers one)');
    return runner(spec, api);
  }
  /** Boot: ?gallery&sweep=... starts the sweep and publishes the report. Returns the report, or null when the address asks for none. */
  async function startFromAddress(search, { win = window, lookIds } = {}) {
    const spec = parseSweepAddress(search, lookIds);
    if (!spec) return null;
    if (spec.affected && env.affected) spec.ids = await env.affected();
    doc.documentElement.setAttribute(SWEEP_ATTR, 'running');
    try {
      const report = await sweep(spec);
      publishResult(report, { doc, win, state: 'done' });
      return report;
    } catch (x) {
      const report = { ok: false, error: x?.message || String(x), spec };
      publishResult(report, { doc, win, state: 'failed' });
      return report;
    }
  }

  const api = { list, open, settled, check, words, boxes, edges, slide, shuffleTo, sweep, registerSweep, startFromAddress, mark: setState, get running() { return !!runner; } };
  return api;
}
