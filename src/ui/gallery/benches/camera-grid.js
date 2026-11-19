// Camera bench (card gallery, plan 2.8): every view to every view. A grid of from-view x to-view buttons over the four views (anatomy, circuit, lobule,
// sinusoid). Tap a cell: the app goes to the `from` view if it is not there, waits until it has settled (stage.gliding() false, no change running), then
// plays the move to `to` the way the View switch plays it (main.js: diveToLobule, diveToSinusoid, exitSinusoid, setViewKey) and measures it:
//   ms          from the press to the last frame the camera was still moving (stage.gliding(), a change running, the lobule's dive or glide)
//   frames      the frames the scheduler drew in that time (frame.js frameCount)
//   straight?   the zoom (stage.zoomLevel(), on-screen px per world unit) sampled in every frame, judged by judgeStraight: the owner's 18 Nov 2026 rule is
//               "the camera must zoom straight from any view to any view, no fit waypoint (no zoom-out-then-in)".
// Hold a cell for half a second and it loops: from to to, then to back to from, with a count, until it is let go or Stop is pressed.
// The cell keeps its last result. Copy results gives the whole grid as text.
// Limits, said plainly: zoomLevel() is the Anatomy/Circuit camera's scale. The lobule and the sinusoid zoom in their own layer, so a move that only changes
// that layer can read flat; the cell then says "zoom flat, not judged" rather than "straight". Sinusoid needs the lobule and may be missing on a device: each
// cell reports the view the app really ended in (viewKey()).
// Nothing runs per frame but one sampler on frameFor('bench-camera'): two number reads and a typed-array write, no DOM, no layout read.
import { VIEW_KEYS, viewKey, setViewKey } from '../../store.js';
import { frameFor, cancelFrame, frameCount, inChange } from '../../frame.js';
import { deviceClass } from '../../gpu-budget.js';
import { pageBusy } from '../../screen/settle.js';
import { readAnims } from '../../layout-snap.js';
import { benchRoot, h, statusLine, copyButton, ppsOf } from './ui.js';

export const HOLD_MS = 500;        // motion-scale: not a move (a bench timing). a press this long loops the move
export const QUIET_MS = 300;       // motion-scale: not a move (a bench timing). the camera must be still this long to count as settled
export const START_GRACE_MS = 800; // motion-scale: not a move (a bench timing). a move that never starts moving within this long is "no motion"
export const LIMIT_MS = 20000;     // motion-scale: not a move (a bench timing). a move that has not settled by now is reported as stuck
export const STRAIGHT_TOL = 0.03;  // log-zoom tolerance, about 3 %

/** The four views, in the order of the grid. */
export const VIEWS = VIEW_KEYS;
const NAMES = { anatomy: 'Anatomy', circuit: 'Circuit', lobule: 'Lobule', sinusoid: 'Sinusoid' };
export const viewName = (k) => NAMES[k] || k;

/** Every ordered pair of views (12) and the four same-view "refit" cells: [{ id, from, to, refit }], from-major in VIEWS order. */
export function moveList(views = VIEWS) {
  const out = [];
  for (const from of views) for (const to of views) out.push({ id: `${from}>${to}`, from, to, refit: from === to });
  return out;
}

/** Which of the app's own calls plays a move, as the View switch (main.js) picks it: 'refit', 'diveToLobule', 'diveToSinusoid', 'askSinusoid',
 *  'exitSinusoid', 'exitSinusoid:circuit' or 'setViewKey'. Pure. */
export function moveVia(cur, to) {
  if (cur === to) return 'refit';
  if (to === 'lobule') return 'diveToLobule';
  if (to === 'sinusoid') return cur === 'lobule' ? 'askSinusoid' : 'diveToSinusoid';
  if (cur === 'sinusoid') return to === 'circuit' ? 'exitSinusoid:circuit' : 'exitSinusoid';
  return 'setViewKey';
}

