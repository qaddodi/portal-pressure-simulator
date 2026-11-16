// Station labels, their sizes, the glide and the names on the GPU
// (moved out of lobule-zoom.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { caught } from './caught.js';
import { classHas, classSoon, runSoon } from './class-soon.js';
import { deltaColor, oxygenColor } from './colormap.js';
import { D_SMALL, D_SURFACE, easeArrive } from './ease.js';
import { inkRows, mirrorOf, rgbaOf as capRGBA } from './label-captions.js';
import { explainText } from './label-explain.js';
import { overlapLRTB } from './label-place.js';
import { readStyle } from './layout-snap.js';
import { leaderEnd } from './leader-end.js';
import { darkMQ } from './look.js';
import { cancelRest, flushRestAttrs, restAttr, restPass } from './rest-pass.js';
import { store } from './store.js';
import { geoOf, setGeo, svgModel } from './svg-gl.js';
import { clamp, fmt, h } from './util.js';

export function createLobuleLabels(st, live) {
  const { V, atInto, callEl, callLine, callParts, callRing, cap, centreOn, cssN, el, freeRect, host, labels, leadGL, leadPaint, leaders, onOcc, pc, reduce, relayout, sX, sY, select, tissue, touches, viewChanged, wheelQuiet } = st;
  // A number's text as fmt (util.js) prints it, made again only when the number reaches another printed value: its scaled, rounded value
  // (q) is kept with the text in `slot`. A value within 1e-6 of a rounding edge (or not a number) is always made in full, so the text is
  // always what fmt gives. The glide asks every frame; the text changes a few times a second.
  const SCALE = [1, 10, 100];
  const mkSlot = () => ({ q: NaN, d: -1, s: '' });
  const shown = (slot, v, d) => {
    const sc = v * SCALE[d], q = Math.round(sc), sure = Number.isFinite(sc) && Math.abs(sc - Math.floor(sc) - 0.5) > 1e-6;
    if (sure && slot.q === q && slot.d === d && slot.s !== '') return slot.s;
    const t = fmt(v, d);   // alloc-rare: only when the printed number changes, or a value sits on a rounding edge
    slot.q = sure ? q : NaN; slot.d = d; slot.s = t;
    return t;
  };
  // A whole number's text (String(n)), made again only when the number changes.
  const shownInt = (slot, n) => { if (Object.is(slot.q, n) && slot.s !== '') return slot.s; slot.q = n; slot.s = `${n}`; return slot.s; };
  // A change from healthy, '+5' or '−5' (fmt of its size, a sign before it), made again only when its size or sign changes.
  const shownDelta = (slot, d) => {
    const a = Math.abs(d), q = Math.round(a), up = d > 0;
    if (Number.isFinite(a) && slot.s !== '' && slot.q === q && slot.up === up) return slot.s;
    slot.q = Number.isFinite(a) ? q : NaN; slot.up = up; slot.s = `${up ? '+' : '−'}${fmt(a, 0)} mmHg`;   // alloc-rare: only when the change's size or sign changes
    return slot.s;
  };
  const stV = { triad: mkSlot(), sin: mkSlot(), cv: mkSlot() }, stD = { triad: mkSlot(), sin: mkSlot(), cv: mkSlot() };
  const stLy = mkSlot(), stFlow = mkSlot(), stO = [mkSlot(), mkSlot(), mkSlot()], stP = [mkSlot(), mkSlot(), mkSlot()];
  const OXY_AT = { triad: 0, sin: 1, cv: 2 };
  // What the station card has to say: the number, its unit, the change and its colour, in one kept record (never an array made for it).
  const reading = { v: '', u: '', d: '', col: null };
  // The panel's words for the tissue canvas, as last said (what they were made from, to know when they have changed).
  const say = { kind: -1, a: '', b: '', c: '', f: '' };
  const SAY_HIDE = 'Liver lobule. Pressures not measured.';
  function station(m, key, v, r) {
    if (m.hide) { reading.v = '?'; reading.u = ''; reading.d = ''; reading.col = null; return; }
    // (Colored by oxygen: the station's oxygen saturation, the value the lens colours it by.)
    if (m.mode === 'oxygen' && m.oxy) { const sat = m.oxy[OXY_AT[key]]; badges[key] = null; reading.v = shown(stV[key], sat * 100, 0); reading.u = '% O₂'; reading.d = ''; reading.col = oxygenColor(sat); return; }
    const d = r != null ? v - r : 0, on = m.cmp ? 1 : 5, off = m.cmp ? 0.7 : 4;
    const showD = Math.abs(d) >= on || (badges[key] === m.cmp && Math.abs(d) >= off);
    badges[key] = showD ? m.cmp : null;
    // (The unit is said once, in the pressure legend, as the anatomy's labels have it; looks review L2, 31 Oct.)
    reading.v = shown(stV[key], v, 1); reading.u = ''; reading.d = showD ? shownDelta(stD[key], d) : '';
    reading.col = m.mode === 'delta' || m.mode === 'since' ? deltaColor(live.qP(d)) : pc(v);
  }
  function panel() {
    const m = live.model;
    // On a slide, once settled the sinusoids read the slide's own value, as its tile does (lobule and sinusoid labels agree with it).
    { const st = store.get(), fs = st.presenting && st.presentFp?.sin; if (Number.isFinite(fs) && Math.abs(m.P2 - fs) < 0.6) m.P2 = fs; }
    // (Written only when its words change: the glide reaches here every frame, so the words are made only when a printed number has changed.)
    let said = live.tissueSaid;
    if (m.hide) { if (say.kind !== 0) { say.kind = 0; said = SAY_HIDE; } }
    else if (m.mode === 'oxygen' && m.oxy) {
      const a = shown(stO[0], m.oxy[0] * 100, 0), b = shown(stO[1], m.oxy[1] * 100, 0), c = shown(stO[2], m.oxy[2] * 100, 0);
      if (say.kind !== 1 || say.a !== a || say.b !== b || say.c !== c) { say.kind = 1; say.a = a; say.b = b; say.c = c; said = `Liver lobule: oxygen saturation in the portal venule ${a}, sinusoids ${b}, central vein ${c} percent.`; }   // alloc-rare: only when a printed number changes
    } else {
      const a = shown(stP[0], m.P1, 1), b = shown(stP[1], m.P2, 1), c = shown(stP[2], m.P3, 1), f = shownInt(stFlow, Math.round(m.flow * 100));
      if (say.kind !== 2 || say.a !== a || say.b !== b || say.c !== c || say.f !== f) { say.kind = 2; say.a = a; say.b = b; say.c = c; say.f = f; said = `Liver lobule: portal venule ${a}, sinusoids ${b}, central vein ${c} millimeters of mercury; sinusoidal flow ${f} percent of normal.`; }
    }
    if (said !== live.tissueSaid) { live.tissueSaid = said; restAttr(tissue, 'aria-label', said); }
    // Station cards on the figure.
    // Labels as in the anatomy: the station, its pressure, and the change from healthy once it reaches
    // 5 mmHg; while comparing, every change from the pinned moment (shown at 1, dropped below 0.7).
    // In the Change view the bar takes the change's colour, as the vessels do.
    station(m, 'triad', m.P1, m.R[0]); setLab('triad', 'Portal venule', 'Portal venule', reading.v, reading.u, reading.d, reading.col);
    station(m, 'sin', m.P2, m.R[1]); setLab('sin', 'Sinusoids', 'Sinusoids', reading.v, reading.u, reading.d, reading.col);
    station(m, 'cv', m.P3, m.R[2]); setLab('cv', 'Central vein', 'Central vein', reading.v, reading.u, reading.d, reading.col);
    // Lymph (Lymph layer on): the whole liver's rate and its protein; the change from healthy is on its card.
    if (m.hide) setLab('lymph', 'Lymphatic', 'Lymph', '?', '', '', null);
    else setLab('lymph', 'Lymphatic', 'Lymph', shown(stLy, m.lymph, 1), lymphUnit(Math.round(m.lyProt * 100)), '', null);
    // The arteriole and the ductule: named, with no reading (the model has no pressure of their own); a slide's term ranks them up (named()).
    setLab('ha', 'Hepatic arteriole', 'Arteriole', '', '', '', 'var(--artery)');
    setLab('bd', 'Bile ductule', 'Bile ductule', '', '', '', 'var(--bile-duct)');
    if (live.sinTo || live.sinU > 0) live.sv.setModel(m);
  }
  const lyUnitSlot = mkSlot();
  const lymphUnit = (n) => { if (Object.is(lyUnitSlot.q, n) && lyUnitSlot.s !== '') return lyUnitSlot.s; lyUnitSlot.q = n; lyUnitSlot.s = `mL/min · Protein ${n}%`; return lyUnitSlot.s; };
  // ── Station labels (HTML, styled as the anatomy's) with leaders ──
  const labs = {}, badges = {};
  // What a label's size depends on beyond its own text and classes (see layoutLabels).
  let fontVer = 0;
  document.fonts?.addEventListener?.('loadingdone', () => { fontVer++; });
  // (The text is made again only when something it is made of has changed, found by comparing the parts one by one with those it was
  // last made from: the layout asks for it for every label and name, and nothing is built to find that it is the same.)
  const envMemo = { s: '', w: -1, h: -1, dpr: -1, fv: -1, fs: null, body: null, host: null, el: null, attrs: [] };
  const sizeEnv = () => {
    const at = document.documentElement.attributes, n = at.length, ea = envMemo.attrs, st = document.fonts?.status;
    let same = envMemo.s !== '' && envMemo.w === innerWidth && envMemo.h === innerHeight && envMemo.dpr === devicePixelRatio && envMemo.fv === fontVer && envMemo.fs === st
      && envMemo.body === document.body.className && envMemo.host === host.className && envMemo.el === el.className && ea.length === n * 2;
    if (same) for (let i = 0; i < n; i++) { const a = at[i]; if (ea[2 * i] !== a.name || ea[2 * i + 1] !== a.value) { same = false; break; } }
    if (same) return envMemo.s;
    envMemo.w = innerWidth; envMemo.h = innerHeight; envMemo.dpr = devicePixelRatio; envMemo.fv = fontVer; envMemo.fs = st;
    envMemo.body = document.body.className; envMemo.host = host.className; envMemo.el = el.className;
    ea.length = 0;
    for (let i = 0; i < n; i++) ea.push(at[i].name, at[i].value);
    envMemo.s = `${envMemo.w}x${envMemo.h}|${envMemo.dpr}|${fontVer}|${st}|${[...at].map((a) => `${a.name}=${a.value}`).join(' ')}|${envMemo.body}|${envMemo.host}|${envMemo.el}`;   // alloc-rare: only when the window, the fonts, the page's attributes or classes changed
    return envMemo.s;
  };
  // ── Sizes, measured outside the frame ──
  // The labels', the call pill's and the zone names' sizes are read in a timer task of their own (measureRun), asked for by the frame
  // that found them unmeasured for what decides them (the look: sizeEnv; the element's classes; its words, with digits as zeros since
  // they are tabular; the pill's width limit), and kept. That frame leaves the labels as they are seen; the next one lays them out.
  const measQ = new Set();
  // (A label's key is made again only when the look (env), its classes or its content (L.ver, counted as pageRun writes it) changed.)
  const labKey = (e, L) => {
    const cls = L.el.className;
    if (L.kEnv === e && L.kCls === cls && L.kVer === L.ver && L.kKey !== undefined) return L.kKey;
    L.kEnv = e; L.kCls = cls; L.kVer = L.ver;
    L.kKey = `${e}|${cls.replace(/(^| )(stack|lz-off)(?= |$)/g, '')}|${L.el.innerHTML.replace(/\d/g, '0')}`;
    return L.kKey;
  };
  // (Whether a label shows is held on the label (_hid) the moment it changes, and written as the `hidden` attribute between frames
  // (restAttr): a frame writes no attribute. measureRun flushes the writes first and then measures the page as it stands.)
  const isHid = (el) => el._hid ?? el.hidden;
  const setHid = (el, b) => { el._hid = b; restAttr(el, 'hidden', b ? '' : null); };
  // What decides a call pill's or a zone name's size, kept with the size it was measured at: the look (env), whether it shows, its
  // classes (less lz-off), its words (numerals as zeros: they are tabular) and its width limit. Compared part by part (sizeCurrent).
  // A zone name's words never change; a pill's are its one text node.
  const clsOf = (c) => c.replace(/(^| )lz-off(?= |$)/g, '');   // alloc-rare: only when an element is measured (a rest pass) or its classes changed (sizeCurrent)
  const zeroNums = (t) => t.replace(/\d/g, '0');   // alloc-rare: only when an element is measured (a rest pass) or a pill's words changed (sizeCurrent)
  const textOf = (e) => { const c = e.firstChild; return c && c.nodeType === 3 && !c.nextSibling ? c.data : ''; };
  const sizeRecord = (e, en, w, h) => { const cls = e.className, tx = textOf(e); return { env: en, hid: isHid(e), cls, clsN: clsOf(cls), mw: e.style.maxWidth, tx, txN: zeroNums(tx), w, h, txt: e.textContent }; };
  function sizeCurrent(e, z, en) {
    if (!z || z.env !== en || z.hid !== isHid(e) || z.mw !== e.style.maxWidth) return false;
    const cls = e.className;
    if (cls !== z.cls) { if (clsOf(cls) !== z.clsN) return false; z.cls = cls; }   // alloc-rare: only when the element's classes changed (a fade)
    const tx = textOf(e);
    if (tx !== z.tx) { const n = zeroNums(tx); if (n !== z.txN) return false; z.tx = tx; }   // alloc-rare: only when a pill's words changed
    return true;
  }
  // A call pill's or a zone name's size as measured ([fw, fh] where it is unmeasured or takes no room), asking for it to be measured
  // when what decides it changed; the layout is done again once it has been (measureRun).
  let callFit = '', callFitT = 0;
  function writeCallFit() { callFitT = 0; if (callEl.style.maxWidth === callFit) return; callEl.style.maxWidth = callFit; measQ.add(callEl); if (!live.measT) live.measT = restPass(measureRun); }
  let szW = 0, szH = 0;   // (sizeOf's answer: the width and the height, read straight after the call)
  function sizeOf(e, fw, fh) {
    const z = e._lzSz;
    if (!sizeCurrent(e, z, sizeEnv())) { measQ.add(e); if (!live.measT) live.measT = restPass(measureRun); }
    szW = z?.w || fw; szH = z?.h || fh;
  }
  function measureRun() {
    live.measT = 0;
    if (live.layerScaled) { measHeld = true; return; }   // (the letters' boxes are read in the layer's own px: see mirrorRun)
    const env = sizeEnv(), els = [...measQ], want = live.labWant;
    measQ.clear(); live.labWant = null;
    flushRestAttrs();   // (a pill's kind changes its border and so its size: written before it is measured)
    let moved = false;
    for (const e of els) { const w = e.offsetWidth, h = e.offsetHeight; if (w !== e._lzSz?.w || h !== e._lzSz?.h) moved = true; e._lzSz = sizeRecord(e, env, w, h); }
    if (want) {
      // (As the layout did in the frame before: unstacked to read the width, stacked where that is too wide, then read; written,
      // then read together. Put back as found, for the next frame to lay out.)
      const shown = want.ks.map((k) => labs[k]).filter(Boolean);
      const peek = shown.map((L) => L.el.hidden), had = shown.map((L) => classHas(L.el, 'stack'));
      shown.forEach((L) => { L.el.hidden = false; L.el.classList.remove('stack'); });
      const w0 = shown.map((L) => L.el.offsetWidth), u2 = shown.map((L) => !!L.el.querySelector('.u2'));
      const stack = shown.map((x, i) => w0[i] > want.fw && u2[i]);
      shown.forEach((L, i) => { if (stack[i]) L.el.classList.add('stack'); });
      const sizes = shown.map((L) => [L.el.offsetWidth || 100, L.el.offsetHeight || 40]), px = (v) => parseFloat(v) || 0;
      for (const L of shown) {
        // (The padding round the letters, read with the sizes: a leader stops on the letters' box, not at the label's middle.)
        const cs = getComputedStyle(L.el);
        L.pad = ['Left', 'Right', 'Top', 'Bottom'].map((d) => px(cs[`padding${d}`]));
        L.rows = inkRows(L.el, L.rows);   // (each line's own box: a leader stops on the line it runs to, not on the corner a longer line makes)
      }
      shown.forEach((L, i) => {
        const was = L.sz, k = stack[i] ? 's1' : 's0', key = labKey(env, L);
        if (!was || was.w0 !== w0[i] || was.u2 !== u2[i] || `${was[k]}` !== `${sizes[i]}` || `${was.pad}` !== `${L.pad}`) moved = true;
        const sz = was?.key === key ? was : (L.sz = { key, w0: w0[i], u2: u2[i] });
        sz.w0 = w0[i]; sz.u2 = u2[i]; sz[k] = sizes[i]; sz.pad = L.pad;
      });
      shown.forEach((L, i) => { L.el.hidden = peek[i]; L.el.classList.toggle('stack', had[i]); });
    }
    if (moved && live.fade > 0) relayout();
    mirrorAll();
  }
  // A new text size (pps:labelscale, an event, not a frame): the labels on show, the call pill and the zone names are measured at once,
  // so their leaders and the next layout use the new sizes from the first frame.
  function measureShown() {
    if (!live.geo || live.fade <= 0) return;
    const f = freeRect();
    live.labWant = { ks: Object.keys(labs).filter((k) => !isHid(labs[k].el)), fw: (f.r - f.l) * 0.32 };
    for (const e of [callEl, ...zoneEls]) if (e.isConnected) measQ.add(e);
    cancelRest(live.measT); measureRun();
  }
  // A label's size as measured, for the stacking it has now.
  const LAB_WH = [100, 40];   // (read, never written: a label's size before it is measured)
  const labWH = (L) => (L.sz && (classHas(L.el, 'stack') ? L.sz.s1 : L.sz.s0)) || LAB_WH;
  // ── Where a label is seen, mid-glide ──
  // A label's place as seen: its glide (none now: a label laid out to another slot is there in the frame, noteAt) noted as it is written, and each
  // frame's place worked out from it (seenAt), on the page's animation clock, so the leaders follow it with no read of the page.
  const EASE_LAB = easeArrive;   // (the arrivals' curve, cubic-bezier(.2, .8, .2, 1): the same curve it was built as)
  const tlNow = () => document.timeline?.currentTime ?? performance.now();
  const ZERO2 = [0, 0];   // (read, never written)
  const easeLab = (g, now) => EASE_LAB(clamp((now - g.t0) / D_SURFACE, 0, 1));
  const labGliding = (L, now) => !!L.gl && (L.gl.x0 !== L.gl.x1 || L.gl.y0 !== L.gl.y1) && now - L.gl.t0 < D_SURFACE;
  // A label's glide is one object on it, written again in place (a glide begun on another carries from where this one stands now).
  const glOf = (L) => L.gl || (L.gl = { x0: 0, y0: 0, x1: 0, y1: 0, t0: 0 });
  function noteAt(L) {
    const sp = spot.get(L.el) || ZERO2, x = sp[0], y = sp[1], g = L.gl;
    if (g && g.x1 === x && g.y1 === y) return;
    const now = tlNow();
    let px = x, py = y;
    if (g) { const e = easeLab(g, now); px = g.x0 + (g.x1 - g.x0) * e; py = g.y0 + (g.y1 - g.y0) * e; }
    // (Only a label already shown glides: one coming out of hidden starts where it is written, as the page shows it.)
    const eased = false;   // (a label laid out to another slot is there in this frame, not glided to over a short time: V-LBL-1, V-LBL-3)
    const o = glOf(L);
    if (eased) { o.x0 = px; o.y0 = py; } else { o.x0 = x; o.y0 = y; }
    o.x1 = x; o.y1 = y; o.t0 = now;
  }
  // Where a label is seen now, in the label's own [x, y] (read straight away, never kept).
  function seenAt(L, now) {
    const sp = spot.get(L.el) || ZERO2, x = sp[0], y = sp[1];
    let g = L.gl;
    if (!g || g.x1 !== x || g.y1 !== y) { g = glOf(L); g.x0 = x; g.y0 = y; g.x1 = x; g.y1 = y; g.t0 = now; }   // (written with no glide noted: there)
    const e = easeLab(g, now), o = L.seenXY || (L.seenXY = [0, 0]);   // alloc-rare: only the first time a label's place is worked out
    o[0] = g.x0 + (g.x1 - g.x0) * e; o[1] = g.y0 + (g.y1 - g.y0) * e;
    return o;
  }
  // A unit with a second reading ('mL/min · Protein 48%'): the second part can drop to its own line when the label is wide.
  const unitParts = (u) => {
    if (!u) return [];
    const [a, ...rest] = u.split(' · ');
    return rest.length ? [h('small', {}, a), h('small', { class: 'u2' }, h('span', { class: 'dot' }, '· '), rest.join(' · '))] : [h('small', {}, u)];
  };
  // What a presenter slide's terms call each label (presentLit, see presenter.js TARGETS).
  const LZ_TARGET = { ha: 'arteriole', bd: 'ductule', triad: 'triad', sin: 'sinusoid', cv: 'central', lymph: 'lymph' };
  // Page writes asked for inside a frame (a label's words, a node put into the page) land between frames (rest-pass.js), in the order
  // asked, so a frame does no DOM work (2 Nov 2026, "Move everything to GPU"; scripts/off-gpu-scan.mjs domWrite). A label whose
  // words take more or fewer characters is laid out again once they are in.
  const mountQ = [], labQ = new Set();
  let pageT = 0;
  const pageSoon = () => { if (!pageT) pageT = restPass(pageRun); };
  const mount = (parent, ...els) => { mountQ.push([parent, els]); pageSoon(); };   // alloc-rare: only when a node is first put into the page (callers skip one already there)
  const writeLab = (L) => { labQ.add(L); pageSoon(); };
  const swQ = new Set();   // (the labels whose swatch colour changed: it is only a variable on the label, so it rebuilds nothing)
  function pageRun() {
    pageT = 0;
    for (const [parent, els] of mountQ.splice(0)) parent.append(...els.filter((e) => !e.isConnected));
    for (const L of labQ) {
      if (L.spec) labBuild(L);
      else {
        if (L.b && L.b.textContent !== L.bv) L.b.textContent = L.bv;
        if (L.dEl && L.dEl.textContent !== L.dv) L.dEl.textContent = L.dv;
        if (L.xEl && L.xEl.textContent !== L.xv) L.xEl.textContent = L.xv;
        if (L.uw != null) { const [a, ...rest] = L.uw.split(' · '); if (rest.length) { L.uEls[0].textContent = a; L.uEls[1].lastChild.textContent = rest.join(' · '); } else if (L.uw) L.uEls[0].textContent = L.uw; L.uw = null; }
      }
      L.ver = (L.ver | 0) + 1;   // (its content may have changed: labKey makes its key again)
      if (L.aria) { L.aria = false; const said = ariaOf(L); L.el.setAttribute('aria-label', said); L.el.title = L.sD ? said.replace(/\. Show details$/, '') : ''; }   // (the change in words on hover: "up 15 mmHg from healthy")
      if (L.relay) { L.relay = false; live.layoutKey = ''; }
      mirrorSoon(L.el);
    }
    labQ.clear();
    for (const L of swQ) if (L.swHas !== L.swWant) { L.swHas = L.swWant; L.el.style.setProperty('--sw', L.swWant); }
    swQ.clear();
  }
  // A label's parts, built between frames (pageRun) from what the frame asked for (L.spec): a frame builds no elements (2 Nov 2026).
  function labBuild(L) {
    const { name, short, u, hasD, hasX } = L.spec, uw = L.uw ?? u;
    L.spec = null; L.uw = null;
    L.b = L.empty ? null : h('b', {}, L.bv);
    L.dEl = hasD ? h('span', { class: 'd' }, L.dv) : null;
    L.xEl = hasX ? h('span', { class: 'x' }, L.xv) : null;
    L.uEls = unitParts(uw);
    L.el.replaceChildren(...[h('span', { class: 'n' }, h('span', { class: 'n-long' }, name), h('span', { class: 'n-short' }, short)),
      L.empty ? null : h('span', { class: 'v' }, L.b, ...L.uEls, L.dEl), L.xEl].filter(Boolean));
  }
  // Every label and its leader are made with the view, hidden, in the order the panel names them (so their tab order is the panel's):
  // a frame that first names one finds it made.
  function labMake(key) {
    const L = labs[key] = { el: h('button', { class: 'lz-lab', type: 'button', 'data-target': `lobule:${LZ_TARGET[key] || key}` }), line: svgModel('line', { class: 'leader', 'data-look': 'small.lead.line', 'data-target': `lobule:${LZ_TARGET[key] || key}` }), dotEl: svgModel('circle', { class: 'leader-dot', 'data-look': 'small.lead.dot', r: 3, 'data-target': `lobule:${LZ_TARGET[key] || key}` }) };
    L.el.addEventListener('click', (ev) => { if (!live.geo || ev.detail !== 0) return; const q = anchorOf(key); if (classHas(L.el, 'edge')) centreOn(q); else select(hitKind(key), [q[0], q[1]]); });
    // (Hidden until it is first placed, where it fades in: a label its slide does not name never shows at all.)
    L.el.hidden = true;
    labels.append(L.el); leaders.append(L.line, L.dotEl);
  }
  for (const k of ['triad', 'sin', 'cv', 'lymph', 'ha', 'bd']) labMake(k);
  const EX_NOTE = { triad: 'where portal blood enters', sin: 'where blood meets the liver cells', cv: 'collects the sinusoids, drains to the hepatic vein',
    lymph: 'carries filtered fluid and protein away', ha: 'arterial blood, with oxygen', bd: 'carries bile out' };
  function explainTip(key, name, v, u) {
    const n = Number.parseFloat(v), note = EX_NOTE[key];
    return explainText({ name: '', value: Number.isFinite(n) && !/[^\d.\-+−]/.test(v) ? n : NaN, unit: u || 'mmHg', note });
  }
  function explainSet(key, target = null) {
    const app = live.appEl?.isConnected ? live.appEl : (live.appEl = document.querySelector('.app'));
    if (key === live.exKey) return;
    if (app) {
      if (key) { if (live.exKey == null) live.exSaved = app.dataset.lit ?? null; live.exSet = target; app.dataset.lit = live.exSet; }
      else { if (app.dataset.lit === live.exSet) { if (live.exSaved) app.dataset.lit = live.exSaved; else delete app.dataset.lit; } live.exSet = live.exSaved = null; }
    }
    live.exKey = key; live.sv.setExplain?.(key); live.layoutKey = '';
    if (live.model) panel();
    pageSoon();
  }
  function setLab(key, name, short, v, u, d, col) {
    const L = labs[key];
    // (What it last showed, compared part by part: no text is made to find that nothing changed.)
    const x = live.exKey === key ? explainTip(key, name, v, u) : '';   // (the tapped label's own line, label-explain.js)
    const textSame = L.sN === name && L.sV === v && L.sU === u && L.sD === d && (L.sX ?? '') === x;
    if (textSame && L.sC === col) return;
    L.sN = name; L.sV = v; L.sU = u; L.sD = d; L.sC = col; L.sX = x;
    // Only the number (or its change) moved: its text is updated in place, and the labels are laid out again
    // only when it takes more or fewer characters (the label is rebuilt only when its make-up changes). The same holds for
    // a figure inside the unit ('Protein 48%', which moves with the pulse): its numerals are tabular, so a new figure with
    // as many numerals leaves the label's size as it was.
    // (Its colour is only a style on the label: a new one, which the pressure glide brings every frame, rebuilds nothing.)
    if (col !== L.col) { L.col = col; L.swWant = col || 'var(--border-strong)'; swQ.add(L); pageSoon(); }   // (the page's variable is set between frames, pageRun)
    if (L.ukSrc !== u) { L.ukSrc = u; L.uk = u.replace(/\d/g, '0'); }
    const uk = L.uk, hasD = !!d, empty = v === '';
    const hasX = !!x, same = L.fN === name && L.fS === short && L.fU === uk && L.fE === empty && L.fD === hasD && !!L.fX === hasX;   // (the label's make-up, part by part)
    if (same && !L.empty) {
      if (v.length !== L.bv.length || (d && d.length !== L.dv.length)) { live.layoutKey = ''; L.relay = true; }
      // (Each part is written only when its own text changed: a new colour alone, or a new unit figure, leaves the number be.
      // Written between frames, pageRun.)
      if (L.bv !== v) { L.bv = v; writeLab(L); }
      if (d && L.dv !== d) { L.dv = d; writeLab(L); }
      if (hasX && L.xv !== x) { L.xv = x; writeLab(L); }
      if (u !== L.u) { L.uw = u; writeLab(L); }
    } else {
      L.fN = name; L.fS = short; L.fU = uk; L.fE = empty; L.fD = hasD; L.fX = hasX; L.xv = x;
      L.lk = `${name}|${short}|${uk}|${empty}|${hasD}|${hasX}`;   // alloc-rare: only when the label's make-up changes (what the layout depends on; a value of new length clears layoutKey above)
      L.spec = { name, short, u, hasD, hasX };   // alloc-rare: only when the label's make-up changes
      L.empty = empty;
      L.bv = v; L.dv = d || ''; L.uw = null;
      writeLab(L);
      live.layoutKey = ''; L.relay = true;
    }
    L.u = u;
    // (Its spoken words are made between frames, pageRun, from what it shows then and the model's mode now.)
    if (!textSame) { L.aCmp = !!live.model?.cmp; L.aSince = !!live.model?.since; L.aria = true; writeLab(L); }
  }
  const ariaOf = (L) => `${L.sN} ${L.sV} ${L.sU}${L.sD ? `, ${L.sD.startsWith('+') ? 'up' : 'down'} ${L.sD.slice(1)} ${L.aCmp ? 'since then' : L.aSince ? 'since the slide before' : 'from healthy'}` : ''}. Show details`;
  // Which portal venule and which sinusoid carry the label: at first the left portal venule and the
  // sinusoid just below the middle of the left side; as the view is zoomed or panned, the label stays
  // on its vessel while that is comfortably in view, and otherwise moves to the one in view nearest
  // the middle of the free space (so it does not jump about).
  // A presenter slide that lights lobule terms dims every other label and zone name to 35 % (app.css, dimmed): they keep their places and their room.
  const LIT_OK = ['triad', 'arteriole', 'ductule', 'sinusoid', 'central', 'lymph', 'zone1', 'zone3'].map((t) => `lobule:${t}`);
  const litOf = () => {
    if (!live.appEl?.isConnected) live.appEl = document.querySelector('.app');
    const r = live.appEl?.dataset.lit;
    if (r !== live.litRaw) { live.litRaw = r; live.litSet = new Set(r ? r.split(' ') : []); }   // alloc-rare: only when the lit terms change (a slide)
    return live.litSet;
  };
  // (Each label's lit term, and each zone name's, written out once: no text is made to ask for them.)
  const LIT_OF = {};
  for (const k of Object.keys(LZ_TARGET)) LIT_OF[k] = `lobule:${LZ_TARGET[k]}`;
  const named = (k) => litOf().has(LIT_OF[k]);
  const pick = { triad: 3, lt: null, sin: null, geo: null };
  // A sinusoid's reading sits half way from the portal tract to the central vein: along the middle generation's
  // course, or at the inner end of an outer one and the outer end of an inner one when only those are in view.
  // (A tube's spot never changes while the geometry stands, so it is worked out once and kept on the tube; read, never written.)
  const sinAt = (t) => t.sinAt || (t.sinAt = atInto(t.pts, t.lvl === 0 ? 0.95 : t.lvl === 2 ? 0.2 : 0.45, [0, 0]));   // alloc-rare: only the first time a tube's spot is asked for (kept on the tube)
  const anchorOf = (key) => {
    const g = live.geo, C = g.lobules[0].corners;
    if (key === 'triad') return C[pick.triad];
    if (key === 'cv') return g.cvAt || (g.cvAt = [g.cx, g.cy]);   // alloc-rare: only the first time for this geometry (kept on it; read, never written)
    if (key === 'lymph') return g.triads[pick.lt ?? pick.triad].lv.pts[0];
    if (key === 'ha' || key === 'bd') return g.triads[pick.triad][key];
    return sinAt(sinTube());
  };
  // How far out a point is, from the central vein (0) to the lobule's rim (1) along its ray.
  const rimFrac = ([x, y]) => {
    const g = live.geo, C = g.lobules[0].corners, dx = x - g.cx, dy = y - g.cy, d = Math.hypot(dx, dy) || 1e-9;
    let rim = Infinity;
    for (let i = 0; i < 6; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % 6], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const s = ((ax - g.cx) * ey - (ay - g.cy) * ex) / den, u = ((ax - g.cx) * dy - (ay - g.cy) * dx) / den;
      if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6) rim = Math.min(rim, s * d);
    }
    return d / rim;
  };
  const sinTube = () => {
    const g = live.geo;
    if (pick.geo !== g) {   // a new lobule (or size): back to the left side
      const ang = (t) => { const p = sinAt(t); return Math.abs(Math.atan2(p[1] - g.cy, p[0] - g.cx) - 2.75); };   // alloc-rare: only for a new lobule or size (pick.geo)
      pick.geo = g; pick.triad = 3; pick.sin = g.L1.reduce((b, t) => (ang(t) < ang(b) ? t : b), g.L1[0]).id;   // alloc-rare: only for a new lobule or size (pick.geo)
    }
    return g.tubes[pick.sin] || g.L1[0];
  };
  // Where the labels' vessels are picked: the free space and its middle (set by pickAnchors), and the best spot found so far.
  let paL = 0, paR = 0, paT = 0, paB = 0, paMx = 0, paMy = 0, bestC = null, bestS = Infinity;
  const paInside = (x, y, m) => { const sx = sX(x), sy = sY(y); return sx > paL + m && sx < paR - m && sy > paT + m && sy < paB - m; };
  const paSide = (x) => { const sx = sX(x); return Math.min(sx - paL, paR - sx) < 60; };
  // Scans candidates (the six corners, or a list of tubes by their spot), keeping the best in bestC: kept clear of up to two other
  // labelled spots (a, b), so the labels do not crowd each other. `list` null: the corners 0 to 5 of C.
  function bestScan(list, C, m, na, ax, ay, bx, by) {
    const n = list ? list.length : 6;
    for (let i = 0; i < n; i++) {
      const c = list ? list[i] : i, p = list ? sinAt(c) : C[c], px = p[0], py = p[1];
      if (!paInside(px, py, m)) continue;
      const x0 = sX(px), y0 = sY(py);
      let pen = 0;
      if (na > 0) pen = pen + Math.max(0, 110 - Math.hypot(sX(ax) - x0, sY(ay) - y0)) * 3;
      if (na > 1) pen = pen + Math.max(0, 110 - Math.hypot(sX(bx) - x0, sY(by) - y0)) * 3;
      const sc = Math.hypot(x0 - paMx, y0 - paMy) + pen;
      if (sc < bestS) { bestS = sc; bestC = c; }
    }
  }
  function pickAnchors(fr) {
    const g = live.geo, C = g.lobules[0].corners;
    sinTube();
    paL = fr.l; paR = fr.r; paT = fr.t; paB = fr.b; paMx = (fr.l + fr.r) / 2; paMy = (fr.t + fr.b) / 2;
    // Framed to fit, the default pick stays wherever its vessel is in view (a lobule that fills a phone's width has its corners at the edge).
    const keep = live.atFit ? 4 : 36;
    // (A triad hard against the screen's side leaves its label no room beside it, only a long leader: another in view takes it.)
    let need = !paInside(C[pick.triad][0], C[pick.triad][1], keep);
    if (!need && paSide(C[pick.triad][0])) for (let i = 0; i < 6; i++) if (paInside(C[i][0], C[i][1], 72) && !paSide(C[i][0])) { need = true; break; }
    if (need) { bestC = null; bestS = Infinity; bestScan(null, C, 72, 1, g.cx, g.cy, 0, 0); if (bestC != null) pick.triad = bestC; }
    // The sinusoid's reading points at the middle of a sinusoid: a middle-generation one (half way from the portal tract
    // to the central vein), the outer or inner generation only when none of those is in view.
    let sinNeed = !paInside(sinAt(sinTube())[0], sinAt(sinTube())[1], keep);
    if (!sinNeed && sinTube().lvl !== 1) { bestC = null; bestS = Infinity; bestScan(g.L1, C, 44, 0, 0, 0, 0, 0); sinNeed = !!bestC; }
    if (sinNeed) {
      const tx = C[pick.triad][0], ty = C[pick.triad][1];
      bestC = null; bestS = Infinity; bestScan(g.L1, C, 72, 2, g.cx, g.cy, tx, ty);
      if (!bestC) { bestS = Infinity; bestScan(g.L1, C, 44, 2, g.cx, g.cy, tx, ty); }
      if (!bestC) { bestS = Infinity; bestScan(g.L0, C, 72, 2, g.cx, g.cy, tx, ty); bestScan(g.L2, C, 72, 2, g.cx, g.cy, tx, ty); }
      if (bestC) pick.sin = bestC.id;
    }
  }
  const hitKind = (key) => (key === 'ha' || key === 'bd' ? { part: key, tri: pick.triad } : key === 'triad' ? { part: 'triad', tri: pick.triad } : key === 'cv' ? { part: 'cv' } : key === 'lymph' ? { part: 'lv', tri: pick.lt ?? pick.triad } : { part: 'sin', tube: sinTube().id });
  // A label whose part is the store's selection reads as Anatomy's selected name does (app.css .lz-lab.sel): the class is set between frames, and the GPU mirror reads it again.
  const labSel = () => {
    const sl = store.get().selection, on = sl?.type === 'lobule' && !!live.geo;
    for (const k in labs) {
      const L = labs[k]; if (!L.el) continue;
      let want = false;
      if (on) { try { const hv = hitKind(k); want = hv.part === sl.part && (hv.part === 'cv' || hv.part === 'sin' || hv.tri === sl.tri); } catch (e) { caught('lobule-zoom:labSel', e); } }
      if (classHas(L.el, 'sel') !== want) { classSoon(L.el, 'sel', want); mirrorSoon(L.el); }
    }
  };
  // The action card a selection opens (or closes) is read again, once it has come in or gone, so a name never stays under it (V-LBL-4).
  let selOccT = 0;
  const selOcc = () => { selOccT = 0; if (!live.occT) live.occT = restPass(onOcc); };
  store.on('selection', () => { labSel(); if (!live.occT) live.occT = restPass(onOcc); clearTimeout(selOccT); selOccT = setTimeout(selOcc, 450); });
  // What no label may cover, a disc on screen each: the central vein (1.25 of its radius: the vein and the mouths of its sinusoids) and
  // every portal tract (1.3 of its radius: the venule and the arc of arteriole, ductule and lymphatic beside it). They were 1.7 and
  // 2.4, which held every label 80 px off a tract on a Mac and forced the long leaders (Mohammad, 2 Nov 2026: "shorter callout lines").
  const CV_KEEP = 1.25, TRACT_KEEP = 1.3;
  const cvKeep = (g) => Math.max(14, g.rcv0 * CV_KEEP * V.k);
  // The discs no label may cover, on screen: kept as seven objects and written again in place (read where asked for, within one layout).
  const keepBuf = [{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }];
  const keepDiscs = (g) => {
    const C = g.lobules[0].corners;
    let d = keepBuf[0];
    d.x = sX(g.cx); d.y = sY(g.cy); d.r = Math.max(14, g.rcv0 * CV_KEEP * V.k);
    for (let i = 0; i < 6; i++) { d = keepBuf[i + 1]; d.x = sX(C[i][0]); d.y = sY(C[i][1]); d.r = Math.max(14, (g.rt || 6) * TRACT_KEEP * V.k); }
    return keepBuf;
  };
  const DESIGN = ['triad', 'lymph', 'cv', 'sin', 'ha', 'bd'];   // the labels with a designed spot (layoutLabels designed)
  const CORE = ['cv', 'sin', 'triad'];   // the vessel labels: never left out for the slide's pill
  // The ring on the spot: its centre and radius on screen (null while the spot is out of view), and how far from the ring's
  // centre everything else keeps (the radius, half its 4 px stroke and a small gap), so no label or pill ever touches it.
  const RING_STROKE = 4, RING_GAP = 8;
  // The lobule's outline on screen. Callout pills prefer to sit outside it, a leader reaching in to the structure: `share` is
  // how much of a box lies inside the outline (0 to 1), and `outside` lists spots just beyond the rim, on rays from a point
  // through the lobule, for a box of the given size. A frame too small to hold them clamps them back inside, where the
  // share costs the same for every spot, so the label falls back to the inside only when there is no room outside.
  // (The hexagon's six corners on screen, kept; share's answers kept by the box's whole numbers in a small table, cleared by hexOf; and
  // outside's spots written into hexOut, its count returned.)
  const hexX = new Float64Array(6), hexY = new Float64Array(6), hexOut = new Float64Array(48);
  const SH_CAP = 1024, SH_MASK = SH_CAP - 1, shKey = new Int32Array(SH_CAP * 4), shVal = new Float64Array(SH_CAP), shGen = new Uint32Array(SH_CAP);
  let shNow = 1, shN = 0;
  const hexIn = (x, y) => { let c = false; for (let i = 0, j = 5; i < 6; j = i++) { const xi = hexX[i], yi = hexY[i], xj = hexX[j], yj = hexY[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const hexShareOf = (b) => { let n = 0; for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) if (hexIn(b.l + ((b.r - b.l) * (i + 0.5)) / 5, b.t + ((b.b - b.t) * (k + 0.5)) / 3)) n++; return n / 15; };
  const hexShare = (b) => {
    const l = b.l | 0, t = b.t | 0, r = b.r | 0, bb = b.b | 0;
    let i = (Math.imul(l, 73856093) ^ Math.imul(t, 19349663) ^ Math.imul(r, 83492791) ^ Math.imul(bb, 1013904223)) & SH_MASK;
    while (shGen[i] === shNow) {
      const k = i * 4;
      if (shKey[k] === l && shKey[k + 1] === t && shKey[k + 2] === r && shKey[k + 3] === bb) return shVal[i];
      i = (i + 1) & SH_MASK;
    }
    const m = hexShareOf(b);
    if (shN < SH_CAP * 0.7) { const k = i * 4; shGen[i] = shNow; shKey[k] = l; shKey[k + 1] = t; shKey[k + 2] = r; shKey[k + 3] = bb; shVal[i] = m; shN++; }
    return m;
  };
  const hexOutside = (a, w, hh) => {
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
      let exit = 0;
      for (let e = 0; e < 6; e++) {
        const ax = hexX[e], ay = hexY[e], bx = hexX[(e + 1) % 6], by = hexY[(e + 1) % 6], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const sv = ((ax - a[0]) * ey - (ay - a[1]) * ex) / den, u = ((ax - a[0]) * dy - (ay - a[1]) * dx) / den;
        if (sv > 0 && u >= 0 && u <= 1) exit = Math.max(exit, sv);
      }
      if (!exit) continue;
      const d = exit + Math.min(w / 2 / Math.max(Math.abs(dx), 1e-6), hh / 2 / Math.max(Math.abs(dy), 1e-6)) + 14;
      hexOut[n++] = a[0] + dx * d; hexOut[n++] = a[1] + dy * d;
    }
    return n >> 1;
  };
  const hexObj = { share: hexShare, outside: hexOutside };
  const hexOf = () => {
    const C = live.geo.lobules[0].corners;
    for (let i = 0; i < 6; i++) { hexX[i] = sX(C[i][0]); hexY[i] = sY(C[i][1]); }
    shNow++; shN = 0;
    return hexObj;
  };
  const INSIDE_COST = 3000;   // a label wholly inside the lobule costs this much more than one wholly outside (far below any clash)
  const ringO = { a: [0, 0], rr: 0, clear: 0 };   // (callRingAt's answer, written again in place: read within one layout, never kept)
  const callRingAt = (fr) => {
    if (!live.call) return null;
    const q = anchorOf(live.call.at), ax = sX(q[0]), ay = sY(q[1]);
    if (!(ax > fr.l && ax < fr.r && ay > fr.t && ay < fr.b)) return null;
    const rr = Math.max(10, (live.call.at === 'triad' ? (live.geo.rt || 6) * 1.6 : (live.geo.rcv0 || 6) * 1.1) * V.k);
    ringO.a[0] = ax; ringO.a[1] = ay; ringO.rr = rr; ringO.clear = rr + RING_STROKE / 2 + RING_GAP;
    return ringO;
  };
  // How far a box reaches into the ring's clear zone (0 when it keeps out): the nearest point of the box to the centre.
  const ringDepth = (ring, b) => {
    if (!ring) return 0;
    const dx = Math.max(b.l - ring.a[0], 0, ring.a[0] - b.r), dy = Math.max(b.t - ring.a[1], 0, ring.a[1] - b.b);
    return Math.max(0, ring.clear - Math.hypot(dx, dy));
  };
  const CALL_RS = [70, 100, 140];
  const candBuf = new Float64Array(3 * 80);   // (the pill's candidate spots: x, y and whether it is the one it sat at last time; 61 at most)
  const candPQ = [0, 0], cBox = { l: 0, r: 0, t: 0, b: 0 };   // (a candidate's spot and box, handed to the checks)
  let callFitN = -1, callFitS = '';
  const boxOv = overlapLRTB;
  // (placeCall's answer, the pill's box and its leader's two ends, written into the record it is handed: the layout's own, kept and written
  // again each time, or a fresh one in the settled re-layout that still has a clash, where the first answer must outlive the second.)
  const mkCallOut = () => ({ box: { l: 0, r: 0, t: 0, b: 0 }, lead: [[0, 0], [0, 0]] });   // alloc-rare: once at setup (callOutMain), else only in the settled clash retry (coreFirst), never a frame of a hand's move
  const callOutMain = mkCallOut();
  const CALL_GAP = 7, CALL_PAD = [10, 10, 4, 5];   // (the leader's gap to the letters, px; the pill's left, right, top and bottom padding, app.css .lz-call)
  const callInk = { x0: 0, y0: 0, x1: 0, y1: 0, r: 0 };   // (the letters' box, grown by the gap: written again at each placement)
  function placeCall(fr, placed, cards, leads, crosses, ring, hex, keep, into, out) {
    if (!callEl.isConnected) { mount(labels, callEl); mount(leaders, callLine, callRing); }
    // (Not shown until its size is known for its words: placed at a guessed size, it slid sideways once measured, seconds in on a slow renderer.)
    const on = !!ring && callEl._lzSz?.txt === callEl.textContent;
    if (ring && !on) { measQ.add(callEl); if (!live.measT) live.measT = restPass(measureRun); }
    if (classHas(callEl, 'on') !== on) { for (let i = 0; i < 3; i++) classSoon(callParts[i], 'on', on); runSoon(leadPaint); }   // (the leader's look is read when it is drawn: drawn again once the class is in)
    if (!on) return null;
    const a = ring.a, rr = ring.rr;
    // (A phone on its side keeps the data card's whole column out of the free space, though the card stands at its top only: the
    // pill may also stand below that card, clear of it, the key and the nav pill by their cost as cards. Kept to the free space's
    // 80 px strip there, Sites 6 had no clear spot and set it on the nav pill.)
    let frR = fr.r;
    if (document.querySelector('.pz.low')) frR = Math.max(frR, live.geo.W - cssN('--right-occ') - 12);
    // Never wider than the free space: a long line wraps instead of running off the screen.
    const fitN = Math.max(120, Math.round(frR - fr.l - 20));
    if (fitN !== callFitN) { callFitN = fitN; callFitS = `${fitN}px`; }   // alloc-rare: only when the free space's width changes
    // (Its room is written between frames, a rest pass, and the pill measured again there: never in the frame that lays it out.)
    if (callFitS !== callFit) { callFit = callFitS; if (!callFitT) callFitT = restPass(writeCallFit); }
    sizeOf(callEl, 120, 28);
    const w = szW, hh = szH, pad = 10;
    // Where it sat last time (relative to the spot) is tried too and kept while it is still as good: a value easing or a
    // label that moved a pixel never flips the pill to another side, and the leader with it.
    let nc = 0;
    for (let ri = 0; ri < 3; ri++) {
      const r0 = CALL_RS[ri];
      for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2 - Math.PI / 2, r = Math.max(r0, ring.clear + hh / 2 + 8 + r0 - 70); candBuf[nc++] = a[0] + Math.cos(t) * (r + w / 3); candBuf[nc++] = a[1] + Math.sin(t) * r; candBuf[nc++] = 0; }
    }
    const nOut = hex.outside(a, w, hh);
    for (let i = 0; i < nOut; i++) { candBuf[nc++] = hexOut[2 * i]; candBuf[nc++] = hexOut[2 * i + 1]; candBuf[nc++] = 0; }
    if (live.cpOn && live.cpAt === live.call.at) { candBuf[nc++] = a[0] + live.cpDx; candBuf[nc++] = a[1] + live.cpDy; candBuf[nc++] = 1; }
    let have = false, bx = 0, by = 0, bcost = 0, bl = 0, br = 0, bt = 0, bb = 0;
    for (let ci = 0; ci < nc; ci += 3) {
      const px = candBuf[ci], py = candBuf[ci + 1], prev = candBuf[ci + 2];
      const x = clamp(px, fr.l + w / 2 + pad, frR - w / 2 - pad), y = clamp(py, fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
      cBox.l = x - w / 2 - 6; cBox.r = x + w / 2 + 6; cBox.t = y - hh / 2 - 6; cBox.b = y + hh / 2 + 6;
      candPQ[0] = x; candPQ[1] = y;
      // (The same sum, in the same order, as it was when each part was a reduce.)
      let c1 = 0; for (let i = 0; i < placed.length; i++) { const o = placed[i], v = boxOv(cBox, o); c1 = c1 + (v > 0 ? 1e6 + v * 100 : 0) + (crosses(a, candPQ, o) ? 1e5 : 0); }
      let c2 = 0; for (let i = 0; i < leads.length; i++) c2 = c2 + (crosses(leads[i][0], leads[i][1], cBox) ? 1e6 : 0);
      const rd0 = ringDepth(ring, cBox);
      let c3 = 0; for (let i = 0; i < keep.length; i++) { const d = into(keep[i], cBox); c3 = c3 + (d > 0 ? 1e6 + d * 1e3 : 0); }
      let c4 = 0; for (let i = 0; i < cards.length; i++) { const o = cards[i], v = boxOv(cBox, o); c4 = c4 + (v > 0 ? 1e6 + v * 400 : 0); }
      const cost = c1 + c2 + (rd0 > 0 ? 1e6 + rd0 * 1e4 : 0) + c3 + hex.share(cBox) * INSIDE_COST + c4 + Math.hypot(x - a[0], y - a[1]) * 0.5 + Math.max(0, Math.hypot(x - a[0], y - a[1]) - w / 2 - 110) * 30 - (prev ? 60 : 0);
      if (!have || cost < bcost) { have = true; bx = x; by = y; bcost = cost; bl = cBox.l; br = cBox.r; bt = cBox.t; bb = cBox.b; }
    }
    const ob = out.box;
    ob.l = bl; ob.r = br; ob.t = bt; ob.b = bb; placed.push(ob);
    live.cpOn = true; live.cpAt = live.call.at; live.cpDx = bx - a[0]; live.cpDy = by - a[1]; live.callCost = bcost;   // (where it sat, kept as numbers: callState saves and puts them back)
    put(callEl, bx - w / 2, by - hh / 2);
    // The leader starts on the ring's edge (not at its centre) and runs to the pill.
    const dl = Math.hypot(bx - a[0], by - a[1]) || 1, e0 = rr / dl;
    // The leader stops CALL_GAP short of the word's letters (the pill's padding is not letters), on the side facing the ring, so the line never
    // runs in under the outlined text ("Resistance sits above the callout line", 8 Nov 2026). It never stops inside the ring.
    const ink = callInk, gap = CALL_GAP;
    ink.x0 = bx - w / 2 + CALL_PAD[0] - gap; ink.x1 = bx + w / 2 - CALL_PAD[1] + gap; ink.y0 = by - hh / 2 + CALL_PAD[2] - gap; ink.y1 = by + hh / 2 - CALL_PAD[3] + gap;
    const le = leaderEnd(ink, a[0], a[1]);
    let ex = bx, ey = by;
    if (le) { const k = Math.max(Math.hypot(le.x - a[0], le.y - a[1]), rr) / dl; ex = a[0] + (bx - a[0]) * k; ey = a[1] + (by - a[1]) * k; }
    setGeo(callLine, 'x1', a[0] + (bx - a[0]) * e0); setGeo(callLine, 'y1', a[1] + (by - a[1]) * e0); setGeo(callLine, 'x2', ex); setGeo(callLine, 'y2', ey);
    setGeo(callRing, 'cx', a[0]); setGeo(callRing, 'cy', a[1]); setGeo(callRing, 'r', rr);
    leadGL.paint();
    const ld = out.lead;
    ld[0][0] = a[0] + (bx - a[0]) * e0; ld[0][1] = a[1] + (by - a[1]) * e0; ld[1][0] = ex; ld[1][1] = ey;
    return ld;
  }
  // Zone names written in the bands themselves, as the organs are named on the anatomy: quiet capitals in each
  // zone's color, on the radius to the flat bottom edge, so each name runs along its band. The three elements are made
  // once and only moved: re-making them at every layout (a value easing, a glide) restarted their lit pill each time,
  // which showed as a flash. Returns each name's box on screen (its pill included), for the other labels to keep clear of.
  const zoneEls = [];   // (made once, kept for good: see placeZones; a layer's names are faded out and in, never dropped)
  // ── The lobule's layers (store.lobuleLayers): LAYERS names them, live.<name>On is each switch, LAB_LAYER the station labels that belong to one. A name of a
  // layer that is off is faded out (placeZones, labelLayerOff) and faded in with it; a new layer is a line in each, and the layout starts over when it switches (sameBase). ──
  const LAYERS = ['zones', 'lymph', 'bile'];
  const LAB_LAYER = { lymph: 'lymph' };   // (a station label: the layer it belongs to; the others are always there)
  const layerOn = (name) => !!live[name + 'On'];
  const labelLayerOff = (k) => { const n = LAB_LAYER[k]; return !!n && !layerOn(n); };
  // A label or zone name that goes fades out where it stands (app.css .lz-off, as the anatomy's labels do) and is hidden, taking no
  // room and no taps, only once the fade is over; one that comes back fades in (app.css lz-in) or, caught mid-fade, turns back from
  // where it is. Its leader and dot fade with it (.ld-gone). They used to cut out and pop in (P15).
  const OFF_MS = D_SMALL;
  function offEnd(el, done) { el._lzOff = 0; setHid(el, true); classSoon(el, 'lz-off', false); classSoon(el, 'edge', false); done?.(); }
  const offFire = (el, done) => { if (classHas(el, 'lz-off')) offEnd(el, done); };
  function fadeOut(el, done) {
    if (isHid(el)) { done?.(); return; }
    if (classHas(el, 'lz-off')) return;
    if (reduce.matches) { offEnd(el, done); return; }
    classSoon(el, 'lz-off', true);
    clearTimeout(el._lzOff); el._lzOff = setTimeout(offFire, OFF_MS, el, done);
  }
  function fadeIn(el) { clearTimeout(el._lzOff); el._lzOff = 0; classSoon(el, 'lz-off', false); setHid(el, false); }
  const gone = (el) => isHid(el) || classHas(el, 'lz-off');
  const leadOff = (L) => { L.hadLead = false; classSoon(L.line, 'ld-gone', true); classSoon(L.dotEl, 'ld-gone', true); };
  const leadOn = (L) => { classSoon(L.line, 'ld-gone', false); classSoon(L.dotEl, 'ld-gone', false); };
  const ZONE_TPL = [['Zone 1', 'periportal'], ['Zone 2', 'midzonal'], ['Zone 3', 'centrilobular']].map(([t, d], i) => {
    const z = h('div', { class: 'lz-zone z' + (i + 1), 'aria-hidden': 'true', 'data-target': `lobule:zone${i + 1}` }, h('b', {}, t), h('span', {}, d));
    z.style.setProperty('--zk', '1');
    return z;
  });
  const NO_BOXES = [];   // (read, never written: no zone names on show)
  const ZONE_Q = [0.83, 0.51, 0.2];
  const zSx = new Float64Array(12), zSy = new Float64Array(12), zTx = new Float64Array(13), zTy = new Float64Array(13), zTd = new Float64Array(13);
  const zBox = { l: 0, r: 0, t: 0, b: 0 };
  const zoneBoxesBuf = [], zoneBoxPool = [{ l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }];   // (placeZones' answer: the boxes of the names on show, kept and written again)
  function placeZones(fr0, hx, hy, lesion = null) {
    // Zones off: each name fades out where it stands and stays in zoneEls (capSync draws from it: a name taken out stayed drawn at its last alpha).
    if (!layerOn('zones')) { for (let i = 0; i < zoneEls.length; i++) fadeOut(zoneEls[i]); return NO_BOXES; }
    const { R, cx, cy } = live.geo, a = Math.PI / 2, ap = R * 0.866, boxes = zoneBoxesBuf;
    boxes.length = 0;
    const midx = (fr0.l + fr0.r) / 2, midy = (fr0.t + fr0.b) / 2;
    for (let i = 0; i < 3; i++) {
      const q = ZONE_Q[i];
      let z = zoneEls[i];
      if (!z) z = zoneEls[i] = ZONE_TPL[i].cloneNode(true);   // (cloned from its model, made with the view: a frame builds nothing)   // alloc-rare: only the first layout with the Zones layer on
      if (!z.isConnected) mount(labels, z);
      // Its usual spot (on the radius to the flat bottom edge); if that is out of view, the nearest in-view spot
      // of the same zone (the same ring, at the other five sides and corners), else clamped to the free edge.
      for (let k = 0; k < 6; k++) {
        const th = a + k * Math.PI / 3;
        zSx[2 * k] = sX(cx + Math.cos(th) * ap * q); zSy[2 * k] = sY(cy + Math.sin(th) * ap * q);
        zSx[2 * k + 1] = sX(cx + Math.cos(th + Math.PI / 6) * R * q * 0.95); zSy[2 * k + 1] = sY(cy + Math.sin(th + Math.PI / 6) * R * q * 0.95);
      }
      let nT = 0;
      if (zInV(fr0, zSx[0], zSy[0])) { zTx[0] = zSx[0]; zTy[0] = zSy[0]; nT = 1; }
      const base = nT;
      for (let k = 1; k < 12; k++) {
        if (!zInV(fr0, zSx[k], zSy[k])) continue;
        const d = Math.hypot(zSx[k] - midx, zSy[k] - midy);
        let j = nT;
        while (j > base && zTd[j - 1] > d) { zTx[j] = zTx[j - 1]; zTy[j] = zTy[j - 1]; zTd[j] = zTd[j - 1]; j--; }
        zTx[j] = zSx[k]; zTy[j] = zSy[k]; zTd[j] = d; nT++;
      }
      if (!nT) { zTx[0] = clamp(zSx[0], fr0.l + 40, fr0.r - 40); zTy[0] = clamp(zSy[0], fr0.t + 20, fr0.b - 20); nT = 1; }
      put(z, zTx[0], zTy[0]);
      sizeOf(z, 92, 36);
      const w = szW, hh = szH;
      // A zone's name never sits on the slide's lesion ring (the ring is what the slide points at): it takes another
      // spot on its band, or leaves the view for that slide.
      let at = -1;
      for (let j = 0; j < nT; j++) { zBox.l = zTx[j] - w / 2 - hx; zBox.r = zTx[j] + w / 2 + hx; zBox.t = zTy[j] - hh / 2 - hy; zBox.b = zTy[j] + hh / 2 + hy; if (!ringDepth(lesion, zBox)) { at = j; break; } }
      if (at < 0) { fadeOut(z); continue; }
      fadeIn(z);
      put(z, zTx[at], zTy[at]);
      { const zb = zoneBoxPool[i]; zb.l = zTx[at] - w / 2 - hx; zb.r = zTx[at] + w / 2 + hx; zb.t = zTy[at] - hh / 2 - hy; zb.b = zTy[at] + hh / 2 + hy; boxes.push(zb); }   // (the layout keeps these boxes, one a zone, written again each layout: placed holds them only until the next layout)
    }
    return boxes;
  }
  const zInV = (fr0, x, y) => x > fr0.l + 40 && x < fr0.r - 40 && y > fr0.t + 20 && y < fr0.b - 20;
  // The layout the labels were last placed for (everything but the view, and the view: k, x, y), which a pan carries them from.
  // (Two kept records, taken in turn: a layout writes the one not standing in place while the other still stands, so a layout that has to
  // wait for the labels to be measured can put the standing one back. Their inputs are compared as numbers, in place: a key string built
  // from them on every frame was garbage, 2 Nov 2026.)
  const mkFollow = () => ({ W: 0, H: 0, ly: LAYERS.map(() => false), ha: false, bd: false, hasCall: false, callAt: '', callLabel: '', lks: ['', '', '', '', '', ''],
    t: 0, b: 0, l: 0, r: 0, k: 0, x: 0, y: 0, ride: null,
    rideBuf: { labs: [], chips: [], zones: [], nl: 0, nc: 0, nz: 0, cards: null, ix: 0, iy: 0 } });
  const follows = [mkFollow(), mkFollow()];
  // The labels in the order they were made (the panel's), and in the order a layout takes them.
  const LAB_KEYS = ['triad', 'sin', 'cv', 'lymph', 'ha', 'bd'], LAY_ORDER = ['cv', 'sin', 'triad', 'lymph', 'ha', 'bd'];
  const LAB_TARGET = {};   // (the slide's name for each label, built once)
  for (const k of LAY_ORDER) LAB_TARGET[k] = `lobule:${LZ_TARGET[k] || k}`;
  // Whether the layout's inputs but the view are those record f was taken for: the labels' make-up, the zone and lymph switches, the
  // slide's pointer and the free space.
  function sameBase(f, fr0, g) {
    if (f.W !== g.W || f.H !== g.H || f.ha !== named('ha') || f.bd !== named('bd')) return false;
    for (let i = 0; i < LAYERS.length; i++) if (f.ly[i] !== layerOn(LAYERS[i])) return false;
    if (f.hasCall !== !!live.call || (live.call && (f.callAt !== live.call.at || f.callLabel !== live.call.label))) return false;
    if (f.t !== fr0.t || f.b !== fr0.b || f.l !== fr0.l || f.r !== fr0.r) return false;
    for (let i = 0; i < LAB_KEYS.length; i++) if (f.lks[i] !== labs[LAB_KEYS[i]].lk) return false;
    return true;
  }
  function fillBase(f, fr0, g) {
    f.W = g.W; f.H = g.H; f.ha = named('ha'); f.bd = named('bd');
    for (let i = 0; i < LAYERS.length; i++) f.ly[i] = layerOn(LAYERS[i]);
    f.hasCall = !!live.call; f.callAt = live.call ? live.call.at : ''; f.callLabel = live.call ? live.call.label : '';
    f.t = fr0.t; f.b = fr0.b; f.l = fr0.l; f.r = fr0.r;
    for (let i = 0; i < LAB_KEYS.length; i++) f.lks[i] = labs[LAB_KEYS[i]].lk;
  }
  // (A wheel or a trackpad's pinch is a hand too, as a scroll is: each of them changed the zoom on every frame and laid the labels out in
  // full there, and redrew the lobule's bitmap at each √2 step, which is what made zooming the lobule on a Mac lag.)
  const handOn = () => touches.size > 0 || !!live.cancelFlick || (!!live.wheelKind && !wheelQuiet(250));
  // The hand let go (or paused): place the labels again for where the view now is.
  function followEnd() { if (handOn()) { live.followT = setTimeout(followEnd, 140); return; } if (live.panOn || live.rough || live.rides) { live.rough = false; live.layoutKey = ''; viewChanged(); } }
  // Whether the labels as laid out (follow.ride), each carried with its spot to the view now, still keep the layout's rules: no label on
  // another, a zone's name or a chip, none on another's leader, no two leaders crossed, none on a structure (which grows as the view
  // zooms in) or a card, each inside the free space and what it names still in it, and no chip's spot come back into view.
  // The glide's ride: each piece moved by its own spot's move since the last layout (a CSS translate, written into its place by bakeFollow).
  // Every label, zone name and pill stands where `translate` puts it (laid out once at the box's corner, so a move or glide is the
  // compositor's, never a layout per frame); its spot is kept here, and a pan's ride adds its shift on top.
  const spot = new WeakMap();
  // (Where each piece is drawn: the GPU's names take it in this frame; the page's clear model is placed between frames, domFlush.)
  const seenPos = new Map(), domQ = new Set();
  let domT = 0;
  const tr = (e, x, y) => {
    let q = seenPos.get(e);
    if (!q) seenPos.set(e, q = [0, 0]);   // alloc-rare: once a piece
    q[0] = x; q[1] = y; domQ.add(e);
    if (!domT) domT = restPass(domFlush);
    cap.paint();
  };
  // A piece whose place is taken away (the pill with no spot): its translate is cleared between frames too.
  const clrQ = new Set();
  const trClear = (e) => { domQ.delete(e); clrQ.add(e); if (!domT) domT = restPass(domFlush); };
  function domFlush() {
    domT = 0;
    if (live.rides) return;   // (a hand's ride: placed once it is baked, bakeRides)
    for (const e of clrQ) if (e.style.translate) e.style.translate = '';
    clrQ.clear();
    for (const e of domQ) { const p = seenPos.get(e); if (p) e.style.translate = `${p[0].toFixed(2)}px ${p[1].toFixed(2)}px`; }
    domQ.clear();
  }
  // ── The names on the GPU ──
  // Each one's words as the page set them, read between frames when they, their classes or their looks change (mirrorRun), and kept.
  const mirKeep = new WeakMap(), mirQ = new Set();
  let mirT = 0;
  // (The names, listed once and again only when a zone name is made: a frame makes no list.)
  let capList = null, capZones = -1;
  const capItems = () => {
    if (capList && capZones === zoneEls.length) return capList;
    capZones = zoneEls.length;   // alloc-rare: only when a zone name is first made
    return (capList = [...Object.entries(labs).map(([k, L]) => [`lab:${k}`, L.el, L]), ...zoneEls.map((z, i) => [`zone:${i}`, z, null]), ['call', callEl, null]]);
  };
  function mirrorSoon(...els) { if (!cap.on) return; for (const e of els) if (e) mirQ.add(e); if (!mirT) mirT = restPass(mirrorRun); }
  const mirrorAll = () => {
    if (!cap.on) return;
    for (const k in labs) { const e = labs[k].el; if (e) mirQ.add(e); }
    for (let i = 0; i < zoneEls.length; i++) if (zoneEls[i]) mirQ.add(zoneEls[i]);
    if (callEl) mirQ.add(callEl);
    if (!mirT) mirT = restPass(mirrorRun);
  };
  // The names are read in the layer's own px: not while the dive or the sinusoid zoom scales it (a name read at scale 28 was drawn 28 times too big for good,
  // the sin, cv and triad names gone after a Sinusoid visit). The queue waits and is read once the layer is straight (mirrorRelease).
  let mirHeld = false, measHeld = false;   // (a read, and a measuring, that waited for the layer to stand straight)
  const mirrorRelease = () => { if (live.layerScaled) return; if (measHeld) { measHeld = false; if (!live.measT) live.measT = restPass(measureRun); } if (mirHeld) { mirHeld = false; mirrorAll(); } };
  function mirrorRun() {
    mirT = 0;
    if (live.layerScaled) { mirHeld = true; return; }
    flushRestAttrs();   // (shown or hidden, as the frame asked: written before the page is read)
    for (const [key, e] of capItems()) {
      if (!mirQ.has(e) || !e.isConnected || e.hidden) continue;
      const m = mirrorOf(e, ['.n']);
      if (m) { mirKeep.set(e, m); cap.mirror(key, m); }
      // (A label's arrow at the screen's edge is in its secondary ink, app.css .lz-lab.edge .n::before: read whether or not it waits there now.)
      const L = labs[key.slice(4)];
      if (L && key.startsWith('lab:')) L.arrowC = capRGBA(readStyle(e).getPropertyValue('--text-2').trim());
    }
    mirQ.clear();
    cap.paint();
  }
  // A label a slide's words leave unlit fades out (app.css, the presenting app's data-lit): the same test, on the lit terms kept.
  const DIM_A = 0.35;   // (an unlit name's alpha on a slide that lights terms: Mohammad's pick 14.3 B)
  // (The leaders in this layer fade with their names: a class on each, as the sheet's presenting-and-lit rule set their strength, read again by the picture.)
  const syncDim = () => { for (const k in labs) { const L = labs[k]; if (!L.line) continue; const d = dimmed(L.el.dataset.target); classSoon(L.line, 'lz-dim', d); classSoon(L.dotEl, 'lz-dim', d); } };
  const dimmed = (t) => {
    const lit = litOf();
    if (!live.litRaw || !/(^| )(lobule|sinusoid):/.test(live.litRaw) || !live.appEl?.classList.contains('presenting')) return false;
    return !(LIT_OK.includes(t) && lit.has(t));
  };
  // Every name's place and show for this frame, drawn in it: a label gliding to its new spot on the page's curve (easeLab), one riding
  // a pan at its spot's shift (tr), a zone name at its centre, the call pill easing in from a little smaller.
  const LEADO = { x1: 0, y1: 0, x2: 0, y2: 0, show: 1, colour: 'rgba(150, 150, 150, .5)', cut: false, of: null, follow: false, sg: 0 };   // (one record, rewritten for each lead)   // colour-exempt: the leaders' neutral grey, set per leader by the layout
  function capSync(t) {
    if (live.fade <= 0) return false;
    const now = tlNow();   // (the page's clock, which the labels' glides are noted on; t: the names' own, for their fades)
    let moving = false;
    for (const [key, e, L] of capItems()) {
      const m = mirKeep.get(e);
      let p = seenPos.get(e);
      if (!m || !p) continue;
      let x = p[0], y = p[1];
      if (L && labGliding(L, now)) { const g = L.gl, k = easeLab(g, now); x = g.x0 + (g.x1 - g.x0) * k; y = g.y0 + (g.y1 - g.y0) * k; moving = true; }
      const call = e === callEl, zone = !L && !call;
      const off = !e.isConnected || gone(e) || (call && !classHas(callEl, 'on'));
      cap.place(key, zone ? x : x + m.w / 2, zone ? y : y + m.h / 2, off ? 0 : !call && dimmed(e.dataset.target) ? DIM_A : 1, off && gone(e) ? D_SMALL : D_SURFACE, call ? (off ? 0.94 : 1) : -1, t);
      if (L) {
        // The station's leader and dot, drawn with its name by label-gl (the lead's near end is the name's, its far end the figure's point).
        const hid = off || classHas(L.line, 'ld-gone') || classHas(L.line, 'lz-hid') || classHas(L.el, 'edge');
        LEADO.x1 = +geoOf(L.line, 'x2'); LEADO.y1 = +geoOf(L.line, 'y2'); LEADO.x2 = +geoOf(L.line, 'x1'); LEADO.y2 = +geoOf(L.line, 'y1');
        LEADO.show = hid ? 0 : dimmed(e.dataset.target) ? DIM_A : 1;
        if (Number.isFinite(LEADO.x1 + LEADO.y1 + LEADO.x2 + LEADO.y2)) cap.lead(key, LEADO);
        const ink = L.arrowC || m.at['.n']?.colour || '';
        cap.arrow(key, L.edgeA != null && classHas(L.el, 'edge') ? (L.arrow?.ang === L.edgeA && L.arrow.r === L.edgeR && L.arrow.w === m.w && L.arrow.colour === ink ? L.arrow
          : (L.arrow = { x: m.w / 2, y: m.h / 2, ang: L.edgeA, r: L.edgeR, w: m.w, colour: ink })) : null);   // alloc-rare: only when the arrow turns
      }
    }
    return moving;
  }
  cap.onFrame = capSync;
  cap.onRest = () => { if (domQ.size && !domT) domT = restPass(domFlush); };
  // (A hover or focus changes a name's ink; a slide's lit terms, the theme and the text size its look: read again.)
  labels.addEventListener('pointerover', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  labels.addEventListener('pointerout', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  labels.addEventListener('focusin', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  labels.addEventListener('focusout', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  if (typeof MutationObserver === 'function') new MutationObserver(() => mirrorAll()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  darkMQ.addEventListener?.('change', () => mirrorAll());
  function put(e, x, y) {
    const p = spot.get(e);
    if (p) { p[0] = x; p[1] = y; } else spot.set(e, [x, y]);   // alloc-once: the first spot an element is given; after it the pair is written in place
    tr(e, x, y);
  }
  // The pieces of a ride, kept and written in place (grown by index, once, to the most pieces there are).
  const rideList = [];
  function rideAdd(ax, ay) {
    const r = rideList[live.rideN] || (rideList[live.rideN] = { a: [0, 0], d: [0, 0], els: [null, null, null], ne: 0, b: new Float64Array(18) });   // alloc-once: a piece is made the first time a ride needs that many, then reused
    live.rideN++; r.a[0] = ax; r.a[1] = ay; r.ne = 0;
    return r;
  }
  // A leader's, dot's or ring's geometry as the ride began (x1, x2, cx, y1, y2, cy; NaN where the piece has none): each frame of the ride draws it
  // carried by the piece's own shift, the way its label is, and the bake lands there.
  const RIDE_ATT = ['x1', 'x2', 'cx', 'y1', 'y2', 'cy'];
  function rideBase(r) {
    for (let j = 0; j < r.ne; j++) {
      const e = r.els[j], own = spot.get(e);
      for (let k = 0; k < 6; k++) { const o = own ? null : geoOf(e, RIDE_ATT[k]); r.b[j * 6 + k] = o != null && o !== '' ? +o : NaN; }
    }
  }
  function ride() {
    const f = live.follow;
    if (!live.rides) {
      // (the pan carries them by the same translate a layout glides: no glide may run under it, or they would trail the hand)
      freezeLabelGlides();
      live.rides = rideList; live.rideN = 0;
      for (let i = 0; i < LAB_KEYS.length; i++) {
        const L = labs[LAB_KEYS[i]];
        if (L.a && !isHid(L.el) && !classHas(L.el, 'edge')) { const r = rideAdd(L.a[0], L.a[1]); r.els[0] = L.el; r.els[1] = L.line; r.els[2] = L.dotEl; r.ne = 3; }
      }
      for (let i = 0; i < zoneEls.length; i++) {
        const z = zoneEls[i], s = z.isConnected && !gone(z) && spot.get(z);
        if (s) { const r = rideAdd(s[0], s[1]); r.els[0] = z; r.ne = 1; }
      }
      if (classHas(callRing, 'on')) { const r = rideAdd(+geoOf(callRing, 'cx'), +geoOf(callRing, 'cy')); r.els[0] = callEl; r.els[1] = callLine; r.els[2] = callRing; r.ne = 3; }
      for (let i = 0; i < live.rideN; i++) rideBase(rideList[i]);
    }
    for (let i = 0; i < live.rideN; i++) {
      const r = rideList[i], a0 = r.a[0], a1 = r.a[1], d0 = (a0 - f.x) / f.k * V.k + V.x - a0, d1 = (a1 - f.y) / f.k * V.k + V.y - a1;
      r.d[0] = d0; r.d[1] = d1;
      for (let j = 0; j < r.ne; j++) {
        const e = r.els[j], p = spot.get(e);
        if (p) tr(e, p[0] + d0, p[1] + d1);
        else {
          // (A leader, its dot or the ring has no spot: the GPU draws it from its geometry, set to where the ride began plus the shift.)
          for (let k = 0; k < 6; k++) { const b = r.b[j * 6 + k]; if (b === b) setGeo(e, RIDE_ATT[k], b + (k < 3 ? d0 : d1)); }
        }
      }
    }
    leadGL.paint();
  }
  // A model piece's ends and centre carried by the pan's shift (held on the piece, never written as attributes).
  const shiftAttr = (e, a, v) => { const o = geoOf(e, a); if (o != null && o !== '') setGeo(e, a, +o + v); };
  function shiftGeo(e, dx, dy) {
    shiftAttr(e, 'x1', dx); shiftAttr(e, 'x2', dx); shiftAttr(e, 'cx', dx); shiftAttr(e, 'y1', dy); shiftAttr(e, 'y2', dy); shiftAttr(e, 'cy', dy);
    leadGL.paint();
  }
  const unglide = () => { for (let i = 0; i < LAB_KEYS.length; i++) labs[LAB_KEYS[i]].gl = null; };
  // A hand can take over before the last layout's glide lands. Carry the position actually on screen; capSync must not overwrite
  // the ride with that old glide's positions. Leaders already use seenAt on the same clock.
  function freezeLabelGlides() {
    const now = tlNow();
    for (let i = 0; i < LAB_KEYS.length; i++) {
      const L = labs[LAB_KEYS[i]];
      if (L.gl && spot.has(L.el)) { const p = seenAt(L, now); put(L.el, p[0], p[1]); }
      L.gl = null;
    }
  }
  return { CORE, DESIGN, LAB_KEYS, LAY_ORDER, LIT_OF, anchorOf, callOutMain, callRingAt, cvKeep, explainSet, fadeIn, fadeOut, fillBase, followEnd, follows, freezeLabelGlides, gone, handOn, hexOf, hitKind, isHid, keepDiscs, labGliding, labKey, labWH, labelLayerOff, labs, leadOff, leadOn, measQ, measureRun, measureShown, mirrorAll, mirrorRelease, mkCallOut, named, noteAt, panel, pick, pickAnchors, placeCall, placeZones, put, ride, rideList, rimFrac, ringDepth, sameBase, seenAt, setHid, shiftGeo, sinAt, sinTube, sizeEnv, spot, syncDim, tlNow, trClear, unglide };
}
