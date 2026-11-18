// The state link of a bug packet (plan screen-report-recs section 3): a plain app address that puts the app back where it was when a person pressed
// "What's wrong here?". It is the app's own share link (`#s=`: patient, what was changed from it, view, selection, camera) with what that link never
// carried added: the talk and slide (`?script=&slide=`, the app's own deep link), and the rest of the screen's state as an `x` part of the share payload itself
// (the look, the colour lens, label level, layers, the Lobule or Sinusoid view, the open instruments, the model running or not, the screen's size). The app's own
// reader (share-link.js cleanShare) leaves `x` out, so the link opens in any build; packet/trigger.js applies it on the preview copy. No new address switch.
//
// Pure of the page except `captureState` (reads window.pps) and `applyExtras` (calls it). Nothing here runs per frame.
//
//   captureState(pps, { doc })         what the app is showing now, as a state object
//   stateLink(state, base)             the address for it
//   readStateLink(href)                the state back from an address (what a replay opens)
//   applyExtras(x, pps, { doc })       puts the `x` part on a booted page (the share link and the talk are the app's own load paths)
//   changedFrom(base, now)             the settings that differ from the patient's own, as { 'a.b.c': [was, now] } (for the readable text)

import { parseShare, cleanShare, encodeShare } from '../share-link.js';

export const STATE_V = 1;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const LOOK_IDS = ['light', 'soft', 'dark', 'navy', 'black'];
const LABELS = ['key', 'all', 'none'];
const ID = /^[\w-]{1,40}$/;

/** Settings that differ between two params trees: the nested object of what is different (arrays and leaves replaced whole), or null for none. */
export function diffParams(base, now) {
  if (!isObj(now)) return null;
  const out = {};
  for (const k of Object.keys(now)) {
    if (UNSAFE.has(k)) continue;
    const a = isObj(base) ? base[k] : undefined, b = now[k];
    if (isObj(b)) { const d = diffParams(isObj(a) ? a : {}, b); if (d) out[k] = d; } else if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = b;
  }
  return Object.keys(out).length ? out : null;
}

/** The same difference as a flat list for people: { path: [was, now] }. */
export function changedFrom(base, now, path = '', out = {}) {
  if (!isObj(now)) return out;
  for (const k of Object.keys(now)) {
    const p = path ? `${path}.${k}` : k, a = isObj(base) ? base[k] : undefined, b = now[k];
    if (isObj(b)) changedFrom(a, b, p, out); else if (JSON.stringify(a) !== JSON.stringify(b)) out[p] = [a === undefined ? null : a, b];
  }
  return out;
}

/** Keeps only what the app can apply from the `x` part of an address's share payload (it is read from a URL anyone can edit): known look, label level, plain flags, instrument ids. */
export function cleanExtras(x) {
  if (!isObj(x)) return {};
  const o = {};
  if (LOOK_IDS.includes(x.look)) o.look = x.look;
  if (typeof x.lens === 'string' && /^[a-z-]{1,24}$/.test(x.lens)) o.lens = x.lens;
  if (LABELS.includes(x.labels)) o.labels = x.labels;
  for (const k of ['layers', 'lobuleLayers']) if (isObj(x[k])) { const f = {}; for (const [n, v] of Object.entries(x[k])) if (ID.test(n) && typeof v === 'boolean') f[n] = v; o[k] = f; }
  for (const k of ['lobule', 'sinusoid', 'running']) if (typeof x[k] === 'boolean') o[k] = x[k];
  if (Array.isArray(x.dock)) o.dock = x.dock.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 4);
  if (x.mode === 'explore' || x.mode === 'present') o.mode = x.mode;
  if (Number.isFinite(x.speed) && x.speed >= 0 && x.speed <= 1000) o.speed = x.speed;
  for (const k of ['vw', 'vh']) if (Number.isFinite(x[k]) && x[k] >= 200 && x[k] <= 5000) o[k] = Math.round(x[k]);
  if (Number.isFinite(x.dpr) && x.dpr >= 0.5 && x.dpr <= 5) o.dpr = Math.round(x.dpr * 100) / 100;
  return o;
}

/**
 * What the app shows now (window.pps): the share link's own parts (patient, what was changed from it, view, selection, camera) and the rest.
 * `share.params` is the change from the patient the app loaded (store.presetParams), not the whole tree, so a link stays short and a reader sees what was altered.
 * Returns { v, share, script, slide, x }.
 */
export function captureState(pps, { doc = globalThis.document, win = globalThis } = {}) {
  const st = pps.store.get();
  const share = { v: 1, preset: st.presetId, view: st.view };
  const base = st.presetParams && st.presetParams.id === st.presetId ? st.presetParams.params : null;
  const delta = base ? diffParams(base, st.params) : st.params;
  if (delta) share.params = delta;
  if (st.selection) share.sel = st.selection;
  if (!st.lobule) { try { const c = pps.stage?.cameraState?.(); if (c) share.cam = { k: c.k, x: c.x, y: c.y }; } catch { /* (a stage that cannot say) */ } }
  let pos = null;
  try { pos = pps.presenter?.position?.() || null; } catch { /* (no presenter) */ }
  const x = { lens: st.colorMode, labels: st.labelLevel, layers: { ...st.layers }, running: !!st.running };
  if (st.lobule) x.lobule = true;
  if (st.sinusoid) x.sinusoid = true;
  if (st.lobule) x.lobuleLayers = { ...st.lobuleLayers };
  if (st.mode && st.mode !== 'explore') x.mode = st.mode;
  if (st.speed != null && st.speed !== 1) x.speed = st.speed;
  try { const l = doc?.documentElement?.getAttribute('data-palette') || doc?.documentElement?.getAttribute('data-theme'); if (LOOK_IDS.includes(l)) x.look = l; } catch { /* (no document) */ }
  try { x.dock = [...(doc?.querySelectorAll?.('.dock-pane[data-pane]') || [])].map((e) => e.getAttribute('data-pane')).filter((id) => pps.dock?.isOpen?.(id)); } catch { /* (no dock) */ }
  if (win?.innerWidth) { x.vw = Math.round(win.innerWidth); x.vh = Math.round(win.innerHeight); x.dpr = win.devicePixelRatio || 1; }
  const state = { v: STATE_V, share, x: cleanExtras(x) };
  if (pos?.id) { state.script = pos.id; state.slide = (pos.at | 0) + 1; }
  return state;
}