/** Plays a move from the view the app is in now to `to`, through the call moveVia names (setViewKey when the stage lacks it). Returns the call used. */
export function appMove(pps, cur, to) {
  const st = pps?.stage, via = moveVia(cur, to);
  const call = { refit: () => st.fitAgain(), diveToLobule: () => { st.askSinusoid?.(false); return st.diveToLobule(); }, diveToSinusoid: () => st.diveToSinusoid(), askSinusoid: () => st.askSinusoid(),   // alloc-rare: once per tap or per finished move, never in a frame
    exitSinusoid: () => st.exitSinusoid(), 'exitSinusoid:circuit': () => st.exitSinusoid('circuit') }[via];   // alloc-rare: once per tap or per finished move, never in a frame
  const name = via === 'refit' ? 'fitAgain' : via.split(':')[0];   // alloc-rare: once per tap or per finished move, never in a frame
  if (via === 'setViewKey' || !call || typeof st?.[name] !== 'function') { if (via !== 'refit') setViewKey(to); return via === 'setViewKey' ? via : `${via} (missing, setViewKey)`; }   // alloc-rare: once per tap or per finished move, never in a frame
  Promise.resolve(call()).catch(() => { /* a move the stage refused is seen in the result: the view it ended in */ });   // alloc-rare: once per tap or per finished move, never in a frame
  return via;
}

/** Is the page still moving? The motion half of the one probe (screen/settle.js pageBusy with no document): cheap enough to ask every frame. changing is frame.js inChange(). */
export const isBusy = (pps, changing = false) => pageBusy(pps, null, { changing });

/** A recorder for the zoom samples that allocates nothing per sample: two typed arrays of `max` frames (a move that long is a stuck one). */
export function createZoomRecorder(max = 2400) {
  const t = new Float64Array(max), z = new Float64Array(max);
  let n = 0;
  return {
    reset() { n = 0; },
    push(tt, zz) { if (n < max) { t[n] = tt; z[n] = zz; n++; } },
    get n() { return n; },
    samples() { const out = []; for (let i = 0; i < n; i++) out.push({ t: t[i], z: z[i] }); return out; },   // alloc-rare: once a move, after it ends
  };
}

/** Is the zoom path straight? samples: [{ t, z }] zoom levels in order. Straight means the log-zoom goes from the start to the end without dipping
 *  below the lower end (a zoom-out, then in), overshooting past the higher end, or sliding back against the direction of travel, by more than `tol`
 *  (log units, 0.03 is about 3 %). Returns { straight (true | false | null when there is nothing to judge), dip, overshoot, slide, flat, n, z0, z1, zMin, zMax, text }. */
export function judgeStraight(samples, tol = STRAIGHT_TOL) {
  const z = (samples || []).map((s) => +s?.z).filter((v) => Number.isFinite(v) && v > 0);   // alloc-rare: once per tap or per finished move, never in a frame
  if (z.length < 2) return { straight: null, dip: 0, overshoot: 0, slide: 0, flat: false, n: z.length, z0: z[0] ?? NaN, z1: z.at(-1) ?? NaN, zMin: NaN, zMax: NaN, text: `too few zoom samples to judge (${z.length})` };   // alloc-rare: once per tap or per finished move, never in a frame
  const L = z.map(Math.log), l0 = L[0], l1 = L[L.length - 1], lo = Math.min(l0, l1), hi = Math.max(l0, l1);   // alloc-rare: once per tap or per finished move, never in a frame
  let mn = Infinity, mx = -Infinity;
  for (const l of L) { if (l < mn) mn = l; if (l > mx) mx = l; }
  const dip = Math.max(0, lo - mn), overshoot = Math.max(0, mx - hi), dir = Math.abs(l1 - l0) > tol ? Math.sign(l1 - l0) : 0;
  let slide = 0, run = dir > 0 ? -Infinity : Infinity;
  if (dir !== 0) for (const l of L) { if (dir > 0) { if (l > run) run = l; slide = Math.max(slide, run - l); } else { if (l < run) run = l; slide = Math.max(slide, l - run); } }
  const flat = mx - mn <= tol;
  const base = { dip, overshoot, slide, flat, n: z.length, z0: z[0], z1: z[z.length - 1], zMin: Math.exp(mn), zMax: Math.exp(mx) };   // alloc-rare: once per tap or per finished move, never in a frame
  const why = [];   // alloc-rare: once per tap or per finished move, never in a frame
  if (dip > tol) why.push(`dipped to ${Math.round(100 * Math.exp(-dip))}% of the lower end's zoom (zoomed out, then in)`);   // alloc-rare: once per tap or per finished move, never in a frame
  if (overshoot > tol) why.push(`overshot the higher end by ${Math.round((Math.exp(overshoot) - 1) * 100)}%`);   // alloc-rare: once per tap or per finished move, never in a frame
  if (slide > tol && dip <= tol && overshoot <= tol) why.push(`slid back ${Math.round((1 - Math.exp(-slide)) * 100)}% against the move`);   // alloc-rare: once per tap or per finished move, never in a frame
  if (why.length) return { ...base, straight: false, text: why.join('; ') };   // alloc-rare: once per tap or per finished move, never in a frame
  return { ...base, straight: true, text: flat ? 'zoom flat (not judged)' : 'straight' };   // alloc-rare: once per tap or per finished move, never in a frame
}

