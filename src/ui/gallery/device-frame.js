// Device frames for the gallery (plan 2.5): `?gallery=frame`, a light outer page that does NOT start the app and holds ONE <iframe> at a phone's or
// iPad's size. The app inside sees a 390 px wide screen, so its media queries lay a card out as a phone does. A frame is a layout preview, not a phone:
// (hover) and (pointer: coarse) answer as the Mac does, the pixel ratio is the Mac's, and the engine is the Mac browser's. One frame at a time, because
// WebKit keeps about 16 WebGL contexts per page and each app instance uses several.
//
import { readBox } from '../layout-snap.js';

// Pure helpers (no DOM) first, so a unit test loads this in node; bootFrame(doc, win) draws the page.
//
//   frameRequest('?gallery=frame&device=iphone&look=navy')  ->  { device: 'iphone', rest: 'look=navy' }
//   frameSrc({ pathname: '/preview/', search, hash })  ->  '/preview/?gallery&look=navy#...'   (the page inside the frame: the app with the gallery panel)
//   fitScale(390, 844, 1200, 800)  ->  0.9 (the frame is drawn at 0.9 so the whole phone shows; the app inside still sees 390 x 844)

/** The sizes a frame offers (css px). `turn` names the same device held the other way. */
export const FRAME_DEVICES = {
  iphone: { label: 'iPhone', w: 390, h: 844, turn: 'iphone-landscape', phone: true },
  'iphone-landscape': { label: 'iPhone sideways', w: 844, h: 390, turn: 'iphone', phone: true },
  ipad: { label: 'iPad landscape', w: 1180, h: 820, turn: 'ipad-portrait' },
  'ipad-portrait': { label: 'iPad portrait', w: 820, h: 1180, turn: 'ipad' },
  mac: { label: 'Mac', w: 1440, h: 900, turn: null },
  'mac-short': { label: 'Mac short', w: 1440, h: 780, turn: null },
};
export const DEFAULT_FRAME = 'iphone';

/** Whether the address asks for the outer frame page. */
export const isFrameRequest = (search) => new URLSearchParams(search || '').get('gallery') === 'frame';

/** The device and the rest of the address a frame request names (everything but `gallery` and `device`, kept in its order). */
export function frameRequest(search) {
  const q = new URLSearchParams(search || '');
  const d = q.get('device');
  const device = Object.hasOwn(FRAME_DEVICES, d) ? d : DEFAULT_FRAME;
  q.delete('gallery'); q.delete('device');
  return { device, rest: q.toString() };
}

/** The address of the page inside the frame: the same path, the gallery page itself (`?gallery`) and the rest of the query, the hash kept (a deep link to a specimen). */
export function frameSrc(loc) {
  const { rest } = frameRequest(loc.search);
  return `${loc.pathname}?gallery${rest ? `&${rest}` : ''}${loc.hash || ''}`;
}

/** The address of the outer page for a device (what the picker writes to the address bar). */
export function framePageUrl(loc, device) {
  const { rest } = frameRequest(loc.search);
  return `${loc.pathname}?gallery=frame&device=${device}${rest ? `&${rest}` : ''}${loc.hash || ''}`;
}

/** The scale that fits a w x h frame in the room (never above 1: a frame is not blown up). */
export const fitScale = (w, h, roomW, roomH) => Math.max(0.1, Math.min(1, roomW / w, roomH / h));

