// The gallery page (plan section 2.4): the real app with a debug panel on top, at /preview/?gallery. Loaded only by main.js, only on the
// preview copy and only with ?gallery in the address (scripts/lazy-imports.json); the live site never reads it.
//
//   top bar     Browse (the catalog), previous and next specimen, the open specimen's name, Tools
//   Browse      a search box and the catalog as a tree: teaching cards, Tests card, structure cards, sheets, figure, benches
//   Tools       the look, Freeze, Shoot, Copy link, the open specimen's fields and the real slides that use it, then every registered panel (Check ...)
//   Shoot       the bar and sheets away; one small label names the picture; L next look, [ and ] step, Esc leaves
//   benches     registry.js: each opens over the stage and is disposed when closed
//
// A specimen is the real thing: a teaching card is a slide of the generated gallery deck (deck.js) played by the real presenter; a main-app card is opened
// through window.pps (openers.js). Nothing here runs per frame: every read and write happens in a tap or a key press.

import { CATALOG, SECTIONS, LOOK_IDS, DEVICES, byId, sid } from './catalog.js';
import { galleryDeck } from './deck.js';
import { benchList, panelList, mountPart } from './registry.js';
import { openEntry } from './openers.js';
import './plugins.js';
import { fadeShown, toast as appToast } from '../util.js';
import { currentLook } from '../looks.js';
import { readBox, readRects, readStyle, readMetric, readCTM, readAnims } from '../layout-snap.js';
import { createGalleryApi, probeBusy } from './api.js';
import { readWords, readBoxes } from './readers.js';
import { runCheck } from './fit-check.js';

/** The id the presenter gives the gallery deck: the Testing decks are listed as 'test-' + their own id (presenter.js testingLoad). */
export const DECK_ID = 'test-gallery';
const IO = { box: readBox, rects: readRects, style: readStyle, metric: readMetric, ctm: readCTM };
const LOOK_NAMES = { light: 'Light', soft: 'Soft', dark: 'Dark', navy: 'Navy', black: 'Black' };