const f1 = (v) => (Number.isFinite(v) ? (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) : '?');   // alloc-rare: once per tap or per finished move, never in a frame
/** One result as a line of text. */
export function resultLine(r) {
  if (!r) return 'not played';
  const j = r.judge, bits = [r.noMotion ? 'no motion' : `${Math.round(r.ms)} ms`, `${r.frames} frames`, `zoom ${f1(j?.z0)} to ${f1(j?.z1)}`, j?.text || ''];   // alloc-rare: once per tap or per finished move, never in a frame
  if (r.timedOut) bits.push(`did not settle in ${LIMIT_MS / 1000} s`);   // alloc-rare: once per tap or per finished move, never in a frame
  if (r.endedIn && r.endedIn !== r.to) bits.push(`ended in ${r.endedIn}, not ${r.to}`);   // alloc-rare: once per tap or per finished move, never in a frame
  return bits.filter(Boolean).join(', ');   // alloc-rare: once per tap or per finished move, never in a frame
}
/** The text report of a grid: one line per cell played, then a count. results: Map or object of id -> result; info: { device, look, when }. */
export function reportText(results, info = {}) {
  const map = results instanceof Map ? results : new Map(Object.entries(results || {}));
  const lines = [`Camera moves${info.device ? ` on a ${info.device}` : ''}${info.look ? `, ${info.look} look` : ''}${info.when ? `, ${info.when}` : ''}`];
  let played = 0, bad = 0;
  for (const m of moveList()) {
    const r = map.get(m.id); if (!r) continue;
    played++;
    const fail = r.judge?.straight === false || r.timedOut || (r.endedIn && r.endedIn !== m.to);
    if (fail) bad++;
    lines.push(`${fail ? 'FAIL' : 'ok  '} ${viewName(m.from)} to ${viewName(m.to)}${m.refit ? ' (refit)' : ''}: ${resultLine(r)}`);
  }
  lines.push(`${played} played, ${bad} not straight or not landed. Rule (18 Nov 2026): zoom straight from any view to any view, no fit waypoint.`);
  return lines.join('\n');
}

/** Waits for the page to be still (no glide, change, dive or slide change) for QUIET_MS: one setTimeout chain, cancel() ends it. wait() resolves { ok, ms, cancelled }. */
export function createSettler(pps, { quietMs = QUIET_MS, pollMs = 50 } = {}) {
  let timer = 0, end = null;
  return {
    wait(limitMs = LIMIT_MS) {
      return new Promise((resolve) => {   // alloc-rare: once per tap or per finished move, never in a frame
        const t0 = performance.now();
        let lastBusy = t0;
        const done = (r) => { clearTimeout(timer); timer = 0; end = null; resolve({ ms: performance.now() - t0, ...r }); };   // alloc-rare: once per tap or per finished move, never in a frame
        end = () => done({ ok: false, cancelled: true });   // alloc-rare: once per tap or per finished move, never in a frame
        const poll = () => {   // alloc-rare: once per tap or per finished move, never in a frame
          const t = performance.now();
          if (pageBusy(pps, typeof document === 'undefined' ? null : document, { anims: readAnims, changing: inChange() })) lastBusy = t;
          if (t - lastBusy >= quietMs) { done({ ok: true }); return; }   // alloc-rare: once per tap or per finished move, never in a frame
          if (t - t0 >= limitMs) { done({ ok: false }); return; }   // alloc-rare: once per tap or per finished move, never in a frame
          timer = setTimeout(poll, pollMs);
        };
        poll();
      });
    },
    cancel() { end?.(); },
  };
}