const CSS = `
html, body { margin: 0; height: 100%; }
body { font: 500 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; background: #eceae6; color: #1b1b1d; display: flex; flex-direction: column; }
.dfr-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 10px 14px; background: #fbfaf8; border-bottom: 1px solid #d6d3cc; }
.dfr-bar button, .dfr-bar a { font: inherit; font-weight: 600; min-height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid #c9c5bc; background: #fff; color: inherit; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
.dfr-bar button[aria-pressed="true"] { background: #1b1b1d; color: #fff; border-color: #1b1b1d; }
.dfr-note { flex: 1 1 260px; color: #5b5a57; font-weight: 500; }
.dfr-room { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dfr-wrap { position: relative; flex: none; }
.dfr-wrap iframe { position: absolute; left: 0; top: 0; border: 0; background: #fff; transform-origin: 0 0; border-radius: 6px; box-shadow: 0 0 0 1px #0002, 0 12px 40px -12px #0005; }
.dfr-size { font-variant-numeric: tabular-nums; color: #5b5a57; }
@media (prefers-color-scheme: dark) { body { background: #17171a; color: #eee; } .dfr-bar { background: #202024; border-color: #38383e; } .dfr-bar button, .dfr-bar a { background: #2a2a2f; border-color: #46464d; } .dfr-bar button[aria-pressed="true"] { background: #eee; color: #17171a; } .dfr-note, .dfr-size { color: #a5a5ab; } }
`;

/**
 * Draws the outer page into `doc.body`. Does nothing else: the app is not started, and there is exactly one iframe at any time.
 * Returns { select(device), dispose() }.
 */
export function bootFrame(doc = document, win = window) {
  const loc = win.location;
  const st = doc.createElement('style'); st.textContent = CSS; doc.head.append(st);
  doc.title = 'Device frame';
  const bar = doc.createElement('div'), room = doc.createElement('div'), wrap = doc.createElement('div'), note = doc.createElement('span'), size = doc.createElement('span');
  bar.className = 'dfr-bar'; room.className = 'dfr-room'; wrap.className = 'dfr-wrap'; note.className = 'dfr-note'; size.className = 'dfr-size';
  note.textContent = 'A layout preview, not a phone: hover and touch rules, the pixel ratio and the engine are this computer\'s. One frame at a time (the GPU keeps about 16 canvases per page).';
  const buttons = {};
  for (const [id, d] of Object.entries(FRAME_DEVICES)) {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = d.label; b.dataset.device = id; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => select(id); buttons[id] = b; bar.append(b);
  }
  const turn = doc.createElement('button'); turn.type = 'button'; turn.textContent = 'Turn'; turn.title = 'Hold the device the other way'; turn.onclick = () => { const t = FRAME_DEVICES[cur]?.turn; if (t) select(t); };
  const full = doc.createElement('a'); full.textContent = 'Open at full size'; full.target = '_blank'; full.rel = 'noopener';
  bar.append(turn, full, size, note);
  room.append(wrap); doc.body.append(bar, room);
  let cur = null, frame = null;
  const fit = () => {
    const d = FRAME_DEVICES[cur];
    if (!d || !frame) return;
    const rect = readBox(room);   // (the page's own layout, read on a pick or a resize, never per frame)
    const k = fitScale(d.w, d.h, Math.max(1, rect.width - 24), Math.max(1, rect.height - 24));
    wrap.style.width = `${Math.round(d.w * k)}px`; wrap.style.height = `${Math.round(d.h * k)}px`;
    frame.style.width = `${d.w}px`; frame.style.height = `${d.h}px`; frame.style.transform = `scale(${k})`;
    size.textContent = `${d.w} x ${d.h}${k < 1 ? ` at ${Math.round(k * 100)}%` : ''}`;
  };
  function select(device) {
    if (!Object.hasOwn(FRAME_DEVICES, device)) return;
    const first = cur === null;
    cur = device;
    for (const [id, b] of Object.entries(buttons)) b.setAttribute('aria-pressed', String(id === device));
    turn.disabled = !FRAME_DEVICES[device].turn;   // (a Mac frame has no other way round)
    if (!frame) { frame = doc.createElement('iframe'); frame.title = 'The app at this device\'s size'; frame.src = frameSrc(loc); wrap.append(frame); }
    full.href = frameSrc(loc);
    // (The address bar follows, so a copied link reopens this device; the frame itself is not reloaded: only its size changes, and the app inside lays out again.)
    if (win.history?.replaceState && !first) win.history.replaceState(null, '', framePageUrl(loc, device));
    fit();
  }
  win.addEventListener('resize', fit);
  select(frameRequest(loc.search).device);
  return { select, dispose() { win.removeEventListener('resize', fit); bar.remove(); room.remove(); st.remove(); } };
}