const CSS = `
.gl { --gl-bg: rgba(250, 249, 247, .96); --gl-ink: #1b1b1d; --gl-ink2: #5b5a57; --gl-line: rgba(0,0,0,.16); --gl-on: #1b1b1d; --gl-onink: #fff; --gl-red: #c8282e; /* colour-exempt: the debug page's own chrome */
  font: 500 13px/1.35 var(--font-ui, system-ui, -apple-system, 'Segoe UI', sans-serif); color: var(--gl-ink); }
:root[data-theme="dark"] .gl, :root[data-theme="soft"] .gl.gl-soft { --gl-bg: rgba(28, 28, 32, .96); --gl-ink: #efefef; --gl-ink2: #a8a8ad; --gl-line: rgba(255,255,255,.2); --gl-on: #efefef; --gl-onink: #17171a; --gl-red: #ff6b70; } /* colour-exempt: the debug page's own chrome */
.gl * { box-sizing: border-box; }
.gl button { font: inherit; font-weight: 600; color: inherit; min-height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--gl-line); background: transparent; cursor: pointer; }
.gl button[aria-pressed="true"], .gl button[aria-current="true"] { background: var(--gl-on); color: var(--gl-onink); border-color: var(--gl-on); }
.gl button:focus-visible, .gl input:focus-visible { outline: 2px solid var(--gl-red); outline-offset: 2px; }
.gl-bar { position: fixed; left: 8px; top: 8px; right: 8px; z-index: var(--z-diag, 300); display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 13px; background: var(--gl-bg); border: 1px solid var(--gl-line); box-shadow: 0 6px 24px -8px rgba(0,0,0,.35); max-width: 760px; } /* colour-exempt: the debug page's own chrome */
.gl-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
.gl-name small { display: block; color: var(--gl-ink2); font-weight: 500; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.gl-sheet { position: fixed; z-index: var(--z-diag, 300); background: var(--gl-bg); border: 1px solid var(--gl-line); box-shadow: 0 12px 40px -12px rgba(0,0,0,.45); border-radius: 14px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; } /* colour-exempt: the debug page's own chrome */
.gl-rail { left: 8px; top: 62px; bottom: 8px; width: min(340px, calc(100vw - 16px)); }
.gl-tools { right: 8px; top: 62px; bottom: 8px; width: min(380px, calc(100vw - 16px)); }
.gl-sheet[hidden] { display: none; }
@media (max-width: 700px) { .gl-rail, .gl-tools { left: 8px; right: 8px; width: auto; top: auto; bottom: 8px; max-height: 72vh; } }
.gl-head { display: flex; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--gl-line); }
.gl-head input { flex: 1; min-width: 0; min-height: 34px; font: inherit; padding: 0 10px; border-radius: 9px; border: 1px solid var(--gl-line); background: transparent; color: inherit; }
.gl-body { overflow-y: auto; overflow-x: hidden; padding: 6px 8px 12px; flex: 1; min-height: 0; overscroll-behavior: contain; }
.gl-h { margin: 12px 4px 4px; color: var(--gl-ink2); font-size: 12px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.gl-f { margin: 8px 4px 2px; font-weight: 650; }
.gl-item { display: block; width: 100%; text-align: left; min-height: 32px; padding: 4px 8px; border: 0; border-radius: 8px; font-weight: 500; }
.gl-item small { color: var(--gl-ink2); display: block; font-size: 12px; }
.gl-item[aria-current="true"] small { color: inherit; opacity: .8; }
.gl-sec { padding: 8px 4px; border-bottom: 1px solid var(--gl-line); }
.gl-sec h3 { margin: 0 0 6px; font-size: 12px; font-weight: 650; color: var(--gl-ink2); letter-spacing: .04em; text-transform: uppercase; }
.gl-row { display: flex; flex-wrap: wrap; gap: 6px; }
.gl-pre { margin: 0; padding: 8px; border-radius: 9px; background: rgba(128,128,128,.12); max-height: 30vh; overflow: auto; font: 500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; } /* colour-exempt: the debug page's own chrome */
.gl-links a { display: block; padding: 3px 0; color: inherit; overflow-wrap: anywhere; }
.gl-bench { position: fixed; inset: 62px 8px 8px 8px; z-index: var(--z-diag, 300); background: var(--gl-bg); border: 1px solid var(--gl-line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; }
.gl-bench[hidden] { display: none; }
.gl-bench-host { flex: 1; min-height: 0; overflow: auto; padding: 10px; }
.gl-shoot { position: fixed; left: 8px; top: 8px; z-index: var(--z-diag, 300); padding: 4px 8px; border-radius: 8px; background: var(--gl-bg); border: 1px solid var(--gl-line); font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; max-width: calc(100vw - 16px); overflow-wrap: anywhere; }
.gl-light { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; background: var(--gl-red); }
.gl-light.on { background: #2f9e57; } /* colour-exempt: the debug page's own chrome */
.gl-shooting .gl-bar, .gl-shooting .gl-sheet, .gl-shooting .gl-bench { display: none !important; }
`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, on, label) => { const b = el('button', '', text); b.type = 'button'; b.onclick = on; if (label) b.setAttribute('aria-label', label); return b; };