const PKT_KEYS = ['script', 'slide', 'back', 'r', 'gallery', 'sweep'];
/** The address for a state: the page's own path, `?script=&slide=&back=1`, `#s=` (the share payload, with `x`). `back=1` makes the app open it quietly (no case card, no "shared scenario" toast). */
export function stateLink(state, base) {
  const u = new URL(base);
  for (const k of PKT_KEYS) u.searchParams.delete(k);
  if (state.script) { u.searchParams.set('script', state.script); u.searchParams.set('slide', String(state.slide || 1)); }
  const x = cleanExtras(state.x);
  u.searchParams.set('back', '1');
  u.hash = state.share ? `#s=${encodeShare(Object.keys(x).length ? { ...state.share, x } : state.share)}` : '';
  return u.href;
}

/** The state an address carries ({ v, share, script, slide, x }), prototype-safe and checked as the app reads its own links. */
export function readStateLink(href, presetIds = null) {
  const u = new URL(href);
  const m = u.hash.match(/#s=([\w-]+)/);
  const raw = m ? parseShare(m[1]) : null;
  const share = raw ? cleanShare(raw, presetIds) : null;
  const x = cleanExtras(raw?.x);
  const out = { v: STATE_V, share: share || null, x };
  const script = u.searchParams.get('script');
  if (script && /^[\w-]{1,60}$/.test(script)) { out.script = script; out.slide = Math.max(1, parseInt(u.searchParams.get('slide'), 10) || 1); }
  return out;
}

/** The base of a state link: the page's own address without its query and hash. */
export const baseOf = (loc) => `${loc.origin}${loc.pathname}`;

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
/**
 * Puts the `pkt` part of a state on a booted page, through the app's own writers (the store, the look attributes, the dock, the stage). The patient, what was changed
 * from it, view, selection and camera are the share link's, and the talk is the deep link's: the app applies those at boot, so this runs after `store.booted`.
 * Returns the names of what it could not apply. Calls only what pps offers; a missing one is listed, not thrown.
 */
export async function applyExtras(x, pps, { doc = globalThis.document, sleep = wait } = {}) {
  const x2 = cleanExtras(x), skipped = [];
  const st = () => pps.store.get();
  const tryDo = async (name, fn) => { try { await fn(); } catch (e) { skipped.push(`${name}: ${e?.message || e}`); } };
  if (x2.look && pps.lookNow) await tryDo('look', () => pps.lookNow(x2.look)); else if (x2.look) skipped.push('look: pps.lookNow is missing');
  if (x2.lens && st().colorMode !== x2.lens) await tryDo('lens', () => pps.store.set({ colorMode: x2.lens }));
  if (x2.labels && st().labelLevel !== x2.labels) await tryDo('labels', () => pps.store.set({ labelLevel: x2.labels }));
  if (x2.layers) await tryDo('layers', () => pps.store.set({ layers: { ...st().layers, ...x2.layers } }));
  if (x2.lobule && !st().lobule) await tryDo('lobule', async () => { pps.stage.askSinusoid?.(false); pps.stage.diveToLobule(); });
  if (x2.lobuleLayers) await tryDo('lobuleLayers', () => pps.store.set({ lobuleLayers: { ...st().lobuleLayers, ...x2.lobuleLayers } }));
  if (x2.sinusoid && !st().sinusoid) await tryDo('sinusoid', () => (st().lobule ? pps.stage.askSinusoid() : pps.stage.diveToSinusoid()));
  if (x2.dock?.length) for (const id of x2.dock) await tryDo(`dock ${id}`, () => pps.dock.show(id, { reveal: true }));
  if (x2.speed != null && pps.host?.send) await tryDo('speed', () => { pps.store.set({ speed: x2.speed, lapse: 0 }); pps.host.send({ type: 'run', speed: x2.speed, clock: 'hemo' }); });
  if (x2.running === false && st().running !== false && pps.host?.send) await tryDo('running', () => { pps.host.send({ type: 'run', running: false }); pps.store.set({ running: false }); });
  await sleep(0);
  return skipped;
}

/** Applies the `x` part of an address's share payload once the app has booted; the page calls it on the preview copy only (main.js, packet/trigger.js). Returns what it skipped, or null when there was none to apply. */
export async function applyFromAddress(pps, { hash = globalThis.location?.hash, doc } = {}) {
  const m = String(hash || '').match(/#s=([\w-]+)/);
  const x = cleanExtras(m ? parseShare(m[1])?.x : null);
  if (!Object.keys(x).length) return null;
  await new Promise((ok) => {
    if (pps.store.get().booted) { ok(); return; }
    const off = pps.store.on('booted', (v) => { if (v) { off?.(); ok(); } });
  });
  return applyExtras(x, pps, { doc });
}
