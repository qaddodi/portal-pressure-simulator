// The FibroScan probe: its pointer, packet and ripples, its card and body.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { fibroReading } from './clock.js';
import { dropLabel } from './drop-label.js';
import { cancelFrame, paceMs } from './frame.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { paintWave, wavePacks } from './scan-waves.js';
import { flattenPathInto, newFlat, polyBoxInto } from './shape-gl.js';
import { store } from './store.js';
import { clamp, putText } from './util.js';

export function createScan(st, live) {
  const { NO_LIST, SCAN_BOX, gMatrix, late, nextFrame, organEls, organG, readFrame, refreshCTM, sites, stageBox, viewMoving, watch } = st;
  // The FibroScan probe (the Presenter's stiffness slides): a transducer on the skin at the top left of the right
  // lobe, angled 45° down toward the portal vein, with a shear wave easing out from its tip into the liver along that
  // line. Screen-space, at the liver's outline. Each tap (three a second) sends one shear wavefront: a soft arc that spreads and fades as
  // it crosses the liver. The true speed goes with √kPa (about 2.2× from 5 to 25 kPa); on screen it is exaggerated to
  // roughly linear in kPa (5× from 5 to 25) so the difference reads at a glance, easing to a new speed when the reading changes.
  const scan = { on: false, el: null, raf: 0, deg: 45, v: 0, fronts: [], next: 0, nextTap: 0, last: 0, k: null, leaving: false, headAt: 0 };   // k: the stiffness the callout shows, eased
  const SCAN_EDGE = 8, SCAN_TIP = [66, 48], SCAN_SPAN = 150, SCAN_EVERY = 1 / 3, SCAN_N = 12, SCAN_HALF = 0.5, SCAN_GAP = 6;   // three pulses a second, so several fronts are in flight at once
  const scanSpeed = () => 35 * (clamp(live.F?.metrics?.lsm ?? 5, 4, 40) / 5) ** 1.3;   // px/s, steeper than linear: 35 at 5 kPa (clearly slow), 240 at 25 (7x), 520 from 40
  function scanArc(r) {
    const [cx, cy] = SCAN_TIP, h = SCAN_HALF * (0.75 + 0.25 * Math.min(1, r / 50));   // the front widens a little with depth
    const p = (t) => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
    return `M${p(-h)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p(h)}`;
  }
  // (1 Nov 2026, "Move everything to GPU": no layout read on the probe's frames. The cards its head and body keep clear of are read first in a
  // frame (readFrame), and only when the page's layout may have changed (layoutWatch), at most four times a second, never while the view
  // moves; the frames in between use the boxes last read. The tip's tap restarts by turning between two copies of its animation (tap, tap2),
  // not by reading the computed style to start the one again.)
  const scanLooks = { head: { made: false, at: 0, ask: 0, list: [], pool: [] }, cards: { made: false, at: 0, ask: 0, list: [], pool: [] } };
  const SCAN_LOOKS = {
    head: ['.pz-text.stage-blocker, .pz-data.stage-blocker, .pz-panel.stage-blocker', (el) => !(el.hidden || 'gone' in el.dataset || el.classList.contains('pz-hide') || getComputedStyle(el).opacity < 0.5), () => 0],
    cards: ['.pz-shade, .pz-data.stage-blocker, .pz-panel.stage-blocker', (el) => !(el.hidden || 'gone' in el.dataset || el.classList.contains('pz-hide') || el.classList.contains('pz-leave') || +getComputedStyle(el).opacity < 0.5), () => (live.pillEdge ? live.pillEdge.m : 8)],
  };
  const SCAN_READS = { head: () => { scanLookRead('head'); scanAgain(); }, cards: () => { scanLookRead('cards'); scanAgain(); } };
  // (Each look's record is kept: its list is written over by each read, with boxes from a pool of its own. Its callers use the list at once.)
  function scanLook(key) {
    const now = performance.now(), o = scanLooks[key];
    if (o.made && (o.ask || now - o.at < 250 || viewMoving() || !watch.due())) return o.list;
    o.made = true; o.ask = readFrame(SCAN_READS[key]);
    return o.list;
  }
  function scanLookRead(key) {
    const L = SCAN_LOOKS[key], sel = L[0], keep = L[1], wr = stageBox(), m = L[2](), o = scanLooks[key], list = o.list, pool = o.pool;
    const nl = document.querySelectorAll(sel);
    let n = 0;
    for (let i = 0; i < nl.length; i++) {
      const el = nl[i];
      if (!keep(el)) continue;
      const q = el.getBoundingClientRect();
      if (!q.width) continue;
      const b = pool[n] || (pool[n] = { x0: 0, y0: 0, x1: 0, y1: 0 });
      b.x0 = q.left - wr.left - m; b.y0 = q.top - wr.top - m; b.x1 = q.right - wr.left + m; b.y1 = q.bottom - wr.top + m;
      list[n++] = b;
    }
    list.length = n;
    o.made = true; o.at = performance.now(); o.ask = 0;
    return list;
  }
  // (Read: the probe is turned and its head shown or faded again against them, in the frame's own phase.)
  const scanAgainRun = () => { if (!scan.el) return; scan.headAt = 0; const t = scanTipLocal(); if (t) scanTurn(t.tx, t.y); };
  const scanAgain = () => nextFrame(scanAgainRun);
  // The probe's body and cable lie up and to the left of its tip, turned 45°: where a card covers any of that, the head fades out and the
  // waves stay, so no stub pokes out from under the card. (The box is the head's four corners, 90 px back along the axis, 13 px to either side.)
  function scanHead() {
    const tip = scan.el && scanTipLocal();
    if (!tip) return;
    const q = scanBody(tip.tx, tip.y, scan.deg);   // (the same four corners: 92 px back along the axis, 13 px either side)
    let hit = false;
    for (const r of scanLook('head')) if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) { hit = true; break; }
    scan.el.classList.toggle('head-off', hit);
  }
  const scanNap = () => { if (scan.on && !scan.raf) scan.raf = nextFrame(scanTick); };
  let scanWaveR = 0, scanWaveGap = 0;   // (the packet being drawn: its front and the ripples' gap, which scanArcAt reads)
  const scanArcAt = (j) => scanArc(Math.max(1, scanWaveR + (j - 1) * scanWaveGap));
  function scanTick(now) {
    scan.raf = 0;
    if (!scan.on || !scan.el) return;
    // At idle rest (the figure drawn no more, the blood stopped: idle-rest.js) the probe's waves stop with it: no frame is asked for until
    // rest(false) starts them again from where they stood. It had been the one loop of the figure that kept every frame going at rest.
    // ?scanrest=0: they run on at rest, as before.
    if (live.restStill()) { scan.last = 0; scan.parked = true; return; }
    // Under an open lobule the probe is covered: it looks again four times a second instead of every frame (leaving the
    // lobule uncovers it gradually, so it is moving again before it shows).
    if (live.lz?.isOpen()) { scan.last = 0; clearTimeout(scan.nap); scan.nap = setTimeout(scanNap, 250); return; }
    // Drawn on every frame the screen offers, like the blood (15 a second in Battery saver).
    if (scan.last && now - scan.last < paceMs()) { scan.raf = nextFrame(scanTick); return; }
    const dt = scan.last && !reduceMotion.matches ? Math.min(0.1, (now - scan.last) / 1000) : 0; scan.last = now;
    const target = scanSpeed();
    scan.v = scan.v ? scan.v + (target - scan.v) * (1 - Math.exp(-dt / 0.6)) : target;   // ease to a new kPa
    const lsm = live.F?.metrics?.lsm;
    if (Number.isFinite(lsm)) scan.k = scan.k == null || reduceMotion.matches ? lsm : scan.k + (lsm - scan.k) * (1 - Math.exp(-dt / 0.6));   // the callout's number eases too
    scanShow();
    if (!(now < scan.headAt)) { scan.headAt = now + 250; scanHead(); }
    if (now >= scan.next) { scan.fronts.push(0); scan.next = now + SCAN_EVERY * 1000; }
    if (!(now < scan.nextTap)) { scan.nextTap = scan.nextTap && now - scan.nextTap < 250 ? scan.nextTap + 1000 : now + 1000; scan.tapB = !scan.tapB; scan.el.classList.toggle('tap', !scan.tapB); scan.el.classList.toggle('tap2', scan.tapB); }   // the probe itself shakes once a second; the waves keep their own rhythm
    const span = clamp(scan.v * 2.5, 70, SCAN_SPAN);   // slow fronts fade sooner, so a healthy liver shows a few calm arcs, not a crowd
    const fr = scan.fronts, step = scan.v * dt;   // (each front moves on, those past the span are left out: in place)
    let nf = 0;
    for (let i = 0; i < fr.length; i++) { const r = fr[i] + step; if (r < span) fr[nf++] = r; }
    fr.length = nf;
    const gap = clamp(scan.v * SCAN_EVERY * 0.4, 2, SCAN_GAP);   // the ripples tighten when fronts are close, so neighbours never merge
    // (The packets' elements are looked up once, and an opacity or a path is written only when its text changed: an idle packet
    // stays at 0 without a write each frame. The same values as before, so the same picture.)
    scan.packs ||= wavePacks(scan.el);
    for (let i = 0; i < scan.packs.length; i++) {
      const w = scan.packs[i], r = scan.fronts[i];
      if (r == null) { paintWave(w, '0'); continue; }
      const u = r / span, fade = Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.04)) ** 1.2 * (1 - u * 0.35);
      // A short packet: the crest, with a faint ripple ahead and behind.
      scanWaveR = r; scanWaveGap = gap;
      paintWave(w, fade.toFixed(3), scanArcAt);
    }
    live.labelGL?.redraw();   // (the waves moved: the GPU copy of the probe follows in this frame)
    scan.raf = nextFrame(scanTick);
  }
  // The top left of the right lobe (the patient's right is the figure's left): the tip sits on its edge, aimed 45° down toward the portal vein.
  // Anchored to the liver, not the view: it pans off screen with the liver (and hides once the tip is out of view). Null when no probe shows.
  // (Worked out from the liver's path and its group's transform through the camera, as the screen box would give it: asking the
  // browser for the box (getBoundingClientRect) after the frame's figure writes forced a layout of the whole figure, every frame the
  // probe showed.)
  let scanLvD = '', scanLvBox = null;
  const SCAN_FLAT = newFlat();   // (the liver's outline cut for the scan tip's box: kept, written again when the outline changes)
  const SCAN_AT = { tx: 0, y: 0 };
  function scanTipLocal() {
    const lv = organEls.liver;
    if (!scan.on || !lv || live.morph > 0.5) return null;
    const d = lv.getAttribute('d');
    if (!d) return null;
    if (d !== scanLvD) { scanLvD = d; polyBoxInto(flattenPathInto(d, 0.05, SCAN_FLAT), SCAN_BOX); scanLvBox = SCAN_BOX[2] >= SCAN_BOX[0] ? SCAN_BOX : null; }
    if (!scanLvBox) return null;
    // (The box's four corners go through the liver's transform and the camera one by one; the box that holds them is the answer, in one kept record.)
    const m = gMatrix(organG.liver), bx0 = scanLvBox[0], by0 = scanLvBox[1], bx1 = scanLvBox[2], by1 = scanLvBox[3];
    if (!live.CTM) refreshCTM();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (let i = 0; i < 4; i++) {
      const qx = i & 1 ? bx1 : bx0, qy = i & 2 ? by1 : by0, wx = m ? m.a * qx + m.c * qy + m.e : qx, wy = m ? m.b * qx + m.d * qy + m.f : qy;
      const p = live.CTM.a * wx + live.CTM.c * wy + live.CTM.e - live.wrapRect.left, q = live.CTM.b * wx + live.CTM.d * wy + live.CTM.f - live.wrapRect.top;
      if (p < l) l = p; if (p > r) r = p; if (q < t) t = q; if (q > b) b = q;
    }
    SCAN_AT.tx = l + (r - l) * 0.13; SCAN_AT.y = t + (b - t) * 0.09;
    return SCAN_AT;
  }
  // The probe's reading is the FibroScan card's own number (fibroscan.js writes it in its frame, with its rounding) while a card
  // is on screen; without one it falls back to the model's eased value.
  function scanShow(cardTxt) {
    if (!scan.el) return;
    if (cardTxt != null && cardTxt === scan.shown && scan.svEl) return;   // (the card gives its number every frame; the same number is not written again)
    // (Whether a card is on screen is asked only when its number is not given: the card's own frame gives it, and asking laid the page out.)
    const card = fibroReading.cv, k = scan.k;   // (no layout asked: the card's own frame gives the number)
    const txt = cardTxt ?? (card?.isConnected && !card.closest('[hidden]') && fibroReading.txt != null ? fibroReading.txt : k == null ? '--' : k.toFixed(1));
    const sv = scan.svEl?.isConnected && scan.el.contains(scan.svEl) ? scan.svEl : (scan.svEl = scan.el.querySelector('.sp-val'));   // (found once, not queried every frame)
    putText(sv, txt);
    scan.shown = cardTxt != null ? cardTxt : null;
  }
  fibroReading.show = scanShow;
  // (Its body's far corners sit 76 px back from the tip along the probe and 13.8 px either side of it, the stroke included,
  // so the corners bound the rounded body: near the screen's top edge, a phone on its side, the probe lies flatter, down to 10°, so the whole
  // body stays 4 px or more below the top edge; the left edge wins where both press.)
  // The probe's body (its four corners, 92 px back along it and 13 px either side of the tip's line) turned to deg, stage-local.
  // (Written into one kept record, which its callers use at once.)
  const SCAN_Q = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function scanBody(tx, y, deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const u = i & 1 ? -2 : -92, v = i & 2 ? 13 : -13, px = tx + u * c - v * sn, py = y + u * sn + v * c;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    SCAN_Q.x0 = x0; SCAN_Q.y0 = y0; SCAN_Q.x1 = x1; SCAN_Q.y1 = y1;
    return SCAN_Q;
  }
  // The slide's cards the probe keeps clear of, one margin out (read at most four times a second).

  const scanCards = () => (store.get().presenting ? scanLook('cards') : NO_LIST);
  // (The same, read now: the Doppler probe's own read of the cards, in the frame's read phase.)
  const scanCardsRead = () => (store.get().presenting ? scanLookRead('cards') : NO_LIST);
  // (The turn's tests are plain functions of an angle, made once; none is a closure made on each ask.)
  const scanLeftOk = (tx, d) => tx - 92 * Math.cos(d * Math.PI / 180) - 13 * Math.sin(d * Math.PI / 180) >= SCAN_EDGE;
  const scanTopOk = (y, d) => y - 76 * Math.sin(d * Math.PI / 180) - 13.8 * Math.cos(d * Math.PI / 180) >= 4;
  const scanBodyLeftOk = (tx, d) => tx - 76 * Math.cos(d * Math.PI / 180) - 13.8 * Math.sin(d * Math.PI / 180) >= 4;   // (only the body must stay on screen; the cable is a short stub)
  function scanClear(cards, tx, y, d) {
    if (!cards.length) return true;
    const q = scanBody(tx, y, d);
    for (const b of cards) if (b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) return false;
    return true;
  }
  const SCAN_DEG = [];   // (the turn's text for each whole degree, made once)
  for (let i = 0; i <= 90; i++) SCAN_DEG.push(`${i}deg`);
  function scanTurn(tx, y = Infinity) {
    let deg = 45;
    while (deg < 80 && !scanLeftOk(tx, deg)) deg += 5;
    if (scanLeftOk(tx, deg)) while (deg > 10 && !scanTopOk(y, deg) && scanBodyLeftOk(tx, deg - 5)) deg -= 5;
    // (Where a slide's card (its glass, the deck tab included) comes within one margin of the probe's body, the probe turns, nearest
    // first, to an angle that keeps its body and reading clear of every card and on screen; with none, it stays and its head fades
    // under the card (scanHead): 17 Oct design review, the probe lay on the teaching card's tab.)
    const cards = scanCards();
    if (!scanClear(cards, tx, y, deg)) {
      // (The nearest angle that is clear, the larger one of two as far away; found by comparing, no list made.)
      let best = -1, bestD = Infinity;
      for (let d = 10; d <= 80; d += 5) {
        if (d === deg || !scanBodyLeftOk(tx, d) || !scanTopOk(y, d) || !scanClear(cards, tx, y, d)) continue;
        const gap = Math.abs(d - deg);
        if (gap < bestD || (gap === bestD && d > best)) { bestD = gap; best = d; }
      }
      if (best >= 0) deg = best;
    }
    if (deg !== scan.deg) { scan.deg = deg; scan.el.style.setProperty('--sp-turn', SCAN_DEG[deg]); }
    // (The cable stays a short stub behind the body at every angle: laid flatter it used to run on to the screen's edge, a long
    // straight wire across the stage and under the cards, 18 Oct.)
  }
  // The scan probe's model, made ahead (a frame clones it): plain elements carrying its shapes' numbers, styled by app.css, from which
  // label-gl.js reads its look and draws it on the GPU over the labels (nothing of it is drawn by the page).
  const SCAN_TPL = (() => {
    const el = document.createElement('div');
      const box = (cls, x, y, w, hh, rx) => `<i class="${cls}" x="${x}" y="${y}" width="${w}" height="${hh}" rx="${rx}" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px"></i>`;
    el.innerHTML = '<div class="sp-svg sp-beam-svg"><i id="sp-beam" cx="66" cy="48" r="150">'
        + '<i class="sp-stop" offset="0" style="stop-color:var(--scan);stop-opacity:.22"></i><i class="sp-stop" offset="1" style="stop-color:var(--scan);stop-opacity:0"></i></i>'
        + '<i class="sp-beam" d="M66 48 L197.6 -23.9 A150 150 0 0 1 197.6 119.9 Z"></i></div><div class="sp-svg"><i class="sp-waves">'
        + '<i class="sp-pk"><i class="sp-rip"></i><i class="sp-front"></i><i class="sp-rip"></i></i>'.repeat(SCAN_N) + '</i>'
        + '<i class="sp-cable" d="M-26 48 C-18 48 -14 48 -8 48"></i><i class="sp-head">' + box('sp-body', -10, 35, 68, 26, 11)
        + box('sp-tip', 54, 39, 10, 18, 3) + box('sp-screen', -3, 39.5, 54, 17, 4)
        + '<i class="sp-read" x="24" y="52.3" text-anchor="middle"><i class="sp-val">5.0</i><i class="sp-unit" dx="2">kPa</i></i></i></div>';   // (constant markup; the screen on the body shows the live stiffness)

    return el;
  })();
  const scanShown = () => scan.el?.classList.remove('cath-pre');
  function scanPaint() {
    if (!scan.el) {
      const el = SCAN_TPL.cloneNode(true);
      el.className = 'scan-probe cath-pre'; el.setAttribute('aria-hidden', 'true');
      // The probe's model: plain elements carrying its shapes' numbers (x, y, width, height, rx, d; the beam's gradient and stops), styled
      // by app.css, from which label-gl.js reads its look and draws it on the GPU over the labels. Nothing of it is drawn by the page: no
      // SVG (1 Nov 2026: nothing off the GPU). The rects and the reading take their boxes too, for what keeps clear of the probe's body.
      late('add', sites.el, el); scan.el = el; scan.deg = 45;
      live.labelGL?.setScan(el);   // (drawn over the labels on their GPU layer while it can be; label-gl.js)
      const t0 = scanTipLocal(); if (t0) scanTurn(t0.tx, t0.y);   // (turned before it first shows, so it fades in at its angle rather than swinging to it)
      nextFrame(scanShown);   // (its first look at cath-pre is this frame's own style pass: no layout forced for the fade)
      if (reduceMotion.matches) { scan.fronts.length = 0; scan.fronts.push(40, 90); scan.v = 0; scan.next = scan.nextTap = Infinity; }
      if (!scan.raf) { scan.last = 0; scan.raf = nextFrame(scanTick); }
    }
    const tip = scanTipLocal(), wr = stageBox();   // (the cached box: reading the wrap's on each paint forced a layout)
    if (!tip) { scan.el.classList.add('off'); return; }
    const { tx, y } = tip, x = tx - SCAN_TIP[0];
    // Turned 45° down-right, the probe's body and its kPa screen reach 75 px left of the tip; where the liver sits near the
    // screen's left edge (a phone), the probe stands steeper, up to 80°, so its reading stays whole on screen.
    scanTurn(tx, y);
    scan.el.classList.toggle('off', tx < -30 || tx > wr.width + 30 || y < -30 || y > wr.height + 30);
    scan.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  function setScanProbe(on) {
    if (scan.on === !!on) return;
    scan.on = !!on;
    if (on) { scan.leaving = false; refreshCTM(); scanPaint(); return; }
    // The callout and its leader fade out with the probe, then go.
    scan.leaving = true; scan.k = null;
    live.pool.get('scan')?.g.classList.add('lb-off'); live.gScan.classList.add('off');
    setTimeout(() => { if (scan.on) return; scan.leaving = false; const b = live.pool.get('scan'); if (b) b.g.style.display = 'none'; }, 700);
    const el = scan.el; scan.el = null; scan.packs = null; scan.fronts = []; scan.v = 0; scan.next = 0; scan.nextTap = 0;
    if (scan.raf) { cancelFrame(scan.raf); scan.raf = 0; }
    if (el) { el.classList.add('cath-pre'); setTimeout(() => { dropLabel(el); el.remove(); if (!scan.el) live.labelGL?.setScan(null); }, 500); }
  }
  return { scan, scanCardsRead, scanPaint, scanTick, scanTipLocal, setScanProbe };
}