/** The address's own words: `#doppler/pv-color` names a specimen, `?look=navy` a look. Pure, for the tests. */
export function readAddress(search, hash) {
  const q = new URLSearchParams(search || '');
  const look = q.get('look');
  const id = decodeURIComponent((hash || '').replace(/^#/, '')).split('?')[0];
  return { look: LOOK_IDS.includes(look) ? look : null, id: byId[id] ? id : null };
}
/** The address that opens a specimen in a look. */
export function linkFor(loc, id, look) {
  const q = new URLSearchParams(loc.search || '');
  q.set('gallery', '1');
  if (look) q.set('look', look); else q.delete('look');
  q.delete('script'); q.delete('slide');
  return `${loc.pathname}?${q.toString().replace('gallery=1', 'gallery')}${id ? `#${id}` : ''}`;
}
/** The file name a shot of this specimen takes (plan 3.2): <section>/<specimen>/<state>__<look>__<device>. */
export function shotName(entry, look, device) { return `${entry.section.toLowerCase().replace(/\s+/g, '-')}/${entry.id}/${entry.state || 'default'}__${look}__${device}`; }
/** The device this screen is closest to (by its width), for the shot's name. */
export function deviceOf(w, h) {
  let best = DEVICES[0], gap = Infinity;
  for (const d of DEVICES) { const g = Math.abs(d.w - w) + Math.abs(d.h - h); if (g < gap) { gap = g; best = d; } }
  return best.id;
}

export async function startGallery({ pps = window.pps, root = document } = {}) {
  const deck = galleryDeck();
  const order = deck.slides.map((s) => s.id);   // (slide i of the deck is slide i + 1 in the presenter: its Outline slide is first)
  const entries = CATALOG;
  let open = null, look = currentLook(document.documentElement), frozen = false, shoot = false, benchOff = null;
  const addr = readAddress(location.search, location.hash);

  const style = el('style', '', CSS); document.head.append(style);
  const gl = el('div', 'gl'); gl.dataset.gallery = '';
  const bar = el('div', 'gl-bar'), name = el('div', 'gl-name'), nameMain = el('span'), nameSub = el('small');
  name.append(nameMain, nameSub);
  const rail = el('div', 'gl-sheet gl-rail'), tools = el('div', 'gl-sheet gl-tools');
  rail.hidden = tools.hidden = true;   // off-screen: built hidden, brought in by fadeShown
  const bench = el('div', 'gl-bench'), benchTitle = el('b'), benchHost = el('div', 'gl-bench-host'); bench.hidden = true;   // off-screen: built hidden, brought in by fadeShown
  const toast = (text) => appToast(text);
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
  // The test controls (api.js): window.pps.gallery, the settled attribute, the sweep from the address. `go` is bound below (a function declaration).
  const api = createGalleryApi({
    entries, byId, pps, go: (id) => go(id, { quiet: true, mark: false }), setLook: (id) => setLook(id), look: () => look, id: () => open?.id ?? null,
    busy: () => probeBusy(pps, document, readAnims),
    check: () => runCheck({ io: IO, pps }),
    words: () => readWords(IO), boxes: () => readBoxes(IO),
    size: () => ({ w: readMetric(window, 'innerWidth'), h: readMetric(window, 'innerHeight') }),
    affected: async () => { const r = await fetch(new URL('gallery-affected.json', location.href)); if (!r.ok) throw new Error('no gallery-affected.json beside the page: sweep=affected needs the build to write it'); return r.json(); },
  });
  if (pps) pps.gallery = api;
  const ctx = {
    api, pps, catalog: { CATALOG, byId, SECTIONS, sid },
    specimen: () => open, look: () => look,
    setLook: (id) => setLook(id), go: (id, o) => go(id, o), toast, say: toast, copy,
    onSpecimen: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const listeners = new Set();
  const told = () => { for (const fn of listeners) { try { fn(open); } catch (e) { console.error('[gallery] listener', e); } } };   // alloc-rare: a tap

  // ── The look: on the page's own attributes, never saved (the preview shares its storage with the live site). ──
  function setLook(id) {
    if (!LOOK_IDS.includes(id)) return;
    look = id; pps?.lookNow?.(id);
    for (const b of lookBtns) b.setAttribute('aria-pressed', String(b.dataset.look === id));
    sync();
  }

  // ── Browse: the catalog as a tree ──
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search the catalog'; search.setAttribute('aria-label', 'Search the catalog');
  const tree = el('div', 'gl-body');
  const items = new Map();   // id → button
  function buildTree(q = '') {
    const needle = q.trim().toLowerCase();
    tree.replaceChildren(); items.clear();
    for (const section of SECTIONS) {
      if (section === 'Benches') {
        const bs = benchList().filter((b) => !needle || `${b.title} ${b.group} ${b.id}`.toLowerCase().includes(needle));
        if (!bs.length) continue;
        tree.append(el('div', 'gl-h', 'Benches'));
        let g = null;
        for (const b of bs) {
          if (b.group !== g) { g = b.group; tree.append(el('div', 'gl-f', g)); }
          const it = btn('', () => openBench(b)); it.className = 'gl-item'; it.append(document.createTextNode(b.title)); if (b.summary) it.append(el('small', '', b.summary));
          tree.append(it);
        }
        continue;
      }
      const list = entries.filter((e) => e.section === section && (!needle || `${e.title} ${e.id} ${e.family}`.toLowerCase().includes(needle)));
      if (!list.length) continue;
      tree.append(el('div', 'gl-h', `${section} (${list.length})`));
      let fam = null;
      for (const e of list) {
        if (e.family !== fam) { fam = e.family; tree.append(el('div', 'gl-f', fam)); }
        const it = btn('', () => go(e.id)); it.className = 'gl-item'; it.dataset.id = e.id;
        it.append(document.createTextNode(e.title), el('small', '', e.id));
        if (open?.id === e.id) it.setAttribute('aria-current', 'true');
        items.set(e.id, it); tree.append(it);
      }
    }
    if (!tree.firstChild) tree.append(el('p', 'gl-h', 'Nothing matches.'));
  }
  search.oninput = () => buildTree(search.value);
  const railHead = el('div', 'gl-head'); railHead.append(search, btn('Close', () => sheet(rail, false)));
  rail.append(railHead, tree);

  // ── Tools ──
  const toolBody = el('div', 'gl-body');
  const lookRow = el('div', 'gl-row'), lookBtns = LOOK_IDS.map((id) => { const b = btn(LOOK_NAMES[id], () => setLook(id)); b.dataset.look = id; b.setAttribute('aria-pressed', 'false'); return b; });
  lookRow.append(...lookBtns, btn('Next look', () => nextLook()));
  const freezeBtn = btn('Freeze', () => freeze(!frozen)); freezeBtn.setAttribute('aria-pressed', 'false');
  const shootBtn = btn('Shoot', () => setShoot(true));
  const linkBtn = btn('Copy link', async () => toast((await copy(location.origin + linkFor(location, open?.id, look))) ? 'Link copied.' : 'Copy failed: copy it from the address bar.'));
  const light = el('span', 'gl-light'), lightWords = el('span', '', 'Not settled');
  const settled = el('div'); settled.append(light, lightWords);
  const viewSec = el('div', 'gl-sec'); viewSec.append(el('h3', '', 'Look'), lookRow);
  const actSec = el('div', 'gl-sec'), actRow = el('div', 'gl-row'); actRow.append(freezeBtn, shootBtn, linkBtn, btn('Settled?', () => checkSettled(true))); actSec.append(el('h3', '', 'Picture'), actRow, settled);
  const infoSec = el('div', 'gl-sec'), infoPre = el('pre', 'gl-pre'), infoLinks = el('div', 'gl-links');
  infoSec.append(el('h3', '', 'This specimen'), infoPre, el('h3', '', 'Real slides that use it'), infoLinks);
  const panelSec = el('div', 'gl-sec'); panelSec.append(el('h3', '', 'Panels'));
  toolBody.append(viewSec, actSec, infoSec, panelSec);
  const toolHead = el('div', 'gl-head'); toolHead.append(el('b', '', 'Tools'), el('span', 'gl-name'), btn('Close', () => sheet(tools, false)));
  tools.append(toolHead, toolBody);
  const panelOff = panelList().map((p) => { const host = el('div'); panelSec.append(host); return mountPart(p, host, ctx); });

  // ── The bar ──
  const browse = btn('Browse', () => sheet(rail, rail.hidden));
  const prev = btn('‹', () => step(-1), 'Previous specimen'), next = btn('›', () => step(1), 'Next specimen');
  const toolsBtn = btn('Tools', () => sheet(tools, tools.hidden));
  bar.append(browse, prev, next, name, toolsBtn);

  // ── Benches ──
  function openBench(b) {
    closeBench();
    benchTitle.textContent = b.title;
    benchOff = mountPart(b, benchHost, ctx);
    fadeShown(bench, true); sheet(rail, false); sheet(tools, false);
    open = null; sync();
  }
  function closeBench() { if (benchOff) { benchOff(); benchOff = null; } fadeShown(bench, false); }
  const benchHead = el('div', 'gl-head'); benchHead.append(benchTitle, el('span', 'gl-name'), btn('Close', closeBench));
  bench.append(benchHead, benchHost);

  // (A sheet fades in and out, never pops: fadeShown, util.js. On a phone the two sheets share the bottom, so one closes as the other opens.)
  function sheet(s, on) {
    fadeShown(s, on);
    if (on && innerWidth <= 700) fadeShown(s === rail ? tools : rail, false);
  }

  // ── Opening a specimen ──
  async function go(id, { quiet = false, mark = true } = {}) {
    const e = byId[id];
    if (!e) return;
    if (mark) api.mark('opening', id);   // (api.open marks its own; a tap, a key or the address marks here, so a harness always has the attribute to wait on)
    closeBench();
    open = e;
    history.replaceState(null, '', linkFor(location, id, look));
    for (const [k, b] of items) b.toggleAttribute('aria-current', k === id);
    sync(); told();
    if (e.kind === 'slide') {
      const at = order.indexOf(sid(e.id)) + 1;
      const pos = pps?.presenter?.position?.();
      if (pos?.id === DECK_ID) pps.presenter.go(at); else await pps.presenter.start(DECK_ID, at);
    } else {
      pps?.presenter?.active?.() && pps.presenter.stop?.();
      await openEntry(e, pps);
    }
    if (!quiet && innerWidth <= 700) sheet(rail, false);
    if (shoot) shotLabel();
    settledSoon();
    if (mark) api.settled().then((r) => { if (open?.id === id) api.mark(r.settled ? 'settled' : 'failed', id); });
  }
  function step(d) {
    const list = entries.filter((e) => e.kind === 'slide' || open?.kind !== 'slide');
    const i = list.findIndex((e) => e.id === open?.id);
    const n = list[(i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length)];
    if (n) go(n.id, { quiet: true });
  }
  function nextLook() { setLook(LOOK_IDS[(LOOK_IDS.indexOf(look) + 1) % LOOK_IDS.length]); }
  function sync() {
    nameMain.textContent = open ? open.title : 'Gallery';
    nameSub.textContent = open ? `${open.id}${` · ${look ? LOOK_NAMES[look] : 'System look'}`}` : 'Pick a specimen from Browse';
    infoPre.textContent = open ? JSON.stringify(open.slide ?? { kind: open.kind, ...open }, null, 1) : '';
    fillLinks();
  }
  // Real slides that use the same instrument or panel (decks.js is already read in by the presenter: this is a tap's import).
  async function fillLinks() {
    infoLinks.replaceChildren();
    const e = open;
    if (!e?.slide || !e.slide.tool && !e.slide.visual) return;
    const { DECKS } = await import('../decks.js');
    if (open !== e) return;
    const t = e.slide.tool, found = [];
    DECKS.forEach((d) => d.slides.forEach((s, i) => {
      if (found.length >= 12) return;
      if (t ? s.tool?.kind === t.kind && (t.kind !== 'trace' || s.tool.range === t.range) : s.visual === e.slide.visual) found.push({ d, i, s });
    }));
    for (const f of found) { const a = el('a', '', `${f.d.title}, slide ${f.i + 2}: ${f.s.title}`); a.href = `${location.pathname}?script=${f.d.id}&slide=${f.i + 2}`; infoLinks.append(a); }
    if (!found.length) infoLinks.append(el('span', '', 'No built-in deck uses it.'));
  }

  // ── Freeze and the settled light: asked for by a tap, never watched per frame ──
  function freeze(on) {
    frozen = on; freezeBtn.setAttribute('aria-pressed', String(on));
    pps?.host?.send({ type: 'run', running: !on });
    toast(on ? 'The model is paused: two shots will match.' : 'The model runs again.');
  }
  let settleTimer = 0;
  function checkSettled(say = false) {
    const busy = !!pps?.presenter?.busy?.() || !!pps?.stage?.viewChanging?.();
    light.classList.toggle('on', !busy); lightWords.textContent = busy ? 'Moving: cards or camera still arriving' : 'Settled';
    if (say) toast(busy ? 'Not settled yet.' : 'Settled: cards whole and nothing easing.');
    return !busy;
  }
  // (After a specimen opens it is asked a few times, a second apart, then left: no watching.)
  function settledSoon(n = 0) {
    clearTimeout(settleTimer);
    if (!checkSettled() && n < 40) settleTimer = setTimeout(() => settledSoon(n + 1), 1000);
  }

  // ── Shoot mode ──
  const shotEl = el('div', 'gl-shoot'); shotEl.hidden = true;   // off-screen: built hidden, brought in by fadeShown
  function shotLabel() { shotEl.textContent = open ? shotName(open, look || 'system', deviceOf(readMetric(window, 'innerWidth'), readMetric(window, 'innerHeight'))) : 'No specimen open'; }
  function setShoot(on) {
    shoot = on; gl.classList.toggle('gl-shooting', on); fadeShown(shotEl, on);
    if (on) { shotLabel(); checkSettled(); freeze(true); sheet(rail, false); sheet(tools, false); }
  }

  // ── Keys: [ and ] step, L looks, S shoot, F freeze; the arrow keys step when no talk is playing ──
  const typing = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || typing(ev.target)) return;
    const k = ev.key;
    if (k === 'Escape' && shoot) { setShoot(false); ev.preventDefault(); }
    else if (k === ']' || (k === 'ArrowRight' && shoot && !pps?.presenter?.active?.())) { step(1); ev.preventDefault(); }
    else if (k === '[' || (k === 'ArrowLeft' && shoot && !pps?.presenter?.active?.())) { step(-1); ev.preventDefault(); }
    else if (k === 'l' || k === 'L') nextLook();
    else if (k === 's' || k === 'S') setShoot(!shoot);
    else if (k === 'f' || k === 'F') freeze(!frozen);
  });
  // A Next or Back inside the talk moves the specimen: after a press or a key the page reads where the talk is (once, a moment later).
  let followTimer = 0;
  const follow = () => {
    clearTimeout(followTimer);
    followTimer = setTimeout(() => {
      const pos = pps?.presenter?.position?.();
      if (!pos || pos.id !== DECK_ID) return;
      const e = byId[Object.keys(byId).find((id) => sid(id) === order[pos.at - 1])];
      if (e && e.id !== open?.id) { open = e; history.replaceState(null, '', linkFor(location, e.id, look)); for (const [k, b] of items) b.toggleAttribute('aria-current', k === e.id); sync(); told(); if (shoot) shotLabel(); settledSoon(); }
    }, 450);
  };
  addEventListener('keyup', follow); addEventListener('pointerup', follow);

  // ── Start ──
  gl.append(bar, rail, tools, bench, shotEl);
  document.body.append(gl);
  buildTree();
  sync();
  const ready = () => new Promise((ok) => { if (window.ppsFigureReady) ok(); else addEventListener('pps:figure-ready', () => ok(), { once: true }); });
  await ready();
  api.mark('idle', '');
  if (addr.look) setLook(addr.look); else sync();
  if (addr.id) await go(addr.id, { quiet: true }); else if (!/[?&]sweep\b/.test(location.search)) sheet(rail, true);
  api.startFromAddress(location.search, { lookIds: LOOK_IDS });   // (not awaited: the page is usable while a sweep runs; the report lands in window.ppsGalleryResult)
  return { api, go, setLook, step, setShoot, freeze, get open() { return open; }, dispose() { panelOff.forEach((f) => f()); closeBench(); gl.remove(); style.remove(); } };
}
