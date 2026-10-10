// Presenter: projector-first presentations on the live model (decks.js), the instructor's own scripts
// and "Present a case".
//
// A slide is one idea: a big headline, one line, a few causes, and a figure that explains it. Every
// slide's model state is computed off screen first (a second engine in its own worker, worker-core.js
// 'sequence'), each from the slide before, so the live figure only ever shows finished states and
// forward, back and jump always agree. Between slides the words fade over; a change of patient fades the
// figure out and back in; then the camera travels: to a region of the plate, or down into the lobule and
// on to a portal tract, the sinusoids or a central vein. The pressure ladder and the tiles count to their
// new values.
//
// Keys (clickers send the same): → Page Down Space Enter next, ← Page Up back, a number then Enter
// jumps, Home End, B or . black screen, F full screen, N notes, S speaker window, Q quiz, L laser, Esc.

import { store, replaceParams } from './store.js?v=49dc9cdf15';
import { h, toast, svgIcon, icon, fmt, clamp } from './util.js?v=e803df99cd';
import { download } from './records.js?v=50fb9dd463';
import { SITES } from './ladder.js?v=d0e8d913b4';
import { sinusoidSupported } from './sinusoid-view.js?v=d7288ad11f';
import { DECKS, REGIONS, LEVELS } from './decks.js?v=a7280daed7';

