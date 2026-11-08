// Gestures: wheel, trackpad, mouse and touch: zoom about the pointer, pan with its soft edges and spring back, fling, pinch, tap, long press and the pointer-up pick.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VB_ANAT } from './anatomy.js';
import { caught } from './caught.js';
import { CAM_MS_MAX, createGlideTracker } from './ease.js';
import { FLICK, runFlick } from './flick.js';
import { cancelFrame, setHandProbe } from './frame.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { store } from './store.js';
import { clamp, systemEdge } from './util.js';
import { createWheelGlide, isPadWheel } from './wheel-glide.js';

import { stageScope } from './stage-scope.js';
export function createGestures(st, live) {
  const { EI, animZoomAt, animateVT, applyVT, camSettle, cath, cathRoom, circVB, clientToVB, clientToVBFast, defaultVT, driftEnd, edgeFromEvent, freeCentre, gGuides, labelSvg, markCirc, nearbyEdge, nextFrame, onHoverInfo, onSelect, pick, pointers, readFrame, sameView, shuntDrop, snapFresh, stageBox, svg, vbBox, wrap, zoomAt } = st;
  // ── Gestures: wheel, trackpad, mouse and touch ──
  // A mouse wheel zooms about the pointer. A trackpad's two-finger scroll pans and its pinch (a
  // wheel event with ctrlKey) zooms, as in maps and drawing apps; Ctrl/⌘ + wheel always zooms.
  // Trackpad scrolls are told from wheel notches once per gesture: Chrome and Safari report a
  // trackpad's legacy wheelDelta as exactly three times its delta, Firefox reports notches in lines.
  let wheelKind = null, wheelAt = 0, settleT = 0;
  // The hand's own speed, for the spring-back that follows it (item 11): sampled with every step the hand gives the view (a pinch, a drag, a
  // scroll, a wheel step), and taken when the spring-back begins, so a spring-back starts at the speed the hand left the view at, not from rest.
  // handAge: how old the last sample may be: 80 ms after a finger, longer after a trackpad pinch, whose spring-back waits a quarter second
  // to be sure the pinch is over.
  const hand = createGlideTracker();
  let handAge = 80;
  const handSample = (age) => { hand.sample(live.vt, performance.now()); handAge = age; };
  // A mouse-wheel notch glides (wheel-glide.js); a trackpad's pinch and scroll are direct.
  const wheelGlide = createWheelGlide({ ask: nextFrame, cancel: cancelFrame, apply: (d, x, y) => { zoomAt(x, y, Math.exp(d)); handSample(300); } });
  const wheelPx = (ev, d) => d * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? stageBox().height : 1);
  const settleSoon = (ms = 220) => { stageScope.clear(settleT); settleT = stageScope.timer(springBack, ms); };
  // A Mac trackpad keeps sending scroll events for a second or more after the fingers lift (momentum). Pressed in that
  // time, Fit (or a zoom button) used to glide to its framing and then the rest of the old scroll carried the figure off it
  // again. The button wins: the scroll under way when it was pressed is ignored until it stops; a new one works as usual.
  let wheelMute = false;
  function handsOff() {
    if (performance.now() - wheelAt < 250) wheelMute = true;
    stopGlide(); wheelGlide.cancel(); stageScope.clear(settleT); panFit = null;
  }
  const onWheel = (ev) => {
    ev.preventDefault();
    const now = performance.now();
    if (wheelMute) { if (now - wheelAt < 250) { wheelAt = now; return; } wheelMute = false; }
    // The hand takes over from any camera glide (as a press does): the glide would overwrite each step of the scroll or pinch.
    if (live.vtGliding) { cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false; camSettle(); }
    stopGlide(); live.userMoved = true; live.fitted = false; live.handed = !live.lobuleOn;
    const dx = wheelPx(ev, ev.deltaX), dy = wheelPx(ev, ev.deltaY);
    if (ev.ctrlKey || ev.metaKey) {
      // (A trackpad pinch is a gesture like a drag: wheelAt marks it, so gestureOn() is true through it (the pinch frame reuse, the lowered
      // vessels, the labels carried, refinement held), as it is for a wheel zoom or a pan below, and a button pressed mid-pinch mutes the
      // pinch's tail (handsOff). It had returned before wheelAt was set, so none of those held for a Mac pinch. A new gesture, after a quiet
      // quarter second, reads the fit framing afresh and forgets what kind of scroll came before.)
      if (now - wheelAt > 250) { panFit = null; wheelKind = null; hand.begin(); }
      wheelAt = now;
      zoomAt(ev.clientX, ev.clientY, Math.exp(-clamp(dy, -50, 50) * 0.01), true); handSample(300); settleSoon(); return;
    }
    if (now - wheelAt > 250) {
      panFit = null; hand.begin();
      wheelKind = isPadWheel(ev) ? 'pad' : 'wheel';
    }
    wheelAt = now;
    if (wheelKind === 'wheel' || live.lobuleOn) {
      const step = -clamp(dy, -120, 120) * 0.0015;
      if (live.lobuleOn || reduceMotion.matches) zoomAt(ev.clientX, ev.clientY, Math.exp(step));
      else {
        // A notch is a glide of about 100 ms that carries the speed of the one before it (wheel-glide.js). The zoom it asks for stays inside
        // the limits in the log, counting what the glide still owes, so the glide never runs against a limit.
        const k = live.vt.k, owed = wheelGlide.left(), kTo = clamp(k * Math.exp(owed + step), K_MIN, K_MAX);
        wheelGlide.push(Math.log(kTo / k) - owed, ev.clientX, ev.clientY, now);
      }
      if (!live.lobuleOn) settleSoon();
      return;   // (out past the whole figure, it springs back once the wheel stops, as a pinch does)
    }
    const s = vbScale();
    const u0 = unsoftPan(live.vt, PAN_RAW);
    PAN_IN.k = live.vt.k; PAN_IN.x = u0.x - dx / s; PAN_IN.y = u0.y - dy / s;
    live.vt = softPan(PAN_IN, VT_BUF);
    applyVT(); live.CTM = null; handSample(300); settleSoon();
  };
  svg.addEventListener('wheel', onWheel, { passive: false });
  labelSvg.addEventListener('wheel', onWheel, { passive: false });
  // Safari on a Mac can report a trackpad pinch as gesture events instead of Ctrl + wheel. Left alone they magnified the
  // whole page, so the figure sat out of view and Fit (which frames the figure inside the page) could not bring it back.
  // The page never zooms: a pinch that comes with no Ctrl + wheel of its own is passed on as one, to the anatomy or the lobule.
  // On an iPhone or iPad a two-finger pinch sends these gesture events too, alongside the touches the figure (or the lobule)
  // already follows: passed on as well, each pinch was applied twice, a zoom about the gesture's centre on top of the
  // fingers' own, so the figure jumped between the two, zoomed in the wrong place and sprang back. While a finger is down,
  // the touches alone move the figure; the gesture events only keep the page from zooming.
  let gScale = 1, gWheel = false;
  const touchesDown = new Set();
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchesDown.add(e.pointerId); }, { capture: true, passive: true });
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, (e) => touchesDown.delete(e.pointerId), { capture: true, passive: true });
  wrap.addEventListener('wheel', (e) => { if (e.isTrusted && e.ctrlKey) gWheel = true; }, { capture: true, passive: true });
  wrap.addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = 1; gWheel = false; }, { passive: false });
  wrap.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    const r = e.scale / gScale, t = e.target, x = e.clientX, y = e.clientY;
    gScale = e.scale;
    if (!(r > 0) || r === 1 || touchesDown.size) return;
    nextFrame(() => { if (!gWheel && !touchesDown.size && t.isConnected) t.dispatchEvent(new WheelEvent('wheel', { deltaY: -Math.log(r) / 0.01, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); });
  }, { passive: false });
  wrap.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
  // The figure never gets lost: past the zoom limits, or panned until its middle leaves the
  // view, it springs back once the gesture ends. During a pinch the limits stretch a little.
  const K_MIN = 0.6, K_MAX = 6;
  const softK = (k) => (k > K_MAX ? K_MAX * Math.pow(k / K_MAX, 0.3) : k < K_MIN ? K_MIN * Math.pow(k / K_MIN, 0.3) : k);
  // (The visible view box, written into one kept box: its callers use it at once and keep nothing. The pan maths below write into kept
  // boxes too, so a drag, a wheel step or a flick makes no object per event: VT_BUF is the view while one of them moves it, PAN_RAW and
  // PAN_IN are the maths' own scratch, and the flick's hard() answers in the one array HARD_XY.)
  const VIS_BOX = { x: 0, y: 0, w: 0, h: 0 }, VT_BUF = { k: 1, x: 0, y: 0 }, PAN_RAW = { k: 1, x: 0, y: 0 }, PAN_IN = { k: 1, x: 0, y: 0 }, PAN_HARD = { k: 1, x: 0, y: 0 }, HARD_XY = [0, 0];
  function visibleVB() {
    const b = stageBox(), vb = vbBox, s = Math.min(b.sw / vb.width, b.sh / vb.height);
    VIS_BOX.x = vb.x - (b.sw - vb.width * s) / 2 / s; VIS_BOX.y = vb.y - (b.sh - vb.height * s) / 2 / s; VIS_BOX.w = b.sw / s; VIS_BOX.h = b.sh / s;
    return VIS_BOX;
  }
  // Panning past the figure meets rising resistance, the lobule view's rubber band: a tanh band easing toward
  // 40% of the view, measured from where the middle of the view meets the figure's edge (at the fit zoom, from the fit framing).
  // hardPan is the nearest resting place; softPan puts a raw pan on the band, unsoftPan takes a banded pan back to raw.
  // The fit framing measures the page (the figure's boxes, every floating card): during a gesture it is read once and
  // held, so each move of a drag, wheel or flick is arithmetic only. A new gesture, a card or a resize reads it afresh.
  let panFit = null;
  const gestureOn = () => !!live.drag || !!live.glide || performance.now() - wheelAt < 250;
  setHandProbe(gestureOn);   // (the frame-rate governor, frame.js: a hand on the camera is the one reason for the screen's full rate)
  function fitForPan() {
    const c = live.morphTarget === 1;
    if (!gestureOn()) { panFit = null; return defaultVT(c); }
    if (!panFit || panFit.c !== c || panFit.r !== live.rotTarget) panFit = { c, r: live.rotTarget, d: defaultVT(c) };
    return panFit.d;
  }
  addEventListener('pps:occ', () => { panFit = null; cath.lblKey = ''; cathRoom(); });
  addEventListener('resize', () => { panFit = null; cath.lblKey = ''; cathRoom(); });
  // (hardPan, bandPan, softPan and unsoftPan write their answer into `out` and give it back; the default is a fresh object for a caller
  // that keeps it. `out` may be `v` itself.)
  function hardPan(v, out = {}) {
    const d = fitForPan();
    if (v.k <= d.k * 1.001) { out.k = v.k; out.x = d.x; out.y = d.y; return out; }   // at the fit zoom the bounds are the fit position itself, as the lobule at its framing
    const c = live.morphTarget === 1 ? circVB() : VB_ANAT, vis = visibleVB();
    const x0 = c[0] * v.k + v.x, x1 = (c[0] + c[2]) * v.k + v.x, y0 = c[1] * v.k + v.y, y1 = (c[1] + c[3]) * v.k + v.y;
    const vx = vis.x + vis.w / 2, vy = vis.y + vis.h / 2;
    out.k = v.k; out.x = v.x + (vx < x0 ? vx - x0 : vx > x1 ? vx - x1 : 0); out.y = v.y + (vy < y0 ? vy - y0 : vy > y1 ? vy - y1 : 0);
    return out;
  }
  const bandOff = (o, L, inv) => (inv ? Math.atanh(clamp(o / L, -0.999, 0.999)) * L : L * Math.tanh(o / L));
  function bandPan(v, inv, out = {}) {
    const h = hardPan(v, PAN_HARD), vis = visibleVB(), Lx = 0.4 * vis.w, Ly = 0.4 * vis.h, k = v.k, vx = v.x, vy = v.y, hx = h.x, hy = h.y;
    out.k = k; out.x = hx + bandOff(vx - hx, Lx, inv); out.y = hy + bandOff(vy - hy, Ly, inv);
    return out;
  }
  const softPan = (v, out) => bandPan(v, false, out), unsoftPan = (v, out) => bandPan(v, true, out);
  // (Measured first in the next frame (readFrame), while the layout is still the last frame's: a flick's last frame or a lifted finger
  // no longer measures the cards among the frame's writes.)
  let springAsk = 0;
  function springBack() { springAsk ||= readFrame(springRead); }
  function springRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    springAsk = 0;
    if (live.lobuleOn || live.vtGliding || live.drag || live.glide) return;
    if (wheelGlide.active) { settleSoon(60); return; }   // (a wheel notch is still gliding: the spring-back waits for it to land)
    // (The hand's speed as it let go, carried into the spring-back; the glide's time is its reach's, as every camera glide's: camMs.)
    const v0 = hand.take(performance.now(), handAge);
    let to = { ...live.vt };
    const k = clamp(live.vt.k, K_MIN, K_MAX);
    // At or past the fit zoom (zoomed out, or panned about at the fit), the view springs back to the fit framing, as in the lobule view.
    { const d = defaultVT(live.morphTarget === 1); if (live.vt.k <= d.k * 1.001) { if (live.morphTarget === 1) markCirc('focus', d); live.fitted = true; if (!sameView(d, live.vt)) animateVT(d, CAM_MS_MAX, { scale: true, v0 }); return; } }
    if (k !== live.vt.k) {
      const [cx, cy] = freeCentre(), [vx, vy] = clientToVB(cx, cy);
      to = { k, x: vx - ((vx - live.vt.x) / live.vt.k) * k, y: vy - ((vy - live.vt.y) / live.vt.k) * k };
    }
    // Lost means the middle of the view has left the figure: only then is it pulled back, and only as far as the
    // figure's edge. Zoomed in on any part (the spleen, a collateral), the view stays exactly where it was put.
    const c = live.morphTarget === 1 ? circVB() : VB_ANAT, vis = visibleVB();
    const x0 = c[0] * to.k + to.x, x1 = (c[0] + c[2]) * to.k + to.x, y0 = c[1] * to.k + to.y, y1 = (c[1] + c[3]) * to.k + to.y;
    const vx = vis.x + vis.w / 2, vy = vis.y + vis.h / 2;
    to.x += vx < x0 ? vx - x0 : vx > x1 ? vx - x1 : 0;
    to.y += vy < y0 ? vy - y0 : vy > y1 ? vy - y1 : 0;
    if (!sameView(to, live.vt)) animateVT(to, CAM_MS_MAX, { scale: true, v0 });
  }
  function stopGlide() { cancelFlick?.(); cancelFlick = null; live.glide = 0; }
  let cancelFlick = null;
  function fling(vx, vy) {
    if (reduceMotion.matches || Math.hypot(vx, vy) < FLICK.minSpeed) { springBack(); return; }
    const s0 = vbScale(), k = live.vt.k, h0 = hardPan(live.vt, PAN_RAW);
    // Let go past the bounds (always so at the fit zoom, where the drag rides the wide band): nothing to carry, so it eases home from
    // exactly where it is, as the lobule does at its framing. A flick would restart the stretch from a narrower band and jump.
    if (Math.abs(live.vt.x - h0.x) * s0 > 0.5 || Math.abs(live.vt.y - h0.y) * s0 > 0.5) { springBack(); return; }
    live.glide = 1;
    cancelFlick = runFlick({   // the lobule's flick, in screen pixels, bounded by the figure
      x: live.vt.x * s0, y: live.vt.y * s0, vx: vx, vy: vy,
      hard: (x, y) => { PAN_IN.k = k; PAN_IN.x = x / s0; PAN_IN.y = y / s0; const h = hardPan(PAN_IN, PAN_HARD); HARD_XY[0] = h.x * s0; HARD_XY[1] = h.y * s0; return HARD_XY; },
      apply: (x, y) => { VT_BUF.k = k; VT_BUF.x = x / s0; VT_BUF.y = y / s0; live.vt = VT_BUF; applyVT(); live.CTM = null; },
      done: () => { live.glide = 0; cancelFlick = null; springBack(); },
    });
  }
  // Touch: every finger is captured by the figure, so a finger that lifts over a label or the
  // card still ends here (an uncaptured finger used to linger in `pointers` and turn the next
  // single touch into a pinch that jumped). Two fingers zoom and pan together: the point of the
  // figure under their midpoint stays under it. Lifting one finger hands over to a pan.
  // A double click zooms in about the point, Shift zooms out; a long press on a vessel shows its readings
  // without opening its card.
  const vbScale = () => { const b = stageBox(), vb = vbBox; return Math.min(b.sw / vb.width, b.sh / vb.height); };
  // (The pan's trail is flat: t, x, y of each move, the oldest at `th`. Dropping the oldest moves `th` on, and the array is packed in place
  // when it has run on: a move makes no array.)
  const startPan = (x, y, id, moved = false) => ({ type: 'pan', x, y, vx: live.vt.x, vy: live.vt.y, s0: vbScale(), moved, id, trail: [performance.now(), x, y], th: 0 });
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, [vx, vy] = clientToVBFast(mx, my);
    return { type: 'pinchzoom', pa: a, pb: b, d0: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), k0: live.vt.k, wx: (vx - live.vt.x) / live.vt.k, wy: (vy - live.vt.y) / live.vt.k, mx, my, t0: performance.now(), moved: false };
  }
  let pressT = 0, lastTap = null;
  const clearPress = () => { stageScope.clear(pressT); pressT = 0; };
  // A finger (or the mouse) that lands on a label starts the same gesture as one on the figure: the labels cover
  // much of a phone's figure, and a pinch that began on one used to go unnoticed. A tap on a label still opens it.
  labelSvg.addEventListener('pointerdown', (ev) => { const lb = ev.target.closest?.('.lb'); if (lb) onDown(ev, lb); });
  svg.addEventListener('pointerdown', (ev) => onDown(ev, null));
  function onDown(ev, label) {
    if (systemEdge(ev)) return;
    // The first finger of a new gesture: nothing else can still be down.
    if (ev.isPrimary) pointers.clear();
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    panFit = null;
    live.userMoved = true;
    cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false; stopGlide(); wheelGlide.cancel(); hand.begin(); stageScope.clear(settleT);
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { caught('stage:13253', e); /* pointer already gone */ }
    clearPress();
    if (pointers.size >= 2) {
      if (live.drag?.type === 'pan') wrap.classList.remove('panning');
      if (live.drag?.peeked) onHoverInfo(null);
      if (live.drag && live.drag.type !== 'pan' && live.drag.type !== 'pinchzoom') gGuides.innerHTML = '';
      live.drag = pointers.size === 2 ? startPinch() : live.drag;
      return;
    }
    if (ev.button === 2) return;   // the context menu opens the card instead
    live.drag = startPan(ev.clientX, ev.clientY, label ? null : edgeFromEvent(ev));
    live.drag.label = label;
    wrap.classList.add('panning');
    if (ev.pointerType === 'touch' && !live.shunt && !label) {
      const d = live.drag, x = ev.clientX, y = ev.clientY;
      pressT = stageScope.timer(() => {
        if (live.drag !== d || d.moved || pointers.size !== 1) return;
        const id = d.id && EI[d.id] != null ? d.id : nearbyEdge({ clientX: x, clientY: y, pointerType: 'touch' });
        if (!id) return;
        d.peeked = true;
        const r = wrap.getBoundingClientRect();
        onHoverInfo({ id, x: x - r.left, y: y - r.top, peek: true });
        navigator.vibrate?.(8);
      }, 480);
    }
  }
  let peekEv = null, peekAsk = 0;
  function peekRead() {
    peekAsk = 0;
    const ev = peekEv; peekEv = null;
    if (!ev || !live.drag?.peeked) return;
    const r = stageBox();
    const id = edgeFromEvent(ev) || nearbyEdge(ev);
    if (id && EI[id] != null) onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top, peek: true });
    else onHoverInfo(null);
  }
  svg.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    const pt = pointers.get(ev.pointerId); pt[0] = ev.clientX; pt[1] = ev.clientY;   // (this finger's own pair, written in place; a pinch holds the two pairs)
    if (!live.drag || live.drag.type === 'ignore') return;
    if (live.drag.type === 'pinchzoom') {
      if (pointers.size !== 2) return;
      const a = live.drag.pa, b = live.drag.pb;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (Math.abs(d - live.drag.d0) > 10 || Math.hypot(mx - live.drag.mx, my - live.drag.my) > 10) live.drag.moved = true;
      if (live.lobuleOn) return;
      const k = softK(live.drag.k0 * d / live.drag.d0);
      const [vx, vy] = clientToVBFast(mx, my);
      VT_BUF.k = k; VT_BUF.x = vx - live.drag.wx * k; VT_BUF.y = vy - live.drag.wy * k; live.vt = VT_BUF; live.fitted = false; live.handed = true;
      applyVT(); live.CTM = null; handSample(80);
      return;
    }
    if (live.drag.type === 'pan') {
      // Once it counts as a pan the figure follows the finger from where it is then, rather than catching up the slop in one frame.
      if (Math.abs(ev.clientX - live.drag.x) + Math.abs(ev.clientY - live.drag.y) > (ev.pointerType === 'touch' ? 8 : 4)) { if (!live.drag.moved) { live.drag.moved = true; live.drag.x = ev.clientX; live.drag.y = ev.clientY; } clearPress(); }
      if (live.drag.peeked) {   // a long press then drag: the popup follows whichever vessel is under the finger
        // (Looked up first in the next frame, while the layout is the last frame's, for the newest point: never in the move's handler.)
        peekEv = ev; peekAsk ||= readFrame(peekRead);
        return;
      }
      if (live.drag.moved) {
        PAN_IN.k = live.vt.k; PAN_IN.x = live.drag.vx + (ev.clientX - live.drag.x) / live.drag.s0; PAN_IN.y = live.drag.vy + (ev.clientY - live.drag.y) / live.drag.s0;
        live.vt = softPan(PAN_IN, VT_BUF); live.fitted = false; live.handed = true;
        applyVT(); live.CTM = null; handSample(80);
        const now = performance.now(), tr = live.drag.trail;
        tr.push(now, ev.clientX, ev.clientY);
        while (tr.length - live.drag.th > 6 && now - tr[live.drag.th] > 90) live.drag.th += 3;
        if (live.drag.th >= 30) { tr.copyWithin(0, live.drag.th); tr.length -= live.drag.th; live.drag.th = 0; }
      }
      return;
    }
  });
  const endPointer = (ev) => {
    if (!pointers.delete(ev.pointerId)) return;
    clearPress();
    if (!live.drag) return;
    if (live.drag.type === 'ignore') { if (!pointers.size) { live.drag = null; springBack(); } return; }
    if (live.drag.type === 'pinchzoom') {
      // One finger stays down: it carries on as a pan (never as a click, never thrown on release).
      const rest = [...pointers.values()][0];
      live.drag = rest && pointers.size === 1 ? Object.assign(startPan(rest[0], rest[1], null, true), { noFling: true }) : pointers.size >= 2 ? startPinch() : null;
      if (!live.drag) springBack();
      return;
    }
    if (live.drag.type === 'pan') {
      wrap.classList.remove('panning');
      const d = live.drag;
      live.drag = null;
      if (d.peeked) { onHoverInfo(null); return; }
      if (!d.moved) {
        if (ev.type !== 'pointerup') return;
        if (live.shunt) { shuntDrop(ev); return; }
        const now = performance.now();
        // The second tap of a double tap zooms (and puts back whatever the first tap selected).
        // (Not by touch: there the first tap opens a card, whose sheet moves the figure, and the two moves fought.)
        if (ev.pointerType !== 'touch' && lastTap && now - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30 && !live.lobuleOn) {
          const prev = lastTap.sel;
          lastTap = null;
          animZoomAt(ev.clientX, ev.clientY, ev.shiftKey ? 1 / 2 : 2);
          if (store.get().selection !== prev) onSelect(prev, { quiet: true });
          return;
        }
        lastTap = { t: now, x: ev.clientX, y: ev.clientY, sel: store.get().selection };
        if (live.tapHook?.(ev.clientX, ev.clientY)) return;   // (the scope view's ring takes its own tap: scope-lens.js)
        if (d.label) { d.label.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
        pick(d.id, ev);
        return;
      }
      // A real flick only: enough of a trail to measure, still moving at release, and capped, so a lift that
      // jitters never throws the figure.
      const tr = d.trail, ta = d.th, tb = tr.length - 3, dt = tr[tb] - tr[ta];
      if (!d.noFling && tb - ta >= 6 && dt >= 30 && performance.now() - tr[tb] < 50) {   // (three moves or more)
        const vx = (tr[tb + 1] - tr[ta + 1]) / dt, vy = (tr[tb + 2] - tr[ta + 2]) / dt, sp = Math.hypot(vx, vy), cap = Math.min(1, 2 / (sp || 1));
        fling(vx * cap, vy * cap);
      } else springBack();
      return;
    }
    live.drag = null;
    gGuides.innerHTML = '';
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('lostpointercapture', endPointer);
  // Right-click opens the card of what is under the pointer.
  svg.addEventListener('contextmenu', (ev) => {
    if (live.shunt || live.lobuleOn) return;
    ev.preventDefault();
    pick(edgeFromEvent(ev), ev);
  });
  return { gestureOn, handsOff, vbScale };
}
