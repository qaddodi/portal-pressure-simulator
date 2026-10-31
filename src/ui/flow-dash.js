// The blood's motion as small layers the compositor moves (?flow=dashes, 31 Oct, for Mohammad to compare with today's look).
//
// Today every frame of moving blood redraws the whole vessel canvas, and the browser lays the whole window again with it. Here the
// dense streaks stand still in the canvas (drawn as Reduce Motion draws them), and the motion is carried by a sparse set of thin
// streak-like dashes and by the flow arrowheads, each a small element moved along its vessel's centre line by a transform-and-
// opacity animation (Web Animations). The browser plays those itself: no script and no canvas redraw a frame, so a slide left
// alone costs only these small boxes.
//
// What stays true: each dash and head moves the way the model's flow runs, at the speed the canvas's streaks and heads would
// (the heads at the mean, the dashes at their lane's laminar speed: twice the mean on the axis); the heads keep the canvas's
// spacing (28 world units doubled by zoom, then 2.5 times wider: fc4b9c6a) and shape (chevron-glsl.js); nothing shows where a
// vessel runs behind an organ or another vessel in front of it, or where a reading sits on the vessel.
// One speed per element, and no flow through a junction: each runs on its own vessel.

import { D_SMALL } from './ease.js?v=387660d4ad';

// ── Geometry (pure: tested in tests/flow-dash.test.js) ───────────────────────

/** Cumulative arc length along a polyline. */
export function arcTable(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return cum;
}

/** The point and the course's direction (radians) at arc length s, and the sample index it falls after (j - 1 … j). */
export function pointAt(pts, cum, s) {
  const n = pts.length, L = cum[n - 1];
  s = Math.min(Math.max(s, 0), L);
  let lo = 1, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const j = Math.max(1, lo), a = pts[j - 1], b = pts[j], seg = cum[j] - cum[j - 1];
  const t = seg > 0 ? (s - cum[j - 1]) / seg : 0;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), u: (j - 1 + t) / (n - 1) };
}

/**
 * The heads' spacing (world units), as the canvas sets it (veins-gl.js chevOne): a power-of-two multiple of 28, at least 3.6 calibers
 * and 60 device pixels apart, then 2.5 times wider (Mohammad, 31 Oct: "too many chevrons"). The canvas fades every other head out as
 * the zoom nears the next doubling; one build takes the nearer of the two.
 */
export function chevSpacing(R, cssPerUnit, dpr = 1) {
  const pxW = 1 / Math.max(1e-6, cssPerUnit * dpr);
  const lv = Math.max(0, Math.log2(Math.max(3.6 * R, 60 * pxW) / 28)) + 1.3219281;
  const n = Math.floor(lv);
  return 28 * 2 ** (lv - n > 0.5 ? n + 1 : n);
}

/** A head's half width (world units), as the canvas draws it: half the caliber, 4 to 8 CSS pixels, never past 0.8 of it. */
export function chevHalfWidth(R, cssPerUnit) {
  const px = 1 / Math.max(1e-6, cssPerUnit);
  return Math.min(0.8 * R, Math.min(Math.max(0.5 * R, 4 * px), 8 * px));
}