const KEY = 'pps.scripts';
const readMine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
// Old links and bookmarks: the self-running tour became the Sites presentation.
const ALIAS = { 'where-block': 'sites' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
/** Poll (not frames: a hidden tab runs none) until fn() holds or ms pass. */
async function until(fn, ms = 3000) { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await wait(40); }
const LOBULE_CAM = /^(lobule|sinusoid)/;

// ── Numbers ────────────────────────────────────────
const RUNGS = [['pv', 'Portal', 'vein'], ['whvp', 'Wedged', 'WHVP'], ['fhvp', 'Free HV', 'FHVP'], ['ra', 'Right', 'atrium']];
const NO_ASC = 200;   // mL: below it there is no ascites to tap
const RATE = {
  hvpg: (v) => (v >= 10 ? ['hi', 'Clinically significant'] : v >= 5 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  ppg: (v) => (v >= 12 ? ['hi', 'High'] : v >= 6 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  saag: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 1.1 ? ['hi', 'Portal hypertension'] : ['ok', 'Not portal']),
  tp: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 2.5 ? ['hi', 'High'] : ['lo', 'Low']),
};
const TILE = { hvpg: ['HVPG', 'Wedged − free', 'mmHg'], ppg: ['PPG', 'Portal − IVC', 'mmHg'], saag: ['SAAG', 'Serum − ascites albumin', 'g/dL'], tp: ['Ascites protein', 'Total protein', 'g/dL'] };
const rateOf = (k, f) => (RATE[k] && f ? RATE[k](f[k], f) : [null, '']);

// A value counts from where it was to where it goes (eased, about a second); reduced motion jumps.
function tweener(draw) {
  let cur = null, raf = 0;
  return (to, ms = 950) => {
    cancelAnimationFrame(raf);
    if (!cur || reduce.matches) { cur = { ...to }; draw(cur); return; }
    const from = { ...cur }, t0 = performance.now();
    const step = (now) => {
      const u = ease(clamp((now - t0) / ms, 0, 1));
      for (const k of Object.keys(to)) cur[k] = from[k] == null || to[k] == null ? to[k] : from[k] + (to[k] - from[k]) * u;
      draw(cur);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
let uid = 0;

/** The pressure ladder at projector size: four stations, the healthy line dashed behind, every fall of
 *  more than 4 mmHg shaded as a block. set(f, { key }) glides the line and counts the numbers. */
function bigLadder() {
  const W = 460, H = 312, X = (i) => 78 + i * 112, Y = (v) => 252 - clamp(v, 0, 30) * 6.6;
  const gid = 'pzGrad' + ++uid;
  const base = sv('path', { class: 'pzl-base' });
  const line = sv('path', { class: 'pzl-line', stroke: `url(#${gid})` });
  const bands = [0, 1, 2].map((i) => {
    const r = sv('rect', { x: X(i) + 16, y: Y(30) - 6, width: 112 - 32, height: Y(0) - Y(30) + 6, rx: 12 });
    const t = sv('text', { x: (X(i) + X(i + 1)) / 2, y: 26, 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzl-drop', opacity: 0 }, r, t), t };
  });
  const pts = RUNGS.map(([, a, b], i) => {
    const c = sv('circle', { cx: X(i), r: 8.5 }), v = sv('text', { class: 'pzl-v', x: X(i), 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzl-pt' }, c, v, sv('text', { class: 'pzl-k', x: X(i), y: H - 34, 'text-anchor': 'middle' }, a), sv('text', { class: 'pzl-k2', x: X(i), y: H - 10, 'text-anchor': 'middle' }, b)), c, v };
  });
  const el = sv('svg', { class: 'pz-ladder', viewBox: `0 0 ${W} ${H}`, role: 'img' },
    sv('defs', {}, sv('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), sv('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }))),
    [0, 10, 20, 30].map((v) => sv('g', { class: 'pzl-grid' }, sv('line', { x1: 44, x2: W - 10, y1: Y(v), y2: Y(v) }), sv('text', { x: 34, y: Y(v) + 5, 'text-anchor': 'end' }, String(v)))),
    bands.map((b) => b.g), base, line, pts.map((p) => p.g));
  const draw = tweener((f) => {
    const y = RUNGS.map(([k]) => Y(f[k]));
    line.setAttribute('d', y.map((yy, i) => `${i ? 'L' : 'M'}${X(i)} ${yy.toFixed(1)}`).join(' '));
    pts.forEach((p, i) => { p.c.setAttribute('cy', y[i].toFixed(1)); p.v.setAttribute('y', (y[i] - 18).toFixed(1)); p.v.textContent = fmt(f[RUNGS[i][0]], 0); });
    bands.forEach((b, i) => {
      const d = f[RUNGS[i][0]] - f[RUNGS[i + 1][0]];
      b.g.setAttribute('opacity', clamp((d - 4) / 3, 0, 1).toFixed(3));
      b.t.textContent = `−${fmt(Math.max(0, d), 0)} mmHg`;
    });
    el.setAttribute('aria-label', 'Pressure ladder: ' + RUNGS.map(([k, a, b]) => `${a} ${b} ${fmt(f[k], 0)}`).join(', ') + ' mmHg');
  });
  return {
    el,
    setBase(b) { base.setAttribute('d', b ? RUNGS.map(([k], i) => `${i ? 'L' : 'M'}${X(i)} ${Y(b[k]).toFixed(1)}`).join(' ') : ''); },
    set(f, { key = [] } = {}) {
      pts.forEach((p, i) => p.g.classList.toggle('key', key.includes(RUNGS[i][0])));
      draw({ pv: f.pv, whvp: f.whvp, fhvp: f.fhvp, ra: f.ra });
    },
  };
}

/** Big number tiles (HVPG, PPG, SAAG, protein), each rated; set() counts to the new values. */
function bigTiles() {
  const el = h('div', { class: 'pz-tiles' });
  let keys = [], parts = [], draw = null;
  function build(ks) {
    keys = ks;
    parts = ks.map((k) => {
      const [label, sub, unit] = TILE[k];
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, unit), r = h('span', { class: 'pzt-r' }), tile = h('div', { class: 'pz-tile' }, h('span', { class: 'pzt-k' }, label), h('span', { class: 'pzt-vu' }, v, u), r, h('span', { class: 'pzt-s' }, sub));
      return { k, tile, v, u, r };
    });
    el.replaceChildren(...parts.map((p) => p.tile));
    draw = tweener((f) => parts.forEach((p) => {
      const [cls, word] = rateOf(p.k, f), none = cls == null && (p.k === 'saag' || p.k === 'tp');
      p.v.textContent = none ? '—' : fmt(f[p.k], 1);
      p.u.hidden = none;
      p.r.textContent = word;
      p.tile.dataset.rate = cls || 'none';
    }));
  }
  return {
    el,
    set(f, ks, key = []) {
      if (ks.join() !== keys.join()) build(ks);
      parts.forEach((p) => p.tile.classList.toggle('key', key.includes(p.k)));
      draw(Object.fromEntries([...ks, 'asc'].map((k) => [k, f[k]])));
    },
  };
}

/** The six levels, portal vein to heart, the liver's three bracketed; mode: 'all' names each level and
 *  its place, a level id marks that one as the block, null shows the levels unmarked (a quiz). */
function rail(mode) {
  const at = SITES.findIndex(([id]) => id === mode);
  return h('div', { class: 'pz-rail' + (mode === 'all' ? ' all' : at >= 0 ? ' one' : ''), role: 'img', 'aria-label': at >= 0 ? `Block: ${SITES[at][1].replace('­', '')}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac' },
    h('div', { class: 'pz-rail-liver' }, h('span', {}, 'Liver')),
    h('ol', {}, SITES.map(([id, name, place], i) => h('li', { 'data-site': id, class: i === at ? 'on' : null },
      h('i', {}, i === at ? h('b') : null), h('span', { class: 'n' }, name), mode === 'all' ? h('span', { class: 'p' }, place) : null))));
}

// ── The off-screen engine ──────────────────────────
// A second engine in its own worker (the main thread when workers are unavailable) computes the slides'
// states, so the live figure keeps running while a presentation is prepared.
function makeCalc() {
  const pending = new Map();
  let seq = 1, post = null, kill = () => {};
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    try {
      const w = new Worker(new URL('../worker.js?v=ad55e7dd07', import.meta.url), { type: 'module' });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('worker timeout')), 6000);
        w.onmessage = (e) => { if (e.data?.type === 'presets') { clearTimeout(t); res(); } };
        w.onerror = (e) => { clearTimeout(t); rej(e); };
        w.postMessage({ type: 'visibility', visible: false });
        w.postMessage({ type: 'run', running: false });
        w.postMessage({ type: 'presets', reqId: 0 });
      });
      w.onmessage = (e) => onMsg(e.data); w.onerror = null;
      post = (m) => w.postMessage(m); kill = () => w.terminate();
    } catch {
      const { createCore } = await import('../worker-core.js?v=90da6c31b1');
      const core = createCore((m) => setTimeout(() => onMsg(m), 0));
      core.handle({ type: 'visibility', visible: false }); core.handle({ type: 'run', running: false });
      post = (m) => core.handle(structuredClone(m)); kill = () => core.dispose();
    }
  })();
  const send = async (msg, entry) => { await ready; pending.set(msg.reqId, entry); post(msg); };
  return {
    request: (type, payload = {}) => new Promise((done) => send({ type, reqId: seq++, ...payload }, { done })),
    sequence: (steps, base, step) => new Promise((done) => send({ type: 'sequence', reqId: seq++, steps, base }, { done, step })),
    kill: () => kill(),
  };
}

export function createPresenter({ startCase, cases = [], host, stage, projectorOn, projectorOff, closeHome, rerenderHome }) {
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → computed states, reused the next time it is presented
  let deck = null, slides = [], states = [], waiters = [], stateOf = [], base = null;
  // `gen` counts redraws asked of the slide in place (quiz on or off): a transition under way for an older one starts over.
  let want = 0, wantRev = false, shown = null, shownState = -1, busy = false, quiz = false, gen = 0;
  let ui = null, notesOpen = false, laser = null, black = false, speakerWin = null, speakerT = 0, startedAt = 0, digits = '', digitT = 0;
  let saved = null;

  const all = () => [...DECKS, ...readMine().map(fromScript)];
  // An instructor's script (captured model states) as slides: its own titles and notes, the ladder beside.
  function fromScript(s) {
    return { ...s, level: 'yours', mine: true, slides: (s.steps || []).map((st) => ({
      preset: st.preset, presetDays: st.presetDays, params: st.params, action: st.action, days: st.days, view: st.view, cam: st.view === 'circuit' ? 'fit' : st.cam || 'fit',
      kicker: st.kicker || s.title, title: st.title || 'Step', line: st.line || '', causes: st.causes, site: st.site, notes: st.notes || st.tell || '', ask: st.ask, data: 'ladder', key: st.key || [],
    })) };
  }

  // ── Slide states ──
  // stateOf[i]: the slide whose model state slide i shows (itself, or the last one before it that changed the model).
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
  function prepare() {
    const key = deck.mine ? null : deck.id;
    stateOf = []; let last = 0;
    slides.forEach((s, i) => { if (changes(s) || i === 0) last = i; stateOf[i] = last; });
    const hit = key && cache.get(key);
    if (hit) { states = hit.states; waiters = []; return; }
    const mine = []; states = mine; waiters = [];
    const c = getCalc(), steps = slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days } : {}));
    const presetAt = []; let pid = store.get().presetId;
    slides.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    const deckNow = deck;
    (async () => {
      const first = slides[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; if (deck === deckNow) ui?.ladder.setBase(base); });
      await c.sequence(steps, first, (m) => {
        const st = { snap: m.snap, params: m.params, fp: m.fp, presetId: presetAt[m.i] };
        mine[m.i] = st;
        if (states !== mine) return;   // a newer presentation has started
        for (const w of waiters.filter((x) => x.i === m.i)) w.res(st);
        waiters = waiters.filter((x) => x.i !== m.i);
      });
      if (key) cache.set(key, { states: mine });
    })();
  }
  const stateReady = (i) => (states[i] ? Promise.resolve(states[i]) : new Promise((res) => waiters.push({ i, res })));

  function applyState(st) {
    host.send({ type: 'restore', snap: st.snap });
    replaceParams(structuredClone(st.params));
    store.set({ presetId: st.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  }
  // The live engine has sent a frame of the new state (its portal pressure is the slide's), and two more frames have painted it.
  let frames = 0;
  store.on('frame', () => { frames++; });
  async function drawn(st) {
    const n0 = frames;
    await until(() => frames > n0 && Math.abs((store.get().frame?.metrics?.pv ?? -99) - st.fp.pv) < 0.6, 900);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // ── The figure's moves ──
  const fadeMs = () => (reduce.matches ? 0 : 340);
  async function figureOut() { view.classList.add('pz-out'); await wait(fadeMs()); }
  function figureIn() { view.classList.remove('pz-out'); }
  async function toAnatomy() {
    if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(reduce.matches ? 300 : 1000); }
    if (store.get().lobule) { store.set({ lobule: false }); await until(() => stage.lobuleSettled(), 2600); await wait(80); }
  }
  // Glide the camera to a slide's framing; resolves when it has landed (cut(): a newer slide was asked for).
  async function camera(cam, s, cut) {
    const ms = reduce.matches ? 0 : 1500;
    if (LOBULE_CAM.test(cam)) {
      if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(700); }
      if (!store.get().lobule) {
        // Whole figure → the liver → into it: the dive starts from the liver, filling the screen.
        stage.frameBox(REGIONS.liver, ms ? 1100 : 0, 2.4);
        await wait(ms ? 1150 : 0);
        if (cut()) return;
        store.set({ lobule: true });
        await until(() => stage.lobuleSettled() && stage.lobuleOpen(), 4000);
        if (cut()) return;
        await wait(120);
      }
      const sin = cam === 'sinusoid' && sinusoidSupported() && stage.lobuleOpen();
      if (sin) { if (!store.get().sinusoid) { store.set({ sinusoid: true }); await wait(ms ? 1250 : 0); } return; }
      if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(ms ? 1000 : 0); }
      stage.lobuleFocus(cam === 'sinusoid' ? 'sinusoid' : cam.split(':')[1] || 'fit', { zoom: s.zoom ?? 2.3, ms });
      await wait(ms);
      return;
    }
    await toAnatomy();
    if (cut()) return;
    const v = s.view || 'anatomic';
    if (store.get().view !== v) { store.set({ view: v }); await wait(700); }
    if (cam === 'fit' || v === 'circuit') stage.fitSlow(ms);
    else stage.frameBox(Array.isArray(cam) ? cam : REGIONS[cam] || REGIONS.route, ms, s.kMax || 3.2);
    await wait(ms);
  }

  // ── Slides ──
  const asking = (s, rev) => quiz && !!s.quiz && !rev;
  function go(i, rev = false) {
    if (!deck) return;
    want = clamp(i, 0, slides.length - 1); wantRev = rev;
    paintChrome();
    if (!busy) run();
  }
  const next = () => { const s = slides[want]; if (asking(s, wantRev)) go(want, true); else if (want < slides.length - 1) go(want + 1); };
  const prev = () => { if (want > 0) go(want - 1); };
  async function run() {
    busy = true;
    try {
      while (deck && (!shown || shown.i !== want || shown.rev !== wantRev || shown.gen !== gen)) await transition(want, wantRev);
    } finally { busy = false; }
  }
  async function transition(to, rev) {
    const g = gen, s = slides[to], cut = () => !deck || want !== to || wantRev !== rev || gen !== g;
    const q = asking(s, rev), cam = s.visual ? s.cam || null : q ? 'fit' : s.cam || 'fit';
    // Words out, and the marks: they belong to the slide that is leaving.
    store.set({ focus: null, presentLabels: [] });
    await wordsOut();
    if (cut()) return;
    // Out of the lobule while the old patient is still there, so the rise reads as leaving the liver.
    if (cam && !LOBULE_CAM.test(cam) && (store.get().lobule || store.get().sinusoid)) { await toAnatomy(); if (cut()) return; }
    const si = stateOf[to], st = await stateReady(si);
    if (!st || cut()) return;
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = si !== shownState;
    if (swap) {
      if (shownState >= 0) await figureOut();
      applyState(st); shownState = si;
      await drawn(st);
      if (!deck) return;
    }
    wordsIn(s, q, st);
    if (swap) figureIn();
    if (cut()) return;
    if (cam) await camera(cam, s, cut);
    if (cut()) return;
    if (!s.visual) store.set({ presentLabels: q ? [] : s.labels || [], focus: !q && s.mark ? { edges: [...s.mark.edges], label: s.mark.label } : null });
    shown = { i: to, rev, gen: g };
    paintChrome();
  }

  // ── The slide's words, data and visual ──
  async function wordsOut() {
    if (!ui) return;
    const out = [ui.text, ui.panel];
    if (out.every((el) => el.hidden || !el.childElementCount)) return;
    for (const el of out) el.classList.add('pz-leave');
    await wait(reduce.matches ? 0 : 220);
  }
  function wordsIn(s, q, st) {
    if (!ui) return;
    const { text, panel, data } = ui;
    text.classList.remove('pz-leave'); panel.classList.remove('pz-leave');
    const kick = (site, words) => h('div', { class: 'pz-kick', 'data-site': site || 'none' }, h('i'), words);
    if (s.visual) {
      text.hidden = true; text.replaceChildren();
      panel.hidden = false;
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.replaceChildren(h('div', { class: 'pz-ph' }, kick(null, s.kicker), h('h1', { class: 'pz-h' }, s.title), s.line ? h('p', { class: 'pz-line' }, s.line) : null),
        s.visual === 'table' ? summaryTable(s) : laddersGrid(s));
      ui.veil.classList.add('on');
    } else {
      panel.hidden = true; panel.replaceChildren(); ui.veil.classList.remove('on');
      text.hidden = false;
      text.replaceChildren(...(q
        ? [kick(null, 'Quiz'), h('h1', { class: 'pz-h' }, s.quiz), s.rail ? rail(null) : null, h('p', { class: 'pz-line pz-hint' }, 'Read the ladder, take answers from the room, then press → to reveal.')]
        : [kick(s.site, s.kicker), h('h1', { class: 'pz-h' }, s.title), s.line ? h('p', { class: 'pz-line' }, s.line) : null,
          s.rail ? rail(s.rail === 'all' ? 'all' : s.site) : null,
          s.causes?.length ? h('div', { class: 'pz-causes' }, h('span', { class: 'pz-sub' }, 'Causes'), h('ul', {}, s.causes.map((c) => h('li', {}, c)))) : null]));
      [...text.children].forEach((c, i) => c.style.setProperty('--i', i));
      text.classList.remove('pz-enter'); void text.offsetWidth; text.classList.add('pz-enter');
    }
    const showData = s.data === 'ladder' && !s.visual;
    if (showData) {
      ui.ladder.set(st.fp, { key: q ? [] : s.key || [] });
      ui.tiles.set(st.fp, s.tiles || ['hvpg', 'ppg'], q ? [] : s.key || []);
      if (data.hidden) { data.hidden = false; data.classList.add('pz-hide'); void data.offsetWidth; }
      data.classList.remove('pz-hide');
    } else if (!data.hidden) {
      data.classList.add('pz-hide');
      setTimeout(() => { if (data.classList.contains('pz-hide')) data.hidden = true; }, reduce.matches ? 0 : 320);
    }
    layout();
    writeNotes(); paintSpeaker();
  }
  const fpOf = (id) => { const i = slides.findIndex((x) => x.id === id); return i >= 0 ? states[stateOf[i]]?.fp : null; };
  function laddersGrid(s) {
    const grid = h('div', { class: 'pz-grid' });
    for (const id of s.of || []) {
      const sl = slides.find((x) => x.id === id), f = fpOf(id);
      if (!sl || !f) continue;
      const L = bigLadder(); L.setBase(base); L.set(f, {});
      grid.append(h('div', { class: 'pz-cell' },
        h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': sl.site || 'none' }, h('i'), sl.kicker.replace('Intrahepatic · ', '')),
          h('span', {}, 'HVPG ', h('b', { 'data-rate': rateOf('hvpg', f)[0] }, fmt(f.hvpg, 1)))),
        h('div', { class: 'pz-cell-t' }, sl.title), L.el));
    }
    return grid;
  }
  function summaryTable(s) {
    const cols = [['pv', 'Portal'], ['whvp', 'Wedged'], ['fhvp', 'Free HV'], ['ra', 'RA'], ['hvpg', 'HVPG'], ['ppg', 'PPG']];
    const hi = { pv: (v) => v > 10, whvp: (v) => v > 10, fhvp: (v) => v > 8, ra: (v) => v > 8, hvpg: (v) => v >= 10 ? 'hi' : v >= 5 ? 'mid' : false, ppg: (v) => v >= 12 ? 'hi' : v >= 6 ? 'mid' : false };
    const rows = (s.of || []).map((id) => [slides.find((x) => x.id === id), fpOf(id), slides.findIndex((x) => x.id === id)]).filter(([sl]) => sl);
    return h('div', { class: 'pz-table' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Level'), cols.map(([, t]) => h('th', { class: 'num' }, t)), h('th', {}, 'Ascites: SAAG, protein'))),
      h('tbody', {}, rows.map(([sl, f, i]) => h('tr', { onclick: () => go(i) },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': sl.site || 'none' }, h('i'), sl.kicker.replace('Intrahepatic · ', '')), h('span', { class: 'tn' }, sl.title)),
        cols.map(([k]) => { const r = f ? hi[k](f[k]) : false; return h('td', { class: 'num', 'data-rate': r === true ? 'hi' : r || null }, f ? fmt(f[k], 0) : '…'); }),
        h('td', { class: 'asc' }, !f ? '…' : f.asc < NO_ASC ? h('span', { class: 'none' }, 'None') : [h('b', { 'data-rate': f.saag >= 1.1 ? 'hi' : null }, fmt(f.saag, 1)), ' · ', h('b', {}, fmt(f.tp, 1)), h('small', {}, f.tp >= 2.5 ? ' high protein' : ' low protein')]))))),
    h('p', { class: 'pz-foot' }, 'mmHg and g/dL, from the model. Shaded: above normal. Pick a row to go back to it.'));
  }

  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  const phone = () => innerWidth < 768 || innerWidth < innerHeight * 0.95;
  function layout() {
    if (!ui) return;
    const p = phone(), W = wrap.clientWidth, H = wrap.clientHeight, wr = wrap.getBoundingClientRect();
    ui.root.classList.toggle('stack', p); ui.shade.classList.toggle('stack', p);
    const off = (el) => el.hidden || el.classList.contains('pz-hide');
    if (off(ui.data)) delete ui.data.dataset.safe; else ui.data.dataset.safe = p ? 'bottom' : 'right';
    const r = (el) => (off(el) ? null : el.getBoundingClientRect());
    const t = r(ui.text), d = r(ui.data);
    // The words get a soft backdrop of the page colour, so a zoomed figure behind them never runs through the
    // text; it fades out over 130 px (48 on a phone), and the figure frames itself from most of the way across.
    const L = t ? t.right - wr.left : 0, T = t ? t.bottom - wr.top : 0;
    ui.shade.style.width = !p && t ? `${L + 140}px` : '';
    ui.shade.style.height = p && t ? `${T + 48}px` : '';
    ui.shade.style.opacity = t ? '1' : '0';
    ui.safe.hidden = !t;
    ui.safe.dataset.safe = p ? 'top' : 'left';
    ui.safe.style.width = p ? '' : `${L + 90}px`;
    ui.safe.style.height = p ? `${T + 20}px` : '';
    const set = (k, v) => app.style.setProperty(k, `${Math.max(0, Math.round(v))}px`);
    set('--pz-l', !p && t ? L + 90 : 0);
    set('--pz-r', !p && d ? W - (d.left - wr.left) + 8 : 0);
    set('--pz-t', p && t ? T + 20 : 0);
    set('--pz-b', p && d ? H - (d.top - wr.top) + 4 : 0);
    dispatchEvent(new Event('pps:occ'));
  }
  const onResize = () => { if (!ui) return; layout(); setLabels(); if (shown) { const s = slides[shown.i]; const cam = s.visual ? s.cam : asking(s, shown.rev) ? 'fit' : s.cam || 'fit'; if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) { if (cam === 'fit') stage.fitSlow(400); else stage.frameBox(Array.isArray(cam) ? cam : REGIONS[cam] || REGIONS.route, 400, s.kMax || 3.2); } } };
  // Projector-size labels on the figure, for the screen it is on (2 at 1080 lines).
  function setLabels() {
    const k = phone() ? 1.15 : clamp(Math.min(innerHeight / 540, innerWidth / 960), 1.25, 2.4);
    stage.setProjection(k);
    document.documentElement.style.setProperty('--label-k', String(Math.min(k, 2.2)));
    dispatchEvent(new Event('pps:labelscale'));
  }

  // ── Chrome: counter, progress, controls ──
  function paintChrome() {
    if (!ui) return;
    const n = slides.length, i = want;
    ui.count.textContent = `${i + 1} / ${n}`;
    ui.prog.style.setProperty('--p', String((i + 1) / n));
    ui.bar.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0, onclick: prev }, icon('chev-left')),
      h('span', { class: 'pzb-n' }, `${i + 1} / ${n}`),
      h('button', { class: 'ib', 'aria-label': 'Next slide', title: 'Next (→)', disabled: i === n - 1 && !asking(slides[i], wantRev), onclick: next }, icon('chev-right')),
      h('span', { class: 'pzb-sep' }),
      deck.slides.some((s) => s.quiz) ? h('button', { class: 'btn sm', 'aria-pressed': String(quiz), title: 'Quiz the room: ask first, reveal on the next click (Q)', onclick: toggleQuiz }, 'Quiz') : null,
      h('button', { class: 'btn sm', 'aria-pressed': String(notesOpen), title: 'Speaker notes (N)', onclick: () => toggleNotes() }, 'Notes'),
      h('button', { class: 'btn sm', title: 'Speaker window: notes, next slide, timer (S)', onclick: speaker }, 'Speaker'),
      h('button', { class: 'btn sm', 'aria-pressed': String(!!laser), title: 'Laser pointer (L)', onclick: toggleLaser }, 'Laser'),
      h('button', { class: 'ib', 'aria-label': 'Black screen', title: 'Black screen (B)', onclick: () => toggleBlack() }, icon('pause')),
      document.fullscreenEnabled ? h('button', { class: 'ib', 'aria-label': 'Full screen', title: 'Full screen (F)', onclick: fullscreen }, icon('fit')) : null,
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop (Esc)', onclick: stop }, icon('close')));
    writeNotes(); paintSpeaker();
  }
  let idleT = 0;
  function wake() {
    if (!ui) return;
    ui.bar.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (ui && !ui.bar.matches(':hover, :focus-within')) ui.bar.classList.add('idle'); else wake(); }, 2600);
  }
  function toggleQuiz() {
    quiz = !quiz;
    toast(quiz ? 'Quiz: each level opens as a question; the next click reveals it.' : 'Quiz off.');
    gen++; shown = null; go(want, false);
  }
  function toggleBlack(on = !black) { black = on; ui?.black.classList.toggle('on', black); }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  function toggleLaser() {
    if (laser) { laser.remove(); laser = null; document.body.classList.remove('laser-on'); paintChrome(); return; }
    laser = h('div', { class: 'laser', 'aria-hidden': 'true' });
    document.body.append(laser); document.body.classList.add('laser-on'); paintChrome();
  }
  addEventListener('pointermove', (e) => { if (laser) laser.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; if (deck) wake(); });
  addEventListener('pointerdown', () => { if (deck) wake(); });

  // ── Speaker notes: a drawer (N), or a second window for the presenter's screen (S) ──
  const noteOf = (s) => ({ notes: s?.notes || '', ask: s?.ask });
  function toggleNotes(force) { notesOpen = force ?? !notesOpen; writeNotes(); paintChrome(); }
  function writeNotes() {
    if (!ui) return;
    ui.notes.hidden = !notesOpen;
    if (!notesOpen) return;
    const s = slides[want], nx = slides[want + 1], { notes, ask } = noteOf(s);
    ui.notes.replaceChildren(
      h('div', { class: 'pn-top' }, h('span', { class: 'pn-k' }, `Speaker notes · ${want + 1} / ${slides.length}`), h('button', { class: 'ib', 'aria-label': 'Close notes', onclick: () => toggleNotes(false) }, icon('close'))),
      h('h2', {}, s.title), h('p', {}, notes || 'No notes for this slide.'),
      ask ? h('div', { class: 'pn-ask' }, h('b', {}, 'Ask the room'), h('p', {}, ask[0]), ask[1] ? h('p', { class: 'pn-a' }, 'Expected: ' + ask[1]) : null) : null,
      nx ? h('p', { class: 'pn-next' }, `Next: ${nx.title}`) : null);
  }
  function speaker() {
    if (speakerWin && !speakerWin.closed) { speakerWin.focus(); return; }
    speakerWin = open('', 'pps-speaker', 'popup,width=980,height=720');
    if (!speakerWin) { toast('Allow pop-ups for this site to open the speaker window.'); return; }
    const d = speakerWin.document;
    d.title = 'Speaker · ' + deck.title;
    d.head.innerHTML = `<meta name="viewport" content="width=device-width"><style>
      body{margin:0;font:18px/1.5 Inter,system-ui,sans-serif;background:#10141c;color:#e9edf6}
      header{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid #263047}
      header b{font-size:30px;font-variant-numeric:tabular-nums}header span{color:#a9b2c7}
      header button{font:inherit;font-size:16px;padding:8px 16px;border-radius:10px;border:1px solid #33405f;background:#1b2438;color:#e9edf6;cursor:pointer}
      .sp{flex:1}main{display:grid;grid-template-columns:2fr 1fr;gap:28px;padding:22px}
      h1{font:600 34px/1.15 Georgia,serif;margin:4px 0 14px}.k{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#8f99b3}
      .ask{margin-top:18px;padding:12px 16px;border-left:4px solid #7c9bff;background:#1b2438;border-radius:8px}.ask p{margin:4px 0}.a{color:#a9b2c7}
      .nx{color:#a9b2c7}.nx h2{font:600 22px/1.25 Georgia,serif;color:#e9edf6;margin:6px 0}</style>`;
    d.body.innerHTML = '<header><b id="t">0:00</b><span id="n"></span><span class="sp"></span><button id="p">◀ Back</button><button id="x">Next ▶</button></header><main><section id="c"></section><aside class="nx" id="nx"></aside></main>';
    d.getElementById('p').onclick = prev; d.getElementById('x').onclick = next;
    speakerWin.addEventListener('keydown', onKey, true);
    clearInterval(speakerT); speakerT = setInterval(paintSpeakerClock, 1000);
    paintSpeaker();
  }
  function paintSpeakerClock() {
    if (!speakerWin || speakerWin.closed) { clearInterval(speakerT); return; }
    const s = Math.floor((performance.now() - startedAt) / 1000);
    speakerWin.document.getElementById('t').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function paintSpeaker() {
    if (!speakerWin || speakerWin.closed || !deck) return;
    const d = speakerWin.document, s = slides[want], nx = slides[want + 1], { notes, ask } = noteOf(s);
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    d.getElementById('n').textContent = `Slide ${want + 1} of ${slides.length}${asking(s, wantRev) ? ' · quiz question showing' : ''}`;
    d.getElementById('c').innerHTML = `<div class="k">${esc(s.kicker)}</div><h1>${esc(s.title)}</h1><p>${esc(notes || 'No notes for this slide.')}</p>${ask ? `<div class="ask"><b>Ask the room</b><p>${esc(ask[0])}</p><p class="a">Expected: ${esc(ask[1])}</p></div>` : ''}`;
    d.getElementById('nx').innerHTML = nx ? `<div class="k">Next</div><h2>${esc(nx.title)}</h2><p>${esc(nx.line || '')}</p>` : '<div class="k">Last slide</div>';
    paintSpeakerClock();
  }

  // ── Keys ──
  function onKey(e) {
    if (!deck || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    if (/^[0-9]$/.test(k)) { digits = (digits + k).slice(-3); clearTimeout(digitT); digitT = setTimeout(() => { digits = ''; }, 2500); toast(`Slide ${digits}: press Enter`); }
    else if (k === 'Enter' && digits) { const n = +digits; digits = ''; if (n >= 1) go(n - 1); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { if (!e.repeat) next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') { if (!e.repeat) prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (lk === 'b' || k === '.' || lk === 'w') toggleBlack();
    else if (lk === 'f') fullscreen();
    else if (lk === 'n') toggleNotes();
    else if (lk === 's') speaker();
    else if (lk === 'q') toggleQuiz();
    else if (lk === 'l') toggleLaser();
    else if (k === 'F5') { /* a clicker's "start show": never reload the page */ }
    else if (k === 'Escape') { if (black) toggleBlack(false); else if (notesOpen) toggleNotes(false); else stop(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  addEventListener('keydown', onKey, true);

  // ── Start and stop ──
  function build() {
    const ladder = bigLadder(), tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker', 'aria-live': 'polite' });
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', hidden: true, 'aria-label': 'Pressures' },
      h('div', { class: 'pz-dh' }, h('span', {}, 'Pressure, portal vein to heart'), h('span', { class: 'pz-lg' }, h('i', { class: 'now' }), 'This patient', h('i', { class: 'base' }), 'Healthy')),
      ladder.el, tiles.el);
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true, 'aria-live': 'polite' });
    const count = h('div', { class: 'pz-count stage-blocker', 'aria-hidden': 'true' }), prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const notes = h('aside', { class: 'pz-notes stage-blocker', 'aria-label': 'Speaker notes', hidden: true });
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    const shade = h('div', { class: 'pz-shade' });
    // What the figure frames itself clear of: the words and most of the shade's fade.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    const root = h('div', { class: 'pz' }, safe, veil, text, data, panel, count, prog, notes, bar, blackEl);
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    wrap.append(root);
    return { root, shade, safe, text, data, ladder, tiles, veil, panel, count, prog, bar, notes, black: blackEl };
  }
  async function start(id, at = 0) {
    const want0 = Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (ALIAS[id] || id));
    if (!d?.slides?.length) { toast('That presentation could not be found.'); return; }
    if (deck) stop();
    deck = d; slides = d.slides; shown = null; shownState = -1; quiz = false; notesOpen = false; black = false;
    closeHome?.();
    const st0 = store.get();
    saved = { colorMode: st0.colorMode, labelK: stage.labelScale() };
    store.set({ presenting: true, selection: null, details: null, compareSnap: null, colorMode: 'pressure', presentLabels: [], focus: null, ...(st0.mode !== 'explore' ? { mode: 'explore' } : {}) });
    if (st0.view !== 'anatomic' && !st0.lobule) store.set({ view: 'anatomic' });
    projectorOn();
    app.classList.add('presenting');
    ui = build();
    if (base) ui.ladder.setBase(base);
    setLabels();
    startedAt = performance.now();
    prepare();
    addEventListener('resize', onResize);
    go(Math.min(want0, slides.length - 1));
    wake();
  }
  function stop() {
    if (!deck) return;
    deck = null; shown = null; want = 0;
    for (const w of waiters) w.res(null);
    waiters = [];
    removeEventListener('resize', onResize);
    store.set({ presenting: false, presentLabels: null, focus: null, ...(saved ? { colorMode: saved.colorMode } : {}) });
    clearTimeout(idleT);
    ui?.root.remove(); ui?.shade.remove(); ui = null;
    view.classList.remove('pz-out');
    for (const k of ['--pz-l', '--pz-r', '--pz-t', '--pz-b']) app.style.removeProperty(k);
    stage.setProjection(false);
    document.documentElement.style.setProperty('--label-k', String(saved?.labelK ?? stage.labelScale()));
    dispatchEvent(new Event('pps:labelscale'));
    if (laser) toggleLaser();
    if (speakerWin && !speakerWin.closed) speakerWin.close();
    speakerWin = null; clearInterval(speakerT);
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.classList.remove('presenting');
    projectorOff();
    dispatchEvent(new Event('pps:occ'));
  }

  // ── Library (Home › Present) ──
  function captureStep() {
    const st = store.get();
    return { title: st.presetList?.find((p) => p.id === st.presetId)?.label || 'Step', preset: st.presetId, params: structuredClone(st.params), view: st.view, notes: '' };
  }
  function newScript() {
    const title = prompt('Name the new script', 'My script');
    if (!title) return;
    const list = readMine();
    list.push({ id: 'my-' + Date.now().toString(36), title, summary: 'Built from the live model.', steps: [captureStep()] });
    writeMine(list); rerenderHome?.();
    toast('Script created with the current model as its first slide. Change the model and use “Add current state” to add more.');
  }
  function addStep(id) {
    const list = readMine(), s = list.find((x) => x.id === id);
    if (!s) return;
    const step = captureStep();
    step.title = prompt('Title for this slide', step.title) || step.title;
    step.notes = prompt('Speaker notes (optional)', '') || '';
    s.steps.push(step); writeMine(list); rerenderHome?.();
  }
  function remove(id) { if (!confirm('Delete this script?')) return; writeMine(readMine().filter((x) => x.id !== id)); rerenderHome?.(); }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify(s, null, 2), 'application/json'); }
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg), () => prompt('Copy this link', url)) ?? prompt('Copy this link', url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  const shareDeck = (d) => copy(`${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      try { addToLibrary(JSON.parse(await inp.files[0].text())); } catch { toast('That file is not a presenter script.'); }
    });
    inp.click();
  }
  function addToLibrary(s) {
    if (!s?.title || !Array.isArray(s.steps)) throw new Error('bad script');
    const list = readMine();
    list.push({ ...s, id: 'my-' + Date.now().toString(36), builtin: undefined });
    writeMine(list); rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
  }
  /** A shared link (#script=…) adds its script to this device's library. */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    try { addToLibrary(dec(m[1])); } catch { toast('The shared script could not be read.'); }
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  function home() {
    const mine = readMine();
    const deckCard = (d) => h('article', { class: 'pz-deck', 'data-level': d.level },
      h('div', { class: 'pzd-top' }, h('span', { class: 'pzd-lvl' }, LEVELS[d.level] || ''), h('span', { class: 'pzd-meta' }, `${d.slides.length} slides · about ${d.minutes} min`)),
      h('h3', {}, d.title), h('p', { class: 'pzd-sum' }, d.summary),
      h('ol', { class: 'pzd-list' }, d.slides.map((s, i) => h('li', {}, h('button', { type: 'button', title: `Start at slide ${i + 1}`, onclick: () => start(d.id, i) }, s.title)))),
      h('div', { class: 'script-acts' },
        h('button', { class: 'btn primary', onclick: () => start(d.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        h('button', { class: 'btn ghost sm', onclick: () => shareDeck(d) }, 'Copy link')));
    const scriptCard = (s) => h('div', { class: 'home-item script' },
      h('span', { class: 'meta' }, `${s.steps.length} slides · Yours`), h('span', { class: 't' }, s.title), h('span', { class: 'd' }, s.summary || ''),
      h('span', { class: 'script-acts' },
        h('button', { class: 'btn sm primary', onclick: () => start(s.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        h('button', { class: 'btn sm', onclick: () => addStep(s.id) }, 'Add current state'),
        h('button', { class: 'btn sm ghost', onclick: () => shareScript(s) }, 'Share link'),
        h('button', { class: 'btn sm ghost', onclick: () => exportScript(s) }, 'Export'),
        h('button', { class: 'btn sm ghost', onclick: () => remove(s.id) }, 'Delete')));
    return h('div', { class: 'pz-lib' },
      h('p', { class: 'ctl-sub lib-note' }, 'Presentations on the live model for a lecture hall: big words, the figure doing the explaining, speaker notes and a question for the room on every slide.'),
      h('div', { class: 'pz-decks' }, DECKS.map(deckCard)),
      h('h3', { class: 'home-sub' }, 'Your scripts'),
      mine.length ? h('div', { class: 'home-grid' }, mine.map(scriptCard)) : h('p', { class: 'ctl-sub' }, 'A script is a list of model states you capture yourself, presented the same way.'),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', onclick: newScript }, 'New script from the current model'),
        h('button', { class: 'btn', onclick: importFile }, 'Import a script')),
      cases.length ? h('h3', { class: 'home-sub' }, 'Present a case') : null,
      cases.length ? h('div', { class: 'home-grid' }, cases.map((c) => h('div', { class: 'home-item script' },
        h('span', { class: 'meta' }, 'Case · for the room'), h('span', { class: 't' }, c.title), h('span', { class: 'd' }, c.blurb || c.summary || ''),
        h('span', { class: 'script-acts' }, h('button', { class: 'btn sm primary', onclick: () => presentCase(c.id) }, svgIcon('projector', 'mi-ic'), 'Present'))))) : null,
      h('p', { class: 'ctl-sub' }, 'While presenting: → or Page Down next, ← back, a number then Enter jumps, B black screen, F full screen, N notes, S a speaker window for a second screen, Q quiz, L laser, Esc stops. Clickers work.'));
  }

  // Present a case: any case full screen for a class. Projector-size labels on the figure; the slim bar reminds the presenter to take a show of hands before committing.
  let classBar = null;
  function presentCase(id) {
    closeHome?.();
    startCase(id);
    stage.setProjection(innerWidth >= 768);   // projector-size labels; the case panel stays open
    app.classList.add('class-case');
    classBar?.remove();
    classBar = h('div', { class: 'class-bar stage-blocker', role: 'status' },
      h('span', { class: 'cb-k' }, 'Presenting'),
      h('span', {}, 'Read each choice aloud, take a show of hands, then commit for the room.'),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting the case', title: 'Stop (Esc)', onclick: endCase }, icon('close')));
    view.append(classBar);
  }
  function endCase() {
    if (!classBar) return;
    classBar.remove(); classBar = null;
    app.classList.remove('class-case');
    stage.setProjection(false);
  }
  addEventListener('keydown', (e) => { if (classBar && e.key === 'Escape' && !deck) endCase(); });

  return { start, stop, home, readLink, presentCase, active: () => !!deck };
}