export default {
  id: 'camera',
  title: 'Camera moves',
  mount(host, ctx) {
    const pps = ppsOf(ctx);
    benchRoot(host, 'Camera moves', 'Tap a cell to play that move (the app is put in the row\'s view first). Hold a cell to loop it there and back until you let go. Each cell keeps its last time, frames and whether the zoom was straight.');
    const say = statusLine();
    const stage = pps?.stage;
    if (!stage?.zoomLevel) say.set('The app\'s stage is not available here (pps.stage), so no move can be measured.', 'bad');
    const results = new Map(), cells = new Map(), settler = createSettler(pps), rec = createZoomRecorder(), ask = frameFor('bench-camera');
    let gone = false, busy = false, stopReq = false, endMeasure = null, startView = null, holdT = 0, looping = false, down = false, loops = 0;

    const infoNow = () => ({ device: deviceClass(), look: ctx?.look?.() || '', when: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    const zoomNow = () => { try { return stage.zoomLevel(); } catch { return NaN; } };

    function paint(id) {
      const c = cells.get(id), r = results.get(id); if (!c) return;
      c.txt.replaceChildren();
      if (!r) { c.txt.append(h('span', { class: 'gb-note' }, 'tap')); return; }   // alloc-rare: once per tap or per finished move, never in a frame
      const j = r.judge, tone = r.timedOut || j?.straight === false || (r.endedIn && r.endedIn !== r.to) ? 'bad' : j?.straight === null || j?.flat ? 'warn' : 'ok';
      c.txt.append(h('div', null, r.noMotion ? 'no motion' : `${Math.round(r.ms)} ms`, ` · ${r.frames} fr`),   // alloc-rare: once per tap or per finished move, never in a frame
        h('div', { class: `gb-${tone}` }, r.timedOut ? 'stuck' : j?.text || ''), r.endedIn && r.endedIn !== r.to ? h('div', { class: 'gb-bad' }, `ended in ${r.endedIn}`) : null);   // alloc-rare: once per tap or per finished move, never in a frame
    }

    // The app goes to `view` (from where it is) and is still: the setup of a measured move, not itself measured.
    async function goTo(view) {
      if (viewKey() === view) return true;
      appMove(pps, viewKey(), view);
      const s = await settler.wait();
      return !!s.ok && viewKey() === view;
    }

    // One move, measured. A sampler on frameFor reads the zoom each frame until the camera has been still for QUIET_MS.
    function measure(from, to) {
      return new Promise((resolve) => {   // alloc-rare: once per tap or per finished move, never in a frame
        rec.reset();
        const f0 = frameCount(), t0 = performance.now();
        let lastBusy = t0, fBusy = f0, saw = false, over = false, id = 0, guard = 0;
        const finish = (why) => {   // alloc-rare: once per tap or per finished move, never in a frame
          if (over) return; over = true; cancelFrame(id); clearTimeout(guard); endMeasure = null;
          const ms = saw ? lastBusy - t0 : 0;
          resolve({ from, to, ms, frames: fBusy - f0, noMotion: !saw, timedOut: why === 'limit', cancelled: why === 'cancel', judge: judgeStraight(rec.samples()), endedIn: viewKey(), via });   // alloc-rare: once per tap or per finished move, never in a frame
        };
        const tick = () => {   // alloc-rare: once per tap or per finished move, never in a frame
          if (over || gone) return;
          const t = performance.now();
          rec.push(t - t0, zoomNow());
          if (isBusy(pps, inChange())) { saw = true; lastBusy = t; fBusy = frameCount(); }
          if (saw ? t - lastBusy >= QUIET_MS : t - t0 >= START_GRACE_MS) { finish('done'); return; }
          id = ask(tick);
        };
        guard = setTimeout(() => finish('limit'), LIMIT_MS);   // alloc-rare: once per tap or per finished move, never in a frame
        endMeasure = () => finish('cancel');   // alloc-rare: once per tap or per finished move, never in a frame
        rec.push(0, zoomNow());
        const via = appMove(pps, viewKey(), to);
        id = ask(tick);
      });
    }

    async function playMove(from, to) {
      if (startView === null) startView = viewKey();
      say.set(`Going to ${viewName(from)}…`);   // alloc-rare: once per tap or per finished move, never in a frame
      if (!(await goTo(from)) && !stopReq && !gone) { say.set(`Could not reach ${viewName(from)} (the app is in ${viewKey()}): the move was not played.`, 'bad'); return null; }   // alloc-rare: once per tap or per finished move, never in a frame
      if (stopReq || gone) return null;
      say.set(`${viewName(from)} to ${viewName(to)}…`);   // alloc-rare: once per tap or per finished move, never in a frame
      const r = await measure(from, to);
      if (gone || r.cancelled) return null;
      results.set(`${from}>${to}`, r); paint(`${from}>${to}`);   // alloc-rare: once per tap or per finished move, never in a frame
      say.set(`${viewName(from)} to ${viewName(to)}: ${resultLine(r)}`, r.judge?.straight === false || r.timedOut ? 'bad' : r.judge?.straight ? 'ok' : 'warn');   // alloc-rare: once per tap or per finished move, never in a frame
      return r;
    }
    async function playOnce(m) {
      if (busy) { say.set('A move is running: wait for it, or press Stop.', 'warn'); return; }
      busy = true; stopReq = false;
      try { await playMove(m.from, m.to); } finally { busy = false; }
    }
    async function loop(m) {
      if (busy) return;
      busy = true; stopReq = false; loops = 0;
      try {
        while (!stopReq && !gone) {
          if (!(await playMove(m.from, m.to))) break;
          if (stopReq || gone || !(await playMove(m.to, m.from))) break;
          loops++;
          say.set(`Looping ${viewName(m.from)} and ${viewName(m.to)}: ${loops} round trip${loops > 1 ? 's' : ''}. Let go or press Stop.`);   // alloc-rare: once per tap or per finished move, never in a frame
        }
      } finally { busy = false; if (!gone) say.set(`Stopped after ${loops} round trip${loops === 1 ? '' : 's'}.`); }   // alloc-rare: once per tap or per finished move, never in a frame
    }
    const stop = () => { stopReq = true; clearTimeout(holdT); settler.cancel(); endMeasure?.(); };

    function arm(btn, m) {
      btn.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        down = true; looping = false; clearTimeout(holdT);
        holdT = setTimeout(() => { if (down && !busy) { looping = true; loop(m); } }, HOLD_MS);
      });
      const up = () => { if (!down) return; down = false; clearTimeout(holdT); if (looping) { looping = false; stop(); } else playOnce(m); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', () => { if (down) { down = false; clearTimeout(holdT); if (looping) { looping = false; stop(); } } });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());   // (a long press on a phone must not open its menu)
      btn.addEventListener('click', (e) => { if (e.detail === 0) playOnce(m); });   // (the keyboard: a pointer's click is handled by pointerup)
    }
    const winUp = () => { if (down) { down = false; clearTimeout(holdT); if (looping) { looping = false; stop(); } } };
    addEventListener('pointerup', winUp);

    const head = h('tr', null, h('th', null, 'from \\ to'), VIEWS.map((v) => h('th', null, viewName(v))));
    const body = VIEWS.map((from) => h('tr', null, h('th', null, viewName(from)), VIEWS.map((to) => {
      const m = { id: `${from}>${to}`, from, to, refit: from === to };
      const txt = h('div', { class: 'gb-note' }, 'tap');
      const btn = h('button', { type: 'button', style: 'min-width:104px;min-height:56px;text-align:left;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none', 'aria-label': `${viewName(from)} to ${viewName(to)}${m.refit ? ' (refit)' : ''}` },
        h('div', { class: 'gb-note' }, m.refit ? 'refit' : `${viewName(from)} → ${viewName(to)}`), txt);
      cells.set(m.id, { btn, txt }); arm(btn, m);
      return h('td', null, btn);
    })));
    const stopBtn = h('button', { type: 'button', onclick: stop }, 'Stop');
    const copy = copyButton('Copy results', () => reportText(results, infoNow()), (t, tone) => say.set(t, tone), ctx);
    host.append(h('table', null, h('thead', null, head), h('tbody', null, body)), h('div', { class: 'gb-row' }, stopBtn, copy), say,
      h('p', { class: 'gb-note' }, 'Zoom is stage.zoomLevel(), the Anatomy and Circuit camera\'s scale. A move inside the lobule or the sinusoid layer may read flat. The Sinusoid needs the lobule; a cell that ends elsewhere says where.'));

    return () => {
      gone = true; stopReq = true; clearTimeout(holdT); settler.cancel(); endMeasure?.();
      removeEventListener('pointerup', winUp);
      // (Put the figure back in the view it was found in.)
      try { if (startView && viewKey() !== startView) appMove(pps, viewKey(), startView); } catch { /* the page is going away */ }
    };
  },
};