/** A lane's speed, as a share of the mean (blood.js lanes and the shader's k8: twice the mean on the axis). y: −1 … 1 across. */
export const laneSpeed = (y) => Math.max(2, 16 * (1 - (0.8 * y) ** 2)) / 8;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * One lane's keyframes along a vessel: the element moves from s = 0 to s = loop (≥ len) at constant speed, turning with the course
 * and moved across to its lane, shrinking where the lumen narrows; its opacity is 0 past the vessel's end and wherever `seen`
 * (s, x, y → 0 … 1) says it is hidden, and fades in and out at the ends over `ramp`.
 *   opts: { len, loop, step, lane (−1 … 1), radius (s → world units), size (the element's own reference radius), ramp, k (world
 *   units per element pixel, the element drawn in CSS pixels at the build's zoom), seen }
 */
export function laneFrames(pts, cum, opts) {
  const { len, loop, step, lane = 0, radius, size, ramp, k = 1, seen } = opts;
  const n = Math.max(2, Math.ceil(loop / step) + 1);
  const frames = new Array(n);
  let angW = null;
  for (let i = 0; i < n; i++) {
    const s = (loop * i) / (n - 1), p = pointAt(pts, cum, s);
    // (The angle unwrapped from the last frame's, so the turn between two frames is the short way round.)
    let a = p.ang;
    if (angW != null) { while (a - angW > Math.PI) a -= 2 * Math.PI; while (a - angW < -Math.PI) a += 2 * Math.PI; }
    angW = a;
    const R = radius(s), sc = Math.min(1, Math.max(0.35, R / Math.max(size, 1e-6)));
    let o = 0;
    if (s <= len) o = smooth(0, ramp, s) * smooth(0, ramp, len - s) * (seen ? seen(s, p.x, p.y) : 1);
    frames[i] = {
      offset: i / (n - 1),
      transform: `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${(a * 180 / Math.PI).toFixed(2)}deg) translate(0px, ${(lane * R).toFixed(3)}px) scale(${(k * sc).toFixed(4)})`,
      opacity: +o.toFixed(3),
    };
  }
  return frames;
}

/** A world point's distance outside a reading box [x0, y0, x1, y1] (negative inside). */
const boxOut = (b, x, y) => Math.max(b[0] - x, x - b[2], b[1] - y, y - b[3]);
/** Whether no arrowhead may sit at (x, y): under a reading on the vessel (stage.js noChevBoxes) or a point's callout (chevHoles). */
export function inHole(x, y, boxes = [], holes = []) {
  for (const b of boxes) if (boxOut(b, x, y) < 0) return true;
  for (const h of holes) {
    const r = h[4] || 0;
    if (r < 0) {
      const ax = h[2] - h[0], ay = h[3] - h[1], t = Math.min(1, Math.max(0, ((x - h[0]) * ax + (y - h[1]) * ay) / Math.max(ax * ax + ay * ay, 1e-9)));
      if (Math.hypot(x - h[0] - ax * t, y - h[1] - ay * t) < -r) return true;
    } else if (Math.hypot(Math.max(h[0] - x, x - h[2], 0), Math.max(h[1] - y, y - h[3], 0)) < r) return true;
  }
  return false;
}

/** The animation's rate for a speed of v world units a second (each loop lasts `loop` seconds at rate 1). */
export const rateOf = (v) => (Math.abs(v) < 1e-3 ? 0 : v);
/** Whether a rate moved far enough to be sent to the animation again (2 %, or a stop, start or turn). */
export const rateMoved = (was, v) => was == null || Math.sign(was) !== Math.sign(v) || Math.abs(v - was) > 0.02 * Math.max(Math.abs(was), 0.5);

// The loops start this many times round, so one played backwards (reversed flow) has days of loops to run before it reaches 0.
const LOOPS = 1e6;

// ── The layer ───────────────────────────────────────────────────────────────

/**
 * The dashes and heads over the vessel canvas. `host`: an element covering the canvas exactly (stage.js puts it just above it).
 *   build(tracks, cssPerUnit): makes (or remakes, crossfading) the elements. Each track: { key, pts, len, radius(s), R (mid caliber),
 *     lanes ([y …]), dashSp, chevSp (0: no heads), seen(s, x, y), seenDash(s, x, y) }.
 *   flow(key, { v (world units a second along pts, + from its first point), dash: 0 … 1, chev: 0 … 1, alpha, dashCol, inkCol, rimCol, rev })
 *   view(m): the world → host transform [a, b, c, d, e, f] (CSS px).
 *   show(on), clear(), count (elements).
 */
export function createFlowDash(host) {
  const doc = host.ownerDocument;
  const cam = doc.createElement('div');
  cam.className = 'fd-cam';
  host.append(cam);
  let set = null, mWas = '', shown = false, built = 0;
  const tracks = new Map();   // key → { el, dashes: [{ el, anim, lane }], chevs: [...], st }

  function anims(list) { for (const m of list) m.anim?.cancel(); }
  function dropSet(s, fade) {
    if (!s) return;
    const done = () => { for (const t of s.tracks.values()) { anims(t.dashes); anims(t.chevs); } s.el.remove(); };
    if (!fade) { done(); return; }
    s.el.style.opacity = '0';
    setTimeout(done, D_SMALL + 80);
  }
  function marker(parent, cls, frames, loop, at) {
    const el = doc.createElement('div');
    el.className = 'fd-m';
    const inner = doc.createElement('div');
    inner.className = cls;
    el.append(inner);
    parent.append(el);
    const anim = el.animate ? el.animate(frames, { duration: loop * 1000, iterations: Infinity, easing: 'linear' }) : null;   // motion-scale: own pace (the flow's, constant)
    if (anim) { anim.currentTime = (LOOPS * loop + at) * 1000; anim.updatePlaybackRate ? anim.updatePlaybackRate(0) : (anim.playbackRate = 0); }
    return { el, inner, anim, rate: 0 };
  }

  return {
    get count() { let n = 0; for (const t of tracks.values()) n += t.dashes.length + t.chevs.length; return n; },
    get built() { return built; },
    view(m) {
      const key = m.map((v) => v.toFixed(4)).join(',');
      if (key === mWas) return;
      mWas = key;
      cam.style.transform = `matrix(${key})`;
    },
    show(on) {
      if (on === shown) return;
      shown = on;
      host.classList.toggle('on', on);
    },
    /** Whether a track (by key) is built. */
    has: (key) => tracks.has(key),
    build(list, cssPerUnit, { fade = true } = {}) {
      built++;
      // Where a track's elements are now along their loop, so a rebuild of the same vessel carries on from there.
      const phase = new Map();
      for (const [key, t] of tracks) {
        const a = t.dashes[0]?.anim || t.chevs[0]?.anim;
        if (a && t.loop) phase.set(key, ((a.currentTime / 1000) % t.loop + t.loop) % t.loop);
      }
      const old = set;
      set = { el: doc.createElement('div'), tracks: new Map() };
      set.el.className = 'fd-set';
      const k = 1 / Math.max(1e-6, cssPerUnit);   // world units per element pixel
      for (const tr of list) {
        const cum = arcTable(tr.pts), len = cum[cum.length - 1];
        if (!(len > 1)) continue;
        const el = doc.createElement('div');
        el.className = 'fd-track';
        const dashSp = tr.dashSp, chevSp = tr.chevSp || 0;
        // One loop: the vessel and a stretch past its end where nothing shows, a whole number of spacings, so every element keeps
        // its distance from the next all round.
        const unit = chevSp > 0 ? chevSp : dashSp;
        const loop = Math.ceil((len + 1) / unit) * unit;
        const step = Math.min(8, Math.max(len / 90, 2 * k, 2));   // (world units between keyframes: the courses are smooth)
        const ph = phase.get(tr.key) ?? (tr.seed || 0) % unit;
        const t = { el, dashes: [], chevs: [], loop, st: {} };
        // Dashes: thin streaks of light, as the canvas's (a soft core in the streak's own colour, longer than wide), on lanes.
        const dashG = doc.createElement('div'); dashG.className = 'fd-dashes'; el.append(dashG);
        const chevG = doc.createElement('div'); chevG.className = 'fd-chevs'; el.append(chevG);
        const Rpx = tr.R * cssPerUnit;
        const W = Math.min(0.5 * Rpx, 2.2), Lw = Math.min(Math.max(7 * W, 10), 22);
        const ramp = Math.max(2.5 * Lw * k, Math.min(0.2 * len, 0.3 * unit));
        if (dashSp > 0 && W >= 0.6) {
          tr.lanes.forEach((y, j) => {
            const frames = laneFrames(tr.pts, cum, { len, loop, step, lane: y, radius: tr.radius, size: tr.R, ramp, k, seen: tr.seenDash });
            const off = (dashSp * (j + 0.5)) / tr.lanes.length;
            for (let d = 0; d * dashSp < loop; d++) {
              const mk = marker(dashG, 'fd-dash', frames, loop, (ph + off + d * dashSp) % loop);
              mk.inner.style.cssText = `width:${Lw.toFixed(1)}px;height:${W.toFixed(2)}px;left:${(-Lw / 2).toFixed(1)}px;top:${(-W / 2).toFixed(2)}px`;
              mk.lane = laneSpeed(y);
              t.dashes.push(mk);
            }
          });
        }
        // Heads: one shape per vessel, the canvas's (chevron-glsl.js), on the axis at the mean speed; none where the lumen is
        // narrower than the head.
        if (chevSp > 0) {
          const hw = chevHalfWidth(tr.R, cssPerUnit), hwPx = hw * cssPerUnit, L = 1.6 * hwPx;
          const frames = laneFrames(tr.pts, cum, {
            len, loop, step, lane: 0, radius: () => tr.R, size: tr.R, k,
            ramp: Math.max(2 * L * k, 0.3 * chevSp),
            seen: (s, x, y) => smooth(0.85 * hw, 1.15 * hw, tr.radius(s)) * (tr.seen ? tr.seen(s, x, y) : 1),
          });
          const svg = `<svg viewBox="${(-0.5 * L - 2).toFixed(2)} ${(-hwPx - 2).toFixed(2)} ${(L + 4).toFixed(2)} ${(2 * hwPx + 4).toFixed(2)}" width="${(L + 4).toFixed(1)}" height="${(2 * hwPx + 4).toFixed(1)}"><path d="M${(0.55 * L).toFixed(2)} 0L${(-0.45 * L).toFixed(2)} ${hwPx.toFixed(2)}L${(-0.13 * L).toFixed(2)} 0L${(-0.45 * L).toFixed(2)} ${(-hwPx).toFixed(2)}Z"/></svg>`;
          for (let c = 0; c * chevSp < loop; c++) {
            const mk = marker(chevG, 'fd-chev', frames, loop, (ph + c * chevSp) % loop);
            mk.inner.innerHTML = svg;
            mk.inner.style.cssText = `left:${(-0.5 * L - 2).toFixed(2)}px;top:${(-hwPx - 2).toFixed(2)}px`;
            mk.lane = 1;
            t.chevs.push(mk);
          }
        }
        set.el.append(el);
        set.tracks.set(tr.key, t);
      }
      // The new set fades in as the old one fades out (a zoom's new sizes, a vessel's new course), never in one frame.
      if (fade && old) { set.el.style.opacity = '0'; cam.append(set.el); set.el.getBoundingClientRect(); set.el.style.opacity = ''; }
      else cam.append(set.el);
      dropSet(old, fade);
      tracks.clear();
      for (const [key, t] of set.tracks) tracks.set(key, t);
    },
    /** Updates one track's motion, opacity and colours (called with the model's frames; each sent only when it changed). */
    flow(key, f) {
      const t = tracks.get(key);
      if (!t) return;
      const st = t.st;
      for (const mk of t.dashes) setRate(mk, f.v * mk.lane);
      for (const mk of t.chevs) setRate(mk, f.v);
      const fwd = f.v >= 0 ? 1 : 0;
      if (st.fwd !== fwd) { st.fwd = fwd; t.el.classList.toggle('back', !fwd); }
      const q = (v) => Math.round(v * 50) / 50;
      const da = q(f.dash * f.alpha), ca = q(f.chev * f.alpha);
      if (st.da !== da) { st.da = da; t.el.firstChild.style.opacity = String(da); }
      if (st.ca !== ca) { st.ca = ca; t.el.lastChild.style.opacity = String(ca); }
      const cols = `${f.dashCol}|${f.inkCol}|${f.rimCol}`;
      if (st.cols !== cols) {
        st.cols = cols;
        t.el.style.setProperty('--fd-dash', f.dashCol);
        t.el.style.setProperty('--fd-ink', f.inkCol);
        t.el.style.setProperty('--fd-rim', f.rimCol);
      }
    },
    clear() { dropSet(set, false); set = null; tracks.clear(); },
  };
  function setRate(mk, v) {
    const r = rateOf(v);
    if (!mk.anim || !rateMoved(mk.rate, r)) return;
    mk.rate = r;
    if (mk.anim.updatePlaybackRate) mk.anim.updatePlaybackRate(r); else mk.anim.playbackRate = r;
  }
}
